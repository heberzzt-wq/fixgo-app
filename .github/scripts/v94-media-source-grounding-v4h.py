from pathlib import Path

media_path = Path("functions/jarvis-media-analysis.js")
composer_path = Path("gestia-core/jarvis/jarvis.conversation.composer.js")
media_test_path = Path("tests/jarvis-media-analysis.test.cjs")
composer_test_path = Path("tests/jarvis-conversation-composer.test.mjs")

media = media_path.read_text(encoding="utf-8")
composer = composer_path.read_text(encoding="utf-8")
media_tests = media_test_path.read_text(encoding="utf-8")
composer_tests = composer_test_path.read_text(encoding="utf-8")

media = media.replace(
    'const QUOTED_NARRATIVE_LITERAL_PATTERN = /["\'`“”‘’]([^"\'`“”‘’\\n]{2,160})["\'`“”‘’]/g;',
    'const QUOTED_NARRATIVE_LITERAL_PATTERN = /["\'`“”‘’]([^"\'`“”‘’\\n]{2,1000})["\'`“”‘’]/g;',
    1
)
if '{2,160})' in media.split('const QUOTED_NARRATIVE_LITERAL_PATTERN', 1)[1].split('\n', 1)[0]:
    raise SystemExit('v4h media quoted literal expansion failed')

old_capture = '''const CAPTURE_CONTEXT_CLAIM_PATTERN = /\\b(?:same date(?: and time)?|same time|system tray|captured (?:at|around) the same time|same user|misma fecha(?: y hora)?|misma hora|bandeja del sistema|capturad[oa]s? (?:a|alrededor de) la misma hora|mismo usuario)\\b/i;'''
new_capture = old_capture + '''\nconst CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN = /\\b(?:prompt|message|response|text block|assistant response|chat history|conversation history|instructs|states|says|mensaje|respuesta|bloque de texto|historial de (?:chat|conversaci[oó]n)|indica|dice)\\b/i;'''
if old_capture not in media:
    raise SystemExit('v4h capture anchor missing')
media = media.replace(old_capture, new_capture, 1)

old_assert = '''function assertNoSensitiveNarrativeLiteralLeaks(parsed, files, sources) {
    const candidates = [];
    const verifiedValues =
        verifiedVisibleLiteralValues(sources);

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

    if (
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
'''
new_assert = '''function assertNoSensitiveNarrativeLiteralLeaks(parsed, files, sources) {
    for (const source of sources) {
        const sourceVerifiedValues =
            verifiedVisibleLiteralValues([source]);
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

        if (
            sourceCandidates.some(candidate =>
                containsUnverifiedSensitiveNarrativeLiteral(
                    candidate,
                    sourceVerifiedValues
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

    const comparisonVerifiedValues =
        verifiedVisibleLiteralValues(sources);
    const comparisonCandidates = [
        parsed?.comparison,
        parsed?.recommendations
    ];

    if (
        comparisonCandidates.some(candidate =>
            containsUnverifiedSensitiveNarrativeLiteral(
                candidate,
                comparisonVerifiedValues
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
'''
if old_assert not in media:
    raise SystemExit('v4h source scoped assert anchor missing')
media = media.replace(old_assert, new_assert, 1)

old_policy_func = '''function applyQuestionGroundingPolicy(parsed, question = "") {
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
new_policy_func = '''function sanitizeNarrativeAgainstVerifiedValues(value, verifiedValues = []) {
    if (value == null) return value;
    if (typeof value === "string") {
        return containsUnverifiedSensitiveNarrativeLiteral(
            value,
            verifiedValues
        )
            ? ""
            : value;
    }
    if (Array.isArray(value)) {
        return value
            .map(item =>
                sanitizeNarrativeAgainstVerifiedValues(
                    item,
                    verifiedValues
                )
            )
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
        const clean = sanitizeNarrativeAgainstVerifiedValues(
            item,
            verifiedValues
        );
        if (clean == null || clean === "") continue;
        sanitized[key] = clean;
    }
    return sanitized;
}

function reconcileSourceScopedNarrativeGrounding(parsed, question = "") {
    const strictVisual = strictVisualOnlyRequested(question);
    const rawSources = Array.isArray(parsed?.sources)
        ? parsed.sources
        : [];
    const sources = rawSources.map(source => {
        const sourceVerifiedValues =
            verifiedVisibleLiteralValues([source]);
        const observations = sanitizeNarrativeAgainstVerifiedValues(
            source?.observations,
            sourceVerifiedValues
        );
        return {
            ...source,
            description: sanitizeNarrativeAgainstVerifiedValues(
                source?.description,
                sourceVerifiedValues
            ),
            observations: (Array.isArray(observations) ? observations : [])
                .filter(item =>
                    !strictVisual ||
                    !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                        String(item || "")
                    )
                ),
            inferences: strictVisual
                ? []
                : sanitizeNarrativeAgainstVerifiedValues(
                    source?.inferences,
                    sourceVerifiedValues
                ),
            objects: sanitizeNarrativeAgainstVerifiedValues(
                source?.objects,
                sourceVerifiedValues
            ),
            composition: sanitizeNarrativeAgainstVerifiedValues(
                source?.composition,
                sourceVerifiedValues
            ),
            pages: sanitizeNarrativeAgainstVerifiedValues(
                source?.pages,
                sourceVerifiedValues
            ),
            marketingUse: sanitizeNarrativeAgainstVerifiedValues(
                source?.marketingUse,
                sourceVerifiedValues
            ),
            quality: sanitizeNarrativeAgainstVerifiedValues(
                source?.quality,
                sourceVerifiedValues
            ),
            uncertainty: sanitizeNarrativeAgainstVerifiedValues(
                source?.uncertainty,
                sourceVerifiedValues
            ),
            evidence: sanitizeNarrativeAgainstVerifiedValues(
                source?.evidence,
                sourceVerifiedValues
            )
        };
    });
    const allVerifiedValues =
        verifiedVisibleLiteralValues(rawSources);
    const comparison = sanitizeNarrativeAgainstVerifiedValues(
        parsed?.comparison,
        allVerifiedValues
    );
    const recommendations = sanitizeNarrativeAgainstVerifiedValues(
        parsed?.recommendations,
        allVerifiedValues
    );

    return {
        ...parsed,
        sources,
        comparison: strictVisual && comparison && typeof comparison === "object"
            ? {
                ...comparison,
                differences: (Array.isArray(comparison?.differences)
                    ? comparison.differences
                    : [])
                    .filter(item =>
                        !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                            String(item || "")
                        )
                    )
            }
            : comparison,
        recommendations: strictVisual
            ? (Array.isArray(recommendations) ? recommendations : [])
                .filter(item =>
                    !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                        String(item || "")
                    )
                )
            : recommendations
    };
}

function applyQuestionGroundingPolicy(parsed, question = "") {
    return reconcileSourceScopedNarrativeGrounding(
        parsed,
        question
    );
}
'''
if old_policy_func not in media:
    raise SystemExit('v4h grounding policy anchor missing')
media = media.replace(old_policy_func, new_policy_func, 1)

old_sanitize_validate = '''                    const validated =
                        validateAnalysis(
                            sanitized.parsed,
                            files
                        );'''
new_sanitize_validate = '''                    const validated =
                        validateAnalysis(
                            reconcileSourceScopedNarrativeGrounding(
                                sanitized.parsed,
                                question
                            ),
                            files
                        );'''
if old_sanitize_validate not in media:
    raise SystemExit('v4h sanitized validation anchor missing')
media = media.replace(old_sanitize_validate, new_sanitize_validate, 1)

old_policy_marker = '''            standaloneUiLiteralsRequireVisibleData: true,
            authenticatedAdminOnly: true'''
new_policy_marker = '''            standaloneUiLiteralsRequireVisibleData: true,
            sourceScopedNarrativeGrounding: true,
            longQuotedTranscriptGuard: true,
            strictVisualConversationTranscriptSuppressed: true,
            authenticatedAdminOnly: true'''
if old_policy_marker not in media:
    raise SystemExit('v4h policy marker anchor missing')
media = media.replace(old_policy_marker, new_policy_marker, 1)

media_path.write_text(media, encoding="utf-8")

composer = composer.replace(
    'const RENDER_QUOTED_LITERAL_PATTERN = /["\'`“”‘’]([^"\'`“”‘’\\n]{2,160})["\'`“”‘’]/g;',
    'const RENDER_QUOTED_LITERAL_PATTERN = /["\'`“”‘’]([^"\'`“”‘’\\n]{2,1000})["\'`“”‘’]/g;',
    1
)
if '{2,160})' in composer.split('const RENDER_QUOTED_LITERAL_PATTERN', 1)[1].split('\n', 1)[0]:
    raise SystemExit('v4h composer quoted literal expansion failed')

old_renderer_patterns = '''const RENDER_SPECULATIVE_RECOMMENDATION_PATTERN = /\\b(?:investigat(?:e|es|ed|ing|ion)|explor(?:e|es|ed|ing|ation)|document(?:ar|e|es|ed|ing|ation)|clarif(?:y|ies|ied|ying)|evaluat(?:e|es|ed|ing|ion)|confirm(?:s|ed|ing|ation)?|determin(?:e|es|ed|ing|ation)|investigar|explorar|documentar|aclarar|evaluar|confirmar|determinar|ecosystem|workflow|purpose|context)\\b/i;'''
new_renderer_patterns = old_renderer_patterns + '''\nconst RENDER_CONVERSATION_TRANSCRIPT_PATTERN = /\\b(?:prompt|message|response|text block|assistant response|chat history|conversation history|instructs|states|says|mensaje|respuesta|bloque de texto|historial de (?:chat|conversaci[oó]n)|indica|dice)\\b/i;'''
if old_renderer_patterns not in composer:
    raise SystemExit('v4h renderer pattern anchor missing')
composer = composer.replace(old_renderer_patterns, new_renderer_patterns, 1)

old_verified_signature = '''function verifiedMediaLiteralValues(observation = {}) {
    const minimumConfidence = Number(
        observation?.precisionAudit?.exactTextRequiresConfidence ||
        0.98
    );
    return [...new Set(
        (Array.isArray(observation?.sources) ? observation.sources : [])
            .flatMap(source =>'''
new_verified_signature = '''function verifiedMediaLiteralValues(observation = {}, sourceScope = null) {
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
if old_verified_signature not in composer:
    raise SystemExit('v4h verified literal source-scope anchor missing')
composer = composer.replace(old_verified_signature, new_verified_signature, 1)

old_source_values = '''        const verifiedValues =
            verifiedMediaLiteralValues(observation);
        const objects = groundedNaturalEvidenceTexts(
            source?.objects,
            verifiedValues
        );
        const observations = groundedNaturalEvidenceTexts(
            source?.observations,
            verifiedValues
        );'''
new_source_values = '''        const verifiedValues =
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
if old_source_values not in composer:
    raise SystemExit('v4h renderer source values anchor missing')
composer = composer.replace(old_source_values, new_source_values, 1)

old_uncertainty = '''            groundedNaturalEvidenceTexts(
                source?.uncertainty,
                verifiedMediaLiteralValues(observation)
            )'''
new_uncertainty = '''            groundedNaturalEvidenceTexts(
                source?.uncertainty,
                verifiedMediaLiteralValues(observation, source)
            )'''
if old_uncertainty not in composer:
    raise SystemExit('v4h renderer uncertainty anchor missing')
composer = composer.replace(old_uncertainty, new_uncertainty, 1)

composer_path.write_text(composer, encoding="utf-8")

media_marker = 'test("strict visual-only request removes long quoted conversation transcript and prevents cross-source literal grounding", async () => {'
if media_marker not in media_tests:
    media_tests += r'''


test("strict visual-only request removes long quoted conversation transcript and prevents cross-source literal grounding", async () => {
    const longTranscript = "He analizado visualmente las dos imágenes proporcionadas, describiendo su contenido y las diferencias entre ellas. Se ha identificado que la terminal no muestra una interfaz de adjuntos de archivos.";
    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async () => ({
                    text: JSON.stringify({
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
                                    `A text block within the application states: '${longTranscript}'`,
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
                    })
                })
            }
        },
        input: {
            files: [
                { name: "one.png", mimeType: "image/png", dataBase64: Buffer.from("one-v4h").toString("base64") },
                { name: "two.png", mimeType: "image/png", dataBase64: Buffer.from("two-v4h").toString("base64") }
            ],
            question: "Compara solamente controles visibles. No infieras intenciones. El texto dentro del historial es contenido de conversación, no evidencia funcional."
        }
    });

    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.deepEqual(result.sources[0].inferences, []);
    assert.deepEqual(result.sources[1].inferences, []);
    assert.match(result.sources[0].visibleData[0].value, /ChatGPT Plus/);
    assert.equal(result.sources[1].visibleData.length, 0);
    assert.equal(result.sources[1].observations.length, 1);
    assert.match(result.sources[1].observations[0], /panel lateral/i);
    assert.doesNotMatch(JSON.stringify(result.sources[1]), /He analizado|ChatGPT Plus|text block within|probably uses/i);
    assert.equal(result.policy.sourceScopedNarrativeGrounding, true);
    assert.equal(result.policy.longQuotedTranscriptGuard, true);
    assert.equal(result.policy.strictVisualConversationTranscriptSuppressed, true);
});
'''
    media_test_path.write_text(media_tests, encoding="utf-8")

composer_marker = 'test("precision renderer uses source-scoped literals and suppresses long conversation transcript observations", async () => {'
if composer_marker not in composer_tests:
    composer_tests += r'''


test("precision renderer uses source-scoped literals and suppresses long conversation transcript observations", async () => {
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
