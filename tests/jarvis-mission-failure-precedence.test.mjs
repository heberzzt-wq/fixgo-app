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

test("safe observation treats TOOL_FAILED as execution failure even with ok true", () => {
    const observation = __test.safeObservation({
        ok: true,
        status: "TOOL_FAILED"
    });

    assert.equal(observation.ok, false);
    assert.equal(observation.executionOk, false);
    assert.equal(observation.objectiveSatisfied, false);
    assert.equal(observation.blocked, false);
    assert.equal(observation.retryable, true);
});

test("safe observation preserves top-level failure over nested completed data", () => {
    const observation = __test.safeObservation({
        ok: false,
        status: "TOOL_FAILED",
        data: {
            ok: true,
            status: "COMPLETED",
            output: "stale.txt"
        }
    });

    assert.equal(observation.executionOk, false);
    assert.equal(observation.objectiveSatisfied, false);
    assert.equal(observation.status, "TOOL_FAILED");
    assert.equal(observation.retryable, true);
    assert.equal(observation.artifact, "stale.txt");
});

test("mission retries false-positive ok TOOL_FAILED and then completes", async () => {
    let attempts = 0;
    const mission = await runJarvisMission({
        instruction: "Verifica el sistema.",
        initialToolCalls: [{
            name: "system.health",
            args: {}
        }],
        requiredToolNames: ["system.health"],
        planner: async () => ({
            toolCalls: [],
            missionComplete: true
        }),
        execute: async () => {
            attempts += 1;
            return attempts === 1
                ? {
                    ok: true,
                    status: "TOOL_FAILED"
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
    assert.equal(mission.blockedTasks.length, 0);
    assert.deepEqual(mission.contractMissingTools, []);
    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(mission.status, "COMPLETED");
    assert.equal(mission.errors[0].status, "TOOL_FAILED");
    assert.equal(mission.errors[0].retryable, true);
});
