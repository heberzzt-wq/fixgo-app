import assert from "node:assert/strict";
import { test } from "node:test";

import {
    registerJarvisMultifunctionTools
} from "../gestia-core/jarvis/jarvis.multitool.pack.js";

function runtimeHarness() {
    const definitions = new Map();
    return {
        definitions,
        runtime: {
            register(definition) {
                definitions.set(definition.name, definition);
                return { ok: true, name: definition.name };
            },
            list() {
                return [...definitions.values()].map(definition => ({ name: definition.name }));
            }
        }
    };
}

test("media.analyze uses local digital extraction for a DOCX without requiring cloud vision", async () => {
    const { runtime, definitions } = runtimeHarness();
    registerJarvisMultifunctionTools(runtime);
    const media = definitions.get("media.analyze");
    assert.ok(media);

    const originalBridge = globalThis.JarvisLocalBridge;
    const originalAuth = globalThis.auth;
    let bridgeCalls = 0;
    try {
        globalThis.auth = { currentUser: null };
        globalThis.JarvisLocalBridge = {
            async requestJson(route, payload) {
                bridgeCalls += 1;
                assert.equal(route, "/artifact/extract");
                assert.equal(payload.output, ".jarvis-artifacts/uploads/brief.docx");
                return {
                    ok: true,
                    status: "DOCUMENT_EXTRACTION_READY",
                    version: "1.0.0-source-scoped-office-extraction",
                    sourceName: "brief.docx",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    sha256: "a".repeat(64),
                    documentType: "docx",
                    coverageUnit: "document-body",
                    pages: [{
                        pageNumber: 1,
                        label: "Cuerpo del documento",
                        text: "Objetivo comercial: captar clientes verificados en Cancún.",
                        tables: [{
                            name: "KPI",
                            headers: ["Indicador", "Meta"],
                            rows: [["Leads", "40"]]
                        }],
                        images: [],
                        regions: [],
                        confidence: 1
                    }],
                    metadata: {
                        physicalPageCountKnown: false,
                        embeddedImagesRequireVisualAnalysis: false,
                        exhaustiveLogicalExtraction: true
                    },
                    policy: {
                        sourceBytesHashed: true,
                        noSyntheticText: true
                    }
                };
            }
        };

        const result = await media.execute({
            attachments: [{
                name: "brief.docx",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                artifact: ".jarvis-artifacts/uploads/brief.docx",
                sha256: "a".repeat(64)
            }],
            questions: ["¿Cuál es el objetivo comercial?"]
        }, {
            rawInput: "Analiza brief.docx y dime el objetivo comercial.",
            objectiveId: "OBJ-DOC-ANALYSIS",
            caseId: "CASE-DOC-ANALYSIS",
            authorityId: "HEBERTO_MENDOZA",
            controllerId: "CODEX_SIA7"
        });

        assert.equal(bridgeCalls, 1);
        assert.equal(result.ok, true);
        assert.equal(result.status, "LOCAL_DOCUMENT_ANALYSIS_READY");
        assert.equal(result.analyzedFiles, 1);
        assert.equal(result.sources.length, 1);
        assert.equal(result.sources[0].sourceId, "SOURCE_1");
        assert.equal(result.sources[0].fileName, "brief.docx");
        assert.equal(result.sources[0].sha256, "a".repeat(64));
        assert.match(result.sources[0].extractedText, /captar clientes verificados/);
        assert.ok(result.sources[0].visibleData.some(item =>
            item.legibility === "VERIFIED" &&
            item.confidence === 1 &&
            /Objetivo comercial/.test(item.value)
        ));
        assert.equal(result.sources[0].coverage.exhaustive, true);
        assert.equal(result.sources[0].coverage.mayClaimAllPhysicalPages, false);
        assert.equal(result.policy.localDigitalDocumentExtraction, true);
        assert.equal(result.policy.unverifiedLiteralValuesAreWithheld, true);
    }
    finally {
        globalThis.JarvisLocalBridge = originalBridge;
        globalThis.auth = originalAuth;
    }
});

test("media.analyze rejects a local extraction whose SHA differs from the uploaded attachment", async () => {
    const { runtime, definitions } = runtimeHarness();
    registerJarvisMultifunctionTools(runtime);
    const media = definitions.get("media.analyze");
    const originalBridge = globalThis.JarvisLocalBridge;
    try {
        globalThis.JarvisLocalBridge = {
            async requestJson() {
                return {
                    ok: true,
                    status: "DOCUMENT_EXTRACTION_READY",
                    version: "1.0.0-source-scoped-office-extraction",
                    sourceName: "datos.xlsx",
                    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    sha256: "b".repeat(64),
                    documentType: "xlsx",
                    coverageUnit: "worksheet",
                    pages: [{ pageNumber: 1, label: "Hoja1", text: "Dato\t1", tables: [], images: [], regions: [], confidence: 1 }],
                    metadata: { physicalPageCountKnown: false, exhaustiveLogicalExtraction: true }
                };
            }
        };
        const result = await media.execute({
            attachments: [{
                name: "datos.xlsx",
                mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                artifact: ".jarvis-artifacts/uploads/datos.xlsx",
                sha256: "a".repeat(64)
            }]
        }, {
            rawInput: "Analiza datos.xlsx.",
            objectiveId: "OBJ-HASH-MISMATCH"
        });

        assert.equal(result.ok, false);
        assert.equal(result.status, "DOCUMENT_ANALYSIS_SOURCE_HASH_MISMATCH");
        assert.equal(result.expectedSha256, "a".repeat(64));
        assert.equal(result.receivedSha256, "b".repeat(64));
    }
    finally {
        globalThis.JarvisLocalBridge = originalBridge;
    }
});
