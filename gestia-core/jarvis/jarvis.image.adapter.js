export const JARVIS_IMAGE_ADAPTER_VERSION = "1.3.0-local-ad-composition-v142";

// Copy and asset selection belong to the semantic planner. This adapter only renders its arguments.
export const IMAGE_COMPOSITION_SCHEMA = {
    type: "object", description: "Componer un anuncio nuevo con textos decididos por Qwen y una región fotográfica del original. No reutiliza el texto incrustado fuera de photoCrop. Requiere brandLogoOutput.",
    properties: {
        layout: { type: "string", enum: ["split", "stack"] },
        headline: { type: "string", maxLength: 140 },
        body: { type: "string", maxLength: 240 },
        brandName: { type: "string", maxLength: 100 },
        cta: { type: "string", maxLength: 90 },
        contact: { type: "string", maxLength: 120 },
        inkColor: { type: "string", description: "Color hexadecimal #RRGGBB, opcional." },
        accentColor: { type: "string", description: "Color hexadecimal #RRGGBB, opcional." },
        photoCrop: { type: "object", description: "Coordenadas en píxeles del original; usar la photoRegion verificada del inventario cuando exista. No inventar coordenadas.",
            properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } },
            required: ["x", "y", "width", "height"] }
    }, required: ["layout", "headline", "body", "brandName", "cta", "contact", "photoCrop"]
};

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
    if (!id || id.length > 96 || !Array.from(id).every(character => {
        const code = character.charCodeAt(0);
        return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || character === "-" || character === "_";
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

function compositionSpec(input, bitmap) {
    const spec = input.composition;
    if (!spec || typeof spec !== "object") return null;
    if (!["split", "stack"].includes(spec.layout)) throw new Error("IMAGE_COMPOSITION_LAYOUT_INVALID");
    const copy = {};
    for (const [key, maximum] of Object.entries({ headline: 140, body: 240, brandName: 100, cta: 90, contact: 120 })) {
        copy[key] = String(spec[key] || "").replace(/\s+/g, " ").trim();
        if (!copy[key] || copy[key].length > maximum) throw new Error(`IMAGE_COMPOSITION_TEXT_INVALID:${key}`);
    }
    const crop = spec.photoCrop;
    if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.x < 0 || crop.y < 0 ||
        crop.width < 1 || crop.height < 1 || crop.x + crop.width > bitmap.width || crop.y + crop.height > bitmap.height) {
        throw new Error("IMAGE_PHOTO_CROP_INVALID");
    }
    return { ...copy, layout: spec.layout, photoCrop: { ...crop },
        inkColor: /^#[\da-f]{6}$/i.test(spec.inkColor || "") ? spec.inkColor : "#102a43",
        accentColor: /^#[\da-f]{6}$/i.test(spec.accentColor || "") ? spec.accentColor : "#245e91" };
}

function drawCopy(context, value, box, { size, minimum, color, bold = false } = {}) {
    let lines;
    for (; size >= minimum; size -= 1) {
        context.font = `${bold ? "700" : "400"} ${size}px Arial, sans-serif`;
        lines = [""];
        let fits = true;
        for (const word of value.split(" ")) {
            if (context.measureText(word).width > box.width) { fits = false; break; }
            const next = [lines.at(-1), word].filter(Boolean).join(" ");
            if (context.measureText(next).width <= box.width) lines[lines.length - 1] = next;
            else lines.push(word);
        }
        if (fits && lines.length * size * 1.18 <= box.height) break;
    }
    if (size < minimum) throw new Error("IMAGE_COMPOSITION_TEXT_OVERFLOW:Reducir el texto para mantenerlo legible");
    context.fillStyle = color;
    context.textBaseline = "top";
    lines.forEach((line, index) => context.fillText(line, box.x, box.y + index * size * 1.18));
}

function visibleLogoBounds(bitmap) {
    const canvas = canvasFor(bitmap.width, bitmap.height), context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let left = bitmap.width, top = bitmap.height, right = -1, bottom = -1;
    for (let y = 0; y < bitmap.height; y++) for (let x = 0; x < bitmap.width; x++) {
        if (pixels[(y * bitmap.width + x) * 4 + 3] > 0) {
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
    }
    if (right < left) throw new Error("BRAND_LOGO_EMPTY");
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function renderComposition(context, bitmap, logo, logoBounds, variant, spec) {
    const w = variant.width, h = variant.height, m = w * 0.055;
    const box = (x, y, width, height) => ({ x: w * x, y: h * y, width: w * width, height: h * height });
    const split = spec.layout === "split";
    const photo = split ? box(0.55, 0, 0.45, 1) : box(0, 0.38, 1, 0.34);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, w, h);
    const region = spec.photoCrop;
    // Preserve the entire curated photo: a second cover crop can cut faces off.
    const crop = { ...region };
    const photoScale = Math.min(photo.width / region.width, photo.height / region.height);
    const photoWidth = region.width * photoScale, photoHeight = region.height * photoScale;
    context.fillStyle = "#edf3f8";
    context.fillRect(photo.x, photo.y, photo.width, photo.height);
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height,
        photo.x + (photo.width - photoWidth) / 2, photo.y + (photo.height - photoHeight) / 2, photoWidth, photoHeight);
    const logoBox = split ? box(0.055, 0.04, 0.31, 0.15) : box(0.055, 0.035, 0.24, 0.125);
    const scale = Math.min(logoBox.width / logoBounds.width, logoBox.height / logoBounds.height);
    context.drawImage(logo, logoBounds.x, logoBounds.y, logoBounds.width, logoBounds.height,
        logoBox.x, logoBox.y, logoBounds.width * scale, logoBounds.height * scale);
    const areas = split ? {
        headline: box(0.055, 0.245, 0.445, 0.255), body: box(0.055, 0.53, 0.445, 0.145),
        brandName: box(0.055, 0.705, 0.445, 0.07), cta: box(0.073, 0.825, 0.409, 0.068),
        contact: box(0.055, 0.94, 0.445, 0.044)
    } : {
        headline: box(0.055, 0.205, 0.89, 0.145), body: box(0.055, 0.75, 0.89, 0.071),
        brandName: box(0.34, 0.05, 0.60, 0.105), cta: box(0.073, 0.858, 0.854, 0.05),
        contact: box(0.055, 0.945, 0.89, 0.033)
    };
    context.fillStyle = spec.accentColor;
    context.fillRect(m, h * (split ? 0.807 : 0.843), w * (split ? 0.445 : 0.89), h * (split ? 0.098 : 0.07));
    for (const key of ["headline", "body", "brandName", "cta", "contact"]) {
        drawCopy(context, spec[key], areas[key], {
            size: w * (key === "headline" ? 0.063 : key === "body" ? 0.033 : 0.031),
            minimum: w * (key === "headline" ? 0.035 : 0.021),
            color: key === "cta" ? "#ffffff" : spec.inkColor,
            bold: key !== "body"
        });
    }
    return crop;
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
    let logo;
    try {
        const composition = compositionSpec(input, bitmap);
        if (composition && (!input.logoBase64 || !input.logoMimeType)) throw new Error("BRAND_LOGO_SOURCE_REQUIRED");
        if (composition) logo = await createImageBitmap(base64ImageBlob(input.logoBase64, input.logoMimeType));
        const logoBounds = logo ? visibleLogoBounds(logo) : null;
        for (const variant of plan.variants) {
            const canvas = canvasFor(variant.width, variant.height);
            const context = canvas.getContext("2d", { alpha: variant.mimeType !== "image/jpeg" });
            if (!context) throw new Error("IMAGE_CANVAS_CONTEXT_UNAVAILABLE");
            const contain = input.fit === "contain";
            let crop = contain
                ? { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
                : cropBox(bitmap.width, bitmap.height, variant.width, variant.height);
            if (composition) {
                crop = renderComposition(context, bitmap, logo, logoBounds, variant, composition);
            } else if (contain) {
                context.fillStyle = /^#[0-9a-f]{6}$/i.test(input.background || "") ? input.background : "#ffffff";
                context.fillRect(0, 0, variant.width, variant.height);
                drawContainedImage(context, bitmap, { x: 0, y: 0, width: variant.width, height: variant.height });
            } else {
                context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, variant.width, variant.height);
            }
            const blob = await canvasBlob(canvas, variant.mimeType, variant.quality);
            if (!blob.size) throw new Error("IMAGE_VARIANT_EMPTY");
            outputs.push({ ...variant, bytes: blob.size, dataBase64: await blobToBase64(blob), crop,
                ...(composition ? { compositionApplied: true, logoOverlayApplied: true, composition } : {}) });
        }
    } finally {
        bitmap.close?.();
        logo?.close?.();
    }
    return { ...plan, sourceWidth, sourceHeight, outputs };
}
