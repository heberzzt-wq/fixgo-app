"use strict";

const { createHash } = require("node:crypto");

const DEFAULT_MODEL = "gemini-3.1-flash-image";
const IMAGE_ACTUATOR_VERSION = "1.2.0-grounded-editing";
const MAX_FALLBACK_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_ASPECT_RATIOS = new Set([
    "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
]);
const ALLOWED_IMAGE_SIZES = new Set(["512", "1K", "2K"]);

function collapseWhitespace(value = "") {
    let result = "";
    let separating = false;
    for (const character of String(value || "")) {
        if (character.charCodeAt(0) <= 32) {
            separating = Boolean(result);
            continue;
        }
        if (separating && result) result += " ";
        result += character;
        separating = false;
        if (result.length >= 3000) break;
    }
    return result.trim();
}

function normalizeImageRequest(input = {}) {
    const prompt = collapseWhitespace(input.prompt);
    const aspectRatio = ALLOWED_ASPECT_RATIOS.has(input.aspectRatio)
        ? input.aspectRatio
        : "1:1";
    const imageSize = ALLOWED_IMAGE_SIZES.has(input.imageSize)
        ? input.imageSize
        : "1K";

    if (prompt.length < 8) {
        throw new Error("JARVIS_IMAGE_PROMPT_REQUIRED");
    }

    const sourceImageBase64 = String(input.sourceImageBase64 || "");
    const sourceMimeType = String(input.sourceMimeType || "").toLowerCase();
    const transformations = Array.isArray(input.transformations)
        ? input.transformations.map(value => String(value || "").trim()).filter(Boolean).slice(0, 20)
        : [];
    let sourceBytes = null;
    if (sourceImageBase64) {
        sourceBytes = Buffer.from(sourceImageBase64, "base64");
        if (!sourceMimeType.startsWith("image/") || sourceBytes.length === 0 || sourceBytes.length > MAX_SOURCE_IMAGE_BYTES) {
            throw new Error("JARVIS_IMAGE_SOURCE_INVALID");
        }
        if (sourceBytes.toString("base64") !== sourceImageBase64.replaceAll("\r", "").replaceAll("\n", "")) {
            throw new Error("JARVIS_IMAGE_SOURCE_BASE64_INVALID");
        }
        if (transformations.length === 0) throw new Error("JARVIS_IMAGE_TRANSFORMATIONS_REQUIRED");
    }

    return {
        prompt,
        aspectRatio,
        imageSize,
        sourceImageBase64,
        sourceMimeType,
        sourceBytes,
        transformations,
        sourceOutput: String(input.sourceOutput || ""),
        objectiveId: String(input.objectiveId || ""),
        preserveLogos: input.preserveLogos !== false,
        preserveApprovedText: input.preserveApprovedText !== false
    };
}

async function runJarvisImageGeneration({
    ai,
    input,
    model = DEFAULT_MODEL
} = {}) {
    if (!ai?.models?.generateContent) {
        throw new Error("JARVIS_IMAGE_AI_REQUIRED");
    }

    const request = normalizeImageRequest(input);
    const editInstruction = request.sourceBytes
        ? `Edita la imagen adjunta. Transformaciones solicitadas: ${request.transformations.join("; ")}. ${request.preserveLogos ? "Conserva sin redibujar los logotipos existentes." : "Los logotipos pueden cambiar sólo si la instrucción lo exige."} ${request.preserveApprovedText ? "Conserva exactamente todo texto aprobado y no inventes texto nuevo." : "Modifica texto sólo cuando la instrucción lo exija."} Objetivo visual: ${request.prompt}`
        : request.prompt;
    const contents = request.sourceBytes
        ? [{ role: "user", parts: [
            { text: editInstruction },
            { inlineData: { mimeType: request.sourceMimeType, data: request.sourceImageBase64 } }
        ] }]
        : request.prompt;
    const response = await ai.models.generateContent({
        model,
        contents,
        config: {
            responseModalities: ["TEXT", "IMAGE"],
            responseFormat: {
                image: {
                    aspectRatio: request.aspectRatio,
                    imageSize: request.imageSize
                }
            }
        }
    });
    const parts = response?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(part =>
        part?.thought !== true &&
        typeof part?.inlineData?.data === "string" &&
        String(part?.inlineData?.mimeType || "").startsWith("image/")
    );
    const text = parts
        .filter(part => part?.thought !== true && typeof part?.text === "string")
        .map(part => part.text.trim())
        .filter(Boolean)
        .join("\n")
        .slice(0, 2000);

    if (!imagePart) {
        throw new Error("JARVIS_IMAGE_OUTPUT_MISSING");
    }

    return {
        ok: true,
        status: request.sourceBytes ? "IMAGE_EDITED" : "IMAGE_GENERATED",
        engine: "jarvis_gemini_image_generation",
        version: IMAGE_ACTUATOR_VERSION,
        model,
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
        imageSize: request.imageSize,
        provider: "google",
        action: request.sourceBytes ? "edit" : "generate",
        sourceOutput: request.sourceOutput || null,
        sourceMimeType: request.sourceMimeType || null,
        sourceSha256: request.sourceBytes ? createHash("sha256").update(request.sourceBytes).digest("hex") : null,
        transformations: request.transformations,
        objectiveId: request.objectiveId || null,
        preserveLogos: request.preserveLogos,
        preserveApprovedText: request.preserveApprovedText,
        mimeType: imagePart.inlineData.mimeType,
        imageBase64: imagePart.inlineData.data,
        bytes: Buffer.byteLength(imagePart.inlineData.data, "base64"),
        text,
        policy: {
            synthIdExpected: true,
            authenticatedAdminOnly: true
        }
    };
}

function resolveFallbackDimensions(aspectRatio = "1:1", imageSize = "1K") {
    const base = imageSize === "512" ? 512 : 1024;
    const [widthRatio, heightRatio] = String(aspectRatio || "1:1")
        .split(":")
        .map(value => Math.max(1, Number.parseInt(value, 10) || 1));
    const scale = Math.min(base / widthRatio, base / heightRatio);

    return {
        width: Math.max(256, Math.round(widthRatio * scale / 8) * 8),
        height: Math.max(256, Math.round(heightRatio * scale / 8) * 8)
    };
}

async function runJarvisImageFallback({
    fetchImpl = global.fetch,
    input
} = {}) {
    if (typeof fetchImpl !== "function") {
        throw new Error("JARVIS_IMAGE_FALLBACK_FETCH_REQUIRED");
    }

    const request = normalizeImageRequest(input);
    if (request.sourceBytes) throw new Error("JARVIS_IMAGE_EDIT_FALLBACK_NOT_ALLOWED");
    const dimensions = resolveFallbackDimensions(
        request.aspectRatio,
        request.imageSize
    );
    const endpoint = new URL(
        `https://image.pollinations.ai/prompt/${encodeURIComponent(request.prompt)}`
    );
    endpoint.searchParams.set("width", String(dimensions.width));
    endpoint.searchParams.set("height", String(dimensions.height));
    endpoint.searchParams.set("model", "flux");
    endpoint.searchParams.set("safe", "true");
    endpoint.searchParams.set("nologo", "true");

    const response = await fetchImpl(endpoint, {
        headers: {
            "User-Agent": "Gestia-Jarvis-V7/1.1"
        },
        signal: AbortSignal.timeout(90000)
    });
    const mimeType = String(response.headers?.get?.("content-type") || "")
        .split(";")[0]
        .trim();

    if (!response.ok || !mimeType.startsWith("image/")) {
        throw new Error(`JARVIS_IMAGE_FALLBACK_HTTP_${response.status}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_FALLBACK_IMAGE_BYTES) {
        throw new Error("JARVIS_IMAGE_FALLBACK_SIZE_INVALID");
    }

    return {
        ok: true,
        status: "IMAGE_GENERATED_FALLBACK",
        engine: "jarvis_pollinations_image_fallback",
        provider: "pollinations",
        version: IMAGE_ACTUATOR_VERSION,
        model: "flux",
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
        imageSize: request.imageSize,
        width: dimensions.width,
        height: dimensions.height,
        mimeType,
        imageBase64: bytes.toString("base64"),
        bytes: bytes.length,
        text: "Imagen generada por el proveedor de respaldo porque Gemini no estuvo disponible.",
        policy: {
            synthIdExpected: true,
            authenticatedAdminOnly: true,
            safeMode: true,
            fallback: true
        }
    };
}

module.exports = {
    DEFAULT_MODEL,
    IMAGE_ACTUATOR_VERSION,
    ALLOWED_ASPECT_RATIOS,
    ALLOWED_IMAGE_SIZES,
    MAX_FALLBACK_IMAGE_BYTES,
    MAX_SOURCE_IMAGE_BYTES,
    collapseWhitespace,
    normalizeImageRequest,
    resolveFallbackDimensions,
    runJarvisImageGeneration,
    runJarvisImageFallback
};
