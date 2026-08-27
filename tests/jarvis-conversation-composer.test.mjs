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

test("explicit JSON output is accepted only from structured semantic plan metadata", () => {
    const toolCalls = [{
        name: "system.capabilities",
        args: {}
    }];
    toolCalls.responseFormat = "json";
    const prepared = prepareEvidenceGroundedConversationPlan({
        instruction: "Devuélveme las herramientas disponibles.",
        toolCalls,
        toolCatalog: [
            { name: "system.capabilities" },
            { name: "system.forensics" }
        ]
    });

    assert.equal(isExplicitJsonResponseRequest(toolCalls), true);
    assert.deepEqual(
        prepared.operationalCalls.map(call => call.name),
        ["system.capabilities"]
    );
    assert.equal(prepared.requiresFinalConversation, false);
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
        /finalResponse\?\.source === "EVIDENCE_GROUNDED_CONVERSATION"\s*\?\s*\[\]/
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

test("video evidence distinguishes physical delivery from unverified facial fidelity", async () => {
    let capturedPrompt = "";
    const result = await composeEvidenceGroundedConversation({
        instruction: "Usa mis fotos y crea el capitulo.",
        evidenceItems: [{
            name: "mission.outcome",
            observation: {
                ok: false,
                executionOk: true,
                objectiveSatisfied: false,
                status: "PARTIAL",
                reason: "DEADLINE_EXCEEDED",
                blocked: false,
                verifiedArtifactDelivery: true
            }
        }, {
            name: "video.generate",
            observation: {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "VIDEO_GENERATED_VERIFIED",
                physicalArtifactVerified: true,
                verifiedArtifactDelivery: true,
                referenceImageCount: 3,
                referenceArtifactsVerified: true,
                identityFidelityVerified: false,
                creativeAcceptanceRequired: true,
                creativeAcceptanceStatus: "PENDING_HUMAN_REVIEW",
                durationSeconds: 29,
                requestedSceneCount: 4,
                generatedSceneCount: 4
            }
        }],
        executeConversation: async prompt => {
            capturedPrompt = prompt;
            return {
                ok: true,
                message: "El MP4 fue entregado; la fidelidad facial sigue pendiente de revisión humana."
            };
        }
    });

    assert.equal(result.ok, true);
    assert.match(capturedPrompt, /identityFidelityVerified/);
    assert.match(capturedPrompt, /PENDING_HUMAN_REVIEW/);
    assert.match(capturedPrompt, /no afirmes fidelidad facial/i);
    assert.match(capturedPrompt, /estado canonico de la mision es PARTIAL/i);
    assert.match(capturedPrompt, /no declares la mision completada/i);
});

test("precision-audited media is composed once by the single semantic brain", async () => {
    let semanticCalls = 0;
    let capturedPrompt = "";
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara las dos capturas y dime diferencias reales.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 2,
                receivedSources: 2,
                sources: [{
                    sourceId: "SOURCE_1",
                    fileName: "chat.png",
                    sha256: "a".repeat(64),
                    observations: ["Hay una interfaz de conversación con un encabezado visible."],
                    visibleData: [{
                        kind: "text",
                        value: "ChatGPT Plus",
                        page: 1,
                        confidence: 1,
                        evidence: "Encabezado visible.",
                        legibility: "VERIFIED"
                    }],
                    uncertainty: ["No se puede asegurar el contenido que queda fuera del encuadre."]
                }, {
                    sourceId: "SOURCE_2",
                    fileName: "terminal.png",
                    sha256: "b".repeat(64),
                    observations: ["Hay una interfaz de terminal con un encabezado visible."],
                    visibleData: [{
                        kind: "text",
                        value: "Terminal Heberto",
                        page: 1,
                        confidence: 1,
                        evidence: "Encabezado visible.",
                        legibility: "VERIFIED"
                    }],
                    uncertainty: []
                }],
                comparison: {
                    differences: [
                        "Los encabezados visibles son distintos."
                    ]
                },
                recommendations: [],
                precisionAudit: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                    effectiveToolExecutions: 1,
                    sourceIdentityVerified: true,
                    exactTextRequiresConfidence: 0.98
                }
            }
        }],
        executeConversation: async prompt => {
            semanticCalls += 1;
            capturedPrompt = prompt;
            return {
                ok: true,
                data: {
                    message: [
                        "Revisé las dos capturas.",
                        "En la primera se verifica el encabezado ChatGPT Plus y en la segunda Terminal Heberto.",
                        "La diferencia confirmada es que los encabezados visibles son distintos.",
                        "No puedo asegurar lo que queda fuera del encuadre de la primera captura."
                    ].join(" ")
                }
            };
        }
    });

    assert.equal(semanticCalls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.status, "CONVERSATIONAL_COMPOSITION_COMPLETED");
    assert.match(result.text, /ChatGPT Plus/);
    assert.match(result.text, /Terminal Heberto/);
    assert.match(result.text, /encabezados visibles son distintos/i);
    assert.match(result.text, /fuera del encuadre/i);
    assert.match(capturedPrompt, /única autoridad que compone la respuesta final/i);
    assert.match(capturedPrompt, /visibleData/);
    assert.match(capturedPrompt, /VERIFIED/);
    assert.doesNotMatch(result.text, /SOURCE_1|sha256|precisionAudit/);
});


test("precision media final rejects raw JSON from the semantic brain", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: "Analiza la captura.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 1,
                receivedSources: 1,
                sources: [{
                    sourceId: "SOURCE_1",
                    fileName: "terminal.png",
                    sha256: "c".repeat(64),
                    visibleData: [{
                        kind: "text",
                        value: "Motor No-Code",
                        confidence: 1,
                        evidence: "Subtítulo visible.",
                        legibility: "VERIFIED"
                    }]
                }],
                precisionAudit: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                    effectiveToolExecutions: 1,
                    sourceIdentityVerified: true,
                    exactTextRequiresConfidence: 0.98
                }
            }
        }],
        executeConversation: async () => ({
            ok: true,
            data: { message: '{"raw":"tool-payload"}' }
        })
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "RAW_TOOL_PAYLOAD_REJECTED");
});


test("mixed media and health evidence share the same semantic final composer", async () => {
    let semanticCalls = 0;
    const result = await composeEvidenceGroundedConversation({
        instruction: "Analiza la imagen y revisa también el estado del sistema.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 1,
                receivedSources: 1,
                sources: [{
                    sourceId: "SOURCE_1",
                    fileName: "captura.png",
                    sha256: "d".repeat(64)
                }],
                precisionAudit: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                    effectiveToolExecutions: 1,
                    sourceIdentityVerified: true
                }
            }
        }, {
            name: "system.health",
            observation: { ok: true, status: "HEALTHY" }
        }],
        executeConversation: async () => {
            semanticCalls += 1;
            return {
                ok: true,
                data: {
                    message: "La imagen fue analizada y el sistema está saludable."
                }
            };
        }
    });

    assert.equal(semanticCalls, 1);
    assert.equal(result.status, "CONVERSATIONAL_COMPOSITION_COMPLETED");
    assert.match(result.text, /sistema está saludable/i);
});


test("precision mission envelope preserves intact validSources for the semantic brain", async () => {
    const intactSources = [{
        sourceId: "SOURCE_1",
        fileName: "one.png",
        sha256: "e".repeat(64),
        visibleData: [{
            kind: "text",
            value: "ChatGPT Plus",
            confidence: 1,
            evidence: "header",
            legibility: "VERIFIED"
        }]
    }, {
        sourceId: "SOURCE_2",
        fileName: "two.png",
        sha256: "f".repeat(64),
        visibleData: [{
            kind: "text",
            value: "Terminal Heberto",
            confidence: 1,
            evidence: "header",
            legibility: "VERIFIED"
        }]
    }];
    let capturedPrompt = "";
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara ambas capturas.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                sourceCount: 2,
                validSources: intactSources,
                evidence: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_GROUNDED",
                    version: "1.4.0-verified-visual-claims",
                    expectedSources: 2,
                    receivedSources: 2,
                    sources: intactSources.map(source => ({
                        ...source,
                        visibleData: []
                    })),
                    precisionAudit: {
                        ok: true,
                        status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                        effectiveToolExecutions: 1,
                        sourceIdentityVerified: true,
                        exactTextRequiresConfidence: 0.98
                    }
                }
            }
        }],
        executeConversation: async prompt => {
            capturedPrompt = prompt;
            return {
                ok: true,
                data: {
                    message: "Se verifican ChatGPT Plus y Terminal Heberto en las capturas respectivas."
                }
            };
        }
    });

    assert.equal(result.ok, true);
    assert.match(capturedPrompt, /ChatGPT Plus/);
    assert.match(capturedPrompt, /Terminal Heberto/);
    assert.match(result.text, /ChatGPT Plus/);
    assert.match(result.text, /Terminal Heberto/);
});


test("conversation composer contains no local lexical intent or narrative regex brain", () => {
    const source = fs.readFileSync(
        path.join(process.cwd(), "gestia-core/jarvis/jarvis.conversation.composer.js"),
        "utf8"
    );
    assert.doesNotMatch(source, /new RegExp|\.match\(|\.matchAll\(|\.exec\(|\.test\(/);
    assert.doesNotMatch(source, /RENDER_|STOPWORDS|ACTION_MAP|ENTITY_MAP/);
    assert.match(source, /precisionGroundingInstruction/);
});


test("terminal exposes live operational work trace without raw telemetry", () => {
    const terminalSource = fs.readFileSync(
        path.join(process.cwd(), "gestia-terminal.html"),
        "utf8"
    );
    const runtimeSource = fs.readFileSync(
        path.join(process.cwd(), "gestia-core/tools.runtime.js"),
        "utf8"
    );

    assert.match(terminalSource, /ADJUNTO LIVE WORK TRACE V94/);
    assert.match(
        terminalSource,
        /wrapper\.dataset\.testid\s*=\s*"jarvis-work-trace"/
    );
    assert.match(terminalSource, /jarvis:work-progress/);
    assert.match(terminalSource, /Analizando imágenes y archivos/);
    assert.match(terminalSource, /Entendiendo qué necesita la misión/);
    assert.match(terminalSource, /Preparando la respuesta final/);
    assert.match(terminalSource, /Trabajo completado/);

    const progressStart = terminalSource.indexOf("ADJUNTO LIVE WORK TRACE V94");
    const progressEnd = terminalSource.indexOf(
        "function isTerminalBrainRuntimeReady",
        progressStart
    );
    assert.ok(progressStart >= 0 && progressEnd > progressStart);
    const progressBlock = terminalSource.slice(progressStart, progressEnd);
    assert.doesNotMatch(progressBlock, /JSON\.stringify|args:|result:|prompt:/);

    assert.match(runtimeSource, /function emitJarvisWorkProgress/);
    assert.match(runtimeSource, /state: "started"/);
    assert.match(runtimeSource, /state: "completed"/);
    assert.match(runtimeSource, /state: "failed"/);
    assert.doesNotMatch(
        runtimeSource.slice(
            runtimeSource.indexOf("function emitJarvisWorkProgress"),
            runtimeSource.indexOf("export const JarvisToolRuntime")
        ),
        /args|result|prompt|reasoning/
    );
});


test("terminal hides grounded multimodal telemetry from the human chat surface", () => {
    const terminalSource = fs.readFileSync(
        path.join(process.cwd(), "gestia-terminal.html"),
        "utf8"
    );
    const start = terminalSource.indexOf("const multiToolSummarySource =");
    const end = terminalSource.indexOf("const multiToolSummary =", start);
    assert.ok(start >= 0 && end > start);
    const summaryBlock = terminalSource.slice(start, end);

    assert.match(
        summaryBlock,
        /finalResponse\?\.source === "EVIDENCE_GROUNDED_CONVERSATION"\s*\?\s*\[\]/
    );
    assert.match(
        terminalSource,
        /finalResponse\?\.source === "EVIDENCE_GROUNDED_CONVERSATION"\s*\?\s*"Jarvis"/
    );
});
