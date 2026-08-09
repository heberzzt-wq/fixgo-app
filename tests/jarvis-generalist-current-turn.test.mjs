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
    assert.match(__test.GENERALIST_CURRENT_TURN_POLICY, /agente generalista/i);
    assert.match(__test.GENERALIST_CURRENT_TURN_POLICY, /instruccion actual/i);
    assert.match(__test.GENERALIST_CURRENT_TURN_POLICY, /no equivale/i);
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
