function httpUrl(value) {
    try {
        const url = new URL(String(value || "").trim());
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
            ? url.href : null;
    } catch {
        return null;
    }
}

function instructionUrls(instruction) {
    // Parse URL literals, not natural-language intent. A proposed tool argument
    // or semantic-memory answer is never a source of authority for its own URL.
    return (String(instruction || "").match(/https?:\/\/[^\s<>"'`]+/giu) || [])
        .flatMap(value => [httpUrl(value), httpUrl(value.replace(/[.,;!?)}\]]+$/u, ""))])
        .filter(Boolean);
}

export function validateBrowserUrl(url, context = {}) {
    const target = httpUrl(url);
    const explicit = new Set([
        ...instructionUrls(context.rawInput),
        ...instructionUrls(context.originalInstruction),
        ...instructionUrls(context.rootInstruction)
    ].filter(Boolean));
    const currentPageUrl = httpUrl(context.currentPage?.url);
    const currentPageOrigin = httpUrl(context.currentPage?.origin);
    const grounded = new Set([
        ...explicit,
        currentPageUrl,
        currentPageOrigin
    ].filter(Boolean));

    // Successful observed URLs support browser follow-ups. Do not include task
    // args, failed results, summaries, or arbitrary model-authored strings.
    const collectObservedUrls = (value, depth = 0) => {
        if (!value || typeof value !== "object" || depth > 8 ||
            value.ok === false || value.executionOk === false) return;
        for (const [key, child] of Object.entries(value)) {
            if (["args", "instruction", "prompt", "summary"].includes(key)) continue;
            if (["url", "sourceUrl", "finalUrl", "pageUrl", "href"].includes(key)) {
                const observed = httpUrl(child);
                if (observed) grounded.add(observed);
            } else if (child && typeof child === "object") collectObservedUrls(child, depth + 1);
        }
    };
    for (const task of Array.isArray(context.completedTasks) ? context.completedTasks : []) {
        if (task?.observation?.ok === true) collectObservedUrls(task.observation);
    }

    if (target && explicit.has(target)) return { ok: true, url: target };
    if (
        target &&
        currentPageUrl &&
        (target === currentPageUrl || target === currentPageOrigin)
    ) {
        return { ok: true, url: currentPageUrl };
    }
    if (target && grounded.has(target)) return { ok: true, url: target };
    return {
        ok: false,
        executionOk: false,
        objectiveSatisfied: false,
        blocked: true,
        retryable: false,
        status: "BROWSER_URL_GROUNDING_REQUIRED",
        error: "BROWSER_URL_GROUNDING_REQUIRED",
        message: "Falta una URL fundamentada en la instruccion o en contexto real del runtime. Comparte la URL de la interfaz para poder inspeccionarla; no se ha realizado el analisis visual."
    };
}


// Read the already visible, authenticated page. Never copy form values, cookies,
// storage or an authenticated browser profile into a second browser session.
export function inspectCurrentBrowserPage(url, runtime = globalThis) {
    const document = runtime?.document;
    const actualUrl = httpUrl(runtime?.location?.href);
    if (!document?.body || typeof runtime?.getComputedStyle !== "function" ||
        !actualUrl || httpUrl(url) !== actualUrl) return null;
    try {
        const width = Number(runtime.innerWidth || document.documentElement.clientWidth);
        const height = Number(runtime.innerHeight || document.documentElement.clientHeight);
        if (!(width > 0 && height > 0)) return null;
        const elements = [];
        const candidates = Array.from(document.querySelectorAll(
            "h1,h2,h3,h4,button,a,input,select,textarea,label,p"
        )).slice(0, 400);
        for (const element of candidates) {
            if (elements.length >= 18) break;
            if (element.closest('[hidden],[aria-hidden="true"],[contenteditable="true"]') ||
                element.type === "password" || element.type === "hidden") continue;
            const style = runtime.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            if (style.display === "none" || style.visibility === "hidden" ||
                Number(style.opacity) === 0 || rect.width <= 0 || rect.height <= 0 ||
                rect.bottom <= 0 || rect.right <= 0 || rect.top >= height || rect.left >= width) continue;
            const formControl = ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);
            const label = formControl
                ? element.getAttribute("aria-label") || element.getAttribute("placeholder") || ""
                : element.innerText || element.textContent || "";
            elements.push({
                tag: String(element.tagName).toLowerCase(),
                text: String(label).replace(/\s+/g, " ").trim().slice(0, 100),
                fontFamily: style.fontFamily, fontSize: style.fontSize,
                fontWeight: style.fontWeight, lineHeight: style.lineHeight,
                color: style.color, backgroundColor: style.backgroundColor,
                padding: style.padding, gap: style.gap, borderRadius: style.borderRadius,
                rect: [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value * 10) / 10)
            });
        }
        if (!elements.length) return null;
        const bodyStyle = runtime.getComputedStyle(document.body);
        const interfaceEvidence = compactBrowserInterfaceEvidence({
            source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE", url: actualUrl,
            title: document.title, observedAt: new Date().toISOString(),
            viewport: { width, height },
            pageStyles: { backgroundColor: bodyStyle.backgroundColor, color: bodyStyle.color,
                fontFamily: bodyStyle.fontFamily, fontSize: bodyStyle.fontSize },
            horizontalOverflow: document.documentElement.scrollWidth > width,
            coverage: "CURRENT_VIEWPORT_ONLY", screenshotInspected: false,
            otherPagesInspected: false, elements
        });
        return {
            ok: true, status: "BROWSER_INSPECT_OK", action: "inspect", url: actualUrl,
            engine: "current_browser_dom", evidenceKinds: ["interface_structure", "interface_styles"],
            summary: "DOM, tipografia, colores y medidas calculados en la pagina visible. No se inspeccionaron pixeles ni otras pantallas.",
            interfaceEvidence
        };
    } catch {
        // An unavailable live DOM cannot be represented as successful evidence.
        return null;
    }
}

export function compactBrowserInterfaceEvidence(value) {
    if (value?.source !== "CURRENT_RENDERED_DOM_COMPUTED_STYLE" ||
        !httpUrl(value.url) || !Array.isArray(value.elements) || !value.elements.length) return null;
    const fields = ["tag", "text", "fontFamily", "fontSize", "fontWeight", "lineHeight",
        "color", "backgroundColor", "padding", "gap", "borderRadius"];
    return {
        source: value.source, url: httpUrl(value.url),
        title: String(value.title || "").slice(0, 160),
        observedAt: String(value.observedAt || "").slice(0, 40),
        viewport: { width: Number(value.viewport?.width) || 0, height: Number(value.viewport?.height) || 0 },
        pageStyles: Object.fromEntries(["backgroundColor", "color", "fontFamily", "fontSize"]
            .map(key => [key, String(value.pageStyles?.[key] || "").slice(0, 100)])),
        horizontalOverflow: value.horizontalOverflow === true,
        coverage: "CURRENT_VIEWPORT_ONLY", screenshotInspected: false, otherPagesInspected: false,
        elements: value.elements.slice(0, 18).map(element => ({
            ...Object.fromEntries(fields.map(key => [key, String(element?.[key] || "").slice(0, 100)])),
            rect: (Array.isArray(element?.rect) ? element.rect : []).slice(0, 4).map(value => Number(value) || 0)
        }))
    };
}
