from pathlib import Path
import json


def replace_once(path, old, new):
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ANCHOR_COUNT:{path}:{count}:{old[:80]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# 1) Bridge: expose the existing artifact bytes through a read-only structured document extractor.
replace_once(
    "jarvis-fs-bridge.js",
    'import { verifyPdfVisualChanges } from "./jarvis-pdf-visual.js";\n\nexport const JARVIS_FS_BRIDGE_VERSION =\n    "2.34.0-pdf-safe-placement";',
    'import { verifyPdfVisualChanges } from "./jarvis-pdf-visual.js";\nimport {\n    extractJarvisDocumentArtifact\n} from "./jarvis-document-extractor.js";\n\nexport const JARVIS_FS_BRIDGE_VERSION =\n    "2.35.0-read-only-document-extraction";'
)

artifact_read = '''    app.post("/artifact/read", (req, res) => {
        try {
            const payload = readArtifactPayload({ output: req.body?.output, root });
            return res.json({
                ...payload,
                artifact: findArtifact({ root, output: payload.output }),
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(error.message === "ARTIFACT_NOT_FOUND" ? 404 : 400).json({
                ok: false,
                status: "ARTIFACT_READ_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

'''
artifact_extract = artifact_read + '''    app.post("/artifact/extract", async (req, res) => {
        try {
            const extracted = await extractJarvisDocumentArtifact({
                output: req.body?.output,
                sourceName: req.body?.sourceName,
                mimeType: req.body?.mimeType,
                root
            });
            return res.status(extracted?.ok === true ? 200 : 415).json({
                ...extracted,
                bridgeVersion: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            const notFound = error?.message === "ARTIFACT_NOT_FOUND";
            return res.status(notFound ? 404 : 400).json({
                ok: false,
                status: "DOCUMENT_EXTRACTION_FAILED",
                error: error?.message || String(error),
                bridgeVersion: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

'''
replace_once("jarvis-fs-bridge.js", artifact_read, artifact_extract)


# 2) Extraction coverage: embedded media stays explicitly unresolved until visual analysis occurs.
replace_once(
    "jarvis-document-extractor.js",
    '''    const archive = await JSZip.loadAsync(buffer, {
        checkCRC32: true,
        createFolders: false
    });
    const documentEntry = archive.file("word/document.xml");''',
    '''    const archive = await JSZip.loadAsync(buffer, {
        checkCRC32: true,
        createFolders: false
    });
    const embeddedImageCount = Object.keys(archive.files)
        .filter(name => /^word\\/media\\/[^/]+$/i.test(name)).length;
    const documentEntry = archive.file("word/document.xml");'''
)
replace_once(
    "jarvis-document-extractor.js",
    '''            secondaryParts: secondaryText.map(item => item.part),
            extractionScope: "visible-wordprocessingml-body-plus-notes"
        }
    };
}''',
    '''            secondaryParts: secondaryText.map(item => item.part),
            embeddedImageCount,
            embeddedImagesRequireVisualAnalysis: embeddedImageCount > 0,
            extractionScope: "visible-wordprocessingml-body-plus-notes"
        }
    };
}'''
)
replace_once(
    "jarvis-document-extractor.js",
    '''    const archive = await JSZip.loadAsync(buffer, {
        checkCRC32: true,
        createFolders: false
    });
    const presentationEntry = archive.file("ppt/presentation.xml");''',
    '''    const archive = await JSZip.loadAsync(buffer, {
        checkCRC32: true,
        createFolders: false
    });
    const embeddedImageCount = Object.keys(archive.files)
        .filter(name => /^ppt\\/media\\/[^/]+$/i.test(name)).length;
    const presentationEntry = archive.file("ppt/presentation.xml");'''
)
replace_once(
    "jarvis-document-extractor.js",
    '''            physicalPageCountKnown: true,
            extractionScope: "ordered-visible-slide-text-and-tables"
        }
    };
}''',
    '''            physicalPageCountKnown: true,
            embeddedImageCount,
            embeddedImagesRequireVisualAnalysis: embeddedImageCount > 0,
            extractionScope: "ordered-visible-slide-text-and-tables"
        }
    };
}'''
)
replace_once(
    "jarvis-document-extractor.js",
    '''    await workbook.xlsx.load(buffer);
    if (!workbook.worksheets.length) throw new Error("XLSX_WORKSHEETS_MISSING");

    const pages = workbook.worksheets.map((worksheet, sheetIndex) => {''',
    '''    await workbook.xlsx.load(buffer);
    if (!workbook.worksheets.length) throw new Error("XLSX_WORKSHEETS_MISSING");
    const embeddedImageCount = Array.isArray(workbook.media)
        ? workbook.media.length
        : 0;

    const pages = workbook.worksheets.map((worksheet, sheetIndex) => {'''
)
replace_once(
    "jarvis-document-extractor.js",
    '''            worksheetNames: pages.map(page => page.label),
            extractionScope: "all-used-worksheet-cells-with-formulas-and-results"
        }
    };
}''',
    '''            worksheetNames: pages.map(page => page.label),
            embeddedImageCount,
            embeddedImagesRequireVisualAnalysis: embeddedImageCount > 0,
            extractionScope: "all-used-worksheet-cells-with-formulas-and-results"
        }
    };
}'''
)
replace_once(
    "jarvis-document-extractor.js",
    '''            analyzableParts,
            exhaustiveLogicalExtraction: pages.length > 0 && analyzableParts === pages.length
        },
        policy: {
            sourceBytesHashed: true,
            sourceScoped: true,
            noSyntheticText: true,
            physicalPageClaimsRequirePhysicalPageCount: true,
            unreadablePartsRemainUnknown: true
        }''',
    '''            analyzableParts,
            exhaustiveLogicalExtraction:
                pages.length > 0 &&
                analyzableParts === pages.length &&
                extraction.metadata?.embeddedImagesRequireVisualAnalysis !== true
        },
        policy: {
            sourceBytesHashed: true,
            sourceScoped: true,
            noSyntheticText: true,
            physicalPageClaimsRequirePhysicalPageCount: true,
            unreadablePartsRemainUnknown: true,
            embeddedImagesRequireVisualAnalysis:
                extraction.metadata?.embeddedImagesRequireVisualAnalysis === true
        }'''
)


# 3) Media ingestion accepts digitally extracted office/text sources while preserving physical-page limits.
replace_once(
    "gestia-core/jarvis/jarvis.media.ingestion.js",
    '''const SUPPORTED_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp"
]);''',
    '''const SUPPORTED_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/yaml",
    "application/json",
    "application/xml",
    "text/xml",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);'''
)
replace_once(
    "gestia-core/jarvis/jarvis.media.ingestion.js",
    '''    const expectedPages = Number(record?.extraction?.metadata?.pageCount || pages.length || 0);
    const analyzed = pages.filter(pageHasAnalyzableEvidence);''',
    '''    const expectedPages = Number(record?.extraction?.metadata?.pageCount || pages.length || 0);
    const coverageUnit = clean(record?.extraction?.metadata?.coverageUnit, "page");
    const physicalPageCountKnown =
        record?.extraction?.metadata?.physicalPageCountKnown !== false;
    const embeddedImagesRequireVisualAnalysis =
        record?.extraction?.metadata?.embeddedImagesRequireVisualAnalysis === true;
    const analyzed = pages.filter(pageHasAnalyzableEvidence);'''
)
replace_once(
    "gestia-core/jarvis/jarvis.media.ingestion.js",
    '''    const exhaustive = expectedPages > 0 && analyzed.length === expectedPages;

    return {
        expectedPages,
        analyzedPages: analyzed.length,
        analyzedPageNumbers,
        unreadablePageNumbers,
        lowConfidencePageNumbers,
        exhaustive,
        mayClaimFullDocumentCoverage: exhaustive && unreadablePageNumbers.length === 0
    };''',
    '''    const exhaustive =
        expectedPages > 0 &&
        analyzed.length === expectedPages &&
        embeddedImagesRequireVisualAnalysis !== true;

    return {
        coverageUnit,
        expectedPages,
        analyzedPages: analyzed.length,
        analyzedPageNumbers,
        unreadablePageNumbers,
        lowConfidencePageNumbers,
        physicalPageCountKnown,
        embeddedImagesRequireVisualAnalysis,
        exhaustive,
        mayClaimFullDocumentCoverage:
            exhaustive && unreadablePageNumbers.length === 0,
        mayClaimAllPhysicalPages:
            physicalPageCountKnown &&
            exhaustive &&
            unreadablePageNumbers.length === 0
    };'''
)
replace_once(
    "gestia-core/jarvis/jarvis.media.ingestion.js",
    '''    const mediaType = mimeType === "application/pdf" ? "pdf" : "image";''',
    '''    const mediaType = mimeType === "application/pdf"
        ? "pdf"
        : mimeType.startsWith("image/")
            ? "image"
            : "document";'''
)
replace_once(
    "gestia-core/jarvis/jarvis.media.ingestion.js",
    '''                pageCount: pages.length,
                language: clean(input.language, "unknown"),
                extractor: clean(input.extractor, "external_adapter_required")''',
    '''                pageCount: pages.length,
                language: clean(input.language, "unknown"),
                extractor: clean(input.extractor, "external_adapter_required"),
                coverageUnit: clean(input.coverageUnit, "page"),
                physicalPageCountKnown: input.physicalPageCountKnown !== false,
                embeddedImagesRequireVisualAnalysis:
                    input.embeddedImagesRequireVisualAnalysis === true'''
)
replace_once(
    "gestia-core/jarvis/jarvis.media.ingestion.js",
    '''            mayClaimFullDocumentCoverage: coverage.mayClaimFullDocumentCoverage,
            negativeClaimsRequireExplicitStructuredEvidence: true,''',
    '''            mayClaimFullDocumentCoverage: coverage.mayClaimFullDocumentCoverage,
            mayClaimAllPhysicalPages: coverage.mayClaimAllPhysicalPages,
            physicalPageCountKnown: coverage.physicalPageCountKnown,
            embeddedImagesRequireVisualAnalysis:
                coverage.embeddedImagesRequireVisualAnalysis,
            negativeClaimsRequireExplicitStructuredEvidence: true,'''
)
replace_once(
    "gestia-core/jarvis/jarvis.media.ingestion.js",
    '''            "fail_closed_full_document_claims",
            "approval_bound_derived_actions"''',
    '''            "fail_closed_full_document_claims",
            "office_and_text_document_structure",
            "physical_page_claim_guard",
            "embedded_media_blind_spot_guard",
            "approval_bound_derived_actions"'''
)


# 4) Multifunction media tool: local exact document extraction, cloud visual double-pass, hybrid source set.
insert_anchor = '''function attachmentsFromInstruction(value = "") {
    const marker = "Archivos adjuntos reales entregados por el usuario:";
    const source = String(value || "");
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) return [];
    const jsonText = source.slice(markerIndex + marker.length).trim();
    try {
        const attachments = JSON.parse(jsonText);
        return Array.isArray(attachments) ? attachments.slice(0, 30) : [];
    } catch {
        return [];
    }
}

'''
helpers = insert_anchor + r'''const CLOUD_VISUAL_MIME_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp"
]);
const LOCAL_DOCUMENT_EXTENSIONS = new Set([
    ".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml",
    ".pdf", ".docx", ".xlsx", ".pptx",
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".html",
    ".py", ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".sql"
]);

function attachmentExtension(attachment = {}) {
    const name = String(attachment?.name || attachment?.artifact || "")
        .trim()
        .toLowerCase()
        .split(/[?#]/)[0];
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot) : "";
}

function isCloudVisualAttachment(attachment = {}) {
    return CLOUD_VISUAL_MIME_TYPES.has(
        String(attachment?.mimeType || "").trim().toLowerCase()
    );
}

function isLocalDocumentAttachment(attachment = {}) {
    return LOCAL_DOCUMENT_EXTENSIONS.has(attachmentExtension(attachment));
}

function exactDocumentTextChunks(value = "", maxChars = 3500) {
    const text = String(value || "");
    if (!text.trim()) return [];
    const chunks = [];
    let cursor = 0;
    while (cursor < text.length) {
        let end = Math.min(text.length, cursor + maxChars);
        if (end < text.length) {
            const newline = text.lastIndexOf("\n", end);
            const space = text.lastIndexOf(" ", end);
            const boundary = Math.max(newline, space);
            if (boundary > cursor + Math.floor(maxChars * 0.65)) {
                end = boundary;
            }
        }
        chunks.push(text.slice(cursor, end));
        cursor = end;
        while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    }
    return chunks.filter(chunk => chunk.trim());
}

async function fetchLocalDocumentAnalysis(
    attachments = [],
    question = "",
    authority = {}
) {
    if (typeof globalThis?.JarvisLocalBridge?.requestJson !== "function") {
        return {
            ok: false,
            status: "LOCAL_BRIDGE_REQUIRED",
            error: "LOCAL_BRIDGE_REQUIRED"
        };
    }
    const sources = [];
    for (let subsetIndex = 0; subsetIndex < attachments.length; subsetIndex += 1) {
        const attachment = attachments[subsetIndex];
        const sourceIndex = Number.isInteger(attachment?.__sourceIndex)
            ? attachment.__sourceIndex
            : subsetIndex;
        let extracted;
        try {
            extracted = await globalThis.JarvisLocalBridge.requestJson(
                "/artifact/extract",
                {
                    output: attachment?.artifact,
                    sourceName: attachment?.name,
                    mimeType: attachment?.mimeType
                },
                { timeoutMs: 60000 }
            );
        }
        catch(error) {
            return {
                ok: false,
                status: "DOCUMENT_ANALYSIS_EXTRACTION_FAILED",
                error: error?.message || "DOCUMENT_ANALYSIS_EXTRACTION_FAILED",
                fileName: attachment?.name || "archivo"
            };
        }
        if (extracted?.ok !== true || !Array.isArray(extracted?.pages)) {
            return {
                ok: false,
                status: extracted?.status || "DOCUMENT_ANALYSIS_EXTRACTION_FAILED",
                error: extracted?.error || "DOCUMENT_ANALYSIS_EXTRACTION_FAILED",
                fileName: attachment?.name || "archivo"
            };
        }
        const expectedSha256 = String(attachment?.sha256 || "").trim().toLowerCase();
        const receivedSha256 = String(extracted?.sha256 || "").trim().toLowerCase();
        if (
            !receivedSha256 ||
            (expectedSha256 && receivedSha256 !== expectedSha256)
        ) {
            return {
                ok: false,
                status: "DOCUMENT_ANALYSIS_SOURCE_HASH_MISMATCH",
                error: "DOCUMENT_ANALYSIS_SOURCE_HASH_MISMATCH",
                fileName: attachment?.name || extracted?.sourceName || "archivo",
                expectedSha256: expectedSha256 || null,
                receivedSha256: receivedSha256 || null
            };
        }
        const sourceId = `SOURCE_${sourceIndex + 1}`;
        const record = createMediaIngestionRecord(
            {
                sourceId,
                sourceName: extracted.sourceName || attachment?.name || "archivo",
                mimeType: extracted.mimeType,
                sha256: receivedSha256,
                pages: extracted.pages,
                extractor: `jarvis_document_extractor:${extracted.version || "unknown"}`,
                coverageUnit: extracted.coverageUnit || "document",
                physicalPageCountKnown:
                    extracted?.metadata?.physicalPageCountKnown !== false,
                embeddedImagesRequireVisualAnalysis:
                    extracted?.metadata?.embeddedImagesRequireVisualAnalysis === true
            },
            authority
        );
        const analysis = buildMediaAnalysis(
            record,
            {
                questions: [question].filter(Boolean)
            }
        );
        const visibleData = extracted.pages.flatMap((page, pageIndex) =>
            exactDocumentTextChunks(page?.text || "").map((value, chunkIndex) => ({
                kind: "document_text",
                value,
                evidence: [
                    "DIGITAL_SOURCE_EXTRACTION",
                    extracted.coverageUnit || "document",
                    String(page?.label || page?.pageNumber || pageIndex + 1),
                    `chunk_${chunkIndex + 1}`
                ].join(":"),
                confidence: 1,
                legibility: "VERIFIED",
                pageNumber: Number(page?.pageNumber || pageIndex + 1),
                sourceId
            }))
        );
        const uncertainty = [];
        if (analysis?.analysis?.coverage?.exhaustive !== true) {
            uncertainty.push(
                "La extracción no cubrió de forma verificable todas las unidades lógicas del documento."
            );
        }
        if (extracted?.metadata?.embeddedImagesRequireVisualAnalysis === true) {
            uncertainty.push(
                `El documento contiene ${Number(extracted?.metadata?.embeddedImageCount || 0)} imagen(es) incrustada(s) cuyo contenido visual requiere análisis independiente.`
            );
        }
        sources.push({
            sourceId,
            sourceOrder: sourceIndex,
            fileName: extracted.sourceName || attachment?.name || "archivo",
            name: extracted.sourceName || attachment?.name || "archivo",
            mimeType: extracted.mimeType,
            sha256: receivedSha256,
            documentType: extracted.documentType || "document",
            coverageUnit: extracted.coverageUnit || "document",
            pageCount: extracted.pages.length,
            pages: extracted.pages,
            extractedText: analysis?.analysis?.extractedText || "",
            tables: analysis?.analysis?.tables || [],
            visibleData,
            evidence: visibleData.map(item => ({
                sourceId,
                pageNumber: item.pageNumber,
                evidence: item.evidence,
                value: item.value,
                confidence: item.confidence,
                legibility: item.legibility
            })),
            observations: [],
            inferences: [],
            description: "",
            composition: [],
            objects: [],
            marketingUse: [],
            quality: {
                digitalExtraction: true,
                sourceHashVerified: true,
                extractionVersion: extracted.version || null
            },
            uncertainty,
            coverage: analysis?.analysis?.coverage || null,
            claimIntegrity: analysis?.analysis?.claimIntegrity || null,
            strictVisualOnly: false
        });
    }
    const sortedSources = sources.sort((left, right) =>
        Number(left.sourceOrder || 0) - Number(right.sourceOrder || 0)
    );
    return {
        ok: true,
        objectiveSatisfied: true,
        status: "LOCAL_DOCUMENT_ANALYSIS_READY",
        source: "JARVIS_LOCAL_DIGITAL_DOCUMENT_ANALYSIS",
        version: "1.0.0-source-scoped-digital-document-analysis",
        strictVisualOnly: false,
        sources: sortedSources,
        sourceManifest: sortedSources.map(source => ({
            sourceId: source.sourceId,
            fileName: source.fileName,
            sha256: source.sha256,
            mimeType: source.mimeType,
            coverageUnit: source.coverageUnit,
            coverage: source.coverage
        })),
        comparison: { differences: [] },
        recommendations: [],
        verifiedVisualClaims: sortedSources.flatMap(source => source.visibleData),
        precisionAudit: {
            ok: true,
            status: "LOCAL_DIGITAL_EXTRACTION_VERIFIED",
            sourceIdentityVerified: true,
            sha256Verified: true,
            digitalSourceExtraction: true,
            visualClaimsSynthesized: false
        },
        policy: {
            literalReadingsRequireStructuredEvidence: true,
            unverifiedLiteralValuesAreWithheld: true,
            sourceNarrativeClaimsRequireStructuredEvidence: true,
            negativeVisualClaimsRequireStructuredEvidence: true,
            localDigitalDocumentExtraction: true,
            physicalPageClaimsRequireKnownPagination: true,
            embeddedImagesRequireIndependentVisualAnalysis: true
        }
    };
}

function remapCloudMediaSources(result = {}, attachments = []) {
    const sourceIdMap = new Map(
        attachments.map((attachment, subsetIndex) => [
            `SOURCE_${subsetIndex + 1}`,
            `SOURCE_${Number.isInteger(attachment?.__sourceIndex) ? attachment.__sourceIndex + 1 : subsetIndex + 1}`
        ])
    );
    const sources = (Array.isArray(result?.sources) ? result.sources : [])
        .map((source, subsetIndex) => ({
            ...source,
            sourceId: sourceIdMap.get(String(source?.sourceId || "")) ||
                `SOURCE_${Number.isInteger(attachments[subsetIndex]?.__sourceIndex)
                    ? attachments[subsetIndex].__sourceIndex + 1
                    : subsetIndex + 1}`,
            sourceOrder: Number.isInteger(attachments[subsetIndex]?.__sourceIndex)
                ? attachments[subsetIndex].__sourceIndex
                : subsetIndex
        }));
    return {
        ...result,
        sources,
        sourceManifest: sources.map(source => ({
            sourceId: source.sourceId,
            fileName: source.fileName || source.name,
            sha256: source.sha256,
            mimeType: source.mimeType || null
        })),
        verifiedVisualClaims: (Array.isArray(result?.verifiedVisualClaims)
            ? result.verifiedVisualClaims
            : []).map(item => ({
                ...item,
                sourceId: sourceIdMap.get(String(item?.sourceId || "")) || item?.sourceId
            }))
    };
}

function mergeHybridMediaDocumentAnalysis(localResult, cloudResult) {
    const sources = [
        ...(Array.isArray(localResult?.sources) ? localResult.sources : []),
        ...(Array.isArray(cloudResult?.sources) ? cloudResult.sources : [])
    ].sort((left, right) =>
        Number(left?.sourceOrder || 0) - Number(right?.sourceOrder || 0)
    );
    return {
        ok: true,
        objectiveSatisfied: true,
        status: "HYBRID_MEDIA_DOCUMENT_ANALYSIS_READY",
        source: "JARVIS_HYBRID_VERIFIED_SOURCE_ANALYSIS",
        version: "1.0.0-hybrid-source-analysis",
        strictVisualOnly: false,
        sources,
        sourceManifest: sources.map(source => ({
            sourceId: source.sourceId,
            fileName: source.fileName || source.name,
            sha256: source.sha256,
            mimeType: source.mimeType || null,
            coverage: source.coverage || null
        })),
        comparison: { differences: [] },
        recommendations: [],
        verifiedVisualClaims: [
            ...(Array.isArray(localResult?.verifiedVisualClaims) ? localResult.verifiedVisualClaims : []),
            ...(Array.isArray(cloudResult?.verifiedVisualClaims) ? cloudResult.verifiedVisualClaims : [])
        ],
        precisionAudit: {
            ok: true,
            status: "HYBRID_SOURCE_ANALYSIS_VERIFIED",
            localDigitalExtractionVerified: localResult?.ok === true,
            cloudVisualDoublePassVerified: cloudResult?.precisionAudit?.ok === true,
            sourceIdentityVerified: true,
            sha256Verified: true,
            crossSourceComparisonDeferredToGroundedComposer: true
        },
        policy: {
            ...(cloudResult?.policy || {}),
            ...(localResult?.policy || {}),
            sourceNarrativeClaimsRequireStructuredEvidence: true,
            unverifiedLiteralValuesAreWithheld: true,
            crossSourceComparisonRequiresGroundedComposer: true
        }
    };
}

'''
replace_once("gestia-core/jarvis/jarvis.multitool.pack.js", insert_anchor, helpers)

old_media_block = '''                if (persistedMedia.length > 0) {
                    const grounded = await fetchGroundedMediaAnalysis(
                        persistedMedia,
                        instruction
                    );
                    if (grounded?.ok === true) {
                        return {
                            ...grounded,
                            attachments,
                            ...batchAccounting,
                            analyzedFiles: grounded.sources.length,
                            persistedArtifacts: persistedMedia.map(item => item.artifact)
                        };
                    }
                    if (!Array.isArray(args.pages) || args.pages.length === 0) {
                        return {
                            ok: false,
                            status: grounded?.status || "MEDIA_ANALYSIS_UNAVAILABLE",
                            error: grounded?.error || "MEDIA_ANALYSIS_UNAVAILABLE",
                            message: "Los archivos existen, pero no pude obtener evidencia visual/documental verificable; no inventare su contenido.",
                            attachments,
                            ...batchAccounting
                        };
                    }
                }'''
new_media_block = r'''                if (persistedMedia.length > 0) {
                    const indexedMedia = boundedMedia.map((attachment, index) => ({
                        ...attachment,
                        __sourceIndex: index
                    }));
                    const cloudMedia = indexedMedia.filter(isCloudVisualAttachment);
                    const localDocuments = indexedMedia.filter(attachment =>
                        !isCloudVisualAttachment(attachment) &&
                        isLocalDocumentAttachment(attachment)
                    );
                    const unsupported = indexedMedia.filter(attachment =>
                        !isCloudVisualAttachment(attachment) &&
                        !isLocalDocumentAttachment(attachment)
                    );
                    if (unsupported.length > 0) {
                        return {
                            ok: false,
                            status: "DOCUMENT_ANALYSIS_TYPE_UNSUPPORTED",
                            error: "DOCUMENT_ANALYSIS_TYPE_UNSUPPORTED",
                            message: "El lote contiene formatos que todavía no pueden analizarse con evidencia verificable; no se inventara su contenido.",
                            unsupported: unsupported.map(item => ({
                                name: item?.name || "archivo",
                                mimeType: item?.mimeType || "application/octet-stream"
                            })),
                            attachments,
                            ...batchAccounting
                        };
                    }
                    const authority = resolveAuthority(args, context);
                    let localResult = localDocuments.length > 0
                        ? await fetchLocalDocumentAnalysis(
                            localDocuments,
                            instruction,
                            authority
                        )
                        : null;
                    if (localResult && localResult?.ok !== true) {
                        return {
                            ...localResult,
                            attachments,
                            ...batchAccounting,
                            persistedArtifacts: persistedMedia.map(item => item.artifact)
                        };
                    }
                    let cloudResult = null;
                    if (cloudMedia.length > 0) {
                        cloudResult = await fetchGroundedMediaAnalysis(
                            cloudMedia,
                            instruction
                        );
                        if (cloudResult?.ok === true) {
                            cloudResult = remapCloudMediaSources(cloudResult, cloudMedia);
                        }
                        else if (
                            cloudMedia.every(attachment =>
                                attachmentExtension(attachment) === ".pdf"
                            )
                        ) {
                            const localPdfResult = await fetchLocalDocumentAnalysis(
                                cloudMedia,
                                instruction,
                                authority
                            );
                            if (localPdfResult?.ok !== true) {
                                return {
                                    ...cloudResult,
                                    localFallback: localPdfResult,
                                    attachments,
                                    ...batchAccounting
                                };
                            }
                            localResult = localResult?.ok === true
                                ? mergeHybridMediaDocumentAnalysis(localResult, localPdfResult)
                                : localPdfResult;
                            cloudResult = null;
                        }
                        else {
                            return {
                                ok: false,
                                status: cloudResult?.status || "MEDIA_ANALYSIS_UNAVAILABLE",
                                error: cloudResult?.error || "MEDIA_ANALYSIS_UNAVAILABLE",
                                message: "Los archivos visuales existen, pero no pude obtener evidencia visual verificable; no inventare su contenido.",
                                attachments,
                                ...batchAccounting
                            };
                        }
                    }
                    const verifiedResult = localResult?.ok === true && cloudResult?.ok === true
                        ? mergeHybridMediaDocumentAnalysis(localResult, cloudResult)
                        : localResult?.ok === true
                            ? localResult
                            : cloudResult?.ok === true
                                ? cloudResult
                                : null;
                    if (verifiedResult?.ok === true) {
                        return {
                            ...verifiedResult,
                            attachments,
                            ...batchAccounting,
                            analyzedFiles: verifiedResult.sources.length,
                            persistedArtifacts: persistedMedia.map(item => item.artifact)
                        };
                    }
                    if (!Array.isArray(args.pages) || args.pages.length === 0) {
                        return {
                            ok: false,
                            status: "MEDIA_ANALYSIS_UNAVAILABLE",
                            error: "MEDIA_ANALYSIS_UNAVAILABLE",
                            message: "Los archivos existen, pero no pude obtener evidencia visual/documental verificable; no inventare su contenido.",
                            attachments,
                            ...batchAccounting
                        };
                    }
                }'''
replace_once("gestia-core/jarvis/jarvis.multitool.pack.js", old_media_block, new_media_block)
replace_once(
    "gestia-core/jarvis/jarvis.multitool.pack.js",
    'description: "Analiza texto, tablas e imagenes ya extraidas de PDF, PNG, JPEG o WebP con trazabilidad read-only.",',
    'description: "Analiza PDF e imagenes con doble verificacion visual y extrae de forma read-only DOCX, XLSX, PPTX, TXT, Markdown, CSV, JSON, XML, YAML y codigo textual con hash y trazabilidad por fuente.",'
)


# 5) CI must always execute the new real-artifact extractor and routing contracts.
package_path = Path("package.json")
package = json.loads(package_path.read_text(encoding="utf-8"))
needle = "tests/jarvis-media-ingestion-precision.test.mjs"
addition = "tests/jarvis-document-extractor.test.mjs tests/jarvis-document-analysis-routing.test.mjs"
script = package["scripts"]["test:multifunction"]
if addition not in script:
    if needle not in script:
        raise SystemExit("PACKAGE_MEDIA_PRECISION_TEST_ANCHOR_MISSING")
    script = script.replace(needle, f"{needle} {addition}", 1)
    package["scripts"]["test:multifunction"] = script
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
