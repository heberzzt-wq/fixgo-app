/**
 * ======================================================================================
 * JARVIS ORCHESTRATOR v1.0 - Cognitive Control Layer
 * ======================================================================================
 * Función:
 * - Orquestar flujo completo
 * - Simulación obligatoria
 * - Control de confirmación
 * - Punto de entrada único de Jarvis
 * ======================================================================================
 */

import { saveMemory } from "./jarvis.memory.js";
import { toCommand } from "./jarvis.dsl.js";
import { dispatch } from "./jarvis.bridge.js";

// memoria efímera simple (luego puedes hacerla persistente)
const pendingConfirmations = new Map();

/**
 * runJarvis
 * @param {string} input
 * @param {object} ctx
 * @param {boolean} confirm
 */
export async function runJarvis(input, ctx = {}, confirm = false) {
  try {
    if (!input) {
      throw new Error("JARVIS_EMPTY_INPUT");
    }

    console.log("🧠 [JARVIS_INPUT]", input);

    // 1. DSL → comando estructurado
    const command = toCommand(input);

    // 2. Si NO hay confirmación → SIMULACIÓN
    if (!confirm) {
      const sim = await dispatch(command, ctx, { simulate: true });

      if (!sim.ok) return sim;

      // Guardamos para posible ejecución posterior
      pendingConfirmations.set(command.id, {
        command,
        ctx,
        createdAt: Date.now()
      });

      return {
        mode: "SIMULATION",
        commandId: command.id,
        preview: sim.response,
        message: "Simulación lista. Requiere confirmación para ejecutar."
      };
    }

    // 3. CONFIRMACIÓN → ejecución real
    const pending = pendingConfirmations.get(input);

    if (!pending) {
      throw new Error("CONFIRMATION_NOT_FOUND");
    }

    // timeout de seguridad (30s)
    if (Date.now() - pending.createdAt > 30000) {
      pendingConfirmations.delete(input);
      throw new Error("CONFIRMATION_EXPIRED");
    }

    const exec = await dispatch(pending.command, pending.ctx, { simulate: false });
    saveMemory(pending.command, exec.response);

    pendingConfirmations.delete(input);

    return {
      mode: "EXECUTION",
      commandId: pending.command.id,
      result: exec.response
    };

  } catch (err) {
    console.error("❌ [JARVIS_ERROR]", err);

    return {
      error: true,
      message: err.message
    };
  }
}