/* =====================================================================================
   JARVIS INTENT RUNTIME V7
   Conversational understanding layer for Gestia / FixGo.

   Goal:
   - Understand natural Spanish/Spanglish operator commands.
   - Preserve conversational context for "eso", "lo mismo", "otra vez".
   - Avoid fake certainty: return needsClarification when target/action is missing.
===================================================================================== */

const VERSION = "7.0.0-conversational";

const ACTIONS = [
    {
        intent: "REPAIR",
        canonical: "repair",
        score: 0.96,
        patterns: [
            /\b(repara|reparar|arregla|arreglar|corrige|corregir|soluciona|fix|parcha|parchar)\b/i,
            /\b(no sirve|falla|fallando|truena|trono|se cayo|se rompio|atorado|bloquea|bloqueado)\b/i
        ]
    },
    {
        intent: "ANALYZE",
        canonical: "analyze",
        score: 0.92,
        patterns: [
            /\b(analiza|analizar|audita|auditar|revisa|revisar|checa|checar|escanea|scanner|scan|mira|verifica)\b/i
        ]
    },
    {
        intent: "CREATE",
        canonical: "create",
        score: 0.9,
        patterns: [
            /\b(crea|crear|genera|generar|arma|armar|haz|hacer|nuevo|nueva)\b/i
        ]
    },
    {
        intent: "UPDATE",
        canonical: "update",
        score: 0.88,
        patterns: [
            /\b(actualiza|actualizar|modifica|modificar|cambia|cambiar|ajusta|ajustar|sube|baja)\b/i
        ]
    },
    {
        intent: "OPEN",
        canonical: "open",
        score: 0.86,
        patterns: [
            /\b(abre|abrir|muestra|mostrar|muestrame|ver)\b/i
        ]
    }
];

const ENTITY_HINTS = [
    ["TECHNICIANS", /\b(tecnico|tecnicos|jonathan|personal)\b/i],
    ["PAYMENTS", /\b(pago|pagos|cobro|cobros|stripe|factura|facturas)\b/i],
    ["AUTH", /\b(auth|login|sesion|logout|acceso|usuario|usuarios)\b/i],
    ["TERMINAL", /\b(terminal|consola|logs|console)\b/i],
    ["RUNTIME", /\b(runtime|rutyme|rutime|latencia|latency|kernel|boot)\b/i],
    ["REPOSITORY", /\b(repo|repositorio|archivo|modulo|codigo|js|html|css|json)\b/i],
    ["JARVIS", /\b(jarvis|sia7|asistente)\b/i],
    ["SYSTEM", /\b(sistema|core|estado|salud|todo)\b/i]
];

const SOCIAL_INTENTS = [
    ["GREETING", /\b(hola|buenos dias|buenas tardes|buenas noches|que onda|q onda|hey)\b/i],
    ["APPROVAL", /\b(arre|dale|va|perfecto|jalo|ahuevo|ahuevos|chingon|simon)\b/i],
    ["THANKS", /\b(gracias|thanks|te agradezco)\b/i],
    ["FAREWELL", /\b(adios|bye|nos vemos|camara|sobres)\b/i]
];

const REFERENCE_RE = /\b(eso|esa|ese|lo mismo|mismo|otra vez|de nuevo|repitelo|repite|sigue|seguimos)\b/i;
const FILE_RE = /(?:\.\/|\/)?([a-z0-9_\-/]+?\.(?:js|html|css|json|txt|md))/i;
const NUMBER_RE = /\b(\d+(?:\.\d+)?)\b/;

function state() {
    window.__JARVIS_INTENT_RUNTIME_V7__ ||= {
        version: VERSION,
        lastAction: null,
        lastIntent: null,
        lastEntity: null,
        lastTarget: null,
        lastFile: null,
        lastRaw: null,
        history: []
    };

    return window.__JARVIS_INTENT_RUNTIME_V7__;
}

function normalize(text = "") {
    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function detectAction(raw = "", normalized = normalize(raw)) {
    for (const item of ACTIONS) {
        if (item.patterns.some(pattern => pattern.test(normalized))) {
            return item;
        }
    }

    return null;
}

function detectEntity(normalized = "") {
    for (const [entity, pattern] of ENTITY_HINTS) {
        if (pattern.test(normalized)) return entity;
    }

    return null;
}

function detectSocial(normalized = "") {
    for (const [intent, pattern] of SOCIAL_INTENTS) {
        if (pattern.test(normalized)) return intent;
    }

    return null;
}

function extractTarget(raw = "", normalized = normalize(raw)) {
    const fileMatch = raw.match(FILE_RE);
    const valueMatch = normalized.match(NUMBER_RE);

    if (fileMatch) {
        return {
            target: fileMatch[1],
            file: fileMatch[1],
            value: valueMatch?.[1] || null,
            source: "file"
        };
    }

    const quoted = raw.match(/["'`]([^"'`]+)["'`]/);
    if (quoted?.[1]) {
        return {
            target: quoted[1].trim(),
            file: null,
            value: valueMatch?.[1] || null,
            source: "quoted"
        };
    }

    return {
        target: null,
        file: null,
        value: valueMatch?.[1] || null,
        source: "none"
    };
}

function resolveReference(result, normalized) {
    const memory = state();

    if (!REFERENCE_RE.test(normalized)) {
        return result;
    }

    result.referencesContext = true;

    if (memory.lastAction) {
        result.action = memory.lastAction;
        result.intent = memory.lastIntent;
        result.inheritedAction = true;
    }

    if (!result.entity && memory.lastEntity) {
        result.entity = memory.lastEntity;
        result.inheritedEntity = true;
    }

    if (!result.target && memory.lastTarget) {
        result.target = memory.lastTarget;
        result.inheritedTarget = true;
    }

    if (!result.file && memory.lastFile) {
        result.file = memory.lastFile;
        result.inheritedFile = true;
    }

    return result;
}

function buildClarification(result) {
    const actionLabels = {
        analyze: "analizar",
        repair: "reparar",
        create: "crear",
        update: "actualizar",
        open: "abrir"
    };

    if (!result.action && !result.socialIntent) {
        return "Te sigo, pero necesito la accion: analizar, reparar, crear, actualizar o abrir.";
    }

    if (
        result.action &&
        ["REPAIR", "UPDATE", "CREATE", "ANALYZE"].includes(result.intent) &&
        !result.target &&
        !result.entity
    ) {
        return `Va. Dime el archivo, modulo o area sobre la que quieres ${actionLabels[result.action] || result.action}.`;
    }

    return null;
}

function buildCommand(result) {
    if (!result.action) return null;

    const entityOrTarget =
        result.file ||
        result.target ||
        (result.entity ? result.entity.toLowerCase() : "system");

    return `${result.action}::${entityOrTarget}`;
}

function remember(result) {
    if (result.socialIntent && !result.action) return;
    if (result.needsClarification) return;

    const memory = state();
    memory.lastAction = result.action || memory.lastAction;
    memory.lastIntent = result.intent || memory.lastIntent;
    memory.lastEntity = result.entity || memory.lastEntity;
    memory.lastTarget = result.target || memory.lastTarget;
    memory.lastFile = result.file || memory.lastFile;
    memory.lastRaw = result.raw;
    memory.history.push({
        at: Date.now(),
        raw: result.raw,
        intent: result.intent,
        entity: result.entity,
        target: result.target,
        file: result.file,
        confidence: result.confidence
    });

    if (memory.history.length > 50) {
        memory.history.shift();
    }
}

export function understandIntentV7(raw = "") {
    const original = String(raw || "");
    const normalized = normalize(original);
    const action = detectAction(original, normalized);
    const entity = detectEntity(normalized);
    const socialIntent = detectSocial(normalized);
    const targetInfo = extractTarget(original, normalized);

    let result = {
        ok: true,
        engine: "jarvis_intent_runtime_v7",
        version: VERSION,
        raw: original,
        normalized,
        intent: action?.intent || null,
        action: action?.canonical || null,
        entity,
        target: targetInfo.target,
        file: targetInfo.file,
        value: targetInfo.value,
        socialIntent,
        confidence: action?.score || (socialIntent ? 0.82 : 0.45),
        needsClarification: false,
        clarification: null,
        command: null,
        source: targetInfo.source
    };

    result = resolveReference(result, normalized);

    if (!result.entity && result.file) {
        result.entity = "REPOSITORY";
        result.confidence = Math.min(0.98, result.confidence + 0.04);
    }

    if (result.referencesContext) {
        result.confidence = Math.max(0.55, result.confidence - 0.08);
    }

    result.clarification = buildClarification(result);
    result.needsClarification = !!result.clarification;
    result.command = result.needsClarification ? null : buildCommand(result);

    remember(result);

    return result;
}

export function toLegacyCommandV7(raw = "") {
    return understandIntentV7(raw).command;
}

window.JarvisIntentRuntimeV7 = {
    version: VERSION,
    understand: understandIntentV7,
    toCommand: toLegacyCommandV7,
    dump: state
};

console.log("🧠 [JARVIS_INTENT_RUNTIME_V7] ONLINE", VERSION);
