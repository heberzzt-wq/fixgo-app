/**
 * ==================================================
 * JARVIS AUTOPATCH ENGINE v2.0
 * Builds safe, explicit patch operations from scanner findings.
 * ==================================================
 */

const VERSION = "2.0.0-safe-operations";

export function buildAutoPatch(scan = {}) {
    const file = scan.file || "";
    const findings =
        Array.isArray(scan.findings)
            ? scan.findings
            : [];

    const patches =
        findings
            .flatMap(finding => patchFromFinding(finding, file))
            .filter(Boolean);

    if (!patches.length) {
        patches.push({
            id: "PATCH_NONE",
            title: "Sin parche automatico seguro",
            risk: "LOW",
            safe: true,
            autoApply: false,
            confidence: 0.9,
            operations: [],
            code: "// Sin cambios automaticos seguros"
        });
    }

    return {
        ok: true,
        engine: "jarvis_autopatch_engine",
        version: VERSION,
        file,
        total: patches.length,
        safePatches:
            patches.filter(patch => patch.safe === true && patch.autoApply === true).length,
        patches
    };
}

function patchFromFinding(finding = {}, file = "") {
    switch (finding.id) {
        case "LOWERCASE_DATE_NOW":
            return [{
                id: "PATCH_LOWERCASE_DATE_NOW",
                title: "Corregir Date.now",
                risk: "LOW",
                safe: true,
                autoApply: true,
                confidence: 0.99,
                sourceFinding: finding.id,
                file,
                evidence: finding.evidence || null,
                operations: [
                    {
                        type: "replace_all",
                        find: "date.now()",
                        replace: "Date.now()"
                    }
                ],
                before: "date.now()",
                after: "Date.now()",
                code: "date.now() -> Date.now()"
            }];

        case "OPEN_SAFE_EDIT_ZONE":
        case "UNBALANCED_SYNTAX_DELIMITERS":
        case "HARDCODED_SECRET_LITERAL":
        case "DYNAMIC_CODE_EXECUTION":
            return [{
                id: `PATCH_BLOCKED_${finding.id}`,
                title: "Parche automatico bloqueado",
                risk:
                    finding.severity === "CRITICAL"
                        ? "CRITICAL"
                        : "HIGH",
                safe: false,
                autoApply: false,
                confidence: finding.confidence || 0.8,
                sourceFinding: finding.id,
                file,
                evidence: finding.evidence || null,
                operations: [],
                code: "Requiere intervencion manual segura."
            }];

        default:
            if (finding.patchable === true && finding.action) {
                return [{
                    id: `PATCH_${String(finding.id || "GENERIC").toUpperCase()}`,
                    title: finding.title || "Parche sugerido",
                    risk: riskFromSeverity(finding.severity),
                    safe: finding.safe !== false,
                    autoApply: finding.safe !== false,
                    confidence: finding.confidence || 0.7,
                    sourceFinding: finding.id || null,
                    file,
                    evidence: finding.evidence || null,
                    operations: [finding.action],
                    code: `${finding.action.find || ""} -> ${finding.action.replace || ""}`.trim()
                }];
            }

            return [];
    }
}

function riskFromSeverity(severity = "LOW") {
    if (severity === "CRITICAL") return "CRITICAL";
    if (severity === "HIGH") return "HIGH";
    if (severity === "MEDIUM") return "MEDIUM";
    return "LOW";
}

// These are bounded mechanical translations of measured findings. They do not
// classify user intent, choose repairs, grant authorization, or write files.
const responsiveOptionSources = new WeakMap();
const responsiveFailure = status => ({ ok: false, status, options: [], autoApply: false });
const measuredRectangle = rect => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite) && rect[2] > 0 && rect[3] > 0;
const safeResponsiveSelector = selector => typeof selector === "string" && selector.length <= 500 &&
    /^(?:[a-z][a-z0-9-]*|[.#][a-zA-Z_][\w-]*)(?::nth-of-type\([1-9]\d{0,3}\))?(?:\s*>\s*(?:[a-z][a-z0-9-]*|[.#][a-zA-Z_][\w-]*)(?::nth-of-type\([1-9]\d{0,3}\))?)*$/.test(selector);

function responsiveStyleSource(source, file) {
    if (file !== "gestia-terminal.html" || typeof source !== "string" || !source) return null;
    const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(source);
    if (!head) return null;
    const style = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/i.exec(head[1]);
    if (!style || /<script\b|<!--/i.test(head[1].slice(0, style.index))) return null;
    if (!style[1] || source.split(style[1]).length !== 2) return null;
    return { block: style[1], newline: style[1].includes("\r\n") ? "\r\n" : "\n" };
}

function measuredRgb(value) {
    const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(String(value || ""));
    if (!match || (match[4] !== undefined && Number(match[4]) !== 1)) return null;
    const rgb = match.slice(1, 4).map(Number);
    return rgb.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255) ? rgb : null;
}

function contrastBetween(a, b) {
    const luminance = rgb => rgb.map(channel => channel / 255)
        .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function requiredTextContrast(element) {
    const size = Number.parseFloat(element.fontSize);
    return size >= 24 || (size >= 18.66 && Number(element.fontWeight) >= 700) ? 3 : 4.5;
}

function headerContainsSelector(source, selector) {
    const header = /<body\b[^>]*>\s*<header\b[^>]*>([\s\S]*?)<\/header\s*>/i.exec(source);
    if (!header) return false;
    if (/^(?:html:nth-of-type\(1\)\s*>\s*)?body(?::nth-of-type\(1\))?\s*>\s*header(?::nth-of-type\(1\))?\s*>/.test(selector)) return true;
    if (/^#[\w-]+$/.test(selector)) return new RegExp(`\\bid\\s*=\\s*["']${selector.slice(1)}["']`).test(header[1]);
    return false;
}

export function buildResponsiveRepairOptions({ page, source, file } = {}) {
    const style = responsiveStyleSource(source, file);
    if (!style) return responsiveFailure("RESPONSIVE_REPAIR_SOURCE_STYLE_REQUIRED");
    let url;
    try { url = new URL(page?.url); } catch { return responsiveFailure("RESPONSIVE_REPAIR_PAGE_REQUIRED"); }
    if (page?.source !== "RENDERED_DOM_LAYOUT_REPLAY" || !["http:", "https:"].includes(url.protocol) ||
        url.pathname !== "/gestia-terminal.html" || !Array.isArray(page.viewports) || !page.viewports.length || page.viewports.length > 10) {
        return responsiveFailure("RESPONSIVE_REPAIR_PAGE_REQUIRED");
    }
    const samples = page.viewports.filter(sample => Number.isInteger(sample.viewport?.width) && sample.viewport.width > 0 &&
        Number.isInteger(sample.viewport?.height) && sample.viewport.height > 0 && Array.isArray(sample.elements));
    if (samples.length !== page.viewports.length) return responsiveFailure("RESPONSIVE_REPAIR_MEASUREMENTS_REQUIRED");
    const palette = [...new Map(samples.flatMap(sample => sample.elements).flatMap(element => {
        const color = measuredRgb(element.color);
        return color ? [[color.join(","), color]] : [];
    })).values()];
    const groups = new Map();
    for (const sample of samples) {
        for (const finding of Array.isArray(sample.findings) ? sample.findings : []) {
            if (!safeResponsiveSelector(finding?.selector) || !["defect", "recommendation"].includes(finding.classification)) continue;
            const element = sample.elements.find(item => item.selector === finding.selector && measuredRectangle(item.rect));
            if (!element) continue;
            const key = `${finding.kind}:${finding.selector}`;
            if (!groups.has(key)) groups.set(key, { selector: finding.selector, kind: finding.kind, classification: finding.classification, observations: [] });
            groups.get(key).observations.push({ viewport: { ...sample.viewport }, element, finding });
        }
    }
    const options = [];
    for (const group of groups.values()) {
        if (options.length >= 10) break;
        const { selector, kind, classification, observations } = group;
        let css = "", explanation = "", diagnosticFacts = [];
        if (kind === "hidden_element_rendered" && classification === "defect" && observations.every(({ element }) => element.hiddenAttribute === true && element.display && element.display !== "none")) {
            css = `${selector}[hidden] { display: none; }`;
            explanation = "Hace prevalecer el estado hidden de este componente; su distribución abierta se conserva.";
            diagnosticFacts = observations.map(({ viewport, element }) => ({ viewport, hiddenAttribute: true, display: element.display, rect: [...element.rect] }));
        } else if (kind === "low_text_contrast" && classification === "defect") {
            const measured = samples.flatMap(sample => sample.elements.filter(element => element.selector === selector && measuredRectangle(element.rect))
                .map(element => ({ viewport: sample.viewport, element, background: measuredRgb(element.effectiveBackgroundColor) })));
            if (!measured.length || measured.some(item => !item.background)) continue;
            const originalColor = measuredRgb(measured[0].element.color);
            if (!originalColor || observations.some(({ element }) => {
                const fg = measuredRgb(element.color), bg = measuredRgb(element.effectiveBackgroundColor);
                return !fg || !bg || contrastBetween(fg, bg) >= requiredTextContrast(element);
            })) continue;
            const candidates = palette.filter(color => measured.every(item => contrastBetween(color, item.background) >= requiredTextContrast(item.element)))
                .sort((a, b) => a.reduce((sum, value, index) => sum + (value - originalColor[index]) ** 2, 0) -
                    b.reduce((sum, value, index) => sum + (value - originalColor[index]) ** 2, 0));
            if (!candidates.length) continue;
            const color = candidates[0];
            css = `${selector} { color: rgb(${color.join(", ")}); }`;
            explanation = "Usa un color ya observado en la paleta y suficiente para los fondos efectivos medidos; requiere comprobación posterior.";
            diagnosticFacts = measured.map(({ viewport, element, background }) => ({ viewport, originalColor: element.color,
                effectiveBackgroundColor: element.effectiveBackgroundColor, minimum: requiredTextContrast(element),
                candidateRatio: Math.round(contrastBetween(color, background) * 100) / 100 }));
        } else if (kind === "small_text" && classification === "recommendation" && observations.every(({ element }) => {
            const size = Number.parseFloat(element.fontSize); return Number.isFinite(size) && size > 0 && size < 12;
        })) {
            css = `${selector} { font-size: 12px; }`;
            explanation = "Recomendación: aumenta el texto observado por debajo de 12 px; no convierte la preferencia en una infracción.";
            diagnosticFacts = observations.map(({ viewport, element }) => ({ viewport, fontSize: element.fontSize, rect: [...element.rect] }));
        } else if (kind === "small_touch_target" && classification === "recommendation" && observations.every(({ element }) =>
            element.interactive === true && (element.rect[2] < 44 || element.rect[3] < 44))) {
            css = `${selector} { min-width: 44px; min-height: 44px; }`;
            explanation = "Recomendación: aumenta el área de activación a 44 × 44 px y exige revisar la matriz después; no acredita interacción táctil.";
            if (headerContainsSelector(source, selector)) {
                css += "\nbody > header { flex-wrap: wrap; gap: 1rem; }\nbody > header > :first-child { flex: 1 1 20rem; min-width: 0; }\nbody > header > :last-child { flex-wrap: wrap; max-width: 100%; }";
                explanation += " Incluye envoltura fluida del encabezado existente para acomodar el control aumentado sin posiciones absolutas.";
            }
            diagnosticFacts = observations.map(({ viewport, element }) => ({ viewport, rect: [...element.rect], recommendedTarget: 44 }));
        }
        if (!css || style.block.includes(css)) continue;
        options.push({ id: `responsive_${options.length + 1}`, selector, kind, classification, diagnosticFacts,
            css, explanation, viewports: [...new Map(observations.map(({ viewport }) => [`${viewport.width}x${viewport.height}`, viewport])).values()], autoApply: false });
    }
    responsiveOptionSources.set(options, { source, file, style, serialized: JSON.stringify(options) });
    return { ok: options.length > 0, status: options.length ? "RESPONSIVE_REPAIR_OPTIONS_READY" : "RESPONSIVE_REPAIR_NO_SAFE_OPTIONS", file, options, autoApply: false };
}

export function buildResponsiveRepairPatch({ options, selectedIds, source, file } = {}) {
    const context = Array.isArray(options) ? responsiveOptionSources.get(options) : null;
    if (!context || context.file !== file || context.source !== source || context.serialized !== JSON.stringify(options)) {
        return responsiveFailure("RESPONSIVE_REPAIR_OPTIONS_SOURCE_MISMATCH");
    }
    if (!Array.isArray(selectedIds) || selectedIds.length < 1 || selectedIds.length > 10 || selectedIds.some(id => typeof id !== "string")) {
        return responsiveFailure("RESPONSIVE_REPAIR_SELECTION_REQUIRED");
    }
    const ids = [...new Set(selectedIds)];
    const selected = ids.map(id => options.find(option => option.id === id));
    if (selected.some(option => !option)) return responsiveFailure("RESPONSIVE_REPAIR_SELECTION_INVALID");
    const css = [...new Set(selected.flatMap(option => option.css.split("\n")))].join(context.style.newline);
    const search = context.style.block;
    if (/<\/style|[\u0000]/i.test(css)) return responsiveFailure("RESPONSIVE_REPAIR_CSS_INVALID");
    const replace = search + context.style.newline +
        `/* ADJUNTO: ${ids.join(", ")} */` + context.style.newline + css + context.style.newline;
    return { ok: true, status: "RESPONSIVE_REPAIR_PATCH_PREPARED", file, operation: "replace", search, replace, matchCount: 1,
        selectedIds: ids, autoApply: false };
}
