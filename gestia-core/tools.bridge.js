/**
 * JARVIS TOOLS BRIDGE - v7.0
 * Conector entre el Brain/Core y el Runtime de Herramientas.
 * Rol: ejecutar tools y componer respuestas, no decidir intención.
 */

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