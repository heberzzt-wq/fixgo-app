from pathlib import Path

media_path = Path("functions/jarvis-media-analysis.js")
composer_path = Path("gestia-core/jarvis/jarvis.conversation.composer.js")
mission_path = Path("gestia-core/jarvis/jarvis.mission.orchestrator.js")
media_test_path = Path("tests/jarvis-media-analysis.test.cjs")
composer_test_path = Path("tests/jarvis-conversation-composer.test.mjs")
mission_test_path = Path("tests/jarvis-mission-orchestrator.test.mjs")

media = media_path.read_text(encoding="utf-8")
composer = composer_path.read_text(encoding="utf-8")
mission = mission_path.read_text(encoding="utf-8")
media_tests = media_test_path.read_text(encoding="utf-8")
composer_tests = composer_test_path.read_text(encoding="utf-8")
mission_tests = mission_test_path.read_text(encoding="utf-8")

old_media_constants = '''const NON_VISUAL_RECOMMENDATION_PATTERN = /\\b(?:investigat(?:e|es|ed|ing|ion)|explor(?:e|es|ed|ing|ation)|document(?:ar|e|es|ed|ing|ation)|investigar|explorar|documentar)\\b/i;'''
new_media_constants = '''const NON_VISUAL_RECOMMENDATION_PATTERN = /\\b(?:investigat(?:e|es|ed|ing|ion)|explor(?:e|es|ed|ing|ation)|document(?:ar|e|es|ed|ing|ation)|clarif(?:y|ies|ied|ying)|evaluat(?:e|es|ed|ing|ion)|confirm(?:s|ed|ing|ation)?|determin(?:e|es|ed|ing|ation)|investigar|explorar|documentar|aclarar|evaluar|confirmar|determinar|ecosystem|workflow|purpose|context)\\b/i;
const CAPTURE_CONTEXT_CLAIM_PATTERN = /\\b(?:same date(?: and time)?|same time|system tray|captured (?:at|around) the same time|same user|misma fecha(?: y hora)?|misma hora|bandeja del sistema|capturad[oa]s? (?:a|alrededor de) la misma hora|mismo usuario)\\b/i;'''
if old_media_constants not in media:
    raise SystemExit("v4f media constants anchor missing")
media = media.replace(old_media_constants, new_media_constants, 1)

old_sanitized_recs = '''    const sanitizedRecommendations =
        (Array.isArray(parsed?.recommendations)
            ? parsed.recommendations
            : [])
            .filter(item => {
                const rejected =
                    NON_VISUAL_RECOMMENDATION_PATTERN.test(
                        String(item || "")
                    );
                if (rejected) removedCount += 1;
                return !rejected;
            });

    return {
        parsed: {
            ...parsed,
            sources: sanitizedSources,
            comparison: sanitizeValue(parsed?.comparison),
            recommendations:
                sanitizeValue(sanitizedRecommendations)
        },'''
new_sanitized_recs = '''    const sanitizedRecommendations =
        (Array.isArray(parsed?.recommendations)
            ? parsed.recommendations
            : [])
            .filter(item => {
                const text = String(item || "");
                const rejected =
                    NON_VISUAL_RECOMMENDATION_PATTERN.test(text) ||
                    CAPTURE_CONTEXT_CLAIM_PATTERN.test(text);
                if (rejected) removedCount += 1;
                return !rejected;
            });
    const comparison =
        parsed?.comparison &&
        typeof parsed.comparison === "object"
            ? {
                ...parsed.comparison,
                differences:
                    (Array.isArray(parsed.comparison.differences)
                        ? parsed.comparison.differences
                        : [])
                        .filter(item => {
                            const rejected =
                                CAPTURE_CONTEXT_CLAIM_PATTERN.test(
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
            comparison: sanitizeValue(comparison),
            recommendations:
                sanitizeValue(sanitizedRecommendations)
        },'''
if old_sanitized_recs not in media:
    raise SystemExit("v4f sanitizer anchor missing")
media = media.replace(old_sanitized_recs, new_sanitized_recs, 1)

old_assert = '''function assertConcreteVisualRecommendations(parsed, files, sources) {
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
new_assert = '''function assertConcreteVisualRecommendations(parsed, files, sources) {
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

function assertNoCaptureContextClaims(parsed, files, sources) {
    const claims = [
        ...(Array.isArray(parsed?.comparison?.differences)
            ? parsed.comparison.differences
            : []),
        ...(Array.isArray(parsed?.recommendations)
            ? parsed.recommendations
            : [])
    ];

    if (
        claims.some(item =>
            CAPTURE_CONTEXT_CLAIM_PATTERN.test(
                String(item || "")
            )
        )
    ) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_CAPTURE_CONTEXT_CLAIM",
            files,
            sources
        );
    }
}

function validateAnalysis(parsed, files) {'''
if old_assert not in media:
    raise SystemExit("v4f media assertion anchor missing")
media = media.replace(old_assert, new_assert, 1)

old_validate = '''    assertConcreteVisualRecommendations(
        parsed,
        files,
        orderedSources
    );

    return {'''
new_validate = '''    assertConcreteVisualRecommendations(
        parsed,
        files,
        orderedSources
    );

    assertNoCaptureContextClaims(
        parsed,
        files,
        orderedSources
    );

    return {'''
if old_validate not in media:
    raise SystemExit("v4f media validate anchor missing")
media = media.replace(old_validate, new_validate, 1)

old_repairable = '''        "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
        "MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION"
    ]).has(error?.message);'''
new_repairable = '''        "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
        "MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION",
        "MEDIA_ANALYSIS_CAPTURE_CONTEXT_CLAIM"
    ]).has(error?.message);'''
if old_repairable not in media:
    raise SystemExit("v4f repairable anchor missing")
media = media.replace(old_repairable, new_repairable, 1)

old_sanitize_errors = '''                    "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
                    "MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION"
                ]).has(error?.message);'''
new_sanitize_errors = '''                    "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
                    "MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION",
                    "MEDIA_ANALYSIS_CAPTURE_CONTEXT_CLAIM"
                ]).has(error?.message);'''
if old_sanitize_errors not in media:
    raise SystemExit("v4f sanitize error anchor missing")
media = media.replace(old_sanitize_errors, new_sanitize_errors, 1)

composer_constants_anchor = '''const RENDER_STANDALONE_UI_STOPWORDS = new Set([
    "The", "This", "That", "These", "Those", "Screenshot", "Interface", "Menu", "Source", "File", "Both", "One", "Another", "Primary", "Application", "Differences", "Recommendations", "Analysis", "Verified", "Visual", "If", "No", "Yes", "While", "Based", "For", "With", "From", "And", "Or",
    "La", "El", "Los", "Las", "Una", "Un", "Se", "En", "Para", "Con", "Sin", "Esto", "Esta", "Este", "Estas", "Estos", "Archivo", "Fuente", "Interfaz", "Menu", "Menú", "Analisis", "Análisis", "Diferencias", "Mejoras", "Lectura", "Lecturas", "Verificado", "Visual", "Si", "Sí", "No", "Al", "Del"
]);'''
composer_constants_new = composer_constants_anchor + '''
const RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN = /\\b(?:same date(?: and time)?|same time|system tray|captured (?:at|around) the same time|same user|misma fecha(?: y hora)?|misma hora|bandeja del sistema|capturad[oa]s? (?:a|alrededor de) la misma hora|mismo usuario)\\b/i;
const RENDER_SPECULATIVE_RECOMMENDATION_PATTERN = /\\b(?:investigat(?:e|es|ed|ing|ion)|explor(?:e|es|ed|ing|ation)|document(?:ar|e|es|ed|ing|ation)|clarif(?:y|ies|ied|ying)|evaluat(?:e|es|ed|ing|ion)|confirm(?:s|ed|ing|ation)?|determin(?:e|es|ed|ing|ation)|investigar|explorar|documentar|aclarar|evaluar|confirmar|determinar|ecosystem|workflow|purpose|context)\\b/i;'''
if composer_constants_anchor not in composer:
    raise SystemExit("v4f composer constants anchor missing")
composer = composer.replace(composer_constants_anchor, composer_constants_new, 1)

old_grounded_tail = '''    const groundedDifferences =
        groundedNaturalEvidenceTexts(
            observation?.comparison?.differences,
            verifiedValues
        );
    const groundedRecommendations =
        groundedNaturalEvidenceTexts(
            observation?.recommendations,
            verifiedValues
        );'''
new_grounded_tail = '''    const groundedDifferences =
        groundedNaturalEvidenceTexts(
            observation?.comparison?.differences,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value)
            );
    const groundedRecommendations =
        groundedNaturalEvidenceTexts(
            observation?.recommendations,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value) &&
                !RENDER_SPECULATIVE_RECOMMENDATION_PATTERN.test(value)
            );'''
if old_grounded_tail not in composer:
    raise SystemExit("v4f composer filter anchor missing")
composer = composer.replace(old_grounded_tail, new_grounded_tail, 1)

mission_helper_anchor = '''function trustedCalls(calls = [], mission) {'''
mission_helper = '''function mediaOnlyRequiredContractSatisfied(mission = {}) {
    const required = Array.isArray(mission?.requiredToolNames)
        ? mission.requiredToolNames
        : [];
    if (
        required.length !== 1 ||
        required[0] !== "media.analyze"
    ) {
        return false;
    }
    const completed = new Set(
        (Array.isArray(mission?.completedTasks)
            ? mission.completedTasks
            : [])
            .map(item => item?.name)
            .filter(Boolean)
    );
    const blocked = new Set(
        (Array.isArray(mission?.blockedTasks)
            ? mission.blockedTasks
            : [])
            .map(item => item?.name)
            .filter(Boolean)
    );
    return completed.has("media.analyze") &&
        !blocked.has("media.analyze");
}

'''
if mission_helper_anchor not in mission:
    raise SystemExit("v4f mission helper anchor missing")
mission = mission.replace(mission_helper_anchor, mission_helper + mission_helper_anchor, 1)

old_pending_zero = '''        if (mission.pendingTasks.length === 0) {
            let plan;'''
new_pending_zero = '''        if (mission.pendingTasks.length === 0) {
            if (mediaOnlyRequiredContractSatisfied(mission)) {
                mission.contractMissingTools = [];
                mission.reason = "ALL_EXECUTABLE_TASKS_COMPLETED";
                break;
            }

            let plan;'''
if old_pending_zero not in mission:
    raise SystemExit("v4f mission completion anchor missing")
mission = mission.replace(old_pending_zero, new_pending_zero, 1)

media_path.write_text(media, encoding="utf-8")
composer_path.write_text(composer, encoding="utf-8")
mission_path.write_text(mission, encoding="utf-8")

if 'test("production removes capture-context comparisons and speculative recommendations after repair", async () => {' not in media_tests:
    media_tests += r'''


test("production removes capture-context comparisons and speculative recommendations after repair", async () => {
    let calls = 0;
    const payload = {
        sources: [
            {
                sourceId: "SOURCE_1",
                fileName: "one.png",
                mimeType: "image/png",
                description: "Interfaz con menu abierto.",
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
            },
            {
                sourceId: "SOURCE_2",
                fileName: "two.png",
                mimeType: "image/png",
                description: "Interfaz con panel lateral visible.",
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
            differences: [
                "Source 2 contains a code-like output on the right side, which is absent in Source 1.",
                "Both images show the same date and time in the system tray, suggesting they were captured around the same time."
            ],
            confidence: 0.9
        },
        recommendations: [
            "Ensure consistency in UI/UX if these two interfaces are part of a larger ecosystem or user workflow."
        ]
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
                { name: "one.png", mimeType: "image/png", dataBase64: Buffer.from("one-v4f").toString("base64") },
                { name: "two.png", mimeType: "image/png", dataBase64: Buffer.from("two-v4f").toString("base64") }
            ],
            question: "Compara solamente diferencias visuales relevantes."
        }
    });

    assert.equal(calls, 2);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(result.precisionSanitized, true);
    assert.deepEqual(result.comparison.differences, [
        "Source 2 contains a code-like output on the right side, which is absent in Source 1."
    ]);
    assert.deepEqual(result.recommendations, []);
    assert.doesNotMatch(JSON.stringify(result), /same date and time|system tray|ecosystem|user workflow/i);
});
'''

if 'test("precision renderer removes capture-context claims and speculative recommendations with no verified literals", async () => {' not in composer_tests:
    composer_tests += r'''


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
'''

if 'test("media-only required mission closes immediately after successful media analysis without replanning", async () => {' not in mission_tests:
    mission_tests += r'''


test("media-only required mission closes immediately after successful media analysis without replanning", async () => {
    let plannerCalls = 0;
    const executed = [];
    const mission = await runJarvisMission({
        instruction: "Analiza comparativamente estas dos capturas.",
        initialToolCalls: [{
            name: "media.analyze",
            args: { attachments: [{ name: "one.png" }, { name: "two.png" }] }
        }],
        requiredToolNames: ["media.analyze"],
        planner: async () => {
            plannerCalls += 1;
            return {
                toolCalls: [{ name: "system.certify", args: { deep: true } }],
                missionComplete: false
            };
        },
        execute: async call => {
            executed.push(call.name);
            return {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 2,
                receivedSources: 2,
                sources: [
                    { sourceId: "SOURCE_1", fileName: "one.png", sha256: "1".repeat(64), visibleData: [] },
                    { sourceId: "SOURCE_2", fileName: "two.png", sha256: "2".repeat(64), visibleData: [] }
                ],
                precisionAudit: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                    effectiveToolExecutions: 1,
                    sourceIdentityVerified: true
                }
            };
        },
        storage: memoryStorage()
    });

    assert.deepEqual(executed, ["media.analyze"]);
    assert.equal(plannerCalls, 0);
    assert.equal(mission.status, "COMPLETED");
    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.deepEqual(mission.completedTasks.map(item => item.name), ["media.analyze"]);
    assert.deepEqual(mission.contractMissingTools, []);
});
'''

media_test_path.write_text(media_tests, encoding="utf-8")
composer_test_path.write_text(composer_tests, encoding="utf-8")
mission_test_path.write_text(mission_tests, encoding="utf-8")
