/*
 * ======================================================================================
 * B2C CLIENT ARRIVAL DISPUTE EVIDENCE 2026
 * Archivo: b2c-client-arrival-dispute-evidence.js
 * Rol: Permitir al cliente disputar una llegada con GPS, foto 3-2-1 y hora servidor.
 *
 * ALCANCE:
 * - Intercepta únicamente “EL TÉCNICO NO ESTÁ AQUÍ”.
 * - Obtiene varias lecturas GPS y compara al cliente con el destino del servicio.
 * - Solicita cámara visible y consentimiento explícito con cuenta 3-2-1.
 * - Sube una foto sellada y deduplicada cuando la cámara está disponible.
 * - Permite un reporte sin foto cuando el dispositivo no puede usar cámara.
 * - Toda disputa queda para revisión y NO ejecuta cobros ni mueve fondos.
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
    detenerCamaraEvidencia,
    validarLlegadaRobusta
} from "./b2c-evidence-engine.js";

import {
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

export const B2C_CLIENT_DISPUTE_EVIDENCE_VERSION = "1.0.0";

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

const instalaciones = new Map();
const flujosActivos = new Map();
const CLIENT_MODAL_SELECTOR = '[id^="b2cClientArrival_"]';
const DISPUTE_BUTTON_SELECTOR = `${CLIENT_MODAL_SELECTOR} [data-action="dispute"]`;

function textoSeguro(value, maxLength = 180) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function idSeguro(value) {
    return textoSeguro(value, 160)
        .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function numeroFinito(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function serviceIdDesdeModal(modal) {
    const prefix = "b2cClientArrival_";
    const modalId = textoSeguro(modal?.id, 220);
    return modalId.startsWith(prefix)
        ? modalId.slice(prefix.length)
        : null;
}

function destinoServicio(serviceData) {
    const lat = numeroFinito(serviceData?.coords?.lat);
    const lng = numeroFinito(serviceData?.coords?.lng);

    return lat === null || lng === null
        ? null
        : { lat, lng };
}

function descripcionGPS(arrival) {
    const status = arrival?.status || "unknown";
    const distance = numeroFinito(arrival?.distanceM);
    const accuracy = numeroFinito(arrival?.gps?.bestReading?.accuracyM);

    if (status === "verified") {
        return {
            level: "strong",
            title: "Ubicación del cliente verificada",
            detail: `Estás dentro del punto del servicio${distance !== null ? ` a ${Math.round(distance)} m` : ""}${accuracy !== null ? `, precisión ±${Math.round(accuracy)} m` : ""}.`
        };
    }

    if (status === "rejected") {
        return {
            level: "weak",
            title: "Tu ubicación no coincide con el destino",
            detail: `La disputa será aceptada para revisión, pero tu presencia en el lugar no queda comprobada${distance !== null ? `; distancia aproximada ${Math.round(distance)} m` : ""}.`
        };
    }

    return {
        level: "medium",
        title: "GPS insuficiente",
        detail: "Puedes aportar fotografía, pero el caso quedará marcado para revisión porque la ubicación no pudo comprobarse con fuerza."
    };
}

function crearOverlayCuentaRegresiva(videoElement) {
    const container = videoElement?.parentElement;
    if (!container) return null;

    container.querySelector('[data-role="client-dispute-countdown"]')?.remove();

    const overlay = document.createElement("div");
    overlay.dataset.role = "client-dispute-countdown";
    overlay.className = "absolute inset-0 hidden items-center justify-center bg-black/45 backdrop-blur-[1px] z-20 pointer-events-none";
    overlay.innerHTML = `
        <div class="w-24 h-24 rounded-full bg-black/75 border-2 border-white/70 flex items-center justify-center shadow-2xl">
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
    const current = flujosActivos.get(serviceId);
    if (!current) return;

    try {
        detenerCamaraEvidencia(current.videoElement);
    } catch (error) {
        console.warn("[B2C_CLIENT_DISPUTE_CAMERA_STOP_WARNING]", error);
    }

    current.modal?.remove();
    flujosActivos.delete(serviceId);
}

async function obtenerServicio({ serviceId, customerId }) {
    const serviceRef = doc(db, "services", serviceId);
    const snapshot = await getDoc(serviceRef);

    if (!snapshot.exists()) {
        throw new Error("SERVICE_NOT_FOUND");
    }

    const serviceData = snapshot.data();

    if (String(serviceData.cliente_id || "") !== String(customerId)) {
        throw new Error("CUSTOMER_SERVICE_MISMATCH");
    }

    if (serviceData.estado !== "en_sitio") {
        throw new Error(`INVALID_SERVICE_STATE_${serviceData.estado || "unknown"}`);
    }

    if ((serviceData.llegada_cliente_respuesta || "pendiente") !== "pendiente") {
        throw new Error("ARRIVAL_ALREADY_ANSWERED");
    }

    return serviceData;
}

async function guardarConsentimiento({
    serviceId,
    customerId,
    consent,
    status,
    metadata = null,
    error = null,
    clockSync = null
}) {
    const consentRef = doc(
        db,
        "services",
        serviceId,
        "client_dispute_consents",
        idSeguro(consent.consentId)
    );

    await setDoc(consentRef, {
        consent_id: consent.consentId,
        customer_id: customerId,
        event_type: "customer_arrival_dispute",
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
        version: B2C_CLIENT_DISPUTE_EVIDENCE_VERSION,
        updated_at: serverTimestamp(),
        created_at: serverTimestamp()
    }, { merge: true });
}

async function registrarDisputa({
    serviceId,
    customerId,
    serviceData,
    arrival,
    evidenceResult = null,
    timeSeal = null,
    reason,
    mediaStatus
}) {
    const serviceRef = doc(db, "services", serviceId);

    return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(serviceRef);

        if (!snapshot.exists()) {
            throw new Error("SERVICE_NOT_FOUND");
        }

        const current = snapshot.data();

        if (String(current.cliente_id || "") !== String(customerId)) {
            throw new Error("CUSTOMER_SERVICE_MISMATCH");
        }

        if (current.estado !== "en_sitio") {
            throw new Error(`INVALID_SERVICE_STATE_${current.estado || "unknown"}`);
        }

        if ((current.llegada_cliente_respuesta || "pendiente") !== "pendiente") {
            return {
                accepted: false,
                reason: "ARRIVAL_ALREADY_ANSWERED",
                currentResponse: current.llegada_cliente_respuesta
            };
        }

        const gps = arrival?.gps?.bestReading || null;
        const gpsStatus = arrival?.status || "unknown";
        const evidenceStrength = gpsStatus === "verified" && evidenceResult?.success
            ? "strong"
            : evidenceResult?.success
                ? "medium"
                : "weak";

        transaction.update(serviceRef, {
            llegada_cliente_respuesta: "ubicacion_disputada",
            llegada_cliente_respuesta_at: serverTimestamp(),
            llegada_notificacion_estado: "disputada",
            llegada_revision_requerida: true,
            llegada_resolucion_automatica_bloqueada: true,
            llegada_disputa_cliente: {
                motivo: textoSeguro(reason, 180),
                creada_at: serverTimestamp(),
                version: B2C_CLIENT_DISPUTE_EVIDENCE_VERSION,
                media_status: mediaStatus,
                evidence_strength: evidenceStrength,
                customer_presence_verified: gpsStatus === "verified",
                gps_status: gpsStatus,
                gps_reason: textoSeguro(arrival?.reason, 160) || null,
                cliente_lat: numeroFinito(gps?.lat),
                cliente_lng: numeroFinito(gps?.lng),
                precision_m: numeroFinito(gps?.accuracyM),
                distancia_destino_m: numeroFinito(arrival?.distanceM),
                destino_lat: numeroFinito(arrival?.destination?.lat) ?? numeroFinito(serviceData?.coords?.lat),
                destino_lng: numeroFinito(arrival?.destination?.lng) ?? numeroFinito(serviceData?.coords?.lng),
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
                evidencia: evidenceResult?.success
                    ? {
                        evidence_event_id: evidenceResult.eventDocumentId,
                        evidence_id: evidenceResult.evidenceId,
                        event_type: evidenceResult.eventType,
                        download_url: evidenceResult.downloadUrl,
                        storage_path: evidenceResult.storagePath,
                        sha256: evidenceResult.fingerprint?.sha256 || null,
                        perceptual_hash: evidenceResult.fingerprint?.perceptual?.hex || null,
                        captured_at_client: evidenceResult.payload?.capturedAtClient || null,
                        sealed_at_server: serverTimestamp()
                    }
                    : null
            }
        });

        return {
            accepted: true,
            evidenceStrength
        };
    });
}

function crearModalDisputa({ serviceId, serviceData, customerId, sourceModal }) {
    cerrarFlujo(serviceId);

    const suffix = idSeguro(serviceId);
    const modal = document.createElement("div");
    modal.id = `b2cClientDisputeEvidence_${suffix}`;
    modal.className = "fixed inset-0 bg-black/95 z-[160] flex items-center justify-center p-4 backdrop-blur-sm";
    modal.innerHTML = `
        <div class="bg-zinc-900 w-full max-w-md rounded-3xl border border-red-500/40 shadow-2xl overflow-hidden max-h-[95vh] overflow-y-auto">
            <div class="bg-red-600/10 border-b border-red-500/30 p-5">
                <div class="flex justify-between items-start gap-3">
                    <div>
                        <p class="text-red-400 text-[10px] font-black uppercase tracking-widest">Disputa de llegada</p>
                        <h3 class="text-white text-xl font-black mt-1">Aporta evidencia del lugar</h3>
                    </div>
                    <button type="button" data-action="close" class="text-gray-500 hover:text-white p-2">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <div class="p-5">
                <div data-role="gps-status" class="bg-black/60 border border-zinc-700 rounded-xl p-3 text-xs text-gray-300 leading-relaxed">
                    <i class="fas fa-satellite fa-spin text-blue-400"></i>
                    Comprobando tu ubicación...
                </div>

                <div class="relative bg-black rounded-2xl overflow-hidden border border-zinc-700 aspect-[3/4] mt-4">
                    <video data-role="video" class="w-full h-full object-cover" autoplay muted playsinline></video>
                    <div data-role="camera-loading" class="absolute inset-0 bg-black flex flex-col items-center justify-center text-gray-400">
                        <i class="fas fa-camera text-3xl mb-3"></i>
                        <p class="text-xs font-bold">ABRIENDO CÁMARA...</p>
                    </div>
                </div>

                <p class="text-gray-500 text-[10px] mt-3 leading-relaxed">
                    Fotografía el acceso o el área donde debería encontrarse el técnico. Evita rostros, interiores, documentos, placas y datos personales innecesarios.
                </p>

                <div data-role="error" class="hidden mt-3 bg-red-950/50 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl"></div>

                <button type="button" data-action="capture" class="w-full mt-5 bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-sm disabled:opacity-40" disabled>
                    <i class="fas fa-camera"></i> AUTORIZAR FOTO 3-2-1
                </button>

                <button type="button" data-action="fallback" class="w-full mt-3 text-yellow-300 border border-yellow-500/30 bg-yellow-950/20 py-3 rounded-xl text-[10px] font-bold">
                    NO PUEDO USAR LA CÁMARA — REPORTAR PARA REVISIÓN
                </button>

                <p class="text-gray-600 text-[9px] mt-3 text-center">
                    Ninguna opción ejecuta cargos ni mueve fondos desde este dispositivo.
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
    const fallbackButton = modal.querySelector('[data-action="fallback"]');
    const closeButton = modal.querySelector('[data-action="close"]');

    const destination = destinoServicio(serviceData);
    const arrivalPromise = validarLlegadaRobusta({
        destino: destination,
        policy: GEO_POLICY
    }).catch((error) => ({
        status: "fallback_required",
        verified: false,
        reason: error?.code || error?.message || "GPS_VALIDATION_FAILED"
    }));

    arrivalPromise.then((arrival) => {
        const description = descripcionGPS(arrival);
        const icon = description.level === "strong"
            ? "fa-circle-check text-emerald-400"
            : description.level === "weak"
                ? "fa-triangle-exclamation text-red-400"
                : "fa-circle-info text-yellow-400";

        gpsStatus.innerHTML = `
            <div class="flex gap-2 items-start">
                <i class="fas ${icon} mt-0.5"></i>
                <div>
                    <p class="text-white font-bold">${description.title}</p>
                    <p class="text-gray-400 mt-1">${description.detail}</p>
                </div>
            </div>
        `;
    });

    abrirCamaraEvidencia({
        videoElement,
        facingMode: "environment",
        includeAudio: false
    })
        .then(() => {
            cameraLoading.classList.add("hidden");
            captureButton.disabled = false;
        })
        .catch((error) => {
            console.warn("[B2C_CLIENT_DISPUTE_CAMERA_UNAVAILABLE]", error);
            cameraLoading.innerHTML = `
                <i class="fas fa-camera-slash text-red-400 text-3xl mb-3"></i>
                <p class="text-xs font-bold text-red-300">CÁMARA NO DISPONIBLE</p>
                <p class="text-[10px] text-gray-500 mt-2 px-5 text-center">Puedes reportar para revisión sin foto.</p>
            `;
            errorElement.textContent = "No fue posible abrir la cámara. La disputa todavía puede registrarse como evidencia débil para revisión.";
            errorElement.classList.remove("hidden");
        });

    closeButton.addEventListener("click", () => {
        cerrarFlujo(serviceId);
        sourceModal?.classList.remove("hidden");
    });

    fallbackButton.addEventListener("click", async () => {
        if (!confirm("¿Registrar la disputa sin fotografía? Se detendrá la resolución automática, pero la evidencia quedará marcada como débil y requerirá revisión.")) {
            return;
        }

        fallbackButton.disabled = true;
        captureButton.disabled = true;
        errorElement.classList.add("hidden");

        try {
            const [arrival, clockSync] = await Promise.all([
                arrivalPromise,
                sincronizarRelojServidor({
                    serviceId,
                    actorUid: customerId,
                    actorRole: "cliente"
                })
            ]);

            const timeSeal = crearSelloTemporalEvidencia({
                serviceData,
                clockSync
            });

            const result = await registrarDisputa({
                serviceId,
                customerId,
                serviceData,
                arrival,
                evidenceResult: null,
                timeSeal,
                reason: "cliente_reporta_tecnico_no_visible_sin_camara",
                mediaStatus: "camera_unavailable_or_declined"
            });

            if (!result.accepted) {
                cerrarFlujo(serviceId);
                return;
            }

            cerrarFlujo(serviceId);
            sourceModal?.remove();
            alert("⚠️ Disputa registrada para revisión. No se aportó fotografía y no se ejecutó ningún cargo.");
        } catch (error) {
            console.error("[B2C_CLIENT_DISPUTE_FALLBACK_ERROR]", error);
            errorElement.textContent = "No se pudo registrar la disputa. Revisa conexión y vuelve a intentarlo.";
            errorElement.classList.remove("hidden");
            fallbackButton.disabled = false;
            captureButton.disabled = false;
        }
    });

    captureButton.addEventListener("click", async () => {
        captureButton.disabled = true;
        fallbackButton.disabled = true;
        errorElement.classList.add("hidden");

        const consent = crearConsentimientoCaptura({
            serviceId,
            actorUid: customerId,
            actorRole: "cliente",
            eventType: "customer_arrival_dispute",
            interactionType: "explicit_client_dispute_capture_tap"
        });

        let clockSync = null;
        const overlayState = crearOverlayCuentaRegresiva(videoElement);

        try {
            clockSync = await sincronizarRelojServidor({
                serviceId,
                actorUid: customerId,
                actorRole: "cliente"
            });

            await guardarConsentimiento({
                serviceId,
                customerId,
                consent,
                status: "granted",
                clockSync
            });

            overlayState?.overlay?.classList.remove("hidden");
            overlayState?.overlay?.classList.add("flex");
            captureButton.innerHTML = '<i class="fas fa-hourglass-half"></i> MANTÉN EL ENCUADRE...';

            const assistedResult = await capturaAsistidaConsentida({
                videoElement,
                consent,
                countdownElement: overlayState?.value || null,
                policy: {
                    countdownSeconds: 3,
                    requireVisibleDocument: true,
                    imageQuality: 0.9
                }
            });

            const consentMetadata = crearMetadatosConsentimientoCaptura(
                assistedResult
            );

            await guardarConsentimiento({
                serviceId,
                customerId,
                consent,
                status: "countdown_completed",
                metadata: consentMetadata,
                clockSync
            });

            overlayState?.overlay?.remove();
            captureButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SELLANDO Y VALIDANDO...';

            const arrival = await arrivalPromise;
            const gps = arrival?.gps?.bestReading || null;

            const evidenceResult = await capturarYSubirFotoB2C({
                videoElement,
                serviceId,
                technicianId: serviceData.tecnico_id || customerId,
                customerId,
                actorUid: customerId,
                actorRole: "cliente",
                eventType: "customer_arrival_dispute",
                gps,
                arrival,
                fallbackReason: arrival?.status === "verified"
                    ? null
                    : arrival?.reason || "CUSTOMER_LOCATION_UNVERIFIED",
                policy: {
                    geo: GEO_POLICY,
                    requireInAppCapture: true,
                    photoQuality: 0.9
                }
            });

            if (!evidenceResult.success) {
                throw new Error(
                    evidenceResult.userMessage ||
                    evidenceResult.reason ||
                    "CLIENT_DISPUTE_EVIDENCE_REJECTED"
                );
            }

            const timeSeal = crearSelloTemporalEvidencia({
                serviceData,
                clockSync
            });

            const disputeResult = await registrarDisputa({
                serviceId,
                customerId,
                serviceData,
                arrival,
                evidenceResult,
                timeSeal,
                reason: "cliente_reporta_tecnico_no_visible_con_evidencia",
                mediaStatus: "photo_stored"
            });

            await guardarConsentimiento({
                serviceId,
                customerId,
                consent,
                status: "evidence_stored",
                metadata: {
                    ...consentMetadata,
                    evidenceId: evidenceResult.evidenceId,
                    evidenceEventId: evidenceResult.eventDocumentId
                },
                clockSync
            });

            if (!disputeResult.accepted) {
                cerrarFlujo(serviceId);
                return;
            }

            cerrarFlujo(serviceId);
            sourceModal?.remove();
            alert("✅ Disputa registrada con GPS, fotografía sellada, hora servidor y huella antifraude. El caso quedó en revisión.");
        } catch (error) {
            overlayState?.overlay?.remove();

            try {
                await guardarConsentimiento({
                    serviceId,
                    customerId,
                    consent,
                    status: "failed",
                    error: error?.code || error?.message || String(error),
                    clockSync
                });
            } catch (auditError) {
                console.warn("[B2C_CLIENT_DISPUTE_AUDIT_FAILURE]", auditError);
            }

            console.error("[B2C_CLIENT_DISPUTE_CAPTURE_ERROR]", error);
            errorElement.textContent = "No se pudo almacenar la evidencia. Puedes reintentar la foto o registrar la disputa para revisión sin cámara.";
            errorElement.classList.remove("hidden");
            captureButton.disabled = false;
            fallbackButton.disabled = false;
            captureButton.innerHTML = '<i class="fas fa-redo"></i> REINTENTAR FOTO 3-2-1';
        }
    });

    flujosActivos.set(serviceId, {
        modal,
        videoElement,
        sourceModal
    });

    sourceModal?.classList.add("hidden");
    return modal;
}

export function instalarEvidenciaDisputaLlegadaClienteB2C(user = null) {
    const customerId = textoSeguro(
        user?.uid || auth.currentUser?.uid,
        128
    );

    if (!customerId) {
        console.warn("[B2C_CLIENT_DISPUTE_NOT_INSTALLED] Falta UID de cliente.");
        return null;
    }

    if (instalaciones.has(customerId)) {
        return instalaciones.get(customerId);
    }

    const clickListener = async (event) => {
        const button = event.target?.closest?.(DISPUTE_BUTTON_SELECTOR);
        if (!button) return;

        const sourceModal = button.closest(CLIENT_MODAL_SELECTOR);
        const serviceId = serviceIdDesdeModal(sourceModal);

        if (!sourceModal || !serviceId) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (button.dataset.b2cClientDisputeBusy === "true") return;
        button.dataset.b2cClientDisputeBusy = "true";
        const originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PREPARANDO EVIDENCIA...';

        try {
            const serviceData = await obtenerServicio({
                serviceId,
                customerId
            });

            crearModalDisputa({
                serviceId,
                serviceData,
                customerId,
                sourceModal
            });
        } catch (error) {
            console.error("[B2C_CLIENT_DISPUTE_PRECHECK_ERROR]", error);

            if (error?.message === "ARRIVAL_ALREADY_ANSWERED") {
                sourceModal?.remove();
                return;
            }

            button.disabled = false;
            button.dataset.b2cClientDisputeBusy = "false";
            button.innerHTML = originalHtml;
            alert("No fue posible iniciar la evidencia de disputa. La respuesta no fue registrada; revisa conexión y vuelve a intentarlo.");
        }
    };

    document.addEventListener("click", clickListener, true);

    const installation = {
        version: B2C_CLIENT_DISPUTE_EVIDENCE_VERSION,
        uninstall() {
            document.removeEventListener("click", clickListener, true);
            instalaciones.delete(customerId);
        }
    };

    instalaciones.set(customerId, installation);
    window.__B2C_CLIENT_DISPUTE_EVIDENCE_VERSION__ = B2C_CLIENT_DISPUTE_EVIDENCE_VERSION;

    console.log(
        `[B2C_CLIENT_DISPUTE_EVIDENCE_READY] v${B2C_CLIENT_DISPUTE_EVIDENCE_VERSION}`
    );

    return installation;
}
