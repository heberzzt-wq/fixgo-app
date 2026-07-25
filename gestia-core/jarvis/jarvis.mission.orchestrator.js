const VERSION = "1.4.0-verified-complete-artifacts";
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

function compactEvidence(value, depth = 0) {
    if (value == null || depth > 4) return null;
    if (typeof value === "string") return text(value, 700);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) {
        return value.slice(0, 24).map(item => compactEvidence(item, depth + 1));
    }
    if (typeof value !== "object") return null;
    return Object.fromEntries(
        Object.entries(value)
            .slice(0, 30)
            .map(([key, item]) => [text(key, 100), compactEvidence(item, depth + 1)])
            .filter(([, item]) => item !== null)
    );
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
    const status = text(
        payload?.status ||
        result?.status ||
        (result?.ok === false ? "FAILED" : "COMPLETED"),
        120
    );
    const normalizedStatus = status.toUpperCase();
    const executionOk =
        result?.ok !== false &&
        payload?.ok !== false;
    const missingInputs = Array.isArray(payload?.missingInputs)
        ? payload.missingInputs.filter(Boolean).slice(0, 20)
        : [];
    const requiresInput =
        payload?.requiresInput === true ||
        normalizedStatus.includes("INPUT_REQUIRED") ||
        missingInputs.length > 0;
    const requiresApproval =
        payload?.requiresApproval === true ||
        normalizedStatus.includes("PENDING_APPROVAL");
    const failedStatus =
        normalizedStatus === "FAILED" ||
        normalizedStatus === "TOOL_FAILED" ||
        normalizedStatus.endsWith("_FAILED");
    const degraded =
        payload?.degraded === true ||
        normalizedStatus.includes("DEGRADED") ||
        normalizedStatus === "GROUNDED_LOCAL_FALLBACK" ||
        Boolean(payload?.cloudError);
    const explicitObjectiveSatisfied =
        typeof payload?.objectiveSatisfied === "boolean"
            ? payload.objectiveSatisfied
            : null;
    const objectiveSatisfied =
        executionOk &&
        !failedStatus &&
        !requiresInput &&
        !requiresApproval &&
        (
            explicitObjectiveSatisfied !== null
                ? explicitObjectiveSatisfied
                : payload?.readyForProduction !== false
        );
    const blocked =
        payload?.blocked === true ||
        requiresInput ||
        requiresApproval;
    const retryable =
        payload?.retryable === true ||
        (
            !executionOk &&
            !blocked &&
            payload?.retryable !== false
        );
    const preparedArtifact =
        normalizedStatus === "DOCUMENT_CONTENT_COMPOSED"
            ? {
                kind:
                    "document",
                title:
                    text(payload?.title, 300),
                format:
                    text(payload?.format, 30),
                content:
                    String(payload?.content ?? "").slice(0, 50000)
            }
            : normalizedStatus === "SPREADSHEET_BLUEPRINT_READY"
                ? {
                    kind:
                        "spreadsheet",
                    title:
                        text(payload?.title, 300),
                    format:
                        "xlsx",
                    sheets:
                        Array.isArray(payload?.sheets)
                            ? payload.sheets.slice(0, 12).map((sheet, index) => ({
                                name:
                                    text(
                                        sheet?.name ||
                                        `Hoja ${index + 1}`,
                                        31
                                    ),
                                rows:
                                    Array.isArray(sheet?.rows)
                                        ? sheet.rows.slice(0, 2000).map(row =>
                                            (
                                                Array.isArray(row)
                                                    ? row
                                                    : Object.values(row || {})
                                            )
                                                .slice(0, 80)
                                                .map(cell =>
                                                    typeof cell === "string"
                                                        ? text(cell, 500)
                                                        : cell
                                                )
                                        )
                                        : []
                            }))
                            : []
                }
                : normalizedStatus === "PAGE_CONTENT_COMPOSED"
                    ? {
                        kind:
                            "page",
                        pageInput:
                            compactEvidence(
                                payload?.pageInput ||
                                {}
                            )
                    }
                    : null;

    return {
        ok: executionOk,
        executionOk,
        objectiveSatisfied,
        status,
        requiresInput,
        requiresApproval,
        blocked,
        degraded,
        retryable,
        sourceCount: Number(payload?.sourceCount || payload?.sources?.length || 0),
        validSources: Array.isArray(payload?.sources) ? payload.sources.slice(0, 12) : [],
        discardedSources: Array.isArray(payload?.discardedSources) ? payload.discardedSources.slice(0, 12) : [],
        summary: text(
            [
                payload?.message,
                payload?.answer,
                payload?.summary,
                payload?.text
            ].find(value =>
                typeof value === "string" &&
                value.trim()
            ) || "",
            3000
        ),
        artifact: text(
            payload?.output ||
            (
                typeof payload?.artifact === "string"
                    ? payload.artifact
                    : payload?.artifact?.file ||
                        payload?.artifact?.output ||
                        ""
            ),
            500
        ) || null,
        preparedArtifact,
        evidence: compactEvidence({
            ...payload,
            missingInputs
        })
    };
}

function trustedCalls(calls = [], mission) {
    const completed = new Set(mission.completedTasks.map(item => item.signature));
    const pending = new Set(mission.pendingTasks.map(item => item.signature));
    const blocked = new Set(mission.blockedTasks.map(item => item.signature));
    const missionDedupeKeys = new Set(
        [
            ...mission.completedTasks,
            ...mission.pendingTasks,
            ...mission.blockedTasks
        ]
            .map(item => item?.missionDedupeKey)
            .filter(Boolean)
    );
    const accepted = [];
    for (const candidate of Array.isArray(calls) ? calls : []) {
        const name = text(candidate?.name, 100);
        if (!name) continue;
        const call = { name, args: candidate?.args && typeof candidate.args === "object" ? candidate.args : {}, approved: false };
        const missionDedupeKey =
            text(
                candidate?.missionDedupeKey,
                500
            );
        if (
            missionDedupeKey &&
            missionDedupeKeys.has(missionDedupeKey)
        ) {
            continue;
        }
        const signature = callSignature(call);
        if (completed.has(signature) || pending.has(signature) || blocked.has(signature)) continue;
        pending.add(signature);
        if (missionDedupeKey) {
            missionDedupeKeys.add(missionDedupeKey);
        }
        accepted.push({
            ...call,
            ...(missionDedupeKey ? { missionDedupeKey } : {}),
            signature,
            attempts: 0,
            status: "PENDING"
        });
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
                const verifiedContractSatisfied =
                    contractSatisfied &&
                    mission.requiredToolNames.length > 0 &&
                    mission.completedTasks.length > 0;
                mission.reason = (
                    plan?.missionComplete === true ||
                    verifiedContractSatisfied
                ) && contractSatisfied
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
                completedTasks: mission.completedTasks.map(item => ({
                    name: item.name,
                    args: item.args,
                    observation: item.observation
                })),
                blockedTasks: mission.blockedTasks.map(item => ({
                    name: item.name,
                    args: item.args,
                    reason: item.reason,
                    observation: item.observation
                })),
                validSources: mission.completedTasks
                    .flatMap(item => item.observation?.validSources || [])
                    .slice(0, 20),
                writeAllowed: false,
                approved: false
            });
        } catch (error) {
            result = { ok: false, status: "TOOL_FAILED", error: error?.message || String(error) };
        }

        const observation = safeObservation(result);
        const executedArgs =
            result?.missionExecution?.args &&
            typeof result.missionExecution.args === "object" &&
            !Array.isArray(result.missionExecution.args)
                ? result.missionExecution.args
                : task.args;
        runtimeResults.push(result);
        const recordStatus = observation.objectiveSatisfied
            ? "COMPLETED"
            : observation.blocked
                ? "BLOCKED"
                : "FAILED";
        const record = {
            ...task,
            args: executedArgs,
            status: recordStatus,
            observation,
            completedAt: now()
        };
        mission.executedTools.push(task.name);
        mission.observations.push({
            tool: task.name,
            args: executedArgs,
            signature: task.signature,
            ...observation,
            at: now()
        });

        if (observation.objectiveSatisfied) {
            mission.completedTasks.push(record);
        } else if (observation.blocked) {
            mission.blockedTasks.push({
                ...record,
                reason: observation.status
            });
            mission.errors.push({
                tool: task.name,
                status: observation.status,
                retryable: false,
                requiresInput: observation.requiresInput,
                requiresApproval: observation.requiresApproval,
                at: now()
            });

            if (observation.requiresInput) {
                const completedNames = new Set(
                    mission.completedTasks.map(item => item.name)
                );
                const blockedNames = new Set(
                    mission.blockedTasks.map(item => item.name)
                );
                mission.contractMissingTools =
                    mission.requiredToolNames.filter(
                        name =>
                            !completedNames.has(name) &&
                            !blockedNames.has(name)
                    );
                mission.reason = "MISSION_INPUT_REQUIRED";
                break;
            }
        } else if (
            observation.retryable &&
            task.attempts <= maximumRetries
        ) {
            mission.pendingTasks.push({
                ...task,
                status: "RETRY_PENDING"
            });
            mission.errors.push({
                tool: task.name,
                status: observation.status,
                retryable: true,
                at: now()
            });
        } else {
            mission.blockedTasks.push({
                ...record,
                reason: observation.status
            });
            mission.errors.push({
                tool: task.name,
                status: observation.status,
                retryable: false,
                at: now()
            });
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
