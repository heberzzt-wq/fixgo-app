import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
    buildJarvisMultifunctionToolCalls
} from "../gestia-core/jarvis/jarvis.multifunction.planner.js";

const schema = required => ({
    type: "object",
    properties: Object.fromEntries(required.map(name => [name, { type: "string" }])),
    required,
    additionalProperties: true
});

const pageCatalog = [
    {
        name: "page.plan",
        description: "Planea una página",
        inputSchema: schema(["pageName"]),
        missionDedupeBy: ["pageName"]
    },
    {
        name: "page.compose",
        description: "Compone una página",
        inputSchema: schema(["brandName"])
    },
    {
        name: "page.create",
        description: "Crea una página local",
        userArtifact: true,
        inputSchema: schema(["pageName"]),
        missionDedupeBy: ["pageName"]
    }
];

test("new page subject remains current-turn authoritative after an older Jarvis V7 page", async () => {
    const instruction = "Crea una página para Multiservicios Peninsulares HMH .com";
    const missionState = {
        phase: "CURRENT_TURN",
        semanticMemoryAvailable: true,
        completedTasks: [
            { name: "page.plan", args: { pageName: "Jarvis V7" } },
            { name: "page.compose", args: { brandName: "Jarvis V7" } },
            { name: "page.create", args: { pageName: "Jarvis V7" } }
        ]
    };
    const semanticPlanner = async ({ input, missionState: received }) => {
        assert.equal(input, instruction);
        assert.equal(received.semanticMemory, undefined);
        assert.equal(received.semanticMemoryAvailable, true);
        return {
            ok: true,
            status: "SEMANTIC_PLAN_READY",
            provider: "test-current-turn",
            model: "semantic-generalist",
            missionComplete: false,
            toolCalls: [
                {
                    name: "page.plan",
                    args: { pageName: "Multiservicios Peninsulares HMH" },
                    reason: "CURRENT_TURN_PAGE_PLAN"
                },
                {
                    name: "page.compose",
                    args: { brandName: "Multiservicios Peninsulares HMH" },
                    reason: "CURRENT_TURN_PAGE_COMPOSE"
                },
                {
                    name: "page.create",
                    args: { pageName: "Multiservicios Peninsulares HMH" },
                    reason: "CURRENT_TURN_PAGE_CREATE"
                }
            ]
        };
    };

    const calls = await buildJarvisMultifunctionToolCalls(instruction, {
        toolCatalog: pageCatalog,
        missionState,
        semanticPlanner,
        throwOnUnavailable: true
    });

    assert.deepEqual(calls.map(call => call.name), ["page.plan", "page.compose", "page.create"]);
    assert.equal(calls[0].args.pageName, "Multiservicios Peninsulares HMH");
    assert.equal(calls[1].args.brandName, "Multiservicios Peninsulares HMH");
    assert.equal(calls[2].args.pageName, "Multiservicios Peninsulares HMH");
});

test("tool-planning receives only memory availability while mission memory stays advisory", () => {
    const core = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
    assert.doesNotMatch(core, /phase:\s*"CURRENT_TURN"[\s\S]{0,220}semanticMemory\s*,/);
    assert.doesNotMatch(core, /semanticMemory\s*:\s*semanticMemoryContext/);
    assert.match(core, /semanticMemoryAvailable:\s*Boolean\(semanticMemory\)/);
    assert.equal(
        (core.match(/semanticMemoryAvailable:\s*Boolean\(semanticMemoryContext\)/g) || []).length,
        3
    );
    assert.match(core, /memoryContext:\s*semanticMemoryContext/);
});

test("terminal shell forces current runtime entrypoints instead of cached v116-v117 entrypoints", () => {
    const html = fs.readFileSync(new URL("../gestia-terminal.html", import.meta.url), "utf8");
    assert.match(html, /gestia-core\/gestia-core\.js\?v=v139-real-reel-e2e-20260812/);
    assert.equal((html.match(/gestia-terminal\.js\?v=v94-source-grounded-research-v124-20260810/g) || []).length, 2);
    assert.match(html, /gestia-core\/gestia\.runtime\.v7\.js\?v=v94-source-grounded-research-v124-20260810/);
    assert.doesNotMatch(html, /gestia-core\/gestia-core\.js\?v=v94-runtime-health-truth-v116-20260809/);
});
