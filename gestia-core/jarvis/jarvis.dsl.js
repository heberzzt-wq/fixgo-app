export function toCommand(input) {
  if (!input || typeof input !== "string") {
    throw new Error("DSL_INPUT_INVALID");
  }

  const clean = input.toLowerCase().trim();

  // 🔥 REGLA 1: crear edificio simple
  if (clean.includes("crear") && clean.includes("edificio")) {
    // intentar extraer nombre
    let nombre = "edificio_default";

    const match = clean.match(/torre\s?\w+/);
    if (match) {
      nombre = match[0].replace(" ", "_");
    }

    return {
      id: crypto.randomUUID(),
      action: "CREATE_BUILDING",
      raw: input,

      // 🔥 AQUÍ está la clave: formato que tu intent engine sí entiende
      payload: {
        text: `crear edificio nombre ${nombre} tipo residencial`
      }
    };
  }

  // fallback
  return {
    id: crypto.randomUUID(),
    action: "RAW_INPUT",
    raw: input,
    payload: {
      text: input
    }
  };
}