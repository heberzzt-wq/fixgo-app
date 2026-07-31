/**
 * ======================================================================================
 * B2C EVIDENCE ORCHESTRATOR 2026
 * Archivo: b2c-evidence-orchestrator.js
 * Rol: Coordinar validación, deduplicación, reserva, carga y auditoría de evidencias B2C.
 *
 * ALCANCE:
 * - Une los motores de GPS, captura, huellas y registro Firestore.
 * - Sirve tanto para técnico como para cliente.
 * - No cambia estados del servicio, no ejecuta cobros y no libera fondos.
 * - Las evidencias críticas deben capturarse dentro de la app salvo fallback explícito.
 * ======================================================================================
 */

import {
    storage,
    db,
    collection,
    addDoc,
    serverTimestamp
} from "./firebase.js";

import {
    ref,
    uploadBytes,
    getDownloadURL,
    getMetadata
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

import {
    validarArchivoMedia,
    crearMetadatosUpload,
    crearPayloadEventoEvidencia,
    capturarFotoSellada,
    validarLlegadaRobusta
} from "./b2c-evidence-engine.js";

import {
    generarHuellaEvidencia
} from "./b2c-evidence-dedup.js";

import {
    evaluarEvidenciaRegistrada,
    reservarHuellaEvidenciaAtomica,
    confirmarHuellaEvidenciaAlmacenada,
    marcarReservaEvidenciaFallida
} from "./b2c-evidence-firestore.js";

export const B2C_EVIDENCE_ORCHESTRATOR_VERSION = "1.0.0";

export const B2C_CRITICAL_EVIDENCE_EVENTS = Object.freeze([
    "arrival",
    "arrival_fallback",
    "diagnostic_before",
    "work_before",
    "work_after",
    "customer_no_show",
    "customer_denied_access",
    "service_completion"
]);

export const B2C_CAPTURE_METHODS = Object.freeze({
    inAppCamera: "in_app_camera",
    inAppVideo: "in_app_video",
    galleryFallback: "gallery_fallback",
    externalFile: "external_file"
});

function textoSeguro(value, maxLength = 160) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function asegurarIdentificador(value, fieldName) {
    const safe = textoSeguro(value, 128)
        .replace(/[^a-zA-Z0-9_-]/g, "_");

    if (!safe) {
        throw new TypeError(`${fieldName} es obligatorio.`);
    }

    return safe;
}

function extensionPorTipo(contentType) {
    const normalized = String(contentType || "").toLowerCase();

    const extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "video/webm": "webm",
        "video/mp4": "mp4",
        "video/quicktime": "mov"
    };

    return extensions[normalized] || "bin";
}

function eventoCritico(eventType) {
    return B2C_CRITICAL_EVIDENCE_EVENTS.includes(
        String(eventType || "").toLowerCase()
    );
}

function capturaEnApp(captureMethod) {
    return [
        B2C_CAPTURE_METHODS.inAppCamera,
        B2C_CAPTURE_METHODS.inAppVideo
    ].includes(captureMethod);
}

function mensajeDecision(result) {
    const messages = {
        blocked_exact_duplicate:
            "Esta evidencia ya fue utilizada en otro servicio. Toma una captura nueva.",
        retake_required:
            "La imagen coincide visualmente con una evidencia anterior. Toma una fotografía nueva desde la app.",
        review_required:
            "La imagen es demasiado parecida a una evidencia anterior y requiere una nueva captura.",
        capture_method_blocked:
            "Este evento exige una captura realizada directamente dentro de la aplicación.",
        media_invalid:
            "El archivo no cumple el formato o tamaño permitido.",
        arrival_rejected:
            "La ubicación actual no coincide con el destino confirmado del servicio.",
        arrival_fallback_required:
            "No fue posible comprobar la llegada por GPS. Debe usarse el flujo alternativo con evidencia reforzada."
    };

    return messages[result?.status] || "No fue posible validar la evidencia.";
}

export function crearRutaStorageEvidencia({
    serviceId,
    actorUid,
    evidenceId,
    eventType,
    contentType
} = {}) {
    const safeServiceId = asegurarIdentificador(serviceId, "serviceId");
    const safeActorUid = asegurarIdentificador(actorUid, "actorUid");
    const safeEvidenceId = asegurarIdentificador(evidenceId, "evidenceId");
    const safeEventType = asegurarIdentificador(eventType, "eventType");
    const extension = extensionPorTipo(contentType);

    return [
        "b2c_evidence",
        safeServiceId,
        safeActorUid,
        safeEventType,
        `${safeEvidenceId}.${extension}`
    ].join("/");
}

function construirMetadataStorage({
    blob,
    serviceId,
    evidenceId,
    eventType,
    capturedAtClient,
    fingerprint,
    gps,
    captureMethod,
    actorUid,
    actorRole
}) {
    const base = crearMetadatosUpload({
        serviceId,
        evidenceId,
        eventType,
        capturedAtClient,
        sha256: fingerprint.sha256,
        gps,
        captureMethod
    });

    return {
        ...base,
        contentType: blob.type || base.contentType,
        customMetadata: {
            ...base.customMetadata,
            actorUid: textoSeguro(actorUid, 128),
            actorRole: textoSeguro(actorRole, 32),
            perceptualHash: textoSeguro(fingerprint?.perceptual?.hex, 128),
            perceptualAlgorithm: textoSeguro(
                fingerprint?.perceptual?.algorithm,
                64
            ),
            orchestratorVersion: B2C_EVIDENCE_ORCHESTRATOR_VERSION
        }
    };
}

async function registrarEventoEnServicio({
    serviceId,
    payload,
    dedup,
    registry,
    storageMetadata
}) {
    const eventCollection = collection(
        db,
        "services",
        serviceId,
        "evidence_events"
    );

    const eventRef = await addDoc(eventCollection, {
        ...payload,
        dedup: {
            status: textoSeguro(dedup?.status, 80),
            reason: textoSeguro(dedup?.reason, 160),
            perceptualDistance: Number.isFinite(
                dedup?.nearestMatch?.hammingDistance
            )
                ? dedup.nearestMatch.hammingDistance
                : null
        },
        registry: {
            id: registry?.registryId || null,
            state: registry?.registryState || registry?.state || null
        },
        storage: {
            generation: storageMetadata?.generation || null,
            sizeBytes: Number(storageMetadata?.size) || payload?.media?.size || 0,
            contentType: storageMetadata?.contentType || payload?.media?.contentType || null,
            md5Hash: storageMetadata?.md5Hash || null
        },
        orchestratorVersion: B2C_EVIDENCE_ORCHESTRATOR_VERSION,
        capturedAtServer: serverTimestamp(),
        createdAt: serverTimestamp()
    });

    return eventRef.id;
}

export async function validarLlegadaParaEvidencia({
    destination,
    geoPolicy = {},
    allowFallback = false
} = {}) {
    const arrival = await validarLlegadaRobusta({
        destino: destination,
        policy: geoPolicy
    });

    if (arrival.status === "verified") {
        return {
            allowCapture: true,
            fallback: false,
            arrival,
            gps: arrival.gps?.bestReading || null
        };
    }

    if (arrival.status === "fallback_required" && allowFallback) {
        return {
            allowCapture: true,
            fallback: true,
            arrival,
            gps: arrival.gps?.bestReading || null
        };
    }

    const status = arrival.status === "rejected"
        ? "arrival_rejected"
        : "arrival_fallback_required";

    return {
        allowCapture: false,
        fallback: arrival.status === "fallback_required",
        status,
        reason: arrival.reason,
        userMessage: mensajeDecision({ status }),
        arrival,
        gps: arrival.gps?.bestReading || null
    };
}

/**
 * Procesa una evidencia ya capturada o seleccionada.
 * Para eventos críticos, requireInAppCapture=true impide galería por defecto.
 */
export async function procesarYSubirEvidenciaB2C({
    blob,
    serviceId,
    technicianId,
    customerId = null,
    actorUid,
    actorRole = "tecnico",
    evidenceId,
    eventType,
    captureMethod,
    capturedAtClient = new Date().toISOString(),
    gps = null,
    arrival = null,
    media = null,
    fallbackReason = null,
    policy = {}
} = {}) {
    const safeServiceId = asegurarIdentificador(serviceId, "serviceId");
    const safeTechnicianId = asegurarIdentificador(
        technicianId,
        "technicianId"
    );
    const safeActorUid = asegurarIdentificador(actorUid, "actorUid");
    const safeEvidenceId = asegurarIdentificador(evidenceId, "evidenceId");
    const safeEventType = asegurarIdentificador(eventType, "eventType");
    const safeCaptureMethod = textoSeguro(captureMethod, 64);

    const mediaValidation = validarArchivoMedia(blob, policy.media);

    if (!mediaValidation.valid) {
        return {
            success: false,
            status: "media_invalid",
            reason: mediaValidation.reason,
            validation: mediaValidation,
            userMessage: mensajeDecision({ status: "media_invalid" })
        };
    }

    const requireInAppCapture = policy.requireInAppCapture !== false;

    if (
        requireInAppCapture &&
        eventoCritico(safeEventType) &&
        !capturaEnApp(safeCaptureMethod)
    ) {
        return {
            success: false,
            status: "capture_method_blocked",
            reason: "CRITICAL_EVENT_REQUIRES_IN_APP_CAPTURE",
            userMessage: mensajeDecision({
                status: "capture_method_blocked"
            })
        };
    }

    const fingerprint = await generarHuellaEvidencia(
        blob,
        policy.dedup
    );

    const evaluation = await evaluarEvidenciaRegistrada({
        fingerprint,
        serviceId: safeServiceId,
        technicianId: safeTechnicianId,
        policy: policy.dedup
    });

    if (evaluation.allowUpload !== true) {
        return {
            success: false,
            ...evaluation,
            fingerprint,
            userMessage: mensajeDecision(evaluation)
        };
    }

    const preliminaryPath = crearRutaStorageEvidencia({
        serviceId: safeServiceId,
        actorUid: safeActorUid,
        evidenceId: safeEvidenceId,
        eventType: safeEventType,
        contentType: blob.type
    });

    const reservation = await reservarHuellaEvidenciaAtomica({
        fingerprint,
        serviceId: safeServiceId,
        technicianId: safeTechnicianId,
        customerId,
        evidenceId: safeEvidenceId,
        eventType: safeEventType,
        storagePath: preliminaryPath,
        evaluation
    });

    if (reservation.allowUpload !== true) {
        return {
            success: false,
            ...reservation,
            fingerprint,
            userMessage: mensajeDecision(reservation)
        };
    }

    // Un reintento exacto del mismo folio conserva el ID original reservado.
    const effectiveEvidenceId = textoSeguro(
        reservation.exactMatch?.evidenceId || safeEvidenceId,
        160
    );

    const storagePath = crearRutaStorageEvidencia({
        serviceId: safeServiceId,
        actorUid: safeActorUid,
        evidenceId: effectiveEvidenceId,
        eventType: safeEventType,
        contentType: blob.type
    });

    const uploadMetadata = construirMetadataStorage({
        blob,
        serviceId: safeServiceId,
        evidenceId: effectiveEvidenceId,
        eventType: safeEventType,
        capturedAtClient,
        fingerprint,
        gps,
        captureMethod: safeCaptureMethod,
        actorUid: safeActorUid,
        actorRole
    });

    try {
        const storageRef = ref(storage, storagePath);
        const uploadResult = await uploadBytes(
            storageRef,
            blob,
            uploadMetadata
        );

        const [downloadUrl, remoteMetadata] = await Promise.all([
            getDownloadURL(uploadResult.ref),
            getMetadata(uploadResult.ref)
        ]);

        const confirmation = await confirmarHuellaEvidenciaAlmacenada({
            sha256: fingerprint.sha256,
            serviceId: safeServiceId,
            evidenceId: effectiveEvidenceId,
            storagePath,
            storageGeneration: remoteMetadata.generation,
            storageSizeBytes: remoteMetadata.size,
            storageContentType: remoteMetadata.contentType
        });

        const payload = crearPayloadEventoEvidencia({
            serviceId: safeServiceId,
            evidenceId: effectiveEvidenceId,
            eventType: safeEventType,
            actorUid: safeActorUid,
            actorRole,
            capturedAtClient,
            gps,
            arrival,
            media: {
                ...(media || {}),
                kind: mediaValidation.kind,
                contentType: blob.type,
                size: blob.size,
                captureMethod: safeCaptureMethod
            },
            sha256: fingerprint.sha256,
            storagePath,
            downloadUrl,
            fallbackReason
        });

        const eventDocumentId = await registrarEventoEnServicio({
            serviceId: safeServiceId,
            payload,
            dedup: evaluation,
            registry: confirmation,
            storageMetadata: remoteMetadata
        });

        return {
            success: true,
            status: "stored",
            serviceId: safeServiceId,
            evidenceId: effectiveEvidenceId,
            eventDocumentId,
            eventType: safeEventType,
            downloadUrl,
            storagePath,
            fingerprint,
            evaluation,
            reservation,
            confirmation,
            payload
        };
    } catch (error) {
        try {
            await marcarReservaEvidenciaFallida({
                sha256: fingerprint.sha256,
                serviceId: safeServiceId,
                evidenceId: effectiveEvidenceId,
                reason: error?.code || error?.message || "UPLOAD_FAILED"
            });
        } catch (registryError) {
            console.error(
                "[B2C_EVIDENCE_REGISTRY_FAILURE_MARK_ERROR]",
                registryError
            );
        }

        const wrappedError = new Error(
            `EVIDENCE_UPLOAD_FAILED: ${error?.message || String(error)}`
        );
        wrappedError.code = error?.code || "EVIDENCE_UPLOAD_FAILED";
        wrappedError.cause = error;
        throw wrappedError;
    }
}

/**
 * Captura una fotografía sellada desde un <video> activo y la procesa completa.
 */
export async function capturarYSubirFotoB2C({
    videoElement,
    serviceId,
    technicianId,
    customerId = null,
    actorUid,
    actorRole = "tecnico",
    eventType,
    gps = null,
    arrival = null,
    fallbackReason = null,
    policy = {}
} = {}) {
    const capture = await capturarFotoSellada({
        videoElement,
        serviceId,
        eventType,
        gps,
        quality: policy.photoQuality || 0.9
    });

    return procesarYSubirEvidenciaB2C({
        blob: capture.blob,
        serviceId,
        technicianId,
        customerId,
        actorUid,
        actorRole,
        evidenceId: capture.evidenceId,
        eventType,
        captureMethod: B2C_CAPTURE_METHODS.inAppCamera,
        capturedAtClient: capture.capturedAtClient,
        gps: capture.gps,
        arrival,
        media: capture.media,
        fallbackReason,
        policy: {
            ...policy,
            requireInAppCapture: true
        }
    });
}
