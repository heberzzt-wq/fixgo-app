import {
    planMarketingRequest
} from "./jarvis.marketing.engine.js?v=sia7-marketing-v10-runtime-source-authority-20260724";

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
} from "./jarvis.multifunction.planner.js?v=sia7-initial-plan-bounded-contract-v85-20260725";
import {
    validateWorkbookFormulaStructure
} from "./jarvis.workbook.validator.js?v=sia7-deep-artifact-validation-v65-20260725";
import {
    extractDocumentContract,
    validateDocumentBlueprint
} from "./jarvis.document.validator.js?v=sia7-exact-template-contract-v84-20260725";

const VERSION = "1.42.0-balanced-evidence-supervision";
const SUPERVISION_CLOUD_TIMEOUT_MS = 4500;
const FORENSICS_SUPERVISION_TIMEOUT_MS = 1500;
const DOCUMENT_COMPLETION_MARKER = "[[JARVIS_DOCUMENT_COMPLETE]]";
const DOCUMENT_MAX_CONTINUATIONS = 6;
const DOCUMENT_SEGMENT_COUNT = 3;

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
            "4.3.0-initial-plan-bounded-contract",
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
        id: "mission_evidence_contract",
        path: "/gestia-core/gestia-core.js",
        markers: [
            "1.0.0-balanced-evidence-receipt",
            "buildMissionEvidenceBlocks",
            "buildMissionEvidenceReceipt"
        ]
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
        ...(failed.some(check => check.id === "mission_evidence_contract") ? ["jarvis_evidence"] : []),
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
        ...(failureDomains.includes("jarvis_evidence")
            ? ["Revisar el reparto de evidencia y el recibo determinista antes de aceptar informes multifuncion."]
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
                        allowedDomain: trace.allowedDomain || "",
                        exactEntity: trace.exactEntity || ""
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
            (
                result?.status !== "ENTITY_NOT_VERIFIED" &&
                (
                    !result?.grounded ||
                    !Array.isArray(result?.sources) ||
                    result.sources.length === 0
                )
            )
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

async function fetchSemanticConversation(
    instruction = "",
    {
        maxOutputTokens = 3500
    } = {}
) {
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
    const responseTimeoutMs =
        Number(maxOutputTokens) >= 6000
            ? 130000
            : 55000;
    const timer =
        setTimeout(
            () => controller.abort(),
            responseTimeoutMs
        );

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
                body: JSON.stringify({
                    data: {
                        input:
                            instruction,
                        maxOutputTokens:
                            Math.max(
                                500,
                                Math.min(
                                    8000,
                                    Number(maxOutputTokens) ||
                                    3500
                                )
                            )
                    }
                }),
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

function appendSemanticContinuation(existing = "", continuation = "") {
    const current = String(existing || "").trimEnd();
    const next = String(continuation || "").trimStart();
    if (!current) return next;
    if (!next) return current;

    const maximumOverlap = Math.min(current.length, next.length, 4000);
    for (let length = maximumOverlap; length >= 40; length -= 1) {
        if (current.slice(-length) === next.slice(0, length)) {
            return `${current}${next.slice(length)}`;
        }
    }
    return `${current}\n\n${next}`;
}

function stripDocumentCompletionMarker(content = "") {
    return String(content || "")
        .split(DOCUMENT_COMPLETION_MARKER)
        .join("")
        .trim();
}

function boundDocumentModelContext(
    value = "",
    maximum = 30000
) {
    const source =
        String(value || "");
    const limit =
        Math.max(
            2000,
            Number(maximum) ||
            30000
        );
    if (
        source.length <=
        limit
    ) {
        return source;
    }
    const headLength =
        Math.floor(
            limit *
            0.4
        );
    const tailLength =
        limit -
        headLength -
        80;
    return [
        source.slice(
            0,
            headLength
        ),
        "[CONTEXTO_INTERMEDIO_OMITIDO_POR_LIMITE; EL_CONTRATO_CUANTITATIVO_SE_CONSERVA]",
        source.slice(
            -tailLength
        )
    ].join("\n");
}

function compactDocumentContractForModel(
    contract = {}
) {
    return {
        minWords:
            Number(contract.minWords) ||
            0,
        minSections:
            Number(contract.minSections) ||
            0,
        minQuestions:
            Number(contract.minQuestions) ||
            0,
        minTemplates:
            Number(contract.minTemplates) ||
            0,
        exactTemplates:
            Number(contract.exactTemplates) ||
            0,
        minTables:
            Number(contract.minTables) ||
            0,
        minVehicles:
            Number(contract.minVehicles) ||
            0,
        minParts:
            Number(contract.minParts) ||
            0,
        minKpis:
            Number(contract.minKpis) ||
            0,
        implementationDays:
            Number(
                contract
                    .implementationDays
            ) ||
            0,
        requireAnswerKey:
            contract
                .requireAnswerKey ===
            true,
        requiredSections:
            Array.isArray(
                contract
                    .requiredSections
            )
                ? contract
                    .requiredSections
                    .slice(
                        0,
                        80
                    )
                : [],
        requireCompletionMarker:
            true
    };
}

function buildDocumentRepairDirectives({
    contract = {},
    failures = []
} = {}) {
    const failureList =
        Array.isArray(failures)
            ? failures.map(value =>
                String(value || "")
            )
            : [];
    const hasFailure =
        prefix =>
            failureList.some(
                value =>
                    value.startsWith(
                        prefix
                    )
            );
    const directives =
        [];
    const exactTemplateMismatch =
        failureList
            .map(value =>
                value.match(
                    /^DOCUMENT_TEMPLATE_COUNT_MISMATCH:(\d+):(\d+)$/
                )
            )
            .find(Boolean);

    if (
        exactTemplateMismatch &&
        Number(
            exactTemplateMismatch[1]
        ) >
        Number(
            exactTemplateMismatch[2]
        )
    ) {
        return [];
    }

    if (
        hasFailure(
            "DOCUMENT_VEHICLE_COUNT_BELOW_MINIMUM"
        )
    ) {
        directives.push(
            `Crea una sola tabla Markdown de inventario con encabezados exactos "Unidad | Kilometraje | Tipo | Estado" y ${Number(contract.minVehicles) || 0} filas distintas.`
        );
    }
    if (
        hasFailure(
            "DOCUMENT_PART_COUNT_BELOW_MINIMUM"
        )
    ) {
        directives.push(
            `Crea una sola tabla Markdown de refacciones con encabezados exactos "Código | Refacción | Existencia | Reorden" y ${Number(contract.minParts) || 0} filas distintas.`
        );
    }
    if (
        hasFailure(
            "DOCUMENT_KPI_COUNT_BELOW_MINIMUM"
        )
    ) {
        directives.push(
            `Crea una sola tabla Markdown de KPI con encabezados exactos "Indicador | Fórmula | Meta | Frecuencia | Responsable" y ${Number(contract.minKpis) || 0} filas de indicadores distintos.`
        );
    }
    if (
        hasFailure(
            "DOCUMENT_IMPLEMENTATION_DAY_COVERAGE_BELOW_MINIMUM"
        )
    ) {
        directives.push(
            `Crea una sola tabla Markdown con encabezados exactos "Día | Actividad | Responsable | Evidencia" y ${Number(contract.implementationDays) || 0} filas; el primer campo debe ser cada número consecutivo desde 1 hasta ${Number(contract.implementationDays) || 0}.`
        );
    }
    if (
        exactTemplateMismatch &&
        Number(
            exactTemplateMismatch[1]
        ) <
        Number(
            exactTemplateMismatch[2]
        )
    ) {
        const current =
            Number(
                exactTemplateMismatch[1]
            );
        const expected =
            Number(
                exactTemplateMismatch[2]
            );
        directives.push(
            `Crea solamente los ${expected - current} formatos faltantes, numerados del ${current + 1} al ${expected}. Cada bloque debe iniciar con "## Formato N. [nombre operativo]" y contener inmediatamente una tabla Markdown propia con encabezados que incluyan al menos "Fecha | Responsable | Acción | Firma". No recrees los formatos 1 al ${current}.`
        );
    }
    else if (
        hasFailure(
            "DOCUMENT_TEMPLATE_COUNT_BELOW_MINIMUM"
        )
    ) {
        directives.push(
            `Crea exactamente ${Number(contract.minTemplates) || 0} bloques consecutivos. Cada bloque debe iniciar con "## Formato N. [nombre operativo]" y contener inmediatamente una tabla Markdown propia con encabezados que incluyan al menos "Fecha | Responsable | Acción | Firma".`
        );
    }
    if (
        hasFailure(
            "DOCUMENT_QUESTION_COUNT_BELOW_MINIMUM"
        ) ||
        hasFailure(
            "DOCUMENT_ANSWER_KEY_MISSING"
        ) ||
        hasFailure(
            "DOCUMENT_ANSWER_KEY_INCOMPLETE"
        )
    ) {
        directives.push(
            `Crea el encabezado exacto "## Examen de ${Number(contract.minQuestions) || 0} preguntas", seguido inmediatamente de ${Number(contract.minQuestions) || 0} preguntas consecutivas numeradas "1. ¿...?" hasta "${Number(contract.minQuestions) || 0}. ¿...?". Después crea el encabezado exacto "## Clave completa de respuestas" y ${Number(contract.minQuestions) || 0} respuestas consecutivas numeradas del 1 al ${Number(contract.minQuestions) || 0}.`
        );
    }
    if (
        hasFailure(
            "DOCUMENT_TABLE_COUNT_BELOW_MINIMUM"
        )
    ) {
        directives.push(
            `Añade solamente las tablas Markdown operativas distintas necesarias para alcanzar un total global mínimo de ${Number(contract.minTables) || 0}.`
        );
    }
    if (
        hasFailure(
            "DOCUMENT_SECTION_COUNT_BELOW_MINIMUM"
        )
    ) {
        directives.push(
            `Añade únicamente las secciones principales numeradas distintas necesarias para alcanzar ${Number(contract.minSections) || 0}, sin repetir encabezados existentes.`
        );
    }
    if (
        hasFailure(
            "DOCUMENT_WORD_COUNT_BELOW_MINIMUM"
        )
    ) {
        directives.push(
            `Añade contenido operativo sustantivo y original suficiente para alcanzar al menos ${Number(contract.minWords) || 0} palabras globales, sin texto de relleno ni repeticiones.`
        );
    }

    return directives.length >
        0
        ? directives
        : [
            "No agregues prosa nueva. Entrega únicamente el marcador final solicitado."
        ];
}

function buildDocumentSegmentPrompts({
    instruction = "",
    title = "",
    format = "docx",
    contract = {}
} = {}) {
    const totalSections =
        Math.max(
            Number(
                contract.minSections
            ) || 0,
            Array.isArray(
                contract.requiredSections
            )
                ? contract
                    .requiredSections
                    .length
                : 0,
            DOCUMENT_SEGMENT_COUNT
        );
    const minimumWordsPerSegment =
        Math.ceil(
            Math.max(
                Number(contract.minWords) ||
                    0,
                300
            ) /
            DOCUMENT_SEGMENT_COUNT
        ) +
        120;
    const dedicatedTableCount =
        (
            Number(
                contract.minVehicles
            ) >
            0
                ? 1
                : 0
        ) +
        (
            Number(
                contract.minParts
            ) >
            0
                ? 1
                : 0
        ) +
        (
            Number(
                contract.minKpis
            ) >
            0
                ? 1
                : 0
        ) +
        (
            Number(
                contract
                    .implementationDays
            ) >
            0
                ? 1
                : 0
        ) +
        (
            Number(
                contract.minTemplates
            ) ||
            0
        );
    const genericTableCount =
        Math.max(
            0,
            (
                Number(
                    contract.minTables
                ) ||
                0
            ) -
            dedicatedTableCount
        );
    const genericTableSegments =
        Number(
            contract.minTemplates
        ) >
        0
            ? DOCUMENT_SEGMENT_COUNT -
                1
            : DOCUMENT_SEGMENT_COUNT;
    let sectionCursor = 1;

    return Array.from({
        length:
            DOCUMENT_SEGMENT_COUNT
    }, (_unused, index) => {
        const remainingSections =
            totalSections -
            sectionCursor +
            1;
        const remainingSegments =
            DOCUMENT_SEGMENT_COUNT -
            index;
        const sectionCount =
            Math.ceil(
                remainingSections /
                remainingSegments
            );
        const sectionStart =
            sectionCursor;
        const sectionEnd =
            sectionStart +
            sectionCount -
            1;
        sectionCursor =
            sectionEnd +
            1;
        const requiredTitles =
            Array.isArray(
                contract.requiredSections
            )
                ? contract
                    .requiredSections
                    .slice(
                        sectionStart - 1,
                        sectionEnd
                    )
                : [];
        const assignments = [];

        const genericTablesForSegment =
            index <
            genericTableSegments
                ? Math.floor(
                    genericTableCount /
                    genericTableSegments
                ) +
                (
                    index <
                    genericTableCount %
                    genericTableSegments
                        ? 1
                        : 0
                )
                : 0;
        if (
            genericTablesForSegment >
            0
        ) {
            assignments.push(
                `Incluye exactamente ${genericTablesForSegment} tablas Markdown operativas adicionales en este segmento, distintas de los inventarios, catálogos, KPI, planes y formatos asignados por separado.`
            );
        }
        if (index === 0) {
            if (
                Number(contract.minVehicles) >
                0
            ) {
                assignments.push(
                    `Incluye un inventario tabular de ${contract.minVehicles} vehículos con registros distintos y encabezados "Unidad | Kilometraje | Tipo | Estado".`
                );
            }
            if (
                Number(contract.minParts) >
                0
            ) {
                assignments.push(
                    `Incluye un catálogo tabular de ${contract.minParts} refacciones distintas y encabezados "Código | Refacción | Existencia | Reorden".`
                );
            }
        }
        if (index === 1) {
            if (
                Number(contract.minKpis) >
                0
            ) {
                assignments.push(
                    `Incluye una tabla de ${contract.minKpis} KPI distintos con encabezados "Indicador | Fórmula | Meta | Frecuencia | Responsable".`
                );
            }
            if (
                Number(
                    contract
                        .implementationDays
                ) > 0
            ) {
                assignments.push(
                    `Incluye un plan tabular con encabezados "Día | Actividad | Responsable | Evidencia" y ${contract.implementationDays} filas cuyo primer campo sea cada número consecutivo del 1 al ${contract.implementationDays}.`
                );
            }
        }
        if (index === 2) {
            if (
                Number(contract.minTemplates) >
                0
            ) {
                assignments.push(
                    `Incluye exactamente ${contract.minTemplates} formatos operativos completos; cada uno debe llevar encabezado "Formato N" y una tabla propia con campos operativos.`
                );
                assignments.push(
                    `No incluyas otros encabezados "Formato" o "Plantilla", ni tablas adicionales dentro de este bloque: el total global debe ser exactamente ${contract.minTemplates}.`
                );
            }
            if (
                Number(contract.minQuestions) >
                0
            ) {
                assignments.push(
                    `Incluye el encabezado "Examen de ${contract.minQuestions} preguntas" seguido de ${contract.minQuestions} preguntas consecutivas numeradas del 1 al ${contract.minQuestions}.`
                );
                if (
                    contract.requireAnswerKey ===
                    true
                ) {
                    assignments.push(
                        `Después del examen incluye "Clave completa de respuestas" con ${contract.minQuestions} respuestas consecutivas numeradas del 1 al ${contract.minQuestions}.`
                    );
                }
            }
        }

        return [
            `Redacta el segmento ${index + 1} de ${DOCUMENT_SEGMENT_COUNT} de un documento profesional que se ensamblará automáticamente.`,
            `Produce al menos ${minimumWordsPerSegment} palabras sustantivas en este segmento.`,
            requiredTitles.length > 0
                ? [
                    "Usa exactamente estos encabezados principales con su numeración global:",
                    ...requiredTitles.map(
                        (
                            section,
                            sectionIndex
                        ) =>
                            `${sectionStart + sectionIndex}. ${section}`
                    )
                ].join("\n")
                : `Crea exactamente las secciones principales numeradas ${sectionStart} a ${sectionEnd}, con títulos profesionales distintos y contenido operativo.`,
            ...assignments,
            "No repitas secciones de otros segmentos. No resumas ni describas lo que harías: entrega contenido final.",
            "Usa tablas Markdown reales cuando se pidan tablas. No uses placeholders, cercas de código ni JSON.",
            "No incluyas marcadores internos de finalización; el ensamblador verificará el contrato completo.",
            `CONTRATO_GLOBAL=${JSON.stringify(compactDocumentContractForModel(contract))}`,
            `TITULO=${title}`,
            `FORMATO=${format}`,
            `SOLICITUD_ORIGINAL=${instruction}`
        ].join("\n");
    });
}

function extractSemanticJsonObject(value = "") {
    const source = String(value || "").trim();
    if (!source) throw new Error("SEMANTIC_JSON_REQUIRED");
    try {
        const parsed = JSON.parse(source);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        // Continue with a bounded object extraction for providers that wrap JSON in prose.
    }
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("SEMANTIC_JSON_REQUIRED");
    const parsed = JSON.parse(source.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("SEMANTIC_JSON_OBJECT_REQUIRED");
    }
    return parsed;
}

function normalizedWorkbookSheets(value = []) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 12).map((sheet, index) => ({
        name: clean(sheet?.name, `Hoja ${index + 1}`).slice(0, 31),
        rows: Array.isArray(sheet?.rows)
            ? sheet.rows.slice(0, 10000).map(row =>
                Array.isArray(row)
                    ? row.slice(0, 80)
                    : Object.values(row || {}).slice(0, 80)
            )
            : []
    })).filter(sheet => sheet.rows.length > 0);
}

function quotedWorkbookSheetName(name = "") {
    return `'${String(name).split("'").join("''")}'`;
}

function replaceUnquotedSheetReference(
    formula = "",
    alias = "",
    replacement = ""
) {
    const source = String(formula || "");
    const needle = `${String(alias)}!`;
    if (!needle || needle === "!") return source;
    let cursor = 0;
    let output = "";
    while (cursor < source.length) {
        const match = source.indexOf(needle, cursor);
        if (match < 0) {
            output += source.slice(cursor);
            break;
        }
        output += source.slice(cursor, match);
        if (match > 0 && source[match - 1] === "'") {
            output += needle;
        }
        else {
            output += replacement;
        }
        cursor = match + needle.length;
    }
    return output;
}

function normalizeFormulaSheetReferences(formula = "", sheetNames = []) {
    let normalized = String(formula || "");
    const names = [...sheetNames]
        .map(String)
        .sort((left, right) => right.length - left.length);

    for (const name of names) {
        const quotedName = quotedWorkbookSheetName(name);
        const aliases = new Set([
            name,
            name.split(" ").join("_")
        ]);
        for (const alias of aliases) {
            const quotedAlias = quotedWorkbookSheetName(alias);
            normalized = normalized
                .split(`${quotedAlias}!`)
                .join(`${quotedName}!`);
            normalized =
                replaceUnquotedSheetReference(
                    normalized,
                    alias,
                    `${quotedName}!`
                );
        }
    }
    return normalized;
}

function workbookFormulaIssue(formula = "", sheetNames = []) {
    const source = String(formula || "");
    const body = source.startsWith("=")
        ? source.slice(1)
        : source;
    if (!body || body.length > 2000) return "FORMULA_LENGTH_INVALID";
    const lower = body.toLowerCase();
    if (
        body.includes("[") ||
        body.includes("]") ||
        lower.includes("://") ||
        lower.includes("file:")
    ) {
        return "EXTERNAL_REFERENCE_NOT_ALLOWED";
    }

    const names = new Set(sheetNames.map(String));
    const boundaries = new Set([
        "+", "-", "*", "/", "^", "=", "<", ">",
        "(", ")", ",", ";", "%", "&"
    ]);
    let parentheses = 0;
    let singleQuoted = false;
    let doubleQuoted = false;

    for (let index = 0; index < body.length; index += 1) {
        const character = body[index];
        if (singleQuoted) {
            if (
                character === "'" &&
                body[index + 1] === "'"
            ) {
                index += 1;
            }
            else if (character === "'") {
                singleQuoted = false;
            }
            continue;
        }
        if (doubleQuoted) {
            if (
                character === '"' &&
                body[index + 1] === '"'
            ) {
                index += 1;
            }
            else if (character === '"') {
                doubleQuoted = false;
            }
            continue;
        }
        if (character === "'") {
            singleQuoted = true;
            continue;
        }
        if (character === '"') {
            doubleQuoted = true;
            continue;
        }
        if (
            character === " " ||
            character === "\t" ||
            character === "\n" ||
            character === "\r"
        ) {
            return "FORMULA_WHITESPACE_OUTSIDE_LITERAL";
        }
        if (character === "(") parentheses += 1;
        if (character === ")") {
            parentheses -= 1;
            if (parentheses < 0) {
                return "FORMULA_PARENTHESES_INVALID";
            }
        }
        if (character !== "!") continue;

        let sheetName = "";
        if (body[index - 1] === "'") {
            let start = index - 2;
            while (start >= 0) {
                if (
                    body[start] === "'" &&
                    body[start - 1] === "'"
                ) {
                    start -= 2;
                    continue;
                }
                if (body[start] === "'") break;
                start -= 1;
            }
            if (start < 0) return "FORMULA_SHEET_QUOTE_INVALID";
            sheetName = body
                .slice(start + 1, index - 1)
                .split("''")
                .join("'");
        }
        else {
            let start = index - 1;
            while (
                start >= 0 &&
                !boundaries.has(body[start])
            ) {
                start -= 1;
            }
            sheetName = body.slice(start + 1, index);
        }
        if (!names.has(sheetName)) {
            return `FORMULA_SHEET_NOT_FOUND:${sheetName}`;
        }
    }

    if (
        singleQuoted ||
        doubleQuoted ||
        parentheses !== 0
    ) {
        return "FORMULA_STRUCTURE_INVALID";
    }
    return null;
}

function normalizeAndValidateWorkbookSheets(value = []) {
    const originalSheets = normalizedWorkbookSheets(value);
    const sheetNames = originalSheets.map(sheet => sheet.name);
    const invalidFormulas = [];
    let formulaCount = 0;
    const sheets = originalSheets.map(sheet => ({
        ...sheet,
        rows: sheet.rows.map((row, rowIndex) =>
            row.map((cell, columnIndex) => {
                if (
                    typeof cell !== "string" ||
                    !cell.startsWith("=")
                ) {
                    return cell;
                }
                const formula =
                    normalizeFormulaSheetReferences(
                        cell,
                        sheetNames
                    );
                const issue =
                    workbookFormulaIssue(
                        formula,
                        sheetNames
                    );
                if (issue) {
                    invalidFormulas.push({
                        sheet: sheet.name,
                        row: rowIndex + 1,
                        column: columnIndex + 1,
                        formula: formula.slice(0, 500),
                        issue
                    });
                }
                else {
                    formulaCount += 1;
                }
                return formula;
            })
        )
    }));
    const structuralValidation =
        validateWorkbookFormulaStructure(
            sheets
        );
    const existingIssueKeys =
        new Set(
            invalidFormulas.map(issue => [
                issue.sheet,
                issue.row,
                issue.column,
                issue.issue
            ].join("\u0000"))
        );
    for (
        const issue of
            structuralValidation.invalidFormulas
    ) {
        const issueKey = [
            issue.sheet,
            issue.row,
            issue.column,
            issue.issue
        ].join("\u0000");
        if (existingIssueKeys.has(issueKey)) {
            continue;
        }
        existingIssueKeys.add(issueKey);
        invalidFormulas.push(issue);
    }

    return {
        sheets,
        formulaCount:
            Math.max(
                formulaCount,
                structuralValidation.formulaCount
            ),
        structuralValidationVersion:
            structuralValidation.version,
        invalidFormulas
    };
}

function normalizedPageArtifactInput(value = {}, fallbackTitle = "") {
    const services = Array.isArray(value?.services)
        ? value.services.slice(0, 12).map(service => ({
            title: clean(service?.title || service?.name),
            description: clean(service?.description)
        })).filter(service =>
            service.title &&
            service.description
        )
        : [];
    return {
        brandName: clean(value?.brandName),
        title: clean(value?.title, fallbackTitle),
        description: clean(value?.description),
        services,
        whatsapp: clean(value?.whatsapp).replace(/[^0-9]/g, ""),
        contactEmail: clean(value?.contactEmail),
        whatsappRequested: value?.whatsappRequested === true
    };
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
                prompt: "string",
                maxOutputTokens: "number"
            },
            execute: async (args = {}, context = {}) => {
                const instruction =
                    resolveInstruction(args, context);

                const result =
                    await fetchSemanticConversation(
                        instruction,
                        {
                            maxOutputTokens:
                                args.maxOutputTokens
                        }
                    );
                return {
                    ...result,
                    instruction,
                    readOnly: true
                };
            }
        }),
        register(runtime, {
            name: "document.compose",
            description: "Redacta en memoria el contenido completo y original de un documento solicitado, sin copiar fuentes ni escribir archivos; se usa antes de document.create.",
            output: "DOCUMENT_CONTENT_BLUEPRINT",
            missionDedupeBy: ["format"],
            inputSchema: {
                title: "string",
                format: "html|md|txt|docx|pdf",
                instructions: "string"
            },
            execute: async (args = {}, context = {}) => {
                const originalInstruction =
                    clean(context.rawInput);
                const plannedInstruction =
                    clean(args.instructions);
                const fallbackInstruction =
                    resolveInstruction(
                        args,
                        context
                    );
                const boundedOriginalInstruction =
                    boundDocumentModelContext(
                        originalInstruction ||
                        fallbackInstruction,
                        30000
                    );
                const boundedPlannedInstruction =
                    boundDocumentModelContext(
                        plannedInstruction,
                        16000
                    );
                const instruction =
                    [
                        boundedOriginalInstruction,
                        boundedPlannedInstruction &&
                        boundedPlannedInstruction !==
                            boundedOriginalInstruction
                            ? `DETALLE_DEL_PLAN=${boundedPlannedInstruction}`
                            : ""
                    ]
                        .filter(Boolean)
                        .join("\n\n") ||
                    fallbackInstruction;
                const title = clean(args.title, "Documento Jarvis");
                const format = clean(args.format, "docx").toLowerCase();
                const contract =
                    extractDocumentContract(
                        originalInstruction ||
                        plannedInstruction ||
                        fallbackInstruction
                    );
                const segmentedComposition =
                    Number(contract.minWords) >=
                        2500 ||
                    Number(contract.minSections) >=
                        12;
                let semantic;
                let content;
                let completionVerified;

                if (segmentedComposition) {
                    const segmentPrompts =
                        buildDocumentSegmentPrompts({
                            instruction,
                            title,
                            format,
                            contract
                        });
                    const segmentResults =
                        await Promise.all(
                            segmentPrompts.map(
                                async prompt => {
                                    let result =
                                        await fetchSemanticConversation(
                                            prompt,
                                            {
                                                maxOutputTokens:
                                                    4500
                                            }
                                        );
                                    if (
                                        result?.ok !==
                                        true
                                    ) {
                                        result =
                                            await fetchSemanticConversation(
                                                prompt,
                                                {
                                                    maxOutputTokens:
                                                        4500
                                                }
                                            );
                                    }
                                    return result;
                                }
                            )
                        );
                    const successfulSegments =
                        segmentResults
                            .filter(result =>
                                result?.ok ===
                                true
                            );
                    content =
                        successfulSegments
                            .map(result =>
                                stripDocumentCompletionMarker(
                                    clean(
                                        result
                                            .message
                                    )
                                )
                            )
                            .filter(Boolean)
                            .join("\n\n");
                    completionVerified =
                        successfulSegments.length ===
                        segmentPrompts.length;
                    semantic =
                        successfulSegments.length >
                        0
                            ? {
                                ...successfulSegments[
                                    successfulSegments.length -
                                    1
                                ],
                                message:
                                    content,
                                partialSegmentFailure:
                                    !completionVerified,
                                failedSegmentErrors:
                                    segmentResults
                                        .filter(
                                            result =>
                                                result
                                                    ?.ok !==
                                                true
                                        )
                                        .map(
                                            result =>
                                                clean(
                                                    result
                                                        ?.error ||
                                                    result
                                                        ?.status ||
                                                    "DOCUMENT_SEGMENT_COMPOSITION_FAILED"
                                                )
                                        )
                                        .filter(
                                            Boolean
                                        )
                            }
                            : segmentResults.find(
                                result =>
                                    result?.ok !==
                                    true
                            ) ||
                            {
                                ok:
                                    false,
                                error:
                                    "DOCUMENT_SEGMENT_COMPOSITION_FAILED"
                            };
                }
                else {
                    semantic =
                        await fetchSemanticConversation(
                            [
                                "Redacta el contenido completo, original y listo para guardar de este documento solicitado por el usuario.",
                                "No describas lo que harias: entrega el documento terminado.",
                                "Cubre cada requisito, incluye ejercicios, respuestas, tablas o secciones cuando se pidan y evita contenido copiado de fuentes externas.",
                                "Distribuye la extension entre todos los requisitos y prioriza que ninguno quede fuera.",
                                "No uses cercas de codigo ni JSON. No omitas el final por longitud.",
                                `Finaliza obligatoriamente con ${DOCUMENT_COMPLETION_MARKER} en una linea independiente.`,
                                `CONTRATO_VERIFICABLE=${JSON.stringify(compactDocumentContractForModel(contract))}`,
                                `TITULO=${title}`,
                                `FORMATO=${format}`,
                                `SOLICITUD=${instruction}`
                            ].join("\n"),
                            {
                                maxOutputTokens:
                                    8000
                            }
                        );
                    content =
                        clean(
                            semantic?.message
                        );
                    completionVerified =
                        content.includes(
                            DOCUMENT_COMPLETION_MARKER
                        );
                }
                let continuationCount = 0;
                let validation =
                    validateDocumentBlueprint({
                        content:
                            stripDocumentCompletionMarker(
                                content
                            ),
                        instruction,
                        completionMarkerPresent:
                            completionVerified
                    });

                while (
                    semantic?.ok === true &&
                    validation.ok !== true &&
                    continuationCount <
                        DOCUMENT_MAX_CONTINUATIONS
                ) {
                    const composedSoFar =
                        stripDocumentCompletionMarker(
                            content
                        );
                    const boundedComposedContext =
                        boundDocumentModelContext(
                            composedSoFar,
                            8000
                        );
                    const repairDirectives =
                        buildDocumentRepairDirectives({
                            contract,
                            failures:
                                validation
                                    .failures
                        });
                    if (
                        repairDirectives.length ===
                        0
                    ) {
                        break;
                    }
                    const continuation =
                        await fetchSemanticConversation(
                            [
                                "REPARACION ESTRUCTURAL ESTRICTA DE DOCUMENTO.",
                                "Entrega exclusivamente los bloques faltantes indicados abajo. No agregues introducciones, explicaciones, nuevas secciones narrativas ni contenido ya satisfecho.",
                                "Respeta literalmente encabezados, numeración, cantidades y sintaxis de tablas Markdown.",
                                ...repairDirectives,
                                `Finaliza obligatoriamente con ${DOCUMENT_COMPLETION_MARKER} en una linea independiente.`,
                                `FALLAS_PENDIENTES=${JSON.stringify(validation.failures)}`,
                                `CONTRATO_VERIFICABLE=${JSON.stringify(compactDocumentContractForModel(contract))}`,
                                `TITULO=${title}`,
                                `FORMATO=${format}`,
                                `SOLICITUD_ORIGINAL=${boundedOriginalInstruction}`,
                                `CONTENIDO_YA_REDACTADO_CONTEXTO_ACOTADO=${boundedComposedContext}`
                            ].join("\n"),
                            {
                                maxOutputTokens:
                                    4500
                            }
                        );
                    continuationCount += 1;
                    if (
                        continuation?.ok === true &&
                        clean(continuation.message)
                    ) {
                        content =
                            appendSemanticContinuation(
                                composedSoFar,
                                clean(continuation.message)
                            );
                        semantic = continuation;
                    }
                    else {
                        semantic = continuation;
                        break;
                    }
                    completionVerified =
                        content.includes(
                            DOCUMENT_COMPLETION_MARKER
                        );
                    validation =
                        validateDocumentBlueprint({
                            content:
                                stripDocumentCompletionMarker(
                                    content
                                ),
                            instruction,
                            completionMarkerPresent:
                                completionVerified
                        });
                }

                content =
                    stripDocumentCompletionMarker(
                        content
                    );
                validation =
                    validateDocumentBlueprint({
                        content,
                        instruction,
                        completionMarkerPresent:
                            completionVerified
                    });
                const ok =
                    semantic?.ok === true &&
                    validation.ok === true;
                return {
                    ok,
                    status:
                        ok
                            ? "DOCUMENT_CONTENT_COMPOSED"
                            : "DOCUMENT_CONTENT_COMPOSITION_FAILED",
                    title,
                    format,
                    content,
                    provider:
                        semantic?.provider ||
                        null,
                    model:
                        semantic?.model ||
                        null,
                    original:
                        true,
                    completionVerified,
                    completionMarkerPresent:
                        validation
                            .completionMarkerPresent,
                    compositionComplete:
                        validation
                            .compositionComplete,
                    validationPassed:
                        validation
                            .validationPassed,
                    validationFailures:
                        validation.failures,
                    contract:
                        validation.contract,
                    wordCount:
                        validation.wordCount,
                    sectionCount:
                        validation.sectionCount,
                    headingCount:
                        validation.headingCount,
                    tableBlueprintCount:
                        validation.tableBlueprintCount,
                    templateCount:
                        validation.templateCount,
                    questionCount:
                        validation.questionCount,
                    answerKeyCount:
                        validation.answerKeyCount,
                    vehicleCount:
                        validation.vehicleCount,
                    partCount:
                        validation.partCount,
                    kpiCount:
                        validation.kpiCount,
                    implementationDayCoverage:
                        validation
                            .implementationDayCoverage,
                    tables:
                        validation.tables,
                    continuationCount,
                    segmentedComposition,
                    readOnly:
                        true,
                    objectiveSatisfied:
                        ok,
                    error:
                        ok
                            ? null
                            : semantic?.error ||
                            validation.failures[0] ||
                            "DOCUMENT_CONTENT_COMPOSITION_FAILED"
                };
            }
        }),
        register(runtime, {
            name: "spreadsheet.compose",
            description: "Diseña en memoria un libro XLSX completo con varias hojas, filas, supuestos y formulas; se usa antes de document.create y no escribe archivos.",
            output: "SPREADSHEET_BLUEPRINT",
            missionDedupeBy: [],
            inputSchema: {
                title: "string",
                instructions: "string"
            },
            execute: async (args = {}, context = {}) => {
                const instruction = resolveInstruction(
                    {
                        ...args,
                        prompt:
                            args.instructions ||
                            context.rawInput ||
                            ""
                    },
                    context
                );
                const title = clean(
                    args.title,
                    "Libro de trabajo Jarvis"
                );
                let semantic = await fetchSemanticConversation(
                    [
                        "Diseña un libro XLSX completo y ejecutable como JSON estricto.",
                        "Devuelve solamente un objeto JSON con title y sheets. sheets es un arreglo de objetos {name,rows}; rows es un arreglo de arreglos.",
                        "Toda formula debe ser una cadena que empiece con = y usar referencias de Excel. Separa criterios, supuestos o fuentes en una hoja propia cuando la solicitud lo requiera.",
                        "En formulas, las hojas con espacios deben citarse por su nombre exacto, por ejemplo ='Mano de Obra'!F4; no sustituyas espacios por guiones bajos.",
                        "Nunca escribas comentarios, etiquetas ni la palabra SUPUESTO dentro de una formula; colocalos en una celda separada.",
                        "Cada referencia debe apuntar a una celda que exista dentro de las filas y columnas declaradas.",
                        "Ninguna formula puede depender de si misma, ni directamente ni a traves de otras formulas.",
                        "Toda celda usada en multiplicacion, division, suma, resta o potencia debe contener un numero o una formula; coloca la etiqueta SUPUESTO en otra columna.",
                        "Si agregas o retiras filas, recalcula todas las referencias antes de entregar el JSON.",
                        "No inventes datos de mercado: cualquier valor de ejemplo debe rotularse claramente como SUPUESTO y las formulas deben conservar la trazabilidad del calculo.",
                        "Incluye todos los conceptos, subtotales, porcentajes y resultado final pedidos. No agregues explicaciones fuera del JSON.",
                        `TITULO=${title}`,
                        `SOLICITUD=${instruction}`
                    ].join("\n"),
                    {
                        maxOutputTokens:
                            8000
                    }
                );
                let workbook = null;
                try {
                    workbook =
                        extractSemanticJsonObject(
                            semantic?.message ||
                            ""
                        );
                } catch (error) {
                    return {
                        ok: false,
                        status:
                            "SPREADSHEET_BLUEPRINT_INVALID",
                        title,
                        sheets: [],
                        readOnly:
                            true,
                        objectiveSatisfied:
                            false,
                        error:
                            error?.message ||
                            "SPREADSHEET_JSON_INVALID"
                    };
                }
                let validation =
                    normalizeAndValidateWorkbookSheets(
                        workbook?.sheets
                    );
                let repairCount = 0;
                const repairRequired =
                    () =>
                        validation.sheets.length === 0 ||
                        validation.formulaCount < 1 ||
                        validation
                            .invalidFormulas
                            .length > 0;

                while (
                    semantic?.ok === true &&
                    repairRequired() &&
                    repairCount < 2
                ) {
                    repairCount += 1;
                    const validationIssues =
                        validation
                            .invalidFormulas
                            .length > 0
                            ? validation.invalidFormulas
                            : [
                                {
                                    issue:
                                        validation
                                            .sheets
                                            .length === 0
                                            ? "WORKBOOK_SHEETS_REQUIRED"
                                            : "WORKBOOK_FORMULAS_REQUIRED"
                                }
                            ];
                    const repair =
                        await fetchSemanticConversation(
                            [
                                "Repara este libro XLSX y devuelve solamente el objeto JSON completo con title y sheets.",
                                "Conserva todos los datos, hojas y formulas validas.",
                                "Corrige cada formula indicada. Las referencias deben usar el nombre exacto de una hoja existente; si tiene espacios, encierralo entre comillas simples.",
                                "No incluyas comentarios o etiquetas dentro de formulas. Mueve esas etiquetas a otra celda.",
                                "Cada referencia debe apuntar a una celda existente dentro de las filas y columnas declaradas.",
                                "Elimina dependencias circulares directas e indirectas.",
                                "Toda celda usada en una operacion numerica debe contener un numero o una formula; mueve SUPUESTO a una columna de criterio separada.",
                                "Despues de mover, agregar o retirar filas, recalcula todas las referencias.",
                                `SOLICITUD_ORIGINAL=${instruction}`,
                                `INTENTO_DE_REPARACION=${repairCount}`,
                                `ERRORES_ESTRUCTURALES=${JSON.stringify(validationIssues)}`,
                                `LIBRO_A_REPARAR=${JSON.stringify({
                                    title:
                                        clean(
                                            workbook?.title,
                                            title
                                        ),
                                    sheets:
                                        validation.sheets
                                })}`
                            ].join("\n"),
                            {
                                maxOutputTokens:
                                    8000
                            }
                        );
                    try {
                        const repairedWorkbook =
                            extractSemanticJsonObject(
                                repair?.message ||
                                ""
                            );
                        const repairedValidation =
                            normalizeAndValidateWorkbookSheets(
                                repairedWorkbook?.sheets
                            );
                        if (
                            repair?.ok === true &&
                            repairedValidation
                                .sheets
                                .length > 0
                        ) {
                            workbook = repairedWorkbook;
                            semantic = repair;
                            validation = repairedValidation;
                        }
                        else {
                            break;
                        }
                    }
                    catch {
                        // The validation result below remains fail-closed.
                        break;
                    }
                }

                const {
                    sheets,
                    formulaCount,
                    invalidFormulas
                } = validation;
                const ok =
                    semantic?.ok === true &&
                    sheets.length > 0 &&
                    formulaCount > 0 &&
                    invalidFormulas.length === 0;
                return {
                    ok,
                    status:
                        ok
                            ? "SPREADSHEET_BLUEPRINT_READY"
                            : "SPREADSHEET_BLUEPRINT_INCOMPLETE",
                    title:
                        clean(
                            workbook?.title,
                            title
                        ),
                    format:
                        "xlsx",
                    sheets,
                    formulaCount,
                    formulaValidationPassed:
                        formulaCount > 0 &&
                        invalidFormulas.length === 0,
                    invalidFormulas:
                        invalidFormulas.slice(0, 20),
                    assumptionsExplicit:
                        JSON.stringify(sheets)
                            .toLocaleLowerCase()
                            .includes("supuesto"),
                    provider:
                        semantic?.provider ||
                        null,
                    model:
                        semantic?.model ||
                        null,
                    readOnly:
                        true,
                    objectiveSatisfied:
                        ok,
                    repairCount,
                    error:
                        ok
                            ? null
                            : invalidFormulas.length > 0
                                ? "SPREADSHEET_FORMULA_VALIDATION_FAILED"
                                : "SPREADSHEET_SHEETS_OR_FORMULAS_REQUIRED"
                };
            }
        }),
        register(runtime, {
            name: "page.compose",
            description: "Redacta en memoria el contenido completo y honesto de una landing local, incluidos servicios y ruta de contacto, antes de page.create; no escribe ni publica.",
            output: "PAGE_CONTENT_BLUEPRINT",
            missionDedupeBy: [],
            inputSchema: {
                brandName: "string",
                title: "string",
                instructions: "string"
            },
            execute: async (args = {}, context = {}) => {
                const instruction = resolveInstruction(
                    {
                        ...args,
                        prompt:
                            args.instructions ||
                            context.rawInput ||
                            ""
                    },
                    context
                );
                let semantic = await fetchSemanticConversation(
                    [
                        "Redacta el contenido completo de una landing page como JSON estricto.",
                        "Devuelve solamente un objeto con brandName, title, description, services, whatsapp, contactEmail y whatsappRequested.",
                        "services debe ser un arreglo de objetos {title,description} con contenido específico y honesto.",
                        "No inventes clientes, certificaciones, testimonios, teléfonos, correos, garantías ni experiencia no proporcionada.",
                        "Si el usuario pide WhatsApp pero no dio número, usa whatsapp vacío y whatsappRequested=true; nunca inventes un número.",
                        "La descripción debe tener al menos 20 caracteres y debe existir por lo menos un servicio.",
                        `MARCA=${clean(args.brandName)}`,
                        `TITULO=${clean(args.title)}`,
                        `SOLICITUD=${instruction}`
                    ].join("\n"),
                    {
                        maxOutputTokens:
                            5000
                    }
                );
                let pageInput = null;
                try {
                    pageInput =
                        normalizedPageArtifactInput(
                            extractSemanticJsonObject(
                                semantic?.message ||
                                ""
                            ),
                            clean(args.title)
                        );
                }
                catch(error) {
                    return {
                        ok: false,
                        status:
                            "PAGE_CONTENT_COMPOSITION_INVALID",
                        pageInput: null,
                        readOnly:
                            true,
                        objectiveSatisfied:
                            false,
                        error:
                            error?.message ||
                            "PAGE_CONTENT_JSON_INVALID"
                    };
                }
                const contactReady =
                    pageInput.whatsapp ||
                    pageInput.contactEmail.includes("@") ||
                    pageInput.whatsappRequested;
                const ok =
                    semantic?.ok === true &&
                    pageInput.brandName &&
                    pageInput.title &&
                    pageInput.description.length >= 20 &&
                    pageInput.services.length > 0 &&
                    contactReady;
                return {
                    ok:
                        Boolean(ok),
                    status:
                        ok
                            ? "PAGE_CONTENT_COMPOSED"
                            : "PAGE_CONTENT_COMPOSITION_INCOMPLETE",
                    pageInput,
                    provider:
                        semantic?.provider ||
                        null,
                    model:
                        semantic?.model ||
                        null,
                    readOnly:
                        true,
                    objectiveSatisfied:
                        Boolean(ok),
                    error:
                        ok
                            ? null
                            : "PAGE_CONTENT_OR_CONTACT_REQUIRED"
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
                    toolPackVersion: VERSION,
                    bridgeVersion:
                        bridge.bridgeVersion ||
                        null,
                    status,
                    failures,
                    runtime: {
                        registeredTools,
                        bridgeAvailable:
                            bridge.ok === true,
                        bridgeStatus:
                            bridge.status || "UNKNOWN",
                        bridgeVersion:
                            bridge.bridgeVersion ||
                            null,
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
                allowedDomain: "string",
                exactEntity: "string"
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
                        allowedDomain: args.allowedDomain || "",
                        exactEntity: args.exactEntity || ""
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
            "document.compose",
            "spreadsheet.compose",
            "page.compose",
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
