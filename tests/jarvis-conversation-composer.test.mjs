import assert from "node:assert/strict";
import test from "node:test";

import {
    buildBoundedConversationEvidence,
    buildCapabilityEvidenceBriefing,
    composeEvidenceGroundedConversation,
    isExplicitJsonResponseRequest,
    mergeEvidenceGroundedToolCalls,
    prepareEvidenceGroundedConversationPlan
} from "../gestia-core/jarvis/jarvis.conversation.composer.js";
import {
    mergeJarvisToolCalls
} from "../gestia-core/jarvis/jarvis.multifunction.planner.js";
import fs from "node:fs";
import path from "node:path";

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

test("conversation evidence merge executes diagnostics and media analysis once", () => {
    const merged = mergeEvidenceGroundedToolCalls(
        [
            { name: "system.capabilities", args: { instruction: "capabilities" } },
            { name: "system.forensics", args: { instruction: "limits" } },
            {
                name: "media.analyze",
                args: {
                    attachments: [{ artifactId: "ATTACHMENT_1" }],
                    questions: ["tipo de documento"]
                }
            }
        ],
        [
            { name: "system.capabilities", args: {} },
            { name: "system.forensics", args: {} },
            {
                name: "media.analyze",
                args: {
                    attachments: [{ artifactId: "ATTACHMENT_1" }],
                    questions: ["autoridad emisora y vigencia"]
                }
            }
        ]
    );

    assert.deepEqual(
        merged.map(call => call.name),
        [
            "system.capabilities",
            "system.forensics",
            "media.analyze"
        ]
    );
    assert.equal(
        merged.filter(call => call.name === "media.analyze").length,
        1
    );
    assert.deepEqual(
        merged.find(call => call.name === "media.analyze").args.questions,
        ["tipo de documento"]
    );
});

test("Gestia core imports the evidence merge helper used by the conversational mission", () => {
    const core = fs.readFileSync(
        path.resolve("gestia-core/gestia-core.js"),
        "utf8"
    );
    const composerImport = core.slice(
        core.indexOf("composeEvidenceGroundedConversation") - 20,
        core.indexOf("composeEvidenceGroundedConversation") + 400
    );

    assert.match(composerImport, /mergeEvidenceGroundedToolCalls/);
    assert.match(
        core,
        /mergeEvidenceGroundedToolCalls\(\s*missionContractToolCalls,\s*operationalInitialToolCalls/
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

test("capability briefing exposes useful domains and real limitations", () => {
    const briefing = JSON.parse(
        buildCapabilityEvidenceBriefing([
            {
                name: "system.capabilities",
                observation: {
                    evidence: capabilityEvidence
                }
            },
            {
                name: "system.forensics",
                observation: {
                    evidence: limitationEvidence
                }
            }
        ])
    );

    assert.ok(
        briefing.capabilityDomains.some(item =>
            item.domain === "document" &&
            item.tools.includes("document.compose")
        )
    );
    assert.ok(
        briefing.capabilityDomains.some(item =>
            item.domain === "repo" &&
            item.tools.includes("repo.read")
        )
    );
    assert.match(briefing.limitations.join(" "), /permisos/);
});

test("Terminal hides technical evidence names for grounded conversation", () => {
    const terminal = fs.readFileSync(
        path.resolve("gestia-terminal.html"),
        "utf8"
    );

    assert.match(
        terminal,
        /finalResponse\?\.source !== "EVIDENCE_GROUNDED_CONVERSATION"/
    );
});

test("Terminal preserves complete capability JSON for explicit structured requests", () => {
    const terminal = fs.readFileSync(
        path.resolve("gestia-terminal.html"),
        "utf8"
    );

    assert.match(
        terminal,
        /if \(toolName === "system\.capabilities"\) \{[\s\S]*?totalTools: repoData\?\.totalTools \?\? null,[\s\S]*?groups: repoData\?\.groups \|\| \{\}[\s\S]*?\}, null, 2\);/
    );
    assert.doesNotMatch(
        terminal,
        /toolName === "system\.capabilities"[\s\S]{0,160}JSON\.stringify\(repoData, null, 2\)\.slice/
    );
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

test("oversized mission media evidence promotes validSources into grounded sources", () => {
    const marker =
        "PEN\u00CDNSULA TECH | CUD A202607241641376254 | VIGENCIA 180 D\u00CDAS";

    const evidence =
        buildBoundedConversationEvidence([{
            name:
                "media.analyze",
            observation: {
                ok:
                    true,
                status:
                    "MEDIA_ANALYSIS_GROUNDED",
                version:
                    "1.3.0-provider-json-schema",
                expectedSources:
                    1,
                receivedSources:
                    1,
                validSources: [{
                    sourceId:
                        "SOURCE_1",
                    fileName:
                        "A202607241641376254.pdf",
                    mimeType:
                        "application/pdf",
                    description:
                        marker,
                    observations:
                        Array.from(
                            {
                                length: 30
                            },
                            (_, index) =>
                                `${index + 1}: ${marker} ${"EVIDENCIA_DOCUMENTAL ".repeat(120)}`
                        ),
                    pages: [{
                        page:
                            1,
                        summary:
                            marker,
                        evidence: [
                            marker
                        ]
                    }]
                }]
            }
        }]);

    const parsed =
        JSON.parse(evidence);
    const observation =
        parsed[0].observation;

    assert.ok(
        evidence.length <= 24000
    );
    assert.equal(
        Array.isArray(
            observation.sources
        ),
        true
    );
    assert.equal(
        observation.sources[0]
            .fileName,
        "A202607241641376254.pdf"
    );
    assert.equal(
        observation.sources[0]
            .pages[0].page,
        1
    );
    assert.match(
        evidence,
        /PEN\u00CDNSULA TECH/u
    );
    assert.match(
        evidence,
        /A202607241641376254/
    );
    assert.match(
        evidence,
        /"pages"/
    );
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
