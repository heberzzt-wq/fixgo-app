import assert from "node:assert/strict";
import { test } from "node:test";

import {
    authorizePageOutput,
    createOfficialPageSpec,
    describePageCreator
} from "../gestia-core/jarvis/jarvis.page.creator.js";
import {
    buildMediaAnalysis,
    createMediaIngestionRecord,
    describeMediaIngestion
} from "../gestia-core/jarvis/jarvis.media.ingestion.js";

const authority = {
    objectiveId: "OBJ-CREATIVE-1",
    authorityId: "HEBERTO_MENDOZA",
    controllerId: "CODEX_SIA7",
    instruction: "Crear pagina oficial y analizar documentos"
};

test("page creator produces responsive editable spec with blocked output", () => {
    const spec = createOfficialPageSpec({
        brandName: "GestiaPremium",
        pageName: "Pagina Oficial Gestia"
    }, authority);

    assert.equal(spec.page.fileName, "pagina-oficial-gestia.html");
    assert.equal(spec.page.responsive, true);
    assert.equal(spec.page.editable, true);
    assert.equal(spec.outputContract.writeAllowed, false);
    assert.equal(spec.outputContract.deployAllowed, false);
    assert.equal(spec.trace.objectiveId, authority.objectiveId);
    assert.equal(describePageCreator().version, "1.0.0-sia7-page-creator");
});

test("page creator rejects mismatched approval chain", () => {
    const spec = createOfficialPageSpec({}, authority);

    assert.equal(authorizePageOutput(spec, {
        ...authority,
        objectiveId: "OTHER",
        approved: true
    }).reason, "OBJECTIVE_MISMATCH");

    assert.equal(authorizePageOutput(spec, {
        ...authority,
        approved: true
    }).allowed, true);
});

test("PDF ingestion preserves structured extraction and trace", () => {
    const record = createMediaIngestionRecord({
        mimeType: "application/pdf",
        sourceId: "PDF-1",
        sourceName: "cotizacion.pdf",
        pages: [
            { pageNumber: 1, text: "Cliente: Demo", tables: [["Concepto", "Total"]] },
            { pageNumber: 2, text: "Total: 1000" }
        ]
    }, authority);

    assert.equal(record.mediaType, "pdf");
    assert.equal(record.extraction.metadata.pageCount, 2);
    assert.match(record.extraction.fullText, /Cliente: Demo/);
    assert.equal(record.policy.writeAllowed, false);
    assert.equal(record.trace.objectiveId, authority.objectiveId);
});

test("media analysis remains advisory and cannot authorize writes", () => {
    const record = createMediaIngestionRecord({
        mimeType: "image/png",
        sourceName: "evidencia.png",
        pages: [{ text: "Equipo con corrosion", images: [{ id: "img-1" }] }]
    }, authority);

    const analysis = buildMediaAnalysis(record, {
        findings: ["corrosion_visible"],
        evidence: [{ pageNumber: 1, sourceId: "img-1" }]
    });

    assert.equal(analysis.ok, true);
    assert.equal(analysis.policy.advisoryOnly, true);
    assert.equal(analysis.policy.mayReplaceInstruction, false);
    assert.equal(analysis.policy.mayAuthorizeWrite, false);
    assert.equal(describeMediaIngestion().supportedTypes.includes("application/pdf"), true);
});
