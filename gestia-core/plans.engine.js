// 🔌 IMPORTS
import { executeSteps } from "./operations-executor.engine.js";

export async function approvePlan(planId, user = {}) {

    const plan = await getPendingPlan(planId);

    if (!plan) throw new Error("Plan no encontrado");

    if (plan.mode !== "AI_SUPERVISED") {
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

    // 🚀 EJECUCIÓN (AQUÍ ESTÁ LA CLAVE)
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