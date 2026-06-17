/**
 * =====================================================================================
 * JARVIS NLU BRIDGE v1.1 GOD MODE (HYBRID SOVEREIGN)
 * Natural Language Understanding Layer for Gestia / FixGo / Jarvis Sovereign Core
 * =====================================================================================
 * MISIÓN:
 * Traducir lenguaje humano real -> comandos limpios para Intent Engine V3.1
 * + FALLBACK INTELIGENTE (NO rompe flujo)
 * -------------------------------------------------------------------------------------
 */

import { JarvisMemory } from "./jarvis.memory.js";
import { analyzeConversation } from "./jarvis.conversation.engine.v7.js";

const NLU_VERSION = "1.1 HYBRID SOVEREIGN";

// =====================================================================================
// NORMALIZADOR
// =====================================================================================

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s{}:,\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// =====================================================================================
// DICCIONARIOS HUMANOS
// =====================================================================================

const ACTION_MAP = {
  analyze: [
    "analiza","revisa","checa","mira","verifica",
    "echale un ojo","anda raro","anda fallando","que paso con"
  ],
  repair: [
    "repara","corrige","arregla","soluciona",
    "tronó","trono","se cayo","no sirve","falla"
  ],
  update: [
    "actualiza","modifica","cambia","ajusta"
  ],
  create: [
    "crea","genera","arma","haz"
  ],
  activate: [
    "activa","enciende","habilita"
  ],
  deactivate: [
    "desactiva","apaga"
  ],
  purge: [
    "limpia","purga","borra basura"
  ],
  status: [
    "como vamos","estado del sistema","todo bien"
  ],
  open: [
    "abre","muestrame","ver","mostrar"
  ]
};

const ENTITY_MAP = {
  pagos: ["pagos","cobros","finanzas"],
  auth: ["login","acceso","usuarios"],
  camaras: ["camaras","cctv","vigilancia"],
  tenant: ["edificio","torre","condominio"],
  firewall: ["firewall"],
  terminal: ["terminal","consola"],
  jarvis: ["jarvis","sia7"],
  main: ["main","app"],
  snapshot: ["snapshot","backup"],
  memory: ["memoria","historial"],
  tecnico: ["tecnico","tecnicos","tecs","personal"],
  system: ["sistema","system","core"]
};

const URGENCY_MAP = [
  "urge","urgente","rapido","ya","ahorita"
];

// =====================================================================================
// DETECTORES
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

function buildCleanCommand(action, entity, text) {
  if (!action) return text;

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

  let command = map[action] || "analiza";
  if (entity) command += " " + entity;

  return command.trim();
}

function splitCommands(text) {
  return text
    .split(/\s+y luego\s+|\s+y\s+|\s+despues\s+|\s+luego\s+/gi)
    .map(x => x.trim())
    .filter(Boolean);
}

// =====================================================================================
// MAIN ENGINE
// =====================================================================================

export function understand(rawInput = "") {

  const original = String(rawInput);
  const conversation = analyzeConversation(original);
  const normalized = normalize(original);
  const chunks = conversation.commands?.length
    ? conversation.commands.map(command => command.original)
    : splitCommands(normalized);

  const results = chunks.map((chunk, index) => {

    const v7 = conversation.commands?.[index];

    if (v7 && v7.confidence >= 0.7) {
      return {
        original: v7.original,
        action: v7.action,
        entity: v7.entity,
        priority: v7.priority,
        clean: v7.protocol || v7.clean,
        confidence: v7.confidence,
        fallback: false,
        reply: v7.reply,
        source: "conversation_engine_v7",
        meta: v7.meta || {}
      };
    }

    const action = detectAction(chunk);
    const entity = detectEntity(chunk);
    const priority = detectPriority(chunk);

    let fallback = false;

    // =====================================================
    // 🔥 HYBRID FALLBACK REAL
    // =====================================================
    let finalAction = action;
    let finalEntity = entity;

    if (!action || !entity) {
      fallback = true;

      console.warn("🧠 [NLU HYBRID]: fallback activo →", chunk);

      // Inferencias mínimas inteligentes
      if (!finalAction) finalAction = "ANALYZE";

      if (!finalEntity) {
        if (chunk.includes("tecnic")) finalEntity = "tecnico";
        else if (chunk.includes("pago")) finalEntity = "pagos";
        else finalEntity = "system";
      }
    }

    const clean = buildCleanCommand(finalAction, finalEntity, chunk);

    return {
      original: chunk,
      action: finalAction,
      entity: finalEntity,
      priority,
      clean: fallback ? chunk : clean,
      confidence: action && entity
        ? 0.96
        : fallback
          ? 0.55
          : 0.84,
      fallback
    };
  });

  // =====================================================================================
  // MEMORIA (ligera)
  // =====================================================================================

  JarvisMemory.dispatch({
    type: "PUSH_HISTORY",
    payload: {
      role: "user",
      message: original
    }
  });

  return {
    engine: NLU_VERSION,
    conversationEngine: conversation.version,
    reply: conversation.reply,
    raw: original,
    normalized,
    commands: results
  };
}

console.log("🧠 JARVIS NLU BRIDGE v1.1 HYBRID SOVEREIGN ONLINE");
