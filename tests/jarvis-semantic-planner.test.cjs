"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
    buildModelTools,
    extractJsonObject,
    extractToolCallPlan,
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

test("semantic planner maps provider function calls to the runtime catalog", () => {
    const modelTools = buildModelTools(catalog);
    assert.equal(modelTools[0].function.name, "jarvis_tool_0");
    assert.ok(modelTools[0].function.description.includes("repo.search"));

    const plan = extractToolCallPlan({
        choices: [{
            message: {
                tool_calls: [
                    { function: { name: "jarvis_tool_0", arguments: '{"query":"b2b"}' } },
                    { function: { name: "jarvis_tool_1", arguments: "{}" } }
                ]
            }
        }]
    }, catalog);

    assert.deepEqual(plan.toolCalls.map(call => call.name), ["repo.search", "connector.list"]);
    assert.equal(plan.toolCalls[0].args.query, "b2b");
});

test("semantic planner preserves mixed tools and never grants prompt approval", async () => {
    const result = await runJarvisSemanticPlanner({
        input: "analisa el repo y revisa conectores sin modificar nada",
        catalog,
        fetchImpl: async (_url, request) => {
            const body = JSON.parse(request.body);
            assert.ok(body.messages[0].content.includes("Conserva todas las intenciones independientes"));
            assert.ok(body.messages[0].content.includes("approved siempre sera false"));
            assert.ok(body.messages[0].content.includes("no pidas al usuario que comparta archivos"));
            assert.ok(body.messages[0].content.includes("No inventes rutas ni nombres de archivo"));
            assert.ok(body.messages[0].content.includes("Una sola repo.search"));
            assert.ok(body.messages[0].content.includes("no uses conversation.respond como sustituto"));
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

test("semantic plan grounds empty model arguments in the original instruction", () => {
    const result = validatePlan({
        toolCalls: [{ name: "repo.search", args: {} }]
    }, catalog, "revisa tecnico b2b y cliente html");

    assert.equal(result.toolCalls[0].args.query, "revisa tecnico b2b y cliente html");
    assert.equal(result.toolCalls[0].args.instruction, "revisa tecnico b2b y cliente html");
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

test("semantic planner retries one malformed model output", async () => {
    let attempts = 0;
    const result = await runJarvisSemanticPlanner({
        input: "revisa la configuracion del modulo",
        catalog,
        fetchImpl: async () => {
            attempts += 1;
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    model: "semantic-test-model",
                    choices: [{
                        message: {
                            content: attempts === 1
                                ? "No puedo producir el plan."
                                : JSON.stringify({
                                    toolCalls: [{ name: "repo.search", args: { query: "modulo" } }]
                                })
                        }
                    }]
                })
            };
        }
    });

    assert.equal(attempts, 2);
    assert.deepEqual(result.toolCalls.map(call => call.name), ["repo.search"]);
});

test("semantic planner accepts long and ten-page missions without losing mission state", async () => {
    const longInstruction = Array.from({ length: 500 }, (_, index) => `Pagina y requisito ${index}: conservar evidencia.`).join("\n");
    assert.ok(longInstruction.length > 1600);
    let requestBody;
    const result = await runJarvisSemanticPlanner({
        input: longInstruction,
        catalog,
        missionState: {
            missionId: "MISSION-LONG-1",
            completedTasks: [{ name: "repo.search", args: { query: "evidencia" } }],
            pendingTasks: [],
            blockedTasks: [],
            writeAllowed: false
        },
        fetchImpl: async (_url, request) => {
            requestBody = JSON.parse(request.body);
            return {
                ok: true,
                json: async () => ({
                    model: "semantic-test-model",
                    choices: [{ message: { content: JSON.stringify({ toolCalls: [{ name: "connector.list", args: {} }] }) } }]
                })
            };
        }
    });
    assert.equal(result.toolCalls[0].name, "connector.list");
    assert.equal(requestBody.messages[1].content, longInstruction);
    assert.ok(requestBody.messages[0].content.includes("MISSION-LONG-1"));
    assert.ok(requestBody.messages[0].content.includes("No repitas una herramienta completada"));
});
