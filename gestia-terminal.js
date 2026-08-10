/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - GESTIA TERMINAL V15.0
 * BLOQUE 1 REFACTORIZADO (HEADER + IMPORTS + CONFIG + LEDGER)
 * ======================================================================================
 * Autor: Heber Mendoza (Arquitecto Supremo) & Jarvis (SIA7 AI)
 * Upgrade: ChatGPT Engineering Assist
 *
 * CAMBIOS V15:
 * ✅ Limpieza de imports no usados
 * ✅ Config centralizada
 * ✅ Nombres consistentes
 * ✅ Ledger más robusto
 * ✅ Logs más limpios
 * ✅ Preparado para Jarvis V4
 * ======================================================================================
 */

/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - TERMINAL CORE ENGINE (V5.18 - KERNEL V4 SYNC)
 * ======================================================================================
 * Identidad: Orquestador de Interfaz y Enlace con el Kernel Soberano.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR.
 * ======================================================================================
 */
// 1. IMPORTS DE INFRAESTRUCTURA
import {
    auth,
    db,
    onAuthStateChanged,
    doc,
    setDoc,
    getDoc,
    serverTimestamp,
    collection
} from "./firebase.js";

import {
    runTransaction,
    addDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// 2. IMPORTS DE KERNEL Y MEMORIA
import {
    JarvisMemory
} from "/gestia-core/jarvis/jarvis.memory.js";

// 3. CORE ENGINES
import {
    resolveTenantContext
} from "/gestia-core/core_auth_tenant_v1.js";

import {
    ejecutarFirewallGlobal
} from "/gestia-core/firewall.engine.js";

import {
    approvePlan
} from "/gestia-core/plans.engine.js?v=jarvis-runtime-macro-v2-20260618";


import {
    BankLedger,
    installLedgerModule
} from "./modules/terminal/ledger.js";

import "./modules/terminal/repo-bootstrap-index.js?v=v94-page-browser-fallback-v115-20260809";

import "./modules/terminal/runtime-repair-health.js?v=jarvis-runtime-macro-v2-20260618";

const TERMINAL_RUNTIME_V2_VERSION =
    "2.0.0-terminal-runtime-pack";

window.__TERMINAL_RUNTIME_V2__ = {
    version:
        TERMINAL_RUNTIME_V2_VERSION,
    authority:
        "full_repo_private_owner",
    safeZone:
        "advisory",
    governanceAction:
        "review_or_supervised_execution",
    packs: [
        "terminal_surface",
        "runtime_governance",
        "runtime_persistence",
        "runtime_platform",
        "runtime_repair_health",
        "runtime_daemons"
    ]
};

window.describeTerminalRuntimeV2 = function() {

    return {
        ok: true,
        runtime:
            "gestia_terminal",
        ...window.__TERMINAL_RUNTIME_V2__
    };
};
/* =====================================================
   GESTIA SOVEREIGN KERNEL
===================================================== */

import "./gestia-core/jarvis.kernel.js?v=jarvis-runtime-macro-v2-20260618";



/* =====================================================
   SELF REPAIR CORE
===================================================== */

import {
    SelfRepairSentinelV10
} from "/gestia-core/self-repair.engine.js";

window.__REPO_SOURCE_CACHE__ ||= {};

window.loadRepoContext ||= async function(fileName = "") {
    try {
        const index =
            window.__REPO_INDEX__ || {};

        const meta =
            index[fileName];

        if (!meta?.path) {
            return {
                ok: false,
                error: "FILE_NOT_REGISTERED",
                file: fileName
            };
        }

        if (window.__REPO_SOURCE_CACHE__[fileName]) {
            return {
                ok: true,
                cached: true,
                file: fileName,
                source: window.__REPO_SOURCE_CACHE__[fileName]
            };
        }

        const response =
            await fetch(meta.path);

        if (!response.ok) {
            throw new Error(
                `REPO_FETCH_FAILED:${response.status}`
            );
        }

        const source =
            await response.text();

        window.__REPO_SOURCE_CACHE__[fileName] =
            source;

        return {
            ok: true,
            cached: false,
            file: fileName,
            source
        };
    }
    catch(error) {
        return {
            ok: false,
            error: error?.message || String(error),
            file: fileName
        };
    }
};

/**
 * =====================================================
 * 🧠 SINAPSIS VISUAL (KERNEL V4 -> HUD)
 * Este bloque escucha al Kernel y actualiza la pantalla
 * =====================================================
 */
JarvisMemory.subscribe((actionType, payload, currentState) => {

    // Sincronización del Micro-HUD (arriba a la derecha en tu HTML)
    const jarvisState = document.getElementById('jarvisState');
    if (jarvisState) {
        jarvisState.innerText = `SIA7: ${actionType}`;
        jarvisState.classList.add('text-gestia-accent');
        setTimeout(() => jarvisState.classList.remove('text-gestia-accent'), 1500);
    }

    // Inyección de Logs en el historial de la Terminal
    if (actionType === 'PUSH_HISTORY' && payload.role === 'assistant') {
        let type = 'info';
        let title = "SIA7 Terminal Log";

        if (payload.message.includes('⚠️')) { type = 'warning'; title = "SIA7 Alerta"; }
        if (payload.message.includes('🚨')) { type = 'error'; title = "SIA7 Bloqueo"; }
        if (payload.message.includes('✅')) { type = 'success'; title = "SIA7 Confirmado"; }

        // Llamamos a la función de renderizado que está en tu HTML
        if (window.renderJarvisResponse) {
            window.renderJarvisResponse(title, payload.message, type);
        }
    }

    // Monitoreo de Técnicos (Jonathan/Luis)
    if (actionType === 'TECH_UPDATE') {
        const msg = `Técnico ${payload.techName} reporta estado: ${payload.statusData.status}`;
        if (window.renderJarvisResponse) {
            window.renderJarvisResponse("SIA7: Flotilla", msg, "info");
        }
    }
});

/**
 * =====================================================
 * 🔥 EXPOSICIÓN GLOBAL (MODO DIOS - CORRECTA)
 * =====================================================
 */


/* =====================================================================================
   ESTADOS DEL SISTEMA
===================================================================================== */

const STATES = {
    IDLE: "IDLE",
    KEY_DERIVATION: "KEY_DERIVATION",
    ANALYZE: "ANALYZE",
    RESOLVE: "RESOLVE",
    DECIDE: "DECIDE",
    WAIT_APPROVAL: "WAIT_APPROVAL",
    JOURNALING: "JOURNALING",
    SIGNING: "SIGNING",
    APPLY_ATOMIC: "APPLY_ATOMIC",
    VERIFY_LEDGER: "VERIFY_LEDGER",
    DONE: "DONE",
    ERROR: "ERROR"
};

/* =====================================================================================
   CONFIG
===================================================================================== */

const GESTIA_CONFIG = {
    VERSION: "15.0-JARVIS-SOVEREIGN",
    DB_NAME: "GestiaAntifraud_DB",
    DB_VERSION: 1,
    LEDGER_COLLECTION: "gestia_financial_ledger",
    TIMEOUT_MS: 30000,
    SIGNATURE_EXPIRY_MS: 30000,
    PLAN_EXPIRY_MS: 30000,
    MAX_PLAN_SIZE: 20
};

/* =====================================================================================
   LOGGER
===================================================================================== */

function logCore(label, data = "") {
    console.log(`🧠 [${label}]`, data);
}

function warnCore(label, data = "") {
    console.warn(`⚠️ [${label}]`, data);
}

function errorCore(label, data = "") {
    console.error(`❌ [${label}]`, data);
}

/* =====================================================================================
   INFRAESTRUCTURA DE PERSISTENCIA DURA (INDEXEDDB)
===================================================================================== */

installLedgerModule({
    db,
    addDoc,
    collection,
    serverTimestamp,
    onSnapshot,
    warnCore,
    STATES,
    GESTIA_CONFIG
});


/* =====================================================
   SANDBOX WRITE ENGINE V2
===================================================== */

window.JARVIS_SANDBOX_FILES ||= {};


/* =====================================================
   FIRESTORE MODULE CONTEXT V2
===================================================== */

window.__MODULE_CONTEXT__ ||= {

    // =================================================
    // RUNTIME LOAD STATE
    // =================================================

    loaded: {},

    // =================================================
    // RUNTIME MODULE REGISTRY
    // =================================================

    modules: {},

    lazyModules: {},

    runtimeSnapshots: {},

   /* =================================================
   RUNTIME REPAIR QUEUE
================================================= */

runtimeRepairQueue: [],

runtimeRepairHistory: [],

runtimeRepairProcessing: false,

/* =================================================
   AUTONOMOUS REPAIR DAEMON
================================================= */

runtimeRepairDaemonActive: false,

runtimeRepairDaemonInterval: null,

/* =================================================
   HEALTH SCANNER
================================================= */

runtimeHealthScannerActive: false,

runtimeHealthScannerInterval: null,

/* =================================================
   SNAPSHOT DAEMON
================================================= */

runtimeSnapshotDaemonActive: false,

runtimeSnapshotDaemonInterval: null,

/* =================================================
   RETRY GOVERNANCE
================================================= */

runtimeRepairCooldowns: {},

runtimeRepairAttempts: {},

runtimeHealthSuppression: {},

runtimeQuarantinedModules: {},
/* =================================================
   ACTIVE RUNTIME REPAIRS
================================================= */

activeRuntimeRepairs: new Set(),

    // =================================================
    // COGNITIVE LAYERS
    // =================================================

    schemas: {},

    permissions: {},

    widgets: {},

    risks: {},

    validators: {},

    dependencies: {},

    dependencyGraph: {},

    riskGraph: {},

    criticalityGraph: {},

    // =================================================
    // GOVERNANCE
    // =================================================

    governance: {

        blockedModules: {},

        degradedModules: {},

        corruptedModules: {},

        repairQueue: []

    },

    // =================================================
    // META
    // =================================================

    lastSync: null,

    initializedAt: Date.now(),

    cognitionVersion: "SIA7_RUNTIME_V2"

};

window.MODULE_CONTEXT =
    window.__MODULE_CONTEXT__;


/* =====================================================================================
   PERSISTENT COGNITIVE RUNTIME V2
   SNAPSHOT ENGINE
===================================================================================== */

await import("./modules/terminal/runtime-persistence.js?v=jarvis-runtime-macro-v2-20260618");

    /* =====================================================================================
   RUNTIME MODULE REGISTRY
===================================================================================== */

window.registerRuntimeModule ||= function(
    moduleName,
    moduleData = {}
) {

    try {

        if (!moduleName) {

            return false;

        }

        MODULE_CONTEXT.modules ||= {};

        MODULE_CONTEXT.loaded ||= {};

        MODULE_CONTEXT.modules[moduleName] = {

            ...moduleData,

            runtimeRegistered: true,

            registeredAt: Date.now(),

            runtimeStatus: "ACTIVE"

        };

        MODULE_CONTEXT.loaded[moduleName] ||= moduleData;

        console.log(
            `🧠 [MODULE_REGISTERED]: ${moduleName}`
        );



        return true;

    }

    catch(error) {

        console.error(
            "❌ [MODULE_REGISTER_ERROR]",
            error
        );

        return false;

    }

};

/* =====================================================================================
   RUNTIME GOVERNANCE, DAEMONS, SCHEDULER AND RISK GRAPH
===================================================================================== */

await import("./modules/terminal/runtime-governance.js?v=jarvis-runtime-macro-v2-20260618");

/* =====================================================
   RUNTIME EVENT BUS AND AUTO HYDRATION
===================================================== */

await import("./modules/terminal/runtime-event-bus.js?v=jarvis-runtime-macro-v2-20260618");


/* =====================================================================================
   GOVERNANCE PERSISTENCE ENGINE V2
===================================================================================== */

/* =====================================================
   SAVE GOVERNANCE LOG
===================================================== */

window.saveGovernanceLog =


async function() {

    /* =================================================
   OPTIONAL DB SYNC
================================================= */

if (
    window.cognitiveDB
) {

    await waitForCognitiveDB();

}


    try {

        if (
            !window.cognitiveDB
        ) {

            console.warn(
                "⚠️ GOVERNANCE_DB_NOT_READY"
            );

            return {
                ok: false
            };
        }

        const governanceStoreName =
    window.COGNITIVE_RUNTIME_DB?.STORE_NAME ||
    window.__COGNITIVE_RUNTIME_DB__?.STORE_NAME ||
    "runtime_snapshots";

if (
    !window.cognitiveDB.objectStoreNames.contains(
        governanceStoreName
    )
) {
    console.warn(
        "⚠️ [GOVERNANCE_STORE_NOT_FOUND]",
        {
            operation:
                "save",
            store:
                governanceStoreName,
            availableStores:
                Array.from(
                    window.cognitiveDB.objectStoreNames || []
                )
        }
    );

    return {
        ok:
            false,
        status:
            "GOVERNANCE_STORE_NOT_FOUND",
        operation:
            "save",
        store:
            governanceStoreName
    };
}

const transaction =
    window.cognitiveDB
        .transaction(
            [
                governanceStoreName
            ],
            "readwrite"
        );

const store =
    transaction.objectStore(
        governanceStoreName
    );
        const payload = {

            snapshotId:
                "governance_log",

            timestamp:
                Date.now(),

            type:
                "governance_memory",

            governanceLog:
                window
                    .__GOVERNANCE_LOG__ || []
        };

        await store.put(
            payload
        );

        console.log(
            "💾 [GOVERNANCE_LOG_SAVED]",
            payload
                .governanceLog
                .length
        );

        return {

            ok: true,

            total:
                payload
                    .governanceLog
                    .length
        };

    }

    catch(error) {

        console.error(
            "❌ [SAVE_GOVERNANCE_FAIL]",
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
   RESTORE GOVERNANCE LOG
===================================================== */

window.restoreGovernanceLog =
async function() {

    try {

        if (
            !window.cognitiveDB
        ) {

            console.warn(
                "⚠️ GOVERNANCE_DB_NOT_READY"
            );

            return {
                ok: false
            };
        }

      const governanceStoreName =
    window.COGNITIVE_RUNTIME_DB?.STORE_NAME ||
    window.__COGNITIVE_RUNTIME_DB__?.STORE_NAME ||
    "runtime_snapshots";

if (
    !window.cognitiveDB.objectStoreNames.contains(
        governanceStoreName
    )
) {
    console.warn(
        "⚠️ [GOVERNANCE_STORE_NOT_FOUND]",
        {
            operation:
                "restore",
            store:
                governanceStoreName,
            availableStores:
                Array.from(
                    window.cognitiveDB.objectStoreNames || []
                )
        }
    );

    return {
        ok:
            false,
        status:
            "GOVERNANCE_STORE_NOT_FOUND",
        operation:
            "restore",
        store:
            governanceStoreName
    };
}

const transaction =
    window.cognitiveDB
        .transaction(
            [
                governanceStoreName
            ],
            "readonly"
        );

const store =
    transaction.objectStore(
        governanceStoreName
    );

        const directRequest =
    store.get(
        "governance_log"
    );

return await new Promise(
    (resolve) => {


        const extractGovernanceCandidate =
function(value = {}) {

    if (
        value.snapshotId === "governance_log" &&
        Array.isArray(value.governanceLog)
    ) {
        return {
            kind: "canonical_governance_log",
            governanceLog: value.governanceLog,
            governance: null,
            timestamp: value.timestamp || 0
        };
    }

    if (
        value.type === "governance_memory" &&
        Array.isArray(value.governanceLog)
    ) {
        return {
            kind: "governance_memory",
            governanceLog: value.governanceLog,
            governance: null,
            timestamp: value.timestamp || 0
        };
    }

    if (
        Array.isArray(value.governanceLog)
    ) {
        return {
            kind: "direct_governance_log",
            governanceLog: value.governanceLog,
            governance: null,
            timestamp: value.timestamp || 0
        };
    }

    if (
        value.documentType === "RUNTIME_SNAPSHOT" &&
        value.governance &&
        typeof value.governance === "object"
    ) {
        return {
            kind: "runtime_snapshot_governance",
            governanceLog:
                Array.isArray(value.governance.governanceLog)
                    ? value.governance.governanceLog
                    : Array.isArray(value.governance.repairQueue)
                        ? value.governance.repairQueue
                        : [],
            governance:
                value.governance,
            timestamp:
                value.timestamp || 0
        };
    }

    return null;
};

        const restoreFromResult =
function(
    candidate,
    source = "unknown",
    key = null
) {

    window
        .__GOVERNANCE_LOG__ =

        candidate
            .governanceLog || [];

    if (
        candidate.governance &&
        window.MODULE_CONTEXT
    ) {
        window.MODULE_CONTEXT.governance =
            structuredClone(
                candidate.governance
            );
    }

    if (
        candidate.governance &&
        window.__MODULE_CONTEXT__
    ) {
        window.__MODULE_CONTEXT__.governance =
            structuredClone(
                candidate.governance
            );
    }

    console.log(
        "♻️ [GOVERNANCE_LOG_RESTORED]",
        {
            total:
                window
                    .__GOVERNANCE_LOG__
                    .length,
            source,
            key,
            kind:
                candidate.kind,
            restoredGovernanceObject:
                !!candidate.governance
        }
    );

    resolve({

        ok:
            true,

        total:
            window
                .__GOVERNANCE_LOG__
                .length,

        source,

        key,

        kind:
            candidate.kind,

        restoredGovernanceObject:
            !!candidate.governance
    });
};

        directRequest.onsuccess =
        function() {

            const directResult =
                directRequest.result;

            if (
    directResult &&
    Array.isArray(
        directResult.governanceLog
    )
) {

    const directCandidate =
        extractGovernanceCandidate(
            directResult
        );

    restoreFromResult(
        directCandidate,
        "direct_key",
        "governance_log"
    );

    return;
}

            const cursorRequest =
                store.openCursor();

            let latestGovernanceResult =
                null;

            let latestGovernanceKey =
                null;

            cursorRequest.onsuccess =
            function(event) {

                const cursor =
                    event.target.result;

                if (
                    !cursor
                ) {

                    if (
                        latestGovernanceResult
                    ) {

                        restoreFromResult(
                            latestGovernanceResult,
                            "cursor_scan_latest",
                            latestGovernanceKey
                        );

                        return;
                    }

                    console.warn(
                        "⚠️ NO_GOVERNANCE_LOG_FOUND"
                    );

                    resolve({
                        ok:
                            false,
                        status:
                            "NO_GOVERNANCE_LOG_FOUND"
                    });

                    return;
                }

                const value =
    cursor.value || {};

const candidate =
    extractGovernanceCandidate(
        value
    );

if (
    candidate
) {

    if (
        !latestGovernanceResult ||
        (
            candidate.timestamp || 0
        ) >= (
            latestGovernanceResult.timestamp || 0
        )
    ) {

        latestGovernanceResult =
            candidate;

        latestGovernanceKey =
            cursor.key;
    }
}

cursor.continue();
            };

            cursorRequest.onerror =
            function() {

                resolve({
                    ok:
                        false,
                    error:
                        "RESTORE_CURSOR_FAILED"
                });
            };
        };

        directRequest.onerror =
        function() {

            resolve({
                ok:
                    false,
                error:
                    "RESTORE_DIRECT_FAILED"
            });
        };
    });

    }

    catch(error) {

        console.error(
            "❌ [RESTORE_GOVERNANCE_FAIL]",
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
   COGNITIVE DB SYNCHRONIZER V2
===================================================================================== */

/* =====================================================
   WAIT FOR DB
===================================================== */

window.waitForCognitiveDB =
async function(
    timeout = 10000
) {

    try {

        const start =
            Date.now();

        while (

            !window.cognitiveDB
        ) {

            if (

                Date.now() - start
                > timeout
            ) {

                throw new Error(
                    "COGNITIVE_DB_TIMEOUT"
                );
            }

            await new Promise(
                resolve =>

                    setTimeout(
                        resolve,
                        100
                    )
            );
        }

        console.log(
            "🧠 [COGNITIVE_DB_SYNC_READY]"
        );

        return {

            ok: true
        };

    }

    catch(error) {

        console.error(
            "❌ [DB_SYNC_FAIL]",
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
   REPO BOOTSTRAP INDEX
===================================================== */



await import("./modules/terminal/patch-workflow.js?v=jarvis-runtime-macro-v2-20260618");




/* =====================================================
   SINGLE SEMANTIC AUTHORITY REGISTRY
===================================================== */

window.__RUNTIME_MODULES__ ||= {};
window.__RUNTIME_MODULES__.core =
    window.__REPO_INDEX__["gestia-core.js"];
window.__SEMANTIC_AUTHORITY__ = Object.freeze({
    planner: "jarvisSemanticPlan",
    alternateBrains: 0,
    failClosed: true
});

/* =====================================================
   REPO LOOKUP ENGINE
===================================================== */
/* =====================================================
   REPO LOOKUP ENGINE
===================================================== */

window.findRepoFile = function(query = "") {

    try {

        const lookupValue =
            query && typeof query === "object"
                ? (query.file || query.path || query.target || query.query || "")
                : query;

        const q =
            String(lookupValue || "")
            .toLowerCase()
            .trim();

        const entries =
            Object.entries(
                window.__REPO_INDEX__ || {}
            );

        return entries.find(([key, meta]) => {

            return (
                key.toLowerCase().includes(q) ||

                meta?.module
                    ?.toLowerCase()
                    .includes(q) ||

                meta?.type
                    ?.toLowerCase()
                    .includes(q)
            );

        }) || null;

    } catch (err) {

        console.warn(
            "⚠️ REPO_LOOKUP_FAIL:",
            err
        );

        return null;
    }
};

/* =====================================================
   REPO CONTEXT LOADER
===================================================== */

window.__REPO_SOURCE_CACHE__ ||= {};

window.loadRepoContext ||= async function(fileName = "") {

    try {

        const found =
            window.findRepoFile(fileName);

        if (!found) {
            throw new Error(
                "FILE_NOT_REGISTERED"
            );
        }

        const [
            key,
            meta
        ] = found;

        console.log(
            "🧠 [REPO_LOAD]:",
            key
        );

        // 🔥 cache hit
        if (
            window.__REPO_SOURCE_CACHE__[key]
        ) {

            return {
                ok: true,
                cached: true,
                file: key,
                source:
                    window.__REPO_SOURCE_CACHE__[key]
            };
        }

        // 🔥 runtime fetch
        const response =
            await fetch(meta.path);

        if (!response.ok) {
            throw new Error(
                `REPO_FETCH_FAILED:${response.status}`
            );
        }

        const source =
            await response.text();

        // 🔥 cache
        window.__REPO_SOURCE_CACHE__[key] =
            source;

        return {
            ok: true,
            cached: false,
            file: key,
            source
        };

    } catch (err) {

        console.warn(
            "⚠️ REPO_CONTEXT_FAIL:",
            err
        );

        return {
            ok: false,
            error: err.message
        };
    }
};


/* =====================================================
   FIRESTORE MODULE LOADER V2
===================================================== */

window.loadFirestoreModule = async function(moduleName = "") {

    try {

        if (!moduleName) {

            throw new Error(
                "MODULE_NAME_REQUIRED"
            );
        }

        console.log(
            "🧠 [FS_MODULE_LOAD]:",
            moduleName
        );

        // 🔥 cache hit
        if (
            window.MODULE_CONTEXT?.loaded?.[
                moduleName
            ]
        ) {

            return {

                ok: true,

                cached: true,

                module: moduleName
            };
        }

        const modRef = doc(
            db,
            "gestia_system_modules",
            moduleName
        );

        const snap =
            await getDoc(modRef);

        if (!snap.exists()) {

            return {

                ok: false,

                reason:
                    "MODULE_NOT_FOUND",

                module:
                    moduleName
            };
        }

        const data =
            snap.data() || {};

        /* =====================================================
           UNIVERSAL NORMALIZATION
        ===================================================== */

        const normalized =
            window.normalizeModule?.(
                data
            ) || data;

        // 🔒 validación mínima

        if (!normalized.version) {

            throw new Error(
                "MODULE_VERSION_MISSING"
            );
        }

        // 🧠 registro cognitivo

        window.MODULE_CONTEXT
            .loaded[moduleName] =
                normalized;

                // =====================================================
// RUNTIME REGISTRATION
// =====================================================

registerRuntimeModule(
    moduleName,
    normalized
);

        window.MODULE_CONTEXT
            .schemas[moduleName] =
                normalized.schema || {};

        window.MODULE_CONTEXT
            .permissions[moduleName] =
                normalized.permissions || {};

        window.MODULE_CONTEXT
            .widgets[moduleName] =
                normalized.widgets || [];

        window.MODULE_CONTEXT
            .validators[moduleName] =
                normalized.validators || {};

        window.MODULE_CONTEXT
            .risks[moduleName] =
                normalized.risks || [];

        window.MODULE_CONTEXT
            .lastSync = Date.now();

            /* =====================================================
   AUTO DEPENDENCY HYDRATION
===================================================== */

for (const dep of normalized.dependencies || []) {

    if (
        !window.MODULE_CONTEXT
            ?.loaded?.[dep]
    ) {

        console.log(
            "🧠 [AUTO_DEP_LOAD]:",
            dep
        );

        try {

            await window
                .loadFirestoreModule(
                    dep
                );

        } catch (err) {

            console.warn(
                "⚠️ AUTO_DEP_FAIL:",
                dep,
                err.message
            );
        }
    }
}

        console.log(
            "✅ [MODULE_READY]:",
            moduleName
        );

        return {

            ok: true,

            module:
                moduleName,

            version:
                normalized.version,

            type:
                normalized.type || "generic",

            cached: false
        };

    } catch (err) {

        console.warn(
            "⚠️ MODULE_LOAD_FAIL:",
            err
        );

        return {

            ok: false,

            error:
                err.message,

            module:
                moduleName
        };
    }
};

/* =====================================================
   MODULE NORMALIZER V2
===================================================== */

window.normalizeModule = function(rawModule = {}) {

    try {

        return {

            // 🔥 identidad
            id:
                rawModule.modulo_id ||

                rawModule.id ||

                "unknown_module",

            name:
                rawModule.nombre_display ||

                rawModule.name ||

                "Unnamed Module",

            version:
                rawModule.version ||

                rawModule.version_motor ||

                "0.0.0",

            description:
                rawModule.descripcion ||

                "",

            // 🔐 seguridad
            roles:

                rawModule.seguridad_roles ||

                rawModule.roles ||

                [],

            // 🧩 widgets
            widgets:

                rawModule.widgets_pro ||

                rawModule.widgets ||

                rawModule
                    ?.esquema_interfaz
                    ?.widgets_pro ||

                [],

            // 🧠 schema runtime
            schema:

                rawModule
                    ?.esquema_base_datos ||

                rawModule.schema ||

                {},

            // ⚙️ acciones
            actions:

                rawModule
                    ?.esquema_interfaz
                    ?.acciones_permitidas ||

                rawModule.actions ||

                [],

            // 🔗 repo cognition
            repoFiles:

                rawModule.repo_files ||

                [],

                // 🧠 module dependencies
                dependencies:

                rawModule.dependencies ||

                [],

            // 🚨 riesgos
            risks:

                rawModule.risk_rules ||

                [],

            // 🧪 validators
            validators:

                rawModule.validators ||

                {},

            // 🎨 UI
            icon:

                rawModule.icono ||

                "cube",

            // 🔧 runtime
            active:
                rawModule.active !== false,

            raw:
                rawModule
        };

    } catch (err) {

        console.warn(
            "⚠️ MODULE_NORMALIZE_FAIL:",
            err
        );

        return {

            ok: false,

            error:
                err.message
        };
    }
};


/* =====================================================
   MODULE INSPECTOR V3
===================================================== */

window.inspectModule = function(moduleName = "") {

    try {

        console.log(
            "🧠 [INSPECT_MODULE]:",
            moduleName
        );

        console.log(
            "🧠 [MODULES_AVAILABLE]:",
            Object.keys(
                window.MODULE_CONTEXT
                    ?.loaded || {}
            )
        );

        const loaded =
            window.MODULE_CONTEXT
                ?.loaded || {};

        const mod =
    loaded[moduleName];

// =====================================================
// RUNTIME REGISTRATION
// =====================================================

if (mod) {

    registerRuntimeModule(
        moduleName,
        mod
    );

}

        if (!mod) {

            return {

                ok: false,

                error:
                    "MODULE_NOT_LOADED",

                available:
                    Object.keys(
                        loaded
                    )
            };
        }

        const risks = [];

        /* =========================
           VERSION
        ========================= */

        if (!mod.version) {

            risks.push(
                "VERSION_MISSING"
            );
        }

        /* =========================
           ROLES
        ========================= */

        if (
            !Array.isArray(
                mod.roles
            )
        ) {

            risks.push(
                "ROLES_INVALID"
            );
        }

        /* =========================
           WIDGETS
        ========================= */

        if (
            !Array.isArray(
                mod.widgets
            )
        ) {

            risks.push(
                "WIDGETS_INVALID"
            );
        }

        /* =========================
           ACTIONS
        ========================= */

        if (
            !Array.isArray(
                mod.actions
            )
        ) {

            risks.push(
                "ACTIONS_INVALID"
            );
        }

        /* =========================
           SCHEMA
        ========================= */

        if (
            typeof mod.schema !==
            "object"
        ) {

            risks.push(
                "SCHEMA_INVALID"
            );
        }

        return {

            ok: true,

            module:
                moduleName,

            id:
                mod.id,

            name:
                mod.name,

            version:
                mod.version,

            risks,

            roles:
    mod.roles || [],

widgets:
    mod.widgets || [],

repoFiles:
    mod.repoFiles || [],

// 🧠 module graph
dependencies:
    mod.dependencies || [],

actions:
    mod.actions || [],

fields:
    mod.schema
        ?.campos
        ?.length || 0,

active:
    mod.active !== false
        };

    } catch (err) {

        console.warn(
            "⚠️ MODULE_INSPECT_FAIL:",
            err
        );

        return {

            ok: false,

            error:
                err.message
        };
    }
};


/* =====================================================
   MODULE FILE LOOKUP V2
===================================================== */

window.findModuleByFile = function(fileName = "") {

    try {

        const loaded =
            window.MODULE_CONTEXT
                ?.loaded || {};

        for (const moduleName in loaded) {

            const mod =
                loaded[moduleName];

            const repoFiles =
                mod.repoFiles || [];

            if (
                repoFiles.includes(
                    fileName
                )
            ) {

                return {

                    ok: true,

                    module:
                        moduleName,

                    file:
                        fileName
                };
            }
        }

        return {

            ok: false,

            reason:
                "MODULE_NOT_FOUND",

            file:
                fileName
        };

    } catch (err) {

        console.warn(
            "⚠️ MODULE_LOOKUP_FAIL:",
            err
        );

        return {

            ok: false,

            error:
                err.message
        };
    }
};

/* =====================================================
   FILE IMPACT ENGINE V2
===================================================== */

window.analyzeFileImpact = function(fileName = "") {

    try {

        const lookup =
            window.findModuleByFile(
                fileName
            );

        if (!lookup.ok) {

            return {

                ok: false,

                error:
                    "MODULE_NOT_FOUND",

                file:
                    fileName
            };
        }

        const mod =
            window.inspectModule(
                lookup.module
            );

        const risk =
            window.evaluateModuleRisk(
                lookup.module
            );

        return {

            ok: true,

            file:
                fileName,

            module:
                lookup.module,

            moduleName:
                mod.name,

            roles:
                mod.roles || [],

            widgets:
                mod.widgets || [],

            actions:
                mod.actions || [],

            totalFields:
                mod.fields || 0,

            risks:
                risk.risks || []
        };

    } catch (err) {

        console.warn(
            "⚠️ FILE_IMPACT_FAIL:",
            err
        );

        return {

            ok: false,

            error:
                err.message
        };
    }
};

/* =====================================================
   DEPENDENCY IMPACT ENGINE V2
===================================================== */

window.findDependentModules = function(moduleName = "") {

    try {

        const loaded =
            window.MODULE_CONTEXT
                ?.loaded || {};

        const impacted = [];

        for (const name in loaded) {

            const mod =
                loaded[name];

            const deps =
                mod.dependencies || [];

            if (
                deps.includes(
                    moduleName
                )
            ) {

                impacted.push({

                    module:
                        name,

                    name:
                        mod.name ||

                        name,

                    dependencies:
                        deps
                });
            }
        }

        return {

            ok: true,

            target:
                moduleName,

            total:
                impacted.length,

            impacted
        };

    } catch (err) {

        console.warn(
            "⚠️ DEPENDENCY_IMPACT_FAIL:",
            err
        );

        return {

            ok: false,

            error:
                err.message
        };
    }
};


/* =====================================================
   RISK PROPAGATION ENGINE V2
===================================================== */

window.propagateModuleRisk = function(moduleName = "") {

    try {

        const sourceRisk =
            window.evaluateModuleRisk(
                moduleName
            );

        const impacted =
            window.findDependentModules(
                moduleName
            );

        if (!sourceRisk.ok) {

            return {

                ok: false,

                error:
                    "SOURCE_MODULE_INVALID"
            };
        }

        const propagated = [];

        for (const item of impacted.impacted || []) {

            propagated.push({

                module:
                    item.module,

                inheritedFrom:
                    moduleName,

                inheritedRisks:
                    sourceRisk.risks || [],

                level:
                    "propagated"
            });
        }

        return {

            ok: true,

            source:
                moduleName,

            sourceRisks:
                sourceRisk.risks || [],

            totalAffected:
                propagated.length,

            propagated
        };

    } catch (err) {

        console.warn(
            "⚠️ RISK_PROPAGATION_FAIL:",
            err
        );

        return {

            ok: false,

            error:
                err.message
        };
    }
};

/* =====================================================
   DEPENDENCY INTEGRITY ENGINE V2
===================================================== */

window.validateModuleDependencies = function(moduleName = "") {

    try {

        const mod =
            window.inspectModule(
                moduleName
            );

        if (!mod.ok) {

            return {

                ok: false,

                error:
                    "MODULE_NOT_FOUND"
            };
        }

        const loaded =
            window.MODULE_CONTEXT
                ?.loaded || {};

        const missing = [];

        for (
            const dep of
            mod.dependencies || []
        ) {

            if (!loaded[dep]) {

                missing.push(dep);
            }
        }

        return {

            ok: true,

            module:
                moduleName,

            totalDependencies:
                mod.dependencies
                    ?.length || 0,

            missingDependencies:
                missing,

            integrity:
                missing.length === 0
        };

    } catch (err) {

        console.warn(
            "⚠️ DEP_INTEGRITY_FAIL:",
            err
        );

        return {

            ok: false,

            error:
                err.message
        };
    }
};

/* =====================================================================================
   AUTO HEALING GOVERNANCE V2
   DEPENDENCY REPAIR ENGINE
===================================================================================== */

window.proposeDependencyRepair = async function(moduleName) {

    try {

        console.log(
            `🛠️ [DEPENDENCY_REPAIR]: Analizando ${moduleName}`
        );

        // =========================================================
        // VALIDACIÓN BASE
        // =========================================================

        if (!moduleName) {

            return {

                success: false,

                error:
                    "MODULE_NAME_REQUIRED"
            };
        }

        // =========================================================
        // RUNTIME SOURCE RESOLUTION
        // =========================================================

        const runtimeModule =

            MODULE_CONTEXT?.modules?.[moduleName] ||

            MODULE_CONTEXT?.loaded?.[moduleName];

        if (!runtimeModule) {

            return {

                success: false,

                error:
                    "MODULE_NOT_FOUND"
            };
        }

        // =========================================================
        // COGNITIVE SOURCES
        // =========================================================

        const moduleData =
            runtimeModule;

        const dependencyCheck =
            validateModuleDependencies(
                moduleName
            );

        const propagatedRisk =
            propagateModuleRisk(
                moduleName
            );

        const criticality =
            calculateModuleCriticality(
                moduleName
            );

        // =========================================================
        // EXTRAER DEPENDENCIAS FALTANTES
        // =========================================================

        const missingDependencies =
            dependencyCheck
                ?.missingDependencies || [];

        // =========================================================
        // REPAIR GRAPH
        // =========================================================

        const repairGraph = {

            module:
                moduleName,

            timestamp:
                Date.now(),

            criticality,

            propagatedRisk,

            totalMissing:
                missingDependencies.length,

            missingDependencies,

            repairCandidates: [],

            blockers: [],

            warnings: [],

            severity:
                "LOW",

            autoRepairEligible:
                false,

            graphRebuildRequired:
                false,

            governanceAction:
                "ALLOW"
        };

        // =========================================================
        // ANALIZAR DEPENDENCIAS FALTANTES
        // =========================================================

        for (
            const dep of
            missingDependencies
        ) {

            const repairCandidate = {

                dependency:
                    dep,

                existsInModules:
                    false,

                existsInRepo:
                    false,

                existsInLazyRuntime:
                    false,

                suggestedAction:
                    null,

                confidence:
                    0
            };

            // =============================================
            // EXISTE EN MODULE_CONTEXT
            // =============================================

            if (
                MODULE_CONTEXT
                    ?.modules?.[dep]
            ) {

                repairCandidate
                    .existsInModules = true;

                repairCandidate
                    .suggestedAction =
                        "RELINK_MODULE_REFERENCE";

                repairCandidate
                    .confidence = 95;
            }

            // =============================================
            // EXISTE EN LAZY MODULES
            // =============================================

            else if (
                MODULE_CONTEXT
                    ?.lazyModules?.[dep]
            ) {

                repairCandidate
                    .existsInLazyRuntime = true;

                repairCandidate
                    .suggestedAction =
                        "LAZY_HYDRATION";

                repairCandidate
                    .confidence = 75;
            }

            // =============================================
            // NO EXISTE
            // =============================================

            else {

                repairCandidate
                    .suggestedAction =
                        "CREATE_MODULE";

                repairCandidate
                    .confidence = 40;

                repairGraph.blockers.push({

                    type:
                        "MISSING_RUNTIME_MODULE",

                    dependency:
                        dep
                });
            }

            repairGraph
                .repairCandidates
                .push(repairCandidate);
        }

        // =========================================================
        // SEVERITY CLASSIFICATION
        // =========================================================

        if (
            criticality?.score >= 90
        ) {

            repairGraph.severity =
                "CRITICAL";

            repairGraph
                .governanceAction =
                    "REVIEW_REQUIRED";

            repairGraph
                .graphRebuildRequired =
                    true;
        }

        else if (
            criticality?.score >= 70
        ) {

            repairGraph.severity =
                "HIGH";

            repairGraph
                .governanceAction =
                    "SUPERVISED_EXECUTION";
        }

        else if (
            missingDependencies
                .length > 0
        ) {

            repairGraph.severity =
                "MEDIUM";

            repairGraph
                .governanceAction =
                    "SUPERVISED_EXECUTION";
        }

        // =========================================================
        // AUTO REPAIR ELIGIBILITY
        // =========================================================

        const safeRepairs =

            repairGraph
                .repairCandidates
                .every(

                    candidate =>

                        candidate
                            .confidence >= 75
                );

        repairGraph
            .autoRepairEligible =
                safeRepairs;

        // =========================================================
        // FINAL LOG
        // =========================================================

        console.log(
            "🧠 [REPAIR_GRAPH]",
            repairGraph
        );

        return {

            success: true,

            repairGraph
        };

    }

    catch(error) {

        console.error(
            "❌ [DEPENDENCY_REPAIR_ERROR]",
            error
        );

        return {

            success: false,

            error:
                error.message
        };

    }

};

/* =====================================================================================
   SELF HEALING PLANNER V2
===================================================================================== */

window.generateRepairPlan = function(
    repairGraph = {}
) {

    try {

        if (!repairGraph.module) {

            return {

                ok: false,

                error:
                    "INVALID_REPAIR_GRAPH"
            };
        }

        const actions = [];

        // =====================================================
        // GOVERNANCE LOCK
        // =====================================================

        if (
            repairGraph.severity ===
            "CRITICAL"
        ) {

            actions.push({

                step: 1,

                type:
                    "REVIEW_REQUIRED_MODULE",

                target:
                    repairGraph.module,

                priority:
                    "CRITICAL"
            });
        }

        // =====================================================
        // DEPENDENCY REPAIRS
        // =====================================================

        let stepCounter =
            actions.length + 1;

        for (
            const candidate of
            repairGraph
                .repairCandidates || []
        ) {

            actions.push({

                step:
                    stepCounter++,

                type:
                    candidate
                        .suggestedAction ||

                    "MANUAL_REVIEW",

                target:
                    candidate
                        .dependency,

                confidence:
                    candidate
                        .confidence || 0,

                priority:
                    repairGraph.severity
            });
        }

        // =====================================================
        // GRAPH REBUILD
        // =====================================================

        if (
            repairGraph
                .graphRebuildRequired
        ) {

            actions.push({

                step:
                    stepCounter++,

                type:
                    "REBUILD_COGNITIVE_GRAPH",

                target:
                    repairGraph.module,

                priority:
                    "HIGH"
            });
        }

        // =====================================================
        // REVALIDATION
        // =====================================================

        actions.push({

            step:
                stepCounter++,

            type:
                "REVALIDATE_RUNTIME_GOVERNANCE",

            target:
                repairGraph.module,

            priority:
                "HIGH"
        });

        return {

            ok: true,

            module:
                repairGraph.module,

            severity:
                repairGraph.severity,

            governanceAction:
                repairGraph
                    .governanceAction,

            totalActions:
                actions.length,

            estimatedRisk:
                repairGraph.severity,

            requiresApproval:

                repairGraph.severity ===
                "CRITICAL",

            executionMode:

                repairGraph
                    .autoRepairEligible

                    ? "SAFE_AUTOMATIC"

                    : "SUPERVISED",

            actions

        };

    }

    catch(error) {

        console.error(
            "❌ [REPAIR_PLAN_ERROR]",
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
   CONTROLLED REPAIR EXECUTION ENGINE V2
===================================================================================== */

window.executeRepairPlan = async function(
    repairPlan = {}
) {

    try {

        if (!repairPlan.ok) {

            return {

                ok: false,

                error:
                    "INVALID_REPAIR_PLAN"
            };
        }

        console.log(
            "⚙️ [EXECUTE_REPAIR_PLAN]",
            repairPlan.module
        );

        const executionLog = [];

        // =====================================================
        // EXECUTION LOOP
        // =====================================================

        for (
            const action of
            repairPlan.actions || []
        ) {

            const result = {

                step:
                    action.step,

                type:
                    action.type,

                target:
                    action.target,

                success:
                    true,

                timestamp:
                    Date.now()
            };

            // =================================================
            // HARD BLOCK
            // =================================================

            if (
                action.type ===
                "REVIEW_REQUIRED_MODULE"
            ) {

                MODULE_CONTEXT
                    .governance
                    .blockedModules[
                        action.target
                    ] = true;


/* ================================================
   RUNTIME ISOLATION STATE
================================================ */

window.__RUNTIME_HEALTH_MAP__ ||= {};

window.__RUNTIME_HEALTH_MAP__[
    action.target
] ||= {};

window.__RUNTIME_HEALTH_MAP__[
    action.target
].isolated = true;

window.__RUNTIME_HEALTH_MAP__[
    action.target
].state = "ISOLATED";

window.__RUNTIME_HEALTH_MAP__[
    action.target
].isolationTimestamp =

    Date.now();

    /* ================================================
   SOVEREIGN RUNTIME FEDERATION
================================================ */


    /* ================================================
   KERNEL SOVEREIGN API
================================================ */

window
    .GestiaRuntime
    ?.sovereignRuntime
    ?.isolateHub?.(

        action.target,

        "HARD_RUNTIME_RECOVERY"
    );

                console.log(
                    `⛔ [MODULE_BLOCKED]: ${action.target}`
                );
            }

            // =================================================
            // CREATE MODULE
            // =================================================

            else if (
                action.type ===
                "CREATE_MODULE"
            ) {

                MODULE_CONTEXT
                    .lazyModules ||= {};

                MODULE_CONTEXT
                    .lazyModules[
                        action.target
                    ] = {

                        id:
                            action.target,

                        runtimeGenerated:
                            true,

                        generatedAt:
                            Date.now(),

                        placeholder:
                            true
                    };

                console.log(
                    `🧩 [PLACEHOLDER_MODULE_CREATED]: ${action.target}`
                );
            }

            // =================================================
            // LAZY HYDRATION
            // =================================================

            else if (
                action.type ===
                "LAZY_HYDRATION"
            ) {

                const lazyModule =

                    MODULE_CONTEXT
                        ?.lazyModules?.[
                            action.target
                        ];

                if (lazyModule) {

                    MODULE_CONTEXT
                        .modules[
                            action.target
                        ] = lazyModule;

                    console.log(
                        `💧 [LAZY_MODULE_HYDRATED]: ${action.target}`
                    );
                }
            }

            // =================================================
            // GRAPH REBUILD
            // =================================================

            else if (
                action.type ===
                "REBUILD_COGNITIVE_GRAPH"
            ) {

                MODULE_CONTEXT
                    .dependencyGraph ||= {};

                MODULE_CONTEXT
                    .riskGraph ||= {};

                MODULE_CONTEXT
                    .criticalityGraph ||= {};

                console.log(
                    `🧠 [COGNITIVE_GRAPH_REBUILT]: ${action.target}`
                );
            }

            // =================================================
            // REVALIDATE GOVERNANCE
            // =================================================

            else if (
                action.type ===
                "REVALIDATE_RUNTIME_GOVERNANCE"
            ) {

                const validation =

                    await proposeDependencyRepair(
                        action.target
                    );

                    console.log(
    "🧪 [VALIDATION_RESULT]",
    validation
);

                result.validation =
                    validation;

                console.log(
                    `✅ [RUNTIME_REVALIDATED]: ${action.target}`
                );


/* ================================================
   AUTONOMOUS RUNTIME REINTEGRATION
================================================ */

if (
    validation?.success === true
) {

    window.__RUNTIME_HEALTH_MAP__ ||= {};

    window.__RUNTIME_HEALTH_MAP__[
        action.target
    ] ||= {};

    window.__RUNTIME_HEALTH_MAP__[
        action.target
    ].isolated = false;

    window.__RUNTIME_HEALTH_MAP__[
        action.target
    ].state = "ONLINE";

    window.__RUNTIME_HEALTH_MAP__[
        action.target
    ].health = 100;

    window.__RUNTIME_HEALTH_MAP__[
        action.target
    ].reintegrationTimestamp =

        Date.now();

    MODULE_CONTEXT
        .governance
        .blockedModules[
            action.target
        ] = false;

    console.log(
        `♻️ [RUNTIME_REINTEGRATED]: ${action.target}`
    );
}
            }

            executionLog.push(result);
        }

        return {

            ok: true,

            module:
                repairPlan.module,

            executionMode:
                repairPlan.executionMode,

            totalExecuted:
                executionLog.length,

            executionLog

        };

    }

    catch(error) {

        console.error(
            "❌ [REPAIR_EXECUTION_ERROR]",
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
   DEPENDENCY REPAIR WORKFLOW BRIDGE V2
   Connects graph analysis, supervised preview, and optional execution.
===================================================================================== */

window.runDependencyRepairWorkflow = async function({
    moduleName = "",
    preview = true,
    execute = false
} = {}) {

    try {

        if (!moduleName) {

            return {
                ok: false,
                error:
                    "MODULE_NAME_REQUIRED"
            };
        }

        const graphResult =
            await window.proposeDependencyRepair(
                moduleName
            );

        if (!graphResult?.success) {

            return {
                ok: false,
                stage:
                    "GRAPH",
                error:
                    graphResult?.error ||
                    "REPAIR_GRAPH_FAILED"
            };
        }

        const repairPlan =
            window.generateRepairPlan(
                graphResult.repairGraph
            );

        if (!repairPlan?.ok) {

            return {
                ok: false,
                stage:
                    "PLAN",
                error:
                    repairPlan?.error ||
                    "REPAIR_PLAN_FAILED",
                repairGraph:
                    graphResult.repairGraph
            };
        }

        if (preview) {

            window.renderPlanPreview?.({
                steps:
                    repairPlan.actions || []
            });
        }

        const execution =
            execute
                ? await window.executeRepairPlan(
                    repairPlan
                )
                : null;

        return {
            ok: true,
            module:
                moduleName,
            repairGraph:
                graphResult.repairGraph,
            repairPlan,
            previewed:
                !!preview,
            executed:
                !!execute,
            execution
        };

    }

    catch(error) {

        console.error(
            "[REPAIR_WORKFLOW_FAIL]",
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
   PERSISTENT RUNTIME RESTORATION V2
===================================================================================== */

window.restoreRuntimeCognition = async function() {

    try {

        console.log(
            "♻️ [RUNTIME_RESTORATION]: INIT"
        );

        MODULE_CONTEXT.loaded ||= {};

        MODULE_CONTEXT.modules ||= {};

        // =====================================================
        // RECOVER LAZY MODULES
        // =====================================================

        const lazyModules =

            MODULE_CONTEXT
                ?.lazyModules || {};

        const lazyNames =

            Object.keys(
                lazyModules
            );

        for (
            const moduleName of
            lazyNames
        ) {

            MODULE_CONTEXT.loaded[
                moduleName
            ] = lazyModules[
                moduleName
            ];

            registerRuntimeModule(
                moduleName,
                lazyModules[moduleName]
            );

            console.log(
                `♻️ [MODULE_RESTORED]: ${moduleName}`
            );
        }

        // =====================================================
        // REBUILD RUNTIME GRAPHS
        // =====================================================

        MODULE_CONTEXT
            .dependencyGraph ||= {};

        MODULE_CONTEXT
            .riskGraph ||= {};

        MODULE_CONTEXT
            .criticalityGraph ||= {};

        console.log(
            "🧠 [COGNITIVE_RUNTIME_RESTORED]"
        );

        return {

            ok: true,

            restoredModules:
                lazyNames.length,

            modules:
                lazyNames
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

/* =====================================================
   AUTO CRITICALITY ENGINE V2
===================================================== */

window.calculateModuleCriticality = function(moduleName = "") {

    try {

        const mod =
            window.inspectModule(
                moduleName
            );

        if (!mod.ok) {

            return {

                ok: false,

                error:
                    "MODULE_NOT_FOUND"
            };
        }

        const risk =
            window.evaluateModuleRisk(
                moduleName
            );

        const deps =
            window.findDependentModules(
                moduleName
            );

        let score = 0;

        /* =========================
           RISK SCORE
        ========================= */

        score +=
            (risk.risks || [])
                .length * 10;

        /* =========================
           DEPENDENCY SCORE
        ========================= */

        score +=
            (deps.impacted || [])
                .length * 15;

        /* =========================
           PRIVILEGE SCORE
        ========================= */

        if (
            mod.roles.includes(
                "super_admin"
            )
        ) {

            score += 25;
        }

        /* =========================
           ACCESS CONTROL
        ========================= */

        if (
            mod.roles.includes(
                "guardia"
            )
        ) {

            score += 15;
        }

        /* =========================
           BYPASS CLOUD
        ========================= */

        if (
            mod.actions.includes(
                "bypass_cloud"
            )
        ) {

            score += 30;
        }

        /* =========================
           CLASSIFICATION
        ========================= */

        let level =
            "low";

        if (score >= 80) {

            level =
                "critical";

        } else if (
            score >= 50
        ) {

            level =
                "high";

        } else if (
            score >= 25
        ) {

            level =
                "medium";
        }

        return {

            ok: true,

            module:
                moduleName,

            score,

            level,

            risks:
                risk.risks || [],

            dependencies:
                deps.total || 0
        };

    } catch (err) {

        console.warn(
            "⚠️ CRITICALITY_FAIL:",
            err
        );

        return {

            ok: false,

            error:
                err.message
        };
    }
};

/* =====================================================
   AUTO PROTECTION ENGINE V2
===================================================== */

window.canExecuteModuleOperation = function({

    moduleName = "",

    operation = "read"

} = {}) {

    try {

        const critical =
            window
                .calculateModuleCriticality(
                    moduleName
                );

        if (!critical.ok) {

            return {

                ok: false,

                allowed: false,

                error:
                    "MODULE_INVALID"
            };
        }

        /* =========================
           CRITICAL PROTECTION
        ========================= */

        if (

            critical.level ===
                "critical"

            &&

            [
                "delete",
                "destroy",
                "drop",
                "wipe",
                "bypass"
            ].includes(
                operation
            )

        ) {

            return {

                ok: true,

                allowed: false,

                reason:
                    "CRITICAL_MODULE_PROTECTED",

                module:
                    moduleName,

                level:
                    critical.level
            };
        }

        return {

            ok: true,

            allowed: true,

            module:
                moduleName,

            level:
                critical.level
        };

    } catch (err) {

        console.warn(
            "⚠️ AUTO_PROTECT_FAIL:",
            err
        );

        return {

            ok: false,

            error:
                err.message
        };
    }
};

/* =====================================================
   MODULE RISK ENGINE V2
===================================================== */

window.evaluateModuleRisk = function(moduleName = "") {

    try {

        const mod =
            window.inspectModule(
                moduleName
            );

        if (!mod.ok) {

            return {

                ok: false,

                error:
                    "MODULE_INVALID"
            };
        }

        const risks = [];

        /* =========================
           HIGH PRIVILEGE
        ========================= */

        if (
            mod.roles.includes(
                "super_admin"
            )
        ) {

            risks.push({
                level: "high",
                code:
                    "HIGH_PRIVILEGE_MODULE"
            });
        }

        /* =========================
           ACCESS CONTROL
        ========================= */

        if (
            mod.roles.includes(
                "guardia"
            )
        ) {

            risks.push({
                level: "medium",
                code:
                    "ACCESS_CONTROL_MODULE"
            });
        }

        /* =========================
           BYPASS CLOUD
        ========================= */

        if (
            mod.actions.includes(
                "bypass_cloud"
            )
        ) {

            risks.push({
                level: "critical",
                code:
                    "BYPASS_CLOUD_ENABLED"
            });
        }

        /* =========================
           TOO MANY WIDGETS
        ========================= */

        if (
            mod.widgets.length >= 10
        ) {

            risks.push({
                level: "medium",
                code:
                    "UI_OVERLOAD"
            });
        }

        return {

            ok: true,

            module:
                moduleName,

            totalRisks:
                risks.length,

            risks
        };

    } catch (err) {

        console.warn(
            "⚠️ MODULE_RISK_FAIL:",
            err
        );

        return {

            ok: false,

            error:
                err.message
        };
    }
};

/* =====================================================
   REPO SCANNER V2
===================================================== */

window.scanRepo = async function(filters = {}) {
    try {
        if (!window.JarvisLocalBridge?.buildRepoGraph) {
            return {
                ok: false,
                status: "LOCAL_BRIDGE_REQUIRED",
                error: "LIVE_REPO_GRAPH_REQUIRED",
                total: 0,
                files: [],
                staticIndexRole: "metadata_only"
            };
        }
        const graph = await window.JarvisLocalBridge.buildRepoGraph({
            target: filters.target || filters.url || filters.repository || "",
            ref: filters.ref || "",
            refresh: filters.refresh === true,
            maxFiles: filters.maxFiles || 2500,
            maxFileSizeBytes: filters.maxFileSizeBytes || 800000,
            source: "terminal_scan_live_repo_graph_v8"
        });
        if (graph?.ok !== true) {
            return { ...graph, ok: false, total: 0, files: [], staticIndexRole: "metadata_only" };
        }
        const files = Object.values(graph.nodes || {}).map(node => ({
            file: node.file,
            path: node.file,
            bytes: node.bytes,
            dependencies: node.dependencies || [],
            dependents: node.dependents || [],
            relatedTests: node.relatedTests || [],
            verified: true
        }));
        return {
            ok: true,
            status: "REPO_SCAN_READY",
            total: files.length,
            files,
            summary: graph.summary,
            repositoryTarget: graph.repositoryTarget || null,
            source: "live_repo_ast_graph",
            staticIndexRole: "metadata_only"
        };
    } catch (err) {
        console.warn("⚠️ REPO_SCAN_FAIL:", err);
        return { ok: false, status: "REPO_SCAN_FAILED", error: err.message, total: 0, files: [] };
    }
};


/**
 * ======================================================================================
 * FIN BLOQUE 1 V15
 * SIGUIENTE BLOQUE:
 * CryptoEngine + constructor + setState + inicializarAutoridad
 * ======================================================================================
 */

/* =====================================================================================
   ENGINE CRIPTOGRÁFICO (WEB CRYPTO API) - V15
===================================================================================== */

class CryptoEngine {

    constructor() {
        this.sessionKey = null;
    }

    /**
     * Deriva llave efímera desde UID + token sesión.
     */
    async derivarClaveSesion(uid, token) {

        const encoder = new TextEncoder();

        const seed = String(token || "").slice(-32);

        const baseKey = await window.crypto.subtle.importKey(
            "raw",
            encoder.encode(seed),
            "PBKDF2",
            false,
            ["deriveKey"]
        );

        this.sessionKey = await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: encoder.encode(uid),
                iterations: 100000,
                hash: "SHA-256"
            },
            baseKey,
            {
                name: "HMAC",
                hash: "SHA-256",
                length: 256
            },
            false,
            ["sign", "verify"]
        );

        logCore("CRYPTO_KEY_READY");
    }

    /**
     * Firma payload con nonce + expiración.
     */
    async firmarOperacion(payload = {}) {

        if (!this.sessionKey) {
            throw new Error("SESSION_KEY_NOT_READY");
        }

        const encoder = new TextEncoder();

        const nonceBytes = window.crypto.getRandomValues(
            new Uint8Array(16)
        );

        const nonce = Array.from(nonceBytes).join("");

        const exp = Date.now() +
            GESTIA_CONFIG.SIGNATURE_EXPIRY_MS;

        const raw = JSON.stringify({
            ...payload,
            nonce,
            exp
        });

        const signatureBuffer =
            await window.crypto.subtle.sign(
                "HMAC",
                this.sessionKey,
                encoder.encode(raw)
            );

        const signature = btoa(
            String.fromCharCode(
                ...new Uint8Array(signatureBuffer)
            )
        );

        return {
            signature,
            nonce,
            exp,
            raw
        };
    }
}

/* =====================================================================================
   CLASE CENTRAL - GESTIA TERMINAL V15
===================================================================================== */

export class GestiaTerminal {

    constructor() {

        this.state = STATES.IDLE;

        this.session = {
            authorized: false,
            uid: null,
            tenantId: "uxmal39",
            token: null
        };

        this.crypto = new CryptoEngine();
        this.ledger = new BankLedger();

/* 🔥 FIX: EXPOSICIÓN GLOBAL DEL LEDGER */
window.__GESTIA_LEDGER__ = this.ledger;

        this.pendingPlans = new Map();
        this.activeOps = new Set();

        this.bootTime = Date.now();

        /* =====================================================
   AUTONOMY SUPERVISED CORE (CONTROLADO)
===================================================== */

this.autonomy = {
    enabled: false,            // 🔥 OFF por defecto (evita propuestas automáticas)
    supervised: true,
    intervalMs: 90000,
    lastScan: 0,
    pendingProposal: null,
    issuesDetected: [],
    modules: {
        ui: true,
        performance: true,
        health: true,
        layout: true
    }
};

logCore(`BANK CORE V${GESTIA_CONFIG.VERSION} ONLINE`);

setTimeout(() => {
    logCore("JARVIS ONLINE - Esperando órdenes Arquitecto");
}, 1200);

// HUD siempre activo
this.initHUD();

// 🔥 Heartbeat solo si autonomy está habilitado
if (this.autonomy.enabled) {
    this.initHeartbeat();
}
        /* =====================================================
            WATCHDOG AUTÓNOMO SUPERVISADO
        ===================================================== */

        this.initAutonomousSupervisor();
    }

    /* =====================================================
       AUTONOMOUS SUPERVISOR
    ===================================================== */

    initAutonomousSupervisor() {

        setInterval(async () => {

            if (
                !this.autonomy.enabled ||
                this.autonomy.pendingProposal
            ) {
                return;
            }

            try {

                const issues = [];

                /* ===============================
                   MOBILE UI DETECTION
                =============================== */

                if (
                    window.innerWidth <= 768
                ) {

                    const hud =
                        document.getElementById(
                            "jarvisHud"
                        );

                    if (
                        hud &&
                        hud.offsetWidth >
                        window.innerWidth * 0.45
                    ) {
                        issues.push({
                            type: "UI_LAYOUT",
                            severity: "LOW",
                            title:
                                "HUD móvil sobredimensionado"
                        });
                    }

                    const header =
                        document.querySelector(
                            "header"
                        );

                    if (
                        header &&
                        header.offsetHeight > 95
                    ) {
                        issues.push({
                            type: "UI_LAYOUT",
                            severity: "MEDIUM",
                            title:
                                "Header saturado en móvil"
                        });
                    }
                }

                /* ===============================
                   PERFORMANCE
                =============================== */

                if (
                    this.pendingPlans.size > 3
                ) {
                    issues.push({
                        type: "FLOW",
                        severity: "MEDIUM",
                        title:
                            "Demasiados planes pendientes"
                    });
                }

                if (!navigator.onLine) {
                    issues.push({
                        type: "NETWORK",
                        severity: "HIGH",
                        title:
                            "Conectividad perdida"
                    });
                }

                this.autonomy.lastScan =
                    Date.now();

                this.autonomy.issuesDetected =
                    issues;

                if (
                    issues.length > 0 &&
                    this.autonomy.supervised
                ) {

                    const top =
                        issues[0];

                    this.autonomy.pendingProposal = {
                        id: crypto.randomUUID(),
                        type:
                            top.type,
                        target:
                            "Sistema Gestia",
                        title:
                            top.title,
                        action:
                            "Aplicar corrección automática supervisada",
                        risk:
                            top.severity
                    };

                    if (
                        window.renderJarvisResponse
                    ) {

                        window.renderJarvisResponse(
                            "Jarvis Supervisor",
`Detecté una mejora necesaria.

Problema:
${top.title}

Acción sugerida:
Aplicar corrección automática.

Riesgo:
${top.severity}

Escribe:
• arre
• aprobar
• cancelar`,
                            "warning"
                        );
                    }

                    logCore(
                        "AUTONOMOUS_PROPOSAL",
                        this.autonomy.pendingProposal
                    );
                }

            } catch (err) {

                warnCore(
                    "AUTONOMY_SCAN_FAIL",
                    err
                );
            }

        }, this.autonomy.intervalMs);
    }

    /* =====================================================
       HUD BOOT
    ===================================================== */

    initHUD() {

        const hud =
            document.getElementById("jarvisState");

        if (hud) {
            hud.textContent =
                "Núcleo soberano enlazado.";
        }
    }

    /* =====================================================
       HEARTBEAT
    ===================================================== */

    initHeartbeat() {

        setInterval(async () => {

            const hud =
                document.getElementById("jarvisState");

            if (!hud) return;

            if (!navigator.onLine) {
                hud.textContent =
                    "⚠️ Conectividad perdida.";
                return;
            }

            if (this.pendingPlans.size > 0) {
                hud.textContent =
                    "⚠️ Planes pendientes.";
                return;
            }

            const active =
                await this.ledger.countActive();

            if (active > 0) {
                hud.textContent =
                    `🟡 ${active} operaciones activas.`;
                return;
            }

            hud.textContent =
                "🟢 Vigilancia estable.";

        }, 8000);
    }

    /* =====================================================
       STATE ENGINE
    ===================================================== */

    async setState(newState, opId = null, metadata = {}) {

        this.state = newState;

        const entry = {
            state: newState,
            opId,
            timestamp: new Date().toISOString(),
            tenantId: this.session?.tenantId,
            ...metadata
        };

        window.dispatchEvent(
            new CustomEvent(
                "gestia-terminal-state",
                { detail: entry }
            )
        );

        if (opId) {
            try {
                await this.ledger.persistOp(
                    opId,
                    entry
                );
            } catch (err) {
                warnCore(
                    "LEDGER_PERSIST_FAIL",
                    err
                );
            }
        }

        const colors = {
            IDLE: "#082f49",
            ANALYZE: "#854d0e",
            RESOLVE: "#581c87",
            DECIDE: "#164e63",
            WAIT_APPROVAL: "#7f1d1d",
            JOURNALING: "#450a0a",
            SIGNING: "#7c2d12",
            APPLY_ATOMIC: "#064e3b",
            VERIFY_LEDGER: "#312e81",
            DONE: "#064e3b",
            ERROR: "#991b1b"
        };

        console.log(
            `%c[BANK_STATE] ${newState}`,
            `
            color:#ffffff;
            background:${colors[newState] || "#374151"};
            font-weight:bold;
            padding:2px 10px;
            border-radius:4px;
            `
        );

        const hud =
            document.getElementById("jarvisState");

        if (hud) {

            const labels = {
                IDLE: "En espera táctica.",
                ANALYZE: "Analizando solicitud...",
                RESOLVE: "Trazando estrategia...",
                DECIDE: "Calculando decisión...",
                WAIT_APPROVAL: "Esperando autorización...",
                JOURNALING: "Registrando movimiento...",
                SIGNING: "Firmando operación...",
                APPLY_ATOMIC: "Ejecutando acción...",
                VERIFY_LEDGER: "Verificando ledger...",
                DONE: "Operación completada.",
                ERROR: "Incidente detectado."
            };

            hud.textContent =
                metadata.report ||
                labels[newState] ||
                "Monitoreando...";
        }
    }

    dispatch(input, eOrOptions = null, options = undefined) {

        const hasEvent =
            typeof eOrOptions?.preventDefault === "function";

        const dispatchOptions =
            options ||
            (
                hasEvent
                    ? { simulate: false }
                    : eOrOptions || { simulate: false }
            );

        return this.execute(
            input,
            hasEvent ? eOrOptions : null,
            dispatchOptions
        );
    }

    getState() {

        return {
            state:
                this.state,
            session: {
                authorized:
                    this.session?.authorized === true,
                uid:
                    this.session?.uid || null,
                tenantId:
                    this.session?.tenantId || null,
                hasToken:
                    !!this.session?.token
            },
            pendingPlans:
                this.pendingPlans?.size || 0,
            activeOps:
                this.activeOps?.size || 0,
            bootTime:
                this.bootTime
        };
    }

    /* =====================================================
       AUTH INIT
    ===================================================== */

    async inicializarAutoridad() {

        try {

            await this.ledger.init();

            const user = auth.currentUser;

            if (!user) {
                throw new Error(
                    "AUTH_SESSION_MISSING"
                );
            }

            const context =
                await resolveTenantContext();

            this.session = {
                authorized: true,
                uid: user.uid,
                tenantId:
                    context?.tenantId ||
                    "uxmal39",
                token:
                    await user.getIdToken()
            };

            await this.setState(
                STATES.KEY_DERIVATION
            );

            await this.crypto.derivarClaveSesion(
                this.session.uid,
                this.session.token
            );

            await this.setState(
                STATES.IDLE
            );

            logCore(
                "SECURE SESSION READY"
            );

            const pending =
                await this.ledger.getAllPending();

            if (pending.length > 0) {

                warnCore(
                    `OPERACIONES HUERFANAS: ${pending.length}`
                );

                pending.forEach(item => {
                    this.activeOps.add(item.opId);
                });
            }

        } catch (err) {

            errorCore(
                "CORE_BOOT_FAIL",
                err
            );

            await this.setState(
                STATES.ERROR,
                "boot-fail",
                {
                    error: err.message
                }
            );
        }
    }

/**
 * ======================================================================================
 * FIN BLOQUE 2 V15
 * SIGUIENTE BLOQUE:
 * execute()  ← núcleo Jarvis + voz + confirmaciones
 * ======================================================================================
 */

   async execute(input, e = null, options = { simulate: false }) {

    /* 🔥 VARIABLE GLOBAL DEL MÉTODO */


    /* =====================================================
   HTML GUARD
===================================================== */

if (e?.preventDefault) {
    e.preventDefault();
    console.debug("🛡️ [JARVIS] Submit interceptado.");
}

const isStructured =
    typeof input === "object" &&
    input !== null;

if (!input) {
    return {
        error: true,
        message: "Entrada vacía."
    };
}

// 🔥 VALIDACIÓN SEGURA
if (!isStructured && !String(input).trim()) {
    return {
        error: true,
        message: "Entrada vacía."
    };
}
let rawInput;
let cmd;

if (isStructured) {

    rawInput = input;

    cmd = `${input.intent || ""}::${input.target || ""}`
        .toLowerCase();

} else {

    rawInput = String(input).trim();

    cmd = rawInput.toLowerCase();
}

if (!isStructured) {
    const core =
        window.GestiaCore ||
        window.SIA7_CORE;

    if (
        core?.procesarIntencion &&
        window.ToolsBridge &&
        window.JarvisToolRuntime
    ) {
        console.log("🧠 [GESTIA_TERMINAL_EXECUTE_CORE_AUTHORITY]", { rawInput });

        const coreResult =
            await core.procesarIntencion(rawInput, {
                rawInput,
                channel: "terminal",
                entrypoint: "gestia-terminal-legacy-kernel",
                naturalIntentAuthority: "jarvisSemanticPlan",
                writeAllowed: false,
                writeAuthorization: false,
                approvalRequiredForWrite: true,
                availableTools:
                    window.JarvisToolRuntime.list?.() || []
            });

        if (coreResult) {
            return coreResult?.response || coreResult;
        }

        return {
            ok: false,
            blocked: true,
            type: "SEMANTIC_AUTHORITY_EMPTY_CORE_RESULT",
            report:
                "Orden contenida: GestiaCore no produjo respuesta ejecutable. No se reintentó por rutas legacy.",
            writeAllowed: false,
            writeAuthorization: false,
            approvalRequiredForWrite: true
        };
    }

    return {
        ok: false,
        blocked: true,
        type: "SEMANTIC_AUTHORITY_REQUIRED",
        report:
            "Orden contenida: GestiaTerminal legacy no ejecuta lenguaje natural sin GestiaCore/jarvisSemanticPlan.",
        writeAllowed: false,
        writeAuthorization: false,
        approvalRequiredForWrite: true
    };
}
/* =====================================================
   STRUCTURED EXECUTION CONTEXT — NO LANGUAGE ROUTING
===================================================== */

const ctx = {
    userId: this.session?.uid,
    tenantId: this.session?.tenantId || "uxmal39",
    authorized: this.session?.authorized === true,
    source: "GESTIA_TERMINAL_STRUCTURED_V16",
    naturalIntentAuthority: "jarvisSemanticPlan",
    lexicalFallbackAllowed: false
};

    /* =====================================================
       OPID
    ===================================================== */

    const opId = crypto.randomUUID();

let jarvisRes; // 🔥 FIX

try {

    /* =================================================
   SESSION REHYDRATION BEFORE FIREWALL
================================================= */

if (
    !this.session?.uid ||
    !this.session?.token
) {
    console.warn(
        "⚠️ [SESSION_REHYDRATION_BEFORE_FIREWALL]",
        {
            hasUid: !!this.session?.uid,
            hasToken: !!this.session?.token,
            authorized: this.session?.authorized === true
        }
    );

    await this.inicializarAutoridad();

    if (
        !this.session?.uid ||
        !this.session?.token
    ) {
        throw new Error("IDENTITY_NOT_READY_AFTER_REHYDRATION");
    }
}
        /* =================================================
           FIREWALL PRECHECK
        ================================================= */

        await ejecutarFirewallGlobal({
            userId: this.session.uid,
            tenantId: this.session.tenantId,
            input: rawInput,
            authToken: this.session.token,
            mode: "PRECHECK"
        });

        await this.setState(
    STATES.ANALYZE,
    opId
);

// Natural-language interpretation already returned through GestiaCore at the
// top of execute(). Reaching this point means the input is structured and must
// follow deterministic governance/execution only. No secondary language brain
// or lexical fallback is allowed here.

    } catch (error) {

        /* =====================================================
   SOVEREIGN FAILURE CLEANUP
===================================================== */

if (opId) {

    this.pendingPlans.delete(
        opId
    );

    this.activeOps.delete(
        opId
    );
}

        /* =====================================================
   LEDGER FAILURE PURGE
===================================================== */

await this.ledger.removeOp(
    opId
);

        const safe =
            this.handleError(
                error,
                opId
            );

        return {
            error: true,
            message:
                safe?.message ||
                String(error)
        };
    }
}

    /**
 * runPlan: Ejecución atómica V15
 * Mantiene tu antifraud core + limpieza + trazabilidad
 */

async runPlan(opId, intents = null) {

    const planObj = intents
        ? { intents }
        : this.pendingPlans.get(opId);

    if (
        !intents &&
        planObj?.createdAt &&
        Date.now() - planObj.createdAt >
        GESTIA_CONFIG.PLAN_EXPIRY_MS
    ) {
        this.pendingPlans.delete(opId);
        throw new Error("PLAN_EXPIRED");
    }

    if (!planObj) {
        throw new Error("PLAN_NOT_FOUND");
    }

    let plan =
    planObj.intents || [];


    /* =====================================================
   SOVEREIGN EXECUTION REVALIDATION
===================================================== */

const executionTarget =

    plan?.[0]?.target ||

    plan?.[0]?.file ||

    plan?.[0]?.module ||

    "";

const executionImpact =

    window.analyzeRepoImpact?.(
        executionTarget
    );

if (
    executionImpact?.governanceAction ===
    "REVIEW_REQUIRED"
) {

    await this.setState(
        STATES.ERROR,
        opId,
        {
            report:
                `🚨 EJECUCIÓN BLOQUEADA\n\n${executionTarget}\n\nGovernance soberano detectó riesgo crítico.`
        }
    );

    /* =====================================================
   GOVERNANCE INCIDENT RECORD
===================================================== */

window.recordGovernanceEvent?.({

    type:
        "SOVEREIGN_EXECUTION_BLOCKED",

    opId,

    target:
        executionTarget,

    governance:
        executionImpact,

    timestamp:
        Date.now(),

    source:
        "runPlan",

    severity:
        "CRITICAL"
});

    throw new Error(
        "SOVEREIGN_EXECUTION_BLOCKED"
    );
}
/* =====================================================
   NORMALIZADOR DE PLAN V15.2
   + SELF REPAIR BRIDGE
===================================================== */

// Caso: viene envuelto en response.preview
if (plan?.response?.preview) {
    plan =
        plan.response.preview;
}

// Caso: objeto único
if (
    !Array.isArray(plan) &&
    typeof plan ===
        "object"
) {
    plan = [plan];
}

// Caso: array con wrapper interno
if (
    Array.isArray(plan) &&
    plan[0]?.response
        ?.preview
) {
    plan =
        plan[0].response
            .preview;
}

// Validación final
if (
    !Array.isArray(plan) ||
    plan.length === 0
) {
    throw new Error(
        "PLAN_EMPTY"
    );
}

this.pendingPlans.delete(
    opId
);

if (
    this.activeOps.has(
        opId
    )
) {
    throw new Error(
        "DUPLICATE_OPERATION_LOCAL"
    );
}

await this.ledger.persistOp(
    opId,
    {
        state: "RUNNING"
    }
);

this.activeOps.add(
    opId
);

try {

    const first =
    plan[0] || {};

const detectedType =
    first.intent ||
    first.action ||
    first.type ||
    first.response
        ?.intent ||
    first.response
        ?.action ||
    first.preview?.[0]
        ?.intent ||
    "ANALYZE";

/* =====================================================================================
   🔥 CONTEXTO DEL PROBLEMA (FIX: BLINDAJE SOBERANO V15.3)
   Blindaje total para evitar crash de indexOf en Sentinel y logs.
===================================================================================== */

// 1. Forzamos String absoluto.
// Si plan es un objeto (telemetría), lo serializamos para que Sentinel pueda leerlo sin romperse.
const issue = (typeof first.raw === 'string')
    ? first.raw
    : (first.summary || JSON.stringify(plan) || "SIA7_SYSTEM_SCAN");

// 2. Inyectamos flag de telemetría directamente en el contexto
// Esto le dirá al BYPASS de más abajo que no active el Journaling financiero.
const isTelemetry = (detectedType === "SYSTEM_STATUS" || detectedType === "ANALYZE");

console.log(`🧠 [DEBUG_ISSUE_SHIELD]: ${issue.slice(0, 50)}...`);

/* ==========================================
   OPERACIÓN (FIX DATA PROPAGATION CORRECTO)
========================================== */

const node = Array.isArray(plan) ? plan[0] : plan;

const operation = {
    id: opId,
    type: detectedType,
    payload: plan,

    // 🔥 FIX CORRECTO
    data: node?.data ?? "",
    hasData: !!node?.data
};

/* =====================================================
   SANDBOX WRITE ROUTER
===================================================== */

if (operation.type === "CODE_WRITE") {

    console.log(
        "🧠 [CODE_WRITE_DETECTED]"
    );

    const step =
        Array.isArray(plan)
            ? plan[0]
            : plan;

    const payload =
        step.payload || {};

    window.showJarvisPersistent?.(
        "escribiendo archivo sandbox..."
    );

    const result =
        await window.writeSandboxFile?.(
            payload
        );

    await this.setState(
        STATES.DONE,
        opId,
        {
            report:
                result?.ok
                    ? "Archivo sandbox generado."
                    : "Falló escritura sandbox."
        }
    );

    await this.ledger.removeOp(
        opId
    );

    return {
        ok: !!result?.ok,
        sandbox: true,
        result
    };
}

if (!operation.id || !operation.type) {
    throw new Error("INVALID_OPERATION");
}

if (!this.session?.uid || !this.session?.tenantId) {
    throw new Error("INVALID_SECURITY_CONTEXT");
}


    /* ==========================================
       FIREWALL ENFORCE
    ========================================== */

    await ejecutarFirewallGlobal(
        {
            userId:
                this.session
                    .uid,
            tenantId:
                this.session
                    .tenantId,
            input:
                JSON.stringify(
                    operation
                ),
            authToken:
                this.session
                    .token,
            mode:
                "ENFORCE"
        }
    );

   logCore(
    "OP_EXEC",
    {
        opId,
        type: operation.type,
        steps: plan.length
    }
);

/* ==========================================
   ⏳ GARANTIZAR SOURCE LISTO (FIX CRÍTICO)
========================================== */

if (
    !window.__GESTIA_TERMINAL_SOURCE__ ||
    window.__GESTIA_TERMINAL_SOURCE__.length < 50
) {

    console.warn("⏳ SOURCE NOT READY - waiting...");

    await new Promise(resolve => {

        const interval = setInterval(() => {

            if (
                window.__GESTIA_TERMINAL_SOURCE__ &&
                window.__GESTIA_TERMINAL_SOURCE__.length > 50
            ) {
                clearInterval(interval);
                resolve();
            }

        }, 50);

    });
}

/* ==========================================
    SELF REPAIR BRIDGE
========================================== */
if (operation.type === "REPAIR") {

    console.log("🔥 SELF REPAIR ENTER");

    const target = first.target || first.entity || "system";
    const rawSource = window.__GESTIA_TERMINAL_SOURCE__ || "";

    console.log("📦 SOURCE LENGTH:", rawSource.length);

    if (!rawSource) {
        console.warn("⚠️ NO SOURCE DETECTED");
    }

    const diagnostic = SelfRepairSentinelV10.diagnosticarPayloadFinal(
        {
            id: target,
            issue: issue, // 🔥 USANDO EL ISSUE BLINDADO
            json: { javascript: rawSource },
            tenantId: this.session.tenantId
        },
        opId,
        this.session
    );

    const repaired = diagnostic?.payloadCorregido?.json?.javascript || "";

    if (repaired && repaired.length > 0) {
        console.log("🛠️ REPAIR APPLY:", target);
        window.__GESTIA_TERMINAL_SOURCE__ = repaired;

        /* 🔥 FIX REAL: RE-EJECUTAR SCRIPT */
        try {
            console.log("♻️ RE-EJECUTANDO SCRIPT REPARADO");
            const script = document.createElement("script");
            script.type = "module";
            script.textContent = repaired;
            document.body.appendChild(script);
        } catch (err) {
            console.error("❌ ERROR RE-EJECUTANDO SCRIPT", err);
        }
    }

    await this.setState(
        STATES.DONE,
        opId,
        { report: "Autorreparación aplicada." }
    );

    await this.ledger.removeOp(opId);

    /* =====================================================
   SUCCESS RUNTIME CLEANUP
===================================================== */

this.pendingPlans.delete(
    opId
);

this.activeOps.delete(
    opId
);

    return {
        ok: true,
        success: true,
        opId,
        message: "Repair ejecutado por Sentinel."
    };
}

/* =====================================================================================
    READ ONLY BYPASS (FINAL STABLE FIX V15.4 - LIVE DATA + VOCALIZER SYNC)
===================================================================================== */
const READ_TYPES = [
    "ANALYZE",
    "REPORT",
    "STATUS",
    "SEARCH",
    "AUDIT",
    "SYSTEM_STATUS"
];

if (READ_TYPES.includes(operation.type)) {

    await this.setState(
        STATES.DONE,
        opId,
        { report: "Sincronizando telemetría..." }
    );

    /* =====================================================
   SUCCESS RUNTIME CLEANUP
===================================================== */

this.pendingPlans.delete(
    opId
);

this.activeOps.delete(
    opId
);

    await this.ledger.removeOp(opId);

    // 🔍 DEBUG
    console.log("🧪 [OPERATION]:", operation);

    /* ==========================================
        ✅ CASO IDEAL: DATA DESDE DSL + LIVE FETCH
    ========================================== */
    if (operation?.hasData || operation?.data || first?.payload) {

        // 🚀 CONEXIÓN EN VIVO: Consulta real a Firestore para técnicos
        if (first.entity === "technicians" || first.target === "technicians") {
            try {
                const { getCountFromServer, query, where, collection } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

                const q = query(
                    collection(db, `tenants/${this.session.tenantId}/users`),
                    where("role", "==", "tecnico")
                );

                const snapshot = await getCountFromServer(q);
                const count = snapshot.data().count;

                // Inyectamos el dato real en el dashboard
                const liveData = operation.data || first.data || {};
                liveData.counts = { ...liveData.counts, technicians: count };
                liveData.message = `Arquitecto, el censo actual en Firestore reporta ${count} técnicos activos en la plataforma de ${this.session.tenantId}.`;

                operation.data = liveData;
            } catch (e) {
                console.warn("⚠️ [LIVE_COUNT_FAIL]:", e);
            }
        }

        const finalMsg = operation.data?.message || first.summary || "Reporte generado.";
        console.log("🧠 [RETURN DATA OK]:", finalMsg);

        return {
            ok: true,
            success: true,
            opId,
            type: "SYSTEM_STATUS",
            data: operation.data || first.data || first.payload,
            message: finalMsg // Crucial para que el Vocalizer lo lea
        };
    }

    /* ==========================================
        ⚠️ FALLBACK INTELIGENTE (DENTRO DEL IF)
    ========================================== */
    console.warn("⚠️ [READ_BYPASS]: Consulta sin data estructurada.");
    return {
        ok: true,
        success: true,
        opId,
        type: "READ_RESULT",
        message: "Consulta finalizada."
    };
}
/* ==========================================
    JOURNAL
========================================== */
await this.setState(
    STATES.JOURNALING,
    opId
);

/* ==========================================
   FIX TARGET PARA UPDATE TENANT
========================================== */

if (
    operation.type === "UPDATE" &&
    plan?.[0]
) {
    if (!plan[0].target) {
        plan[0].target =
            this.session?.tenantId ||
            "uxmal39";
    }

    if (!plan[0].entity) {
        plan[0].entity =
            "tenant";
    }
}

const journal =
    await this.buildJournal(
        plan
    );

        /* ==========================================
            SIGNATURE
         ========================================== */

        await this.setState(
            STATES.SIGNING,
            opId
        );

        const proof =
            await this.crypto
                .firmarOperacion({
                    opId,
                    plan
                });

        if (Date.now() > proof.exp) {
            throw new Error(
                "SIGNATURE_EXPIRED"
            );
        }

        /* ==========================================
            TRANSACTION
         ========================================== */

        await this.setState(
            STATES.APPLY_ATOMIC,
            opId
        );

        await runTransaction(
            db,
            async (
                transaction
            ) => {

                const ledgerRef =
                    doc(
                        db,
                        `tenants/${this.session.tenantId}/${GESTIA_CONFIG.LEDGER_COLLECTION}`,
                        opId
                    );

                const existing =
                    await transaction.get(
                        ledgerRef
                    );

                if (
                    existing.exists()
                ) {
                    throw new Error(
                        "REPLAY_ATTEMPT_DETECTED"
                    );
                }

                for (
                    const step of journal
                ) {

                    if (
                        !step.intent
                            ?.entity ||
                        !step.intent
                            ?.target
                    ) {
                        throw new Error(
                            "INVALID_INTENT_STRUCTURE"
                        );
                    }

                    const docRef =
                        doc(
                            db,
                            `tenants/${this.session.tenantId}/${step.intent.entity}`,
                            step.intent.target
                        );

                    const snap =
                        await transaction.get(
                            docRef
                        );

                    const currentVersion =
                        snap.exists()
                            ? (
                                  snap.data()
                                      ._v ||
                                  0
                              )
                            : 0;

                    if (
                        currentVersion !==
                        step.version
                    ) {
                        throw new Error(
                            `CONCURRENCY_CONFLICT:${step.intent.target}`
                        );
                    }

                    const action =
                            step.intent.action ||
                            step.intent.intent ||
                         "UPDATE";

                    const ledgerEntry = {
                        opId,
                        target:
                            step.intent
                                .target,
                        action,
                        debit:
                            action ===
                            "DELETE"
                                ? 1
                                : 0,
                        credit:
                            action ===
                            "CREATE" ||
                            action ===
                            "UPDATE" ||
                            action ===
                            "REPAIR"
                                ? 1
                                : 0,
                        v:
                            currentVersion +
                            1,
                        proof:
                            proof.signature,
                        timestamp:
                            serverTimestamp()
                    };

                    const ledgerStepRef =
                        doc(
                            collection(
                                db,
                                `tenants/${this.session.tenantId}/${GESTIA_CONFIG.LEDGER_COLLECTION}/${opId}/steps`
                            )
                        );

                    transaction.set(
                        ledgerStepRef,
                        ledgerEntry
                    );

                    transaction.set(
                        ledgerRef,
                        {
                            opId,
                            completed: true,
                            timestamp:
                                serverTimestamp()
                        },
                        {
                            merge: true
                        }
                    );

                    transaction.set(
                        docRef,
                        {
                            ...step.intent
                                .payload,
                            _v:
                                currentVersion +
                                1,
                            _tx: opId
                        },
                        {
                            merge: true
                        }
                    );
                }
            }
        );

        /* ==========================================
            SUCCESS
         ========================================== */

        await this.setState(
            STATES.DONE,
            opId,
            {
                report:
                    "Operación completada."
            }
        );

        await this.ledger.removeOp(
            opId
        );

        logCore(
            "SUCCESS",
            opId
        );

        return {
            success: true,
            ok: true,
            opId,
            message:
                "Ráfaga ejecutada correctamente."
        };

    } catch (error) {

        await this.handleRollback(
            opId,
            error
        );

        throw error;

    } finally {

        this.activeOps.delete(
            opId
        );
    }
}

/* =====================================================
   JOURNAL
===================================================== */

async buildJournal(plan = []) {

    if (
        plan.length >
        GESTIA_CONFIG.MAX_PLAN_SIZE
    ) {
        throw new Error(
            "PLAN_TOO_LARGE"
        );
    }

    const journal = [];

    for (const intent of plan) {

        const path =
            `tenants/${this.session.tenantId}/${intent.entity}`;

        const docRef =
            doc(
                db,
                path,
                intent.target
            );

        const snap =
            await getDoc(docRef);

        journal.push({
            intent,
            before:
                snap.exists()
                    ? snap.data()
                    : null,
            version:
                snap.exists()
                    ? (
                          snap.data()
                              ._v || 0
                      )
                    : 0
        });
    }

    return journal;
}

/* =====================================================
   ROLLBACK
===================================================== */

async handleRollback(
    opId,
    error
) {

    errorCore(
        "ROLLBACK_TRIGGERED",
        error.message
    );

    await this.setState(
        STATES.ERROR,
        opId,
        {
            error:
                error.message
        }
    );

    this.pendingPlans.delete(
        opId
    );
}

/* =====================================================
   PLAN FILTER
===================================================== */

evaluatePlan(
    intents = []
) {

    let minConf = 1;

    intents.forEach(
        item => {

            const conf =
                item?.contextRef
                    ?.confidence;

            if (
                typeof conf ===
                    "number" &&
                conf < minConf
            ) {
                minConf = conf;
            }
        }
    );

    const highRisk =
        intents.some(
            x =>
                x.action ===
                "DELETE"
        );

    return {
        action:
            minConf > 0.9 &&
            !highRisk
                ? "EXECUTE"
                : "CONFIRM"
    };
}

/* =====================================================
   SAFE ERROR
===================================================== */

handleError(
    error,
    opId = "unknown"
) {

    const msg =
        error?.message ||
        String(error);

    errorCore(
        "SYSTEM_FAIL",
        msg
    );

    this.setState(
        STATES.ERROR,
        opId,
        {
            error: msg
        }
    ).catch(() => {});

    return {
        message: msg
    };
}

}
// END CLASS

/* =====================================================
   INSTANCE
===================================================== */

// =====================================================
// 🔥 KERNEL ÚNICO (SIN COLISIÓN)
// =====================================================

const BankTerminal =
    new GestiaTerminal();

window.KernelHeberto =
    BankTerminal;

// 🔥 Alias global (para UI/terminal)
window.__GESTIA_TERMINAL__ =
    BankTerminal;

BankTerminal.db = db;
BankTerminal.doc = doc;
BankTerminal.getDoc = getDoc;
BankTerminal.setDoc = setDoc;

console.log(
  "%c🧠 [GESTIA-TERMINAL]: V5.18 OPERATIONAL - KERNEL SYNC READY",
  "color: #3b82f6; font-weight: bold; background: #0f172a; border-left: 4px solid #3b82f6; padding: 2px 10px;"
);
/* =====================================================
   AUTH WATCHER
===================================================== */

try {

onAuthStateChanged(
    auth,
    user => {

        if (user) {
            if (!window.KernelHeberto.__authorityBootPromise) {
                window.KernelHeberto.__authorityBootPromise =
                    Promise.resolve(
                        window.KernelHeberto.inicializarAutoridad()
                    ).catch(error => {
                        window.KernelHeberto.__authorityBootPromise = null;
                        console.error(
                            "[TERMINAL_AUTHORITY_BOOT_FAIL]",
                            error
                        );
                        return false;
                    });
            }
            return;
        }

        setTimeout(() => {

    const hydratedUser =
        auth.currentUser;

    console.log(
        "🧠 [AUTH_HYDRATION_CHECK]",
        hydratedUser
    );

    if (
        !hydratedUser &&

        !(
            ["127.0.0.1", "localhost"].includes(window.location.hostname) &&
            new URLSearchParams(window.location.search).get("jarvisLocal") === "1"
        ) &&

        !window.location.pathname.includes(
            "login.html"
        )
    ) {

        console.warn(
            "⚠️ [AUTH_REDIRECT]"
        );

        window.location.href =
            "/login.html";
    }

}, 4000);
    }
);

}
catch(authWatcherError) {

    console.error(
        "[AUTH_WATCHER_REGISTER_FAIL]",
        authWatcherError
    );
}

/* =====================================================
   DEBUG
===================================================== */

// Legacy runJarvis debug globals intentionally not exposed.
// Fuerza la actualización del HUD azul cuando el Kernel hable
JarvisMemory?.subscribe?.((type, payload) => {
    if (type === 'PUSH_HISTORY' && payload?.role === 'assistant') {
        const display = document.querySelector('.sia7-decoding-text') || document.querySelector('p.text-slate-300');
        if (display) {
            display.innerHTML = `<span class="text-gestia-accent animate-pulse">SIA7:</span> ${payload.message}`;
        }
    }
});

// 🧠 RENDER PREVIEW DEL PLAN IA (multi-step robusto)

window.renderPlanPreview = function(plan) {

    console.log(
    "🧪 TERMINAL_REGISTERING_RENDER_PREVIEW"
);

    if (!plan || !Array.isArray(plan.steps)) {
        window.renderJarvisResponse("Jarvis", "Plan inválido para mostrar.", "error");
        return;
    }

    const steps = plan.steps;

    const formatted = steps.map((step, i) => {

        // 🔥 acción segura (soporta distintos formatos)
        const action =
            step.action ||
            step.type ||
            "UNKNOWN";

        // 🔥 target seguro (objeto, string o vacío)
        const target =
            step.payload?.file ||
            step.targetFile ||
            step.meta?.planner?.targetFile ||
            step.target?.collection ||
            step.target?.docId ||
            (typeof step.target === "string" ? step.target : null) ||
            "system";

        // 🔥 payload opcional (debug visual)
        let extra = "";
        if (step.payload && typeof step.payload === "object") {
            const keys = Object.keys(step.payload).slice(0, 2);
            if (keys.length) {
                extra = ` [${keys.join(", ")}]`;
            }
        }

        return `${i + 1}. ${action} → ${target}${extra}`;

    }).join("\n");

    const msg =
`Plan generado (${steps.length} pasos):

${formatted}

Confirma ejecución escribiendo: arre`;

    window.renderJarvisResponse("Plan Preview", msg, "info");

    console.log("🧠 [PLAN_PREVIEW_RENDERED]:", plan);
};

/* =====================================================================================
   RUNTIME REPAIR + HEALTH MODULE
===================================================================================== */

async function importTerminalBootModule(label, path) {
    try {
        await import(path);
        return true;
    }
    catch(error) {
        console.error(`[TERMINAL_BOOT_IMPORT_FAIL] ${label}`, error);
        return false;
    }
}




/* =====================================================================================
   RUNTIME PLATFORM MODULE
===================================================================================== */
/* =====================================================================================
   RUNTIME PLATFORM MODULE
===================================================================================== */

await importTerminalBootModule(
    "runtime_platform",
    "./modules/terminal/runtime-platform.js?v=jarvis-runtime-macro-v2-20260618"
);

/* =====================================================================================
   RUNTIME DAEMONS MODULE
===================================================================================== */

await importTerminalBootModule(
    "runtime_daemons",
    "./modules/terminal/runtime-daemons.js?v=jarvis-runtime-macro-v2-20260618"
);

/* =====================================================================================
   RUNTIME SNAPSHOT DAEMON MODULE
===================================================================================== */

await importTerminalBootModule(
    "runtime_snapshot_daemon",
    "./modules/terminal/runtime-snapshot-daemon.js?v=jarvis-runtime-macro-v2-20260618"
);

/**
 * =====================================================
 * FIN BLOQUE 4 V15
 * Archivo prácticamente completo.
 * =====================================================
 */

