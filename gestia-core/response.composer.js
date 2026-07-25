/**
 * GESTIA RESPONSE COMPOSER - v7.3 (SEMANTIC EXECUTION GUARD)
 * Objetivo: Estandarizar todas las salidas del sistema para Front-end, Terminal y Agent Tool Runtime.
 * Estructura estándar SIA7: { ok, status, type, data, meta, traceId }
 */

function semanticStatus(value = "", fallback = "COMPLETED") {
    const status = String(value || fallback).trim();
    return status || fallback;
}

function normalizeToolSemantics(result = {}) {
    const status = semanticStatus(
        result?.status,
        result?.ok === false ? "FAILED" : "COMPLETED"
    );
    const normalizedStatus = status.toUpperCase();
    const executionOk =
        typeof result?.executionOk === "boolean"
            ? result.executionOk
            : result?.ok !== false;
    const missingInputs = Array.isArray(result?.missingInputs)
        ? result.missingInputs.filter(Boolean).slice(0, 20)
        : [];
    const requiresInput =
        result?.requiresInput === true ||
        normalizedStatus.includes("INPUT_REQUIRED") ||
        missingInputs.length > 0;
    const requiresApproval =
        result?.requiresApproval === true ||
        normalizedStatus.includes("PENDING_APPROVAL");
    const failedStatus =
        normalizedStatus === "FAILED" ||
        normalizedStatus === "TOOL_FAILED" ||
        normalizedStatus.endsWith("_FAILED");
    const degraded =
        result?.degraded === true ||
        normalizedStatus.includes("DEGRADED") ||
        normalizedStatus === "GROUNDED_LOCAL_FALLBACK" ||
        Boolean(result?.cloudError);
    const explicitObjectiveSatisfied =
        typeof result?.objectiveSatisfied === "boolean"
            ? result.objectiveSatisfied
            : null;
    const objectiveSatisfied =
        executionOk &&
        !failedStatus &&
        !requiresInput &&
        !requiresApproval &&
        (
            explicitObjectiveSatisfied !== null
                ? explicitObjectiveSatisfied
                : result?.readyForProduction !== false
        );
    const blocked =
        result?.blocked === true ||
        requiresInput ||
        requiresApproval;
    const retryable =
        typeof result?.retryable === "boolean"
            ? result.retryable
            : !executionOk && !blocked;

    return {
        ok: executionOk,
        executionOk,
        objectiveSatisfied,
        status,
        requiresInput,
        requiresApproval,
        blocked,
        degraded,
        retryable,
        missingInputs
    };
}

function aggregateObservationSemantics(observations = []) {
    const safeObservations = Array.isArray(observations)
        ? observations.filter(Boolean)
        : [];
    const semantics = safeObservations.map(observation => ({
        ...normalizeToolSemantics(observation?.data || observation),
        status:
            observation?.status ||
            observation?.data?.status ||
            "COMPLETED"
    }));

    if (semantics.length === 0) {
        return normalizeToolSemantics({
            ok: true,
            status: "SUCCESS",
            objectiveSatisfied: true
        });
    }

    const executionOk = semantics.every(item => item.executionOk === true);
    const objectiveSatisfied = semantics.every(item => item.objectiveSatisfied === true);
    const requiresInput = semantics.some(item => item.requiresInput === true);
    const requiresApproval = semantics.some(item => item.requiresApproval === true);
    const blocked = semantics.some(item => item.blocked === true);
    const degraded = semantics.some(item => item.degraded === true);
    const retryable = semantics.some(item => item.retryable === true);
    const unresolved = semantics.find(item => item.objectiveSatisfied !== true);
    const degradedResult = semantics.find(item => item.degraded === true);
    const status =
        unresolved?.status ||
        degradedResult?.status ||
        "SUCCESS";

    return {
        ok: executionOk,
        executionOk,
        objectiveSatisfied,
        status,
        requiresInput,
        requiresApproval,
        blocked,
        degraded,
        retryable,
        missingInputs: [
            ...new Set(
                semantics.flatMap(item => item.missingInputs || [])
            )
        ].slice(0, 20)
    };
}

function semanticRuntimeEnvelope(result = {}) {
    if (!result || typeof result !== "object") return result;
    const payload =
        result?.data &&
        typeof result.data === "object" &&
        !Array.isArray(result.data)
            ? result.data
            : result;
    const semantics = normalizeToolSemantics(payload);

    return {
        ...result,
        ...semantics,
        status: semantics.status,
        data: result.data
    };
}

function installSemanticRuntimeEnvelope(runtime = globalThis.window?.JarvisToolRuntime) {
    if (!runtime || typeof runtime.execute !== "function") return false;
    if (runtime.__semanticEnvelopeInstalled === true) return true;

    const execute = runtime.execute.bind(runtime);
    runtime.execute = async (...args) =>
        semanticRuntimeEnvelope(
            await execute(...args)
        );
    Object.defineProperty(
        runtime,
        "__semanticEnvelopeInstalled",
        {
            value: true,
            configurable: false,
            enumerable: false,
            writable: false
        }
    );
    return true;
}

function shouldHaltToolSequence(result = {}) {
    return (
        result?.ok === false ||
        result?.blocked === true ||
        result?.requiresInput === true ||
        result?.requiresApproval === true ||
        result?.objectiveSatisfied === false ||
        String(result?.status || "").toUpperCase() === "PENDING_APPROVAL"
    );
}

function installSemanticBridgeGuard(bridge = globalThis.window?.ToolsBridge) {
    if (!bridge || typeof bridge.executeAndCompose !== "function") return false;
    if (bridge.__semanticSequenceGuardInstalled === true) return true;

    const executeAndCompose = bridge.executeAndCompose.bind(bridge);
    bridge.executeMany = async function executeManyWithSemanticGuard(
        toolCalls = [],
        context = {}
    ) {
        const results = [];
        for (const call of Array.isArray(toolCalls) ? toolCalls : []) {
            const result = await executeAndCompose(
                call?.name,
                call?.args || {},
                {
                    ...context,
                    approved: call?.approved === true
                }
            );
            results.push(result);
            if (shouldHaltToolSequence(result)) break;
        }
        return results;
    };
    Object.defineProperty(
        bridge,
        "__semanticSequenceGuardInstalled",
        {
            value: true,
            configurable: false,
            enumerable: false,
            writable: false
        }
    );
    return true;
}

function scheduleSemanticBridgeGuard() {
    if (installSemanticBridgeGuard()) return true;
    if (typeof document === "undefined") return false;

    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        if (
            installSemanticBridgeGuard() ||
            attempts >= 40
        ) {
            clearInterval(timer);
        }
    }, 50);
    return true;
}

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
            executionOk: false,
            objectiveSatisfied: false,
            blocked: true,
            retryable: false,
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
        const semantics = normalizeToolSemantics(result);

        return {
            ...semantics,
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
        const semantics = aggregateObservationSemantics(observations);

        return {
            ...semantics,
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
                reasoning,
                semantic: semantics
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

        const text = [
            "Auditoría SIA7",
            "",
            "Arquitecto, auditoría read-only del repositorio completada.",
            "",
            `El scanner recorrió **${scan?.total || files.length || 0} archivos** del repositorio.`,
            `También tengo **${scan?.modulesTotal || moduleNames.length || 0} módulos** detectados para clasificación arquitectónica.`,
            "",
            "### Módulos",
            moduleNames.length
                ? moduleNames.map(m => `- ${m}`).join("\n")
                : "- Sin módulos registrados",
            "",
            "### Archivos críticos/relevantes",
            files
                .filter(file =>
                    file.critical === true ||
                    /jarvis|runtime|engine|terminal|bridge|executor|planner|repo/i.test(
                        `${file.file || ""} ${file.module || ""} ${file.type || ""}`
                    )
                )
                .slice(0, 15)
                .map(file =>
                    `- ${file.file} (${file.module || "sin módulo"})`
                )
                .join("\n") ||
                "- Sin archivos relevantes destacados."
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

export const __test = {
    aggregateObservationSemantics,
    installSemanticBridgeGuard,
    installSemanticRuntimeEnvelope,
    normalizeToolSemantics,
    semanticRuntimeEnvelope,
    shouldHaltToolSequence
};

window.ResponseComposer = ResponseComposer;
window.GestiaResponseComposer = ResponseComposer;
installSemanticRuntimeEnvelope();
scheduleSemanticBridgeGuard();

console.info(
    "📦 [RESPONSE_COMPOSER] ONLINE v7.3 semantic-execution-guard"
);
