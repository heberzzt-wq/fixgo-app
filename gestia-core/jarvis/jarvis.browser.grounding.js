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
    if (value?.source === "RENDERED_DOM_LAYOUT_REPLAY") return compactReplayEvidence(value);
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
            // Missing geometry stays missing; null/string coercion is not a measurement.
            rect: Array.isArray(element?.rect) && element.rect.length === 4 &&
                element.rect.every(Number.isFinite) && element.rect[2] > 0 && element.rect[3] > 0
                ? [...element.rect] : []
        }))
    };
}

const REPLAY_LIMITATIONS = [
    "Se midió una reproducción del DOM saneado y sus estilos en viewports de navegador; no hardware físico.",
    "No se inspeccionaron píxeles ni se ejecutaron interacciones, teclado virtual, Safari o zoom real.",
    "Scripts, marcos embebidos y valores privados de formularios se excluyeron; el contenido dinámico no se volvió a ejecutar.",
    "Estados de carga, error, menús o modales sólo se cubren si estaban presentes en el estado capturado."
];
const validRect = rect => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite) && rect[2] > 0 && rect[3] > 0;
// Zero-sized rectangles are evidence only in explicitly measured hidden state.
// They remain invalid as visible layout measurements.
const validHiddenRect = rect => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite) && rect[2] >= 0 && rect[3] >= 0;
const validViewport = value => Number.isInteger(value?.width) && Number.isInteger(value?.height) &&
    value.width >= 240 && value.width <= 3840 && value.height >= 240 && value.height <= 2160;
const boundedText = (value, limit = 240) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const replayFailure = (status, message) => ({ ok: false, executionOk: false, objectiveSatisfied: false,
    blocked: true, retryable: false, status, error: status, message });

export function validateBrowserViewportRequest(options = {}) {
    if (!Array.isArray(options.viewports) || options.viewports.length < 1 || options.viewports.length > 10 ||
        !options.viewports.every(validViewport) || (options.phase !== undefined && !["before", "after"].includes(options.phase))) {
        return replayFailure("BROWSER_VIEWPORT_CONTRACT_INVALID", "Solicita entre uno y diez viewports enteros de 240–3840 por 240–2160 px y phase before o after.");
    }
    return { ok: true, viewports: options.viewports.map(({ width, height }) => ({ width, height })), phase: options.phase || "before" };
}

// Deterministic constraints on observed geometry, never an intent classifier or
// a claim that Qwen has seen pixels. Scrolling alone is not a defect.
export function analyzeBrowserLayout({ viewport, elements = [] } = {}) {
    if (!validViewport(viewport)) return [];
    const findings = [];
    const add = (element, kind, classification, severity, summary, impact, evidence, suggestedCorrection, verification) => {
        if (findings.length >= 60) return;
        findings.push({ id: `${kind}:${element.selector}`, selector: element.selector, kind, classification,
            severity, certainty: "high", summary, impact, evidence, suggestedCorrection, verification });
    };
    for (const element of elements) {
        if (!validRect(element?.rect) || !element.selector) continue;
        const [x, y, width, height] = element.rect;
        if (element.hiddenAttribute === true && element.display && element.display !== "none" &&
            element.visibility === "visible" && Number.isFinite(element.opacity) && element.opacity > 0) {
            add(element, "hidden_element_rendered", "defect", "medium",
                `${element.selector} está marcado hidden pero ocupa ${width} × ${height} px con display ${element.display}.`,
                "Un componente que debería estar oculto sigue ocupando espacio y puede desplazar controles o contenido.",
                { hiddenAttribute: true, display: element.display, visibility: element.visibility, opacity: element.opacity, rect: [...element.rect] },
                "Corregir la precedencia CSS de [hidden] en el componente afectado, conservando su distribución cuando esté abierto.",
                "Con hidden el componente debe carecer de caja; al retirar hidden debe volver a su distribución prevista.");
        }
        const reachableByScroll = new Set();
        for (const clipping of Array.isArray(element.clipping) ? element.clipping : []) {
            if (["scroll", "auto"].includes(clipping.overflow)) { reachableByScroll.add(clipping.axis); continue; }
            if (reachableByScroll.has(clipping.axis)) continue;
            if (!["hidden", "clip"].includes(clipping.overflow) || !validRect(clipping.rect)) continue;
            const [cx, cy, cw, ch] = clipping.rect;
            const excess = clipping.axis === "x" ? Math.max(cx - x, x + width - cx - cw) : Math.max(cy - y, y + height - cy - ch);
            const intersects = x < cx + cw && x + width > cx && y < cy + ch && y + height > cy;
            if (excess > 2 && intersects && (element.interactive === true || element.hasText === true)) {
                add(element, "inaccessible_clipping", "defect", element.interactive ? "high" : "medium",
                    `El límite de ${clipping.selector} recorta ${Math.round(excess)} px de ${element.selector}.`,
                    "Parte del contenido o control queda fuera del área visible de un contenedor sin desplazamiento manual; el acceso por interacción sigue sin verificar.",
                    { rect: [...element.rect], clipping: { ...clipping, rect: [...clipping.rect] }, excessPixels: Math.round(excess * 10) / 10 },
                    "Revisar el ancho mínimo, flex/grid y tamaño del contenedor sin ocultar contenido accesible.",
                    "Repetir el mismo estado y viewport: el elemento debe quedar dentro del límite o tener desplazamiento accesible.");
                break;
            }
        }
        if (element.interactive === true && (width < 44 || height < 44)) {
            add(element, "small_touch_target", "recommendation", "low",
                `${element.selector} mide ${width} × ${height} px.`,
                "Un área táctil mayor puede facilitar la activación; esta medida no demuestra por sí sola una infracción de accesibilidad.",
                { rect: [...element.rect], recommendedTarget: 44 },
                "Evaluar un área de activación de aproximadamente 44 × 44 px preservando separación y diseño.",
                "Medir nuevamente el área y comprobar activación táctil y foco con una prueba de interacción independiente.");
        }
        const fontSize = Number.parseFloat(element.fontSize);
        if (element.hasText === true && Number.isFinite(fontSize) && fontSize > 0 && fontSize < 12) {
            add(element, "small_text", "recommendation", "low", `${element.selector} utiliza texto de ${fontSize} px.`,
                "Puede dificultar la lectura; depende del papel del texto y no constituye por sí solo un defecto objetivo.",
                { fontSize: element.fontSize, rect: [...element.rect] }, "Evaluar tamaño e interlineado conservando jerarquía tipográfica.",
                "Volver a medir y comprobar crecimiento de texto sin recorte.");
        }
        if (element.hasText === true && Number.isFinite(element.contrastRatio) && element.contrastRatio > 0) {
            const minimum = fontSize >= 24 || (fontSize >= 18.66 && Number(element.fontWeight) >= 700) ? 3 : 4.5;
            if (element.contrastRatio < minimum) add(element, "low_text_contrast", "defect", "medium",
                `${element.selector} tiene contraste calculado ${element.contrastRatio}:1, inferior a ${minimum}:1.`,
                "El texto puede resultar difícil de distinguir sobre el fondo CSS opaco comprobado.",
                { color: element.color, effectiveBackgroundColor: element.effectiveBackgroundColor, ratio: element.contrastRatio, minimum },
                "Ajustar color de texto o fondo manteniendo la identidad visual.", "Recalcular contraste sobre el mismo fondo efectivo después del cambio.");
        }
    }
    return findings;
}

function compactReplayEvidence(value) {
    if (!httpUrl(value.url) || !Array.isArray(value.viewports) || value.viewports.length < 1 || value.viewports.length > 10) return null;
    const fields = ["tag", "selector", "text", "display", "visibility", "fontFamily", "fontSize", "fontWeight", "lineHeight", "color",
        "backgroundColor", "effectiveBackgroundColor", "padding", "gap", "borderRadius"];
    const viewports = value.viewports.map(sample => {
        if (!validViewport(sample?.viewport) || !Array.isArray(sample.elements)) return null;
        const elements = sample.elements.slice(0, 160).map(element => ({
            ...Object.fromEntries(fields.map(key => [key, boundedText(element?.[key], key === "selector" ? 500 : 100)])),
            rect: validRect(element?.rect) ? [...element.rect] : [],
            interactive: element?.interactive === true, hasText: element?.hasText === true,
            hiddenAttribute: element?.hiddenAttribute === true,
            ...(Number.isFinite(element?.opacity) ? { opacity: element.opacity } : {}),
            ...(Number.isFinite(element?.contrastRatio) && element.contrastRatio > 0 ? { contrastRatio: element.contrastRatio } : {})
        }));
        const selectors = new Set(elements.filter(element => validRect(element.rect)).map(element => element.selector));
        const findings = (Array.isArray(sample.findings) ? sample.findings : []).slice(0, 60).filter(item =>
            selectors.has(item?.selector) && ["defect", "recommendation", "unverified"].includes(item.classification))
            .map(item => ({ id: boundedText(item.id, 600), selector: boundedText(item.selector, 500),
                kind: boundedText(item.kind, 80), classification: item.classification,
                severity: ["high", "medium", "low"].includes(item.severity) ? item.severity : "low",
                certainty: ["high", "medium"].includes(item.certainty) ? item.certainty : "medium",
                summary: boundedText(item.summary, 500), impact: boundedText(item.impact, 500),
                evidence: compactLayoutFacts(item.evidence), suggestedCorrection: boundedText(item.suggestedCorrection, 500),
                verification: boundedText(item.verification, 500) }));
        return { viewport: { ...sample.viewport }, orientation: sample.viewport.width > sample.viewport.height ? "landscape" : "portrait",
            ...(["CSS1Compat", "BackCompat"].includes(sample.compatMode) ? { compatMode: sample.compatMode } : {}),
            observedAt: boundedText(sample.observedAt || value.observedAt, 40), stateFingerprint: boundedText(value.stateFingerprint, 64),
            horizontalOverflow: sample.horizontalOverflow === true,
            ...(Number.isFinite(sample.scrollWidth) ? { scrollWidth: sample.scrollWidth } : {}),
            scrollPositions: (Array.isArray(sample.scrollPositions) ? sample.scrollPositions : []).slice(0, 40)
                .filter(item => Number.isFinite(item.scrollTop) && Number.isFinite(item.scrollLeft))
                .map(item => ({ selector: boundedText(item.selector, 500), scrollTop: item.scrollTop, scrollLeft: item.scrollLeft,
                    verticalAnchor: item.verticalAnchor === "bottom" ? "bottom" : "offset" })),
            hiddenStates: (Array.isArray(sample.hiddenStates) ? sample.hiddenStates : []).slice(0, 80)
                .filter(item => item?.hiddenAttribute === true && boundedText(item.selector) && validHiddenRect(item.rect) &&
                    typeof item.rendered === "boolean" && typeof item.display === "string" && item.display)
                .map(item => ({ selector: boundedText(item.selector, 500), hiddenAttribute: true,
                    display: boundedText(item.display, 40), visibility: boundedText(item.visibility, 40),
                    ...(Number.isFinite(item.opacity) ? { opacity: item.opacity } : {}), rect: [...item.rect], rendered: item.rendered })),
            elements, findings };
    });
    if (viewports.some(sample => !sample)) return null;
    return { source: value.source, url: httpUrl(value.url), title: boundedText(value.title, 160),
        ...(["CSS1Compat", "BackCompat"].includes(value.compatMode) ? { compatMode: value.compatMode } : {}),
        phase: value.phase === "after" ? "after" : "before", observedAt: boundedText(value.observedAt, 40),
        stateFingerprint: boundedText(value.stateFingerprint, 64), sourceRevision: boundedText(value.sourceRevision, 64),
        renderMode: value.renderMode === "candidate_styles" ? "candidate_styles" : "current_styles",
        coverage: "REQUESTED_VIEWPORTS_DOM_REPLAY", screenshotInspected: false, otherPagesInspected: false,
        interactionVerified: false, physicalDeviceTested: false, viewports,
        findings: viewports.flatMap(sample => sample.findings.map(finding => ({ ...finding, viewport: sample.viewport }))),
        limitations: [...REPLAY_LIMITATIONS] };
}

function compactLayoutFacts(value, depth = 0) {
    if (depth > 4 || value == null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return boundedText(value, 500);
    if (Array.isArray(value)) return value.slice(0, 12).map(item => compactLayoutFacts(item, depth + 1));
    if (typeof value !== "object") return null;
    return Object.fromEntries(Object.entries(value).slice(0, 16).map(([key, child]) => [key, compactLayoutFacts(child, depth + 1)]));
}

function selectorFor(element, runtime) {
    const escape = value => runtime.CSS?.escape ? runtime.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, char => `\\${char}`);
    if (element.id) return `#${escape(element.id)}`;
    const path = [];
    for (let node = element; node && node.tagName && path.length < 7; node = node.parentElement) {
        if (node.id) { path.unshift(`#${escape(node.id)}`); break; }
        const tag = node.tagName.toLowerCase();
        const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(item => item.tagName === node.tagName) : [node];
        path.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
    }
    return path.join(" > ");
}

function opaqueRgb(value) {
    const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(String(value || ""));
    if (!match || (match[4] !== undefined && Number(match[4]) !== 1)) return null;
    const rgb = match.slice(1, 4).map(Number);
    return rgb.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255) ? rgb : null;
}

function measuredContrast(element, runtime, style) {
    const foreground = opaqueRgb(style.color);
    if (!foreground) return {};
    let background = null;
    for (let node = element; node; node = node.parentElement) {
        const layer = runtime.getComputedStyle(node);
        if ((layer.backgroundImage && layer.backgroundImage !== "none") || Number(layer.opacity) < 1 ||
            (layer.filter && layer.filter !== "none") || (layer.mixBlendMode && layer.mixBlendMode !== "normal")) return {};
        if (!background) {
            background = opaqueRgb(layer.backgroundColor);
            if (!background && layer.backgroundColor && !["transparent", "rgba(0, 0, 0, 0)"].includes(layer.backgroundColor)) return {};
        }
    }
    if (!background) return {};
    const luminance = rgb => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const a = luminance(foreground), b = luminance(background);
    return { effectiveBackgroundColor: `rgb(${background.join(", ")})`, contrastRatio: Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100 };
}

function measureReplay(runtime, observedAt, stateFingerprint) {
    const document = runtime.document;
    const viewport = { width: runtime.innerWidth, height: runtime.innerHeight };
    if (!validViewport(viewport)) throw new Error("BROWSER_EFFECTIVE_VIEWPORT_INVALID");
    const elements = [];
    const hiddenStates = Array.from(document.querySelectorAll("[hidden]")).slice(0, 80).map(element => {
        const style = runtime.getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return { selector: element.getAttribute("data-jarvis-layout-selector") || selectorFor(element, runtime),
            hiddenAttribute: true, display: style.display, visibility: style.visibility, opacity: Number(style.opacity),
            rect: [box.x, box.y, box.width, box.height].map(value => Math.round(value * 10) / 10),
            rendered: box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility === "visible" && Number(style.opacity) > 0 };
    });
    const controls = Array.from(document.querySelectorAll("button,a,input,select,textarea,[role=button]"));
    const visiblePriority = element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < viewport.height && rect.left < viewport.width ? 0 : 1;
    };
    controls.sort((a, b) => visiblePriority(a) - visiblePriority(b));
    const candidates = [...new Set([...controls, ...document.querySelectorAll("[hidden],h1,h2,h3,h4,label,nav,header,main,aside,[role=dialog],form,table"),
        ...document.querySelectorAll("p,span")])];
    for (const element of candidates.slice(0, 800)) {
        if (elements.length >= 160) break;
        if (element.closest('[aria-hidden="true"]') || ["password", "hidden"].includes(element.type)) continue;
        const style = runtime.getComputedStyle(element);
        const box = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0 || box.width <= 0 || box.height <= 0) continue;
        const control = ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
        const selector = element.getAttribute("data-jarvis-layout-selector") || selectorFor(element, runtime);
        const label = control ? element.getAttribute("aria-label") || element.getAttribute("placeholder") || "" : element.innerText || "";
        // A container's inherited color does not measure all its descendants.
        // Icon font glyphs and pseudo-elements are not readable text evidence.
        const directText = Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join(" ");
        const hasText = !control && /[\p{L}\p{N}]/u.test(directText) && !/(font awesome|material (icons|symbols)|icomoon|glyphicon)/i.test(style.fontFamily);
        const clipping = [];
        for (let ancestor = element.parentElement; ancestor && clipping.length < 12; ancestor = ancestor.parentElement) {
            const ancestorStyle = runtime.getComputedStyle(ancestor);
            const r = ancestor.getBoundingClientRect();
            for (const [axis, overflow] of [["x", ancestorStyle.overflowX], ["y", ancestorStyle.overflowY]]) {
                if (!["hidden", "clip", "scroll", "auto"].includes(overflow)) continue;
                clipping.push({ selector: ancestor.getAttribute("data-jarvis-layout-selector") || selectorFor(ancestor, runtime), axis, overflow,
                    rect: [r.x, r.y, r.width, r.height].map(value => Math.round(value * 10) / 10) });
            }
        }
        elements.push({ tag: element.tagName.toLowerCase(), selector, text: boundedText(label, 100),
            hiddenAttribute: element.hasAttribute("hidden"), display: style.display, visibility: style.visibility, opacity: Number(style.opacity),
            fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight,
            color: style.color, backgroundColor: style.backgroundColor, padding: style.padding, gap: style.gap, borderRadius: style.borderRadius,
            rect: [box.x, box.y, box.width, box.height].map(value => Math.round(value * 10) / 10),
            interactive: element.matches("button,a[href],input,select,textarea,[role=button]"),
            hasText, clipping, ...(hasText ? measuredContrast(element, runtime, style) : {}) });
    }
    return { viewport, orientation: viewport.width > viewport.height ? "landscape" : "portrait", compatMode: document.compatMode, observedAt, stateFingerprint,
        horizontalOverflow: document.documentElement.scrollWidth > viewport.width,
        scrollWidth: document.documentElement.scrollWidth, hiddenStates, elements, findings: analyzeBrowserLayout({ viewport, elements }) };
}

async function hashReplayText(value, runtime) {
    if (!runtime.crypto?.subtle) throw new Error("BROWSER_REPLAY_FINGERPRINT_UNAVAILABLE");
    const bytes = await runtime.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}

// Replays the current authorized DOM, not a newly navigated page. The sandbox
// has no scripts/forms/navigation permission and never receives storage,
// cookies, event handlers, embedded frames, or private form values.
export async function inspectResponsiveCurrentBrowserPage(url, options = {}, runtime = globalThis, trustedReplay = {}) {
    const request = validateBrowserViewportRequest(options);
    if (!request.ok) return request;
    const actualUrl = httpUrl(runtime.location?.href);
    const document = runtime.document;
    if (!actualUrl || actualUrl !== httpUrl(url) || !document?.body || !document?.createElement ||
        typeof runtime.getComputedStyle !== "function") {
        return replayFailure("BROWSER_CURRENT_PAGE_REPLAY_REQUIRED", "La matriz requiere el DOM actual autorizado de la URL exacta. No se abrió otro navegador ni se sustituyó la pantalla.");
    }
    if (/\/gestia-terminal\.html$/i.test(new URL(actualUrl).pathname) && !(runtime.auth?.currentUser || runtime.window?.auth?.currentUser)) {
        return replayFailure("BROWSER_AUTHENTICATED_PAGE_REQUIRED", "La Terminal requiere su sesión autenticada actual; no se certificó una pantalla de acceso.");
    }
    let frame;
    try {
        const replaySession = trustedReplay.replaySession && typeof trustedReplay.replaySession === "object" ? trustedReplay.replaySession : {};
        if (replaySession.snapshot && replaySession.snapshot.url !== actualUrl) throw new Error("BROWSER_REPLAY_SESSION_URL_MISMATCH");
        if (!replaySession.snapshot) {
        const clone = document.documentElement.cloneNode(true);
        const originals = [document.documentElement, ...document.documentElement.querySelectorAll("*")];
        const copies = [clone, ...clone.querySelectorAll("*")];
        const scrollState = [];
        for (let index = 0; index < copies.length; index++) {
            const copy = copies[index], original = originals[index];
            if (!original) continue;
            copy.setAttribute("data-jarvis-layout-selector", selectorFor(original, runtime));
            if (original.scrollTop || original.scrollLeft || original.scrollHeight > original.clientHeight || original.scrollWidth > original.clientWidth) {
                scrollState.push({ selector: copy.getAttribute("data-jarvis-layout-selector"), scrollTop: original.scrollTop,
                    scrollLeft: original.scrollLeft, verticalAnchor: original.scrollHeight > original.clientHeight &&
                        Math.abs(original.scrollHeight - original.clientHeight - original.scrollTop) <= 2 ? "bottom" : "offset" });
            }
            if (copy.matches("script,iframe,frame,object,embed,base,meta,link:not([rel=stylesheet]),audio,video,source,track")) { copy.remove(); continue; }
            for (const attribute of Array.from(copy.attributes)) {
                const key = attribute.name.toLowerCase();
                if (key.startsWith("on") || key.startsWith("data-") && !["data-jarvis-layout-selector", "data-state", "data-theme", "data-mode"].includes(key) ||
                    ["value", "srcdoc", "nonce", "integrity", "action", "formaction", "autofocus", "srcset"].includes(key)) copy.removeAttribute(attribute.name);
            }
            if (copy.matches("input,textarea,select,option,[contenteditable]")) {
                if ("value" in copy) copy.value = "";
                if (copy.matches("textarea,option,[contenteditable]")) copy.textContent = "";
                copy.removeAttribute("value");
                copy.removeAttribute("contenteditable");
            }
            if (copy.hasAttribute("href")) {
                const href = copy.getAttribute("href");
                if (copy.matches("link[rel=stylesheet]")) {
                    const resolved = new URL(href, actualUrl);
                    if (["http:", "https:"].includes(resolved.protocol) && !resolved.username && !resolved.password) copy.href = resolved.href;
                    else copy.remove();
                } else if (copy.matches("a")) copy.setAttribute("href", "#");
                else copy.removeAttribute("href");
            }
            if (copy.hasAttribute("src")) {
                const src = new URL(copy.getAttribute("src"), actualUrl);
                if (src.origin === new URL(actualUrl).origin && !src.username && !src.password) copy.setAttribute("src", src.href);
                else copy.removeAttribute("src");
            }
        }
        const stateFingerprint = await hashReplayText([clone, clone.querySelector("body"), ...clone.querySelectorAll("body *")].filter(Boolean).map(element =>
            [element.tagName, element.id, element.className, element.getAttribute("hidden"), element.getAttribute("aria-expanded"), element.getAttribute("open"),
                element.matches("style,script") ? "" : Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join("")].join("|")).join("\n") + JSON.stringify(scrollState), runtime);
        replaySession.snapshot = { url: actualUrl, clone, stateFingerprint, title: document.title, scrollState, compatMode: document.compatMode };
        }
        const snapshot = replaySession.snapshot;
        const clone = snapshot.clone.cloneNode(true);
        const stateFingerprint = snapshot.stateFingerprint;
        const hasOverride = trustedReplay.styleOverride !== undefined;
        if (hasOverride && typeof trustedReplay.styleOverride !== "string") throw new Error("BROWSER_REPLAY_STYLE_OVERRIDE_INVALID");
        const override = hasOverride ? trustedReplay.styleOverride : "";
        if (override.length > 500000) throw new Error("BROWSER_REPLAY_STYLE_OVERRIDE_TOO_LARGE");
        const head = clone.querySelector("head");
        const primaryStyle = head.querySelector("style");
        if (hasOverride && !primaryStyle) throw new Error("BROWSER_REPLAY_PRIMARY_STYLE_REQUIRED");
        if (hasOverride) primaryStyle.textContent = override;
        const sourceRevision = await hashReplayText(primaryStyle?.textContent || "", runtime);
        const stylesheetOrigins = [...new Set(Array.from(clone.querySelectorAll('link[rel="stylesheet"]')).map(link => new URL(link.href).origin))];
        const csp = document.createElement("meta");
        csp.httpEquiv = "Content-Security-Policy";
        csp.content = `default-src 'none'; style-src 'unsafe-inline' 'self' ${stylesheetOrigins.join(" ")}; img-src 'self' data: blob:; font-src 'self' data: ${stylesheetOrigins.join(" ")}; form-action 'none'; base-uri 'self'`;
        head.prepend(csp);
        const base = document.createElement("base");
        base.href = actualUrl;
        head.append(base);
        const style = document.createElement("style");
        style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
        head.append(style);
        frame = document.createElement("iframe");
        frame.setAttribute("sandbox", "allow-same-origin");
        frame.setAttribute("aria-hidden", "true");
        frame.tabIndex = -1;
        frame.style.cssText = "display:block!important;position:fixed!important;left:-10000px!important;top:0!important;border:0!important;max-width:none!important;max-height:none!important;min-width:0!important;min-height:0!important;pointer-events:none!important;";
        frame.style.setProperty("width", `${request.viewports[0].width}px`, "important");
        frame.style.setProperty("height", `${request.viewports[0].height}px`, "important");
        if (!["CSS1Compat", "BackCompat"].includes(snapshot.compatMode)) throw new Error("BROWSER_REPLAY_COMPAT_MODE_UNAVAILABLE");
        // compatMode is selected by the parser, not by replacing documentElement.
        // An about:blank iframe would otherwise measure standards pages in quirks.
        frame.srcdoc = `${snapshot.compatMode === "CSS1Compat" ? "<!DOCTYPE html>" : ""}<html><head></head><body></body></html>`;
        const frameReady = new Promise((resolve, reject) => {
            const finish = error => { clearTimeout(timer); frame.onload = null; frame.onerror = null; error ? reject(error) : resolve(); };
            const timer = setTimeout(() => finish(new Error("BROWSER_REPLAY_DOCUMENT_TIMEOUT")), 8000);
            frame.onload = () => { if (frame.contentDocument?.URL === "about:srcdoc") finish(); };
            frame.onerror = () => finish(new Error("BROWSER_REPLAY_DOCUMENT_LOAD_FAILED"));
        });
        document.documentElement.append(frame);
        await frameReady;
        const replayDocument = frame.contentDocument;
        if (!replayDocument?.documentElement) throw new Error("BROWSER_REPLAY_DOCUMENT_UNAVAILABLE");
        if (replayDocument.compatMode !== snapshot.compatMode) throw new Error("BROWSER_REPLAY_COMPAT_MODE_MISMATCH");
        const imported = replayDocument.importNode(clone, true);
        const stylesLoaded = Array.from(imported.querySelectorAll('link[rel="stylesheet"]')).map(link => new Promise((resolve, reject) => {
            const finish = error => { clearTimeout(timer); link.onload = null; link.onerror = null; error ? reject(error) : resolve(); };
            const timer = setTimeout(() => finish(new Error("BROWSER_REPLAY_STYLESHEET_TIMEOUT")), 8000);
            link.onload = () => finish();
            link.onerror = () => finish(new Error("BROWSER_REPLAY_STYLESHEET_LOAD_FAILED"));
        }));
        replayDocument.replaceChild(imported, replayDocument.documentElement);
        await Promise.all(stylesLoaded);
        void replayDocument.documentElement.offsetWidth;
        if (replayDocument.fonts?.ready) await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("BROWSER_REPLAY_FONTS_TIMEOUT")), 8000);
            replayDocument.fonts.ready.then(() => { clearTimeout(timer); resolve(); }, error => { clearTimeout(timer); reject(error); });
        });
        if (replayDocument.fonts && Array.from(replayDocument.fonts).some(font => font.status === "error")) throw new Error("BROWSER_REPLAY_FONT_LOAD_FAILED");
        const viewports = [];
        for (const viewport of request.viewports) {
            frame.style.setProperty("width", `${viewport.width}px`, "important");
            frame.style.setProperty("height", `${viewport.height}px`, "important");
            // Force layout synchronously; scripts, timers and device emulation
            // are deliberately absent from this DOM-only reproduction.
            void replayDocument.documentElement.offsetWidth;
            const replayElements = new Map([replayDocument.documentElement, ...replayDocument.documentElement.querySelectorAll("*")]
                .map(element => [element.getAttribute("data-jarvis-layout-selector"), element]));
            const scrollPositions = [];
            for (const entry of snapshot.scrollState) {
                const element = replayElements.get(entry.selector);
                if (!element) continue;
                element.scrollLeft = entry.scrollLeft;
                element.scrollTop = entry.verticalAnchor === "bottom" ? Math.max(0, element.scrollHeight - element.clientHeight) : entry.scrollTop;
                scrollPositions.push({ selector: entry.selector, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft,
                    verticalAnchor: entry.verticalAnchor });
            }
            const sample = measureReplay(frame.contentWindow, new Date().toISOString(), stateFingerprint);
            sample.scrollPositions = scrollPositions;
            if (sample.viewport.width !== viewport.width || sample.viewport.height !== viewport.height) throw new Error("BROWSER_EFFECTIVE_VIEWPORT_MISMATCH");
            if (!sample.elements.length) throw new Error("BROWSER_REPLAY_NO_MEASURED_ELEMENTS");
            viewports.push(sample);
        }
        const interfaceEvidence = compactBrowserInterfaceEvidence({ source: "RENDERED_DOM_LAYOUT_REPLAY", url: actualUrl,
            title: snapshot.title, observedAt: new Date().toISOString(), phase: request.phase, stateFingerprint, sourceRevision, compatMode: snapshot.compatMode,
            renderMode: hasOverride ? "candidate_styles" : "current_styles", viewports });
        return { ok: true, executionOk: true, status: "BROWSER_INSPECT_OK", action: "inspect", url: actualUrl,
            engine: "current_browser_dom_layout_replay", evidenceKinds: ["interface_structure", "interface_styles", "responsive_layout"],
            summary: `Se midió el mismo DOM saneado en ${viewports.length} viewports. No se inspeccionaron píxeles ni interacciones.`, interfaceEvidence };
    } catch (error) {
        return replayFailure("BROWSER_LAYOUT_REPLAY_UNAVAILABLE", `La reproducción no pudo verificarse: ${boundedText(error?.message)}. No se certificó otra página.`);
    } finally {
        frame?.remove();
    }
}
