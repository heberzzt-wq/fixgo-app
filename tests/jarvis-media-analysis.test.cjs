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

test("grounded media analysis supports the deployed modern provider chain", async () => {
    let request;
    const result = await runJarvisMediaAnalysis({
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async value => {
                    request = value;
                    return {
                        text: JSON.stringify({
                            sources: [{
                                description: "Imagen tecnica verificable",
                                objects: ["equipo"],
                                composition: {},
                                visibleData: [],
                                pages: [],
                                marketingUse: ["hero"],
                                quality: { score: 80 },
                                uncertainty: [],
                                evidence: ["equipo visible"]
                            }],
                            comparison: null,
                            recommendations: []
                        })
                    };
                }
            }
        },
        input: {
            files: [{
                name: "equipo.png",
                mimeType: "image/png",
                dataBase64: Buffer.from("imagen-real").toString("base64")
            }],
            question: "Describe solamente lo visible."
        }
    });

    assert.equal(request.model, "gemini-2.5-flash");
    assert.equal(request.contents[0].parts[1].inlineData.mimeType, "image/png");
    assert.equal(result.provider, "vertex-adc");
    assert.equal(result.sources[0].description, "Imagen tecnica verificable");
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

test("grounded media analysis fails closed when two files receive one source", async () => {
    let request;
    const firstPng = Buffer.from("first-image").toString("base64");
    const secondPng = Buffer.from("second-image").toString("base64");
    const ai = {
        models: {
            generateContent: async value => {
                request = value;
                return {
                    text: JSON.stringify({
                        sources: [{
                            description: "Única source devuelta incorrectamente para dos archivos.",
                            objects: [],
                            composition: {},
                            visibleData: [],
                            pages: [],
                            marketingUse: [],
                            quality: {},
                            uncertainty: [],
                            evidence: ["Sólo una source presente."]
                        }],
                        comparison: null,
                        recommendations: []
                    })
                };
            }
        }
    };

    await assert.rejects(
        () => runJarvisMediaAnalysis({
            ai,
            input: {
                files: [
                    { name: "primera.png", mimeType: "image/png", dataBase64: firstPng },
                    { name: "segunda.png", mimeType: "image/png", dataBase64: secondPng }
                ],
                question: "Describe cada archivo por separado."
            }
        }),
        error => {
            assert.equal(error.message, "MEDIA_ANALYSIS_SOURCE_COUNT_MISMATCH");
            return true;
        }
    );

    assert.equal(request.contents[0].parts.length, 3);
    assert.equal(request.contents[0].parts[1].inlineData.data, firstPng);
    assert.equal(request.contents[0].parts[2].inlineData.data, secondPng);
});

test("grounded media analysis accepts two files with two explicitly identified sources", async () => {
    const firstPng = Buffer.from("first-valid-image").toString("base64");
    const secondPng = Buffer.from("second-valid-image").toString("base64");

    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async () => ({
                    text: JSON.stringify({
                        sources: [
                            {
                                sourceId: "SOURCE_1",
                                fileName: "primera.png",
                                description: "Descripción exclusiva de la primera imagen.",
                                objects: ["objeto-primero"],
                                composition: { framing: "primer encuadre" },
                                visibleData: [],
                                pages: [],
                                marketingUse: ["hero"],
                                quality: { score: 80, issues: [], improvements: [] },
                                uncertainty: ["Incertidumbre exclusiva de la primera imagen."],
                                evidence: ["Evidencia exclusiva de la primera imagen."]
                            },
                            {
                                sourceId: "SOURCE_2",
                                fileName: "segunda.png",
                                description: "Descripción exclusiva de la segunda imagen.",
                                objects: ["objeto-segundo"],
                                composition: { framing: "segundo encuadre" },
                                visibleData: [],
                                pages: [],
                                marketingUse: ["galeria"],
                                quality: { score: 70, issues: [], improvements: [] },
                                uncertainty: ["Incertidumbre exclusiva de la segunda imagen."],
                                evidence: ["Evidencia exclusiva de la segunda imagen."]
                            }
                        ],
                        comparison: {
                            beforeAfter: false,
                            differences: ["Las imágenes contienen observaciones distintas."],
                            confidence: 0.9
                        },
                        recommendations: []
                    })
                })
            }
        },
        input: {
            files: [
                { name: "primera.png", mimeType: "image/png", dataBase64: firstPng },
                { name: "segunda.png", mimeType: "image/png", dataBase64: secondPng }
            ],
            question: "Analiza y compara cada archivo por separado."
        }
    });

    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(result.sources.length, 2);
    assert.equal(result.sources[0].name, "primera.png");
    assert.equal(result.sources[1].name, "segunda.png");
    assert.equal(result.sources[0].description, "Descripción exclusiva de la primera imagen.");
    assert.equal(result.sources[1].description, "Descripción exclusiva de la segunda imagen.");
    assert.deepEqual(result.sources[0].evidence, ["Evidencia exclusiva de la primera imagen."]);
    assert.deepEqual(result.sources[1].evidence, ["Evidencia exclusiva de la segunda imagen."]);
    assert.deepEqual(result.sources[0].uncertainty, ["Incertidumbre exclusiva de la primera imagen."]);
    assert.deepEqual(result.sources[1].uncertainty, ["Incertidumbre exclusiva de la segunda imagen."]);
    assert.equal(result.comparison.confidence, 0.9);
});

test("grounded media analysis binds sources by explicit file identity instead of provider position", async () => {
    const firstPng = Buffer.from("identity-first-image").toString("base64");
    const secondPng = Buffer.from("identity-second-image").toString("base64");

    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async () => ({
                    text: JSON.stringify({
                        sources: [
                            {
                                sourceId: "SOURCE_2",
                                fileName: "segunda.png",
                                description: "Descripción inequívoca de la segunda imagen.",
                                objects: ["segundo"],
                                composition: {},
                                visibleData: [],
                                pages: [],
                                marketingUse: [],
                                quality: {},
                                uncertainty: ["Incertidumbre de segunda."],
                                evidence: ["Evidencia de segunda."]
                            },
                            {
                                sourceId: "SOURCE_1",
                                fileName: "primera.png",
                                description: "Descripción inequívoca de la primera imagen.",
                                objects: ["primero"],
                                composition: {},
                                visibleData: [],
                                pages: [],
                                marketingUse: [],
                                quality: {},
                                uncertainty: ["Incertidumbre de primera."],
                                evidence: ["Evidencia de primera."]
                            }
                        ],
                        comparison: {
                            beforeAfter: false,
                            differences: ["Archivos distintos."],
                            confidence: 1
                        },
                        recommendations: []
                    })
                })
            }
        },
        input: {
            files: [
                { name: "primera.png", mimeType: "image/png", dataBase64: firstPng },
                { name: "segunda.png", mimeType: "image/png", dataBase64: secondPng }
            ],
            question: "Mantén separada la evidencia de cada archivo."
        }
    });

    assert.equal(result.sources.length, 2);
    assert.equal(result.sources[0].sourceId, "SOURCE_1");
    assert.equal(result.sources[0].fileName, "primera.png");
    assert.equal(result.sources[0].description, "Descripción inequívoca de la primera imagen.");
    assert.deepEqual(result.sources[0].evidence, ["Evidencia de primera."]);
    assert.equal(result.sources[1].sourceId, "SOURCE_2");
    assert.equal(result.sources[1].fileName, "segunda.png");
    assert.equal(result.sources[1].description, "Descripción inequívoca de la segunda imagen.");
    assert.deepEqual(result.sources[1].evidence, ["Evidencia de segunda."]);
});

test("grounded media analysis repairs one source-count mismatch exactly once", async () => {
    let calls = 0;
    const firstPng = Buffer.from("repair-first-image").toString("base64");
    const secondPng = Buffer.from("repair-second-image").toString("base64");

    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async request => {
                    calls += 1;

                    if (calls === 1) {
                        return {
                            text: JSON.stringify({
                                sources: [{
                                    sourceId: "SOURCE_1",
                                    fileName: "primera.png",
                                    description: "Respuesta incompleta.",
                                    uncertainty: [],
                                    evidence: []
                                }],
                                comparison: null,
                                recommendations: []
                            })
                        };
                    }

                    assert.match(
                        request.contents[0].parts[0],
                        /MEDIA_ANALYSIS_SOURCE_COUNT_MISMATCH/
                    );

                    return {
                        text: JSON.stringify({
                            sources: [
                                {
                                    sourceId: "SOURCE_2",
                                    fileName: "segunda.png",
                                    description: "Segunda imagen reparada.",
                                    observations: ["Observación segunda."],
                                    inferences: [],
                                    objects: [],
                                    composition: {},
                                    visibleData: [],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: ["Incertidumbre segunda."],
                                    evidence: ["Evidencia segunda."]
                                },
                                {
                                    sourceId: "SOURCE_1",
                                    fileName: "primera.png",
                                    description: "Primera imagen reparada.",
                                    observations: ["Observación primera."],
                                    inferences: [],
                                    objects: [],
                                    composition: {},
                                    visibleData: [],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: ["Incertidumbre primera."],
                                    evidence: ["Evidencia primera."]
                                }
                            ],
                            comparison: {
                                beforeAfter: false,
                                differences: ["Contenido diferente."],
                                confidence: 0.8
                            },
                            recommendations: []
                        })
                    };
                }
            }
        },
        input: {
            files: [
                { name: "primera.png", mimeType: "image/png", dataBase64: firstPng },
                { name: "segunda.png", mimeType: "image/png", dataBase64: secondPng }
            ],
            question: "Analiza cada imagen por separado."
        }
    });

    assert.equal(calls, 2);
    assert.equal(result.repairCount, 1);
    assert.equal(result.expectedSources, 2);
    assert.equal(result.receivedSources, 2);
    assert.equal(result.sources[0].sourceId, "SOURCE_1");
    assert.equal(result.sources[0].fileName, "primera.png");
    assert.equal(result.sources[0].description, "Primera imagen reparada.");
    assert.equal(result.sources[1].sourceId, "SOURCE_2");
    assert.equal(result.sources[1].fileName, "segunda.png");
    assert.equal(result.sources[1].description, "Segunda imagen reparada.");
});

test("grounded media analysis fails explicitly after the single repair attempt", async () => {
    let calls = 0;
    const firstPng = Buffer.from("failed-repair-first").toString("base64");
    const secondPng = Buffer.from("failed-repair-second").toString("base64");

    await assert.rejects(
        () => runJarvisMediaAnalysis({
            ai: {
                models: {
                    generateContent: async () => {
                        calls += 1;
                        return {
                            text: JSON.stringify({
                                sources: [{
                                    sourceId: "SOURCE_1",
                                    fileName: "primera.png",
                                    description: "Proveedor continúa devolviendo una sola source.",
                                    uncertainty: ["Análisis incompleto."],
                                    evidence: []
                                }],
                                comparison: null,
                                recommendations: []
                            })
                        };
                    }
                }
            },
            input: {
                files: [
                    { name: "primera.png", mimeType: "image/png", dataBase64: firstPng },
                    { name: "segunda.png", mimeType: "image/png", dataBase64: secondPng }
                ],
                question: "No publiques resultados parciales."
            }
        }),
        error => {
            assert.equal(error.message, "MEDIA_ANALYSIS_SOURCE_COUNT_MISMATCH");
            assert.equal(error.expectedSources, 2);
            assert.equal(error.receivedSources, 1);
            assert.equal(error.repairCount, 1);
            assert.equal(error.expectedSourceIdentities.length, 2);
            assert.equal(error.receivedSourceIdentities.length, 1);
            return true;
        }
    );

    assert.equal(calls, 2);
});

test("grounded media analysis isolates each file after combined schema repair fails", async () => {
    const firstPng = Buffer.from("realistic-isolated-first").toString("base64");
    const secondPng = Buffer.from("realistic-isolated-second").toString("base64");
    const callShapes = [];

    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async request => {
                    const parts = request.contents[0].parts;
                    const prompt = String(parts[0] || "");
                    const inlineParts = parts.filter(
                        part => part && typeof part === "object" && part.inlineData
                    );

                    callShapes.push({
                        inlineCount: inlineParts.length,
                        prompt
                    });

                    if (inlineParts.length === 2) {
                        return {
                            text: JSON.stringify(
                                callShapes.length === 1
                                    ? {
                                        application_name: "Respuesta visual fuera de contrato",
                                        main_interface: {}
                                    }
                                    : {
                                        image_1_details: {},
                                        image_2_details: {}
                                    }
                            )
                        };
                    }

                    if (inlineParts.length === 1) {
                        const first =
                            inlineParts[0].inlineData.data === firstPng;

                        return {
                            text: JSON.stringify({
                                sources: [{
                                    sourceId: first ? "SOURCE_1" : "SOURCE_2",
                                    fileName: first ? "primera.png" : "segunda.png",
                                    mimeType: "image/png",
                                    description: first
                                        ? "Descripción aislada de la primera imagen."
                                        : "Descripción aislada de la segunda imagen.",
                                    observations: [
                                        first
                                            ? "Observación exclusiva de la primera imagen."
                                            : "Observación exclusiva de la segunda imagen."
                                    ],
                                    inferences: [],
                                    objects: [],
                                    composition: {},
                                    visibleData: [],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: [
                                        first
                                            ? "Incertidumbre exclusiva de la primera imagen."
                                            : "Incertidumbre exclusiva de la segunda imagen."
                                    ],
                                    evidence: [
                                        first
                                            ? "Evidencia exclusiva de la primera imagen."
                                            : "Evidencia exclusiva de la segunda imagen."
                                    ]
                                }],
                                comparison: null,
                                recommendations: []
                            })
                        };
                    }

                    if (
                        inlineParts.length === 0 &&
                        prompt.includes("COMPARACION_GLOBAL_VALIDADA")
                    ) {
                        return {
                            text: JSON.stringify({
                                comparison: {
                                    beforeAfter: false,
                                    differences: [
                                        "Las fuentes validadas contienen elementos distintos."
                                    ],
                                    confidence: 0.9
                                },
                                recommendations: [
                                    "Conservar ambas fuentes separadas."
                                ]
                            })
                        };
                    }

                    throw new Error("UNEXPECTED_V94_PROVIDER_CALL");
                }
            }
        },
        input: {
            files: [
                {
                    name: "primera.png",
                    mimeType: "image/png",
                    dataBase64: firstPng
                },
                {
                    name: "segunda.png",
                    mimeType: "image/png",
                    dataBase64: secondPng
                }
            ],
            question: "Analiza ambas imágenes sin mezclar sus observaciones."
        }
    });

    assert.deepEqual(
        callShapes.map(call => call.inlineCount),
        [2, 2, 1, 1, 0]
    );

    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(result.expectedSources, 2);
    assert.equal(result.receivedSources, 2);
    assert.equal(result.sources.length, 2);

    assert.equal(result.sources[0].sourceId, "SOURCE_1");
    assert.equal(result.sources[0].fileName, "primera.png");
    assert.equal(
        result.sources[0].description,
        "Descripción aislada de la primera imagen."
    );
    assert.deepEqual(
        result.sources[0].evidence,
        ["Evidencia exclusiva de la primera imagen."]
    );

    assert.equal(result.sources[1].sourceId, "SOURCE_2");
    assert.equal(result.sources[1].fileName, "segunda.png");
    assert.equal(
        result.sources[1].description,
        "Descripción aislada de la segunda imagen."
    );
    assert.deepEqual(
        result.sources[1].evidence,
        ["Evidencia exclusiva de la segunda imagen."]
    );

    assert.deepEqual(
        result.comparison.differences,
        ["Las fuentes validadas contienen elementos distintos."]
    );
});


test("grounded media analysis enforces schemas through every provider route", async () => {
    const firstBytes =
        Buffer.from("schema-route-first")
            .toString("base64");

    const secondBytes =
        Buffer.from("schema-route-second")
            .toString("base64");

    const requests = [];

    const result =
        await runJarvisMediaAnalysis({
            ai: {
                models: {
                    generateContent:
                        async request => {
                            requests.push(request);

                            const parts =
                                request.contents[0].parts;

                            const inlineParts =
                                parts.filter(
                                    part =>
                                        part &&
                                        typeof part === "object" &&
                                        part.inlineData
                                );

                            if (inlineParts.length === 2) {
                                return {
                                    text:
                                        JSON.stringify({
                                            visual_output:
                                                "intentionally outside contract"
                                        })
                                };
                            }

                            if (inlineParts.length === 1) {
                                const isFirst =
                                    inlineParts[0]
                                        .inlineData
                                        .data === firstBytes;

                                return {
                                    text:
                                        JSON.stringify({
                                            sources: [{
                                                sourceId:
                                                    isFirst
                                                        ? "SOURCE_1"
                                                        : "SOURCE_2",
                                                fileName:
                                                    isFirst
                                                        ? "schema-first.png"
                                                        : "schema-second.png",
                                                mimeType:
                                                    "image/png",
                                                description:
                                                    isFirst
                                                        ? "First isolated source."
                                                        : "Second isolated source.",
                                                observations: [
                                                    isFirst
                                                        ? "First observation."
                                                        : "Second observation."
                                                ],
                                                inferences: [],
                                                evidence: [
                                                    isFirst
                                                        ? "First evidence."
                                                        : "Second evidence."
                                                ],
                                                uncertainty: []
                                            }]
                                        })
                                };
                            }

                            return {
                                text:
                                    JSON.stringify({
                                        comparison: {
                                            beforeAfter:
                                                false,
                                            differences: [
                                                "The validated sources differ."
                                            ],
                                            confidence:
                                                0.9
                                        },
                                        recommendations: []
                                    })
                            };
                        }
                }
            },
            input: {
                files: [
                    {
                        name:
                            "schema-first.png",
                        mimeType:
                            "image/png",
                        dataBase64:
                            firstBytes
                    },
                    {
                        name:
                            "schema-second.png",
                        mimeType:
                            "image/png",
                        dataBase64:
                            secondBytes
                    }
                ],
                question:
                    "Analyze both files independently."
            }
        });

    assert.equal(
        result.status,
        "MEDIA_ANALYSIS_GROUNDED"
    );

    assert.equal(
        result.sources.length,
        2
    );

    assert.equal(
        requests.length,
        5
    );

    const combinedSchema =
        requests[0]
            .config
            .responseJsonSchema;

    assert.equal(
        combinedSchema
            .properties
            .sources
            .minItems,
        2
    );

    assert.equal(
        combinedSchema
            .properties
            .sources
            .maxItems,
        2
    );

    assert.deepEqual(
        combinedSchema
            .properties
            .sources
            .items
            .properties
            .sourceId
            .enum,
        [
            "SOURCE_1",
            "SOURCE_2"
        ]
    );

    assert.ok(
        combinedSchema
            .required
            .includes("comparison")
    );

    const firstIsolatedSchema =
        requests[2]
            .config
            .responseJsonSchema;

    assert.equal(
        firstIsolatedSchema
            .properties
            .sources
            .minItems,
        1
    );

    assert.deepEqual(
        firstIsolatedSchema
            .properties
            .sources
            .items
            .properties
            .sourceId
            .enum,
        ["SOURCE_1"]
    );

    const secondIsolatedSchema =
        requests[3]
            .config
            .responseJsonSchema;

    assert.deepEqual(
        secondIsolatedSchema
            .properties
            .sources
            .items
            .properties
            .sourceId
            .enum,
        ["SOURCE_2"]
    );

    const comparisonSchema =
        requests[4]
            .config
            .responseJsonSchema;

    assert.equal(
        comparisonSchema
            .properties
            .sources,
        undefined
    );

    assert.deepEqual(
        comparisonSchema.required,
        [
            "comparison",
            "recommendations"
        ]
    );
});

test("visual precision policy preserves verified Motor text and withholds uncertain URL and year", async () => {
    let request = null;
    const ai = {
        models: {
            async generateContent(payload) {
                request = payload;
                return {
                    text: JSON.stringify({
                        sources: [{
                            sourceId: "SOURCE_1",
                            fileName: "terminal.png",
                            mimeType: "image/png",
                            description: "Interfaz de una terminal web.",
                            observations: ["Se observa una interfaz de asistente."],
                            inferences: [],
                            visibleData: [
                                {
                                    kind: "text",
                                    value: "Motor No-Code",
                                    page: 1,
                                    confidence: 0.99,
                                    evidence: "Texto completo visible bajo el encabezado.",
                                    legibility: "VERIFIED"
                                },
                                {
                                    kind: "text",
                                    value: "Motion No-Code",
                                    page: 1,
                                    confidence: 0.72,
                                    evidence: "Lectura alternativa incompatible con el texto del encabezado.",
                                    legibility: "UNCERTAIN"
                                },
                                {
                                    kind: "url",
                                    value: "https://fixgo-44d.web.app",
                                    page: 1,
                                    confidence: 0.91,
                                    evidence: "La barra del navegador es pequeña y no se distingue completa.",
                                    legibility: "UNCERTAIN"
                                },
                                {
                                    kind: "date",
                                    value: "14/07/2028",
                                    page: 1,
                                    confidence: 1,
                                    evidence: "",
                                    legibility: "VERIFIED"
                                }
                            ],
                            evidence: ["Interfaz visible en SOURCE_1."],
                            uncertainty: ["La URL y la fecha no se leen completas."]
                        }]
                    })
                };
            }
        }
    };

    const result = await runJarvisMediaAnalysis({
        ai,
        input: {
            files: [{ name: "terminal.png", mimeType: "image/png", dataBase64: tinyPng }],
            question: "Transcribe solamente lo que sea verificable."
        }
    });

    assert.equal(result.version, "1.4.0-verified-visual-claims");
    assert.equal(result.sources[0].sourceId, "SOURCE_1");
    assert.equal(result.sources[0].visibleData[0].value, "Motor No-Code");
    assert.equal(result.sources[0].visibleData[0].legibility, "VERIFIED");
    assert.equal(result.sources[0].visibleData[1].value, "");
    assert.equal(result.sources[0].visibleData[2].value, "");
    assert.equal(result.sources[0].visibleData[3].value, "");
    assert.doesNotMatch(JSON.stringify(result), /Motion No-Code|fixgo-44d|2028/);
    assert.equal(result.policy.exactTextMinimumConfidence, 0.98);
    assert.equal(result.policy.unverifiedLiteralValuesAreWithheld, true);

    const prompt = request.contents[0].parts[0];
    assert.match(prompt, /Nunca completes una URL parcial ni emitas una fecha, hora o ano/i);
    assert.match(prompt, /visibleData/);
    assert.match(prompt, /Fuera de visibleData, ninguna propiedad/);
    assert.match(prompt, /carencias concretas comprobables por contraste visual/);
    assert.ok(
        request.config.responseJsonSchema.properties.sources.items.required.includes("visibleData")
    );
});


test("production incident repairs a sensitive literal leaked outside visibleData", async () => {
    let calls = 0;
    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async request => {
                    calls += 1;
                    if (calls === 1) {
                        return {
                            text: JSON.stringify({
                                sources: [{
                                    sourceId: "SOURCE_1",
                                    fileName: "terminal.png",
                                    mimeType: "image/png",
                                    description: "Interfaz de terminal.",
                                    observations: ["La fecha mostrada es 07/08/2023."],
                                    inferences: [],
                                    objects: ["Una interfaz web."],
                                    composition: {},
                                    visibleData: [],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: [],
                                    evidence: []
                                }]
                            })
                        };
                    }
                    assert.match(
                        request.contents[0].parts[0],
                        /MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK/
                    );
                    return {
                        text: JSON.stringify({
                            sources: [{
                                sourceId: "SOURCE_1",
                                fileName: "terminal.png",
                                mimeType: "image/png",
                                description: "Interfaz de terminal.",
                                observations: ["Se observa una barra inferior, sin transcribir datos sensibles fuera de visibleData."],
                                inferences: [],
                                objects: ["Una interfaz web."],
                                composition: {},
                                visibleData: [],
                                pages: [],
                                marketingUse: [],
                                quality: {},
                                uncertainty: ["La fecha visible no se transcribe porque no fue solicitada como lectura literal."],
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

    assert.equal(calls, 2);
    assert.equal(result.repairCount, 1);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.doesNotMatch(JSON.stringify(result), /07\/08\/2023|2023/);
});


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



test("production repairs ungrounded UI labels, bare domains and generic investigation advice", async () => {
    let calls = 0;
    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async request => {
                    calls += 1;
                    if (calls === 1) {
                        return {
                            text: JSON.stringify({
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
                                        uncertainty: [],
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
                                        uncertainty: [],
                                        evidence: []
                                    }
                                ],
                                comparison: {
                                    beforeAfter: false,
                                    differences: ["ChatGPT Plus includes GitHub while Terminal Heberto differs."],
                                    confidence: 0.9
                                },
                                recommendations: ["Investigate the purpose and context of the terminal."]
                            })
                        };
                    }

                    assert.match(
                        request.contents[0].parts[0],
                        /MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK|MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION/
                    );

                    return {
                        text: JSON.stringify({
                            sources: [
                                {
                                    sourceId: "SOURCE_1",
                                    fileName: "chat.png",
                                    mimeType: "image/png",
                                    description: "Interfaz conversacional con un menu desplegado.",
                                    observations: ["Se observan varias entradas de menu sin transcribir etiquetas no verificadas."],
                                    inferences: [],
                                    objects: [],
                                    composition: {},
                                    visibleData: [],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: ["Las etiquetas literales no alcanzan el umbral de verificacion."],
                                    evidence: []
                                },
                                {
                                    sourceId: "SOURCE_2",
                                    fileName: "terminal.png",
                                    mimeType: "image/png",
                                    description: "Interfaz conversacional con un menu desplegado.",
                                    observations: ["Se observan menos entradas visibles en el menu sin transcribir etiquetas no verificadas."],
                                    inferences: [],
                                    objects: [],
                                    composition: {},
                                    visibleData: [],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: ["Las etiquetas literales no alcanzan el umbral de verificacion."],
                                    evidence: []
                                }
                            ],
                            comparison: {
                                beforeAfter: false,
                                differences: ["Una fuente muestra mas entradas visibles en el menu que la otra."],
                                confidence: 0.9
                            },
                            recommendations: ["Hacer visibles mas opciones de adjuntos cuando exista soporte real para ellas."]
                        })
                    };
                }
            }
        },
        input: {
            files: [
                { name: "chat.png", mimeType: "image/png", dataBase64: Buffer.from("chat-ui").toString("base64") },
                { name: "terminal.png", mimeType: "image/png", dataBase64: Buffer.from("terminal-ui").toString("base64") }
            ],
            question: "Compara solamente controles visibles de adjuntos."
        }
    });

    assert.equal(calls, 2);
    assert.equal(result.repairCount, 1);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.doesNotMatch(
        JSON.stringify(result),
        /ChatGPT Plus|Terminal Heberto|GitHub|fixgo-44d\.web\.app|Investigate|Añadir fotos y archivos/
    );
    assert.equal(result.policy.narrativeUiLiteralsRequireVisibleData, true);
    assert.equal(result.policy.conversationContentCannotProveUiCapability, true);
});


test("production permits UI labels in narrative only when verified visibleData grounds them", async () => {
    let calls = 0;
    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async () => {
                    calls += 1;
                    return {
                        text: JSON.stringify({
                            sources: [
                                {
                                    sourceId: "SOURCE_1",
                                    fileName: "chat.png",
                                    mimeType: "image/png",
                                    description: "La interfaz muestra ChatGPT Plus.",
                                    observations: ["El control 'Añadir fotos y archivos' esta visible."],
                                    inferences: [],
                                    objects: [],
                                    composition: {},
                                    visibleData: [
                                        {
                                            kind: "text",
                                            value: "ChatGPT Plus",
                                            page: 1,
                                            confidence: 0.99,
                                            evidence: "Etiqueta visible en la parte superior.",
                                            legibility: "VERIFIED"
                                        },
                                        {
                                            kind: "text",
                                            value: "Añadir fotos y archivos",
                                            page: 1,
                                            confidence: 0.99,
                                            evidence: "Entrada visible del menu abierto.",
                                            legibility: "VERIFIED"
                                        }
                                    ],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: [],
                                    evidence: []
                                },
                                {
                                    sourceId: "SOURCE_2",
                                    fileName: "terminal.png",
                                    mimeType: "image/png",
                                    description: "La interfaz muestra Terminal Heberto.",
                                    observations: [],
                                    inferences: [],
                                    objects: [],
                                    composition: {},
                                    visibleData: [
                                        {
                                            kind: "text",
                                            value: "Terminal Heberto",
                                            page: 1,
                                            confidence: 0.99,
                                            evidence: "Encabezado visible de la interfaz.",
                                            legibility: "VERIFIED"
                                        }
                                    ],
                                    pages: [],
                                    marketingUse: [],
                                    quality: {},
                                    uncertainty: [],
                                    evidence: []
                                }
                            ],
                            comparison: {
                                beforeAfter: false,
                                differences: ["ChatGPT Plus y Terminal Heberto muestran encabezados distintos."],
                                confidence: 0.99
                            },
                            recommendations: []
                        })
                    };
                }
            }
        },
        input: {
            files: [
                { name: "chat.png", mimeType: "image/png", dataBase64: Buffer.from("chat-ui-verified").toString("base64") },
                { name: "terminal.png", mimeType: "image/png", dataBase64: Buffer.from("terminal-ui-verified").toString("base64") }
            ],
            question: "Compara controles visibles."
        }
    });

    assert.equal(calls, 1);
    assert.equal(result.repairCount, 0);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(result.sources[0].visibleData[0].value, "ChatGPT Plus");
    assert.equal(result.sources[0].visibleData[1].value, "Añadir fotos y archivos");
    assert.equal(result.sources[1].visibleData[0].value, "Terminal Heberto");
});
