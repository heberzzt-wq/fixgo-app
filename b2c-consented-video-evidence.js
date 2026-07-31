/*
 * ======================================================================================
 * B2C CONSENTED SHORT VIDEO EVIDENCE 2026
 * Archivo: b2c-consented-video-evidence.js
 * Rol: Grabar y subir videos cortos, visibles y consentidos para evidencia reforzada.
 *
 * PRINCIPIOS:
 * - Nunca abre la cámara por sí mismo.
 * - Reutiliza únicamente una cámara ya visible y autorizada.
 * - No graba audio.
 * - Requiere toque explícito, cuenta 3-2-1 e indicador rojo durante la grabación.
 * - Cancela si la pestaña se oculta o la cámara deja de estar activa.
 * - El video pasa por SHA-256, reserva transaccional, Storage y auditoría existentes.
 * - La huella perceptual del primer cuadro es auxiliar; el bloqueo automático del video
 *   se basa en SHA-256 exacto para evitar falsos positivos.
 * - No cambia estados del servicio, no ejecuta cobros y no mueve fondos.
 * ======================================================================================
 */

import {
    db,
    doc,
    setDoc,
    serverTimestamp
} from "./firebase.js";

import {
    procesarYSubirEvidenciaB2C,
    B2C_CAPTURE_METHODS
} from "./b2c-evidence-orchestrator.js";

import {
    calcularDHashImagen
} from "./b2c-evidence-dedup.js";

import {
    sincronizarRelojServidor,
    crearSelloTemporalEvidencia
} from "./b2c-time-authority.js";

export const B2C_CONSENTED_VIDEO_VERSION = "1.0.0";

const DEFAULT_POLICY = Object.freeze({
    countdownSeconds: 3,
    durationMs: 4000,
    maxDurationMs: 8000,
    maxBytes: 20 * 1024 * 1024,
    videoBitsPerSecond: 1_500_000,
    consentMaxAgeMs: 60 * 1000,
    requireVisibleDocument: true
});

const MIME_CANDIDATES = Object.freeze([
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4"
]);

function textoSeguro(value, maxLength = 180) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function idSeguro(value, fallback = "evidence") {
    return textoSeguro(value, 160)
        .replace(/[^a-zA-Z0-9_-]/g, "_") || fallback;
}

function crearId(prefix = "video") {
    if (globalThis.crypto?.randomUUID) {
        return `${prefix}_${crypto.randomUUID()}`;
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function performanceNow() {
    return globalThis.performance?.now?.() ?? Date.now();
}

function esperar(ms, signal = null) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Operación cancelada", "AbortError"));
            return;
        }

        const timeoutId = setTimeout(resolve, ms);

        signal?.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            reject(new DOMException("Operación cancelada", "AbortError"));
        }, { once: true });
    });
}

function esVideoValido(videoElement) {
    return typeof HTMLVideoElement !== "undefined" &&
        videoElement instanceof HTMLVideoElement;
}

function tracksVideoActivos(videoElement) {
    const stream = videoElement?.srcObject;
    if (!stream?.getVideoTracks) return [];

    return stream.getVideoTracks().filter((track) => (
        track.readyState === "live" && track.enabled !== false
    ));
}

function asegurarDocumentoVisible(policy) {
    if (
        policy.requireVisibleDocument &&
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
    ) {
        throw new Error("DOCUMENT_NOT_VISIBLE");
    }
}

function seleccionarMimeType() {
    if (typeof MediaRecorder === "undefined") {
        throw new Error("MEDIA_RECORDER_UNAVAILABLE");
    }

    if (typeof MediaRecorder.isTypeSupported !== "function") {
        return "";
    }

    return MIME_CANDIDATES.find((candidate) => (
        MediaRecorder.isTypeSupported(candidate)
    )) || "";
}

function extensionPorMime(mimeType) {
    const normalized = String(mimeType || "").toLowerCase();
    return normalized.includes("mp4") ? "mp4" : "webm";
}

function crearVideoStreamSinAudio(videoElement) {
    const tracks = tracksVideoActivos(videoElement);

    if (!tracks.length) {
        throw new Error("CAMERA_STREAM_NOT_ACTIVE");
    }

    if (typeof MediaStream === "undefined") {
        throw new Error("MEDIA_STREAM_UNAVAILABLE");
    }

    // Se crea un stream independiente con tracks clonados para no detener la cámara UI.
    const clonedTracks = tracks.map((track) => track.clone());
    return new MediaStream(clonedTracks);
}

function detenerStream(stream) {
    stream?.getTracks?.().forEach((track) => {
        try {
            track.stop();
        } catch (error) {
            console.warn("[B2C_VIDEO_TRACK_STOP_WARNING]", error);
        }
    });
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.82) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("VIDEO_POSTER_BLOB_FAILED"));
        }, type, quality);
    });
}

async function capturarPosterFrame(videoElement) {
    if (!esVideoValido(videoElement) || !videoElement.videoWidth || !videoElement.videoHeight) {
        return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;

    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    const posterBlob = await canvasToBlob(canvas);
    const perceptual = await calcularDHashImagen(posterBlob).catch(() => null);

    return {
        blob: posterBlob,
        perceptual,
        width: canvas.width,
        height: canvas.height
    };
}

export function crearConsentimientoVideo({
    serviceId,
    actorUid,
    actorRole,
    eventType,
    interactionType = "explicit_video_button_tap"
} = {}) {
    const grantedAtMs = Date.now();

    return Object.freeze({
        consentId: crearId("video_consent"),
        serviceId: textoSeguro(serviceId, 128),
        actorUid: textoSeguro(actorUid, 128),
        actorRole: textoSeguro(actorRole, 32),
        eventType: textoSeguro(eventType, 80),
        interactionType: textoSeguro(interactionType, 80),
        grantedAtClient: new Date(grantedAtMs).toISOString(),
        grantedAtClientMs: grantedAtMs,
        visibilityAtConsent:
            typeof document !== "undefined" ? document.visibilityState : "unknown",
        audioIncluded: false,
        version: B2C_CONSENTED_VIDEO_VERSION
    });
}

function validarConsentimiento(consent, policy) {
    if (!consent?.consentId || !Number.isFinite(consent.grantedAtClientMs)) {
        throw new Error("VIDEO_CONSENT_MISSING");
    }

    const ageMs = Date.now() - consent.grantedAtClientMs;
    if (ageMs < 0 || ageMs > policy.consentMaxAgeMs) {
        throw new Error("VIDEO_CONSENT_EXPIRED");
    }

    asegurarDocumentoVisible(policy);
}

/**
 * Graba un video corto sin audio usando una cámara ya abierta y visible.
 */
export async function grabarVideoCortoConsentido({
    videoElement,
    consent,
    countdownElement = null,
    onState = null,
    signal = null,
    policy = {}
} = {}) {
    const resolvedPolicy = {
        ...DEFAULT_POLICY,
        ...policy
    };

    const countdownSeconds = Math.max(
        1,
        Math.min(10, Number.parseInt(resolvedPolicy.countdownSeconds, 10) || 3)
    );
    const durationMs = Math.max(
        1000,
        Math.min(
            Number(resolvedPolicy.maxDurationMs) || DEFAULT_POLICY.maxDurationMs,
            Number(resolvedPolicy.durationMs) || DEFAULT_POLICY.durationMs
        )
    );

    validarConsentimiento(consent, resolvedPolicy);

    if (!esVideoValido(videoElement)) {
        throw new TypeError("videoElement debe ser un <video> válido.");
    }

    if (!tracksVideoActivos(videoElement).length) {
        throw new Error("CAMERA_STREAM_NOT_ACTIVE");
    }

    for (let remaining = countdownSeconds; remaining > 0; remaining -= 1) {
        asegurarDocumentoVisible(resolvedPolicy);

        if (countdownElement) {
            countdownElement.textContent = String(remaining);
            countdownElement.dataset.videoState = "countdown";
        }

        onState?.({
            state: "countdown",
            remaining,
            consentId: consent.consentId
        });

        await esperar(1000, signal);
    }

    asegurarDocumentoVisible(resolvedPolicy);

    const mimeType = seleccionarMimeType();
    const recordingStream = crearVideoStreamSinAudio(videoElement);
    const chunks = [];
    const startedAtClientMs = Date.now();
    const startedAtMonotonicMs = performanceNow();
    let visibilityFailure = false;
    let abortFailure = false;

    const recorderOptions = {
        videoBitsPerSecond: Math.max(
            250_000,
            Number(resolvedPolicy.videoBitsPerSecond) || DEFAULT_POLICY.videoBitsPerSecond
        )
    };

    if (mimeType) recorderOptions.mimeType = mimeType;

    const recorder = new MediaRecorder(recordingStream, recorderOptions);

    const stopPromise = new Promise((resolve, reject) => {
        recorder.addEventListener("dataavailable", (event) => {
            if (event.data?.size) chunks.push(event.data);
        });

        recorder.addEventListener("error", (event) => {
            reject(event.error || new Error("MEDIA_RECORDER_ERROR"));
        }, { once: true });

        recorder.addEventListener("stop", () => resolve(), { once: true });
    });

    const stopRecorder = () => {
        if (recorder.state !== "inactive") recorder.stop();
    };

    const visibilityListener = () => {
        if (
            resolvedPolicy.requireVisibleDocument &&
            document.visibilityState !== "visible"
        ) {
            visibilityFailure = true;
            stopRecorder();
        }
    };

    const abortListener = () => {
        abortFailure = true;
        stopRecorder();
    };

    document.addEventListener("visibilitychange", visibilityListener);
    signal?.addEventListener("abort", abortListener, { once: true });

    try {
        if (countdownElement) {
            countdownElement.textContent = "REC";
            countdownElement.dataset.videoState = "recording";
        }

        onState?.({
            state: "recording",
            durationMs,
            consentId: consent.consentId
        });

        recorder.start(500);
        const stopTimer = setTimeout(stopRecorder, durationMs);

        try {
            await stopPromise;
        } finally {
            clearTimeout(stopTimer);
        }
    } finally {
        document.removeEventListener("visibilitychange", visibilityListener);
        signal?.removeEventListener?.("abort", abortListener);
        detenerStream(recordingStream);
    }

    if (abortFailure) {
        throw new DOMException("Grabación cancelada", "AbortError");
    }

    if (visibilityFailure) {
        throw new Error("DOCUMENT_HIDDEN_DURING_VIDEO");
    }

    const effectiveMimeType = recorder.mimeType || mimeType || chunks[0]?.type || "video/webm";
    const blob = new Blob(chunks, { type: effectiveMimeType });

    if (!blob.size) {
        throw new Error("RECORDED_VIDEO_EMPTY");
    }

    if (blob.size > resolvedPolicy.maxBytes) {
        throw new Error("RECORDED_VIDEO_TOO_LARGE");
    }

    const stoppedAtClientMs = Date.now();
    const poster = await capturarPosterFrame(videoElement).catch(() => null);

    if (countdownElement) {
        countdownElement.textContent = "✓";
        countdownElement.dataset.videoState = "recorded";
    }

    onState?.({
        state: "recorded",
        sizeBytes: blob.size,
        consentId: consent.consentId
    });

    return {
        blob,
        consent,
        contentType: blob.type || effectiveMimeType,
        extension: extensionPorMime(blob.type || effectiveMimeType),
        sizeBytes: blob.size,
        durationRequestedMs: durationMs,
        durationObservedMs: Math.max(0, stoppedAtClientMs - startedAtClientMs),
        elapsedMonotonicMs: Math.round(performanceNow() - startedAtMonotonicMs),
        startedAtClient: new Date(startedAtClientMs).toISOString(),
        stoppedAtClient: new Date(stoppedAtClientMs).toISOString(),
        audioIncluded: false,
        captureMethod: B2C_CAPTURE_METHODS.inAppVideo,
        visibilityAtStop:
            typeof document !== "undefined" ? document.visibilityState : "unknown",
        poster: poster
            ? {
                width: poster.width,
                height: poster.height,
                perceptualHash: poster.perceptual?.hex || null,
                perceptualAlgorithm: poster.perceptual?.algorithm || null
            }
            : null,
        version: B2C_CONSENTED_VIDEO_VERSION
    };
}

async function auditarVideo({
    serviceId,
    actorUid,
    actorRole,
    eventType,
    consent,
    recording = null,
    result = null,
    status,
    error = null,
    clockSync = null,
    timeSeal = null
}) {
    const auditRef = doc(
        db,
        "services",
        idSeguro(serviceId, "service"),
        "video_consents",
        idSeguro(consent?.consentId, crearId("video_consent"))
    );

    await setDoc(auditRef, {
        consent_id: consent?.consentId || null,
        service_id: textoSeguro(serviceId, 128),
        actor_uid: textoSeguro(actorUid, 128),
        actor_role: textoSeguro(actorRole, 32),
        event_type: textoSeguro(eventType, 80),
        interaction_type: textoSeguro(consent?.interactionType, 80),
        granted_at_client: consent?.grantedAtClient || null,
        status: textoSeguro(status, 80),
        audio_included: false,
        recording: recording
            ? {
                content_type: recording.contentType,
                size_bytes: recording.sizeBytes,
                requested_duration_ms: recording.durationRequestedMs,
                observed_duration_ms: recording.durationObservedMs,
                started_at_client: recording.startedAtClient,
                stopped_at_client: recording.stoppedAtClient,
                poster_perceptual_hash: recording.poster?.perceptualHash || null,
                poster_perceptual_algorithm: recording.poster?.perceptualAlgorithm || null
            }
            : null,
        evidence: result?.success
            ? {
                event_document_id: result.eventDocumentId,
                evidence_id: result.evidenceId,
                storage_path: result.storagePath,
                download_url: result.downloadUrl,
                sha256: result.fingerprint?.sha256 || null
            }
            : null,
        clock_source: clockSync?.source || null,
        clock_quality: clockSync?.quality || null,
        clock_uncertainty_ms: Number.isFinite(clockSync?.uncertaintyMs)
            ? clockSync.uncertaintyMs
            : null,
        time_authority: timeSeal
            ? {
                utc_iso: timeSeal.utcIso,
                local_display: timeSeal.localDisplay,
                timezone: timeSeal.timezone,
                timezone_source: timeSeal.timezoneSource
            }
            : null,
        error: error ? textoSeguro(error?.code || error?.message || error, 240) : null,
        version: B2C_CONSENTED_VIDEO_VERSION,
        updated_at: serverTimestamp(),
        created_at: serverTimestamp()
    }, { merge: true });
}

/**
 * Graba, procesa y sube un video corto usando el orquestador antifraude existente.
 */
export async function grabarYSubirVideoCortoB2C({
    videoElement,
    serviceId,
    technicianId,
    customerId = null,
    actorUid,
    actorRole,
    eventType,
    serviceData = {},
    gps = null,
    arrival = null,
    fallbackReason = null,
    countdownElement = null,
    onState = null,
    signal = null,
    policy = {}
} = {}) {
    const consent = crearConsentimientoVideo({
        serviceId,
        actorUid,
        actorRole,
        eventType
    });

    let recording = null;
    let clockSync = null;
    let timeSeal = null;

    try {
        clockSync = await sincronizarRelojServidor({
            serviceId,
            actorUid,
            actorRole,
            force: true
        });

        timeSeal = crearSelloTemporalEvidencia({
            serviceData,
            clockSync
        });

        await auditarVideo({
            serviceId,
            actorUid,
            actorRole,
            eventType,
            consent,
            status: "consent_granted",
            clockSync,
            timeSeal
        });

        recording = await grabarVideoCortoConsentido({
            videoElement,
            consent,
            countdownElement,
            onState,
            signal,
            policy
        });

        const evidenceId = crearId(`video_${idSeguro(eventType, "event")}`);

        const result = await procesarYSubirEvidenciaB2C({
            blob: recording.blob,
            serviceId,
            technicianId,
            customerId,
            actorUid,
            actorRole,
            evidenceId,
            eventType,
            captureMethod: B2C_CAPTURE_METHODS.inAppVideo,
            capturedAtClient: recording.stoppedAtClient,
            gps,
            arrival,
            media: {
                kind: "video",
                contentType: recording.contentType,
                size: recording.sizeBytes,
                durationMs: recording.durationObservedMs,
                requestedDurationMs: recording.durationRequestedMs,
                captureMethod: recording.captureMethod,
                audioIncluded: false,
                consentId: consent.consentId,
                posterPerceptualHash: recording.poster?.perceptualHash || null,
                posterPerceptualAlgorithm: recording.poster?.perceptualAlgorithm || null,
                timeAuthority: timeSeal
            },
            fallbackReason,
            policy: {
                ...policy,
                requireInAppCapture: true,
                media: {
                    ...(policy.media || {}),
                    maxVideoBytes: policy.maxBytes || DEFAULT_POLICY.maxBytes
                }
            }
        });

        await auditarVideo({
            serviceId,
            actorUid,
            actorRole,
            eventType,
            consent,
            recording,
            result,
            status: result.success ? "stored" : "rejected",
            clockSync,
            timeSeal
        });

        return {
            ...result,
            consent,
            recording,
            timeSeal
        };
    } catch (error) {
        try {
            await auditarVideo({
                serviceId,
                actorUid,
                actorRole,
                eventType,
                consent,
                recording,
                status: "failed",
                error,
                clockSync,
                timeSeal
            });
        } catch (auditError) {
            console.error("[B2C_VIDEO_AUDIT_FAILURE]", auditError);
        }

        throw error;
    }
}
