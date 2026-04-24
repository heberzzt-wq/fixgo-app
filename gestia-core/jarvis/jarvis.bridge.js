/**
 * =====================================================================================
 * JARVIS BRIDGE v3.1 - LEGACY COMPATIBILITY + CONTEXT PRESERVATION
 * =====================================================================================
 * MEJORAS:
 * ✅ Preserva contexto humano
 * ✅ Traduce acciones nuevas -> verbos entendidos por core legacy
 * ✅ Evita inspect::payments inválido
 * ✅ Compatible con simulation / execution
 *
 * EJEMPLOS:
 * revisa pagos      -> ANALYZE::payments
 * abre camaras      -> OPEN::camaras
 * corrige login     -> REPAIR::auth
 * actualiza tenant  -> UPDATE::tenant
 * ======================================================================================
 */

export async function dispatch(
  command,
  ctx = {},
  options = { simulate: true }
) {
  try {

    /* =====================================================
        VALIDACIONES
    ===================================================== */

    if (
      !command ||
      (!command.raw &&
       !command.payload?.text)
    ) {
      throw new Error("BRIDGE_INVALID_COMMAND");
    }

    if (!window.KernelHeberto) {
      throw new Error("CORE_NOT_AVAILABLE");
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
      usuarios: "auth",

      camaras: "camaras",
      cámara: "camaras",
      camara: "camaras",
      cctv: "camaras",

      tenant: "tenant",
      edificio: "tenant",
      torre: "tenant",

      firewall: "security",
      seguridad: "security",

      ledger: "ledger",
      historial: "ledger",

      memoria: "memory",
      backup: "memory"
    };

    function detectEntity(text = "") {

      const low =
        String(text).toLowerCase();

      for (const key in moduleMap) {
        if (low.includes(key)) {
          return moduleMap[key];
        }
      }

      return "system";
    }

    /* =====================================================
        ACTION MAP (FIX PRINCIPAL)
    ===================================================== */

    const actionMap = {
      inspect: "ANALYZE",
      analyze: "ANALYZE",
      revisar: "ANALYZE",

      fix: "REPAIR",
      repair: "REPAIR",
      corregir: "REPAIR",

      patch: "UPDATE",
      update: "UPDATE",
      modificar: "UPDATE",

      build: "CREATE",
      create: "CREATE",

      open: "OPEN",
      abrir: "OPEN",

      delete: "DELETE",
      remove: "DELETE"
    };

    const rawAction =
      String(command.action || "")
        .toLowerCase()
        .trim();

    const normalizedAction =
      actionMap[rawAction] ||
      "ANALYZE";

    /* =====================================================
        INPUT BUILDER
    ===================================================== */

    let enrichedInput;

    // Si ya viene protocolo no tocar
    if (
      typeof inputText === "string" &&
      inputText.includes("::")
    ) {

      enrichedInput = inputText;

    } else {

      const entity =
        detectEntity(inputText);

      enrichedInput =
        `${normalizedAction}::${entity}`;
    }

    console.log(
      "🌉 [BRIDGE_V3.1]",
      {
        cmdId: command.id,
        rawAction,
        normalizedAction,
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
      "❌ [BRIDGE_V3.1_ERROR]",
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
