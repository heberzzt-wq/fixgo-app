/**
 * ======================================================================================
 * JARVIS ORCHESTRATOR v4.0 - PRODUCTION SOVEREIGN (V4 KERNEL SYNC)
 * ======================================================================================
 * REPARACIONES V4:
 * ✅ Reemplazado saveMemory por JarvisMemory.dispatch (Kernel V4 Core).
 * ✅ Actualizada la integración con jarvis-nlu-bridge.js.
 * ✅ Mantiene simulation / confirmation / rollback / snapshots.
 * ✅ Scanner Core Prioridad #1 Intacto.
 * ======================================================================================
 */

import { JarvisMemory } from "./jarvis.memory.js"; // 🔥 FIX: Importación del Kernel V4
import { toCommand } from "./jarvis.dsl.js";
import { dispatch } from "./jarvis.bridge.js";
import { understand } from "./jarvis-nlu-bridge.js";
import { runBusinessIntent } from "./jarvis.business.engine.js";
import { analyzeIntent } from "./jarvis.vision.engine.js";
import { scanFile } from "./jarvis.scanner.engine.js";
import { buildAutoFix } from "./jarvis.autofix.engine.js";
import { buildAutoPatch } from "./jarvis.autopatch.engine.js";
import { buildPatchDiff } from "./jarvis.patchdiff.engine.js";

import {
  runFirestoreScan,
  runLiveQuery,
  runCommandCenter,
  runSentinel,
  startWatchdog,
  runSelfHealing,
  runExecutionCore,
  runRealActions,
  runCommander,
  runPredictor
} from "./jarvis.firestore.engine.js";

import {
  createSnapshot,
  restoreSnapshot
} from "./jarvis.snapshot.js";

const pendingConfirmations = new Map();
const CONFIRM_TTL = 30000;

// ======================================================================================
// HELPERS
// ======================================================================================

function buildKey(ids = []) {
  return JSON.stringify(ids);
}

function isMutating(cmd) {
  return [
    "UPDATE",
    "REPAIR",
    "CREATE",
    "CREATE_BUILDING",
    "DELETE"
  ].includes(cmd.action);
}

function resolveTarget(cmd) {
  if (cmd?.target) return String(cmd.target).trim();

  if (cmd?.raw && cmd.raw.includes("::")) {
    return cmd.raw.split("::")[1]?.trim();
  }

  return null;
}

async function safeDispatch(cmd, ctx, simulate = false) {
  return await dispatch(cmd, ctx, { simulate });
}

// ======================================================================================
// MAIN
// ======================================================================================

export async function runJarvis(input, ctx = {}, confirm = false) {
  try {

    if (!input) {
      throw new Error("JARVIS_EMPTY_INPUT");
    }

    console.log(
      "🧠 [JARVIS_INPUT]",
      input
    );

    const raw =
      String(input || "").trim();

    const low =
      raw.toLowerCase();

 /* =====================================================
   AUTONOMOUS EXECUTIVE CORE
   VIDA OPERATIVA REAL + SUPERVISADO
===================================================== */

const memoryBriefing =
  window.JarvisMemory
    ?.getBriefing?.() || {};

const weakestScore =
  Number(
    memoryBriefing
      ?.weakestScore || 100
  );

const activeAlerts =
  Number(
    memoryBriefing
      ?.alerts || 0
  );

const online =
  navigator.onLine === true;

const now =
  Date.now();

const nowHour =
  new Date().getHours();

const cooldownMs =
  90000;

const lastAuto =
  Number(
    window.GestiaRuntime
      ?.state
      ?.autonomous
      ?.lastAuto || 0
  );

const coolingDown =
  now - lastAuto <
  cooldownMs;

const getPendingProposal = () =>
  window.GestiaRuntime
    ?.state
    ?.autonomous
    ?.pending;

const pendingProposal =
  !!getPendingProposal();

const humanForcedAudit =
  raw === "__AUTO_AUDIT_UI__";

const humanForcedHealth =
  raw === "__AUTO_HEALTH_CHECK__";

/* ==========================================
   SCORE ENGINE
========================================== */


const isAutonomousCommand =
  raw.startsWith("__AUTO_");

const riskScore =
  (
    (online ? 0 : 45) +
    (activeAlerts * 20) +
    (
      weakestScore < 90
        ? (90 - weakestScore)
        : 0
    )
  );

const shouldAuditUI =
  weakestScore < 85;

const shouldHealthCheck =
  !online ||
  activeAlerts > 0;

const shouldMorningReport =
  nowHour >= 8 &&
  nowHour <= 10 &&
  !window.GestiaRuntime
    ?.state
    ?.autonomous
    ?.morningDone;

const shouldDeepAudit =
  weakestScore < 75 ||
  riskScore >= 60;

  if (
  isAutonomousCommand
) {

  console.log(
    "🛡️ [AUTONOMOUS_EXECUTIVE_LOCK]",
    raw
  );
}

/* ==========================================
   EXECUTIVE LOCKS
========================================== */

if (
  pendingProposal
) {

  console.log(
    "🧠 [PENDING_PROPOSAL_ACTIVE]",
    getPendingProposal()
  );

  // Espera decisión humana
}

else if (
  coolingDown &&
  !humanForcedAudit &&
  !humanForcedHealth
) {
  // Anti spam autónomo
}

else {

/* ==========================================
   PRIORIDAD #1 INCIDENTE CRÍTICO
========================================== */

if (
  humanForcedHealth ||
  shouldHealthCheck
) {

  window.GestiaRuntime
  .state
  .autonomous
  .lastAuto = now;

  window.GestiaRuntime
  .state
  .autonomous
  .pending = {
    type: "HEALTH_CHECK",
    command:
      "__AUTO_HEALTH_CHECK__",
    priority:
      "HIGH"
  };

  return {
    ok: true,
    source:
      "AUTONOMY_ENGINE",
    mode:
      "SUPERVISED_PROPOSAL",
    requiresApproval:
      true,
    title:
      "Diagnóstico preventivo",
    priority:
      "HIGH",
    message:
`Detecté condiciones críticas.

Motivo:
• Red inestable o caída
• Alertas activas
• Riesgo operativo

Acción propuesta:
• Revisar conectividad
• Firebase/Auth
• Memoria
• Performance

Riesgo:
BAJO

Escribe:
• arre
• aprobar
• cancelar`
  };
}

/* ==========================================
   PRIORIDAD #2 UI / EXPERIENCIA
========================================== */

if (
  humanForcedAudit ||
  shouldAuditUI
) {

  window.GestiaRuntime
  .state
  .autonomous
  .lastAuto = now;

 window.GestiaRuntime
  .state
  .autonomous
  .pending = {
    type: "UI_AUDIT",
    command:
      "__AUTO_AUDIT_UI__",
    priority:
      shouldDeepAudit
        ? "HIGH"
        : "NORMAL"
  };

  return {
    ok: true,
    source:
      "AUTONOMY_ENGINE",
    mode:
      "SUPERVISED_PROPOSAL",
    requiresApproval:
      true,
    title:
      "Auditoría visual estratégica",
    priority:
      shouldDeepAudit
        ? "HIGH"
        : "NORMAL",
    message:
`Detecté degradación potencial visual.

Motivo:
• Score UI bajo
• Riesgo UX creciente

Acción propuesta:
• Escanear paneles móviles
• Detectar elementos saturados
• Generar patch responsive

Riesgo:
BAJO

Escribe:
• arre
• aprobar
• cancelar`
  };
}

/* ==========================================
   PRIORIDAD #3 REPORTE EJECUTIVO
========================================== */

if (
  shouldMorningReport
) {

  window.GestiaRuntime
  .state
  .autonomous
  .lastAuto = now;

  window.GestiaRuntime
  .state
  .autonomous
  .morningDone = true;

 window.GestiaRuntime
  .state
  .autonomous
  .pending = {
    type: "DAILY_REPORT",
    command:
      "jarvis resumen",
    priority:
      "NORMAL"
  };

  return {
    ok: true,
    source:
      "AUTONOMY_ENGINE",
    mode:
      "SUPERVISED_PROPOSAL",
    requiresApproval:
      true,
    title:
      "Reporte ejecutivo matutino",
    priority:
      "NORMAL",
    message:
`Propongo briefing operativo:

• Estado sistema
• Riesgos
• Técnicos
• Alertas
• Prioridades del día

Escribe:
• arre
• aprobar
• cancelar`
  };
}

}

if (
  getPendingProposal() &&
  [
    "arre",
    "aprobar",
    "autorizar",
    "confirmar",
    "ok",
    "dale"
  ].includes(low)
) {

  const approvedProposal =
    getPendingProposal();

  console.log(
    "🛡️ [EXECUTION_OWNERSHIP_LOCK]",
    approvedProposal
  );

  window.GestiaRuntime
    .state
    .autonomous
    .pending = null;

  return {
    ok: true,
    source:
      "AUTONOMY_EXECUTION",
    approved: true,
    proposal:
      approvedProposal
  };
}
    /* =====================================================
   AUTO PRIORITY ENGINE
   DECISIÓN CENTRAL + MOTORES + SCANNER CORE
===================================================== */

if (
  window.JarvisMemory &&
  typeof window
    .JarvisMemory
    .registerSuccess ===
    "function"
) {

  window.JarvisMemory
    .registerSuccess(
      "core",
      "runJarvis invoked"
    );
}

/* =====================================================
   SMART EXECUTIVE ROUTER
===================================================== */

const routeMap = [

  {
    match: [
      "predictor",
      "prediccion",
      "riesgo futuro"
    ],
    run: () =>
      runPredictor()
  },

  {
    match: [
      "commander",
      "modo comandante",
      "prioridades"
    ],
    run: () =>
      runCommander()
  },

  {
    match: [
      "real actions",
      "acciones reales",
      "registrar accion"
    ],
    run: () =>
      runRealActions()
  },

  {
    match: [
      "execution core",
      "ejecuta core",
      "modo ejecucion"
    ],
    run: () =>
      runExecutionCore()
  },

  {
    match: [
      "self healing",
      "autorreparacion",
      "auto reparar"
    ],
    run: () =>
      runSelfHealing()
  },

  {
    match: [
      "watchdog",
      "modo autonomo",
      "vigilancia continua"
    ],
    run: () =>
      startWatchdog()
  },

  {
    match: [
      "sentinel",
      "vigilancia",
      "alertas"
    ],
    run: () =>
      runSentinel()
  },

  {
    match: [
      "command center",
      "centro de mando",
      "panel ejecutivo"
    ],
    run: () =>
      runCommandCenter()
  },

  {
    match: [
      "estado general",
      "sistema vivo",
      "firestore"
    ],
    run: () =>
      runFirestoreScan()
  }

];

for (const item of routeMap) {

  const hit =
    item.match.some(
      term =>
        low.includes(term)
    );

  if (hit) {
    return await item.run();
  }
}

/* =====================================================
   LIVE QUERY ENGINE
===================================================== */

const live =
  await runLiveQuery(raw);

if (live?.ok) {
  return live;
}

/* =====================================================
   SCANNER CORE PRIORIDAD #1
   ANALIZA + PROPONE + APLICA PATCH SUPERVISADO
===================================================== */

const vision =
  analyzeIntent(input);

if (
  vision.intent ===
    "ANALYZE" &&
  vision.targetFile
) {

  const sourceMap = {

    "app-main.js": {
      key:
        "__APP_MAIN_SOURCE__",
      value:
        window
          .__APP_MAIN_SOURCE__ ||
        ""
    },

    "index.html": {
      key:
        "__INDEX_SOURCE__",
      value:
        window
          .__INDEX_SOURCE__ ||
        ""
    },

    "gestia-terminal.js": {
      key:
        "__GESTIA_TERMINAL_SOURCE__",
      value:
        window
          .__GESTIA_TERMINAL_SOURCE__ ||
        ""
    },

    "app-tecnico-b2b.js": {
      key:
        "__APP_TECNICO_B2B_SOURCE__",
      value:
        window
          .__APP_TECNICO_B2B_SOURCE__ ||
        ""
    },

    "firewall.engine.js": {
      key:
        "__FIREWALL_SOURCE__",
      value:
        window
          .__FIREWALL_SOURCE__ ||
        ""
    },

    "core_auth_tenant_v1.js": {
      key:
        "__AUTH_SOURCE__",
      value:
        window
          .__AUTH_SOURCE__ ||
        ""
    },

    "jarvis.orchestrator.js": {
      key:
        "__JARVIS_ORCH_SOURCE__",
      value:
        window
          .__JARVIS_ORCH_SOURCE__ ||
        ""
    },

    "jarvis.vision.engine.js": {
      key:
        "__JARVIS_VISION_SOURCE__",
      value:
        window
          .__JARVIS_VISION_SOURCE__ ||
        ""
    },

    "semantic.engine.js": {
      key:
        "__SEMANTIC_SOURCE__",
      value:
        window
          .__SEMANTIC_SOURCE__ ||
        ""
    }
  };

  const sourceObj =
    sourceMap[
      vision.targetFile
    ];

  const source =
    sourceObj?.value || "";

  if (
    source &&
    source.length > 0
  ) {

    const report =
      scanFile(
        vision.targetFile,
        String(source)
      );

    const autofix =
      buildAutoFix(
        report
      );

    const autopatch =
      buildAutoPatch(
        report
      );

    const patchdiff =
      buildPatchDiff(
        report
      );

    const wantsRepair =
      low.includes(
        "corrige"
      ) ||
      low.includes(
        "repara"
      ) ||
      low.includes(
        "arregla"
      ) ||
      low.includes(
        "fix"
      ) ||
      low.includes(
        "soluciona"
      );

    /* ==========================================
       PATCH YA APROBADO
    ========================================== */

    if (
      confirm === true &&
      window.__JARVIS_PATCH_PENDING__ &&
      window
        .__JARVIS_PATCH_PENDING__
        .file ===
        vision.targetFile
    ) {

      if (
        typeof autopatch ===
          "string" &&
        autopatch.length > 0
      ) {

        window[
          sourceObj.key
        ] = autopatch;

        window.__JARVIS_PATCH_PENDING__ =
          null;

        return {
          ok: true,
          source:
            "SCANNER_CORE",
          mode:
            "PATCH_APPLIED",
          patched:
            true,
          file:
            vision.targetFile,
          memoryKey:
            sourceObj.key,
          message:
`Corrección aplicada sobre ${vision.targetFile}`
        };
      }
    }

    /* ==========================================
       PROPUESTA SUPERVISADA
    ========================================== */

    if (
      wantsRepair &&
      typeof autopatch ===
        "string" &&
      autopatch.length > 0
    ) {

      window.__JARVIS_PATCH_PENDING__ = {
        file:
          vision.targetFile,
        key:
          sourceObj.key,
        createdAt:
          Date.now()
      };

      window.GestiaRuntime
  .state
  .autonomous
  .pending = {
        type:
          "PATCH_APPLY",
        file:
          vision.targetFile
      };

      return {
        ok: true,
        source:
          "SCANNER_CORE",
        mode:
          "SUPERVISED_PROPOSAL",
        requiresApproval:
          true,
        title:
          "Patch automático listo",
        file:
          vision.targetFile,
        report,
        autofix,
        patchdiff,
        message:
`Detecté una corrección lista para aplicar.

Archivo:
${vision.targetFile}

Acción:
Aplicar patch automático.

Escribe:
• arre
• aprobar
• cancelar`
      };
    }

    /* ==========================================
       SOLO ANÁLISIS
    ========================================== */

    return {
      ok: true,
      source:
        "SCANNER_CORE",
      mode:
        "ANALYSIS",
      file:
        vision.targetFile,
      report,
      autofix,
      autopatch,
      patchdiff,
      message:
`Escaneo completado: ${vision.targetFile}`
    };
  }

  return {
    ok: true,
    source:
      "SCANNER_CORE",
    mode:
      "ANALYSIS",
    file:
      vision.targetFile,
    message:
`Objetivo detectado: ${vision.targetFile}`
  };
}
   

/* =====================================================
   BUSINESS QUICK MODE
===================================================== */
const biz =
  runBusinessIntent(
    input
  );

if (biz?.ok) {
  return biz;
}

  // ============================================================================
// STEP 1: CONFIRM MODE
// SOBERANO UNIVERSAL + PENDING HUMAN APPROVAL
// ============================================================================

if (confirm === true) {

  /* =====================================================
     PRIORIDAD #1: AUTONOMOUS PENDING PROPOSAL
  ===================================================== */

  if (window.__JARVIS_PENDING__) {

    const proposal =
      window.__JARVIS_PENDING__;

    window.__JARVIS_PENDING__ =
      null;

    try {

      /* ==============================================
         AUTO HEALTH CHECK
      ============================================== */

      if (
        proposal.type ===
        "HEALTH_CHECK"
      ) {

        return await runJarvis(
          "__AUTO_HEALTH_CHECK__",
          ctx,
          false,
          false
        );
      }

      /* ==============================================
         AUTO UI AUDIT
      ============================================== */

      if (
        proposal.type ===
        "UI_AUDIT"
      ) {

        return await runJarvis(
          "__AUTO_AUDIT_UI__",
          ctx,
          false,
          false
        );
      }

      /* ==============================================
         DAILY REPORT
      ============================================== */

      if (
        proposal.type ===
        "DAILY_REPORT"
      ) {

        return await runJarvis(
          "jarvis resumen",
          ctx,
          false,
          false
        );
      }

      /* ==============================================
         DIRECT COMMAND EXECUTION
      ============================================== */

      if (
        proposal.command
      ) {

        return await runJarvis(
          proposal.command,
          ctx,
          false,
          false
        );
      }

      return {
        ok: true,
        mode: "CONFIRM_EXECUTED",
        message:
          "Propuesta ejecutada."
      };

    } catch (autoErr) {

      return {
        ok: false,
        error: true,
        mode: "CONFIRM_FAIL",
        message:
          autoErr.message ||
          "AUTO_EXEC_FAIL"
      };
    }
  }

  /* =====================================================
     PRIORIDAD #2: LEGACY PENDING CONFIRMATIONS
  ===================================================== */

  const key =
    Array.isArray(input)
      ? buildKey(input)
      : String(input);

  const pending =
    pendingConfirmations.get(
      key
    );

  if (!pending) {
    throw new Error(
      "CONFIRMATION_NOT_FOUND"
    );
  }

  if (
    Date.now() -
      pending.createdAt >
    CONFIRM_TTL
  ) {

    pendingConfirmations.delete(
      key
    );

    throw new Error(
      "CONFIRMATION_EXPIRED"
    );
  }

  const executed =
    [];

  const results =
    [];

  try {

    for (const cmd of pending.commands) {

      let snapshot =
        null;

      const target =
        resolveTarget(cmd);

      /* ==========================================
         SNAPSHOT BEFORE MUTATION
      ========================================== */

      if (
        target &&
        (
          cmd.action ===
            "UPDATE" ||
          cmd.action ===
            "REPAIR"
        )
      ) {

        const tenantId =
          pending.ctx
            ?.tenantId ||
          "UXMAL39";

        const path =
`tenants/${tenantId}/BUILDING/${target}`;

        snapshot =
          await createSnapshot(
            path
          );
      }

      /* ==========================================
         EXECUTION
      ========================================== */

      const exec =
        await safeDispatch(
          cmd,
          pending.ctx,
          false
        );

      if (!exec?.ok) {
        throw new Error(
          exec?.message ||
          "EXEC_FAILED"
        );
      }

      JarvisMemory.dispatch({
        type:
          "PUSH_HISTORY",
        payload: {
          role:
            "assistant",
          message:
`Ejecutado con éxito: ${cmd.action}`
        }
      });

      executed.push({
        cmd,
        snapshot,
        response:
          exec.response
      });

      results.push(
        exec.response
      );
    }

    pendingConfirmations.delete(
      key
    );

    return {
      mode:
        "EXECUTION",
      ok: true,
      commandId:
        pending.ids,
      result:
        results,
      message:
        "Ejecución completada."
    };

  } catch (execErr) {

    console.error(
      "💥 [EXEC_FAIL]",
      execErr.message
    );

    console.warn(
      "↩️ [ROLLBACK] Starting recovery"
    );

    /* ==========================================
       ROLLBACK
    ========================================== */

    for (
      let i =
        executed.length - 1;
      i >= 0;
      i--
    ) {

      const item =
        executed[i];

      const cmd =
        item.cmd;

      try {

        if (
          cmd.action ===
            "CREATE" ||
          cmd.action ===
            "CREATE_BUILDING"
        ) {

          const createdId =
            item.response?.id ||
            cmd.target ||
            cmd.payload?.name;

          if (
            createdId &&
            window
              ?.KernelHeberto
              ?.execute
          ) {

            await window
              .KernelHeberto
              .execute(
`DELETE_BUILDING::{"id":"${createdId}"}`,
                null,
                {
                  simulate:
                    false
                }
              );
          }
        }

        else if (
          (
            cmd.action ===
              "UPDATE" ||
            cmd.action ===
              "REPAIR"
          ) &&
          item.snapshot?.ok
        ) {

          await restoreSnapshot(
            item.snapshot
          );
        }

      } catch (rbErr) {

        console.error(
          "❌ [ROLLBACK_FAIL]",
          rbErr
        );
      }
    }

    pendingConfirmations.delete(
      key
    );

    return {
      ok: false,
      error: true,
      mode:
        "ROLLBACK",
      message:
        execErr.message,
      partialResults:
        results
    };
  }
}
    // ============================================================================
    // STEP 2: BUILD COMMANDS (NLU + DSL)
    // ============================================================================

    let commands = [];

    if (Array.isArray(input)) {
      commands = input;
    } else {
      // If structured DSL detected
      if (String(input).includes("::")) {
        commands = String(input).split(";;").map(x => toCommand(x.trim()));
      }
      // Natural language mode
      else {
        const nlu = understand(input);
        commands = nlu.commands.map(c => toCommand(c.clean));
      }
    }

    if (!commands.length) throw new Error("NO_COMMANDS_GENERATED");

    // ============================================================================
    // STEP 3: SIMULATION
    // ============================================================================

    const preview = [];
    for (const cmd of commands) {
      const res = await safeDispatch(cmd, ctx, true);
      if (!res?.ok) return res;
      preview.push(res.response);
    }

    const ids = commands.map(c => c.id);
    const key = buildKey(ids);

    pendingConfirmations.set(key, {
      ids,
      commands,
      ctx,
      createdAt: Date.now()
    });

    return {
      ok: true,
      mode: "SIMULATION",
      commandId: ids,
      confirmKey: key,
      preview,
      message: "Simulación lista. Esperando confirmación."
    };

  } catch (err) {
    console.error("❌ [JARVIS_ERROR]", err);
    return {
      ok: false,
      error: true,
      message: err.message
    };
  }
}


window.runBusinessIntent = runBusinessIntent;
