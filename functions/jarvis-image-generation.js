"use strict";

const DEFAULT_MODEL = "gemini-3.1-flash-image";
const IMAGE_ACTUATOR_VERSION = "1.1.0-provider-fallback";
const MAX_FALLBACK_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_ASPECT_RATIOS = new Set([
    "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
]);
const ALLOWED_IMAGE_SIZES = new Set(["512", "1K", "2K"]);

function normalizeImageRequest(input = {}) {
    const prompt = String(input.prompt || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 3000);
    const aspectRatio = ALLOWED_ASPECT_RATIOS.has(input.aspectRatio)
        ? input.aspectRatio
        : "1:1";
    const imageSize = ALLOWED_IMAGE_SIZES.has(input.imageSize)
        ? input.imageSize
        : "1K";

    if (prompt.length < 8) {
        throw new Error("JARVIS_IMAGE_PROMPT_REQUIRED");
    }

    return { prompt, aspectRatio, imageSize };
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
    const response = await ai.models.generateContent({
        model,
        contents: request.prompt,
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
        status: "IMAGE_GENERATED",
        engine: "jarvis_gemini_image_generation",
        version: IMAGE_ACTUATOR_VERSION,
        model,
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
        imageSize: request.imageSize,
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
    normalizeImageRequest,
    resolveFallbackDimensions,
    runJarvisImageGeneration,
    runJarvisImageFallback
};
