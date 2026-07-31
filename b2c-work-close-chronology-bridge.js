/*
 * ======================================================================================
 * B2C WORK CLOSE CHRONOLOGY BRIDGE 2026
 * Archivo: b2c-work-close-chronology-bridge.js
 * Rol: Cerrar el trabajo usando work_before ya almacenado y una nueva captura work_after.
 *
 * PRINCIPIOS:
 * - Se instala encima del guardia de cierre anterior y conserva su opener legacy original.
 * - Recupera work_before desde Storage y verifica su SHA-256 antes de usarlo.
 * - En el cierre solo captura work_after con cámara visible, GPS, hora servidor y 3-2-1.
 * - Exige firma con trazos reales y calcula SHA-256 de la firma.
 * - Conserva la transacción financiera legacy; no cobra ni mueve fondos por sí mismo.
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
    abrirCamaraEvidencia,
    detenerCamaraEvidencia,
    sha256Blob
} from "./b2c-evidence-engine.js";

import {
    validarLlegadaParaEvidencia,
    capturarYSubirFotoB2C
} from "./b2c-evidence-orchestrator.js";

import {
    crearConsentimientoCaptura,
    capturaAsistidaConsentida,
    crearMetadatosConsentimientoCaptura
} from "./b2c-consented-auto-capture.js";

import {
    sincronizarRelojServidor,
    crearSelloTemporalEvidencia
} from "./b2c-time-authority.js";

export const B2C_WORK_CLOSE_CHRONOLOGY_BRIDGE_VERSION = "1.0.0";

const INSTALL_KEY = "__B2C_WORK_CLOSE_CHRONOLOGY_BRIDGE__";
const WRAPPED_FLAG = "__b2cWorkCloseChronologyBridge";
const MODAL_PREFIX = "b2cWorkAfterClose_";
const activeFlows = new Map();

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

function idSeguro(value, fallback = "close") {
    return textoSeguro(value, 180)
        .replace(/[^a-zA-Z0-9_-]/g, "_") || fallback;
}

function numeroFinito(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function tecnicoAsignado(serviceData = {}) {
    return textoSeguro(
        serviceData.tecnico_id ||
        serviceData.technician_id ||
        serviceData.pro_id,
        128
    );
}

function destinoServicio(serviceData = {}) {
    const lat = numeroFinito(serviceData?.coords?.lat);
    const lng = numeroFinito(serviceData?.coords?.lng);

    return lat === null || lng === null
        ? null
        : { lat, lng };
}

function evidenciaAntesValida(serviceData, technicianId) {
    const evidence = serviceData?.trabajo_antes_evidencia;

    return Boolean(
        evidence &&
        evidence.status === "stored" &&
        evidence.event_type === "work_before" &&
        textoSeguro(evidence.actor_uid, 128) === technicianId &&
        textoSeguro(evidence.evidence_id, 180) &&
        textoSeguro(evidence.download_url, 2048) &&
        textoSeguro(evidence.storage_path, 600) &&
        /^[a-f0-9]{64}$/i.test(textoSeguro(evidence.sha256, 128))
    );
}

function mensajeError(error) {
    const code = textoSeguro(error?.code || error?.message, 180);
    const messages = {
        SERVICE_NOT_FOUND: "No se encontró el servicio.",
        TECHNICIAN_ASSIGNMENT_MISSING: "El servicio no tiene técnico asignado de forma verificable.",
        TECHNICIAN_SERVICE_MISMATCH: "Este servicio pertenece a otro técnico.",
        INVALID_SERVICE_STATE: "El servicio ya no está en estado de trabajo.",
        WORK_BEFORE_EVIDENCE_REQUIRED: "Falta la evidencia ANTES capturada al iniciar la reparación.",
        WORK_BEFORE_DOWNLOAD_FAILED: "No fue posible recuperar la evidencia ANTES desde Storage.",
        WORK_BEFORE_HASH_MISMATCH: "La evidencia ANTES no coincide con su huella registrada.",
        CAMERA_STREAM_NOT_ACTIVE: "La cámara dejó de estar disponible. Vuelve a intentarlo.",
        DOCUMENT_NOT_VISIBLE: "Mantén la aplicación visible durante la captura.",
        DOCUMENT_HIDDEN_DURING_CAPTURE: "La captura se canceló porque la aplicación dejó de estar visible.",
        TECHNICIAN_OUTSIDE_GEOFENCE: "Estás fuera del domicilio confirmado. No puedes cerrar el trabajo.",
        WORK_EVIDENCE_FILE_CHANGED: "Una evidencia segura fue sustituida antes del cierre.",
        CUSTOMER_SIGNATURE_REQUIRED: "La firma del cliente es obligatoria y debe contener trazos reales.",
        LEGACY_EVIDENCE_MODAL_TIMEOUT: "No fue posible abrir el cierre compatible del servicio."
    };

    return messages[code] ||
        error?.userMessage ||
        "No fue posible completar el cierre seguro. Revisa cámara, GPS y conexión.";
}

function crearOverlayCuentaRegresiva(videoElement) {
    const container = videoElement?.parentElement;
    if (!container) return null;

    container.querySelector('[data-role="work-after-countdown"]')?.remove();

    const overlay = document.createElement("div");
    overlay.dataset.role = "work-after-countdown";
    overlay.className = "absolute inset-0 hidden items-center justify-center bg-black/50 backdrop-blur-[1px] z-20 pointer-events-none";
    overlay.innerHTML = `
        <div class="w-24 h-24 rounded-full bg-black/80 border-2 border-white/70 flex items-center justify-center shadow-2xl">
            <span data-role="countdown-value" class="text-white text-5xl font-black font-mono">3</span>
        </div>
    `;

    container.appendChild(overlay);

    return {
        overlay,
        value: overlay.querySelector('[data-role="countdown-value"]')
    };
}

function cerrarFlujo(serviceId) {
    const flow = activeFlows.get(serviceId);
    if (!flow) return;

    try {
        detenerCamaraEvidencia(flow.videoElement);
    } catch (error) {
        console.warn("[B2C_WORK_AFTER_CAMERA_STOP_WARNING]", error);
    }

    flow.modal?.remove();
    activeFlows.delete(serviceId);
}

async function obtenerServicio({ serviceId, technicianId }) {
    const snapshot = await getDoc(doc(db, "services", serviceId));

    if (!snapshot.exists()) {
        const error = new Error("SERVICE_NOT_FOUND");
        error.code = "SERVICE_NOT_FOUND";
        throw error;
    }

    const serviceData = snapshot.data();
    const assignedTechnician = tecnicoAsignado(serviceData);

    if (!assignedTechnician) {
        const error = new Error("TECHNICIAN_ASSIGNMENT_MISSING");
        error.code = "TECHNICIAN_ASSIGNMENT_MISSING";
        throw error;
    }

    if (assignedTechnician !== technicianId) {
        const error = new Error("TECHNICIAN_SERVICE_MISMATCH");
        error.code = "TECHNICIAN_SERVICE_MISMATCH";
        throw error;
    }

    if (serviceData.estado !== "trabajando") {
        const error = new Error("INVALID_SERVICE_STATE");
        error.code = "INVALID_SERVICE_STATE";
        throw error;
    }

    if (!evidenciaAntesValida(serviceData, technicianId)) {
        const error = new Error("WORK_BEFORE_EVIDENCE_REQUIRED");
        error.code = "WORK_BEFORE_EVIDENCE_REQUIRED";
        throw error;
    }

    return serviceData;
}

async function descargarEvidenciaAntes(serviceData) {
    const summary = serviceData.trabajo_antes_evidencia;
    let response;

    try {
        response = await fetch(summary.download_url, {
            method: "GET",
            cache: "no-store",
            credentials: "omit"
        });
    } catch (cause) {
        const error = new Error("WORK_BEFORE_DOWNLOAD_FAILED");
        error.code = "WORK_BEFORE_DOWNLOAD_FAILED";
        error.cause = cause;
        throw error;
    }

    if (!response.ok) {
        const error = new Error("WORK_BEFORE_DOWNLOAD_FAILED");
        error.code = "WORK_BEFORE_DOWNLOAD_FAILED";
        error.httpStatus = response.status;
        throw error;
    }

    const blob = await response.blob();
    if (!(blob instanceof Blob) || !String(blob.type || "").startsWith("image/") || blob.size <= 0) {
        const error = new Error("WORK_BEFORE_DOWNLOAD_FAILED");
        error.code = "WORK_BEFORE_DOWNLOAD_FAILED";
        throw error;
    }

    const sha256 = await sha256Blob(blob);
    if (sha256 !== String(summary.sha256 || "").toLowerCase()) {
        const error = new Error("WORK_BEFORE_HASH_MISMATCH");
        error.code = "WORK_BEFORE_HASH_MISMATCH";
        throw error;
    }

    return {
        blob,
        evidenceId: summary.evidence_id,
        eventDocumentId: summary.evidence_event_id,
        eventType: "work_before",
        downloadUrl: summary.download_url,
        storagePath: summary.storage_path,
        fingerprint: {
            sha256,
            perceptual: summary.perceptual_hash
                ? { hex: summary.perceptual_hash }
                : null
        },
        localSha256: sha256,
        payload: {
            capturedAtClient: summary.captured_at_client || null
        }
    };
}

async function guardarConsentimientoCierre({
    serviceId,
    technicianId,
    consent,
    status,
    clockSync = null,
    metadata = null,
    error = null
}) {
    const consentRef = doc(
        db,
        "services",
        serviceId,
        "work_after_consents",
        idSeguro(consent.consentId)
    );

    await setDoc(consentRef, {
        consent_id: consent.consentId,
        actor_uid: technicianId,
        actor_role: "tecnico",
        event_type: "work_after",
        interaction_type: consent.interactionType,
        granted_at_client: consent.grantedAtClient,
        document_visibility: consent.documentVisibilityAtConsent,
        status,
        capture_metadata: metadata,
        error: error ? textoSeguro(error, 240) : null,
        clock_source: clockSync?.source || null,
        clock_quality: clockSync?.quality || null,
        clock_uncertainty_ms: Number.isFinite(clockSync?.uncertaintyMs)
            ? clockSync.uncertaintyMs
            : null,
        bridge_version: B2C_WORK_CLOSE_CHRONOLOGY_BRIDGE_VERSION,
        updated_at: serverTimestamp(),
        created_at: serverTimestamp()
    }, { merge: true });
}

function asignarArchivo(input, blob, filename) {
    if (!(input instanceof HTMLInputElement) || !(blob instanceof Blob)) {
        throw new Error("WORK_EVIDENCE_FILE_ASSIGNMENT_FAILED");
    }

    const file = new File([blob], filename, {
        type: blob.type || "image/jpeg",
        lastModified: Date.now()
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
}

function marcarCampoSeguro(input, label) {
    const container = input?.parentElement;
    if (!container) return;

    input.classList.add("hidden");
    container.querySelector('[data-role="chronology-evidence-badge"]')?.remove();

    const badge = document.createElement("div");
    badge.dataset.role = "chronology-evidence-badge";
    badge.className = "mt-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-2 text-[9px] font-bold text-emerald-300";
    badge.innerHTML = `<i class="fas fa-shield-check"></i> ${label} VERIFICADO Y SELLADO`;
    container.appendChild(badge);
}

function canvasTieneFirma(canvas) {
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) {
        return false;
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;

    for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];

        if (alpha > 0 && (red > 12 || green > 12 || blue > 12)) {
            painted += 1;
            if (painted >= 24) return true;
        }
    }

    return false;
}

function canvasABlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("SIGNATURE_BLOB_FAILED"));
        }, "image/png");
    });
}

function esperarElemento(selector, timeoutMs = 6000) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (!element) return;
            clearTimeout(timeoutId);
            observer.disconnect();
            resolve(element);
        });

        const timeoutId = setTimeout(() => {
            observer.disconnect();
            const error = new Error("LEGACY_EVIDENCE_MODAL_TIMEOUT");
            error.code = "LEGACY_EVIDENCE_MODAL_TIMEOUT";
            reject(error);
        }, timeoutMs);

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}

async function prepararModalLegacy({
    serviceId,
    technicianId,
    serviceData,
    beforeEvidence,
    afterEvidence,
    legacyOpen
}) {
    legacyOpen(serviceId);
    const modal = await esperarElemento("#modalEvidencia");

    const inputBefore = modal.querySelector("#fileA1");
    const inputBeforeOptional = modal.querySelector("#fileA2");
    const inputAfter = modal.querySelector("#fileD1");
    const inputAfterOptional = modal.querySelector("#fileD2");
    const submitButton = modal.querySelector("#btnSubirEvidencia");

    asignarArchivo(
        inputBefore,
        beforeEvidence.blob,
        `${idSeguro(serviceId)}_antes_cronologico.jpg`
    );
    asignarArchivo(
        inputAfter,
        afterEvidence.blob,
        `${idSeguro(serviceId)}_despues_cronologico.jpg`
    );

    [inputBeforeOptional, inputAfterOptional].forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        const transfer = new DataTransfer();
        input.files = transfer.files;
        input.disabled = true;
        input.classList.add("hidden");
        input.parentElement?.classList.add("hidden");
    });

    inputBefore.dataset.b2cChronologyExpectedSha = beforeEvidence.fingerprint.sha256;
    inputAfter.dataset.b2cChronologyExpectedSha =
        afterEvidence.fingerprint?.sha256 || afterEvidence.localSha256;

    marcarCampoSeguro(inputBefore, "ANTES AL INICIAR");
    marcarCampoSeguro(inputAfter, "DESPUÉS AL CERRAR");

    const intro = modal.querySelector("p.text-gray-400");
    if (intro) {
        intro.textContent = "La evidencia ANTES fue recuperada y verificada desde el inicio del trabajo. La evidencia DESPUÉS acaba de capturarse. El cliente debe firmar para continuar.";
    }

    if (!(submitButton instanceof HTMLButtonElement)) {
        throw new Error("LEGACY_EVIDENCE_SUBMIT_MISSING");
    }

    submitButton.addEventListener("click", async (event) => {
        if (submitButton.dataset.b2cChronologyBypass === "true") {
            submitButton.dataset.b2cChronologyBypass = "false";
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        submitButton.disabled = true;
        const originalHtml = submitButton.innerHTML;
        submitButton.innerHTML = '<i class="fas fa-shield-alt fa-spin"></i> VALIDANDO CRONOLOGÍA...';

        try {
            const currentBefore = inputBefore.files?.[0];
            const currentAfter = inputAfter.files?.[0];
            const [beforeSha, afterSha] = await Promise.all([
                sha256Blob(currentBefore),
                sha256Blob(currentAfter)
            ]);

            if (
                beforeSha !== inputBefore.dataset.b2cChronologyExpectedSha ||
                afterSha !== inputAfter.dataset.b2cChronologyExpectedSha
            ) {
                const error = new Error("WORK_EVIDENCE_FILE_CHANGED");
                error.code = "WORK_EVIDENCE_FILE_CHANGED";
                throw error;
            }

            const signatureCanvas = modal.querySelector("#canvasFirma");
            if (!canvasTieneFirma(signatureCanvas)) {
                const error = new Error("CUSTOMER_SIGNATURE_REQUIRED");
                error.code = "CUSTOMER_SIGNATURE_REQUIRED";
                throw error;
            }

            const signatureBlob = await canvasABlob(signatureCanvas);
            const signatureSha = await sha256Blob(signatureBlob);

            await setDoc(
                doc(db, "services", serviceId, "work_evidence_bindings", "current"),
                {
                    service_id: serviceId,
                    technician_id: technicianId,
                    customer_id: serviceData.cliente_id || null,
                    chronology: "before_at_start_after_at_close",
                    before: {
                        evidence_id: beforeEvidence.evidenceId,
                        event_document_id: beforeEvidence.eventDocumentId,
                        sha256: beforeEvidence.fingerprint.sha256,
                        download_url: beforeEvidence.downloadUrl,
                        storage_path: beforeEvidence.storagePath,
                        source: "stored_at_work_start"
                    },
                    after: {
                        evidence_id: afterEvidence.evidenceId,
                        event_document_id: afterEvidence.eventDocumentId,
                        sha256: afterEvidence.fingerprint?.sha256 || afterEvidence.localSha256,
                        download_url: afterEvidence.downloadUrl,
                        storage_path: afterEvidence.storagePath,
                        source: "captured_at_work_close"
                    },
                    signature: {
                        present: true,
                        sha256: signatureSha,
                        content_type: signatureBlob.type,
                        size_bytes: signatureBlob.size,
                        captured_at_client: new Date().toISOString()
                    },
                    legacy_close_compatibility: true,
                    bridge_version: B2C_WORK_CLOSE_CHRONOLOGY_BRIDGE_VERSION,
                    validated_at: serverTimestamp(),
                    updated_at: serverTimestamp()
                },
                { merge: true }
            );

            submitButton.dataset.b2cChronologyBypass = "true";
            submitButton.disabled = false;
            submitButton.innerHTML = originalHtml;
            submitButton.click();
        } catch (error) {
            console.error("[B2C_WORK_CLOSE_FINAL_GATE_ERROR]", error);
            alert(`⚠️ ${mensajeError(error)}`);
            submitButton.disabled = false;
            submitButton.innerHTML = originalHtml;
        }
    }, true);
}

async function crearFlujoCierre({
    serviceId,
    technicianId,
    legacyOpen
}) {
    if (activeFlows.has(serviceId)) return;

    const serviceData = await obtenerServicio({ serviceId, technicianId });
    const beforeEvidence = await descargarEvidenciaAntes(serviceData);

    const suffix = idSeguro(serviceId);
    const modal = document.createElement("div");
    modal.id = `${MODAL_PREFIX}${suffix}`;
    modal.className = "fixed inset-0 bg-black/95 z-[180] flex items-center justify-center p-4 backdrop-blur-sm";
    modal.innerHTML = `
        <div class="bg-zinc-900 w-full max-w-md rounded-3xl border border-emerald-500/40 shadow-2xl overflow-hidden max-h-[95vh] overflow-y-auto">
            <div class="bg-emerald-600/10 border-b border-emerald-500/30 p-5">
                <div class="flex justify-between items-start gap-3">
                    <div>
                        <p class="text-emerald-400 text-[10px] font-black uppercase tracking-widest">Cierre cronológico</p>
                        <h3 class="text-white text-xl font-black mt-1">Captura el resultado DESPUÉS</h3>
                    </div>
                    <button type="button" data-action="close" class="text-gray-500 hover:text-white p-2">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <div class="p-5">
                <div class="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 text-xs text-emerald-300 leading-relaxed">
                    <i class="fas fa-shield-check"></i> Evidencia ANTES recuperada y SHA-256 verificado.
                </div>

                <div data-role="gps-status" class="mt-3 bg-black/60 border border-zinc-700 rounded-xl p-3 text-xs text-gray-300 leading-relaxed">
                    Verificando ubicación para el cierre...
                </div>

                <div class="relative bg-black rounded-2xl overflow-hidden border border-zinc-700 aspect-[3/4] mt-4">
                    <video data-role="video" class="w-full h-full object-cover" autoplay muted playsinline></video>
                    <div data-role="camera-loading" class="absolute inset-0 bg-black flex flex-col items-center justify-center text-gray-400">
                        <i class="fas fa-camera text-3xl mb-3"></i>
                        <p class="text-xs font-bold">ABRIENDO CÁMARA...</p>
                    </div>
                </div>

                <p class="text-gray-500 text-[10px] mt-3 leading-relaxed">
                    Muestra claramente el resultado terminado. Evita rostros, documentos, placas y datos personales innecesarios.
                </p>

                <div data-role="error" class="hidden mt-3 bg-red-950/50 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl"></div>

                <button type="button" data-action="capture" class="w-full mt-5 bg-emerald-500 hover:bg-emerald-400 text-black font-black py-4 rounded-xl text-sm disabled:opacity-40" disabled>
                    <i class="fas fa-camera"></i> AUTORIZAR DESPUÉS 3-2-1
                </button>

                <p class="text-gray-600 text-[9px] mt-3 text-center">
                    Después de la captura se solicitará la firma. Este paso no ejecuta cobros por sí mismo.
                </p>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const videoElement = modal.querySelector('[data-role="video"]');
    const cameraLoading = modal.querySelector('[data-role="camera-loading"]');
    const gpsStatus = modal.querySelector('[data-role="gps-status"]');
    const errorElement = modal.querySelector('[data-role="error"]');
    const captureButton = modal.querySelector('[data-action="capture"]');
    const closeButton = modal.querySelector('[data-action="close"]');

    const flow = {
        modal,
        videoElement,
        busy: false,
        locationResult: null
    };
    activeFlows.set(serviceId, flow);

    const destination = destinoServicio(serviceData);
    const locationPromise = validarLlegadaParaEvidencia({
        destination,
        geoPolicy: GEO_POLICY,
        allowFallback: true
    }).then((result) => {
        flow.locationResult = result;

        if (result.allowCapture !== true) {
            gpsStatus.className = "mt-3 bg-red-950/40 border border-red-500/40 rounded-xl p-3 text-xs text-red-300 leading-relaxed";
            gpsStatus.innerHTML = '<i class="fas fa-location-xmark"></i> Estás fuera del punto confirmado. Acércate antes de cerrar.';
        } else if (result.fallback) {
            gpsStatus.className = "mt-3 bg-yellow-950/30 border border-yellow-500/40 rounded-xl p-3 text-xs text-yellow-300 leading-relaxed";
            gpsStatus.innerHTML = '<i class="fas fa-triangle-exclamation"></i> GPS insuficiente. El cierre quedará marcado para revisión.';
        } else {
            const distance = numeroFinito(result.arrival?.distanceM);
            const accuracy = numeroFinito(result.gps?.accuracyM);
            gpsStatus.className = "mt-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 text-xs text-emerald-300 leading-relaxed";
            gpsStatus.innerHTML = `<i class="fas fa-location-dot"></i> Ubicación verificada${distance !== null ? ` a ${Math.round(distance)} m` : ""}${accuracy !== null ? `, precisión ±${Math.round(accuracy)} m` : ""}.`;
        }

        captureButton.disabled = !(result.allowCapture === true && !flow.busy && videoElement.srcObject);
        return result;
    }).catch((error) => {
        flow.locationResult = {
            allowCapture: true,
            fallback: true,
            gps: null,
            arrival: {
                status: "fallback_required",
                reason: textoSeguro(error?.code || error?.message, 160)
            }
        };
        gpsStatus.className = "mt-3 bg-yellow-950/30 border border-yellow-500/40 rounded-xl p-3 text-xs text-yellow-300 leading-relaxed";
        gpsStatus.innerHTML = '<i class="fas fa-triangle-exclamation"></i> GPS técnico falló. El cierre quedará obligatoriamente para revisión.';
        captureButton.disabled = !(videoElement.srcObject && !flow.busy);
        return flow.locationResult;
    });

    try {
        await abrirCamaraEvidencia({
            videoElement,
            includeAudio: false,
            facingMode: "environment"
        });
        cameraLoading.classList.add("hidden");
        const locationResult = await locationPromise;
        captureButton.disabled = locationResult.allowCapture !== true;
    } catch (error) {
        console.error("[B2C_WORK_AFTER_CAMERA_OPEN_ERROR]", error);
        errorElement.textContent = mensajeError(error);
        errorElement.classList.remove("hidden");
        cameraLoading.innerHTML = `
            <i class="fas fa-camera-slash text-red-400 text-3xl mb-3"></i>
            <p class="text-xs text-red-300 font-bold text-center px-4">No se pudo abrir la cámara. Revisa permisos y vuelve a intentarlo.</p>
        `;
    }

    closeButton.addEventListener("click", () => {
        if (!flow.busy) cerrarFlujo(serviceId);
    });

    captureButton.addEventListener("click", async () => {
        if (flow.busy) return;
        flow.busy = true;
        captureButton.disabled = true;
        closeButton.disabled = true;
        errorElement.classList.add("hidden");

        const consent = crearConsentimientoCaptura({
            serviceId,
            actorUid: technicianId,
            actorRole: "tecnico",
            eventType: "work_after",
            interactionType: "explicit_work_close_capture_tap"
        });

        let clockSync = null;
        let overlayState = null;

        try {
            const locationResult = await locationPromise;
            if (locationResult.allowCapture !== true) {
                const error = new Error("TECHNICIAN_OUTSIDE_GEOFENCE");
                error.code = "TECHNICIAN_OUTSIDE_GEOFENCE";
                throw error;
            }

            clockSync = await sincronizarRelojServidor({
                serviceId,
                actorUid: technicianId,
                actorRole: "tecnico",
                force: true
            });

            await guardarConsentimientoCierre({
                serviceId,
                technicianId,
                consent,
                status: "granted",
                clockSync
            });

            overlayState = crearOverlayCuentaRegresiva(videoElement);
            const assistedResult = await capturaAsistidaConsentida({
                videoElement,
                consent,
                countdownElement: overlayState?.value || null,
                onTick({ state }) {
                    if (!overlayState?.overlay) return;
                    overlayState.overlay.classList.remove("hidden");
                    overlayState.overlay.classList.add("flex");
                    if (state === "captured") {
                        overlayState.overlay.classList.remove("flex");
                        overlayState.overlay.classList.add("hidden");
                    }
                },
                policy: {
                    countdownSeconds: 3,
                    requireVisibleDocument: true
                }
            });

            const consentMetadata = crearMetadatosConsentimientoCaptura(
                assistedResult
            );

            await guardarConsentimientoCierre({
                serviceId,
                technicianId,
                consent,
                status: "captured",
                clockSync,
                metadata: consentMetadata
            });

            captureButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SELLANDO Y VERIFICANDO...';

            const afterEvidence = await capturarYSubirFotoB2C({
                videoElement,
                serviceId,
                technicianId,
                customerId: serviceData.cliente_id || null,
                actorUid: technicianId,
                actorRole: "tecnico",
                eventType: "work_after",
                gps: locationResult.gps || null,
                arrival: locationResult.arrival || null,
                fallbackReason: locationResult.fallback
                    ? textoSeguro(locationResult.arrival?.reason || "gps_fallback", 128)
                    : null,
                policy: {
                    requireInAppCapture: true,
                    photoQuality: 0.9
                }
            });

            if (!afterEvidence?.success) {
                const error = new Error(
                    afterEvidence?.status || "WORK_AFTER_UPLOAD_FAILED"
                );
                error.code = afterEvidence?.status || "WORK_AFTER_UPLOAD_FAILED";
                error.userMessage = afterEvidence?.userMessage;
                throw error;
            }

            const timeSeal = crearSelloTemporalEvidencia({
                serviceData,
                clockSync
            });

            await guardarConsentimientoCierre({
                serviceId,
                technicianId,
                consent,
                status: "captured_and_stored",
                clockSync,
                metadata: {
                    ...consentMetadata,
                    evidence_id: afterEvidence.evidenceId,
                    event_document_id: afterEvidence.eventDocumentId,
                    sha256: afterEvidence.fingerprint?.sha256 || null,
                    time_authority: timeSeal
                }
            });

            await setDoc(doc(db, "services", serviceId), {
                trabajo_despues_evidencia: {
                    status: "stored",
                    event_type: "work_after",
                    actor_uid: technicianId,
                    evidence_event_id: afterEvidence.eventDocumentId,
                    evidence_id: afterEvidence.evidenceId,
                    download_url: afterEvidence.downloadUrl,
                    storage_path: afterEvidence.storagePath,
                    sha256: afterEvidence.fingerprint?.sha256 || null,
                    perceptual_hash: afterEvidence.fingerprint?.perceptual?.hex || null,
                    captured_at_client: afterEvidence.payload?.capturedAtClient || null,
                    sealed_at_server: serverTimestamp(),
                    fallback: locationResult.fallback === true,
                    time_authority: {
                        utc_iso: timeSeal.utcIso || null,
                        local_display: timeSeal.localDisplay || null,
                        timezone: timeSeal.timezone || null,
                        clock_source: timeSeal.clockSource || null,
                        clock_quality: timeSeal.clockQuality || null,
                        uncertainty_ms: Number.isFinite(timeSeal.clockUncertaintyMs)
                            ? timeSeal.clockUncertaintyMs
                            : null
                    },
                    bridge_version: B2C_WORK_CLOSE_CHRONOLOGY_BRIDGE_VERSION
                },
                trabajo_despues_capturado_at: serverTimestamp(),
                trabajo_revision_requerida:
                    locationResult.fallback === true ||
                    serviceData.trabajo_revision_requerida === true
            }, { merge: true });

            cerrarFlujo(serviceId);

            await prepararModalLegacy({
                serviceId,
                technicianId,
                serviceData,
                beforeEvidence,
                afterEvidence,
                legacyOpen
            });
        } catch (error) {
            console.error("[B2C_WORK_AFTER_CAPTURE_ERROR]", error);
            errorElement.textContent = mensajeError(error);
            errorElement.classList.remove("hidden");
            captureButton.innerHTML = '<i class="fas fa-camera"></i> REINTENTAR DESPUÉS 3-2-1';
            captureButton.disabled = false;
            closeButton.disabled = false;
            flow.busy = false;

            try {
                await guardarConsentimientoCierre({
                    serviceId,
                    technicianId,
                    consent,
                    status: "failed",
                    clockSync,
                    error: error?.code || error?.message || "CAPTURE_FAILED"
                });
            } catch (auditError) {
                console.warn("[B2C_WORK_AFTER_CONSENT_AUDIT_WARNING]", auditError);
            }
        } finally {
            overlayState?.overlay?.remove();
        }
    });
}

function instalarWrapper(user) {
    const technicianId = textoSeguro(user?.uid || auth.currentUser?.uid, 128);
    if (!technicianId) return false;

    const candidate = window.abrirEvidenciaGlobal;
    if (typeof candidate !== "function") return false;
    if (candidate[WRAPPED_FLAG] === true) return true;

    // Esperamos el guardia anterior para recuperar directamente el opener legacy.
    if (candidate.__b2cSecureWorkEvidenceGuard !== true) return false;

    const previousGuard = candidate;
    const legacyOpen = candidate.__b2cOriginalOpen || candidate;

    const wrapped = async function (serviceId) {
        const safeServiceId = textoSeguro(serviceId, 180);
        if (!safeServiceId) return;

        try {
            await crearFlujoCierre({
                serviceId: safeServiceId,
                technicianId,
                legacyOpen
            });
        } catch (error) {
            console.error("[B2C_WORK_CLOSE_CHRONOLOGY_OPEN_ERROR]", error);
            alert(`⚠️ ${mensajeError(error)}`);
        }
    };

    wrapped[WRAPPED_FLAG] = true;
    wrapped.__b2cPreviousEvidenceGuard = previousGuard;
    wrapped.__b2cOriginalOpen = legacyOpen;
    window.abrirEvidenciaGlobal = wrapped;
    window.__B2C_WORK_CLOSE_CHRONOLOGY_BRIDGE_VERSION__ =
        B2C_WORK_CLOSE_CHRONOLOGY_BRIDGE_VERSION;

    console.log(
        `[B2C_WORK_CLOSE_CHRONOLOGY_BRIDGE_READY] v${B2C_WORK_CLOSE_CHRONOLOGY_BRIDGE_VERSION}`
    );

    return true;
}

export function instalarPuenteCronologiaCierreTrabajoB2C(user = null) {
    if (window[INSTALL_KEY]?.installed) {
        return window[INSTALL_KEY];
    }

    let attempts = 0;
    const maxAttempts = 100;

    const installation = {
        version: B2C_WORK_CLOSE_CHRONOLOGY_BRIDGE_VERSION,
        installed: false,
        timerId: null,
        uninstall() {
            if (installation.timerId) clearInterval(installation.timerId);
            for (const serviceId of [...activeFlows.keys()]) {
                cerrarFlujo(serviceId);
            }
            const current = window.abrirEvidenciaGlobal;
            if (current?.[WRAPPED_FLAG] === true && current.__b2cPreviousEvidenceGuard) {
                window.abrirEvidenciaGlobal = current.__b2cPreviousEvidenceGuard;
            }
            installation.installed = false;
            delete window[INSTALL_KEY];
        }
    };

    const tryInstall = () => {
        attempts += 1;

        if (instalarWrapper(user)) {
            installation.installed = true;
            if (installation.timerId) clearInterval(installation.timerId);
            installation.timerId = null;
            return;
        }

        if (attempts >= maxAttempts && installation.timerId) {
            clearInterval(installation.timerId);
            installation.timerId = null;
            console.warn("[B2C_WORK_CLOSE_CHRONOLOGY_TIMEOUT] No se encontró el guardia de cierre base.");
        }
    };

    tryInstall();
    if (!installation.installed) {
        installation.timerId = setInterval(tryInstall, 250);
    }

    window[INSTALL_KEY] = installation;
    return installation;
}
