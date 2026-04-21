/**
 * ======================================================================================
 * JARVIS BRIDGE v3.0 - CONTEXT PRESERVATION PATCH
 * ======================================================================================
 * PROBLEMA RESUELTO:
 * Antes convertía:
 *   revisa pagos -> ANALYZE::revisa pagos
 *
 * Eso destruía contexto.
 *
 * Ahora convierte:
 *   revisa pagos -> ANALYZE::payments
 *   abre camaras -> OPEN::camaras
 *   revisa login -> ANALYZE::auth
 * ======================================================================================
 */

export async function dispatch(
  command,
  ctx = {},
  options = { simulate: true }
) {
  try {

    if (
      !command ||
      (!command.raw &&
       !command.payload?.text)
    ) {
      throw new Error(
        "BRIDGE_INVALID_COMMAND"
      );
    }

    if (!window.KernelHeberto) {
      throw new Error(
        "CORE_NOT_AVAILABLE"
      );
    }

    const inputText =
      command.payload?.text ||
      command.raw ||
      "";

    /* =====================================================
       ENTITY MAP
    ===================================================== */

    const moduleMap = {
      pagos: "payments",
      cobros: "payments",
      payment: "payments",

      login: "auth",
      auth: "auth",
      acceso: "auth",

      camaras: "camaras",
      cámara: "camaras",
      camara: "camaras",
      cctv: "camaras",

      tenant: "tenant",
      edificio: "tenant",

      firewall: "security",
      seguridad: "security",

      ledger: "ledger",
      memoria: "memory"
    };

    function detectEntity(text = "") {

      const low =
        String(text)
          .toLowerCase();

      for (const key in moduleMap) {
        if (low.includes(key)) {
          return moduleMap[key];
        }
      }

      return "system";
    }

    /* =====================================================
       INPUT BUILDER
    ===================================================== */

    let enrichedInput;

    // ya protocolo
    if (
      typeof inputText === "string" &&
      inputText.includes("::")
    ) {

      enrichedInput = inputText;

    } else {

      const entity =
        detectEntity(inputText);

      enrichedInput =
        `${command.action}::${entity}`;
    }

    console.log(
      "🌉 [BRIDGE_V3]",
      {
        cmdId: command.id,
        action: command.action,
        simulate: options.simulate,
        input: enrichedInput
      }
    );

    /* =====================================================
       EXECUTOR
    ===================================================== */

    const res =
      await window.KernelHeberto.execute(
        enrichedInput,
        null,
        {
          simulate:
            options.simulate
        }
      );

    return {
      ok: !res?.error,
      mode:
        options.simulate
          ? "SIMULATION"
          : "EXECUTION",
      command,
      response: res
    };

  } catch (err) {

    console.error(
      "❌ [BRIDGE_V3_ERROR]",
      err
    );

    return {
      ok: false,
      error: true,
      message: err.message,
      command
    };
  }
}