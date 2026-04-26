/**
 * =====================================================================================
 * JARVIS BRIDGE V4.1 - SMART TRANSLATOR SOVEREIGN
 * PATCH SOBRE V4.0
 * =====================================================================================
 * MISIÓN:
 * Traducir lenguaje humano -> comandos que sí entiende el core.
 *
 * SOLUCIONA:
 * ❌ "Orden detectada. Falta objetivo específico."
 *
 * EJEMPLOS:
 * revisa pagos           -> ANALYZE::payments
 * abre cámaras           -> OPEN::camaras
 * corrige login          -> REPAIR::auth
 * revisa pagos y abre cámaras -> MULTI STEP
 * =====================================================================================
 */

function safeLog(label, data = "") {
    console.log(`🧠 [JARVIS_V4.1:${label}]`, data);
}

/* =====================================================================================
   ENTITY MAP
===================================================================================== */

function detectEntity(text = "") {

    const t = String(text).toLowerCase();

    const map = {
        pagos: "payments",
        cobros: "payments",
        facturas: "payments",

        login: "auth",
        acceso: "auth",
        usuario: "auth",
        usuarios: "auth",

        cámara: "camaras",
        camara: "camaras",
        cámaras: "camaras",
        camaras: "camaras",
        cctv: "camaras",

        tenant: "tenant",
        edificio: "tenant",
        torre: "tenant",

        firewall: "security",
        seguridad: "security",

        ledger: "ledger",
        historial: "ledger"
    };

    for (const key in map) {
        if (t.includes(key)) {
            return map[key];
        }
    }

    return "system";
}

/* =====================================================================================
   ACTION MAP
===================================================================================== */

function detectAction(text = "") {

    const t = String(text).toLowerCase();

    if (
        t.includes("revisa") ||
        t.includes("analiza") ||
        t.includes("consulta") ||
        t.includes("verifica")
    ) return "ANALYZE";

    if (
        t.includes("abre") ||
        t.includes("abrir") ||
        t.includes("mostrar")
    ) return "OPEN";

    if (
        t.includes("corrige") ||
        t.includes("repara") ||
        t.includes("fix") ||
        t.includes("arregla")
    ) return "REPAIR";

    if (
        t.includes("actualiza") ||
        t.includes("modifica") ||
        t.includes("patch")
    ) return "UPDATE";

    if (
        t.includes("crea") ||
        t.includes("genera")
    ) return "CREATE";

    if (
        t.includes("borra") ||
        t.includes("elimina")
    ) return "DELETE";

    return "ANALYZE";
}

/* =====================================================================================
   HUMAN -> CORE PROTOCOL
===================================================================================== */

function translateToCore(text = "") {

    const entity =
        detectEntity(text);

    const action =
        detectAction(text);

    return `${action}::${entity}`;
}

/* =====================================================================================
   PATCH DIRECTO AL BRIDGE EXISTENTE
===================================================================================== */

if (
    window.JarvisBridge &&
    typeof window.JarvisBridge.dispatch ===
        "function"
) {

    const originalDispatch =
        window.JarvisBridge.dispatch;

    window.JarvisBridge.dispatch =
        async function(input = "") {

            const raw =
                String(input).trim();

            if (!raw) {
                return await originalDispatch(raw);
            }

            const lower =
                raw.toLowerCase();

            /* =============================================
               NO TOCAR COMANDOS NATIVOS JARVIS
            ============================================= */

            if (
                lower.includes("jarvis estado") ||
                lower.includes("jarvis resumen") ||
                lower.includes("jarvis anomal")
            ) {
                return await originalDispatch(raw);
            }

            /* =============================================
               MULTI ACCIÓN
            ============================================= */

            const parts = raw
                .split(/\s+y luego\s+|\s+y\s+|\s+después\s+|\s+despues\s+/i)
                .map(x => x.trim())
                .filter(Boolean);

            const translated = parts.map(p =>
                translateToCore(p)
            );

            safeLog(
                "TRANSLATED",
                translated
            );

            /* =============================================
               EJECUTAR UNA POR UNA
            ============================================= */

            let results = [];

            for (const cmd of translated) {

                const res =
                    await originalDispatch(cmd);

                results.push(
                    res?.message ||
                    "OK"
                );
            }

            return {
                ok: true,
                route: "SMART_TRANSLATOR",
                message:
                    results.join("\n\n")
            };
        };

    safeLog(
        "ONLINE",
        "Smart Translator Activated"
    );
}

/* =====================================================================================
   PATCH FINAL PARA /gestia-core/jarvis/jarvis.bridge.v4.js
   PEGA ESTE BLOQUE AL FINAL DEL ARCHIVO
   =====================================================================================
   MISIÓN:
   Conectar Bridge actual (V4 + V4.1) con Language Core V5
===================================================================================== */

if (
    window.JarvisBridge &&
    window.JarvisLanguageCore
) {

    const oldDispatch =
        window.JarvisBridge.dispatch;

    window.JarvisBridge.dispatch =
        async function(input = "") {

            const raw =
                String(input).trim();

            if (!raw) {
                return await oldDispatch(raw);
            }

            console.log(
                "🧠 [BRIDGE_V5_INPUT]",
                raw
            );

            /* =================================================
               COMANDOS NATIVOS JARVIS
            ================================================= */

            const low =
                raw.toLowerCase();

            if (
                low.includes("jarvis estado") ||
                low.includes("jarvis resumen") ||
                low.includes("jarvis anomal")
            ) {
                return await oldDispatch(raw);
            }

            /* =================================================
               PARSEO NATURAL V5
            ================================================= */

            const parsed =
                window
                .JarvisLanguageCore
                .parseHumanCommand(raw);

            const commands =
                window
                .JarvisLanguageCore
                .toLegacyCommands(parsed);

            console.log(
                "🧠 [BRIDGE_V5_PLAN]",
                parsed
            );

            console.log(
                "🧠 [BRIDGE_V5_CMDS]",
                commands
            );

            /* =================================================
               EJECUCIÓN UNA A UNA
            ================================================= */

            let outputs = [];

            for (const cmd of commands) {

                const res =
                    await oldDispatch(cmd);

                outputs.push(
                    res?.message ||
                    res?.report ||
                    "OK"
                );
            }

            return {
                ok: true,
                route: "LANGUAGE_CORE_V5",
                commands,
                message:
                    outputs.join("\n\n")
            };
        };

    console.log(
        "%c🧠 [BRIDGE_V5]: LANGUAGE CORE ACOPLADO",
        "color:#10b981;font-weight:bold;"
    );
}