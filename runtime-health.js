const VERSION = "1.0.0-runtime-health";

function clockNow() {
    return typeof performance !== "undefined" &&
        typeof performance.now === "function"
        ? performance.now()
        : Date.now();
}

export async function runtimeLatency({
    probeUrl = "/firebase.js",
    fetchImpl = globalThis.fetch,
    timeoutMs = 5000
} = {}) {
    if (typeof fetchImpl !== "function") {
        return {
            ok: false,
            latencyMs: null,
            error: "FETCH_UNAVAILABLE"
        };
    }

    const startedAt = clockNow();
    const controller =
        typeof AbortController !== "undefined"
            ? new AbortController()
            : null;
    const timeoutId = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

    try {
        const response = await fetchImpl(probeUrl, {
            method: "HEAD",
            cache: "no-store",
            signal: controller?.signal
        });

        return {
            ok: response.ok,
            latencyMs: Math.round(clockNow() - startedAt),
            httpStatus: response.status
        };
    } catch (error) {
        return {
            ok: false,
            latencyMs: Math.round(clockNow() - startedAt),
            error: error?.name === "AbortError"
                ? "RUNTIME_LATENCY_TIMEOUT"
                : error?.message || String(error)
        };
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

export async function getRuntimeHealthSnapshot(options = {}) {
    const latency = await runtimeLatency(options);
    const runtime = globalThis?.GestiaRuntime || null;

    return {
        ok: latency.ok,
        version: VERSION,
        status: latency.ok ? "ONLINE" : "DEGRADED",
        latency,
        services: {
            gestiaRuntime: Boolean(runtime),
            toolsBridge: Boolean(globalThis?.ToolsBridge),
            jarvisToolRuntime: Boolean(globalThis?.JarvisToolRuntime),
            responseComposer: Boolean(globalThis?.ResponseComposer)
        },
        checkedAt: Date.now(),
        readOnly: true
    };
}

export function describeRuntimeHealth() {
    return {
        ok: true,
        version: VERSION,
        readOnly: true,
        capabilities: [
            "runtimeLatency",
            "getRuntimeHealthSnapshot"
        ]
    };
}
