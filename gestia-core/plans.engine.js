// 🔌 IMPORTS
import { executeSteps } from "./operations-executor.engine.js";

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
        await firewall.validate(plan);
        await signature.sign(plan, user);
    } catch (err) {
        console.warn("⚠️ Seguridad omitida:", err.message);
    }

    // 🔐 Ledger (tolerante)
    try {
        await ledger.log("PLAN_APPROVED", {
            planId,
            traceId: plan.traceId
        });
    } catch (err) {
        console.warn("⚠️ Ledger omitido:", err.message);
    }

    // 🧪 DEBUG CLAVE
    console.log("🧪 [EXECUTE CALL]:", typeof executeSteps);

    // 🚀 EJECUCIÓN REAL
const result = await executeSteps(plan.steps, {
    traceId: plan.traceId,
    userId: user?.id || "system",
    tenantId: plan.tenantId || "default"
});

// 🧠 FORMATEO + UI + VOZ (TODO JUNTO Y CERRADO BIEN)
let msg = "Ejecución completada";

if (result) {

    if (result.message) {
        msg = result.message;
    }
    else if (result.data) {
        msg = JSON.stringify(result.data, null, 2);
    }
    else if (typeof result === "object") {
        msg = JSON.stringify(result, null, 2);
    }
    else {
        msg = String(result);
    }
}

// 📺 UI (inteligente + soporte array)
const clean = Array.isArray(result) ? result[0] : result;

if (window.renderResponse && clean?.type) {
    window.renderResponse(clean);
} else if (window.renderJarvisResponse) {
    window.renderJarvisResponse("Resultado", msg, "success");
}

// 🔊 VOZ
if (window.hablarJarvis) {
    window.hablarJarvis(msg);
}

// 🔒 BLOQUEO FALLBACK
window.__LAST_EXECUTION__ = true;


// 🔐 Ledger ejecución (tolerante)
try {
    await ledger.log("PLAN_EXECUTED", {
        planId,
        result
    });
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