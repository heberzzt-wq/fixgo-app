/*
 * ======================================================================================
 * B2C SECURE WORK EVIDENCE GUARD 2026
 * Archivo: b2c-secure-work-evidence-guard.js
 * Rol: Blindar evidencia antes/después y firma sin reescribir panel-tecnico.js.
 *
 * PRINCIPIOS:
 * - Envuelve únicamente window.abrirEvidenciaGlobal.
 * - Conserva la transacción financiera legacy y su flujo de cierre.
 * - Sustituye galería por cámara visible y captura consentida 3-2-1.
 * - Sube evidencia canónica mediante el orquestador antifraude.
 * - Inyecta los mismos blobs sellados en el modal legacy para compatibilidad temporal.
 * - Bloquea sustitución posterior de archivos y firma vacía.
 * - No ejecuta cobros por sí mismo ni despliega infraestructura.
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
    capturarFotoSellada,
    sha256Blob
} from "./b2c-evidence-engine.js";

import {
    procesarYSubirEvidenciaB2C,
    validarLlegadaParaEvidencia,
    B2C_CAPTURE_METHODS
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

export const B2C_SECURE_WORK_EVIDENCE_GUARD_VERSION = "1.0.0";

const INSTALL_KEY = "__B2C_SECURE_WORK_EVIDENCE_GUARD__";
const MODAL_ID = "b2cSecureWorkEvidenceModal";
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

function idSeguro(value, fallback = "evidence") {
    return textoSeguro(value, 180)
        .replace(/[^a-zA-Z0-9_-]/g, "_") || fallback;
}

function numeroFinito(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function destinoServicio(serviceData = {}) {
    const lat = numeroFinito(serviceData?.coords?.lat);
    const lng = numeroFinito(serviceData?.coords?.lng);

    return lat === null || lng === null
        ? null
        : { lat, lng };
}

function mensajeError(error) {
    const code = textoSeguro(error?.code || error?.message, 180);
    const messages = {
        CAMERA_STREAM_NOT_ACTIVE: "La cámara dejó de estar disponible. Vuelve a abrir el flujo.",
        DOCUMENT_NOT_VISIBLE: "Mantén la aplicación visible durante la captura.",
        DOCUMENT_HIDDEN_DURING_CAPTURE: "La captura fue cancelada porque la aplicación dejó de estar visible.",
        TECHNICIAN_OUTSIDE_GEOFENCE: "No puedes registrar evidencia del trabajo fuera del domicilio confirmado.",
        SERVICE_NOT_FOUND: "No se encontró el servicio.",
        TECHNICIAN_SERVICE_MISMATCH: "Este servicio no pertenece al técnico autenticado.",
        INVALID_SERVICE_STATE: "El servicio ya no está en estado de trabajo.",
        WORK_EVIDENCE_FILE_CHANGED: "La evidencia segura fue sustituida. Vuelve a capturarla.",
        CUSTOMER_SIGNATURE_REQUIRED: "La firma del cliente es obligatoria y no puede estar vacía."
    };

    return messages[code] || error?.userMessage || "No fue posible completar la evidencia segura. Intenta nuevamente.";
}

function crearOverlayCuentaRegresiva(videoElement) {
    const container = videoElement?.parentElement;
    if (!container) return null;

    container.querySelector('[data-role="work-countdown"]')?.remove();

    const overlay = document.createElement("div");
    overlay.dataset.role = "work-countdown";
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
    const current = activeFlows.get(serviceId);
    if (!current) return;

    try {
        detenerCamaraEvidencia(current.videoElement);
    } catch (error) {
        console.warn("[B2C_WORK_EVIDENCE_CAMERA_STOP_WARNING]", error);
    }

    current.modal?.remove();
    activeFlows.delete(serviceId);
}

async function obtenerServicio({ serviceId, technicianId }) {
    const snapshot = await getDoc(doc(db, "services", serviceId));

    if (!snapshot.exists()) {
        const error = new Error("SERVICE_NOT_FOUND");
        error.code = "SERVICE_NOT_FOUND";
        throw error;
    }

    const data = snapshot.data();
    const assignedTechnician = textoSeguro(
        data.tecnico_id || data.technician_id || data.pro_id,
        128
    );

    if (assignedTechnician && assignedTechnician !== technicianId) {
        const error = new Error("TECHNICIAN_SERVICE_MISMATCH");
        error.code = "TECHNICIAN_SERVICE_MISMATCH";
        throw error;
    }

    if (data.estado !== "trabajando") {
        const error = new Error("INVALID_SERVICE_STATE");
        error.code = "INVALID_SERVICE_STATE";
        throw error;
    }

    return data;
}

async function guardarConsentimientoTrabajo({
    serviceId,
    actorUid,
    eventType,
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
        "work_evidence_consents",
        idSeguro(consent.consentId)
    );

    await setDoc(consentRef, {
        consent_id: consent.consentId,
        actor_uid: actorUid,
        actor_role: "tecnico",
        event_type: eventType,
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
        guard_version: B2C_SECURE_WORK_EVIDENCE_GUARD_VERSION,
        updated_at: serverTimestamp(),
        created_at: serverTimestamp()
    }, { merge: true });
}

async function capturarEtapa({
    serviceId,
    serviceData,
    technicianId,
    eventType,
    videoElement,
    countdownState,
    statusElement
}) {
    const destination = destinoServicio(serviceData);
    statusElement.textContent = "Validando ubicación y hora del servidor...";

    const [arrivalCheck, clockSync] = await Promise.all([
        validarLlegadaParaEvidencia({
            destination,
            allowFallback: true,
            geoPolicy: GEO_POLICY
        }),
        sincronizarRelojServidor({
            serviceId,
            actorUid: technicianId,
            actorRole: "tecnico",
            force: true
        })
    ]);

    if (!arrivalCheck.allowCapture) {
        const error = new Error(arrivalCheck.reason || "ARRIVAL_REJECTED");
        error.code = arrivalCheck.reason || "ARRIVAL_REJECTED";
        error.userMessage = arrivalCheck.userMessage;
        throw error;
    }

    const consent = crearConsentimientoCaptura({
        serviceId,
        actorUid: technicianId,
        actorRole: "tecnico",
        eventType,
        interactionType: "explicit_work_evidence_button_tap"
    });

    await guardarConsentimientoTrabajo({
        serviceId,
        actorUid: technicianId,
        eventType,
        consent,
        status: "granted",
        clockSync
    });

    countdownState.overlay.classList.remove("hidden");
    countdownState.overlay.classList.add("flex");
    statusElement.textContent = "Mantén la cámara fija. Captura en 3–2–1...";

    try {
        const assisted = await capturaAsistidaConsentida({
            videoElement,
            consent,
            countdownElement: countdownState.value,
            onTick({ state }) {
                if (state === "capturing") {
                    statusElement.textContent = "Sellando evidencia...";
                }
            },
            policy: {
                countdownSeconds: 3,
                consentMaxAgeMs: 60 * 1000,
                imageType: "image/jpeg",
                imageQuality: 0.9,
                requireVisibleDocument: true
            }
        });

        const consentMetadata = crearMetadatosConsentimientoCaptura(assisted);
        const gps = arrivalCheck.gps || null;
        const capture = await capturarFotoSellada({
            videoElement,
            serviceId,
            eventType,
            gps,
            quality: 0.9
        });

        const timeSeal = crearSelloTemporalEvidencia({
            serviceData,
            clockSync
        });

        const result = await procesarYSubirEvidenciaB2C({
            blob: capture.blob,
            serviceId,
            technicianId,
            customerId: serviceData.cliente_id || null,
            actorUid: technicianId,
            actorRole: "tecnico",
            evidenceId: capture.evidenceId,
            eventType,
            captureMethod: B2C_CAPTURE_METHODS.inAppCamera,
            capturedAtClient: capture.capturedAtClient,
            gps: capture.gps,
            arrival: arrivalCheck.arrival,
            media: {
                ...capture.media,
                consent: consentMetadata,
                timeAuthority: timeSeal
            },
            fallbackReason: arrivalCheck.fallback
                ? arrivalCheck.arrival?.reason || "GPS_EVIDENCE_INSUFFICIENT"
                : null,
            policy: {
                requireInAppCapture: true
            }
        });

        if (!result.success) {
            const error = new Error(result.status || "WORK_EVIDENCE_UPLOAD_REJECTED");
            error.code = result.status;
            error.userMessage = result.userMessage;
            throw error;
        }

        await guardarConsentimientoTrabajo({
            serviceId,
            actorUid: technicianId,
            eventType,
            consent,
            status: "captured_and_stored",
            clockSync,
            metadata: {
                ...consentMetadata,
                evidence_id: result.evidenceId,
                event_document_id: result.eventDocumentId,
                sha256: result.fingerprint?.sha256 || capture.sha256,
                time_authority: timeSeal
            }
        });

        return {
            ...result,
            blob: capture.blob,
            localSha256: capture.sha256,
            capture,
            timeSeal,
            arrivalCheck,
            consentMetadata
        };
    } catch (error) {
        try {
            await guardarConsentimientoTrabajo({
                serviceId,
                actorUid: technicianId,
                eventType,
                consent,
                status: "failed",
                clockSync,
                error: error?.code || error?.message || "CAPTURE_FAILED"
            });
        } catch (auditError) {
            console.warn("[B2C_WORK_EVIDENCE_CONSENT_AUDIT_WARNING]", auditError);
        }

        throw error;
    } finally {
        countdownState.overlay.classList.add("hidden");
        countdownState.overlay.classList.remove("flex");
    }
}

function asignarArchivo(input, blob, filename) {
    if (!(input instanceof HTMLInputElement) || !(blob instanceof Blob)) {
        throw new Error("WORK_EVIDENCE_FILE_ASSIGNMENT_FAILED");
    }

    const file = new File(
        [blob],
        filename,
        {
            type: blob.type || "image/jpeg",
            lastModified: Date.now()
        }
    );

    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
}

function marcarCampoSeguro(input, label) {
    const container = input?.parentElement;
    if (!container) return;

    input.classList.add("hidden");
    container.querySelector('[data-role="secure-work-badge"]')?.remove();

    const badge = document.createElement("div");
    badge.dataset.role = "secure-work-badge";
    badge.className = "mt-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-2 text-[9px] font-bold text-emerald-300";
    badge.innerHTML = `<i class="fas fa-shield-check"></i> ${label} CAPTURADA Y SELLADA`;
    container.appendChild(badge);
}

function canvasTieneFirma(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    if (!canvas.width || !canvas.height) return false;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;

    for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) {
            painted += 1;
            if (painted >= 24) return true;
        }
    }

    return false;
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
            reject(new Error("LEGACY_EVIDENCE_MODAL_TIMEOUT"));
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
    originalOpen
}) {
    originalOpen(serviceId);
    const modal = await esperarElemento("#modalEvidencia");

    const inputBefore = modal.querySelector("#fileA1");
    const inputBeforeOptional = modal.querySelector("#fileA2");
    const inputAfter = modal.querySelector("#fileD1");
    const inputAfterOptional = modal.querySelector("#fileD2");
    const submitButton = modal.querySelector("#btnSubirEvidencia");

    asignarArchivo(
        inputBefore,
        beforeEvidence.blob,
        `${idSeguro(serviceId)}_antes_seguro.jpg`
    );
    asignarArchivo(
        inputAfter,
        afterEvidence.blob,
        `${idSeguro(serviceId)}_despues_seguro.jpg`
    );

    [inputBeforeOptional, inputAfterOptional].forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        const transfer = new DataTransfer();
        input.files = transfer.files;
        input.disabled = true;
        input.classList.add("hidden");
        input.parentElement?.classList.add("hidden");
    });

    inputBefore.dataset.b2cSecureExpectedSha = beforeEvidence.fingerprint?.sha256 || beforeEvidence.localSha256;
    inputAfter.dataset.b2cSecureExpectedSha = afterEvidence.fingerprint?.sha256 || afterEvidence.localSha256;
    inputBefore.dataset.b2cSecureLocked = "true";
    inputAfter.dataset.b2cSecureLocked = "true";

    marcarCampoSeguro(inputBefore, "ANTES");
    marcarCampoSeguro(inputAfter, "DESPUÉS");

    const intro = modal.querySelector("p.text-gray-400");
    if (intro) {
        intro.textContent = "Las fotografías antes/después ya fueron capturadas dentro de la app, selladas y verificadas. El cliente debe firmar para continuar.";
    }

    if (!(submitButton instanceof HTMLButtonElement)) {
        throw new Error("LEGACY_EVIDENCE_SUBMIT_MISSING");
    }

    submitButton.addEventListener("click", async (event) => {
        if (submitButton.dataset.b2cSecureBypass === "true") {
            submitButton.dataset.b2cSecureBypass = "false";
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        submitButton.disabled = true;
        const originalHtml = submitButton.innerHTML;
        submitButton.innerHTML = '<i class="fas fa-shield-alt fa-spin"></i> VALIDANDO EVIDENCIA...';

        try {
            const currentBefore = inputBefore.files?.[0];
            const currentAfter = inputAfter.files?.[0];
            const [currentBeforeSha, currentAfterSha] = await Promise.all([
                sha256Blob(currentBefore),
                sha256Blob(currentAfter)
            ]);

            if (
                currentBeforeSha !== inputBefore.dataset.b2cSecureExpectedSha ||
                currentAfterSha !== inputAfter.dataset.b2cSecureExpectedSha
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

            await setDoc(
                doc(db, "services", serviceId, "work_evidence_bindings", "current"),
                {
                    service_id: serviceId,
                    technician_id: technicianId,
                    customer_id: serviceData.cliente_id || null,
                    before: {
                        evidence_id: beforeEvidence.evidenceId,
                        event_document_id: beforeEvidence.eventDocumentId,
                        sha256: beforeEvidence.fingerprint?.sha256 || beforeEvidence.localSha256,
                        download_url: beforeEvidence.downloadUrl,
                        storage_path: beforeEvidence.storagePath
                    },
                    after: {
                        evidence_id: afterEvidence.evidenceId,
                        event_document_id: afterEvidence.eventDocumentId,
                        sha256: afterEvidence.fingerprint?.sha256 || afterEvidence.localSha256,
                        download_url: afterEvidence.downloadUrl,
                        storage_path: afterEvidence.storagePath
                    },
                    signature_present: true,
                    legacy_close_compatibility: true,
                    guard_version: B2C_SECURE_WORK_EVIDENCE_GUARD_VERSION,
                    validated_at: serverTimestamp(),
                    updated_at: serverTimestamp()
                },
                { merge: true }
            );

            submitButton.dataset.b2cSecureBypass = "true";
            submitButton.disabled = false;
            submitButton.innerHTML = originalHtml;
            submitButton.click();
        } catch (error) {
            console.error("[B2C_SECURE_WORK_EVIDENCE_FINAL_GATE_ERROR]", error);
            alert(`⚠️ ${mensajeError(error)}`);
            submitButton.disabled = false;
            submitButton.innerHTML = originalHtml;
        }
    }, true);

    return modal;
}

async function crearFlujoSeguro({
    serviceId,
    technicianId,
    originalOpen
}) {
    if (activeFlows.has(serviceId)) return;

    const serviceData = await obtenerServicio({ serviceId, technicianId });
    document.getElementById(MODAL_ID)?.remove();

    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "fixed inset-0 bg-black/95 z-[170] flex items-center justify-center p-4 backdrop-blur-sm";
    modal.innerHTML = `
        <div class="bg-zinc-900 w-full max-w-md rounded-3xl border border-emerald-500/35 shadow-2xl overflow-hidden max-h-[95vh] overflow-y-auto">
            <div class="bg-emerald-600/10 border-b border-emerald-500/30 p-5">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="text-emerald-400 text-[10px] font-black uppercase tracking-widest">Evidencia segura del trabajo</p>
                        <h3 class="text-white text-xl font-black mt-1">Antes y después obligatorios</h3>
                    </div>
                    <button type="button" data-action="close" class="text-gray-500 hover:text-white p-2">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <div class="p-5">
                <div class="relative bg-black rounded-2xl overflow-hidden border border-zinc-700 aspect-[3/4]">
                    <video data-role="video" class="w-full h-full object-cover" autoplay muted playsinline></video>
                    <div data-role="camera-loading" class="absolute inset-0 bg-black flex flex-col items-center justify-center text-gray-400">
                        <i class="fas fa-camera text-3xl mb-3"></i>
                        <p class="text-xs font-bold">ABRIENDO CÁMARA...</p>
                    </div>
                </div>

                <div data-role="status" class="mt-4 bg-black/60 border border-zinc-700 rounded-xl p-3 text-xs text-gray-300 leading-relaxed">
                    Captura primero el estado previo y después el resultado terminado.
                </div>

                <p class="text-gray-500 text-[10px] mt-3 leading-relaxed">
                    Evita rostros, documentos, placas y datos personales innecesarios. Las imágenes quedan ligadas al folio, GPS, hora servidor y huella antifraude.
                </p>

                <div data-role="error" class="hidden mt-3 bg-red-950/50 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl"></div>

                <div class="grid gap-3 mt-5">
                    <button type="button" data-action="before" class="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-sm disabled:opacity-40" disabled>
                        <i class="fas fa-camera"></i> CAPTURAR ANTES 3-2-1
                    </button>
                    <button type="button" data-action="after" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-sm disabled:opacity-40" disabled>
                        <i class="fas fa-camera"></i> CAPTURAR DESPUÉS 3-2-1
                    </button>
                    <button type="button" data-action="continue" class="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-4 rounded-xl text-sm disabled:opacity-40" disabled>
                        <i class="fas fa-signature"></i> CONTINUAR A FIRMA Y CIERRE
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const videoElement = modal.querySelector('[data-role="video"]');
    const cameraLoading = modal.querySelector('[data-role="camera-loading"]');
    const statusElement = modal.querySelector('[data-role="status"]');
    const errorElement = modal.querySelector('[data-role="error"]');
    const beforeButton = modal.querySelector('[data-action="before"]');
    const afterButton = modal.querySelector('[data-action="after"]');
    const continueButton = modal.querySelector('[data-action="continue"]');
    const closeButton = modal.querySelector('[data-action="close"]');
    const countdownState = crearOverlayCuentaRegresiva(videoElement);

    const state = {
        modal,
        videoElement,
        serviceData,
        beforeEvidence: null,
        afterEvidence: null,
        busy: false
    };
    activeFlows.set(serviceId, state);

    const setBusy = (busy) => {
        state.busy = busy;
        beforeButton.disabled = busy;
        afterButton.disabled = busy || !state.beforeEvidence;
        continueButton.disabled = busy || !state.beforeEvidence || !state.afterEvidence;
        closeButton.disabled = busy;
    };

    const showError = (error) => {
        errorElement.textContent = mensajeError(error);
        errorElement.classList.remove("hidden");
    };

    try {
        await abrirCamaraEvidencia({
            videoElement,
            includeAudio: false,
            facingMode: "environment"
        });
        cameraLoading.classList.add("hidden");
        beforeButton.disabled = false;
    } catch (error) {
        console.error("[B2C_WORK_EVIDENCE_CAMERA_OPEN_ERROR]", error);
        showError(error);
        statusElement.textContent = "No fue posible abrir la cámara. Revisa permisos y vuelve a intentar.";
    }

    beforeButton.addEventListener("click", async () => {
        if (state.busy) return;
        setBusy(true);
        errorElement.classList.add("hidden");

        try {
            state.beforeEvidence = await capturarEtapa({
                serviceId,
                serviceData,
                technicianId,
                eventType: "work_before",
                videoElement,
                countdownState,
                statusElement
            });
            beforeButton.innerHTML = '<i class="fas fa-check"></i> ANTES CAPTURADO — REPETIR';
            statusElement.textContent = "Evidencia ANTES almacenada. Ahora muestra claramente el trabajo terminado.";
        } catch (error) {
            console.error("[B2C_WORK_BEFORE_CAPTURE_ERROR]", error);
            showError(error);
        } finally {
            setBusy(false);
        }
    });

    afterButton.addEventListener("click", async () => {
        if (state.busy || !state.beforeEvidence) return;
        setBusy(true);
        errorElement.classList.add("hidden");

        try {
            state.afterEvidence = await capturarEtapa({
                serviceId,
                serviceData,
                technicianId,
                eventType: "work_after",
                videoElement,
                countdownState,
                statusElement
            });
            afterButton.innerHTML = '<i class="fas fa-check"></i> DESPUÉS CAPTURADO — REPETIR';
            statusElement.textContent = "Ambas evidencias están selladas. Continúa para obtener la firma del cliente.";
        } catch (error) {
            console.error("[B2C_WORK_AFTER_CAPTURE_ERROR]", error);
            showError(error);
        } finally {
            setBusy(false);
        }
    });

    continueButton.addEventListener("click", async () => {
        if (state.busy || !state.beforeEvidence || !state.afterEvidence) return;
        setBusy(true);
        errorElement.classList.add("hidden");

        const beforeEvidence = state.beforeEvidence;
        const afterEvidence = state.afterEvidence;
        cerrarFlujo(serviceId);

        try {
            await prepararModalLegacy({
                serviceId,
                technicianId,
                serviceData,
                beforeEvidence,
                afterEvidence,
                originalOpen
            });
        } catch (error) {
            console.error("[B2C_WORK_EVIDENCE_LEGACY_BRIDGE_ERROR]", error);
            alert(`⚠️ ${mensajeError(error)}`);
        }
    });

    closeButton.addEventListener("click", () => {
        if (!state.busy) cerrarFlujo(serviceId);
    });
}

function instalarWrapper(user) {
    const technicianId = textoSeguro(user?.uid || auth.currentUser?.uid, 128);
    if (!technicianId) return false;

    const candidate = window.abrirEvidenciaGlobal;
    if (typeof candidate !== "function") return false;
    if (candidate.__b2cSecureWorkEvidenceGuard === true) return true;

    const originalOpen = candidate.bind(window);

    const wrapped = async (serviceId) => {
        const safeServiceId = textoSeguro(serviceId, 180);
        if (!safeServiceId) return;

        try {
            await crearFlujoSeguro({
                serviceId: safeServiceId,
                technicianId,
                originalOpen
            });
        } catch (error) {
            console.error("[B2C_SECURE_WORK_EVIDENCE_OPEN_ERROR]", error);
            alert(`⚠️ ${mensajeError(error)}`);
        }
    };

    wrapped.__b2cSecureWorkEvidenceGuard = true;
    wrapped.__b2cOriginalOpen = originalOpen;
    window.abrirEvidenciaGlobal = wrapped;
    window.__B2C_SECURE_WORK_EVIDENCE_GUARD_VERSION__ = B2C_SECURE_WORK_EVIDENCE_GUARD_VERSION;

    console.log(
        `[B2C_SECURE_WORK_EVIDENCE_GUARD_READY] v${B2C_SECURE_WORK_EVIDENCE_GUARD_VERSION}`
    );

    return true;
}

export function instalarGuardiaEvidenciaTrabajoB2C(user = null) {
    if (window[INSTALL_KEY]?.installed) {
        return window[INSTALL_KEY];
    }

    let attempts = 0;
    const maxAttempts = 80;

    const installation = {
        version: B2C_SECURE_WORK_EVIDENCE_GUARD_VERSION,
        installed: false,
        timerId: null,
        uninstall() {
            if (installation.timerId) clearInterval(installation.timerId);
            for (const serviceId of [...activeFlows.keys()]) {
                cerrarFlujo(serviceId);
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
            console.warn("[B2C_SECURE_WORK_EVIDENCE_GUARD_TIMEOUT] No se encontró abrirEvidenciaGlobal.");
        }
    };

    tryInstall();
    if (!installation.installed) {
        installation.timerId = setInterval(tryInstall, 250);
    }

    window[INSTALL_KEY] = installation;
    return installation;
}
