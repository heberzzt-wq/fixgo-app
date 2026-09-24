"use strict";

/*
 * COMPATIBILITY_CANARY_ONLY
 * Historical V7 lexical intent runtime is retired.
 * It must never classify natural language or choose tools.
 * The sole semantic authority is jarvisSemanticPlan backed by the local Jarvis LLM.
 */

const VERSION = "7.1.0-retired-single-jarvis-llm";

function understandServerIntentV7(raw = "", context = {}) {
    return {
        ok: false,
        retired: true,
        engine: "jarvis_intent_runtime_v7_server_retired",
        version: VERSION,
        raw: String(raw || ""),
        contextSupplied: Boolean(context && typeof context === "object"),
        intent: null,
        action: null,
        entity: null,
        target: null,
        file: null,
        value: null,
        issue: null,
        marketing: null,
        socialIntent: null,
        confidence: 0,
        needsClarification: false,
        clarification: null,
        command: null,
        planner: null,
        execution: null,
        repairHints: null,
        semanticAuthority: "jarvisSemanticPlan",
        lexicalClassification: false,
        alternateBrain: false,
        status: "LOCAL_JARVIS_LLM_REQUIRED"
    };
}

function toPublicIntentContract(intent = {}) {
    return {
        ok: false,
        retired: true,
        intent: "semantic_llm_required",
        target: null,
        confidence: 0,
        action: null,
        entity: null,
        file: null,
        value: null,
        issue: null,
        goal: null,
        objective: null,
        needsClarification: false,
        clarification: null,
        command: null,
        planner: null,
        marketing: null,
        execution: null,
        repairHints: null,
        source: intent.engine || "jarvis_intent_runtime_v7_server_retired",
        version: intent.version || VERSION,
        semanticAuthority: "jarvisSemanticPlan",
        lexicalClassification: false,
        alternateBrain: false,
        status: "LOCAL_JARVIS_LLM_REQUIRED"
    };
}

module.exports = {
    VERSION,
    understandServerIntentV7,
    toPublicIntentContract
};
