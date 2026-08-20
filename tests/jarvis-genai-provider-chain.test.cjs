const test = require("node:test");
const assert = require("node:assert/strict");

const {
    applyFreshnessGuardToGroundedRequest,
    canonicalizeGroundingRedirects,
    compactProviderInputSchema,
    createJarvisGenAIProviderChain,
    isGroundingRedirectUrl,
    normalizeProviders,
    requestNeedsFreshness,
    resolveGroundingRedirectUrl,
    sanitizeGenerateContentRequest
} = require("../functions/jarvis-genai-provider-chain");

function groundedResponse(text = "grounded") {
    return {
        text,
        candidates: [{
            groundingMetadata: {
                groundingChunks: [{
                    web: {
                        uri: "https://example.com/source",
                        title: "Example source"
                    }
                }],
                groundingSupports: [{
                    segment: { text: "verified fact" },
                    groundingChunkIndices: [0]
                }]
            }
        }]
    };
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
    const target = String(url || "");
    if (target.startsWith("https://example.com/source")) {
        return {
            ok: true,
            url: target,
            headers: {
                get(name) {
                    return String(name || "").toLowerCase() === "content-type"
                        ? "text/html; charset=utf-8"
                        : null;
                }
            },
            async text() {
                return '<script type="application/ld+json">{"datePublished":"2026-08-19T12:00:00Z"}</script>';
            }
        };
    }
    if (typeof originalFetch === "function") {
        return originalFetch(url, options);
    }
    throw new Error("TEST_FETCH_UNAVAILABLE");
};

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

test("provider chain falls back to JSON planning when Vertex rejects function schema state size", async () => {
    const requests = [];
    const chain = createJarvisGenAIProviderChain({
        providers: [{
            name: "vertex",
            ai: {
                models: {
                    generateContent: async request => {
                        requests.push(request);
                        if (requests.length === 1) {
                            throw new Error(
                                "The specified schema produces a constraint that has too many states for serving"
                            );
                        }
                        return {
                            text: JSON.stringify({
                                toolCalls: [{
                                    name: "conversation.respond",
                                    args: { message: "ok" },
                                    reason: "json fallback"
                                }],
                                missionComplete: false
                            })
                        };
                    }
                }
            }
        }]
    });

    const result = await chain.models.generateContent({
        contents: "Devuelve solamente JSON valido con toolCalls.",
        config: {
            temperature: 0,
            tools: [{
                functionDeclarations: [{
                    name: "jarvis_tool_0",
                    description: "conversation.respond",
                    parametersJsonSchema: {
                        type: "object",
                        properties: {
                            message: { type: "string" }
                        },
                        required: ["message"]
                    }
                }]
            }],
            toolConfig: {
                functionCallingConfig: { mode: "ANY" }
            }
        }
    });

    assert.equal(requests.length, 2);
    assert.ok(Array.isArray(requests[0].config.tools));
    assert.equal(requests[1].config.tools, undefined);
    assert.equal(requests[1].config.toolConfig, undefined);
    assert.equal(requests[1].config.responseMimeType, "application/json");
    assert.match(result.text, /conversation\.respond/);
    assert.equal(chain.lastProvider, "vertex");
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
                        return groundedResponse();
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

test("provider chain retries Google Search once when the first response has no grounding", async () => {
    const requests = [];
    const chain = createJarvisGenAIProviderChain({
        providers: [{
            name: "vertex",
            ai: {
                models: {
                    generateContent: async request => {
                        requests.push(request);
                        if (requests.length === 1) {
                            return { text: "answer from memory" };
                        }
                        return groundedResponse("verified answer");
                    }
                }
            }
        }]
    });

    const result = await chain.models.generateContent({
        contents: "Investiga las novedades actuales de una API",
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    assert.equal(requests.length, 2);
    assert.match(
        String(requests[1].contents),
        /REINTENTO_DE_GROUNDING_OBLIGATORIO/
    );
    assert.equal(result.text, "verified answer");
    assert.equal(chain.lastProvider, "vertex");
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

test("grounding redirect detection is limited to Vertex grounding redirect URLs", () => {
    assert.equal(
        isGroundingRedirectUrl("https://vertexaisearch.cloud.google.com/grounding-api-redirect/token"),
        true
    );
    assert.equal(
        isGroundingRedirectUrl("https://openai.com/api/"),
        false
    );
});

test("grounding redirect resolver returns the canonical Location without fetching the article", async () => {
    const redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/token";
    const calls = [];
    const canonical = await resolveGroundingRedirectUrl(
        redirect,
        async (url, options) => {
            calls.push({ url, options });
            return {
                url,
                headers: {
                    get(name) {
                        return String(name).toLowerCase() === "location"
                            ? "https://anthropic.com/news/example"
                            : null;
                    }
                }
            };
        }
    );

    assert.equal(canonical, "https://anthropic.com/news/example");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.redirect, "manual");
});

test("grounding metadata is rewritten to canonical source URLs before research consumes it", async () => {
    const redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/token";
    const response = {
        candidates: [{
            groundingMetadata: {
                groundingChunks: [{
                    web: {
                        uri: redirect,
                        title: "Claude API update"
                    }
                }]
            }
        }]
    };

    await canonicalizeGroundingRedirects(
        response,
        async url => ({
            url,
            headers: {
                get() {
                    return "https://www.anthropic.com/news/example";
                }
            }
        })
    );

    assert.equal(
        response.candidates[0].groundingMetadata.groundingChunks[0].web.uri,
        "https://www.anthropic.com/news/example"
    );
});
