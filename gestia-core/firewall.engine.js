/**
 * ======================================================================================
 * GESTIA FIREWALL ENGINE V7.1 (INFINITY CORE - MULTIMODAL READY)
 * ======================================================================================
 * Basado en V5.28 de Heberto Mendoza. 
 * Evolución: Soporte para payloads multimodales y validación de tokens inteligente.
 * REGLA 1: Código completo. Sin compactar.
 * ======================================================================================
 */

import { db } from '../firebase.js';
import { 
    doc, 
    runTransaction, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// CONFIGURACIÓN DE SEGURIDAD Y COSTOS
// ==========================================
const FIREWALL_CONFIG = {
    RATE_LIMIT: {
        MAX_REQUESTS_PER_MIN: 5,
        MAX_REQUESTS_PER_HOUR: 50
    },
    COST_CONTROL: {
        MAX_TOKENS_PER_OP: 1500,
        MAX_TOKENS_PER_DAY: 20000,
        MULTIMODAL_FLAT_COST: 500 // Costo base para imágenes/archivos
    },
    ABUSE: {
        MAX_ERRORS: 5,
        BLOCK_TIME_MS: 15 * 60 * 1000 // 15 minutos
    }
};

/**
 * ⚡ EJECUTAR FIREWALL GLOBAL (ATÓMICO)
 * Recibe el input (texto o payload) y el authToken de la sesión.
 */
export async function ejecutarFirewallGlobal({ userId, tenantId, input, authToken }) {
    const ahora = Date.now();
    const ref = doc(db, "gestia_firewall", `${tenantId}_${userId}`);

    // Nota: El authToken se recibe para futuras validaciones de backend (JWT Verify)
    // Por ahora, el Kernel lo envía para mantener la consistencia de autoridad.

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

            // 1. VERIFICACIÓN DE BLOQUEO ACTIVO
            if (data.bloqueado_hasta && ahora < data.bloqueado_hasta) {
                const minutosRestantes = Math.ceil((data.bloqueado_hasta - ahora) / 60000);
                throw new Error(`FIREWALL_BLOCKED: Conducta hostil detectada. Intenta en ${minutosRestantes} min.`);
            }

            // 2. RESET DE CONTADORES POR TIEMPO
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

            // 3. VALIDACIÓN DE LÍMITES OPERATIVOS
            if (data.requests_min >= FIREWALL_CONFIG.RATE_LIMIT.MAX_REQUESTS_PER_MIN) {
                throw new Error("RATE_LIMIT_MIN: Calma, Ingeniero. Demasiadas solicitudes por minuto.");
            }
            if (data.requests_hour >= FIREWALL_CONFIG.RATE_LIMIT.MAX_REQUESTS_PER_HOUR) {
                throw new Error("RATE_LIMIT_HOUR: Cuota horaria alcanzada. Toma un café y vuelve en una hora.");
            }

            // 4. ESTIMACIÓN DE COSTO IA (Lógica Multimodal V7.1)
            let tokensEstimados;
            
            if (typeof input === 'string') {
                // Cálculo estándar para texto
                tokensEstimados = Math.min(input.length / 4, FIREWALL_CONFIG.COST_CONTROL.MAX_TOKENS_PER_OP);
            } else {
                // Si es un payload de archivo/imagen, aplicamos tarifa plana
                tokensEstimados = FIREWALL_CONFIG.COST_CONTROL.MULTIMODAL_FLAT_COST;
            }

           if ((data.tokens_used + tokensEstimados) > FIREWALL_CONFIG.COST_CONTROL.MAX_TOKENS_PER_DAY) {
    throw new Error("COST_LIMIT_EXCEEDED: Presupuesto de IA agotado para este búnker hoy.");
}

            // 5. ACTUALIZACIÓN ATÓMICA Y PERSISTENCIA
            transaction.set(ref, {
                ...data,
                requests_min: data.requests_min + 1,
                requests_hour: data.requests_hour + 1,
                tokens_used: data.tokens_used + tokensEstimados,
                last_seen: serverTimestamp(),
                last_auth_check: authToken ? "valid_token_present" : "no_token"
            }, { merge: true });

            return true;
        });
    } catch (e) {
        console.error("%c🚨 [FIREWALL_DENIED]:", "color: #ef4444; font-weight: bold;", e.message);
        throw e;
    }
}

/**
 * ⚠️ REGISTRO DE ERRORES (CONTRA-INTELIGENCIA)
 * Castiga el abuso de errores sistémicos bloqueando el acceso temporalmente.
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
                update.errores = 0; // Reset tras el baneo para el siguiente ciclo
            }

            transaction.update(ref, update);
        });
    } catch (e) {
        console.error("🚨 [Firewall] Error al registrar penalización:", e.message);
    }
}