/**
 * ======================================================================================
 * GESTIA FIREWALL ENGINE V5.28 (INFINITY CORE)
 * ======================================================================================
 * Basado en V1.0 de Heberto. 
 * Evolución: Atomicidad mediante runTransaction para evitar Race Conditions.
 * ======================================================================================
 */

import { db } from '../firebase.js';
import { 
    doc, 
    runTransaction, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// CONFIGURACIÓN LOCAL (Tu Configuración Original)
// ==========================================
const FIREWALL_CONFIG = {
    RATE_LIMIT: {
        MAX_REQUESTS_PER_MIN: 5,
        MAX_REQUESTS_PER_HOUR: 50
    },
    COST_CONTROL: {
        MAX_TOKENS_PER_OP: 1500,
        MAX_TOKENS_PER_DAY: 20000
    },
    ABUSE: {
        MAX_ERRORS: 5,
        BLOCK_TIME_MS: 15 * 60 * 1000 // 15 minutos
    }
};

/**
 * ⚡ EJECUTAR FIREWALL GLOBAL (ATÓMICO)
 * El Cadenero ahora es un Ninja que ve el tiempo en milisegundos.
 */
export async function ejecutarFirewallGlobal({ userId, tenantId, input }) {
    const ahora = Date.now();
    const ref = doc(db, "gestia_firewall", `${tenantId}_${userId}`);

    try {
        return await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(ref);
            let data;

            if (!snap.exists()) {
                data = {
                    requests_min: 0,
                    requests_hour: 0,
                    tokens_used: 0,
                    errores: 0,
                    bloqueado_hasta: 0,
                    last_min_reset: ahora,
                    last_hour_reset: ahora,
                    last_day_reset: ahora
                };
            } else {
                data = snap.data();
            }

            // 1. BLOQUEO ACTIVO
            if (data.bloqueado_hasta && ahora < data.bloqueado_hasta) {
                throw new Error("FIREWALL_BLOCKED: Acceso denegado por conducta hostil.");
            }

            // 2. RESET DE CONTADORES (Lógica Heberto V1.0)
            if (ahora - data.last_min_reset > 60000) {
                data.requests_min = 0;
                data.last_min_reset = ahora;
            }
            if (ahora - data.last_hour_reset > 3600000) {
                data.requests_hour = 0;
                data.last_hour_reset = ahora;
            }
            if (ahora - data.last_day_reset > 86400000) {
                data.tokens_used = 0;
                data.last_day_reset = ahora;
            }

            // 3. VALIDACIÓN DE LÍMITES
            if (data.requests_min >= FIREWALL_CONFIG.RATE_LIMIT.MAX_REQUESTS_PER_MIN) {
                throw new Error("RATE_LIMIT_MIN: Demasiadas solicitudes/min.");
            }
            if (data.requests_hour >= FIREWALL_CONFIG.RATE_LIMIT.MAX_REQUESTS_PER_HOUR) {
                throw new Error("RATE_LIMIT_HOUR: Demasiadas solicitudes/hora.");
            }

            // 4. COSTO IA (Estimación Heberto V1.0)
            const tokensEstimados = Math.min(input.length / 4, FIREWALL_CONFIG.COST_CONTROL.MAX_TOKENS_PER_OP);
            if ((data.tokens_used + tokensEstimados) > FIREWALL_CONFIG.COST_CONTROL.MAX_TOKENS_PER_DAY) {
                throw new Error("COST_LIMIT_EXCEEDED: Cuota de IA agotada por hoy.");
            }

            // 5. ACTUALIZACIÓN EN UN SOLO GOLPE ATÓMICO
            transaction.set(ref, {
                ...data,
                requests_min: data.requests_min + 1,
                requests_hour: data.requests_hour + 1,
                tokens_used: data.tokens_used + tokensEstimados,
                last_seen: serverTimestamp()
            }, { merge: true });

            return true;
        });
    } catch (e) {
        // Si el error no es de lógica, es sistémico
        console.error("🚨 [Firewall] Denegado:", e.message);
        throw e;
    }
}

/**
 * ⚠️ REGISTRO DE ERRORES (ANTI-ABUSO)
 * Actualizado para usar merge atómico.
 */
export async function registrarErrorFirewall(userId, tenantId) {
    const ref = doc(db, "gestia_firewall", `${tenantId}_${userId}`);
    
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(ref);
            if (!snap.exists()) return;

            const data = snap.data();
            const nuevosErrores = (data.errores || 0) + 1;
            let update = { errores: nuevosErrores, last_error: serverTimestamp() };

            if (nuevosErrores >= FIREWALL_CONFIG.ABUSE.MAX_ERRORS) {
                update.bloqueado_hasta = Date.now() + FIREWALL_CONFIG.ABUSE.BLOCK_TIME_MS;
                update.errores = 0;
            }

            transaction.update(ref, update);
        });
    } catch (e) {
        console.error("🚨 [Firewall] Fallo al registrar error:", e.message);
    }
}
