from pathlib import Path

media_path = Path("functions/jarvis-media-analysis.js")
composer_path = Path("gestia-core/jarvis/jarvis.conversation.composer.js")
media_test_path = Path("tests/jarvis-media-analysis.test.cjs")
composer_test_path = Path("tests/jarvis-conversation-composer.test.mjs")

media = media_path.read_text(encoding="utf-8")
composer = composer_path.read_text(encoding="utf-8")
media_tests = media_test_path.read_text(encoding="utf-8")
composer_tests = composer_test_path.read_text(encoding="utf-8")

old_media_constants = '''const PROPER_UI_LITERAL_PATTERN = /\\b(?:[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+[A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*|[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+(?:\\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*)+)\\b/g;
const NON_VISUAL_RECOMMENDATION_PATTERN = /\\b(?:investigat(?:e|es|ed|ing|ion)|explor(?:e|es|ed|ing|ation)|document(?:ar|e|es|ed|ing|ation)|investigar|explorar|documentar)\\b/i;'''
new_media_constants = '''const PROPER_UI_LITERAL_PATTERN = /\\b(?:[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+[A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*|[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+(?:\\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*)+)\\b/g;
const STANDALONE_UI_LITERAL_PATTERN = /\\b[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]{2,}\\b/g;
const STANDALONE_UI_LITERAL_STOPWORDS = new Set([
    "The", "This", "That", "These", "Those", "Screenshot", "Interface", "Menu", "Source", "File", "Both", "One", "Another", "Primary", "Application", "Differences", "Recommendations", "Analysis", "Verified", "Visual", "If", "No", "Yes", "While", "Based", "For", "With", "From", "And", "Or",
    "La", "El", "Los", "Las", "Una", "Un", "Se", "En", "Para", "Con", "Sin", "Esto", "Esta", "Este", "Estas", "Estos", "Archivo", "Fuente", "Interfaz", "Menu", "Menú", "Analisis", "Análisis", "Diferencias", "Mejoras", "Lectura", "Lecturas", "Verificado", "Visual", "Si", "Sí", "No", "Al", "Del"
]);
const NON_VISUAL_RECOMMENDATION_PATTERN = /\\b(?:investigat(?:e|es|ed|ing|ion)|explor(?:e|es|ed|ing|ation)|document(?:ar|e|es|ed|ing|ation)|investigar|explorar|documentar)\\b/i;'''
if old_media_constants not in media:
    raise SystemExit("v4e media constants anchor missing")
media = media.replace(old_media_constants, new_media_constants, 1)

old_media_helpers = '''function groundingRequiredNarrativeLiterals(value = "") {
    return [...new Set([
        ...extractSensitiveNarrativeLiterals(value),
        ...extractQuotedNarrativeLiterals(value),
        ...extractProperUiNarrativeLiterals(value)
    ].filter(Boolean))];
}
'''
new_media_helpers = '''function extractStandaloneUiNarrativeLiterals(value = "") {
    const source = String(value || "");
    const pattern = new RegExp(
        STANDALONE_UI_LITERAL_PATTERN.source,
        "g"
    );
    return Array.from(source.matchAll(pattern))
        .filter(match => {
            const literal = String(match?.[0] || "").trim();
            const index = Number(match?.index || 0);
            if (!literal || index === 0) return false;
            if (STANDALONE_UI_LITERAL_STOPWORDS.has(literal)) return false;
            if (/^[A-ZÁÉÍÓÚÑ]{2,}$/.test(literal)) return false;
            return true;
        })
        .map(match => String(match?.[0] || "").trim())
        .filter(Boolean);
}

function groundingRequiredNarrativeLiterals(value = "") {
    return [...new Set([
        ...extractSensitiveNarrativeLiterals(value),
        ...extractQuotedNarrativeLiterals(value),
        ...extractProperUiNarrativeLiterals(value),
        ...extractStandaloneUiNarrativeLiterals(value)
    ].filter(Boolean))];
}
'''
if old_media_helpers not in media:
    raise SystemExit("v4e media helper anchor missing")
media = media.replace(old_media_helpers, new_media_helpers, 1)

old_media_policy = '''            deterministicPrecisionSanitizer: true,
            authenticatedAdminOnly: true'''
new_media_policy = '''            deterministicPrecisionSanitizer: true,
            standaloneUiLiteralsRequireVisibleData: true,
            authenticatedAdminOnly: true'''
if old_media_policy not in media:
    raise SystemExit("v4e media policy anchor missing")
media = media.replace(old_media_policy, new_media_policy, 1)

composer_anchor = '''function naturalEvidenceText(item) {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return "";
    return String(
        item.observation ||
        item.detail ||
        item.summary ||
        item.label ||
        ""
    ).trim();
}
'''
composer_helpers = '''const RENDER_SENSITIVE_LITERAL_PATTERN = /(?:https?:\\/\\/[^\\s\"'<>]+|www\\.[^\\s\"'<>]+|\\b(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\\.)+(?:com|net|org|app|dev|io|mx|ai|co|es|tech|cloud|web)\\b|\\b\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}\\b|\\b(?:19|20)\\d{2}\\b|\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\b)/gi;
const RENDER_QUOTED_LITERAL_PATTERN = /[\"'`“”‘’]([^\"'`“”‘’\\n]{2,160})[\"'`“”‘’]/g;
const RENDER_PROPER_UI_LITERAL_PATTERN = /\\b(?:[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+[A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*|[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+(?:\\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*)+)\\b/g;
const RENDER_STANDALONE_UI_LITERAL_PATTERN = /\\b[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]{2,}\\b/g;
const RENDER_STANDALONE_UI_STOPWORDS = new Set([
    "The", "This", "That", "These", "Those", "Screenshot", "Interface", "Menu", "Source", "File", "Both", "One", "Another", "Primary", "Application", "Differences", "Recommendations", "Analysis", "Verified", "Visual", "If", "No", "Yes", "While", "Based", "For", "With", "From", "And", "Or",
    "La", "El", "Los", "Las", "Una", "Un", "Se", "En", "Para", "Con", "Sin", "Esto", "Esta", "Este", "Estas", "Estos", "Archivo", "Fuente", "Interfaz", "Menu", "Menú", "Analisis", "Análisis", "Diferencias", "Mejoras", "Lectura", "Lecturas", "Verificado", "Visual", "Si", "Sí", "No", "Al", "Del"
]);

function normalizedGroundedLiteral(value = "") {
    return normalizedText(value)
        .replace(/[),.;!?]+$/g, "");
}

function verifiedMediaLiteralValues(observation = {}) {
    const minimumConfidence = Number(
        observation?.precisionAudit?.exactTextRequiresConfidence ||
        0.98
    );
    return [...new Set(
        (Array.isArray(observation?.sources) ? observation.sources : [])
            .flatMap(source =>
                (Array.isArray(source?.visibleData) ? source.visibleData : [])
                    .filter(item =>
                        String(item?.legibility || "").trim().toUpperCase() === "VERIFIED" &&
                        Number(item?.confidence || 0) >= minimumConfidence &&
                        Boolean(String(item?.value || "").trim()) &&
                        Boolean(String(item?.evidence || "").trim())
                    )
                    .map(item => normalizedGroundedLiteral(item.value))
            )
            .filter(Boolean)
    )];
}

function renderLiteralCandidates(value = "") {
    const source = String(value || "");
    const candidates = [];
    const sensitive = new RegExp(RENDER_SENSITIVE_LITERAL_PATTERN.source, "gi");
    const quoted = new RegExp(RENDER_QUOTED_LITERAL_PATTERN.source, "g");
    const proper = new RegExp(RENDER_PROPER_UI_LITERAL_PATTERN.source, "g");
    const standalone = new RegExp(RENDER_STANDALONE_UI_LITERAL_PATTERN.source, "g");

    for (const match of source.matchAll(sensitive)) {
        candidates.push(String(match?.[0] || "").trim());
    }
    for (const match of source.matchAll(quoted)) {
        candidates.push(String(match?.[1] || "").trim());
    }
    for (const match of source.matchAll(proper)) {
        candidates.push(String(match?.[0] || "").trim());
    }
    for (const match of source.matchAll(standalone)) {
        const literal = String(match?.[0] || "").trim();
        const index = Number(match?.index || 0);
        if (!literal || index === 0) continue;
        if (RENDER_STANDALONE_UI_STOPWORDS.has(literal)) continue;
        if (/^[A-ZÁÉÍÓÚÑ]{2,}$/.test(literal)) continue;
        candidates.push(literal);
    }

    return [...new Set(candidates.filter(Boolean))];
}

function isGroundedRenderedNarrative(value, verifiedValues = []) {
    const candidates = renderLiteralCandidates(value);
    if (candidates.length === 0) return true;
    return candidates.every(literal => {
        const candidate = normalizedGroundedLiteral(literal);
        return verifiedValues.some(verified =>
            verified === candidate ||
            verified.includes(candidate) ||
            candidate.includes(verified)
        );
    });
}

function groundedNaturalEvidenceTexts(items = [], verifiedValues = []) {
    return (Array.isArray(items) ? items : [])
        .map(naturalEvidenceText)
        .filter(Boolean)
        .filter(value =>
            isGroundedRenderedNarrative(
                value,
                verifiedValues
            )
        );
}

'''
if composer_anchor not in composer:
    raise SystemExit("v4e composer helper anchor missing")
composer = composer.replace(composer_anchor, composer_anchor + "\n" + composer_helpers, 1)

old_render_objects = '''        const objects = (Array.isArray(source?.objects)
            ? source.objects
            : [])
            .map(naturalEvidenceText)
            .filter(Boolean);

        lines.push("", `### Archivo ${index + 1}: ${fileName}`);
        appendNaturalList(lines, "Elementos visuales confirmados:", objects);'''
new_render_objects = '''        const verifiedValues =
            verifiedMediaLiteralValues(observation);
        const objects = groundedNaturalEvidenceTexts(
            source?.objects,
            verifiedValues
        );

        lines.push("", `### Archivo ${index + 1}: ${fileName}`);
        appendNaturalList(lines, "Elementos visuales confirmados:", objects);'''
if old_render_objects not in composer:
    raise SystemExit("v4e composer objects anchor missing")
composer = composer.replace(old_render_objects, new_render_objects, 1)

old_render_tail = '''        appendNaturalList(
            lines,
            "Detalles inciertos o ilegibles:",
            source?.uncertainty
        );
    });

    appendNaturalList(
        lines,
        "Diferencias verificadas:",
        observation?.comparison?.differences
    );
    appendNaturalList(
        lines,
        "Mejoras sugeridas para la experiencia de adjuntos:",
        observation?.recommendations
    );'''
new_render_tail = '''        appendNaturalList(
            lines,
            "Detalles inciertos o ilegibles:",
            groundedNaturalEvidenceTexts(
                source?.uncertainty,
                verifiedMediaLiteralValues(observation)
            )
        );
    });

    const verifiedValues =
        verifiedMediaLiteralValues(observation);
    const groundedDifferences =
        groundedNaturalEvidenceTexts(
            observation?.comparison?.differences,
            verifiedValues
        );
    const groundedRecommendations =
        groundedNaturalEvidenceTexts(
            observation?.recommendations,
            verifiedValues
        );

    appendNaturalList(
        lines,
        "Diferencias verificadas:",
        groundedDifferences
    );
    if (
        Array.isArray(observation?.comparison?.differences) &&
        observation.comparison.differences.length > 0 &&
        groundedDifferences.length === 0
    ) {
        lines.push(
            "Diferencias verificadas: se omitieron comparaciones con etiquetas literales que no quedaron respaldadas por visibleData verificado."
        );
    }
    appendNaturalList(
        lines,
        "Mejoras sugeridas para la experiencia de adjuntos:",
        groundedRecommendations
    );
    if (
        Array.isArray(observation?.recommendations) &&
        observation.recommendations.length > 0 &&
        groundedRecommendations.length === 0
    ) {
        lines.push(
            "Mejoras sugeridas: no se muestran propuestas que dependan de etiquetas o capacidades no verificadas visualmente."
        );
    }'''
if old_render_tail not in composer:
    raise SystemExit("v4e composer render tail anchor missing")
composer = composer.replace(old_render_tail, new_render_tail, 1)

media_test_marker = 'test("production sanitizes standalone UI brand labels that are absent from verified visibleData", async () => {'
if media_test_marker not in media_tests:
    media_tests += r'''


test("production sanitizes standalone UI brand labels that are absent from verified visibleData", async () => {
    let calls = 0;
    const leakingPayload = {
        sources: [
            {
                sourceId: "SOURCE_1",
                fileName: "chat.png",
                mimeType: "image/png",
                description: "Screenshot of a web interface.",
                observations: ["The open menu includes Canva and Gmail among several options."],
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
                description: "Screenshot of another web interface.",
                observations: [],
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
            differences: ["One menu includes Canva and Gmail while the other differs."],
            confidence: 0.9
        },
        recommendations: []
    };

    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async () => {
                    calls += 1;
                    return { text: JSON.stringify(leakingPayload) };
                }
            }
        },
        input: {
            files: [
                { name: "chat.png", mimeType: "image/png", dataBase64: Buffer.from("chat-v4e").toString("base64") },
                { name: "terminal.png", mimeType: "image/png", dataBase64: Buffer.from("terminal-v4e").toString("base64") }
            ],
            question: "Compara controles visibles."
        }
    });

    assert.equal(calls, 2);
    assert.equal(result.ok, true);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(result.precisionSanitized, true);
    assert.equal(result.policy.standaloneUiLiteralsRequireVisibleData, true);
    assert.doesNotMatch(JSON.stringify(result), /Canva|Gmail/);
});
'''

composer_test_marker = 'test("precision renderer suppresses ungrounded standalone UI labels from provider comparison", async () => {'
if composer_test_marker not in composer_tests:
    composer_tests += r'''


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
'''

media_path.write_text(media, encoding="utf-8")
composer_path.write_text(composer, encoding="utf-8")
media_test_path.write_text(media_tests, encoding="utf-8")
composer_test_path.write_text(composer_tests, encoding="utf-8")
