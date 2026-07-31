/*
 * ======================================================================================
 * B2C REINFORCED VIDEO BRIDGE 2026
 * Archivo: b2c-reinforced-video-bridge.js
 * Rol: Ofrecer video corto opcional en incidencias que requieren evidencia reforzada.
 *
 * CASOS:
 * - Técnico: cliente ausente o negativa de acceso.
 * - Cliente: disputa “el técnico no está aquí”.
 *
 * REGLAS:
 * - No sustituye la fotografía obligatoria del flujo principal.
 * - No aparece en llegadas normales.
 * - Reutiliza la cámara visible ya autorizada.
 * - Graba 4 segundos sin audio después de consentimiento y cuenta 3-2-1.
 * - No cambia estados, no ejecuta cobros ni mueve fondos.
 * ======================================================================================
 */

import {
    auth,
    db,
    doc,
    getDoc
} from "./firebase.js";

import {
    validarLlegadaRobusta
} from "./b2c-evidence-engine.js";

import {
    grabarYSubirVideoCortoB2C
} from "./b2c-consented-video-evidence.js";

export const B2C_REINFORCED_VIDEO_BRIDGE_VERSION = "1.0.0";

const instalaciones = new Map();
const MODAL_SELECTOR = [
    '[id^="b2cNoShowModal_"]',
    '[id^="b2cClientDisputeEvidence_"]'
].join(",");

const GEO_POLICY = Object.freeze({
    geofenceRadiusM: 150,
    maxAccuracyM: 50,
    maxAcceptedAccuracyM: 180,
    minConsistentReadings: 2,
    consistencyRadiusM: 75,
    collectionTimeoutMs: 15000,
    readingFreshnessMs: 20000,
    maximumAgeMs: 0
});

function textoSeguro(value, maxLength = 180) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function idSeguro(value) {
    return textoSeguro(value, 180)
        .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function serviceIdDesdeModal(modal) {
    const id = textoSeguro(modal?.id, 240);
    const prefixes = [
        "b2cNoShowModal_",
        "b2cClientDisputeEvidence_"
    ];

    const prefix = prefixes.find((candidate) => id.startsWith(candidate));
    return prefix ? id.slice(prefix.length) : null;
}

function tipoModal(modal) {
    if (modal?.id?.startsWith("b2cNoShowModal_")) return "technician_no_show";
    if (modal?.id?.startsWith("b2cClientDisputeEvidence_")) return "client_arrival_dispute";
    return null;
}

function destinoServicio(serviceData) {
    const lat = Number(serviceData?.coords?.lat);
    const lng = Number(serviceData?.coords?.lng);

    return Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : null;
}

function streamCamaraActivo(videoElement) {
    const stream = videoElement?.srcObject;
    return Boolean(
        stream?.getVideoTracks?.().some((track) => (
            track.readyState === "live" && track.enabled !== false
        ))
    );
}

function crearOverlayVideo(videoElement) {
    const container = videoElement?.parentElement;
    if (!container) return null;

    container.querySelector('[data-role="b2c-video-countdown"]')?.remove();

    const overlay = document.createElement("div");
    overlay.dataset.role = "b2c-video-countdown";
    overlay.className = "absolute inset-0 hidden items-center justify-center bg-black/50 backdrop-blur-[1px] z-30 pointer-events-none";
    overlay.innerHTML = `
        <div class="flex flex-col items-center gap-3">
            <div class="w-24 h-24 rounded-full bg-black/80 border-2 border-red-500 flex items-center justify-center shadow-2xl">
                <span data-role="value" class="text-white text-4xl font-black font-mono">3</span>
            </div>
            <p data-role="label" class="text-white text-xs font-black uppercase tracking-widest">Preparando video</p>
        </div>
    `;

    container.appendChild(overlay);

    return {
        overlay,
        value: overlay.querySelector('[data-role="value"]'),
        label: overlay.querySelector('[data-role="label"]')
    };
}

function mostrarError(modal, message) {
    const errorElement = modal.querySelector('[data-role="error"]');
    if (!errorElement) {
        alert(message);
        return;
    }

    errorElement.textContent = message;
    errorElement.classList.remove("hidden");
}

function limpiarError(modal) {
    modal.querySelector('[data-role="error"]')?.classList.add("hidden");
}

async function obtenerServicioAutorizado({ serviceId, actorUid, actorRole }) {
    const snapshot = await getDoc(doc(db, "services", serviceId));

    if (!snapshot.exists()) throw new Error("SERVICE_NOT_FOUND");

    const serviceData = snapshot.data();

    if (serviceData.estado !== "en_sitio") {
        throw new Error(`INVALID_SERVICE_STATE_${serviceData.estado || "unknown"}`);
    }

    if (
        actorRole === "tecnico" &&
        String(serviceData.tecnico_id || "") !== String(actorUid)
    ) {
        throw new Error("TECHNICIAN_SERVICE_MISMATCH");
    }

    if (
        actorRole === "cliente" &&
        String(serviceData.cliente_id || "") !== String(actorUid)
    ) {
        throw new Error("CUSTOMER_SERVICE_MISMATCH");
    }

    return serviceData;
}

function eventTypeDesdeModal(modal, modalType) {
    if (modalType === "client_arrival_dispute") {
        return "customer_arrival_dispute_video";
    }

    const incidentType = modal.querySelector(
        'input[type="radio"][name^="b2cNoShowType_"]:checked'
    )?.value;

    return incidentType === "customer_denied_access"
        ? "customer_denied_access_video"
        : "customer_no_show_video";
}

function insertarBotonVideo(modal) {
    if (modal.querySelector('[data-action="reinforced-video"]')) return;

    const captureButton = modal.querySelector('[data-action="capture"]');
    if (!captureButton) return;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "reinforced-video";
    button.className = "w-full mt-3 bg-purple-950/40 hover:bg-purple-900/60 text-purple-200 border border-purple-500/40 font-bold py-3 rounded-xl text-xs transition-all disabled:opacity-40";
    button.innerHTML = '<i class="fas fa-video"></i> AGREGAR VIDEO DE 4 SEGUNDOS (OPCIONAL)';

    captureButton.insertAdjacentElement("afterend", button);
}

function marcarModales(root = document) {
    root.querySelectorAll?.(MODAL_SELECTOR).forEach(insertarBotonVideo);
}

async function ejecutarVideo({ modal, button, actorUid, actorRole }) {
    const modalType = tipoModal(modal);
    const serviceId = serviceIdDesdeModal(modal);
    const videoElement = modal.querySelector('video[data-role="video"]');

    if (!modalType || !serviceId) throw new Error("VIDEO_CONTEXT_MISSING");
    if (!(videoElement instanceof HTMLVideoElement)) {
        throw new Error("VIDEO_ELEMENT_MISSING");
    }
    if (!streamCamaraActivo(videoElement)) {
        throw new Error("CAMERA_STREAM_NOT_ACTIVE");
    }
    if (document.visibilityState !== "visible") {
        throw new Error("DOCUMENT_NOT_VISIBLE");
    }

    const serviceData = await obtenerServicioAutorizado({
        serviceId,
        actorUid,
        actorRole
    });

    const destination = destinoServicio(serviceData);
    const arrival = await validarLlegadaRobusta({
        destino: destination,
        policy: GEO_POLICY
    });

    if (actorRole === "tecnico" && arrival.status === "rejected") {
        throw new Error("TECHNICIAN_OUTSIDE_GEOFENCE");
    }

    const eventType = eventTypeDesdeModal(modal, modalType);
    const overlay = crearOverlayVideo(videoElement);

    if (!overlay) throw new Error("VIDEO_OVERLAY_UNAVAILABLE");

    overlay.overlay.classList.remove("hidden");
    overlay.overlay.classList.add("flex");

    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PREPARANDO VIDEO...';

    const result = await grabarYSubirVideoCortoB2C({
        videoElement,
        serviceId,
        technicianId: serviceData.tecnico_id,
        customerId: serviceData.cliente_id || null,
        actorUid,
        actorRole,
        eventType,
        serviceData,
        gps: arrival?.gps?.bestReading || null,
        arrival,
        fallbackReason: arrival.status === "verified"
            ? null
            : arrival.reason || "GPS_VIDEO_EVIDENCE_INSUFFICIENT",
        countdownElement: overlay.value,
        onState: ({ state, remaining }) => {
            if (state === "countdown") {
                overlay.value.textContent = String(remaining);
                overlay.label.textContent = "Mantén el encuadre";
                button.innerHTML = `<i class="fas fa-hourglass-half"></i> VIDEO EN ${remaining}...`;
            } else if (state === "recording") {
                overlay.value.textContent = "●";
                overlay.value.classList.add("text-red-500", "animate-pulse");
                overlay.label.textContent = "GRABANDO 4 SEGUNDOS — SIN AUDIO";
                button.innerHTML = '<i class="fas fa-circle text-red-500 animate-pulse"></i> GRABANDO...';
            } else if (state === "recorded") {
                overlay.value.textContent = "✓";
                overlay.value.classList.remove("text-red-500", "animate-pulse");
                overlay.label.textContent = "VIDEO CAPTURADO";
                button.innerHTML = '<i class="fas fa-cloud-arrow-up fa-spin"></i> SUBIENDO VIDEO...';
            }
        },
        policy: {
            countdownSeconds: 3,
            durationMs: 4000,
            maxDurationMs: 5000,
            maxBytes: 20 * 1024 * 1024,
            requireVisibleDocument: true
        }
    });

    overlay.overlay.remove();

    if (!result.success) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-video"></i> REINTENTAR VIDEO DE 4 SEGUNDOS';
        throw new Error(result.userMessage || result.reason || "VIDEO_EVIDENCE_REJECTED");
    }

    button.dataset.evidenceId = result.evidenceId;
    button.dataset.videoStored = "true";
    button.disabled = true;
    button.classList.remove("bg-purple-950/40", "hover:bg-purple-900/60", "text-purple-200", "border-purple-500/40");
    button.classList.add("bg-emerald-950/40", "text-emerald-300", "border-emerald-500/40");
    button.innerHTML = '<i class="fas fa-circle-check"></i> VIDEO DE REFUERZO GUARDADO';
}

export function instalarVideoReforzadoB2C({ user = null, actorRole = null } = {}) {
    const actorUid = textoSeguro(user?.uid || auth.currentUser?.uid, 128);
    const safeRole = textoSeguro(actorRole || user?.rol || user?.role, 32);

    if (!actorUid || !["tecnico", "cliente"].includes(safeRole)) {
        console.warn("[B2C_REINFORCED_VIDEO_NOT_INSTALLED] Actor o rol inválido.");
        return null;
    }

    const key = `${safeRole}:${actorUid}`;
    if (instalaciones.has(key)) return instalaciones.get(key);

    const clickListener = async (event) => {
        const button = event.target?.closest?.('[data-action="reinforced-video"]');
        if (!button) return;

        const modal = button.closest(MODAL_SELECTOR);
        if (!modal || button.dataset.videoStored === "true") return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        limpiarError(modal);

        if (!confirm(
            "Se grabará un video de 4 segundos sin audio. La cámara permanecerá visible y aparecerá una cuenta 3-2-1. ¿Continuar?"
        )) {
            return;
        }

        try {
            await ejecutarVideo({
                modal,
                button,
                actorUid,
                actorRole: safeRole
            });
        } catch (error) {
            console.error("[B2C_REINFORCED_VIDEO_ERROR]", error);

            modal.querySelector('[data-role="b2c-video-countdown"]')?.remove();

            if (button.dataset.videoStored !== "true") {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-video"></i> REINTENTAR VIDEO DE 4 SEGUNDOS';
            }

            const messages = {
                MEDIA_RECORDER_UNAVAILABLE:
                    "Este navegador no permite grabar video desde la app. Puedes continuar con la fotografía.",
                CAMERA_STREAM_NOT_ACTIVE:
                    "La cámara no está activa. Autoriza la cámara y vuelve a intentarlo.",
                DOCUMENT_NOT_VISIBLE:
                    "La aplicación debe permanecer visible durante la grabación.",
                DOCUMENT_HIDDEN_DURING_VIDEO:
                    "El video se canceló porque la aplicación dejó de estar visible.",
                TECHNICIAN_OUTSIDE_GEOFENCE:
                    "No se puede registrar video de ausencia porque el técnico está fuera de la zona del servicio.",
                RECORDED_VIDEO_TOO_LARGE:
                    "El video excedió el tamaño permitido. Intenta nuevamente con conexión estable."
            };

            mostrarError(
                modal,
                messages[error?.message] ||
                "No se pudo guardar el video. La fotografía principal sigue disponible y no se modificó el servicio."
            );
        }
    };

    document.addEventListener("click", clickListener, true);

    const observer = new MutationObserver(() => marcarModales(document));
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    marcarModales(document);

    const installation = {
        version: B2C_REINFORCED_VIDEO_BRIDGE_VERSION,
        actorUid,
        actorRole: safeRole,
        unsubscribe() {
            document.removeEventListener("click", clickListener, true);
            observer.disconnect();
            instalaciones.delete(key);
        }
    };

    instalaciones.set(key, installation);
    window.__B2C_REINFORCED_VIDEO_BRIDGE_VERSION__ = B2C_REINFORCED_VIDEO_BRIDGE_VERSION;

    console.log(
        `[B2C_REINFORCED_VIDEO_READY] v${B2C_REINFORCED_VIDEO_BRIDGE_VERSION} (${safeRole})`
    );

    return installation;
}
