/* =====================================================================================
   RUNTIME REPAIR + HEALTH MODULE
   Cognitive layer map, runtime health, repair planning, recovery queue, repair telemetry.
===================================================================================== */

const RUNTIME_REPAIR_HEALTH_V2_VERSION =
    "2.0.0-runtime-repair-health";

window.RuntimeRepairHealthV2 = {
    version:
        RUNTIME_REPAIR_HEALTH_V2_VERSION,
    authority:
        "full_repo_private_owner",
    mode:
        "health_scan_repair_review",
    blockedAction:
        "REVIEW_REQUIRED_MODULE",
    describe() {
        return {
            ok: true,
            module:
                "runtime_repair_health",
            version:
                RUNTIME_REPAIR_HEALTH_V2_VERSION,
            health:
                window.__RUNTIME_HEALTH__ || null,
            queue:
                window.__RUNTIME_REPAIR_QUEUE__?.length || 0
        };
    }
};


function ensureRepoCognitionHydratedForRuntimeMaps() {
    try {
        const repoIndexTotal =
            Object.keys(window.__REPO_INDEX__ || {}).length;

        const cognitionTotal =
            Object.keys(window.__REPO_COGNITION__ || {}).length;

        if (
            repoIndexTotal > 0 &&
            cognitionTotal < repoIndexTotal &&
            typeof window.rehydrateRepoCognitionIndex === "function"
        ) {
            return window.rehydrateRepoCognitionIndex();
        }

        if (
            repoIndexTotal > 0 &&
            cognitionTotal < repoIndexTotal &&
            typeof window.buildRepoCognitionIndex === "function"
        ) {
            return window.buildRepoCognitionIndex();
        }

        return {
            ok: true,
            skipped: true,
            repoIndexTotal,
            cognitionTotal
        };
    }
    catch(error) {
        console.warn(
            "⚠️ [REPO_COGNITION_HYDRATION_GUARD_DEGRADED]",
            {
                reason:
                    error?.message || String(error)
            }
        );

        return {
            ok: false,
            degraded: true,
            error:
                error?.message || String(error)
        };
    }
}

/* =====================================================================================
   COGNITIVE LAYER MAPPER V2
===================================================================================== */

window.__COGNITIVE_LAYER_MAP__ = {};

window.buildCognitiveLayerMap =
function() {

    try {

        ensureRepoCognitionHydratedForRuntimeMaps();

        console.log(
            "🧠 [COGNITIVE_LAYER_MAPPING]"
        );

        const cognition =

            window
                .__REPO_COGNITION__ || {};

        const layerMap = {};

        Object.entries(
            cognition
        ).forEach(([file, meta]) => {

            layerMap[file] = {

                file,

                layer:

   file.includes("firewall") ||

    file.includes("auth") ||

    file.includes("security")

        ? "SECURITY"

    : file.includes("memory") ||

      file.includes("semantic") ||

      file.includes("intent") ||

      file.includes("brain")

        ? "COGNITION"

    : file.includes("operations") ||

  file.includes("plans") ||

  file.includes("executor") ||

  file.includes("bridge") ||

  file.includes("repair") ||

  file.includes("execution.hub")

    ? "EXECUTION"

    : file.includes("terminal") ||

      file.includes(".html") ||

      file.includes("hud")

        ? "RUNTIME_UI"

    : file.includes("firebase") ||

      file.includes("persistence")

        ? "PERSISTENCE"

    : "UNKNOWN",

role:
    meta.type || "UNKNOWN",

domain:

    file.includes("jarvis")

        ? "JARVIS_CORE"

    : file.includes("gestia-core")

        ? "GESTIA_CORE"

    : "RUNTIME"
            };
        });

        window.__COGNITIVE_LAYER_MAP__ =
            layerMap;

        console.log(
            "✅ [LAYER_MAP_READY]",
            Object.keys(layerMap).length
        );

        return {

            ok: true,

            total:
                Object.keys(
                    layerMap
                ).length,

            layers:
                layerMap
        };

    }

    catch(error) {

        console.error(
            "❌ [LAYER_MAP_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};

window.renderRuntimeBootTable ||= function(meta = {}) {
    const rows =
        Object.values(window.__RUNTIME_HEALTH_MAP__ || {})
            .map(node => ({
                file:
                    node.file || node.id || "unknown",
                status:
                    node.status || node.state || "UNKNOWN",
                health:
                    node.health ?? null,
                degraded:
                    node.degraded === true,
                isolated:
                    node.isolated === true,
                observed:
                    node.observed === true,
                evidenceSource:
                    node.evidenceSource || "unknown"
            }));

    const summary = {
        total:
            rows.length,
        online:
            rows.filter(row => row.status === "ONLINE").length,
        cataloged:
            rows.filter(row => row.status === "CATALOGED").length,
        degraded:
            rows.filter(row => row.degraded).length,
        isolated:
            rows.filter(row => row.isolated).length,
        ...meta
    };

    window.__RUNTIME_BOOT_TABLE__ = {
        rows,
        summary,
        updatedAt:
            Date.now()
    };

    if (window.__JARVIS_RUNTIME_HEALTH_DEBUG__ === true) {
        console.table(rows);
        console.log(
            "✅ [RUNTIME_BOOT_TABLE_READY]",
            summary
        );
    }

    return {
        ok: true,
        total:
            rows.length,
        rows,
        summary
    };
};

if (!window.__RUNTIME_BOOT_TABLE_EVENT_BOUND__) {
    window.__RUNTIME_BOOT_TABLE_EVENT_BOUND__ = true;

    const renderBootTableAfterSnapshot = function(event) {
        const detail =
            event?.detail || {};

        setTimeout(() => {
            window.renderRuntimeBootTable?.({
                source: "runtime_snapshot_created_event",
                snapshotId:
                    detail.snapshotId || null,
                runtimeStatus:
                    detail.runtimeStatus || null,
                runtimeHealth:
                    detail.runtimeHealth || null
            });
        }, 250);
    };

    window.addEventListener(
        "runtime.snapshot.created",
        renderBootTableAfterSnapshot
    );

    window.addEventListener(
        "runtime:watchdog:ok",
        function() {
            setTimeout(() => {
                window.renderRuntimeBootTable?.({
                    source: "runtime_watchdog_ok_fallback"
                });
            }, 500);
        }
    );
}


/* =====================================================================================
   RUNTIME HEALTH ENGINE V2
===================================================================================== */

window.__RUNTIME_HEALTH_MAP__ ||= {};

window.buildRuntimeHealthMap =
function() {

    try {

        ensureRepoCognitionHydratedForRuntimeMaps();

        console.log(
            "🩺 [RUNTIME_HEALTH_SCAN]"
        );

        const cognition =

            window
                .__REPO_COGNITION__ || {};

        const previousHealthMap =
            window.__RUNTIME_HEALTH_MAP__ || {};

        const loadedRegistry =
            window.MODULE_CONTEXT?.loaded ||
            window.__MODULE_CONTEXT__?.loaded ||
            {};

        const healthMap = {};

        const normalizeLoadEvidence = value => {
            if (value === true) {
                return { observed: true, status: "ONLINE" };
            }

            if (typeof value === "string") {
                const status = value.trim().toUpperCase();
                if (["ONLINE", "LOADED", "READY", "RUNNING"].includes(status)) {
                    return { observed: true, status: "ONLINE" };
                }
                if (["DEGRADED", "ISOLATED"].includes(status)) {
                    return { observed: true, status };
                }
                return null;
            }

            if (value && typeof value === "object") {
                const status = String(value.status || value.state || "").trim().toUpperCase();
                if (value.loaded === true || value.online === true || value.ready === true || value.running === true) {
                    return {
                        observed: true,
                        status: ["DEGRADED", "ISOLATED"].includes(status) ? status : "ONLINE"
                    };
                }
                if (["ONLINE", "LOADED", "READY", "RUNNING", "DEGRADED", "ISOLATED"].includes(status)) {
                    return {
                        observed: true,
                        status: ["DEGRADED", "ISOLATED"].includes(status) ? status : "ONLINE"
                    };
                }
            }

            return null;
        };

        Object.entries(
            cognition
        ).forEach(([file, meta]) => {

            const previous =
                previousHealthMap[file] || {};

            const candidates = [
                file,
                meta?.path,
                meta?.module
            ].filter(Boolean);

            let loadEvidence = null;
            for (const candidate of candidates) {
                loadEvidence = normalizeLoadEvidence(
                    loadedRegistry?.[candidate]
                );
                if (loadEvidence?.observed === true) break;
            }

            const observed =
                loadEvidence?.observed === true;

            healthMap[file] = {
                ...previous,
                file,
                status:
                    observed
                        ? loadEvidence.status
                        : "CATALOGED",
                health:
                    observed
                        ? (previous.health ?? 100)
                        : null,
                degraded:
                    observed && loadEvidence.status === "DEGRADED",
                isolated:
                    observed && loadEvidence.status === "ISOLATED",
                blocked:
                    previous.blocked === true,
                observed,
                evidenceSource:
                    observed
                        ? "runtime_loaded_registry"
                        : "repo_catalog_only",
                lastCheck:
                    Date.now()
            };
        });

        window.__RUNTIME_HEALTH_MAP__ =
            healthMap;

        console.log(
            "✅ [RUNTIME_HEALTH_READY]",
            Object.keys(
                healthMap
            ).length
        );

        return {

            ok: true,

            total:
                Object.keys(
                    healthMap
                ).length,

            runtime:
                healthMap
        };

    }

    catch(error) {

        console.error(
            "❌ [RUNTIME_HEALTH_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};

/* =====================================================================================
   REPAIR INTELLIGENCE ENGINE V2
===================================================================================== */

window.proposeRuntimeRepair =
function(fileName = "") {

    try {

        console.log(
            "🛠️ [REPAIR_ANALYSIS]",
            fileName
        );

        const health =

            window
                .__RUNTIME_HEALTH_MAP__?.[
                    fileName
                ];

        if (!health) {

            throw new Error(
                "RUNTIME_NODE_NOT_FOUND"
            );
        }

        const layer =

            window
                .__COGNITIVE_LAYER_MAP__?.[
                    fileName
                ]?.layer ||

            "UNKNOWN";

        const repairPlan = {

            file:
                fileName,

            layer,

            currentStatus:

    health.status ||

    health.state,

            currentHealth:
                health.health,

            strategy:
                "UNKNOWN",

            supervised:
                true,

            requiresIsolation:
                false,

            autoExecutable:
                false

                ,

            ok:
                true,

            module:
                fileName,

            executionMode:
                "CONTROLLED_RUNTIME_REPAIR",

            actions: []
        };

        /* =================================================
           LAYER STRATEGY
        ================================================= */

        if (
            layer === "RUNTIME_UI"
        ) {

            repairPlan.strategy =
                "SAFE_UI_RELOAD";

            repairPlan.autoExecutable =
                true;
        }

        if (
            layer === "COGNITION"
        ) {

            repairPlan.strategy =
                "SUPERVISED_COGNITION_REBUILD";

            repairPlan.requiresIsolation =
                true;
        }

        if (
            layer === "SECURITY"
        ) {

            repairPlan.strategy =
                "HARD_LOCK_SECURITY_AUDIT";

            repairPlan.requiresIsolation =
                true;
        }

        if (
            layer === "EXECUTION"
        ) {

            repairPlan.strategy =
                "CONTROLLED_EXECUTION_RESTART";



                /* =================================================
   HEALTH-BASED AUTONOMOUS DECISION
================================================= */

if (
    health.health < 50
) {

    repairPlan.strategy =
        "HARD_RUNTIME_RECOVERY";

    repairPlan.requiresIsolation =
        true;

    repairPlan.actions = [

        {

            step:
                1,

            type:
                "REVIEW_REQUIRED_MODULE",

            target:
                fileName
        },

        {

            step:
                2,

            type:
                "REBUILD_COGNITIVE_GRAPH",

            target:
                fileName
        },

        {

            step:
                3,

            type:
                "REVALIDATE_RUNTIME_GOVERNANCE",

            target:
                fileName
        }
    ];
}
            else {

    repairPlan.actions = [

    {

        step:
            1,

        type:
            "REBUILD_COGNITIVE_GRAPH",

        target:
            fileName
    },

    {

        step:
            2,

        type:
            "REVALIDATE_RUNTIME_GOVERNANCE",

        target:
            fileName
    }
];
}
        }

        console.log(
            "🧠 [REPAIR_PLAN_READY]",
            repairPlan
        );

        return {

            ok: true,

            repair:
                repairPlan
        };

    }

    catch(error) {

        console.error(
            "❌ [REPAIR_PLAN_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};


/* =====================================================================================
   RUNTIME RECOVERY ENGINE V2
===================================================================================== */

window.setRuntimeModuleState =
function(
    fileName = "",
    newState = "ONLINE"
) {

    try {

        console.log(
            "🩺 [RUNTIME_STATE_CHANGE]",
            fileName,
            newState
        );

        const node =

            window
                .__RUNTIME_HEALTH_MAP__?.[
                    fileName
                ];

        if (!node) {

            throw new Error(
                "RUNTIME_NODE_NOT_FOUND"
            );
        }

        node.status =
            newState;

        node.lastCheck =
            Date.now();

        /* =================================================
           DEGRADED
        ================================================= */

        if (
            newState ===
            "DEGRADED"
        ) {

            node.degraded =
                true;

            node.health =
                60;
        }

        /* =================================================
           ISOLATED
        ================================================= */

        if (
            newState ===
            "ISOLATED"
        ) {

            node.isolated =
                true;

            node.health =
                25;
        }

        /* =================================================
           RECOVERING
        ================================================= */

        if (
            newState ===
            "RECOVERING"
        ) {

            node.health =
                80;
        }

        /* =================================================
           ONLINE
        ================================================= */

        if (
            newState ===
            "ONLINE"
        ) {

            node.degraded =
                false;

            node.isolated =
                false;

            node.blocked =
                false;

            node.health =
                100;
        }

        console.log(
            "✅ [RUNTIME_STATE_UPDATED]",
            node
        );

        return {

            ok: true,

            runtime:
                node
        };

    }

    catch(error) {

        console.error(
            "❌ [RUNTIME_STATE_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};

/* =====================================================================================
   RUNTIME RECOVERY EXECUTOR V2
===================================================================================== */

window.executeRuntimeRecovery =
async function(fileName = "") {


    let repairId = null;
    let repairLockKey = null;

    try {

        console.log(
            "♻️ [RUNTIME_RECOVERY_START]",
            fileName
        );


        /* =====================================================================================
   RUNTIME REPAIR LOCK V2
===================================================================================== */

window.isRuntimeRepairActive =
function(

    fileName = ""

){

    try{

         const repairs =

            Array.from(

                window
                    .__MODULE_CONTEXT__
                    .activeRuntimeRepairs

            );

        return repairs.some((entry) => {

            try{

                const parsed =
                    JSON.parse(entry);

                return (
                    parsed.file ===
                    fileName
                );

            }

            catch{

                return false;

            }

        });

    }

    catch(error){

        console.error(
            "❌ [REPAIR_LOCK_CHECK_FAIL]",
            error
        );

        return false;

    }

};



/* =================================================
   REPAIR OWNER ID
================================================= */

        repairId =

    crypto.randomUUID();

        repairLockKey =

    JSON.stringify({

        file: fileName,

        repairId
    });

/* =================================================
   REGISTER ACTIVE REPAIR
================================================= */

window
    .__MODULE_CONTEXT__
    .activeRuntimeRepairs
    .add(repairLockKey);

console.log(
    "🧠 [REPAIR_LOCK_ACQUIRED]",
    fileName,
    repairId
);
        /* =================================================
           BUILD REPAIR PLAN
        ================================================= */

        const repair =

    await proposeRuntimeRepair(
        fileName
    );

        if (!repair?.ok) {

            throw new Error(
                repair?.error ||

                "REPAIR_PLAN_FAILED"
            );
        }

        const plan =
            repair.repair;

        /* =================================================
   ISOLATION
================================================= */

if (
    plan.requiresIsolation
) {

    setRuntimeModuleState(
        fileName,
        "ISOLATED"
    );

    /* =============================================
       APPLY RUNTIME CONTAMINATION
    ============================================= */

    applyRuntimeDegradation(
        fileName,
        {
            level: "ISOLATED",
            source: fileName,
            reason: "RECOVERY_ISOLATION"
        }
    );
}

        /* =================================================
   RECOVERING
================================================= */

applyRuntimeDegradation(
    fileName,
    {
        level: "DEGRADED",
        source: fileName,
        reason: "PRE_RECOVERY_RUNTIME_DAMAGE"
    }
);

setRuntimeModuleState(
    fileName,
    "RECOVERING"
);
        /* =================================================
           RECOVERY SIMULATION
        ================================================= */

        await new Promise((resolve) => {

            setTimeout(
                resolve,
                1500
            );
        });


        /* =================================================
   RUNTIME REINTEGRATION CLEANUP
================================================= */

const runtime =

    window.__RUNTIME_HEALTH_MAP__?.[
        fileName
    ];

if(runtime){

    /*
        REMOVE RECOVERY DAMAGE FLAGS
    */

    runtime.degraded = false;

    runtime.isolated = false;

    /*
        NORMALIZE HEALTH
    */

    if(

        runtime.health !== undefined &&

        runtime.health < 80

    ){

        runtime.health = 80;

    }

    console.log(
        "🧠 [RUNTIME_REINTEGRATED]",
        fileName,
        runtime
    );

    /* =============================================
   SOVEREIGN KERNEL REINTEGRATION
============================================= */

window
    .GestiaRuntime
    ?.sovereignRuntime
    ?.reintegrateHub?.(
        fileName
    );
}
        /* =================================================
           RECOVERY VERIFICATION
        ================================================= */

        const verification =

            window
                .validateRuntimeIntegrity(
                    fileName
                );

        console.log(
            "🩺 [RECOVERY_VERIFICATION]",
            fileName,
            verification
        );

        /* =================================================
           RECOVERY FAILED
        ================================================= */

        if (
            !verification?.ok ||

            verification?.state ===
            "HARD_FAILURE"
        ) {

            setRuntimeModuleState(
                fileName,
                "ISOLATED"
            );

            console.warn(
                "⚠️ [RECOVERY_VERIFICATION_FAIL]",
                fileName
            );

            return {

                ok: false,

                recovered:
                    false,

                verification,

                reason:
                    "RECOVERY_VALIDATION_FAILED"
            };
        }

        /* =================================================
           DEGRADED RECOVERY
        ================================================= */

        if (
            verification?.state ===
            "DEGRADED"
        ) {

            setRuntimeModuleState(
                fileName,
                "DEGRADED"
            );

            console.warn(
                "⚠️ [PARTIAL_RECOVERY]",
                fileName
            );

            return {

                ok: true,

                recovered:
                    "PARTIAL",

                verification,

                repairPlan:
                    plan
            };
        }

        /* =================================================
           ONLINE
        ================================================= */

        setRuntimeModuleState(
            fileName,
            "ONLINE"
        );

        console.log(
            "✅ [RUNTIME_RECOVERY_COMPLETED]",
            fileName
        );

        return {

            ok: true,

            recovered:
                true,

            verification,

            repairPlan:
                plan
        };

        }

    catch(error) {

        console.error(
            "❌ [RUNTIME_RECOVERY_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }

    finally{

       /* =============================================
   RELEASE REPAIR LOCK
============================================= */

window
    .__MODULE_CONTEXT__
    .activeRuntimeRepairs
    .delete(repairLockKey);

console.log(
    "🔓 [REPAIR_LOCK_RELEASED]",
    fileName,
    repairId
);

    }
};

/* =====================================================================================
   ENQUEUE RUNTIME REPAIR V2
===================================================================================== */

window.enqueueRuntimeRepair =
function(
    fileName = "",
    config = {}
) {

    try {

        if (!fileName) {

            return {

                ok: false,

                error:
                    "INVALID_FILE"
            };
        }

        /* =================================================
           QUEUE
        ================================================= */

        const queue =

            MODULE_CONTEXT
                .runtimeRepairQueue;

        /* =================================================
           DEDUPE
        ================================================= */

        const alreadyQueued =

            queue.some(item =>

                item.file === file
            );

        if (alreadyQueued) {

            console.warn(
                "⚠️ [REPAIR_ALREADY_QUEUED]",
                fileName
            );

            return {

                ok: false,

                queued: false,

                reason:
                    "ALREADY_QUEUED"
            };
        }

        /* =================================================
           PAYLOAD
        ================================================= */

        const repairTask = {

            repairTaskId:
                crypto.randomUUID(),

            file:
                fileName,

            priority:
                config.priority ||

                "NORMAL",

            source:
                config.source ||

                "RUNTIME",

            createdAt:
                Date.now(),

            attempts: 0,

            status:
                "PENDING"
        };

        /* =================================================
           PUSH
        ================================================= */

        queue.push(
            repairTask
        );

        /* =================================================
   PRIORITY SORT
================================================= */

const PRIORITY_ORDER = {

    CRITICAL: 0,

    HIGH: 1,

    NORMAL: 2,

    LOW: 3
};

queue.sort(

    (a, b) =>

        (
            PRIORITY_ORDER[
                a.priority
            ] ?? 999
        )

        -

        (
            PRIORITY_ORDER[
                b.priority
            ] ?? 999
        )
);

        console.log(
            "📥 [REPAIR_ENQUEUED]",
            repairTask
        );

        return {

            ok: true,

            queued: true,

            queueSize:
                queue.length,

            task:
                repairTask
        };

    }

    catch(error) {

        console.error(
            "❌ [REPAIR_ENQUEUE_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};


/* =====================================================================================
   PROCESS RUNTIME REPAIR QUEUE V2
   CONVERGED GOVERNANCE REPAIR ENGINE
===================================================================================== */

window.processRuntimeRepairQueue =
async function() {

    try {

        /* =================================================
           GLOBAL MUTEX
        ================================================= */

        if (

            MODULE_CONTEXT
                .runtimeRepairProcessing

        ) {

            console.warn(
                "⚠️ [REPAIR_QUEUE_BUSY]"
            );

            return {

                ok: false,

                reason:
                    "QUEUE_BUSY"
            };
        }

        MODULE_CONTEXT
            .runtimeRepairProcessing = true;

        console.log(
            "🧠 [REPAIR_QUEUE_START]"
        );

        /* =================================================
           QUEUE
        ================================================= */

        MODULE_CONTEXT
            .runtimeRepairQueue ||= [];

        const queue =

            MODULE_CONTEXT
                .runtimeRepairQueue;

        /* =================================================
           EMPTY
        ================================================= */

        if (!queue.length) {

            console.log(
                "📭 [REPAIR_QUEUE_EMPTY]"
            );

            return {

                ok: true,

                empty: true
            };
        }

        /* =================================================
           NEXT TASK
        ================================================= */

        const task =
            queue.shift();

        if (!task) {

            return {

                ok: false,

                error:
                    "INVALID_TASK"
            };
        }

        console.log(
            "⚙️ [PROCESSING_REPAIR_TASK]",
            task
        );

        task.status =
            "PROCESSING";

        task.startedAt =
            Date.now();

        /* =================================================
           GOVERNANCE CHECK
        ================================================= */

        const governance =

            canAttemptRuntimeRepair(
                task.file
            );

        if (
            !governance?.allowed
        ) {

            task.status =
                "BLOCKED";

            task.blockedReason =

                governance?.reason ||

                "GOVERNANCE_BLOCK";

            console.warn(
                "🛑 [REPAIR_BLOCKED]",
                task.file,
                governance
            );

            MODULE_CONTEXT
                .runtimeRepairHistory
                .push(task);

            return {

                ok: false,

                blocked: true,

                governance
            };
        }

        /* =================================================
           ATTEMPT TRACKING
        ================================================= */

        MODULE_CONTEXT
            .runtimeRepairAttempts ||= {};

        MODULE_CONTEXT
            .runtimeRepairAttempts[
                task.file
            ] =

            (
                MODULE_CONTEXT
                    .runtimeRepairAttempts[
                        task.file
                    ] || 0
            ) + 1;

        /* =================================================
           EXECUTE RECOVERY
        ================================================= */

        const recovery =

            await executeRuntimeRecovery(
                task.file
            );

        /* =================================================
           RESULT
        ================================================= */

        task.completedAt =
            Date.now();

        task.result =
            recovery;

        task.status =

            recovery?.ok

                ? "COMPLETED"

                : "FAILED";

        /* =================================================
           COOLDOWN
        ================================================= */

        MODULE_CONTEXT
            .runtimeRepairCooldowns ||= {};

        MODULE_CONTEXT
            .runtimeRepairCooldowns[
                task.file
            ] =

            Date.now() +

            (
                1000 * 15
            );

        console.log(
            "⏳ [REPAIR_COOLDOWN_SET]",
            task.file
        );

        /* =================================================
           HISTORY
        ================================================= */

        MODULE_CONTEXT
            .runtimeRepairHistory ||= [];

        MODULE_CONTEXT
            .runtimeRepairHistory
            .push(task);

        console.log(
            "✅ [REPAIR_TASK_COMPLETED]",
            task
        );

        return {

            ok: true,

            recovery,

            task
        };

    }

    catch(error) {

        console.error(
            "❌ [QUEUE_PROCESS_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }

    finally {

        MODULE_CONTEXT
            .runtimeRepairProcessing = false;

        console.log(
            "🔓 [QUEUE_MUTEX_RELEASED]"
        );
    }
};


/* =====================================================================================
   REPAIR INTROSPECTION LAYER V2
   OBSERVABILITY OVER REAL REPAIR ENGINE
===================================================================================== */

window.getRuntimeRepairState =
function() {

    try {

        return {

            ok: true,

            queueSize:

                MODULE_CONTEXT
                    .runtimeRepairQueue
                    ?.length || 0,

            processing:

                MODULE_CONTEXT
                    .runtimeRepairProcessing || false,

            totalHistory:

                MODULE_CONTEXT
                    .runtimeRepairHistory
                    ?.length || 0,

            totalCooldowns:

                Object.keys(

                    MODULE_CONTEXT
                        .runtimeRepairCooldowns || {}

                ).length,

            totalAttempts:

                Object.keys(

                    MODULE_CONTEXT
                        .runtimeRepairAttempts || {}

                ).length
        };

    }

    catch(error) {

        console.error(
            "❌ [GET_REPAIR_STATE_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};

/* =====================================================================================
   GET REPAIR HISTORY
===================================================================================== */

window.getRuntimeRepairHistory =
function(limit = 10) {

    try {

        MODULE_CONTEXT
            .runtimeRepairHistory ||= [];

        return {

            ok: true,

            total:

                MODULE_CONTEXT
                    .runtimeRepairHistory
                    .length,

            history:

                MODULE_CONTEXT
                    .runtimeRepairHistory
                    .slice(-limit)
        };

    }

    catch(error) {

        console.error(
            "❌ [GET_REPAIR_HISTORY_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};

/* =====================================================================================
   GET REPAIR COOLDOWNS
===================================================================================== */

window.getRuntimeRepairCooldowns =
function() {

    try {

        return {

            ok: true,

            cooldowns:

                MODULE_CONTEXT
                    .runtimeRepairCooldowns || {}
        };

    }

    catch(error) {

        console.error(
            "❌ [GET_REPAIR_COOLDOWNS_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};

/* =====================================================================================
   GET REPAIR ATTEMPTS
===================================================================================== */

window.getRuntimeRepairAttempts =
function() {

    try {

        return {

            ok: true,

            attempts:

                MODULE_CONTEXT
                    .runtimeRepairAttempts || {}
        };

    }

    catch(error) {

        console.error(
            "❌ [GET_REPAIR_ATTEMPTS_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};
