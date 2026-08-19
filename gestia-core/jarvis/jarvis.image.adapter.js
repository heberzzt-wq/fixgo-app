export const JARVIS_IMAGE_ADAPTER_VERSION = "1.2.0-official-brand-logo-overlay-v12";

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

function base64ImageBlob(
    dataBase64 = "",
    mimeType = ""
) {
    const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
    if (!normalizedMimeType.startsWith("image/")) {
        throw new Error("IDENTITY_REFERENCE_MIME_INVALID");
    }

    let binary;
    try {
        binary = atob(String(dataBase64 || ""));
    }
    catch {
        throw new Error("IDENTITY_REFERENCE_BASE64_INVALID");
    }

    if (!binary.length) {
        throw new Error("IDENTITY_REFERENCE_EMPTY");
    }

    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: normalizedMimeType });
}

function drawContainedImage(
    context,
    bitmap,
    {
        x,
        y,
        width,
        height
    }
) {
    const scale = Math.min(width / bitmap.width, height / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;

    context.drawImage(
        bitmap,
        0,
        0,
        bitmap.width,
        bitmap.height,
        x + (width - drawWidth) / 2,
        y + (height - drawHeight) / 2,
        drawWidth,
        drawHeight
    );
}

function brandLogoPlacement(
    canvasWidth,
    canvasHeight,
    logoWidth,
    logoHeight,
    input = {}
) {
    const maxWidthRatio = Math.min(0.4, Math.max(0.08, Number(input.maxWidthRatio) || 0.22));
    const maxHeightRatio = Math.min(0.35, Math.max(0.06, Number(input.maxHeightRatio) || 0.16));
    const marginRatio = Math.min(0.12, Math.max(0.01, Number(input.marginRatio) || 0.035));
    const maxWidth = canvasWidth * maxWidthRatio;
    const maxHeight = canvasHeight * maxHeightRatio;
    const scale = Math.min(maxWidth / logoWidth, maxHeight / logoHeight, 1);
    const width = Math.max(1, logoWidth * scale);
    const height = Math.max(1, logoHeight * scale);
    const margin = Math.max(8, Math.round(Math.min(canvasWidth, canvasHeight) * marginRatio));
    const position = String(input.position || "top-right").trim().toLowerCase();

    let x = margin;
    let y = margin;
    if (position.includes("right")) x = canvasWidth - width - margin;
    if (position.includes("bottom")) y = canvasHeight - height - margin;

    return {
        x: Math.max(0, x),
        y: Math.max(0, y),
        width,
        height,
        margin,
        position
    };
}

export async function overlayBrandLogo(input = {}) {
    if (typeof createImageBitmap !== "function") throw new Error("IMAGE_BITMAP_UNAVAILABLE");
    const imageBase64 = String(input.imageBase64 || "").trim();
    const imageMimeType = String(input.imageMimeType || "").trim().toLowerCase();
    const logoBase64 = String(input.logoBase64 || "").trim();
    const logoMimeType = String(input.logoMimeType || "").trim().toLowerCase();
    if (!imageBase64 || !imageMimeType.startsWith("image/")) throw new Error("BRAND_IMAGE_SOURCE_REQUIRED");
    if (!logoBase64 || !logoMimeType.startsWith("image/")) throw new Error("BRAND_LOGO_SOURCE_REQUIRED");

    const imageBitmap = await createImageBitmap(base64ImageBlob(imageBase64, imageMimeType));
    const logoBitmap = await createImageBitmap(base64ImageBlob(logoBase64, logoMimeType));
    try {
        if (!imageBitmap.width || !imageBitmap.height || !logoBitmap.width || !logoBitmap.height) {
            throw new Error("BRAND_LOGO_DIMENSIONS_INVALID");
        }
        const canvas = canvasFor(imageBitmap.width, imageBitmap.height);
        const exportMimeType = ["image/png", "image/jpeg", "image/webp"].includes(imageMimeType)
            ? imageMimeType
            : "image/png";
        const context = canvas.getContext("2d", { alpha: exportMimeType !== "image/jpeg" });
        if (!context) throw new Error("BRAND_LOGO_CANVAS_UNAVAILABLE");

        context.drawImage(
            imageBitmap,
            0,
            0,
            imageBitmap.width,
            imageBitmap.height,
            0,
            0,
            imageBitmap.width,
            imageBitmap.height
        );

        const placement = brandLogoPlacement(
            imageBitmap.width,
            imageBitmap.height,
            logoBitmap.width,
            logoBitmap.height,
            input
        );
        context.drawImage(
            logoBitmap,
            0,
            0,
            logoBitmap.width,
            logoBitmap.height,
            placement.x,
            placement.y,
            placement.width,
            placement.height
        );

        const blob = await canvasBlob(
            canvas,
            exportMimeType,
            exportMimeType === "image/png" ? 1 : 0.94
        );
        if (!blob.size) throw new Error("BRAND_LOGO_COMPOSITE_EMPTY");
        return {
            ok: true,
            status: "OFFICIAL_BRAND_LOGO_OVERLAY_APPLIED",
            imageBase64: await blobToBase64(blob),
            mimeType: exportMimeType,
            bytes: blob.size,
            width: imageBitmap.width,
            height: imageBitmap.height,
            logoSourceWidth: logoBitmap.width,
            logoSourceHeight: logoBitmap.height,
            placement,
            logoOverlayApplied: true,
            logoPixelSource: "DECODED_OFFICIAL_SOURCE_BYTES",
            generatedLogoAllowed: false
        };
    }
    finally {
        imageBitmap.close?.();
        logoBitmap.close?.();
    }
}

export async function buildIdentityReferenceSheet(
    input = {}
) {
    const supplied = Array.isArray(input.references) ? input.references : [];
    const unique = [];
    const seen = new Set();

    for (const reference of supplied) {
        const sourceOutput = String(reference?.sourceOutput || "").trim();
        if (!sourceOutput || seen.has(sourceOutput)) continue;

        const dataBase64 = String(reference?.dataBase64 || "").trim();
        const mimeType = String(reference?.mimeType || "").trim().toLowerCase();
        if (!dataBase64 || !mimeType.startsWith("image/")) continue;

        seen.add(sourceOutput);
        unique.push({ sourceOutput, dataBase64, mimeType });
        if (unique.length >= 4) break;
    }

    if (unique.length < 2) {
        throw new Error("IDENTITY_REFERENCE_MULTIPLE_REQUIRED");
    }

    const primaryOutput = String(input.primarySourceOutput || unique[0].sourceOutput).trim();
    const primary = unique.find(item => item.sourceOutput === primaryOutput) || unique[0];
    const ordered = [primary, ...unique.filter(item => item !== primary)];
    const bitmaps = [];

    try {
        for (const reference of ordered) {
            const bitmap = await createImageBitmap(
                base64ImageBlob(reference.dataBase64, reference.mimeType)
            );
            if (!bitmap.width || !bitmap.height) {
                throw new Error("IDENTITY_REFERENCE_DIMENSIONS_INVALID");
            }
            bitmaps.push(bitmap);
        }

        const width = 1024;
        const height = 1024;
        const gap = 12;
        const primaryWidth = 650;
        const canvas = canvasFor(width, height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("IDENTITY_REFERENCE_CANVAS_UNAVAILABLE");

        if (typeof context.fillRect === "function") {
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, width, height);
        }

        drawContainedImage(
            context,
            bitmaps[0],
            {
                x: gap,
                y: gap,
                width: primaryWidth - gap * 2,
                height: height - gap * 2
            }
        );

        const secondaryCount = bitmaps.length - 1;
        const secondaryWidth = width - primaryWidth - gap * 2;
        const secondaryHeight = (height - gap * (secondaryCount + 1)) / secondaryCount;

        for (let index = 1; index < bitmaps.length; index += 1) {
            drawContainedImage(
                context,
                bitmaps[index],
                {
                    x: primaryWidth + gap,
                    y: gap + (index - 1) * (secondaryHeight + gap),
                    width: secondaryWidth,
                    height: secondaryHeight
                }
            );
        }

        const blob = await canvasBlob(canvas, "image/png", 1);
        if (!blob.size) throw new Error("IDENTITY_REFERENCE_EXPORT_EMPTY");

        return {
            ok: true,
            status: "IDENTITY_REFERENCE_SHEET_READY",
            composite: true,
            referenceCount: ordered.length,
            primarySourceOutput: primary.sourceOutput,
            referenceOutputs: ordered.map(item => item.sourceOutput),
            mimeType: "image/png",
            bytes: blob.size,
            width,
            height,
            dataBase64: await blobToBase64(blob)
        };
    }
    finally {
        bitmaps.forEach(bitmap => bitmap.close?.());
    }
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
