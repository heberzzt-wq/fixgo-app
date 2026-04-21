/**
 * ======================================================================================
 * JARVIS ORCHESTRATOR v4.0 - PRODUCTION SOVEREIGN (Built on your real base)
 * ======================================================================================
 * MEJORAS SOBRE TU v3.6:
 * ✅ Mantiene simulation / confirmation / rollback
 * ✅ Integra jarvis-nlu-bridge.js
 * ✅ Elimina FORCED_BATCH_FAIL
 * ✅ Conserva snapshots
 * ✅ Compatible con GestiaCore / bridge actual
 * ✅ Memory mejorada
 * ======================================================================================
 */

import { saveMemory } from "./jarvis.memory.js";
import { toCommand } from "./jarvis.dsl.js";
import { dispatch } from "./jarvis.bridge.js";
import { understand } from "./jarvis-nlu-bridge.js";
import { runBusinessIntent }
from "./jarvis.business.engine.js";

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

    console.log("🧠 [JARVIS_INPUT]", input);

    // ============================================================================
    // STEP 1: CONFIRM MODE
    // ============================================================================

    if (confirm === true) {
      const key = Array.isArray(input)
        ? buildKey(input)
        : String(input);

      const pending = pendingConfirmations.get(key);

      if (!pending) {
        throw new Error("CONFIRMATION_NOT_FOUND");
      }

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

          // ==========================================================
          // SNAPSHOT BEFORE MUTATION
          // ==========================================================
          if (
            target &&
            (cmd.action === "UPDATE" || cmd.action === "REPAIR")
          ) {
            const tenantId = pending.ctx?.tenantId || "UXMAL39";

            const path =
              `tenants/${tenantId}/BUILDING/${target}`;

            snapshot = await createSnapshot(path);
          }

          // ==========================================================
          // EXECUTION
          // ==========================================================
          const exec = await safeDispatch(cmd, pending.ctx, false);

          if (!exec?.ok) {
            throw new Error(exec?.message || "EXEC_FAILED");
          }

          saveMemory(cmd, exec.response);

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

        // ==========================================================
        // ROLLBACK
        // ==========================================================
        for (let i = executed.length - 1; i >= 0; i--) {
          const item = executed[i];
          const cmd = item.cmd;

          try {

            // CREATE rollback
            if (
              cmd.action === "CREATE" ||
              cmd.action === "CREATE_BUILDING"
            ) {
              const createdId =
                item.response?.id ||
                cmd.target ||
                cmd.payload?.name;

              if (createdId && window?.KernelHeberto?.execute) {
                await window.KernelHeberto.execute(
                  `DELETE_BUILDING::{"id":"${createdId}"}`,
                  null,
                  { simulate: false }
                );
              }
            }

            // UPDATE / REPAIR rollback
            else if (
              (cmd.action === "UPDATE" ||
               cmd.action === "REPAIR") &&
              item.snapshot?.ok
            ) {
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

      // ------------------------------------------------------------
      // If structured DSL detected
      // ------------------------------------------------------------
      if (String(input).includes("::")) {
        commands = String(input)
          .split(";;")
          .map(x => toCommand(x.trim()));
      }

      // ------------------------------------------------------------
      // Natural language mode
      // ------------------------------------------------------------
      else {
        const nlu = understand(input);

        commands = nlu.commands.map(c =>
          toCommand(c.clean)
        );
      }
    }

    if (!commands.length) {
      throw new Error("NO_COMMANDS_GENERATED");
    }

    // ============================================================================
    // STEP 3: SIMULATION
    // ============================================================================

    const preview = [];

    for (const cmd of commands) {
      const res = await safeDispatch(cmd, ctx, true);

      if (!res?.ok) {
        return res;
      }

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
window.runBusinessIntent =
    runBusinessIntent;