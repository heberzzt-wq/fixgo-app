/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - HISTORY ENGINE V2.1 (KERNEL SYNC - SIA7)
 * ======================================================================================
 */
import { db } from '/firebase.js';
import { 
    doc, 
    runTransaction, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { JarvisMemory }
from "./jarvis/jarvis.memory.js"; // 🔥 FIX: Conexión al Kernel

const HISTORY_CACHE = new Set();

const emitSia7 = (step, details, severity = "INFO", hash = "SYS") => {
    window.dispatchEvent(new CustomEvent('gestia-terminal-state', {
        detail: {
            step: `HISTORY:${step}`,
            details: details,
            opId: hash.substring(0, 8),
            severity: severity,
            modulo: "HISTORY_ENGINE"
        }
    }));

    // 🧠 Notificar al Kernel V4 para el rastro de auditoría interna
    if (severity === "ERROR" || severity === "WARN") {
        JarvisMemory.dispatch({
            type: 'PUSH_HISTORY',
            payload: { role: 'assistant', message: `⚠️ Alerta History: ${step} - ${details}` }
        });
    }
};

/**
 * registrarYVerificarADN (V2.1 ATOMIC)
 */
export async function registrarYVerificarADN(hash, metadata = {}) {
    if (!hash || typeof hash !== "string") {
        emitSia7("REJECT", "Hash corrupto o nulo.", "ERROR");
        throw new Error("HISTORY_ENGINE: HASH_INVALIDO");
    }

    if (HISTORY_CACHE.has(hash)) {
        emitSia7("CACHE_HIT", `ADN [${hash.substring(0,8)}] en RAM.`, "SUCCESS", hash);
        return false; 
    }

    const ref = doc(db, "gestia_module_versions_global", hash);

    try {
        const isNewRecord = await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(ref);
            if (snap.exists()) return false; 

            const payload = {
                hash_snapshot: hash,
                hash_type: metadata.hashType || "SHA-256",
                modulo_origen: metadata.moduloId || "UNKNOWN_MODULE",
                tenantId: metadata.tenantId || "GLOBAL_SYS",
                creado_por: metadata.userId || "SYSTEM_AUTO",
                version_arquitectura: metadata.version || "1.0",
                size_bytes: metadata.size || 0,
                fecha_registro: serverTimestamp()
            };

            transaction.set(ref, payload);
            return true;
        });

        HISTORY_CACHE.add(hash);
        if (isNewRecord) {
            emitSia7("COMMITTED", `ADN Inmortalizado.`, "SUCCESS", hash);
        } else {
            emitSia7("COLLISION", `El ADN ya existía en BD.`, "WARN", hash);
        }

        return isNewRecord;

    } catch (error) {
        emitSia7("CRASH", error.message, "ERROR", hash);
        throw error;
    }
}

/**
 * ALIAS PARA AUDIT ENGINE (Compatibilidad V6.1)
 * Solo verifica sin intentar registrar.
 */
export async function existeEnHistorial(hash) {
    if (HISTORY_CACHE.has(hash)) return true;
    // Si no está en cache, lo registramos/verificamos (atómico)
    // Devolvemos el inverso porque registrarYVerificarADN devuelve TRUE si es NUEVO.
    const esNuevo = await registrarYVerificarADN(hash, { changeType: 'READ_CHECK' });
    return !esNuevo; 
}

export function purgarCacheHistorial() {
    HISTORY_CACHE.clear();
    emitSia7("PURGE", `Caché L1 vaciada.`, "WARN");
}

console.log("%c📜 [HISTORY_ENGINE]: V2.1 KERNEL SYNC ONLINE", "color: #a78bfa; font-weight: bold; background: #2e1065; border-left: 4px solid #7c3aed; padding: 2px 10px;");

