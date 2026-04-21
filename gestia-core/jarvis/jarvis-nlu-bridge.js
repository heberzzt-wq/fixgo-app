/**
 * =====================================================================================
 * JARVIS NLU BRIDGE v1.0 GOD MODE
 * Natural Language Understanding Layer for Gestia / FixGo / Jarvis Sovereign Core
 * =====================================================================================
 * MISIÓN:
 * Traducir lenguaje humano real -> comandos limpios para Intent Engine V3.1
 *
 * FLUJO:
 * Usuario habla natural
 * ↓
 * NLU interpreta contexto / modismos / urgencia / intención
 * ↓
 * output limpio
 * ↓
 * interpretarIntenciones()
 *
 * Compatible con:
 * - intent.engine.js V3.x
 * - jarvis-memory.js
 * - vision.engine.js
 * =====================================================================================
 */

import { getMemory, saveMemory } from "./jarvis-memory.js";

const NLU_VERSION = "1.0 GOD MODE";

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
    "analiza", "revisa", "checA", "checa", "mira", "verifica",
    "echale un ojo", "echale ojo", "dale una revisada",
    "anda raro", "anda fallando", "que paso con"
  ],

  repair: [
    "repara", "corrige", "arregla", "soluciona",
    "tronó", "trono", "se cayo", "caido", "caído",
    "no sirve", "falla", "fallando", "urge reparar"
  ],

  update: [
    "actualiza", "modifica", "cambia",
    "mete cambio", "ajusta", "parcha"
  ],

  create: [
    "crea", "genera", "construye",
    "haz", "levanta", "arma"
  ],

  activate: [
    "activa", "enciende", "habilita", "prende"
  ],

  deactivate: [
    "desactiva", "apaga", "deshabilita"
  ],

  purge: [
    "limpia", "purga", "borra basura", "vacía cache"
  ],

  status: [
    "como vamos", "que traemos", "que pendientes",
    "estado del sistema", "todo bien", "al cien"
  ],

  open: [
    "abre", "muestrame", "enseñame", "ponme",
    "quiero ver", "mostrar", "ver"
  ]
};

const ENTITY_MAP = {
  pagos: ["pagos", "cobros", "cuotas", "morosos", "finanzas"],
  auth: ["login", "acceso", "usuarios", "sesion"],
  camaras: ["camaras", "camara", "vigilancia", "cctv", "seguridad"],
  tenant: ["tenant", "edificio", "torre", "condominio"],
  firewall: ["firewall", "seguridad red"],
  terminal: ["terminal", "consola"],
  jarvis: ["jarvis", "sia7", "asistente"],
  main: ["main", "principal", "app"],
  snapshot: ["snapshot", "backup", "respaldo"],
  memory: ["memoria", "historial", "recuerdo"]
};

const URGENCY_MAP = [
  "urge",
  "urgente",
  "rapido",
  "rápido",
  "ya",
  "en chinga",
  "ahorita",
  "de inmediato"
];

// =====================================================================================
// HELPERS
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
    if (text.includes(normalize(word))) {
      return "CRITICAL";
    }
  }
  return "NORMAL";
}

function detectTemporal(text) {
  if (text.includes("ayer")) return "YESTERDAY";
  if (text.includes("hoy")) return "TODAY";
  if (text.includes("semana")) return "THIS_WEEK";
  if (text.includes("mes")) return "THIS_MONTH";
  return null;
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

  if (entity) {
    command += " " + entity;
  }

  return command.trim();
}

// =====================================================================================
// MULTI INTENT SPLITTER
// =====================================================================================

function splitCommands(text) {
  return text.split(/\s+y luego\s+|\s+y\s+|\s+despues\s+|\s+luego\s+/gi)
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
    const temporal = detectTemporal(chunk);

    const clean = buildCleanCommand(action, entity, chunk);

    return {
      original: chunk,
      action,
      entity,
      priority,
      temporal,
      clean,
      confidence:
        action && entity ? 0.96 :
        action ? 0.84 :
        0.55
    };
  });

  saveMemory(original, results);

  return {
    engine: NLU_VERSION,
    raw: original,
    normalized,
    commands: results
  };
}

/**
 * =====================================================================================
 * USO:
 * =====================================================================================
 *
 * const nlu = understand("Jarvis échale un ojo a pagos y luego abre cámaras");
 *
 * OUTPUT:
 *
 * {
 *   commands:[
 *     { clean:"analiza pagos" },
 *     { clean:"abre camaras" }
 *   ]
 * }
 *
 * Luego:
 *
 * interpretarIntenciones(
 *   nlu.commands.map(c => ({ raw:c.clean }))
 * );
 *
 * =====================================================================================
 */

console.log("🧠 JARVIS NLU BRIDGE v1.0 GOD MODE ONLINE");