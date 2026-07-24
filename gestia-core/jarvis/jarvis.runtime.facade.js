/* =========================================================
   JARVIS RUNTIME FACADE V8 FOUNDATION
   Non-breaking consolidation layer for legacy runtime services.
========================================================= */

const JARVIS_RUNTIME_FACADE_VERSION = "8.0.0-foundation";

function clone(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
}

export function createJarvisRuntime({
    runtime = null,
    memory = null,
    authority = null,
    missionEngine = null,
    tools = null,
    eventBus = null,
    telemetry = null
} = {}) {
    const services = {
        runtime,
        memory,
        authority,
        missionEngine,
        tools,
        eventBus,
        telemetry
    };

    const state = {
        initializedAt: Date.now(),
        version: JARVIS_RUNTIME_FACADE_VERSION,
        status: "READY"
    };

    function requireService(name) {
        const service = services[name];
        if (!service) {
            throw new Error(`JARVIS_RUNTIME_SERVICE_REQUIRED:${name}`);
        }
        return service;
    }

    async function runMission(instruction, options = {}) {
        const engine = requireService("missionEngine");

        if (typeof engine.runJarvisMission === "function") {
            return await engine.runJarvisMission({
                instruction,
                ...options
            });
        }

        if (typeof engine === "function") {
            return await engine(instruction, options);
        }

        throw new Error("JARVIS_RUNTIME_MISSION_ENGINE_INVALID");
    }

    function snapshot() {
        return clone({
            state,
            services: Object.fromEntries(
                Object.entries(services).map(([name, service]) => [
                    name,
                    {
                        available: Boolean(service),
                        type: typeof service
                    }
                ])
            )
        });
    }

    return Object.freeze({
        version: JARVIS_RUNTIME_FACADE_VERSION,
        state,
        services,
        runMission,
        requireService,
        snapshot
    });
}

export function installJarvisRuntimeFacade(config = {}) {
    const facade = createJarvisRuntime(config);

    if (typeof window !== "undefined") {
        window.JarvisRuntimeV8 = facade;
        window.Jarvis = window.Jarvis || facade;
    }

    return facade;
}

export const JarvisRuntimeFacadeVersion = JARVIS_RUNTIME_FACADE_VERSION;
