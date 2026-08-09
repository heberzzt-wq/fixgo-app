import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildMediaAnalysis,
    createMediaIngestionRecord,
    describeMediaIngestion
} from "../gestia-core/jarvis/jarvis.media.ingestion.js";

function authority() {
    return {
        objectiveId: "OBJ-MEDIA-PRECISION",
        instruction: "Analiza con precisión y reporta sólo lo sustentado."
    };
}

test("multi-page PDF cannot claim exhaustive coverage when a page has no analyzable evidence", () => {
    const record = createMediaIngestionRecord({
        sourceId: "SOURCE_PDF_1",
        sourceName: "contrato.pdf",
        mimeType: "application/pdf",
        sha256: "a".repeat(64),
        pages: [
            { pageNumber: 1, text: "Contrato de servicio", confidence: 0.99 },
            { pageNumber: 2, text: "", tables: [], images: [], confidence: 0.31 },
            { pageNumber: 3, tables: [{ rows: [["Total", "$10,000"]] }], confidence: 0.96 }
        ]
    }, authority());

    const analysis = buildMediaAnalysis(record, {
        findings: ["El documento completo establece un total de $10,000."],
        evidence: []
    });

    assert.equal(analysis.analysis.coverage.expectedPages, 3);
    assert.equal(analysis.analysis.coverage.analyzedPages, 2);
    assert.deepEqual(analysis.analysis.coverage.unreadablePageNumbers, [2]);
    assert.equal(analysis.analysis.coverage.exhaustive, false);
    assert.equal(analysis.policy.mayClaimFullDocumentCoverage, false);
    assert.equal(analysis.analysis.claimIntegrity.verifiedClaims, 0);
    assert.equal(analysis.analysis.claimIntegrity.unsupportedClaims, 1);
    assert.equal(
        analysis.analysis.claimIntegrity.findings[0].status,
        "UNSTRUCTURED_CLAIM_REQUIRES_EVIDENCE"
    );
});

test("structured media evidence preserves source, SHA, page locator and verification state", () => {
    const record = createMediaIngestionRecord({
        sourceId: "SOURCE_IMAGE_1",
        sourceName: "captura.png",
        mimeType: "image/png",
        sha256: "b".repeat(64),
        pages: [{
            pageNumber: 1,
            regions: [{ x: 10, y: 20, width: 300, height: 80 }],
            confidence: 0.98
        }]
    }, authority());

    const analysis = buildMediaAnalysis(record, {
        findings: [{
            text: "Se observa el encabezado ADJUNTO.",
            page: 1,
            region: { x: 10, y: 20, width: 300, height: 80 },
            confidence: 0.99,
            legibility: "VERIFIED"
        }],
        evidence: [{
            value: "ADJUNTO",
            pageNumber: 1,
            locator: "header",
            confidence: 1,
            verified: true
        }]
    });

    assert.equal(analysis.source.sourceId, "SOURCE_IMAGE_1");
    assert.equal(analysis.source.sha256, "b".repeat(64));
    assert.equal(analysis.analysis.coverage.exhaustive, true);
    assert.equal(analysis.policy.mayClaimFullDocumentCoverage, true);
    assert.equal(analysis.analysis.claimIntegrity.verifiedClaims, 2);
    assert.equal(analysis.analysis.claimIntegrity.unsupportedClaims, 0);
    for (const claim of [
        ...analysis.analysis.claimIntegrity.findings,
        ...analysis.analysis.claimIntegrity.evidence
    ]) {
        assert.equal(claim.sourceId, "SOURCE_IMAGE_1");
        assert.equal(claim.sourceName, "captura.png");
        assert.equal(claim.sha256, "b".repeat(64));
        assert.equal(claim.pageNumber, 1);
        assert.equal(claim.sourceScoped, true);
        assert.equal(claim.verified, true);
        assert.equal(claim.status, "SOURCE_SCOPED_VERIFIED");
    }
});

test("multi-page structured claim without page scope stays unverified", () => {
    const record = createMediaIngestionRecord({
        sourceId: "SOURCE_PDF_2",
        sourceName: "reporte.pdf",
        mimeType: "application/pdf",
        pages: [
            { pageNumber: 1, text: "Página uno" },
            { pageNumber: 2, text: "Página dos" }
        ]
    }, authority());
    const analysis = buildMediaAnalysis(record, {
        evidence: [{
            value: "Dato visible",
            confidence: 1,
            verified: true
        }]
    });

    assert.equal(analysis.analysis.coverage.exhaustive, true);
    assert.equal(analysis.analysis.claimIntegrity.evidence[0].sourceScoped, false);
    assert.equal(analysis.analysis.claimIntegrity.evidence[0].verified, false);
    assert.equal(analysis.analysis.claimIntegrity.evidence[0].status, "SOURCE_SCOPE_REQUIRED");
});

test("media ingestion advertises fail-closed precision capabilities", () => {
    const description = describeMediaIngestion();
    assert.ok(description.capabilities.includes("source_scoped_claim_provenance"));
    assert.ok(description.capabilities.includes("page_coverage_accounting"));
    assert.ok(description.capabilities.includes("fail_closed_full_document_claims"));
});
