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

function queueActuatorArtifact(toolName = "", data = {}) {
    if (!data?.output) return;
    if (data?.artifactMode === "browser_verified_download") return;
    window.__JARVIS_QUEUED_ARTIFACT_OUTPUTS__ =
        window.__JARVIS_QUEUED_ARTIFACT_OUTPUTS__ instanceof Set
            ? window.__JARVIS_QUEUED_ARTIFACT_OUTPUTS__
            : new Set();
    if (
        window.__JARVIS_QUEUED_ARTIFACT_OUTPUTS__.has(
            data.output
        )
    ) {
        return;
    }
    window.__JARVIS_QUEUED_ARTIFACT_OUTPUTS__.add(
        data.output
    );
    window.__JARVIS_PENDING_ARTIFACTS__ = Array.isArray(window.__JARVIS_PENDING_ARTIFACTS__)
        ? window.__JARVIS_PENDING_ARTIFACTS__
        : [];
    window.__JARVIS_PENDING_ARTIFACTS__.push({
        output: data.output,
        mimeType: data.mimeType || "",
        tool: toolName
    });
}

function delegatedResultLine(
    result = {},
    index = 0
) {
    const data =
        result?.data &&
        typeof result.data ===
            "object"
            ? result.data
            : result;
    const tool =
        String(
            result?.tool ||
            data?.tool ||
            `tarea_${index + 1}`
        );
    const status =
        String(
            data?.status ||
            result?.status ||
            (
                result?.ok === true
                    ? "COMPLETED"
                    : "FAILED"
            )
        );
    const details =
        [];

    if (data?.source) {
        details.push(
            `fuente=${String(data.source).slice(0, 120)}`
        );
    }
    if (
        data?.connectedCount !=
            null &&
        Number.isFinite(
            Number(
                data?.connectedCount
            )
        )
    ) {
        details.push(
            `conectados=${Number(data.connectedCount)}`
        );
    }
    if (
        Array.isArray(
            data?.connectors
        )
    ) {
        details.push(
            `conectores=${data.connectors
                .slice(0, 8)
                .map(connector =>
                    `${String(connector?.id || "unknown")}:${connector?.connected === true ? "CONECTADO" : "DESCONECTADO"}`
                )
                .join(",")}`
        );
    }
    if (
        data?.counts &&
        typeof data.counts ===
            "object"
    ) {
        const counts =
            Object.entries(
                data.counts
            )
                .filter(([, value]) =>
                    typeof value ===
                        "number" ||
                    typeof value ===
                        "boolean"
                )
                .slice(0, 12)
                .map(([name, value]) =>
                    `${name}=${value}`
                );
        if (counts.length > 0) {
            details.push(
                `conteos=${counts.join(",")}`
            );
        }
    }
    if (
        data?.averageLatencyMs !=
            null &&
        Number.isFinite(
            Number(
                data
                    ?.averageLatencyMs
            )
        )
    ) {
        details.push(
            `latenciaPromedioMs=${Number(data.averageLatencyMs)}`
        );
    }
    if (
        Array.isArray(
            data?.errors
        )
    ) {
        details.push(
            `fallos=${data.errors.length}`
        );
    }

    return [
        `- ${tool}: ${status}`,
        details.length >
            0
            ? ` (${details.join("; ")})`
            : ""
    ].join("");
}

function reviewEvidenceLine(
    evidence = {}
) {
    if (
        !evidence ||
        typeof evidence !==
            "object" ||
        Array.isArray(evidence)
    ) {
        return "";
    }

    return Object
        .entries(evidence)
        .map(([name, value]) => {
            const rendered =
                Array.isArray(value)
                    ? value
                        .map(item =>
                            typeof item ===
                                "object"
                                ? Object
                                    .entries(item || {})
                                    .map(([key, entry]) =>
                                        `${key}=${String(entry)}`
                                    )
                                    .join(", ")
                                : String(item)
                        )
                        .join(" | ")
                    : value &&
                        typeof value ===
                            "object"
                        ? Object
                            .entries(value)
                            .map(([key, entry]) =>
                                `${key}=${String(entry)}`
                            )
                            .join(", ")
                        : String(value);

            return `${name}=${rendered || "ninguno"}`;
        })
        .join("; ");
}

function composeActuatorResponse(
    toolName = "",
    data = {},
    context = {}
) {
    const composer =
        window.ResponseComposer;

    if (!composer?.composeJarvis) {
        return null;
    }

    if (
        toolName ===
        "repo.architectReview"
    ) {
        const checks =
            Array.isArray(
                data?.checks
            )
                ? data.checks
                : [];
        const blockers =
            Array.isArray(
                data?.blockers
            )
                ? data.blockers
                : [];
        const warnings =
            Array.isArray(
                data?.warnings
            )
                ? data.warnings
                : [];
        const checkLines =
            checks.map((check, index) => {
                const evidence =
                    reviewEvidenceLine(
                        check?.evidence
                    );
                return [
                    `${index + 1}. ${check?.id || "control"}: **${check?.status || "UNKNOWN"}**.`,
                    evidence
                        ? ` Evidencia: ${evidence}.`
                        : "",
                    check?.remediation
                        ? ` Remediación: ${check.remediation}`
                        : ""
                ].join("");
            });

        return composer.composeJarvis(
            [
                "Revisión Chief Architect",
                "",
                `Decisión: **${data?.decision || data?.status || "UNKNOWN"}**.`,
                `Estado: **${data?.status || "UNKNOWN"}**.`,
                data?.instruction
                    ? `Instrucción conservada: ${data.instruction}`
                    : "",
                Array.isArray(data?.targetFiles) &&
                data.targetFiles.length > 0
                    ? `Archivos objetivo: ${data.targetFiles.join(", ")}.`
                    : "Archivos objetivo: ninguno.",
                "",
                `Controles ejecutados: **${checks.length}**.`,
                ...checkLines,
                "",
                blockers.length > 0
                    ? `Bloqueos: ${blockers.map(item => item?.id || "control").join(", ")}.`
                    : "Bloqueos: ninguno.",
                warnings.length > 0
                    ? `Advertencias: ${warnings.map(item => item?.id || "control").join(", ")}.`
                    : "Advertencias: ninguna.",
                "",
                `Puede ejecutar cambios: **${data?.canExecute === true ? "sí" : "no"}**.`,
                `Concede aprobación: **${data?.grantsApproval === true ? "sí" : "no"}**.`,
                data?.requiresHumanApproval === true
                    ? "La ejecución del plan todavía requiere aprobación humana explícita."
                    : "La revisión no solicita una mutación.",
                "No se modificó ni publicó ningún archivo."
            ].filter(Boolean).join("\n"),
            {
                decision:
                    data?.decision ||
                    null,
                status:
                    data?.status ||
                    null,
                instruction:
                    data?.instruction ||
                    null,
                targetFiles:
                    data?.targetFiles ||
                    [],
                checkCount:
                    checks.length,
                blockers:
                    blockers.map(item =>
                        item?.id ||
                        "control"
                    ),
                warnings:
                    warnings.map(item =>
                        item?.id ||
                        "control"
                    ),
                canExecute:
                    data?.canExecute ===
                    true,
                grantsApproval:
                    data?.grantsApproval ===
                    true
            },
            {
                type:
                    "CHIEF_ARCHITECT_RESPONSE",
                analysisId:
                    context.analysisId,
                exposeRaw:
                    false
            }
        );
    }

    if (toolName === "browser.inspect") {
        const dom =
            String(data?.dom || data?.stdout || "");
        const title =
            dom.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
                ?.replace(/\s+/g, " ")
                .trim() ||
            "sin titulo";

        return composer.composeJarvis(
            [
                "Navegador verificado",
                "",
                `Chrome/Edge renderizo **${data?.url || "la URL solicitada"}**.`,
                `Titulo detectado: **${title}**.`,
                `Estado: ${data?.status || "BROWSER_INSPECT_OK"}.`,
                `Tiempo: ${Number(data?.durationMs || 0)} ms.`
            ].join("\n"),
            {
                tool: toolName,
                url: data?.url || null,
                title,
                status: data?.status || null,
                engine: data?.engine || null,
                durationMs: data?.durationMs || null
            },
            {
                type: "BROWSER_INSPECTION_RESPONSE",
                analysisId: context.analysisId,
                exposeRaw: false
            }
        );
    }

    if (["browser.screenshot", "browser.open", "document.pdf"].includes(toolName)) {
        queueActuatorArtifact(toolName, data);
        return composer.composeJarvis(
            [
                toolName === "browser.open"
                    ? "Navegador abierto"
                    : toolName === "document.pdf"
                        ? "PDF creado"
                        : "Captura creada",
                "",
                `Estado: ${data?.status || "COMPLETED"}.`,
                data?.url ? `URL: ${data.url}.` : "",
                data?.output ? `Archivo: **${data.output}**.` : ""
            ].filter(Boolean).join("\n"),
            {
                tool: toolName,
                url: data?.url || null,
                output: data?.output || null,
                status: data?.status || null,
                engine: data?.engine || null
            },
            {
                type: "BROWSER_ACTUATOR_RESPONSE",
                analysisId: context.analysisId
            }
        );
    }

    if (toolName === "document.create") {
        queueActuatorArtifact(toolName, data);
        return composer.composeJarvis(
            [
                "Documento creado",
                "",
                `Formato: **${String(data?.format || "archivo").toUpperCase()}**.`,
                `Archivo: **${data?.output || "sin ruta"}**.`,
                `Tamano: ${Number(data?.bytes || 0)} bytes.`
            ].join("\n"),
            data,
            {
                type: "DOCUMENT_CREATE_RESPONSE",
                analysisId: context.analysisId
            }
        );
    }

    if (toolName === "page.create") {
        queueActuatorArtifact(toolName, data);
        const pageDeliveryLine =
            data?.artifactMode === "browser_verified_download"
                ? (
                    data?.downloadTriggered === true
                        ? "El HTML fue generado y verificado en el navegador y la descarga local fue iniciada. El bridge desactualizado no escribió el archivo y no se publicó ni desplegó."
                        : "El HTML fue generado y verificado en el navegador y quedó preparado para descarga. El bridge desactualizado no escribió el archivo y no se publicó ni desplegó."
                )
                : "El HTML fue creado físicamente por el bridge local y verificado antes de reportarse como completado; quedó disponible para vista previa y descarga, sin publicación ni despliegue automático.";
        return composer.composeJarvis(
            [
                "Landing creada",
                "",
                `Estado: **${data?.status || "COMPLETED"}**.`,
                `Archivo: **${data?.output || "sin ruta"}**.`,
                `Formato: **${data?.mimeType || "text/html"}**.`,
                `Tamano: ${Number(data?.bytes || 0)} bytes.`,
                data?.sha256
                    ? `SHA-256: **${data.sha256}**.`
                    : "SHA-256: no informado.",
                pageDeliveryLine
            ].join("\n"),
            data,
            {
                type: "PAGE_CREATE_RESPONSE",
                analysisId: context.analysisId
            }
        );
    }

    if (toolName === "reel.create") {
        const videoOutput =
            data?.videoOutput ||
            data?.output ||
            "";
        const reelData = {
            ...data,
            output: videoOutput,
            mimeType:
                data?.mimeType ||
                "video/mp4"
        };
        queueActuatorArtifact(toolName, reelData);
        return composer.composeJarvis(
            [
                "Reel creado",
                "",
                `Estado: **${data?.status || "COMPLETED"}**.`,
                `Video: **${videoOutput || "sin ruta"}**.`,
                `Formato: **${reelData.mimeType}**.`,
                `Tamano: ${Number(data?.bytes || 0)} bytes.`,
                data?.sha256
                    ? `SHA-256: **${data.sha256}**.`
                    : "SHA-256: no informado.",
                Number(data?.durationSeconds || 0) > 0
                    ? `Duracion: ${Number(data.durationSeconds)} segundos.`
                    : "",
                Number(data?.width || 0) > 0 && Number(data?.height || 0) > 0
                    ? `Resolucion: ${Number(data.width)}x${Number(data.height)}.`
                    : "",
                data?.studioOutput
                    ? `Estudio editable auxiliar: **${data.studioOutput}**.`
                    : "",
                "El video final fue generado fisicamente por el bridge local, con el formato real indicado arriba y verificado antes de reportar la mision como completada; no fue publicado automaticamente."
            ].filter(Boolean).join("\n"),
            reelData,
            {
                type: "REEL_CREATE_RESPONSE",
                analysisId: context.analysisId
            }
        );
    }

    if (toolName === "image.generate") {
        queueActuatorArtifact(toolName, data);
        return composer.composeJarvis(
            [
                "Imagen generada",
                "",
                `Modelo: **${data?.model || "Gemini Image"}**.`,
                `Formato: ${data?.mimeType || "imagen"}.`,
                `Resolucion solicitada: ${data?.imageSize || "1K"} (${data?.aspectRatio || "1:1"}).`,
                data?.output ? `Archivo: **${data.output}** (${Number(data?.bytes || 0)} bytes).` : "Archivo local: no disponible.",
                data?.text || "La imagen quedo disponible en el resultado estructurado."
            ].join("\n"),
            {
                ...data,
                imageBase64: undefined
            },
            {
                type: "IMAGE_GENERATION_RESPONSE",
                analysisId: context.analysisId,
                exposeRaw: false
            }
        );
    }

    if (toolName === "connector.list") {
        const connectors =
            Array.isArray(data?.connectors)
                ? data.connectors
                : [];
        return composer.composeJarvis(
            [
                "Conectores",
                "",
                `Conectados: **${Number(data?.connectedCount || 0)}**.`,
                connectors.length
                    ? connectors.map(item => `- ${item.id}: ${item.connected ? "CONECTADO" : "DESCONECTADO"}`).join("\n")
                    : "No hay conectores externos configurados; Jarvis no va a fingir acceso."
            ].join("\n"),
            data,
            {
                type: "CONNECTOR_LIST_RESPONSE",
                analysisId: context.analysisId
            }
        );
    }

    if (toolName === "agent.delegate") {
        const delegatedResults =
            Array.isArray(
                data?.results
            )
                ? data.results
                : [];
        return composer.composeJarvis(
            [
                "Delegacion completada",
                "",
                `Tareas ejecutadas en paralelo: **${Number(data?.taskCount || 0)}**.`,
                `Estado: ${data?.ok === true ? "COMPLETO" : "CON FALLAS"}.`,
                `Tiempo total: ${Number(data?.durationMs || 0)} ms.`,
                delegatedResults.length >
                    0
                    ? "Resultados verificados:"
                    : "No se recibieron resultados verificables de las subtareas.",
                ...delegatedResults.map(
                    delegatedResultLine
                )
            ].join("\n"),
            data,
            {
                type: "AGENT_DELEGATION_RESPONSE",
                analysisId: context.analysisId
            }
        );
    }

    if (toolName === "system.supervision.runNow") {
        return composer.composeJarvis(
            [
                "Supervision ejecutada",
                "",
                `Estado: **${data?.status || "UNKNOWN"}**.`,
                `Puntuacion: **${Number(data?.score || 0)}/100**.`,
                `Comprobaciones: ${Number(data?.summary?.total || 0)}; fallas: ${Number(data?.summary?.failed || 0)}.`,
                data?.reportId ? `Reporte persistido: **${data.reportId}**.` : ""
            ].filter(Boolean).join("\n"),
            data,
            {
                type: "SUPERVISION_RUN_NOW_RESPONSE",
                analysisId: context.analysisId
            }
        );
    }

    return null;
}

function composeActuatorFailure(
    toolName = "",
    result = {},
    context = {}
) {
    if (!window.ResponseComposer?.composeJarvis) {
        return null;
    }

    const errorText = String(
        result?.error?.message ||
        result?.error ||
        result?.status ||
        "TOOL_FAILED"
    );

    if (toolName === "image.generate") {
        const credentialMissing =
            /GEMINI_KEY_MISSING|failed-precondition/i.test(errorText);
        const credentialInvalid =
            /API key not valid|API_KEY_INVALID/i.test(errorText);
        return window.ResponseComposer.composeJarvis(
            [
                "Generacion de imagen no disponible",
                "",
                credentialMissing
                    ? "El actuador esta desplegado y autenticado, pero falta configurar la credencial **GEMINI_KEY** en GitHub/Firebase."
                    : credentialInvalid
                        ? "El actuador esta desplegado y autenticado, pero Google rechazo la credencial **GEMINI_KEY** configurada. Debe reemplazarse por una clave valida."
                        : `La generacion fallo: ${errorText.slice(0, 240)}.`,
                "No se genero ni se fingio una imagen."
            ].join("\n"),
            {
                ok: false,
                tool: toolName,
                status: result?.status || "FAILED",
                credentialMissing,
                credentialInvalid
            },
            {
                type: "IMAGE_GENERATION_FAILURE",
                analysisId: context.analysisId,
                exposeRaw: false
            }
        );
    }

    if (
        toolName.startsWith("browser.") ||
        toolName.startsWith("document.") ||
        toolName === "system.supervision.runNow"
    ) {
        const validationFailures =
            [
                ...(
                    Array.isArray(
                        result
                            ?.validationFailures
                    )
                        ? result
                            .validationFailures
                        : []
                ),
                ...(
                    Array.isArray(
                        result
                            ?.validation
                            ?.failures
                    )
                        ? result
                            .validation
                            .failures
                        : []
                )
            ]
                .filter(
                    (
                        value,
                        index,
                        items
                    ) =>
                        value &&
                        items.indexOf(
                            value
                        ) ===
                        index
                )
                .slice(
                    0,
                    30
                );
        const validationActual =
            result
                ?.validation
                ?.actual ||
            {};
        return window.ResponseComposer.composeJarvis(
            [
                "Actuador no completado",
                "",
                `Herramienta: **${toolName}**.`,
                `Causa: ${errorText}.`
            ].join("\n"),
            {
                ok: false,
                tool: toolName,
                status: result?.status || "FAILED",
                error: errorText,
                validationFailures,
                wordCount:
                    Number(
                        result?.wordCount ||
                        validationActual
                            .wordCount
                    ) ||
                    0,
                sectionCount:
                    Number(
                        result?.sectionCount ||
                        validationActual
                            .sectionCount
                    ) ||
                    0,
                tableBlueprintCount:
                    Number(
                        result
                            ?.tableBlueprintCount ||
                        validationActual
                            .tableCount
                    ) ||
                    0,
                templateCount:
                    Number(
                        result?.templateCount ||
                        validationActual
                            .templateCount
                    ) ||
                    0,
                questionCount:
                    Number(
                        result?.questionCount ||
                        validationActual
                            .questionCount
                    ) ||
                    0,
                answerKeyCount:
                    Number(
                        result?.answerKeyCount ||
                        validationActual
                            .answerKeyCount
                    ) ||
                    0,
                vehicleCount:
                    Number(
                        result?.vehicleCount ||
                        validationActual
                            .vehicleCount
                    ) ||
                    0,
                partCount:
                    Number(
                        result?.partCount ||
                        validationActual
                            .partCount
                    ) ||
                    0,
                kpiCount:
                    Number(
                        result?.kpiCount ||
                        validationActual
                            .kpiCount
                    ) ||
                    0,
                implementationDayCoverage:
                    Number(
                        result
                            ?.implementationDayCoverage ||
                        validationActual
                            .implementationDayCoverage
                    ) ||
                    0,
                continuationCount:
                    Number(
                        result
                            ?.continuationCount
                    ) ||
                    0,
                segmentedComposition:
                    result
                        ?.segmentedComposition ===
                    true
            },
            {
                type: "ACTUATOR_FAILURE_RESPONSE",
                analysisId: context.analysisId,
                exposeRaw: false
            }
        );
    }

    return null;
}

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
            return composeActuatorFailure(
                toolName,
                result,
                context
            ) || window.ResponseComposer.error(
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

        const semanticPayload =
            result?.data &&
            typeof result.data === "object" &&
            !Array.isArray(result.data)
                ? result.data
                : result;
        const observation =
            window.ResponseComposer.composeToolObservation(
                toolName,
                semanticPayload,
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
            composeActuatorResponse(
                toolName,
                semanticPayload,
                context
            ) ||
            window.ResponseComposer.success(
                semanticPayload,
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
            (
                call?.name === "repo.patchPreview" ||
                call?.name === "repo.patchPreviewExact"
            ) &&
            (
                runtimePayload?.blocked === true ||
                runtimePayload?.status === "PATCH_PREVIEW_NEEDS_EXACT_BLOCK" ||
                runtimePayload?.status === "PATCH_PREVIEW_BLOCKED_INVALID_REWRITE" ||
                runtimePayload?.code === "PATCH_BUILDER_BLOCKED_NO_EXACT_SEARCH_REPLACE" ||
                runtimePayload?.code === "EXACT_SEARCH_BLOCK_NOT_FOUND" ||
                runtimePayload?.code === "PATCH_PREVIEW_BLOCKED_BY_GOVERNANCE" ||

                runtimePayload?.data?.blocked === true ||
                runtimePayload?.data?.status === "PATCH_PREVIEW_NEEDS_EXACT_BLOCK" ||
                runtimePayload?.data?.status === "PATCH_PREVIEW_BLOCKED_INVALID_REWRITE" ||
                runtimePayload?.data?.code === "PATCH_BUILDER_BLOCKED_NO_EXACT_SEARCH_REPLACE" ||
                runtimePayload?.data?.code === "EXACT_SEARCH_BLOCK_NOT_FOUND" ||
                runtimePayload?.data?.code === "PATCH_PREVIEW_BLOCKED_BY_GOVERNANCE" ||

                runtimePayload?.runtimeResult?.blocked === true ||
                runtimePayload?.runtimeResult?.status === "PATCH_PREVIEW_NEEDS_EXACT_BLOCK" ||
                runtimePayload?.runtimeResult?.status === "PATCH_PREVIEW_BLOCKED_INVALID_REWRITE" ||
                runtimePayload?.runtimeResult?.code === "PATCH_BUILDER_BLOCKED_NO_EXACT_SEARCH_REPLACE" ||
                runtimePayload?.runtimeResult?.code === "EXACT_SEARCH_BLOCK_NOT_FOUND" ||
                runtimePayload?.runtimeResult?.code === "PATCH_PREVIEW_BLOCKED_BY_GOVERNANCE" ||

                runtimeText.includes("PATCH_PREVIEW_NEEDS_EXACT_BLOCK") ||
                runtimeText.includes("PATCH_PREVIEW_BLOCKED_INVALID_REWRITE") ||
                runtimeText.includes("SEARCH_REPLACE_REQUIRED") ||
                runtimeText.includes("PATCH_BUILDER_BLOCKED_NO_EXACT_SEARCH_REPLACE") ||
                runtimeText.includes("EXACT_SEARCH_BLOCK_NOT_FOUND") ||
                runtimeText.includes("PATCH_PREVIEW_BLOCKED_BY_GOVERNANCE")
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

  window.JarvisToolsBridge["codex.patch"] = async function codexPatch(payload) {
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
