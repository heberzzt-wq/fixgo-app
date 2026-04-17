/**
 * ======================================================================================
 * JARVIS BRIDGE v1.0 - Safe Execution Bridge
 * ======================================================================================
 * Función:
 * - Traducir comando → ejecución en GestiaTerminal
 * - Manejo de errores estructurado
 * - No lógica de negocio
 * ======================================================================================
 */

export async function dispatch(command, ctx = {}, options = { simulate: true }) {
  try {
    if (!command || !command.raw) {
      throw new Error("BRIDGE_INVALID_COMMAND");
    }

    if (!window.KernelHeberto) {
      throw new Error("CORE_NOT_AVAILABLE");
    }

    // Contexto mínimo requerido
    const safeCtx = {
      userId: ctx?.userId || "unknown",
      tenantId: ctx?.tenantId || "unknown"
    };

    console.log("🌉 [BRIDGE_DISPATCH]", {
      cmdId: command.id,
      action: command.action,
      simulate: options.simulate
    });

    // 🔥 LLAMADA AL CORE REAL
    const res = await window.KernelHeberto.execute(
      command.raw,
      null,
      { simulate: options.simulate }
    );

    // Respuesta estructurada
    return {
      ok: !res?.error,
      mode: options.simulate ? "SIMULATION" : "EXECUTION",
      command,
      response: res
    };

  } catch (err) {
    console.error("❌ [BRIDGE_ERROR]", err);

    return {
      ok: false,
      error: true,
      message: err.message,
      command
    };
  }
}