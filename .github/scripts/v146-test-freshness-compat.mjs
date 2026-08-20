import fs from 'node:fs';

const providerTestPath = 'tests/jarvis-genai-provider-chain.test.cjs';
let source = fs.readFileSync(providerTestPath, 'utf8');

if (!source.includes('__V146_TEST_FRESH_SOURCE_FETCH__')) {
    const marker = '}\n\ntest("provider chain continues from an invalid developer key to Vertex AI", async () => {';
    const replacement = `}

// __V146_TEST_FRESH_SOURCE_FETCH__
const __v146NativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
    const target = String(url || "");
    if (
        target.startsWith("https://example.com/source") ||
        target.startsWith("https://developers.example.com/changelog")
    ) {
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
    if (typeof __v146NativeFetch === "function") {
        return __v146NativeFetch(url, options);
    }
    throw new Error("V146_TEST_FETCH_UNAVAILABLE");
};

test("provider chain continues from an invalid developer key to Vertex AI", async () => {`;

    const index = source.indexOf(marker);
    if (index < 0) throw new Error('V146_TEST_COMPAT_MARKER_MISSING');
    source = source.slice(0, index) + replacement + source.slice(index + marker.length);
} else if (!source.includes('developers.example.com/changelog')) {
    source = source.replace(
        'if (target.startsWith("https://example.com/source")) {',
        'if (\n        target.startsWith("https://example.com/source") ||\n        target.startsWith("https://developers.example.com/changelog")\n    ) {'
    );
}

if (!source.includes('__V146_FACT_LEVEL_FRESHNESS__')) {
    source += `

// __V146_FACT_LEVEL_FRESHNESS__
function __v146FactFreshnessResponse(claim) {
    return {
        text: claim,
        candidates: [{
            groundingMetadata: {
                groundingChunks: [{
                    web: {
                        uri: "https://developers.example.com/changelog",
                        title: "API changelog"
                    }
                }],
                groundingSupports: [{
                    segment: { text: claim },
                    groundingChunkIndices: [0]
                }]
            }
        }]
    };
}

test("provider rejects an old grounded fact even when its changelog page is freshly modified", async () => {
    let attempts = 0;
    const chain = createJarvisGenAIProviderChain({
        providers: [{
            name: "vertex",
            ai: {
                models: {
                    generateContent: async () => {
                        attempts += 1;
                        return __v146FactFreshnessResponse(
                            "El 2 de junio de 2026 se actualizo la facturacion de sesiones de contenedores."
                        );
                    }
                }
            }
        }]
    });

    await assert.rejects(
        chain.models.generateContent({
            contents: "Investiga las novedades actuales de la API",
            config: { tools: [{ googleSearch: {} }] }
        }),
        /FRESHNESS_UNVERIFIED/
    );
    assert.equal(attempts, 3);
});

test("provider accepts a recent grounded fact from an aggregate changelog when the support carries its own date", async () => {
    const chain = createJarvisGenAIProviderChain({
        providers: [{
            name: "vertex",
            ai: {
                models: {
                    generateContent: async () =>
                        __v146FactFreshnessResponse(
                            "El 6 de agosto de 2026 se actualizo un modelo disponible mediante la API."
                        )
                }
            }
        }]
    });

    const result = await chain.models.generateContent({
        contents: "Investiga las novedades actuales de la API",
        config: { tools: [{ googleSearch: {} }] }
    });

    assert.equal(result.jarvisFreshness.required, true);
    assert.equal(result.jarvisFreshness.supportFreshCount, 1);
    assert.equal(result.jarvisFreshness.supportStaleCount, 0);
    assert.equal(
        result.jarvisFreshness.supports[0].evidence,
        "EXPLICIT_GROUNDED_SUPPORT_DATE"
    );
});
`;
}

fs.writeFileSync(providerTestPath, source);

const researchTestPath = 'tests/jarvis-web-research.test.cjs';
let research = fs.readFileSync(researchTestPath, 'utf8');

if (!research.includes('__V146_FACT_FILTER_RESEARCH__')) {
    research += `

// __V146_FACT_FILTER_RESEARCH__
test("grounded research filters stale facts before composing a domain-scoped current answer", async () => {
    const oldClaim = "El 2 de junio de 2026 cambio la facturacion de sesiones.";
    const freshClaim = "El 6 de agosto de 2026 se actualizo un modelo de la API.";
    const response = {
        text: oldClaim + "\\n" + freshClaim,
        jarvisFreshness: {
            required: true,
            sources: [{
                url: "https://example.com/changelog",
                publishedAt: "2026-08-19T12:00:00.000Z",
                fresh: true
            }],
            supports: [{
                key: oldClaim.toLowerCase(),
                text: oldClaim,
                fresh: false,
                evidence: "EXPLICIT_GROUNDED_SUPPORT_DATE_STALE",
                verifiedAt: "2026-06-02T12:00:00.000Z"
            }, {
                key: freshClaim.toLowerCase(),
                text: freshClaim,
                fresh: true,
                evidence: "EXPLICIT_GROUNDED_SUPPORT_DATE",
                verifiedAt: "2026-08-06T12:00:00.000Z"
            }]
        },
        candidates: [{
            groundingMetadata: {
                groundingChunks: [{
                    web: {
                        uri: "https://example.com/changelog",
                        title: "Example API changelog"
                    }
                }],
                groundingSupports: [{
                    segment: { text: oldClaim },
                    groundingChunkIndices: [0]
                }, {
                    segment: { text: freshClaim },
                    groundingChunkIndices: [0]
                }]
            }
        }]
    };
    const ai = {
        models: {
            async generateContent() {
                return response;
            }
        }
    };

    const result = await runJarvisWebResearch({
        ai,
        query: "Novedades actuales de la API",
        allowedDomain: "example.com"
    });

    assert.equal(result.facts.length, 1);
    assert.equal(result.facts[0].claim, freshClaim);
    assert.match(result.answer, /6 de agosto de 2026/);
    assert.doesNotMatch(result.answer, /2 de junio de 2026/);
    assert.equal(result.policy.freshnessRequired, true);
    assert.equal(result.policy.freshnessVerified, true);
    assert.equal(result.policy.staleFactsFiltered, 1);
});
`;
}

fs.writeFileSync(researchTestPath, research);
console.log('V146_TEST_FRESHNESS_COMPAT_APPLIED=true');
