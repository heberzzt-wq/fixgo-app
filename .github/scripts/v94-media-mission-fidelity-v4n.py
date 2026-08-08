from pathlib import Path

composer_path = Path("gestia-core/jarvis/jarvis.conversation.composer.js")
composer = composer_path.read_text(encoding="utf-8")

old_source_selection = '''    const sources = Array.isArray(observation?.sources)
        ? observation.sources
        : Array.isArray(nestedEvidence?.sources)
            ? nestedEvidence.sources
            : Array.isArray(observation?.validSources)
                ? observation.validSources
                : [];
'''
new_source_selection = '''    const sources =
        Array.isArray(observation?.validSources) &&
        observation.validSources.length > 0
            ? observation.validSources
            : Array.isArray(observation?.sources) &&
                observation.sources.length > 0
                ? observation.sources
                : Array.isArray(nestedEvidence?.sources)
                    ? nestedEvidence.sources
                    : [];
'''
if old_source_selection not in composer:
    raise SystemExit("v4n composer source-selection anchor missing")
composer = composer.replace(old_source_selection, new_source_selection, 1)

old_stopwords = '''const RENDER_STANDALONE_UI_STOPWORDS = new Set([
    "The", "This", "That", "These", "Those", "Screenshot", "Interface", "Menu", "Source", "File", "Both", "One", "Another", "Primary", "Application", "Differences", "Recommendations", "Analysis", "Verified", "Visual", "If", "No", "Yes", "While", "Based", "For", "With", "From", "And", "Or",
    "La", "El", "Los", "Las", "Una", "Un", "Se", "En", "Para", "Con", "Sin", "Esto", "Esta", "Este", "Estas", "Estos", "Archivo", "Fuente", "Interfaz", "Menu", "Menú", "Analisis", "Análisis", "Diferencias", "Mejoras", "Lectura", "Lecturas", "Verificado", "Visual", "Si", "Sí", "No", "Al", "Del"
]);
'''
new_stopwords = '''const RENDER_STANDALONE_UI_STOPWORDS = new Set([
    "The", "This", "That", "These", "Those", "Screenshot", "Interface", "Menu", "Source", "File", "Both", "One", "Another", "Primary", "Application", "Differences", "Recommendations", "Analysis", "Verified", "Visual", "If", "No", "Yes", "While", "Based", "For", "With", "From", "And", "Or",
    "La", "El", "Los", "Las", "Una", "Un", "Se", "En", "Para", "Con", "Sin", "Esto", "Esta", "Este", "Estas", "Estos", "Archivo", "Fuente", "Interfaz", "Menu", "Menú", "Analisis", "Análisis", "Diferencias", "Mejoras", "Lectura", "Lecturas", "Verificado", "Visual", "Si", "Sí", "No", "Al", "Del"
]);
const RENDER_UPPER_UI_LITERAL_STOPWORDS = new Set([
    "SOURCE", "VERIFIED", "UNCERTAIN", "MEDIA", "ANALYSIS", "GROUNDED",
    "UI", "URL", "PDF", "MD", "JSON", "HTML", "HTTP", "HTTPS", "SHA",
    "ID", "API", "GPS", "CI", "DOM"
]);
'''
if old_stopwords not in composer:
    raise SystemExit("v4n composer stopword anchor missing")
composer = composer.replace(old_stopwords, new_stopwords, 1)

old_upper_skip = '''        if (/^[A-ZÁÉÍÓÚÑ]{2,}$/.test(literal)) continue;
        candidates.push(literal);
'''
new_upper_skip = '''        if (
            /^[A-ZÁÉÍÓÚÑ]{2,}$/.test(literal) &&
            RENDER_UPPER_UI_LITERAL_STOPWORDS.has(literal)
        ) {
            continue;
        }
        candidates.push(literal);
'''
if old_upper_skip not in composer:
    raise SystemExit("v4n composer uppercase anchor missing")
composer = composer.replace(old_upper_skip, new_upper_skip, 1)
composer_path.write_text(composer, encoding="utf-8")

pack_path = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
pack = pack_path.read_text(encoding="utf-8")
old_sanitizer = '''function sanitizeNarrativeAgainstVerifiedValues(value, verifiedValues = []) {
    if (!Array.isArray(value)) return [];
    return value.filter(item =>
        !mediaContractContainsUngroundedLiteral(item, verifiedValues)
    );
}
'''
new_sanitizer = '''const MEDIA_UPPER_UI_LITERAL_PATTERN = /\\b[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9-]{2,}\\b/g;
const MEDIA_UPPER_UI_LITERAL_STOPWORDS = new Set([
    "SOURCE", "VERIFIED", "UNCERTAIN", "MEDIA", "ANALYSIS", "GROUNDED",
    "UI", "URL", "PDF", "MD", "JSON", "HTML", "HTTP", "HTTPS", "SHA",
    "ID", "API", "GPS", "CI", "DOM"
]);

function mediaNarrativeContainsUngroundedUpperUiLiteral(
    value,
    verifiedValues = []
) {
    if (value == null) return false;
    if (typeof value === "string") {
        const pattern = new RegExp(MEDIA_UPPER_UI_LITERAL_PATTERN.source, "g");
        for (const match of value.matchAll(pattern)) {
            const literal = String(match?.[0] || "").trim();
            if (!literal || MEDIA_UPPER_UI_LITERAL_STOPWORDS.has(literal)) continue;
            const candidate = normalizeMediaContractLiteral(literal);
            const grounded = verifiedValues.some(verified =>
                verified === candidate ||
                verified.includes(candidate) ||
                candidate.includes(verified)
            );
            if (!grounded) return true;
        }
        return false;
    }
    if (Array.isArray(value)) {
        return value.some(item =>
            mediaNarrativeContainsUngroundedUpperUiLiteral(item, verifiedValues)
        );
    }
    if (typeof value !== "object") return false;
    return Object.values(value).some(item =>
        mediaNarrativeContainsUngroundedUpperUiLiteral(item, verifiedValues)
    );
}

function sanitizeNarrativeAgainstVerifiedValues(value, verifiedValues = []) {
    if (!Array.isArray(value)) return [];
    return value.filter(item =>
        !mediaContractContainsUngroundedLiteral(item, verifiedValues) &&
        !mediaNarrativeContainsUngroundedUpperUiLiteral(item, verifiedValues)
    );
}
'''
if old_sanitizer not in pack:
    raise SystemExit("v4n pack sanitizer anchor missing")
pack = pack.replace(old_sanitizer, new_sanitizer, 1)
pack_path.write_text(pack, encoding="utf-8")

composer_test_path = Path("tests/jarvis-conversation-composer.test.mjs")
composer_tests = composer_test_path.read_text(encoding="utf-8")
composer_marker = 'test("production mission envelope prefers intact validSources over compact nested evidence", async () => {'
if composer_marker not in composer_tests:
    composer_tests += r'''


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
'''
composer_test_path.write_text(composer_tests, encoding="utf-8")

browser_test_path = Path("tests/v94-media-browser-precision-contract.test.mjs")
browser_tests = browser_test_path.read_text(encoding="utf-8")
browser_marker = 'test("independent reconciliation removes an unverified uppercase UI label from provider narrative", () => {'
if browser_marker not in browser_tests:
    browser_tests += r'''


test("independent reconciliation removes an unverified uppercase UI label from provider narrative", () => {
    const initial = baseResult();
    const audited = baseResult();
    const terminalLabel = {
        kind: "text",
        value: "Terminal Heberto",
        page: 1,
        confidence: 1,
        evidence: "header",
        legibility: "VERIFIED"
    };
    initial.sources[1].visibleData = [terminalLabel];
    audited.sources[1].visibleData = [terminalLabel];
    audited.comparison = {
        differences: [
            "SOURCE_2 shows 'Terminal Heberto' (NEXO)."
        ]
    };

    const reconciled = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara solamente lo visible."
    );

    assert.deepEqual(
        reconciled.result.sources[1].visibleData.map(item => item.value),
        ["Terminal Heberto"]
    );
    assert.doesNotMatch(JSON.stringify(reconciled.result), /NEXO/);
    assert.deepEqual(reconciled.result.comparison.differences, []);
});
'''
browser_test_path.write_text(browser_tests, encoding="utf-8")
