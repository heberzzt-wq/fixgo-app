"use strict";

/**
 * Entrada final de Functions.
 * Mantiene el nombre histórico `stripewebhook` para que clientes ya publicados
 * lleguen al mismo API autoritativo de secure-entry.js mediante un export distinto.
 *
 * También instala una guarda estrecha para GROUNDED_ARGUMENT_COMPLETION:
 * cuando la herramienta ya fue seleccionada, reutiliza el proveedor autenticado
 * en JSON puro y evita degradar innecesariamente al planner público.
 */

const functions = require("firebase-functions/v1");
const semanticPlanner = require("./jarvis-semantic-planner");

function installGroundedArgumentCompletionGuard(planner = semanticPlanner) {
    if (
        !planner ||
        typeof planner.runJarvisSemanticPlanner !== "function" ||
        planner.__groundedArgumentCompletionGuardInstalled === true
    ) {
        return false;
    }

    const originalRunJarvisSemanticPlanner =
        planner.runJarvisSemanticPlanner.bind(planner);

    planner.runJarvisSemanticPlanner = async function guardedSemanticPlanner(options = {}) {
        const missionState = options?.missionState || null;
        const ai = options?.ai || null;
        const instruction = String(options?.input || "").trim();
        const safeCatalog =
            typeof planner.normalizeCatalog === "function"
                ? planner.normalizeCatalog(options?.catalog || [])
                : [];

        if (
            missionState?.phase !== "GROUNDED_ARGUMENT_COMPLETION" ||
            safeCatalog.length !== 1 ||
            !ai?.models?.generateContent
        ) {
            return originalRunJarvisSemanticPlanner(options);
        }

        const targetTool = safeCatalog[0];
        let lastArgumentError = null;

        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                const response = await ai.models.generateContent({
                    model:
                        planner.DEFAULT_GEMINI_MODEL ||
                        "gemini-2.5-flash",
                    contents: [
                        "COMPLETADO_DE_ARGUMENTOS_DE_HERRAMIENTA_EXISTENTE:",
                        "La herramienta objetivo ya fue seleccionada por Jarvis. No selecciones otra herramienta y no declares la mision completa.",
                        "Completa sus argumentos usando solamente la instruccion, los argumentos existentes y la evidencia verificable incluida. No inventes datos faltantes.",
                        "Devuelve solamente JSON valido con forma {\"toolCalls\":[{\"name\":\"nombre.exacto\",\"args\":{},\"reason\":\"\"}],\"missionComplete\":false}.",
                        `HERRAMIENTA_OBJETIVO=${JSON.stringify({
                            name: targetTool.name,
                            description: targetTool.description,
                            inputSchema: targetTool.inputSchema
                        })}`,
                        `INSTRUCCION_Y_EVIDENCIA=${instruction}`,
                        attempt > 1
                            ? "REINTENTO: la salida anterior no produjo argumentos ejecutables. Conserva exactamente la herramienta objetivo y completa todos los campos requeridos que la evidencia permita sustentar."
                            : ""
                    ].filter(Boolean).join("\n"),
                    config: {
                        temperature: 0,
                        maxOutputTokens: 3000,
                        thinkingConfig: {
                            thinkingBudget: 0
                        },
                        responseMimeType: "application/json"
                    }
                });

                const payload = planner.extractJsonObject(
                    String(response?.text || "")
                );
                const validated = planner.validatePlan(
                    {
                        ...(payload || {}),
                        missionComplete: false
                    },
                    safeCatalog,
                    instruction
                );
                const selected = validated.toolCalls.find(
                    call => call.name === targetTool.name
                );

                if (
                    selected &&
                    planner.hasRequiredToolArguments(
                        targetTool,
                        selected.args || {}
                    )
                ) {
                    return {
                        ...validated,
                        missionComplete: false,
                        provider: String(ai.lastProvider || "gemini"),
                        model:
                            planner.DEFAULT_GEMINI_MODEL ||
                            "gemini-2.5-flash",
                        catalogSize: safeCatalog.length,
                        planKind: "GROUNDED_ARGUMENT_COMPLETION"
                    };
                }

                lastArgumentError =
                    new Error("SEMANTIC_GROUNDED_ARGUMENTS_REQUIRED");
            }
            catch(error) {
                lastArgumentError = error;
            }
        }

        throw lastArgumentError ||
            new Error("SEMANTIC_GROUNDED_ARGUMENTS_REQUIRED");
    };

    Object.defineProperty(
        planner,
        "__groundedArgumentCompletionGuardInstalled",
        {
            value: true,
            configurable: false,
            enumerable: false,
            writable: false
        }
    );

    return true;
}

installGroundedArgumentCompletionGuard();

const secureExports = require("./secure-entry.js");

const stripeWebhookProxy = functions.https.onRequest((req, res) => {
    return secureExports.api(req, res);
});

module.exports = {
    ...secureExports,
    stripewebhook: stripeWebhookProxy
};
