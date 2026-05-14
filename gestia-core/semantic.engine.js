/**
 * ======================================================================================
 * GESTIAPREMIUM 2026
 * SEMANTIC COGNITIVE MATRIX V7
 * THE COGNITIVE SOVEREIGN CORE
 * ======================================================================================
 * IDENTIDAD:
 * Motor de comprensión semántica, contexto cognitivo,
 * relaciones conceptuales, interpretación humana
 * y ensamblador dinámico de conciencia runtime.
 *
 * NIVEL:
 * JARVIS OPERATOR INTELLIGENCE
 * ======================================================================================
 */

import { db } from '/firebase.js';

import {

    collection,
    getDocs,
    query,
    limit,
    where

} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ======================================================================================
   GLOBAL COGNITIVE MATRIX
====================================================================================== */

window.__SEMANTIC_COGNITIVE_MATRIX__ =
window.__SEMANTIC_COGNITIVE_MATRIX__ || {

    initialized: true,

    cognitionLevel: "V7",

    semanticGraph: {},

    runtimeAwareness: {

        health: 100,

        federation: "STABLE",

        cognition: "ONLINE",

        topology: "CONNECTED"
    },

    activeContextWindow: [],

    semanticMemory: {},

    emotionalMemory: {},

    operatorPatterns: {},

    contextualAssociations: {},

    fuzzyRelations: {},

    learningIndex: {},

    semanticTelemetry: [],

    conceptClusters: {},

    activeObjectives: [],

    lastSemanticResolution: null
};

/* ======================================================================================
   SEMANTIC CACHE
====================================================================================== */

const SEMANTIC_CACHE =
new Map();

const pendingSyncs =
new Map();

/* ======================================================================================
   CONFIGURATION
====================================================================================== */

const TTL_SEMANTICO =
10 * 60 * 1000;

const DEFAULT_CONTEXT =
"GLOBAL_SYSTEM";

/* ======================================================================================
   STOPWORDS
====================================================================================== */

const STOPWORDS =
new Set([

    "para",
    "con",
    "los",
    "las",
    "del",
    "que",
    "por",
    "una",
    "uno",
    "como",
    "mas",
    "sin",
    "sobre",
    "este",
    "esta",
    "todos",
    "todas",
    "hacer",
    "crear",
    "borrar",
    "modificar",
    "actualizar",
    "quiero",
    "necesito",
    "favor",
    "oye",
    "jarvis"
]);

/* ======================================================================================
   CONCEPT CLUSTERS
====================================================================================== */

const CONCEPT_CLUSTERS = {

    DASHBOARD: [

        "dashboard",
        "panel",
        "hud",
        "ui",
        "interfaz",
        "pantalla",
        "vista",
        "monitor"
    ],

    PERFORMANCE: [

        "lento",
        "trabado",
        "raro",
        "tronado",
        "pesado",
        "bug",
        "falla",
        "crash"
    ],

    VOICE: [

        "voz",
        "speech",
        "hablar",
        "escuchar",
        "audio",
        "microfono"
    ],

    MEMORY: [

        "memoria",
        "contexto",
        "historial",
        "recuerdo",
        "persistencia"
    ],

    RUNTIME: [

        "runtime",
        "kernel",
        "core",
        "motor",
        "daemon"
    ],

    FEDERATION: [

        "federation",
        "cluster",
        "nodos",
        "sync",
        "federado"
    ]
};

/* ======================================================================================
   HUMAN SEMANTICS
====================================================================================== */

const HUMAN_SEMANTICS = {

    urgency: /\b(ya|ahorita|de una|rapidito|en corto|chingatelo)\b/i,

    frustration: /\b(no sirve|mal|wtf|bug|falla|tronado|raro)\b/i,

    approval: /\b(arre|chingon|perfecto|excelente|jalo)\b/i,

    confusion: /\b(no entendi|como|que pedo|explica)\b/i
};

/* ======================================================================================
   TELEMETRY
====================================================================================== */

function emitSemanticTelemetry(

    type,
    payload = {},
    severity = "INFO"

) {

    const event = {

        type,
        payload,
        severity,
        timestamp: Date.now()
    };

    console.log(

        `%c🧠 [SEMANTIC:${type}]`,
        "color:#67e8f9;font-weight:bold;",
        payload
    );

    window.__SEMANTIC_COGNITIVE_MATRIX__
        .semanticTelemetry
        .push(event);

    window.dispatchEvent(

        new CustomEvent(
            "semantic-cognitive-event",
            {
                detail: event
            }
        )
    );
}

/* ======================================================================================
   NORMALIZATION
====================================================================================== */

function normalize(text = "") {

    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, "")
        .trim();
}

/* ======================================================================================
   TOKENIZATION
====================================================================================== */

function tokenize(text = "") {

    return normalize(text)
        .split(/\s+/)
        .filter(Boolean)
        .filter(w =>
            !STOPWORDS.has(w)
        );
}

/* ======================================================================================
   FUZZY SEMANTIC DETECTION
====================================================================================== */

function detectFuzzyMeaning(tokens = []) {

    const meanings = [];

    Object.entries(CONCEPT_CLUSTERS)
        .forEach(([concept, words]) => {

            let score = 0;

            tokens.forEach(token => {

                if (
                    words.includes(token)
                ) {

                    score++;
                }
            });

            if (score > 0) {

                meanings.push({

                    concept,
                    score
                });
            }
        });

    return meanings.sort(
        (a, b) =>
            b.score - a.score
    );
}

/* ======================================================================================
   EMOTIONAL SEMANTICS
====================================================================================== */

function detectEmotionalSemantics(text) {

    const result = {

        urgency: false,
        frustration: false,
        approval: false,
        confusion: false
    };

    Object.entries(HUMAN_SEMANTICS)
        .forEach(([k, regex]) => {

            result[k] =
                regex.test(text);
        });

    return result;
}

/* ======================================================================================
   CONTEXT WINDOW
====================================================================================== */

function injectContextWindow(entry) {

    const matrix =
        window.__SEMANTIC_COGNITIVE_MATRIX__;

    matrix.activeContextWindow.push({

        ...entry,

        timestamp: Date.now()
    });

    if (
        matrix.activeContextWindow.length > 50
    ) {

        matrix.activeContextWindow.shift();
    }
}

/* ======================================================================================
   LEARNING ENGINE
====================================================================================== */

function learnSemanticPattern(

    text,
    semanticResult

) {

    const matrix =
        window.__SEMANTIC_COGNITIVE_MATRIX__;

    const key =
        semanticResult.primaryConcept ||
        "GENERAL";

    if (
        !matrix.learningIndex[key]
    ) {

        matrix.learningIndex[key] = [];
    }

    matrix.learningIndex[key].push({

        text,
        timestamp: Date.now()
    });

    if (
        matrix.learningIndex[key]
            .length > 100
    ) {

        matrix.learningIndex[key]
            .shift();
    }
}

/* ======================================================================================
   SEMANTIC ASSOCIATION
====================================================================================== */

function createSemanticAssociations(

    tokens,
    concepts

) {

    const associations = [];

    concepts.forEach(concept => {

        tokens.forEach(token => {

            associations.push({

                token,
                concept:
                    concept.concept,

                weight:
                    concept.score
            });
        });
    });

    return associations;
}

/* ======================================================================================
   COGNITIVE RESOLUTION
====================================================================================== */

function resolveSemanticIntent(

    input = ""

) {

    const normalized =
        normalize(input);

    const tokens =
        tokenize(normalized);

    const emotional =
        detectEmotionalSemantics(
            normalized
        );

    const concepts =
        detectFuzzyMeaning(
            tokens
        );

    const associations =
        createSemanticAssociations(
            tokens,
            concepts
        );

    const primaryConcept =
        concepts[0]?.concept ||
        "GENERAL";

    const confidence =
        concepts.length > 0
            ? 0.92
            : 0.65;

    const semanticResult = {

        ok: true,

        raw: input,

        normalized,

        tokens,

        concepts,

        associations,

        primaryConcept,

        confidence,

        emotional,

        semanticState:

            confidence > 0.9
                ? "HIGH_CONFIDENCE"
                : "LOW_CONFIDENCE",

        timestamp:
            Date.now()
    };

    injectContextWindow(
        semanticResult
    );

    learnSemanticPattern(
        input,
        semanticResult
    );

    return semanticResult;
}

/* ======================================================================================
   FIRESTORE CONTEXT INJECTION
====================================================================================== */

async function fetchRuntimeModules(

    tenantId =
    DEFAULT_CONTEXT

) {

    const contextKey =
        `TENANT_${tenantId}`;

    const cache =
        SEMANTIC_CACHE.get(
            contextKey
        );

    if (
        cache &&
        (
            Date.now() -
            cache.lastSync
        ) < TTL_SEMANTICO
    ) {

        return cache.modules;
    }

    let syncPromise =
        pendingSyncs.get(
            contextKey
        );

    if (!syncPromise) {

        syncPromise =
        (async() => {

            emitSemanticTelemetry(

                "FETCH_RUNTIME_MODULES",

                {
                    tenantId
                }
            );

            const q =
                query(

                    collection(
                        db,
                        "gestia_system_modules"
                    ),

                    where(
                        "status",
                        "==",
                        "activo"
                    ),

                    limit(100)
                );

            const snap =
                await getDocs(q);

            const modules =
                snap.docs.map(d => ({

                    id: d.id,

                    name:
                        d.data()
                            .nombre_display ||
                        d.id,

                    description:
                        d.data()
                            .descripcion_semantica ||
                        "",

                    schema:
                        d.data()
                            .esquema_campos ||
                        []
                }));

            SEMANTIC_CACHE.set(

                contextKey,

                {

                    modules,

                    lastSync:
                        Date.now()
                }
            );

            return modules;

        })();

        pendingSyncs.set(

            contextKey,
            syncPromise
        );
    }

    try {

        return await syncPromise;

    }

    finally {

        pendingSyncs.delete(
            contextKey
        );
    }
}

/* ======================================================================================
   CONTEXT ASSEMBLER
====================================================================================== */

function assembleCognitiveContext(

    semantic,
    modules

) {

    let context = "";

    context +=
`
--- SEMANTIC COGNITIVE MATRIX V7 ---
`;

    context +=
`
PRIMARY_CONCEPT:
${semantic.primaryConcept}
`;

    context +=
`
SEMANTIC_STATE:
${semantic.semanticState}
`;

    context +=
`
EMOTIONAL_STATE:
${JSON.stringify(
    semantic.emotional
)}
`;

    context +=
`
CONCEPT_RELATIONS:
`;

    semantic.associations
        .forEach(a => {

            context +=
`
- ${a.token} -> ${a.concept}
`;
        });

    context +=
`
RUNTIME_MODULES:
`;

    modules.forEach(m => {

        context +=
`
- ${m.id}
  NAME: ${m.name}
  SCHEMA: ${m.schema.join(", ")}
`;
    });

    context +=
`
--- END_MATRIX ---
`;

    return context;
}

/* ======================================================================================
   MAIN SEMANTIC ENGINE
====================================================================================== */

export async function
sincronizarCorralSemantico(

    inputCEO = "",

    tenantId =
    DEFAULT_CONTEXT

) {

    try {

        emitSemanticTelemetry(

            "SEMANTIC_ANALYSIS_START",

            {
                inputCEO
            }
        );

        const semantic =
            resolveSemanticIntent(
                inputCEO
            );

        const modules =
            await fetchRuntimeModules(
                tenantId
            );

        const cognitiveContext =
            assembleCognitiveContext(

                semantic,
                modules
            );

        window.__SEMANTIC_COGNITIVE_MATRIX__
            .lastSemanticResolution = {

            semantic,
            modules,
            cognitiveContext,

            timestamp:
                Date.now()
        };

        emitSemanticTelemetry(

            "SEMANTIC_ANALYSIS_COMPLETE",

            {

                concept:
                    semantic.primaryConcept,

                confidence:
                    semantic.confidence
            },

            "SUCCESS"
        );

        return cognitiveContext;

    }

    catch(error) {

        console.error(

            "SEMANTIC_COGNITIVE_MATRIX_FAIL",
            error
        );

        emitSemanticTelemetry(

            "SEMANTIC_CRASH",

            {
                error:
                    error.message
            },

            "ERROR"
        );

        return `
SEMANTIC_ENGINE_FAIL:
Runtime operating in degraded cognition mode.
        `.trim();
    }
}

/* ======================================================================================
   SEMANTIC MEMORY ACCESS
====================================================================================== */

export function
getSemanticCognitiveState() {

    return {

        ok: true,

        ...(window.__SEMANTIC_COGNITIVE_MATRIX__)
    };
}

/* ======================================================================================
   CACHE INVALIDATION
====================================================================================== */

export function
invalidateSemanticCache(

    tenantId = null

) {

    if (tenantId) {

        SEMANTIC_CACHE.delete(

            `TENANT_${tenantId}`
        );

    }

    else {

        SEMANTIC_CACHE.clear();
    }

    emitSemanticTelemetry(

        "CACHE_INVALIDATED",

        {
            tenantId
        },

        "WARN"
    );
}

/* ======================================================================================
   LIVE RUNTIME BRIDGE
====================================================================================== */

window.runSemanticCognition =
async function(

    input = "",

    tenantId =
    DEFAULT_CONTEXT

) {

    return await
    sincronizarCorralSemantico(

        input,
        tenantId
    );
};

/* ======================================================================================
   STATUS
====================================================================================== */

console.log(

    "%c🧠 SEMANTIC COGNITIVE MATRIX V7 ONLINE",

    "background:#082f49;color:#67e8f9;padding:4px 12px;border-radius:6px;font-weight:bold;"
);