"use strict";

function normalizeProviders(providers) {
    return Array.isArray(providers)
        ? providers.filter(provider => provider?.ai?.models?.generateContent)
        : [];
}

function normalizeFreshnessSignalText(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function collectRequestText(value, depth = 0) {
    if (value == null || depth > 4) return "";
    if (typeof value === "string" || typeof value === "number") {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value
            .slice(0, 24)
            .map(item => collectRequestText(item, depth + 1))
            .filter(Boolean)
            .join(" ");
    }
    if (typeof value !== "object") return "";
    return Object.values(value)
        .slice(0, 24)
        .map(item => collectRequestText(item, depth + 1))
        .filter(Boolean)
        .join(" ");
}

function requestUsesGoogleSearch(request = {}) {
    const tools = request?.config?.tools;
    return Array.isArray(tools) &&
        tools.some(tool => tool && typeof tool === "object" && tool.googleSearch);
}

function requestUsesFunctionDeclarations(request = {}) {
    const tools = request?.config?.tools;
    return Array.isArray(tools) &&
        tools.some(tool =>
            Array.isArray(tool?.functionDeclarations) &&
            tool.functionDeclarations.length > 0
        );
}

function requestNeedsFreshness(request = {}) {
    if (!requestUsesGoogleSearch(request)) return false;
    const text = normalizeFreshnessSignalText(
        collectRequestText(request?.contents)
    );
    return /\b(hoy|today|actual|actuales|actualidad|reciente|recientes|latest|current|recent|novedad|novedades|nuevo|nueva|nuevos|nuevas|ultimo|ultima|ultimos|ultimas)\b/.test(text);
}

function freshnessGuardInstruction(now = new Date()) {
    const reference =
        now instanceof Date && Number.isFinite(now.getTime())
            ? now
            : new Date();
    const date = reference.toISOString().slice(0, 10);
    const year = reference.getUTCFullYear();
    return [
        `FECHA_DE_REFERENCIA_WEB=${date}.`,
        `La solicitud exige actualidad. Formula consultas que incluyan ${year} cuando ayude a distinguir resultados recientes.`,
        `Prioriza fuentes publicadas o actualizadas en ${year} y verifica la fecha antes de llamarlas actuales, recientes, nuevas o de hoy.`,
        "No presentes como novedad actual una fuente antigua solo porque siga indexada o describa un producto todavía existente.",
        `Si ninguna fuente permite verificar actualidad respecto de ${date}, dilo explicitamente como FRESCURA_NO_VERIFICADA en vez de rellenar con informacion historica.`
    ].join("\n");
}

function applyFreshnessGuardToGroundedRequest(
    request,
    now = new Date()
) {
    if (!requestNeedsFreshness(request)) return request;

    const instruction = freshnessGuardInstruction(now);
    const contents = request?.contents;
    if (typeof contents === "string") {
        return {
            ...request,
            contents: `${contents}\n${instruction}`
        };
    }
    if (Array.isArray(contents)) {
        return {
            ...request,
            contents: [
                ...contents,
                instruction
            ]
        };
    }
    return request;
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
                    ? { type: "object" }
                    : {}
        };
    }
    if (type === "object" || schema?.properties) {
        return { type: "object" };
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
        return { type: "object" };
    }

    const properties = schema?.properties && typeof schema.properties === "object"
        ? schema.properties
        : {};
    const entries = Object.entries(properties).slice(0, 32);

    if (entries.length === 0) {
        return { type: "object" };
    }

    const compactProperties = Object.fromEntries(
        entries.map(([name, propertySchema]) => [
            String(name),
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
        ...(required.length > 0 ? { required } : {})
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
    const guardedRequest =
        applyFreshnessGuardToGroundedRequest(request);
    const tools = guardedRequest?.config?.tools;
    if (!Array.isArray(tools)) return guardedRequest;

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

    if (!changed) return guardedRequest;

    return {
        ...guardedRequest,
        config: {
            ...guardedRequest.config,
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

function isTransientProviderFailure(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return (
        message.includes("resource_exhausted") ||
        message.includes("deadline_exceeded") ||
        message.includes("service unavailable") ||
        message.includes("temporarily unavailable") ||
        message.includes("internal server error") ||
        message.includes("timeout") ||
        /(^|\D)(429|500|502|503|504)(\D|$)/.test(message)
    );
}

function isSchemaStateExplosion(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return (
        message.includes("too many states") ||
        message.includes("constraint that has too many states")
    );
}

function buildJsonPlanningFallbackRequest(request = {}) {
    if (!requestUsesFunctionDeclarations(request)) return request;
    const config = request?.config && typeof request.config === "object"
        ? request.config
        : {};
    const {
        tools: _tools,
        toolConfig: _toolConfig,
        ...restConfig
    } = config;

    return {
        ...request,
        config: {
            ...restConfig,
            responseMimeType: "application/json"
        }
    };
}

function responseHasGroundingEvidence(response = {}) {
    const candidates = Array.isArray(response?.candidates)
        ? response.candidates
        : [];
    return candidates.some(candidate => {
        const metadata = candidate?.groundingMetadata;
        const chunks = Array.isArray(metadata?.groundingChunks)
            ? metadata.groundingChunks
            : [];
        const supports = Array.isArray(metadata?.groundingSupports)
            ? metadata.groundingSupports
            : [];
        const hasWebSource = chunks.some(chunk =>
            Boolean(String(chunk?.web?.uri || "").trim())
        );
        const hasSupport = supports.some(support =>
            Array.isArray(support?.groundingChunkIndices) &&
            support.groundingChunkIndices.length > 0
        );
        return hasWebSource && hasSupport;
    });
}

function appendGroundingRetryDirective(request = {}) {
    const directive = [
        "REINTENTO_DE_GROUNDING_OBLIGATORIO:",
        "La respuesta anterior no produjo grounding verificable.",
        "Ejecuta Google Search en esta llamada y responde solo con hechos respaldados por groundingMetadata.",
        "No respondas desde memoria ni omitas las fuentes consultadas."
    ].join("\n");
    const contents = request?.contents;
    if (typeof contents === "string") {
        return {
            ...request,
            contents: `${contents}\n${directive}`
        };
    }
    if (Array.isArray(contents)) {
        return {
            ...request,
            contents: [...contents, directive]
        };
    }
    return request;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isGroundingRedirectUrl(value = "") {
    try {
        const url = new URL(String(value || ""));
        return (
            url.hostname === "vertexaisearch.cloud.google.com" &&
            url.pathname.includes("/grounding-api-redirect/")
        );
    }
    catch {
        return false;
    }
}

async function resolveGroundingRedirectUrl(
    value = "",
    fetchImpl = globalThis.fetch
) {
    const original = String(value || "").trim();
    if (!original || !isGroundingRedirectUrl(original)) return original;
    if (typeof fetchImpl !== "function") return original;

    try {
        const response = await fetchImpl(original, {
            method: "GET",
            redirect: "manual",
            headers: {
                "User-Agent": "Mozilla/5.0 JarvisGroundingResolver/1.0"
            },
            signal: AbortSignal.timeout(2500)
        });
        const location = String(response?.headers?.get?.("location") || "").trim();
        if (location) {
            const resolved = new URL(location, original).toString();
            if (!isGroundingRedirectUrl(resolved)) return resolved;
        }
        const finalUrl = String(response?.url || "").trim();
        if (finalUrl && !isGroundingRedirectUrl(finalUrl)) return finalUrl;
    }
    catch {}

    return original;
}

async function canonicalizeGroundingRedirects(
    response,
    fetchImpl = globalThis.fetch
) {
    const candidates = Array.isArray(response?.candidates)
        ? response.candidates
        : [];
    const targets = [];

    for (const candidate of candidates) {
        const chunks = candidate?.groundingMetadata?.groundingChunks;
        if (!Array.isArray(chunks)) continue;
        for (const chunk of chunks) {
            const web = chunk?.web;
            const uri = String(web?.uri || "").trim();
            if (!web || !isGroundingRedirectUrl(uri)) continue;
            targets.push({ web, uri });
            if (targets.length >= 8) break;
        }
        if (targets.length >= 8) break;
    }

    if (targets.length === 0) return response;

    await Promise.all(
        targets.map(async target => {
            const canonical = await resolveGroundingRedirectUrl(target.uri, fetchImpl);
            if (canonical && canonical !== target.uri) {
                try {
                    target.web.uri = canonical;
                }
                catch {}
            }
        })
    );

    return response;
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
                const wantsGrounding = requestUsesGoogleSearch(providerRequest);

                for (const provider of availableProviders) {
                    const providerName = String(provider.name || "genai");
                    if (disabledProviders.has(providerName)) {
                        failures.push({
                            name: providerName,
                            message: `DISABLED_${disabledProviders.get(providerName)}`
                        });
                        continue;
                    }

                    const maximumAttempts = 2;
                    let activeRequest = providerRequest;
                    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
                        try {
                            const response = await provider.ai.models.generateContent(activeRequest);
                            if (!response) {
                                throw new Error("EMPTY_PROVIDER_RESPONSE");
                            }

                            if (
                                wantsGrounding &&
                                !responseHasGroundingEvidence(response)
                            ) {
                                failures.push({
                                    name: providerName,
                                    message:
                                        attempt > 1
                                            ? `RETRY_${attempt}:GOOGLE_SEARCH_UNGROUNDED`
                                            : "GOOGLE_SEARCH_UNGROUNDED"
                                });
                                if (attempt < maximumAttempts) {
                                    activeRequest =
                                        appendGroundingRetryDirective(providerRequest);
                                    await sleep(180 * attempt);
                                    continue;
                                }
                                break;
                            }

                            await canonicalizeGroundingRedirects(response);
                            lastProvider = providerName;
                            return response;
                        }
                        catch(error) {
                            const message = String(error?.message || error || "FAILED");
                            failures.push({
                                name: providerName,
                                message: attempt > 1 ? `RETRY_${attempt}:${message}` : message
                            });

                            if (
                                isSchemaStateExplosion(error) &&
                                requestUsesFunctionDeclarations(providerRequest)
                            ) {
                                try {
                                    const jsonFallbackRequest =
                                        buildJsonPlanningFallbackRequest(providerRequest);
                                    const fallbackResponse =
                                        await provider.ai.models.generateContent(jsonFallbackRequest);
                                    if (!fallbackResponse) {
                                        throw new Error("EMPTY_SCHEMA_JSON_FALLBACK_RESPONSE");
                                    }
                                    await canonicalizeGroundingRedirects(fallbackResponse);
                                    lastProvider = providerName;
                                    return fallbackResponse;
                                }
                                catch(fallbackError) {
                                    failures.push({
                                        name: providerName,
                                        message: `SCHEMA_JSON_FALLBACK:${String(
                                            fallbackError?.message ||
                                            fallbackError ||
                                            "FAILED"
                                        )}`
                                    });
                                    if (isPermanentProviderFailure(fallbackError)) {
                                        disabledProviders.set(providerName, "INVALID_CREDENTIAL");
                                    }
                                    break;
                                }
                            }

                            if (isPermanentProviderFailure(error)) {
                                disabledProviders.set(providerName, "INVALID_CREDENTIAL");
                                break;
                            }

                            if (
                                attempt < maximumAttempts &&
                                isTransientProviderFailure(error)
                            ) {
                                await sleep(180 * attempt);
                                activeRequest = providerRequest;
                                continue;
                            }

                            break;
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
    appendGroundingRetryDirective,
    applyFreshnessGuardToGroundedRequest,
    buildJsonPlanningFallbackRequest,
    canonicalizeGroundingRedirects,
    compactProviderInputSchema,
    createJarvisGenAIProviderChain,
    freshnessGuardInstruction,
    isGroundingRedirectUrl,
    isPermanentProviderFailure,
    isSchemaStateExplosion,
    isTransientProviderFailure,
    normalizeProviders,
    requestNeedsFreshness,
    requestUsesFunctionDeclarations,
    requestUsesGoogleSearch,
    resolveGroundingRedirectUrl,
    responseHasGroundingEvidence,
    sanitizeGenerateContentRequest
};
