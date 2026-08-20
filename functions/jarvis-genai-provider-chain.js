"use strict";

function normalizeProviders(providers) {
    return Array.isArray(providers)
        ? providers.filter(provider => provider?.ai?.models?.generateContent)
        : [];
}

function coarseSchemaType(schema = {}) {
    const type = String(schema?.type || "").trim().toLowerCase();
    if (["string", "number", "integer", "boolean"].includes(type)) {
        return { type };
    }
    if (type === "array") {
        const itemType = String(schema?.items?.type || "").trim().toLowerCase();
        return {
            type: "array",
            items: ["string", "number", "integer", "boolean"].includes(itemType)
                ? { type: itemType }
                : itemType === "object"
                    ? { type: "object", additionalProperties: true }
                    : {}
        };
    }
    if (type === "object" || schema?.properties) {
        return { type: "object", additionalProperties: true };
    }
    return {};
}

/**
 * Google/Vertex function calling compiles JSON Schema into a serving grammar.
 * Large enums, nested constraints, formats, patterns and numeric ranges can
 * explode the grammar state space before the model is even invoked.
 *
 * Jarvis keeps the authoritative schema in its catalog and validates the
 * returned args afterwards. The provider only needs the top-level argument
 * names, coarse JSON types and the required-field contract for tool routing.
 */
function compactProviderInputSchema(schema = null) {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        return {
            type: "object",
            additionalProperties: true
        };
    }

    const properties = schema?.properties && typeof schema.properties === "object"
        ? schema.properties
        : {};
    const entries = Object.entries(properties).slice(0, 32);

    if (entries.length === 0) {
        return {
            type: "object",
            additionalProperties: true
        };
    }

    const compactProperties = Object.fromEntries(
        entries.map(([name, propertySchema]) => [
            String(name).slice(0, 80),
            coarseSchemaType(propertySchema)
        ])
    );
    const allowedNames = new Set(Object.keys(compactProperties));
    const required = Array.isArray(schema?.required)
        ? schema.required
            .map(String)
            .filter(name => allowedNames.has(name))
            .slice(0, 32)
        : [];

    return {
        type: "object",
        properties: compactProperties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: true
    };
}

function compactFunctionDeclaration(declaration = {}) {
    if (!declaration || typeof declaration !== "object") return declaration;

    const sourceSchema =
        declaration.parametersJsonSchema ||
        declaration.parameters;
    if (!sourceSchema) return declaration;

    const compactSchema = compactProviderInputSchema(sourceSchema);
    const result = {
        ...declaration,
        description: String(declaration.description || "").slice(0, 320)
    };

    if (declaration.parametersJsonSchema) {
        result.parametersJsonSchema = compactSchema;
    }
    if (declaration.parameters) {
        result.parameters = compactSchema;
    }

    return result;
}

function sanitizeGenerateContentRequest(request) {
    const tools = request?.config?.tools;
    if (!Array.isArray(tools)) return request;

    let changed = false;
    const compactTools = tools.map(tool => {
        const declarations = tool?.functionDeclarations;
        if (!Array.isArray(declarations)) return tool;
        changed = true;
        return {
            ...tool,
            functionDeclarations: declarations.map(compactFunctionDeclaration)
        };
    });

    if (!changed) return request;

    return {
        ...request,
        config: {
            ...request.config,
            tools: compactTools
        }
    };
}

function isPermanentProviderFailure(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return (
        message.includes("api_key_invalid") ||
        message.includes("api key not valid") ||
        message.includes("gemini_key_missing")
    );
}

function createJarvisGenAIProviderChain({ providers = [] } = {}) {
    const availableProviders = normalizeProviders(providers);
    const disabledProviders = new Map();
    let lastProvider = null;

    if (availableProviders.length === 0) {
        throw new Error("JARVIS_GENAI_PROVIDER_REQUIRED");
    }

    return {
        get lastProvider() {
            return lastProvider;
        },
        get disabledProviders() {
            return Object.fromEntries(disabledProviders);
        },
        models: {
            async generateContent(request) {
                const failures = [];
                const providerRequest = sanitizeGenerateContentRequest(request);

                for (const provider of availableProviders) {
                    const providerName = String(provider.name || "genai");
                    if (disabledProviders.has(providerName)) {
                        failures.push({
                            name: providerName,
                            message: `DISABLED_${disabledProviders.get(providerName)}`
                        });
                        continue;
                    }

                    try {
                        const response = await provider.ai.models.generateContent(providerRequest);
                        if (!response) {
                            throw new Error("EMPTY_PROVIDER_RESPONSE");
                        }
                        lastProvider = providerName;
                        return response;
                    }
                    catch(error) {
                        const message = String(error?.message || error || "FAILED");
                        failures.push({
                            name: providerName,
                            message
                        });
                        if (isPermanentProviderFailure(error)) {
                            disabledProviders.set(providerName, "INVALID_CREDENTIAL");
                        }
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
    compactProviderInputSchema,
    createJarvisGenAIProviderChain,
    isPermanentProviderFailure,
    normalizeProviders,
    sanitizeGenerateContentRequest
};
