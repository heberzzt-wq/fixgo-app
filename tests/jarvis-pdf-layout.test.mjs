import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { locatePdfFieldAnchors } from "../jarvis-pdf-layout.js";
import { editPdfOverlayArtifact } from "../jarvis-fs-bridge.js";

async function quotePdfBytes() {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const document = await PDFDocument.create();
    const page = document.addPage([612, 792]);
    const font = await document.embedFont(StandardFonts.Helvetica);
    page.drawText("Subtotal: $1,000.00", { x: 330, y: 210, size: 10, font });
    page.drawText("Descuento: $0.00", { x: 330, y: 180, size: 10, font });
    page.drawText("Subtotal con descuento: $1,000.00", { x: 330, y: 150, size: 10, font });
    page.drawText("IVA 16%: $160.00", { x: 330, y: 120, size: 10, font });
    page.drawText("Total: $1,160.00", { x: 330, y: 90, size: 10, font });
    return Buffer.from(await document.save({ useObjectStreams: false }));
}

const anchors = {
    discount: { text: "Descuento", width: 220 },
    taxableSubtotal: { text: "Subtotal con descuento", width: 240 },
    tax: { text: "IVA 16%", width: 220 },
    total: { text: "Total", width: 220 }
};

test("PDF layout extracts unique text coordinates for quote fields", async () => {
    const located = await locatePdfFieldAnchors({ pdfBytes: await quotePdfBytes(), anchors });
    assert.equal(located.ok, true);
    assert.deepEqual(Object.keys(located.fields), ["discount", "taxableSubtotal", "tax", "total"]);
    assert.equal(located.evidence.every(item => item.page === 1 && item.matchedText), true);
    assert.ok(located.fields.total.y < located.fields.tax.y);
    await assert.rejects(async () => locatePdfFieldAnchors({ pdfBytes: await quotePdfBytes(), anchors: { total: { text: "$", matchMode: "includes" } } }), /PDF_FIELD_ANCHOR_MATCH_COUNT/);
});

test("quote PDF edit locates fields automatically before recalculating discount and IVA", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pdf-layout-edit-"));
    try {
        const uploadDir = path.join(root, ".jarvis-artifacts", "uploads");
        fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(path.join(uploadDir, "cotizacion.pdf"), await quotePdfBytes());
        const result = await editPdfOverlayArtifact({
            root,
            sourceOutput: ".jarvis-artifacts/uploads/cotizacion.pdf",
            output: ".jarvis-artifacts/documents/cotizacion-localizada.pdf",
            quote: { subtotal: "1000", discountPercent: "10", taxPercent: "16", currency: "MXN", fieldAnchors: anchors }
        });
        assert.equal(result.quoteCalculation.minor.total, 104400);
        assert.equal(result.fieldLocationEvidence.length, 4);
        assert.equal(result.changes.length, 4);
        assert.equal(result.visualVerification.overflowPassed, true);
        assert.equal(fs.existsSync(path.join(root, result.output)), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});


test("PDF safe placement clamps invalid model coordinates and preserves exact evidence", async () => {
    const root =
        fs.mkdtempSync(
            path.join(
                os.tmpdir(),
                "jarvis-pdf-safe-placement-"
            )
        );

    try {
        const uploadDir =
            path.join(
                root,
                ".jarvis-artifacts",
                "uploads"
            );

        fs.mkdirSync(
            uploadDir,
            {
                recursive: true
            }
        );

        fs.writeFileSync(
            path.join(
                uploadDir,
                "source.pdf"
            ),
            await quotePdfBytes()
        );

        const result =
            await editPdfOverlayArtifact({
                root,
                sourceOutput:
                    ".jarvis-artifacts/uploads/source.pdf",
                output:
                    ".jarvis-artifacts/documents/safe.pdf",
                safePlacement:
                    true,
                changes: [
                    {
                        page:
                            1,
                        x:
                            9000,
                        y:
                            -200,
                        width:
                            9000,
                        height:
                            18,
                        text:
                            "Validacion segura",
                        fontSize:
                            8,
                        padding:
                            1
                    }
                ]
            });

        const applied =
            result.changes[0];

        assert.equal(
            result.ok,
            true
        );
        assert.equal(
            result.originalPreserved,
            true
        );
        assert.equal(
            result.safePlacement,
            true
        );
        assert.equal(
            result.placementAdjustments,
            1
        );
        assert.equal(
            applied.placementAdjusted,
            true
        );
        assert.equal(
            applied.placementPolicy,
            "safe_margin"
        );
        assert.ok(
            applied.x >=
            applied.safeMargin
        );
        assert.ok(
            applied.y >=
            applied.safeMargin
        );
        assert.ok(
            applied.x +
            applied.width <=
            612
        );
        assert.ok(
            applied.y +
            applied.height <=
            792
        );
        assert.notEqual(
            result.sourceSha256,
            result.outputSha256
        );
        assert.equal(
            result
                .visualVerification
                .overflowPassed,
            true
        );
        assert.equal(
            fs.existsSync(
                path.join(
                    root,
                    result.output
                )
            ),
            true
        );
    }
    finally {
        fs.rmSync(
            root,
            {
                recursive: true,
                force: true
            }
        );
    }
});

test("PDF strict placement still rejects an invalid box", async () => {
    const root =
        fs.mkdtempSync(
            path.join(
                os.tmpdir(),
                "jarvis-pdf-strict-placement-"
            )
        );

    try {
        const uploadDir =
            path.join(
                root,
                ".jarvis-artifacts",
                "uploads"
            );

        fs.mkdirSync(
            uploadDir,
            {
                recursive: true
            }
        );

        fs.writeFileSync(
            path.join(
                uploadDir,
                "source.pdf"
            ),
            await quotePdfBytes()
        );

        await assert.rejects(
            async () =>
                await editPdfOverlayArtifact({
                    root,
                    sourceOutput:
                        ".jarvis-artifacts/uploads/source.pdf",
                    output:
                        ".jarvis-artifacts/documents/strict.pdf",
                    safePlacement:
                        false,
                    changes: [
                        {
                            page:
                                1,
                            x:
                                9000,
                            y:
                                -200,
                            width:
                                9000,
                            height:
                                18,
                            text:
                                "Debe fallar",
                            fontSize:
                                8
                        }
                    ]
                }),
            /PDF_EDIT_BOX_OUT_OF_BOUNDS/
        );
    }
    finally {
        fs.rmSync(
            root,
            {
                recursive: true,
                force: true
            }
        );
    }
});
