/* =====================================================================================
   JARVIS INTENT RUNTIME — SEMANTIC ENVELOPE COMPATIBILITY

   Natural-language meaning is resolved by the semantic planner. This module does not
   classify text, score keywords, search synonyms, or infer intent from local patterns.
===================================================================================== */

const VERSION = "8.0.0-semantic-envelope";

function state() {
    const root =
        typeof globalThis !== "undefined"
            ? globalThis
            : {};

    root.__JARVIS_INTENT_RUNTIME_V7__ ||= {
        version: VERSION,
        lastEnvelope: null,
        history: []
    };

    return root.__JARVIS_INTENT_RUNTIME_V7__;
}

function semanticEnvelope(value = null) {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        return null;
    }

    const source =
        value.semanticIntent &&
        typeof value.semanticIntent === "object" &&
        !Array.isArray(value.semanticIntent)
            ? value.semanticIntent
            : value;

    return {
        intent:
            source.intent ?? null,
        action:
            source.action ?? null,
        entity:
            source.entity ?? null,
        target:
            source.target ?? null,
        file:
            source.file ?? null,
        value:
            source.value ?? null,
        issue:
            source.issue ?? null,
        marketing:
            source.marketing &&
            typeof source.marketing === "object" &&
            !Array.isArray(source.marketing)
                ? source.marketing
                : null,
        socialIntent:
            source.socialIntent ?? null,
        confidence:
            Number.isFinite(Number(source.confidence))
                ? Number(source.confidence)
                : null,
        needsClarification:
            source.needsClarification === true,
        clarification:
            typeof source.clarification === "string"
                ? source.clarification
                : null,
        command:
            typeof source.command === "string" &&
            source.command.trim()
                ? source.command.trim()
                : null,
        planner:
            source.planner &&
            typeof source.planner === "object" &&
            !Array.isArray(source.planner)
                ? source.planner
                : null,
        source:
            source.source ||
            "SEMANTIC_PLANNER"
    };
}

function remember(result = {}) {
    const memory = state();
    memory.lastEnvelope = {
        ...result,
        raw: undefined
    };
    memory.history.push({
        at: Date.now(),
        intent: result.intent,
        action: result.action,
        entity: result.entity,
        target: result.target,
        file: result.file,
        issue: result.issue,
        command: result.command,
        source: result.source
    });
    if (memory.history.length > 50) {
        memory.history.shift();
    }
}

export function understandIntentV7(input = null) {
    const envelope =
        semanticEnvelope(input);

    if (!envelope) {
        return {
            ok: false,
            engine: "jarvis_intent_runtime_v7",
            version: VERSION,
            status: "SEMANTIC_INTENT_REQUIRED",
            raw:
                typeof input === "string"
                    ? input
                    : "",
            intent: null,
            action: null,
            entity: null,
            target: null,
            file: null,
            value: null,
            issue: null,
            marketing: null,
            socialIntent: null,
            confidence: null,
            needsClarification: true,
            clarification:
                "La intención debe venir del planner semántico; este runtime ya no interpreta lenguaje con reglas locales.",
            command: null,
            planner: null,
            execution: null,
            repairHints: null,
            source: "SEMANTIC_PLANNER_REQUIRED"
        };
    }

    const result = {
        ok: true,
        engine: "jarvis_intent_runtime_v7",
        version: VERSION,
        status: "SEMANTIC_INTENT_READY",
        raw:
            typeof input?.raw === "string"
                ? input.raw
                : "",
        ...envelope,
        execution:
            envelope.planner?.execution ||
            null,
        repairHints:
            envelope.planner?.repairHints ||
            null
    };

    remember(result);
    return result;
}

export function toLegacyCommandV7(input = null) {
    return understandIntentV7(input).command;
}

export function resetIntentRuntimeV7() {
    const memory = state();
    memory.lastEnvelope = null;
    memory.history = [];
    return memory;
}

const root =
    typeof globalThis !== "undefined"
        ? globalThis
        : {};

root.JarvisIntentRuntimeV7 = {
    version: VERSION,
    routing: "semantic_envelope_only",
    understand: understandIntentV7,
    toCommand: toLegacyCommandV7,
    reset: resetIntentRuntimeV7,
    dump: state
};

console.log("🧠 [JARVIS_INTENT_RUNTIME_V7] SEMANTIC ONLY", VERSION);
