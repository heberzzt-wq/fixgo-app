from pathlib import Path

function_path = Path("functions/jarvis-media-analysis.js")
test_path = Path("tests/jarvis-media-analysis.test.cjs")

source = function_path.read_text(encoding="utf-8")
tests = test_path.read_text(encoding="utf-8")

anchor = '''function assertConcreteVisualRecommendations(parsed, files, sources) {'''
helpers = '''function sanitizePrecisionNarrative(parsed) {
    const sources = Array.isArray(parsed?.sources)
        ? parsed.sources
        : [];
    const verifiedValues =
        verifiedVisibleLiteralValues(sources);
    let removedCount = 0;

    function sanitizeValue(value) {
        if (value == null) return value;

        if (typeof value === "string") {
            if (
                containsUnverifiedSensitiveNarrativeLiteral(
                    value,
                    verifiedValues
                )
            ) {
                removedCount += 1;
                return "";
            }
            return value;
        }

        if (Array.isArray(value)) {
            return value
                .map(item => sanitizeValue(item))
                .filter(item => {
                    if (item == null || item === "") return false;
                    if (Array.isArray(item)) return item.length > 0;
                    if (typeof item === "object") {
                        return Object.keys(item).length > 0;
                    }
                    return true;
                });
        }

        if (typeof value !== "object") return value;

        const sanitized = {};
        for (const [key, item] of Object.entries(value)) {
            const clean = sanitizeValue(item);
            if (clean == null || clean === "") continue;
            if (Array.isArray(clean) && clean.length === 0) {
                sanitized[key] = clean;
                continue;
            }
            sanitized[key] = clean;
        }
        return sanitized;
    }

    const sanitizedSources = sources.map(source => ({
        ...source,
        description: sanitizeValue(source?.description),
        observations: sanitizeValue(source?.observations),
        inferences: sanitizeValue(source?.inferences),
        objects: sanitizeValue(source?.objects),
        composition: sanitizeValue(source?.composition),
        pages: sanitizeValue(source?.pages),
        marketingUse: sanitizeValue(source?.marketingUse),
        quality: sanitizeValue(source?.quality),
        uncertainty: sanitizeValue(source?.uncertainty),
        evidence: sanitizeValue(source?.evidence)
    }));

    const sanitizedRecommendations =
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
        },
        removedCount
    };
}

'''
if anchor not in source:
    raise SystemExit("v4d sanitizer insertion anchor not found")
source = source.replace(anchor, helpers + anchor, 1)

old_loop = '''        try {
            const parsed =
                parseAnalysisJson(text, files);

            const validated =
                validateAnalysis(parsed, files);

            return {
                ...validated,
                analysisMode: "COMBINED",
                combinedAnalysisFailed: false,
                repairCount: repairAttempt,
                provider:
                    String(
                        ai.lastProvider ||
                        (
                            ai?.models?.generateContent
                                ? "gemini-modern"
                                : "gemini-legacy"
                        )
                    ),
                model,
                analyzedAt:
                    new Date().toISOString()
            };
        }
        catch (error) {
            error.repairCount =
                repairAttempt;
            previousOutput =
                text;
            previousError =
                error?.message ||
                "MEDIA_ANALYSIS_VALIDATION_FAILED";

            if (
                repairAttempt < MAX_REPAIR_ATTEMPTS &&
                isRepairableAnalysisError(error)
            ) {
                repairAttempt += 1;
                continue;
            }

            terminalError = error;
            break;
        }'''
new_loop = '''        let parsed = null;

        try {
            parsed =
                parseAnalysisJson(text, files);

            const validated =
                validateAnalysis(parsed, files);

            return {
                ...validated,
                analysisMode: "COMBINED",
                combinedAnalysisFailed: false,
                repairCount: repairAttempt,
                precisionSanitized: false,
                precisionSanitizedCount: 0,
                provider:
                    String(
                        ai.lastProvider ||
                        (
                            ai?.models?.generateContent
                                ? "gemini-modern"
                                : "gemini-legacy"
                        )
                    ),
                model,
                analyzedAt:
                    new Date().toISOString()
            };
        }
        catch (error) {
            error.repairCount =
                repairAttempt;
            previousOutput =
                text;
            previousError =
                error?.message ||
                "MEDIA_ANALYSIS_VALIDATION_FAILED";

            if (
                repairAttempt < MAX_REPAIR_ATTEMPTS &&
                isRepairableAnalysisError(error)
            ) {
                repairAttempt += 1;
                continue;
            }

            const canSanitizePrecisionFailure =
                parsed &&
                new Set([
                    "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
                    "MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION"
                ]).has(error?.message);

            if (canSanitizePrecisionFailure) {
                try {
                    const sanitized =
                        sanitizePrecisionNarrative(parsed);
                    const validated =
                        validateAnalysis(
                            sanitized.parsed,
                            files
                        );

                    return {
                        ...validated,
                        analysisMode:
                            "COMBINED_PRECISION_SANITIZED",
                        combinedAnalysisFailed: false,
                        repairCount: repairAttempt,
                        precisionSanitized: true,
                        precisionSanitizedCount:
                            sanitized.removedCount,
                        provider:
                            String(
                                ai.lastProvider ||
                                (
                                    ai?.models?.generateContent
                                        ? "gemini-modern"
                                        : "gemini-legacy"
                                )
                            ),
                        model,
                        analyzedAt:
                            new Date().toISOString()
                    };
                }
                catch (sanitizationError) {
                    sanitizationError.repairCount =
                        repairAttempt;
                    terminalError =
                        sanitizationError;
                    break;
                }
            }

            terminalError = error;
            break;
        }'''
if old_loop not in source:
    raise SystemExit("v4d run loop anchor not found")
source = source.replace(old_loop, new_loop, 1)

old_policy = '''            conversationContentCannotProveUiCapability: true,
            authenticatedAdminOnly: true'''
new_policy = '''            conversationContentCannotProveUiCapability: true,
            deterministicPrecisionSanitizer: true,
            authenticatedAdminOnly: true'''
if old_policy not in source:
    raise SystemExit("v4d policy anchor not found")
source = source.replace(old_policy, new_policy, 1)

function_path.write_text(source, encoding="utf-8")

marker = 'test("production deterministically sanitizes a second precision leak instead of returning 500", async () => {'
if marker not in tests:
    tests += r'''


test("production deterministically sanitizes a second precision leak instead of returning 500", async () => {
    let calls = 0;
    const leakingPayload = {
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
                uncertainty: ["La lectura literal no alcanza confianza suficiente."],
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
                uncertainty: ["La lectura literal no alcanza confianza suficiente."],
                evidence: []
            }
        ],
        comparison: {
            beforeAfter: false,
            differences: [
                "ChatGPT Plus includes GitHub while Terminal Heberto differs."
            ],
            confidence: 0.9
        },
        recommendations: [
            "Investigate the purpose and context of the terminal."
        ]
    };

    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async () => {
                    calls += 1;
                    return {
                        text: JSON.stringify(leakingPayload)
                    };
                }
            }
        },
        input: {
            files: [
                {
                    name: "chat.png",
                    mimeType: "image/png",
                    dataBase64: Buffer.from("chat-ui-v4d").toString("base64")
                },
                {
                    name: "terminal.png",
                    mimeType: "image/png",
                    dataBase64: Buffer.from("terminal-ui-v4d").toString("base64")
                }
            ],
            question: "Compara solamente controles visibles."
        }
    });

    assert.equal(calls, 2);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(result.repairCount, 1);
    assert.equal(result.precisionSanitized, true);
    assert.ok(result.precisionSanitizedCount >= 5);
    assert.equal(result.analysisMode, "COMBINED_PRECISION_SANITIZED");
    assert.equal(result.recommendations.length, 0);
    assert.doesNotMatch(
        JSON.stringify(result),
        /ChatGPT Plus|Terminal Heberto|GitHub|fixgo-44d\.web\.app|Investigate|Añadir fotos y archivos/
    );
    assert.equal(result.policy.deterministicPrecisionSanitizer, true);
});
'''
    test_path.write_text(tests, encoding="utf-8")
