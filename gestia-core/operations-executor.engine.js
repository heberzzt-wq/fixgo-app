/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - OPERATIONS EXECUTOR ENGINE V7.2.5 (SHIELD EDITION)
 * ======================================================================================
 * Función: El Brazo Mecánico con Protocolo de Restricción Inteligente.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * ======================================================================================
 */

import { 
    db, 
    doc, 
    collection, 
    serverTimestamp,
    runTransaction 
} from '../firebase.js';

/**
 * limpiarPayload: Elimina undefined para evitar el crash de Firebase en transacciones.
 */
const limpiarPayload = (obj) => {
    return Object.entries(obj).reduce((acc, [key, value]) => {
        if (value !== undefined) acc[key] = value;
        return acc;
    }, {});
};

export async function ejecutarCambios(proposal) {
    const { operation_id, tenantId, ejecutado_por, changes } = proposal;
    const results = [];

    console.log(`%c[EXECUTOR]: Iniciando protocolo de impacto para OP: ${operation_id}`, "color: #10b981; font-weight: bold;");

    try {
        await runTransaction(db, async (transaction) => {
            for (const change of changes) {
                const { type, target, payload, reason } = change;
                let ref;

                // --- 🛡️ PROTOCOLO DE AUDITORÍA (LEDGER) ---
                const ledgerRef = doc(collection(db, "tenants", tenantId, "gestia_ledger"));
                transaction.set(ledgerRef, {
                    op_id: operation_id,
                    type,
                    target,
                    ejecutado_por,
                    timestamp: serverTimestamp(),
                    reason: reason || "Ejecución por orden de la terminal"
                });

                // --- ⚙️ LÓGICA DE EJECUCIÓN FÍSICA ---
                switch (type) {

                    case "REPAIR_RUNTIME_LINK":
                        // Registramos la reparación en la OP para que el observador de la UI reaccione
                        ref = doc(db, "gestia_operations", operation_id);
                        transaction.update(ref, limpiarPayload({
                            runtime_repaired: true,
                            repaired_component: target,
                            repair_timestamp: serverTimestamp()
                        }));
                        results.push({ type, target, status: "runtime_hook_fixed" });
                        break;

                    case "SYSTEM_RESTRICTION":
                        /**
                         * 🛡️ EL ESCUDO DE HEBER:
                         * No solo bloquea, marca el grado de integridad del búnker.
                         */
                        ref = doc(db, "tenants", tenantId);
                        transaction.update(ref, limpiarPayload({
                            shield_level: payload?.severity === "CRITICAL" ? "READ_ONLY" : "WARNING",
                            restriction_active: true,
                            restriction_reason: reason || "Fallo arquitectónico detectado",
                            last_security_event: operation_id,
                            restricted_at: serverTimestamp()
                        }));
                        results.push({ type, target, status: "shield_activated" });
                        break;

                    case "FORCE_MAINTENANCE_TASK":
                        // Creación de la tarea para Jonathan
                        const tasksCol = collection(db, "tenants", tenantId, "tasks");
                        const newTaskRef = doc(tasksCol);
                        transaction.set(newTaskRef, limpiarPayload({
                            ...payload,
                            created_by: ejecutado_por,
                            source: "TERMINAL_HEBERTO",
                            op_id: operation_id,
                            timestamp: serverTimestamp(),
                            status: "pending"
                        }));
                        results.push({ type, target, status: "urgent_task_created" });
                        break;

                    case "LOCK_TECHNICIAN":
                        ref = doc(db, "tenants", tenantId, "technicians", target);
                        transaction.update(ref, limpiarPayload({
                            ...payload,
                            status: "safety_lock",
                            lock_timestamp: serverTimestamp()
                        }));
                        results.push({ type, target, status: "technician_locked" });
                        break;

                    default:
                        console.warn(`%c[EXECUTOR]: Protocolo desconocido para el tipo: ${type}`, "color: #f59e0b;");
                }
            }

            // --- ✅ CIERRE DE OPERACIÓN MAESTRA ---
            const finalOpRef = doc(db, "gestia_operations", operation_id);
            transaction.update(finalOpRef, {
                status: "completed",
                completed_at: serverTimestamp(),
                affected_actions: results.length
            });
        });

        console.log(`%c[EXECUTOR]: Misión cumplida. Acciones ejecutadas: ${results.length}`, "color: #10b981; font-weight: bold;");
        return results;

    } catch (error) {
        console.error("❌ CRASH_EN_EXECUTOR:", error);
        throw error;
    }
}