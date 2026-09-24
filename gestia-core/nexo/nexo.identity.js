/*
 * COMPATIBILITY_CANARY_ONLY
 * Historical NEXO identity retained only so stale imports fail safely.
 * JARVIS is the sole runtime identity and jarvisSemanticPlan is the sole semantic authority.
 */

export const NEXO_IDENTITY_VERSION = "retired-jarvis-single-authority";

export const NEXO_IDENTITY = Object.freeze({
    name: "NEXO",
    active: false,
    role: "legacy_alias_only",
    semanticAuthority: "jarvisSemanticPlan",
    alternateBrain: false,
    controllerId: "JARVIS",
    migrationMode: "retired"
});

export function describeNexoIdentity() {
    return {
        ok: true,
        compatibilityOnly: true,
        version: NEXO_IDENTITY_VERSION,
        ...NEXO_IDENTITY
    };
}

if (typeof globalThis !== "undefined") {
    globalThis.__NEXO_COMPATIBILITY_CANARY__ = Object.freeze({
        active: false,
        semanticAuthority: "jarvisSemanticPlan",
        alternateBrain: false,
        version: NEXO_IDENTITY_VERSION
    });
}
