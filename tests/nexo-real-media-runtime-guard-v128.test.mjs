import assert from "node:assert/strict";
import test from "node:test";

import {
    NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION,
    registerNexoRealMediaRuntimeGuard,
    __test as runtimeGuardTest
} from "../gestia-core/nexo/nexo.real-media.runtime-guard-v128.js";
import {
    NEXO_REAL_MEDIA_TOOLS_VERSION
} from "../gestia-core/nexo/nexo.real-media.tools.js";

const verifiedImage = {
    kind: "image",
    output: ".jarvis-artifacts/web-media/source.example/1/01-cover.jpg",
    mimeType: "image/jpeg",
    bytes: 245678,
    sha256: "a".repeat(64),
    sourceUrl: "https://cdn.example/cover.jpg",
    sourceTag: "og:image"
};

const verifiedLogo = {
    kind: "image",
    output: ".jarvis-artifacts/web-media/source.example/1/00-logo.jpg",
    mimeType: "image/jpeg",
    bytes: 125678,
    sha256: "b".repeat(64),
    sourceUrl: "https://cdn.example/logo.jpg",
    sourceTag: "jsonld:logo",
    mediaRole: "brand_logo"
};

function makeRuntime() {
    const registry = new Map();
    return {
        get(name) {
            return registry.get(name) || null;
        },
        register(definition) {
            registry.set(definition.name, definition);
            return definition;
        },
        registry
    };
}

test("v139 runtime guard readiness follows current real-media tools contract and rejects stale v127", () => {
    const current = makeRuntime();
    current.register({
        name: "web.media.collect",
        version: NEXO_REAL_MEDIA_TOOLS_VERSION,
        execute: async () => ({ ok: true })
    });
    current.register({
        name: "reel.create",
        version: NEXO_REAL_MEDIA_TOOLS_VERSION,
        execute: async () => ({ ok: true })
    });
    assert.equal(runtimeGuardTest.realMediaToolsReady(current), true);

    const stale = makeRuntime();
    stale.register({
        name: "web.media.collect",
        version: "1.3.0-real-media-reel-hydration-v127",
        execute: async () => ({ ok: true })
    });
    stale.register({
        name: "reel.create",
        version: "1.3.0-real-media-reel-hydration-v127",
        execute: async () => ({ ok: true })
    });
    assert.equal(runtimeGuardTest.realMediaToolsReady(stale), false);
});

test("v128 hydrates reel from completed mission media without relying on synthetic test-only context shape", () => {
    const state = runtimeGuardTest.taskMediaState({
        completedTasks: [{
            name: "web.media.collect",
            observation: {
                status: "WEB_REAL_MEDIA_COLLECTED",
                mediaAssets: [verifiedImage]
            }
        }]
    });
    assert.equal(state.attempted, true);
    assert.equal(state.assets.length, 1);

    const hydrated = runtimeGuardTest.hydrateReelArgs({
        scenes: [
            { durationSeconds: 10, overlay: "Uno" },
            { durationSeconds: 10, overlay: "Dos" },
            { durationSeconds: 10, overlay: "Tres" }
        ]
    }, state.assets);

    assert.equal(hydrated.hydrated, true);
    assert.equal(hydrated.verifiedAssetCount, 1);
    assert.equal(hydrated.hydratedSceneCount, 3);
    assert.equal(hydrated.args.scenes[0].assetOutput, verifiedImage.output);
    assert.equal(hydrated.args.scenes[2].mediaType, "image");
});

test("v131 caches collected media but refuses positional injection into reel.create", async () => {
    const runtime = makeRuntime();
    let reelArgs = null;

    runtime.register({
        name: "web.media.collect",
        version: NEXO_REAL_MEDIA_TOOLS_VERSION,
        execute: async () => ({
            ok: true,
            executionOk: true,
            objectiveSatisfied: true,
            status: "WEB_REAL_MEDIA_COLLECTED",
            requirementsMet: true,
            mediaAssets: [verifiedImage]
        })
    });
    runtime.register({
        name: "reel.create",
        version: NEXO_REAL_MEDIA_TOOLS_VERSION,
        execute: async args => {
            reelArgs = args;
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "REEL_VIDEO_CREATED_VERIFIED",
                checks: { sourceMediaRendering: true }
            };
        }
    });

    const installation = registerNexoRealMediaRuntimeGuard(runtime);
    assert.equal(installation.active, true);
    assert.equal(installation.version, NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION);

    await runtime.get("web.media.collect").execute(
        { url: "https://source.example/post/1" },
        { analysisId: "analysis-v128", objectiveId: "objective-v128" }
    );

    const result = await runtime.get("reel.create").execute({
        brandName: "Marca",
        title: "Reel",
        cta: "Conoce más",
        durationSeconds: 30,
        scenes: [
            { durationSeconds: 10, overlay: "Uno" },
            { durationSeconds: 10, overlay: "Dos" },
            { durationSeconds: 10, overlay: "Tres" }
        ]
    }, {
        analysisId: "analysis-v128",
        objectiveId: "objective-v128"
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "REEL_MEDIA_SEMANTIC_BINDING_REQUIRED");
    assert.equal(result.semanticMediaCoverage.complete, false);
    assert.equal(result.mediaHydration.verifiedAssetCount, 1);
    assert.equal(reelArgs, null);
});


test("v130 hydrates a source-declared logo without recycling it as scene media", () => {
    const hydrated = runtimeGuardTest.hydrateReelArgs({
        scenes: [
            { durationSeconds: 10, overlay: "Uno" },
            { durationSeconds: 10, overlay: "Dos" },
            { durationSeconds: 10, overlay: "Tres" }
        ]
    }, [verifiedLogo, verifiedImage]);
    assert.equal(hydrated.logoHydrated, true);
    assert.equal(hydrated.args.logoOutput, verifiedLogo.output);
    assert.equal(hydrated.verifiedLogoAssetCount, 1);
    assert.equal(hydrated.verifiedSceneAssetCount, 1);
    assert.equal(hydrated.args.scenes.every(scene => scene.assetOutput === verifiedImage.output), true);
});

test("v130 hydrates exactly one verified audio upload and refuses arbitrary selection among several", () => {
    const audioA = {
        name: "musica.mp3",
        mimeType: "audio/mpeg",
        artifact: ".jarvis-artifacts/uploads/audio-a.mp3",
        bytes: 2000,
        sha256: "c".repeat(64)
    };
    const one = runtimeGuardTest.hydrateReelAudioArgs({}, {
        rawInput: `Solicitud\nArchivos adjuntos reales entregados por el usuario:${JSON.stringify([audioA])}`
    });
    assert.equal(one.hydrated, true);
    assert.equal(one.args.audioOutput, audioA.artifact);
    const two = runtimeGuardTest.hydrateReelAudioArgs({}, {
        rawInput: `Archivos adjuntos reales entregados por el usuario:${JSON.stringify([audioA, { ...audioA, artifact: ".jarvis-artifacts/uploads/audio-b.mp3", sha256: "d".repeat(64) }])}`
    });
    assert.equal(two.ambiguous, true);
    assert.equal(two.candidateCount, 2);
});
