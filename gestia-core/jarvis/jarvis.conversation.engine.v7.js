const VERSION = "7.0.0";

const ACTIONS = [
  { intent: "REPAIR", command: "repara", terms: ["repara", "corrige", "arregla", "soluciona", "fix", "patch", "parchea", "no sirve", "falla", "bug", "atorado", "se atora", "truena", "trono", "roto"] },
  { intent: "ANALYZE", command: "analiza", terms: ["analiza", "audita", "revisa", "checa", "verifica", "inspecciona", "diagnostica", "scanner", "scan", "que pasa", "que pedo", "estado"] },
  { intent: "CREATE", command: "crea", terms: ["crea", "genera", "arma", "construye", "nuevo", "agrega", "haz"] },
  { intent: "UPDATE", command: "actualiza", terms: ["actualiza", "modifica", "cambia", "ajusta", "mejora", "optimiza", "sube", "sube de nivel", "nivel", "capacidad", "v7"] },
  { intent: "OPEN", command: "abre", terms: ["abre", "muestra", "mostrar", "ver"] },
  { intent: "DELETE", command: "elimina", terms: ["elimina", "borra", "quita", "remueve", "suprime"] }
];

const ENTITIES = [
  { entity: "JARVIS", target: "jarvis", terms: ["jarvis", "sia7", "asistente", "cerebro", "conversacion", "conversacional", "respuesta", "fluida", "diccionario"] },
  { entity: "REPOSITORY", target: "repo", terms: ["repo", "repositorio", "codigo", "codebase", "archivo", ".js", ".html", ".css", ".json"] },
  { entity: "SYSTEM", target: "system", terms: ["sistema", "runtime", "core", "kernel", "terminal", "gestia", "fixgo"] },
  { entity: "AUTH", target: "auth", terms: ["login", "auth", "sesion", "acceso", "usuario", "usuarios"] },
  { entity: "PAYMENTS", target: "payments", terms: ["pago", "pagos", "cobro", "cobros", "factura", "stripe"] },
  { entity: "FLEET", target: "fleet", terms: ["flota", "flotilla", "gps", "vehiculo", "vehiculos", "chofer", "choferes"] },
  { entity: "TECHNICIANS", target: "technicians", terms: ["tecnico", "tecnicos", "b2b", "ticket", "tickets", "orden"] },
  { entity: "MEMORY", target: "memory", terms: ["memoria", "contexto", "historial", "ledger", "recuerda"] }
];

const HUMAN_SIGNALS = {
  approval: ["arre", "ahuevo", "perfecto", "chingon", "jalo", "dale"],
  urgency: ["ya", "ahorita", "urgente", "rapido", "en corto"],
  frustration: ["no sirve", "mal", "atorado", "ambiguo", "no entiende", "se atora"],
  casual: ["jajaja", "papa", "caon", "carnal"],
  greeting: ["hola", "buenas", "buenos dias", "que onda"],
  thanks: ["gracias", "te rifaste", "chingon"]
};

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.:-]/g, " ")
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
    .split(/\s+(?:y luego|luego|despues|ademas|tambien|y)\s+|[,;]/gi)
    .map(step => step.trim())
    .filter(Boolean);
}

function detectHumanState(normalized = "") {
  return Object.fromEntries(
    Object.entries(HUMAN_SIGNALS).map(([key, terms]) => [key, includesAny(normalized, terms)])
  );
}

function resolveContextTarget(entity) {
  const memory =
    globalThis.window?.JarvisContextMemory ||
    globalThis.window?.__JARVIS_COGNITIVE_STATE__ ||
    null;

  return memory?.currentTarget || memory?.runtimeAwareness?.lastTarget || entity?.target || "system";
}

function buildNaturalReply({ intent, entity, target, humanState, confidence }) {
  const entityName = entity.entity.toLowerCase();

  if (humanState.greeting && intent === "ANALYZE" && entity.target === "jarvis") {
    return "Aqui estoy, Arquitecto. Jarvis en linea: puedo analizar, crear, reparar, escanear y explicar sin perder el hilo.";
  }

  if (humanState.frustration) {
    return `Te capto. Voy a aterrizar el contexto de ${entityName}, bajar ambiguedad y revisar ${target} antes de proponer cambios.`;
  }

  if (intent === "REPAIR") {
    return `Arre. Entendi reparacion sobre ${entityName}; primero diagnostico ${target}, luego propongo patch y validacion.`;
  }

  if (intent === "CREATE") {
    return `Listo. Voy a estructurar la creacion para ${entityName}, con archivos claros y puntos de prueba.`;
  }

  if (intent === "UPDATE") {
    return `Va. Subo de nivel ${entityName}: contexto compartido, respuesta mas natural y conexion con runtime.`;
  }

  if (intent === "DELETE") {
    return `Recibido. Para eliminar en ${entityName}, marco impacto y dependencias antes de tocar ${target}.`;
  }

  if (confidence < 0.7) {
    return `Tengo una lectura inicial sobre ${entityName}, pero falta precision. Te devuelvo plan conservador para ${target}.`;
  }

  return `Entendido. Analizo ${entityName}, objetivo ${target}, y preparo una respuesta accionable.`;
}

function analyzeStep(step = "", fullText = "") {
  const normalized = normalize(step);
  const fullNormalized = normalize(fullText || step);
  let action = scoreMatch(normalized, ACTIONS);

  if (/\b(sube|upgrade|mejora|nivel|v7)\b/.test(normalized)) {
    action = {
      intent: "UPDATE",
      command: "actualiza",
      score: Math.max(action?.score || 0, 3),
      hits: ["upgrade_v7"]
    };
  }
  const localEntity = scoreMatch(normalized, ENTITIES);
  const fullEntity = scoreMatch(fullNormalized, ENTITIES);
  const entity = localEntity?.score > 0 ? localEntity : fullEntity;
  const humanState = detectHumanState(fullNormalized);
  const contextual = /\b(eso|esa|ese|aquello|lo anterior|lo mismo)\b/.test(normalized);
  const resolvedAction = action?.score > 0 ? action : null;
  const resolvedIntent = resolvedAction ? resolvedAction.intent : "ANALYZE";
  const resolvedEntity = entity?.score > 0 ? entity : { entity: "SYSTEM", target: "system", score: 0, hits: [] };
  const target = contextual ? resolveContextTarget(resolvedEntity) : resolvedEntity.target;
  const confidence = Math.min(0.99, 0.45 + (action?.score ? 0.25 : 0.05) + (resolvedEntity.score ? 0.25 : 0.05) + (humanState.urgency || humanState.approval ? 0.04 : 0));

  return {
    ok: true,
    version: VERSION,
    raw: step,
    normalized,
    intent: resolvedIntent,
    action: resolvedIntent,
    entity: resolvedEntity.entity,
    target,
    command: `${resolvedAction?.command || "analiza"} ${target}`,
    protocolCommand: `${resolvedIntent}::${target}`,
    humanState,
    confidence,
    source: "jarvis_conversation_engine_v7",
    reply: buildNaturalReply({ intent: resolvedIntent, entity: resolvedEntity, target, humanState, confidence }),
    meta: {
      actionHits: resolvedAction?.hits || [],
      entityHits: resolvedEntity.hits || [],
      contextual
    }
  };
}

export function analyzeConversation(input = "", options = {}) {
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
      entity: step.target,
      clean: step.command,
      protocol: step.protocolCommand,
      priority: step.humanState.urgency ? "CRITICAL" : "NORMAL",
      confidence: step.confidence,
      fallback: step.confidence < 0.7,
      reply: step.reply,
      meta: step.meta
    }))
  };

  if (options.remember !== false && globalThis.window) {
    const state = globalThis.window.__JARVIS_COGNITIVE_STATE__;

    if (state?.conversationalHistory) {
      state.conversationalHistory.push({
        text: raw,
        intent: result.intent,
        entity: result.entity,
        target: result.target,
        ts: Date.now()
      });

      if (state.conversationalHistory.length > 100) {
        state.conversationalHistory.shift();
      }
    }
  }

  return result;
}

export const JarvisConversationEngineV7 = {
  version: VERSION,
  normalize,
  analyze: analyzeConversation
};

if (globalThis.window) {
  window.JarvisConversationEngineV7 = JarvisConversationEngineV7;
}
