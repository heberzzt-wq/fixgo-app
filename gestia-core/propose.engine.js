/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - PROPOSE ENGINE V7.0
 * ======================================================================================
 * Función: Traduce hallazgos del Analyzer en planes de acción transaccionales.
 * Autor: Heber Mendoza (Arquitecto Supremo)
 * ======================================================================================
 */

/**
 * generarPropuesta: El cerebro estratégico.
 * @param {Object} analysis - Resultado del Data Analyzer.
 */
export function generarPropuesta(analysis) {
    console.log("%c[PROPOSE_ENGINE]: Generando estrategia de intervención...", "color: #8b5cf6; font-weight: bold;");

    const proposal = {
        risk: "LOW",           // HIGH, MEDIUM, LOW
        impact: "",            // Resumen ejecutivo para el Arquitecto
        changes: [],           // Lista de acciones para el Executor
        metadata: {
            analysis_id: analysis.timestamp,
            score_salud: calcularScoreSimple(analysis)
        }
    };

    // --- 1. LÓGICA DE REPARACIÓN AUTOMÁTICA (SELF-HEAL) ---
    
    // Si hay alertas críticas (Seguros, Impagos)
    if (analysis.alerts.length > 0) {
        proposal.risk = "HIGH";
        proposal.impact = "SE REQUIERE INTERVENCIÓN INMEDIATA: Riesgo legal o de servicio detectado en el búnker.";
        
        analysis.alerts.forEach(alert => {
            if (alert.type === "HUMAN_RISK") {
                proposal.changes.push({
                    type: "LOCK_TECHNICIAN",
                    target: alert.id,
                    reason: alert.msg,
                    action: "update",
                    payload: { status: "blocked_by_safety", safety_lock: true }
                });
            }

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

    // --- 2. LÓGICA DE OPTIMIZACIÓN (PREVENTIVE) ---
    
    if (analysis.warnings.length > 0) {
        if (proposal.risk !== "HIGH") proposal.risk = "MEDIUM";
        
        analysis.warnings.forEach(warn => {
            if (warn.type === "VEHICLE_MAINTENANCE") {
                proposal.changes.push({
                    type: "SCHEDULE_MAINTENANCE",
                    target: warn.id,
                    reason: warn.msg,
                    action: "create_routine",
                    payload: { 
                        priority: "high", 
                        category: "taller",
                        description: `Mantenimiento preventivo auto-generado para placa ${warn.target}`
                    }
                });
            }
        });

        if (!proposal.impact) {
            proposal.impact = "Optimización preventiva: El sistema propone rutinas de mantenimiento para asegurar la continuidad.";
        }
    }

    // --- 3. CASO: TODO EN ORDEN (IDLE/GREEN) ---
    if (proposal.changes.length === 0) {
        proposal.impact = "El búnker opera dentro de los parámetros nominales. No se requieren cambios estructurales.";
        proposal.risk = "LOW";
    }

    console.log(`%c[PROPOSE_ENGINE]: Propuesta lista con ${proposal.changes.length} cambios. Riesgo: ${proposal.risk}`, "color: #10b981;");
    
    return proposal;
}

/**
 * calcularScoreSimple: Deducción rápida de salud del sistema
 */
function calcularScoreSimple(analysis) {
    let score = 100;
    score -= (analysis.alerts.length * 25);
    score -= (analysis.warnings.length * 10);
    return Math.max(0, score);
}