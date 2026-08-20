const test = require("node:test");
const assert = require("node:assert/strict");

const {
    canonicalizeGroundingRedirects,
    isGroundingRedirectUrl,
    resolveGroundingRedirectUrl
} = require("../functions/jarvis-genai-provider-chain");

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

test("grounding redirect resolver returns the first canonical Location without fetching the article", async () => {
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
