"use strict";

function normalizeProviders(providers) {
    return Array.isArray(providers)
        ? providers.filter(provider => provider?.ai?.models?.generateContent)
        : [];
}

function createJarvisGenAIProviderChain({ providers = [] } = {}) {
    const availableProviders = normalizeProviders(providers);
    let lastProvider = null;

    if (availableProviders.length === 0) {
        throw new Error("JARVIS_GENAI_PROVIDER_REQUIRED");
    }

    return {
        get lastProvider() {
            return lastProvider;
        },
        models: {
            async generateContent(request) {
                const failures = [];

                for (const provider of availableProviders) {
                    try {
                        const response = await provider.ai.models.generateContent(request);
                        if (!response) {
                            throw new Error("EMPTY_PROVIDER_RESPONSE");
                        }
                        lastProvider = String(provider.name || "genai");
                        return response;
                    }
                    catch(error) {
                        failures.push({
                            name: String(provider.name || "genai"),
                            message: String(error?.message || error || "FAILED")
                        });
                    }
                }

                const detail = failures
                    .map(failure => `${failure.name}:${failure.message}`)
                    .join(" | ");
                throw new Error(`JARVIS_GENAI_PROVIDER_CHAIN_FAILED ${detail}`);
            }
        }
    };
}

module.exports = {
    createJarvisGenAIProviderChain,
    normalizeProviders
};
