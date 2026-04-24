/**
 * =====================================================================================
 * JARVIS VISION ENGINE v2.0
 * Autonomous Cognitive Resolver for Gestia / FixGo Architecture
 * Escaneo real de archivos + inferencia dinámica
 * =====================================================================================
 */

const PROJECT_INDEX = [

  // CORE
  "audit.engine.js",
  "brain.engine.js",
  "core_auth_tenant_v1.js",
  "core_tenant_resolver_v2.js",
  "data-analyzer.engine.js",
  "firewall.engine.js",
  "gestia-core.js",
  "history.engine.js",
  "intent.engine.js",
  "jarvis-hud.js",
  "media.engine.js",
  "operations-executor.engine.js",
  "operations.engine.js",
  "persistence.engine.js",
  "propose.engine.js",
  "self-repair.engine.js",
  "semantic.engine.js",

  // JARVIS
  "jarvis-nlu-bridge.js",
  "jarvis.bridge.js",
  "jarvis.business.engine.js",
  "jarvis.company.registry.js",
  "jarvis.dsl.js",
  "jarvis.memory.js",
  "jarvis.orchestrator.js",
  "jarvis.snapshot.js",
  "jarvis.vision.engine.js",

  // ROOT JS
  "alert-engine.js",
  "app-bi.js",
  "app-inquilino.js",
  "app-main.js",
  "app-panel.js",
  "app-registro.js",
  "app-tecnico-b2b.js",
  "app-utils.js",
  "firebase.js",
  "fixgo-bridge.js",
  "fixgo-core-backend.js",
  "fixgo-modals.js",
  "gestia-render.js",
  "gestia-terminal.js",
  "gps-motor.js",
  "modulo-b2b.js",
  "modulo-flotilla.js",
  "panel-admin.js",
  "panel-b2b-admin.js",
  "panel-cliente.js",
  "panel-tecnico.js",
  "scheduler_predictivo.js",
  "scheduler_rutinas.js",
  "soporte-whatsapp.js",
  "sw.js",
  "terminal-chofer.js",

  // HTML
  "admin.html",
  "app-inquilino.html",
  "b2b.html",
  "ceo.html",
  "cliente.html",
  "crm.html",
  "estres.html",
  "gestia-modulo.html",
  "gestia-terminal.html",
  "index.html",
  "login.html",
  "manual.html",
  "modulo-flotilla.html",
  "panel-b2b-admin.html",
  "politicas.html",
  "rastreo.html",
  "screenshot.html",
  "registro.html",
  "simulador.html",
  "tecnico-b2b.html",
  "tecnico.html",
  "terminal-chofer.html",
  "visor-flota.html"
];

/* ===================================================================================== */

export function analyzeIntent(rawInput = "") {

  const text = normalize(rawInput);

  const result = {
    original: rawInput,
    normalized: text,
    intent: "UNKNOWN",
    priority: "NORMAL",
    module: null,
    targetFile: null,
    action: null,
    confidence: 0,
    tags: [],
    suggestions: [],
    matches: []
  };

  if (!text) return result;

  /* =====================================================
      PRIORIDAD
  ===================================================== */

  if (
    has(text, [
      "urge",
      "urgente",
      "caido",
      "caido",
      "falla grave",
      "trono",
      "tronó"
    ])
  ) {
    result.priority = "CRITICAL";
  }

  /* =====================================================
      INTENCIONES
  ===================================================== */

  if (has(text, ["analiza", "revisa", "audita", "checa"])) {
    result.intent = "ANALYZE";
    result.action = "inspect";
    result.confidence += 30;
  }

  if (has(text, ["repara", "corrige", "arregla", "soluciona"])) {
    result.intent = "REPAIR";
    result.action = "fix";
    result.confidence += 30;
  }

  if (has(text, ["actualiza", "modifica", "cambia", "mejora", "optimiza"])) {
    result.intent = "UPDATE";
    result.action = "patch";
    result.confidence += 30;
  }

  if (has(text, ["crea", "genera", "construye", "nuevo modulo"])) {
    result.intent = "CREATE";
    result.action = "build";
    result.confidence += 30;
  }

  /* =====================================================
      SCANNER AUTÓNOMO DE ARCHIVOS
  ===================================================== */

  const ranked = [];

  for (const file of PROJECT_INDEX) {

    const score = rankFile(text, file);

    if (score > 0) {
      ranked.push({
        file,
        score
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score);

  result.matches = ranked.slice(0, 5);

  if (ranked.length > 0) {
    result.targetFile = ranked[0].file;
    result.module = cleanName(ranked[0].file);
    result.confidence += Math.min(ranked[0].score, 50);
  }

  /* =====================================================
      TAGS
  ===================================================== */

  if (has(text, ["error", "bug", "falla"])) result.tags.push("error");
  if (has(text, ["lento", "carga", "pesado"])) result.tags.push("performance");
  if (has(text, ["firebase", "firestore"])) result.tags.push("firebase");
  if (has(text, ["ui", "vista", "responsive"])) result.tags.push("frontend");
  if (has(text, ["backend", "cloud function"])) result.tags.push("backend");
  if (has(text, ["login", "auth", "permiso"])) result.tags.push("security");

  /* =====================================================
      SUGERENCIAS
  ===================================================== */

  if (result.intent === "ANALYZE") {
    result.suggestions.push("Leer archivo objetivo");
    result.suggestions.push("Buscar listeners duplicados");
    result.suggestions.push("Revisar dependencias");
    result.suggestions.push("Validar rendimiento móvil");
  }

  if (result.intent === "REPAIR") {
    result.suggestions.push("Crear snapshot previo");
    result.suggestions.push("Aplicar parche mínimo");
    result.suggestions.push("Revalidar flujo");
  }

  if (result.intent === "UPDATE") {
    result.suggestions.push("Versionar cambio");
    result.suggestions.push("Probar responsive");
    result.suggestions.push("Validar regresiones");
  }

  if (result.intent === "CREATE") {
    result.suggestions.push("Definir módulo base");
    result.suggestions.push("Crear HTML + JS");
    result.suggestions.push("Registrar navegación");
  }

  if (result.confidence > 100) {
    result.confidence = 100;
  }

  return result;
}

/* ===================================================================================== */

function normalize(str = "") {
  return String(str)
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function has(text, arr = []) {
  return arr.some(x => text.includes(x));
}

function cleanName(file = "") {
  return file
    .replace(".js", "")
    .replace(".html", "");
}

function rankFile(text, file) {

  const name = normalize(file);

  let score = 0;

  const tokens = text.split(/\s+/);

  for (const token of tokens) {
    if (token.length < 3) continue;

    if (name.includes(token)) {
      score += 20;
    }
  }

  if (text.includes("tecnico") && name.includes("tecnico")) score += 40;
  if (text.includes("b2b") && name.includes("b2b")) score += 40;
  if (text.includes("terminal") && name.includes("terminal")) score += 40;
  if (text.includes("flotilla") && name.includes("flotilla")) score += 40;
  if (text.includes("login") && name.includes("login")) score += 40;
  if (text.includes("jarvis") && name.includes("jarvis")) score += 40;
  if (text.includes("admin") && name.includes("admin")) score += 30;
  if (text.includes("cliente") && name.includes("cliente")) score += 30;

  return score;
}