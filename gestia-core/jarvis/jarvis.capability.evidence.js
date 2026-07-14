const VERSION = "1.0.0-capability-evidence";
const STORAGE_KEY = "jarvis.capability.evidence.v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const memoryEvidence = new Map();

function storage() {
    try {
        return globalThis?.localStorage || globalThis?.window?.localStorage || null;
    } catch {
        return null;
    }
}

function readStore() {
    const target = storage();
    if (!target) return Object.fromEntries(memoryEvidence);
    try {
        const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function writeStore(value = {}) {
    const target = storage();
    if (!target) {
        memoryEvidence.clear();
        Object.entries(value).forEach(([key, item]) => memoryEvidence.set(key, item));
        return;
    }
    try {
        target.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
        // Evidence persistence must never interrupt the tool that produced it.
    }
}

export function recordCapabilityEvidence(id, evidence = {}) {
    const key = String(id || "").trim();
    if (!key || !evidence || typeof evidence !== "object") return null;
    const checkedAt = evidence.checkedAt || new Date().toISOString();
    const record = {
        ...evidence,
        checkedAt,
        evidenceVersion: VERSION,
        evidenceSource: "JARVIS_VERIFIED_TOOL_EXECUTION"
    };
    const store = readStore();
    store[key] = record;
    writeStore(store);
    return record;
}

export function readCapabilityEvidence(id, options = {}) {
    const record = readStore()[String(id || "").trim()] || null;
    if (!record) return null;
    const maxAgeMs = Number.isFinite(Number(options.maxAgeMs))
        ? Number(options.maxAgeMs)
        : MAX_AGE_MS;
    const checkedAtMs = Date.parse(record.checkedAt || "");
    if (!Number.isFinite(checkedAtMs) || Date.now() - checkedAtMs > maxAgeMs) return null;
    return record;
}

export function describeCapabilityEvidence() {
    return { version: VERSION, storageKey: STORAGE_KEY, maxAgeMs: MAX_AGE_MS };
}
