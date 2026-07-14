import { fileURLToPath } from "node:url";

export const JARVIS_PDF_VISUAL_VERSION = "1.0.0-rendered-region-diff";

async function renderPdfPages(pdfBytes, maximumPages) {
    const [{ createCanvas }, pdfjs] = await Promise.all([
        import("@napi-rs/canvas"),
        import("pdfjs-dist/legacy/build/pdf.mjs")
    ]);
    const standardFontDataUrl = `${fileURLToPath(new URL("./node_modules/pdfjs-dist/standard_fonts/", import.meta.url))}/`;
    const document = await pdfjs.getDocument({ data: Uint8Array.from(pdfBytes || []), disableWorker: true, standardFontDataUrl }).promise;
    const pages = [];
    try {
        if (document.numPages > maximumPages) throw new Error("PDF_VISUAL_PAGE_LIMIT_EXCEEDED");
        let totalPixels = 0;
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
            const page = await document.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1 });
            const width = Math.ceil(viewport.width);
            const height = Math.ceil(viewport.height);
            totalPixels += width * height;
            if (totalPixels > 24_000_000) throw new Error("PDF_VISUAL_PIXEL_LIMIT_EXCEEDED");
            const canvas = createCanvas(width, height);
            const context = canvas.getContext("2d");
            await page.render({ canvasContext: context, viewport, canvas }).promise;
            pages.push({ page: pageNumber, width, height, pixels: context.getImageData(0, 0, width, height).data });
        }
    } finally {
        await document.destroy();
    }
    return pages;
}

function pixelInsideApprovedRegion(x, y, pageHeight, regions) {
    return regions.some(region => {
        const margin = 3;
        const left = region.x - margin;
        const right = region.x + region.width + margin;
        const top = pageHeight - region.y - region.height - margin;
        const bottom = pageHeight - region.y + margin;
        return x >= left && x <= right && y >= top && y <= bottom;
    });
}

export async function verifyPdfVisualChanges({ sourceBytes, outputBytes, changes = [] } = {}) {
    if (!Array.isArray(changes) || changes.length < 1) throw new Error("PDF_VISUAL_CHANGES_REQUIRED");
    const [sourcePages, outputPages] = await Promise.all([
        renderPdfPages(sourceBytes, 20),
        renderPdfPages(outputBytes, 20)
    ]);
    if (sourcePages.length !== outputPages.length) throw new Error("PDF_VISUAL_PAGE_COUNT_CHANGED");
    let approvedRegionChangedPixels = 0;
    let outsideChangedPixels = 0;
    let outsidePixels = 0;
    const pages = [];
    for (let pageIndex = 0; pageIndex < sourcePages.length; pageIndex += 1) {
        const source = sourcePages[pageIndex];
        const output = outputPages[pageIndex];
        if (source.width !== output.width || source.height !== output.height) throw new Error("PDF_VISUAL_PAGE_SIZE_CHANGED");
        const regions = changes.filter(change => Number(change.page) === source.page);
        let pageApprovedChanges = 0;
        let pageOutsideChanges = 0;
        for (let y = 0; y < source.height; y += 1) {
            for (let x = 0; x < source.width; x += 1) {
                const offset = (y * source.width + x) * 4;
                const changed = Math.abs(source.pixels[offset] - output.pixels[offset]) > 16 ||
                    Math.abs(source.pixels[offset + 1] - output.pixels[offset + 1]) > 16 ||
                    Math.abs(source.pixels[offset + 2] - output.pixels[offset + 2]) > 16 ||
                    Math.abs(source.pixels[offset + 3] - output.pixels[offset + 3]) > 16;
                const approved = pixelInsideApprovedRegion(x, y, source.height, regions);
                if (approved) {
                    if (changed) pageApprovedChanges += 1;
                } else {
                    outsidePixels += 1;
                    if (changed) pageOutsideChanges += 1;
                }
            }
        }
        approvedRegionChangedPixels += pageApprovedChanges;
        outsideChangedPixels += pageOutsideChanges;
        pages.push({ page: source.page, width: source.width, height: source.height, approvedRegionChangedPixels: pageApprovedChanges, outsideChangedPixels: pageOutsideChanges });
    }
    const outsideDifferenceRatio = outsidePixels ? outsideChangedPixels / outsidePixels : 0;
    const renderedComparisonPassed = approvedRegionChangedPixels > 0 && outsideDifferenceRatio <= 0.0005;
    return {
        ok: renderedComparisonPassed,
        version: JARVIS_PDF_VISUAL_VERSION,
        renderedComparisonPassed,
        pageCount: sourcePages.length,
        approvedRegionChangedPixels,
        outsideChangedPixels,
        outsidePixels,
        outsideDifferenceRatio,
        pages
    };
}
