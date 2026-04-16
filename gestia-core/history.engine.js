/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - HISTORY ENGINE V2.0 (THE IMMUTABLE LEDGER)
 * ======================================================================================
 * Identidad: Registro Inmutable de Trazabilidad y ADN del Sistema.
 * Función: Gestiona el historial global y previene colisiones atómicas de Hashes.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * --------------------------------------------------------------------------------------
 * INGENIERÍA DE GRADO EMPRESARIAL (V2.0):
 * 1. IN-MEMORY CACHE (MODO TACAÑO): Set local para evitar consultas repetidas a 
 * Firestore. Si el hash ya se validó en esta sesión, cuesta 0 tokens verificarlo.
 * 2. ATOMIC RACE-CONDITION SHIELD: Eliminado el antipatrón (Check -> Insert). Ahora
 * se usa runTransaction para que lectura y escritura sean indisolubles.
 * 3. INTEGRITY METADATA: Se guarda el tamaño, versión y tipo de hash para auditorías 
 * forenses avanzadas, no solo los IDs de origen.
 * 4. SIA7 TELEMETRY: Inyección de pulsos visuales al HUD del Arquitecto.
 * ======================================================================================
 */

import { db } from '/firebase.js';
import { 
    doc, 
    runTransaction, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * --- 🧠 MEMORIA DE SOBERANÍA (CACHÉ L1) ---
 * Evita el gasto de lecturas en ráfagas de validación.
 */
const HISTORY_CACHE = new Set();

/**
 * emitSia7: Telemetría táctica para el Jarvis HUD V10.
 */
const emitSia7 = (step, details, severity = "INFO", hash = "SYS") => {
    window.dispatchEvent(new CustomEvent('gestia-terminal-state', {
        detail: {
            step: `HISTORY:${step}`,
            details: details,
            opId: hash.substring(0, 8), // Usamos el inicio del hash como OpId visual
            severity: severity,
            modulo: "HISTORY_ENGINE"
        }
    }));
};

/**
 * registrarYVerificarADN (V2.0 ATOMIC)
 * Valida la existencia y registra en un solo movimiento atómico.
 * @param {string} hash - Firma criptográfica SHA-256 del código/datos.
 * @param {Object} metadata - Datos de contexto (moduloId, tenantId, userId, size).
 * @returns {Promise<boolean>} TRUE si es nuevo y se guardó. FALSE si ya existía.
 */
export async function registrarYVerificarADN(hash, metadata = {}) {
    if (!hash || typeof hash !== "string") {
        emitSia7("REJECT", "Intento de registro con Hash corrupto o nulo.", "ERROR");
        throw new Error("HISTORY_ENGINE: HASH_INVALIDO_O_CORRUPTO");
    }

    // --- 🛡️ 1. CAPA DE CACHÉ L1 (RAM) ---
    if (HISTORY_CACHE.has(hash)) {
        emitSia7("CACHE_HIT", `ADN [${hash.substring(0,8)}] ya validado en memoria.`, "SUCCESS", hash);
        return false; // No es nuevo, ya existe
    }

    const ref = doc(db, "gestia_module_versions_global", hash);

    try {
        // --- 🔒 2. TRANSACCIÓN ATÓMICA (ANTI-RACE CONDITION) ---
        emitSia7("TRANSACTION", `Sellando ADN en Blockchain interno...`, "INFO", hash);

        const isNewRecord = await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(ref);
            
            // Si otra instancia lo escribió un milisegundo antes, abortamos la inserción
            if (snap.exists()) {
                return false; 
            }

            // Construcción del Ledger de Integridad
            const payload = {
                hash_snapshot: hash,
                hash_type: metadata.hashType || "SHA-256",
                modulo_origen: metadata.moduloId || "UNKNOWN_MODULE",
                tenantId: metadata.tenantId || "GLOBAL_SYS",
                creado_por: metadata.userId || "SYSTEM_AUTO",
                version_arquitectura: metadata.version || "1.0",
                size_bytes: metadata.size || 0,
                cambio_tipo: metadata.changeType || "MINOR_UPDATE",
                fecha_registro: serverTimestamp()
            };

            transaction.set(ref, payload);
            return true;
        });

        // --- 💾 3. ACTUALIZACIÓN DE MEMORIA VOLÁTIL ---
        if (isNewRecord) {
            HISTORY_CACHE.add(hash);
            emitSia7("COMMITTED", `ADN Inmortalizado. Tamaño: ${metadata.size || 0} bytes.`, "SUCCESS", hash);
        } else {
            // Lo añadimos a caché de todas formas para futuras lecturas rápidas
            HISTORY_CACHE.add(hash);
            emitSia7("COLLISION_PREVENTED", `Colisión evitada. El ADN ya residía en la BD.`, "WARN", hash);
        }

        return isNewRecord;

    } catch (error) {
        emitSia7("CRASH", `Fallo atómico al sellar historial: ${error.message}`, "ERROR", hash);
        console.error("❌ [HISTORY_ENGINE] Error de Transacción:", error);
        throw error;
    }
}

/**
 * purgarCacheHistorial: Libera RAM si la sesión es muy prolongada.
 */
export function purgarCacheHistorial() {
    const size = HISTORY_CACHE.size;
    HISTORY_CACHE.clear();
    emitSia7("PURGE", `Caché L1 vaciada. ${size} Hashes liberados de RAM.`, "WARN");
}

// Log Corporativo
console.log("%c📜 [HISTORY_ENGINE]: V2.0 IMMUTABLE LEDGER ONLINE", "color: #a78bfa; font-weight: bold; background: #2e1065; border-left: 4px solid #7c3aed; padding: 2px 10px;");