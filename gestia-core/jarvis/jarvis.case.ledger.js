const VERSION = "1.0.0-sovereign-persistent-case";
const STORAGE_KEY = "jarvis.case.ledger.v1";
const ACTIVE_KEY = "jarvis.case.active.v1";

function clean(value = "", max = 200000) {
    return String(value ?? "").trim().slice(0, max);
}

function newId(prefix) {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${id}`;
}

function defaultStorage() {
    if (typeof localStorage !== "undefined") return localStorage;
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

export function createPersistentCaseLedger({ storage = defaultStorage(), now = () => new Date().toISOString() } = {}) {
    function readCases() {
        try {
            const value = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(value) ? value : [];
        } catch { return []; }
    }

    function writeCases(cases) {
        storage.setItem(STORAGE_KEY, JSON.stringify(cases.slice(-100)));
    }

    function get(caseId) {
        return readCases().find(item => item.caseId === caseId) || null;
    }

    function save(record) {
        const cases = readCases();
        const index = cases.findIndex(item => item.caseId === record.caseId);
        if (index >= 0) cases[index] = record;
        else cases.push(record);
        writeCases(cases);
        return structuredClone(record);
    }

    function create({ authorityId = "HEBERTO_MENDOZA", controllerId = "JARVIS_SIA7", domain = "multimodal" } = {}) {
        const createdAt = now();
        const record = {
            schemaVersion: VERSION,
            caseId: newId("CASE"),
            objectiveId: newId("OBJ"),
            authorityId: clean(authorityId, 120) || "HEBERTO_MENDOZA",
            controllerId: clean(controllerId, 120) || "JARVIS_SIA7",
            originalInstruction: null,
            domain: clean(domain, 120) || "general",
            status: "OPEN",
            attachments: [],
            artifacts: [],
            events: [{ type: "CASE_CREATED", at: createdAt }],
            createdAt,
            updatedAt: createdAt
        };
        storage.setItem(ACTIVE_KEY, record.caseId);
        return save(record);
    }

    function active() {
        const caseId = clean(storage.getItem(ACTIVE_KEY), 160);
        return caseId ? get(caseId) : null;
    }

    function ensure(input = {}) {
        const current = active();
        return current?.status === "OPEN" ? current : create(input);
    }

    function bindInstruction(caseId, instruction) {
        const record = get(caseId);
        if (!record || record.status !== "OPEN") throw new Error("CASE_NOT_OPEN");
        const normalized = clean(instruction);
        if (!normalized) throw new Error("ORIGINAL_INSTRUCTION_REQUIRED");
        const at = now();
        if (record.originalInstruction === null) {
            record.originalInstruction = normalized;
            record.events.push({ type: "ORIGINAL_INSTRUCTION_BOUND", instruction: normalized, at });
        } else if (record.originalInstruction !== normalized) {
            record.events.push({ type: "FOLLOWUP_INSTRUCTION_RECORDED", instruction: normalized, at });
        }
        record.updatedAt = at;
        return save(record);
    }

    function recordAttachment(caseId, attachment = {}) {
        const record = get(caseId);
        if (!record || record.status !== "OPEN") throw new Error("CASE_NOT_OPEN");
        const artifact = clean(attachment.output || attachment.artifact, 500);
        const sha256 = clean(attachment.sha256, 64);
        if (!artifact || !/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("VERIFIED_ATTACHMENT_REQUIRED");
        if (!record.attachments.some(item => item.sha256 === sha256)) {
            record.attachments.push({
                name: clean(attachment.name, 255),
                mimeType: clean(attachment.mimeType, 160) || "application/octet-stream",
                bytes: Number(attachment.bytes || 0),
                artifact,
                sha256,
                source: "USER_ATTACHMENT",
                caseId: record.caseId,
                objectiveId: record.objectiveId,
                addedAt: now()
            });
            record.events.push({ type: "VERIFIED_ATTACHMENT_RECORDED", artifact, sha256, at: now() });
            record.updatedAt = now();
        }
        return save(record);
    }

    function close(caseId, status = "READY") {
        const record = get(caseId);
        if (!record) throw new Error("CASE_NOT_FOUND");
        const closedAt = now();
        record.status = clean(status, 80) || "READY";
        record.updatedAt = closedAt;
        record.events.push({ type: "CASE_CLOSED", status: record.status, at: closedAt });
        if (storage.getItem(ACTIVE_KEY) === caseId) storage.removeItem(ACTIVE_KEY);
        return save(record);
    }

    return { version: VERSION, create, ensure, active, get, bindInstruction, recordAttachment, close, list: readCases };
}

export const JarvisCaseLedger = createPersistentCaseLedger();
