from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise AssertionError(f"{label} anchor missing")
    return text.replace(old, new, 1)


pack_path = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
pack = pack_path.read_text(encoding="utf-8")

if "MEDIA_UNSUPPORTED_CONTRADICTION_META_PATTERN" not in pack:
    anchor = "function mediaNarrativeContainsUngroundedUpperUiLiteral(\n"
    constants = """const MEDIA_UNSUPPORTED_CONTRADICTION_META_PATTERN = /\\b(?:contradict(?:s|ed|ing)?|contradiction|inconsisten(?:cy|t))\\b/i;
const MEDIA_CAPTURE_CONTEXT_CLAIM_PATTERN = /\\b(?:same date(?: and time)?|same time|system tray|captured (?:at|around) the same time|same user|misma fecha(?: y hora)?|misma hora|bandeja del sistema|capturad[oa]s? (?:a|alrededor de) la misma hora|mismo usuario)\\b/i;
const MEDIA_CAPTURE_CONTEXT_REQUEST_PATTERN = /\\b(?:system tray|bandeja del sistema|fecha|hora|date|time|reloj|clock|usuario|user)\\b/i;

"""
    pack = replace_once(pack, anchor, constants + anchor, "pack constants")

if "function mediaNarrativeContainsUnsupportedContradictionClaim" not in pack:
    anchor = "function sanitizeNarrativeAgainstVerifiedValues(value, verifiedValues = []) {\n"
    helpers = """function mediaNarrativeContainsUnsupportedContradictionClaim(
    value,
    verifiedValues = []
) {
    if (value == null) return false;
    if (typeof value === \"string\") {
        if (!MEDIA_UNSUPPORTED_CONTRADICTION_META_PATTERN.test(value)) {
            return false;
        }
        const normalizedNarrative = normalizeMediaContractLiteral(value);
        const groundedMentions = new Set(
            verifiedValues.filter(verified =>
                verified.length >= 3 &&
                normalizedNarrative.includes(verified)
            )
        );
        return groundedMentions.size < 2;
    }
    if (Array.isArray(value)) {
        return value.some(item =>
            mediaNarrativeContainsUnsupportedContradictionClaim(
                item,
                verifiedValues
            )
        );
    }
    if (typeof value !== \"object\") return false;
    return Object.values(value).some(item =>
        mediaNarrativeContainsUnsupportedContradictionClaim(
            item,
            verifiedValues
        )
    );
}

function mediaNarrativeContainsUnrequestedCaptureContextClaim(
    value,
    question = \"\"
) {
    if (value == null) return false;
    if (MEDIA_CAPTURE_CONTEXT_REQUEST_PATTERN.test(String(question || \"\"))) {
        return false;
    }
    if (typeof value === \"string\") {
        return MEDIA_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value);
    }
    if (Array.isArray(value)) {
        return value.some(item =>
            mediaNarrativeContainsUnrequestedCaptureContextClaim(
                item,
                question
            )
        );
    }
    if (typeof value !== \"object\") return false;
    return Object.values(value).some(item =>
        mediaNarrativeContainsUnrequestedCaptureContextClaim(
            item,
            question
        )
    );
}

"""
    pack = replace_once(pack, anchor, helpers + anchor, "pack helpers")

if "let suppressedPeripheralNarrativeCount = 0;" not in pack:
    pack = replace_once(
        pack,
        "    let suppressedUnsupportedNegativeVisualClaimCount = 0;\n\n",
        "    let suppressedUnsupportedNegativeVisualClaimCount = 0;\n    let suppressedPeripheralNarrativeCount = 0;\n\n",
        "pack counters"
    )

if "const sanitizeSourceNarrative = value =>" not in pack:
    old = """        const verifiedValues = verifiedMediaContractValues([{ visibleData }]);
        const uncertainty = sanitizeNarrativeAgainstVerifiedValues(
            source?.uncertainty,
            verifiedValues
        );
"""
    new = """        const verifiedValues = verifiedMediaContractValues([{ visibleData }]);
        const sanitizeSourceNarrative = value =>
            sanitizeNarrativeAgainstVerifiedValues(
                value,
                verifiedValues
            ).filter(item => {
                const unsupportedNarrativeClaim =
                    audited?.strictVisualOnly === true &&
                    (
                        mediaNarrativeContainsUnsupportedNegativeVisualClaim(
                            item,
                            verifiedValues
                        ) ||
                        mediaNarrativeContainsUnsupportedContradictionClaim(
                            item,
                            verifiedValues
                        )
                    );
                if (unsupportedNarrativeClaim) {
                    suppressedUnsupportedNegativeVisualClaimCount += 1;
                    return false;
                }
                const peripheralCaptureContext =
                    audited?.strictVisualOnly === true &&
                    mediaNarrativeContainsUnrequestedCaptureContextClaim(
                        item,
                        question
                    );
                if (peripheralCaptureContext) {
                    suppressedPeripheralNarrativeCount += 1;
                    return false;
                }
                return true;
            });
        const uncertainty = sanitizeSourceNarrative(source?.uncertainty);
"""
    pack = replace_once(pack, old, new, "pack local source sanitizer")

if "objects:\n                sanitizeSourceNarrative(source?.objects)" not in pack:
    old = """            observations:
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
"""
    new = """            observations:
                sanitizeSourceNarrative(source?.observations),
            objects:
                sanitizeSourceNarrative(source?.objects),
            inferences:
                audited?.strictVisualOnly === true
                    ? []
                    : sanitizeSourceNarrative(source?.inferences),
            visibleData,
            pages:
                sanitizeSourceNarrative(source?.pages),
            marketingUse:
                sanitizeSourceNarrative(source?.marketingUse),
            uncertainty: [...new Set(uncertainty)],
            evidence:
                sanitizeSourceNarrative(source?.evidence)
"""
    pack = replace_once(pack, old, new, "pack source fields")

if "sourceNarrativeClaimsRequireStructuredEvidence" not in pack:
    pack = replace_once(
        pack,
        """                independentPassLiteralConsensusRequired: true,
                peripheralSensitiveLiteralSuppression: true,
                negativeVisualClaimsRequireStructuredEvidence: true
""",
        """                independentPassLiteralConsensusRequired: true,
                peripheralSensitiveLiteralSuppression: true,
                negativeVisualClaimsRequireStructuredEvidence: true,
                sourceNarrativeClaimsRequireStructuredEvidence: true,
                peripheralCaptureContextNarrativeSuppression: true
""",
        "pack policy"
    )

if "suppressedUnsupportedNegativeVisualClaimCount,\n        suppressedPeripheralNarrativeCount" not in pack:
    pack = replace_once(
        pack,
        """        disputedLiteralCount,
        suppressedPeripheralLiteralCount,
        suppressedUnsupportedNegativeVisualClaimCount
""",
        """        disputedLiteralCount,
        suppressedPeripheralLiteralCount,
        suppressedUnsupportedNegativeVisualClaimCount,
        suppressedPeripheralNarrativeCount
""",
        "pack return counters"
    )

if "suppressedPeripheralNarrativeCount:\n                reconciled.suppressedPeripheralNarrativeCount" not in pack:
    pack = replace_once(
        pack,
        """            suppressedUnsupportedNegativeVisualClaimCount:
                reconciled.suppressedUnsupportedNegativeVisualClaimCount,
            negativeVisualClaimsRequireStructuredEvidence: true,
""",
        """            suppressedUnsupportedNegativeVisualClaimCount:
                reconciled.suppressedUnsupportedNegativeVisualClaimCount,
            suppressedPeripheralNarrativeCount:
                reconciled.suppressedPeripheralNarrativeCount,
            negativeVisualClaimsRequireStructuredEvidence: true,
            sourceNarrativeClaimsRequireStructuredEvidence: true,
""",
        "pack audit counters"
    )

pack_path.write_text(pack, encoding="utf-8")

composer_path = Path("gestia-core/jarvis/jarvis.conversation.composer.js")
composer = composer_path.read_text(encoding="utf-8")

if "RENDER_UNSUPPORTED_CONTRADICTION_META_PATTERN" not in composer:
    anchor = "const RENDER_SPECULATIVE_RECOMMENDATION_PATTERN = "
    idx = composer.find(anchor)
    if idx < 0:
        raise AssertionError("composer contradiction constant anchor missing")
    composer = (
        composer[:idx] +
        "const RENDER_UNSUPPORTED_CONTRADICTION_META_PATTERN = /\\b(?:contradict(?:s|ed|ing)?|contradiction|inconsisten(?:cy|t))\\b/i;\n" +
        composer[idx:]
    )

if "function renderContainsUnsupportedSourceNarrativeClaim" not in composer:
    anchor = "function groundedNaturalEvidenceTexts(items = [], verifiedValues = []) {\n"
    helpers = """function renderContainsUnsupportedContradictionClaim(
    value,
    verifiedValues = []
) {
    const narrative = String(value || \"\");
    if (!RENDER_UNSUPPORTED_CONTRADICTION_META_PATTERN.test(narrative)) {
        return false;
    }
    const normalizedNarrative = normalizedGroundedLiteral(narrative);
    const groundedMentions = new Set(
        verifiedValues.filter(verified =>
            verified.length >= 3 &&
            normalizedNarrative.includes(verified)
        )
    );
    return groundedMentions.size < 2;
}

function renderContainsUnsupportedSourceNarrativeClaim(
    value,
    verifiedValues = []
) {
    return (
        renderContainsUnsupportedNegativeLiteralClaim(
            value,
            verifiedValues
        ) ||
        renderContainsUnsupportedContradictionClaim(
            value,
            verifiedValues
        )
    );
}

"""
    composer = replace_once(composer, anchor, helpers + anchor, "composer helpers")

if "!renderContainsUnsupportedSourceNarrativeClaim(\n                    value,\n                    verifiedValues\n                )\n            );\n\n        lines.push" not in composer:
    old = """        const objects = groundedNaturalEvidenceTexts(
            source?.objects,
            verifiedValues
        );
        const observations = groundedNaturalEvidenceTexts(
            source?.observations,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CONVERSATION_TRANSCRIPT_PATTERN.test(value)
            );
"""
    new = """        const objects = groundedNaturalEvidenceTexts(
            source?.objects,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value) &&
                !renderContainsUnsupportedSourceNarrativeClaim(
                    value,
                    verifiedValues
                )
            );
        const observations = groundedNaturalEvidenceTexts(
            source?.observations,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CONVERSATION_TRANSCRIPT_PATTERN.test(value) &&
                !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value) &&
                !renderContainsUnsupportedSourceNarrativeClaim(
                    value,
                    verifiedValues
                )
            );
"""
    composer = replace_once(composer, old, new, "composer source narrative")

if "source?.uncertainty,\n                verifiedValues\n            )\n                .filter" not in composer:
    old = """            groundedNaturalEvidenceTexts(
                source?.uncertainty,
                verifiedMediaLiteralValues(observation, source)
            )
"""
    new = """            groundedNaturalEvidenceTexts(
                source?.uncertainty,
                verifiedValues
            )
                .filter(value =>
                    !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value) &&
                    !renderContainsUnsupportedSourceNarrativeClaim(
                        value,
                        verifiedValues
                    )
                )
"""
    composer = replace_once(composer, old, new, "composer uncertainty")

composer_path.write_text(composer, encoding="utf-8")

producer_test_path = Path("tests/v94-media-browser-precision-contract.test.mjs")
producer_test = producer_test_path.read_text(encoding="utf-8").rstrip()
if "production A2 removes unsupported source-local contradiction residue" not in producer_test:
    producer_test += r'''


test("production A2 removes unsupported source-local contradiction residue", () => {
    const initial = baseResult();
    const audited = baseResult();
    const source1Items = [
        { kind: "text", value: "Añadir fotos y archivos", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
        { kind: "text", value: "Canva", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" }
    ];
    const source2Items = [
        { kind: "text", value: "Añadir fotos y archivos", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
        { kind: "text", value: "Crear una imagen", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
        { kind: "text", value: "Búsqueda en Internet", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" }
    ];
    initial.sources[0].visibleData = source1Items;
    audited.sources[0].visibleData = source1Items;
    initial.sources[1].visibleData = source2Items;
    audited.sources[1].visibleData = source2Items;
    audited.sources[1].observations = [
        "An attachment-like menu is open, displaying options: 'Añadir fotos y archivos', 'Crear una imagen', and 'Búsqueda en Internet'.",
        "This statement directly contradicts the visible attachment menu in the same image."
    ];
    audited.sources[1].uncertainty = [
        "The contradiction between the visible attachment menu and the text stating its absence is a notable inconsistency."
    ];
    audited.sources[1].evidence = [
        "The system tray date and time are clearly visible and match the other image."
    ];

    const reconciled = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara los menus de adjuntos visibles."
    );

    assert.deepEqual(
        reconciled.result.sources[1].observations,
        ["An attachment-like menu is open, displaying options: 'Añadir fotos y archivos', 'Crear una imagen', and 'Búsqueda en Internet'."]
    );
    assert.deepEqual(reconciled.result.sources[1].uncertainty, []);
    assert.deepEqual(reconciled.result.sources[1].evidence, []);
    assert.equal(reconciled.suppressedUnsupportedNegativeVisualClaimCount, 2);
    assert.equal(reconciled.suppressedPeripheralNarrativeCount, 1);
    assert.equal(reconciled.result.policy.sourceNarrativeClaimsRequireStructuredEvidence, true);
    assert.doesNotMatch(
        JSON.stringify(reconciled.result),
        /directly contradicts|text stating its absence|system tray date and time/i
    );
});'''
producer_test_path.write_text(producer_test + "\n", encoding="utf-8")

renderer_test_path = Path("tests/jarvis-conversation-composer.test.mjs")
renderer_test = renderer_test_path.read_text(encoding="utf-8").rstrip()
if "precision renderer suppresses source-local contradiction residue from production A2" not in renderer_test:
    renderer_test += r'''


test("precision renderer suppresses source-local contradiction residue from production A2", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara los menus de adjuntos visibles.",
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
                        fileName: "chat-gpt-aduntos-1.png",
                        sha256: "a".repeat(64),
                        observations: ["An attachment menu is actively open and expanded, revealing multiple options."],
                        visibleData: [
                            { kind: "text", value: "Añadir fotos y archivos", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
                            { kind: "text", value: "Canva", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" }
                        ],
                        uncertainty: []
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "terminal-adjunto-1.png",
                        sha256: "b".repeat(64),
                        observations: [
                            "An attachment-like menu is open, displaying options: 'Añadir fotos y archivos', 'Crear una imagen', and 'Búsqueda en Internet'.",
                            "This statement directly contradicts the visible attachment menu in the same image."
                        ],
                        visibleData: [
                            { kind: "text", value: "Añadir fotos y archivos", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
                            { kind: "text", value: "Crear una imagen", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
                            { kind: "text", value: "Búsqueda en Internet", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" }
                        ],
                        uncertainty: [
                            "The contradiction between the visible attachment menu and the text stating its absence is a notable inconsistency."
                        ]
                    }
                ],
                comparison: { differences: [], confidence: 1 },
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
    assert.match(result.text, /attachment-like menu is open/i);
    assert.match(result.text, /Crear una imagen/);
    assert.doesNotMatch(result.text, /directly contradicts|text stating its absence|notable inconsistency/i);
});'''
renderer_test_path.write_text(renderer_test + "\n", encoding="utf-8")
