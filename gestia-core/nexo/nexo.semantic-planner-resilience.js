/*
 * ======================================================================================
 * NEXO SEMANTIC PLANNER RESILIENCE
 * ======================================================================================
 * Intercepta únicamente jarvisSemanticPlan.
 * - Respeta respuestas cloud completas.
 * - Recupera fallos HTTP, red, JSON, planes vacíos o cadenas de artefacto incompletas.
 * - Nunca intercepta otros endpoints.
 * ======================================================================================
 */

import "./nexo.ui.branding.js";

import {
    compileNexoMission,
    NEXO_MISSION_COMPILER_VERSION
} from "./nexo.mission.compiler.v2.js";

export const NEXO_SEMANTIC_RESILIENCE_VERSION = "1.4.0-semantic-intent-authority";

const INSTALL_KEY = "__NEXO_SEMANTIC_PLANNER_RESILIENCE__";
const SEMANTIC_ENDPOINT =
    "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisSemanticPlan";

function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (typeof Request !== "undefined" && input instanceof Request) {
        return input.url;
    }
    return "";
}

function parseRequestPayload(input, init = {}) {
    const body = init?.body;
    if (typeof body !== "string") return null;
    try {
        const payload = JSON.parse(body);
        return payload?.data || payload || null;
    } catch (_) {
        return null;
    }
}

function requiredToolNames(localPlan) {
    return new Set(
        (Array.isArray(localPlan?.toolCalls) ? localPlan.toolCalls : [])
            .map(call => String(call?.name || "").trim())
            .filter(Boolean)
    );
}

function cloudPlanCoversLocalMission(result, localPlan) {
    if (!localPlan) return true;
    const required = requiredToolNames(localPlan);
    if (required.size === 0) return true;

    const cloudNames = new Set(
        (Array.isArray(result?.toolCalls) ? result.toolCalls : [])
            .map(call => String(call?.name || "").trim())
            .filter(Boolean)
    );

    return [...required].every(name => cloudNames.has(name));
}

function localCompilerMayAssist(requestPayload = null) {
    const phase = String(
        requestPayload?.missionState?.phase || ""
    ).trim();
    const toolName = String(
        requestPayload?.missionState?.toolName || ""
    ).trim();

    return (
        phase === "GROUNDED_ARGUMENT_COMPLETION" &&
        toolName.length > 0
    );
}

async function responseHasUsefulPlan(response, localPlan = null) {
    if (!response?.ok) return false;
    try {
        const text = await response.clone().text();
        const payload = JSON.parse(text);
        const result = payload?.result || payload?.data;
        if (result?.ok !== true) return false;
        if (result?.missionComplete === true) {
            return !localPlan || requiredToolNames(localPlan).size === 0;
        }
        if (!Array.isArray(result?.toolCalls) || result.toolCalls.length === 0) {
            return false;
        }
        return cloudPlanCoversLocalMission(result, localPlan);
    } catch (_) {
        return false;
    }
}

function fallbackResponse(plan, recoveredFrom) {
    const payload = {
        result: {
            ...plan,
            recoveredFrom: String(recoveredFrom || "SEMANTIC_PLAN_NOT_EXECUTABLE"),
            resilienceVersion: NEXO_SEMANTIC_RESILIENCE_VERSION,
            compilerVersion: NEXO_MISSION_COMPILER_VERSION
        }
    };

    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
}

function recordHealth(plan, recoveredFrom) {
    if (typeof globalThis === "undefined") return;

    globalThis.__NEXO_SEMANTIC_RESILIENCE_HEALTH__ = {
        ok: true,
        status: plan?.status || "NEXO_LOCAL_MISSION_READY",
        provider: plan?.provider || "nexo-local-compiler",
        identity: plan?.identity || "NEXO",
        toolCount: Array.isArray(plan?.toolCalls) ? plan.toolCalls.length : 0,
        toolNames: Array.isArray(plan?.toolCalls)
            ? plan.toolCalls.map(call => call?.name).filter(Boolean)
            : [],
        recoveredFrom: String(recoveredFrom || "SEMANTIC_PLAN_NOT_EXECUTABLE"),
        checkedAt: new Date().toISOString(),
        version: NEXO_SEMANTIC_RESILIENCE_VERSION
    };
}

export function instalarResilienciaSemanticaNexo() {
    if (globalThis[INSTALL_KEY]) return globalThis[INSTALL_KEY];
    if (typeof globalThis.fetch !== "function") {
        throw new Error("FETCH_UNAVAILABLE");
    }
    if (typeof Response === "undefined") {
        throw new Error("RESPONSE_API_UNAVAILABLE");
    }

    const nativeFetch = globalThis.fetch.bind(globalThis);

    const resilientFetch = async (input, init = undefined) => {
        if (requestUrl(input) !== SEMANTIC_ENDPOINT) {
            return nativeFetch(input, init);
        }

        const requestPayload = parseRequestPayload(input, init || {});
        const localPlan = localCompilerMayAssist(requestPayload)
            ? compileNexoMission({
                input: requestPayload?.input || "",
                catalog: requestPayload?.catalog || [],
                missionState: requestPayload?.missionState || null,
                context: {
                    objectiveId: requestPayload?.missionState?.objectiveId || "",
                    caseId: requestPayload?.missionState?.caseId || ""
                }
            })
            : null;

        let cloudResponse = null;
        let cloudFailure = null;

        try {
            cloudResponse = await nativeFetch(input, init);
            if (await responseHasUsefulPlan(cloudResponse, localPlan)) {
                return cloudResponse;
            }
            cloudFailure = localPlan
                ? `SEMANTIC_PLAN_INCOMPLETE_HTTP_${cloudResponse.status}`
                : `SEMANTIC_PLAN_NOT_EXECUTABLE_HTTP_${cloudResponse.status}`;
        } catch (error) {
            cloudFailure = error?.message || String(error);
        }

        if (!localPlan) {
            if (cloudResponse) return cloudResponse;
            throw new Error(
                `NEXO_LOCAL_PLAN_NOT_APPLICABLE__${cloudFailure || "CLOUD_UNAVAILABLE"}`
            );
        }

        recordHealth(localPlan, cloudFailure);
        console.warn("[NEXO_SEMANTIC_RECOVERY]", {
            recoveredFrom: cloudFailure,
            status: localPlan.status,
            tools: localPlan.toolCalls?.map(call => call.name) || []
        });

        return fallbackResponse(localPlan, cloudFailure);
    };

    Object.defineProperty(resilientFetch, "__nexoSemanticResilience", {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false
    });

    globalThis.fetch = resilientFetch;

    const installation = {
        version: NEXO_SEMANTIC_RESILIENCE_VERSION,
        endpoint: SEMANTIC_ENDPOINT,
        uninstall() {
            if (globalThis.fetch === resilientFetch) {
                globalThis.fetch = nativeFetch;
            }
            delete globalThis[INSTALL_KEY];
        }
    };

    globalThis[INSTALL_KEY] = installation;
    return installation;
}

instalarResilienciaSemanticaNexo();

export const __test = {
    requiredToolNames,
    cloudPlanCoversLocalMission,
    localCompilerMayAssist,
    responseHasUsefulPlan
};
