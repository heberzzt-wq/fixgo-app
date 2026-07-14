"use strict";

const ALLOWED_SEMANTIC_REPO_TOOLS = new Set([
    "repo.scan",
    "repo.search",
    "repo.grep",
    "repo.read",
    "repo.diagnose",
    "repo.impact",
    "repo.graph",
    "repo.rankCandidates"
]);

const GENERIC_DISCOVERY_TOOLS =
    new Set([
        "repo.audit",
        "repo.scan"
    ]);

const TARGETED_DISCOVERY_TOOLS =
    new Set([
        "repo.search",
        "repo.grep",
        "repo.read",
        "repo.diagnose",
        "repo.impact",
        "repo.graph",
        "repo.rankCandidates"
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

                return;
            }

            if (Array.isArray(value)) {
                cleanArgs[key] = value
                    .filter(item => typeof item === "string")
                    .slice(0, 12)
                    .map(item => item.slice(0, 300));
            }
        });

    return cleanArgs;
}

function normalizePlannerText(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/^\s*(jarvis|heberto|gestia)[,\s:;-]*/i, "")
        .trim();
}

function extractFocusedTerms(objective = "") {
    const cleaned =
        normalizePlannerText(objective);

    const tokens =
        cleaned
            .toLowerCase()
            .match(/[a-z0-9_./-]{6,}/g) ||
        cleaned
            .toLowerCase()
            .match(/[a-z0-9_./-]{4,}/g) ||
        [];

    return [
        ...new Set(tokens)
    ]
        .slice(0, 4);
}

function makeToolCall(
    name,
    args = {},
    reason = "AI_SEMANTIC_TOOL_PLANNER"
) {
    return {
        name,
        args:
            sanitizePlannerArgs(args),
        reason,
        mutates:
            false,
        approved:
            false
    };
}

function buildFocusedDiscoveryCalls(
    objective = "",
    maxToolCalls = 8
) {
    const cleanObjective =
        normalizePlannerText(objective);

    if (!cleanObjective) {
        return [];
    }

    const focusedTerms =
        extractFocusedTerms(cleanObjective);

    const primaryTerm =
        focusedTerms[0] ||
        cleanObjective;

    const calls = [
        makeToolCall(
            "repo.rankCandidates",
            {
                query: cleanObjective,
                objective: cleanObjective,
                limit: 8
            },
            "AI_SEMANTIC_EXPLAINABLE_CANDIDATE_RANKING"
        ),
        makeToolCall(
            "repo.search",
            {
                query:
                    cleanObjective,
                term:
                    primaryTerm,
                maxMatches:
                    80
            },
            "AI_SEMANTIC_FOCUSED_DISCOVERY"
        ),
        ...focusedTerms.map(term =>
            makeToolCall(
                "repo.grep",
                {
                    term,
                    maxMatches:
                        80
                },
                "AI_SEMANTIC_FOCUSED_DISCOVERY"
            )
        )
    ];

    return calls.slice(
        0,
        Math.max(
            1,
            maxToolCalls
        )
    );
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

    const rawToolCalls =
        Array.isArray(parsedPlan?.toolCalls)
            ? parsedPlan.toolCalls
            : [];

    const requestedGenericDiscovery =
        rawToolCalls.some(call =>
            GENERIC_DISCOVERY_TOOLS.has(
                String(
                    call?.name ||
                    call?.tool ||
                    ""
                ).trim()
            )
        );

    const requestedUnsafeOnly =
        rawToolCalls.length > 0 &&
        rawToolCalls.every(call => {
            const name =
                String(
                    call?.name ||
                    call?.tool ||
                    ""
                ).trim();

            return (
                !ALLOWED_SEMANTIC_REPO_TOOLS.has(name) &&
                !GENERIC_DISCOVERY_TOOLS.has(name)
            );
        });

    const safeToolCalls =
        rawToolCalls.length > 0
            ? rawToolCalls
                .map(call => {
                    const name =
                        String(
                            call?.name ||
                            call?.tool ||
                            ""
                        ).trim();

                    if (
                        !ALLOWED_SEMANTIC_REPO_TOOLS.has(name) ||
                        name === "repo.audit"
                    ) {
                        return null;
                    }

                    return makeToolCall(
                        name,
                        call?.args || {}
                    );
                })
                .filter(Boolean)
                .slice(0, maxToolCalls)
            : [];

    const targetedToolCalls =
        safeToolCalls.filter(call =>
            TARGETED_DISCOVERY_TOOLS.has(call.name)
        );

    const shouldBuildFocusedDiscovery =
        !requestedUnsafeOnly &&
        (
            requestedGenericDiscovery ||
            (
                rawToolCalls.length === 0 &&
                parsedPlan?.intent === "REPO_INVESTIGATION"
            )
        ) &&
        targetedToolCalls.length === 0;

    const finalToolCalls =
        shouldBuildFocusedDiscovery
            ? buildFocusedDiscoveryCalls(
                parsedPlan?.objective ||
                fallbackObjective,
                maxToolCalls
            )
            : (
                targetedToolCalls.length > 0
                    ? targetedToolCalls.slice(0, maxToolCalls)
                    : safeToolCalls
            );

    return {
        intent:
            finalToolCalls.length > 0
                ? (parsedPlan?.intent || "REPO_INVESTIGATION")
                : (parsedPlan?.intent || "GENERAL_RESPONSE"),
        objective:
            parsedPlan?.objective ||
            fallbackObjective,
        toolCalls:
            finalToolCalls,
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
    buildFocusedDiscoveryCalls,
    extractFocusedTerms,
    normalizeSemanticToolPlan,
    sanitizePlannerArgs
};
