"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const {
    IMAGE_ACTUATOR_VERSION,
    normalizeImageRequest,
    resolveFallbackDimensions,
    runJarvisImageGeneration,
    runJarvisImageFallback
} = require("../functions/jarvis-image-generation");

test("image generation validates and bounds its public request", () => {
    assert.equal(IMAGE_ACTUATOR_VERSION, "1.2.0-grounded-editing");
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

test("image editing sends the real source image and records transformations", async () => {
    let request;
    const ai = {
        models: {
            generateContent: async input => {
                request = input;
                return { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/webp", data: "ZWRpdGVk" } }] } }] };
            }
        }
    };
    const source = Buffer.from("source-image");
    const result = await runJarvisImageGeneration({
        ai,
        input: {
            prompt: "Convierte esta fotografía en un hero horizontal limpio",
            sourceImageBase64: source.toString("base64"),
            sourceMimeType: "image/png",
            sourceOutput: ".jarvis-artifacts/uploads/source.png",
            transformations: ["recortar a hero", "conservar logotipo"],
            aspectRatio: "16:9",
            objectiveId: "OBJ-IMAGE-1"
        }
    });
    assert.equal(result.status, "IMAGE_EDITED");
    assert.equal(result.action, "edit");
    assert.equal(result.provider, "google");
    assert.equal(result.sourceOutput, ".jarvis-artifacts/uploads/source.png");
    assert.equal(result.sourceSha256.length, 64);
    assert.deepEqual(result.transformations, ["recortar a hero", "conservar logotipo"]);
    assert.equal(result.objectiveId, "OBJ-IMAGE-1");
    assert.equal(request.contents[0].parts[1].inlineData.data, source.toString("base64"));
    await assert.rejects(
        () => runJarvisImageFallback({ input: {
            prompt: "Edita esta imagen",
            sourceImageBase64: source.toString("base64"),
            sourceMimeType: "image/png",
            transformations: ["recortar"]
        } }),
        /JARVIS_IMAGE_EDIT_FALLBACK_NOT_ALLOWED/
    );
});

test("image fallback returns bounded real image bytes", async () => {
    const result = await runJarvisImageFallback({
        input: {
            prompt: "Genera un tablero futurista azul para GestiaPremium",
            aspectRatio: "16:9",
            imageSize: "1K"
        },
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            headers: { get: () => "image/jpeg" },
            arrayBuffer: async () => Buffer.from("real-image-bytes")
        })
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "IMAGE_GENERATED_FALLBACK");
    assert.equal(result.provider, "pollinations");
    assert.equal(result.mimeType, "image/jpeg");
    assert.equal(Buffer.from(result.imageBase64, "base64").toString(), "real-image-bytes");
    assert.deepEqual(resolveFallbackDimensions("16:9", "1K"), {
        width: 1024,
        height: 576
    });
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

test("Firebase workflow deploys the image actuator with the Jarvis services", () => {
    const workflow = fs.readFileSync(
        path.resolve(__dirname, "../.github/workflows/deploy.yml"),
        "utf8"
    );
    const client = fs.readFileSync(
        path.resolve(__dirname, "../gestia-core/jarvis/jarvis.actuator.pack.js"),
        "utf8"
    );

    assert.match(workflow, /functions:jarvisImageGenerate/);
    const functionsIndex = fs.readFileSync(
        path.resolve(__dirname, "../functions/index.js"),
        "utf8"
    );
    assert.match(
        functionsIndex,
        /exports\.jarvisImageGenerate[\s\S]{0,240}secrets:\s*\["GEMINI_KEY"\]/
    );
    assert.match(client, /CLOUD_FUNCTION_INVALID_RESPONSE_/);
    assert.match(client, /await response\.text\(\)/);
    assert.match(functionsIndex, /runJarvisImageFallback/);
    assert.match(functionsIndex, /credentialFailure/);
});
