from pathlib import Path

media_path = Path("functions/jarvis-media-analysis.js")
media = media_path.read_text(encoding="utf-8")

needle = "const MAX_REPAIR_ATTEMPTS = 1;\n"
addition = """const MAX_REPAIR_ATTEMPTS = 1;
const SENSITIVE_NARRATIVE_LITERAL_PATTERN = /(?:https?:\\/\\/[^\\s\"'<>]+|www\\.[^\\s\"'<>]+|\\b\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}\\b|\\b(?:19|20)\\d{2}\\b|\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\b)/i;
"""
if "SENSITIVE_NARRATIVE_LITERAL_PATTERN" not in media:
    assert needle in media, "media constants anchor not found"
    media = media.replace(needle, addition, 1)

helper_anchor = "function validateAnalysis(parsed, files) {\n"
helpers = r'''function containsSensitiveNarrativeLiteral(value) {
    if (value == null) return false;
    if (typeof value === "string") {
        return SENSITIVE_NARRATIVE_LITERAL_PATTERN.test(value);
    }
    if (Array.isArray(value)) {
        return value.some(containsSensitiveNarrativeLiteral);
    }
    if (typeof value !== "object") return false;
    return Object.values(value).some(containsSensitiveNarrativeLiteral);
}

function assertNoSensitiveNarrativeLiteralLeaks(parsed, files, sources) {
    const candidates = [];

    for (const source of sources) {
        candidates.push(
            source?.description,
            source?.observations,
            source?.inferences,
            source?.objects,
            source?.composition,
            source?.pages,
            source?.marketingUse,
            source?.quality,
            source?.uncertainty,
            source?.evidence
        );
    }

    candidates.push(
        parsed?.comparison,
        parsed?.recommendations
    );

    if (candidates.some(containsSensitiveNarrativeLiteral)) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
            files,
            sources
        );
    }
}

'''
if "function assertNoSensitiveNarrativeLiteralLeaks" not in media:
    assert helper_anchor in media, "media validation anchor not found"
    media = media.replace(helper_anchor, helpers + helper_anchor, 1)

identity_anchor = """    const orderedSources =
        resolveSourcesByIdentity(sources, files);

    return {
"""
identity_replacement = """    const orderedSources =
        resolveSourcesByIdentity(sources, files);

    assertNoSensitiveNarrativeLiteralLeaks(
        parsed,
        files,
        orderedSources
    );

    return {
"""
if "assertNoSensitiveNarrativeLiteralLeaks(\n        parsed," not in media:
    assert identity_anchor in media, "media identity validation anchor not found"
    media = media.replace(identity_anchor, identity_replacement, 1)

repair_anchor = """        "MEDIA_ANALYSIS_SOURCE_IDENTITY_DUPLICATE"
    ]).has(error?.message);
"""
repair_replacement = """        "MEDIA_ANALYSIS_SOURCE_IDENTITY_DUPLICATE",
        "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK"
    ]).has(error?.message);
"""
if '"MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK"\n    ]).has' not in media:
    assert repair_anchor in media, "repairable error anchor not found"
    media = media.replace(repair_anchor, repair_replacement, 1)

prompt_anchor = '        "Fuera de visibleData, ninguna propiedad de la respuesta debe contener transcripciones literales, URLs, fechas, horas, anos, cifras ni identificadores.",\n'
prompt_extra = prompt_anchor + '''        "No uses la instruccion del usuario como evidencia visual; una palabra mencionada en la solicitud no demuestra que ese elemento aparezca en los pixeles.",
        "Si la solicitud compara un menu, panel, boton o control que no esta abierto o visible en una fuente, declara que esa parte de la comparacion no es verificable y no infieras sus opciones ni funciones.",
        "Description, observations, inferences, objects, pages, evidence, comparison y recommendations no deben repetir fechas, horas, anos, URLs o identificadores; esas lecturas solo pueden existir en visibleData.",
'''
if "No uses la instruccion del usuario como evidencia visual" not in media:
    assert prompt_anchor in media, "media prompt anchor not found"
    media = media.replace(prompt_anchor, prompt_extra, 1)

media_path.write_text(media, encoding="utf-8")

composer_path = Path("gestia-core/jarvis/jarvis.conversation.composer.js")
composer = composer_path.read_text(encoding="utf-8")
old = '''    if (operational.length !== 1) return null;

    const item = operational[0];
    if (String(item?.name || item?.tool || "") !== "media.analyze") {
        return null;
    }
'''
new = '''    const mediaItems = operational.filter(item =>
        String(item?.name || item?.tool || "") === "media.analyze"
    );
    const allowedCompanionTools = new Set([
        "system.certify"
    ]);
    const unsupportedCompanions = operational.filter(item => {
        const toolName = String(item?.name || item?.tool || "");
        return toolName !== "media.analyze" &&
            !allowedCompanionTools.has(toolName);
    });

    if (
        mediaItems.length !== 1 ||
        unsupportedCompanions.length > 0
    ) {
        return null;
    }

    const item = mediaItems[0];
'''
if "const allowedCompanionTools = new Set([" not in composer:
    assert old in composer, "composer media singleton anchor not found"
    composer = composer.replace(old, new, 1)
composer_path.write_text(composer, encoding="utf-8")

media_test_path = Path("tests/jarvis-media-analysis.test.cjs")
media_test = media_test_path.read_text(encoding="utf-8")
marker = 'test("production incident repairs a sensitive literal leaked outside visibleData"'
if marker not in media_test:
    media_test += r'''

test("production incident repairs a sensitive literal leaked outside visibleData", async () => {
    let calls = 0;
    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async request => {
                    calls += 1;
                    if (calls === 1) {
                        return {
                            text: JSON.stringify({
                                sources: [{
                                    sourceId: "SOURCE_1",
                                    fileName: "terminal.png",
                                    mimeType: "image/png",
                                    description: "Interfaz de terminal.",
                                    observations: ["La fecha mostrada es 07/08/2023."],
                                    inferences: [],
                                    objects: ["Una interfaz web."],
                                    composition: {},
                                    visibleData: [],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: [],
                                    evidence: []
                                }]
                            })
                        };
                    }
                    assert.match(
                        request.contents[0].parts[0],
                        /MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK/
                    );
                    return {
                        text: JSON.stringify({
                            sources: [{
                                sourceId: "SOURCE_1",
                                fileName: "terminal.png",
                                mimeType: "image/png",
                                description: "Interfaz de terminal.",
                                observations: ["Se observa una barra inferior, sin transcribir datos sensibles fuera de visibleData."],
                                inferences: [],
                                objects: ["Una interfaz web."],
                                composition: {},
                                visibleData: [],
                                pages: [],
                                marketingUse: [],
                                quality: {},
                                uncertainty: ["La fecha visible no se transcribe porque no fue solicitada como lectura literal."],
                                evidence: []
                            }]
                        })
                    };
                }
            }
        },
        input: {
            files: [{
                name: "terminal.png",
                mimeType: "image/png",
                dataBase64: tinyPng
            }],
            question: "Describe solamente lo verificable."
        }
    });

    assert.equal(calls, 2);
    assert.equal(result.repairCount, 1);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.doesNotMatch(JSON.stringify(result), /07\/08\/2023|2023/);
});
'''
media_test_path.write_text(media_test, encoding="utf-8")

composer_test_path = Path("tests/jarvis-conversation-composer.test.mjs")
composer_test = composer_test_path.read_text(encoding="utf-8")
marker = 'test("system certification companion cannot force semantic rewriting of verified media"'
if marker not in composer_test:
    composer_test += r'''

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
'''
composer_test_path.write_text(composer_test, encoding="utf-8")
