/**
 * =====================================================================================
 * JARVIS MARKETING ENGINE V3
 * Structured, editable and approval-bound marketing production for Gestia/SIA7.
 * =====================================================================================
 */

const VERSION = "3.0.0-sia7-marketing-studio";

const CHANNELS = [
    ["tiktok", /\b(tiktok|tik tok)\b/i],
    ["instagram", /\b(instagram|insta|ig)\b/i],
    ["facebook", /\b(facebook|fb)\b/i],
    ["whatsapp", /\b(whatsapp|wa)\b/i],
    ["web", /\b(web|landing|pagina|sitio)\b/i]
];

const ASSETS = [
    ["landing_page", /\b(landing|pagina|web|sitio|home|page)\b/i],
    ["flyer", /\b(flyer|flayer|volante|poster|post)\b/i],
    ["editable_photo", /\b(foto|imagen|editable|photo|mockup)\b/i],
    ["reel", /\b(reel|video corto|short|tiktok|tik tok|historia|story)\b/i],
    ["campaign", /\b(campana|marketing|publicidad|anuncio|ads|contenido)\b/i]
];

export function planMarketingRequest(rawInput = "", context = {}) {
    const raw = String(rawInput || "");
    const normalized = normalize(raw);
    const assets = detectAssets(raw);
    const channels = detectChannels(raw);
    const brand = resolveBrand(context);
    const primaryAsset = assets[0] || "campaign";
    const trace = buildTrace(context, raw);

    const plan = {
        ok: true,
        engine: "jarvis_marketing_engine",
        version: VERSION,
        source: "jarvis_marketing_engine_v3",
        raw,
        intent: "MARKETING_PACKAGE",
        domain: "marketing",
        trace,
        approval: {
            required: true,
            approved: false,
            authorityId: trace.authorityId,
            controllerId: trace.controllerId,
            publishAllowed: false,
            deployAllowed: false
        },
        brand,
        primaryAsset,
        assets,
        channels,
        goal: buildGoal(primaryAsset, channels, brand),
        audience: context.audience || "administradores, empresas y clientes operativos",
        offer: context.offer || "operacion mas rapida, trazable y profesional",
        editable: true,
        campaign: buildCampaign(primaryAsset, channels, brand, context),
        funnel: buildFunnel(brand, context),
        copies: buildCopies(channels, brand, context),
        calendar: buildCalendar(channels, brand),
        publications: buildPublications(channels, brand, context),
        deliverables: buildDeliverables(primaryAsset, assets, channels, brand),
        creativeBrief: buildCreativeBrief(primaryAsset, channels, brand, normalized),
        videoPackage: buildVideoPackage(channels, brand, context),
        productionSteps: buildProductionSteps(primaryAsset, assets, channels),
        confidence: assets.length || channels.length ? 0.96 : 0.78
    };

    plan.message = summarizePlan(plan);
    return plan;
}

export function isMarketingRequest(rawInput = "") {
    const raw = String(rawInput || "");
    return ASSETS.some(([, pattern]) => pattern.test(raw)) ||
        CHANNELS.some(([, pattern]) => pattern.test(raw)) ||
        /\b(marketing|marca|campana|publicidad|contenido|redes sociales|embudo|copy|calendario)\b/i.test(raw);
}

function buildTrace(context, raw) {
    return {
        objectiveId: context.objectiveId || `MKT-${Date.now()}`,
        authorityId: context.authorityId || "HEBERTO_MENDOZA",
        controllerId: context.controllerId || "CODEX_SIA7",
        instruction: raw,
        generatedAt: Date.now(),
        source: "human_instruction",
        memoryRole: "advisory_only"
    };
}

function normalize(text = "") {
    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function detectAssets(raw = "") {
    return [...new Set(ASSETS.filter(([, pattern]) => pattern.test(raw)).map(([asset]) => asset))];
}

function detectChannels(raw = "") {
    return [...new Set(CHANNELS.filter(([, pattern]) => pattern.test(raw)).map(([channel]) => channel))];
}

function resolveBrand(context = {}) {
    return {
        name: context.brandName || context.name || "FixGo / GestiaPremium",
        voice: context.voice || "confiable, directo, operativo y premium",
        market: context.market || "servicios, administracion y operacion inmobiliaria",
        owner: context.owner || "Heberto"
    };
}

function buildGoal(asset, channels, brand) {
    const channelText = channels.length ? ` para ${channels.join(", ")}` : "";
    return `Crear ${asset.replace(/_/g, " ")}${channelText} de ${brand.name}`;
}

function buildCampaign(primaryAsset, channels, brand, context) {
    return {
        name: context.campaignName || `${brand.name} Control Total`,
        objective: context.campaignObjective || "generar conversaciones calificadas y solicitudes de demo",
        primaryAsset,
        channels: channels.length ? channels : ["instagram", "facebook", "whatsapp"],
        promise: context.promise || "menos friccion, mas control y evidencia real",
        kpis: ["alcance", "clics", "conversaciones", "demos", "conversiones"],
        status: "draft_for_approval"
    };
}

function buildFunnel(brand, context) {
    return [
        { stage: "awareness", asset: "reel_or_post", message: "Haz visible el problema operativo" },
        { stage: "consideration", asset: "carousel_or_landing", message: `Explica como ${brand.name} centraliza la operacion` },
        { stage: "conversion", asset: "whatsapp_or_demo", message: context.cta || "Agenda una demo" },
        { stage: "follow_up", asset: "case_study", message: "Demuestra trazabilidad, evidencia y resultado" }
    ];
}

function buildCopies(channels, brand, context) {
    const cta = context.cta || "Agenda una demo";
    const requested = channels.length ? channels : ["instagram", "facebook", "whatsapp"];
    return requested.map(channel => ({
        channel,
        hook: "Tu operacion no necesita mas mensajes dispersos. Necesita control.",
        body: `${brand.name} centraliza ordenes, evidencia, seguimiento y resultados en un solo flujo.`,
        cta,
        editable: true,
        status: "draft_for_approval"
    }));
}

function buildCalendar(channels, brand) {
    const requested = channels.length ? channels : ["instagram", "facebook"];
    return [
        { day: 1, type: "post", topic: "problema operativo", channels: requested },
        { day: 3, type: "reel", topic: `${brand.name} en 30 segundos`, channels: requested },
        { day: 5, type: "carousel", topic: "beneficios y evidencia", channels: requested },
        { day: 7, type: "story_sequence", topic: "pregunta + demo + CTA", channels: requested }
    ];
}

function buildPublications(channels, brand, context) {
    const cta = context.cta || "Solicita una demo";
    const requested = channels.length ? channels : ["instagram", "facebook"];
    return requested.map(channel => ({
        channel,
        title: `${brand.name}: control operativo sin perder trazabilidad`,
        caption: `Ordenes, evidencia y seguimiento desde un solo sistema. ${cta}.`,
        hashtags: ["#GestiaPremium", "#Operacion", "#Mantenimiento", "#Tecnologia"],
        publishStatus: "blocked_until_human_approval"
    }));
}

function buildDeliverables(primaryAsset, assets, channels, brand) {
    const requestedAssets = assets.length ? assets : [primaryAsset];
    const deliverables = [];

    for (const asset of requestedAssets) {
        if (asset === "landing_page") deliverables.push({
            type: "landing_page", format: "html/css/js", editable: true,
            sections: ["hero", "beneficios", "servicios", "prueba social", "cta"],
            title: `${brand.name} landing page`
        });
        if (asset === "flyer") deliverables.push({
            type: "flyer", format: "editable_image_brief", editable: true,
            sizes: ["1080x1350", "1080x1080", "story_1080x1920"]
        });
        if (asset === "editable_photo") deliverables.push({
            type: "photo_edit", format: "image_prompt_and_layers", editable: true,
            layers: ["subject", "background", "headline", "cta", "logo"]
        });
        if (asset === "reel") deliverables.push({
            type: "short_video", format: "script_storyboard_subtitles_prompts", editable: true,
            durationSeconds: 30, channels: channels.length ? channels : ["tiktok", "instagram"]
        });
        if (asset === "campaign") deliverables.push({
            type: "campaign_calendar", format: "weekly_plan", editable: true,
            cadence: "3 posts + 2 reels + 1 story sequence"
        });
    }
    return deliverables;
}

function buildCreativeBrief(primaryAsset, channels, brand, normalized) {
    return {
        primaryAsset,
        hook: "Tu operacion puede verse profesional, medirse y resolverse desde un solo sistema.",
        visualDirection: "limpio, premium, tecnologico, con evidencia real del servicio",
        copyAngle: detectCopyAngle(normalized),
        callToAction: channels.includes("whatsapp") ? "Agenda por WhatsApp" : "Solicita una demo",
        photoPrompt: `Imagen editorial premium para ${brand.name}, operacion profesional, interfaz digital, equipo en campo, luz natural, alta confianza, formato comercial editable`
    };
}

function buildVideoPackage(channels, brand, context) {
    return {
        durationSeconds: Number(context.durationSeconds) || 30,
        channels: channels.length ? channels : ["instagram", "tiktok"],
        script: [
            "Hook: operaciones dispersas cuestan tiempo y control.",
            `Problema: mensajes, ordenes y evidencia separados.`,
            `Solucion: ${brand.name} centraliza el flujo.`,
            `Resultado: trazabilidad, velocidad y confianza.`,
            `CTA: ${context.cta || "Agenda una demo"}.`
        ],
        storyboard: [
            { shot: 1, seconds: "0-3", visual: "caos de mensajes y tareas", overlay: "¿Todavia operas asi?" },
            { shot: 2, seconds: "3-10", visual: "dashboard y orden de servicio", overlay: "Centraliza" },
            { shot: 3, seconds: "10-20", visual: "tecnico con evidencia", overlay: "Traza cada paso" },
            { shot: 4, seconds: "20-27", visual: "resultado y cliente satisfecho", overlay: "Control real" },
            { shot: 5, seconds: "27-30", visual: "logo y CTA", overlay: context.cta || "Agenda una demo" }
        ],
        subtitles: true,
        visualPrompts: [
            `Escena comercial premium de ${brand.name}, tecnico profesional usando una app, entorno inmobiliario moderno`,
            `Dashboard SaaS limpio mostrando ordenes, evidencia y seguimiento, estilo tecnologico premium`
        ],
        status: "draft_for_approval"
    };
}

function detectCopyAngle(normalized = "") {
    if (normalized.includes("empresa") || normalized.includes("b2b")) return "beneficio empresarial y control operativo";
    if (normalized.includes("premium")) return "marca premium y confianza";
    if (normalized.includes("tiktok") || normalized.includes("reel")) return "gancho rapido, problema visible y solucion en 30 segundos";
    return "claridad operativa y ahorro de tiempo";
}

function buildProductionSteps(primaryAsset, assets, channels) {
    return [
        { step: "brief", title: "Definir oferta, publico y CTA", status: "ready" },
        { step: "copy", title: "Generar textos por canal", status: "ready" },
        { step: "visual", title: "Crear prompt/asset editable", status: "ready" },
        { step: "publish_plan", title: channels.length ? `Adaptar para ${channels.join(", ")}` : "Adaptar para canales principales", status: "ready" },
        {
            step: "repo_or_asset_output",
            title: primaryAsset === "landing_page" || assets.includes("landing_page") ? "Crear pagina dentro del repo" : "Preparar asset editable para aprobacion",
            status: "requires_approval"
        }
    ];
}

function summarizePlan(plan = {}) {
    return `Marketing V3 listo: ${plan.goal}. Campana, embudo, copies, calendario, publicaciones y paquete audiovisual preparados para aprobacion.`;
}

export const JarvisMarketingEngine = {
    version: VERSION,
    isMarketingRequest,
    plan: planMarketingRequest
};

if (typeof globalThis !== "undefined") {
    globalThis.JarvisMarketingEngine = JarvisMarketingEngine;
}
