/**
 * =====================================================================================
 * ARCHIVO NUEVO:
 * /gestia-core/jarvis/jarvis.context.memory.v6.js
 * =====================================================================================
 * JARVIS CONTEXT MEMORY V6
 *
 * MISIÓN:
 * Recordar últimas entidades/intenciones para frases humanas:
 *
 * "revisa eso otra vez"
 * "haz lo mismo"
 * "ábrelas"
 * "repítelo"
 * =====================================================================================
 */

function ctxLog(label, data = "") {
    console.log(`🧠 [CTX_V6:${label}]`, data);
}

const memory = {
    lastIntent: null,
    lastEntity: null,
    lastTarget: null,
    lastRaw: null,
    history: []
};

/* =====================================================================================
   SAVE
===================================================================================== */

export function remember(plan = {}, raw = "") {

    try {

        const first =
            plan?.actions?.[0];

        if (!first) return;

        memory.lastIntent =
            first.intent || null;

        memory.lastEntity =
            first.entity || null;

        memory.lastTarget =
            first.filters?.target || null;

        memory.lastRaw = raw;

        memory.history.push({
            at: Date.now(),
            raw,
            plan: first
        });

        if (memory.history.length > 15) {
            memory.history.shift();
        }

        ctxLog("SAVE", memory);

    } catch(err){}
}

/* =====================================================================================
   RESOLVE HUMAN REFERENCES
===================================================================================== */

export function resolveReferences(text = "") {

    let t = String(text).toLowerCase();

    const hasRef =
        /eso|esa|ese|mismo|mismas|mismos|otra vez|repitelo|repítelo|de nuevo/.test(t);

    if (!hasRef) {
        return text;
    }

    if (!memory.lastEntity) {
        return text;
    }

    const verb =
        memory.lastIntent === "OPEN"
            ? "abre"
        : memory.lastIntent === "REPAIR"
            ? "corrige"
        : memory.lastIntent === "UPDATE"
            ? "actualiza"
        : "revisa";

    const entityMap = {
        payments: "pagos",
        auth: "login",
        camaras: "cámaras",
        tenant: "tenant",
        tickets: "tickets",
        system: "sistema"
    };

    const entity =
        entityMap[memory.lastEntity] ||
        memory.lastEntity;

    const rebuilt =
        `${verb} ${entity}`;

    ctxLog("RESOLVED", {
        from: text,
        to: rebuilt
    });

    return rebuilt;
}

/* =====================================================================================
   GLOBAL
===================================================================================== */

window.JarvisContextMemory = {

    /* ===============================
       BASE API
    =============================== */
    remember,
    resolveReferences,
    dump: () => memory,

    /* ===============================
       STRATEGIC SUPERVISED MEMORY
    =============================== */

    strategic: {
        issues: [],
        proposals: [],
        approvals: [],
        rejections: [],
        priorities: [],
        lastSession: Date.now()
    },

    rememberIssue(issue = {}) {

        this.strategic.issues.unshift({
            ts: Date.now(),
            ...issue
        });

        this.strategic.issues =
            this.strategic.issues.slice(0, 30);

        return true;
    },

    rememberProposal(item = {}) {

        this.strategic.proposals.unshift({
            ts: Date.now(),
            status: "PENDING",
            ...item
        });

        this.strategic.proposals =
            this.strategic.proposals.slice(0, 30);

        return true;
    },

    approveProposal(id = "") {

        this.strategic.approvals.unshift({
            id,
            ts: Date.now()
        });

        const row =
            this.strategic.proposals.find(
                x => x.id === id
            );

        if (row) {
            row.status = "APPROVED";
        }

        return true;
    },

    rejectProposal(id = "") {

        this.strategic.rejections.unshift({
            id,
            ts: Date.now()
        });

        const row =
            this.strategic.proposals.find(
                x => x.id === id
            );

        if (row) {
            row.status = "REJECTED";
        }

        return true;
    },

    setPriority(text = "") {

        if (!text) return false;

        this.strategic.priorities.unshift({
            text,
            ts: Date.now()
        });

        this.strategic.priorities =
            this.strategic.priorities.slice(0, 10);

        return true;
    },

    getBriefing() {

        const pending =
            this.strategic.proposals.filter(
                x => x.status === "PENDING"
            ).length;

        const issues =
            this.strategic.issues.length;

        const topPriority =
            this.strategic.priorities[0]?.text ||
            "Sin prioridad crítica.";

        return `
Memoria estratégica activa.

Incidencias recordadas: ${issues}
Propuestas pendientes: ${pending}
Prioridad actual: ${topPriority}
        `.trim();
    },

    snapshot() {

        return {
            memory,
            strategic:
                this.strategic
        };
    }
};

ctxLog(
    "ONLINE",
    "Context Memory Ready + Strategic Supervised Memory"
);