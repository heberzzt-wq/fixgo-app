const VERSION = "1.2.0-semantic-repair-recall";
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

function livePrivateArchiveAdapter() {
    const requestJson =
        globalThis
            ?.JarvisLocalBridge
            ?.requestJson;
    if (typeof requestJson !== "function") {
        return null;
    }
    return {
        append:
            payload =>
                requestJson(
                    "/memory/append",
                    payload,
                    { timeoutMs: 5000 }
                ),
        query:
            payload =>
                requestJson(
                    "/memory/query",
                    payload,
                    { timeoutMs: 5000 }
                )
    };
}

export function createJarvisSemanticMemory({
    storage = globalThis.localStorage,
    sessionStorage = globalThis.sessionStorage,
    now = () => new Date().toISOString(),
    archiveAdapter = null
} = {}) {
    const conversationId = () => activeConversationId(sessionStorage);
    const archiveSyncedScopes = new Set();

    function archive() {
        return archiveAdapter || livePrivateArchiveAdapter();
    }

    async function archiveRecords(identity = {}, localRecords = [], record = null) {
        const adapter = archive();
        if (typeof adapter?.append !== "function") {
            return {
                ok: false,
                status: "PRIVATE_MEMORY_ARCHIVE_UNAVAILABLE"
            };
        }
        const key = scopeKey(identity);
        const firstSync = !archiveSyncedScopes.has(key);
        const payloadRecords =
            firstSync
                ? localRecords
                : record
                    ? [record]
                    : [];
        if (payloadRecords.length === 0) {
            return {
                ok: true,
                status: "PRIVATE_MEMORY_ARCHIVE_ALREADY_SYNCED"
            };
        }
        try {
            const result =
                await adapter.append({
                    identity:
                        scopeIdentity(identity),
                    records:
                        payloadRecords
                });
            if (result?.ok === true) {
                archiveSyncedScopes.add(key);
            }
            return result;
        }
        catch(error) {
            return {
                ok: false,
                status: "PRIVATE_MEMORY_ARCHIVE_APPEND_FAILED",
                error:
                    error?.message || String(error)
            };
        }
    }

    async function archivedRecords(identity = {}) {
        const adapter = archive();
        if (typeof adapter?.query !== "function") return [];
        try {
            const result =
                await adapter.query({
                    identity:
                        scopeIdentity(identity),
                    kinds:
                        ["TURN", "MISSION", "LESSON"],
                    limit:
                        5000
                });
            return Array.isArray(result?.records)
                ? result.records
                : [];
        }
        catch {
            return [];
        }
    }

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
        const archiveResult =
            await archiveRecords(
                identity,
                current,
                record
            );
        return {
            ok: true,
            status: "SEMANTIC_MEMORY_TURN_STORED",
            record,
            durableArchive:
                archiveResult
        };
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
        const archiveResult =
            await archiveRecords(
                identity,
                current,
                record
            );
        return {
            ok: true,
            status: "SEMANTIC_MEMORY_LESSON_STORED",
            record,
            durableArchive:
                archiveResult
        };
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
        const archiveResult =
            await archiveRecords(
                identity,
                current,
                record
            );
        await rememberLesson({
            identity,
            missionId: record.missionId,
            instruction,
            status: record.missionReason || record.missionStatus,
            errors,
            completedTools,
            blockedTools
        });
        return {
            ok: true,
            status: "SEMANTIC_MEMORY_MISSION_STORED",
            record,
            durableArchive:
                archiveResult
        };
    }

    async function recall({ identity = {}, maximumTurns = 40, maximumMissions = 16, maximumLessons = 20 } = {}) {
        const current = records(identity);
        const archiveSync =
            await archiveRecords(
                identity,
                current
            );
        const durable =
            await archivedRecords(identity);
        const byId =
            new Map();
        for (const item of [...durable, ...current]) {
            const recordId =
                clean(item?.id, 300);
            if (!recordId) continue;
            byId.set(recordId, item);
        }
        const ordered =
            [...byId.values()]
                .sort((a, b) =>
                    String(a.createdAt)
                        .localeCompare(String(b.createdAt))
                );
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
            archive: {
                durableRecords:
                    durable.length,
                syncStatus:
                    archiveSync?.status ||
                    null,
                appendOnly:
                    true
            },
            policy: {
                currentInstructionPrimary: true,
                memoryNeverBecomesCurrentMissionEvidence: true,
                noLexicalRouting: true,
                noLocalIntentDictionaries: true,
                relevanceDecidedBySemanticModel: true,
                durableArchiveAppendOnly: true,
                cacheMayBeBoundedWithoutDeletingArchive: true
            }
        };
    }

    async function recallRelevant({
        identity = {},
        query = "",
        kinds = ["LESSON", "MISSION"],
        limit = 8,
        semanticCandidateLimit = 1000
    } = {}) {
        const semanticQuery =
            clean(query, 12000);
        if (!semanticQuery) {
            return {
                ok: false,
                status:
                    "SEMANTIC_MEMORY_RELEVANCE_QUERY_REQUIRED",
                records: []
            };
        }

        const adapter = archive();
        if (typeof adapter?.query !== "function") {
            return {
                ok: false,
                status:
                    "PRIVATE_MEMORY_ARCHIVE_UNAVAILABLE",
                records: []
            };
        }

        try {
            const result =
                await adapter.query({
                    identity:
                        scopeIdentity(identity),
                    kinds:
                        Array.isArray(kinds)
                            ? kinds
                            : ["LESSON", "MISSION"],
                    query:
                        semanticQuery,
                    limit:
                        Math.max(
                            1,
                            Math.min(
                                Number(limit) || 8,
                                50
                            )
                        ),
                    semanticCandidateLimit:
                        Math.max(
                            50,
                            Math.min(
                                Number(
                                    semanticCandidateLimit
                                ) || 1000,
                                5000
                            )
                        )
                });
            return {
                ok:
                    result?.ok === true,
                status:
                    result?.status ||
                    "SEMANTIC_MEMORY_RELEVANCE_READ",
                records:
                    Array.isArray(result?.records)
                        ? result.records
                        : [],
                semanticMatches:
                    Array.isArray(
                        result?.semanticMatches
                    )
                        ? result.semanticMatches
                        : [],
                semanticEvidence:
                    result?.semanticEvidence ||
                    null
            };
        }
        catch(error) {
            return {
                ok: false,
                status:
                    "SEMANTIC_MEMORY_RELEVANCE_FAILED",
                error:
                    error?.message || String(error),
                records: []
            };
        }
    }

    async function clear(identity = {}) {
        write(identity, []);
        return {
            ok: true,
            status: "SEMANTIC_MEMORY_CACHE_CLEARED_ARCHIVE_PRESERVED"
        };
    }

    return {
        version: VERSION,
        conversationId,
        rememberTurn,
        rememberMission,
        rememberLesson,
        recall,
        recallRelevant,
        clear
    };
}


export function compactJarvisSemanticMemoryForPlanner(memory = {}) {
    const currentConversationId = clean(memory?.currentConversationId, 240);
    const belongsToCurrentConversation = item =>
        Boolean(currentConversationId) &&
        clean(item?.conversationId, 240) === currentConversationId;
    const belongsToPriorConversation = item =>
        Boolean(clean(item?.conversationId, 240)) &&
        !belongsToCurrentConversation(item);

    const turns = (Array.isArray(memory?.turns) ? memory.turns : [])
        .filter(belongsToCurrentConversation)
        .slice(-12)
        .map(item => ({
            role: clean(item?.role, 40),
            content: clean(item?.content, 4000),
            missionId: clean(item?.missionId, 240),
            status: clean(item?.status, 120)
        }));

    const mapMission = item => ({
        conversationId: clean(item?.conversationId, 240),
        missionId: clean(item?.missionId, 240),
        instruction: clean(item?.instruction, 6000),
        missionStatus: clean(item?.missionStatus, 120),
        missionReason: clean(item?.missionReason, 160),
        completedTools: Array.isArray(item?.completedTools)
            ? item.completedTools.map(value => clean(value, 120)).filter(Boolean).slice(0, 30)
            : [],
        blockedTools: Array.isArray(item?.blockedTools)
            ? item.blockedTools.map(value => clean(value, 120)).filter(Boolean).slice(0, 30)
            : [],
        finalText: clean(item?.finalText, 8000),
        producedArtifacts: Array.isArray(item?.producedArtifacts)
            ? item.producedArtifacts.map(artifact => ({
                label: clean(artifact?.label, 240),
                output: clean(artifact?.output, 800)
            })).filter(artifact => artifact.label || artifact.output).slice(0, 20)
            : []
    });

    const missions = (Array.isArray(memory?.missions) ? memory.missions : [])
        .filter(belongsToCurrentConversation)
        .slice(-6)
        .map(mapMission);

    const historicalMissions = (Array.isArray(memory?.missions) ? memory.missions : [])
        .filter(belongsToPriorConversation)
        .slice(-10)
        .map(mapMission);

    const lessons = (Array.isArray(memory?.lessons) ? memory.lessons : [])
        .slice(-12)
        .map(item => ({
            conversationId: clean(item?.conversationId, 240),
            missionId: clean(item?.missionId, 240),
            instruction: clean(item?.instruction, 4000),
            status: clean(item?.status, 120),
            errors: Array.isArray(item?.errors)
                ? item.errors.map(value => clean(value, 500)).filter(Boolean).slice(0, 12)
                : [],
            completedTools: Array.isArray(item?.completedTools)
                ? item.completedTools.map(value => clean(value, 120)).filter(Boolean).slice(0, 20)
                : [],
            blockedTools: Array.isArray(item?.blockedTools)
                ? item.blockedTools.map(value => clean(value, 120)).filter(Boolean).slice(0, 20)
                : []
        }));

    return {
        authority: "ADVISORY_SEMANTIC_MEMORY",
        currentConversationId,
        turns,
        missions,
        historicalMissions,
        lessons,
        policy: {
            currentInstructionPrimary: true,
            memoryNeverBecomesCurrentMissionEvidence: true,
            noLexicalRouting: true,
            relevanceDecidedBySemanticModel: true,
            crossConversationHistoryAdvisory: true
        }
    };
}

export const JarvisSemanticMemory = createJarvisSemanticMemory();
export const JARVIS_SEMANTIC_MEMORY_VERSION = VERSION;

if (typeof globalThis !== "undefined") {
    globalThis.JarvisSemanticMemory = JarvisSemanticMemory;
}
