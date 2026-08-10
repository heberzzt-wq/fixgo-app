import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

if (!globalThis.window) globalThis.window = {};

const { __test: missionTest } = await import(
    "../gestia-core/jarvis/jarvis.mission.orchestrator.js?v113-human-reds"
);
const {
    reelArtifactArgsFromCompletedTasks
} = await import(
    "../gestia-core/jarvis/jarvis.reel.presenter.js?v113-human-reds"
);
const {
    resolveMarketingMissionProductionScope
} = await import(
    "../gestia-core/jarvis/jarvis.multitool.pack.js?v113-human-reds"
);

const validReelPlan = {
    ok: true,
    executionOk: true,
    objectiveSatisfied: true,
    status: "REEL_PLAN_READY",
    brandName: "Multiservicios Peninsulares HMH",
    title: "Mantenimiento que se nota",
    cta: "Solicita atención",
    durationSeconds: 30,
    timelineSeconds: 30,
    scenes: [
        { durationSeconds: 10, visual: "Inspección", overlay: "Detecta antes", voiceover: "Revisión preventiva", evidence: "sitio oficial" },
        { durationSeconds: 10, visual: "Reparación", overlay: "Resuelve a tiempo", voiceover: "Atención técnica", evidence: "sitio oficial" },
        { durationSeconds: 10, visual: "Resultado", overlay: "Mantén tu espacio", voiceover: "Soluciones integrales", evidence: "sitio oficial" }
    ]
};

test("safeObservation preserves executable reel.plan storyboard", () => {
    const observation = missionTest.safeObservation(validReelPlan);
    assert.equal(observation.status, "REEL_PLAN_READY");
    assert.equal(observation.objectiveSatisfied, true);
    assert.equal(observation.preparedArtifact.kind, "reel");
    assert.equal(observation.preparedArtifact.scenes.length, 3);
    assert.equal(observation.preparedArtifact.durationSeconds, 30);
});

test("reel.create args are hydrated deterministically from completed reel.plan", () => {
    const observation = missionTest.safeObservation(validReelPlan);
    const args = reelArtifactArgsFromCompletedTasks([
        { name: "reel.plan", observation }
    ], { objectiveId: "OBJ-1" });
    assert.ok(args);
    assert.equal(args.durationSeconds, 30);
    assert.equal(args.scenes.length, 3);
    assert.equal(args.scenes[0].overlay, "Detecta antes");
    assert.equal(args.scenes[0].subtitle, "Revisión preventiva");
    assert.equal(args.scenes[0].visualDescription, "Inspección");
});

test("marketing production scope inherits tools already selected by mission contract", () => {
    const args = resolveMarketingMissionProductionScope(
        { brandName: "HMH" },
        { requiredToolNames: ["web.research", "marketing.plan", "reel.plan", "reel.create", "document.create"] }
    );
    assert.equal(args.productionRequested, true);
    assert.deepEqual(
        args.productionArtifacts.map(item => item.toolName).sort(),
        ["document.create", "reel.create"]
    );
});

test("terminal accepts finalResponse without requiring AGENT_TOOL_RESULT and never asks valid repo objective to be reformulated", () => {
    const terminal = fs.readFileSync(path.join(process.cwd(), "gestia-terminal.html"), "utf8");
    assert.match(terminal, /coreResult\?\.finalResponse\s*\|\|/);
    assert.doesNotMatch(terminal, /coreResult\?\.type === "AGENT_TOOL_RESULT"\s*&&\s*typeof preferredAgentFinalResponse/);
    assert.doesNotMatch(terminal, /reformula el objetivo tecnico para reentrar por GestiaCore/);
    assert.match(terminal, /TERMINAL_CORE_RESPONSE_NOT_PRESENTED/);
});

test("reel creator and bridge require a physical verified WebM", () => {
    const reelArtifact = fs.readFileSync(path.join(process.cwd(), "jarvis-reel-artifact.js"), "utf8");
    const bridge = fs.readFileSync(path.join(process.cwd(), "jarvis-fs-bridge.js"), "utf8");
    const actuator = fs.readFileSync(path.join(process.cwd(), "gestia-core", "jarvis", "jarvis.actuator.pack.js"), "utf8");
    assert.match(reelArtifact, /__JARVIS_LAST_REEL_BLOB__/);
    assert.match(bridge, /exportReelWebmWithChrome/);
    assert.match(bridge, /REEL_VIDEO_CREATED_VERIFIED/);
    assert.match(bridge, /REEL_WEBM_SHA256_MISMATCH/);
    assert.match(actuator, /REEL_VIDEO_CREATED_VERIFIED/);
    assert.doesNotMatch(actuator, /result\?\.status === "REEL_STUDIO_CREATED_VERIFIED"/);
});


test("reel human response reports the physical WebM as primary artifact", () => {
    const bridge = fs.readFileSync(path.join(process.cwd(), "gestia-core", "tools.bridge.js"), "utf8");
    assert.match(bridge, /"Reel creado"/);
    assert.match(bridge, /data\?\.videoOutput/);
    assert.match(bridge, /SHA-256/);
    assert.match(bridge, /WebM fue generado fisicamente/);
    assert.match(bridge, /Estudio editable auxiliar/);
    assert.doesNotMatch(bridge, /exportacion WebM se realiza desde el navegador/);
    assert.doesNotMatch(bridge, /"Estudio de reel creado"/);
});

test("browser runtime rejects a pre-v113 local bridge before actuator calls", () => {
    const runtime = fs.readFileSync(path.join(process.cwd(), "gestia-core", "tools.runtime.js"), "utf8");
    assert.match(runtime, /2\.37\.0-verified-reel-webm/);
    assert.match(runtime, /jarvisBridgeVersionAtLeast/);
    assert.match(runtime, /LOCAL_BRIDGE_VERSION_MISMATCH/);
    assert.match(runtime, /requiredBridgeVersion/);
    assert.match(runtime, /bridgeVersionCompatible/);
});
