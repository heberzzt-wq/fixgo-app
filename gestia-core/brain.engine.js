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

} from "./semantic.engine.js";

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
   TOOL INTENT DETECTOR V7
====================================================================================== */

function buildToolCallsFromInput(
  input = "",
  contexto = {}
) {
  const rawInput =
    String(input || "");

  const text =
    rawInput
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const toolCalls =
    [];

  const fileMatch =
    text.match(
      /([a-zA-Z0-9_./-]+\.(js|html|css|json|cjs|mjs|txt|md))/i
    );

  const quotedMatch =
    rawInput.match(
      /["'“”‘’]([^"'“”‘’]{2,240})["'“”‘’]/
    );

  const searchTerm =
    quotedMatch?.[1] ||
    null;

  const targetFile =
    fileMatch?.[1]
      ?.replace(/^\.\/+/, "")
      ?.replace(/^\/+/, "")
      ?.trim() ||
    null;

  const hasTool =
    function(toolName = "") {
      return (
        window?.JarvisToolRuntime?.has?.(
          toolName
        ) === true
      );
    };

  const pushToolCall =
    function({
      name,
      args = {},
      reason = "CODEX_ROUTER",
      mutates = false,
      approved = false
    }) {
      if (!name) {
        return;
      }

      toolCalls.push({
        name,
        args,
        reason,
        mutates:
          mutates === true,
        approved:
          approved === true
      });
    };

    /* ============================================================
   JARVIS CODEX V2 — EXACT PATCH PREVIEW ROUTE
   Commit 23 Mega-Pack
   ============================================================ */

  const wantsCodexPatch =
    /^jarvis,\s*parchea\s+(.+)$/i.test(rawInput.trim());

  if (wantsCodexPatch) {
    const patchMatch =
      rawInput
        .trim()
        .match(/^jarvis,\s*parchea\s+(.+)$/i);

    const file =
      patchMatch?.[1]
        ?.trim()
        ?.replace(/^\.\/+/, "")
        ?.replace(/^\/+/, "");

    const codexPatch =
      contexto?.codexPatch || null;

    if (!file) {
      pushToolCall({
        name:
          "repo.patchPreviewExact",

        args: {
          file:
            "",
          search:
            "",
          replace:
            "",
          dryRun:
            true,
          risk:
            "blocked"
        },

        reason:
          "PATCH_BUILDER_BLOCKED_NO_FILE",

        mutates:
          false,

        approved:
          false
      });

      return toolCalls;
    }

    if (
      !codexPatch ||
      !codexPatch.search ||
      !codexPatch.replace
    ) {
      pushToolCall({
        name:
          "repo.patchPreviewExact",

        args: {
          file,
          search:
            "",
          replace:
            "",
          dryRun:
            true,
          risk:
            "blocked"
        },

        reason:
          "PATCH_BUILDER_BLOCKED_NO_EXACT_SEARCH_REPLACE",

        mutates:
          false,

        approved:
          false
      });

      return toolCalls;
    }

    pushToolCall({
      name:
        "repo.patchPreviewExact",

      args: {
        file,
        search:
          codexPatch.search,
        replace:
          codexPatch.replace,
        dryRun:
          true,
        risk:
          codexPatch.risk || "medium"
      },

      reason:
        "CODEX_V2_EXACT_PATCH_PREVIEW",

      mutates:
        false,

      approved:
        false
    });

    return toolCalls;
  }

  const wantsCiTest =
    /\b(ci:test|ci test|npm run ci:test|npm ci test|validacion completa|validación completa|prueba completa|corre todo|ejecuta todo)\b/i
      .test(text);

  const wantsSyntax =
    /\b(check:syntax|check syntax|syntax|sintaxis|validar sintaxis|revisa sintaxis|npm run check:syntax)\b/i
      .test(text);

  const wantsTests =
    /\b(test|tests|prueba|pruebas|npm test|corre los tests|ejecuta tests|ejecuta pruebas|correr pruebas)\b/i
      .test(text);

  const wantsRepoAudit =
    /\b(audita|auditar|audit|auditoria|auditoría|revisa repo|analiza repo|analiza el repo|estado del repo|diagnostico repo|diagnóstico repo)\b/i
      .test(text);

  const wantsRepoScan =
    /\b(escanea|escanear|scan|scan repo|escanea repo|estructura del repo|mapa del repo|lista archivos|listar archivos)\b/i
      .test(text);

  const wantsRepoRead =
    /\b(lee|leer|abre|abrir|muestra|mostrar|contenido de|ver archivo)\b/i
      .test(text) &&
    !!targetFile;

  const wantsRepoSearch =
    /\b(busca|buscar|search|encuentra|encontrar|localiza|localizar)\b/i
      .test(text) &&
    !!searchTerm;

  const wantsRepoImpact =
    /\b(impacto|impact|dependencias|dependents|rompe|afecta|riesgo de cambiar|que pasa si cambio|qué pasa si cambio)\b/i
      .test(text) &&
    !!targetFile;

  const wantsCodexDiagnose =
    /\b(diagnostica|diagnosticar|diagnostico|diagnóstico|analiza profundo|analisis profundo|análisis profundo|forense|revision fina|revisión fina|revisa a fondo)\b/i
      .test(text) &&
    !!targetFile;

  const wantsCodexProposal =
    /\b(propone|proponer|sugiere|sugerir|recomienda|recomendar|mejora|mejorar|optimiza|optimizar)\b/i
      .test(text) &&
    !!targetFile;

  const wantsPatchPreview =
    /\b(previsualiza patch|preview patch|patch preview|diff|parche previo|simula parche|dry run|dry-run)\b/i
      .test(text) &&
    !!targetFile;

  const wantsPatchAction =
    /\b(parchea|parchear|patch|arregla|arreglar|fix|repara|reparar|corrige|corregir)\b/i
      .test(text) &&
    !!targetFile;

  const wantsVerify =
    /\b(verifica|verificar|valida|validar|comprueba|comprobar|revisa resultado|post check|post-check)\b/i
      .test(text) &&
    !!targetFile;

  const wantsCreateFile =
    /\b(crea archivo|crear archivo|nuevo archivo|genera archivo|generar archivo)\b/i
      .test(text) &&
    !!targetFile;

  const codexMode =
    wantsCodexDiagnose
      ? "diagnose"
      : wantsCodexProposal
        ? "proposal"
        : wantsPatchAction
          ? "patch"
          : wantsPatchPreview
            ? "patch_preview"
            : wantsVerify
              ? "verify"
              : wantsCreateFile
                ? "create_file"
                : null;

                  if (
    codexMode === "create_file" &&
    targetFile
  ) {
    pushToolCall({
      name:
        "repo.write",
      args:
        {
          file:
            targetFile,
          content:
            contexto?.newFileContent || "",
          dryRun:
            true
        },
      reason:
        "CODEX_CREATE_FILE_DRY_RUN",
      mutates:
        false,
      approved:
        false
    });

    return toolCalls;
  }
  
  if (
    wantsCiTest ||
    wantsSyntax ||
    wantsTests
  ) {
    pushToolCall({
      name:
        "tests.run",
      args:
        {
          command:
            wantsCiTest
              ? "ci:test"
              : wantsSyntax
                ? "check:syntax"
                : "test",
          timeoutMs:
            wantsCiTest
              ? 120000
              : wantsSyntax
                ? 120000
                : 30000
        },
      reason:
        "USER_REQUESTED_TEST_RUN",
      mutates:
        false
    });
  }

  if (wantsRepoAudit) {
    pushToolCall({
      name:
        "repo.audit",
      args:
        {},
      reason:
        "USER_REQUESTED_REPO_AUDIT",
      mutates:
        false
    });
  }

  if (wantsRepoScan) {
    pushToolCall({
      name:
        "repo.scan",
      args:
        {},
      reason:
        "USER_REQUESTED_REPO_SCAN",
      mutates:
        false
    });
  }

  if (
    codexMode &&
    targetFile
  ) {
    pushToolCall({
      name:
        "repo.read",
      args:
        {
          file:
            targetFile,
          maxBytes:
            300000
        },
      reason:
        `CODEX_${codexMode.toUpperCase()}_READ`,
      mutates:
        false
    });

    pushToolCall({
      name:
        "repo.impact",
      args:
        {
          file:
            targetFile
        },
      reason:
        `CODEX_${codexMode.toUpperCase()}_IMPACT`,
      mutates:
        false
    });

    if (
      hasTool(
        "repo.diagnose"
      )
    ) {
      pushToolCall({
        name:
          "repo.diagnose",
        args:
          {
            file:
              targetFile,
            mode:
              codexMode,
            rawInput,
            searchTerm
          },
        reason:
          `CODEX_${codexMode.toUpperCase()}_DIAGNOSE`,
        mutates:
          false
      });
    }

    if (
  wantsPatchPreview ||
  wantsPatchAction
) {
  pushToolCall({
    name:
      "repo.patchPreview",
    args:
      {
        file:
          targetFile,
        intent:
          rawInput,
        dryRun:
          true
      },
    reason:
      wantsPatchAction
        ? "CODEX_PATCH_DRY_RUN_BEFORE_WRITE"
        : "CODEX_PATCH_PREVIEW",
    mutates:
      false
  });

  if (
    wantsPatchAction
  ) {
    pushToolCall({
      name:
        "tests.run",
      args:
        {
          command:
            "check:syntax",
          timeoutMs:
            120000
        },
      reason:
        "CODEX_POST_PATCH_VERIFY_SYNTAX",
      mutates:
        false
    });

    pushToolCall({
      name:
        "repo.read",
      args:
        {
          file:
            targetFile,
          maxBytes:
            300000
        },
      reason:
        "CODEX_POST_PATCH_READ_BACK",
      mutates:
        false
    });

    pushToolCall({
      name:
        "repo.impact",
      args:
        {
          file:
            targetFile
        },
      reason:
        "CODEX_POST_PATCH_IMPACT_BACK",
      mutates:
        false
    });
  }
}

/* ============================================================
   JARVIS CODEX V2 — BRAIN COMMAND ROUTER
   Commit 23 Mega-Pack
   ============================================================ */

(function initJarvisCodexV2BrainRouter() {
  if (window.__JARVIS_CODEX_V2_BRAIN_ROUTER__) return;
  window.__JARVIS_CODEX_V2_BRAIN_ROUTER__ = true;

  function parseApproveCommand(text) {
    const input = String(text || "").trim();

    const match = input.match(/^jarvis,\s*apruebo\s+patch\s+(.+)$/i);

    if (!match) return null;

    return {
      intent: "APPROVE_PATCH",
      file: match[1].trim()
    };
  }

  function parseWriteCommand(text) {
    const input = String(text || "").trim();

    const match = input.match(/^jarvis,\s*escribe\s+patch\s+(.+)$/i);

    if (!match) return null;

    return {
      intent: "WRITE_APPROVED_PATCH",
      file: match[1].trim()
    };
  }

  async function handleCodexV2Command(text) {
    const approve = parseApproveCommand(text);

    if (approve) {
      const approval = window.JarvisCodexV2.approvePendingPatch({
        file: approve.file
      });

      return {
        handled: true,
        terminalType: "CODEX_V2_APPROVAL",
        ...approval,
        nextCommand: approval.ok
          ? `Jarvis, escribe patch ${approve.file}`
          : null
      };
    }

    const write = parseWriteCommand(text);

    if (write) {
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

      return {
        handled: true,
        terminalType: "CODEX_V2_WRITE_VERIFY",
        writeResult,
        verify
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

    if (
      wantsVerify
    ) {
      pushToolCall({
        name:
          "tests.run",
        args:
          {
            command:
              "check:syntax",
            timeoutMs:
              120000
          },
        reason:
          "CODEX_VERIFY_SYNTAX",
        mutates:
          false
      });

      pushToolCall({
        name:
          "repo.read",
        args:
          {
            file:
              targetFile,
            maxBytes:
              300000
          },
        reason:
          "CODEX_VERIFY_READ_BACK",
        mutates:
          false
      });

      pushToolCall({
        name:
          "repo.impact",
        args:
          {
            file:
              targetFile
          },
        reason:
          "CODEX_VERIFY_IMPACT_BACK",
        mutates:
          false
      });
    }
  }

  if (
    wantsRepoRead &&
    !codexMode
  ) {
    pushToolCall({
      name:
        "repo.read",
      args:
        {
          file:
            targetFile,
          maxBytes:
            300000
        },
      reason:
        "USER_REQUESTED_REPO_READ",
      mutates:
        false
    });
  }

  if (wantsRepoSearch) {
    pushToolCall({
      name:
        "repo.grep",
      args:
        {
          query:
            searchTerm,
          term:
            searchTerm,
          maxMatches:
            80
        },
      reason:
        "USER_REQUESTED_REPO_GREP",
      mutates:
        false
    });
  }

  if (
    wantsRepoImpact &&
    !codexMode
  ) {
    pushToolCall({
      name:
        "repo.impact",
      args:
        {
          file:
            targetFile
        },
      reason:
        "USER_REQUESTED_REPO_IMPACT",
      mutates:
        false
    });
  }

  const seenTools =
    new Set();

  const dedupedToolCalls =
    toolCalls.filter(
      call => {
        const key =
          `${call.name}:${JSON.stringify(call.args || {})}`;

        if (seenTools.has(key)) {
          return false;
        }

        seenTools.add(key);

        return true;
      }
    );

  if (
    dedupedToolCalls.length > 0
  ) {
    emitBrainTelemetry(
      "CODEX_TOOLCHAIN_READY",
      {
        mode:
          codexMode ||
          "standard",
        file:
          targetFile,
        total:
          dedupedToolCalls.length,
        tools:
          dedupedToolCalls.map(
            call => call.name
          )
      }
    );
  }

  return dedupedToolCalls;
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

      inferences,

      semantic,

      contexto
    );

        const toolCalls =
      buildToolCallsFromInput(
        input,
        contexto
      );

    const cloudReasoning =
      await invocarArquitectoIA(

        input,

                {
          ...contexto,
          semantic,
          inferences,
          strategicMode:
            toolCalls.length > 0
              ? "TOOL_PLAN"
              : strategicMode,
          executionChain,
          toolCalls
        },

        crypto.randomUUID()
      );

    const reasoning = {

      reasoningId:
        crypto.randomUUID(),

      input,

      semantic,

      inferences,

            strategicMode:
        toolCalls.length > 0
          ? "TOOL_PLAN"
          : strategicMode,

      executionChain,

      toolCalls,

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

  "%c🧠 BRAIN ENGINE V7.5 HYBRID COGNITION ONLINE",

  "background:#2e1065;color:#c4b5fd;padding:4px 12px;border-radius:6px;font-weight:bold;"
);

/* ============================================================
   JARVIS CODEX V2 — BRAIN COMMAND ROUTER
   Commit 23 Mega-Pack
   Safe additive block.
   ============================================================ */

(function initJarvisCodexV2BrainRouter() {
  if (window.__JARVIS_CODEX_V2_BRAIN_ROUTER__) return;
  window.__JARVIS_CODEX_V2_BRAIN_ROUTER__ = true;

  function parseApproveCommand(text) {
    const input = String(text || "").trim();
    const match = input.match(/^jarvis,\s*apruebo\s+patch\s+(.+)$/i);

    if (!match) return null;

    return {
      intent: "APPROVE_PATCH",
      file: match[1].trim()
    };
  }

  function parseWriteCommand(text) {
    const input = String(text || "").trim();
    const match = input.match(/^jarvis,\s*escribe\s+patch\s+(.+)$/i);

    if (!match) return null;

    return {
      intent: "WRITE_APPROVED_PATCH",
      file: match[1].trim()
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

      const approval = window.JarvisCodexV2.approvePendingPatch({
        file: approve.file
      });

      return {
        handled: true,
        terminalType: "CODEX_V2_APPROVAL",
        ...approval,
        nextCommand: approval.ok
          ? `Jarvis, escribe patch ${approve.file}`
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

      return {
        handled: true,
        terminalType: "CODEX_V2_WRITE_VERIFY",
        writeResult,
        verify
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