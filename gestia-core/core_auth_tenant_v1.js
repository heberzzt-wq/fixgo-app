// ==========================================
// 🔐 GESTIA CORE: AUTH & TENANT MANAGER V1.0
// ==========================================
// Este módulo maneja la autoridad y el contexto multi-tenant.

import { auth, db } from '../firebase.js'; // Ajusta la ruta a tu archivo firebase.js
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let SESSION_CACHE = null;
let CACHE_TIME = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos de vida para el caché (Ahorro de lecturas 💰)

/**
 * Resuelve el contexto del cliente (Tenant) y sus permisos.
 * Es la puerta de entrada para cualquier operación en la Terminal.
 */
export async function resolveTenantContext() {
    const now = Date.now();

    // 🧠 MODO TACAÑO: Si ya tenemos la sesión y no han pasado 5 min, no leemos la DB
    if (SESSION_CACHE && (now - CACHE_TIME) < CACHE_TTL) {
        console.log("⚡ [Auth] Usando sesión en caché (Lecturas DB ahorradas)");
        return SESSION_CACHE;
    }

    return new Promise((resolve, reject) => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            unsubscribe(); // Detenemos el listener para que no se quede colgado

            if (!user) {
                return reject({
                    authorized: false,
                    error: "NO_AUTH_ACTIVE"
                });
            }

            try {
                // Buscamos el perfil del usuario para saber a qué Tenant pertenece
                const userRef = doc(db, "gestia_users", user.uid);
                const userSnap = await getDoc(userRef);

                if (!userSnap.exists()) {
                    throw new Error("USUARIO_NO_REGISTRADO_EN_SISTEMA");
                }

                const userData = userSnap.data();

                if (!userData.tenantId) {
                    throw new Error("EL_USUARIO_NO_TIENE_TENANT_ASIGNADO");
                }

                // CREAMOS EL OBJETO DE SESIÓN (La verdad del sistema)
                const SESSION = {
                    authorized: true,
                    uid: user.uid,
                    tenantId: userData.tenantId,
                    role: userData.rol || "user",
                    
                    // Límites base para el modo tacaño
                    limits: {
                        maxReads: 15,
                        maxTokens: 1500
                    },
                    
                    timestamp: now
                };

                // Guardamos en caché local
                SESSION_CACHE = SESSION;
                CACHE_TIME = now;

                console.log(`🛡️ [Auth] Contexto cargado para Tenant: ${SESSION.tenantId}`);
                resolve(SESSION);

            } catch (err) {
                console.error("🚨 [Auth] Error resolviendo autoridad:", err.message);
                reject({
                    authorized: false,
                    error: err.message
                });
            }
        });
    });
}
