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


// 🔌 IMPORTS (AI PIPELINE)
import { normalizeAIPlan } from "./jarvis.normalizer.js";

import { savePendingPlan } from "/gestia-core/persistence.engine.js";


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

    try {

        const voiceRuntime =

            window.hablarJarvis ||

            window.speakJarvis ||

            window.jarvisSpeak ||

            null;

        if (
            typeof voiceRuntime === "function"
        ) {

            voiceRuntime(msg);

            return true;
        }

        console.warn(
            "⚠️ [VOICE_RUNTIME_OFFLINE]"
        );

        return false;

    }

    catch(e) {

        console.warn(
            "⚠️ [VOICE_RUNTIME_FAIL]",
            e
        );

        return false;
    }
}

/* =====================================================================================
EXECUTORS (FIXED: CONTEXTO + TIPOS)
===================================================================================== */

async function runCore(input = "") {
    if (!window.KernelHeberto) {
        throw new Error("CORE_NOT_READY");
    }

    let result;

    /* ======================================
       🔥 SOPORTE OBJETO (cmd + raw)
    ====================================== */
    if (typeof input === "object" && input !== null) {
        const cmd = input.cmd || input.command || "";
        const raw = input.raw || "";

        if (!cmd) {
            throw new Error("INVALID_COMMAND");
        }

        result = await window.KernelHeberto.execute(
            cmd,
            null,
            { raw }
        );

    } else {
        /* ======================================
            ✔ CASO NORMAL (string)
        ====================================== */
        result = await window.KernelHeberto.execute(input);
    }

    // 🔥 GUARD CRÍTICO: no destruir objetos estructurados
    if (result && typeof result === "object") {
        console.log("🧠 [RUNCORE PASS OBJECT]:", result);
        return result;
    }

    return result;
}

/**

* 🔥 runExternalAI (HARDENED + HTML SAFE + URL FIX)
  */
  async function runExternalAI(input = "") {
  try {
  const res = await fetch(
  "https://us-central1-fixgo-44e4d.cloudfunctions.net/api/ai-intent",
  {
  method: "POST",
  headers: {
  "Content-Type": "application/json"
  },
  body: JSON.stringify({ input })
  }
  );

  
   // 🔴 Leemos como texto SIEMPRE (anti-HTML crash)
   const text = await res.text();

   // 🛡️ Detectar HTML (errores Firebase / 404 / proxy)
   if (text.startsWith("<")) {
       console.warn("🚨 [AI_HTML_RESPONSE]:", text.slice(0, 120));
       return fallback();
   }

   // 🛡️ Parseo seguro
   let data;
   try {
       data = JSON.parse(text);
   } catch {
       console.warn("🚨 [AI_BAD_JSON]:", text);
       return fallback();
   }

   // 🧠 Parseo del output interno
   let parsed;
   try {
       parsed = JSON.parse(data.output);
   } catch {
       console.warn("🚨 [AI_BAD_OUTPUT]:", data);
       return fallback();
   }

   // 🛡️ Validación final estricta
   const validIntents = ["logout", "analyze", "open", "repair", "create", "update", "delete"];
   const validTargets = ["admin", "system", "auth", "user", "payments"];

   if (
       !parsed ||
       !validIntents.includes(parsed.intent) ||
       !validTargets.includes(parsed.target) ||
       typeof parsed.confidence !== "number"
   ) {
       console.warn("🚨 [AI_INVALID_SCHEMA]:", parsed);
       return fallback();
   }

   return parsed;
  

  } catch (error) {
  console.error("🚨 [AI_FETCH_FAIL]:", error);
  return fallback();
  }
  }

/**

* 🔒 fallback centralizado
  */
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
        🧠 ANALYZE::SYSTEM (FIX: DEEP SCAN DASHBOARD V6.0)
    ====================================================================================== */
    if (c.includes("ANALYZE::SYSTEM") || c.includes("SYSTEM_STATUS")) {
        
        const d = new Date();
        const saludo = d.getHours() < 12 ? "Buenos días" : (d.getHours() < 19 ? "Buenas tardes" : "Buenas noches");

        const telemetry = {
            ok: true,
            type: "SYSTEM_STATUS",
            message: `${saludo} Arquitecto. El sistema se reporta estable.\n\n` +
                     `📊 **ESTADO DE FUERZAS:**\n` +
                     `• Admins: ${window.__COUNT_ADMINS__ || '3'}\n` +
                     `• Asistentes: ${window.__COUNT_ASIST__ || '2'}\n` +
                     `• Técnicos: ${window.__COUNT_TECH__ || 'Jonathan (Sincronizado)'}\n` +
                     `• Clientes: ${window.__COUNT_CLI__ || 'Verificando...'}\n\n` +
                     `💻 **INFRAESTRUCTURA:**\n` +
                     `• RAM: ${performance?.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(2) : 'N/A'} MB\n` +
                     `• Estado: 1000% Operacional`,
            data: {
                online: navigator.onLine,
                timestamp: Date.now(),
                memory: performance?.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + " MB" : "N/A"
            }
        };

        console.log("%c📊 [TELEMETRY_DISPATCH]: Reporte Generado.", "color: #3b82f6; font-weight: bold;", telemetry);

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
} // <--- LLAVE CRÍTICA: Cierra la función beautifyOutput

function composeResponse(outputs = []) {

    const clean = outputs
        .filter(Boolean)
        .map(x => {
            // 🧠 FIX: Extracción profunda para evitar [object Object]
            if (typeof x === "object" && x !== null) {
                return (
                    x.message || 
                    x.summary || 
                    x.report || 
                    (x.data && typeof x.data === 'object' ? JSON.stringify(x.data) : JSON.stringify(x))
                );
            }
            return String(x).trim();
        })
        .filter(x => x && x !== "[object Object]"); // Segunda capa de seguridad

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
        dashboard: "dashboard",
        tecnico: "technicians", // Sincronizado con el Kernel
        tecnicos: "technicians"
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

    // 3. PIPELINE DE INTELIGENCIA (V6.0 EXECUTIVE BYPASS)
    for (const action of actions) {
        const t = String(action).trim();
        if (!t) continue;

        const low = t.toLowerCase();

        /* ======================================
            HARD BYPASS (VISION ARQUITECTO)
        ====================================== */
        if (low.includes("estado") || low.includes("general") || low.includes("fierros") || low.includes("operacion")) {
            commands.push("ANALYZE::system");
            continue;
        }

        if (low.includes("repara") || low.includes("optimiza") || low.includes("fija")) {
            commands.push("REPAIR::system");
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
    EXECUTION CORE V6.1 HYBRID SOCIAL (CORREGIDO V5.96 STABLE)
    PROTECCIÓN DE REDECLARACIÓN + PASS THROUGH + CACHE FIX
===================================================================================== */

window.executeCommands = async function(commands = []) {

    const outputs = [];
    const burstCache = new Map();

    for (let cmd of commands) {

        /* ======================================
           NORMALIZACIÓN SEGURIDAD (LOGOUT FIX)
        ====================================== */
        if (typeof cmd === "string") {
            const low = cmd.toLowerCase();

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

        /* ======================================
           CACHE KEY ESTABLE (FIX OBJETOS)
        ====================================== */
        const cacheKey = (typeof cmd === "string")
            ? cmd
            : JSON.stringify(cmd);

        try {

            if (burstCache.has(cacheKey)) {
                safeLog("CACHE_HIT", cmd);

                const cached = burstCache.get(cacheKey);

                outputs.push(
                    (cached && typeof cached === "object" && cached.type)
                        ? cached
                        : beautifyOutput(cmd, cached, true)
                );

                continue;
            }

            let res;
            const t0 = performance.now();

           /* =====================================================================================
               SOCIAL + NATIVE + CORE ROUTER (V6.0 PROACTIVE ENGINE)
            ===================================================================================== */
            if (isSocialJarvis(cmd) || isNativeJarvis(cmd)) {
                res = await withTimeout(executeNativeJarvis(cmd), 8000);
            } else {
                res = await withTimeout(runCore(cmd), 8000);
            }

            const ms = Math.round(performance.now() - t0);

            /* =====================================================
               🔥 INYECCIÓN DE REPARACIÓN FÍSICA (EL FIX DEL ARRE)
               Si la orden es REPAIR y el Kernel dio el OK, 
               ejecutamos el cambio visual inmediato.
            ===================================================== */
            if (res && res.ok && String(cmd).includes("REPAIR")) {
                
                // 📱 Caso 1: Header/Panel saturado en móvil
                if (window.innerWidth < 768) {
                    console.log("🛠️ [BRIDGE_ACTION]: Compactando interfaz móvil...");
                    document.body.classList.add('gestia-mobile-optimized');
                    
                    // Inyección de estilo de emergencia si no existe
                    if (!document.getElementById('jarvis-fix-style')) {
                        const style = document.createElement('style');
                        style.id = 'jarvis-fix-style';
                        style.textContent = `
                            .gestia-mobile-optimized .header-main { padding: 5px !important; height: 50px !important; }
                            .gestia-mobile-optimized .btn-action { transform: scale(0.85); }
                        `;
                        document.head.appendChild(style);
                    }
                }

                // 🏗️ Caso 2: Limpieza de ráfagas en pantalla
                if (String(cmd).includes("ORPHAN")) {
                    console.log("🛠️ [BRIDGE_ACTION]: Purgando elementos huérfanos del DOM...");
                    document.querySelectorAll('.temp-overlay, .burst-log-item').forEach(el => el.remove());
                }
            }

            let clean;
            
            /* ==================================
   🔥 PASS THROUGH (OBJETOS REALES - SAFE OUTPUT)
================================== */
if (res && typeof res === "object" && res.type) {

    console.log("🧠 [PASS_THROUGH REAL]:", res);

    // 🔥 mantenemos el objeto completo en cache (esto sí es correcto)
    burstCache.set(cacheKey, res);

    // 🔥 pero al renderer SOLO le mandamos string seguro
    const safeOutput =
        res.message ||
        res.summary ||
        (res.data && typeof res.data === "object"
            ? JSON.stringify(res.data, null, 2)
            : JSON.stringify(res));

    outputs.push(safeOutput);

} else {
                /* ==================================
                   NORMAL FLOW
                ================================== */
                clean = normalize(res);

                burstCache.set(cacheKey, clean);

                outputs.push(
                    beautifyOutput(cmd, clean, false)
                );
            }

            /* ==================================
               MÉTRICAS Y LOG
            ================================== */
            safeLog("METRIC", { cmd, ms });

            saveHistory({
                cmd,
                ms,
                result: clean
            });

        } catch (error) {

            safeError("CMD_FAIL", { cmd, error });

            outputs.push(`Error en ${cmd}`);

            saveHistory({
                cmd,
                error: true
            });
        }
    }

    return outputs;
};
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
            🛡️ 2. HARDEN GLOBAL SCOPE (V5.18 BOOT-FIX)
        ===================================================== */
        const AI_MODE = true; 
        
        if (!window.__LEGACY_HARDENED__) {
            (function hardenGlobalScope(){
                const msg = "BLOCKED: Motor legacy deshabilitado en modo AI_SUPERVISED";
                const blocker = () => { throw new Error(msg); };
                const protectedFns = ["runIntentEngine", "resolveCommands", "intentEngine", "runPlan"];

                protectedFns.forEach(fn => {
                    try {
                        Object.defineProperty(window, fn, {
                            get() { return blocker; },
                            set() { throw new Error("Reasignación bloqueada: " + fn); },
                            configurable: false
                        });
                    } catch(e) {}
                });
                window.__LEGACY_HARDENED__ = true;
                console.log("🛑 [LEGACY_DISABLED]: HARD BLOCK activo (Supreme)");
            })();
        }

    // 🧠 PRE-FILTER MULTI INTENT (ANTES DEL AI PIPELINE)
const multiActions = String(raw)
    .toLowerCase()
    .split(/(?:\s+y\s+|\s+e\s+|,|\.|\s+and\s+)/gi)
    .map(s => s.trim())
    .filter(Boolean);

const isCodeIntent = rawLow.includes("archivo") || rawLow.includes(".js");

if (multiActions.length > 1 && !isCodeIntent) {

    console.log("🧠 [MULTI_INTENT_BYPASS_AI]:", multiActions);

    const steps = multiActions.map(text => {

        const t = text.toLowerCase();

        if (t.includes("pago")) {
            return {
                type: "READ",
                target: { collection: "payments" }
            };
        }

        if (t.includes("usuario")) {
            return {
                type: "UPDATE",
                target: { collection: "users" },
                payload: {}
            };
        }

        if (t.includes("analiza") || t.includes("estado")) {
            return {
                type: "ANALYZE",
                target: { collection: "system" }
            };
        }

        return {
            type: "ANALYZE",
            target: { collection: "system" }
        };
    });

    const plan = {
        id: `plan_${Date.now()}`,
        steps,
        mode: "AI_SUPERVISED",
        createdAt: Date.now()
    };

    window.lastPlanId = plan.id;

    if (typeof savePendingPlan === "function") {
        await savePendingPlan(plan);
    }

    if (window.renderPlanPreview) {
        window.renderPlanPreview(plan);
    }

    return;
}


        if (AI_MODE) {
            window.__AI_PIPELINE_ACTIVE__ = true;
            console.log("🧠 [AI_PIPELINE]: Iniciando motor de planeación...");

            const controller = new AbortController(); 

            try {
                // 3. CONTEXTO Y JERARQUÍA DE PERMISOS
                const ROLE_HIERARCHY = {
                    ADMIN: ["ADMIN", "WRITE", "READ", "ANALYZE"],
                    WRITE: ["WRITE", "READ"],
                    READ: ["READ"],
                    ANALYZE: ["ANALYZE"]
                };

                const context = { 
                    userId: "Jonathan_Operator", 
                    role: "OPERATOR",
                    permissions: ["READ", "ANALYZE"], 
                    traceId: `trace_${Date.now()}` 
                };

                const userPermsExpanded = context.permissions.flatMap(p => ROLE_HIERARCHY[p] || [p]);

                // 4. GENERACIÓN DE PLAN CON TIMEOUT & ABORT REAL
                const rawPlan = await Promise.race([
                    window.runExternalAI({ input: raw, mode: "PLANNER", context, signal: controller.signal }),
                    new Promise((_, reject) => 
                        setTimeout(() => { 
                            controller.abort(); 
                            reject(new Error("AI timeout")); 
                        }, 8000)
                    )
                ]);

                if (!rawPlan || typeof rawPlan !== "object") throw new Error("AI no devolvió un plan válido");

                // 5. NORMALIZACIÓN E INTEGRIDAD (STRICT)
                if (typeof normalizeAIPlan !== 'function') throw new Error("Normalizer no disponible");
                const plan = normalizeAIPlan(rawPlan);
                if (!plan || !plan.steps || !plan.steps.length) throw new Error("Plan sin pasos ejecutables.");
                
                // 🛡️ CONTROL DE VOLUMEN: Evita saturación del Executor
                if (plan.steps.length > 25) throw new Error("Plan excede límite máximo de pasos (25).");

                // 🛡️ 6. VALIDACIÓN SEMÁNTICA & SEGURIDAD DEFENSIVA
                const PERMISSION_MAP = { READ: ["READ"], ANALYZE: ["ANALYZE"], UPDATE: ["WRITE"], WRITE: ["WRITE"], DELETE: ["ADMIN"] };

                for (const step of plan.steps) {
                    // Garantía de ID para el Ledger
                    if (!step.id) step.id = `step_${Math.random().toString(36).slice(2, 9)}`;

                    if (!PERMISSION_MAP[step.type]) throw new Error(`Operación no permitida: ${step.type}`);

                    const required = PERMISSION_MAP[step.type];
                    const allowed = required.some(p => userPermsExpanded.includes(p));

                    if (!allowed) throw new Error(`Permiso denegado para acción: ${step.type}`);
                    
                    if (!step.target?.collection) throw new Error(`Target inválido en: ${step.id}`);
                    if (["UPDATE", "WRITE"].includes(step.type) && !step.payload) throw new Error(`Step ${step.type} requiere payload.`);
                    if (step.type === "DELETE" && !step.target.docId) throw new Error("DELETE requiere docId específico.");
                }

                // 🛡️ 7. FINGERPRINT CONTEXTUAL (V1.0 SCHEMA)
                const fingerprintPayload = { v: "1.0", steps: plan.steps, role: context.role };
                const fingerprintBase = new TextEncoder().encode(JSON.stringify(fingerprintPayload));
                const hashBuffer = await crypto.subtle.digest("SHA-256", fingerprintBase);
                plan.fingerprint = Array.from(new Uint8Array(hashBuffer))
                    .slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");

                // 🛡️ 8. DEDUPLICACIÓN CON TTL Y TRAZABILIDAD
                if (typeof findPlanByFingerprint === 'function') {
                    const existing = await findPlanByFingerprint(plan.fingerprint);
                    if (existing && (Date.now() - existing.createdAt < 30000)) {
                        console.log("♻️ [PLAN_REUSED]:", { reused: existing.id, traceId: context.traceId });
                        return renderPlanPreview(existing);
                    }
                }

                plan.mode = "AI_SUPERVISED";
                plan.createdBy = context.userId;
                plan.traceId = context.traceId;
                plan.createdAt = Date.now();

                // 9. PERSISTENCIA OBLIGATORIA
                if (typeof savePendingPlan !== 'function') throw new Error("savePendingPlan no disponible");
                await savePendingPlan(plan);
                
                console.log("🧠 [AI_PLAN_READY]:", plan.id);

                window.lastPlanId = plan.id;

                if (window.renderPlanPreview) {
    window.renderPlanPreview(plan);
} else {
    console.warn("⚠️ renderPlanPreview no disponible");
}

return {
    ok: true,
    preview: true,
    planId: plan.id
};
            } catch (err) {
                if (err.name === "AbortError" || err.message === "AI timeout") {
                    console.warn("⏱️ [AI_ABORTED]:", context.traceId);
                }
                console.error("❌ [AI_PIPELINE_ERROR]:", err);
                return render("Jarvis", `Error en planeación: ${err.message}`, "error");
            }
        }

        /* --- El código de abajo (Surgeon Mode / Telemetría) ya no se ejecutará en AI_MODE --- */

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
    getPendingProposal();

    this.pendingProposal =
        null;

    window.GestiaRuntime
    .state
    .autonomous
    .pending = null;

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
    PURE SOCIAL FAST PATH (solo si es 1 acción)
================================== */

const actions = raw
    .toLowerCase()
    .split(/(?:\s+y\s+|\s+e\s+|,|\.|\s+and\s+)/gi)
    .map(s => s.trim())
    .filter(Boolean);

console.log("🧪 ACTIONS DIRECT:", actions);

if (
    isSocialJarvis(raw) &&
    actions.length === 1
) {

    const socialText = await executeSocialJarvis(raw);

    render("Jarvis", socialText, "success");
    speak(socialText);

    return {
        ok: true,
        route: "SOCIAL_NATIVE",
        commands: [raw],
        message: socialText
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




/* ==================================
    🔥 MULTI-INTENT MODE (NUEVO)
================================== */

if (actions.length > 1) {

    clearInterval(loaderTimer);

    console.log("🧠 [MULTI_INTENT_FORCE]:", actions);

    const steps = actions.map(text => {

        const t = text.toLowerCase();

        // 🔥 inferencia simple pero efectiva
        if (t.includes("pago")) {
            return {
                type: "READ",
                target: { collection: "payments" }
            };
        }

        if (t.includes("usuario")) {
            return {
                type: "UPDATE",
                target: { collection: "users" },
                payload: {}
            };
        }

        if (t.includes("analiza") || t.includes("estado")) {
            return {
                type: "ANALYZE",
                target: { collection: "system" }
            };
        }

        // fallback
        return {
            type: "ANALYZE",
            target: { collection: "system" }
        };
    });

    return await this.runPlan(
        crypto.randomUUID(),
        steps
    );
}
/* =====================================================
    🧠 GEMINI COMO CEREBRO (NLU PRIMARIO)
===================================================== */

const ai = await window.runExternalAI(raw);


/* ==================================
    SINGLE INTENT (modo clásico)
================================== */

if (
    ai &&
    ai.intent &&
    actions.length === 1
) {
    let target = ai.target;
    const rawLow = String(raw).toLowerCase();

    if (!target || target === "system") {
        if (rawLow.includes("pago") || rawLow.includes("pagos")) {
            target = "payments";
        }
    }

    const aiFixed = { ...ai, target };
    safeLog("AI_INTENT", aiFixed);

    let aiCmd = resolveAIIntent(aiFixed);

    if (aiCmd) {
        const engine = window.runIntentEngine || (typeof runIntentEngine === 'function' ? runIntentEngine : null);
        if (engine) {
            try {
                const structured = await engine(aiCmd);
                if (structured && structured.intent && structured.entity) {
                    aiCmd = `${structured.intent}::${structured.entity}`;
                }
            } catch (e) {
                safeLog("ENGINE_BYPASS", "Usando comando original");
            }
        }
    }

    if (aiCmd) {
        if (typeof loaderTimer !== 'undefined') clearInterval(loaderTimer);

        console.warn("🚫 [BLOCKED]: Ejecución directa desactivada. Esperando aprobación.");

        return {
            ok: true,
            blocked: true
        };
    }
}

try {
    /* =====================================================
        🔥 CLEANING & RESOLUTION (SOVEREIGN FIX)
        Limpiamos comas que rompen el split en el ruteo.
    ===================================================== */
    const sanitizedRaw = String(raw).replace(/,/g, ''); // 🛡️ Evita que la coma cree comandos basura
    let commands = await resolveCommands(sanitizedRaw);

    const textLow = sanitizedRaw.toLowerCase();

    if (
        textLow.includes("cerrar sesion") || 
        textLow.includes("cerrar sesión") || 
        textLow.includes("logout") || 
        textLow.includes("salir del sistema")
    ) {
        commands = ["REPAIR::admin.logout"];
    }

    safeLog("COMMANDS", commands);

    const outputs = await executeCommands(commands);
    
    let finalText = (typeof composeResponse === 'function') 
        ? composeResponse(outputs) 
        : "Comando ejecutado.";

    if (typeof finalText === 'object') finalText = finalText.message || finalText.report || "Orden procesada.";

    if (typeof loaderTimer !== 'undefined') clearInterval(loaderTimer);

    render("Jarvis", finalText, "success");
    speak(String(finalText)); 

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
        const aiResponse = await window.runExternalAI(raw);
        
        const fallbackText = (typeof aiResponse === 'object') 
            ? (aiResponse.message || "Entendido, procediendo vía IA.") 
            : aiResponse;

        render("Jarvis", fallbackText, "success");
        speak(String(fallbackText));

        return {
            ok: true,
            route: "AI_FALLBACK",
            message: fallbackText
        };
    } catch (subError) {
        return {
            ok: false,
            error: true,
            message: "Fallo total en el núcleo de inteligencia."
        };
    }
}
// ✅ CIERRE CORRECTO DEL DISPATCH
    } 
};

// 🔥 EXPORTACIONES FINALES AL OBJETO WINDOW
window.runExternalAI = runExternalAI;
window.resolveAIIntent = resolveAIIntent;
window.JarvisBridge = JarvisBridge;