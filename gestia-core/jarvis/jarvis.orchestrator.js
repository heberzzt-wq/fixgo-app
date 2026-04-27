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
       AUTONOMOUS POLICY GATE
       EVENTOS INTERNOS + PROACTIVO SUPERVISADO
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

const nowHour =
  new Date().getHours();

const shouldAuditUI =
  weakestScore < 85;

const shouldHealthCheck =
  !online ||
  activeAlerts > 0;

const shouldMorningReport =
  nowHour >= 8 &&
  nowHour <= 10 &&
  !window.__JARVIS_MORNING_DONE__;

const humanForcedAudit =
  raw === "__AUTO_AUDIT_UI__";

const humanForcedHealth =
  raw === "__AUTO_HEALTH_CHECK__";

/* ==========================================
   PRIORIDAD #1 UI
========================================== */

if (
  humanForcedAudit ||
  shouldAuditUI
) {

  window.__JARVIS_LAST_AUTO__ =
    Date.now();

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
      shouldAuditUI
        ? "HIGH"
        : "NORMAL",
    message:
`Detecté degradación potencial en experiencia visual.

Motivo:
• Score UI bajo
• Necesidad de revisión preventiva

Acción propuesta:
• Escanear panel técnico móvil
• Detectar tarjetas sobredimensionadas
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
   PRIORIDAD #2 HEALTH
========================================== */

if (
  humanForcedHealth ||
  shouldHealthCheck
) {

  window.__JARVIS_LAST_AUTO__ =
    Date.now();

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
`Detecté condiciones para revisión técnica.

Acción propuesta:
• Revisar red
• Firebase
• Auth
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
   PRIORIDAD #3 REPORTE MATUTINO
========================================== */

if (
  shouldMorningReport
) {

  window.__JARVIS_MORNING_DONE__ =
    true;

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
`Propongo generar briefing matutino:

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
    /* =====================================================
       AUTO PRIORITY ENGINE
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
       MOTORES EXISTENTES
    ===================================================== */

    if (
      low.includes("predictor") ||
      low.includes("prediccion") ||
      low.includes("riesgo futuro")
    ) {
      return await runPredictor();
    }

    if (
      low.includes("commander") ||
      low.includes("modo comandante") ||
      low.includes("prioridades")
    ) {
      return await runCommander();
    }

    if (
      low.includes("real actions") ||
      low.includes("acciones reales") ||
      low.includes("registrar accion")
    ) {
      return await runRealActions();
    }

    if (
      low.includes("execution core") ||
      low.includes("ejecuta core") ||
      low.includes("modo ejecucion")
    ) {
      return await runExecutionCore();
    }

    if (
      low.includes("self healing") ||
      low.includes("autorreparacion") ||
      low.includes("auto reparar")
    ) {
      return await runSelfHealing();
    }

    if (
      low.includes("watchdog") ||
      low.includes("modo autonomo") ||
      low.includes("vigilancia continua")
    ) {
      return startWatchdog();
    }

    if (
      low.includes("sentinel") ||
      low.includes("vigilancia") ||
      low.includes("alertas")
    ) {
      return await runSentinel();
    }

    if (
      low.includes("command center") ||
      low.includes("centro de mando") ||
      low.includes("panel ejecutivo")
    ) {
      return await runCommandCenter();
    }

    if (
      low.includes("estado general") ||
      low.includes("sistema vivo") ||
      low.includes("firestore")
    ) {
      return await runFirestoreScan();
    }

    const live =
      await runLiveQuery(raw);

    if (live?.ok) {
      return live;
    }
/* =====================================================
    SCANNER CORE PRIORIDAD #1
===================================================== */
const vision = analyzeIntent(input);

if (
  vision.intent === "ANALYZE" &&
  vision.targetFile
) {

 const sourceMap = {
  "app-main.js": window.__APP_MAIN_SOURCE__ || "",
  "index.html": window.__INDEX_SOURCE__ || "",
  "gestia-terminal.js": window.__GESTIA_TERMINAL_SOURCE__ || "",
  "app-tecnico-b2b.js": window.__APP_TECNICO_B2B_SOURCE__ || "",
  "firewall.engine.js": window.__FIREWALL_SOURCE__ || "",
  "core_auth_tenant_v1.js": window.__AUTH_SOURCE__ || "",
  "jarvis.orchestrator.js": window.__JARVIS_ORCH_SOURCE__ || "",
  "jarvis.vision.engine.js": window.__JARVIS_VISION_SOURCE__ || "",
  "semantic.engine.js": window.__SEMANTIC_SOURCE__ || ""
};

  const source = sourceMap[vision.targetFile];

  if (source && source.length > 0) {
    const report = scanFile(vision.targetFile, String(source));
    const autofix = buildAutoFix(report);
    const autopatch = buildAutoPatch(report);
    const patchdiff = buildPatchDiff(report);

    return {
      ok: true,
      source: "SCANNER_CORE",
      mode: "ANALYSIS",
      message: `Escaneo completado: ${vision.targetFile}`,
      vision,
      report,
      autofix,
      autopatch,
      patchdiff
    };
  }
  return {
    ok: true,
    source: "SCANNER_CORE",
    mode: "ANALYSIS",
    message: `Objetivo detectado: ${vision.targetFile}`,
    vision
  };
}

/* =====================================================
    BUSINESS QUICK MODE
===================================================== */
const biz = runBusinessIntent(input);

if (biz?.ok) {
  return biz;
}

    // ============================================================================
    // STEP 1: CONFIRM MODE
    // ============================================================================

    if (confirm === true) {
      const key = Array.isArray(input) ? buildKey(input) : String(input);
      const pending = pendingConfirmations.get(key);

      if (!pending) throw new Error("CONFIRMATION_NOT_FOUND");

      if (Date.now() - pending.createdAt > CONFIRM_TTL) {
        pendingConfirmations.delete(key);
        throw new Error("CONFIRMATION_EXPIRED");
      }

      const executed = [];
      const results = [];

      try {
        for (const cmd of pending.commands) {
          let snapshot = null;
          const target = resolveTarget(cmd);

          // SNAPSHOT BEFORE MUTATION
          if (target && (cmd.action === "UPDATE" || cmd.action === "REPAIR")) {
            const tenantId = pending.ctx?.tenantId || "UXMAL39";
            const path = `tenants/${tenantId}/BUILDING/${target}`;
            snapshot = await createSnapshot(path);
          }

          // EXECUTION
          const exec = await safeDispatch(cmd, pending.ctx, false);

          if (!exec?.ok) throw new Error(exec?.message || "EXEC_FAILED");

          // 🔥 FIX: Reemplazado saveMemory por dispatch transaccional
          JarvisMemory.dispatch({
              type: 'PUSH_HISTORY',
              payload: { role: 'assistant', message: `Ejecutado con éxito: ${cmd.action}` }
          });

          executed.push({
            cmd,
            snapshot,
            response: exec.response
          });

          results.push(exec.response);
        }

        pendingConfirmations.delete(key);

        return {
          mode: "EXECUTION",
          ok: true,
          commandId: pending.ids,
          result: results,
          message: "Ejecución completada."
        };

      } catch (execErr) {
        console.error("💥 [EXEC_FAIL]", execErr.message);
        console.warn("↩️ [ROLLBACK] Starting recovery");

        // ROLLBACK
        for (let i = executed.length - 1; i >= 0; i--) {
          const item = executed[i];
          const cmd = item.cmd;

          try {
            if (cmd.action === "CREATE" || cmd.action === "CREATE_BUILDING") {
              const createdId = item.response?.id || cmd.target || cmd.payload?.name;
              if (createdId && window?.KernelHeberto?.execute) {
                await window.KernelHeberto.execute(`DELETE_BUILDING::{"id":"${createdId}"}`, null, { simulate: false });
              }
            }
            else if ((cmd.action === "UPDATE" || cmd.action === "REPAIR") && item.snapshot?.ok) {
              await restoreSnapshot(item.snapshot);
            }
          } catch (rbErr) {
            console.error("❌ [ROLLBACK_FAIL]", rbErr);
          }
        }

        pendingConfirmations.delete(key);

        return {
          ok: false,
          error: true,
          mode: "ROLLBACK",
          message: execErr.message,
          partialResults: results
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
