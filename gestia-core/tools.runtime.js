/**
 * JARVIS TOOL RUNTIME - v7.0 (PRODUCTION GRADE)
 * Arquitectura: Singleton Registry + Middleware Chain + Error Boundary
 */

import {
    registerJarvisMultifunctionTools
} from "./jarvis/jarvis.multitool.pack.js?v=sia7-semantic-coverage-audit-v54-20260724";
import {
    registerJarvisActuatorTools
} from "./jarvis/jarvis.actuator.pack.js?v=sia7-real-actuators-v3.6-pdf-visual-20260714";
import {
    reviewChiefArchitectPlan
} from "./jarvis/jarvis.chief.architect.js?v=sia7-chief-architect-v1-20260714";
import {
    analyzeRepoSourceStructure,
    buildExecutableSourceView,
    extractQualifiedSourceIdentifiers
} from "./repo/repo.source.structure.js?v=sia7-explicit-repo-targets-v3-20260724";

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
                "[RUNTIME_ERROR] Middleware inválido"
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
                error:
                    `[RUNTIME_ERROR] TOOL_NOT_FOUND: ${name}`,
                tool: name
            };
        }

                const runtimeDryRun =
            args?.dryRun === true ||
            String(args?.dryRun).toLowerCase() === "true";

        if (
            runtimeDryRun !== true &&
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
                crypto?.randomUUID?.() ||
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

            // Propagación de fallos de contrato desde la herramienta
            if (result && result.ok === false) {
                return {
                    ...result,
                    tool: name,
                    executionId: executionContext.executionId,
                    timestamp: Date.now()
                };
            }

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

function countUnescapedCharacter(
    value = "",
    character = ""
) {
    let count =
        0;

    const text =
        String(value || "");

    for (
        let index = 0;
        index < text.length;
        index += 1
    ) {
        if (
            text[index] === character &&
            text[index - 1] !== "\\"
        ) {
            count += 1;
        }
    }

    return count;
}

function hasBalancedSquareBrackets(
    value = ""
) {
    const text =
        String(value || "");

    let depth =
        0;

    for (const char of text) {
        if (char === "[") {
            depth += 1;
        }

        if (char === "]") {
            depth -= 1;
        }

        if (depth < 0) {
            return false;
        }
    }

    return depth === 0;
}

function hasClosedTemplatePlaceholders(
    value = ""
) {
    const text =
        String(value || "");

    let index =
        0;

    while (index < text.length) {
        const start =
            text.indexOf(
                "${",
                index
            );

        if (start < 0) {
            return true;
        }

        const end =
            text.indexOf(
                "}",
                start + 2
            );

        if (end < 0) {
            return false;
        }

        index =
            end + 1;
    }

    return true;
}

function countTemplatePlaceholders(
    value = ""
) {
    return (
        String(value || "")
            .match(/\$\{/g) ||
        []
    )
        .length;
}

function validatePatchPreviewRewrite(
    search = "",
    replace = ""
) {
    const issues =
        [];

    const searchText =
        String(search || "");

    const replaceText =
        String(replace || "");

    if (!searchText.trim()) {
        issues.push(
            "SEARCH_REQUIRED"
        );
    }

    if (!replaceText.trim()) {
        issues.push(
            "REPLACE_REQUIRED"
        );
    }

    if (
        /\b(?:p[trblxy]?|gap)-\d+(?:\.\d+){2,}(?=$|[\s"'`<>;])/i.test(
            replaceText
        )
    ) {
        issues.push(
            "INVALID_TAILWIND_DECIMAL_CLASS"
        );
    }

    if (
        /\b(?:[a-z]+:)*scale-\d+(?:\.\d+)+(?=$|[\s"'`<>;])/i.test(
            replaceText
        )
    ) {
        issues.push(
            "INVALID_SCALE_CLASS"
        );
    }

    if (
        !hasBalancedSquareBrackets(
            replaceText
        )
    ) {
        issues.push(
            "UNBALANCED_SQUARE_BRACKETS"
        );
    }

    if (
        countUnescapedCharacter(
            replaceText,
            "`"
        ) % 2 !== 0
    ) {
        issues.push(
            "UNBALANCED_BACKTICKS"
        );
    }

    if (
        !hasClosedTemplatePlaceholders(
            replaceText
        )
    ) {
        issues.push(
            "BROKEN_TEMPLATE_PLACEHOLDER"
        );
    }

    if (
        countTemplatePlaceholders(searchText) !==
        countTemplatePlaceholders(replaceText)
    ) {
        issues.push(
            "TEMPLATE_PLACEHOLDER_COUNT_CHANGED"
        );
    }

    return {
        ok:
            issues.length === 0,
        issues
    };
}

function recordToolRuntimeLearningIncident(input = {}) {
    try {
        const engine =
            typeof window !== "undefined"
                ? window.JarvisAutonomyEngine
                : null;

        if (
            !engine ||
            typeof engine.record !== "function"
        ) {
            return null;
        }

        return engine.record({
            type:
                "LEARNING_INCIDENT",
            category:
                input.category ||
                "PATCH_PREVIEW_SAFETY",
            status:
                input.status ||
                "blocked",
            stage:
                input.stage ||
                "tool_runtime_patch_preview",
            operation:
                input.operation ||
                "repo.patchPreview",
            file:
                input.file ||
                "",
            reason:
                input.reason ||
                "PATCH_PREVIEW_BLOCKED",
            symptom:
                input.symptom ||
                "",
            wrongBehavior:
                input.wrongBehavior ||
                "",
            fixRule:
                input.fixRule ||
                "Keep patchPreview dry-run and require exact safe search/replace before approval.",
            relatedCommit:
                "41.35",
            sourceTraceId:
                input.sourceTraceId ||
                input.traceId ||
                "",
            confidence:
                typeof input.confidence === "number"
                    ? input.confidence
                    : 0.95,
            context: {
                ...(input.context || {}),
                learningPolicy: {
                    proposalAutonomy:
                        true,
                    writeAllowed:
                        false,
                    writeAuthorization:
                        false,
                    approvalRequiredForWrite:
                        true
                }
            }
        });
    }
    catch(error) {
        console.warn(
            "[TOOL_RUNTIME_LEARNING_RECORD_FAILED_41_35]",
            error
        );
    }

    return null;
}


/* =====================================================
   JARVIS TOOL RUNTIME — WINDOW SINGLETON SYNC
   Commit 25.1
   Evita que window.JarvisToolRuntime apunte a un runtime vacío.
===================================================== */

if (
    typeof window !== "undefined"
) {
    if (
        window.JarvisToolRuntime &&
        window.JarvisToolRuntime !== JarvisToolRuntime &&
        window.JarvisToolRuntime?._registry instanceof Map &&
        window.JarvisToolRuntime._registry.size > 0 &&
        JarvisToolRuntime._registry.size === 0
    ) {
        window.JarvisToolRuntime._registry.forEach(
            (tool, name) => {
                JarvisToolRuntime._registry.set(
                    name,
                    tool
                );
            }
        );
    }

   window.JarvisToolRuntime =
    JarvisToolRuntime;

window.JarvisTools =
    JarvisToolRuntime;

window.toolsRuntime =
    window.toolsRuntime ||
    {};

    window.toolsRuntime.execute =
        JarvisToolRuntime.execute.bind(
            JarvisToolRuntime
        );

    window.toolsRuntime.get =
        JarvisToolRuntime.get.bind(
            JarvisToolRuntime
        );

    window.toolsRuntime.has =
        JarvisToolRuntime.has.bind(
            JarvisToolRuntime
        );

    window.toolsRuntime.list =
        JarvisToolRuntime.list.bind(
            JarvisToolRuntime
        );
}

registerJarvisMultifunctionTools(
    JarvisToolRuntime
);

registerJarvisActuatorTools(
    JarvisToolRuntime
);

// Registro de herramientas Read-Only iniciales
JarvisToolRuntime.register({
    name: "repo.audit",
    description: "Auditoría profunda del repositorio: total de archivos y módulos.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_AUDIT_RESULT_V7",
    execute: async (args, context) => {
        // Importación dinámica del Hub existente para mantener el desacoplamiento
        const { scanRepo } = await import('/gestia-core/hubs/repo.hub.js');
        return await scanRepo(args);
    }
});

// ==========================================
// REPO TOOL PACK V7
// ==========================================

JarvisToolRuntime.register({
    name: "repo.scan",
    description: "Escanea la estructura de un directorio específico y devuelve metadatos.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_SCAN_RESULT",
    execute: async (args, context) => {
        const { scanRepo } = await import('/gestia-core/hubs/repo.hub.js');
        return await scanRepo(args);
    }
});

JarvisToolRuntime.register({
    name: "repo.read",
    description: "Lee y extrae metadatos/contenido disponible de un archivo para el contexto del agente.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_FILE_CONTENT",
    inputSchema: {
        type: "object",
        required: ["file"],
        properties: {
            file: {
                type: "string",
                description: "Ruta real verificada del archivo que se debe leer."
            },
            startLine: {
                type: "integer",
                description: "Primera linea opcional."
            },
            endLine: {
                type: "integer",
                description: "Ultima linea opcional."
            },
            maxBytes: {
                type: "integer",
                description: "Limite opcional de bytes."
            }
        },
        additionalProperties: false
    },
    execute: async (args = {}, context = {}) => {
        const file =
            args.file ||
            args.path ||
            args.target ||
            "";

        if (!file) {
            return {
                ok: false,
                error: "FILE_REQUIRED",
                tool: "repo.read"
            };
        }


        const normalizedFile =
            String(file)
                .replace(/^\.\/+/, "")
                .replace(/^\/+/, "")
                .trim();

        const parseLineNumber =
            function(value) {
                const parsed =
                    Number.parseInt(
                        value,
                        10
                    );

                return Number.isFinite(parsed) &&
                    parsed > 0
                    ? parsed
                    : null;
            };

        const requestedStartLine =
            parseLineNumber(
                args.startLine ||
                args.fromLine ||
                args.lineStart
            );

        const requestedEndLine =
            parseLineNumber(
                args.endLine ||
                args.toLine ||
                args.lineEnd
            );

        const hasRequestedLineRange =
            Boolean(
                requestedStartLine ||
                requestedEndLine
            );

        const requestedLineRange =
            hasRequestedLineRange
                ? {
                    startLine:
                        requestedStartLine ||
                        1,
                    endLine:
                        Math.max(
                            requestedStartLine || 1,
                            requestedEndLine ||
                            requestedStartLine ||
                            1
                        )
                }
                : null;

        const applyRequestedLineRange =
            function(result = {}) {
                if (
                    !requestedLineRange ||
                    result?.partial === true ||
                    result?.lineRange
                ) {
                    return result;
                }

                const content =
                    typeof result?.content === "string"
                        ? result.content
                        : typeof result?.text === "string"
                            ? result.text
                            : "";

                if (!content) {
                    return result;
                }

                const lines =
                    content.split(/\r?\n/);

                const startLine =
                    Math.min(
                        requestedLineRange.startLine,
                        Math.max(lines.length, 1)
                    );

                const endLine =
                    Math.min(
                        requestedLineRange.endLine,
                        lines.length
                    );

                const rangedContent =
                    lines
                        .slice(
                            startLine - 1,
                            endLine
                        )
                        .join("\n");

                return {
                    ...result,
                    content:
                        rangedContent,
                    size:
                        rangedContent.length,
                    partial:
                        true,
                    startLine,
                    endLine,
                    totalLines:
                        lines.length,
                    lineRange: {
                        startLine,
                        endLine,
                        totalLines:
                            lines.length
                    }
                };
            };

                        if (
            window.JarvisLocalBridge?.readFile
        ) {
            const bridgeRead =
                await window.JarvisLocalBridge.readFile({
                    file:
                        normalizedFile,
                    path:
                        normalizedFile,
                    maxBytes:
                        args.maxBytes ||
                        300000,
                    ...(requestedLineRange || {}),
                    source:
                        "jarvis_repo_read_v7"
                });

            if (
                bridgeRead?.ok === true &&
                typeof bridgeRead.content === "string"
            ) {
                const materializedBridgeRead =
                    applyRequestedLineRange(
                        bridgeRead
                    );

                return {
                    ok: true,
                    file:
                        normalizedFile,
                    path:
                        bridgeRead.path ||
                        normalizedFile,
                    sourceStructure:
                        analyzeRepoSourceStructure(
                            materializedBridgeRead.content
                        ),
                    ...materializedBridgeRead,
                    content:
                        materializedBridgeRead.content,
                    size:
                        materializedBridgeRead.size ||
                        bridgeRead.size ||
                        bridgeRead.content.length,
                    partial:
                        materializedBridgeRead.partial === true ||
                        Boolean(requestedLineRange),
                    startLine:
                        materializedBridgeRead.startLine ||
                        requestedLineRange?.startLine ||
                        null,
                    endLine:
                        materializedBridgeRead.endLine ||
                        requestedLineRange?.endLine ||
                        null,
                    totalLines:
                        materializedBridgeRead.totalLines ||
                        materializedBridgeRead.lineRange?.totalLines ||
                        null,
                    lineRange:
                        materializedBridgeRead.lineRange ||
                        (
                            requestedLineRange
                                ? {
                                    ...requestedLineRange,
                                    totalLines:
                                        materializedBridgeRead.totalLines ||
                                        null
                                }
                                : null
                        ),
                    source:
                        bridgeRead.source ||
                        "jarvis_local_bridge_read_client_v7",
                    note:
                        "CONTENT_AVAILABLE_FROM_LOCAL_BRIDGE",
                    tool:
                        "repo.read"
                };
            }

            if (
                bridgeRead?.ok === false &&
                bridgeRead?.status !== "FILE_NOT_FOUND"
            ) {
                console.warn(
                    "⚠️ [REPO_READ_BRIDGE_FAIL]",
                    bridgeRead
                );
            }
        }

        const {
            findRepoFile,
            loadRepoContext,
            scanRepo
        } =
            await import('/gestia-core/hubs/repo.hub.js');

        let found =
    null;

try {
    found =
        await findRepoFile({
            file:
                normalizedFile,
            path:
                normalizedFile,
            target:
                normalizedFile
        });
}
catch(error) {
    found =
        {
            ok:
                false,
            error:
                error?.message ||
                String(error)
        };
}

        if (
            found &&
            found.ok !== false &&
            (
                found.content ||
                found.text ||
                found.source ||
                found.path ||
                found.file ||
                found.name
            )
        ) {
            const materializedFound =
                applyRequestedLineRange(found);

            return {
                ok: true,
                file:
                    normalizedFile,
                sourceStructure:
                    analyzeRepoSourceStructure(
                        materializedFound.content ||
                        materializedFound.text ||
                        materializedFound.source ||
                        ""
                    ),
                ...materializedFound
            };
        }

        let contextResult =
    null;

try {
    contextResult =
        await loadRepoContext({
            file:
                normalizedFile,
            path:
                normalizedFile,
            target:
                normalizedFile
        });
}
catch(error) {
    contextResult =
        {
            ok:
                false,
            error:
                error?.message ||
                String(error)
        };
}

        if (
            contextResult &&
            contextResult.ok !== false &&
            (
                contextResult.content ||
                contextResult.text ||
                contextResult.source ||
                contextResult.path ||
                contextResult.file
            )
        ) {
            const materializedContext =
                applyRequestedLineRange(
                    contextResult
                );

            return {
                ok: true,
                file:
                    normalizedFile,
                sourceStructure:
                    analyzeRepoSourceStructure(
                        materializedContext.content ||
                        materializedContext.text ||
                        materializedContext.source ||
                        ""
                    ),
                ...materializedContext
            };
        }

        let scan =
    null;

try {
    scan =
        await scanRepo({});
}
catch(error) {
    scan =
        null;
}
        const matched =
            scan?.files?.find?.(
                item =>
                    item?.path === normalizedFile ||
                    item?.file === normalizedFile ||
                    item?.name === normalizedFile ||
                    String(item?.path || item?.file || item?.name || "")
                        .endsWith(`/${normalizedFile}`)
            ) ||
            null;

        if (matched) {
            const matchedContent =
                applyRequestedLineRange({
                    content:
                        matched.content ||
                        matched.text ||
                        matched.source ||
                        ""
                }).content ||
                "";

            return {
                ok: true,
                file:
                    normalizedFile,
                path:
                    matched.path ||
                    matched.file ||
                    matched.name ||
                    normalizedFile,
                metadata:
                    matched,
                sourceStructure:
                    analyzeRepoSourceStructure(
                        matchedContent
                    ),
                content:
                    matchedContent ||
                    null,
                note:
                    matched.content ||
                    matched.text ||
                    matched.source
                        ? "CONTENT_AVAILABLE_FROM_REPO_INDEX"
                        : "FILE_FOUND_METADATA_ONLY"
            };
        }

        return {
            ok: false,
            error:
                "FILE_NOT_FOUND",
            file:
                normalizedFile,
            found,
            contextResult,
            tool:
                "repo.read"
        };
    }
});
window.JarvisLocalBridge ||= {};
window.JarvisLocalBridge.verifyIdentity ||= async function({
    force = false
} = {}) {
    const now =
        Date.now();

    const cached =
        window.JarvisLocalBridge.__identityCache;

    if (
        force !== true &&
        cached?.checkedAt &&
        now - cached.checkedAt < 10000
    ) {
        return cached;
    }

    try {
        const [expectedResponse, bridgeResponse] =
            await Promise.all([
                fetch(
                    "/jarvis-runtime-contract.json",
                    {
                        cache: "no-store"
                    }
                ),
                fetch(
                    "http://localhost:3344/health",
                    {
                        cache: "no-store"
                    }
                )
            ]);

        const expected =
            await expectedResponse.json();

        const bridgeHealth =
            await bridgeResponse.json();

        const actual =
            bridgeHealth?.identity || null;

        const compatible =
            expectedResponse.ok === true &&
            bridgeResponse.ok === true &&
            actual?.ok === true &&
            actual?.contract?.projectId === expected.projectId &&
            actual?.contract?.releaseId === expected.releaseId &&
            actual?.contract?.branch === expected.branch &&
            actual?.git?.branch === expected.branch;

        const result = {
            ok: compatible,
            status:
                compatible
                    ? "BRIDGE_IDENTITY_OK"
                    : "BRIDGE_IDENTITY_MISMATCH",
            expected,
            actual,
            bridgeRoot:
                bridgeHealth?.root ||
                actual?.root ||
                null,
            actuators:
                bridgeHealth?.actuators ||
                {},
            checkedAt: now
        };

        window.JarvisLocalBridge.__identityCache =
            result;

        return result;
    }
    catch(error) {
        const result = {
            ok: false,
            status: "BRIDGE_UNREACHABLE",
            error:
                error?.message || String(error),
            checkedAt: now
        };

        window.JarvisLocalBridge.__identityCache =
            result;

        return result;
    }
};

window.JarvisLocalBridge.requestJson ||= async function(
    path,
    payload = {},
    options = {}
) {
    const identity =
        await window.JarvisLocalBridge.verifyIdentity({
            force:
                options.forceIdentityCheck === true
        });

    if (identity.ok !== true) {
        return {
            ...identity,
            ok: false,
            success: false,
            error:
                identity.status,
            path
        };
    }

    const timeoutMs =
        Math.max(
            5000,
            Number(options.timeoutMs || payload.timeoutMs || 30000)
        );

    const controller =
        new AbortController();

    const timer =
        setTimeout(
            () => controller.abort(),
            timeoutMs
        );

    try {
        const response =
            await fetch(
                `http://localhost:3344${path}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Jarvis-Release-Id":
                            identity.expected.releaseId
                    },
                    body:
                        JSON.stringify(payload || {}),
                    signal:
                        controller.signal
                }
            );

        const rawText =
            await response.text();

        let result;

        try {
            result =
                JSON.parse(rawText);
        }
        catch(error) {
            result = {
                ok: false,
                status: "BRIDGE_BAD_JSON",
                error: "BRIDGE_ENDPOINT_DID_NOT_RETURN_JSON",
                raw:
                    rawText.slice(0, 1000),
                parseError:
                    error?.message || String(error)
            };
        }

        return {
            ...result,
            httpOk:
                response.ok,
            httpStatus:
                response.status,
            bridgeIdentity:
                identity
        };
    }
    catch(error) {
        return {
            ok: false,
            success: false,
            status:
                error?.name === "AbortError"
                    ? "BRIDGE_REQUEST_TIMEOUT"
                    : "BRIDGE_REQUEST_FAILED",
            error:
                error?.message || String(error),
            timeoutMs,
            path,
            bridgeIdentity:
                identity
        };
    }
    finally {
        clearTimeout(timer);
    }
};

window.JarvisLocalBridge.prepareWrite ||= async function(payload = {}) {
    return await window.JarvisLocalBridge.requestJson("/write/prepare", payload, { timeoutMs: payload.timeoutMs || 30000 });
};

window.JarvisLocalBridge.authorizeWrite ||= async function(payload = {}) {
    return await window.JarvisLocalBridge.requestJson("/write/authorize", payload, { timeoutMs: payload.timeoutMs || 30000 });
};

window.JarvisLocalBridge.writeFile ||= async function(payload = {}) {
    return await window.JarvisLocalBridge.requestJson(
        "/write",
        {
            fingerprint: payload.fingerprint,
            nonce: payload.nonce,
            objectiveId: payload.objectiveId,
            caseId: payload.caseId,
            source: payload.source || "jarvis_repo_write_v7_one_time"
        },
        { timeoutMs: payload.timeoutMs || 30000 }
    );
};

// Historical file+content adapter is intentionally unreachable; the live tool below uses prepare/authorize/consume.
if (false) JarvisToolRuntime.register({
    name:
        "repo.write.legacyBlocked",
    description:
        "Escribe un archivo del repo mediante Jarvis Local FS Bridge. Requiere aprobación Codex V2.",
        mutates:
        true,
    requiresApproval:
        true,
    output:
        "REPO_WRITE_RESULT",
    execute:
        async (args = {}, context = {}) => {
                        const isDryRun =
                args?.dryRun === true ||
                String(args?.dryRun).toLowerCase() === "true";
            if (
                isDryRun !== true &&
                context?.approved !== true
            ) {
                return {
                    ok:
                        false,
                    status:
                        "WRITE_REQUIRES_APPROVAL",
                    error:
                        "WRITE_REQUIRES_APPROVAL",
                    file:
                        args.file || args.path || "",
                    source:
                        "repo_write_runtime_v7"
                };
            }

            if (
                !window.JarvisLocalBridge?.writeFile
            ) {
                return {
                    ok:
                        false,
                    status:
                        "WRITE_BRIDGE_NOT_AVAILABLE",
                    error:
                        "WRITE_BRIDGE_NOT_AVAILABLE",
                    file:
                        args.file || args.path || "",
                    source:
                        "repo_write_runtime_v7"
                };
            }

            let materializedContent =
                args.content || "";

            const hasSearchReplace =
                typeof args.search === "string" &&
                typeof args.replace === "string" &&
                args.search.length > 0;

            if (!materializedContent && hasSearchReplace) {
                const readResult =
                    await window.JarvisToolRuntime.execute(
                        "repo.read",
                        {
                            file:
                                args.file || args.path || "",
                            path:
                                args.path || args.file || ""
                        },
                        {
                            ...context,
                            source:
                                "repo_write_materializer_v7"
                        }
                    );

                const currentContent =
                    readResult?.data?.content ||
                    readResult?.result?.content ||
                    readResult?.content ||
                    "";

                if (!currentContent.includes(args.search)) {
                    return {
                        ok:
                            false,
                        status:
                            "WRITE_SEARCH_NOT_FOUND",
                        error:
                            "WRITE_SEARCH_NOT_FOUND",
                        file:
                            args.file || args.path || "",
                        search:
                            args.search,
                        source:
                            "repo_write_materializer_v7"
                    };
                }

                materializedContent =
                    currentContent.replace(args.search, args.replace);
            }

            if (isDryRun === true) {
                return {
                    ok:
                        true,
                    status:
                        "WRITE_DRY_RUN_OK",
                    file:
                        args.file || args.path || "",
                    dryRun:
                        true,
                    searchFound:
                        hasSearchReplace ? true : null,
                    wouldWrite:
                        materializedContent.length,
                    source:
                        "repo_write_materializer_v7"
                };
            }

            const result =
                await window.JarvisLocalBridge.writeFile({
                    file:
                        args.file || args.path || "",
                    path:
                        args.path || args.file || "",
                    content:
                        materializedContent,
                    dryRun:
                        false,
                    source:
                        "repo_write_runtime_v7"
                });

            return {
                ok:
                    result?.ok === true,
                status:
                    result?.status ||
                    (
                        result?.ok === true
                            ? "WRITE_COMPLETED"
                            : "WRITE_FAILED"
                    ),
                file:
                    args.file || args.path || "",
                path:
                    result?.path || args.path || args.file || "",
                httpStatus:
                    result?.httpStatus || null,
                data:
                    result,
                source:
                    "repo_write_runtime_v7"
            };
        }
});

JarvisToolRuntime.register({
    name:
        "repo.postWriteVerify",
    description:
        "Verifica que un patch aprobado haya quedado aplicado leyendo el archivo después de escribir.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "POST_WRITE_VERIFY_RESULT",
    execute:
        async (args = {}, context = {}) => {
            const file =
                args.file ||
                args.path ||
                "";

            const search =
                args.search ||
                "";

            const replace =
                args.replace ||
                "";

            if (!file) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "FILE_REQUIRED",
                    tool: "repo.postWriteVerify"
                };
            }

            if (!replace) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "REPLACE_REQUIRED",
                    file,
                    tool: "repo.postWriteVerify"
                };
            }

            if (!window.JarvisLocalBridge?.readFile) {
                return {
                    ok: false,
                    success: false,
                    status: "LOCAL_BRIDGE_REQUIRED",
                    error: "JarvisLocalBridge.readFile no está disponible.",
                    file,
                    tool: "repo.postWriteVerify"
                };
            }

            const readBack =
                await window.JarvisLocalBridge.readFile({
                    file,
                    path:
                        args.path || file,
                    maxBytes:
                        args.maxBytes || 300000,
                    source:
                        "repo_post_write_verify_v1"
                });

            const content =
                readBack?.content || "";

            const replaceFound =
    typeof content === "string" &&
    content.includes(replace);

const replaceContainsSearch =
    search &&
    replace &&
    replace.includes(search);

const oldSearchGone =
    search
        ? (
            replaceContainsSearch
                ? null
                : !content.includes(search)
        )
        : null;

const ok =
    replaceFound === true &&
    (
        oldSearchGone === true ||
        oldSearchGone === null
    );

return {
    ok,
    success:
        ok,
    status:
        ok
            ? "POST_WRITE_VERIFY_OK"
            : "POST_WRITE_VERIFY_FAILED",
    file,
    path:
        args.path || file,
    replaceFound,
    oldSearchGone,
    replaceContainsSearch,
    contentLength:
        content.length,
    readBack,
    tool:
        "repo.postWriteVerify"
};
        }
});

// Commit 38 - JARVIS CODEX V2: Persistent Snapshot Store
const JarvisPersistentSnapshotStore =
    window.JarvisPersistentSnapshotStore || {
        key:
            "jarvis.repo.snapshots.v7",
        lastKey:
            "jarvis.repo.lastSnapshot.v7",
        maxSnapshots:
            25,
        load:
            () => {
                try {
                    const raw =
                        localStorage.getItem("jarvis.repo.snapshots.v7");

                    const parsed =
                        raw
                            ? JSON.parse(raw)
                            : [];

                    return Array.isArray(parsed)
                        ? parsed
                        : [];
                }
                catch(error) {
                    console.warn("[JARVIS_SNAPSHOT_STORE_LOAD_FAILED]", error);

                    return [];
                }
            },
        save:
            snapshots => {
                try {
                    const safeSnapshots =
                        Array.isArray(snapshots)
                            ? snapshots.slice(-25)
                            : [];

                    localStorage.setItem(
                        "jarvis.repo.snapshots.v7",
                        JSON.stringify(safeSnapshots)
                    );

                    const last =
                        safeSnapshots[safeSnapshots.length - 1] ||
                        null;

                    if (last) {
                        localStorage.setItem(
                            "jarvis.repo.lastSnapshot.v7",
                            JSON.stringify(last)
                        );
                    }

                    return {
                        ok: true,
                        count:
                            safeSnapshots.length,
                        lastSnapshotId:
                            last?.id || null
                    };
                }
                catch(error) {
                    console.warn("[JARVIS_SNAPSHOT_STORE_SAVE_FAILED]", error);

                    return {
                        ok: false,
                        error:
                            error.message
                    };
                }
            },
        hydrate:
            () => {
                const persisted =
                    JarvisPersistentSnapshotStore.load();

                const memory =
                    Array.isArray(window.JarvisRepoSnapshots)
                        ? window.JarvisRepoSnapshots
                        : [];

                const byId =
                    new Map();

                for (const snapshot of [...persisted, ...memory]) {
                    if (snapshot?.id) {
                        byId.set(snapshot.id, snapshot);
                    }
                }

                const merged =
                    [...byId.values()]
                        .sort((a, b) =>
                            String(a.timestamp || "").localeCompare(String(b.timestamp || ""))
                        )
                        .slice(-JarvisPersistentSnapshotStore.maxSnapshots);

                window.JarvisRepoSnapshots =
                    merged;

                window.JarvisLastRepoSnapshot =
                    merged[merged.length - 1] ||
                    null;

                JarvisPersistentSnapshotStore.save(merged);

                return {
                    ok: true,
                    count:
                        merged.length,
                    lastSnapshotId:
                        window.JarvisLastRepoSnapshot?.id || null
                };
            },
        push:
            snapshot => {
                if (!snapshot?.id) {
                    return {
                        ok: false,
                        error: "SNAPSHOT_ID_REQUIRED"
                    };
                }

                JarvisPersistentSnapshotStore.hydrate();

                window.JarvisRepoSnapshots =
                    window.JarvisRepoSnapshots || [];

                const filtered =
                    window.JarvisRepoSnapshots
                        .filter(item => item?.id !== snapshot.id);

                filtered.push(snapshot);

                window.JarvisRepoSnapshots =
                    filtered.slice(-JarvisPersistentSnapshotStore.maxSnapshots);

                window.JarvisLastRepoSnapshot =
                    snapshot;

                return JarvisPersistentSnapshotStore.save(
                    window.JarvisRepoSnapshots
                );
            },
        clear:
            () => {
                localStorage.removeItem("jarvis.repo.snapshots.v7");
                localStorage.removeItem("jarvis.repo.lastSnapshot.v7");

                window.JarvisRepoSnapshots =
                    [];

                window.JarvisLastRepoSnapshot =
                    null;

                return {
                    ok: true,
                    count: 0
                };
            }
    };

window.JarvisPersistentSnapshotStore =
    JarvisPersistentSnapshotStore;

JarvisPersistentSnapshotStore.hydrate();

JarvisToolRuntime.register({
    name:
        "repo.snapshotStore",
    description:
        "Administra snapshots persistentes de Jarvis: listar, rehidratar, limpiar y exportar.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "REPO_SNAPSHOT_STORE_RESULT_V7",
    execute:
        async (args = {}, context = {}) => {
            const action =
                args.action ||
                "list";

            if (action === "hydrate") {
                const result =
                    JarvisPersistentSnapshotStore.hydrate();

                return {
                    ok: true,
                    success: true,
                    status: "SNAPSHOT_STORE_HYDRATED",
                    ...result,
                    snapshots:
                        window.JarvisRepoSnapshots || [],
                    tool:
                        "repo.snapshotStore",
                    source:
                        "repo_snapshot_store_v7"
                };
            }

            if (action === "clear") {
                const approved =
                    args.approved === true ||
                    args.codexApproved === true ||
                    context?.approved === true ||
                    context?.codexApproved === true;

                if (approved !== true) {
                    return {
                        ok: false,
                        success: false,
                        status: "PENDING_APPROVAL",
                        error: "APPROVAL_REQUIRED: snapshotStore.clear",
                        tool:
                            "repo.snapshotStore"
                    };
                }

                const result =
                    JarvisPersistentSnapshotStore.clear();

                return {
                    ok: true,
                    success: true,
                    status: "SNAPSHOT_STORE_CLEARED",
                    ...result,
                    tool:
                        "repo.snapshotStore",
                    source:
                        "repo_snapshot_store_v7"
                };
            }

            if (action === "export") {
                JarvisPersistentSnapshotStore.hydrate();

                const snapshots =
                    window.JarvisRepoSnapshots || [];

                return {
                    ok: true,
                    success: true,
                    status: "SNAPSHOT_STORE_EXPORTED",
                    count:
                        snapshots.length,
                    json:
                        JSON.stringify(
                            snapshots,
                            null,
                            2
                        ),
                    snapshots,
                    tool:
                        "repo.snapshotStore",
                    source:
                        "repo_snapshot_store_v7"
                };
            }

            JarvisPersistentSnapshotStore.hydrate();

            const snapshots =
                window.JarvisRepoSnapshots || [];

            return {
                ok: true,
                success: true,
                status: "SNAPSHOT_STORE_LIST_READY",
                count:
                    snapshots.length,
                lastSnapshotId:
                    window.JarvisLastRepoSnapshot?.id || null,
                snapshots:
                    snapshots.map(item => ({
                        id:
                            item.id,
                        file:
                            item.file,
                        path:
                            item.path,
                        beforeHash:
                            item.beforeHash,
                        beforeLength:
                            item.beforeLength,
                        timestamp:
                            item.timestamp,
                        riskLevel:
                            item.riskLevel,
                        governanceStatus:
                            item.governanceStatus,
                        source:
                            item.source
                    })),
                tool:
                    "repo.snapshotStore",
                source:
                    "repo_snapshot_store_v7"
            };
        }
});
// Commit 33 - JARVIS CODEX V2: Snapshot Before Write
JarvisToolRuntime.register({
    name:
        "repo.snapshotBeforeWrite",
    description:
        "Guarda un snapshot recuperable antes de cualquier escritura del repo. Base para rollback.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "REPO_SNAPSHOT_BEFORE_WRITE_RESULT_V7",
    execute:
        async (args = {}, context = {}) => {
            const file =
                args.file ||
                args.path ||
                "";

            const path =
                args.path ||
                args.file ||
                "";

            const content =
                typeof args.content === "string"
                    ? args.content
                    : null;

            if (!file || !path) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "FILE_REQUIRED",
                    tool: "repo.snapshotBeforeWrite"
                };
            }

            const hashString =
                async value => {
                    const text =
                        String(value || "");

                    if (
                        window.crypto?.subtle &&
                        window.TextEncoder
                    ) {
                        const bytes =
                            new TextEncoder().encode(text);

                        const digest =
                            await window.crypto.subtle.digest(
                                "SHA-256",
                                bytes
                            );

                        return Array
                            .from(new Uint8Array(digest))
                            .map(byte => byte.toString(16).padStart(2, "0"))
                            .join("");
                    }

                    let hash =
                        0;

                    for (let index = 0; index < text.length; index += 1) {
                        hash =
                            ((hash << 5) - hash) +
                            text.charCodeAt(index);

                        hash |= 0;
                    }

                    return `fallback-${Math.abs(hash)}`;
                };

            const beforeContent =
                content !== null
                    ? content
                    : (
                        await JarvisToolRuntime.execute(
                            "repo.read",
                            {
                                file,
                                path,
                                maxBytes:
                                    args.maxBytes || 1000000
                            },
                            context
                        )
                    )?.data?.content || "";

            if (typeof beforeContent !== "string") {
                return {
                    ok: false,
                    success: false,
                    status: "SNAPSHOT_READ_FAILED",
                    error: "BEFORE_CONTENT_NOT_AVAILABLE",
                    file,
                    path,
                    tool: "repo.snapshotBeforeWrite"
                };
            }

            const beforeHash =
                await hashString(beforeContent);

            const snapshotId =
                [
                    "snap",
                    Date.now(),
                    Math.random().toString(36).slice(2, 10)
                ].join("_");

            const snapshot = {
                id:
                    snapshotId,
                file,
                path,
                beforeContent,
                beforeHash,
                beforeLength:
                    beforeContent.length,
                timestamp:
                    new Date().toISOString(),
                riskLevel:
                    args.riskLevel ||
                    args.governanceRiskLevel ||
                    null,
                governanceStatus:
                    args.governanceStatus || null,
                intent:
                    args.intent ||
                    context?.intent ||
                    null,
                approval: {
                    approved:
                        args.approved === true ||
                        context?.approved === true,
                    codexApproved:
                        args.codexApproved === true ||
                        context?.codexApproved === true,
                    doubleConfirm:
                        args.doubleConfirm === true ||
                        context?.doubleConfirm === true,
                    reinforcedApproval:
                        args.reinforcedApproval === true ||
                        context?.reinforcedApproval === true
                },
                previewStatus:
                    args.previewStatus || null,
                source:
                    "repo_snapshot_before_write_v7"
            };

             JarvisPersistentSnapshotStore.hydrate();

            window.JarvisRepoSnapshots =
                window.JarvisRepoSnapshots || [];

            window.JarvisRepoSnapshots.push(snapshot);

            window.JarvisLastRepoSnapshot =
                snapshot;

            const maxSnapshots =
                Number(args.maxSnapshots || 25);

            if (
                Number.isFinite(maxSnapshots) &&
                maxSnapshots > 0 &&
                window.JarvisRepoSnapshots.length > maxSnapshots
            ) {
                window.JarvisRepoSnapshots =
                    window.JarvisRepoSnapshots.slice(
                        window.JarvisRepoSnapshots.length - maxSnapshots
                    );
            }

            JarvisPersistentSnapshotStore.maxSnapshots =
                Number.isFinite(maxSnapshots) && maxSnapshots > 0
                    ? maxSnapshots
                    : 25;

            const persistentSave =
                JarvisPersistentSnapshotStore.push(snapshot);
            return {
                ok: true,
                success: true,
                status: "SNAPSHOT_BEFORE_WRITE_OK",
                snapshotId,
                file,
                path,
                beforeHash,
                beforeLength:
                    beforeContent.length,
                riskLevel:
                    snapshot.riskLevel,
                governanceStatus:
                    snapshot.governanceStatus,
                snapshotsCount:
                    window.JarvisRepoSnapshots.length,
                persistent:
                    persistentSave?.ok === true,
                persistentCount:
                    persistentSave?.count || null,
                rollbackAvailable:
                    true,

                next:
                    "Continuar con repo.write. Para revertir en Commit 34 se usara repo.rollbackLastPatch.",
                tool:
                    "repo.snapshotBeforeWrite",
                source:
                    "repo_snapshot_before_write_v7"
            };
        }
});

// Commit 34 - JARVIS CODEX V2: Rollback Last Patch
JarvisToolRuntime.register({
    name:
        "repo.rollbackLastPatch",
    description:
        "Restaura el ultimo snapshot guardado antes de una escritura del repo. Usa snapshots de repo.snapshotBeforeWrite.",
    mutates:
        true,
    requiresApproval:
        true,
    output:
        "REPO_ROLLBACK_LAST_PATCH_RESULT_V7",
    execute:
        async (args = {}, context = {}) => {
            const approved =
                args.approved === true ||
                args.codexApproved === true ||
                context?.approved === true ||
                context?.codexApproved === true;

            if (approved !== true) {
                return {
                    ok: false,
                    success: false,
                    status: "PENDING_APPROVAL",
                    error: "APPROVAL_REQUIRED: repo.rollbackLastPatch",
                    mutates: true,
                    requiresApproval: true,
                    approvalCommand:
                        "Jarvis, apruebo rollback del ultimo patch",
                    tool:
                        "repo.rollbackLastPatch"
                };
            }

            JarvisPersistentSnapshotStore.hydrate();

            const snapshots =
                Array.isArray(window.JarvisRepoSnapshots)
                    ? window.JarvisRepoSnapshots
                    : [];

            const snapshotId =
                args.snapshotId ||
                args.id ||
                null;

            const fileFilter =
                args.file ||
                args.path ||
                null;

            let snapshot =
                null;

            if (snapshotId) {
                snapshot =
                    snapshots.find(item => item?.id === snapshotId) ||
                    null;
            }

            if (!snapshot && fileFilter) {
                snapshot =
                    [...snapshots]
                        .reverse()
                        .find(item =>
                            item?.file === fileFilter ||
                            item?.path === fileFilter
                        ) ||
                    null;
            }

            if (!snapshot) {
                snapshot =
                    window.JarvisLastRepoSnapshot ||
                    snapshots[snapshots.length - 1] ||
                    null;
            }

            if (!snapshot) {
                return {
                    ok: false,
                    success: false,
                    status: "ROLLBACK_SNAPSHOT_NOT_FOUND",
                    error:
                        "No hay snapshot disponible para restaurar.",
                    snapshotId,
                    file:
                        fileFilter,
                    snapshotsCount:
                        snapshots.length,
                    persistentCount:
                        JarvisPersistentSnapshotStore.load().length,
                    recoveryHint:
                        "Ejecuta repo.snapshotStore action:'hydrate' o verifica que localStorage no haya sido limpiado.",
                    tool:
                        "repo.rollbackLastPatch"
                };
            }

            const file =
                snapshot.file;

            const path =
                snapshot.path ||
                snapshot.file;

            const beforeContent =
                snapshot.beforeContent;

            if (
                !file ||
                !path ||
                typeof beforeContent !== "string"
            ) {
                return {
                    ok: false,
                    success: false,
                    status: "ROLLBACK_SNAPSHOT_INVALID",
                    error:
                        "El snapshot no contiene file/path/beforeContent valido.",
                    snapshot,
                    tool:
                        "repo.rollbackLastPatch"
                };
            }

            const hashString =
                async value => {
                    const text =
                        String(value || "");

                    if (
                        window.crypto?.subtle &&
                        window.TextEncoder
                    ) {
                        const bytes =
                            new TextEncoder().encode(text);

                        const digest =
                            await window.crypto.subtle.digest(
                                "SHA-256",
                                bytes
                            );

                        return Array
                            .from(new Uint8Array(digest))
                            .map(byte => byte.toString(16).padStart(2, "0"))
                            .join("");
                    }

                    let hash =
                        0;

                    for (let index = 0; index < text.length; index += 1) {
                        hash =
                            ((hash << 5) - hash) +
                            text.charCodeAt(index);

                        hash |= 0;
                    }

                    return `fallback-${Math.abs(hash)}`;
                };

            const expectedHash =
                snapshot.beforeHash ||
                await hashString(beforeContent);

            const readCurrent =
                await JarvisToolRuntime.execute(
                    "repo.read",
                    {
                        file,
                        path,
                        maxBytes:
                            args.maxBytes || 1000000
                    },
                    context
                );

            const currentContent =
                readCurrent?.data?.content ||
                readCurrent?.content ||
                "";

            const currentHash =
                await hashString(currentContent);

            const alreadyRestored =
                currentHash === expectedHash;

            if (alreadyRestored === true) {
    return {
        ok: true,
        success: true,
        status: "ROLLBACK_ALREADY_RESTORED",
        file,
        path,
        snapshotId:
            snapshot.id,
        beforeHash:
            expectedHash,
        currentHash,
        afterHash:
            currentHash,
        restored:
            false,
        verified:
            true,
        reason:
            "El archivo ya coincide con el snapshot.",
        tool:
            "repo.rollbackLastPatch",
        source:
            "repo_rollback_last_patch_v7"
    };
}

            const writeResult =
                await JarvisToolRuntime.execute(
                    "repo.write",
                    {
                        file,
                        path,
                        content:
                            beforeContent,
                        approved:
                            true,
                        codexApproved:
                            true
                    },
                    {
                        ...context,
                        approved:
                            true,
                        codexApproved:
                            true
                    }
                );

            if (
                writeResult?.ok !== true &&
                writeResult?.success !== true
            ) {
                return {
                    ok: false,
                    success: false,
                    status: "ROLLBACK_WRITE_FAILED",
                    error:
                        writeResult?.error ||
                        writeResult?.status ||
                        "ROLLBACK_WRITE_FAILED",
                    file,
                    path,
                    snapshotId:
                        snapshot.id,
                    writeResult,
                    tool:
                        "repo.rollbackLastPatch"
                };
            }

            const readAfter =
                await JarvisToolRuntime.execute(
                    "repo.read",
                    {
                        file,
                        path,
                        maxBytes:
                            args.maxBytes || 1000000
                    },
                    context
                );

            const afterContent =
                readAfter?.data?.content ||
                readAfter?.content ||
                "";

            const afterHash =
                await hashString(afterContent);

            const verified =
                afterHash === expectedHash;

            window.JarvisLastRollback =
                {
                    id:
                        `rollback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
                    snapshotId:
                        snapshot.id,
                    file,
                    path,
                    expectedHash,
                    beforeRollbackHash:
                        currentHash,
                    afterHash,
                    verified,
                    timestamp:
                        new Date().toISOString(),
                    snapshot,
                    source:
                        "repo_rollback_last_patch_v7"
                };

            return {
                ok:
                    verified === true,
                success:
                    verified === true,
                status:
                    verified
                        ? "ROLLBACK_LAST_PATCH_OK"
                        : "ROLLBACK_VERIFY_FAILED",
                file,
                path,
                snapshotId:
                    snapshot.id,
                restored:
                    true,
                verified,
                beforeRollbackHash:
                    currentHash,
                expectedHash,
                afterHash,
                writeResult,
                readAfter,
                rollback:
                    window.JarvisLastRollback,
                tool:
                    "repo.rollbackLastPatch",
                source:
                    "repo_rollback_last_patch_v7"
            };
        }
});

// Commit 39 - JARVIS CODEX V2: Compact/Clean UI
const JarvisCompactUi =
    window.JarvisCompactUi || {
        state: {
            reviewMinimized:
                false,
            queueMinimized:
                false
        },
        toggle:
            target => {
                const key =
                    target === "queue"
                        ? "queueMinimized"
                        : "reviewMinimized";

                JarvisCompactUi.state[key] =
                    !JarvisCompactUi.state[key];

                JarvisCompactUi.apply();

                return {
                    ok: true,
                    target,
                    minimized:
                        JarvisCompactUi.state[key]
                };
            },
        closeCard:
            cardId => {
                const element =
                    document.getElementById(`jarvis-review-card-${cardId}`);

                if (element) {
                    element.remove();
                }

                const card =
                    (window.JarvisReviewCards || [])
                        .find(item => item?.id === cardId);

                if (card) {
                    card.uiClosed =
                        true;
                    card.closedAt =
                        new Date().toISOString();
                }

                return {
                    ok: true,
                    status: "UI_CARD_CLOSED",
                    cardId
                };
            },
        cleanClosed:
            () => {
                const closedStates =
                    new Set([
                        "REJECTED",
                        "APPROVED",
                        "EXECUTED",
                        "CLOSED"
                    ]);

                let removed =
                    0;

                document
                    .querySelectorAll("#jarvis-review-cards article")
                    .forEach(element => {
                        if (closedStates.has(element.dataset.state)) {
                            element.remove();
                            removed += 1;
                        }
                    });

                return {
                    ok: true,
                    status: "UI_CLOSED_CARDS_CLEANED",
                    removed
                };
            },
        apply:
            () => {
                const reviewHost =
                    document.getElementById("jarvis-review-cards");

                if (reviewHost) {
                    reviewHost.style.width =
                        JarvisCompactUi.state.reviewMinimized
                            ? "260px"
                            : "360px";

                    reviewHost.style.maxHeight =
                        JarvisCompactUi.state.reviewMinimized
                            ? "54px"
                            : "64vh";

                    reviewHost.style.overflow =
                        JarvisCompactUi.state.reviewMinimized
                            ? "hidden"
                            : "auto";

                    reviewHost
                        .querySelectorAll("[data-role='review-body']")
                        .forEach(node => {
                            node.style.display =
                                JarvisCompactUi.state.reviewMinimized
                                    ? "none"
                                    : "block";
                        });
                }

                const queueHost =
                    document.getElementById("jarvis-operator-queue");

                if (queueHost) {
                    queueHost.style.width =
                        JarvisCompactUi.state.queueMinimized
                            ? "260px"
                            : "360px";

                    queueHost.style.maxHeight =
                        JarvisCompactUi.state.queueMinimized
                            ? "54px"
                            : "64vh";

                    queueHost.style.overflow =
                        JarvisCompactUi.state.queueMinimized
                            ? "hidden"
                            : "auto";

                    queueHost
                        .querySelectorAll("[data-role='queue-body']")
                        .forEach(node => {
                            node.style.display =
                                JarvisCompactUi.state.queueMinimized
                                    ? "none"
                                    : "block";
                        });
                }

                return {
                    ok: true,
                    status: "UI_COMPACT_APPLIED",
                    state:
                        JarvisCompactUi.state
                };
            }
    };

window.JarvisCompactUi =
    JarvisCompactUi;

JarvisToolRuntime.register({
    name:
        "repo.uiCompact",
    description:
        "Controla la UI compacta de Jarvis: minimizar review, minimizar queue, limpiar cards cerradas.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "REPO_UI_COMPACT_RESULT_V7",
    execute:
        async (args = {}, context = {}) => {
            const action =
                args.action ||
                "apply";

            if (action === "toggleReview") {
                return {
                    ok: true,
                    success: true,
                    status: "UI_REVIEW_TOGGLED",
                    ...JarvisCompactUi.toggle("review"),
                    tool:
                        "repo.uiCompact"
                };
            }

            if (action === "toggleQueue") {
                return {
                    ok: true,
                    success: true,
                    status: "UI_QUEUE_TOGGLED",
                    ...JarvisCompactUi.toggle("queue"),
                    tool:
                        "repo.uiCompact"
                };
            }

            if (action === "cleanClosed") {
                return {
                    ok: true,
                    success: true,
                    ...JarvisCompactUi.cleanClosed(),
                    tool:
                        "repo.uiCompact"
                };
            }

            if (action === "closeCard") {
                return {
                    ok: true,
                    success: true,
                    ...JarvisCompactUi.closeCard(args.cardId),
                    tool:
                        "repo.uiCompact"
                };
            }

            return {
                ok: true,
                success: true,
                ...JarvisCompactUi.apply(),
                tool:
                    "repo.uiCompact"
            };
        }
});

// Commit 35 - JARVIS CODEX V2: Review Cards / Approval Cards
JarvisToolRuntime.register({
    name:
        "repo.reviewCard",
    description:
        "Genera una tarjeta visual de revision/aprobacion para cambios de repo: riesgo, preview, impacto, snapshot, aprobar, rechazar o rollback.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "REPO_REVIEW_CARD_RESULT_V7",
    execute:
        async (args = {}, context = {}) => {
            const file =
                args.file ||
                args.path ||
                "";

            const path =
                args.path ||
                args.file ||
                "";

            const riskLevel =
                args.riskLevel ||
                args.governanceRiskLevel ||
                args.criticality ||
                "LOW";

            const status =
                args.status ||
                args.governanceStatus ||
                "REVIEW_REQUIRED";

            const cardId =
                args.cardId ||
                [
                    "review",
                    Date.now(),
                    Math.random().toString(36).slice(2, 10)
                ].join("_");

            if (!file || !path) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "FILE_REQUIRED",
                    tool: "repo.reviewCard"
                };
            }

            const escapeHtml =
                value => String(value ?? "")
                    .replaceAll("&", "&amp;")
                    .replaceAll("<", "&lt;")
                    .replaceAll(">", "&gt;")
                    .replaceAll(String.fromCharCode(34), "&quot;")
                    .replaceAll("'", "&#039;");

            const normalizeSnippet =
                value => {
                    const text =
                        String(value ?? "");

                    return text.length > 900
                        ? `${text.slice(0, 900)}\n...`
                        : text;
                };

            const targetArgs = {
                file,
                path,
                search:
                    args.search || "",
                replace:
                    args.replace || "",
                riskLevel,
                approved:
                    true,
                codexApproved:
                    true
            };

            const card = {
                id:
                    cardId,
                file,
                path,
                status,
                riskLevel,
                title:
                    args.title ||
                    `Revision de cambio: ${file}`,
                intent:
                    args.intent ||
                    context?.intent ||
                    "repo review card",
                summary:
                    args.summary ||
                    args.reason ||
                    "Cambio pendiente de revision.",
                requiredControls:
                    args.requiredControls ||
                    [],
                search:
                    normalizeSnippet(args.search || ""),
                replace:
                    normalizeSnippet(args.replace || ""),
                previewStatus:
                    args.previewStatus ||
                    args.preview?.data?.status ||
                    args.preview?.status ||
                    null,
                governanceStatus:
                    args.governanceStatus ||
                    args.governance?.data?.status ||
                    args.governance?.status ||
                    null,
                snapshotId:
                    args.snapshotId ||
                    args.snapshot?.data?.snapshotId ||
                    args.snapshot?.snapshotId ||
                    null,
                rollbackAvailable:
                    args.rollbackAvailable === true ||
                    Boolean(args.snapshotId),
                targetTool:
                    args.targetTool ||
                    "repo.safePatchApply",
                targetArgs:
                    {
                        ...targetArgs,
                        ...(args.targetArgs || {})
                    },
                createdAt:
                    new Date().toISOString(),
                createdBy:
                    "repo.reviewCard",
                state:
                    "PENDING_REVIEW"
            };

            window.JarvisReviewCards =
                window.JarvisReviewCards || [];

            window.JarvisReviewCards.push(card);

            window.JarvisLastReviewCard =
                card;

            window.JarvisApprovalCards =
                window.JarvisApprovalCards || {};

            window.JarvisApprovalCards.find =
                cardIdToFind => {
                    return (window.JarvisReviewCards || [])
                        .find(item => item?.id === cardIdToFind) ||
                        null;
                };

            window.JarvisApprovalCards.reject =
                cardIdToReject => {
                    const found =
                        window.JarvisApprovalCards.find(cardIdToReject);

                    if (!found) {
                        return {
                            ok: false,
                            status: "REVIEW_CARD_NOT_FOUND",
                            cardId:
                                cardIdToReject
                        };
                    }

                    found.state =
                        "REJECTED";

                    found.rejectedAt =
                        new Date().toISOString();

                    const element =
                        document.getElementById(`jarvis-review-card-${found.id}`);

                    if (element) {
                        element.dataset.state =
                            "REJECTED";

                        const badge =
                            element.querySelector("[data-role='state']");

                        if (badge) {
                            badge.textContent =
                                "REJECTED";
                        }
                    }

                    return {
                        ok: true,
                        status: "REVIEW_CARD_REJECTED",
                        card:
                            found
                    };
                };

            window.JarvisApprovalCards.approve =
                async (cardIdToApprove, mode = "simple") => {
                    const found =
                        window.JarvisApprovalCards.find(cardIdToApprove);

                    if (!found) {
                        return {
                            ok: false,
                            status: "REVIEW_CARD_NOT_FOUND",
                            cardId:
                                cardIdToApprove
                        };
                    }

                    const doubleConfirm =
                        mode === "double" ||
                        mode === "reinforced" ||
                        found.riskLevel === "HIGH" ||
                        found.riskLevel === "CRITICAL";

                    const reinforcedApproval =
                        mode === "reinforced" ||
                        found.riskLevel === "CRITICAL";

                    found.state =
                        "APPROVED";

                    found.approvedAt =
                        new Date().toISOString();

                    found.approvalMode =
                        mode;

                    const result =
                        await JarvisToolRuntime.execute(
                            found.targetTool || "repo.safePatchApply",
                            {
                                ...found.targetArgs,
                                approved:
                                    true,
                                codexApproved:
                                    true,
                                doubleConfirm,
                                doubleConfirmed:
                                    doubleConfirm,
                                reinforcedApproval,
                                criticalApproval:
                                    reinforcedApproval
                            },
                            {
                                approved:
                                    true,
                                codexApproved:
                                    true,
                                doubleConfirm,
                                doubleConfirmed:
                                    doubleConfirm,
                                reinforcedApproval,
                                criticalApproval:
                                    reinforcedApproval
                            }
                        );

                    found.lastResult =
                        result;

                    const element =
                        document.getElementById(`jarvis-review-card-${found.id}`);

                    if (element) {
                        element.dataset.state =
                            "APPROVED";

                        const badge =
                            element.querySelector("[data-role='state']");

                        if (badge) {
                            badge.textContent =
                                "APPROVED";
                        }
                    }

                    return result;
                };

            window.JarvisApprovalCards.rollback =
                async snapshotIdToRollback => {
                    return await JarvisToolRuntime.execute(
                        "repo.rollbackLastPatch",
                        {
                            snapshotId:
                                snapshotIdToRollback,
                            approved:
                                true,
                            codexApproved:
                                true
                        },
                        {
                            approved:
                                true,
                            codexApproved:
                                true
                        }
                    );
                };

            const ensureHost =
                () => {
                    let host =
                        document.getElementById("jarvis-review-cards");

                    if (!host) {
                        host =
                            document.createElement("section");

                        host.id =
                            "jarvis-review-cards";

                        host.style.position =
                            "fixed";
                        host.style.right =
                            "16px";
                        host.style.bottom =
                            "16px";
                        host.style.width =
                            "360px";
                        host.style.maxHeight =
                            "64vh";
                        host.style.overflow =
                            "auto";
                        host.style.zIndex =
                            "99999";
                        host.style.display =
                            "flex";
                        host.style.flexDirection =
                            "column";
                        host.style.gap =
                            "12px";
                        host.style.fontFamily =
                            "system-ui, -apple-system, Segoe UI, sans-serif";

                        document.body.appendChild(host);

                        const toolbar =
                            document.createElement("div");

                        toolbar.dataset.role =
                            "review-toolbar";

                        toolbar.style.cssText =
                            "border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:8px 10px;background:rgba(2,6,23,.96);color:#e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:8px;box-shadow:0 14px 30px rgba(0,0,0,.3);";

                        toolbar.innerHTML =
                            `
                            <strong style="font-size:12px;">JARVIS REVIEW</strong>
                            <div style="display:flex;gap:6px;">
                                <button data-action="toggle-review" style="cursor:pointer;border:0;border-radius:8px;padding:5px 8px;background:#334155;color:white;font-size:11px;">Min</button>
                                <button data-action="clean-review" style="cursor:pointer;border:0;border-radius:8px;padding:5px 8px;background:#475569;color:white;font-size:11px;">Limpiar</button>
                            </div>
                            `;

                        toolbar
                            .querySelector("[data-action='toggle-review']")
                            ?.addEventListener("click", () => {
                                window.JarvisCompactUi.toggle("review");
                            });

                        toolbar
                            .querySelector("[data-action='clean-review']")
                            ?.addEventListener("click", () => {
                                window.JarvisCompactUi.cleanClosed();
                            });

                        host.appendChild(toolbar);
                    }

                     if (
                        !host.querySelector("[data-role='review-toolbar']")
                    ) {
                        const toolbar =
                            document.createElement("div");

                        toolbar.dataset.role =
                            "review-toolbar";

                        toolbar.style.cssText =
                            "border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:8px 10px;background:rgba(2,6,23,.96);color:#e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:8px;box-shadow:0 14px 30px rgba(0,0,0,.3);";

                        toolbar.innerHTML =
                            `
                            <strong style="font-size:12px;">JARVIS REVIEW</strong>
                            <div style="display:flex;gap:6px;">
                                <button data-action="toggle-review" style="cursor:pointer;border:0;border-radius:8px;padding:5px 8px;background:#334155;color:white;font-size:11px;">Min</button>
                                <button data-action="clean-review" style="cursor:pointer;border:0;border-radius:8px;padding:5px 8px;background:#475569;color:white;font-size:11px;">Limpiar</button>
                            </div>
                            `;

                        toolbar
                            .querySelector("[data-action='toggle-review']")
                            ?.addEventListener("click", () => {
                                window.JarvisCompactUi.toggle("review");
                            });

                        toolbar
                            .querySelector("[data-action='clean-review']")
                            ?.addEventListener("click", () => {
                                window.JarvisCompactUi.cleanClosed();
                            });

                        host.prepend(toolbar);
                    }

                    return host;

                };

            const riskColor =
                String(riskLevel).toUpperCase() === "CRITICAL"
                    ? "#7f1d1d"
                    : String(riskLevel).toUpperCase() === "HIGH"
                        ? "#92400e"
                        : String(riskLevel).toUpperCase() === "MEDIUM"
                            ? "#854d0e"
                            : "#14532d";

            const host =
                ensureHost();

            const existing =
                document.getElementById(`jarvis-review-card-${card.id}`);

            if (existing) {
                existing.remove();
            }

            const element =
                document.createElement("article");

            element.id =
                `jarvis-review-card-${card.id}`;

            element.dataset.state =
                card.state;

            element.style.border =
                "1px solid rgba(255,255,255,0.16)";
            element.style.borderRadius =
                "16px";
            element.style.padding =
                "14px";
            element.style.background =
                "rgba(15,23,42,0.96)";
            element.style.color =
                "#e5e7eb";
            element.style.boxShadow =
                "0 18px 40px rgba(0,0,0,0.35)";

            element.innerHTML =
                `
                 <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                    <div>
                        <div style="font-size:11px;opacity:.75;">JARVIS REVIEW CARD</div>
                        <strong style="font-size:14px;">${escapeHtml(card.title)}</strong>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <span data-role="state" style="font-size:10px;padding:4px 7px;border-radius:999px;background:#1f2937;">${escapeHtml(card.state)}</span>
                        <button data-action="minimize-card" title="Minimizar" style="cursor:pointer;border:0;border-radius:8px;padding:4px 7px;background:#334155;color:white;font-size:11px;">_</button>
                        <button data-action="close-card" title="Cerrar" style="cursor:pointer;border:0;border-radius:8px;padding:4px 7px;background:#7f1d1d;color:white;font-size:11px;">x</button>
                    </div>
                </div>
                <div data-role="review-body">

                <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:12px;padding:4px 8px;border-radius:999px;background:${riskColor};">Riesgo: ${escapeHtml(riskLevel)}</span>
                    <span style="font-size:12px;padding:4px 8px;border-radius:999px;background:#334155;">${escapeHtml(status)}</span>
                </div>

                <div style="margin-top:10px;font-size:12px;line-height:1.45;">
                    <div><b>Archivo:</b> ${escapeHtml(file)}</div>
                    <div><b>Intent:</b> ${escapeHtml(card.intent)}</div>
                    <div><b>Snapshot:</b> ${escapeHtml(card.snapshotId || "pendiente")}</div>
                    <div><b>Preview:</b> ${escapeHtml(card.previewStatus || "pendiente")}</div>
                    <div><b>Governance:</b> ${escapeHtml(card.governanceStatus || "pendiente")}</div>
                </div>

                <details style="margin-top:10px;">
                    <summary style="cursor:pointer;font-size:12px;">Ver search / replace</summary>
                    <div style="margin-top:8px;">
                        <div style="font-size:11px;opacity:.8;">SEARCH</div>
                        <pre style="white-space:pre-wrap;font-size:11px;background:#020617;padding:8px;border-radius:10px;max-height:120px;overflow:auto;">${escapeHtml(card.search)}</pre>
                        <div style="font-size:11px;opacity:.8;">REPLACE</div>
                        <pre style="white-space:pre-wrap;font-size:11px;background:#020617;padding:8px;border-radius:10px;max-height:120px;overflow:auto;">${escapeHtml(card.replace)}</pre>
                    </div>
                </details>

                <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
                    <button data-action="approve-simple" style="cursor:pointer;border:0;border-radius:10px;padding:8px 10px;background:#16a34a;color:white;">Aprobar</button>
                    <button data-action="approve-double" style="cursor:pointer;border:0;border-radius:10px;padding:8px 10px;background:#ca8a04;color:white;">Doble aprobar</button>
                    <button data-action="approve-reinforced" style="cursor:pointer;border:0;border-radius:10px;padding:8px 10px;background:#dc2626;color:white;">Reforzar</button>
                    <button data-action="reject" style="cursor:pointer;border:0;border-radius:10px;padding:8px 10px;background:#475569;color:white;">Rechazar</button>
                    <button data-action="rollback" style="cursor:pointer;border:0;border-radius:10px;padding:8px 10px;background:#1d4ed8;color:white;">Rollback</button>
                </div>
                </div>
                `;

            element
                .querySelector("[data-action='approve-simple']")
                ?.addEventListener("click", () => {
                    window.JarvisApprovalCards.approve(card.id, "simple");
                });

            element
                .querySelector("[data-action='approve-double']")
                ?.addEventListener("click", () => {
                    window.JarvisApprovalCards.approve(card.id, "double");
                });

            element
                .querySelector("[data-action='approve-reinforced']")
                ?.addEventListener("click", () => {
                    window.JarvisApprovalCards.approve(card.id, "reinforced");
                });

            element
                .querySelector("[data-action='reject']")
                ?.addEventListener("click", () => {
                    window.JarvisApprovalCards.reject(card.id);
                });

            element
                .querySelector("[data-action='rollback']")
                ?.addEventListener("click", () => {
                    if (card.snapshotId) {
                        window.JarvisApprovalCards.rollback(card.snapshotId);
                    }
                });


                element
                .querySelector("[data-action='minimize-card']")
                ?.addEventListener("click", () => {
                    const body =
                        element.querySelector("[data-role='review-body']");

                    if (body) {
                        body.style.display =
                            body.style.display === "none"
                                ? "block"
                                : "none";
                    }
                });

            element
                .querySelector("[data-action='close-card']")
                ?.addEventListener("click", () => {
                    window.JarvisCompactUi.closeCard(card.id);
                });

            host.prepend(element);

            return {
                ok: true,
                success: true,
                status: "REVIEW_CARD_READY",
                cardId:
                    card.id,
                file,
                path,
                riskLevel,
                reviewState:
                    card.state,
                domId:
                    element.id,
                approvalApi:
                    "window.JarvisApprovalCards",
                approveSimple:
                    `window.JarvisApprovalCards.approve("${card.id}", "simple")`,
                approveDouble:
                    `window.JarvisApprovalCards.approve("${card.id}", "double")`,
                approveReinforced:
                    `window.JarvisApprovalCards.approve("${card.id}", "reinforced")`,
                reject:
                    `window.JarvisApprovalCards.reject("${card.id}")`,
                rollback:
                    card.snapshotId
                        ? `window.JarvisApprovalCards.rollback("${card.snapshotId}")`
                        : null,
                card,
                tool:
                    "repo.reviewCard",
                source:
                    "repo_review_card_v7"
            };
        }
});

// Commit 36 - JARVIS CODEX V2: Codex Operator Queue
JarvisToolRuntime.register({
    name:
        "repo.operatorQueue",
    description:
        "Administra una cola visual de propuestas Codex: encolar, renderizar, aprobar, rechazar, aprobar por lote y limpiar.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "REPO_OPERATOR_QUEUE_RESULT_V7",
    execute:
        async (args = {}, context = {}) => {
            const action =
                args.action ||
                "render";

            window.JarvisOperatorQueue =
                window.JarvisOperatorQueue || [];

            const queue =
                window.JarvisOperatorQueue;

            const findItem =
                itemId => queue.find(item => item?.id === itemId) || null;

            const updateBadge =
                item => {
                    const element =
                        document.getElementById(`jarvis-queue-item-${item.id}`);

                    if (!element) {
                        return;
                    }

                    element.dataset.state =
                        item.state;

                    const badge =
                        element.querySelector("[data-role='queue-state']");

                    if (badge) {
                        badge.textContent =
                            item.state;
                    }
                };

            const ensureHost =
                () => {
                    let host =
                        document.getElementById("jarvis-operator-queue");

                    if (!host) {
                        host =
                            document.createElement("section");

                        host.id =
                            "jarvis-operator-queue";

                        host.style.position =
                            "fixed";
                        host.style.left =
                            "16px";
                        host.style.bottom =
                            "16px";
                        host.style.width =
                            "360px";
                        host.style.maxHeight =
                            "64vh";
                        host.style.overflow =
                            "auto";
                        host.style.zIndex =
                            "99998";
                        host.style.display =
                            "flex";
                        host.style.flexDirection =
                            "column";
                        host.style.gap =
                            "10px";
                        host.style.fontFamily =
                            "system-ui, -apple-system, Segoe UI, sans-serif";

                        document.body.appendChild(host);
                    }

                    return host;
                };

            const escapeHtml =
                value => String(value ?? "")
                    .replaceAll("&", "&amp;")
                    .replaceAll("<", "&lt;")
                    .replaceAll(">", "&gt;")
                    .replaceAll(String.fromCharCode(34), "&quot;")
                    .replaceAll("'", "&#039;");

            const renderQueue =
                () => {
                    const host =
                        ensureHost();

                    const pending =
                        queue.filter(item => item.state === "PENDING").length;

                    const approved =
                        queue.filter(item => item.state === "APPROVED").length;

                    const rejected =
                        queue.filter(item => item.state === "REJECTED").length;

                    const executed =
                        queue.filter(item => item.state === "EXECUTED").length;

                    host.innerHTML =
                        `
                        <article style="border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:14px;background:rgba(2,6,23,.96);color:#e5e7eb;box-shadow:0 18px 40px rgba(0,0,0,.35);">
                            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                                <div>
                                    <div style="font-size:13px;opacity:.8;">JARVIS CODEX OPERATOR QUEUE</div>
                                    <strong style="font-size:15px;">Cola de propuestas</strong>
                                </div>
                                 <div style="display:flex;gap:6px;align-items:center;">
                                     <span style="font-size:11px;padding:4px 8px;border-radius:999px;background:#1f2937;">${queue.length} items</span>
                                     <button data-action="toggle-queue" style="cursor:pointer;border:0;border-radius:8px;padding:5px 8px;background:#334155;color:white;font-size:11px;">Min</button>
                                 </div>

                            </div>
                            <div data-role="queue-body">
                            <div style="margin-top:10px;font-size:12px;display:flex;gap:6px;flex-wrap:wrap;">
                                <span style="padding:4px 8px;border-radius:999px;background:#334155;">Pending: ${pending}</span>
                                <span style="padding:4px 8px;border-radius:999px;background:#14532d;">Approved: ${approved}</span>
                                <span style="padding:4px 8px;border-radius:999px;background:#1d4ed8;">Executed: ${executed}</span>
                                <span style="padding:4px 8px;border-radius:999px;background:#7f1d1d;">Rejected: ${rejected}</span>
                            </div>
                            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
                                <button data-action="approve-safe" style="cursor:pointer;border:0;border-radius:10px;padding:8px 10px;background:#16a34a;color:white;">Aprobar LOW/MEDIUM</button>
                                <button data-action="render" style="cursor:pointer;border:0;border-radius:10px;padding:8px 10px;background:#334155;color:white;">Render</button>
                                <button data-action="clear-done" style="cursor:pointer;border:0;border-radius:10px;padding:8px 10px;background:#475569;color:white;">Limpiar cerrados</button>
                            </div>
                        </div>
                        </article>
                        `;
                    host.querySelector("[data-action='approve-safe']")?.addEventListener("click", () => {
                        window.JarvisOperatorQueueApi.approveSafeBatch();
                    });

                    host.querySelector("[data-action='render']")?.addEventListener("click", () => {
                        window.JarvisOperatorQueueApi.render();
                    });

                    host.querySelector("[data-action='clear-done']")?.addEventListener("click", () => {
                        window.JarvisOperatorQueueApi.clearDone();
                    });


                     host.querySelector("[data-action='toggle-queue']")?.addEventListener("click", () => {
                        window.JarvisCompactUi.toggle("queue");
                    });

                    for (const item of queue.slice().reverse()) {
                        const risk =
                            String(item.riskLevel || "LOW").toUpperCase();

                        const riskColor =
                            risk === "CRITICAL"
                                ? "#7f1d1d"
                                : risk === "HIGH"
                                    ? "#92400e"
                                    : risk === "MEDIUM"
                                        ? "#854d0e"
                                        : "#14532d";

                        const node =
                            document.createElement("article");

                        node.id =
                            `jarvis-queue-item-${item.id}`;

                        node.dataset.state =
                            item.state;

                        node.style.border =
                            "1px solid rgba(255,255,255,.14)";
                        node.style.borderRadius =
                            "14px";
                        node.style.padding =
                            "12px";
                        node.style.background =
                            "rgba(15,23,42,.96)";
                        node.style.color =
                            "#e5e7eb";

                        node.innerHTML =
                            `
                            <div style="display:flex;justify-content:space-between;gap:8px;">
                                <strong style="font-size:13px;">${escapeHtml(item.file)}</strong>
                                <span data-role="queue-state" style="font-size:11px;padding:3px 8px;border-radius:999px;background:#1f2937;">${escapeHtml(item.state)}</span>
                            </div>
                            <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
                                <span style="font-size:11px;padding:3px 8px;border-radius:999px;background:${riskColor};">Riesgo: ${escapeHtml(risk)}</span>
                                <span style="font-size:11px;padding:3px 8px;border-radius:999px;background:#334155;">${escapeHtml(item.intent || "operator queue")}</span>
                            </div>
                            <div style="margin-top:8px;font-size:12px;opacity:.9;">${escapeHtml(item.summary || "Cambio propuesto")}</div>
                            <details style="margin-top:8px;">
                                <summary style="cursor:pointer;font-size:12px;">Ver patch</summary>
                                <pre style="white-space:pre-wrap;font-size:11px;background:#020617;padding:8px;border-radius:10px;max-height:120px;overflow:auto;">${escapeHtml(item.search || "")}</pre>
                                <pre style="white-space:pre-wrap;font-size:11px;background:#020617;padding:8px;border-radius:10px;max-height:120px;overflow:auto;">${escapeHtml(item.replace || "")}</pre>
                            </details>
                            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
                                <button data-action="card" style="cursor:pointer;border:0;border-radius:10px;padding:7px 9px;background:#2563eb;color:white;">Card</button>
                                <button data-action="approve" style="cursor:pointer;border:0;border-radius:10px;padding:7px 9px;background:#16a34a;color:white;">Aprobar</button>
                                <button data-action="double" style="cursor:pointer;border:0;border-radius:10px;padding:7px 9px;background:#ca8a04;color:white;">Doble</button>
                                <button data-action="reinforced" style="cursor:pointer;border:0;border-radius:10px;padding:7px 9px;background:#dc2626;color:white;">Reforzar</button>
                                <button data-action="reject" style="cursor:pointer;border:0;border-radius:10px;padding:7px 9px;background:#475569;color:white;">Rechazar</button>
                            </div>
                            `;

                        node.querySelector("[data-action='card']")?.addEventListener("click", () => {
                            window.JarvisOperatorQueueApi.card(item.id);
                        });

                        node.querySelector("[data-action='approve']")?.addEventListener("click", () => {
                            window.JarvisOperatorQueueApi.approve(item.id, "simple");
                        });

                        node.querySelector("[data-action='double']")?.addEventListener("click", () => {
                            window.JarvisOperatorQueueApi.approve(item.id, "double");
                        });

                        node.querySelector("[data-action='reinforced']")?.addEventListener("click", () => {
                            window.JarvisOperatorQueueApi.approve(item.id, "reinforced");
                        });

                        node.querySelector("[data-action='reject']")?.addEventListener("click", () => {
                            window.JarvisOperatorQueueApi.reject(item.id);
                        });

                        host.appendChild(node);
                    }

                                        window.JarvisCompactUi.apply();
                    return host;
                };

            const enqueue =
                itemArgs => {
                    const item = {
                        id:
                            itemArgs.itemId ||
                            [
                                "queue",
                                Date.now(),
                                Math.random().toString(36).slice(2, 10)
                            ].join("_"),
                        file:
                            itemArgs.file ||
                            itemArgs.path ||
                            "",
                        path:
                            itemArgs.path ||
                            itemArgs.file ||
                            "",
                        search:
                            itemArgs.search || "",
                        replace:
                            itemArgs.replace || "",
                        riskLevel:
                            itemArgs.riskLevel ||
                            itemArgs.criticality ||
                            "LOW",
                        intent:
                            itemArgs.intent ||
                            context?.intent ||
                            "operator queue proposal",
                        summary:
                            itemArgs.summary ||
                            itemArgs.reason ||
                            "Cambio propuesto por Jarvis.",
                        targetTool:
                            itemArgs.targetTool ||
                            "repo.safePatchApply",
                        targetArgs:
                            itemArgs.targetArgs || null,
                        createdAt:
                            new Date().toISOString(),
                        state:
                            "PENDING",
                        source:
                            "repo_operator_queue_v7"
                    };

                    if (!item.file || !item.path) {
                        return {
                            ok: false,
                            status: "CONTRACT_INVALID",
                            error: "FILE_REQUIRED"
                        };
                    }

                    queue.push(item);

                    window.JarvisLastOperatorQueueItem =
                        item;

                    return {
                        ok: true,
                        status: "QUEUE_ITEM_ADDED",
                        item
                    };
                };

            window.JarvisOperatorQueueApi =
                window.JarvisOperatorQueueApi || {};

            window.JarvisOperatorQueueApi.find =
                findItem;

            window.JarvisOperatorQueueApi.render =
                renderQueue;

            window.JarvisOperatorQueueApi.enqueue =
                proposal => {
                    const result =
                        enqueue(proposal || {});

                    renderQueue();

                    return result;
                };

            window.JarvisOperatorQueueApi.card =
                async itemId => {
                    const item =
                        findItem(itemId);

                    if (!item) {
                        return {
                            ok: false,
                            status: "QUEUE_ITEM_NOT_FOUND",
                            itemId
                        };
                    }

                    const card =
                        await JarvisToolRuntime.execute(
                            "repo.reviewCard",
                            {
                                file:
                                    item.file,
                                path:
                                    item.path,
                                search:
                                    item.search,
                                replace:
                                    item.replace,
                                riskLevel:
                                    item.riskLevel,
                                status:
                                    "QUEUE_REVIEW_REQUIRED",
                                reason:
                                    item.summary,
                                targetTool:
                                    item.targetTool,
                                targetArgs:
                                    item.targetArgs || {
                                        file:
                                            item.file,
                                        path:
                                            item.path,
                                        search:
                                            item.search,
                                        replace:
                                            item.replace,
                                        riskLevel:
                                            item.riskLevel
                                    },
                                intent:
                                    item.intent
                            },
                            context
                        );

                    item.reviewCardId =
                        card?.data?.cardId ||
                        card?.cardId ||
                        null;

                    item.state =
                        "CARD_READY";

                    item.card =
                        card;

                    updateBadge(item);

                    return card;
                };

            window.JarvisOperatorQueueApi.approve =
                async (itemId, mode = "simple") => {
                    const item =
                        findItem(itemId);

                    if (!item) {
                        return {
                            ok: false,
                            status: "QUEUE_ITEM_NOT_FOUND",
                            itemId
                        };
                    }

                    item.state =
                        "APPROVED";

                    item.approvalMode =
                        mode;

                    item.approvedAt =
                        new Date().toISOString();

                    updateBadge(item);

                    const doubleConfirm =
                        mode === "double" ||
                        mode === "reinforced" ||
                        item.riskLevel === "HIGH" ||
                        item.riskLevel === "CRITICAL";

                    const reinforcedApproval =
                        mode === "reinforced" ||
                        item.riskLevel === "CRITICAL";

                    const result =
                        await JarvisToolRuntime.execute(
                            item.targetTool || "repo.safePatchApply",
                            {
                                ...(item.targetArgs || {
                                    file:
                                        item.file,
                                    path:
                                        item.path,
                                    search:
                                        item.search,
                                    replace:
                                        item.replace,
                                    riskLevel:
                                        item.riskLevel
                                }),
                                approved:
                                    true,
                                codexApproved:
                                    true,
                                doubleConfirm,
                                doubleConfirmed:
                                    doubleConfirm,
                                reinforcedApproval,
                                criticalApproval:
                                    reinforcedApproval
                            },
                            {
                                approved:
                                    true,
                                codexApproved:
                                    true,
                                doubleConfirm,
                                doubleConfirmed:
                                    doubleConfirm,
                                reinforcedApproval,
                                criticalApproval:
                                    reinforcedApproval
                            }
                        );

                    item.lastResult =
                        result;

                    const resultData =
                        result?.data ||
                        result ||
                        {};

                    item.state =
                        resultData?.status === "SAFE_PATCH_APPLY_OK" ||
                        result?.status === "COMPLETED"
                            ? "EXECUTED"
                            : "APPROVED_NEEDS_REVIEW";

                    updateBadge(item);

                    renderQueue();

                    return result;
                };

            window.JarvisOperatorQueueApi.reject =
                itemId => {
                    const item =
                        findItem(itemId);

                    if (!item) {
                        return {
                            ok: false,
                            status: "QUEUE_ITEM_NOT_FOUND",
                            itemId
                        };
                    }

                    item.state =
                        "REJECTED";

                    item.rejectedAt =
                        new Date().toISOString();

                    updateBadge(item);

                    renderQueue();

                    return {
                        ok: true,
                        status: "QUEUE_ITEM_REJECTED",
                        item
                    };
                };

            window.JarvisOperatorQueueApi.approveSafeBatch =
                async () => {
                    const safeItems =
                        queue.filter(item =>
                            item.state === "PENDING" &&
                            (
                                String(item.riskLevel).toUpperCase() === "LOW" ||
                                String(item.riskLevel).toUpperCase() === "MEDIUM"
                            )
                        );

                    const results =
                        [];

                    for (const item of safeItems) {
                        results.push(
                            await window.JarvisOperatorQueueApi.approve(
                                item.id,
                                "simple"
                            )
                        );
                    }

                    renderQueue();

                    return {
                        ok: true,
                        status: "QUEUE_SAFE_BATCH_DONE",
                        count:
                            results.length,
                        results
                    };
                };

            window.JarvisOperatorQueueApi.clearDone =
                () => {
                    window.JarvisOperatorQueue =
                        queue.filter(item =>
                            item.state !== "EXECUTED" &&
                            item.state !== "REJECTED"
                        );

                    renderQueue();

                    return {
                        ok: true,
                        status: "QUEUE_DONE_CLEARED",
                        remaining:
                            window.JarvisOperatorQueue.length
                    };
                };

            if (action === "enqueue") {
                const result =
                    enqueue(args);

                renderQueue();

                return {
                    ok:
                        result.ok === true,
                    success:
                        result.ok === true,
                    status:
                        result.status,
                    itemId:
                        result.item?.id || null,
                    item:
                        result.item || null,
                    queueLength:
                        window.JarvisOperatorQueue.length,
                    tool:
                        "repo.operatorQueue",
                    source:
                        "repo_operator_queue_v7"
                };
            }

            if (action === "card") {
                const card =
                    await window.JarvisOperatorQueueApi.card(
                        args.itemId ||
                        args.id
                    );

                return {
                    ok:
                        card?.ok === true ||
                        card?.success === true ||
                        card?.status === "COMPLETED",
                    success:
                        card?.ok === true ||
                        card?.success === true ||
                        card?.status === "COMPLETED",
                    status:
                        card?.data?.status ||
                        card?.status ||
                        "QUEUE_CARD_DONE",
                    card,
                    tool:
                        "repo.operatorQueue"
                };
            }

            if (action === "approve") {
                const result =
                    await window.JarvisOperatorQueueApi.approve(
                        args.itemId ||
                        args.id,
                        args.mode || "simple"
                    );

                return {
                    ok:
                        result?.ok === true ||
                        result?.success === true ||
                        result?.status === "COMPLETED",
                    success:
                        result?.ok === true ||
                        result?.success === true ||
                        result?.status === "COMPLETED",
                    status:
                        result?.data?.status ||
                        result?.status ||
                        "QUEUE_APPROVE_DONE",
                    result,
                    tool:
                        "repo.operatorQueue"
                };
            }

            if (action === "reject") {
                const result =
                    window.JarvisOperatorQueueApi.reject(
                        args.itemId ||
                        args.id
                    );

                return {
                    ok:
                        result.ok === true,
                    success:
                        result.ok === true,
                    status:
                        result.status,
                    result,
                    tool:
                        "repo.operatorQueue"
                };
            }

            if (action === "approveSafeBatch") {
                const result =
                    await window.JarvisOperatorQueueApi.approveSafeBatch();

                return {
                    ok: true,
                    success: true,
                    status:
                        result.status,
                    result,
                    tool:
                        "repo.operatorQueue"
                };
            }

            if (action === "clearDone") {
                const result =
                    window.JarvisOperatorQueueApi.clearDone();

                return {
                    ok: true,
                    success: true,
                    status:
                        result.status,
                    result,
                    tool:
                        "repo.operatorQueue"
                };
            }

            renderQueue();

            return {
                ok: true,
                success: true,
                status: "OPERATOR_QUEUE_RENDERED",
                queueLength:
                    window.JarvisOperatorQueue.length,
                pending:
                    window.JarvisOperatorQueue.filter(item => item.state === "PENDING").length,
                queue:
                    window.JarvisOperatorQueue,
                api:
                    "window.JarvisOperatorQueueApi",
                tool:
                    "repo.operatorQueue",
                source:
                    "repo_operator_queue_v7"
            };
        }
});

// Commit 37 - JARVIS CODEX V2: Git Workflow Tools
const JarvisGitWorkflowBridge =
    window.JarvisGitWorkflowBridge || {
        endpoint:
            "http://localhost:3344/git",
        request:
            async payload => {
                return await window.JarvisLocalBridge.requestJson(
                    "/git",
                    payload || {},
                    {
                        timeoutMs:
                            Number(payload?.timeoutMs || 120000) + 5000
                    }
                );
            }
    };

window.JarvisGitWorkflowBridge =
    JarvisGitWorkflowBridge;

JarvisToolRuntime.register({
    name:
        "repo.gitStatus",
    description:
        "Ejecuta git status --short --branch mediante Local FS Bridge.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "REPO_GIT_STATUS_RESULT_V7",
    execute:
        async (args = {}, context = {}) => {
            const result =
                await JarvisGitWorkflowBridge.request({
                    action:
                        "status",
                    cwd:
                        args.cwd || ".",
                    timeoutMs:
                        args.timeoutMs || 120000
                });

            return {
                ok:
                    result.ok === true,
                success:
                    result.ok === true,
                status:
                    result.status || "GIT_STATUS_UNKNOWN",
                stdout:
                    result.stdout || "",
                stderr:
                    result.stderr || "",
                command:
                    result.command || "git status --short --branch",
                branchLine:
                    String(result.stdout || "")
                        .split(/\r?\n/)
                        .find(line => line.startsWith("##")) ||
                    null,
                changedFiles:
                    String(result.stdout || "")
                        .split(/\r?\n/)
                        .filter(line => line && !line.startsWith("##")),
                result,
                tool:
                    "repo.gitStatus",
                source:
                    "repo_git_status_v7"
            };
        }
});

JarvisToolRuntime.register({
    name:
        "repo.gitDiff",
    description:
        "Ejecuta git diff mediante Local FS Bridge.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "REPO_GIT_DIFF_RESULT_V7",
    execute:
        async (args = {}, context = {}) => {
            const action =
                args.cached === true
                    ? "diffCached"
                    : "diff";

            const result =
                await JarvisGitWorkflowBridge.request({
                    action,
                    cwd:
                        args.cwd || ".",
                    timeoutMs:
                        args.timeoutMs || 120000
                });

            const diff =
                result.stdout || "";

            return {
                ok:
                    result.ok === true,
                success:
                    result.ok === true,
                status:
                    result.status || "GIT_DIFF_UNKNOWN",
                diff,
                diffLength:
                    diff.length,
                hasDiff:
                    diff.length > 0,
                stderr:
                    result.stderr || "",
                command:
                    result.command || "git diff",
                result,
                tool:
                    "repo.gitDiff",
                source:
                    "repo_git_diff_v7"
            };
        }
});

JarvisToolRuntime.register({
    name:
        "repo.gitCommitPlan",
    description:
        "Genera un plan de commit con status y diff, sin mutar.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "REPO_GIT_COMMIT_PLAN_RESULT_V7",
    execute:
        async (args = {}, context = {}) => {
            const status =
                await JarvisToolRuntime.execute(
                    "repo.gitStatus",
                    {
                        cwd:
                            args.cwd || "."
                    },
                    context
                );

            const diff =
                await JarvisToolRuntime.execute(
                    "repo.gitDiff",
                    {
                        cwd:
                            args.cwd || "."
                    },
                    context
                );

            const changedFiles =
                status?.data?.changedFiles ||
                status?.changedFiles ||
                [];

            const suggestedMessage =
                args.message ||
                (
                    changedFiles.some(line => line.includes("tools.runtime.js"))
                        ? "Commit 37: add git workflow tools v7"
                        : "Jarvis Codex: apply supervised repo changes"
                );

            return {
                ok:
                    true,
                success:
                    true,
                status:
                    "GIT_COMMIT_PLAN_READY",
                suggestedMessage,
                changedFiles,
                hasDiff:
                    diff?.data?.hasDiff === true ||
                    diff?.hasDiff === true,
                statusResult:
                    status,
                diffResult:
                    diff,
                approvalCommand:
                    `Jarvis, apruebo git commit: ${suggestedMessage}`,
                next:
                    "Revisar status/diff. Si todo esta correcto ejecutar repo.gitCommit con approved:true.",
                tool:
                    "repo.gitCommitPlan",
                source:
                    "repo_git_commit_plan_v7"
            };
        }
});

JarvisToolRuntime.register({
    name:
        "repo.gitCommit",
    description:
        "Ejecuta git add + git commit mediante Local FS Bridge. Requiere aprobacion.",
    mutates:
        true,
    requiresApproval:
        true,
    output:
        "REPO_GIT_COMMIT_RESULT_V7",
    execute:
        async (args = {}, context = {}) => {
            const approved =
                args.approved === true ||
                args.codexApproved === true ||
                context?.approved === true ||
                context?.codexApproved === true;

            if (approved !== true) {
                return {
                    ok: false,
                    success: false,
                    status: "PENDING_APPROVAL",
                    error: "APPROVAL_REQUIRED: repo.gitCommit",
                    requiresApproval: true,
                    mutates: true,
                    approvalCommand:
                        `Jarvis, apruebo git commit: ${args.message || "commit"}`,
                    tool:
                        "repo.gitCommit"
                };
            }

            const files =
                Array.isArray(args.files) && args.files.length > 0
                    ? args.files
                    : [
                        "gestia-core/tools.runtime.js"
                    ];

            const receiptFingerprints = Array.isArray(args.receiptFingerprints)
                ? args.receiptFingerprints.filter(Boolean)
                : [];

            if (receiptFingerprints.length !== files.length) {
                return {
                    ok: false,
                    status: "VERIFIED_WRITE_RECEIPTS_REQUIRED",
                    error: "VERIFIED_WRITE_RECEIPTS_REQUIRED",
                    files,
                    receiptFingerprints,
                    tool: "repo.gitCommit"
                };
            }

            const message =
                String(args.message || "").trim();

            if (!message) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "COMMIT_MESSAGE_REQUIRED",
                    tool:
                        "repo.gitCommit"
                };
            }

            const addResult =
                await JarvisGitWorkflowBridge.request({
                    action:
                        "add",
                    files,
                    receiptFingerprints,
                    cwd:
                        args.cwd || ".",
                    approved:
                        true,
                    codexApproved:
                        true,
                    timeoutMs:
                        args.timeoutMs || 120000
                });

            if (addResult.ok !== true) {
                return {
                    ok: false,
                    success: false,
                    status:
                        addResult.status || "GIT_ADD_FAILED",
                    error:
                        addResult.error || addResult.stderr || "GIT_ADD_FAILED",
                    addResult,
                    tool:
                        "repo.gitCommit"
                };
            }

            const commitResult =
                await JarvisGitWorkflowBridge.request({
                    action:
                        "commit",
                    message,
                    receiptFingerprints,
                    cwd:
                        args.cwd || ".",
                    approved:
                        true,
                    codexApproved:
                        true,
                    timeoutMs:
                        args.timeoutMs || 120000
                });

            return {
                ok:
                    commitResult.ok === true,
                success:
                    commitResult.ok === true,
                status:
                    commitResult.status || "GIT_COMMIT_UNKNOWN",
                files,
                message,
                addResult,
                commitResult,
                commitReceipt:
                    commitResult.commitReceipt || null,
                pushApprovalCommand:
                    commitResult.commitReceipt?.receiptId
                        ? `AUTORIZO PUSH ${commitResult.commitReceipt.receiptId}`
                        : null,
                stdout:
                    commitResult.stdout || "",
                stderr:
                    commitResult.stderr || "",
                next:
                    commitResult.ok
                        ? "Commit creado. Usa el pushApprovalCommand exacto junto con commitReceipt.receiptId."
                        : "Commit no creado. Revisar stderr.",
                tool:
                    "repo.gitCommit",
                source:
                    "repo_git_commit_v7"
            };
        }
});

JarvisToolRuntime.register({
    name:
        "repo.gitPush",
    description:
        "Ejecuta git push origin branch mediante Local FS Bridge. Requiere aprobacion.",
    mutates:
        true,
    requiresApproval:
        true,
    output:
        "REPO_GIT_PUSH_RESULT_V7",
    execute:
        async (args = {}, context = {}) => {
            const approved =
                args.approved === true ||
                args.codexApproved === true ||
                context?.approved === true ||
                context?.codexApproved === true;

            if (approved !== true) {
                return {
                    ok: false,
                    success: false,
                    status: "PENDING_APPROVAL",
                    error: "APPROVAL_REQUIRED: repo.gitPush",
                    requiresApproval: true,
                    mutates: true,
                    approvalCommand:
                        `Jarvis, apruebo git push ${args.remote || "origin"} ${args.branch || "v5.9-polish"}`,
                    tool:
                        "repo.gitPush"
                };
            }

            const remote =
                args.remote || "origin";

            const branch =
                args.branch || "v5.9-polish";

            const pushResult =
                await JarvisGitWorkflowBridge.request({
                    action:
                        "push",
                    remote,
                    branch,
                    commitReceiptId:
                        args.commitReceiptId,
                    approvalCommand:
                        args.approvalCommand,
                    approvedBy:
                        args.approvedBy || "HEBERTO_MENDOZA",
                    cwd:
                        args.cwd || ".",
                    approved:
                        true,
                    codexApproved:
                        true,
                    timeoutMs:
                        args.timeoutMs || 120000
                });

            return {
                ok:
                    pushResult.ok === true,
                success:
                    pushResult.ok === true,
                status:
                    pushResult.status || "GIT_PUSH_UNKNOWN",
                remote,
                branch,
                stdout:
                    pushResult.stdout || "",
                stderr:
                    pushResult.stderr || "",
                pushResult,
                tool:
                    "repo.gitPush",
                source:
                    "repo_git_push_v7"
            };
        }
});

JarvisToolRuntime.register({
    name:
        "repo.safePatchApply",
    description:
        "Ejecuta un patch seguro de punta a punta: preview, aprobación, escritura y verificación post-write.",
    mutates:
        true,
    requiresApproval:
        true,
    output:
        "SAFE_PATCH_APPLY_RESULT",
    execute:
        async (args = {}, context = {}) => {
            const file =
                args.file ||
                args.path ||
                "";

            const path =
                args.path ||
                args.file ||
                "";

            const search =
                args.search ||
                "";

            const replace =
                args.replace ||
                "";

            if (!file || !path) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "FILE_REQUIRED",
                    tool: "repo.safePatchApply"
                };
            }

            if (!search) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "SEARCH_REQUIRED",
                    file,
                    path,
                    tool: "repo.safePatchApply"
                };
            }

            if (!replace) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "REPLACE_REQUIRED",
                    file,
                    path,
                    tool: "repo.safePatchApply"
                };
            }

            if (
                context?.approved !== true &&
                args?.approved !== true &&
                args?.codexApproved !== true
            ) {
                return {
                    ok: false,
                    success: false,
                    status: "PENDING_APPROVAL",
                    error: "APPROVAL_REQUIRED: repo.safePatchApply",
                    file,
                    path,
                    search,
                    replace,
                    mutates: true,
                    requiresApproval: true,
                    approvalCommand:
                        `Jarvis, apruebo safe patch ${file}`,
                    tool: "repo.safePatchApply"
                };
            }

            // Commit 32 - Governance real antes de escribir
            const governance =
                await JarvisToolRuntime.execute(
                    "repo.governanceCheck",
                    {
                        file,
                        path,
                        search,
                        replace,
                        riskLevel:
                            args.riskLevel ||
                            args.criticality ||
                            args.level ||
                            null,
                        approved:
                            true,
                        codexApproved:
                            true,
                        doubleConfirm:
                            args.doubleConfirm === true ||
                            args.doubleConfirmed === true,
                        doubleConfirmed:
                            args.doubleConfirmed === true ||
                            args.doubleConfirm === true,
                        reinforcedApproval:
                            args.reinforcedApproval === true ||
                            args.criticalApproval === true,
                        criticalApproval:
                            args.criticalApproval === true ||
                            args.reinforcedApproval === true,
                        intent:
                            args.intent ||
                            "safe patch apply governance gate v7",
                        maxBytes:
                            args.maxBytes || 300000
                    },
                    {
                        ...context,
                        approved:
                            true,
                        codexApproved:
                            true,
                        doubleConfirm:
                            context?.doubleConfirm === true ||
                            context?.doubleConfirmed === true ||
                            args.doubleConfirm === true ||
                            args.doubleConfirmed === true,
                        doubleConfirmed:
                            context?.doubleConfirmed === true ||
                            context?.doubleConfirm === true ||
                            args.doubleConfirmed === true ||
                            args.doubleConfirm === true,
                        reinforcedApproval:
                            context?.reinforcedApproval === true ||
                            context?.criticalApproval === true ||
                            args.reinforcedApproval === true ||
                            args.criticalApproval === true,
                        criticalApproval:
                            context?.criticalApproval === true ||
                            context?.reinforcedApproval === true ||
                            args.criticalApproval === true ||
                            args.reinforcedApproval === true
                    }
                );

            const governanceData =
                governance?.data ||
                governance ||
                {};

            const governanceWriteAllowed =
                governanceData?.writeAllowed === true;

            if (governanceWriteAllowed !== true) {
                const reviewCard =
                    await JarvisToolRuntime.execute(
                        "repo.reviewCard",
                        {
                            file,
                            path,
                            search,
                            replace,
                            riskLevel:
                                governanceData?.riskLevel ||
                                args.riskLevel ||
                                args.criticality ||
                                args.level ||
                                null,
                            status:
                                governanceData?.status ||
                                "GOVERNANCE_BLOCKED",
                            governanceStatus:
                                governanceData?.status ||
                                "GOVERNANCE_BLOCKED",
                            governance,
                            requiredControls:
                                governanceData?.requiredControls || [],
                            reason:
                                governanceData?.reason ||
                                governanceData?.error ||
                                "Governance requiere revision antes de escribir.",
                            targetTool:
                                "repo.safePatchApply",
                            targetArgs: {
                                file,
                                path,
                                search,
                                replace,
                                riskLevel:
                                    governanceData?.riskLevel ||
                                    args.riskLevel ||
                                    args.criticality ||
                                    args.level ||
                                    null
                            },
                            intent:
                                args.intent ||
                                "governance blocked review card"
                        },
                        context
                    );

                return {
                    ok: true,
success: true,
status:
    governanceData?.status ||
    "GOVERNANCE_BLOCKED",
governanceStatus:
    governanceData?.status ||
    "GOVERNANCE_BLOCKED",
governanceRiskLevel:
    governanceData?.riskLevel ||
    args.riskLevel ||
    args.criticality ||
    args.level ||
    null,
                    error:
                        "GOVERNANCE_WRITE_NOT_ALLOWED",
                    file,
                    path,
                    search,
                    replace,
                    riskLevel:
                        governanceData?.riskLevel || null,
                    writeAllowed:
                        false,
                    governance,
                    requiredControls:
                        governanceData?.requiredControls || [],
                    approvalCommand:
                        governanceData?.approvalCommand ||
                        `Jarvis, apruebo safe patch ${file}`,
                    doubleConfirmCommand:
                        governanceData?.doubleConfirmCommand ||
                        `Jarvis, confirmo doble aprobacion ${file}`,
                    criticalNote:
                        governanceData?.criticalNote || null,
                    next:
                        governanceData?.next ||
                        "Generar tarjeta UI de revision y elevar aprobacion segun nivel de riesgo.",
                    reviewCard,
                    reviewCardId:
                        reviewCard?.data?.cardId ||
                        reviewCard?.cardId ||
                        null,
                    approvalApi:
                        "window.JarvisApprovalCards",
                    tool:
                        "repo.safePatchApply"

                };
            }


            const preview =
                await JarvisToolRuntime.execute(
                    "repo.patchPreview",
                    {
                        file,
                        path,
                        search,
                        replace,
                        dryRun: true
                    },
                    {
                        ...context,
                        approved: false
                    }
                );

            const previewData =
    preview?.data ||
    preview ||
    {};

const previewReady =
    preview?.ok === true ||
    preview?.success === true ||
    preview?.status === "COMPLETED" ||
    preview?.status === "PATCH_PREVIEW_READY" ||
    previewData?.status === "PATCH_PREVIEW_READY" ||
    previewData?.status === "COMPLETED";

if (previewReady !== true) {
    return {
        ok: false,
        success: false,
        status: "PATCH_PREVIEW_FAILED",
        error:
            previewData?.error ||
            previewData?.status ||
            preview?.error ||
            preview?.status ||
            "PATCH_PREVIEW_FAILED",
        file,
        path,
        preview,
        tool: "repo.safePatchApply"
    };
}

            const readBefore =
                await JarvisToolRuntime.execute(
                    "repo.read",
                    {
                        file,
                        path
                    },
                    context
                );

            const currentContent =
                readBefore?.data?.content ||
                readBefore?.content ||
                "";

            if (
                typeof currentContent !== "string" ||
                !currentContent.includes(search)
            ) {
                return {
                    ok: false,
                    success: false,
                    status: "SEARCH_BLOCK_NOT_FOUND",
                    error:
                        "El bloque search no existe exactamente antes de escribir.",
                    file,
                    path,
                    search,
                    readBefore,
                    tool: "repo.safePatchApply"
                };
            }

            const nextContent =
                currentContent.replace(
                    search,
                    replace
                );

            if (nextContent === currentContent) {
                return {
                    ok: false,
                    success: false,
                    status: "NO_DIFF",
                    error:
                        "El replace no produjo cambios reales.",
                    file,
                    path,
                    tool: "repo.safePatchApply"
                };
            }

            // Commit 33 - Snapshot antes de escribir
            const snapshot =
                await JarvisToolRuntime.execute(
                    "repo.snapshotBeforeWrite",
                    {
                        file,
                        path,
                        content:
                            currentContent,
                        riskLevel:
                            governanceData?.riskLevel ||
                            args.riskLevel ||
                            args.criticality ||
                            args.level ||
                            null,
                        governanceRiskLevel:
                            governanceData?.riskLevel ||
                            args.riskLevel ||
                            args.criticality ||
                            args.level ||
                            null,
                        governanceStatus:
                            governanceData?.status || null,
                        intent:
                            args.intent ||
                            "safe patch apply snapshot before write",
                        approved:
                            true,
                        codexApproved:
                            true,
                        doubleConfirm:
                            args.doubleConfirm === true ||
                            args.doubleConfirmed === true,
                        reinforcedApproval:
                            args.reinforcedApproval === true ||
                            args.criticalApproval === true,
                        previewStatus:
                            previewData?.status ||
                            preview?.status ||
                            null,
                        maxSnapshots:
                            args.maxSnapshots || 25
                    },
                    {
                        ...context,
                        approved:
                            true,
                        codexApproved:
                            true
                    }
                );

            const snapshotData =
                snapshot?.data ||
                snapshot ||
                {};

            if (
                snapshotData?.status !== "SNAPSHOT_BEFORE_WRITE_OK" &&
                snapshot?.status !== "SNAPSHOT_BEFORE_WRITE_OK"
            ) {
                return {
                    ok: false,
                    success: false,
                    status: "SNAPSHOT_BEFORE_WRITE_FAILED",
                    error:
                        snapshotData?.error ||
                        snapshotData?.status ||
                        snapshot?.error ||
                        snapshot?.status ||
                        "SNAPSHOT_BEFORE_WRITE_FAILED",
                    file,
                    path,
                    governance,
                    snapshot,
                    tool:
                        "repo.safePatchApply"
                };
            }

            const writeResult =
                await JarvisToolRuntime.execute(
                    "repo.write",
                    {
                        file,
                        path,
                        content:
                            nextContent,
                        approved:
                            true,
                        codexApproved:
                            true
                    },
                    {
                        ...context,
                        approved:
                            true
                    }
                );

            if (
                writeResult?.ok !== true &&
                writeResult?.success !== true
            ) {
                return {
                    ok: false,
                    success: false,
                    status: "WRITE_FAILED",
                    error:
                        writeResult?.error ||
                        writeResult?.status ||
                        "WRITE_FAILED",
                    file,
                    path,
                    preview,
                    writeResult,
                    tool: "repo.safePatchApply"
                };
            }

            const verify =
                await JarvisToolRuntime.execute(
                    "repo.postWriteVerify",
                    {
                        file,
                        path,
                        search,
                        replace
                    },
                    context
                );

            const verifyData =
                verify?.data ||
                verify ||
                {};

            const verified =
                verifyData?.status === "POST_WRITE_VERIFY_OK" ||
                verify?.status === "POST_WRITE_VERIFY_OK" ||
                (
                    verifyData?.replaceFound === true &&
                    verifyData?.oldSearchGone === true
                );

            const reviewCard =
                await JarvisToolRuntime.execute(
                    "repo.reviewCard",
                    {
                        file,
                        path,
                        search,
                        replace,
                        riskLevel:
                            governanceData?.riskLevel ||
                            args.riskLevel ||
                            args.criticality ||
                            args.level ||
                            null,
                        status:
                            verified
                                ? "WRITE_VERIFIED"
                                : "WRITE_VERIFY_FAILED",
                        governanceStatus:
                            governanceData?.status || null,
                        previewStatus:
                            previewData?.status ||
                            preview?.status ||
                            null,
                        snapshotId:
                            snapshotData?.snapshotId || null,
                        rollbackAvailable:
                            snapshotData?.rollbackAvailable === true,
                        governance,
                        snapshot,
                        requiredControls:
                            governanceData?.requiredControls || [],
                        reason:
                            verified
                                ? "Cambio aplicado y verificado. Rollback disponible."
                                : "Cambio aplicado pero verificacion fallo. Revisar y considerar rollback.",
                        targetTool:
                            "repo.rollbackLastPatch",
                        targetArgs: {
                            snapshotId:
                                snapshotData?.snapshotId || null
                        },
                        intent:
                            args.intent ||
                            "post write review card"
                    },
                    context
                );

            return {

                ok:
                    verified === true,
                success:
                    verified === true,
                status:
                    verified
                        ? "SAFE_PATCH_APPLY_OK"
                        : "SAFE_PATCH_APPLY_VERIFY_FAILED",
                file,
                path,
                search,
                replace,
                beforeLength:
                    currentContent.length,
                afterLength:
                    nextContent.length,
                preview,
                governance,
                governanceStatus:
                    governanceData?.status || null,
                governanceRiskLevel:
                    governanceData?.riskLevel ||
                    args.riskLevel ||
                    args.criticality ||
                    args.level ||
                    null,
                snapshot,
                snapshotId:
                    snapshotData?.snapshotId || null,
                snapshotBeforeHash:
                    snapshotData?.beforeHash || null,
                rollbackAvailable:
                    snapshotData?.rollbackAvailable === true,
                 rollbackTool:
                    "repo.rollbackLastPatch",
                rollbackCommand:
                    snapshotData?.snapshotId
                        ? `JarvisToolRuntime.execute("repo.rollbackLastPatch", { snapshotId: "${snapshotData.snapshotId}", approved: true, codexApproved: true }, { approved: true })`
                        : null,
                reviewCard,
                reviewCardId:
                    reviewCard?.data?.cardId ||
                    reviewCard?.cardId ||
                    null,
                approvalApi:
                    "window.JarvisApprovalCards",
                writeResult,
                verify,

                tool:
                    "repo.safePatchApply",
                source:
                    "repo_safe_patch_apply_v1"
            };
        }
});

// Commit 29 — JARVIS CODEX V2: Safe Patch Plan
JarvisToolRuntime.register({
    name:
        "repo.safePatchPlan",
    description:
        "Genera un plan seguro antes de aplicar un patch: valida contrato, lee archivo, confirma search, calcula riesgo y prepara aprobación.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "SAFE_PATCH_PLAN_RESULT",
    execute:
        async (args = {}, context = {}) => {
            const file =
                args.file ||
                args.path ||
                "";

            const path =
                args.path ||
                args.file ||
                "";

            const search =
                args.search ||
                "";

            const replace =
                args.replace ||
                "";

            const intent =
                args.intent ||
                "";

            if (!file || !path) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "FILE_REQUIRED",
                    tool: "repo.safePatchPlan"
                };
            }

            if (!search) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "SEARCH_REQUIRED",
                    file,
                    path,
                    intent,
                    tool: "repo.safePatchPlan"
                };
            }

            if (typeof replace !== "string") {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "REPLACE_REQUIRED",
                    file,
                    path,
                    search,
                    intent,
                    tool: "repo.safePatchPlan"
                };
            }

            const readResult =
                await JarvisToolRuntime.execute(
                    "repo.read",
                    {
                        file,
                        path,
                        maxBytes:
                            args.maxBytes || 300000
                    },
                    context
                );

            const readData =
                readResult?.data ||
                readResult ||
                {};

            const content =
                readData?.content ||
                "";

            const searchFound =
                typeof content === "string" &&
                content.includes(search);

            if (!searchFound) {
                return {
                    ok: false,
                    success: false,
                    status: "SEARCH_BLOCK_NOT_FOUND",
                    error:
                        "El bloque search no existe exactamente en el archivo. No se puede planear un patch seguro.",
                    file,
                    path,
                    searchLength:
                        search.length,
                    contentLength:
                        content.length || 0,
                    suggestion:
                        "Usa repo.read o repo.grep para copiar el bloque exacto antes de planear el patch.",
                    readResult,
                    tool:
                        "repo.safePatchPlan"
                };
            }

            const preview =
                await JarvisToolRuntime.execute(
                    "repo.patchPreview",
                    {
                        file,
                        path,
                        search,
                        replace,
                        dryRun: true
                    },
                    {
                        ...context,
                        approved: false
                    }
                );

            const previewData =
                preview?.data ||
                preview ||
                {};

            const beforeLength =
                content.length;

            const afterLength =
                content.replace(
                    search,
                    replace
                ).length;

            const delta =
                afterLength - beforeLength;

            const touchesRuntime =
                String(file).includes("tools.runtime.js");

            const largeChange =
                Math.abs(delta) > 3000 ||
                search.length > 3000 ||
                replace.length > 3000;

            const riskLevel =
                touchesRuntime && largeChange
                    ? "HIGH"
                    : touchesRuntime
                        ? "MEDIUM"
                        : largeChange
                            ? "MEDIUM"
                            : "LOW";

            const requiresApproval =
                true;

            const approvalCommand =
                `Jarvis, apruebo safe patch ${file}`;

            return {
                ok: true,
                success: true,
                status: "SAFE_PATCH_PLAN_READY",
                file,
                path,
                intent,
                riskLevel,
                requiresApproval,
                approvalCommand,
                searchFound,
                searchLength:
                    search.length,
                replaceLength:
                    replace.length,
                beforeLength,
                afterLength,
                delta,
                toolsAffected:
                    touchesRuntime
                        ? [
                            "JarvisToolRuntime",
                            "repo.safePatchApply",
                            "repo.patchPreview",
                            "repo.postWriteVerify"
                        ]
                        : [],
                plan: {
                    step1:
                        "Revisar preview generado en dry-run.",
                    step2:
                        "Confirmar que el bloque search es exacto.",
                    step3:
                        "Pedir aprobación humana antes de escribir.",
                    step4:
                        "Ejecutar repo.safePatchApply con approved:true.",
                    step5:
                        "Verificar resultado con repo.postWriteVerify."
                },
                previewStatus:
                    previewData?.status ||
                    preview?.status ||
                    null,
                preview,
                nextTool:
                    "repo.safePatchApply",
                tool:
                    "repo.safePatchPlan",
                source:
                    "repo_safe_patch_plan_v1"
            };
        }
});

// Commit 31 — JARVIS CODEX V2: Governance Check V7
JarvisToolRuntime.register({
    name:
        "repo.governanceCheck",
    description:
        "Evalúa el nivel crítico de un patch antes de permitir escritura: LOW, MEDIUM, HIGH o CRITICAL.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "REPO_GOVERNANCE_CHECK_RESULT_V7",
    inputSchema: {
        type:
            "object",
        properties: {
            file: {
                type:
                    "string",
                description:
                    "Archivo objetivo."
            },
            search: {
                type:
                    "string",
                description:
                    "Bloque exacto a buscar, opcional pero recomendado."
            },
            replace: {
                type:
                    "string",
                description:
                    "Bloque exacto de reemplazo, opcional pero recomendado."
            },
            riskLevel: {
                type:
                    "string",
                description:
                    "Nivel forzado opcional: LOW, MEDIUM, HIGH, CRITICAL."
            },
            doubleConfirm: {
                type:
                    "boolean",
                description:
                    "Confirmación doble para cambios HIGH."
            },
            reinforcedApproval: {
                type:
                    "boolean",
                description:
                    "Aprobación reforzada futura para CRITICAL. Por ahora no habilita escritura."
            }
        }
    },
    execute:
        async (args = {}, context = {}) => {
            const file =
                args.file ||
                args.path ||
                "";

            const path =
                args.path ||
                args.file ||
                "";

            const search =
                typeof args.search === "string"
                    ? args.search
                    : "";

            const replace =
                typeof args.replace === "string"
                    ? args.replace
                    : "";

            const hasPatchBlocks =
                search.length > 0 &&
                typeof replace === "string";

            if (!file || !path) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "FILE_REQUIRED",
                    tool: "repo.governanceCheck"
                };
            }

            const normalizeRisk =
                value => {
                    const raw =
                        String(value || "")
                            .trim()
                            .toUpperCase();

                    if (
                        raw === "CRITICAL" ||
                        raw === "HIGH" ||
                        raw === "MEDIUM" ||
                        raw === "LOW"
                    ) {
                        return raw;
                    }

                    return null;
                };

            const riskFromScore =
                score => {
                    const numeric =
                        Number(score);

                    if (!Number.isFinite(numeric)) {
                        return null;
                    }

                    if (numeric >= 90) {
                        return "CRITICAL";
                    }

                    if (numeric >= 70) {
                        return "HIGH";
                    }

                    if (numeric >= 40) {
                        return "MEDIUM";
                    }

                    return "LOW";
                };

            let plan =
                null;

            if (hasPatchBlocks) {
                plan =
                    await JarvisToolRuntime.execute(
                        "repo.safePatchPlan",
                        {
                            file,
                            path,
                            search,
                            replace,
                            intent:
                                args.intent ||
                                "governance check v7",
                            maxBytes:
                                args.maxBytes || 300000
                        },
                        {
                            ...context,
                            approved: false
                        }
                    );
            }

            const planData =
                plan?.data ||
                plan ||
                {};

            let impact =
                null;

            try {
                impact =
                    await JarvisToolRuntime.execute(
                        "repo.impact",
                        {
                            file,
                            path,
                            target:
                                file
                        },
                        context
                    );
            }
            catch(error) {
                impact = {
                    ok: false,
                    success: false,
                    status: "IMPACT_UNAVAILABLE",
                    error:
                        error?.message || String(error)
                };
            }

            const impactData =
                impact?.data ||
                impact ||
                {};

            const impactPolicy =
                impactData?.policy ||
                impactData?.impact?.policy ||
                {};

            const normalizedRisk =
                normalizeRisk(args.riskLevel) ||
                normalizeRisk(args.criticality) ||
                normalizeRisk(args.level) ||
                normalizeRisk(planData?.riskLevel) ||
                normalizeRisk(impactData?.riskLevel) ||
                normalizeRisk(impactData?.criticality) ||
                normalizeRisk(impactData?.criticalityLevel) ||
                normalizeRisk(impactPolicy?.riskLevel) ||
                normalizeRisk(impactPolicy?.criticality) ||
                riskFromScore(impactData?.propagatedScore) ||
                riskFromScore(impactData?.score) ||
                riskFromScore(impactPolicy?.propagatedScore) ||
                "LOW";

            const planReady =
                planData?.status === "SAFE_PATCH_PLAN_READY" ||
                plan?.status === "SAFE_PATCH_PLAN_READY" ||
                hasPatchBlocks === false;

            const impactReady =
                impact?.ok === true ||
                impact?.success === true ||
                impact?.status === "COMPLETED" ||
                impactData?.ok === true ||
                impactData?.success === true ||
                impactData?.status === "COMPLETED";

            const doubleConfirm =
                args.doubleConfirm === true ||
                args.doubleConfirmed === true ||
                context?.doubleConfirm === true ||
                context?.doubleConfirmed === true;

            const reinforcedApproval =
                args.reinforcedApproval === true ||
                args.criticalApproval === true ||
                context?.reinforcedApproval === true ||
                context?.criticalApproval === true;

            const approved =
                args.approved === true ||
                args.codexApproved === true ||
                context?.approved === true ||
                context?.codexApproved === true;

            let decision =
                null;


            if (normalizedRisk === "LOW") {
                decision = {
                    status:
                        "GOVERNANCE_APPROVED",
                    writeAllowed:
                        true,
                    requiresApproval:
                        true,
                    requiredControls: [
                        "human_approval"
                    ],
                    reason:
                        "LOW risk permite escritura con aprobación simple."
                };
            }
            else if (normalizedRisk === "MEDIUM") {
                decision = {
                    status:
                        planReady && impactReady
                            ? "GOVERNANCE_APPROVED"
                            : "GOVERNANCE_NEEDS_PLAN_AND_IMPACT",
                    writeAllowed:
                        planReady && impactReady,
                    requiresApproval:
                        true,
                    requiredControls: [
                        "preview",
                        "safe_patch_plan",
                        "impact_analysis",
                        "human_approval"
                    ],
                    reason:
                        "MEDIUM requiere preview, plan e impacto antes de escribir."
                };
            }
            else if (normalizedRisk === "HIGH") {
                decision = {
                    status:
                        planReady && impactReady && doubleConfirm
                            ? "GOVERNANCE_APPROVED_HIGH"
                            : "GOVERNANCE_NEEDS_DOUBLE_CONFIRMATION",
                    writeAllowed:
                        planReady && impactReady && doubleConfirm,
                    requiresApproval:
                        true,
                    requiresDoubleConfirmation:
                        true,
                    requiredControls: [
                        "preview",
                        "safe_patch_plan",
                        "impact_analysis",
                        "human_approval",
                        "double_confirmation"
                    ],
                    reason:
                        "HIGH requiere confirmación doble antes de escribir."
                };
            }
            else {
                const criticalWriteAllowed =
                    planReady === true &&
                    impactReady === true &&
                    approved === true &&
                    doubleConfirm === true &&
                    reinforcedApproval === true;

                decision = {
                    status:
                        criticalWriteAllowed
                            ? "GOVERNANCE_APPROVED_CRITICAL_REINFORCED"
                            : "GOVERNANCE_NEEDS_REINFORCED_APPROVAL",
                    writeAllowed:
                        criticalWriteAllowed,
                    requiresApproval:
                        true,
                    requiresDoubleConfirmation:
                        true,
                    requiresReinforcedApproval:
                        true,
                    reinforcedApprovalReceived:
                        reinforcedApproval,
                    requiredControls: [
                        "preview",
                        "safe_patch_plan",
                        "impact_analysis",
                        "human_approval",
                        "double_confirmation",
                        "reinforced_approval"
                    ],
                    reason:
                        criticalWriteAllowed
                            ? "CRITICAL autorizado con aprobacion reforzada. Snapshot/rollback se agregara en el siguiente commit."
                            : "CRITICAL requiere approved:true, doubleConfirm:true y reinforcedApproval:true antes de escribir."
                };
            }

            return {
                ok:
                    decision.writeAllowed === true ||
                    decision.status === "GOVERNANCE_BLOCKED_CRITICAL",
                success:
                    decision.writeAllowed === true ||
                    decision.status === "GOVERNANCE_BLOCKED_CRITICAL",
                status:
                    decision.status,
                file,
                path,
                riskLevel:
                    normalizedRisk,
                writeAllowed:
                    decision.writeAllowed,
                requiresApproval:
                    decision.requiresApproval === true,
                requiresDoubleConfirmation:
                    decision.requiresDoubleConfirmation === true,
                requiresReinforcedApproval:
                    decision.requiresReinforcedApproval === true,
                requiredControls:
                    decision.requiredControls,
                reason:
                    decision.reason,
                planReady,
                impactReady,
                hasPatchBlocks,
                approvalCommand:
                    `Jarvis, apruebo governance ${normalizedRisk} ${file}`,
                doubleConfirmCommand:
                    normalizedRisk === "HIGH"
                        ? `Jarvis, confirmo doble aprobación HIGH ${file}`
                        : null,
                criticalNote:
                    normalizedRisk === "CRITICAL"
                        ? "CRITICAL puede escribirse solo con approved:true, doubleConfirm:true y reinforcedApproval:true. Snapshot/rollback queda para Commit 33/34."
                        : null,
                plan,
                impact,
                next:
                    decision.writeAllowed
                        ? "Puede continuar a repo.safePatchApply bajo el nivel de aprobacion requerido."
                        : "No escribir todavia. Elevar aprobacion segun governance o generar tarjeta UI de revision.",
                tool:
                    "repo.governanceCheck",
                source:
                    "repo_governance_check_v7"
            };
        }
});
JarvisToolRuntime.register({
    name: "repo.search",
    description: "Busca patrones, expresiones o contexto dentro del código base.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_SEARCH_RESULT",
    inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
            query: {
                type: "string",
                description: "Texto o simbolo que se debe localizar en el repositorio real."
            }
        },
        additionalProperties: false
    },
    execute: async (args = {}, context = {}) => {
        const argObject =
            args &&
            typeof args === "object" &&
            !Array.isArray(args)
                ? args
                : {};

        const query =
            String(
                typeof args === "string"
                    ? args
                    : (
                        argObject.query ||
                        argObject.term ||
                        argObject.search ||
                        argObject.file ||
                        argObject.path ||
                        argObject.target ||
                        ""
                    )
            )
                .trim();

        const bridgeTerm =
            String(
                argObject.term ||
                argObject.search ||
                query
            )
                .trim();

        if (
            !query &&
            !bridgeTerm
        ) {
            return {
                ok: false,
                success: false,
                status: "CONTRACT_INVALID",
                error: "SEARCH_QUERY_REQUIRED",
                tool: "repo.search"
            };
        }

        const normalizeSearchText =
            value =>
                String(value || "")
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase();

        const tokens =
            [
                ...new Set(
                    normalizeSearchText(
                        `${query} ${bridgeTerm}`
                    )
                        .match(/[a-z0-9_./-]{4,}/g) ||
                    []
                )
            ]
                .slice(0, 12);

        const repoEntries =
            Object.entries(
                window.__REPO_INDEX__ || {}
            );

        const indexResults =
            repoEntries
                .map(([key, meta]) => {
                    const haystack =
                        normalizeSearchText(
                            [
                                key,
                                meta?.path,
                                meta?.module,
                                meta?.type
                            ]
                                .filter(Boolean)
                                .join(" ")
                        );

                    const score =
                        tokens.reduce(
                            (total, token) =>
                                total +
                                (
                                    haystack.includes(token)
                                        ? 1
                                        : 0
                                ),
                            0
                        ) +
                        (
                            haystack.includes(
                                normalizeSearchText(query)
                            )
                                ? 2
                                : 0
                        );

                    if (score <= 0) {
                        return null;
                    }

                    return {
                        file:
                            meta?.path ||
                            key,
                        name:
                            key,
                        path:
                            meta?.path ||
                            key,
                        module:
                            meta?.module ||
                            null,
                        type:
                            meta?.type ||
                            null,
                        score
                    };
                })
                .filter(Boolean)
                .sort((a, b) =>
                    b.score - a.score
                )
                .slice(0, 50);

        let bridgeResult =
            null;

        let bridgeError =
            null;

        if (
            bridgeTerm &&
            window.JarvisLocalBridge?.grepRepo
        ) {
            try {
                bridgeResult =
                    await window.JarvisLocalBridge.grepRepo({
                        term:
                            bridgeTerm,
                        query:
                            bridgeTerm,
                        cwd:
                            argObject.cwd || ".",
                        maxFiles:
                            argObject.maxFiles || 800,
                        maxFileSizeBytes:
                            argObject.maxFileSizeBytes || 512000,
                        maxMatches:
                            argObject.maxMatches || 80,
                        source:
                            "jarvis_repo_search_bridge_v7"
                    });
            }
            catch(error) {
                bridgeError =
                    error?.message ||
                    String(error);
            }
        }

        const qualifiedIdentifiers =
            extractQualifiedSourceIdentifiers(
                `${query} ${bridgeTerm}`
            );

        const sourceDefinitions = [];
        const definitionMatches = [];
        const inspectedFiles = new Map();
        const definitionKeys = new Set();

        if (
            qualifiedIdentifiers.length > 0 &&
            window.JarvisLocalBridge?.grepRepo &&
            window.JarvisLocalBridge?.readFile
        ) {
            for (
                const identifier
                of qualifiedIdentifiers.slice(0, 6)
            ) {
                let identifierSearch =
                    null;

                try {
                    identifierSearch =
                        await window.JarvisLocalBridge.grepRepo({
                            term:
                                identifier,
                            query:
                                identifier,
                            cwd:
                                argObject.cwd || ".",
                            maxFiles:
                                argObject.maxFiles || 1200,
                            maxFileSizeBytes:
                                argObject.maxFileSizeBytes || 512000,
                            maxMatches:
                                80,
                            source:
                                "jarvis_repo_exact_identifier_search_v7"
                        });
                }
                catch(error) {
                    identifierSearch = {
                        ok:
                            false,
                        error:
                            error?.message ||
                            String(error),
                        matches:
                            []
                    };
                }

                const identifierFiles =
                    [
                        ...new Set(
                            (
                                identifierSearch?.matches ||
                                []
                            )
                                .map(match =>
                                    String(
                                        match?.file ||
                                        ""
                                    )
                                        .split("\\")
                                        .join("/")
                                        .trim()
                                )
                                .filter(Boolean)
                        )
                    ]
                        .slice(0, 16);

                for (const file of identifierFiles) {
                    if (!inspectedFiles.has(file)) {
                        let readResult;

                        try {
                            readResult =
                                await window.JarvisLocalBridge.readFile({
                                    file,
                                    path:
                                        file,
                                    maxBytes:
                                        400000,
                                    source:
                                        "jarvis_repo_definition_inspection_v7"
                                });
                        }
                        catch(error) {
                            readResult = {
                                ok:
                                    false,
                                error:
                                    error?.message ||
                                    String(error)
                            };
                        }

                        const content =
                            readResult?.content ||
                            readResult?.data?.content ||
                            "";

                        inspectedFiles.set(
                            file,
                            typeof content === "string" &&
                            content
                                ? analyzeRepoSourceStructure(
                                    content
                                )
                                : null
                        );
                    }

                    const structure =
                        inspectedFiles.get(
                            file
                        );

                    if (
                        structure?.kind !==
                            "tool_registry"
                    ) {
                        continue;
                    }

                    for (
                        const registration
                        of structure.registrations ||
                        []
                    ) {
                        if (
                            String(
                                registration?.name ||
                                ""
                            )
                                .toLocaleLowerCase() !==
                            identifier.toLocaleLowerCase()
                        ) {
                            continue;
                        }

                        const key =
                            `${file}::${registration.name}`;

                        if (definitionKeys.has(key)) {
                            continue;
                        }

                        definitionKeys.add(key);
                        sourceDefinitions.push({
                            ...registration,
                            file,
                            identifier,
                            verified:
                                true,
                            source:
                                "repo_source_structure"
                        });
                        definitionMatches.push({
                            file,
                            line:
                                registration.line ||
                                null,
                            snippet:
                                `name: "${registration.name}"`,
                            matchKind:
                                "executable_registration",
                            verified:
                                true
                        });
                    }
                }
            }
        }

        const matches =
            [
                ...definitionMatches,
                ...(
                    bridgeResult?.matches ||
                    []
                )
            ]
                .filter((match, index, list) =>
                    list.findIndex(candidate =>
                        candidate?.file === match?.file &&
                        candidate?.line === match?.line &&
                        candidate?.snippet === match?.snippet
                    ) === index
                );

        return {
            ok: true,
            success: true,
            status: "COMPLETED",
            query,
            term:
                bridgeTerm,
            tokens,
            qualifiedIdentifiers,
            sourceDefinitions,
            definitionFiles:
                [
                    ...new Set(
                        sourceDefinitions.map(
                            definition =>
                                definition.file
                        )
                    )
                ],
            results:
                indexResults,
            totalResults:
                indexResults.length,
            matches,
            totalMatches:
                bridgeResult?.totalMatches ||
                matches.length ||
                0,
            totalFilesScanned:
                bridgeResult?.totalFilesScanned ||
                0,
            bridgeStatus:
                bridgeResult
                    ? (
                        bridgeResult.ok === true
                            ? "CONNECTED"
                            : "FAILED"
                    )
                    : (
                        bridgeError
                            ? "FAILED"
                            : "UNAVAILABLE"
                    ),
            bridgeError,
            tool: "repo.search"
        };
    }
});

JarvisToolRuntime.register({
    name: "repo.grep",
    description: "Busca texto real dentro del repositorio usando el bridge local read-only.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_GREP_RESULT",
    execute: async (args = {}, context = {}) => {
        const term =
            args.term ||
            args.query ||
            args.search ||
            "";

        if (!term) {
            return {
                ok: false,
                success: false,
                status: "CONTRACT_INVALID",
                error: "GREP_TERM_REQUIRED",
                tool: "repo.grep"
            };
        }

        if (!window.JarvisLocalBridge?.grepRepo) {
            return {
                ok: false,
                success: false,
                status: "LOCAL_BRIDGE_REQUIRED",
                error: "JarvisLocalBridge.grepRepo no está disponible.",
                term,
                tool: "repo.grep",
                next:
                    "Levantar jarvis-fs-bridge.js con endpoint /grep."
            };
        }

        const result =
            await window.JarvisLocalBridge.grepRepo({
                term,
                query:
                    term,
                cwd:
                    args.cwd || ".",
                maxFiles:
                    args.maxFiles || 800,
                maxFileSizeBytes:
                    args.maxFileSizeBytes || 512000,
                maxMatches:
                    args.maxMatches || 80,
                source:
                    "jarvis_repo_grep_v7"
            });

        return {
            ok:
                result?.ok === true,
            success:
                result?.ok === true,
            status:
                result?.ok === true
                    ? "COMPLETED"
                    : "FAILED",
            term,
            query:
                term,
            totalFilesScanned:
                result?.totalFilesScanned || 0,
            totalMatches:
                result?.totalMatches || 0,
            matches:
                result?.matches || [],
            result,
            tool:
                "repo.grep"
        };
    }
});

JarvisToolRuntime.register({
    name: "repo.prepareWrite",
    description: "Prepara un patch exacto contra un snapshot y devuelve fingerprint, nonce y comando de aprobación; no escribe.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_WRITE_PREPARATION",
    execute: async (args = {}, context = {}) => {
        if (!window.JarvisLocalBridge?.prepareWrite) return { ok: false, status: "WRITE_BRIDGE_NOT_AVAILABLE", error: "WRITE_BRIDGE_NOT_AVAILABLE" };
        return await window.JarvisLocalBridge.prepareWrite({
            objectiveId: args.objectiveId || context.objectiveId,
            caseId: args.caseId || context.caseId,
            authorityId: args.authorityId || context.authorityId || "HEBERTO_MENDOZA",
            controllerId: args.controllerId || context.controllerId || "CODEX_SIA7",
            file: args.file || args.path,
            operation: args.operation || "replace",
            search: typeof args.search === "string" ? args.search : "",
            replace: typeof args.replace === "string" ? args.replace : "",
            matchCount: Number(args.matchCount),
            ttlMs: args.ttlMs || 120000,
            source: "repo_prepare_write_v7"
        });
    }
});

JarvisToolRuntime.register({
    name: "repo.authorizeWrite",
    description: "Convierte una preparación exacta en autorización de un solo uso mediante el comando humano ligado al fingerprint.",
    mutates: true,
    requiresApproval: true,
    output: "REPO_WRITE_AUTHORIZATION",
    execute: async (args = {}) => {
        if (!window.JarvisLocalBridge?.authorizeWrite) return { ok: false, status: "WRITE_BRIDGE_NOT_AVAILABLE", error: "WRITE_BRIDGE_NOT_AVAILABLE" };
        return await window.JarvisLocalBridge.authorizeWrite({
            fingerprint: args.fingerprint,
            nonce: args.nonce,
            approvalCommand: args.approvalCommand,
            approvedBy: args.approvedBy || "HEBERTO_MENDOZA",
            source: "repo_authorize_write_v7"
        });
    }
});

JarvisToolRuntime.register({
    name:
        "repo.write",
    description: "Consume una autorización exacta de un solo uso y verifica el archivo escrito; no acepta file+content.",
    mutates: true,
    requiresApproval:
        true,
    output: "REPO_WRITE_RESULT",
    execute: async (args = {}) => {
        if (!window.JarvisLocalBridge?.writeFile) return { ok: false, status: "WRITE_BRIDGE_NOT_AVAILABLE", error: "WRITE_BRIDGE_NOT_AVAILABLE" };
        const result = await window.JarvisLocalBridge.writeFile({
            fingerprint: args.fingerprint,
            nonce: args.nonce,
            objectiveId: args.objectiveId,
            caseId: args.caseId,
            source: "repo_write_runtime_v7_one_time"
        });
        if (result?.ok === true && result?.verified === true && result?.consumedAt) {
            globalThis.__JARVIS_ONE_TIME_WRITE_HEALTH__ = {
                ok: true,
                status: result.status,
                fingerprint: result.fingerprint,
                objectiveId: result.objectiveId,
                caseId: result.caseId,
                consumedAt: result.consumedAt,
                verified: true
            };
        }
        return { ...result, source: "repo_write_runtime_v7_one_time" };
    }
});

JarvisToolRuntime.register({
    name: "repo.graph",
    description: "Construye el grafo vivo del repositorio real con dependencias, funciones, llamadas, listeners, endpoints, colecciones y pruebas.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_GRAPH_RESULT",
    execute: async (args = {}) => {
        if (!window.JarvisLocalBridge?.buildRepoGraph) {
            return { ok: false, status: "LOCAL_BRIDGE_REQUIRED", error: "JarvisLocalBridge.buildRepoGraph no está disponible.", tool: "repo.graph" };
        }
        const result = await window.JarvisLocalBridge.buildRepoGraph({
            refresh: args.refresh === true,
            maxFiles: args.maxFiles || 2500,
            maxFileSizeBytes: args.maxFileSizeBytes || 800000,
            source: "jarvis_repo_graph_tool_v7"
        });
        return { ...result, success: result?.ok === true, tool: "repo.graph" };
    }
});

JarvisToolRuntime.register({
    name: "repo.rankCandidates",
    description: "Clasifica archivos candidatos con puntuación aditiva desglosada, evidencia, dependencias, pruebas, riesgos y justificación.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_CANDIDATE_RANKING_RESULT",
    execute: async (args = {}) => {
        const query = String(args.query || args.objective || "").trim();
        if (!query) return { ok: false, status: "CONTRACT_INVALID", error: "QUERY_REQUIRED", tool: "repo.rankCandidates" };
        if (!window.JarvisLocalBridge?.rankRepoCandidates) {
            return { ok: false, status: "LOCAL_BRIDGE_REQUIRED", error: "JarvisLocalBridge.rankRepoCandidates no está disponible.", tool: "repo.rankCandidates" };
        }
        const result = await window.JarvisLocalBridge.rankRepoCandidates({
            query,
            objective: query,
            plannedFiles: Array.isArray(args.plannedFiles) ? args.plannedFiles : [],
            limit: args.limit || 8,
            refresh: args.refresh === true,
            source: "jarvis_candidate_ranking_tool_v7"
        });
        return { ...result, success: result?.ok === true, tool: "repo.rankCandidates" };
    }
});

JarvisToolRuntime.register({
    name: "repo.architectReview",
    description: "Revisa un plan con evidencia del grafo y ranking antes de que pueda solicitar aprobación humana; nunca ejecuta ni concede aprobación.",
    mutates: false,
    requiresApproval: false,
    output: "CHIEF_ARCHITECT_REVIEW",
    execute: async (args = {}, context = {}) => {
        const instruction = String(args.instruction || args.originalInstruction || context.rawInput || "").trim();
        const plan = args.plan && typeof args.plan === "object" && !Array.isArray(args.plan) ? args.plan : {};
        if (!instruction) return { ok: false, status: "CONTRACT_INVALID", error: "ORIGINAL_INSTRUCTION_REQUIRED", tool: "repo.architectReview" };
        const graph = await window.JarvisLocalBridge?.buildRepoGraph?.({ refresh: args.refresh === true, source: "jarvis_architect_graph_v7" });
        const plannedFiles = Array.isArray(plan.targetFiles) ? plan.targetFiles : [];
        const ranking = await window.JarvisLocalBridge?.rankRepoCandidates?.({
            query: instruction,
            objective: instruction,
            plannedFiles,
            limit: 8,
            source: "jarvis_architect_ranking_v7"
        });
        const review = reviewChiefArchitectPlan({
            instruction,
            plan,
            graph,
            ranking,
            authority: args.authority || context.authority || { authorityId: context.authorityId, role: context.role }
        });
        globalThis.__JARVIS_CHIEF_ARCHITECT_HEALTH__ = {
            ok: review.decision === "READY_FOR_HUMAN_APPROVAL",
            status: review.status,
            checkedAt: review.reviewedAt,
            targetFiles: review.targetFiles,
            blockers: review.blockers.length
        };
        return { ...review, success: review.ok === true, tool: "repo.architectReview" };
    }
});

JarvisToolRuntime.register({
    name: "repo.impact",
    description: "Analiza el impacto y las dependencias (qué se rompe si se modifica un archivo).",
    mutates: false,
    requiresApproval: false,
    output: "REPO_IMPACT_RESULT",
    inputSchema: {
        type: "object",
        required: ["file"],
        properties: {
            file: {
                type: "string",
                description: "Ruta real verificada del archivo cuyo impacto se debe analizar."
            }
        },
        additionalProperties: false
    },
    execute: async (args = {}, context = {}) => {
        const { analyzeRepoImpact } = await import('/gestia-core/hubs/repo.hub.js');

        const requestedFile =
            typeof args === "string"
                ? args
                : (
                    args.file ||
                    args.path ||
                    args.target ||
                    ""
                );

        const cleanFile =
            String(requestedFile || "")
                .replace(/\\/g, "/")
                .replace(/^\.\/+/, "")
                .replace(/^\/+/, "")
                .trim();

        const basename =
            cleanFile
                .split("/")
                .filter(Boolean)
                .pop() ||
            cleanFile;

        const attempts =
            [
                cleanFile,
                basename
            ]
                .filter(Boolean)
                .filter((item, index, list) =>
                    list.indexOf(item) === index
                );

        let lastResult =
            null;

        for (const file of attempts) {
            const result =
                await analyzeRepoImpact({
                    ...(
                        typeof args === "object" &&
                        !Array.isArray(args)
                            ? args
                            : {}
                    ),
                    file,
                    path:
                        file,
                    requestedFile:
                        cleanFile
                });

            if (result?.ok === true) {
                return {
                    ...result,
                    requestedFile:
                        cleanFile,
                    resolvedFile:
                        file,
                    attemptedFiles:
                        attempts,
                    tool:
                        "repo.impact"
                };
            }

            lastResult =
                result;
        }

        const liveRead =
            cleanFile && window.JarvisLocalBridge?.readFile
                ? await window.JarvisLocalBridge.readFile({
                    file: cleanFile,
                    path: cleanFile,
                    maxBytes: 300000,
                    source: "jarvis_repo_impact_live_fallback_v7"
                })
                : null;

        if (liveRead?.ok === true) {
            const references = window.JarvisLocalBridge?.grepRepo
                ? await window.JarvisLocalBridge.grepRepo({
                    term: basename,
                    query: basename,
                    maxMatches: 40,
                    source: "jarvis_repo_impact_live_references_v7"
                })
                : null;
            const matches = Array.isArray(references?.matches)
                ? references.matches.filter(match => match?.file !== cleanFile)
                : [];

            return {
                ok: true,
                success: true,
                status: "IMPACT_READY_LIVE",
                requestedFile: cleanFile,
                resolvedFile: liveRead.path || cleanFile,
                attemptedFiles: attempts,
                source: "live_repo_bridge",
                indexed: false,
                risk: matches.length > 0 ? "MEDIUM" : "LOW",
                dependents: matches.map(match => ({
                    file: match.file,
                    line: match.line || null,
                    snippet: match.snippet || ""
                })),
                totalDependents: matches.length,
                note: "Archivo verificado en el repositorio real; impacto calculado mediante referencias vivas porque el indice estatico aun no contiene este archivo.",
                tool: "repo.impact"
            };
        }

        return {
            ...(lastResult || {}),
            ok:
                false,
            requestedFile:
                cleanFile,
            resolvedFile:
                null,
            attemptedFiles:
                attempts,
            tool:
                "repo.impact"
        };
    }
});


JarvisToolRuntime.register({
    name: "repo.diagnose",
    description: "Diagnóstico forense read-only de un archivo real del repo. Clasifica tipo, señales, riesgos y siguientes acciones sin escribir.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_DIAGNOSE_RESULT",
    inputSchema: {
        type: "object",
        required: ["file"],
        properties: {
            file: {
                type: "string",
                description: "Ruta del archivo objetivo."
            },
            mode: {
                type: "string",
                description: "diagnose, proposal, patch, patch_preview, verify o create_file."
            },
            rawInput: {
                type: "string",
                description: "Comando original del usuario."
            },
            searchTerm: {
                type: "string",
                description: "Término opcional para diagnóstico focalizado."
            }
        }
    },
    execute: async (args = {}, context = {}) => {
        const file =
            args.file ||
            args.path ||
            args.target ||
            "";

        if (
            !file ||
            typeof file !== "string"
        ) {
            return {
                ok: false,
                success: false,
                status: "CONTRACT_INVALID",
                error: "FILE_REQUIRED",
                tool: "repo.diagnose"
            };
        }

        const normalizedFile =
            String(file)
                .replace(/^\.\/+/, "")
                .replace(/^\/+/, "")
                .trim();

        const indexedFile =
            window.__REPO_INDEX__?.[normalizedFile] ||
            Object.values(window.__REPO_INDEX__ || {})
                .find(meta => {
                    const indexedPath =
                        String(meta?.path || "")
                            .replace(/^\.\/+/, "")
                            .replace(/^\/+/, "")
                            .trim();

                    return (
                        indexedPath === normalizedFile ||
                        indexedPath.split("/").pop() === normalizedFile
                    );
                }) ||
            null;

        const resolvedFile =
            String(indexedFile?.path || normalizedFile)
                .replace(/^\.\/+/, "")
                .replace(/^\/+/, "")
                .trim();

        let content =
            "";

        let readSource =
            "unavailable";

        if (
            window.JarvisLocalBridge?.readFile
        ) {
            const bridgeRead =
                await window.JarvisLocalBridge.readFile({
                    file:
                        resolvedFile,
                    path:
                        resolvedFile,
                    maxBytes:
                        args.maxBytes ||
                        300000,
                    source:
                        "jarvis_repo_diagnose_read_v1"
                });

            if (
                bridgeRead?.ok === true &&
                typeof bridgeRead.content === "string"
            ) {
                content =
                    bridgeRead.content;

                readSource =
                    bridgeRead.source ||
                    "jarvis_local_bridge_read";
            }
        }

        if (
            !content
        ) {
            try {
                const {
                    findRepoFile,
                    loadRepoContext
                } =
                    await import('/gestia-core/hubs/repo.hub.js');

                let found =
                    null;

                try {
                    found =
                        await findRepoFile({
                            file:
                                resolvedFile,
                            path:
                                resolvedFile,
                            target:
                                resolvedFile
                        });
                } catch {
                    found =
                        null;
                }

                let loaded =
                    found?.content ||
                    found?.source ||
                    found?.text
                        ? found
                        : null;

                if (
                    !loaded
                ) {
                    try {
                        loaded =
                            await loadRepoContext({
                                file:
                                    resolvedFile,
                                path:
                                    resolvedFile,
                                target:
                                    resolvedFile
                            });
                    } catch {
                        loaded =
                            null;
                    }
                }

                const fallbackContent =
                    loaded?.content ||
                    loaded?.source ||
                    loaded?.text ||
                    "";

                if (
                    typeof fallbackContent === "string" &&
                    fallbackContent.trim()
                ) {
                    content =
                        fallbackContent;

                    readSource =
                        "repo_hub_fallback";
                }
            }
            catch(error) {
                console.warn(
                    "⚠️ [REPO_DIAGNOSE_READ_FALLBACK_FAIL]",
                    error
                );
            }
        }

        if (
            typeof content !== "string" ||
            !content.trim()
        ) {
            return {
                ok: false,
                success: false,
                status: "CONTENT_UNAVAILABLE",
                error: "No fue posible hidratar contenido real para diagnosticar.",
                file:
                    resolvedFile,
                requestedFile:
                    normalizedFile,
                resolvedFile,
                source:
                    readSource,
                tool:
                    "repo.diagnose"
            };
        }

        const lines =
            content.split(/\r?\n/);

        const executableContent =
            buildExecutableSourceView(
                content
            );

        const sourceStructure =
            analyzeRepoSourceStructure(
                content
            );

        const trimmedLines =
            lines.map(line => line.trim());

        const importLines =
            trimmedLines.filter(line =>
                line.startsWith("import ")
            );

        const exportLines =
            trimmedLines.filter(line =>
                line.startsWith("export ") ||
                line.includes("export {")
            );

        const functionMatches =
            content.match(
                /\b(function\s+[a-zA-Z0-9_$]+|const\s+[a-zA-Z0-9_$]+\s*=\s*(?:async\s*)?\(|async\s+function\s+[a-zA-Z0-9_$]+)/g
            ) ||
            [];

        const hasHtmlTemplate =
            /innerHTML\s*=|insertAdjacentHTML|createElement\s*\(/i
                .test(executableContent) ||
            /<\s*(div|section|button|form|main|article|header|footer|nav|table|ul|li|span|input|select|textarea)\b/i
                .test(executableContent);

        const hasTailwindOrClasses =
            /class(Name)?\s*=|class\s*=|classList\s*\./i
                .test(executableContent);

        const hasFirestore =
            /\b(collection|doc|getDoc|getDocs|setDoc|updateDoc|addDoc|deleteDoc|runTransaction|query|where|onSnapshot)\s*\(/i
                .test(executableContent);

        const hasRuntimeBridge =
            /ToolsBridge|JarvisToolRuntime|ResponseComposer|window\./i
                .test(executableContent);

        const hasAuthObserver =
            /\bonAuthStateChanged\s*\(/i
                .test(executableContent);

        const hasRoleAuthorityRouter =
            /\bresolveGestiaRouteDecision\s*\(|\[ROLE_AUTHORITY_REDIRECT\]|APP_MAIN_ROLE_AUTHORITY_REDIRECT|routeDecision\.reason/i
                .test(executableContent);

        const hasAuthPendingGuard =
            /gestia-auth-pending|fortressLoader|AUTH_ROLE_UNRESOLVED/i
                .test(executableContent);

        const hasLegacyProfileFallback =
            /legacySnap|colecciones legacy|doc\s*\(\s*db\s*,\s*["'`](tecnicos|clientes|admins)["'`]/i
                .test(executableContent);

        const hasRepoWrite =
            /CODE_WRITE|SIA7_COMMIT|repoCommitWriteFile|writeRepoFile|repo_files|PATCH_SYSTEM_CORE/i
                .test(executableContent);

        const hasGps =
            /watchPosition|geolocation|coords|latitude|longitude|geofence|gps/i
                .test(executableContent);

        const hasExactPatchObject =
            /\bsearch\s*:\s*["'`][\s\S]{0,800}\breplace\s*:\s*["'`]/i
                .test(content);

        const hasPatchPreview =
            /\b(?:patchPreview|dryRun|generatePatch|applyPatch)\b/i
                .test(executableContent) ||
            hasExactPatchObject;

        const hasGenericUiPatch =
            /\.tarjeta|\.card|\[class\*=['"]card['"]|UI_OPTIMIZATION|!important/i
                .test(executableContent);

        const hasToolRegistry =
            sourceStructure.kind ===
                "tool_registry" &&
            sourceStructure.registrationCount > 0;

        const duplicateCaseNames =
            [];

        const caseMatches =
            [...content.matchAll(/case\s+["'`]([^"'`]+)["'`]\s*:/g)]
                .map(match => match[1]);

        const caseCount =
            caseMatches.reduce(
                (acc, name) => {
                    acc[name] =
                        (acc[name] || 0) + 1;

                    return acc;
                },
                {}
            );

        Object.entries(caseCount)
            .forEach(([name, count]) => {
                if (count > 1) {
                    duplicateCaseNames.push({
                        case:
                            name,
                        count
                    });
                }
            });

        const todoCount =
            (
                content.match(
                    /\b(TODO|FIXME|HACK|TEMP|placeholder|stub)\b/gi
                ) ||
                []
            ).length;

        const findingLinePatterns = {
            ROUTER_ONLY_NO_UI: /^\s*(?:import|export)\b/i,
            UI_RENDERING_DETECTED: /innerHTML\s*=|insertAdjacentHTML|createElement\s*\(|<\s*(?:div|section|button|form|main|article|header|footer|nav|table|ul|li|span|input|select|textarea)\b/i,
            FIRESTORE_OPS_DETECTED: /\b(?:collection|doc|getDoc|getDocs|setDoc|updateDoc|addDoc|deleteDoc|runTransaction|query|where|onSnapshot)\s*\(/i,
            GEOLOCATION_CAPABILITY_DETECTED: /watchPosition|geolocation|coords|latitude|longitude|geofence|gps/i,
            DUPLICATE_SWITCH_CASES: /case\s+["'`][^"'`]+["'`]\s*:/i,
            GENERIC_UI_PATCH_PATTERN: /\.tarjeta|\.card|\[class\*=['"]card['"]|UI_OPTIMIZATION|!important/i,
            REPO_WRITE_CAPABILITY: /CODE_WRITE|SIA7_COMMIT|repoCommitWriteFile|writeRepoFile|repo_files|PATCH_SYSTEM_CORE/i,
            TODO_OR_STUB_MARKERS: /\b(?:TODO|FIXME|HACK|TEMP|placeholder|stub)\b/i
        };

        findingLinePatterns.AUTH_SESSION_OBSERVER = /\bonAuthStateChanged\s*\(/i;
        findingLinePatterns.ROLE_AUTHORITY_ROUTER = /\bresolveGestiaRouteDecision\s*\(|\[ROLE_AUTHORITY_REDIRECT\]|APP_MAIN_ROLE_AUTHORITY_REDIRECT|routeDecision\.reason/i;
        findingLinePatterns.AUTH_PENDING_GUARD = /gestia-auth-pending|fortressLoader|AUTH_ROLE_UNRESOLVED/i;
        findingLinePatterns.LEGACY_PROFILE_FALLBACK = /legacySnap|colecciones legacy|doc\s*\(\s*db\s*,\s*["'`](tecnicos|clientes|admins)["'`]/i;

        const findEvidenceLines = pattern =>
            pattern
                ? lines
                    .map((line, index) =>
                        pattern.test(line)
                            ? index + 1
                            : null
                    )
                    .filter(Boolean)
                    .slice(0, 3)
                : [];

        const typeSignals =
            {
                router:
                    importLines.length > 0 &&
                    exportLines.length > 0 &&
                    functionMatches.length <= 1 &&
                    !hasHtmlTemplate &&
                    !hasFirestore,

                uiPanel:
                    hasHtmlTemplate ||
                    hasTailwindOrClasses,

                firebaseData:
                    hasFirestore,

                executor:
                    hasRepoWrite ||
                    duplicateCaseNames.length > 0,

                bridge:
                    hasRuntimeBridge,

                gps:
                    hasGps,

                patchEngine:
                    hasPatchPreview,

                toolRegistry:
                    hasToolRegistry,

                html:
                    normalizedFile.endsWith(".html"),

                css:
                    normalizedFile.endsWith(".css"),

                json:
                    normalizedFile.endsWith(".json")
            };

        const capabilities =
            [
                typeSignals.uiPanel
                    ? "ui_rendering"
                    : "",
                typeSignals.firebaseData
                    ? "firestore_data"
                    : "",
                hasAuthObserver
                    ? "auth_observer"
                    : "",
                hasRoleAuthorityRouter
                    ? "role_routing"
                    : "",
                hasAuthPendingGuard
                    ? "auth_pending_guard"
                    : "",
                typeSignals.gps
                    ? "geolocation"
                    : "",
                typeSignals.bridge
                    ? "runtime_bridge"
                    : "",
                typeSignals.patchEngine
                    ? "patch_preview"
                    : "",
                typeSignals.toolRegistry
                    ? "tool_registry"
                    : "",
                typeSignals.executor
                    ? "repo_execution"
                    : ""
            ]
                .filter(Boolean);

        let fileType =
            "generic";

        if (typeSignals.html) {
            fileType =
                "html_application";
        }
        else if (typeSignals.css) {
            fileType =
                "css_stylesheet";
        }
        else if (typeSignals.json) {
            fileType =
                "json_document";
        }
        else if (typeSignals.toolRegistry) {
            fileType =
                "tool_registry";
        }
        else if (typeSignals.router) {
            fileType =
                "router";
        }
        else if (typeSignals.executor) {
            fileType =
                "executor";
        }
        else if (typeSignals.patchEngine) {
            fileType =
                "patch_engine";
        }
        else if (typeSignals.firebaseData) {
            fileType =
                "firebase_data";
        }
        else if (typeSignals.gps) {
            fileType =
                "geolocation_module";
        }
        else if (typeSignals.uiPanel) {
            fileType =
                "ui_panel";
        }
        else if (typeSignals.bridge) {
            fileType =
                "runtime_bridge";
        }

        const findings =
            [];

        const recommendations =
            [];

        const nextActions =
            [];

        if (
            fileType === "router"
        ) {
            findings.push({
                id:
                    "ROUTER_ONLY_NO_UI",
                severity:
                    "INFO",
                title:
                    "Archivo router sin UI directa",
                detail:
                    "El archivo importa y exporta módulos, pero no contiene tarjetas, templates visuales ni lógica de render.",
                evidence:
                    {
                        imports:
                            importLines.length,
                        exports:
                            exportLines.length,
                        functions:
                            functionMatches.length
                    }
            });

            recommendations.push(
                "No aplicar parches visuales en este archivo."
            );

            recommendations.push(
                "Conservar imports y exports actuales porque conectan módulos principales."
            );

            nextActions.push(
                "Si buscas diseño, tarjetas o layout, diagnosticar panel-cliente.js, panel-admin.js o panel-tecnico.js."
            );
        }

        if (
            hasHtmlTemplate
        ) {
            findings.push({
                id:
                    "UI_RENDERING_DETECTED",
                severity:
                    "MEDIUM",
                title:
                    "Renderizado UI detectado",
                detail:
                    "El archivo contiene HTML/template/render dinámico. El diagnóstico visual debe revisar estructura, cards, botones, estados y duplicación de clases.",
                evidence:
                    {
                        hasHtmlTemplate:
                            true,
                        hasTailwindOrClasses
                    }
            });

            recommendations.push(
                "Separar lectura de datos, armado de estado y render UI cuando estén mezclados."
            );

            recommendations.push(
                "Buscar cards sobredimensionadas revisando clases de padding, grid, flex, min-height y wrappers."
            );
        }

        if (
            hasFirestore
        ) {
            findings.push({
                id:
                    "FIRESTORE_OPS_DETECTED",
                severity:
                    "HIGH",
                title:
                    "Operaciones Firestore detectadas",
                detail:
                    "El archivo toca datos o listeners. Cualquier parche debe cuidar estados, permisos, listeners y transacciones.",
                evidence:
                    {
                        firestore:
                            true
                    }
            });

            recommendations.push(
                "No modificar queries, transacciones ni listeners sin prueba posterior."
            );
        }

        if (
            hasAuthObserver
        ) {
            findings.push({
                id:
                    "AUTH_SESSION_OBSERVER",
                severity:
                    "MEDIUM",
                title:
                    "Observer de sesion detectado",
                detail:
                    "La navegacion depende de que Firebase termine de resolver el usuario y su perfil. Si una pantalla aparece antes de ese cierre, el sintoma visible puede ser un salto temporal entre cliente, admin o CEO.",
                evidence:
                    {
                        lines:
                            findEvidenceLines(
                                findingLinePatterns.AUTH_SESSION_OBSERVER
                            )
                    }
            });

            recommendations.push(
                "Verificar que las superficies privadas permanezcan cubiertas hasta que el observer resuelva usuario, perfil y rol."
            );
        }

        if (
            hasRoleAuthorityRouter
        ) {
            findings.push({
                id:
                    "ROLE_AUTHORITY_ROUTER",
                severity:
                    "HIGH",
                title:
                    "Router canonico de rol detectado",
                detail:
                    "El destino final lo decide resolveGestiaRouteDecision, no la pagina visible en el primer instante. Un rebote hacia admin suele indicar que el rol canonical ya se resolvio y corrigio una superficie inicial.",
                evidence:
                    {
                        lines:
                            findEvidenceLines(
                                findingLinePatterns.ROLE_AUTHORITY_ROUTER
                            )
                    }
            });

            recommendations.push(
                "Diagnosticar app-login.js, firebase.js, app-main.js y role-authority.js como cadena causal antes de culpar a cliente.html o terminal."
            );
        }

        if (
            hasAuthPendingGuard
        ) {
            findings.push({
                id:
                    "AUTH_PENDING_GUARD",
                severity:
                    "MEDIUM",
                title:
                    "Guard visual de auth detectado",
                detail:
                    "La clase gestia-auth-pending debe ocultar superficies privadas durante la resolucion. Si hay parpadeo, revisar cache/bundle viejo o una entrada que no aplica este guard temprano.",
                evidence:
                    {
                        lines:
                            findEvidenceLines(
                                findingLinePatterns.AUTH_PENDING_GUARD
                            )
                    }
            });

            recommendations.push(
                "Probar con bundle versionado y revisar consola antes de modificar rutas, porque la fuente actual ya contiene guard contra flicker."
            );
        }

        if (
            hasLegacyProfileFallback
        ) {
            findings.push({
                id:
                    "LEGACY_PROFILE_FALLBACK",
                severity:
                    "MEDIUM",
                title:
                    "Fallback de perfil legacy detectado",
                detail:
                    "El perfil puede buscarse en colecciones legacy despues del documento central. Esa espera puede explicar retrasos de segundos antes de que el rol final estabilice la ruta.",
                evidence:
                    {
                        lines:
                            findEvidenceLines(
                                findingLinePatterns.LEGACY_PROFILE_FALLBACK
                            )
                    }
            });

            recommendations.push(
                "Medir latencia de perfil central vs legacy antes de asumir que el router esta duplicado."
            );
        }

        if (
            hasGps
        ) {
            findings.push({
                id:
                    "GEOLOCATION_CAPABILITY_DETECTED",
                severity:
                    "INFO",
                title:
                    "Capacidad de geolocalizacion detectada",
                detail:
                    "El archivo usa senales GPS/geolocation. Esto es una capacidad secundaria y no reemplaza el tipo estructural del archivo.",
                evidence:
                    {
                        geolocation:
                            true
                    }
            });

            recommendations.push(
                "Validar permisos, estados de rechazo y limpieza de watchers antes de modificar la geolocalizacion."
            );
        }

        if (
            duplicateCaseNames.length > 0
        ) {
            findings.push({
                id:
                    "DUPLICATE_SWITCH_CASES",
                severity:
                    "HIGH",
                title:
                    "Cases duplicados en switch",
                detail:
                    "Existen cases repetidos. En un switch, los primeros pueden bloquear ramas posteriores y dejar lógica muerta.",
                evidence:
                    duplicateCaseNames
            });

            recommendations.push(
                "Unificar cases duplicados antes de meter nuevas rutas de ejecución."
            );
        }

        if (
            hasGenericUiPatch
        ) {
            findings.push({
                id:
                    "GENERIC_UI_PATCH_PATTERN",
                severity:
                    "HIGH",
                title:
                    "Patrón de parche UI genérico detectado",
                detail:
                    "Se detectó CSS o lógica genérica tipo card/tarjeta/!important. Esto puede producir parches acordeonados sin analizar el layout real.",
                evidence:
                    {
                        genericUiPatch:
                            true
                    }
            });

            recommendations.push(
                "Bloquear este patrón como auto-write. Solo permitirlo como sugerencia temporal."
            );
        }

        if (
            hasRepoWrite
        ) {
            findings.push({
                id:
                    "REPO_WRITE_CAPABILITY",
                severity:
                    "CRITICAL",
                title:
                    "Capacidad de escritura repo detectada",
                detail:
                    "El archivo puede escribir o preparar cambios. Requiere dry-run, aprobación, no-op guard y validación antes de mutar.",
                evidence:
                    {
                        repoWrite:
                            true
                    }
            });

            recommendations.push(
                "Exigir aprobación explícita antes de cualquier CODE_WRITE o SIA7_COMMIT."
            );
        }

        if (
            todoCount > 0
        ) {
            findings.push({
                id:
                    "TODO_OR_STUB_MARKERS",
                severity:
                    "LOW",
                title:
                    "Marcadores temporales detectados",
                detail:
                    "Hay TODO/FIXME/HACK/TEMP/placeholder/stub en el archivo.",
                evidence:
                    {
                        total:
                            todoCount
                    }
            });
        }

        if (
            findings.length === 0
        ) {
            findings.push({
                id:
                    "NO_HIGH_SIGNAL_FINDINGS",
                severity:
                    "INFO",
                title:
                    "Sin hallazgos críticos por heurística local",
                detail:
                    "No se detectaron patrones de riesgo altos con el diagnóstico local. Revisar impacto y pruebas antes de modificar.",
                evidence:
                    {
                        imports:
                            importLines.length,
                        exports:
                            exportLines.length,
                        functions:
                            functionMatches.length
                    }
            });

            recommendations.push(
                "Usar repo.impact y tests.run antes de cualquier cambio."
            );
        }

        findings.forEach(finding => {
            const evidenceLines =
                findEvidenceLines(
                    findingLinePatterns[finding.id]
                );

            if (!evidenceLines.length) {
                return;
            }

            finding.evidence = Array.isArray(finding.evidence)
                ? {
                    matches: finding.evidence,
                    lines: evidenceLines
                }
                : {
                    ...(finding.evidence || {}),
                    lines: evidenceLines
                };
        });

        const shouldPatch =
            args.mode === "patch" ||
            args.mode === "patch_preview";

        if (
            shouldPatch &&
            fileType === "router"
        ) {
            recommendations.push(
                "Patch bloqueado a nivel diagnóstico: un router no debe recibir parche visual ni guard genérico si no hay bug concreto."
            );

            nextActions.push(
                "Para parche visual real, ejecutar: Jarvis, diagnostica panel-cliente.js"
            );
        }

        const riskScore =
            findings.some(item => item.severity === "CRITICAL")
                ? 100
                : findings.some(item => item.severity === "HIGH")
                    ? 85
                    : findings.some(item => item.severity === "MEDIUM")
                        ? 60
                        : 25;

        const risk =
            riskScore >= 90
                ? "CRITICAL"
                : riskScore >= 75
                    ? "HIGH"
                    : riskScore >= 50
                        ? "MEDIUM"
                        : "LOW";

        const summary =
            [
                `Diagnóstico Repo SIA7`,
                `Archivo: ${resolvedFile}`,
                `Tipo principal: ${fileType}`,
                `Capacidades: ${capabilities.join(", ") || "ninguna especial"}`,
                `Riesgo local: ${risk}`,
                `Líneas: ${lines.length}`,
                `Imports: ${importLines.length}`,
                `Exports: ${exportLines.length}`,
                `Funciones detectadas: ${functionMatches.length}`,
                ``,
                `Hallazgos:`,
                ...findings.map(
                    finding =>
                        `- [${finding.severity}] ${finding.title}: ${finding.detail}`
                ),
                ``,
                `Recomendaciones:`,
                ...(
                    recommendations.length
                        ? recommendations.map(item => `- ${item}`)
                        : ["- Sin recomendación automática específica."]
                ),
                ``,
                `Siguiente acción:`,
                ...(
                    nextActions.length
                        ? nextActions.map(item => `- ${item}`)
                        : ["- Ejecutar patchPreview solo con search/replace exacto."]
                )
            ]
                .join("\n");

        return {
            ok:
                true,
            success:
                true,
            status:
                "DIAGNOSE_READY",
            tool:
                "repo.diagnose",
            file:
                resolvedFile,
            requestedFile:
                normalizedFile,
            resolvedFile,
            mode:
                args.mode ||
                "diagnose",
            fileType,
            capabilities,
            risk,
            riskScore,
            source:
                readSource,
            sourceStructure,
            metrics: {
                lines:
                    lines.length,
                imports:
                    importLines.length,
                exports:
                    exportLines.length,
                functions:
                    functionMatches.length,
                hasHtmlTemplate,
                hasTailwindOrClasses,
                hasFirestore,
                hasRepoWrite,
                duplicateCases:
                    duplicateCaseNames.length,
                todoCount
            },
            findings,
            recommendations,
            nextActions,
            summary
        };
    }
});

/* ==========================================
   JARVIS LOCAL BRIDGE CLIENT V7
========================================== */

window.JarvisLocalBridge ||= {};

window.JarvisLocalBridge.runCommand ||= async function(payload = {}) {
    const command =
        payload.command ||
        "";

    const allowedCommands =
        new Set([
            "npm run check:syntax",
            "npm test",
            "npm run ci:test"
        ]);

    if (!allowedCommands.has(command)) {
        return {
            ok: false,
            status: "COMMAND_NOT_ALLOWED",
            error: "COMMAND_NOT_ALLOWED",
            command,
            allowedCommands:
                [...allowedCommands],
            source:
                "jarvis_local_bridge_client_v7"
        };
    }

    const commandTimeoutMs =
        payload.timeoutMs ||
        120000;

    const result =
        await window.JarvisLocalBridge.requestJson(
            "/run",
            {
                command,
                cwd:
                    payload.cwd ||
                    ".",
                timeoutMs:
                    commandTimeoutMs,
                source:
                    payload.source ||
                    "jarvis_tests_run_v7"
            },
            {
                timeoutMs:
                    Number(commandTimeoutMs) + 5000
            }
        );

    return {
        ...result,
        httpStatus:
            result?.httpStatus || null,
        source:
            result?.source ||
            "jarvis_local_bridge_client_v7"
    };
};

window.JarvisLocalBridge.grepRepo ||= async function(payload = {}) {
    const term =
        payload.term ||
        payload.query ||
        "";

    const result =
        await window.JarvisLocalBridge.requestJson(
            "/grep",
            {
                term,
                query:
                    payload.query || term,
                cwd:
                    payload.cwd || ".",
                maxFiles:
                    payload.maxFiles || 800,
                maxFileSizeBytes:
                    payload.maxFileSizeBytes || 512000,
                maxMatches:
                    payload.maxMatches || 80,
                source:
                    payload.source ||
                    "jarvis_repo_grep_v7"
            }
        );

    return {
        ...result,
        httpStatus:
            result?.httpStatus || null,
        source:
            result?.source ||
            "jarvis_local_bridge_grep_client_v7"
    };
};

window.JarvisLocalBridge.buildRepoGraph ||= async function(payload = {}) {
    return await window.JarvisLocalBridge.requestJson(
        "/repo/graph",
        {
            refresh: payload.refresh === true,
            maxFiles: payload.maxFiles || 2500,
            maxFileSizeBytes: payload.maxFileSizeBytes || 800000,
            source: payload.source || "jarvis_repo_graph_v7"
        },
        { timeoutMs: payload.timeoutMs || 120000 }
    );
};

window.JarvisLocalBridge.rankRepoCandidates ||= async function(payload = {}) {
    return await window.JarvisLocalBridge.requestJson(
        "/repo/candidates",
        {
            query: payload.query || payload.objective || "",
            objective: payload.objective || payload.query || "",
            plannedFiles: Array.isArray(payload.plannedFiles) ? payload.plannedFiles : [],
            limit: payload.limit || 8,
            refresh: payload.refresh === true,
            source: payload.source || "jarvis_candidate_ranking_v7"
        },
        { timeoutMs: payload.timeoutMs || 120000 }
    );
};


window.JarvisLocalBridge.readFile ||= async function(payload = {}) {
    const file =
        payload.file ||
        payload.path ||
        "";

    const result =
        await window.JarvisLocalBridge.requestJson(
            "/read",
            {
                file,
                path:
                    payload.path || file,
                maxBytes:
                    payload.maxBytes || 300000,
                startLine:
                    payload.startLine || null,
                endLine:
                    payload.endLine || null,
                source:
                    payload.source ||
                    "jarvis_repo_read_v7"
            }
        );

    return {
        ...result,
        httpStatus:
            result?.httpStatus || null,
        source:
            result?.source ||
            "jarvis_local_bridge_read_client_v7"
    };
};

window.JarvisLocalBridge.writeFile ||= async function(payload = {}) {
    const file =
        payload.file ||
        payload.path ||
        "";

    const content =
        typeof payload.content === "string"
            ? payload.content
            : "";

    const dryRun =
        payload.dryRun === true;

    const result =
        await window.JarvisLocalBridge.requestJson(
            "/write",
            {
                file,
                path:
                    payload.path || file,
                content,
                dryRun,
                source:
                    payload.source ||
                    "jarvis_repo_write_v7"
            },
            {
                timeoutMs:
                    payload.timeoutMs || 30000
            }
        );

    return {
        ...result,
        httpStatus:
            result?.httpStatus || null,
        source:
            result?.source ||
            "jarvis_local_bridge_write_client_v7"
    };
};


JarvisToolRuntime.register({
    name: "tests.run",
    description: "Ejecuta validaciones del repo: check:syntax, test o ci:test.",
    mutates: false,
    requiresApproval: false,
    output: "TEST_RUN_RESULT",
    execute: async (args = {}, context = {}) => {
        const command =
            args.command ||
            args.script ||
            "test";

        const allowedCommands =
            new Set([
                "check:syntax",
                "test",
                "ci:test"
            ]);

        if (!allowedCommands.has(command)) {
            return {
                ok: false,
                success: false,
                status: "CONTRACT_INVALID",
                error: "TEST_COMMAND_NOT_ALLOWED",
                allowedCommands:
                    [...allowedCommands],
                received:
                    command,
                tool:
                    "tests.run"
            };
        }

        const npmCommand =
            command === "test"
                ? "npm test"
                : `npm run ${command}`;

        if (!window.JarvisLocalBridge?.runCommand) {
            return {
                ok: false,
                success: false,
                status: "LOCAL_BRIDGE_REQUIRED",
                error: "JarvisLocalBridge.runCommand no está disponible.",
                command,
                npmCommand,
                tool:
                    "tests.run",
                next:
                    "Conectar tests.run al bridge local o endpoint de ejecución controlada."
            };
        }

        const result =
            await window.JarvisLocalBridge.runCommand({
                command:
                    npmCommand,
                cwd:
                    args.cwd ||
                    ".",
                timeoutMs:
                    args.timeoutMs ||
                    120000,
                source:
                    "jarvis_tests_run_v7"
            });

        return {
            ok:
                result?.ok === true,
            success:
                result?.ok === true,
            status:
                result?.ok === true
                    ? "PASSED"
                    : result?.status || "FAILED",
            command,
            npmCommand,
            result,
            tool:
                "tests.run"
        };
    }
});

// Commit 30 — JARVIS CODEX V2: Tests Codex Pipeline V7
JarvisToolRuntime.register({
    name:
        "tests.codexPipeline",
    description:
        "Valida el pipeline Codex seguro: read, patchPreview, safePatchPlan, bloqueo sin aprobación y aplicación opcional con verificación.",
    mutates:
        false,
    requiresApproval:
        false,
    output:
        "CODEX_PIPELINE_TEST_RESULT_V7",
    inputSchema: {
        type:
            "object",
        properties: {
            file: {
                type:
                    "string",
                description:
                    "Archivo sandbox a probar. Default: test-replace.js"
            },
            search: {
                type:
                    "string",
                description:
                    "Bloque exacto a buscar."
            },
            replace: {
                type:
                    "string",
                description:
                    "Bloque exacto de reemplazo."
            },
            mode: {
                type:
                    "string",
                description:
                    "dry = no escribe. apply = aplica con aprobación explícita.",
                default:
                    "dry"
            },
            approved: {
                type:
                    "boolean",
                description:
                    "Requerido para mode apply."
            }
        }
    },
    execute:
        async (args = {}, context = {}) => {
            const file =
                args.file ||
                args.path ||
                "test-replace.js";

            const path =
                args.path ||
                args.file ||
                file;

            const search =
                typeof args.search === "string"
                    ? args.search
                    : "timestamp: Date.now()";

            const replace =
                typeof args.replace === "string"
                    ? args.replace
                    : "timestamp: Date.now() + 1";

            const mode =
                args.mode ||
                "dry";

            const approved =
                args.approved === true ||
                args.codexApproved === true ||
                context?.approved === true;

            const steps =
                [];

            const pushStep =
                (name, result) => {
                    const data =
                        result?.data ||
                        result ||
                        {};

                    const ok =
                        result?.ok === true ||
                        result?.success === true ||
                        data?.ok === true ||
                        data?.success === true ||
                        result?.status === "COMPLETED" ||
                        data?.status === "PATCH_PREVIEW_READY" ||
                        data?.status === "SAFE_PATCH_PLAN_READY" ||
                        data?.status === "POST_WRITE_VERIFY_OK" ||
                        data?.status === "SAFE_PATCH_APPLY_OK" ||
                        data?.status === "PENDING_APPROVAL";

                    steps.push({
                        name,
                        ok,
                        status:
                            data?.status ||
                            result?.status ||
                            null,
                        tool:
                            data?.tool ||
                            result?.tool ||
                            null,
                        result
                    });

                    return {
                        ok,
                        data
                    };
                };

            if (
                mode !== "dry" &&
                mode !== "apply"
            ) {
                return {
                    ok: false,
                    success: false,
                    status: "CONTRACT_INVALID",
                    error: "MODE_NOT_ALLOWED",
                    allowedModes: [
                        "dry",
                        "apply"
                    ],
                    received:
                        mode,
                    tool:
                        "tests.codexPipeline"
                };
            }

            const read =
                await JarvisToolRuntime.execute(
                    "repo.read",
                    {
                        file,
                        path,
                        maxBytes:
                            args.maxBytes || 300000
                    },
                    context
                );

            const readStep =
                pushStep(
                    "repo.read",
                    read
                );

            const content =
                readStep.data?.content ||
                read?.content ||
                "";

            const searchFound =
                typeof content === "string" &&
                content.includes(search);

            if (!searchFound) {
                return {
                    ok: false,
                    success: false,
                    status: "CODEX_PIPELINE_FAILED",
                    error: "SEARCH_NOT_FOUND_BEFORE_PIPELINE",
                    file,
                    path,
                    search,
                    searchLength:
                        search.length,
                    contentLength:
                        content.length || 0,
                    steps,
                    tool:
                        "tests.codexPipeline"
                };
            }

            const preview =
                await JarvisToolRuntime.execute(
                    "repo.patchPreview",
                    {
                        file,
                        path,
                        search,
                        replace,
                        dryRun: true
                    },
                    {
                        ...context,
                        approved: false
                    }
                );

            const previewStep =
                pushStep(
                    "repo.patchPreview",
                    preview
                );

            const plan =
                await JarvisToolRuntime.execute(
                    "repo.safePatchPlan",
                    {
                        file,
                        path,
                        search,
                        replace,
                        intent:
                            args.intent ||
                            "validar pipeline codex v7",
                        maxBytes:
                            args.maxBytes || 300000
                    },
                    {
                        ...context,
                        approved: false
                    }
                );

            const planStep =
                pushStep(
                    "repo.safePatchPlan",
                    plan
                );

            const blockedApply =
                await JarvisToolRuntime.execute(
                    "repo.safePatchApply",
                    {
                        file,
                        path,
                        search,
                        replace
                    },
                    {
                        ...context,
                        approved: false
                    }
                );

            const blockedStep =
                pushStep(
                    "repo.safePatchApply.blocked",
                    blockedApply
                );

            const blockedCorrectly =
                blockedApply?.status === "PENDING_APPROVAL" ||
                blockedApply?.data?.status === "PENDING_APPROVAL" ||
                blockedApply?.error === "APPROVAL_REQUIRED: repo.safePatchApply" ||
                blockedApply?.data?.error === "APPROVAL_REQUIRED: repo.safePatchApply";

            let applyResult =
                null;

            let verifyResult =
                null;

            if (mode === "apply") {
                if (approved !== true) {
                    return {
                        ok: false,
                        success: false,
                        status: "PENDING_APPROVAL",
                        error: "APPROVAL_REQUIRED_FOR_CODEX_PIPELINE_APPLY",
                        file,
                        path,
                        mode,
                        steps,
                        approvalCommand:
                            `Jarvis, apruebo tests.codexPipeline apply ${file}`,
                        tool:
                            "tests.codexPipeline"
                    };
                }

                applyResult =
                    await JarvisToolRuntime.execute(
                        "repo.safePatchApply",
                        {
                            file,
                            path,
                            search,
                            replace,
                            approved: true,
                            codexApproved: true
                        },
                        {
                            ...context,
                            approved: true
                        }
                    );

                pushStep(
                    "repo.safePatchApply.approved",
                    applyResult
                );

                verifyResult =
                    await JarvisToolRuntime.execute(
                        "repo.postWriteVerify",
                        {
                            file,
                            path,
                            search,
                            replace
                        },
                        context
                    );

                pushStep(
                    "repo.postWriteVerify",
                    verifyResult
                );
            }

            const requiredOk =
                readStep.ok === true &&
                previewStep.ok === true &&
                planStep.ok === true &&
                blockedCorrectly === true;

            const applyOk =
                mode === "dry"
                    ? true
                    : (
                        applyResult?.data?.status === "SAFE_PATCH_APPLY_OK" ||
                        applyResult?.status === "SAFE_PATCH_APPLY_OK" ||
                        verifyResult?.data?.status === "POST_WRITE_VERIFY_OK" ||
                        verifyResult?.status === "POST_WRITE_VERIFY_OK"
                    );

            const ok =
                requiredOk === true &&
                applyOk === true;

            return {
                ok,
                success:
                    ok,
                status:
                    ok
                        ? "CODEX_PIPELINE_OK"
                        : "CODEX_PIPELINE_FAILED",
                mode,
                file,
                path,
                search,
                replace,
                searchFound,
                blockedCorrectly,
                applied:
                    mode === "apply" &&
                    applyOk === true,
                steps,
                summary: {
                    read:
                        readStep.ok,
                    preview:
                        previewStep.ok,
                    plan:
                        planStep.ok,
                    blockedWithoutApproval:
                        blockedCorrectly,
                    apply:
                        mode === "dry"
                            ? "SKIPPED_DRY_RUN"
                            : applyOk
                },
                next:
                    mode === "dry"
                        ? "Si todo está OK, ejecutar con mode:'apply' y approved:true únicamente sobre sandbox LOW."
                        : "Revisar verify y confirmar diff antes de pasar a governance.",
                tool:
                    "tests.codexPipeline",
                source:
                    "tests_codex_pipeline_v7"
            };
        }
});
// V7 PRODUCTION GRADE CONTRACT: repo.patchPreview
JarvisToolRuntime.register({
    name: "repo.patchPreview",
    description: "Genera un diff en memoria (dry-run) estricto. Puede hidratar contenido local del archivo antes de validar search/replace.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_PATCH_PREVIEW",
    inputSchema: {
        type: "object",
        required: ["file"],
        properties: {
            file: {
                type: "string",
                description: "Ruta del archivo objetivo (ej. gestia-terminal.html)"
            },
            search: {
                type: "string",
                description: "Bloque de código exacto a buscar en el archivo"
            },
            replace: {
                type: "string",
                description: "Nuevo bloque de código que sustituirá a la búsqueda"
            },
            intent: {
                type: "string",
                description: "Descripción humana del cambio deseado cuando todavía no hay search/replace exactos"
            },
            dryRun: {
                type: "boolean",
                description: "Forzado a true internamente",
                default: true
            }
        }
    },
    execute: async (args = {}, context = {}) => {
        // 1. Hard Validation del contrato base
        if (
            !args ||
            typeof args !== "object"
        ) {
            return {
                ok: false,
                status:
                    "CONTRACT_INVALID",
                error:
                    "El payload de argumentos debe ser un objeto válido.",
                tool:
                    "repo.patchPreview"
            };
        }

        const file =
            args.file ||
            args.path ||
            args.target ||
            "";

        if (
            !file ||
            typeof file !== "string"
        ) {
            return {
                ok: false,
                status:
                    "CONTRACT_INVALID",
                error:
                    "Falta parámetro obligatorio: file.",
                receivedArgs:
                    Object.keys(args),
                tool:
                    "repo.patchPreview"
            };
        }

        const normalizedFile =
            String(file)
                .replace(/^\.\/+/, "")
                .replace(/^\/+/, "")
                .trim();

        let hydratedContent =
            null;

        // 2. Hidratar contenido real por bridge local read-only
        if (
            window.JarvisLocalBridge?.readFile
        ) {
            const bridgeRead =
                await window.JarvisLocalBridge.readFile({
                    file:
                        normalizedFile,
                    path:
                        normalizedFile,
                    maxBytes:
                        args.maxBytes ||
                        300000,
                    source:
                        "jarvis_patch_preview_read_v7"
                });

            if (
                bridgeRead?.ok === true &&
                typeof bridgeRead.content === "string"
            ) {
                hydratedContent =
                    bridgeRead.content;
            }
            else {
                console.warn(
                    "⚠️ [PATCH_PREVIEW_READ_FAIL]",
                    bridgeRead
                );
            }
        }

        // 3. Si todavía no hay search/replace exactos, no inventar patch
        const hasSearchReplace =
            typeof args.search === "string" &&
            args.search.length > 0 &&
            typeof args.replace === "string";

if (
    !hasSearchReplace
) {
    const previewLines =
        typeof hydratedContent === "string"
            ? hydratedContent
                .split(/\r?\n/)
                .slice(0, 80)
                .join("\n")
            : "";

    const safeSummary =
        [
            "Patch Preview SIA7",
            `Archivo: ${normalizedFile}`,
            "Estado: BLOQUEADO_CON_SEGURIDAD",
            "",
            "Razón:",
            "No se generó diff porque faltan bloques exactos search y replace.",
            "",
            "Regla:",
            "Jarvis no debe inventar parches ni escribir cambios sin un bloque exacto encontrado en el archivo real.",
            "",
            "Contenido hidratado:",
            typeof hydratedContent === "string"
                ? `Sí, ${hydratedContent.length} caracteres`
                : "No",
            "",
            "Siguiente paso correcto:",
            "1. Ejecutar repo.diagnose para entender el archivo.",
            "2. Ubicar el bloque exacto a modificar.",
            "3. Generar search y replace exactos.",
            "4. Ejecutar repo.patchPreview otra vez en dry-run.",
            "5. Pedir aprobación antes de escribir.",
            "",
            "Vista previa del archivo:",
            "```",
            previewLines || "Sin preview disponible.",
            "```"
        ]
            .join("\n");

    recordToolRuntimeLearningIncident({
        category:
            "PATCH_PREVIEW_SAFETY",
        status:
            "blocked",
        stage:
            "tool_runtime_patch_preview",
        operation:
            "repo.patchPreview",
        file:
            normalizedFile,
        reason:
            "SEARCH_REPLACE_REQUIRED",
        symptom:
            context?.rawInput ||
            args.intent ||
            "",
        wrongBehavior:
            "PatchPreview was requested without exact search/replace.",
        fixRule:
            "Hydrate/read the file and extract exact blocks before showing preview.",
        sourceTraceId:
            context?.traceId ||
            context?.analysisId ||
            ""
    });

    return {
        ok:
            true,
        success:
            true,
        status:
            "PATCH_PREVIEW_NEEDS_EXACT_BLOCK",
        blocked:
            true,
        safe:
            true,
        dryRun:
            true,
        error:
            null,
        reason:
            "SEARCH_REPLACE_REQUIRED",
        message:
            "Para generar un diff seguro necesito search y replace exactos. Ya hidraté el archivo para análisis, pero no voy a inventar un parche.",
        file:
            normalizedFile,
        contentAvailable:
            typeof hydratedContent === "string",
        contentLength:
            hydratedContent?.length || 0,
        preview:
            typeof hydratedContent === "string"
                ? hydratedContent.slice(0, 3000)
                : null,
        summary:
            safeSummary,
        next:
            "Usa repo.diagnose, repo.grep o repo.read para localizar el bloque exacto; después llama repo.patchPreview con file, search y replace.",
        tool:
            "repo.patchPreview"
    };
}

        const rewriteValidation =
            validatePatchPreviewRewrite(
                args.search,
                args.replace
            );

        if (
            rewriteValidation.ok !== true
        ) {
            recordToolRuntimeLearningIncident({
                category:
                    "PATCH_PREVIEW_VALIDATION",
                status:
                    "blocked",
                stage:
                    "tool_runtime_patch_preview",
                operation:
                    "repo.patchPreview",
                file:
                    normalizedFile,
                reason:
                    rewriteValidation.issues.join("_") ||
                    "UNSAFE_REPLACE",
                symptom:
                    context?.rawInput ||
                    args.intent ||
                    "",
                wrongBehavior:
                    "PatchPreview replace failed runtime validation.",
                fixRule:
                    "Regenerate replace before preview when Tailwind classes, brackets, backticks or placeholders are invalid.",
                sourceTraceId:
                    context?.traceId ||
                    context?.analysisId ||
                    ""
            });

            return {
                ok:
                    false,
                success:
                    false,
                status:
                    "PATCH_PREVIEW_BLOCKED_INVALID_REWRITE",
                blocked:
                    true,
                safe:
                    true,
                dryRun:
                    true,
                error:
                    "Detecte replace inseguro/invalido; necesito regenerar el replace antes del preview.",
                reason:
                    "UNSAFE_REPLACE",
                issues:
                    rewriteValidation.issues,
                file:
                    normalizedFile,
                tool:
                    "repo.patchPreview"
            };
        }

        // 4. Validar que el bloque search exista en el contenido hidratado
        if (
            typeof hydratedContent === "string" &&
            !hydratedContent.includes(args.search)
        ) {
            recordToolRuntimeLearningIncident({
                category:
                    "PATCH_PREVIEW_SAFETY",
                status:
                    "blocked",
                stage:
                    "tool_runtime_patch_preview",
                operation:
                    "repo.patchPreview",
                file:
                    normalizedFile,
                reason:
                    "SEARCH_BLOCK_NOT_FOUND",
                symptom:
                    context?.rawInput ||
                    args.intent ||
                    "",
                wrongBehavior:
                    "PatchPreview search block did not match hydrated repo content.",
                fixRule:
                    "Read/copy the exact current block before preview; never alter search manually.",
                sourceTraceId:
                    context?.traceId ||
                    context?.analysisId ||
                    ""
            });

            return {
                ok: false,
                status:
                    "SEARCH_BLOCK_NOT_FOUND",
                error:
                    "El bloque search no existe exactamente en el archivo hidratado. No se genera diff.",
                file:
                    normalizedFile,
                searchLength:
                    args.search.length,
                contentLength:
                    hydratedContent.length,
                suggestion:
                    "Usa repo.grep o repo.read para copiar el bloque exacto antes de previsualizar el patch.",
                tool:
                    "repo.patchPreview"
            };
        }

        // 5. Forzar modo seguro e inyectar el diff completo
        const safeArgs = {
            ...args,
            file:
                normalizedFile,
            path:
                normalizedFile,
            dryRun:
                true,
            content:
                hydratedContent ||
                args.content ||
                null
        };

        // 6. Ejecución contra el Hub
        const {
            generatePatch
        } =
            await import('/gestia-core/hubs/repo.hub.js');

            const result =
    await generatePatch(safeArgs);

// 7. Interceptar respuestas lógicas del hub que sean fallos en la práctica
if (
    result?.status === "SEARCH_REQUIRED" ||
    (
        result?.error &&
        result?.status !== "PATCH_PREVIEW_READY"
    )
) {
    return {
        ok: false,
        success: false,
        status:
            "PATCH_FAILED",
        error:
            result.error ||
            "El motor de patches rebotó la solicitud (SEARCH_REQUIRED o similar).",
        details:
            result,
        tool:
            "repo.patchPreview"
    };
}

    const normalizedStatus =
    result?.status ||
    "PATCH_PREVIEW_READY";

const isPreviewReady =
    normalizedStatus === "PATCH_PREVIEW_READY";

return {
    ...result,
    ok:
        isPreviewReady
            ? true
            : result?.ok !== false,
    success:
        isPreviewReady
            ? true
            : result?.success === true,
    status:
        normalizedStatus,
    reason:
        isPreviewReady
            ? null
            : result?.reason || null,
    error:
        isPreviewReady
            ? null
            : result?.error || null,
    file:
        normalizedFile,
    dryRun:
        true,
    tool:
        "repo.patchPreview"
};

    }
});

window.JarvisToolRuntime = JarvisToolRuntime;

console.info(
    "🧠 [JARVIS_TOOL_RUNTIME] ONLINE v7.0"
);

/* ============================================================
   JARVIS CODEX V2 — APPROVED PATCH CONTRACT + SAFE CODE_WRITE
   Commit 23 Mega-Pack
   Safe additive runtime block.
   ============================================================ */


/* ==========================================
   CODEX V2 DIRECT PATCH ADAPTER - Commit 41.15
========================================== */
if (window.JarvisToolRuntime?.register && !window.__JARVIS_CODEX_PATCH_TOOL_41_15__) {
    window.__JARVIS_CODEX_PATCH_TOOL_41_15__ = true;

    async function runCodexPatchPreview(args = {}, context = {}) {
        const dryRun =
            args?.dryRun === true ||
            String(args?.dryRun || "").toLowerCase() === "true";

        const payload = {
            file:
                args.file || args.path || "",
            path:
                args.path || args.file || "",
            search:
                typeof args.search === "string"
                    ? args.search
                    : "",
            replace:
                typeof args.replace === "string"
                    ? args.replace
                    : "",
            dryRun,
            risk:
                args.risk || "medium"
        };

        if (!payload.file || !payload.search || typeof payload.replace !== "string") {
            return {
                ok: false,
                success: false,
                status: "CONTRACT_INVALID",
                error: "FILE_SEARCH_REPLACE_REQUIRED",
                required: ["file", "search", "replace"],
                tool:
                    args.toolName || "codex.patch",
                source:
                    "codex_direct_patch_adapter_41_15"
            };
        }

        if (dryRun !== true) {
            return {
                ok: false,
                success: false,
                status: "DRY_RUN_REQUIRED",
                error: "CODEX_PATCH_REQUIRES_DRY_RUN_TRUE",
                next:
                    "Run again with dryRun=true to create a pending Codex patch.",
                tool:
                    args.toolName || "codex.patch",
                source:
                    "codex_direct_patch_adapter_41_15"
            };
        }

        if (!window.JarvisCodexV2?.patchPreviewExact) {
            return {
                ok: false,
                success: false,
                status: "CODEX_V2_RUNTIME_NOT_READY",
                error: "JarvisCodexV2.patchPreviewExact is not available",
                tool:
                    args.toolName || "codex.patch",
                source:
                    "codex_direct_patch_adapter_41_15"
            };
        }

        const preview =
            await window.JarvisCodexV2.patchPreviewExact(payload);

        return {
            ...preview,
            ok:
                preview?.ok === true,
            success:
                preview?.ok === true,
            status:
                preview?.ok
                    ? "CODEX_PATCH_PREVIEW_OK"
                    : "CODEX_PATCH_PREVIEW_BLOCKED",
            file:
                payload.file,
            nextCommand:
                preview?.ok
                    ? `Jarvis, apruebo patch ${payload.file}`
                    : null,
            tool:
                args.toolName || "codex.patch",
            source:
                "codex_direct_patch_adapter_41_15"
        };
    }

    JarvisToolRuntime.register({
        name: "codex.patch",
        description: "Crea un pending patch Codex V2 desde file/search/replace exacto. Siempre requiere dryRun=true.",
        mutates: false,
        requiresApproval: false,
        output: "CODEX_PATCH_PREVIEW",
        execute: async (args = {}, context = {}) => {
            return await runCodexPatchPreview({
                ...args,
                toolName: "codex.patch"
            }, context);
        }
    });

    JarvisToolRuntime.register({
        name: "repo.patchPreviewExact",
        description: "Alias runtime para Codex V2 patchPreviewExact con search/replace exacto.",
        mutates: false,
        requiresApproval: false,
        output: "CODEX_PATCH_PREVIEW",
        execute: async (args = {}, context = {}) => {
            return await runCodexPatchPreview({
                ...args,
                toolName: "repo.patchPreviewExact"
            }, context);
        }
    });
}


(function initJarvisCodexV2Runtime() {
  if (window.__JARVIS_CODEX_V2_RUNTIME__) return;
  window.__JARVIS_CODEX_V2_RUNTIME__ = true;

  const CodexV2 = {
    pendingPatch: null,
    approvedPatch: null,
    lastWriteResult: null,
    lastVerifyResult: null
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeText(value) {
    return String(value || "").replace(/\r\n/g, "\n");
  }

  function hasExactBlock(source, search) {
    if (!source || !search) return false;
    return normalizeText(source).includes(normalizeText(search));
  }

  function isDangerousPatch(patch) {
    const search = normalizeText(patch?.search);
    const replace = normalizeText(patch?.replace);
    const joined = `${search}\n${replace}`;

    const blockedReasons = [];

    if (!patch?.file) blockedReasons.push("PATCH_WITHOUT_FILE");
    if (!search.trim()) blockedReasons.push("PATCH_WITHOUT_EXACT_SEARCH");
    if (!replace.trim()) blockedReasons.push("PATCH_WITHOUT_EXACT_REPLACE");

    if (/function\s+e\s*\(/.test(joined)) {
      blockedReasons.push("BLOCKED_MINIFIED_FUNCTION_E");
    }

    if (/UI_OPTIMIZATION/i.test(joined)) {
      blockedReasons.push("BLOCKED_GENERIC_UI_OPTIMIZATION");
    }

    if (/(^|\n)\s*\.card\s*\{/.test(joined) || /(^|\n)\s*\.tarjeta\s*\{/.test(joined)) {
      blockedReasons.push("BLOCKED_UNIVERSAL_CARD_CSS");
    }

    if (/querySelectorAll\(["'`](\.card|\.tarjeta)["'`]\)/.test(joined)) {
      blockedReasons.push("BLOCKED_UNIVERSAL_CARD_SELECTOR");
    }

    return {
      blocked: blockedReasons.length > 0,
      reasons: blockedReasons
    };
  }

  function buildDiffPreview(search, replace) {
    const oldLines = normalizeText(search).split("\n");
    const newLines = normalizeText(replace).split("\n");

    return [
      "```diff",
      ...oldLines.map(line => `- ${line}`),
      ...newLines.map(line => `+ ${line}`),
      "```"
    ].join("\n");
  }

    async function readRepoFile(file) {
    if (!file) throw new Error("Missing file");

    const cleanFile =
      String(file || "")
        .trim()
        .replace(/^\.\/+/, "")
        .replace(/^\/+/, "");

    async function readFromGithubRaw() {
      const safePath =
        cleanFile
          .split("/")
          .map(part =>
            encodeURIComponent(part)
          )
          .join("/");

      const rawUrl =
        `https://raw.githubusercontent.com/heberzzt-wq/fixgo-app/v5.9-polish/${safePath}`;

      console.warn(
        "🧯 [CODEX_V2_RUNTIME_READ_FALLBACK_GITHUB_RAW]",
        {
          file:
            cleanFile,
          url:
            rawUrl
        }
      );

      const response =
        await fetch(
          rawUrl,
          {
            method:
              "GET",
            cache:
              "no-store"
          }
        );

      if (!response.ok) {
        throw new Error(
          `GITHUB_RAW_READ_FAILED_${response.status}`
        );
      }

      const text =
        await response.text();

      return typeof text === "string"
        ? text
        : "";
    }

    try {
      if (window.GestiaToolsRuntime?.repo?.read) {
        const res =
          await window.GestiaToolsRuntime.repo.read({
            file:
              cleanFile
          });

        const content =
          res?.content ||
          res?.data?.content ||
          res?.text ||
          "";

        if (content) return content;
      }
    }
    catch(error) {
      console.warn(
        "⚠️ [CODEX_V2_READ_GESTIA_RUNTIME_FAIL]",
        error?.message || error
      );
    }

    try {
      if (window.toolsRuntime?.repo?.read) {
        const res =
          await window.toolsRuntime.repo.read({
            file:
              cleanFile
          });

        const content =
          res?.content ||
          res?.data?.content ||
          res?.text ||
          "";

        if (content) return content;
      }
    }
    catch(error) {
      console.warn(
        "⚠️ [CODEX_V2_READ_TOOLS_RUNTIME_FAIL]",
        error?.message || error
      );
    }

    try {
      if (window.repo?.read) {
        const res =
          await window.repo.read({
            file:
              cleanFile
          });

        const content =
          res?.content ||
          res?.data?.content ||
          res?.text ||
          "";

        if (content) return content;
      }
    }
    catch(error) {
      console.warn(
        "⚠️ [CODEX_V2_READ_WINDOW_REPO_FAIL]",
        error?.message || error
      );
    }

    try {
      if (window.ToolsBridge?.executeAndCompose) {
        const bridgeResult =
          await window.ToolsBridge.executeAndCompose(
            "repo.read",
            {
              file:
                cleanFile,
              maxBytes:
                300000
            },
            {
              tenantId:
                window.session?.tenantId ||
                window.KernelHeberto?.session?.tenantId ||
                "UXMAL39",
              analysisId:
                crypto.randomUUID(),
              rawInput:
                `codex_v2_runtime_read ${cleanFile}`,
              source:
                "codex_v2_runtime_read_fallback"
            }
          );

        const candidates =
          [
            bridgeResult,
            bridgeResult?.data,
            bridgeResult?.data?.data,
            bridgeResult?.response,
            bridgeResult?.response?.data,
            bridgeResult?.response?.data?.data,
            bridgeResult?.result,
            bridgeResult?.result?.data,
            bridgeResult?.result?.data?.data,
            bridgeResult?.result?.response,
            bridgeResult?.result?.response?.data,
            bridgeResult?.result?.response?.data?.data,
            bridgeResult?.result?.observations?.[0],
            bridgeResult?.result?.observations?.[0]?.data,
            bridgeResult?.result?.observations?.[0]?.data?.data,
            bridgeResult?.result?.observations?.[0]?.response,
            bridgeResult?.result?.observations?.[0]?.response?.data,
            bridgeResult?.result?.observations?.[0]?.response?.data?.data
          ]
            .filter(Boolean);

        for (const item of candidates) {
          const content =
            item?.content ||
            item?.text ||
            item?.raw ||
            item?.sourceCode ||
            item?.source ||
            item?.data?.content ||
            item?.data?.text ||
            item?.data?.raw ||
            item?.data?.source;

          if (
            typeof content === "string" &&
            content.trim() &&
            content !== "jarvis_fs_bridge_read_v1"
          ) {
            return content;
          }
        }
      }
    }
    catch(error) {
      console.warn(
        "⚠️ [CODEX_V2_READ_TOOLS_BRIDGE_FAIL]",
        error?.message || error
      );
    }

    return await readFromGithubRaw();
  }

  async function writeRepoFile(authorization = {}) {
    if (!authorization.fingerprint || !authorization.nonce) throw new Error("Missing one-time write authorization");

    
    if (window.JarvisToolRuntime?.execute) {
      return await window.JarvisToolRuntime.execute(
        "repo.write",
        {
          fingerprint: authorization.fingerprint,
          nonce: authorization.nonce,
          objectiveId: authorization.objectiveId,
          caseId: authorization.caseId
        },
        {
          source: "codex_v2_write_repo_file_runtime_41_16",
          approved: true,
          file: authorization.file
        }
      );
    }

    throw new Error("repo.write runtime not available");
  }

  async function runSyntaxCheck(file) {
    try {
      if (window.GestiaToolsRuntime?.tests?.run) {
        return await window.GestiaToolsRuntime.tests.run({
          mode: "check:syntax",
          file
        });
      }

      if (window.toolsRuntime?.tests?.run) {
        return await window.toolsRuntime.tests.run({
          mode: "check:syntax",
          file
        });
      }

      return {
        ok: true,
        skipped: true,
        reason: "tests.run not available"
      };
    } catch (error) {
      return {
        ok: false,
        error: String(error?.message || error)
      };
    }
  }

  async function runImpact(file) {
    try {
      if (window.GestiaToolsRuntime?.repo?.impact) {
        return await window.GestiaToolsRuntime.repo.impact({ file });
      }

      if (window.toolsRuntime?.repo?.impact) {
        return await window.toolsRuntime.repo.impact({ file });
      }

      return {
        ok: true,
        skipped: true,
        reason: "repo.impact not available"
      };
    } catch (error) {
      return {
        ok: false,
        error: String(error?.message || error)
      };
    }
  }

  async function patchPreviewExact(payload = {}) {
    const file = payload.file;
    const search = normalizeText(payload.search);
    const replace = normalizeText(payload.replace);
    const dryRun = payload.dryRun === true;

    const danger = isDangerousPatch({ file, search, replace });

    if (danger.blocked) {
      CodexV2.pendingPatch = null;

      return {
        ok: false,
        blocked: true,
        code: "PATCH_PREVIEW_BLOCKED_BY_GOVERNANCE",
        reasons: danger.reasons,
        file,
        createdAt: nowIso()
      };
    }

    if (!dryRun) {
      CodexV2.pendingPatch = null;

      return {
        ok: false,
        blocked: true,
        code: "PATCH_PREVIEW_REQUIRES_DRY_RUN_TRUE",
        file,
        createdAt: nowIso()
      };
    }

    const source = await readRepoFile(file);

    if (!hasExactBlock(source, search)) {
      CodexV2.pendingPatch = null;

      return {
        ok: false,
        blocked: true,
        code: "EXACT_SEARCH_BLOCK_NOT_FOUND",
        file,
        createdAt: nowIso()
      };
    }

    const objectiveId = String(payload.objectiveId || `objective_${crypto.randomUUID()}`);
    const caseId = String(payload.caseId || `case_${crypto.randomUUID()}`);
    const matchCount = normalizeText(source).split(search).length - 1;
    const preparation = await window.JarvisToolRuntime.execute(
      "repo.prepareWrite",
      {
        objectiveId,
        caseId,
        authorityId: "HEBERTO_MENDOZA",
        controllerId: "CODEX_SIA7",
        file,
        search,
        replace,
        matchCount
      },
      { objectiveId, caseId, source: "codex_v2_patch_preparation" }
    );
    const prepared = preparation?.data || preparation;
    if (prepared?.ok !== true) {
      CodexV2.pendingPatch = null;
      return { ok: false, blocked: true, code: "PATCH_PREPARATION_FAILED", file, preparation: prepared };
    }

    const preview = {
      ok: true,
      dryRun: true,
      file,
      search,
      replace,
      diffPreview: buildDiffPreview(search, replace),
      risk: payload.risk || "medium",
      requiresApproval: true,
      objectiveId,
      caseId,
      fingerprint: prepared.fingerprint,
      nonce: prepared.nonce,
      matchCount: prepared.matchCount,
      snapshotSha256: prepared.snapshotSha256,
      expectedSha256: prepared.expectedSha256,
      expiresAt: prepared.expiresAt,
      approvalCommand: prepared.approvalCommand,
      createdAt: nowIso()
    };

    CodexV2.pendingPatch = preview;
    CodexV2.approvedPatch = null;

    return preview;
  }

  async function approvePendingPatch(payload = {}) {
    const file = payload.file || CodexV2.pendingPatch?.file;

    if (!CodexV2.pendingPatch) {
      return {
        ok: false,
        blocked: true,
        code: "NO_PENDING_PATCH_TO_APPROVE"
      };
    }

    if (file !== CodexV2.pendingPatch.file) {
      return {
        ok: false,
        blocked: true,
        code: "APPROVAL_FILE_MISMATCH",
        expected: CodexV2.pendingPatch.file,
        received: file
      };
    }

    if (payload.approvalCommand !== CodexV2.pendingPatch.approvalCommand) {
      return {
        ok: false,
        blocked: true,
        code: "APPROVAL_COMMAND_MISMATCH",
        expected: CodexV2.pendingPatch.approvalCommand
      };
    }

    const authorization = await window.JarvisToolRuntime.execute(
      "repo.authorizeWrite",
      {
        fingerprint: CodexV2.pendingPatch.fingerprint,
        nonce: CodexV2.pendingPatch.nonce,
        approvalCommand: payload.approvalCommand,
        approvedBy: "HEBERTO_MENDOZA"
      },
      { approved: true, source: "codex_v2_one_time_authorization" }
    );
    const authorized = authorization?.data || authorization;
    if (authorized?.ok !== true) {
      return { ok: false, blocked: true, code: "PATCH_AUTHORIZATION_FAILED", authorization: authorized };
    }

    CodexV2.approvedPatch = {
      ...CodexV2.pendingPatch,
      approved: true,
      approvedAt: nowIso(),
      authorizedAt: authorized.authorizedAt || nowIso()
    };

    return {
      ok: true,
      code: "PATCH_APPROVED",
      file,
      approvedAt: CodexV2.approvedPatch.approvedAt
    };
  }

  async function safeCodeWrite(payload = {}) {
    const approved = CodexV2.approvedPatch;

    if (!approved) {
      return {
        ok: false,
        blocked: true,
        code: "CODE_WRITE_BLOCKED_NO_APPROVED_PATCH"
      };
    }

    if (payload.file && payload.file !== approved.file) {
      return {
        ok: false,
        blocked: true,
        code: "CODE_WRITE_FILE_MISMATCH",
        expected: approved.file,
        received: payload.file
      };
    }

    const danger = isDangerousPatch(approved);

    if (danger.blocked) {
      return {
        ok: false,
        blocked: true,
        code: "CODE_WRITE_BLOCKED_BY_GOVERNANCE",
        reasons: danger.reasons
      };
    }

    const before = await readRepoFile(approved.file);

    if (!hasExactBlock(before, approved.search)) {
      return {
        ok: false,
        blocked: true,
        code: "CODE_WRITE_BLOCKED_EXACT_SEARCH_NOT_FOUND_AT_WRITE_TIME",
        file: approved.file
      };
    }

    const after = normalizeText(before).replace(
      normalizeText(approved.search),
      normalizeText(approved.replace)
    );

    if (after === normalizeText(before)) {
      return {
        ok: false,
        blocked: true,
        code: "CODE_WRITE_BLOCKED_NO_REAL_DIFF",
        file: approved.file
      };
    }

    const writeResult = await writeRepoFile(approved);

    if (writeResult?.ok !== true) {
      return {
        ok: false,
        blocked: true,
        code: "CODE_WRITE_ONE_TIME_AUTHORIZATION_FAILED",
        file: approved.file,
        writeResult
      };
    }

    CodexV2.lastWriteResult = {
      ok: true,
      file: approved.file,
      writeResult,
      writtenAt: nowIso()
    };

    return CodexV2.lastWriteResult;
  }

  async function postWriteVerify(payload = {}) {
    const approved = CodexV2.approvedPatch;
    const file = payload.file || approved?.file;

    if (!approved || !file) {
      return {
        ok: false,
        blocked: true,
        code: "VERIFY_BLOCKED_NO_APPROVED_PATCH"
      };
    }

    const syntax = await runSyntaxCheck(file);
    const readBack = await readRepoFile(file);
    const impact = await runImpact(file);

    const replaceFound = hasExactBlock(readBack, approved.replace);
    const oldSearchGone = !hasExactBlock(readBack, approved.search);

    const result = {
      ok: Boolean(syntax?.ok !== false && replaceFound),
      file,
      syntax,
      impact,
      replaceFound,
      oldSearchGone,
      verifiedAt: nowIso(),
      code: replaceFound
        ? "POST_WRITE_VERIFY_OK"
        : "POST_WRITE_VERIFY_FAILED_REPLACE_NOT_FOUND"
    };

    CodexV2.lastVerifyResult = result;

    if (result.ok) {
      CodexV2.pendingPatch = null;
      CodexV2.approvedPatch = null;
    }

    return result;
  }

  window.JarvisCodexV2 = {
    state: CodexV2,
    patchPreviewExact,
    approvePendingPatch,
    safeCodeWrite,
    postWriteVerify,
    isDangerousPatch
  };
})();
