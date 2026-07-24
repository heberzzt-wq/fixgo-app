/* =========================================================
   JARVIS V7 RUNTIME FACADE FOUNDATION
   Non-breaking consolidation layer for legacy runtime services.
   V7 is the Jarvis product codename, not a semantic version number.
========================================================= */

const JARVIS_RUNTIME_FACADE_VERSION = "1.0.0-foundation";

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
    telemetry = null,
    voice = null
} = {}) {
    const services = {
        runtime,
        memory,
        authority,
        missionEngine,
        tools,
        eventBus,
        telemetry,
        voice
    };

    const state = {
        initializedAt: Date.now(),
        version: JARVIS_RUNTIME_FACADE_VERSION,
        codename: "JARVIS_V7",
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

    async function speak(text, options = {}) {
        const voiceRuntime = requireService("voice");
        if (typeof voiceRuntime.speak !== "function") {
            throw new Error("JARVIS_RUNTIME_VOICE_INVALID");
        }
        return await voiceRuntime.speak(text, options);
    }

    function stopSpeaking() {
        return services.voice?.stop?.() ?? false;
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
        codename: "JARVIS_V7",
        state,
        services,
        runMission,
        speak,
        stopSpeaking,
        requireService,
        snapshot
    });
}

export function installJarvisRuntimeFacade(config = {}) {
    const facade = createJarvisRuntime(config);

    if (typeof window !== "undefined") {
        window.JarvisRuntimeV7 = facade;
        window.Jarvis = window.Jarvis || facade;
    }

    return facade;
}

export const JarvisRuntimeFacadeVersion = JARVIS_RUNTIME_FACADE_VERSION;
