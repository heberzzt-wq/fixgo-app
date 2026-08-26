import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import { compactMissionPlannerObservation } from "../gestia-core/jarvis/jarvis.mission.planner-state.js";
import { registerJarvisActuatorTools } from "../gestia-core/jarvis/jarvis.actuator.pack.js";
import {
    buildLocalAiCapabilityReport,
    LOCAL_VIDEO_MODEL_PROFILE,
    resolveLocalVideoModelProfile
} from "../jarvis-local-video-engine.js";

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

test("v142 local video keeps Wan2.2 as the deterministic default and exposes a light backend explicitly", () => {
    const stable = resolveLocalVideoModelProfile({ env: {} });
    const light = resolveLocalVideoModelProfile({
        env: { JARVIS_LOCAL_VIDEO_MODEL: "wan21-t2v-1.3b" },
        hardware: { cudaAvailable: true, vramGb: 12, freeDiskGb: 80 }
    });

    assert.equal(stable, LOCAL_VIDEO_MODEL_PROFILE);
    assert.equal(stable.backend, "wan22-ti2v-5b");
    assert.equal(stable.minimumVramGb, 24);
    assert.deepEqual(stable.portraitSize, { width: 704, height: 1280 });
    assert.equal(stable.targetFps, 24);
    assert.equal(stable.maximumReferenceAssets, 1);
    assert.equal(light.backend, "wan21-t2v-1.3b");
    assert.equal(light.model, "Wan2.1-T2V-1.3B");
    assert.equal(light.minimumVramGb, 8.19);
    assert.equal(light.targetResolution, "480p");
    assert.equal(light.targetFps, 16);
    assert.deepEqual(light.portraitSize, { width: 480, height: 832 });
    assert.equal(light.imageToVideo, false);
    assert.equal(light.referenceAssets, false);
    assert.equal(light.maximumReferenceAssets, 0);
});

test("v142 AUTO selects the strongest compatible local backend under LOCAL_PREFERRED", () => {
    const twelveGb = resolveLocalVideoModelProfile({
        env: { JARVIS_LOCAL_VIDEO_MODEL: "auto" },
        hardware: { cudaAvailable: true, vramGb: 12, freeDiskGb: 80 }
    });
    const twentyFourGb = resolveLocalVideoModelProfile({
        env: { JARVIS_LOCAL_VIDEO_MODEL: "auto" },
        hardware: { cudaAvailable: true, vramGb: 24, freeDiskGb: 80 }
    });
    const report = buildLocalAiCapabilityReport({
        root: process.cwd(),
        env: { JARVIS_LOCAL_VIDEO_MODEL: "auto" },
        hardware: {
            ok: true,
            status: "LOCAL_VIDEO_HARDWARE_READY",
            cudaAvailable: true,
            gpuName: "TEST_GPU_12GB",
            vramGb: 12,
            freeDiskGb: 80,
            ffmpegAvailable: true,
            ffprobeAvailable: true
        }
    });

    assert.equal(twelveGb.backend, "wan21-t2v-1.3b");
    assert.equal(twentyFourGb.backend, "wan22-ti2v-5b");
    assert.equal(report.selectedVideoModel.backend, "wan21-t2v-1.3b");
    assert.equal(
        report.candidateVideoModels.find(item => item.backend === "wan21-t2v-1.3b").compatible,
        true
    );
    assert.equal(
        report.candidateVideoModels.find(item => item.backend === "wan22-ti2v-5b").compatible,
        false
    );
    assert.equal(report.promotion.current, "LOCAL_PREFERRED");
    assert.equal(report.promotion.rollback, "CURRENT_STABLE");
});

test("v142 unknown local backend fails closed instead of silently selecting Wan2.2", () => {
    const invalid = resolveLocalVideoModelProfile({
        env: { JARVIS_LOCAL_VIDEO_MODEL: "invented-video-backend" },
        hardware: { cudaAvailable: true, vramGb: 32, freeDiskGb: 100 }
    });
    const report = buildLocalAiCapabilityReport({
        root: process.cwd(),
        env: { JARVIS_LOCAL_VIDEO_MODEL: "invented-video-backend" },
        hardware: {
            ok: true,
            status: "LOCAL_VIDEO_HARDWARE_READY",
            cudaAvailable: true,
            gpuName: "TEST_GPU_32GB",
            vramGb: 32,
            freeDiskGb: 100,
            ffmpegAvailable: true,
            ffprobeAvailable: true
        }
    });

    assert.equal(invalid.unsupported, true);
    assert.equal(invalid.backend, null);
    assert.equal(invalid.requestedBackend, "invented-video-backend");
    assert.equal(report.localVideoReadiness.supported, false);
    assert.equal(report.localVideoReadiness.status, "LOCAL_VIDEO_BACKEND_UNSUPPORTED");
});

test("v142 offline Wan runner uses official geometry, one-reference truth and physical media gates", () => {
    const runner = "scripts/jarvis-local-video-wan22.py";
    const source = fs.readFileSync(runner, "utf8");
    for (const marker of [
        "wan22-ti2v-5b",
        "wan21-t2v-1.3b",
        "JARVIS_WAN22_REPO_DIR",
        "JARVIS_WAN21_REPO_DIR",
        '"portrait_size": "704*1280"',
        '"landscape_size": "1280*704"',
        '"target_fps": 24.0',
        '"max_reference_assets": 1',
        '"target_fps": 16.0',
        '"max_reference_assets": 0',
        "LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED",
        "LOCAL_VIDEO_DIMENSIONS_MISMATCH",
        "LOCAL_VIDEO_FPS_BELOW_BACKEND_TARGET",
        "verify_backend_media(media, config, size)",
        'environment["HF_HUB_OFFLINE"] = "1"',
        'environment["TRANSFORMERS_OFFLINE"] = "1"'
    ]) {
        assert.equal(source.includes(marker), true, `missing runner marker: ${marker}`);
    }
    const python = process.platform === "win32" ? "python" : "python3";
    execFileSync(python, [
        "-c",
        `import ast,pathlib; ast.parse(pathlib.Path(${JSON.stringify(runner)}).read_text(encoding='utf-8'))`
    ], { stdio: "pipe" });
});

test("v142 local engine records best-GPU selection and pins the spawned worker to it", () => {
    const source = fs.readFileSync("jarvis-local-video-engine.js", "utf8");
    for (const marker of [
        "--query-gpu=index,name,memory.total,driver_version",
        "right.vramGb - left.vramGb",
        "gpuIndex",
        "gpuInventory",
        "CUDA_VISIBLE_DEVICES",
        "LOCAL_VIDEO_BACKEND_UNSUPPORTED",
        "LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED",
        "maximumReferenceAssets"
    ]) {
        assert.equal(source.includes(marker), true, `missing local engine marker: ${marker}`);
    }
});
