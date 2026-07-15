const VERSION = "3.0.0-model-semantic-planner";
const ENDPOINT = "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisSemanticPlan";
const CACHE_TTL_MS = 30000;
const planCache = new Map();
const pendingPlans = new Map();

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
            args: candidate?.args && typeof candidate.args === "object" && !Array.isArray(candidate.args)
                ? candidate.args
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
    const timer = setTimeout(() => controller.abort(), 55000);

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
        const plan = await resolveSemanticPlan(
            instruction,
            catalog,
            context.semanticPlanner,
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

        return calls;
    } catch (error) {
        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: false,
            status: "SEMANTIC_PLANNER_UNAVAILABLE",
            error: error?.message || String(error),
            checkedAt: new Date().toISOString()
        };
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
    planCacheKey
};
