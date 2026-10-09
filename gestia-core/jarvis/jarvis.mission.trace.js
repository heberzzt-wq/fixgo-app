// Explicit, local browser diagnostics. Never changes planning or tool authority.
export function traceJarvisMission(stage, value) {
    try {
        if (new URLSearchParams(globalThis.location?.search || "").get("jarvisTrace") !== "1") return;
        const taskTrace = task => {
            const {evidence, ...observation} = task.observation || {};
            return {...task, observation};
        };
        // Tool stages already carry raw responses. Duplicating them several
        // times in the final mission evicts its status from browser log buffers.
        const payload = stage === "mission.final" && value && typeof value === "object"
            ? {...value, runtimeResults: undefined, observations: undefined,
                completedTasks: value.completedTasks?.map(taskTrace),
                blockedTasks: value.blockedTasks?.map(taskTrace),
                traceOmittedDuplicateRuntimePayloads: true}
            : value;
        const serialized = JSON.stringify(payload);
        if (typeof serialized !== "string") return;
        const id = globalThis.crypto.randomUUID();
        const size = 10000;
        const total = Math.ceil(serialized.length / size);
        for (let part = 0; part < total; part += 1) {
            console.info("[JARVIS_MISSION_TRACE] " + JSON.stringify({
                id, stage, part, total, data: serialized.slice(part * size, (part + 1) * size)
            }));
        }
    } catch { /* Diagnostics must not interrupt a mission. */ }
}
