/**
 * ======================================================================================
 * JARVIS BRIDGE v2.0 - Stable Execution Bridge (Replay-Safe)
 * ======================================================================================
 * Función:
 * - Conectar DSL → GestiaTerminal (KernelHeberto)
 * - Mantener consistencia entre simulación y ejecución
 * - Evitar dependencias de pendingPlans del core
 * ======================================================================================
 */

export async function dispatch(command, ctx = {}, options = { simulate: true }) {
  try {
    if (!command || (!command.raw && !command.payload?.text)) {
      throw new Error("BRIDGE_INVALID_COMMAND");
    }

    if (!window.KernelHeberto) {
      throw new Error("CORE_NOT_AVAILABLE");
    }

    const inputText = command.payload?.text || command.raw;

// 🔥 INYECCIÓN ESTRUCTURAL
    const enrichedInput = `${command.action}::${inputText}`;
    console.log("🌉 [BRIDGE_DISPATCH]", {
      cmdId: command.id,
      action: command.action,
      simulate: options.simulate,
      input: enrichedInput
    });

    // 🔹 SIMULACIÓN (no ejecuta, solo preview del core)
    if (options.simulate) {
      const res = await window.KernelHeberto.execute(
        enrichedInput,
        null,
        { simulate: true }
      );

      return {
        ok: !res?.error,
        mode: "SIMULATION",
        command,
        response: res
      };
    }

    // 🔥 EJECUCIÓN REAL (MISMO INPUT → consistencia total)
    const res = await window.KernelHeberto.execute(
      enrichedInput,
      null,
      { simulate: false }
    );

    return {
      ok: !res?.error,
      mode: "EXECUTION",
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