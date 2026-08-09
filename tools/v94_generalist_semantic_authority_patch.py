from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'PATCH_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# NEXO resilience: semantic model owns initial intent. Local compiler may only
# complete arguments for a tool that was already semantically selected.
# ---------------------------------------------------------------------------
path = 'gestia-core/nexo/nexo.semantic-planner-resilience.js'
text = read(path)
text = replace_once(
    text,
    'export const NEXO_SEMANTIC_RESILIENCE_VERSION = "1.3.0-complete-artifact-contract";',
    'export const NEXO_SEMANTIC_RESILIENCE_VERSION = "1.4.0-semantic-intent-authority";',
    'resilience-version'
)

anchor = '''function cloudPlanCoversLocalMission(result, localPlan) {
    if (!localPlan) return true;
    const required = requiredToolNames(localPlan);
    if (required.size === 0) return true;

    const cloudNames = new Set(
        (Array.isArray(result?.toolCalls) ? result.toolCalls : [])
            .map(call => String(call?.name || "").trim())
            .filter(Boolean)
    );

    return [...required].every(name => cloudNames.has(name));
}

'''
insert = anchor + '''function localCompilerMayAssist(requestPayload = null) {
    const phase = String(
        requestPayload?.missionState?.phase || ""
    ).trim();
    const toolName = String(
        requestPayload?.missionState?.toolName || ""
    ).trim();

    return (
        phase === "GROUNDED_ARGUMENT_COMPLETION" &&
        toolName.length > 0
    );
}

'''
text = replace_once(text, anchor, insert, 'resilience-assist-policy')

old_local = '''        const requestPayload = parseRequestPayload(input, init || {});
        const localPlan = compileNexoMission({
            input: requestPayload?.input || "",
            catalog: requestPayload?.catalog || [],
            missionState: requestPayload?.missionState || null,
            context: {
                objectiveId: requestPayload?.missionState?.objectiveId || "",
                caseId: requestPayload?.missionState?.caseId || ""
            }
        });
'''
new_local = '''        const requestPayload = parseRequestPayload(input, init || {});
        const localPlan = localCompilerMayAssist(requestPayload)
            ? compileNexoMission({
                input: requestPayload?.input || "",
                catalog: requestPayload?.catalog || [],
                missionState: requestPayload?.missionState || null,
                context: {
                    objectiveId: requestPayload?.missionState?.objectiveId || "",
                    caseId: requestPayload?.missionState?.caseId || ""
                }
            })
            : null;
'''
text = replace_once(text, old_local, new_local, 'resilience-local-plan-gate')

text = replace_once(
    text,
    '''export const __test = {
    requiredToolNames,
    cloudPlanCoversLocalMission,
    responseHasUsefulPlan
};''',
    '''export const __test = {
    requiredToolNames,
    cloudPlanCoversLocalMission,
    localCompilerMayAssist,
    responseHasUsefulPlan
};''',
    'resilience-test-export'
)
write(path, text)


# ---------------------------------------------------------------------------
# Browser semantic fallback: one generalist policy, no lexical intent router.
# ---------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.multifunction.planner.js'
text = read(path)
text = replace_once(
    text,
    'const VERSION = "4.15.0-attachment-analysis-route";',
    'const VERSION = "4.16.0-generalist-current-turn";',
    'planner-version'
)

version_anchor = '''const BROWSER_PLAN_ATTEMPT_TIMEOUT_MS =
    15000;

'''
generalist_policy = '''const BROWSER_PLAN_ATTEMPT_TIMEOUT_MS =
    15000;

const GENERALIST_CURRENT_TURN_POLICY = [
    "Actua como un agente generalista: entiende libremente la instruccion actual antes de elegir herramientas.",
    "La instruccion actual es la autoridad primaria; el historial, el estado previo y los adjuntos aportan contexto, pero no sustituyen ni arrastran una tarea anterior salvo continuidad o referencia inequívoca del usuario.",
    "Distingue entre objetos de entrada, temas mencionados y resultados realmente solicitados: mencionar una capacidad, formato, archivo o tema no equivale a pedir que se ejecute o produzca.",
    "Selecciona solamente las herramientas necesarias para satisfacer la intencion actual y conserva cada objetivo independiente pedido por el usuario.",
    "Si la solicitud se resuelve conversacionalmente, mediante conocimiento o explicacion, no fabriques artefactos ni operaciones no solicitadas; usa la respuesta semantica disponible o declara la mision completa cuando no haga falta una herramienta."
].join(" ");

'''
text = replace_once(text, version_anchor, generalist_policy, 'planner-generalist-policy')

contract_head = '''    const prompt = [
        "Eres el planificador semantico de Jarvis V7.",
        "Devuelve solamente JSON valido.",'''
contract_new = '''    const prompt = [
        "Eres el planificador semantico de Jarvis V7.",
        GENERALIST_CURRENT_TURN_POLICY,
        "Devuelve solamente JSON valido.",'''
text = replace_once(text, contract_head, contract_new, 'browser-contract-policy')

text = replace_once(
    text,
    'Conserva el orden y usa missionComplete=false.",',
    'Conserva el orden. Si la solicitud no necesita ninguna herramienta, devuelve toolCalls=[] y missionComplete=true; en caso contrario usa missionComplete=false.",',
    'browser-contract-no-tool-rule'
)

semantic_head = '''    const prompt = [
        "Eres el planificador semantico de herramientas de Jarvis V7.",
        "Interpreta significado, typos, negaciones y ordenes mixtas. Selecciona exclusivamente nombres exactos del catalogo.",'''
semantic_new = '''    const prompt = [
        "Eres el planificador semantico de herramientas de Jarvis V7.",
        GENERALIST_CURRENT_TURN_POLICY,
        "Interpreta significado, typos, negaciones y ordenes mixtas. Selecciona exclusivamente nombres exactos del catalogo.",'''
text = replace_once(text, semantic_head, semantic_new, 'browser-semantic-policy')

text = replace_once(
    text,
    '            : "Devuelve solamente JSON valido con toolCalls, missionComplete=false y explanation.",',
    '            : "Devuelve solamente JSON valido con toolCalls, missionComplete y explanation. Si la intencion actual no necesita herramientas, devuelve toolCalls=[] y missionComplete=true; si necesita una o mas herramientas, missionComplete=false.",',
    'browser-semantic-no-tool-rule'
)

old_candidates = '''    const candidates =
        normalizeGroundedImageReferenceCandidates(
            normalizeAttachmentAnalysisRouteCandidates(
                Array.isArray(
                    plan?.toolCalls
                )
                    ? plan.toolCalls
                    : [],
                catalog,
                context
            ),
            catalog,
            context
        );'''
new_candidates = '''    const candidates =
        normalizeGroundedImageReferenceCandidates(
            Array.isArray(
                plan?.toolCalls
            )
                ? plan.toolCalls
                : [],
            catalog,
            context
        );'''
text = replace_once(text, old_candidates, new_candidates, 'planner-remove-lexical-intent-override')

old_contract_empty = '''                if (!auditedPlan) {
                    if (plan.toolCalls.length === 0) {
                        throw new Error("CLIENT_MISSION_CONTRACT_EMPTY");
                    }
                    auditedPlan = {'''
new_contract_empty = '''                if (!auditedPlan) {
                    if (plan.toolCalls.length === 0) {
                        if (plan?.missionComplete === true) {
                            return {
                                ...plan,
                                toolCalls: [],
                                missionComplete: true,
                                ok: true,
                                status: "SEMANTIC_PLAN_READY",
                                provider: "pollinations-browser-json",
                                model: "openai-fast",
                                planKind: "MISSION_CONTRACT_NO_TOOLS"
                            };
                        }
                        throw new Error("CLIENT_MISSION_CONTRACT_EMPTY");
                    }
                    auditedPlan = {'''
text = replace_once(text, old_contract_empty, new_contract_empty, 'browser-contract-accept-no-tools')

old_semantic_empty = '''                    (
                        plan.toolCalls.length === 0 &&
                        !(
                            missionState?.phase === "COMPLETION_AUDIT" &&
                            plan?.missionComplete === true
                        )
                    )'''
new_semantic_empty = '''                    (
                        plan.toolCalls.length === 0 &&
                        plan?.missionComplete !== true
                    )'''
text = replace_once(text, old_semantic_empty, new_semantic_empty, 'browser-semantic-accept-no-tools')

text = replace_once(
    text,
    '''export const __test = {
    runtimeCatalog,''',
    '''export const __test = {
    GENERALIST_CURRENT_TURN_POLICY,
    runtimeCatalog,''',
    'planner-test-export'
)
write(path, text)


# ---------------------------------------------------------------------------
# Resilience tests: deterministic compiler cannot own initial mission intent.
# ---------------------------------------------------------------------------
write('tests/nexo-semantic-resilience.test.mjs', '''import assert from "node:assert/strict";
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
    localCompilerMayAssist,
    responseHasUsefulPlan
} = __test;

function responseFor(result, status = 200) {
    return new Response(
        JSON.stringify({ result }),
        {
            status,
            headers: {
                "Content-Type": "application/json"
            }
        }
    );
}

test("local compiler never owns initial or contract intent", () => {
    assert.equal(localCompilerMayAssist(null), false);
    assert.equal(localCompilerMayAssist({ missionState: null }), false);
    assert.equal(localCompilerMayAssist({
        missionState: { phase: "MISSION_CONTRACT" }
    }), false);
    assert.equal(localCompilerMayAssist({
        missionState: { phase: "COMPLETION_AUDIT" }
    }), false);
});

test("local compiler may assist only an already selected grounded tool", () => {
    assert.equal(localCompilerMayAssist({
        missionState: {
            phase: "GROUNDED_ARGUMENT_COMPLETION",
            toolName: "marketing.plan"
        }
    }), true);
    assert.equal(localCompilerMayAssist({
        missionState: {
            phase: "GROUNDED_ARGUMENT_COMPLETION",
            toolName: ""
        }
    }), false);
});

test("semantic cloud plan is authoritative when no grounded tool requires completion", async () => {
    const cloudPlan = {
        ok: true,
        missionComplete: false,
        toolCalls: [{
            name: "conversation.respond",
            args: { prompt: "Explica el tema solicitado" }
        }]
    };

    assert.equal(cloudPlanCoversLocalMission(cloudPlan, null), true);
    assert.equal(
        await responseHasUsefulPlan(responseFor(cloudPlan), null),
        true
    );
});

test("semantic no-tool completion is valid when no local selected-tool contract exists", async () => {
    const cloudPlan = {
        ok: true,
        missionComplete: true,
        toolCalls: []
    };

    assert.equal(
        await responseHasUsefulPlan(responseFor(cloudPlan), null),
        true
    );
});

test("grounded argument completion still requires the semantically selected tool", async () => {
    const catalog = [
        "marketing.plan",
        "conversation.respond"
    ].map(name => ({ name }));
    const localPlan = compileNexoMission({
        input: [
            "Completa los argumentos de la herramienta ya seleccionada.",
            "INSTRUCCION_ORIGINAL=Haz un plan de marketing para Peninsula Tech"
        ].join("\\n"),
        catalog,
        missionState: {
            phase: "GROUNDED_ARGUMENT_COMPLETION",
            toolName: "marketing.plan"
        }
    });

    assert.deepEqual([...requiredToolNames(localPlan)], ["marketing.plan"]);
    assert.equal(
        await responseHasUsefulPlan(
            responseFor({
                ok: true,
                missionComplete: false,
                toolCalls: [{
                    name: "conversation.respond",
                    args: { prompt: "respuesta generica" }
                }]
            }),
            localPlan
        ),
        false
    );
    assert.equal(
        await responseHasUsefulPlan(
            responseFor({
                ok: true,
                missionComplete: false,
                toolCalls: [{
                    name: "marketing.plan",
                    args: { brandName: "Peninsula Tech" }
                }]
            }),
            localPlan
        ),
        true
    );
});
''')


# ---------------------------------------------------------------------------
# Generalist routing tests: model intent wins; prior state and mentioned formats
# do not synthesize tools client-side.
# ---------------------------------------------------------------------------
write('tests/jarvis-generalist-current-turn.test.mjs', '''import assert from "node:assert/strict";
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
''')

print('V94_GENERALIST_SEMANTIC_AUTHORITY_PATCH_APPLIED')
