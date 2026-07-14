"use strict";

const DEFAULT_MODEL = "gemini-3.1-flash-image";
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

module.exports = {
    DEFAULT_MODEL,
    ALLOWED_ASPECT_RATIOS,
    ALLOWED_IMAGE_SIZES,
    normalizeImageRequest,
    runJarvisImageGeneration
};
