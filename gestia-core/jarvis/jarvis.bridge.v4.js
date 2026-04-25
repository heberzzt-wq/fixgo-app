/**
 * =====================================================================================
 * JARVIS BRIDGE V4.0 - SOVEREIGN ORCHESTRATOR
 * =====================================================================================
 * MISIÓN:
 * Unificar Terminal Heberto + Kernel Local + IA Externa + HUD + Voz
 *
 * COMPATIBLE CON:
 * ✅ gestia-terminal.html actual
 * ✅ gestia-terminal.js actual
 * ✅ window.KernelHeberto
 * ✅ consultarCerebroIA() del HTML
 * ✅ renderJarvisResponse()
 *
 * AUTOR:
 * Heberto Mendoza + Jarvis Engineering Division
 * =====================================================================================
 */

function safeLog(label, data = "") {
    console.log(`🧠 [JARVIS_V4:${label}]`, data);
}

function safeError(label, err = "") {
    console.error(`❌ [JARVIS_V4:${label}]`, err);
}

/* =====================================================================================
   DETECTOR DE TIPO DE SOLICITUD
===================================================================================== */

function classifyIntent(text = "") {

    const t = String(text).toLowerCase();

    const operationalWords = [
        "pago", "pagos", "cobro", "ticket",
        "cámara", "camara", "camaras",
        "login", "usuario", "tenant",
        "revisa", "abre", "corrige",
        "actualiza", "bloquea", "estado",
        "dashboard", "watchdog"
    ];

    const humanWords = [
        "hola", "cómo estás", "como estas",
        "qué opinas", "que opinas",
        "ayúdame", "ayudame",
        "explícame", "explicame",
        "qué harías", "que harias"
    ];

    const hasOperational =
        operationalWords.some(x => t.includes(x));

    const hasHuman =
        humanWords.some(x => t.includes(x));

    if (hasOperational && hasHuman) {
        return "HYBRID";
    }

    if (hasOperational) {
        return "CORE";
    }

    return "AI";
}

/* =====================================================================================
   MULTI ACTION DETECTOR
===================================================================================== */

function splitActions(text = "") {

    const parts = String(text)
        .split(/\s+y luego\s+|\s+y\s+|\s+después\s+|\s+despues\s+/i)
        .map(x => x.trim())
        .filter(Boolean);

    return parts.length ? parts : [text];
}

/* =====================================================================================
   HUD / UI HELPERS
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
   CORE EXECUTION
===================================================================================== */

async function runCore(text) {

    if (!window.KernelHeberto) {
        throw new Error("CORE_NOT_READY");
    }

    return await window.KernelHeberto.execute(text);
}

/* =====================================================================================
   EXTERNAL AI EXECUTION
===================================================================================== */

async function runExternalAI(text) {

    if (window.consultarCerebroIA) {
        return await window.consultarCerebroIA(text);
    }

    return "IA externa no disponible.";
}

/* =====================================================================================
   NORMALIZER
===================================================================================== */

function normalizeCoreResponse(res) {

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
   DISPATCH MASTER
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

            const mode =
                classifyIntent(raw);

            const actions =
                splitActions(raw);

            safeLog("MODE", mode);
            safeLog("ACTIONS", actions);

            /* =================================================
               CORE ONLY
            ================================================= */

            if (mode === "CORE") {

                const outputs = [];

                for (const action of actions) {

                    const res =
                        await runCore(action);

                    outputs.push(
                        normalizeCoreResponse(res)
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
                    route: "CORE",
                    message: finalText
                };
            }

            /* =================================================
               AI ONLY
            ================================================= */

            if (mode === "AI") {

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
                    route: "AI",
                    message: aiText
                };
            }

            /* =================================================
               HYBRID MODE
            ================================================= */

            const coreOutputs = [];

            for (const action of actions) {

                try {

                    const res =
                        await runCore(action);

                    coreOutputs.push(
                        normalizeCoreResponse(res)
                    );

                } catch (e) {}
            }

            const aiText =
                await runExternalAI(raw);

            const finalHybrid = `
🔹 Operación interna:
${coreOutputs.join("\n") || "Sin cambios."}

🔹 Asistencia IA:
${aiText}
            `.trim();

            render(
                "Jarvis",
                finalHybrid,
                "success"
            );

            speak("Solicitud completada.");

            return {
                ok: true,
                route: "HYBRID",
                message: finalHybrid
            };

        } catch (error) {

            safeError(
                "DISPATCH_FAIL",
                error
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
                message: error.message
            };
        }
    }
};

/* =====================================================================================
   GLOBAL EXPOSURE
===================================================================================== */

window.JarvisBridge = JarvisBridge;

safeLog(
    "ONLINE",
    "V4 Sovereign Ready"
);