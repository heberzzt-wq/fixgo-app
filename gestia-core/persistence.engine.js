/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - PERSISTENCE ENGINE V5.28 (INFINITY CORE)
 * ======================================================================================
 * Identidad: Fusión Total (Arquitectura + SaaS + Identidad Unificada).
 * Funciones: Hard Locking (Mutex), Snapshots, Datos Dinámicos y Perfiles B2B/B2C.
 * Regla 1: Código completo. Sin compactar. Sin placeholders.
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
            // 1. Verificación de Bloqueo (Mutex Original Heberto V1.0)
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
                locked: false, // Liberamos el candado tras éxito
                ultima_op: opId
            }, { merge: true });

            // 3. Registrar en Historial Local del Módulo
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

        console.log(`%c🏛️ [Persistence] Estructura ${moduloId} sellada con Hash: ${hash}`, "color: #3b82f6; font-weight: bold;");
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

            // Ejecución Atómica
            transaction.set(regRef, registroFinal);
            transaction.update(opRef, {
                status: "completed",
                tipo_cambio: "DATO_DINAMICO",
                registroId: registroId,
                finalizadoEn: serverTimestamp()
            });
        });

        console.log(`%c📦 [Persistence] Dato guardado en ${moduloId} exitosamente.`, "color: #10b981; font-weight: bold;");
        return { success: true, registroId };

    } catch (e) {
        console.error("🚨 FALLO_TRANSACCIONAL_DATOS:", e);
        throw e;
    }
}

/**
 * 👤 3. PERSISTIR PERFIL USUARIO (IDENTIDAD UNIFICADA - BLOQUE B)
 * Fusiona perfiles en la colección única 'users' según el rol (B2B / B2C / PRO).
 */
export async function persistirPerfilUsuario(uid, payload, opId) {
    const userRef = doc(db, "users", uid);
    const opRef = doc(db, "gestia_operations", opId);

    try {
        await runTransaction(db, async (transaction) => {
            const opSnap = await transaction.get(opRef);
            if (!opSnap.exists()) throw new Error("OPERACION_AUTH_NO_REGISTRADA");

            const { rol, datos } = payload;
            
            // ADN BASE UNIFICADO
            let perfilFinal = {
                uid: uid,
                nombre: datos.nombre,
                email: datos.email.toLowerCase(),
                rol: rol,
                telefono: datos.telefono,
                estado: datos.estado || "activo",
                status: datos.status || "activo",
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp(),
                _meta: { opId: opId, v: "5.28-CORE-IDENTITY" }
            };

            // RAMIFICACIÓN LÓGICA (B2B vs B2C vs SOCIO)
            if (rol === "admin_b2b") {
                perfilFinal.tipo_cuenta = "B2B";
                perfilFinal.sub_type = "saas";
                perfilFinal.edificioId = datos.edificioId;
                perfilFinal.edificioNombre = datos.edificioNombre;
            } 
            else if (rol === "cliente") {
                perfilFinal.tipo_cuenta = "B2C";
                perfilFinal.sub_type = "marketplace";
                perfilFinal.metodo_pago_default = datos.metodo_pago || null;
            }
            else if (rol === "tecnico") {
                perfilFinal.tipo_cuenta = "SocioPro";
                perfilFinal.sub_type = "marketplace";
                perfilFinal.nivel = "BRONCE";
                perfilFinal.reputacion = 5.0;
                perfilFinal.documentos = datos.documentos || {};
                perfilFinal.datos_bancarios = datos.datos_bancarios || {};
                perfilFinal.vehiculo = datos.vehiculo || { tipo: "peaton" };
                perfilFinal.skills = datos.skills || [];
                // Unificación de campo de foto solicitada
                perfilFinal.foto_perfil = datos.foto_perfil || datos.fotoPerfil || null;
            }

            // Escritura y cierre de operación en un solo suspiro
            transaction.set(userRef, perfilFinal);
            transaction.update(opRef, {
                status: "completed",
                userId: uid,
                tipo_registro: rol,
                finalizadoEn: serverTimestamp()
            });
        });

        console.log(`%c👤 [Identidad] Perfil ${payload.rol} inmortalizado para ${uid}.`, "color: #8b5cf6; font-weight: bold;");
        return { success: true };

    } catch (e) {
        console.error("🚨 FALLO_PERSISTENCIA_USUARIO:", e.message);
        throw e;
    }
}
