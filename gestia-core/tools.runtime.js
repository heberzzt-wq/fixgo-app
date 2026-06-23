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
    description: "Genera un diff en memoria (dry-run) estricto. Requiere file, search y replace.",
    mutates: false, 
    requiresApproval: false, 
    output: "REPO_PATCH_PREVIEW",
    inputSchema: {
        type: "object",
        required: ["file", "search", "replace"],
        properties: {
            file: { type: "string", description: "Ruta del archivo objetivo (ej. gestia-terminal.html)" },
            search: { type: "string", description: "Bloque de código exacto a buscar en el archivo" },
            replace: { type: "string", description: "Nuevo bloque de código que sustituirá a la búsqueda" },
            dryRun: { type: "boolean", description: "Forzado a true internamente", default: true }
        }
    },
    execute: async (args, context) => {
        // 1. Hard Validation del contrato
        if (!args || typeof args !== 'object') {
            return { 
                ok: false, 
                status: "CONTRACT_INVALID", 
                error: "El payload de argumentos debe ser un objeto válido." 
            };
        }

        const missing = ["file", "search", "replace"].filter(key => !(key in args) || !args[key]);

        if (missing.length > 0) {
            console.warn(`[RUNTIME_WARNING] Contrato inválido en repo.patchPreview. Faltan: ${missing.join(", ")}`);
            return {
                ok: false,
                status: "CONTRACT_INVALID",
                error: `Faltan parámetros obligatorios en el contrato: ${missing.join(", ")}`,
                receivedArgs: Object.keys(args)
            };
        }

        // 2. Forzar modo seguro e inyectar el diff completo
        const safeArgs = { 
            ...args, 
            dryRun: true 
        };

        // 3. Ejecución contra el Hub
        const { generatePatch } = await import('/gestia-core/hubs/repo.hub.js');
        const result = await generatePatch(safeArgs);

        // 4. Interceptar respuestas lógicas del hub que sean fallos en la práctica
        if (result?.status === "SEARCH_REQUIRED" || result?.error) {
            return {
                ok: false,
                status: "PATCH_FAILED",
                error: result.error || "El motor de patches rebotó la solicitud (SEARCH_REQUIRED o similar).",
                details: result
            };
        }

        return result;
    }
});

window.JarvisToolRuntime = JarvisToolRuntime;

console.info(
    "🧠 [JARVIS_TOOL_RUNTIME] ONLINE v7.0"
);