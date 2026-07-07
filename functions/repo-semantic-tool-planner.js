"use strict";

const ALLOWED_SEMANTIC_REPO_TOOLS = new Set([
    "repo.audit",
    "repo.scan",
    "repo.search",
    "repo.grep",
    "repo.read",
    "repo.diagnose",
    "repo.impact"
]);

function sanitizePlannerArgs(args = {}) {
    if (
        !args ||
        typeof args !== "object" ||
        Array.isArray(args)
    ) {
        return {};
    }

    const cleanArgs = {};

    Object
        .entries(args)
        .slice(0, 20)
        .forEach(([key, value]) => {
            if (
                typeof key !== "string" ||
                key.length > 80
            ) {
                return;
            }

            if (typeof value === "string") {
                cleanArgs[key] =
                    value.slice(0, 1200);

                return;
            }

            if (
                typeof value === "number" &&
                Number.isFinite(value)
            ) {
                cleanArgs[key] =
                    value;

                return;
            }

            if (typeof value === "boolean") {
                cleanArgs[key] =
                    value;
            }
        });

    return cleanArgs;
}

function normalizeSemanticToolPlan(
    parsedPlan = {},
    options = {}
) {
    const fallbackObjective =
        options.fallbackObjective || "";

    const maxToolCalls =
        Number.isInteger(options.maxToolCalls)
            ? options.maxToolCalls
            : 8;

    const safeToolCalls =
        Array.isArray(parsedPlan?.toolCalls)
            ? parsedPlan.toolCalls
                .map(call => {
                    const name =
                        String(
                            call?.name ||
                            call?.tool ||
                            ""
                        ).trim();

                    if (
                        !ALLOWED_SEMANTIC_REPO_TOOLS.has(name)
                    ) {
                        return null;
                    }

                    return {
                        name,
                        args:
                            sanitizePlannerArgs(
                                call?.args || {}
                            ),
                        reason:
                            "AI_SEMANTIC_TOOL_PLANNER",
                        mutates:
                            false,
                        approved:
                            false
                    };
                })
                .filter(Boolean)
                .slice(0, maxToolCalls)
            : [];

    return {
        intent:
            safeToolCalls.length > 0
                ? (parsedPlan?.intent || "REPO_INVESTIGATION")
                : (parsedPlan?.intent || "GENERAL_RESPONSE"),
        objective:
            parsedPlan?.objective ||
            fallbackObjective,
        toolCalls:
            safeToolCalls,
        writeAllowed:
            false,
        requiresApprovalForWrite:
            true,
        confidence:
            typeof parsedPlan?.confidence === "number"
                ? parsedPlan.confidence
                : 0.5
    };
}

module.exports = {
    ALLOWED_SEMANTIC_REPO_TOOLS,
    normalizeSemanticToolPlan,
    sanitizePlannerArgs
};
