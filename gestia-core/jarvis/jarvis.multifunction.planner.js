const VERSION = "3.3.0-resilient-browser-semantic-recovery";
const ENDPOINT = "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisSemanticPlan";
const CACHE_TTL_MS = 30000;
const planCache = new Map();
const pendingPlans = new Map();

function extractJsonObject(value = "") {
    const source = String(value || "");
    let start = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (quoted) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === '"') quoted = false;
            continue;
        }
        if (character === '"') quoted = true;
        else if (character === "{") {
            if (start < 0) start = index;
            depth += 1;
        } else if (character === "}" && start >= 0) {
            depth -= 1;
            if (depth === 0) return JSON.parse(source.slice(start, index + 1));
        }
    }
    throw new Error("CLIENT_MISSION_CONTRACT_JSON_REQUIRED");
}

async function callBrowserMissionContract(input = "", catalog = []) {
    if (typeof fetch !== "function") throw new Error("CLIENT_MISSION_CONTRACT_FETCH_REQUIRED");
    const instruction = String(input || "");
    const boundedInstruction = instruction.length <= 12000
        ? instruction
        : `${instruction.slice(0, 8000)}\n[PARTE_MEDIA_PERSISTIDA]\n${instruction.slice(-3500)}`;
    const prompt = [
        "Eres el planificador semantico de Jarvis V7.",
        "Devuelve solamente JSON valido.",
        "CONTRATO COMPLETO: enumera en toolCalls todas las herramientas read-only necesarias para TODOS los entregables, no solo la primera etapa. No omitas landing, imagen, reel, inventario o autoevaluacion cuando se pidan. Conserva el orden y usa missionComplete=false.",
        `CATALOGO=${catalog.map(tool => tool.name).join(",")}`,
        `INSTRUCCION=${boundedInstruction}`
    ].join("\n");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    let lastError = null;
    try {
        for (const seed of [84, 85, 86, 87, 88]) {
            try {
                const response = await fetch(
                    `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai-fast&seed=${seed}&json=true`,
                    { signal: controller.signal }
                );
                if (!response.ok) throw new Error(`CLIENT_MISSION_CONTRACT_HTTP_${response.status}`);
                const plan = extractJsonObject(await response.text());
                if (!Array.isArray(plan?.toolCalls) || plan.toolCalls.length === 0) {
                    throw new Error("CLIENT_MISSION_CONTRACT_EMPTY");
                }
                return {
                    ...plan,
                    ok: true,
                    status: "SEMANTIC_PLAN_READY",
                    provider: "pollinations-browser-json",
                    model: "openai-fast"
                };
            } catch (error) {
                lastError = error;
            }
        }
    } finally {
        clearTimeout(timer);
    }
    throw lastError || new Error("CLIENT_MISSION_CONTRACT_UNAVAILABLE");
}

async function callBrowserSemanticPlan(input = "", catalog = [], missionState = null) {
    if (typeof fetch !== "function") throw new Error("CLIENT_SEMANTIC_PLAN_FETCH_REQUIRED");
    const instruction = String(input || "");
    const boundedInstruction = instruction.length <= 12000
        ? instruction
        : `${instruction.slice(0, 8000)}\n[PARTE_MEDIA_PERSISTIDA]\n${instruction.slice(-3500)}`;
    const prompt = [
        "Eres el planificador semantico de herramientas de Jarvis V7.",
        "Interpreta significado, typos, negaciones y ordenes mixtas. Selecciona exclusivamente nombres exactos del catalogo.",
        "No autorices escrituras. Conserva todas las intenciones independientes y usa herramientas especializadas para entregables operativos.",
        "Si una investigacion limita fuentes a un dominio, copia el dominio exacto en allowedDomain de web.research.",
        "Devuelve solamente JSON valido con toolCalls, missionComplete=false y explanation.",
        `CATALOGO=${catalog.map(tool => tool.name).join(",")}`,
        missionState ? `ESTADO_DE_MISION=${JSON.stringify(missionState).slice(0, 12000)}` : "",
        `INSTRUCCION=${boundedInstruction}`
    ].join("\n");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    let lastError = null;
    try {
        for (const seed of [42, 43, 44]) {
            try {
                const response = await fetch(
                    `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai-fast&seed=${seed}&json=true`,
                    { signal: controller.signal }
                );
                if (!response.ok) throw new Error(`CLIENT_SEMANTIC_PLAN_HTTP_${response.status}`);
                const plan = extractJsonObject(await response.text());
                if (!Array.isArray(plan?.toolCalls) || plan.toolCalls.length === 0) {
                    throw new Error("CLIENT_SEMANTIC_PLAN_EMPTY");
                }
                return {
                    ...plan,
                    ok: true,
                    status: "SEMANTIC_PLAN_READY",
                    provider: "pollinations-browser-json",
                    model: "openai-fast"
                };
            } catch (error) {
                lastError = error;
            }
        }
    } finally {
        clearTimeout(timer);
    }
    throw lastError || new Error("CLIENT_SEMANTIC_PLAN_UNAVAILABLE");
}

function runtimeCatalog(context = {}) {
    const supplied = Array.isArray(context.toolCatalog)
        ? context.toolCatalog
        : null;
    const registered = globalThis?.JarvisToolRuntime?.list?.();
    const source = supplied || (Array.isArray(registered) ? registered : []);

    return source
        .filter(tool => tool?.name && typeof tool.name === "string")
        .slice(0, 60)
        .map(tool => ({
            name: tool.name,
            description: String(tool.description || "").slice(0, 500),
            mutates: tool.mutates === true,
            requiresApproval: tool.requiresApproval === true,
            inputSchema: tool.inputSchema && typeof tool.inputSchema === "object"
                ? tool.inputSchema
                : null
        }));
}

function trustedPlanCalls(plan = {}, catalog = [], context = {}) {
    const allowed = new Map(catalog.map(tool => [tool.name, tool]));
    const candidates = Array.isArray(plan?.toolCalls) ? plan.toolCalls : [];
    const seen = new Set();
    const calls = [];

    for (const candidate of candidates.slice(0, 12)) {
        const tool = allowed.get(String(candidate?.name || ""));
        if (!tool || seen.has(tool.name)) continue;
        seen.add(tool.name);

        calls.push({
            name: tool.name,
            args: (candidate?.args || candidate?.arguments) &&
                typeof (candidate.args || candidate.arguments) === "object" &&
                !Array.isArray(candidate.args || candidate.arguments)
                ? (candidate.args || candidate.arguments)
                : {},
            reason: String(candidate?.reason || "MODEL_SEMANTIC_TOOL_SELECTION").slice(0, 240),
            mutates: tool.mutates,
            approved: tool.mutates === true && context.approved === true
        });
    }

    return calls;
}

async function callSemanticPlanner(input = "", catalog = [], missionState = null) {
    const user = globalThis?.auth?.currentUser || globalThis?.window?.auth?.currentUser || null;
    if (!user) {
        throw new Error("SEMANTIC_PLANNER_AUTH_REQUIRED");
    }

    const token = await user.getIdToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 110000);

    try {
        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ data: { input, catalog, missionState } }),
            signal: controller.signal
        });
        const text = await response.text();
        let payload;

        try {
            payload = JSON.parse(text);
        } catch {
            throw new Error(`SEMANTIC_PLANNER_INVALID_RESPONSE_${response.status}`);
        }

        const result = payload?.result || payload?.data;
        if (!response.ok || !result?.ok) {
            throw new Error(
                payload?.error?.message ||
                result?.error ||
                `SEMANTIC_PLANNER_HTTP_${response.status}`
            );
        }

        return result;
    } finally {
        clearTimeout(timer);
    }
}

function planCacheKey(input = "", catalog = [], missionState = null) {
    return JSON.stringify({
        input,
        missionState,
        tools: catalog.map(tool => ({
            name: tool.name,
            mutates: tool.mutates,
            requiresApproval: tool.requiresApproval
        }))
    });
}

async function resolveSemanticPlan(input = "", catalog = [], semanticPlanner = null, missionState = null) {
    const key = planCacheKey(input, catalog, missionState);
    const cached = planCache.get(key);

    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
        return cached.plan;
    }

    if (pendingPlans.has(key)) {
        return pendingPlans.get(key);
    }

    const request = Promise.resolve()
        .then(() => typeof semanticPlanner === "function"
            ? semanticPlanner({ input, catalog, missionState })
            : callSemanticPlanner(input, catalog, missionState))
        .then(plan => {
            planCache.set(key, { plan, savedAt: Date.now() });
            return plan;
        })
        .finally(() => pendingPlans.delete(key));

    pendingPlans.set(key, request);
    return request;
}

export function mergeJarvisToolCalls(...groups) {
    const merged = [];
    const seen = new Set();

    for (const call of groups.flat()) {
        if (!call?.name) continue;
        const key = `${call.name}:${JSON.stringify(call.args || {})}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(call);
    }

    return merged.slice(0, 12);
}

export function isJarvisTechnicalDiagnosticRequest(planOrCalls = []) {
    const calls = Array.isArray(planOrCalls)
        ? planOrCalls
        : Array.isArray(planOrCalls?.toolCalls)
            ? planOrCalls.toolCalls
            : [];

    return calls.some(call =>
        String(call?.name || "").startsWith("repo.") &&
        call?.name !== "repo.gitStatus" &&
        call?.name !== "repo.gitDiff"
    );
}

export function isJarvisCapabilityForensicsRequest(planOrCalls = []) {
    const calls = Array.isArray(planOrCalls)
        ? planOrCalls
        : Array.isArray(planOrCalls?.toolCalls)
            ? planOrCalls.toolCalls
            : [];
    return calls.some(call => call?.name === "system.forensics");
}

export async function buildJarvisMultifunctionToolCalls(input = "", context = {}) {
    const instruction = String(input || "").trim();
    if (!instruction) return [];

    const catalog = runtimeCatalog(context);
    if (catalog.length === 0) {
        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: false,
            status: "TOOL_CATALOG_REQUIRED",
            checkedAt: new Date().toISOString()
        };
        return [];
    }

    try {
        const contractPlanner = context?.missionState?.phase === "MISSION_CONTRACT" &&
            typeof context.semanticPlanner !== "function"
            ? async ({ input: contractInput, catalog: contractCatalog, missionState }) => {
                try {
                    return await callSemanticPlanner(
                        contractInput,
                        contractCatalog,
                        missionState
                    );
                } catch (cloudError) {
                    try {
                        return await callBrowserMissionContract(contractInput, contractCatalog);
                    } catch (browserError) {
                        throw new Error(
                            `CLOUD_${cloudError?.message || "FAILED"}__BROWSER_${browserError?.message || "FAILED"}`
                        );
                    }
                }
            }
            : context.semanticPlanner;
        const plan = await resolveSemanticPlan(
            instruction,
            catalog,
            contractPlanner,
            context.missionState || null
        );
        const calls = trustedPlanCalls(plan, catalog, context);

        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: plan?.ok === true,
            status: plan?.status || "SEMANTIC_PLAN_READY",
            provider: plan?.provider || "injected",
            model: plan?.model || null,
            toolCount: calls.length,
            checkedAt: new Date().toISOString()
        };

        Object.defineProperties(calls, {
            missionComplete: {
                value: plan?.missionComplete === true,
                enumerable: false
            },
            completionAssessment: {
                value: plan?.completionAssessment || null,
                enumerable: false
            }
        });

        return calls;
    } catch (error) {
        if (
            context?.missionState?.phase !== "MISSION_CONTRACT" &&
            typeof context.semanticPlanner !== "function"
        ) {
            try {
                const fallbackPlan = await callBrowserSemanticPlan(
                    instruction,
                    catalog,
                    context.missionState || null
                );
                const fallbackCalls = trustedPlanCalls(fallbackPlan, catalog, context);
                globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
                    ok: true,
                    status: fallbackPlan.status,
                    provider: fallbackPlan.provider,
                    model: fallbackPlan.model,
                    toolCount: fallbackCalls.length,
                    toolNames: fallbackCalls.map(call => call.name),
                    recoveredFrom: error?.message || String(error),
                    checkedAt: new Date().toISOString()
                };
                return fallbackCalls;
            } catch (browserFallbackError) {
                error = new Error(
                    `CLOUD_${error?.message || "FAILED"}__BROWSER_${browserFallbackError?.message || "FAILED"}`
                );
            }
        }
        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: false,
            status: "SEMANTIC_PLANNER_UNAVAILABLE",
            error: error?.message || String(error),
            checkedAt: new Date().toISOString()
        };
        if (context.throwOnUnavailable === true) throw error;
        return [];
    }
}

export function describeJarvisMultifunctionPlanner() {
    return {
        ok: true,
        version: VERSION,
        maximumToolCalls: 12,
        architecture: "model_selected_runtime_catalog",
        mutates: false,
        failMode: "closed",
        approvalSource: "trusted_runtime_context"
    };
}

export const __test = {
    runtimeCatalog,
    trustedPlanCalls,
    planCacheKey,
    extractJsonObject,
    callBrowserMissionContract,
    callBrowserSemanticPlan
};
