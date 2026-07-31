import assert from "node:assert/strict";
import { test } from "node:test";

import {
    compileNexoMission
} from "../gestia-core/nexo/nexo.mission.compiler.v2.js";
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

test("503 real media mission is fully recoverable by NEXO local contract", async () => {
    const catalog = [
        "web.research",
        "web.media.collect",
        "marketing.plan",
        "marketing.package.real-media",
        "document.create",
        "image.generate"
    ].map(name => ({ name }));
    const localPlan = compileNexoMission({
        input: "creame un plan de marketing para multiservicios . https://multiserviciospeninsulareshmh.com/ con fotos y videos reales",
        catalog
    });
    const unavailableCloud = new Response(
        JSON.stringify({ error: { message: "Service Unavailable" } }),
        {
            status: 503,
            headers: {
                "Content-Type": "application/json"
            }
        }
    );

    assert.equal(await responseHasUsefulPlan(unavailableCloud, localPlan), false);
    assert.deepEqual([...requiredToolNames(localPlan)], [
        "web.research",
        "web.media.collect",
        "marketing.plan",
        "document.create",
        "marketing.package.real-media"
    ]);
    assert.equal(localPlan.provider, "nexo-local-compiler");
    assert.equal(localPlan.toolCalls.some(call => call.name === "image.generate"), false);
});
