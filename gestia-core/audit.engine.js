/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - AUDIT ENGINE V6.1 (SIA7 - BLINDADO)
 * ======================================================================================
 * Ubicación: ./gestia-core/audit.engine.js
 * Objetivo: Aduana de seguridad con discriminación de riesgo y timeline granular.
 * ======================================================================================
 */

import { existeEnHistorial } from '/gestia-core/history.engine.js';

// 🛡️ REGLAS DE SEGURIDAD (Discriminación de Riesgo)
const SECURITY_RULES = {
    CRITICAL: ["<script", "document.cookie", "eval(", "Object.defineProperty"], // Bloqueo Total
    WARNING: ["fetch(", "localStorage", "sessionStorage", ".innerHTML", "XMLHttpRequest"], // Alerta HUD
    LIMITS: {
        modulo_id: 50,
        html: 50000,
        javascript: 30000,
        css: 20000
    }
};

/**
 * emitirPulsoJarvis: Notifica al HUD sin secuestrar el estado global (Fix 1)
 */
function emitirPulsoJarvis(step, status = "INFO", details = "") {
    window.dispatchEvent(new CustomEvent('gestia-terminal-state', {
        detail: {
            state: null, // 🔒 Soberanía del Kernel: No forzamos ANALYZE
            step: `AUDIT_${step}: ${status}`,
            details: details
        }
    }));
}

/**
 * VALIDACIÓN DE SEGURIDAD ACTIVA (Fix 2: Inteligencia Selectiva)
 */
export function validarSeguridadCodigo(html) {
    if (!html) return true;
    const lower = html.toLowerCase();

    // 1. Bloqueo Crítico (Hard Stop)
    for (let rule of SECURITY_RULES.CRITICAL) {
        if (lower.includes(rule)) {
            const errorMsg = `CRITICAL_SECURITY_VIOLATION: [${rule}] detectado.`;
            window.dispatchEvent(new CustomEvent('gestia-execution-error', {
                detail: { error: errorMsg }
            }));
            throw new Error(errorMsg);
        }
    }

    // 2. Advertencia (Warning HUD)
    for (let rule of SECURITY_RULES.WARNING) {
        if (lower.includes(rule)) {
            emitirPulsoJarvis("SECURITY", "WARNING", `Secuencia sospechosa: ${rule}`);
            console.warn(`[AUDIT_WARN]: Detectada secuencia no recomendada: ${rule}`);
        }
    }

    emitirPulsoJarvis("SECURITY", "CLEAN");
    return true;
}

/**
 * CONTROL DE PESO (Fix 3: Guardas de seguridad)
 */
export function validarPesoCampos(json) {
    if (!json || typeof json !== "object") return; // 🛡️ Evita crash si es null

    Object.keys(SECURITY_RULES.LIMITS).forEach(key => {
        if (json[key] && json[key].length > SECURITY_RULES.LIMITS[key]) {
            const errorMsg = `BLOAT_LIMIT_EXCEEDED: [${key}]`;
            window.dispatchEvent(new CustomEvent('gestia-execution-error', {
                detail: { error: errorMsg }
            }));
            throw new Error(errorMsg);
        }
    });
    emitirPulsoJarvis("BLOAT", "OPTIMIZED");
}

/**
 * PIPELINE MAESTRO DE AUDITORÍA V6.1
 */
export async function ejecutarAuditoriaCore(data, hashLocalAnterior, utils) {
    const { generarHash, normalizar } = utils;

    // 🧬 Alimentar Timeline Visual (Fix 4)
    window.dispatchEvent(new CustomEvent('gestia-audit-log', {
        detail: { fase: "audit", status: "processing", timestamp: new Date().toISOString() }
    }));

    emitirPulsoJarvis("START", "SCANNING_DNA");

    // 1. Extracción e Identidad
    const idExtraido = data.modulo_id || (data.json && data.json.modulo_id) || (data.data && data.data.modulo_id);

    const isValidId = (id) => {
        const regex = /^[a-z0-9]+(?:_[a-z0-9]+)*$/i;
        return (typeof id === "string" && id.length >= 3 && id.length <= 50 && regex.test(id));
    };

    if (!isValidId(idExtraido)) {
        throw new Error(`FALLO_AUDIT: ID_INVALIDO [${idExtraido || "NULL"}]`);
    }

    emitirPulsoJarvis("IDENTITY", "VERIFIED", idExtraido);

    // 2. Seguridad y Peso
    const contenidoHTML = data.html || (data.json && data.json.html) || (data.data && data.data.html) || "";
    validarPesoCampos(data.json || data.data || data);
    validarSeguridadCodigo(contenidoHTML);

    // 3. Normalización y Hash
    const normalizado = normalizar(data);
    if (!normalizado.modulo_id) normalizado.modulo_id = idExtraido;
    const hashADN = await generarHash(JSON.stringify(normalizado));

    // 4. Check de Redundancia
    if (hashLocalAnterior === hashADN) {
        emitirPulsoJarvis("REDUNDANCY", "STOP");
        throw new Error("OPERACION_REDUNDANTE: No hay cambios detectados.");
    }

    // 5. Check Histórico
    const existeGlobal = await existeEnHistorial(hashADN);
    
    emitirPulsoJarvis("SUCCESS", "PASSED", idExtraido);
    
    return { 
        data: normalizado, 
        hash: hashADN,
        esReversion: existeGlobal,
        modulo_id: idExtraido 
    };
}