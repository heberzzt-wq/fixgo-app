/*
 * ======================================================================================
 * NEXO LOCAL MISSION COMPILER
 * ======================================================================================
 * Respaldo determinista para el planificador semántico cloud.
 * Convierte solicitudes creativas en herramientas ejecutables con argumentos completos.
 * No publica, despliega ni modifica servicios externos.
 * ======================================================================================
 */

import {
    NEXO_IDENTITY
} from "./nexo.identity.js";

export const NEXO_MISSION_COMPILER_VERSION = "1.0.0-one-instruction-artifacts";

function clean(value, maxLength = 12000) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

function normalize(value = "") {
    return clean(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function slug(value = "nexo") {
    return normalize(value)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 70) || "nexo";
}

function includesAny(text, signals = []) {
    return signals.some(signal => text.includes(signal));
}

function catalogNames(catalog = []) {
    return new Set(
        (Array.isArray(catalog) ? catalog : [])
            .map(tool => clean(tool?.name, 160))
            .filter(Boolean)
    );
}

function extractAssignedValue(source = "", key = "") {
    const marker = `${key}=`;
    const start = source.indexOf(marker);
    if (start < 0) return "";
    const valueStart = start + marker.length;
    const nextMarker = source.indexOf("\n", valueStart);
    return clean(
        source.slice(
            valueStart,
            nextMarker >= 0 ? nextMarker : source.length
        ),
        12000
    );
}

function originalInstruction(input = "") {
    return (
        extractAssignedValue(input, "INSTRUCCION_ORIGINAL") ||
        extractAssignedValue(input, "SOLICITUD_ORIGINAL") ||
        extractAssignedValue(input, "SOLICITUD") ||
        clean(input)
    );
}

function inferBrand(instruction = "", context = {}) {
    const text = normalize(instruction);
    if (text.includes("peninsula tech") || text.includes("península tech")) {
        return "Peninsula Tech";
    }
    if (text.includes("gestiapremium") || text.includes("gestia premium")) {
        return "GestiaPremium";
    }
    if (text.includes("fixgo") || text.includes("fix go")) {
        return "FixGo";
    }
    return clean(context.brandName || context.name, 120) || "Peninsula Tech";
}

function inferSubject(instruction = "") {
    const text = normalize(instruction);
    const known = [
        ["aire acondicionado", "servicios de aire acondicionado"],
        ["aires acondicionados", "servicios de aire acondicionado"],
        ["plomer", "servicios de plomería"],
        ["electric", "servicios eléctricos"],
        ["mantenimiento", "mantenimiento profesional"],
        ["seguridad", "servicios de alta confianza"],
        ["tecnico", "servicios técnicos verificados"],
        ["técnico", "servicios técnicos verificados"],
        ["marketing", "crecimiento comercial"],
        ["campana", "campaña comercial"],
        ["campaña", "campaña comercial"]
    ];
    return known.find(([signal]) => text.includes(normalize(signal)))?.[1] ||
        "servicios tecnológicos y operativos de confianza";
}

function inferAudience(instruction = "") {
    const text = normalize(instruction);
    if (includesAny(text, ["hotel", "condominio", "empresa", "b2b"])) {
        return "administradores de inmuebles, hoteles, condominios y empresas en México";
    }
    if (includesAny(text, ["casa", "hogar", "domicilio", "cliente final"])) {
        return "propietarios y residentes que necesitan atención técnica confiable";
    }
    return "clientes residenciales y empresariales que valoran seguridad, trazabilidad y respuesta rápida";
}

function inferBrief(instruction = "", context = {}) {
    const brandName = inferBrand(instruction, context);
    const subject = inferSubject(instruction);
    const audience = clean(context.audience, 300) || inferAudience(instruction);
    const offer = clean(context.offer, 500) ||
        `Programa integral para presentar y convertir la oferta de ${subject} de ${brandName}`;
    const pain = clean(context.pain, 500) ||
        "la dificultad para encontrar proveedores confiables, transparentes y trazables";
    const promise = clean(context.promise, 500) ||
        "una experiencia más clara, segura y documentada desde la solicitud hasta el cierre";
    const differentiator = clean(context.differentiator, 500) ||
        "identidad verificable, evidencia por servicio, seguimiento operativo y revisión humana de incidencias";
    const cta = clean(context.cta, 300) ||
        `Solicita una evaluación con ${brandName}`;

    return {
        brandName,
        subject,
        audience,
        offer,
        pain,
        promise,
        differentiator,
        cta,
        tone: clean(context.tone, 180) || "directo, confiable y profesional"
    };
}

function detectDeliverables(instruction = "") {
    const text = normalize(instruction);
    return {
        marketing: includesAny(text, [
            "marketing", "mercadotecnia", "campana", "campaña",
            "publicidad", "plan comercial", "programa comercial"
        ]),
        page: includesAny(text, [
            "pagina web", "página web", "landing", "sitio web",
            "website", "web page", "pagina de venta", "página de venta"
        ]),
        reel: includesAny(text, [
            "reel", "tiktok", "tik tok", "video vertical", "short"
        ]),
        image: includesAny(text, [
            "imagen", "foto", "flyer", "poster", "póster", "anuncio visual"
        ]),
        pdf: includesAny(text, [" pdf", "pdf ", "en pdf", "archivo pdf"]),
        docx: includesAny(text, [" word", "word ", "docx", "documento word"]),
        xlsx: includesAny(text, [" excel", "excel ", "xlsx", "hoja de calculo", "hoja de cálculo"]),
        pptx: includesAny(text, ["powerpoint", "power point", "pptx", "presentacion", "presentación"])
    };
}

function campaignPayload(instruction = "", context = {}) {
    const brief = inferBrief(instruction, context);
    return {
        ...brief,
        prompt: instruction,
        campaignName: `${brief.brandName} — confianza que se demuestra`,
        campaignObjective:
            `Generar conversaciones calificadas con ${brief.audience}`,
        channels: ["instagram", "facebook", "tiktok", "whatsapp"],
        assets: ["campaign", "reel", "landing_page", "flyer"],
        market: "México",
        durationSeconds: 30,
        controllerId: NEXO_IDENTITY.controllerId,
        authorityId: NEXO_IDENTITY.authorityId
    };
}

function pagePayload(instruction = "", context = {}) {
    const brief = inferBrief(instruction, context);
    const title = clean(context.title, 180) ||
        `${brief.brandName} | ${brief.subject}`;
    const description = clean(context.description, 800) ||
        `${brief.promise}. ${brief.differentiator}.`;

    return {
        prompt: instruction,
        pageName: `${slug(brief.brandName)}-${slug(brief.subject)}`,
        brandName: brief.brandName,
        title,
        description,
        style: "premium technology, mobile first, high trust",
        sections: [
            "hero",
            "problema",
            "servicios",
            "seguridad_y_trazabilidad",
            "como_funciona",
            "llamada_a_la_accion",
            "contacto"
        ],
        services: [
            {
                title: "Atención técnica verificada",
                description: brief.offer
            },
            {
                title: "Evidencia y trazabilidad",
                description: brief.differentiator
            },
            {
                title: "Respuesta ante incidencias",
                description: "Cada caso se documenta y se revisa antes de determinar responsabilidades."
            }
        ],
        whatsapp: "",
        whatsappRequested: true,
        contactEmail: "",
        objectiveId: clean(context.objectiveId, 180),
        caseId: clean(context.caseId, 180)
    };
}

function reelPayload(instruction = "", context = {}) {
    const brief = inferBrief(instruction, context);
    const scenes = [
        {
            durationSeconds: 4,
            visual: "Problema cotidiano que necesita atención técnica confiable",
            overlay: "¿A quién dejas entrar a tu propiedad?",
            voiceover: "La confianza no debe depender de una promesa.",
            evidence: "Concepto creativo, no afirmación factual",
            transition: "cut"
        },
        {
            durationSeconds: 7,
            visual: "Identidad del responsable y cuadrilla autorizada",
            overlay: "Identidad verificable",
            voiceover: `${brief.brandName} organiza servicios con personal identificado.`,
            evidence: "Propuesta de producto",
            transition: "slide"
        },
        {
            durationSeconds: 7,
            visual: "Check-in, ubicación y evidencia del servicio",
            overlay: "Trazabilidad por folio",
            voiceover: "Cada etapa puede quedar documentada para proteger a todas las partes.",
            evidence: "Arquitectura de plataforma",
            transition: "zoom"
        },
        {
            durationSeconds: 7,
            visual: "Cliente y técnico revisando el resultado",
            overlay: "Evidencia antes de decidir",
            voiceover: "Las incidencias se revisan con evidencia, no con suposiciones.",
            evidence: "Política operativa propuesta",
            transition: "fade"
        },
        {
            durationSeconds: 5,
            visual: "Marca y llamada a la acción",
            overlay: brief.cta,
            voiceover: brief.cta,
            evidence: "CTA creativo",
            transition: "fade"
        }
    ];

    return {
        brandName: brief.brandName,
        title: `${brief.brandName}: seguridad que se demuestra`,
        cta: brief.cta,
        durationSeconds: 30,
        scenes,
        objectiveId: clean(context.objectiveId, 180),
        caseId: clean(context.caseId, 180)
    };
}

function marketingDocumentContent(instruction = "", context = {}) {
    const campaign = campaignPayload(instruction, context);
    return JSON.stringify({
        engine: "NEXO",
        status: "draft_for_owner_review",
        instruction,
        brand: campaign.brandName,
        objective: campaign.campaignObjective,
        audience: campaign.audience,
        offer: campaign.offer,
        pain: campaign.pain,
        promise: campaign.promise,
        differentiator: campaign.differentiator,
        cta: campaign.cta,
        channels: campaign.channels,
        assets: campaign.assets,
        sevenDayProgram: [
            { day: 1, stage: "awareness", asset: "reel", topic: campaign.pain },
            { day: 2, stage: "awareness", asset: "story", topic: campaign.promise },
            { day: 3, stage: "consideration", asset: "carousel", topic: campaign.differentiator },
            { day: 4, stage: "consideration", asset: "faq", topic: "seguridad y trazabilidad" },
            { day: 5, stage: "conversion", asset: "landing", topic: campaign.offer },
            { day: 6, stage: "conversion", asset: "whatsapp", topic: campaign.cta },
            { day: 7, stage: "optimization", asset: "metrics", topic: "conversaciones calificadas" }
        ],
        metrics: [
            "conversaciones_calificadas",
            "conversion_landing",
            "costo_por_contacto",
            "servicios_solicitados"
        ],
        factsPolicy: "creative_proposal_no_unverified_claims"
    }, null, 2);
}

function genericDocumentContent(instruction = "", context = {}) {
    const brief = inferBrief(instruction, context);
    return [
        `# ${brief.brandName}: documento operativo`,
        "",
        "## 1. Objetivo",
        instruction,
        "",
        "## 2. Audiencia",
        brief.audience,
        "",
        "## 3. Propuesta",
        brief.offer,
        "",
        "## 4. Seguridad y diferenciación",
        brief.differentiator,
        "",
        "## 5. Plan de acción",
        "- Definir alcance y responsables.",
        "- Reunir evidencia y materiales reales.",
        "- Producir entregables locales editables.",
        "- Verificar cada artefacto antes de publicar.",
        "- Medir resultados y documentar decisiones.",
        "",
        "## 6. Control",
        "Toda publicación, despliegue o movimiento externo requiere autorización del propietario."
    ].join("\n");
}

function spreadsheetPayload(instruction = "", context = {}) {
    const brief = inferBrief(instruction, context);
    return {
        format: "xlsx",
        title: `${brief.brandName} - Programa operativo`,
        requireFormulas: true,
        sheets: [
            {
                name: "Plan",
                rows: [
                    ["Día", "Canal", "Activo", "Objetivo", "Responsable", "Presupuesto"],
                    [1, "Instagram", "Reel", "Alcance", "Marketing", 0],
                    [2, "Facebook", "Publicación", "Consideración", "Marketing", 0],
                    [3, "WhatsApp", "Seguimiento", "Conversión", "Ventas", 0],
                    [4, "Landing", "Optimización", "Conversión", "Producto", 0]
                ]
            },
            {
                name: "Métricas",
                rows: [
                    ["Indicador", "Meta", "Resultado", "Cumplimiento"],
                    ["Conversaciones calificadas", 10, 0, "=IF(B2=0,0,C2/B2)"],
                    ["Solicitudes", 5, 0, "=IF(B3=0,0,C3/B3)"],
                    ["Conversión", 0.2, 0, "=IF(B4=0,0,C4/B4)"]
                ]
            }
        ],
        objectiveId: clean(context.objectiveId, 180),
        caseId: clean(context.caseId, 180)
    };
}

function buildCall(name, args, reason = "NEXO_LOCAL_MISSION_COMPILER") {
    return { name, args, reason };
}

function completedCallKeys(missionState = {}) {
    return new Set(
        [
            ...(Array.isArray(missionState.completedTasks) ? missionState.completedTasks : []),
            ...(Array.isArray(missionState.blockedTasks) ? missionState.blockedTasks : [])
        ].map(item => `${clean(item?.name, 160)}:${JSON.stringify(item?.args || {})}`)
    );
}

function uniqueAvailableCalls(calls = [], names = new Set(), missionState = {}) {
    const history = completedCallKeys(missionState);
    const seen = new Set();
    return calls.filter(call => {
        if (!names.has(call.name)) return false;
        const key = `${call.name}:${JSON.stringify(call.args || {})}`;
        if (seen.has(key) || history.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 12);
}

function argumentsForTool(toolName, instruction, context = {}) {
    const campaign = campaignPayload(instruction, context);
    const page = pagePayload(instruction, context);
    const reel = reelPayload(instruction, context);

    if (toolName === "marketing.plan") return campaign;
    if (toolName === "page.plan") {
        return {
            prompt: instruction,
            pageName: page.pageName,
            brandName: page.brandName,
            title: page.title,
            description: page.description,
            style: page.style,
            sections: page.sections
        };
    }
    if (toolName === "page.compose") {
        return {
            brandName: page.brandName,
            title: page.title,
            instructions: instruction
        };
    }
    if (toolName === "page.create") return page;
    if (toolName === "reel.plan" || toolName === "reel.create") return reel;
    if (toolName === "image.generate") {
        return {
            prompt: `Crea una pieza visual profesional para ${campaign.brandName}. Objetivo: ${campaign.offer}. Audiencia: ${campaign.audience}. Estilo: ${campaign.tone}. Sin testimonios ni certificaciones inventadas.`,
            aspectRatio: "4:5",
            imageSize: "2K",
            objectiveId: clean(context.objectiveId, 180),
            caseId: clean(context.caseId, 180)
        };
    }
    return {};
}

export function compileNexoMission({
    input = "",
    catalog = [],
    missionState = null,
    context = {}
} = {}) {
    const instruction = originalInstruction(input);
    const names = catalogNames(catalog);
    const state = missionState || {};
    const phase = clean(state.phase, 80);

    if (!instruction || names.size === 0) return null;

    if (phase === "GROUNDED_ARGUMENT_COMPLETION") {
        const toolName = clean(state.toolName, 160);
        const args = argumentsForTool(toolName, instruction, context);
        if (!toolName || !names.has(toolName) || Object.keys(args).length === 0) {
            return null;
        }
        return {
            ok: true,
            status: "NEXO_LOCAL_ARGUMENTS_READY",
            provider: "nexo-local-compiler",
            model: null,
            missionComplete: false,
            toolCalls: [buildCall(toolName, args, "NEXO_LOCAL_ARGUMENT_COMPLETION")],
            identity: NEXO_IDENTITY.name,
            version: NEXO_MISSION_COMPILER_VERSION
        };
    }

    if (phase === "COMPLETION_AUDIT") {
        const calls = names.has("system.certify")
            ? [buildCall("system.certify", { deep: true }, "NEXO_COMPLETION_AUDIT")]
            : [];
        return {
            ok: true,
            status: calls.length ? "NEXO_COMPLETION_AUDIT_READY" : "NEXO_MISSION_COMPLETE",
            provider: "nexo-local-compiler",
            model: null,
            missionComplete: calls.length === 0,
            toolCalls: calls,
            identity: NEXO_IDENTITY.name,
            version: NEXO_MISSION_COMPILER_VERSION
        };
    }

    const deliverables = detectDeliverables(instruction);
    if (!Object.values(deliverables).some(Boolean)) return null;

    const campaign = campaignPayload(instruction, context);
    const page = pagePayload(instruction, context);
    const reel = reelPayload(instruction, context);
    const calls = [];

    if (deliverables.marketing) {
        calls.push(buildCall("marketing.plan", campaign));
        calls.push(buildCall("document.create", {
            format: "json",
            title: `${campaign.brandName} - Programa de marketing`,
            content: marketingDocumentContent(instruction, context),
            objectiveId: clean(context.objectiveId, 180),
            caseId: clean(context.caseId, 180)
        }, "NEXO_MARKETING_PROGRAM_ARTIFACT"));
    }

    if (deliverables.page) {
        calls.push(buildCall("page.plan", argumentsForTool("page.plan", instruction, context)));
        calls.push(buildCall("page.create", page, "NEXO_PAGE_ARTIFACT"));
    }

    if (deliverables.reel) {
        calls.push(buildCall("reel.plan", reel));
        calls.push(buildCall("reel.create", reel, "NEXO_REEL_STUDIO_ARTIFACT"));
    }

    if (deliverables.image) {
        calls.push(buildCall(
            "image.generate",
            argumentsForTool("image.generate", instruction, context),
            "NEXO_IMAGE_ARTIFACT"
        ));
    }

    const documentContent = genericDocumentContent(instruction, context);
    if (deliverables.pdf) {
        calls.push(buildCall("document.create", {
            format: "pdf",
            title: `${campaign.brandName} - Documento`,
            content: documentContent,
            objectiveId: clean(context.objectiveId, 180),
            caseId: clean(context.caseId, 180)
        }, "NEXO_PDF_ARTIFACT"));
    }

    if (deliverables.docx) {
        calls.push(buildCall("document.compose", {
            title: `${campaign.brandName} - Documento`,
            format: "docx",
            instructions: instruction
        }, "NEXO_DOCX_COMPOSITION"));
    }

    if (deliverables.xlsx) {
        calls.push(buildCall(
            "document.create",
            spreadsheetPayload(instruction, context),
            "NEXO_XLSX_ARTIFACT"
        ));
    }

    if (deliverables.pptx) {
        calls.push(buildCall("document.create", {
            format: "pptx",
            title: `${campaign.brandName} - Presentación`,
            content: documentContent,
            slides: [
                { title: "Objetivo", body: instruction },
                { title: "Audiencia", body: campaign.audience },
                { title: "Propuesta", body: campaign.offer },
                { title: "Diferenciador", body: campaign.differentiator },
                { title: "Siguiente acción", body: campaign.cta }
            ],
            objectiveId: clean(context.objectiveId, 180),
            caseId: clean(context.caseId, 180)
        }, "NEXO_PRESENTATION_ARTIFACT"));
    }

    const available = uniqueAvailableCalls(calls, names, state);
    if (available.length === 0) return null;

    return {
        ok: true,
        status: "NEXO_LOCAL_MISSION_READY",
        provider: "nexo-local-compiler",
        model: null,
        planKind: "PRIVATE_NO_CODE_ARTIFACT_MISSION",
        missionComplete: false,
        toolCalls: available,
        deliverables,
        identity: NEXO_IDENTITY.name,
        version: NEXO_MISSION_COMPILER_VERSION
    };
}

export const __test = {
    normalize,
    originalInstruction,
    inferBrand,
    inferBrief,
    detectDeliverables,
    campaignPayload,
    pagePayload,
    reelPayload,
    spreadsheetPayload,
    argumentsForTool
};
