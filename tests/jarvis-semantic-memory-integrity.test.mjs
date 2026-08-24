import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
    createJarvisSemanticMemory,
    compactJarvisSemanticMemoryForPlanner
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


test("planner semantic context is bounded to the current conversation and remains advisory", () => {
    const memory = {
        currentConversationId: "current",
        turns: [
            { conversationId: "old", role: "user", content: "No contaminar" },
            { conversationId: "current", role: "user", content: "Prepara el plan de marketing" },
            { conversationId: "current", role: "assistant", content: "Plan preparado" },
            { conversationId: "current", role: "user", content: "Ahora crea los archivos" }
        ],
        missions: [
            { conversationId: "old", instruction: "Misión ajena", finalText: "No usar" },
            {
                conversationId: "current",
                missionId: "marketing-1",
                instruction: "Prepara un plan de marketing para Multiservicios Peninsulares HMH",
                missionStatus: "COMPLETED",
                completedTools: ["web.research", "marketing.plan"],
                finalText: "Plan de marketing preparado con piezas listas para producción.",
                producedArtifacts: []
            }
        ]
    };
    const context = compactJarvisSemanticMemoryForPlanner(memory);
    assert.equal(context.authority, "ADVISORY_SEMANTIC_MEMORY");
    assert.equal(context.currentConversationId, "current");
    assert.equal(context.turns.length, 3);
    assert.equal(context.missions.length, 1);
    assert.match(context.missions[0].instruction, /Multiservicios Peninsulares HMH/);
    assert.match(context.turns.at(-1).content, /crea los archivos/);
    assert.equal(JSON.stringify(context).includes("No contaminar"), false);
    assert.equal(JSON.stringify(context).includes("Misión ajena"), false);
    assert.equal(context.policy.memoryNeverBecomesCurrentMissionEvidence, true);
    assert.equal(context.policy.noLexicalRouting, true);
});

test("terminal planner keeps mission memory advisory while direct conversation retains semantic continuity", () => {
    const core = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
    const pack = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multitool.pack.js", import.meta.url), "utf8");
    assert.match(core, /phase: "CURRENT_TURN"[\s\S]{0,500}advisorySemanticContext: compactJarvisSemanticMemoryForPlanner\(semanticMemory\)/);
    assert.match(core, /phase: "MISSION_CONTRACT"[\s\S]{0,900}advisorySemanticContext: compactJarvisSemanticMemoryForPlanner\(semanticMemoryContext\)/);
    assert.match(core, /CURRENT_TURN_CONVERSATION_TOOL_EXECUTION[\s\S]{0,900}semanticMemory:\s*semanticMemoryContext/);
    assert.match(pack, /Responde la instrucción actual usando memoria semántica únicamente como contexto asesor/);
    assert.match(pack, /nunca se convierte por sí sola en evidencia factual de la misión actual/);
    assert.doesNotMatch(core, /lexicalRouting\s*:\s*true/);
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
