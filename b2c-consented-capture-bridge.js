/**
 * ======================================================================================
 * B2C CONSENTED CAPTURE BRIDGE 2026
 * Archivo: b2c-consented-capture-bridge.js
 * Rol: Aplicar captura asistida 3-2-1 a las evidencias críticas del técnico.
 *
 * PRINCIPIOS:
 * - La cámara ya debe estar abierta y visible.
 * - La cuenta regresiva comienza únicamente por un toque consciente del técnico.
 * - Se registra el consentimiento con hora de servidor antes de disparar la captura.
 * - El cuadro temporal usado para validar la cámara NO se persiste ni se sube.
 * - Después del 3-2-1 se invoca el capturador sellado/antifraude ya existente.
 * - No cambia estados, no ejecuta cobros y no abre la cámara en segundo plano.
 * ======================================================================================
 */

import {
    auth,
    db,
    doc,
    setDoc,
    serverTimestamp
} from "./firebase.js";

import {
    crearConsentimientoCaptura,
    capturaAsistidaConsentida,
    crearMetadatosConsentimientoCaptura,
    B2C_CONSENTED_AUTO_CAPTURE_VERSION
} from "./b2c-consented-auto-capture.js";

export const B2C_CONSENTED_CAPTURE_BRIDGE_VERSION = "1.0.0";

const instalaciones = new Map();
const SELECTOR_MODAL = [
    '[id^="b2cArrivalModal_"]',
    '[id^="b2cNoShowModal_"]'
].join(",");

function textoSeguro(value, maxLength = 180) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function idDesdeModal(modal) {
    const id = textoSeguro(modal?.id, 220);

    if (id.startsWith("b2cArrivalModal_")) {
        return id.slice("b2cArrivalModal_".length);
    }

    if (id.startsWith("b2cNoShowModal_")) {
        return id.slice("b2cNoShowModal_".length);
    }

    return "";
}

function resolverEvento(modal) {
    if (modal?.id?.startsWith("b2cArrivalModal_")) {
        const statusText = textoSeguro(
            modal.querySelector('[data-role="status"]')?.textContent,
            500
        ).toLowerCase();

        return statusText.includes("alternativa") ||
            statusText.includes("no pudo validar")
            ? "arrival_fallback"
            : "arrival";
    }

    if (modal?.id?.startsWith("b2cNoShowModal_")) {
        const checked = modal.querySelector(
            'input[type="radio"][name^="b2cNoShowType_"]:checked'
        );

        return textoSeguro(checked?.value, 80) || "customer_no_show";
    }

    return "critical_evidence";
}

function streamCamaraActivo(videoElement) {
    const stream = videoElement?.srcObject;

    return Boolean(
        stream?.getVideoTracks?.().some((track) => (
            track.readyState === "live" && track.enabled !== false
        ))
    );
}

function crearOverlayCuentaRegresiva(videoElement) {
    const container = videoElement?.parentElement;
    if (!container) return null;

    const existing = container.querySelector(
        '[data-role="b2c-consented-countdown"]'
    );
    existing?.remove();

    const overlay = document.createElement("div");
    overlay.dataset.role = "b2c-consented-countdown";
    overlay.className = [
        "absolute",
        "inset-0",
        "z-30",
        "flex",
        "items-center",
        "justify-center",
        "bg-black/45",
        "backdrop-blur-[1px]",
        "pointer-events-none"
    ].join(" ");

    overlay.innerHTML = `
        <div class="w-28 h-28 rounded-full bg-black/75 border-4 border-emerald-400 flex items-center justify-center shadow-2xl">
            <span data-role="countdown-value" class="text-6xl text-white font-black font-mono">3</span>
        </div>
    `;

    container.appendChild(overlay);

    return {
        overlay,
        valueElement: overlay.querySelector('[data-role="countdown-value"]')
    };
}

function eliminarOverlay(overlayState) {
    overlayState?.overlay?.remove();
}

function restaurarBoton(button, htmlOriginal) {
    if (!button) return;

    button.disabled = false;
    button.dataset.b2cCaptureBusy = "false";
    button.innerHTML = htmlOriginal;
}

function marcarBotonesCaptura(root = document) {
    root.querySelectorAll?.(
        `${SELECTOR_MODAL} [data-action="capture"]`
    ).forEach((button) => {
        if (button.dataset.b2cConsentedBridgeReady === "true") return;

        button.dataset.b2cConsentedBridgeReady = "true";
        button.dataset.b2cCaptureBusy = "false";

        if (button.closest('[id^="b2cArrivalModal_"]')) {
            button.innerHTML = '<i class="fas fa-camera"></i> AUTORIZAR CAPTURA 3-2-1';
        } else {
            button.innerHTML = '<i class="fas fa-camera"></i> AUTORIZAR FOTO 3-2-1';
        }
    });
}

async function guardarConsentimiento({
    serviceId,
    consent,
    status,
    extra = {}
}) {
    if (!serviceId || !consent?.consentId) return false;

    try {
        await setDoc(
            doc(
                db,
                "services",
                serviceId,
                "capture_consents",
                consent.consentId
            ),
            {
                consent_id: consent.consentId,
                service_id: serviceId,
                actor_uid: consent.actorUid,
                actor_role: consent.actorRole,
                event_type: consent.eventType,
                interaction_type: consent.interactionType,
                granted_at_client: consent.grantedAtClient,
                document_visibility_at_consent:
                    consent.documentVisibilityAtConsent,
                status,
                consent_version: B2C_CONSENTED_AUTO_CAPTURE_VERSION,
                bridge_version: B2C_CONSENTED_CAPTURE_BRIDGE_VERSION,
                updated_at_server: serverTimestamp(),
                ...extra
            },
            { merge: true }
        );

        return true;
    } catch (error) {
        console.warn(
            "[B2C_CAPTURE_CONSENT_AUDIT_WARNING]",
            error
        );
        return false;
    }
}

async function ejecutarCapturaConsentida({
    button,
    modal,
    technicianId
}) {
    const serviceId = idDesdeModal(modal);
    const eventType = resolverEvento(modal);
    const videoElement = modal.querySelector('video[data-role="video"]');
    const originalHtml = button.innerHTML;

    if (!serviceId) {
        throw new Error("CAPTURE_SERVICE_ID_MISSING");
    }

    if (!(videoElement instanceof HTMLVideoElement)) {
        throw new Error("CAPTURE_VIDEO_ELEMENT_MISSING");
    }

    if (!streamCamaraActivo(videoElement)) {
        throw new Error("CAMERA_STREAM_NOT_ACTIVE");
    }

    if (document.visibilityState !== "visible") {
        throw new Error("DOCUMENT_NOT_VISIBLE");
    }

    const consent = crearConsentimientoCaptura({
        serviceId,
        actorUid: technicianId,
        actorRole: "tecnico",
        eventType,
        interactionType: "explicit_evidence_button_tap"
    });

    button.dataset.b2cCaptureBusy = "true";
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-shield-halved"></i> CONSENTIMIENTO REGISTRADO';

    const overlayState = crearOverlayCuentaRegresiva(videoElement);

    await guardarConsentimiento({
        serviceId,
        consent,
        status: "authorized_pending_countdown",
        extra: {
            granted_at_server: serverTimestamp(),
            raw_frame_persisted: false
        }
    });

    try {
        const assistedResult = await capturaAsistidaConsentida({
            videoElement,
            consent,
            countdownElement: overlayState?.valueElement || null,
            policy: {
                countdownSeconds: 3,
                consentMaxAgeMs: 60 * 1000,
                requireVisibleDocument: true,
                imageQuality: 0.75
            },
            onTick: ({ state, remaining }) => {
                if (state === "countdown") {
                    button.innerHTML = `<i class="fas fa-hourglass-half"></i> CAPTURANDO EN ${remaining}...`;
                } else if (state === "capturing") {
                    button.innerHTML = '<i class="fas fa-camera"></i> CAPTURANDO...';
                } else if (state === "captured") {
                    button.innerHTML = '<i class="fas fa-shield-check"></i> SELLANDO EVIDENCIA...';
                }
            }
        });

        // El frame temporal solo verifica que la cámara seguía visible y operativa.
        // La evidencia persistida la toma inmediatamente el capturador sellado existente.
        const consentMetadata = crearMetadatosConsentimientoCaptura(
            assistedResult
        );

        await guardarConsentimiento({
            serviceId,
            consent,
            status: "countdown_completed_capture_triggered",
            extra: {
                capture_triggered_at_server: serverTimestamp(),
                capture_executed_at_client:
                    assistedResult.capturedAtClient,
                elapsed_monotonic_ms:
                    assistedResult.elapsedMonotonicMs,
                camera_frame_width: assistedResult.width,
                camera_frame_height: assistedResult.height,
                camera_frame_size_bytes: assistedResult.sizeBytes,
                raw_frame_persisted: false,
                capture_metadata: consentMetadata
            }
        });

        eliminarOverlay(overlayState);

        button.dataset.b2cCaptureBusy = "false";
        button.dataset.b2cCaptureBypass = "true";
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESANDO EVIDENCIA...';

        // El listener original del módulo de llegada/ausencia se ejecuta en este segundo click.
        button.click();
    } catch (error) {
        eliminarOverlay(overlayState);

        await guardarConsentimiento({
            serviceId,
            consent,
            status: "countdown_failed_before_evidence",
            extra: {
                failed_at_server: serverTimestamp(),
                error_code: textoSeguro(error?.code || error?.message, 160),
                raw_frame_persisted: false
            }
        });

        restaurarBoton(button, originalHtml);
        throw error;
    }
}

export function instalarCapturaConsentidaTecnicoB2C(user = null) {
    const technicianId = textoSeguro(
        user?.uid || auth.currentUser?.uid,
        128
    );

    if (!technicianId) {
        console.warn("[B2C_CONSENTED_CAPTURE_NOT_INSTALLED] Falta UID de técnico.");
        return null;
    }

    if (instalaciones.has(technicianId)) {
        return instalaciones.get(technicianId);
    }

    const clickListener = (event) => {
        const button = event.target?.closest?.('[data-action="capture"]');
        const modal = button?.closest?.(SELECTOR_MODAL);

        if (!button || !modal) return;

        if (button.dataset.b2cCaptureBypass === "true") {
            delete button.dataset.b2cCaptureBypass;
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (
            button.dataset.b2cCaptureBusy === "true" ||
            button.disabled
        ) {
            return;
        }

        ejecutarCapturaConsentida({
            button,
            modal,
            technicianId
        }).catch((error) => {
            console.error("[B2C_CONSENTED_CAPTURE_ERROR]", error);
            alert(
                "No se pudo completar la captura 3-2-1. Mantén la aplicación visible, verifica la cámara y vuelve a intentarlo."
            );
        });
    };

    document.addEventListener("click", clickListener, true);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;

                if (node.matches?.(SELECTOR_MODAL)) {
                    marcarBotonesCaptura(node.parentElement || document);
                } else if (node.querySelector?.(SELECTOR_MODAL)) {
                    marcarBotonesCaptura(node);
                }
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    marcarBotonesCaptura(document);

    const installation = {
        version: B2C_CONSENTED_CAPTURE_BRIDGE_VERSION,
        technicianId,
        uninstall() {
            document.removeEventListener("click", clickListener, true);
            observer.disconnect();
            instalaciones.delete(technicianId);
        }
    };

    instalaciones.set(technicianId, installation);
    window.__B2C_CONSENTED_CAPTURE_BRIDGE_VERSION__ =
        B2C_CONSENTED_CAPTURE_BRIDGE_VERSION;

    console.log(
        `[B2C_CONSENTED_CAPTURE_READY] v${B2C_CONSENTED_CAPTURE_BRIDGE_VERSION}`
    );

    return installation;
}
