/*
 * ======================================================================================
 * B2C PRE-QUOTE DIAGNOSTIC GUARD 2026
 * Archivo: b2c-prequote-diagnostic-guard.js
 * Rol: Exigir evidencia diagnóstica antes de abrir el cotizador del técnico.
 *
 * PRINCIPIOS:
 * - Envuelve únicamente window.abrirCotizadorGlobal.
 * - No modifica precios, cotizaciones, estados financieros ni aceptación del cliente.
 * - La primera apertura por folio exige cámara visible, consentimiento 3-2-1, GPS y hora servidor.
 * - Una evidencia ya almacenada para el mismo folio/técnico desbloquea aperturas posteriores.
 * - Estar fuera de la geocerca bloquea el diagnóstico; un fallo técnico de GPS permite evidencia
 *   marcada para revisión, nunca una llegada fuerte automática.
 * ======================================================================================
 */

import {
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

import {
    crearConsentimientoCaptura,
    capturaAsistidaConsentida,
    crearMetadatosConsentimientoCaptura
} from "./b2c-consented-auto-capture.js";

import {
    sincronizarRelojServidor,
    crearSelloTemporalEvidencia
} from "./b2c-time-authority.js";

export const B2C_PREQUOTE_DIAGNOSTIC_GUARD_VERSION = "1.0.0";

const INSTALL_KEY = "__B2C_PREQUOTE_DIAGNOSTIC_GUARD__";
const WRAPPED_FLAG = "__b2cPrequoteDiagnosticGuardWrapped";
const MODAL_PREFIX = "b2cPrequoteDiagnostic_";
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

function idSeguro(value, fallback = "diagnostic") {
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

function tecnicoAsignado(serviceData = {}) {
    return textoSeguro(
        serviceData.tecnico_id ||
        serviceData.technician_id ||
        serviceData.pro_id,
        128
    );
}

function evidenciaDiagnosticaValida(serviceData, technicianId) {
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

function mensajeError(error) {
    const code = textoSeguro(error?.code || error?.message, 180);
    const messages = {
        SERVICE_NOT_FOUND: "No se encontró el servicio.",
        TECHNICIAN_ASSIGNMENT_MISSING: "El servicio no tiene un técnico asignado de forma verificable.",
        TECHNICIAN_SERVICE_MISMATCH: "Este servicio pertenece a otro técnico.",
        INVALID_SERVICE_STATE: "El servicio ya no está listo para elaborar diagnóstico.",
        CAMERA_STREAM_NOT_ACTIVE: "La cámara dejó de estar disponible. Vuelve a abrir el flujo.",
        DOCUMENT_NOT_VISIBLE: "Mantén la aplicación visible durante la captura.",
        DOCUMENT_HIDDEN_DURING_CAPTURE: "La captura se canceló porque la aplicación dejó de estar visible.",
        TECHNICIAN_OUTSIDE_GEOFENCE: "Estás fuera del domicilio confirmado. No se puede registrar el diagnóstico.",
        ARRIVAL_REJECTED: "La ubicación actual no coincide con el destino confirmado.",
        CAPTURE_SERVICE_ID_MISSING: "No fue posible identificar el folio del servicio."
    };

    return messages[code] ||
        error?.userMessage ||
        "No fue posible registrar el diagnóstico inicial. Revisa conexión, GPS y cámara.";
}

function crearOverlayCuentaRegresiva(videoElement) {
    const container = videoElement?.parentElement;
    if (!container) return null;

    container.querySelector('[data-role="diagnostic-countdown"]')?.remove();

    const overlay = document.createElement("div");
    overlay.dataset.role = "diagnostic-countdown";
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
        console.warn("[B2C_PREQUOTE_CAMERA_STOP_WARNING]", error);
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

    if (serviceData.estado !== "en_sitio") {
        const error = new Error("INVALID_SERVICE_STATE");
        error.code = "INVALID_SERVICE_STATE";
        throw error;
    }

    return serviceData;
}

async function guardarConsentimientoDiagnostico({
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
        "diagnostic_consents",
        idSeguro(consent.consentId)
    );

    try {
        await setDoc(consentRef, {
            consent_id: consent.consentId,
            actor_uid: technicianId,
            actor_role: "tecnico",
            event_type: "diagnostic_before",
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
            guard_version: B2C_PREQUOTE_DIAGNOSTIC_GUARD_VERSION,
            updated_at: serverTimestamp(),
            created_at: serverTimestamp()
        }, { merge: true });
    } catch (writeError) {
        console.warn("[B2C_PREQUOTE_CONSENT_AUDIT_WARNING]", writeError);
    }
}

async function registrarDiagnosticoEnServicio({
    serviceId,
    technicianId,
    serviceData,
    locationResult,
    evidenceResult,
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

        if (!assignedTechnician) {
            throw new Error("TECHNICIAN_ASSIGNMENT_MISSING");
        }

        if (assignedTechnician !== technicianId) {
            throw new Error("TECHNICIAN_SERVICE_MISMATCH");
        }

        if (current.estado !== "en_sitio") {
            throw new Error("INVALID_SERVICE_STATE");
        }

        if (evidenciaDiagnosticaValida(current, technicianId)) {
            return {
                stored: false,
                reason: "DIAGNOSTIC_ALREADY_STORED"
            };
        }

        const fallback = locationResult?.fallback === true;
        const gps = locationResult?.gps || null;

        transaction.update(serviceRef, {
            diagnostico_inicial_estado: "capturado",
            diagnostico_inicial_at: serverTimestamp(),
            diagnostico_cotizacion_desbloqueada: true,
            diagnostico_revision_requerida: fallback,
            diagnostico_inicial_version: B2C_PREQUOTE_DIAGNOSTIC_GUARD_VERSION,
            diagnostico_inicial_evidencia: {
                status: "stored",
                event_type: "diagnostic_before",
                actor_uid: technicianId,
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
                    : null
            }
        });

        return {
            stored: true,
            fallback
        };
    });
}

function crearModalDiagnostico({
    serviceId,
    serviceData,
    technicianId,
    originalFunction,
    originalThis,
    originalArgs
}) {
    cerrarFlujo(serviceId);

    const suffix = idSeguro(serviceId);
    const modal = document.createElement("div");
    modal.id = `${MODAL_PREFIX}${suffix}`;
    modal.className = "fixed inset-0 bg-black/95 z-[165] flex items-center justify-center p-4 backdrop-blur-sm";
    modal.innerHTML = `
        <div class="bg-zinc-900 w-full max-w-md rounded-3xl border border-blue-500/40 shadow-2xl overflow-hidden max-h-[95vh] overflow-y-auto">
            <div class="bg-blue-600/10 border-b border-blue-500/30 p-5">
                <div class="flex justify-between items-start gap-3">
                    <div>
                        <p class="text-blue-400 text-[10px] font-black uppercase tracking-widest">Diagnóstico inicial</p>
                        <h3 class="text-white text-xl font-black mt-1">Evidencia antes de cotizar</h3>
                    </div>
                    <button type="button" data-action="close" class="text-gray-500 hover:text-white p-2">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <div class="p-5">
                <div data-role="gps-status" class="bg-black/60 border border-zinc-700 rounded-xl p-3 text-xs text-gray-300 leading-relaxed">
                    <i class="fas fa-satellite fa-spin text-blue-400"></i>
                    Verificando ubicación del diagnóstico...
                </div>

                <div class="relative bg-black rounded-2xl overflow-hidden border border-zinc-700 aspect-[3/4] mt-4">
                    <video data-role="video" class="w-full h-full object-cover" autoplay muted playsinline></video>
                    <div data-role="camera-loading" class="absolute inset-0 bg-black flex flex-col items-center justify-center text-gray-400">
                        <i class="fas fa-camera text-3xl mb-3"></i>
                        <p class="text-xs font-bold">ABRIENDO CÁMARA...</p>
                    </div>
                </div>

                <p class="text-gray-500 text-[10px] mt-3 leading-relaxed">
                    Fotografía el equipo, instalación o condición encontrada antes de manipularla. Evita rostros, documentos, placas, pantallas privadas y datos personales innecesarios.
                </p>

                <div data-role="error" class="hidden mt-3 bg-red-950/50 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl"></div>

                <button type="button" data-action="capture" class="w-full mt-5 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-sm disabled:opacity-40" disabled>
                    <i class="fas fa-camera"></i> AUTORIZAR DIAGNÓSTICO 3-2-1
                </button>

                <p class="text-gray-600 text-[9px] mt-3 text-center">
                    Esta evidencia no modifica precios ni ejecuta cobros. Solo desbloquea el cotizador del folio.
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
        locationResult: null,
        cameraReady: false,
        busy: false
    };

    activeFlows.set(serviceId, flow);

    const refreshCaptureAvailability = () => {
        captureButton.disabled = !(
            flow.cameraReady &&
            flow.locationResult?.allowCapture === true &&
            !flow.busy
        );
    };

    const destination = destinoServicio(serviceData);

    const locationPromise = validarLlegadaParaEvidencia({
        destination,
        geoPolicy: GEO_POLICY,
        allowFallback: true
    }).then((result) => {
        flow.locationResult = result;

        if (result.allowCapture !== true) {
            gpsStatus.className = "bg-red-950/40 border border-red-500/40 rounded-xl p-3 text-xs text-red-300 leading-relaxed";
            gpsStatus.innerHTML = '<i class="fas fa-location-xmark"></i> Estás fuera del punto confirmado. Acércate al domicilio antes de diagnosticar.';
        } else if (result.fallback) {
            gpsStatus.className = "bg-yellow-950/30 border border-yellow-500/40 rounded-xl p-3 text-xs text-yellow-300 leading-relaxed";
            gpsStatus.innerHTML = '<i class="fas fa-triangle-exclamation"></i> GPS insuficiente. La foto podrá registrarse, pero quedará marcada para revisión.';
        } else {
            const distance = numeroFinito(result.arrival?.distanceM);
            const accuracy = numeroFinito(result.gps?.accuracyM);
            gpsStatus.className = "bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 text-xs text-emerald-300 leading-relaxed";
            gpsStatus.innerHTML = `<i class="fas fa-location-dot"></i> Ubicación verificada${distance !== null ? ` a ${Math.round(distance)} m` : ""}${accuracy !== null ? `, precisión ±${Math.round(accuracy)} m` : ""}.`;
        }

        refreshCaptureAvailability();
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
        gpsStatus.className = "bg-yellow-950/30 border border-yellow-500/40 rounded-xl p-3 text-xs text-yellow-300 leading-relaxed";
        gpsStatus.innerHTML = '<i class="fas fa-triangle-exclamation"></i> No se pudo completar GPS. La evidencia quedará obligatoriamente para revisión.';
        refreshCaptureAvailability();
        return flow.locationResult;
    });

    abrirCamaraEvidencia({
        videoElement,
        includeAudio: false,
        facingMode: "environment"
    }).then(() => {
        flow.cameraReady = true;
        cameraLoading.classList.add("hidden");
        refreshCaptureAvailability();
    }).catch((error) => {
        flow.cameraReady = false;
        cameraLoading.innerHTML = `
            <i class="fas fa-camera-slash text-red-400 text-3xl mb-3"></i>
            <p class="text-xs text-red-300 font-bold text-center px-4">No se pudo abrir la cámara. Revisa permisos y vuelve a intentarlo.</p>
        `;
        errorElement.textContent = mensajeError(error);
        errorElement.classList.remove("hidden");
        refreshCaptureAvailability();
    });

    closeButton.addEventListener("click", () => {
        if (flow.busy) return;
        cerrarFlujo(serviceId);
    });

    captureButton.addEventListener("click", async () => {
        if (flow.busy) return;

        flow.busy = true;
        refreshCaptureAvailability();
        errorElement.classList.add("hidden");

        const consent = crearConsentimientoCaptura({
            serviceId,
            actorUid: technicianId,
            actorRole: "tecnico",
            eventType: "diagnostic_before",
            interactionType: "explicit_prequote_diagnostic_tap"
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
                actorRole: "tecnico"
            });

            await guardarConsentimientoDiagnostico({
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

            await guardarConsentimientoDiagnostico({
                serviceId,
                technicianId,
                consent,
                status: "captured",
                clockSync,
                metadata: consentMetadata
            });

            captureButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SELLANDO Y VERIFICANDO...';

            const eventType = "diagnostic_before";
            const evidenceResult = await capturarYSubirFotoB2C({
                videoElement,
                serviceId,
                technicianId,
                customerId: serviceData.cliente_id || null,
                actorUid: technicianId,
                actorRole: "tecnico",
                eventType,
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
                    evidenceResult?.status || "DIAGNOSTIC_EVIDENCE_UPLOAD_FAILED"
                );
                error.code = evidenceResult?.status || "DIAGNOSTIC_EVIDENCE_UPLOAD_FAILED";
                error.userMessage = evidenceResult?.userMessage;
                throw error;
            }

            const timeSeal = crearSelloTemporalEvidencia({
                serviceData,
                clockSync
            });

            await registrarDiagnosticoEnServicio({
                serviceId,
                technicianId,
                serviceData,
                locationResult,
                evidenceResult,
                timeSeal
            });

            await guardarConsentimientoDiagnostico({
                serviceId,
                technicianId,
                consent,
                status: "stored",
                clockSync,
                metadata: {
                    ...consentMetadata,
                    evidenceId: evidenceResult.evidenceId,
                    eventDocumentId: evidenceResult.eventDocumentId,
                    storagePath: evidenceResult.storagePath
                }
            });

            overlayState?.overlay?.remove();
            cerrarFlujo(serviceId);

            console.log("[B2C_PREQUOTE_DIAGNOSTIC_STORED]", {
                serviceId,
                evidenceId: evidenceResult.evidenceId,
                fallback: locationResult.fallback === true
            });

            return originalFunction.apply(originalThis, originalArgs);
        } catch (error) {
            overlayState?.overlay?.remove();

            await guardarConsentimientoDiagnostico({
                serviceId,
                technicianId,
                consent,
                status: "failed",
                clockSync,
                error: error?.code || error?.message || "UNKNOWN_ERROR"
            });

            console.error("[B2C_PREQUOTE_DIAGNOSTIC_ERROR]", error);
            errorElement.textContent = mensajeError(error);
            errorElement.classList.remove("hidden");
            captureButton.innerHTML = '<i class="fas fa-camera"></i> REINTENTAR DIAGNÓSTICO 3-2-1';
            flow.busy = false;
            refreshCaptureAvailability();
            return null;
        }
    });

    return modal;
}

async function manejarAperturaCotizador({
    originalFunction,
    originalThis,
    originalArgs,
    technicianId
}) {
    const serviceId = textoSeguro(originalArgs?.[0], 128);

    if (!serviceId) {
        const error = new Error("CAPTURE_SERVICE_ID_MISSING");
        error.code = "CAPTURE_SERVICE_ID_MISSING";
        throw error;
    }

    const active = activeFlows.get(serviceId);
    if (active?.modal?.isConnected) {
        active.modal.classList.remove("hidden");
        return null;
    }

    try {
        const serviceData = await obtenerServicio({
            serviceId,
            technicianId
        });

        if (evidenciaDiagnosticaValida(serviceData, technicianId)) {
            return originalFunction.apply(originalThis, originalArgs);
        }

        return crearModalDiagnostico({
            serviceId,
            serviceData,
            technicianId,
            originalFunction,
            originalThis,
            originalArgs
        });
    } catch (error) {
        console.error("[B2C_PREQUOTE_OPEN_ERROR]", error);
        alert(mensajeError(error));
        return null;
    }
}

function envolverCotizador(technicianId) {
    const current = window.abrirCotizadorGlobal;

    if (typeof current !== "function") return false;
    if (current[WRAPPED_FLAG] === true) return true;

    const wrapped = function(...args) {
        return manejarAperturaCotizador({
            originalFunction: current,
            originalThis: this,
            originalArgs: args,
            technicianId
        });
    };

    Object.defineProperty(wrapped, WRAPPED_FLAG, {
        value: true,
        enumerable: false
    });

    Object.defineProperty(wrapped, "__b2cOriginalCotizador", {
        value: current,
        enumerable: false
    });

    window.abrirCotizadorGlobal = wrapped;
    return true;
}

export function instalarGuardiaDiagnosticoPreCotizacionB2C(user = null) {
    const technicianId = textoSeguro(user?.uid, 128);

    if (!technicianId) {
        console.warn("[B2C_PREQUOTE_GUARD_NOT_INSTALLED] Falta UID del técnico.");
        return null;
    }

    if (window[INSTALL_KEY]?.technicianId === technicianId) {
        return window[INSTALL_KEY];
    }

    let attempts = 0;
    const maxAttempts = 300;

    const timerId = setInterval(() => {
        attempts += 1;

        if (envolverCotizador(technicianId) || attempts >= maxAttempts) {
            clearInterval(timerId);

            if (attempts >= maxAttempts && !window.abrirCotizadorGlobal?.[WRAPPED_FLAG]) {
                console.error("[B2C_PREQUOTE_GUARD_INSTALL_TIMEOUT]");
            }
        }
    }, 100);

    envolverCotizador(technicianId);

    const installation = {
        version: B2C_PREQUOTE_DIAGNOSTIC_GUARD_VERSION,
        technicianId,
        uninstall() {
            clearInterval(timerId);

            const current = window.abrirCotizadorGlobal;
            if (current?.[WRAPPED_FLAG] && current.__b2cOriginalCotizador) {
                window.abrirCotizadorGlobal = current.__b2cOriginalCotizador;
            }

            for (const serviceId of [...activeFlows.keys()]) {
                cerrarFlujo(serviceId);
            }

            delete window[INSTALL_KEY];
        }
    };

    window[INSTALL_KEY] = installation;
    window.__B2C_PREQUOTE_DIAGNOSTIC_GUARD_VERSION__ = B2C_PREQUOTE_DIAGNOSTIC_GUARD_VERSION;

    console.log(
        `[B2C_PREQUOTE_DIAGNOSTIC_GUARD_READY] v${B2C_PREQUOTE_DIAGNOSTIC_GUARD_VERSION}`
    );

    return installation;
}
