export const JARVIS_IMAGE_ADAPTER_VERSION = "1.0.0-source-only-browser-canvas";

const DEFAULT_VARIANTS = Object.freeze([
    { id: "hero", width: 1920, height: 1080, mimeType: "image/webp", quality: 0.86 },
    { id: "card", width: 1080, height: 1080, mimeType: "image/webp", quality: 0.84 },
    { id: "reel", width: 1080, height: 1920, mimeType: "image/webp", quality: 0.86 },
    { id: "thumbnail", width: 192, height: 192, mimeType: "image/webp", quality: 0.8 },
    { id: "app", width: 512, height: 512, mimeType: "image/png", quality: 1 }
]);

function boundedInteger(value, field) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 64 || number > 4096) throw new Error(`${field}_OUT_OF_RANGE`);
    return number;
}

function normalizeVariant(variant = {}) {
    const id = String(variant.id || "").trim();
    if (!id || !Array.from(id).every(character => {
        const code = character.charCodeAt(0);
        return (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || character === "-";
    })) throw new Error("IMAGE_VARIANT_ID_INVALID");
    const mimeType = String(variant.mimeType || "image/webp").trim().toLowerCase();
    if (mimeType !== "image/webp" && mimeType !== "image/png" && mimeType !== "image/jpeg") throw new Error("IMAGE_VARIANT_MIME_INVALID");
    const quality = Number(variant.quality ?? 0.86);
    if (!Number.isFinite(quality) || quality < 0.5 || quality > 1) throw new Error("IMAGE_VARIANT_QUALITY_INVALID");
    return { id, width: boundedInteger(variant.width, "IMAGE_WIDTH"), height: boundedInteger(variant.height, "IMAGE_HEIGHT"), mimeType, quality };
}

export function planImageAdaptation(input = {}) {
    const variants = (Array.isArray(input.variants) && input.variants.length ? input.variants : DEFAULT_VARIANTS).map(normalizeVariant);
    if (variants.length > 12) throw new Error("IMAGE_VARIANT_LIMIT_EXCEEDED");
    if (new Set(variants.map(variant => variant.id)).size !== variants.length) throw new Error("IMAGE_VARIANT_DUPLICATED");
    return {
        ok: true,
        version: JARVIS_IMAGE_ADAPTER_VERSION,
        strategy: "SOURCE_ONLY_COVER_CROP",
        originalPreserved: true,
        generatedContentUsed: false,
        variants
    };
}

function cropBox(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;
    if (sourceRatio > targetRatio) {
        const width = sourceHeight * targetRatio;
        return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
    }
    const height = sourceWidth / targetRatio;
    return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(binary);
}

function canvasFor(width, height) {
    if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
    if (globalThis.document?.createElement) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    throw new Error("IMAGE_CANVAS_UNAVAILABLE");
}

async function canvasBlob(canvas, mimeType, quality) {
    if (typeof canvas.convertToBlob === "function") return await canvas.convertToBlob({ type: mimeType, quality });
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("IMAGE_CANVAS_EXPORT_FAILED")), mimeType, quality));
}

export async function adaptImageSource(input = {}) {
    if (typeof createImageBitmap !== "function") throw new Error("IMAGE_BITMAP_UNAVAILABLE");
    const sourceBase64 = String(input.sourceBase64 || "").trim();
    const sourceMimeType = String(input.sourceMimeType || "").trim().toLowerCase();
    if (!sourceBase64 || !sourceMimeType.startsWith("image/")) throw new Error("IMAGE_SOURCE_REQUIRED");
    const plan = planImageAdaptation(input);
    const source = await (await fetch(`data:${sourceMimeType};base64,${sourceBase64}`)).blob();
    const bitmap = await createImageBitmap(source);
    if (!bitmap.width || !bitmap.height) throw new Error("IMAGE_SOURCE_DIMENSIONS_INVALID");
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const outputs = [];
    try {
        for (const variant of plan.variants) {
            const canvas = canvasFor(variant.width, variant.height);
            const context = canvas.getContext("2d", { alpha: variant.mimeType !== "image/jpeg" });
            if (!context) throw new Error("IMAGE_CANVAS_CONTEXT_UNAVAILABLE");
            const crop = cropBox(bitmap.width, bitmap.height, variant.width, variant.height);
            context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, variant.width, variant.height);
            const blob = await canvasBlob(canvas, variant.mimeType, variant.quality);
            if (!blob.size) throw new Error("IMAGE_VARIANT_EMPTY");
            outputs.push({ ...variant, bytes: blob.size, dataBase64: await blobToBase64(blob), crop });
        }
    } finally {
        bitmap.close?.();
    }
    return { ...plan, sourceWidth, sourceHeight, outputs };
}
