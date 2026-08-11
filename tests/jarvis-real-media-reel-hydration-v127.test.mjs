import assert from "node:assert/strict";
import test from "node:test";

import {
    compactMissionPlannerObservation
} from "../gestia-core/jarvis/jarvis.mission.planner-state.js";
import {
    __test as nexoToolsTest
} from "../gestia-core/nexo/nexo.real-media.tools.js";
import {
    __test as webMediaTest
} from "../nexo-web-media-bridge.js";
import {
    buildReelStudioHtml,
    describeReelStudio
} from "../jarvis-reel-artifact.js";

const verifiedImage = {
    kind: "image",
    output: ".jarvis-artifacts/web-media/source.example/1/01-cover.jpg",
    mimeType: "image/jpeg",
    bytes: 245678,
    sha256: "a".repeat(64),
    sourceUrl: "https://cdn.example/cover.jpg",
    sourceTag: "og:image",
    alt: "Imagen verificada"
};

const verifiedVideo = {
    kind: "video",
    output: ".jarvis-artifacts/web-media/source.example/1/02-source.mp4",
    mimeType: "video/mp4",
    bytes: 5245678,
    sha256: "b".repeat(64),
    sourceUrl: "https://cdn.example/source.mp4",
    sourceTag: "og:video"
};

test("v127 planner state preserves bounded verified media references", () => {
    const compact = compactMissionPlannerObservation({
        ok: true,
        executionOk: true,
        objectiveSatisfied: true,
        status: "WEB_REAL_MEDIA_COLLECTED",
        requirementsMet: true,
        counts: { images: 1, videos: 1, total: 2 },
        mediaAssets: [verifiedImage, verifiedVideo]
    });

    assert.equal(compact.requirementsMet, true);
    assert.deepEqual(compact.counts, { images: 1, videos: 1, total: 2 });
    assert.equal(compact.mediaAssets.length, 2);
    assert.equal(compact.mediaAssets[0].output, verifiedImage.output);
    assert.equal(compact.mediaAssets[1].sha256, verifiedVideo.sha256);
});

test("v127 reel hydration reuses verified source media without replacing explicit scene media", () => {
    const context = {
        completedTasks: [{
            name: "web.media.collect",
            observation: {
                evidence: {
                    mediaAssets: [verifiedImage, verifiedVideo]
                }
            }
        }]
    };
    const input = {
        brandName: "Marca de prueba",
        title: "Reel de prueba",
        cta: "Conoce más",
        durationSeconds: 30,
        scenes: [
            { durationSeconds: 10, overlay: "Uno" },
            {
                durationSeconds: 10,
                overlay: "Dos",
                assetOutput: ".jarvis-artifacts/web-media/source.example/1/explicit.jpg",
                mediaType: "image"
            },
            { durationSeconds: 10, overlay: "Tres" }
        ]
    };

    const hydrated = nexoToolsTest.hydrateReelArgsWithCollectorMedia(input, context);
    assert.equal(hydrated.hydrated, true);
    assert.equal(hydrated.assetCount, 2);
    assert.equal(hydrated.sceneCount, 2);
    assert.equal(hydrated.args.scenes[0].assetOutput, verifiedVideo.output);
    assert.equal(hydrated.args.scenes[0].mediaType, "video");
    assert.equal(
        hydrated.args.scenes[1].assetOutput,
        ".jarvis-artifacts/web-media/source.example/1/explicit.jpg"
    );
    assert.equal(hydrated.args.scenes[2].assetOutput, verifiedVideo.output);
});

test("v127 rejects unverified or non-web-media assets from automatic reel hydration", () => {
    const context = {
        completedTasks: [{
            name: "web.media.collect",
            observation: {
                evidence: {
                    mediaAssets: [{
                        ...verifiedImage,
                        output: ".jarvis-artifacts/uploads/not-source.jpg"
                    }]
                }
            }
        }]
    };
    const hydrated = nexoToolsTest.hydrateReelArgsWithCollectorMedia({
        scenes: [
            { durationSeconds: 10, overlay: "Uno" },
            { durationSeconds: 10, overlay: "Dos" },
            { durationSeconds: 10, overlay: "Tres" }
        ]
    }, context);
    assert.equal(hydrated.hydrated, false);
    assert.equal(hydrated.assetCount, 0);
});

test("v127 accepts source-declared cross-host CDN media while keeping host policy explicit", () => {
    const html = `
        <html><head>
            <meta property="og:image" content="https://cdn.example/cover.jpg">
            <meta property="og:video" content="https://media.example/video.mp4">
        </head><body></body></html>
    `;
    const candidates = webMediaTest.mediaCandidates(html, "https://source.example/post/1");
    assert.equal(candidates.length, 2);
    assert.equal(webMediaTest.hostAllowed("cdn.example", "source.example", []), false);
    assert.equal(candidates.every(webMediaTest.sourceDeclaredMediaCandidate), true);
    assert.equal(
        webMediaTest.sourceDeclaredMediaCandidate({ sourceTag: "arbitrary-script-url" }),
        false
    );
});

test("v127 reel studio renders source media with cinematic motion while preserving verification checks", () => {
    const input = {
        brandName: "Marca de prueba",
        title: "Reel con medios reales",
        cta: "Conoce más",
        durationSeconds: 30,
        scenes: [
            {
                durationSeconds: 10,
                overlay: "Escena uno",
                subtitle: "Subtítulo uno",
                assetDataUrl: "data:image/png;base64,iVBORw0KGgo=",
                mediaType: "image"
            },
            {
                durationSeconds: 10,
                overlay: "Escena dos",
                visualDescription: "Descripción dos"
            },
            {
                durationSeconds: 10,
                overlay: "Escena tres",
                subtitle: "Subtítulo tres"
            }
        ]
    };
    const html = buildReelStudioHtml(input);
    const verification = describeReelStudio(input, html);
    assert.equal(verification.ok, true);
    assert.equal(verification.checks.cinematicMotion, true);
    assert.equal(verification.checks.sourceMediaRendering, true);
    assert.equal(Object.values(verification.checks).every(Boolean), true);
});
