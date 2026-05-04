export function normalizeAIPlan(planRaw = {}, traceId = "no_trace") {

    console.log("🧠 [NORMALIZER]: START", { traceId, planRaw });

if (!planRaw || typeof planRaw !== "object") {
    console.warn("⚠️ [NORMALIZER]: planRaw inválido");
    return null;
}

// 🔄 FALLBACK: convertir intent simple a step ejecutable
if (!planRaw.steps && planRaw.intent && planRaw.target) {
    console.warn("⚠️ [NORMALIZER]: Intent simple detectado, convirtiendo a step");

    planRaw = {
        steps: [
            {
                type: String(planRaw.intent).toUpperCase(),
                target: typeof planRaw.target === "string"
                    ? { collection: planRaw.target }
                    : planRaw.target
            }
        ]
    };
}

// 🔎 Resolver diferentes formatos posibles de salida del planner
let rawSteps =
    Array.isArray(planRaw.steps) ? planRaw.steps :
    Array.isArray(planRaw.plan?.steps) ? planRaw.plan.steps :
    Array.isArray(planRaw.actions) ? planRaw.actions :
    Array.isArray(planRaw.commands) ? planRaw.commands :
    null;

if (!rawSteps) {
    console.warn("⚠️ [NORMALIZER]: No se encontró arreglo de steps en planRaw", planRaw);
    return null;
}
    const steps = [];


    for (const step of rawSteps) {

        console.log("🔍 [NORMALIZER]: STEP_RAW", step);

        if (!step || typeof step !== "object") {
            console.warn("⚠️ Step inválido (no objeto)");
            continue;
        }

        const type = String(step.type || "").toUpperCase();
        if (!type) {
            console.warn("⚠️ Step sin type");
            continue;
        }

        // 🔥 FLEXIBILIDAD DE TARGET
        const collection =
            step.target?.collection ||
            step.target?.name ||
            (typeof step.target === "string" ? step.target : null);

        if (!collection) {
            console.warn("⚠️ Step sin collection válido", step.target);
            continue;
        }

        const action = step.action || inferAction(type);

        if (action === "custom") {
            console.warn("⚠️ Acción no soportada", type);
            continue;
        }

        if ((type === "UPDATE" || type === "WRITE") && !step.payload) {
            console.warn("⚠️ Step sin payload requerido", type);
            continue;
        }

        const normalizedStep = {
            id: step.id || `step_${Math.random().toString(36).slice(2, 8)}`,
            type,
            target: {
                collection,
                docId: step.target?.docId || null,
                query: step.target?.query || null
            },
            action,
            payload: step.payload || {},
            meta: {
                reversible: step.meta?.reversible ?? true,
                description: step.meta?.description || ""
            },
            traceId
        };

        console.log("✅ [NORMALIZER]: STEP_OK", normalizedStep);

        steps.push(normalizedStep);
    }

    if (!steps.length) {
        console.error("❌ [NORMALIZER]: SIN STEPS VÁLIDOS");
        return null;
    }

    const normalizedPlan = {
        id: planRaw.id || `plan_${Date.now()}`,
        steps,
        normalized: true,
        traceId,
        createdAt: Date.now()
    };

    console.log("🧠 [NORMALIZER]: PLAN_OK", normalizedPlan);

    return normalizedPlan;
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