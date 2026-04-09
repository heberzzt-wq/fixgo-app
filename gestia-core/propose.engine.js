/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - PROPOSE ENGINE V7.2.3 (CLEAN_STRICT_V2)
 * ======================================================================================
 * Función: Traduce hallazgos del Analyzer en planes de acción transaccionales.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * Actualización V7.2.3: Interceptación de input_original para romper loops de alertas.
 * Autor: Heber Mendoza (Arquitecto Supremo) & El Abuelo
 * ======================================================================================
 */

export function generarPropuesta(analysis) {
    const userInput = analysis?.input_original || "";
    
    // 🛡️ NORMALIZACIÓN DE DATOS DE ENTRADA
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

    // --- 🚀 INTERCEPTOR CRÍTICO: NORMALIZACIÓN DIRECTA ---
    // Si el usuario ordena normalizar flotilla_b2b, ignoramos el ruido del Analyzer.
    if (/flotilla_b2b/i.test(userInput) && /operador_uid/i.test(userInput)) {
        proposal.risk = "MEDIUM";
        proposal.needs_approval = true;
        proposal.impact = "NORMALIZACIÓN FORZADA: Vinculación directa de operador en flotilla_b2b.";

        proposal.changes = [{
            type: "NORMALIZE_VEHICLE_OPERATOR",
            target: "UVZ343K", 
            action: "update_vehicle",
            payload: {
                collection: "flotilla_b2b",
                field: "operador_uid",
                uid: "nNhwy3Mx4pTvc8TZVh1tyTMFwhC2" // UID de Jonathan
            },
            reason: "Orden manual de normalización de identidad relacional."
        }];

        console.log("%c[PROPOSE_ENGINE]: Override detectado. Priorizando comando manual.", "color: #f59e0b; font-weight: bold;");
        return proposal; // ← Rompe el pipeline aquí para evitar alertas redundantes
    }

    // --- 1. LÓGICA DE ALERTAS CRÍTICAS ---
    if (data.alerts.length > 0) {
        proposal.risk = "HIGH";
        proposal.needs_approval = true;
        proposal.impact = "BLOQUEO OPERATIVO: Se detectaron fallos críticos en el búnker.";

        data.alerts.forEach(alert => {
            // Caso: Código desentrelazado
            if (alert.type === "CODE_DETACHED") {
                proposal.changes.push({
                    type: "REPAIR_RUNTIME_LINK",
                    target: alert.id, 
                    reason: alert.msg,
                    action: "rebind_global_scope",
                    payload: { 
                        component: alert.id,
                        severity: "architectural"
                    }
                });
            }

            // Caso: Mantenimiento Crítico
            if (alert.type === "VEHICLE_MAINTENANCE") {
                proposal.changes.push({
                    type: "FORCE_MAINTENANCE_TASK",
                    target: alert.id, 
                    reason: alert.msg,
                    action: "create_urgent_task",
                    payload: { 
                        priority: "emergency", 
                        category: "mantenimiento_correctivo",
                        assigned_to: alert.metadata?.asignado_a || "nNhwy3Mx4pTvc8TZVh1tyTMFwhC2",
                        description: `AFINACIÓN URGENTE: ${alert.target}.`
                    }
                });
            }

            // Caso: Riesgo Humano
            if (alert.type === "HUMAN_RISK") {
                proposal.changes.push({
                    type: "LOCK_TECHNICIAN",
                    target: alert.id,
                    reason: alert.msg,
                    payload: { status: "blocked_by_safety", safety_lock: true }
                });
            }
        });
    }

    // --- 2. LÓGICA DE ADVERTENCIAS ---
    if (data.warnings.length > 0) {
        if (proposal.risk !== "HIGH") {
            proposal.risk = "MEDIUM";
            proposal.needs_approval = true;
            if (!proposal.impact) proposal.impact = "Optimización preventiva sugerida.";
        }

        data.warnings.forEach(warn => {
            if (warn.type === "VEHICLE_MAINTENANCE") {
                proposal.changes.push({
                    type: "SCHEDULE_MAINTENANCE",
                    target: warn.id,
                    reason: warn.msg,
                    payload: { 
                        priority: "high", 
                        category: "taller"
                    }
                });
            }
        });
    }

    // --- 3. CIERRE DE CICLO ---
    if (proposal.changes.length === 0) {
        proposal.impact = "El búnker opera dentro de los parámetros nominales.";
        proposal.risk = "LOW";
        proposal.needs_approval = false;
    }

    // Cálculo de salud del sistema
    proposal.metadata.score_salud = Math.max(0, 100 - (data.alerts.length * 20 + data.warnings.length * 5));

    console.log(`%c[PROPOSE_ENGINE]: Propuesta V7.2.3 generada con éxito.`, "color: #10b981; font-weight: bold;");
    
    return proposal;
}