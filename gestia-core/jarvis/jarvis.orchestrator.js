/**
 * ======================================================================================
 * JARVIS ORCHESTRATOR v3.6 - Production + Smart Snapshot Rollback TEST READY
 * ======================================================================================
 */

import { saveMemory } from "./jarvis.memory.js";
import { toCommand } from "./jarvis.dsl.js";
import { dispatch } from "./jarvis.bridge.js";
import {
  createSnapshot,
  restoreSnapshot
} from "./jarvis.snapshot.js";

const pendingConfirmations = new Map();

export async function runJarvis(input, ctx = {}, confirm = false) {
  try {
    if (!input) {
      throw new Error("JARVIS_EMPTY_INPUT");
    }

    console.log("🧠 [JARVIS_INPUT]", input);

    const commands = Array.isArray(input)
      ? input
      : input.split(";;").map(c => toCommand(c.trim()));

    // =====================================================
    // 🧪 SIMULACIÓN
    // =====================================================
    if (!confirm) {
      const sims = [];

      for (const cmd of commands) {
        const res = await dispatch(cmd, ctx, { simulate: true });

        if (!res.ok) return res;

        sims.push(res);
      }

      const ids = commands.map(c => c.id);

      pendingConfirmations.set(JSON.stringify(ids), {
        commands,
        ctx,
        createdAt: Date.now()
      });

      return {
        mode: "SIMULATION",
        commandId: ids,
        preview: sims.map(x => x.response),
        message: "Simulación lista."
      };
    }

    // =====================================================
    // 🚀 CONFIRMACIÓN
    // =====================================================
    const key = JSON.stringify(input);
    const pending = pendingConfirmations.get(key);

    if (!pending) {
      throw new Error("CONFIRMATION_NOT_FOUND");
    }

    if (Date.now() - pending.createdAt > 30000) {
      pendingConfirmations.delete(key);
      throw new Error("CONFIRMATION_EXPIRED");
    }

    const executed = [];
    const results = [];

    try {
      for (let index = 0; index < pending.commands.length; index++) {
        const cmd = pending.commands[index];

        // =================================================
        // 📸 SNAPSHOT
        // =================================================
        let snapshot = null;
        let target = null;

        if (typeof cmd.target === "string" && cmd.target.trim()) {
          target = cmd.target.trim();
        } else if (
          typeof cmd.raw === "string" &&
          cmd.raw.includes("::")
        ) {
          target = cmd.raw.split("::")[1]?.trim();
        }

        if (
          (cmd.action === "UPDATE" ||
            cmd.action === "REPAIR") &&
          target
        ) {
          const path =
            `tenants/${pending.ctx.tenantId}/BUILDING/${target}`;

          console.log("🧪 [SNAPSHOT PATH]", path);

          snapshot = await createSnapshot(path);

          console.log("📸 [SNAPSHOT]", snapshot);
        }

        // =================================================
        // 🚀 EJECUCIÓN
        // =================================================
        const exec = await dispatch(cmd, pending.ctx, {
          simulate: false
        });

        if (!exec.ok) {
          throw new Error("EXEC_FAILED");
        }

        saveMemory(cmd, exec.response);

        executed.push({
          cmd,
          snapshot,
          response: exec.response
        });

        results.push(exec.response);

        // =================================================
        // 💥 TEST CONTROLADO ROLLBACK
        // Fuerza error al terminar comando #2
        // =================================================
        if (index === 1) {
          throw new Error("FORCED_BATCH_FAIL");
        }
      }

      pendingConfirmations.delete(key);

      return {
        mode: "EXECUTION",
        commandId: pending.commands.map(c => c.id),
        result: results
      };

    } catch (execErr) {

      console.error("💥 [EXECUTION FAIL]", execErr.message);
      console.warn("↩️ [ROLLBACK ENGINE] Iniciando recuperación");

      // =================================================
      // ↩️ ROLLBACK
      // =================================================
      for (let i = executed.length - 1; i >= 0; i--) {
        const item = executed[i];
        const cmd = item.cmd;

        try {

          // CREATE_BUILDING
          if (cmd.action === "CREATE_BUILDING") {

            const createdId =
              item.response?.id ||
              cmd.target ||
              cmd.payload?.name;

            if (createdId) {
              await window.KernelHeberto.execute(
                `DELETE_BUILDING::{"id":"${createdId}"}`,
                null,
                { simulate: false }
              );
            }
          }

          // UPDATE / REPAIR
          else if (
            (cmd.action === "UPDATE" ||
              cmd.action === "REPAIR") &&
            item.snapshot?.ok
          ) {
            await restoreSnapshot(item.snapshot);
          }

        } catch (rbErr) {
          console.error("❌ [ROLLBACK FAIL]", rbErr);
        }
      }

      pendingConfirmations.delete(key);

      return {
        error: true,
        message: execErr.message,
        partialResults: results
      };
    }

  } catch (err) {
    console.error("❌ [JARVIS_ERROR]", err);

    return {
      error: true,
      message: err.message
    };
  }
}