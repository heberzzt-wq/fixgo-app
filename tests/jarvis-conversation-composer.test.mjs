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

test("precision-audited media response preserves verified literals without semantic rewriting", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction:
            "Analiza comparativamente estas dos capturas sin inventar texto.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 2,
                receivedSources: 2,
                sources: [
                    {
                        sourceId: "SOURCE_1",
                        fileName: "terminal-nueva.png",
                        sha256: "1".repeat(64),
                        objects: [
                            "Una terminal web con campo para instrucciones."
                        ],
                        visibleData: [
                            {
                                kind: "text",
                                value: "Motor No-Code",
                                page: 1,
                                confidence: 0.99,
                                evidence: "Subtitulo bajo Terminal Heberto.",
                                legibility: "VERIFIED"
                            },
                            {
                                kind: "url",
                                value: "fixgo-44d",
                                page: 1,
                                confidence: 0.7,
                                evidence: "Barra de direcciones parcialmente legible.",
                                legibility: "UNCERTAIN"
                            }
                        ],
                        uncertainty: [
                            "La URL completa y el ano no se distinguen con certeza."
                        ]
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "menu-chat-nuevo.png",
                        sha256: "2".repeat(64),
                        objects: [
                            "Un menu de adjuntos con varias acciones visibles."
                        ],
                        visibleData: [],
                        uncertainty: [
                            "No se transcriben detalles pequenos del menu."
                        ]
                    }
                ],
                comparison: {
                    differences: [
                        "La segunda captura presenta un menu de acciones; la primera muestra el campo principal de la Terminal."
                    ]
                },
                recommendations: [
                    "Mostrar acciones de adjuntos agrupadas junto al boton +."
                ],
                precisionAudit: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                    providerPasses: 2,
                    effectiveToolExecutions: 1,
                    sourceIdentityVerified: true,
                    exactTextRequiresConfidence: 0.98
                }
            }
        }],
        executeConversation: async () => {
            throw new Error("semantic composer must not run");
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "MEDIA_ANALYSIS_RESPONSE_VERIFIED");
    assert.equal(result.provider, "deterministic-grounded-media");
    assert.match(result.text, /terminal-nueva\.png/);
    assert.match(result.text, /menu-chat-nuevo\.png/);
    assert.match(result.text, /Motor No-Code/);
    assert.match(result.text, /URL completa y el ano no se distinguen/);
    assert.match(result.text, /una sola ejecucion efectiva de media\.analyze/);
    assert.doesNotMatch(result.text, /Motion No-Code|fixgo-44d|2028/);
    assert.doesNotMatch(result.text, /SOURCE_1|sha256|precisionAudit/);
});

test("mixed media evidence still uses the semantic composer for the complete objective", async () => {
    let calls = 0;
    const result = await composeEvidenceGroundedConversation({
        instruction: "Analiza la imagen y revisa tambien el estado del sistema.",
        evidenceItems: [
            {
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
                        sha256: "a".repeat(64)
                    }],
                    precisionAudit: {
                        ok: true,
                        status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                        effectiveToolExecutions: 1,
                        sourceIdentityVerified: true
                    }
                }
            },
            {
                name: "system.health",
                observation: {
                    ok: true,
                    status: "HEALTHY"
                }
            }
        ],
        executeConversation: async () => {
            calls += 1;
            return {
                ok: true,
                data: {
                    message:
                        "La imagen fue analizada y el sistema esta saludable."
                }
            };
        }
    });

    assert.equal(calls, 1);
    assert.equal(result.status, "CONVERSATIONAL_COMPOSITION_COMPLETED");
});

test("precision-audited media survives the real mission observation envelope", async () => {
    const sources = [
        {
            sourceId: "SOURCE_1",
            fileName: "terminal-envuelta.png",
            sha256: "c".repeat(64),
            objects: ["Una terminal web."],
            visibleData: [{
                kind: "text",
                value: "Motor No-Code",
                page: 1,
                confidence: 0.99,
                evidence: "Encabezado visible.",
                legibility: "VERIFIED"
            }],
            uncertainty: ["La URL completa no es legible."]
        },
        {
            sourceId: "SOURCE_2",
            fileName: "menu-envuelto.png",
            sha256: "d".repeat(64),
            objects: ["Un menu de acciones."],
            visibleData: [],
            uncertainty: []
        }
    ];
    let semanticCalls = 0;
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara las dos capturas.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                sourceCount: 2,
                validSources: sources,
                evidence: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_GROUNDED",
                    version: "1.4.0-verified-visual-claims",
                    expectedSources: 2,
                    receivedSources: 2,
                    sources,
                    precisionAudit: {
                        ok: true,
                        status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                        providerPasses: 2,
                        effectiveToolExecutions: 1,
                        sourceIdentityVerified: true,
                        exactTextRequiresConfidence: 0.98
                    }
                }
            }
        }],
        executeConversation: async () => {
            semanticCalls += 1;
            return { ok: true, data: { message: "No debe ejecutarse." } };
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "MEDIA_ANALYSIS_RESPONSE_VERIFIED");
    assert.equal(semanticCalls, 0);
    assert.match(result.text, /terminal-envuelta\.png/);
    assert.match(result.text, /menu-envuelto\.png/);
    assert.match(result.text, /Motor No-Code/);
    assert.doesNotMatch(result.text, /Motion No-Code|2028/);
});


test("system certification companion cannot force semantic rewriting of verified media", async () => {
    let semanticCalls = 0;
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara estas dos capturas sin inventar texto.",
        evidenceItems: [
            {
                name: "media.analyze",
                observation: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_GROUNDED",
                    version: "1.4.0-verified-visual-claims",
                    expectedSources: 2,
                    receivedSources: 2,
                    sources: [
                        {
                            sourceId: "SOURCE_1",
                            fileName: "chatgpt.png",
                            sha256: "1".repeat(64),
                            objects: ["Una interfaz web."],
                            visibleData: [],
                            uncertainty: ["El menu de adjuntos no esta abierto en esta captura."]
                        },
                        {
                            sourceId: "SOURCE_2",
                            fileName: "terminal.png",
                            sha256: "2".repeat(64),
                            objects: ["Una terminal web."],
                            visibleData: [{
                                kind: "text",
                                value: "NEXO listo",
                                page: 1,
                                confidence: 0.99,
                                evidence: "Tarjeta central visible.",
                                legibility: "VERIFIED"
                            }],
                            uncertainty: []
                        }
                    ],
                    comparison: {
                        differences: [
                            "No se puede verificar el menu de adjuntos de ChatGPT porque no esta abierto en SOURCE_1."
                        ]
                    },
                    recommendations: [],
                    precisionAudit: {
                        ok: true,
                        status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                        providerPasses: 2,
                        effectiveToolExecutions: 1,
                        sourceIdentityVerified: true,
                        exactTextRequiresConfidence: 0.98
                    }
                }
            },
            {
                name: "system.certify",
                observation: {
                    ok: true,
                    status: "CERTIFICATION_INCOMPLETE",
                    certified: false
                }
            }
        ],
        executeConversation: async () => {
            semanticCalls += 1;
            return {
                ok: true,
                data: {
                    message: "La fecha mostrada es 07/08/2023."
                }
            };
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "MEDIA_ANALYSIS_RESPONSE_VERIFIED");
    assert.equal(result.provider, "deterministic-grounded-media");
    assert.equal(semanticCalls, 0);
    assert.match(result.text, /NEXO listo/);
    assert.doesNotMatch(result.text, /07\/08\/2023|2023/);
});



test("precision renderer suppresses ungrounded standalone UI labels from provider comparison", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara dos capturas sin inventar etiquetas.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 2,
                receivedSources: 2,
                sources: [
                    {
                        sourceId: "SOURCE_1",
                        fileName: "chat.png",
                        sha256: "a".repeat(64),
                        objects: [],
                        visibleData: [],
                        uncertainty: []
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "terminal.png",
                        sha256: "b".repeat(64),
                        objects: [],
                        visibleData: [],
                        uncertainty: []
                    }
                ],
                comparison: {
                    differences: [
                        "The first menu includes Canva, Gmail, GitHub and Google Drive while Terminal Heberto has fewer options."
                    ]
                },
                recommendations: [
                    "Add Canva and Gmail integrations to Terminal Heberto."
                ],
                precisionAudit: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                    effectiveToolExecutions: 1,
                    sourceIdentityVerified: true,
                    exactTextRequiresConfidence: 0.98
                }
            }
        }],
        executeConversation: async () => {
            throw new Error("semantic composer must not run");
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "MEDIA_ANALYSIS_RESPONSE_VERIFIED");
    assert.doesNotMatch(
        result.text,
        /Canva|Gmail|GitHub|Google Drive|Terminal Heberto/
    );
    assert.match(
        result.text,
        /se omitieron comparaciones con etiquetas literales/i
    );
    assert.match(
        result.text,
        /no se muestran propuestas/i
    );
});


test("precision renderer keeps UI labels when final visibleData verifies them", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara dos capturas.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 2,
                receivedSources: 2,
                sources: [
                    {
                        sourceId: "SOURCE_1",
                        fileName: "chat.png",
                        sha256: "c".repeat(64),
                        objects: [],
                        visibleData: [{
                            kind: "text",
                            value: "ChatGPT Plus",
                            page: 1,
                            confidence: 0.99,
                            evidence: "Etiqueta superior visible.",
                            legibility: "VERIFIED"
                        }],
                        uncertainty: []
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "terminal.png",
                        sha256: "d".repeat(64),
                        objects: [],
                        visibleData: [{
                            kind: "text",
                            value: "Terminal Heberto",
                            page: 1,
                            confidence: 0.99,
                            evidence: "Encabezado visible.",
                            legibility: "VERIFIED"
                        }],
                        uncertainty: []
                    }
                ],
                comparison: {
                    differences: [
                        "ChatGPT Plus y Terminal Heberto muestran encabezados distintos."
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
        executeConversation: async () => {
            throw new Error("semantic composer must not run");
        }
    });

    assert.equal(result.ok, true);
    assert.match(result.text, /ChatGPT Plus/);
    assert.match(result.text, /Terminal Heberto/);
    assert.match(result.text, /encabezados distintos/);
});



test("precision renderer removes capture-context claims and speculative recommendations with no verified literals", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara las dos capturas.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 2,
                receivedSources: 2,
                sources: [
                    {
                        sourceId: "SOURCE_1",
                        fileName: "one.png",
                        sha256: "1".repeat(64),
                        visibleData: [],
                        uncertainty: []
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "two.png",
                        sha256: "2".repeat(64),
                        visibleData: [],
                        uncertainty: []
                    }
                ],
                comparison: {
                    differences: [
                        "Source 2 contains a code-like output on the right side, which is absent in Source 1.",
                        "Both images show the same date and time in the system tray, suggesting they were captured around the same time."
                    ]
                },
                recommendations: [
                    "Ensure consistency in UI/UX if these two interfaces are part of a larger ecosystem or user workflow."
                ],
                precisionAudit: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                    providerPasses: 2,
                    effectiveToolExecutions: 1,
                    sourceIdentityVerified: true,
                    exactTextRequiresConfidence: 0.98
                }
            }
        }],
        executeConversation: async () => {
            throw new Error("semantic composer must not run");
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "MEDIA_ANALYSIS_RESPONSE_VERIFIED");
    assert.match(result.text, /code-like output/);
    assert.doesNotMatch(result.text, /same date|same time|system tray|ecosystem|workflow/i);
});



test("precision renderer shows safe nonliteral visual observations when text labels remain unverified", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara solamente lo verificable visualmente.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 2,
                receivedSources: 2,
                sources: [
                    {
                        sourceId: "SOURCE_1",
                        fileName: "one.png",
                        sha256: "1".repeat(64),
                        observations: ["Se observa un menu abierto con varias filas."],
                        objects: [],
                        visibleData: [],
                        uncertainty: []
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "two.png",
                        sha256: "2".repeat(64),
                        observations: ["Se observa un panel lateral junto al contenido principal."],
                        objects: [],
                        visibleData: [],
                        uncertainty: []
                    }
                ],
                comparison: {
                    differences: ["La segunda fuente muestra un panel lateral que no aparece en la primera."],
                    confidence: 0.99
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
        executeConversation: async () => {
            throw new Error("semantic composer must not run");
        }
    });

    assert.equal(result.ok, true);
    assert.match(result.text, /Observaciones visuales verificadas:/);
    assert.match(result.text, /menu abierto con varias filas/i);
    assert.match(result.text, /panel lateral junto al contenido principal/i);
    assert.match(result.text, /segunda fuente muestra un panel lateral/i);
});
