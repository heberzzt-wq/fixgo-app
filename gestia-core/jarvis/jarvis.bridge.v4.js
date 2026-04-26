/**
 * =====================================================================================
 * JARVIS BRIDGE V5.8 - OBSERVABILITY + NATIVE PROTECTION
 * ARCHIVO:
 * /gestia-core/jarvis/jarvis.bridge.v5.js
 * =====================================================================================
 * INCLUYE:
 * ✅ Todo V5.7
 * ✅ Protección comandos nativos por segmento
 * ✅ Smart Response Composer
 * ✅ Cache visible
 * ✅ Mejor salida UX
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

function beautifyOutput(cmd = "", text = "", fromCache = false) {

    const c = String(cmd);

    if (fromCache) {
        return "Resultado reciente reutilizado.";
    }

    if (c.includes("OPEN::tickets")) {
        return "Tickets abiertos correctamente.";
    }

    if (c.includes("ANALYZE::payments")) {
        return "Pagos revisados correctamente.";
    }

    if (c.includes("ANALYZE::tickets")) {
        return "Tickets revisados correctamente.";
    }

    if (c.includes("jarvis estado")) {
        return text;
    }

    return text;
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
   LANGUAGE CORE + NATIVE PROTECTION
===================================================================================== */

async function resolveCommands(raw = "") {

    const parts =
        splitActions(raw);

    const commands = [];

    for (const part of parts) {

        if (isNativeJarvis(part)) {
            commands.push(part);
            continue;
        }

        if (
            window.JarvisLanguageCore &&
            typeof window.JarvisLanguageCore.translate === "function"
        ) {
            let translated =
                await window.JarvisLanguageCore.translate(part);

            if (!Array.isArray(translated)) {
                translated = [translated];
            }

            commands.push(...translated.filter(Boolean));

        } else {

            commands.push(
                fallbackTranslate(part)
            );
        }
    }

    return commands;
}

/* =====================================================================================
   EXECUTION CORE V5.8
===================================================================================== */

async function executeCommands(commands = []) {

    const outputs = [];
    const burstCache = new Map();

    for (const cmd of commands) {

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

            let res;
            const t0 = performance.now();

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

            outputs.push(
                beautifyOutput(
                    cmd,
                    clean,
                    false
                )
            );

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

window.JarvisBridge = JarvisBridge;

safeLog(
    "ONLINE",
    "V5.8 READY"
);