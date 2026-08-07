from pathlib import Path

media_path = Path("functions/jarvis-media-analysis.js")
composer_path = Path("gestia-core/jarvis/jarvis.conversation.composer.js")
media_test_path = Path("tests/jarvis-media-analysis.test.cjs")
composer_test_path = Path("tests/jarvis-conversation-composer.test.mjs")

media = media_path.read_text(encoding="utf-8")
composer = composer_path.read_text(encoding="utf-8")
media_tests = media_test_path.read_text(encoding="utf-8")
composer_tests = composer_test_path.read_text(encoding="utf-8")

prompt_anchor = '''        "Distingue observaciones directas de inferencias.",
        "Devuelve solamente JSON estricto.",'''
prompt_replacement = '''        "Distingue observaciones directas de inferencias.",
        "Si la PREGUNTA exige solamente evidencia visual, dice no infieras/no inferir o prohíbe inferencias, devuelve inferences=[] para cada source.",
        "Devuelve solamente JSON estricto.",'''
if prompt_anchor not in media:
    raise SystemExit("v4g prompt anchor missing")
media = media.replace(prompt_anchor, prompt_replacement, 1)

helper_anchor = '''async function runJarvisMediaAnalysis({
    ai,
    input = {},
    model = DEFAULT_MODEL
} = {}) {'''
helper_block = '''function strictVisualOnlyRequested(question = "") {
    const value = String(question || "").toLowerCase();
    return (
        /(?:no\\s+infier|no\\s+infer|sin\\s+inferencias?)/i.test(value) ||
        /(?:solamente|únicamente|unicamente|solo|sólo)[\\s\\S]{0,120}(?:verific|visible|visual)/i.test(value) ||
        /(?:describe|compara)[\\s\\S]{0,180}(?:solamente|únicamente|unicamente)[\\s\\S]{0,120}(?:verific|visible|visual)/i.test(value)
    );
}

function applyQuestionGroundingPolicy(parsed, question = "") {
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

async function runJarvisMediaAnalysis({
    ai,
    input = {},
    model = DEFAULT_MODEL
} = {}) {'''
if helper_anchor not in media:
    raise SystemExit("v4g run helper anchor missing")
media = media.replace(helper_anchor, helper_block, 1)

combined_parse_anchor = '''            parsed =
                parseAnalysisJson(text, files);

            const validated ='''
combined_parse_replacement = '''            parsed =
                applyQuestionGroundingPolicy(
                    parseAnalysisJson(text, files),
                    question
                );

            const validated ='''
if combined_parse_anchor not in media:
    raise SystemExit("v4g combined parse anchor missing")
media = media.replace(combined_parse_anchor, combined_parse_replacement, 1)

isolated_parse_anchor = '''            const parsed =
                parseAnalysisJson(text, [file]);

            const validated ='''
isolated_parse_replacement = '''            const parsed =
                applyQuestionGroundingPolicy(
                    parseAnalysisJson(text, [file]),
                    question
                );

            const validated ='''
if isolated_parse_anchor not in media:
    raise SystemExit("v4g isolated parse anchor missing")
media = media.replace(isolated_parse_anchor, isolated_parse_replacement, 1)

exports_anchor = '''    validateIsolatedAnalysis,
    runIsolatedMediaFallback,
    runJarvisMediaAnalysis
};'''
exports_replacement = '''    validateIsolatedAnalysis,
    runIsolatedMediaFallback,
    strictVisualOnlyRequested,
    applyQuestionGroundingPolicy,
    runJarvisMediaAnalysis
};'''
if exports_anchor not in media:
    raise SystemExit("v4g exports anchor missing")
media = media.replace(exports_anchor, exports_replacement, 1)

composer_anchor = '''        const objects = groundedNaturalEvidenceTexts(
            source?.objects,
            verifiedValues
        );

        lines.push("", `### Archivo ${index + 1}: ${fileName}`);
        appendNaturalList(lines, "Elementos visuales confirmados:", objects);
'''
composer_replacement = '''        const objects = groundedNaturalEvidenceTexts(
            source?.objects,
            verifiedValues
        );
        const observations = groundedNaturalEvidenceTexts(
            source?.observations,
            verifiedValues
        );

        lines.push("", `### Archivo ${index + 1}: ${fileName}`);
        appendNaturalList(lines, "Elementos visuales confirmados:", objects);
        appendNaturalList(lines, "Observaciones visuales verificadas:", observations);
'''
if composer_anchor not in composer:
    raise SystemExit("v4g composer observation anchor missing")
composer = composer.replace(composer_anchor, composer_replacement, 1)

media_marker = 'test("strict visual-only request deterministically suppresses provider inferences", async () => {'
if media_marker not in media_tests:
    media_tests += r'''


test("strict visual-only request deterministically suppresses provider inferences", async () => {
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
                                visibleData: [],
                                evidence: [],
                                uncertainty: []
                            },
                            {
                                sourceId: "SOURCE_2",
                                fileName: "two.png",
                                mimeType: "image/png",
                                description: "Interfaz web con un menu abierto y un panel lateral.",
                                observations: ["Se observa un panel lateral junto al contenido principal."],
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
                { name: "one.png", mimeType: "image/png", dataBase64: Buffer.from("one").toString("base64") },
                { name: "two.png", mimeType: "image/png", dataBase64: Buffer.from("two").toString("base64") }
            ],
            question: "Describe solamente lo que puedes verificar visualmente. No infieras intenciones del usuario."
        }
    });

    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.deepEqual(result.sources[0].inferences, []);
    assert.deepEqual(result.sources[1].inferences, []);
    assert.match(result.sources[0].observations[0], /menu abierto/i);
    assert.match(result.comparison.differences[0], /panel lateral/i);
});
'''

composer_marker = 'test("precision renderer shows safe nonliteral visual observations when text labels remain unverified", async () => {'
if composer_marker not in composer_tests:
    composer_tests += r'''


test("precision renderer shows safe nonliteral visual observations when text labels remain unverified", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara solamente lo verificable visualmente.",
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
                        visibleData: [],
                        uncertainty: []
                    },
                    {
                        sourceId: "SOURCE_2",
                        fileName: "two.png",
                        sha256: "2".repeat(64),
                        observations: ["Se observa un panel lateral junto al contenido principal."],
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
    assert.match(result.text, /Observaciones visuales verificadas:/);
    assert.match(result.text, /menu abierto con varias filas/i);
    assert.match(result.text, /panel lateral junto al contenido principal/i);
    assert.match(result.text, /segunda fuente muestra un panel lateral/i);
});
'''

media_path.write_text(media, encoding="utf-8")
composer_path.write_text(composer, encoding="utf-8")
media_test_path.write_text(media_tests, encoding="utf-8")
composer_test_path.write_text(composer_tests, encoding="utf-8")
