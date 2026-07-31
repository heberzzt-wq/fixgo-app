/**
 * ======================================================================================
 * B2C EVIDENCE ENGINE 2026
 * Archivo: b2c-evidence-engine.js
 * Rol: Evidencia resiliente para llegada, diagnóstico y cierre de servicios B2C.
 *
 * PRINCIPIOS:
 * - No confiar en una sola lectura GPS.
 * - No declarar llegada automáticamente cuando el GPS falla.
 * - No tratar EXIF, nombre de archivo o fecha del dispositivo como prueba suficiente.
 * - Sellar cada evidencia con folio, evento, GPS, precisión, hora cliente y hash SHA-256.
 * - La integración con Firestore DEBE añadir serverTimestamp() al guardar el evento.
 * ======================================================================================
 */

export const B2C_EVIDENCE_ENGINE_VERSION = "1.0.0";

export const DEFAULT_GEO_POLICY = Object.freeze({
    geofenceRadiusM: 100,
    maxAccuracyM: 50,
    maxAcceptedAccuracyM: 150,
    minConsistentReadings: 2,
    consistencyRadiusM: 60,
    collectionTimeoutMs: 15000,
    maximumAgeMs: 0,
    readingFreshnessMs: 20000
});

export const DEFAULT_MEDIA_POLICY = Object.freeze({
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 30 * 1024 * 1024,
    allowedImageTypes: Object.freeze([
        "image/jpeg",
        "image/png",
        "image/webp"
    ]),
    allowedVideoTypes: Object.freeze([
        "video/webm",
        "video/mp4",
        "video/quicktime"
    ])
});

function numeroFinito(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function limitarTexto(value, maxLength = 120) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function redondear(value, decimals = 6) {
    if (!numeroFinito(value)) return null;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

export function crearIdEvidencia(prefix = "evidence") {
    const safePrefix = limitarTexto(prefix, 32)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-") || "evidence";

    if (globalThis.crypto?.randomUUID) {
        return `${safePrefix}_${globalThis.crypto.randomUUID()}`;
    }

    return `${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function calcularDistanciaMetros(lat1, lng1, lat2, lng2) {
    if (![lat1, lng1, lat2, lng2].every(numeroFinito)) {
        return Number.POSITIVE_INFINITY;
    }

    const earthRadiusM = 6371e3;
    const rad = Math.PI / 180;
    const phi1 = lat1 * rad;
    const phi2 = lat2 * rad;
    const deltaPhi = (lat2 - lat1) * rad;
    const deltaLambda = (lng2 - lng1) * rad;

    const a =
        Math.sin(deltaPhi / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusM * c;
}

export function normalizarLecturaGPS(position) {
    const coords = position?.coords;
    const timestamp = numeroFinito(position?.timestamp)
        ? position.timestamp
        : Date.now();

    if (
        !coords ||
        !numeroFinito(coords.latitude) ||
        !numeroFinito(coords.longitude)
    ) {
        return null;
    }

    return {
        lat: redondear(coords.latitude, 7),
        lng: redondear(coords.longitude, 7),
        accuracyM: numeroFinito(coords.accuracy)
            ? Math.max(0, Math.round(coords.accuracy * 10) / 10)
            : Number.POSITIVE_INFINITY,
        altitudeM: numeroFinito(coords.altitude)
            ? Math.round(coords.altitude * 10) / 10
            : null,
        altitudeAccuracyM: numeroFinito(coords.altitudeAccuracy)
            ? Math.round(coords.altitudeAccuracy * 10) / 10
            : null,
        headingDeg: numeroFinito(coords.heading)
            ? Math.round(coords.heading * 10) / 10
            : null,
        speedMps: numeroFinito(coords.speed)
            ? Math.round(coords.speed * 100) / 100
            : null,
        positionTimestampMs: timestamp,
        capturedAtClient: new Date(timestamp).toISOString(),
        receivedAtClient: new Date().toISOString()
    };
}

function lecturasConsistentes(readings, consistencyRadiusM) {
    if (readings.length < 2) return false;

    const ordered = [...readings].sort((a, b) => a.accuracyM - b.accuracyM);
    const anchor = ordered[0];

    return ordered.every((reading) => {
        const distance = calcularDistanciaMetros(
            anchor.lat,
            anchor.lng,
            reading.lat,
            reading.lng
        );

        return distance <= consistencyRadiusM + Math.max(anchor.accuracyM, reading.accuracyM);
    });
}

export function evaluarLecturasGPS(readings, policy = {}) {
    const resolvedPolicy = {
        ...DEFAULT_GEO_POLICY,
        ...policy
    };

    const now = Date.now();
    const validReadings = (Array.isArray(readings) ? readings : [])
        .filter(Boolean)
        .filter((reading) => (
            numeroFinito(reading.lat) &&
            numeroFinito(reading.lng) &&
            numeroFinito(reading.accuracyM) &&
            reading.accuracyM <= resolvedPolicy.maxAcceptedAccuracyM &&
            now - reading.positionTimestampMs <= resolvedPolicy.readingFreshnessMs
        ))
        .sort((a, b) => a.accuracyM - b.accuracyM);

    const bestReading = validReadings[0] || null;
    const enoughReadings = validReadings.length >= resolvedPolicy.minConsistentReadings;
    const consistent = enoughReadings && lecturasConsistentes(
        validReadings.slice(0, Math.max(resolvedPolicy.minConsistentReadings, 3)),
        resolvedPolicy.consistencyRadiusM
    );
    const accurate = Boolean(
        bestReading && bestReading.accuracyM <= resolvedPolicy.maxAccuracyM
    );

    return {
        valid: Boolean(bestReading && enoughReadings && consistent && accurate),
        bestReading,
        readings: validReadings,
        count: validReadings.length,
        enoughReadings,
        consistent,
        accurate,
        policy: resolvedPolicy
    };
}

export function obtenerLecturasGPSRobustas(policy = {}) {
    const resolvedPolicy = {
        ...DEFAULT_GEO_POLICY,
        ...policy
    };

    return new Promise((resolve) => {
        if (!globalThis.navigator?.geolocation) {
            resolve({
                ok: false,
                reason: "GEOLOCATION_UNAVAILABLE",
                readings: [],
                evaluation: evaluarLecturasGPS([], resolvedPolicy)
            });
            return;
        }

        const readings = [];
        let settled = false;
        let watchId = null;

        const cleanup = () => {
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
            }
        };

        const finish = (reason) => {
            if (settled) return;
            settled = true;
            cleanup();

            const evaluation = evaluarLecturasGPS(readings, resolvedPolicy);
            resolve({
                ok: evaluation.valid,
                reason: evaluation.valid ? "GPS_VERIFIED" : reason,
                readings: evaluation.readings,
                evaluation
            });
        };

        const timeoutId = setTimeout(() => {
            finish("GPS_COLLECTION_TIMEOUT");
        }, resolvedPolicy.collectionTimeoutMs);

        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const reading = normalizarLecturaGPS(position);
                if (!reading) return;

                readings.push(reading);

                const evaluation = evaluarLecturasGPS(readings, resolvedPolicy);
                if (evaluation.valid) {
                    clearTimeout(timeoutId);
                    finish("GPS_VERIFIED");
                }
            },
            (error) => {
                clearTimeout(timeoutId);

                const reasonByCode = {
                    1: "GPS_PERMISSION_DENIED",
                    2: "GPS_POSITION_UNAVAILABLE",
                    3: "GPS_TIMEOUT"
                };

                finish(reasonByCode[error?.code] || "GPS_UNKNOWN_ERROR");
            },
            {
                enableHighAccuracy: true,
                maximumAge: resolvedPolicy.maximumAgeMs,
                timeout: Math.min(
                    resolvedPolicy.collectionTimeoutMs,
                    12000
                )
            }
        );
    });
}

export function evaluarLlegada({ destino, readings, policy = {} } = {}) {
    const resolvedPolicy = {
        ...DEFAULT_GEO_POLICY,
        ...policy
    };

    if (
        !destino ||
        !numeroFinito(destino.lat) ||
        !numeroFinito(destino.lng)
    ) {
        return {
            status: "fallback_required",
            verified: false,
            reason: "DESTINATION_COORDINATES_MISSING",
            policy: resolvedPolicy
        };
    }

    const evaluation = evaluarLecturasGPS(readings, resolvedPolicy);

    if (!evaluation.valid || !evaluation.bestReading) {
        return {
            status: "fallback_required",
            verified: false,
            reason: "GPS_EVIDENCE_INSUFFICIENT",
            gps: evaluation,
            policy: resolvedPolicy
        };
    }

    const distanceM = calcularDistanciaMetros(
        evaluation.bestReading.lat,
        evaluation.bestReading.lng,
        destino.lat,
        destino.lng
    );

    const insideGeofence = distanceM <= resolvedPolicy.geofenceRadiusM;

    return {
        status: insideGeofence ? "verified" : "rejected",
        verified: insideGeofence,
        reason: insideGeofence
            ? "ARRIVAL_GEOFENCE_VERIFIED"
            : "TECHNICIAN_OUTSIDE_GEOFENCE",
        distanceM: Math.round(distanceM * 10) / 10,
        destination: {
            lat: redondear(destino.lat, 7),
            lng: redondear(destino.lng, 7)
        },
        gps: evaluation,
        policy: resolvedPolicy
    };
}

export async function validarLlegadaRobusta({ destino, policy = {} } = {}) {
    const collection = await obtenerLecturasGPSRobustas(policy);
    const arrival = evaluarLlegada({
        destino,
        readings: collection.readings,
        policy
    });

    return {
        ...arrival,
        collectionReason: collection.reason
    };
}

export function validarArchivoMedia(file, policy = {}) {
    const resolvedPolicy = {
        ...DEFAULT_MEDIA_POLICY,
        ...policy
    };

    if (!(file instanceof Blob)) {
        return {
            valid: false,
            reason: "MEDIA_FILE_MISSING"
        };
    }

    const type = String(file.type || "").toLowerCase();
    const isImage = resolvedPolicy.allowedImageTypes.includes(type);
    const isVideo = resolvedPolicy.allowedVideoTypes.includes(type);

    if (!isImage && !isVideo) {
        return {
            valid: false,
            reason: "MEDIA_TYPE_NOT_ALLOWED",
            type
        };
    }

    const maxBytes = isImage
        ? resolvedPolicy.maxImageBytes
        : resolvedPolicy.maxVideoBytes;

    if (file.size <= 0 || file.size > maxBytes) {
        return {
            valid: false,
            reason: "MEDIA_SIZE_NOT_ALLOWED",
            type,
            size: file.size,
            maxBytes
        };
    }

    return {
        valid: true,
        reason: "MEDIA_VALID",
        kind: isImage ? "image" : "video",
        type,
        size: file.size,
        maxBytes
    };
}

export async function sha256Blob(blob) {
    if (!(blob instanceof Blob)) {
        throw new TypeError("sha256Blob requiere un Blob o File válido.");
    }

    if (!globalThis.crypto?.subtle) {
        throw new Error("WEB_CRYPTO_UNAVAILABLE");
    }

    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export async function abrirCamaraEvidencia({
    videoElement,
    includeAudio = false,
    facingMode = "environment"
} = {}) {
    if (!(videoElement instanceof HTMLVideoElement)) {
        throw new TypeError("videoElement debe ser un elemento <video>.");
    }

    if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
        throw new Error("MEDIA_DEVICES_UNAVAILABLE");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: Boolean(includeAudio),
        video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        }
    });

    videoElement.srcObject = stream;
    videoElement.playsInline = true;
    videoElement.muted = true;
    await videoElement.play();

    return stream;
}

export function detenerCamaraEvidencia(streamOrVideo) {
    const stream = streamOrVideo instanceof HTMLVideoElement
        ? streamOrVideo.srcObject
        : streamOrVideo;

    if (stream?.getTracks) {
        stream.getTracks().forEach((track) => track.stop());
    }

    if (streamOrVideo instanceof HTMLVideoElement) {
        streamOrVideo.srcObject = null;
    }
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("CANVAS_BLOB_FAILED"));
        }, type, quality);
    });
}

function dibujarSelloVisual(ctx, canvas, lines) {
    const padding = Math.max(14, Math.round(canvas.width * 0.018));
    const fontSize = Math.max(20, Math.round(canvas.width * 0.023));
    const lineHeight = Math.round(fontSize * 1.3);
    const boxHeight = padding * 2 + lineHeight * lines.length;
    const boxY = canvas.height - boxHeight;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(0, boxY, canvas.width, boxHeight);
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "top";

    lines.forEach((line, index) => {
        ctx.fillText(
            limitarTexto(line, 160),
            padding,
            boxY + padding + index * lineHeight,
            canvas.width - padding * 2
        );
    });

    ctx.restore();
}

export async function capturarFotoSellada({
    videoElement,
    serviceId,
    eventType,
    gps,
    quality = 0.9
} = {}) {
    if (!(videoElement instanceof HTMLVideoElement)) {
        throw new TypeError("videoElement debe ser un elemento <video>.");
    }

    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;

    if (!width || !height) {
        throw new Error("CAMERA_FRAME_NOT_READY");
    }

    const evidenceId = crearIdEvidencia(eventType || "photo");
    const capturedAtClient = new Date().toISOString();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");

    ctx.drawImage(videoElement, 0, 0, width, height);

    const gpsText = gps && numeroFinito(gps.lat) && numeroFinito(gps.lng)
        ? `GPS ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)} ±${Math.round(gps.accuracyM || 0)}m`
        : "GPS NO VALIDADO - REQUIERE REVISIÓN";

    dibujarSelloVisual(ctx, canvas, [
        `Folio: ${limitarTexto(serviceId, 64)}`,
        `Evento: ${limitarTexto(eventType, 48)}`,
        gpsText,
        `Hora cliente: ${capturedAtClient}`,
        `Evidencia: ${evidenceId}`
    ]);

    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    const sha256 = await sha256Blob(blob);

    return {
        blob,
        evidenceId,
        sha256,
        capturedAtClient,
        gps: gps || null,
        media: {
            kind: "image",
            contentType: blob.type,
            size: blob.size,
            width,
            height,
            captureMethod: "in_app_camera",
            visuallyStamped: true
        }
    };
}

export function crearMetadatosUpload({
    serviceId,
    evidenceId,
    eventType,
    capturedAtClient,
    sha256,
    gps,
    captureMethod = "unknown"
} = {}) {
    const customMetadata = {
        evidenceEngineVersion: B2C_EVIDENCE_ENGINE_VERSION,
        serviceId: limitarTexto(serviceId, 128),
        evidenceId: limitarTexto(evidenceId, 128),
        eventType: limitarTexto(eventType, 64),
        capturedAtClient: limitarTexto(capturedAtClient, 64),
        sha256: limitarTexto(sha256, 128),
        captureMethod: limitarTexto(captureMethod, 64),
        requiresServerTimestamp: "true"
    };

    if (gps && numeroFinito(gps.lat) && numeroFinito(gps.lng)) {
        customMetadata.gpsLat = String(redondear(gps.lat, 7));
        customMetadata.gpsLng = String(redondear(gps.lng, 7));
        customMetadata.gpsAccuracyM = String(
            numeroFinito(gps.accuracyM) ? gps.accuracyM : ""
        );
    }

    return {
        contentType: "image/jpeg",
        cacheControl: "private,max-age=0,no-store",
        customMetadata
    };
}

export function crearPayloadEventoEvidencia({
    serviceId,
    evidenceId,
    eventType,
    actorUid,
    actorRole,
    capturedAtClient,
    gps,
    arrival,
    media,
    sha256,
    storagePath = null,
    downloadUrl = null,
    fallbackReason = null
} = {}) {
    return {
        schemaVersion: 1,
        engineVersion: B2C_EVIDENCE_ENGINE_VERSION,
        serviceId: limitarTexto(serviceId, 128),
        evidenceId: limitarTexto(evidenceId, 128),
        eventType: limitarTexto(eventType, 64),
        actor: {
            uid: limitarTexto(actorUid, 128),
            role: limitarTexto(actorRole, 32)
        },
        capturedAtClient: limitarTexto(capturedAtClient, 64),
        serverTimestampRequired: true,
        gps: gps || null,
        arrival: arrival || null,
        media: media || null,
        sha256: limitarTexto(sha256, 128),
        storagePath: storagePath ? limitarTexto(storagePath, 512) : null,
        downloadUrl: downloadUrl ? limitarTexto(downloadUrl, 2048) : null,
        fallbackReason: fallbackReason ? limitarTexto(fallbackReason, 128) : null
    };
}
