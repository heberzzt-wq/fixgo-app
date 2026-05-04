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

    // 🔐 Seguridad
    await firewall.validate(plan);
    await signature.sign(plan, user);

    await ledger.log("PLAN_APPROVED", {
        planId,
        traceId: plan.traceId
    });

    // 🚀 EJECUCIÓN
    const result = await executeSteps(plan.steps, {
        traceId: plan.traceId,
        userId: user?.id || "system",
        tenantId: plan.tenantId || "default"
    });

    await ledger.log("PLAN_EXECUTED", {
        planId,
        result
    });

    await removePendingPlan(planId);

    return result;
}

window.approvePlan = approvePlan;