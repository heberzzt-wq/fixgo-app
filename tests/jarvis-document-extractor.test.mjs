import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildDocxArtifactBuffer } from "../jarvis-docx-artifact.js";
import {
    describeJarvisDocumentExtractor,
    extractJarvisDocumentArtifact
} from "../jarvis-document-extractor.js";

function tempArtifactRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-doc-extract-"));
    fs.mkdirSync(path.join(root, ".jarvis-artifacts", "uploads"), { recursive: true });
    return root;
}

function outputFor(name) {
    return `.jarvis-artifacts/uploads/${name}`;
}

test("extractor reads complete UTF-8 text and CSV tables without synthetic content", async () => {
    const root = tempArtifactRoot();
    try {
        fs.writeFileSync(
            path.join(root, outputFor("datos.csv")),
            "Servicio,Precio\nPlomería,850\nElectricidad,1200\n",
            "utf8"
        );
        const result = await extractJarvisDocumentArtifact({
            root,
            output: outputFor("datos.csv"),
            sourceName: "datos.csv",
            mimeType: "text/csv"
        });

        assert.equal(result.ok, true);
        assert.equal(result.mimeType, "text/csv");
        assert.equal(result.coverageUnit, "document");
        assert.equal(result.pages.length, 1);
        assert.match(result.pages[0].text, /Plomería\t?[,]?850/);
        assert.deepEqual(result.pages[0].tables[0].headers, ["Servicio", "Precio"]);
        assert.deepEqual(result.pages[0].tables[0].rows[1], ["Electricidad", "1200"]);
        assert.match(result.sha256, /^[a-f0-9]{64}$/);
        assert.equal(result.metadata.exhaustiveLogicalExtraction, true);
        assert.equal(result.policy.noSyntheticText, true);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("extractor rereads a real DOCX body and tables from OOXML bytes", async () => {
    const root = tempArtifactRoot();
    try {
        const built = await buildDocxArtifactBuffer({
            title: "Auditoría",
            content: [
                "# Resumen",
                "La evidencia confirma 14 órdenes verificadas.",
                "",
                "| Métrica | Valor |",
                "| --- | --- |",
                "| Órdenes | 14 |"
            ].join("\n")
        });
        fs.writeFileSync(path.join(root, outputFor("auditoria.docx")), built.buffer);

        const result = await extractJarvisDocumentArtifact({
            root,
            output: outputFor("auditoria.docx"),
            sourceName: "auditoria.docx"
        });

        assert.equal(result.ok, true);
        assert.equal(result.documentType, "docx");
        assert.equal(result.coverageUnit, "document-body");
        assert.match(result.pages[0].text, /14 órdenes verificadas/);
        assert.ok(result.pages[0].tables.some(table =>
            table.headers.includes("Métrica") &&
            table.rows.some(row => row.includes("14"))
        ));
        assert.equal(result.metadata.physicalPageCountKnown, false);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("extractor reads every used XLSX worksheet including formulas and stored results", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const root = tempArtifactRoot();
    try {
        const workbook = new ExcelJS.Workbook();
        const leads = workbook.addWorksheet("Leads");
        leads.addRow(["Canal", "Leads"]);
        leads.addRow(["Meta", 12]);
        const kpi = workbook.addWorksheet("KPI");
        kpi.addRow(["Métrica", "Valor"]);
        kpi.addRow(["Total", { formula: "SUM(2,3)", result: 5 }]);
        await workbook.xlsx.writeFile(path.join(root, outputFor("control.xlsx")));

        const result = await extractJarvisDocumentArtifact({
            root,
            output: outputFor("control.xlsx"),
            sourceName: "control.xlsx"
        });

        assert.equal(result.ok, true);
        assert.equal(result.documentType, "xlsx");
        assert.equal(result.coverageUnit, "worksheet");
        assert.deepEqual(result.metadata.worksheetNames, ["Leads", "KPI"]);
        assert.equal(result.pages.length, 2);
        assert.match(result.pages[0].text, /Meta\t12/);
        assert.match(result.pages[1].text, /=SUM\(2,3\) => 5/);
        assert.equal(result.metadata.exhaustiveLogicalExtraction, true);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("extractor preserves PPTX slide order and visible text", async () => {
    const PptxGenJS = (await import("pptxgenjs")).default;
    const root = tempArtifactRoot();
    try {
        const pptx = new PptxGenJS();
        const slide1 = pptx.addSlide();
        slide1.addText("Diagnóstico del mercado", { x: 1, y: 1, w: 8, h: 1 });
        const slide2 = pptx.addSlide();
        slide2.addText("CTA: Solicitar servicio", { x: 1, y: 1, w: 8, h: 1 });
        await pptx.writeFile({ fileName: path.join(root, outputFor("campana.pptx")) });

        const result = await extractJarvisDocumentArtifact({
            root,
            output: outputFor("campana.pptx"),
            sourceName: "campana.pptx"
        });

        assert.equal(result.ok, true);
        assert.equal(result.documentType, "pptx");
        assert.equal(result.coverageUnit, "slide");
        assert.equal(result.pages.length, 2);
        assert.match(result.pages[0].text, /Diagnóstico del mercado/);
        assert.match(result.pages[1].text, /CTA: Solicitar servicio/);
        assert.equal(result.metadata.physicalPageCountKnown, true);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("extractor reads a real PDF text layer page by page and leaves scanned-page vision out of scope", async () => {
    const root = tempArtifactRoot();
    try {
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const first = pdf.addPage([500, 700]);
        first.drawText("Contrato: vigencia 2026", { x: 40, y: 640, size: 16, font });
        const second = pdf.addPage([500, 700]);
        second.drawText("Total verificado: 9500 MXN", { x: 40, y: 640, size: 16, font });
        fs.writeFileSync(path.join(root, outputFor("contrato.pdf")), Buffer.from(await pdf.save()));

        const result = await extractJarvisDocumentArtifact({
            root,
            output: outputFor("contrato.pdf"),
            sourceName: "contrato.pdf"
        });

        assert.equal(result.ok, true);
        assert.equal(result.documentType, "pdf");
        assert.equal(result.coverageUnit, "page");
        assert.equal(result.pages.length, 2);
        assert.match(result.pages[0].text, /vigencia 2026/);
        assert.match(result.pages[1].text, /9500 MXN/);
        assert.equal(result.metadata.scannedPagesRemainUnverifiedWithoutVisualAnalysis, true);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("extractor blocks paths outside the artifact ledger and advertises supported document families", async () => {
    const root = tempArtifactRoot();
    try {
        fs.writeFileSync(path.join(root, "secret.txt"), "fuera del ledger");
        await assert.rejects(
            () => extractJarvisDocumentArtifact({
                root,
                output: "secret.txt",
                sourceName: "secret.txt"
            }),
            /ARTIFACT_PATH_OUTSIDE_LEDGER/
        );

        const description = describeJarvisDocumentExtractor();
        assert.equal(description.readOnly, true);
        for (const extension of [".pdf", ".docx", ".xlsx", ".pptx", ".csv", ".md"]) {
            assert.ok(description.extensions.includes(extension));
        }
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
