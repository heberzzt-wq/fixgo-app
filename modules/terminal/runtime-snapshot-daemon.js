/* =====================================================================================
   RUNTIME SNAPSHOT DAEMON MODULE
===================================================================================== */


        /* =========================================================
   GOVERNED SNAPSHOT DAEMON V2
========================================================= */

window.startSnapshotDaemon =
async function() {

    try {

        console.log(
            "🧠 [SNAPSHOT_DAEMON_BOOT]"
        );


        /* =================================================
   SNAPSHOT METRICS INIT
================================================= */

MODULE_CONTEXT
    .snapshotDaemonMetrics ||= {

        startedAt:
            Date.now(),

        totalExecutions:
            0,

        successfulSnapshots:
            0,

        failedSnapshots:
            0,

        skippedSnapshots:
            0,

        lastSnapshotAt:
            null,

        lastFailureAt:
            null
    };
        /* =================================================
           REGISTER DAEMON
        ================================================= */

        registerRuntimeDaemon(

            "runtime.snapshot.daemon",

            {

                interval: 1000 * 60,

                singleton: true,

                critical: true,

                handler: async () => {

                    try {

                        MODULE_CONTEXT
                            .snapshotDaemonMetrics
                            .totalExecutions++;

                        /* =============================
                           GOVERNANCE
                        ============================== */

                        if (

                            MODULE_CONTEXT
                                .runtimeRecoveryActive

                        ) {

                            console.warn(
                                "⚠️ [SNAPSHOT_SKIPPED_RECOVERY_ACTIVE]"
                            );

                            MODULE_CONTEXT
                                .snapshotDaemonMetrics
                                .skippedSnapshots++;

                            return;
                        }

                        if (

                            MODULE_CONTEXT
                                .runtimeState ===
                            "HARD_FAILURE"

                        ) {

                            console.warn(
                                "🚫 [SNAPSHOT_BLOCKED_HARD_FAILURE]"
                            );

                            MODULE_CONTEXT
                                .snapshotDaemonMetrics
                                .skippedSnapshots++;

                            return;
                        }

                        /* =============================
                           SNAPSHOT EXECUTION
                        ============================== */

                        const snapshotResult =

                            await createRuntimeSnapshot();

                        MODULE_CONTEXT
                            .snapshotDaemonMetrics
                            .successfulSnapshots++;

                        MODULE_CONTEXT
                            .snapshotDaemonMetrics
                            .lastSnapshotAt =
                                Date.now();

                        console.log(
                            "✅ [RUNTIME_SNAPSHOT_SUCCESS]",
                            snapshotResult?.snapshotId
                        );

                    }

                    catch(error) {

                        MODULE_CONTEXT
                            .snapshotDaemonMetrics
                            .failedSnapshots++;

                        MODULE_CONTEXT
                            .snapshotDaemonMetrics
                            .lastFailureAt =
                                Date.now();

                        console.error(
                            "❌ [SNAPSHOT_DAEMON_FAIL]",
                            error
                        );
                    }
                }
            }
        );

        /* =================================================
           START DAEMON
        ================================================= */

        const started =

            startRuntimeDaemon(
                "runtime.snapshot.daemon"
            );

        console.log(
            "✅ [SNAPSHOT_DAEMON_ONLINE]"
        );

        return {

            ok: true,

            daemon:
                "ONLINE",

            started
        };

    }

    catch(error) {

        console.error(
            "❌ [SNAPSHOT_DAEMON_BOOT_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};
