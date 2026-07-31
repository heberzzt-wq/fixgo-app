/*
 * ======================================================================================
 * NEXO TERMINAL BOOTSTRAP
 * ======================================================================================
 * Se carga antes del core de la Terminal mediante proposal-state.js.
 * Activa identidad visible, normalización de aprobaciones y resiliencia del planificador
 * sin depender de que marketing.plan o el catálogo de herramientas ya estén registrados.
 * ======================================================================================
 */

export const NEXO_TERMINAL_BOOTSTRAP_VERSION =
    "1.0.0-early-terminal-runtime";

const INSTALL_KEY = "__NEXO_TERMINAL_BOOTSTRAP__";

export async function instalarBootstrapTerminalNexo() {
    if (globalThis[INSTALL_KEY]) {
        return globalThis[INSTALL_KEY];
    }

    if (typeof window === "undefined") {
        const serverInstallation = {
            ok: true,
            active: false,
            environment: "non_browser",
            version: NEXO_TERMINAL_BOOTSTRAP_VERSION
        };
        globalThis[INSTALL_KEY] = serverInstallation;
        return serverInstallation;
    }

    const resilience = await import(
        "../../gestia-core/nexo/nexo.semantic-planner-resilience.js?v=nexo-terminal-runtime-v2-20260731"
    );

    const installation = {
        ok: true,
        active: true,
        environment: "browser",
        version: NEXO_TERMINAL_BOOTSTRAP_VERSION,
        resilienceVersion:
            resilience.NEXO_SEMANTIC_RESILIENCE_VERSION || null,
        identity:
            globalThis.__NEXO_RUNTIME_STAMP__?.name || "NEXO",
        loadedAt: new Date().toISOString()
    };

    globalThis[INSTALL_KEY] = installation;
    globalThis.__NEXO_TERMINAL_BOOT_HEALTH__ = installation;

    console.info("[NEXO_TERMINAL_BOOTSTRAP_READY]", installation);

    return installation;
}

await instalarBootstrapTerminalNexo();
