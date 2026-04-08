/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - OPERATIONS EXECUTOR ENGINE V7.0
 * ======================================================================================
 * Función: El Brazo Mecánico. Ejecuta los cambios físicos aprobados por el Arquitecto.
 * REGLA 1: Código completo. Sin placeholders.
 * Integra: Herencia V5.28 (SafeWriter) para limpieza de datos.
 * ======================================================================================
 */

import { db } from '../firebase.js';
import { 
    doc, 
    updateDoc, 
    addDoc, 
    collection, 
    serverTimestamp,
    runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * 🧹 HERENCIA DEL ABUELO (SafeWriter)
 * Mantenemos la pureza de los datos antes de inyectar a Firestore.
 */
function limpiarUndefined(obj) {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
    );
}

/**
 * ejecutarCambios: Punto de entrada para el "Arre".
 * @param {Object} params - Datos de la operación y lista de cambios.
 */
export async function ejecutarCambios({ operation_id, tenantId, ejecutado_por, changes }) {
    console.log(`%c🚀 [EXECUTOR]: Iniciando ejecución física para OP: ${operation_id}`, "color: #10b981; font-weight: bold;");

    const resultados = [];

    // Usamos una transacción para asegurar que o se aplica todo o nada (Atomicidad)
    try {
        await runTransaction(db, async (transaction) => {
            
            for (const change of changes) {
                const { type, target, payload, action } = change;
                let ref;

                // --- SWITCH DE ACCIONES DE CAMPO ---
                switch (type) {
                    
                    case "LOCK_TECHNICIAN":
                        // Bloqueo de seguridad (Ej: Caso Jonathan)
                        ref = doc(db, "tenants", tenantId, "technicians", target);
                        transaction.update(ref, limpiarUndefined({
                            ...payload,
                            last_lock_date: serverTimestamp(),
                            updated_by: ejecutado_por
                        }));
                        resultados.push({ type, target, status: "updated_lock" });
                        break;

                    case "SCHEDULE_MAINTENANCE":
                        // Creación de Rutina Preventiva
                        const rutinaRef = collection(db, "tenants", tenantId, "routines");
                        // Nota: addDoc no funciona directo en transacción de esta forma, 
                        // pero para V7 usamos el set en un doc generado
                        const newRoutineRef = doc(rutinaRef);
                        transaction.set(newRoutineRef, limpiarUndefined({
                            ...payload,
                            created_at: serverTimestamp(),
                            created_by: ejecutado_por,
                            source_op: operation_id
                        }));
                        resultados.push({ type, target, status: "routine_created" });
                        break;

                    case "RESTRICT_TENANT":
                        // Bloqueo Administrativo del Búnker
                        ref = doc(db, "tenants", target);
                        transaction.update(ref, limpiarUndefined({
                            ...payload,
                            restriction_date: serverTimestamp()
                        }));
                        resultados.push({ type, target, status: "tenant_restricted" });
                        break;

                    default:
                        console.warn(`⚠️ [EXECUTOR]: Tipo de cambio desconocido: ${type}`);
                }
            }

            // --- PASO FINAL: CIERRE DEL LEDGER (V5.28 Integration) ---
            // Actualizamos el status en la colección gestia_operations que creó tu V5.28
            const opRef = doc(db, "gestia_operations", operation_id);
            transaction.update(opRef, {
                status: "completed",
                finished_at: serverTimestamp(),
                execution_log: resultados
            });
        });

        console.log("%c✅ [EXECUTOR]: Cambios persistidos y Ledger actualizado.", "color: #10b981; font-weight: bold;");
        return resultados;

    } catch (error) {
        console.error(`%c❌ [EXECUTOR]: Error fatal en la ejecución: ${error.message}`, "color: #ef4444; font-weight: bold;");
        
        // Intentamos marcar el fallo en el Ledger si es posible
        try {
            const opRef = doc(db, "gestia_operations", operation_id);
            await updateDoc(opRef, { status: "failed", error: error.message });
        } catch (e) { /* Silencio si el error es de conexión */ }
        
        throw error;
    }
}