/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - PROPOSE ENGINE V7.1 (STRICT_MODE)
 * ======================================================================================
 * Función: Traduce hallazgos del Analyzer en planes de acción transaccionales.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR.
 * Autor: Heber Mendoza (Arquitecto Supremo)
 * ======================================================================================
 */

/**
 * generarPropuesta: El cerebro estratégico.
 * Toma los datos de la auditoría dual y decide el nivel de riesgo y los cambios necesarios.
 * @param {Object} analysis - Resultado del Data Analyzer.
 */
export function generarPropuesta(analysis) {
    console.log("%c[PROPOSE_ENGINE]: Iniciando traducción de hallazgos...", "color: #8b5cf6; font-weight: bold;");

    // 🛡️ ACCESO SEGURO (Antifragile): El Analyzer devuelve la data en la propiedad .data
    const auditData = analysis?.data || { alerts: [], warnings: [], insights: [], metrics: {} };

    const proposal = {
        risk: "LOW",
        impact: "",
        changes: [],
        needs_approval: false, // Control de flujo para la Terminal
        metadata: {
            analysis_id: Date.now(),
            score_salud: calcularScoreSimple(analysis)
        }
    };

    // --- 1. LÓGICA DE REPARACIÓN AUTOMÁTICA (SELF-HEAL) ---
    // Ataca directamente los bloqueos legales o de seguridad (Caso Jonathan)
    if (auditData.alerts && auditData.alerts.length > 0) {
        proposal.risk = "HIGH";
        proposal.impact = "SE REQUIERE INTERVENCIÓN INMEDIATA: Riesgo legal o de servicio detectado en el búnker.";
        proposal.needs_approval = true;
        
        auditData.alerts.forEach(alert => {
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
    // Gestiona alertas amarillas (Mantenimientos, renovaciones próximas)
    if (auditData.warnings && auditData.warnings.length > 0) {
        if (proposal.risk !== "HIGH") proposal.risk = "MEDIUM";
        proposal.needs_approval = true;
        
        auditData.warnings.forEach(warn => {
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
    // Si no hay cambios, el Kernel no debe quedar bloqueado esperando aprobación.
    if (proposal.changes.length === 0) {
        proposal.impact = "El búnker opera dentro de los parámetros nominales. No se requieren cambios estructurales.";
        proposal.risk = "LOW";
        proposal.needs_approval = false;
    }

    console.log(`%c[PROPOSE_ENGINE]: Estrategia lista. Cambios: ${proposal.changes.length} | Riesgo: ${proposal.risk} | Requiere Arre: ${proposal.needs_approval}`, "color: #10b981; font-weight: bold;");
    
    return proposal;
}

/**
 * calcularScoreSimple: Deducción rápida de salud del sistema
 * Algoritmo: Alerta (-10 pts), Warning (-5 pts).
 */
function calcularScoreSimple(analysis) {
    const alerts = analysis?.data?.alerts || [];
    const warnings = analysis?.data?.warnings || [];

    return Math.max(0, 100 - (alerts.length * 10 + warnings.length * 5));
}