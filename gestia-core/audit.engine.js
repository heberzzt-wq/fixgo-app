/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - AUDIT ENGINE V6.2 (SIA7 - BLINDADO V4)
 * ======================================================================================
 */
import { existeEnHistorial } from './history.engine.js'; // 🔥 FIX: Ruta relativa corregida
import { JarvisMemory }
from "./jarvis/jarvis.memory.js"; // 🔥 FIX: Para reporte de violaciones

const SECURITY_RULES = {
    CRITICAL: ["<script", "document.cookie", "eval(", "Object.defineProperty"],
    WARNING: ["fetch(", "localStorage", "sessionStorage", ".innerHTML", "XMLHttpRequest"],
    LIMITS: { modulo_id: 50, html: 50000, javascript: 30000, css: 20000 }
};

function emitirPulsoJarvis(step, status = "INFO", details = "") {
    window.dispatchEvent(new CustomEvent('gestia-terminal-state', {
        detail: {
            state: null,
            step: `AUDIT_${step}: ${status}`,
            details: details
        }
    }));
}

export function validarSeguridadCodigo(html) {
    if (!html) return true;
    const lower = html.toLowerCase();

    for (let rule of SECURITY_RULES.CRITICAL) {
        if (lower.includes(rule)) {
            const errorMsg = `CRITICAL_SECURITY_VIOLATION: [${rule}] detectado.`;
            
            // Reportar al Kernel para que Jarvis sepa quién intentó romper el búnker
            JarvisMemory.dispatch({
                type: 'PUSH_HISTORY',
                payload: { role: 'assistant', message: `🚨 INTENTO DE HACKEO DETECTADO: ${rule}` }
            });

            window.dispatchEvent(new CustomEvent('gestia-execution-error', {
                detail: { error: errorMsg }
            }));
            throw new Error(errorMsg);
        }
    }

    for (let rule of SECURITY_RULES.WARNING) {
        if (lower.includes(rule)) {
            emitirPulsoJarvis("SECURITY", "WARNING", `Secuencia sospechosa: ${rule}`);
        }
    }

    emitirPulsoJarvis("SECURITY", "CLEAN");
    return true;
}

export function validarPesoCampos(json) {
    if (!json || typeof json !== "object") return;

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

export async function ejecutarAuditoriaCore(data, hashLocalAnterior, utils) {
    const { generarHash, normalizar } = utils;

    window.dispatchEvent(new CustomEvent('gestia-audit-log', {
        detail: { fase: "audit", status: "processing", timestamp: new Date().toISOString() }
    }));

    emitirPulsoJarvis("START", "SCANNING_DNA");

    const idExtraido = data.modulo_id || (data.json && data.json.modulo_id) || (data.data && data.data.modulo_id);

    const isValidId = (id) => {
        const regex = /^[a-z0-9]+(?:_[a-z0-9]+)*$/i;
        return (typeof id === "string" && id.length >= 3 && id.length <= 50 && regex.test(id));
    };

    if (!isValidId(idExtraido)) {
        throw new Error(`FALLO_AUDIT: ID_INVALIDO [${idExtraido || "NULL"}]`);
    }

    emitirPulsoJarvis("IDENTITY", "VERIFIED", idExtraido);

    const contenidoHTML = data.html || (data.json && data.json.html) || (data.data && data.data.html) || "";
    validarPesoCampos(data.json || data.data || data);
    validarSeguridadCodigo(contenidoHTML);

    const normalizado = normalizar(data);
    if (!normalizado.modulo_id) normalizado.modulo_id = idExtraido;
    const hashADN = await generarHash(JSON.stringify(normalizado));

    if (hashLocalAnterior === hashADN) {
        emitirPulsoJarvis("REDUNDANCY", "STOP");
        throw new Error("OPERACION_REDUNDANTE: No hay cambios detectados.");
    }

    // 🛡️ USA EL ALIAS CREADO EN HISTORY V2.1
    const existeGlobal = await existeEnHistorial(hashADN);
    
    emitirPulsoJarvis("SUCCESS", "PASSED", idExtraido);
    
    return { 
        data: normalizado, 
        hash: hashADN,
        esReversion: existeGlobal,
        modulo_id: idExtraido 
    };
}

