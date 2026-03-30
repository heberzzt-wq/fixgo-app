/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - OPERATIONS ENGINE V5.28 (INFINITY CORE)
 * ======================================================================================
 * Maneja la orquestación, idempotencia, registro de intención y el Escudo Fiscal multi-tenant.
 * REGLA 1: Código completo. Sin compactar.
 * ======================================================================================
 */

import { db } from '../firebase.js';
import { 
    doc, 
    getDoc, 
    runTransaction, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🔴 1. IMPORTAMOS EL ESCUDO FISCAL (Capa 2 - Backend Firewall)
import { ejecutarFirewallGlobal } from './firewall.engine.js';

/**
 * ORQUESTADOR PRINCIPAL DE OPERACIONES (El Cadenero Supremo)
 * Centraliza el flujo: Firewall -> Idempotencia -> Registro Atómico + Billing -> IA
 */
export async function procesarInstruccionSegura(opId, instruccion, promptHash, SESSION, version) {
    console.log(`%c🛡️ [Orchestrator] Iniciando validación V5.28 para: ${opId}`, "color: #3b82f6; font-weight: bold;");

    try {
        // 🔥 PASO 1: FIREWALL ENGINE (Escudo Fiscal)
        // No tocamos la DB si el Firewall detecta actividad hostil o fuera de presupuesto.
        await ejecutarFirewallGlobal({
            userId: SESSION.uid,
            tenantId: SESSION.tenantId,
            input: instruccion
        });

        // 🔒 PASO 2: VERIFICACIÓN DE IDEMPOTENCIA
        // Evita que el cliente recargue la página y se le cobre dos veces por la misma instrucción.
        const existe = await verificarIdempotencia(opId);
        if (existe) {
            throw new Error("OPERACION_YA_EJECUTADA_O_EN_PROCESO");
        }

        // ⚖️ PASO 3: REGISTRO ATÓMICO + SPLIT BILLING (Justicia)
        // Inmortaliza la intención y asegura el cobro 32/68 en una sola transacción.
        await registrarOperacion({
            opId: opId,
            promptHash: promptHash,
            userId: SESSION.uid,
            tenantId: SESSION.tenantId,
            version: version,
            costoSimulado: 0.05 // Configurable según el modelo de IA
        });

        console.log("%c✅ [Orchestrator] Salto Cuántico Autorizado. ADN persistido y cobro aplicado.", "color: #10b981; font-weight: bold;");
        return true; 

    } catch (error) {
        console.error(`%c❌ [Orchestrator] Operación Bloqueada: ${error.message}`, "color: #ef4444; font-weight: bold;");
        throw error; // El Módulo 6 capturará este error para la UI
    }
}

/**
 * Verifica si una operación ya existe (Idempotencia).
 */
export async function verificarIdempotencia(opId) {
    if (!opId) return false;
    const ref = doc(db, "gestia_operations", opId);
    const snap = await getDoc(ref);
    return snap.exists();
}

/**
 * ⚖️ CÁLCULO INTERNO DE SPLIT BILLING
 */
function calcularSplit(monto) {
    return {
        dev: parseFloat((monto * 0.32).toFixed(4)), // 32% para la Infraestructura God
        tenant: parseFloat((monto * 0.68).toFixed(4)) // 68% para la operación
    };
}

/**
 * REGISTRA LA OPERACIÓN CON TRANSACCIÓN ATÓMICA
 * Aquí es donde la V5.28 supera a la V1.0. 
 * Si el registro falla, no hay rastro. Si el registro tiene éxito, el cobro es ley.
 */
export async function registrarOperacion({ opId, promptHash, userId, tenantId, version, costoSimulado }) {
    const opRef = doc(db, "gestia_operations", opId);
    const tenantRef = doc(db, "tenants", tenantId);

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Consultar estado del Tenant
            const tenantSnap = await transaction.get(tenantRef);
            if (!tenantSnap.exists()) throw new Error("TENANT_NO_ENCONTRADO");

            const split = calcularSplit(costoSimulado);

            // 2. Escribir la operación (Equivalente a tu setDoc pero protegido)
            transaction.set(opRef, {
                operation_id: opId,
                prompt_hash: promptHash,
                ejecutado_por: userId,
                tenantId: tenantId,
                fecha: serverTimestamp(),
                status: "processing", 
                version_core: version,
                billing: {
                    total: costoSimulado,
                    split_32_dev: split.dev,
                    split_68_tenant: split.tenant,
                    currency: "USD"
                }
            });

            // 3. Actualizar la contabilidad del búnker en tiempo real
            transaction.update(tenantRef, {
                "stats.last_op_id": opId,
                "stats.total_spend": (tenantSnap.data().stats?.total_spend || 0) + costoSimulado,
                "updated_at": serverTimestamp()
            });
        });
    } catch (err) {
        throw new Error(`FALLO_TRANSACCION_REGISTRO: ${err.message}`);
    }
}
