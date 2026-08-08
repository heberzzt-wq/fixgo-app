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



test("precision renderer keeps verified literals scoped to their own source and suppresses transcript content", async () => {
    const transcript = "He analizado visualmente las dos imágenes proporcionadas, describiendo su contenido y las diferencias entre ellas. Se ha identificado que la terminal no muestra una interfaz de adjuntos de archivos.";
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara solamente controles visibles y no uses el historial como evidencia funcional.",
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
                        visibleData: [{
                            kind: "text",
                            value: "ChatGPT Plus",
                            page: 1,
                            confidence: 0.99,
                            evidence: "Etiqueta visible.",
                            legibility: "VERIFIED"
                        }],
                        uncertainty: []
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "two.png",
                        sha256: "2".repeat(64),
                        observations: [
                            `A text block within the application states: '${transcript}'`,
                            "The application is ChatGPT Plus.",
                            "Se observa un panel lateral junto al contenido principal."
                        ],
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
    assert.match(result.text, /menu abierto con varias filas/i);
    assert.match(result.text, /panel lateral junto al contenido principal/i);
    assert.doesNotMatch(result.text, /He analizado|text block within|The application is ChatGPT Plus/);
});



test("production mission envelope prefers intact validSources over compact nested evidence", async () => {
    const intactSources = [
        {
            sourceId: "SOURCE_1",
            fileName: "chat-gpt-aduntos-1.png",
            sha256: "a".repeat(64),
            description: "",
            observations: [],
            inferences: [],
            visibleData: [{
                kind: "text",
                value: "ChatGPT Plus",
                page: 1,
                confidence: 1,
                evidence: "Text at the top left of the main panel.",
                legibility: "VERIFIED"
            }],
            uncertainty: []
        },
        {
            sourceId: "SOURCE_2",
            fileName: "terminal-adjunto-1.png",
            sha256: "b".repeat(64),
            description: "",
            observations: [],
            inferences: [],
            visibleData: [{
                kind: "text",
                value: "Terminal Heberto",
                page: 1,
                confidence: 1,
                evidence: "Text at the top left of the main panel.",
                legibility: "VERIFIED"
            }],
            uncertainty: []
        }
    ];

    let semanticCalls = 0;
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara solamente lo visible.",
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
    assert.match(result.text, /ChatGPT Plus/);
    assert.match(result.text, /Terminal Heberto/);
    assert.doesNotMatch(result.text, /ninguna con confianza suficiente/);
});


test("precision renderer rejects an unverified uppercase UI label even beside a grounded label", async () => {
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
                        fileName: "one.png",
                        sha256: "c".repeat(64),
                        visibleData: [],
                        uncertainty: []
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "two.png",
                        sha256: "d".repeat(64),
                        visibleData: [{
                            kind: "text",
                            value: "Terminal Heberto",
                            page: 1,
                            confidence: 1,
                            evidence: "Encabezado visible.",
                            legibility: "VERIFIED"
                        }],
                        uncertainty: []
                    }
                ],
                comparison: {
                    differences: [
                        "SOURCE_2 shows 'Terminal Heberto' (NEXO)."
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
        }],
        executeConversation: async () => {
            throw new Error("semantic composer must not run");
        }
    });

    assert.equal(result.ok, true);
    assert.match(result.text, /Terminal Heberto/);
    assert.doesNotMatch(result.text, /NEXO/);
    assert.match(result.text, /se omitieron comparaciones con etiquetas literales/i);
});

test("precision renderer suppresses unsupported negative visual absence claims", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara solamente lo visible.",
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
                        sha256: "a".repeat(64),
                        visibleData: [
                            { kind: "text", value: "ChatGPT Plus", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" },
                            { kind: "text", value: "Canva", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" }
                        ],
                        uncertainty: []
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "two.png",
                        sha256: "b".repeat(64),
                        visibleData: [
                            { kind: "text", value: "Terminal Heberto", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" },
                            { kind: "text", value: "Limitaciones reales:", page: 1, confidence: 1, evidence: "section", legibility: "VERIFIED" }
                        ],
                        uncertainty: []
                    }
                ],
                comparison: {
                    differences: [
                        "The primary application title differs: 'ChatGPT Plus' in SOURCE_1 versus 'Terminal Heberto' in SOURCE_2.",
                        "SOURCE_1 shows 'Canva', which is absent in SOURCE_2.",
                        "SOURCE_2 includes 'Limitaciones reales:', which is not present in SOURCE_1."
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
        }],
        executeConversation: async () => {
            throw new Error("semantic composer must not run");
        }
    });

    assert.equal(result.ok, true);
    assert.match(result.text, /ChatGPT Plus/);
    assert.match(result.text, /Terminal Heberto/);
    assert.match(result.text, /primary application title differs/i);
    assert.doesNotMatch(result.text, /absent in SOURCE_2|not present in SOURCE_1/i);
});


test("precision renderer suppresses source-local contradiction residue from production A2", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara los menus de adjuntos visibles.",
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
                        fileName: "chat-gpt-aduntos-1.png",
                        sha256: "a".repeat(64),
                        observations: ["An attachment menu is actively open and expanded, revealing multiple options."],
                        visibleData: [
                            { kind: "text", value: "Añadir fotos y archivos", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
                            { kind: "text", value: "Canva", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" }
                        ],
                        uncertainty: []
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "terminal-adjunto-1.png",
                        sha256: "b".repeat(64),
                        observations: [
                            "An attachment-like menu is open, displaying options: 'Añadir fotos y archivos', 'Crear una imagen', and 'Búsqueda en Internet'.",
                            "This statement directly contradicts the visible attachment menu in the same image."
                        ],
                        visibleData: [
                            { kind: "text", value: "Añadir fotos y archivos", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
                            { kind: "text", value: "Crear una imagen", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
                            { kind: "text", value: "Búsqueda en Internet", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" }
                        ],
                        uncertainty: [
                            "The contradiction between the visible attachment menu and the text stating its absence is a notable inconsistency."
                        ]
                    }
                ],
                comparison: { differences: [], confidence: 1 },
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
        }],
        executeConversation: async () => {
            throw new Error("semantic composer must not run");
        }
    });

    assert.equal(result.ok, true);
    assert.match(result.text, /attachment-like menu is open/i);
    assert.match(result.text, /Crear una imagen/);
    assert.doesNotMatch(result.text, /directly contradicts|text stating its absence|notable inconsistency/i);
});

test("precision renderer hides unrequested recommendations when strict visual policy says so", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara solamente lo visible.",
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
                        sha256: "a".repeat(64),
                        visibleData: [{ kind: "text", value: "ChatGPT Plus", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" }],
                        uncertainty: []
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "two.png",
                        sha256: "b".repeat(64),
                        visibleData: [{ kind: "text", value: "Terminal Heberto", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" }],
                        uncertainty: []
                    }
                ],
                comparison: { differences: [] },
                recommendations: [
                    "If the goal is to compare attachment functionalities, a detailed feature matrix could be created.",
                    "Ensure its attachment capabilities meet the specific needs of its users."
                ],
                policy: {
                    strictVisualUnrequestedRecommendationsSuppressed: true
                },
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
    assert.doesNotMatch(result.text, /feature matrix|attachment capabilities|Mejoras sugeridas/i);
    assert.match(result.text, /ChatGPT Plus/);
    assert.match(result.text, /Terminal Heberto/);
});
