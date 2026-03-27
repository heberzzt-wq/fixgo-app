// ==========================================
// 🏛️ GESTIA CORE: PERSISTENCE ENGINE V1.0
// ==========================================
// Gestión de transacciones atómicas y Hard Locking Multi-tenant.

import { db } from '../firebase.js';
import { 
    doc, 
    runTransaction, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * PERSISTENCIA ATÓMICA (MODO DIOS):
 * Ejecuta una transacción triple para asegurar la integridad del búnker.
 */
export async function ejecutarPersistenciaCore(moduloId, data, hash, tenantId) {
    const moduloRef = doc(db, "gestia_system_modules", moduloId);
    const historyRef = doc(db, "gestia_system_modules", moduloId, "historial", hash);
    const globalRef = doc(db, "gestia_module_versions_global", hash);

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Verificación de Bloqueo (Mutex)
            const snap = await transaction.get(moduloRef);
            if (snap.exists() && snap.data().locked && snap.data().locked_by !== data.ejecutado_por) {
                throw new Error("MODULO_BLOQUEADO: Otro ingeniero está trabajando en este módulo.");
            }

            // 2. Inmortalizar en el Módulo Principal
            transaction.set(moduloRef, {
                ...data,
                tenantId: tenantId,
                hash_snapshot: hash,
                fecha_actualizacion: serverTimestamp(),
                locked: false // Liberamos el candado tras éxito
            }, { merge: true });

            // 3. Registrar en Historial Local del Módulo
            transaction.set(historyRef, {
                hash_snapshot: hash,
                data_backup: data,
                fecha_registro: serverTimestamp()
            });

            // 4. Registrar en Historial Global (Para el Semantic Engine)
            transaction.set(globalRef, {
                hash_snapshot: hash,
                modulo_origen: moduloId,
                tenantId: tenantId,
                fecha_registro: serverTimestamp()
            });
        });

        return { success: true, hash };

    } catch (e) {
        console.error("🚨 FALLO_TRANSACCIONAL:", e);
        throw e;
    }
}
