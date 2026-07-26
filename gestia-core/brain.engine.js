/**
 * ======================================================================================
 * GESTIAPREMIUM 2026
 * BRAIN ENGINE V7.5
 * HYBRID COGNITIVE REASONING CORE
 * ======================================================================================
 * IDENTIDAD:
 * NÃºcleo hÃ­brido de razonamiento autÃ³nomo.
 * Combina:
 *
 * âœ” CogniciÃ³n local
 * âœ” Contexto runtime
 * âœ” IA externa
 * âœ” Memoria viva
 * âœ” PlaneaciÃ³n operativa
 * âœ” Inferencia semÃ¡ntica
 * âœ” TelemetrÃ­a cognitiva
 * âœ” OrquestaciÃ³n runtime
 *
 * ======================================================================================
 */

import { auth } from "../firebase.js";

import {

  sincronizarCorralSemantico,
  getSemanticCognitiveState

} from "./semantic.engine.js?v=sia7-model-context-v8-20260714";

import { JarvisMemory }
from "./jarvis/jarvis.memory.js";

import {

  buildJarvisMultifunctionToolCalls,
  mergeJarvisToolCalls

} from "./jarvis/jarvis.multifunction.planner.js?v=sia7-specialized-tool-scope-v91-20260726";

import {

  runCommandCenter,
  runSentinel,
  runLiveQuery

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

  TOOL_PLANNER_ENABLED: false,

  FETCH_TIMEOUT_MS: 35000,

  MAX_RETRIES: 2,

  BREAKER_COOLDOWN_MS: 15000,

  MAX_DEPTH: 10,

  MAX_STRING: 6000,

  MAX_ARRAY: 80
};

function isNonRetryableCloudFetchError(error = {}) {
  const message =
    String(
      error?.message ||
      error ||
      ""
    )
      .toLowerCase();

  const name =
    String(
      error?.name ||
      ""
    )
      .toLowerCase();

  return (
    name === "typeerror" &&
    (
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("load failed")
    )
  );
}

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

    `%cðŸ§  [BRAIN:${type}]`,

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



const SEMANTIC_READ_ONLY_REPO_TOOLS =
  new Set([
    "repo.scan",
    "repo.search",
    "repo.grep",
    "repo.read",
    "repo.diagnose",
    "repo.impact",
    "repo.graph",
    "repo.rankCandidates",
    "repo.architectReview"
  ]);

const SEMANTIC_READ_ONLY_MULTIFUNCTION_TOOLS =
  new Set([
    "conversation.respond",
    "system.capabilities",
    "system.forensics",
    "system.health",
    "system.supervision",
    "business.assist",
    "marketing.plan",
    "page.plan",
    "image.plan",
    "reel.plan",
    "media.analyze"
  ]);

const SEMANTIC_READ_ONLY_TOOLS =
  new Set([
    ...SEMANTIC_READ_ONLY_REPO_TOOLS,
    ...SEMANTIC_READ_ONLY_MULTIFUNCTION_TOOLS
  ]);

const SEMANTIC_GENERIC_DISCOVERY_TOOLS =
  new Set([
    "repo.audit",
    "repo.scan"
  ]);

const SEMANTIC_TARGETED_DISCOVERY_TOOLS =
  new Set([
    "repo.search",
    "repo.grep",
    "repo.read",
    "repo.diagnose",
    "repo.impact",
    "repo.graph",
    "repo.rankCandidates",
    "repo.architectReview"
  ]);

const SEMANTIC_REPO_INVESTIGATION_CONCEPTS =
  new Set([
    "UI_DEBUG",
    "PATCH_ANALYSIS",
    "RUNTIME",
    "PERFORMANCE",
    "OPTIMIZATION",
    "REPAIR",
    "SYSTEM_ANALYSIS",
    "ARCHITECTURE"
  ]);

function normalizeSemanticPlannerText(
  value = ""
) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\s*(jarvis|heberto|gestia)[,\s:;-]*/i, "")
    .trim();
}

function extractSemanticFocusedTerms(
  objective = ""
) {
  const cleaned =
    normalizeSemanticPlannerText(
      objective
    );

  const tokens =
    cleaned
      .toLowerCase()
      .match(/[a-z0-9_./-]{6,}/g) ||
    cleaned
      .toLowerCase()
      .match(/[a-z0-9_./-]{4,}/g) ||
    [];

  return [
    ...new Set(tokens)
  ]
    .slice(0, 4);
}

function buildSemanticToolCall(
  name,
  args = {},
  reason = "LOCAL_SEMANTIC_TOOL_PLANNER"
) {
  return {
    name,
    args:
      sanitizeSemanticToolArgs(args),
    reason,
    mutates:
      false,
    approved:
      false
  };
}

function buildFocusedSemanticToolCalls(
  objective = "",
  maxToolCalls = 8
) {
  const cleanObjective =
    normalizeSemanticPlannerText(
      objective
    );

  if (!cleanObjective) {
    return [];
  }

  const focusedTerms =
    extractSemanticFocusedTerms(
      cleanObjective
    );

  const primaryTerm =
    focusedTerms[0] ||
    cleanObjective;

  const calls = [
    buildSemanticToolCall(
      "repo.rankCandidates",
      {
        query: cleanObjective,
        objective: cleanObjective,
        limit: 8
      },
      "LOCAL_SEMANTIC_EXPLAINABLE_CANDIDATE_RANKING"
    ),
    buildSemanticToolCall(
      "repo.search",
      {
        query:
          cleanObjective,
        term:
          primaryTerm,
        maxMatches:
          80
      },
      "LOCAL_SEMANTIC_FOCUSED_DISCOVERY"
    ),
    ...focusedTerms.map(term =>
      buildSemanticToolCall(
        "repo.grep",
        {
          term,
          maxMatches:
            80
        },
        "LOCAL_SEMANTIC_FOCUSED_DISCOVERY"
      )
    )
  ];

  return calls.slice(
    0,
    Math.max(
      1,
      maxToolCalls
    )
  );
}

function composeLocalInvestigationPlan(
  investigationPlan = null,
  supplementalToolCalls = []
) {
  if (!investigationPlan) {
    return null;
  }

  return {
    ...investigationPlan,
    toolCalls:
      mergeJarvisToolCalls(
        investigationPlan.toolCalls || [],
        supplementalToolCalls
      ),
    supplementalToolCalls:
      supplementalToolCalls
        .map(call => call?.name)
        .filter(Boolean),
    source:
      supplementalToolCalls.length > 0
        ? `${investigationPlan.source}+multifunction`
        : investigationPlan.source
  };
}

function isSemanticRepoInvestigation(
  semantic = {},
  input = ""
) {
  const concept =
    semantic?.primaryConcept ||
    semantic?.concept ||
    "";

  if (
    SEMANTIC_REPO_INVESTIGATION_CONCEPTS.has(
      concept
    )
  ) {
    return true;
  }

  const concepts =
    Array.isArray(semantic?.concepts)
      ? semantic.concepts
      : [];

  return concepts.some(item =>
    SEMANTIC_REPO_INVESTIGATION_CONCEPTS.has(
      item?.concept
    )
  );
}

function parseMaybeJsonPlan(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractCloudToolPlan(cloudReasoning = {}) {
  const candidates = [
    cloudReasoning?.toolPlan,
    cloudReasoning?.plan,
    cloudReasoning?.data?.toolPlan,
    cloudReasoning?.data?.plan,
    cloudReasoning?.data?.modulo_generado,
    cloudReasoning?.data?.result,
    cloudReasoning?.output,
    cloudReasoning?.data?.output,
    cloudReasoning
  ];

  for (const candidate of candidates) {
    const parsed =
      parseMaybeJsonPlan(candidate);

    const plan =
      parsed?.plan?.toolCalls
        ? parsed.plan
        : parsed;

    if (
      plan &&
      Array.isArray(plan.toolCalls)
    ) {
      return plan;
    }
  }

  return null;
}

function sanitizeSemanticToolArgs(args = {}) {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args)
  ) {
    return {};
  }

  const cleanArgs = {};

  Object
    .entries(args)
    .slice(0, 20)
    .forEach(([key, value]) => {
      if (
        typeof key !== "string" ||
        key.length > 80
      ) {
        return;
      }

      if (typeof value === "string") {
        cleanArgs[key] =
          value.slice(0, 1200);

        return;
      }

      if (
        typeof value === "number" &&
        Number.isFinite(value)
      ) {
        cleanArgs[key] =
          value;

        return;
      }

      if (typeof value === "boolean") {
        cleanArgs[key] =
          value;

        return;
      }

      if (Array.isArray(value)) {
        cleanArgs[key] = value
          .filter(item => typeof item === "string")
          .slice(0, 12)
          .map(item => item.slice(0, 300));

        return;
      }

      if (["plan", "authority"].includes(key) && value && typeof value === "object") {
        const serialized = JSON.stringify(value);
        if (serialized.length <= 15000) cleanArgs[key] = JSON.parse(serialized);
      }
    });

  return cleanArgs;
}

function normalizeCloudToolPlan(
  cloudReasoning = {},
  fallbackObjective = "",
  semantic = {}
) {
  const plan =
    extractCloudToolPlan(
      cloudReasoning
    );

  if (!plan) {
    if (
      !isSemanticRepoInvestigation(
        semantic,
        fallbackObjective
      )
    ) {
      return null;
    }

    const focusedToolCalls =
      buildFocusedSemanticToolCalls(
        fallbackObjective
      );

    if (
      focusedToolCalls.length === 0
    ) {
      return null;
    }

    return {
      intent:
        "REPO_INVESTIGATION",
      objective:
        fallbackObjective,
      toolCalls:
        focusedToolCalls,
      writeAllowed:
        false,
      requiresApprovalForWrite:
        true,
      confidence:
        semantic?.confidence ??
        null,
      source:
        "local_semantic_tool_planner_fallback"
    };
  }

  const rawToolCalls =
    Array.isArray(plan.toolCalls)
      ? plan.toolCalls
      : [];

  const requestedGenericDiscovery =
    rawToolCalls.some(call =>
      SEMANTIC_GENERIC_DISCOVERY_TOOLS.has(
        String(
          call?.name ||
          call?.tool ||
          ""
        ).trim()
      )
    );

  const requestedUnsafeOnly =
    rawToolCalls.length > 0 &&
    rawToolCalls.every(call => {
      const name =
        String(
          call?.name ||
          call?.tool ||
          ""
        ).trim();

      return (
        !SEMANTIC_READ_ONLY_TOOLS.has(name) &&
        !SEMANTIC_GENERIC_DISCOVERY_TOOLS.has(name)
      );
    });

  const toolCalls =
    rawToolCalls
      .map(call => {
        const name =
          String(
            call?.name ||
            call?.tool ||
            ""
          ).trim();

        if (
          !SEMANTIC_READ_ONLY_TOOLS.has(name) ||
          name === "repo.audit"
        ) {
          return null;
        }

        return buildSemanticToolCall(
          name,
          call?.args || {},
          "AI_SEMANTIC_TOOL_PLANNER"
        );
      })
      .filter(Boolean);

  const targetedToolCalls =
    toolCalls.filter(call =>
      SEMANTIC_TARGETED_DISCOVERY_TOOLS.has(
        call.name
      )
    );

  const shouldBuildFocusedDiscovery =
    !requestedUnsafeOnly &&
    (
      requestedGenericDiscovery ||
      (
        rawToolCalls.length === 0 &&
        plan?.intent === "REPO_INVESTIGATION"
      )
    ) &&
    targetedToolCalls.length === 0;

  const finalToolCalls =
    shouldBuildFocusedDiscovery
      ? buildFocusedSemanticToolCalls(
        plan.objective ||
        fallbackObjective
      )
      : (
        targetedToolCalls.length > 0
          ? targetedToolCalls
          : toolCalls
      );

  if (
    finalToolCalls.length === 0
  ) {
    return null;
  }

  return {
    intent:
      plan.intent ||
      "REPO_INVESTIGATION",
    objective:
      plan.objective ||
      fallbackObjective,
    toolCalls:
      finalToolCalls,
    writeAllowed:
      false,
    requiresApprovalForWrite:
      true,
    confidence:
      typeof plan.confidence === "number"
        ? plan.confidence
        : null,
    source:
      "cloud_tool_planner"
  };
}
/* ======================================================================================
   EXECUTION GRAPH EXPANDER
====================================================================================== */

function buildExecutionChain(

  inferences = [],
  semantic = {},
  contexto = {}

) {

  const chain = [];

  const pushStep = (

    step,
    target,
    priority = "NORMAL",
    cognition = {}

  ) => {

    chain.push({

      id:
        crypto.randomUUID(),

      step,

      target,

      priority,

      cognition,

      status:
        "QUEUED",

      timestamp:
        Date.now()
    });
  };

  /* ===================================================================================
     INFERENCE EXPANSION
  =================================================================================== */

  inferences.forEach(inference => {

    /* ================================================================================
       UI / DASHBOARD COGNITION
    ================================================================================ */

    if (

      inference.type ===
      "UI_ANALYSIS"

    ) {

      pushStep(

        "CHECK_HUD_RENDER",

        "jarvis-hud.js",

        "HIGH",

        {

          layer:
            "rendering",

          reasoning:
            "ui_integrity"
        }
      );

      pushStep(

        "CHECK_RUNTIME_HEALTH",

        "gestia-terminal.js",

        "HIGH",

        {

          layer:
            "runtime",

          reasoning:
            "health_validation"
        }
      );

      pushStep(

        "CHECK_EVENT_FAILURES",

        "__RUNTIME_EVENT_BUS__",

        "HIGH",

        {

          layer:
            "events",

          reasoning:
            "dispatch_validation"
        }
      );

      pushStep(

        "CHECK_RECENT_SNAPSHOTS",

        "__RUNTIME_SNAPSHOTS__",

        "NORMAL",

        {

          layer:
            "observability",

          reasoning:
            "runtime_regression_detection"
        }
      );

      pushStep(

        "CHECK_DEPENDENCY_GRAPH",

        "__DEPENDENCY_GRAPH__",

        "NORMAL",

        {

          layer:
            "graph",

          reasoning:
            "module_instability"
        }
      );

      pushStep(

        "CORRELATE_UI_TELEMETRY",

        "__COGNITIVE_BRAIN__",

        "NORMAL",

        {

          layer:
            "telemetry",

          reasoning:
            "behavioral_correlation"
        }
      );

      pushStep(

        "PROPOSE_RUNTIME_RECOVERY",

        "self-repair.engine.js",

        "HIGH",

        {

          layer:
            "recovery",

          reasoning:
            "autonomous_repair"
        }
      );
    }

    /* ================================================================================
       VOICE / MEDIA COGNITION
    ================================================================================ */

    if (

      inference.type ===
      "VOICE_REPAIR"

    ) {

      pushStep(

        "CHECK_MEDIA_ENGINE",

        "media.engine.js",

        "HIGH",

        {

          layer:
            "media",

          reasoning:
            "voice_pipeline"
        }
      );

      pushStep(

        "CHECK_TTS_ROUTING",

        "jarvis.language.core.v5.js",

        "HIGH",

        {

          layer:
            "language",

          reasoning:
            "speech_routing"
        }
      );

      pushStep(

        "CHECK_AUDIO_PERMISSIONS",

        "browser.audio.permissions",

        "NORMAL",

        {

          layer:
            "browser",

          reasoning:
            "audio_access"
        }
      );
    }

    /* ================================================================================
       PERFORMANCE COGNITION
    ================================================================================ */

    if (

      inference.type ===
      "RUNTIME_OPTIMIZATION"

    ) {

      pushStep(

        "CHECK_RUNTIME_LOAD",

        "operations.engine.js",

        "HIGH",

        {

          layer:
            "runtime",

          reasoning:
            "load_analysis"
        }
      );

      pushStep(

        "CHECK_MEMORY_PRESSURE",

        "__COGNITIVE_BRAIN__",

        "HIGH",

        {

          layer:
            "memory",

          reasoning:
            "resource_pressure"
        }
      );

      pushStep(

        "CHECK_ASYNC_QUEUE",

        "__DISPATCH_QUEUE__",

        "NORMAL",

        {

          layer:
            "dispatch",

          reasoning:
            "queue_congestion"
        }
      );
    }

    /* ================================================================================
       RECOVERY MODE
    ================================================================================ */

    if (

      inference.type ===
      "RECOVERY_MODE"

    ) {

      pushStep(

        "ENABLE_RECOVERY_PROTOCOL",

        "self-repair.engine.js",

        "CRITICAL",

        {

          layer:
            "recovery",

          reasoning:
            "autonomous_recovery"
        }
      );

      pushStep(

        "CAPTURE_RUNTIME_SNAPSHOT",

        "__RUNTIME_SNAPSHOTS__",

        "HIGH",

        {

          layer:
            "observability",

          reasoning:
            "forensic_capture"
        }
      );
    }
  });

  /* ===================================================================================
     SEMANTIC CORRELATION
  =================================================================================== */

  if (

    semantic?.primaryConcept ===
    "DASHBOARD"

  ) {

    pushStep(

      "INSPECT_DASHBOARD_MODULES",

      "app-panel.js",

      "HIGH",

      {

        layer:
          "dashboard",

        reasoning:
          "visual_integrity"
      }
    );
  }

  /* ===================================================================================
     DEDUPLICATION
  =================================================================================== */

  const seen = new Set();

  return chain.filter(step => {

    const key =
      `${step.step}_${step.target}`;

    if (seen.has(key)) {

      return false;
    }

    seen.add(key);

    return true;
  });
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
        isNonRetryableCloudFetchError(err)
      ) {
        breaker.count =
          Math.max(
            breaker.count,
            3
          );

        breaker.openUntil =
          Date.now() +
          BRAIN_CONFIG
            .BREAKER_COOLDOWN_MS;

        TENANT_BREAKERS
          .set(
            tenantId,
            breaker
          );

        emitBrainTelemetry(
          "CLOUD_COGNITION_FAIL_FAST",
          {
            operationId,
            error:
              String(
                err?.message ||
                err
              ),
            fallback:
              "local_semantic_tool_planner"
          },
          "WARNING"
        );

        break;
      }

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

    if (window.JarvisCodexV2BrainRouter?.handleCodexV2Command) {
      const codexV2Result =
        await window.JarvisCodexV2BrainRouter.handleCodexV2Command(input);

      if (codexV2Result?.handled) {
        return {
          ok: true,
          reasoning: {
            reasoningId:
              crypto.randomUUID(),

            input,

            semantic:
              null,

            inferences:
              [],

            strategicMode:
              "CODEX_V2_DIRECT_COMMAND",

            executionChain:
              [],

            toolCalls:
              [],

            semanticContext:
              null,

            cloudReasoning:
              codexV2Result,

            timestamp:
              Date.now()
          }
        };
      }
    }


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

    const inferences = [];
    const strategicMode = "PROTECTIVE";
    const executionChain = [];

    const plannerSeedToolCalls =
      await buildJarvisMultifunctionToolCalls(
        input,
        {
          ...contexto,
          semantic
        }
      );

    const toolCalls = plannerSeedToolCalls;

    const semanticPlannerHealth =
      globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ || null;

    if (
      toolCalls.length === 0 &&
      semanticPlannerHealth?.ok === false
    ) {
      throw new Error(
        semanticPlannerHealth.error ||
        semanticPlannerHealth.status ||
        "SEMANTIC_PLANNER_UNAVAILABLE"
      );
    }

    const semanticToolPlan = {
      intent: "SEMANTIC_TOOL_PLAN",
      objective: input,
      toolCalls,
      patchPreviewAllowed: false,
      renderPatchPreview: false,
      writeAllowed: false,
      requiresApprovalForWrite: true,
      source: "model_semantic_planner"
    };

    const reasoning = {

      reasoningId:
        crypto.randomUUID(),

      input,

      semantic,

      inferences,

      visionIntent: null,

            strategicMode:
        toolCalls.length > 0
          ? "TOOL_PLAN"
          : strategicMode,

      executionChain,

      toolCalls,

      semanticContext,

      cloudReasoning: null,

      cloudToolPlan: semanticToolPlan,

      semanticPlannerHealth,

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
          toolCalls.length > 0
            ? "TOOL_PLAN"
            : strategicMode,

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

  "%cðŸ§  BRAIN ENGINE V7.5 HYBRID COGNITION ONLINE",

  "background:#2e1065;color:#c4b5fd;padding:4px 12px;border-radius:6px;font-weight:bold;"
);

/* ============================================================
   Commit 23 Mega-Pack
   Safe additive block.
   ============================================================ */

(function initJarvisCodexV2BrainRouter() {
  if (window.__JARVIS_CODEX_V2_BRAIN_ROUTER__) return;
  window.__JARVIS_CODEX_V2_BRAIN_ROUTER__ = true;

  function parseApproveCommand(text) {
    const input = String(text || "").trim();
    const pending = window.JarvisCodexV2?.state?.pendingPatch;
    if (!pending?.approvalCommand || input !== pending.approvalCommand) return null;

    return {
      intent: "APPROVE_PATCH",
      file: pending.file,
      approvalCommand: input
    };
  }

  function parseWriteCommand(text) {
    const input = String(text || "").trim();
    const approved = window.JarvisCodexV2?.state?.approvedPatch;
    if (!approved?.fingerprint || input !== `EJECUTA ${approved.fingerprint}`) return null;

    return {
      intent: "WRITE_APPROVED_PATCH",
      file: approved.file,
      fingerprint: approved.fingerprint
    };
  }

  async function handleCodexV2Command(text) {
    const approve = parseApproveCommand(text);

    if (approve) {
      if (!window.JarvisCodexV2?.approvePendingPatch) {
        return {
          handled: true,
          ok: false,
          blocked: true,
          code: "CODEX_V2_RUNTIME_NOT_READY"
        };
      }

      const approval = await window.JarvisCodexV2.approvePendingPatch({
        file: approve.file,
        approvalCommand: approve.approvalCommand
      });

      return {
        handled: true,
        terminalType: "CODEX_V2_APPROVAL",
        ...approval,
        nextCommand: approval.ok
          ? `EJECUTA ${window.JarvisCodexV2?.state?.approvedPatch?.fingerprint}`
          : null
      };
    }

    const write = parseWriteCommand(text);

    if (write) {
      if (!window.JarvisCodexV2?.safeCodeWrite || !window.JarvisCodexV2?.postWriteVerify) {
        return {
          handled: true,
          ok: false,
          blocked: true,
          code: "CODEX_V2_RUNTIME_NOT_READY"
        };
      }

      const writeResult = await window.JarvisCodexV2.safeCodeWrite({
        file: write.file
      });

      if (!writeResult.ok) {
        return {
          handled: true,
          terminalType: "CODEX_V2_WRITE_BLOCKED",
          ...writeResult
        };
      }

      const verify = await window.JarvisCodexV2.postWriteVerify({
        file: write.file
      });

      let tests = {
        ok: true,
        skipped: true,
        reason: "tests.run not available"
      };

      if (verify?.ok !== false && window.JarvisToolRuntime?.execute) {
        tests =
          await window.JarvisToolRuntime.execute(
            "tests.run",
            {
              command: "ci:test"
            },
            {
              source: "codex_v2_post_write_tests_41_15"
            }
          );
      }

      return {
        handled: true,
        terminalType: "CODEX_V2_WRITE_VERIFY_TESTED",
        writeResult,
        verify,
        tests,
        testsPassed:
          tests?.ok !== false &&
          tests?.status !== "FAILED"
      };
    }

    return {
      handled: false
    };
  }

  window.JarvisCodexV2BrainRouter = {
    parseApproveCommand,
    parseWriteCommand,
    handleCodexV2Command
  };
})();
