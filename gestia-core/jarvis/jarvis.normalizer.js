export function normalizeAIPlan(planRaw = {}, traceId = "no_trace") {

    if (!planRaw || typeof planRaw !== "object") return null;
    if (!Array.isArray(planRaw.steps)) return null;

    const steps = [];

    for (const step of planRaw.steps) {
        if (!step || typeof step !== "object") continue;

        const type = String(step.type || "").toUpperCase();
        if (!type || !step.target?.collection) continue;

        const action = step.action || inferAction(type);
        if (action === "custom") continue;

        if ((type === "UPDATE" || type === "WRITE") && !step.payload) continue;

        steps.push({
            id: step.id || `step_${Math.random().toString(36).slice(2, 8)}`,
            type,
            target: {
                collection: step.target.collection,
                docId: step.target.docId || null,
                query: step.target.query || null
            },
            action,
            payload: step.payload || {},
            meta: {
                reversible: step.meta?.reversible ?? true,
                description: step.meta?.description || ""
            },
            traceId
        });
    }

    if (!steps.length) return null;

    return {
        id: planRaw.id || `plan_${Date.now()}`,
        steps,
        normalized: true,
        traceId,
        createdAt: Date.now()
    };
}

function inferAction(type) {
    switch (type) {
        case "READ": return "getDocs";
        case "WRITE": return "setDoc";
        case "UPDATE": return "updateDoc";
        case "DELETE": return "deleteDoc";
        case "ANALYZE": return "aggregate";
        default: return "custom";
    }
}