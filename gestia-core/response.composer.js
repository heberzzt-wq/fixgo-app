/**
 * GESTIA RESPONSE COMPOSER - v7.4 (SEMANTIC MEMORY + TERMINAL)
 * Objetivo: Estandarizar todas las salidas del sistema para Front-end, Terminal y Agent Tool Runtime.
 * Estructura estándar SIA7: { ok, status, type, data, meta, traceId }
 */

function semanticStatus(value = "", fallback = "COMPLETED") {
    const status = String(value || fallback).trim();
    return status || fallback;
}

function isFailureStatus(status = "") {
    const normalizedStatus =
        semanticStatus(status, "")
            .toUpperCase();

    return (
        normalizedStatus === "FAILED" ||
        normalizedStatus === "TOOL_FAILED" ||
        normalizedStatus === "ERROR" ||
        normalizedStatus.endsWith("_FAILED") ||
        normalizedStatus.endsWith("_FAILURE") ||
        normalizedStatus.endsWith("_ERROR")
    );
}

function normalizeToolSemantics(result = {}) {
    const status = semanticStatus(
        result?.status,
        result?.ok === false ? "FAILED" : "COMPLETED"
    );
    const normalizedStatus = status.toUpperCase();
    const failedStatus = isFailureStatus(normalizedStatus);
    const rawExecutionOk =
        typeof result?.executionOk === "boolean"
            ? result.executionOk
            : result?.ok !== false;
    const executionOk =
        rawExecutionOk &&
        !failedStatus;
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
    const semantics = safeObservations.map(observation => {
        const semantic = normalizeToolSemantics(
            observation?.data ||
            observation
        );

        return {
            ...semantic,
            status:
                semantic.status ||
                observation?.status ||
                observation?.data?.status ||
                "COMPLETED"
        };
    });

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

    const hasTopLevelSemantics =
        typeof result?.executionOk === "boolean" ||
        typeof result?.objectiveSatisfied === "boolean" ||
        result?.requiresInput === true ||
        result?.requiresApproval === true ||
        result?.blocked === true ||
        result?.degraded === true ||
        result?.retryable === true ||
        isFailureStatus(result?.status);

    const payload =
        !hasTopLevelSemantics &&
        result?.data &&
        typeof result.data === "object" &&
        !Array.isArray(result.data)
            ? result.data
            : result;

    const payloadSemantics =
        normalizeToolSemantics(payload);
    const envelopeSemantics =
        payload === result
            ? payloadSemantics
            : normalizeToolSemantics(result);
    const executionOk =
        payloadSemantics.executionOk &&
        envelopeSemantics.executionOk;
    const objectiveSatisfied =
        executionOk &&
        payloadSemantics.objectiveSatisfied &&
        envelopeSemantics.objectiveSatisfied;
    const requiresInput =
        payloadSemantics.requiresInput ||
        envelopeSemantics.requiresInput;
    const requiresApproval =
        payloadSemantics.requiresApproval ||
        envelopeSemantics.requiresApproval;
    const blocked =
        payloadSemantics.blocked ||
        envelopeSemantics.blocked;
    const degraded =
        payloadSemantics.degraded ||
        envelopeSemantics.degraded;
    const retryable =
        !blocked &&
        (
            payloadSemantics.retryable ||
            envelopeSemantics.retryable
        );
    const genericEnvelopeStatus =
        ["", "SUCCESS", "COMPLETED"].includes(
            String(result?.status || "")
                .toUpperCase()
        );
    const status =
        genericEnvelopeStatus
            ? payloadSemantics.status
            : envelopeSemantics.status;
    const semantics = {
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
            ...new Set([
                ...(payloadSemantics.missingInputs || []),
                ...(envelopeSemantics.missingInputs || [])
            ])
        ].slice(0, 20)
    };

    return {
        ...result,
        ...semantics,
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
        result?.executionOk === false ||
        result?.blocked === true ||
        result?.requiresInput === true ||
        result?.requiresApproval === true ||
        result?.objectiveSatisfied === false ||
        isFailureStatus(result?.status) ||
        String(result?.status || "").toUpperCase() === "PENDING_APPROVAL"
    );
}

function reconcileToolMemory(
    toolName = "",
    result = {}
) {
    const memory =
        globalThis.window?.__JARVIS_TOOL_MEMORY__;

    if (
        !memory ||
        !Array.isArray(memory.entries)
    ) {
        return false;
    }

    const semantics =
        semanticRuntimeEnvelope(result);
    const matchesTool =
        entry =>
            !toolName ||
            entry?.tool === toolName;
    const targets = [
        memory.last,
        memory.entries.find(matchesTool)
    ].filter((entry, index, list) =>
        entry &&
        matchesTool(entry) &&
        list.indexOf(entry) === index
    );

    for (const entry of targets) {
        Object.assign(
            entry,
            {
                ok:
                    semantics?.executionOk === true,
                executionOk:
                    semantics?.executionOk === true,
                objectiveSatisfied:
                    semantics?.objectiveSatisfied === true,
                status:
                    semantics?.status ||
                    entry.status ||
                    "UNKNOWN",
                requiresInput:
                    semantics?.requiresInput === true,
                requiresApproval:
                    semantics?.requiresApproval === true,
                blocked:
                    semantics?.blocked === true,
                degraded:
                    semantics?.degraded === true,
                retryable:
                    semantics?.retryable === true,
                missingInputs:
                    Array.isArray(semantics?.missingInputs)
                        ? [...semantics.missingInputs]
                        : []
            }
        );
    }

    return targets.length > 0;
}

function semanticSummary(
    semantics = {},
    observations = []
) {
    const status =
        String(semantics?.status || "UNKNOWN");
    const missingInputs =
        Array.isArray(semantics?.missingInputs)
            ? semantics.missingInputs
            : [];

    if (semantics?.requiresInput === true) {
        return [
            "Jarvis necesita información para continuar.",
            `Estado: ${status}.`,
            missingInputs.length
                ? `Faltan: ${missingInputs.join(", ")}.`
                : "La herramienta no indicó cuáles datos faltan.",
            "Las tareas dependientes quedaron pendientes; no se fingió que la misión terminó."
        ].join("\n");
    }

    if (semantics?.requiresApproval === true) {
        return [
            "Jarvis preparó la operación, pero necesita aprobación.",
            `Estado: ${status}.`,
            "No se ejecutaron las tareas dependientes ni se declaró la misión completada."
        ].join("\n");
    }

    if (semantics?.executionOk === false) {
        return [
            "Jarvis no pudo completar la ejecución de la herramienta.",
            `Estado: ${status}.`,
            semantics?.retryable === true
                ? "El fallo está marcado como reintentable."
                : "El fallo no está marcado como reintentable."
        ].join("\n");
    }

    if (semantics?.degraded === true) {
        return [
            "Jarvis completó la tarea en modo degradado.",
            `Estado: ${status}.`,
            "El resultado sigue disponible, pero conserva la advertencia de capacidad reducida."
        ].join("\n");
    }

    const unresolved = Array.isArray(observations)
        ? observations.find(observation =>
            observation?.objectiveSatisfied === false
        )
        : null;

    if (unresolved) {
        return [
            "Jarvis ejecutó la herramienta, pero el objetivo todavía no está satisfecho.",
            `Estado: ${status}.`
        ].join("\n");
    }

    return "";
}

function installSemanticBridgeGuard(bridge = globalThis.window?.ToolsBridge) {
    if (!bridge || typeof bridge.executeAndCompose !== "function") return false;
    if (bridge.__semanticSequenceGuardInstalled === true) return true;

    const executeAndCompose =
        bridge.executeAndCompose.bind(bridge);

    bridge.executeAndCompose =
        async function executeAndComposeWithSemanticMemory(
            toolName,
            args = {},
            context = {}
        ) {
            const result =
                semanticRuntimeEnvelope(
                    await executeAndCompose(
                        toolName,
                        args,
                        context
                    )
                );

            reconcileToolMemory(
                toolName,
                result
            );

            return result;
        };

    bridge.executeMany = async function executeManyWithSemanticGuard(
        toolCalls = [],
        context = {}
    ) {
        const results = [];
        for (const call of Array.isArray(toolCalls) ? toolCalls : []) {
            const result = await bridge.executeAndCompose(
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
        const summary =
            semanticSummary(
                semantics,
                observations
            );
        const responseText =
            typeof response?.text === "string"
                ? response.text
                : typeof response?.report === "string"
                    ? response.report
                    : "";
        const visibleText =
            summary ||
            responseText;

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
            ...(visibleText
                ? {
                    format: "markdown",
                    report: visibleText,
                    text: visibleText
                }
                : {}),
            data: {
                toolCalls,
                observations,
                response,
                reasoning,
                semantic: semantics,
                semanticSummary:
                    summary ||
                    null
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
            Array.isArray(scan?.files)
                ? scan.files
                : [];

        const modules =
            Array.isArray(scan?.modules)
                ? scan.modules
                : [];

        const totalFiles =
            Number.isFinite(Number(scan?.total))
                ? Number(scan.total)
                : files.length;

        if (totalFiles < 1 || files.length < 1) {
            return this.error(
                "La auditoría no recibió evidencia verificable de archivos del repositorio. No se declarará completada.",
                "REPO_AUDIT_EMPTY_EVIDENCE",
                {
                    rawInput,
                    status: scan?.status || null,
                    source,
                    totalFiles,
                    fileEvidenceCount: files.length
                }
            );
        }

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
            `El scanner recorrió **${totalFiles} archivos** del repositorio.`,
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
                        totalFiles,
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
    isFailureStatus,
    normalizeToolSemantics,
    reconcileToolMemory,
    semanticRuntimeEnvelope,
    semanticSummary,
    shouldHaltToolSequence
};

window.ResponseComposer = ResponseComposer;
window.GestiaResponseComposer = ResponseComposer;
installSemanticRuntimeEnvelope();
scheduleSemanticBridgeGuard();

console.info(
    "📦 [RESPONSE_COMPOSER] ONLINE v7.4 semantic-memory-terminal"
);
