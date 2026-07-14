const VERSION = "7.0.0-real-actuators";

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
        return {
            ok: false,
            status: `CLOUD_FUNCTION_HTTP_${response.status}`,
            error: payload?.error?.message || `CLOUD_FUNCTION_HTTP_${response.status}`
        };
    }

    return result;
}

function register(runtime, definition) {
    if (runtime.has?.(definition.name)) {
        return { ok: true, tool: definition.name, alreadyRegistered: true };
    }

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
            description: "Crea un artefacto HTML, Markdown, texto, CSV o JSON dentro del repositorio.",
            output: "DOCUMENT_CREATE_RESULT",
            inputSchema: {
                format: "html|md|txt|csv|json",
                output: "string",
                title: "string",
                content: "string"
            },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}) =>
                await bridgeRequest("/document", {
                    format: args.format || "html",
                    output: args.output,
                    title: args.title,
                    content: args.content
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
            name: "image.generate",
            description: "Genera una imagen con Gemini Image y devuelve bytes base64 y metadatos.",
            output: "IMAGE_GENERATION_RESULT",
            inputSchema: { prompt: "string", aspectRatio: "string", imageSize: "string" },
            execute: async (args = {}, context = {}) => {
                const result = await callAdminFunction("jarvisImageGenerate", {
                    prompt: args.prompt || context.rawInput || "",
                    aspectRatio: args.aspectRatio || "1:1",
                    imageSize: args.imageSize || "1K"
                });
                globalThis.__JARVIS_IMAGE_GENERATION_HEALTH__ = {
                    ok: result?.ok === true,
                    status: result?.status || "FAILED",
                    model: result?.model || null,
                    checkedAt: new Date().toISOString()
                };
                return result;
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
                const connectors = Object.entries(adapters).map(([id, adapter]) => ({
                    id,
                    connected: adapter?.connected === true,
                    capabilities: Array.isArray(adapter?.capabilities) ? adapter.capabilities : []
                }));

                return {
                    ok: true,
                    status: connectors.some(item => item.connected) ? "CONNECTED" : "NO_CONNECTORS_CONFIGURED",
                    connectors,
                    connectedCount: connectors.filter(item => item.connected).length
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
