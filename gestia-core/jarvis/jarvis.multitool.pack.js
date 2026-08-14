import {
    planMarketingRequest
} from "./jarvis.marketing.engine.js?v=v94-marketing-real-delivery-v12-20260809";
import {
    repairCanonicalIdentityValue
} from "./jarvis.identity.integrity.js?v=v94-generalist-production-integrity-v121-20260810";
import {
    normalizePageFactualAudit
} from "./jarvis.page.factual.integrity.js?v=v94-generalist-production-integrity-v121-20260810";


import {
    createOfficialPageSpec
} from "./jarvis.page.creator.js?v=v94-generalist-production-integrity-v121-20260810";

import {
    buildMediaAnalysis,
    createMediaIngestionRecord,
    describeMediaIngestion
} from "./jarvis.media.ingestion.js?v=v94-secure-session-v117-20260810";

import {
    readCapabilityEvidence,
    recordCapabilityEvidence
} from "./jarvis.capability.evidence.js";

import {
    completeJarvisPlanningArguments
} from "./jarvis.multifunction.planner.js?v=v136-reel-media-source-recovery-20260812";
import {
    validateWorkbookFormulaStructure
} from "./jarvis.workbook.validator.js?v=sia7-deep-artifact-validation-v65-20260725";
import {
    extractDocumentContract,
    validateDocumentBlueprint
} from "./jarvis.document.validator.js?v=sia7-exact-template-contract-v84-20260725";
import {
    buildReelMediaBindingPrompt,
    reelMediaCollectionState,
    validateReelMediaBindings
} from "./jarvis.reel.media-binder.js?v=v131-semantic-scene-media-authority-20260811";

const VERSION = "1.55.0-reel-semantic-media-binding-v131";
const SUPERVISION_CLOUD_TIMEOUT_MS = 4500;
const FORENSICS_SUPERVISION_TIMEOUT_MS = 4500;
const DOCUMENT_COMPLETION_MARKER = "[[JARVIS_DOCUMENT_COMPLETE]]";
const DOCUMENT_MAX_CONTINUATIONS = 6;
const DOCUMENT_SEGMENT_COUNT = 3;

function semanticMemoryEnvelope(context = {}) {
    const memory = context?.semanticMemory;
    if (!memory || typeof memory !== "object") return "";
    try {
        return JSON.stringify(memory).slice(0, 24000);
    } catch {
        return "";
    }
}

function canonicalEvidenceEnvelope(context = {}) {
    const evidence = Array.isArray(context?.canonicalEvidence)
        ? context.canonicalEvidence
        : [];
    try {
        return JSON.stringify(evidence).slice(0, 30000);
    } catch {
        return "[]";
    }
}


function normalizePageIdentityEvidenceText(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function collectPageIdentityEvidenceText(value, depth = 0) {
    if (value === null || value === undefined || depth > 5) return "";
    if (typeof value === "string" || typeof value === "number") {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value
            .map(item => collectPageIdentityEvidenceText(item, depth + 1))
            .filter(Boolean)
            .join(" ");
    }
    if (typeof value !== "object") return "";

    const ignoredKeyFragments = [
        "url", "href", "query", "search", "request", "input", "prompt", "instruction"
    ];
    return Object.entries(value)
        .filter(([key]) => {
            const normalizedKey = String(key || "").toLowerCase();
            return !ignoredKeyFragments.some(fragment => normalizedKey.includes(fragment));
        })
        .map(([, nested]) => collectPageIdentityEvidenceText(nested, depth + 1))
        .filter(Boolean)
        .join(" ");
}

function pageResearchIdentityState(context = {}, canonicalBrandName = "") {
    const researchItems = Array.isArray(context?.canonicalEvidence)
        ? context.canonicalEvidence.filter(item => String(item?.tool || "") === "web.research")
        : [];
    const validSources = researchItems.flatMap(item =>
        Array.isArray(item?.validSources)
            ? item.validSources.filter(source => source && typeof source === "object")
            : []
    );
    const canonicalIdentity = normalizePageIdentityEvidenceText(canonicalBrandName);
    const identityGrounded = Boolean(canonicalIdentity) && validSources.some(source => {
        const sourceText = normalizePageIdentityEvidenceText(
            collectPageIdentityEvidenceText(source)
        );
        return Boolean(sourceText) && sourceText.includes(canonicalIdentity);
    });

    return {
        researchObserved: researchItems.length > 0,
        identityGrounded: canonicalIdentity ? identityGrounded : null,
        validSourceCount: validSources.length
    };
}

function limitedEvidencePageInput({
    brandName = "",
    title = "",
    requiredSections = []
} = {}) {
    const disclosure =
        "No hay evidencia suficiente para publicar como hechos la actividad, los servicios o los datos de contacto asociados a este nombre.";
    const sectionDisclosure =
        "Esta sección queda pendiente de verificación. No se publica información específica hasta contar con evidencia suficiente y atribuible a la entidad correcta.";
    const sections = [...new Set(
        (Array.isArray(requiredSections) ? requiredSections : [])
            .map(item =>
                typeof item === "string"
                    ? item
                    : String(item?.title || item?.name || item?.label || "")
            )
            .map(item => String(item || "").trim())
            .filter(Boolean)
    )].slice(0, 24);

    return {
        brandName: clean(brandName),
        title: clean(title, clean(brandName, "Página informativa")),
        description: disclosure,
        services: [],
        requiredSections: sections,
        contentSections: sections.map(sectionTitle => ({
            title: sectionTitle,
            description: sectionDisclosure,
            items: []
        })),
        whatsapp: "",
        contactEmail: "",
        whatsappRequested: false,
        evidenceMode: "insufficient"
    };
}

const MARKETING_PRODUCTION_TOOL_TYPES = Object.freeze({
    "document.create": "document",
    "page.create": "page",
    "image.generate": "image",
    "image.edit": "image",
    "reel.create": "reel",
    "marketing.package.real-media": "campaign_package"
});

const MARKETING_PLANNING_TO_PRODUCTION_TOOL = Object.freeze({
    "page.plan": "page.create",
    "image.plan": "image.generate",
    "reel.plan": "reel.create"
});

export function resolveMarketingMissionProductionScope(
    args = {},
    context = {}
) {
    const current =
        args && typeof args === "object" && !Array.isArray(args)
            ? { ...args }
            : {};
    const requiredToolNames =
        Array.isArray(context?.requiredToolNames)
            ? context.requiredToolNames.map(String).filter(Boolean)
            : [];
    const contractedProductionToolNames =
        [...new Set(
            requiredToolNames.filter(name =>
                Object.prototype.hasOwnProperty.call(
                    MARKETING_PRODUCTION_TOOL_TYPES,
                    name
                )
            )
        )];
    const plannedProductionToolNames =
    [...new Set(requiredToolNames.map(name => MARKETING_PLANNING_TO_PRODUCTION_TOOL[name]).filter(Boolean))];
const declaredArtifacts =
        (Array.isArray(current.productionArtifacts)
            ? current.productionArtifacts
            : [])
            .filter(item =>
                item &&
                typeof item === "object" &&
                !Array.isArray(item) &&
                Object.prototype.hasOwnProperty.call(
                    MARKETING_PRODUCTION_TOOL_TYPES,
                    String(item.toolName || "")
                )
            );
    const semanticProductionRequested =
        current.productionRequested === true;
    const effectiveProductionToolNames =
        [...new Set([
            ...contractedProductionToolNames,
            ...(semanticProductionRequested ? plannedProductionToolNames : [])
        ])];
    const productionRequested =
        semanticProductionRequested ||
        effectiveProductionToolNames.length > 0;
    const productionArtifacts =
        productionRequested
            ? (declaredArtifacts.length > 0
                ? declaredArtifacts
                : effectiveProductionToolNames.map(toolName => ({
                    id: `mission-${toolName.replaceAll(".", "-")}`,
                    type: MARKETING_PRODUCTION_TOOL_TYPES[toolName],
                    toolName,
                    label: toolName
                })))
            : [];

    return {
        ...current,
        productionRequested,
        productionArtifacts
    };
}

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
        budget: { type: "string" },
        mediumBudget: { type: "string" },
        horizon: { type: "string" },
        durationSeconds: { type: "number" },
        productionRequested: { type: "boolean" },
        productionArtifacts: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    type: { type: "string" },
                    toolName: { type: "string" },
                    format: { type: "string" },
                    label: { type: "string" }
                },
                required: ["type", "toolName"],
                additionalProperties: false
            }
        }
    },
    required: [
        "brandName",
        "audience",
        "offer",
        "pain",
        "promise",
        "differentiator",
        "cta",
        "market",
        "campaignObjective",
        "horizon",
        "tone",
        "channels",
        "metrics",
        "productionRequested"
    ],
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
    const chiefArchitectHealth =
        globalThis?.__JARVIS_CHIEF_ARCHITECT_HEALTH__ ||
        readCapabilityEvidence("chief_architect") ||
        null;
    const oneTimeWriteHealth =
        globalThis?.__JARVIS_ONE_TIME_WRITE_HEALTH__ ||
        readCapabilityEvidence("one_time_write_authorization") ||
        null;
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
            "4.9.0-mission-isolation",
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
            "1.2.0-stable-research-objectives",
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
        [query, trace?.seedUrl]
            .map(value => String(value || "").trim())
            .filter(Boolean)
            .filter((value, index, list) => list.indexOf(value) === index)
            .join(" ")
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
                        timeoutMs: 20000,
                        allowedDomain: trace.allowedDomain || "",
                        exactEntity: trace.exactEntity || "",
                        seedUrl: trace.seedUrl || ""
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

async function invokeGroundedMediaAnalysis(files, question, token) {
    const response = await fetch(
        "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisMediaAnalyze",
        {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ data: { files, question: String(question || "").slice(0, 12000) } })
        }
    );
    const payload = await response.json();
    const result = payload?.result || payload?.data || null;
    if (!response.ok || result?.ok !== true || !Array.isArray(result?.sources)) {
        return {
            ok: false,
            status: "MEDIA_ANALYSIS_UNAVAILABLE",
            error: payload?.error?.message || `HTTP_${response.status}`
        };
    }
    return result;
}

const VERIFIED_VISUAL_CLAIMS_CONTRACT =
    "1.4.0-verified-visual-claims";
const MEDIA_CONTRACT_SENSITIVE_LITERAL_PATTERN = /(?:https?:\/\/[^\s"'<>]+|www\.[^\s"'<>]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+(?:com|net|org|app|dev|io|mx|ai|co|es|tech|cloud|web)\b|\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b(?:19|20)\d{2}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b)/gi;
const MEDIA_CONTRACT_QUOTED_LITERAL_PATTERN = /["'`“”‘’]([^"'`“”‘’\n]{2,1000})["'`“”‘’]/g;
const MEDIA_CONTRACT_PROPER_UI_LITERAL_PATTERN = /\b(?:[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+[A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*|[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*)+)\b/g;

function normalizeMediaContractLiteral(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[),.;!?]+$/g, "");
}

function verifiedMediaContractValues(sources = []) {
    return [...new Set((Array.isArray(sources) ? sources : [])
        .flatMap(source =>
            (Array.isArray(source?.visibleData) ? source.visibleData : [])
                .filter(item =>
                    String(item?.legibility || "").trim().toUpperCase() === "VERIFIED" &&
                    Number(item?.confidence || 0) >= 0.98 &&
                    Boolean(String(item?.value || "").trim()) &&
                    Boolean(String(item?.evidence || "").trim())
                )
                .map(item => normalizeMediaContractLiteral(item.value))
        )
        .filter(Boolean))];
}

function mediaContractNarrativeLiterals(value = "") {
    const text = String(value || "");
    const patterns = [
        MEDIA_CONTRACT_SENSITIVE_LITERAL_PATTERN,
        MEDIA_CONTRACT_QUOTED_LITERAL_PATTERN,
        MEDIA_CONTRACT_PROPER_UI_LITERAL_PATTERN
    ];
    const literals = [];
    for (const template of patterns) {
        const pattern = new RegExp(template.source, template.flags);
        for (const match of text.matchAll(pattern)) {
            literals.push(String(match?.[1] || match?.[0] || "").trim());
        }
    }
    return [...new Set(literals.filter(Boolean))];
}

function mediaContractContainsUngroundedLiteral(value, verifiedValues = []) {
    if (value == null) return false;
    if (typeof value === "string") {
        return mediaContractNarrativeLiterals(value).some(literal => {
            const candidate = normalizeMediaContractLiteral(literal);
            return candidate && !verifiedValues.some(verified =>
                verified === candidate ||
                verified.includes(candidate)
            );
        });
    }
    if (Array.isArray(value)) {
        return value.some(item =>
            mediaContractContainsUngroundedLiteral(item, verifiedValues)
        );
    }
    if (typeof value !== "object") return false;
    return Object.values(value).some(item =>
        mediaContractContainsUngroundedLiteral(item, verifiedValues)
    );
}

function mediaNarrativeContractIsValid(result, sources) {
    for (const source of sources) {
        const verifiedValues = verifiedMediaContractValues([source]);
        if (result?.strictVisualOnly === true) {
            if (String(source?.description || "").trim()) return false;
            if (Array.isArray(source?.inferences) && source.inferences.length > 0) return false;
        }
        const narrative = [
            source?.description,
            source?.observations,
            source?.inferences,
            source?.objects,
            source?.composition,
            source?.pages,
            source?.marketingUse,
            source?.quality,
            source?.uncertainty,
            source?.evidence
        ];
        if (narrative.some(value =>
            mediaContractContainsUngroundedLiteral(value, verifiedValues)
        )) {
            return false;
        }
    }

    const globalVerifiedValues = verifiedMediaContractValues(sources);
    return ![
        result?.comparison,
        result?.recommendations
    ].some(value =>
        mediaContractContainsUngroundedLiteral(value, globalVerifiedValues)
    );
}

export function verifyGroundedMediaPrecisionContract(result, files) {
    const version = String(result?.version || "").trim();
    const policy = result?.policy || {};
    const sources = Array.isArray(result?.sources)
        ? result.sources
        : [];
    const sourceContractIsValid =
        sources.length === files.length &&
        sources.every(source =>
            Array.isArray(source?.visibleData) &&
            source.visibleData.every(item => {
                const legibility = String(item?.legibility || "")
                    .trim()
                    .toUpperCase();
                const confidence = Number(item?.confidence || 0);
                const value = String(item?.value || "").trim();
                const evidence = String(item?.evidence || "").trim();

                if (legibility === "UNCERTAIN") {
                    return value.length === 0;
                }

                return (
                    legibility === "VERIFIED" &&
                    confidence >= 0.98 &&
                    value.length > 0 &&
                    evidence.length > 0
                );
            })
        );

    if (
        version !== VERIFIED_VISUAL_CLAIMS_CONTRACT ||
        policy.literalReadingsRequireStructuredEvidence !== true ||
        policy.unverifiedLiteralValuesAreWithheld !== true ||
        sourceContractIsValid !== true ||
        mediaNarrativeContractIsValid(result, sources) !== true
    ) {
        return {
            ok: false,
            status: "MEDIA_ANALYSIS_PRECISION_CONTRACT_UNAVAILABLE",
            error: "MEDIA_ANALYSIS_PRECISION_CONTRACT_UNAVAILABLE",
            requiredVersion: VERIFIED_VISUAL_CLAIMS_CONTRACT,
            receivedVersion: version || null,
            expectedSources: files.length,
            receivedSources: sources.length
        };
    }

    return { ok: true };
}

function verifyGroundedMediaSourceIdentity(result, files) {
    if (!Array.isArray(result?.sources) || result.sources.length !== files.length) {
        return {
            ok: false,
            status: "MEDIA_ANALYSIS_SOURCE_COUNT_MISMATCH",
            error: "MEDIA_ANALYSIS_SOURCE_COUNT_MISMATCH",
            expectedSources: files.length,
            receivedSources: Array.isArray(result?.sources) ? result.sources.length : 0
        };
    }

    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const source = result.sources[index];
        const expectedSourceId = `SOURCE_${index + 1}`;
        const sourceId = String(source?.sourceId || "").trim();
        const fileName = String(source?.fileName || source?.name || "").trim();
        const sha256 = String(source?.sha256 || "").trim().toLowerCase();
        if (
            sourceId !== expectedSourceId ||
            fileName !== file.name ||
            !sha256 ||
            sha256 !== String(file.sha256 || "").trim().toLowerCase()
        ) {
            return {
                ok: false,
                status: "MEDIA_ANALYSIS_SOURCE_IDENTITY_MISMATCH",
                error: "MEDIA_ANALYSIS_SOURCE_IDENTITY_MISMATCH",
                expectedSourceId,
                receivedSourceId: sourceId || null,
                expectedFileName: file.name,
                receivedFileName: fileName || null
            };
        }
    }

    return { ok: true };
}


function verifiedMediaContractItems(source = {}) {
    return (Array.isArray(source?.visibleData) ? source.visibleData : [])
        .filter(item =>
            String(item?.legibility || "").trim().toUpperCase() === "VERIFIED" &&
            Number(item?.confidence || 0) >= 0.98 &&
            Boolean(String(item?.value || "").trim()) &&
            Boolean(String(item?.evidence || "").trim())
        );
}

function mediaVisibleDataConsensusKey(item = {}) {
    const kind = String(item?.kind || "text").trim().toLowerCase();
    const value = normalizeMediaContractLiteral(item?.value || "");
    return kind && value ? `${kind}::${value}` : "";
}

function explicitSensitiveLiteralRequest(question = "", kind = "") {
    const text = String(question || "").toLowerCase();
    const verbs = "(?:lee|leer|extrae|extraer|identifica|identificar|reporta|reportar|dime|indica|indicar|cual|cuál|read|extract|identify|report|tell|what)";
    const terms = {
        date: "(?:fecha|date|dia|día)",
        time: "(?:hora|time|reloj|clock)",
        url: "(?:url|enlace|link|dominio|domain|direccion web|dirección web)",
        number: "(?:numero|número|cifra|cantidad|number|amount|count)",
        identifier: "(?:identificador|identifier|folio|expediente|hash|sha|id)"
    };
    const term = terms[String(kind || "").toLowerCase()];
    if (!term) return true;
    return new RegExp(
        `${verbs}[\\s\\S]{0,80}${term}|${term}[\\s\\S]{0,80}${verbs}`,
        "i"
    ).test(text);
}

const MEDIA_UPPER_UI_LITERAL_PATTERN = /\b[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9-]{2,}\b/g;
const MEDIA_UPPER_UI_LITERAL_STOPWORDS = new Set([
    "SOURCE", "VERIFIED", "UNCERTAIN", "MEDIA", "ANALYSIS", "GROUNDED",
    "UI", "URL", "PDF", "MD", "JSON", "HTML", "HTTP", "HTTPS", "SHA",
    "ID", "API", "GPS", "CI", "DOM"
]);
const MEDIA_UNSUPPORTED_NEGATIVE_VISUAL_CLAIM_PATTERN = /\b(?:absent(?:\s+(?:from|in))?|not\s+present(?:\s+in)?|(?:does|do)\s+not\s+appear(?:\s+in)?|missing\s+from|not\s+shown(?:\s+in)?|ausentes?(?:\s+en)?|no\s+(?:esta|está|estan|están)\s+presentes?(?:\s+en)?|no\s+(?:aparece|aparecen|se\s+muestra|se\s+muestran|existe|existen)(?:\s+en)?|faltan?\s+en|carece\s+de)\b/i;

const MEDIA_UNSUPPORTED_RELATIVE_UI_SCOPE_PATTERN = /\b(?:fewer\s+(?:menu\s+)?(?:options?|items?|entries?|actions?)|more\s+(?:menu\s+)?(?:options?|items?|entries?|actions?)|more\s+limited\s+(?:menu|options?|interface)|less\s+complete\s+(?:menu|options?|interface)|(?:broader|narrower)\s+(?:menu|set\s+of\s+options)|(?:menos|mas|más)\s+(?:opciones|elementos|acciones)|(?:menu|menú)\s+(?:mas|más)\s+(?:limitado|limitada|amplio|amplia|reducido|reducida))\b/i;
const MEDIA_UNSUPPORTED_CONTRADICTION_META_PATTERN = /\b(?:contradict(?:s|ed|ing)?|contradiction|inconsisten(?:cy|t))\b/i;
const MEDIA_CAPTURE_CONTEXT_CLAIM_PATTERN = /\b(?:same date(?: and time)?|same time|system tray|captured (?:at|around) the same time|same user|misma fecha(?: y hora)?|misma hora|bandeja del sistema|capturad[oa]s? (?:a|alrededor de) la misma hora|mismo usuario)\b/i;
const MEDIA_CAPTURE_CONTEXT_REQUEST_PATTERN = /\b(?:system tray|bandeja del sistema|fecha|hora|date|time|reloj|clock|usuario|user)\b/i;

function mediaNarrativeContainsUngroundedUpperUiLiteral(
    value,
    verifiedValues = []
) {
    if (value == null) return false;
    if (typeof value === "string") {
        const pattern = new RegExp(MEDIA_UPPER_UI_LITERAL_PATTERN.source, "g");
        for (const match of value.matchAll(pattern)) {
            const literal = String(match?.[0] || "").trim();
            if (!literal || MEDIA_UPPER_UI_LITERAL_STOPWORDS.has(literal)) continue;
            const candidate = normalizeMediaContractLiteral(literal);
            const grounded = verifiedValues.some(verified =>
                verified === candidate ||
                verified.includes(candidate) ||
                candidate.includes(verified)
            );
            if (!grounded) return true;
        }
        return false;
    }
    if (Array.isArray(value)) {
        return value.some(item =>
            mediaNarrativeContainsUngroundedUpperUiLiteral(item, verifiedValues)
        );
    }
    if (typeof value !== "object") return false;
    return Object.values(value).some(item =>
        mediaNarrativeContainsUngroundedUpperUiLiteral(item, verifiedValues)
    );
}

function mediaNarrativeContainsUnsupportedNegativeVisualClaim(
    value,
    verifiedValues = []
) {
    if (value == null) return false;
    if (typeof value === "string") {
        if (MEDIA_UNSUPPORTED_RELATIVE_UI_SCOPE_PATTERN.test(value)) {
            return true;
        }
        if (!MEDIA_UNSUPPORTED_NEGATIVE_VISUAL_CLAIM_PATTERN.test(value)) {
            return false;
        }
        const normalizedNarrative = normalizeMediaContractLiteral(value);
        return verifiedValues.some(verified =>
            verified.length >= 3 &&
            normalizedNarrative.includes(verified)
        );
    }
    if (Array.isArray(value)) {
        return value.some(item =>
            mediaNarrativeContainsUnsupportedNegativeVisualClaim(
                item,
                verifiedValues
            )
        );
    }
    if (typeof value !== "object") return false;
    return Object.values(value).some(item =>
        mediaNarrativeContainsUnsupportedNegativeVisualClaim(
            item,
            verifiedValues
        )
    );
}

function mediaNarrativeContainsUnsupportedContradictionClaim(
    value,
    verifiedValues = []
) {
    if (value == null) return false;
    if (typeof value === "string") {
        if (!MEDIA_UNSUPPORTED_CONTRADICTION_META_PATTERN.test(value)) {
            return false;
        }
        const normalizedNarrative = normalizeMediaContractLiteral(value);
        const groundedMentions = new Set(
            verifiedValues.filter(verified =>
                verified.length >= 3 &&
                normalizedNarrative.includes(verified)
            )
        );
        return groundedMentions.size < 2;
    }
    if (Array.isArray(value)) {
        return value.some(item =>
            mediaNarrativeContainsUnsupportedContradictionClaim(
                item,
                verifiedValues
            )
        );
    }
    if (typeof value !== "object") return false;
    return Object.values(value).some(item =>
        mediaNarrativeContainsUnsupportedContradictionClaim(
            item,
            verifiedValues
        )
    );
}

function explicitMediaRecommendationRequest(question = "") {
    return /\b(?:recomienda|recomendar|recomendaci(?:o|ó)n(?:es)?|sugiere|sugerir|sugerencias?|mejoras?|mejorar|proponer|propuestas?|recommend|recommendation|suggest|suggestion|improve|improvement)\b/i
        .test(String(question || ""));
}

function mediaNarrativeContainsUnrequestedCaptureContextClaim(
    value,
    question = ""
) {
    if (value == null) return false;
    if (MEDIA_CAPTURE_CONTEXT_REQUEST_PATTERN.test(String(question || ""))) {
        return false;
    }
    if (typeof value === "string") {
        return MEDIA_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value);
    }
    if (Array.isArray(value)) {
        return value.some(item =>
            mediaNarrativeContainsUnrequestedCaptureContextClaim(
                item,
                question
            )
        );
    }
    if (typeof value !== "object") return false;
    return Object.values(value).some(item =>
        mediaNarrativeContainsUnrequestedCaptureContextClaim(
            item,
            question
        )
    );
}

function sanitizeNarrativeAgainstVerifiedValues(value, verifiedValues = []) {
    if (!Array.isArray(value)) return [];
    return value.filter(item =>
        !mediaContractContainsUngroundedLiteral(item, verifiedValues) &&
        !mediaNarrativeContainsUngroundedUpperUiLiteral(item, verifiedValues)
    );
}

export function reconcileIndependentMediaAnalysis(
    initial,
    audited,
    files,
    question = ""
) {
    const initialSources = Array.isArray(initial?.sources) ? initial.sources : [];
    const auditedSources = Array.isArray(audited?.sources) ? audited.sources : [];
    let disputedLiteralCount = 0;
    let suppressedPeripheralLiteralCount = 0;
    let suppressedUnsupportedNegativeVisualClaimCount = 0;
    let suppressedPeripheralNarrativeCount = 0;
    let suppressedUnrequestedRecommendationCount = 0;

    const sources = auditedSources.map((source, index) => {
        const first = initialSources[index] || {};
        const firstItems = verifiedMediaContractItems(first);
        const secondItems = verifiedMediaContractItems(source);
        const firstKeys = new Set(
            firstItems.map(mediaVisibleDataConsensusKey).filter(Boolean)
        );
        const secondKeys = new Set(
            secondItems.map(mediaVisibleDataConsensusKey).filter(Boolean)
        );

        for (const key of firstKeys) {
            if (!secondKeys.has(key)) disputedLiteralCount += 1;
        }
        for (const key of secondKeys) {
            if (!firstKeys.has(key)) disputedLiteralCount += 1;
        }

        const visibleData = secondItems.filter(item => {
            const key = mediaVisibleDataConsensusKey(item);
            if (!key || !firstKeys.has(key)) return false;
            const kind = String(item?.kind || "text").trim().toLowerCase();
            if (
                ["date", "time", "url", "number", "identifier"].includes(kind) &&
                !explicitSensitiveLiteralRequest(question, kind)
            ) {
                suppressedPeripheralLiteralCount += 1;
                return false;
            }
            return true;
        });

        const verifiedValues = verifiedMediaContractValues([{ visibleData }]);
        const sanitizeSourceNarrative = value =>
            sanitizeNarrativeAgainstVerifiedValues(
                value,
                verifiedValues
            ).filter(item => {
                const unsupportedNarrativeClaim =
                    audited?.strictVisualOnly === true &&
                    (
                        mediaNarrativeContainsUnsupportedNegativeVisualClaim(
                            item,
                            verifiedValues
                        ) ||
                        mediaNarrativeContainsUnsupportedContradictionClaim(
                            item,
                            verifiedValues
                        )
                    );
                if (unsupportedNarrativeClaim) {
                    suppressedUnsupportedNegativeVisualClaimCount += 1;
                    return false;
                }
                const peripheralCaptureContext =
                    audited?.strictVisualOnly === true &&
                    mediaNarrativeContainsUnrequestedCaptureContextClaim(
                        item,
                        question
                    );
                if (peripheralCaptureContext) {
                    suppressedPeripheralNarrativeCount += 1;
                    return false;
                }
                return true;
            });
        const uncertainty = sanitizeSourceNarrative(source?.uncertainty);
        if (firstKeys.size !== secondKeys.size || [...firstKeys].some(key => !secondKeys.has(key))) {
            uncertainty.push(
                "Una o mas lecturas literales difirieron entre pases independientes y se omitieron."
            );
        }

        return {
            ...source,
            description:
                audited?.strictVisualOnly === true
                    ? ""
                    : String(source?.description || ""),
            observations:
                sanitizeSourceNarrative(source?.observations),
            objects:
                sanitizeSourceNarrative(source?.objects),
            inferences:
                audited?.strictVisualOnly === true
                    ? []
                    : sanitizeSourceNarrative(source?.inferences),
            visibleData,
            pages:
                sanitizeSourceNarrative(source?.pages),
            marketingUse:
                sanitizeSourceNarrative(source?.marketingUse),
            uncertainty: [...new Set(uncertainty)],
            evidence:
                sanitizeSourceNarrative(source?.evidence)
        };
    });

    const globalVerifiedValues = verifiedMediaContractValues(sources);
    const groundedComparisonDifferences =
        sanitizeNarrativeAgainstVerifiedValues(
            audited?.comparison?.differences,
            globalVerifiedValues
        );
    const comparisonDifferences =
        groundedComparisonDifferences.filter(item => {
            const unsupportedNegativeClaim =
                audited?.strictVisualOnly === true &&
                mediaNarrativeContainsUnsupportedNegativeVisualClaim(
                    item,
                    globalVerifiedValues
                );
            if (unsupportedNegativeClaim) {
                suppressedUnsupportedNegativeVisualClaimCount += 1;
            }
            return !unsupportedNegativeClaim;
        });
    const comparison = audited?.comparison && typeof audited.comparison === "object"
        ? {
            ...audited.comparison,
            differences: comparisonDifferences
        }
        : audited?.comparison;
    const groundedRecommendations = sanitizeNarrativeAgainstVerifiedValues(
        audited?.recommendations,
        globalVerifiedValues
    );
    const suppressUnrequestedRecommendations =
        audited?.strictVisualOnly === true &&
        !explicitMediaRecommendationRequest(question);
    if (suppressUnrequestedRecommendations) {
        suppressedUnrequestedRecommendationCount = groundedRecommendations.length;
    }
    const recommendations = suppressUnrequestedRecommendations
        ? []
        : groundedRecommendations;

    const sourceManifest = files.map((file, index) => ({
        sourceId: `SOURCE_${index + 1}`,
        fileName: file.name,
        sha256: String(file.sha256 || "").trim().toLowerCase()
    }));
    const verifiedVisualClaims = sources.flatMap(source =>
        verifiedMediaContractItems(source).map(item => ({
            sourceId: source?.sourceId || null,
            fileName: source?.fileName || source?.name || null,
            kind: item?.kind || "text",
            value: item?.value || "",
            page: item?.page || 1,
            confidence: Number(item?.confidence || 0),
            evidence: item?.evidence || "",
            legibility: "VERIFIED"
        }))
    );

    return {
        result: {
            ...audited,
            sources,
            sourceManifest,
            comparison,
            recommendations,
            verifiedVisualClaims,
            policy: {
                ...(audited?.policy || {}),
                independentPassLiteralConsensusRequired: true,
                peripheralSensitiveLiteralSuppression: true,
                negativeVisualClaimsRequireStructuredEvidence: true,
                sourceNarrativeClaimsRequireStructuredEvidence: true,
                peripheralCaptureContextNarrativeSuppression: true,
                strictVisualUnrequestedRecommendationsSuppressed: true
            }
        },
        consensusVerifiedLiteralCount: verifiedVisualClaims.length,
        disputedLiteralCount,
        suppressedPeripheralLiteralCount,
        suppressedUnsupportedNegativeVisualClaimCount,
        suppressedPeripheralNarrativeCount,
        suppressedUnrequestedRecommendationCount
    };
}

export function buildMediaPrecisionAuditQuestion(question, result) {
    const auditSources = (Array.isArray(result?.sources) ? result.sources : [])
        .map(source => ({
            sourceId: source?.sourceId,
            fileName: source?.fileName || source?.name,
            sha256: source?.sha256
        }));
    return [
        "AUDITORIA_DE_PRECISION_VISUAL_INDEPENDIENTE",
        "Vuelve a inspeccionar directamente cada archivo desde cero.",
        "El segundo pase NO recibe ningun literal, transcripcion ni lectura del primer pase.",
        "No intentes confirmar el borrador anterior: produce una lectura independiente basada solo en los pixeles.",
        "Conserva cada afirmacion en la source del archivo donde sea visible y no mezcles fuentes.",
        "Separa descripcion visual de transcripcion literal.",
        "No traduzcas, autocorrijas, completes ni normalices texto visible.",
        "No emitas una URL, fecha, hora, ano, cifra o identificador si no puedes leerlo completo con certeza alta.",
        "Todo texto literal debe ir en visibleData con evidencia, confidence y legibility.",
        "Usa legibility=VERIFIED solamente para una lectura completa y confidence igual o mayor a 0.98.",
        "Si una lectura no cumple ese umbral, omite su valor y explica la limitacion en uncertainty.",
        "Responde en espanol y conserva los nombres de archivo literalmente.",
        "En comparison.differences incluye solo diferencias visibles entre las fuentes.",
        "No concluyas que un elemento esta ausente, no existe o no esta presente en otra fuente solamente porque no aparecio en visibleData.",
        "Formula las diferencias como afirmaciones positivas verificadas por fuente; sin evidencia negativa estructurada, la ausencia debe permanecer desconocida.",
        "No afirmes que un menu tiene mas o menos opciones, es mas limitado o amplio, o cubre mas o menos funciones salvo que exista evidencia estructurada y exhaustiva de cardinalidad para ambas fuentes; si no existe, describe solo lo positivamente verificado en cada fuente.",
        explicitMediaRecommendationRequest(question)
            ? "La solicitud original pide recomendaciones: en recommendations incluye solo mejoras respaldadas directamente por evidencia visual verificada."
            : "La solicitud original no pide recomendaciones: deja recommendations=[] y no propongas mejoras, matrices, comparativas futuras ni acciones de producto.",
        `FUENTES_PARA_REINSPECCION=${JSON.stringify(auditSources)}`,
        `SOLICITUD_ORIGINAL=${String(question || "").slice(0, 3000)}`
    ].join("\n");
}

async function fetchGroundedMediaAnalysis(attachments = [], question = "") {
    const user = await waitForAuthenticatedUser();
    if (!user) return { ok: false, status: "AUTH_REQUIRED", error: "AUTH_REQUIRED" };
    if (typeof globalThis?.JarvisLocalBridge?.requestJson !== "function") {
        return { ok: false, status: "LOCAL_BRIDGE_REQUIRED", error: "LOCAL_BRIDGE_REQUIRED" };
    }
    const supported = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
    const files = [];
    const boundedAttachments = attachments.slice(0, 8);
    let totalBytes = 0;
    if (boundedAttachments.length === 0) {
        return {
            ok: false,
            status: "READABLE_MEDIA_ARTIFACT_REQUIRED",
            error: "READABLE_MEDIA_ARTIFACT_REQUIRED"
        };
    }
    for (const attachment of boundedAttachments) {
        const name = attachment?.name || "archivo";
        const mimeType = String(attachment?.mimeType || "").toLowerCase();
        if (!attachment?.artifact || !supported.has(mimeType)) {
            return {
                ok: false,
                status: "MEDIA_ANALYSIS_ARTIFACT_SET_INCOMPLETE",
                error: "MEDIA_ANALYSIS_ARTIFACT_SET_INCOMPLETE",
                fileName: name
            };
        }
        let payload;
        try {
            payload = await globalThis.JarvisLocalBridge.requestJson(
                "/artifact/read",
                { output: attachment.artifact },
                { timeoutMs: 30000 }
            );
        } catch (error) {
            return {
                ok: false,
                status: "MEDIA_ANALYSIS_ARTIFACT_UNREADABLE",
                error: error?.message || "MEDIA_ANALYSIS_ARTIFACT_UNREADABLE",
                fileName: name
            };
        }
        const bytes = Number(payload?.bytes || 0);
        if (payload?.ok !== true || !payload?.dataBase64 || bytes < 1 || bytes > 7 * 1024 * 1024) {
            return {
                ok: false,
                status: "MEDIA_ANALYSIS_ARTIFACT_UNREADABLE",
                error: "MEDIA_ANALYSIS_ARTIFACT_UNREADABLE",
                fileName: name
            };
        }
        if (totalBytes + bytes > 9 * 1024 * 1024) {
            return {
                ok: false,
                status: "MEDIA_ANALYSIS_BATCH_TOO_LARGE",
                error: "MEDIA_ANALYSIS_BATCH_TOO_LARGE",
                fileName: name
            };
        }
        totalBytes += bytes;
        files.push({
            name,
            mimeType: attachment.mimeType || payload.mimeType,
            dataBase64: payload.dataBase64,
            bytes,
            sha256: String(attachment?.sha256 || payload?.sha256 || "").trim().toLowerCase()
        });
    }
    if (files.some(file => !file.sha256)) {
        return {
            ok: false,
            status: "MEDIA_ANALYSIS_SOURCE_HASH_REQUIRED",
            error: "MEDIA_ANALYSIS_SOURCE_HASH_REQUIRED"
        };
    }
    const token = await user.getIdToken();
    const initial = await invokeGroundedMediaAnalysis(files, question, token);
    if (initial?.ok !== true) return initial;
    const initialIdentity = verifyGroundedMediaSourceIdentity(initial, files);
    if (!initialIdentity.ok) return initialIdentity;
    const initialPrecisionContract =
        verifyGroundedMediaPrecisionContract(initial, files);
    if (!initialPrecisionContract.ok) return initialPrecisionContract;

    const audited = await invokeGroundedMediaAnalysis(
        files,
        buildMediaPrecisionAuditQuestion(question, initial),
        token
    );
    if (audited?.ok !== true) {
        return {
            ok: false,
            status: "MEDIA_ANALYSIS_PRECISION_AUDIT_FAILED",
            error: audited?.error || "MEDIA_ANALYSIS_PRECISION_AUDIT_FAILED"
        };
    }
    const auditedIdentity = verifyGroundedMediaSourceIdentity(audited, files);
    if (!auditedIdentity.ok) {
        return {
            ...auditedIdentity,
            status: "MEDIA_ANALYSIS_PRECISION_AUDIT_FAILED",
            error: auditedIdentity.error
        };
    }
    const auditedPrecisionContract =
        verifyGroundedMediaPrecisionContract(audited, files);
    if (!auditedPrecisionContract.ok) {
        return {
            ...auditedPrecisionContract,
            status: "MEDIA_ANALYSIS_PRECISION_AUDIT_FAILED",
            error: auditedPrecisionContract.error
        };
    }

    const reconciled =
        reconcileIndependentMediaAnalysis(
            initial,
            audited,
            files,
            question
        );
    const reconciledPrecisionContract =
        verifyGroundedMediaPrecisionContract(
            reconciled.result,
            files
        );
    if (!reconciledPrecisionContract.ok) {
        return {
            ...reconciledPrecisionContract,
            status: "MEDIA_ANALYSIS_PRECISION_AUDIT_FAILED",
            error: reconciledPrecisionContract.error
        };
    }

    const result = {
        ...reconciled.result,
        precisionAudit: {
            ok: true,
            status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
            providerPasses: 2,
            effectiveToolExecutions: 1,
            sourceIdentityVerified: true,
            independentPassLiteralConsensusRequired: true,
            exactTextRequiresConfidence: 0.98,
            consensusVerifiedLiteralCount:
                reconciled.consensusVerifiedLiteralCount,
            disputedLiteralCount:
                reconciled.disputedLiteralCount,
            suppressedPeripheralLiteralCount:
                reconciled.suppressedPeripheralLiteralCount,
            suppressedUnsupportedNegativeVisualClaimCount:
                reconciled.suppressedUnsupportedNegativeVisualClaimCount,
            suppressedPeripheralNarrativeCount:
                reconciled.suppressedPeripheralNarrativeCount,
            suppressedUnrequestedRecommendationCount:
                reconciled.suppressedUnrequestedRecommendationCount,
            negativeVisualClaimsRequireStructuredEvidence: true,
            strictVisualUnrequestedRecommendationsSuppressed: true,
            sourceNarrativeClaimsRequireStructuredEvidence: true,
            initialVersion: initial.version || null,
            auditedVersion: audited.version || null
        }
    };
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

function contactDigits(value = "") {
    let digits = "";
    for (const character of String(value || "")) {
        const code = character.charCodeAt(0);
        if (code >= 48 && code <= 57) {
            digits += character;
        }
    }
    return digits;
}

export function groundPageContactInput(
    value = {},
    instruction = "",
    declared = {}
) {
    const pageInput =
        normalizedPageArtifactInput(value);
    const source =
        String(instruction || "");
    const sourceLower =
        source.toLocaleLowerCase();
    const declaredEmail =
        String(
            declared?.contactEmail ||
            pageInput.contactEmail ||
            ""
        ).trim();
    const declaredWhatsapp =
        contactDigits(
            declared?.whatsapp ||
            pageInput.whatsapp ||
            ""
        );
    const sourceDigits =
        contactDigits(source);
    const emailGrounded =
        Boolean(declaredEmail) &&
        sourceLower.includes(
            declaredEmail.toLocaleLowerCase()
        );
    const whatsappGrounded =
        declaredWhatsapp.length >= 7 &&
        sourceDigits.includes(declaredWhatsapp);

    return {
        ...pageInput,
        contactEmail:
            emailGrounded
                ? declaredEmail
                : "",
        whatsapp:
            whatsappGrounded
                ? declaredWhatsapp
                : "",
        whatsappRequested:
            declared?.whatsappRequested === true
    };
}

function pageSectionContractKey(value = "") {
    return clean(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function normalizePageRequiredSections(value = [], fallback = []) {
    const primary = Array.isArray(value) && value.length > 0 ? value : fallback;
    return (Array.isArray(primary) ? primary : [])
        .slice(0, 16)
        .map(item => typeof item === "string" ? clean(item) : clean(item?.title || item?.name))
        .filter(Boolean)
        .filter((item, index, list) =>
            list.findIndex(candidate => pageSectionContractKey(candidate) === pageSectionContractKey(item)) === index
        );
}

function normalizePageContentSections(value = []) {
    return (Array.isArray(value) ? value : [])
        .slice(0, 16)
        .map(section => {
            if (!section || typeof section !== "object") return null;
            const title = clean(section.title || section.name);
            const description = clean(section.description || section.body);
            const items = (Array.isArray(section.items) ? section.items : [])
                .slice(0, 8)
                .map(item => {
                    if (typeof item === "string") return { title: clean(item), description: "" };
                    if (!item || typeof item !== "object") return null;
                    return {
                        title: clean(item.title || item.name),
                        description: clean(item.description || item.body)
                    };
                })
                .filter(item => item && (item.title || item.description));
            return title && (description || items.length > 0)
                ? { title, description, items }
                : null;
        })
        .filter(Boolean);
}

function normalizedPageArtifactInput(value = {}, fallbackTitle = "", fallbackRequiredSections = [], canonicalBrandName = "", canonicalTitle = "") {
    const canonicalBrand = clean(canonicalBrandName);
    const canonicalPageTitle = clean(canonicalTitle, fallbackTitle);
    const repairedValue = canonicalBrand
        ? repairCanonicalIdentityValue(value, canonicalBrand)
        : value;
    const services = Array.isArray(repairedValue?.services)
        ? repairedValue.services.slice(0, 12).map(service => ({
            title: clean(service?.title || service?.name),
            description: clean(service?.description)
        })).filter(service =>
            service.title &&
            service.description
        )
        : [];
    const requiredSections = normalizePageRequiredSections(
        repairedValue?.requiredSections,
        fallbackRequiredSections
    );
    const contentSections = normalizePageContentSections(repairedValue?.contentSections);
    return {
        brandName: clean(canonicalBrand, clean(repairedValue?.brandName)),
        title: clean(canonicalPageTitle, clean(repairedValue?.title)),
        description: clean(repairedValue?.description),
        services,
        requiredSections,
        contentSections,
        whatsapp: clean(value?.whatsapp).replace(/[^0-9]/g, ""),
        contactEmail: clean(value?.contactEmail),
        whatsappRequested: value?.whatsappRequested === true,
        evidenceMode:
            clean(value?.evidenceMode).toLowerCase() === "insufficient"
                ? "insufficient"
                : ""
    };
}

function hasPlanningValue(value) {
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "boolean") return true;
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

const CLOUD_VISUAL_MIME_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp"
]);
const LOCAL_DOCUMENT_EXTENSIONS = new Set([
    ".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml",
    ".pdf", ".docx", ".xlsx", ".pptx",
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".html",
    ".py", ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".sql"
]);

function attachmentExtension(attachment = {}) {
    const name = String(attachment?.name || attachment?.artifact || "")
        .trim()
        .toLowerCase()
        .split(/[?#]/)[0];
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot) : "";
}

function isCloudVisualAttachment(attachment = {}) {
    return CLOUD_VISUAL_MIME_TYPES.has(
        String(attachment?.mimeType || "").trim().toLowerCase()
    );
}

function isLocalDocumentAttachment(attachment = {}) {
    return LOCAL_DOCUMENT_EXTENSIONS.has(attachmentExtension(attachment));
}

function exactDocumentTextChunks(value = "", maxChars = 3500) {
    const text = String(value || "");
    if (!text.trim()) return [];
    const chunks = [];
    let cursor = 0;
    while (cursor < text.length) {
        let end = Math.min(text.length, cursor + maxChars);
        if (end < text.length) {
            const newline = text.lastIndexOf("\n", end);
            const space = text.lastIndexOf(" ", end);
            const boundary = Math.max(newline, space);
            if (boundary > cursor + Math.floor(maxChars * 0.65)) {
                end = boundary;
            }
        }
        chunks.push(text.slice(cursor, end));
        cursor = end;
        while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    }
    return chunks.filter(chunk => chunk.trim());
}

async function fetchLocalDocumentAnalysis(
    attachments = [],
    question = "",
    authority = {}
) {
    if (typeof globalThis?.JarvisLocalBridge?.requestJson !== "function") {
        return {
            ok: false,
            status: "LOCAL_BRIDGE_REQUIRED",
            error: "LOCAL_BRIDGE_REQUIRED"
        };
    }
    const sources = [];
    for (let subsetIndex = 0; subsetIndex < attachments.length; subsetIndex += 1) {
        const attachment = attachments[subsetIndex];
        const sourceIndex = Number.isInteger(attachment?.__sourceIndex)
            ? attachment.__sourceIndex
            : subsetIndex;
        let extracted;
        try {
            extracted = await globalThis.JarvisLocalBridge.requestJson(
                "/artifact/extract",
                {
                    output: attachment?.artifact,
                    sourceName: attachment?.name,
                    mimeType: attachment?.mimeType
                },
                { timeoutMs: 60000 }
            );
        }
        catch(error) {
            return {
                ok: false,
                status: "DOCUMENT_ANALYSIS_EXTRACTION_FAILED",
                error: error?.message || "DOCUMENT_ANALYSIS_EXTRACTION_FAILED",
                fileName: attachment?.name || "archivo"
            };
        }
        if (extracted?.ok !== true || !Array.isArray(extracted?.pages)) {
            return {
                ok: false,
                status: extracted?.status || "DOCUMENT_ANALYSIS_EXTRACTION_FAILED",
                error: extracted?.error || "DOCUMENT_ANALYSIS_EXTRACTION_FAILED",
                fileName: attachment?.name || "archivo"
            };
        }
        const expectedSha256 = String(attachment?.sha256 || "").trim().toLowerCase();
        const receivedSha256 = String(extracted?.sha256 || "").trim().toLowerCase();
        if (
            !receivedSha256 ||
            (expectedSha256 && receivedSha256 !== expectedSha256)
        ) {
            return {
                ok: false,
                status: "DOCUMENT_ANALYSIS_SOURCE_HASH_MISMATCH",
                error: "DOCUMENT_ANALYSIS_SOURCE_HASH_MISMATCH",
                fileName: attachment?.name || extracted?.sourceName || "archivo",
                expectedSha256: expectedSha256 || null,
                receivedSha256: receivedSha256 || null
            };
        }
        const sourceId = `SOURCE_${sourceIndex + 1}`;
        const record = createMediaIngestionRecord(
            {
                sourceId,
                sourceName: extracted.sourceName || attachment?.name || "archivo",
                mimeType: extracted.mimeType,
                sha256: receivedSha256,
                pages: extracted.pages,
                extractor: `jarvis_document_extractor:${extracted.version || "unknown"}`,
                coverageUnit: extracted.coverageUnit || "document",
                physicalPageCountKnown:
                    extracted?.metadata?.physicalPageCountKnown !== false,
                embeddedImagesRequireVisualAnalysis:
                    extracted?.metadata?.embeddedImagesRequireVisualAnalysis === true
            },
            authority
        );
        const analysis = buildMediaAnalysis(
            record,
            {
                questions: [question].filter(Boolean)
            }
        );
        const visibleData = extracted.pages.flatMap((page, pageIndex) =>
            exactDocumentTextChunks(page?.text || "").map((value, chunkIndex) => ({
                kind: "document_text",
                value,
                evidence: [
                    "DIGITAL_SOURCE_EXTRACTION",
                    extracted.coverageUnit || "document",
                    String(page?.label || page?.pageNumber || pageIndex + 1),
                    `chunk_${chunkIndex + 1}`
                ].join(":"),
                confidence: 1,
                legibility: "VERIFIED",
                pageNumber: Number(page?.pageNumber || pageIndex + 1),
                sourceId
            }))
        );
        const uncertainty = [];
        if (analysis?.analysis?.coverage?.exhaustive !== true) {
            uncertainty.push(
                "La extracción no cubrió de forma verificable todas las unidades lógicas del documento."
            );
        }
        if (extracted?.metadata?.embeddedImagesRequireVisualAnalysis === true) {
            uncertainty.push(
                `El documento contiene ${Number(extracted?.metadata?.embeddedImageCount || 0)} imagen(es) incrustada(s) cuyo contenido visual requiere análisis independiente.`
            );
        }
        sources.push({
            sourceId,
            sourceOrder: sourceIndex,
            fileName: extracted.sourceName || attachment?.name || "archivo",
            name: extracted.sourceName || attachment?.name || "archivo",
            mimeType: extracted.mimeType,
            sha256: receivedSha256,
            documentType: extracted.documentType || "document",
            coverageUnit: extracted.coverageUnit || "document",
            pageCount: extracted.pages.length,
            pages: extracted.pages,
            extractedText: analysis?.analysis?.extractedText || "",
            tables: analysis?.analysis?.tables || [],
            visibleData,
            evidence: visibleData.map(item => ({
                sourceId,
                pageNumber: item.pageNumber,
                evidence: item.evidence,
                value: item.value,
                confidence: item.confidence,
                legibility: item.legibility
            })),
            observations: [],
            inferences: [],
            description: "",
            composition: [],
            objects: [],
            marketingUse: [],
            quality: {
                digitalExtraction: true,
                sourceHashVerified: true,
                extractionVersion: extracted.version || null
            },
            uncertainty,
            coverage: analysis?.analysis?.coverage || null,
            claimIntegrity: analysis?.analysis?.claimIntegrity || null,
            strictVisualOnly: false
        });
    }
    const sortedSources = sources.sort((left, right) =>
        Number(left.sourceOrder || 0) - Number(right.sourceOrder || 0)
    );
    const objectiveSatisfied = sortedSources.every(source =>
        source?.coverage?.exhaustive === true
    );
    return {
        ok: true,
        objectiveSatisfied,
        status: objectiveSatisfied
            ? "LOCAL_DOCUMENT_ANALYSIS_READY"
            : "LOCAL_DOCUMENT_ANALYSIS_PARTIAL_VERIFIED",
        source: "JARVIS_LOCAL_DIGITAL_DOCUMENT_ANALYSIS",
        version: "1.0.0-source-scoped-digital-document-analysis",
        strictVisualOnly: false,
        sources: sortedSources,
        sourceManifest: sortedSources.map(source => ({
            sourceId: source.sourceId,
            fileName: source.fileName,
            sha256: source.sha256,
            mimeType: source.mimeType,
            coverageUnit: source.coverageUnit,
            coverage: source.coverage
        })),
        comparison: { differences: [] },
        recommendations: [],
        verifiedVisualClaims: sortedSources.flatMap(source => source.visibleData),
        precisionAudit: {
            ok: true,
            status: "LOCAL_DIGITAL_EXTRACTION_VERIFIED",
            sourceIdentityVerified: true,
            sha256Verified: true,
            digitalSourceExtraction: true,
            visualClaimsSynthesized: false
        },
        policy: {
            literalReadingsRequireStructuredEvidence: true,
            unverifiedLiteralValuesAreWithheld: true,
            sourceNarrativeClaimsRequireStructuredEvidence: true,
            negativeVisualClaimsRequireStructuredEvidence: true,
            localDigitalDocumentExtraction: true,
            physicalPageClaimsRequireKnownPagination: true,
            embeddedImagesRequireIndependentVisualAnalysis: true
        }
    };
}

function remapCloudMediaSources(result = {}, attachments = []) {
    const sourceIdMap = new Map(
        attachments.map((attachment, subsetIndex) => [
            `SOURCE_${subsetIndex + 1}`,
            `SOURCE_${Number.isInteger(attachment?.__sourceIndex) ? attachment.__sourceIndex + 1 : subsetIndex + 1}`
        ])
    );
    const sources = (Array.isArray(result?.sources) ? result.sources : [])
        .map((source, subsetIndex) => ({
            ...source,
            sourceId: sourceIdMap.get(String(source?.sourceId || "")) ||
                `SOURCE_${Number.isInteger(attachments[subsetIndex]?.__sourceIndex)
                    ? attachments[subsetIndex].__sourceIndex + 1
                    : subsetIndex + 1}`,
            sourceOrder: Number.isInteger(attachments[subsetIndex]?.__sourceIndex)
                ? attachments[subsetIndex].__sourceIndex
                : subsetIndex
        }));
    return {
        ...result,
        sources,
        sourceManifest: sources.map(source => ({
            sourceId: source.sourceId,
            fileName: source.fileName || source.name,
            sha256: source.sha256,
            mimeType: source.mimeType || null
        })),
        verifiedVisualClaims: (Array.isArray(result?.verifiedVisualClaims)
            ? result.verifiedVisualClaims
            : []).map(item => ({
                ...item,
                sourceId: sourceIdMap.get(String(item?.sourceId || "")) || item?.sourceId
            }))
    };
}

function mergeHybridMediaDocumentAnalysis(localResult, cloudResult) {
    const sources = [
        ...(Array.isArray(localResult?.sources) ? localResult.sources : []),
        ...(Array.isArray(cloudResult?.sources) ? cloudResult.sources : [])
    ].sort((left, right) =>
        Number(left?.sourceOrder || 0) - Number(right?.sourceOrder || 0)
    );
    return {
        ok: true,
        objectiveSatisfied:
            localResult?.objectiveSatisfied === true &&
            cloudResult?.ok === true,
        status:
            localResult?.objectiveSatisfied === true && cloudResult?.ok === true
                ? "HYBRID_MEDIA_DOCUMENT_ANALYSIS_READY"
                : "HYBRID_MEDIA_DOCUMENT_ANALYSIS_PARTIAL_VERIFIED",
        source: "JARVIS_HYBRID_VERIFIED_SOURCE_ANALYSIS",
        version: "1.0.0-hybrid-source-analysis",
        strictVisualOnly: false,
        sources,
        sourceManifest: sources.map(source => ({
            sourceId: source.sourceId,
            fileName: source.fileName || source.name,
            sha256: source.sha256,
            mimeType: source.mimeType || null,
            coverage: source.coverage || null
        })),
        comparison: { differences: [] },
        recommendations: [],
        verifiedVisualClaims: [
            ...(Array.isArray(localResult?.verifiedVisualClaims) ? localResult.verifiedVisualClaims : []),
            ...(Array.isArray(cloudResult?.verifiedVisualClaims) ? cloudResult.verifiedVisualClaims : [])
        ],
        precisionAudit: {
            ok: true,
            status: "HYBRID_SOURCE_ANALYSIS_VERIFIED",
            localDigitalExtractionVerified: localResult?.ok === true,
            cloudVisualDoublePassVerified: cloudResult?.precisionAudit?.ok === true,
            sourceIdentityVerified: true,
            sha256Verified: true,
            crossSourceComparisonDeferredToGroundedComposer: true
        },
        policy: {
            ...(cloudResult?.policy || {}),
            ...(localResult?.policy || {}),
            sourceNarrativeClaimsRequireStructuredEvidence: true,
            unverifiedLiteralValuesAreWithheld: true,
            crossSourceComparisonRequiresGroundedComposer: true
        }
    };
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
    const valid = Boolean(brandName && title && cta) && Number.isFinite(durationSeconds) && durationSeconds >= 30 && durationSeconds <= 180 &&
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

                const memoryEnvelope =
                    semanticMemoryEnvelope(context);
                const semanticInstruction =
                    memoryEnvelope
                        ? [
                            "Responde la instrucción actual usando memoria semántica únicamente como contexto asesor.",
                            "La instrucción actual manda. La memoria ayuda a recordar conversaciones, decisiones y errores previos, pero nunca se convierte por sí sola en evidencia factual de la misión actual.",
                            "No uses diccionarios locales, regex ni reglas léxicas para decidir relevancia; razona semánticamente sobre el contexto recibido.",
                            `MEMORIA_SEMANTICA_ADVISORY=${memoryEnvelope}`,
                            `INSTRUCCION_ACTUAL=${instruction}`
                        ].join("\n")
                        : instruction;

                const result =
                    await fetchSemanticConversation(
                        semanticInstruction,
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
                const canonicalEvidence =
                    canonicalEvidenceEnvelope(context);
                const modelInstruction = [
                    instruction,
                    canonicalEvidence !== "[]"
                        ? `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`
                        : "",
                    "REGLA_FACTUAL: todos los hechos concretos del documento deben estar en la solicitud actual o en la evidencia canónica. La memoria, un plan previo y una propuesta creativa no prueban hechos. Lo desconocido debe declararse como propuesta o dato no disponible; nunca inventes teléfonos, direcciones, fechas, certificaciones, métricas, URLs, personas ni resultados."
                ].filter(Boolean).join("\n\n");
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
                            instruction: modelInstruction,
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
                                `SOLICITUD=${modelInstruction}`
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
                                `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`,
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
                const canonicalEvidence =
                    canonicalEvidenceEnvelope(context);
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
                        "No inventes datos de mercado ni datos del negocio. Cualquier proyección creativa debe rotularse claramente como SUPUESTO o PROPUESTA y nunca confundirse con un hecho observado.",
                        "Teléfonos, direcciones, fechas, certificaciones, métricas históricas, URLs, nombres de personas y resultados solo pueden copiarse de la solicitud actual o de EVIDENCIA_CANONICA_DE_MISION.",
                        "Incluye todos los conceptos, subtotales, porcentajes y resultado final pedidos. No agregues explicaciones fuera del JSON.",
                        `TITULO=${title}`,
                        `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`,
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
                                `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`,
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
                instructions: "string",
                sections: "array",
                contactEmail: "string",
                whatsapp: "string",
                whatsappRequested: "boolean"
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
                const canonicalEvidence =
                    canonicalEvidenceEnvelope(context);
                const identityEvidence =
                    pageResearchIdentityState(
                        context,
                        clean(args.brandName)
                    );
                if (
                    identityEvidence.researchObserved === true &&
                    identityEvidence.identityGrounded === false
                ) {
                    const pageInput =
                        limitedEvidencePageInput({
                            brandName: args.brandName,
                            title: args.title,
                            requiredSections:
                                Array.isArray(args.sections)
                                    ? args.sections
                                    : []
                        });
                    return {
                        ok: true,
                        status: "PAGE_CONTENT_COMPOSED",
                        pageInput,
                        requestedSectionsSatisfied: true,
                        identityPreserved: true,
                        factualIntegrityPassed: true,
                        factualAudit: {
                            status: "PAGE_FACTUAL_INTEGRITY_LIMITED_EVIDENCE",
                            unsupportedClaims: [],
                            provider: null,
                            model: null
                        },
                        missingSections: [],
                        provider: null,
                        model: null,
                        original: true,
                        readOnly: true,
                        objectiveSatisfied: true,
                        limitedEvidence: true,
                        evidenceIntegrity: identityEvidence,
                        error: null
                    };
                }
                let semantic = await fetchSemanticConversation(
                    [
                        "Redacta el contenido completo de una landing page como JSON estricto.",
                        "Devuelve solamente un objeto con brandName, title, description, services, requiredSections, contentSections, whatsapp, contactEmail, whatsappRequested y evidenceMode.",
                        "MARCA_CANONICA y TITULO_CANONICO son identidad de la misión actual: consérvalos literalmente. Nunca cambies una sigla, palabra, acento o nombre por una aproximación creativa.",
                        "services debe ser un arreglo de objetos {title,description} con contenido específico y honesto.",
                        "requiredSections debe conservar, en el idioma del usuario, cada sección de contenido pedida explícitamente o recibida en SECCIONES_PLANIFICADAS; no omitas ni fusiones objetivos distintos.",
                        "contentSections debe contener exactamente una entrada sustantiva por requiredSections con {title,description,items}; title debe corresponder a la sección requerida y cada bloque debe tener copy real, no sólo una etiqueta.",
                        "Una página no puede considerarse compuesta si falta cualquiera de sus requiredSections.",
                        "No inventes clientes, certificaciones, testimonios, teléfonos, correos, garantías ni experiencia no proporcionada.",
                        "REGLA_FACTUAL: cada afirmación concreta sobre el negocio debe derivarse de la solicitud actual o de EVIDENCIA_CANONICA_DE_MISION. Si no está sustentada, conviértela en lenguaje de propuesta/posibilidad o elimínala; nunca la presentes como capacidad, servicio, herramienta, resultado o característica existente.",
                        "REGLA_ESTILO_NO_ES_HECHO: palabras de diseño como premium, tecnológico, minimalista, elegante, mobile-first o accesible describen la presentación solicitada; por sí solas no prueban que el negocio use tecnología, automatización, analítica, software, procesos avanzados ni ninguna capacidad operativa.",
                        "Si el usuario pide WhatsApp pero no dio número, usa whatsapp vacío y whatsappRequested=true; nunca inventes un número.",
                        "Si el usuario no dio ningún canal de contacto, deja whatsapp y contactEmail vacíos; una página válida no necesita inventarlos.",
                        "No fuerces servicios para completar el esquema. Si la evidencia no sustenta al menos un servicio real atribuible a la entidad correcta, devuelve services=[] y evidenceMode=\"insufficient\"; nunca rellenes el hueco con servicios genéricos.",
                        `MARCA_CANONICA=${clean(args.brandName)}`,
                        `TITULO_CANONICO=${clean(args.title)}`,
                        `SECCIONES_PLANIFICADAS=${JSON.stringify(Array.isArray(args.sections) ? args.sections : [])}`,
                        `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`,
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
                        groundPageContactInput(
                            normalizedPageArtifactInput(
                                extractSemanticJsonObject(
                                    semantic?.message ||
                                    ""
                                ),
                                clean(args.title),
                                Array.isArray(args.sections) ? args.sections : [],
                                clean(args.brandName),
                                clean(args.title)
                            ),
                            instruction,
                            {
                                contactEmail:
                                    args.contactEmail,
                                whatsapp:
                                    args.whatsapp,
                                whatsappRequested:
                                    args.whatsappRequested === true
                            }
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
                let factualAudit = {
                    ok: false,
                    status: "PAGE_FACTUAL_INTEGRITY_INCOMPLETE",
                    pageInput: null,
                    unsupportedClaims: ["FACTUAL_AUDIT_NOT_RUN"]
                };
                let factualAuditProvider = null;
                let factualAuditModel = null;
                try {
                    const factualSemantic =
                        await fetchSemanticConversation(
                            [
                                "AUDITORIA_FACTUAL_DE_PAGINA",
                                "Audita y repara el JSON de página propuesto. Devuelve solamente JSON estricto con {ok,unsupportedClaims,pageInput}.",
                                "pageInput debe conservar la intención, estructura y copy útil, pero no puede afirmar como hecho nada que no esté respaldado por SOLICITUD_ACTUAL o EVIDENCIA_CANONICA_DE_MISION.",
                                "Las instrucciones de estilo visual no son evidencia de capacidades del negocio. No conviertas premium, tecnológico, mobile-first, accesible, moderno o similares en afirmaciones de automatización, analítica, software, herramientas, procesos o resultados del negocio.",
                                "Si una afirmación no está sustentada, elimínala. No conviertas ausencia de evidencia en capacidades plausibles. Si no queda ningún servicio sustentado, usa services=[] y evidenceMode=\"insufficient\".",
                                "Conserva literalmente MARCA_CANONICA y TITULO_CANONICO; conserva todas las SECCIONES_REQUERIDAS y no inventes canales de contacto.",
                                `MARCA_CANONICA=${clean(args.brandName)}`,
                                `TITULO_CANONICO=${clean(args.title)}`,
                                `SECCIONES_REQUERIDAS=${JSON.stringify(Array.isArray(args.sections) ? args.sections : [])}`,
                                `SOLICITUD_ACTUAL=${instruction}`,
                                `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`,
                                `PAGINA_PROPUESTA=${JSON.stringify(pageInput).slice(0, 30000)}`
                            ].join("\n"),
                            {
                                maxOutputTokens: 4200
                            }
                        );
                    factualAuditProvider =
                        factualSemantic?.provider ||
                        null;
                    factualAuditModel =
                        factualSemantic?.model ||
                        null;
                    if (factualSemantic?.ok === true) {
                        factualAudit =
                            normalizePageFactualAudit(
                                extractSemanticJsonObject(
                                    factualSemantic?.message ||
                                    ""
                                )
                            );
                    }
                }
                catch(error) {
                    factualAudit = {
                        ok: false,
                        status: "PAGE_FACTUAL_INTEGRITY_INCOMPLETE",
                        pageInput: null,
                        unsupportedClaims: [
                            error?.message ||
                            "PAGE_FACTUAL_AUDIT_FAILED"
                        ]
                    };
                }

                if (factualAudit.ok === true) {
                    pageInput =
                        groundPageContactInput(
                            normalizedPageArtifactInput(
                                factualAudit.pageInput,
                                clean(args.title),
                                Array.isArray(args.sections) ? args.sections : [],
                                clean(args.brandName),
                                clean(args.title)
                            ),
                            instruction,
                            {
                                contactEmail:
                                    args.contactEmail,
                                whatsapp:
                                    args.whatsapp,
                                whatsappRequested:
                                    args.whatsappRequested ===
                                    true
                            }
                        );
                }
                if (
                    factualAudit.ok === true &&
                    identityEvidence.researchObserved === true &&
                    (
                        pageInput.evidenceMode === "insufficient" ||
                        !Array.isArray(pageInput.services) ||
                        pageInput.services.length === 0
                    )
                ) {
                    pageInput =
                        limitedEvidencePageInput({
                            brandName: pageInput.brandName || args.brandName,
                            title: pageInput.title || args.title,
                            requiredSections:
                                Array.isArray(pageInput.requiredSections) &&
                                pageInput.requiredSections.length > 0
                                    ? pageInput.requiredSections
                                    : args.sections
                        });
                }
                const factualIntegrityPassed =
                    factualAudit.ok === true;

                const missingSections = pageInput.requiredSections.filter(required =>
                    !pageInput.contentSections.some(section =>
                        pageSectionContractKey(section.title) === pageSectionContractKey(required)
                    )
                );
                const requestedSectionsSatisfied = missingSections.length === 0;
                const canonicalBrandName = clean(args.brandName);
                const canonicalTitle = clean(args.title);
                const identityPreserved =
                    (!canonicalBrandName || pageInput.brandName === canonicalBrandName) &&
                    (!canonicalTitle || pageInput.title === canonicalTitle);
                const limitedEvidence =
                    pageInput.evidenceMode === "insufficient";
                const ok =
                    semantic?.ok === true &&
                    factualIntegrityPassed &&
                    identityPreserved &&
                    pageInput.brandName &&
                    pageInput.title &&
                    pageInput.description.length >= 20 &&
                    Array.isArray(pageInput.services) &&
                    (pageInput.services.length > 0 || limitedEvidence) &&
                    requestedSectionsSatisfied;
                return {
                    ok:
                        Boolean(ok),
                    status:
                        ok
                            ? "PAGE_CONTENT_COMPOSED"
                            : !factualIntegrityPassed
                                ? "PAGE_FACTUAL_INTEGRITY_INCOMPLETE"
                                : "PAGE_CONTENT_COMPOSITION_INCOMPLETE",
                    pageInput,
                    requestedSectionsSatisfied,
                    identityPreserved,
                    factualIntegrityPassed,
                    factualAudit: {
                        status: factualAudit.status,
                        unsupportedClaims: factualAudit.unsupportedClaims,
                        provider: factualAuditProvider,
                        model: factualAuditModel
                    },
                    missingSections,
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
                    limitedEvidence,
                    evidenceIntegrity:
                        identityEvidence,
                    error:
                        ok
                            ? null
                            : missingSections.length > 0
                                ? "PAGE_REQUESTED_SECTION_COVERAGE_INCOMPLETE"
                                : "PAGE_CONTENT_REQUIRED"
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
                    ["web.research", { query: "IANA Example Domains", allowedDomain: "iana.org" }],
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
                    const checkExecutionOk =
                        execution?.executionOk !== false &&
                        execution?.ok !== false &&
                        result?.executionOk !== false &&
                        result?.ok !== false;
                    const checkObjectiveSatisfied =
                        execution?.objectiveSatisfied !== false &&
                        result?.objectiveSatisfied !== false;
                    checks.push({
                        tool,
                        ok:
                            checkExecutionOk &&
                            checkObjectiveSatisfied,
                        executionOk:
                            checkExecutionOk,
                        objectiveSatisfied:
                            checkObjectiveSatisfied,
                        status: result?.status || execution?.status || "COMPLETED",
                        evidence: {
                            source: result?.source || null,
                            score: result?.score ?? null,
                            passed: result?.passed ?? null,
                            failed: result?.failed ?? null,
                            connectedCount: result?.connectedCount ?? null,
                            sourceCount:
                                result?.sourceCount ??
                                result?.sources?.length ??
                                null,
                            exitCode:
                                result?.exitCode ??
                                result?.result?.exitCode ??
                                null,
                            command:
                                result?.npmCommand ||
                                result?.command ||
                                result?.result?.command ||
                                null,
                            cwd:
                                result?.cwd ||
                                result?.result?.cwd ||
                                null,
                            timeoutMs:
                                result?.timeoutMs ??
                                result?.result?.timeoutMs ??
                                null,
                            durationMs:
                                result?.durationMs ??
                                result?.result?.durationMs ??
                                null,
                            error:
                                result?.error ||
                                result?.result?.error ||
                                null,
                            stdout:
                                String(
                                    result?.stdout ||
                                    result?.result?.stdout ||
                                    ""
                                ).slice(0, 6000),
                            stderr:
                                String(
                                    result?.stderr ||
                                    result?.result?.stderr ||
                                    ""
                                ).slice(0, 6000)
                        }
                    });
                }

                const forensics = await buildCapabilityForensics(runtime);
                const failedChecks = checks.filter(check => check.ok !== true);
                const certified =
                    failedChecks.length === 0 &&
                    forensics.parity.canClaimParity === true &&
                    forensics.readinessScore === 100;

                const incompleteReasons = [
                    ...(failedChecks.length > 0
                        ? ["CHECK_FAILURES"]
                        : []),
                    ...(forensics.parity.canClaimParity !== true
                        ? ["PARITY_GAPS"]
                        : []),
                    ...(forensics.readinessScore !== 100
                        ? ["READINESS_BELOW_100"]
                        : [])
                ];

                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    blocked: false,
                    retryable: false,
                    status: certified
                        ? "CODEX_PARITY_CERTIFIED"
                        : "CERTIFICATION_INCOMPLETE",
                    certified,
                    deep,
                    checks,
                    failedChecks,
                    incompleteReasons,
                    forensics,
                    message: certified
                        ? "La certificacion se ejecuto y toda la evidencia requerida paso."
                        : "La certificacion se ejecuto correctamente; el resultado es incompleto porque existen checks fallidos o capacidades sin evidencia suficiente.",
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
            missionDedupeBy: [
                "researchGoal"
            ],
            inputSchema: {
                type:
                    "object",
                required: [
                    "query",
                    "researchGoal"
                ],
                properties: {
                    query: {
                        type:
                            "string"
                    },
                    prompt: {
                        type:
                            "string"
                    },
                    researchGoal: {
                        type:
                            "string",
                        description:
                            "Identidad estable RESEARCH_1, RESEARCH_2, etc. segun el orden de objetivos independientes en la instruccion original."
                    },
                    objectiveId: {
                        type:
                            "string"
                    },
                    caseId: {
                        type:
                            "string"
                    },
                    allowedDomain: {
                        type:
                            "string"
                    },
                    exactEntity: {
                        type:
                            "string"
                    },
                    seedUrl: {
                        type:
                            "string"
                    }
                },
                additionalProperties:
                    false
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
                        exactEntity: args.exactEntity || "",
                        seedUrl: args.seedUrl || ""
                    }
                )
        }),
        register(runtime, {
            name: "business.assist",
            description: "Analiza estrategia, operaciones, ventas, costos, riesgos y decisiones empresariales mediante razonamiento semántico; no inventa datos ni modifica sistemas.",
            output: "SIA7_BUSINESS_RESPONSE",
            inputSchema: {
                prompt: "string"
            },
            execute: async (args = {}, context = {}) => {
                const instruction =
                    resolveInstruction(args, context);
                const groundedContext =
                    recentGroundedBusinessContext();
                const businessPrompt = [
                    "Actua como asesor empresarial privado del Arqui Heberto Mendoza.",
                    "Comprende la solicitud por significado; no la reclasifiques con listas de palabras, diccionarios locales ni patrones de texto.",
                    "Responde la solicitud concreta con diagnostico, recomendacion, riesgos y siguientes acciones.",
                    "No inventes cifras, clientes, resultados ni hechos; separa hechos proporcionados de supuestos editables.",
                    "No autorices ni ejecutes cambios. Usa espanol claro y util.",
                    `SOLICITUD=${instruction}`,
                    groundedContext
                        ? `CONTEXTO_VERIFICADO=${groundedContext}`
                        : "CONTEXTO_VERIFICADO=NO_DISPONIBLE"
                ].join("\n").slice(0, 2600);
                const semantic =
                    await fetchSemanticConversation(
                        businessPrompt
                    );

                if (
                    semantic?.ok === true &&
                    semantic?.message
                ) {
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
                    error:
                        semantic?.error ||
                        semantic?.status ||
                        "SEMANTIC_MODEL_UNAVAILABLE",
                    instruction,
                    retryable: true,
                    factsPolicy: "NO_INVENTED_FACTS"
                };
            }
        }),
        register(runtime, {
            name: "marketing.plan",
            description: "Produce el plan estratégico desde un brief semántico estructurado y evidencia real. Planear no equivale a producir archivos; productionRequested y productionArtifacts definen el contrato de producción sin interpretar texto localmente.",
            output: "SIA7_MARKETING_PLAN",
            inputSchema: MARKETING_ARGUMENT_SCHEMA,
            execute: async (args = {}, context = {}) => {
                const instruction =
                    resolveInstruction(args, context);

                let planningArgs = args;
                let semanticEnrichment = null;
                let semanticEnrichmentError = null;

                try {
                    semanticEnrichment = await completeGroundedToolArgs({
                        toolName: "marketing.plan",
                        description: "Completa el brief estratégico de la herramienta ya seleccionada por significado. Decide semánticamente si el usuario pidió producción real y expresa esa decisión en productionRequested; si es true declara productionArtifacts con toolName exacto. Los campos creativos no factuales pueden ser propuestas editables.",
                        inputSchema: MARKETING_ARGUMENT_SCHEMA,
                        args: planningArgs,
                        context
                    });
                    planningArgs =
                        semanticEnrichment?.args ||
                        planningArgs;
                }
                catch(error) {
                    semanticEnrichmentError =
                        error?.message ||
                        String(error);
                }

                planningArgs =
                    resolveMarketingMissionProductionScope(
                        planningArgs,
                        context
                    );

                if (typeof planningArgs.productionRequested !== "boolean") {
                    return {
                        ok: false,
                        executionOk: false,
                        objectiveSatisfied: false,
                        blocked: false,
                        retryable: true,
                        requiresInput: false,
                        readyForProduction: false,
                        status: "MARKETING_SEMANTIC_SCOPE_INCOMPLETE",
                        error: "MARKETING_SEMANTIC_SCOPE_INCOMPLETE",
                        message: "El cerebro semántico no declaró si la misión es sólo planeación o también producción; se requiere replanificación semántica."
                    };
                }

                let result = planMarketingRequest(
                    instruction,
                    {
                        ...context,
                        ...planningArgs,
                        ...resolveAuthority(planningArgs, context)
                    }
                );
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
                    objectiveSatisfied: result?.objectiveSatisfied === true,
                    semanticEnrichment: semanticEnrichment
                        ? {
                            used: true,
                            provider: semanticEnrichment.provider,
                            model: semanticEnrichment.model,
                            sourceCount: semanticEnrichment.sourceCount
                        }
                        : {
                            used: false,
                            error:
                                semanticEnrichmentError ||
                                null
                        }
                };
            }
        }),
        register(runtime, {
            name: "page.plan",
            description: "Construye una especificacion responsive, editable y accesible de pagina sin escribir ni desplegar.",
            output: "SIA7_PAGE_SPEC",
            missionDedupeBy: ["pageName"],
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
                let semanticMediaBinding = {
                    used: false
                };
                if (result?.ok === true) {
                    const requiredTools = Array.isArray(context?.requiredToolNames)
                        ? context.requiredToolNames.map(String)
                        : [];
                    const collectionRequired = requiredTools.includes("web.media.collect");
                    const collection = reelMediaCollectionState(context);
                    if (collectionRequired && collection.attempted !== true) {
                        return {
                            ...result,
                            ok: false,
                            executionOk: true,
                            objectiveSatisfied: false,
                            blocked: false,
                            retryable: true,
                            requiresInput: false,
                            status: "REEL_MEDIA_COLLECTION_REQUIRED_BEFORE_PLAN",
                            error: "WEB_MEDIA_COLLECT_MUST_COMPLETE_BEFORE_REEL_PLAN",
                            missingInputs: [],
                            semanticMediaBinding: {
                                used: false,
                                waitingFor: "web.media.collect"
                            }
                        };
                    }
                    if (collection.attempted === true && collection.assets.length < 1) {
                        return {
                            ...result,
                            ok: false,
                            executionOk: true,
                            objectiveSatisfied: false,
                            blocked: true,
                            retryable: false,
                            requiresInput: false,
                            status: "REEL_VERIFIED_SCENE_MEDIA_REQUIRED",
                            error: "WEB_MEDIA_COLLECT_RETURNED_NO_VERIFIED_SCENE_MEDIA",
                            missingInputs: [],
                            semanticMediaBinding: { used: false, assetCount: 0 }
                        };
                    }
                    if (collection.assets.length > 0) {
                        let semanticBindingResult = null;
                        let decision = null;
                        try {
                            semanticBindingResult = await fetchSemanticConversation(
                                buildReelMediaBindingPrompt({
                                    scenes: result.scenes,
                                    assets: collection.assets
                                }),
                                { maxOutputTokens: 2800 }
                            );
                            if (semanticBindingResult?.ok !== true) {
                                throw new Error(
                                    semanticBindingResult?.error ||
                                    semanticBindingResult?.status ||
                                    "REEL_MEDIA_BINDING_MODEL_UNAVAILABLE"
                                );
                            }
                            decision = extractSemanticJsonObject(
                                semanticBindingResult?.message ||
                                ""
                            );
                        }
                        catch(error) {
                            return {
                                ...result,
                                ok: false,
                                executionOk: true,
                                objectiveSatisfied: false,
                                blocked: false,
                                retryable: true,
                                requiresInput: false,
                                status: "REEL_MEDIA_SEMANTIC_BINDING_FAILED",
                                error: error?.message || "REEL_MEDIA_SEMANTIC_BINDING_FAILED",
                                semanticMediaBinding: {
                                    used: true,
                                    validated: false,
                                    assetCount: collection.assets.length,
                                    provider: semanticBindingResult?.provider || null,
                                    model: semanticBindingResult?.model || null
                                }
                            };
                        }
                        const validation = validateReelMediaBindings({
                            scenes: result.scenes,
                            assets: collection.assets,
                            decision
                        });
                        if (validation.ok !== true) {
                            return {
                                ...result,
                                ok: false,
                                executionOk: true,
                                objectiveSatisfied: false,
                                blocked: false,
                                retryable: true,
                                requiresInput: false,
                                status: "REEL_MEDIA_SEMANTIC_BINDING_FAILED",
                                error: validation.status || "REEL_MEDIA_SEMANTIC_BINDING_FAILED",
                                semanticMediaBinding: {
                                    used: true,
                                    validated: false,
                                    validationStatus: validation.status || null,
                                    assetCount: collection.assets.length,
                                    provider: semanticBindingResult?.provider || null,
                                    model: semanticBindingResult?.model || null
                                }
                            };
                        }
                        semanticMediaBinding = {
                            used: true,
                            validated: true,
                            version: "semantic_scene_media_authority_v131",
                            assetCount: validation.assetCount,
                            bindingCount: validation.bindingCount,
                            maxUse: validation.maxUse,
                            bindings: validation.bindings,
                            provider: semanticBindingResult?.provider || null,
                            model: semanticBindingResult?.model || null
                        };
                        result = {
                            ...result,
                            scenes: validation.scenes,
                            mediaBinding: semanticMediaBinding
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
                        },
                    semanticMediaBinding
                };
            }
        }),
        register(runtime, {
            name: "media.analyze",
            description: "Analiza PDF e imagenes con doble verificacion visual y extrae de forma read-only DOCX, XLSX, PPTX, TXT, Markdown, CSV, JSON, XML, YAML y codigo textual con hash y trazabilidad por fuente.",
            output: "SIA7_MEDIA_ANALYSIS",
            missionDedupeBy: [],
            inputSchema: {
                mimeType: "string",
                sourceName: "string",
                pages: "array",
                attachments: "array",
                questions: "array"
            },
            execute: async (args = {}, context = {}) => {
                const instruction =
                    args.instruction ||
                    args.query ||
                    context.rawInput ||
                    "Analiza los archivos entregados.";
                const authoritativeAttachments =
                    attachmentsFromInstruction(
                        context.rawInput ||
                        args.instruction ||
                        args.query ||
                        ""
                    );
                const attachments = authoritativeAttachments.length > 0
                    ? authoritativeAttachments
                    : Array.isArray(args.attachments)
                        ? args.attachments.slice(0, 30)
                        : [];
                const persistedMedia = attachments.filter(attachment => attachment?.artifact);
                const boundedMedia = persistedMedia.slice(0, 8);
                const pendingMedia = persistedMedia.slice(8);
                const batchAccounting = {
                    receivedFiles: attachments.length,
                    boundedFiles: boundedMedia.length,
                    pendingFiles: pendingMedia.length,
                    pendingAttachments: pendingMedia.map(item => ({
                        name: item.name || "archivo",
                        artifact: item.artifact
                    }))
                };
                if (attachments.length > 0 && persistedMedia.length !== attachments.length) {
                    return {
                        ok: false,
                        status: "MEDIA_ANALYSIS_ARTIFACT_SET_INCOMPLETE",
                        error: "MEDIA_ANALYSIS_ARTIFACT_SET_INCOMPLETE",
                        message: "El lote adjunto esta incompleto; no se analizara una fraccion ni se inventara contenido.",
                        attachments,
                        ...batchAccounting,
                        persistedArtifacts: persistedMedia.map(item => item.artifact)
                    };
                }
                if (persistedMedia.length > 0) {
                    const indexedMedia = boundedMedia.map((attachment, index) => ({
                        ...attachment,
                        __sourceIndex: index
                    }));
                    const cloudMedia = indexedMedia.filter(isCloudVisualAttachment);
                    const localDocuments = indexedMedia.filter(attachment =>
                        !isCloudVisualAttachment(attachment) &&
                        isLocalDocumentAttachment(attachment)
                    );
                    const unsupported = indexedMedia.filter(attachment =>
                        !isCloudVisualAttachment(attachment) &&
                        !isLocalDocumentAttachment(attachment)
                    );
                    if (unsupported.length > 0) {
                        return {
                            ok: false,
                            status: "DOCUMENT_ANALYSIS_TYPE_UNSUPPORTED",
                            error: "DOCUMENT_ANALYSIS_TYPE_UNSUPPORTED",
                            message: "El lote contiene formatos que todavía no pueden analizarse con evidencia verificable; no se inventara su contenido.",
                            unsupported: unsupported.map(item => ({
                                name: item?.name || "archivo",
                                mimeType: item?.mimeType || "application/octet-stream"
                            })),
                            attachments,
                            ...batchAccounting
                        };
                    }
                    const authority = resolveAuthority(args, context);
                    let localResult = localDocuments.length > 0
                        ? await fetchLocalDocumentAnalysis(
                            localDocuments,
                            instruction,
                            authority
                        )
                        : null;
                    if (localResult && localResult?.ok !== true) {
                        return {
                            ...localResult,
                            attachments,
                            ...batchAccounting,
                            persistedArtifacts: persistedMedia.map(item => item.artifact)
                        };
                    }
                    let cloudResult = null;
                    if (cloudMedia.length > 0) {
                        cloudResult = await fetchGroundedMediaAnalysis(
                            cloudMedia,
                            instruction
                        );
                        if (cloudResult?.ok === true) {
                            cloudResult = remapCloudMediaSources(cloudResult, cloudMedia);
                        }
                        else if (
                            cloudMedia.every(attachment =>
                                attachmentExtension(attachment) === ".pdf"
                            )
                        ) {
                            const localPdfResult = await fetchLocalDocumentAnalysis(
                                cloudMedia,
                                instruction,
                                authority
                            );
                            if (localPdfResult?.ok !== true) {
                                return {
                                    ...cloudResult,
                                    localFallback: localPdfResult,
                                    attachments,
                                    ...batchAccounting
                                };
                            }
                            localResult = localResult?.ok === true
                                ? mergeHybridMediaDocumentAnalysis(localResult, localPdfResult)
                                : localPdfResult;
                            cloudResult = null;
                        }
                        else {
                            return {
                                ok: false,
                                status: cloudResult?.status || "MEDIA_ANALYSIS_UNAVAILABLE",
                                error: cloudResult?.error || "MEDIA_ANALYSIS_UNAVAILABLE",
                                message: "Los archivos visuales existen, pero no pude obtener evidencia visual verificable; no inventare su contenido.",
                                attachments,
                                ...batchAccounting
                            };
                        }
                    }
                    const verifiedResult = localResult?.ok === true && cloudResult?.ok === true
                        ? mergeHybridMediaDocumentAnalysis(localResult, cloudResult)
                        : localResult?.ok === true
                            ? localResult
                            : cloudResult?.ok === true
                                ? cloudResult
                                : null;
                    if (verifiedResult?.ok === true) {
                        return {
                            ...verifiedResult,
                            attachments,
                            ...batchAccounting,
                            analyzedFiles: verifiedResult.sources.length,
                            persistedArtifacts: persistedMedia.map(item => item.artifact)
                        };
                    }
                    if (!Array.isArray(args.pages) || args.pages.length === 0) {
                        return {
                            ok: false,
                            status: "MEDIA_ANALYSIS_UNAVAILABLE",
                            error: "MEDIA_ANALYSIS_UNAVAILABLE",
                            message: "Los archivos existen, pero no pude obtener evidencia visual/documental verificable; no inventare su contenido.",
                            attachments,
                            ...batchAccounting
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
