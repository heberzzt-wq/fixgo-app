import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const read = relative =>
    fs.readFileSync(new URL("../" + relative, import.meta.url), "utf8");

test("runtime boot keeps repo cognition verbose logs quiet and defers hydration", () => {
    const repoCognition = read("modules/terminal/repo-cognition.js");
    const governance = read("modules/terminal/runtime-governance.js");
    const repairHealth = read("modules/terminal/runtime-repair-health.js");
    const eventBus = read("modules/terminal/runtime-event-bus.js");

    for (const marker of [
        "REPO_COGNITION_REHYDRATED",
        "IMPACT_ANALYSIS_READY",
        "CRITICALITY_PROPAGATION",
        "CRITICALITY_RESULT"
    ]) {
        const at = repoCognition.indexOf(marker);
        assert.ok(at >= 0, marker);
        assert.match(repoCognition.slice(Math.max(0, at - 90), at + 140), /gestiaBootLog/);
    }

    assert.match(governance, /gestiaBootLog\?\.\([\s\S]{0,90}RISK_NODE/);
    assert.match(repairHealth, /gestiaBootLog\?\.\([\s\S]{0,90}RUNTIME_STATE_CHANGE/);
    assert.match(repairHealth, /gestiaBootLog\?\.\([\s\S]{0,90}RUNTIME_STATE_UPDATED/);
    const autoHydrationAt = eventBus.indexOf("🧠 [AUTO_REPO_HYDRATION]");
    assert.ok(autoHydrationAt >= 0);
    assert.match(
        eventBus.slice(Math.max(0, autoHydrationAt - 100), autoHydrationAt + 160),
        /gestiaBootLog/
    );
    assert.match(eventBus, /const conversationBusy = \(\) =>/);
    assert.match(eventBus, /#btn-generate/);
    assert.match(eventBus, /conversationBusy\(\)/);
    assert.match(eventBus, /requestIdleCallback/);
    assert.match(eventBus, /timeout:\s*12000/);
    assert.match(eventBus, /setTimeout\(\s*runWhenIdle,\s*1500\s*\)/);
    assert.match(eventBus, /setTimeout\(\s*runWhenIdle,\s*5000\s*\)/);
});


test("snapshot and restore informational boot logs stay quiet while failures stay visible", () => {
    const memory = read("gestia-core/jarvis/jarvis.memory.js");
    const persistence = read("modules/terminal/runtime-persistence.js");
    const daemon = read("modules/terminal/runtime-snapshot-daemon.js");
    const terminalRuntime = read("gestia-terminal.js");

    for (const [source, markers] of [
        [memory, ["[SNAPSHOT] Punto de control creado"]],
        [persistence, [
            "RUNTIME_SNAPSHOT_START",
            "RUNTIME_SNAPSHOT_CREATED",
            "LATEST_RUNTIME_SNAPSHOT",
            "RUNTIME_RESTORE_START",
            "✅ [SNAPSHOT_VALID]",
            "AUTONOMOUS_STATE_RESTORED",
            "RUNTIME_RESTORE_OK"
        ]],
        [daemon, [
            "SNAPSHOT_DAEMON_BOOT",
            "RUNTIME_SNAPSHOT_SUCCESS",
            "SNAPSHOT_DAEMON_ONLINE"
        ]],
        [terminalRuntime, [
            "MODULE_RESTORED",
            "COGNITIVE_RUNTIME_RESTORED"
        ]]
    ]) {
        for (const marker of markers) {
            const at = source.indexOf(marker);
            assert.ok(at >= 0, marker);
            assert.match(
                source.slice(Math.max(0, at - 120), at + 180),
                /gestiaBootLog/
            );
        }
    }

    assert.match(persistence, /console\.error\([\s\S]{0,100}SNAPSHOT_VALIDATION_FAILED/);
    assert.match(persistence, /console\.error\([\s\S]{0,100}RUNTIME_RESTORE_FAIL/);
    assert.match(daemon, /console\.error\([\s\S]{0,100}SNAPSHOT_DAEMON_FAIL/);
    assert.match(daemon, /console\.error\([\s\S]{0,100}SNAPSHOT_DAEMON_BOOT_FAIL/);
});


test("V142 retains useful v5.9 runtime intelligence as on-demand governed services", () => {
    const governance = read("modules/terminal/runtime-governance.js");
    const platform = read("modules/terminal/runtime-platform.js");

    for (const state of [
        "__RUNTIME_EXPERIENCE__",
        "__RUNTIME_PREDICTION__",
        "__RUNTIME_STRATEGY__",
        "__RUNTIME_META_COGNITION__",
        "__RUNTIME_CONVERGENCE__",
        "__RUNTIME_SAFETY__",
        "__RUNTIME_HARDENING__"
    ]) {
        assert.match(governance, new RegExp(state.replaceAll("_", "\\_")));
    }

    for (const capability of [
        "storeRuntimeExperience",
        "executeRuntimePredictionAnalysis",
        "evaluateRuntimeStrategy",
        "executeCognitiveConvergence",
        "executeCognitiveSafetyCheck",
        "executeRuntimeHardeningCheck",
        "executeMetaCognitiveAnalysis",
        "analyzeRuntimeRecoveryNeeds",
        "getRuntimeHealingState",
        "evaluateRuntimeIntelligence"
    ]) {
        assert.match(governance, new RegExp(capability));
    }

    assert.match(governance, /ON_DEMAND_NO_BACKGROUND_COGNITION/);
    assert.doesNotMatch(governance, /startPredictiveRuntimeDaemon\s*=/);
    assert.doesNotMatch(governance, /startMetaCognitionDaemon\s*=/);
    assert.match(platform, /__RUNTIME_CONVERGENCE__/);
    assert.match(platform, /__RUNTIME_SAFETY__/);
    assert.match(platform, /__RUNTIME_HARDENING__/);
});
