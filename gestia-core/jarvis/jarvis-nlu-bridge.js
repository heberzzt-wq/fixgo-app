/**
 * =====================================================================================
 * JARVIS NLU BRIDGE v1.2 GOD MODE (HYBRID SOVEREIGN + V7 COMPAT)
 * Natural Language Understanding Layer for Gestia / FixGo / Jarvis Sovereign Core
 * =====================================================================================
 * MISIÓN:
 * Traducir lenguaje humano real -> comandos limpios para Intent Engine V3.1
 * + preservar conversación V7
 * + exponer window.runIntentEngine para Bridge V5.95 sin crear otro cerebro
 * -------------------------------------------------------------------------------------
 */

import { JarvisMemory } from "./jarvis.memory.js";
import { analyzeConversation } from "./jarvis.conversation.engine.v7.js";
import "./jarvis.intent.runtime.v7.js";

const NLU_VERSION = "1.2 HYBRID SOVEREIGN V7 COMPAT";

// =====================================================================================
// NORMALIZADOR
// =====================================================================================

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s{}:,\-.\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// =====================================================================================
// DICCIONARIOS HUMANOS (FALLBACK, NO CEREBRO PRINCIPAL)
// =====================================================================================

const ACTION_MAP = {
  analyze: [
    "analiza", "revisa", "checa", "mira", "verifica", "escanea", "scan",
    "echale un ojo", "anda raro", "anda fallando", "que paso con", "donde esta"
  ],
  repair: [
    "repara", "corrige", "arregla", "soluciona", "tronó", "trono", "se cayo",
    "no sirve", "falla", "atorado", "se atora", "ambiguo", "no entiende", "fix"
  ],
  update: [
    "actualiza", "modifica", "cambia", "ajusta", "mejora", "optimiza", "sube de nivel", "upgrade"
  ],
  create: [
    "crea", "genera", "arma", "haz", "implementa", "construye"
  ],
  activate: [
    "activa", "enciende", "habilita"
  ],
  deactivate: [
    "desactiva", "apaga"
  ],
  purge: [
    "limpia", "purga", "borra basura"
  ],
  status: [
    "como vamos", "estado del sistema", "todo bien"
  ],
  open: [
    "abre", "muestrame", "ver", "mostrar"
  ]
};

const ENTITY_MAP = {
  pagos: ["pagos", "cobros", "finanzas", "facturas", "cfdi"],
  auth: ["login", "acceso", "usuarios", "sesion", "sesión", "auth"],
  camaras: ["camaras", "cámaras", "cctv", "vigilancia", "hikvision"],
  tenant: ["edificio", "torre", "condominio", "tenant"],
  firewall: ["firewall", "seguridad"],
  terminal: ["terminal", "consola", "gestia-terminal"],
  jarvis: ["jarvis", "sia7", "asistente", "conversacion", "conversación", "respuesta"],
  main: ["main", "app"],
  snapshot: ["snapshot", "backup"],
  memory: ["memoria", "historial", "contexto", "recuerda"],
  tecnico: ["tecnico", "técnico", "tecnicos", "técnicos", "tecs", "personal"],
  repo: ["repo", "repositorio", "codigo", "código", "archivo", ".js", ".html", ".css", ".json"],
  system: ["sistema", "system", "core", "runtime", "kernel", "fierros"]
};

const URGENCY_MAP = [
  "urge", "urgente", "rapido", "rápido", "ya", "ahorita", "en corto"
];

// =====================================================================================
// DETECTORES FALLBACK
// =====================================================================================

function detectAction(text) {
  for (const key in ACTION_MAP) {
    for (const phrase of ACTION_MAP[key]) {
      if (text.includes(normalize(phrase))) {
        return key.toUpperCase();
      }
    }
  }
  return null;
}

function detectEntity(text) {
  for (const key in ENTITY_MAP) {
    for (const phrase of ENTITY_MAP[key]) {
      if (text.includes(normalize(phrase))) {
        return key;
      }
    }
  }
  return null;
}

function detectPriority(text) {
  for (const word of URGENCY_MAP) {
    if (text.includes(normalize(word))) return "CRITICAL";
  }
  return "NORMAL";
}

function extractTargetFile(text = "") {
  const match = String(text).match(/([a-z0-9_\-\/]+\.(js|html|css|json))/i);
  return match ? match[1] : null;
}

function buildCleanCommand(action, entity, text) {
  if (!action) return text;

  const file = extractTargetFile(text);
  const target = file || entity || "system";

  const map = {
    ANALYZE: "analiza",
    REPAIR: "repara",
    UPDATE: "actualiza",
    CREATE: "crea",
    ACTIVATE: "activa",
    DEACTIVATE: "desactiva",
    PURGE: "limpia",
    OPEN: "abre",
    STATUS: "analiza"
  };

  return `${map[action] || "analiza"} ${target}`.trim();
}

function splitCommands(text) {
  return text
    .split(/\s+y luego\s+|\s+y\s+|\s+despues\s+|\s+después\s+|\s+luego\s+/gi)
    .map(x => x.trim())
    .filter(Boolean);
}

function toProtocol(action = "ANALYZE", entity = "system", raw = "") {
  const file = extractTargetFile(raw);
  const target = file || entity || "system";
  return `${String(action || "ANALYZE").toUpperCase()}::${target}`;
}

function rememberConversation(original, envelope = {}) {
  try {
    JarvisMemory.dispatch({
      type: "PUSH_HISTORY",
      payload: {
        role: "user",
        message: original
      }
    });

    window.JarvisContextMemory?.remember?.(
      {
        actions: [
          {
            intent: envelope.intent,
            entity: envelope.entity,
            filters: {
              target: envelope.target
            },
            confidence: envelope.confidence,
            reply: envelope.reply,
            meta: envelope.meta || {}
          }
        ]
      },
      original
    );
  } catch (err) {
    console.warn("⚠️ [NLU_MEMORY_SYNC_FAIL]", err);
  }
}

// =====================================================================================
// MAIN ENGINE
// =====================================================================================

export function understand(rawInput = "") {
  const original = String(rawInput || "");
  const runtime =
    (typeof window !== "undefined" ? window.JarvisIntentRuntimeV7 : null) ||
    globalThis.JarvisIntentRuntimeV7 ||
    null;
  const conversation =
    typeof runtime?.analyze === "function"
      ? runtime.analyze(original)
      : analyzeConversation(original);
  const normalized = normalize(original);
  const chunks = conversation.commands?.length
    ? conversation.commands.map(command => command.original)
    : splitCommands(normalized);

  const results = chunks.map((chunk, index) => {
    const v7 = conversation.commands?.[index];

    if (v7 && v7.confidence >= 0.7) {
      const protocol = v7.protocol || toProtocol(v7.action, v7.entity, v7.original);
      const targetFile = extractTargetFile(v7.original || original);

      return {
        original: v7.original,
        action: String(v7.action || "ANALYZE").toUpperCase(),
        intent: String(v7.action || "ANALYZE").toUpperCase(),
        entity: targetFile || v7.entity || "system",
        target: targetFile || v7.entity || "system",
        priority: v7.priority,
        clean: protocol,
        protocol,
        confidence: v7.confidence,
        fallback: false,
        reply: v7.reply,
        source: "conversation_engine_v7",
        meta: v7.meta || {},
        conversation: {
          original,
          reply: conversation.reply,
          multiStep: conversation.multiStep,
          version: conversation.version,
          humanState: v7.meta?.humanState || null
        }
      };
    }

    const cleanChunk = normalize(chunk);
    const action = detectAction(cleanChunk);
    const entity = detectEntity(cleanChunk);
    const priority = detectPriority(cleanChunk);
    const targetFile = extractTargetFile(chunk);

    let fallback = false;
    let finalAction = action;
    let finalEntity = targetFile || entity;

    if (!finalAction || !finalEntity) {
      fallback = true;
      console.warn("🧠 [NLU HYBRID]: fallback activo →", chunk);

      if (!finalAction) finalAction = "ANALYZE";

      if (!finalEntity) {
        if (cleanChunk.includes("tecnic")) finalEntity = "tecnico";
        else if (cleanChunk.includes("pago")) finalEntity = "pagos";
        else if (cleanChunk.includes("login") || cleanChunk.includes("auth")) finalEntity = "auth";
        else if (cleanChunk.includes("jarvis") || cleanChunk.includes("sia7")) finalEntity = "jarvis";
        else finalEntity = "system";
      }
    }

    const protocol = toProtocol(finalAction, finalEntity, chunk);

    return {
      original: chunk,
      action: finalAction,
      intent: finalAction,
      entity: finalEntity,
      target: finalEntity,
      priority,
      clean: protocol,
      protocol,
      confidence: action && entity
        ? 0.96
        : fallback
          ? 0.55
          : 0.84,
      fallback,
      source: "nlu_bridge_fallback",
      meta: {
        fallback,
        normalized: cleanChunk
      }
    };
  });

  const primary = results[0] || {
    action: "ANALYZE",
    intent: "ANALYZE",
    entity: "system",
    target: "system",
    confidence: 0.5,
    protocol: "ANALYZE::system"
  };

  rememberConversation(original, {
    intent: primary.intent || primary.action,
    entity: primary.entity,
    target: primary.target || primary.entity,
    confidence: primary.confidence,
    reply: primary.reply || conversation.reply,
    meta: primary.meta || {}
  });

  return {
    engine: NLU_VERSION,
    conversationEngine: conversation.version,
    reply: conversation.reply,
    raw: original,
    normalized,
    primary,
    commands: results,
    conversation
  };
}

// =====================================================================================
// COMPATIBILIDAD GLOBAL PARA BRIDGE V5.95
// =====================================================================================

export async function runIntentEngine(input = "") {
  const nlu = understand(input);
  const first = nlu.commands?.[0] || nlu.primary || {};
  const intent = String(first.intent || first.action || "ANALYZE").toUpperCase();
  const entity = first.target || first.entity || "system";
  const protocol = first.protocol || first.clean || toProtocol(intent, entity, input);

  return {
    ok: true,
    version: NLU_VERSION,
    intent,
    action: intent,
    entity,
    target: entity,
    command: protocol,
    protocolCommand: protocol,
    clean: protocol,
    confidence: first.confidence || 0.5,
    reply: first.reply || nlu.reply,
    source: "jarvis_nlu_bridge_v7_compat",
    data: {
      intent,
      action: intent,
      entity,
      target: entity,
      confidence: first.confidence || 0.5
    },
    cognition: {
      original: String(input || ""),
      normalized: nlu.normalized,
      conversation: nlu.conversation,
      command: first,
      expectedOutput: protocol,
      cognitionLayer: first.source || "nlu_bridge"
    },
    commands: nlu.commands,
    conversation: nlu.conversation,
    meta: first.meta || {}
  };
}

if (typeof window !== "undefined") {
  window.JarvisNLUBridge = {
    version: NLU_VERSION,
    understand,
    runIntentEngine
  };

  window.runIntentEngine = runIntentEngine;
}

console.log("🧠 JARVIS NLU BRIDGE v1.2 HYBRID SOVEREIGN ONLINE");
