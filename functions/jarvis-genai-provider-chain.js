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
    const guardedRequest = applyFreshnessGuardToGroundedRequest(request);
    const sourceConfig = guardedRequest?.config && typeof guardedRequest.config === "object" ? guardedRequest.config : null;
    let sanitizedConfig = sourceConfig;
    if (sourceConfig && String(guardedRequest?.model || "").startsWith("gemini-3.")) {
        const { temperature: _temperature, topP: _topP, topK: _topK, frequencyPenalty: _frequencyPenalty, presencePenalty: _presencePenalty, ...supported } = sourceConfig;
        sanitizedConfig = supported;
    }
    const tools = sanitizedConfig?.tools;
    if (!Array.isArray(tools)) return sanitizedConfig === sourceConfig ? guardedRequest : { ...guardedRequest, config: sanitizedConfig };
    let changed = sanitizedConfig !== sourceConfig;
    const compactTools = tools.map(tool => {
        const declarations = tool?.functionDeclarations;
        if (!Array.isArray(declarations)) return tool;
        changed = true;
        return { ...tool, functionDeclarations: declarations.map(compactFunctionDeclaration) };
    });
    if (!changed) return guardedRequest;
    return { ...guardedRequest, config: { ...(sanitizedConfig || {}), tools: compactTools } };
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

function freshnessWindowDays(request = {}) {
    const text = normalizeFreshnessSignalText(
        collectRequestText(request?.contents)
    );
    if (/\b(hoy|today)\b/.test(text)) return 2;
    if (/\b(esta semana|this week|semana|week)\b/.test(text)) return 8;
    if (/\b(este mes|this month|mes|month)\b/.test(text)) return 35;
    if (/\b(este ano|this year|ano|year)\b/.test(text)) return 370;
    return requestNeedsFreshness(request) ? 60 : null;
}

function extractPublicationDatesFromHtml(html = '') {
    const source = String(html || '').slice(0, 900000);
    const patterns = [
        /["']datePublished["']\s*:\s*["']([^"']+)["']/gi,
        /["']dateModified["']\s*:\s*["']([^"']+)["']/gi,
        /<meta[^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|date|datePublished|dateModified)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
        /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|date|datePublished|dateModified)["'][^>]*>/gi,
        /<time[^>]+datetime=["']([^"']+)["'][^>]*>/gi
    ];
    const values = [];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(source)) && values.length < 24) {
            const parsed = new Date(String(match[1] || '').trim());
            if (Number.isFinite(parsed.getTime())) values.push(parsed);
        }
    }
    return values
        .sort((left, right) => right.getTime() - left.getTime())
        .map(value => value.toISOString());
}

function groundingSourceUrls(response = {}) {
    const urls = [];
    const seen = new Set();
    for (const candidate of Array.isArray(response?.candidates) ? response.candidates : []) {
        const chunks = Array.isArray(candidate?.groundingMetadata?.groundingChunks)
            ? candidate.groundingMetadata.groundingChunks
            : [];
        for (const chunk of chunks) {
            const url = String(chunk?.web?.uri || '').trim();
            if (!url || seen.has(url)) continue;
            try {
                if (new URL(url).protocol !== 'https:') continue;
            } catch {
                continue;
            }
            seen.add(url);
            urls.push(url);
            if (urls.length >= 6) return urls;
        }
    }
    return urls;
}

async function inspectGroundingFreshness(
    response = {},
    request = {},
    fetchImpl = globalThis.fetch,
    now = new Date()
) {
    const windowDays = freshnessWindowDays(request);
    if (!windowDays) {
        return {
            required: false,
            verified: true,
            windowDays: null,
            cutoffDate: null,
            freshCount: 0,
            datedCount: 0,
            inspectedCount: 0,
            sources: []
        };
    }

    const reference = now instanceof Date && Number.isFinite(now.getTime())
        ? now
        : new Date();
    const cutoffMs = reference.getTime() - (windowDays * 86400000);
    const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);
    const urls = groundingSourceUrls(response);

    if (typeof fetchImpl !== 'function' || urls.length === 0) {
        return {
            required: true,
            verified: false,
            windowDays,
            cutoffDate,
            freshCount: 0,
            datedCount: 0,
            inspectedCount: urls.length,
            sources: urls.map(url => ({ url, publishedAt: null, fresh: false }))
        };
    }

    const inspected = await Promise.all(
        urls.map(async url => {
            try {
                const page = await fetchImpl(url, {
                    method: 'GET',
                    redirect: 'follow',
                    headers: {
                        'User-Agent': 'JarvisFreshnessVerifier/1.0',
                        'Accept': 'text/html,application/xhtml+xml'
                    },
                    signal: AbortSignal.timeout(2800)
                });
                if (!page?.ok) return { url, publishedAt: null, fresh: false };
                const contentType = String(page.headers?.get?.('content-type') || '').toLowerCase();
                if (contentType && !contentType.includes('html')) {
                    return { url, publishedAt: null, fresh: false };
                }
                const dates = extractPublicationDatesFromHtml(await page.text());
                const publishedAt = dates[0] || null;
                const timestamp = publishedAt ? Date.parse(publishedAt) : Number.NaN;
                const fresh = Number.isFinite(timestamp) &&
                    timestamp >= cutoffMs &&
                    timestamp <= reference.getTime() + 86400000;
                return { url, publishedAt, fresh };
            } catch {
                return { url, publishedAt: null, fresh: false };
            }
        })
    );

    const freshCount = inspected.filter(item => item.fresh).length;
    const datedCount = inspected.filter(item => item.publishedAt).length;
    return {
        required: true,
        verified: freshCount > 0,
        windowDays,
        cutoffDate,
        freshCount,
        datedCount,
        inspectedCount: inspected.length,
        sources: inspected
    };
}

function appendFreshnessSourceRetryDirective(request = {}, freshness = {}) {
    const cutoffDate = String(freshness?.cutoffDate || '').trim();
    const directive = [
        'REINTENTO_DE_FRESCURA_VERIFICABLE:',
        'Las fuentes anteriores no demostraron una fecha suficientemente reciente' + (cutoffDate ? ' (corte ' + cutoffDate + ')' : '') + '.',
        'Busca resultados mas recientes y prioriza paginas individuales con fecha de publicacion o modificacion verificable.',
        'No uses como novedad una pagina indice o historica sin fecha verificable.',
        'Si no existe una fuente reciente verificable, responde FRESCURA_NO_VERIFICADA en vez de presentar hechos antiguos como actuales.'
    ].join('\n');
    const contents = request?.contents;
    if (typeof contents === 'string') {
        return { ...request, contents: String(contents) + '\n' + directive };
    }
    if (Array.isArray(contents)) {
        return { ...request, contents: [...contents, directive] };
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

function requestRequiresExecutableSemanticPlan(request = {}) {
    if (requestUsesFunctionDeclarations(request)) return true;
    const text = collectRequestText(request?.contents);
    return /CONTRATO_DE_MISION|MISSION_CONTRACT|GROUNDED_ARGUMENT_COMPLETION|COMPLETION_AUDIT|AUDITORIA_FINAL_OBLIGATORIA|AUDITORIA_DE_CIERRE_CONTROLADA/.test(text);
}

function responseHasExecutableSemanticPlan(response = {}, request = {}) {
    if (!requestRequiresExecutableSemanticPlan(request)) return true;
    if (Array.isArray(response?.functionCalls) && response.functionCalls.length > 0) return true;
    const parts = Array.isArray(response?.candidates?.[0]?.content?.parts) ? response.candidates[0].content.parts : [];
    if (parts.some(part => part?.functionCall?.name)) return true;
    const text = String(response?.text || "").trim();
    if (!text) return false;
    try {
        const payload = JSON.parse(text);
        return (Array.isArray(payload?.toolCalls) && payload.toolCalls.length > 0) || payload?.missionComplete === true;
    } catch { return false; }
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

                    const maximumAttempts = wantsGrounding ? 3 : 2;
                    let activeRequest = providerRequest;
                    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
                        try {
                            const response = await provider.ai.models.generateContent(activeRequest);
                            if (!response) {
                                throw new Error("EMPTY_PROVIDER_RESPONSE");
                            }
                            if (!responseHasExecutableSemanticPlan(response, providerRequest)) {
                                throw new Error("SEMANTIC_PLAN_EMPTY");
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

                            if (
                                wantsGrounding &&
                                requestNeedsFreshness(request)
                            ) {
                                const freshness =
                                    await inspectGroundingFreshness(
                                        response,
                                        request
                                    );
                                if (!freshness.verified) {
                                    failures.push({
                                        name: providerName,
                                        message: `FRESHNESS_UNVERIFIED:cutoff=${freshness.cutoffDate || 'unknown'}:dated=${freshness.datedCount}:fresh=${freshness.freshCount}`
                                    });
                                    if (attempt < maximumAttempts) {
                                        activeRequest =
                                            appendFreshnessSourceRetryDirective(
                                                appendGroundingRetryDirective(providerRequest),
                                                freshness
                                            );
                                        await sleep(180 * attempt);
                                        continue;
                                    }
                                    break;
                                }
                                try {
                                    response.jarvisFreshness = freshness;
                                } catch {}
                            }

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
                                    if (!responseHasExecutableSemanticPlan(fallbackResponse, jsonFallbackRequest)) {
                                        throw new Error("SEMANTIC_PLAN_EMPTY");
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
    appendFreshnessSourceRetryDirective,
    extractPublicationDatesFromHtml,
    freshnessWindowDays,
    groundingSourceUrls,
    inspectGroundingFreshness,
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
    responseHasExecutableSemanticPlan,
    responseHasGroundingEvidence,
    sanitizeGenerateContentRequest
};
