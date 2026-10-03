import test from "node:test";
import assert from "node:assert/strict";

import {
    adaptImageSource,
    buildIdentityReferenceSheet,
    overlayBrandLogo,
    planImageAdaptation
} from "../gestia-core/jarvis/jarvis.image.adapter.js";

test("ad composition draws semantic copy, the selected photo region and the original logo", async t => {
    const previous = { bitmap: globalThis.createImageBitmap, canvas: globalThis.OffscreenCanvas };
    t.after(() => { globalThis.createImageBitmap = previous.bitmap; globalThis.OffscreenCanvas = previous.canvas; });
    const drawn = [], written = [];
    let images = 0;
    globalThis.createImageBitmap = async () => ++images === 1
        ? { width: 1200, height: 1200, close() {} }
        : { width: 200, height: 100, close() {} };
    globalThis.OffscreenCanvas = class {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return {
            fillRect() {}, drawImage: (...args) => drawn.push(args.slice(1)),
            measureText: value => ({ width: value.length * 16 }),
            fillText: value => written.push(value),
            getImageData: () => ({ data: new Uint8ClampedArray(200 * 100 * 4).fill(255) })
        }; }
        async convertToBlob({ type }) { return new Blob(["composed-pixels"], { type }); }
    };
    const input = {
        sourceBase64: btoa("photo"), sourceMimeType: "image/png",
        logoBase64: btoa("original-logo"), logoMimeType: "image/png",
        variants: [{ id: "fiscal", width: 1080, height: 1080, mimeType: "image/png" }],
        composition: { layout: "split", headline: "Asesoría fiscal", body: "Conoce tus opciones.",
            brandName: "Firma de prueba", cta: "Consulta nuestros servicios", contact: "example.test",
            photoCrop: { x: 500, y: 100, width: 650, height: 1000 } }
    };
    const result = await adaptImageSource(input);
    assert.equal(result.outputs[0].compositionApplied, true);
    assert.equal(result.outputs[0].logoOverlayApplied, true);
    assert.ok(written.join(" ").includes("Asesoría fiscal"));
    assert.ok(written.join(" ").includes("example.test"));
    assert.equal(written.some(value => /placeholder|ilustrativa/i.test(value)), false);
    assert.ok(drawn.some(args => args[0] >= 500 && args[1] >= 100 && args[0] + args[2] <= 1150 && args[1] + args[3] <= 1100));
    images = 0;
    await assert.rejects(adaptImageSource({ ...input, composition: { ...input.composition,
        photoCrop: { x: 500, y: 100, width: 900, height: 1000 } } }), /IMAGE_PHOTO_CROP_INVALID/);
});

test("image adapter derives real hero, card, reel and thumbnail assets from one source", async () => {
    const originalBitmap = globalThis.createImageBitmap;
    const OriginalCanvas = globalThis.OffscreenCanvas;
    const draws = [];
    globalThis.createImageBitmap = async () => ({ width: 1600, height: 900, close() {} });
    globalThis.OffscreenCanvas = class {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { drawImage: (...args) => draws.push(args.slice(1)) }; }
        async convertToBlob({ type }) { return new Blob([`${this.width}x${this.height}`], { type }); }
    };
    try {
        const result = await adaptImageSource({
            sourceBase64: Buffer.from("real-source-image").toString("base64"),
            sourceMimeType: "image/jpeg"
        });
        assert.equal(result.originalPreserved, true);
        assert.equal(result.generatedContentUsed, false);
        assert.equal(result.sourceWidth, 1600);
        assert.equal(result.sourceHeight, 900);
        assert.deepEqual(result.outputs.map(output => output.id), ["hero", "card", "reel", "thumbnail", "app"]);
        assert.equal(result.outputs.every(output => output.bytes > 0 && output.dataBase64), true);
        assert.equal(draws.length, 5);
        assert.equal(result.outputs.find(output => output.id === "card").crop.width, 900);
    } finally {
        globalThis.createImageBitmap = originalBitmap;
        globalThis.OffscreenCanvas = OriginalCanvas;
    }
});

test("image adapter fails closed on unsafe variant requests", () => {
    assert.equal(planImageAdaptation({ variants: [{ id: "variant_1", width: 1080, height: 1080 }] }).variants[0].id, "variant_1");
    assert.throws(() => planImageAdaptation({ variants: [{ id: "../escape", width: 1080, height: 1080 }] }), /IMAGE_VARIANT_ID_INVALID/);
    assert.throws(() => planImageAdaptation({ variants: [{ id: "hero", width: 8000, height: 1080 }] }), /IMAGE_WIDTH_OUT_OF_RANGE/);
    assert.throws(() => planImageAdaptation({ variants: [{ id: "hero", width: 1080, height: 1080 }, { id: "hero", width: 512, height: 512 }] }), /IMAGE_VARIANT_DUPLICATED/);
});

test("contain preserves the whole ad instead of cropping its logo and contact text", async () => {
    const previousBitmap = globalThis.createImageBitmap, PreviousCanvas = globalThis.OffscreenCanvas;
    const draws = [];
    globalThis.createImageBitmap = async () => ({ width: 1000, height: 2000, close() {} });
    globalThis.OffscreenCanvas = class {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { fillRect() {}, drawImage: (...args) => draws.push(args.slice(1)) }; }
        async convertToBlob({ type }) { return new Blob(["pixels"], { type }); }
    };
    try {
        await adaptImageSource({ sourceBase64: Buffer.from("fixture").toString("base64"), sourceMimeType: "image/png", fit: "contain", variants: [{ id: "post", width: 1080, height: 1080, mimeType: "image/png" }] });
        assert.deepEqual(draws, [[0, 0, 1000, 2000, 270, 0, 540, 1080]]);
    } finally { globalThis.createImageBitmap = previousBitmap; globalThis.OffscreenCanvas = PreviousCanvas; }
});


test("identity reference sheet gives the primary photo the large panel", async () => {
    const originalBitmap =
        globalThis.createImageBitmap;

    const OriginalCanvas =
        globalThis.OffscreenCanvas;

    const draws =
        [];

    globalThis.createImageBitmap =
        async () => ({
            width:
                1200,
            height:
                1600,
            close() {}
        });

    globalThis.OffscreenCanvas =
        class {
            constructor(
                width,
                height
            ) {
                this.width =
                    width;

                this.height =
                    height;
            }

            getContext() {
                return {
                    drawImage:
                        (...args) =>
                            draws.push(
                                args
                            ),
                    fillRect() {},
                    fillStyle:
                        "#ffffff"
                };
            }

            async convertToBlob(
                {
                    type
                }
            ) {
                return new Blob(
                    [
                        "identity-sheet"
                    ],
                    {
                        type
                    }
                );
            }
        };

    try {
        const result =
            await buildIdentityReferenceSheet({
                primarySourceOutput:
                    ".jarvis-artifacts/uploads/current.jpg",
                references: [{
                    sourceOutput:
                        ".jarvis-artifacts/uploads/old.jpg",
                    mimeType:
                        "image/jpeg",
                    dataBase64:
                        Buffer
                            .from(
                                "old"
                            )
                            .toString(
                                "base64"
                            )
                }, {
                    sourceOutput:
                        ".jarvis-artifacts/uploads/current.jpg",
                    mimeType:
                        "image/jpeg",
                    dataBase64:
                        Buffer
                            .from(
                                "current"
                            )
                            .toString(
                                "base64"
                            )
                }]
            });

        assert.equal(
            result.ok,
            true
        );

        assert.equal(
            result.composite,
            true
        );

        assert.equal(
            result.referenceCount,
            2
        );

        assert.equal(
            result.primarySourceOutput,
            ".jarvis-artifacts/uploads/current.jpg"
        );

        assert.deepEqual(
            result.referenceOutputs,
            [
                ".jarvis-artifacts/uploads/current.jpg",
                ".jarvis-artifacts/uploads/old.jpg"
            ]
        );

        assert.equal(
            draws.length,
            2
        );

        assert.equal(
            Boolean(
                result.dataBase64
            ),
            true
        );
    }
    finally {
        globalThis.createImageBitmap =
            originalBitmap;

        globalThis.OffscreenCanvas =
            OriginalCanvas;
    }
});

test("official brand logo overlay uses the logo source as a second deterministic draw after the generated image", async () => {
    const originalBitmap = globalThis.createImageBitmap;
    const OriginalCanvas = globalThis.OffscreenCanvas;
    const draws = [];
    let bitmapCall = 0;

    globalThis.createImageBitmap = async () => {
        bitmapCall += 1;
        return bitmapCall === 1
            ? { width: 1200, height: 1200, close() {} }
            : { width: 300, height: 150, close() {} };
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
            return new Blob(["official-logo-composite"], { type });
        }
    };

    try {
        const result = await overlayBrandLogo({
            imageBase64: Buffer.from("generated-social-piece").toString("base64"),
            imageMimeType: "image/png",
            logoBase64: Buffer.from("official-logo-bytes").toString("base64"),
            logoMimeType: "image/png",
            position: "top-right"
        });

        assert.equal(result.ok, true);
        assert.equal(result.status, "OFFICIAL_BRAND_LOGO_OVERLAY_APPLIED");
        assert.equal(result.logoOverlayApplied, true);
        assert.equal(result.logoPixelSource, "DECODED_OFFICIAL_SOURCE_BYTES");
        assert.equal(result.generatedLogoAllowed, false);
        assert.equal(result.width, 1200);
        assert.equal(result.height, 1200);
        assert.equal(result.logoSourceWidth, 300);
        assert.equal(result.logoSourceHeight, 150);
        assert.equal(result.placement.position, "top-right");
        assert.equal(draws.length, 2);
        assert.equal(Boolean(result.imageBase64), true);
    }
    finally {
        globalThis.createImageBitmap = originalBitmap;
        globalThis.OffscreenCanvas = OriginalCanvas;
    }
});
