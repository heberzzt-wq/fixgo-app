/**
 * COMPATIBILITY_CANARY_ONLY
 * Legacy Hosting URL preserved because the deployed supervisor probes it.
 * No local language routing or mission compilation executes here.
 */
export const NEXO_MISSION_COMPILER_VERSION = "retired-single-semantic-authority";
export const NEXO_MISSION_COMPILER_V2_COMPATIBILITY_CANARY = Object.freeze({
    active: false,
    role: "compatibility_canary_only",
    semanticAuthority: "jarvisSemanticPlan",
    localIntentCompilation: false,
    supervisorMarkers: [
        "2.0.0-composition-to-artifact-chain",
        "NEXO_PAGE_COMPOSITION_BEFORE_ARTIFACT",
        "NEXO_DOCX_ARTIFACT_AFTER_VALIDATED_COMPOSITION",
        "document.create"
    ]
});
