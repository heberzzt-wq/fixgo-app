/**
 * Marketing Studio V7
 * Produces structured campaigns from explicit semantic fields and traceable evidence.
 * It does not classify free text with keyword lists or regular expressions.
 */

const VERSION = "7.0.0-evidence-grounded-marketing";

function clean(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

function strings(value, limit = 20) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(clean).filter(Boolean))].slice(0, limit);
}

function hashtag(value) {
    const normalized = clean(value).normalize("NFD");
    const safe = Array.from(normalized).filter(character => {
        const code = character.toLowerCase().charCodeAt(0);
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
    const sources = [
        evidenceEntry("landing", context.landing),
        evidenceEntry("repo", context.repoEvidence),
        evidenceEntry("documents", context.documents),
        evidenceEntry("photographs", context.photographs),
        evidenceEntry("testimonials", context.testimonials),
        evidenceEntry("services", context.services),
        evidenceEntry("web_research", context.webResearch)
    ];
    const available = sources.filter(source => source.available);
    return {
        status: available.length ? "GROUNDED" : "USER_CONTEXT_ONLY",
        sourceCount: available.length,
        sources,
        policy: "NO_INVENTED_FACTS"
    };
}

function buildTrace(context, instruction) {
    return {
        objectiveId: clean(context.objectiveId) || `MKT-${Date.now()}`,
        caseId: clean(context.caseId),
        authorityId: clean(context.authorityId) || "HEBERTO_MENDOZA",
        controllerId: clean(context.controllerId) || "CODEX_SIA7",
        instruction,
        generatedAt: Date.now(),
        source: "semantic_fields_and_evidence",
        memoryRole: "advisory_only"
    };
}

function resolveBrand(context) {
    return {
        name: clean(context.brandName) || clean(context.name),
        voice: clean(context.tone) || clean(context.voice),
        market: clean(context.market),
        owner: clean(context.owner)
    };
}

function missingRequired(brand, context) {
    const missing = [];
    if (!brand.name) missing.push("brandName");
    if (!clean(context.audience)) missing.push("audience");
    if (!clean(context.offer)) missing.push("offer");
    if (!clean(context.pain)) missing.push("pain");
    if (!clean(context.promise)) missing.push("promise");
    if (!clean(context.differentiator)) missing.push("differentiator");
    if (!clean(context.cta)) missing.push("cta");
    return missing;
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
        evidencePolicy: "Use only supplied assets and cited sources",
        editable: true,
        status: "draft_for_approval"
    }));
}

function buildCalendar(channels, brand, campaign) {
    return [
        { day: 1, stage: "awareness", format: "reel", topic: campaign.pain, channels },
        { day: 2, stage: "awareness", format: "story", topic: campaign.hooks[2], channels },
        { day: 3, stage: "consideration", format: "carousel", topic: campaign.differentiator, channels },
        { day: 5, stage: "consideration", format: "testimonial", topic: `Evidencia de ${brand.name}`, channels },
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
    const duration = Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) >= 30
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
            { scene: 4, range: `20-${duration - 4}`, purpose: "proof", overlay: campaign.differentiator },
            { scene: 5, range: `${duration - 4}-${duration}`, purpose: "cta", overlay: campaign.cta }
        ],
        subtitles: { required: true, editable: true },
        narration: { scriptReady: true, voiceApprovalRequired: true },
        export: { preview: true, webm: true, mp4: "WHEN_INFRASTRUCTURE_AVAILABLE" },
        status: "draft_for_approval"
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

export function planMarketingRequest(rawInput = "", context = {}) {
    const instruction = clean(rawInput);
    const brand = resolveBrand(context);
    const channels = strings(context.channels).length
        ? strings(context.channels)
        : ["instagram", "facebook", "whatsapp"];
    const assets = strings(context.assets).length ? strings(context.assets) : ["campaign"];
    const grounding = buildGrounding(context);
    const missingInputs = missingRequired(brand, context);
    const readyForProduction = missingInputs.length === 0;
    const campaign = readyForProduction ? {
        name: clean(context.campaignName) || `${brand.name} — campaña de conversión`,
        objective: clean(context.campaignObjective) || `Convertir interés de ${clean(context.audience)} en conversaciones calificadas`,
        audience: clean(context.audience),
        offer: clean(context.offer),
        pain: clean(context.pain),
        promise: clean(context.promise),
        differentiator: clean(context.differentiator),
        tone: clean(context.tone) || clean(brand.voice) || "directo y profesional",
        cta: clean(context.cta),
        hooks: buildHooks(brand, clean(context.pain), clean(context.promise), clean(context.differentiator)),
        description: `${clean(context.offer)}. ${clean(context.promise)}. ${clean(context.cta)}.`,
        hashtags: strings(context.hashtags).length
            ? strings(context.hashtags)
            : [hashtag(brand.name), hashtag(context.market), "#ServicioProfesional", "#AtencionTecnica"].filter(Boolean),
        metrics: strings(context.metrics).length
            ? strings(context.metrics)
            : ["qualified_conversations", "landing_conversion", "cost_per_lead", "appointments"],
        variants: [
            { id: "A", angle: "pain_first", hookIndex: 0 },
            { id: "B", angle: "promise_first", hookIndex: 1 }
        ]
    } : null;

    const plan = {
        ok: true,
        status: readyForProduction ? "MARKETING_PACKAGE_READY" : "MARKETING_INPUT_REQUIRED",
        engine: "jarvis_marketing_engine",
        version: VERSION,
        source: "jarvis_marketing_engine_v7",
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
        missingInputs,
        readyForProduction,
        campaign,
        copies: campaign ? buildCopies(channels, campaign) : [],
        calendar: campaign ? buildCalendar(channels, brand, campaign) : [],
        funnel: campaign ? buildFunnel(campaign) : [],
        publications: campaign ? buildCopies(channels, campaign).map(copy => ({ ...copy, publishStatus: "blocked_until_human_approval" })) : [],
        deliverables: campaign ? buildDeliverables(assets, channels, campaign) : [],
        videoPackage: campaign ? buildVideoPackage(channels, campaign, context.durationSeconds) : null,
        pieces: campaign ? assets.map((asset, index) => ({ id: index + 1, asset, variant: index % 2 ? "B" : "A" })) : [],
        formats: campaign ? buildDeliverables(assets, channels, campaign).map(item => ({ type: item.type, format: item.format, dimensions: item.dimensions })) : [],
        onScreenTexts: campaign ? buildVideoPackage(channels, campaign, context.durationSeconds).storyboard.map(scene => scene.overlay) : [],
        publicationPlan: campaign ? buildCalendar(channels, brand, campaign) : [],
        editable: true
    };
    plan.message = readyForProduction
        ? `Marketing V7 preparó una campaña específica para ${brand.name}, sustentada en ${grounding.sourceCount} fuentes de evidencia.`
        : `Marketing V7 no inventó contenido: faltan ${missingInputs.join(", ")}.`;
    return plan;
}

export function isMarketingRequest(input = null) {
    return Boolean(input && typeof input === "object" && clean(input.domain) === "marketing");
}

export const JarvisMarketingEngine = {
    version: VERSION,
    routing: "semantic_model_only",
    isMarketingRequest,
    plan: planMarketingRequest
};

if (typeof globalThis !== "undefined") {
    globalThis.JarvisMarketingEngine = JarvisMarketingEngine;
}
