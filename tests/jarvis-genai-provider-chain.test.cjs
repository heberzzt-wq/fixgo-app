const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createJarvisGenAIProviderChain,
    normalizeProviders
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
