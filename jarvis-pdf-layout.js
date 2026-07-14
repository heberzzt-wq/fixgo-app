import { fileURLToPath } from "node:url";

export const JARVIS_PDF_LAYOUT_VERSION = "1.0.0-pdfjs-coordinate-evidence";

function normalizedText(value) {
    return Array.from(String(value || "").normalize("NFD").toLowerCase())
        .filter(character => {
            const code = character.codePointAt(0);
            return code < 0x0300 || code > 0x036f;
        })
        .join("")
        .trim();
}

export async function extractPdfTextLayout({ pdfBytes, maximumPages = 50 } = {}) {
    const bytes = Uint8Array.from(pdfBytes || []);
    if (bytes.length < 8 || bytes.length > 50 * 1024 * 1024) throw new Error("PDF_LAYOUT_BYTES_OUT_OF_RANGE");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const standardFontDataUrl = `${fileURLToPath(new URL("./node_modules/pdfjs-dist/standard_fonts/", import.meta.url))}/`;
    const document = await pdfjs.getDocument({ data: bytes, disableWorker: true, standardFontDataUrl }).promise;
    const totalPageCount = document.numPages;
    const pages = [];
    try {
        const pageCount = Math.min(document.numPages, Math.max(1, Number(maximumPages) || 50));
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            const page = await document.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1 });
            const content = await page.getTextContent();
            const items = content.items.filter(item => String(item?.str || "").trim()).map((item, index) => ({
                index,
                text: String(item.str),
                normalized: normalizedText(item.str),
                x: Number(item.transform?.[4]) || 0,
                baselineY: Number(item.transform?.[5]) || 0,
                width: Number(item.width) || 0,
                height: Number(item.height) || Math.abs(Number(item.transform?.[0]) || 10),
                fontName: String(item.fontName || "")
            }));
            pages.push({ page: pageNumber, width: viewport.width, height: viewport.height, items });
        }
    } finally {
        await document.destroy();
    }
    return { ok: true, version: JARVIS_PDF_LAYOUT_VERSION, pageCount: totalPageCount, pages };
}

export async function locatePdfFieldAnchors({ pdfBytes, anchors = {} } = {}) {
    if (!anchors || typeof anchors !== "object" || Array.isArray(anchors) || Object.keys(anchors).length < 1) throw new Error("PDF_FIELD_ANCHORS_REQUIRED");
    const layout = await extractPdfTextLayout({ pdfBytes });
    const fields = {};
    const evidence = [];
    for (const [field, definition] of Object.entries(anchors)) {
        const requested = normalizedText(definition?.text);
        if (!requested) throw new Error(`PDF_FIELD_ANCHOR_TEXT_REQUIRED:${field}`);
        const matchMode = definition?.matchMode === "exact" || definition?.matchMode === "includes" ? definition.matchMode : "startsWith";
        const candidates = layout.pages.flatMap(page => page.items
            .filter(item => matchMode === "exact" ? item.normalized === requested : matchMode === "includes" ? item.normalized.includes(requested) : item.normalized.startsWith(requested))
            .map(item => ({ page, item })));
        if (candidates.length !== 1) throw new Error(`PDF_FIELD_ANCHOR_MATCH_COUNT:${field}:${candidates.length}`);
        const { page, item } = candidates[0];
        const fontSize = Math.max(6, Math.min(Number(definition?.fontSize) || item.height || 10, 72));
        const x = item.x + (Number(definition?.offsetX) || 0);
        const y = item.baselineY - fontSize * 0.3 + (Number(definition?.offsetY) || 0);
        const width = Math.max(40, Number(definition?.width) || item.width + 8);
        const height = Math.max(fontSize * 1.8, Number(definition?.height) || fontSize * 1.8);
        if (x < 0 || y < 0 || x + width > page.width || y + height > page.height) throw new Error(`PDF_FIELD_ANCHOR_BOX_OUT_OF_BOUNDS:${field}`);
        fields[field] = { page: page.page, x, y, width, height, fontSize, color: definition?.color, backgroundColor: definition?.backgroundColor };
        evidence.push({ field, requestedText: definition.text, matchedText: item.text, page: page.page, sourceBox: { x: item.x, baselineY: item.baselineY, width: item.width, height: item.height }, targetBox: fields[field] });
    }
    return { ok: true, version: JARVIS_PDF_LAYOUT_VERSION, fields, evidence, pageCount: layout.pageCount };
}
