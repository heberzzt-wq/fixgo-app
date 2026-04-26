/**
 * =====================================================================================
 * JARVIS BRIDGE V5.0 - SOVEREIGN UNIFIED CORE
 * ARCHIVO:
 * /gestia-core/jarvis/jarvis.bridge.v4.js
 * =====================================================================================
 * REEMPLAZA TODO EL CONTENIDO ACTUAL POR ESTE ARCHIVO
 *
 * INTEGRA:
 * ✅ Base V4 real
 * ✅ Smart Translator V4.1
 * ✅ Language Core V5
 * ✅ Core local
 * ✅ IA externa
 * ✅ HUD + Voz
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
        try { window.hablarJarvis(msg); } catch(e){}
    }
}

/* =====================================================================================
   EXECUTORS
===================================================================================== */

async function runCore(text = "") {

    if (!window.KernelHeberto) {
        throw new Error("CORE_NOT_READY");
    }

    return await window.KernelHeberto.execute(text);
}

async function runExternalAI(text = "") {

    if (window.consultarCerebroIA) {
        return await window.consultarCerebroIA(text);
    }

    return "IA externa no disponible.";
}

/* =====================================================================================
   RESPONSE NORMALIZER
===================================================================================== */

function normalize(res) {

    if (!res) return "Sin respuesta.";

    return (
        res.report ||
        res.message ||
        res.response?.report ||
        res.response?.message ||
        "Orden completada."
    );
}

/* =====================================================================================
   LEGACY TRANSLATOR (fallback si no existe V5)
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

        camara: "camaras",
        cámaras: "camaras",
        camaras: "camaras",

        ticket: "tickets",
        tickets: "tickets",

        tenant: "tenant",
        edificio: "tenant"
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

    if (/corrige|repara|fix|arregla/.test(t))
        return "REPAIR";

    if (/actualiza|modifica|patch/.test(t))
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

/* =====================================================================================
   SPLITTER
===================================================================================== */

function splitActions(text = "") {

    return String(text)
        .split(/\s+y luego\s+|\s+y\s+|\s+después\s+|\s+despues\s+|\s+luego\s+/i)
        .map(x => x.trim())
        .filter(Boolean);
}

/* =====================================================================================
   NATIVE COMMANDS
===================================================================================== */

function isNativeJarvis(text = "") {

    const t = String(text).toLowerCase();

    return (
        t.includes("jarvis estado") ||
        t.includes("jarvis resumen") ||
        t.includes("jarvis anomal")
    );
}

/* =====================================================================================
   MAIN BRIDGE
===================================================================================== */

export const JarvisBridge = {

    async dispatch(input = "") {

        const raw = String(input).trim();

        if (!raw) {
            return {
                ok: false,
                message: "Entrada vacía."
            };
        }

        safeLog("INPUT", raw);

        render(
            "Jarvis",
            "Procesando solicitud...",
            "info"
        );

        try {

            /* =================================================
               COMANDOS NATIVOS
            ================================================= */

            if (isNativeJarvis(raw)) {

                const nativeRes =
                    await runCore(raw);

                const msg =
                    normalize(nativeRes);

                render("Jarvis", msg, "success");
                speak(msg);

                return {
                    ok: true,
                    route: "NATIVE",
                    message: msg
                };
            }

            /* =================================================
               LANGUAGE CORE V5
            ================================================= */

            let commands = [];

            if (
                window.JarvisLanguageCore &&
                typeof window
                    .JarvisLanguageCore
                    .parseHumanCommand ===
                    "function"
            ) {

                const parsed =
                    window
                    .JarvisLanguageCore
                    .parseHumanCommand(raw);

                commands =
                    window
                    .JarvisLanguageCore
                    .toLegacyCommands(parsed);

                safeLog(
                    "V5_PLAN",
                    parsed
                );

            } else {

                /* =============================================
                   FALLBACK V4.1
                ============================================= */

                const parts =
                    splitActions(raw);

                commands =
                    parts.map(x =>
                        fallbackTranslate(x)
                    );
            }

            safeLog(
                "COMMANDS",
                commands
            );

            /* =================================================
               EXECUTE CORE
            ================================================= */

            const outputs = [];

            for (const cmd of commands) {

                const res =
                    await runCore(cmd);

                outputs.push(
                    normalize(res)
                );
            }

            const finalText =
                outputs.join("\n\n");

            render(
                "Jarvis",
                finalText,
                "success"
            );

            speak(finalText);

            return {
                ok: true,
                route: "CORE_INTELLIGENT",
                commands,
                message: finalText
            };

        } catch (error) {

            safeError(
                "CORE_FAIL",
                error
            );

            try {

                const aiText =
                    await runExternalAI(raw);

                render(
                    "Jarvis",
                    aiText,
                    "success"
                );

                speak(aiText);

                return {
                    ok: true,
                    route: "AI_FALLBACK",
                    message: aiText
                };

            } catch (subError) {

                render(
                    "Jarvis",
                    "Incidencia controlada en el núcleo.",
                    "error"
                );

                speak(
                    "Incidencia controlada."
                );

                return {
                    ok: false,
                    error: true,
                    message:
                        error.message
                };
            }
        }
    }
};

/* =====================================================================================
   GLOBAL
===================================================================================== */

window.JarvisBridge = JarvisBridge;

safeLog(
    "ONLINE",
    "V5 Unified Ready"
);