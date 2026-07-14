"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
    extractJsonObject,
    requestModel,
    runJarvisSemanticPlanner,
    validatePlan
} = require("../functions/jarvis-semantic-planner");

const catalog = [
    {
        name: "repo.search",
        description: "Busca evidencia dentro del repositorio.",
        mutates: false,
        requiresApproval: false,
        inputSchema: { query: "string" }
    },
    {
        name: "connector.list",
        description: "Revisa conectores reales.",
        mutates: false,
        requiresApproval: false
    },
    {
        name: "system.supervision.runNow",
        description: "Ejecuta supervision persistida.",
        mutates: true,
        requiresApproval: true
    }
];

test("semantic planner extracts strict JSON without regex cleanup", () => {
    assert.deepEqual(
        extractJsonObject('texto {"toolCalls":[],"explanation":"ok"} final'),
        { toolCalls: [], explanation: "ok" }
    );
});

test("semantic planner preserves mixed tools and never grants prompt approval", async () => {
    const result = await runJarvisSemanticPlanner({
        input: "analisa el repo y revisa conectores sin modificar nada",
        catalog,
        fetchImpl: async (_url, request) => {
            const body = JSON.parse(request.body);
            assert.ok(body.messages[0].content.includes("Conserva todas las intenciones independientes"));
            assert.ok(body.messages[0].content.includes("approved siempre sera false"));
            return {
                ok: true,
                json: async () => ({
                    model: "semantic-test-model",
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                toolCalls: [
                                    { name: "repo.search", args: { query: "repo" }, reason: "diagnostico" },
                                    { name: "connector.list", args: {}, reason: "segunda orden" },
                                    { name: "system.supervision.runNow", args: {}, approved: true },
                                    { name: "invented.tool", args: {} }
                                ],
                                explanation: "plan mixto"
                            })
                        }
                    }]
                })
            };
        }
    });

    assert.deepEqual(result.toolCalls.map(call => call.name), [
        "repo.search",
        "connector.list",
        "system.supervision.runNow"
    ]);
    assert.equal(result.toolCalls[2].mutates, true);
    assert.equal(result.toolCalls[2].approved, false);
});

test("semantic plan validation rejects tools outside the runtime catalog", () => {
    const result = validatePlan({
        toolCalls: [
            { name: "connector.list", args: {} },
            { name: "unknown.write", args: { approved: true } }
        ]
    }, catalog);

    assert.deepEqual(result.toolCalls.map(call => call.name), ["connector.list"]);
});

test("semantic provider retries bounded transient throttling", async () => {
    let attempts = 0;
    const response = await requestModel(
        async () => {
            attempts += 1;
            return attempts === 1
                ? {
                    ok: false,
                    status: 429,
                    headers: { get: () => "0.001" }
                }
                : { ok: true, status: 200 };
        },
        "https://model.invalid",
        {},
        3
    );

    assert.equal(attempts, 2);
    assert.equal(response.ok, true);
});
