import test from "node:test";
import assert from "node:assert/strict";

import { verifyPdfVisualChanges } from "../jarvis-pdf-visual.js";

async function buildVisualPair(unauthorizedChange = false) {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const source = await PDFDocument.create();
    const page = source.addPage([612, 792]);
    const font = await source.embedFont(StandardFonts.Helvetica);
    page.drawText("Total: $1,160.00", { x: 70, y: 110, size: 12, font });
    const sourceBytes = Buffer.from(await source.save({ useObjectStreams: false }));
    const output = await PDFDocument.load(sourceBytes);
    const outputPage = output.getPage(0);
    outputPage.drawRectangle({ x: 65, y: 100, width: 180, height: 30, color: rgb(1, 1, 1) });
    outputPage.drawText("Total: $1,044.00", { x: 70, y: 110, size: 12, font: await output.embedFont(StandardFonts.Helvetica) });
    if (unauthorizedChange) outputPage.drawRectangle({ x: 420, y: 620, width: 100, height: 100, color: rgb(0, 0, 0) });
    return { sourceBytes, outputBytes: Buffer.from(await output.save({ useObjectStreams: false })) };
}

test("rendered PDF comparison accepts only approved visual regions", async () => {
    const changes = [{ page: 1, x: 65, y: 100, width: 180, height: 30 }];
    const valid = await buildVisualPair(false);
    const accepted = await verifyPdfVisualChanges({ ...valid, changes });
    assert.equal(accepted.renderedComparisonPassed, true);
    assert.ok(accepted.approvedRegionChangedPixels > 0);
    assert.ok(accepted.outsideDifferenceRatio <= 0.0005);

    const tampered = await buildVisualPair(true);
    const blocked = await verifyPdfVisualChanges({ ...tampered, changes });
    assert.equal(blocked.renderedComparisonPassed, false);
    assert.ok(blocked.outsideDifferenceRatio > 0.0005);
});
