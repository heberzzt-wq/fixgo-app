from pathlib import Path

media_path = Path("functions/jarvis-media-analysis.js")
composer_path = Path("gestia-core/jarvis/jarvis.conversation.composer.js")
media_test_path = Path("tests/jarvis-media-analysis.test.cjs")
composer_test_path = Path("tests/jarvis-conversation-composer.test.mjs")

media = media_path.read_text(encoding="utf-8")
composer = composer_path.read_text(encoding="utf-8")
media_tests = media_test_path.read_text(encoding="utf-8")
composer_tests = composer_test_path.read_text(encoding="utf-8")

old = 'const QUOTED_NARRATIVE_LITERAL_PATTERN = /["\'`“”‘’]([^"\'`“”‘’\\n]{2,160})["\'`“”‘’]/g;'
new = 'const QUOTED_NARRATIVE_LITERAL_PATTERN = /["\'`“”‘’]([^"\'`“”‘’\\n]{2,1000})["\'`“”‘’]/g;'
if old not in media:
    raise SystemExit("v4h2 media quote anchor missing")
media = media.replace(old, new, 1)

capture = 'const CAPTURE_CONTEXT_CLAIM_PATTERN = /\\b(?:same date(?: and time)?|same time|system tray|captured (?:at|around) the same time|same user|misma fecha(?: y hora)?|misma hora|bandeja del sistema|capturad[oa]s? (?:a|alrededor de) la misma hora|mismo usuario)\\b/i;'
conversation = capture + '\nconst CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN = /\\b(?:prompt|message|response|text block|assistant response|chat history|conversation history|instructs|states|says|mensaje|respuesta|bloque de texto|historial de (?:chat|conversaci[oó]n)|indica|dice)\\b/i;'
if capture not in media:
    raise SystemExit("v4h2 conversation anchor missing")
media = media.replace(capture, conversation, 1)

start = media.index("function assertNoSensitiveNarrativeLiteralLeaks(parsed, files, sources) {")
end = media.index("\nfunction sanitizePrecisionNarrative(parsed) {", start)
media = media[:start] + '''function assertNoSensitiveNarrativeLiteralLeaks(parsed, files, sources) {
    for (const source of sources) {
        const sourceVerifiedValues = verifiedVisibleLiteralValues([source]);
        const sourceCandidates = [
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
        ];
        if (sourceCandidates.some(candidate =>
            containsUnverifiedSensitiveNarrativeLiteral(candidate, sourceVerifiedValues)
        )) {
            throw createAnalysisError(
                "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
                files,
                sources
            );
        }
    }

    const comparisonVerifiedValues = verifiedVisibleLiteralValues(sources);
    if ([parsed?.comparison, parsed?.recommendations].some(candidate =>
        containsUnverifiedSensitiveNarrativeLiteral(candidate, comparisonVerifiedValues)
    )) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
            files,
            sources
        );
    }
}
''' + media[end:]

start = media.index("function sanitizePrecisionNarrative(parsed) {")
end = media.index("\nfunction assertConcreteVisualRecommendations", start)
media = media[:start] + '''function sanitizePrecisionNarrative(parsed) {
    const sources = Array.isArray(parsed?.sources)
        ? parsed.sources
        : [];
    const globalVerifiedValues = verifiedVisibleLiteralValues(sources);
    let removedCount = 0;

    function sanitizeValue(value, activeVerifiedValues) {
        if (value == null) return value;
        if (typeof value === "string") {
            if (containsUnverifiedSensitiveNarrativeLiteral(value, activeVerifiedValues)) {
                removedCount += 1;
                return "";
            }
            return value;
        }
        if (Array.isArray(value)) {
            return value
                .map(item => sanitizeValue(item, activeVerifiedValues))
                .filter(item => {
                    if (item == null || item === "") return false;
                    if (Array.isArray(item)) return item.length > 0;
                    if (typeof item === "object") return Object.keys(item).length > 0;
                    return true;
                });
        }
        if (typeof value !== "object") return value;
        const sanitized = {};
        for (const [key, item] of Object.entries(value)) {
            const clean = sanitizeValue(item, activeVerifiedValues);
            if (clean == null || clean === "") continue;
            if (Array.isArray(clean) && clean.length === 0) {
                sanitized[key] = clean;
                continue;
            }
            sanitized[key] = clean;
        }
        return sanitized;
    }

    const sanitizedSources = sources.map(source => {
        const sourceVerifiedValues = verifiedVisibleLiteralValues([source]);
        return {
            ...source,
            description: sanitizeValue(source?.description, sourceVerifiedValues),
            observations: sanitizeValue(source?.observations, sourceVerifiedValues),
            inferences: sanitizeValue(source?.inferences, sourceVerifiedValues),
            objects: sanitizeValue(source?.objects, sourceVerifiedValues),
            composition: sanitizeValue(source?.composition, sourceVerifiedValues),
            pages: sanitizeValue(source?.pages, sourceVerifiedValues),
            marketingUse: sanitizeValue(source?.marketingUse, sourceVerifiedValues),
            quality: sanitizeValue(source?.quality, sourceVerifiedValues),
            uncertainty: sanitizeValue(source?.uncertainty, sourceVerifiedValues),
            evidence: sanitizeValue(source?.evidence, sourceVerifiedValues)
        };
    });

    const sanitizedRecommendations =
        (Array.isArray(parsed?.recommendations) ? parsed.recommendations : [])
            .filter(item => {
                const text = String(item || "");
                const rejected =
                    NON_VISUAL_RECOMMENDATION_PATTERN.test(text) ||
                    CAPTURE_CONTEXT_CLAIM_PATTERN.test(text);
                if (rejected) removedCount += 1;
                return !rejected;
            });
    const comparison =
        parsed?.comparison && typeof parsed.comparison === "object"
            ? {
                ...parsed.comparison,
                differences: (Array.isArray(parsed.comparison.differences)
                    ? parsed.comparison.differences
                    : [])
                    .filter(item => {
                        const rejected = CAPTURE_CONTEXT_CLAIM_PATTERN.test(
                            String(item || "")
                        );
                        if (rejected) removedCount += 1;
                        return !rejected;
                    })
            }
            : parsed?.comparison;

    return {
        parsed: {
            ...parsed,
            sources: sanitizedSources,
            comparison: sanitizeValue(comparison, globalVerifiedValues),
            recommendations: sanitizeValue(
                sanitizedRecommendations,
                globalVerifiedValues
            )
        },
        removedCount
    };
}
''' + media[end:]

old_policy = '''function applyQuestionGroundingPolicy(parsed, question = "") {
    if (!strictVisualOnlyRequested(question)) return parsed;
    return {
        ...parsed,
        sources: (Array.isArray(parsed?.sources) ? parsed.sources : [])
            .map(source => ({
                ...source,
                inferences: []
            }))
    };
}
'''
new_policy = '''function applyQuestionGroundingPolicy(parsed, question = "") {
    if (!strictVisualOnlyRequested(question)) return parsed;
    return {
        ...parsed,
        sources: (Array.isArray(parsed?.sources) ? parsed.sources : [])
            .map(source => ({
                ...source,
                observations: (Array.isArray(source?.observations)
                    ? source.observations
                    : [])
                    .filter(item =>
                        !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                            String(item || "")
                        )
                    ),
                inferences: []
            })),
        comparison: parsed?.comparison && typeof parsed.comparison === "object"
            ? {
                ...parsed.comparison,
                differences: (Array.isArray(parsed.comparison?.differences)
                    ? parsed.comparison.differences
                    : [])
                    .filter(item =>
                        !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                            String(item || "")
                        )
                    )
            }
            : parsed?.comparison,
        recommendations: (Array.isArray(parsed?.recommendations)
            ? parsed.recommendations
            : [])
            .filter(item =>
                !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                    String(item || "")
                )
            )
    };
}
'''
if old_policy not in media:
    raise SystemExit("v4h2 strict policy anchor missing")
media = media.replace(old_policy, new_policy, 1)

policy_old = '''            standaloneUiLiteralsRequireVisibleData: true,
            authenticatedAdminOnly: true'''
policy_new = '''            standaloneUiLiteralsRequireVisibleData: true,
            sourceScopedNarrativeGrounding: true,
            longQuotedTranscriptGuard: true,
            strictVisualConversationTranscriptSuppressed: true,
            authenticatedAdminOnly: true'''
if policy_old not in media:
    raise SystemExit("v4h2 policy marker missing")
media = media.replace(policy_old, policy_new, 1)
media_path.write_text(media, encoding="utf-8")

old = 'const RENDER_QUOTED_LITERAL_PATTERN = /["\'`“”‘’]([^"\'`“”‘’\\n]{2,160})["\'`“”‘’]/g;'
new = 'const RENDER_QUOTED_LITERAL_PATTERN = /["\'`“”‘’]([^"\'`“”‘’\\n]{2,1000})["\'`“”‘’]/g;'
if old not in composer:
    raise SystemExit("v4h2 renderer quote anchor missing")
composer = composer.replace(old, new, 1)

spec = 'const RENDER_SPECULATIVE_RECOMMENDATION_PATTERN = /\\b(?:investigat(?:e|es|ed|ing|ion)|explor(?:e|es|ed|ing|ation)|document(?:ar|e|es|ed|ing|ation)|clarif(?:y|ies|ied|ying)|evaluat(?:e|es|ed|ing|ion)|confirm(?:s|ed|ing|ation)?|determin(?:e|es|ed|ing|ation)|investigar|explorar|documentar|aclarar|evaluar|confirmar|determinar|ecosystem|workflow|purpose|context)\\b/i;'
spec_new = spec + '\nconst RENDER_CONVERSATION_TRANSCRIPT_PATTERN = /\\b(?:prompt|message|response|text block|assistant response|chat history|conversation history|instructs|states|says|mensaje|respuesta|bloque de texto|historial de (?:chat|conversaci[oó]n)|indica|dice)\\b/i;'
if spec not in composer:
    raise SystemExit("v4h2 renderer conversation anchor missing")
composer = composer.replace(spec, spec_new, 1)

old = '''function verifiedMediaLiteralValues(observation = {}) {
    const minimumConfidence = Number(
        observation?.precisionAudit?.exactTextRequiresConfidence ||
        0.98
    );
    return [...new Set(
        (Array.isArray(observation?.sources) ? observation.sources : [])
            .flatMap(source =>'''
new = '''function verifiedMediaLiteralValues(observation = {}, sourceScope = null) {
    const minimumConfidence = Number(
        observation?.precisionAudit?.exactTextRequiresConfidence ||
        0.98
    );
    const sources = sourceScope
        ? [sourceScope]
        : (Array.isArray(observation?.sources) ? observation.sources : []);
    return [...new Set(
        sources
            .flatMap(source =>'''
if old not in composer:
    raise SystemExit("v4h2 renderer source scope signature missing")
composer = composer.replace(old, new, 1)

old = '''        const verifiedValues =
            verifiedMediaLiteralValues(observation);
        const objects = groundedNaturalEvidenceTexts(
            source?.objects,
            verifiedValues
        );
        const observations = groundedNaturalEvidenceTexts(
            source?.observations,
            verifiedValues
        );'''
new = '''        const verifiedValues =
            verifiedMediaLiteralValues(observation, source);
        const objects = groundedNaturalEvidenceTexts(
            source?.objects,
            verifiedValues
        );
        const observations = groundedNaturalEvidenceTexts(
            source?.observations,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CONVERSATION_TRANSCRIPT_PATTERN.test(value)
            );'''
if old not in composer:
    raise SystemExit("v4h2 renderer per-source values missing")
composer = composer.replace(old, new, 1)

old = '''            groundedNaturalEvidenceTexts(
                source?.uncertainty,
                verifiedMediaLiteralValues(observation)
            )'''
new = '''            groundedNaturalEvidenceTexts(
                source?.uncertainty,
                verifiedMediaLiteralValues(observation, source)
            )'''
if old not in composer:
    raise SystemExit("v4h2 renderer uncertainty source scope missing")
composer = composer.replace(old, new, 1)
composer_path.write_text(composer, encoding="utf-8")

if 'test("strict visual-only request removes long transcript observations and keeps source literal grounding isolated"' not in media_tests:
    media_tests += r'''


test("strict visual-only request removes long transcript observations and keeps source literal grounding isolated", async () => {
    let calls = 0;
    const transcript = "He analizado visualmente las dos imágenes proporcionadas, describiendo su contenido y las diferencias entre ellas. Se ha identificado que la terminal no muestra una interfaz de adjuntos de archivos.";
    const payload = {
        sources: [
            {
                sourceId: "SOURCE_1",
                fileName: "one.png",
                mimeType: "image/png",
                description: "Interfaz web con un menu abierto.",
                observations: ["Se observa un menu abierto con varias filas."],
                inferences: ["The user is likely preparing to attach a file."],
                visibleData: [{
                    kind: "text",
                    value: "ChatGPT Plus",
                    page: 1,
                    confidence: 0.99,
                    evidence: "Etiqueta visible en la parte superior.",
                    legibility: "VERIFIED"
                }],
                evidence: [],
                uncertainty: []
            },
            {
                sourceId: "SOURCE_2",
                fileName: "two.png",
                mimeType: "image/png",
                description: "Interfaz web con un panel lateral.",
                observations: [
                    `A text block within the application states: '${transcript}'`,
                    "The application is ChatGPT Plus.",
                    "Se observa un panel lateral junto al contenido principal."
                ],
                inferences: ["The user probably uses this interface for development."],
                visibleData: [],
                evidence: [],
                uncertainty: []
            }
        ],
        comparison: {
            beforeAfter: false,
            differences: ["La segunda fuente muestra un panel lateral que no aparece en la primera."],
            confidence: 0.99
        },
        recommendations: []
    };
    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async () => {
                    calls += 1;
                    return { text: JSON.stringify(payload) };
                }
            }
        },
        input: {
            files: [
                { name: "one.png", mimeType: "image/png", dataBase64: Buffer.from("one-v4h2").toString("base64") },
                { name: "two.png", mimeType: "image/png", dataBase64: Buffer.from("two-v4h2").toString("base64") }
            ],
            question: "Compara solamente controles visibles. No infieras intenciones. El texto dentro del historial es contenido de conversación, no evidencia funcional."
        }
    });

    assert.equal(calls, 2);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.deepEqual(result.sources[0].inferences, []);
    assert.deepEqual(result.sources[1].inferences, []);
    assert.equal(result.sources[1].observations.length, 1);
    assert.match(result.sources[1].observations[0], /panel lateral/i);
    assert.doesNotMatch(JSON.stringify(result.sources[1]), /He analizado|ChatGPT Plus|text block within|probably uses/i);
    assert.equal(result.policy.sourceScopedNarrativeGrounding, true);
    assert.equal(result.policy.longQuotedTranscriptGuard, true);
    assert.equal(result.policy.strictVisualConversationTranscriptSuppressed, true);
});
'''
    media_test_path.write_text(media_tests, encoding="utf-8")

if 'test("precision renderer keeps verified literals scoped to their own source and suppresses transcript content"' not in composer_tests:
    composer_tests += r'''


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
'''
    composer_test_path.write_text(composer_tests, encoding="utf-8")
