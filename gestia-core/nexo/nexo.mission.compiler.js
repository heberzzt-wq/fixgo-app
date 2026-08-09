/**
 * COMPATIBILITY_CANARY_ONLY
 * The local NEXO language compiler was retired.
 * Tool selection and intent interpretation belong only to jarvisSemanticPlan.
 */
export const NEXO_MISSION_COMPILER_VERSION = "retired-single-semantic-authority";
export const NEXO_LOCAL_COMPILER_COMPATIBILITY_CANARY = Object.freeze({
    active: false,
    role: "compatibility_canary_only",
    semanticAuthority: "jarvisSemanticPlan",
    localIntentCompilation: false
});
