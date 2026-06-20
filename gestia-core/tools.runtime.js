/**
 * JARVIS TOOL RUNTIME - v7.0 (PRODUCTION GRADE)
 * Arquitectura: Singleton Registry + Middleware Chain + Error Boundary
 *
 * Rol:
 * - Registrar herramientas disponibles para Jarvis/Gestia.
 * - Validar contratos de herramientas.
 * - Ejecutar tools con middleware, telemetria y frontera de errores.
 * - Bloquear tools mutantes cuando no exista aprobacion explicita.
 */

export const JarvisToolRuntime = {
    _registry: new Map(),
    _middleware: [],

    register(tool = {}) {
        if (!tool.name || typeof tool.execute !== "function") {
            throw new Error(
                `[CRITICAL] Error de contrato en herramienta: ${tool.name || "Unknown"}`
            );
        }

        const toolDef = {
            ...tool,
            mutates: tool.mutates === true,
            requiresApproval:
                tool.requiresApproval ??
                tool.mutates === true,
            version:
                tool.version || "1.0.0",
            description:
                tool.description || "",
            inputSchema:
                tool.inputSchema || null,
            output:
                tool.output || "TOOL_RESULT"
        };

        this._registry.set(
            tool.name,
            toolDef
        );

        console.info(
            `[RUNTIME_REGISTERED] ${tool.name} @ v${toolDef.version}`
        );

        return {
            ok: true,
            tool: tool.name,
            version: toolDef.version
        };
    },

    use(middleware) {
        if (typeof middleware !== "function") {
            throw new Error(
                "[RUNTIME_ERROR] Middleware invalido"
            );
        }

        this._middleware.push(
            middleware
        );

        return {
            ok: true,
            middleware:
                this._middleware.length
        };
    },

    async execute(name, args = {}, context = {}) {
        const tool =
            this._registry.get(name);

        if (!tool) {
            return {
                ok: false,
                success: false,
                status: "TOOL_NOT_FOUND",
                error:
                    `[RUNTIME_ERROR] TOOL_NOT_FOUND: ${name}`,
                tool: name
            };
        }

        if (
            tool.mutates === true &&
            tool.requiresApproval === true &&
            context.approved !== true
        ) {
            return {
                ok: false,
                success: false,
                status: "PENDING_APPROVAL",
                error:
                    `[RUNTIME_BLOCKED] APPROVAL_REQUIRED: ${name}`,
                tool: name,
                mutates: true,
                requiresApproval: true
            };
        }

        const executionContext = {
            name,
            args,
            tenantId:
                context.tenantId || null,
            userId:
                context.userId || null,
            analysisId:
                context.analysisId || null,
            timestamp:
                Date.now(),
            executionId:
                globalThis.crypto?.randomUUID?.() ||
                `tool_${Date.now()}_${Math.random()
                    .toString(16)
                    .slice(2)}`
        };

        try {
            for (const mw of this._middleware) {
                await mw(
                    executionContext,
                    tool
                );
            }

            console.info(
                `[RUNTIME_EXECUTE] Iniciando: ${name}`,
                executionContext
            );

            const result =
                await tool.execute(
                    args,
                    context
                );

            return {
                ok: true,
                success: true,
                status: "COMPLETED",
                tool: name,
                data: result,
                executionId:
                    executionContext.executionId,
                timestamp:
                    Date.now()
            };

        } catch (error) {
            console.error(
                `[RUNTIME_CRITICAL] Fallo en ${name}:`,
                error
            );

            return {
                ok: false,
                success: false,
                status: "FAILED",
                tool: name,
                error:
                    error?.message || String(error),
                executionId:
                    executionContext.executionId,
                timestamp:
                    Date.now()
            };
        }
    },

    get(name) {
        return (
            this._registry.get(name) ||
            null
        );
    },

    has(name) {
        return this._registry.has(name);
    },

    list() {
        return Array
            .from(this._registry.values())
            .map(t => ({
                name:
                    t.name,
                version:
                    t.version,
                description:
                    t.description,
                mutates:
                    t.mutates === true,
                requiresApproval:
                    t.requiresApproval === true,
                output:
                    t.output,
                inputSchema:
                    t.inputSchema
            }));
    },

    clear() {
        this._registry.clear();
        this._middleware = [];

        return {
            ok: true
        };
    }
};

window.JarvisToolRuntime = JarvisToolRuntime;

console.info(
    "🧠 [JARVIS_TOOL_RUNTIME] ONLINE v7.0"
);
