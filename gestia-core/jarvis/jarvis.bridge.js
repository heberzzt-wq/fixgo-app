/**
 * ======================================================================================
 * JARVIS BRIDGE v2.1 - Stable Execution Bridge (Protocol-Safe)
 * ======================================================================================
 * Función:
 * - Conectar DSL → GestiaTerminal (KernelHeberto)
 * - Soportar comandos humanos y protocolo (::)
 * - Evitar duplicación de comandos
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

    // 🔥 INYECCIÓN INTELIGENTE (CLAVE DEL FIX)
    let enrichedInput;

    if (typeof inputText === "string" && inputText.includes("::")) {
      // 👉 ya viene como protocolo → NO tocar
      enrichedInput = inputText;
    } else {
      // 👉 viene como lenguaje humano → estructurar
      enrichedInput = `${command.action}::${inputText}`;
    }

    console.log("🌉 [BRIDGE_DISPATCH]", {
      cmdId: command.id,
      action: command.action,
      simulate: options.simulate,
      input: enrichedInput
    });

    // 🔹 SIMULACIÓN
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

    // 🔥 EJECUCIÓN REAL
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