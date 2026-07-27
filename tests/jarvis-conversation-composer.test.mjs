import assert from "node:assert/strict";
import test from "node:test";

import {
    buildBoundedConversationEvidence,
    composeEvidenceGroundedConversation,
    isExplicitJsonResponseRequest,
    prepareEvidenceGroundedConversationPlan
} from "../gestia-core/jarvis/jarvis.conversation.composer.js";
import {
    mergeJarvisToolCalls
} from "../gestia-core/jarvis/jarvis.multifunction.planner.js";

const exactMixedInstruction =
    "Buenos días, dame un resumen de lo que ya puedes hacer y lo que aún no.";

const capabilityEvidence = {
    ok: true,
    engine: "jarvis_multifunction_tools",
    version: "1.49.0-multimodal-batch-integrity",
    totalTools: 72,
    groups: {
        conversation: ["conversation.respond"],
        system: ["system.capabilities", "system.forensics"],
        document: ["document.compose", "document.create"],
        repo: ["repo.read", "repo.patchPreview"]
    },
    policy: {
        readOnlyByDefault: true,
        mutatingToolsRequireApproval: true
    }
};

const limitationEvidence = {
    ok: true,
    readinessScore: 82,
    parity: "PARTIAL",
    gaps: [
        "Algunas operaciones requieren permisos y servicios disponibles.",
        "Una misión no se completa si falta evidencia o falla una herramienta."
    ]
};

test("mixed capability request executes evidence before one human composition", async () => {
    const prepared = prepareEvidenceGroundedConversationPlan({
        instruction: exactMixedInstruction,
        toolCalls: [
            {
                name: "conversation.respond",
                args: { prompt: exactMixedInstruction }
            },
            {
                name: "system.capabilities",
                args: {}
            }
        ],
        toolCatalog: [
            { name: "conversation.respond" },
            { name: "system.capabilities" },
            { name: "system.forensics" }
        ]
    });
    const executionOrder = [];
    const evidenceItems = [];

    for (const call of prepared.operationalCalls) {
        executionOrder.push(call.name);
        evidenceItems.push({
            name: call.name,
            observation:
                call.name === "system.capabilities"
                    ? capabilityEvidence
                    : limitationEvidence
        });
    }

    let compositorPrompt = "";
    const composed = await composeEvidenceGroundedConversation({
        instruction: exactMixedInstruction,
        evidenceItems,
        executeConversation: async prompt => {
            executionOrder.push("conversation.respond");
            compositorPrompt = prompt;
            return {
                ok: true,
                data: {
                    ok: true,
                    message:
                        "Buenos días, Heberto. Puedo conversar, analizar archivos, investigar, trabajar con documentos y ejecutar misiones verificables. Aún dependo de servicios y permisos disponibles; algunas operaciones requieren autorización y no considero completada una misión si falta evidencia o falla una herramienta."
                }
            };
        }
    });

    assert.deepEqual(
        executionOrder,
        [
            "system.capabilities",
            "system.forensics",
            "conversation.respond"
        ]
    );
    assert.match(compositorPrompt, /system\.capabilities/);
    assert.match(compositorPrompt, /system\.forensics/);
    assert.equal(composed.ok, true);
    assert.match(composed.text, /Buenos días/);
    assert.match(composed.text, /Puedo conversar/);
    assert.match(composed.text, /Aún dependo/);
    assert.doesNotMatch(composed.text, /"engine":|"totalTools":|"groups":/);
});

test("simple natural question stays conversational without capability evidence", () => {
    const prepared = prepareEvidenceGroundedConversationPlan({
        instruction: "¿Cómo estás?",
        toolCalls: [{
            name: "conversation.respond",
            args: { prompt: "¿Cómo estás?" }
        }],
        toolCatalog: [
            { name: "conversation.respond" },
            { name: "system.capabilities" }
        ]
    });

    assert.equal(prepared.conversationRequested, true);
    assert.deepEqual(prepared.operationalCalls, []);
    assert.equal(prepared.requiresFinalConversation, false);
});

test("explicit JSON capability request remains the only raw-output exception", () => {
    const instruction =
        "Devuélveme en JSON las herramientas disponibles.";
    const prepared = prepareEvidenceGroundedConversationPlan({
        instruction,
        toolCalls: [{
            name: "system.capabilities",
            args: {}
        }],
        toolCatalog: [
            { name: "system.capabilities" },
            { name: "system.forensics" }
        ]
    });

    assert.equal(isExplicitJsonResponseRequest(instruction), true);
    assert.deepEqual(
        prepared.operationalCalls.map(call => call.name),
        ["system.capabilities"]
    );
    assert.equal(prepared.requiresFinalConversation, false);
    assert.doesNotThrow(() =>
        JSON.parse(JSON.stringify(capabilityEvidence))
    );
});

test("successful capabilities cannot complete when final composition fails", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: exactMixedInstruction,
        evidenceItems: [{
            name: "system.capabilities",
            observation: capabilityEvidence
        }],
        executeConversation: async () => ({
            ok: false,
            status: "SEMANTIC_CONVERSATION_UNAVAILABLE"
        })
    });
    const terminalStatus =
        result.ok
            ? "COMPLETED"
            : "PARTIAL";

    assert.equal(result.ok, false);
    assert.equal(terminalStatus, "PARTIAL");
    assert.equal(result.text, "");
});

test("mixed plan merge preserves conversation, capabilities and forensics", () => {
    const merged = mergeJarvisToolCalls(
        [{
            name: "conversation.respond",
            args: { prompt: exactMixedInstruction }
        }],
        [{
            name: "system.capabilities",
            args: {}
        }],
        [{
            name: "system.forensics",
            args: {}
        }]
    );

    assert.deepEqual(
        merged.map(call => call.name),
        [
            "conversation.respond",
            "system.capabilities",
            "system.forensics"
        ]
    );
});

test("bounded composition evidence removes raw content fields", () => {
    const evidence = buildBoundedConversationEvidence([{
        name: "system.capabilities",
        observation: {
            ...capabilityEvidence,
            content: "RAW_RUNTIME_DUMP",
            bytes: "AAEC"
        }
    }]);

    assert.match(evidence, /system\.capabilities/);
    assert.doesNotMatch(evidence, /RAW_RUNTIME_DUMP|AAEC/);
});

test("oversized composition evidence remains valid bounded JSON", () => {
    const evidence = buildBoundedConversationEvidence(
        Array.from({ length: 12 }, (_, index) => ({
            name: `tool.${index}`,
            observation: {
                ok: true,
                summary: "e".repeat(5000),
                content: "RAW".repeat(5000)
            }
        }))
    );

    assert.ok(evidence.length <= 24000);
    assert.doesNotThrow(() => JSON.parse(evidence));
});

test("non-JSON composition rejects a raw tool payload", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: exactMixedInstruction,
        evidenceItems: [{
            name: "system.capabilities",
            observation: capabilityEvidence
        }],
        executeConversation: async () => ({
            ok: true,
            data: {
                ok: true,
                message: JSON.stringify(capabilityEvidence)
            }
        })
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "RAW_TOOL_PAYLOAD_REJECTED");
});
