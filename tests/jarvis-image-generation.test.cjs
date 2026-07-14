"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
    normalizeImageRequest,
    runJarvisImageGeneration
} = require("../functions/jarvis-image-generation");

test("image generation validates and bounds its public request", () => {
    assert.throws(
        () => normalizeImageRequest({ prompt: "short" }),
        /JARVIS_IMAGE_PROMPT_REQUIRED/
    );
    const request = normalizeImageRequest({
        prompt: "Genera un tablero futurista para FixGo",
        aspectRatio: "16:9",
        imageSize: "2K"
    });
    assert.equal(request.aspectRatio, "16:9");
    assert.equal(request.imageSize, "2K");
});

test("image generation returns a real image part and ignores thought parts", async () => {
    const ai = {
        models: {
            generateContent: async () => ({
                candidates: [{
                    content: {
                        parts: [
                            { thought: true, inlineData: { mimeType: "image/png", data: "aW50ZXJpbQ==" } },
                            { text: "Imagen lista" },
                            { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } }
                        ]
                    }
                }]
            })
        }
    };
    const result = await runJarvisImageGeneration({
        ai,
        input: { prompt: "Crea una imagen de prueba completa" }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "IMAGE_GENERATED");
    assert.equal(result.imageBase64, "aW1hZ2U=");
    assert.equal(result.text, "Imagen lista");
});
