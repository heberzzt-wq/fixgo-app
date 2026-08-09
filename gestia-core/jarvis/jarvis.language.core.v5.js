/**
 * JARVIS LANGUAGE CORE — LEGACY SEMANTIC COMPATIBILITY
 *
 * Natural-language interpretation was retired from this module. The semantic planner
 * is the only component allowed to decide meaning. This file only adapts an already
 * structured semantic envelope for old callers that have not migrated yet.
 */

const VERSION = "6.0.0-semantic-envelope-only";

function structuredActions(value = null) {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        return [];
    }

    const actions =
        Array.isArray(value.actions)
            ? value.actions
            : Array.isArray(value.semanticActions)
                ? value.semanticActions
                : [];

    return actions
        .filter(action =>
            action &&
            typeof action === "object" &&
            !Array.isArray(action)
        )
        .slice(0, 12)
        .map(action => ({
            raw:
                typeof action.raw === "string"
                    ? action.raw
                    : "",
            intent:
                action.intent ?? null,
            entity:
                action.entity ?? null,
            command:
                typeof action.command === "string" &&
                action.command.trim()
                    ? action.command.trim()
                    : null,
            native:
                action.native === true,
            filters:
                action.filters &&
                typeof action.filters === "object" &&
                !Array.isArray(action.filters)
                    ? action.filters
                    : {},
            confidence:
                Number.isFinite(Number(action.confidence))
                    ? Number(action.confidence)
                    : null
        }));
}

export function parseHumanCommand(input = null) {
    const actions =
        structuredActions(input);
    const structured =
        input &&
        typeof input === "object" &&
        !Array.isArray(input);

    return {
        ok:
            structured &&
            actions.length > 0,
        status:
            structured &&
            actions.length > 0
                ? "SEMANTIC_ACTIONS_READY"
                : "SEMANTIC_ACTIONS_REQUIRED",
        source:
            "LANGUAGE_CORE_SEMANTIC_ADAPTER",
        raw:
            typeof input?.raw === "string"
                ? input.raw
                : typeof input === "string"
                    ? input
                    : "",
        actions,
        timestamp:
            Date.now()
    };
}

export function toLegacyCommands(parsed = null) {
    const actions =
        Array.isArray(parsed?.actions)
            ? parsed.actions
            : [];

    return actions
        .map(action =>
            typeof action?.command === "string"
                ? action.command.trim()
                : ""
        )
        .filter(Boolean);
}

export async function translate(input = null) {
    return toLegacyCommands(
        parseHumanCommand(input)
    );
}

function structuredField(value, field, fallback) {
    if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        value[field] !== undefined &&
        value[field] !== null
    ) {
        return value[field];
    }
    return fallback;
}

export const JarvisLanguageCore = {
    version: VERSION,
    routing: "semantic_envelope_only",
    parseHumanCommand,
    toLegacyCommands,
    translate,
    detectMode(value = null) {
        return structuredField(
            value,
            "mode",
            "SUPERVISED"
        );
    },
    detectPriority(value = null) {
        return structuredField(
            value,
            "priority",
            "NORMAL"
        );
    },
    detectDomain(value = null) {
        return structuredField(
            value,
            "domain",
            "GENERAL"
        );
    },
    async interpretExecutive(input = null) {
        const parsed =
            parseHumanCommand(input);
        return {
            raw: parsed.raw,
            commands:
                toLegacyCommands(parsed),
            mode:
                this.detectMode(input),
            priority:
                this.detectPriority(input),
            domain:
                this.detectDomain(input),
            supervised:
                this.detectMode(input) ===
                    "SUPERVISED",
            proposal:
                structuredField(
                    input,
                    "proposal",
                    null
                ),
            semanticRequired:
                parsed.ok !== true,
            timestamp_exec:
                new Date().toISOString()
        };
    },
    async smartTranslate(input = null) {
        return await this.interpretExecutive(input);
    }
};

if (typeof globalThis !== "undefined") {
    globalThis.JarvisLanguageCore =
        JarvisLanguageCore;
}

console.log(
    "🧠 [LANG_V6] SEMANTIC ENVELOPE ONLY",
    VERSION
);
