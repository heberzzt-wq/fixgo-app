// 🔌 IMPORTS
import { executeSteps } from "./operations-executor.engine.js";

/* 🔥 FIX: INYECCIÓN GLOBAL DEL LEDGER */
function getLedger() {
    return window.__GESTIA_LEDGER__;
}

export async function approvePlan(planId, user = {}) {

    console.log("🧪 [APPROVE ENTRY]:", planId);

    const plan = window.getPendingPlan
        ? await window.getPendingPlan(planId)
        : null;

    console.log("🧪 [PLAN FETCHED]:", plan);

    if (!plan) throw new Error("Plan no encontrado");

    // 🔥 FIX: validar solo si existe mode
    if (plan.mode && plan.mode !== "AI_SUPERVISED") {
        throw new Error("Plan inválido para ejecución");
    }

    console.log("🟢 [APPROVE]: Plan aprobado", plan.id);

    // 🔐 Seguridad (tolerante)
    try {

    if (
        typeof firewall !== "undefined" &&
        firewall?.validate
    ) {
        await firewall.validate(plan);
    }

    if (
        typeof signature !== "undefined" &&
        signature?.sign
    ) {
        await signature.sign(plan, user);
    }

} catch (err) {

    console.warn(
        "⚠️ Seguridad omitida:",
        err.message
    );
}

    // 🔐 Ledger (tolerante)
try {
    const ledger = window.__GESTIA_LEDGER__;

    if (ledger && typeof ledger.log === "function") {
        await ledger.log("PLAN_APPROVED", {
            planId,
            traceId: plan.traceId || "no_trace"
        });
    } else {
        console.warn("⚠️ Ledger no disponible en PLAN_APPROVED");
    }

} catch (err) {
    console.warn("⚠️ Ledger omitido:", err.message);
}


// 🧪 DEBUG CLAVE
console.log("🧪 [EXECUTE CALL]:", typeof executeSteps);


// 🚀 EJECUCIÓN REAL
const result = await executeSteps(plan.steps, {

    
    traceId: plan.traceId || "no_trace",
    userId: user?.id || "system",
    tenantId: plan.tenantId || "default"
});

// 🔥 BISTURÍ FORENSE
console.log(
    "🔥 EXECUTION_RESULT_CAPTURE",
    result
);

console.log(
    "🔥 EXECUTION_RESULT_JSON",
    JSON.stringify(result, null, 2)
);


// 🧠 FORMATEO + UI + VOZ
let msg = "Ejecución completada";

if (result) {

    if (result.message) {

        msg = result.message;

    } else if (result.data) {

        msg = JSON.stringify(
            result.data,
            null,
            2
        );

    } else if (typeof result === "object") {

        const issues =
            Array.isArray(result?.issues)
                ? result.issues
                : [];

        if (issues.length > 0) {

            const top = issues[0];

            msg = `
Arquitecto,

detecté:

${top.title}

Impacto:
${top.impact || "Impacto visual detectado"}

Recomendación:
${top.recommendation || "Revisar componente afectado"}

Riesgo:
${top.severity || "LOW"}

Esperando aprobación y validación humana.
`;

        } else {

            
const changes =
    result?.proposal?.changes ||
    result?.changes ||
    [];

const affected =
    [
        ...new Set(
            changes
                .map(change =>
                    change?.target ||
                    change?.payload?.target ||
                    change?.payload?.file ||
                    change?.type ||
                    "system"
                )
                .filter(Boolean)
        )
    ];

const executionStatus =
    result?.status ||
    "unknown";

const firstExecutionResult =
    Array.isArray(result?.result)
        ? result.result[0]
        : null;

const isAnalysis =
    changes.some(change =>
        [
            "ANALYZE",
            "ANALYZE_UI",
            "DATA_ANALYSIS"
        ].includes(change?.type)
    );

const analysisReport =
    firstExecutionResult?.result?.report ||
    changes.find(change =>
        [
            "ANALYZE",
            "ANALYZE_UI",
            "DATA_ANALYSIS"
        ].includes(change?.type)
    )?.payload?.report ||
    null;

if (executionStatus !== "success") {

    msg = `
Arquitecto,

la operación no pudo completarse.

Error:
${result?.error || "EXECUTION_FAILED"}

Objetivos afectados:
- ${affected.join("\n- ") || "system"}

Estado:
ejecución fallida.
`;

} else if (isAnalysis) {

    msg = `
Arquitecto,

el análisis fue completado correctamente.

Objetivos analizados:
- ${affected.join("\n- ") || "system"}

Resultado:
${analysisReport || "Análisis completado sin realizar escrituras."}

Estado:
análisis finalizado en modo de solo lectura.
`;

} else {

    msg = `
Arquitecto,

la operación fue ejecutada correctamente.

Operaciones realizadas:
${changes.length}

Objetivos afectados:
- ${affected.join("\n- ") || "system"}

Estado:
plan aprobado y ejecución completada.
`;
}
        }



    } else {

        msg = String(result);

    }

}

console.log("🧠 FINAL_MSG", msg);

console.log(
    "🧠 RENDER_PATH",
    {
        hasRenderResponse:
            !!window.renderResponse,

        hasRenderJarvisResponse:
            !!window.renderJarvisResponse,

        result
    }
);


// 📺 UI

const clean =
    result?.issues?.length
        ? {
            type: "ANALYZE",
            message: msg,
            issues: result.issues,
            result
        }
        : (
            Array.isArray(result)
                ? result[0]
                : result
        );

console.log(
    "🧠 CLEAN_OBJECT",
    clean
);

console.log(
    "🧠 CLEAN_TYPE",
    clean?.type
);

if (
    false &&
    window.renderResponse &&
    clean?.type
) {

    window.renderResponse(clean);

} else if (
    window.renderJarvisResponse
) {

    window.renderJarvisResponse(
        "Resultado",
        msg,
        "success"
    );

}

// 🔊 VOZ
if (window.hablarJarvis) {
    window.hablarJarvis(msg);
}


// 🔒 FLAG
window.__LAST_EXECUTION__ = true;


// 🔐 Ledger ejecución (tolerante)
try {
    const ledger = window.__GESTIA_LEDGER__;

    if (ledger && typeof ledger.log === "function") {
        await ledger.log("PLAN_EXECUTED", {
            planId,
            result
        });
    } else {
        console.warn("⚠️ Ledger no disponible en PLAN_EXECUTED");
    }

} catch (err) {
    console.warn("⚠️ Ledger ejecución omitido:", err.message);
}


// 🧹 Limpieza
try {
    await window.removePendingPlan?.(planId);
} catch (err) {
    console.warn("⚠️ No se pudo limpiar plan:", err.message);
}

return result;
}

window.approvePlan = approvePlan;