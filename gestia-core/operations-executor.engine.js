/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - OPERATIONS EXECUTOR ENGINE V26.1 (THE INDESTRUCTIBLE LEDGER)
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

import { auth, db } from '/firebase.js';
import {
    resolveJavaScriptSourceType,
    validateJavaScriptSyntax
} from "./syntax-validator.engine.js";
import { scanFile } from "./jarvis/jarvis.scanner.engine.js";
import { buildAutoFix } from "./jarvis/jarvis.autofix.engine.js";
import { buildAutoPatch } from "./jarvis/jarvis.autopatch.engine.js";
import { buildPatchDiff } from "./jarvis/jarvis.patchdiff.engine.js";
import {
    recordAutonomyEvent,
    recallAutonomyLessons
} from "./jarvis/jarvis.autonomy.engine.js";

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

function resolveStepRepoFile(step = {}) {
    return (
        step?.payload?.file ||
        step?.payload?.targetFile ||
        step?.targetFile ||
        step?.meta?.planner?.targetFile ||
        step?.meta?.jarvisIntent?.file ||
        step?.meta?.repoNode?.file ||
        (
            typeof step?.target === "string"
                ? step.target
                : null
        ) ||
        null
    );
}

async function hydrateStepRepoEvidence(step = {}) {
    const file =
        resolveStepRepoFile(step);

    if (!file || typeof window.loadRepoContext !== "function") {
        return step;
    }

    try {
        const loaded =
            await window.loadRepoContext(file);

        if (!loaded?.ok || typeof loaded.source !== "string") {
            recordAutonomyEvent({
                status:
                    "blocked",
                stage:
                    "source_preflight",
                operation:
                    step?.type ||
                    "unknown",
                file,
                reason:
                    loaded?.error ||
                    "SOURCE_NOT_AVAILABLE",
                context: {
                    planner:
                        step?.meta?.planner ||
                        null
                }
            });

            step.meta = {
                ...(step.meta || {}),
                sourceLoad: {
                    ok: false,
                    file,
                    error:
                        loaded?.error ||
                        "SOURCE_NOT_AVAILABLE"
                }
            };

            return step;
        }

        const report =
            scanFile(
                loaded.file || file,
                loaded.source
            );

        const autofix =
            buildAutoFix(report);

        const autopatch =
            buildAutoPatch(report);

        const patchdiff =
            buildPatchDiff(report);

        const autonomy =
            recallAutonomyLessons({
                file:
                    loaded.file || file,
                stage:
                    "preflight",
                operation:
                    step?.type ||
                    step?.originalType ||
                    "unknown",
                scan:
                    report,
                planner:
                    step?.meta?.planner ||
                    null
            });

        step.meta = {
            ...(step.meta || {}),
            repoEvidence: {
                ok: true,
                file:
                    loaded.file || file,
                sourceSize:
                    loaded.source.length,
                cached:
                    loaded.cached === true,
                report,
                autofix,
                autopatch,
                patchdiff,
                autonomy
            },
            source:
                loaded.source
        };

        step.payload = {
            ...(step.payload || {}),
            sourceSize:
                loaded.source.length,
            scannerReport:
                report,
            scannerSummary: {
                risk:
                    report.risk,
                flags:
                    report.flags || [],
                recommendations:
                    report.recommendations || [],
                lessons:
                    autonomy?.lessons || []
            }
        };

        console.log(
            "[JARVIS_PREFLIGHT_EVIDENCE]",
            {
                file:
                    loaded.file || file,
                risk:
                    report.risk,
                flags:
                    report.flags
            }
        );

        return step;
    } catch (err) {
        recordAutonomyEvent({
            status:
                "failed",
            stage:
                "repo_evidence_preflight",
            operation:
                step?.type ||
                "unknown",
            file,
            error:
                err,
            context: {
                planner:
                    step?.meta?.planner ||
                    null
            }
        });

        step.meta = {
            ...(step.meta || {}),
            sourceLoad: {
                ok: false,
                file,
                error:
                    err.message ||
                    "SOURCE_PREFLIGHT_FAIL"
            }
        };

        console.warn(
            "[JARVIS_PREFLIGHT_EVIDENCE_FAIL]",
            file,
            err
        );

        return step;
    }
}
 // ======================================================================================
// REPO COMMIT BRIDGE
// ======================================================================================

const REPO_COMMIT_WRITE_URL =
    "https://us-central1-fixgo-44e4d.cloudfunctions.net/repoCommitWriteFile";


async function writeRepoFile({
    file,
    content,
    operationId
}) {

    const currentUser =
        auth.currentUser;

    if (!currentUser) {

        const authError =
            new Error(
                "REPO_WRITE_AUTH_REQUIRED"
            );

        authError.code =
            "REPO_WRITE_AUTH_REQUIRED";

        authError.status =
            401;

        throw authError;
    }

    const idToken =
        await currentUser
            .getIdToken(
                true
            );

    const response =
        await fetch(
            REPO_COMMIT_WRITE_URL,
            {
                method:
                    "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Authorization":
                        `Bearer ${idToken}`
                },

                body:
                    JSON.stringify({
                        path:
                            file,

                        content,

                        message:
                            `Jarvis Executor ${operationId}`
                    })
            }
        );

    const responseText =
        await response.text();

    let result =
        {};

    try {

        result =
            responseText
                ? JSON.parse(
                    responseText
                )
                : {};

    } catch(parseError) {

        const responseError =
            new Error(
                `REPO_WRITE_INVALID_RESPONSE_HTTP_${response.status}`
            );

        responseError.code =
            "REPO_WRITE_INVALID_RESPONSE";

        responseError.status =
            response.status;

        responseError.responseText =
            responseText;

        throw responseError;
    }

    if (
        response.ok !== true ||
        result.success !== true
    ) {

        const writeError =
            new Error(
                result.message ||
                result.error ||
                `REPO_WRITE_HTTP_${response.status}`
            );

        writeError.code =
            result.error ||
            result.reason ||
            "REPO_WRITE_FAILED";

        writeError.status =
            response.status;

        writeError.details =
            result;

        throw writeError;
    }

    console.log(
        "🦾 [REPO_WRITE_SUCCESS]",
        result
    );

    return result;
}


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

let committedRepoWrites =
    [];



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
            
const retryBuffer =
    [];

const transactionRepoWrites =
    [];



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
                        ✅ INYECCIÓN PARA ANÁLISIS DE UI (SIA7) Y COGNICIÓN UNIVERSAL
                    ===================================================== */
                    case "ANALYSIS":
                    case "ANALYZE":

                    console.info(
    "🧠 [EXECUTOR_ANALYZE_ROUTE]",
    {
        route:
            "ANALYZE_CANONICAL",
        target,
        hasPayload:
            !!payload
    }
);
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
                        /* =====================================================
                       ✅ PROTOCOLO DE DUPLICACIÓN TÁCTICA (CLONE)
                    ===================================================== */
                    case "CLONE_FILE":
                        // Intentamos hidratar el origen primero
                        const sourceData = await window.loadRepoContext?.(target);
                        if (sourceData?.ok) {
                            const destRef = doc(collection(db, "repo_files")); // ID autogenerado para el clon
                            transaction.set(destRef, deepSanitize({
                                file: payload.destination,
                                content: sourceData.source,
                                cloned_from: target,
                                created_at: serverTimestamp(),
                                status: "active",
                                op_id: opId
                            }));
                            retryBuffer.push({ type, target: payload.destination, status: "cloned_success" });
                        } else {
                            retryBuffer.push({ type, target, status: "clone_failed_source_not_found" });
                        }
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
                    
                    case "SIA7_COMMIT": {

                        const commitTarget =
                            payload?.file ||
                            payload?.file_path ||
                            payload?.path ||
                            target;

                        if (
                            !commitTarget ||
                            typeof payload?.content !== "string"
                        ) {

                            throw new Error(
                                "SIA7_COMMIT_REQUIRES_FILE_AND_CONTENT"
                            );
                        }

                        const commitResult =
                            await writeRepoFile({
                                file:
                                    commitTarget,

                                content:
                                    payload.content,

                                operationId:
                                    opId
                            });

                        retryBuffer.push({
                            type,
                            target:
                                commitTarget,
                            status:
                                "committed_to_github",
                            commit:
                                commitResult?.commit ||
                                null,
                            secure:
                                true
                        });

                        emitirPulsoHUD(
                            opId,
                            "GIT",
                            "SUCCESS",
                            `Commit ejecutado: ${commitResult?.commit || "repoCommitWriteFile"}`
                        );

                        break;
                    }
                        /* =====================================================
   ANALYZE FILE HYDRATION
===================================================== */

case "ANALYZE_HYDRATED":

console.info(
    "🧠 [EXECUTOR_ANALYZE_ROUTE]",
    {
        route:
            "ANALYZE_HYDRATED_LEGACY",
        target,
        hasPayload:
            !!payload
    }
);
case "ANALYZE_UI":

    try {

        const fileName =

            payload?.target ||
            target ||
            payload?.file;

            console.log(
    "🧪 LOAD_REPO_CONTEXT_TYPE",
    file,
    typeof window.loadRepoContext
);

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
case "ANALYZE_RESULT":


console.info(
    "🧠 [EXECUTOR_ANALYZE_ROUTE]",
    {
        route:
            "ANALYZE_RESULT_LEGACY",
        target,
        hasPayload:
            !!payload
    }
);
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
                            

                            if (
    payload?.action === "UI_OPTIMIZATION" &&
    !payload?.content &&
    !payload?.patch
) {
    retryBuffer.push({
        type,
        target,
        status:
            "blocked",
        blocked:
            true,
        reason:
            "UNSAFE_GENERIC_UI_OPTIMIZATION",
        result: {
            blocked:
                true,
            message:
                "Se bloqueo UI_OPTIMIZATION generico. Jarvis no debe inyectar CSS universal sin diagnostico, search y replace exactos.",
            requiredFlow:
                [
                    "repo.read",
                    "repo.impact",
                    "repo.diagnose",
                    "repo.patchPreview",
                    "approval",
                    "CODE_WRITE"
                ]
        }
    });

    emitirPulsoHUD(
        opId,
        "WRITE",
        "BLOCKED",
        "UNSAFE_GENERIC_UI_OPTIMIZATION"
    );

    break;
}
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
                            const sandboxRuntimeFile = payload?.file || `auto_${Date.now()}.js`;
                            
                            // [Mantiene tu lógica original de Authority y Safe Zone intacta]
                            try {
                                window.GestiaAuthority?.registerMutation?.({
                                    module: "execution.hub",
                                    path: `repo.write:${payload?.file || "unknown"}`,
                                    previous: null,
                                    value: { file: payload?.file, operation: "CODE_WRITE" }
                                });
                            } catch(e) { console.warn("Authority trace fail", e); }   
                          
                            try {
                                const safeCheck = window.GestiaOS?.repo?.isSafeRepoPath?.(payload?.file || "");
                                window.GestiaAuthority?.registerMutation?.({
                                    module: "execution.hub",
                                    path: `repo.safezone:${payload?.file || "unknown"}`,
                                    previous: null,
                                    value: { file: payload?.file, safe: safeCheck }
                                });
                            } catch(e) { console.warn("Safe zone fail", e); }

                            window.JARVIS_SANDBOX_FILES ||= {};
                            window.JARVIS_SANDBOX_FILES[sandboxRuntimeFile] = {
                                content: payload?.content ?? null,
                                updatedAt: Date.now(),
                                opId
                            };
                        } catch (err) { console.warn("Sandbox mirror fail", err); }

                        /* =====================================================
                           SIA7 REPAIR PLANNER BRIDGE
                        ===================================================== */
                        if (payload?.repairIntent && payload?.repairContext && !payload?.content) {
                            try {
                                if (!payload?.content) {
                                    const patch = await window.buildRepairPatch(payload.repairContext);
                                    const generated = await window.generatePatch(patch);
                                    const applied = await window.applyPatch(generated);
                                    payload.analysis =
                                        generated?.ok === false
                                            ? generated
                                            : patch;
                                    payload.report =
                                        patch?.analysisResult ||
                                        generated?.reason ||
                                        generated?.error ||
                                        applied?.error ||
                                        null;
                                    payload.content = applied?.patched || null;
                                }
                            } catch(e) { console.error("SIA7 Repair fail", e); }
                        }

                        /* =====================================================
                           🔥 CORRECCIÓN RADICAL: BLOQUEO TOTAL DE ESCRITURA
                        ===================================================== */
                        // Si content es null, NI SIQUIERA intentamos tocar el repo ni la DB.
                        if (payload?.content === null || payload?.content === undefined) {
                            console.warn("🧠 [EXECUTOR]: Bloqueo preventivo: Contenido vacío. Saltando escritura.");
                            retryBuffer.push({
                                type,
                                target: payload.file,
                                status: "blocked",
                                blocked: true,
                                reason: payload?.analysis?.reason || "EMPTY_WRITE_CONTENT",
                                result: {
                                    blocked: true,
                                    reason: payload?.analysis?.reason || "EMPTY_WRITE_CONTENT",
                                    report:
                                        payload?.report ||
                                        "No se genero contenido ejecutable. Se bloqueo la escritura vacia.",
                                    analysis: payload?.analysis || null,
                                    originalIntent: payload?.originalIntent || null
                                }
                            });
                        } else {
                            // Solo si hay contenido REAL, procedemos a escribir.

               
/* =====================================================
   SIA7 PATCH APPLICATION + NO-OP GUARD
===================================================== */

let originalSource =
    null;

let nextContent =
    payload?.content;

const loadedForWrite =
    await window.loadRepoContext?.(
        payload.file
    );

if (
    loadedForWrite?.ok &&
    typeof loadedForWrite.source === "string"
) {
    originalSource =
        loadedForWrite.source;
}

/* =====================================================
   STRUCTURED PATCH APPLICATION
===================================================== */

if (
    nextContent &&
    typeof nextContent === "object" &&
    nextContent.ok === true &&
    typeof nextContent.search === "string" &&
    typeof nextContent.replace === "string"
) {

    if (!loadedForWrite?.ok) {

        throw new Error(
            "PATCH_SOURCE_LOAD_FAIL"
        );
    }

    const patchSearch =
        nextContent.search;

    const patchReplace =
        nextContent.replace;

    nextContent =
        loadedForWrite.source.replace(
            patchSearch,
            patchReplace
        );

    console.log(
        "🧠 [PATCH_APPLIED_TO_CONTENT]",
        {
            file:
                payload.file,

            originalLength:
                loadedForWrite.source.length,

            nextLength:
                nextContent.length
        }
    );
}
/* =====================================================
   UNSAFE GENERATED CONTENT GUARD
===================================================== */

const unsafeGeneratedContentPatterns =
    [
        {
            id:
                "RANDOM_FUNCTION_E",
            pattern:
                /function\s+e\s*\(\s*\)\s*\{\s*return\s*\{\s*ok\s*:\s*true,\s*timestamp\s*:\s*Date\.now\s*\(\s*\)/s,
            message:
                "Bloqueado: funcion generica function e() detectada."
        },
        {
            id:
                "GENERIC_UI_CARD_PATCH",
            pattern:
                /(\.tarjeta\s*,\s*\.card|\[class\*=['"]card['"]|Compactando tarjetas|UI_OPTIMIZATION|INYECCI[ÓO]N JARVIS CODE SURGEON)/i,
            message:
                "Bloqueado: parche UI generico detectado."
        },
        {
            id:
                "IMPORTANT_SPAM_PATCH",
            pattern:
                /!important[\s\S]{0,300}!important[\s\S]{0,300}!important/i,
            message:
                "Bloqueado: uso excesivo de !important en parche generado."
        }
    ];

const unsafeGeneratedContent =
    typeof nextContent === "string"
        ? unsafeGeneratedContentPatterns.find(item =>
            item.pattern.test(
                nextContent
            )
        )
        : null;

if (
    unsafeGeneratedContent
) {
    console.warn(
        "🛑 [UNSAFE_GENERATED_CONTENT_BLOCKED]",
        {
            file:
                payload.file,
            guard:
                unsafeGeneratedContent.id,
            message:
                unsafeGeneratedContent.message
        }
    );

    retryBuffer.push({
        type,
        target:
            payload.file,
        status:
            "blocked",
        blocked:
            true,
        reason:
            unsafeGeneratedContent.id,
        message:
            unsafeGeneratedContent.message,
        result: {
            blocked:
                true,
            guard:
                unsafeGeneratedContent.id,
            requiredFlow:
                [
                    "repo.read",
                    "repo.impact",
                    "repo.diagnose",
                    "repo.patchPreview con search/replace exactos",
                    "approval",
                    "syntax validation"
                ]
        }
    });

    emitirPulsoHUD(
        opId,
        "WRITE",
        "BLOCKED",
        unsafeGeneratedContent.id
    );

    break;
}
/* =====================================================
   CONTENT VALIDATION
===================================================== */

if (
    typeof nextContent !== "string"
) {

    throw new Error(
        "CONTENT_REQUIRED"
    );
}

/* =====================================================
   LINE ENDING NORMALIZATION
===================================================== */

const normalizeForComparison =
    value => String(value)
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

/* =====================================================
   NO-OP GUARD
===================================================== */

if (
    typeof originalSource === "string" &&
    normalizeForComparison(originalSource) ===
    normalizeForComparison(nextContent)
) {

    console.warn(
        "🛑 [NO_OP_GUARD]",
        {
            file:
                payload.file,

            reason:
                "NO_CONTENT_CHANGES",

            originalLength:
                originalSource.length,

            nextLength:
                nextContent.length
        }
    );

    retryBuffer.push({
        type,
        target:
            payload.file,

        status:
            "no_changes",

        reason:
            "ALREADY_REPAIRED"
    });

    emitirPulsoHUD?.(
        opId,
        "WRITE",
        "NO_CHANGES",
        payload.file
    );

    break;
}

/* =====================================================
   JAVASCRIPT SYNTAX VALIDATION
===================================================== */

const syntaxTargetResolution =
    resolveJavaScriptSourceType(
        payload.file
    );

const knownNonJavaScriptExtensions =
    new Set([
        ".html",
        ".css",
        ".json",
        ".txt",
        ".md",
        ".svg",
        ".xml"
    ]);

let syntaxValidationResult =
    null;

/*
 * Los archivos JavaScript soportados se validan con Acorn.
 * Las extensiones conocidas que no son JavaScript continúan
 * sin pasar por este parser.
 * Archivos sin extensión o con extensión desconocida se bloquean.
 */
if (
    syntaxTargetResolution.ok === true
) {

    syntaxValidationResult =
        validateJavaScriptSyntax({
            file:
                payload.file,

            content:
                nextContent
        });

} else if (
    !knownNonJavaScriptExtensions.has(
        syntaxTargetResolution.extension
    )
) {

    syntaxValidationResult = {
        ...syntaxTargetResolution,

        ok:
            false,

        status:
            syntaxTargetResolution.status ||
            "blocked",

        reason:
            syntaxTargetResolution.reason ||
            "AMBIGUOUS_FILE_EXTENSION",

        message:
            syntaxTargetResolution.message ||
            "No fue posible determinar un tipo de archivo seguro.",

        parser:
            "acorn",

        parserVersion:
            null,

        line:
            null,

        column:
            null,

        position:
            null
    };
}

/* =====================================================
   SYNTAX FAILURE — FAIL CLOSED
===================================================== */

if (
    syntaxValidationResult?.ok === false
) {

    console.error(
        "🛑 [SYNTAX_WRITE_BLOCKED]",
        syntaxValidationResult
    );

    retryBuffer.push({
        type,

        target:
            payload.file,

        status:
            syntaxValidationResult.status ||
            "blocked",

        reason:
            syntaxValidationResult.reason ||
            "SYNTAX_VALIDATION_FAILED",

        message:
            syntaxValidationResult.message ||
            "JavaScript syntax validation failed.",

        line:
            syntaxValidationResult.line ??
            null,

        column:
            syntaxValidationResult.column ??
            null,

        position:
            syntaxValidationResult.position ??
            null,

        parser:
            syntaxValidationResult.parser ||
            "acorn",

        parserVersion:
            syntaxValidationResult.parserVersion ||
            null
    });

    emitirPulsoHUD(
        opId,
        "SYNTAX_VALIDATION",
        "FAILED",
        `${payload.file} | ${
            syntaxValidationResult.message ||
            syntaxValidationResult.reason
        }`
    );

    break;
}

/* =====================================================
   SYNTAX SUCCESS
===================================================== */

if (
    syntaxValidationResult?.ok === true
) {

    console.log(
        "✅ [SYNTAX_VALIDATION_PASSED]",
        syntaxValidationResult
    );

    emitirPulsoHUD(
        opId,
        "SYNTAX_VALIDATION",
        "VALID",
        `${payload.file} | ${
            syntaxValidationResult.parser
        }@${
            syntaxValidationResult.parserVersion
        }`
    );
}

/* =====================================================
   REAL WRITE
===================================================== */


payload.content =
    nextContent;

const repoWriteResultIndex =
    retryBuffer.length;

retryBuffer.push({
    type,

    target:
        payload.file,

    status:
        "repo_write_pending"
});

transactionRepoWrites.push({
    resultIndex:
        repoWriteResultIndex,

    file:
        payload.file,

    content:
        payload.content,

    operationId:
        opId
});





                            transaction.set(doc(collection(db, "repo_files")), deepSanitize({
                                file: payload?.file || `auto_${Date.now()}.js`,
                                content: payload?.content,
                                created_at: serverTimestamp(),
                                created_by: ejecutado_por || "jarvis_ai",
                                op_id: opId,
                                tenantId: tenantId,
                                status: "active"
                            }));

                            emitirPulsoHUD(
    opId,
    "WRITE",
    "REPO_WRITE_QUEUED",
    payload?.file ||
    "auto_file"
);
                        }

                    break;
                    default:
                        // No lanzamos error para permitir que el resto de la ráfaga continúe
                        retryBuffer.push({ type, target, status: "ignored_type" });
                }
            }

            /* =====================================================
   EXTERNAL WRITE PLAN SNAPSHOT
===================================================== */

committedRepoWrites =
    transactionRepoWrites.map(
        repoWrite => ({
            ...repoWrite
        })
    );

/* =====================================================
   FIRESTORE COMMIT SEAL
===================================================== */

transaction.set(
    masterOpRef,
    {
        status:
            "firestore_committed",

        firestore_committed_at:
            serverTimestamp(),

        affected_actions:
            retryBuffer.length,

        external_writes_pending:
            transactionRepoWrites.length,

        engine_metadata: {
            version:
                "16.1.2",

            results_summary:
                retryBuffer.map(
                    result =>
                        `${result.type}:${result.status}`
                )
        }
    },
    {
        merge:
            true
    }
);

/* =====================================================
   TRANSACTION RESULT SNAPSHOT
===================================================== */

finalResults.length =
    0;

finalResults.push(
    ...retryBuffer
);
       });

/* =====================================================
   PHASE 3 — EXTERNAL REPO WRITES
===================================================== */

for (
    const repoWrite
    of committedRepoWrites
) {

    const repoResult =
        await writeRepoFile({
            file:
                repoWrite.file,

            content:
                repoWrite.content,

            operationId:
                repoWrite.operationId
        });

    const pendingResult =
        finalResults[
            repoWrite.resultIndex
        ];

    if (pendingResult) {

        finalResults[
            repoWrite.resultIndex
        ] = {
            ...pendingResult,

            status:
                "file_created",

            repo:
                repoResult.repo,

            commit:
                repoResult.commit,

            fileSha:
                repoResult.fileSha,

            created:
                repoResult.created,

            updated:
                repoResult.updated
        };
    }
}

/* =====================================================
   FINAL OPERATION SEAL
===================================================== */

await updateDoc(
    masterOpRef,
    {
        status:
            "completed",

        completed_at:
            serverTimestamp(),

        external_writes_pending:
            0,

        external_writes_completed:
            committedRepoWrites.length,

        engine_metadata: {
            version:
                "16.1.2",

            results_summary:
                finalResults.map(
                    result =>
                        `${result.type}:${result.status}`
                )
        }
    }
);

const latency = Date.now() - startTime;
        emitirPulsoHUD(opId, "DONE", "SUCCESSFUL_COMMIT", `${finalResults.length} acciones atómicas en ${latency}ms`);
        return finalResults;

    } catch (error) {
        emitirPulsoHUD(opId, "CRASH", "FAILED", error.message);
        console.error("❌ SIA7_EXECUTOR_CRASH:", error);

        recordAutonomyEvent({
            status:
                "failed",
            stage:
                "ejecutarCambios",
            operation:
                "transactional_execution",
            operationId:
                opId,
            error,
            context: {
                source:
                    "operations-executor.engine.js"
            }
        });
        
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

        const promptData = JSON.parse(
            step.payload.originalPrompt
        );

        const repoNode =
            promptData?.cognition?.repoNode;

        if (repoNode) {

            step.meta = {

                ...(step.meta || {}),

                repoAware:
                    !!promptData?.cognition?.repoAware,

                repoNode
            };

            console.log(

                "🧠 [REPO_REHYDRATED]",

                repoNode.file
            );

            /* =====================================================
               SOURCE REHYDRATION
            ===================================================== */

            if (repoNode.file) {

                window.loadRepoContext(
                    repoNode.file
                )
                .then(loaded => {

                    if (!loaded?.ok) {

                        console.warn(

                            "⚠️ [SOURCE_NOT_AVAILABLE]",

                            repoNode.file
                        );

                        return;
                    }

                    step.meta.source =
                        loaded.source;

                    console.log(

                        "🧠 [SOURCE_HYDRATED]",

                        loaded.file,

                        loaded.source?.length || 0
                    );

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

/* =====================================================
   MODULE DETECTION
===================================================== */

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


    const hydratedSteps =
        [];

    for (const step of steps || []) {
        hydratedSteps.push(
            await hydrateStepRepoEvidence(step)
        );
    }

    const executionSteps =
        hydratedSteps.length
            ? hydratedSteps
            : (steps || []);

   

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

            (executionSteps || [])

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

                        meta: {
                            ...(step?.meta || {}),
                            repoAware:
                                step?.meta?.repoAware ||
                                !!step?.meta?.repoEvidence,
                            repoEvidence:
                                step?.meta?.repoEvidence ||
                                null,
                            repoNode:
                                step?.meta?.repoNode ||
                                null,
                            originalType:
                                step?.originalType ||
                                step?.meta?.originalType ||
                                "CODE_WRITE"
                        },

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
    step?.payload?.target ||
    step?.payload?.file ||
    step?.target?.docId ||
    step?.target?.collection ||
    (
        typeof step?.target === "string"
            ? step.target
            : null
    ) ||
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
   SIA7 SOURCE FINDINGS ENGINE
========================================================= */

const source =
    change?.meta?.source || "";

console.log(
    "🧪 SOURCE_IN_FINDINGS",
    source.length
);

/* =========================================================
   OVERFLOW ANALYSIS
========================================================= */

if (

    /overflow-x\s*:\s*hidden/i.test(source)

) {

    issues.push({

        type:
            "UI_LAYOUT",

        severity:
            "HIGH",

        title:
            "Overflow horizontal oculto",

        impact:
            "Se detectó overflow-x:hidden dentro del código fuente.",

        recommendation:
            "Validar si el overflow está ocultando problemas reales de layout responsive."
    });
}

/* =========================================================
   RESPONSIVE WIDTH ANALYSIS
========================================================= */

if (

    /\bw-screen\b/i.test(source) ||

    /100vw/i.test(source)

) {

    issues.push({

        type:
            "RESPONSIVE_RISK",

        severity:
            "MEDIUM",

        title:
            "Ancho potencialmente riesgoso",

        impact:
            "Se detectó uso de w-screen o 100vw. Puede generar desbordamiento horizontal.",

        recommendation:
            "Evaluar reemplazo por w-full o layouts adaptativos."
    });
}

/* =========================================================
   DOM INJECTION ANALYSIS
========================================================= */

if (

    /\.innerHTML\s*=/i.test(source)

) {

    issues.push({

        type:
            "SECURITY",

        severity:
            "HIGH",

        title:
            "Manipulación directa del DOM",

        impact:
            "Se detectó uso de innerHTML dentro del módulo.",

        recommendation:
            "Validar sanitización de entradas y preferir textContent cuando sea posible."
    });
}

/* =========================================================
   TIMER ANALYSIS
========================================================= */

if (

    /setInterval\s*\(/i.test(source)

) {

    issues.push({

        type:
            "PERFORMANCE",

        severity:
            "MEDIUM",

        title:
            "Timer persistente detectado",

        impact:
            "Se encontró uso de setInterval dentro del módulo.",

        recommendation:
            "Validar limpieza y ciclo de vida del intervalo."
    });
}

/* =========================================================
   LARGE MODULE ANALYSIS
========================================================= */

if (

    source.length > 200000

) {

    issues.push({

        type:
            "ARCHITECTURE",

        severity:
            "LOW",

        title:
            "Módulo de gran tamaño",

        impact:
            `El archivo contiene ${source.length} caracteres.`,

        recommendation:
            "Evaluar particionado modular para mejorar mantenibilidad."
    });
}

/* =========================================================
   CLOUD ANALYSIS
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
            "Validar tiempos de respuesta, caché y reconexión."
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

const normalizedExecutionResults =
    Array.isArray(
        result
    )
        ? result
        : [];

const blockingResult =
    normalizedExecutionResults.find(item =>
        item?.status ===
            "syntax_error" ||

        item?.status ===
            "blocked" ||

        item?.reason ===
            "SYNTAX_VALIDATION_FAILED" ||

        item?.blocked ===
            true ||

        item?.result?.blocked ===
            true
    ) ||
    null;

const normalizedExecutionStatus =
    blockingResult
        ? "blocked"
        : "success";

recordAutonomyEvent({
    status:
        normalizedExecutionStatus,
    stage:
        "executeSteps",
    operation:
        proposal?.type ||
        proposal?.changes?.[0]?.type ||
        "hybrid_execution",
    operationId,
    error:
        blockingResult,
    reason:
        blockingResult?.reason ||
        blockingResult?.status ||
        null,
    context: {
        source:
            "operations-executor.engine.js",
        planner:
            proposal?.planner ||
            proposal?.changes?.[0]?.meta?.planner ||
            null
    }
});

return {

    status:
        normalizedExecutionStatus,

    blocked:
        !!blockingResult,

    reason:
        blockingResult?.reason ||
        null,

    blocking_result:
        blockingResult,

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
   JARVIS RUNTIME EXECUTION LINK V2
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

/* ============================================================
   JARVIS CANONICAL ONE-TIME WRITE GUARD
   Legacy executor writes must enter through the registered mission tools.
   ============================================================ */

(function initJarvisCanonicalWriteExecutorGuard() {
  if (window.__JARVIS_CANONICAL_WRITE_EXECUTOR_GUARD__) return;
  window.__JARVIS_CANONICAL_WRITE_EXECUTOR_GUARD__ = true;

  const oldExecute =
    window.operationsExecutor?.execute ||
    window.OperationsExecutor?.execute ||
    null;

  function isCodeWriteOperation(operation) {
    const type = String(operation?.type || operation?.tool || operation?.name || "").toUpperCase();

    return (
      type === "CODE_WRITE" ||
      type === "REPO_WRITE" ||
      type === "WRITE_FILE" ||
      type.includes("CODE_WRITE")
    );
  }

  function block(reason, operation) {
    return {
      ok: false,
      blocked: true,
      code: reason,
      operation,
      message: `[${reason}] Usa repo.prepareWrite, repo.authorizeWrite y repo.write dentro de la misma autoridad de misión.`,
      nextTools: ["repo.prepareWrite", "repo.authorizeWrite", "repo.write"]
    };
  }

  async function guardedExecute(operation = {}) {
    if (!isCodeWriteOperation(operation)) {
      if (oldExecute) return await oldExecute.call(this, operation);

      return {
        ok: false,
        blocked: true,
        code: "EXECUTOR_NOT_AVAILABLE",
        operation
      };
    }

    return block("CODE_WRITE_REQUIRES_CANONICAL_ONE_TIME_AUTHORITY", operation);
  }

  window.operationsExecutor = window.operationsExecutor || {};
  window.operationsExecutor.execute = guardedExecute;

  window.OperationsExecutor = window.OperationsExecutor || {};
  window.OperationsExecutor.execute = guardedExecute;
})();
