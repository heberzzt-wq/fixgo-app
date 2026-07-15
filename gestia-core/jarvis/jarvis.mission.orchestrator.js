const VERSION = "1.1.0-explicit-model-audited-completion";
const STORAGE_KEY = "jarvis.missions.v1";

function text(value = "", maximum = 120000) {
    return String(value ?? "").trim().slice(0, maximum);
}

function storageOrMemory(storage) {
    if (storage) return storage;
    if (typeof localStorage !== "undefined") return localStorage;
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
    };
}

function identifier(prefix) {
    const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${value}`;
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function callSignature(call = {}) {
    return JSON.stringify(stable({ name: text(call.name, 100), args: call.args || {} }));
}

async function sha256(value = "") {
    const bytes = new TextEncoder().encode(String(value));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function compactRoutingInstruction(instruction = "", maximum = 12000) {
    const source = text(instruction);
    if (source.length <= maximum) return source;
    const marker = "\n[INSTRUCCION_COMPLETA_PERSISTIDA_EN_EXPEDIENTE]\n";
    const available = maximum - marker.length;
    const beginning = Math.ceil(available * 0.7);
    return `${source.slice(0, beginning)}${marker}${source.slice(source.length - (available - beginning))}`;
}

function readMissions(storage) {
    try {
        const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveMission(storage, mission) {
    const missions = readMissions(storage);
    const index = missions.findIndex(item => item.missionId === mission.missionId);
    if (index >= 0) missions[index] = mission;
    else missions.push(mission);
    storage.setItem(STORAGE_KEY, JSON.stringify(missions.slice(-30)));
    return structuredClone(mission);
}

function safeObservation(result = {}) {
    const payload =
        result?.observations?.[0]?.data ||
        result?.data?.observations?.[0]?.data ||
        result?.result?.observations?.[0]?.data ||
        result?.result ||
        result?.data ||
        result?.response ||
        result;
    return {
        ok: result?.ok !== false && payload?.ok !== false,
        status: text(payload?.status || result?.status || (result?.ok === false ? "FAILED" : "COMPLETED"), 120),
        sourceCount: Number(payload?.sourceCount || payload?.sources?.length || 0),
        validSources: Array.isArray(payload?.sources) ? payload.sources.slice(0, 12) : [],
        discardedSources: Array.isArray(payload?.discardedSources) ? payload.discardedSources.slice(0, 12) : [],
        summary: text(payload?.message || payload?.answer || payload?.summary || payload?.text || "", 3000),
        artifact: text(payload?.artifact || payload?.output || "", 500) || null
    };
}

function trustedCalls(calls = [], mission) {
    const completed = new Set(mission.completedTasks.map(item => item.signature));
    const pending = new Set(mission.pendingTasks.map(item => item.signature));
    const blocked = new Set(mission.blockedTasks.map(item => item.signature));
    const accepted = [];
    for (const candidate of Array.isArray(calls) ? calls : []) {
        const name = text(candidate?.name, 100);
        if (!name) continue;
        const call = { name, args: candidate?.args && typeof candidate.args === "object" ? candidate.args : {}, approved: false };
        const signature = callSignature(call);
        if (completed.has(signature) || pending.has(signature) || blocked.has(signature)) continue;
        pending.add(signature);
        accepted.push({ ...call, signature, attempts: 0, status: "PENDING" });
    }
    return accepted;
}

export async function runJarvisMission({
    instruction,
    initialToolCalls = [],
    requiredToolNames = [],
    planner,
    execute,
    storage,
    caseId,
    objectiveId,
    now = () => new Date().toISOString(),
    maximumSteps = 12,
    maximumRetries = 1,
    timeoutMs = 180000,
    signal
} = {}) {
    const originalInstruction = String(instruction ?? "").trim();
    if (!originalInstruction) throw new Error("MISSION_INSTRUCTION_REQUIRED");
    if (typeof planner !== "function" || typeof execute !== "function") throw new Error("MISSION_RUNTIME_REQUIRED");

    const persistence = storageOrMemory(storage);
    const startedAt = Date.now();
    const runtimeResults = [];
    const mission = {
        schemaVersion: VERSION,
        missionId: identifier("MISSION"),
        caseId: text(caseId, 160) || identifier("CASE"),
        objectiveId: text(objectiveId, 160) || identifier("OBJ"),
        instructionHash: await sha256(originalInstruction),
        originalInstruction,
        rawInstructionLength: originalInstruction.length,
        routingInstruction: compactRoutingInstruction(originalInstruction),
        routingInstructionLength: compactRoutingInstruction(originalInstruction).length,
        status: "RUNNING",
        reason: null,
        plannedTools: [],
        requiredToolNames: [...new Set(
            (Array.isArray(requiredToolNames) ? requiredToolNames : [])
                .map(name => text(name, 100))
                .filter(Boolean)
        )],
        executedTools: [],
        completedTasks: [],
        pendingTasks: [],
        blockedTasks: [],
        observations: [],
        errors: [],
        iterations: 0,
        writeAllowed: false,
        approvalRequiredForWrite: true,
        startedAt: now(),
        updatedAt: now()
    };
    mission.pendingTasks.push(...trustedCalls(initialToolCalls, mission));
    saveMission(persistence, mission);

    while (mission.iterations < maximumSteps) {
        if (signal?.aborted) {
            mission.reason = "CANCELLED";
            break;
        }
        if (Date.now() - startedAt >= timeoutMs) {
            mission.reason = "DEADLINE_EXCEEDED";
            break;
        }

        if (mission.pendingTasks.length === 0) {
            let plan;
            try {
                plan = await planner({
                    originalInstruction,
                    routingInstruction: mission.routingInstruction,
                    mission: structuredClone(mission)
                });
            } catch (error) {
                mission.reason = "PLANNER_UNAVAILABLE";
                mission.errors.push({
                    tool: "semantic.planner",
                    status: text(error?.message || "PLANNER_UNAVAILABLE", 500),
                    retryable: true,
                    at: now()
                });
                break;
            }
            const additions = trustedCalls(plan?.toolCalls || plan || [], mission);
            mission.pendingTasks.push(...additions);
            mission.plannedTools.push(...additions.map(item => item.name));
            mission.updatedAt = now();
            saveMission(persistence, mission);
            if (additions.length === 0) {
                const completedNames = new Set(mission.completedTasks.map(item => item.name));
                const blockedNames = new Set(mission.blockedTasks.map(item => item.name));
                mission.contractMissingTools = mission.requiredToolNames.filter(
                    name => !completedNames.has(name) && !blockedNames.has(name)
                );
                const contractSatisfied = mission.contractMissingTools.length === 0;
                mission.reason = plan?.missionComplete === true && contractSatisfied
                    ? mission.blockedTasks.length > 0
                        ? "PARTIAL_CAPABILITY_BLOCKED"
                        : "ALL_EXECUTABLE_TASKS_COMPLETED"
                    : contractSatisfied
                        ? "PLANNER_NO_EXECUTABLE_PLAN"
                        : "MISSION_CONTRACT_INCOMPLETE";
                break;
            }
        }

        const task = mission.pendingTasks.shift();
        mission.iterations += 1;
        task.attempts += 1;
        let result;
        try {
            result = await execute({ name: task.name, args: task.args, approved: false }, {
                missionId: mission.missionId,
                caseId: mission.caseId,
                objectiveId: mission.objectiveId,
                rawInput: originalInstruction,
                writeAllowed: false,
                approved: false
            });
        } catch (error) {
            result = { ok: false, status: "TOOL_FAILED", error: error?.message || String(error) };
        }

        const observation = safeObservation(result);
        runtimeResults.push(result);
        const record = { ...task, status: observation.ok ? "COMPLETED" : "FAILED", observation, completedAt: now() };
        mission.executedTools.push(task.name);
        mission.observations.push({ tool: task.name, signature: task.signature, ...observation, at: now() });

        if (observation.ok) {
            mission.completedTasks.push(record);
        } else if (task.attempts <= maximumRetries) {
            mission.pendingTasks.push({ ...task, status: "RETRY_PENDING" });
            mission.errors.push({ tool: task.name, status: observation.status, retryable: true, at: now() });
        } else {
            mission.blockedTasks.push({ ...record, reason: observation.status });
            mission.errors.push({ tool: task.name, status: observation.status, retryable: false, at: now() });
        }

        mission.updatedAt = now();
        saveMission(persistence, mission);
    }

    if (!mission.reason) mission.reason = mission.iterations >= maximumSteps ? "MAXIMUM_STEPS_REACHED" : "MISSION_STOPPED";
    mission.status = mission.reason === "ALL_EXECUTABLE_TASKS_COMPLETED" ? "COMPLETED" : "PARTIAL";
    mission.durationMs = Date.now() - startedAt;
    mission.pendingTasks = mission.pendingTasks.map(item => ({ ...item, status: "PENDING" }));
    mission.updatedAt = now();
    saveMission(persistence, mission);
    return { ...mission, runtimeResults };
}

export function recoverJarvisMission(missionId, { storage } = {}) {
    return readMissions(storageOrMemory(storage)).find(item => item.missionId === missionId) || null;
}

export const __test = { callSignature, compactRoutingInstruction, safeObservation, trustedCalls };
