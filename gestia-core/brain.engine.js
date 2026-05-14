/**
 * ======================================================================================
 * GESTIAPREMIUM 2026
 * BRAIN ENGINE V7.5
 * HYBRID COGNITIVE REASONING CORE
 * ======================================================================================
 * IDENTIDAD:
 * Núcleo híbrido de razonamiento autónomo.
 * Combina:
 *
 * ✔ Cognición local
 * ✔ Contexto runtime
 * ✔ IA externa
 * ✔ Memoria viva
 * ✔ Planeación operativa
 * ✔ Inferencia semántica
 * ✔ Telemetría cognitiva
 * ✔ Orquestación runtime
 *
 * ======================================================================================
 */

import { auth } from "../firebase.js";

import {

  sincronizarCorralSemantico,
  getSemanticCognitiveState

} from "./semantic.engine.v7.js";

import { JarvisMemory }
from "./jarvis/jarvis.memory.js";

import {

  runCommandCenter,
  runSentinel,
  runLiveQuery,
  runPredictor,
  runCommander

} from "./jarvis/jarvis.firestore.engine.js";

/* ======================================================================================
   GLOBAL BRAIN MATRIX
====================================================================================== */

window.__COGNITIVE_BRAIN__ =
window.__COGNITIVE_BRAIN__ || {

  initialized: true,

  cognitionLevel: "V7.5",

  reasoningState: "ONLINE",

  strategicMode: "PROTECTIVE",

  autonomousThinking: true,

  runtimeAwareness: {

    health: 100,

    cognition: 100,

    federation: 100,

    observability: 100,

    planning: 100
  },

  activeGoals: [],

  reasoningHistory: [],

  cognitivePlans: [],

  decisionGraph: {},

  executionQueue: [],

  learningMemory: {},

  semanticCorrelations: {},

  emotionalPatterns: {},

  operationalPatterns: {},

  activeThreats: [],

  telemetry: [],

  cloudCognition: {

    connected: true,

    totalRequests: 0,

    failedRequests: 0,

    lastRequestAt: null
  },

  lastReasoning: null
};

/* ======================================================================================
   CONFIG
====================================================================================== */

const TENANT_BREAKERS =
new Map();

const BRAIN_CONFIG = {

  ENDPOINT:
    "https://us-central1-fixgo-44e4d.cloudfunctions.net/gestiaArchitectV5",

  FETCH_TIMEOUT_MS: 35000,

  MAX_RETRIES: 2,

  BREAKER_COOLDOWN_MS: 15000,

  MAX_DEPTH: 10,

  MAX_STRING: 6000,

  MAX_ARRAY: 80
};

/* ======================================================================================
   TELEMETRY
====================================================================================== */

function emitBrainTelemetry(

  type,
  payload = {},
  severity = "INFO",
  opId = "SYS"

) {

  const event = {

    type,
    payload,
    severity,
    opId,

    timestamp:
      Date.now()
  };

  console.log(

    `%c🧠 [BRAIN:${type}]`,

    "color:#a78bfa;font-weight:bold;",

    payload
  );

  window.__COGNITIVE_BRAIN__
    .telemetry
    .push(event);

  try {

    window.dispatchEvent(

      new CustomEvent(

        "gestia-terminal-state",

        {

          detail: {

            step:
              `BRAIN:${type}`,

            details:
              payload,

            severity,

            opId,

            modulo:
              "BRAIN_ENGINE",

            timestamp:
              Date.now()
          }
        }
      )
    );

  } catch(err) {

    console.warn(
      "BRAIN_TELEMETRY_FAIL",
      err
    );
  }
}

/* ======================================================================================
   HELPERS
====================================================================================== */

function sleep(ms = 1000) {

  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

/* ======================================================================================
   DEEP SANITIZER
====================================================================================== */

function sanitize(

  obj,
  depth = 0

) {

  if (
    depth >
    BRAIN_CONFIG.MAX_DEPTH
  ) {

    return "[MAX_DEPTH]";
  }

  if (

    obj === null ||
    typeof obj === "undefined"

  ) {

    return undefined;
  }

  if (

    typeof obj === "function"

  ) {

    return undefined;
  }

  if (

    typeof obj === "string"

  ) {

    return obj.length >
      BRAIN_CONFIG.MAX_STRING

      ? obj.slice(
          0,
          BRAIN_CONFIG.MAX_STRING
        ) + "...[CUT]"

      : obj;
  }

  if (
    Array.isArray(obj)
  ) {

    return obj
      .slice(
        0,
        BRAIN_CONFIG.MAX_ARRAY
      )
      .map(item =>
        sanitize(
          item,
          depth + 1
        )
      )
      .filter(Boolean);
  }

  if (
    typeof obj === "object"
  ) {

    const clean = {};

    for (const [k, v] of Object.entries(obj)) {

      const safe =
        sanitize(
          v,
          depth + 1
        );

      if (
        typeof safe !==
        "undefined"
      ) {

        clean[k] = safe;
      }
    }

    return clean;
  }

  return obj;
}

/* ======================================================================================
   LIVE CONTEXT ASSEMBLER
====================================================================================== */

async function buildLiveContext(

  prompt,
  contexto = {}

) {

  emitBrainTelemetry(

    "LIVE_CONTEXT_BUILD_START",

    {
      prompt
    }
  );

  const [

    board,
    alerts,
    live

  ] = await Promise.all([

    runCommandCenter()
      .catch(() => null),

    runSentinel()
      .catch(() => null),

    runLiveQuery(prompt)
      .catch(() => null)
  ]);

  let predictor = null;
  let commander = null;

  if (

    String(prompt)
      .toLowerCase()
      .includes("riesgo")

  ) {

    predictor =
      await runPredictor()
        .catch(() => null);
  }

  if (

    String(prompt)
      .toLowerCase()
      .includes("prioridad")

  ) {

    commander =
      await runCommander()
        .catch(() => null);
  }

  return {

    ...contexto,

    tenantId:

      contexto?.tenantId ||

      window?.KernelHeberto
        ?.session
        ?.tenantId ||

      "uxmal39",

    userId:

      contexto?.userId ||

      window?.KernelHeberto
        ?.session
        ?.uid ||

      null,

    kernelState:

      window?.KernelHeberto
        ?.state ||

      null,

    memory:

      JarvisMemory.getState(),

    semantic:

      getSemanticCognitiveState(),

    board,
    alerts,
    live,
    predictor,
    commander,

    browser: {

      online:
        navigator.onLine,

      ram:
        navigator.deviceMemory ||
        "ND",

      cpu:
        navigator.hardwareConcurrency ||
        "ND"
    },

    ts:
      Date.now()
  };
}

/* ======================================================================================
   COGNITIVE INFERENCE ENGINE
====================================================================================== */

function inferOperationalIntent(

  semantic

) {

  const results = [];

  const primary =
    semantic?.primaryConcept;

  const emotional =
    semantic?.emotional;

  if (primary === "DASHBOARD") {

    results.push({

      type:
        "UI_ANALYSIS",

      confidence:
        0.95
    });

    results.push({

      type:
        "VISUAL_VALIDATION",

      confidence:
        0.88
    });
  }

  if (primary === "VOICE") {

    results.push({

      type:
        "VOICE_REPAIR",

      confidence:
        0.97
    });

    results.push({

      type:
        "MEDIA_DIAGNOSTIC",

      confidence:
        0.91
    });
  }

  if (primary === "PERFORMANCE") {

    results.push({

      type:
        "RUNTIME_OPTIMIZATION",

      confidence:
        0.96
    });
  }

  if (
    emotional?.urgency
  ) {

    results.push({

      type:
        "IMMEDIATE_EXECUTION",

      confidence:
        0.99
    });
  }

  if (
    emotional?.frustration
  ) {

    results.push({

      type:
        "RECOVERY_MODE",

      confidence:
        0.93
    });
  }

  return results;
}

/* ======================================================================================
   STRATEGIC MODE
====================================================================================== */

function determineStrategicMode(

  semantic,
  inferences

) {

  if (
    semantic?.emotional
      ?.urgency
  ) {

    return "AGGRESSIVE";
  }

  if (
    semantic?.emotional
      ?.frustration
  ) {

    return "RECOVERY";
  }

  if (
    semantic?.primaryConcept ===
    "PERFORMANCE"
  ) {

    return "OPTIMIZATION";
  }

  return "PROTECTIVE";
}

/* ======================================================================================
   EXECUTION CHAIN
====================================================================================== */

function buildExecutionChain(

  inferences = []

) {

  const chain = [];

  inferences.forEach(inference => {

    switch(inference.type) {

      case "VOICE_REPAIR":

        chain.push({

          step:
            "CHECK_MEDIA_ENGINE",

          target:
            "media.engine.js",

          status:
            "QUEUED"
        });

        chain.push({

          step:
            "CHECK_TTS_ROUTING",

          target:
            "jarvis.language.core.v5.js",

          status:
            "QUEUED"
        });

      break;

      case "UI_ANALYSIS":

        chain.push({

          step:
            "CHECK_HUD_RENDER",

          target:
            "jarvis-hud.js",

          status:
            "QUEUED"
        });

      break;

      case "RUNTIME_OPTIMIZATION":

        chain.push({

          step:
            "CHECK_RUNTIME_LOAD",

          target:
            "operations.engine.js",

          status:
            "QUEUED"
        });

      break;
    }
  });

  return chain;
}

/* ======================================================================================
   CLOUD AI BRIDGE
====================================================================================== */

export async function invocarArquitectoIA(

  prompt,
  contexto = {},
  operationId = "SYS",
  maxTokens = 3200,
  authToken = null,
  targetModuloId = "jarvis",
  modo_operacion = "modulo"

) {

  const tenantId =
    contexto?.tenantId ||
    "GLOBAL";

  const breaker =
    TENANT_BREAKERS.get(
      tenantId
    ) || {

      count: 0,
      openUntil: 0
    };

  if (

    Date.now() <
    breaker.openUntil

  ) {

    throw new Error(
      "BRAIN_BREAKER_OPEN"
    );
  }

  const enriched =
    await buildLiveContext(

      prompt,
      contexto
    );

  const safeContext =
    sanitize(enriched);

  const payload = {

    id:
      operationId,

    data: {

      id:
        operationId,

      opId:
        operationId,

      prompt,

      contexto:
        safeContext,

      maxTokens,

      modulo_id:
        targetModuloId,

      modo_operacion,

      timestamp:
        Date.now()
    }
  };

  let forceRefresh = false;
  let lastError = null;

  for (

    let attempt = 0;
    attempt <= BRAIN_CONFIG.MAX_RETRIES;
    attempt++

  ) {

    const controller =
      new AbortController();

    const timer =
      setTimeout(

        () =>
          controller.abort(),

        BRAIN_CONFIG
          .FETCH_TIMEOUT_MS
      );

    try {

      let token =
        authToken;

      if (!token) {

        if (!auth.currentUser) {

          throw new Error(
            "NO_AUTH"
          );
        }

        token =
          await auth.currentUser
            .getIdToken(
              forceRefresh
            );
      }

      emitBrainTelemetry(

        "CLOUD_COGNITION_CONNECT",

        {
          operationId
        }
      );

      const res =
        await fetch(

          BRAIN_CONFIG.ENDPOINT,

          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`
            },

            body:
              JSON.stringify(
                payload
              ),

            signal:
              controller.signal
          }
        );

      clearTimeout(timer);

      if (

        res.status === 401 &&
        !forceRefresh

      ) {

        forceRefresh = true;

        throw new Error(
          "RETRY_AUTH"
        );
      }

      if (!res.ok) {

        throw new Error(
          `HTTP_${res.status}`
        );
      }

      const json =
        await res.json();

      TENANT_BREAKERS
        .delete(
          tenantId
        );

      window.__COGNITIVE_BRAIN__
        .cloudCognition
        .totalRequests++;

      window.__COGNITIVE_BRAIN__
        .cloudCognition
        .lastRequestAt =
          Date.now();

      emitBrainTelemetry(

        "CLOUD_COGNITION_SUCCESS",

        {
          operationId
        },

        "SUCCESS"
      );

      return json;

    } catch(err) {

      clearTimeout(timer);

      lastError = err;

      if (

        attempt <
        BRAIN_CONFIG.MAX_RETRIES

      ) {

        await sleep(
          (
            attempt + 1
          ) * 2000
        );

        continue;
      }
    }
  }

  breaker.count += 1;

  if (

    breaker.count >= 3

  ) {

    breaker.openUntil =
      Date.now() +
      BRAIN_CONFIG
        .BREAKER_COOLDOWN_MS;
  }

  TENANT_BREAKERS
    .set(
      tenantId,
      breaker
    );

  window.__COGNITIVE_BRAIN__
    .cloudCognition
    .failedRequests++;

  emitBrainTelemetry(

    "CLOUD_COGNITION_FAIL",

    {

      error:
        String(
          lastError?.message
        )
    },

    "ERROR"
  );

  throw lastError;
}

/* ======================================================================================
   MAIN REASONING ENGINE
====================================================================================== */

export async function runCognitiveReasoning(

  input = "",
  contexto = {}

) {

  try {

    emitBrainTelemetry(

      "COGNITIVE_REASONING_START",

      {
        input
      }
    );

    const semanticContext =
      await sincronizarCorralSemantico(
        input
      );

    const semanticState =
      getSemanticCognitiveState();

    const semantic =
      semanticState
        ?.lastSemanticResolution
        ?.semantic;

    const inferences =
      inferOperationalIntent(
        semantic
      );

    const strategicMode =
      determineStrategicMode(

        semantic,
        inferences
      );

    const executionChain =
      buildExecutionChain(
        inferences
      );

    const cloudReasoning =
      await invocarArquitectoIA(

        input,

        {

          ...contexto,

          semantic,
          inferences,
          strategicMode,
          executionChain
        },

        crypto.randomUUID()
      );

    const reasoning = {

      reasoningId:
        crypto.randomUUID(),

      input,

      semantic,

      inferences,

      strategicMode,

      executionChain,

      semanticContext,

      cloudReasoning,

      timestamp:
        Date.now()
    };

    window.__COGNITIVE_BRAIN__
      .reasoningHistory
      .push(reasoning);

    window.__COGNITIVE_BRAIN__
      .lastReasoning =
        reasoning;

    emitBrainTelemetry(

      "COGNITIVE_REASONING_COMPLETE",

      {

        mode:
          strategicMode,

        chain:
          executionChain.length
      },

      "SUCCESS"
    );

    return {

      ok: true,

      reasoning
    };

  } catch(error) {

    console.error(
      "BRAIN_REASONING_FAIL",
      error
    );

    emitBrainTelemetry(

      "COGNITIVE_REASONING_FAIL",

      {

        error:
          error.message
      },

      "ERROR"
    );

    return {

      ok: false,

      error:
        error.message
    };
  }
}

/* ======================================================================================
   LIVE BRAIN STATE
====================================================================================== */

export function
getCognitiveBrainState() {

  return {

    ok: true,

    ...(window.__COGNITIVE_BRAIN__)
  };
}

/* ======================================================================================
   GLOBAL BRIDGE
====================================================================================== */

window.runCognitiveReasoning =
runCognitiveReasoning;

window.invocarArquitectoIA =
invocarArquitectoIA;

window.getCognitiveBrainState =
getCognitiveBrainState;

/* ======================================================================================
   BOOT
====================================================================================== */

console.log(

  "%c🧠 BRAIN ENGINE V7.5 HYBRID COGNITION ONLINE",

  "background:#2e1065;color:#c4b5fd;padding:4px 12px;border-radius:6px;font-weight:bold;"
);