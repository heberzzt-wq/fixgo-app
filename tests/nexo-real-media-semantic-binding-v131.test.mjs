import assert from "node:assert/strict";
import test from "node:test";

import {
    registerNexoRealMediaRuntimeGuard
} from "../gestia-core/nexo/nexo.real-media.runtime-guard-v128.js";

function runtimeFixture() {
    const registry = new Map();
    return {
        _registry: registry,
        register(definition) {
            registry.set(definition.name, definition);
            return definition;
        },
        get(name) {
            return registry.get(name);
        }
    };
}

const assetA = {
    kind: "image",
    output: ".jarvis-artifacts/web-media/source.example/1/a.jpg",
    mimeType: "image/jpeg",
    bytes: 220000,
    sha256: "a".repeat(64),
    sourceUrl: "https://cdn.example/a.jpg",
    sourceTag: "og:image",
    mediaRole: "scene"
};
const assetB = {
    ...assetA,
    output: ".jarvis-artifacts/web-media/source.example/1/b.jpg",
    sha256: "b".repeat(64),
    sourceUrl: "https://cdn.example/b.jpg"
};

test("v131 runtime blocks positional fallback when collected web media lacks complete semantic scene binding", async () => {
    delete globalThis.__NEXO_REAL_MEDIA_RUNTIME_GUARD_V128__;
    delete globalThis.__NEXO_REAL_MEDIA_MISSION_CACHE_V128__;
    const runtime = runtimeFixture();
    let reelCalls = 0;
    runtime.register({
        name: "web.media.collect",
        execute: async () => ({
            ok: true,
            status: "WEB_REAL_MEDIA_COLLECTED",
            mediaAssets: [assetA, assetB]
        })
    });
    runtime.register({
        name: "reel.create",
        execute: async args => {
            reelCalls += 1;
            return {
                ok: true,
                status: "REEL_VIDEO_CREATED_VERIFIED",
                received: args,
                checks: { sourceMediaRendering: true }
            };
        }
    });
    registerNexoRealMediaRuntimeGuard(runtime);
    await runtime.get("web.media.collect").execute(
        { objectiveId: "OBJ-V131" },
        { objectiveId: "OBJ-V131" }
    );
    const blocked = await runtime.get("reel.create").execute({
        objectiveId: "OBJ-V131",
        scenes: [
            { durationSeconds: 10, overlay: "Uno", assetOutput: assetA.output, mediaType: "image" },
            { durationSeconds: 10, overlay: "Dos" },
            { durationSeconds: 10, overlay: "Tres" }
        ]
    }, { objectiveId: "OBJ-V131" });
    assert.equal(blocked.status, "REEL_MEDIA_SEMANTIC_BINDING_REQUIRED");
    assert.equal(blocked.semanticMediaCoverage.complete, false);
    assert.equal(reelCalls, 0);
});

test("v131 runtime allows a fully semantically bound storyboard to reach reel.create", async () => {
    delete globalThis.__NEXO_REAL_MEDIA_RUNTIME_GUARD_V128__;
    delete globalThis.__NEXO_REAL_MEDIA_MISSION_CACHE_V128__;
    const runtime = runtimeFixture();
    let received = null;
    runtime.register({
        name: "web.media.collect",
        execute: async () => ({ ok: true, mediaAssets: [assetA, assetB] })
    });
    runtime.register({
        name: "reel.create",
        execute: async args => {
            received = args;
            return {
                ok: true,
                status: "REEL_VIDEO_CREATED_VERIFIED",
                checks: { sourceMediaRendering: true }
            };
        }
    });
    registerNexoRealMediaRuntimeGuard(runtime);
    await runtime.get("web.media.collect").execute(
        { objectiveId: "OBJ-V131-OK" },
        { objectiveId: "OBJ-V131-OK" }
    );
    const result = await runtime.get("reel.create").execute({
        objectiveId: "OBJ-V131-OK",
        scenes: [
            { durationSeconds: 10, overlay: "Uno", assetOutput: assetA.output, mediaType: "image" },
            { durationSeconds: 10, overlay: "Dos", assetOutput: assetB.output, mediaType: "image" },
            { durationSeconds: 10, overlay: "Tres", assetOutput: assetA.output, mediaType: "image" }
        ]
    }, { objectiveId: "OBJ-V131-OK" });
    assert.equal(result.ok, true);
    assert.equal(received.scenes.length, 3);
    assert.equal(received.scenes.every(scene => Boolean(scene.assetOutput)), true);
});
