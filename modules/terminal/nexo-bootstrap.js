import { semanticPlanBudgetMs, readSemanticStream, SEMANTIC_IDLE_TIMEOUT_MS, semanticFailurePresentation } from "../../gestia-core/jarvis/jarvis.semantic.transport.js";
/*
 * ======================================================================================
 * JARVIS TERMINAL BOOTSTRAP — HISTORICAL NEXO FILENAME ONLY
 * ======================================================================================
 * Se carga antes del core mediante proposal-state.js.
 * Única identidad activa: JARVIS.
 * Este path histórico permanece sólo por compatibilidad de Hosting/caché.
 * No instala cerebro, identidad ni autoridad NEXO.
 * ======================================================================================
 */

export const JARVIS_TERMINAL_BOOTSTRAP_VERSION =
    "1.14.0-semantic-progress-deadline";
export const NEXO_TERMINAL_BOOTSTRAP_VERSION =
    JARVIS_TERMINAL_BOOTSTRAP_VERSION; // compatibility export only

const INSTALL_KEY = "__JARVIS_TERMINAL_BOOTSTRAP__";
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

export function installJarvisLocalBridgeTransport() {
    const existing =
        globalThis.JarvisLocalBridge ||
        globalThis.window?.JarvisLocalBridge ||
        null;
    if (typeof existing?.requestJson === "function") {
        return existing;
    }

    const bridge = {
        describeFailure: semanticFailurePresentation,
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
            const semanticRequest = path === "/semantic/plan" || path === "/semantic/respond";
            const budgetPayload = path === "/semantic/respond" ? { ...payload, missionState: { phase: "FINAL_RESPONSE" } } : payload;
            const requestPayload = semanticRequest ? { ...payload, streamProgress: true, timeoutMs: semanticPlanBudgetMs(budgetPayload) } : payload;
            const timeoutMs = semanticRequest ? requestPayload.timeoutMs + 10000 : Math.min(
                Math.max(Number(options?.timeoutMs) || 120000, 1000),
                180000
            );
            const maximumAttempts = 3;
            const requestAttempts = semanticRequest ? 1 : maximumAttempts;
            let lastError = null;

            for (
                let attempt = 1;
                attempt <= requestAttempts;
                attempt += 1
            ) {
                const controller = new AbortController();
                const timeout = setTimeout(
                    () => controller.abort(),
                    timeoutMs
                );

                let idleTimer;
                const activity = () => {
                    clearTimeout(idleTimer);
                    idleTimer = setTimeout(() => controller.abort(), SEMANTIC_IDLE_TIMEOUT_MS);
                };
                if (semanticRequest) activity();
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
                                requestPayload && typeof requestPayload === "object"
                                    ? requestPayload
                                    : {}
                            ),
                            cache: "no-store",
                            signal: controller.signal,
                            targetAddressSpace: "loopback"
                        }
                    );
                    if (semanticRequest && response.headers.get("content-type")?.includes("application/x-ndjson")) {
                        return await readSemanticStream(response, { onActivity: activity, onProgress: detail => {
                            globalThis.dispatchEvent?.(new CustomEvent("jarvis:semantic-progress", { detail }));
                        } });
                    }
                    // An older bridge can still reply with one JSON result.
                    clearTimeout(idleTimer);
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
                catch(error) {
                    lastError = error;
                    const aborted =
                        error?.name === "AbortError";

                    if (aborted) {
                        const timeoutError =
                            new Error("JARVIS_LOCAL_BRIDGE_TIMEOUT_REQUEST");
                        timeoutError.code =
                            "JARVIS_LOCAL_BRIDGE_TIMEOUT_REQUEST";
                        timeoutError.route =
                            path;
                        timeoutError.timeoutMs =
                            timeoutMs;
                        throw timeoutError;
                    }

                    if (attempt >= requestAttempts) {
                        throw error;
                    }

                    console.warn(
                        "[JARVIS_LOCAL_BRIDGE_TRANSIENT_RETRY]",
                        {
                            route:
                                path,
                            attempt,
                            nextAttempt:
                                attempt + 1,
                            error:
                                error?.message || String(error)
                        }
                    );

                    await new Promise(resolve =>
                        setTimeout(
                            resolve,
                            attempt * 350
                        )
                    );
                }
                finally {
                    clearTimeout(timeout);
                    clearTimeout(idleTimer);
                }
            }

            throw (
                lastError ||
                new Error("JARVIS_LOCAL_BRIDGE_REQUEST_FAILED")
            );
        }
    };

    globalThis.JarvisLocalBridge = bridge;
    if (globalThis.window) {
        globalThis.window.JarvisLocalBridge = bridge;
    }

    console.info("[JARVIS_LOCAL_BRIDGE_TRANSPORT_READY]", {
        baseUrl: LOCAL_BRIDGE_BASE_URL,
        targetAddressSpace: "loopback",
        contractSource: "jarvis-runtime-contract.json"
    });

    return bridge;
}

export async function instalarBootstrapTerminalJarvis() {
    if (globalThis[INSTALL_KEY]) {
        return globalThis[INSTALL_KEY];
    }

    if (typeof window === "undefined") {
        const serverInstallation = {
            ok: true,
            active: false,
            environment: "non_browser",
            version: JARVIS_TERMINAL_BOOTSTRAP_VERSION
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
        realMediaTools.installJarvisRealMediaTools();
    const guardInstallation =
        runtimeMediaGuard.installJarvisRealMediaRuntimeGuard();

    const installation = {
        ok: true,
        active: true,
        environment: "browser",
        version: JARVIS_TERMINAL_BOOTSTRAP_VERSION,
        localBridgeActive:
            typeof localBridge?.requestJson === "function",
        localBridgeBaseUrl:
            LOCAL_BRIDGE_BASE_URL,
        localBridgeTargetAddressSpace:
            "loopback",
        realMediaToolsVersion:
            realMediaTools.JARVIS_REAL_MEDIA_TOOLS_VERSION || null,
        runtimeMediaGuardVersion:
            runtimeMediaGuard.JARVIS_REAL_MEDIA_RUNTIME_GUARD_VERSION || null,
        realMediaToolsInstalling: true,
        runtimeMediaGuardInstalling: true,
        identity: "JARVIS",
        semanticAuthority: "jarvisSemanticPlan",
        alternateBrains: 0,
        nexoAuthorityActive: false,
        loadedAt: new Date().toISOString()
    };

    globalThis[INSTALL_KEY] = installation;
    globalThis.__JARVIS_TERMINAL_BOOT_HEALTH__ = installation;

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
        globalThis.__JARVIS_TERMINAL_BOOT_HEALTH__ = settled;
        console.info("[JARVIS_REAL_MEDIA_TOOLS_READY]", toolsResult);
        console.info("[JARVIS_REAL_MEDIA_RUNTIME_GUARD_READY]", guardResult);
    });

    console.info("[JARVIS_TERMINAL_BOOTSTRAP_READY]", installation);

    return installation;
}

await instalarBootstrapTerminalJarvis();
