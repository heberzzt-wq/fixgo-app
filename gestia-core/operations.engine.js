// ==========================================
// ⚙️ GESTIA CORE: OPERATIONS ENGINE V1.0
// ==========================================
// Maneja la idempotencia y el registro de intención multi-tenant.

import { db } from '../firebase.js';
import { 
    doc, 
    getDoc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
