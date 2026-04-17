/**
 * ======================================================================================
 * JARVIS DSL v1.0 - Command Normalization Layer
 * ======================================================================================
 * Función:
 * - Convertir input humano en comando estructurado
 * - NO ejecuta
 * - NO conoce Firebase
 * - NO conoce el core
 * ======================================================================================
 */

export function toCommand(input) {
  if (!input || typeof input !== "string") {
    throw new Error("DSL_INPUT_INVALID");
  }

  const clean = input.trim();

  if (clean.length < 2) {
    throw new Error("DSL_INPUT_TOO_SHORT");
  }

  return {
    id: crypto.randomUUID(),
    ts: Date.now(),

    // tipo base (luego lo puedes expandir)
    action: "RAW_INPUT",

    // lenguaje natural intacto
    raw: clean,

    // payload estructurable
    payload: {
      text: clean
    },

    // metadata útil para futuro
    meta: {
      source: "user",
      version: "dsl-v1"
    }
  };
}