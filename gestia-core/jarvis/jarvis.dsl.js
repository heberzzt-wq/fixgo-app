import { getMemory } from "./jarvis.memory.js";

export function toCommand(input) {
  if (!input || typeof input !== "string") {
    throw new Error("DSL_INPUT_INVALID");
  }

  const clean = input.toLowerCase().trim();

  // 🔥 DETECCIÓN DE PROTOCOLO (COMANDO PURO)
  if (input.includes("::")) {
    const actionPart = input.split("::")[0];

    return {
      id: crypto.randomUUID(),
      action: actionPart.toUpperCase(),
      raw: input,
      payload: {
        text: "" // ya no dependemos de texto
      },
      meta: { protocol: true }
    };
  }

  // 🔥 ACCIONES CORE
  const ACTION_MAP = {
    analizar: "ANALYZE",
    reparar: "REPAIR",
    actualizar: "UPDATE",
    crear: "CREATE"
  };

  // 🔥 ENTIDADES CORE
  const ENTITY_MAP = {
    modulo: "MODULE",
    módulo: "MODULE",
    usuario: "USER",
    sistema: "SYSTEM",
    edificio: "BUILDING"
  };

  // detectar acción
  let detectedAction = null;
  for (const key in ACTION_MAP) {
    if (clean.includes(key)) {
      detectedAction = ACTION_MAP[key];
      break;
    }
  }

  // detectar entidad
  let detectedEntity = null;
  for (const key in ENTITY_MAP) {
    if (clean.includes(key)) {
      detectedEntity = ENTITY_MAP[key];
      break;
    }
  }

  const mem = getMemory();

  // 🔥 MEMORIA: repetir
  if (clean.includes("igual") || clean.includes("lo mismo") || clean.includes("repitelo")) {
    if (mem.lastCommand) {
      return {
        ...mem.lastCommand,
        id: crypto.randomUUID(),
        meta: { reused: true }
      };
    }
  }

  // 🔥 MEMORIA: modificar
  if (clean.includes("cambia") || clean.includes("otro")) {
    if (mem.lastCommand) {
      let nombre = "edificio_modificado";

      const words = clean.split(" ");
      const index = words.indexOf("edificio");

      if (index !== -1 && words[index + 1]) {
        nombre = words[index + 1];
      }

      return {
        ...mem.lastCommand,
        id: crypto.randomUUID(),
        payload: {
          text: `crear edificio nombre ${nombre} tipo residencial`
        },
        meta: { modified: true }
      };
    }
  }

  // 🔥 CREACIÓN DE EDIFICIO (caso especial)
  if (clean.includes("crear") && clean.includes("edificio")) {
    let nombre = "edificio_default";

    const words = clean.split(" ");
    const index = words.indexOf("edificio");

    if (index !== -1 && words[index + 1]) {
      nombre = words[index + 1];
    }

    return {
      id: crypto.randomUUID(),
      action: "CREATE_BUILDING",
      raw: input,
      payload: {
        text: `crear edificio nombre ${nombre} tipo residencial`
      }
    };
  }

  // 🔥 ACCIONES GENERALES
  if (detectedAction) {
    const entityText = detectedEntity ? detectedEntity.toLowerCase() : "";

    return {
      id: crypto.randomUUID(),
      action: detectedAction,
      raw: input,
      payload: {
        text: `${clean} ${entityText}`.trim()
      },
      meta: { detected: true }
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