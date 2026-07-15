"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
    buildModelTools,
    buildGeminiModelTools,
    compactMissionObservation,
    extractGeminiToolCallPlan,
    extractJsonObject,
    extractToolCallPlan,
    requestModel,
    runGeminiSemanticPlanner,
    runSimpleSemanticPlanner,
    runJarvisSemanticPlanner,
    runJarvisSemanticResponse,
    validatePlan
} = require("../functions/jarvis-semantic-planner");

test("semantic response uses the authenticated provider chain and reports provenance", async () => {
    const result = await runJarvisSemanticResponse({
        input: "Integra solamente la evidencia entregada.",
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    assert.equal(request.model, "gemini-2.5-flash");
                    return { text: "Resultado integrado con evidencia." };
                }
            }
        },
        fetchImpl: async () => {
            throw new Error("PUBLIC_FALLBACK_MUST_NOT_RUN");
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.provider, "vertex-adc");
    assert.equal(result.message, "Resultado integrado con evidencia.");
});

test("semantic response falls back when the authenticated providers are unavailable", async () => {
    const result = await runJarvisSemanticResponse({
        input: "Integra evidencia.",
        ai: {
            models: {
                generateContent: async () => {
                    throw new Error("PROVIDERS_UNAVAILABLE");
                }
            }
        },
        fetchImpl: async () => ({
            ok: true,
            json: async () => ({
                model: "openai-fast",
                choices: [{ message: { content: "Composicion de respaldo." } }]
            })
        })
    });

    assert.equal(result.ok, true);
    assert.equal(result.provider, "pollinations");
    assert.equal(result.message, "Composicion de respaldo.");
});

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
    assert.equal(modelTools[0].function.parameters.properties.query.type, "string");
    assert.equal(modelTools[0].function.parameters.additionalProperties, false);

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
    assert.equal(declarations[0].parametersJsonSchema.properties.query.type, "string");
    assert.equal(declarations[0].parametersJsonSchema.additionalProperties, false);

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
            assert.ok(body.messages[0].content.includes("Para investigar informacion publica actual"));
            assert.ok(body.messages[0].content.includes("browser.inspect se reserva para diagnostico tecnico"));
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

test("simple anonymous planner returns a validated compact semantic plan", async () => {
    let requestedUrl = "";
    const result = await runSimpleSemanticPlanner({
        input: "investiga SUMM y despues prepara marketing",
        catalog,
        missionState: {
            missionId: "MISSION-SIMPLE-1",
            completedTasks: [{ name: "repo.search" }],
            pendingTasks: [],
            blockedTasks: [],
            iterations: 1
        },
        fetchImpl: async url => {
            requestedUrl = url;
            return {
                ok: true,
                text: async () => JSON.stringify({
                    toolCalls: [{ name: "connector.list", args: {}, reason: "siguiente herramienta" }]
                })
            };
        }
    });

    assert.ok(requestedUrl.startsWith("https://text.pollinations.ai/"));
    assert.ok(requestedUrl.includes("json=true"));
    assert.equal(result.provider, "pollinations-simple-json");
    assert.equal(result.toolCalls[0].name, "connector.list");
    assert.equal(result.toolCalls[0].approved, false);
});

test("empty simple plan cannot terminate the real provider chain", async () => {
    let compatibleCalls = 0;
    const result = await runJarvisSemanticPlanner({
        input: "investiga SUMM y prepara marketing",
        catalog,
        simpleFetchImpl: async () => ({
            ok: true,
            text: async () => JSON.stringify({ toolCalls: [], explanation: "" })
        }),
        fetchImpl: async () => {
            compatibleCalls += 1;
            return {
                ok: true,
                json: async () => ({
                    model: "compatible-recovery-model",
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

    assert.equal(compatibleCalls, 1);
    assert.equal(result.provider, "pollinations");
    assert.equal(result.toolCalls[0].name, "repo.search");
});

test("mission contract uses the dedicated complete simple-model prompt", async () => {
    const urls = [];
    const result = await runJarvisSemanticPlanner({
        input: "Investiga, entrega diagnostico y revisa conectores sin escribir.",
        catalog,
        missionState: { phase: "MISSION_CONTRACT", writeAllowed: false },
        ai: {
            models: {
                generateContent: async () => {
                    throw new Error("VERTEX_MUST_NOT_RUN_FOR_CONTRACT");
                }
            }
        },
        simpleFetchImpl: async url => {
            urls.push(url);
            return {
                ok: true,
                text: async () => JSON.stringify({
                    toolCalls: [
                        { name: "repo.search", args: { query: "diagnostico" } },
                        { name: "connector.list", args: {} }
                    ],
                    missionComplete: false
                })
            };
        },
        fetchImpl: async () => {
            throw new Error("COMPATIBLE_FALLBACK_MUST_NOT_RUN");
        }
    });

    assert.ok(urls[0].includes("seed=84"));
    assert.ok(urls[0].includes("CONTRATO%20COMPLETO"));
    assert.deepEqual(result.toolCalls.map(call => call.name), ["repo.search", "connector.list"]);
    assert.equal(result.provider, "pollinations-simple-json");
});

test("malformed mission contract retries with another semantic sample", async () => {
    const urls = [];
    const result = await runSimpleSemanticPlanner({
        input: "Investiga y revisa conectores.",
        catalog,
        missionState: { phase: "MISSION_CONTRACT", writeAllowed: false },
        fetchImpl: async url => {
            urls.push(url);
            return {
                ok: true,
                text: async () => urls.length === 1
                    ? "salida sin json"
                    : JSON.stringify({
                            toolCalls: [
                                { name: "repo.search", args: { query: "investigacion" } },
                                { name: "connector.list", args: {} }
                            ],
                            missionComplete: false
                        })
            };
        }
    });

    assert.ok(urls[0].includes("seed=84"));
    assert.ok(urls[1].includes("seed=85"));
    assert.deepEqual(result.toolCalls.map(call => call.name), ["repo.search", "connector.list"]);
});

test("simple planner keeps a sixty-tool catalog inside a safe URL budget", async () => {
    const largeCatalog = Array.from({ length: 60 }, (_, index) => ({
        name: `domain${index}.tool${index}`,
        description: "Descripcion operacional extensa ".repeat(30),
        mutates: index % 9 === 0
    }));
    let requestedUrl = "";
    await runSimpleSemanticPlanner({
        input: "Planifica la siguiente accion de una mision extensa sin escribir.",
        catalog: largeCatalog,
        fetchImpl: async url => {
            requestedUrl = url;
            return {
                ok: true,
                text: async () => JSON.stringify({ toolCalls: [{ name: "domain1.tool1", args: {} }] })
            };
        }
    });

    assert.ok(requestedUrl.length < 7000);
    assert.equal(requestedUrl.includes("Descripcion%20operacional%20extensa"), false);
});

test("simple planner enriches selected specialized tools with grounded schema arguments", async () => {
    const specializedCatalog = [{
        name: "marketing.plan",
        description: "Planifica marketing con evidencia.",
        mutates: false,
        inputSchema: {
            brandName: "string",
            audience: "string",
            offer: "string",
            webResearch: "array"
        }
    }];
    const urls = [];
    const result = await runSimpleSemanticPlanner({
        input: "Prepara marketing para SUMM con la investigacion completada.",
        catalog: specializedCatalog,
        missionState: {
            missionId: "MISSION-ENRICH-1",
            completedTasks: [{
                name: "web.research",
                observation: {
                    summary: "SUMM presta servicios juridicos.",
                    validSources: [{ title: "SUMM", url: "https://www.summ.com.mx/" }]
                }
            }]
        },
        fetchImpl: async url => {
            urls.push(url);
            return {
                ok: true,
                text: async () => JSON.stringify(
                    urls.length === 1
                        ? { toolCalls: [{ name: "marketing.plan", args: {} }] }
                        : {
                            toolCalls: [{
                                name: "marketing.plan",
                                args: {
                                    brandName: "SUMM",
                                    audience: "empresas",
                                    offer: "servicios juridicos",
                                    webResearch: [{ url: "https://www.summ.com.mx/" }]
                                }
                            }]
                        }
                )
            };
        }
    });

    assert.equal(urls.length, 2);
    assert.ok(urls[1].includes("HERRAMIENTAS_Y_ESQUEMAS"));
    assert.equal(result.toolCalls[0].args.brandName, "SUMM");
    assert.equal(result.toolCalls[0].args.webResearch[0].url, "https://www.summ.com.mx/");
});

test("mission evidence compaction preserves verified sources without carrying raw payloads", () => {
    const compact = compactMissionObservation({
        ok: true,
        status: "WEB_RESEARCH_READY",
        summary: "Evidencia primaria verificada.",
        validSources: [{ title: "SUMM", url: "https://www.summ.com.mx/" }],
        rawHtml: "x".repeat(50000)
    });

    assert.equal(compact.status, "WEB_RESEARCH_READY");
    assert.equal(compact.validSources[0].url, "https://www.summ.com.mx/");
    assert.equal(Object.hasOwn(compact, "rawHtml"), false);
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
            lastProvider: "vertex-adc",
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

    assert.equal(result.provider, "vertex-adc");
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

test("Gemini audits mission completion when native function output is empty", async () => {
    let calls = 0;
    const result = await runGeminiSemanticPlanner({
        input: "Investiga y despues entrega el diagnostico faltante.",
        catalog,
        missionState: {
            missionId: "MISSION-AUDIT-1",
            completedTasks: [{ name: "connector.list" }],
            pendingTasks: [],
            blockedTasks: []
        },
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    calls += 1;
                    if (calls === 1) return {};
                    assert.equal(request.config.responseMimeType, "application/json");
                    return {
                        text: JSON.stringify({
                            toolCalls: [{ name: "repo.search", args: { query: "diagnostico" } }],
                            missionComplete: false,
                            completionAssessment: { missing: ["diagnostico"] }
                        })
                    };
                }
            }
        }
    });

    assert.equal(calls, 2);
    assert.equal(result.toolCalls[0].name, "repo.search");
    assert.equal(result.missionComplete, false);
});

test("Gemini creates a complete read-only mission contract before execution", async () => {
    const result = await runGeminiSemanticPlanner({
        input: "Investiga el dominio oficial y revisa conectores sin escribir.",
        catalog,
        missionState: { phase: "MISSION_CONTRACT", writeAllowed: false },
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    assert.equal(
                        request.config.tools[0].functionDeclarations[0].name,
                        "jarvis_mission_contract"
                    );
                    assert.deepEqual(
                        request.config.toolConfig.functionCallingConfig.allowedFunctionNames,
                        ["jarvis_mission_contract"]
                    );
                    assert.ok(request.contents.includes("CONTRATO_DE_MISION"));
                    assert.ok(request.contents.includes("todas las herramientas read-only necesarias"));
                    return {
                        functionCalls: [{
                            name: "jarvis_mission_contract",
                            args: {
                                toolCalls: [
                                    { name: "repo.search", args: { query: "dominio oficial" } },
                                    { name: "connector.list", args: {} }
                                ],
                                completionAssessment: {
                                    covered: ["investigacion", "conectores"]
                                }
                            }
                        }]
                    };
                }
            }
        }
    });

    assert.equal(result.planKind, "MISSION_CONTRACT");
    assert.deepEqual(result.toolCalls.map(call => call.name), ["repo.search", "connector.list"]);
    assert.equal(result.missionComplete, false);
});

test("semantic mission completion requires an explicit model audit", async () => {
    const result = await runSimpleSemanticPlanner({
        input: "Cierra solamente si todos los entregables estan listos.",
        catalog,
        missionState: {
            missionId: "MISSION-AUDIT-2",
            completedTasks: catalog.map(item => ({ name: item.name })),
            pendingTasks: [],
            blockedTasks: []
        },
        fetchImpl: async () => ({
            ok: true,
            text: async () => JSON.stringify({
                toolCalls: [],
                missionComplete: true,
                completionAssessment: { missing: [], satisfied: ["todos"] }
            })
        })
    });

    assert.equal(result.toolCalls.length, 0);
    assert.equal(result.missionComplete, true);
    assert.deepEqual(result.completionAssessment.missing, []);
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
