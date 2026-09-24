"use strict";

/*
 * COMPATIBILITY_VALIDATOR_ONLY
 * Historical repo semantic planner retained for stale callers.
 * It does not infer intent, extract keywords, route language, or fabricate tool calls.
 * The sole semantic authority is the Jarvis LLM planner.
 */

const ALLOWED_SEMANTIC_REPO_TOOLS = new Set([
    "repo.scan",
    "repo.search",
    "repo.grep",
    "repo.read",
    "repo.diagnose",
    "repo.impact",
    "repo.graph",
    "repo.rankCandidates",
    "repo.architectReview"
]);

function sanitizePlannerArgs(args = {}) {
    if (!args || typeof args !== "object" || Array.isArray(args)) return {};

    const cleanArgs = {};
    for (const [key, value] of Object.entries(args).slice(0, 20)) {
        if (typeof key !== "string" || key.length > 80) continue;
        if (typeof value === "string") {
            cleanArgs[key] = value.slice(0, 12000);
            continue;
        }
        if (typeof value === "number" && Number.isFinite(value)) {
            cleanArgs[key] = value;
            continue;
        }
        if (typeof value === "boolean") {
            cleanArgs[key] = value;
            continue;
        }
        if (Array.isArray(value)) {
            cleanArgs[key] = value
                .filter(item => ["string", "number", "boolean"].includes(typeof item))
                .slice(0, 50);
            continue;
        }
        if (value && typeof value === "object") {
            const serialized = JSON.stringify(value);
            if (serialized.length <= 20000) cleanArgs[key] = JSON.parse(serialized);
        }
    }
    return cleanArgs;
}

function makeToolCall(name, args = {}, reason = "MODEL_SEMANTIC_TOOL_SELECTION") {
    return {
        name,
        args: sanitizePlannerArgs(args),
        reason,
        mutates: false,
        approved: false
    };
}

// Compatibility exports intentionally return no inferred language features.
function extractFocusedTerms() {
    return [];
}

function buildFocusedDiscoveryCalls() {
    return [];
}

function normalizeSemanticToolPlan(parsedPlan = {}, options = {}) {
    const maxToolCalls =
        Number.isInteger(options.maxToolCalls)
            ? Math.max(1, Math.min(12, options.maxToolCalls))
            : 8;

    const rawToolCalls =
        Array.isArray(parsedPlan?.toolCalls)
            ? parsedPlan.toolCalls
            : [];

    const toolCalls = rawToolCalls
        .map(call => {
            const name = String(call?.name || call?.tool || "").trim();
            if (!ALLOWED_SEMANTIC_REPO_TOOLS.has(name)) return null;
            return makeToolCall(
                name,
                call?.args || {},
                String(call?.reason || "MODEL_SEMANTIC_TOOL_SELECTION").slice(0, 240)
            );
        })
        .filter(Boolean)
        .slice(0, maxToolCalls);

    return {
        intent:
            String(
                parsedPlan?.intent ||
                (toolCalls.length > 0 ? "MODEL_TOOL_PLAN" : "GENERAL_RESPONSE")
            ).trim(),
        objective:
            String(
                parsedPlan?.objective ||
                options.fallbackObjective ||
                ""
            ).trim(),
        toolCalls,
        writeAllowed: false,
        requiresApprovalForWrite: true,
        confidence:
            typeof parsedPlan?.confidence === "number"
                ? parsedPlan.confidence
                : 0.5,
        semanticAuthority: "jarvisSemanticPlan",
        inferredToolCalls: false
    };
}

module.exports = {
    ALLOWED_SEMANTIC_REPO_TOOLS,
    buildFocusedDiscoveryCalls,
    extractFocusedTerms,
    normalizeSemanticToolPlan,
    sanitizePlannerArgs
};
