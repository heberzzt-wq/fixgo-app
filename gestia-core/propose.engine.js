/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - PROPOSE ENGINE V8.0 (THE ETERNAL ANCHOR)
 * ======================================================================================
 * Función: Traduce hallazgos del Analyzer en planes de acción transaccionales.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * Actualización V8.0: Pureza funcional (sin mutación), anclaje de ID y Resiliencia Total.
 * Autor: Heberto Mendoza (Arquitecto Supremo) & El Abuelo
 * ======================================================================================
 */

/**
 * emitirPulsoHUD: Comunica el estado interno al Event Bus de Jarvis.
 */
function emitirPulsoHUD(step, status = "INFO", details = "") {
    window.dispatchEvent(new CustomEvent('gestia-terminal-state', {
        detail: { state: null, step: `PROPOSE_${step}: ${status}`, details }
    }));
}

/**
 * generarPropuesta: El motor de decisión estratégica (Pure Function).
 */
export function generarPropuesta(analysis) {
    // 🛡️ 1. ANCLAJE DE IDENTIDAD (PUREZA FUNCIONAL)
    // Extraemos el ID o generamos uno nuevo, pero sin mutar el objeto 'analysis'
    const finalId = analysis?.analysis_id || Date.now();
    const timestampLocal = new Date().toISOString();

    // 🛡️ 2. VALIDACIÓN RESILIENTE DE CONTEXTO (SAFE-FAIL)
    if (!analysis || typeof analysis.context !== "object") {
        emitirPulsoHUD("CRASH", "INVALID_CONTEXT_STRUCTURE");
        
        return {
            risk: "HIGH",
            impact: "CRITICAL: Estructura de contexto inválida o corrupta.",
            changes: [],
            needs_approval: true,
            confidence: 0.1,
            metadata: { 
                analysis_id: finalId,
                score_salud: 0,
                timestamp: timestampLocal,
                error: true 
            }
        };
    }

    // 🛡️ 3. PREPARACIÓN Y SANITIZACIÓN
    const userInput = (analysis.input_original || "").trim();
    const context = analysis.context;
    
    emitirPulsoHUD("START", "PLANNING", `Iniciando estrategia para ID: ${finalId}`);

    const data = {
        alerts: analysis?.data?.alerts || analysis?.alerts || [],
        warnings: analysis?.data?.warnings || analysis?.warnings || []
    };

    // Estructura base de la propuesta
    const proposal = {
        risk: "LOW",
        impact: "SISTEMA EN PARÁMETROS NOMINALES",
        changes: [],
        needs_approval: false,
        confidence: 1.0, 
        is_manual_override: false, 
        metadata: {
            analysis_id: finalId, // El ancla eterna
            score_salud: 100,
            timestamp: timestampLocal,
            error: false
        }
    };

    // --- 🚀 4. INTERCEPTOR DE SOBERANÍA (SAFE-FAIL) ---
    const regexNorm = /(?:normaliza|vincula|arregla|ajusta)\s+([A-Z0-9]+)/i;
    const match = userInput.match(regexNorm);

    if (match) {
        const targetId = match[1];
        const operatorUid = context.default_operator_uid || context.user_uid || null;

        if (!operatorUid) {
            proposal.risk = "HIGH";
            proposal.needs_approval = true;
            proposal.impact = "BLOCK: UID_MISSING_FOR_MANUAL_ACTION";
            proposal.confidence = 0.2;
            
            emitirPulsoHUD("INTERCEPT", "BLOCKED", `Falta UID para unidad ${targetId}`);
            return finalizarYValidarPropuesta(proposal, data);
        }

        proposal.risk = "MEDIUM";
        proposal.needs_approval = true;
        proposal.confidence = 0.98; // Confianza máxima en órdenes directas
        proposal.is_manual_override = true;
        proposal.impact = `NORMALIZACIÓN DIRIGIDA: Sincronizando unidad ${targetId} por comando soberano.`;

        proposal.changes.push({
            type: "NORMALIZE_IDENTITY",
            target: targetId, 
            action: "update_record",
            payload: {
                collection: "flotilla_b2b",
                field: "operador_uid",
                uid: operatorUid
            },
            reason: "Ejecución de comando manual de normalización relacional."
        });

        emitirPulsoHUD("INTERCEPT", "OVERRIDE_ACTIVE", targetId);
    }

    // --- 5. LÓGICA DE ALERTAS CRÍTICAS ---
    if (data.alerts.length > 0) {
        proposal.risk = "HIGH";
        proposal.needs_approval = true;
        proposal.impact = "CRITICAL_PATH_BREACH: Riesgos estructurales detectados por SIA7.";

        data.alerts.forEach(alert => {
            if (alert.type === "CODE_DETACHED") {
                proposal.changes.push({
                    type: "REPAIR_RUNTIME_LINK",
                    target: alert.id, 
                    reason: alert.msg,
                    action: "rebind_global_scope",
                    payload: { component: alert.id, severity: "architectural" }
                });
            }

            if (alert.type === "VEHICLE_MAINTENANCE") {
                proposal.changes.push({
                    type: "FORCE_MAINTENANCE_TASK",
                    target: alert.id, 
                    reason: alert.msg,
                    action: "create_urgent_task",
                    payload: { 
                        priority: "emergency", 
                        assigned_to: context.default_operator_uid || "ADMIN_QUEUE",
                        description: `SIA7_URGENTE: ${alert.msg}` 
                    }
                });
            }

            if (alert.type === "HUMAN_RISK") {
                proposal.changes.push({
                    type: "LOCK_RESOURCE",
                    target: alert.id,
                    reason: alert.msg,
                    payload: { status: "safety_lock", timestamp: Date.now() }
                });
            }
        });
    }

    // --- 6. LÓGICA DE ADVERTENCIAS ---
    if (data.warnings.length > 0) {
        if (proposal.risk !== "HIGH") {
            proposal.risk = "MEDIUM";
            proposal.needs_approval = true;
            if (proposal.impact === "SISTEMA EN PARÁMETROS NOMINALES") {
                proposal.impact = "OPTIMIZACIÓN PREVENTIVA: Se sugieren ajustes de salud operativa.";
            }
        }

        data.warnings.forEach(warn => {
            if (warn.type === "VEHICLE_MAINTENANCE") {
                proposal.changes.push({
                    type: "SCHEDULE_MAINTENANCE",
                    target: warn.id,
                    reason: warn.msg,
                    payload: { priority: "medium", category: "preventivo" }
                });
            }
        });
    }

    // --- 7. GUARDIA DE COMPLEJIDAD (SCALABILITY) ---
    if (proposal.changes.length > 10) {
        proposal.risk = "HIGH";
        proposal.needs_approval = true;
        proposal.impact = "COMPLEX_EXECUTION: Volumen de cambios excede umbral de seguridad automática.";
    }

    return finalizarYValidarPropuesta(proposal, data);
}

/**
 * finalizarYValidarPropuesta: Cálculos de Score, Confianza y Blindaje de Contrato.
 */
function finalizarYValidarPropuesta(proposal, data) {
    const A = data.alerts.length;
    const W = data.warnings.length;
    
    // Cálculo de Salud del Sistema: 100 - (A*20 + W*5)
    proposal.metadata.score_salud = Math.max(0, 100 - (A * 20 + W * 5));

    // 🛡️ Cálculo de Confianza Estratégica
    if (!proposal.is_manual_override || proposal.metadata.score_salud < 40) {
        if (A > 0) {
            proposal.confidence = Math.max(0.2, 1 - (A * 0.15));
        }
    }

    // 🛡️ VALIDACIÓN ESTRUCTURAL FINAL (ZERO ERROR TOLERANCE)
    if (!Array.isArray(proposal.changes)) {
        emitirPulsoHUD("CRASH", "MALFORMED_PROPOSAL");
        return { 
            risk: "HIGH", 
            impact: "MALFORMED_PROPOSAL: Estructura de salida inválida.", 
            changes: [], 
            confidence: 0,
            metadata: {
                analysis_id: proposal.metadata.analysis_id, // Correlación inmutable
                score_salud: 0,
                timestamp: proposal.metadata.timestamp,
                error: true
            }
        };
    }

    // Fallback: Si hay alertas pero no hay plan, forzar intervención humana
    if (A > 0 && proposal.changes.length === 0) {
        proposal.risk = "HIGH";
        proposal.impact = "LOGIC_GAP: Alertas detectadas sin plan de resolución asignado.";
        proposal.confidence = 0.1;
    }

    emitirPulsoHUD("END", "STABLE", `Confianza: ${Math.floor(proposal.confidence * 100)}% | ID: ${proposal.metadata.analysis_id}`);
    
    console.log(`%c[PROPOSE_ENGINE]: Plan V8.0 Sellado. ID: ${proposal.metadata.analysis_id}`, "color: #10b981; font-weight: bold;");
    
    return proposal;
}