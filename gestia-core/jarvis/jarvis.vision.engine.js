/**
 * =====================================================================================
 * JARVIS VISION ENGINE v1.0
 * Cognitive Resolver for Gestia / FixGo Architecture
 * =====================================================================================
 */

export function analyzeIntent(rawInput = "") {
  const text = String(rawInput).toLowerCase().trim();

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
    suggestions: []
  };

  if (!text) {
    return result;
  }

  // =====================================================
  // 🔥 PRIORIDAD
  // =====================================================
  if (
    text.includes("urge") ||
    text.includes("urgente") ||
    text.includes("caido") ||
    text.includes("caído") ||
    text.includes("falla grave") ||
    text.includes("tronó")
  ) {
    result.priority = "CRITICAL";
  }

  // =====================================================
  // 🔥 INTENCIONES
  // =====================================================
  if (
    text.includes("analiza") ||
    text.includes("revisa") ||
    text.includes("audita") ||
    text.includes("checa")
  ) {
    result.intent = "ANALYZE";
    result.action = "inspect";
    result.confidence += 35;
  }

  if (
    text.includes("repara") ||
    text.includes("corrige") ||
    text.includes("arregla") ||
    text.includes("soluciona")
  ) {
    result.intent = "REPAIR";
    result.action = "fix";
    result.confidence += 35;
  }

  if (
    text.includes("actualiza") ||
    text.includes("modifica") ||
    text.includes("cambia")
  ) {
    result.intent = "UPDATE";
    result.action = "patch";
    result.confidence += 35;
  }

  if (
    text.includes("crea") ||
    text.includes("genera") ||
    text.includes("construye")
  ) {
    result.intent = "CREATE";
    result.action = "build";
    result.confidence += 35;
  }

  // =====================================================
  // 🔥 MÓDULOS REALES DE TU STACK
  // =====================================================
  const modules = {
    pagos: "payments.engine.js",
    payment: "payments.engine.js",
    cobro: "payments.engine.js",

    auth: "core_auth_tenant_v1.js",
    login: "core_auth_tenant_v1.js",
    acceso: "core_auth_tenant_v1.js",

    firewall: "firewall.engine.js",
    seguridad: "firewall.engine.js",

    tenant: "core_tenant_resolver_v2.js",

    intent: "intent.engine.js",

    semantico: "semantic.engine.js",
    semántico: "semantic.engine.js",

    terminal: "gestia-terminal.js",

    jarvis: "jarvis.orchestrator.js",

    snapshot: "jarvis.snapshot.js",

    dsl: "jarvis.dsl.js",

    main: "app-main.js",

    edificio: "building.module.js",

    ledger: "gestia_ledger",

    financiero: "gestia_financial_ledger"
  };

  for (const key in modules) {
    if (text.includes(key)) {
      result.module = key;
      result.targetFile = modules[key];
      result.confidence += 45;
      break;
    }
  }

  // =====================================================
  // 🔥 TAGS TÉCNICOS
  // =====================================================
  if (text.includes("error")) result.tags.push("error");
  if (text.includes("bug")) result.tags.push("bug");
  if (text.includes("lento")) result.tags.push("performance");
  if (text.includes("firebase")) result.tags.push("firebase");
  if (text.includes("ui")) result.tags.push("frontend");
  if (text.includes("backend")) result.tags.push("backend");

  // =====================================================
  // 🔥 SUGERENCIAS
  // =====================================================
  if (result.intent === "ANALYZE") {
    result.suggestions.push("Leer logs recientes");
    result.suggestions.push("Validar dependencias");
    result.suggestions.push("Buscar operaciones fallidas");
  }

  if (result.intent === "REPAIR") {
    result.suggestions.push("Crear snapshot previo");
    result.suggestions.push("Aplicar rollback seguro");
    result.suggestions.push("Revalidar módulo");
  }

  if (result.intent === "UPDATE") {
    result.suggestions.push("Versionar cambio");
    result.suggestions.push("Ejecutar simulación");
  }

  if (result.intent === "CREATE") {
    result.suggestions.push("Validar permisos");
    result.suggestions.push("Registrar en ledger");
  }

  // =====================================================
  // 🔥 AJUSTE FINAL
  // =====================================================
  if (result.confidence > 100) {
    result.confidence = 100;
  }

  return result;
}