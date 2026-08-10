/* =====================================================================================
   PERSISTENT COGNITIVE RUNTIME V2
   SNAPSHOT ENGINE
===================================================================================== */

const RUNTIME_PERSISTENCE_V2_VERSION =
    "2.0.0-runtime-persistence";

window.RuntimePersistenceV2 = {
    version:
        RUNTIME_PERSISTENCE_V2_VERSION,
    authority:
        "full_repo_private_owner",
    persistence:
        "indexeddb_runtime_snapshots",
    safeZone:
        "advisory",
    describe() {
        return {
            ok: true,
            module:
                "runtime_persistence",
            version:
                RUNTIME_PERSISTENCE_V2_VERSION,
            db:
                COGNITIVE_RUNTIME_DB.DB_NAME,
            store:
                COGNITIVE_RUNTIME_DB.STORE_NAME
        };
    }
};

const COGNITIVE_RUNTIME_DB = {

    DB_NAME: "JarvisCognitionDB",

    DB_VERSION: 1,

    STORE_NAME: "runtime_snapshots"
};

window.__RUNTIME_DB__ = null;

window.cognitiveDB = null;

/* =====================================================
   CREATE RUNTIME EVENT ENVELOPE V2
===================================================== */

window.createRuntimeEventEnvelope =

function(

    eventName,
    payload = {},
    options = {}

) {

    try {

        /* =============================================
           ENVELOPE
        ============================================= */

        const envelope = {

            /* =========================================
               CORE IDENTITY
            ========================================= */

            eventId:

                crypto.randomUUID(),

            type:
                eventName,

            timestamp:
                Date.now(),

            /* =========================================
               ROUTING
            ========================================= */

            channel:

                options.channel ||
                "runtime",

            priority:

                options.priority ||
                "NORMAL",

            source:

                options.source ||
                "runtime.kernel",

            /* =========================================
               PAYLOAD
            ========================================= */

            payload,

            /* =========================================
               GOVERNANCE
            ========================================= */

            governance: {

                critical:

                    options.critical ||
                    false,

                isolated:

                    options.isolated ||
                    false,

                repairRelated:

                    options.repairRelated ||
                    false,

                system:

                    options.system ||
                    false
            },

            /* =========================================
               REPLAY METADATA
            ========================================= */

            replay: {

                replayed: false,

                replayId: null,

                replayTimestamp: null
            },

            /* =========================================
               CAUSALITY
            ========================================= */

            causality: {

                parentEventId:

                    options.parentEventId ||
                    null,

                correlationId:

                    options.correlationId ||
                    crypto.randomUUID(),

                chainDepth:

                    options.chainDepth ||
                    0
            },

            /* =========================================
               COGNITIVE TRACE
            ========================================= */

            cognition: {

                daemon:

                    options.daemon ||
                    null,

                cognitiveLayer:

                    options.cognitiveLayer ||
                    "runtime",

                cognitionId:

                    crypto.randomUUID()
            },

            /* =========================================
               RUNTIME TRACE
            ========================================= */

            runtime: {

                runtimeStatus:

                    window
                        .__RUNTIME_STATE__?.status ||

                    "UNKNOWN",

                runtimeHealth:

                    window
                        .__RUNTIME_STATE__?.health ||

                    0
            }
        };

        return envelope;

    }

    catch(error) {

        console.error(
            "❌ [EVENT_ENVELOPE_CREATE_FAIL]",
            error
        );

        return {

            eventId: null,

            type:
                eventName,

            payload,

            error:
                error.message
        };
    }
};
/* =====================================================
   INIT COGNITIVE DB
===================================================== */

window.initRuntimePersistence = async function() {

    try {

        return new Promise((resolve, reject) => {

            const request = indexedDB.open(

                COGNITIVE_RUNTIME_DB.DB_NAME,

                COGNITIVE_RUNTIME_DB.DB_VERSION
            );

            request.onupgradeneeded = (e) => {

                const db = e.target.result;

                if (
                    !db.objectStoreNames.contains(
                        COGNITIVE_RUNTIME_DB.STORE_NAME
                    )
                ) {

                    db.createObjectStore(

                        COGNITIVE_RUNTIME_DB.STORE_NAME,

                        {
                            keyPath: "snapshotId"
                        }
                    );
                }
            };

            request.onsuccess = (e) => {

                window.__RUNTIME_DB__ =
                    e.target.result;

                // =================================================
                // DB BRIDGE
                // =================================================

                window.cognitiveDB =
                    window.__RUNTIME_DB__;

                console.log(
                    "🧠 [COGNITIVE_DB_READY]"
                );

                resolve(true);
            };

            request.onerror = (e) => {

                console.error(
                    "❌ [COGNITIVE_DB_FAIL]",
                    e.target.error
                );

                reject(e.target.error);
            };
        });

    } catch (error) {

        console.error(
            "❌ [COGNITIVE_INIT_FAIL]",
            error
        );

        return false;
    }
};


/* =====================================================
   PRUNE RUNTIME SNAPSHOTS V2
===================================================== */

window.pruneRuntimeSnapshots =
async function() {

    try {

        if (!window.__RUNTIME_DB__) {

            await window
                .initRuntimePersistence();
        }

        const MAX_SNAPSHOTS = 10;

        const tx =

            window.__RUNTIME_DB__
                .transaction(

                    COGNITIVE_RUNTIME_DB
                        .STORE_NAME,

                    "readwrite"
                );

        const store =

            tx.objectStore(

                COGNITIVE_RUNTIME_DB
                    .STORE_NAME
            );

        /* =============================================
           LOAD ALL DOCUMENTS
        ============================================= */

        const snapshots =

            await new Promise(

                (resolve, reject) => {

                    const req =
                        store.getAll();

                    req.onsuccess =
                        () => resolve(
                            req.result || []
                        );

                    req.onerror =
                        () => reject(
                            req.error
                        );
                }
            );

        /* =============================================
           FILTER SNAPSHOTS ONLY
        ============================================= */

        const runtimeSnapshots =

            snapshots.filter(

                (doc) =>

                    doc?.documentType ===
                    "RUNTIME_SNAPSHOT"
            );

        /* =============================================
           BELOW LIMIT
        ============================================= */

        if (

            runtimeSnapshots.length <=
            MAX_SNAPSHOTS

        ) {

            return {

                ok: true,

                deleted: 0
            };
        }

        /* =============================================
           SORT OLDEST FIRST
        ============================================= */

        runtimeSnapshots.sort(

            (a, b) =>

                a.timestamp -
                b.timestamp
        );

        /* =============================================
           SNAPSHOTS TO DELETE
        ============================================= */

        const snapshotsToDelete =

            runtimeSnapshots.slice(

                0,

                runtimeSnapshots.length -
                MAX_SNAPSHOTS
            );

        let deleted = 0;

        /* =============================================
           DELETE OLD SNAPSHOTS
        ============================================= */

        for (

            const snapshot of
            snapshotsToDelete

        ) {

            await new Promise(

                (resolve, reject) => {

                    const req =

                        store.delete(
                            snapshot.snapshotId
                        );

                    req.onsuccess =
                        () => resolve(true);

                    req.onerror =
                        () => reject(
                            req.error
                        );
                }
            );

            deleted++;

            console.log(
                "🗑️ [SNAPSHOT_PRUNED]",
                snapshot.snapshotId
            );
        }

        console.log(
            "✅ [SNAPSHOT_PRUNE_COMPLETED]",
            deleted
        );

        return {

            ok: true,

            deleted
        };

    }

    catch(error) {

        console.error(
            "❌ [SNAPSHOT_PRUNE_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};
/* =====================================================
   CREATE RUNTIME SNAPSHOT V2
===================================================== */

window.createRuntimeSnapshot =
async function() {

    try {

        console.log(
            "📸 [RUNTIME_SNAPSHOT_START]"
        );

        /* =================================================
           INIT DB
        ================================================= */

        if (!window.__RUNTIME_DB__) {

            await window
                .initRuntimePersistence();
        }

        /* =================================================
           SAFE CLONE
        ================================================= */

        const safeClone = (

            typeof structuredClone ===
            "function"

        )

            ? structuredClone

            : (obj) =>

                JSON.parse(
                    JSON.stringify(obj)
                );

        /* =================================================
           RUNTIME REFERENCES
        ================================================= */

        const runtimeModules =

            safeClone(
                MODULE_CONTEXT
                    ?.modules || {}
            );

        const runtimeLoaded =

            safeClone(
                MODULE_CONTEXT
                    ?.loaded || {}
            );

        const runtimeLazyModules =

            safeClone(
                MODULE_CONTEXT
                    ?.lazyModules || {}
            );

        const runtimeHealthMap =

            safeClone(
                window
                    .__RUNTIME_HEALTH_MAP__ || {}
            );

        const dependencyGraph =

            safeClone(
                MODULE_CONTEXT
                    ?.dependencyGraph || {}
            );

        const riskGraph =

            safeClone(
                MODULE_CONTEXT
                    ?.riskGraph || {}
            );

        const criticalityGraph =

            safeClone(
                MODULE_CONTEXT
                    ?.criticalityGraph || {}
            );

        const governance =

            safeClone(
                MODULE_CONTEXT
                    ?.governance || {}
            );

        /* =================================================
           RUNTIME METRICS
        ================================================= */

        const moduleCount =

            Object.keys(
                runtimeModules
            ).length;

        const observedHealthNodes =

            Object.values(
                runtimeHealthMap
            )
            .filter(
                (m) =>
                    m?.observed === true
            );

        const observedModuleCount =
            observedHealthNodes.length;

        const healthyModules =

            observedHealthNodes
            .filter(
                (m) =>
                    m?.status === "ONLINE"
            ).length;

        const degradedModules =

            observedHealthNodes
            .filter(
                (m) =>
                    m?.status === "DEGRADED"
            ).length;

        const isolatedModules =

            observedHealthNodes
            .filter(
                (m) =>
                    m?.status === "ISOLATED"
            ).length;

        const runtimeHealth =

            observedModuleCount > 0

                ? Math.floor(

                    (
                        healthyModules /
                        observedModuleCount
                    ) * 100
                )

                : 100;

        /* =================================================
           RUNTIME STATUS
        ================================================= */

        let runtimeStatus =
            "ONLINE";

        if (
            isolatedModules > 0
        ) {

            runtimeStatus =
                "DEGRADED";
        }

        if (
            degradedModules > 0
        ) {

            runtimeStatus =
                "DEGRADED";
        }

        if (
            runtimeHealth <= 25
        ) {

            runtimeStatus =
                "HARD_FAILURE";
        }

        /* =================================================
           SNAPSHOT
================================================= */

const snapshot = {

    documentType:
        "RUNTIME_SNAPSHOT",

    surface:

        (() => {

            try {

                const path =

                    window.location.pathname
                        .toLowerCase();

                /* =====================================
                   TERMINAL COGNITIVA
                ===================================== */

                if (

                    path.includes(
                        "gestia-terminal"
                    )

                ) {

                    return "admin";
                }

                /* =====================================
                   ADMIN
                ===================================== */

                if (

                    path.includes("admin") ||

                    path.includes("ceo") ||

                    path.includes("noc")

                ) {

                    return "admin";
                }

                /* =====================================
                   TECNICO
                ===================================== */

                if (

                    path.includes("tecnico")

                ) {

                    return "tecnico";
                }

                /* =====================================
                   CLIENTE
                ===================================== */

                if (

                    path.includes("cliente")

                ) {

                    return "cliente";
                }

                /* =====================================
                   B2B
                ===================================== */

                if (

                    path.includes("gestia-modulo") ||

                    path.includes("residencial")

                ) {

                    return "b2b";
                }

                /* =====================================
                   DEFAULT
                ===================================== */

                return "public";

            }

            catch(error) {

                console.error(
                    "🚨 [SURFACE_DETECTION_FAIL]",
                    error
                );

                return "unknown";
            }

        })(),
            /* =============================================
               CORE METADATA
            ============================================= */

            snapshotId:
                crypto.randomUUID(),

            timestamp:
                Date.now(),

            schemaVersion:
                "SNAPSHOT_SCHEMA_V2",

            cognitionVersion:

                MODULE_CONTEXT
                    ?.cognitionVersion ||

                "SIA7_RUNTIME_V2",

            runtimeVersion:
                "RUNTIME_KERNEL_V2",

            createdBy:
                "AUTONOMOUS_DAEMON",

            /* =============================================
   RUNTIME STATE
============================================= */

runtimeStatus,

runtimeHealth,

snapshotScore:
    runtimeHealth,

recoverySafe:

    runtimeStatus !==
    "HARD_FAILURE",

moduleCount,

observedModuleCount,

healthyModules,

degradedModules,

isolatedModules,


/* =============================================
   AUTONOMOUS STATE
============================================= */

autonomous:

    safeClone(

        window.GestiaRuntime
            ?.state
            ?.autonomous || {}

    ),
            /* =============================================
               RUNTIME PAYLOAD
            ============================================= */

            runtime: {

                modules:
                    runtimeModules,

                loaded:
                    runtimeLoaded,

                lazyModules:
                    runtimeLazyModules,

                healthMap:
                    runtimeHealthMap
            },

            /* =============================================
               COGNITIVE GRAPHS
            ============================================= */

            graphs: {

                dependencyGraph,

                riskGraph,

                criticalityGraph
            },

            /* =============================================
               GOVERNANCE
            ============================================= */

            governance,

            /* =============================================
               METADATA
            ============================================= */

            metadata: {

                initializedAt:
                    MODULE_CONTEXT
                        ?.initializedAt ||

                    Date.now(),

                lastSync:
                    MODULE_CONTEXT
                        ?.lastSync ||

                    null,

                snapshotSource:
                    "AUTONOMOUS_RUNTIME",

                persistence:
                    "INDEXED_DB"
            }
        };

        /* =================================================
           SNAPSHOT SIZE
        ================================================= */

        snapshot.snapshotSize =

            JSON.stringify(
                snapshot
            ).length;

        /* =================================================
   STORE SNAPSHOT
================================================= */

const tx =

    window.__RUNTIME_DB__
        .transaction(

            COGNITIVE_RUNTIME_DB
                .STORE_NAME,

            "readwrite"
        );

const store =

    tx.objectStore(

        COGNITIVE_RUNTIME_DB
            .STORE_NAME
    );

await new Promise(

    (resolve, reject) => {

        const req =
            store.put(snapshot);

        req.onsuccess =
            () => resolve(true);

        req.onerror =
            () => reject(req.error);
    }
);

/* =================================================
   PRUNE OLD SNAPSHOTS
================================================= */

await window
    .pruneRuntimeSnapshots();

    /* =================================================
   PRUNE OLD SNAPSHOTS
================================================= */

await window
    .pruneRuntimeSnapshots();

/* =============================================
   EMIT SNAPSHOT EVENT
============================================= */

await emitRuntimeEvent(

    "runtime.snapshot.created",

    {

        snapshotId:
            snapshot.snapshotId,

        runtimeStatus:
            snapshot.runtimeStatus,

        runtimeHealth:
            snapshot.runtimeHealth,

        snapshotScore:
            snapshot.snapshotScore
    },

    {

        channel:
            "persistence",

        priority:
            "HIGH",

        source:
            "snapshot.engine",

        system: true
    }
);

console.log(
    "✅ [RUNTIME_SNAPSHOT_CREATED]",
    {
        snapshotId:
            snapshot.snapshotId,

        runtimeStatus:
            snapshot.runtimeStatus,

        runtimeHealth:
            snapshot.runtimeHealth,

        snapshotSize:
            snapshot.snapshotSize
    }
);

setTimeout(() => {
    window.renderRuntimeBootTable?.({
        source:
            "runtime_snapshot_created_timeout",

        snapshotId:
            snapshot.snapshotId,

        runtimeStatus:
            snapshot.runtimeStatus,

        runtimeHealth:
            snapshot.runtimeHealth
    });
}, 250);

window.renderRuntimeBootTable?.({
    source:
        "runtime_snapshot_created_direct",

    snapshotId:
        snapshot.snapshotId,

    runtimeStatus:
        snapshot.runtimeStatus,

    runtimeHealth:
        snapshot.runtimeHealth
});

}

catch(error) {

    console.error(
        "❌ [SNAPSHOT_CREATE_FAIL]",
        error
    );

    return {

        ok: false,

        error:
            error.message
    };
}
};
/* =====================================================
   GET LATEST RUNTIME SNAPSHOT V2
===================================================== */

window.getLatestRuntimeSnapshot =
async function() {

    try {

        if (!window.__RUNTIME_DB__) {

            await window
                .initRuntimePersistence();
        }

        const tx =
            window.__RUNTIME_DB__
                .transaction(
                    COGNITIVE_RUNTIME_DB
                        .STORE_NAME,
                    "readonly"
                );

        const store =
            tx.objectStore(
                COGNITIVE_RUNTIME_DB
                    .STORE_NAME
            );

        /* =============================================
           LOAD DOCUMENTS
        ============================================= */

        const snapshots =
            await new Promise(
                (resolve, reject) => {

                    const req =
                        store.getAll();

                    req.onsuccess =
                        () =>
                            resolve(
                                req.result || []
                            );

                    req.onerror =
                        () =>
                            reject(
                                req.error
                            );
                }
            );

        /* =============================================
   FILTER ELIGIBLE SNAPSHOTS
============================================= */

const runtimeSnapshots =

    snapshots.filter(

        (doc) => {

            /* ================================
               VALID TYPE
            ================================= */

            if (

                doc?.documentType !==
                "RUNTIME_SNAPSHOT"

            ) {

                return false;
            }

            /* ================================
               RECOVERY SAFE
            ================================= */

            if (

                doc?.recoverySafe ===
                false

            ) {

                return false;
            }

            /* ================================
               HARD FAILURE
            ================================= */

            if (

                doc?.runtimeStatus ===
                "HARD_FAILURE"

            ) {

                return false;
            }

            /* ================================
               MINIMUM HEALTH
            ================================= */

            if (

                (doc?.runtimeHealth || 0)
                < 50

            ) {

                return false;
            }

            return true;
        }
    );
        /* =============================================
           NO SNAPSHOTS
        ============================================= */

        if (
            !runtimeSnapshots.length
        ) {

            return {

                ok: false,

                error:
                    "NO_SNAPSHOTS_FOUND"
            };
        }

        /* =============================================
           SORT BY SCORE + TIMESTAMP
        ============================================= */

        runtimeSnapshots.sort(

            (a, b) => {

                const scoreA =
                    a?.snapshotScore || 0;

                const scoreB =
                    b?.snapshotScore || 0;

                /* =====================================
                   HIGHER SCORE FIRST
                ===================================== */

                if (scoreB !== scoreA) {

                    return scoreB - scoreA;
                }

                /* =====================================
                   NEWEST FIRST
                ===================================== */

                return (

                    b.timestamp -
                    a.timestamp
                );
            }
        );

        /* =============================================
           BEST SNAPSHOT
        ============================================= */

        const latest =
            runtimeSnapshots[0];

        console.log(
            "🧠 [LATEST_RUNTIME_SNAPSHOT]",
            latest
        );

        return {

            ok: true,

            snapshot:
                latest,

            total:
                runtimeSnapshots.length
        };

    }

    catch(error) {

        console.error(
            "❌ [GET_SNAPSHOT_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};

/* =====================================================
   VALIDATE RUNTIME SNAPSHOT V2
===================================================== */

window.validateRuntimeSnapshot =
function(snapshot) {

    try {

        if (!snapshot) {

            return {

                ok: false,

                error:
                    "SNAPSHOT_NOT_FOUND"
            };
        }

        /* =============================================
           REQUIRED CORE
        ============================================= */

        const requiredFields = [

            "snapshotId",
            "timestamp",
            "runtime",
            "graphs",
            "metadata"

        ];

        for (const field of requiredFields) {

            if (

                snapshot[field] ===
                undefined

            ) {

                return {

                    ok: false,

                    error:
                        `MISSING_FIELD_${field}`
                };
            }
        }

        /* =============================================
           REQUIRED RUNTIME
        ============================================= */

        if (

            !snapshot.runtime
                ?.modules

        ) {

            return {

                ok: false,

                error:
                    "INVALID_RUNTIME_MODULES"
            };
        }

        /* =============================================
           REQUIRED GRAPHS
        ============================================= */

        if (

            !snapshot.graphs
                ?.dependencyGraph

        ) {

            return {

                ok: false,

                error:
                    "INVALID_DEPENDENCY_GRAPH"
            };
        }

        /* =============================================
           HARD FAILURE BLOCK
        ============================================= */

        if (

            snapshot.runtimeStatus ===
            "HARD_FAILURE"

        ) {

            return {

                ok: false,

                error:
                    "SNAPSHOT_HARD_FAILURE"
            };
        }

        /* =============================================
           RECOVERY SAFETY
        ============================================= */

        if (

            snapshot.recoverySafe ===
            false

        ) {

            return {

                ok: false,

                error:
                    "SNAPSHOT_NOT_RECOVERY_SAFE"
            };
        }

        /* =============================================
           VALID
        ============================================= */

        return {

            ok: true,

            snapshotId:
                snapshot.snapshotId,

            runtimeHealth:
                snapshot.runtimeHealth ||

                0
        };

    }

    catch(error) {

        console.error(
            "❌ [SNAPSHOT_VALIDATION_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};
/* =====================================================
   RESTORE RUNTIME SNAPSHOT V2
===================================================== */

window.restoreRuntimeSnapshot =
async function() {

    try {

        console.log(
            "♻️ [RUNTIME_RESTORE_START]"
        );

        const latest =

            await window
                .getLatestRuntimeSnapshot();

        if (!latest?.ok) {

            return {

                ok: false,

                error:
                    "SNAPSHOT_NOT_FOUND"
            };
        }

        const snapshot =
            latest.snapshot;

            /* =============================================
   VALIDATE SNAPSHOT
============================================= */

const validation =

    window.validateRuntimeSnapshot(
        snapshot
    );

if (!validation?.ok) {

    console.error(
        "❌ [SNAPSHOT_VALIDATION_FAILED]",
        validation
    );

    return {

        ok: false,

        error:
            validation.error
    };
}

console.log(
    "✅ [SNAPSHOT_VALID]",
    validation
);


/* =============================================
   CROSS SURFACE RESTORE BLOCK V2
============================================= */

const currentSurface = (() => {

    try {

        const path =
            window.location.pathname
                .toLowerCase();

        /* =====================================
           TERMINAL / ADMIN
        ===================================== */

        if (
            path.includes("gestia-terminal") ||
            path.includes("admin") ||
            path.includes("ceo") ||
            path.includes("noc")
        ) {

            return "admin";
        }

        /* =====================================
           TECNICO
        ===================================== */

        if (
            path.includes("tecnico")
        ) {

            return "tecnico";
        }

        /* =====================================
           CLIENTE
        ===================================== */

        if (
            path.includes("cliente")
        ) {

            return "cliente";
        }

        /* =====================================
           B2B
        ===================================== */

        if (
            path.includes("gestia-modulo") ||
            path.includes("residencial")
        ) {

            return "b2b";
        }

        /* =====================================
           DEFAULT
        ===================================== */

        return "public";

    }

    catch(error) {

        console.error(
            "🚨 [SURFACE_RESOLVE_FAIL]",
            error
        );

        return "unknown";
    }

})();

/* =============================================
   GOVERNANCE BLOCK
============================================= */

if (

    snapshot?.surface &&
    currentSurface &&
    snapshot.surface !== currentSurface

) {

    console.warn(
        "🚫 [CROSS_SURFACE_RESTORE_BLOCKED]",
        {
            snapshotSurface:
                snapshot.surface,

            currentSurface
        }
    );

    return {

        ok: false,

        error:
            "CROSS_SURFACE_RESTORE_BLOCKED",

        snapshotSurface:
            snapshot.surface,

        currentSurface
    };
}

        if (!snapshot) {

            return {

                ok: false,

                error:
                    "INVALID_SNAPSHOT"
            };
        }

        /* =================================================
           SAFE RUNTIME RESET
        ================================================= */

        MODULE_CONTEXT.loaded = {};

        MODULE_CONTEXT.modules = {};

        MODULE_CONTEXT.lazyModules = {};

        MODULE_CONTEXT.schemas = {};

        MODULE_CONTEXT.permissions = {};

        MODULE_CONTEXT.widgets = {};

        MODULE_CONTEXT.risks = {};

        MODULE_CONTEXT.validators = {};

        /* =================================================
           RUNTIME RESTORE
        ================================================= */

        MODULE_CONTEXT.modules =

            structuredClone(
                snapshot
                    ?.runtime
                    ?.modules || {}
            );

        MODULE_CONTEXT.loaded =

            structuredClone(
                snapshot
                    ?.runtime
                    ?.loaded || {}
            );

        MODULE_CONTEXT.lazyModules =

            structuredClone(
                snapshot
                    ?.runtime
                    ?.lazyModules || {}
            );


            /* =================================================
   AUTONOMOUS STATE RESTORE
================================================= */

if (

    window.GestiaRuntime &&
    window.GestiaRuntime.state

) {

    window.GestiaRuntime
        .state
        .autonomous =

            structuredClone(

                snapshot
                    ?.autonomous || {}

            );

    console.log(
        "🧠 [AUTONOMOUS_STATE_RESTORED]",
        window.GestiaRuntime
            .state
            .autonomous
    );
}

            /* =================================================
   HEALTH MAP RESTORE
================================================= */

window.__RUNTIME_HEALTH_MAP__ =

    structuredClone(
        snapshot
            ?.runtime
            ?.healthMap || {}
    );

    window.RUNTIME_HEALTH_MAP =
    window.__RUNTIME_HEALTH_MAP__;
        /* =================================================
           GRAPH RESTORE
        ================================================= */

        MODULE_CONTEXT
            .dependencyGraph =

            structuredClone(
                snapshot
                    ?.graphs
                    ?.dependencyGraph || {}
            );

        MODULE_CONTEXT
            .riskGraph =

            structuredClone(
                snapshot
                    ?.graphs
                    ?.riskGraph || {}
            );

        MODULE_CONTEXT
            .criticalityGraph =

            structuredClone(
                snapshot
                    ?.graphs
                    ?.criticalityGraph || {}
            );

        /* =================================================
           GOVERNANCE RESTORE
        ================================================= */

        MODULE_CONTEXT
            .governance =

            structuredClone(
                snapshot
                    ?.governance || {}
            );

        /* =================================================
           METADATA
        ================================================= */

        MODULE_CONTEXT
            .initializedAt =

            snapshot
                ?.metadata
                ?.initializedAt ||

            Date.now();

        MODULE_CONTEXT
            .lastSync =

            snapshot
                ?.metadata
                ?.lastSync ||

            null;

        MODULE_CONTEXT
            .cognitionVersion =

            snapshot
                ?.cognitionVersion ||

            "SIA7_RUNTIME_V2";

        /* =================================================
           RUNTIME RE-REGISTRATION
        ================================================= */

        const modules =

            Object.entries(
                MODULE_CONTEXT
                    ?.loaded || {}
            );

        for (
            const [
                moduleName,
                moduleData
            ] of modules
        ) {

            registerRuntimeModule(
                moduleName,
                moduleData
            );
        }

        console.log(
            "✅ [RUNTIME_RESTORE_OK]"
        );

        return {

            ok: true,

            restoredModules:
                modules.length,

            snapshotId:
                snapshot.snapshotId
        };

    }

    catch(error) {

        console.error(
            "❌ [RUNTIME_RESTORE_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};
