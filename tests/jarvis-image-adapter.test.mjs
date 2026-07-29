import test from "node:test";
import assert from "node:assert/strict";

import {
    adaptImageSource,
    buildIdentityReferenceSheet,
    planImageAdaptation
} from "../gestia-core/jarvis/jarvis.image.adapter.js";

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
    assert.throws(() => planImageAdaptation({ variants: [{ id: "hero", width: 8000, height: 1080 }] }), /IMAGE_WIDTH_OUT_OF_RANGE/);
    assert.throws(() => planImageAdaptation({ variants: [{ id: "hero", width: 1080, height: 1080 }, { id: "hero", width: 512, height: 512 }] }), /IMAGE_VARIANT_DUPLICATED/);
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
