/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - PERSISTENCE ENGINE V5.28 (INFINITY CORE)
 * ======================================================================================
 * Identidad: Fusión de Arquitectura (Código) y SaaS (Operación).
 * Funciones: Hard Locking (Mutex), Snapshots Globales y Persistencia Dinámica.
 * Regla 1: Código completo. Sin placeholders.
 * ======================================================================================
 */

import { db } from '../firebase.js';
import { 
    doc, 
    runTransaction, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * 🛠️ 1. PERSISTIR ESTRUCTURA DE MÓDULO (EL ARQUITECTO)
 * Guarda el código generado por la IA, gestiona el Mutex y crea Snapshots.
 */
export async function persistirEstructuraModulo(moduloId, data, hash, tenantId, opId) {
    const moduloRef = doc(db, "gestia_system_modules", moduloId);
    const historyRef = doc(db, "gestia_system_modules", moduloId, "historial", hash);
    const globalRef = doc(db, "gestia_module_versions_global", hash);
    const opRef = doc(db, "gestia_operations", opId);

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Verificación de Bloqueo (Tu Mutex V1.0)
            const snap = await transaction.get(moduloRef);
            if (snap.exists() && snap.data().locked && snap.data().locked_by !== data.ejecutado_por) {
                throw new Error("MODULO_BLOQUEADO: Otro ingeniero está trabajando en este ADN.");
            }

            // 2. Inmortalizar en el Módulo Principal (Estructura)
            transaction.set(moduloRef, {
                ...data,
                tenantId: tenantId,
                hash_snapshot: hash,
                fecha_actualizacion: serverTimestamp(),
                locked: false, // Liberamos el candado tras el éxito
                ultima_op: opId
            }, { merge: true });

            // 3. Registrar en Historial Local (Tu Historial V1.0)
            transaction.set(historyRef, {
                hash_snapshot: hash,
                data_backup: data,
                fecha_registro: serverTimestamp(),
                opId: opId
            });

            // 4. Registrar en Historial Global (Para el Semantic Engine)
            transaction.set(globalRef, {
                hash_snapshot: hash,
                modulo_origen: moduloId,
                tenantId: tenantId,
                fecha_registro: serverTimestamp()
            });

            // 5. Cerrar Operación (Justicia V5.28)
            transaction.update(opRef, {
                status: "completed",
                tipo_cambio: "ESTRUCTURA_SISTEMA",
                finalizadoEn: serverTimestamp()
            });
        });

        console.log(`%c🏛️ [Persistence] ADN del Módulo ${moduloId} actualizado y cerrado.`, "color: #3b82f6; font-weight: bold;");
        return { success: true, hash };

    } catch (e) {
        console.error("🚨 FALLO_TRANSACCIONAL_ESTRUCTURA:", e);
        throw e;
    }
}

/**
 * 📦 2. PERSISTIR DATO DINÁMICO (EL SAAS)
 * Guarda los registros de los clientes (Jonathan/Lucia) en la ruta dinámica.
 */
export async function persistirDatoDinamico(payload) {
    const { moduloId, data, opId, userId, tenantId } = payload;

    const registroId = data.id || `REG_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const regRef = doc(db, `gestia_dynamic_data/${moduloId}/registros/${registroId}`);
    const opRef = doc(db, `gestia_operations/${opId}`);

    try {
        await runTransaction(db, async (transaction) => {
            const opSnap = await transaction.get(opRef);
            if (!opSnap.exists()) throw new Error("OPERACION_NO_IDENTIFICADA");

            // Inyectamos Metadatos de Soberanía
            const registroFinal = {
                ...data,
                _meta: {
                    creadoPor: userId,
                    tenantId: tenantId,
                    opId: opId,
                    versionCore: "5.28-SaaS"
                },
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            };

            // Guardamos el registro y cerramos la operación en un solo suspiro
            transaction.set(regRef, registroFinal);
            transaction.update(opRef, {
                status: "completed",
                tipo_cambio: "DATO_DINAMICO",
                registroId: registroId,
                finalizadoEn: serverTimestamp()
            });
        });

        console.log(`%c📦 [Persistence] Registro dinámico guardado con éxito.`, "color: #10b981; font-weight: bold;");
        return { success: true, registroId };

    } catch (e) {
        console.error("🚨 FALLO_TRANSACCIONAL_DATOS:", e);
        throw e;
    }
}
