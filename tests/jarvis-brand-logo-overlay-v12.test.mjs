import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
    registerJarvisActuatorTools
} from "../gestia-core/jarvis/jarvis.actuator.pack.js";

function createRuntime() {
    const registry = new Map();
    return {
        register(tool) {
            registry.set(tool.name, tool);
            return { ok: true, tool: tool.name };
        },
        get: name => registry.get(name),
        has: name => registry.has(name),
        list: () => [...registry.values()]
    };
}

function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

test("brand-scene image.edit forbids generated logos and composites the official logo after provider output", async () => {
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousBitmap = globalThis.createImageBitmap;
    const PreviousCanvas = globalThis.OffscreenCanvas;

    const sourceBytes = Buffer.from("verified-real-business-photo");
    const logoBytes = Buffer.from("official-hmh-logo-source-bytes");
    const generatedBytes = Buffer.from("provider-social-scene-without-logo");
    const compositeBytes = Buffer.from("provider-scene-plus-official-logo-overlay");
    const sourceBase64 = sourceBytes.toString("base64");
    const logoBase64 = logoBytes.toString("base64");
    const generatedBase64 = generatedBytes.toString("base64");
    const compositeBase64 = compositeBytes.toString("base64");

    let providerPayload = null;
    let savedImageBase64 = null;
    const draws = [];
    let bitmapCount = 0;

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken: async () => "test-token"
            }
        };

        globalThis.fetch = async (_url, options = {}) => {
            providerPayload = JSON.parse(options.body).data;
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    result: {
                        ok: true,
                        status: "IMAGE_EDITED",
                        action: "edit",
                        provider: "google",
                        model: "test-image-model",
                        mimeType: "image/png",
                        sourceSha256: sha256(Buffer.from(providerPayload.sourceImageBase64, "base64")),
                        transformations: providerPayload.transformations,
                        imageBase64: generatedBase64
                    }
                })
            };
        };

        globalThis.createImageBitmap = async () => {
            bitmapCount += 1;
            return bitmapCount === 1
                ? { width: 1080, height: 1350, close() {} }
                : { width: 500, height: 250, close() {} };
        };

        globalThis.OffscreenCanvas = class {
            constructor(width, height) {
                this.width = width;
                this.height = height;
            }
            getContext() {
                return {
                    drawImage: (...args) => draws.push(args),
                    fillRect() {}
                };
            }
            async convertToBlob({ type }) {
                return new Blob([compositeBytes], { type });
            }
        };

        globalThis.JarvisLocalBridge = {
            requestJson: async (path, payload) => {
                if (path === "/artifact/read") {
                    if (payload.output === ".jarvis-artifacts/web-media/foto-real.jpg") {
                        return {
                            ok: true,
                            output: payload.output,
                            mimeType: "image/jpeg",
                            bytes: sourceBytes.length,
                            sha256: sha256(sourceBytes),
                            dataBase64: sourceBase64
                        };
                    }
                    if (payload.output === ".jarvis-artifacts/web-media/emblema-hmh.png") {
                        return {
                            ok: true,
                            output: payload.output,
                            mimeType: "image/png",
                            bytes: logoBytes.length,
                            sha256: sha256(logoBytes),
                            dataBase64: logoBase64
                        };
                    }
                    return { ok: false, status: "NOT_FOUND" };
                }
                if (path === "/image") {
                    savedImageBase64 = payload.imageBase64;
                    return {
                        ok: true,
                        status: "IMAGE_SAVED",
                        output: ".jarvis-artifacts/images/social-instagram.png",
                        bytes: compositeBytes.length,
                        mimeType: "image/png"
                    };
                }
                return { ok: false, status: "UNEXPECTED_BRIDGE_PATH" };
            }
        };

        const runtime = createRuntime();
        registerJarvisActuatorTools(runtime);
        const result = await runtime.get("image.edit").execute({
            sourceOutput: ".jarvis-artifacts/web-media/foto-real.jpg",
            brandLogoOutput: ".jarvis-artifacts/web-media/emblema-hmh.png",
            marketingRequirementId: "social-instagram",
            variantId: "social-instagram",
            identityMode: "brand-scene",
            prompt: "Pieza para Instagram usando la fotografía real.",
            transformations: [],
            preserveLogos: true,
            preserveApprovedText: false,
            output: ".jarvis-artifacts/images/social-instagram.png"
        }, {
            objectiveId: "MKT_HMH",
            caseId: "CASE_HMH"
        });

        assert.equal(result.ok, true);
        assert.equal(result.persisted, true);
        assert.equal(result.referenceGrounded, true);
        assert.equal(result.identityMode, "brand-scene");
        assert.equal(result.marketingRequirementId, "social-instagram");
        assert.equal(result.variantId, "social-instagram");
        assert.equal(result.brandLogoOutput, ".jarvis-artifacts/web-media/emblema-hmh.png");
        assert.equal(result.brandLogoSha256, sha256(logoBytes));
        assert.equal(result.brandLogoOverlayVerified, true);
        assert.equal(result.generatedLogoAllowed, false);
        assert.equal(result.outputSha256, sha256(compositeBytes));
        assert.equal(savedImageBase64, compositeBase64);
        assert.notEqual(savedImageBase64, generatedBase64);
        assert.equal(draws.length, 2);

        assert.equal(providerPayload.sourceImageBase64, sourceBase64);
        assert.equal(providerPayload.preserveLogos, false);
        assert.equal(providerPayload.preserveApprovedText, false);
        assert.match(providerPayload.prompt, /PROHIBIDO generar cualquier logo/i);
        assert.match(providerPayload.prompt, /unico logotipo permitido sera compuesto despues/i);
        assert.ok(providerPayload.transformations.some(item => /No generar, redibujar/i.test(item)));
    }
    finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.createImageBitmap = previousBitmap;
        globalThis.OffscreenCanvas = PreviousCanvas;
        delete globalThis.__JARVIS_IMAGE_EDITING_HEALTH__;
    }
});
