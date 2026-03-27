// ==========================================
// 🛡️ GESTIA CORE: AUDIT ENGINE V1.0
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
 * PIPELINE MAESTRO DE AUDITORÍA:
 * El filtro final antes de la persistencia.
 */
export async function ejecutarAuditoriaCore(data, hashLocalAnterior, utils) {
    const { generarHash, normalizar } = utils;

    // 1. Validación de Identidad (ID Snake Case)
    if (!data.modulo_id || !/^[a-z0-9_-]+$/.test(data.modulo_id)) {
        throw new Error("ID_CORRUPTO: El modulo_id debe ser alfanumérico con guiones bajos.");
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
