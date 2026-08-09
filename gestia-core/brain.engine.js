/**
 * COMPATIBILITY_CANARY_ONLY
 * Legacy URL preserved for deployed health probes.
 * Cognitive authority: jarvisSemanticPlan only.
 * This module intentionally exports metadata and performs no planning.
 */
export const LEGACY_BRAIN_COMPATIBILITY_CANARY = Object.freeze({
    active: false,
    role: "compatibility_canary_only",
    semanticAuthority: "jarvisSemanticPlan",
    alternateBrains: 0,
    supervisorMarkers: [
        "const semanticToolPlan",
        "patchPreviewAllowed: false",
        "model_semantic_planner"
    ]
});
