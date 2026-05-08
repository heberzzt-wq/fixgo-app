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
    addDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
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
    sincronizarCorralSemantico
} from "/gestia-core/semantic.engine.js";

import {
    interpretarIntenciones
} from "/gestia-core/intent.engine.js";

import {
    runJarvis
} from "/gestia-core/jarvis/jarvis.orchestrator.js";

import { 
    approvePlan 
} from "/gestia-core/plans.engine.js";

/* =====================================================
   SELF REPAIR CORE
===================================================== */

import {
    SelfRepairSentinelV10
} from "/gestia-core/self-repair.engine.js";

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

// ADAPTER LEGACY → CORE INTENT
// =====================================================

function resolveIntentsAdapter(input, contextoSemantico) {

    const intentInput =
        typeof input === "object" && input !== null
            ? `${input.intent || ""}::${input.target || ""}`
            : input;

    return interpretarIntenciones([
        {
            raw: intentInput,
            context: contextoSemantico
        }
    ]);
}

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
   FRASES DE APROBACIÓN
===================================================================================== */

const APPROVAL_WORDS = [
    "si",
    "sí",
    "ok",
    "arre",
    "hazlo",
    "confirmar",
    "proceder",
    "dale"
];

const CANCEL_WORDS = [
    "no",
    "cancelar",
    "abortar",
    "detener",
    "olvidalo",
    "olvídalo"
];

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

class BankLedger {

    constructor() {
        this.db = null;
    }

    async init() {

        return new Promise((resolve, reject) => {

            const request = indexedDB.open(
                GESTIA_CONFIG.DB_NAME,
                GESTIA_CONFIG.DB_VERSION
            );

            request.onupgradeneeded = (e) => {

                const dbRef = e.target.result;

                if (!dbRef.objectStoreNames.contains("unconfirmed_ops")) {
                    dbRef.createObjectStore(
                        "unconfirmed_ops",
                        { keyPath: "opId" }
                    );
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };

            request.onerror = (e) => {
                reject(e.target.error);
            };
        });
    }

    async persistOp(opId, data = {}) {

        if (!this.db) {
            warnCore("LEDGER_DB_OFFLINE");
            return;
        }

        const tx = this.db.transaction(
            "unconfirmed_ops",
            "readwrite"
        );

        const store = tx.objectStore("unconfirmed_ops");

        return new Promise((resolve, reject) => {

            const req = store.put({
                opId,
                ...data,
                updatedAt: new Date().toISOString()
            });

            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    async removeOp(opId) {

        if (!this.db) return;

        const tx = this.db.transaction(
            "unconfirmed_ops",
            "readwrite"
        );

        tx.objectStore("unconfirmed_ops").delete(opId);
    }

    async getAll() {

        if (!this.db) return [];

        const tx = this.db.transaction(
            "unconfirmed_ops",
            "readonly"
        );

        const store = tx.objectStore("unconfirmed_ops");

        return new Promise((resolve) => {

            const req = store.getAll();

            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async getActiveOperations() {

        const rows = await this.getAll();

        return rows.filter(row =>
            row.state === "RUNNING" ||
            row.state === "PENDING" ||
            row.state === STATES.WAIT_APPROVAL
        );
    }

    async getAllPending() {
        return await this.getActiveOperations();
    }

    async clearAllPending() {

        if (!this.db) return;

        const active = await this.getActiveOperations();

        const tx = this.db.transaction(
            "unconfirmed_ops",
            "readwrite"
        );

        const store = tx.objectStore("unconfirmed_ops");

        return new Promise((resolve, reject) => {

            try {

                active.forEach(item => {
                    store.delete(item.opId);
                });

                resolve(true);

            } catch (err) {

                reject(err);
            }
        });
    }

    async countActive() {
        const active = await this.getActiveOperations();
        return active.length;
    }

    /* 🔥 NUEVO MÉTODO LOG (PÉGALO AQUÍ) */
async log(type, payload = {}) {
    console.log("📘 [LEDGER LOG]:", type, payload);

    const opId = payload.planId || crypto.randomUUID();

    const record = {
        opId,
        type,
        payload,
        state: "LOGGED",
        timestamp: new Date().toISOString()
    };

    /* =========================
       1. LOCAL (lo que ya tenías)
    ========================= */
    try {
        await this.persistOp(opId, record);
    } catch (err) {
        console.warn("⚠️ Local persist falló:", err.message);
    }

    /* =========================
       2. FIRESTORE (nuevo)
    ========================= */
    try {
        await addDoc(
            collection(db, "gestia_ledger"),
            {
                ...record,
                serverTime: serverTimestamp()
            }
        );

        console.log("☁️ Firestore OK");

    } catch (err) {
        console.warn("⚠️ Firestore falló:", err.message);
    }
}
}


import {
    getDocs,
    query,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

async function fetchLedgerUI() {
    try {

        const q = query(
            collection(db, "gestia_ledger"),
            orderBy("serverTime", "desc"),
            limit(10)
        );

        const snapshot = await getDocs(q);

        const items = [];

        snapshot.forEach(doc => {
            items.push(doc.data());
        });

        renderLedgerUI(items);

    } catch (err) {
        console.warn("⚠️ Error leyendo ledger:", err.message);
    }
} 

/* 🔥 ESTA LÍNEA ES LA CLAVE */
window.fetchLedgerUI = fetchLedgerUI;

/* 🔥 MEMORIA PARA DETECTAR NUEVOS (VA AQUÍ) */
let lastLedgerIds = new Set();

function renderLedgerUI(items = []) {

    const output = document.getElementById("gestia-output");
    if (!output) return;

    // 🔥 agrupar por planId
    const grouped = {};

    items.forEach(item => {
        const planId = item.payload?.planId || "unknown";

        if (!grouped[planId]) {
            grouped[planId] = [];
        }

        grouped[planId].push(item);
    });

    // 🔥 ordenar APPROVED → EXECUTED
    Object.keys(grouped).forEach(planId => {
        grouped[planId].sort((a, b) => {
            if (a.type === "PLAN_APPROVED") return -1;
            if (b.type === "PLAN_APPROVED") return 1;
            return 0;
        });
    });

    // 🔥 detectar nuevos eventos
    const currentIds = new Set(
        items.map(i => i.opId || i.timestamp || JSON.stringify(i))
    );

    const html = `
        <div id="ledger-ui-block" class="max-w-4xl mx-auto w-full">
            <div class="bg-slate-900 border border-slate-700 rounded-2xl p-5">
                
                <h3 class="text-sm text-blue-400 font-bold mb-4">
                    📊 HISTORIAL DE OPERACIONES
                </h3>

                <div class="space-y-3 text-xs font-mono">

                    ${Object.entries(grouped).map(([planId, events]) => `
                        <div class="border border-slate-700 rounded-lg p-3">
                            
                            <div class="text-slate-400 mb-2">
                                ${planId}
                            </div>

                            <div class="ml-3 space-y-1">
                                ${events.map(e => {
                                    const id = e.opId || e.timestamp || JSON.stringify(e);
                                    const isNew = !lastLedgerIds.has(id);

                                    return `
                                        <div class="${isNew ? 'bg-emerald-500/20 rounded px-1 transition-all duration-700' : ''}">
                                            <span class="${
                                                e.type === "PLAN_EXECUTED"
                                                    ? "text-emerald-400"
                                                    : e.type === "PLAN_APPROVED"
                                                    ? "text-blue-400"
                                                    : "text-slate-400"
                                            }">
                                                ├─ ${e.type.replace("PLAN_", "")}
                                            </span>
                                        </div>
                                    `;
                                }).join("")}
                            </div>

                        </div>
                    `).join("")}

                </div>

            </div>
        </div>
    `;

    // 🔁 reemplazo controlado (no duplicar)
    const existing = document.getElementById("ledger-ui-block");

    if (existing) {
        existing.outerHTML = html;
    } else {
        output.insertAdjacentHTML("beforeend", html);
    }

    output.scrollTop = output.scrollHeight;

    // 🔥 guardar estado para detectar nuevos en siguiente render
    lastLedgerIds = currentIds;
} 

function listenLedgerRealtime() {
    try {

        const q = query(
            collection(db, "gestia_ledger"),
            orderBy("serverTime", "desc"),
            limit(10)
        );

        onSnapshot(q, (snapshot) => {

            const items = [];

            snapshot.forEach(doc => {
                items.push(doc.data());
            });

            // 🔁 limpiar antes de renderizar (evita duplicados)
            

            renderLedgerUI(items);

        });

        console.log("📡 Ledger realtime activo");

    } catch (err) {
        console.warn("⚠️ Realtime error:", err.message);
    }
}

window.listenLedgerRealtime = listenLedgerRealtime;

/* =====================================================
   SANDBOX WRITE ENGINE V1
===================================================== */

window.JARVIS_SANDBOX_FILES ||= {};


/* =====================================================
   FIRESTORE MODULE CONTEXT V1
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

    cognitionVersion: "SIA7_RUNTIME_V1"

};

window.MODULE_CONTEXT =
    window.__MODULE_CONTEXT__;

    /* =====================================================================================
   RUNTIME MODULE REGISTRY
===================================================================================== */

window.registerRuntimeModule = function(
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

/* =====================================================
   REPO REGISTRY V1
===================================================== */

window.__REPO_INDEX__ ||= {};

/* =====================================================
   REPO BOOTSTRAP INDEX
===================================================== */

window.__REPO_INDEX__["gestia-terminal.js"] = {
    path: "gestia-terminal.js",
    module: "terminal",
    type: "runtime_ui",
    critical: true
};

window.__REPO_INDEX__["operations-executor.engine.js"] = {
    path: "gestia-core/operations-executor.engine.js",
    module: "executor",
    type: "transactional_engine",
    critical: true
};

window.__REPO_INDEX__["plans.engine.js"] = {
    path: "gestia-core/plans.engine.js",
    module: "planner",
    type: "approval_engine",
    critical: true
};

window.__REPO_INDEX__["tecnico-b2b.html"] = {

    path: "tecnico-b2b.html",

    module: "tecnico",

    type: "mobile_ui",

    critical: false
};

window.__REPO_INDEX__["app-tecnico-b2b.js"] = {

    path: "app-tecnico-b2b.js",

    module: "tecnico",

    type: "mobile_runtime",

    critical: true
};
/* =====================================================
   REPO LOOKUP ENGINE
===================================================== */

window.findRepoFile = function(query = "") {

    try {

        const q =
            String(query)
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

window.loadRepoContext = async function(fileName = "") {

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
   FIRESTORE MODULE LOADER V1
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
   MODULE NORMALIZER V1
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
   MODULE FILE LOOKUP V1
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
   FILE IMPACT ENGINE V1
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
   DEPENDENCY IMPACT ENGINE V1
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
   RISK PROPAGATION ENGINE V1
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
   DEPENDENCY INTEGRITY ENGINE V1
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
   AUTO HEALING GOVERNANCE V1
   DEPENDENCY REPAIR ENGINE
===================================================================================== */

window.proposeDependencyRepair = async function(moduleName) {

    try {

        console.log(`🛠️ [DEPENDENCY_REPAIR]: Analizando ${moduleName}`);

        // =========================================================
        // VALIDACIÓN BASE
        // =========================================================

        if (!moduleName) {

            return {
                success: false,
                error: "MODULE_NAME_REQUIRED"
            };

        }

        if (!MODULE_CONTEXT?.modules?.[moduleName]) {

            return {
                success: false,
                error: "MODULE_NOT_FOUND"
            };

        }

        // =========================================================
        // COGNITIVE SOURCES
        // =========================================================

        const moduleData =
            MODULE_CONTEXT.modules[moduleName];

        const dependencyCheck =
            validateModuleDependencies(moduleName);

        const propagatedRisk =
            propagateModuleRisk(moduleName);

        const criticality =
            calculateModuleCriticality(moduleName);

        // =========================================================
        // EXTRAER DEPENDENCIAS FALTANTES
        // =========================================================

        const missingDependencies =
            dependencyCheck?.missingDependencies || [];

        // =========================================================
        // REPAIR GRAPH
        // =========================================================

        const repairGraph = {

            module: moduleName,

            timestamp: Date.now(),

            criticality,

            propagatedRisk,

            totalMissing:
                missingDependencies.length,

            missingDependencies,

            repairCandidates: [],

            blockers: [],

            warnings: [],

            severity: "LOW",

            autoRepairEligible: false,

            graphRebuildRequired: false,

            governanceAction: "ALLOW"

        };

        // =========================================================
        // ANALIZAR DEPENDENCIAS FALTANTES
        // =========================================================

        for (const dep of missingDependencies) {

            const repairCandidate = {

                dependency: dep,

                existsInModules: false,

                existsInRepo: false,

                existsInLazyRuntime: false,

                suggestedAction: null,

                confidence: 0

            };

            // =============================================
            // EXISTE EN MODULE_CONTEXT
            // =============================================

            if (MODULE_CONTEXT?.modules?.[dep]) {

                repairCandidate.existsInModules = true;

                repairCandidate.suggestedAction =
                    "RELINK_MODULE_REFERENCE";

                repairCandidate.confidence = 95;

            }

            // =============================================
            // EXISTE EN REPO FILES
            // =============================================

            else if (
                MODULE_CONTEXT?.repoFiles?.some(
                    file =>
                        file.includes(dep)
                )
            ) {

                repairCandidate.existsInRepo = true;

                repairCandidate.suggestedAction =
                    "HYDRATE_MODULE_FROM_REPO";

                repairCandidate.confidence = 80;

            }

            // =============================================
            // EXISTE EN LAZY MODULES
            // =============================================

            else if (
                MODULE_CONTEXT?.lazyModules?.[dep]
            ) {

                repairCandidate.existsInLazyRuntime = true;

                repairCandidate.suggestedAction =
                    "LAZY_HYDRATION";

                repairCandidate.confidence = 75;

            }

            // =============================================
            // NO EXISTE EN NINGÚN LADO
            // =============================================

            else {

                repairCandidate.suggestedAction =
                    "CREATE_MODULE";

                repairCandidate.confidence = 40;

                repairGraph.blockers.push({
                    type: "MISSING_RUNTIME_MODULE",
                    dependency: dep
                });

            }

            repairGraph.repairCandidates.push(
                repairCandidate
            );

        }

        // =========================================================
        // CLASIFICACIÓN DE SEVERIDAD
        // =========================================================

        if (
            criticality >= 90 ||
            propagatedRisk >= 85
        ) {

            repairGraph.severity = "CRITICAL";

            repairGraph.governanceAction =
                "HARD_BLOCK";

            repairGraph.graphRebuildRequired = true;

        }

        else if (
            criticality >= 70 ||
            propagatedRisk >= 70
        ) {

            repairGraph.severity = "HIGH";

            repairGraph.governanceAction =
                "SOFT_BLOCK";

        }

        else if (
            missingDependencies.length > 0
        ) {

            repairGraph.severity = "MEDIUM";

            repairGraph.governanceAction =
                "RESTRICTED_EXECUTION";

        }

        // =========================================================
        // AUTO REPAIR ELIGIBILITY
        // =========================================================

        const safeRepairs =
            repairGraph.repairCandidates.every(
                candidate =>
                    candidate.confidence >= 75
            );

        repairGraph.autoRepairEligible =
            safeRepairs;

        // =========================================================
        // LOG FINAL
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

            error: error.message

        };

    }

};

/* =====================================================
   AUTO CRITICALITY ENGINE V1
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
   AUTO PROTECTION ENGINE V1
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
   MODULE RISK ENGINE V1
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
   REPO SCANNER V1
===================================================== */

window.scanRepo = function(filters = {}) {

    try {

        const {
            module,
            type,
            critical
        } = filters;

        const entries =
            Object.entries(
                window.__REPO_INDEX__ || {}
            );

        const results = entries.filter(
            ([key, meta]) => {

                // 🔍 filtro módulo
                if (
                    module &&
                    meta?.module !== module
                ) {
                    return false;
                }

                // 🔍 filtro tipo
                if (
                    type &&
                    meta?.type !== type
                ) {
                    return false;
                }

                // 🔍 filtro criticidad
                if (
                    typeof critical === "boolean" &&
                    meta?.critical !== critical
                ) {
                    return false;
                }

                return true;
            }
        );

        console.log(
            "🧠 [REPO_SCAN]:",
            results.length,
            "files"
        );

        return {

            ok: true,

            total:
                results.length,

            files:
                results.map(
                    ([key, meta]) => ({
                        file: key,
                        ...meta
                    })
                )
        };

    } catch (err) {

        console.warn(
            "⚠️ REPO_SCAN_FAIL:",
            err
        );

        return {
            ok: false,
            error: err.message
        };
    }
};

/* =====================================================
   PATCH ENGINE V1
===================================================== */

window.generatePatch = async function(config = {}) {

    try {

        const {
            file,
            search,
            replace
        } = config;

        if (!file) {
            throw new Error(
                "FILE_REQUIRED"
            );
        }

        if (!search) {
            throw new Error(
                "SEARCH_REQUIRED"
            );
        }

        const loaded =
            await window.loadRepoContext(
                file
            );

        if (!loaded?.ok) {
            throw new Error(
                loaded?.error ||
                "LOAD_FAIL"
            );
        }

        const source =
            loaded.source || "";

            /* =====================================================
   SAFE ZONE ENFORCEMENT
===================================================== */

const safe =
    window.isSafeEditZone?.(
        source
    );

if (!safe) {

    return {

        ok: false,

        reason:
            "DENY_PATCH_UNSAFE_ZONE",

        file
    };
}

        const exists =
            source.includes(search);

        if (!exists) {

            return {
                ok: false,
                reason: "SEARCH_NOT_FOUND",
                file
            };
        }

        const patched =
            source.replace(
                search,
                replace || ""
            );

        const diffPreview = {

            file,

            search,

            replace,

            beforeLength:
                source.length,

            afterLength:
                patched.length,

            changed:
                source !== patched
        };

        console.log(
            "🧠 [PATCH_GENERATED]:",
            diffPreview
        );

        return {

            ok: true,

            file,

            original: source,

            patched,

            diff: diffPreview
        };

    } catch (err) {

        console.warn(
            "⚠️ PATCH_ENGINE_FAIL:",
            err
        );

        return {
            ok: false,
            error: err.message
        };
    }
};



/* =====================================================
   PATCH APPLY ENGINE V1
===================================================== */

window.applyPatch = async function(patch = {}) {

    try {

        const {
            file,
            patched,
            diff
        } = patch;

        if (!file) {
            throw new Error(
                "PATCH_FILE_REQUIRED"
            );
        }

        if (!patched) {
            throw new Error(
                "PATCH_CONTENT_REQUIRED"
            );
        }

        const found =
            window.findRepoFile(file);

        if (!found) {
            throw new Error(
                "PATCH_TARGET_NOT_FOUND"
            );
        }

        const [
            key,
            meta
        ] = found;

        /* =====================================================
   AUTO SNAPSHOT
===================================================== */

await window.createRepoSnapshot?.({

    file: key,

    source:
        patch?.original || ""
});

        // 🔥 runtime patched cache
        window.__PATCHED_RUNTIME__ ||= {};

        window.__PATCHED_RUNTIME__[key] = {

            patched,

            diff,

            updatedAt:
                Date.now(),

            path:
                meta?.path ||

                key
        };

        console.log(
            "🧠 [PATCH_APPLIED]:",
            key
        );

        // 🔥 HUD
        window.showJarvisPersistent?.(
            `patch aplicado: ${key}`
        );

        /* =====================================================
   FILESYSTEM WRITE
===================================================== */

let fsWrite = null;

try {

    fsWrite = await fetch(
        "http://localhost:3344/write",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({

                file:
                    meta?.path || key,

                content:
                    patched
            })
        }
    );

    fsWrite =
        await fsWrite.json();

    console.log(
        "🧠 [FS_WRITE_RESULT]:",
        fsWrite
    );

} catch (fsErr) {

    console.warn(
        "⚠️ FS_WRITE_FAIL:",
        fsErr
    );
}

return {

    ok: true,

    file: key,

    runtimeOnly: true,

    filesystem:
        !!fsWrite?.ok,

    patchSize:
        patched.length
};

    } catch (err) {

        console.warn(
            "⚠️ PATCH_APPLY_FAIL:",
            err
        );

        return {
            ok: false,
            error: err.message
        };
    }
};

/* =====================================================
   SAFE EDIT VALIDATOR V1
===================================================== */

window.isSafeEditZone = function(source = "") {

    try {

        return (

            source.includes(
                "FIXGO_SAFE_EDIT_START"
            ) &&

            source.includes(
                "FIXGO_SAFE_EDIT_END"
            )
        );

    } catch (err) {

        console.warn(
            "⚠️ SAFE_ZONE_CHECK_FAIL:",
            err
        );

        return false;
    }
};

/* =====================================================
   SNAPSHOT ENGINE V1
===================================================== */

window.__REPO_SNAPSHOTS__ ||= {};

window.createRepoSnapshot = function(config = {}) {

    try {

        const {
            file,
            source
        } = config;

        if (!file) {
            throw new Error(
                "SNAPSHOT_FILE_REQUIRED"
            );
        }

        window.__REPO_SNAPSHOTS__[file] ||= [];

        const snapshot = {

            createdAt:
                Date.now(),

            source:
                source || "",

            size:
                (source || "").length
        };

        window.__REPO_SNAPSHOTS__[file]
            .push(snapshot);

        console.log(
            "🧠 [SNAPSHOT_CREATED]:",
            file
        );

        return {

            ok: true,

            file,

            totalSnapshots:
                window.__REPO_SNAPSHOTS__[file]
                    .length
        };

    } catch (err) {

        console.warn(
            "⚠️ SNAPSHOT_FAIL:",
            err
        );

        return {
            ok: false,
            error: err.message
        };
    }
};

window.writeSandboxFile = async function(payload = {}) {

    try {

        const {
            file,
            content
        } = payload;

        if (!file) {
            throw new Error("FILE_REQUIRED");
        }

        const safePath =
            String(file)
            .replace(/\.\./g, "")
            .replace(/\\/g, "/");

        console.log(
            "🧠 [SANDBOX_WRITE]:",
            safePath
        );

        // 🔥 escritura sandbox memoria
        window.JARVIS_SANDBOX_FILES[safePath] = {
            content: content || "",
            updatedAt: Date.now()
        };

        // 🔥 HUD
        window.showJarvisPersistent?.(
            `archivo escrito: ${safePath}`
        );

        // 🔥 ledger
        const ledger =
            window.__GESTIA_LEDGER__;

        if (
            ledger &&
            typeof ledger.log === "function"
        ) {

            await ledger.log(
                "SANDBOX_FILE_WRITTEN",
                {
                    file: safePath,
                    bytes: (content || "").length
                }
            );
        }

        return {
            ok: true,
            file: safePath,
            bytes: (content || "").length
        };

    } catch (err) {

        console.error(
            "❌ [SANDBOX_WRITE_FAIL]:",
            err
        );

        return {
            ok: false,
            error: err.message
        };
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

/* =====================================================
   🔥 INSERTAR AQUÍ (ANTES DE BLOQUEO)
===================================================== */

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

    /* =====================================================
       BLOQUEO: APROBACIÓN SIN PLAN PENDIENTE
    ===================================================== */


    const ctx = {
        userId: this.session?.uid,
        tenantId: this.session?.tenantId || "uxmal39",
        authorized: this.session?.authorized === true,
        source: "GESTIA_TERMINAL_V15"
    };
    /* =====================================================
       CANCELACIÓN DE PLAN PENDIENTE
    ===================================================== */

    if (
        this.pendingPlans.size > 0 &&
        CANCEL_WORDS.includes(cmd)
    ) {

        this.pendingPlans.clear();

        await this.setState(
            STATES.IDLE,
            "cancel-plan",
            {
                report: "Plan cancelado."
            }
        );

        return {
            ok: true,
            cancelled: true
        };
    }

    /* =====================================================
   CONFIRMACIÓN NATURAL (PATCH DEFINITIVO)
===================================================== */

if (APPROVAL_WORDS.includes(cmd)) {

    console.log("🟢 [APPROVAL DETECTED]:", cmd);

    window.showJarvisPersistent?.("ejecutando plan...");

    await this.setState(
        STATES.APPLY_ATOMIC,
        "ai-approval",
        {
            report: "Ejecutando plan autorizado..."
        }
    );
const lastPlanId = Array.from(this.pendingPlans.keys()).pop();

const result = await approvePlan(lastPlanId, {
    id: this.session?.uid,
    tenantId: this.session?.tenantId
});

window.showJarvis?.("plan completado");

return result;
}
/* =====================================================
   QUICK COMMANDS JARVIS
===================================================== */

    if (cmd.includes("jarvis")) {

        if (
            cmd.includes("estado") ||
            cmd.includes("status") ||
            cmd.includes("como vamos") ||
            cmd.includes("cómo vamos")
        ) {

            return {
                opId: "jarvis-status",
                status: "DONE",
                report:
`Sistema estable.

Núcleo SIA7: ONLINE
Conexión: ${navigator.onLine ? "Activa" : "Caída"}
RAM estimada: ${navigator.deviceMemory || "N/D"} GB
CPU núcleos: ${navigator.hardwareConcurrency || "N/D"}
Alertas críticas: 0`
            };
        }

        if (
            cmd.includes("resumen") ||
            cmd.includes("dashboard") ||
            cmd.includes("hoy")
        ) {

            return {
                opId: "jarvis-summary",
                status: "DONE",
                report:
`Resumen operativo

Hora local: ${new Date().toLocaleTimeString("es-MX")}
Conexión: ${navigator.onLine ? "Activa" : "Sin red"}
Planes pendientes: ${this.pendingPlans.size}
Estado núcleo: ${this.state}`
            };
        }

        if (
            cmd.includes("anomalia") ||
            cmd.includes("anomalía") ||
            cmd.includes("riesgo") ||
            cmd.includes("alerta")
        ) {

            const issues = [];

            if (!navigator.onLine) {
                issues.push("Conectividad caída");
            }

            if (
                (navigator.deviceMemory || 8) <= 2
            ) {
                issues.push("RAM limitada");
            }

            if (
                (navigator.hardwareConcurrency || 4) <= 2
            ) {
                issues.push("CPU limitada");
            }

            return {
                opId: "jarvis-risk",
                status: "DONE",
                report: issues.length
                    ? `Anomalías detectadas\n\n${issues.map(x => "• " + x).join("\n")}`
                    : "Sin anomalías mayores detectadas."
            };
        }

        return {
            opId: "jarvis-help",
            status: "DONE",
            report:
                "Prueba: jarvis estado, jarvis resumen, jarvis anomalías."
        };
    }

    /* =====================================================
       OPID
    ===================================================== */

    const opId = crypto.randomUUID();

let jarvisRes; // 🔥 FIX

try {

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

// 🔥 NORMALIZACIÓN DE COMANDO



/* =================================================
   🧠 ENRUTAMIENTO PRINCIPAL UNIFICADO (BRIDGE FIRST)
================================================= */

if (
    !isStructured &&
    !rawInput.includes("::") &&
    !APPROVAL_WORDS.includes(cmd)
) {
/* =============================================
   1. PRIORIDAD ABSUTA: JARVIS BRIDGE
============================================= */

// 🔥 INTERCEPTOR DE APROBACIÓN (ANTES DEL BRIDGE)
if (APPROVAL_WORDS.includes(cmd)) {
    console.log("🟢 [APPROVAL BLOCKED BEFORE BRIDGE]:", cmd);

    const lastPlanId = Array.from(this.pendingPlans.keys()).pop();

    return await approvePlan(lastPlanId, {
        id: this.session?.uid,
        tenantId: this.session?.tenantId
    });
}

if (window.JarvisBridge?.dispatch) {

    console.log("🧠 [BRIDGE ROUTING ACTIVE]");

    return await window.JarvisBridge.dispatch(
        rawInput,
        {
            userId: this.session?.uid,
            tenantId: this.session?.tenantId,
            authorized: this.session?.authorized
        }
    );
}

    /* =============================================
       2. SEGUNDO NIVEL: AI EXTERNA
    ============================================= */
    try {

        const ai = await window.runExternalAI?.(rawInput);

        if (ai && ai.intent) {

            console.warn("🧠 AI ACTIVE:", ai);

            const aiCmd = window.resolveAIIntent?.(ai);

            if (aiCmd) {

                console.warn("⚡ COMMAND FROM AI:", aiCmd);

                return await this.runPlan(
                    crypto.randomUUID(),
                    [{
                        intent: ai.intent.toUpperCase(),
                        action: aiCmd.split("::")[0],
                        target: aiCmd.split("::")[1]?.split(".")[0] || "system",
                        raw: rawInput
                    }]
                );
            }
        }

    } catch (err) {
        console.warn("⚠️ AI FALLBACK:", err);
    }

    /* =============================================
       3. FALLBACK LOCAL
    ============================================= */
    console.warn("⚠️ Usando fallback local (runJarvis)");

    jarvisRes = await runJarvis(
        rawInput,
        ctx,
        false
    );
}
        // -----------------------------------------------
        // SIMULATION MODE
        // -----------------------------------------------

        if (jarvisRes?.mode === "SIMULATION") {

    const localPreview =
        jarvisRes?.response?.preview ||
        jarvisRes?.preview ||
        [];

    this.pendingPlans.set(
        jarvisRes.confirmKey || opId,
        {
            intents: localPreview,
            createdAt: Date.now(),
            source: "jarvis-v15"
        }
    );

    const ops =
        localPreview.length || 1;

    await this.setState(
        STATES.WAIT_APPROVAL,
        opId,
        {
            report:
`Plan táctico generado.

Operaciones: ${ops}

Escribe:
• arre
• confirmar
• cancelar`
        }
    );

    return jarvisRes;
}

        // -----------------------------------------------
        // DIRECT SUCCESS
        // -----------------------------------------------

        if (jarvisRes?.ok && jarvisRes?.mode !== "EXECUTION") {

            await this.setState(
                STATES.DONE,
                opId,
                {
                    report:
                        jarvisRes.message ||
                        "Orden ejecutada."
                }
            );

            return jarvisRes;
        }

        /* =================================================
           FALLBACK LEGACY CORE
        ================================================= */

        await this.setState(
            STATES.RESOLVE,
            opId
        );

        const contextoSemantico =
            await sincronizarCorralSemantico(
                rawInput
            );

        const intents =
            resolveIntentsAdapter(
                rawInput,
                contextoSemantico
            );

        if (
            !intents ||
            intents.length === 0
        ) {
            throw new Error(
                "NO_INTENTS_DETECTED"
            );
        }

        if (
            intents[0]?.intent ===
            "UNKNOWN_INTENT"
        ) {

            await this.setState(
                STATES.DONE,
                opId,
                {
                    report:
                        intents[0].summary ||
                        "No entendí la orden."
                }
            );

            return {
                opId,
                status:
                    "DIALOGUE_COMPLETED"
            };
        }

        if (
            intents[0]?.intent ===
            "PURGE_ORPHAN"
        ) {

            await this.ledger.clearAllPending();

            await this.setState(
                STATES.DONE,
                opId,
                {
                    report:
                        "Memoria local purgada."
                }
            );

            return {
                opId,
                status: "PURGED"
            };
        }

        if (options.simulate) {

            return {
                mode: "SIMULATION",
                opId,
                preview: intents,
                impact: {
                    operations:
                        intents.length,
                    risk:
                        intents.some(
                            x =>
                                x.action ===
                                "DELETE"
                        )
                            ? "HIGH"
                            : "LOW"
                }
            };
        }

        await this.setState(
            STATES.DECIDE,
            opId
        );

        const decision =
            this.evaluatePlan(
                intents
            );

        if (
            decision.action ===
            "CONFIRM"
        ) {

            this.pendingPlans.set(
                opId,
                {
                    intents,
                    decision,
                    createdAt:
                        Date.now()
                }
            );

            await this.setState(
                STATES.WAIT_APPROVAL,
                opId,
                {
                    report:
                        intents[0]?.summary ||
                        "Plan requiere aprobación."
                }
            );

            return {
                opId,
                status: "WAITING"
            };
        }

        return await this.runPlan(
            opId,
            intents
        );

    } catch (error) {

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

window.KernelHeberto = new GestiaTerminal();

// 🔥 Alias global (para UI/terminal)
window.__GESTIA_TERMINAL__ = window.KernelHeberto;

window.KernelHeberto.db = db;
window.KernelHeberto.doc = doc;
window.KernelHeberto.getDoc = getDoc;
window.KernelHeberto.setDoc = setDoc;

console.log(
  "%c🧠 [GESTIA-TERMINAL]: V5.18 OPERATIONAL - KERNEL SYNC READY",
  "color: #3b82f6; font-weight: bold; background: #0f172a; border-left: 4px solid #3b82f6; padding: 2px 10px;"
);
/* =====================================================
   AUTH WATCHER
===================================================== */

onAuthStateChanged(
    auth,
    user => {

        if (user) {
            window.KernelHeberto
                .inicializarAutoridad();
            return;
        }

        if (
            !window.location.pathname.includes(
                "login.html"
            )
        ) {
            window.location.href =
                "/login.html";
        }
    }
);

/* =====================================================
   DEBUG
===================================================== */

window.testJarvis =
    async () => {

        const ctx = {
            userId:
                window
                    .KernelHeberto
                    ?.session?.uid,
            tenantId:
                window
                    .KernelHeberto
                    ?.session
                    ?.tenantId
        };

        const res =
            await runJarvis(
                "revisa pagos y luego abre camaras",
                ctx
            );

        console.log(
            "🧠 TEST",
            res
        );

        window.lastJarvis =
            res;
    };

window.runJarvis =
    runJarvis;
// Fuerza la actualización del HUD azul cuando el Kernel hable
JarvisMemory.subscribe((type, payload) => {
    if (type === 'PUSH_HISTORY' && payload.role === 'assistant') {
        const display = document.querySelector('.sia7-decoding-text') || document.querySelector('p.text-slate-300');
        if (display) {
            display.innerHTML = `<span class="text-gestia-accent animate-pulse">SIA7:</span> ${payload.message}`;
        }
    }
});

// 🧠 RENDER PREVIEW DEL PLAN IA (multi-step robusto)
window.renderPlanPreview = function(plan) {

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
/**
 * =====================================================
 * FIN BLOQUE 4 V15
 * Archivo prácticamente completo.
 * =====================================================
 */

