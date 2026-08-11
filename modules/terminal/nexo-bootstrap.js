/*
 * ======================================================================================
 * NEXO TERMINAL BOOTSTRAP
 * ======================================================================================
 * Se carga antes del core de la Terminal mediante proposal-state.js.
 * Activa identidad visible, normalización de aprobaciones
 * y herramientas de medios reales sin depender de marketing.plan ni del catálogo legacy.
 * ======================================================================================
 */

export const NEXO_TERMINAL_BOOTSTRAP_VERSION =
    "1.6.0-real-media-runtime-authority-v128";

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

    const realMediaTools = await import(
        "../../gestia-core/nexo/nexo.real-media.tools.js?v=v94-real-media-reel-hydration-v127-20260811"
    );
    const runtimeMediaGuard = await import(
        "../../gestia-core/nexo/nexo.real-media.runtime-guard-v128.js?v=v94-real-media-runtime-authority-v128-20260811"
    );

    const toolsInstallation =
        realMediaTools.installNexoRealMediaTools();
    const guardInstallation =
        runtimeMediaGuard.installNexoRealMediaRuntimeGuard();

    const installation = {
        ok: true,
        active: true,
        environment: "browser",
        version: NEXO_TERMINAL_BOOTSTRAP_VERSION,
        realMediaToolsVersion:
            realMediaTools.NEXO_REAL_MEDIA_TOOLS_VERSION || null,
        runtimeMediaGuardVersion:
            runtimeMediaGuard.NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION || null,
        realMediaToolsInstalling: true,
        runtimeMediaGuardInstalling: true,
        identity:
            globalThis.__NEXO_RUNTIME_STAMP__?.name || "NEXO",
        loadedAt: new Date().toISOString()
    };

    globalThis[INSTALL_KEY] = installation;
    globalThis.__NEXO_TERMINAL_BOOT_HEALTH__ = installation;

    Promise.all([toolsInstallation, guardInstallation]).then(([toolsResult, guardResult]) => {
        const settled = {
            ...installation,
            realMediaToolsInstalling: false,
            runtimeMediaGuardInstalling: false,
            realMediaToolsActive:
                toolsResult?.active === true,
            realMediaToolsStatus:
                toolsResult?.status ||
                (toolsResult?.active === true ? "READY" : "INACTIVE"),
            realMediaToolsInstalledAt:
                toolsResult?.installedAt || null,
            runtimeMediaGuardActive:
                guardResult?.active === true,
            runtimeMediaGuardStatus:
                guardResult?.status ||
                (guardResult?.active === true ? "READY" : "INACTIVE"),
            runtimeMediaGuardInstalledAt:
                guardResult?.installedAt || null
        };
        globalThis[INSTALL_KEY] = settled;
        globalThis.__NEXO_TERMINAL_BOOT_HEALTH__ = settled;
        console.info("[NEXO_REAL_MEDIA_TOOLS_READY]", toolsResult);
        console.info("[NEXO_REAL_MEDIA_RUNTIME_GUARD_READY]", guardResult);
    });

    console.info("[NEXO_TERMINAL_BOOTSTRAP_READY]", installation);

    return installation;
}

await instalarBootstrapTerminalNexo();
