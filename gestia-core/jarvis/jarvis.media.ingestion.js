const VERSION = "1.0.0-sia7-media-ingestion";

const SUPPORTED_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "video/mp4",
    "video/x-m4v",
    "video/webm",
    "video/quicktime",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/x-m4a",
    "audio/webm",
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
]);

function clean(value, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function confidence(value) {
    if (!Number.isFinite(Number(value))) return null;
    return Math.max(0, Math.min(1, Number(value)));
}

function normalizePages(pages = []) {
    if (!Array.isArray(pages)) return [];

    return pages.map((page, index) => ({
        pageNumber: Number.isFinite(page?.pageNumber) ? page.pageNumber : index + 1,
        text: clean(page?.text),
        tables: Array.isArray(page?.tables) ? page.tables : [],
        images: Array.isArray(page?.images) ? page.images : [],
        regions: Array.isArray(page?.regions) ? page.regions : [],
        confidence: confidence(page?.confidence)
    }));
}

function pageHasAnalyzableEvidence(page = {}) {
    return Boolean(
        clean(page?.text) ||
        (Array.isArray(page?.tables) && page.tables.length) ||
        (Array.isArray(page?.images) && page.images.length) ||
        (Array.isArray(page?.regions) && page.regions.length)
    );
}

function buildCoverage(record = {}) {
    if (record?.mediaType === "video" || record?.mediaType === "audio") {
        const temporal = record?.extraction?.temporal || {};
        const samples = Array.isArray(temporal.samples) ? temporal.samples : [];
        const durationSeconds = Number(temporal.durationSeconds || 0);
        const semanticVisualAnalysisVerified =
            record.mediaType === "audio" || temporal.semanticVisualAnalysisVerified === true;
        const transcriptionVerified =
            !temporal.audio || temporal.transcriptionVerified === true;
        const exhaustive =
            durationSeconds > 0 &&
            semanticVisualAnalysisVerified &&
            transcriptionVerified;
        return {
            coverageUnit: "timeline",
            expectedPages: 0,
            analyzedPages: 0,
            analyzedPageNumbers: [],
            unreadablePageNumbers: [],
            lowConfidencePageNumbers: [],
            physicalPageCountKnown: false,
            embeddedImagesRequireVisualAnalysis: false,
            durationSeconds,
            sampledTimestamps: samples.map(sample => Number(sample?.timestampSeconds || 0)),
            sampledFrames: samples.length,
            mediaMetadataVerified: durationSeconds > 0,
            semanticVisualAnalysisVerified,
            transcriptionVerified,
            exhaustive,
            mayClaimFullDocumentCoverage: false,
            mayClaimAllPhysicalPages: false,
            mayClaimFullTemporalCoverage: exhaustive
        };
    }
    const pages = Array.isArray(record?.extraction?.pages)
        ? record.extraction.pages
        : [];
    const expectedPages = Number(record?.extraction?.metadata?.pageCount || pages.length || 0);
    const coverageUnit = clean(record?.extraction?.metadata?.coverageUnit, "page");
    const physicalPageCountKnown =
        record?.extraction?.metadata?.physicalPageCountKnown !== false;
    const embeddedImagesRequireVisualAnalysis =
        record?.extraction?.metadata?.embeddedImagesRequireVisualAnalysis === true;
    const analyzed = pages.filter(pageHasAnalyzableEvidence);
    const analyzedPageNumbers = analyzed.map(page => page.pageNumber);
    const unreadablePageNumbers = pages
        .filter(page => !pageHasAnalyzableEvidence(page))
        .map(page => page.pageNumber);
    const lowConfidencePageNumbers = pages
        .filter(page => page.confidence != null && page.confidence < 0.8)
        .map(page => page.pageNumber);
    const exhaustive =
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
    };
}

function claimText(item = null) {
    if (typeof item === "string") return clean(item);
    if (!item || typeof item !== "object") return "";
    return clean(
        item.claim ||
        item.text ||
        item.value ||
        item.finding ||
        item.statement ||
        item.description
    );
}

function normalizeClaimProvenance(item, index, record = {}, type = "evidence") {
    const pages = Array.isArray(record?.extraction?.pages)
        ? record.extraction.pages
        : [];
    const pageCount = pages.length;
    const structured = Boolean(item && typeof item === "object" && !Array.isArray(item));
    const requestedPage = structured
        ? Number(item.pageNumber ?? item.page)
        : NaN;
    const pageNumber = Number.isFinite(requestedPage)
        ? requestedPage
        : pageCount === 1
            ? pages[0]?.pageNumber || 1
            : null;
    const pageExists = pageNumber != null && pages.some(page => page.pageNumber === pageNumber);
    const timestampSeconds = structured && Number.isFinite(Number(item.timestampSeconds))
        ? Number(item.timestampSeconds)
        : null;
    const temporalLocatorExists =
        timestampSeconds != null &&
        timestampSeconds >= 0 &&
        timestampSeconds <= Number(record?.extraction?.temporal?.durationSeconds || 0);
    const locator = structured
        ? item.region || item.locator || item.boundingBox || item.evidence || null
        : null;
    const itemConfidence = structured ? confidence(item.confidence) : null;
    const claim = claimText(item);
    const sourceId = record?.trace?.sourceId || "";
    const sourceName = record?.trace?.sourceName || "";
    const explicitlyVerified = structured && (
        item.verified === true ||
        String(item.legibility || "").toUpperCase() === "VERIFIED"
    );
    const sourceScoped = Boolean(sourceId && (pageExists || temporalLocatorExists));

    return {
        id: `${sourceId || "SOURCE"}:${type}:${index + 1}`,
        type,
        claim,
        sourceId,
        sourceName,
        sha256: record?.trace?.sha256 || "",
        pageNumber,
        timestampSeconds,
        locator,
        confidence: itemConfidence,
        structured,
        sourceScoped,
        verified: Boolean(claim && sourceScoped && explicitlyVerified),
        status: !claim
            ? "EMPTY_CLAIM"
            : !structured
                ? "UNSTRUCTURED_CLAIM_REQUIRES_EVIDENCE"
                : !sourceScoped
                    ? "SOURCE_SCOPE_REQUIRED"
                    : explicitlyVerified
                        ? "SOURCE_SCOPED_VERIFIED"
                        : "SOURCE_SCOPED_UNVERIFIED"
    };
}

function buildClaimIntegrity(record = {}, findings = [], evidence = []) {
    const findingProvenance = findings.map((item, index) =>
        normalizeClaimProvenance(item, index, record, "finding")
    );
    const evidenceProvenance = evidence.map((item, index) =>
        normalizeClaimProvenance(item, index, record, "evidence")
    );
    const all = [...findingProvenance, ...evidenceProvenance];
    return {
        findings: findingProvenance,
        evidence: evidenceProvenance,
        totalClaims: all.length,
        sourceScopedClaims: all.filter(item => item.sourceScoped).length,
        verifiedClaims: all.filter(item => item.verified).length,
        unstructuredClaims: all.filter(item => !item.structured).length,
        unsupportedClaims: all.filter(item => !item.verified).length
    };
}

export function createMediaIngestionRecord(input = {}, authority = {}) {
    const objectiveId = clean(authority.objectiveId);
    const instruction = clean(authority.instruction);
    const mimeType = clean(input.mimeType).toLowerCase();

    if (!objectiveId) throw new Error("OBJECTIVE_ID_REQUIRED");
    if (!instruction) throw new Error("INSTRUCTION_REQUIRED");
    if (!SUPPORTED_TYPES.has(mimeType)) throw new Error("UNSUPPORTED_MEDIA_TYPE");

    const pages = normalizePages(input.pages);
    const mediaType = mimeType === "application/pdf"
        ? "pdf"
        : mimeType.startsWith("image/")
            ? "image"
            : mimeType.startsWith("video/")
                ? "video"
                : mimeType.startsWith("audio/")
                    ? "audio"
                    : "document";
    const sha256 = /^[a-f0-9]{64}$/i.test(clean(input.sha256))
        ? clean(input.sha256).toLowerCase()
        : "";

    return {
        ok: true,
        engine: "jarvis_media_ingestion",
        version: VERSION,
        trace: {
            objectiveId,
            authorityId: clean(authority.authorityId, "HEBERTO_MENDOZA"),
            controllerId: clean(authority.controllerId, "CODEX_SIA7"),
            instruction,
            sourceId: clean(input.sourceId, `MEDIA-${Date.now()}`),
            sourceName: clean(input.sourceName, "unnamed-media"),
            mimeType,
            sha256,
            ingestedAt: Date.now()
        },
        mediaType,
        extraction: {
            pages,
            temporal: mediaType === "video" || mediaType === "audio"
                ? {
                    durationSeconds: Number(input?.temporal?.durationSeconds || 0),
                    container: clean(input?.temporal?.container),
                    video: input?.temporal?.video || null,
                    audio: input?.temporal?.audio || null,
                    samples: Array.isArray(input?.temporal?.samples)
                        ? input.temporal.samples
                        : [],
                    audioEvidence: input?.temporal?.audioEvidence || null,
                    transcript: Array.isArray(input?.temporal?.transcript)
                        ? input.temporal.transcript
                        : [],
                    semanticVisualAnalysisVerified:
                        input?.temporal?.semanticVisualAnalysisVerified === true,
                    transcriptionVerified:
                        input?.temporal?.transcriptionVerified === true
                }
                : null,
            fullText: pages.map(page => page.text).filter(Boolean).join("\n\n"),
            tables: pages.flatMap(page => page.tables),
            images: pages.flatMap(page => page.images),
            regions: pages.flatMap(page => page.regions),
            metadata: {
                pageCount: pages.length,
                language: clean(input.language, "unknown"),
                extractor: clean(input.extractor, "external_adapter_required"),
                coverageUnit: clean(input.coverageUnit, "page"),
                physicalPageCountKnown: input.physicalPageCountKnown !== false,
                embeddedImagesRequireVisualAnalysis:
                    input.embeddedImagesRequireVisualAnalysis === true
            }
        },
        context: {
            title: clean(input.title, clean(input.sourceName, "Documento sin titulo")),
            summary: clean(input.summary),
            entities: Array.isArray(input.entities) ? input.entities : [],
            tags: Array.isArray(input.tags) ? input.tags : [],
            parentObjectiveId: objectiveId
        },
        policy: {
            readOnly: true,
            destructiveActionAllowed: false,
            externalPublishAllowed: false,
            writeAllowed: false,
            requiresHumanApprovalForDerivedAction: true,
            preserveSourceTrace: true,
            sourceScopedClaimsRequired: true,
            exhaustiveCoverageMayOnlyBeClaimedWhenComplete: true,
            negativeClaimsRequireExplicitStructuredEvidence: true
        }
    };
}

export function buildMediaAnalysis(record, input = {}) {
    if (!record?.trace?.objectiveId || !record?.extraction) {
        return { ok: false, reason: "INGESTION_RECORD_REQUIRED" };
    }

    const requestedQuestions = Array.isArray(input.questions) ? input.questions : [];
    const findings = Array.isArray(input.findings) ? input.findings : [];
    const evidence = Array.isArray(input.evidence) ? input.evidence : [];
    const coverage = buildCoverage(record);
    const claimIntegrity = buildClaimIntegrity(record, findings, evidence);

    return {
        ok: true,
        engine: "jarvis_media_analysis",
        version: VERSION,
        trace: {
            objectiveId: record.trace.objectiveId,
            authorityId: record.trace.authorityId,
            controllerId: record.trace.controllerId,
            sourceId: record.trace.sourceId,
            sourceName: record.trace.sourceName,
            sha256: record.trace.sha256 || "",
            analyzedAt: Date.now()
        },
        source: {
            sourceId: record.trace.sourceId,
            mediaType: record.mediaType,
            mimeType: record.trace.mimeType,
            sourceName: record.trace.sourceName,
            sha256: record.trace.sha256 || "",
            pageCount: record.extraction.metadata.pageCount
        },
        analysis: {
            questions: requestedQuestions,
            extractedText: record.extraction.fullText,
            tables: record.extraction.tables,
            images: record.extraction.images,
            regions: record.extraction.regions || [],
            temporal: record.extraction.temporal || null,
            summary: clean(input.summary, record.context.summary),
            findings,
            evidence,
            coverage,
            claimIntegrity
        },
        policy: {
            advisoryOnly: true,
            mayReplaceInstruction: false,
            mayAuthorizeWrite: false,
            mayAuthorizeDeploy: false,
            sourceScopedClaimsRequired: true,
            unstructuredClaimsAreNotVerified: true,
            exhaustiveCoverageMayOnlyBeClaimedWhenComplete: true,
            mayClaimFullDocumentCoverage: coverage.mayClaimFullDocumentCoverage,
            mayClaimAllPhysicalPages: coverage.mayClaimAllPhysicalPages,
            physicalPageCountKnown: coverage.physicalPageCountKnown,
            embeddedImagesRequireVisualAnalysis:
                coverage.embeddedImagesRequireVisualAnalysis,
            negativeClaimsRequireExplicitStructuredEvidence: true,
            verifiedClaimCount: claimIntegrity.verifiedClaims,
            unsupportedClaimCount: claimIntegrity.unsupportedClaims
        }
    };
}

export function describeMediaIngestion() {
    return {
        ok: true,
        version: VERSION,
        supportedTypes: [...SUPPORTED_TYPES],
        capabilities: [
            "pdf_text_structure",
            "image_context_structure",
            "video_timeline_physical_evidence",
            "audio_track_physical_evidence",
            "temporal_semantic_blind_spot_guard",
            "transcription_blind_spot_guard",
            "table_and_image_evidence",
            "source_traceability",
            "source_scoped_claim_provenance",
            "page_coverage_accounting",
            "fail_closed_full_document_claims",
            "office_and_text_document_structure",
            "physical_page_claim_guard",
            "embedded_media_blind_spot_guard",
            "approval_bound_derived_actions"
        ]
    };
}

export const __test = {
    confidence,
    normalizePages,
    pageHasAnalyzableEvidence,
    buildCoverage,
    normalizeClaimProvenance,
    buildClaimIntegrity
};
