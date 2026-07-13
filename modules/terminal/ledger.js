import {
    getDocs,
    query,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let db;
let addDoc;
let collection;
let serverTimestamp;
let onSnapshot;
let warnCore = () => {};
let STATES = {};
let GESTIA_CONFIG = {};

export function installLedgerModule(deps = {}) {
    db = deps.db;
    addDoc = deps.addDoc;
    collection = deps.collection;
    serverTimestamp = deps.serverTimestamp;
    onSnapshot = deps.onSnapshot;
    warnCore = deps.warnCore || warnCore;
    STATES = deps.STATES || STATES;
    GESTIA_CONFIG = deps.GESTIA_CONFIG || GESTIA_CONFIG;

    window.fetchLedgerUI = fetchLedgerUI;
    window.listenLedgerRealtime = listenLedgerRealtime;

    return {
        BankLedger,
        fetchLedgerUI,
        listenLedgerRealtime
    };
}

export class BankLedger {

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

/* 🔥 MEMORIA PARA DETECTAR NUEVOS (VA AQUÍ) */
let lastLedgerIds = new Set();

function escapeLedgerHtml(value = "") {
    const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    };

    return String(value).replace(/[&<>"']/g, character => entities[character]);
}

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
    const groupedEntries = Object.entries(grouped).slice(0, 5);
    const hadPreviousLedger = lastLedgerIds.size > 0;
    const hasNewLedgerEvent = [...currentIds]
        .some(id => !lastLedgerIds.has(id));

    const html = `
        <details id="ledger-ui-block" class="max-w-4xl mx-auto w-full">
            <summary class="cursor-pointer text-xs text-slate-400 hover:text-blue-300">
                Actividad reciente · ${groupedEntries.length} planes · ${items.length} eventos
            </summary>
            <div class="bg-slate-900 border border-slate-700 rounded-2xl p-5">

                <h3 class="text-sm text-blue-400 font-bold mb-4">
                    📊 HISTORIAL DE OPERACIONES
                </h3>

                <div class="space-y-3 text-xs font-mono">

                    ${groupedEntries.map(([planId, events]) => `
                        <div class="border border-slate-700 rounded-lg p-3">

                            <div class="text-slate-400 mb-2">
                                ${escapeLedgerHtml(planId)}
                            </div>

                            <div class="ml-3 space-y-1">
                                ${events.map(e => {
                                    const id = e.opId || e.timestamp || JSON.stringify(e);
                                    const isNew = !lastLedgerIds.has(id);
                                    const eventType = String(e.type || "PLAN_EVENT");

                                    return `
                                        <div class="${isNew ? 'bg-emerald-500/20 rounded px-1 transition-all duration-700' : ''}">
                                            <span class="${
                                                eventType === "PLAN_EXECUTED"
                                                    ? "text-emerald-400"
                                                    : eventType === "PLAN_APPROVED"
                                                    ? "text-blue-400"
                                                    : "text-slate-400"
                                            }">
                                                ├─ ${escapeLedgerHtml(eventType.replace("PLAN_", ""))}
                                            </span>
                                        </div>
                                    `;
                                }).join("")}
                            </div>

                        </div>
                    `).join("")}

                </div>

            </div>
        </details>
    `;

    // 🔁 reemplazo controlado (no duplicar)
    const existing = document.getElementById("ledger-ui-block");

    if (existing) {
        existing.outerHTML = html;
    } else {
        output.insertAdjacentHTML("beforeend", html);
    }

    if (hadPreviousLedger && hasNewLedgerEvent) {
        output.scrollTop = output.scrollHeight;
    }

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
