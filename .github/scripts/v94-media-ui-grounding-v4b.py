from pathlib import Path

function_path = Path("functions/jarvis-media-analysis.js")
test_path = Path("tests/jarvis-media-analysis.test.cjs")

source = function_path.read_text(encoding="utf-8")
tests = test_path.read_text(encoding="utf-8")

old_constants = '''const SENSITIVE_NARRATIVE_LITERAL_PATTERN = /(?:https?:\\/\\/[^\\s\"'<>]+|www\\.[^\\s\"'<>]+|\\b\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}\\b|\\b(?:19|20)\\d{2}\\b|\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\b)/i;'''
new_constants = '''const SENSITIVE_NARRATIVE_LITERAL_PATTERN = /(?:https?:\\/\\/[^\\s\"'<>]+|www\\.[^\\s\"'<>]+|\\b(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\\.)+(?:com|net|org|app|dev|io|mx|ai|co|es|tech|cloud|web)\\b|\\b\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}\\b|\\b(?:19|20)\\d{2}\\b|\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\b)/i;
const QUOTED_NARRATIVE_LITERAL_PATTERN = /[\"'`“”‘’]([^\"'`“”‘’\\n]{2,160})[\"'`“”‘’]/g;
const PROPER_UI_LITERAL_PATTERN = /\\b(?:[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*|[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+(?:\\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*)+)\\b/g;
const NON_VISUAL_RECOMMENDATION_PATTERN = /\\b(?:investigat(?:e|es|ed|ing|ion)|explor(?:e|es|ed|ing|ation)|document(?:ar|e|es|ed|ing|ation)|investigar|explorar|documentar)\\b/i;'''
if old_constants not in source:
    raise SystemExit("v4b constants anchor not found")
source = source.replace(old_constants, new_constants, 1)

anchor = '''function verifiedVisibleLiteralValues(sources = []) {'''
helpers = '''function extractQuotedNarrativeLiterals(value = "") {
    const pattern = new RegExp(
        QUOTED_NARRATIVE_LITERAL_PATTERN.source,
        "g"
    );
    return Array.from(
        String(value || "").matchAll(pattern),
        match => String(match?.[1] || "").trim()
    ).filter(Boolean);
}

function extractProperUiNarrativeLiterals(value = "") {
    const pattern = new RegExp(
        PROPER_UI_LITERAL_PATTERN.source,
        "g"
    );
    return Array.from(
        String(value || "").matchAll(pattern),
        match => String(match?.[0] || "").trim()
    ).filter(Boolean);
}

function groundingRequiredNarrativeLiterals(value = "") {
    return [...new Set([
        ...extractSensitiveNarrativeLiterals(value),
        ...extractQuotedNarrativeLiterals(value),
        ...extractProperUiNarrativeLiterals(value)
    ].filter(Boolean))];
}

'''
if anchor not in source:
    raise SystemExit("v4b helper insertion anchor not found")
source = source.replace(anchor, helpers + anchor, 1)

old_literal_line = '''        const literals = extractSensitiveNarrativeLiterals(value);'''
new_literal_line = '''        const literals = groundingRequiredNarrativeLiterals(value);'''
if old_literal_line not in source:
    raise SystemExit("v4b literal extraction anchor not found")
source = source.replace(old_literal_line, new_literal_line, 1)

old_assert_end = '''    if (
        candidates.some(candidate =>
            containsUnverifiedSensitiveNarrativeLiteral(
                candidate,
                verifiedValues
            )
        )
    ) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
            files,
            sources
        );
    }
}

function validateAnalysis(parsed, files) {'''
new_assert_end = '''    if (
        candidates.some(candidate =>
            containsUnverifiedSensitiveNarrativeLiteral(
                candidate,
                verifiedValues
            )
        )
    ) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
            files,
            sources
        );
    }
}

function assertConcreteVisualRecommendations(parsed, files, sources) {
    const recommendations = Array.isArray(parsed?.recommendations)
        ? parsed.recommendations
        : [];

    if (
        recommendations.some(item =>
            NON_VISUAL_RECOMMENDATION_PATTERN.test(
                String(item || "")
            )
        )
    ) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION",
            files,
            sources
        );
    }
}

function validateAnalysis(parsed, files) {'''
if old_assert_end not in source:
    raise SystemExit("v4b recommendation insertion anchor not found")
source = source.replace(old_assert_end, new_assert_end, 1)

old_validate = '''    assertNoSensitiveNarrativeLiteralLeaks(
        parsed,
        files,
        orderedSources
    );

    return {'''
new_validate = '''    assertNoSensitiveNarrativeLiteralLeaks(
        parsed,
        files,
        orderedSources
    );

    assertConcreteVisualRecommendations(
        parsed,
        files,
        orderedSources
    );

    return {'''
if old_validate not in source:
    raise SystemExit("v4b validate anchor not found")
source = source.replace(old_validate, new_validate, 1)

old_policy = '''            unverifiedLiteralValuesAreWithheld: true,
            authenticatedAdminOnly: true'''
new_policy = '''            unverifiedLiteralValuesAreWithheld: true,
            narrativeUiLiteralsRequireVisibleData: true,
            conversationContentCannotProveUiCapability: true,
            authenticatedAdminOnly: true'''
if old_policy not in source:
    raise SystemExit("v4b policy anchor not found")
source = source.replace(old_policy, new_policy, 1)

old_prompt = '''        "No uses la instruccion del usuario como evidencia visual; una palabra mencionada en la solicitud no demuestra que ese elemento aparezca en los pixeles.",
        "Si la solicitud compara un menu, panel, boton o control que no esta abierto o visible en una fuente, declara que esa parte de la comparacion no es verificable y no infieras sus opciones ni funciones.",'''
new_prompt = '''        "No uses la instruccion del usuario como evidencia visual; una palabra mencionada en la solicitud no demuestra que ese elemento aparezca en los pixeles.",
        "En capturas de interfaces conversacionales, el texto dentro del historial de mensajes o respuestas es contenido de conversacion, no evidencia de funcionalidad de la interfaz.",
        "Nunca uses una afirmacion escrita dentro de un mensaje del asistente como prueba de que un control existe, falta, funciona o no funciona; para eso usa solamente controles, menus, botones, paneles, etiquetas de UI y estados visibles.",
        "Si la solicitud compara un menu, panel, boton o control que no esta abierto o visible en una fuente, declara que esa parte de la comparacion no es verificable y no infieras sus opciones ni funciones.",'''
if old_prompt not in source:
    raise SystemExit("v4b prompt anchor not found")
source = source.replace(old_prompt, new_prompt, 1)

old_repairable = '''        "MEDIA_ANALYSIS_SOURCE_IDENTITY_DUPLICATE",
        "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK"
    ]).has(error?.message);'''
new_repairable = '''        "MEDIA_ANALYSIS_SOURCE_IDENTITY_DUPLICATE",
        "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
        "MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION"
    ]).has(error?.message);'''
if old_repairable not in source:
    raise SystemExit("v4b repairable anchor not found")
source = source.replace(old_repairable, new_repairable, 1)

function_path.write_text(source, encoding="utf-8")

old_fixture = 'evidence: "Texto completo visible bajo el encabezado Terminal Heberto.",'
new_fixture = 'evidence: "Texto completo visible bajo el encabezado.",'
if old_fixture not in tests:
    raise SystemExit("v4b precision fixture anchor not found")
tests = tests.replace(old_fixture, new_fixture, 1)

marker = 'test("production repairs ungrounded UI labels, bare domains and generic investigation advice", async () => {'
if marker not in tests:
    tests += r'''


test("production repairs ungrounded UI labels, bare domains and generic investigation advice", async () => {
    let calls = 0;
    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async request => {
                    calls += 1;
                    if (calls === 1) {
                        return {
                            text: JSON.stringify({
                                sources: [
                                    {
                                        sourceId: "SOURCE_1",
                                        fileName: "chat.png",
                                        mimeType: "image/png",
                                        description: "Screenshot of the ChatGPT Plus interface.",
                                        observations: ["The menu shows 'Añadir fotos y archivos'."],
                                        inferences: [],
                                        objects: [],
                                        composition: {},
                                        visibleData: [],
                                        pages: [],
                                        marketingUse: [],
                                        quality: {},
                                        uncertainty: [],
                                        evidence: []
                                    },
                                    {
                                        sourceId: "SOURCE_2",
                                        fileName: "terminal.png",
                                        mimeType: "image/png",
                                        description: "Screenshot of Terminal Heberto.",
                                        observations: ["The browser shows fixgo-44d.web.app."],
                                        inferences: [],
                                        objects: [],
                                        composition: {},
                                        visibleData: [],
                                        pages: [],
                                        marketingUse: [],
                                        quality: {},
                                        uncertainty: [],
                                        evidence: []
                                    }
                                ],
                                comparison: {
                                    beforeAfter: false,
                                    differences: ["ChatGPT Plus includes GitHub while Terminal Heberto differs."],
                                    confidence: 0.9
                                },
                                recommendations: ["Investigate the purpose and context of the terminal."]
                            })
                        };
                    }

                    assert.match(
                        request.contents[0].parts[0],
                        /MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK|MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION/
                    );

                    return {
                        text: JSON.stringify({
                            sources: [
                                {
                                    sourceId: "SOURCE_1",
                                    fileName: "chat.png",
                                    mimeType: "image/png",
                                    description: "Interfaz conversacional con un menu desplegado.",
                                    observations: ["Se observan varias entradas de menu sin transcribir etiquetas no verificadas."],
                                    inferences: [],
                                    objects: [],
                                    composition: {},
                                    visibleData: [],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: ["Las etiquetas literales no alcanzan el umbral de verificacion."],
                                    evidence: []
                                },
                                {
                                    sourceId: "SOURCE_2",
                                    fileName: "terminal.png",
                                    mimeType: "image/png",
                                    description: "Interfaz conversacional con un menu desplegado.",
                                    observations: ["Se observan menos entradas visibles en el menu sin transcribir etiquetas no verificadas."],
                                    inferences: [],
                                    objects: [],
                                    composition: {},
                                    visibleData: [],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: ["Las etiquetas literales no alcanzan el umbral de verificacion."],
                                    evidence: []
                                }
                            ],
                            comparison: {
                                beforeAfter: false,
                                differences: ["Una fuente muestra mas entradas visibles en el menu que la otra."],
                                confidence: 0.9
                            },
                            recommendations: ["Hacer visibles mas opciones de adjuntos cuando exista soporte real para ellas."]
                        })
                    };
                }
            }
        },
        input: {
            files: [
                { name: "chat.png", mimeType: "image/png", dataBase64: Buffer.from("chat-ui").toString("base64") },
                { name: "terminal.png", mimeType: "image/png", dataBase64: Buffer.from("terminal-ui").toString("base64") }
            ],
            question: "Compara solamente controles visibles de adjuntos."
        }
    });

    assert.equal(calls, 2);
    assert.equal(result.repairCount, 1);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.doesNotMatch(
        JSON.stringify(result),
        /ChatGPT Plus|Terminal Heberto|GitHub|fixgo-44d\.web\.app|Investigate|Añadir fotos y archivos/
    );
    assert.equal(result.policy.narrativeUiLiteralsRequireVisibleData, true);
    assert.equal(result.policy.conversationContentCannotProveUiCapability, true);
});


test("production permits UI labels in narrative only when verified visibleData grounds them", async () => {
    let calls = 0;
    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async () => {
                    calls += 1;
                    return {
                        text: JSON.stringify({
                            sources: [
                                {
                                    sourceId: "SOURCE_1",
                                    fileName: "chat.png",
                                    mimeType: "image/png",
                                    description: "La interfaz muestra ChatGPT Plus.",
                                    observations: ["El control 'Añadir fotos y archivos' esta visible."],
                                    inferences: [],
                                    objects: [],
                                    composition: {},
                                    visibleData: [
                                        {
                                            kind: "text",
                                            value: "ChatGPT Plus",
                                            page: 1,
                                            confidence: 0.99,
                                            evidence: "Etiqueta visible en la parte superior.",
                                            legibility: "VERIFIED"
                                        },
                                        {
                                            kind: "text",
                                            value: "Añadir fotos y archivos",
                                            page: 1,
                                            confidence: 0.99,
                                            evidence: "Entrada visible del menu abierto.",
                                            legibility: "VERIFIED"
                                        }
                                    ],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: [],
                                    evidence: []
                                },
                                {
                                    sourceId: "SOURCE_2",
                                    fileName: "terminal.png",
                                    mimeType: "image/png",
                                    description: "La interfaz muestra Terminal Heberto.",
                                    observations: [],
                                    inferences: [],
                                    objects: [],
                                    composition: {},
                                    visibleData: [
                                        {
                                            kind: "text",
                                            value: "Terminal Heberto",
                                            page: 1,
                                            confidence: 0.99,
                                            evidence: "Encabezado visible de la interfaz.",
                                            legibility: "VERIFIED"
                                        }
                                    ],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: [],
                                    evidence: []
                                }
                            ],
                            comparison: {
                                beforeAfter: false,
                                differences: ["ChatGPT Plus y Terminal Heberto muestran encabezados distintos."],
                                confidence: 0.99
                            },
                            recommendations: []
                        })
                    };
                }
            }
        },
        input: {
            files: [
                { name: "chat.png", mimeType: "image/png", dataBase64: Buffer.from("chat-ui-verified").toString("base64") },
                { name: "terminal.png", mimeType: "image/png", dataBase64: Buffer.from("terminal-ui-verified").toString("base64") }
            ],
            question: "Compara controles visibles."
        }
    });

    assert.equal(calls, 1);
    assert.equal(result.repairCount, 0);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(result.sources[0].visibleData[0].value, "ChatGPT Plus");
    assert.equal(result.sources[0].visibleData[1].value, "Añadir fotos y archivos");
    assert.equal(result.sources[1].visibleData[0].value, "Terminal Heberto");
});
'''

test_path.write_text(tests, encoding="utf-8")
