/**
 * =====================================================================================
 * JARVIS BRIDGE V5.0 - SOVEREIGN UNIFIED CORE (FULL RESTORED)
 * ARCHIVO:
 * /gestia-core/jarvis/jarvis.bridge.v5.js
 * =====================================================================================
 * RESTAURADO FULL SIN RECORTES
 *
 * CONSERVA:
 * ✅ Base V4 real
 * ✅ Smart Translator V4.1
 * ✅ Language Core V5
 * ✅ Core local
 * ✅ IA externa
 * ✅ HUD + Voz
 * ✅ Context Memory
 * ✅ Compatibilidad legacy
 *
 * CORRIGE:
 * ✅ export duplicado dentro de dispatch
 * ✅ commands indefinido
 * ✅ flujo Language Core roto
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
        try {
            window.hablarJarvis(msg);
        } catch (e) {}
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

    if (window.askOpenAI) {
        return await window.askOpenAI(text);
    }

    return "IA externa no disponible.";
}

/* =====================================================================================
   RESPONSE NORMALIZER
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
        edificio: "tenant",

        reporte: "reports",
        dashboard: "dashboard",
        panel: "dashboard",

        proveedor: "vendors",
        proveedores: "vendors"
    };

    for (const key in map) {
        if (t.includes(key)) {
            return map[key];
        }
    }

    return "system";
}

function detectAction(text = "") {

    const t = String(text).toLowerCase();

    if (/revisa|analiza|consulta|verifica|checa/.test(t))
        return "ANALYZE";

    if (/abre|abrir|mostrar|enseña/.test(t))
        return "OPEN";

    if (/corrige|repara|fix|arregla/.test(t))
        return "REPAIR";

    if (/actualiza|modifica|patch|edita/.test(t))
        return "UPDATE";

    if (/crea|genera|haz/.test(t))
        return "CREATE";

    if (/borra|elimina|quita/.test(t))
        return "DELETE";

    if (/cierra|termina/.test(t))
        return "CLOSE";

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
        .split(
            /\s+y luego\s+|\s+y\s+|\s+después\s+|\s+despues\s+|\s+luego\s+|\s+además\s+/i
        )
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
        t.includes("jarvis anom") ||
        t.includes("jarvis salud") ||
        t.includes("jarvis status")
    );
}

/* =====================================================================================
   LANGUAGE CORE V5
===================================================================================== */

async function resolveCommands(raw = "") {

    if (
        window.JarvisLanguageCore &&
        typeof window.JarvisLanguageCore.translate === "function"
    ) {
        let translated =
            await window.JarvisLanguageCore.translate(raw);

        if (!Array.isArray(translated)) {
            translated = [translated];
        }

        return translated.filter(Boolean);
    }

    const parts = splitActions(raw);

    return parts.map(x =>
        fallbackTranslate(x)
    );
}

/* =====================================================================================
   EXECUTION CORE
===================================================================================== */

async function executeCommands(commands = []) {

    const outputs = [];

    for (const cmd of commands) {

        safeLog("EXEC", cmd);

        const res =
            await runCore(cmd);

        outputs.push(
            normalize(res)
        );
    }

    return outputs;
}

/* =====================================================================================
   MAIN BRIDGE
===================================================================================== */

export const JarvisBridge = {

    async dispatch(input = "") {

        let raw =
            String(input || "").trim();

        /* =================================================
           CONTEXT MEMORY V6
        ================================================= */

        if (
            window.JarvisContextMemory &&
            typeof window
                .JarvisContextMemory
                .resolveReferences === "function"
        ) {
            raw =
                window
                    .JarvisContextMemory
                    .resolveReferences(raw);
        }

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

                render(
                    "Jarvis",
                    msg,
                    "success"
                );

                speak(msg);

                return {
                    ok: true,
                    route: "NATIVE",
                    message: msg
                };
            }

            /* =================================================
               LANGUAGE CORE
            ================================================= */

            const commands =
                await resolveCommands(raw);

            safeLog(
                "COMMANDS",
                commands
            );

            /* =================================================
               EXECUTE CORE
            ================================================= */

            const outputs =
                await executeCommands(commands);

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

            /* =================================================
               FALLBACK IA EXTERNA
            ================================================= */

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

                safeError(
                    "AI_FAIL",
                    subError
                );

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
                        error.message ||
                        "Error desconocido"
                };
            }
        }
    },

    async ask(text = "") {
        return await this.dispatch(text);
    },

    async run(text = "") {
        return await this.dispatch(text);
    }
};

/* =====================================================================================
   GLOBAL EXPORT
===================================================================================== */

window.JarvisBridge =
    JarvisBridge;

/* =====================================================================================
   BOOT
===================================================================================== */

safeLog(
    "ONLINE",
    "V5 FULL RESTORED READY"
);