import test from "node:test";
import assert from "node:assert/strict";
import { __test as mission, runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import { compactMissionPlannerObservation } from "../gestia-core/jarvis/jarvis.mission.planner-state.js";
import { completeJarvisPlanningArguments } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";
import { normalizeImageArtifactPrefix, normalizeMaterialLibraryArguments } from "../gestia-core/jarvis/jarvis.actuator.pack.js";
import { createRequire } from "node:module";
import { __test as planner, mergeJarvisToolCalls } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";
const { validatePlan } = createRequire(import.meta.url)("../functions/jarvis-semantic-planner.js");

test("export binds an exact artifact path alias without choosing a different action or file", () => {
    const output = ".jarvis-artifacts/images/ad.png";
    assert.deepEqual(normalizeMaterialLibraryArguments({ action: "export", relativePath: output }), {
        action: "export", relativePath: undefined, output
    });
    assert.deepEqual(normalizeMaterialLibraryArguments({ action: "list", relativePath: output }), { action: "list", relativePath: output });
    assert.throws(() => normalizeMaterialLibraryArguments({ action: "export", relativePath: output, output: output + ".other" }), /AMBIGUOUS/);
});

test("distinct deferred library operations survive backend, browser and mission deduplication", () => {
    const catalog = [{ name: "media.library", mutates: true, inputSchema: {
        type: "object", properties: { action: { type: "string" } }, required: ["action"]
    } }];
    const calls = ["list originals", "export completed image"].map(operation => ({
        name: "media.library", args: {}, deferred: true, obligationId: `semantic:${operation}`, reason: operation
    }));
    const validated = validatePlan({ toolCalls: [...calls, calls[0]] }, catalog, "", { allowDeferred: true });
    assert.equal(validated.toolCalls.length, 2);
    const browserCalls = planner.trustedPlanCalls({ ...validated, planKind: "MISSION_CONTRACT_COMPACT_LOCAL" }, catalog, {});
    assert.equal(browserCalls.length, 2);
    const merged = mergeJarvisToolCalls(browserCalls, browserCalls);
    assert.equal(merged.length, 2);
    const scheduled = mission.trustedCalls(merged, { completedTasks: [], pendingTasks: [], blockedTasks: [] });
    assert.equal(scheduled.length, 2);
    assert.equal(scheduled[1].reason, "export completed image");
    assert.notEqual(scheduled[0].signature, scheduled[1].signature);
    // Fully specified duplicate actions still collapse even with different labels.
    const ready = calls.map(call => ({ ...call, deferred: false, args: { action: "list" } }));
    assert.equal(validatePlan({ toolCalls: ready }, catalog).toolCalls.length, 1);
});

test("the executor receives the semantic operation when the same tool is used twice", async () => {
    const reasons = [];
    const calls = ["list originals", "export completed image"].map(reason => ({
        name: "media.library", args: {}, deferred: true, obligationId: reason, reason
    }));
    let planning = 0;
    await runJarvisMission({ instruction: "Use official materials and export the result", maximumSteps: 4,
        planner: async () => ++planning === 1 ? { toolCalls: calls } : { toolCalls: [], missionComplete: true },
        execute: async call => { reasons.push(call.reason); return { ok: true, status: "COMPLETED" }; }
    });
    assert.deepEqual(reasons, ["list originals", "export completed image"]);
});

test("image names remain under the artifact directory before exporting separately", () => {
    assert.equal(normalizeImageArtifactPrefix("Salidas"), ".jarvis-artifacts/images/Salidas");
    assert.equal(normalizeImageArtifactPrefix(undefined, "adapted-123"), ".jarvis-artifacts/images/adapted-123");
    assert.equal(normalizeImageArtifactPrefix(".jarvis-artifacts/images/ad-123"), ".jarvis-artifacts/images/ad-123");
    for (const value of ["../escape", "C:/Users/test", "Salidas/anuncio", ".jarvis-artifacts/images/../../escape"]) {
        assert.throws(() => normalizeImageArtifactPrefix(value), /IMAGE_ADAPTATION_OUTPUT_INVALID/);
    }
});

const entries = Array.from({ length: 7 }, (_, index) => ({
    relativePath: index === 6 ? "Logos/Firma/logo.png" : `Entradas/Firma/imagen-${index}.png`,
    role: index === 6 ? "official_logo_source" : "input", mimeType: "image/png",
    bytes: 2500000, sha256: String(index).repeat(64), width: 1200, height: 1200,
    description: "Original aportado por el usuario", photoRegion: { x: 0, y: 0, width: 700, height: 900 }
}));
const observation = { ok: true, status: "MATERIAL_LIBRARY_LISTED", objectiveSatisfied: true,
    summary: "Inventario de originales", evidence: { ok: true, status: "MATERIAL_LIBRARY_LISTED", entries,
        advertisingHistory: [{ createdAt: "2026-10-02T12:00:00Z", creative: { headline: "Previous delivered ad" } }] } };

test("library inventory survives the canonical evidence and replanning boundaries", () => {
    const canonical = mission.canonicalMissionEvidence({ completedTasks: [{ name: "media.library", observation }] });
    assert.equal(canonical.length, 1);
    assert.equal(canonical[0].evidence.entries.length, 7);
    const compact = compactMissionPlannerObservation(observation);
    assert.equal(compact.materialReferences.length, 7);
    assert.equal(compact.materialReferences[6].ref, "library:Logos/Firma/logo.png");
    assert.equal(compact.advertisingHistory[0].creative.headline, "Previous delivered ad");
});

test("argument completion receives exact material references including logos beyond the third entry", async () => {
    let request;
    await completeJarvisPlanningArguments({
        toolName: "image.adapt", instruction: "Crea un anuncio con el original y el logo oficial.", operation: "compose the requested image",
        inputSchema: { type: "object", properties: { sourceOutput: { type: "string" } } },
        missionEvidence: [{ tool: "media.library", status: observation.status, summary: observation.summary, evidence: observation.evidence }],
        semanticPlanner: async input => { request = input; return { toolCalls: [{ name: "image.adapt", args: { sourceOutput: "library:Entradas/Firma/imagen-0.png" } }] }; }
    });
    const serialized = JSON.stringify(request);
    assert.ok(serialized.includes("library:Logos/Firma/logo.png"));
    assert.ok(serialized.includes("photoRegion"));
    assert.ok(serialized.includes("OPERACION_ACTUAL_DEL_PLAN=compose the requested image"));
    assert.ok(serialized.includes("Previous delivered ad"));
    assert.ok(serialized.includes("PUBLICIDAD_YA_ENTREGADA"));
});
