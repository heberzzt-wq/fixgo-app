/*
 * ======================================================================================
 * B2C MEDIA ECONOMY GUARD 2026
 * Archivo: b2c-media-economy-guard.js
 * Rol: Reducir peso de fotografías B2C antes de Storage sin convertirlas a Base64.
 *
 * PRINCIPIOS:
 * - Base64 se reserva únicamente para caché offline local; nunca para Firestore.
 * - Las fotografías se mantienen como Blob JPEG binario.
 * - Reduce dimensión, prueba calidades descendentes y conserva el Blob más pequeño.
 * - Solo interviene conversiones JPEG de canvas grandes mientras existe contexto B2C.
 * - PNG de firmas, PDFs, imágenes legacy y otros módulos quedan intactos.
 * - No sube archivos, no cambia estados, no ejecuta cobros y no publica reglas.
 * ======================================================================================
 */

export const B2C_MEDIA_ECONOMY_GUARD_VERSION = "1.0.0";

export const B2C_MEDIA_ECONOMY_POLICY = Object.freeze({
    maxLongEdgePx: 1600,
    minLongEdgePx: 960,
    targetImageBytes: 900 * 1024,
    hardImageBytes: 1800 * 1024,
    qualitySteps: Object.freeze([0.82, 0.76, 0.70, 0.64, 0.58, 0.52, 0.46]),
    dimensionStep: 0.84,
    minimumSourceAreaPx: 900 * 700
});

const INSTALL_KEY = "__B2C_MEDIA_ECONOMY_GUARD__";
const nativeToBlob = globalThis.HTMLCanvasElement?.prototype?.toBlob || null;

function numeroFinito(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function canvasToBlobNativo(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        nativeToBlob.call(canvas, (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("MEDIA_ECONOMY_CANVAS_BLOB_FAILED"));
        }, type, quality);
    });
}

function dimensionesLimitadas(width, height, maxLongEdgePx) {
    const sourceWidth = Math.max(1, Math.round(width));
    const sourceHeight = Math.max(1, Math.round(height));
    const longEdge = Math.max(sourceWidth, sourceHeight);

    if (longEdge <= maxLongEdgePx) {
        return { width: sourceWidth, height: sourceHeight };
    }

    const ratio = maxLongEdgePx / longEdge;
    return {
        width: Math.max(1, Math.round(sourceWidth * ratio)),
        height: Math.max(1, Math.round(sourceHeight * ratio))
    };
}

function crearCanvasEscalado(sourceCanvas, width, height) {
    const target = document.createElement("canvas");
    target.width = Math.max(1, Math.round(width));
    target.height = Math.max(1, Math.round(height));

    const context = target.getContext("2d", {
        alpha: false,
        desynchronized: true
    });

    if (!context) {
        throw new Error("MEDIA_ECONOMY_CONTEXT_UNAVAILABLE");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
        sourceCanvas,
        0,
        0,
        sourceCanvas.width,
        sourceCanvas.height,
        0,
        0,
        target.width,
        target.height
    );

    return target;
}

function contextoB2CActivo() {
    if (typeof document === "undefined") return false;

    return Boolean(document.querySelector([
        '[id^="b2cArrivalModal_"]',
        '[id^="b2cNoShowModal_"]',
        '[id^="b2cCustomerDisputeScoped_"]',
        '[id^="b2cPrequote"]',
        '[id^="b2cStartWork"]',
        '[id^="b2cWorkAfterClose_"]',
        '[id^="b2cWorkEvidence"]'
    ].join(",")));
}

function debeOptimizar(canvas, type) {
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    if (String(type || "image/png").toLowerCase() !== "image/jpeg") return false;
    if (canvas.dataset?.b2cEconomyOptOut === "true") return false;
    if (canvas.width * canvas.height < B2C_MEDIA_ECONOMY_POLICY.minimumSourceAreaPx) {
        return false;
    }

    return contextoB2CActivo();
}

async function codificarEscala(canvas, policy, initialQuality = null) {
    const requestedQuality = numeroFinito(initialQuality, policy.qualitySteps[0]);
    const qualities = policy.qualitySteps
        .map((quality) => Math.min(requestedQuality, quality))
        .filter((quality, index, all) => (
            quality > 0 && quality <= 1 && all.indexOf(quality) === index
        ));

    let best = null;
    let working = canvas;

    while (true) {
        for (const quality of qualities) {
            const blob = await canvasToBlobNativo(working, "image/jpeg", quality);
            const candidate = {
                blob,
                quality,
                width: working.width,
                height: working.height
            };

            if (!best || blob.size < best.blob.size) best = candidate;
            if (blob.size <= policy.targetImageBytes) return candidate;
        }

        const currentLongEdge = Math.max(working.width, working.height);
        if (
            best?.blob?.size <= policy.hardImageBytes ||
            currentLongEdge <= policy.minLongEdgePx
        ) {
            return best;
        }

        const nextLongEdge = Math.max(
            policy.minLongEdgePx,
            Math.floor(currentLongEdge * policy.dimensionStep)
        );

        if (nextLongEdge >= currentLongEdge) return best;

        const nextDimensions = dimensionesLimitadas(
            working.width,
            working.height,
            nextLongEdge
        );
        working = crearCanvasEscalado(
            working,
            nextDimensions.width,
            nextDimensions.height
        );
    }
}

export async function optimizarCanvasEvidenciaB2C(
    sourceCanvas,
    options = {}
) {
    if (!(sourceCanvas instanceof HTMLCanvasElement)) {
        throw new TypeError("sourceCanvas debe ser HTMLCanvasElement.");
    }

    if (!nativeToBlob) {
        throw new Error("MEDIA_ECONOMY_TO_BLOB_UNAVAILABLE");
    }

    const policy = {
        ...B2C_MEDIA_ECONOMY_POLICY,
        ...options
    };
    const dimensions = dimensionesLimitadas(
        sourceCanvas.width,
        sourceCanvas.height,
        policy.maxLongEdgePx
    );
    const preparedCanvas = crearCanvasEscalado(
        sourceCanvas,
        dimensions.width,
        dimensions.height
    );
    const encoded = await codificarEscala(
        preparedCanvas,
        policy,
        options.requestedQuality
    );

    if (!encoded?.blob) {
        throw new Error("MEDIA_ECONOMY_OUTPUT_MISSING");
    }

    return {
        ...encoded,
        originalWidth: sourceCanvas.width,
        originalHeight: sourceCanvas.height,
        originalAreaPx: sourceCanvas.width * sourceCanvas.height,
        targetImageBytes: policy.targetImageBytes,
        hardImageBytes: policy.hardImageBytes,
        base64Used: false,
        outputType: encoded.blob.type || "image/jpeg",
        version: B2C_MEDIA_ECONOMY_GUARD_VERSION
    };
}

export function contieneBase64Persistente(value, seen = new WeakSet()) {
    if (typeof value === "string") {
        return /^data:(image|video|application)\//i.test(value.trim());
    }

    if (!value || typeof value !== "object") return false;
    if (value instanceof Blob || value instanceof ArrayBuffer) return false;
    if (seen.has(value)) return false;
    seen.add(value);

    if (Array.isArray(value)) {
        return value.some((item) => contieneBase64Persistente(item, seen));
    }

    return Object.values(value).some((item) => (
        contieneBase64Persistente(item, seen)
    ));
}

export function asegurarPayloadSinBase64Persistente(payload) {
    if (contieneBase64Persistente(payload)) {
        const error = new Error("PERSISTENT_BASE64_MEDIA_BLOCKED");
        error.code = "PERSISTENT_BASE64_MEDIA_BLOCKED";
        throw error;
    }
    return payload;
}

export function instalarEconomiaMediaB2C() {
    if (globalThis[INSTALL_KEY]) return globalThis[INSTALL_KEY];

    if (!nativeToBlob || typeof document === "undefined") {
        const unavailable = {
            installed: false,
            reason: "CANVAS_TO_BLOB_UNAVAILABLE",
            version: B2C_MEDIA_ECONOMY_GUARD_VERSION
        };
        globalThis[INSTALL_KEY] = unavailable;
        return unavailable;
    }

    const patchedToBlob = function patchedToBlob(callback, type, quality) {
        if (typeof callback !== "function" || !debeOptimizar(this, type)) {
            return nativeToBlob.call(this, callback, type, quality);
        }

        optimizarCanvasEvidenciaB2C(this, {
            requestedQuality: quality
        }).then((result) => {
            globalThis.__B2C_MEDIA_ECONOMY_LAST__ = {
                original_width: result.originalWidth,
                original_height: result.originalHeight,
                output_width: result.width,
                output_height: result.height,
                output_bytes: result.blob.size,
                quality: result.quality,
                base64_used: false,
                version: result.version,
                recorded_at: new Date().toISOString()
            };
            callback(result.blob);
        }).catch((error) => {
            console.warn("[B2C_MEDIA_ECONOMY_FALLBACK]", error);
            nativeToBlob.call(this, callback, type, quality);
        });

        return undefined;
    };

    HTMLCanvasElement.prototype.toBlob = patchedToBlob;

    const installation = {
        installed: true,
        version: B2C_MEDIA_ECONOMY_GUARD_VERSION,
        policy: B2C_MEDIA_ECONOMY_POLICY,
        uninstall() {
            if (HTMLCanvasElement.prototype.toBlob === patchedToBlob) {
                HTMLCanvasElement.prototype.toBlob = nativeToBlob;
            }
            delete globalThis[INSTALL_KEY];
        }
    };

    globalThis[INSTALL_KEY] = installation;
    console.log(
        `[B2C_MEDIA_ECONOMY_READY] v${B2C_MEDIA_ECONOMY_GUARD_VERSION}`
    );
    return installation;
}

// Side effect deliberado: app-panel importa este archivo una sola vez.
instalarEconomiaMediaB2C();
