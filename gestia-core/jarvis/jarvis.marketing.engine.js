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

const VERSION = "8.3.0-grounded-social-edit-contract-v12";

const REQUIRED_MARKETING_IDENTITY = {
    id: "business",
    fields: ["brandName"],
    question: "¿Para qué negocio, marca o producto preparo el plan?"
};

function clean(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalized(value = "") {
    const source =
        clean(value)
            .normalize("NFD")
            .toLowerCase();
    let result = "";
    for (const character of source) {
        const code = character.charCodeAt(0);
        if (code >= 768 && code <= 879) {
            continue;
        }
        result += character;
    }
    return result;
}

function strings(value, limit = 20) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(clean).filter(Boolean))].slice(0, limit);
}

function missingSemanticBriefFields(context = {}) {
    const missing = [];
    for (const field of [
        "audience",
        "offer",
        "pain",
        "promise",
        "differentiator",
        "cta",
        "market",
        "campaignObjective",
        "horizon",
        "tone"
    ]) {
        if (!clean(context[field])) missing.push(field);
    }
    if (strings(context.channels).length === 0) missing.push("channels");
    if (strings(context.metrics).length === 0) missing.push("metrics");
    return missing;
}

function semanticBriefIncompleteResult(instruction, context, missingFields) {
    return {
        ok: false,
        executionOk: false,
        objectiveSatisfied: false,
        requiresInput: false,
        blocked: false,
        retryable: true,
        readyForProduction: false,
        planReady: false,
        status: "MARKETING_SEMANTIC_BRIEF_INCOMPLETE",
        intent: "MARKETING_PACKAGE",
        domain: "marketing",
        raw: instruction,
        trace: buildTrace(context, instruction),
        brandName: inferBrandName(instruction, context),
        missingSemanticFields: [...missingFields],
        message: "El brief semántico no quedó suficientemente específico; no se sustituirá por texto genérico ni por supuestos locales."
    };
}

function structuredProductionArtifacts(context = {}) {
    const allowed = new Set([
        "reel.create",
        "page.create",
        "image.generate",
        "image.edit",
        "document.create",
        "marketing.package.real-media"
    ]);
    const source = Array.isArray(context.productionArtifacts)
        ? context.productionArtifacts
        : [];
    const normalized = [];
    for (let index = 0; index < source.length; index += 1) {
        const item = source[index];
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const toolName = clean(item.toolName);
        if (!allowed.has(toolName)) continue;
        const entry = {
            id: clean(item.id) || `artifact-${index + 1}`,
            type: clean(item.type) || toolName,
            toolName,
            label: clean(item.label) || clean(item.type) || toolName
        };
        const format = clean(item.format);
        if (format) entry.format = format.toLowerCase();
        normalized.push(entry);
    }
    return normalized.slice(0, 12);
}

function productionContractIncompleteResult(instruction, context) {
    return {
        ok: false,
        executionOk: false,
        objectiveSatisfied: false,
        requiresInput: false,
        blocked: false,
        retryable: true,
        readyForProduction: false,
        planReady: false,
        productionRequested: true,
        requiredArtifacts: [],
        status: "MARKETING_PRODUCTION_CONTRACT_INCOMPLETE",
        intent: "MARKETING_PACKAGE",
        domain: "marketing",
        raw: instruction,
        trace: buildTrace(context, instruction),
        message: "La misión pidió producción real, pero el contrato semántico no declaró artefactos ejecutables. Se requiere replanificación semántica; no se declarará la misión como completa."
    };
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
        objectiveId: clean(context.objectiveId),
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

function inferBrandName(_instruction, context = {}) {
    return (
        clean(context.brandName) ||
        clean(context.name) ||
        ""
    );
}

function availableContext(context = {}) {
    const memory =
        context.marketingContext &&
        typeof context.marketingContext === "object"
            ? context.marketingContext
            : {};
    return { ...memory, ...context };
}

function isolateMarketingContext(_instruction, context = {}) {
    const memory =
        context.marketingContext &&
        typeof context.marketingContext === "object"
            ? context.marketingContext
            : {};
    const currentBrand =
        clean(context.brandName) ||
        clean(context.name);
    const rememberedBrand =
        clean(memory.brandName) ||
        clean(memory.name);

    if (
        !currentBrand ||
        !rememberedBrand ||
        normalized(currentBrand) ===
            normalized(rememberedBrand)
    ) {
        return availableContext(context);
    }

    const isolated = {};
    for (const key of [
        "objectiveId",
        "caseId",
        "authorityId",
        "controllerId",
        "userId",
        "workspaceId",
        "projectId",
        "conversationId"
    ]) {
        if (
            context[key] !== undefined &&
            context[key] !== null
        ) {
            isolated[key] = context[key];
        }
    }

    return {
        ...isolated,
        ...context,
        brandName: currentBrand,
        name: currentBrand,
        marketingContext: {},
        contextIsolation:
            "CURRENT_SEMANTIC_BRAND_ISOLATED"
    };
}

function missingCriticalInputs(context = {}, instruction = "") {
    const brandName =
        inferBrandName(
            instruction,
            availableContext(context)
        );
    return brandName
        ? []
        : [REQUIRED_MARKETING_IDENTITY];
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

function inferAudience(_instruction, context = {}) {
    return clean(context.audience);
}

function deriveCreativeBrief(instruction, context = {}) {
    const brandName =
        inferBrandName(instruction, context);
    const audience =
        inferAudience(instruction, context);

    return {
        brandName,
        audience,
        offer: clean(context.offer),
        pain: clean(context.pain),
        promise: clean(context.promise),
        differentiator: clean(context.differentiator),
        cta: clean(context.cta),
        tone: clean(context.tone) || clean(context.voice),
        inferredFields: [
            ...(!clean(context.audience)
                ? ["audience"]
                : []),
            ...(!clean(context.offer)
                ? ["offer"]
                : []),
            ...(!clean(context.pain)
                ? ["pain"]
                : []),
            ...(!clean(context.promise)
                ? ["promise"]
                : []),
            ...(!clean(context.differentiator)
                ? ["differentiator"]
                : []),
            ...(!clean(context.cta)
                ? ["cta"]
                : [])
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
        export: { preview: true, webm: true, mp4: false, mp4Status: "NOT_PRODUCED_BY_PLANNING" },
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
    const budget = clean(context.budget);
    const horizon = clean(context.horizon);
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
            alternatives: strings(context.competitors),
            advantage: campaign.differentiator,
            note: strings(context.competitors).length
                ? "Competidores proporcionados en el contexto semántico."
                : "No se proporcionó ni verificó una lista factual de competidores; no se inventan alternativas."
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
        budgetScenarios: budget
            ? [
                { scenario: "base", allocation: budget, note: "Distribución por canal debe decidirse con datos de rendimiento." },
                ...(clean(context.mediumBudget)
                    ? [{ scenario: "expanded", allocation: clean(context.mediumBudget), note: "Escalamiento condicionado a resultados medidos." }]
                    : [])
            ]
            : [{ scenario: "pending", note: "No se proporcionó un presupuesto factual; definirlo antes de comprar medios." }],
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
    const missingSemanticFields = missingSemanticBriefFields(context);
    if (missingSemanticFields.length) {
        return semanticBriefIncompleteResult(
            instruction,
            context,
            missingSemanticFields
        );
    }
    const productionRequested = context.productionRequested === true;
    const requiredArtifacts = structuredProductionArtifacts(context);
    if (productionRequested && requiredArtifacts.length === 0) {
        return productionContractIncompleteResult(instruction, context);
    }
    const creativeBrief = deriveCreativeBrief(instruction, context);
    const brand = {
        name: creativeBrief.brandName,
        voice: creativeBrief.tone,
        market: clean(context.market) || "mercado prioritario por validar",
        owner: clean(context.owner) || NEXO_IDENTITY.owner
    };
    const channels = strings(context.channels).length
        ? strings(context.channels)
        : ["instagram", "facebook", "tiktok", "whatsapp"];
    const assets = strings(context.assets).length
        ? strings(context.assets)
        : productionRequested
            ? [...new Set(requiredArtifacts.map(item => item.type).filter(Boolean))]
            : ["campaign"];
    const grounding = buildGrounding(context);
    const inferredPlanningFields = [
        ...(!clean(context.campaignObjective)
            ? ["campaignObjective"]
            : []),
        ...(!clean(context.market)
            ? ["market"]
            : []),
        ...(!clean(context.budget)
            ? ["budget"]
            : []),
        ...(!clean(context.horizon)
            ? ["horizon"]
            : []),
        ...(strings(context.channels).length === 0
            ? ["channels"]
            : []),
        ...(strings(context.assets).length === 0
            ? ["assets"]
            : [])
    ];
    const allInferredFields = [
        ...new Set([
            ...creativeBrief.inferredFields,
            ...inferredPlanningFields
        ])
    ];
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
            : [hashtag(brand.name), hashtag(context.market)].filter(Boolean),
        metrics: strings(context.metrics),
        variants: [
            { id: "A", angle: "pain_first", hookIndex: 0 },
            { id: "B", angle: "promise_first", hookIndex: 1 }
        ],
        assumptions: allInferredFields.map(field => ({
            field,
            source: "semantic_proposal",
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
        inferredInputs: allInferredFields,
        productionRequested,
        requiredArtifacts,
        planReady: true,
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
            `ADJUNTO preparó una campaña específica para ${brand.name}. ` +
            `${allInferredFields.length} campos se marcaron como propuestas editables y ` +
            `${grounding.sourceCount} fuentes respaldan hechos verificables.`
    };
    result.userVisible = renderCompleteMarketingPlan(result);
    result.planReady = hasCompleteMarketingPlan(result.plan) && Boolean(result.userVisible);
    result.objectiveSatisfied = result.planReady;
    result.readyForProduction = result.planReady && (
        result.productionRequested !== true ||
        result.requiredArtifacts.length > 0
    );
    if (!result.planReady) {
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
    routing: "semantic_fields_with_editable_assumptions",
    isMarketingRequest,
    plan: planMarketingRequest
};

export const NexoMarketingEngine = JarvisMarketingEngine;

if (typeof globalThis !== "undefined") {
    globalThis.NexoMarketingEngine = NexoMarketingEngine;
    globalThis.JarvisMarketingEngine = JarvisMarketingEngine;
}
