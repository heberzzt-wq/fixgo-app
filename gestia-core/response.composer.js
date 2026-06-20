/**
 * GESTIA RESPONSE COMPOSER - v7.0 (PRODUCTION GRADE)
 * Objetivo: Estandarizar salidas del sistema para Front-end, Terminal y Agent Tool Runtime.
 * Estructura estandar SIA7: { ok, status, type, data, meta, traceId }
 */

export const ResponseComposer = {

    success(data = null, meta = {}) {
        const traceId = this._generateTraceId();

        return {
            ok: true,
            status: "SUCCESS",
            type: meta.type || "SUCCESS_RESPONSE",
            data,
            meta: {
                ...meta,
                timestamp: Date.now(),
                traceId
            },
            traceId
        };
    },

    error(message, code = "INTERNAL_ERROR", context = {}) {
        const traceId = this._generateTraceId();

        console.error(
            `[COMPOSER_ERROR] ${code}: ${message}`,
            context
        );

        return {
            ok: false,
            status: "ERROR",
            type: "ERROR_RESPONSE",
            error: {
                message,
                code,
                context
            },
            meta: {
                timestamp: Date.now(),
                traceId
            },
            traceId
        };
    },

    warning(message, data = null, meta = {}) {
        const traceId = this._generateTraceId();

        console.warn(
            `[COMPOSER_WARN] ${message}`
        );

        return {
            ok: true,
            status: "WARNING",
            type: meta.type || "WARNING_RESPONSE",
            message,
            data,
            meta: {
                ...meta,
                timestamp: Date.now(),
                traceId
            },
            traceId
        };
    },

    composeJarvis(text = "", data = {}, meta = {}) {
        const traceId = this._generateTraceId();

        return {
            ok: true,
            status: "SUCCESS",
            type: "JARVIS_CONVERSATIONAL_RESPONSE",
            kind: "JARVIS_CONVERSATIONAL_RESPONSE",
            format: "markdown",
            exposeRaw: meta.exposeRaw === true,
            report: text,
            text,
            data,
            meta: {
                ...meta,
                timestamp: Date.now(),
                traceId
            },
            traceId
        };
    },

    composeToolObservation(toolName = "", result = {}, meta = {}) {
        const traceId = this._generateTraceId();

        return {
            ok: result?.ok !== false,
            status: result?.ok === false ? "FAILED" : "COMPLETED",
            type: "TOOL_OBSERVATION",
            tool: toolName,
            data: result,
            meta: {
                ...meta,
                timestamp: Date.now(),
                traceId
            },
            traceId
        };
    },

    composeAgentToolResult({
        analysisId = null,
        toolCalls = [],
        observations = [],
        response = null,
        reasoning = null,
        meta = {}
    } = {}) {
        const traceId = this._generateTraceId();

        return {
            ok: true,
            status: "SUCCESS",
            type: "AGENT_TOOL_RESULT",
            analysis_id: analysisId,
            operation_id: analysisId,
            opId: analysisId,
            toolCalls,
            observations,
            response,
            reasoning,
            data: {
                toolCalls,
                observations,
                response,
                reasoning
            },
            meta: {
                ...meta,
                timestamp: Date.now(),
                traceId
            },
            traceId
        };
    },

    composeRepoAuditResult({
        rawInput = "",
        scan = {},
        source = {},
        reasoning = null,
        meta = {}
    } = {}) {
        const files =
            scan?.files || [];

        const modules =
            scan?.modules || [];

        const moduleNames =
            modules.length
                ? modules.map(m => m.name || m.module || m).filter(Boolean)
                : [
                    ...new Set(
                        files
                            .map(file => file.module)
                            .filter(Boolean)
                    )
                ];

        const criticalFiles =
            files
                .filter(file =>
                    file.critical === true ||
                    file.runtimeRole ||
                    file.governance ||
                    file.moduleType ||
                    file.type === "critical"
                )
                .slice(0, 15);

        const text = [
            "Auditoria SIA7",
            "",
            "Arquitecto, auditoria read-only del repositorio completada.",
            "",
            `El scanner recorrio **${scan?.total || files.length || 0} archivos** del repositorio.`,
            `Tambien tengo **${scan?.modulesTotal || moduleNames.length || 0} modulos** detectados para clasificacion arquitectonica.`,
            "",
            "### Modulos",
            moduleNames.length
                ? moduleNames.map(m => `- ${m}`).join("\n")
                : "- Sin modulos registrados",
            "",
            "### Archivos criticos/relevantes",
            criticalFiles.length
                ? criticalFiles
                    .map(file => `- ${file.file || file.path || file.name} (${file.module || "sin modulo"})`)
                    .join("\n")
                : "- Sin archivos relevantes destacados."
        ].join("\n");

        return this.composeJarvis(
            text,
            {
                kind: "REPO_AUDIT_RESULT_V7",
                rawInput,
                totals: {
                    files:
                        scan?.total || files.length || 0,
                    modules:
                        scan?.modulesTotal || moduleNames.length || 0
                },
                files,
                modules,
                source,
                reasoning,
                raw:
                    meta.exposeRaw === true ? scan : undefined
            },
            {
                ...meta,
                type: "REPO_AUDIT_RESULT_V7",
                exposeRaw:
                    meta.exposeRaw === true
            }
        );
    },

    _generateTraceId() {
        if (
            typeof crypto !== "undefined" &&
            crypto.randomUUID
        ) {
            return crypto.randomUUID();
        }

        return `trc_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 9)}`;
    }
};

window.ResponseComposer = ResponseComposer;
window.GestiaResponseComposer = ResponseComposer;

console.info(
    "📦 [RESPONSE_COMPOSER] ONLINE v7.0"
);
