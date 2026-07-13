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

const VERSION = "1.2.0-sia7-capability-forensics";

const CAPABILITY_WEIGHTS = {
    READY: 1,
    PARTIAL: 0.5,
    NOT_AVAILABLE: 0
};

function toolNames(runtime) {
    return new Set(
        (runtime.list?.() || [])
            .map(tool => String(tool?.name || ""))
            .filter(Boolean)
    );
}

function hasEvery(tools, required = []) {
    return required.every(name => tools.has(name));
}

function hasNamespace(tools, namespaces = []) {
    return [...tools].some(name =>
        namespaces.some(namespace =>
            name === namespace || name.startsWith(`${namespace}.`)
        )
    );
}

async function buildCapabilityForensics(runtime) {
    const tools = toolNames(runtime);
    const bridge =
        typeof globalThis?.JarvisLocalBridge?.verifyIdentity === "function"
            ? await globalThis.JarvisLocalBridge.verifyIdentity({ force: true })
            : {
                ok: false,
                status: "BRIDGE_CLIENT_UNAVAILABLE"
            };

    const speechAvailable =
        typeof globalThis?.speechSynthesis !== "undefined" ||
        typeof globalThis?.window?.speechSynthesis !== "undefined";

    const capabilities = [
        {
            id: "repo_engineering",
            status:
                bridge.ok === true && hasEvery(tools, [
                    "repo.read",
                    "repo.grep",
                    "repo.diagnose",
                    "repo.write"
                ])
                    ? "READY"
                    : "NOT_AVAILABLE",
            evidence: {
                bridge: bridge.status || "UNKNOWN",
                requiredTools: ["repo.read", "repo.grep", "repo.diagnose", "repo.write"]
            }
        },
        {
            id: "tests_and_git",
            status:
                bridge.ok === true && hasEvery(tools, ["tests.run", "repo.gitStatus"])
                    ? "READY"
                    : "NOT_AVAILABLE",
            evidence: {
                bridge: bridge.status || "UNKNOWN",
                requiredTools: ["tests.run", "repo.gitStatus"]
            }
        },
        {
            id: "conversation_and_voice",
            status:
                tools.has("conversation.respond") && speechAvailable
                    ? "READY"
                    : tools.has("conversation.respond")
                        ? "PARTIAL"
                        : "NOT_AVAILABLE",
            evidence: {
                conversationTool: tools.has("conversation.respond"),
                speechSynthesis: speechAvailable
            }
        },
        {
            id: "business_and_marketing",
            status:
                hasEvery(tools, ["business.assist", "marketing.plan", "page.plan"])
                    ? "READY"
                    : hasNamespace(tools, ["business", "marketing", "page"])
                        ? "PARTIAL"
                        : "NOT_AVAILABLE",
            evidence: {
                requiredTools: ["business.assist", "marketing.plan", "page.plan"]
            }
        },
        {
            id: "media_and_documents",
            status: tools.has("media.analyze") ? "PARTIAL" : "NOT_AVAILABLE",
            evidence: {
                extractedContentAnalysis: tools.has("media.analyze"),
                nativeDocumentEditing: false
            }
        },
        {
            id: "daily_supervision",
            status: tools.has("system.supervision") ? "PARTIAL" : "NOT_AVAILABLE",
            evidence: {
                statusTool: tools.has("system.supervision"),
                schedulerRequiresExternalInfrastructure: true
            }
        },
        {
            id: "browser_control",
            status: hasNamespace(tools, ["browser", "chrome"]) ? "READY" : "NOT_AVAILABLE",
            evidence: {
                actuatorRegistered: hasNamespace(tools, ["browser", "chrome"])
            }
        },
        {
            id: "web_research",
            status: hasNamespace(tools, ["web", "search"]) ? "READY" : "NOT_AVAILABLE",
            evidence: {
                actuatorRegistered: hasNamespace(tools, ["web", "search"])
            }
        },
        {
            id: "image_generation",
            status: hasNamespace(tools, ["image", "imagegen"]) ? "READY" : "NOT_AVAILABLE",
            evidence: {
                actuatorRegistered: hasNamespace(tools, ["image", "imagegen"])
            }
        },
        {
            id: "connectors_and_multi_agent",
            status:
                hasNamespace(tools, ["connector", "agent", "mail", "calendar"])
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            evidence: {
                connectorsRegistered: hasNamespace(tools, ["connector", "mail", "calendar"]),
                agentDelegationRegistered: hasNamespace(tools, ["agent"])
            }
        }
    ];

    const achieved = capabilities.reduce(
        (sum, capability) => sum + CAPABILITY_WEIGHTS[capability.status],
        0
    );
    const readinessScore = Math.round((achieved / capabilities.length) * 100);
    const gaps = capabilities
        .filter(capability => capability.status !== "READY")
        .map(capability => ({
            id: capability.id,
            status: capability.status
        }));
    const statusCounts = capabilities.reduce((counts, capability) => {
        counts[capability.status] += 1;
        return counts;
    }, {
        READY: 0,
        PARTIAL: 0,
        NOT_AVAILABLE: 0
    });
    const gapIds = new Set(gaps.map(gap => gap.id));
    const priorityByCapability = {
        media_and_documents: "Conectar edicion documental nativa.",
        daily_supervision: "Completar la infraestructura externa del scheduler diario.",
        browser_control: "Conectar un actuador de navegador verificable.",
        web_research: "Conectar investigacion web con fuentes y citas.",
        image_generation: "Conectar generacion y edicion de imagenes.",
        connectors_and_multi_agent: "Conectar integraciones externas y delegacion multiagente.",
        repo_engineering: "Restaurar bridge y herramientas de ingenieria del repo.",
        tests_and_git: "Restaurar ejecucion de pruebas y diagnostico Git.",
        conversation_and_voice: "Restaurar conversacion y salida de voz.",
        business_and_marketing: "Restaurar motores de negocio, marketing y paginas."
    };

    return {
        ok: true,
        engine: "jarvis_capability_forensics",
        version: VERSION,
        readinessScore,
        summary: {
            total: capabilities.length,
            ...statusCounts
        },
        parity: {
            target: "CODEX_ASSISTANT",
            canClaimParity: gaps.length === 0,
            policy: "EVIDENCE_ONLY"
        },
        capabilities,
        gaps,
        priorities: Object.entries(priorityByCapability)
            .filter(([id]) => gapIds.has(id))
            .map(([, priority]) => priority),
        runtime: {
            registeredTools: tools.size,
            bridge
        },
        readOnly: true,
        checkedAt: new Date().toISOString()
    };
}

const LOCAL_SUPERVISION_PROBES = [
    {
        path: "/app-login.js",
        markers: ["FirebaseCore.verificarYRedireccionar"]
    },
    {
        path: "/firebase.js",
        markers: ["gestia-terminal", "b2b_admin"]
    },
    {
        path: "/gestia-core/jarvis/jarvis.multifunction.planner.js",
        markers: ["isJarvisTechnicalDiagnosticRequest", "system.supervision"]
    },
    {
        path: "/runtime-health.js",
        markers: ["runtimeLatency", "getRuntimeHealthSnapshot"]
    }
];

async function runLocalDailySupervision() {
    const checks = [];

    for (const probe of LOCAL_SUPERVISION_PROBES) {
        try {
            const response = await fetch(probe.path, {
                cache: "no-store"
            });
            const body = await response.text();
            const missingMarkers = probe.markers.filter(marker =>
                !body.includes(marker)
            );

            checks.push({
                path: probe.path,
                ok: response.ok && missingMarkers.length === 0,
                httpStatus: response.status,
                missingMarkers
            });
        } catch (error) {
            checks.push({
                path: probe.path,
                ok: false,
                httpStatus: null,
                missingMarkers: [],
                error: error?.message || String(error)
            });
        }
    }

    const failed = checks.filter(check => !check.ok);
    const score = Math.max(0, 100 - (failed.length * 25));

    return {
        ok: true,
        status: score >= 90 ? "HEALTHY" : score >= 70 ? "DEGRADED" : "CRITICAL",
        score,
        summary: {
            total: checks.length,
            passed: checks.length - failed.length,
            failed: failed.length
        },
        findings: failed,
        checks,
        checkedAt: new Date().toISOString(),
        source: "JARVIS_LOCAL_SUPERVISION_FALLBACK",
        readOnly: true,
        policy: {
            autoPatch: false,
            codeWrite: false
        }
    };
}

async function fetchDailySupervisionStatus() {
    const user =
        globalThis?.auth?.currentUser ||
        globalThis?.window?.auth?.currentUser ||
        null;

    if (!user) {
        return {
            ok: false,
            error: "AUTH_REQUIRED",
            message: "Necesito una sesión válida para consultar la supervisión diaria."
        };
    }

    const localStatus = await runLocalDailySupervision();

    try {
        const token = await user.getIdToken();
        const response = await fetch(
            "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisSupervisionStatus",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ data: {} })
            }
        );
        const payload = await response.json();
        const result = payload?.result || payload?.data || null;

        if (!response.ok || !result) {
            throw new Error(
                payload?.error?.message ||
                `SUPERVISION_STATUS_HTTP_${response.status}`
            );
        }

        return {
            ...result,
            source: "JARVIS_DAILY_SUPERVISOR",
            readOnly: true,
            liveProbe: localStatus
        };
    } catch (error) {
        return {
            ...localStatus,
            cloudReportAvailable: false,
            cloudError: error?.message || String(error),
            message: "Supervisión local completada; el scheduler cloud está pendiente de habilitar facturación/App Engine."
        };
    }
}

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

                const forensics =
                    await buildCapabilityForensics(runtime);

                return {
                    ok: true,
                    engine: "jarvis_multifunction_tools",
                    version: VERSION,
                    totalTools: tools.length,
                    groups,
                    tools,
                    readiness: {
                        score: forensics.readinessScore,
                        parity: forensics.parity,
                        gaps: forensics.gaps
                    },
                    policy: {
                        readOnlyByDefault: true,
                        mutatingToolsRequireApproval: true
                    }
                };
            }
        }),
        register(runtime, {
            name: "system.forensics",
            description: "Audita capacidades operativas reales, actuadores, evidencia, brechas y paridad sin exagerar funciones.",
            output: "SIA7_CAPABILITY_FORENSICS",
            execute: async () =>
                await buildCapabilityForensics(runtime)
        }),
        register(runtime, {
            name: "system.health",
            description: "Entrega un diagnostico read-only del runtime, bridge, memoria y conectividad del navegador.",
            output: "SIA7_SYSTEM_HEALTH",
            execute: async () => {
                const registeredTools =
                    runtime.list?.().length || 0;

                const online =
                    typeof navigator !== "undefined"
                        ? navigator.onLine === true
                        : null;

                const bridge =
                    typeof globalThis?.JarvisLocalBridge?.verifyIdentity === "function"
                        ? await globalThis.JarvisLocalBridge.verifyIdentity({
                            force: true
                        })
                        : {
                            ok: false,
                            status: "BRIDGE_CLIENT_UNAVAILABLE"
                        };

                const failures = [];

                if (registeredTools === 0) {
                    failures.push("TOOL_RUNTIME_EMPTY");
                }

                if (bridge.ok !== true) {
                    failures.push(bridge.status || "BRIDGE_UNAVAILABLE");
                }

                if (online === false) {
                    failures.push("BROWSER_OFFLINE");
                }

                const status =
                    failures.length === 0
                        ? "ONLINE"
                        : registeredTools > 0
                            ? "DEGRADED"
                            : "OFFLINE";

                return {
                    ok:
                        status === "ONLINE",
                    engine: "jarvis_multifunction_tools",
                    version: VERSION,
                    status,
                    failures,
                    runtime: {
                        registeredTools,
                        bridgeAvailable:
                            bridge.ok === true,
                        bridgeStatus:
                            bridge.status || "UNKNOWN",
                        bridgeRoot:
                            bridge.bridgeRoot || null,
                        responseComposerAvailable:
                            typeof globalThis?.ResponseComposer !== "undefined"
                    },
                    bridge,
                    environment: {
                        online,
                        memoryEntries:
                            globalThis?.JarvisToolMemory?.all?.().length || 0
                    },
                    readOnly: true,
                    checkedAt: Date.now()
                };
            }
        }),
        register(runtime, {
            name: "system.supervision",
            description: "Consulta el ultimo reporte del supervisor diario read-only de Jarvis.",
            output: "SIA7_DAILY_SUPERVISION_STATUS",
            execute: async () =>
                await fetchDailySupervisionStatus()
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
            "system.forensics",
            "system.health",
            "system.supervision",
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
