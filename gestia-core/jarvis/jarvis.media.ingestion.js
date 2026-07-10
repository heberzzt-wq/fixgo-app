const VERSION = "1.0.0-sia7-media-ingestion";

const SUPPORTED_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp"
]);

function clean(value, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizePages(pages = []) {
    if (!Array.isArray(pages)) return [];

    return pages.map((page, index) => ({
        pageNumber: Number.isFinite(page?.pageNumber) ? page.pageNumber : index + 1,
        text: clean(page?.text),
        tables: Array.isArray(page?.tables) ? page.tables : [],
        images: Array.isArray(page?.images) ? page.images : [],
        confidence: Number.isFinite(page?.confidence) ? page.confidence : null
    }));
}

export function createMediaIngestionRecord(input = {}, authority = {}) {
    const objectiveId = clean(authority.objectiveId);
    const instruction = clean(authority.instruction);
    const mimeType = clean(input.mimeType).toLowerCase();

    if (!objectiveId) throw new Error("OBJECTIVE_ID_REQUIRED");
    if (!instruction) throw new Error("INSTRUCTION_REQUIRED");
    if (!SUPPORTED_TYPES.has(mimeType)) throw new Error("UNSUPPORTED_MEDIA_TYPE");

    const pages = normalizePages(input.pages);
    const mediaType = mimeType === "application/pdf" ? "pdf" : "image";

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
            ingestedAt: Date.now()
        },
        mediaType,
        extraction: {
            pages,
            fullText: pages.map(page => page.text).filter(Boolean).join("\n\n"),
            tables: pages.flatMap(page => page.tables),
            images: pages.flatMap(page => page.images),
            metadata: {
                pageCount: pages.length,
                language: clean(input.language, "unknown"),
                extractor: clean(input.extractor, "external_adapter_required")
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
            preserveSourceTrace: true
        }
    };
}

export function buildMediaAnalysis(record, input = {}) {
    if (!record?.trace?.objectiveId || !record?.extraction) {
        return { ok: false, reason: "INGESTION_RECORD_REQUIRED" };
    }

    const requestedQuestions = Array.isArray(input.questions) ? input.questions : [];

    return {
        ok: true,
        engine: "jarvis_media_analysis",
        version: VERSION,
        trace: {
            objectiveId: record.trace.objectiveId,
            authorityId: record.trace.authorityId,
            controllerId: record.trace.controllerId,
            sourceId: record.trace.sourceId,
            analyzedAt: Date.now()
        },
        source: {
            mediaType: record.mediaType,
            sourceName: record.trace.sourceName,
            pageCount: record.extraction.metadata.pageCount
        },
        analysis: {
            questions: requestedQuestions,
            extractedText: record.extraction.fullText,
            tables: record.extraction.tables,
            images: record.extraction.images,
            summary: clean(input.summary, record.context.summary),
            findings: Array.isArray(input.findings) ? input.findings : [],
            evidence: Array.isArray(input.evidence) ? input.evidence : []
        },
        policy: {
            advisoryOnly: true,
            mayReplaceInstruction: false,
            mayAuthorizeWrite: false,
            mayAuthorizeDeploy: false
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
            "table_and_image_evidence",
            "source_traceability",
            "approval_bound_derived_actions"
        ]
    };
}
