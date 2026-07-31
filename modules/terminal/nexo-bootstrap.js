/*
 * ======================================================================================
 * NEXO TERMINAL BOOTSTRAP
 * ======================================================================================
 * Se carga antes del core de la Terminal mediante proposal-state.js.
 * Activa identidad visible, normalización de aprobaciones, resiliencia del planificador
 * y herramientas de medios reales sin depender de marketing.plan ni del catálogo legacy.
 * ======================================================================================
 */

export const NEXO_TERMINAL_BOOTSTRAP_VERSION =
    "1.1.0-real-media-runtime";

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
        "../../gestia-core/nexo/nexo.semantic-planner-resilience.js?v=nexo-terminal-runtime-v3-20260731"
    );
    const realMediaTools = await import(
        "../../gestia-core/nexo/nexo.real-media.tools.js?v=nexo-real-media-runtime-v1-20260731"
    );

    const toolsInstallation =
        realMediaTools.installNexoRealMediaTools();

    const installation = {
        ok: true,
        active: true,
        environment: "browser",
        version: NEXO_TERMINAL_BOOTSTRAP_VERSION,
        resilienceVersion:
            resilience.NEXO_SEMANTIC_RESILIENCE_VERSION || null,
        realMediaToolsVersion:
            realMediaTools.NEXO_REAL_MEDIA_TOOLS_VERSION || null,
        realMediaToolsInstalling: true,
        identity:
            globalThis.__NEXO_RUNTIME_STAMP__?.name || "NEXO",
        loadedAt: new Date().toISOString()
    };

    globalThis[INSTALL_KEY] = installation;
    globalThis.__NEXO_TERMINAL_BOOT_HEALTH__ = installation;

    toolsInstallation.then(result => {
        const settled = {
            ...installation,
            realMediaToolsInstalling: false,
            realMediaToolsActive:
                result?.active === true,
            realMediaToolsStatus:
                result?.status ||
                (result?.active === true ? "READY" : "INACTIVE"),
            realMediaToolsInstalledAt:
                result?.installedAt || null
        };
        globalThis[INSTALL_KEY] = settled;
        globalThis.__NEXO_TERMINAL_BOOT_HEALTH__ = settled;
        console.info("[NEXO_REAL_MEDIA_TOOLS_READY]", result);
    });

    console.info("[NEXO_TERMINAL_BOOTSTRAP_READY]", installation);

    return installation;
}

await instalarBootstrapTerminalNexo();
