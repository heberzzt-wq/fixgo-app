// ==========================================
// ⚙️ GESTIA CORE: OPERATIONS ENGINE V1.0
// ==========================================
// Maneja la orquestación, idempotencia, registro de intención y el Escudo Fiscal multi-tenant.

import { db } from '../firebase.js';
import { 
    doc, 
    getDoc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🔴 1. IMPORTAMOS EL ESCUDO FISCAL (Capa 2 - Backend Firewall)
import { ejecutarFirewallGlobal } from './firewall.engine.js';

/**
 * ORQUESTADOR PRINCIPAL DE OPERACIONES (El Cadenero)
 * Centraliza el flujo: Firewall -> Idempotencia -> Registro -> IA
 */
export async function procesarInstruccionSegura(opId, instruccion, promptHash, SESSION, version) {
    console.log(`🛡️ [Orchestrator] Iniciando validación para operación: ${opId}`);

    // 🔥 PASO 1: FIREWALL ENGINE (Escudo Fiscal)
    // Se ejecuta ANTES de tocar la DB o llamar a la IA. 
    // Si esto falla, lanza un error y corta el flujo de tajo.
    await ejecutarFirewallGlobal({
        userId: SESSION.uid,
        tenantId: SESSION.tenantId,
        input: instruccion
    });

    // 🔒 PASO 2: VERIFICACIÓN DE IDEMPOTENCIA
    // Protege contra doble ejecución y recargos accidentales a la billetera.
    const existe = await verificarIdempotencia(opId);
    if (existe) {
        throw new Error("OPERACION_YA_EJECUTADA_O_EN_PROCESO");
    }

    // 📝 PASO 3: REGISTRO DE OPERACIÓN (Intención)
    // Inmortaliza en Firestore la operación ya validada por el Escudo.
    await registrarOperacion({
        opId: opId,
        promptHash: promptHash,
        userId: SESSION.uid,
        tenantId: SESSION.tenantId,
        version: version
    });

    console.log("✅ [Orchestrator] Flujo autorizado. Operación registrada en DB.");
    return true; 
}

/**
 * Verifica si una operación ya existe (Idempotencia).
 * Evita duplicados y protege la billetera.
 */
export async function verificarIdempotencia(opId) {
    const ref = doc(db, "gestia_operations", opId);
    const snap = await getDoc(ref);
    return snap.exists();
}

/**
 * Registra la intención de una operación.
 * Inmortaliza quién, qué y cuándo se solicitó algo.
 */
export async function registrarOperacion({ opId, promptHash, userId, tenantId, version }) {
    const ref = doc(db, "gestia_operations", opId);
    
    await setDoc(ref, {
        operation_id: opId,
        prompt_hash: promptHash,
        ejecutado_por: userId,
        tenantId: tenantId,
        fecha: serverTimestamp(),
        status: "processing", // Estado inicial
        version_core: version
    });
}
