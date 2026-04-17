export async function dispatch(command, ctx = {}, options = { simulate: true }) {
  try {
    if (!window.KernelHeberto) {
      throw new Error("CORE_NOT_AVAILABLE");
    }

    // 🔑 SIMULACIÓN: usa el texto normalizado (DSL)
    if (options.simulate) {
      const res = await window.KernelHeberto.execute(
        command.payload?.text || command.raw,
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

    // 🔥 CONFIRMACIÓN REAL:
    // NO mandes el texto otra vez → manda una palabra de aprobación
    const res = await window.KernelHeberto.execute(
      "confirmar", // o "ok", "si"
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