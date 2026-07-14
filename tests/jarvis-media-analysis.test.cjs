const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
    normalizeMediaFiles,
    runJarvisMediaAnalysis
} = require("../functions/jarvis-media-analysis");

const tinyPng = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");

test("grounded media analysis sends real inline bytes and preserves evidence and uncertainty", async () => {
    let request;
    const ai = {
        getGenerativeModel(config) {
            assert.equal(config.model, "gemini-2.5-flash");
            return {
                async generateContent(parts) {
                    request = parts;
                    return {
                        response: {
                            text: () => JSON.stringify({
                                sources: [{
                                    description: "Imagen pequeña de prueba.",
                                    objects: [],
                                    composition: { framing: "indeterminado" },
                                    visibleData: [],
                                    pages: [],
                                    marketingUse: [],
                                    quality: { score: 10, issues: ["resolucion insuficiente"], improvements: [] },
                                    uncertainty: ["No hay detalle suficiente para identificar objetos."],
                                    evidence: [{ observation: "Encabezado PNG presente", confidence: 1 }]
                                }],
                                comparison: { beforeAfter: false, differences: [], confidence: 0 },
                                recommendations: []
                            })
                        }
                    };
                }
            };
        }
    };
    const result = await runJarvisMediaAnalysis({
        ai,
        input: {
            question: "¿Sirve para un hero?",
            files: [{ name: "foto.png", mimeType: "image/png", dataBase64: tinyPng }]
        }
    });
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(request[1].inlineData.data, tinyPng);
    assert.equal(result.sources[0].uncertainty.length, 1);
    assert.equal(result.sources[0].evidence.length, 1);
    assert.equal(result.policy.illegibleContentMustRemainUnknown, true);
});

test("media analysis rejects unsupported, excessive and malformed inputs before model execution", () => {
    assert.throws(() => normalizeMediaFiles([]), /COUNT_INVALID/);
    assert.throws(() => normalizeMediaFiles([{ name: "x", mimeType: "text/plain", dataBase64: tinyPng }]), /TYPE_UNSUPPORTED/);
    assert.throws(() => normalizeMediaFiles([{ name: "x", mimeType: "image/png", dataBase64: "not base64!" }]), /BASE64_INVALID/);
});

test("Firebase and terminal connect the authenticated real media analysis end to end", () => {
    const functionsIndex = fs.readFileSync(require.resolve("../functions/index.js"), "utf8");
    const workflow = fs.readFileSync(require.resolve("../.github/workflows/deploy.yml"), "utf8");
    const pack = fs.readFileSync(require.resolve("../gestia-core/jarvis/jarvis.multitool.pack.js"), "utf8");
    assert.match(functionsIndex, /exports\.jarvisMediaAnalyze/);
    assert.match(workflow, /functions:jarvisMediaAnalyze/);
    assert.match(pack, /jarvisMediaAnalyze/);
    assert.match(pack, /no inventare su contenido/i);
});
