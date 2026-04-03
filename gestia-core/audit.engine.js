// ==========================================
// 🛡️ GESTIA CORE: AUDIT ENGINE V5.55 (SENTINEL RADAR)
// ==========================================
// Pipeline de auditoría forense y seguridad activa.
// REGLA 1: CÓDIGO COMPLETO SIN RECORTES.

import { existeEnHistorial } from './history.engine.js';

// Configuración de Seguridad (Criterios del Búnker)
const SECURITY_RULES = {
    BLACKLIST: ["<script", "eval(", "fetch(", "localStorage", "sessionStorage", "document.cookie", ".innerHTML"],
    LIMITS: {
        modulo_id: 50,
        html: 50000,
        javascript: 30000,
        css: 20000
    }
};

/**
 * VALIDACIÓN DE SEGURIDAD ACTIVA:
 * Detecta secuencias de código prohibidas (Anti-XSS / Anti-Exfiltración).
 */
export function validarSeguridadCodigo(html) {
    const lower = html.toLowerCase();
    for (let rule of SECURITY_RULES.BLACKLIST) {
        if (lower.includes(rule)) {
            throw new Error(`SEGURIDAD_CRITICA: Secuencia prohibida detectada: [${rule}]`);
        }
    }
    return true;
}

/**
 * CONTROL DE PESO (ANTI-BLOAT):
 * Evita que la IA genere módulos que saturen el almacenamiento.
 */
export function validarPesoCampos(json) {
    Object.keys(SECURITY_RULES.LIMITS).forEach(key => {
        if (json[key] && json[key].length > SECURITY_RULES.LIMITS[key]) {
            throw new Error(`BLOAT_DETECTADO: El campo [${key}] excede el límite físico.`);
        }
    });
}

/**
 * PIPELINE MAESTRO DE AUDITORÍA (V5.55 HARDENED):
 * El filtro final antes de la persistencia.
 * ACTUALIZACIÓN V5.55: Bloqueo de Literales Corruptos (Anti-Literal Leak).
 */
export async function ejecutarAuditoriaCore(data, hashLocalAnterior, utils) {
    const { generarHash, normalizar } = utils;

    /**
     * 🛡️ 1. VALIDACIÓN DE IDENTIDAD (LEY V5.55 - ZERO MUTATION)
     * Aduana estricta: No permite el string "modulo_id" como valor.
     */
    const isValidId = (id) => {
        const regex = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
        return (
            typeof id === "string" &&
            id !== "modulo_id" && // 🔥 FIX: Bloqueo de fuga de literal del frontend
            id.length >= 3 && 
            id.length <= 50 &&
            regex.test(id)
        );
    };

    if (!isValidId(data.modulo_id)) {
        // Reportamos el valor recibido para debug forense en la Terminal
        const valorRecibido = data.modulo_id || "undefined";
        throw new Error(`FALLO_V5_55_AUDIT: ID_CORRUPTO_RECHAZADO [${valorRecibido}]`);
    }

    // 2. Control de Peso y Seguridad
    validarPesoCampos(data);
    validarSeguridadCodigo(data.html || "");

    // 3. Normalización y Hash ADN
    const normalizado = normalizar(data);
    const hashADN = await generarHash(JSON.stringify(normalizado));

    // 4. Check de Redundancia Local
    if (hashLocalAnterior === hashADN) {
        throw new Error("OPERACION_REDUNDANTE: El código generado es idéntico al actual.");
    }

    // 5. Check Histórico Global (Core History)
    const existeGlobal = await existeEnHistorial(hashADN);
    
    return { 
        data: normalizado, 
        hash: hashADN,
        esReversion: existeGlobal 
    };
}