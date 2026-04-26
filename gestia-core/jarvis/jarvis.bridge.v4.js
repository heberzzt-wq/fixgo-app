/**
 * =====================================================================================
 * JARVIS BRIDGE V5.7 - OBSERVABILITY LAYER (FULL REWRITE)
 * ARCHIVO:
 * /gestia-core/jarvis/jarvis.bridge.v5.js
 * =====================================================================================
 * INCLUYE:
 * ✅ Todo V5.6
 * ✅ Timeout defensivo
 * ✅ Métricas por comando
 * ✅ Historial operativo
 * ✅ Burst Cache
 * ✅ Native Hybrid Commands
 * ✅ Response Composer
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
   NATIVE
===================================================================================== */

function isNativeJarvis(text = "") {

    const t = String(text).toLowerCase();

    return (
        t.includes("jarvis estado") ||
        t.includes("jarvis resumen") ||
        t.includes("jarvis salud") ||
        t.includes("jarvis status")
    );
}

async function executeNativeJarvis(text = "") {

    const t = String(text).toLowerCase();

    if (t.includes("jarvis estado") || t.includes("jarvis status")) {
        return await runCore("jarvis estado");
    }

    if (t.includes("jarvis resumen")) {
        return await runCore("jarvis resumen");
    }

    if (t.includes("jarvis salud")) {
        return await runCore("jarvis salud");
    }

    return await runCore(text);
}

/* =====================================================================================
   LANGUAGE CORE
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
   EXECUTION CORE V5.7
===================================================================================== */

async function executeCommands(commands = []) {

    const outputs = [];
    const burstCache = new Map();

    for (const cmd of commands) {

        safeLog("EXEC", cmd);

        try {

            /* ======================================
               CACHE
            ====================================== */

            if (burstCache.has(cmd)) {

                safeLog("CACHE_HIT", cmd);

                outputs.push(
                    burstCache.get(cmd)
                );

                continue;
            }

            let res;
            const t0 = performance.now();

            /* ======================================
               NATIVE
            ====================================== */

            if (isNativeJarvis(cmd)) {

                res = await withTimeout(
                    executeNativeJarvis(cmd),
                    8000
                );

            } else {

                res = await withTimeout(
                    runCore(cmd),
                    8000
                );
            }

            const ms =
                Math.round(
                    performance.now() - t0
                );

            const clean =
                normalize(res);

            burstCache.set(
                cmd,
                clean
            );

            outputs.push(clean);

            safeLog(
                "METRIC",
                { cmd, ms }
            );

            saveHistory({
                cmd,
                ms,
                result: clean
            });

        } catch (error) {

            safeError(
                "CMD_FAIL",
                { cmd, error }
            );

            outputs.push(
                `Error en ${cmd}`
            );

            saveHistory({
                cmd,
                error: true
            });
        }
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

        if (
            window.JarvisContextMemory &&
            typeof window.JarvisContextMemory.resolveReferences === "function"
        ) {
            raw =
                window.JarvisContextMemory.resolveReferences(raw);
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

            const commands =
                await resolveCommands(raw);

            safeLog(
                "COMMANDS",
                commands
            );

            const outputs =
                await executeCommands(commands);

            const finalText =
                composeResponse(outputs);

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

                return {
                    ok: false,
                    error: true,
                    message: "Fallo total."
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
   GLOBAL
===================================================================================== */

window.JarvisBridge = JarvisBridge;

safeLog(
    "ONLINE",
    "V5.7 OBSERVABILITY READY"
);