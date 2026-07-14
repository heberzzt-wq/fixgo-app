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

const VERSION = "1.7.0-sia7-bounded-supervision-forensics";
const SUPERVISION_CLOUD_TIMEOUT_MS = 4500;
const FORENSICS_SUPERVISION_TIMEOUT_MS = 1500;

const CAPABILITY_WEIGHTS = {
    READY: 1,
    PARTIAL: 0.5,
    NOT_AVAILABLE: 0
};

const CAPABILITY_LABELS = {
    repo_engineering: "Ingenieria del repositorio",
    tests_and_git: "Pruebas y Git",
    conversation_and_voice: "Conversacion y voz",
    business_and_marketing: "Negocio, marketing y paginas",
    media_and_documents: "Documentos y medios",
    daily_supervision: "Supervision diaria",
    browser_control: "Control del navegador",
    web_research: "Investigacion web con fuentes",
    image_generation: "Generacion y edicion de imagenes",
    connectors_and_multi_agent: "Conectores y delegacion multiagente"
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

function unwrapRuntimeResult(result = {}) {
    return result?.data ||
        result?.response?.data ||
        result;
}

async function inspectDailySupervisionCapability(
    runtime,
    tools
) {
    if (!tools.has("system.supervision")) {
        return {
            status: "NOT_AVAILABLE",
            reason: "La herramienta de estado diario no esta registrada.",
            nextAction: "Registrar y desplegar el supervisor diario.",
            evidence: {
                statusTool: false,
                cloudEndpoint: false,
                scheduledRun: false
            }
        };
    }

    try {
        const execution =
            await runtime.execute(
                "system.supervision",
                {
                    timeoutMs:
                        FORENSICS_SUPERVISION_TIMEOUT_MS
                },
                {
                    readOnly: true,
                    source: "system.forensics"
                }
            );
        const report =
            unwrapRuntimeResult(execution);
        const cloudEndpoint =
            report?.ok === true &&
            report?.source ===
                "JARVIS_DAILY_SUPERVISOR" &&
            report?.cloudReportAvailable !== false;
        const scheduledRun = Boolean(
            report?.reportId ||
            report?.startedAtIso
        );
        const scheduleDeclared = Boolean(
            report?.scheduledAt ||
            scheduledRun
        );
        const localProbeStatus =
            report?.liveProbe?.status ||
            null;

        if (
            cloudEndpoint &&
            scheduledRun
        ) {
            return {
                status: "READY",
                reason: "El endpoint cloud entrego un reporte diario persistido.",
                nextAction: null,
                evidence: {
                    statusTool: true,
                    cloudEndpoint: true,
                    scheduleDeclared: true,
                    scheduledRun: true,
                    reportStatus:
                        report?.status || null,
                    reportId:
                        report?.reportId || null,
                    localProbeStatus
                }
            };
        }

        if (
            cloudEndpoint &&
            scheduleDeclared
        ) {
            return {
                status: "PARTIAL",
                reason: "Scheduler y endpoint cloud activos; falta evidencia de la primera ejecucion diaria.",
                nextAction: `Validar el primer reporte programado${report?.scheduledAt ? ` a las ${report.scheduledAt}` : ""}.`,
                evidence: {
                    statusTool: true,
                    cloudEndpoint: true,
                    scheduleDeclared: true,
                    scheduledRun: false,
                    reportStatus:
                        report?.status || null,
                    localProbeStatus
                }
            };
        }

        return {
            status: "PARTIAL",
            reason:
                report?.message ||
                report?.error ||
                "La herramienta existe, pero no probo un reporte cloud utilizable.",
            nextAction: "Restaurar la consulta cloud y validar un reporte persistido.",
            evidence: {
                statusTool: true,
                cloudEndpoint,
                scheduleDeclared,
                scheduledRun,
                reportStatus:
                    report?.status || null,
                error:
                    report?.error ||
                    report?.cloudError ||
                    null,
                localProbeStatus
            }
        };
    }
    catch(error) {
        return {
            status: "PARTIAL",
            reason: "La comprobacion del supervisor no pudo completarse.",
            nextAction: "Revisar el endpoint cloud del supervisor y repetir el forense.",
            evidence: {
                statusTool: true,
                cloudEndpoint: false,
                scheduleDeclared: false,
                scheduledRun: false,
                error:
                    error?.message ||
                    String(error)
            }
        };
    }
}

function inspectWebResearchCapability(
    tools
) {
    const actuatorRegistered =
        tools.has("web.research");
    const health =
        globalThis
            ?.__JARVIS_WEB_RESEARCH_HEALTH__ ||
        null;
    const verified =
        actuatorRegistered &&
        health?.ok === true &&
        health?.grounded === true &&
        Number(health?.sourceCount || 0) > 0;

    if (verified) {
        return {
            status: "READY",
            reason: "La ultima investigacion web devolvio fuentes verificables.",
            nextAction: null,
            evidence: {
                actuatorRegistered: true,
                verified: true,
                sourceCount:
                    health.sourceCount,
                checkedAt:
                    health.checkedAt || null
            }
        };
    }

    if (actuatorRegistered) {
        const credentialMissing =
            /credencial gemini/i.test(
                String(health?.message || "")
            );

        return {
            status: "PARTIAL",
            reason:
                health?.message ||
                "El actuador esta registrado, pero aun no hay una busqueda sustentada exitosa.",
            nextAction: credentialMissing
                ? "Configurar la credencial Gemini de la funcion y repetir una investigacion web real."
                : "Ejecutar una investigacion web real y validar respuesta, fuentes y citas.",
            evidence: {
                actuatorRegistered: true,
                verified: false,
                lastStatus:
                    health?.status ||
                    "NOT_TESTED",
                sourceCount:
                    Number(
                        health?.sourceCount ||
                        0
                    ),
                checkedAt:
                    health?.checkedAt || null
            }
        };
    }

    return {
        status: "NOT_AVAILABLE",
        reason: "No hay busqueda web con fuentes y citas registrada.",
        nextAction: "Conectar investigacion web con fuentes y citas.",
        evidence: {
            actuatorRegistered: false,
            verified: false,
            sourceCount: 0,
            checkedAt: null
        }
    };
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
    const semanticPlannerHealth =
        globalThis?.__JARVIS_SEMANTIC_PLANNER_HEALTH__ || null;
    const semanticConversationHealth =
        globalThis?.__JARVIS_SEMANTIC_CONVERSATION_HEALTH__ || null;
    const semanticModelReady =
        semanticPlannerHealth?.ok === true ||
        semanticConversationHealth?.ok === true;

    const dailySupervision =
        await inspectDailySupervisionCapability(
            runtime,
            tools
        );
    const webResearch =
        inspectWebResearchCapability(
            tools
        );
    const repoToolsReady =
        hasEvery(tools, [
            "repo.read",
            "repo.grep",
            "repo.diagnose",
            "repo.write"
        ]);
    const testAndGitToolsReady =
        hasEvery(tools, [
            "tests.run",
            "repo.gitStatus"
        ]);
    const bridgeReady =
        bridge.ok === true;
    const imageHealth =
        globalThis?.__JARVIS_IMAGE_GENERATION_HEALTH__ || null;
    const imageCredentialInvalid =
        /API key not valid|API_KEY_INVALID/i.test(
            String(imageHealth?.error || "")
        );
    const connectorHealth =
        globalThis?.__JARVIS_CONNECTOR_HEALTH__ || null;
    const connectorsReady =
        tools.has("agent.delegate") &&
        connectorHealth?.ok === true &&
        Number(connectorHealth?.connectedCount || 0) >= 2;

    const capabilities = [
        {
            id: "repo_engineering",
            status:
                bridgeReady && repoToolsReady
                    ? "READY"
                    : bridgeReady || repoToolsReady
                        ? "PARTIAL"
                        : "NOT_AVAILABLE",
            reason: bridgeReady && repoToolsReady
                ? "Bridge e instrumentos del repositorio verificados."
                : repoToolsReady
                    ? "Las herramientas existen, pero el bridge local no verifico identidad."
                    : bridgeReady
                        ? "El bridge verifico identidad, pero faltan herramientas esenciales del repositorio."
                        : "No hay bridge verificado ni cobertura completa de herramientas del repositorio.",
            nextAction: bridgeReady && repoToolsReady
                ? null
                : "Restaurar identidad del bridge y verificar lectura, busqueda, diagnostico y escritura gobernada.",
            evidence: {
                bridge: bridge.status || "UNKNOWN",
                bridgeReady,
                toolsReady: repoToolsReady,
                requiredTools: ["repo.read", "repo.grep", "repo.diagnose", "repo.write"]
            }
        },
        {
            id: "tests_and_git",
            status:
                bridgeReady && testAndGitToolsReady
                    ? "READY"
                    : bridgeReady || testAndGitToolsReady
                        ? "PARTIAL"
                        : "NOT_AVAILABLE",
            reason: bridgeReady && testAndGitToolsReady
                ? "Pruebas y estado Git disponibles mediante un bridge verificado."
                : testAndGitToolsReady
                    ? "Los actuadores de pruebas y Git existen, pero el bridge local no verifico identidad."
                    : bridgeReady
                        ? "El bridge esta verificado, pero faltan actuadores de pruebas o estado Git."
                        : "No hay bridge verificado ni actuadores completos de pruebas y Git.",
            nextAction: bridgeReady && testAndGitToolsReady
                ? null
                : "Restaurar el bridge y validar ejecucion de pruebas y lectura del estado Git.",
            evidence: {
                bridge: bridge.status || "UNKNOWN",
                bridgeReady,
                toolsReady: testAndGitToolsReady,
                requiredTools: ["tests.run", "repo.gitStatus"]
            }
        },
        {
            id: "conversation_and_voice",
            status:
                tools.has("conversation.respond") && speechAvailable && semanticModelReady
                    ? "READY"
                    : tools.has("conversation.respond") || semanticModelReady
                        ? "PARTIAL"
                        : "NOT_AVAILABLE",
            reason: semanticModelReady
                ? speechAvailable
                    ? "Conversacion semantica real y salida de voz verificadas."
                    : "El modelo semantico respondio; falta salida de voz verificable."
                : "La herramienta existe, pero el modelo semantico aun no produjo evidencia real en esta sesion.",
            evidence: {
                conversationTool: tools.has("conversation.respond"),
                speechSynthesis: speechAvailable,
                semanticModelVerified: semanticModelReady,
                planner: semanticPlannerHealth,
                conversation: semanticConversationHealth
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
            status: bridgeReady && hasEvery(tools, ["media.analyze", "document.create", "document.pdf"])
                ? "READY"
                : hasNamespace(tools, ["media", "document"])
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: bridgeReady && hasEvery(tools, ["media.analyze", "document.create", "document.pdf"])
                ? "Analisis y creacion documental conectados al bridge verificado."
                : "La cobertura documental esta incompleta o el bridge no esta verificado.",
            evidence: {
                extractedContentAnalysis: tools.has("media.analyze"),
                documentCreation: tools.has("document.create"),
                pdfRendering: tools.has("document.pdf"),
                bridgeReady
            }
        },
        {
            id: "daily_supervision",
            ...dailySupervision
        },
        {
            id: "browser_control",
            status: bridgeReady && bridge?.actuators?.browser?.available === true && hasEvery(tools, ["browser.inspect", "browser.screenshot", "browser.open"])
                ? "READY"
                : hasNamespace(tools, ["browser", "chrome"])
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: bridgeReady && bridge?.actuators?.browser?.available === true
                ? "Chrome/Edge y sus actuadores estan verificados por el bridge local."
                : "El actuador esta registrado, pero no verifico un navegador local ejecutable.",
            evidence: {
                actuatorRegistered: hasNamespace(tools, ["browser", "chrome"]),
                browserAvailable: bridge?.actuators?.browser?.available === true,
                engine: bridge?.actuators?.browser?.engine || null,
                bridgeReady
            }
        },
        {
            id: "web_research",
            ...webResearch
        },
        {
            id: "image_generation",
            status: imageHealth?.ok === true
                ? "READY"
                : hasNamespace(tools, ["image", "imagegen"])
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: imageHealth?.ok === true
                ? "La generacion de imagen produjo una salida real verificada."
                : imageCredentialInvalid
                    ? "Google rechazo la credencial GEMINI_KEY configurada; el actuador funciona, pero no puede generar hasta reemplazarla."
                : hasNamespace(tools, ["image", "imagegen"])
                    ? "El actuador esta registrado; falta una generacion real en esta sesion."
                    : "No hay generador o editor de imagenes registrado.",
            evidence: {
                actuatorRegistered: hasNamespace(tools, ["image", "imagegen"]),
                verified: imageHealth?.ok === true,
                lastStatus: imageHealth?.status || "NOT_TESTED",
                credentialInvalid: imageCredentialInvalid
            }
        },
        {
            id: "connectors_and_multi_agent",
            status: connectorsReady
                ? "READY"
                : hasNamespace(tools, ["connector", "agent", "mail", "calendar"])
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: connectorsReady
                ? "GitHub y Firebase estan verificados; la delegacion paralela tambien esta disponible."
                : hasNamespace(tools, ["connector", "agent", "mail", "calendar"])
                ? "La delegacion paralela esta disponible; no hay conectores externos autenticados."
                : "No hay conectores externos ni delegacion multiagente registrados.",
            evidence: {
                connectorsRegistered: hasNamespace(tools, ["connector", "mail", "calendar"]),
                agentDelegationRegistered: hasNamespace(tools, ["agent"]),
                connectedCount: Number(connectorHealth?.connectedCount || 0),
                verified: connectorHealth?.ok === true
            }
        }
    ];

    for (const capability of capabilities) {
        capability.label =
            CAPABILITY_LABELS[capability.id] ||
            capability.id;
    }

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
        daily_supervision: "Validar una ejecucion diaria persistida del supervisor.",
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
        priorities: capabilities
            .filter(capability =>
                gapIds.has(capability.id)
            )
            .map(capability =>
                capability.nextAction ||
                priorityByCapability[capability.id]
            )
            .filter(Boolean),
        runtime: {
            registeredTools: tools.size,
            tools: [...tools].sort(),
            bridge
        },
        readOnly: true,
        checkedAt: new Date().toISOString()
    };
}

const LOCAL_SUPERVISION_PROBES = [
    {
        id: "login_central_router",
        path: "/app-login.js",
        markers: ["FirebaseCore.verificarYRedireccionar"]
    },
    {
        id: "canonical_role_router",
        path: "/firebase.js",
        markers: [
            "resolveGestiaRouteDecision",
            "[ROLE_AUTHORITY_REDIRECT]",
            "window.location.replace"
        ]
    },
    {
        id: "technical_intent_priority",
        path: "/gestia-core/jarvis/jarvis.multifunction.planner.js",
        markers: [
            "3.0.0-model-semantic-planner",
            "jarvisSemanticPlan",
            "trustedPlanCalls"
        ]
    },
    {
        id: "runtime_health_module",
        path: "/runtime-health.js",
        markers: ["runtimeLatency", "getRuntimeHealthSnapshot"]
    },
    {
        id: "grounded_web_research",
        path: "/gestia-core/jarvis/jarvis.multitool.pack.js",
        markers: [
            "web.research",
            "JARVIS_GROUNDED_WEB_RESEARCH",
            "jarvisWebResearch"
        ]
    }
];

async function runLocalDailySupervision() {
    const checks = await Promise.all(
        LOCAL_SUPERVISION_PROBES.map(
            async probe => {
                try {
                    const response = await fetch(
                        probe.path,
                        {
                            cache: "no-store"
                        }
                    );
                    const body =
                        await response.text();
                    const missingMarkers =
                        probe.markers.filter(marker =>
                            !body.includes(marker)
                        );

                    return {
                        id: probe.id,
                        path: probe.path,
                        ok:
                            response.ok &&
                            missingMarkers.length === 0,
                        httpStatus:
                            response.status,
                        missingMarkers
                    };
                }
                catch(error) {
                    return {
                        id: probe.id,
                        path: probe.path,
                        ok: false,
                        httpStatus: null,
                        missingMarkers: [],
                        error:
                            error?.message ||
                            String(error)
                    };
                }
            }
        )
    );

    const failed = checks.filter(check => !check.ok);
    const score = Math.max(0, 100 - (failed.length * 25));
    const authRoutingFailed = failed.some(check =>
        ["login_central_router", "canonical_role_router"].includes(check.id)
    );
    const failureDomains = [
        ...(authRoutingFailed ? ["auth_routing"] : []),
        ...(failed.some(check => check.id === "technical_intent_priority") ? ["jarvis_cognition"] : []),
        ...(failed.some(check => check.id === "runtime_health_module") ? ["runtime_health"] : []),
        ...(failed.some(check => check.id === "grounded_web_research") ? ["web_research"] : [])
    ];
    const recommendations = [
        ...(authRoutingFailed
            ? ["Revisar role-authority, app-login y firebase.js antes de validar redirecciones por rol."]
            : []),
        ...(failureDomains.includes("jarvis_cognition")
            ? ["Probar una orden real en Terminal y confirmar router, respuesta final y consola sin errores."]
            : []),
        ...(failureDomains.includes("runtime_health")
            ? ["Revisar runtime-health y latencia de modulos antes de declarar el sistema estable."]
            : []),
        ...(failureDomains.includes("web_research")
            ? ["Probar web.research y confirmar una respuesta sustentada con fuentes verificables."]
            : [])
    ];

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
        failureDomains,
        recommendations,
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

async function fetchDailySupervisionStatus({
    timeoutMs = SUPERVISION_CLOUD_TIMEOUT_MS
} = {}) {
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
    const boundedTimeoutMs = Math.min(
        10000,
        Math.max(
            1000,
            Number(timeoutMs) ||
                SUPERVISION_CLOUD_TIMEOUT_MS
        )
    );
    const controller =
        typeof AbortController !== "undefined"
            ? new AbortController()
            : null;
    const timeoutId = setTimeout(
        () => controller?.abort(),
        boundedTimeoutMs
    );

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
                body: JSON.stringify({ data: {} }),
                ...(controller
                    ? { signal: controller.signal }
                    : {})
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
        const timedOut =
            controller?.signal?.aborted === true;

        return {
            ...localStatus,
            cloudReportAvailable: false,
            cloudError: timedOut
                ? `SUPERVISION_STATUS_TIMEOUT_${boundedTimeoutMs}MS`
                : error?.message || String(error),
            message: "Supervisión local completada; el reporte cloud no estuvo disponible. Revisa cloudError para conocer la causa."
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchGroundedWebResearch(
    query = ""
) {
    const user =
        globalThis?.auth?.currentUser ||
        globalThis?.window?.auth?.currentUser ||
        null;
    const normalizedQuery =
        String(query || "")
            .replace(/^\s*(jarvis|heberto|gestia)\s*[,;:-]?\s*/i, "")
            .replace(/^\s*(investiga|investigar|busca|buscar|consulta|consultar|averigua|averiguar|verifica|verificar)\s+(?:en\s+)?(?:la\s+)?(?:web|internet|google)?\s*(?:con\s+)?(?:fuentes?)?(?:\s+(?:oficiales|verificables|confiables))?\s*/i, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 600);

    if (!user) {
        return {
            ok: false,
            error: "AUTH_REQUIRED",
            message: "Necesito una sesion valida para investigar en la web."
        };
    }

    if (normalizedQuery.length < 5) {
        return {
            ok: false,
            error: "WEB_RESEARCH_QUERY_REQUIRED",
            message: "Dime que tema debo investigar en la web."
        };
    }

    try {
        const token =
            await user.getIdToken();
        const response = await fetch(
            "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisWebResearch",
            {
                method: "POST",
                headers: {
                    "Authorization":
                        `Bearer ${token}`,
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    data: {
                        query:
                            normalizedQuery
                    }
                })
            }
        );
        const payload =
            await response.json();
        const result =
            payload?.result ||
            payload?.data ||
            null;

        if (
            !response.ok ||
            !result?.grounded ||
            !Array.isArray(result?.sources) ||
            result.sources.length === 0
        ) {
            throw new Error(
                payload?.error?.message ||
                `WEB_RESEARCH_HTTP_${response.status}`
            );
        }

        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = {
            ok: true,
            grounded: true,
            status: "GROUNDED",
            sourceCount:
                result.sources.length,
            checkedAt:
                new Date().toISOString()
        };

        return {
            ...result,
            source:
                "JARVIS_GROUNDED_WEB_RESEARCH",
            readOnly: true
        };
    }
    catch(error) {
        const message =
            error?.message ||
            "La investigacion web no estuvo disponible.";

        if (typeof globalThis?.JarvisLocalBridge?.requestJson === "function") {
            const localResult =
                await globalThis.JarvisLocalBridge.requestJson(
                    "/research",
                    {
                        query: normalizedQuery,
                        timeoutMs: 20000
                    },
                    {
                        timeoutMs: 25000
                    }
                );

            if (
                localResult?.ok === true &&
                localResult?.grounded === true &&
                Array.isArray(localResult?.sources) &&
                localResult.sources.length > 0
            ) {
                globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = {
                    ok: true,
                    grounded: true,
                    status: "GROUNDED_LOCAL_FALLBACK",
                    sourceCount: localResult.sources.length,
                    checkedAt: new Date().toISOString()
                };

                return {
                    ...localResult,
                    cloudError: message,
                    source: "JARVIS_LOCAL_GROUNDED_WEB_RESEARCH",
                    readOnly: true
                };
            }
        }

        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = {
            ok: false,
            grounded: false,
            status: "FAILED",
            sourceCount: 0,
            message,
            checkedAt:
                new Date().toISOString()
        };

        return {
            ok: false,
            error:
                "WEB_RESEARCH_UNAVAILABLE",
            message:
                message,
            query:
                normalizedQuery,
            grounded: false,
            sources: [],
            readOnly: true
        };
    }
}

async function fetchSemanticConversation(instruction = "") {
    const user = globalThis?.auth?.currentUser || globalThis?.window?.auth?.currentUser || null;
    if (!user) {
        const result = { ok: false, status: "AUTH_REQUIRED", error: "AUTH_REQUIRED" };
        globalThis.__JARVIS_SEMANTIC_CONVERSATION_HEALTH__ = {
            ...result,
            checkedAt: new Date().toISOString()
        };
        return result;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);

    try {
        const token = await user.getIdToken();
        const response = await fetch(
            "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisSemanticRespond",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ data: { input: instruction } }),
                signal: controller.signal
            }
        );
        const text = await response.text();
        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            const result = { ok: false, status: "INVALID_MODEL_RESPONSE", error: `HTTP_${response.status}` };
            globalThis.__JARVIS_SEMANTIC_CONVERSATION_HEALTH__ = {
                ...result,
                checkedAt: new Date().toISOString()
            };
            return result;
        }
        const result = payload?.result || payload?.data;
        if (!response.ok || !result?.ok || !result?.message) {
            const failure = {
                ok: false,
                status: "SEMANTIC_CONVERSATION_UNAVAILABLE",
                error: payload?.error?.message || result?.error || `HTTP_${response.status}`
            };
            globalThis.__JARVIS_SEMANTIC_CONVERSATION_HEALTH__ = {
                ...failure,
                checkedAt: new Date().toISOString()
            };
            return failure;
        }
        globalThis.__JARVIS_SEMANTIC_CONVERSATION_HEALTH__ = {
            ok: true,
            status: result.status,
            provider: result.provider,
            model: result.model,
            checkedAt: new Date().toISOString()
        };
        return result;
    } catch (error) {
        const failure = {
            ok: false,
            status: "SEMANTIC_CONVERSATION_UNAVAILABLE",
            error: error?.message || String(error),
            checkedAt: new Date().toISOString()
        };
        globalThis.__JARVIS_SEMANTIC_CONVERSATION_HEALTH__ = failure;
        return failure;
    } finally {
        clearTimeout(timer);
    }
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
            description: "Responde conversación y preguntas mediante un modelo semántico real sin frases prefabricadas.",
            output: "SIA7_CONVERSATION_RESPONSE",
            inputSchema: {
                prompt: "string"
            },
            execute: async (args = {}, context = {}) => {
                const instruction =
                    resolveInstruction(args, context);

                const result = await fetchSemanticConversation(instruction);
                return {
                    ...result,
                    instruction,
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
            execute: async (args = {}) =>
                await fetchDailySupervisionStatus(args)
        }),
        register(runtime, {
            name: "web.research",
            description: "Investiga informacion actual en Google Search y devuelve una respuesta sustentada con fuentes estructuradas.",
            output: "SIA7_GROUNDED_WEB_RESEARCH",
            inputSchema: {
                query: "string",
                prompt: "string"
            },
            execute: async (args = {}, context = {}) =>
                await fetchGroundedWebResearch(
                    args.query ||
                    args.prompt ||
                    context.rawInput ||
                    ""
                )
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
            "web.research",
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
            "media",
            "web"
        ],
        readOnlyByDefault: true,
        derivedWritesRequireApproval: true
    };
}
