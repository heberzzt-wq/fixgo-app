/**
 * =====================================================================================
 * JARVIS SCANNER ENGINE v1.0
 * Deep File Scanner for Gestia / FixGo
 * Lee estructura real de archivos y detecta riesgos técnicos
 * =====================================================================================
 */

export function scanFile(fileName = "", content = "") {

  const text = String(content || "");
  const linesArr = text.split(/\r?\n/);
  const lower = text.toLowerCase();

  const report = {
    file: fileName,
    type: detectType(fileName),
    lines: linesArr.length,
    chars: text.length,

    metrics: {
      imports: count(text, /import\s+/g),
      exports: count(text, /export\s+/g),
      functions: count(text, /function\s+[a-zA-Z0-9_]+\s*\(/g),
      arrowFunctions: count(text, /=>/g),
      asyncFunctions: count(text, /async\s+/g),
      awaits: count(text, /await\s+/g),
      classes: count(text, /class\s+/g),
      ifs: count(text, /\bif\s*\(/g),
      loops: count(text, /\bfor\s*\(|\bwhile\s*\(/g)
    },

    dom: {
      querySelector: count(text, /querySelector/g),
      getById: count(text, /getElementById/g),
      listeners: count(text, /addEventListener/g),
      innerHTML: count(text, /innerHTML/g),
      createElement: count(text, /createElement/g)
    },

    globals: {
      windowRefs: count(text, /window\./g),
      documentRefs: count(text, /document\./g),
      localStorage: count(text, /localStorage/g),
      sessionStorage: count(text, /sessionStorage/g)
    },

    firebase: {
      auth: count(lower, /auth/g),
      firestore: count(lower, /getdoc|updatedoc|adddoc|collection|doc\(/g),
      storage: count(lower, /uploadbytes|getdownloadurl|storage/g),
      timestamps: count(lower, /servertimestamp/g)
    },

    flags: [],

    risk: "LOW",

    recommendations: []
  };

  analyzeFlags(report, lower);
  calculateRisk(report);
  buildRecommendations(report);

  return report;
}

/* ===================================================================================== */

function detectType(name = "") {

  const file = name.toLowerCase();

  if (file.endsWith(".html")) return "HTML";
  if (file.endsWith(".css")) return "CSS";
  if (file.endsWith(".js")) return "JAVASCRIPT";
  return "UNKNOWN";
}

function count(text, regex) {
  const found = text.match(regex);
  return found ? found.length : 0;
}

/* ===================================================================================== */

function analyzeFlags(report, lower) {

  if (report.lines > 800) {
    report.flags.push("LARGE_FILE");
  }

  if (report.metrics.functions > 25) {
    report.flags.push("HIGH_FUNCTION_COUNT");
  }

  if (report.dom.listeners > 10) {
    report.flags.push("MANY_EVENT_LISTENERS");
  }

  if (report.globals.windowRefs > 8) {
    report.flags.push("GLOBAL_WINDOW_USAGE");
  }

  if (report.dom.innerHTML > 5) {
    report.flags.push("INNERHTML_HEAVY");
  }

  if (
    lower.includes("auth") &&
    lower.includes("innerhtml") &&
    lower.includes("updatedoc")
  ) {
    report.flags.push("MIXED_UI_AUTH_DB");
  }

  if (
    lower.includes("serviceworker") ||
    lower.includes("navigator.serviceworker")
  ) {
    report.flags.push("PWA_ENGINE");
  }

  if (
    lower.includes("jarvis")
  ) {
    report.flags.push("AI_MODULE");
  }
}

/* ===================================================================================== */

function calculateRisk(report) {

  let score = 0;

  score += report.lines > 800 ? 3 : 0;
  score += report.lines > 1500 ? 2 : 0;

  score += report.dom.listeners > 10 ? 2 : 0;
  score += report.globals.windowRefs > 8 ? 2 : 0;
  score += report.dom.innerHTML > 5 ? 2 : 0;

  score += report.metrics.asyncFunctions > 10 ? 2 : 0;
  score += report.metrics.awaits > 15 ? 2 : 0;

  score += report.flags.includes("MIXED_UI_AUTH_DB") ? 3 : 0;

  if (score <= 3) report.risk = "LOW";
  else if (score <= 7) report.risk = "MEDIUM";
  else if (score <= 11) report.risk = "HIGH";
  else report.risk = "CRITICAL";
}

/* ===================================================================================== */

function buildRecommendations(report) {

  if (report.flags.includes("LARGE_FILE")) {
    report.recommendations.push(
      "Separar archivo por módulos funcionales."
    );
  }

  if (report.flags.includes("MANY_EVENT_LISTENERS")) {
    report.recommendations.push(
      "Consolidar listeners con delegación de eventos."
    );
  }

  if (report.flags.includes("GLOBAL_WINDOW_USAGE")) {
    report.recommendations.push(
      "Reducir exposición global en window."
    );
  }

  if (report.flags.includes("INNERHTML_HEAVY")) {
    report.recommendations.push(
      "Migrar render a templates seguros."
    );
  }

  if (report.flags.includes("MIXED_UI_AUTH_DB")) {
    report.recommendations.push(
      "Separar UI, Auth y Firestore en capas."
    );
  }

  if (report.flags.includes("PWA_ENGINE")) {
    report.recommendations.push(
      "Validar ciclo Service Worker y caché."
    );
  }

  if (report.recommendations.length === 0) {
    report.recommendations.push(
      "Estructura estable. Sin riesgos mayores."
    );
  }
}