// ==========================================
// 🔐 GESTIA CORE: AUTH & TENANT MANAGER V2.0
// ==========================================
// Este módulo maneja la autoridad y el contexto multi-tenant.
// Actualizado con el Motor Self-Healing (Tenant Resolver V2)

import { auth, db } from '../firebase.js'; // Ajusta la ruta a tu archivo firebase.js
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { resolveTenantV2 } from './core_tenant_resolver_v2.js'; // 👈 INYECCIÓN DEL MOTOR DEL ABUELO

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
                // 🛡️ BYPASS SUPREMO: Nivel Dios para el Arquitecto
                if (user.email === "hebertoh-m@hotmail.com") {
                    console.log("🚀 [GOD MODE] Identidad Maestra detectada. Derribando compuertas...");
                    
                    // 💡 FIX ABUELO: Normalizamos tu tenant maestro a "uxmal39" en minúsculas.
                    // allowCreate: true permite que el Auto-Sanador cree el documento si no existía.
                    const tenantGod = await resolveTenantV2("uxmal39", { allowCreate: true });

                    const GOD_SESSION = {
                        authorized: true,
                        uid: user.uid,
                        tenantId: tenantGod.id, // Ya normalizado en minúsculas estrictas
                        role: "arquitecto_supremo",
                        limits: {
                            maxReads: 99999,
                            maxTokens: 99999
                        },
                        timestamp: now
                    };
                    
                    SESSION_CACHE = GOD_SESSION;
                    CACHE_TIME = now;
                    window.CURRENT_TENANT_ID = tenantGod.id; // Puente global para que el Firewall no truene
                    
                    return resolve(GOD_SESSION);
                }

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

                // 💡 FIX ABUELO: Pasamos el Tenant "sucio" de la DB por el Auto-Sanador
                const tenantResuelto = await resolveTenantV2(userData.tenantId, { allowCreate: false });

                // CREAMOS EL OBJETO DE SESIÓN (La verdad del sistema)
                const SESSION = {
                    authorized: true,
                    uid: user.uid,
                    tenantId: tenantResuelto.id, // El ID limpio, en minúsculas y verificado en BD
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
                window.CURRENT_TENANT_ID = tenantResuelto.id; // Puente global

                console.log(`🛡️ [Auth] Contexto cargado para Tenant: ${SESSION.tenantId}`);
                resolve(SESSION);

            } catch (err) {
                // 💥 DESTRUCCIÓN DE CACHÉ CORRUPTA
                // Si el error tiene que ver con el Tenant, matamos la memoria fantasma
                if (err.message.includes("TENANT")) {
                    SESSION_CACHE = null;
                }
                
                console.error("🚨 [Auth] Error resolviendo autoridad:", err.message);
                reject({
                    authorized: false,
                    error: err.message
                });
            }
        });
    });
}
