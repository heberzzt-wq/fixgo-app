/**
 * =====================================================================================
 * JARVIS MARKETING ENGINE V2
 * Brand, content and campaign planner for FixGo / GestiaPremium.
 *
 * This engine does not publish externally by itself. It creates structured briefs for:
 * - company pages and landing pages
 * - flyers and editable graphics
 * - photo-edit prompts
 * - reels / TikTok / Instagram scripts
 * - campaign calendars
 * =====================================================================================
 */

const VERSION = "2.0.0-marketing-studio";

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

    const plan = {
        ok: true,
        engine: "jarvis_marketing_engine",
        version: VERSION,
        source: "jarvis_marketing_engine_v2",
        raw,
        intent: "MARKETING_PLAN",
        domain: "marketing",
        brand,
        primaryAsset,
        assets,
        channels,
        goal: buildGoal(primaryAsset, channels, brand),
        audience: context.audience || "administradores, empresas y clientes operativos",
        offer: context.offer || "operacion mas rapida, trazable y profesional",
        editable: true,
        requiresHumanApproval: true,
        deliverables: buildDeliverables(primaryAsset, assets, channels, brand),
        creativeBrief: buildCreativeBrief(primaryAsset, channels, brand, normalized),
        productionSteps: buildProductionSteps(primaryAsset, assets, channels),
        confidence: assets.length || channels.length ? 0.94 : 0.72
    };

    plan.message = summarizePlan(plan);

    return plan;
}

export function isMarketingRequest(rawInput = "") {
    const raw = String(rawInput || "");
    return ASSETS.some(([, pattern]) => pattern.test(raw)) ||
        CHANNELS.some(([, pattern]) => pattern.test(raw)) ||
        /\b(marketing|marca|campana|publicidad|contenido|redes sociales)\b/i.test(raw);
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
    const found = ASSETS
        .filter(([, pattern]) => pattern.test(raw))
        .map(([asset]) => asset);

    return [...new Set(found)];
}

function detectChannels(raw = "") {
    const found = CHANNELS
        .filter(([, pattern]) => pattern.test(raw))
        .map(([channel]) => channel);

    return [...new Set(found)];
}

function resolveBrand(context = {}) {
    return {
        name: context.brandName || context.name || "FixGo / GestiaPremium",
        voice: context.voice || "confiable, directo, operativo y premium",
        market: context.market || "servicios, administracion y operacion inmobiliaria",
        owner: context.owner || "Heberto"
    };
}

function buildGoal(asset = "campaign", channels = [], brand = {}) {
    const channelText = channels.length ? ` para ${channels.join(", ")}` : "";
    const assetLabel = asset.replace(/_/g, " ");
    return `Crear ${assetLabel}${channelText} de ${brand.name}`;
}

function buildDeliverables(primaryAsset, assets, channels, brand) {
    const requestedAssets = assets.length ? assets : [primaryAsset];
    const deliverables = [];

    for (const asset of requestedAssets) {
        if (asset === "landing_page") {
            deliverables.push({
                type: "landing_page",
                format: "html/css/js",
                editable: true,
                sections: ["hero", "beneficios", "servicios", "prueba social", "cta"],
                title: `${brand.name} landing page`
            });
        }

        if (asset === "flyer") {
            deliverables.push({
                type: "flyer",
                format: "editable_image_brief",
                editable: true,
                sizes: ["1080x1350", "1080x1080", "story_1080x1920"],
                title: `${brand.name} flyer`
            });
        }

        if (asset === "editable_photo") {
            deliverables.push({
                type: "photo_edit",
                format: "image_prompt_and_layers",
                editable: true,
                layers: ["subject", "background", "headline", "cta", "logo"]
            });
        }

        if (asset === "reel") {
            deliverables.push({
                type: "short_video",
                format: "script_shotlist_caption",
                editable: true,
                durationSeconds: 30,
                channels: channels.length ? channels : ["tiktok", "instagram"]
            });
        }

        if (asset === "campaign") {
            deliverables.push({
                type: "campaign_calendar",
                format: "weekly_plan",
                editable: true,
                cadence: "3 posts + 2 reels + 1 story sequence"
            });
        }
    }

    return deliverables;
}

function buildCreativeBrief(primaryAsset, channels, brand, normalized) {
    return {
        hook: "Tu operacion puede verse profesional, medirse y resolverse desde un solo sistema.",
        visualDirection: "limpio, premium, tecnologico, con evidencia real del servicio",
        copyAngle: detectCopyAngle(normalized),
        callToAction: channels.includes("whatsapp")
            ? "Agenda por WhatsApp"
            : "Solicita una demo",
        photoPrompt: `Imagen editorial premium para ${brand.name}, operacion profesional, interfaz digital, equipo en campo, luz natural, alta confianza, formato comercial editable`,
        reelScript: [
            "Problema: operaciones dispersas y sin trazabilidad.",
            "Demostracion: FixGo/GestiaPremium centraliza ordenes, evidencia y seguimiento.",
            "Resultado: menos friccion, mas control y mejor experiencia.",
            "CTA: agenda una demo."
        ]
    };
}

function detectCopyAngle(normalized = "") {
    if (normalized.includes("empresa") || normalized.includes("b2b")) {
        return "beneficio empresarial y control operativo";
    }

    if (normalized.includes("premium")) {
        return "marca premium y confianza";
    }

    if (normalized.includes("tiktok") || normalized.includes("reel")) {
        return "gancho rapido, problema visible y solucion en 30 segundos";
    }

    return "claridad operativa y ahorro de tiempo";
}

function buildProductionSteps(primaryAsset, assets, channels) {
    return [
        {
            step: "brief",
            title: "Definir oferta, publico y CTA",
            status: "ready"
        },
        {
            step: "copy",
            title: "Generar textos por canal",
            status: "ready"
        },
        {
            step: "visual",
            title: "Crear prompt/asset editable",
            status: "ready"
        },
        {
            step: "publish_plan",
            title: channels.length ? `Adaptar para ${channels.join(", ")}` : "Adaptar para canales principales",
            status: "ready"
        },
        {
            step: "repo_or_asset_output",
            title: primaryAsset === "landing_page" || assets.includes("landing_page")
                ? "Crear pagina dentro del repo"
                : "Preparar asset editable para aprobacion",
            status: "requires_approval"
        }
    ];
}

function summarizePlan(plan = {}) {
    return `Marketing V2 listo: ${plan.goal}. Entregables: ${plan.deliverables.map(item => item.type).join(", ")}.`;
}

export const JarvisMarketingEngine = {
    version: VERSION,
    isMarketingRequest,
    plan: planMarketingRequest
};

if (typeof globalThis !== "undefined") {
    globalThis.JarvisMarketingEngine = JarvisMarketingEngine;
}
