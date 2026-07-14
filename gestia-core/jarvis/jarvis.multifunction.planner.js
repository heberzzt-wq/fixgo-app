const VERSION = "2.0.0-sia7-parallel-delegation-routing";

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

export function mergeJarvisToolCalls(
    ...groups
) {
    const merged = [];
    const seen = new Set();

    for (const call of groups.flat()) {
        if (!call?.name) continue;

        const key =
            `${call.name}:${JSON.stringify(call.args || {})}`;

        if (seen.has(key)) continue;

        seen.add(key);
        merged.push(call);
    }

    return merged.slice(0, 8);
}

export function isJarvisTechnicalDiagnosticRequest(input = "") {
    const normalized = normalize(input);

    if (!normalized) return false;

    const hasExplicitWebSurface =
        /\b(internet|en la web|google|noticias|fuentes web|informacion actualizada|datos actuales)\b/i.test(normalized);
    const hasExplicitRepoScope =
        /\b(repo|repositorio|codigo local|archivo local|este proyecto|esta aplicacion)\b/i.test(normalized) ||
        /[a-z0-9_-]+\.(?:js|mjs|cjs|html|css|json)\b/i.test(normalized);

    if (
        hasExplicitWebSurface &&
        !hasExplicitRepoScope
    ) {
        return false;
    }

    const hasDiagnosticVerb =
        /\b(analiza|analizar|revisa|revisar|audita|auditar|investiga|investigar|diagnostica|diagnosticar|busca|buscar|verifica|verificar|checa|checar)\b/i.test(normalized);

    if (!hasDiagnosticVerb) return false;

    const hasTechnicalEvidence =
        /\b(repo|repositorio|codigo|archivo|configuracion|runtime|router|ruta|redireccion|redirige|sesion|login|auth|firebase|firestore|terminal|ceo|admin|html|javascript|css|bug|error|falla|fallar|segundos)\b/i.test(normalized) ||
        /[a-z0-9_-]+\.(?:js|mjs|cjs|html|css|json)\b/i.test(normalized);

    return hasTechnicalEvidence;
}

export function isJarvisCapabilityForensicsRequest(input = "") {
    const normalized = normalize(input);

    if (!normalized) return false;

    return (
        /\b(analisis forense|auditoria forense|capacidades reales|limitaciones|paridad|nivel codex|a tu altura|que te falta|actuadores)\b/i.test(normalized) ||
        (
            /\b(puedes|sabes|tienes|cuentas con|eres capaz de)\b/i.test(normalized) &&
            /\b(chrome|navegador|internet|web|fuentes|imagen|imagenes|correo|email|calendario|subagentes|agentes|automatizacion|conectores)\b/i.test(normalized)
        )
    );
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
    const explicitApproval =
        /\b(apruebo|aprobado|autorizo|autorizado|dale|arre)\b/i.test(normalized);
    const urlMatch = raw.match(/https?:\/\/[^\s<>'"]+/i);

    const isTechnicalDiagnostic =
        isJarvisTechnicalDiagnosticRequest(normalized);

    const hasExplicitOperationalRequest =
        /\b(crea|crear|haz|hacer|prepara|preparar|disena|disenar|arma|construye|construir|desarrolla|desarrollar|genera|generar|analiza|analizar|analice|revisa|revisar|revise|extrae|extraer|resume|resumir|planifica|planificar|redacta|redactar|propone|proponer)\b/i.test(normalized);

    const isExplanatoryQuestion =
        /\b(que es|como funciona|explica(?:me)?|define|que significa|para que sirve)\b/i.test(normalized) &&
        !hasExplicitOperationalRequest;

    const isCapabilityForensicsRequest =
        isJarvisCapabilityForensicsRequest(normalized);

    const isWebResearchRequest =
        !isCapabilityForensicsRequest &&
        (
            /\b(busca|buscar|investiga|investigar|consulta|consultar|averigua|averiguar|verifica|verificar)\b[\s\S]{0,100}\b(internet|web|google|noticias|fuentes|informacion actual|datos actuales)\b/i.test(normalized) ||
            /\b(internet|web|google|noticias|fuentes)\b[\s\S]{0,100}\b(busca|buscar|investiga|investigar|consulta|consultar|averigua|averiguar|verifica|verificar)\b/i.test(normalized) ||
            /\b(ultimas noticias|informacion actualizada|datos actuales)\b/i.test(normalized)
        );

    const isDelegationRequest =
        /\b(en paralelo|delega|delegar|divide las tareas|varias tareas a la vez)\b/i.test(normalized);

    if (isDelegationRequest) {
        const tasks = [];

        if (/\b(salud|sistema|runtime)\b/i.test(normalized)) {
            tasks.push({ tool: "system.health", args: {} });
        }
        if (/\b(conectores|integraciones)\b/i.test(normalized)) {
            tasks.push({ tool: "connector.list", args: {} });
        }
        if (/\b(capacidades|herramientas)\b/i.test(normalized)) {
            tasks.push({ tool: "system.capabilities", args: {} });
        }
        if (/\b(supervision|supervisor)\b/i.test(normalized)) {
            tasks.push({ tool: "system.supervision", args: {} });
        }
        if (isWebResearchRequest) {
            tasks.push({ tool: "web.research", args: { query: raw } });
        }
        if (/\b(repo|repositorio|git)\b/i.test(normalized)) {
            tasks.push({ tool: "repo.gitStatus", args: {} });
        }

        if (tasks.length >= 2) {
            return [
                makeCall(
                    "agent.delegate",
                    { tasks: tasks.slice(0, 4) },
                    "LOCAL_MULTIFUNCTION_PARALLEL_DELEGATION"
                )
            ];
        }
    }

    if (isCapabilityForensicsRequest) {
        calls.push(
            makeCall(
                "system.forensics",
                {},
                "LOCAL_MULTIFUNCTION_CAPABILITY_FORENSICS"
            )
        );
    }

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
        !isCapabilityForensicsRequest &&
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

    if (isWebResearchRequest) {
        calls.push(
            makeCall(
                "web.research",
                {
                    query: raw
                },
                "LOCAL_MULTIFUNCTION_GROUNDED_WEB_RESEARCH"
            )
        );
    }

    const browserRequest =
        Boolean(urlMatch) &&
        /\b(abre|abrir|navega|navegar|inspecciona|inspeccionar|revisa|revisar|captura|screenshot|pantallazo)\b/i.test(normalized);

    if (browserRequest) {
        const wantsScreenshot =
            /\b(captura|screenshot|pantallazo)\b/i.test(normalized);
        calls.push({
            ...makeCall(
                wantsScreenshot ? "browser.screenshot" : "browser.inspect",
                { url: urlMatch[0] },
                "LOCAL_MULTIFUNCTION_BROWSER"
            ),
            mutates: wantsScreenshot,
            approved: wantsScreenshot && explicitApproval
        });
    }

    if (
        /\b(genera|generar|crea|crear|disena|disenar|edita|editar)\b[\s\S]{0,50}\b(imagen|ilustracion|foto|logo|banner)\b/i.test(normalized) ||
        /\b(imagen|ilustracion|foto|logo|banner)\b[\s\S]{0,50}\b(genera|generar|crea|crear|disena|disenar)\b/i.test(normalized)
    ) {
        calls.push(
            makeCall(
                "image.generate",
                { prompt: raw },
                "LOCAL_MULTIFUNCTION_IMAGE_GENERATION"
            )
        );
    }

    if (
        /\b(crea|crear|genera|generar|redacta|redactar)\b[\s\S]{0,60}\b(documento|archivo markdown|csv|reporte html|presentacion|powerpoint|pptx|excel|xlsx|word|docx|pdf|hoja de calculo)\b/i.test(normalized)
    ) {
        const format = /\b(presentacion|powerpoint|pptx)\b/i.test(normalized)
            ? "pptx"
            : /\b(excel|xlsx|hoja de calculo)\b/i.test(normalized)
                ? "xlsx"
                : /\b(word|docx)\b/i.test(normalized)
                    ? "docx"
                    : /\bpdf\b/i.test(normalized)
                        ? "pdf"
                        : /\bcsv\b/i.test(normalized)
            ? "csv"
            : /\bmarkdown\b/i.test(normalized)
                ? "md"
                : "html";
        calls.push({
            ...makeCall(
                "document.create",
                {
                    format,
                    output: `.jarvis-artifacts/documents/jarvis-${Date.now()}.${format}`,
                    title: "Documento Jarvis",
                    content: raw
                },
                "LOCAL_MULTIFUNCTION_DOCUMENT_CREATE"
            ),
            mutates: true,
            approved: explicitApproval
        });
    }

    if (/\b(lista|muestra|revisa|estado)\b[\s\S]{0,40}\b(conectores|integraciones)\b/i.test(normalized)) {
        calls.push(
            makeCall(
                "connector.list",
                {},
                "LOCAL_MULTIFUNCTION_CONNECTOR_LIST"
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

    if (
        /\b(supervisor diario|supervision diaria|reporte de supervision|estado del supervisor|ultimo reporte de jarvis)\b/i.test(normalized)
    ) {
        const runNow =
            /\b(ejecuta|ejecutar|corre|correr|lanza|lanzar|ahora)\b/i.test(normalized);
        calls.push(
            runNow
                ? {
                    ...makeCall(
                        "system.supervision.runNow",
                        {},
                        "LOCAL_MULTIFUNCTION_RUN_SUPERVISION_NOW"
                    ),
                    mutates: true,
                    approved: explicitApproval
                }
                : makeCall(
                    "system.supervision",
                    {},
                    "LOCAL_MULTIFUNCTION_DAILY_SUPERVISION"
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
        !isTechnicalDiagnostic &&
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
            "media",
            "web",
            "browser",
            "document",
            "image",
            "connector",
            "agent"
        ]
    };
}
