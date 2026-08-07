from pathlib import Path

media_path = Path("functions/jarvis-media-analysis.js")
test_path = Path("tests/jarvis-media-analysis.test.cjs")

media = media_path.read_text(encoding="utf-8")
tests = test_path.read_text(encoding="utf-8")

old = '''            .map(source => ({
                ...source,
                observations: (Array.isArray(source?.observations)'''
new = '''            .map(source => ({
                ...source,
                description: "",
                observations: (Array.isArray(source?.observations)'''
if old not in media:
    raise SystemExit("v4i description grounding anchor missing")
media = media.replace(old, new, 1)

old_policy = '''            strictVisualConversationTranscriptSuppressed: true,
            authenticatedAdminOnly: true'''
new_policy = '''            strictVisualConversationTranscriptSuppressed: true,
            strictVisualNarrativeDescriptionSuppressed: true,
            authenticatedAdminOnly: true'''
if old_policy not in media:
    raise SystemExit("v4i policy marker anchor missing")
media = media.replace(old_policy, new_policy, 1)

marker = 'test("strict visual-only request suppresses provider description even when it contains a visually verified UI label", async () => {'
if marker not in tests:
    tests += r'''


test("strict visual-only request suppresses provider description even when it contains a visually verified UI label", async () => {
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
                                description: "Screenshot of the ChatGPT Plus interface showing a detailed dropdown menu.",
                                observations: ["Se observa un menu abierto con varias filas."],
                                inferences: ["The user is likely preparing to attach a file."],
                                visibleData: [
                                    {
                                        kind: "text",
                                        value: "ChatGPT Plus",
                                        page: 1,
                                        confidence: 0.99,
                                        evidence: "Etiqueta visible en la cabecera.",
                                        legibility: "VERIFIED"
                                    }
                                ],
                                evidence: [],
                                uncertainty: []
                            }
                        ]
                    })
                })
            }
        },
        input: {
            files: [
                {
                    name: "one.png",
                    mimeType: "image/png",
                    dataBase64: Buffer.from("strict-description-v4i").toString("base64")
                }
            ],
            question: "Describe solamente elementos visuales verificables. No infieras intenciones."
        }
    });

    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(result.sources[0].description, "");
    assert.deepEqual(result.sources[0].inferences, []);
    assert.match(result.sources[0].observations[0], /menu abierto/i);
    assert.equal(result.sources[0].visibleData[0].value, "ChatGPT Plus");
    assert.equal(result.policy.strictVisualNarrativeDescriptionSuppressed, true);
});
'''

media_path.write_text(media, encoding="utf-8")
test_path.write_text(tests, encoding="utf-8")
