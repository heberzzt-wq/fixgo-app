/**
 * ======================================================================================
 * B2C TIME AUTHORITY 2026
 * Archivo: b2c-time-authority.js
 * Rol: Reloj autoritativo, zona horaria por servicio y sellos temporales auditables.
 *
 * PRINCIPIOS:
 * - La prueba principal siempre es UTC del servidor.
 * - La zona horaria IANA solo representa el instante para humanos.
 * - Los contadores no deben depender del reloj libre del teléfono.
 * - Se mide desfase y latencia con Firestore; HTTP Date funciona como respaldo.
 * - performance.now() mantiene el avance aunque el usuario cambie la hora del dispositivo.
 * ======================================================================================
 */

import {
    db,
    doc,
    setDoc,
    serverTimestamp
} from "./firebase.js";

import {
    getDocFromServer
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const B2C_TIME_AUTHORITY_VERSION = "1.0.1";

const MAX_CACHE_AGE_MS = 5 * 60 * 1000;
const DEFAULT_LOCALE = "es-MX";
const DEFAULT_TIMEZONE = "UTC";
const clockCache = new Map();

const CITY_TIMEZONES = Object.freeze([
    {
        timezone: "America/Cancun",
        aliases: [
            "cancun", "benito juarez", "playa del carmen", "solidaridad",
            "tulum", "chetumal", "othon p blanco", "othon p. blanco",
            "cozumel", "isla mujeres", "puerto morelos", "bacalar",
            "felipe carrillo puerto", "jose maria morelos", "quintana roo"
        ]
    },
    {
        timezone: "America/Merida",
        aliases: [
            "merida", "progreso", "valladolid", "tizimin", "izamal",
            "tekax", "motul", "umán", "uman", "yucatan", "yucatán",
            "campeche", "san francisco de campeche", "ciudad del carmen",
            "champoton", "champotón", "calakmul"
        ]
    }
]);

function textoSeguro(value, maxLength = 240) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function normalizarTexto(value) {
    return textoSeguro(value, 1000)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function idSeguro(value, fallback = "anonymous") {
    return textoSeguro(value, 128)
        .replace(/[^a-zA-Z0-9_-]/g, "_") || fallback;
}

function performanceNow() {
    return globalThis.performance?.now?.() ?? Date.now();
}

function timestampAMilisegundos(value) {
    if (!value) return null;

    if (typeof value.toMillis === "function") {
        const result = value.toMillis();
        return Number.isFinite(result) ? result : null;
    }

    if (Number.isFinite(value.seconds)) {
        return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    }

    if (value instanceof Date) {
        const result = value.getTime();
        return Number.isFinite(result) ? result : null;
    }

    if (Number.isFinite(Number(value))) {
        return Number(value);
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function zonaHorariaValida(timezone) {
    const candidate = textoSeguro(timezone, 80);
    if (!candidate) return false;

    try {
        new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: candidate }).format(new Date());
        return true;
    } catch (error) {
        return false;
    }
}

function zonaDispositivo() {
    const candidate = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zonaHorariaValida(candidate) ? candidate : DEFAULT_TIMEZONE;
}

function textoUbicacionServicio(serviceData = {}) {
    return normalizarTexto([
        serviceData.ciudad,
        serviceData.municipio,
        serviceData.estado,
        serviceData.entidad,
        serviceData.direccion,
        serviceData.direccion_texto,
        serviceData.address,
        serviceData.ubicacion_nombre,
        serviceData.zona_servicio
    ].filter(Boolean).join(" "));
}

/**
 * La resolución prioriza un ID IANA explícito guardado en el servicio.
 * La inferencia por ciudad es de respaldo y queda marcada como tal.
 */
export function resolverZonaHorariaServicio(serviceData = {}, options = {}) {
    const explicitCandidates = [
        serviceData.timezone_id,
        serviceData.timezone,
        serviceData.zona_horaria,
        serviceData.timeZone,
        options.timezone
    ];

    for (const candidate of explicitCandidates) {
        if (zonaHorariaValida(candidate)) {
            return {
                timezone: String(candidate),
                source: "service_explicit",
                confidence: "authoritative_config"
            };
        }
    }

    const locationText = textoUbicacionServicio(serviceData);

    for (const entry of CITY_TIMEZONES) {
        const matchedAlias = entry.aliases.find((alias) => (
            locationText.includes(normalizarTexto(alias))
        ));

        if (matchedAlias) {
            return {
                timezone: entry.timezone,
                source: "city_name_mapping",
                confidence: "high",
                matchedAlias
            };
        }
    }

    const configuredFallback = options.fallbackTimezone;
    if (zonaHorariaValida(configuredFallback)) {
        return {
            timezone: configuredFallback,
            source: "configured_fallback",
            confidence: "medium"
        };
    }

    return {
        timezone: zonaDispositivo(),
        source: "device_display_fallback",
        confidence: "display_only"
    };
}

function qualityFrom({ source, uncertaintyMs }) {
    if (source === "firestore_server_timestamp" && uncertaintyMs <= 1500) {
        return "strong";
    }

    if (uncertaintyMs <= 5000) return "acceptable";
    return "weak";
}

function construirClockSync({
    source,
    serverAtMidpointMs,
    clientMidpointMs,
    roundTripMs,
    uncertaintyMs,
    serviceId,
    actorUid,
    actorRole,
    probeId
}) {
    const offsetMs = serverAtMidpointMs - clientMidpointMs;
    const baselinePerformanceMs = performanceNow();
    const baselineServerMs = Date.now() + offsetMs;

    return Object.freeze({
        version: B2C_TIME_AUTHORITY_VERSION,
        source,
        quality: qualityFrom({ source, uncertaintyMs }),
        serviceId: textoSeguro(serviceId, 128) || null,
        actorUid: textoSeguro(actorUid, 128) || null,
        actorRole: textoSeguro(actorRole, 32) || null,
        probeId: textoSeguro(probeId, 160) || null,
        offsetMs: Math.round(offsetMs),
        roundTripMs: Math.round(roundTripMs),
        uncertaintyMs: Math.ceil(uncertaintyMs),
        baselineServerMs,
        baselinePerformanceMs,
        synchronizedAtClient: new Date().toISOString(),
        expiresAtClientMs: Date.now() + MAX_CACHE_AGE_MS
    });
}

async function sincronizarConFirestore({ serviceId, actorUid, actorRole }) {
    if (!serviceId || !actorUid) {
        throw new Error("FIRESTORE_TIME_SYNC_REQUIRES_SERVICE_AND_ACTOR");
    }

    const safeServiceId = idSeguro(serviceId, "service");
    const safeActorUid = idSeguro(actorUid, "actor");
    const probeId = `time_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const probeRef = doc(
        db,
        "services",
        safeServiceId,
        "time_sync",
        safeActorUid
    );

    const clientStartMs = Date.now();
    const performanceStartMs = performanceNow();

    await setDoc(probeRef, {
        probe_id: probeId,
        actor_uid: textoSeguro(actorUid, 128),
        actor_role: textoSeguro(actorRole, 32),
        requested_at_client: new Date(clientStartMs).toISOString(),
        requested_at_server: serverTimestamp(),
        authority_version: B2C_TIME_AUTHORITY_VERSION
    }, { merge: true });

    const snapshot = await getDocFromServer(probeRef);
    const performanceEndMs = performanceNow();
    const roundTripMs = Math.max(0, performanceEndMs - performanceStartMs);
    const serverMs = timestampAMilisegundos(
        snapshot.data()?.requested_at_server
    );

    if (!serverMs) {
        throw new Error("FIRESTORE_SERVER_TIMESTAMP_UNRESOLVED");
    }

    const clientMidpointMs = clientStartMs + roundTripMs / 2;

    return construirClockSync({
        source: "firestore_server_timestamp",
        serverAtMidpointMs: serverMs,
        clientMidpointMs,
        roundTripMs,
        uncertaintyMs: roundTripMs / 2,
        serviceId,
        actorUid,
        actorRole,
        probeId
    });
}

async function sincronizarConHttpDate({ serviceId, actorUid, actorRole }) {
    if (!globalThis.location || !globalThis.fetch) {
        throw new Error("HTTP_TIME_SYNC_UNAVAILABLE");
    }

    const probeId = `http_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const probeUrl = new URL(globalThis.location.href);
    probeUrl.searchParams.set("__b2c_time_probe", probeId);

    const clientStartMs = Date.now();
    const performanceStartMs = performanceNow();
    const response = await fetch(probeUrl.href, {
        method: "HEAD",
        cache: "no-store",
        credentials: "same-origin"
    });
    const performanceEndMs = performanceNow();
    const roundTripMs = Math.max(0, performanceEndMs - performanceStartMs);
    const dateHeader = response.headers.get("date");
    const serverMs = Date.parse(dateHeader || "");

    if (!Number.isFinite(serverMs)) {
        throw new Error("HTTP_DATE_HEADER_UNAVAILABLE");
    }

    const clientMidpointMs = clientStartMs + roundTripMs / 2;

    return construirClockSync({
        source: "http_date_header",
        serverAtMidpointMs: serverMs,
        clientMidpointMs,
        roundTripMs,
        uncertaintyMs: roundTripMs / 2 + 1000,
        serviceId,
        actorUid,
        actorRole,
        probeId
    });
}

function cacheKey({ serviceId, actorUid }) {
    return `${textoSeguro(serviceId, 128) || "global"}:${textoSeguro(actorUid, 128) || "anonymous"}`;
}

export async function sincronizarRelojServidor({
    serviceId = null,
    actorUid = null,
    actorRole = null,
    force = false
} = {}) {
    const key = cacheKey({ serviceId, actorUid });
    const cached = clockCache.get(key);

    if (!force && cached && cached.expiresAtClientMs > Date.now()) {
        return cached;
    }

    let synchronization = null;
    const errors = [];

    try {
        synchronization = await sincronizarConFirestore({
            serviceId,
            actorUid,
            actorRole
        });
    } catch (error) {
        errors.push(error?.message || String(error));
    }

    if (!synchronization) {
        try {
            synchronization = await sincronizarConHttpDate({
                serviceId,
                actorUid,
                actorRole
            });
        } catch (error) {
            errors.push(error?.message || String(error));
        }
    }

    if (!synchronization) {
        synchronization = construirClockSync({
            source: "device_clock_fallback",
            serverAtMidpointMs: Date.now(),
            clientMidpointMs: Date.now(),
            roundTripMs: 0,
            uncertaintyMs: Number.MAX_SAFE_INTEGER,
            serviceId,
            actorUid,
            actorRole,
            probeId: null
        });

        synchronization = Object.freeze({
            ...synchronization,
            quality: "untrusted_fallback",
            errors
        });
    }

    clockCache.set(key, synchronization);
    return synchronization;
}

export function ahoraServidorMs(clockSync = null) {
    if (!clockSync) return Date.now();

    if (
        Number.isFinite(clockSync.baselineServerMs) &&
        Number.isFinite(clockSync.baselinePerformanceMs)
    ) {
        return clockSync.baselineServerMs + (
            performanceNow() - clockSync.baselinePerformanceMs
        );
    }

    if (Number.isFinite(clockSync.offsetMs)) {
        return Date.now() + clockSync.offsetMs;
    }

    return Date.now();
}

export function crearDeadlineAutoritativo({
    startTimestamp,
    durationMs,
    clockSync = null
} = {}) {
    const startMs = timestampAMilisegundos(startTimestamp);
    const safeDurationMs = Math.max(0, Number(durationMs) || 0);

    if (!startMs) {
        return {
            valid: false,
            reason: "AUTHORITATIVE_START_TIMESTAMP_MISSING",
            remainingMs: null,
            deadlineMs: null
        };
    }

    const deadlineMs = startMs + safeDurationMs;
    const serverNowMs = ahoraServidorMs(clockSync);

    return {
        valid: true,
        startMs,
        deadlineMs,
        serverNowMs,
        remainingMs: Math.max(0, deadlineMs - serverNowMs),
        expired: serverNowMs >= deadlineMs,
        clockSource: clockSync?.source || "device_clock_fallback",
        clockQuality: clockSync?.quality || "untrusted_fallback",
        clockUncertaintyMs: Number.isFinite(clockSync?.uncertaintyMs)
            ? clockSync.uncertaintyMs
            : null
    };
}

export function formatearInstanteServicio(timestamp, serviceData = {}, options = {}) {
    const instantMs = timestampAMilisegundos(timestamp);
    if (!instantMs) return null;

    const zone = resolverZonaHorariaServicio(serviceData, options);
    const formatter = new Intl.DateTimeFormat(
        options.locale || DEFAULT_LOCALE,
        {
            timeZone: zone.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: options.hour12 ?? false,
            timeZoneName: options.timeZoneName || "short"
        }
    );

    return {
        formatted: formatter.format(new Date(instantMs)),
        timezone: zone.timezone,
        timezoneSource: zone.source,
        timezoneConfidence: zone.confidence,
        utcIso: new Date(instantMs).toISOString(),
        epochMs: instantMs
    };
}

export function crearSelloTemporalEvidencia({
    timestamp = null,
    serviceData = {},
    clockSync = null,
    locale = DEFAULT_LOCALE
} = {}) {
    const instantMs = timestampAMilisegundos(timestamp) || ahoraServidorMs(clockSync);
    const formatted = formatearInstanteServicio(
        instantMs,
        serviceData,
        { locale }
    );

    return {
        authorityVersion: B2C_TIME_AUTHORITY_VERSION,
        utcIso: new Date(instantMs).toISOString(),
        epochMs: Math.round(instantMs),
        localDisplay: formatted?.formatted || null,
        timezone: formatted?.timezone || DEFAULT_TIMEZONE,
        timezoneSource: formatted?.timezoneSource || "unknown",
        timezoneConfidence: formatted?.timezoneConfidence || "unknown",
        clockSource: clockSync?.source || "device_clock_fallback",
        clockQuality: clockSync?.quality || "untrusted_fallback",
        clockOffsetMs: Number.isFinite(clockSync?.offsetMs)
            ? clockSync.offsetMs
            : null,
        clockRoundTripMs: Number.isFinite(clockSync?.roundTripMs)
            ? clockSync.roundTripMs
            : null,
        clockUncertaintyMs: Number.isFinite(clockSync?.uncertaintyMs)
            ? clockSync.uncertaintyMs
            : null,
        generatedAtClient: new Date().toISOString()
    };
}

export function limpiarCacheReloj({ serviceId = null, actorUid = null } = {}) {
    if (!serviceId && !actorUid) {
        clockCache.clear();
        return;
    }

    clockCache.delete(cacheKey({ serviceId, actorUid }));
}
