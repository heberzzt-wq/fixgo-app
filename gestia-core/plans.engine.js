// 🔌 IMPORTS
import { executeSteps } from "./operations-executor.engine.js?v=jarvis-repair-engines-v2-20260617";

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

    let responseType =
    "success";

    let ledgerEventType = "PLAN_EXECUTED";

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


const executionResults =
    Array.isArray(result?.result)
        ? result.result
        : [];

const firstExecutionResult =
    executionResults[0] ||
    null;


/* =====================================================
   RESULT STATUS CLASSIFICATION
===================================================== */

const noChangeResult =
    executionResults.find(item =>
        item?.status === "no_changes" ||
        item?.reason === "ALREADY_REPAIRED"
    ) ||
    null;

const syntaxErrorResult =
    executionResults.find(item =>
        item?.status === "syntax_error" ||
        item?.reason ===
            "SYNTAX_VALIDATION_FAILED"
    ) ||
    null;

const blockedResult =
    executionResults.find(item =>
        item?.status === "blocked" ||
        item?.result?.blocked === true ||
        item?.blocked === true
    ) ||
    null;

const writeResults =
    executionResults.filter(item =>
        [
            "file_created",
            "file_updated",
            "write_success"
        ].includes(
            item?.status
        )
    );

const analysisOnlyResult =
    executionResults.find(item =>
        item?.status === "analysis_only_success"
    ) ||
    null;

const isNoChanges =
    !!noChangeResult;

const isSyntaxError =
    !!syntaxErrorResult;

const effectiveBlockedResult =
 blockedResult ||
  result?.blocking_result ||
   null; 
   
   const isBlocked =
    !!effectiveBlockedResult || 
    executionStatus === "blocked" ||
     result?.blocked === true;

     const blockedReason =
      effectiveBlockedResult?.result?.analysis?.reason ||
       effectiveBlockedResult?.result?.reason ||
        effectiveBlockedResult?.reason || 
        result?.reason ||
         "OPERATION_BLOCKED";

const syntaxFile =
    syntaxErrorResult?.target ||
    syntaxErrorResult?.file ||
    affected[0] ||
    "system";

const syntaxReason =
    syntaxErrorResult?.reason ||
    "SYNTAX_VALIDATION_FAILED";

const syntaxMessage =
    syntaxErrorResult?.message ||
    "El contenido JavaScript contiene sintaxis inválida.";

const syntaxLocationParts =
    [];

if (
    Number.isInteger(
        syntaxErrorResult?.line
    )
) {

    syntaxLocationParts.push(
        `línea ${syntaxErrorResult.line}`
    );
}

if (
    Number.isInteger(
        syntaxErrorResult?.column
    )
) {

    syntaxLocationParts.push(
        `columna ${syntaxErrorResult.column}`
    );
}

const syntaxLocation =
    syntaxLocationParts.join(
        ", "
    ) ||
    "ubicación no disponible";

const isAnalysis =
    !!analysisOnlyResult ||
    changes.some(change =>
        [
            "ANALYZE",
            "ANALYZE_UI",
            "DATA_ANALYSIS"
        ].includes(
            change?.type
        )
    );

const analysisReport =
    analysisOnlyResult?.result?.report ||
    analysisOnlyResult?.report ||
    firstExecutionResult?.result?.report ||
    changes.find(change =>
        [
            "ANALYZE",
            "ANALYZE_UI",
            "DATA_ANALYSIS"
        ].includes(
            change?.type
        )
    )?.payload?.report ||
    null;

/* =====================================================
   FINAL MESSAGE ROUTING
===================================================== */

if ( 
    ![
         "success",
          "blocked"
         ].includes(
             executionStatus 
            ) 
        ) { 
            responseType =
             "error";
              ledgerEventType =
               "PLAN_FAILED";

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

} else if (
    isSyntaxError
) {

    responseType =
        "error";

        ledgerEventType = 
        "PLAN_BLOCKED";

    msg = `
Arquitecto,

la escritura fue bloqueada por sintaxis JavaScript inválida.

Archivo protegido:
${syntaxFile}

Error:
${syntaxMessage}

Ubicación:
${syntaxLocation}

Motivo:
${syntaxReason}

Estado:
no se realizó ninguna escritura ni se creó ningún commit.
`;

} else if (
    isBlocked
) {

    responseType =
        "error";

        ledgerEventType =
         "PLAN_BLOCKED";

    msg = `
Arquitecto,

la operación fue bloqueada de forma preventiva.

Motivo:
${blockedReason}

Objetivos protegidos:
- ${affected.join("\n- ") || "system"}

Resultado:
${analysisReport || "No se generó un parche seguro."}

Estado:
no se realizaron cambios ni escrituras en el repositorio.
`;

} else if (
    isNoChanges
) {

    msg = `
Arquitecto,

el objetivo ya se encontraba en el estado solicitado.

Objetivos verificados:
- ${affected.join("\n- ") || "system"}

Resultado:
no se detectaron cambios que aplicar.

Estado:
operación omitida por ALREADY_REPAIRED. No se creó ningún commit.
`;

} else if (
    isAnalysis
) {

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
${writeResults.length || changes.length}

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
    responseType
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

    if (
         ledger && 
         typeof ledger.log === "function" 
        ) { 
            
            await ledger.log(
                 ledgerEventType,
                  { 
                    planId,
                    
                    status: result?.status ||
                     "unknown",
                      blocked:
                       result?.blocked === true,
                        reason:
                         result?.reason ||
                          null, 
                          result
                         } 
                        ); 
                    } else { 
                        console.warn(
                             `⚠️ Ledger no disponible en ${ledgerEventType}`
                             ); 
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
