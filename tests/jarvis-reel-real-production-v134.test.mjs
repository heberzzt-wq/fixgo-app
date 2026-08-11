import assert from "node:assert/strict";
import { test } from "node:test";

import {
    runJarvisMission,
    __test as orchestratorTest
} from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import {
    registerNexoRealMediaTools,
    __test as nexoToolsTest
} from "../gestia-core/nexo/nexo.real-media.tools.js";

const verifiedImage = {
    kind: "image",
    output: ".jarvis-artifacts/web-media/example.test/1/taco.jpg",
    mimeType: "image/jpeg",
    bytes: 245678,
    sha256: "a".repeat(64),
    sourceUrl: "https://cdn.example.test/taco.jpg",
    sourceTag: "og:image",
    alt: "Taco real verificado"
};

function missionShape() {
    return {
        originalInstruction: "Investiga Taquería El Dorado en Cancún y crea un reel profesional.",
        completedTasks: [],
        pendingTasks: [],
        blockedTasks: []
    };
}

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
        },
        get(name) {
            return registry.get(name);
        }
    };
}

test("v134 reel.plan is singleton inside the same semantic batch", () => {
    const accepted = orchestratorTest.trustedCalls([
        { name: "reel.plan", args: { title: "Plan A" } },
        { name: "reel.plan", args: { title: "Plan B" } }
    ], missionShape());

    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].name, "reel.plan");
    assert.equal(accepted[0].args.title, "Plan A");
});

test("v134 derives a real-media dependency from one verified research source", () => {
    const mission = missionShape();
    mission.completedTasks.push({
        name: "web.research",
        observation: {
            objectiveSatisfied: true,
            validSources: [{ url: "https://example.test/taqueria", title: "Fuente" }]
        }
    });

    const dependency = orchestratorTest.reelMediaDependencyCall({
        name: "reel.create",
        args: {
            scenes: [
                { durationSeconds: 10, overlay: "Uno" },
                { durationSeconds: 10, overlay: "Dos" },
                { durationSeconds: 10, overlay: "Tres" }
            ]
        }
    }, mission);

    assert.equal(dependency?.name, "web.media.collect");
    assert.equal(dependency?.args?.url, "https://example.test/taqueria");
    assert.equal(dependency?.args?.requireAnyVisual, true);
});

test("v134 never guesses between multiple verified research media sources", () => {
    const mission = missionShape();
    mission.completedTasks.push({
        name: "web.research",
        observation: {
            objectiveSatisfied: true,
            validSources: [
                { url: "https://one.example/source" },
                { url: "https://two.example/source" }
            ]
        }
    });

    assert.equal(orchestratorTest.reelMediaDependencyCall({
        name: "reel.create",
        args: { scenes: [{ overlay: "Escena" }] }
    }, mission), null);
});

test("v134 explicit source URL has priority as the real-media dependency", () => {
    const mission = missionShape();
    mission.originalInstruction =
        "Usa https://www.tiktok.com/@taqueria.eldorado como fuente y crea un reel profesional.";
    mission.completedTasks.push({
        name: "web.research",
        observation: {
            objectiveSatisfied: true,
            validSources: [{ url: "https://other.example/source" }]
        }
    });

    const dependency = orchestratorTest.reelMediaDependencyCall({
        name: "reel.create",
        args: { scenes: [{ overlay: "Escena" }] }
    }, mission);
    assert.equal(
        dependency?.args?.url,
        "https://www.tiktok.com/@taqueria.eldorado"
    );
});

test("v134 NEXO refuses to render a text-only reel as a completed production artifact", async () => {
    const runtime = runtimeFixture();
    let canonicalCalls = 0;
    runtime.register({
        name: "reel.create",
        async execute() {
            canonicalCalls += 1;
            return { ok: true, objectiveSatisfied: true, status: "REEL_VIDEO_CREATED_VERIFIED" };
        }
    });
    registerNexoRealMediaTools(runtime);

    const result = await runtime.registry.get("reel.create").execute({
        brandName: "Taquería El Dorado",
        durationSeconds: 30,
        scenes: [
            { durationSeconds: 10, overlay: "Tacos" },
            { durationSeconds: 10, overlay: "Sabor" },
            { durationSeconds: 10, overlay: "Visítanos" }
        ]
    }, { completedTasks: [] });

    assert.equal(canonicalCalls, 0);
    assert.equal(result.ok, false);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.blocked, true);
    assert.equal(result.status, "REEL_VISUAL_MEDIA_REQUIRED");
    assert.equal(result.visualEvidence.sceneMediaCount, 0);
});

test("v134 NEXO hydrates verified collected media before invoking the canonical renderer", async () => {
    const runtime = runtimeFixture();
    let renderedArgs = null;
    runtime.register({
        name: "reel.create",
        async execute(args) {
            renderedArgs = args;
            return {
                ok: true,
                objectiveSatisfied: true,
                status: "REEL_VIDEO_CREATED_VERIFIED",
                output: ".jarvis-artifacts/reels/real.webm"
            };
        }
    });
    registerNexoRealMediaTools(runtime);

    const result = await runtime.registry.get("reel.create").execute({
        brandName: "Taquería El Dorado",
        durationSeconds: 30,
        scenes: [
            { durationSeconds: 10, overlay: "Tacos" },
            { durationSeconds: 10, overlay: "Sabor" },
            { durationSeconds: 10, overlay: "Visítanos" }
        ]
    }, {
        completedTasks: [{
            name: "web.media.collect",
            observation: { evidence: { mediaAssets: [verifiedImage] } }
        }]
    });

    assert.equal(result.ok, true);
    assert.equal(result.objectiveSatisfied, true);
    assert.equal(result.mediaHydration.hydrated, true);
    assert.equal(result.visualEvidence.sceneMediaCount, 3);
    assert.equal(renderedArgs.scenes[0].assetOutput, verifiedImage.output);
});

test("v134 end-to-end human mission inserts media collection and eliminates duplicate reel.plan", async () => {
    const executed = [];
    const outcome = await runJarvisMission({
        instruction: "Investiga Taquería El Dorado en Cancún y créame un reel profesional de 30 segundos para promocionarla.",
        initialToolCalls: [
            { name: "web.research", args: { query: "Taquería El Dorado Cancún", researchGoal: "RESEARCH_1" } },
            { name: "reel.plan", args: { title: "Plan A" } },
            { name: "reel.plan", args: { title: "Plan B" } },
            {
                name: "reel.create",
                args: {
                    brandName: "Taquería El Dorado",
                    durationSeconds: 30,
                    scenes: [
                        { durationSeconds: 10, overlay: "Uno" },
                        { durationSeconds: 10, overlay: "Dos" },
                        { durationSeconds: 10, overlay: "Tres" }
                    ]
                }
            }
        ],
        requiredToolNames: ["web.research", "reel.plan", "reel.create"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async (call, context) => {
            executed.push(call.name);
            if (call.name === "web.research") {
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "WEB_RESEARCH_COMPLETED",
                    sources: [{
                        url: "https://example.test/taqueria",
                        title: "Taquería El Dorado"
                    }]
                };
            }
            if (call.name === "reel.plan") {
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "REEL_PLAN_READY",
                    brandName: "Taquería El Dorado",
                    title: "Reel",
                    cta: "Visítanos",
                    durationSeconds: 30,
                    timelineSeconds: 30,
                    scenes: [
                        { durationSeconds: 10, overlay: "Uno" },
                        { durationSeconds: 10, overlay: "Dos" },
                        { durationSeconds: 10, overlay: "Tres" }
                    ]
                };
            }
            if (call.name === "web.media.collect") {
                assert.equal(call.args.url, "https://example.test/taqueria");
                assert.equal(call.args.requireAnyVisual, true);
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "WEB_REAL_MEDIA_COLLECTED",
                    requirementsMet: true,
                    mediaAssets: [verifiedImage]
                };
            }
            if (call.name === "reel.create") {
                assert.equal(
                    context.completedTasks.some(task => task.name === "web.media.collect"),
                    true
                );
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "REEL_VIDEO_CREATED_VERIFIED",
                    output: ".jarvis-artifacts/reels/taqueria.webm"
                };
            }
            throw new Error(`Unexpected tool ${call.name}`);
        }
    });

    assert.deepEqual(executed, [
        "web.research",
        "reel.plan",
        "web.media.collect",
        "reel.create"
    ]);
    assert.equal(outcome.status, "COMPLETED");
    assert.equal(outcome.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(outcome.requiredToolNames.includes("web.media.collect"), true);
    assert.equal(outcome.completedTasks.filter(task => task.name === "reel.plan").length, 1);
});

test("v134 visual evidence helper treats verified collector hydration as production media", () => {
    const hydrated = nexoToolsTest.hydrateReelArgsWithCollectorMedia({
        scenes: [{ overlay: "Uno" }, { overlay: "Dos" }, { overlay: "Tres" }]
    }, {
        completedTasks: [{
            name: "web.media.collect",
            observation: { evidence: { mediaAssets: [verifiedImage] } }
        }]
    });
    const evidence = nexoToolsTest.reelVisualMediaEvidence(hydrated.args, {});
    assert.equal(evidence.hasVisualMedia, true);
    assert.equal(evidence.sceneMediaCount, 3);
});
