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
    remember,
    resolveReferences,
    dump: () => memory
};

ctxLog(
    "ONLINE",
    "Context Memory Ready"
);