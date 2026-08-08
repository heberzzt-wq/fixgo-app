from pathlib import Path

planner_path = Path('gestia-core/jarvis/jarvis.multifunction.planner.js')
test_path = Path('tests/jarvis-multifunction-tools.test.mjs')

planner = planner_path.read_text(encoding='utf-8')
tests = test_path.read_text(encoding='utf-8')

old_version = 'const VERSION = "4.14.0-identity-fidelity";'
new_version = 'const VERSION = "4.15.0-attachment-analysis-route";'
if old_version not in planner:
    raise SystemExit('planner version anchor not found')
planner = planner.replace(old_version, new_version, 1)

anchor = '''function requestsAttachmentAnalysis(\n    instruction = ""\n) {\n    const text =\n        normalizeRoutingText(\n            instructionBeforeAttachmentManifest(\n                instruction\n            )\n        );\n\n    const signals = [\n        "analiza",\n        "analice",\n        "describe",\n        "describeme",\n        "compara",\n        "identifica",\n        "extrae",\n        "lee la imagen",\n        "lee la foto",\n        "revisa la imagen",\n        "revisa la foto",\n        "que ves",\n        "dime que hay",\n        "analyze",\n        "describe",\n        "compare",\n        "identify"\n    ];\n\n    return signals.some(signal =>\n        text.includes(\n            signal\n        )\n    );\n}\n\n\nfunction candidateArgumentObject('''

replacement = '''function requestsAttachmentAnalysis(\n    instruction = ""\n) {\n    const text =\n        normalizeRoutingText(\n            instructionBeforeAttachmentManifest(\n                instruction\n            )\n        );\n\n    const signals = [\n        "analiza",\n        "analice",\n        "describe",\n        "describeme",\n        "compara",\n        "identifica",\n        "extrae",\n        "lee la imagen",\n        "lee la foto",\n        "revisa la imagen",\n        "revisa la foto",\n        "que ves",\n        "dime que hay",\n        "analyze",\n        "describe",\n        "compare",\n        "identify"\n    ];\n\n    return signals.some(signal =>\n        text.includes(\n            signal\n        )\n    );\n}\n\nfunction requestsVisualArtifactCreation(\n    instruction = ""\n) {\n    let text =\n        normalizeRoutingText(\n            instructionBeforeAttachmentManifest(\n                instruction\n            )\n        );\n\n    const negativeSignals = [\n        "no generes imagen",\n        "no generes una imagen",\n        "no genera imagen",\n        "no crear imagen",\n        "no crees imagen",\n        "no crees una imagen",\n        "sin generar imagen",\n        "sin generar una imagen",\n        "sin crear imagen",\n        "sin crear una imagen",\n        "do not generate an image",\n        "do not create an image",\n        "without generating an image",\n        "without creating an image"\n    ];\n\n    for (const signal of negativeSignals) {\n        text = text.replaceAll(signal, "");\n    }\n\n    const positiveSignals = [\n        "genera una imagen",\n        "genera imagen",\n        "generame una imagen",\n        "crea una imagen",\n        "crea imagen",\n        "diseña una imagen",\n        "disena una imagen",\n        "produce una imagen",\n        "renderiza una imagen",\n        "edita esta imagen",\n        "edita la imagen",\n        "modifica esta imagen",\n        "modifica la imagen",\n        "transforma esta imagen",\n        "transforma la imagen",\n        "generate an image",\n        "create an image",\n        "edit this image",\n        "modify this image",\n        "transform this image"\n    ];\n\n    return positiveSignals.some(signal =>\n        text.includes(signal)\n    );\n}\n\nfunction requestsAdditionalDeliverableBeyondAttachmentAnalysis(\n    instruction = ""\n) {\n    const text =\n        normalizeRoutingText(\n            instructionBeforeAttachmentManifest(\n                instruction\n            )\n        );\n\n    if (requestsVisualArtifactCreation(instruction)) {\n        return true;\n    }\n\n    const creationVerb =\n        /\\b(crea|crear|creame|genera|generar|generame|produce|producir|diseña|disena|construye|haz|hacer|prepara|preparar|entrega|entregar|redacta|redactar|edita|editar|modifica|modificar|transforma|transformar|build|create|generate|produce|design|prepare|deliver|write|edit|modify|transform)\\b/;\n    const deliverableNoun =\n        /\\b(documento|document|pdf|docx|xlsx|hoja|spreadsheet|landing|pagina|page|reel|video|plan de marketing|marketing plan|campana|campaña|campaign|archivo|file|codigo|code|repositorio|repository)\\b/;\n\n    if (creationVerb.test(text) && deliverableNoun.test(text)) {\n        return true;\n    }\n\n    const externalResearch =\n        /\\b(investiga|investigar|busca|buscar|consulta|consultar|research|search)\\b[\\s\\S]{0,80}\\b(web|internet|fuentes|sources|sitios|sites|google)\\b/;\n\n    return externalResearch.test(text);\n}\n\nfunction normalizeAttachmentAnalysisRouteCandidates(\n    candidates = [],\n    catalog = [],\n    context = {}\n) {\n    const sourceCandidates =\n        Array.isArray(candidates)\n            ? candidates\n            : [];\n    const instruction =\n        String(\n            context?.originalInstruction ||\n            ""\n        );\n    const attachments =\n        extractGroundedAttachments(\n            instruction\n        );\n\n    const pureAttachmentAnalysis =\n        attachments.length > 0 &&\n        requestsAttachmentAnalysis(\n            instruction\n        ) &&\n        !requestsAdditionalDeliverableBeyondAttachmentAnalysis(\n            instruction\n        );\n\n    if (!pureAttachmentAnalysis) {\n        return sourceCandidates;\n    }\n\n    const mediaAvailable =\n        catalog.some(tool =>\n            tool?.name ===\n            "media.analyze"\n        );\n\n    if (!mediaAvailable) {\n        return [];\n    }\n\n    const existingMedia =\n        sourceCandidates.find(candidate =>\n            candidate?.name ===\n            "media.analyze"\n        );\n\n    return [{\n        ...(existingMedia || {}),\n        name:\n            "media.analyze",\n        args:\n            candidateArgumentObject(\n                existingMedia ||\n                {}\n            ),\n        reason:\n            existingMedia?.reason ||\n            "ATTACHMENT_ANALYSIS_ROUTE_ENFORCED"\n    }];\n}\n\n\nfunction candidateArgumentObject('''

if anchor not in planner:
    raise SystemExit('attachment analysis helper anchor not found')
planner = planner.replace(anchor, replacement, 1)

old_candidates = '''    const candidates =\n        normalizeGroundedImageReferenceCandidates(\n            Array.isArray(\n                plan?.toolCalls\n            )\n                ? plan.toolCalls\n                : [],\n            catalog,\n            context\n        );'''
new_candidates = '''    const candidates =\n        normalizeGroundedImageReferenceCandidates(\n            normalizeAttachmentAnalysisRouteCandidates(\n                Array.isArray(\n                    plan?.toolCalls\n                )\n                    ? plan.toolCalls\n                    : [],\n                catalog,\n                context\n            ),\n            catalog,\n            context\n        );'''
if old_candidates not in planner:
    raise SystemExit('trustedPlanCalls candidate anchor not found')
planner = planner.replace(old_candidates, new_candidates, 1)

old_contract_sentence = 'Para cada artefacto usa exactamente una composicion y una creacion salvo que el usuario pida variantes. Conserva el orden y usa missionComplete=false.'
new_contract_sentence = 'Para cada artefacto usa exactamente una composicion y una creacion salvo que el usuario pida variantes. Cuando existan archivos adjuntos reales y la instruccion pida analizarlos, describirlos, compararlos, identificarlos o leerlos, media.analyze es obligatoria y image.generate/image.edit no pueden sustituirla; usa herramientas de imagen sintetica solamente cuando el usuario pida explicitamente crear, generar, editar, modificar o transformar una imagen nueva o existente. Conserva el orden y usa missionComplete=false.'
if old_contract_sentence not in planner:
    raise SystemExit('mission contract prompt anchor not found')
planner = planner.replace(old_contract_sentence, new_contract_sentence, 1)

old_semantic_sentence = 'Si una persona, producto u objeto debe conservarse desde una imagen adjunta, selecciona image.edit y copia el artifact real del manifiesto en sourceOutput; no uses image.generate ni una descripcion de media.analyze como reemplazo de la fuente visual. Conserva todas las intenciones independientes y usa herramientas especializadas para entregables operativos.'
new_semantic_sentence = 'Si una persona, producto u objeto debe conservarse desde una imagen adjunta, selecciona image.edit y copia el artifact real del manifiesto en sourceOutput; no uses image.generate ni una descripcion de media.analyze como reemplazo de la fuente visual. Si hay adjuntos reales y la orden pide analizarlos, describirlos, compararlos, identificarlos o leerlos, selecciona media.analyze; nunca sustituyas ese objetivo por image.generate o image.edit salvo que la orden tambien pida explicitamente crear, generar, editar, modificar o transformar una imagen. Conserva todas las intenciones independientes y usa herramientas especializadas para entregables operativos.'
if old_semantic_sentence not in planner:
    raise SystemExit('semantic prompt anchor not found')
planner = planner.replace(old_semantic_sentence, new_semantic_sentence, 1)

old_test_export = '''    extractGroundedAttachments,\n    requestsGroundedVisualReference,\n    attachmentDateScore,'''
new_test_export = '''    extractGroundedAttachments,\n    requestsGroundedVisualReference,\n    requestsAttachmentAnalysis,\n    requestsVisualArtifactCreation,\n    requestsAdditionalDeliverableBeyondAttachmentAnalysis,\n    normalizeAttachmentAnalysisRouteCandidates,\n    attachmentDateScore,'''
if old_test_export not in planner:
    raise SystemExit('__test export anchor not found')
planner = planner.replace(old_test_export, new_test_export, 1)

planner_path.write_text(planner, encoding='utf-8')

insert_before = '''test("browser mission contract returns every model-selected high-level tool", async () => {'''
new_tests = r'''
test("pure attachment analysis deterministically rejects stale marketing, document and image generation routes", async () => {
    const manifest = JSON.stringify([
        {
            name: "source-a.png",
            mimeType: "image/png",
            artifact: ".jarvis-artifacts/uploads/source-a.png",
            sha256: "a".repeat(64)
        },
        {
            name: "source-b.png",
            mimeType: "image/png",
            artifact: ".jarvis-artifacts/uploads/source-b.png",
            sha256: "b".repeat(64)
        }
    ]);
    const instruction = [
        "CASE-MULTIMODAL-V94-PROD-CERT-A",
        "Analiza estas dos imágenes como fuentes independientes.",
        "Describe únicamente elementos visuales directamente verificables en cada archivo.",
        "Mantén SOURCE_1 y SOURCE_2 estrictamente separadas.",
        "Al final compara únicamente diferencias visuales demostrables entre ambas fuentes.",
        `Archivos adjuntos reales entregados por el usuario:${manifest}`
    ].join("\n");
    const catalog = [
        {
            name: "media.analyze",
            description: "Analiza adjuntos reales.",
            mutates: false,
            requiresApproval: false,
            missionDedupeBy: [],
            inputSchema: {
                mimeType: "string",
                sourceName: "string",
                pages: "array",
                attachments: "array",
                questions: "array"
            }
        },
        {
            name: "marketing.plan",
            description: "Construye marketing.",
            mutates: false,
            requiresApproval: false
        },
        {
            name: "document.create",
            description: "Crea un documento.",
            mutates: true,
            requiresApproval: false,
            userArtifact: true
        },
        {
            name: "image.generate",
            description: "Genera una imagen nueva.",
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            inputSchema: {
                type: "object",
                properties: {
                    prompt: { type: "string" }
                }
            }
        }
    ];

    const result = await buildJarvisMultifunctionToolCalls(
        instruction,
        {
            toolCatalog: catalog,
            semanticPlanner: async () => ({
                ok: true,
                status: "SEMANTIC_PLAN_READY",
                provider: "test-model",
                toolCalls: [
                    {
                        name: "marketing.plan",
                        args: {
                            brandName: "Peninsula Tech"
                        }
                    },
                    {
                        name: "document.create",
                        args: {
                            format: "pdf",
                            title: "Plan de marketing completo"
                        }
                    },
                    {
                        name: "image.generate",
                        args: {
                            prompt: "Crea una pieza visual profesional para Peninsula Tech."
                        }
                    }
                ]
            })
        }
    );

    assert.deepEqual(
        result.map(call => call.name),
        ["media.analyze"]
    );
    assert.equal(
        result[0].reason,
        "ATTACHMENT_ANALYSIS_ROUTE_ENFORCED"
    );
});

test("pure attachment analysis keeps only one existing media analysis call", () => {
    const manifest = JSON.stringify([
        {
            name: "source.png",
            mimeType: "image/png",
            artifact: ".jarvis-artifacts/uploads/source.png"
        }
    ]);
    const instruction = [
        "Compara y describe solamente esta imagen.",
        `Archivos adjuntos reales entregados por el usuario:${manifest}`
    ].join("\n");
    const catalog = [
        {
            name: "media.analyze",
            description: "Analiza adjuntos.",
            mutates: false,
            requiresApproval: false,
            missionDedupeBy: []
        },
        {
            name: "image.generate",
            description: "Genera imagen.",
            mutates: true,
            requiresApproval: false,
            userArtifact: true
        }
    ];
    const calls = plannerTest.trustedPlanCalls(
        {
            toolCalls: [
                {
                    name: "media.analyze",
                    args: {
                        questions: ["Compara"]
                    },
                    reason: "MODEL_SELECTED_MEDIA"
                },
                {
                    name: "image.generate",
                    args: {
                        prompt: "stale"
                    }
                }
            ]
        },
        catalog,
        {
            originalInstruction: instruction
        }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "media.analyze");
    assert.deepEqual(calls[0].args.questions, ["Compara"]);
    assert.equal(calls[0].reason, "MODEL_SELECTED_MEDIA");
});

test("mixed attachment analysis plus explicit image creation is not collapsed to media only", async () => {
    const manifest = JSON.stringify([
        {
            name: "source.png",
            mimeType: "image/png",
            artifact: ".jarvis-artifacts/uploads/source.png"
        }
    ]);
    const instruction = [
        "Analiza esta imagen y después crea una imagen nueva basada en sus colores.",
        `Archivos adjuntos reales entregados por el usuario:${manifest}`
    ].join("\n");
    const catalog = [
        {
            name: "media.analyze",
            mutates: false,
            requiresApproval: false,
            missionDedupeBy: []
        },
        {
            name: "image.generate",
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            inputSchema: {
                type: "object",
                required: ["prompt"],
                properties: {
                    prompt: { type: "string" }
                }
            }
        }
    ];

    const result = await buildJarvisMultifunctionToolCalls(
        instruction,
        {
            toolCatalog: catalog,
            semanticPlanner: async () => ({
                ok: true,
                status: "SEMANTIC_PLAN_READY",
                toolCalls: [
                    {
                        name: "media.analyze",
                        args: {}
                    },
                    {
                        name: "image.generate",
                        args: {
                            prompt: "Crea una imagen nueva basada en los colores observados."
                        }
                    }
                ]
            })
        }
    );

    assert.deepEqual(
        result.map(call => call.name),
        ["media.analyze", "image.generate"]
    );
});

'''

if insert_before not in tests:
    raise SystemExit('test insertion anchor not found')
tests = tests.replace(insert_before, new_tests + insert_before, 1)
test_path.write_text(tests, encoding='utf-8')
