/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - PROPOSE ENGINE V7.2 (STRICT_EXECUTION)
 * ======================================================================================
 * Función: Traduce hallazgos del Analyzer en planes de acción transaccionales.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR.
 * Actualización V7.2: Soporte para Alertas Críticas de Vehículos y Enlace Jonathan.
 * Autor: Heber Mendoza (Arquitecto Supremo)
 * ======================================================================================
 */

export function generarPropuesta(analysis) {
    const data = analysis?.data || analysis || { alerts: [], warnings: [] };

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
    if (data.alerts && data.alerts.length > 0) {
        proposal.risk = "HIGH";
        proposal.needs_approval = true;
        proposal.impact = "INTERVENCIÓN INMEDIATA REQUERIDA: Se han detectado bloqueos críticos o discrepancias de seguridad.";

        data.alerts.forEach(alert => {
            // Caso A: Riesgo Humano (Seguros)
            if (alert.type === "HUMAN_RISK") {
                proposal.changes.push({
                    type: "LOCK_TECHNICIAN",
                    target: alert.id,
                    reason: alert.msg,
                    action: "update",
                    payload: { status: "blocked_by_safety", safety_lock: true }
                });
            }

            // Caso B: Mantenimiento Crítico (El Gol de Jonathan)
            // 💡 FIX V7.2: Ahora el Propose sabe qué hacer si el vehículo es una ALERT
            if (alert.type === "VEHICLE_MAINTENANCE") {
                proposal.changes.push({
                    type: "FORCE_MAINTENANCE_TASK",
                    target: alert.id, // Placa o ID del vehículo
                    reason: alert.msg,
                    action: "create_urgent_task",
                    payload: { 
                        priority: "emergency", 
                        category: "mantenimiento_correctivo",
                        assigned_to: alert.metadata?.asignado_a || "jonathan_uid",
                        description: `ORDEN MAESTRA: Ejecutar afinación inmediata para ${alert.target}.`
                    }
                });
            }

            // Caso C: Bloqueo por Suscripción
            if (alert.type === "BILLING_LOCK") {
                proposal.changes.push({
                    type: "RESTRICT_TENANT",
                    target: alert.id,
                    reason: "Mora en suscripción SaaS",
                    action: "update",
                    payload: { access_level: "read_only" }
                });
            }
        });
    }

    // --- 2. LÓGICA DE ADVERTENCIAS (RIESGO MEDIO) ---
    if (data.warnings && data.warnings.length > 0) {
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

    // --- 3. LIMPIEZA Y CIERRE ---
    if (proposal.changes.length === 0) {
        proposal.impact = "El búnker opera dentro de los parámetros nominales. Sin cambios requeridos.";
        proposal.risk = "LOW";
        proposal.needs_approval = false;
    }

    // Recalcular salud simple
    proposal.metadata.score_salud = Math.max(0, 100 - (data.alerts?.length * 20 + data.warnings?.length * 5));

    console.log(`%c[PROPOSE_ENGINE]: Traducción finalizada. Cambios: ${proposal.changes.length} | Riesgo: ${proposal.risk}`, "color: #10b981; font-weight: bold;");
    
    return proposal;
}