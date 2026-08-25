import assert from "node:assert/strict";
import test from "node:test";

import { runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import { compactMissionPlannerObservation } from "../gestia-core/jarvis/jarvis.mission.planner-state.js";
import { registerJarvisActuatorTools } from "../gestia-core/jarvis/jarvis.actuator.pack.js";

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
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

const threeReferences = [
    ".jarvis-artifacts/uploads/identity-front.jpg",
    ".jarvis-artifacts/uploads/identity-profile.jpg",
    ".jarvis-artifacts/uploads/identity-context.jpg"
];

test("v142 media analysis replans into one video.generate with verified identity references", async () => {
    const executed = [];
    let plannerCalls = 0;
    const mission = await runJarvisMission({
        instruction: "Usa estas 3 imágenes verificadas como identidad del protagonista y crea un mini drama cinematográfico de tres escenas con MP4 final.",
        initialToolCalls: [{
            name: "media.analyze",
            args: {
                attachments: threeReferences.map((artifact, index) => ({
                    name: `identity-${index + 1}.jpg`,
                    artifact,
                    mimeType: "image/jpeg"
                }))
            }
        }],
        requiredToolNames: ["media.analyze"],
        planner: async ({ mission: state }) => {
            plannerCalls += 1;
            if (state.completedTasks.some(item => item.name === "video.generate")) {
                return {
                    toolCalls: [],
                    missionComplete: true,
                    completionAssessment: { missing: [] }
                };
            }
            const analysis = state.completedTasks.find(item => item.name === "media.analyze");
            assert.ok(analysis, "the completion audit must receive the media analysis observation");
            assert.deepEqual(
                analysis.observation.evidence.persistedArtifacts,
                threeReferences
            );
            return {
                toolCalls: [{
                    name: "video.generate",
                    args: {
                        script: "Mini drama de identidad verificada.",
                        referenceOutputs: analysis.observation.evidence.persistedArtifacts,
                        scenes: [
                            { prompt: "Escena uno" },
                            { prompt: "Escena dos" },
                            { prompt: "Escena tres" }
                        ],
                        aspectRatio: "9:16",
                        output: ".jarvis-artifacts/videos/identity-mini-drama.mp4"
                    }
                }],
                missionComplete: false,
                completionAssessment: { missing: ["video.generate"] }
            };
        },
        execute: async call => {
            executed.push(call.name);
            if (call.name === "media.analyze") {
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "MEDIA_ANALYSIS_GROUNDED",
                    persistedArtifacts: threeReferences
                };
            }
            assert.equal(call.name, "video.generate");
            assert.deepEqual(call.args.referenceOutputs, threeReferences);
            assert.equal(call.args.scenes.length, 3);
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "VIDEO_GENERATED_VERIFIED",
                output: call.args.output,
                mimeType: "video/mp4",
                bytes: 8192,
                sha256: "a".repeat(64)
            };
        },
        storage: memoryStorage()
    });

    assert.ok(plannerCalls >= 1);
    assert.deepEqual(executed, ["media.analyze", "video.generate"]);
    assert.equal(mission.status, "COMPLETED");
    assert.equal(mission.requiredToolNames.includes("video.generate"), true);
});

test("v142 planner state preserves verified persisted artifacts for video reference continuity", () => {
    const compact = compactMissionPlannerObservation({
        ok: true,
        executionOk: true,
        objectiveSatisfied: true,
        status: "MEDIA_ANALYSIS_GROUNDED",
        evidence: {
            persistedArtifacts: threeReferences
        }
    });

    assert.deepEqual(compact.persistedArtifacts, threeReferences);
});

test("v142 four verified references reach video.generate and fail closed with the explicit Veo limit", async () => {
    const fourReferences = [
        ...threeReferences,
        ".jarvis-artifacts/uploads/identity-extra.jpg"
    ];
    const runtime = runtimeFixture();
    registerJarvisActuatorTools(runtime);
    const executed = [];

    const mission = await runJarvisMission({
        instruction: "Usa estas 4 fotografías verificadas como identidad y crea un mini drama cinematográfico con MP4 final.",
        initialToolCalls: [{
            name: "media.analyze",
            args: {
                attachments: fourReferences.map(artifact => ({
                    artifact,
                    mimeType: "image/jpeg"
                }))
            }
        }],
        requiredToolNames: ["media.analyze"],
        planner: async ({ mission: state }) => {
            const analysis = state.completedTasks.find(item => item.name === "media.analyze");
            assert.ok(analysis);
            return {
                toolCalls: [{
                    name: "video.generate",
                    args: {
                        script: "Mini drama con identidad persistente.",
                        referenceOutputs: fourReferences,
                        scenes: [
                            { prompt: "Escena uno" },
                            { prompt: "Escena dos" },
                            { prompt: "Escena tres" }
                        ],
                        output: ".jarvis-artifacts/videos/four-reference-mini-drama.mp4"
                    }
                }],
                missionComplete: false,
                completionAssessment: { missing: ["video.generate"] }
            };
        },
        execute: async call => {
            executed.push(call.name);
            if (call.name === "media.analyze") {
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "MEDIA_ANALYSIS_GROUNDED",
                    persistedArtifacts: fourReferences
                };
            }
            return runtime.get("video.generate").execute(call.args, {
                rawInput: "Mini drama con cuatro referencias"
            });
        },
        storage: memoryStorage()
    });

    assert.deepEqual(executed, ["media.analyze", "video.generate"]);
    assert.equal(mission.status, "PARTIAL");
    assert.equal(mission.reason, "MISSION_INPUT_REQUIRED");
    assert.equal(mission.requiredToolNames.includes("video.generate"), true);
    assert.equal(mission.blockedTasks.length, 1);
    assert.equal(
        mission.blockedTasks[0].observation.status,
        "VIDEO_REFERENCE_IMAGE_LIMIT_EXCEEDED"
    );
});
