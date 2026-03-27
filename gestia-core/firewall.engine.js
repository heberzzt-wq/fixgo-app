/**
 * ======================================================================================
 * GESTIA FIREWALL ENGINE V1.0 (FRONTEND LIGERO)
 * Control de abuso, rate limit y costos (nivel interfaz)
 * ======================================================================================
 */

import { db } from '../firebase.js';
import { 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    increment, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// CONFIGURACIÓN LOCAL
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

// ==========================================
// FUNCIÓN PRINCIPAL (El Cadenero de la Interfaz)
// ==========================================
export async function ejecutarFirewallGlobal({
    userId,
    tenantId,
    input
}) {
    const ahora = Date.now();

    const ref = doc(db, "gestia_firewall", `${tenantId}_${userId}`);
    const snap = await getDoc(ref);

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

        await setDoc(ref, data);
    } else {
        data = snap.data();
    }

    // 1. BLOQUEO ACTIVO
    if (data.bloqueado_hasta && ahora < data.bloqueado_hasta) {
        throw new Error("FIREWALL_BLOCKED: Usuario temporalmente bloqueado por abuso.");
    }

    // 2. RESET DE CONTADORES
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

    // 3. RATE LIMIT
    if (data.requests_min >= FIREWALL_CONFIG.RATE_LIMIT.MAX_REQUESTS_PER_MIN) {
        throw new Error("RATE_LIMIT_MIN: Demasiadas solicitudes por minuto.");
    }

    if (data.requests_hour >= FIREWALL_CONFIG.RATE_LIMIT.MAX_REQUESTS_PER_HOUR) {
        throw new Error("RATE_LIMIT_HOUR: Demasiadas solicitudes por hora.");
    }

    // 4. COSTO IA (estimación básica)
    const tokensEstimados = Math.min(input.length / 4, FIREWALL_CONFIG.COST_CONTROL.MAX_TOKENS_PER_OP);

    if ((data.tokens_used + tokensEstimados) > FIREWALL_CONFIG.COST_CONTROL.MAX_TOKENS_PER_DAY) {
        throw new Error("COST_LIMIT_EXCEEDED: Límite diario de IA alcanzado.");
    }

    // 5. ACTUALIZACIÓN DE USO
    await updateDoc(ref, {
        requests_min: increment(1),
        requests_hour: increment(1),
        tokens_used: increment(tokensEstimados),
        last_seen: serverTimestamp()
    });

    return true;
}

// ==========================================
// REGISTRO DE ERRORES (ANTI-ABUSO LOCAL)
// ==========================================
export async function registrarErrorFirewall(userId, tenantId) {
    try {
        const ref = doc(db, "gestia_firewall", `${tenantId}_${userId}`);
        const snap = await getDoc(ref);

        if (!snap.exists()) return;

        const data = snap.data();
        const errores = (data.errores || 0) + 1;

        let update = {
            errores,
            last_error: serverTimestamp()
        };

        // Activar bloqueo automático
        if (errores >= FIREWALL_CONFIG.ABUSE.MAX_ERRORS) {
            update.bloqueado_hasta = Date.now() + FIREWALL_CONFIG.ABUSE.BLOCK_TIME_MS;
            update.errores = 0; // reset
        }

        await updateDoc(ref, update);
        console.log(`⚠️ [Firewall UX] Error registrado para usuario ${userId}. Total errores: ${errores}`);
    } catch (e) {
        console.error("🚨 [Firewall UX] Falla crítica al registrar error de abuso:", e);
    }
}
