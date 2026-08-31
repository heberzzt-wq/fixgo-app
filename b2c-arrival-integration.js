/**
 * ======================================================================================
 * B2C SECURE ARRIVAL INTEGRATION 2026
 * Archivo: b2c-arrival-integration.js
 * Rol: Reemplazar el bypass legacy de llegada por GPS robusto + foto sellada.
 *
 * ALCANCE:
 * - Se instala después de iniciar el panel del técnico.
 * - No ejecuta cobros ni penalizaciones.
 * - No permite declarar llegada por un simple error de GPS.
 * - GPS insuficiente puede usar evidencia reforzada y queda marcado para revisión.
 * - Técnico fuera de la geocerca permanece bloqueado.
 * ======================================================================================
 */

import {
    auth,
    db,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "./firebase.js";

import {
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    abrirCamaraEvidencia,
    detenerCamaraEvidencia
} from "./b2c-evidence-engine.js";

import {
    validarLlegadaParaEvidencia,
    capturarYSubirFotoB2C
} from "./b2c-evidence-orchestrator.js";
import { getConfirmedServiceDestination } from "./b2c-destination.js";

export const B2C_SECURE_ARRIVAL_VERSION = "1.0.0";

const ARRIVAL_GEO_POLICY = Object.freeze({
    geofenceRadiusM: 100,
    maxAccuracyM: 50,
    maxAcceptedAccuracyM: 150,
    minConsistentReadings: 2,
    consistencyRadiusM: 60,
    collectionTimeoutMs: 15000,
    readingFreshnessMs: 20000,
    maximumAgeMs: 0
});

function numeroFinito(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function textoSeguro(value, maxLength = 160) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function idSeguro(value) {
    return textoSeguro(value, 128)
        .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function destinoDesde({ targetLat, targetLng, serviceData }) {
    const confirmed = getConfirmedServiceDestination(serviceData);
    const lat = numeroFinito(targetLat) ?? numeroFinito(confirmed?.coords?.lat);
    const lng = numeroFinito(targetLng) ?? numeroFinito(confirmed?.coords?.lng);

    if (lat === null || lng === null) {
        return null;
    }

    return { lat, lng };
}

function textoEstadoLlegada(validation) {
    if (validation?.fallback) {
        return "El GPS no pudo validar la llegada. La fotografía quedará marcada como evidencia alternativa y el caso podrá revisarse.";
    }

    const distance = numeroFinito(validation?.arrival?.distanceM);
    const accuracy = numeroFinito(validation?.gps?.accuracyM);
    const parts = ["Ubicación validada dentro de la geocerca."];

    if (distance !== null) parts.push(`Distancia: ${Math.round(distance)} m.`);
    if (accuracy !== null) parts.push(`Precisión GPS: ±${Math.round(accuracy)} m.`);

    return parts.join(" ");
}

function restaurarBoton(btn, htmlOriginal) {
    if (!btn) return;
    btn.innerHTML = htmlOriginal;
    btn.disabled = false;
}

function cerrarModal(modal, videoElement) {
    try {
        detenerCamaraEvidencia(videoElement);
    } catch (error) {
        console.warn("[B2C_ARRIVAL_CAMERA_STOP_WARNING]", error);
    }

    modal?.remove();
}

async function confirmarEstadoEnSitio({
    serviceId,
    technicianId,
    evidenceResult,
    validation
}) {
    const serviceRef = doc(db, "services", serviceId);

    await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(serviceRef);

        if (!snapshot.exists()) {
            throw new Error("SERVICE_NOT_FOUND");
        }

        const current = snapshot.data();

        if (String(current.tecnico_id || "") !== String(technicianId)) {
            throw new Error("TECHNICIAN_SERVICE_MISMATCH");
        }

        if (current.estado === "en_sitio") {
            return;
        }

        if (current.estado !== "en_camino") {
            throw new Error(`INVALID_ARRIVAL_STATE_${current.estado || "unknown"}`);
        }

        const gps = validation?.gps || null;
        const arrival = validation?.arrival || null;
        const fallback = validation?.fallback === true;

        transaction.update(serviceRef, {
            estado: "en_sitio",
            en_sitio_at: serverTimestamp(),
            llegada_validacion_version: B2C_SECURE_ARRIVAL_VERSION,
            llegada_revision_requerida: fallback,
            llegada_notificacion_estado: "pendiente",
            llegada_cliente_respuesta: "pendiente",
            evidencia_llegada: {
                evidence_event_id: evidenceResult.eventDocumentId,
                evidence_id: evidenceResult.evidenceId,
                event_type: evidenceResult.eventType,
                download_url: evidenceResult.downloadUrl,
                storage_path: evidenceResult.storagePath,
                sha256: evidenceResult.fingerprint?.sha256 || null,
                perceptual_hash: evidenceResult.fingerprint?.perceptual?.hex || null,
                metodo: fallback ? "camera_gps_fallback" : "camera_gps_verified",
                gps_verificado: !fallback,
                fallback_reason: fallback
                    ? textoSeguro(arrival?.reason || validation?.reason, 160)
                    : null,
                tecnico_lat: numeroFinito(gps?.lat),
                tecnico_lng: numeroFinito(gps?.lng),
                precision_m: numeroFinito(gps?.accuracyM),
                distancia_destino_m: numeroFinito(arrival?.distanceM),
                destino_lat: numeroFinito(arrival?.destination?.lat),
                destino_lng: numeroFinito(arrival?.destination?.lng),
                capturada_at_cliente: evidenceResult.payload?.capturedAtClient || null,
                sellada_at_servidor: serverTimestamp()
            }
        });
    });

    await setDoc(
        doc(db, "rastreo", technicianId),
        {
            estado: "En Sitio",
            service_id: serviceId,
            llegada_evidencia_id: evidenceResult.evidenceId,
            llegada_revision_requerida: validation?.fallback === true,
            ultima_actualizacion: serverTimestamp()
        },
        { merge: true }
    );
}

async function abrirCapturaLlegada({
    serviceId,
    serviceData,
    technicianId,
    validation,
    button,
    buttonOriginalHtml
}) {
    const suffix = idSeguro(serviceId);
    const modal = document.createElement("div");
    modal.id = `b2cArrivalModal_${suffix}`;
    modal.className = "fixed inset-0 bg-black/95 z-[120] flex items-center justify-center p-4 backdrop-blur-sm";
    modal.innerHTML = `
        <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-5 border border-emerald-500/40 shadow-2xl">
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-white font-black text-lg">
                    <i class="fas fa-location-crosshairs text-emerald-500"></i>
                    CONFIRMAR LLEGADA
                </h3>
                <button type="button" data-action="close" class="text-gray-500 hover:text-white p-2">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <p data-role="status" class="text-xs text-gray-300 mb-4 leading-relaxed"></p>

            <div class="relative bg-black rounded-2xl overflow-hidden border border-zinc-700 aspect-[3/4]">
                <video data-role="video" class="w-full h-full object-cover" autoplay muted playsinline></video>
                <div data-role="camera-loading" class="absolute inset-0 flex flex-col items-center justify-center bg-black text-gray-400">
                    <i class="fas fa-camera text-3xl mb-3"></i>
                    <p class="text-xs font-bold">ABRIENDO CÁMARA SEGURA...</p>
                </div>
            </div>

            <p class="text-[10px] text-gray-500 mt-3 leading-relaxed">
                La captura se sellará con folio, ubicación disponible, precisión, hora y huella digital. No fotografíes personas ni interiores innecesarios.
            </p>

            <div data-role="error" class="hidden mt-3 bg-red-950/40 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl"></div>

            <div class="flex gap-3 mt-5">
                <button type="button" data-action="cancel" class="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm">
                    CANCELAR
                </button>
                <button type="button" data-action="capture" class="flex-[2] bg-emerald-500 text-black py-3 rounded-xl font-black text-sm disabled:opacity-50" disabled>
                    <i class="fas fa-camera"></i> TOMAR FOTO Y CONFIRMAR
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const videoElement = modal.querySelector('[data-role="video"]');
    const loadingElement = modal.querySelector('[data-role="camera-loading"]');
    const statusElement = modal.querySelector('[data-role="status"]');
    const errorElement = modal.querySelector('[data-role="error"]');
    const captureButton = modal.querySelector('[data-action="capture"]');
    const cancelButtons = modal.querySelectorAll('[data-action="cancel"], [data-action="close"]');

    statusElement.textContent = textoEstadoLlegada(validation);

    cancelButtons.forEach((cancelButton) => {
        cancelButton.addEventListener("click", () => {
            cerrarModal(modal, videoElement);
            restaurarBoton(button, buttonOriginalHtml);
        });
    });

    try {
        await abrirCamaraEvidencia({
            videoElement,
            facingMode: "environment",
            includeAudio: false
        });

        loadingElement.classList.add("hidden");
        captureButton.disabled = false;
    } catch (error) {
        console.error("[B2C_ARRIVAL_CAMERA_OPEN_ERROR]", error);
        errorElement.textContent = "No fue posible abrir la cámara. Autoriza el permiso de cámara y vuelve a intentarlo.";
        errorElement.classList.remove("hidden");
        loadingElement.innerHTML = '<i class="fas fa-triangle-exclamation text-red-500 text-3xl mb-3"></i><p class="text-xs font-bold text-red-300">CÁMARA NO DISPONIBLE</p>';
        restaurarBoton(button, buttonOriginalHtml);
        return;
    }

    captureButton.addEventListener("click", async () => {
        captureButton.disabled = true;
        captureButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SELLANDO Y SUBIENDO...';
        errorElement.classList.add("hidden");

        try {
            const fallback = validation.fallback === true;
            const eventType = fallback ? "arrival_fallback" : "arrival";

            const evidenceResult = await capturarYSubirFotoB2C({
                videoElement,
                serviceId,
                technicianId,
                customerId: serviceData.cliente_id || null,
                actorUid: technicianId,
                actorRole: "tecnico",
                eventType,
                gps: validation.gps || null,
                arrival: validation.arrival || null,
                fallbackReason: fallback
                    ? validation.arrival?.reason || validation.reason || "GPS_EVIDENCE_INSUFFICIENT"
                    : null,
                policy: {
                    geo: ARRIVAL_GEO_POLICY,
                    requireInAppCapture: true,
                    photoQuality: 0.9
                }
            });

            if (!evidenceResult.success) {
                errorElement.textContent = evidenceResult.userMessage || "La evidencia no superó la validación antifraude. Toma una fotografía nueva.";
                errorElement.classList.remove("hidden");
                captureButton.disabled = false;
                captureButton.innerHTML = '<i class="fas fa-camera"></i> TOMAR OTRA FOTO';
                return;
            }

            captureButton.innerHTML = '<i class="fas fa-shield-check"></i> CONFIRMANDO ESTADO...';

            await confirmarEstadoEnSitio({
                serviceId,
                technicianId,
                evidenceResult,
                validation
            });

            cerrarModal(modal, videoElement);
            alert(
                fallback
                    ? "✅ Llegada registrada con evidencia alternativa. El caso quedó marcado para revisión y el cliente será notificado por el flujo correspondiente."
                    : "✅ Llegada confirmada con GPS y fotografía sellada."
            );
        } catch (error) {
            console.error("[B2C_SECURE_ARRIVAL_ERROR]", error);
            errorElement.textContent = "No se pudo completar la llegada segura. La orden no cambió a 'en sitio'. Revisa conexión, permisos y vuelve a intentarlo.";
            errorElement.classList.remove("hidden");
            captureButton.disabled = false;
            captureButton.innerHTML = '<i class="fas fa-redo"></i> REINTENTAR CAPTURA';
            restaurarBoton(button, buttonOriginalHtml);
        }
    });
}

/**
 * Sustituye window.validarLlegada definido por panel-tecnico.js.
 * Los botones inline existentes seguirán llamando el nombre global, ahora blindado.
 */
export function instalarLlegadaSeguraB2C(user = null) {
    const technicianId = textoSeguro(
        user?.uid || auth.currentUser?.uid,
        128
    );

    if (!technicianId) {
        console.warn("[B2C_SECURE_ARRIVAL_NOT_INSTALLED] Falta UID de técnico.");
        return false;
    }

    window.validarLlegada = async (serviceId, targetLat, targetLng) => {
        const safeServiceId = textoSeguro(serviceId, 128);
        const button = document.getElementById(`btn_llegada_${safeServiceId}`);
        const buttonOriginalHtml = button?.innerHTML || '<i class="fas fa-map-marker-alt"></i> YA LLEGUÉ AL SITIO';

        if (!safeServiceId) {
            alert("No fue posible identificar el servicio.");
            return;
        }

        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-satellite fa-spin"></i> VALIDANDO UBICACIÓN...';
        }

        try {
            const serviceRef = doc(db, "services", safeServiceId);
            const serviceSnapshot = await getDoc(serviceRef);

            if (!serviceSnapshot.exists()) {
                throw new Error("SERVICE_NOT_FOUND");
            }

            const serviceData = serviceSnapshot.data();

            if (String(serviceData.tecnico_id || "") !== technicianId) {
                throw new Error("TECHNICIAN_SERVICE_MISMATCH");
            }

            if (serviceData.estado === "en_sitio") {
                restaurarBoton(button, buttonOriginalHtml);
                return;
            }

            if (serviceData.estado !== "en_camino") {
                throw new Error(`INVALID_ARRIVAL_STATE_${serviceData.estado || "unknown"}`);
            }

            const destination = destinoDesde({
                targetLat,
                targetLng,
                serviceData
            });

            const validation = await validarLlegadaParaEvidencia({
                destination,
                geoPolicy: ARRIVAL_GEO_POLICY,
                allowFallback: true
            });

            if (!validation.allowCapture) {
                restaurarBoton(button, buttonOriginalHtml);

                if (validation.status === "arrival_rejected") {
                    const distance = numeroFinito(validation.arrival?.distanceM);
                    alert(
                        `🛑 Llegada bloqueada. El técnico está fuera de la geocerca del destino${distance !== null ? ` por aproximadamente ${Math.round(distance)} metros` : ""}. Si el pin del cliente es incorrecto, debe corregirse o revisarse antes de aplicar cualquier cargo.`
                    );
                    return;
                }

                alert(validation.userMessage || "No fue posible validar la llegada.");
                return;
            }

            await abrirCapturaLlegada({
                serviceId: safeServiceId,
                serviceData,
                technicianId,
                validation,
                button,
                buttonOriginalHtml
            });
        } catch (error) {
            console.error("[B2C_SECURE_ARRIVAL_PRECHECK_ERROR]", error);
            restaurarBoton(button, buttonOriginalHtml);
            alert("No fue posible iniciar la validación segura de llegada. La orden permanece sin cambios.");
        }
    };

    window.__B2C_SECURE_ARRIVAL_VERSION__ = B2C_SECURE_ARRIVAL_VERSION;
    console.log(
        `[B2C_SECURE_ARRIVAL_READY] v${B2C_SECURE_ARRIVAL_VERSION}`
    );

    return true;
}
