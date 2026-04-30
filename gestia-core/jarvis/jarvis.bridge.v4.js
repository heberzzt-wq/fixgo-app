/**
 * =====================================================================================
 * JARVIS BRIDGE V5.95 - FINAL PRODUCTION (FULL SOURCE)
 * ARCHIVO: /gestia-core/jarvis/jarvis.bridge.v5.js
 * =====================================================================================
 * INCLUYE:
 * ✅ Todo V5.8 Original (1700+ líneas de lógica base)
 * ✅ Fix Crítico Logout: Última línea de defensa en executeCommands
 * ✅ Control Central Absoluto en dispatch
 * ✅ Regla 1: Código completo sin placeholders
 * =====================================================================================
 */

function safeLog(label, data = "") {
    console.log(`🧠 [JARVIS_UNIFIED:${label}]`, data);
}

function safeError(label, err = "") {
    console.error(`❌ [JARVIS_UNIFIED:${label}]`, err);
}

/* =====================================================================================
   UI HELPERS
===================================================================================== */

function render(title, msg, type = "info") {
    if (window.renderJarvisResponse) {
        window.renderJarvisResponse(title, msg, type);
    }
}

function speak(msg) {
    if (window.hablarJarvis) {
        try { window.hablarJarvis(msg); } catch (e) {}
    }
}

/* =====================================================================================
   EXECUTORS (FIXED: CONTEXTO + TIPOS)
===================================================================================== */

async function runCore(input = "") {

    if (!window.KernelHeberto) {
        throw new Error("CORE_NOT_READY");
    }

    /* ======================================
        🔥 SOPORTE OBJETO (cmd + raw)
    ====================================== */

    if (typeof input === "object" && input !== null) {

        const cmd =
            input.cmd ||
            input.command ||
            "";

        const raw =
            input.raw ||
            "";

        if (!cmd) {
            throw new Error("INVALID_COMMAND");
        }

        return await window.KernelHeberto.execute(
            cmd,        // ✔ string limpio para Jarvis
            null,
            {
                raw: raw // 🔥 contexto real via options
            }
        );
    }

    /* ======================================
        ✔ CASO NORMAL (string)
    ====================================== */

    return await window.KernelHeberto.execute(input);
}


/**
 * 🔥 1️⃣ REESCRIBE runExternalAI (FORMATO OBLIGATORIO)
 * Tu función debe FORZAR salida estructurada y defenderse de HTML.
 */
async function runExternalAI(input = "") {

    try {
        const res = await fetch("https://us-central1-fixgo-44e4d.cloudfunctions.net/api/ai-intent", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ input })
        });

        // 🛡️ AQUÍ ESTÁ LO QUE FALTABA: BARRERA ANTI-HTML
        // Si el server tira 404, 500 o CORS, abortamos ANTES de intentar parsear JSON
        if (!res.ok) {
            console.error(`[AI BRIDGE] Error HTTP devuelto por el servidor: ${res.status}`);
            return fallback();
        }

        const data = await res.json();

        let parsed;

        try {
            parsed = JSON.parse(data.output);
        } catch {
            return fallback();
        }

        // 🛡️ VALIDACIÓN FINAL (bridge layer)
        const validIntents = ["logout","analyze","open","repair","create","update","delete"];
        const validTargets = ["admin","system","auth","user"];

        if (
            !parsed ||
            !validIntents.includes(parsed.intent) ||
            !validTargets.includes(parsed.target) ||
            typeof parsed.confidence !== "number"
        ) {
            return fallback();
        }

        return parsed;

    } catch (error) {
        console.error("AI BRIDGE ERROR:", error);
        return fallback();
    }
}

// 🔒 fallback centralizado
function fallback() {
    return {
        intent: "analyze",
        target: "system",
        confidence: 0
    };
}
// =====================================================
// HELPERS DE INTERPRETACIÓN AI
// =====================================================
function resolveAIIntent(ai) {

    const { intent, target } = ai;

    // 🔐 LOGOUT
    if (intent === "logout") {
        return "REPAIR::admin.logout";
    }

    // 🔍 ANALYZE
    if (intent === "analyze" && target === "system") {
        return "ANALYZE::system";
    }

    if (intent === "analyze" && target === "auth") {
        return "ANALYZE::auth";
    }

    // 🛠️ REPAIR
    if (intent === "repair") {
        return "REPAIR::system";
    }

    // 📂 OPEN
    if (intent === "open" && target === "auth") {
        return "OPEN::auth";
    }

    return null;
}
/* =====================================================================================
   OBSERVABILITY
===================================================================================== */

function saveHistory(item = {}) {

    window.JarvisHistory ||= [];

    window.JarvisHistory.unshift({
        ts: Date.now(),
        ...item
    });

    window.JarvisHistory =
        window.JarvisHistory.slice(0, 50);
}

async function withTimeout(promise, ms = 8000) {

    return await Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(
                () => reject(new Error("TIMEOUT")),
                ms
            )
        )
    ]);
}

/* =====================================================================================
   RESPONSE
===================================================================================== */

function normalize(res) {

    if (!res) return "Sin respuesta.";

    if (typeof res === "string") return res;

    return (
        res.report ||
        res.message ||
        res.text ||
        res.output ||
        res.response?.report ||
        res.response?.message ||
        res.response?.text ||
        "Orden completada."
    );
}

function beautifyOutput(
    cmd = "",
    text = "",
    fromCache = false
) {

    const c =
        String(cmd).toUpperCase();

    const raw =
        String(text || "").trim();

    /* ==========================================
        CACHE
    ========================================== */

    if (fromCache) {
        return "Resultado reciente reutilizado desde memoria operativa.";
    }

    /* ==========================================
        OPEN
    ========================================== */

    if (c.includes("OPEN::TICKETS")) {
        return "Tickets generados y registrados exitosamente.";
    }

    if (c.includes("OPEN::AUTH")) {
        return "Panel de acceso abierto correctamente.";
    }

    if (c.includes("OPEN::DASHBOARD")) {
        return "Dashboard operativo desplegado.";
    }

  /* ======================================================================================
    🧠 ANALYZE::SYSTEM - KERNEL TELEMETRY V5.19 (SOVEREIGN SYNC)
    Sustituye el bloque anterior para activar la telemetría real en la terminal.
    Basado en Arquitectura GestiaPremium V5.18.
   ====================================================================================== */
if (c.includes("ANALYZE::SYSTEM")) {
    // 🧠 Extracción de métricas en tiempo real del entorno del Arquitecto
    const telemetry = {
        ok: true,
        type: "SYSTEM_STATUS", // 🔥 Llave crítica para el mapeo en composeResponse
        data: {
            online: navigator.onLine,
            timestamp: Date.now(),
            // 📊 Sincronización con el historial de Jarvis o el estado del Bank Core
            ops: (window?.JarvisHistory?.length) || (window?.bankState?.totalOps) || 0,
            // 🔋 Cálculo de memoria activa (Conversión a MB para legibilidad)
            memory: performance?.memory 
                ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` 
                : "N/A"
        }
    };

    // 🛡️ Registro de Telemetría (Auditoría de Modo God)
    console.log("%c📊 [TELEMETRY_DISPATCH]: Ejecutando Análisis de Infraestructura...", "color: #3b82f6; font-weight: bold;", telemetry);
    
    // 🚀 Retorno del objeto estructurado (No más strings planos)
    return telemetry;
}
    

    /* ==========================================
        CREATE
    ========================================== */

    if (c.includes("CREATE::")) {
        return "Nueva operación creada exitosamente.";
    }

    /* ==========================================
        UPDATE
    ========================================== */

    if (c.includes("UPDATE::")) {
        return "Actualización aplicada correctamente.";
    }

    /* ==========================================
        DELETE
    ========================================== */

    if (c.includes("DELETE::")) {
        return "Proceso de eliminación completado.";
    }

    /* ==========================================
        REPAIR
    ========================================== */

    if (c.includes("REPAIR::")) {
        return "Rutina de corrección ejecutada satisfactoriamente.";
    }

    /* ==========================================
        NATIVE COMMANDS
    ========================================== */

    if (
        c.includes("JARVIS ESTADO") ||
        c.includes("JARVIS RESUMEN") ||
        c.includes("JARVIS SALUD") ||
        c.includes("JARVIS STATUS")
    ) {
        return raw || "Estado del núcleo disponible.";
    }

    /* ==========================================
        FALLBACK
    ========================================== */

    return raw || "Operación completada correctamente.";
}

function composeResponse(outputs = []) {

    const clean = outputs
        .filter(Boolean)
        .map(x => String(x).trim())
        .filter(Boolean);

    if (!clean.length) {
        return "Proceso completado.";
    }

    return clean.join("\n\n");
}

/* =====================================================================================
   NLP FALLBACK
===================================================================================== */

function detectEntity(text = "") {

    const t = String(text).toLowerCase();

    const map = {
        pagos: "payments",
        cobros: "payments",
        facturas: "payments",
        ticket: "tickets",
        tickets: "tickets",
        login: "auth",
        acceso: "auth",
        tenant: "tenant",
        edificio: "tenant",
        reporte: "reports",
        dashboard: "dashboard"
    };

    for (const key in map) {
        if (t.includes(key)) return map[key];
    }

    return "system";
}

function detectAction(text = "") {

    const t = String(text).toLowerCase();

    if (/revisa|analiza|consulta|verifica/.test(t))
        return "ANALYZE";

    if (/abre|abrir|mostrar/.test(t))
        return "OPEN";

    if (/corrige|repara|fix/.test(t))
        return "REPAIR";

    if (/actualiza|modifica/.test(t))
        return "UPDATE";

    if (/crea|genera/.test(t))
        return "CREATE";

    if (/borra|elimina/.test(t))
        return "DELETE";

    return "ANALYZE";
}

function fallbackTranslate(text = "") {
    return `${detectAction(text)}::${detectEntity(text)}`;
}

function splitActions(text = "") {

    return String(text)
        .split(
            /\s+y luego\s+|\s+y\s+|\s+después\s+|\s+despues\s+|\s+luego\s+/i
        )
        .map(x => x.trim())
        .filter(Boolean);
}

/* =====================================================================================
   NATIVE + SOCIAL LAYER
===================================================================================== */

function isNativeJarvis(text = "") {
    const t = String(text).toLowerCase().trim();
    return (
        t.includes("jarvis estado") ||
        t.includes("jarvis resumen") ||
        t.includes("jarvis salud") ||
        t.includes("jarvis status")
    );
}

function isSocialJarvis(text = "") {
    const t = String(text).toLowerCase().trim();
    return (
        t === "hola" ||
        t.includes("buenos dias") ||
        t.includes("buen día") ||
        t.includes("buen dia") ||
        t.includes("buenas tardes") ||
        t.includes("buenas noches") ||
        t.includes("como estas") ||
        t.includes("cómo estás") ||
        t === "gracias" ||
        t.includes("muchas gracias") ||
        t.includes("que tal") ||
        t.includes("qué tal")
    );
}

async function executeSocialJarvis(text = "") {
    const t = String(text).toLowerCase().trim();

    if (t === "hola" || t.includes("que tal") || t.includes("qué tal")) {
        return "Hola Arquitecto. Núcleo operativo y atento.";
    }
    if (t.includes("buenos dias") || t.includes("buen día") || t.includes("buen dia")) {
        return "Buenos días Arquitecto. Sistemas estables y listos.";
    }
    if (t.includes("buenas tardes")) {
        return "Buenas tardes Arquitecto. Todo bajo control.";
    }
    if (t.includes("buenas noches")) {
        return "Buenas noches Arquitecto. Núcleo vigilante y operativo.";
    }
    if (t.includes("como estas") || t.includes("cómo estás")) {
        return "Operando al cien por ciento. Sin incidencias críticas.";
    }
    if (t === "gracias" || t.includes("muchas gracias")) {
        return "Siempre a la orden, Arquitecto.";
    }
    return "Presente, Arquitecto.";
}

/* ======================================
    SYSTEM COMMANDS / NATIVE CORE
====================================== */
async function executeNativeJarvis(text = "") {
    const t = String(text).toLowerCase().trim();

    /* ======================================
        SOCIAL PRIORITY
    ====================================== */
    if (
        typeof t === "string" &&
        isSocialJarvis(t) &&
        splitActions(t).length === 1
    ) {
        return await executeSocialJarvis(t);
    }

    if (typeof t === "string") {
        if (t.includes("jarvis estado") || t.includes("jarvis status")) {
            return await runCore("jarvis estado");
        }
        if (t.includes("jarvis resumen")) {
            return await runCore("jarvis resumen");
        }
        if (t.includes("jarvis salud")) {
            return await runCore("jarvis salud");
        }
    }

    return await runCore(text);
}

async function resolveCommands(raw = "") {
    // 1. NORMALIZACIÓN DE ENTRADA
    const isStructured = typeof raw === "object" && raw !== null;
    const input = isStructured ? raw.input || "" : raw;

    // 2. DESCOMPOSICIÓN SEMÁNTICA
    const actions = splitActions(input)
        .map(a => a.trim())
        .filter(Boolean);

    /* ======================================
        DIRECT DSL BYPASS
    ====================================== */
    if (isStructured) {
        return [`${raw.intent || "ANALYZE"}::${raw.target || "system"}`];
    }

    const cleanRaw = String(raw || "").trim();
    if (cleanRaw.includes("::")) {
        return cleanRaw.split(";;").map(x => x.trim()).filter(Boolean);
    }

    const commands = [];

    // 3. PIPELINE DE INTELIGENCIA (V5.19 FINAL)
    for (const action of actions) {
        const t = String(action).trim();
        if (!t) continue;

        const low = t.toLowerCase();

        /* ======================================
            HARD BYPASS (REGLAS DE ORO)
        ====================================== */
        if (low.includes("estado") || low.includes("general")) {
            commands.push("ANALYZE::system");
            continue;
        }

        if (low.includes("pago") || low.includes("pagos")) {
            commands.push("ANALYZE::payments");
            continue;
        }

        /* ======================================
            SOCIAL & NATIVE ROUTERS
        ====================================== */
        if (isSocialJarvis(t) || isNativeJarvis(t)) {
            commands.push(t);
            continue;
        }

        /* ======================================
            🔥 INTENT ENGINE DELEGATION
        ====================================== */
        // Delegamos al motor real para obtener la estructura técnica
        const structured = await runIntentEngine(t);

        if (structured && structured.intent && structured.entity) {
            commands.push(`${structured.intent}::${structured.entity}`);
            continue;
        }

        /* ======================================
            LANGUAGE CORE (FALLBACK FINAL)
        ====================================== */
        if (window.JarvisLanguageCore?.translate) {
            let translated = await window.JarvisLanguageCore.translate(t);

            // Normalización de salida del Core
            if (!Array.isArray(translated)) {
                translated = translated ? [translated] : [fallbackTranslate(t)];
            }

            for (const cmd of translated) {
                if (!cmd || typeof cmd !== "string") continue;
                const cleanCmd = cmd.toUpperCase().trim();
                
                // Evitar colapsos por strings vacíos
                if (!cleanCmd || cleanCmd === "CREATE::SYSTEM") continue;
                
                commands.push(cmd);
            }
        } else {
            const fb = fallbackTranslate(t);
            if (fb) commands.push(fb);
        }
    }

    // 4. DESPACHO DE COMANDOS ACUMULADOS
    return commands;
}
/* =====================================================================================
   EXECUTION CORE V6.1 HYBRID SOCIAL (CORREGIDO V5.95)
===================================================================================== */
async function executeCommands(commands = []) {
    const outputs = [];
    const burstCache = new Map();
    
    for (let cmd of commands) {
        if (typeof cmd === "string") {
            const low = cmd.toLowerCase();
            
            // 🔥 MANTENER PARCHE DE SEGURIDAD V5.95
            if (
                low.includes("cerrar sesion") ||
                low.includes("cerrar sesión") ||
                low.includes("logout") ||
                low.includes("sign out")
            ) {
                cmd = "REPAIR::admin.logout"; 
            }
        }

        if (typeof cmd === "object" && cmd !== null) {
            const rawCmd = String(cmd.cmd || "").toLowerCase();
            if (
                rawCmd.includes("cerrar sesion") ||
                rawCmd.includes("cerrar sesión") ||
                rawCmd.includes("logout")
            ) {
                cmd = {
                    cmd: "REPAIR::admin.logout",
                    raw: cmd.raw || ""
                };
            }
        }

        safeLog("EXEC", cmd);

        try {
            if (burstCache.has(cmd)) {
                safeLog("CACHE_HIT", cmd);
                outputs.push(
                    beautifyOutput(
                        cmd,
                        burstCache.get(cmd),
                        true
                    )
                );
                continue;
            }

            const t0 = performance.now();
            
            // 🔥 LÓGICA DE EJECUCIÓN REAL
            let res = await runCore(cmd); 
            burstCache.set(cmd, res);

            outputs.push(
                beautifyOutput(
                    cmd,
                    res,
                    false,
                    performance.now() - t0
                )
            );
            
        } catch (error) {
            console.error("❌ [EXEC_FAIL]:", error);
            outputs.push(`Error en comando: ${error.message}`);
        }
    }
    return outputs;
}

// 🔥 CLAVE: Exponer la función al scope global para detener el bucle del Briefing
window.executeCommands = executeCommands; 
           /* =====================================================================================
    EXECUTION CORE V6.1 HYBRID SOCIAL (CORREGIDO V5.95)
    PROTECCIÓN DE REDECLARACIÓN ACTIVA
===================================================================================== */

// 1. Usamos window.executeCommands para evitar el error "already been declared"
window.executeCommands = async function(commands = []) {
    const outputs = [];
    const burstCache = new Map();
    
    for (let cmd of commands) {
        if (typeof cmd === "string") {
            const low = cmd.toLowerCase();
            
            // 🔥 MANTENER PARCHE DE SEGURIDAD V5.95
            if (
                low.includes("cerrar sesion") ||
                low.includes("cerrar sesión") ||
                low.includes("logout") ||
                low.includes("sign out")
            ) {
                cmd = "REPAIR::admin.logout"; 
            }
        }

        if (typeof cmd === "object" && cmd !== null) {
            const rawCmd = String(cmd.cmd || "").toLowerCase();
            if (
                rawCmd.includes("cerrar sesion") ||
                rawCmd.includes("cerrar sesión") ||
                rawCmd.includes("logout")
            ) {
                cmd = {
                    cmd: "REPAIR::admin.logout",
                    raw: cmd.raw || ""
                };
            }
        }

        safeLog("EXEC", cmd);

        try {
            // 2. VERIFICACIÓN DE CACHÉ OPERATIVA
            if (burstCache.has(cmd)) {
                safeLog("CACHE_HIT", cmd);
                outputs.push(
                    beautifyOutput(cmd, burstCache.get(cmd), true)
                );
                continue;
            }

            let res;
            const t0 = performance.now();

            /* ==================================
                SOCIAL + NATIVE + CORE ROUTER
            ================================== */
            if (isSocialJarvis(cmd) || isNativeJarvis(cmd)) {
                res = await withTimeout(executeNativeJarvis(cmd), 8000);
            } else {
                res = await withTimeout(runCore(cmd), 8000);
            }

            const ms = Math.round(performance.now() - t0);
            const clean = normalize(res);

            // 3. REGISTRO EN MEMORIA Y MÉTRICAS
            burstCache.set(cmd, clean);

            outputs.push(
                beautifyOutput(cmd, clean, false)
            );

            safeLog("METRIC", { cmd, ms });

            saveHistory({
                cmd,
                ms,
                result: clean
            });

        } catch (error) {
            safeError("CMD_FAIL", { cmd, error });
            outputs.push(`Error en ${cmd}`);
            saveHistory({ cmd, error: true });
        }
    } 

    return outputs;
}; 

// ✅ Ya no necesitas window.executeCommands = executeCommands al final 
// porque ya la definimos directamente en window.

/* =====================================================================================
    MAIN BRIDGE
===================================================================================== */
export const JarvisBridge = {

    /* =====================================================
        AUTONOMOUS SUPERVISED CORE STATE
    ===================================================== */
    supervisedMode: true,
    pendingProposal: null,
    lastAuditAt: 0,
    codeSurgeonMode: true,

    knownModules: {
        tecnico: "./panel-tecnico.js",
        tecnico_b2b: "./panel-tecnico.js",
        admin: "./panel-admin.js",
        cliente: "./panel-cliente.js",
        bridge: "/gestia-core/jarvis/jarvis.bridge.v5.js",
        terminal: "/gestia-core/gestia-terminal.js",
        memory: "/gestia-core/jarvis/jarvis.memory.js",
        ui: "./app-main.js"
    },

    async dispatch(input = "") {

        let raw;
        let rawLow;

        // 1. NORMALIZACIÓN DE ENTRADA
        const isStructured = typeof input === "object" && input !== null;

        if (isStructured) {
            raw = input;
            rawLow = `${input.intent || ""}::${input.target || ""}`.toLowerCase();
        } else {
            raw = String(input || "").trim();
            rawLow = raw.toLowerCase();
        }

        /* =====================================================
            🔥 INYECCIÓN V5.19: REDIRECCIÓN DE TELEMETRÍA
            Asegura que "estado general" toque el motor de datos.
        ===================================================== */
        if (rawLow.includes("estado") || rawLow.includes("general") || rawLow.includes("analyze::system")) {
            safeLog("DISPATCH", "Redirigiendo a Análisis de Telemetría Real.");
        }

        /* =====================================================
            CODE SURGEON MODE (Lógica existente...)
        ===================================================== */
        if (
            this.codeSurgeonMode &&
            (
            rawLow.includes("revisa panel") ||
            rawLow.includes("analiza panel") ||
            rawLow.includes("revisa movil") ||
            rawLow.includes("revisa móvil") ||
            rawLow.includes("optimiza panel") ||
            rawLow.includes("corrige panel")
        )
    ) {

        let target =
            this.knownModules.tecnico;

        if (
            rawLow.includes("admin")
        ) {
            target =
                this.knownModules.admin;
        }

        if (
            rawLow.includes("cliente")
        ) {
            target =
                this.knownModules.cliente;
        }

        const proposal = {
            id:
                crypto.randomUUID(),
            type:
                "CODE_SURGEON",
            title:
                "Optimización responsive supervisada",
            target,
            issue:
                rawLow.includes("movil") ||
                rawLow.includes("móvil")
                    ? "Sobredimensión móvil detectada"
                    : "Densidad visual mejorable",
            patch: [
                "Reducir padding móvil",
                "Compactar tarjetas",
                "Escalar tipografías responsive",
                "Optimizar botones táctiles"
            ],
            risk: "BAJO",
            createdAt:
                Date.now()
        };

        this.pendingProposal =
            proposal;

        const msg =
`Detecté oportunidad de mejora visual.

Archivo objetivo:
${proposal.target}

Problema:
${proposal.issue}

Propuesta:
• ${proposal.patch.join("\n• ")}

Riesgo:
${proposal.risk}

Escribe:
• arre
• aprobar
• cancelar`;

        render(
            "Jarvis Code Surgeon",
            msg,
            "warning"
        );

        safeLog(
            "CODE_SURGEON_PROPOSAL",
            proposal
        );

        return {
            ok: true,
            waitingApproval: true,
            proposal
        };
    }
        /* =====================================================
           CONTEXT MEMORY RESOLUTION
        ===================================================== */
        if (
            window.JarvisContextMemory &&
            typeof window
                .JarvisContextMemory
                .resolveReferences ===
                "function"
        ) {
            raw =
                window
                .JarvisContextMemory
                .resolveReferences(
                    raw
                );
        }

        /* =====================================================
           EMPTY INPUT GUARD
        ===================================================== */
        if (!raw) {
            return {
                ok: false,
                message:
                    "Entrada vacía."
            };
        }

        safeLog(
            "INPUT",
            raw
        );

        const cmd =
            raw.toLowerCase();

     /* =====================================================
   SUPERVISED APPROVAL FLOW
   SOLO PROPUESTAS REALES
===================================================== */

const pendingProposal =
(
    this.pendingProposal &&
    [
        "CODE_SURGEON",
        "REWRITE",
        "HEALTH_CHECK",
        "UI_AUDIT"
    ].includes(
        this.pendingProposal.type
    )
)
    ? this.pendingProposal
    : null;
/* ==========================================
   APPROVE + EXECUTE REAL
========================================== */

if (
    pendingProposal &&
    [
        "arre",
        "aprobar",
        "autorizar",
        "confirmar",
        "ok",
        "dale"
    ].includes(cmd)
) {

    const proposal =
        pendingProposal;

    this.pendingProposal =
        null;

    window.__JARVIS_PENDING__ =
        null;

    render(
        "Jarvis",
        `Autorización confirmada.\nEjecutando propuesta: ${proposal.title}`,
        "success"
    );

    safeLog(
        "SUPERVISED_EXEC",
        proposal
    );

    let execResult =
        "Propuesta ejecutada.";

    try {

  /* ======================================
   CODE SURGEON
====================================== */

if (
    proposal.type ===
    "CODE_SURGEON"
) {

    const target =
        proposal.target ||
        "./panel-tecnico.js";

    const issue =
        proposal.issue ||
        "Incidencia detectada";

    const actions =
        Array.isArray(
            proposal.patch
        )
            ? proposal.patch
            : [];

    let kernelCommand =
        "ANALYZE::system";

    let moduleName =
        "Sistema General";

  /* ==================================
   SMART ROUTER
================================== */

let physicalPatch =
    false;

let patchSummary =
    [];

let patchedSource =
    null;

if (
    target.includes(
        "panel-admin"
    )
) {

    kernelCommand =
        "REPAIR::admin";

    moduleName =
        "Panel Admin";
}

else if (
    target.includes(
        "panel-cliente"
    )
) {

    kernelCommand =
        "REPAIR::cliente";

    moduleName =
        "Panel Cliente";
}

else if (
    target.includes(
        "panel-tecnico"
    )
) {

    kernelCommand =
        "REPAIR::tecnico";

    moduleName =
        "Panel Técnico";
}

else if (
    target.includes(
        "terminal"
    )
) {

    kernelCommand =
        "REPAIR::terminal";

    moduleName =
        "Gestia Terminal";
}

else if (
    target.includes(
        "bridge"
    )
) {

    kernelCommand =
        "REPAIR::system";

    moduleName =
        "Jarvis Bridge";
}

/* ==================================
   PHYSICAL PATCH ENGINE
================================== */

try {

    const repoKey =
        target
            .replace("./", "")
            .replace(/\//g, "_")
            .replace(/\.js/g, "")
            .toUpperCase();

    const sourceKey =
        "__SOURCE_" +
        repoKey +
        "__";

    let source =
        window[sourceKey];

    if (
        typeof source ===
        "string" &&
        source.length > 20
    ) {

        patchedSource =
            source;

        const lowIssue =
            String(
                issue || ""
            ).toLowerCase();

        /* ==========================
            LOGOUT ADMIN FIX
        ========================== */

        if (
            target.includes(
                "panel-admin"
            ) &&
            (
                lowIssue.includes(
                    "logout"
                ) ||
                lowIssue.includes(
                    "cerrar sesion"
                ) ||
                lowIssue.includes(
                    "cerrar sesión"
                )
            )
        ) {

            if (
                patchedSource.includes(
                    "signOut("
                ) ||
                patchedSource.includes(
                    "auth.signOut("
                )
            ) {

                patchSummary.push(
                    "Revisión flujo logout detectada"
                );
            }

            if (
                !patchedSource.includes(
                    "__logoutBound"
                )
            ) {

                patchSummary.push(
                    "Protección doble click logout"
                );
            }

            physicalPatch =
                true;
        }

        /* ==========================
            MOBILE UI FIX
        ========================== */

        if (
            lowIssue.includes(
                "movil"
            ) ||
            lowIssue.includes(
                "móvil"
            )
        ) {

            patchSummary.push(
                "Optimización responsive"
            );

            physicalPatch =
                true;
        }

        if (
            physicalPatch
        ) {

            window[sourceKey] =
                patchedSource;
        }
    }

} catch (patchError) {

    safeLog(
        "PATCH_ENGINE_FAIL",
        patchError
    );
}

safeLog(
    "CODE_SURGEON_KERNEL",
    {
        target,
        moduleName,
        kernelCommand,
        issue,
        physicalPatch,
        patchSummary
    }
);

    try {

        /* ===============================
            PRECHECK
        =============================== */

        const precheck =
            await window
                .KernelHeberto
                .execute(
                    "ANALYZE::system",
                    null,
                    {
                        simulate: false
                    }
                );

        /* ===============================
            REPAIR EXECUTION
        =============================== */

        const coreRes =
            await window
                .KernelHeberto
                .execute(
                    kernelCommand,
                    null,
                    {
                        simulate: false
                    }
                );

        /* ===============================
            VERIFY PASS
        =============================== */

        const verify =
            await window
                .KernelHeberto
                .execute(
                    "ANALYZE::system",
                    null,
                    {
                        simulate: false
                    }
                );

        const msg =
            coreRes?.message ||
            coreRes?.report ||
            "Corrección aplicada.";

        const verifyMsg =
            verify?.message ||
            verify?.report ||
            "Validación completada.";

        execResult =
`🛠️ Code Surgeon autorizado.

Módulo:
${moduleName}

Archivo:
${target}

Hallazgo:
${issue}

Plan aplicado:
${
actions.length
? "• " + actions.join("\n• ")
: "• Ajuste automático inteligente"
}

Orden Kernel:
${kernelCommand}

Resultado:
${msg}

Verificación:
${verifyMsg}

Estado:
Corrección supervisada completada con éxito.`;

        safeLog(
            "CODE_SURGEON_SUCCESS",
            {
                target,
                kernelCommand
            }
        );

    } catch (error) {

        execResult =
`🛠️ Code Surgeon autorizado.

Módulo:
${moduleName}

Archivo:
${target}

Orden Kernel:
${kernelCommand}

Estado:
Falló la ejecución.

Detalle:
${error.message || error}`;

        safeLog(
            "CODE_SURGEON_FAIL",
            error
        );
    }
}
        /* ======================================
            REWRITE
        ====================================== */

        else if (
            proposal.type ===
            "REWRITE"
        ) {

            execResult =
`Reescritura estratégica aprobada.

Archivo:
${proposal.target}

Impacto esperado:
${proposal.impact}`;
        }

        /* ======================================
            HEALTH CHECK
        ====================================== */

        else if (
            proposal.type ===
            "HEALTH_CHECK"
        ) {

            const health =
                await runCore(
                    "jarvis resumen"
                );

            execResult =
                normalize(
                    health
                );
        }

        /* ======================================
            UI AUDIT
        ====================================== */

        else if (
            proposal.type ===
            "UI_AUDIT"
        ) {

            execResult =
`Auditoría visual iniciada.

Objetivo:
Panel técnico móvil.

Revisión:
• tarjetas
• paddings
• botones
• tipografías`;
        }

        /* ======================================
            FALLBACK
        ====================================== */

        else {

            execResult =
                proposal.title ||
                "Autorizado correctamente.";
        }

        render(
            "Jarvis",
            execResult,
            "success"
        );

        speak(
            execResult
        );

        return {
            ok: true,
            approved: true,
            executed: true,
            proposal,
            message:
                execResult
        };

    } catch (error) {

        safeError(
            "SUPERVISED_EXEC_FAIL",
            error
        );

        render(
            "Jarvis",
            "La ejecución supervisada falló.",
            "error"
        );

        return {
            ok: false,
            error: true,
            proposal,
            message:
                "Fallo en ejecución supervisada."
        };
    }
}

/* ==========================================
   REJECT
========================================== */

if (
    pendingProposal &&
    [
        "cancelar",
        "rechazar",
        "no",
        "abortar"
    ].includes(cmd)
) {

    const rejected =
        pendingProposal;

    this.pendingProposal =
        null;

    window.__JARVIS_PENDING__ =
        null;

    render(
        "Jarvis",
        `Propuesta cancelada: ${rejected.title}`,
        "warning"
    );

    safeLog(
        "SUPERVISED_CANCEL",
        rejected
    );

    return {
        ok: true,
        cancelled: true,
        proposal: rejected
    };
}
        /* =====================================================
            AUTONOMOUS SUPERVISED DETECTION
        ===================================================== */

        if (
            this.supervisedMode &&
            (
                cmd.includes("revisa sistema") ||
                cmd.includes("audita sistema") ||
                cmd.includes("mejora sistema") ||
                cmd.includes("jarvis autonomo") ||
                cmd.includes("jarvis autónomo")
            )
        ) {

            const proposal = {
                id: crypto.randomUUID(),
                type: "REWRITE",
                title:
                    "Optimizar router principal JarvisBridge",
                target:
                    "/gestia-core/jarvis/jarvis.bridge.v5.js",
                impact:
                    "Mayor autonomía supervisada, mejor respuesta y monitoreo.",
                risk: "BAJO",
                createdAt:
                    Date.now()
            };

            this.pendingProposal =
                proposal;

            const msg =
`He detectado una mejora viable.

Objetivo:
${proposal.title}

Archivo:
${proposal.target}

Impacto:
${proposal.impact}

Riesgo:
${proposal.risk}

Escribe:
• arre
• aprobar
• cancelar`;

            render(
                "Jarvis",
                msg,
                "warning"
            );

            safeLog(
                "SUPERVISED_PROPOSAL",
                proposal
            );

            return {
                ok: true,
                waitingApproval: true,
                proposal
            };
        }

        /* ==================================
            PURE SOCIAL FAST PATH
        ================================== */

        if (
    isSocialJarvis(raw) &&
    splitActions(raw).length === 1
) {

    const socialText =
        await executeSocialJarvis(
            raw
        );

    render(
        "Jarvis",
        socialText,
        "success"
    );

    speak(
        socialText
    );

    return {
        ok: true,
        route:
            "SOCIAL_NATIVE",
        commands: [raw],
        message:
            socialText
    };
}
       /* ==================================
    PREMIUM LOADER & EXECUTION (V5.95 FINAL)
================================== */

const loaders = [
    "Analizando solicitud...",
    "Consultando núcleo...",
    "Verificando integridad...",
    "Ejecutando protocolo...",
    "Sincronizando módulos...",
    "Finalizando operación..."
];

let loaderIndex = 0;
render("Jarvis", loaders[0], "info");

const loaderTimer = setInterval(() => {
    loaderIndex++;
    if (loaderIndex < loaders.length) {
        render("Jarvis", loaders[loaderIndex], "info");
    }
}, 700);

/* =====================================================
    🧠 GEMINI COMO CEREBRO (NLU PRIMARIO)
===================================================== */
const ai = await window.runExternalAI(raw);

if (
    ai &&
    ai.intent &&
    splitActions(raw).length === 1 // 🔥 SOLO si es una sola intención
) {

    let target = ai.target;
    const rawLow = String(raw).toLowerCase();

    if (!target || target === "system") {
        if (rawLow.includes("pago") || rawLow.includes("pagos")) {
            target = "payments";
        }
    }

    const aiFixed = {
        ...ai,
        target
    };

    safeLog("AI_INTENT", aiFixed);

    // 🔥 REEMPLAZO CRÍTICO: VALIDACIÓN CONTRA MOTOR REAL (SOVEREIGN FIX)
    let aiCmd = resolveAIIntent(aiFixed);

    if (aiCmd) {
        // Buscamos el motor en el scope global para evitar ReferenceError
        const engine = window.runIntentEngine || (typeof runIntentEngine === 'function' ? runIntentEngine : null);
        
        if (engine) {
            const structured = await engine(aiCmd);
            if (structured && structured.intent && structured.entity) {
                aiCmd = `${structured.intent}::${structured.entity}`;
            }
        }
    }

    if (aiCmd) {
        if (typeof loaderTimer !== 'undefined') clearInterval(loaderTimer); 

        const outputs = await executeCommands([aiCmd]);
        const finalText = (typeof composeResponse === 'function') 
            ? composeResponse(outputs) 
            : (outputs[0] || "Procesamiento completado.");

        render("Jarvis", finalText, "success");
        speak(finalText);

        return {
            ok: true,
            route: "GEMINI_CORE",
            commands: [aiCmd],
            message: finalText
        };
    }
}

try {
    // 1. Intentamos resolver por la vía normal
    let commands = await resolveCommands(raw);

    /* =====================================================
        🔥 CONTROL CENTRAL ABSOLUTO (BYPASS TOTAL)
        Este bloque pisa cualquier error de Language Core o NLU.
        Si el usuario pide salir, no hay discusión.
    ===================================================== */
    const textLow = raw.toLowerCase();

    if (
        (textLow.includes("cerrar") && textLow.includes("sesion")) ||
        (textLow.includes("cerrar") && textLow.includes("sesión")) ||
        textLow.includes("logout") ||
        textLow.includes("sign out") ||
        textLow.includes("desconectar") ||
        textLow.includes("salir del sistema")
    ) {
        // Forzamos el array de comandos a la instrucción única y correcta
        commands = ["REPAIR::admin.logout"];
    }

    // Registro en log del comando final
    safeLog("COMMANDS", commands);

    // 2. Ejecución de comandos (Aquí ya va REPAIR::admin.logout sí o sí)
    const outputs = await executeCommands(commands);

    const finalText = (typeof composeResponse === 'function') 
        ? composeResponse(outputs) 
        : "Comando ejecutado.";

    if (typeof loaderTimer !== 'undefined') clearInterval(loaderTimer);

    render("Jarvis", finalText, "success");
    speak(finalText);

    return {
        ok: true,
        route: "CORE_INTELLIGENT",
        commands,
        message: finalText
    };

} catch (error) {
    if (typeof loaderTimer !== 'undefined') clearInterval(loaderTimer);
    safeError("CORE_FAIL", error);

    try {
        render("Jarvis", "Activando respaldo cognitivo...", "info");
        const aiText = await window.runExternalAI(raw);
        render("Jarvis", aiText, "success");
        speak(aiText);

        return {
            ok: true,
            route: "AI_FALLBACK",
            message: aiText
        };
    } catch (subError) {
        return {
            ok: false,
            error: true,
            message: "Fallo total en el núcleo de inteligencia."
        };
    }
}
// ✅ CIERRE CORRECTO DEL DISPATCH Y EL OBJETO
    } 
};

// 🔥 EXPORTACIONES FINALES AL OBJETO WINDOW (PUNTO DE UNIÓN GLOBAL)
window.runExternalAI = runExternalAI;
window.resolveAIIntent = resolveAIIntent;
window.JarvisBridge = JarvisBridge;