/* ======================================================================================
   GESTIAPREMIUM 2026
   INTENT ENGINE V7 — COGNITIVE OPERATOR CORE
   ARCHITECT SOVEREIGN EDITION
   ====================================================================================== */

/* ======================================================================================
   GLOBAL COGNITIVE STATE
====================================================================================== */

window.__JARVIS_COGNITIVE_STATE__ =
window.__JARVIS_COGNITIVE_STATE__ || {

    activeContext: null,

    activeObjective: null,

    currentEntity: null,

    currentTarget: null,

    conversationalHistory: [],

    semanticMemory: {},

    learnedReferences: {},

    emotionalProfile: {

        operatorTone: "AGGRESSIVE_TECH",

        patience: "LOW",

        executionStyle: "DIRECT",

        verbosity: "MEDIUM"
    },

    runtimeAwareness: {

        lastIntent: null,

        lastAction: null,

        lastEntity: null,

        lastTarget: null,

        lastSuccess: true
    },

    memoryGraph: {},

    operatorPatterns: {},

    confidenceHistory: [],

    strategicFocus: null,

    activeModules: [],

    contextWindow: [],

    adaptiveVocabulary: {}
};

/* ======================================================================================
   CORE INTENT MAP
====================================================================================== */

const INTENT_MAP = {

    "crear": "CREATE",
    "create": "CREATE",
    "agregar": "CREATE",
    "armar": "CREATE",

    "borrar": "DELETE",
    "eliminar": "DELETE",
    "delete": "DELETE",
    "quitar": "DELETE",

    "actualizar": "UPDATE",
    "update": "UPDATE",
    "modificar": "UPDATE",
    "cambiar": "UPDATE",
    "ajustar": "UPDATE",

    "reparar": "REPAIR",
    "arreglar": "REPAIR",
    "fix": "REPAIR",
    "corregir": "REPAIR",
    "optimizar": "REPAIR",
    "parchar": "REPAIR",

    "analizar": "ANALYZE",
    "revisar": "ANALYZE",
    "checar": "ANALYZE",
    "auditar": "ANALYZE",
    "ver": "ANALYZE",

    "abrir": "OPEN",
    "open": "OPEN",

    "ejecutar": "EXECUTE",
    "run": "EXECUTE",

    "reiniciar": "RESTART",
    "restart": "RESTART",

    "sincronizar": "SYNC",
    "sync": "SYNC",

    "hablar": "VOICE",
    "escuchar": "VOICE",

    "explicar": "EXPLAIN",
    "resume": "SUMMARIZE"
};

/* ======================================================================================
   ENTITY MAP
====================================================================================== */

const ENTITY_MAP = {

    "sistema": "SYSTEM",
    "runtime": "SYSTEM",
    "core": "SYSTEM",
    "kernel": "SYSTEM",

    "dashboard": "DASHBOARD",
    "panel": "DASHBOARD",
    "hud": "HUD",

    "voz": "VOICE",
    "voice": "VOICE",

    "modulo": "MODULE",
    "modulos": "MODULE",

    "memoria": "MEMORY",
    "memory": "MEMORY",

    "federation": "FEDERATION",
    "federacion": "FEDERATION",

    "snapshot": "SNAPSHOT",

    "scheduler": "SCHEDULER",

    "daemon": "DAEMON",

    "tecnicos": "TECHNICIANS",

    "clientes": "CLIENTS",

    "usuarios": "USERS",

    "api": "API",

    "websocket": "WEBSOCKET",

    "indexeddb": "PERSISTENCE",

    "persistencia": "PERSISTENCE",

    "ui": "UI",

    "telemetria": "TELEMETRY",

    "topologia": "TOPOLOGY",

    "grafo": "GRAPH",

    "jarvis": "JARVIS"
};

/* ======================================================================================
   HUMAN SIGNALS
====================================================================================== */

const HUMAN_SIGNALS = {

    urgency: /\b(ya|ahorita|de una|en corto|rapidito|chingatelo|a darle)\b/i,

    approval: /\b(arre|perfecto|chingon|excelente|mamalon|perron|jalo)\b/i,

    frustration: /\b(no sirve|asi no|mal|bug|error|wtf|ptm|no mames)\b/i,

    confusion: /\b(no entendi|explica|como|que pedo)\b/i,

    greeting: /\b(hola|buenos dias|buenas tardes|buenas noches|jarvis)\b/i,

    farewell: /\b(adios|bye|camara|nos vemos|sobres)\b/i
};

/* ======================================================================================
   NORMALIZATION
====================================================================================== */

function normalize(text = "") {

    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

/* ======================================================================================
   TOKENIZATION
====================================================================================== */

function tokenize(text = "") {

    return normalize(text)
        .split(/\s+/)
        .filter(Boolean);
}

/* ======================================================================================
   DETECT HUMAN STATE
====================================================================================== */

function detectHumanState(text) {

    const state = {

        urgency: false,
        approval: false,
        frustration: false,
        confusion: false,
        greeting: false,
        farewell: false
    };

    Object.entries(HUMAN_SIGNALS).forEach(([k, regex]) => {

        state[k] = regex.test(text);
    });

    return state;
}

/* ======================================================================================
   DETECT INTENT
====================================================================================== */

function detectIntent(tokens = []) {

    for (const token of tokens) {

        if (INTENT_MAP[token]) {
            return INTENT_MAP[token];
        }
    }

    return "GENERAL";
}

/* ======================================================================================
   DETECT ENTITY
====================================================================================== */

function detectEntity(tokens = []) {

    for (const token of tokens) {

        if (ENTITY_MAP[token]) {
            return ENTITY_MAP[token];
        }
    }

    return "SYSTEM";
}

/* ======================================================================================
   EXTRACT TARGET
====================================================================================== */

function extractTarget(tokens = [], entity) {

    const blacklist = [

        ...Object.keys(INTENT_MAP),

        ...Object.keys(ENTITY_MAP),

        "el",
        "la",
        "los",
        "las",
        "de",
        "del",
        "que",
        "y",
        "con"
    ];

    const filtered =
        tokens.filter(t => !blacklist.includes(t));

    return filtered[0] || entity.toLowerCase();
}

/* ======================================================================================
   CONTEXT RESOLUTION
====================================================================================== */

function resolveContextualReferences(text) {

    const memory =
        window.__JARVIS_COGNITIVE_STATE__;

    if (
        text.includes("esa madre") ||
        text.includes("eso") ||
        text.includes("aquello")
    ) {

        return (
            memory.currentTarget ||
            memory.runtimeAwareness.lastTarget ||
            "system"
        );
    }

    return null;
}

/* ======================================================================================
   LEARNING ENGINE
====================================================================================== */

function learnOperatorBehavior(text, intent, entity) {

    const memory =
        window.__JARVIS_COGNITIVE_STATE__;

    if (!memory.operatorPatterns[intent]) {

        memory.operatorPatterns[intent] = [];
    }

    memory.operatorPatterns[intent].push({

        text,
        entity,
        timestamp: Date.now()
    });

    if (
        memory.operatorPatterns[intent].length > 50
    ) {

        memory.operatorPatterns[intent].shift();
    }
}

/* ======================================================================================
   MEMORY UPDATE
====================================================================================== */

function updateCognitiveMemory(intentResult) {

    const memory =
        window.__JARVIS_COGNITIVE_STATE__;

    memory.runtimeAwareness.lastIntent =
        intentResult.intent;

    memory.runtimeAwareness.lastAction =
        intentResult.action;

    memory.runtimeAwareness.lastEntity =
        intentResult.entity;

    memory.runtimeAwareness.lastTarget =
        intentResult.target;

    memory.currentEntity =
        intentResult.entity;

    memory.currentTarget =
        intentResult.target;

    memory.conversationalHistory.push({

        text: intentResult.raw,

        intent: intentResult.intent,

        ts: Date.now()
    });

    if (
        memory.conversationalHistory.length > 100
    ) {

        memory.conversationalHistory.shift();
    }
}

/* ======================================================================================
   PERSONALITY RESPONSE ENGINE
====================================================================================== */

function generateNaturalResponse(result, humanState) {

    if (humanState.greeting) {

        return `
Buenos días Arquitecto.

El runtime sigue estable.

Todos los sistemas cognitivos están online.
La telemetría se reporta limpia.
No detecto corrupción en snapshots.
La federación permanece sincronizada.

¿Con qué le damos hoy?
        `.trim();
    }

    if (humanState.farewell) {

        return `
Arre.

Yo me quedo cuidando el changarro.

Los fierros quedan estables.
        `.trim();
    }

    if (humanState.frustration) {

        return `
Ya detecté tensión operativa.

Voy a revisar ${result.entity.toLowerCase()}
y buscar inconsistencias antes de ejecutar cambios.
        `.trim();
    }

    if (result.intent === "REPAIR") {

        return `
Arre.

Voy a intervenir ${result.entity.toLowerCase()}
y aplicar corrección cognitiva sobre:

${result.target}
        `.trim();
    }

    if (result.intent === "ANALYZE") {

        return `
Iniciando análisis profundo de:

${result.entity.toLowerCase()}

Preparando telemetría,
estado operativo
y diagnóstico contextual.
        `.trim();
    }

    return `
Orden recibida.

Procesando ${result.intent}
sobre ${result.entity.toLowerCase()}.
    `.trim();
}

/* ======================================================================================
   MULTI STEP DETECTION
====================================================================================== */

function detectMultiStep(text) {

    return /\b(y luego|despues|after|then)\b/i
        .test(text);
}

/* ======================================================================================
   BUILD EXECUTION PLAN
====================================================================================== */

function buildExecutionPlan(text) {

    const normalized =
        normalize(text);

    const tokens =
        tokenize(normalized);

    const humanState =
        detectHumanState(normalized);

    const intent =
        detectIntent(tokens);

    const entity =
        detectEntity(tokens);

    const contextualTarget =
        resolveContextualReferences(normalized);

    const target =
        contextualTarget ||
        extractTarget(tokens, entity);

    const confidence =
        contextualTarget
            ? 0.95
            : 0.88;

    const result = {

        ok: true,

        raw: text,

        intent,

        action: intent,

        entity,

        target,

        confidence,

        emotionalState: humanState,

        multiStep:
            detectMultiStep(normalized),

        timestamp:
            Date.now()
    };

    result.summary =
        generateNaturalResponse(
            result,
            humanState
        );

    learnOperatorBehavior(
        text,
        intent,
        entity
    );

    updateCognitiveMemory(result);

    return result;
}

/* ======================================================================================
   VOICE ENGINE
====================================================================================== */

window.speakJarvis =
function(message = "") {

    try {

        if (
            !window.speechSynthesis
        ) {

            return;
        }

        window.speechSynthesis.cancel();

        const utter =
            new SpeechSynthesisUtterance(
                String(message)
            );

        utter.lang = "es-MX";

        utter.rate = 1;

        utter.pitch = 0.9;

        utter.volume = 1;

        const voices =
            speechSynthesis.getVoices();

        const preferred =
            voices.find(v =>
                v.lang.includes("es")
            );

        if (preferred) {

            utter.voice = preferred;
        }

        speechSynthesis.speak(
            utter
        );

    }

    catch(error) {

        console.error(
            "VOICE_ENGINE_FAIL",
            error
        );
    }
};

/* ======================================================================================
   UNIVERSAL VOICE BRIDGE ALIAS
====================================================================================== */

window.hablarJarvis =
window.speakJarvis;

/* ======================================================================================
   MAIN ENGINE
====================================================================================== */

export async function
interpretarIntenciones(comandos = []) {

    if (!Array.isArray(comandos)) {

        return [];
    }

    console.log(
        "%c🧠 INTENT ENGINE V7 ONLINE",
        "color:#00ff88;font-weight:bold;"
    );

    const results = [];

    for (const cmd of comandos) {

        try {

            const result =
                buildExecutionPlan(
                    cmd.raw || ""
                );

            results.push(
                __toSystemFormat(result)
            );
        }

        catch(error) {

            console.error(
                "INTENT_ENGINE_FAIL",
                error
            );

            results.push(
                __toSystemFormat({

                    ok: false,

                    intent: "ERROR",

                    entity: "SYSTEM",

                    target: "runtime",

                    summary:
                        "Sentí ruido en la instrucción. Necesito reinterpretar el contexto.",

                    confidence: 0.4
                })
            );
        }
    }

    return results;
}

/* ======================================================================================
   SYSTEM FORMATTER
====================================================================================== */

function __toSystemFormat(result) {

    return {

        ok: result.ok !== false,

        type:
            result.intent === "ANALYZE"
                ? "SYSTEM_STATUS"
                : "TEXT",

        intent:
            result.intent,

        entity:
            result.entity,

        target:
            result.target,

        confidence:
            result.confidence || 1,

        message:
            result.summary,

        summary:
            result.summary,

        emotionalState:
            result.emotionalState || {},

        meta: {

            ts: Date.now(),

            source:
                "intent_engine_v7",

            multiStep:
                result.multiStep || false
        },

        data: {

            runtimeHealth: 100,

            cognition: "ONLINE",

            federation: "STABLE"
        }
    };
}

/* ======================================================================================
   GLOBAL BRIDGE
====================================================================================== */

window.runIntentEngine =
async function(text = "") {

    try {

        const result =
            await interpretarIntenciones([
                {
                    raw: text
                }
            ]);

        const final =
            result[0];

        if (
            final?.message &&
            typeof speakJarvis === "function"
        ) {

            speakJarvis(
                final.message
            );
        }

        return final;
    }

    catch(error) {

        console.error(
            "RUN_INTENT_ENGINE_FAIL",
            error
        );

        return {

            ok: false,

            message:
                "El núcleo cognitivo encontró ruido operativo.",

            type: "ERROR"
        };
    }
};

/* ======================================================================================
   STATUS
====================================================================================== */

console.log(
    "%c🧠 JARVIS COGNITIVE INTENT ENGINE V7 OPERATIONAL",
    "background:#001b12;color:#00ff88;padding:4px 12px;border-radius:6px;font-weight:bold;"
);