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
    normalizeTextToolPlan,
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

test("semantic planner system instruction is generic and catalog-driven", () => {
    const instruction = buildSemanticSystemInstruction(
        [{
            name: "repo.search",
            description: "Busca evidencia dentro del repositorio.",
            mutates: false
        }, {
            name: "repo.read",
            description: "Lee un archivo real del repositorio.",
            mutates: false
        }],
        {
            phase: "COMPLETION_AUDIT",
            completedTasks: []
        }
    );

    assert.match(instruction, /unica autoridad semantica/);
    assert.match(instruction, /catalogo runtime y los schemas/);
    assert.match(instruction, /No inventes nombres de herramientas, archivos, rutas/);
    assert.match(instruction, /approved siempre es false/);
    assert.match(instruction, /ESTADO_DE_MISION=/);
    assert.match(instruction, /repo\.search/);
    assert.match(instruction, /repo\.read/);
});

test("semantic planner contains no hardcoded media or mini-drama playbook", () => {
    const instruction = buildSemanticSystemInstruction([
        { name: "media.analyze", description: "Analiza evidencia multimedia.", mutates: false },
        { name: "video.generate", description: "Genera video.", mutates: true },
        { name: "image.generate", description: "Genera imagen.", mutates: true },
        { name: "reel.plan", description: "Planea reel.", mutates: false }
    ], {
        phase: "MISSION_CONTRACT"
    });

    assert.doesNotMatch(instruction, /fotografias de identidad/i);
    assert.doesNotMatch(instruction, /una sola llamada video\.generate/i);
    assert.doesNotMatch(instruction, /collage o reel de imagenes/i);
    assert.doesNotMatch(instruction, /mini drama/i);
    assert.match(instruction, /CATALOGO=/);
});


test("current-turn conversational gate classifies then responds with the same local model", async () => {
    let calls = 0;
    const requestsSeen = [];
    const ai = {
        lastProvider: "ollama-openai-compatible-local",
        models: {
            async generateContent(request) {
                calls += 1;
                requestsSeen.push(request);
                if (calls === 1) {
                    return {
                        text: JSON.stringify({
                            mode: "chat"
                        })
                    };
                }
                return {
                    text: "A toda madre, pariente."
                };
            }
        }
    };
    const result = await runJarvisSemanticPlanner({
        ai,
        input: "Qué tal pariente, ¿cómo estás?",
        catalog: [{
            name: "conversation.respond",
            description: "Responde directamente cuando basta conversar.",
            mutates: false
        }],
        missionState: {
            phase: "CURRENT_TURN",
            conversationalGate: true,
            advisorySemanticContext: {
                turns: [
                    { role: "user", content: "Buenas noches, pariente." },
                    { role: "assistant", content: "Buenas noches, pariente. ¿Qué tal todo?" },
                    { role: "user", content: "Qué tal pariente, ¿cómo estás?" }
                ]
            }
        }
    });

    assert.equal(calls, 2);
    const gateRequest = requestsSeen[0];
    const responseRequest = requestsSeen[1];
    assert.equal(
        gateRequest?.config?.modelProfile,
        "conversation"
    );
    assert.equal(
        gateRequest.config.chatMessages.filter(item => item.role === "system").length,
        1
    );
    assert.equal(gateRequest.config.chatMessages.at(-1).content, "Qué tal pariente, ¿cómo estás?");
    assert.doesNotMatch(JSON.stringify(gateRequest.config.chatMessages), /Buenas noches, pariente/);
    assert.match(gateRequest.config.chatMessages[0].content, /new tool evidence/);
    assert.equal(
        responseRequest?.config?.modelProfile,
        "conversation"
    );
    assert.equal(
        responseRequest?.config?.chatMessages?.at(-1)?.content,
        "Qué tal pariente, ¿cómo estás?"
    );
    assert.doesNotMatch(
        String(responseRequest?.contents || ""),
        /Buenas noches, pariente\. ¿Qué tal todo\?/
    );
    assert.match(
        String(responseRequest?.contents || ""),
        /No inventes acciones ejecutadas/
    );
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, "conversation.respond");
    assert.equal(
        result.toolCalls[0].reason,
        "MODEL_DIRECT_CONVERSATION_RESPONSE"
    );
    assert.equal(
        result.toolCalls[0].args.prompt,
        "A toda madre, pariente."
    );
});

test("missing information becomes a question without executing or completing the mission", async () => {
    const requests = [];
    const result = await runJarvisSemanticPlanner({
        input: "busca un six cercano",
        catalog: [{ name: "conversation.respond", mutates: false }],
        missionState: { phase: "CURRENT_TURN", conversationalGate: true },
        ai: { models: { async generateContent(request) {
            requests.push(request);
            return { text: '{"missing":"ubicacion del usuario","mode":"clarify","question":"¿En qué ciudad o colonia quieres que busque?"}' };
        } } }
    });
    assert.equal(requests.length, 1, "do not reinterpret a model-selected question with another inference");
    assert.equal(result.toolCalls[0].name, "conversation.respond");
    assert.equal(result.toolCalls[0].reason, "MODEL_DIRECT_CLARIFICATION_REQUEST");
    assert.equal(result.toolCalls[0].args.prompt, "¿En qué ciudad o colonia quieres que busque?");
    assert.equal(result.missionComplete, false);
});

test("a follow-up retains supplied context in both tool selection and arguments without claiming evidence", async () => {
    const turns = [{ role: "user", content: "busca un six cercano" }, { role: "assistant", content: "¿En qué zona?", status: "CLARIFICATION_REQUIRED" }];
    const tools = [...catalog, { name: "web.research", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }];
    let calls = 0;
    const result = await runJarvisSemanticPlanner({
        input: "en el centro de Cancún", catalog: tools,
        missionState: { phase: "CURRENT_TURN", advisorySemanticContext: { turns } },
        retrieveToolCandidates: async action => {
            assert.equal(action, "search web for local businesses");
            return tools.filter(tool => tool.name === "web.research");
        },
        ai: { models: { async generateContent(request) {
            calls++;
            assert.match(JSON.stringify(request.config.chatMessages), /busca un six cercano/);
            if (calls === 2) assert.match(JSON.stringify(request.config.chatMessages), /never as evidence/);
            assert.equal(request.config.chatMessages.at(-1).content, "en el centro de Cancún");
            return { text: calls === 1 ? '{"action":"search web for local businesses"}' : '{"name":"jarvis_tool_0","arguments":{"query":"tienda SIX centro Cancún"}}' };
        } } }
    });
    assert.equal(result.toolCalls[0].name, "web.research");
    assert.equal(result.toolCalls[0].approved, false);
    assert.equal(result.missionComplete, false);
});

test("an empty clarification cannot become a successful answer or trigger another interpretation", async () => {
    let calls = 0;
    await assert.rejects(() => runJarvisSemanticPlanner({
        input: "Busca una tienda cercana.", catalog: [{ name: "conversation.respond" }],
        missionState: { phase: "CURRENT_TURN", conversationalGate: true },
        ai: { models: { async generateContent() {
            calls++;
            return { text: '{"mode":"clarify","missing":"ubicacion","question":""}' };
        } } }
    }), /SEMANTIC_CLARIFICATION_QUESTION_REQUIRED/);
    assert.equal(calls, 1);
});

test("schema-shaped arguments get one model correction bound to the same canonical tool", async () => {
    for (const fixed of [true, false]) {
        let calls = 0;
        const search = { name: "repo.search", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } };
        const run = () => runJarvisSemanticPlanner({
            input: "Busca el simbolo debit en el repositorio.", catalog: [search], missionState: { phase: "CURRENT_TURN" },
            ai: { models: { async generateContent(request) {
                calls++;
                if (calls === 1) return { text: '{"name":"jarvis_tool_0","arguments":{"query":{"type":"string","description":"debit"}}}' };
                assert.equal(calls, 2, "no unbounded repair loop");
                assert.deepEqual(request.config.responseJsonSchema.properties.arguments, search.inputSchema);
                assert.equal(request.config.chatMessages.at(-1).content, "Busca el simbolo debit en el repositorio.");
                return { text: fixed ? '{"arguments":{"query":"debit"}}' : '{"arguments":{"query":{"type":"string","description":"debit"}}}' };
            } } }
        });
        if (fixed) {
            const result = await run();
            assert.equal(result.toolCalls[0].name, "repo.search");
            assert.deepEqual(result.toolCalls[0].args, { query: "debit" });
            assert.equal(result.toolCalls[0].approved, false);
        } else await assert.rejects(run, /SEMANTIC_TOOL_ARGUMENTS_INVALID/);
        assert.equal(calls, 2);
    }
});

test("current-turn conversational gate delegates operational work without inventing a response", async () => {
    let calls = 0;
    const ai = {
        lastProvider: "ollama-openai-compatible-local",
        models: {
            async generateContent() {
                calls += 1;
                return {
                    text: JSON.stringify({
                        mode: "tools",
                        message: ""
                    })
                };
            }
        }
    };
    const result = await runJarvisSemanticPlanner({
        ai,
        input: "Revisa el repositorio y dime qué falló.",
        catalog: [{
            name: "conversation.respond",
            description: "Responde directamente cuando basta conversar.",
            mutates: false
        }],
        missionState: {
            phase: "CURRENT_TURN",
            conversationalGate: true
        }
    });

    assert.equal(calls, 1);
    assert.equal(result.toolCalls.length, 0);
    assert.equal(result.missionComplete, false);
    assert.equal(
        result.planKind,
        "CURRENT_TURN_CONVERSATION_GATE_DELEGATE"
    );
});

test("current-turn conversational gate reuses its tool action and avoids a second action-description inference", async () => {
    const search = {
        name: "repo.search",
        description: "Busca evidencia dentro del repositorio.",
        mutates: false,
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string" }
            },
            required: ["query"]
        }
    };
    const fullCatalog = [
        {
            name: "conversation.respond",
            description: "Responde cuando basta conversar.",
            mutates: false
        },
        search,
        {
            name: "repo.read",
            description: "Lee un archivo del repositorio.",
            mutates: false,
            inputSchema: {
                type: "object",
                properties: {
                    file: { type: "string" }
                },
                required: ["file"]
            }
        }
    ];
    let calls = 0;
    let retrievalCalls = 0;
    const result = await runJarvisSemanticPlanner({
        input: "Buenos días Jarvis, enlista lo que sabes hacer en este repo.",
        catalog: fullCatalog,
        missionState: {
            phase: "CURRENT_TURN",
            conversationalGate: true
        },
        retrieveToolCandidates: async (action, limit) => {
            retrievalCalls += 1;
            assert.equal(action, "search repository capabilities");
            assert.equal(limit, 6);
            return [search];
        },
        ai: {
            models: {
                async generateContent(request) {
                    calls += 1;
                    if (calls === 1) {
                        assert.equal(
                            request.config.responseJsonSchema
                                .properties.action.type,
                            "string"
                        );
                        return {
                            text: JSON.stringify({
                                missing: "",
                                mode: "tools",
                                question: "",
                                action: "search repository capabilities"
                            }),
                            providerResponse: {
                                finishReason: "stop"
                            }
                        };
                    }
                    assert.equal(
                        request.config.nativeToolChat,
                        true
                    );
                    return {
                        text: JSON.stringify({
                            name: "jarvis_tool_0",
                            arguments: {
                                query: "capacidades del repositorio"
                            }
                        }),
                        providerResponse: {
                            finishReason: "stop"
                        }
                    };
                }
            }
        }
    });

    assert.equal(calls, 2);
    assert.equal(retrievalCalls, 1);
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, "repo.search");
    assert.deepEqual(
        result.toolCalls[0].args,
        { query: "capacidades del repositorio" }
    );
});


test("current-turn gate never executes a no-arg retrieval match without model selection", async () => {
    const capabilities = {
        name: "system.capabilities",
        description: "Describe las herramientas activas de SIA7 agrupadas por dominio y su politica de aprobacion.",
        mutates: false,
        inputSchema: {
            type: "object",
            properties: {}
        }
    };
    const catalogWithCapabilities = [
        {
            name: "conversation.respond",
            description: "Responde cuando basta conversar.",
            mutates: false
        },
        capabilities,
        {
            name: "repo.search",
            description: "Busca evidencia en el repositorio.",
            mutates: false,
            inputSchema: {
                type: "object",
                properties: {
                    query: { type: "string" }
                },
                required: ["query"]
            }
        }
    ];
    let calls = 0;
    let retrievalCalls = 0;
    const result = await runJarvisSemanticPlanner({
        input: "Enlistame lo que sabes hacer en este repo.",
        catalog: catalogWithCapabilities,
        missionState: {
            phase: "CURRENT_TURN",
            conversationalGate: true
        },
        retrieveToolCandidates: async (action, limit) => {
            retrievalCalls += 1;
            assert.equal(action, "inspect system capabilities");
            assert.equal(limit, 6);
            return [capabilities];
        },
        ai: {
            models: {
                async generateContent(request) {
                    calls += 1;
                    if (calls === 1) {
                        return {
                            text: JSON.stringify({
                                missing: "",
                                mode: "tools",
                                question: "",
                                action: "inspect system capabilities"
                            }),
                            providerResponse: {
                                finishReason: "stop"
                            }
                        };
                    }
                    assert.equal(request.config.nativeToolChat, true);
                    return {
                        text: JSON.stringify({
                            name: "jarvis_tool_0",
                            arguments: {}
                        }),
                        providerResponse: {
                            finishReason: "stop"
                        }
                    };
                }
            }
        }
    });

    assert.equal(calls, 2);
    assert.equal(retrievalCalls, 1);
    assert.notEqual(result.planKind, "CURRENT_TURN_GATE_ACTION_DIRECT_TOOL");
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, "system.capabilities");
    assert.equal(result.toolCalls[0].args.instruction, "Enlistame lo que sabes hacer en este repo.");
    assert.equal(result.toolCalls[0].args.query, "Enlistame lo que sabes hacer en este repo.");
});


test("current-turn marketing cannot be hijacked by a higher-ranked observability candidate", async () => {
    const observability = {
        name: "system.observability",
        description: "Consulta evidencia funcional agregada del runtime.",
        mutates: false,
        inputSchema: { type: "object", properties: {} }
    };
    const marketing = {
        name: "marketing.plan",
        description: "Produce un plan de marketing desde un brief semantico.",
        mutates: false,
        inputSchema: {
            type: "object",
            properties: { instruction: { type: "string" } },
            required: ["instruction"]
        }
    };
    const catalogWithMarketing = [
        { name: "conversation.respond", description: "Responde cuando basta conversar.", mutates: false },
        observability,
        marketing
    ];
    let calls = 0;
    let retrievalLimit = 0;
    const input = "Haz marketing para Summit firma de abogados.";
    const result = await runJarvisSemanticPlanner({
        input,
        catalog: catalogWithMarketing,
        missionState: { phase: "CURRENT_TURN", conversationalGate: true },
        retrieveToolCandidates: async (_action, limit) => {
            retrievalLimit = limit;
            return [observability, marketing];
        },
        ai: {
            models: {
                async generateContent(request) {
                    calls += 1;
                    if (calls === 1) {
                        return {
                            text: JSON.stringify({
                                missing: "",
                                mode: "tools",
                                question: "",
                                action: "create marketing campaign"
                            }),
                            providerResponse: { finishReason: "stop" }
                        };
                    }
                    assert.equal(request.config.nativeToolChat, true);
                    // Retrieval keeps both operational candidates in order and
                    // now also offers the same model a conversational escape.
                    assert.deepEqual(request.config.tools[0].functionDeclarations.map(tool => tool.description.split(":")[0]),
                        ["system.observability", "marketing.plan", "conversation.respond"]);
                    return {
                        text: JSON.stringify({
                            name: "jarvis_tool_1",
                            arguments: { instruction: input }
                        }),
                        providerResponse: { finishReason: "stop" }
                    };
                }
            }
        }
    });

    assert.equal(retrievalLimit, 6);
    assert.equal(calls, 2);
    assert.equal(result.toolCalls[0].name, "marketing.plan");
    assert.notEqual(result.toolCalls[0].name, "system.observability");
});

test("current-turn semantic completion tool survives incomplete model arguments without a repair loop", async () => {
    const input =
        "EN CANCÚN QUINTANA ROO Y MARKETING A NIVEL NACIONAL";
    const marketing = {
        name: "marketing.plan",
        description:
            "Produce un plan de marketing y completa el brief semanticamente.",
        semanticArgumentCompletion: true,
        mutates: false,
        inputSchema: {
            type: "object",
            properties: {
                prompt: { type: "string" },
                brandName: { type: "string" },
                audience: { type: "string" },
                offer: { type: "string" },
                pain: { type: "string" },
                promise: { type: "string" },
                differentiator: { type: "string" },
                cta: { type: "string" },
                market: { type: "string" },
                campaignObjective: { type: "string" },
                horizon: { type: "string" },
                tone: { type: "string" },
                channels: {
                    type: "array",
                    items: { type: "string" }
                },
                metrics: {
                    type: "array",
                    items: { type: "string" }
                },
                productionRequested: {
                    type: "boolean"
                }
            },
            required: [
                "brandName",
                "audience",
                "offer",
                "pain",
                "promise",
                "differentiator",
                "cta",
                "market",
                "campaignObjective",
                "horizon",
                "tone",
                "channels",
                "metrics",
                "productionRequested"
            ],
            additionalProperties: false
        }
    };
    let calls = 0;

    const result =
        await runJarvisSemanticPlanner({
            input,
            catalog: [
                {
                    name:
                        "conversation.respond",
                    description:
                        "Responde cuando basta conversar.",
                    mutates: false
                },
                marketing
            ],
            missionState: {
                phase: "CURRENT_TURN",
                conversationalGate: true
            },
            retrieveToolCandidates:
                async () => [
                    marketing
                ],
            ai: {
                models: {
                    async generateContent(
                        request
                    ) {
                        calls += 1;
                        if (calls === 1) {
                            return {
                                text:
                                    JSON.stringify({
                                        missing: "",
                                        mode: "tools",
                                        question: "",
                                        action:
                                            "create marketing campaign"
                                    }),
                                providerResponse: {
                                    finishReason:
                                        "stop"
                                }
                            };
                        }

                        assert.equal(
                            request.config
                                .nativeToolChat,
                            true
                        );

                        return {
                            text:
                                JSON.stringify({
                                    name:
                                        "jarvis_tool_0",
                                    arguments: {
                                        brandName:
                                            "SUMMIT FIRMA DE ABOGADOS"
                                    }
                                }),
                            providerResponse: {
                                finishReason:
                                    "stop"
                            }
                        };
                    }
                }
            }
        });

    assert.equal(
        calls,
        2,
        "self-completing tools must not enter the schema-repair inference"
    );
    assert.equal(
        result.toolCalls.length,
        1
    );
    assert.equal(
        result.toolCalls[0].name,
        "marketing.plan"
    );
    assert.equal(
        result.toolCalls[0].deferred,
        true
    );
    assert.equal(
        result.toolCalls[0].args.prompt,
        input
    );
    assert.equal(
        result.toolCalls[0].args.brandName,
        "SUMMIT FIRMA DE ABOGADOS"
    );
});

test("a friendly conversational question does not create a pending operational continuation", async () => {
    const inspect = {
        name: "browser.inspect",
        description: "Inspecciona la estructura DOM de una interfaz web real.",
        mutates: false,
        evidenceKinds: ["interface_structure"],
        inputSchema: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"]
        }
    };
    const currentPage = {
        url: "https://fixgo-44e4d.web.app/gestia-terminal.html",
        origin: "https://fixgo-44e4d.web.app"
    };
    let calls = 0;
    const result = await runJarvisSemanticPlanner({
        input: "analiza el diseño gráfico de nuestra plataforma",
        catalog: [
            { name: "conversation.respond", description: "Responde cuando basta conversar.", mutates: false },
            inspect
        ],
        missionState: {
            phase: "CURRENT_TURN",
            conversationalGate: true,
            currentPage,
            advisorySemanticContext: {
                turns: [
                    { role: "user", content: "¿Qué es diseño gráfico?" },
                    {
                        role: "assistant",
                        content: "El diseño gráfico comunica ideas visualmente. ¿Te gustaría que te explique algo más?",
                        status: "CASUAL_CONVERSATION"
                    }
                ]
            }
        },
        retrieveToolCandidates: async action => {
            assert.equal(action, "inspect current web interface");
            return [inspect];
        },
        ai: {
            models: {
                async generateContent(request) {
                    calls += 1;
                    if (calls === 1) {
                        assert.equal(request.config.chatMessages.filter(item => item.role === "system").length, 1);
                        assert.doesNotMatch(JSON.stringify(request.config.chatMessages), /Te gustaría/);
                        assert.match(request.config.chatMessages[0].content, /currentPage resuelve esa referencia/);
                        return {
                            text: JSON.stringify({
                                missing: "",
                                mode: "tools",
                                question: "",
                                action: "inspect current web interface",
                                requiresConversationContext: false
                            }),
                            providerResponse: { finishReason: "stop" }
                        };
                    }
                    assert.doesNotMatch(JSON.stringify(request.config.chatMessages), /Te gustaría/);
                    return {
                        text: JSON.stringify({
                            name: "jarvis_tool_0",
                            arguments: { url: currentPage.url }
                        }),
                        providerResponse: { finishReason: "stop" }
                    };
                }
            }
        }
    });
    assert.equal(calls, 2);
    assert.equal(result.toolCalls[0].name, "browser.inspect");
    assert.equal(result.toolCalls[0].args.url, currentPage.url);
});

test("current-turn follow-up keeps the unresolved operation when the user supplies the requested detail", async () => {
    const marketing = {
        name: "marketing.plan",
        description: "Produce un plan de marketing desde un brief semantico.",
        mutates: false,
        inputSchema: {
            type: "object",
            properties: { instruction: { type: "string" } },
            required: ["instruction"]
        }
    };
    let calls = 0;
    const input = "En Cancún Quintana Roo y marketing a nivel nacional.";
    const result = await runJarvisSemanticPlanner({
        input,
        catalog: [
            { name: "conversation.respond", description: "Responde cuando basta conversar.", mutates: false },
            marketing
        ],
        missionState: {
            phase: "CURRENT_TURN",
            conversationalGate: true,
            advisorySemanticContext: {
                turns: [
                    { role: "user", content: "Haz marketing para Summit firma de abogados." },
                    { role: "assistant", content: "¿En qué ciudad o mercado quieres enfocar la campaña?", status: "CLARIFICATION_REQUIRED" }
                ]
            }
        },
        retrieveToolCandidates: async (action, limit) => {
            assert.equal(action, "create marketing campaign");
            assert.equal(limit, 6);
            return [marketing];
        },
        ai: {
            models: {
                async generateContent(request) {
                    calls += 1;
                    if (calls === 1) {
                        assert.match(request.config.chatMessages[0].content, /continuation of that unresolved request/);
                        assert.ok(request.config.chatMessages.some(item =>
                            item.role === "assistant" &&
                            item.content.includes("¿En qué ciudad")
                        ));
                        return {
                            text: JSON.stringify({
                                missing: "",
                                mode: "tools",
                                question: "",
                                action: "create marketing campaign"
                            }),
                            providerResponse: { finishReason: "stop" }
                        };
                    }
                    return {
                        text: JSON.stringify({
                            name: "jarvis_tool_0",
                            arguments: { instruction: input }
                        }),
                        providerResponse: { finishReason: "stop" }
                    };
                }
            }
        }
    });

    assert.equal(calls, 2);
    assert.equal(result.toolCalls[0].name, "marketing.plan");
});

test("pending clarification overrides an erroneous chat classification and continues the original mission", async () => {
    const marketing = {
        name: "marketing.plan",
        description: "Produce un plan de marketing desde un brief semantico.",
        mutates: false,
        inputSchema: {
            type: "object",
            properties: {
                instruction: { type: "string" }
            },
            required: ["instruction"]
        }
    };
    const previous =
        "QUIERO QUE HAGAS MARKETING PARA https://www.summ.com.mx/ SUMMIT FIRMA DE ABOGADOS Y CON ARCHIVOS DESCARGABLES";
    const current =
        "EN CANCÚN QUINTANA ROO Y MARKETING A NIVEL NACIONAL";
    const combined =
        previous + "\n\n" + current;
    let calls = 0;

    const result =
        await runJarvisSemanticPlanner({
            input: current,
            catalog: [
                {
                    name:
                        "conversation.respond",
                    description:
                        "Responde cuando basta conversar.",
                    mutates: false
                },
                marketing
            ],
            missionState: {
                phase:
                    "CURRENT_TURN",
                conversationalGate:
                    true,
                advisorySemanticContext: {
                    turns: [
                        {
                            role: "user",
                            content: previous
                        },
                        {
                            role: "assistant",
                            content:
                                "¿En qué ciudad o mercado quieres enfocar la campaña?",
                            status:
                                "CLARIFICATION_REQUIRED"
                        }
                    ]
                }
            },
            retrieveToolCandidates:
                async (
                    action,
                    limit
                ) => {
                    assert.equal(
                        action,
                        "create marketing campaign"
                    );
                    assert.equal(
                        limit,
                        6
                    );
                    return [
                        marketing
                    ];
                },
            ai: {
                models: {
                    async generateContent(
                        request
                    ) {
                        calls += 1;

                        if (calls === 1) {
                            assert.equal(
                                request.config
                                    .chatMessages
                                    .at(-1)
                                    .content,
                                combined
                            );
                            return {
                                text:
                                    JSON.stringify({
                                        missing:
                                            "",
                                        mode:
                                            "chat",
                                        question:
                                            "",
                                        action:
                                            ""
                                    }),
                                providerResponse: {
                                    finishReason:
                                        "stop"
                                }
                            };
                        }

                        if (calls === 2) {
                            assert.equal(
                                request.config
                                    .chatMessages
                                    .at(-1)
                                    .content,
                                combined
                            );
                            return {
                                text:
                                    JSON.stringify({
                                        action:
                                            "create marketing campaign"
                                    }),
                                providerResponse: {
                                    finishReason:
                                        "stop"
                                }
                            };
                        }

                        assert.equal(
                            request.config
                                .chatMessages
                                .at(-1)
                                .content,
                            combined
                        );
                        return {
                            text:
                                JSON.stringify({
                                    name:
                                        "jarvis_tool_0",
                                    arguments: {
                                        instruction:
                                            combined
                                    }
                                }),
                            providerResponse: {
                                finishReason:
                                    "stop"
                            }
                        };
                    }
                }
            }
        });

    assert.equal(
        calls,
        3
    );
    assert.equal(
        result.toolCalls.length,
        1
    );
    assert.equal(
        result.toolCalls[0].name,
        "marketing.plan"
    );
    assert.equal(
        result.toolCalls[0]
            .args
            .instruction,
        combined
    );
});

test("false clarification is audited when the requested detail is already in the full instruction", async () => {
    const input =
        "QUIERO QUE HAGAS MARKETING PARA https://www.summ.com.mx/ SUMMIT FIRMA DE ABOGADOS EN CANCÚN QUINTANA ROO Y MARKETING A NIVEL NACIONAL Y CON ARCHIVOS DESCARGABLES";
    const marketing = {
        name: "marketing.plan",
        description:
            "Produce un plan de marketing desde un brief semantico.",
        semanticArgumentCompletion:
            true,
        mutates: false,
        inputSchema: {
            type: "object",
            properties: {
                prompt: {
                    type: "string"
                },
                brandName: {
                    type: "string"
                }
            },
            required: [
                "brandName"
            ],
            additionalProperties:
                true
        }
    };
    let calls = 0;

    const result =
        await runJarvisSemanticPlanner({
            input,
            catalog: [
                {
                    name:
                        "conversation.respond",
                    description:
                        "Responde cuando basta conversar.",
                    mutates: false
                },
                marketing
            ],
            missionState: {
                phase:
                    "CURRENT_TURN",
                conversationalGate:
                    true
            },
            retrieveToolCandidates:
                async (
                    action,
                    limit
                ) => {
                    assert.equal(
                        action,
                        "create marketing campaign"
                    );
                    assert.equal(
                        limit,
                        6
                    );
                    return [
                        marketing
                    ];
                },
            ai: {
                models: {
                    async generateContent(
                        request
                    ) {
                        calls += 1;

                        if (calls === 1) {
                            return {
                                text:
                                    JSON.stringify({
                                        missing:
                                            "mercado objetivo",
                                        mode:
                                            "clarify",
                                        question:
                                            "¿En qué ciudad o mercado quieres enfocar la campaña?",
                                        action:
                                            ""
                                    }),
                                providerResponse: {
                                    finishReason:
                                        "stop"
                                }
                            };
                        }

                        if (calls === 2) {
                            const auditBody =
                                JSON.parse(
                                    request.config
                                        .chatMessages
                                        .at(-1)
                                        .content
                                );
                            assert.equal(
                                auditBody
                                    .instruction,
                                input
                            );
                            return {
                                text:
                                    JSON.stringify({
                                        stillMissing:
                                            false,
                                        action:
                                            "create marketing campaign"
                                    }),
                                providerResponse: {
                                    finishReason:
                                        "stop"
                                }
                            };
                        }

                        assert.equal(
                            request.config
                                .nativeToolChat,
                            true
                        );
                        assert.equal(
                            request.config
                                .chatMessages
                                .at(-1)
                                .content,
                            input
                        );
                        return {
                            text:
                                JSON.stringify({
                                    name:
                                        "jarvis_tool_0",
                                    arguments: {
                                        brandName:
                                            "SUMMIT FIRMA DE ABOGADOS"
                                    }
                                }),
                            providerResponse: {
                                finishReason:
                                    "stop"
                            }
                        };
                    }
                }
            }
        });

    assert.equal(
        calls,
        3
    );
    assert.equal(
        result.toolCalls.length,
        1
    );
    assert.equal(
        result.toolCalls[0].name,
        "marketing.plan"
    );
    assert.notEqual(
        result.toolCalls[0].name,
        "conversation.respond"
    );
    assert.equal(
        result.toolCalls[0]
            .args
            .prompt,
        input
    );
});

test("explicit URL prevents an erroneous direct chat classification", async () => {
    const input =
        "QUIERO QUE HAGAS MARKETING PARA https://www.summ.com.mx/ SUMMIT FIRMA DE ABOGADOS EN CANCÚN Y CON ARCHIVOS DESCARGABLES";
    const research = {
        name: "web.research",
        description: "Investiga una fuente web real.",
        mutates: false,
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string" }
            },
            required: ["query"]
        }
    };
    let calls = 0;

    const result = await runJarvisSemanticPlanner({
        input,
        catalog: [
            {
                name: "conversation.respond",
                description: "Responde cuando basta conversar.",
                mutates: false
            },
            research
        ],
        missionState: {
            phase: "CURRENT_TURN",
            conversationalGate: true
        },
        retrieveToolCandidates: async (action, limit) => {
            assert.equal(action, "research law firm website");
            assert.equal(limit, 6);
            return [research];
        },
        ai: {
            models: {
                async generateContent(request) {
                    calls += 1;
                    if (calls === 1) {
                        return {
                            text: JSON.stringify({
                                missing: "",
                                mode: "chat",
                                question: "",
                                action: ""
                            }),
                            providerResponse: { finishReason: "stop" }
                        };
                    }
                    if (calls === 2) {
                        return {
                            text: JSON.stringify({
                                action: "research law firm website"
                            }),
                            providerResponse: { finishReason: "stop" }
                        };
                    }
                    return {
                        text: JSON.stringify({
                            name: "jarvis_tool_0",
                            arguments: {
                                query: "SUMMIT FIRMA DE ABOGADOS"
                            }
                        }),
                        providerResponse: { finishReason: "stop" }
                    };
                }
            }
        }
    });

    assert.equal(calls, 3);
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, "web.research");
    assert.notEqual(result.toolCalls[0].name, "conversation.respond");
});

test("current-turn gate classifies the original read request, not its own phase instructions", async () => {
    const input = "Lee jarvis-runtime-contract.json sin modificar nada y dime en tres líneas qué comprobaste. Si falla, explica el error real.";
    const result = await runJarvisSemanticPlanner({
        input,
        catalog: [{ name: "conversation.respond", mutates: false }],
        missionState: { phase: "CURRENT_TURN", conversationalGate: true },
        ai: { models: { async generateContent(request) {
            assert.equal(request.config.chatMessages.at(-1).role, "user");
            assert.equal(request.config.chatMessages.at(-1).content, input);
            assert.match(request.config.chatMessages[0].content, /Classify/);
            return { text: '{"mode":"tools"}', providerResponse: { finishReason: "stop" } };
        } } }
    });
    assert.deepEqual(result.toolCalls, []);
    assert.equal(result.planKind, "CURRENT_TURN_CONVERSATION_GATE_DELEGATE");
});

test("a truncated gate cannot authorize a direct answer even with parseable JSON", async () => {
    let calls = 0;
    const result = await runJarvisSemanticPlanner({
        input: "Comprueba el archivo del proyecto.",
        catalog: [{ name: "conversation.respond", mutates: false }],
        missionState: { phase: "CURRENT_TURN", conversationalGate: true },
        ai: { models: { async generateContent() {
            calls += 1;
            return { text: '{"mode":"chat"}', providerResponse: { finishReason: "length" } };
        } } }
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.toolCalls, []);
});

test("a truncated direct response cannot become a completed conversation tool call", async () => {
    let calls = 0;
    await assert.rejects(() => runJarvisSemanticPlanner({
        input: "Qué onda, pariente.",
        catalog: [{ name: "conversation.respond", mutates: false }],
        missionState: { phase: "CURRENT_TURN", conversationalGate: true },
        ai: { models: { async generateContent() {
            calls += 1;
            return calls === 1
                ? { text: '{"mode":"chat"}', providerResponse: { finishReason: "stop" } }
                : { text: "Aquí estamos y podemos seguir plati", providerResponse: { finishReason: "length" } };
        } } }
    }), /SEMANTIC_RESPONSE_INCOMPLETE/);
    assert.equal(calls, 2);
});

test("a truncated final composition is not reported as SEMANTIC_RESPONSE_READY", async () => {
    await assert.rejects(() => runJarvisSemanticResponse({
        input: "Explica la evidencia de la lectura.",
        ai: { models: { async generateContent() {
            return { text: "El archivo contiene una configura", providerResponse: { finishReason: "length" } };
        } } }
    }), /SEMANTIC_RESPONSE_INCOMPLETE/);
});

test("Qwen describes the action while canonical retrieval preserves the original file argument", async () => {
    const input = "Lee el contrato sin modificarlo.";
    const tools = [...catalog, { name: "repo.read", mutates: false, inputSchema: { type: "object", required: ["file"], properties: { file: { type: "string" } } } }];
    let calls = 0;
    const plan = await runJarvisSemanticPlanner({
        input, catalog: tools,
        retrieveToolCandidates: async action => {
            assert.equal(action, "read repository file");
            return [{ name: "repo.read", mutates: true, inputSchema: {} }, { name: "invented.tool" }];
        },
        missionState: { phase: "CURRENT_TURN", writeAllowed: false },
        ai: { models: { async generateContent(request) {
            calls++;
            if (calls === 1) {
                assert.equal(request.config.chatMessages.at(-1).content, input);
                assert.equal(request.config.responseJsonSchema.properties.action.type, "string");
                return { text: '{"action":"read repository file"}', providerResponse: { finishReason: "stop" } };
            }
            const declarations = request.config.tools[0].functionDeclarations;
            assert.equal(declarations.length, 1);
            assert.match(declarations[0].description, /repo.read/);
            assert.equal(declarations[0].parametersJsonSchema.properties.file.type, "string");
            assert.equal(request.config.chatMessages[1].content, input);
            return { text: '{"toolCalls":[{"name":"repo.read","args":{"file":"jarvis-runtime-contract.json"}}]}' };
        } } }
    });
    assert.equal(calls, 2);
    assert.equal(plan.toolCalls[0].name, "repo.read");
    assert.equal(plan.toolCalls[0].args.file, "jarvis-runtime-contract.json");
    assert.equal(plan.toolCalls[0].mutates, false, "retrieval cannot replace the live tool definition");
});

test("action retrieval rejects missing, malformed and incomplete descriptions", async () => {
    for (const response of [{ text: '{"name":"invented.tool"}' }, { text: '{"action":{}}' }, { text: '{"action":""}' }, { text: '{"action":"read repository file"}', providerResponse: { finishReason: "length" } }]) {
        let calls = 0;
        await assert.rejects(() => runJarvisSemanticPlanner({
            input: "Inspecciona el proyecto.", catalog,
            retrieveToolCandidates: async () => assert.fail("invalid action must not start retrieval"),
            missionState: { phase: "CURRENT_TURN" },
            ai: { models: { async generateContent() { calls++; return response; } } }
        }), /SEMANTIC_ACTION_DESCRIPTION_INVALID/);
        assert.equal(calls, 1);
    }
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

test("semantic planner unwraps schema descriptor envelopes only when they match the runtime schema", () => {
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

    const normalized = validatePlan(
        {
            toolCalls: [{
                name: "repo.search",
                args: {
                    query: {
                        type: "string",
                        value: "function debit(balance, amount)"
                    }
                }
            }]
        },
        [searchTool],
        "busca debit"
    );

    assert.equal(normalized.toolCalls.length, 1);
    assert.deepEqual(
        normalized.toolCalls[0].args,
        { query: "function debit(balance, amount)" }
    );

    const mismatched = validatePlan(
        {
            toolCalls: [{
                name: "repo.search",
                args: {
                    query: {
                        type: "number",
                        value: 123
                    }
                }
            }]
        },
        [searchTool],
        "busca debit"
    );
    assert.equal(mismatched.toolCalls.length, 0);
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

test("semantic response uses the local Jarvis provider and reports provenance", async () => {
    const result = await runJarvisSemanticResponse({
        input: "Integra solamente la evidencia entregada.",
        ai: {
            lastProvider: "ollama-openai-compatible-local",
            models: {
                generateContent: async request => {
                    assert.equal(request.model, "jarvis-local");
                    assert.equal(
                        request.config.maxOutputTokens,
                        160
                    );
                    assert.equal(
                        request.config.thinkingConfig
                            .thinkingLevel, "MINIMAL"
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
    assert.equal(result.provider, "ollama-openai-compatible-local");
    assert.equal(result.message, "Resultado integrado con evidencia.");
});

test("semantic response accepts a bounded extended budget for complete mission reports", async () => {
    const result = await runJarvisSemanticResponse({
        input: "Integra todas las secciones y cierra el informe.",
        maxOutputTokens: 12000,
        ai: {
            lastProvider: "ollama-openai-compatible-local",
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

test("grounded final replies render model-authored lines without exposing the transport envelope", async () => {
    const result = await runJarvisSemanticResponse({
        input: "Evidence: complete read, lines 1-7. No syntax validator was run.",
        responseMode: "grounded_conversation",
        responseInstruction: "Explica lo comprobado en tres líneas.",
        responseBriefing: '{"missionStatus":"COMPLETED","executedTools":[{"tool":"repo.read"}]}',
        ai: { models: { generateContent: async request => {
            assert.equal(request.config.responseMimeType, "application/json");
            assert.equal(request.config.responseJsonSchema.properties.lines.type, "array");
            return { text: JSON.stringify({ lines: ["Leí contract.json.", "La lectura contiene las siete líneas.", "No ejecuté un validador de sintaxis."] }) };
        } } }
    });
    assert.equal(result.message, "Leí contract.json.\nLa lectura contiene las siete líneas.\nNo ejecuté un validador de sintaxis.");
});

test("grounded complete JSON reads let Qwen select verified fact IDs and render only canonical facts", async () => {
    const responseBriefing = JSON.stringify({
        missionStatus: "COMPLETED",
        executedTools: [{ tool: "repo.read" }],
        groundedVerifiedRead: {
            file: "jarvis-runtime-contract.json",
            partial: false,
            readCoverage: "COMPLETE",
            evidenceTextTruncated: false,
            startLine: 1,
            endLine: 7,
            totalLines: 7,
            numberedContent: [
                "1: {",
                '2:   "projectId": "fixgo-app",',
                '3:   "repository": "heberzzt-wq/fixgo-app",',
                '4:   "branch": "v94-media-v4n-negative-claims",',
                '5:   "releaseId": "v94-source-grounded-research-v124-20260810"',
                "6: }",
                "7: "
            ].join("\n")
        }
    });

    const result = await runJarvisSemanticResponse({
        input:
            "Generic composition prompt that contains tool evidence.",
        responseMode: "grounded_conversation",
        responseInstruction:
            "Dime en tres líneas qué comprobaste.",
        responseBriefing,
        ai: {
            models: {
                generateContent: async request => {
                    assert.deepEqual(
                        request.config.responseJsonSchema
                            .properties.factIds.items.enum,
                        [
                            "read.coverage",
                            "read.file",
                            "file.projectId",
                            "file.repository",
                            "file.branch",
                            "file.releaseId"
                        ]
                    );
                    assert.match(
                        request.config.chatMessages[1].content,
                        /REQUEST=Dime en tres líneas/
                    );
                    assert.match(
                        request.config.chatMessages[1].content,
                        /projectId: fixgo-app/
                    );
                    return {
                        text: JSON.stringify({
                            requestedLineCount: 3,
                            factIds: [
                                "read.coverage",
                                "file.projectId",
                                "file.repository",
                                "file.branch"
                            ]
                        })
                    };
                }
            }
        }
    });

    assert.equal(
        result.message,
        [
            "Lectura: 7/7 líneas.",
            "projectId: fixgo-app",
            "repository: heberzzt-wq/fixgo-app"
        ].join("\n")
    );
});


test("grounded final replies reject malformed, empty and truncated line envelopes", async () => {
    for (const response of [
        { text: "Plain unvalidated reply" },
        { text: '{"lines":[]}' },
        { text: '{"lines":[{}]}' },
        { text: '{"lines":["   "]}' },
        { text: '{"lines":["ok"]}', providerResponse: { finishReason: "length" } }
    ]) {
        await assert.rejects(runJarvisSemanticResponse({
            input: "Actual read failed.", responseMode: "grounded_conversation",
            responseBriefing: '{"missionStatus":"FAILED","executedTools":[]}',
            ai: { models: { generateContent: async () => response } }
        }), /SEMANTIC_RESPONSE_(FORMAT_INVALID|INCOMPLETE)/);
    }
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

test("semantic planner normalizes Qwen structured text tool selection", () => {
    const singleCatalog = [{
        name: "repo.search",
        description: "Busca evidencia dentro del repositorio.",
        mutates: false,
        requiresApproval: false,
        inputSchema: {
            type: "object",
            required: ["query"],
            properties: {
                query: { type: "string" }
            },
            additionalProperties: false
        }
    }];

    assert.deepEqual(
        normalizeTextToolPlan(
            {
                name: "repo.search",
                arguments: {
                    query: "inteligencia local de Jarvis"
                }
            },
            singleCatalog
        ),
        {
            toolCalls: [{
                name: "repo.search",
                args: {
                    query: "inteligencia local de Jarvis"
                },
                reason: "MODEL_STRUCTURED_TEXT_TOOL_SELECTION"
            }],
            missionComplete: false,
            explanation: ""
        }
    );

    assert.deepEqual(
        normalizeTextToolPlan(
            {
                name: "jarvis_tool_0",
                arguments: {
                    query: "RAG AST"
                }
            },
            singleCatalog
        ).toolCalls[0],
        {
            name: "repo.search",
            args: {
                query: "RAG AST"
            },
            reason: "MODEL_STRUCTURED_TEXT_TOOL_SELECTION"
        }
    );

    assert.deepEqual(
        normalizeTextToolPlan(
            {
                name: "jarvis_tool_0 repo.search",
                arguments: {
                    query: {
                        type: "string",
                        value: "debit(balance, amount)"
                    }
                }
            },
            singleCatalog
        ).toolCalls[0],
        {
            name: "repo.search",
            args: {
                query: {
                    type: "string",
                    value: "debit(balance, amount)"
                }
            },
            reason: "MODEL_STRUCTURED_TEXT_TOOL_SELECTION"
        }
    );
    assert.equal(
        normalizeTextToolPlan(
            {
                name: "jarvis_tool_0 repo.read",
                arguments: {
                    query: "debit"
                }
            },
            singleCatalog
        ).toolCalls,
        undefined
    );
});

test("semantic planner accepts Qwen structured text tool output end to end", async () => {
    const singleCatalog = [{
        name: "repo.search",
        description: "Busca evidencia dentro del repositorio.",
        mutates: false,
        requiresApproval: false,
        inputSchema: {
            type: "object",
            required: ["query"],
            properties: {
                query: { type: "string" }
            },
            additionalProperties: false
        }
    }];

    const result = await runJarvisSemanticPlanner({
        input: "Revisa la inteligencia local de Jarvis.",
        catalog: singleCatalog,
        ai: {
            lastProvider: "ollama-openai-compatible-local",
            models: {
                generateContent: async () => ({
                    text: JSON.stringify({
                        name: "repo.search",
                        arguments: {
                            query: "inteligencia local de Jarvis"
                        }
                    }),
                    functionCalls: [],
                    providerResponse: {
                        finishReason: "stop",
                        toolCallCount: 0
                    }
                })
            }
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, "repo.search");
    assert.equal(
        result.toolCalls[0].args.query,
        "inteligencia local de Jarvis"
    );
});

test("current-turn operational planning preserves supplied candidates without lexical ranking", async () => {
    let requestSeen = null;
    const operationalCatalog = [
        {
            name: "system.health",
            description: "Diagnostico read-only del runtime.",
            mutates: false
        },
        {
            name: "repo.gitStatus",
            description: "Estado git real del repositorio.",
            mutates: false
        },
        {
            name: "page.create",
            description: "Crea una pagina cuando el usuario pide un entregable web.",
            mutates: true
        },
        {
            name: "marketing.plan",
            description: "Prepara estrategia de marketing cuando se solicita una campana.",
            mutates: false
        }
    ];

    const result = await runJarvisSemanticPlanner({
        input: "Revisa el runtime y confirma el HEAD actual.",
        catalog: operationalCatalog,
        retrieveToolCandidates: async action => {
            assert.equal(action, "inspect repository git status");
            return operationalCatalog.filter(tool => tool.name === "repo.gitStatus");
        },
        missionState: {
            phase: "CURRENT_TURN",
            writeAllowed: false
        },
        ai: {
            lastProvider: "ollama-openai-compatible-local",
            models: {
                generateContent: async request => {
                    if (!request.config.tools) {
                        return { text: '{"action":"inspect repository git status"}' };
                    }
                    requestSeen = request;
                    return {
                        text: JSON.stringify({
                            name: "jarvis_tool_0",
                            arguments: {}
                        }),
                        functionCalls: []
                    };
                }
            }
        }
    });

    assert.equal(requestSeen.config.maxOutputTokens, 160);
    assert.equal(requestSeen.config.nativeToolChat, true);
    assert.equal(requestSeen.config.tools[0].functionDeclarations.length, 1);
    assert.match(requestSeen.config.tools[0].functionDeclarations[0].description, /repo.gitStatus/);

    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, "repo.gitStatus");
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

test("semantic planner bounds simple local tool selection output", async () => {
    const singleCatalog = [{
        name: "repo.search",
        description: "Busca evidencia semantica en el repositorio real.",
        mutates: false,
        requiresApproval: false,
        inputSchema: {
            type: "object",
            required: ["query"],
            properties: {
                query: { type: "string" }
            },
            additionalProperties: false
        }
    }];

    const result = await runJarvisSemanticPlanner({
        input: "Revisa como esta implementada la inteligencia local de Jarvis y dime que piezas participan.",
        catalog: singleCatalog,
        ai: {
            lastProvider: "ollama-openai-compatible-local",
            models: {
                generateContent: async request => {
                    assert.equal(request.config.maxOutputTokens, 384);
                    assert.equal(request.config.temperature, 0);
                    assert.equal(
                        request.config.toolConfig.functionCallingConfig.mode,
                        "ANY"
                    );
                    return {
                        functionCalls: [{
                            name: "jarvis_tool_0",
                            args: {
                                query: "inteligencia local de Jarvis piezas implementacion"
                            }
                        }]
                    };
                }
            }
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, "repo.search");
    assert.match(result.toolCalls[0].args.query, /Jarvis/i);
});

test("semantic planner preserves mixed tools and never grants prompt approval", async () => {
    const result = await runJarvisSemanticPlanner({
        input: "analisa el repo y revisa conectores sin modificar nada", catalog,
        ai: { lastProvider: "ollama-openai-compatible-local", models: { generateContent: async request => {
            assert.equal(request.model, "jarvis-local");
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

test("semantic planner uses the injected local Jarvis authority without a public fallback", async () => {
    let fallbackCalls = 0;
    const result = await runJarvisSemanticPlanner({
        input: "investiga SUMM y prepara una campana sin publicar",
        catalog,
        ai: {
            lastProvider: "ollama-openai-compatible-local",
            models: {
                generateContent: async request => {
                    assert.equal(request.model, "jarvis-local");
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

    assert.equal(result.provider, "ollama-openai-compatible-local");
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
        input: "Confirma que la busqueda ya esta completa.",
        catalog,
        missionState: {
            phase: "COMPLETION_AUDIT",
            // Closure now needs an observed result and a matching proof, not
            // merely the name of a tool that was scheduled.
            completedTasks: [{ name: "repo.search", observation: { ok: true, summary: "Busqueda completada con resultados del repositorio." } }],
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
                                objectives: [{ objective: "Confirmar la busqueda observada", requiredEvidenceKind: "tool_result", satisfied: true, evidenceTaskIndexes: [0], limitation: "" }]
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

test("Jarvis local model creates a complete read-only mission contract before execution", async () => {
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
                        assert.equal(request.config.thinkingConfig.thinkingLevel, "MINIMAL");
                        assert.equal(request.config.maxOutputTokens, 4000);
                        assert.ok(request.contents.includes("CONTRATO_DE_MISION"));
                        assert.ok(request.contents.includes("construye un plan completo para todos los objetivos explicitos"));
                    } else if (requestCount === 2) {
                        assert.equal(request.config.thinkingConfig.thinkingLevel, "MINIMAL");
                        assert.equal(request.config.maxOutputTokens, 3000);
                        assert.ok(request.contents.includes("AUDITORIA_SEMANTICA_DE_COBERTURA"));
                    } else {
                        assert.equal(request.config.thinkingConfig.thinkingLevel, "LOW");
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
                    assert.equal(request.config.thinkingConfig.thinkingLevel, "MINIMAL");
                    assert.equal(request.config.maxOutputTokens, 384);
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
        ai: { lastProvider: "ollama-openai-compatible-local", models: { generateContent: async request => { providerRequest = request; return { functionCalls: [{ name: "jarvis_tool_1", args: {} }] }; } } }
    });
    assert.equal(result.toolCalls[0].name, "connector.list");
    assert.equal(providerRequest.model, "jarvis-local");
    assert.ok(String(providerRequest.contents).includes(longInstruction));
    assert.ok(String(providerRequest.contents).includes("MISSION-LONG-1"));
    assert.ok(String(providerRequest.contents).includes("No repitas trabajo ya satisfecho con la misma evidencia"));
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

test("mission contract reuses complete calls only after Qwen verifies all objectives", async () => {
    const read = { name: "repo.read", description: "Read the specified repository file", mutates: false, inputSchema: { type: "object", properties: { file: { type: "string" } }, required: ["file"] } };
    const instruction = "Lee jarvis-runtime-contract.json sin cambiarlo y resume lo comprobado.";
    const proposed = { name: "repo.read", args: { file: "jarvis-runtime-contract.json" }, approved: true };
    let requests = 0;
    const result = await runJarvisSemanticPlanner({ input: instruction, catalog: [read], missionState: { phase: "MISSION_CONTRACT", existingInitialToolCalls: [proposed] }, ai: {
        lastProvider: "ollama-openai-compatible-local", models: { generateContent: async request => {
            requests++;
            assert.equal(request.config.chatMessages[1].content, instruction);
            assert.deepEqual(JSON.parse(request.config.chatMessages[2].content).proposedCalls, [{ name: proposed.name, args: proposed.args }]);
            return { text: '{"coversAll":true}' };
        } }
    } });
    assert.equal(requests, 1);
    assert.equal(result.planKind, "MISSION_CONTRACT_EXISTING_TOOLS_VERIFIED");
    assert.equal(result.missionComplete, false);
    assert.equal(result.toolCalls[0].approved, false);
    assert.deepEqual(result.toolCalls[0].args, proposed.args);
});

test("a rejected or incomplete coverage assessment continues full contract planning", async () => {
    const read = { name: "repo.read", description: "Read repository file", mutates: false, inputSchema: { type: "object", properties: { file: { type: "string" } }, required: ["file"] } };
    for (const assessment of [{ text: '{"coversAll":false}' }, { text: '{"coversAll":true}', providerResponse: { finishReason: "length" } }]) {
        let requests = 0;
        await assert.rejects(() => runJarvisSemanticPlanner({ input: "Lee a.json y b.json", catalog: [read], missionState: { phase: "MISSION_CONTRACT", existingInitialToolCalls: [{ name: "repo.read", args: { file: "a.json" } }] }, ai: {
            models: { generateContent: async () => { if (++requests === 1) return assessment; throw new Error("FULL_CONTRACT_REACHED"); } }
        } }), /FULL_CONTRACT_REACHED/);
        assert.equal(requests, 2);
    }
});

test("unresolved and mutating calls cannot enter contract reuse", async () => {
    for (const variation of [{ deferred: true }, { args: {} }, { mutates: true }]) {
        const tool = { name: "repo.read", description: "Read repository file", mutates: variation.mutates === true, inputSchema: { type: "object", properties: { file: { type: "string" } }, required: ["file"] } };
        const call = { name: "repo.read", args: { file: "a.json" }, ...variation };
        await assert.rejects(() => runJarvisSemanticPlanner({ input: "Lee a.json", catalog: [tool], missionState: { phase: "MISSION_CONTRACT", existingInitialToolCalls: [call] }, ai: { models: { generateContent: async request => {
            assert.notEqual(request.config.responseJsonSchema?.required?.[0], "coversAll");
            throw new Error("FULL_CONTRACT_REACHED");
        } } } }), /FULL_CONTRACT_REACHED/);
    }
});
