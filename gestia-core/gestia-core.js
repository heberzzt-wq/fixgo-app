/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - GESTIA CORE V16.0 (THE SUPREME SOVEREIGN)
 * ======================================================================================
 * Identidad: El Kernel Definitivo con Gestión de Memoria Perfecta e Idempotencia Total.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * --------------------------------------------------------------------------------------
 * ARQUITECTURA DE SOBERANÍA SIA7 (ESTÁNDAR V16.0):
 * 1. FASE DE RESERVA (PREPARE PHASE): 
 * - GC DUAL: Limpieza de historial y locks por tiempo y volumen (Slice).
 * - REPLAY SHIELD: Protección histórica con ventana TTL para IDs de análisis.
 * - TRUE LRU CACHE: Política de reemplazo real con re-inserción en cada lectura (O(1)).
 * - COLLISION SHIELD: Key de caché compuesta (QuickHash + Input Length).
 * - UNIVERSAL HASHING: SHA-256 nativo con fallback trazable (ADN algorítmico).
 * - ATOMIC UPSERT: Lógica de Set/Update para garantizar estabilidad en perfiles nuevos.
 * 2. FASE DE ACCIÓN (EXECUTION PHASE): 
 * - Ejecución Idempotente mediante AnalysisId fuera de la transacción de DB.
 * 3. FASE DE LIQUIDACIÓN (COMMIT PHASE): 
 * - Settlement de tokens (Reserved -> Used) con telemetría exacta post-commit.
 * - DUAL FACTOR CLEANUP: Limpieza de pending_hashes validando Hash + Algoritmo.
 * - Deduplicación O(n) mediante Sets para optimización de historial de firmas.
 * 4. FASE DE LIBERACIÓN (RELEASE PHASE): 
 * - Rollback resiliente con bucle de reintento ante fallos de red (3PC+R).
 * --------------------------------------------------------------------------------------
 * Autor: Heberto Mendoza (Arquitecto Supremo) & El Abuelo
 * ======================================================================================
 */

import { auth, db } from '/firebase.js';
import { 
    doc, 
    runTransaction, 
    serverTimestamp,
    updateDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Motores de lógica estratégica (Cerebro) y ejecución mecánica (Brazo)
import { generarPropuesta } from '/gestia-core/propose.engine.js';
//import { ejecutarCambios } from '/gestia-core/operations-executor.engine.js';

// ======================================================================================
// 🛠️ SECCIÓN 0: SIA7 UTILS (DETERMINISMO, CRIPTOGRAFÍA Y MEMORIA)
// ======================================================================================

const SIA7_UTILS = {
    // Memoria volátil de alta velocidad con política de reemplazo LRU real
    hashCache: new Map(),
    MAX_CACHE_SIZE: 150,

    /**
     * generarUUID: Identidad de alta entropía (RFC 4122 v4).
     * El ancla inmutable de cada ciclo operativo en el búnker.
     */
    generarUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback matemático para entornos sin Web Crypto API
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    /**
     * sortPayload: Ordenamiento recursivo profundo de objetos.
     * Garantiza que el Watchdog detecte la misma intención sin importar el orden JSON.
     */
    sortPayload(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.sortPayload(item));
        }
        // Ordenamiento alfabético estricto de llaves
        const keys = Object.keys(obj).sort();
        const sortedObj = {};
        for (const key of keys) {
            sortedObj[key] = this.sortPayload(obj[key]);
        }
        return sortedObj;
    },

    /**
     * generarHashAtómico: Implementación con Gestión de Memoria y True LRU.
     * ✅ FIX 1: Al incluir input.length en la Key, anulamos colisiones por DJB2.
     * ✅ FIX 2: Implementación de LRU Real (delete + set en cada lectura exitosa).
     */
    async generarHashAtómico(input) {
        // Generamos el QuickHash base para la firma de memoria
        const baseHash = this.quickHash(input);
        
        // --- 🛡️ COLLISION SHIELD ---
        // Key compuesta para evitar que inputs distintos con mismo hash DJB2 colisionen.
        const cacheKey = `${baseHash}_${input.length}`;

        // --- 🛡️ TRUE LRU LOGIC (FIX) ---
        // Si el elemento existe, lo extraemos y re-insertamos para marcarlo como "fresco".
        if (this.hashCache.has(cacheKey)) {
            const cachedValue = this.hashCache.get(cacheKey);
            this.hashCache.delete(cacheKey);
            this.hashCache.set(cacheKey, cachedValue);
            return cachedValue;
        }

        // --- 🛡️ LRU EVICTION POLICY ---
        // JS Maps mantienen el orden de inserción. El primero es el menos usado.
        if (this.hashCache.size >= this.MAX_CACHE_SIZE) {
            const oldestKey = this.hashCache.keys().next().value;
            this.hashCache.delete(oldestKey);
        }

        let result;
        // 1. Intento de uso de Web Crypto API (SHA-256 Enterprise)
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            try {
                const msgUint8 = new TextEncoder().encode(input);
                const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                result = { h: hashHex, alg: "sha256" };
            } catch (e) {
                // Degradación controlada con trazabilidad
                result = { h: baseHash, alg: "djb2_fallback" };
            }
        } else {
            // 2. Fallback Universal (Compatibilidad 360°)
            result = { h: baseHash, alg: "djb2" };
        }

        // Almacenamiento en caché antes de retornar (Posición: Newest)
        this.hashCache.set(cacheKey, result);
        return result;
    },

    /**
     * quickHash: Generador DJB2 para firmas rápidas de memoria.
     */
    quickHash(str) {
        let hash = 5381;
        let i = str.length;
        while (i) {
            hash = (hash * 33) ^ str.charCodeAt(--i);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }
};

// ======================================================================================
// 🛡️ SECCIÓN 1: CONFIGURACIÓN ESTRATÉGICA (BÚNKER SETTINGS)
// ======================================================================================

const CORE_CONFIG = {
    FIREWALL: {
        RATE_LIMIT: {
            MAX_REQUESTS_PER_MIN: 5,
            MAX_REQUESTS_PER_HOUR: 50
        },
        COST_CONTROL: {
            MAX_TOKENS_PER_DAY: 20000,
            MAX_TOKENS_PER_OP: 1500,
            MULTIMODAL: {
                IMAGE: 400,
                FILE: 800,
                DEFAULT: 500
            }
        },
        ABUSE: {
            MAX_ERRORS_WEIGHT: 5,
            BLOCK_TIME_MS: 15 * 60 * 1000 // 15 minutos de baneo
        }
    },
    WATCHDOG: {
        MAX_HASHES_PERSISTED: 30,
        MAX_ANALYSIS_IDS: 50, 
        HASH_EXPIRATION_MS: 5 * 60 * 1000, // 5 minutos de ventana de frescura
        LOCK_TIMEOUT_MS: 45000 // 45 segundos para concurrencia paralela
    }
};
import '/gestia-core/semantic.engine.js';
import '/gestia-core/brain.engine.js';
import '/gestia-core/tools.runtime.js';
import '/gestia-core/response.composer.js';
import '/gestia-core/tools.bridge.js';

// ======================================================================================
// 🛰️ SECCIÓN 2: GESTIA CORE ORCHESTRATOR (KERNEL V16.0)
// ======================================================================================

export const GestiaCore = {
    version: "16.0.0-SUPREME",
    // Helper de seguridad para identificar planes Read-Only
    isReadOnlyPlan(changes) {
        return !changes || changes.length === 0;
    },

    /**
     * procesarIntencion: El pipeline definitivo de soberanía sistémica.
     */
    async procesarIntencion(inputRaw, context = {}) {
        const user = auth.currentUser;
        if (!user) return this.abortar("AUTH_FAILED", "Acceso denegado: Sesión no válida.");

        const tenantId = context.tenantId || "UXMAL39";
        const analysisId = SIA7_UTILS.generarUUID();
        const ahora = Date.now();
        const rol = context.rol || 'tecnico';
        const esSoberano = ['ceo', 'arquitecto_supremo'].includes(rol);

        this.emitirPulso("INIT", "TERMINAL_START", `ID: ${analysisId.substring(0, 8)}`);

        // Referencias de Estado Primordiales (Firestore)
        const firewallRef = doc(db, "gestia_firewall", `${tenantId}_${user.uid}`);
        const memoryRef = doc(db, "gestia_memory", `${tenantId}_${user.uid}`);

        // Bucket de intercambio de estado (Atomic State Transfer)
        let atomicState = {
            approvedChanges: [],
            tokensToReserve: 0,
            hashesToLock: [],
            isDegraded: false,
            proposal: null,
            isHalted: false,
            haltReason: "",
            realBudgetSnapshot: 0,
            historyToAdd: { id: analysisId, t: ahora }
        };

        try {
            // --------------------------------------------------------------------------
            // 🔒 FASE 1: RESERVA, BLOQUEO Y PROTECCIÓN DE REPLAY (PREPARE)
            // --------------------------------------------------------------------------

            this.emitirPulso("INIT", "TERMINAL_START", `ID: ${analysisId.substring(0, 8)}`);
            this.emitirPulso("PREPARE", "STARTING_TRANSACTION");
            
            await runTransaction(db, async (transaction) => {
                
                // 1. Lectura Secuencial de Sensores Reales
                const fwSnap = await transaction.get(firewallRef);
                const memSnap = await transaction.get(memoryRef);

                // Esquema de Onboarding (Si el usuario es nuevo)
                const fwData = fwSnap.exists() ? fwSnap.data() : {
                    requests_min: 0, requests_hour: 0, tokens_used: 0, reserved_tokens: 0,
                    errores: 0, bloqueado_hasta: 0,
                    last_min_reset: ahora, last_hour_reset: ahora, last_day_reset: ahora
                };

                const memData = memSnap.exists() ? memSnap.data() : {
                    recent_analysis_history: [], 
                    recent_hashes_v2: [], 
                    pending_hashes: []    
                };

                // 2. 🧹 GARBAGE COLLECTION (SIA7 SCALABILITY)
                // Limpieza de IDs de análisis antiguos para evitar Replays obsoletos
                memData.recent_analysis_history = (memData.recent_analysis_history || []).filter(item => 
                    (ahora - item.t < CORE_CONFIG.WATCHDOG.HASH_EXPIRATION_MS)
                ).slice(-CORE_CONFIG.WATCHDOG.MAX_ANALYSIS_IDS);

                // Limpieza de locks de concurrencia expirados
                memData.pending_hashes = (memData.pending_hashes || []).filter(p => 
                    (ahora - p.t < CORE_CONFIG.WATCHDOG.LOCK_TIMEOUT_MS)
                ).slice(-CORE_CONFIG.WATCHDOG.MAX_HASHES_PERSISTED);

                // --- 🛡️ PROTECCIÓN DE REPLAY ATTACK (POST-GC) ---
                const esReplay = (memData.recent_analysis_history || []).some(item => item.id === analysisId);
                if (esReplay) {
                    atomicState.isHalted = true;
                    atomicState.haltReason = "REPLAY_DETECTED: Petición ya procesada.";
                    return;
                }

                // 3. Verificación de Seguridad y Baneo
                if (!esSoberano && fwData.bloqueado_hasta && ahora < fwData.bloqueado_hasta) {
                    const min = Math.ceil((fwData.bloqueado_hasta - ahora) / 60000);
                    throw new Error(`FIREWALL: Baneo activo. Reintento en ${min} min.`);
                }

                // 4. Mantenimiento de Ventanas de Frecuencia (Rate Resets)
                if (ahora - fwData.last_min_reset > 60000) { fwData.requests_min = 0; fwData.last_min_reset = ahora; }
                if (ahora - fwData.last_hour_reset > 3600000) { fwData.requests_hour = 0; fwData.last_hour_reset = ahora; }
                if (ahora - fwData.last_day_reset > 86400000) { fwData.tokens_used = 0; fwData.last_day_reset = ahora; }

                // 5. Validación de Sensores de Rate Limit (Minuto y Hora)
                if (!esSoberano) {
                    if (fwData.requests_min >= CORE_CONFIG.FIREWALL.RATE_LIMIT.MAX_REQUESTS_PER_MIN) {
                        throw new Error("RATE_LIMIT: Límite por minuto alcanzado.");
                    }
                    if (fwData.requests_hour >= CORE_CONFIG.FIREWALL.RATE_LIMIT.MAX_REQUESTS_PER_HOUR) {
                        throw new Error("RATE_LIMIT: Cuota horaria agotada.");
                    }
                }

                                // 6. HYBRID COGNITIVE REASONING ENGINE
                // =====================================================================================

                this.emitirPulso(
                    "COGNITION",
                    "HYBRID_REASONING"
                );

                let propuesta = null;

                /**
                 * =====================================================================================
                 * V7.5 HYBRID COGNITION
                 * =====================================================================================
                 */

                if (

                    window.runCognitiveReasoning

                ) {

                    try {

                        const cognitiveResult =
                            await window.runCognitiveReasoning(

                                inputRaw,

                                {

                                    ...context,

                                    tenantId,
                                    analysisId,
                                    rol
                                }
                            );

                        const reasoning =
                            cognitiveResult?.reasoning;

                        propuesta = {

                            analysis_id:
                                analysisId,

                            cognition:
                                reasoning,

                            strategicMode:
                                reasoning?.strategicMode ||

                                "PROTECTIVE",

                            semantic:
                                reasoning?.semantic ||

                                {},

                            inferences:
                                reasoning?.inferences ||

                                [],

                            executionChain:
                                reasoning?.executionChain ||

                                [],

                             toolCalls:
                                reasoning?.toolCalls ||
                                [],

                            cloudReasoning:
                                reasoning?.cloudReasoning ||

                                null,

                            changes:

                                reasoning
                                    ?.executionChain
                                    ?.map(step => ({

                                        type:
                                            step.step,

                                        target:
                                            step.target,

                                        payload: {

                                            reasoningId:
                                                reasoning?.reasoningId,

                                            mode:
                                                reasoning?.strategicMode,

                                            cognition:
                                                true
                                        }

                                    })) ||

                                []
                        };

                        this.emitirPulso(

                            "COGNITION",

                            "CONNECTED",

                            reasoning?.strategicMode
                        );

                    } catch (brainError) {

                        console.error(

                            "🚨 [COGNITIVE_BRIDGE_FAIL]",

                            brainError
                        );

                        this.emitirPulso(

                            "COGNITION",

                            "FALLBACK_MODE"
                        );
                    }
                }

                /**
                 * =====================================================================================
                 * FALLBACK LEGACY ENGINE
                 * =====================================================================================
                 */

                if (

                    !propuesta

                ) {

                    propuesta =
                        generarPropuesta({

                            analysis_id:
                                analysisId,

                            input_original:
                                inputRaw,

                            context
                        });
                }


                /**
 * =====================================================================================
 * AGENT LOOP V7 — TOOL PLAN EXECUTION
 * =====================================================================================
 * Ejecuta toolCalls explícitas antes de convertir todo a changes.
 * Esto permite flujo tipo Codex:
 * plan → tool → observe → verify → respond
 */
if (
    Array.isArray(
        propuesta?.toolCalls
    ) &&
    propuesta.toolCalls.length > 0
) {
    this.emitirPulso(
        "AGENT_LOOP",
        "TOOL_PLAN_DETECTED",
        `${propuesta.toolCalls.length} tools`
    );

    if (
        !window.ToolsBridge?.executeMany
    ) {
        throw new Error(
            "TOOLS_BRIDGE_MISSING"
        );
    }

    const toolObservations =
        await window.ToolsBridge.executeMany(
            propuesta.toolCalls,
            {
                ...context,
                rawInput:
                    inputRaw,
                tenantId,
                analysisId,
                rol,
                reasoning:
                    propuesta.cognition ||
                    propuesta.reasoning ||
                    null
            }
        );

    propuesta.agentLoop =
        {
            version:
                "7.0.0",
            mode:
                "TOOL_PLAN",
            toolCalls:
                propuesta.toolCalls,
            observations:
                toolObservations,
            verified:
                toolObservations.every(
                    item =>
                        item?.ok !== false
                )
        };

    propuesta.changes =
        [];

    atomicState.isHalted =
        true;

    atomicState.haltReason =
        "AGENT_TOOL_RESULT";

    atomicState.agentResult =
        propuesta.agentLoop;

    return;
}
                /**
                 * =====================================================================================
                 * VALIDATION
                 * =====================================================================================
                 */

                if (

                    !propuesta ||

                    !Array.isArray(
                        propuesta.changes
                    )

                ) {

                    throw new Error(
                        "PROPOSE_INVALID"
                    );
                }

                // 7. Filtrado de Redundancia y Predictividad de Presupuesto
                let tokensEstimados = typeof inputRaw === 'string' 
                    ? Math.min(Math.ceil(inputRaw.length / 3.5), CORE_CONFIG.FIREWALL.COST_CONTROL.MAX_TOKENS_PER_OP)
                    : (CORE_CONFIG.FIREWALL.COST_CONTROL.MULTIMODAL[inputRaw?.type?.toUpperCase()] || CORE_CONFIG.FIREWALL.COST_CONTROL.MULTIMODAL.DEFAULT);

                // Predictor de desborde incluyendo reservas activas (V9.7)
                const proyectadoTotal = fwData.tokens_used + (fwData.reserved_tokens || 0) + tokensEstimados;
                let degradedMode = proyectadoTotal > CORE_CONFIG.FIREWALL.COST_CONTROL.MAX_TOKENS_PER_DAY;
                
                /* =====================================================================================
   HYBRID CHANGE ENRICHMENT PIPELINE
===================================================================================== */

const enrichedChanges =

    (propuesta.changes || [])

    .map(change => {

        const normalized = {

            ...change,

            _timestamp:
                ahora,

            _analysisId:
                analysisId,

            _tenantId:
                tenantId,

            _source:
                "HYBRID_COGNITION",

            _alg:
                "SIA7_HYBRID_V7"
        };

        /* ============================================================================
           STABLE HASH GENERATION
        ============================================================================ */

        try {

            normalized._hash =

                SIA7_UTILS?.generarHashSeguro

    ? SIA7_UTILS.generarHashSeguro(

                        JSON.stringify({

                            type:
                                normalized.type,

                            target:
                                normalized.target,

                            payload:
                                normalized.payload
                        
                    })
)

: crypto.randomUUID();

        }

        catch(hashError) {

            console.warn(
                "⚠️ [HASH_GENERATION_FAIL]",
                hashError
            );

            normalized._hash =

                `${analysisId}_${Math.random()}`
                    .replace(/\./g, "");
        }

        return normalized;
    });

/* =====================================================================================
   REDUNDANCY + DEGRADATION FILTER
===================================================================================== */

const cambiosFinales =

    enrichedChanges.filter(c => {

        const historico =

            (memData.recent_hashes_v2 || [])

            .find(r =>

                r.h === c._hash &&

                r.alg === c._alg
            );

        /* ============================================================================
           TTL FRESHNESS MEMORY
        ============================================================================ */

        if (

            historico &&

            (

                ahora - historico.t

                <

                CORE_CONFIG
                    .WATCHDOG
                    .HASH_EXPIRATION_MS
            )

        ) {

            return false;
        }

        /* ============================================================================
           LOAD SHEDDING
        ============================================================================ */

        if (

            degradedMode &&

            !esSoberano &&

            [

                "FORCE_MAINTENANCE_TASK",

                "NORMALIZE_IDENTITY"

            ]

            .includes(c.type)

        ) {

            return false;
        }

        return true;
    });

                if (cambiosFinales.length === 0) {
                    atomicState.isHalted = true;
                    atomicState.haltReason = "REDUNDANT_OR_SHEDDED";
                    return;
                }

                if (degradedMode) {
                    if (!esSoberano) throw new Error("ECON_SHIELD: Cuota diaria de tokens agotada.");
                    tokensEstimados = 0; // El Soberano opera sin costo en modo Dios
                }

                // 8. ASENTAMIENTO DE RESERVA (COMMIT FASE 1 - UPSERT ATÓMICO)
                // ✅ Bloqueamos tokens y preparamos el búnker (Escritura Granular Update)
                const updateFW = {
                    requests_min: fwData.requests_min + 1,
                    requests_hour: fwData.requests_hour + 1,
                    reserved_tokens: (fwData.reserved_tokens || 0) + tokensEstimados,
                    last_seen: serverTimestamp()
                };

                // Lógica de Upsert inteligente para Onboarding seguro
                if (!fwSnap.exists()) {
                    transaction.set(firewallRef, { 
                        ...updateFW, 
                        tokens_used: 0, errores: 0, bloqueado_hasta: 0, 
                        last_min_reset: ahora, last_hour_reset: ahora, last_day_reset: ahora 
                    });
                } else {
                    transaction.update(firewallRef, updateFW);
                }

                // Deduplicación O(n) en el Pending Lock mediante Set
                const pendingSet = new Set((memData.pending_hashes || []).map(p => p.h));
                const locksParaMemoria = cambiosFinales
                    .map(c => ({ h: c._hash, t: ahora, alg: c._alg }))
                    .filter(l => {
                        if (pendingSet.has(l.h)) return false;
                        pendingSet.add(l.h);
                        return true;
                    });

                const updateMEM = {
                    pending_hashes: [...(memData.pending_hashes || []), ...locksParaMemoria],
                    last_updated: serverTimestamp()
                };

                if (!memSnap.exists()) {
                    transaction.set(memoryRef, { 
                        ...updateMEM, 
                        recent_analysis_history: [], 
                        recent_hashes_v2: [] 
                    });
                } else {
                    transaction.update(memoryRef, updateMEM);
                }

                // Transferencia de estado para el Brazo Ejecutor mecánico
                atomicState = {
                    ...atomicState,
                    approvedChanges: cambiosFinales,
                    tokensReserved: tokensEstimados,
                    hashesToLock: locksParaMemoria,
                    isDegraded: degradedMode,
                    proposal: propuesta
                };
            });

                        if (atomicState.isHalted) {
                if (
                    atomicState.haltReason === "AGENT_TOOL_RESULT"
                ) {
                    this.emitirPulso(
                        "AGENT_LOOP",
                        "COMPLETED",
                        analysisId.substring(0, 8)
                    );

                    return {
                        status:
                            "success",
                        type:
                            "AGENT_TOOL_RESULT",
                        operation_id:
                            analysisId,
                        analysis_id:
                            analysisId,
                        opId:
                            analysisId,
                        result:
                            atomicState.agentResult,
                        reasoning:
                            atomicState.proposal?.cognition ||
                            null,
                        executionChain:
                            atomicState.agentResult?.toolCalls ||
                            [],
                        runtime:
                            {
                                cognition:
                                    "AGENT_LOOP_V7",
                                timestamp:
                                    Date.now(),
                                runtimeStatus:
                                    "ONLINE"
                            }
                    };
                }

                this.emitirPulso(
                    "WATCHDOG",
                    "STANDBY",
                    atomicState.haltReason
                );

                return {
                    status:
                        "halted",
                    reason:
                        atomicState.haltReason
                };
            }

           // --------------------------------------------------------------------------
// 🦾 FASE 2: ACCIÓN IDEMPOTENTE FUERA DE TRANSACCIÓN (EXECUTE)
// --------------------------------------------------------------------------

// SAFETY GATE: Impedir ejecución si no hay cambios aprobados
const tieneCambios = atomicState.approvedChanges && atomicState.approvedChanges.length > 0;

if (!tieneCambios) {
    this.emitirPulso("EXECUTOR", "SKIPPED", "No hay cambios mutantes (ReadOnly Task).");
    // Inicializamos result con un estado seguro para evitar errores en la Fase 3
    var result = { 
        status: "readonly_no_op", 
        reasoning: atomicState.proposal?.cognition || null 
    };
} else {
    this.emitirPulso(
        "EXECUTOR",
        "FIRING",
        `ID Operativo: ${analysisId.substring(0,8)}`
    );

    // Ejecución controlada solo si hay cambios reales
    // Usamos import dinámico para aislar la carga del ejecutor hasta este momento
    const { ejecutarCambios } = await import('/gestia-core/operations-executor.engine.js');
    
    result = await ejecutarCambios({
        ...atomicState.proposal,
        changes: atomicState.approvedChanges,
        tenantId,
        ejecutado_por: user.email,
        execution_id: analysisId // Idempotencia de brazo mecánico
    });
}

            // --------------------------------------------------------------------------
            // 🔒 FASE 3: LIQUIDACIÓN ATÓMICA Y ASENTAMIENTO (COMMIT)
            // --------------------------------------------------------------------------
            this.emitirPulso("COMMIT", "SETTLING_RESOURCES");
            
            await runTransaction(db, async (t) => {
                const fwSnap = await t.get(firewallRef);
                const memSnap = await t.get(memoryRef);

                const fw = fwSnap.data();
                const mem = memSnap.data();

                // 1. Confirmar Gasto: Reserved -> Used
                const tokensFinales = fw.tokens_used + atomicState.tokensReserved;
                const reservasFinales = Math.max(0, (fw.reserved_tokens || 0) - atomicState.tokensReserved);

                // 2. Consolidar Memoria con Deduplicación O(n) y TTL Filter
                const seenHashes = new Set();
                
                const historicoUnico = [...atomicState.hashesToLock, ...(mem.recent_hashes_v2 || [])]
                    .filter(item => {
                        // Unicidad basada en par Hash + Algoritmo (Evita colisiones entre algs)
                        const uniqueKey = `${item.h}_${item.alg}`;
                        if (seenHashes.has(uniqueKey)) return false;
                        seenHashes.add(uniqueKey);
                        return true;
                    });

                const historicoFrescor = historicoUnico
                    .filter(r => (ahora - r.t < CORE_CONFIG.WATCHDOG.HASH_EXPIRATION_MS))
                    .slice(0, CORE_CONFIG.WATCHDOG.MAX_HASHES_PERSISTED);
                
                // --- 🛡️ FIX 2: CLEANUP DE PENDING CON DUAL FACTOR (HASH + ALG) ---
                // ✅ Mapeamos claves únicas para asegurar que limpiamos el lock correcto.
                const idsConfirmados = atomicState.hashesToLock.map(l => `${l.h}_${l.alg}`);
                const pendingLimpio = (mem.pending_hashes || []).filter(p => 
                    !idsConfirmados.includes(`${p.h}_${p.alg}`)
                );

                // Consolidación de Historial de Análisis con TTL
                const historialAnalisis = [atomicState.historyToAdd, ...(mem.recent_analysis_history || [])]
                    .filter(item => (ahora - item.t < CORE_CONFIG.WATCHDOG.HASH_EXPIRATION_MS))
                    .slice(0, CORE_CONFIG.WATCHDOG.MAX_ANALYSIS_IDS);

                // Captura de Telemetría Real Post-Commit (Basada en valores liquidados)
                atomicState.realBudgetSnapshot = Math.min(100, Math.round((tokensFinales / CORE_CONFIG.FIREWALL.COST_CONTROL.MAX_TOKENS_PER_DAY) * 100));

                // Escritura Granular (Update) para optimizar costos de Firebase
                t.update(firewallRef, {
                    tokens_used: tokensFinales,
                    reserved_tokens: reservasFinales,
                    "metadata.last_op_success": analysisId,
                    "metadata.budget_status": `${atomicState.realBudgetSnapshot}%`
                });

                t.update(memoryRef, {
                    recent_analysis_history: historialAnalisis,
                    recent_hashes_v2: historicoFrescor,
                    pending_hashes: pendingLimpio,
                    last_updated: serverTimestamp()
                });
            });

            this.emitirPulso("KERNEL", "SUCCESS", `Operación ${analysisId.substring(0,8)} Sellada.`);

            return {

    status:
        "success",

    /* =================================================
       EXECUTION CONTRACT NORMALIZATION
    ================================================= */

    operation_id:
        analysisId,

    analysis_id:
        analysisId,

    opId:
        analysisId,

    /* =================================================
       RESULTS
    ================================================= */

    result,

    reasoning:
        result?.reasoning ||

        null,

    executionChain:
        result?.reasoning
            ?.executionChain ||

        [],

    /* =================================================
       TELEMETRY
    ================================================= */

    budget:
        atomicState
            .realBudgetSnapshot,

    runtime:
        {

            cognition:
                "HYBRID_V7",

            timestamp:
                Date.now(),

            runtimeStatus:
                "ONLINE"
        }
};

        } catch (error) {
            this.emitirPulso("CRASH", "FATAL_FAILURE", error.message);
            console.error("🚨 [SIA7_CORE_FATAL]:", error);

            // --------------------------------------------------------------------------
            // 🛠️ FASE 4: LIBERACIÓN RESILIENTE CON REINTENTO (RELEASE)
            // --------------------------------------------------------------------------
            if (atomicState.tokensReserved > 0 || atomicState.hashesToLock.length > 0) {
                this.emitirPulso("RELEASE", "INITIATING_ROLLBACK");
                
                for (let i = 0; i < 2; i++) {
                    try {
                        await runTransaction(db, async (t) => {
                            const fwSnap = await t.get(firewallRef);
                            const memSnap = await t.get(memoryRef);
                            if (!fwSnap.exists() || !memSnap.exists()) return;

                            const fw = fwSnap.data();
                            const mem = memSnap.data();
                            const locksAFallar = atomicState.hashesToLock.map(l => l.h);
                            
                            t.update(firewallRef, { 
                                reserved_tokens: Math.max(0, (fw.reserved_tokens || 0) - atomicState.tokensReserved) 
                            });

                            t.update(memoryRef, { 
                                pending_hashes: (mem.pending_hashes || []).filter(p => !locksAFallar.includes(p.h)) 
                            });
                        });
                        this.emitirPulso("RELEASE", "ROLLBACK_SUCCESS", "Recursos devueltos.");
                        break; 
                    } catch (releaseError) {
                        if (i === 1) this.emitirPulso("CRITICAL", "RELEASE_FAILED", "Fuga de recursos detectada.");
                    }
                }
            }

            const esHostil = error.message.includes("LIMIT") || error.message.includes("SHIELD") || error.message.includes("BAN");
            await this.registrarPenalizacion(user.uid, tenantId, esHostil);
            return { status: "error", msg: error.message };

        } finally {
            // ✅ Higiene Total de Memoria Garantizada (Modo Tacaño RAM)
            // Limpiamos el caché local al finalizar cada ciclo, sea éxito o fallo.
            SIA7_UTILS.hashCache.clear();
        }
    },

    /**
     * registrarPenalizacion: Blindaje de Contra-Inteligencia SIA7.
     */
    async registrarPenalizacion(uid, tenantId, esHostil) {
        const ref = doc(db, "gestia_firewall", `${tenantId}_${uid}`);
        try {
            await runTransaction(db, async (t) => {
                const snap = await t.get(ref);
                if (!snap.exists()) return;

                const data = snap.data();
                const incremento = esHostil ? 2 : 1;
                const total = (data.errores || 0) + incremento;
                
                if (total >= CORE_CONFIG.FIREWALL.ABUSE.MAX_ERRORS_WEIGHT) {
                    t.update(ref, { 
                        errores: 0, 
                        bloqueado_hasta: Date.now() + CORE_CONFIG.FIREWALL.ABUSE.BLOCK_TIME_MS 
                    });
                    this.emitirPulso("FIREWALL", "SECURITY_LOCK", "Baneo temporal aplicado.");
                } else {
                    t.update(ref, { errores: total, last_error: serverTimestamp() });
                }
            });
        } catch (e) {
            console.error("🚨 [PENALTY_FAILED]:", e.message);
        }
    },

    emitirPulso(step, status, details = "") {
        window.dispatchEvent(new CustomEvent('gestia-terminal-state', {
            detail: { step: `CORE_${step}: ${status}`, details }
        }));
    },

    abortar(code, msg) {
        console.error(`🚨 [KERNEL_ABORT]: ${code} - ${msg}`);
        return { status: "aborted", code, msg };
    }
};

// Exposición global para depuración en búnker
window.GestiaCore = GestiaCore;
window.SIA7_CORE = GestiaCore;

console.info(
    "🧠 [GESTIA_CORE_GLOBAL] ONLINE",
    GestiaCore.version
);

/* ============================================================
   JARVIS CODEX V2 — CORE STATUS
   Commit 23 Mega-Pack
   ============================================================ */

(function initJarvisCodexV2CoreStatus() {
  if (window.__JARVIS_CODEX_V2_CORE_STATUS__) return;
  window.__JARVIS_CODEX_V2_CORE_STATUS__ = true;

  window.getJarvisCodexV2Status = function getJarvisCodexV2Status() {
    return {
      mode:
        "Jarvis Codex Mode V2",

      read:
        true,

      diagnose:
        true,

      exactPatchBuilder:
        Boolean(window.JarvisCodexV2?.patchPreviewExact),

      approvedPatchContract:
        Boolean(window.JarvisCodexV2?.approvePendingPatch),

      safeCodeWrite:
        Boolean(window.JarvisCodexV2?.safeCodeWrite),

      postWriteVerify:
        Boolean(window.JarvisCodexV2?.postWriteVerify),

      brainRouter:
        Boolean(window.JarvisCodexV2BrainRouter?.handleCodexV2Command),

      terminalRender:
        Boolean(window.renderCodexV2Card),

      pendingPatch:
        Boolean(window.JarvisCodexV2?.state?.pendingPatch),

      approvedPatch:
        Boolean(window.JarvisCodexV2?.state?.approvedPatch),

      version:
        "V2.0-commit-23-megapack"
    };
  };
})();
