/**
 * ======================================================================================
 * JARVIS ORCHESTRATOR v2.0 - Multi Command Ready
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

    // 🔥 MULTI COMANDO
    const commands = Array.isArray(input)
      ? input.map(id => id) // confirmación usa IDs
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

      const commandIds = commands.map(c => c.id);

      // 🔥 GUARDAR BATCH COMPLETO
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

    const results = [];

    for (const cmd of pending.commands) {
      const exec = await dispatch(cmd, pending.ctx, { simulate: false });
      if (!exec.ok) return exec;

      saveMemory(cmd, exec.response);
      results.push(exec.response);
    }

    pendingConfirmations.delete(key);

    return {
      mode: "EXECUTION",
      commandId: pending.commands.map(c => c.id),
      result: results
    };

  } catch (err) {
    console.error("❌ [JARVIS_ERROR]", err);

    return {
      error: true,
      message: err.message
    };
  }
}