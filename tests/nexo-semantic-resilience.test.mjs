import assert from "node:assert/strict";
import { test } from "node:test";

import {
    __test
} from "../gestia-core/nexo/nexo.semantic-planner-resilience.js";

const {
    requiredToolNames,
    cloudPlanCoversLocalMission,
    responseHasUsefulPlan
} = __test;

const localPageMission = {
    ok: true,
    toolCalls: [
        { name: "page.plan", args: {} },
        { name: "page.compose", args: {} },
        { name: "page.create", args: {} }
    ]
};

test("cloud page plan without page.create is rejected as incomplete", () => {
    const cloudPlan = {
        ok: true,
        toolCalls: [
            { name: "page.plan", args: {} },
            { name: "page.compose", args: {} }
        ]
    };

    assert.deepEqual(
        [...requiredToolNames(localPageMission)],
        ["page.plan", "page.compose", "page.create"]
    );
    assert.equal(
        cloudPlanCoversLocalMission(cloudPlan, localPageMission),
        false
    );
});

test("complete cloud artifact contract is accepted", async () => {
    const cloudPlan = {
        ok: true,
        toolCalls: [
            { name: "page.plan", args: {} },
            { name: "page.compose", args: {} },
            { name: "page.create", args: {} }
        ]
    };

    assert.equal(
        cloudPlanCoversLocalMission(cloudPlan, localPageMission),
        true
    );

    const response = new Response(
        JSON.stringify({ result: cloudPlan }),
        {
            status: 200,
            headers: {
                "Content-Type": "application/json"
            }
        }
    );

    assert.equal(
        await responseHasUsefulPlan(response, localPageMission),
        true
    );
});

test("missionComplete cannot erase a required local artifact chain", async () => {
    const response = new Response(
        JSON.stringify({
            result: {
                ok: true,
                missionComplete: true,
                toolCalls: []
            }
        }),
        {
            status: 200,
            headers: {
                "Content-Type": "application/json"
            }
        }
    );

    assert.equal(
        await responseHasUsefulPlan(response, localPageMission),
        false
    );
});

test("unrelated missions do not impose an artifact contract on cloud planning", () => {
    assert.equal(
        cloudPlanCoversLocalMission(
            {
                ok: true,
                toolCalls: [{ name: "repo.search", args: {} }]
            },
            null
        ),
        true
    );
});
