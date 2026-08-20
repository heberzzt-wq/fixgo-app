const test = require("node:test");
const assert = require("node:assert/strict");

const {
    applyFreshnessGuardToGroundedRequest,
    compactProviderInputSchema,
    createJarvisGenAIProviderChain,
    normalizeProviders,
    requestNeedsFreshness,
    sanitizeGenerateContentRequest
} = require("../functions/jarvis-genai-provider-chain");

test("provider chain continues from an invalid developer key to Vertex AI", async () => {
    const calls = [];
    const chain = createJarvisGenAIProviderChain({
        providers: [
            {
                name: "gemini-developer",
                ai: {
                    models: {
                        generateContent: async () => {
                            calls.push("developer");
                            throw new Error("API_KEY_INVALID");
                        }
                    }
                }
            },
            {
                name: "vertex-adc",
                ai: {
                    models: {
                        generateContent: async request => {
                            calls.push("vertex");
                            return { text: "ok", request };
                        }
                    }
                }
            }
        ]
    });

    const request = { model: "gemini-2.5-flash", contents: "plan" };
    const result = await chain.models.generateContent(request);

    assert.deepEqual(calls, ["developer", "vertex"]);
    assert.equal(result.text, "ok");
    assert.equal(result.request, request);
    assert.equal(chain.lastProvider, "vertex-adc");
});

test("provider chain quarantines a permanently invalid credential after first failure", async () => {
    const calls = [];
    const chain = createJarvisGenAIProviderChain({
        providers: [
            {
                name: "developer",
                ai: {
                    models: {
                        generateContent: async () => {
                            calls.push("developer");
                            throw new Error("API key not valid. Please pass a valid API key.");
                        }
                    }
                }
            },
            {
                name: "vertex",
                ai: {
                    models: {
                        generateContent: async () => {
                            calls.push("vertex");
                            return { text: "ok" };
                        }
                    }
                }
            }
        ]
    });

    await chain.models.generateContent({ contents: "one" });
    await chain.models.generateContent({ contents: "two" });

    assert.deepEqual(calls, ["developer", "vertex", "vertex"]);
    assert.equal(chain.disabledProviders.developer, "INVALID_CREDENTIAL");
});

test("provider chain retries a transient provider failure once", async () => {
    let attempts = 0;
    const chain = createJarvisGenAIProviderChain({
        providers: [{
            name: "vertex",
            ai: {
                models: {
                    generateContent: async () => {
                        attempts += 1;
                        if (attempts === 1) {
                            throw new Error("503 Service Unavailable");
                        }
                        return { text: "recovered" };
                    }
                }
            }
        }]
    });

    const result = await chain.models.generateContent({ contents: "retry" });

    assert.equal(attempts, 2);
    assert.equal(result.text, "recovered");
    assert.equal(chain.lastProvider, "vertex");
});

test("provider schema compaction preserves routing fields but removes state-heavy constraints", () => {
    const schema = {
        type: "object",
        properties: {
            mode: {
                type: "string",
                enum: Array.from({ length: 200 }, (_, index) => `MODE_${index}`),
                pattern: "^[A-Z_]+$",
                description: "very long provider-only constraint"
            },
            limit: {
                type: "integer",
                minimum: 1,
                maximum: 100000
            },
            filters: {
                type: "array",
                minItems: 1,
                maxItems: 1000,
                items: {
                    type: "object",
                    properties: {
                        field: { type: "string", format: "date-time" }
                    },
                    required: ["field"]
                }
            },
            metadata: {
                type: "object",
                properties: {
                    nested: {
                        type: "object",
                        properties: {
                            deep: { type: "string", enum: ["a", "b", "c"] }
                        }
                    }
                }
            }
        },
        required: ["mode", "limit"]
    };

    const compact = compactProviderInputSchema(schema);

    assert.deepEqual(compact.required, ["mode", "limit"]);
    assert.deepEqual(compact.properties.mode, { type: "string" });
    assert.deepEqual(compact.properties.limit, { type: "integer" });
    assert.deepEqual(compact.properties.filters, {
        type: "array",
        items: { type: "object" }
    });
    assert.deepEqual(compact.properties.metadata, {
        type: "object"
    });
    assert.equal("enum" in compact.properties.mode, false);
    assert.equal("minimum" in compact.properties.limit, false);
    assert.equal("maxItems" in compact.properties.filters, false);
});

test("provider request sanitation leaves Google Search alone and compacts function declarations", () => {
    const googleSearchRequest = {
        config: { tools: [{ googleSearch: {} }] }
    };
    assert.equal(
        sanitizeGenerateContentRequest(googleSearchRequest),
        googleSearchRequest
    );

    const functionRequest = {
        config: {
            tools: [{
                functionDeclarations: [{
                    name: "jarvis_tool_0",
                    description: "x".repeat(1000),
                    parametersJsonSchema: {
                        type: "object",
                        properties: {
                            action: {
                                type: "string",
                                enum: Array.from({ length: 100 }, (_, index) => `A_${index}`)
                            }
                        },
                        required: ["action"]
                    }
                }]
            }]
        }
    };

    const sanitized = sanitizeGenerateContentRequest(functionRequest);
    const declaration = sanitized.config.tools[0].functionDeclarations[0];

    assert.notEqual(sanitized, functionRequest);
    assert.equal(declaration.description.length, 320);
    assert.deepEqual(declaration.parametersJsonSchema, {
        type: "object",
        properties: {
            action: { type: "string" }
        },
        required: ["action"]
    });
});

test("grounded web freshness guard injects a real temporal contract only for fresh queries", () => {
    const freshRequest = {
        contents: "Investiga las novedades actuales de la API de OpenAI",
        config: {
            tools: [{ googleSearch: {} }]
        }
    };
    const historicalRequest = {
        contents: "Explica la historia de la API de OpenAI",
        config: {
            tools: [{ googleSearch: {} }]
        }
    };

    assert.equal(requestNeedsFreshness(freshRequest), true);
    assert.equal(requestNeedsFreshness(historicalRequest), false);

    const guarded = applyFreshnessGuardToGroundedRequest(
        freshRequest,
        new Date("2026-08-19T12:00:00Z")
    );

    assert.notEqual(guarded, freshRequest);
    assert.match(guarded.contents, /FECHA_DE_REFERENCIA_WEB=2026-08-19/);
    assert.match(guarded.contents, /publicadas o actualizadas en 2026/);
    assert.match(guarded.contents, /FRESCURA_NO_VERIFICADA/);
    assert.equal(
        applyFreshnessGuardToGroundedRequest(
            historicalRequest,
            new Date("2026-08-19T12:00:00Z")
        ),
        historicalRequest
    );
});

test("provider chain forwards the freshness contract to the selected grounded provider", async () => {
    let receivedRequest = null;
    const chain = createJarvisGenAIProviderChain({
        providers: [{
            name: "vertex",
            ai: {
                models: {
                    generateContent: async request => {
                        receivedRequest = request;
                        return { text: "grounded" };
                    }
                }
            }
        }]
    });

    await chain.models.generateContent({
        contents: "Busca noticias recientes de inteligencia artificial",
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    assert.ok(receivedRequest);
    assert.match(receivedRequest.contents, /FECHA_DE_REFERENCIA_WEB=/);
    assert.match(receivedRequest.contents, /No presentes como novedad actual una fuente antigua/);
});

test("provider chain reports every real provider failure without fabricating output", async () => {
    const chain = createJarvisGenAIProviderChain({
        providers: [
            {
                name: "one",
                ai: { models: { generateContent: async () => { throw new Error("FIRST_DOWN"); } } }
            },
            {
                name: "two",
                ai: { models: { generateContent: async () => { throw new Error("SECOND_DOWN"); } } }
            }
        ]
    });

    await assert.rejects(
        chain.models.generateContent({ contents: "plan" }),
        error => {
            assert.ok(error.message.includes("one:FIRST_DOWN"));
            assert.ok(error.message.includes("two:SECOND_DOWN"));
            return true;
        }
    );
});

test("provider normalization ignores unavailable clients", () => {
    const usable = { name: "usable", ai: { models: { generateContent: async () => ({}) } } };
    assert.deepEqual(normalizeProviders([null, {}, usable]), [usable]);
    assert.throws(
        () => createJarvisGenAIProviderChain({ providers: [] }),
        /JARVIS_GENAI_PROVIDER_REQUIRED/
    );
});
