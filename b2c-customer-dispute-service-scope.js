/*
 * ======================================================================================
 * B2C CUSTOMER DISPUTE SERVICE-SCOPED EVIDENCE 2026
 * Archivo: b2c-customer-dispute-service-scope.js
 * Rol: Registrar la disputa del cliente sin consultar el historial global del técnico.
 *
 * PRINCIPIOS:
 * - Intercepta únicamente “EL TÉCNICO NO ESTÁ AQUÍ”.
 * - Usa GPS, cámara visible, consentimiento 3-2-1, hora servidor y SHA-256.
 * - Reserva la huella únicamente dentro del folio del cliente.
 * - No lee ni escribe b2c_evidence_hashes, b2c_evidence_fingerprints o auditoría global.
 * - Marca dedup_backend_pending=true para revisión antifraude posterior en backend.
 * - No ejecuta cargos, no mueve fondos y no resuelve la disputa automáticamente.
 * ======================================================================================
 */

import {
    auth,
    db,
    storage,
    doc,
    getDoc,
    collection,
    serverTimestamp
} from "./firebase.js";

import {
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL,
    getMetadata
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

import {
    abrirCamaraEvidencia,
    detenerCamaraEvidencia,
    validarLlegadaRobusta,
    capturarFotoSellada,
    validarArchivoMedia
} from "./b2c-evidence-engine.js";

import {
    generarHuellaEvidencia
} from "./b2c-evidence-dedup.js";

import {
    crearConsentimientoCaptura,
    capturaAsistidaConsentida,
    crearMetadatosConsentimientoCaptura
} from "./b2c-consented-auto-capture.js";

import {
    sincronizarRelojServidor,
    crearSelloTemporalEvidencia
} from "./b2c-time-authority.js";

export const B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE_VERSION = "1.0.0";

const INSTALL_KEY = "__B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE__";
const SOURCE_MODAL_SELECTOR = '[id^="b2cClientArrival_"]';
const DISPUTE_BUTTON_SELECTOR = `${SOURCE_MODAL_SELECTOR} [data-action="dispute"]`;
const FLOW_MODAL_PREFIX = "b2cCustomerDisputeScoped_";
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

function serviceIdDesdeModal(modal) {
    const id = textoSeguro(modal?.id, 240);
    const prefix = "b2cClientArrival_";
    return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

function destinoServicio(serviceData = {}) {
    const lat = numeroFinito(serviceData?.coords?.lat);
    const lng = numeroFinito(serviceData?.coords?.lng);
    return lat === null || lng === null ? null : { lat, lng };
}

function extensionPorTipo(contentType) {
    const normalized = String(contentType || "").toLowerCase();
    const extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
    };
    return extensions[normalized] || "bin";
}

function mensajeError(error) {
    const code = textoSeguro(error?.code || error?.message, 180);
    const messages = {
        SERVICE_NOT_FOUND: "No se encontró el servicio.",
        CUSTOMER_SERVICE_MISMATCH: "Este servicio no pertenece a tu cuenta.",
        INVALID_SERVICE_STATE: "La llegada ya no está disponible para disputa.",
        ARRIVAL_ALREADY_ANSWERED: "La llegada ya fue respondida desde otro dispositivo.",
        CAMERA_STREAM_NOT_ACTIVE: "La cámara dejó de estar disponible.",
        DOCUMENT_NOT_VISIBLE: "Mantén la aplicación visible durante la captura.",
        DOCUMENT_HIDDEN_DURING_CAPTURE: "La captura se canceló porque la aplicación dejó de estar visible.",
        CUSTOMER_EVIDENCE_MEDIA_INVALID: "La fotografía no cumple el formato o tamaño permitido.",
        CUSTOMER_EVIDENCE_HASH_MISMATCH: "La fotografía cambió durante el proceso. Vuelve a capturarla."
    };
    return messages[code] || error?.userMessage ||
        "No fue posible registrar la disputa. Revisa conexión, GPS y permisos.";
}

function crearOverlayCuentaRegresiva(videoElement) {
    const container = videoElement?.parentElement;
    if (!container) return null;

    container.querySelector('[data-role="customer-scoped-countdown"]')?.remove();

    const overlay = document.createElement("div");
    overlay.dataset.role = "customer-scoped-countdown";
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
        console.warn("[B2C_CUSTOMER_SCOPED_CAMERA_STOP_WARNING]", error);
    }

    flow.modal?.remove();
    activeFlows.delete(serviceId);
}

async function obtenerServicio({ serviceId, customerId }) {
    const snapshot = await getDoc(doc(db, "services", serviceId));

    if (!snapshot.exists()) {
        const error = new Error("SERVICE_NOT_FOUND");
        error.code = "SERVICE_NOT_FOUND";
        throw error;
    }

    const serviceData = snapshot.data();

    if (String(serviceData.cliente_id || "") !== String(customerId)) {
        const error = new Error("CUSTOMER_SERVICE_MISMATCH");
        error.code = "CUSTOMER_SERVICE_MISMATCH";
        throw error;
    }

    if (serviceData.estado !== "en_sitio") {
        const error = new Error("INVALID_SERVICE_STATE");
        error.code = "INVALID_SERVICE_STATE";
        throw error;
    }

    if ((serviceData.llegada_cliente_respuesta || "pendiente") !== "pendiente") {
        const error = new Error("ARRIVAL_ALREADY_ANSWERED");
        error.code = "ARRIVAL_ALREADY_ANSWERED";
        throw error;
    }

    return serviceData;
}

function crearRutaStorage({ serviceId, customerId, evidenceId, contentType }) {
    return [
        "b2c_customer_evidence",
        idSeguro(serviceId, "service"),
        idSeguro(customerId, "customer"),
        "arrival_dispute",
        `${idSeguro(evidenceId)}.${extensionPorTipo(contentType)}`
    ].join("/");
}

function describirGPS(arrival) {
    const status = arrival?.status || "unknown";
    const distance = numeroFinito(arrival?.distanceM);
    const accuracy = numeroFinito(arrival?.gps?.bestReading?.accuracyM);

    if (status === "verified") {
        return {
            strength: "strong",
            className: "bg-emerald-950/30 border border-emerald-500/40 text-emerald-300",
            html: `<i class="fas fa-location-dot"></i> Ubicación del cliente verificada${distance !== null ? ` a ${Math.round(distance)} m` : ""}${accuracy !== null ? `, precisión ±${Math.round(accuracy)} m` : ""}.`
        };
    }

    if (status === "rejected") {
        return {
            strength: "weak",
            className: "bg-yellow-950/30 border border-yellow-500/40 text-yellow-300",
            html: `<i class="fas fa-triangle-exclamation"></i> Tu ubicación no coincide con el destino${distance !== null ? `; distancia aproximada ${Math.round(distance)} m` : ""}. La disputa se registrará para revisión.`
        };
    }

    return {
        strength: "medium",
        className: "bg-yellow-950/30 border border-yellow-500/40 text-yellow-300",
        html: '<i class="fas fa-triangle-exclamation"></i> GPS insuficiente. La fotografía y la hora quedarán registradas para revisión.'
    };
}

async function reservarHashLocal({
    serviceId,
    customerId,
    evidenceId,
    fingerprint
}) {
    const hashId = `sha256_${fingerprint.sha256}`;
    const hashRef = doc(
        db,
        "services",
        serviceId,
        "customer_evidence_hashes",
        hashId
    );

    return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(hashRef);

        if (snapshot.exists()) {
            const current = snapshot.data();
            if (String(current.customer_id || "") !== String(customerId)) {
                throw new Error("CUSTOMER_EVIDENCE_HASH_OWNERSHIP_MISMATCH");
            }

            transaction.update(hashRef, {
                retry_count: Number(current.retry_count || 0) + 1,
                last_seen_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });

            return {
                hashRef,
                state: current.state || "reserved",
                sameServiceRetry: true
            };
        }

        transaction.set(hashRef, {
            sha256: fingerprint.sha256,
            perceptual_hash: fingerprint.perceptual?.hex || null,
            customer_id: customerId,
            evidence_id: evidenceId,
            state: "reserved",
            scope: "service_only",
            retry_count: 0,
            dedup_backend_pending: true,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        });

        return {
            hashRef,
            state: "reserved",
            sameServiceRetry: false
        };
    });
}

async function marcarHashLocalFallido(hashRef, reason) {
    if (!hashRef) return;

    try {
        await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(hashRef);
            if (!snapshot.exists()) return;
            transaction.update(hashRef, {
                state: "upload_failed",
                failure_reason: textoSeguro(reason, 180),
                failed_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });
        });
    } catch (error) {
        console.warn("[B2C_CUSTOMER_SCOPED_HASH_FAILURE_MARK_WARNING]", error);
    }
}

async function registrarDisputaConFoto({
    serviceId,
    customerId,
    serviceData,
    arrival,
    capture,
    fingerprint,
    consentMetadata,
    timeSeal
}) {
    const mediaValidation = validarArchivoMedia(capture.blob);
    if (!mediaValidation.valid) {
        const error = new Error("CUSTOMER_EVIDENCE_MEDIA_INVALID");
        error.code = "CUSTOMER_EVIDENCE_MEDIA_INVALID";
        throw error;
    }

    if (capture.sha256 && capture.sha256 !== fingerprint.sha256) {
        const error = new Error("CUSTOMER_EVIDENCE_HASH_MISMATCH");
        error.code = "CUSTOMER_EVIDENCE_HASH_MISMATCH";
        throw error;
    }

    const reservation = await reservarHashLocal({
        serviceId,
        customerId,
        evidenceId: capture.evidenceId,
        fingerprint
    });

    const storagePath = crearRutaStorage({
        serviceId,
        customerId,
        evidenceId: capture.evidenceId,
        contentType: capture.blob.type
    });

    try {
        const storageRef = ref(storage, storagePath);
        const uploadResult = await uploadBytes(storageRef, capture.blob, {
            contentType: capture.blob.type || "image/jpeg",
            customMetadata: {
                serviceId,
                actorUid: customerId,
                actorRole: "cliente",
                eventType: "customer_arrival_dispute",
                evidenceId: capture.evidenceId,
                sha256: fingerprint.sha256,
                perceptualHash: fingerprint.perceptual?.hex || "",
                dedupScope: "service_only",
                dedupBackendPending: "true",
                moduleVersion: B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE_VERSION
            }
        });

        const [downloadUrl, storageMetadata] = await Promise.all([
            getDownloadURL(uploadResult.ref),
            getMetadata(uploadResult.ref)
        ]);

        const serviceRef = doc(db, "services", serviceId);
        const eventRef = doc(collection(db, "services", serviceId, "evidence_events"));
        const gps = arrival?.gps?.bestReading || null;
        const gpsDescription = describirGPS(arrival);

        const result = await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(serviceRef);

            if (!snapshot.exists()) throw new Error("SERVICE_NOT_FOUND");
            const current = snapshot.data();

            if (String(current.cliente_id || "") !== String(customerId)) {
                throw new Error("CUSTOMER_SERVICE_MISMATCH");
            }
            if (current.estado !== "en_sitio") {
                throw new Error("INVALID_SERVICE_STATE");
            }
            if ((current.llegada_cliente_respuesta || "pendiente") !== "pendiente") {
                return {
                    accepted: false,
                    reason: "ARRIVAL_ALREADY_ANSWERED"
                };
            }

            transaction.set(eventRef, {
                service_id: serviceId,
                evidence_id: capture.evidenceId,
                event_type: "customer_arrival_dispute",
                actor_uid: customerId,
                actor_role: "cliente",
                captured_at_client: capture.capturedAtClient,
                captured_at_server: serverTimestamp(),
                gps: {
                    status: arrival?.status || "unknown",
                    reason: textoSeguro(arrival?.reason, 160) || null,
                    lat: numeroFinito(gps?.lat),
                    lng: numeroFinito(gps?.lng),
                    accuracy_m: numeroFinito(gps?.accuracyM),
                    distance_to_destination_m: numeroFinito(arrival?.distanceM)
                },
                media: {
                    kind: mediaValidation.kind,
                    content_type: storageMetadata.contentType || capture.blob.type,
                    size_bytes: Number(storageMetadata.size) || capture.blob.size,
                    capture_method: "in_app_camera",
                    consent: consentMetadata
                },
                fingerprint: {
                    sha256: fingerprint.sha256,
                    perceptual_hash: fingerprint.perceptual?.hex || null,
                    perceptual_algorithm: fingerprint.perceptual?.algorithm || null,
                    scope: "service_only",
                    dedup_backend_pending: true
                },
                storage: {
                    path: storagePath,
                    download_url: downloadUrl,
                    generation: storageMetadata.generation || null
                },
                time_authority: timeSeal,
                review_required: true,
                module_version: B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE_VERSION,
                created_at: serverTimestamp()
            });

            transaction.update(reservation.hashRef, {
                state: "active",
                storage_path: storagePath,
                storage_generation: storageMetadata.generation || null,
                confirmed_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });

            transaction.update(serviceRef, {
                llegada_cliente_respuesta: "ubicacion_disputada",
                llegada_cliente_respuesta_at: serverTimestamp(),
                llegada_notificacion_estado: "disputada",
                llegada_revision_requerida: true,
                llegada_resolucion_automatica_bloqueada: true,
                llegada_disputa_cliente: {
                    motivo: "cliente_reporta_tecnico_no_visible_en_destino",
                    creada_at: serverTimestamp(),
                    version: B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE_VERSION,
                    media_status: "photo_stored",
                    evidence_strength: gpsDescription.strength,
                    customer_presence_verified: arrival?.status === "verified",
                    gps_status: arrival?.status || "unknown",
                    gps_reason: textoSeguro(arrival?.reason, 160) || null,
                    cliente_lat: numeroFinito(gps?.lat),
                    cliente_lng: numeroFinito(gps?.lng),
                    precision_m: numeroFinito(gps?.accuracyM),
                    distancia_destino_m: numeroFinito(arrival?.distanceM),
                    dedup_scope: "service_only",
                    dedup_backend_pending: true,
                    evidencia: {
                        event_document_id: eventRef.id,
                        evidence_id: capture.evidenceId,
                        download_url: downloadUrl,
                        storage_path: storagePath,
                        sha256: fingerprint.sha256,
                        perceptual_hash: fingerprint.perceptual?.hex || null,
                        sealed_at_server: serverTimestamp()
                    },
                    time_authority: timeSeal
                }
            });

            return {
                accepted: true,
                eventDocumentId: eventRef.id,
                downloadUrl
            };
        });

        return result;
    } catch (error) {
        await marcarHashLocalFallido(
            reservation.hashRef,
            error?.code || error?.message || "UPLOAD_OR_TRANSACTION_FAILED"
        );
        throw error;
    }
}

async function registrarDisputaSinFoto({
    serviceId,
    customerId,
    arrival,
    timeSeal
}) {
    const serviceRef = doc(db, "services", serviceId);
    const eventRef = doc(collection(db, "services", serviceId, "evidence_events"));
    const gps = arrival?.gps?.bestReading || null;

    return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(serviceRef);
        if (!snapshot.exists()) throw new Error("SERVICE_NOT_FOUND");

        const current = snapshot.data();
        if (String(current.cliente_id || "") !== String(customerId)) {
            throw new Error("CUSTOMER_SERVICE_MISMATCH");
        }
        if (current.estado !== "en_sitio") {
            throw new Error("INVALID_SERVICE_STATE");
        }
        if ((current.llegada_cliente_respuesta || "pendiente") !== "pendiente") {
            return { accepted: false, reason: "ARRIVAL_ALREADY_ANSWERED" };
        }

        transaction.set(eventRef, {
            service_id: serviceId,
            event_type: "customer_arrival_dispute",
            actor_uid: customerId,
            actor_role: "cliente",
            captured_at_server: serverTimestamp(),
            gps: {
                status: arrival?.status || "unknown",
                reason: textoSeguro(arrival?.reason, 160) || null,
                lat: numeroFinito(gps?.lat),
                lng: numeroFinito(gps?.lng),
                accuracy_m: numeroFinito(gps?.accuracyM),
                distance_to_destination_m: numeroFinito(arrival?.distanceM)
            },
            media: {
                status: "camera_unavailable_or_declined"
            },
            fingerprint: {
                scope: "none",
                dedup_backend_pending: true
            },
            time_authority: timeSeal,
            review_required: true,
            module_version: B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE_VERSION,
            created_at: serverTimestamp()
        });

        transaction.update(serviceRef, {
            llegada_cliente_respuesta: "ubicacion_disputada",
            llegada_cliente_respuesta_at: serverTimestamp(),
            llegada_notificacion_estado: "disputada",
            llegada_revision_requerida: true,
            llegada_resolucion_automatica_bloqueada: true,
            llegada_disputa_cliente: {
                motivo: "cliente_reporta_tecnico_no_visible_sin_camara",
                creada_at: serverTimestamp(),
                version: B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE_VERSION,
                media_status: "no_photo",
                evidence_strength: "weak",
                customer_presence_verified: arrival?.status === "verified",
                gps_status: arrival?.status || "unknown",
                gps_reason: textoSeguro(arrival?.reason, 160) || null,
                cliente_lat: numeroFinito(gps?.lat),
                cliente_lng: numeroFinito(gps?.lng),
                precision_m: numeroFinito(gps?.accuracyM),
                distancia_destino_m: numeroFinito(arrival?.distanceM),
                dedup_scope: "none",
                dedup_backend_pending: true,
                evidence_event_id: eventRef.id,
                time_authority: timeSeal
            }
        });

        return { accepted: true, eventDocumentId: eventRef.id };
    });
}

function crearModalFlujo({
    serviceId,
    customerId,
    serviceData,
    sourceModal
}) {
    cerrarFlujo(serviceId);

    const modal = document.createElement("div");
    modal.id = `${FLOW_MODAL_PREFIX}${idSeguro(serviceId)}`;
    modal.className = "fixed inset-0 bg-black/95 z-[175] flex items-center justify-center p-4 backdrop-blur-sm";
    modal.innerHTML = `
        <div class="bg-zinc-900 w-full max-w-md rounded-3xl border border-red-500/40 shadow-2xl overflow-hidden max-h-[95vh] overflow-y-auto">
            <div class="bg-red-600/10 border-b border-red-500/30 p-5">
                <div class="flex justify-between items-start gap-3">
                    <div>
                        <p class="text-red-400 text-[10px] font-black uppercase tracking-widest">Disputa protegida</p>
                        <h3 class="text-white text-xl font-black mt-1">El técnico no está aquí</h3>
                    </div>
                    <button type="button" data-action="close" class="text-gray-500 hover:text-white p-2">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <div class="p-5">
                <div data-role="gps-status" class="bg-black/60 border border-zinc-700 rounded-xl p-3 text-xs text-gray-300 leading-relaxed">
                    <i class="fas fa-satellite fa-spin text-blue-400"></i> Comprobando tu ubicación...
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
                    La huella queda confinada a este folio. La revisión global se realizará en backend y ninguna opción mueve fondos.
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

    const flow = {
        modal,
        videoElement,
        sourceModal,
        arrival: null,
        cameraReady: false,
        busy: false
    };
    activeFlows.set(serviceId, flow);

    const refreshButtons = () => {
        captureButton.disabled = !(flow.cameraReady && flow.arrival && !flow.busy);
        fallbackButton.disabled = flow.busy;
        closeButton.disabled = flow.busy;
    };

    const destination = destinoServicio(serviceData);

    const arrivalPromise = validarLlegadaRobusta({
        destino: destination,
        policy: GEO_POLICY
    }).catch((error) => ({
        status: "fallback_required",
        reason: textoSeguro(error?.code || error?.message, 160),
        gps: null,
        destination
    })).then((arrival) => {
        flow.arrival = arrival;
        const description = describirGPS(arrival);
        gpsStatus.className = `${description.className} rounded-xl p-3 text-xs leading-relaxed`;
        gpsStatus.innerHTML = description.html;
        refreshButtons();
        return arrival;
    });

    abrirCamaraEvidencia({
        videoElement,
        includeAudio: false,
        facingMode: "environment"
    }).then(() => {
        flow.cameraReady = true;
        cameraLoading.classList.add("hidden");
        refreshButtons();
    }).catch((error) => {
        flow.cameraReady = false;
        cameraLoading.innerHTML = `
            <i class="fas fa-camera-slash text-red-400 text-3xl mb-3"></i>
            <p class="text-xs text-red-300 font-bold text-center px-4">No se pudo abrir la cámara. Puedes reportar para revisión sin fotografía.</p>
        `;
        console.warn("[B2C_CUSTOMER_SCOPED_CAMERA_OPEN_WARNING]", error);
        refreshButtons();
    });

    closeButton.addEventListener("click", () => {
        if (!flow.busy) cerrarFlujo(serviceId);
    });

    captureButton.addEventListener("click", async () => {
        if (flow.busy) return;
        flow.busy = true;
        refreshButtons();
        errorElement.classList.add("hidden");

        let overlayState = null;

        try {
            const arrival = await arrivalPromise;
            const clockSync = await sincronizarRelojServidor({
                serviceId,
                actorUid: customerId,
                actorRole: "cliente",
                force: true
            });

            const consent = crearConsentimientoCaptura({
                serviceId,
                actorUid: customerId,
                actorRole: "cliente",
                eventType: "customer_arrival_dispute",
                interactionType: "explicit_customer_dispute_photo_tap"
            });

            overlayState = crearOverlayCuentaRegresiva(videoElement);
            const assisted = await capturaAsistidaConsentida({
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
                    requireVisibleDocument: true,
                    imageType: "image/jpeg",
                    imageQuality: 0.9
                }
            });

            const consentMetadata = crearMetadatosConsentimientoCaptura(assisted);
            const capture = await capturarFotoSellada({
                videoElement,
                serviceId,
                eventType: "customer_arrival_dispute",
                gps: arrival?.gps?.bestReading || null,
                quality: 0.9
            });
            const fingerprint = await generarHuellaEvidencia(capture.blob);
            const timeSeal = crearSelloTemporalEvidencia({
                serviceData,
                clockSync
            });

            captureButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> REGISTRANDO DISPUTA...';

            const result = await registrarDisputaConFoto({
                serviceId,
                customerId,
                serviceData,
                arrival,
                capture,
                fingerprint,
                consentMetadata,
                timeSeal
            });

            if (!result.accepted && result.reason === "ARRIVAL_ALREADY_ANSWERED") {
                cerrarFlujo(serviceId);
                sourceModal?.remove();
                return;
            }

            cerrarFlujo(serviceId);
            sourceModal?.remove();
            alert("⚠️ Disputa registrada con fotografía, GPS y hora servidor. El caso quedó bloqueado para revisión; no se movieron fondos.");
        } catch (error) {
            console.error("[B2C_CUSTOMER_SCOPED_CAPTURE_ERROR]", error);
            errorElement.textContent = mensajeError(error);
            errorElement.classList.remove("hidden");
            captureButton.innerHTML = '<i class="fas fa-camera"></i> REINTENTAR FOTO 3-2-1';
            flow.busy = false;
            refreshButtons();
        } finally {
            overlayState?.overlay?.remove();
        }
    });

    fallbackButton.addEventListener("click", async () => {
        if (flow.busy) return;
        if (!confirm("¿Registrar la disputa sin fotografía? El caso quedará como evidencia débil y requerirá revisión humana.")) {
            return;
        }

        flow.busy = true;
        refreshButtons();
        errorElement.classList.add("hidden");

        try {
            const arrival = await arrivalPromise;
            const clockSync = await sincronizarRelojServidor({
                serviceId,
                actorUid: customerId,
                actorRole: "cliente",
                force: true
            });
            const timeSeal = crearSelloTemporalEvidencia({
                serviceData,
                clockSync
            });

            const result = await registrarDisputaSinFoto({
                serviceId,
                customerId,
                arrival,
                timeSeal
            });

            if (!result.accepted && result.reason === "ARRIVAL_ALREADY_ANSWERED") {
                cerrarFlujo(serviceId);
                sourceModal?.remove();
                return;
            }

            cerrarFlujo(serviceId);
            sourceModal?.remove();
            alert("⚠️ Disputa registrada sin fotografía. Quedó bloqueada para revisión humana y no se movieron fondos.");
        } catch (error) {
            console.error("[B2C_CUSTOMER_SCOPED_FALLBACK_ERROR]", error);
            errorElement.textContent = mensajeError(error);
            errorElement.classList.remove("hidden");
            flow.busy = false;
            refreshButtons();
        }
    });
}

export function instalarDisputaClienteConfinadaAlServicioB2C(user = null) {
    if (window[INSTALL_KEY]?.installed) {
        return window[INSTALL_KEY];
    }

    const customerId = textoSeguro(user?.uid || auth.currentUser?.uid, 128);
    if (!customerId) {
        console.warn("[B2C_CUSTOMER_SCOPED_NOT_INSTALLED] Falta UID cliente.");
        return null;
    }

    const onCaptureClick = async (event) => {
        const button = event.target?.closest?.(DISPUTE_BUTTON_SELECTOR);
        if (!button) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const sourceModal = button.closest(SOURCE_MODAL_SELECTOR);
        const serviceId = serviceIdDesdeModal(sourceModal);
        if (!serviceId || activeFlows.has(serviceId)) return;

        button.disabled = true;
        button.classList.add("opacity-50");

        try {
            const serviceData = await obtenerServicio({
                serviceId,
                customerId
            });

            crearModalFlujo({
                serviceId,
                customerId,
                serviceData,
                sourceModal
            });
        } catch (error) {
            console.error("[B2C_CUSTOMER_SCOPED_OPEN_ERROR]", error);
            alert(`⚠️ ${mensajeError(error)}`);
            button.disabled = false;
            button.classList.remove("opacity-50");
        }
    };

    document.addEventListener("click", onCaptureClick, true);

    const installation = {
        version: B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE_VERSION,
        installed: true,
        uninstall() {
            document.removeEventListener("click", onCaptureClick, true);
            for (const serviceId of [...activeFlows.keys()]) {
                cerrarFlujo(serviceId);
            }
            delete window[INSTALL_KEY];
        }
    };

    window[INSTALL_KEY] = installation;
    window.__B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE_VERSION__ =
        B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE_VERSION;

    console.log(
        `[B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE_READY] v${B2C_CUSTOMER_DISPUTE_SERVICE_SCOPE_VERSION}`
    );

    return installation;
}
