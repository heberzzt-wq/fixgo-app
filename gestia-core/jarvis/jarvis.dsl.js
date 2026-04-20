import { getMemory } from "./jarvis.memory.js";

export function toCommand(input) {
  if (!input || typeof input !== "string") {
    throw new Error("DSL_INPUT_INVALID");
  }

  const raw = input.trim();
  const clean = raw.toLowerCase();

  // =====================================================
  // 🔥 DETECCIÓN DE PROTOCOLO (COMANDO PURO)
  // =====================================================
  if (raw.includes("::")) {
    const parts = raw.split("::");
    const actionPart = (parts[0] || "").trim().toUpperCase();
    const targetPart = (parts[1] || "").trim();

    return {
      id: crypto.randomUUID(),
      action: actionPart,
      target: targetPart || null,
      raw,
      payload: {
        text: ""
      },
      meta: {
        protocol: true
      }
    };
  }

  // =====================================================
  // 🔥 MAPAS BASE
  // =====================================================
  const ACTION_MAP = {
    analizar: "ANALYZE",
    revisa: "ANALYZE",
    revisar: "ANALYZE",

    reparar: "REPAIR",
    arregla: "REPAIR",
    corrige: "REPAIR",

    actualizar: "UPDATE",
    modifica: "UPDATE",
    cambia: "UPDATE",

    crear: "CREATE",
    genera: "CREATE",
    alta: "CREATE"
  };

  const ENTITY_MAP = {
    modulo: "MODULE",
    módulo: "MODULE",

    usuario: "USER",
    sistema: "SYSTEM",

    edificio: "BUILDING",
    torre: "BUILDING",

    archivo: "FILE",
    main: "FILE",
    proyecto: "PROJECT"
  };

  // =====================================================
  // 🔥 DETECTAR ACCIÓN
  // =====================================================
  let detectedAction = null;

  for (const key in ACTION_MAP) {
    if (clean.includes(key)) {
      detectedAction = ACTION_MAP[key];
      break;
    }
  }

  // =====================================================
  // 🔥 DETECTAR ENTIDAD
  // =====================================================
  let detectedEntity = null;

  for (const key in ENTITY_MAP) {
    if (clean.includes(key)) {
      detectedEntity = ENTITY_MAP[key];
      break;
    }
  }

  const mem = getMemory();

  // =====================================================
  // 🔥 MEMORIA: REPETIR
  // =====================================================
  if (
  clean.includes("igual") ||
  clean.includes("lo mismo") ||
  clean.includes("repitelo") ||
  clean.includes("repítelo")
) {
  if (mem.lastCommand) {
    return {
      ...mem.lastCommand,
      id: crypto.randomUUID(),
      meta: {
        reused: true
      }
    };
  }
}
    // =====================================================
    // 🔥 MEMORIA: MODIFICAR
    // =====================================================
    if (
      clean.includes("cambia") ||
      clean.includes("otro") ||
      clean.includes("nueva")
    ) {
      if (mem.lastCommand) {
        let nombre = "edificio_modificado";

        const words = clean.split(" ");
        const index = words.findIndex(
          w => w === "edificio" || w === "torre"
        );

        if (index !== -1 && words[index + 1]) {
          nombre = words[index + 1];
        }

        return {
          ...mem.lastCommand,
          id: crypto.randomUUID(),
          action: "CREATE_BUILDING",
          raw,
          target: nombre,
          payload: {
            text: `crear edificio nombre ${nombre} tipo residencial`
          },
          meta: {
            modified: true
          }
        };
      }
    }

    // =====================================================
    // 🔥 CREAR EDIFICIO (caso especial)
    // =====================================================
    if (
      clean.includes("crear") &&
      (
        clean.includes("edificio") ||
        clean.includes("torre")
      )
    ) {
      let nombre = "edificio_default";

      const words = clean.split(" ");
      const index = words.findIndex(
        w => w === "edificio" || w === "torre"
      );

      if (index !== -1 && words[index + 1]) {
        nombre = words[index + 1];
      }

      return {
        id: crypto.randomUUID(),
        action: "CREATE_BUILDING",
        raw,
        target: nombre,
        payload: {
          name: nombre,
          text: `crear edificio nombre ${nombre} tipo residencial`
        },
        meta: {
          detected: true
        }
      };
    }

    // =====================================================
    // 🔥 ANALYZE MODULO / ARCHIVO / MAIN
    // =====================================================
    if (detectedAction === "ANALYZE") {
      let target = "system";

      const words = clean.split(" ");

      const triggers = [
        "modulo",
        "módulo",
        "archivo",
        "main",
        "proyecto"
      ];

      for (let i = 0; i < words.length; i++) {
        if (triggers.includes(words[i]) && words[i + 1]) {
          target = words[i + 1];
          break;
        }
      }

      return {
        id: crypto.randomUUID(),
        action: "ANALYZE",
        raw,
        target,
        payload: {
          target,
          text: raw
        },
        meta: {
          detected: true,
          cognitive: true
        }
      };
    }

    // =====================================================
    // 🔥 ACCIONES GENERALES
    // =====================================================
    if (detectedAction) {
      const entityText = detectedEntity
        ? detectedEntity.toLowerCase()
        : "";

      return {
        id: crypto.randomUUID(),
        action: detectedAction,
        raw,
        target: entityText || null,
        payload: {
          text: `${clean} ${entityText}`.trim()
        },
        meta: {
          detected: true
        }
      };
    }

    // =====================================================
    // 🔥 FALLBACK
    // =====================================================
    return {
      id: crypto.randomUUID(),
      action: "RAW_INPUT",
      raw,
      target: null,
      payload: {
        text: raw
      }
    };
}