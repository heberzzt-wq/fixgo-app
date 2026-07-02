/**
 * JARVIS TOOL RUNTIME - v7.0 (PRODUCTION GRADE)
 * Arquitectura: Singleton Registry + Middleware Chain + Error Boundary
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
                        "jarvis_repo_read_v7"
                });

            if (
                bridgeRead?.ok === true &&
                typeof bridgeRead.content === "string"
            ) {
                return {
                    ok: true,
                    file:
                        normalizedFile,
                    path:
                        bridgeRead.path ||
                        normalizedFile,
                    content:
                        bridgeRead.content,
                    size:
                        bridgeRead.size ||
                        bridgeRead.content.length,
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
            return {
                ok: true,
                file:
                    normalizedFile,
                ...found
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
            return {
                ok: true,
                file:
                    normalizedFile,
                ...contextResult
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
                content:
                    matched.content ||
                    matched.text ||
                    matched.source ||
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

    const response =
        await fetch(
            "http://localhost:3344/write",
            {
                method:
                    "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body:
                    JSON.stringify({
                        file,
                        path:
                            payload.path || file,
                        content,
                        dryRun,
                        source:
                            payload.source ||
                            "jarvis_repo_write_v7"
                    })
            }
        );

    const rawText =
        await response.text();

    let result =
        null;

    try {
        result =
            JSON.parse(rawText);
    }
    catch(error) {
        result = {
            ok:
                false,
            status:
                "INVALID_WRITE_RESPONSE",
            error:
                "WRITE_ENDPOINT_DID_NOT_RETURN_JSON",
            raw:
                rawText.slice(0, 500),
            parseError:
                error?.message || String(error)
        };
    }

    return {
        ...result,
        httpStatus:
            response.status,
        source:
            result?.source ||
            "jarvis_local_bridge_write_client_v7"
    };
};

JarvisToolRuntime.register({
    name:
        "repo.write",
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
            if (
                context?.approved !== true &&
                args?.approved !== true &&
                args?.codexApproved !== true
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

            const result =
                await window.JarvisLocalBridge.writeFile({
                    file:
                        args.file || args.path || "",
                    path:
                        args.path || args.file || "",
                    content:
                        args.content || "",
                    dryRun:
                        args.dryRun === true,
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
    name: "repo.search",
    description: "Busca patrones, expresiones o contexto dentro del código base.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_SEARCH_RESULT",
    execute: async (args, context) => {
        const { loadRepoContext } = await import('/gestia-core/hubs/repo.hub.js');
        return await loadRepoContext(args);
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
    name: "repo.impact",
    description: "Analiza el impacto y las dependencias (qué se rompe si se modifica un archivo).",
    mutates: false,
    requiresApproval: false,
    output: "REPO_IMPACT_RESULT",
    execute: async (args, context) => {
        const { analyzeRepoImpact } = await import('/gestia-core/hubs/repo.hub.js');
        return await analyzeRepoImpact(args);
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
                        normalizedFile,
                    path:
                        normalizedFile,
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

                const found =
                    await findRepoFile({
                        file:
                            normalizedFile,
                        path:
                            normalizedFile,
                        target:
                            normalizedFile
                    })
                        .catch(() => null);

                const loaded =
                    found?.content ||
                    found?.source ||
                    found?.text
                        ? found
                        : await loadRepoContext({
                            file:
                                normalizedFile,
                            path:
                                normalizedFile,
                            target:
                                normalizedFile
                        })
                            .catch(() => null);

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
                    normalizedFile,
                source:
                    readSource,
                tool:
                    "repo.diagnose"
            };
        }

        const lines =
            content.split(/\r?\n/);

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
            /`[\s\S]*<\s*(div|section|button|form|main|article|header|footer|nav|table|ul|li|span|input|select|textarea)\b/i
                .test(content) ||
            /innerHTML\s*=|insertAdjacentHTML|createElement\s*\(/i
                .test(content);

        const hasTailwindOrClasses =
            /class(Name)?\s*=|class\s*=|bg-|text-|grid|flex|rounded|shadow|p-\d|m-\d|gap-\d/i
                .test(content);

        const hasFirestore =
            /\b(collection|doc|getDoc|getDocs|setDoc|updateDoc|addDoc|deleteDoc|runTransaction|query|where|onSnapshot)\s*\(/i
                .test(content);

        const hasRuntimeBridge =
            /ToolsBridge|JarvisToolRuntime|ResponseComposer|window\./i
                .test(content);

        const hasRepoWrite =
            /CODE_WRITE|SIA7_COMMIT|repoCommitWriteFile|writeRepoFile|repo_files|PATCH_SYSTEM_CORE/i
                .test(content);

        const hasGps =
            /watchPosition|geolocation|coords|latitude|longitude|geofence|gps/i
                .test(content);

        const hasPatchPreview =
            /patchPreview|search\s*:|replace\s*:|dryRun|generatePatch|applyPatch/i
                .test(content);

        const hasGenericUiPatch =
            /\.tarjeta|\.card|\[class\*=['"]card['"]|UI_OPTIMIZATION|!important/i
                .test(content);

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

                html:
                    normalizedFile.endsWith(".html"),

                css:
                    normalizedFile.endsWith(".css"),

                json:
                    normalizedFile.endsWith(".json")
            };

        let fileType =
            "generic";

        if (typeSignals.router) {
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
                "gps";
        }
        else if (typeSignals.uiPanel) {
            fileType =
                "ui_panel";
        }
        else if (typeSignals.bridge) {
            fileType =
                "runtime_bridge";
        }
        else if (typeSignals.html) {
            fileType =
                "html";
        }
        else if (typeSignals.css) {
            fileType =
                "css";
        }
        else if (typeSignals.json) {
            fileType =
                "json";
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
                `Archivo: ${normalizedFile}`,
                `Tipo detectado: ${fileType}`,
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
                normalizedFile,
            mode:
                args.mode ||
                "diagnose",
            fileType,
            risk,
            riskScore,
            source:
                readSource,
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

    const response =
        await fetch(
            "http://localhost:3344/run",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body:
                    JSON.stringify({
                        command,
                        cwd:
                            payload.cwd ||
                            ".",
                        timeoutMs:
                            payload.timeoutMs ||
                            120000,
                        source:
                            payload.source ||
                            "jarvis_tests_run_v7"
                    })
            }
        );

    const result =
        await response.json();

    return {
        ...result,
        httpStatus:
            response.status,
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

    const response =
        await fetch(
            "http://localhost:3344/grep",
            {
                method:
                    "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body:
                    JSON.stringify({
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
                    })
            }
        );

    const result =
        await response.json();

    return {
        ...result,
        httpStatus:
            response.status,
        source:
            result?.source ||
            "jarvis_local_bridge_grep_client_v7"
    };
};


window.JarvisLocalBridge.readFile ||= async function(payload = {}) {
    const file =
        payload.file ||
        payload.path ||
        "";

    const response =
        await fetch(
            "http://localhost:3344/read",
            {
                method:
                    "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body:
                    JSON.stringify({
                        file,
                        path:
                            payload.path || file,
                        maxBytes:
                            payload.maxBytes || 300000,
                        source:
                            payload.source ||
                            "jarvis_repo_read_v7"
                    })
            }
        );

    const rawText =
        await response.text();

    let result =
        null;

    try {
        result =
            JSON.parse(rawText);
    }
    catch(error) {
        result = {
            ok: false,
            status:
                "INVALID_READ_RESPONSE",
            error:
                "READ_ENDPOINT_DID_NOT_RETURN_JSON",
            raw:
                rawText.slice(0, 500),
            parseError:
                error?.message || String(error)
        };
    }

    return {
        ...result,
        httpStatus:
            response.status,
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

    const response =
        await fetch(
            "http://localhost:3344/write",
            {
                method:
                    "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body:
                    JSON.stringify({
                        file,
                        path:
                            payload.path || file,
                        content,
                        dryRun,
                        source:
                            payload.source ||
                            "jarvis_repo_write_v7"
                    })
            }
        );

    const rawText =
        await response.text();

    let result =
        null;

    try {
        result =
            JSON.parse(rawText);
    }
    catch(error) {
        result = {
            ok:
                false,
            status:
                "INVALID_WRITE_RESPONSE",
            error:
                "WRITE_ENDPOINT_DID_NOT_RETURN_JSON",
            raw:
                rawText.slice(0, 500),
            parseError:
                error?.message || String(error)
        };
    }

    return {
        ...result,
        httpStatus:
            response.status,
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
            "ci:test";

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
                    : "FAILED",
            command,
            npmCommand,
            result,
            tool:
                "tests.run"
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

        // 4. Validar que el bloque search exista en el contenido hidratado
        if (
            typeof hydratedContent === "string" &&
            !hydratedContent.includes(args.search)
        ) {
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
            result?.error
        ) {
            return {
                ok: false,
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

        return {
            ...result,
            ok:
                result?.ok !== false,
            status:
                result?.status ||
                "PATCH_PREVIEW_READY",
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

  async function writeRepoFile(file, content) {
    if (!file) throw new Error("Missing file");

    if (window.GestiaToolsRuntime?.repo?.write) {
      return await window.GestiaToolsRuntime.repo.write({ file, content });
    }

    if (window.toolsRuntime?.repo?.write) {
      return await window.toolsRuntime.repo.write({ file, content });
    }

    if (window.repo?.write) {
      return await window.repo.write({ file, content });
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

    const preview = {
      ok: true,
      dryRun: true,
      file,
      search,
      replace,
      diffPreview: buildDiffPreview(search, replace),
      risk: payload.risk || "medium",
      requiresApproval: true,
      approvalCommand: `Jarvis, apruebo patch ${file}`,
      createdAt: nowIso()
    };

    CodexV2.pendingPatch = preview;
    CodexV2.approvedPatch = null;

    return preview;
  }

  function approvePendingPatch(payload = {}) {
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

    CodexV2.approvedPatch = {
      ...CodexV2.pendingPatch,
      approved: true,
      approvedAt: nowIso()
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

    const writeResult = await writeRepoFile(approved.file, after);

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