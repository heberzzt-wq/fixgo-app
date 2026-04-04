// ==========================================
// 🛡️ GESTIA CORE: AUDIT ENGINE V5.55 (SENTINEL RADAR)
// ==========================================
// Pipeline de auditoría forense y seguridad activa.
// REGLA 1: CÓDIGO COMPLETO SIN RECORTES.
// ACTUALIZACIÓN: Sincronización con Self-Repair Sentinel V1.2.

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

    /**
     * 🛡️ 1. EXTRACCIÓN MULTICAPA DE IDENTIDAD (Sincronizado con Sentinel)
     * Buscamos el ID en la raíz, en .json o en .data para evitar falsos undefined.
     */
    const idExtraido = data.modulo_id || (data.json && data.json.modulo_id) || (data.data && data.data.modulo_id);

    /**
     * 🛡️ 2. VALIDACIÓN DE IDENTIDAD (LEY V5.55 - ZERO MUTATION)
     */
    const isValidId = (id) => {
        const regex = /^[a-z0-9]+(?:_[a-z0-9]+)*$/i;
        return (
            typeof id === "string" &&
            id !== "modulo_id" && 
            id !== "undefined" &&
            id.length >= 3 && 
            id.length <= 50 &&
            regex.test(id)
        );
    };

    if (!isValidId(idExtraido)) {
        // Reportamos el valor recibido para debug forense en la Terminal
        const valorVisual = idExtraido || "ABSENTE/UNDEFINED";
        throw new Error(`FALLO_V5_55_AUDIT: ID_CORRUPTO_RECHAZADO [${valorVisual}]`);
    }

    // 3. Control de Peso y Seguridad (Sobre el contenido real)
    // Validamos tanto la raíz como el objeto interno si existe
    const contenidoHTML = data.html || (data.json && data.json.html) || (data.data && data.data.html) || "";
    
    validarPesoCampos(data.json || data.data || data);
    validarSeguridadCodigo(contenidoHTML);

    // 4. Normalización y Hash ADN
    // Pasamos el ID extraído al objeto final para asegurar consistencia
    const normalizado = normalizar(data);
    if (!normalizado.modulo_id) normalizado.modulo_id = idExtraido;

    const hashADN = await generarHash(JSON.stringify(normalizado));

    // 5. Check de Redundancia Local
    if (hashLocalAnterior === hashADN) {
        throw new Error("OPERACION_REDUNDANTE: El código generado es idéntico al actual.");
    }

    // 6. Check Histórico Global (Core History)
    const existeGlobal = await existeEnHistorial(hashADN);
    
    console.log(`✅ [AUDIT]: Aduana superada para [${idExtraido}].`);

    return { 
        data: normalizado, 
        hash: hashADN,
        esReversion: existeGlobal,
        modulo_id: idExtraido 
    };
}