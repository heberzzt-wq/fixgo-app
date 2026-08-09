/* =====================================================
   REPO REGISTRY AND COGNITION
===================================================== */

await import("./repo-cognition.js?v=jarvis-runtime-macro-v2-20260618");

const RUNTIME_GOVERNANCE_V2_VERSION =
    "2.0.0-runtime-governance";

window.RuntimeGovernanceV2 = {
    version:
        RUNTIME_GOVERNANCE_V2_VERSION,
    authority:
        "full_repo_private_owner",
    safeZone:
        "advisory",
    criticalAction:
        "REVIEW_REQUIRED",
    highAction:
        "SUPERVISED_EXECUTION",
    describe() {
        return {
            ok: true,
            module:
                "runtime_governance",
            version:
                RUNTIME_GOVERNANCE_V2_VERSION,
            riskNodes:
                Object.keys(window.__RUNTIME_RISK_GRAPH__ || {}).length,
            governedOperations:
                window.__GOVERNED_REPO_OPERATIONS__?.history?.length || 0
        };
    }
};

/* =====================================================================================
   RUNTIME RISK PROPAGATION ENGINE V2
===================================================================================== */

window.__RUNTIME_RISK_GRAPH__ = {};


/* =====================================================================================
   RUNTIME CONTAMINATION MAP V2
===================================================================================== */

window.__RUNTIME_CONTAMINATION__ ||= {

    contaminated: {},

    propagationHistory: [],

    cascadeSessions: {}
};


/* =====================================================================================
   SCHEDULER COGNITION V2
   AUTONOUS RUNTIME EXECUTION LAYER
===================================================================================== */

window.__RUNTIME_SCHEDULER__ ||= {

    initialized: false,

    active: false,

    tickInterval: null,

    tickRate: 1000,

    startedAt: null,

    lastTick: null,

    totalTicks: 0,

    totalExecutions: 0,

    failedExecutions: 0,

    skippedExecutions: 0,

    schedulerHealth: 100,

    tasks: {},

    executionHistory: [],

    activeExecutions: new Set(),

    runtimeLoad: 0
};


/* =====================================================================================
   RUNTIME DAEMON REGISTRY V2
   AUTONOUS DAEMON GOVERNANCE LAYER
===================================================================================== */

window.__RUNTIME_DAEMONS__ ||= {

    initialized: false,

    daemons: {},

    activeDaemons: new Set(),

    daemonHeartbeats: {},

    daemonLocks: {},

    daemonMetrics: {

        totalStarted: 0,

        totalStopped: 0,

        totalBlocked: 0,

        totalHeartbeats: 0
    }
};

/* =====================================================================================
   REGISTER DAEMON
===================================================================================== */

window.registerRuntimeDaemon =
function(daemonId, config = {}) {

    try {

        if (!daemonId) {

            return {

                ok: false,

                error: "INVALID_DAEMON_ID"
            };
        }

        const registry =
            window.__RUNTIME_DAEMONS__;

        /* =================================================
           DUPLICATE REGISTRATION PROTECTION
        ================================================= */

        if (
            registry.daemons?.[daemonId]
        ) {

            console.warn(
                "⚠️ [DAEMON_ALREADY_REGISTERED]",
                daemonId
            );

            return {

                ok: true,

                alreadyRegistered: true,

                daemonId
            };
        }

        registry.daemons[daemonId] = {

            daemonId,

            handler:
                config.handler || null,

            interval:
                config.interval || 10000,

            singleton:
                config.singleton !== false,

            critical:
                config.critical || false,

            autoStart:
                config.autoStart || false,

            enabled:
                config.enabled !== false,

            intervalRef: null,

            status: "REGISTERED",

            startedAt: null,

            stoppedAt: null,

            lastHeartbeat: null,

            totalExecutions: 0,

            failures: 0,

            ownershipId:
                crypto.randomUUID()
        };

        console.log(
            "🧠 [DAEMON_REGISTERED]",
            daemonId
        );

        return {

            ok: true,

            daemonId
        };

    }

    catch(error) {

        console.error(
            "❌ [DAEMON_REGISTER_FAIL]",
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
   START DAEMON
===================================================================================== */

window.startRuntimeDaemon =
function(daemonId = "") {

    try {

        const registry =
            window.__RUNTIME_DAEMONS__;

        const daemon =
            registry.daemons?.[daemonId];

        if (!daemon) {

            return {

                ok: false,

                error: "DAEMON_NOT_FOUND"
            };
        }

        if (!daemon.enabled) {

            return {

                ok: false,

                error: "DAEMON_DISABLED"
            };
        }

        /* =================================================
           SINGLETON PROTECTION
        ================================================= */

        if (
            daemon.singleton &&
            registry.activeDaemons.has(
                daemonId
            )
        ) {

            registry.daemonMetrics
                .totalBlocked++;

            console.warn(
                "⚠️ [DAEMON_SINGLETON_BLOCK]",
                daemonId
            );

            return {

                ok: false,

                blocked: true,

                error:
                    "DAEMON_ALREADY_RUNNING"
            };
        }

        /* =================================================
           ACTIVE
        ================================================= */

        registry.activeDaemons.add(
            daemonId
        );

        daemon.status = "RUNNING";

        daemon.startedAt =
            Date.now();

        /* =================================================
           LOOP
        ================================================= */

        daemon.intervalRef =
            setInterval(

                async () => {

                    try {

                        /* =============================
                           HEARTBEAT
                        ============================== */

                        daemon.lastHeartbeat =
                            Date.now();

                        registry
                            .daemonHeartbeats[
                                daemonId
                            ] =

                            daemon.lastHeartbeat;

                        registry
                            .daemonMetrics
                            .totalHeartbeats++;

                        /* =============================
                           EXECUTION
                        ============================== */

                        if (
                            typeof daemon.handler ===
                            "function"
                        ) {

                            await daemon.handler();
                        }

                        daemon.totalExecutions++;

                    }

                    catch(execError) {

                        daemon.failures++;

                        console.error(
                            "❌ [DAEMON_EXECUTION_FAIL]",
                            daemonId,
                            execError
                        );
                    }

                },

                daemon.interval
            );

        registry.daemonMetrics
            .totalStarted++;

        console.log(
            "🚀 [DAEMON_STARTED]",
            daemonId
        );

        return {

            ok: true,

            daemonId
        };

    }

    catch(error) {

        console.error(
            "❌ [DAEMON_START_FAIL]",
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
   STOP DAEMON
===================================================================================== */

window.stopRuntimeDaemon =
function(daemonId = "") {

    try {

        const registry =
            window.__RUNTIME_DAEMONS__;

        const daemon =
            registry.daemons?.[daemonId];

        if (!daemon) {

            return {

                ok: false,

                error: "DAEMON_NOT_FOUND"
            };
        }

        if (
            daemon.intervalRef
        ) {

            clearInterval(
                daemon.intervalRef
            );
        }

        daemon.intervalRef =
            null;

        daemon.status =
            "STOPPED";

        daemon.stoppedAt =
            Date.now();

        registry.activeDaemons.delete(
            daemonId
        );

        registry.daemonMetrics
            .totalStopped++;

        console.log(
            "🛑 [DAEMON_STOPPED]",
            daemonId
        );

        return {

            ok: true,

            daemonId
        };

    }

    catch(error) {

        console.error(
            "❌ [DAEMON_STOP_FAIL]",
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
   GET DAEMON STATE
===================================================================================== */

window.getRuntimeDaemonState =
function() {

    try {

        const registry =
            window.__RUNTIME_DAEMONS__;

        return {

            ok: true,

            totalDaemons:

                Object.keys(
                    registry.daemons || {}
                ).length,

            activeDaemons:

                registry.activeDaemons.size,

            daemonHeartbeats:

                Object.keys(
                    registry.daemonHeartbeats || {}
                ).length,

            metrics:
                registry.daemonMetrics
        };

    }

    catch(error) {

        console.error(
            "❌ [DAEMON_STATE_FAIL]",
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
   HEALTH GOVERNANCE DAEMON V2
   AUTONOUS RUNTIME HEALTH COGNITION
===================================================================================== */

window.__RUNTIME_HEALTH__ ||= {

    initialized: false,

    runtimeHealth: 100,

    schedulerHealth: 100,

    daemonHealth: 100,

    queueHealth: 100,

    persistenceHealth: 100,

    cognitionLoad: 0,

    anomalyScore: 0,

    degraded: false,

    lastScanAt: null,

    totalScans: 0,

    detectedAnomalies: [],

    runtimePressure: "LOW"
};

/* =====================================================================================
   COMPUTE RUNTIME HEALTH
===================================================================================== */

window.computeRuntimeHealth =
async function() {

    try {

        const health =
            window.__RUNTIME_HEALTH__;

        const scheduler =
            window.__RUNTIME_SCHEDULER__;

        const daemons =
            window.__RUNTIME_DAEMONS__;

        /* =================================================
           BASE HEALTH
        ================================================= */

        let score = 100;

        /* =================================================
           SCHEDULER HEALTH
        ================================================= */

        if (
            scheduler?.schedulerHealth <
            90
        ) {

            score -= 10;
        }

        /* =================================================
           FAILED EXECUTIONS
        ================================================= */

        if (
            scheduler?.failedExecutions >
            5
        ) {

            score -= 15;
        }

        /* =================================================
           DAEMON FAILURES
        ================================================= */

        const daemonFailures =

            Object.values(
                daemons?.daemons || {}
            )

            .reduce(

                (total, daemon) =>

                    total +
                    (daemon.failures || 0),

                0
            );

        if (
            daemonFailures > 5
        ) {

            score -= 20;
        }

        /* =================================================
           QUEUE PRESSURE
        ================================================= */

        const queueSize =

            window.dispatchQueue?.length || 0;

        if (
            queueSize > 100
        ) {

            score -= 15;
        }

        /* =================================================
           HEALTH ASSIGNMENT
        ================================================= */

        health.runtimeHealth =
            Math.max(0, score);

        health.schedulerHealth =
            scheduler?.schedulerHealth || 100;

        health.daemonHealth =
            Math.max(
                0,
                100 - daemonFailures
            );

        health.queueHealth =
            queueSize > 100
                ? 70
                : 100;

        health.cognitionLoad =
            queueSize;

        health.lastScanAt =
            Date.now();

        health.totalScans++;

        /* =================================================
           DEGRADED STATE
        ================================================= */

        health.degraded =
            health.runtimeHealth < 70;

        /* =================================================
           PRESSURE STATE
        ================================================= */

        if (queueSize > 200) {

            health.runtimePressure =
                "HIGH";
        }

        else if (queueSize > 50) {

            health.runtimePressure =
                "MEDIUM";
        }

        else {

            health.runtimePressure =
                "LOW";
        }

        /* =================================================
           ANOMALY DETECTION
        ================================================= */

        health.detectedAnomalies = [];

        if (
            daemonFailures > 5
        ) {

            health.detectedAnomalies.push(
                "HIGH_DAEMON_FAILURE_RATE"
            );
        }

        if (
            queueSize > 100
        ) {

            health.detectedAnomalies.push(
                "QUEUE_PRESSURE_HIGH"
            );
        }

        if (
            scheduler?.failedExecutions > 5
        ) {

            health.detectedAnomalies.push(
                "SCHEDULER_FAILURES_HIGH"
            );
        }

        health.anomalyScore =
            health.detectedAnomalies
                .length;

        console.log(
            "🩺 [RUNTIME_HEALTH_SCAN]",
            {

                runtimeHealth:
                    health.runtimeHealth,

                anomalies:
                    health.detectedAnomalies,

                pressure:
                    health.runtimePressure
            }
        );

        return {

            ok: true,

            health:
                health.runtimeHealth
        };

    }

    catch(error) {

        console.error(
            "❌ [HEALTH_SCAN_FAIL]",
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
   START HEALTH GOVERNANCE DAEMON
===================================================================================== */

window.startHealthGovernanceDaemon =
async function() {

    try {

        registerRuntimeDaemon(

            "runtime.health.daemon",

            {

                interval: 15000,

                singleton: true,

                critical: true,

                handler: async () => {

                    await computeRuntimeHealth();
                }
            }
        );

        const started =

            startRuntimeDaemon(
                "runtime.health.daemon"
            );

        console.log(
            "🩺 [HEALTH_GOVERNANCE_ONLINE]"
        );

        return {

            ok: true,

            started
        };

    }

    catch(error) {

        console.error(
            "❌ [HEALTH_GOVERNANCE_BOOT_FAIL]",
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
   GET RUNTIME HEALTH
===================================================================================== */

window.getRuntimeHealth =
function() {

    try {

        return {

            ok: true,

            ...(window.__RUNTIME_HEALTH__)
        };

    }

    catch(error) {

        console.error(
            "❌ [GET_HEALTH_FAIL]",
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
   REGISTER RUNTIME TASK
===================================================================================== */

window.registerRuntimeTask =
function(taskId, config = {}) {

    try {

        if (!taskId) {

            return {

                ok: false,

                error: "INVALID_TASK_ID"
            };
        }

        const scheduler =
            window.__RUNTIME_SCHEDULER__;

        scheduler.tasks[taskId] = {

            taskId,

            handler:
                config.handler || null,

            interval:
                config.interval || 5000,

            priority:
                config.priority || "NORMAL",

            daemon:
                config.daemon || false,

            enabled:
                config.enabled !== false,

            isolated:
                config.isolated || false,

            critical:
                config.critical || false,

            lastExecution: 0,

            nextExecution:
                Date.now() +
                (config.interval || 5000),

            totalRuns: 0,

            failures: 0,

            success: 0,

            status: "IDLE",

            createdAt:
                Date.now()
        };

        console.log(
            "🧠 [TASK_REGISTERED]",
            taskId
        );

        return {

            ok: true,

            taskId
        };

    }

    catch(error) {

        console.error(
            "❌ [TASK_REGISTER_FAIL]",
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
   EXECUTE RUNTIME TASK
===================================================================================== */

window.executeRuntimeTask =
async function(taskId = "") {

    try {

        const scheduler =
            window.__RUNTIME_SCHEDULER__;

        const task =
            scheduler.tasks?.[taskId];

        if (!task) {

            return {

                ok: false,

                error: "TASK_NOT_FOUND"
            };
        }

        if (!task.enabled) {

            scheduler.skippedExecutions++;

            return {

                ok: false,

                skipped: true,

                reason: "TASK_DISABLED"
            };
        }

        /* =================================================
           DUPLICATE EXECUTION PROTECTION
        ================================================= */

        if (
            scheduler.activeExecutions.has(
                taskId
            )
        ) {

            scheduler.skippedExecutions++;

            return {

                ok: false,

                skipped: true,

                reason: "TASK_ALREADY_RUNNING"
            };
        }

        scheduler.activeExecutions.add(
            taskId
        );

        task.status = "RUNNING";

        task.lastExecution =
            Date.now();

        /* =================================================
           EXECUTION
        ================================================= */

        let result = null;

        try {

            if (
                typeof task.handler ===
                "function"
            ) {

                result =
                    await task.handler();
            }

            task.success++;

            task.status = "IDLE";

            scheduler.totalExecutions++;

        }

        catch(execError) {

            task.failures++;

            task.status = "FAILED";

            scheduler.failedExecutions++;

            console.error(
                "❌ [TASK_EXECUTION_FAIL]",
                taskId,
                execError
            );
        }

        /* =================================================
           NEXT EXECUTION
        ================================================= */

        task.totalRuns++;

        task.nextExecution =
            Date.now() +
            task.interval;

        /* =================================================
           HISTORY
        ================================================= */

        scheduler.executionHistory.push({

            taskId,

            timestamp:
                Date.now(),

            status:
                task.status
        });

        /* =================================================
           CLEANUP
        ================================================= */

        scheduler.activeExecutions.delete(
            taskId
        );

        return {

            ok: true,

            taskId,

            result
        };

    }

    catch(error) {

        console.error(
            "❌ [EXECUTE_TASK_FAIL]",
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
   RUNTIME SCHEDULER TICK
===================================================================================== */

window.runtimeSchedulerTick =
async function() {

    try {

        const scheduler =
            window.__RUNTIME_SCHEDULER__;

        scheduler.lastTick =
            Date.now();

        scheduler.totalTicks++;

        const now =
            Date.now();

        const tasks =
            Object.values(
                scheduler.tasks || {}
            );

        for (const task of tasks) {

            if (!task.enabled) {

                continue;
            }

            if (
                now >= task.nextExecution
            ) {

                await executeRuntimeTask(
                    task.taskId
                );
            }
        }

        /* =================================================
           HEALTH CALCULATION
        ================================================= */

        const total =
            scheduler.totalExecutions || 1;

        const failed =
            scheduler.failedExecutions || 0;

        scheduler.schedulerHealth =
            Math.max(
                0,
                100 - Math.floor(
                    (failed / total) * 100
                )
            );

        return {

            ok: true,

            tick:
                scheduler.totalTicks
        };

    }

    catch(error) {

        console.error(
            "❌ [SCHEDULER_TICK_FAIL]",
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
   START RUNTIME SCHEDULER
===================================================================================== */

window.startRuntimeScheduler =
function(config = {}) {

    try {

        const scheduler =
            window.__RUNTIME_SCHEDULER__;

        if (scheduler.active) {

            return {

                ok: true,

                alreadyRunning: true
            };
        }

        scheduler.tickRate =
            config.tickRate || 1000;

        scheduler.active = true;

        scheduler.initialized = true;

        scheduler.startedAt =
            Date.now();

        scheduler.tickInterval =
            setInterval(

                async () => {

                    await runtimeSchedulerTick();

                },

                scheduler.tickRate
            );

        console.log(
            "🧠 [RUNTIME_SCHEDULER_STARTED]"
        );

        return {

            ok: true,

            tickRate:
                scheduler.tickRate
        };

    }

    catch(error) {

        console.error(
            "❌ [SCHEDULER_START_FAIL]",
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
   GET SCHEDULER STATE
===================================================================================== */

window.getRuntimeSchedulerState =
function() {

    try {

        const scheduler =
            window.__RUNTIME_SCHEDULER__;

        return {

            ok: true,

            active:
                scheduler.active,

            totalTasks:
                Object.keys(
                    scheduler.tasks || {}
                ).length,

            totalTicks:
                scheduler.totalTicks,

            totalExecutions:
                scheduler.totalExecutions,

            failedExecutions:
                scheduler.failedExecutions,

            skippedExecutions:
                scheduler.skippedExecutions,

            schedulerHealth:
                scheduler.schedulerHealth,

            activeExecutions:
                scheduler.activeExecutions.size
        };

    }

    catch(error) {

        console.error(
            "❌ [SCHEDULER_STATE_FAIL]",
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
   START RUNTIME SCHEDULER V2
   LIVE COGNITION EXECUTION CYCLE
===================================================================================== */

window.startLiveCognitionCycle =
async function() {

    try {

        const scheduler =
            window.__RUNTIME_SCHEDULER__;

        /* =================================================
           ALREADY ACTIVE
        ================================================= */

        if (
            scheduler.active
        ) {

            console.warn(
                "⚠️ [SCHEDULER_ALREADY_ACTIVE]"
            );

            return {

                ok: false,

                reason:
                    "ALREADY_ACTIVE"
            };
        }

        console.log(
            "🧠 [SCHEDULER_STARTING]"
        );

        scheduler.active = true;

        scheduler.startedAt =
            Date.now();

        /* =================================================
           LIVE EXECUTION LOOP
        ================================================= */

        scheduler.tickInterval =

            setInterval(

                async () => {

                    try {

                        scheduler.totalTicks++;

                        scheduler.lastTick =
                            Date.now();

                        /* =============================
                           LOAD CALCULATION
                        ============================== */

                        scheduler.runtimeLoad =

                            window.dispatchQueue
                                ?.length || 0;

                        /* =============================
                           TASK EXECUTION
                        ============================== */

                        const tasks =

                            Object.values(
                                scheduler.tasks || {}
                            );

                        for (

                            const task of tasks

                        ) {

                            try {

                                if (
                                    !task?.handler
                                ) {

                                    continue;
                                }

                                await task.handler();

                                scheduler.totalExecutions++;

                            }

                            catch(error) {

                                scheduler
                                    .failedExecutions++;

                                console.error(
                                    "❌ [SCHEDULER_TASK_FAIL]",
                                    error
                                );
                            }
                        }

                        /* =============================
                           HEALTH
                        ============================== */

                        scheduler.schedulerHealth =

                            scheduler
                                .failedExecutions > 10

                                ? 70

                                : 100;

                    }

                    catch(error) {

                        console.error(
                            "❌ [SCHEDULER_CYCLE_FAIL]",
                            error
                        );
                    }
                },

                scheduler.tickRate || 1000
            );

        console.log(
            "✅ [SCHEDULER_ONLINE]"
        );

        return {

            ok: true,

            tickRate:
                scheduler.tickRate
        };

    }

    catch(error) {

        console.error(
            "❌ [SCHEDULER_START_FAIL]",
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
   STOP RUNTIME SCHEDULER
===================================================================================== */

window.stopRuntimeScheduler =
async function() {

    try {

        const scheduler =
            window.__RUNTIME_SCHEDULER__;

        if (
            !scheduler.active
        ) {

            return {

                ok: false,

                reason:
                    "NOT_RUNNING"
            };
        }

        clearInterval(
            scheduler.tickInterval
        );

        scheduler.active = false;

        scheduler.tickInterval =
            null;

        console.log(
            "🛑 [SCHEDULER_STOPPED]"
        );

        return {

            ok: true
        };

    }

    catch(error) {

        console.error(
            "❌ [SCHEDULER_STOP_FAIL]",
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
   APPLY RUNTIME DEGRADATION ENGINE V2
===================================================================================== */

window.applyRuntimeDegradation =
function(
    fileName = "",
    config = {}
) {

    try {

        const {

            level = "DEGRADED",

            source = "UNKNOWN",

            reason = "RUNTIME_CASCADE",

            propagatedBy = null

        } = config;

        console.warn(
            "⚠️ [APPLY_RUNTIME_DEGRADATION]",
            fileName,
            level
        );

        /* =================================================
           RUNTIME MAP
        ================================================= */

        if (
            !window.__RUNTIME_HEALTH_MAP__
        ) {

            return {

                ok: false,

                error:
                    "RUNTIME_HEALTH_MAP_NOT_READY"
            };
        }

        /* =================================================
           NODE
        ================================================= */

        const current =

            window.__RUNTIME_HEALTH_MAP__[
                fileName
            ];

        if (!current) {

            return {

                ok: false,

                error:
                    "RUNTIME_NODE_NOT_FOUND"
            };
        }

        /* =================================================
           HEALTH CALCULATION
        ================================================= */

        let nextHealth =
            current.health || 100;

        if (
            level === "DEGRADED"
        ) {

            nextHealth -= 25;
        }

        else if (
            level === "RESTRICTED"
        ) {

            nextHealth -= 40;
        }

        else if (
            level === "ISOLATED"
        ) {

            nextHealth -= 70;
        }

        else if (
            level === "HARD_FAILURE"
        ) {

            nextHealth = 0;
        }

        nextHealth =
            Math.max(
                nextHealth,
                0
            );

        /* =================================================
           STATE FLAGS
        ================================================= */

        current.status =
            level;

        current.health =
            nextHealth;

        current.degraded =
            level !== "ONLINE";

        current.isolated =
            level === "ISOLATED";

        current.lastDegradation =
            Date.now();

        current.degradationReason =
            reason;

        current.propagatedBy =
            propagatedBy;

        current.damageSource =
            source;

        /* =================================================
           CONTAMINATION MEMORY
        ================================================= */

        window.__RUNTIME_CONTAMINATION__
            .contaminated[
                fileName
            ] = {

            file:
                fileName,

            level,

            source,

            reason,

            propagatedBy,

            contaminatedAt:
                Date.now()
        };

        /* =================================================
           HISTORY
        ================================================= */

        window.__RUNTIME_CONTAMINATION__
            .propagationHistory
            .push({

                file:
                    fileName,

                level,

                source,

                reason,

                propagatedBy,

                timestamp:
                    Date.now()
            });

        console.warn(
            "🚨 [RUNTIME_DEGRADED]",
            fileName,
            current
        );

        return {

            ok: true,

            file:
                fileName,

            level,

            health:
                nextHealth,

            runtime:
                current
        };

    }

    catch(error) {

        console.error(
            "❌ [APPLY_DEGRADATION_FAIL]",
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
   RUNTIME VALIDATION ENGINE V2
===================================================================================== */

window.validateRuntimeIntegrity =
function(
    fileName = ""
) {

    try {

        console.log(
            "🧠 [RUNTIME_VALIDATION]",
            fileName
        );

        const runtime =

            window
                .__RUNTIME_HEALTH_MAP__?.[
                    fileName
                ];

        if (!runtime) {

            return {

                ok: false,

                valid: false,

                state:
                    "UNKNOWN",

                reason:
                    "RUNTIME_NOT_FOUND"
            };
        }

        /* =================================================
           HEALTH SCORE
        ================================================= */

        const health =
            runtime.health || 0;

        /* =================================================
           HARD FAILURE
        ================================================= */

        if (
            health <= 0
        ) {

            return {

                ok: false,

                valid: false,

                state:
                    "HARD_FAILURE",

                health
            };
        }

        /* =================================================
           ISOLATED
        ================================================= */

        if (
            health <= 40
        ) {

            return {

                ok: false,

                valid: false,

                state:
                    "ISOLATED",

                health
            };
        }

        /* =================================================
           DEGRADED
        ================================================= */

        if (
            health <= 70
        ) {

            return {

                ok: true,

                valid: true,

                state:
                    "DEGRADED",

                health
            };
        }

        /* =================================================
           PARTIAL
        ================================================= */

        if (
            health <= 89
        ) {

            return {

                ok: true,

                valid: true,

                state:
                    "PARTIAL",

                health
            };
        }

        /* =================================================
           ONLINE
        ================================================= */

        return {

            ok: true,

            valid: true,

            state:
                "ONLINE",

            health
        };

    }

    catch(error) {

        console.error(
            "❌ [RUNTIME_VALIDATION_FAIL]",
            error
        );

        return {

            ok: false,

            valid: false,

            state:
                "UNKNOWN",

            error:
                error.message
        };
    }
};
/* =====================================================
   BUILD RISK PROPAGATION GRAPH
===================================================== */

window.buildRuntimeRiskGraph =
function() {

    try {

        console.log(
            "🧠 [RISK_GRAPH_BUILD]"
        );

        const graph =
            window
                .__REPO_DEP_GRAPH__ || {};

        const riskGraph = {};

        for (
            const file in graph
        ) {

            const node =
                graph[file];

            const criticality =

                calculatePropagatedCriticality(
                    file
                );

            riskGraph[file] = {

                file,

                module:
                    node.module,

                dependencies:
                    node.dependencies || [],

                propagatedRisk:

                    criticality
                        ?.classification ||

                    "LOW",

                propagatedScore:

                    criticality
                        ?.propagatedScore ||

                    0
            };

            console.log(
                "⚠️ [RISK_NODE]",
                file,
                riskGraph[file]
                    .propagatedRisk
            );
        }

        window.__RUNTIME_RISK_GRAPH__ =
            riskGraph;

        console.log(
            "✅ [RISK_GRAPH_READY]",
            Object.keys(
                riskGraph
            ).length
        );

        return {

            ok: true,

            total:
                Object.keys(
                    riskGraph
                ).length,

            graph:
                riskGraph
        };

    }

    catch(error) {

        console.error(
            "❌ [RISK_GRAPH_FAIL]",
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
   AUTONOMOUS RISK ESCALATION ENGINE V2
===================================================================================== */

/* =====================================================
   ESCALATE RUNTIME RISK
===================================================== */

window.escalateRuntimeRisk =
function(fileName = "") {

    try {

        console.log(
            "🚨 [RISK_ESCALATION]",
            fileName
        );

        const node =

            window
                .__RUNTIME_RISK_GRAPH__?.[
                    fileName
                ];

        if (!node) {

            return {

                ok: false,

                error:
                    "RISK_NODE_NOT_FOUND"
            };
        }

        /* =================================================
           INIT GOVERNANCE
        ================================================= */

        if (
            !window.MODULE_CONTEXT
                .governance
        ) {

            window.MODULE_CONTEXT
                .governance = {};
        }

        /* =================================================
           DEGRADED MODULES
        ================================================= */

        if (
            !window.MODULE_CONTEXT
                .governance
                .degradedModules
        ) {

            window.MODULE_CONTEXT
                .governance
                .degradedModules = {};
        }

        /* =================================================
           CRITICAL ESCALATION
        ================================================= */

        if (
            node.propagatedRisk ===
            "CRITICAL"
        ) {

            window.MODULE_CONTEXT
                .governance
                .degradedModules[
                    fileName
                ] = {

                escalatedAt:
                    Date.now(),

                reason:
                    "AUTONOMOUS_RISK_ESCALATION",

                propagatedScore:
                    node.propagatedScore
            };

            console.warn(
                "⚠️ [MODULE_ESCALATED]",
                fileName
            );
        }

        return {

            ok: true,

            escalated:
                fileName,

            propagatedRisk:
                node.propagatedRisk,

            governance:

                window.MODULE_CONTEXT
                    .governance
        };

    }

    catch(error) {

        console.error(
            "❌ [RISK_ESCALATION_FAIL]",
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
   DEPENDENT RISK DISCOVERY ENGINE V2
===================================================================================== */

/* =====================================================
   FIND DEPENDENT RISK NODES
===================================================== */

window.findDependentRiskNodes =
function(targetFile = "") {

    try {

        console.log(
            "🧠 [DEPENDENT_DISCOVERY]",
            targetFile
        );

        const graph =

            window
                .__RUNTIME_RISK_GRAPH__ || {};

        const dependents = [];

        /* =============================================
           NORMALIZATION
        ============================================= */

        const normalizeRuntimePath =
        (path = "") => {

            return String(path)
                .toLowerCase()
                .replaceAll("\\", "/")
                .split("/")
                .pop()
                .trim();
        };

        const normalizedTarget =

            normalizeRuntimePath(
                targetFile
            );

        /* =============================================
           GRAPH LOOP
        ============================================= */

        for (
            const file in graph
        ) {

            const node =
                graph[file];

            const dependencies =

                node.dependencies || [];

            const dependsOnTarget =

                dependencies.some(dep => {

                    if (!dep) {

                        return false;
                    }

                    const normalizedDep =

                        normalizeRuntimePath(
                            dep
                        );

                    return (

                        normalizedDep ===
                        normalizedTarget
                    );
                });

            if (
                dependsOnTarget &&
                file !== targetFile
            ) {

                dependents.push({

                    file,

                    propagatedRisk:
                        node.propagatedRisk,

                    propagatedScore:
                        node.propagatedScore
                });

                console.warn(
                    "⚠️ [DEPENDENT_NODE]",
                    file
                );
            }
        }

        return {

            ok: true,

            target:
                targetFile,

            total:
                dependents.length,

            dependents
        };

    }

    catch(error) {

        console.error(
            "❌ [DEPENDENT_DISCOVERY_FAIL]",
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
   CASCADING RUNTIME DEGRADATION ENGINE V2
   SAFE SUPERVISED PROPAGATION
===================================================================================== */

window.propagateRuntimeDegradation =
function(
    targetFile = "",
    options = {}
) {

    try {

        console.warn(
            "🚨 [CASCADE_START]",
            targetFile
        );

        const {

            source =
                targetFile,

            reason =
                "RUNTIME_CASCADE",

            maxDepth = 5

        } = options;

        /* =================================================
           DEPENDENTS
        ================================================= */

        const discovered =

            findDependentRiskNodes(
                targetFile
            );

        if (
            !discovered?.ok
        ) {

            return {

                ok: false,

                error:
                    "DEPENDENT_DISCOVERY_FAILED"
            };
        }

        const dependents =
            discovered.dependents || [];

        console.warn(
            "⚠️ [CASCADE_DEPENDENTS]",
            dependents.length
        );

        /* =================================================
           CASCADE SESSION
        ================================================= */

        const cascadeId =
            crypto.randomUUID();

        window.__RUNTIME_CONTAMINATION__
            .cascadeSessions[
                cascadeId
            ] = {

            target:
                targetFile,

            startedAt:
                Date.now(),

            total:
                dependents.length
        };

        const affected = [];

        /* =================================================
           CASCADE LOOP
        ================================================= */

        for (
            const dependent
            of dependents
        ) {

            const file =
                dependent.file;

            const risk =
                dependent
                    .propagatedRisk ||

                "LOW";

            /* =============================================
               RUNTIME VALIDATION
            ============================================= */

            const validation =

                window
                    .validateRuntimeIntegrity(
                        file
                    );

            console.log(
                "🩺 [CASCADE_VALIDATION]",
                file,
                validation?.state
            );

            let level =
                "DEGRADED";

            /* =============================================
               SAFE RISK MAPPING
            ============================================= */

            if (
                risk === "MEDIUM"
            ) {

                level =
                    "DEGRADED";
            }

            if (
                risk === "HIGH"
            ) {

                level =
                    "RESTRICTED";
            }

            /* =============================================
               CRITICAL VALIDATION
            ============================================= */

            if (
                risk === "CRITICAL"
            ) {

                if (
                    validation?.state ===
                    "ONLINE"
                ) {

                    level =
                        "DEGRADED";
                }

                else if (
                    validation?.state ===
                    "DEGRADED"
                ) {

                    level =
                        "RESTRICTED";
                }

                else if (
                    validation?.state ===
                    "RESTRICTED"
                ) {

                    level =
                        "ISOLATED";
                }

                else if (
                    validation?.state ===
                    "ISOLATED"
                ) {

                    level =
                        "HARD_FAILURE";
                }

                else {

                    level =
                        "RESTRICTED";
                }
            }

            /* =============================================
               APPLY DAMAGE
            ============================================= */

            const result =

                window
                    .applyRuntimeDegradation(
                        file,
                        {
                            level,

                            source,

                            reason,

                            propagatedBy:
                                targetFile
                        }
                    );

            affected.push({

                file,

                level,

                risk,

                validation:

                    validation?.state,

                ok:
                    result?.ok === true
            });

            console.warn(
                "⚠️ [CASCADE_APPLIED]",
                file,
                level
            );
        }

        console.warn(
            "✅ [CASCADE_COMPLETED]",
            affected.length
        );

        return {

            ok: true,

            cascadeId,

            source:
                targetFile,

            totalAffected:
                affected.length,

            affected
        };

    }

    catch(error) {

        console.error(
            "❌ [CASCADE_FAIL]",
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
   REPO GOVERNANCE ENGINE V2
===================================================================================== */

/* =====================================================
   CAN MODIFY REPO FILE
===================================================== */

window.canModifyRepoFile =
function(fileName = "") {

    try {

        console.log(
            "🛡️ [REPO_GOVERNANCE_CHECK]",
            fileName
        );

        const impact =

            analyzeRepoImpact(
                fileName
            );

        if (!impact?.ok) {

            return {

                ok: false,

                allowed: false,

                error:
                    impact?.error ||

                    "IMPACT_ANALYSIS_FAILED"
            };
        }

       const analysis =
    impact.analysis;

const layer =

    window
        .__COGNITIVE_LAYER_MAP__?.[
            fileName
        ]?.layer || "UNKNOWN";

console.log(
    "🧠 [GOVERNANCE_LAYER]",
    fileName,
    layer
);

let allowed = true;

let governanceAction =
    "ALLOW";

let reason =
    "SAFE_OPERATION";

            /* =================================================
   LAYER GOVERNANCE
================================================= */

if (
    layer === "SECURITY"
) {

    allowed = false;

    governanceAction =
        "REVIEW_REQUIRED";

    reason =
        "SECURITY_LAYER_PROTECTED";
}

if (
    layer === "COGNITION"
) {

    governanceAction =
        "SUPERVISED_COGNITION";
}

if (
    layer === "RUNTIME_UI"
) {

    governanceAction =
        "SUPERVISED_EXECUTION";
}


/* =================================================
   SOVEREIGN LAYER PRIORITY
================================================= */

if (
    governanceAction ===
    "REVIEW_REQUIRED"
) {

    return {

        ok: true,

        decision: {

            file:
                analysis.file,

            module:
                analysis.module,

            allowed,

            governanceAction,

            reason,

            criticality:
                analysis.criticality,

            propagatedRisk:
                analysis.propagatedRisk,

            totalDependencies:
                analysis.totalDependencies,

            totalImpacted:
                analysis.totalImpacted,

            layer
        }
    };
}
        /* =================================================
           CRITICAL GOVERNANCE
        ================================================= */

        if (
            analysis
                ?.propagatedRisk ===
            "CRITICAL"
        ) {

            allowed = false;

            governanceAction =
                "REVIEW_REQUIRED";

            reason =
                "CRITICAL_RUNTIME_ENGINE";
        }

        /* =================================================
           HIGH GOVERNANCE
        ================================================= */

        else if (
            analysis
                ?.propagatedRisk ===
            "HIGH"
        ) {

            allowed = false;

            governanceAction =
                "SUPERVISED_EXECUTION";

            reason =
                "HIGH_RISK_ENGINE";
        }

        /* =================================================
           MEDIUM GOVERNANCE
        ================================================= */

        else if (
            analysis
                ?.propagatedRisk ===
            "MEDIUM"
        ) {

            governanceAction =
                "SUPERVISED_EXECUTION";

            reason =
                "SUPERVISED_MODIFICATION";
        }

        /* =================================================
           DEPENDENCY IMPACT
        ================================================= */

        if (
            analysis
                ?.totalImpacted >= 5
        ) {

            governanceAction =
                "REVIEW_REQUIRED";

            allowed = false;

            reason =
                "HIGH_DEPENDENCY_PROPAGATION";
        }

        const decision = {

            file:
                analysis.file,

            module:
                analysis.module,

            allowed,

            governanceAction,

            reason,

            criticality:
                analysis.criticality,

            propagatedRisk:
                analysis.propagatedRisk,

            totalDependencies:
                analysis.totalDependencies,

            totalImpacted:
                analysis.totalImpacted
        };

        console.log(
            "🛡️ [GOVERNANCE_DECISION]",
            decision
        );

        return {

            ok: true,

            decision
        };

    }

    catch(error) {

        console.error(
            "❌ [REPO_GOVERNANCE_FAIL]",
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
   GOVERNED REPO OPERATIONS V2
===================================================================================== */

/* =====================================================
   EXECUTE GOVERNED OPERATION
===================================================== */

window.executeGovernedRepoOperation =
async function(config = {}) {

    try {

        const {

            operation =
                "UNKNOWN",

            target =
                "",

            payload =
                {}

        } = config;

        console.log(
            "🛡️ [GOVERNED_OPERATION]",
            operation,
            target
        );

        /* =================================================
           GOVERNANCE CHECK
        ================================================= */

        const governance =

            canModifyRepoFile(
                target
            );

        if (!governance?.ok) {

            return {

                ok: false,

                blocked: true,

                error:
                    governance?.error ||

                    "GOVERNANCE_CHECK_FAILED"
            };
        }

        const decision =
            governance.decision;

            /* =================================================
   RECORD BLOCK EVENT
================================================= */

recordGovernanceEvent({

    operation,

    target,

    governanceAction:
        decision
            ?.governanceAction,

    propagatedRisk:
        decision
            ?.propagatedRisk,

    criticality:
        decision
            ?.criticality,

    allowed: false,

    blocked: true
});

        /* =================================================
           HARD BLOCK
        ================================================= */

        if (
            decision
                ?.governanceAction ===
            "REVIEW_REQUIRED"
        ) {

            console.warn(
                "🛑 [REVIEW_REQUIRED_ACTIVE]",
                target
            );

            return {

                ok: false,

                blocked: true,

                governance:
                    decision,

                error:
                    "REVIEW_REQUIRED_ACTIVE"
            };
        }



        /* =================================================
           SOFT BLOCK
        ================================================= */

        if (
            decision
                ?.governanceAction ===
            "SUPERVISED_EXECUTION"
        ) {

            console.warn(
                "⚠️ [SUPERVISED_EXECUTION_ACTIVE]",
                target
            );

            return {

                ok: false,

                blocked: true,

                governance:
                    decision,

                error:
                    "SUPERVISED_EXECUTION_ACTIVE"
            };
        }

        /* =================================================
           RESTRICTED EXECUTION
        ================================================= */

        if (
            decision
                ?.governanceAction ===
            "SUPERVISED_EXECUTION"
        ) {

            console.warn(
                "🔒 [SUPERVISED_EXECUTION]",
                target
            );
        }



        /* =================================================
           EXECUTION SIMULATION
        ================================================= */

        console.log(
            "✅ [GOVERNED_EXECUTION_ALLOWED]",
            operation,
            target
        );

        return {

            ok: true,

            blocked: false,

            governance:
                decision,

            operation,

            target,

            payload
        };

    }

    catch(error) {

        console.error(
            "❌ [GOVERNED_OPERATION_FAIL]",
            error
        );

        return {

            ok: false,

            blocked: true,

            error:
                error.message
        };
    }
};

/* =====================================================================================
   GOVERNANCE MEMORY ENGINE V2
===================================================================================== */

window.__GOVERNANCE_LOG__ ||= [];

/* =====================================================
   RECORD GOVERNANCE EVENT
===================================================== */

window.recordGovernanceEvent =
function(event = {}) {

    try {

        const governanceEvent = {

            eventId:
                crypto.randomUUID(),

            timestamp:
                Date.now(),

            operation:
                event.operation ||

                "UNKNOWN",

            target:
                event.target ||

                "UNKNOWN",

            governanceAction:
                event.governanceAction ||

                "UNKNOWN",

            propagatedRisk:
                event.propagatedRisk ||

                "UNKNOWN",

            criticality:
                event.criticality ||

                0,

            allowed:
                event.allowed === true,

            blocked:
                event.blocked === true
        };

        window
            .__GOVERNANCE_LOG__
            .push(governanceEvent);


            /* =============================================
               EMIT GOVERNANCE EVENT
            ============================================= */

emitRuntimeEvent(

    "runtime.governance.recorded",

    governanceEvent,

    {

        channel:
            "governance",

        priority:
            "HIGH",

        source:
            "governance.engine",

        system: true
    }
);
            /* =================================================
               AUTO SAVE
            ================================================= */

saveGovernanceLog();

        console.log(
            "🧠 [GOVERNANCE_EVENT_RECORDED]",
            governanceEvent
        );

        return {

            ok: true,

            event:
                governanceEvent,

            totalEvents:
                window
                    .__GOVERNANCE_LOG__
                    .length
        };

    }

    catch(error) {

        console.error(
            "❌ [GOVERNANCE_MEMORY_FAIL]",
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
   REPO AUTO BOOTSTRAP V2
===================================================================================== */

/* =====================================================
   BOOTSTRAP REPO COGNITION
===================================================== */

window.bootstrapRepoCognition =
async function() {

    try {

        console.log(
            "🧠 [BOOTSTRAP_REPO_COGNITION]"
        );



        /* =================================================
           BUILD COGNITION
        ================================================= */

        const cognition =

            buildRepoCognitionIndex();

        if (!cognition?.ok) {

            throw new Error(
                "COGNITION_BUILD_FAILED"
            );
        }

        /* =================================================
   BUILD DEPENDENCY GRAPH
================================================= */

const graph =

    await buildRepoDependencyGraph();

if (!graph?.ok) {

    throw new Error(
        "GRAPH_BUILD_FAILED"
    );
}

/* =================================================
   SINGLE AUTHORITY: NO MANUAL COGNITIVE LINKS
================================================= */

/* =================================================
   BUILD RUNTIME RISK GRAPH
================================================= */
/* =================================================
   BUILD RUNTIME RISK GRAPH
================================================= */

window.buildRuntimeRiskGraph();

/* =================================================
   BUILD COGNITIVE LAYERS
================================================= */

let layerMap =
    {
        ok:
            true,
        skipped:
            true,
        reason:
            "BUILD_COGNITIVE_LAYER_MAP_UNAVAILABLE"
    };

if (
    typeof buildCognitiveLayerMap === "function"
) {
    layerMap =
        buildCognitiveLayerMap();

    if (!layerMap?.ok) {

        throw new Error(
            "LAYER_MAP_BUILD_FAILED"
        );
    }
}
else {
    console.warn(
        "⚠️ [LAYER_MAP_SKIPPED]",
        {
            reason:
                "buildCognitiveLayerMap no está definido"
        }
    );
}

/* =================================================
   BUILD RUNTIME HEALTH
================================================= */

let runtimeHealth =
    {
        ok:
            true,
        skipped:
            true,
        reason:
            "BUILD_RUNTIME_HEALTH_MAP_UNAVAILABLE"
    };

if (
    typeof buildRuntimeHealthMap === "function"
) {
    runtimeHealth =
        buildRuntimeHealthMap();

    if (!runtimeHealth?.ok) {

        throw new Error(
            "RUNTIME_HEALTH_BUILD_FAILED"
        );
    }
}
else {
    console.warn(
        "⚠️ [RUNTIME_HEALTH_MAP_SKIPPED]",
        {
            reason:
                "buildRuntimeHealthMap no está definido"
        }
    );
}

/* =================================================
   INITIAL RUNTIME STATES
================================================= */

if (
    typeof setRuntimeModuleState === "function"
) {
    Object.keys(
        window.__RUNTIME_HEALTH_MAP__ || {}
    ).forEach((file) => {

        setRuntimeModuleState(
            file,
            "ONLINE"
        );
    });
}
else {
    console.warn(
        "⚠️ [RUNTIME_STATE_INIT_SKIPPED]",
        {
            reason:
                "setRuntimeModuleState no está definido"
        }
    );
}

        /* =================================================
   OPTIONAL GOVERNANCE RESTORE
================================================= */

if (
    window.cognitiveDB
) {

    await restoreGovernanceLog();

}

else {

    console.warn(
        "⚠️ GOVERNANCE_RESTORE_SKIPPED"
    );
}
        /* =================================================
           ONLINE
        ================================================= */

        console.log(
            "✅ [REPO_COGNITION_ONLINE]"
        );

        return {

            ok: true,

            cognitionNodes:
                cognition.total,

            graphNodes:
                graph.total
        };

    }

    catch(error) {

        console.error(
            "❌ [BOOTSTRAP_FAIL]",
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
   AUTO BOOT HYDRATION V2
===================================================================================== */
