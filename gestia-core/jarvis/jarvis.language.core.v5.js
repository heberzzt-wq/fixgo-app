/**
 * =====================================================================================
 * ARCHIVO:
 * /gestia-core/jarvis/jarvis.language.core.v5.js
 * =====================================================================================
 * JARVIS LANGUAGE CORE V5.8 - NATIVE PROTECTED + SMART PARSER
 * FIX FINAL: Executive Layer estable + mapeo logout admin
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
        .split(
            /\s+y luego\s+|\s+y\s+|\s+despues\s+|\s+después\s+|\s+luego\s+|\s+ademas\s+|\s+además\s+/i
        )
        .map(x => x.trim())
        .filter(Boolean);
}

/* =====================================================================================
   NATIVE COMMANDS
===================================================================================== */

function isNativeJarvis(text = "") {

    const t = clean(text);

    return (
        t.includes("jarvis estado") ||
        t.includes("jarvis resumen") ||
        t.includes("jarvis salud") ||
        t.includes("jarvis status") ||
        t.includes("jarvis anom")
    );
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
        ledger: "ledger",

        sistema: "system",
        jarvis: "system"
    };

    for (const key in map) {
        if (t.includes(key)) {
            return map[key];
        }
    }

    return "system";
}

/* =====================================================================================
   FILTROS
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

    const actions = splitActions(raw);

    const plan = actions.map(item => {

        const t = clean(item);

        if (isNativeJarvis(t)) {
            return {
                raw: item,
                native: true,
                command: item,
                confidence: 1
            };
        }

        return {
            raw: item,
            native: false,
            intent: detectIntent(t),
            entity: detectEntity(t),
            filters: detectFilters(t),
            confidence: 0.91
        };
    });

    logV5("PLAN", plan);

    return {
        ok: true,
        source: "LANGUAGE_CORE_V5.8",
        raw,
        actions: plan
    };
}

/* =====================================================================================
   LEGACY CONVERTER
===================================================================================== */

export function toLegacyCommands(parsed) {

    if (!parsed?.actions?.length)
        return [];

    return parsed.actions.map(a => {

        if (a.native) {
            return a.command;
        }

        return `${a.intent}::${a.entity}`;
    });
}

/* =====================================================================================
   BRIDGE DIRECT MODE
===================================================================================== */

export async function translate(input = "") {

    const parsed =
        parseHumanCommand(input);

    return toLegacyCommands(parsed);
}

/* =====================================================================================
   GLOBAL
===================================================================================== */

window.JarvisLanguageCore = {

    parseHumanCommand,
    toLegacyCommands,
    translate,

    /* ======================================
       EXECUTIVE LAYER
    ====================================== */

    detectMode(text = "") {

        const t =
            String(text || "")
            .toLowerCase();

        if (
            t.includes("no ejecutes") ||
            t.includes("solo analiza") ||
            t.includes("sin ejecutar")
        ) {
            return "ANALYSIS_ONLY";
        }

        if (
            t.includes("automatico") ||
            t.includes("automático")
        ) {
            return "AUTONOMOUS";
        }

        return "SUPERVISED";
    },

    detectPriority(text = "") {

        const t =
            String(text || "")
            .toLowerCase();

        if (
            t.includes("urgente") ||
            t.includes("crítico") ||
            t.includes("critico") ||
            t.includes("ya")
        ) {
            return "HIGH";
        }

        if (
            t.includes("después") ||
            t.includes("luego")
        ) {
            return "LOW";
        }

        return "NORMAL";
    },

    detectDomain(text = "") {

        const t =
            String(text || "")
            .toLowerCase();

        if (
            t.includes("admin") ||
            t.includes("administrador") ||
            t.includes("heberto")
        ) {
            return "ADMIN_PANEL";
        }

        if (
            t.includes("tecnico") ||
            t.includes("técnico") ||
            t.includes("b2b")
        ) {
            return "B2B_PANEL";
        }

        if (
            t.includes("cliente") ||
            t.includes("usuario")
        ) {
            return "CLIENT_PANEL";
        }

        if (
            t.includes("movil") ||
            t.includes("móvil")
        ) {
            return "MOBILE_UI";
        }

        return "GENERAL";
    },

    async interpretExecutive(text = "") {

        const raw =
            String(text || "").trim();

        const low =
            raw.toLowerCase();

        let commands = [];
        let proposal = null;

        let mode =
            this.detectMode(raw);

        let priority =
            this.detectPriority(raw);

        let domain =
            this.detectDomain(raw);

        /* ==================================
           HARD MAPS IMPORTANTES
        ================================== */

        if (
            low.includes("logout") &&
            low.includes("admin")
        ) {

            commands = [
                "REPAIR::admin"
            ];

            priority = "HIGH";

            proposal = {
                type: "REPAIR",
                title: "Corrección logout admin",
                target: "./panel-admin.js",
                risk: "LOW"
            };
        }

        else if (
            low.includes("cerrar sesion") &&
            low.includes("admin")
        ) {

            commands = [
                "REPAIR::admin"
            ];

            priority = "HIGH";
        }

        else if (
            low.includes("boton") &&
            low.includes("admin") &&
            low.includes("no funciona")
        ) {

            commands = [
                "REPAIR::admin"
            ];

            priority = "HIGH";
        }

        else if (
            low.includes("tecnico") &&
            low.includes("login") &&
            low.includes("falla")
        ) {

            commands = [
                "REPAIR::tecnico"
            ];

            priority = "HIGH";
        }

        else if (
            low.includes("cliente") &&
            low.includes("panel") &&
            low.includes("roto")
        ) {

            commands = [
                "REPAIR::cliente"
            ];

            priority = "HIGH";
        }

        else if (
            low.includes("resumen") ||
            low.includes("estado")
        ) {

            commands = [
                "jarvis resumen"
            ];

            mode = "STANDARD";
        }

        else {

            const base =
                await translate(raw);

            commands =
                Array.isArray(base)
                    ? base
                    : [base];
        }

        return {
            raw,
            commands,
            mode,
            priority,
            domain,
            supervised:
                mode === "SUPERVISED",
            proposal
        };
    },

    async smartTranslate(text = "") {

        return await this.interpretExecutive(
            text
        );
    }
};

logV5(
    "ONLINE",
    "Language Core V5.8 Executive Ready"
);