/*
 * ======================================================================================
 * B2C START WORK EVIDENCE GUARD 2026
 * Archivo: b2c-start-work-evidence-guard.js
 * Rol: Capturar work_before en el instante correcto, antes de iniciar la reparación.
 *
 * COBERTURA:
 * - Intercepta únicamente actualizarEstadoGlobal(..., "trabajando").
 * - Vigila servicios que llegan directamente a "trabajando" por aprobación del cliente.
 * - Exige diagnóstico previo, técnico asignado, cámara visible, GPS y consentimiento 3-2-1.
 * - Un rechazo real de geocerca bloquea; una falla técnica GPS permite fallback con revisión.
 * - No calcula precios, no cobra, no mueve fondos y no despliega infraestructura.
 * ======================================================================================
 */

import {
    auth,
    db,
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    collection,
    query,
    where,
    onSnapshot,
    limit
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

import {
    crearConsentimientoCaptura,
    capturaAsistidaConsentida,
    crearMetadatosConsentimientoCaptura
} from "./b2c-consented-auto-capture.js";

import {
    sincronizarRelojServidor,
    crearSelloTemporalEvidencia
} from "./b2c-time-authority.js";

export const B2C_START_WORK_EVIDENCE_GUARD_VERSION = "1.0.0";

const INSTALL_KEY = "__B2C_START_WORK_EVIDENCE_GUARD__";
const WRAPPED_FLAG = "__b2cStartWorkEvidenceGuard";
const MODAL_PREFIX = "b2cStartWorkEvidence_";
const activeFlows = new Map();
const reminders = new Map();

const TERMINAL_STATES = new Set([
    "finalizado",
    "cancelado",
    "cancelled",
    "rechazado",
    "reembolsado",
    "disputed"
]);

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

function idSeguro(value, fallback = "work") {
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

function diagnosticoValido(serviceData, technicianId) {
    const evidence = serviceData?.diagnostico_inicial_evidencia;

    return Boolean(
        evidence &&
        evidence.status === "stored" &&
        evidence.event_type === "diagnostic_before" &&
        textoSeguro(evidence.actor_uid, 128) === technicianId &&
        textoSeguro(evidence.evidence_id, 180) &&
        textoSeguro(evidence.storage_path, 600)
    );
}

function evidenciaAntesValida(serviceData, technicianId) {
    const evidence = serviceData?.trabajo_antes_evidencia;

    return Boolean(
        evidence &&
        evidence.status === "stored" &&
        evidence.event_type === "work_before" &&
        textoSeguro(evidence.actor_uid, 128) === technicianId &&
        textoSeguro(evidence.evidence_id, 180) &&
        textoSeguro(evidence.storage_path, 600) &&
        textoSeguro(evidence.sha256, 128)
    );
}

function mensajeError(error) {
    const code = textoSeguro(error?.code || error?.message, 180);
    const messages = {
        SERVICE_NOT_FOUND: "No se encontró el servicio.",
        TECHNICIAN_ASSIGNMENT_MISSING: "El servicio no tiene un técnico asignado de forma verificable.",
        TECHNICIAN_SERVICE_MISMATCH: "Este servicio pertenece a otro técnico.",
        TERMINAL_SERVICE_STATE: "El servicio ya no permite iniciar trabajo.",
        DIAGNOSTIC_EVIDENCE_REQUIRED: "Primero debe existir el diagnóstico sellado previo a la cotización.",
        CAMERA_STREAM_NOT_ACTIVE: "La cámara dejó de estar disponible. Vuelve a intentarlo.",
        DOCUMENT_NOT_VISIBLE: "Mantén la aplicación visible durante la captura.",
        DOCUMENT_HIDDEN_DURING_CAPTURE: "La captura se canceló porque la aplicación dejó de estar visible.",
        TECHNICIAN_OUTSIDE_GEOFENCE: "Estás fuera del domicilio confirmado. No puedes iniciar la reparación.",
        ARRIVAL_REJECTED: "La ubicación actual no coincide con el destino confirmado."
    };

    return messages[code] ||
        error?.userMessage ||
        "No fue posible registrar la evidencia antes del trabajo. Revisa cámara, GPS y conexión.";
}

function crearOverlayCuentaRegresiva(videoElement) {
    const container = videoElement?.parentElement;
    if (!container) return null;

    container.querySelector('[data-role="start-work-countdown"]')?.remove();

    const overlay = document.createElement("div");
    overlay.dataset.role = "start-work-countdown";
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

function quitarRecordatorio(serviceId) {
    reminders.get(serviceId)?.remove();
    reminders.delete(serviceId);
}

function cerrarFlujo(serviceId, { crearRecordatorio = false } = {}) {
    const flow = activeFlows.get(serviceId);
    if (!flow) return;

    try {
        detenerCamaraEvidencia(flow.videoElement);
    } catch (error) {
        console.warn("[B2C_START_WORK_CAMERA_STOP_WARNING]", error);
    }

    flow.modal?.remove();
    activeFlows.delete(serviceId);

    if (crearRecordatorio && typeof flow.reopen === "function") {
        quitarRecordatorio(serviceId);
        const button = document.createElement("button");
        button.type = "button";
        button.id = `b2cStartWorkReminder_${idSeguro(serviceId)}`;
        button.className = "fixed bottom-5 left-5 z-[145] bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/60 shadow-2xl rounded-full px-4 py-3 text-xs font-black animate-pulse";
        button.innerHTML = '<i class="fas fa-camera"></i> CAPTURAR ANTES PENDIENTE';
        button.addEventListener("click", () => {
            button.remove();
            reminders.delete(serviceId);
            flow.reopen();
        });
        document.body.appendChild(button);
        reminders.set(serviceId, button);
    }
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

    if (TERMINAL_STATES.has(String(serviceData.estado || "").toLowerCase())) {
        const error = new Error("TERMINAL_SERVICE_STATE");
        error.code = "TERMINAL_SERVICE_STATE";
        throw error;
    }

    if (!diagnosticoValido(serviceData, technicianId)) {
        const error = new Error("DIAGNOSTIC_EVIDENCE_REQUIRED");
        error.code = "DIAGNOSTIC_EVIDENCE_REQUIRED";
        throw error;
    }

    return serviceData;
}

async function guardarConsentimientoInicio({
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
        "work_start_consents",
        idSeguro(consent.consentId)
    );

    await setDoc(consentRef, {
        consent_id: consent.consentId,
        actor_uid: technicianId,
        actor_role: "tecnico",
        event_type: "work_before",
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
        guard_version: B2C_START_WORK_EVIDENCE_GUARD_VERSION,
        updated_at: serverTimestamp(),
        created_at: serverTimestamp()
    }, { merge: true });
}

async function vincularEvidenciaAntes({
    serviceId,
    technicianId,
    serviceData,
    evidenceResult,
    locationResult,
    timeSeal
}) {
    const serviceRef = doc(db, "services", serviceId);

    return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(serviceRef);

        if (!snapshot.exists()) {
            throw new Error("SERVICE_NOT_FOUND");
        }

        const current = snapshot.data();
        const assignedTechnician = tecnicoAsignado(current);

        if (!assignedTechnician || assignedTechnician !== technicianId) {
            throw new Error("TECHNICIAN_SERVICE_MISMATCH");
        }

        if (TERMINAL_STATES.has(String(current.estado || "").toLowerCase())) {
            throw new Error("TERMINAL_SERVICE_STATE");
        }

        if (!diagnosticoValido(current, technicianId)) {
            throw new Error("DIAGNOSTIC_EVIDENCE_REQUIRED");
        }

        if (evidenciaAntesValida(current, technicianId)) {
            return {
                stored: false,
                reason: "WORK_BEFORE_ALREADY_STORED",
                evidence: current.trabajo_antes_evidencia
            };
        }

        const gps = locationResult?.gps || null;
        const fallback = locationResult?.fallback === true;
        const summary = {
            status: "stored",
            event_type: "work_before",
            actor_uid: technicianId,
            customer_id: current.cliente_id || serviceData.cliente_id || null,
            evidence_event_id: evidenceResult.eventDocumentId,
            evidence_id: evidenceResult.evidenceId,
            download_url: evidenceResult.downloadUrl,
            storage_path: evidenceResult.storagePath,
            sha256: evidenceResult.fingerprint?.sha256 || null,
            perceptual_hash: evidenceResult.fingerprint?.perceptual?.hex || null,
            captured_at_client: evidenceResult.payload?.capturedAtClient || null,
            sealed_at_server: serverTimestamp(),
            gps_status: locationResult?.arrival?.status || null,
            gps_reason: textoSeguro(locationResult?.arrival?.reason, 160) || null,
            lat: numeroFinito(gps?.lat),
            lng: numeroFinito(gps?.lng),
            precision_m: numeroFinito(gps?.accuracyM),
            distancia_destino_m: numeroFinito(locationResult?.arrival?.distanceM),
            fallback,
            chronology: "captured_before_work_start",
            time_authority: timeSeal
                ? {
                    utc_iso: timeSeal.utcIso || null,
                    local_display: timeSeal.localDisplay || null,
                    timezone: timeSeal.timezone || null,
                    timezone_source: timeSeal.timezoneSource || null,
                    clock_source: timeSeal.clockSource || null,
                    clock_quality: timeSeal.clockQuality || null,
                    uncertainty_ms: Number.isFinite(timeSeal.clockUncertaintyMs)
                        ? timeSeal.clockUncertaintyMs
                        : null
                }
                : null,
            guard_version: B2C_START_WORK_EVIDENCE_GUARD_VERSION
        };

        transaction.update(serviceRef, {
            trabajo_antes_evidencia: summary,
            trabajo_antes_capturado_at: serverTimestamp(),
            trabajo_inicio_evidencia_lista: true,
            trabajo_revision_requerida:
                fallback || current.trabajo_revision_requerida === true,
            trabajo_cronologia_version: B2C_START_WORK_EVIDENCE_GUARD_VERSION
        });

        return {
            stored: true,
            summary
        };
    });
}

async function crearFlujoInicio({
    serviceId,
    technicianId,
    pendingTransition = null,
    automatic = false,
    reopenFactory = null
}) {
    const existing = activeFlows.get(serviceId);
    if (existing) {
        if (pendingTransition) existing.pendingTransition = pendingTransition;
        existing.modal?.classList.remove("hidden");
        return existing.promise;
    }

    quitarRecordatorio(serviceId);
    const serviceData = await obtenerServicio({ serviceId, technicianId });

    if (evidenciaAntesValida(serviceData, technicianId)) {
        if (pendingTransition?.originalFunction) {
            return pendingTransition.originalFunction.apply(
                pendingTransition.originalThis,
                pendingTransition.originalArgs
            );
        }
        return { completed: true, alreadyStored: true };
    }

    const suffix = idSeguro(serviceId);
    const modal = document.createElement("div");
    modal.id = `${MODAL_PREFIX}${suffix}`;
    modal.className = "fixed inset-0 bg-black/95 z-[175] flex items-center justify-center p-4 backdrop-blur-sm";
    modal.innerHTML = `
        <div class="bg-zinc-900 w-full max-w-md rounded-3xl border border-blue-500/40 shadow-2xl overflow-hidden max-h-[95vh] overflow-y-auto">
            <div class="bg-blue-600/10 border-b border-blue-500/30 p-5">
                <div class="flex justify-between items-start gap-3">
                    <div>
                        <p class="text-blue-400 text-[10px] font-black uppercase tracking-widest">Inicio seguro del trabajo</p>
                        <h3 class="text-white text-xl font-black mt-1">Captura el estado ANTES</h3>
                    </div>
                    <button type="button" data-action="close" class="text-gray-500 hover:text-white p-2">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <div class="p-5">
                <div data-role="gps-status" class="bg-black/60 border border-zinc-700 rounded-xl p-3 text-xs text-gray-300 leading-relaxed">
                    La cámara y el GPS se activarán únicamente al autorizar la captura.
                </div>

                <div class="relative bg-black rounded-2xl overflow-hidden border border-zinc-700 aspect-[3/4] mt-4">
                    <video data-role="video" class="w-full h-full object-cover" autoplay muted playsinline></video>
                    <div data-role="camera-loading" class="absolute inset-0 bg-black flex flex-col items-center justify-center text-gray-400">
                        <i class="fas fa-camera text-3xl mb-3"></i>
                        <p class="text-xs font-bold text-center px-4">AUTORIZA PARA MOSTRAR LA CÁMARA</p>
                    </div>
                </div>

                <p class="text-gray-500 text-[10px] mt-3 leading-relaxed">
                    Fotografía el equipo o área exactamente antes de intervenir. Evita rostros, documentos, placas y datos personales innecesarios.
                </p>

                <div data-role="error" class="hidden mt-3 bg-red-950/50 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl"></div>

                <button type="button" data-action="capture" class="w-full mt-5 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-sm disabled:opacity-40">
                    <i class="fas fa-camera"></i> AUTORIZAR Y CAPTURAR ANTES 3-2-1
                </button>

                <p class="text-gray-600 text-[9px] mt-3 text-center">
                    La reparación no queda habilitada hasta almacenar esta evidencia. No se ejecutan cobros desde este paso.
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

    let resolveFlow;
    let rejectFlow;
    const flowPromise = new Promise((resolve, reject) => {
        resolveFlow = resolve;
        rejectFlow = reject;
    });

    const flow = {
        modal,
        videoElement,
        busy: false,
        pendingTransition,
        promise: flowPromise,
        reopen: reopenFactory || (() => {
            crearFlujoInicio({
                serviceId,
                technicianId,
                automatic: true,
                reopenFactory
            }).catch((error) => {
                console.error("[B2C_START_WORK_REOPEN_ERROR]", error);
            });
        })
    };

    activeFlows.set(serviceId, flow);

    const setBusy = (busy) => {
        flow.busy = busy;
        captureButton.disabled = busy;
        closeButton.disabled = busy;
    };

    closeButton.addEventListener("click", () => {
        if (flow.busy) return;
        const shouldRemind = automatic || serviceData.estado === "trabajando";
        cerrarFlujo(serviceId, { crearRecordatorio: shouldRemind });
        resolveFlow({ completed: false, cancelled: true });
    });

    captureButton.addEventListener("click", async () => {
        if (flow.busy) return;
        setBusy(true);
        errorElement.classList.add("hidden");
        captureButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ABRIENDO CÁMARA...';

        const consent = crearConsentimientoCaptura({
            serviceId,
            actorUid: technicianId,
            actorRole: "tecnico",
            eventType: "work_before",
            interactionType: "explicit_start_work_capture_tap"
        });

        let clockSync = null;
        let overlayState = null;

        try {
            await abrirCamaraEvidencia({
                videoElement,
                includeAudio: false,
                facingMode: "environment"
            });
            cameraLoading.classList.add("hidden");

            gpsStatus.innerHTML = '<i class="fas fa-satellite fa-spin text-blue-400"></i> Verificando ubicación y hora servidor...';

            const [locationResult, synchronizedClock] = await Promise.all([
                validarLlegadaParaEvidencia({
                    destination: destinoServicio(serviceData),
                    geoPolicy: GEO_POLICY,
                    allowFallback: true
                }),
                sincronizarRelojServidor({
                    serviceId,
                    actorUid: technicianId,
                    actorRole: "tecnico",
                    force: true
                })
            ]);
            clockSync = synchronizedClock;

            if (locationResult.allowCapture !== true) {
                const error = new Error(locationResult.reason || "TECHNICIAN_OUTSIDE_GEOFENCE");
                error.code = locationResult.reason || "TECHNICIAN_OUTSIDE_GEOFENCE";
                error.userMessage = locationResult.userMessage;
                throw error;
            }

            if (locationResult.fallback) {
                gpsStatus.className = "bg-yellow-950/30 border border-yellow-500/40 rounded-xl p-3 text-xs text-yellow-300 leading-relaxed";
                gpsStatus.innerHTML = '<i class="fas fa-triangle-exclamation"></i> GPS insuficiente. La evidencia quedará marcada para revisión.';
            } else {
                const distance = numeroFinito(locationResult.arrival?.distanceM);
                const accuracy = numeroFinito(locationResult.gps?.accuracyM);
                gpsStatus.className = "bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 text-xs text-emerald-300 leading-relaxed";
                gpsStatus.innerHTML = `<i class="fas fa-location-dot"></i> Ubicación verificada${distance !== null ? ` a ${Math.round(distance)} m` : ""}${accuracy !== null ? `, precisión ±${Math.round(accuracy)} m` : ""}.`;
            }

            await guardarConsentimientoInicio({
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

            await guardarConsentimientoInicio({
                serviceId,
                technicianId,
                consent,
                status: "captured",
                clockSync,
                metadata: consentMetadata
            });

            captureButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SELLANDO Y ALMACENANDO...';

            const evidenceResult = await capturarYSubirFotoB2C({
                videoElement,
                serviceId,
                technicianId,
                customerId: serviceData.cliente_id || null,
                actorUid: technicianId,
                actorRole: "tecnico",
                eventType: "work_before",
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

            if (!evidenceResult?.success) {
                const error = new Error(
                    evidenceResult?.status || "WORK_BEFORE_UPLOAD_FAILED"
                );
                error.code = evidenceResult?.status || "WORK_BEFORE_UPLOAD_FAILED";
                error.userMessage = evidenceResult?.userMessage;
                throw error;
            }

            const timeSeal = crearSelloTemporalEvidencia({
                serviceData,
                clockSync
            });

            await vincularEvidenciaAntes({
                serviceId,
                technicianId,
                serviceData,
                evidenceResult,
                locationResult,
                timeSeal
            });

            await guardarConsentimientoInicio({
                serviceId,
                technicianId,
                consent,
                status: "captured_and_stored",
                clockSync,
                metadata: {
                    ...consentMetadata,
                    evidence_id: evidenceResult.evidenceId,
                    event_document_id: evidenceResult.eventDocumentId,
                    sha256: evidenceResult.fingerprint?.sha256 || null,
                    time_authority: timeSeal
                }
            });

            const transition = flow.pendingTransition;
            cerrarFlujo(serviceId);
            quitarRecordatorio(serviceId);

            if (transition?.originalFunction) {
                await transition.originalFunction.apply(
                    transition.originalThis,
                    transition.originalArgs
                );
            }

            alert("✅ Evidencia ANTES almacenada. La reparación puede comenzar.");
            resolveFlow({
                completed: true,
                evidenceResult
            });
        } catch (error) {
            console.error("[B2C_START_WORK_CAPTURE_ERROR]", error);
            errorElement.textContent = mensajeError(error);
            errorElement.classList.remove("hidden");
            captureButton.innerHTML = '<i class="fas fa-camera"></i> REINTENTAR CAPTURA ANTES 3-2-1';

            try {
                await guardarConsentimientoInicio({
                    serviceId,
                    technicianId,
                    consent,
                    status: "failed",
                    clockSync,
                    error: error?.code || error?.message || "CAPTURE_FAILED"
                });
            } catch (auditError) {
                console.warn("[B2C_START_WORK_CONSENT_AUDIT_WARNING]", auditError);
            }

            try {
                detenerCamaraEvidencia(videoElement);
                cameraLoading.classList.remove("hidden");
            } catch (cameraError) {
                console.warn("[B2C_START_WORK_CAMERA_RESET_WARNING]", cameraError);
            }

            setBusy(false);
        } finally {
            overlayState?.overlay?.remove();
        }
    });

    return flowPromise.catch((error) => {
        rejectFlow?.(error);
        throw error;
    });
}

function instalarWrapper(user) {
    const technicianId = textoSeguro(user?.uid || auth.currentUser?.uid, 128);
    if (!technicianId) return false;

    const candidate = window.actualizarEstadoGlobal;
    if (typeof candidate !== "function") return false;
    if (candidate[WRAPPED_FLAG] === true) return true;

    const originalFunction = candidate;

    const wrapped = async function (...args) {
        const [serviceId, requestedState] = args;

        if (String(requestedState || "") !== "trabajando") {
            return originalFunction.apply(this, args);
        }

        const safeServiceId = textoSeguro(serviceId, 180);
        if (!safeServiceId) return;

        try {
            const serviceData = await obtenerServicio({
                serviceId: safeServiceId,
                technicianId
            });

            if (evidenciaAntesValida(serviceData, technicianId)) {
                return originalFunction.apply(this, args);
            }

            return crearFlujoInicio({
                serviceId: safeServiceId,
                technicianId,
                pendingTransition: {
                    originalFunction,
                    originalThis: this,
                    originalArgs: args
                },
                automatic: false
            });
        } catch (error) {
            console.error("[B2C_START_WORK_TRANSITION_GUARD_ERROR]", error);
            alert(`⚠️ ${mensajeError(error)}`);
            return undefined;
        }
    };

    wrapped[WRAPPED_FLAG] = true;
    wrapped.__b2cOriginalActualizarEstado = originalFunction;
    window.actualizarEstadoGlobal = wrapped;
    return true;
}

function instalarVigilanciaServicios({ technicianId }) {
    const servicesQuery = query(
        collection(db, "services"),
        where("tecnico_id", "==", technicianId),
        limit(50)
    );

    return onSnapshot(
        servicesQuery,
        (snapshot) => {
            snapshot.forEach((serviceSnapshot) => {
                const serviceData = serviceSnapshot.data();
                const serviceId = serviceSnapshot.id;

                if (
                    serviceData.estado === "trabajando" &&
                    diagnosticoValido(serviceData, technicianId) &&
                    !evidenciaAntesValida(serviceData, technicianId)
                ) {
                    if (!activeFlows.has(serviceId) && !reminders.has(serviceId)) {
                        crearFlujoInicio({
                            serviceId,
                            technicianId,
                            automatic: true,
                            reopenFactory: () => {
                                crearFlujoInicio({
                                    serviceId,
                                    technicianId,
                                    automatic: true
                                }).catch((error) => {
                                    console.error("[B2C_START_WORK_AUTOMATIC_REOPEN_ERROR]", error);
                                });
                            }
                        }).catch((error) => {
                            console.error("[B2C_START_WORK_AUTOMATIC_FLOW_ERROR]", error);
                        });
                    }
                } else if (evidenciaAntesValida(serviceData, technicianId)) {
                    quitarRecordatorio(serviceId);
                    if (activeFlows.has(serviceId)) {
                        cerrarFlujo(serviceId);
                    }
                }
            });
        },
        (error) => {
            console.error("[B2C_START_WORK_WATCH_ERROR]", error);
        }
    );
}

export function instalarGuardiaInicioTrabajoB2C(user = null) {
    if (window[INSTALL_KEY]?.installed) {
        return window[INSTALL_KEY];
    }

    const technicianId = textoSeguro(user?.uid || auth.currentUser?.uid, 128);
    if (!technicianId) {
        console.warn("[B2C_START_WORK_GUARD_NOT_INSTALLED] Falta UID técnico.");
        return null;
    }

    let attempts = 0;
    const maxAttempts = 80;

    const installation = {
        version: B2C_START_WORK_EVIDENCE_GUARD_VERSION,
        installed: false,
        timerId: null,
        unsubscribe: null,
        uninstall() {
            if (installation.timerId) clearInterval(installation.timerId);
            installation.unsubscribe?.();
            for (const serviceId of [...activeFlows.keys()]) {
                cerrarFlujo(serviceId);
            }
            for (const serviceId of [...reminders.keys()]) {
                quitarRecordatorio(serviceId);
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

            if (!installation.unsubscribe) {
                installation.unsubscribe = instalarVigilanciaServicios({
                    technicianId
                });
            }

            window.__B2C_START_WORK_EVIDENCE_GUARD_VERSION__ =
                B2C_START_WORK_EVIDENCE_GUARD_VERSION;

            console.log(
                `[B2C_START_WORK_EVIDENCE_GUARD_READY] v${B2C_START_WORK_EVIDENCE_GUARD_VERSION}`
            );
            return;
        }

        if (attempts >= maxAttempts && installation.timerId) {
            clearInterval(installation.timerId);
            installation.timerId = null;
            console.warn("[B2C_START_WORK_GUARD_TIMEOUT] No se encontró actualizarEstadoGlobal.");
        }
    };

    tryInstall();
    if (!installation.installed) {
        installation.timerId = setInterval(tryInstall, 250);
    }

    window[INSTALL_KEY] = installation;
    return installation;
}
