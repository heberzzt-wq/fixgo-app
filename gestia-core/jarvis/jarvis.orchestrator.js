/**
 * ======================================================================================
 * JARVIS ORCHESTRATOR v3.1 - Multi Command + Real Rollback + Controlled Test
 * ======================================================================================
 */

import { saveMemory } from "./jarvis.memory.js";
import { toCommand } from "./jarvis.dsl.js";
import { dispatch } from "./jarvis.bridge.js";

const pendingConfirmations = new Map();

export async function runJarvis(input, ctx = {}, confirm = false) {
  try {
    if (!input) {
      throw new Error("JARVIS_EMPTY_INPUT");
    }

    console.log("🧠 [JARVIS_INPUT]", input);

    // =====================================================
    // 🔥 MULTI COMANDO
    // =====================================================
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

        if (!res.ok) {
          return res;
        }

        sims.push(res);
      }

      const commandIds = commands.map(c => c.id);

      pendingConfirmations.set(JSON.stringify(commandIds), {
        commands,
        ctx,
        createdAt: Date.now()
      });

      return {
        mode: "SIMULATION",
        commandId: commandIds,
        preview: sims.map(s => s.response),
        message: "Simulación múltiple lista. Requiere confirmación."
      };
    }

    // =====================================================
    // 🚀 EJECUCIÓN
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
      for (let i = 0; i < pending.commands.length; i++) {
        const cmd = pending.commands[i];

        const exec = await dispatch(cmd, pending.ctx, { simulate: false });

        if (!exec.ok) {
          throw new Error("EXEC_FAILED");
        }

        saveMemory(cmd, exec.response);

        executed.push(cmd);
        results.push(exec.response);

        // 🔥 TEST CONTROLADO:
        // fuerza error después del primer comando cuando hay batch > 1
        if (i === 0 && pending.commands.length > 1) {
          throw new Error("FORCED_POST_FIRST_EXECUTION_FAIL");
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
      console.warn("↩️ [ROLLBACK REAL] Iniciando reversa");

      // =================================================
      // 🔥 ROLLBACK REAL (orden inverso)
      // =================================================
      for (let i = executed.length - 1; i >= 0; i--) {
        const doneCmd = executed[i];

        console.warn("↩️ [ROLLBACK STEP]", {
          action: doneCmd.action,
          id: doneCmd.id
        });

        try {
          // 👉 CREATE_BUILDING => DELETE_BUILDING
          if (doneCmd.action === "CREATE_BUILDING") {
            await window.KernelHeberto.execute(
              `DELETE_BUILDING::{"id":"${doneCmd.id}"}`,
              null,
              { simulate: false }
            );
          }

        } catch (rollbackErr) {
          console.error("❌ [ROLLBACK FAIL]", rollbackErr);
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