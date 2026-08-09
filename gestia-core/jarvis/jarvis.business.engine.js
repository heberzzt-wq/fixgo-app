/**
 * JARVIS BUSINESS ENGINE
 * Semantic-only compatibility facade.
 *
 * Natural-language intent classification does not happen here. The semantic
 * planner selects business.assist or marketing.plan and the selected tool
 * receives structured arguments plus the original instruction.
 */

export const BUSINESS_ENGINE_VERSION =
    "3.0.0-semantic-only";

export function runBusinessIntent(
    rawInput = "",
    context = {}
) {
    const instruction =
        typeof rawInput === "string"
            ? rawInput.trim()
            : "";

    if (!instruction) {
        return null;
    }

    const semanticResponse =
        context &&
        typeof context === "object" &&
        !Array.isArray(context)
            ? context.semanticResponse
            : null;

    if (
        semanticResponse &&
        typeof semanticResponse === "object" &&
        semanticResponse.ok === true &&
        typeof semanticResponse.message === "string" &&
        semanticResponse.message.trim()
    ) {
        return {
            ...semanticResponse,
            source:
                semanticResponse.source ||
                "BUSINESS_SEMANTIC_CONTEXT",
            version:
                BUSINESS_ENGINE_VERSION
        };
    }

    return null;
}

export const JarvisBusinessEngine = {
    version:
        BUSINESS_ENGINE_VERSION,
    routing:
        "semantic_planner_only",
    run:
        runBusinessIntent
};

if (typeof globalThis !== "undefined") {
    globalThis.JarvisBusinessEngine =
        JarvisBusinessEngine;
}
