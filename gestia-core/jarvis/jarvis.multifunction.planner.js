const VERSION = "1.1.0-sia7-multifunction-planner";

function normalize(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/^\s*(jarvis|heberto|gestia)[,\s:;-]*/i, "")
        .toLowerCase()
        .replace(/\banalisa\b/g, "analiza")
        .replace(/\banalisar\b/g, "analizar")
        .replace(/\breviza\b/g, "revisa")
        .replace(/\brevizar\b/g, "revisar")
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

    const hasExplicitOperationalRequest =
        /\b(crea|crear|haz|hacer|prepara|preparar|disena|disenar|arma|construye|construir|desarrolla|desarrollar|genera|generar|analiza|analizar|analice|revisa|revisar|revise|extrae|extraer|resume|resumir|planifica|planificar|redacta|redactar|propone|proponer)\b/i.test(normalized);

    const isExplanatoryQuestion =
        /\b(que es|como funciona|explica(?:me)?|define|que significa|para que sirve)\b/i.test(normalized) &&
        !hasExplicitOperationalRequest;

    if (
        /\b(hola|buenos dias|buen dia|buenas tardes|buenas noches|que tal|como estas|tecate|cerveza|cheve|chelita)\b/i.test(normalized)
    ) {
        calls.push(
            makeCall(
                "conversation.respond",
                {
                    prompt: raw
                },
                "LOCAL_MULTIFUNCTION_CONVERSATION"
            )
        );
    }

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
        !isExplanatoryQuestion &&
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
        /\b(analiza|analizar|analice|revisa|revisar|revise|extrae|extraer|resume|resumir)\b[\s\S]{0,80}\b(pdf|imagen|foto|documento)\b/i.test(normalized)
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
        !isExplanatoryQuestion &&
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
            "conversation",
            "system",
            "business",
            "marketing",
            "page",
            "media"
        ]
    };
}
