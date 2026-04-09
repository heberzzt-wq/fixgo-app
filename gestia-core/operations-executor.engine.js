/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - OPERATIONS EXECUTOR ENGINE V7.3.0 (IDENTITY_RESOLVER)
 * ======================================================================================
 * Función: El Brazo Mecánico con lógica autocurativa y resolución dinámica de UID.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * Actualización V7.3.0: Corrección de raíz en el mapeo de operadores (B2B Logic).
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
                const ledgerRef = doc(collection(db, "tenants", tenantId, "gestia_ledger"));
                
                transaction.set(ledgerRef, {
                    op_id: operation_id,
                    type,
                    target,
                    ejecutado_por,
                    timestamp: serverTimestamp(),
                    reason: reason || "Ejecución por resolución de identidad de raíz"
                });

                // --- ⚙️ LÓGICA DE IMPACTO SEGÚN TIPO ---
                switch (type) {

                    // 🚀 NORMALIZACIÓN B2B: Resolución de UID y Vinculación Dual
                    case "NORMALIZE_VEHICLE_OPERATOR":
                        console.log(`%c[ENGINE]: Resolviendo identidad para operador: ${payload.nombre_operador}`, "color: #3b82f6;");

                        // 1. Buscamos el UID real del operador en la colección de la flotilla
                        const operadoresRef = collection(db, "flotilla_b2b", tenantId, "operadores");
                        const qOp = query(operadoresRef, where("nombre", "==", payload.nombre_operador || "JONATHAN OPERADOR B2B"));
                        const opSnap = await getDocs(qOp);

                        let resolvedUid = null;
                        opSnap.forEach(d => {
                            resolvedUid = d.id; // El ID del documento es el UID de Auth
                        });

                        if (!resolvedUid) {
                            console.error(`[ENGINE]: No se encontró UID para el operador ${payload.nombre_operador}. Usando fallback de payload si existe.`);
                            resolvedUid = payload.uid; 
                        }

                        // 2. Localizamos el vehículo por placas (target)
                        const vehiculosRef = collection(db, "flotilla_b2b", tenantId, "vehiculos");
                        const qVeh = query(vehiculosRef, where("placas", "==", target));
                        const vehSnap = await getDocs(qVeh);

                        // 3. Aplicamos la actualización atómica
                        vehSnap.forEach(docSnap => {
                            transaction.update(docSnap.ref, {
                                operador_uid: resolvedUid,   // Vínculo lógico de datos
                                assigned_to: resolvedUid,    // Vínculo de visibilidad UI (BOTÓN JONATHAN)
                                normalized_at: serverTimestamp(),
                                status_enlace: "verificado",
                                audit_op: operation_id,
                                actualizador_root: true
                            });
                        });
                        
                        results.push({ 
                            type, 
                            target, 
                            status: "vehiculo_normalizado_con_render", 
                            resolved_uid: resolvedUid 
                        });
                        break;

                    case "REPAIR_RUNTIME_LINK":
                        ref = doc(db, "gestia_operations", operation_id);
                        transaction.update(ref, limpiarPayload({
                            runtime_repaired: true,
                            repaired_component: target,
                            repair_timestamp: serverTimestamp()
                        }));
                        results.push({ type, target, status: "runtime_link_repaired" });
                        break;

                    case "SYSTEM_RESTRICTION":
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
                        console.warn(`%c[EXECUTOR]: Tipo de cambio desconocido ignorado: ${type}`, "color: #f59e0b;");
                }
            }

            // --- ✅ CIERRE DE OPERACIÓN MAESTRA ---
            const finalOpRef = doc(db, "gestia_operations", operation_id);
            transaction.update(finalOpRef, {
                status: "completed",
                completed_at: serverTimestamp(),
                affected_actions: results.length,
                engine_version: "7.3.0"
            });
            
        });

        console.log(`%c[EXECUTOR]: Misión cumplida. Acciones persistidas: ${results.length}`, "color: #10b981; font-weight: bold;");
        return results;

    } catch (error) {
        console.error("❌ CRASH_EN_EXECUTOR:", error);
        throw error;
    }
}