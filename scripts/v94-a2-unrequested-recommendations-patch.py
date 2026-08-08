from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)


pack_path = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
pack = pack_path.read_text(encoding="utf-8")

helper_anchor = '''function mediaNarrativeContainsUnrequestedCaptureContextClaim(
    value,
    question = ""
) {
'''
helper = '''function explicitMediaRecommendationRequest(question = "") {
    return /\\b(?:recomienda|recomendar|recomendaci(?:o|ó)n(?:es)?|sugiere|sugerir|sugerencias?|mejoras?|mejorar|proponer|propuestas?|recommend|recommendation|suggest|suggestion|improve|improvement)\\b/i
        .test(String(question || ""));
}

function mediaNarrativeContainsUnrequestedCaptureContextClaim(
    value,
    question = ""
) {
'''
pack = replace_once(pack, helper_anchor, helper, "recommendation request helper")

counter_anchor = '''    let suppressedUnsupportedNegativeVisualClaimCount = 0;
    let suppressedPeripheralNarrativeCount = 0;
'''
counter_new = '''    let suppressedUnsupportedNegativeVisualClaimCount = 0;
    let suppressedPeripheralNarrativeCount = 0;
    let suppressedUnrequestedRecommendationCount = 0;
'''
pack = replace_once(pack, counter_anchor, counter_new, "recommendation counter")

recommendation_anchor = '''    const recommendations = sanitizeNarrativeAgainstVerifiedValues(
        audited?.recommendations,
        globalVerifiedValues
    );
'''
recommendation_new = '''    const groundedRecommendations = sanitizeNarrativeAgainstVerifiedValues(
        audited?.recommendations,
        globalVerifiedValues
    );
    const suppressUnrequestedRecommendations =
        audited?.strictVisualOnly === true &&
        !explicitMediaRecommendationRequest(question);
    if (suppressUnrequestedRecommendations) {
        suppressedUnrequestedRecommendationCount = groundedRecommendations.length;
    }
    const recommendations = suppressUnrequestedRecommendations
        ? []
        : groundedRecommendations;
'''
pack = replace_once(pack, recommendation_anchor, recommendation_new, "recommendation reconciliation")

policy_anchor = '''                sourceNarrativeClaimsRequireStructuredEvidence: true,
                peripheralCaptureContextNarrativeSuppression: true
'''
policy_new = '''                sourceNarrativeClaimsRequireStructuredEvidence: true,
                peripheralCaptureContextNarrativeSuppression: true,
                strictVisualUnrequestedRecommendationsSuppressed: true
'''
pack = replace_once(pack, policy_anchor, policy_new, "recommendation policy")

return_anchor = '''        suppressedUnsupportedNegativeVisualClaimCount,
        suppressedPeripheralNarrativeCount
'''
return_new = '''        suppressedUnsupportedNegativeVisualClaimCount,
        suppressedPeripheralNarrativeCount,
        suppressedUnrequestedRecommendationCount
'''
pack = replace_once(pack, return_anchor, return_new, "recommendation metric return")

audit_anchor = '''        "En recommendations enumera carencias concretas de la experiencia de adjuntos que puedan comprobarse por contraste visual.",
        "No uses recommendations para proponer investigar, explorar o documentar; si no hay evidencia visual suficiente, dilo expresamente.",
'''
audit_new = '''        explicitMediaRecommendationRequest(question)
            ? "La solicitud original pide recomendaciones: en recommendations incluye solo mejoras respaldadas directamente por evidencia visual verificada."
            : "La solicitud original no pide recomendaciones: deja recommendations=[] y no propongas mejoras, matrices, comparativas futuras ni acciones de producto.",
'''
pack = replace_once(pack, audit_anchor, audit_new, "audit recommendation instruction")

precision_anchor = '''            suppressedPeripheralNarrativeCount:
                reconciled.suppressedPeripheralNarrativeCount,
            negativeVisualClaimsRequireStructuredEvidence: true,
'''
precision_new = '''            suppressedPeripheralNarrativeCount:
                reconciled.suppressedPeripheralNarrativeCount,
            suppressedUnrequestedRecommendationCount:
                reconciled.suppressedUnrequestedRecommendationCount,
            negativeVisualClaimsRequireStructuredEvidence: true,
            strictVisualUnrequestedRecommendationsSuppressed: true,
'''
pack = replace_once(pack, precision_anchor, precision_new, "precision recommendation metrics")

pack_path.write_text(pack, encoding="utf-8")

composer_path = Path("gestia-core/jarvis/jarvis.conversation.composer.js")
composer = composer_path.read_text(encoding="utf-8")

renderer_anchor = '''    const groundedRecommendations =
        groundedNaturalEvidenceTexts(
            observation?.recommendations,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value) &&
                !RENDER_SPECULATIVE_RECOMMENDATION_PATTERN.test(value)
            );
'''
renderer_new = '''    const suppressUnrequestedRecommendations =
        observation?.policy?.strictVisualUnrequestedRecommendationsSuppressed === true;
    const groundedRecommendations = suppressUnrequestedRecommendations
        ? []
        : groundedNaturalEvidenceTexts(
            observation?.recommendations,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value) &&
                !RENDER_SPECULATIVE_RECOMMENDATION_PATTERN.test(value)
            );
'''
composer = replace_once(composer, renderer_anchor, renderer_new, "renderer recommendation suppression")

fallback_anchor = '''    if (
        Array.isArray(observation?.recommendations) &&
        observation.recommendations.length > 0 &&
        groundedRecommendations.length === 0
    ) {
'''
fallback_new = '''    if (
        !suppressUnrequestedRecommendations &&
        Array.isArray(observation?.recommendations) &&
        observation.recommendations.length > 0 &&
        groundedRecommendations.length === 0
    ) {
'''
composer = replace_once(composer, fallback_anchor, fallback_new, "renderer recommendation fallback")

composer_path.write_text(composer, encoding="utf-8")

browser_test_path = Path("tests/v94-media-browser-precision-contract.test.mjs")
browser_tests = browser_test_path.read_text(encoding="utf-8").rstrip() + "\n\n"
browser_tests += r'''test("strict visual reconciliation suppresses unrequested recommendations but preserves explicit requests", () => {
    const initial = baseResult();
    const audited = baseResult();
    const source1Label = { kind: "text", value: "ChatGPT Plus", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" };
    const source2Label = { kind: "text", value: "Terminal Heberto", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" };
    initial.sources[0].visibleData = [source1Label];
    audited.sources[0].visibleData = [source1Label];
    initial.sources[1].visibleData = [source2Label];
    audited.sources[1].visibleData = [source2Label];
    audited.recommendations = [
        "If the goal is to compare attachment functionalities, a detailed feature matrix could be created to highlight the specific capabilities and integrations of each platform.",
        "If 'Terminal Heberto' is an internal tool, ensure its attachment capabilities meet the specific needs of its users, potentially by comparing them to widely used external tools like ChatGPT."
    ];

    const passive = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara solamente lo visible."
    );
    assert.deepEqual(passive.result.recommendations, []);
    assert.equal(passive.suppressedUnrequestedRecommendationCount, 2);
    assert.equal(passive.result.policy.strictVisualUnrequestedRecommendationsSuppressed, true);

    const requested = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara lo visible y recomienda mejoras concretas."
    );
    assert.equal(requested.result.recommendations.length, 2);
    assert.equal(requested.suppressedUnrequestedRecommendationCount, 0);
});
'''
browser_test_path.write_text(browser_tests, encoding="utf-8")

composer_test_path = Path("tests/jarvis-conversation-composer.test.mjs")
composer_tests = composer_test_path.read_text(encoding="utf-8").rstrip() + "\n\n"
composer_tests += r'''test("precision renderer hides unrequested recommendations when strict visual policy says so", async () => {
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
'''
composer_test_path.write_text(composer_tests, encoding="utf-8")
