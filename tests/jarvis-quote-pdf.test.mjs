import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { calculateQuoteTotals } from "../jarvis-quote-calculator.js";
import { editPdfOverlayArtifact } from "../jarvis-fs-bridge.js";

test("quote calculator applies discount before IVA with exact minor-unit arithmetic", () => {
    const result = calculateQuoteTotals({ subtotal: "1000.00", discountPercent: "10", taxPercent: "16", currency: "MXN" });
    assert.deepEqual(result.operationOrder, ["subtotal", "discount", "tax", "total"]);
    assert.deepEqual(result.minor, { subtotal: 100000, discount: 10000, taxableSubtotal: 90000, tax: 14400, total: 104400 });
    assert.equal(result.values.total, 1044);
    assert.match(result.formatted.total, /1,044\.00/);

    const rounded = calculateQuoteTotals({ subtotal: "999.99", discountPercent: "10", taxPercent: "16" });
    assert.deepEqual(rounded.minor, { subtotal: 99999, discount: 10000, taxableSubtotal: 89999, tax: 14400, total: 104399 });
    assert.throws(() => calculateQuoteTotals({ subtotal: "100", discountPercent: "100.01", taxPercent: "16" }), /QUOTE_PERCENT_OUT_OF_RANGE/);
});

test("quote PDF editing preserves the original and records every recalculated value", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-quote-pdf-"));
    try {
        const { PDFDocument, StandardFonts } = await import("pdf-lib");
        const document = await PDFDocument.create();
        const page = document.addPage([612, 792]);
        const font = await document.embedFont(StandardFonts.Helvetica);
        page.drawText("Subtotal: $1,000.00", { x: 330, y: 190, size: 10, font });
        page.drawText("IVA: $160.00", { x: 330, y: 150, size: 10, font });
        page.drawText("Total: $1,160.00", { x: 330, y: 110, size: 10, font });
        const original = Buffer.from(await document.save({ useObjectStreams: false }));
        const uploadDir = path.join(root, ".jarvis-artifacts", "uploads");
        fs.mkdirSync(uploadDir, { recursive: true });
        const originalPath = path.join(uploadDir, "cotizacion-original.pdf");
        fs.writeFileSync(originalPath, original);

        const box = y => ({ page: 1, x: 320, y, width: 220, height: 24, fontSize: 10 });
        const result = await editPdfOverlayArtifact({
            root,
            sourceOutput: ".jarvis-artifacts/uploads/cotizacion-original.pdf",
            output: ".jarvis-artifacts/documents/cotizacion-10-descuento.pdf",
            quote: {
                subtotal: "1000.00",
                discountPercent: "10",
                taxPercent: "16",
                currency: "MXN",
                fields: { discount: box(170), taxableSubtotal: box(145), tax: box(120), total: box(90) }
            }
        });

        assert.equal(result.originalPreserved, true);
        assert.equal(result.quoteCalculation.minor.discount, 10000);
        assert.equal(result.quoteCalculation.minor.tax, 14400);
        assert.equal(result.quoteCalculation.minor.total, 104400);
        assert.deepEqual(result.quoteChangeLog.map(change => change.field), ["discount", "taxableSubtotal", "tax", "total"]);
        assert.equal(result.visualVerification.overflowPassed, true);
        assert.deepEqual(fs.readFileSync(originalPath), original);
        assert.notEqual(result.outputSha256, result.sourceSha256);
        assert.equal(fs.existsSync(path.join(root, result.output)), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
