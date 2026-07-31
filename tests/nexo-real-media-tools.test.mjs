import assert from "node:assert/strict";
import { test } from "node:test";

import {
    registerNexoRealMediaTools
} from "../gestia-core/nexo/nexo.real-media.tools.js";

function runtimeFixture() {
    const registry = new Map();
    return {
        registry,
        register(definition) {
            registry.set(definition.name, definition);
            return { ok: true, tool: definition.name };
        },
        has(name) {
            return registry.has(name);
        }
    };
}

function collectorTask(mediaAssets) {
    return {
        name: "web.media.collect",
        observation: {
            evidence: {
                mediaAssets
            }
        }
    };
}

function marketingTask() {
    return {
        name: "marketing.plan",
        observation: {
            evidence: {
                engine: "nexo_marketing_engine",
                status: "MARKETING_PACKAGE_READY"
            }
        }
    };
}

test("runtime override replaces legacy marketing with NEXO 8 natural brief", async () => {
    const runtime = runtimeFixture();
    runtime.register({ name: "marketing.plan", execute: async () => ({ version: "7.0.0" }) });
    const installation = registerNexoRealMediaTools(runtime);

    assert.equal(installation.active, true);
    const result = await runtime.registry.get("marketing.plan").execute({
        prompt: "creame un plan de marketing para Multiservicios Peninsulares HMH"
    });
    assert.equal(result.engine, "nexo_marketing_engine");
    assert.equal(result.version, "8.0.0-nexo-natural-brief");
    assert.equal(result.readyForProduction, true);
    assert.equal(result.trace.controllerId, "PENINSULA_NEXO");
});

test("real media package blocks when requested video bytes are missing", async () => {
    const runtime = runtimeFixture();
    registerNexoRealMediaTools(runtime);
    const packageTool = runtime.registry.get("marketing.package.real-media");
    const result = await packageTool.execute(
        {
            sourceUrl: "https://example.com/",
            requireImages: true,
            requireVideos: true
        },
        {
            completedTasks: [
                collectorTask([
                    {
                        kind: "image",
                        output: ".jarvis-artifacts/web-media/example/photo.jpg",
                        sha256: "a".repeat(64)
                    }
                ]),
                marketingTask()
            ]
        }
    );

    assert.equal(result.ok, false);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.status, "REAL_MEDIA_PACKAGE_REQUIREMENTS_UNMET");
    assert.equal(result.counts.images, 1);
    assert.equal(result.counts.videos, 0);
});

test("real media package creates verified local manifest when both families exist", async t => {
    const previousBridge = globalThis.JarvisLocalBridge;
    t.after(() => {
        if (previousBridge === undefined) delete globalThis.JarvisLocalBridge;
        else globalThis.JarvisLocalBridge = previousBridge;
    });
    let request = null;
    globalThis.JarvisLocalBridge = {
        async requestJson(route, payload) {
            request = { route, payload };
            return {
                ok: true,
                status: "JSON_ARTIFACT_CREATED_VERIFIED",
                output: ".jarvis-artifacts/campaign/real-media.json"
            };
        }
    };

    const runtime = runtimeFixture();
    registerNexoRealMediaTools(runtime);
    const packageTool = runtime.registry.get("marketing.package.real-media");
    const assets = [
        {
            kind: "image",
            output: ".jarvis-artifacts/web-media/example/photo.jpg",
            mimeType: "image/jpeg",
            sha256: "a".repeat(64)
        },
        {
            kind: "video",
            output: ".jarvis-artifacts/web-media/example/video.mp4",
            mimeType: "video/mp4",
            sha256: "b".repeat(64)
        }
    ];
    const result = await packageTool.execute(
        {
            sourceUrl: "https://example.com/",
            requireImages: true,
            requireVideos: true,
            title: "Campaña real"
        },
        {
            caseId: "CASE-REAL",
            objectiveId: "OBJ-REAL",
            completedTasks: [collectorTask(assets), marketingTask()]
        }
    );

    assert.equal(result.ok, true);
    assert.equal(result.objectiveSatisfied, true);
    assert.equal(result.status, "REAL_MEDIA_MARKETING_PACKAGE_CREATED");
    assert.equal(request.route, "/artifact/json/create");
    assert.equal(request.payload.data.policy.syntheticMediaSubstitutionAllowed, false);
    assert.equal(request.payload.data.mediaAssets.length, 2);
});
