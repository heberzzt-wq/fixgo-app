import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildJarvisMultifunctionToolCalls,
    describeJarvisMultifunctionPlanner,
    __test
} from "../gestia-core/jarvis/jarvis.multifunction.planner.js";

const schema = required => ({
    type: "object",
    properties: Object.fromEntries(
        required.map(name => [name, { type: "string" }])
    ),
    required,
    additionalProperties: true
});

const catalog = [
    {
        name: "conversation.respond",
        description: "Respuesta semantica generalista",
        inputSchema: schema(["prompt"])
    },
    {
        name: "repo.search",
        description: "Busca en el repositorio",
        inputSchema: schema(["query"])
    },
    {
        name: "media.analyze",
        description: "Analiza adjuntos reales",
        inputSchema: {
            type: "object",
            properties: {
                attachments: { type: "array", items: { type: "object" } },
                questions: { type: "array", items: { type: "string" } }
            },
            required: ["attachments"]
        }
    },
    {
        name: "marketing.plan",
        description: "Plan comercial",
        inputSchema: schema(["brandName"])
    },
    {
        name: "page.plan",
        description: "Planea una pagina",
        inputSchema: schema(["pageName"])
    },
    {
        name: "page.compose",
        description: "Compone una pagina",
        inputSchema: schema(["brandName"])
    },
    {
        name: "page.create",
        description: "Crea una pagina local",
        userArtifact: true,
        inputSchema: schema(["pageName"])
    }
];

function semanticPlan(toolCalls, missionComplete = false) {
    return async () => ({
        ok: true,
        status: "SEMANTIC_PLAN_READY",
        provider: "test-semantic-model",
        model: "semantic-generalist",
        missionComplete,
        toolCalls
    });
}

test("planner declares semantic generalist current-turn architecture", () => {
    const description = describeJarvisMultifunctionPlanner();
    assert.equal(description.architecture, "model_selected_runtime_catalog");
    assert.equal(description.failMode, "closed");
    assert.match(__test.GENERALIST_CURRENT_TURN_POLICY, /instruccion actual/i);
    assert.match(__test.GENERALIST_CURRENT_TURN_POLICY, /no clasifiques por palabras clave/i);
    assert.match(__test.GENERALIST_CURRENT_TURN_POLICY, /catalogo runtime/i);
    assert.match(__test.GENERALIST_CURRENT_TURN_POLICY, /no fabriques trabajo operativo/i);
});

test("completed semantic current turn becomes one direct conversation without replanning", async () => {
    const instruction = "Qué tal pariente, ¿cómo estás?";
    let plannerCalls = 0;
    const calls = await buildJarvisMultifunctionToolCalls(instruction, {
        toolCatalog: catalog,
        missionState: {
            phase: "CURRENT_TURN"
        },
        semanticPlanner: async () => {
            plannerCalls += 1;
            return {
                ok: true,
                status: "SEMANTIC_PLAN_READY",
                provider: "test-semantic-model",
                model: "semantic-generalist",
                missionComplete: true,
                toolCalls: []
            };
        },
        throwOnUnavailable: true
    });

    assert.equal(plannerCalls, 1);
    assert.deepEqual(calls.map(call => call.name), ["conversation.respond"]);
    assert.equal(calls[0].args.prompt, instruction);
    assert.equal(calls[0].reason, "SEMANTIC_CURRENT_TURN_COMPLETE");
});

test("conversation gate may delegate an unmatched current turn without self-replanning", async () => {
    const instruction = "Revisa el repo y dime dónde está el bridge local.";
    let plannerCalls = 0;
    const calls = await buildJarvisMultifunctionToolCalls(instruction, {
        toolCatalog: [{
            name: "conversation.respond",
            description: "Responde solamente conversación directa."
        }],
        missionState: {
            phase: "CURRENT_TURN"
        },
        allowCurrentTurnDelegationOnEmpty: true,
        semanticPlanner: async () => {
            plannerCalls += 1;
            return {
                ok: true,
                status: "SEMANTIC_PLAN_READY",
                provider: "test-semantic-model",
                model: "semantic-generalist",
                missionComplete: false,
                toolCalls: []
            };
        },
        throwOnUnavailable: true
    });

    assert.equal(plannerCalls, 1);
    assert.deepEqual(calls, []);
});

test("current conversational instruction is not contaminated by stale marketing state", async () => {
    const instruction = "Explícame por qué el cielo se ve azul y háblame como compañero.";
    const calls = await buildJarvisMultifunctionToolCalls(instruction, {
        toolCatalog: catalog,
        missionState: {
            phase: "NEXT_STEP",
            completedTasks: [{
                name: "marketing.plan",
                args: { brandName: "Peninsula Tech" }
            }],
            previousSummary: "Plan de marketing terminado"
        },
        semanticPlanner: semanticPlan([{
            name: "conversation.respond",
            args: { prompt: instruction },
            reason: "CURRENT_TURN_SEMANTIC_INTENT"
        }]),
        throwOnUnavailable: true
    });

    assert.deepEqual(calls.map(call => call.name), ["conversation.respond"]);
    assert.equal(calls[0].args.prompt, instruction);
});

test("mentioned topics and formats do not synthesize artifact tools over semantic intent", async () => {
    const instruction = "Para una tarea escolar explícame qué significan marketing, PDF y Excel; no necesito archivos.";
    const calls = await buildJarvisMultifunctionToolCalls(instruction, {
        toolCatalog: catalog,
        semanticPlanner: semanticPlan([{
            name: "conversation.respond",
            args: { prompt: instruction },
            reason: "CURRENT_TURN_SEMANTIC_INTENT"
        }]),
        throwOnUnavailable: true
    });

    assert.deepEqual(calls.map(call => call.name), ["conversation.respond"]);
});

test("repository task follows semantic repo intent without inherited marketing", async () => {
    const instruction = "Revisa el repositorio y localiza dónde se registra el bridge de adjuntos.";
    const calls = await buildJarvisMultifunctionToolCalls(instruction, {
        toolCatalog: catalog,
        missionState: {
            phase: "NEXT_STEP",
            completedTasks: [{ name: "marketing.plan", args: { brandName: "HMH" } }]
        },
        semanticPlanner: semanticPlan([{
            name: "repo.search",
            args: { query: "bridge de adjuntos" },
            reason: "CURRENT_TURN_REPOSITORY_INTENT"
        }]),
        throwOnUnavailable: true
    });

    assert.deepEqual(calls.map(call => call.name), ["repo.search"]);
});

test("attachment analysis remains semantic and source-grounded", async () => {
    const attachment = {
        name: "acuse-sat.pdf",
        mimeType: "application/pdf",
        artifact: ".jarvis-artifacts/uploads/acuse-sat.pdf",
        sha256: "a".repeat(64)
    };
    const instruction = "Analiza el documento adjunto y dime qué contiene.";
    const calls = await buildJarvisMultifunctionToolCalls(instruction, {
        toolCatalog: catalog,
        semanticPlanner: semanticPlan([{
            name: "media.analyze",
            args: {
                attachments: [attachment],
                questions: ["¿Qué contiene el documento?"]
            },
            reason: "CURRENT_TURN_ATTACHMENT_ANALYSIS"
        }]),
        throwOnUnavailable: true
    });

    assert.deepEqual(calls.map(call => call.name), ["media.analyze"]);
    assert.deepEqual(calls[0].args.attachments, [attachment]);
});

test("explicit page creation preserves the semantic production chain", async () => {
    const calls = await buildJarvisMultifunctionToolCalls(
        "Créame una página local para presentar un servicio.",
        {
            toolCatalog: catalog,
            semanticPlanner: semanticPlan([
                {
                    name: "page.plan",
                    args: { pageName: "servicio" },
                    reason: "SEMANTIC_PAGE_PLAN"
                },
                {
                    name: "page.compose",
                    args: { brandName: "Marca del usuario" },
                    reason: "SEMANTIC_PAGE_COMPOSE"
                },
                {
                    name: "page.create",
                    args: { pageName: "servicio" },
                    reason: "SEMANTIC_PAGE_CREATE"
                }
            ]),
            throwOnUnavailable: true
        }
    );

    assert.deepEqual(calls.map(call => call.name), [
        "page.plan",
        "page.compose",
        "page.create"
    ]);
});

test("semantic model may complete a turn without fabricating a tool", async () => {
    const calls = await buildJarvisMultifunctionToolCalls(
        "Gracias, eso era todo.",
        {
            toolCatalog: catalog,
            semanticPlanner: semanticPlan([], true),
            throwOnUnavailable: true
        }
    );

    assert.equal(calls.length, 0);
    assert.equal(calls.missionComplete, true);
});

test("follow-up tool instruction preserves literal pending request and current answer", async () => {
    const previous =
        "QUIERO QUE HAGAS MARKETING PARA https://www.summ.com.mx/ SUMMIT FIRMA DE ABOGADOS";
    const current =
        "EN CANCUN QUINTANA ROO Y MARKETING A NIVEL NACIONAL";
    const marketingTool = {
        name: "marketing.plan",
        description: "Produce marketing desde la instruccion literal.",
        inputSchema: {
            type: "object",
            properties: {
                instruction: { type: "string" },
                brandName: { type: "string" }
            },
            required: ["instruction"],
            additionalProperties: true
        }
    };

    const calls = await buildJarvisMultifunctionToolCalls(
        current,
        {
            toolCatalog: [
                catalog[0],
                marketingTool
            ],
            missionState: {
                phase: "CURRENT_TURN",
                advisorySemanticContext: {
                    turns: [
                        {
                            role: "user",
                            content: previous
                        },
                        {
                            role: "assistant",
                            content: "¿En qué ciudad o mercado quieres enfocar la campaña?"
                        }
                    ]
                }
            },
            semanticPlanner: semanticPlan([{
                name: "marketing.plan",
                args: {
                    instruction:
                        "Crea marketing para Canahuacán, Quintana Roo.",
                    brandName:
                        "SUMMIT FIRMA DE ABOGADOS"
                },
                reason:
                    "CURRENT_TURN_MARKETING"
            }]),
            throwOnUnavailable: true
        }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "marketing.plan");
    assert.equal(
        calls[0].args.instruction,
        previous + "\n\n" + current
    );
    assert.equal(
        calls[0].args.brandName,
        "SUMMIT FIRMA DE ABOGADOS"
    );
});

test("semantic-completion follow-up preserves the literal pending request in prompt", async () => {
    const previous =
        "QUIERO QUE HAGAS MARKETING PARA https://www.summ.com.mx/ SUMMIT FIRMA DE ABOGADOS";
    const current =
        "EN CANCÚN QUINTANA ROO Y MARKETING A NIVEL NACIONAL";
    const marketingTool = {
        name: "marketing.plan",
        description: "Produce marketing y completa internamente el brief.",
        semanticArgumentCompletion: true,
        inputSchema: {
            type: "object",
            properties: {
                prompt: { type: "string" },
                brandName: { type: "string" },
                audience: { type: "string" },
                market: { type: "string" },
                productionRequested: { type: "boolean" }
            },
            required: [
                "brandName",
                "audience",
                "market",
                "productionRequested"
            ],
            additionalProperties: false
        }
    };

    const calls = await buildJarvisMultifunctionToolCalls(
        current,
        {
            toolCatalog: [
                catalog[0],
                marketingTool
            ],
            missionState: {
                phase: "CURRENT_TURN",
                advisorySemanticContext: {
                    turns: [
                        {
                            role: "user",
                            content: previous
                        },
                        {
                            role: "assistant",
                            content: "¿En qué ciudad o mercado quieres enfocar la campaña?"
                        }
                    ]
                }
            },
            semanticPlanner: semanticPlan([{
                name: "marketing.plan",
                args: {
                    brandName:
                        "SUMMIT FIRMA DE ABOGADOS"
                },
                reason:
                    "CURRENT_TURN_MARKETING"
            }]),
            throwOnUnavailable: true
        }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "marketing.plan");
    assert.equal(calls[0].deferred, true);
    assert.equal(
        calls[0].args.prompt,
        previous + "\n\n" + current
    );
    assert.deepEqual(
        Object.keys(calls[0].args),
        ["prompt"]
    );
});
