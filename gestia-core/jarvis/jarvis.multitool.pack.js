import {
    planMarketingRequest
} from "./jarvis.marketing.engine.js?v=sia7-marketing-v9-verified-source-priority-20260715";

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

import {
    readCapabilityEvidence,
    recordCapabilityEvidence
} from "./jarvis.capability.evidence.js";

import {
    completeJarvisPlanningArguments
} from "./jarvis.multifunction.planner.js?v=sia7-grounded-deliverable-arguments-20260724";

const VERSION = "1.25.0-grounded-deliverable-arguments";
const SUPERVISION_CLOUD_TIMEOUT_MS = 4500;
const FORENSICS_SUPERVISION_TIMEOUT_MS = 1500;

const MARKETING_ARGUMENT_SCHEMA = {
    type: "object",
    properties: {
        prompt: { type: "string" },
        brandName: { type: "string" },
        audience: { type: "string" },
        offer: { type: "string" },
        pain: { type: "string" },
        promise: { type: "string" },
        differentiator: { type: "string" },
        tone: { type: "string" },
        cta: { type: "string" },
        assets: { type: "array", items: { type: "string" } },
        channels: { type: "array", items: { type: "string" } },
        services: { type: "array", items: { type: "object", additionalProperties: true } },
        testimonials: { type: "array", items: { type: "object", additionalProperties: true } },
        photographs: { type: "array", items: { type: "object", additionalProperties: true } },
        documents: { type: "array", items: { type: "object", additionalProperties: true } },
        repoEvidence: { type: "array", items: { type: "object", additionalProperties: true } },
        webResearch: { type: "array", items: { type: "object", additionalProperties: true } },
        landing: { type: "object", additionalProperties: true },
        hashtags: { type: "array", items: { type: "string" } },
        metrics: { type: "array", items: { type: "string" } },
        market: { type: "string" },
        campaignName: { type: "string" },
        campaignObjective: { type: "string" },
        durationSeconds: { type: "number" }
    },
    additionalProperties: false
};

const PAGE_ARGUMENT_SCHEMA = {
    type: "object",
    properties: {
        prompt: { type: "string" },
        pageName: { type: "string" },
        brandName: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        style: { type: "string" },
        sections: { type: "array", items: { type: "string" } }
    },
    required: ["pageName", "brandName", "title", "description", "sections"],
    additionalProperties: false
};

const IMAGE_PLAN_ARGUMENT_SCHEMA = {
    type: "object",
    properties: {
        brandName: { type: "string" },
        campaignGoal: { type: "string" },
        audience: { type: "string" },
        concepts: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    purpose: { type: "string" },
                    composition: { type: "string" },
                    grounding: { type: "string" },
                    generationPrompt: { type: "string" },
                    exclusionPrompt: { type: "string" },
                    aspectRatios: { type: "array", items: { type: "string" } }
                },
                required: ["name", "purpose", "composition", "grounding", "generationPrompt", "aspectRatios"]
            }
        }
    },
    required: ["brandName", "campaignGoal", "concepts"],
    additionalProperties: false
};

const REEL_PLAN_ARGUMENT_SCHEMA = {
    type: "object",
    properties: {
        brandName: { type: "string" },
        title: { type: "string" },
        cta: { type: "string" },
        durationSeconds: { type: "number" },
        scenes: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    durationSeconds: { type: "number" },
                    visual: { type: "string" },
                    overlay: { type: "string" },
                    voiceover: { type: "string" },
                    evidence: { type: "string" },
                    transition: { type: "string" }
                },
                required: ["durationSeconds", "visual", "overlay", "voiceover", "evidence"]
            }
        }
    },
    required: ["brandName", "title", "cta", "durationSeconds", "scenes"],
    additionalProperties: false
};

const CAPABILITY_WEIGHTS = {
    READY: 1,
    PARTIAL: 0.5,
    NOT_AVAILABLE: 0
};

const CAPABILITY_LABELS = {
    repo_engineering: "Ingenieria del repositorio",
    chief_architect: "Chief Architect V7",
    one_time_write_authorization: "Autorizacion de escritura de un solo uso",
    tests_and_git: "Pruebas y Git",
    conversation_and_voice: "Conversacion y voz",
    business_and_marketing: "Negocio, marketing y paginas",
    marketing_production: "Marketing basado en evidencia",
    page_production: "Produccion real de paginas",
    media_and_documents: "Documentos y medios",
    professional_pdf_editing: "Edicion profesional de PDF",
    structured_document_editing: "Edicion de documentos estructurados",
    persistent_cases: "Expedientes persistentes",
    reel_video_production: "Produccion de reels y video",
    multimodal_inputs: "Recepcion multimodal de archivos",
    daily_supervision: "Supervision diaria",
    browser_control: "Control del navegador",
    web_research: "Investigacion web con fuentes",
    image_generation: "Generacion y edicion de imagenes",
    artifact_studio: "Artefactos versionados",
    observability: "Observabilidad funcional",
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
        globalThis?.__JARVIS_WEB_RESEARCH_HEALTH__ ||
        readCapabilityEvidence("web_research") ||
        null;
    const verified =
        actuatorRegistered &&
        health?.ok === true &&
        health?.grounded === true &&
        Number(health?.sourceCount || 0) > 0 &&
        Number(health?.factCount || 0) > 0;

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
                factCount:
                    health.factCount,
                checkedAt:
                    health.checkedAt || null
            }
        };
    }

    if (actuatorRegistered) {
        const credentialMissing =
            String(health?.message || "")
                .toLowerCase()
                .includes("credencial gemini");

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
        globalThis?.__JARVIS_SEMANTIC_CONVERSATION_HEALTH__ ||
        readCapabilityEvidence("semantic_conversation") ||
        null;
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
            "repo.graph",
            "repo.rankCandidates",
            "repo.prepareWrite",
            "repo.authorizeWrite",
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
        globalThis?.__JARVIS_IMAGE_GENERATION_HEALTH__ ||
        readCapabilityEvidence("image_generation") ||
        (
            Number(bridge?.actuators?.imageGeneration?.verifiedCount || 0) > 0
                ? {
                    ok: true,
                    status: "PERSISTED_ARTIFACT_VERIFIED",
                    output: bridge.actuators.imageGeneration.latest?.name || null,
                    checkedAt: bridge.actuators.imageGeneration.latest?.updatedAt || null,
                    evidenceSource: "LOCAL_BRIDGE_ARTIFACT_SCAN"
                }
                : null
        ) ||
        null;
    const imageEditingHealth = readCapabilityEvidence("image_editing") || null;
    const imageError = String(imageHealth?.error || "");
    const imageCredentialInvalid =
        imageError.toLowerCase().includes("api key not valid") ||
        imageError.includes("API_KEY_INVALID");
    const connectorHealth =
        globalThis?.__JARVIS_CONNECTOR_HEALTH__ ||
        readCapabilityEvidence("connectors") ||
        null;
    const multimodalHealth =
        globalThis?.__JARVIS_MULTIMODAL_HEALTH__ ||
        readCapabilityEvidence("multimodal_inputs") ||
        (
            Number(bridge?.actuators?.multimodalUploads?.verifiedCount || 0) > 0
                ? {
                    ok: true,
                    status: "PERSISTED_UPLOAD_VERIFIED",
                    receivedFiles: bridge.actuators.multimodalUploads.verifiedCount,
                    lastOutput: bridge.actuators.multimodalUploads.latest?.name || null,
                    checkedAt: bridge.actuators.multimodalUploads.latest?.updatedAt || null,
                    evidenceSource: "LOCAL_BRIDGE_ARTIFACT_SCAN"
                }
                : null
        ) ||
        null;
    const pdfEditingHealth = readCapabilityEvidence("pdf_editing") || null;
    const structuredDocumentHealth = readCapabilityEvidence("structured_document_editing") || null;
    const persistentCaseHealth = readCapabilityEvidence("persistent_cases") || null;
    const reelVideoHealth = readCapabilityEvidence("reel_video") || null;
    const reelStudioHealth = readCapabilityEvidence("reel_studio") || null;
    const chiefArchitectHealth = globalThis?.__JARVIS_CHIEF_ARCHITECT_HEALTH__ || null;
    const oneTimeWriteHealth = globalThis?.__JARVIS_ONE_TIME_WRITE_HEALTH__ || null;
    const mediaAnalysisHealth = globalThis?.__JARVIS_MEDIA_ANALYSIS_HEALTH__ || readCapabilityEvidence("media_analysis") || null;
    const pageCreationHealth = readCapabilityEvidence("page_creation") || null;
    const marketingProductionHealth = readCapabilityEvidence("marketing_production") || null;
    const observabilityHealth = readCapabilityEvidence("observability") || null;
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
                requiredTools: ["repo.read", "repo.grep", "repo.diagnose", "repo.graph", "repo.rankCandidates", "repo.prepareWrite", "repo.authorizeWrite", "repo.write"]
            }
        },
        {
            id: "chief_architect",
            status: tools.has("repo.architectReview") && chiefArchitectHealth?.ok === true
                ? "READY"
                : tools.has("repo.architectReview")
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: tools.has("repo.architectReview") && chiefArchitectHealth?.ok === true
                ? "Un plan real supero la revision arquitectonica sin recibir autorizacion automatica."
                : tools.has("repo.architectReview")
                    ? "El revisor arquitectonico esta conectado; falta verificar un plan real completo antes de solicitar aprobacion humana."
                    : "No existe un supervisor arquitectonico conectado al flujo de planes.",
            nextAction: "Revisar un plan real con causa raiz, alcance, grafo, ranking, pruebas, seguridad y autoridad.",
            evidence: {
                toolRegistered: tools.has("repo.architectReview"),
                verifiedReview: chiefArchitectHealth?.ok === true,
                health: chiefArchitectHealth
            }
        },
        {
            id: "one_time_write_authorization",
            status: hasEvery(tools, ["repo.prepareWrite", "repo.authorizeWrite", "repo.write"]) && oneTimeWriteHealth?.ok === true
                ? "READY"
                : hasEvery(tools, ["repo.prepareWrite", "repo.authorizeWrite", "repo.write"])
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: oneTimeWriteHealth?.ok === true
                ? "Una escritura real consumio una autorizacion una sola vez y paso verificacion posterior."
                : tools.has("repo.prepareWrite")
                    ? "El protocolo fingerprint/nonce/snapshot esta conectado; falta una ejecucion viva aprobada y verificada."
                    : "La escritura aun no dispone del protocolo completo de autorizacion de un solo uso.",
            nextAction: "Preparar un patch real, aprobar su fingerprint exacto, consumirlo una vez y comprobar que el replay queda bloqueado.",
            evidence: {
                prepare: tools.has("repo.prepareWrite"),
                authorize: tools.has("repo.authorizeWrite"),
                consume: tools.has("repo.write"),
                verifiedExecution: oneTimeWriteHealth?.ok === true,
                health: oneTimeWriteHealth
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
            id: "page_production",
            status: tools.has("page.create") && pageCreationHealth?.ok === true
                ? "READY"
                : tools.has("page.create")
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: pageCreationHealth?.ok === true
                ? "Una pagina HTML real paso checks responsive, accesibilidad, SEO y se genero como artefacto descargable."
                : tools.has("page.create")
                    ? "El generador de paginas reales esta conectado; falta verificar una creacion viva desde Jarvis."
                    : "Solo existe planificacion de pagina, sin actuador de produccion.",
            nextAction: "Crear una landing real con contenido completo, previsualizarla y descargar el HTML verificado.",
            evidence: {
                actuatorRegistered: tools.has("page.create"),
                verifiedExecution: pageCreationHealth?.ok === true,
                health: pageCreationHealth
            }
        },
        {
            id: "marketing_production",
            status: tools.has("marketing.plan") && marketingProductionHealth?.ok === true
                ? "READY"
                : tools.has("marketing.plan")
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: marketingProductionHealth?.ok === true
                ? "Marketing V7 produjo una campaña específica usando fuentes de evidencia declaradas."
                : tools.has("marketing.plan")
                    ? "El motor evita regex e invenciones; falta ejecutar una campaña con campos semánticos y evidencia real."
                    : "El motor de marketing no está registrado.",
            nextAction: "Producir una campaña desde servicios, testimonios, fotografías, documentos o investigación verificable.",
            evidence: {
                plannerRegistered: tools.has("marketing.plan"),
                verifiedExecution: marketingProductionHealth?.ok === true,
                health: marketingProductionHealth
            }
        },
        {
            id: "media_and_documents",
            status: bridgeReady && hasEvery(tools, ["media.analyze", "document.create", "document.pdf"]) && mediaAnalysisHealth?.ok === true
                ? "READY"
                : hasNamespace(tools, ["media", "document"])
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: mediaAnalysisHealth?.ok === true
                ? "Analisis visual/documental real con evidencia e incertidumbre, mas creacion documental conectada."
                : "Las herramientas existen, pero falta verificar un analisis visual o PDF real sin contenido inventado.",
            evidence: {
                extractedContentAnalysis: tools.has("media.analyze"),
                documentCreation: tools.has("document.create"),
                pdfRendering: tools.has("document.pdf"),
                bridgeReady,
                verifiedAnalysis: mediaAnalysisHealth?.ok === true,
                health: mediaAnalysisHealth
            }
        },
        {
            id: "professional_pdf_editing",
            status: tools.has("document.pdf.edit") && pdfEditingHealth?.ok === true
                ? "READY"
                : tools.has("document.pdf.edit")
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: tools.has("document.pdf.edit") && pdfEditingHealth?.ok === true
                ? "Una edicion de PDF real produjo artefacto nuevo y evidencia visual verificada."
                : tools.has("document.pdf.edit")
                    ? "Existe un editor real, pero falta verificar fidelidad visual sobre un PDF del usuario."
                    : "No existe todavia un actuador conectado para editar un PDF existente conservando su formato.",
            nextAction: "Editar una cotizacion PDF real, recalcular valores, comparar paginas y verificar desbordamientos.",
            evidence: {
                actuatorRegistered: tools.has("document.pdf.edit"),
                verifiedExecution: pdfEditingHealth?.ok === true,
                health: pdfEditingHealth
            }
        },
        {
            id: "structured_document_editing",
            status: tools.has("document.xlsx.edit") && structuredDocumentHealth?.ok === true
                ? "READY"
                : tools.has("document.xlsx.edit")
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: tools.has("document.xlsx.edit") && structuredDocumentHealth?.ok === true
                ? "Una edicion XLSX real con original intacto, hashes y cambios exactos fue verificada."
                : tools.has("document.xlsx.edit")
                    ? "El editor XLSX nativo esta conectado; falta ejecutar una edicion viva desde Jarvis."
                    : "No existe un actuador conectado para editar documentos estructurados existentes.",
            nextAction: "Editar un XLSX real y verificar hojas, formulas, estilos, hash y archivo descargable.",
            evidence: {
                xlsxEditorRegistered: tools.has("document.xlsx.edit"),
                verifiedExecution: structuredDocumentHealth?.ok === true,
                health: structuredDocumentHealth
            }
        },
        {
            id: "persistent_cases",
            status: persistentCaseHealth?.ok === true
                ? "READY"
                : bridgeReady && multimodalHealth?.ok === true
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: persistentCaseHealth?.ok === true
                ? "Un expediente recuperable con caseId, objectiveId e instruccion original inmutable fue verificado."
                : "El ledger esta conectado al compositor, pero falta una carga viva que pruebe recuperacion del expediente.",
            nextAction: "Adjuntar un archivo, recargar la Terminal y comprobar que el mismo caseId y objectiveId se recuperan.",
            evidence: {
                verifiedExecution: persistentCaseHealth?.ok === true,
                health: persistentCaseHealth
            }
        },
        {
            id: "reel_video_production",
            status: reelVideoHealth?.ok === true
                ? "READY"
                : hasEvery(tools, ["marketing.plan", "reel.create", "browser.open"])
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: reelVideoHealth?.ok === true
                ? "Un reel de 30 o 45 segundos fue exportado como artefacto descargable y verificado."
                : reelStudioHealth?.ok === true
                    ? "Jarvis creó un Reel Studio específico y verificó su preview/exportador; falta completar un WebM y registrar su hash."
                    : "El actuador de Reel Studio está conectado; falta crear un estudio y después exportar un WebM completo.",
            nextAction: "Exportar un reel completo de 30 segundos y registrar hash, duracion, formato y artefacto.",
            evidence: {
                planning: tools.has("marketing.plan"),
                studioActuator: tools.has("reel.create"),
                studioHealth: reelStudioHealth,
                browser: tools.has("browser.open"),
                verifiedExecution: reelVideoHealth?.ok === true,
                health: reelVideoHealth
            }
        },
        {
            id: "multimodal_inputs",
            status: bridgeReady && multimodalHealth?.ok === true
                ? "READY"
                : bridgeReady && tools.has("media.analyze")
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: bridgeReady && multimodalHealth?.ok === true
                ? `Carga multimodal verificada con ${Number(multimodalHealth.receivedFiles || 1)} archivo(s) real(es).`
                : "El canal multimodal existe, pero falta recibir y persistir un archivo real en esta sesion.",
            nextAction: bridgeReady && multimodalHealth?.ok === true
                ? null
                : "Adjuntar un archivo desde el boton mas y comprobar su persistencia local.",
            evidence: {
                bridgeReady,
                mediaTool: tools.has("media.analyze"),
                uploadVerified: multimodalHealth?.ok === true,
                health: multimodalHealth
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
            status: imageHealth?.ok === true && imageEditingHealth?.ok === true
                ? "READY"
                : hasEvery(tools, ["image.generate", "image.edit"])
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: imageHealth?.ok === true && imageEditingHealth?.ok === true
                ? "Generación y edición produjeron outputs reales, descargables y trazables al archivo fuente."
                : imageCredentialInvalid
                    ? "Google rechazo la credencial GEMINI_KEY configurada; el actuador funciona, pero no puede generar hasta reemplazarla."
                : imageHealth?.ok === true && tools.has("image.edit")
                    ? "La generación está verificada y el editor está conectado; falta una edición real que preserve el original."
                : hasNamespace(tools, ["image", "imagegen"])
                    ? "Los actuadores están registrados; faltan ejecuciones reales verificadas."
                    : "No hay generador o editor de imagenes registrado.",
            evidence: {
                actuatorRegistered: hasNamespace(tools, ["image", "imagegen"]),
                generationVerified: imageHealth?.ok === true,
                editingActuator: tools.has("image.edit"),
                editingVerified: imageEditingHealth?.ok === true,
                editingHealth: imageEditingHealth,
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
        },
        {
            id: "artifact_studio",
            status: bridgeReady && hasEvery(tools, ["artifact.list", "artifact.read"]) && Number(bridge?.actuators?.artifactStudio?.registeredCount || 0) > 0
                ? "READY"
                : hasEvery(tools, ["artifact.list", "artifact.read"])
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: bridgeReady && Number(bridge?.actuators?.artifactStudio?.registeredCount || 0) > 0
                ? `El ledger contiene ${Number(bridge.actuators.artifactStudio.registeredCount)} artefactos versionados y verificables.`
                : "El ledger y sus herramientas read-only están conectados; falta registrar un artefacto vivo en esta sesión.",
            nextAction: "Crear un artefacto y verificar artifactId, versión, hash, objetivo, aprobación y relación con el original.",
            evidence: {
                listTool: tools.has("artifact.list"),
                readTool: tools.has("artifact.read"),
                bridgeReady,
                registeredCount: Number(bridge?.actuators?.artifactStudio?.registeredCount || 0),
                latest: bridge?.actuators?.artifactStudio?.latest || null
            }
        },
        {
            id: "observability",
            status: tools.has("system.observability") && observabilityHealth?.ok === true
                ? "READY"
                : tools.has("system.observability")
                    ? "PARTIAL"
                    : "NOT_AVAILABLE",
            reason: observabilityHealth?.ok === true
                ? `La última consulta consolidó ${Number(observabilityHealth.counts?.total || 0)} eventos funcionales.`
                : "El colector está conectado, pero falta consultar eventos funcionales reales; importar módulos no cuenta como ONLINE.",
            nextAction: "Consultar system.observability después de ejecutar writes, artefactos, uploads, búsquedas y producción.",
            evidence: {
                toolRegistered: tools.has("system.observability"),
                verifiedExecution: observabilityHealth?.ok === true,
                health: observabilityHealth
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
        professional_pdf_editing: "Conectar y verificar edicion profesional de PDF.",
        structured_document_editing: "Ejecutar y verificar una edicion XLSX real.",
        chief_architect: "Verificar un plan real completo con Chief Architect V7.",
        one_time_write_authorization: "Verificar una autorizacion fingerprint/nonce de un solo uso y su bloqueo de replay.",
        persistent_cases: "Verificar recuperacion viva de un expediente persistente.",
        reel_video_production: "Exportar y verificar un reel completo de 30 o 45 segundos.",
        daily_supervision: "Validar una ejecucion diaria persistida del supervisor.",
        browser_control: "Conectar un actuador de navegador verificable.",
        web_research: "Conectar investigacion web con fuentes y citas.",
        image_generation: "Conectar generacion y edicion de imagenes.",
        artifact_studio: "Registrar y verificar un artefacto en el ledger versionado.",
        observability: "Consultar y verificar el snapshot de eventos funcionales.",
        connectors_and_multi_agent: "Conectar integraciones externas y delegacion multiagente.",
        repo_engineering: "Restaurar bridge y herramientas de ingenieria del repo.",
        tests_and_git: "Restaurar ejecucion de pruebas y diagnostico Git.",
        conversation_and_voice: "Restaurar conversacion y salida de voz.",
        business_and_marketing: "Restaurar motores de negocio, marketing y paginas.",
        marketing_production: "Ejecutar Marketing V7 con evidencia real y verificar todos sus entregables.",
        page_production: "Crear y verificar una landing HTML real como artefacto descargable."
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

async function waitForAuthenticatedUser(timeoutMs = 6000) {
    const startedAt = Date.now();
    do {
        const user =
            globalThis?.auth?.currentUser ||
            globalThis?.window?.auth?.currentUser ||
            null;
        if (user) return user;
        await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() - startedAt < timeoutMs);
    return null;
}

async function fetchGroundedWebResearch(
    query = "",
    trace = {}
) {
    const user = await waitForAuthenticatedUser();
    const normalizedQuery =
        String(query || "")
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
                            normalizedQuery,
                        objectiveId: trace.objectiveId || "",
                        caseId: trace.caseId || "",
                        allowedDomain: trace.allowedDomain || ""
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

        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = recordCapabilityEvidence("web_research", {
            ok: true,
            grounded: true,
            status: "GROUNDED",
            sourceCount:
                result.sources.length,
            factCount: Array.isArray(result.facts) ? result.facts.length : 0,
            objectiveId: result.objectiveId || trace.objectiveId || null,
            caseId: result.caseId || trace.caseId || null,
            checkedAt:
                new Date().toISOString()
        });
        recordCapabilityEvidence("web_research_context", {
            ok: true,
            grounded: true,
            query: result.query || normalizedQuery,
            answer: String(result.answer || "").slice(0, 5000),
            sources: result.sources.slice(0, 8),
            facts: Array.isArray(result.facts) ? result.facts.slice(0, 24) : [],
            inferences: Array.isArray(result.inferences) ? result.inferences.slice(0, 8) : [],
            checkedAt: new Date().toISOString()
        });

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
                globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = recordCapabilityEvidence("web_research", {
                    ok: true,
                    grounded: true,
                    status: "GROUNDED_LOCAL_FALLBACK",
                    sourceCount: localResult.sources.length,
                    checkedAt: new Date().toISOString()
                });
                recordCapabilityEvidence("web_research_context", {
                    ok: true,
                    grounded: true,
                    query: localResult.query || normalizedQuery,
                    answer: String(localResult.answer || "").slice(0, 5000),
                    sources: localResult.sources.slice(0, 8),
                    checkedAt: new Date().toISOString()
                });

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

async function fetchGroundedMediaAnalysis(attachments = [], question = "") {
    const user = await waitForAuthenticatedUser();
    if (!user) return { ok: false, status: "AUTH_REQUIRED", error: "AUTH_REQUIRED" };
    if (typeof globalThis?.JarvisLocalBridge?.requestJson !== "function") {
        return { ok: false, status: "LOCAL_BRIDGE_REQUIRED", error: "LOCAL_BRIDGE_REQUIRED" };
    }
    const supported = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
    const files = [];
    let totalBytes = 0;
    for (const attachment of attachments.slice(0, 8)) {
        if (!attachment?.artifact || !supported.has(String(attachment.mimeType || "").toLowerCase())) continue;
        const payload = await globalThis.JarvisLocalBridge.requestJson(
            "/artifact/read",
            { output: attachment.artifact },
            { timeoutMs: 30000 }
        );
        if (payload?.ok !== true || !payload?.dataBase64 || Number(payload.bytes || 0) > 7 * 1024 * 1024) continue;
        if (totalBytes + Number(payload.bytes || 0) > 9 * 1024 * 1024) break;
        totalBytes += Number(payload.bytes || 0);
        files.push({
            name: attachment.name || payload.fileName || "archivo",
            mimeType: attachment.mimeType || payload.mimeType,
            dataBase64: payload.dataBase64
        });
    }
    if (files.length === 0) {
        return { ok: false, status: "READABLE_MEDIA_ARTIFACT_REQUIRED", error: "READABLE_MEDIA_ARTIFACT_REQUIRED" };
    }
    const token = await user.getIdToken();
    const response = await fetch(
        "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisMediaAnalyze",
        {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ data: { files, question: String(question || "").slice(0, 3000) } })
        }
    );
    const payload = await response.json();
    const result = payload?.result || payload?.data || null;
    if (!response.ok || result?.ok !== true || !Array.isArray(result?.sources)) {
        return { ok: false, status: "MEDIA_ANALYSIS_UNAVAILABLE", error: payload?.error?.message || `HTTP_${response.status}` };
    }
    globalThis.__JARVIS_MEDIA_ANALYSIS_HEALTH__ = recordCapabilityEvidence("media_analysis", {
        ok: true,
        status: result.status,
        sourceCount: result.sources.length,
        evidenceCount: result.sources.reduce((sum, source) => sum + (source.evidence?.length || 0), 0),
        checkedAt: new Date().toISOString()
    });
    return result;
}

async function fetchSemanticConversation(instruction = "") {
    const user = await waitForAuthenticatedUser();
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
        globalThis.__JARVIS_SEMANTIC_CONVERSATION_HEALTH__ = recordCapabilityEvidence("semantic_conversation", {
            ok: true,
            status: result.status,
            provider: result.provider,
            model: result.model,
            checkedAt: new Date().toISOString()
        });
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

function hasPlanningValue(value) {
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function mergeMissingPlanningArgs(currentArgs = {}, semanticArgs = {}) {
    const merged = {
        ...(currentArgs && typeof currentArgs === "object" ? currentArgs : {})
    };
    for (const [key, value] of Object.entries(semanticArgs || {})) {
        if (!hasPlanningValue(merged[key]) && hasPlanningValue(value)) {
            merged[key] = value;
        }
    }
    return merged;
}

async function completeGroundedToolArgs({
    toolName,
    description,
    inputSchema,
    args = {},
    context = {}
} = {}) {
    const sources = Array.isArray(context.validSources)
        ? context.validSources.filter(Boolean).slice(0, 12)
        : [];
    if (sources.length === 0) return null;
    const semantic = await completeJarvisPlanningArguments({
        toolName,
        description,
        inputSchema,
        instruction: resolveInstruction(args, context),
        currentArgs: args,
        validSources: sources,
        semanticPlanner:
            typeof context.semanticArgumentPlanner === "function"
                ? context.semanticArgumentPlanner
                : null
    });
    return {
        ...semantic,
        args: mergeMissingPlanningArgs(args, semantic.args)
    };
}

function recentGroundedBusinessContext() {
    const entry = globalThis?.JarvisToolMemory?.last?.("web.research") || null;
    const payload =
        entry?.data ||
        entry?.response?.data ||
        entry?.response ||
        readCapabilityEvidence("web_research_context") ||
        null;
    if (!payload || payload?.grounded !== true || !Array.isArray(payload?.sources)) return "";
    return JSON.stringify({
        query: payload.query || null,
        answer: String(payload.answer || "").slice(0, 520),
        sources: payload.sources.slice(0, 3).map(source => ({
            title: source?.title || "",
            url: source?.url || ""
        }))
    }).slice(0, 800);
}

function attachmentsFromInstruction(value = "") {
    const marker = "Archivos adjuntos reales entregados por el usuario:";
    const source = String(value || "");
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) return [];
    const jsonText = source.slice(markerIndex + marker.length).trim();
    try {
        const attachments = JSON.parse(jsonText);
        return Array.isArray(attachments) ? attachments.slice(0, 30) : [];
    } catch {
        return [];
    }
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

export function buildImageRequirementsPlan(args = {}, context = {}) {
    const authority = resolveAuthority(args, context);
    const brandName = clean(args.brandName);
    const campaignGoal = clean(args.campaignGoal || args.objective);
    const concepts = Array.isArray(args.concepts)
        ? args.concepts.filter(item => item && typeof item === "object").slice(0, 12)
        : [];
    const requirements = concepts.map((item, index) => ({
        id: index + 1,
        name: clean(item.name),
        purpose: clean(item.purpose),
        composition: clean(item.composition),
        grounding: clean(item.grounding || item.sourceGrounding),
        generationPrompt: clean(item.generationPrompt || item.prompt),
        exclusionPrompt: clean(item.exclusionPrompt || item.negativePrompt),
        aspectRatios: Array.isArray(item.aspectRatios)
            ? item.aspectRatios.map(value => clean(value)).filter(Boolean).slice(0, 6)
            : []
    }));
    const valid = Boolean(brandName && campaignGoal) && requirements.length > 0 && requirements.every(item =>
        item.name && item.purpose && item.composition && item.grounding && item.generationPrompt && item.aspectRatios.length > 0
    );
    return {
        ok: valid,
        status: valid ? "IMAGE_REQUIREMENTS_PLAN_READY" : "IMAGE_REQUIREMENTS_EVIDENCE_REQUIRED",
        brandName,
        campaignGoal,
        audience: clean(args.audience),
        requirements,
        missingInformation: valid ? [] : ["brandName", "campaignGoal", "grounded image concepts"],
        trace: authority,
        generatedImages: false,
        readOnly: true,
        writeAllowed: false
    };
}

export function buildReelPlanningSpec(args = {}, context = {}) {
    const authority = resolveAuthority(args, context);
    const brandName = clean(args.brandName);
    const title = clean(args.title);
    const cta = clean(args.cta);
    const durationSeconds = Number(args.durationSeconds);
    const scenes = Array.isArray(args.scenes)
        ? args.scenes.filter(item => item && typeof item === "object").slice(0, 18).map((item, index) => ({
            id: index + 1,
            durationSeconds: Number(item.durationSeconds),
            visual: clean(item.visual || item.visualDescription),
            overlay: clean(item.overlay),
            voiceover: clean(item.voiceover || item.narration),
            evidence: clean(item.evidence || item.sourceGrounding),
            transition: clean(item.transition)
        }))
        : [];
    const timelineSeconds = scenes.reduce((sum, item) => sum + (Number.isFinite(item.durationSeconds) ? item.durationSeconds : 0), 0);
    const valid = Boolean(brandName && title && cta) && Number.isFinite(durationSeconds) && durationSeconds >= 15 && durationSeconds <= 180 &&
        scenes.length >= 3 && Math.abs(timelineSeconds - durationSeconds) <= 0.01 &&
        scenes.every(item => item.durationSeconds > 0 && item.visual && item.overlay && item.voiceover && item.evidence);
    return {
        ok: valid,
        status: valid ? "REEL_PLAN_READY" : "REEL_PLAN_EVIDENCE_REQUIRED",
        brandName,
        title,
        cta,
        durationSeconds,
        format: { width: 1080, height: 1920, aspectRatio: "9:16" },
        scenes,
        timelineSeconds,
        missingInformation: valid ? [] : ["brand content", "grounded scenes", "exact duration"],
        trace: authority,
        producedVideo: false,
        readOnly: true,
        writeAllowed: false
    };
}

function register(runtime, definition) {
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
            name: "system.certify",
            description: "Ejecuta una certificacion real y read-only de conversacion, web, conectores, supervisor, bridge, Git y pruebas; solo declara paridad si toda la evidencia pasa.",
            output: "SIA7_CAPABILITY_CERTIFICATION",
            inputSchema: {
                deep: "boolean"
            },
            execute: async (args = {}, context = {}) => {
                const deep = args.deep !== false;
                const requestedChecks = [
                    ["system.health", {}],
                    ["conversation.respond", { prompt: "Responde solamente: CERTIFICACION_CONVERSACION_OK" }],
                    ["web.research", { query: "Multiservicios Peninsulares HMH sitio oficial" }],
                    ["connector.list", {}],
                    ["system.supervision", { timeoutMs: SUPERVISION_CLOUD_TIMEOUT_MS }]
                ];
                if (deep) {
                    requestedChecks.push(
                        ["repo.gitStatus", {}],
                        ["tests.run", {}]
                    );
                }

                const checks = [];
                for (const [tool, toolArgs] of requestedChecks) {
                    if (!runtime.get?.(tool) && !runtime.has?.(tool)) {
                        checks.push({ tool, ok: false, status: "TOOL_NOT_REGISTERED" });
                        continue;
                    }
                    const execution = await runtime.execute(tool, toolArgs, {
                        ...context,
                        readOnly: true,
                        source: "system.certify"
                    });
                    const result = unwrapRuntimeResult(execution);
                    checks.push({
                        tool,
                        ok: execution?.ok !== false && result?.ok !== false,
                        status: result?.status || execution?.status || "COMPLETED",
                        evidence: {
                            source: result?.source || null,
                            score: result?.score ?? null,
                            passed: result?.passed ?? null,
                            failed: result?.failed ?? null,
                            connectedCount: result?.connectedCount ?? null,
                            sourceCount: result?.sourceCount ?? result?.sources?.length ?? null
                        }
                    });
                }

                const forensics = await buildCapabilityForensics(runtime);
                const failedChecks = checks.filter(check => check.ok !== true);
                const certified =
                    failedChecks.length === 0 &&
                    forensics.parity.canClaimParity === true &&
                    forensics.readinessScore === 100;

                return {
                    ok: certified,
                    status: certified ? "CODEX_PARITY_CERTIFIED" : "CERTIFICATION_INCOMPLETE",
                    certified,
                    deep,
                    checks,
                    failedChecks,
                    forensics,
                    policy: "EVIDENCE_ONLY_NO_PLACEHOLDERS",
                    checkedAt: new Date().toISOString()
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
                prompt: "string",
                objectiveId: "string",
                caseId: "string",
                allowedDomain: "string"
            },
            execute: async (args = {}, context = {}) =>
                await fetchGroundedWebResearch(
                    args.query ||
                    args.prompt ||
                    context.rawInput ||
                    "",
                    {
                        objectiveId: args.objectiveId || context.objectiveId || "",
                        caseId: args.caseId || context.caseId || "",
                        allowedDomain: args.allowedDomain || ""
                    }
                )
        }),
        register(runtime, {
            name: "business.assist",
            description: "Analiza estrategia, operaciones, ventas, costos, riesgos y decisiones empresariales con un modelo semantico; no inventa datos ni modifica sistemas.",
            output: "SIA7_BUSINESS_RESPONSE",
            inputSchema: {
                prompt: "string"
            },
            execute: async (args = {}, context = {}) => {
                const instruction =
                    resolveInstruction(args, context);

                const result =
                    runBusinessIntent(instruction);

                const staticMessage =
                    String(result?.message || "")
                        .toLowerCase();
                const genericStaticAnswer =
                    !result ||
                    staticMessage.includes("falta objetivo") ||
                    staticMessage.includes("necesito un objetivo");

                if (genericStaticAnswer) {
                    const groundedContext = recentGroundedBusinessContext();
                    const businessPrompt = [
                        "Actua como asesor empresarial privado del Arqui Heberto Mendoza.",
                        "Responde la solicitud concreta con diagnostico, recomendacion, riesgos y siguientes acciones.",
                        "No inventes cifras, clientes, resultados ni hechos; separa hechos proporcionados de supuestos y preguntas pendientes.",
                        "No autorices ni ejecutes cambios. Usa espanol claro y util.",
                        "Solicitud:",
                        instruction,
                        groundedContext
                            ? "Contexto factual reciente obtenido por web.research; usalo solo si es relevante y no agregues hechos fuera de estas fuentes:"
                            : "No hay contexto web reciente disponible; identifica claramente la informacion faltante.",
                        groundedContext
                    ].join("\n").slice(0, 1580);
                    const semantic = await fetchSemanticConversation(businessPrompt);

                    if (semantic?.ok === true && semantic?.message) {
                        return {
                            ok: true,
                            status: "BUSINESS_ADVISORY_READY",
                            source: "BUSINESS_SEMANTIC_MODEL",
                            version: VERSION,
                            message: semantic.message,
                            provider: semantic.provider || null,
                            model: semantic.model || null,
                            instruction,
                            advisory: true,
                            factsPolicy: "NO_INVENTED_FACTS"
                        };
                    }

                    return {
                        ok: false,
                        status: "BUSINESS_SEMANTIC_UNAVAILABLE",
                        source: "BUSINESS_SEMANTIC_MODEL",
                        error: semantic?.error || semantic?.status || "SEMANTIC_MODEL_UNAVAILABLE",
                        instruction,
                        retryable: true,
                        factsPolicy: "NO_INVENTED_FACTS"
                    };
                }

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
            description: "Produce una campaña específica desde campos semánticos y evidencia real; no clasifica con regex ni inventa datos faltantes.",
            output: "SIA7_MARKETING_PLAN",
            inputSchema: MARKETING_ARGUMENT_SCHEMA,
            execute: async (args = {}, context = {}) => {
                const instruction =
                    resolveInstruction(args, context);

                let planningArgs = args;
                let result = planMarketingRequest(
                    instruction,
                    {
                        ...context,
                        ...planningArgs,
                        ...resolveAuthority(planningArgs, context)
                    }
                );
                let semanticEnrichment = null;
                if (
                    result?.readyForProduction !== true &&
                    Array.isArray(context.validSources) &&
                    context.validSources.length > 0
                ) {
                    try {
                        semanticEnrichment = await completeGroundedToolArgs({
                            toolName: "marketing.plan",
                            description: "Completa un brief de campaña específico y sustentado para continuar una misión multifunción.",
                            inputSchema: MARKETING_ARGUMENT_SCHEMA,
                            args: planningArgs,
                            context
                        });
                        planningArgs = semanticEnrichment?.args || planningArgs;
                        result = planMarketingRequest(
                            instruction,
                            {
                                ...context,
                                ...planningArgs,
                                ...resolveAuthority(planningArgs, context)
                            }
                        );
                    } catch (error) {
                        return {
                            ...result,
                            ok: false,
                            status: "MARKETING_ARGUMENT_ENRICHMENT_UNAVAILABLE",
                            objectiveSatisfied: false,
                            requiresInput: false,
                            retryable: true,
                            error: error?.message || String(error)
                        };
                    }
                }
                if (result?.readyForProduction === true && result?.grounding?.status === "GROUNDED") {
                    recordCapabilityEvidence("marketing_production", {
                        ok: true,
                        status: result.status,
                        objectiveId: result.trace?.objectiveId || "",
                        sourceCount: result.grounding.sourceCount,
                        assets: result.assets,
                        channels: result.channels,
                        checkedAt: new Date().toISOString()
                    });
                }
                return {
                    ...result,
                    objectiveSatisfied: result?.readyForProduction === true,
                    semanticEnrichment: semanticEnrichment
                        ? {
                            used: true,
                            provider: semanticEnrichment.provider,
                            model: semanticEnrichment.model,
                            sourceCount: semanticEnrichment.sourceCount
                        }
                        : {
                            used: false
                        }
                };
            }
        }),
        register(runtime, {
            name: "page.plan",
            description: "Construye una especificacion responsive, editable y accesible de pagina sin escribir ni desplegar.",
            output: "SIA7_PAGE_SPEC",
            inputSchema: PAGE_ARGUMENT_SCHEMA,
            execute: async (args = {}, context = {}) => {
                let planningArgs = args;
                let semanticEnrichment = null;
                const requiresSpecificBrief =
                    Array.isArray(context.validSources) &&
                    context.validSources.length > 0 &&
                    (
                        !clean(args.pageName) ||
                        !clean(args.title) ||
                        !clean(args.description) ||
                        !Array.isArray(args.sections) ||
                        args.sections.length === 0
                    );
                if (requiresSpecificBrief) {
                    try {
                        semanticEnrichment = await completeGroundedToolArgs({
                            toolName: "page.plan",
                            description: "Completa una propuesta específica de landing page con copy y secciones sustentadas.",
                            inputSchema: PAGE_ARGUMENT_SCHEMA,
                            args,
                            context
                        });
                        planningArgs = semanticEnrichment?.args || planningArgs;
                    } catch (error) {
                        return {
                            ok: false,
                            status: "PAGE_ARGUMENT_ENRICHMENT_UNAVAILABLE",
                            objectiveSatisfied: false,
                            retryable: true,
                            error: error?.message || String(error)
                        };
                    }
                }
                const authority =
                    resolveAuthority(planningArgs, context);

                const spec = createOfficialPageSpec(
                    {
                        ...planningArgs,
                        pageName:
                            clean(
                                planningArgs.pageName,
                                "pagina-oficial"
                            )
                    },
                    authority
                );
                return {
                    ...spec,
                    objectiveSatisfied: true,
                    semanticEnrichment: semanticEnrichment
                        ? {
                            used: true,
                            provider: semanticEnrichment.provider,
                            model: semanticEnrichment.model,
                            sourceCount: semanticEnrichment.sourceCount
                        }
                        : {
                            used: false
                        }
                };
            }
        }),
        register(runtime, {
            name: "image.plan",
            description: "Define requisitos y prompts de imagen sustentados en evidencia sin generar archivos ni inventar materiales.",
            output: "SIA7_IMAGE_REQUIREMENTS_PLAN",
            inputSchema: IMAGE_PLAN_ARGUMENT_SCHEMA,
            execute: async (args = {}, context = {}) => {
                let planningArgs = args;
                let result = buildImageRequirementsPlan(planningArgs, context);
                let semanticEnrichment = null;
                if (
                    result?.ok !== true &&
                    Array.isArray(context.validSources) &&
                    context.validSources.length > 0
                ) {
                    try {
                        semanticEnrichment = await completeGroundedToolArgs({
                            toolName: "image.plan",
                            description: "Completa conceptos y prompts visuales sustentados sin generar archivos.",
                            inputSchema: IMAGE_PLAN_ARGUMENT_SCHEMA,
                            args: planningArgs,
                            context
                        });
                        planningArgs = semanticEnrichment?.args || planningArgs;
                        result = buildImageRequirementsPlan(planningArgs, context);
                    } catch (error) {
                        return {
                            ...result,
                            ok: false,
                            status: "IMAGE_ARGUMENT_ENRICHMENT_UNAVAILABLE",
                            objectiveSatisfied: false,
                            requiresInput: false,
                            retryable: true,
                            error: error?.message || String(error)
                        };
                    }
                }
                return {
                    ...result,
                    objectiveSatisfied: result?.ok === true,
                    requiresInput: result?.ok !== true,
                    missingInputs: result?.ok === true ? [] : result?.missingInformation || [],
                    semanticEnrichment: semanticEnrichment
                        ? {
                            used: true,
                            provider: semanticEnrichment.provider,
                            model: semanticEnrichment.model,
                            sourceCount: semanticEnrichment.sourceCount
                        }
                        : {
                            used: false
                        }
                };
            }
        }),
        register(runtime, {
            name: "reel.plan",
            description: "Construye un storyboard vertical con timeline exacto y evidencia por escena sin producir video.",
            output: "SIA7_REEL_PLAN",
            inputSchema: REEL_PLAN_ARGUMENT_SCHEMA,
            execute: async (args = {}, context = {}) => {
                let planningArgs = args;
                let result = buildReelPlanningSpec(planningArgs, context);
                let semanticEnrichment = null;
                if (
                    result?.ok !== true &&
                    Array.isArray(context.validSources) &&
                    context.validSources.length > 0
                ) {
                    try {
                        semanticEnrichment = await completeGroundedToolArgs({
                            toolName: "reel.plan",
                            description: "Completa un storyboard vertical con guion, evidencia y duración exacta sin producir video.",
                            inputSchema: REEL_PLAN_ARGUMENT_SCHEMA,
                            args: planningArgs,
                            context
                        });
                        planningArgs = semanticEnrichment?.args || planningArgs;
                        result = buildReelPlanningSpec(planningArgs, context);
                    } catch (error) {
                        return {
                            ...result,
                            ok: false,
                            status: "REEL_ARGUMENT_ENRICHMENT_UNAVAILABLE",
                            objectiveSatisfied: false,
                            requiresInput: false,
                            retryable: true,
                            error: error?.message || String(error)
                        };
                    }
                }
                return {
                    ...result,
                    objectiveSatisfied: result?.ok === true,
                    requiresInput: result?.ok !== true,
                    missingInputs: result?.ok === true ? [] : result?.missingInformation || [],
                    semanticEnrichment: semanticEnrichment
                        ? {
                            used: true,
                            provider: semanticEnrichment.provider,
                            model: semanticEnrichment.model,
                            sourceCount: semanticEnrichment.sourceCount
                        }
                        : {
                            used: false
                        }
                };
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
                attachments: "array",
                questions: "array"
            },
            execute: async (args = {}, context = {}) => {
                const attachments = Array.isArray(args.attachments)
                    ? args.attachments.slice(0, 30)
                    : attachmentsFromInstruction(
                        args.instruction || args.query || context.rawInput || ""
                    );
                const persistedMedia = attachments.filter(attachment => attachment?.artifact);
                if (persistedMedia.length > 0) {
                    const grounded = await fetchGroundedMediaAnalysis(
                        persistedMedia,
                        args.instruction || args.query || context.rawInput || "Analiza los archivos entregados."
                    );
                    if (grounded?.ok === true) {
                        return {
                            ...grounded,
                            attachments,
                            receivedFiles: attachments.length,
                            analyzedFiles: grounded.sources.length,
                            persistedArtifacts: persistedMedia.map(item => item.artifact)
                        };
                    }
                    if (!Array.isArray(args.pages) || args.pages.length === 0) {
                        return {
                            ok: false,
                            status: grounded?.status || "MEDIA_ANALYSIS_UNAVAILABLE",
                            error: grounded?.error || "MEDIA_ANALYSIS_UNAVAILABLE",
                            message: "Los archivos existen, pero no pude obtener evidencia visual/documental verificable; no inventare su contenido.",
                            attachments,
                            receivedFiles: attachments.length
                        };
                    }
                }
                const pages = Array.isArray(args.pages) && args.pages.length > 0
                    ? args.pages
                    : attachments.map((attachment, index) => ({
                        page: index + 1,
                        text: clean(
                            attachment?.extractedText,
                            `Archivo recibido: ${attachment?.name || "sin nombre"}; tipo ${attachment?.mimeType || "desconocido"}; artefacto ${attachment?.artifact || "no persistido"}.`
                        ),
                        sourceName: attachment?.name || "archivo-adjunto",
                        mimeType: attachment?.mimeType || "application/octet-stream",
                        artifact: attachment?.artifact || null
                    }));
                const mimeType = clean(
                    args.mimeType,
                    attachments[0]?.mimeType || "application/octet-stream"
                );
                if (!mimeType || pages.length === 0) {
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
                        {
                            ...args,
                            mimeType,
                            sourceName: clean(args.sourceName, attachments[0]?.name || "adjuntos"),
                            pages
                        },
                        authority
                    );

                return {
                    ...buildMediaAnalysis(
                    record,
                    { ...args, pages }
                    ),
                    attachments,
                    receivedFiles: attachments.length,
                    persistedArtifacts: attachments.map(item => item?.artifact).filter(Boolean)
                };
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
            "system.certify",
            "system.supervision",
            "web.research",
            "business.assist",
            "marketing.plan",
            "page.plan",
            "image.plan",
            "reel.plan",
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
