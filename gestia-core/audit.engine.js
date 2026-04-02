// ==========================================
// 🛡️ GESTIA CORE: AUDIT ENGINE V5.55 (SENTINEL RADAR)
// ==========================================
// Pipeline de auditoría forense y seguridad activa.

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
 */
export async function ejecutarAuditoriaCore(data, hashLocalAnterior, utils) {
    const { generarHash, normalizar } = utils;

    // 🛡️ 1. Validación de Identidad (LEY V5.55 - ZERO MUTATION)
    // Aplicamos la aduana estricta de la Terminal (Cadenero V5.55)
    const isValidId = (id) => {
        const regex = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
        return (
            typeof id === "string" &&
            id.length >= 3 && 
            id.length <= 50 &&
            regex.test(id)
        );
    };

    if (!isValidId(data.modulo_id)) {
        throw new Error(`FALLO_V5_55_AUDIT: ID_CORRUPTO_RECHAZADO [${data.modulo_id || "undefined"}]`);
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