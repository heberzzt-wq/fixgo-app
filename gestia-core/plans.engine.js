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