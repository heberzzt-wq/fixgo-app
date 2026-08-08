from pathlib import Path

pack_path = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
pack = pack_path.read_text(encoding="utf-8")

anchor = '''function sanitizeNarrativeAgainstVerifiedValues(value, verifiedValues = []) {
    if (!Array.isArray(value)) return [];
    return value.filter(item =>
        !mediaContractContainsUngroundedLiteral(item, verifiedValues) &&
        !mediaNarrativeContainsUngroundedUpperUiLiteral(item, verifiedValues)
    );
}
'''
replacement = '''function sanitizeNarrativeAgainstVerifiedValues(value, verifiedValues = []) {
    if (!Array.isArray(value)) return [];
    return value.filter(item =>
        !mediaContractContainsUngroundedLiteral(item, verifiedValues) &&
        !mediaNarrativeContainsUngroundedUpperUiLiteral(item, verifiedValues)
    );
}

const MEDIA_STRICT_VISUAL_SEMANTIC_INFERENCE_PATTERN = /\\b(?:custom application|aplicaci[oó]n personalizada|self[- ]referential|autorreferencial|text generation|generation logic|display logic|enhance its utility|capabilities? of|likely|appears to be|seems to be)\\b/i;

function sanitizeStrictVisualNarrative(
    value,
    verifiedValues = [],
    strictVisualOnly = false
) {
    return sanitizeNarrativeAgainstVerifiedValues(
        value,
        verifiedValues
    ).filter(item =>
        !strictVisualOnly ||
        !MEDIA_STRICT_VISUAL_SEMANTIC_INFERENCE_PATTERN.test(
            String(item || "")
        )
    );
}

function explicitVisualRecommendationRequest(question = "") {
    const normalized = String(question || "")
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toLowerCase();
    return /\\b(?:recomienda|recomendacion(?:es)?|sugiere|sugerencia(?:s)?|mejora(?:s)?|propon(?:e|er|ga)|recommend|recommendation(?:s)?|suggest|suggestion(?:s)?|improve|improvement(?:s)?)\\b/i.test(normalized);
}
'''
if anchor not in pack:
    raise SystemExit("v4o sanitizer anchor missing")
pack = pack.replace(anchor, replacement, 1)

old_source = '''            observations:
                sanitizeNarrativeAgainstVerifiedValues(
                    source?.observations,
                    verifiedValues
                ),
            inferences:
                audited?.strictVisualOnly === true
                    ? []
                    : sanitizeNarrativeAgainstVerifiedValues(
                        source?.inferences,
                        verifiedValues
                    ),
            visibleData,
            uncertainty: [...new Set(uncertainty)],
            evidence:
                sanitizeNarrativeAgainstVerifiedValues(
                    source?.evidence,
                    verifiedValues
                )
'''
new_source = '''            observations:
                sanitizeStrictVisualNarrative(
                    source?.observations,
                    verifiedValues,
                    audited?.strictVisualOnly === true
                ),
            inferences:
                audited?.strictVisualOnly === true
                    ? []
                    : sanitizeStrictVisualNarrative(
                        source?.inferences,
                        verifiedValues,
                        false
                    ),
            visibleData,
            uncertainty: [...new Set(uncertainty)],
            evidence:
                audited?.strictVisualOnly === true
                    ? []
                    : sanitizeStrictVisualNarrative(
                        source?.evidence,
                        verifiedValues,
                        false
                    )
'''
if old_source not in pack:
    raise SystemExit("v4o source narrative anchor missing")
pack = pack.replace(old_source, new_source, 1)

old_global = '''    const globalVerifiedValues = verifiedMediaContractValues(sources);
    const comparison = audited?.comparison && typeof audited.comparison === "object"
        ? {
            ...audited.comparison,
            differences:
                sanitizeNarrativeAgainstVerifiedValues(
                    audited.comparison?.differences,
                    globalVerifiedValues
                )
        }
        : audited?.comparison;
    const recommendations = sanitizeNarrativeAgainstVerifiedValues(
        audited?.recommendations,
        globalVerifiedValues
    );
'''
new_global = '''    const globalVerifiedValues = verifiedMediaContractValues(sources);
    const strictVisualOnly = audited?.strictVisualOnly === true;
    const comparison = audited?.comparison && typeof audited.comparison === "object"
        ? {
            ...audited.comparison,
            differences:
                sanitizeStrictVisualNarrative(
                    audited.comparison?.differences,
                    globalVerifiedValues,
                    strictVisualOnly
                )
        }
        : audited?.comparison;
    const recommendations =
        strictVisualOnly &&
        !explicitVisualRecommendationRequest(question)
            ? []
            : sanitizeStrictVisualNarrative(
                audited?.recommendations,
                globalVerifiedValues,
                strictVisualOnly
            );
'''
if old_global not in pack:
    raise SystemExit("v4o global narrative anchor missing")
pack = pack.replace(old_global, new_global, 1)

old_policy = '''                independentPassLiteralConsensusRequired: true,
                peripheralSensitiveLiteralSuppression: true
'''
new_policy = '''                independentPassLiteralConsensusRequired: true,
                peripheralSensitiveLiteralSuppression: true,
                strictVisualFreeformEvidenceSuppressed: true,
                strictVisualSemanticInferenceSuppressed: true,
                strictVisualUnrequestedRecommendationsSuppressed: true
'''
if old_policy not in pack:
    raise SystemExit("v4o policy anchor missing")
pack = pack.replace(old_policy, new_policy, 1)
pack_path.write_text(pack, encoding="utf-8")

# Append regression coverage to the browser precision contract test.
test_path = Path("tests/v94-media-browser-precision-contract.test.mjs")
test_text = test_path.read_text(encoding="utf-8")
marker = 'test("strict visual scope suppresses unrequested recommendations and freeform semantic evidence"'
if marker not in test_text:
    test_text += r'''


test("strict visual scope suppresses unrequested recommendations and freeform semantic evidence", () => {
    const initial = baseResult();
    const audited = baseResult();
    const chatLabel = {
        kind: "text",
        value: "ChatGPT Plus",
        page: 1,
        confidence: 1,
        evidence: "header",
        legibility: "VERIFIED"
    };
    const terminalLabel = {
        kind: "text",
        value: "Terminal Heberto",
        page: 1,
        confidence: 1,
        evidence: "header",
        legibility: "VERIFIED"
    };
    initial.sources[0].visibleData = [chatLabel];
    audited.sources[0].visibleData = [chatLabel];
    initial.sources[1].visibleData = [terminalLabel];
    audited.sources[1].visibleData = [terminalLabel];
    audited.sources[1].evidence = [
        "The screenshot clearly shows the Terminal Heberto interface with self-referential text."
    ];
    audited.comparison = {
        differences: [
            "The first image shows ChatGPT Plus, while the second shows a custom application named 'Terminal Heberto'.",
            "ChatGPT Plus and 'Terminal Heberto' show different visible headings."
        ]
    };
    audited.recommendations = [
        "Review the text generation or display logic within 'Terminal Heberto'.",
        "Consider expanding the capabilities of 'Terminal Heberto'."
    ];

    const reconciled = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Analiza solamente lo visible. Al final compara únicamente diferencias visuales demostrables."
    );

    assert.deepEqual(reconciled.result.sources[1].evidence, []);
    assert.deepEqual(reconciled.result.recommendations, []);
    assert.equal(reconciled.result.comparison.differences.length, 1);
    assert.match(reconciled.result.comparison.differences[0], /different visible headings/i);
    assert.doesNotMatch(JSON.stringify(reconciled.result), /custom application|self-referential|text generation|expanding the capabilities/i);
    assert.equal(reconciled.result.policy.strictVisualFreeformEvidenceSuppressed, true);
    assert.equal(reconciled.result.policy.strictVisualSemanticInferenceSuppressed, true);
    assert.equal(reconciled.result.policy.strictVisualUnrequestedRecommendationsSuppressed, true);
});


test("strict visual scope keeps grounded recommendations only when the user explicitly requests improvements", () => {
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
    audited.recommendations = [
        "Mejora la jerarquia visual alrededor de 'Terminal Heberto'."
    ];

    const reconciled = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara lo visible y sugiere mejoras visuales concretas."
    );

    assert.deepEqual(
        reconciled.result.recommendations,
        ["Mejora la jerarquia visual alrededor de 'Terminal Heberto'."]
    );
});
'''
    test_path.write_text(test_text, encoding="utf-8")
