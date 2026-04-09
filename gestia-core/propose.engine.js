/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - OPERATIONS EXECUTOR ENGINE V7.2.8 (RELATIONAL_RECOVERY_B2B)
 * ======================================================================================
 * Función: El Brazo Mecánico con lógica autocurativa y salida temprana.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * Actualización V7.2.8: Integración de NORMALIZE_VEHICLE_OPERATOR para Flotilla B2B.
 * Autor: Heber Mendoza (Arquitecto Supremo) & El Abuelo
 * ======================================================================================
 */

// 1. SSOT LOCAL (Single Source of Truth)
import { 
    db, 
    doc, 
    collection, 
    serverTimestamp 
} from '../firebase.js';

// 2. SDK OFICIAL (CDN)
// Se añaden query, where y getDocs para soportar la normalización por placas.
import { 
    runTransaction,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * limpiarPayload: Elimina undefined para evitar el crash de Firebase.
 * Es vital para que la transacción no aborte si faltan metadatos.
 */
const limpiarPayload = (obj) => {
    return Object.entries(obj).reduce((acc, [key, value]) => {
        if (value !== undefined) acc[key] = value;
        return acc;
    }, {});
};

/**
 * ejecutarCambios: Ejecución atómica de la propuesta aprobada.
 */
export async function ejecutarCambios(proposal) {
    const { operation_id, tenantId, ejecutado_por, changes } = proposal;
    
    // 🛡️ GUARDRAIL DEFENSIVO: Si no hay cambios, no molestamos a la base de datos.
    const safeChanges = Array.isArray(changes) ? changes : [];
    
    if (safeChanges.length === 0) {
        console.log("%c[EXECUTOR]: Sin cambios detectados. Abortando ejecución.", "color: #f59e0b;");
        return [];
    }

    console.log(`%c[EXECUTOR]: Iniciando impacto transaccional para OP: ${operation_id}`, "color: #10b981; font-weight: bold;");
    const results = [];

    try {
        // Iniciamos la transacción maestra de Firestore
        await runTransaction(db, async (transaction) => {
            
            for (const change of safeChanges) {
                const { type, target, payload, reason } = change;
                let ref;

                // --- 🛡️ PROTOCOLO DE AUDITORÍA (LEDGER) ---
                // Cada acción deja una huella en el ledger del tenant para auditoría forense.
                const ledgerRef = doc(collection(db, "tenants", tenantId, "gestia_ledger"));
                
                transaction.set(ledgerRef, {
                    op_id: operation_id,
                    type,
                    target,
                    ejecutado_por,
                    timestamp: serverTimestamp(),
                    reason: reason || "Ejecución por orden de la terminal"
                });

                // --- ⚙️ LÓGICA DE IMPACTO SEGÚN TIPO ---
                switch (type) {

                    // 🚀 NUEVO: Normalización de Datos en Flotilla B2B
                    case "NORMALIZE_VEHICLE_OPERATOR":
                        // Localizamos el vehículo por placas (target) en la colección específica de B2B
                        const vehiculosRef = collection(db, "flotilla_b2b", tenantId, "vehiculos");
                        const q = query(vehiculosRef, where("placas", "==", target));
                        const snap = await getDocs(q);

                        snap.forEach(docSnap => {
                            transaction.update(docSnap.ref, {
                                operador_uid: payload.uid,
                                normalized_at: serverTimestamp(),
                                audit_op: operation_id,
                                status_enlace: "verificado"
                            });
                        });
                        
                        results.push({ type, target, status: "vehiculo_normalizado" });
                        break;

                    case "REPAIR_RUNTIME_LINK":
                        // Marcamos la operación como reparada para que el observador de la UI reaccione.
                        ref = doc(db, "gestia_operations", operation_id);
                        
                        transaction.update(ref, limpiarPayload({
                            runtime_repaired: true,
                            repaired_component: target,
                            repair_timestamp: serverTimestamp()
                        }));
                        
                        results.push({ type, target, status: "runtime_link_repaired" });
                        break;

                    case "SYSTEM_RESTRICTION":
                        // El Escudo de Heber: Bloqueo de seguridad si la arquitectura falla.
                        ref = doc(db, "tenants", tenantId);
                        
                        transaction.update(ref, limpiarPayload({
                            shield_level: payload?.severity === "CRITICAL" ? "READ_ONLY" : "WARNING",
                            restriction_active: true,
                            restriction_reason: reason || "Fallo arquitectónico detectado",
                            restricted_at: serverTimestamp()
                        }));
                        
                        results.push({ type, target, status: "system_restricted" });
                        break;

                    case "FORCE_MAINTENANCE_TASK":
                        // Creación de la tarea para Jonathan (El Gol de Jonathan)
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
                        // Bloqueo de técnico por riesgos de seguridad detectados.
                        ref = doc(db, "tenants", tenantId, "technicians", target);
                        
                        transaction.update(ref, limpiarPayload({
                            ...payload,
                            status: "safety_lock",
                            lock_timestamp: serverTimestamp()
                        }));
                        
                        results.push({ type, target, status: "technician_locked" });
                        break;

                    default:
                        console.warn(`%c[EXECUTOR]: Tipo de cambio desconocido ignorado: ${type}`, "color: #f59e0b;");
                }
            }

            // --- ✅ CIERRE DE OPERACIÓN MAESTRA ---
            // Actualizamos el estado final de la OP para confirmar que el pipeline terminó.
            const finalOpRef = doc(db, "gestia_operations", operation_id);
            
            transaction.update(finalOpRef, {
                status: "completed",
                completed_at: serverTimestamp(),
                affected_actions: results.length
            });
            
        });

        console.log(`%c[EXECUTOR]: Misión cumplida. Acciones persistidas: ${results.length}`, "color: #10b981; font-weight: bold;");
        return results;

    } catch (error) {
        console.error("❌ CRASH_EN_EXECUTOR:", error);
        throw error;
    }
}