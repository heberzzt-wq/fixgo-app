export function normalizeAIPlan(planRaw = {}, traceId = "no_trace") {

    console.log("🧠 [NORMALIZER]: START", { traceId, planRaw });

    // 🔒 Validación base
    if (!planRaw || (typeof planRaw !== "object" && !Array.isArray(planRaw))) {
        console.warn("⚠️ [NORMALIZER]: planRaw inválido");
        return null;
    }

    /* =====================================================
        🔥 1. MULTI-INTENT DIRECTO (ARRAY PLANO DESDE BRIDGE)
    ===================================================== */
    if (Array.isArray(planRaw)) {

        console.log("🧠 [NORMALIZER]: Multi-step array detectado");

        planRaw = {
            steps: planRaw.map((step, i) => ({
                id: step.id || `step_${i}_${Date.now()}`,
                type: (step.type || step.intent || "ANALYZE").toUpperCase(),
                target: typeof step.target === "string"
                    ? { collection: step.target }
                    : (step.target || { collection: "system" }),
                action: step.action || null,
                payload: step.payload || {},
                meta: step.meta || {}
            }))
        };
    }

    /* =====================================================
        🔄 2. FALLBACK: INTENT SIMPLE → STEP
    ===================================================== */
    if (!planRaw.steps && planRaw.intent && planRaw.target) {

        console.warn("⚠️ [NORMALIZER]: Intent simple detectado, convirtiendo a step");

        planRaw = {
            steps: [
                {
                    id: `step_${Date.now()}`,
                    type: String(planRaw.intent).toUpperCase(),
                    target: typeof planRaw.target === "string"
                        ? { collection: planRaw.target }
                        : planRaw.target,
                    action: null,
                    payload: {},
                    meta: {}
                }
            ]
        };
    }

    /* =====================================================
        🔎 3. DETECCIÓN FLEXIBLE DE STEPS
    ===================================================== */
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

    /* =====================================================
        🧠 4. NORMALIZACIÓN DE CADA STEP
    ===================================================== */
    for (const step of rawSteps) {

        console.log("🔍 [NORMALIZER]: STEP_RAW", step);

        if (!step || typeof step !== "object") {
            console.warn("⚠️ Step inválido (no objeto)");
            continue;
        }

        const type = String(step.type || step.intent || "").toUpperCase();
        if (!type) {
            console.warn("⚠️ Step sin type");
            continue;
        }

        // 🔥 TARGET FLEXIBLE
        const collection =
            step.target?.collection ||
            step.target?.name ||
            (typeof step.target === "string" ? step.target : null) ||
            "system";

        const action = step.action || inferAction(type);

        if (action === "custom") {
            console.warn("⚠️ Acción no soportada", type);
            continue;
        }

        // 🔐 Validación mínima para escrituras
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

    /* =====================================================
        🧾 5. PLAN FINAL
    ===================================================== */
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

/* =====================================================
    🔧 ACTION INFERENCE
===================================================== */
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