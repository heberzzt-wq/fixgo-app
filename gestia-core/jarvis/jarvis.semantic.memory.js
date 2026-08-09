const VERSION = "1.0.0-durable-semantic-conversations";
const STORAGE_PREFIX = "jarvis.semantic.memory.v1";
const SESSION_KEY = "jarvis.semantic.memory.activeConversation.v1";
const MAX_FALLBACK_RECORDS = 2000;
const fallbackMemory = new Map();

function clean(value = "", maximum = 120000) {
    return String(value ?? "").trim().slice(0, maximum);
}

function id(prefix = "MEM") {
    const generated = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${generated}`;
}

function scopeIdentity(identity = {}) {
    return {
        userId: clean(identity.userId, 180) || "anonymous",
        workspaceId: clean(identity.workspaceId, 180) || "UXMAL39",
        projectId: clean(identity.projectId, 180) || "adjunto"
    };
}

function scopeKey(identity = {}) {
    const scope = scopeIdentity(identity);
    return `${STORAGE_PREFIX}::${scope.userId}::${scope.workspaceId}::${scope.projectId}`;
}

function activeConversationId(sessionStorage = globalThis.sessionStorage) {
    try {
        const existing = clean(sessionStorage?.getItem?.(SESSION_KEY), 240);
        if (existing) return existing;
        const created = id("CONVERSATION");
        sessionStorage?.setItem?.(SESSION_KEY, created);
        return created;
    } catch {
        return id("CONVERSATION");
    }
}

function fallbackLoad(storage, key) {
    try {
        if (storage?.getItem) {
            const parsed = JSON.parse(storage.getItem(key) || "[]");
            return Array.isArray(parsed) ? parsed : [];
        }
    } catch {}
    return [...(fallbackMemory.get(key) || [])];
}

function fallbackSave(storage, key, records) {
    const bounded = records.slice(-MAX_FALLBACK_RECORDS);
    fallbackMemory.set(key, bounded);
    try {
        storage?.setItem?.(key, JSON.stringify(bounded));
    } catch {
        const reduced = bounded.slice(-500);
        fallbackMemory.set(key, reduced);
        try {
            storage?.setItem?.(key, JSON.stringify(reduced));
        } catch {}
    }
}

function recordBase(identity, conversationId, kind, now) {
    const scope = scopeIdentity(identity);
    return {
        id: id(kind),
        kind,
        ...scope,
        conversationId: clean(conversationId, 240) || activeConversationId(),
        createdAt: now()
    };
}

export function createJarvisSemanticMemory({
    storage = globalThis.localStorage,
    sessionStorage = globalThis.sessionStorage,
    now = () => new Date().toISOString()
} = {}) {
    const conversationId = () => activeConversationId(sessionStorage);

    function records(identity = {}) {
        return fallbackLoad(storage, scopeKey(identity));
    }

    function write(identity = {}, next = []) {
        fallbackSave(storage, scopeKey(identity), next);
    }

    async function rememberTurn({ identity = {}, role = "", content = "", missionId = "", status = "", evidenceRefs = [] } = {}) {
        const body = clean(content);
        if (!body) return { ok: false, status: "SEMANTIC_MEMORY_EMPTY_TURN" };
        const current = records(identity);
        const record = {
            ...recordBase(identity, conversationId(), "TURN", now),
            role: clean(role, 40) || "unknown",
            content: body,
            missionId: clean(missionId, 240),
            status: clean(status, 120),
            evidenceRefs: Array.isArray(evidenceRefs)
                ? evidenceRefs.map(value => clean(value, 500)).filter(Boolean).slice(0, 30)
                : []
        };
        current.push(record);
        write(identity, current);
        return { ok: true, status: "SEMANTIC_MEMORY_TURN_STORED", record };
    }

    async function rememberLesson({ identity = {}, missionId = "", instruction = "", status = "", errors = [], completedTools = [], blockedTools = [] } = {}) {
        const normalizedErrors = Array.isArray(errors)
            ? errors.map(item => clean(item?.status || item?.error || item, 800)).filter(Boolean).slice(0, 20)
            : [];
        if (normalizedErrors.length === 0 && blockedTools.length === 0) {
            return { ok: false, status: "SEMANTIC_MEMORY_NO_FAILURE_TO_LEARN" };
        }
        const current = records(identity);
        const record = {
            ...recordBase(identity, conversationId(), "LESSON", now),
            missionId: clean(missionId, 240),
            instruction: clean(instruction, 12000),
            status: clean(status, 120),
            errors: normalizedErrors,
            completedTools: Array.isArray(completedTools) ? completedTools.map(value => clean(value, 120)).filter(Boolean).slice(0, 40) : [],
            blockedTools: Array.isArray(blockedTools) ? blockedTools.map(value => clean(value, 120)).filter(Boolean).slice(0, 40) : [],
            policy: "STRUCTURAL_OUTCOME_LEARNING_ONLY"
        };
        current.push(record);
        write(identity, current);
        return { ok: true, status: "SEMANTIC_MEMORY_LESSON_STORED", record };
    }

    async function rememberMission({ identity = {}, instruction = "", mission = null, finalResponse = null } = {}) {
        if (!mission || typeof mission !== "object") return { ok: false, status: "SEMANTIC_MEMORY_MISSION_REQUIRED" };
        const current = records(identity);
        const completedTools = Array.isArray(mission.completedTasks)
            ? mission.completedTasks.map(item => clean(item?.name, 120)).filter(Boolean)
            : [];
        const blockedTools = Array.isArray(mission.blockedTasks)
            ? mission.blockedTasks.map(item => clean(item?.name, 120)).filter(Boolean)
            : [];
        const errors = Array.isArray(mission.errors) ? mission.errors : [];
        const record = {
            ...recordBase(identity, conversationId(), "MISSION", now),
            missionId: clean(mission.missionId, 240),
            caseId: clean(mission.caseId, 240),
            objectiveId: clean(mission.objectiveId, 240),
            instruction: clean(instruction, 12000),
            missionStatus: clean(mission.status, 120),
            missionReason: clean(mission.reason, 160),
            completedTools,
            blockedTools,
            finalText: clean(finalResponse?.text || finalResponse?.message || "", 20000),
            producedArtifacts: Array.isArray(finalResponse?.producedArtifacts)
                ? finalResponse.producedArtifacts.map(item => ({
                    label: clean(item?.label, 240),
                    output: clean(item?.output, 800)
                })).slice(0, 30)
                : []
        };
        current.push(record);
        write(identity, current);
        await rememberLesson({
            identity,
            missionId: record.missionId,
            instruction,
            status: record.missionReason || record.missionStatus,
            errors,
            completedTools,
            blockedTools
        });
        return { ok: true, status: "SEMANTIC_MEMORY_MISSION_STORED", record };
    }

    async function recall({ identity = {}, maximumTurns = 40, maximumMissions = 16, maximumLessons = 20 } = {}) {
        const current = records(identity);
        const ordered = [...current].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        const turns = ordered.filter(item => item?.kind === "TURN").slice(-maximumTurns);
        const missions = ordered.filter(item => item?.kind === "MISSION").slice(-maximumMissions);
        const lessons = ordered.filter(item => item?.kind === "LESSON").slice(-maximumLessons);
        const conversations = [];
        const seen = new Set();
        for (const item of [...turns, ...missions]) {
            const key = clean(item?.conversationId, 240);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            conversations.push(key);
        }
        return {
            ok: true,
            version: VERSION,
            authority: "ADVISORY_SEMANTIC_MEMORY",
            currentConversationId: conversationId(),
            conversations: conversations.slice(-30),
            turns,
            missions,
            lessons,
            policy: {
                currentInstructionPrimary: true,
                memoryNeverBecomesCurrentMissionEvidence: true,
                noLexicalRouting: true,
                noLocalIntentDictionaries: true,
                relevanceDecidedBySemanticModel: true
            }
        };
    }

    async function clear(identity = {}) {
        write(identity, []);
        return { ok: true, status: "SEMANTIC_MEMORY_CLEARED" };
    }

    return {
        version: VERSION,
        conversationId,
        rememberTurn,
        rememberMission,
        rememberLesson,
        recall,
        clear
    };
}

export const JarvisSemanticMemory = createJarvisSemanticMemory();
export const JARVIS_SEMANTIC_MEMORY_VERSION = VERSION;

if (typeof globalThis !== "undefined") {
    globalThis.JarvisSemanticMemory = JarvisSemanticMemory;
}
