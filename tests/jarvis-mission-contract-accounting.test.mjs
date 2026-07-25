import assert from "node:assert/strict";
import { test } from "node:test";
import {
    runJarvisMission,
    __test
} from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
    };
}

test("mission contract keeps blocked marketing and dependent deliverables missing", async () => {
    const required = [
        "web.research",
        "marketing.plan",
        "page.plan",
        "image.plan",
        "reel.plan"
    ];
    const executed = [];
    const mission = await runJarvisMission({
        instruction: "Investiga y entrega campaña, landing, imagen y reel sin publicar.",
        initialToolCalls: required.map(name => ({
            name,
            args: { prompt: "Usa evidencia previa" }
        })),
        requiredToolNames: required,
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async call => {
            executed.push(call.name);
            if (call.name === "web.research") {
                return {
                    ok: true,
                    status: "GROUNDED",
                    sources: [{ url: "https://example.com/fuente-oficial" }],
                    answer: "Fuente oficial localizada."
                };
            }
            if (call.name === "marketing.plan") {
                return {
                    ok: true,
                    status: "MARKETING_INPUT_REQUIRED",
                    readyForProduction: false,
                    campaign: null,
                    missingInputs: ["audience", "offer"]
                };
            }
            return {
                ok: true,
                status: "COMPLETED_READ_ONLY_PLAN"
            };
        },
        storage: memoryStorage()
    });

    assert.deepEqual(executed, ["web.research", "marketing.plan"]);
    assert.deepEqual(
        mission.completedTasks.map(item => item.name),
        ["web.research"]
    );
    assert.equal(mission.blockedTasks[0].name, "marketing.plan");
    assert.equal(mission.blockedTasks[0].observation.executionOk, true);
    assert.equal(mission.blockedTasks[0].observation.objectiveSatisfied, false);
    assert.equal(mission.blockedTasks[0].observation.requiresInput, true);
    assert.deepEqual(
        mission.pendingTasks.map(item => item.name),
        ["page.plan", "image.plan", "reel.plan"]
    );
    assert.deepEqual(
        mission.contractMissingTools,
        ["marketing.plan", "page.plan", "image.plan", "reel.plan"]
    );
    assert.equal(mission.reason, "MISSION_INPUT_REQUIRED");
    assert.equal(mission.status, "PARTIAL");
});

test("approval-blocked required work remains missing without being retried", async () => {
    let attempts = 0;
    const mission = await runJarvisMission({
        instruction: "Prepara la página, pero no publiques sin aprobación.",
        initialToolCalls: [{
            name: "page.create",
            args: { output: "landing.html" }
        }],
        requiredToolNames: ["page.create"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async () => {
            attempts += 1;
            return {
                ok: true,
                status: "PENDING_APPROVAL",
                requiresApproval: true
            };
        },
        storage: memoryStorage(),
        maximumRetries: 2
    });

    assert.equal(attempts, 1);
    assert.equal(mission.blockedTasks.length, 1);
    assert.equal(mission.blockedTasks[0].observation.requiresApproval, true);
    assert.deepEqual(mission.contractMissingTools, ["page.create"]);
    assert.equal(mission.reason, "PARTIAL_CAPABILITY_BLOCKED");
    assert.equal(mission.status, "PARTIAL");
});

test("retryable technical failure retries and can still satisfy the objective", async () => {
    let attempts = 0;
    const mission = await runJarvisMission({
        instruction: "Lee el estado del sistema.",
        initialToolCalls: [{ name: "system.health", args: {} }],
        requiredToolNames: ["system.health"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async () => {
            attempts += 1;
            return attempts === 1
                ? {
                    ok: false,
                    status: "TOOL_FAILED",
                    retryable: true
                }
                : {
                    ok: true,
                    status: "COMPLETED",
                    summary: "Sistema disponible."
                };
        },
        storage: memoryStorage(),
        maximumRetries: 1
    });

    assert.equal(attempts, 2);
    assert.equal(mission.completedTasks.length, 1);
    assert.deepEqual(mission.contractMissingTools, []);
    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(mission.status, "COMPLETED");
});

test("degraded grounded fallback is visible while remaining objectively satisfied", () => {
    const observation = __test.safeObservation({
        ok: true,
        status: "GROUNDED_LOCAL_FALLBACK",
        cloudError: "SEMANTIC_CLOUD_TIMEOUT",
        sources: [{ url: "https://example.com/cache" }]
    });

    assert.equal(observation.executionOk, true);
    assert.equal(observation.objectiveSatisfied, true);
    assert.equal(observation.degraded, true);
    assert.equal(observation.blocked, false);
    assert.equal(observation.retryable, false);
});
