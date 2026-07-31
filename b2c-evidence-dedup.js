/**
 * ======================================================================================
 * B2C EVIDENCE DEDUP ENGINE 2026
 * Archivo: b2c-evidence-dedup.js
 * Rol: Detectar reutilización exacta o visualmente similar de evidencias entre servicios.
 *
 * IMPORTANTE:
 * - SHA-256 bloquea reutilización exacta entre folios distintos.
 * - dHash detecta imágenes visualmente parecidas aunque hayan sido recomprimidas o recortadas.
 * - Una coincidencia perceptual NO acusa fraude automáticamente: exige nueva captura o revisión.
 * - Los reintentos del mismo archivo dentro del mismo folio deben seguir siendo permitidos.
 * - La reserva definitiva del hash debe ejecutarse en una transacción atómica de Firestore.
 * ======================================================================================
 */

import { sha256Blob } from "./b2c-evidence-engine.js";

export const B2C_EVIDENCE_DEDUP_VERSION = "1.0.0";

export const DEFAULT_DEDUP_POLICY = Object.freeze({
    perceptualHashSize: 8,
    perceptualRetakeDistance: 5,
    perceptualReviewDistance: 10,
    maxCandidates: 100
});

function textoSeguro(value, maxLength = 160) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function normalizarHex(value, expectedLength = null) {
    const normalized = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-f0-9]/g, "");

    if (!normalized) return null;
    if (expectedLength !== null && normalized.length !== expectedLength) return null;
    return normalized;
}

function esImagen(blob) {
    return blob instanceof Blob && String(blob.type || "").toLowerCase().startsWith("image/");
}

function bitsAHex(bits) {
    let output = "";

    for (let index = 0; index < bits.length; index += 4) {
        const nibble = bits
            .slice(index, index + 4)
            .padEnd(4, "0");

        output += Number.parseInt(nibble, 2).toString(16);
    }

    return output;
}

async function cargarFuenteImagen(blob) {
    if (!esImagen(blob)) {
        throw new TypeError("La huella perceptual requiere un archivo de imagen válido.");
    }

    if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(blob);
        return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            release() {
                bitmap.close?.();
            }
        };
    }

    if (typeof Image === "undefined" || typeof URL === "undefined") {
        throw new Error("IMAGE_DECODER_UNAVAILABLE");
    }

    const objectUrl = URL.createObjectURL(blob);

    try {
        const image = await new Promise((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
            element.src = objectUrl;
        });

        return {
            source: image,
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
            release() {
                URL.revokeObjectURL(objectUrl);
            }
        };
    } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
    }
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

    throw new Error("CANVAS_UNAVAILABLE");
}

/**
 * Genera un difference hash (dHash) de 64 bits por defecto.
 * El resultado tolera recomposición, recompresión y cambios moderados de brillo.
 */
export async function calcularDHashImagen(blob, options = {}) {
    const policy = {
        ...DEFAULT_DEDUP_POLICY,
        ...options
    };

    const hashSize = Math.max(
        4,
        Math.min(16, Number.parseInt(policy.perceptualHashSize, 10) || 8)
    );

    const image = await cargarFuenteImagen(blob);

    try {
        if (!image.width || !image.height) {
            throw new Error("IMAGE_DIMENSIONS_INVALID");
        }

        const canvas = crearCanvas(hashSize + 1, hashSize);
        const context = canvas.getContext("2d", {
            alpha: false,
            willReadFrequently: true
        });

        if (!context) {
            throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
        }

        context.drawImage(
            image.source,
            0,
            0,
            hashSize + 1,
            hashSize
        );

        const pixels = context.getImageData(
            0,
            0,
            hashSize + 1,
            hashSize
        ).data;

        const grayscale = [];

        for (let index = 0; index < pixels.length; index += 4) {
            const red = pixels[index];
            const green = pixels[index + 1];
            const blue = pixels[index + 2];
            grayscale.push(Math.round(0.299 * red + 0.587 * green + 0.114 * blue));
        }

        let bits = "";
        const rowWidth = hashSize + 1;

        for (let row = 0; row < hashSize; row += 1) {
            for (let column = 0; column < hashSize; column += 1) {
                const left = grayscale[row * rowWidth + column];
                const right = grayscale[row * rowWidth + column + 1];
                bits += left > right ? "1" : "0";
            }
        }

        return {
            algorithm: `dhash-${hashSize}x${hashSize}`,
            bits: bits.length,
            hex: bitsAHex(bits),
            sourceWidth: image.width,
            sourceHeight: image.height
        };
    } finally {
        image.release();
    }
}

export function distanciaHammingHex(hashA, hashB) {
    const left = normalizarHex(hashA);
    const right = normalizarHex(hashB);

    if (!left || !right || left.length !== right.length) {
        return Number.POSITIVE_INFINITY;
    }

    let distance = 0;

    for (let index = 0; index < left.length; index += 1) {
        const xor = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
        distance += xor.toString(2).split("1").length - 1;
    }

    return distance;
}

export async function generarHuellaEvidencia(blob, options = {}) {
    if (!(blob instanceof Blob)) {
        throw new TypeError("generarHuellaEvidencia requiere un Blob o File válido.");
    }

    const sha256 = await sha256Blob(blob);
    let perceptual = null;

    if (esImagen(blob)) {
        perceptual = await calcularDHashImagen(blob, options);
    }

    return {
        sha256,
        perceptual,
        contentType: textoSeguro(blob.type || "application/octet-stream", 100),
        sizeBytes: blob.size,
        generatedAtClient: new Date().toISOString(),
        engineVersion: B2C_EVIDENCE_DEDUP_VERSION
    };
}

export function crearIdRegistroHash(sha256) {
    const normalized = normalizarHex(sha256, 64);

    if (!normalized) {
        throw new TypeError("SHA-256 inválido para crear el registro de evidencia.");
    }

    return `sha256_${normalized}`;
}

export function crearRegistroHuella({
    fingerprint,
    serviceId,
    technicianId,
    customerId = null,
    evidenceId,
    eventType,
    storagePath = null
} = {}) {
    const sha256 = normalizarHex(fingerprint?.sha256, 64);

    if (!sha256) throw new TypeError("fingerprint.sha256 es obligatorio.");
    if (!serviceId) throw new TypeError("serviceId es obligatorio.");
    if (!technicianId) throw new TypeError("technicianId es obligatorio.");
    if (!evidenceId) throw new TypeError("evidenceId es obligatorio.");
    if (!eventType) throw new TypeError("eventType es obligatorio.");

    return {
        registryId: crearIdRegistroHash(sha256),
        sha256,
        perceptualHash: normalizarHex(fingerprint?.perceptual?.hex),
        perceptualAlgorithm: textoSeguro(fingerprint?.perceptual?.algorithm, 40) || null,
        serviceId: textoSeguro(serviceId, 128),
        technicianId: textoSeguro(technicianId, 128),
        customerId: customerId ? textoSeguro(customerId, 128) : null,
        evidenceId: textoSeguro(evidenceId, 160),
        eventType: textoSeguro(eventType, 80),
        storagePath: storagePath ? textoSeguro(storagePath, 500) : null,
        contentType: textoSeguro(fingerprint?.contentType, 100),
        sizeBytes: Number(fingerprint?.sizeBytes) || 0,
        fingerprintEngineVersion: B2C_EVIDENCE_DEDUP_VERSION,
        generatedAtClient: fingerprint?.generatedAtClient || new Date().toISOString(),
        active: true
    };
}

function normalizarCandidato(candidate) {
    if (!candidate || typeof candidate !== "object") return null;

    return {
        serviceId: textoSeguro(candidate.serviceId, 128),
        technicianId: textoSeguro(candidate.technicianId, 128),
        evidenceId: textoSeguro(candidate.evidenceId, 160),
        eventType: textoSeguro(candidate.eventType, 80),
        sha256: normalizarHex(candidate.sha256, 64),
        perceptualHash: normalizarHex(
            candidate.perceptualHash || candidate.perceptual?.hex
        )
    };
}

/**
 * Evalúa reutilización sin realizar lecturas ni escrituras en Firestore.
 * La capa integradora debe proporcionar:
 * - exactRecord: documento evidence_hashes/{sha256}, si existe.
 * - perceptualCandidates: candidatos recientes del mismo técnico u organización.
 */
export function evaluarReutilizacion({
    fingerprint,
    currentServiceId,
    currentTechnicianId,
    exactRecord = null,
    perceptualCandidates = [],
    policy = {}
} = {}) {
    const resolvedPolicy = {
        ...DEFAULT_DEDUP_POLICY,
        ...policy
    };

    const sha256 = normalizarHex(fingerprint?.sha256, 64);
    const perceptualHash = normalizarHex(fingerprint?.perceptual?.hex);

    if (!sha256 || !currentServiceId || !currentTechnicianId) {
        return {
            status: "invalid",
            allowUpload: false,
            reason: "DEDUP_INPUT_INCOMPLETE"
        };
    }

    const exact = normalizarCandidato(exactRecord);

    if (exact?.sha256 === sha256) {
        if (exact.serviceId === String(currentServiceId)) {
            return {
                status: "same_service_retry",
                allowUpload: true,
                reason: "EXACT_HASH_ALREADY_REGISTERED_SAME_SERVICE",
                exactMatch: exact
            };
        }

        return {
            status: "blocked_exact_duplicate",
            allowUpload: false,
            reason: "EXACT_HASH_USED_BY_ANOTHER_SERVICE",
            exactMatch: exact
        };
    }

    if (!perceptualHash) {
        return {
            status: "clear_exact_only",
            allowUpload: true,
            reason: "NO_EXACT_DUPLICATE_AND_NO_PERCEPTUAL_HASH"
        };
    }

    const candidates = (Array.isArray(perceptualCandidates) ? perceptualCandidates : [])
        .slice(0, resolvedPolicy.maxCandidates)
        .map(normalizarCandidato)
        .filter(Boolean)
        .filter((candidate) => (
            candidate.perceptualHash &&
            candidate.serviceId !== String(currentServiceId)
        ))
        .map((candidate) => ({
            ...candidate,
            hammingDistance: distanciaHammingHex(
                perceptualHash,
                candidate.perceptualHash
            )
        }))
        .filter((candidate) => Number.isFinite(candidate.hammingDistance))
        .sort((a, b) => a.hammingDistance - b.hammingDistance);

    const nearest = candidates[0] || null;

    if (!nearest) {
        return {
            status: "clear",
            allowUpload: true,
            reason: "NO_DUPLICATE_DETECTED"
        };
    }

    if (nearest.hammingDistance <= resolvedPolicy.perceptualRetakeDistance) {
        return {
            status: "retake_required",
            allowUpload: false,
            reason: "IMAGE_VISUALLY_MATCHES_PREVIOUS_SERVICE",
            nearestMatch: nearest,
            policy: resolvedPolicy
        };
    }

    if (nearest.hammingDistance <= resolvedPolicy.perceptualReviewDistance) {
        return {
            status: "review_required",
            allowUpload: false,
            reason: "IMAGE_VISUALLY_SIMILAR_TO_PREVIOUS_SERVICE",
            nearestMatch: nearest,
            policy: resolvedPolicy
        };
    }

    return {
        status: "clear",
        allowUpload: true,
        reason: "NO_DUPLICATE_DETECTED",
        nearestMatch: nearest,
        policy: resolvedPolicy
    };
}

export function crearEventoAuditoriaDuplicado({
    result,
    currentServiceId,
    currentTechnicianId,
    evidenceId,
    eventType,
    fingerprint
} = {}) {
    if (!result || typeof result !== "object") {
        throw new TypeError("result es obligatorio para registrar auditoría.");
    }

    return {
        type: "evidence_duplicate_check",
        status: textoSeguro(result.status, 80),
        reason: textoSeguro(result.reason, 160),
        allowUpload: result.allowUpload === true,
        serviceId: textoSeguro(currentServiceId, 128),
        technicianId: textoSeguro(currentTechnicianId, 128),
        evidenceId: textoSeguro(evidenceId, 160),
        eventType: textoSeguro(eventType, 80),
        sha256: normalizarHex(fingerprint?.sha256, 64),
        perceptualHash: normalizarHex(fingerprint?.perceptual?.hex),
        matchedServiceId:
            textoSeguro(
                result.exactMatch?.serviceId ||
                result.nearestMatch?.serviceId,
                128
            ) || null,
        matchedEvidenceId:
            textoSeguro(
                result.exactMatch?.evidenceId ||
                result.nearestMatch?.evidenceId,
                160
            ) || null,
        hammingDistance: Number.isFinite(result.nearestMatch?.hammingDistance)
            ? result.nearestMatch.hammingDistance
            : null,
        checkedAtClient: new Date().toISOString(),
        engineVersion: B2C_EVIDENCE_DEDUP_VERSION
    };
}
