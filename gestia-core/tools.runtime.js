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
            return {
                ok: false,
                status:
                    "PATCH_PREVIEW_NEEDS_EXACT_BLOCK",
                error:
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
                next:
                    "Usa repo.read o repo.grep para localizar el bloque exacto; después llama repo.patchPreview con file, search y replace.",
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