/**
 * JARVIS SEMANTIC CONTEXT V8
 * La selección de intención pertenece al planificador de modelo real.
 * Este módulo conserva únicamente contexto y telemetría; no clasifica lenguaje.
 */

const VERSION = "8.0.0-model-context";

window.__SEMANTIC_COGNITIVE_MATRIX__ = window.__SEMANTIC_COGNITIVE_MATRIX__ || {
    initialized: true,
    cognitionLevel: "V8_MODEL",
    runtimeAwareness: {
        health: 100,
        cognition: "MODEL_PLANNER",
        topology: "CONNECTED"
    },
    activeContextWindow: [],
    semanticTelemetry: [],
    lastSemanticResolution: null
};

function record(type, payload = {}) {
    const event = { type, payload, timestamp: Date.now() };
    const matrix = window.__SEMANTIC_COGNITIVE_MATRIX__;
    matrix.semanticTelemetry.push(event);
    if (matrix.semanticTelemetry.length > 100) matrix.semanticTelemetry.shift();
    window.dispatchEvent(new CustomEvent("semantic-cognitive-event", { detail: event }));
}

function createContext(input = "") {
    const raw = String(input || "").trim();
    return {
        ok: true,
        raw,
        normalized: raw.toLocaleLowerCase("es"),
        primaryConcept: null,
        concepts: [],
        confidence: null,
        semanticState: "MODEL_PLANNER_PENDING",
        source: "JARVIS_MODEL_SEMANTIC_CONTEXT",
        timestamp: Date.now()
    };
}

export async function sincronizarCorralSemantico(inputCEO = "", tenantId = "GLOBAL_SYSTEM") {
    const semantic = createContext(inputCEO);
    const matrix = window.__SEMANTIC_COGNITIVE_MATRIX__;
    const resolution = {
        semantic,
        tenantId,
        cognitiveContext: JSON.stringify({ tenantId, instruction: semantic.raw }),
        timestamp: Date.now()
    };

    matrix.lastSemanticResolution = resolution;
    matrix.activeContextWindow.push(semantic);
    if (matrix.activeContextWindow.length > 50) matrix.activeContextWindow.shift();
    record("MODEL_CONTEXT_READY", { tenantId, inputLength: semantic.raw.length });
    return resolution.cognitiveContext;
}

export function getSemanticCognitiveState() {
    return { ok: true, version: VERSION, ...window.__SEMANTIC_COGNITIVE_MATRIX__ };
}

export function invalidateSemanticCache(tenantId = null) {
    const matrix = window.__SEMANTIC_COGNITIVE_MATRIX__;
    matrix.lastSemanticResolution = null;
    if (!tenantId) matrix.activeContextWindow = [];
    record("MODEL_CONTEXT_INVALIDATED", { tenantId });
}

window.runSemanticCognition = sincronizarCorralSemantico;

export function getSemanticMatrix() {
    return window.__SEMANTIC_COGNITIVE_MATRIX__;
}

export function getRuntimeAwareness() {
    return window.__SEMANTIC_COGNITIVE_MATRIX__?.runtimeAwareness || {};
}

export function getSemanticContext() {
    return window.__SEMANTIC_COGNITIVE_MATRIX__?.activeContextWindow || [];
}

console.log("🧠 [SEMANTIC_MODEL_CONTEXT] ONLINE", VERSION);
