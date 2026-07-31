/**
 * ======================================================================================
 * B2C CONSENTED AUTO CAPTURE 2026
 * Archivo: b2c-consented-auto-capture.js
 * Rol: Captura asistida 3-2-1 después de permiso y consentimiento visible.
 *
 * REGLAS:
 * - No solicita cámara por sí mismo.
 * - No captura con la pestaña oculta.
 * - No captura pantalla ni contenido del teléfono.
 * - Requiere un <video> activo, una interacción reciente y consentimiento explícito.
 * - Sirve para técnico o cliente sin convertir la app en vigilancia silenciosa.
 * ======================================================================================
 */

export const B2C_CONSENTED_AUTO_CAPTURE_VERSION = "1.0.0";

const DEFAULT_POLICY = Object.freeze({
    countdownSeconds: 3,
    consentMaxAgeMs: 60 * 1000,
    imageType: "image/jpeg",
    imageQuality: 0.9,
    requireVisibleDocument: true
});

function textoSeguro(value, maxLength = 160) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function performanceNow() {
    return globalThis.performance?.now?.() ?? Date.now();
}

function crearId(prefix = "consent") {
    if (globalThis.crypto?.randomUUID) {
        return `${prefix}_${crypto.randomUUID()}`;
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function esVideoValido(videoElement) {
    return typeof HTMLVideoElement !== "undefined" &&
        videoElement instanceof HTMLVideoElement;
}

function streamActivo(videoElement) {
    const stream = videoElement?.srcObject;
    if (!stream?.getVideoTracks) return false;

    return stream.getVideoTracks().some((track) => (
        track.readyState === "live" && track.enabled !== false
    ));
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("AUTO_CAPTURE_BLOB_FAILED"));
        }, type, quality);
    });
}

function crearCanvas(width, height) {
    if (typeof OffscreenCanvas === "function") {
        return new OffscreenCanvas(width, height);
    }

    if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    throw new Error("AUTO_CAPTURE_CANVAS_UNAVAILABLE");
}

function offscreenCanvasToBlob(canvas, type, quality) {
    if (typeof canvas.convertToBlob === "function") {
        return canvas.convertToBlob({ type, quality });
    }

    return canvasToBlob(canvas, type, quality);
}

function esperar(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Captura cancelada", "AbortError"));
            return;
        }

        const timeoutId = setTimeout(resolve, ms);

        signal?.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            reject(new DOMException("Captura cancelada", "AbortError"));
        }, { once: true });
    });
}

/**
 * Debe llamarse directamente desde un click/tap consciente del usuario.
 */
export function crearConsentimientoCaptura({
    serviceId,
    actorUid,
    actorRole,
    eventType,
    interactionType = "explicit_button_tap"
} = {}) {
    const grantedAtMs = Date.now();

    return Object.freeze({
        consentId: crearId("capture_consent"),
        serviceId: textoSeguro(serviceId, 128),
        actorUid: textoSeguro(actorUid, 128),
        actorRole: textoSeguro(actorRole, 32),
        eventType: textoSeguro(eventType, 80),
        interactionType: textoSeguro(interactionType, 80),
        grantedAtClient: new Date(grantedAtMs).toISOString(),
        grantedAtClientMs: grantedAtMs,
        documentVisibilityAtConsent:
            typeof document !== "undefined" ? document.visibilityState : "unknown",
        version: B2C_CONSENTED_AUTO_CAPTURE_VERSION
    });
}

export function validarConsentimientoCaptura(consent, policy = {}) {
    const resolvedPolicy = {
        ...DEFAULT_POLICY,
        ...policy
    };

    if (!consent?.consentId || !Number.isFinite(consent.grantedAtClientMs)) {
        return {
            valid: false,
            reason: "CAPTURE_CONSENT_MISSING"
        };
    }

    const ageMs = Date.now() - consent.grantedAtClientMs;

    if (ageMs < 0 || ageMs > resolvedPolicy.consentMaxAgeMs) {
        return {
            valid: false,
            reason: "CAPTURE_CONSENT_EXPIRED",
            ageMs
        };
    }

    if (
        resolvedPolicy.requireVisibleDocument &&
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
    ) {
        return {
            valid: false,
            reason: "DOCUMENT_NOT_VISIBLE"
        };
    }

    return {
        valid: true,
        reason: "CAPTURE_CONSENT_VALID",
        ageMs
    };
}

export function capturarFrameVideo({
    videoElement,
    imageType = DEFAULT_POLICY.imageType,
    imageQuality = DEFAULT_POLICY.imageQuality
} = {}) {
    if (!esVideoValido(videoElement)) {
        throw new TypeError("videoElement debe ser un <video> válido.");
    }

    if (!streamActivo(videoElement)) {
        throw new Error("CAMERA_STREAM_NOT_ACTIVE");
    }

    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;

    if (!width || !height || videoElement.readyState < 2) {
        throw new Error("CAMERA_FRAME_NOT_READY");
    }

    const canvas = crearCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
        throw new Error("AUTO_CAPTURE_CONTEXT_UNAVAILABLE");
    }

    context.drawImage(videoElement, 0, 0, width, height);

    return offscreenCanvasToBlob(
        canvas,
        imageType,
        imageQuality
    ).then((blob) => ({
        blob,
        width,
        height,
        contentType: blob.type || imageType,
        sizeBytes: blob.size
    }));
}

/**
 * Ejecuta una cuenta regresiva visible y captura un cuadro al terminar.
 * onTick permite a la UI mostrar 3, 2, 1 y "capturando".
 */
export async function capturaAsistidaConsentida({
    videoElement,
    consent,
    countdownElement = null,
    onTick = null,
    signal = null,
    policy = {}
} = {}) {
    const resolvedPolicy = {
        ...DEFAULT_POLICY,
        ...policy
    };

    const validation = validarConsentimientoCaptura(
        consent,
        resolvedPolicy
    );

    if (!validation.valid) {
        const error = new Error(validation.reason);
        error.code = validation.reason;
        error.validation = validation;
        throw error;
    }

    if (!esVideoValido(videoElement) || !streamActivo(videoElement)) {
        throw new Error("CAMERA_STREAM_NOT_ACTIVE");
    }

    const countdownSeconds = Math.max(
        1,
        Math.min(10, Number.parseInt(resolvedPolicy.countdownSeconds, 10) || 3)
    );

    const startedPerformanceMs = performanceNow();

    for (let remaining = countdownSeconds; remaining > 0; remaining -= 1) {
        if (
            resolvedPolicy.requireVisibleDocument &&
            typeof document !== "undefined" &&
            document.visibilityState !== "visible"
        ) {
            throw new Error("DOCUMENT_HIDDEN_DURING_CAPTURE");
        }

        const displayValue = String(remaining);

        if (countdownElement) {
            countdownElement.textContent = displayValue;
            countdownElement.dataset.captureState = "countdown";
        }

        onTick?.({
            state: "countdown",
            remaining,
            consentId: consent.consentId
        });

        await esperar(1000, signal);
    }

    if (countdownElement) {
        countdownElement.textContent = "●";
        countdownElement.dataset.captureState = "capturing";
    }

    onTick?.({
        state: "capturing",
        remaining: 0,
        consentId: consent.consentId
    });

    const frame = await capturarFrameVideo({
        videoElement,
        imageType: resolvedPolicy.imageType,
        imageQuality: resolvedPolicy.imageQuality
    });

    const capturedAtClientMs = Date.now();

    if (countdownElement) {
        countdownElement.textContent = "✓";
        countdownElement.dataset.captureState = "captured";
    }

    onTick?.({
        state: "captured",
        remaining: 0,
        consentId: consent.consentId
    });

    return {
        ...frame,
        consent,
        capturedAtClient: new Date(capturedAtClientMs).toISOString(),
        capturedAtClientMs,
        elapsedMonotonicMs: Math.round(
            performanceNow() - startedPerformanceMs
        ),
        captureMethod: "consented_in_app_auto_frame",
        documentVisibilityAtCapture:
            typeof document !== "undefined" ? document.visibilityState : "unknown",
        version: B2C_CONSENTED_AUTO_CAPTURE_VERSION
    };
}

/**
 * Metadatos que deben acompañar el evento y la carga a Storage.
 */
export function crearMetadatosConsentimientoCaptura(result) {
    return {
        captureConsentId: textoSeguro(result?.consent?.consentId, 160),
        captureInteractionType: textoSeguro(
            result?.consent?.interactionType,
            80
        ),
        captureConsentAtClient: textoSeguro(
            result?.consent?.grantedAtClient,
            64
        ),
        captureExecutedAtClient: textoSeguro(
            result?.capturedAtClient,
            64
        ),
        captureDocumentVisibility: textoSeguro(
            result?.documentVisibilityAtCapture,
            32
        ),
        captureMethod: textoSeguro(result?.captureMethod, 80),
        captureVersion: B2C_CONSENTED_AUTO_CAPTURE_VERSION
    };
}
