// Mechanical budgets only. Qwen remains the sole author and semantic authority.
export const DOCUMENT_OUTPUT_TOKENS = 1200;
export const DOCUMENT_INPUT_BYTES = 5500;
export const DOCUMENT_CONTEXT_TOKENS = 8192;
export const documentBytes = value => new TextEncoder().encode(String(value)).length;

export function assertDocumentContext(input, outputTokens = DOCUMENT_OUTPUT_TOKENS, system = "") {
    // Qwen's byte-level vocabulary cannot require more text tokens than UTF-8 bytes.
    // Reserve additional room for role/template tokens. Never trim user requirements.
    if (documentBytes(input) > DOCUMENT_INPUT_BYTES ||
        documentBytes(input) + documentBytes(system) + outputTokens + 256 > DOCUMENT_CONTEXT_TOKENS) {
        throw new Error("DOCUMENT_CONTEXT_BUDGET_EXCEEDED");
    }
}

export function documentExcerpt(value, maximumBytes = 800, tail = false) {
    const text = String(value || "");
    if (documentBytes(text) <= maximumBytes) return text;
    const characters = tail ? [...text].reverse() : [...text];
    let excerpt = "";
    for (const character of characters) {
        if (documentBytes(excerpt + character) > maximumBytes) break;
        excerpt = tail ? character + excerpt : excerpt + character;
    }
    return excerpt + "\n[EXCERPT_PARTIAL: contenido adicional conservado en el expediente]";
}

export function persistDocumentDraft(record, storage) {
    if (!record.content) return { persisted: false, reason: "NO_DRAFT" };
    const key = `jarvis.document.draft.${encodeURIComponent(record.id)}`;
    try {
        storage ||= globalThis.localStorage || globalThis.window?.localStorage;
        if (!storage?.setItem) return { persisted: false, reason: "STORAGE_UNAVAILABLE" };
        storage.setItem(key, JSON.stringify({ ...record, status: "UNVERIFIED_DRAFT", savedAt: new Date().toISOString() }));
        return { persisted: true, key, characters: record.content.length };
    } catch (error) { return { persisted: false, reason: "DRAFT_STORAGE_FAILED", error: String(error?.message || error) }; }
}

export function documentEvidenceEnvelope(evidence = [], maximumBytes = 1600) {
    const entries = Array.isArray(evidence) ? evidence : [];
    const complete = JSON.stringify(entries);
    if (documentBytes(complete) <= maximumBytes) return complete;
    // Keep valid JSON and declare omissions. These are excerpts, never complete reads.
    for (const limit of [320, 160, 80]) {
        const compact = value => {
            if (typeof value === "string") return documentBytes(value) > limit
                ? { excerpt: documentExcerpt(value, limit), partial: true } : value;
            if (Array.isArray(value)) return value.slice(0, 3).map(compact);
            if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compact(item)]));
            return value;
        };
        const selected = [];
        for (const entry of entries) {
            const candidate = compact(entry);
            const result = { coverage: "PARTIAL", excerpts: [...selected, candidate], totalEntries: entries.length };
            if (documentBytes(JSON.stringify(result)) <= maximumBytes) selected.push(candidate);
        }
        if (selected.length) return JSON.stringify({ coverage: "PARTIAL", excerpts: selected, totalEntries: entries.length });
    }
    // Canonical observations contain duplicated payloads and operational metadata.
    // Preserve their attributed summary before dropping the entire source.
    const excerpts = [];
    for (const entry of entries) {
        if (!entry?.tool || !entry?.summary) continue;
        const candidate = {
            tool: entry.tool, status: entry.status,
            summary: documentExcerpt(entry.summary, 1000),
            sources: entry.validSources || [],
            // A summary is not a complete repository read or a verified claim.
            coverage: "PARTIAL", verifiedRead: null
        };
        if (documentBytes(JSON.stringify({coverage:"PARTIAL",excerpts:[...excerpts,candidate],totalEntries:entries.length})) <= maximumBytes) excerpts.push(candidate);
    }
    return JSON.stringify({ coverage: "PARTIAL", excerpts, totalEntries: entries.length,
        ...(excerpts.length ? {} : {reason: "EVIDENCE_EXCEEDS_DOCUMENT_CONTEXT"}) });
}
