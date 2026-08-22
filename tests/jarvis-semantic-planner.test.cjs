"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
    buildModelTools,
    buildGeminiModelTools,
    buildSemanticSystemInstruction,
    compactMissionObservation,
    extractGeminiToolCallPlan,
    extractJsonObject,
    extractToolCallPlan,
    hasRequiredToolArguments,
    normalizeCatalog,
    runGeminiSemanticPlanner,
    runJarvisSemanticPlanner,
    runJarvisSemanticResponse,
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

test("semantic planner treats search as discovery rather than completed inspection", () => {
    const instruction =
        buildSemanticSystemInstruction(
            [{
                name:
                    "repo.search",
                mutates:
                    false
            }, {
                name:
                    "repo.read",
                mutates:
                    false
            }, {
                name:
                    "repo.diagnose",
                mutates:
                    false
            }],
            {
                phase:
                    "COMPLETION_AUDIT"
            }
        );

    assert.match(
        instruction,
        /repo\.search es descubrimiento inicial/
    );
    assert.match(
        instruction,
        /no satisface por si sola una solicitud que tambien pide leer/
    );
    assert.match(
        instruction,
        /devuelve missionComplete=true solamente despues de auditar/
    );
    assert.match(
        instruction,
        /query debe contener solo el objetivo concreto de investigacion/
    );
    assert.match(
        instruction,
        /no copies la mision mixta completa/
    );
});

test("semantic planner rejects calls missing schema-required arguments", () => {
    const readTool = {
        name: "repo.read",
        mutates: false,
        inputSchema: {
            type: "object",
            required: ["file"],
            properties: {
                file: { type: "string" }
            }
        }
    };

    assert.equal(hasRequiredToolArguments(readTool, {}), false);
    assert.equal(hasRequiredToolArguments(readTool, { file: "   " }), false);
    assert.equal(
        hasRequiredToolArguments(
            readTool,
            { file: "gestia-core/gestia-core.js" }
        ),
        true
    );
    assert.equal(
        validatePlan(
            {
                toolCalls: [{
                    name: "repo.read",
                    args: {}
                }]
            },
            [readTool],
            "revisa el repo"
        ).toolCalls.length,
        0
    );
});

test("semantic planner rejects empty or malformed delegation tasks before execution", () => {
    const delegationTool = {
        name:
            "agent.delegate",
        mutates:
            false,
        inputSchema: {
            type:
                "object",
            required: [
                "tasks",
                "delegationDirective"
            ],
            properties: {
                tasks: {
                    type:
                        "array",
                    minItems:
                        1,
                    items: {
                        type:
                            "object",
                        required: [
                            "tool"
                        ],
                        properties: {
                            tool: {
                                type:
                                    "string"
                            },
                            args: {
                                type:
                                    "object",
                                additionalProperties:
                                    true
                            }
                        }
                    }
                },
                delegationDirective: {
                    type:
                        "string"
                }
            }
        }
    };
    const build =
        (
            tasks,
            delegationDirective =
                "delega pruebas"
        ) =>
            validatePlan(
                {
                    toolCalls: [{
                        name:
                            "agent.delegate",
                        args: {
                            tasks,
                            delegationDirective
                        }
                    }]
                },
                [
                    delegationTool
                ],
                "delega pruebas"
            );

    assert.equal(
        build([])
            .toolCalls
            .length,
        0
    );
    assert.equal(
        build([{}])
            .toolCalls
            .length,
        0
    );
    assert.equal(
        build([{
            tool:
                ""
        }])
            .toolCalls
            .length,
        0
    );
    assert.equal(
        build([{
            tool:
                "repo.read",
            args: {
                file:
                    "app-login.js"
            }
        }])
            .toolCalls
            .length,
        1
    );
    assert.equal(
        build(
            [{
                tool:
                    "repo.read"
            }],
            "ejecuta otras cosas"
        )
            .toolCalls
            .length,
        0
    );
});

test("semantic planner rejects registered tool identifiers used as repository file paths", () => {
    const catalog = [{
        name:
            "repo.read",
        mutates:
            false,
        inputSchema: {
            type:
                "object",
            required: [
                "file"
            ],
            properties: {
                file: {
                    type:
                        "string"
                }
            }
        }
    }, {
        name:
            "repo.write",
        mutates:
            true
    }];

    assert.equal(
        validatePlan(
            {
                toolCalls: [{
                    name:
                        "repo.read",
                    args: {
                        file:
                            "repo.write"
                    }
                }]
            },
            catalog,
            "revisa el plan"
        )
            .toolCalls
            .length,
        0
    );
    assert.equal(
        validatePlan(
            {
                toolCalls: [{
                    name:
                        "repo.read",
                    args: {
                        file:
                            "app-login.js"
                    }
                }]
            },
            catalog,
            "lee app-login.js"
        )
            .toolCalls
            .length,
        1
    );
});

test("semantic planner isolates a self-contained mission from adjacent model-selected tools", () => {
    const catalog = [{
        name:
            "repo.architectReview",
        mutates:
            false,
        missionIsolation:
            "exclusive",
        inputSchema: {
            type:
                "object",
            required: [
                "instruction",
                "plan"
            ],
            properties: {
                instruction: {
                    type:
                        "string"
                },
                plan: {
                    type:
                        "object"
                }
            }
        }
    }, {
        name:
            "repo.read",
        mutates:
            false,
        inputSchema: {
            type:
                "object",
            required: [
                "file"
            ],
            properties: {
                file: {
                    type:
                        "string"
                }
            }
        }
    }, {
        name:
            "repo.diagnose",
        mutates:
            false
    }];
    const normalized =
        normalizeCatalog(
            catalog
        );
    const plan =
        validatePlan(
            {
                toolCalls: [{
                    name:
                        "repo.architectReview",
                    args: {
                        instruction:
                            "Corrige app-login.js.",
                        plan: {
                            originalInstruction:
                                "Corrige app-login.js."
                        }
                    }
                }, {
                    name:
                        "repo.read",
                    args: {
                        file:
                            "app-login.js"
                    }
                }, {
                    name:
                        "repo.diagnose",
                    args: {}
                }]
            },
            normalized,
            "Revisa solamente este plan."
        );

    assert.equal(
        normalized[0]
            .missionIsolation,
        "exclusive"
    );
    assert.deepEqual(
        plan.toolCalls.map(call =>
            call.name
        ),
        [
            "repo.architectReview"
        ]
    );
});

test("semantic planner preserves repeated tools for independent arguments", () => {
    const searchTool = {
        name: "repo.search",
        mutates: false,
        inputSchema: {
            type: "object",
            required: ["query"],
            properties: {
                query: { type: "string" }
            }
        }
    };
    const plan = validatePlan(
        {
            toolCalls: [
                {
                    name: "repo.search",
                    args: { query: "tecnico b2b" }
                },
                {
                    name: "repo.search",
                    args: { query: "admin route" }
                },
                {
                    name: "repo.search",
                    args: { query: "tecnico b2b" }
                }
            ]
        },
        [searchTool],
        "revisa ambos objetivos"
    );

    assert.deepEqual(
        plan.toolCalls.map(call => call.args.query),
        [
            "tecnico b2b",
            "admin route"
        ]
    );
});

test("mission coverage deduplicates research reformulations while preserving independent goals", async () => {
    const webCatalog = [{
        name:
            "web.research",
        description:
            "Investiga un objetivo independiente.",
        mutates:
            false,
        requiresApproval:
            false,
        missionDedupeBy: [
            "researchGoal"
        ],
        inputSchema: {
            type:
                "object",
            required: [
                "query",
                "researchGoal"
            ],
            properties: {
                query: {
                    type:
                        "string"
                },
                researchGoal: {
                    type:
                        "string"
                }
            },
            additionalProperties:
                false
        }
    }];
    let requestCount =
        0;
    const result =
        await runGeminiSemanticPlanner({
            input:
                "Investiga custom claims y, por separado, App Check.",
            catalog:
                webCatalog,
            missionState: {
                phase:
                    "MISSION_CONTRACT",
                writeAllowed:
                    false
            },
            ai: {
                lastProvider:
                    "vertex-adc",
                models: {
                    generateContent:
                        async () => {
                            requestCount +=
                                1;
                            const toolCalls =
                                requestCount === 1
                                    ? [
                                        {
                                            name:
                                                "web.research",
                                            args: {
                                                query:
                                                    "Firebase Auth custom claims",
                                                researchGoal:
                                                    "RESEARCH_1"
                                            }
                                        },
                                        {
                                            name:
                                                "web.research",
                                            args: {
                                                query:
                                                    "Firebase App Check",
                                                researchGoal:
                                                    "RESEARCH_2"
                                            }
                                        }
                                    ]
                                    : requestCount === 2
                                        ? [{
                                            name:
                                                "web.research",
                                            args: {
                                                query:
                                                    "roles con custom claims",
                                                researchGoal:
                                                    "RESEARCH_1"
                                            }
                                        }]
                                        : [{
                                            name:
                                                "web.research",
                                            args: {
                                                query:
                                                    "proteccion App Check",
                                                researchGoal:
                                                    "RESEARCH_2"
                                            }
                                        }];
                            return {
                                text:
                                    JSON.stringify({
                                        toolCalls,
                                        missionComplete:
                                            false
                                    })
                            };
                        }
                }
            }
        });

    assert.equal(
        requestCount,
        3
    );
    assert.deepEqual(
        result.toolCalls.map(
            call =>
                call.args.query
        ),
        [
            "Firebase Auth custom claims",
            "Firebase App Check"
        ]
    );
    assert.deepEqual(
        result.toolCalls.map(
            call =>
                call.missionDedupeKey
        ),
        [
            'web.research:["RESEARCH_1"]',
            'web.research:["RESEARCH_2"]'
        ]
    );
});

test("semantic response uses the authenticated provider chain and reports provenance", async () => {
    const result = await runJarvisSemanticResponse({
        input: "Integra solamente la evidencia entregada.",
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    assert.equal(request.model, "gemini-3.6-flash");
                    assert.equal(
                        request.config.maxOutputTokens,
                        3500
                    );
                    assert.equal(
                        request.config.thinkingConfig
                            .thinkingBudget,
                        0
                    );
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

test("semantic response accepts a bounded extended budget for complete mission reports", async () => {
    const result = await runJarvisSemanticResponse({
        input: "Integra todas las secciones y cierra el informe.",
        maxOutputTokens: 12000,
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    assert.equal(
                        request.config.maxOutputTokens,
                        8000
                    );
                    return {
                        text: "Informe completo. [JARVIS_REPORT_COMPLETE]"
                    };
                }
            }
        },
        fetchImpl: async () => {
            throw new Error("PUBLIC_FALLBACK_MUST_NOT_RUN");
        }
    });

    assert.equal(result.ok, true);
    assert.match(
        result.message,
        /JARVIS_REPORT_COMPLETE/
    );
});

test("semantic response fails closed when both authenticated providers are unavailable", async () => {
    await assert.rejects(() => runJarvisSemanticResponse({ input: "Integra evidencia.", ai: { models: { generateContent: async () => { throw new Error("PROVIDERS_UNAVAILABLE"); } } } }), /SEMANTIC_AUTHENTICATED_PROVIDER_PROVIDERS_UNAVAILABLE/);
});

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
        input: "analisa el repo y revisa conectores sin modificar nada", catalog,
        ai: { lastProvider: "gemini-developer", models: { generateContent: async request => {
            assert.equal(request.model, "gemini-3.6-flash");
            return { functionCalls: [{ name: "jarvis_tool_0", args: { query: "repo" } }, { name: "jarvis_tool_1", args: {} }, { name: "jarvis_tool_2", args: {} }] };
        } } }
    });
    assert.deepEqual(result.toolCalls.map(call => call.name), ["repo.search", "connector.list", "system.supervision.runNow"]);
    assert.equal(result.toolCalls[2].mutates, true);
    assert.equal(result.toolCalls[2].approved, false);
});

test("mission contract fails closed when the authenticated provider is unavailable", async () => {
    let simpleCalls = 0;
    let compatibleCalls = 0;
    await assert.rejects(
        () => runJarvisSemanticPlanner({
            input: "Investiga, entrega diagnostico y revisa conectores sin escribir.",
            catalog,
            missionState: {
                phase: "MISSION_CONTRACT",
                writeAllowed: false,
                existingInitialTools: ["repo.search", "connector.list"]
            },
            ai: {
                models: {
                    generateContent: async () => {
                        throw new Error("VERTEX_UNAVAILABLE");
                    }
                }
            },
            simpleFetchImpl: async () => {
                simpleCalls += 1;
                return { ok: true, text: async () => JSON.stringify({ toolCalls: [{ name: "repo.search", args: { query: "diagnostico" } }] }) };
            },
            fetchImpl: async () => {
                compatibleCalls += 1;
                throw new Error("PUBLIC_FALLBACK_MUST_NOT_RUN");
            }
        }),
        /SEMANTIC_AUTHENTICATED_PROVIDER_VERTEX_UNAVAILABLE/
    );
    assert.equal(simpleCalls, 0);
    assert.equal(compatibleCalls, 0);
});

test("mission evidence compaction preserves verified sources without carrying raw payloads", () => {
    const compact = compactMissionObservation({
        ok: true,
        status: "WEB_RESEARCH_READY",
        summary: "Evidencia primaria verificada.",
        validSources: [{ title: "SUMM", url: "https://www.summ.com.mx/" }],
        evidence: { campaign: { audience: "Empresas", cta: "Agenda" } },
        rawHtml: "x".repeat(50000)
    });

    assert.equal(compact.status, "WEB_RESEARCH_READY");
    assert.equal(compact.validSources[0].url, "https://www.summ.com.mx/");
    assert.equal(compact.evidence.campaign.cta, "Agenda");
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

test("semantic planner uses the authenticated two-provider authority without a public fallback", async () => {
    let fallbackCalls = 0;
    const result = await runJarvisSemanticPlanner({
        input: "investiga SUMM y prepara una campana sin publicar",
        catalog,
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    assert.equal(request.model, "gemini-3.6-flash");
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

test("Gemini completion audit is JSON-only and selects one executable follow-up", async () => {
    const result = await runGeminiSemanticPlanner({
        input: "Busca los registros y revisa el archivo real sin escribir.",
        catalog: [{
            name: "repo.read",
            description: "Lee un archivo real.",
            mutates: false,
            inputSchema: {
                type: "object",
                required: ["file"],
                properties: {
                    file: { type: "string" }
                },
                additionalProperties: false
            }
        }],
        missionState: {
            phase: "COMPLETION_AUDIT",
            completedTasks: [{
                name: "repo.search",
                observation: {
                    results: [{
                        file: "gestia-core/jarvis/jarvis.multitool.pack.js"
                    }]
                }
            }],
            pendingTasks: [],
            blockedTasks: []
        },
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    assert.equal(request.config.responseMimeType, "application/json");
                    assert.equal(request.config.tools, undefined);
                    assert.equal(request.toolConfig, undefined);
                    assert.match(request.contents, /AUDITORIA_DE_CIERRE_CONTROLADA/);
                    return {
                        text: JSON.stringify({
                            toolCalls: [{
                                name: "repo.read",
                                args: {
                                    file: "gestia-core/jarvis/jarvis.multitool.pack.js"
                                }
                            }],
                            missionComplete: false,
                            completionAssessment: {
                                missing: ["lectura real"]
                            }
                        })
                    };
                }
            }
        }
    });

    assert.equal(result.planKind, "COMPLETION_AUDIT");
    assert.deepEqual(result.toolCalls, [{
        name: "repo.read",
        args: {
            file: "gestia-core/jarvis/jarvis.multitool.pack.js"
        },
        reason: "MODEL_SEMANTIC_TOOL_SELECTION",
        mutates: false,
        approved: false
    }]);
    assert.equal(result.missionComplete, false);
});

test("Gemini completion audit can close without a forced tool call", async () => {
    const result = await runGeminiSemanticPlanner({
        input: "Confirma que el diagnostico ya esta completo.",
        catalog,
        missionState: {
            phase: "COMPLETION_AUDIT",
            completedTasks: [{ name: "repo.search" }],
            pendingTasks: [],
            blockedTasks: []
        },
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    assert.equal(request.config.tools, undefined);
                    return {
                        text: JSON.stringify({
                            toolCalls: [],
                            missionComplete: true,
                            completionAssessment: {
                                missing: []
                            }
                        })
                    };
                }
            }
        }
    });

    assert.equal(result.toolCalls.length, 0);
    assert.equal(result.missionComplete, true);
    assert.equal(result.planKind, "COMPLETION_AUDIT");
});

test("Gemini creates a complete read-only mission contract before execution", async () => {
    let requestCount = 0;
    const result = await runGeminiSemanticPlanner({
        input: "Investiga el dominio oficial y revisa conectores sin escribir.",
        catalog,
        missionState: {
            phase: "MISSION_CONTRACT",
            writeAllowed: false,
            existingInitialTools: [
                "repo.search",
                "connector.list"
            ]
        },
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    requestCount += 1;
                    assert.equal(request.config.responseMimeType, "application/json");
                    assert.equal(request.config.tools, undefined);
                    assert.match(
                        request.contents,
                        /HERRAMIENTAS_INICIALES=repo\.search,connector\.list/
                    );
                    if (requestCount === 1) {
                        assert.equal(request.config.thinkingConfig.thinkingBudget, 0);
                        assert.equal(request.config.maxOutputTokens, 4000);
                        assert.ok(request.contents.includes("CONTRATO_DE_MISION"));
                        assert.ok(request.contents.includes("todas las herramientas read-only y userArtifact necesarias"));
                    } else if (requestCount === 2) {
                        assert.equal(request.config.thinkingConfig.thinkingBudget, 0);
                        assert.equal(request.config.maxOutputTokens, 3000);
                        assert.ok(request.contents.includes("AUDITORIA_SEMANTICA_DE_COBERTURA"));
                    } else {
                        assert.equal(request.config.thinkingConfig.thinkingBudget, 256);
                        assert.equal(request.config.maxOutputTokens, 4000);
                        assert.ok(request.contents.includes("MUESTRA_SEMANTICA_INDEPENDIENTE_DE_COBERTURA"));
                    }
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

    assert.equal(result.planKind, "MISSION_CONTRACT_AUDITED");
    assert.equal(requestCount, 3);
    assert.deepEqual(result.toolCalls.map(call => call.name), ["repo.search", "connector.list"]);
    assert.equal(result.missionComplete, false);
});

test("Gemini coverage audit restores an independent subject omitted by the draft contract", async () => {
    const coverageCatalog = [{
        name: "repo.search",
        description: "Busca cada sujeto independiente en el repositorio.",
        mutates: false,
        requiresApproval: false,
        inputSchema: {
            type: "object",
            required: ["query"],
            properties: {
                query: { type: "string" }
            }
        }
    }];
    const requests = [];
    const result = await runGeminiSemanticPlanner({
        input: "Reviza tecnico b2b, app-login.js y firebase.js; explica el salto de cliente a admin.",
        catalog: coverageCatalog,
        missionState: { phase: "MISSION_CONTRACT", writeAllowed: false },
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    requests.push(request);
                    if (requests.length === 1) {
                        return {
                            functionCalls: [{
                                name: "jarvis_mission_contract",
                                args: {
                                    toolCalls: [
                                        { name: "repo.search", args: { query: "app-login.js" } },
                                        { name: "repo.search", args: { query: "firebase.js" } }
                                    ],
                                    completionAssessment: {
                                        covered: ["salto de cliente a admin"]
                                    }
                                }
                            }]
                        };
                    }
                    return {
                        text: JSON.stringify({
                            toolCalls: [{
                                name: "repo.search",
                                args: { query: "tecnico b2b" }
                            }],
                            missionComplete: false,
                            completionAssessment: {
                                restored: ["tecnico b2b"]
                            }
                        })
                    };
                }
            }
        }
    });

    assert.equal(requests.length, 3);
    assert.match(requests[1].contents, /AUDITORIA_SEMANTICA_DE_COBERTURA/);
    assert.match(requests[1].contents, /BORRADOR_DE_CONTRATO/);
    assert.match(requests[2].contents, /MUESTRA_SEMANTICA_INDEPENDIENTE_DE_COBERTURA/);
    assert.deepEqual(
        result.toolCalls.map(call => call.args.query),
        ["app-login.js", "firebase.js", "tecnico b2b"]
    );
    assert.equal(result.planKind, "MISSION_CONTRACT_AUDITED");
});

test("independent Gemini coverage restores a specialized deliverable missed twice", async () => {
    const campaignCatalog = [
        "web.research",
        "marketing.plan",
        "page.plan",
        "image.plan",
        "reel.plan"
    ].map(name => ({
        name,
        description: `Herramienta ${name}`,
        mutates: false,
        requiresApproval: false,
        inputSchema: name === "reel.plan"
            ? {
                type: "object",
                required: [
                    "brandName",
                    "title",
                    "cta",
                    "durationSeconds",
                    "scenes"
                ],
                properties: {
                    brandName: { type: "string" },
                    title: { type: "string" },
                    cta: { type: "string" },
                    durationSeconds: { type: "number" },
                    scenes: { type: "array" }
                }
            }
            : null
    }));
    let requestCount = 0;
    const result = await runGeminiSemanticPlanner({
        input: "Investiga el dominio y entrega marketing, landing, imagen y reel de 30 segundos.",
        catalog: campaignCatalog,
        missionState: { phase: "MISSION_CONTRACT", writeAllowed: false },
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    requestCount += 1;
                    if (requestCount < 3) {
                        return {
                            text: JSON.stringify({
                                toolCalls: [
                                    { name: "web.research", args: { query: "dominio" } },
                                    { name: "marketing.plan", args: {} },
                                    { name: "page.plan", args: {} },
                                    { name: "image.plan", args: {} }
                                ],
                                missionComplete: false
                            })
                        };
                    }
                    assert.match(
                        request.contents,
                        /MUESTRA_SEMANTICA_INDEPENDIENTE_DE_COBERTURA/
                    );
                    return {
                        text: JSON.stringify({
                            toolCalls: [{
                                name: "reel.plan",
                                args: {
                                    durationSeconds: 30
                                }
                            }],
                            missionComplete: false,
                            completionAssessment: {
                                restored: ["reel de 30 segundos"]
                            }
                        })
                    };
                }
            }
        }
    });

    assert.equal(requestCount, 3);
    assert.deepEqual(
        result.toolCalls.map(call => call.name),
        [
            "web.research",
            "marketing.plan",
            "page.plan",
            "image.plan",
            "reel.plan"
        ]
    );
    assert.equal(
        result.toolCalls[4].args.durationSeconds,
        30
    );
    assert.equal(
        result.toolCalls[4].deferred,
        true
    );
});

test("Gemini reserves response budget for evidence-driven mission follow-ups", async () => {
    const result = await runGeminiSemanticPlanner({
        input: "Continua con el siguiente entregable real.",
        catalog,
        missionState: {
            missionId: "MISSION-BUDGET",
            completedTasks: [{ name: "repo.search", observation: { ok: true } }],
            pendingTasks: [],
            blockedTasks: []
        },
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    assert.equal(request.config.thinkingConfig.thinkingBudget, 0);
                    assert.equal(request.config.maxOutputTokens, 3000);
                    return {
                        functionCalls: [{
                            name: "jarvis_tool_1",
                            args: {}
                        }]
                    };
                }
            }
        }
    });

    assert.equal(result.toolCalls[0].name, "connector.list");
});

test("Gemini accepts a strict JSON mission contract when the provider omits native function calls", async () => {
    const result = await runGeminiSemanticPlanner({
        input: "Investiga, prepara marketing y una pagina sin escribir.",
        catalog,
        missionState: { phase: "MISSION_CONTRACT", writeAllowed: false },
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async () => ({
                    text: JSON.stringify({
                        toolCalls: [
                            { name: "repo.search", args: { query: "investigacion" } },
                            { name: "connector.list", args: {} }
                        ],
                        completionAssessment: {
                            covered: ["investigacion", "marketing", "pagina"]
                        }
                    })
                })
            }
        }
    });

    assert.equal(result.planKind, "MISSION_CONTRACT_AUDITED");
    assert.deepEqual(result.toolCalls.map(call => call.name), ["repo.search", "connector.list"]);
    assert.equal(result.missionComplete, false);
});

test("semantic planner accepts long and ten-page missions without losing mission state", async () => {
    const longInstruction = Array.from({ length: 500 }, (_, index) => `Pagina y requisito ${index}: conservar evidencia.`).join("\n");
    assert.ok(longInstruction.length > 1600);
    let providerRequest = null;
    const result = await runJarvisSemanticPlanner({
        input: longInstruction, catalog,
        missionState: { missionId: "MISSION-LONG-1", completedTasks: [{ name: "repo.search", args: { query: "evidencia" } }], pendingTasks: [], blockedTasks: [], writeAllowed: false },
        ai: { lastProvider: "gemini-developer", models: { generateContent: async request => { providerRequest = request; return { functionCalls: [{ name: "jarvis_tool_1", args: {} }] }; } } }
    });
    assert.equal(result.toolCalls[0].name, "connector.list");
    assert.equal(providerRequest.model, "gemini-3.6-flash");
    assert.ok(String(providerRequest.contents).includes(longInstruction));
    assert.ok(String(providerRequest.contents).includes("MISSION-LONG-1"));
    assert.ok(String(providerRequest.contents).includes("No repitas una herramienta completada"));
});

test("authenticated completion audit uses JSON without function declarations", async () => {
    let request = null;
    const catalog = [{
        name: "marketing.plan",
        description: "Completa marketing pendiente.",
        mutates: false,
        inputSchema: {
            type: "object",
            required: ["brandName"],
            properties: { brandName: { type: "string" } }
        }
    }];
    const result = await runGeminiSemanticPlanner({
        input: "Completa la mision actual.",
        catalog,
        missionState: { phase: "COMPLETION_AUDIT", completedTasks: [] },
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async value => {
                    request = value;
                    return {
                        text: JSON.stringify({
                            toolCalls: [{ name: "marketing.plan", args: { brandName: "Taquería El Dorado" } }],
                            missionComplete: false
                        })
                    };
                }
            }
        }
    });
    assert.equal(request.config.responseMimeType, "application/json");
    assert.equal(Object.prototype.hasOwnProperty.call(request.config, "tools"), false);
    assert.equal(result.provider, "vertex-adc");
    assert.equal(result.planKind, "COMPLETION_AUDIT");
    assert.equal(result.toolCalls[0].name, "marketing.plan");
});

test("authenticated grounded argument completion retries JSON and never needs the public planner", async () => {
    let attempts = 0;
    const reelTool = {
        name: "reel.plan",
        description: "Completa el reel seleccionado.",
        mutates: false,
        inputSchema: {
            type: "object",
            required: ["durationSeconds", "scenes"],
            properties: {
                durationSeconds: { type: "integer" },
                scenes: {
                    type: "array",
                    minItems: 1,
                    items: {
                        type: "object",
                        required: ["id", "durationSeconds"],
                        properties: {
                            id: { type: "string" },
                            durationSeconds: { type: "integer" }
                        }
                    }
                }
            }
        }
    };
    const result = await runGeminiSemanticPlanner({
        input: "Prepara solo argumentos ejecutables para reel.plan.",
        catalog: [reelTool],
        missionState: { phase: "GROUNDED_ARGUMENT_COMPLETION", toolName: "reel.plan" },
        ai: {
            lastProvider: "vertex-adc",
            models: {
                generateContent: async request => {
                    attempts += 1;
                    assert.equal(request.config.responseMimeType, "application/json");
                    assert.equal(Object.prototype.hasOwnProperty.call(request.config, "tools"), false);
                    return {
                        text: JSON.stringify(attempts === 1
                            ? { toolCalls: [], missionComplete: false }
                            : {
                                toolCalls: [{
                                    name: "reel.plan",
                                    args: {
                                        durationSeconds: 30,
                                        scenes: [{ id: "scene-1", durationSeconds: 30 }]
                                    }
                                }],
                                missionComplete: false
                            })
                    };
                }
            }
        }
    });
    assert.equal(attempts, 2);
    assert.equal(result.provider, "vertex-adc");
    assert.equal(result.planKind, "GROUNDED_ARGUMENT_COMPLETION");
    assert.equal(result.toolCalls[0].args.durationSeconds, 30);
});
