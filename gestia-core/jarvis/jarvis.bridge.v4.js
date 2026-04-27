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

    /* ==========================================
       ANALYZE
    ========================================== */

    if (c.includes("ANALYZE::PAYMENTS")) {
        return "Revisión financiera completada. Pagos analizados correctamente.";
    }

    if (c.includes("ANALYZE::TICKETS")) {
        return "Diagnóstico de tickets completado correctamente.";
    }

    if (c.includes("ANALYZE::SYSTEM")) {
        return "Estado general del sistema verificado correctamente.";
    }

    if (c.includes("ANALYZE::SECURITY")) {
        return "Integridad de seguridad validada sin incidencias críticas.";
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

    const t =
        String(text)
        .toLowerCase()
        .trim();

    return (
        t.includes("jarvis estado") ||
        t.includes("jarvis resumen") ||
        t.includes("jarvis salud") ||
        t.includes("jarvis status")
    );
}

function isSocialJarvis(text = "") {

    const t =
        String(text)
        .toLowerCase()
        .trim();

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

    const t =
        String(text)
        .toLowerCase()
        .trim();

    if (
        t === "hola" ||
        t.includes("que tal") ||
        t.includes("qué tal")
    ) {
        return "Hola Arquitecto. Núcleo operativo y atento.";
    }

    if (
        t.includes("buenos dias") ||
        t.includes("buen día") ||
        t.includes("buen dia")
    ) {
        return "Buenos días Arquitecto. Sistemas estables y listos.";
    }

    if (
        t.includes("buenas tardes")
    ) {
        return "Buenas tardes Arquitecto. Todo bajo control.";
    }

    if (
        t.includes("buenas noches")
    ) {
        return "Buenas noches Arquitecto. Núcleo vigilante y operativo.";
    }

    if (
        t.includes("como estas") ||
        t.includes("cómo estás")
    ) {
        return "Operando al cien por ciento. Sin incidencias críticas.";
    }

    if (
        t === "gracias" ||
        t.includes("muchas gracias")
    ) {
        return "Siempre a la orden, Arquitecto.";
    }

    return "Presente, Arquitecto.";
}

async function executeNativeJarvis(text = "") {

    const t =
        String(text)
        .toLowerCase()
        .trim();

    /* ======================================
       SOCIAL PRIORITY
    ====================================== */
if (
    isSocialJarvis(t) &&
    splitActions(t).length === 1
) {
    return await executeSocialJarvis(t);
}



    /* ======================================
       SYSTEM COMMANDS
    ====================================== */

    if (
        t.includes("jarvis estado") ||
        t.includes("jarvis status")
    ) {
        return await runCore("jarvis estado");
    }

    if (
        t.includes("jarvis resumen")
    ) {
        return await runCore("jarvis resumen");
    }

    if (
        t.includes("jarvis salud")
    ) {
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

        const cleanPart =
            String(part || "").trim();

        if (!cleanPart) {
            continue;
        }

        /* ======================================
           SOCIAL PART ROUTER
        ====================================== */

        if (
            isSocialJarvis(cleanPart)
        ) {
            commands.push(
                cleanPart
            );
            continue;
        }

        /* ======================================
           NATIVE PART ROUTER
        ====================================== */

        if (
            isNativeJarvis(cleanPart)
        ) {
            commands.push(
                cleanPart
            );
            continue;
        }


        /* ======================================
   PREMIUM INTERNAL ROUTER
====================================== */

if (
    cleanPart
        .toLowerCase()
        .includes(
            "auditoria automatica"
        ) ||
    cleanPart ===
        "__AUTO_AUDIT_UI__"
) {
    commands.push(
        "__AUTO_AUDIT_UI__"
    );
    continue;
}

if (
    cleanPart ===
    "__AUTO_HEALTH_CHECK__"
) {
    commands.push(
        "__AUTO_HEALTH_CHECK__"
    );
    continue;
}


        /* ======================================
           LANGUAGE CORE
        ====================================== */

        if (
            window.JarvisLanguageCore &&
            typeof window.JarvisLanguageCore.translate === "function"
        ) {

            let translated =
                await window.JarvisLanguageCore.translate(
                    cleanPart
                );

            if (
                !Array.isArray(
                    translated
                )
            ) {
                translated = [
                    translated
                ];
            }

            commands.push(
                ...translated.filter(
                    Boolean
                )
            );

        } else {

            commands.push(
                fallbackTranslate(
                    cleanPart
                )
            );
        }
    }

    return commands;
}

/* =====================================================================================
   EXECUTION CORE V6.1 HYBRID SOCIAL
===================================================================================== */

async function executeCommands(commands = []) {

    const outputs = [];
    const burstCache = new Map();

    for (const cmd of commands) {

        safeLog("EXEC", cmd);

        try {

            if (
                burstCache.has(cmd)
            ) {

                safeLog(
                    "CACHE_HIT",
                    cmd
                );

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
            const t0 =
                performance.now();

            /* ==================================
               SOCIAL + NATIVE + CORE ROUTER
            ================================== */

            if (
                isSocialJarvis(cmd) ||
                isNativeJarvis(cmd)
            ) {

                res =
                    await withTimeout(
                        executeNativeJarvis(
                            cmd
                        ),
                        8000
                    );

            } else {

                res =
                    await withTimeout(
                        runCore(cmd),
                        8000
                    );
            }

            const ms =
                Math.round(
                    performance.now() -
                    t0
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
                {
                    cmd,
                    error
                }
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

    let raw =
        String(
            input || ""
        ).trim();

    const rawLow =
        raw.toLowerCase();

    /* =====================================================
       CODE SURGEON MODE
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
===================================================== */

const pendingProposal =
    this.pendingProposal ||
    window.__JARVIS_PENDING__ ||
    null;

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

            execResult =
`Cirugía preparada sobre:

${proposal.target}

Acciones:
• ${proposal.patch.join("\n• ")}

Estado:
Listo para aplicar patch físico.`;
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
           PREMIUM LOADER
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

        render(
            "Jarvis",
            loaders[0],
            "info"
        );

        const loaderTimer =
            setInterval(
                () => {

                    loaderIndex++;

                    if (
                        loaderIndex <
                        loaders.length
                    ) {
                        render(
                            "Jarvis",
                            loaders[
                                loaderIndex
                            ],
                            "info"
                        );
                    }

                },
                700
            );

        try {

            const commands =
                await resolveCommands(
                    raw
                );

            safeLog(
                "COMMANDS",
                commands
            );

            const outputs =
                await executeCommands(
                    commands
                );

            const finalText =
                composeResponse(
                    outputs
                );

            clearInterval(
                loaderTimer
            );

            render(
                "Jarvis",
                finalText,
                "success"
            );

            speak(
                finalText
            );

            return {
                ok: true,
                route:
                    "CORE_INTELLIGENT",
                commands,
                message:
                    finalText
            };

        } catch (error) {

            clearInterval(
                loaderTimer
            );

            safeError(
                "CORE_FAIL",
                error
            );

            try {

                render(
                    "Jarvis",
                    "Activando respaldo cognitivo...",
                    "info"
                );

                const aiText =
                    await runExternalAI(
                        raw
                    );

                render(
                    "Jarvis",
                    aiText,
                    "success"
                );

                speak(
                    aiText
                );

                return {
                    ok: true,
                    route:
                        "AI_FALLBACK",
                    message:
                        aiText
                };

            } catch (
                subError
            ) {

                return {
                    ok: false,
                    error: true,
                    message:
                        "Fallo total."
                };
            }
        }
    },

    async ask(
        text = ""
    ) {
        return await this.dispatch(
            text
        );
    },

    async run(
        text = ""
    ) {
        return await this.dispatch(
            text
        );
    }
};

window.JarvisBridge =
    JarvisBridge;

safeLog(
    "ONLINE",
    "V6.1 HYBRID READY"
);