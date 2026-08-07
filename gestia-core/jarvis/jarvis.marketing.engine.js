import "../nexo/nexo.semantic-planner-resilience.js";

import {
    NEXO_IDENTITY
} from "../nexo/nexo.identity.js";
import {
    hasCompleteMarketingPlan,
    renderCompleteMarketingPlan
} from "./jarvis.marketing.presenter.js";

/**
 * NEXO Marketing Studio
 * Produce campañas estructuradas desde una instrucción natural y evidencia opcional.
 * Las propuestas creativas pueden usar contexto del usuario; los hechos comerciales solo
 * se consideran verificados cuando traen una fuente válida.
 */

const VERSION = "8.1.0-nexo-complete-marketing-package";

const CRITICAL_INPUT_GROUPS = [
    { id: "business", fields: ["brandName"], question: "¿Cuál es el negocio, marca o producto?" },
    { id: "goal", fields: ["campaignObjective"], question: "¿Cuál es el objetivo comercial principal?" },
    { id: "market", fields: ["audience", "market"], question: "¿A qué público y mercado o ubicación se dirige?" },
    { id: "value", fields: ["offer", "pain", "differentiator"], question: "¿Cuál es la oferta, qué problema resuelve y cuál es su diferenciador?" },
    { id: "execution", fields: ["budget", "horizon", "cta"], question: "¿Qué presupuesto o escenario, horizonte y llamada a la acción se usarán?" }
];

function clean(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalized(value = "") {
    return clean(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function strings(value, limit = 20) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(clean).filter(Boolean))].slice(0, limit);
}

function hashtag(value) {
    const safe = Array.from(normalized(value)).filter(character => {
        const code = character.charCodeAt(0);
        return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    }).join("");
    return safe ? `#${safe}` : "";
}

function validEvidence(id, item) {
    if (!item || typeof item !== "object") return false;
    if (id === "landing") return Boolean(clean(item.url) || clean(item.output) || clean(item.content));
    if (id === "repo") return Boolean(clean(item.path) || clean(item.file)) && Boolean(clean(item.symbol) || clean(item.hash) || clean(item.excerpt));
    if (id === "documents") return Boolean(clean(item.source) || clean(item.name) || clean(item.output)) && Boolean(clean(item.excerpt) || item.page);
    if (id === "photographs") return Boolean(clean(item.output) || clean(item.name) || clean(item.path)) && Boolean(clean(item.sha256) || clean(item.source));
    if (id === "testimonials") return Boolean(clean(item.quote) && clean(item.source));
    if (id === "services") return Boolean((clean(item.name) || clean(item.title)) && clean(item.source));
    if (id === "web_research") return Boolean(clean(item.url) && (clean(item.title) || clean(item.snippet)));
    return false;
}

function evidenceEntry(id, value) {
    const candidates = Array.isArray(value) ? value : value ? [value] : [];
    const items = candidates.filter(item => validEvidence(id, item));
    return {
        id,
        available: items.length > 0,
        count: items.length,
        items
    };
}

function buildGrounding(context) {
    const verifiedMissionSources =
        Array.isArray(context.validSources) && context.validSources.length > 0
            ? context.validSources
            : Array.isArray(context.webResearch)
                ? context.webResearch
                : [];
    const sources = [
        evidenceEntry("landing", context.landing),
        evidenceEntry("repo", context.repoEvidence),
        evidenceEntry("documents", context.documents),
        evidenceEntry("photographs", context.photographs),
        evidenceEntry("testimonials", context.testimonials),
        evidenceEntry("services", context.services),
        evidenceEntry("web_research", verifiedMissionSources)
    ];
    const available = sources.filter(source => source.available);
    return {
        status: available.length ? "GROUNDED" : "USER_CONTEXT_ONLY",
        sourceCount: available.reduce((total, source) => total + source.count, 0),
        sources,
        policy: "NO_INVENTED_FACTS",
        creativeProposalsAllowed: true,
        factualClaimsRequireEvidence: true
    };
}

function buildTrace(context, instruction) {
    return {
        objectiveId: clean(context.objectiveId) || `MKT-${Date.now()}`,
        caseId: clean(context.caseId),
        authorityId: clean(context.authorityId) || NEXO_IDENTITY.authorityId,
        controllerId: clean(context.controllerId) || NEXO_IDENTITY.controllerId,
        instruction,
        generatedAt: Date.now(),
        source: "natural_instruction_semantic_fields_and_evidence",
        memoryRole: "advisory_only",
        engineIdentity: NEXO_IDENTITY.name
    };
}

function inferInstructionBrand(instruction = "") {
    const source = clean(instruction);
    const namedPlanTarget = source.match(
        /\bplan\s+de\s+marketing\b.{0,120}?\bpara\s+(.+?)(?:[.,;]|$)/i
    )?.[1]?.trim() || "";
    if (namedPlanTarget) return namedPlanTarget;

    const text = normalized(source);
    if (text.includes("peninsula tech")) return "Peninsula Tech";
    if (text.includes("gestiapremium") || text.includes("gestia premium")) return "GestiaPremium";
    if (text.includes("fixgo") || text.includes("fix go")) return "FixGo";
    return "";
}

function inferBrandName(instruction, context) {
    const explicit = inferInstructionBrand(instruction);
    if (explicit) return explicit;
    if (clean(context.brandName) || clean(context.name)) {
        return clean(context.brandName) || clean(context.name);
    }
    return "";
}

function availableContext(context = {}) {
    const memory = context.marketingContext && typeof context.marketingContext === "object"
        ? context.marketingContext
        : {};
    return { ...memory, ...context };
}

function isolateMarketingContext(instruction, context = {}) {
    const resolved = availableContext(context);
    const explicitBrand = inferInstructionBrand(instruction);
    const rememberedBrand = clean(resolved.brandName) || clean(resolved.name);
    if (
        !explicitBrand ||
        !rememberedBrand ||
        normalized(explicitBrand) === normalized(rememberedBrand)
    ) {
        return resolved;
    }

    const isolated = {};
    for (const key of [
        "objectiveId", "caseId", "authorityId", "controllerId",
        "userId", "workspaceId", "projectId", "conversationId"
    ]) {
        if (resolved[key] !== undefined && resolved[key] !== null) {
            isolated[key] = resolved[key];
        }
    }
    return {
        ...isolated,
        brandName: explicitBrand,
        name: explicitBrand,
        marketingContext: {},
        contextIsolation: "EXPLICIT_BRAND_MISSION_ISOLATED"
    };
}

function missingCriticalInputs(context = {}, instruction = "") {
    const resolved = availableContext(context);
    const inferredBrand = inferBrandName(instruction, resolved);
    const missing = CRITICAL_INPUT_GROUPS.filter(group =>
        group.fields.every(field => {
            if (field === "brandName") return !inferredBrand;
            return !clean(resolved[field]);
        })
    );
    const suppliedGroups = CRITICAL_INPUT_GROUPS.length - missing.length;
    // A concrete brand plus two substantive groups is enough to continue with
    // explicit, editable assumptions for non-blocking details.
    return inferredBrand && suppliedGroups >= 3 ? [] : missing;
}

function inputRequiredResult(instruction, context, groups) {
    const missingInputs = groups.flatMap(group => group.fields);
    return {
        ok: true,
        executionOk: true,
        objectiveSatisfied: false,
        requiresInput: true,
        blocked: true,
        retryable: false,
        readyForProduction: false,
        status: "MARKETING_INPUT_REQUIRED",
        intent: "MARKETING_PACKAGE",
        domain: "marketing",
        raw: instruction,
        trace: buildTrace(context, instruction),
        missingInputs,
        questions: groups.map(group => group.question),
        preservedContext: availableContext(context),
        message: [
            "Para completar el plan sin inventar datos críticos necesito:",
            ...groups.map((group, index) => `${index + 1}. ${group.question}`),
            "Conservaré lo ya proporcionado y continuaré esta misma misión."
        ].join("\n")
    };
}

function inferAudience(instruction, context) {
    if (clean(context.audience)) return clean(context.audience);
    const text = normalized(instruction);
    if (text.includes("hotel") || text.includes("condominio") || text.includes("empresa")) {
        return "administradores de inmuebles, hoteles, condominios y empresas";
    }
    if (text.includes("hogar") || text.includes("casa") || text.includes("domicilio")) {
        return "propietarios y residentes que necesitan atención técnica confiable";
    }
    return "clientes residenciales y empresariales que valoran seguridad, trazabilidad y respuesta rápida";
}

function inferSubject(instruction) {
    const text = normalized(instruction);
    if (text.includes("aire acondicionado") || text.includes("aires acondicionados")) return "servicios de aire acondicionado";
    if (text.includes("plomer")) return "servicios de plomería";
    if (text.includes("electric")) return "servicios eléctricos";
    if (text.includes("mantenimiento")) return "mantenimiento profesional";
    if (text.includes("seguridad")) return "servicios de alta confianza";
    return "servicios técnicos y operativos de confianza";
}

function deriveCreativeBrief(instruction, context) {
    const brandName = inferBrandName(instruction, context);
    const audience = inferAudience(instruction, context);
    const subject = inferSubject(instruction);

    return {
        brandName,
        audience,
        offer: clean(context.offer) ||
            `Programa integral para presentar y convertir la oferta de ${subject} de ${brandName}`,
        pain: clean(context.pain) ||
            "la dificultad para encontrar proveedores confiables, transparentes y trazables",
        promise: clean(context.promise) ||
            "una experiencia más clara, segura y documentada desde la solicitud hasta el cierre",
        differentiator: clean(context.differentiator) ||
            "identidad verificable, evidencia por servicio, seguimiento operativo y revisión humana de incidencias",
        cta: clean(context.cta) ||
            `Solicita una evaluación con ${brandName}`,
        tone: clean(context.tone) || clean(context.voice) ||
            "directo, confiable y profesional",
        inferredFields: [
            ...(!clean(context.brandName) && !clean(context.name) ? ["brandName"] : []),
            ...(!clean(context.audience) ? ["audience"] : []),
            ...(!clean(context.offer) ? ["offer"] : []),
            ...(!clean(context.pain) ? ["pain"] : []),
            ...(!clean(context.promise) ? ["promise"] : []),
            ...(!clean(context.differentiator) ? ["differentiator"] : []),
            ...(!clean(context.cta) ? ["cta"] : [])
        ]
    };
}

function buildHooks(brand, pain, promise, differentiator) {
    return [
        `${pain} no tiene que seguir frenando tu operación.`,
        `${brand.name}: ${promise}.`,
        `La diferencia está en ${differentiator}.`,
        `Si hoy enfrentas ${pain.toLowerCase()}, este cambio es para ti.`
    ];
}

function buildCopies(channels, campaign) {
    return channels.map(channel => ({
        channel,
        hook: campaign.hooks[0],
        body: `${campaign.offer}. ${campaign.promise} gracias a ${campaign.differentiator}.`,
        cta: campaign.cta,
        evidencePolicy: "Creative proposal; factual claims require supplied evidence",
        editable: true,
        status: "draft_for_owner_review"
    }));
}

function buildCalendar(channels, brand, campaign) {
    return [
        { day: 1, stage: "awareness", format: "reel", topic: campaign.pain, channels },
        { day: 2, stage: "awareness", format: "story", topic: campaign.hooks[2], channels },
        { day: 3, stage: "consideration", format: "carousel", topic: campaign.differentiator, channels },
        { day: 5, stage: "consideration", format: "proof_request", topic: `Evidencia disponible de ${brand.name}`, channels },
        { day: 7, stage: "conversion", format: "landing_or_message", topic: campaign.cta, channels }
    ];
}

function buildFunnel(campaign) {
    return [
        { stage: "awareness", asset: "reel_or_post", message: campaign.pain },
        { stage: "consideration", asset: "carousel_or_landing", message: campaign.differentiator },
        { stage: "conversion", asset: "whatsapp_form_or_call", message: campaign.cta },
        { stage: "follow_up", asset: "verified_case_or_testimonial", message: campaign.promise }
    ];
}

function buildVideoPackage(channels, campaign, durationSeconds) {
    const duration = Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) >= 15
        ? Math.min(Number(durationSeconds), 180)
        : 30;
    return {
        durationSeconds: duration,
        aspectRatio: "9:16",
        dimensions: { width: 1080, height: 1920 },
        channels,
        script: [
            { section: "hook", text: campaign.hooks[0] },
            { section: "problem", text: campaign.pain },
            { section: "solution", text: campaign.offer },
            { section: "proof", text: campaign.differentiator },
            { section: "cta", text: campaign.cta }
        ],
        storyboard: [
            { scene: 1, range: "0-4", purpose: "hook", overlay: campaign.hooks[0] },
            { scene: 2, range: "4-11", purpose: "pain", overlay: campaign.pain },
            { scene: 3, range: "11-20", purpose: "offer", overlay: campaign.offer },
            { scene: 4, range: `20-${Math.max(21, duration - 4)}`, purpose: "proof", overlay: campaign.differentiator },
            { scene: 5, range: `${Math.max(0, duration - 4)}-${duration}`, purpose: "cta", overlay: campaign.cta }
        ],
        subtitles: { required: true, editable: true },
        narration: { scriptReady: true, voiceApprovalRequired: true },
        export: { preview: true, webm: true, mp4: "WHEN_INFRASTRUCTURE_AVAILABLE" },
        status: "draft_for_owner_review"
    };
}

function buildDeliverables(assets, channels, campaign) {
    return assets.map(asset => {
        let format = "structured_campaign_json";
        let dimensions = [];
        if (asset === "reel") {
            format = "video_storyboard_and_script";
            dimensions = [{ width: 1080, height: 1920, aspectRatio: "9:16" }];
        } else if (asset === "landing_page") {
            format = "responsive_html";
            dimensions = [{ width: "responsive", height: "content" }];
        } else if (asset === "flyer") {
            format = "editable_image_brief";
            dimensions = [
                { width: 1080, height: 1350, aspectRatio: "4:5" },
                { width: 1080, height: 1080, aspectRatio: "1:1" },
                { width: 1080, height: 1920, aspectRatio: "9:16" }
            ];
        }
        return {
            type: asset,
            format,
            dimensions,
            channels,
            editable: true,
            approvalRequired: true,
            productionBrief: {
                offer: campaign.offer,
                audience: campaign.audience,
                promise: campaign.promise,
                cta: campaign.cta
            }
        };
    });
}

function buildCompletePlan({ brand, campaign, channels, context, calendar, funnel, copies }) {
    const budget = clean(context.budget) || "escenario por definir";
    const horizon = clean(context.horizon) || "90 días";
    const segments = strings(context.segments).length
        ? strings(context.segments)
        : [campaign.audience];
    const smartGoal = `${campaign.objective} durante ${horizon}, midiendo conversaciones calificadas, conversión y costo por lead.`;
    return {
        executiveSummary: `${brand.name} operará en ${brand.market} y priorizará ${channels.join(", ")} para convertir ${campaign.audience}. ${campaign.cta}.`,
        assumptions: campaign.assumptions.length
            ? campaign.assumptions
            : [{ field: "none", source: "user_context", editable: true, note: "Los datos críticos fueron proporcionados por el usuario." }],
        businessDiagnosis: `Situación inicial: ${campaign.pain}. Oportunidad: ${campaign.promise}.`,
        smartObjectives: [smartGoal],
        targetAudience: { primary: campaign.audience, segments },
        customerProblem: campaign.pain,
        valueProposition: campaign.promise,
        positioningAndMessages: {
            positioning: `${brand.name} se posiciona por ${campaign.differentiator}.`,
            keyMessages: campaign.hooks.slice(0, 3)
        },
        offerStrategy: { offer: campaign.offer, approach: "entrada clara, prueba de valor y seguimiento" },
        competitiveAnalysis: {
            alternatives: strings(context.competitors).length ? strings(context.competitors) : ["proveedores informales", "búsqueda directa", "directorios sin seguimiento"],
            advantage: campaign.differentiator
        },
        customerJourneyAndFunnel: funnel,
        acquisitionStrategy: `Combinar demanda activa, contenido educativo local y referidos con seguimiento hacia ${campaign.cta}.`,
        priorityChannels: channels.map((channel, index) => ({ channel, priority: index + 1, rationale: index < 2 ? "captación y alcance medible" : "nutrición, confianza y conversión" })),
        contentStrategy: `Resolver dudas, demostrar el proceso y convertir con ${campaign.cta}.`,
        contentPillars: ["problema y educación", "proceso y confianza", "prueba y resultados", "oferta y conversión"],
        campaignExamples: copies.slice(0, 4),
        executionCalendar: calendar,
        conversionAndCta: { primaryCta: campaign.cta, followUp: "respuesta inmediata, calificación y recordatorio en 24 horas" },
        retentionAndReferrals: ["seguimiento posterior", "solicitud de reseña", "beneficio por recomendación", "recordatorio de recompra"],
        budgetScenarios: [
            { scenario: "low", allocation: budget, mix: "60% captación, 25% contenido, 15% pruebas" },
            { scenario: "medium", allocation: clean(context.mediumBudget) || `Aumentar 2-3x ${budget}`, mix: "65% captación, 20% contenido, 15% experimentos" }
        ],
        kpisAndMeasurement: campaign.metrics.map(metric => ({ metric, cadence: "semanal", source: "plataforma publicitaria, analítica y CRM" })),
        experiments: ["mensaje problema vs. promesa", "CTA directo vs. diagnóstico", "audiencia residencial vs. empresarial"],
        actionPlan306090: {
            days30: ["instrumentar medición", "publicar activos base", "activar primeras campañas"],
            days60: ["optimizar costo y conversión", "duplicar mensajes ganadores", "activar referidos"],
            days90: ["consolidar canales rentables", "documentar aprendizajes", "definir siguiente trimestre"]
        },
        risksAndMitigations: [
            { risk: "mensajes sin evidencia", mitigation: "usar sólo hechos sustentados y marcar propuestas" },
            { risk: "presupuesto disperso", mitigation: "priorizar dos canales y escalar por resultados" },
            { risk: "seguimiento lento", mitigation: "SLA y automatización de respuesta" }
        ],
        prioritizedNextSteps: ["validar supuestos editables", "confirmar medición y responsables", "producir activos", "lanzar prueba controlada", "revisar resultados semanalmente"]
    };
}

export function planMarketingRequest(rawInput = "", context = {}) {
    const instruction = clean(rawInput);
    context = isolateMarketingContext(instruction, context);
    const missingGroups = missingCriticalInputs(context, instruction);
    if (missingGroups.length) {
        return inputRequiredResult(instruction, context, missingGroups);
    }
    const creativeBrief = deriveCreativeBrief(instruction, context);
    const brand = {
        name: creativeBrief.brandName,
        voice: creativeBrief.tone,
        market: clean(context.market) || "México",
        owner: clean(context.owner) || NEXO_IDENTITY.owner
    };
    const channels = strings(context.channels).length
        ? strings(context.channels)
        : ["instagram", "facebook", "tiktok", "whatsapp"];
    const assets = strings(context.assets).length
        ? strings(context.assets)
        : ["campaign", "reel", "landing_page", "flyer"];
    const grounding = buildGrounding(context);
    const campaign = {
        name: clean(context.campaignName) || `${brand.name} — campaña de conversión`,
        objective: clean(context.campaignObjective) ||
            `Convertir interés de ${creativeBrief.audience} en conversaciones calificadas`,
        audience: creativeBrief.audience,
        offer: creativeBrief.offer,
        pain: creativeBrief.pain,
        promise: creativeBrief.promise,
        differentiator: creativeBrief.differentiator,
        tone: creativeBrief.tone,
        cta: creativeBrief.cta,
        hooks: buildHooks(
            brand,
            creativeBrief.pain,
            creativeBrief.promise,
            creativeBrief.differentiator
        ),
        description: `${creativeBrief.offer}. ${creativeBrief.promise}. ${creativeBrief.cta}.`,
        hashtags: strings(context.hashtags).length
            ? strings(context.hashtags)
            : [
                hashtag(brand.name),
                hashtag(context.market || "México"),
                "#ServicioProfesional",
                "#SeguridadOperativa"
            ].filter(Boolean),
        metrics: strings(context.metrics).length
            ? strings(context.metrics)
            : ["qualified_conversations", "landing_conversion", "cost_per_lead", "appointments"],
        variants: [
            { id: "A", angle: "pain_first", hookIndex: 0 },
            { id: "B", angle: "promise_first", hookIndex: 1 }
        ],
        assumptions: creativeBrief.inferredFields.map(field => ({
            field,
            source: "instruction_inference",
            editable: true,
            factualClaim: false
        }))
    };

    const deliverables = buildDeliverables(assets, channels, campaign);
    const videoPackage = buildVideoPackage(channels, campaign, context.durationSeconds);
    const copies = buildCopies(channels, campaign);
    const calendar = buildCalendar(channels, brand, campaign);
    const funnel = buildFunnel(campaign);
    const completePlan = buildCompletePlan({ brand, campaign, channels, context, calendar, funnel, copies });

    const result = {
        ok: true,
        status: "MARKETING_PACKAGE_READY",
        engine: "nexo_marketing_engine",
        legacyEngineAlias: "jarvis_marketing_engine",
        version: VERSION,
        source: "nexo_natural_brief_and_optional_evidence",
        raw: instruction,
        intent: "MARKETING_PACKAGE",
        domain: "marketing",
        trace: buildTrace(context, instruction),
        approval: {
            required: true,
            approved: false,
            publishAllowed: false,
            deployAllowed: false
        },
        brand,
        assets,
        channels,
        grounding,
        missingInputs: [],
        inferredInputs: creativeBrief.inferredFields,
        readyForProduction: true,
        objectiveSatisfied: true,
        requiresInput: false,
        campaign,
        plan: completePlan,
        copies,
        calendar,
        funnel,
        publications: copies.map(copy => ({
            ...copy,
            publishStatus: "blocked_until_owner_approval"
        })),
        deliverables,
        videoPackage,
        pieces: assets.map((asset, index) => ({
            id: index + 1,
            asset,
            variant: index % 2 ? "B" : "A"
        })),
        formats: deliverables.map(item => ({
            type: item.type,
            format: item.format,
            dimensions: item.dimensions
        })),
        onScreenTexts: videoPackage.storyboard.map(scene => scene.overlay),
        publicationPlan: buildCalendar(channels, brand, campaign),
        editable: true,
        message:
            `NEXO preparó una campaña específica para ${brand.name}. ` +
            `${creativeBrief.inferredFields.length} campos se marcaron como propuestas editables y ` +
            `${grounding.sourceCount} fuentes respaldan hechos verificables.`
    };
    result.userVisible = renderCompleteMarketingPlan(result);
    result.objectiveSatisfied = hasCompleteMarketingPlan(result.plan) && Boolean(result.userVisible);
    result.readyForProduction = result.objectiveSatisfied;
    if (!result.objectiveSatisfied) {
        result.status = "MARKETING_PACKAGE_INCOMPLETE";
    }
    return result;
}

export function isMarketingRequest(input = null) {
    return Boolean(input && typeof input === "object" && clean(input.domain) === "marketing");
}

export const JarvisMarketingEngine = {
    version: VERSION,
    identity: NEXO_IDENTITY.name,
    routing: "natural_instruction_with_semantic_and_local_resilience",
    isMarketingRequest,
    plan: planMarketingRequest
};

export const NexoMarketingEngine = JarvisMarketingEngine;

if (typeof globalThis !== "undefined") {
    globalThis.NexoMarketingEngine = NexoMarketingEngine;
    globalThis.JarvisMarketingEngine = JarvisMarketingEngine;
}
