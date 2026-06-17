/* =====================================================================================
   RUNTIME DAEMONS MODULE
   Repair daemon, health scanner, suppression, and repair governance locks.
===================================================================================== */

/* =====================================================================================
   START RUNTIME REPAIR DAEMON V1
===================================================================================== */

window.startRuntimeRepairDaemon =
function() {

    try {

        /* =================================================
           ALREADY ACTIVE
        ================================================= */

        if (
            MODULE_CONTEXT
                .runtimeRepairDaemonActive
        ) {

            console.warn(
                "⚠️ [REPAIR_DAEMON_ALREADY_ACTIVE]"
            );

            return {

                ok: false,

                reason:
                    "DAEMON_ALREADY_ACTIVE"
            };
        }

        console.log(
            "🤖 [REPAIR_DAEMON_STARTING]"
        );

        /* =================================================
           ACTIVATE
        ================================================= */

        MODULE_CONTEXT
            .runtimeRepairDaemonActive = true;

        /* =================================================
           LOOP
        ================================================= */

        MODULE_CONTEXT
            .runtimeRepairDaemonInterval =

            setInterval(

                async () => {

                    try {

                        /* =========================
                           ACTIVE CHECK
                        ========================= */

                        if (
                            !MODULE_CONTEXT
                                .runtimeRepairDaemonActive
                        ) {

                            return;
                        }

                        /* =========================
                           QUEUE CHECK
                        ========================= */

                        const queue =

                            MODULE_CONTEXT
                                .runtimeRepairQueue;

                        if (
                            !queue?.length
                        ) {

                            return;
                        }

                        console.log(
                            "🤖 [DAEMON_QUEUE_DETECTED]",
                            queue.length
                        );

                        /* =========================
                           PROCESS
                        ========================= */

                        await processRuntimeRepairQueue();

                    }

                    catch(error) {

                        console.error(
                            "❌ [DAEMON_LOOP_FAIL]",
                            error
                        );
                    }

                },

                3000
            );

        console.log(
            "✅ [REPAIR_DAEMON_ONLINE]"
        );

        return {

            ok: true,

            daemon:
                "ONLINE"
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
   START RUNTIME HEALTH SCANNER V1
===================================================================================== */

window.startRuntimeHealthScanner =
function() {

    try {

        /* =================================================
           ALREADY ACTIVE
        ================================================= */

        if (
            MODULE_CONTEXT
                .runtimeHealthScannerActive
        ) {

            console.warn(
                "⚠️ [HEALTH_SCANNER_ALREADY_ACTIVE]"
            );

            return {

                ok: false,

                reason:
                    "SCANNER_ALREADY_ACTIVE"
            };
        }

        console.log(
            "🩺 [HEALTH_SCANNER_STARTING]"
        );

        /* =================================================
           ACTIVATE
        ================================================= */

        MODULE_CONTEXT
            .runtimeHealthScannerActive = true;

        /* =================================================
           LOOP
        ================================================= */

        MODULE_CONTEXT
            .runtimeHealthScannerInterval =

            setInterval(

                async () => {

                    try {

                        /* =========================
                           ACTIVE CHECK
                        ========================= */

                        if (
                            !MODULE_CONTEXT
                                .runtimeHealthScannerActive
                        ) {

                            return;
                        }

                        /* =========================
   RUNTIME MAP
========================= */

const runtimeMap =

    window
        .__RUNTIME_HEALTH_MAP__ ||

    {};

const entries =

    Object.entries(
        runtimeMap
    );

if (
    !entries.length
) {

    return;
}

/* =========================
   SCAN
========================= */

for (
    const [
        file,
        moduleData
    ]

    of entries
) {

    const state =

        moduleData
            ?.status ||

        "UNKNOWN";

    if (

        state ===
        "DEGRADED"

        ||

        state ===
        "ISOLATED"

        ||

        state ===
        "OFFLINE"
    ) {


        /* =========================
   SUPPRESSION
========================= */

const suppressedUntil =

    MODULE_CONTEXT
        .runtimeHealthSuppression?.[
            file
        ] || 0;

if (
    Date.now() <
    suppressedUntil
) {

    continue;
}
        console.warn(
            "🩺 [HEALTH_ANOMALY_DETECTED]",
            file,
            state
        );

        const alreadyQueued =

            MODULE_CONTEXT
                .runtimeRepairQueue
                .some(
                    item =>
                        item.file === file
                );

        const repairing =

            MODULE_CONTEXT
                .activeRuntimeRepairs
                .has(file);

        const cooldown =

            MODULE_CONTEXT
                .runtimeRepairCooldowns[
                    file
                ];

        if (
            alreadyQueued ||
            repairing ||
            (
                cooldown &&
                Date.now() < cooldown
            )
        ) {

            continue;
        }

        /* =========================
   REGISTER SUPPRESSION
========================= */

MODULE_CONTEXT
    .runtimeHealthSuppression[
        file
    ] =

    Date.now() +

    (
        1000 * 20
    );

        enqueueRuntimeRepair(
            file,
            {
                priority:
                    "HIGH",

                source:
                    "HEALTH_SCANNER"
            }
        );
        processRuntimeRepairQueue();
    }
}

                    }

                    catch(error) {

                        console.error(
                            "❌ [HEALTH_SCANNER_FAIL]",
                            error
                        );
                    }

                },

                5000
            );

        console.log(
            "✅ [HEALTH_SCANNER_ONLINE]"
        );

        return {

            ok: true,

            scanner:
                "ONLINE"
        };

    }

    catch(error) {

        console.error(
            "❌ [HEALTH_SCANNER_START_FAIL]",
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
   RUNTIME REPAIR GOVERNANCE V1
===================================================================================== */

window.canAttemptRuntimeRepair =
function(
    fileName = ""
) {

    try {

        if (!fileName) {

            return {

                ok: false,

                allowed: false,

                reason:
                    "INVALID_FILE"
            };
        }

        /* =================================================
           QUARANTINE
        ================================================= */

        const quarantined =

            MODULE_CONTEXT
                .runtimeQuarantinedModules?.[
                    fileName
                ];

        if (quarantined) {

            console.warn(
                "🛑 [MODULE_QUARANTINED]",
                fileName
            );

            return {

                ok: true,

                allowed: false,

                reason:
                    "MODULE_QUARANTINED"
            };
        }

        /* =================================================
           COOLDOWN
        ================================================= */

        const cooldownUntil =

            MODULE_CONTEXT
                .runtimeRepairCooldowns?.[
                    fileName
                ] || 0;

        if (
            Date.now() <
            cooldownUntil
        ) {

            console.warn(
                "⏳ [REPAIR_COOLDOWN_ACTIVE]",
                fileName
            );

            return {

                ok: true,

                allowed: false,

                reason:
                    "REPAIR_COOLDOWN_ACTIVE",

                cooldownRemaining:

                    cooldownUntil -
                    Date.now()
            };
        }

        /* =================================================
           RETRY ATTEMPTS
        ================================================= */

        const attempts =

            MODULE_CONTEXT
                .runtimeRepairAttempts?.[
                    fileName
                ] || 0;

        if (
            attempts >= 3
        ) {

            console.warn(
                "🛑 [REPAIR_LIMIT_REACHED]",
                fileName
            );

            MODULE_CONTEXT
                .runtimeQuarantinedModules[
                    fileName
                ] = {

                quarantinedAt:
                    Date.now(),

                reason:
                    "MAX_REPAIR_ATTEMPTS"
            };

            return {

                ok: true,

                allowed: false,

                reason:
                    "MAX_REPAIR_ATTEMPTS"
            };
        }

        /* =================================================
           ALLOWED
        ================================================= */

        return {

            ok: true,

            allowed: true,

            attempts
        };

    }

    catch(error) {

        console.error(
            "❌ [REPAIR_GOVERNANCE_FAIL]",
            error
        );

        return {

            ok: false,

            allowed: false,

            error:
                error.message
        };
    }
};
