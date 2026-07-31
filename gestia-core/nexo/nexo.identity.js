/*
 * ======================================================================================
 * NEXO — NÚCLEO EJECUTIVO NO-CODE DE ORQUESTACIÓN
 * ======================================================================================
 * Identidad pública privada del motor operativo de Peninsula Tech.
 *
 * Compatibilidad:
 * - Los archivos y símbolos Jarvis/SIA7 permanecen temporalmente como API interna legacy.
 * - La interfaz y la nueva arquitectura deben usar NEXO.
 * - No concede autoridad adicional ni elimina controles de aprobación existentes.
 * ======================================================================================
 */

export const NEXO_IDENTITY_VERSION = "1.0.0-private-peninsula-engine";

export const NEXO_IDENTITY = Object.freeze({
    name: "NEXO",
    expandedName: "Núcleo Ejecutivo No-Code de Orquestación",
    owner: "Heberto Mendoza",
    organization: "Peninsula Tech",
    visibility: "private",
    purpose:
        "Convertir una instrucción natural en una misión trazable, ejecutable y verificable usando herramientas privadas de Peninsula Tech.",
    principles: Object.freeze([
        "one_instruction_one_mission",
        "evidence_before_claims",
        "fail_loud_never_silent",
        "local_artifacts_before_publication",
        "human_authority_for_external_or_irreversible_actions",
        "legacy_jarvis_compatibility_during_migration"
    ]),
    controllerId: "PENINSULA_NEXO",
    authorityId: "HEBERTO_MENDOZA",
    legacyAliases: Object.freeze([
        "Jarvis",
        "SIA7",
        "CODEX_SIA7"
    ])
});

export function describeNexoIdentity() {
    return {
        ok: true,
        version: NEXO_IDENTITY_VERSION,
        ...NEXO_IDENTITY
    };
}

if (typeof globalThis !== "undefined") {
    globalThis.NexoIdentity = NEXO_IDENTITY;
    globalThis.describeNexoIdentity = describeNexoIdentity;

    // Alias de transición: no rompe módulos legacy que todavía buscan identidad Jarvis.
    globalThis.__PENINSULA_PRIVATE_ENGINE__ = {
        identity: NEXO_IDENTITY,
        legacyRuntimeNamesPreserved: true,
        migrationMode: "additive"
    };
}
