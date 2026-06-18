/**
 * =====================================================================================
 * JARVIS NLU BRIDGE v2.0 MARKETING SOVEREIGN
 * Natural Language Understanding Layer for Gestia / FixGo / Jarvis Sovereign Core
 * =====================================================================================
 * MISIÓN:
 * Traducir lenguaje humano real -> comandos limpios para Intent Engine V3.1
 * + FALLBACK INTELIGENTE (NO rompe flujo)
 * -------------------------------------------------------------------------------------
 */

import { JarvisMemory } from "./jarvis.memory.js";

const NLU_VERSION = "2.0 MARKETING SOVEREIGN";

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
  marketing: [
    "marketing","campana","publicidad","anuncio","promociona",
    "flyer","flayer","reel","tiktok","instagram","landing","pagina web"
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
  marketing: ["marketing","campana","publicidad","contenido","marca","redes sociales"],
  landing: ["landing","pagina","web","sitio"],
  flyer: ["flyer","flayer","volante","poster","post"],
  reel: ["reel","video corto","short","tiktok"],
  instagram: ["instagram","insta","ig"],
  editable_photo: ["foto","imagen","editable","mockup"],
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
    MARKETING: "marketing",
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
  const normalized = normalize(original);
  const chunks = splitCommands(normalized);

  const results = chunks.map(chunk => {

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
        if (chunk.includes("tiktok") || chunk.includes("reel")) finalEntity = "reel";
        else if (chunk.includes("instagram") || chunk.includes("insta")) finalEntity = "instagram";
        else if (chunk.includes("flyer") || chunk.includes("flayer")) finalEntity = "flyer";
        else if (chunk.includes("landing") || chunk.includes("pagina")) finalEntity = "landing";
        else if (chunk.includes("foto") || chunk.includes("imagen")) finalEntity = "editable_photo";
        else if (chunk.includes("tecnic")) finalEntity = "tecnico";
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
    raw: original,
    normalized,
    commands: results
  };
}

console.log("🧠 JARVIS NLU BRIDGE v2.0 MARKETING SOVEREIGN ONLINE");
