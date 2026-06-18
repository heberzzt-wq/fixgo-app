import { JarvisMemory } from "./jarvis.memory.js";
import { analyzeIntent } from "./jarvis.vision.engine.js";

export function toCommand(input) {

  if (!input) {
    throw new Error("DSL_INPUT_INVALID");
  }

  // 🔥 FIX: soportar objeto
  if (typeof input !== "string") {

    if (typeof input === "object") {
      input = `${input.intent || "ANALYZE"}::${input.target || "system"}`;
    } else {
      throw new Error("DSL_INPUT_INVALID");
    }
  }

  const raw = input.trim();
  const clean = raw.toLowerCase();

  // =====================================================
  // 🔥 PROTOCOLO DIRECTO
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
    inspecciona: "ANALYZE",

    reparar: "REPAIR",
    arregla: "REPAIR",
    corrige: "REPAIR",
    soluciona: "REPAIR",

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
    proyecto: "PROJECT",

    pagos: "MODULE",
    cobranza: "MODULE",
    login: "MODULE"
  };

  // =====================================================
  // 🔥 DETECCIÓN ACCIÓN
  // =====================================================
  let detectedAction = null;

  for (const key in ACTION_MAP) {
    if (clean.includes(key)) {
      detectedAction = ACTION_MAP[key];
      break;
    }
  }

  // =====================================================
  // 🔥 DETECCIÓN ENTIDAD
  // =====================================================
  let detectedEntity = null;

  for (const key in ENTITY_MAP) {
    if (clean.includes(key)) {
      detectedEntity = ENTITY_MAP[key];
      break;
    }
  }

  // =====================================================
  // 🧠 CONEXIÓN AL KERNEL V4
  // =====================================================
  const fullState = JarvisMemory.getState();
  const lastCommand = fullState.execution.lastCommand;

  // =====================================================
  // 🔥 MEMORIA REPETIR
  // =====================================================
  if (
    clean.includes("igual") ||
    clean.includes("lo mismo") ||
    clean.includes("repitelo") ||
    clean.includes("repítelo")
  ) {
    if (lastCommand) {
      return {
        ...lastCommand,
        id: crypto.randomUUID(),
        meta: {
          reused: true
        }
      };
    }
  }

  // =====================================================
  // 🔥 MEMORIA MODIFICAR
  // =====================================================
  if (
    clean.includes("cambia") ||
    clean.includes("otro") ||
    clean.includes("nueva")
  ) {
    if (lastCommand) {
      let nombre = "edificio_modificado";

      const words = clean.split(" ");
      const index = words.findIndex(
        w => w === "edificio" || w === "torre"
      );

      if (index !== -1 && words[index + 1]) {
        nombre = words[index + 1];
      }

      return {
        ...lastCommand,
        id: crypto.randomUUID(),
        action: "CREATE_BUILDING",
        raw,
        target: nombre,
        payload: {
          name: nombre,
          text: `crear edificio nombre ${nombre}`
        },
        meta: {
          modified: true
        }
      };
    }
  }

  // =====================================================
  // 🔥 CREAR EDIFICIO
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
        text: raw
      },
      meta: {
        detected: true
      }
    };
  }

  /* =====================================================
    SECCIÓN: DSL ANALYZE (V5.19 DATA-DRIVEN)
    Archivo: jarvis.dsl.js
===================================================== */
if (rawLower === "analyze") {
    console.log("🔥 [DSL_HIT] ANALYZE detectado en Capa DSL");

    const payload = extraerPayload(cmd.raw) || {};
    const entity = (payloadPart || payload.entity || "system")
        .trim()
        .toLowerCase();

    // 🧠 RECOLECCIÓN DE MÉTRICAS EN TIEMPO REAL
    let systemData = null;
    
    if (entity === "system") {
        systemData = {
            online: navigator.onLine,
            timestamp: Date.now(),
            // Extraemos ops del buffer global de Jarvis
            ops: (window.JarvisHistory ? window.JarvisHistory.length : 0),
            // Cálculo de memoria JS Heap para el entorno de Cancún
            memory: performance?.memory?.usedJSHeapSize 
                ? (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + " MB" 
                : "N/A"
        };
    }

    interpretedPlan.push({
        intent: "ANALYZE",
        action: "ANALYZE",
        entity: entity,
        target: payload.target || entity,
        // ✅ CLAVE: Definimos el tipo para que composeResponse lo reconozca
        type: entity === "system" ? "SYSTEM_STATUS" : "GENERAL_ANALYZE",
        data: systemData, 
        payload,
        confidence: 1,
        summary: entity === "system" 
            ? "Reporte técnico del núcleo generado." 
            : `Análisis de ${entity}`
    });

    return;
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
        text: raw
      },
      meta: {
        detected: true
      }
    };
  }

  // =====================================================
  // 🧠 ACTIVACIÓN DEL CEREBRO IA
  // =====================================================
  try {
    const ai = analyzeIntent(raw);

    if (ai && ai.action) {
      return {
        id: crypto.randomUUID(),
        action: ai.action,
        raw,
        target: ai.target || null,
        payload: ai.payload || {
          text: raw
        },
        meta: {
          cognitive: true,
          ai: true
        }
      };
    }
  } catch (err) {
    console.warn("🧠 [VISION_FAIL]", err.message);
  }

  // =====================================================
  // 🔥 FALLBACK FINAL
  // =====================================================
  return {
    id: crypto.randomUUID(),
    action: "RAW_INPUT",
    raw,
    target: null,
    payload: {
      text: raw
    },
    meta: {
      fallback: true
    }
  };
}

