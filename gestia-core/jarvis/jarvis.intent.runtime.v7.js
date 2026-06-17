/* =====================================================================================
   JARVIS INTENT RUNTIME V7.1
   Cognitive compatibility layer for Bridge V5.95.
   Goal: fluent conversation, analysis, creation, repair, scan and repo-aware routing.
===================================================================================== */

(function(global) {
    "use strict";

    const VERSION = "7.1.0";

    const ACTIONS = [
        {
            intent: "REPAIR",
            command: "repara",
            terms: [
                "repara", "corrige", "arregla", "soluciona", "fix", "patch", "parchea",
                "atorado", "se atora", "no sirve", "truena", "trono", "roto", "bug",
                "falla", "fallando", "ambiguo", "no entiende"
            ]
        },
        {
            intent: "ANALYZE",
            command: "analiza",
            terms: [
                "analiza", "audita", "revisa", "checa", "verifica", "inspecciona",
                "diagnostica", "scanner", "scan", "escanea", "estado", "que pasa",
                "que pedo", "donde esta", "donde quedo"
            ]
        },
        {
            intent: "CREATE",
            command: "crea",
            terms: [
                "crea", "crear", "genera", "generar", "arma", "construye", "nuevo",
                "nueva", "agrega", "haz", "hacer", "implementa"
            ]
        },
        {
            intent: "UPDATE",
            command: "actualiza",
            terms: [
                "actualiza", "modifica", "cambia", "ajusta", "mejora", "optimiza",
                "sube", "sube de nivel", "upgrade", "nivel", "v7", "capacidad"
            ]
        },
        {
            intent: "OPEN",
            command: "abre",
            terms: ["abre", "abrir", "muestra", "mostrar", "ver", "enseña"]
        },
        {
            intent: "DELETE",
            command: "elimina",
            terms: ["elimina", "borra", "quita", "remueve", "suprime"]
        }
    ];

    const ENTITIES = [
        {
            entity: "JARVIS",
            target: "jarvis",
            terms: [
                "jarvis", "sia7", "asistente", "cerebro", "conversacion", "conversacional",
                "respuesta", "fluida", "diccionario", "nlu", "nlp"
            ]
        },
        {
            entity: "REPOSITORY",
            target: "repo",
            terms: [
                "repo", "repositorio", "codigo", "codebase", "archivo", "archivos",
                ".js", ".html", ".css", ".json", "github", "rama", "branch"
            ]
        },
        {
            entity: "SYSTEM",
            target: "system",
            terms: ["sistema", "runtime", "core", "kernel", "terminal", "gestia", "fixgo", "fierros"]
        },
        {
            entity: "MEMORY",
            target: "memory",
            terms: ["memoria", "contexto", "historial", "ledger", "recuerda", "persistencia", "snapshot"]
        },
        {
            entity: "AUTH",
            target: "auth",
            terms: ["login", "auth", "sesion", "sesión", "acceso", "usuario", "usuarios", "logout"]
        },
        {
            entity: "PAYMENTS",
            target: "payments",
            terms: ["pago", "pagos", "cobro", "cobros", "factura", "facturas", "stripe", "cfdi"]
        },
        {
            entity: "TECHNICIANS",
            target: "technicians",
            terms: ["tecnico", "técnico", "tecnicos", "técnicos", "b2b", "ticket", "tickets", "orden"]
        },
        {
            entity: "CAMERAS",
            target: "cameras",
            terms: ["camara", "cámara", "camaras", "cámaras", "hikvision", "cctv", "uxmal"]
        }
    ];

    const HUMAN_SIGNALS = {
        approval: ["arre", "ahuevo", "a huevo", "perfecto", "chingon", "chingón", "jalo", "dale", "va"],
        urgency: ["ya", "ahorita", "urgente", "rapido", "rápido", "en corto", "hoy"],
        frustration: ["no sirve", "mal", "atorado", "se atora", "ambiguo", "no entiende", "bloqueado"],
        casual: ["jajaja", "jaja", "papa", "papá", "caon", "carnal"],
        greeting: ["hola", "buenas", "buenos dias", "buenos días", "que onda", "qué onda"],
        thanks: ["gracias", "te rifaste", "chingon", "chingón"]
    };

    function normalize(text = "") {
        return String(text)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w\s.:\/-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function includesAny(text, terms = []) {
        return terms.some(term => text.includes(normalize(term)));
    }

    function scoreMatch(text, entries) {
        let best = null;

        for (const entry of entries) {
            const hits = entry.terms.filter(term => text.includes(normalize(term)));
            const score = hits.length;

            if (!best || score > best.score) {
                best = { ...entry, score, hits };
            }
        }

        return best;
    }

    function splitSteps(text = "") {
        return String(text)
            .split(/\s+(?:y luego|luego|despues|después|ademas|además|tambien|también|y)\s+|[,;]/gi)
            .map(step => step.trim())
            .filter(Boolean);
    }

    function detectHumanState(normalized = "") {
        return Object.fromEntries(
            Object.entries(HUMAN_SIGNALS).map(([key, terms]) => [key, includesAny(normalized, terms)])
        );
    }

    function findRepoTarget(text = "") {
        const fileMatch = String(text).match(/([a-z0-9_\-/]+\.(js|html|css|json))/i);
        const target = fileMatch ? fileMatch[1] : null;

        if (!target) return null;

        const found = global.findRepoFile?.(target);

        return {
            file: target,
            repoNode: found ? found[1] : null,
            repoAware: Boolean(found)
        };
    }

    function resolveContextTarget(entity) {
        const memory =
            global.JarvisContextMemory ||
            global.__JARVIS_COGNITIVE_STATE__ ||
            null;

        return (
            memory?.currentTarget ||
            memory?.runtimeAwareness?.lastTarget ||
            memory?.lastTarget ||
            entity?.target ||
            "system"
        );
    }

    function buildNaturalReply({ intent, entity, target, humanState, confidence }) {
        const entityName = String(entity?.entity || "system").toLowerCase();

        if (humanState.greeting && target === "jarvis") {
            return "Aquí estoy, Arquitecto. Jarvis en línea: puedo analizar, crear, reparar, escanear y explicar sin perder el hilo.";
        }

        if (humanState.frustration) {
            return `Te capto. Voy a bajar ambigüedad, revisar ${target} y convertir esto en un plan accionable.`;
        }

        if (intent === "REPAIR") {
            return `Arre. Entendí reparación sobre ${entityName}; primero diagnostico ${target}, luego propongo patch y validación.`;
        }

        if (intent === "CREATE") {
            return `Listo. Voy a estructurar la creación para ${entityName}, con archivos claros y puntos de prueba.`;
        }

        if (intent === "UPDATE") {
            return `Va. Subo de nivel ${entityName}: contexto compartido, respuesta más natural y conexión con runtime.`;
        }

        if (intent === "DELETE") {
            return `Recibido. Para eliminar en ${entityName}, marco impacto y dependencias antes de tocar ${target}.`;
        }

        if (confidence < 0.7) {
            return `Tengo una lectura inicial sobre ${entityName}, pero falta precisión; devuelvo plan conservador para ${target}.`;
        }

        return `Entendido. Analizo ${entityName}, objetivo ${target}, y preparo una respuesta accionable.`;
    }

    function analyzeStep(step = "", fullText = "") {
        const normalized = normalize(step);
        const fullNormalized = normalize(fullText || step);
        const repoTarget = findRepoTarget(step) || findRepoTarget(fullText);

        let action = scoreMatch(normalized, ACTIONS);

        if (/\b(sube|upgrade|mejora|nivel|v7|capacidad)\b/.test(normalized)) {
            action = {
                intent: "UPDATE",
                command: "actualiza",
                score: Math.max(action?.score || 0, 3),
                hits: ["upgrade_v7"]
            };
        }

        if (/\b(scan|scanner|escanea|audita)\b/.test(normalized)) {
            action = {
                intent: "ANALYZE",
                command: "analiza",
                score: Math.max(action?.score || 0, 3),
                hits: ["scan_runtime"]
            };
        }

        const localEntity = scoreMatch(normalized, ENTITIES);
        const fullEntity = scoreMatch(fullNormalized, ENTITIES);
        const entity = localEntity?.score > 0 ? localEntity : fullEntity;
        const resolvedEntity = entity?.score > 0
            ? entity
            : (repoTarget ? { entity: "REPOSITORY", target: "repo", score: 1, hits: [repoTarget.file] } : { entity: "SYSTEM", target: "system", score: 0, hits: [] });

        const humanState = detectHumanState(fullNormalized);
        const contextual = /\b(eso|esa|ese|aquello|lo anterior|lo mismo|ahi|alli|aqui)\b/.test(normalized);
        const resolvedAction = action?.score > 0 ? action : null;
        const resolvedIntent = resolvedAction ? action.intent : "ANALYZE";
        const target = repoTarget?.file || (contextual ? resolveContextTarget(resolvedEntity) : resolvedEntity.target);

        const confidence = Math.min(
            0.99,
            0.45 +
            (resolvedAction ? 0.25 : 0.05) +
            (resolvedEntity.score ? 0.25 : 0.05) +
            (repoTarget ? 0.05 : 0) +
            (humanState.urgency || humanState.approval ? 0.04 : 0)
        );

        const cognitionLayer = repoTarget
            ? (resolvedIntent === "REPAIR" || resolvedIntent === "UPDATE" || resolvedIntent === "CREATE" ? "repo_surgeon" : "runtime_audit")
            : (resolvedEntity.target === "jarvis" ? "conversation_runtime" : "semantic_runtime");

        return {
            ok: true,
            version: VERSION,
            raw: step,
            normalized,
            intent: resolvedIntent,
            action: resolvedIntent,
            entity: target,
            target,
            command: `${resolvedAction?.command || "analiza"} ${target}`,
            protocolCommand: `${resolvedIntent}::${target}`,
            humanState,
            confidence,
            source: "jarvis_intent_runtime_v7_1",
            cognition: {
                original: step,
                intent: resolvedIntent,
                domain: repoTarget ? "repository" : resolvedEntity.target,
                target,
                targetFile: repoTarget?.file || null,
                repoNode: repoTarget?.repoNode || null,
                repoAware: Boolean(repoTarget?.repoAware),
                expectedOutput: repoTarget ? "repo_patch_or_scan" : "runtime_response",
                cognitionLayer,
                confidence
            },
            reply: buildNaturalReply({ intent: resolvedIntent, entity: resolvedEntity, target, humanState, confidence }),
            data: {
                intent: resolvedIntent,
                entity: target,
                target,
                action: resolvedIntent,
                confidence
            },
            meta: {
                actionHits: resolvedAction?.hits || [],
                entityHits: resolvedEntity.hits || [],
                contextual,
                repoTarget
            }
        };
    }

    function analyzeConversation(input = "", options = {}) {
        const raw = String(input || "");
        const steps = splitSteps(raw);
        const analyzedSteps = (steps.length ? steps : [raw]).map(step => analyzeStep(step, raw));
        const primary = analyzedSteps[0] || analyzeStep(raw, raw);

        const result = {
            ...primary,
            multiStep: analyzedSteps.length > 1,
            steps: analyzedSteps,
            commands: analyzedSteps.map(step => ({
                original: step.raw,
                action: step.intent,
                intent: step.intent,
                entity: step.target,
                target: step.target,
                clean: step.command,
                protocol: step.protocolCommand,
                priority: step.humanState.urgency ? "CRITICAL" : "NORMAL",
                confidence: step.confidence,
                fallback: step.confidence < 0.7,
                reply: step.reply,
                meta: step.meta
            }))
        };

        if (options.remember !== false) {
            global.__JARVIS_COGNITIVE_STATE__ ||= {
                conversationalHistory: [],
                runtimeAwareness: {}
            };

            global.__JARVIS_COGNITIVE_STATE__.conversationalHistory.push({
                text: raw,
                intent: result.intent,
                entity: result.entity,
                target: result.target,
                confidence: result.confidence,
                ts: Date.now()
            });

            global.__JARVIS_COGNITIVE_STATE__.runtimeAwareness.lastTarget = result.target;

            if (global.__JARVIS_COGNITIVE_STATE__.conversationalHistory.length > 100) {
                global.__JARVIS_COGNITIVE_STATE__.conversationalHistory.shift();
            }
        }

        return result;
    }

    async function runIntentEngine(input = "", options = {}) {
        const result = analyzeConversation(input, options);

        return {
            ok: true,
            version: VERSION,
            intent: result.intent,
            action: result.action,
            entity: result.entity,
            target: result.target,
            data: {
                intent: result.intent,
                entity: result.entity,
                target: result.target,
                action: result.action,
                confidence: result.confidence
            },
            command: result.protocolCommand,
            protocolCommand: result.protocolCommand,
            reply: result.reply,
            confidence: result.confidence,
            source: "jarvis_intent_runtime_v7_1",
            cognition: result.cognition,
            steps: result.steps,
            commands: result.commands,
            meta: result.meta
        };
    }

    global.JarvisIntentRuntimeV7 = {
        version: VERSION,
        normalize,
        analyze: analyzeConversation,
        run: runIntentEngine
    };

    global.runIntentEngine = runIntentEngine;

    console.log("🧠 [JARVIS_INTENT_RUNTIME_V7]: ONLINE", VERSION);
})(window);
