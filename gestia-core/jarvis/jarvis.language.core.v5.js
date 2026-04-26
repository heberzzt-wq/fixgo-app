/**
 * =====================================================================================
 * ARCHIVO:
 * /gestia-core/jarvis/jarvis.language.core.v5.js
 * =====================================================================================
 * JARVIS LANGUAGE CORE V5
 * Núcleo de comprensión natural soberano
 *
 * MISIÓN:
 * Convertir lenguaje humano libre en acciones ejecutables.
 *
 * COMPATIBLE CON:
 * ✅ Jarvis Bridge V4
 * ✅ runJarvis()
 * ✅ window.KernelHeberto
 * ✅ Gestia Terminal
 * =====================================================================================
 */

function logV5(label, data = "") {
    console.log(`🧠 [LANG_V5:${label}]`, data);
}

/* =====================================================================================
   UTILIDADES
===================================================================================== */

function clean(text = "") {
    return String(text)
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function splitActions(text = "") {
    return String(text)
        .split(/\s+y luego\s+|\s+y\s+|\s+despues\s+|\s+luego\s+/i)
        .map(x => x.trim())
        .filter(Boolean);
}

/* =====================================================================================
   DETECTOR DE INTENCIÓN
===================================================================================== */

function detectIntent(t = "") {

    if (/revisa|analiza|consulta|verifica|checa/.test(t))
        return "ANALYZE";

    if (/abre|abrir|mostrar|ver/.test(t))
        return "OPEN";

    if (/corrige|repara|arregla|fix/.test(t))
        return "REPAIR";

    if (/actualiza|modifica|cambia|patch/.test(t))
        return "UPDATE";

    if (/crea|genera|alta/.test(t))
        return "CREATE";

    if (/borra|elimina|quita/.test(t))
        return "DELETE";

    if (/bloquea|cierra|suspende/.test(t))
        return "LOCK";

    return "ANALYZE";
}

/* =====================================================================================
   DETECTOR DE ENTIDAD
===================================================================================== */

function detectEntity(t = "") {

    const map = {
        pagos: "payments",
        cobros: "payments",
        facturas: "payments",

        login: "auth",
        acceso: "auth",
        usuario: "auth",
        usuarios: "auth",

        camara: "camaras",
        camaras: "camaras",
        cctv: "camaras",

        tecnico: "technicians",
        tecnicos: "technicians",

        ticket: "tickets",
        tickets: "tickets",

        tenant: "tenant",
        edificio: "tenant",
        torre: "tenant",

        firewall: "security",
        seguridad: "security",

        memoria: "memory",
        historial: "ledger",
        ledger: "ledger"
    };

    for (const key in map) {
        if (t.includes(key)) {
            return map[key];
        }
    }

    return "system";
}

/* =====================================================================================
   FILTROS / CONTEXTO
===================================================================================== */

function detectFilters(t = "") {

    const filters = {};

    if (/vencido|atrasado|moroso/.test(t))
        filters.status = "late";

    if (/hoy/.test(t))
        filters.date = "today";

    if (/mes/.test(t))
        filters.date = "month";

    if (/critico|urgente/.test(t))
        filters.priority = "high";

    if (/uxmal/.test(t))
        filters.scope = "uxmal39";

    if (/lobby/.test(t))
        filters.target = "lobby";

    return filters;
}

/* =====================================================================================
   PARSER CENTRAL
===================================================================================== */

export function parseHumanCommand(input = "") {

    const raw = String(input).trim();

    const actions =
        splitActions(raw);

    const plan = actions.map(item => {

        const t = clean(item);

        return {
            raw: item,
            intent: detectIntent(t),
            entity: detectEntity(t),
            filters: detectFilters(t),
            confidence: 0.91
        };
    });

    logV5("PLAN", plan);

    return {
        ok: true,
        source: "LANGUAGE_CORE_V5",
        raw,
        actions: plan
    };
}

/* =====================================================================================
   PROTOCOLO LEGACY
===================================================================================== */

export function toLegacyCommands(parsed) {

    if (!parsed?.actions?.length)
        return [];

    return parsed.actions.map(a =>
        `${a.intent}::${a.entity}`
    );
}

/* =====================================================================================
   GLOBAL
===================================================================================== */

window.JarvisLanguageCore = {
    parseHumanCommand,
    toLegacyCommands
};

logV5(
    "ONLINE",
    "Language Core V5 Ready"
);