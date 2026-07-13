const VERSION = "1.0.0-sia7-multifunction-planner";

function normalize(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/^\s*(jarvis|heberto|gestia)[,\s:;-]*/i, "")
        .toLowerCase()
        .trim();
}

function makeCall(name, args = {}, reason = "LOCAL_MULTIFUNCTION_PLANNER") {
    return {
        name,
        args,
        reason,
        mutates: false,
        approved: false
    };
}

export function buildJarvisMultifunctionToolCalls(
    input = "",
    context = {}
) {
    const raw =
        String(input || "").trim();

    const normalized =
        normalize(raw);

    if (!normalized) return [];

    const calls = [];

    if (
        /\b(que puedes hacer|capacidades|herramientas disponibles|lista de herramientas|multifuncional)\b/i.test(normalized)
    ) {
        calls.push(
            makeCall(
                "system.capabilities",
                {},
                "LOCAL_MULTIFUNCTION_CAPABILITIES"
            )
        );
    }

    if (
        /\b(salud del sistema|estado del runtime|diagnostico del sistema|revisa el sistema)\b/i.test(normalized)
    ) {
        calls.push(
            makeCall(
                "system.health",
                {},
                "LOCAL_MULTIFUNCTION_HEALTH"
            )
        );
    }

    const pageRequest =
        /\b(crea|crear|disena|disenar|arma|construye|genera)\b[\s\S]{0,80}\b(pagina|landing|sitio|website|web)\b/i.test(normalized) ||
        /\b(pagina|landing|sitio|website)\b[\s\S]{0,80}\b(responsive|oficial|editable)\b/i.test(normalized);

    if (pageRequest) {
        calls.push(
            makeCall(
                "page.plan",
                {
                    prompt: raw,
                    pageName:
                        context.pageName ||
                        "pagina-oficial",
                    brandName:
                        context.brandName ||
                        "GestiaPremium"
                },
                "LOCAL_MULTIFUNCTION_PAGE"
            )
        );
    }

    if (
        /\b(marketing|campana|publicidad|contenido|redes sociales|flyer|reel|tiktok|instagram|facebook|embudo|copies|calendario de contenido)\b/i.test(normalized)
    ) {
        calls.push(
            makeCall(
                "marketing.plan",
                {
                    prompt: raw,
                    brandName:
                        context.brandName ||
                        "FixGo / GestiaPremium",
                    audience:
                        context.audience ||
                        ""
                },
                "LOCAL_MULTIFUNCTION_MARKETING"
            )
        );
    }

    if (
        /\b(analiza|revisa|extrae|resume)\b[\s\S]{0,80}\b(pdf|imagen|foto|documento)\b/i.test(normalized)
    ) {
        calls.push(
            makeCall(
                "media.analyze",
                {
                    prompt: raw,
                    mimeType:
                        context?.media?.mimeType ||
                        context?.mimeType ||
                        ""
                },
                "LOCAL_MULTIFUNCTION_MEDIA"
            )
        );
    }

    if (
        calls.length === 0 &&
        /\b(flotilla|tecnico|cliente|inquilino|empresa|reporte operativo|resumen empresarial)\b/i.test(normalized)
    ) {
        calls.push(
            makeCall(
                "business.assist",
                {
                    prompt: raw
                },
                "LOCAL_MULTIFUNCTION_BUSINESS"
            )
        );
    }

    return calls.slice(0, 3);
}

export function describeJarvisMultifunctionPlanner() {
    return {
        ok: true,
        version: VERSION,
        maximumToolCalls: 3,
        mutates: false,
        domains: [
            "system",
            "business",
            "marketing",
            "page",
            "media"
        ]
    };
}

