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
    "1.11.0-local-bridge-transport-v142";

const INSTALL_KEY = "__NEXO_TERMINAL_BOOTSTRAP__";
const LOCAL_BRIDGE_BASE_URL = "http://localhost:3344";
let runtimeContractPromise = null;

function runtimeContractUrl() {
    return new URL(
        "../../jarvis-runtime-contract.json",
        import.meta.url
    ).toString();
}

async function readRuntimeContract() {
    if (!runtimeContractPromise) {
        runtimeContractPromise = (async () => {
            const response = await globalThis.fetch(
                runtimeContractUrl(),
                {
                    method: "GET",
                    cache: "no-store"
                }
            );
            if (!response?.ok) {
                throw new Error(
                    `JARVIS_RUNTIME_CONTRACT_HTTP_${response?.status || 0}`
                );
            }
            const contract = await response.json();
            const releaseId = String(
                contract?.releaseId || ""
            ).trim();
            if (!releaseId) {
                throw new Error("JARVIS_RUNTIME_RELEASE_ID_REQUIRED");
            }
            return {
                ...contract,
                releaseId
            };
        })().catch(error => {
            runtimeContractPromise = null;
            throw error;
        });
    }
    return runtimeContractPromise;
}

function installJarvisLocalBridgeTransport() {
    const existing =
        globalThis.JarvisLocalBridge ||
        globalThis.window?.JarvisLocalBridge ||
        null;
    if (typeof existing?.requestJson === "function") {
        return existing;
    }

    const bridge = {
        async requestJson(
            route,
            payload = {},
            options = {}
        ) {
            const path = String(route || "").trim();
            if (!path.startsWith("/") || path.startsWith("//")) {
                throw new Error("JARVIS_LOCAL_BRIDGE_ROUTE_INVALID");
            }

            const contract = await readRuntimeContract();
            const timeoutMs = Math.min(
                Math.max(Number(options?.timeoutMs) || 120000, 1000),
                180000
            );
            const controller = new AbortController();
            const timeout = setTimeout(
                () => controller.abort(),
                timeoutMs
            );

            try {
                const response = await globalThis.fetch(
                    `${LOCAL_BRIDGE_BASE_URL}${path}`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-Jarvis-Release-Id": contract.releaseId
                        },
                        body: JSON.stringify(
                            payload && typeof payload === "object"
                                ? payload
                                : {}
                        ),
                        cache: "no-store",
                        signal: controller.signal,
                        targetAddressSpace: "local"
                    }
                );
                const text = await response.text();
                let result = {};
                if (text) {
                    try {
                        result = JSON.parse(text);
                    }
                    catch {
                        throw new Error(
                            `JARVIS_LOCAL_BRIDGE_INVALID_JSON_${response.status}`
                        );
                    }
                }
                if (!response.ok) {
                    return {
                        ...result,
                        ok: result?.ok === true,
                        httpStatus: response.status
                    };
                }
                return result;
            }
            finally {
                clearTimeout(timeout);
            }
        }
    };

    globalThis.JarvisLocalBridge = bridge;
    if (globalThis.window) {
        globalThis.window.JarvisLocalBridge = bridge;
    }

    console.info("[JARVIS_LOCAL_BRIDGE_TRANSPORT_READY]", {
        baseUrl: LOCAL_BRIDGE_BASE_URL,
        contractSource: "jarvis-runtime-contract.json"
    });

    return bridge;
}

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

    const localBridge =
        installJarvisLocalBridgeTransport();

    const realMediaTools = await import(
        "../../gestia-core/nexo/nexo.real-media.tools.js?v=v137-local-speech-synthesis-20260812"
    );
    const runtimeMediaGuard = await import(
        "../../gestia-core/nexo/nexo.real-media.runtime-guard-v128.js?v=v137-local-speech-synthesis-20260812"
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
        localBridgeActive:
            typeof localBridge?.requestJson === "function",
        localBridgeBaseUrl:
            LOCAL_BRIDGE_BASE_URL,
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
