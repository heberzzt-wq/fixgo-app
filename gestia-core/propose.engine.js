/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - PROPOSE ENGINE V7.2.1 (MAX_ANTIFRAGILE)
 * ======================================================================================
 * Función: Traduce hallazgos del Analyzer en planes de acción transaccionales.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * Actualización V7.2.1: Normalización total de datos y soporte para CODE_DETACHED.
 * Autor: Heber Mendoza (Arquitecto Supremo) & El Abuelo
 * ======================================================================================
 */

export function generarPropuesta(analysis) {
    // 🛡️ NORMALIZACIÓN TOTAL (Recomendación del Abuelo)
    // Eliminamos cualquier posibilidad de crash por propiedad inexistente.
    const data = {
        alerts: analysis?.data?.alerts || analysis?.alerts || [],
        warnings: analysis?.data?.warnings || analysis?.warnings || []
    };

    const proposal = {
        risk: "LOW",
        impact: "",
        changes: [],
        needs_approval: false,
        metadata: {
            analysis_id: Date.now(),
            score_salud: 100
        }
    };

    // --- 1. LÓGICA DE ALERTAS CRÍTICAS (RIESGO ALTO) ---
    if (data.alerts.length > 0) {
        proposal.risk = "HIGH";
        proposal.needs_approval = true;
        proposal.impact = "BLOQUEO OPERATIVO: Se detectaron fallos críticos en datos o arquitectura de código.";

        data.alerts.forEach(alert => {
            // A) Caso: Desentrelazado de Código (Ref. El Abuelo)
            if (alert.type === "CODE_DETACHED") {
                proposal.changes.push({
                    type: "REPAIR_RUNTIME_LINK",
                    target: alert.id, 
                    reason: alert.msg,
                    action: "rebind_global_scope",
                    payload: { 
                        component: alert.id,
                        severity: "architectural",
                        suggestion: "Reiniciar Terminal o Re-inyectar Script Core"
                    }
                });
            }

            // B) Caso: Mantenimiento Crítico (El Gol de Jonathan)
            if (alert.type === "VEHICLE_MAINTENANCE") {
                proposal.changes.push({
                    type: "FORCE_MAINTENANCE_TASK",
                    target: alert.id, 
                    reason: alert.msg,
                    action: "create_urgent_task",
                    payload: { 
                        priority: "emergency", 
                        category: "mantenimiento_correctivo",
                        assigned_to: alert.metadata?.asignado_a || "jonathan_uid",
                        description: `ORDEN MAESTRA: Afinación inmediata para ${alert.target}.`
                    }
                });
            }

            // C) Caso: Riesgo Humano (Seguros)
            if (alert.type === "HUMAN_RISK") {
                proposal.changes.push({
                    type: "LOCK_TECHNICIAN",
                    target: alert.id,
                    reason: alert.msg,
                    action: "update",
                    payload: { status: "blocked_by_safety", safety_lock: true }
                });
            }
        });
    }

    // --- 2. LÓGICA DE ADVERTENCIAS (RIESGO MEDIO) ---
    if (data.warnings.length > 0) {
        if (proposal.risk !== "HIGH") {
            proposal.risk = "MEDIUM";
            proposal.needs_approval = true;
            if (!proposal.impact) proposal.impact = "Optimización preventiva sugerida por el sistema.";
        }

        data.warnings.forEach(warn => {
            if (warn.type === "VEHICLE_MAINTENANCE") {
                proposal.changes.push({
                    type: "SCHEDULE_MAINTENANCE",
                    target: warn.id,
                    reason: warn.msg,
                    action: "create_routine",
                    payload: { 
                        priority: "high", 
                        category: "taller",
                        description: `Rutina preventiva para placa ${warn.target}`
                    }
                });
            }
        });
    }

    // --- 3. CIERRE DE CICLO NOMINAL ---
    if (proposal.changes.length === 0) {
        proposal.impact = "El búnker opera dentro de los parámetros nominales.";
        proposal.risk = "LOW";
        proposal.needs_approval = false;
    }

    // Cálculo de Salud Blindado
    proposal.metadata.score_salud = Math.max(0, 100 - (data.alerts.length * 20 + data.warnings.length * 5));

    console.log(`%c[PROPOSE_ENGINE]: Propuesta V7.2.1 generada. Cambios: ${proposal.changes.length} | Riesgo: ${proposal.risk}`, "color: #10b981; font-weight: bold;");
    
    return proposal;
}