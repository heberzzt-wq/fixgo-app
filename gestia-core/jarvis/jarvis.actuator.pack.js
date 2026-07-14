import {
    recordCapabilityEvidence
} from "./jarvis.capability.evidence.js";

const VERSION = "7.3.0-native-pdf-editing";

export function normalizeImageArtifactOutput(output, mimeType) {
    const extensions = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp"
    };
    const extension = extensions[String(mimeType || "").trim().toLowerCase()];
    const candidate = String(output || "").trim().replaceAll("\\", "/");

    if (
        !extension ||
        !candidate.startsWith(".jarvis-artifacts/images/") ||
        candidate.includes("../") ||
        candidate.includes("//") ||
        !candidate.toLowerCase().endsWith(extension)
    ) {
        return undefined;
    }

    return candidate;
}

function bridgeRequest(path, payload, timeoutMs = 60000) {
    if (typeof globalThis?.JarvisLocalBridge?.requestJson !== "function") {
        return Promise.resolve({
            ok: false,
            status: "LOCAL_BRIDGE_REQUIRED",
            error: "LOCAL_BRIDGE_REQUIRED"
        });
    }

    return globalThis.JarvisLocalBridge.requestJson(
        path,
        payload,
        { timeoutMs }
    );
}

async function callAdminFunction(name, data = {}) {
    const user =
        globalThis?.auth?.currentUser ||
        globalThis?.window?.auth?.currentUser ||
        null;

    if (!user) {
        return {
            ok: false,
            status: "AUTH_REQUIRED",
            error: "AUTH_REQUIRED"
        };
    }

    const token = await user.getIdToken();
    const response = await fetch(
        `https://us-central1-fixgo-44e4d.cloudfunctions.net/${name}`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ data })
        }
    );
    const rawText = await response.text();
    let payload = null;

    try {
        payload = JSON.parse(rawText);
    }
    catch(error) {
        return {
            ok: false,
            status: `CLOUD_FUNCTION_INVALID_RESPONSE_${response.status}`,
            error: `La funcion ${name} no devolvio JSON valido.`,
            responsePreview: rawText.slice(0, 160)
        };
    }
    const result = payload?.result || payload?.data || null;

    if (!response.ok || !result) {
        const errorDetails = payload?.error?.details;
        const errorMessage =
            payload?.error?.message ||
            errorDetails?.message ||
            errorDetails?.error ||
            (typeof errorDetails === "string" ? errorDetails : "") ||
            `CLOUD_FUNCTION_HTTP_${response.status}`;
        return {
            ok: false,
            status: `CLOUD_FUNCTION_HTTP_${response.status}`,
            error: errorMessage,
            cloudCode: payload?.error?.status || payload?.error?.code || null
        };
    }

    return result;
}

function register(runtime, definition) {
    return runtime.register({
        version: VERSION,
        mutates: false,
        requiresApproval: false,
        ...definition
    });
}

export function registerJarvisActuatorTools(runtime) {
    if (!runtime || typeof runtime.register !== "function") {
        throw new Error("JARVIS_TOOL_RUNTIME_REQUIRED");
    }

    const registrations = [
        register(runtime, {
            name: "system.supervision.runNow",
            description: "Ejecuta bajo autorizacion administrativa la supervision persistida sin esperar al horario diario.",
            output: "SUPERVISION_RUN_NOW_RESULT",
            mutates: true,
            requiresApproval: true,
            execute: async () =>
                await callAdminFunction("jarvisSupervisionRunNow", {})
        }),
        register(runtime, {
            name: "browser.inspect",
            description: "Carga una URL en Chrome/Edge headless real y devuelve el DOM renderizado.",
            output: "BROWSER_INSPECTION",
            inputSchema: { url: "string", timeoutMs: "number" },
            execute: async (args = {}) =>
                await bridgeRequest("/browser", {
                    action: "inspect",
                    url: args.url,
                    timeoutMs: args.timeoutMs || 45000
                }, (args.timeoutMs || 45000) + 5000)
        }),
        register(runtime, {
            name: "browser.screenshot",
            description: "Renderiza una URL en Chrome/Edge real y guarda una captura PNG verificable.",
            output: "BROWSER_SCREENSHOT",
            inputSchema: { url: "string", output: "string", timeoutMs: "number" },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}) =>
                await bridgeRequest("/browser", {
                    action: "screenshot",
                    url: args.url,
                    output: args.output || ".jarvis-artifacts/browser/latest.png",
                    timeoutMs: args.timeoutMs || 45000
                }, (args.timeoutMs || 45000) + 5000)
        }),
        register(runtime, {
            name: "browser.open",
            description: "Abre una URL HTTP(S) en el navegador local visible.",
            output: "BROWSER_OPEN_RESULT",
            inputSchema: { url: "string" },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}) =>
                await bridgeRequest("/browser", {
                    action: "open",
                    url: args.url
                })
        }),
        register(runtime, {
            name: "document.create",
            description: "Crea artefactos HTML, Markdown, CSV, JSON, DOCX, XLSX, PPTX o PDF dentro del repositorio.",
            output: "DOCUMENT_CREATE_RESULT",
            inputSchema: {
                format: "html|md|txt|csv|json|docx|xlsx|pptx|pdf",
                output: "string",
                title: "string",
                content: "string",
                rows: "array",
                slides: "array"
            },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}) =>
                await bridgeRequest("/document", {
                    format: args.format || "html",
                    output: args.output,
                    title: args.title,
                    content: args.content,
                    rows: args.rows,
                    slides: args.slides
                })
        }),
        register(runtime, {
            name: "document.pdf",
            description: "Convierte una URL o documento HTML servido a PDF mediante Chrome/Edge real.",
            output: "DOCUMENT_PDF_RESULT",
            inputSchema: { url: "string", output: "string" },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}) =>
                await bridgeRequest("/browser", {
                    action: "pdf",
                    url: args.url,
                    output: args.output || ".jarvis-artifacts/documents/document.pdf",
                    timeoutMs: args.timeoutMs || 45000
                }, (args.timeoutMs || 45000) + 5000)
        }),
        register(runtime, {
            name: "document.pdf.edit",
            description: "Edita cajas de texto concretas de un PDF existente, conserva el original y bloquea desbordamientos; requiere revision visual antes de considerarse verificado.",
            output: "DOCUMENT_PDF_EDIT_RESULT",
            inputSchema: {
                sourceOutput: "string",
                output: "string",
                changes: "array<{page,x,y|yFromTop,width,height,text,fontSize,color,backgroundColor}>"
            },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}) => {
                const result = await bridgeRequest("/document/pdf/edit", {
                    sourceOutput: args.sourceOutput,
                    output: args.output,
                    changes: args.changes
                }, 90000);
                recordCapabilityEvidence("pdf_editing", {
                    ok: result?.ok === true && result?.visualVerification?.renderedComparisonPassed === true,
                    status: result?.status || "PDF_EDIT_FAILED",
                    output: result?.output || null,
                    sourceSha256: result?.sourceSha256 || null,
                    outputSha256: result?.outputSha256 || null,
                    originalPreserved: result?.originalPreserved === true,
                    overflowPassed: result?.visualVerification?.overflowPassed === true,
                    renderedComparisonPassed: result?.visualVerification?.renderedComparisonPassed === true,
                    checkedAt: new Date().toISOString()
                });
                return result;
            }
        }),
        register(runtime, {
            name: "image.generate",
            description: "Genera una imagen y la guarda como artefacto local utilizable.",
            output: "IMAGE_GENERATION_RESULT",
            inputSchema: { prompt: "string", aspectRatio: "string", imageSize: "string", output: "string" },
            execute: async (args = {}, context = {}) => {
                const result = await callAdminFunction("jarvisImageGenerate", {
                    prompt: args.prompt || context.rawInput || "",
                    aspectRatio: args.aspectRatio || "1:1",
                    imageSize: args.imageSize || "1K"
                });
                let artifact = null;
                if (result?.ok === true && result?.imageBase64) {
                    const safeOutput = normalizeImageArtifactOutput(
                        args.output,
                        result.mimeType
                    );
                    artifact = await bridgeRequest("/image", {
                        imageBase64: result.imageBase64,
                        mimeType: result.mimeType,
                        output: safeOutput
                    }, 30000);
                }
                const finalResult = {
                    ...result,
                    persisted: artifact?.ok === true,
                    output: artifact?.output || null,
                    bytes: artifact?.bytes || null,
                    persistenceStatus: artifact?.status || null,
                    persistenceError: artifact?.ok === false ? artifact.error : null
                };
                globalThis.__JARVIS_IMAGE_GENERATION_HEALTH__ = recordCapabilityEvidence("image_generation", {
                    ok: finalResult.ok === true && finalResult.persisted === true,
                    status: finalResult.persisted ? finalResult.status : "IMAGE_ARTIFACT_REQUIRED",
                    model: result?.model || null,
                    output: finalResult.output,
                    error: result?.error || finalResult.persistenceError || null,
                    cloudCode: result?.cloudCode || null,
                    checkedAt: new Date().toISOString()
                });
                return finalResult;
            }
        }),
        register(runtime, {
            name: "agent.delegate",
            description: "Delega y ejecuta en paralelo hasta cuatro herramientas read-only de Jarvis.",
            output: "AGENT_DELEGATION_RESULT",
            inputSchema: { tasks: "array" },
            execute: async (args = {}, context = {}) => {
                const tasks = Array.isArray(args.tasks) ? args.tasks.slice(0, 4) : [];
                const allowed = tasks.filter(task => {
                    const definition = runtime.get?.(task?.tool);
                    return definition && definition.mutates !== true && task.tool !== "agent.delegate";
                });

                if (allowed.length === 0) {
                    return {
                        ok: false,
                        status: "DELEGATION_TASKS_REQUIRED",
                        error: "DELEGATION_TASKS_REQUIRED"
                    };
                }

                const startedAt = Date.now();
                const results = await Promise.all(
                    allowed.map(task => runtime.execute(
                        task.tool,
                        task.args || {},
                        { ...context, delegated: true }
                    ))
                );

                return {
                    ok: results.every(result => result?.ok === true),
                    status: "DELEGATION_COMPLETE",
                    parallel: true,
                    taskCount: allowed.length,
                    durationMs: Date.now() - startedAt,
                    results
                };
            }
        }),
        register(runtime, {
            name: "connector.list",
            description: "Enumera conectores instalados y su estado real sin inventar disponibilidad.",
            output: "CONNECTOR_LIST",
            execute: async () => {
                const adapters = globalThis?.JarvisConnectors || {};
                const configuredConnectors = Object.entries(adapters).map(([id, adapter]) => ({
                    id,
                    connected: adapter?.connected === true,
                    capabilities: Array.isArray(adapter?.capabilities) ? adapter.capabilities : []
                }));

                const localResult = await bridgeRequest(
                    "/connectors",
                    { timeoutMs: 10000 },
                    15000
                );
                const localConnectors = Array.isArray(localResult?.connectors)
                    ? localResult.connectors
                    : [];
                const connectors = [...localConnectors, ...configuredConnectors]
                    .filter((item, index, all) =>
                        all.findIndex(candidate => candidate.id === item.id) === index
                    );
                const connectedCount = connectors.filter(item => item.connected).length;

                globalThis.__JARVIS_CONNECTOR_HEALTH__ = recordCapabilityEvidence("connectors", {
                    ok: localResult?.ok === true,
                    status: localResult?.status || "LOCAL_BRIDGE_REQUIRED",
                    connectedCount,
                    checkedAt: new Date().toISOString()
                });

                return {
                    ok: true,
                    status: connectedCount > 0 ? "CONNECTED" : "NO_CONNECTORS_CONFIGURED",
                    connectors,
                    connectedCount,
                    verified: localResult?.ok === true
                };
            }
        })
    ];

    return {
        ok: registrations.every(item => item?.ok !== false),
        version: VERSION,
        registrations
    };
}
