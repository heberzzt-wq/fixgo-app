/**
 * JARVIS TOOLS BRIDGE - v7.0
 * Conector entre el Brain/Core y el Runtime de Herramientas.
 * Rol: ejecutar tools y componer respuestas, no decidir intención.
 */

/* ======================================================================================
   JARVIS TOOL RESULT MEMORY V7
   Guarda observaciones recientes de tools para respuesta inmediata sin re-ejecutar.
====================================================================================== */

window.__JARVIS_TOOL_MEMORY__ ||= {
    version:
        "7.0.0",
    maxEntries:
        25,
    entries:
        [],
    last:
        null
};

function rememberToolResult(
    entry = {}
) {
    const memory =
        window.__JARVIS_TOOL_MEMORY__;

    const safeEntry =
        {
            id:
                entry.id ||
                crypto.randomUUID(),
            tool:
                entry.tool ||
                "unknown",
            args:
                entry.args ||
                {},
            ok:
                entry.ok === true,
            status:
                entry.status ||
                "UNKNOWN",
            data:
                entry.data ||
                null,
            response:
                entry.response ||
                null,
            observation:
                entry.observation ||
                null,
            analysisId:
                entry.analysisId ||
                null,
            tenantId:
                entry.tenantId ||
                null,
            timestamp:
                Date.now()
        };

    memory.entries.unshift(
        safeEntry
    );

    memory.entries =
        memory.entries.slice(
            0,
            memory.maxEntries
        );

    memory.last =
        safeEntry;

    console.info(
        "🧠 [TOOL_MEMORY_SAVED]",
        {
            tool:
                safeEntry.tool,
            status:
                safeEntry.status,
            ok:
                safeEntry.ok
        }
    );

    return safeEntry;
}

function getLastToolResult(
    toolName = null
) {
    const entries =
        window.__JARVIS_TOOL_MEMORY__?.entries ||
        [];

    if (!toolName) {
        return (
            window.__JARVIS_TOOL_MEMORY__?.last ||
            null
        );
    }

    return (
        entries.find(
            item =>
                item.tool === toolName
        ) ||
        null
    );
}

window.JarvisToolMemory = {
    remember:
        rememberToolResult,
    last:
        getLastToolResult,
    all:
        () =>
            window.__JARVIS_TOOL_MEMORY__?.entries ||
            []
};

export const ToolsBridge = {

    async executeAndCompose(toolName, args = {}, context = {}) {
        console.info(
            `[BRIDGE] Intentando ejecutar: ${toolName}`
        );

        if (!window.JarvisToolRuntime?.execute) {
            return window.ResponseComposer?.error?.(
                "JarvisToolRuntime no disponible",
                "TOOL_RUNTIME_MISSING",
                { tool: toolName }
            ) || {
                ok: false,
                status: "ERROR",
                error: "TOOL_RUNTIME_MISSING"
            };
        }

        if (!window.ResponseComposer) {
            return {
                ok: false,
                status: "ERROR",
                error: {
                    message: "ResponseComposer no disponible",
                    code: "RESPONSE_COMPOSER_MISSING"
                }
            };
        }

        const result =
            await window.JarvisToolRuntime.execute(
                toolName,
                args,
                context
            );

        if (!result?.ok) {
            return window.ResponseComposer.error(
                result?.error || "Error desconocido",
                "TOOL_EXECUTION_FAILED",
                {
                    tool:
                        toolName,
                    runtimeResult:
                        result
                }
            );
        }

        const observation =
            window.ResponseComposer.composeToolObservation(
                toolName,
                result.data,
                {
                    executionId:
                        result.executionId,
                    analysisId:
                        context.analysisId,
                    tenantId:
                        context.tenantId
                }
            );

        if (toolName === "repo.audit") {
            const response =
                window.ResponseComposer.composeRepoAuditResult({
                    rawInput:
                        context.rawInput || "",
                    scan:
                        result.data,
                    source: {
                        tool:
                            "repo.audit",
                        runtime:
                            "JarvisToolRuntime",
                        bridge:
                            "ToolsBridge"
                    },
                    reasoning:
                        context.reasoning || null,
                    meta: {
                        type:
                            "REPO_AUDIT_RESULT_V7",
                        exposeRaw:
                            context.exposeRaw === true,
                        analysisId:
                            context.analysisId
                    }
                });

                            rememberToolResult({
                tool:
                    toolName,
                args,
                ok:
                    true,
                status:
                    "SUCCESS",
                data:
                    result.data,
                response,
                observation,
                analysisId:
                    context.analysisId ||
                    null,
                tenantId:
                    context.tenantId ||
                    null
            });

            return window.ResponseComposer.composeAgentToolResult({
                analysisId:
                    context.analysisId || null,
                toolCalls: [
                    {
                        name:
                            toolName,
                        args,
                        mutates:
                            false
                    }
                ],
                observations: [
                    observation
                ],
                response,
                reasoning:
                    context.reasoning || null,
                meta: {
                    tool:
                        toolName,
                    bridge:
                        "ToolsBridge"
                }
            });
        }

        const response =
            window.ResponseComposer.success(
                result.data,
                {
                    type:
                        "TOOL_RESULT",
                    tool:
                        toolName,
                    analysisId:
                        context.analysisId
                }
            );

                    rememberToolResult({
            tool:
                toolName,
            args,
            ok:
                true,
            status:
                result?.data?.status ||
                result?.status ||
                "SUCCESS",
            data:
                result.data,
            response,
            observation,
            analysisId:
                context.analysisId ||
                null,
            tenantId:
                context.tenantId ||
                null
        });

        return window.ResponseComposer.composeAgentToolResult({
            analysisId:
                context.analysisId || null,
            toolCalls: [
                {
                    name:
                        toolName,
                    args
                }
            ],
            observations: [
                observation
            ],
            response,
            reasoning:
                context.reasoning || null,
            meta: {
                tool:
                    toolName,
                bridge:
                    "ToolsBridge"
            }
        });
    },

    async executeMany(toolCalls = [], context = {}) {
    const results = [];

    for (const call of toolCalls) {
        const result =
            await this.executeAndCompose(
                call.name,
                call.args || {},
                {
                    ...context,
                    approved:
                        call.approved === true
                }
            );

        results.push(result);

        const runtimePayload =
            result?.runtimeResult ||
            result?.data ||
            result?.result ||
            result?.response ||
            result;

        const runtimeText =
            JSON.stringify(
                runtimePayload || {}
            );

        const patchBlocked =
            call?.name === "repo.patchPreview" &&
            (
                runtimePayload?.blocked === true ||
                runtimePayload?.status === "PATCH_PREVIEW_NEEDS_EXACT_BLOCK" ||
                runtimePayload?.data?.blocked === true ||
                runtimePayload?.data?.status === "PATCH_PREVIEW_NEEDS_EXACT_BLOCK" ||
                runtimePayload?.runtimeResult?.blocked === true ||
                runtimePayload?.runtimeResult?.status === "PATCH_PREVIEW_NEEDS_EXACT_BLOCK" ||
                runtimeText.includes("PATCH_PREVIEW_NEEDS_EXACT_BLOCK") ||
                runtimeText.includes("SEARCH_REPLACE_REQUIRED")
            );

        if (
            patchBlocked
        ) {
            console.info(
                "🛡️ [AGENT_LOOP_HALTED_AFTER_SAFE_PATCH_BLOCK]",
                {
                    tool:
                        call.name,
                    status:
                        "PATCH_PREVIEW_NEEDS_EXACT_BLOCK",
                    reason:
                        "SEARCH_REPLACE_REQUIRED",
                    next:
                        "No se ejecutan tests ni planner porque no hubo diff real."
                }
            );

            break;
        }

        if (result?.ok === false) {
            break;
        }

        if (
            result?.status === "PENDING_APPROVAL"
        ) {
            break;
        }
    }

    return results;
}
};
window.ToolsBridge = ToolsBridge;
window.JarvisToolsBridge = ToolsBridge;

console.info(
    "🌉 [TOOLS_BRIDGE] ONLINE v7.0"
);

/* ============================================================
   JARVIS CODEX V2 — TOOL BRIDGE
   Commit 23 Mega-Pack
   ============================================================ */

(function initJarvisCodexV2Bridge() {
  if (window.__JARVIS_CODEX_V2_BRIDGE__) return;
  window.__JARVIS_CODEX_V2_BRIDGE__ = true;

  function ensureCodexV2() {
    if (!window.JarvisCodexV2) {
      throw new Error("JarvisCodexV2 runtime not loaded");
    }
    return window.JarvisCodexV2;
  }

  window.JarvisToolsBridge = window.JarvisToolsBridge || {};

  window.JarvisToolsBridge["repo.patchPreviewExact"] = async function repoPatchPreviewExact(payload) {
    return await ensureCodexV2().patchPreviewExact(payload);
  };

  window.JarvisToolsBridge["repo.approvePatch"] = async function repoApprovePatch(payload) {
    return ensureCodexV2().approvePendingPatch(payload);
  };

  window.JarvisToolsBridge["repo.codeWriteSafe"] = async function repoCodeWriteSafe(payload) {
    return await ensureCodexV2().safeCodeWrite(payload);
  };

  window.JarvisToolsBridge["repo.postWriteVerify"] = async function repoPostWriteVerify(payload) {
    return await ensureCodexV2().postWriteVerify(payload);
  };
})();