const VERSION = "1.1.0-scoped-private-project-memory";
const PREFIX = "jarvis.private.memory.v2";
const TYPES = new Set([
    "FACT_CONFIRMED", "DECISION_ACTIVE", "DECISION_SUPERSEDED", "USER_PREFERENCE",
    "CONSTRAINT", "TECHNICAL_RESULT", "PENDING_TASK", "MISSION_STATE", "ASSUMPTION", "CORRECTION"
]);

function clean(value, maximum = 40000) {
    return String(value ?? "").trim().slice(0, maximum);
}

function safePart(value) {
    return clean(value, 160).replace(/[^a-zA-Z0-9._-]+/g, "_") || "default";
}

function identityKey(identity = {}) {
    const required = ["userId", "workspaceId", "projectId"];
    for (const field of required) if (!clean(identity[field])) throw new Error(`MEMORY_${field.toUpperCase()}_REQUIRED`);
    return required.map(field => safePart(identity[field])).join("::");
}

function namespaceKey(namespace = "manual", runId = "") {
    const kind = namespace === "e2e" ? "e2e" : "manual";
    return kind === "e2e" ? `${kind}::${safePart(runId || "default-run")}` : kind;
}

function containsSecret(value = "") {
    const input = clean(value).toLowerCase();
    return /(?:api[_-]?key|secret|password|contrase(?:n|ñ)a|bearer\s+[a-z0-9._-]{12,}|-----begin\s+(?:rsa\s+)?private\s+key)/i.test(input);
}

function load(storage, key) {
    try {
        const parsed = JSON.parse(storage.getItem(key) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
}

export function createProjectMemory({ storage = globalThis.localStorage, identity, namespace = "manual", runId = "", now = () => new Date().toISOString() } = {}) {
    if (!storage?.getItem || !storage?.setItem) throw new Error("MEMORY_STORAGE_REQUIRED");
    const dataNamespace = namespaceKey(namespace, runId);
    const scope = `${dataNamespace}::${identityKey(identity)}`;
    const conversationScope = safePart(identity.conversationId || "conversation-required");
    const memoryKey = `${PREFIX}::${scope}::records`;
    const missionKey = `${PREFIX}::${scope}::conversation::${conversationScope}::missions`;
    const write = records => storage.setItem(memoryKey, JSON.stringify(records.slice(-1000)));
    const records = () => load(storage, memoryKey);

    function remember(input = {}) {
        const type = TYPES.has(input.type) ? input.type : "ASSUMPTION";
        const content = clean(input.content);
        if (!content) throw new Error("MEMORY_CONTENT_REQUIRED");
        if (containsSecret(content)) return { ok: false, status: "MEMORY_SECRET_REJECTED" };
        const current = records();
        const sourceId = clean(input.sourceId, 240);
        const duplicate = current.find(item => item.type === type && item.subject === clean(input.subject, 240) && item.content === content && item.status !== "FORGOTTEN");
        if (duplicate) return { ok: true, status: "MEMORY_DEDUPED", record: duplicate };
        const timestamp = now();
        const id = clean(input.id, 240) || globalThis.crypto?.randomUUID?.() || `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        if (input.supersedes) {
            const prior = current.find(item => item.id === input.supersedes && item.status !== "FORGOTTEN");
            if (prior) {
                prior.status = "SUPERSEDED";
                prior.type = prior.type === "DECISION_ACTIVE" ? "DECISION_SUPERSEDED" : prior.type;
                prior.updatedAt = timestamp;
            }
        }
        const record = {
            id, userId: clean(identity.userId, 160), workspaceId: clean(identity.workspaceId, 160), projectId: clean(identity.projectId, 160),
            type, subject: clean(input.subject, 240), content, status: clean(input.status, 80) || "ACTIVE",
            source: clean(input.source, 120) || "user", sourceId, conversationId: clean(input.conversationId || identity.conversationId, 240),
            missionId: clean(input.missionId, 240), createdAt: timestamp, updatedAt: timestamp,
            effectiveFrom: clean(input.effectiveFrom, 80) || timestamp, supersedes: clean(input.supersedes, 240),
            confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 1,
            tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(tag => clean(tag, 80)).filter(Boolean))].slice(0, 20) : [],
            dataClass: dataNamespace.startsWith("e2e::") ? "E2E_FIXTURE" : "PERSISTENT_REAL"
        };
        current.push(record); write(current);
        return { ok: true, status: "MEMORY_STORED", record };
    }

    function query({ types = [], subject = "", from = "", to = "", includeSuperseded = false } = {}) {
        const allowed = new Set(types.filter(type => TYPES.has(type)));
        return records().filter(item =>
            item.status !== "FORGOTTEN" &&
            (includeSuperseded || item.status !== "SUPERSEDED") &&
            (!allowed.size || allowed.has(item.type)) &&
            (!subject || `${item.subject} ${item.content}`.toLowerCase().includes(clean(subject).toLowerCase())) &&
            (!from || item.effectiveFrom >= from) && (!to || item.effectiveFrom <= to)
        ).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    }

    function correct(id, content, meta = {}) {
        const prior = records().find(item => item.id === id && item.status !== "FORGOTTEN");
        if (!prior) return { ok: false, status: "MEMORY_NOT_FOUND" };
        return remember({ ...prior, ...meta, id: "", type: "CORRECTION", content, supersedes: id, source: "user_correction" });
    }

    function forget(id) {
        const current = records();
        const record = current.find(item => item.id === id);
        if (!record) return { ok: false, status: "MEMORY_NOT_FOUND" };
        record.status = "FORGOTTEN"; record.content = "[FORGOTTEN]"; record.updatedAt = now(); write(current);
        return { ok: true, status: "MEMORY_FORGOTTEN", id };
    }

    const missionStorage = {
        getItem: key => storage.getItem(`${missionKey}::${safePart(key)}`),
        setItem: (key, value) => storage.setItem(`${missionKey}::${safePart(key)}`, String(value))
    };
    function clearTestData() {
        if (!dataNamespace.startsWith("e2e::")) return { ok: false, status: "MEMORY_TEST_CLEANUP_FORBIDDEN" };
        storage.removeItem(memoryKey);
        const prefix = `${missionKey}::`;
        const keys = [];
        for (let index = 0; index < Number(storage.length || 0); index += 1) {
            const key = storage.key(index);
            if (key?.startsWith(prefix)) keys.push(key);
        }
        keys.forEach(key => storage.removeItem(key));
        return { ok: true, status: "MEMORY_E2E_DATA_CLEARED", removed: keys.length + 1 };
    }
    return { version: VERSION, namespace: dataNamespace, scope, memoryKey, missionKey, remember, query, correct, forget, clearTestData, missionStorage };
}

export const PROJECT_MEMORY_VERSION = VERSION;
