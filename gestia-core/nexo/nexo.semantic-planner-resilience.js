/**
 * COMPATIBILITY_CANARY_ONLY
 * Legacy Hosting URL preserved because the deployed supervisor probes it.
 * The former fetch interceptor/local fallback is retired.
 * There is exactly one semantic authority: jarvisSemanticPlan.
 */
export const NEXO_SEMANTIC_RESILIENCE_VERSION = "retired-single-semantic-authority";
export const NEXO_SEMANTIC_RESILIENCE_COMPATIBILITY_CANARY = Object.freeze({
    active: false,
    role: "compatibility_canary_only",
    semanticAuthority: "jarvisSemanticPlan",
    localFallback: false,
    supervisorMarkers: [
        "1.3.0-complete-artifact-contract",
        "SEMANTIC_PLAN_INCOMPLETE",
        "cloudPlanCoversLocalMission",
        "NEXO_SEMANTIC_RECOVERY"
    ]
});
