from pathlib import Path

media_path = Path("functions/jarvis-media-analysis.js")
media = media_path.read_text(encoding="utf-8")

old_helpers = r'''function containsSensitiveNarrativeLiteral(value) {
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

new_helpers = r'''function normalizeSensitiveLiteral(value = "") {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[),.;!?]+$/g, "");
}

function extractSensitiveNarrativeLiterals(value = "") {
    const pattern = new RegExp(
        SENSITIVE_NARRATIVE_LITERAL_PATTERN.source,
        "gi"
    );
    return Array.from(
        String(value || "").matchAll(pattern),
        match => String(match?.[0] || "").trim()
    ).filter(Boolean);
}

function verifiedVisibleLiteralValues(sources = []) {
    const values = [];

    for (const source of Array.isArray(sources) ? sources : []) {
        for (const item of Array.isArray(source?.visibleData) ? source.visibleData : []) {
            const value = String(item?.value || "").trim();
            const evidence = String(item?.evidence || "").trim();
            const legibility = String(item?.legibility || "").trim().toUpperCase();
            const confidence = Number(item?.confidence || 0);

            if (
                value &&
                evidence &&
                legibility === "VERIFIED" &&
                confidence >= 0.98
            ) {
                values.push(normalizeSensitiveLiteral(value));
            }
        }
    }

    return [...new Set(values.filter(Boolean))];
}

function containsUnverifiedSensitiveNarrativeLiteral(value, verifiedValues = []) {
    if (value == null) return false;

    if (typeof value === "string") {
        const literals = extractSensitiveNarrativeLiterals(value);
        return literals.some(literal => {
            const candidate = normalizeSensitiveLiteral(literal);
            if (!candidate) return false;
            return !verifiedValues.some(verified =>
                verified === candidate ||
                verified.includes(candidate)
            );
        });
    }

    if (Array.isArray(value)) {
        return value.some(item =>
            containsUnverifiedSensitiveNarrativeLiteral(
                item,
                verifiedValues
            )
        );
    }

    if (typeof value !== "object") return false;

    return Object.values(value).some(item =>
        containsUnverifiedSensitiveNarrativeLiteral(
            item,
            verifiedValues
        )
    );
}

function assertNoSensitiveNarrativeLiteralLeaks(parsed, files, sources) {
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

if "function verifiedVisibleLiteralValues" not in media:
    assert old_helpers in media, "precision helper anchor not found"
    media = media.replace(old_helpers, new_helpers, 1)

media_path.write_text(media, encoding="utf-8")

media_test_path = Path("tests/jarvis-media-analysis.test.cjs")
media_test = media_test_path.read_text(encoding="utf-8")
marker = 'test("production permits sensitive narrative literals only when grounded in verified visibleData"'

if marker not in media_test:
    media_test += r'''

test("production permits sensitive narrative literals only when grounded in verified visibleData", async () => {
    let calls = 0;
    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async () => {
                    calls += 1;
                    return {
                        text: JSON.stringify({
                            sources: [{
                                sourceId: "SOURCE_1",
                                fileName: "terminal.png",
                                mimeType: "image/png",
                                description: "La barra inferior muestra 07/08/2026 y 10:03.",
                                observations: [
                                    "La fecha visible es 07/08/2026.",
                                    "La hora visible es 10:03."
                                ],
                                inferences: [],
                                objects: ["Una interfaz web con barra inferior visible."],
                                composition: {},
                                visibleData: [
                                    {
                                        kind: "date",
                                        value: "07/08/2026",
                                        page: 1,
                                        confidence: 0.99,
                                        evidence: "Esquina inferior derecha de la captura.",
                                        legibility: "VERIFIED"
                                    },
                                    {
                                        kind: "time",
                                        value: "10:03",
                                        page: 1,
                                        confidence: 0.99,
                                        evidence: "Esquina inferior derecha de la captura.",
                                        legibility: "VERIFIED"
                                    }
                                ],
                                pages: [],
                                marketingUse: [],
                                quality: {},
                                uncertainty: [],
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

    assert.equal(calls, 1);
    assert.equal(result.repairCount, 0);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(result.sources[0].visibleData[0].value, "07/08/2026");
    assert.equal(result.sources[0].visibleData[1].value, "10:03");
});
'''

media_test_path.write_text(media_test, encoding="utf-8")
