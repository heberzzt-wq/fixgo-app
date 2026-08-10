import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
    createJarvisSemanticMemory
} from "../gestia-core/jarvis/jarvis.semantic.memory.js";
import {
    planMarketingRequest
} from "../gestia-core/jarvis/jarvis.marketing.engine.js";

class Storage {
    constructor() { this.map = new Map(); }
    getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
    setItem(key, value) { this.map.set(key, String(value)); }
    removeItem(key) { this.map.delete(key); }
}

test("semantic memory persists conversations and structural failure lessons without lexical routing", async () => {
    const storage = new Storage();
    const session = new Storage();
    const identity = { userId: "owner", workspaceId: "peninsula", projectId: "adjunto" };
    let sequence = 0;
    const first = createJarvisSemanticMemory({
        storage,
        sessionStorage: session,
        now: () => `2026-08-09T22:00:${String(sequence++).padStart(2, "0")}Z`
    });
    await first.rememberTurn({ identity, role: "user", content: "Primera conversación" });
    await first.rememberTurn({ identity, role: "assistant", content: "Resultado real" });
    await first.rememberMission({
        identity,
        instruction: "crear paquete",
        mission: {
            missionId: "m-1",
            caseId: "c-1",
            objectiveId: "o-1",
            status: "PARTIAL",
            reason: "TOOL_FAILED",
            completedTasks: [{ name: "media.analyze" }],
            blockedTasks: [{ name: "image.generate" }],
            errors: [{ status: "IMAGE_TOOL_FAILED" }]
        },
        finalResponse: { text: "La imagen quedó bloqueada." }
    });
    const rebuilt = createJarvisSemanticMemory({ storage, sessionStorage: session });
    const recalled = await rebuilt.recall({ identity });
    assert.equal(recalled.turns.length, 2);
    assert.equal(recalled.missions.length, 1);
    assert.equal(recalled.lessons.length, 1);
    assert.equal(recalled.lessons[0].blockedTools[0], "image.generate");
    assert.equal(recalled.policy.memoryNeverBecomesCurrentMissionEvidence, true);
    assert.equal(recalled.policy.relevanceDecidedBySemanticModel, true);
    const other = await rebuilt.recall({ identity: { ...identity, userId: "other" } });
    assert.equal(other.turns.length, 0);
});

test("active terminal boot no longer loads lexical context memory or duplicate runtime module URLs", () => {
    const html = fs.readFileSync(new URL("../gestia-terminal.html", import.meta.url), "utf8");
    const terminal = fs.readFileSync(new URL("../gestia-terminal.js", import.meta.url), "utf8");
    assert.doesNotMatch(html, /jarvis\.context\.memory\.v6\.js/);
    assert.doesNotMatch(html, /<script type="module" src="\/gestia-core\/tools\.runtime\.js/);
    assert.match(terminal, /KernelHeberto\.inicializarAutoridad\(\)/);
    assert.match(html, /memoria semántica de sesiones anteriores/);
    assert.doesNotMatch(html, /fixgo-real-runtime-e2e-v3-20260805/);
    assert.match(html, /gestia-terminal\.js\?v=v94-[a-z0-9-]+-[0-9]{8}/);
    const core = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
    assert.doesNotMatch(core, /tools\.runtime\.js\?v=v94-semantic-only-v108-20260809/);
    assert.match(core, /tools\.runtime\.js\?v=v94-page-request-contract-v118-20260810/);
});

test("artifact composers receive canonical mission evidence and semantic memory stays advisory", () => {
    const pack = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multitool.pack.js", import.meta.url), "utf8");
    const planner = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");
    const mission = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.mission.orchestrator.js", import.meta.url), "utf8");
    assert.match(pack, /EVIDENCIA_CANONICA_DE_MISION/);
    assert.match(pack, /MEMORIA_SEMANTICA_ADVISORY/);
    assert.match(planner, /missionEvidence/);
    assert.match(mission, /canonicalMissionEvidence/);
    assert.match(mission, /semanticMemory: memoryContext/);
});

test("marketing engine cannot fall back to generic false-green phrases", () => {
    const source = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.marketing.engine.js", import.meta.url), "utf8");
    for (const residue of [
        "clientes potenciales relevantes para la oferta de la marca",
        "fricción entre una necesidad real del cliente y una decisión de compra clara",
        "proveedores informales",
        "presupuesto piloto por definir",
        "WHEN_INFRASTRUCTURE_AVAILABLE",
        "instruction_inference"
    ]) {
        assert.equal(source.includes(residue), false, residue);
    }
    const result = planMarketingRequest("Prepara marketing", {
        brandName: "Multiservicios Peninsulares HMH",
        productionRequested: false
    });
    assert.equal(result.status, "MARKETING_SEMANTIC_BRIEF_INCOMPLETE");
    assert.equal(result.objectiveSatisfied, false);
    assert.ok(result.missingSemanticFields.includes("tone"));
    assert.ok(result.missingSemanticFields.includes("metrics"));
});
