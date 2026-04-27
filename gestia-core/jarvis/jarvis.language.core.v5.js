/**
 * =====================================================================================
 * ARCHIVO:
 * /gestia-core/jarvis/jarvis.language.core.v5.js
 * =====================================================================================
 * JARVIS LANGUAGE CORE V5.8 - NATIVE PROTECTED + SMART PARSER
 *
 * MEJORAS:
 * ✅ Protección comandos nativos
 * ✅ Split robusto
 * ✅ translate() directo para Bridge
 * ✅ Contexto y filtros mejorados
 * ✅ Compatibilidad total legacy
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

    const raw =
        String(input).trim();

    const actions =
        splitActions(raw);

    const plan = actions.map(item => {

        const t = clean(item);

        /* ======================================
           PROTECCIÓN NATIVA
        ====================================== */

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

    /* ===============================
       LEGACY CORE
    =============================== */
    parseHumanCommand,
    toLegacyCommands,
    translate,

    /* ===============================
       EXECUTIVE INTELLIGENCE LAYER
    =============================== */

    detectMode(text = "") {

        const t =
            String(text)
            .toLowerCase();

        if (
            t.includes("no ejecutes") ||
            t.includes("solo analiza") ||
            t.includes("sin ejecutar")
        ) {
            return "ANALYSIS_ONLY";
        }

        if (
            t.includes("con permiso") ||
            t.includes("con autorización") ||
            t.includes("autoriza primero") ||
            t.includes("sin permiso no")
        ) {
            return "SUPERVISED";
        }

        if (
            t.includes("automatico") ||
            t.includes("automático")
        ) {
            return "AUTONOMOUS";
        }

        return "STANDARD";
    },

    detectPriority(text = "") {

        const t =
            String(text)
            .toLowerCase();

        if (
            t.includes("urgente") ||
            t.includes("crítico")
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
            String(text)
            .toLowerCase();

        if (
            t.includes("movil") ||
            t.includes("móvil") ||
            t.includes("android") ||
            t.includes("iphone")
        ) {
            return "MOBILE_UI";
        }

        if (
            t.includes("b2b") ||
            t.includes("tecnico") ||
            t.includes("técnico")
        ) {
            return "B2B_PANEL";
        }

        if (
            t.includes("seguridad")
        ) {
            return "SECURITY";
        }

        if (
            t.includes("base de datos") ||
            t.includes("firestore")
        ) {
            return "DATABASE";
        }

        return "GENERAL";
    },

   async interpretExecutive(text = "") {

    const raw =
        String(text || "").trim();

    const low =
        raw.toLowerCase();

    let commands = [];
    let mode = "SUPERVISED";
    let priority = "NORMAL";
    let domain = "system";
    let proposal = null;

    const briefing =
        window.JarvisMemory?.getBriefing?.() || {};

    const signals = {
        online:
            navigator.onLine === true,
        hour:
            new Date().getHours(),
        alerts:
            briefing.alerts || 0,
        weakestScore:
            briefing.weakestScore || 100,
        pendingProposal:
            !!window.__JARVIS_PENDING__
    };

    /* ==========================================
       INPUT HUMANO DIRECTO (PRIORIDAD MÁXIMA)
    ========================================== */

    if (
        low.includes("resumen") ||
        low.includes("estado") ||
        low.includes("como vamos") ||
        low.includes("cómo vamos")
    ) {

        commands = ["jarvis resumen"];
        mode = "STANDARD";
        domain = "status";
    }

    else if (
        low.includes("prioridades") ||
        low.includes("commander") ||
        low.includes("modo comandante")
    ) {

        commands = ["commander"];
        mode = "STANDARD";
        priority = "HIGH";
        domain = "ops";
    }

    else if (
        low.includes("alertas") ||
        low.includes("sentinel") ||
        low.includes("riesgos")
    ) {

        commands = ["sentinel"];
        mode = "STANDARD";
        priority = "HIGH";
        domain = "security";
    }

    else if (
        low.includes("modo autonomo") ||
        low.includes("modo autónomo") ||
        low.includes("watchdog")
    ) {

        commands = ["watchdog"];
        mode = "STANDARD";
        priority = "HIGH";
        domain = "autonomy";
    }

    else if (
        low.includes("auto reparar") ||
        low.includes("autorreparacion") ||
        low.includes("autorreparación") ||
        low.includes("self healing")
    ) {

        commands = ["self healing"];
        mode = "STANDARD";
        priority = "HIGH";
        domain = "repair";
    }

    else if (
        low.includes("auditoria automatica") ||
        low.includes("auditoría automática")
    ) {

        commands = ["__AUTO_AUDIT_UI__"];
        mode = "SUPERVISED";
        priority = "HIGH";
        domain = "ui";
    }

    else if (
        low.includes("health check") ||
        low.includes("diagnostico") ||
        low.includes("diagnóstico")
    ) {

        commands = ["__AUTO_HEALTH_CHECK__"];
        mode = "SUPERVISED";
        priority = "HIGH";
        domain = "health";
    }

    else if (
        low.includes(".js") ||
        low.includes("revisa archivo") ||
        low.includes("analiza archivo")
    ) {

        commands = [raw];
        mode = "SUPERVISED";
        priority = "HIGH";
        domain = "code";
    }

    /* ==========================================
       AUTONOMÍA SUPERVISADA REAL
    ========================================== */

    else {

        const proposals = [];

        if (!signals.online) {
            proposals.push({
                action: "sentinel",
                priority: 100,
                domain: "network",
                title: "Incidencia de conectividad"
            });
        }

        if (signals.alerts > 0) {
            proposals.push({
                action: "__AUTO_HEALTH_CHECK__",
                priority: 95,
                domain: "health",
                title: "Diagnóstico preventivo"
            });
        }

        if (signals.weakestScore < 85) {
            proposals.push({
                action: "__AUTO_AUDIT_UI__",
                priority: 90,
                domain: "ui",
                title: "Optimización responsive"
            });
        }

        if (
            signals.hour >= 8 &&
            signals.hour <= 10
        ) {
            proposals.push({
                action: "jarvis resumen",
                priority: 60,
                domain: "ops",
                title: "Briefing ejecutivo matutino"
            });
        }

        proposals.sort(
            (a, b) =>
                b.priority - a.priority
        );

        const best =
            proposals[0];

        if (best) {

            commands = [best.action];
            mode = "SUPERVISED";
            priority = "HIGH";
            domain = best.domain;
            proposal = best;

        } else {

            const base =
                await translate(raw);

            commands =
                Array.isArray(base)
                    ? base
                    : [base];

            mode =
                this.detectMode(raw);

            priority =
                this.detectPriority(raw);

            domain =
                this.detectDomain(raw);
        }
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
}
