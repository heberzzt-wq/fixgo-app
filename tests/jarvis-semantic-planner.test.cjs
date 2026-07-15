"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
    buildModelTools,
    buildGeminiModelTools,
    extractGeminiToolCallPlan,
    extractJsonObject,
    extractToolCallPlan,
    requestModel,
    runGeminiSemanticPlanner,
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

test("semantic planner maps Gemini native function calls to the runtime catalog", () => {
    const declarations = buildGeminiModelTools(catalog);
    assert.equal(declarations[0].name, "jarvis_tool_0");
    assert.ok(declarations[0].description.includes("repo.search"));

    const plan = extractGeminiToolCallPlan({
        functionCalls: [
            { name: "jarvis_tool_0", args: { query: "SUMM" } },
            { name: "jarvis_tool_1", args: {} },
            { name: "invented_tool", args: {} }
        ]
    }, catalog);

    assert.deepEqual(plan.toolCalls.map(call => call.name), ["repo.search", "connector.list"]);
    assert.equal(plan.toolCalls[0].args.query, "SUMM");
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
            assert.equal(body.tool_choice, "required");
            assert.equal(body.model, "openai-fast");
            assert.deepEqual(body.response_format, { type: "json_object" });
            assert.equal(body.tools[0].function.name, "jarvis_tool_0");
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

test("public semantic fallback consumes native provider tool calls", async () => {
    const result = await runJarvisSemanticPlanner({
        input: "investiga SUMM con fuentes",
        catalog,
        fetchImpl: async (_url, request) => {
            const body = JSON.parse(request.body);
            assert.equal(body.tool_choice, "required");
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    model: "openai-compatible-test",
                    choices: [{
                        message: {
                            tool_calls: [{
                                function: {
                                    name: "jarvis_tool_0",
                                    arguments: JSON.stringify({ query: "site:summ.com.mx SUMM" })
                                }
                            }]
                        }
                    }]
                })
            };
        }
    });

    assert.equal(result.provider, "pollinations");
    assert.equal(result.toolCalls[0].name, "repo.search");
    assert.equal(result.toolCalls[0].args.query, "site:summ.com.mx SUMM");
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

test("semantic planner uses authenticated Gemini before the public fallback", async () => {
    let fallbackCalls = 0;
    const result = await runJarvisSemanticPlanner({
        input: "investiga SUMM y prepara una campana sin publicar",
        catalog,
        ai: {
            models: {
                generateContent: async request => {
                    assert.equal(request.model, "gemini-2.5-flash");
                    assert.ok(request.contents.includes("INSTRUCCION_ORIGINAL_INMUTABLE="));
                    return {
                        functionCalls: [
                            { name: "jarvis_tool_0", args: { query: "SUMM" } },
                            { name: "jarvis_tool_1", args: {} }
                        ]
                    };
                }
            }
        },
        fetchImpl: async () => {
            fallbackCalls += 1;
            throw new Error("PUBLIC_FALLBACK_MUST_NOT_RUN");
        }
    });

    assert.equal(result.provider, "gemini");
    assert.deepEqual(result.toolCalls.map(call => call.name), ["repo.search", "connector.list"]);
    assert.equal(fallbackCalls, 0);
});

test("Gemini semantic plan remains bounded by the real runtime catalog", async () => {
    const result = await runGeminiSemanticPlanner({
        input: "revisa conectores",
        catalog,
        ai: {
            models: {
                generateContent: async () => ({
                    text: JSON.stringify({
                        toolCalls: [
                            { name: "connector.list", args: {} },
                            { name: "invented.write", args: { approved: true } },
                            { name: "system.supervision.runNow", args: {}, approved: true }
                        ]
                    })
                })
            }
        }
    });

    assert.deepEqual(result.toolCalls.map(call => call.name), [
        "connector.list",
        "system.supervision.runNow"
    ]);
    assert.equal(result.toolCalls[1].approved, false);
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
