import {
    planMarketingRequest
} from "./jarvis.marketing.engine.js";

import {
    runBusinessIntent
} from "./jarvis.business.engine.js";

import {
    createOfficialPageSpec
} from "./jarvis.page.creator.js";

import {
    buildMediaAnalysis,
    createMediaIngestionRecord,
    describeMediaIngestion
} from "./jarvis.media.ingestion.js";

const VERSION = "1.0.0-sia7-multifunction-tools";

function buildConversationResponse(instruction = "") {
    const normalized =
        String(instruction || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();

    if (/\b(tecate|cerveza|cheve|chelita)\b/i.test(normalized)) {
        return "¡Buenos días, pariente! Una Tecate bien fría suena buena; nomás con calma si vas a manejar. ¿Qué armamos hoy?";
    }

    if (/\b(buenos dias|buen dia)\b/i.test(normalized)) {
        return "¡Buenos días, pariente! Jarvis está activo y listo. ¿Qué armamos hoy?";
    }

    if (/\b(buenas tardes)\b/i.test(normalized)) {
        return "¡Buenas tardes, pariente! Jarvis está activo y listo. ¿Qué hacemos?";
    }

    if (/\b(buenas noches)\b/i.test(normalized)) {
        return "¡Buenas noches, pariente! Jarvis está en línea. ¿En qué te apoyo?";
    }

    return "Aquí estoy, pariente. Jarvis está activo y listo para ayudarte.";
}

function clean(value, fallback = "") {
    return typeof value === "string" && value.trim()
        ? value.trim()
        : fallback;
}

function resolveInstruction(args = {}, context = {}) {
    return clean(
        args.prompt ||
        args.instruction ||
        args.objective ||
        context.rawInput,
        "Solicitud multifuncional SIA7"
    );
}

function resolveAuthority(args = {}, context = {}) {
    const instruction =
        resolveInstruction(args, context);

    return {
        objectiveId:
            clean(
                args.objectiveId ||
                context.objectiveId ||
                context.analysisId,
                `SIA7-MULTI-${Date.now()}`
            ),
        authorityId:
            clean(
                args.authorityId ||
                context.authorityId,
                "HEBERTO_MENDOZA"
            ),
        controllerId:
            clean(
                args.controllerId ||
                context.controllerId,
                "CODEX_SIA7"
            ),
        instruction
    };
}

function register(runtime, definition) {
    if (runtime.has?.(definition.name)) {
        return {
            ok: true,
            tool: definition.name,
            alreadyRegistered: true
        };
    }

    return runtime.register({
        version: VERSION,
        mutates: false,
        requiresApproval: false,
        ...definition
    });
}

export function registerJarvisMultifunctionTools(runtime) {
    if (!runtime || typeof runtime.register !== "function") {
        throw new Error("JARVIS_TOOL_RUNTIME_REQUIRED");
    }

    const registrations = [
        register(runtime, {
            name: "conversation.respond",
            description: "Responde saludos y conversación casual localmente cuando la cognición cloud no está disponible.",
            output: "SIA7_CONVERSATION_RESPONSE",
            inputSchema: {
                prompt: "string"
            },
            execute: async (args = {}, context = {}) => {
                const instruction =
                    resolveInstruction(args, context);

                return {
                    ok: true,
                    engine: "jarvis_local_conversation",
                    message:
                        buildConversationResponse(instruction),
                    instruction,
                    localFallback: true,
                    readOnly: true
                };
            }
        }),
        register(runtime, {
            name: "system.capabilities",
            description: "Describe las herramientas activas de SIA7 agrupadas por dominio y su politica de aprobacion.",
            output: "SIA7_CAPABILITY_REPORT",
            execute: async () => {
                const tools =
                    typeof runtime.list === "function"
                        ? runtime.list()
                        : [];

                const groups =
                    tools.reduce((acc, tool) => {
                        const domain =
                            String(tool.name || "system")
                                .split(".")[0] ||
                            "system";

                        acc[domain] ||= [];
                        acc[domain].push(tool.name);
                        return acc;
                    }, {});

                return {
                    ok: true,
                    engine: "jarvis_multifunction_tools",
                    version: VERSION,
                    totalTools: tools.length,
                    groups,
                    tools,
                    policy: {
                        readOnlyByDefault: true,
                        mutatingToolsRequireApproval: true
                    }
                };
            }
        }),
        register(runtime, {
            name: "system.health",
            description: "Entrega un diagnostico read-only del runtime, bridge, memoria y conectividad del navegador.",
            output: "SIA7_SYSTEM_HEALTH",
            execute: async () => ({
                ok: true,
                engine: "jarvis_multifunction_tools",
                version: VERSION,
                status: "ONLINE",
                runtime: {
                    registeredTools:
                        runtime.list?.().length || 0,
                    bridgeAvailable:
                        typeof globalThis?.JarvisToolsBridge !== "undefined",
                    responseComposerAvailable:
                        typeof globalThis?.ResponseComposer !== "undefined"
                },
                environment: {
                    online:
                        typeof navigator !== "undefined"
                            ? navigator.onLine === true
                            : null,
                    memoryEntries:
                        globalThis?.JarvisToolMemory?.all?.().length || 0
                },
                readOnly: true,
                checkedAt: Date.now()
            })
        }),
        register(runtime, {
            name: "business.assist",
            description: "Resuelve consultas empresariales, operativas y de contexto interno sin modificar datos.",
            output: "SIA7_BUSINESS_RESPONSE",
            inputSchema: {
                prompt: "string"
            },
            execute: async (args = {}, context = {}) => {
                const instruction =
                    resolveInstruction(args, context);

                const result =
                    runBusinessIntent(instruction);

                return result || {
                    ok: true,
                    source: "BUSINESS_ENGINE_V2",
                    message: "Solicitud empresarial recibida. Necesito un objetivo mas especifico.",
                    instruction
                };
            }
        }),
        register(runtime, {
            name: "marketing.plan",
            description: "Genera campana, embudo, copies, calendario y entregables editables sujetos a aprobacion.",
            output: "SIA7_MARKETING_PLAN",
            inputSchema: {
                prompt: "string",
                brandName: "string",
                audience: "string",
                offer: "string"
            },
            execute: async (args = {}, context = {}) => {
                const instruction =
                    resolveInstruction(args, context);

                return planMarketingRequest(
                    instruction,
                    {
                        ...context,
                        ...args,
                        ...resolveAuthority(args, context)
                    }
                );
            }
        }),
        register(runtime, {
            name: "page.plan",
            description: "Construye una especificacion responsive, editable y accesible de pagina sin escribir ni desplegar.",
            output: "SIA7_PAGE_SPEC",
            inputSchema: {
                prompt: "string",
                pageName: "string",
                title: "string",
                description: "string",
                sections: "array"
            },
            execute: async (args = {}, context = {}) => {
                const authority =
                    resolveAuthority(args, context);

                return createOfficialPageSpec(
                    {
                        ...args,
                        pageName:
                            clean(
                                args.pageName,
                                "pagina-oficial"
                            )
                    },
                    authority
                );
            }
        }),
        register(runtime, {
            name: "media.analyze",
            description: "Analiza texto, tablas e imagenes ya extraidas de PDF, PNG, JPEG o WebP con trazabilidad read-only.",
            output: "SIA7_MEDIA_ANALYSIS",
            inputSchema: {
                mimeType: "string",
                sourceName: "string",
                pages: "array",
                questions: "array"
            },
            execute: async (args = {}, context = {}) => {
                if (!args.mimeType || !Array.isArray(args.pages)) {
                    return {
                        ok: false,
                        status: "MEDIA_INPUT_REQUIRED",
                        error: "MEDIA_INPUT_REQUIRED: mimeType y pages son obligatorios.",
                        capabilities:
                            describeMediaIngestion()
                    };
                }

                const authority =
                    resolveAuthority(args, context);

                const record =
                    createMediaIngestionRecord(
                        args,
                        authority
                    );

                return buildMediaAnalysis(
                    record,
                    args
                );
            }
        })
    ];

    return {
        ok: true,
        version: VERSION,
        registrations,
        tools: [
            "conversation.respond",
            "system.capabilities",
            "system.health",
            "business.assist",
            "marketing.plan",
            "page.plan",
            "media.analyze"
        ]
    };
}

export function describeJarvisMultifunctionTools() {
    return {
        ok: true,
        version: VERSION,
        domains: [
            "conversation",
            "system",
            "business",
            "marketing",
            "page",
            "media"
        ],
        readOnlyByDefault: true,
        derivedWritesRequireApproval: true
    };
}
