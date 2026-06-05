/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - OPERATIONS EXECUTOR ENGINE V16.1 (THE INDESTRUCTIBLE LEDGER)
 * ======================================================================================
 * Identidad: El Brazo Mecánico con Resolución Pre-Transaccional y Blindaje Forense.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * --------------------------------------------------------------------------------------
 * ARQUITECTURA DE MISIÓN CRÍTICA (V16.1):
 * 1. TRANSACTIONAL IDEMPOTENCY: Verificación de estado 'completed' antes del disparo
 * para evitar ejecuciones duplicadas por reintentos de red o UI.
 * 2. DETERMINISTIC RESULTS: Buffer local de resultados que solo se consolida tras
 * el éxito del commit atómico, eliminando duplicados en el historial del HUD.
 * 3. DEEP SANITIZATION: Limpieza recursiva de payloads para evitar crashes por
 * valores anidados 'undefined' o 'null' prohibidos en Firestore.
 * 4. ATOMIC LEDGERING: Escritura de huella forense inmutable con IDs únicos generados
 * dentro de la transacción, asegurando trazabilidad por cada cambio.
 * 5. CONCURRENCY SHIELD: Gating de volumen (Máx 50 cambios) para prevenir fallos por
 * tamaño de batch y optimizar la latencia de bloqueo en Firestore.
 * 6. SIA7 HUD PULSE: Telemetría enriquecida con metadatos de OP_ID y TENANT_ID.
 * --------------------------------------------------------------------------------------
 * Autor: Heberto Mendoza (Arquitecto Supremo) & El Abuelo
 * ======================================================================================
 */

import { db } from '/firebase.js';

import { 
    runTransaction,
    doc, 
    collection, 
    serverTimestamp,
    getDoc,
    writeBatch,
    increment,
    query,
    where,
    getDocs,
    addDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * emitirPulsoHUD: Informa a la interfaz de Jarvis los signos vitales del motor.
 * ✅ MEJORA: Incluye contexto de OP_ID para trazabilidad en el Timeline.
 */
function emitirPulsoHUD(opId, step, status = "INFO", details = "") {
    window.dispatchEvent(new CustomEvent('gestia-terminal-state', {
        detail: {
            step: `EXECUTOR_${step}: ${status}`,
            details: details,
            opId: opId,
            modulo: "OPERATIONS_ENGINE",
            severity: status === "ERROR" || status === "FAILED" ? "ERROR" : (status === "SUCCESSFUL_COMMIT" ? "SUCCESS" : "INFO")
        }
    }));
}

/**
 * deepSanitize: Limpieza recursiva de objetos para Firestore.
 * ✅ NASA LEVEL: Protege contra valores nulos/undefined en cualquier nivel de profundidad.
 */
const deepSanitize = (obj) => {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(deepSanitize);

    return Object.entries(obj).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
            acc[key] = (typeof value === "object") ? deepSanitize(value) : value;
        }
        return acc;
    }, {});
};

/**
 * 🧬 1. SIMULAR CAMBIOS (DRY RUN)
 * Proyecta el impacto para el HUD visual antes de la ejecución real.
 * Permite que Jonathan o la IA analicen el riesgo antes de sellar el commit.
 */
export async function simularCambios(changes, opId = "SIM_MODE") {
    emitirPulsoHUD(opId, "SIMULATION", "STARTING");
    
    if (!Array.isArray(changes)) {
        emitirPulsoHUD(opId, "SIMULATION", "ERROR", "Payload de cambios inválido");
        return [];
    }

    // Limitamos el volumen de la simulación para evitar desbordamiento del HUD
    const maxSim = changes.slice(0, 50);

    const projection = maxSim.map(change => {
        return {
            tipo: change.type || "UNKNOWN",
            destino: change.target || "DYNAMIC_RESOURCE",
            impacto: "TRANSACTIONAL_WRITE",
            riesgo: (change.type === "SYSTEM_RESTRICTION" || change.type === "LOCK_TECHNICIAN") ? "HIGH" : "MEDIUM",
            reason: change.reason || "Propuesta automática del Orquestador"
        };
    });

    // Despacho de evento para que el HUD pinte la previsualización táctica
    window.dispatchEvent(new CustomEvent('gestia-dry-run', {
        detail: { 
            simulacion: projection,
            timestamp: Date.now(),
            opId: opId
        }
    }));

    emitirPulsoHUD(opId, "SIMULATION", "READY_FOR_APPROVAL", `${projection.length} acciones proyectadas`);
    return projection;
}

/**
 * 🦾 2. EJECUTAR CAMBIOS (V16.1 INDESTRUCTIBLE)
 * Orquestador maestro con blindaje de integridad y Ledger forense.
 */
export async function ejecutarCambios(proposal) {
    const startTime = Date.now();

/* ================================================================================
   EXECUTION FABRIC NORMALIZATION
================================================================================ */

proposal = normalizeOperationContext(
    proposal
);

const opId =
    proposal.operation_id;

    /* ================================================================================
   EXECUTION FABRIC VALIDATION
================================================================================ */

if (!proposal) {

    throw {
        code: "EXECUTION_FABRIC_ERROR",
        message: "PROPOSAL_UNDEFINED"
    };
}

if (!proposal.operation_id) {

    throw {
        code: "EXECUTION_FABRIC_ERROR",
        message: "MISSING_OPERATION_ID"
    };
}

if (!Array.isArray(proposal.changes)) {

    throw {
        code: "EXECUTION_FABRIC_ERROR",
        message: "INVALID_CHANGES_ARRAY"
    };
}

const {
    tenantId,
    ejecutado_por,
    changes
} = proposal;

    // --- 🛡️ PASO 0: VALIDACIONES DE INFRAESTRUCTURA ---
    if (!tenantId) {
        emitirPulsoHUD(opId || "SYS", "CRASH", "DENIED", "TENANT_ID_ABSENTE");
        throw { code: "EXECUTOR_ERROR", message: "TENANT_ID_INVALIDO" };
    }

    if (!opId) {
        emitirPulsoHUD("SYS", "CRASH", "DENIED", "OPERATION_ID_ABSENTE");
        throw { code: "EXECUTOR_ERROR", message: "OPERATION_ID_INVALIDO" };
    }

    const safeChanges = Array.isArray(changes) ? changes : [];
    
    // Gating de volumen para proteger la atomicidad de Firestore (Límite 50)
    if (safeChanges.length > 50) {
        emitirPulsoHUD(opId, "EXECUTION", "ABORTED", "Payload demasiado grande (Máx 50)");
        throw { code: "PAYLOAD_TOO_LARGE", message: "Máximo 50 cambios por transacción." };
    }

    // ✅ FIX: Sellamos la operación como completada para evitar el bloqueo 'analyzing'.
    if (safeChanges.length === 0) {
        emitirPulsoHUD(opId, "EXECUTION", "COMPLETED_EMPTY", "No se detectaron cambios atómicos.");
        await updateDoc(doc(db, "gestia_operations", opId), {
            status: "completed",
            completed_at: serverTimestamp(),
            engine_metadata: { note: "Ejecución finalizada sin mutaciones detectadas." }
        });
        return [];
    }

    emitirPulsoHUD(opId, "EXECUTION", "INITIATING", `Procesando ${safeChanges.length} acciones...`);
    
    // Resultados finales que solo se devuelven tras el éxito del commit
    const finalResults = [];

    try {
        /**
         * 🛡️ PASO 1: IDEMPOTENCY CHECK (PROTECCIÓN CONTRA DUPLICADOS)
         * Verificamos si esta operación ya fue sellada para evitar doble ejecución.
         */
        const masterOpRef = doc(db, "gestia_operations", opId);
        const masterSnap = await getDoc(masterOpRef);

        if (masterSnap.exists() && masterSnap.data().status === "completed") {
            emitirPulsoHUD(opId, "IDEMPOTENCY", "ALREADY_DONE", "Operación ya completada previamente.");
            return masterSnap.data().engine_metadata?.results_summary || [];
        }

        /**
         * ⚡ FASE 1: PRE-RESOLUCIÓN EXTERNA (READS DE ALTO RENDIMIENTO)
         * Resolvemos consultas de búsqueda fuera de la transacción para reducir el bloqueo.
         */
        const resolvedDataMap = new Map();

        for (const change of safeChanges) {
            if (!change.type) throw new Error("EXECUTOR_ERROR: CHANGE_TYPE_MISSING");

            // --- RESOLUCIÓN DE IDENTIDAD B2B ---
            if (change.type === "NORMALIZE_VEHICLE_OPERATOR" || change.type === "NORMALIZE_IDENTITY") {
                const opName = change.payload?.nombre_operador || "SISTEMA_AUTO";
                
                // Búsqueda de Operador en el contexto del Tenant
                const qOp = query(collection(db, "flotilla_b2b", tenantId, "operadores"), where("nombre", "==", opName));
                const opSnap = await getDocs(qOp);
                let uidFound = null;
                opSnap.forEach(d => uidFound = d.id);
                
                // Búsqueda de Vehículos por Placas/Target
                const qVeh = query(collection(db, "flotilla_b2b", tenantId, "vehiculos"), where("placas", "==", change.target));
                const vehSnap = await getDocs(qVeh);
                const vehRefs = [];
                vehSnap.forEach(d => vehRefs.push(d.ref));

                // Fallback de identidad seguro
                const uidSeguro = uidFound || change.payload?.uid || "UID_FALLBACK_SYSTEM";

                resolvedDataMap.set(change.target, { uid: uidSeguro, vehRefs });
                emitirPulsoHUD(opId, "PRE_RESOLVE", "RESOLVED", `Target: ${change.target}`);
            }
        }

        /**
         * 🔒 FASE 2: COMMIT ATÓMICO (TRANSACCIÓN DETERMINISTA)
         * Se ejecuta como un bloque único. El buffer local asegura resultados limpios.
         */
        await runTransaction(db, async (transaction) => {
            
            // Buffer local para esta ejecución (evita duplicados en retries de Firestore)
            const retryBuffer = [];

            for (const change of safeChanges) {
                const { type, target, payload, reason } = change;
                
                // --- GENERACIÓN DE HUELLA FORENSE (LEDGER) ---
                // doc(collection()) genera un ID único in-memory, garantizando inmutabilidad.
                const ledgerRef = doc(collection(db, "tenants", tenantId, "gestia_ledger"));
                
                transaction.set(ledgerRef, {
                    op_id: opId,
                    type,
                    target,
                    ejecutado_por: ejecutado_por || "system_auto",
                    timestamp: serverTimestamp(),
                    reason: reason || "SIA7_VERIFIED_EXECUTION",
                    metadata: { engine: "V16.1-INDESTRUCTIBLE" }
                });

                emitirPulsoHUD(opId, "WRITE", `PROCESSING:${type}`, target);



                // --- LÓGICA DE MUTACIÓN ---
                switch (type) {

                    /* =====================================================
                        ✅ INYECCIÓN PARA ANÁLISIS DE UI (SIA7)
                    ===================================================== */
                    case "ANALYZE":
                    case "ANALYZE_UI":
                        retryBuffer.push({
                            type,
                            target,
                            status: "analyzed_success",
                            result: payload || "analysis_completed"
                        });
                        break;

                    // ✅ PROTOCOLO DE CONSTRUCCIÓN: CREAR/ACTUALIZAR MÓDULOS
                    case "CREATE_MODULE":
                    case "CREAR_MODULO":
                        const modRef = doc(db, "gestia_system_modules", target || "auto_gen");
                        transaction.set(modRef, deepSanitize({
                            ...payload,
                            created_at: serverTimestamp(),
                            status: "active",
                            op_origin: opId
                        }));
                        retryBuffer.push({ type, target, status: "created" });
                        break;

                    case "PATCH_SYSTEM_CORE":
                    case "REPARAR_CORE":
                        const coreRef = doc(db, "gestia_system_config", target || "terminal_v1");
                        transaction.set(coreRef, deepSanitize({
                            ...payload,
                            patched_at: serverTimestamp(),
                            patch_op: opId,
                            status: "stabilized"
                        }), { merge: true });
                        retryBuffer.push({ type, target, status: "core_patched" });
                        break;

                    case "NORMALIZE_VEHICLE_OPERATOR":
                    case "NORMALIZE_IDENTITY":
                        const resolved = resolvedDataMap.get(target);
                        if (resolved && resolved.vehRefs.length > 0) {
                            resolved.vehRefs.forEach(vRef => {
                                transaction.update(vRef, {
                                    operador_uid: resolved.uid,
                                    assigned_to: resolved.uid,
                                    normalized_at: serverTimestamp(),
                                    status_enlace: "verificado",
                                    audit_op: opId,
                                    last_payload: deepSanitize(payload)
                                });
                            });
                            retryBuffer.push({ type, target, status: "success", affected: resolved.vehRefs.length });
                        } else {
                            retryBuffer.push({ type, target, status: "not_found" });
                        }
                        break;

                    case "REPAIR_RUNTIME_LINK":
                        const opDocRef = doc(db, "gestia_operations", opId);
                        transaction.update(opDocRef, deepSanitize({
                            runtime_repaired: true,
                            repaired_component: target,
                            repair_timestamp: serverTimestamp(),
                            repair_payload: payload
                        }));
                        retryBuffer.push({ type, target, status: "repaired" });
                        break;

                    case "SYSTEM_RESTRICTION":
                        const tenantRef = doc(db, "tenants", tenantId);
                        transaction.update(tenantRef, deepSanitize({
                            shield_level: payload?.severity === "CRITICAL" ? "READ_ONLY" : "WARNING",
                            restriction_active: true,
                            restricted_at: serverTimestamp(),
                            restriction_reason: reason || "Auto-protection protocol triggered"
                        }));
                        retryBuffer.push({ type, target, status: "restricted" });
                        break;

                    case "FORCE_MAINTENANCE_TASK":
                        const newTaskRef = doc(collection(db, "tenants", tenantId, "tasks"));
                        transaction.set(newTaskRef, deepSanitize({
                            ...payload,
                            created_by: ejecutado_por || "system_auto",
                            source: "SIA7_AUTO_PLANNER",
                            op_id: opId,
                            timestamp: serverTimestamp(),
                            status: "pending",
                            priority: payload?.priority || "high"
                        }));
                        retryBuffer.push({ type, target, status: "task_created" });
                        break;

                    case "LOCK_TECHNICIAN":
                    case "LOCK_RESOURCE":
                        const techRef = doc(db, "tenants", tenantId, "technicians", target);
                        transaction.update(techRef, {
                            status: "safety_lock",
                            lock_timestamp: serverTimestamp(),
                            lock_reason: reason || "SIA7_SECURITY_LOCK"
                        });
                        retryBuffer.push({ type, target, status: "locked" });
                        break;

                        /* =====================================================
   ANALYZE FILE HYDRATION
===================================================== */

case "ANALYZE":
case "ANALYZE_UI":

    try {

        const fileName =

            payload?.target ||
            target ||
            payload?.file;

        const loaded =

            await window.loadRepoContext(
                fileName
            );

        retryBuffer.push({

            type,

            target: fileName,

            status:

                loaded?.ok
                    ? "analysis_loaded"
                    : "analysis_failed",

            sourceSize:

                loaded?.source?.length || 0,

            result:

                loaded?.ok
                    ? loaded.source
                    : loaded?.error
        });

        console.log(
            "🧠 [ANALYZE_SOURCE_LOADED]",
            fileName,
            loaded?.source?.length || 0
        );

    }

    catch(err) {

        console.error(
            "🚨 [ANALYZE_FAIL]",
            err
        );

        retryBuffer.push({

            type,

            target,

            status:
                "analysis_error",

            error:
                err.message
        });
    }

    break;

                    case "DATA_ANALYSIS":
                        retryBuffer.push({
                            type,
                            target,
                            status: "analyzed",
                            result: payload || "analysis_completed"
                        });
                        break;

                    case "SYSTEM_STATUS":
                        retryBuffer.push({
                            type,
                            target,
                            status: "analyzed",
                            result: payload || {}
                        });
                        break;


                        /* =====================================================
   ANALYZE / ANALYZE_UI CONSUMER
===================================================== */
case "ANALYZE":
case "ANALYZE_UI":

    retryBuffer.push({
        type,
        target,
        status: "analyzed",
        result:
            payload?.report ||
            payload ||
            "analysis_completed"
    });

    break;
                    /* =====================================================
                        🔥 NUEVO: INYECCIÓN DIRECTA PARA CODE SURGEON (UPDATE)
                    ===================================================== */
                    case "UPDATE":
                        if (target.includes('.js') || target.includes('.html') || target.includes('.css')) {
                            
                            window.JARVIS_SANDBOX_FILES ||= {};
                            let prevContent = window.JARVIS_SANDBOX_FILES[target]?.content || "// Archivo original";
                            let newContent = payload?.content;

                            // Si es una orden de optimización visual de UI, inyectamos el parche dinámico en runtime
                            if (!newContent && payload?.action === "UI_OPTIMIZATION") {
                                newContent = prevContent + "\n\n/* 🔥 INYECCIÓN JARVIS CODE SURGEON V16.1 */\n(function applyUIPatch() {\n  const style = document.createElement('style');\n  style.innerHTML = `\n    /* Compactando tarjetas y padding móvil (Modo Tacaño) */\n    .tarjeta, .card, [class*='card'] { padding: 8px !important; margin-bottom: 8px !important; }\n    .contenedor, .container, [class*='container'] { padding-left: 4px !important; padding-right: 4px !important; }\n    h1, h2, h3 { font-size: clamp(1rem, 4vw, 1.2rem) !important; }\n    button, .btn { min-height: 44px !important; margin-top: 4px !important; }\n  `;\n  document.head.appendChild(style);\n  console.log('🦾 [JARVIS SURGEON]: UI_OPTIMIZATION Parche CSS inyectado en runtime exitosamente.');\n})();\n";
                            }

                            // 1. Mutamos la memoria hidratada
                            window.JARVIS_SANDBOX_FILES[target] = {
                                content: newContent || prevContent,
                                updatedAt: Date.now(),
                                opId
                            };

                            // 2. Persistimos en la colección de repo para hidrataciones futuras
                            transaction.set(
                                doc(collection(db, "repo_files")), 
                                deepSanitize({
                                    file: target,
                                    content: newContent || prevContent,
                                    updated_at: serverTimestamp(),
                                    updated_by: ejecutado_por || "jarvis_surgeon",
                                    op_id: opId,
                                    tenantId: tenantId,
                                    status: "patched_update"
                                })
                            );

                            retryBuffer.push({ type, target, status: "file_updated" });
                            emitirPulsoHUD(opId, "WRITE", "UPDATE_FILE_SUCCESS", target);
                            console.log(`🦾 [JARVIS_EXEC]: Archivo ${target} parcheado correctamente en sandbox.`);
                        } else {
                            retryBuffer.push({ type, target, status: "ignored_non_file_update" });
                        }
                        break;

                    case "CODE_WRITE":

    /* =====================================================
       SANDBOX RUNTIME MIRROR
    ===================================================== */

    try {

        const sandboxRuntimeFile =
            payload?.file ||
            `auto_${Date.now()}.js`;

            /* =====================================================
   AUTHORITY WRITE TRACE
===================================================== */

try {

    window.GestiaAuthority
        ?.registerMutation?.({

        module:
            "execution.hub",

        path:

            `repo.write:${
                payload?.file ||
                "unknown"
            }`,

        previous:
            null,

        value: {

            file:
                payload?.file,

            operation:
                "CODE_WRITE"
        }
    });

}

catch(traceError) {

    console.warn(
        "⚠️ [AUTHORITY_CODE_WRITE_TRACE_FAIL]",
        traceError
    );
}   
     
     /* =====================================================
   SAFE ZONE VALIDATION
===================================================== */

try {

    const safeCheck =

        window.GestiaOS
            ?.repo
            ?.isSafeRepoPath?.(

                payload?.file || ""
            );

    console.log(

        "🛡️ [SAFE_ZONE_CHECK]",

        

        {
            

            file:
                payload?.file,

            safe:
                safeCheck
        }
    );

    /* =====================================================
   PASSIVE GOVERNANCE WARNING
===================================================== */

if (safeCheck === false) {

    console.warn(

        "⚠️ [GOVERNANCE_WARNING]",

        {

            file:
                payload?.file,

            operation:
                "CODE_WRITE",

            enforcement:
                "PASSIVE_ONLY"
        }
    );

    window.GestiaAuthority
        ?.registerMutation?.({

        module:
            "execution.hub",

        path:

            `repo.governance.warning:${
                payload?.file ||
                "unknown"
            }`,

        previous:
            null,

        value: {

            file:
                payload?.file,

            operation:
                "CODE_WRITE",

            mode:
                "PASSIVE_ONLY"
        }
    });
}

    window.GestiaAuthority
        ?.registerMutation?.({

        module:
            "execution.hub",

        path:

            `repo.safezone:${
                payload?.file ||
                "unknown"
            }`,

        previous:
            null,

        value: {

            file:
                payload?.file,

            safe:
                safeCheck
        }
    });

}

catch(safeError) {

    console.warn(
        "⚠️ [SAFE_ZONE_CHECK_FAIL]",
        safeError
    );
}

        window.JARVIS_SANDBOX_FILES ||= {};

        window.JARVIS_SANDBOX_FILES[
            sandboxRuntimeFile
        ] = {
            content:
                payload?.content ||
                "// generated by jarvis",

            updatedAt: Date.now(),
            opId
        };

        console.log(
            "🧠 [SANDBOX_MIRROR]:",
            sandboxRuntimeFile
        );

    } catch (mirrorErr) {

        console.warn(
            "⚠️ SANDBOX_MIRROR_FAIL:",
            mirrorErr
        );
    }

    transaction.set(

        doc(
            collection(db, "repo_files")
        ),

        deepSanitize({

            file:
                payload?.file ||
                `auto_${Date.now()}.js`,

            content:
                payload?.content ||
                "// archivo generado por jarvis",

            created_at:
                serverTimestamp(),

            created_by:
                ejecutado_por ||
                "jarvis_ai",

            op_id:
                opId,

            tenantId:
                tenantId,

            status:
                "active"
        })
    );

    retryBuffer.push({

        type,

        target:
            payload?.file ||
            `auto_${Date.now()}.js`,

        status:
            "file_created"
    });

    emitirPulsoHUD(
        opId,
        "WRITE",
        "CODE_WRITE",
        payload?.file || "auto_file"
    );

    break;


    

                    default:
                        // No lanzamos error para permitir que el resto de la ráfaga continúe
                        retryBuffer.push({ type, target, status: "ignored_type" });
                }
            }

            // --- SELLADO MAESTRO (IDEMPOTENCY SEAL) ---
            transaction.set(masterOpRef, {
                status: "completed",
                completed_at: serverTimestamp(),
                affected_actions: retryBuffer.length,
                engine_metadata: {
                    version: "16.1.1",
                    results_summary: retryBuffer.map(r => `${r.type}:${r.status}`)
                }
            }, { merge: true });

            // Al final de la transacción exitosa, volcamos el buffer al array externo
            finalResults.length = 0; 
            finalResults.push(...retryBuffer);
        });

        const latency = Date.now() - startTime;
        emitirPulsoHUD(opId, "DONE", "SUCCESSFUL_COMMIT", `${finalResults.length} acciones atómicas en ${latency}ms`);
        return finalResults;

    } catch (error) {
        emitirPulsoHUD(opId, "CRASH", "FAILED", error.message);
        console.error("❌ SIA7_EXECUTOR_CRASH:", error);
        
        // Registro forense del error (Best effort)
        try {
            await updateDoc(doc(db, "gestia_operations", opId), {
                status: "failed",
                error_log: error.message,
                failed_at: serverTimestamp()
            });
        } catch (auditError) {
            console.error("🚨 Ledger Audit Failure:", auditError);
        }

        throw error;
    }
}

/**
 * getOperationHistory: Recupera la trazabilidad de la sesión desde el HUD.
 */
export async function consultarEstadoOperacion(opId) {
    const snap = await getDoc(doc(db, "gestia_operations", opId));
    return snap.exists() ? snap.data() : null;
}

// Log Corporativo para el Arquitecto Heberto
console.log("%c🦾 [OPERATIONS_EXECUTOR]: V16.1.1 INDESTRUCTIBLE LEDGER ONLINE", "color: #f59e0b; font-weight: bold; background: #451a03; padding: 2px 10px; border-radius: 4px;");


/**
 * ======================================================================================
 * 🧠 EXECUTION FABRIC NORMALIZER
 * Canonicaliza operation lineage entre runtimes híbridos
 * ======================================================================================
 */

function normalizeOperationContext(input = {}) {

    const operation_id =

        input?.operation_id ||

        input?.analysis_id ||

        input?.opId ||

        input?.metadata?.operation_id ||

        input?.metadata?.analysis_id ||

        crypto.randomUUID();

    return {

        ...input,

        operation_id,

        analysis_id:
            input?.analysis_id ||
            operation_id,

        metadata: {

            ...(input?.metadata || {}),

            operation_id,

            analysis_id:
                input?.analysis_id ||
                operation_id
        }
    };
}
/**
 * ======================================================================================
 * 🧠 HYBRID COGNITIVE EXECUTION BRIDGE V17
 * Cognitive Runtime → Transactional Executor Fabric
 * ======================================================================================
 */

export async function executeSteps(

    steps = [],
    context = {},
    input = {}

) {

    console.group(
        "🧠 [HYBRID_EXECUTION_BRIDGE]"
    );

    console.log(
        "🚀 EXECUTE_STEPS_CALLED"
    );

    /* ================================================================================
       VALIDATION
    ================================================================================ */

    if (

        !Array.isArray(steps) ||

        !steps.length

    ) {

        console.warn(
            "⚠️ [EXECUTION_EMPTY]"
        );

        console.groupEnd();

        return {

            status:
                "empty",

            changes:
                0
        };
    }

    /* ================================================================================
       EXECUTION IDS
    ================================================================================ */

    const normalizedContext =

    normalizeOperationContext(
        input
    );

const operationId =

    normalizedContext
        .operation_id;
    /* ================================================================================
       FIRESTORE RUNTIME COGNITION
    ================================================================================ */

    try {


        console.log(
    "🧠 [EXECUTOR_FIRST_STEP]",
    JSON.parse(
        JSON.stringify(
            steps?.[0] || {}
        )
    )
);

          console.log(
    "🧠 [FIRST_STEP_RAW]",
    JSON.stringify(
        steps?.[0],
        null,
        2
    )
);
        const detectedModules =
            new Set();

        steps.forEach(step => {

            console.log(
        "🧠 [STEP_ITERATION]",
        JSON.stringify(
            step,
            null,
            2
        )
    );

            /* =========================================================================
               EXPLICIT MODULES
            ========================================================================= */

            if (

                step?.module

            ) {

                detectedModules.add(
                    step.module
                );
            }

            /* =========================================================================
   REPO COGNITION BRIDGE
======================================================================== */


/* =========================================================================
   REHYDRATE REPO COGNITION
======================================================================== */

if (

    !step?.meta?.repoNode &&

    step?.payload?.originalPrompt

) {

    try {

        const promptData =

            JSON.parse(
                step.payload.originalPrompt
            );

        if (

            promptData?.cognition?.repoNode

        ) {

            step.meta = {

                ...(step.meta || {}),

                repoAware:
                    promptData.cognition.repoAware,

                repoNode:
                    promptData.cognition.repoNode
            };

            console.log(

                "🧠 [REPO_REHYDRATED]",

                promptData.cognition.repoNode.file

            );

           if (
    step?.meta?.repoNode?.file
) {

    window.loadRepoContext(
        step.meta.repoNode.file
    )
    .then(loaded => {

        if (loaded?.ok) {

            step.meta.source =
                loaded.source;

            console.log(
                "🧠 [SOURCE_HYDRATED]",
                loaded.file,
                loaded.source.length
            );
        }

    })
    .catch(err => {

        console.error(
            "🚨 [SOURCE_HYDRATE_FAIL]",
            err
        );

    });

}
}
    }
    

    catch(err) {

        console.warn(

            "⚠️ [REPO_REHYDRATE_FAIL]",

            err

        );
    }
}


if (

    step?.meta?.repoNode?.module

) {

    detectedModules.add(

        step.meta.repoNode.module

    );

    console.log(

        "🧠 [REPO_MODULE_DETECTED]",

        step.meta.repoNode.module,

        step.meta.repoNode.file

    );
}

            /* =========================================================================
               RUNTIME INFERENCE
            ========================================================================= */

            const target =

    JSON.stringify(
        step?.target || {}
    )

    .toLowerCase();
            if (

                target.includes("b2b")

            ) {

                detectedModules.add(
                    "seguridad_accesos_b2b"
                );
            }

            if (

                target.includes("dashboard") ||

                target.includes("panel")

            ) {

                detectedModules.add(
                    "dashboard_runtime"
                );
            }
        });

        /* ============================================================================
           COGNITIVE MODULE LOAD
        ============================================================================ */

        for (

            const mod of detectedModules

        ) {

            try {

                const loadResult =

                    await window
                        ?.loadFirestoreModule?.(
                            mod
                        );

                console.log(
                    "🧠 [MODULE_LOAD_RESULT]",
                    mod,
                    loadResult
                );

            }

            catch(loadErr) {

                console.warn(
                    "⚠️ [MODULE_LOAD_FAIL]",
                    mod,
                    loadErr
                );
            }
        }

        console.log(
            "🧠 [MODULE_CONTEXT_READY]",
            Array.from(
                detectedModules
            )
        );

    }

    catch(modErr) {

        console.warn(
            "⚠️ [MODULE_COGNITION_FAIL]",
            modErr
        );
    }

    /* ================================================================================
       NORMALIZED EXECUTION PROPOSAL
    ================================================================================ */


    console.log(
    "🧪 PRE_PROPOSAL_SOURCE",
    !!step?.meta?.source,
    step?.meta?.source?.length
); 

    const proposal = {

        operation_id:
            operationId,

        analysis_id:
            operationId,

        tenantId:
            context?.tenantId || "default",

        ejecutado_por:
            context?.userId || "jarvis_ai",

        cognition:
            "HYBRID_V17",

        runtime:
            "COGNITIVE_OS",

        createdAt:
            Date.now(),

        metadata: {

            operation_id:
                operationId,

            analysis_id:
                operationId,

            source:
                "executeSteps",

            executor:
                "operations-executor.engine.js",

            cognition:
                "HYBRID_V17",

            runtime:
                "COGNITIVE_OS"
        },


        /* ============================================================================
           STEP NORMALIZATION
        ============================================================================ */

        changes:

            (steps || [])

            .map(step => {

                const stepId =

                    step?.id ||

                    crypto.randomUUID();

                /* ====================================================================
                   CODE WRITE PIPELINE
                ==================================================================== */

                if (

                    step?.type ===
                    "CODE_WRITE"

                ) {

                    return {

                        id:
                            stepId,

                        operation_id:
                            operationId,

                        type:
                            "CODE_WRITE",

                        target:

                            step?.payload?.file ||

                            "repo",

                        payload:
                            step?.payload || {},

                        priority:
                            step?.priority || "HIGH",

                        cognition: {

                            layer:
                                "code_generation",

                            reasoning:
                                "autonomous_patch"
                        },

                        reason:
                            "AI_CODE_WRITE"
                    };
                }

                console.log(
    "🧪 PRE_PROPOSAL_SOURCE",
    !!step?.meta?.source,
    step?.meta?.source?.length
);


                /* ====================================================================
                   LEGACY EXECUTION MAPPING
                ==================================================================== */

                const mappedType =

    step?.type ||

    step?.action ||

    "ANALYZE";

                return {

                    id:
                        stepId,

                    operation_id:
                        operationId,

                    type:
                        mappedType,

                    target:

                        step?.target?.docId ||

                        step?.target?.collection ||

                        step?.target ||

                        "system_resource",

                    
payload: {

    ...(step?.payload || {}),

    originalPrompt:

        step?.payload?.originalPrompt ||

        step?.meta?.originalPrompt ||

        null
},


                    priority:
                        step?.priority || "NORMAL",

                        meta: {

    ...(step?.meta || {}),

    repoAware:
        step?.meta?.repoAware || false,

    repoNode:
        step?.meta?.repoNode || null,

    originalType:
        step?.originalType ||
        step?.meta?.originalType ||
        null
},

                    cognition: {

                        layer:
                            "execution",

                        reasoning:
                            "hybrid_cognitive_execution"
                    },

                    reason:
                        "AI_PLAN_EXECUTION"
                };
            })
    };

    /* ================================================================================
       TELEMETRY
    ================================================================================ */

    console.log(
        "🧠 [EXECUTION_OPERATION]",
        proposal.operation_id
    );

    console.log(
        "🧠 [EXECUTION_CHANGES]",
        proposal.changes.length
    );


    console.log(
    "🧪 PROPOSAL_CREATED",
    proposal
);

    console.log(
    "🧪 PROPOSAL_HAS_SOURCE",
    JSON.stringify(proposal)
        .includes("DOCTYPE html")
);

    console.log(
        "🧠 [EXECUTION_PROPOSAL]",
        proposal
    );

    /* ================================================================================
       EXECUTION
    ================================================================================ */

    let result = null;

    try {

        result =

            await ejecutarCambios(
                proposal
            );

    }

    catch(err) {

        console.error(
            "🚨 [EXECUTION_BRIDGE_FAIL]",
            err
        );

        console.groupEnd();

        return {

            status:
                "error",

            operation_id:
                operationId,

            analysis_id:
                operationId,

            error:
                err?.message ||

                "EXECUTION_FAIL",

            proposal
        };
    }

    /* ================================================================================
       HUD TELEMETRY
    ================================================================================ */

    try {

        const lastChange =

            proposal.changes[
                proposal.changes.length - 1
            ];

        window.dispatchEvent(

            new CustomEvent(

                "gestia-terminal-state",

                {

                    detail: {

                        type:
                            "SYSTEM_STATUS",

                        data: {

                            operation_id:
                                operationId,

                            operations:

                                proposal
                                    .changes
                                    ?.length || 0,

                            lastOperation:

                                lastChange?.type ||

                                "COMPLETED",

                            timestamp:
                                Date.now(),

                            history:

                                proposal
                                    .changes
                                    .map(c => ({

                                        type:
                                            c.type,

                                        target:
                                            c.target
                                    }))
                        }
                    }
                }
            )
        );

        console.log(
            "📡 [EXECUTION_TELEMETRY_OK]",
            proposal.changes?.length
        );

    }

    catch(e) {

        console.warn(
            "⚠️ [EXECUTION_TELEMETRY_FAIL]",
            e
        );
    }

    console.groupEnd();

    
/* ================================================================================
   EXECUTION FINDINGS SYNTHESIS
================================================================================ */

const issues = [];

try {

    for (const change of proposal.changes || []) {

        

const target = JSON.stringify({

    target:
        change?.target,

    payload:
        change?.payload,

    originalPrompt:

        change?.payload?.originalPrompt ||

        change?.meta?.originalPrompt ||

        "",

    reason:
        change?.reason,

    type:
        change?.type

}).toLowerCase();




        /* =========================================================
           UI LAYOUT FINDINGS
        ========================================================= */

        if (

            target.includes("tecnico") ||

            target.includes("html")

        ) {

            issues.push({

                type:
                    "UI_LAYOUT",

                severity:
                    "MEDIUM",

                title:
                    "Posible sobredimensión visual detectada",

                impact:
                    "Desbordamiento móvil o tarjetas excesivas",

                recommendation:
                    "Revisar grid, width fijo y padding responsive"
            });
        }

        /* =========================================================
           PERFORMANCE
        ========================================================= */

        if (

            target.includes("firebase")

        ) {

            issues.push({

                type:
                    "PERFORMANCE",

                severity:
                    "LOW",

                title:
                    "Operación relacionada con servicios cloud",

                impact:
                    "Posible latencia de sincronización",

                recommendation:
                    "Validar tiempos de respuesta y caché"
            });
        }
    }

}

catch(err) {

    console.warn(
        "⚠️ [FINDINGS_SYNTH_FAIL]",
        err
    );
}



    /* ================================================================================
       NORMALIZED RETURN
    ================================================================================ */

    
return {

    status:
        "success",

    operation_id:
        operationId,

    analysis_id:
        operationId,

    proposal,

    issues,

    result
};
}


/* =====================================================
   GLOBAL JARVIS EXECUTION FABRIC
===================================================== */

window.Jarvis ||= {};

window.Jarvis.executor ||= {};

window.Jarvis.executor.executeSteps =
    executeSteps;

window.Jarvis.executor.ejecutarCambios =
    ejecutarCambios;

window.Jarvis.executor.simularCambios =
    simularCambios;

console.log(
    "🧠 [GLOBAL_EXECUTION_FABRIC] ONLINE"
);

/* =====================================================
   JARVIS RUNTIME EXECUTION LINK V1
===================================================== */

if (

    window.GestiaRuntime

) {

    window.GestiaRuntime.executor =

        window.Jarvis.executor;

    console.log(

        "🧠 [RUNTIME_EXECUTOR_LINKED]"
    );
}