import assert from "node:assert/strict";
import test from "node:test";

import {
    buildReelMediaBindingPrompt,
    reelMediaCollectionState,
    reelSceneMediaCoverage,
    validateReelMediaBindings
} from "../gestia-core/jarvis/jarvis.reel.media-binder.js";

const sceneAssets = [
    {
        kind: "video",
        output: ".jarvis-artifacts/web-media/source.example/1/work.mp4",
        mimeType: "video/mp4",
        bytes: 900000,
        sha256: "a".repeat(64),
        sourceUrl: "https://cdn.example/work.mp4",
        sourceTag: "og:video",
        alt: "Técnico trabajando",
        mediaRole: "scene"
    },
    {
        kind: "image",
        output: ".jarvis-artifacts/web-media/source.example/1/team.jpg",
        mimeType: "image/jpeg",
        bytes: 250000,
        sha256: "b".repeat(64),
        sourceUrl: "https://cdn.example/team.jpg",
        sourceTag: "og:image",
        alt: "Equipo de servicio",
        mediaRole: "scene"
    },
    {
        kind: "image",
        output: ".jarvis-artifacts/web-media/source.example/1/result.jpg",
        mimeType: "image/jpeg",
        bytes: 260000,
        sha256: "c".repeat(64),
        sourceUrl: "https://cdn.example/result.jpg",
        sourceTag: "img",
        alt: "Resultado final",
        mediaRole: "scene"
    }
];

const logo = {
    kind: "image",
    output: ".jarvis-artifacts/web-media/source.example/1/logo.jpg",
    mimeType: "image/jpeg",
    bytes: 120000,
    sha256: "d".repeat(64),
    sourceUrl: "https://cdn.example/logo.jpg",
    sourceTag: "jsonld:logo",
    mediaRole: "brand_logo"
};

const scenes = [
    { id: 1, durationSeconds: 10, visual: "Trabajo en sitio", overlay: "Diagnóstico" },
    { id: 2, durationSeconds: 10, visual: "Equipo humano", overlay: "Atención" },
    { id: 3, durationSeconds: 10, visual: "Resultado terminado", overlay: "Resultado" }
];

test("v131 extracts verified scene media from completed collection and excludes brand logo", () => {
    const state = reelMediaCollectionState({
        completedTasks: [{
            name: "web.media.collect",
            observation: { mediaAssets: [logo, ...sceneAssets] }
        }]
    });
    assert.equal(state.attempted, true);
    assert.equal(state.assets.length, 3);
    assert.equal(state.assets.some(asset => asset.output === logo.output), false);
});

test("v131 semantic prompt exposes stable media ids without handing semantic authority an output choice", () => {
    const prompt = buildReelMediaBindingPrompt({ scenes, assets: sceneAssets });
    assert.match(prompt, /MEDIA_1/);
    assert.match(prompt, /CATALOGO_ESCENAS=/);
    assert.match(prompt, /CATALOGO_MEDIOS=/);
    assert.match(prompt, /No uses coincidencias lexicas locales/);
});

test("v131 validates complete diverse semantic bindings and applies only verified outputs", () => {
    const validated = validateReelMediaBindings({
        scenes,
        assets: sceneAssets,
        decision: {
            bindings: [
                { sceneId: 1, mediaId: "MEDIA_1", reason: "Trabajo" },
                { sceneId: 2, mediaId: "MEDIA_2", reason: "Equipo" },
                { sceneId: 3, mediaId: "MEDIA_3", reason: "Resultado" }
            ]
        }
    });
    assert.equal(validated.ok, true);
    assert.equal(validated.scenes[0].assetOutput, sceneAssets[0].output);
    assert.equal(validated.scenes[1].mediaType, "image");
    assert.equal(validated.scenes[2].sourceMedia.selection, "semantic_scene_media_binding_v131");
    assert.equal(reelSceneMediaCoverage({ scenes: validated.scenes }).complete, true);
});

test("v131 rejects invented media ids and incomplete semantic coverage", () => {
    const invented = validateReelMediaBindings({
        scenes,
        assets: sceneAssets,
        decision: {
            bindings: [
                { sceneId: 1, mediaId: "MEDIA_99" },
                { sceneId: 2, mediaId: "MEDIA_2" },
                { sceneId: 3, mediaId: "MEDIA_3" }
            ]
        }
    });
    assert.equal(invented.ok, false);
    assert.equal(invented.status, "REEL_MEDIA_BINDING_MEDIA_INVALID");
    const incomplete = validateReelMediaBindings({
        scenes,
        assets: sceneAssets,
        decision: { bindings: [{ sceneId: 1, mediaId: "MEDIA_1" }] }
    });
    assert.equal(incomplete.status, "REEL_MEDIA_BINDING_COVERAGE_INVALID");
});

test("v131 rejects concentrated repetition when verified alternatives exist", () => {
    const fourScenes = [
        ...scenes,
        { id: 4, durationSeconds: 10, visual: "Cierre", overlay: "Contacto" }
    ];
    const validated = validateReelMediaBindings({
        scenes: fourScenes,
        assets: sceneAssets.slice(0, 2),
        decision: {
            bindings: [
                { sceneId: 1, mediaId: "MEDIA_1" },
                { sceneId: 2, mediaId: "MEDIA_1" },
                { sceneId: 3, mediaId: "MEDIA_1" },
                { sceneId: 4, mediaId: "MEDIA_2" }
            ]
        }
    });
    assert.equal(validated.ok, false);
    assert.equal(validated.status, "REEL_MEDIA_BINDING_DIVERSITY_INVALID");
});

test("v142 prefers verified original creative media over collected source evidence", () => {
    const generatedOutput = ".jarvis-artifacts/images/original-taco-macho.png";
    const state = reelMediaCollectionState({
        completedTasks: [
            {
                name: "web.media.collect",
                observation: { mediaAssets: sceneAssets }
            },
            {
                name: "image.generate",
                observation: {
                    output: generatedOutput,
                    mimeType: "image/png",
                    bytes: 480000,
                    sha256: "e".repeat(64),
                    prompt: "Escena original de Taco Macho creada para la campaña"
                }
            }
        ]
    });
    assert.equal(state.attempted, true);
    assert.equal(state.assets.length, 1);
    assert.equal(state.assets[0].output, generatedOutput);
    assert.equal(state.assets[0].origin, "image.generate");
    const validated = validateReelMediaBindings({
        scenes,
        assets: state.assets,
        decision: {
            bindings: scenes.map(scene => ({
                sceneId: scene.id,
                mediaId: "MEDIA_1",
                reason: "Visual original verificado"
            }))
        }
    });
    assert.equal(validated.ok, true);
    assert.equal(validated.scenes.every(scene => scene.assetOutput === generatedOutput), true);
    assert.equal(validated.scenes.every(scene => scene.sourceMedia.origin === "image.generate"), true);
});

// V142 temporary CI diagnostic trigger: multifunction group A.
