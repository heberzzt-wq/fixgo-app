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
    🧠 4. NORMALIZACIÓN DE CADA STEP (FIX FINAL ESTABLE)
===================================================== */

//
// 🔥 1. MULTI-INTENT → SIEMPRE UNIFICAR A CODE_WRITE
//
if (Array.isArray(rawSteps) && rawSteps.length >= 2) {

    const unifiedText = rawSteps
        .map(s => JSON.stringify(s))
        .join(" ")
        .toLowerCase();

    // 🔍 detectar archivo (robusto)
    const fileMatch = unifiedText.match(/modules\/[a-zA-Z0-9_\-]+(\.js)?/);

    const file = fileMatch
        ? (fileMatch[0].endsWith(".js") ? fileMatch[0] : `${fileMatch[0]}.js`)
        : `modules/auto_${Date.now()}.js`;

    const normalizedStep = {
        id: `step_${Date.now()}`,
        type: "CODE_WRITE",
        target: {
            collection: "repo_files",
            docId: null,
            query: null
        },
        action: "custom",
        payload: {
            file,
            content: unifiedText
        },
        meta: {
            reversible: true,
            description: "AI Code Write (Unified Multi-Intent)"
        },
        traceId
    };

    console.log("🛠️ [NORMALIZER]: MULTI → CODE_WRITE UNIFICADO");

    return {
        id: `plan_${Date.now()}`,
        steps: [normalizedStep],
        normalized: true,
        traceId,
        createdAt: Date.now()
    };
}

//
// 🔁 2. FLUJO NORMAL (UN SOLO STEP)
//
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

    // 🔥 DETECCIÓN POR CONTENIDO REAL (FIX DEFINITIVO)
const rawText = JSON.stringify(step).toLowerCase();

if (
    rawText.includes("archivo") ||
    rawText.includes(".js") ||
    rawText.includes("export")
) {
    const fileMatch = rawText.match(/modules\/[a-zA-Z0-9_\-]+(\.js)?/);

    const file = fileMatch
        ? (fileMatch[0].endsWith(".js") ? fileMatch[0] : `${fileMatch[0]}.js`)
        : `modules/auto_${Date.now()}.js`;

    const normalizedStep = {
        id: step.id || `step_${Math.random().toString(36).slice(2, 8)}`,
        type: "CODE_WRITE",
        target: {
            collection: "repo_files",
            docId: null,
            query: null
        },
        action: "custom",
        payload: {
            file,
            content: rawText
        },
        meta: {
            reversible: true,
            description: "AI Code Write (forced from text)"
        },
        traceId
    };


    /* =====================================================
   AUTHORITY COGNITIVE PROMOTION TRACE
===================================================== */

try {

    window.GestiaAuthority
        ?.registerMutation?.({

        module:
            "analysis.hub",

        path:

            `cognition.codewrite:${
                normalizedStep.payload?.file ||
                "unknown"
            }`,

        previous:
            null,

        value: {

            promotion:
                "CODE_WRITE",

            source:
                "normalizer",

            file:
                normalizedStep.payload?.file,

            traceId
        }
    });

}

catch(traceError) {

    console.warn(
        "⚠️ [COGNITIVE_PROMOTION_TRACE_FAIL]",
        traceError
    );
}

    console.log("🛠️ [NORMALIZER]: CODE_WRITE FORZADO DESDE TEXTO");

    steps.push(normalizedStep);
    continue;
}

    //
    // 🔥 DETECTOR DIRECTO DE CODE_WRITE (single step)
    //
    if (
        type.includes("CODE") ||
        step.payload?.file ||
        step.intent?.toLowerCase().includes("archivo")
    ) {
        const normalizedStep = {
            id: step.id || `step_${Math.random().toString(36).slice(2, 8)}`,
            type: "CODE_WRITE",
            target: {
                collection: "repo_files",
                docId: null,
                query: null
            },
            action: "custom",
            payload: {
                file: step.payload?.file || `modules/auto_${Date.now()}.js`,
                content: step.payload?.content || "// generado por jarvis"
            },
            meta: {
                reversible: true,
                description: "AI Code Write"
            },
            traceId
        };

        /* =====================================================
   AUTHORITY COGNITIVE PROMOTION TRACE
===================================================== */

try {

    window.GestiaAuthority
        ?.registerMutation?.({

        module:
            "analysis.hub",

        path:

            `cognition.codewrite:${
                normalizedStep.payload?.file ||
                "unknown"
            }`,

        previous:
            null,

        value: {

            promotion:
                "CODE_WRITE",

            source:
                "normalizer",

            file:
                normalizedStep.payload?.file,

            traceId
        }
    });

}

catch(traceError) {

    console.warn(
        "⚠️ [COGNITIVE_PROMOTION_TRACE_FAIL]",
        traceError
    );
}


/* =====================================================
   COGNITIVE GOVERNANCE OBSERVABILITY
===================================================== */

try {

    const targetFile =

        normalizedStep
            ?.payload
            ?.file || "";

    const unsafeIntent = [

        "firebase.js",
        "gestia.runtime",
        "jarvis.kernel",
        "service-worker",
        "firewall.engine"
    ]

    .some(

        protectedPath =>

            targetFile.includes(
                protectedPath
            )
    );

    if (unsafeIntent) {

        console.warn(

            "⚠️ [COGNITIVE_UNSAFE_INTENT]",

            {

                file:
                    targetFile,

                traceId
            }
        );

        window.GestiaAuthority
            ?.registerMutation?.({

            module:
                "analysis.hub",

            path:

                `cognition.unsafe:${
                    targetFile
                }`,

            previous:
                null,

            value: {

                file:
                    targetFile,

                traceId,

                enforcement:
                    "OBSERVE_ONLY"
            }
        });
    }

}

catch(cognitiveError) {

    console.warn(

        "⚠️ [COGNITIVE_GOVERNANCE_FAIL]",

        cognitiveError
    );
}
        console.log("🛠️ [NORMALIZER]: CODE_WRITE DETECTED", normalizedStep);

        steps.push(normalizedStep);
        continue;
    }

    //
    // 🔥 TARGET FLEXIBLE
    //
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

    //
    // 🔐 VALIDACIÓN
    //
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

//
// ❌ SIN STEPS
//
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