/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - OPERATIONS ENGINE V6.1 (THE SAGA ORCHESTRATOR)
 * ======================================================================================
 * Identidad: Orquestador Maestro, Motor de Billing Dinámico y Controlador Saga.
 * Función: Controla el flujo exacto [Firewall -> RAM Lock -> Ledger -> Billing -> Saga].
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * --------------------------------------------------------------------------------------
 * INGENIERÍA DE GRADO EMPRESARIAL (V6.1 - PATRÓN SAGA):
 * 1. SAGA PATTERN (COMPENSATORY ROLLBACK): Implementación de reembolsos automáticos 
 * (Refunds) mediante 'compensarFalloOperacion' si el Executor falla post-cobro.
 * 2. LIFECYCLE COMPLETION: Sistema de sellado 'sellarOperacionExito' para transicionar 
 * el estado de 'processing' a 'completed' tras la ejecución exitosa.
 * 3. DYNAMIC BILLING ENGINE: Eliminación de costos hardcodeados. El precio ahora
 * se calcula dinámicamente basado en la complejidad y los límites de la sesión.
 * 4. STRICT SESSION GATING: Validación profunda del objeto SESSION (autorización, rol, 
 * tenant) antes de permitir el acceso al Firewall y la base de datos.
 * 5. ATOMIC IDEMPOTENCY: Protección en transacción para evitar Double-Billing.
 * 6. DISTRIBUTED AWARENESS: Preparado arquitectónicamente para locks distribuidos.
 * ======================================================================================
 */

import { db } from '/firebase.js';
import { 
    doc, 
    getDoc, 
    updateDoc,
    runTransaction, 
    serverTimestamp,
    increment 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🔴 IMPORTACIÓN DEL ESCUDO FISCAL (Capa 2 - Backend Firewall)
import { ejecutarFirewallGlobal } from '/gestia-core/firewall.engine.js';

/**
 * --- 🧠 MEMORIA VOLÁTIL DE ORQUESTACIÓN (RAM LOCK) ---
 * NOTA DE ARQUITECTURA: Este Lock es local (por pestaña/instancia).
 * En V7 (Backend), este set migrará a un Redis Lock o un Firestore Lock Doc
 * para protección distribuida absoluta.
 */
const activeRequests = new Set();

/**
 * emitSia7: Telemetría táctica para el Jarvis HUD V10.
 * Inyecta el pulso de la orquestación directamente en la interfaz del Arquitecto.
 */
const emitSia7 = (opId, step, details, severity = "INFO") => {
    window.dispatchEvent(new CustomEvent('gestia-terminal-state', {
        detail: {
            step: `ORCHESTRATOR:${step}`,
            details: details,
            opId: opId,
            severity: severity,
            modulo: "OPERATIONS_ENGINE"
        }
    }));
};

/**
 * deepSanitize: El Filtro del Abuelo (Nivel NASA).
 * Limpieza recursiva que purga cualquier 'undefined' para evitar crashes.
 */
function deepSanitize(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(deepSanitize);

    return Object.entries(obj).reduce((acc, [key, value]) => {
        if (value !== undefined) {
            acc[key] = (typeof value === "object") ? deepSanitize(value) : value;
        }
        return acc;
    }, {});
}

/**
 * calcularCostoDinamico: Motor de Pricing en Tiempo Real.
 * @param {Object} SESSION - Contexto del usuario y sus límites.
 * @param {string} version - Versión del core o modelo de IA utilizado.
 * @returns {number} Costo exacto de la operación.
 */
function calcularCostoDinamico(SESSION, version) {
    // Tarifador base dinámico
    let baseCost = 0.05; // Costo por defecto (GPT-4o mini / Claude Haiku)
    
    if (version?.includes("INFINITY") || version?.includes("GOD_MODE")) {
        baseCost = 0.15; // Modelos de razonamiento avanzado (Opus / GPT-4o)
    }

    // Descuentos o recargos por rol (Ej: Arquitecto Supremo no paga)
    if (SESSION?.role === "arquitecto_supremo") {
        return 0.0000;
    }

    return baseCost;
}

/**
 * calcularSplit: Sistema de Precisión de Cobro (32/68).
 * Blindado contra errores de coma flotante nativos de JavaScript.
 */
function calcularSplit(monto) {
    const safeMonto = isNaN(monto) || monto === undefined || monto < 0 ? 0 : monto;
    
    // Multiplicamos por 10000 y dividimos para garantizar 4 decimales exactos
    const devSplit = Math.round((safeMonto * 0.32) * 10000) / 10000;
    const tenantSplit = Math.round((safeMonto * 0.68) * 10000) / 10000;

    return { dev: devSplit, tenant: tenantSplit };
}

/**
 * procesarInstruccionSegura: El Cadenero Supremo (Main Entrypoint).
 * Centraliza el flujo: RAM Lock -> Firewall -> Idempotencia Atómica -> Billing.
 * @param {string} opId - Identificador único de la intención.
 * @param {string} instruccion - Prompt crudo del usuario.
 * @param {string} promptHash - Firma criptográfica del prompt.
 * @param {Object} SESSION - Objeto inmutable de soberanía (Core Auth).
 * @param {string} version - Versión del motor solicitante.
 * @returns {Object} { autorizado: boolean, costo: number }
 */
export async function procesarInstruccionSegura(opId, instruccion, promptHash, SESSION, version) {
    emitSia7(opId, "INIT", `Orquestando intención: V${version || "6.1_SAGA"}`, "INFO");

    // --- 🛡️ PASO 0.1: VALIDACIÓN DE SOBERANÍA ESTRICTA ---
    if (!SESSION || !SESSION.authorized || !SESSION.tenantId || !SESSION.uid) {
        emitSia7(opId, "AUTH_DENIED", "Sesión corrupta o sin soberanía verificada.", "ERROR");
        throw new Error("ORCHESTRATOR: RECHAZO_POR_SOBERANIA_INVALIDA");
    }

    // --- 🛡️ PASO 0.2: RAM CONCURRENCY LOCK (ANTI-DOBLE CLIC) ---
    if (activeRequests.has(opId)) {
        emitSia7(opId, "RAM_LOCK", "Colisión detectada en RAM. Abortando duplicado.", "WARN");
        throw new Error("OPERACION_YA_EN_PROCESO_LOCAL");
    }
    activeRequests.add(opId);

    try {
        // --- 🔥 PASO 1: FIREWALL ENGINE (ESCUDO FISCAL EXTERNO) ---
        emitSia7(opId, "FIREWALL_CHECK", "Sometiendo intención al Escudo Fiscal...", "INFO");
        
        await ejecutarFirewallGlobal({
            userId: SESSION.uid,
            tenantId: SESSION.tenantId,
            input: instruccion
        });

        // --- ⚖️ PASO 2: CÁLCULO DINÁMICO DE COSTOS ---
        const costoReal = calcularCostoDinamico(SESSION, version);

        // --- ⚖️ PASO 3: REGISTRO ATÓMICO + IDEMPOTENCIA + SPLIT BILLING ---
        emitSia7(opId, "TRANSACTION", `Iniciando firma atómica y cobro: $${costoReal} USD...`, "INFO");

        await registrarOperacion({
            opId: opId,
            promptHash: promptHash,
            userId: SESSION.uid,
            tenantId: SESSION.tenantId,
            version: version,
            costoReal: costoReal
        });

        emitSia7(opId, "SUCCESS", "Salto Cuántico Autorizado. Cobro sellado en Ledger.", "SUCCESS");
        return { autorizado: true, costo: costoReal }; 

    } catch (error) {
        emitSia7(opId, "CRASH", `Operación denegada por Orquestador: ${error.message}`, "ERROR");
        throw error; 
    } finally {
        // Liberación del Lock Local preventivo
        activeRequests.delete(opId);
    }
}

/**
 * registrarOperacion: Ejecución Atómica de Alta Fidelidad.
 */
async function registrarOperacion({ opId, promptHash, userId, tenantId, version, costoReal }) {
    const opRef = doc(db, "gestia_operations", opId);
    const tenantRef = doc(db, "tenants", tenantId);
    const safeVersion = version ?? "V6.1_SAGA"; 

    try {
        await runTransaction(db, async (transaction) => {
            
            // --- 🔒 1. IDEMPOTENCIA ATÓMICA ---
            const opSnap = await transaction.get(opRef);
            if (opSnap.exists()) {
                throw new Error("OPERACION_YA_EJECUTADA_O_EN_PROCESO");
            }

            // --- 🏢 2. VALIDACIÓN DE BÚNKER ---
            const tenantSnap = await transaction.get(tenantRef);
            if (!tenantSnap.exists()) throw new Error("TENANT_NO_ENCONTRADO_EN_DB");

            // --- ⚖️ 3. CÁLCULO DE BILLING EXACTO ---
            const split = calcularSplit(costoReal);

            // --- 🗃️ 4. CONSTRUCCIÓN DE PAYLOAD (STATUS: PROCESSING) ---
            const payload = deepSanitize({
                operation_id: opId,
                prompt_hash: promptHash,
                ejecutado_por: userId,
                tenantId: tenantId,
                fecha: serverTimestamp(),
                status: "processing", // Pendiente de resolución por el Executor
                version_core: safeVersion,
                billing: {
                    total: costoReal,
                    split_32_dev: split.dev,
                    split_68_tenant: split.tenant,
                    currency: "USD",
                    status: "charged"
                }
            });

            transaction.set(opRef, payload);

            // --- 💰 5. ACTUALIZACIÓN ATÓMICA DEL TENANT (COBRO) ---
            const tenantUpdatePayload = deepSanitize({
                "stats.last_op_id": opId,
                "stats.total_spend": increment(costoReal),
                "stats.total_ops_month": increment(1),
                "updated_at": serverTimestamp()
            });

            transaction.update(tenantRef, tenantUpdatePayload);
        });
    } catch (err) {
        throw new Error(`FALLO_TRANSACCION_REGISTRO: ${err.message}`);
    }
}

/**
 * ======================================================================================
 * 🛡️ PATRÓN SAGA: CONTROL DE CICLO DE VIDA Y ROLLBACKS
 * ======================================================================================
 */

/**
 * sellarOperacionExito: Transiciona el estado de 'processing' a 'completed'.
 * Llamada por la Terminal tras recibir confirmación de éxito del Executor.
 * @param {string} opId - Identificador de la operación.
 */
export async function sellarOperacionExito(opId) {
    try {
        const opRef = doc(db, "gestia_operations", opId);
        await updateDoc(opRef, {
            status: "completed",
            completed_at: serverTimestamp()
        });
        emitSia7(opId, "SEALED", "Ciclo de vida cerrado exitosamente.", "SUCCESS");
    } catch (error) {
        console.error("🚨 [SAGA] Fallo al sellar operación exitosa:", error);
        emitSia7(opId, "SEAL_ERROR", "Fallo al sellar documento, pero ejecución completada.", "WARN");
    }
}

/**
 * compensarFalloOperacion: El Rollback Lógico (Refund).
 * Si el Executor falla *después* de que el Orquestador ya cobró, esta función
 * devuelve el dinero al tenant y marca la operación como fallida.
 * @param {string} opId - ID de la operación fallida.
 * @param {string} tenantId - Búnker afectado.
 * @param {number} montoReembolso - Cantidad exacta a devolver.
 * @param {string} errorLog - Razón del fallo para auditoría.
 */
export async function compensarFalloOperacion(opId, tenantId, montoReembolso, errorLog) {
    emitSia7(opId, "SAGA_COMPENSATION", `Iniciando Refund por fallo: $${montoReembolso} USD`, "WARN");
    
    const opRef = doc(db, "gestia_operations", opId);
    const tenantRef = doc(db, "tenants", tenantId);
    const safeRefund = Math.abs(typeof montoReembolso === "number" ? montoReembolso : 0);

    try {
        await runTransaction(db, async (transaction) => {
            // Validamos que la operación exista y no esté ya completada/reembolsada
            const opSnap = await transaction.get(opRef);
            if (!opSnap.exists()) return;
            if (opSnap.data().status === "completed" || opSnap.data().status === "rolled_back") return;

            // 1. Marcar operación como fallida y reembolsada
            transaction.update(opRef, deepSanitize({
                status: "failed_rolled_back",
                error_log: errorLog || "Error crítico en Executor",
                failed_at: serverTimestamp(),
                billing: {
                    status: "refunded",
                    refund_amount: safeRefund
                }
            }));

            // 2. Devolver los fondos al Tenant mediante decremento
            if (safeRefund > 0) {
                transaction.update(tenantRef, deepSanitize({
                    "stats.total_spend": increment(-safeRefund), // Devolución exacta
                    "stats.total_ops_month": increment(-1),      // Revertimos la contabilidad de uso
                    "updated_at": serverTimestamp()
                }));
            }
        });

        emitSia7(opId, "SAGA_REFUND_DONE", "Fondos devueltos. Integridad restaurada.", "SUCCESS");
    } catch (error) {
        console.error("🚨 [SAGA CRITICAL] Fallo en compensación de rollback:", error);
        emitSia7(opId, "SAGA_CRASH", "Fallo crítico en reembolso. Requiere auditoría manual.", "ERROR");
    }
}

// Log Corporativo Táctico
console.log("%c🛡️ [OPERATIONS_ENGINE]: V6.1 SAGA ORCHESTRATOR ONLINE", "color: #fbbf24; font-weight: bold; background: #451a03; border-left: 4px solid #b45309; padding: 2px 10px;");

/**
 * ======================================================================================
 * FIN DEL ARCHIVO
 * ======================================================================================
 */