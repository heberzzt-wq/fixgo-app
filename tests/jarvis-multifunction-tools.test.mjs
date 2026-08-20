import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    buildImageRequirementsPlan,
    buildReelPlanningSpec,
    describeJarvisMultifunctionTools,
    registerJarvisMultifunctionTools
} from "../gestia-core/jarvis/jarvis.multitool.pack.js";

import {
    buildJarvisMultifunctionToolCalls,
    describeJarvisMultifunctionPlanner,
    isJarvisCapabilityForensicsRequest,
    isJarvisTechnicalDiagnosticRequest,
    mergeJarvisToolCalls,
    __test as plannerTest
} from "../gestia-core/jarvis/jarvis.multifunction.planner.js";

import {
    resolveGestiaRole,
    resolveGestiaRouteDecision
} from "../gestia-core/auth/role-authority.js";

import {
    normalizeImageArtifactOutput
} from "../gestia-core/jarvis/jarvis.actuator.pack.js";

const __dirname =
    path.dirname(
        fileURLToPath(import.meta.url)
    );

test("image artifact output accepts only a compatible safe local path", () => {
    assert.equal(
        normalizeImageArtifactOutput(
            ".jarvis-artifacts/images/escudo.jpg",
            "image/jpeg"
        ),
        ".jarvis-artifacts/images/escudo.jpg"
    );
    assert.equal(
        normalizeImageArtifactOutput(
            "genera y guarda la imagen",
            "image/jpeg"
        ),
        undefined
    );
    assert.equal(
        normalizeImageArtifactOutput(
            ".jarvis-artifacts/images/../escape.jpg",
            "image/jpeg"
        ),
        undefined
    );
    assert.equal(
        normalizeImageArtifactOutput(
            ".jarvis-artifacts/images/escudo.png",
            "image/jpeg"
        ),
        undefined
    );
});

function createRuntime() {
    const registry =
        new Map();

    return {
        register(tool) {
            registry.set(tool.name, tool);
            return {
                ok: true,
                tool: tool.name
            };
        },
        has(name) {
            return registry.has(name);
        },
        list() {
            return [...registry.values()].map(tool => ({
                name: tool.name,
                mutates: tool.mutates === true,
                requiresApproval: tool.requiresApproval === true,
                userArtifact: tool.userArtifact === true,
                missionIsolation:
                    tool.missionIsolation ||
                    null
            }));
        },
        async execute(name, args = {}, context = {}) {
            const tool = registry.get(name);
            if (!tool) return { ok: false, error: "TOOL_NOT_FOUND" };
            return await tool.execute(args, context);
        }
    };
}

const semanticPlannerCatalog = [
    ["conversation.respond", false],
    ["system.health", false],
    ["system.supervision", false],
    ["system.supervision.runNow", true],
    ["system.capabilities", false],
    ["system.forensics", false],
    ["web.research", false],
    ["browser.inspect", false],
    ["image.generate", true, true],
    ["document.compose", false],
    ["spreadsheet.compose", false],
    ["page.compose", false],
    ["document.create", true, true],
    ["connector.list", false],
    ["agent.delegate", false],
    ["page.plan", false],
    ["marketing.plan", false],
    ["image.plan", false],
    ["reel.plan", false],
    ["media.analyze", false],
    ["business.assist", false],
    ["repo.search", false],
    ["repo.read", false],
    ["repo.diagnose", false]
].map(([name, mutates, userArtifact = false]) => ({
    name,
    description: `Herramienta runtime ${name}`,
    mutates,
    requiresApproval: mutates && !userArtifact,
    userArtifact
}));

async function planWithModel(input, toolCalls, { approved = false } = {}) {
    return await buildJarvisMultifunctionToolCalls(input, {
        approved,
        toolCatalog: semanticPlannerCatalog,
        semanticPlanner: async () => ({
            ok: true,
            status: "SEMANTIC_PLAN_READY",
            provider: "test-model",
            model: "semantic-test",
            toolCalls
        })
    });
}

test("media analysis is a mission-wide singleton despite question variants", () => {
    const source = fs.readFileSync(
        path.resolve("gestia-core/jarvis/jarvis.multitool.pack.js"),
        "utf8"
    );

    assert.match(
        source,
        /name:\s*"media\.analyze"[\s\S]{0,500}?missionDedupeBy:\s*\[\]/
    );

    const catalog = [{
        name: "media.analyze",
        description: "Analiza un lote multimodal completo.",
        mutates: false,
        requiresApproval: false,
        missionDedupeBy: [],
        inputSchema: {
            type: "object",
            properties: {
                attachments: { type: "array" },
                questions: { type: "array" }
            },
            additionalProperties: false
        }
    }];

    const calls = plannerTest.trustedPlanCalls(
        {
            toolCalls: [
                {
                    name: "media.analyze",
                    arguments: {
                        attachments: [{ artifactId: "ATTACHMENT_1" }],
                        questions: ["tipo de documento"]
                    }
                },
                {
                    name: "media.analyze",
                    arguments: {
                        attachments: [{ artifactId: "ATTACHMENT_1" }],
                        questions: ["autoridad, CUD y vigencia"]
                    }
                }
            ]
        },
        catalog,
        {}
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].missionDedupeKey, "media.analyze:[]");
});

test("browser mission contract returns every model-selected high-level tool", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    globalThis.fetch = async url => {
        requestedUrl = String(url);
        return {
            ok: true,
            text: async () => JSON.stringify({
                toolCalls: [
                    { name: "web.research", arguments: { query: "SUMM", allowedDomain: "www.summ.com.mx" } },
                    { name: "marketing.plan", arguments: {} },
                    { name: "page.plan", arguments: {} },
                    { name: "image.plan", arguments: {} },
                    { name: "reel.plan", arguments: { durationSeconds: 45 } }
                ],
                missionComplete: false
            })
        };
    };
    try {
        const result = await plannerTest.callBrowserMissionContract(
            "Investiga SUMM y entrega marketing, landing, imagen y reel sin escribir.",
            semanticPlannerCatalog,
            {
                existingInitialTools: [
                    "web.research",
                    "marketing.plan",
                    "page.plan",
                    "image.plan",
                    "reel.plan"
                ]
            }
        );
        assert.ok(requestedUrl.includes("text.pollinations.ai"));
        assert.match(
            decodeURIComponent(
                requestedUrl
            ),
            /HERRAMIENTAS_INICIALES=web\.research,marketing\.plan,page\.plan,image\.plan,reel\.plan/
        );
        assert.equal(result.provider, "pollinations-browser-json");
        assert.deepEqual(result.toolCalls.map(call => call.name), [
            "web.research",
            "marketing.plan",
            "page.plan",
            "image.plan",
            "reel.plan"
        ]);

        const trusted = plannerTest.trustedPlanCalls(result, semanticPlannerCatalog, {});
        assert.equal(trusted[0].args.allowedDomain, "www.summ.com.mx");
        assert.equal(trusted[4].args.durationSeconds, 45);

        const recoveredPlan = await plannerTest.callBrowserSemanticPlan(
            "Investiga SUMM y entrega landing.",
            semanticPlannerCatalog
        );
        assert.equal(recoveredPlan.provider, "pollinations-browser-json");
        assert.ok(recoveredPlan.toolCalls.some(call => call.name === "page.plan"));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("browser mission contract audits and restores a subject omitted by its first sample", async () => {
    const originalFetch = globalThis.fetch;
    let requestCount = 0;
    const catalog = [{
        name: "repo.search",
        description: "Busca cada sujeto independiente.",
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
    globalThis.fetch = async url => {
        requestCount += 1;
        const decodedUrl = decodeURIComponent(String(url));
        if (requestCount === 2) {
            assert.match(decodedUrl, /AUDITORIA SEMANTICA DE COBERTURA/);
            assert.match(decodedUrl, /BORRADOR_DE_CONTRATO/);
        }
        return {
            ok: true,
            text: async () => JSON.stringify({
                toolCalls: requestCount === 1
                    ? [
                        { name: "repo.search", arguments: { query: "app-login.js" } },
                        { name: "repo.search", arguments: { query: "firebase.js" } }
                    ]
                    : [
                        { name: "repo.search", arguments: { query: "tecnico b2b" } }
                    ],
                missionComplete: false
            })
        };
    };

    try {
        const result = await plannerTest.callBrowserMissionContract(
            "Reviza tecnico b2b, app-login.js y firebase.js.",
            catalog
        );
        assert.equal(requestCount, 2);
        assert.equal(result.planKind, "MISSION_CONTRACT_AUDITED");
        assert.deepEqual(
            plannerTest.trustedPlanCalls(result, catalog, {}).map(call => call.args.query),
            ["app-login.js", "firebase.js", "tecnico b2b"]
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("browser mission coverage keeps one call per stable research objective", async () => {
    const originalFetch =
        globalThis.fetch;
    let requestCount =
        0;
    const catalog = [{
        name:
            "web.research",
        description:
            "Investiga objetivos con fuentes.",
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
    globalThis.fetch =
        async () => {
            requestCount +=
                1;
            return {
                ok:
                    true,
                text:
                    async () =>
                        JSON.stringify({
                            toolCalls: requestCount === 1
                                ? [{
                                    name:
                                        "web.research",
                                    arguments: {
                                        query:
                                            "Firebase custom claims"
                                    }
                                }]
                                : [{
                                    name:
                                        "web.research",
                                    arguments: {
                                        query:
                                            "roles con Firebase claims"
                                    }
                                }],
                            missionComplete:
                                false
                        })
            };
        };

    try {
        const result =
            await plannerTest
                .callBrowserMissionContract(
                    "Investiga Firebase custom claims y roles.",
                    catalog
                );
        assert.equal(
            requestCount,
            2
        );
        assert.equal(
            result.toolCalls.length,
            1
        );
        assert.equal(
            result.toolCalls[0]
                .args
                .researchGoal,
            "RESEARCH_1"
        );
        assert.equal(
            result.toolCalls[0]
                .missionDedupeKey,
            'web.research:["RESEARCH_1"]'
        );
    }
    finally {
        globalThis.fetch =
            originalFetch;
    }
});

test("browser planner blocks tool calls with missing required arguments", () => {
    const catalog = [{
        name: "repo.read",
        description: "Lee un archivo real.",
        mutates: false,
        requiresApproval: false,
        inputSchema: {
            type: "object",
            required: ["file"],
            properties: {
                file: { type: "string" }
            },
            additionalProperties: false
        }
    }];

    assert.equal(
        plannerTest.trustedPlanCalls(
            {
                toolCalls: [{
                    name: "repo.read",
                    args: {}
                }]
            },
            catalog,
            {}
        ).length,
        0
    );
    assert.equal(
        plannerTest.trustedPlanCalls(
            {
                toolCalls: [{
                    name: "repo.read",
                    args: {
                        file: "gestia-core/gestia-core.js"
                    }
                }]
            },
            catalog,
            {}
        ).length,
        1
    );

    const deferred =
        plannerTest.trustedPlanCalls(
            {
                planKind:
                    "MISSION_CONTRACT_AUDITED",
                toolCalls: [{
                    name:
                        "repo.read",
                    args:
                        {}
                }]
            },
            catalog,
            {}
        );

    assert.equal(deferred.length, 1);
    assert.equal(deferred[0].deferred, true);
});

test("browser planner rejects malformed delegation and retains the full runtime catalog", () => {
    const delegationTool = {
        name:
            "agent.delegate",
        description:
            "Delega tareas read-only.",
        mutates:
            false,
        requiresApproval:
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
    const plan =
        (
            tasks,
            delegationDirective =
                "delega en paralelo"
        ) => ({
            toolCalls: [{
                name:
                    "agent.delegate",
                args: {
                    tasks,
                    delegationDirective
                }
            }]
        });

    assert.equal(
        plannerTest
            .trustedPlanCalls(
                plan([]),
                [
                    delegationTool
                ],
                {
                    originalInstruction:
                        "delega en paralelo"
                }
            )
            .length,
        0
    );
    assert.equal(
        plannerTest
            .trustedPlanCalls(
                plan([{}]),
                [
                    delegationTool
                ],
                {
                    originalInstruction:
                        "delega en paralelo"
                }
            )
            .length,
        0
    );
    assert.equal(
        plannerTest
            .trustedPlanCalls(
                plan([{
                    tool:
                        "repo.read"
                }]),
                [
                    delegationTool
                ],
                {
                    originalInstruction:
                        "delega en paralelo"
                }
            )
            .length,
        1
    );
    assert.equal(
        plannerTest
            .trustedPlanCalls(
                plan(
                    [{
                        tool:
                            "repo.read"
                    }],
                    "delega otra tarea"
                ),
                [
                    delegationTool
                ],
                {
                    originalInstruction:
                        "consulta directamente el repo"
                }
            )
            .length,
        0
    );

    const fullCatalog =
        Array.from(
            {
                length:
                    70
            },
            (_, index) => ({
                name:
                    `domain${index}.tool${index}`,
                description:
                    "Herramienta verificada.",
                mutates:
                    false
            })
        );
    assert.equal(
        plannerTest
            .runtimeCatalog({
                toolCatalog:
                    fullCatalog
            })
            .length,
        70
    );
});

test("browser planner rejects registered tool identifiers used as repository file paths", () => {
    const catalog = [{
        name:
            "repo.read",
        description:
            "Lee un archivo real.",
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
        description:
            "Escribe un archivo.",
        mutates:
            true
    }];
    const build =
        file =>
            plannerTest
                .trustedPlanCalls(
                    {
                        toolCalls: [{
                            name:
                                "repo.read",
                            args: {
                                file
                            }
                        }]
                    },
                    catalog,
                    {
                        originalInstruction:
                            "revisa el plan"
                    }
                );

    assert.equal(
        build(
            "repo.write"
        ).length,
        0
    );
    assert.equal(
        build(
            "app-login.js"
        ).length,
        1
    );
});

test("browser planner isolates a self-contained mission from adjacent model-selected tools", async () => {
    const catalog = [{
        name:
            "repo.architectReview",
        description:
            "Revisa un plan completo.",
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
    const result =
        await buildJarvisMultifunctionToolCalls(
            "Revisa solamente este plan.",
            {
                toolCatalog:
                    catalog,
                semanticPlanner:
                    async () => ({
                        ok:
                            true,
                        status:
                            "SEMANTIC_PLAN_READY",
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
                    })
            }
        );

    assert.deepEqual(
        result.map(call =>
            call.name
        ),
        [
            "repo.architectReview"
        ]
    );
});

test("browser planner deduplicates artifact stages by declared mission identity", () => {
    const catalog = [
        {
            name: "page.compose",
            mutates: false,
            missionDedupeBy: []
        },
        {
            name: "document.create",
            mutates: true,
            userArtifact: true,
            missionDedupeBy: ["format"]
        }
    ];
    const calls = plannerTest.trustedPlanCalls(
        {
            planKind: "MISSION_CONTRACT_AUDITED",
            toolCalls: [
                {
                    name: "page.compose",
                    args: { title: "Landing HMH" }
                },
                {
                    name: "page.compose",
                    args: { title: "HMH servicios" }
                },
                {
                    name: "document.create",
                    args: { format: "docx", title: "Guía A" }
                },
                {
                    name: "document.create",
                    args: { format: "docx", title: "Guía B" }
                },
                {
                    name: "document.create",
                    args: { format: "xlsx", title: "APU" }
                }
            ]
        },
        catalog,
        {}
    );

    assert.deepEqual(
        calls.map(call => `${call.name}:${call.args.format || "singleton"}`),
        [
            "page.compose:singleton",
            "document.create:docx",
            "document.create:xlsx"
        ]
    );
    assert.deepEqual(
        calls.map(call => call.missionDedupeKey),
        [
            "page.compose:[]",
            'document.create:["docx"]',
            'document.create:["xlsx"]'
        ]
    );
});

test("multifunction pack registers certification and remains read-only", () => {
    const runtime =
        createRuntime();

    const result =
        registerJarvisMultifunctionTools(runtime);

    assert.equal(result.ok, true);
    assert.deepEqual(result.tools, [
        "conversation.respond",
        "document.compose",
        "spreadsheet.compose",
        "page.compose",
        "system.capabilities",
        "system.forensics",
        "system.health",
        "system.certify",
        "system.supervision",
        "web.research",
        "business.assist",
        "marketing.plan",
        "page.plan",
        "image.plan",
        "reel.plan",
        "media.analyze"
    ]);

    assert.equal(
        runtime.list().every(tool => tool.mutates === false),
        true
    );
});

test("document composition continues a cut response and verifies its real ending", async () => {
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);
    let requestCount = 0;

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken: async () => "test-token"
            }
        };
        globalThis.fetch = async (_url, options) => {
            requestCount += 1;
            const request = JSON.parse(options.body);
            assert.equal(
                request.data.maxOutputTokens,
                requestCount ===
                    1
                    ? 8000
                    : 4500
            );
            return {
                ok: true,
                text: async () => JSON.stringify({
                    result: {
                        ok: true,
                        status: "SEMANTIC_RESPONSE_READY",
                        provider: "test",
                        model: "test-model",
                        message: requestCount === 1
                            ? `${"# Guía\n\nContenido inicial. ".repeat(30)}\n## Plan de estudio`
                            : "Días 1 al 7 completos.\n## Simulacro\n20 reactivos y respuestas.\n[[JARVIS_DOCUMENT_COMPLETE]]"
                    }
                })
            };
        };

        const result = await runtime.execute(
            "document.compose",
            {
                title: "Guía de Español",
                format: "docx",
                instructions: "Incluye un plan de estudio de 7 días y una conclusión operativa."
            }
        );

        assert.equal(requestCount, 2);
        assert.equal(result.ok, true);
        assert.equal(result.status, "DOCUMENT_CONTENT_COMPOSED");
        assert.equal(result.completionVerified, true);
        assert.equal(result.continuationCount, 1);
        assert.match(result.content, /Contenido inicial/);
        assert.match(result.content, /20 reactivos y respuestas/);
        assert.doesNotMatch(result.content, /JARVIS_DOCUMENT_COMPLETE/);
    } finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
    }
});

test("document composition continues after a premature marker until the contract passes", async () => {
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);
    let requestCount = 0;

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken: async () => "test-token"
            }
        };
        globalThis.fetch = async () => {
            requestCount += 1;
            const message = requestCount === 1
                ? [
                    "# 1. Portada",
                    ("Presentación profesional con control documental, alcance y responsables verificables. ").repeat(4)
                ].join("\n\n")
                : requestCount === 2
                    ? [
                        "# 2. Objetivo y alcance",
                        ("Procedimiento operativo con criterios de aceptación y evidencias. ").repeat(4),
                        "[[JARVIS_DOCUMENT_COMPLETE]]"
                    ].join("\n\n")
                    : [
                        "# 3. Anexos",
                        ("Registro final único con trazabilidad, responsables, controles, acciones preventivas y criterios verificables para cerrar la operación. ").repeat(14),
                        "[[JARVIS_DOCUMENT_COMPLETE]]"
                    ].join("\n\n");
            return {
                ok: true,
                text: async () => JSON.stringify({
                    result: {
                        ok: true,
                        status: "SEMANTIC_RESPONSE_READY",
                        provider: "test",
                        model: "test-model",
                        message
                    }
                })
            };
        };

        const result = await runtime.execute(
            "document.compose",
            {
                title: "Manual verificable",
                format: "docx",
                instructions: [
                    "Crea un manual de mínimo 180 palabras y 3 secciones.",
                    "1. Portada",
                    "2. Objetivo y alcance",
                    "3. Anexos"
                ].join("\n")
            }
        );

        assert.equal(requestCount, 3);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.validationPassed, true);
        assert.equal(result.compositionComplete, true);
        assert.equal(result.continuationCount, 2);
        assert.ok(result.wordCount >= 180);
        assert.equal(result.sectionCount, 3);
        assert.deepEqual(result.validationFailures, []);
        assert.doesNotMatch(result.content, /JARVIS_DOCUMENT_COMPLETE/);
    } finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
    }
});

test("document composition rejects a placeholder even when every response claims completion", async () => {
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);
    let requestCount = 0;

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken: async () => "test-token"
            }
        };
        globalThis.fetch = async () => {
            requestCount += 1;
            return {
                ok: true,
                text: async () => JSON.stringify({
                    result: {
                        ok: true,
                        status: "SEMANTIC_RESPONSE_READY",
                        provider: "test",
                        model: "test-model",
                        message: [
                            "Manual Operativo",
                            "El contenido completo del manual generado por document.compose.",
                            "[[JARVIS_DOCUMENT_COMPLETE]]"
                        ].join("\n\n")
                    }
                })
            };
        };

        const result = await runtime.execute(
            "document.compose",
            {
                title: "Manual Operativo",
                format: "docx",
                instructions: "Crea un documento de mínimo 80 palabras."
            }
        );

        assert.equal(requestCount, 7);
        assert.equal(result.ok, false);
        assert.equal(result.status, "DOCUMENT_CONTENT_COMPOSITION_FAILED");
        assert.equal(result.validationPassed, false);
        assert.equal(result.continuationCount, 6);
        assert.ok(result.validationFailures.includes("DOCUMENT_PLACEHOLDER_DETECTED"));
        assert.ok(result.validationFailures.some(item =>
            item.startsWith("DOCUMENT_WORD_COUNT_BELOW_MINIMUM")
        ));
    } finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
    }
});

test("spreadsheet composition repairs invalid cross-sheet formulas before creation", async () => {
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);
    let requestCount = 0;

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken: async () => "test-token"
            }
        };
        globalThis.fetch = async () => {
            requestCount += 1;
            const workbook = requestCount === 1
                ? {
                    title: "APU",
                    sheets: [
                        {
                            name: "Mano de Obra",
                            rows: [
                                ["Concepto", "Importe"],
                                ["Cuadrilla", 100]
                            ]
                        },
                        {
                            name: "Costo Directo",
                            rows: [
                                ["Concepto", "Cantidad", "Precio", "Importe"],
                                ["Herramienta", 1, "SUPUESTO", "=B2*C2"],
                                ["Circular", "", "", "=D3"],
                                ["Fuera", "", "", "=B20*2"],
                                ["Mano de obra", "", "", "=Mano_de_Obra!B2*0.03 (SUPUESTO)"]
                            ]
                        }
                    ]
                }
                : {
                    title: "APU",
                    sheets: [
                        {
                            name: "Mano de Obra",
                            rows: [
                                ["Concepto", "Importe"],
                                ["Cuadrilla", 100]
                            ]
                        },
                        {
                            name: "Costo Directo",
                            rows: [
                                ["Concepto", "Importe", "Criterio"],
                                ["Herramienta", "='Mano de Obra'!B2*0.03", "SUPUESTO"]
                            ]
                        }
                    ]
                };
            return {
                ok: true,
                text: async () => JSON.stringify({
                    result: {
                        ok: true,
                        status: "SEMANTIC_RESPONSE_READY",
                        provider: "test",
                        model: "test-model",
                        message: JSON.stringify(workbook)
                    }
                })
            };
        };

        const result = await runtime.execute(
            "spreadsheet.compose",
            {
                title: "APU",
                instructions: "Crea un APU con fórmulas y supuestos."
            }
        );

        assert.equal(requestCount, 2);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.status, "SPREADSHEET_BLUEPRINT_READY");
        assert.equal(result.formulaValidationPassed, true);
        assert.equal(result.invalidFormulas.length, 0);
        assert.equal(result.formulaCount, 1);
        assert.equal(
            result.sheets[1].rows[1][1],
            "='Mano de Obra'!B2*0.03"
        );
        assert.equal(
            result.sheets[1].rows[1][2],
            "SUPUESTO"
        );
    } finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
    }
});

test("spreadsheet composition rebuilds empty and structurally invalid attempts before creation", async () => {
    const runtime =
        createRuntime();
    registerJarvisMultifunctionTools(
        runtime
    );
    const previousAuth =
        globalThis.auth;
    const previousFetch =
        globalThis.fetch;
    let requestCount = 0;

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken:
                    async () =>
                        "test-token"
            }
        };
        globalThis.fetch = async () => {
            requestCount += 1;
            const workbook =
                requestCount === 1
                    ? {
                        title:
                            "APU",
                        sheets:
                            []
                    }
                    : requestCount === 2
                        ? {
                            title:
                                "APU",
                            sheets: [{
                                name:
                                    "APU",
                                rows: [
                                    [
                                        "Concepto",
                                        "Cantidad",
                                        "Precio",
                                        "Importe"
                                    ],
                                    [
                                        "Block",
                                        13,
                                        "SUPUESTO",
                                        "=B2*C2"
                                    ]
                                ]
                            }]
                        }
                        : {
                            title:
                                "APU",
                            sheets: [{
                                name:
                                    "APU",
                                rows: [
                                    [
                                        "Concepto",
                                        "Cantidad",
                                        "Precio",
                                        "Importe",
                                        "Criterio"
                                    ],
                                    [
                                        "Block",
                                        13,
                                        20,
                                        "=B2*C2",
                                        "SUPUESTO"
                                    ]
                                ]
                            }, {
                                name:
                                    "Criterios",
                                rows: [
                                    [
                                        "Dato",
                                        "Tratamiento"
                                    ],
                                    [
                                        "Precio",
                                        "SUPUESTO; validar"
                                    ]
                                ]
                            }]
                        };
            return {
                ok:
                    true,
                text:
                    async () =>
                        JSON.stringify({
                            result: {
                                ok:
                                    true,
                                status:
                                    "SEMANTIC_RESPONSE_READY",
                                provider:
                                    "test",
                                model:
                                    "test-model",
                                message:
                                    JSON.stringify(
                                        workbook
                                    )
                            }
                        })
            };
        };

        const result =
            await runtime.execute(
                "spreadsheet.compose",
                {
                    title:
                        "APU",
                    instructions:
                        "Crea un APU con formulas."
                }
            );

        assert.equal(requestCount, 3);
        assert.equal(
            result.ok,
            true,
            JSON.stringify(result)
        );
        assert.equal(
            result.repairCount,
            2
        );
        assert.equal(
            result.formulaCount,
            1
        );
        assert.equal(
            result.formulaValidationPassed,
            true
        );
        assert.equal(
            result.sheets[0]
                .rows[1][4],
            "SUPUESTO"
        );
    }
    finally {
        globalThis.auth =
            previousAuth;
        globalThis.fetch =
            previousFetch;
    }
});

test("campaign visual and reel planning require grounded structured evidence", () => {
    const imagePlan = buildImageRequirementsPlan({
        brandName: "SUMM",
        campaignGoal: "Presentar servicios empresariales",
        audience: "Tomadores de decision",
        concepts: [{
            name: "Hero corporativo",
            purpose: "Comunicar la propuesta",
            composition: "Equipo y operacion real en primer plano",
            grounding: "https://www.summ.com.mx/servicios",
            generationPrompt: "Composicion corporativa basada en el servicio documentado, sin logotipos inventados",
            exclusionPrompt: "Texto ilegible",
            aspectRatios: ["16:9", "1:1"]
        }]
    });
    assert.equal(imagePlan.ok, true);
    assert.equal(imagePlan.generatedImages, false);
    assert.equal(imagePlan.writeAllowed, false);

    const reelPlan = buildReelPlanningSpec({
        brandName: "SUMM",
        title: "Soluciones que avanzan",
        cta: "Solicita informacion",
        durationSeconds: 45,
        scenes: [
            { durationSeconds: 15, visual: "Portada corporativa", overlay: "SUMM", voiceover: "Conoce SUMM", evidence: "https://www.summ.com.mx/" },
            { durationSeconds: 15, visual: "Servicios publicados", overlay: "Servicios", voiceover: "Soluciones para empresas", evidence: "https://www.summ.com.mx/servicios" },
            { durationSeconds: 15, visual: "Cierre con contacto", overlay: "Conversemos", voiceover: "Solicita informacion", evidence: "https://www.summ.com.mx/contacto" }
        ]
    });
    assert.equal(reelPlan.ok, true);
    assert.equal(reelPlan.timelineSeconds, 45);
    assert.equal(reelPlan.producedVideo, false);
    assert.equal(reelPlan.writeAllowed, false);
    assert.equal(buildReelPlanningSpec({ durationSeconds: 45, scenes: [] }).ok, false);
});

test("business assistant uses the semantic model when a real company is outside the static registry", async () => {
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const previousMemory = globalThis.JarvisToolMemory;
    let semanticRequest = null;
    globalThis.auth = { currentUser: null };
    const authTimer = setTimeout(() => {
        globalThis.auth.currentUser = {
            getIdToken: async () => "test-token"
        };
    }, 120);
    globalThis.JarvisToolMemory = {
        last: () => ({
            data: {
                grounded: true,
                query: "Multiservicios Peninsulares HMH",
                answer: "Empresa de mantenimiento y remodelacion con servicios publicados.",
                sources: [{
                    title: "Sitio oficial MPH",
                    url: "https://multiserviciospeninsulareshmh.com/"
                }]
            }
        })
    };
    globalThis.fetch = async (_url, options) => {
        semanticRequest = JSON.parse(options.body);
        return ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
            result: {
                ok: true,
                status: "SEMANTIC_RESPONSE_READY",
                provider: "test-provider",
                model: "test-model",
                message: "Propuesta B2B basada en mantenimiento verificable, con riesgos y siguientes acciones."
            }
        })
    });
    };

    try {
        const runtime = createRuntime();
        registerJarvisMultifunctionTools(runtime);
        const result = await runtime.execute("business.assist", {
            prompt: "Define una propuesta de valor B2B para MPH sin inventar datos"
        });
        assert.equal(result.ok, true);
        assert.equal(result.status, "BUSINESS_ADVISORY_READY");
        assert.equal(result.source, "BUSINESS_SEMANTIC_MODEL");
        assert.equal(result.factsPolicy, "NO_INVENTED_FACTS");
        assert.doesNotMatch(result.message, /falta objetivo/i);
        assert.match(semanticRequest?.data?.input || "", /Sitio oficial MPH/);
        assert.match(semanticRequest?.data?.input || "", /mantenimiento y remodelacion/);
        assert.ok((semanticRequest?.data?.input || "").length <= 1580);
    } finally {
        clearTimeout(authTimer);
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
        globalThis.JarvisToolMemory = previousMemory;
    }
});

test("capability forensics reports evidence-backed gaps without claiming Codex parity", async () => {
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousWebHealth =
        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__;
    delete globalThis.__JARVIS_WEB_RESEARCH_HEALTH__;
    globalThis.JarvisLocalBridge = {
        verifyIdentity: async () => ({
            ok: true,
            status: "BRIDGE_IDENTITY_OK",
            bridgeRoot: "C:/repo"
        })
    };

    try {
        const runtime = createRuntime();
        registerJarvisMultifunctionTools(runtime);

        const result = await runtime.execute("system.forensics");

        assert.equal(result.ok, true);
        assert.equal(result.parity.canClaimParity, false);
        assert.equal(result.parity.policy, "EVIDENCE_ONLY");
        assert.ok(result.readinessScore >= 0 && result.readinessScore <= 100);
        assert.equal(
            result.capabilities.find(item => item.id === "browser_control")?.status,
            "NOT_AVAILABLE"
        );
        assert.equal(
            result.capabilities.find(item => item.id === "web_research")?.status,
            "PARTIAL"
        );
        assert.ok(result.gaps.some(item => item.id === "web_research"));
        assert.ok(result.gaps.some(item => item.id === "image_generation"));
        assert.equal(
            result.capabilities.find(item => item.id === "professional_pdf_editing")?.status,
            "NOT_AVAILABLE"
        );
        assert.equal(
            result.capabilities.find(item => item.id === "reel_video_production")?.status,
            "NOT_AVAILABLE"
        );
        assert.ok(result.gaps.some(item => item.id === "professional_pdf_editing"));
        assert.ok(result.gaps.some(item => item.id === "structured_document_editing"));
        assert.ok(result.gaps.some(item => item.id === "persistent_cases"));
        assert.equal(result.runtime.registeredTools, result.runtime.tools.length);
        assert.ok(result.runtime.tools.includes("system.forensics"));
        assert.equal(
            result.capabilities.find(item => item.id === "repo_engineering")?.label,
            "Ingenieria del repositorio"
        );

        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = {
            ok: true,
            grounded: true,
            status: "GROUNDED",
            sourceCount: 3,
            factCount: 5,
            checkedAt:
                "2026-07-14T01:00:00.000Z"
        };

        const verified =
            await runtime.execute("system.forensics");
        const verifiedWeb =
            verified.capabilities.find(
                item => item.id === "web_research"
            );

        assert.equal(verifiedWeb.status, "READY");
        assert.equal(verifiedWeb.evidence.verified, true);
        assert.equal(verifiedWeb.evidence.sourceCount, 3);
        assert.equal(verifiedWeb.evidence.factCount, 5);
        assert.ok(!verified.gaps.some(item => item.id === "web_research"));

        const capabilities = await runtime.execute("system.capabilities");
        assert.equal(capabilities.readiness.parity.canClaimParity, false);
        assert.ok(Array.isArray(capabilities.readiness.gaps));
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
        if (previousWebHealth === undefined) {
            delete globalThis.__JARVIS_WEB_RESEARCH_HEALTH__;
        }
        else {
            globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ =
                previousWebHealth;
        }
    }
});


test("system certification preserves an incomplete verdict as a successful diagnostic outcome", async () => {
    const previousBridge =
        globalThis.JarvisLocalBridge;
    const previousWebHealth =
        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__;

    globalThis.JarvisLocalBridge = {
        verifyIdentity: async () => ({
            ok: true,
            status: "BRIDGE_IDENTITY_OK",
            bridgeRoot: "C:/repo"
        })
    };

    globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = {
        ok: true,
        grounded: true,
        status: "GROUNDED",
        sourceCount: 1,
        factCount: 1,
        checkedAt:
            "2026-07-27T00:00:00.000Z"
    };

    try {
        const runtime =
            createRuntime();

        registerJarvisMultifunctionTools(
            runtime
        );

        const controlledChecks = {
            "system.health": {
                ok: true,
                status: "ONLINE"
            },
            "conversation.respond": {
                ok: true,
                status: "SEMANTIC_RESPONSE_READY",
                message:
                    "CERTIFICACION_CONVERSACION_OK"
            },
            "web.research": {
                ok: true,
                status: "GROUNDED",
                source:
                    "JARVIS_GROUNDED_WEB_RESEARCH",
                sourceCount: 1,
                sources: [{
                    title:
                        "Fuente oficial",
                    url:
                        "https://example.com/"
                }]
            },
            "connector.list": {
                ok: true,
                status: "CONNECTED",
                connectedCount: 0
            },
            "system.supervision": {
                ok: true,
                status: "HEALTHY",
                source:
                    "JARVIS_DAILY_SUPERVISOR",
                reportId:
                    "2026-07-27",
                startedAtIso:
                    "2026-07-27T09:00:00.000Z"
            },
            "repo.gitStatus": {
                ok: true,
                status: "CLEAN"
            },
            "tests.run": {
                ok: true,
                status: "PASSED",
                passed: 10,
                failed: 0
            }
        };

        for (
            const [name, result]
            of Object.entries(
                controlledChecks
            )
        ) {
            runtime.register({
                name,
                mutates: false,
                requiresApproval: false,
                execute: async () => result
            });
        }

        const result =
            await runtime.execute(
                "system.certify",
                {
                    deep: true
                }
            );

        assert.equal(
            result.ok,
            true,
            JSON.stringify(result)
        );
        assert.equal(
            result.executionOk,
            true
        );
        assert.equal(
            result.objectiveSatisfied,
            true
        );
        assert.equal(
            result.blocked,
            false
        );
        assert.equal(
            result.retryable,
            false
        );
        assert.equal(
            result.status,
            "CERTIFICATION_INCOMPLETE"
        );
        assert.equal(
            result.certified,
            false
        );
        assert.equal(
            result.failedChecks.length,
            0
        );
        assert.ok(
            result.checks.every(
                check => check.ok === true
            )
        );
        assert.ok(
            result.incompleteReasons.includes(
                "PARITY_GAPS"
            )
        );
        assert.ok(
            result.incompleteReasons.includes(
                "READINESS_BELOW_100"
            )
        );
        assert.match(
            result.message,
            /se ejecuto correctamente/i
        );
    }
    finally {
        globalThis.JarvisLocalBridge =
            previousBridge;

        if (
            previousWebHealth ===
            undefined
        ) {
            delete globalThis
                .__JARVIS_WEB_RESEARCH_HEALTH__;
        }
        else {
            globalThis
                .__JARVIS_WEB_RESEARCH_HEALTH__ =
                previousWebHealth;
        }
    }
});


test("tests.run exposes failed assertions without misclassifying process execution", () => {
    const source =
        fs.readFileSync(
            path.join(
                process.cwd(),
                "gestia-core",
                "tools.runtime.js"
            ),
            "utf8"
        );

    const nameIndex =
        source.indexOf(
            'name: "tests.run"'
        );

    const start =
        source.lastIndexOf(
            "JarvisToolRuntime.register({",
            nameIndex
        );

    const end =
        source.indexOf(
            "\n});",
            nameIndex
        );

    const registration =
        source.slice(
            start,
            end + 4
        );

    assert.match(
        registration,
        /executionOk\s*=\s*passed\s*\|\|\s*exitCode\s*!==\s*null/
    );
    assert.match(
        registration,
        /objectiveSatisfied:\s*passed/
    );
    assert.match(
        registration,
        /"TESTS_NOT_PASSING"/
    );
    assert.match(
        registration,
        /exitCode/
    );
    assert.match(
        registration,
        /stdout/
    );
    assert.match(
        registration,
        /stderr/
    );
    assert.match(
        registration,
        /endpoint:\s*"\/run"/
    );
});

test("system certification records failed tests as an unsatisfied check with process evidence", async () => {
    const previousBridge =
        globalThis.JarvisLocalBridge;
    const previousWebHealth =
        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__;

    globalThis.JarvisLocalBridge = {
        verifyIdentity: async () => ({
            ok: true,
            status: "BRIDGE_IDENTITY_OK",
            bridgeRoot: "C:/repo"
        })
    };

    globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = {
        ok: true,
        grounded: true,
        status: "GROUNDED",
        sourceCount: 1,
        factCount: 1,
        checkedAt:
            "2026-07-28T00:00:00.000Z"
    };

    try {
        const runtime =
            createRuntime();

        registerJarvisMultifunctionTools(
            runtime
        );

        const controlledChecks = {
            "system.health": {
                ok: true,
                status: "ONLINE"
            },
            "conversation.respond": {
                ok: true,
                status:
                    "SEMANTIC_RESPONSE_READY",
                message:
                    "CERTIFICACION_CONVERSACION_OK"
            },
            "web.research": {
                ok: true,
                status: "GROUNDED",
                source:
                    "JARVIS_GROUNDED_WEB_RESEARCH",
                sourceCount: 1,
                sources: [{
                    title:
                        "Fuente oficial",
                    url:
                        "https://example.com/"
                }]
            },
            "connector.list": {
                ok: true,
                status: "CONNECTED",
                connectedCount: 2
            },
            "system.supervision": {
                ok: true,
                status: "HEALTHY",
                source:
                    "JARVIS_DAILY_SUPERVISOR",
                score: 100,
                reportId:
                    "2026-07-28",
                startedAtIso:
                    "2026-07-28T09:00:00.000Z"
            },
            "repo.gitStatus": {
                ok: true,
                status: "CLEAN"
            },
            "tests.run": {
                ok: true,
                executionOk: true,
                objectiveSatisfied: false,
                status:
                    "TESTS_NOT_PASSING",
                error:
                    "TESTS_NOT_PASSING",
                npmCommand:
                    "npm test",
                cwd:
                    ".",
                timeoutMs:
                    120000,
                exitCode:
                    1,
                stdout:
                    "tests 20; pass 19; fail 1",
                stderr:
                    "AssertionError: expected true"
            }
        };

        for (
            const [name, result]
            of Object.entries(
                controlledChecks
            )
        ) {
            runtime.register({
                name,
                mutates: false,
                requiresApproval: false,
                execute: async () => result
            });
        }

        const result =
            await runtime.execute(
                "system.certify",
                {
                    deep: true
                }
            );

        const testCheck =
            result.checks.find(
                check =>
                    check.tool ===
                    "tests.run"
            );

        assert.equal(
            result.ok,
            true,
            JSON.stringify(result)
        );
        assert.equal(
            result.executionOk,
            true
        );
        assert.equal(
            result.status,
            "CERTIFICATION_INCOMPLETE"
        );
        assert.equal(
            result.certified,
            false
        );
        assert.equal(
            testCheck.ok,
            false
        );
        assert.equal(
            testCheck.executionOk,
            true
        );
        assert.equal(
            testCheck.objectiveSatisfied,
            false
        );
        assert.equal(
            testCheck.evidence.exitCode,
            1
        );
        assert.equal(
            testCheck.evidence.command,
            "npm test"
        );
        assert.match(
            testCheck.evidence.stdout,
            /fail 1/
        );
        assert.match(
            testCheck.evidence.stderr,
            /AssertionError/
        );
        assert.ok(
            result.failedChecks.some(
                check =>
                    check.tool ===
                    "tests.run"
            )
        );
        assert.ok(
            result.incompleteReasons.includes(
                "CHECK_FAILURES"
            )
        );
    }
    finally {
        globalThis.JarvisLocalBridge =
            previousBridge;

        if (
            previousWebHealth ===
            undefined
        ) {
            delete globalThis
                .__JARVIS_WEB_RESEARCH_HEALTH__;
        }
        else {
            globalThis
                .__JARVIS_WEB_RESEARCH_HEALTH__ =
                previousWebHealth;
        }
    }
});

test("large document composition repairs one failed semantic segment", async () => {
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);
    let requestCount = 0;
    const sectionNarrative =
        sectionNumber =>
            Array.from(
                { length: 36 },
                (_unused, index) =>
                    `Procedimiento operativo seguro verificable folio${sectionNumber}x${index + 1} con responsable, evidencia, frecuencia, criterio, recurso, riesgo y acción correctiva documentada.`
            )
                .join(" ");
    const markdownTable = label => [
        `### ${label}`,
        "| Campo | Responsable | Evidencia | Frecuencia |",
        "| --- | --- | --- | --- |",
        "| Control | Coordinador | Registro | Diario |"
    ].join("\n");
    const segmentOne = [
        ...Array.from(
            { length: 6 },
            (_unused, index) =>
                `# ${index + 1}. Sección operativa ${index + 1}\n\n${sectionNarrative(index + 1)}`
        ),
        [
            "### Inventario de 25 vehículos",
            "| Unidad | Kilometraje | Tipo | Estado |",
            "| --- | --- | --- | --- |",
            ...Array.from(
                { length: 25 },
                (_unused, index) =>
                    `| VEH-${index + 1} | ${1000 + index} | Servicio | Activo |`
            )
        ].join("\n"),
        [
            "### Catálogo de 15 refacciones",
            "| Código | Refacción | Existencia | Reorden |",
            "| --- | --- | --- | --- |",
            ...Array.from(
                { length: 15 },
                (_unused, index) =>
                    `| REF-${index + 1} | Refacción ${index + 1} | 4 | 2 |`
            )
        ].join("\n"),
        markdownTable("Control preventivo"),
        markdownTable("Control de emergencias")
    ].join("\n\n");
    const segmentTwo = [
        ...Array.from(
            { length: 6 },
            (_unused, index) =>
                `# ${index + 7}. Sección operativa ${index + 7}\n\n${sectionNarrative(index + 7)}`
        ),
        [
            "### Indicadores KPI",
            "| Indicador | Fórmula | Meta | Frecuencia | Responsable |",
            "| --- | --- | --- | --- | --- |",
            ...Array.from(
                { length: 12 },
                (_unused, index) =>
                    `| KPI ${index + 1} | Valor real / objetivo | 95% | Mensual | Coordinador |`
            )
        ].join("\n"),
        [
            "### Plan de implementación",
            "| Día | Actividad | Responsable | Evidencia |",
            "| --- | --- | --- | --- |",
            ...Array.from(
                { length: 30 },
                (_unused, index) =>
                    `| ${index + 1} | Actividad ${index + 1} | Coordinador | Registro ${index + 1} |`
            )
        ].join("\n"),
        markdownTable("Matriz de riesgo"),
        markdownTable("Escalamiento")
    ].join("\n\n");
    const formats = Array.from(
        { length: 7 },
        (_unused, index) => [
            `## Formato ${index + 1}. Registro operativo`,
            "| Fecha | Responsable | Actividad | Evidencia | Firma |",
            "| --- | --- | --- | --- | --- |",
            `| AAAA-MM-DD | Responsable ${index + 1} | Control ${index + 1} | Folio | Firma |`
        ].join("\n")
    ).join("\n\n");
    const questions = Array.from(
        { length: 25 },
        (_unused, index) =>
            `${index + 1}. ¿Cuál es el control operativo ${index + 1}?`
    ).join("\n");
    const answers = Array.from(
        { length: 25 },
        (_unused, index) =>
            `${index + 1}. Respuesta verificada ${index + 1}.`
    ).join("\n");
    const segmentThree = [
        ...Array.from(
            { length: 6 },
            (_unused, index) =>
                `# ${index + 13}. Sección operativa ${index + 13}\n\n${sectionNarrative(index + 13)}`
        ),
        formats,
        "## Examen de 25 preguntas",
        questions,
        "## Clave completa de respuestas",
        answers
    ].join("\n\n");
    const segments = [
        segmentOne,
        segmentTwo,
        segmentThree
    ];
    let thirdSegmentFailures =
        0;

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken: async () =>
                    "test-token"
            }
        };
        globalThis.fetch = async (_url, options) => {
            const request =
                JSON.parse(options.body);
            const prompt =
                request.data.input;
            assert.equal(
                request.data.maxOutputTokens,
                4500
            );
            assert.ok(
                request.data.input.length <
                120000,
                `Segment prompt too large: ${request.data.input.length}`
            );
            if (
                prompt.includes(
                    "Redacta el segmento 3 de 3"
                )
            ) {
                assert.match(
                    prompt,
                    /total global debe ser exactamente 7/
                );
                assert.doesNotMatch(
                    prompt,
                    /Incluye exactamente \d+ tablas Markdown operativas adicionales/
                );
            }
            requestCount += 1;
            if (
                prompt.includes(
                    "Redacta el segmento 3 de 3"
                ) &&
                thirdSegmentFailures <
                    2
            ) {
                thirdSegmentFailures +=
                    1;
                return {
                    ok: true,
                    text: async () =>
                        JSON.stringify({
                            result: {
                                ok:
                                    false,
                                status:
                                    "SEMANTIC_CONVERSATION_UNAVAILABLE",
                                error:
                                    "SEGMENT_TIMEOUT"
                            }
                        })
                };
            }
            if (
                prompt.includes(
                    "REPARACION ESTRUCTURAL ESTRICTA DE DOCUMENTO"
                )
            ) {
                assert.match(
                    prompt,
                    /Formato N/
                );
                assert.match(
                    prompt,
                    /Examen de 25 preguntas/
                );
                assert.match(
                    prompt,
                    /Clave completa de respuestas/
                );
            }
            const message =
                prompt.includes(
                    "Redacta el segmento 1 de 3"
                )
                    ? segments[0]
                    : prompt.includes(
                        "Redacta el segmento 2 de 3"
                    )
                        ? segments[1]
                        : `${segments[2]}\n\n[[JARVIS_DOCUMENT_COMPLETE]]`;
            return {
                ok: true,
                text: async () =>
                    JSON.stringify({
                        result: {
                            ok: true,
                            status: "SEMANTIC_RESPONSE_READY",
                            provider: "test",
                            model: "test-model",
                            message
                        }
                    })
            };
        };

        const originalInstructionForSegments = [
            "Crea un manual de mínimo 4500 palabras con 18 secciones.",
            "Incluye mínimo 12 tablas reales, inventario de 25 vehículos, catálogo de 15 refacciones, 12 KPI, plan de implementación de 30 días, exactamente 7 formatos operativos, examen de 25 preguntas y clave completa de respuestas."
        ].join(" ");
        const oversizedPlanningDetail =
            `${originalInstructionForSegments} ${"Detalle de planeación extenso ".repeat(6000)}`;
        const result = await runtime.execute(
            "document.compose",
            {
                title: "Manual segmentado",
                format: "docx",
                instructions:
                    oversizedPlanningDetail
            },
            {
                rawInput:
                    originalInstructionForSegments
            }
        );

        assert.equal(
            thirdSegmentFailures,
            2
        );
        assert.equal(requestCount, 5);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.segmentedComposition, true);
        assert.equal(result.continuationCount, 1);
        assert.ok(result.wordCount >= 4500);
        assert.ok(result.sectionCount >= 18);
        assert.ok(result.tableBlueprintCount >= 12);
        assert.equal(result.vehicleCount, 25);
        assert.equal(result.partCount, 15);
        assert.equal(result.kpiCount, 12);
        assert.equal(result.implementationDayCoverage, 30);
        assert.equal(result.templateCount, 7);
        assert.equal(result.questionCount, 25);
        assert.equal(result.answerKeyCount, 25);
    } finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
    }
});

test("system health exposes bridge server version separately from tool pack version", async () => {
    const previousBridge = globalThis.JarvisLocalBridge;
    globalThis.JarvisLocalBridge = {
        verifyIdentity: async () => ({
            ok: true,
            status: "BRIDGE_IDENTITY_OK",
            bridgeVersion: "2.33.0-docx-exact-template-gate",
            bridgeRoot: "C:/repo"
        })
    };

    try {
        const runtime = createRuntime();
        registerJarvisMultifunctionTools(runtime);
        const result = await runtime.execute("system.health");

        assert.equal(
            result.bridgeVersion,
            "2.33.0-docx-exact-template-gate"
        );
        assert.equal(
            result.runtime.bridgeVersion,
            "2.33.0-docx-exact-template-gate"
        );
        assert.equal(
            result.toolPackVersion,
            "1.51.0-test-outcome-evidence"
        );
        assert.notEqual(
            result.toolPackVersion,
            result.bridgeVersion
        );
    } finally {
        globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("capability forensics explains partial repo and test actuators when bridge identity fails", async () => {
    const previousBridge = globalThis.JarvisLocalBridge;
    globalThis.JarvisLocalBridge = {
        verifyIdentity: async () => ({
            ok: false,
            status: "BRIDGE_IDENTITY_MISMATCH"
        })
    };

    try {
        const runtime = createRuntime();

        for (const name of [
            "repo.read",
            "repo.grep",
            "repo.diagnose",
            "repo.graph",
            "repo.rankCandidates",
            "repo.prepareWrite",
            "repo.authorizeWrite",
            "repo.write",
            "tests.run",
            "repo.gitStatus"
        ]) {
            runtime.register({
                name,
                execute: async () => ({ ok: true })
            });
        }

        registerJarvisMultifunctionTools(runtime);
        const result = await runtime.execute("system.forensics");
        const repo = result.capabilities.find(item => item.id === "repo_engineering");
        const testsAndGit = result.capabilities.find(item => item.id === "tests_and_git");

        assert.equal(repo.status, "PARTIAL");
        assert.equal(repo.evidence.toolsReady, true);
        assert.equal(repo.evidence.bridgeReady, false);
        assert.match(repo.reason, /bridge local no verifico identidad/i);
        assert.equal(testsAndGit.status, "PARTIAL");
        assert.match(testsAndGit.nextAction, /estado Git/i);
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("capability forensics distinguishes a deployed scheduler from a completed daily run", async () => {
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);

    runtime.register({
        name: "system.supervision",
        mutates: false,
        requiresApproval: false,
        execute: async () => ({
            ok: true,
            source: "JARVIS_DAILY_SUPERVISOR",
            status: "PENDING_FIRST_RUN",
            scheduledAt: "04:15 America/Cancun",
            liveProbe: {
                status: "HEALTHY"
            }
        })
    });

    const pending =
        await runtime.execute("system.forensics");
    const pendingCapability =
        pending.capabilities.find(
            item => item.id === "daily_supervision"
        );

    assert.equal(pendingCapability.status, "PARTIAL");
    assert.equal(pendingCapability.evidence.cloudEndpoint, true);
    assert.equal(pendingCapability.evidence.scheduleDeclared, true);
    assert.equal(pendingCapability.evidence.scheduledRun, false);
    assert.match(pendingCapability.reason, /falta evidencia de la primera ejecucion diaria/i);
    assert.ok(
        pending.priorities.some(priority =>
            priority.includes("04:15 America/Cancun")
        )
    );

    runtime.register({
        name: "system.supervision",
        mutates: false,
        requiresApproval: false,
        execute: async () => ({
            ok: true,
            source: "JARVIS_DAILY_SUPERVISOR",
            status: "HEALTHY",
            reportId: "2026-07-14",
            startedAtIso: "2026-07-14T09:15:00.000Z",
            liveProbe: {
                status: "HEALTHY"
            }
        })
    });

    const completed =
        await runtime.execute("system.forensics");
    const completedCapability =
        completed.capabilities.find(
            item => item.id === "daily_supervision"
        );

    assert.equal(completedCapability.status, "READY");
    assert.equal(completedCapability.evidence.scheduledRun, true);
    assert.equal(completedCapability.evidence.reportId, "2026-07-14");
    assert.ok(
        !completed.gaps.some(gap =>
            gap.id === "daily_supervision"
        )
    );
});

test("Jarvis answers casual conversation through the real semantic model", async () => {
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    let semanticRequest = null;
    globalThis.auth = { currentUser: { getIdToken: async () => "test-token" } };
    globalThis.fetch = async (_url, options) => {
        semanticRequest = JSON.parse(options.body);
        return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
            result: {
                ok: true,
                status: "SEMANTIC_RESPONSE_READY",
                provider: "pollinations",
                model: "semantic-test",
                message: "Buenos días, pariente. ¿Qué armamos hoy?"
            }
        })
        };
    };

    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);

    const result = await runtime.execute(
        "conversation.respond",
        {
            prompt: "buenos dias jarvis, se me antoja una tecate"
        }
    );

    assert.equal(result.ok, true);
    assert.equal(result.provider, "pollinations");
    assert.equal(result.model, "semantic-test");
    assert.equal(
        semanticRequest.data.maxOutputTokens,
        3500
    );
    assert.match(result.message, /Buenos días/);

    const calls = await planWithModel(
        "buenos dias jarvis, se me antoja una tecate",
        [{ name: "conversation.respond", args: { prompt: "buenos dias jarvis" } }]
    );

    assert.equal(calls[0]?.name, "conversation.respond");
    assert.equal(calls[0]?.mutates, false);

    globalThis.auth = previousAuth;
    globalThis.fetch = previousFetch;
});

test("mixed capability conversation preserves greeting, capabilities and limits", async () => {
    const instruction =
        "Buenos días, dame un resumen de lo que ya puedes hacer y lo que aún no.";
    const calls = await planWithModel(
        instruction,
        [
            {
                name: "conversation.respond",
                args: { prompt: instruction }
            },
            {
                name: "system.capabilities",
                args: { instruction }
            },
            {
                name: "system.forensics",
                args: { instruction }
            }
        ]
    );

    assert.deepEqual(
        calls.map(call => call.name),
        [
            "conversation.respond",
            "system.capabilities",
            "system.forensics"
        ]
    );
});

test("Terminal uses one governed conversation route and the current tool pack", () => {
    const terminal = fs.readFileSync(
        path.join(process.cwd(), "gestia-terminal.html"),
        "utf8"
    );
    const toolRuntime = fs.readFileSync(
        path.join(process.cwd(), "gestia-core", "tools.runtime.js"),
        "utf8"
    );
    const conversationConnector =
        terminal.slice(
            terminal.indexOf("window.consultarCerebroIA"),
            terminal.indexOf("window.consultarCerebroIA") + 2600
        );

    assert.match(
        conversationConnector,
        /JarvisToolRuntime\.execute\(\s*"conversation\.respond"/
    );
    assert.doesNotMatch(conversationConnector, /cloudfunctions\.net/);
    assert.doesNotMatch(conversationConnector, /setTimeout\(\(\) => controller\.abort\(\), 8000\)/);
    assert.match(
        terminal,
        /jarvis-tools-v7-20260728-identity-fidelity-v106/
    );
    assert.match(
        toolRuntime,
        /sia7-test-outcome-evidence-v100-20260727/
    );
    assert.doesNotMatch(terminal, /Soy tu motor generador de módulos/);
    assert.doesNotMatch(terminal, /Última idea analizada/);
    assert.match(terminal, /renderTerminalFailureOnce/);
    assert.match(
        terminal,
        /__JARVIS_TERMINAL_OUTCOMES__\.has\(key\)/
    );
});

test("system health reports a real bridge identity mismatch as degraded", async () => {
    const previousBridge =
        globalThis.JarvisLocalBridge;

    globalThis.JarvisLocalBridge = {
        verifyIdentity: async () => ({
            ok: false,
            status: "BRIDGE_IDENTITY_MISMATCH",
            bridgeRoot: "C:/wrong/repo"
        })
    };

    try {
        const runtime = createRuntime();
        registerJarvisMultifunctionTools(runtime);

        const result =
            await runtime.execute(
                "system.health"
            );

        assert.equal(result.ok, false);
        assert.equal(result.status, "DEGRADED");
        assert.ok(
            result.failures.includes(
                "BRIDGE_IDENTITY_MISMATCH"
            )
        );
        assert.equal(
            result.runtime.bridgeRoot,
            "C:/wrong/repo"
        );
    }
    finally {
        globalThis.JarvisLocalBridge =
            previousBridge;
    }
});

test("terminal direct router exposes every registered multifunction namespace", () => {
    const terminal = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-terminal.html"
        ),
        "utf8"
    );

    assert.match(
        terminal,
        /repo\|tests\|codex\|system\|conversation\|business\|marketing\|page\|media\|web/
    );
    assert.match(terminal, /"web\.research":\s*\{/);
    assert.match(
        terminal,
        /formatTerminalToolPayload/
    );
    assert.match(terminal, /Preparacion real:/);
    assert.match(terminal, /Aprobadas:/);
    assert.match(terminal, /Estado Git:/);
});

test("browser runtime fails closed on bridge identity and avoids dead cloud planner", () => {
    const toolsRuntime = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "tools.runtime.js"
        ),
        "utf8"
    );

    const brain = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "brain.engine.js"
        ),
        "utf8"
    );

    assert.match(
        toolsRuntime,
        /BRIDGE_IDENTITY_MISMATCH/
    );
    assert.match(
        toolsRuntime,
        /"X-Jarvis-Release-Id"/
    );
    assert.match(
        toolsRuntime,
        /args\.script \|\|\s*"test"/
    );
    assert.match(
        brain,
        /TOOL_PLANNER_ENABLED:\s*false/
    );
    assert.match(
        toolsRuntime,
        /name:\s*\n\s*"repo\.write"[\s\S]{0,260}requiresApproval:\s*\n\s*true/
    );
    assert.doesNotMatch(
        toolsRuntime,
        /isDryRun !== true &&[\s\S]{0,140}args\?\.approved/
    );
});

test("terminal unlocks, queues and recovers Jarvis speech", () => {
    const terminal = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-terminal.html"
        ),
        "utf8"
    );
    assert.match(terminal, /window\.unlockJarvisVoice/);
    assert.match(terminal, /JARVIS_VOICE_QUEUED/);
    assert.match(terminal, /JARVIS_VOICE_WATCHDOG_RESUME/);
    assert.match(terminal, /__JARVIS_TTS_ACTIVE_UTTERANCE__/);
});

test("semantic model planner replaces phrase gates and preserves terminal speech", () => {
    const core = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "gestia-core.js"
        ),
        "utf8"
    );
    const terminal = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-terminal.html"
        ),
        "utf8"
    );
    const planner = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "jarvis", "jarvis.multifunction.planner.js"),
        "utf8"
    );

    assert.match(core, /await buildJarvisMultifunctionToolCalls/);
    assert.match(core, /SEMANTIC_MISSION_COMPOSITION/);
    assert.match(core, /EVIDENCIA_VERIFICADA/);
    assert.match(core, /missionResult\.reason === "MISSION_INPUT_REQUIRED"/);
    assert.match(core, /Mision Jarvis requiere informacion/);
    assert.match(core, /title: missionResponseTitle/);
    assert.match(core, /lightMultifunctionCalls\.length === 1/);
    assert.match(core, /model_selected_conversation/);
    assert.match(core, /model_selected_multifunction_plan/);
    assert.match(core, /TERMINAL_SEMANTIC_PLAN_SEED/);
    assert.match(core, /terminalPlannerSeed\.length > 0/);
    assert.match(core, /!propuesta &&\s*window\.runCognitiveReasoning/);
    assert.doesNotMatch(core, /hasExplicitOperationalRequest/);
    assert.doesNotMatch(core, /isExplicitCasualSocialRequest/);
    assert.match(planner, /jarvisSemanticPlan/);
    assert.match(planner, /trustedPlanCalls/);
    assert.match(planner, /callBrowserMissionContract/);
    assert.match(planner, /callBrowserSemanticPlan/);
    assert.match(planner, /repo\.architectReview es autocontenida/);
    assert.match(planner, /usesRegisteredToolAsRepositoryFile/);
    assert.match(core, /MISSION_CONTRACT_RECOVERED_FROM_INITIAL_PLAN/);
    assert.match(core, /allowedMissionTools/);
    assert.match(core, /operationalMissionToolNames/);
    assert.match(core, /\.slice\(0, 80\)/);
    assert.doesNotMatch(core, /\.slice\(0, 13\)/);
    assert.doesNotMatch(planner, /\.test\(/);
    assert.doesNotMatch(planner, /new RegExp/);
    assert.doesNotMatch(planner, /ACTION_MAP|ENTITY_MAP|STOPWORDS/);
    assert.match(terminal, /JarvisToolRuntime\.execute\(\s*"conversation\.respond"/);
    assert.match(terminal, /Array\.isArray\(semantic\.toolCalls\)/);
    assert.doesNotMatch(terminal, /canAnswerCasualTerminalLocally/);
    assert.doesNotMatch(terminal, /findLocalTerminalExplanation/);
    assert.doesNotMatch(terminal, /localExplanations/);
    assert.match(terminal, /await window\.consultarCerebroIA\(comando\)/);
    assert.match(terminal, /await window\.hablarJarvis\?\.\(\s*casualResponse/);
    assert.match(terminal, /window\.showJarvis\?\.\(\s*"Sistema listo"/);
});

test("multifunction tools create marketing and page proposals without write authority", async () => {
    const runtime =
        createRuntime();

    registerJarvisMultifunctionTools(runtime);

    const marketing =
        await runtime.execute(
            "marketing.plan",
            {
                prompt: "crea marketing para Instagram con reel y landing",
                brandName: "FixGo",
                audience: "administradores de inmuebles",
                offer: "control operativo y seguimiento técnico",
                pain: "órdenes dispersas sin evidencia centralizada",
                promise: "operación trazable desde una sola plataforma",
                differentiator: "seguimiento de cada orden con evidencia",
                cta: "Solicita una demostración",
                channels: ["instagram"],
                assets: ["reel", "landing_page"],
                services: [{ name: "Gestión de órdenes", source: "repo" }]
            },
            {
                analysisId: "MULTI-MKT-1"
            }
        );

    assert.equal(marketing.ok, true);
    assert.equal(marketing.domain, "marketing");
    assert.equal(marketing.approval.publishAllowed, false);
    assert.equal(marketing.readyForProduction, true);
    assert.ok(marketing.assets.includes("reel"));

    const page =
        await runtime.execute(
            "page.plan",
            {
                prompt: "crea pagina oficial para FixGo",
                pageName: "FixGo Oficial",
                title: "FixGo"
            },
            {
                analysisId: "MULTI-PAGE-1"
            }
        );

    assert.equal(page.ok, true);
    assert.equal(page.page.fileName, "fixgo-oficial.html");
    assert.equal(page.outputContract.writeAllowed, false);
    assert.equal(page.outputContract.deployAllowed, false);
});

test("grounded missions complete semantic arguments for marketing, page, image and reel", async () => {
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);
    const validSources = [
        {
            title: "Summit Law Firm",
            url: "https://www.summ.com.mx/",
            snippet: "Firma fundada en 2002 especializada en derecho tributario, constitucional y administrativo."
        }
    ];
    const semanticArgumentPlanner = async ({ catalog }) => {
        const toolName = catalog[0].name;
        const argsByTool = {
            "marketing.plan": {
                brandName: "Summit Law Firm",
                audience: "Empresas mexicanas con retos fiscales y administrativos",
                offer: "Diagnóstico inicial y cotización",
                pain: "Controversias fiscales y administrativas complejas",
                promise: "Propuesta estratégica para abordar el caso con información verificable",
                differentiator: "Experiencia documentada desde 2002 en las áreas publicadas por la firma",
                cta: "Solicitar una reunión",
                channels: ["linkedin", "facebook", "instagram"],
                assets: ["landing_page", "image_brief", "reel"],
                durationSeconds: 45
            },
            "page.plan": {
                pageName: "summit-diagnostico-legal",
                brandName: "Summit Law Firm",
                title: "Estrategia legal para empresas",
                description: "Propuesta de diagnóstico inicial basada en las áreas publicadas por Summit.",
                sections: ["hero", "areas_de_practica", "proceso", "cta", "fuentes"]
            },
            "image.plan": {
                brandName: "Summit Law Firm",
                campaignGoal: "Presentar un diagnóstico legal inicial",
                audience: "Empresas mexicanas",
                concepts: [{
                    name: "Estrategia jurídica empresarial",
                    purpose: "Presentar la propuesta",
                    composition: "Escena corporativa sobria sin logotipos ni personas identificables",
                    grounding: "https://www.summ.com.mx/",
                    generationPrompt: "Imagen corporativa sobria sobre estrategia legal empresarial en Cancún, sin texto ni logotipos",
                    exclusionPrompt: "Logotipos inventados, texto ilegible, resultados garantizados",
                    aspectRatios: ["16:9", "4:5", "9:16"]
                }]
            },
            "reel.plan": {
                brandName: "Summit Law Firm",
                title: "Estrategia antes del conflicto",
                cta: "Solicita una reunión",
                durationSeconds: 45,
                scenes: [
                    {
                        durationSeconds: 6,
                        visual: "Apertura corporativa sobria",
                        overlay: "Los retos legales exigen estrategia",
                        voiceover: "Los retos fiscales y administrativos requieren un análisis serio.",
                        evidence: "https://www.summ.com.mx/",
                        transition: "corte"
                    },
                    {
                        durationSeconds: 12,
                        visual: "Áreas de práctica en tarjetas",
                        overlay: "Derecho tributario, constitucional y administrativo",
                        voiceover: "Summit publica experiencia en derecho tributario, constitucional y administrativo.",
                        evidence: "https://www.summ.com.mx/",
                        transition: "deslizamiento"
                    },
                    {
                        durationSeconds: 15,
                        visual: "Mesa de diagnóstico empresarial",
                        overlay: "Diagnóstico inicial",
                        voiceover: "La campaña propone comenzar con un diagnóstico y una cotización.",
                        evidence: "Orden original del usuario",
                        transition: "fundido"
                    },
                    {
                        durationSeconds: 12,
                        visual: "Cierre con llamada a la acción",
                        overlay: "Solicita una reunión",
                        voiceover: "Solicita una reunión para revisar el contexto de tu empresa.",
                        evidence: "Orden original del usuario",
                        transition: "cierre"
                    }
                ]
            }
        };
        return {
            ok: true,
            status: "SEMANTIC_PLAN_READY",
            provider: "test-grounded-planner",
            model: "semantic-test",
            toolCalls: [{
                name: toolName,
                args: argsByTool[toolName],
                reason: "GROUNDED_ARGUMENT_TEST"
            }]
        };
    };
    const context = {
        rawInput: "Investiga SUMM y entrega campaña, landing, imagen y reel de 45 segundos en read-only.",
        validSources,
        semanticArgumentPlanner,
        analysisId: "MULTI-GROUNDED-1"
    };

    const marketing = await runtime.execute("marketing.plan", {}, context);
    const page = await runtime.execute("page.plan", {}, context);
    const image = await runtime.execute("image.plan", {}, context);
    const reel = await runtime.execute("reel.plan", {}, context);

    assert.equal(marketing.status, "MARKETING_PACKAGE_READY");
    assert.equal(marketing.objectiveSatisfied, true);
    assert.equal(marketing.grounding.status, "GROUNDED");
    assert.equal(page.page.title, "Estrategia legal para empresas");
    assert.equal(page.semanticEnrichment.used, true);
    assert.equal(image.status, "IMAGE_REQUIREMENTS_PLAN_READY");
    assert.equal(image.semanticEnrichment.used, true);
    assert.equal(reel.status, "REEL_PLAN_READY");
    assert.equal(reel.timelineSeconds, 45);
    assert.equal(reel.semanticEnrichment.used, true);
});

test("multifunction media analysis preserves source trace and stays advisory", async () => {
    const runtime =
        createRuntime();

    registerJarvisMultifunctionTools(runtime);

    const analysis =
        await runtime.execute(
            "media.analyze",
            {
                prompt: "analiza este reporte",
                mimeType: "application/pdf",
                sourceName: "reporte.pdf",
                pages: [
                    {
                        pageNumber: 1,
                        text: "Incidencia resuelta con evidencia."
                    }
                ],
                questions: [
                    "Que se resolvio?"
                ]
            },
            {
                analysisId: "MULTI-MEDIA-1"
            }
        );

    assert.equal(analysis.ok, true);
    assert.equal(analysis.source.sourceName, "reporte.pdf");
    assert.equal(analysis.policy.advisoryOnly, true);
    assert.equal(analysis.policy.mayAuthorizeWrite, false);
});

test("multifunction media analysis consumes a complete 30-file persisted manifest", async () => {
    const previousAuth = globalThis.auth;
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);
    const attachments = Array.from({ length: 30 }, (_, index) => ({
        name: `evidencia-${index + 1}.png`,
        mimeType: "image/png",
        bytes: 1024,
        artifact: `.jarvis-artifacts/uploads/evidencia-${index + 1}.png`,
        sha256: String(index + 1).padStart(64, "0")
    }));
    try {
        globalThis.auth = { currentUser: { getIdToken: async () => "token" } };
        globalThis.JarvisLocalBridge = {
            requestJson: async () => ({
                ok: true,
                dataBase64: "iVBORw0KGgo=",
                mimeType: "image/png",
                bytes: 8,
                fileName: "evidencia.png"
            })
        };
        globalThis.fetch = async (_url, options) => {
            const request = JSON.parse(options.body);
            const files = request.data.files;
            return {
                ok: true,
                json: async () => ({
                    result: {
                        ok: true,
                        status: "MEDIA_ANALYSIS_GROUNDED",
                        sources: files.map(file => ({ name: file.name, evidence: [{ observation: "byte real" }]})),
                        policy: { readOnly: true, illegibleContentMustRemainUnknown: true }
                    }
                })
            };
        };
        const analysis = await runtime.execute("media.analyze", {
            prompt: "clasifica las 30 evidencias",
            attachments
        }, { analysisId: "MULTI-MEDIA-30" });

        assert.equal(analysis.ok, true);
        assert.equal(analysis.receivedFiles, 30);
        assert.equal(analysis.boundedFiles, 8);
        assert.equal(analysis.analyzedFiles, 8);
        assert.equal(analysis.pendingFiles, 22);
        assert.deepEqual(
            analysis.pendingAttachments.map(item => item.name),
            attachments.slice(8).map(item => item.name)
        );
        assert.equal(analysis.persistedArtifacts.length, 30);
        assert.equal(analysis.status, "MEDIA_ANALYSIS_GROUNDED");
    } finally {
        globalThis.auth = previousAuth;
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
    }
});

test("multifunction media analysis prefers the complete authoritative prompt manifest", async () => {
    const previousAuth = globalThis.auth;
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);
    const attachments = [
        {
            name: "uno.png",
            mimeType: "image/png",
            bytes: 8,
            artifact: ".jarvis-artifacts/uploads/uno.png",
            sha256: "1".repeat(64)
        },
        {
            name: "dos.png",
            mimeType: "image/png",
            bytes: 8,
            artifact: ".jarvis-artifacts/uploads/dos.png",
            sha256: "2".repeat(64)
        }
    ];
    const rawInput = [
        "Analiza ambas imagenes por separado.",
        "Archivos adjuntos reales entregados por el usuario:",
        JSON.stringify(attachments)
    ].join("\n");

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken: async () => "token"
            }
        };
        globalThis.JarvisLocalBridge = {
            requestJson: async (_path, request) => ({
                ok: true,
                dataBase64: "iVBORw0KGgo=",
                mimeType: "image/png",
                bytes: 8,
                fileName: request.output.endsWith("uno.png")
                    ? "uno.png"
                    : "dos.png"
            })
        };
        globalThis.fetch = async (_url, options) => {
            const request = JSON.parse(options.body);
            return {
                ok: true,
                json: async () => ({
                    result: {
                        ok: true,
                        status: "MEDIA_ANALYSIS_GROUNDED",
                        sources: request.data.files.map(file => ({
                            name: file.name,
                            evidence: [{
                                observation: `evidencia ${file.name}`
                            }]
                        })),
                        policy: {
                            readOnly: true,
                            illegibleContentMustRemainUnknown: true
                        }
                    }
                })
            };
        };

        const analysis = await runtime.execute(
            "media.analyze",
            {
                prompt: "argumento parcial del planner",
                attachments: [attachments[0]]
            },
            {
                analysisId: "MULTI-MEDIA-AUTHORITATIVE",
                rawInput
            }
        );

        assert.equal(analysis.ok, true);
        assert.equal(analysis.receivedFiles, 2);
        assert.equal(analysis.boundedFiles, 2);
        assert.equal(analysis.analyzedFiles, 2);
        assert.equal(analysis.pendingFiles, 0);
        assert.deepEqual(
            analysis.sources.map(source => source.name),
            ["uno.png", "dos.png"]
        );
    } finally {
        globalThis.auth = previousAuth;
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
    }
});

test("multifunction media analysis rejects partial artifact sets without synthetic success", async () => {
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);
    const attachments = [
        {
            name: "uno.png",
            mimeType: "image/png",
            artifact: ".jarvis-artifacts/uploads/uno.png"
        },
        {
            name: "dos.png",
            mimeType: "image/png",
            artifact: null
        }
    ];
    const analysis = await runtime.execute(
        "media.analyze",
        { attachments },
        { analysisId: "MULTI-MEDIA-PARTIAL" }
    );

    assert.equal(analysis.ok, false);
    assert.equal(analysis.status, "MEDIA_ANALYSIS_ARTIFACT_SET_INCOMPLETE");
    assert.equal(analysis.receivedFiles, 2);
    assert.equal(analysis.persistedArtifacts.length, 1);
});

test("multifunction planner accepts model-selected bounded read-only tools", async () => {
    const calls =
        await planWithModel(
            "Jarvis, crea una landing y marketing con reels para Instagram",
            [
                { name: "page.plan", args: { brandName: "FixGo" } },
                { name: "marketing.plan", args: { brandName: "FixGo" } }
            ]
        );

    assert.deepEqual(
        calls.map(call => call.name),
        [
            "page.plan",
            "marketing.plan"
        ]
    );

    assert.equal(
        calls.every(call => call.mutates === false),
        true
    );

    assert.equal(
        calls.every(call => call.approved === false),
        true
    );
});

test("multifunction planner preserves every mixed command selected by the model", async () => {
    const calls =
        await planWithModel(
            "Jarvis, analisa este PDF y crea una landing responsive",
            [
                { name: "page.plan", args: {} },
                { name: "media.analyze", args: {} }
            ]
        );

    assert.deepEqual(
        calls.map(call => call.name),
        [
            "page.plan",
            "media.analyze"
        ]
    );

    assert.equal(
        calls.every(call => call.mutates === false),
        true
    );

    assert.deepEqual(
        (await planWithModel(
            "Jarvis, reviza el sistema y dime si esta sano",
            [{ name: "system.health", args: {} }]
        )).map(call => call.name),
        [
            "system.health"
        ]
    );
});

test("multifunction planner preserves repeated tools for independent targets", async () => {
    const calls =
        await planWithModel(
            "Revisa tecnico b2b y tambien la ruta de admin.",
            [
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
        );

    assert.deepEqual(
        calls.map(call => call.args.query),
        [
            "tecnico b2b",
            "admin route"
        ]
    );
});

test("terminal preserves operational tools when a mixed command also contains a greeting", () => {
    const terminal = fs.readFileSync(
        path.join(__dirname, "..", "gestia-terminal.html"),
        "utf8"
    );

    assert.match(terminal, /const hasOperationalObservation\s*=/);
    assert.match(
        terminal,
        /conversationObservation\s*&&\s*!hasOperationalObservation/
    );
    assert.match(terminal, /Evidencia ejecutada:/);
    assert.match(
        terminal,
        /finalResponse\?\.text\s*\?\s*\[\]\s*:\s*\[/
    );
    assert.match(terminal, /new Set\(/);
    assert.doesNotMatch(terminal, /\.slice\(0, 8000\)/);
});

test("technical final response correlates initial and follow-up observations", () => {
    const core = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "gestia-core.js"),
        "utf8"
    );

    assert.match(
        core,
        /followUpObservations:\s*\[\s*\.\.\.toolObservations,\s*\.\.\.followUpObservations\s*\]/
    );
    assert.match(core, /new Map\([\s\S]{0,700}learningHints\?\.lessons/);
});

test("runtime role authority never invents a temporary client role", () => {
    const runtime = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "gestia.runtime.v7.js"),
        "utf8"
    );

    assert.deepEqual(
        resolveGestiaRole(
            {
                email: "HEBERTOH-M@HOTMAIL.COM"
            },
            {}
        ),
        {
            role: "admin",
            roleReal: "admin",
            source: "master_identity",
            resolved: true
        }
    );
    assert.equal(
        resolveGestiaRole(
            {
                email: "sin-perfil@example.com"
            },
            {}
        ).role,
        null
    );
    assert.equal(
        resolveGestiaRole({}, { rol: "tecnico_gp" }).role,
        "tecnico"
    );
    assert.equal(
        resolveGestiaRole({}, { rol: "asistente_admin" }).role,
        "b2b_admin"
    );
    assert.match(runtime, /\[AUTH_ROLE_UNRESOLVED\]/);
    assert.match(runtime, /\[SURFACE_GUARD_ROLE_PENDING\]/);
    assert.match(runtime, /resolveGestiaRouteDecision/);
    assert.match(runtime, /resolveCanonicalRouteDecision/);
    assert.match(runtime, /routeDecision\.reason/);
    assert.doesNotMatch(runtime, /GestiaRuntime\.routes\s*=/);
    assert.doesNotMatch(runtime, /resolveHomeRoute/);
    assert.doesNotMatch(runtime, /validateSurfaceAccess/);
    assert.doesNotMatch(
        runtime,
        /let role\s*=\s*"cliente";[\s\S]{0,80}let roleReal\s*=\s*"cliente";/
    );
});

test("private surfaces stay covered until authentication and role settle", () => {
    const appMain = fs.readFileSync(
        path.join(__dirname, "..", "app-main.js"),
        "utf8"
    );

    assert.match(appMain, /function isCurrentSurfacePublic\(\)/);
    assert.match(appMain, /classList\s*\.add\("gestia-auth-pending"\)/);
    assert.match(appMain, /classList\s*\.remove\("gestia-auth-pending"\)/);
    assert.match(
        appMain,
        /if \(isCurrentSurfacePublic\(\)\) \{[\s\S]{0,160}revealUI\(\);[\s\S]{0,120}else \{[\s\S]{0,120}VALIDANDO PERFIL/
    );

    for (const file of ["admin.html", "cliente.html", "tecnico.html", "ceo.html"]) {
        const surface = fs.readFileSync(
            path.join(__dirname, "..", file),
            "utf8"
        );

        assert.match(surface, /<html[^>]+class="gestia-auth-pending"/);
        assert.match(
            surface,
            /html\.gestia-auth-pending body > :not\(#fortressLoader\)/
        );
    }
});

test("role authority produces deterministic route decisions for every main role", () => {
    assert.deepEqual(
        resolveGestiaRouteDecision({
            user: {
                email: "hebertoh-m@hotmail.com"
            },
            pathname: "/cliente.html"
        }).target,
        "admin.html"
    );

    assert.equal(
        resolveGestiaRouteDecision({
            metadata: {
                rol: "admin"
            },
            pathname: "/ceo.html"
        }).redirect,
        false
    );

    assert.equal(
        resolveGestiaRouteDecision({
            metadata: {
                rol: "tecnico_gp",
                sub_type: "saas"
            },
            pathname: "/cliente.html"
        }).target,
        "tecnico-b2b.html"
    );

    assert.equal(
        resolveGestiaRouteDecision({
            metadata: {
                rol: "admin_b2b"
            },
            pathname: "/login.html"
        }).target,
        "panel-b2b-admin.html"
    );

    assert.equal(
        resolveGestiaRouteDecision({
            metadata: {},
            pathname: "/login.html"
        }).reason,
        "role_unresolved"
    );

    assert.equal(
        resolveGestiaRouteDecision({
            metadata: {
                rol: "cliente"
            },
            pathname: "/admin.html"
        }).target,
        "cliente.html"
    );

    const adminLoginDecision =
        resolveGestiaRouteDecision({
            user: {
                email: "hebertoh-m@hotmail.com"
            },
            pathname: "/login.html"
        });

    const adminLandingDecision =
        resolveGestiaRouteDecision({
            user: {
                email: "hebertoh-m@hotmail.com"
            },
            pathname: `/${adminLoginDecision.target}`
        });

    assert.equal(adminLoginDecision.target, "admin.html");
    assert.equal(adminLandingDecision.redirect, false);
    assert.notEqual(adminLoginDecision.target, "cliente.html");

    for (const pathname of ["/gestia-terminal.html", "/ceo.html"]) {
        assert.equal(
            resolveGestiaRouteDecision({
                user: {
                    email: "hebertoh-m@hotmail.com"
                },
                pathname
            }).redirect,
            false,
            pathname
        );
    }

    const firebase = fs.readFileSync(
        path.join(__dirname, "..", "firebase.js"),
        "utf8"
    );

    assert.match(firebase, /resolveGestiaRouteDecision/);
    assert.match(firebase, /\[ROLE_AUTHORITY_REDIRECT\]/);
    assert.match(firebase, /window\.location\.replace/);

    const observerSection = firebase.slice(
        firebase.indexOf("export function observarAuth"),
        firebase.indexOf("export async function validarClaveB2B")
    );

    assert.doesNotMatch(observerSection, /verificarYRedireccionar\(/);

    const appMain = fs.readFileSync(
        path.join(__dirname, "..", "app-main.js"),
        "utf8"
    );
    const ceo = fs.readFileSync(
        path.join(__dirname, "..", "ceo.html"),
        "utf8"
    );
    const index = fs.readFileSync(
        path.join(__dirname, "..", "index.html"),
        "utf8"
    );

    assert.match(appMain, /resolveGestiaRouteDecision/);
    assert.match(appMain, /APP_MAIN_ROLE_AUTHORITY_REDIRECT/);
    assert.doesNotMatch(
        appMain,
        /return go\(RUTAS\.(?:admin|tecnico|cliente|residencial)\)/
    );
    assert.doesNotMatch(appMain, /const adminSurfaces\s*=/);
    assert.doesNotMatch(firebase, /verificarYRedireccionarLegacy/);
    assert.doesNotMatch(firebase, /shouldSkipLegacyRouting/);
    assert.doesNotMatch(firebase, /__SIA7_ROUTER_LOCK__/);
    assert.match(ceo, /class="gestia-auth-pending"/);
    assert.match(ceo, /verificarYRedireccionar\(userAuth\)/);
    assert.match(index, /verificarYRedireccionar\(userData\)/);
    assert.match(index, /INDEX_ROLE_AUTHORITY_DECISION/);
    assert.doesNotMatch(
        index,
        /if \(rol === ['"](?:tecnico|admin|cliente)['"]\)/
    );
    assert.doesNotMatch(index, /const rolElegido\s*=/);
});

test("Terminal uses one premium response renderer and preserves semantic titles", () => {
    const terminal = fs.readFileSync(
        path.join(__dirname, "..", "gestia-terminal.html"),
        "utf8"
    );

    assert.equal(
        (terminal.match(/window\.renderJarvisResponse\s*=(?!=)/g) || []).length,
        1
    );
    assert.match(terminal, /const multiToolTitle\s*=/);
    assert.match(terminal, /finalResponse\?\.title/);
    assert.match(terminal, /const safeTitle\s*=\s*escapeHTML/);
    assert.match(terminal, /\$\{safeTitle\}<\/h3>/);
    assert.match(terminal, /item\?\.reason/);
    assert.match(terminal, /name === "web\.research"/);
    assert.match(terminal, /Fuentes verificables:/);
    assert.match(terminal, /source\?\.url/);
    assert.doesNotMatch(terminal, /window\.renderJarvisResponse = function/);
});

test("repo diagnosis separates structural file type from secondary capabilities", () => {
    const toolsRuntime = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "tools.runtime.js"),
        "utf8"
    );

    assert.match(
        toolsRuntime,
        /if \(typeSignals\.html\) \{[\s\S]{0,100}"html_application"/
    );
    assert.match(toolsRuntime, /"geolocation"/);
    assert.match(toolsRuntime, /GEOLOCATION_CAPABILITY_DETECTED/);
    assert.match(toolsRuntime, /AUTH_SESSION_OBSERVER/);
    assert.match(toolsRuntime, /ROLE_AUTHORITY_ROUTER/);
    assert.match(toolsRuntime, /AUTH_PENDING_GUARD/);
    assert.match(toolsRuntime, /LEGACY_PROFILE_FALLBACK/);
    assert.match(toolsRuntime, /"auth_observer"/);
    assert.match(toolsRuntime, /"role_routing"/);
    assert.match(toolsRuntime, /"auth_pending_guard"/);
    assert.match(toolsRuntime, /Tipo principal:/);
    assert.match(toolsRuntime, /Capacidades:/);
    assert.match(toolsRuntime, /const hasExactPatchObject\s*=/);
    assert.match(toolsRuntime, /hasPatchPreview[\s\S]{0,180}hasExactPatchObject/);
    assert.doesNotMatch(
        toolsRuntime,
        /patchPreview\|search\\s\*:\|replace\\s\*:/
    );
    assert.doesNotMatch(toolsRuntime, /Tipo detectado: \$\{fileType\}/);

    const core = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "gestia-core.js"),
        "utf8"
    );

    assert.match(core, /const structuredDiagnosisCause\s*=/);
    assert.match(core, /topDiagnosis\.findings\?\.length/);
    assert.doesNotMatch(
        core,
        /String\(topDiagnosis\.summary\)[\s\S]{0,100}\.slice\(0, 10\)/
    );
});

test("multifunction planner exposes the daily supervision report", async () => {
    assert.deepEqual(
        (await planWithModel(
            "Jarvis, dame el estado del supervisor diario",
            [{ name: "system.supervision", args: {} }]
        )).map(call => call.name),
        ["system.supervision"]
    );

    const toolPack = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "jarvis", "jarvis.multitool.pack.js"),
        "utf8"
    );

    assert.match(toolPack, /id:\s*"canonical_role_router"[\s\S]{0,220}"resolveGestiaRouteDecision"/);
    assert.match(toolPack, /id:\s*"canonical_role_router"[\s\S]{0,260}"\[ROLE_AUTHORITY_REDIRECT\]"/);
    assert.match(toolPack, /id:\s*"grounded_web_research"[\s\S]{0,240}"web\.research"/);
    assert.match(toolPack, /id:\s*"grounded_web_research"[\s\S]{0,280}"jarvisWebResearch"/);
    assert.doesNotMatch(
        toolPack,
        /id:\s*"canonical_role_router"[\s\S]{0,180}markers:\s*\["gestia-terminal",\s*"b2b_admin"\]/
    );
});

test("multifunction planner accepts approval only from trusted runtime context", async () => {
    const selected = [{ name: "system.supervision.runNow", args: {} }];
    const pending = await planWithModel(
        "arre ejecuta la supervision diaria ahora",
        selected
    );
    const approved = await planWithModel(
        "ejecuta la supervision diaria ahora",
        selected,
        { approved: true }
    );

    assert.ok(pending.some(call =>
        call.name === "system.supervision.runNow" &&
        call.approved === false
    ));
    assert.ok(approved.some(call =>
        call.name === "system.supervision.runNow" &&
        call.approved === true
    ));
});

test("multifunction planner routes model-selected web research without confusing it with forensics", async () => {
    const prompts = [
        "Jarvis, busca en internet las ultimas novedades de Firebase Functions",
        "Investiga en la web el estado actual de Gemini API y dame fuentes",
        "Dame las ultimas noticias de inteligencia artificial"
    ];

    for (const prompt of prompts) {
        const calls =
            await planWithModel(
                prompt,
                [{ name: "web.research", args: { query: prompt } }]
            );

        assert.deepEqual(
            calls.map(call => call.name),
            ["web.research"],
            prompt
        );
        assert.equal(
            calls[0].args.query,
            prompt
        );
        assert.equal(
            calls[0].mutates,
            false
        );
        assert.equal(
            isJarvisTechnicalDiagnosticRequest(calls),
            false,
            prompt
        );
    }

    assert.deepEqual(
        (await planWithModel(
            "Jarvis, puedes buscar en internet y citar fuentes?",
            [{ name: "system.forensics", args: {} }]
        )).map(call => call.name),
        ["system.forensics"]
    );

    assert.deepEqual(
        (await planWithModel(
            "Jarvis, investiga en la web con fuentes oficiales por que Firebase Hosting puede mostrar contenido antiguo despues de desplegar",
            [{ name: "web.research", args: { query: "Firebase Hosting" } }]
        )).map(call => call.name),
        ["web.research"]
    );
});

test("web research receives the semantic query without phrase stripping", () => {
    const source = fs.readFileSync(
        path.resolve(__dirname, "../gestia-core/jarvis/jarvis.multitool.pack.js"),
        "utf8"
    );

    assert.doesNotMatch(source, /\(jarvis\|heberto\|gestia\)/);
    assert.doesNotMatch(source, /investiga\|investigar\|busca\|buscar/);
    assert.match(source, /objectiveId: args\.objectiveId \|\| context\.objectiveId/);
    assert.match(source, /facts: Array\.isArray\(result\.facts\)/);
});

test("multifunction planner routes capability boundary questions to forensics", async () => {
    const prompts = [
        "Jarvis, corre un analisis forense de tus capacidades reales",
        "Jarvis, corre un analisis forense de tus capacidades reales modo Codex V7: dime que herramientas tienes, cuales faltan, donde falla, y no modifiques nada",
        "Jarvis, que te falta para estar a nivel Codex",
        "Puedes controlar Chrome, buscar internet, generar imagenes y delegar subagentes?"
    ];

    for (const prompt of prompts) {
        const calls = await planWithModel(
            prompt,
            [{ name: "system.forensics", args: {} }]
        );
        assert.equal(
            isJarvisCapabilityForensicsRequest(calls),
            true,
            `forensics gate: ${prompt}`
        );
        assert.deepEqual(
            calls.map(call => call.name),
            ["system.forensics"],
            prompt
        );
    }
});

test("multifunction planner routes real browser, image, document and connector actuators", async () => {
    const browser = await planWithModel(
        "revisa https://example.com en el navegador",
        [{ name: "browser.inspect", args: { url: "https://example.com" } }]
    );
    const image = await planWithModel(
        "genera una imagen futurista de FixGo",
        [{ name: "image.generate", args: { prompt: "FixGo" } }]
    );
    const document = await planWithModel(
        "crea un documento markdown con el reporte",
        [{ name: "document.create", args: { format: "md" } }],
        { approved: true }
    );
    const connectors = await planWithModel(
        "muestra el estado de conectores",
        [{ name: "connector.list", args: {} }]
    );
    const presentation = await planWithModel(
        "crea una presentacion pptx del estado de Jarvis",
        [{ name: "document.create", args: { format: "pptx" } }],
        { approved: true }
    );

    assert.ok(browser.some(call => call.name === "browser.inspect"));
    assert.ok(image.some(call => call.name === "image.generate"));
    assert.ok(!image.some(call => call.name === "system.forensics"));
    assert.ok(document.some(call =>
        call.name === "document.create" &&
        call.mutates === true &&
        call.approved === true
    ));
    assert.ok(connectors.some(call => call.name === "connector.list"));
    assert.ok(presentation.some(call =>
        call.name === "document.create" &&
        call.args.format === "pptx" &&
        call.approved === true
    ));
});

test("document contents do not trigger unrelated capability tools", async () => {
    assert.deepEqual(
        (await planWithModel(
            "Jarvis, crea una presentacion pptx titulada Informe V7 con secciones capacidades, pruebas y pendientes",
            [{ name: "document.create", args: { format: "pptx" } }]
        )).map(call => call.name),
        ["document.create"]
    );
});

test("multifunction planner delegates several read-only tasks in parallel", async () => {
    const calls = await planWithModel(
        "Jarvis, delega en paralelo la salud del sistema, conectores y estado git del repo",
        [{
            name: "agent.delegate",
            args: {
                delegationDirective:
                    "delega en paralelo",
                tasks: [
                    { tool: "system.health", args: {} },
                    { tool: "connector.list", args: {} },
                    { tool: "repo.gitStatus", args: {} }
                ]
            }
        }]
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "agent.delegate");
    assert.deepEqual(
        calls[0].args.tasks.map(task => task.tool),
        ["system.health", "connector.list", "repo.gitStatus"]
    );
    assert.equal(calls[0].mutates, false);
});

test("tool bridge composes human actuator answers without dumping browser DOM or image bytes", () => {
    const bridge = fs.readFileSync(
        path.resolve(__dirname, "../gestia-core/tools.bridge.js"),
        "utf8"
    );
    const terminal = fs.readFileSync(
        path.resolve(__dirname, "../gestia-terminal.html"),
        "utf8"
    );

    assert.match(bridge, /function composeActuatorResponse/);
    assert.match(bridge, /function composeActuatorFailure/);
    assert.match(bridge, /toolName === "browser\.inspect"/);
    assert.match(bridge, /Titulo detectado/);
    assert.match(bridge, /imageBase64:\s*undefined/);
    assert.match(bridge, /No hay conectores externos configurados/);
    assert.match(bridge, /No se genero ni se fingio una imagen/);
    assert.match(bridge, /API key not valid\|API_KEY_INVALID/);
    assert.match(bridge, /Google rechazo la credencial/);
    assert.match(bridge, /validationFailures,/);
    assert.match(bridge, /validationActual/);
    assert.match(bridge, /segmentedComposition:/);
    assert.match(bridge, /function delegatedResultLine/);
    assert.match(bridge, /Resultados verificados:/);
    assert.match(bridge, /toolName ===\s*"repo\.architectReview"/);
    assert.match(bridge, /Revisión Chief Architect/);
    assert.match(bridge, /Controles ejecutados/);
    assert.match(bridge, /Bloqueos: ninguno/);
    assert.match(bridge, /No se modificó ni publicó ningún archivo/);
    const toolPack = fs.readFileSync(
        path.resolve(__dirname, "../gestia-core/jarvis/jarvis.multitool.pack.js"),
        "utf8"
    );
    assert.match(toolPack, /Google rechazo la credencial GEMINI_KEY/);
    assert.match(toolPack, /delegacion paralela esta disponible/);
    assert.match(terminal, /jarvis-tools-v7-20260728-identity-fidelity-v106/);
    assert.match(terminal, /jarvis-tools-bridge-v7-20260726-chief-review-response-v93/);
    const core = fs.readFileSync(
        path.resolve(__dirname, "../gestia-core/gestia-core.js"),
        "utf8"
    );
    assert.match(core, /directActuatorResponses/);
    assert.match(core, /observation\?\.type === "JARVIS_CONVERSATIONAL_RESPONSE"/);
    assert.match(core, /DIRECT_ACTUATOR_COMPOSITION/);
    assert.match(core, /directActuatorFinalResponse/);
    assert.match(terminal, /const multiToolSummarySource\s*=/);
    assert.match(
        terminal,
        /finalResponse\?\.text\s*\?\s*50000\s*:\s*12000/
    );
    assert.match(terminal, /sia7-identity-fidelity-v106-20260728/);
    assert.match(core, /unresolvedUserArtifactTasks/);
    assert.match(core, /missionResult\.blockedTasks\.map/);
    assert.match(terminal, /jarvis-tools-v7-20260728-identity-fidelity-v106/);
});

test("multifunction planner keeps explanatory questions conversational", async () => {
    assert.deepEqual(
        (await planWithModel(
            "Que es marketing digital y para que sirve?",
            [{ name: "conversation.respond", args: { prompt: "marketing digital" } }]
        )).map(call => call.name),
        ["conversation.respond"]
    );

    assert.deepEqual(
        (await planWithModel(
            "Explicame que es una flotilla",
            [{ name: "conversation.respond", args: { prompt: "flotilla" } }]
        )).map(call => call.name),
        ["conversation.respond"]
    );

    assert.deepEqual(
        (await planWithModel(
            "Explicame marketing y crea una campana para Instagram",
            [{ name: "marketing.plan", args: {} }]
        )).map(call => call.name),
        [
            "marketing.plan"
        ]
    );

    assert.deepEqual(
        (await planWithModel(
            "Explicame marketing y haz una campana para TikTok",
            [{ name: "marketing.plan", args: {} }]
        )).map(call => call.name),
        [
            "marketing.plan"
        ]
    );
});

test("model-selected technical diagnostics outrank business tools", async () => {
    const prompts = [
        "Jarvis, reviza tecnico b2b y cliente html y dime como esta la configuracion y que puede fallar",
        "Jarvis, investiga por que al iniciar sesion en admin primero me manda a cliente y despues de segundos me manda a admin",
        "Jarvis, investiga por que cuando estoy en terminal regreso a CEO pero despues de unos segundos se sale a admin",
        "Jarvis, revisa app-login.js y busca por que redirige al panel equivocado"
    ];

    for (const prompt of prompts) {
        const calls = await planWithModel(
            prompt,
            [{ name: "repo.search", args: { query: prompt } }]
        );
        assert.equal(
            isJarvisTechnicalDiagnosticRequest(calls),
            true,
            prompt
        );
        assert.ok(!calls.some(call => call.name === "business.assist"));
    }

    assert.deepEqual(
        (await planWithModel(
            "Jarvis, dame un resumen del cliente",
            [{ name: "business.assist", args: {} }]
        )).map(call => call.name),
        ["business.assist"]
    );
});

test("mixed investigations retain technical and multifunction tools", async () => {
    const supplemental =
        await planWithModel(
            "Jarvis, revisa tecnico b2b y dime el estado del supervisor diario",
            [
                { name: "repo.search", args: { query: "tecnico b2b" } },
                { name: "system.supervision", args: {} }
            ]
        );

    assert.deepEqual(
        supplemental.map(call => call.name),
        ["repo.search", "system.supervision"]
    );

    const merged =
        mergeJarvisToolCalls(
            [
                {
                    name: "repo.search",
                    args: { query: "tecnico b2b" }
                },
                {
                    name: "repo.read",
                    args: { file: "tecnico-b2b.html" }
                },
                {
                    name: "repo.diagnose",
                    args: { file: "tecnico-b2b.html" }
                }
            ],
            supplemental
        );

    assert.deepEqual(
        merged.map(call => call.name),
        [
            "repo.search",
            "repo.read",
            "repo.diagnose",
            "system.supervision"
        ]
    );
});

test("brain awaits the model semantic planner and keeps bounded governance", () => {
    const brain =
        fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "gestia-core",
                "brain.engine.js"
            ),
            "utf8"
        );

    assert.match(brain, /buildJarvisMultifunctionToolCalls/);
    assert.match(brain, /plannerSeedToolCalls\s*=\s*await buildJarvisMultifunctionToolCalls/);
    assert.match(brain, /mergeJarvisToolCalls/);
    assert.match(brain, /const toolCalls = plannerSeedToolCalls/);
    assert.match(brain, /cloudReasoning:\s*null/);
    assert.match(brain, /const semanticToolPlan\s*=\s*\{/);
    assert.match(brain, /patchPreviewAllowed:\s*false/);
    assert.match(brain, /renderPatchPreview:\s*false/);
    assert.match(brain, /cloudToolPlan:\s*semanticToolPlan/);
    assert.doesNotMatch(brain, /^\s*cloudReasoning,\s*$/m);
    assert.doesNotMatch(brain, /^\s*cloudToolPlan,\s*$/m);
    assert.doesNotMatch(brain, /buildLocalTechnicalInvestigationPlan/);
    assert.doesNotMatch(brain, /REPO_HUB_GLOBAL_FORENSIC_EVIDENCE/);
    assert.doesNotMatch(brain, /forensicCandidateFiles\.map/);
    assert.doesNotMatch(brain, /requestedEvidenceCount \+ 3/);

    const analysisHub = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "hubs",
            "analysis.hub.js"
        ),
        "utf8"
    );

    assert.match(
        analysisHub,
        /brain\.engine\.js\?v=sia7-model-semantic-planner-v3-20260714/
    );
});

test("daily supervision cloud lookup has a bounded browser deadline", () => {
    const source = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "jarvis",
            "jarvis.multitool.pack.js"
        ),
        "utf8"
    );

    assert.match(source, /SUPERVISION_CLOUD_TIMEOUT_MS\s*=\s*4500/);
    assert.match(source, /FORENSICS_SUPERVISION_TIMEOUT_MS\s*=\s*4500/);
    assert.match(source, /timeoutMs:\s*FORENSICS_SUPERVISION_TIMEOUT_MS/);
    assert.match(source, /Math\.min\(\s*10000,[\s\S]{0,180}Math\.max\(\s*1000/);
    assert.match(source, /controller\?\.abort\(\)/);
    assert.match(source, /signal:\s*controller\.signal/);
    assert.match(source, /SUPERVISION_STATUS_TIMEOUT_/);
    assert.match(source, /clearTimeout\(timeoutId\)/);
    assert.match(source, /4\.9\.0-mission-isolation/);
    assert.doesNotMatch(source, /3\.0\.0-model-semantic-planner/);
});

test("multifunction descriptor remains approval-bound", () => {
    const descriptor =
        describeJarvisMultifunctionTools();

    assert.equal(descriptor.readOnlyByDefault, true);
    assert.equal(descriptor.derivedWritesRequireApproval, true);
    assert.ok(descriptor.domains.includes("marketing"));
    assert.ok(descriptor.domains.includes("media"));

    const planner =
        describeJarvisMultifunctionPlanner();

    assert.equal(planner.mutates, false);
    assert.equal(
        planner.version,
        "4.14.0-identity-fidelity"
    );
    assert.equal(planner.maximumToolCalls, 12);
    assert.equal(planner.architecture, "model_selected_runtime_catalog");
    assert.equal(planner.approvalSource, "trusted_runtime_context");
});

test("terminal ledger stays compact and escapes persisted labels", () => {
    const ledger = fs.readFileSync(
        path.join(__dirname, "..", "modules", "terminal", "ledger.js"),
        "utf8"
    );

    assert.match(ledger, /function escapeLedgerHtml/);
    assert.match(ledger, /Object\.entries\(grouped\)\.slice\(0, 5\)/);
    assert.match(ledger, /<details id="ledger-ui-block"/);
    assert.match(ledger, /escapeLedgerHtml\(planId\)/);
    assert.match(ledger, /escapeLedgerHtml\(eventType\.replace/);
    assert.match(ledger, /hadPreviousLedger && hasNewLedgerEvent/);
    assert.doesNotMatch(ledger, /\$\{planId\}\s*<\/div>/);
});

test("repo diagnostics resolve indexed basenames to real repository paths", () => {
    const toolsRuntime = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "tools.runtime.js"),
        "utf8"
    );

    assert.match(toolsRuntime, /file:\s*meta\?\.path\s*\|\|\s*key/);
    assert.match(toolsRuntime, /window\.__REPO_INDEX__\?\.\[normalizedFile\]/);
    assert.match(toolsRuntime, /indexedPath\.split\("\/"\)\.pop\(\) === normalizedFile/);
    assert.match(toolsRuntime, /const resolvedFile\s*=\s*String\(indexedFile\?\.path \|\| normalizedFile\)/);
    assert.match(toolsRuntime, /requestedFile:\s*normalizedFile,\s*resolvedFile/);
    assert.match(toolsRuntime, /const findingLinePatterns\s*=\s*\{/);
    assert.match(toolsRuntime, /finding\.evidence[\s\S]{0,300}lines:\s*evidenceLines/);
    assert.match(toolsRuntime, /const basenameStem\s*=/);
    assert.match(toolsRuntime, /const tokenStem\s*=/);
    assert.match(toolsRuntime, /exactFileSearchTerms:/);
    assert.match(toolsRuntime, /testFiles,/);

    const core = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "gestia-core.js"),
        "utf8"
    );
    const terminal = fs.readFileSync(
        path.join(__dirname, "..", "gestia-terminal.html"),
        "utf8"
    );

    assert.match(core, /jarvis-tools-v7-20260728-identity-fidelity-v106/);
    assert.match(
        terminal,
        /jarvis-tools-v7-20260725-semantic-envelope-v64/
    );
    assert.match(
        core,
        /jarvis-tools-v7-20260725-semantic-envelope-v64/
    );
    assert.match(core, /DOCUMENT_BLUEPRINT_REQUIRED/);
    assert.match(core, /DOCUMENT_BLUEPRINT_PENDING/);
    assert.match(core, /const blueprintComposerPending\s*=/);
    assert.match(core, /blocked:\s*!blueprintComposerPending/);
    assert.match(core, /retryable:\s*Boolean\(\s*blueprintComposerPending/);
    assert.match(core, /PAGE_BLUEPRINT_REQUIRED/);
    assert.match(core, /no se creo un archivo parcial/);
});

test("repo diagnosis accepts synchronous null discovery before loading fallback context", () => {
    const source = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "tools.runtime.js"),
        "utf8"
    );

    assert.match(source, /let found\s*=\s*null;/);
    assert.match(source, /found\s*=\s*await findRepoFile/);
    assert.match(source, /loaded\s*=\s*await loadRepoContext/);
    assert.doesNotMatch(
        source,
        /findRepoFile\([\s\S]{0,350}\)\s*\.catch\(\(\) => null\)/
    );
});


test("artifact edit missions keep specialized editors and defer certification until completion audit", () => {
    const plannerSource =
        fs.readFileSync(
            path.join(
                process.cwd(),
                "gestia-core",
                "jarvis",
                "jarvis.multifunction.planner.js"
            ),
            "utf8"
        );

    assert.match(
        plannerSource,
        /document\.pdf\.edit/
    );
    assert.match(
        plannerSource,
        /document\.xlsx\.edit/
    );
    assert.match(
        plannerSource,
        /image\.edit/
    );
    assert.match(
        plannerSource,
        /Nunca sustituyas una edicion solicitada/
    );
    assert.match(
        plannerSource,
        /tool\.name === "system\.certify"[\s\S]{0,160}COMPLETION_AUDIT/
    );
});


test("browser mission fallback retries every semantic sample with an independent AbortSignal", async () => {
    const previousFetch =
        globalThis.fetch;

    const signals =
        [];

    let attempt =
        0;

    try {
        globalThis.fetch =
            async (
                _url,
                options = {}
            ) => {
                signals.push(
                    options.signal
                );

                attempt +=
                    1;

                if (attempt === 1) {
                    throw new Error(
                        "signal is aborted without reason"
                    );
                }

                const toolCalls =
                    attempt === 2
                        ? [{
                            name:
                                "document.pdf.edit",
                            args: {
                                sourceOutput:
                                    ".jarvis-artifacts/documents/source.pdf",
                                output:
                                    ".jarvis-artifacts/documents/output.pdf",
                                safePlacement:
                                    true,
                                changes: [{
                                    page:
                                        1,
                                    x:
                                        9000,
                                    y:
                                        -200,
                                    width:
                                        9000,
                                    height:
                                        18,
                                    text:
                                        "Validacion V103",
                                    fontSize:
                                        8
                                }]
                            }
                        }]
                        : [];

                return {
                    ok:
                        true,
                    status:
                        200,
                    text:
                        async () =>
                            JSON.stringify({
                                toolCalls,
                                missionComplete:
                                    false
                            })
                };
            };

        const plan =
            await plannerTest
                .callBrowserMissionContract(
                    "Ejecuta document.pdf.edit una sola vez.",
                    [{
                        name:
                            "document.pdf.edit",
                        description:
                            "Edita una copia local de un PDF.",
                        mutates:
                            true,
                        requiresApproval:
                            false,
                        userArtifact:
                            true,
                        missionDedupeBy: [
                            "sourceOutput",
                            "output"
                        ],
                        inputSchema: {
                            type:
                                "object",
                            required: [
                                "sourceOutput",
                                "output",
                                "changes"
                            ],
                            properties: {
                                sourceOutput: {
                                    type:
                                        "string"
                                },
                                output: {
                                    type:
                                        "string"
                                },
                                safePlacement: {
                                    type:
                                        "boolean"
                                },
                                changes: {
                                    type:
                                        "array",
                                    minItems:
                                        1,
                                    items: {
                                        type:
                                            "object"
                                    }
                                }
                            }
                        }
                    }],
                    {
                        phase:
                            "MISSION_CONTRACT",
                        existingInitialTools: [
                            "document.pdf.edit"
                        ]
                    }
                );

        assert.equal(
            signals.length,
            3
        );

        assert.equal(
            new Set(signals).size,
            3
        );

        assert.equal(
            signals.every(signal =>
                signal &&
                signal.aborted ===
                    false
            ),
            true
        );

        assert.deepEqual(
            plan.toolCalls.map(call =>
                call.name
            ),
            [
                "document.pdf.edit"
            ]
        );

        assert.equal(
            plan.planKind,
            "MISSION_CONTRACT_AUDITED"
        );
    }
    finally {
        globalThis.fetch =
            previousFetch;
    }
});


test("governed explicit tool envelope runs without semantic providers and defers certification", async () => {
    const previousFetch =
        globalThis.fetch;

    let fetchCalls =
        0;

    const pdfArgs = {
        sourceOutput:
            ".jarvis-artifacts/documents/source.pdf",
        output:
            ".jarvis-artifacts/documents/output.pdf",
        safePlacement:
            true,
        changes: [{
            page:
                1,
            x:
                9000,
            y:
                -200,
            width:
                9000,
            height:
                18,
            text:
                "Validacion V104",
            fontSize:
                8,
            padding:
                1,
            color:
                "#000000",
            backgroundColor:
                "#ffffff"
        }]
    };

    const certificationArgs = {
        deep:
            true
    };

    const instruction = [
        "Prueba determinista de herramienta local.",
        "[[JARVIS_TOOL_PLAN]]",
        JSON.stringify({
            toolCalls: [{
                name:
                    "document.pdf.edit",
                args:
                    pdfArgs
            }, {
                name:
                    "system.certify",
                args:
                    certificationArgs,
                terminal:
                    true
            }]
        }),
        "[[/JARVIS_TOOL_PLAN]]"
    ].join("\n");

    const toolCatalog = [{
        name:
            "document.pdf.edit",
        description:
            "Edita una copia local de un PDF.",
        mutates:
            true,
        requiresApproval:
            false,
        userArtifact:
            true,
        missionDedupeBy: [
            "sourceOutput",
            "output"
        ],
        inputSchema: {
            sourceOutput:
                "string",
            output:
                "string",
            changes:
                "array",
            safePlacement:
                "boolean"
        }
    }, {
        name:
            "system.certify",
        description:
            "Certifica evidencia terminal.",
        mutates:
            false,
        requiresApproval:
            false,
        userArtifact:
            false,
        inputSchema: {
            deep:
                "boolean"
        }
    }];

    try {
        globalThis.fetch =
            async () => {
                fetchCalls +=
                    1;

                throw new Error(
                    "NETWORK_MUST_NOT_BE_USED"
                );
            };

        const initial =
            await buildJarvisMultifunctionToolCalls(
                instruction,
                {
                    toolCatalog,
                    throwOnUnavailable:
                        true
                }
            );

        assert.deepEqual(
            initial.map(call =>
                call.name
            ),
            [
                "document.pdf.edit"
            ]
        );

        assert.equal(
            initial[0]
                .args
                .safePlacement,
            true
        );

        const contract =
            await buildJarvisMultifunctionToolCalls(
                instruction,
                {
                    toolCatalog,
                    throwOnUnavailable:
                        true,
                    missionState: {
                        phase:
                            "MISSION_CONTRACT",
                        existingInitialTools: [
                            "document.pdf.edit"
                        ]
                    }
                }
            );

        assert.deepEqual(
            contract.map(call =>
                call.name
            ),
            [
                "document.pdf.edit"
            ]
        );

        const audit =
            await buildJarvisMultifunctionToolCalls(
                instruction,
                {
                    toolCatalog,
                    throwOnUnavailable:
                        true,
                    missionState: {
                        phase:
                            "COMPLETION_AUDIT",
                        completedTasks: [{
                            name:
                                "document.pdf.edit",
                            args:
                                pdfArgs
                        }],
                        blockedTasks:
                            []
                    }
                }
            );

        assert.deepEqual(
            audit.map(call =>
                call.name
            ),
            [
                "system.certify"
            ]
        );

        assert.equal(
            audit[0]
                .args
                .deep,
            true
        );

        const closed =
            await buildJarvisMultifunctionToolCalls(
                instruction,
                {
                    toolCatalog,
                    throwOnUnavailable:
                        true,
                    missionState: {
                        phase:
                            "COMPLETION_AUDIT",
                        completedTasks: [{
                            name:
                                "document.pdf.edit",
                            args:
                                pdfArgs
                        }, {
                            name:
                                "system.certify",
                            args:
                                certificationArgs
                        }],
                        blockedTasks:
                            []
                    }
                }
            );

        assert.equal(
            closed.length,
            0
        );

        assert.equal(
            closed.missionComplete,
            true
        );

        assert.equal(
            fetchCalls,
            0
        );

        const unsafe =
            plannerTest
                .extractExplicitGovernedToolPlan(
                    [
                        "[[JARVIS_TOOL_PLAN]]",
                        JSON.stringify({
                            toolCalls: [{
                                name:
                                    "repo.write",
                                args: {
                                    file:
                                        "app-main.js",
                                    content:
                                        "unsafe"
                                }
                            }]
                        }),
                        "[[/JARVIS_TOOL_PLAN]]"
                    ].join("\n"),
                    [{
                        name:
                            "repo.write",
                        mutates:
                            true,
                        requiresApproval:
                            true,
                        userArtifact:
                            false,
                        inputSchema: {
                            file:
                                "string",
                            content:
                                "string"
                        }
                    }],
                    null
                );

        assert.equal(
            unsafe,
            null
        );
    }
    finally {
        globalThis.fetch =
            previousFetch;
    }
});


test("uploaded identity image routes once through image.edit with the real artifact source", () => {
    const manifest = [{
        name:
            "Screenshot_20260422-192007.png",
        mimeType:
            "image/png",
        bytes:
            2740762,
        artifact:
            ".jarvis-artifacts/uploads/Screenshot_20260422-192007.png",
        sha256:
            "ef595bc333a47814eb17fe2b10bced77135efc0532ff14680304ee7b2aec7d52"
    }];

    const instruction = [
        "Genera una imagen profesional mia en la playa usando mi foto adjunta.",
        "",
        "Archivos adjuntos reales entregados por el usuario:",
        JSON.stringify(
            manifest
        )
    ].join("\n");

    const catalog = [{
        name:
            "image.generate",
        description:
            "Genera una imagen nueva sin fuente visual.",
        mutates:
            true,
        requiresApproval:
            false,
        userArtifact:
            true,
        missionDedupeBy: [
            "output"
        ],
        inputSchema: {
            prompt:
                "string",
            output:
                "string"
        }
    }, {
        name:
            "image.edit",
        description:
            "Edita una imagen persistida usando sus bytes reales.",
        mutates:
            true,
        requiresApproval:
            false,
        userArtifact:
            true,
        missionDedupeBy: [
            "sourceOutput",
            "variantId"
        ],
        inputSchema: {
            sourceOutput:
                "string",
            referenceOutputs:
                "array",
            variantId:
                "string",
            identityMode:
                "string",
            ageMode:
                "string",
            prompt:
                "string",
            transformations:
                "array",
            output:
                "string",
            preserveLogos:
                "boolean",
            preserveApprovedText:
                "boolean"
        }
    }, {
        name:
            "media.analyze",
        description:
            "Analiza adjuntos.",
        mutates:
            false,
        requiresApproval:
            false,
        userArtifact:
            false,
        missionDedupeBy:
            [],
        inputSchema: {
            attachments:
                "array"
        }
    }];

    const calls =
        plannerTest.trustedPlanCalls(
            {
                toolCalls: [{
                    name:
                        "image.generate",
                    args: {
                        prompt:
                            "Retrato profesional de Heberto en la playa"
                    }
                }, {
                    name:
                        "media.analyze",
                    args: {
                        attachments:
                            manifest
                    }
                }, {
                    name:
                        "image.generate",
                    args: {
                        prompt:
                            "Heberto en la playa con ropa profesional"
                    }
                }]
            },
            catalog,
            {
                originalInstruction:
                    instruction
            }
        );

    assert.deepEqual(
        calls.map(call =>
            call.name
        ),
        [
            "image.edit"
        ]
    );

    assert.equal(
        calls[0]
            .args
            .sourceOutput,
        manifest[0]
            .artifact
    );

    assert.equal(
        calls[0]
            .args
            .transformations
            .some(item =>
                item.includes(
                    "identidad"
                )
            ),
        true
    );

    assert.equal(
        calls[0]
            .missionDedupeKey,
        'image.edit:[".jarvis-artifacts/uploads/Screenshot_20260422-192007.png","PRIMARY"]'
    );
});

test("independent generation remains image.generate when the attachment is explicitly excluded as a reference", () => {
    const manifest = [{
        name:
            "selfie.png",
        mimeType:
            "image/png",
        artifact:
            ".jarvis-artifacts/uploads/selfie.png"
    }];

    const instruction = [
        "Analiza mi foto adjunta y genera un paisaje abstracto independiente sin usar mi foto como referencia.",
        "",
        "Archivos adjuntos reales entregados por el usuario:",
        JSON.stringify(
            manifest
        )
    ].join("\n");

    const catalog = [{
        name:
            "image.generate",
        mutates:
            true,
        requiresApproval:
            false,
        userArtifact:
            true,
        missionDedupeBy: [
            "output"
        ],
        inputSchema: {
            prompt:
                "string",
            output:
                "string"
        }
    }, {
        name:
            "image.edit",
        mutates:
            true,
        requiresApproval:
            false,
        userArtifact:
            true,
        missionDedupeBy: [
            "sourceOutput",
            "variantId"
        ],
        inputSchema: {
            sourceOutput:
                "string",
            referenceOutputs:
                "array",
            variantId:
                "string",
            prompt:
                "string",
            transformations:
                "array"
        }
    }, {
        name:
            "media.analyze",
        mutates:
            false,
        requiresApproval:
            false,
        missionDedupeBy:
            [],
        inputSchema: {
            attachments:
                "array"
        }
    }];

    const calls =
        plannerTest.trustedPlanCalls(
            {
                toolCalls: [{
                    name:
                        "media.analyze",
                    args: {
                        attachments:
                            manifest
                    }
                }, {
                    name:
                        "image.generate",
                    args: {
                        prompt:
                            "Paisaje abstracto sin personas"
                    }
                }]
            },
            catalog,
            {
                originalInstruction:
                    instruction
            }
        );

    assert.deepEqual(
        calls.map(call =>
            call.name
        ),
        [
            "media.analyze",
            "image.generate"
        ]
    );
});

test("image actuators expose mission dedupe and mandatory grounded-reference instructions", () => {
    const actuatorSource =
        fs.readFileSync(
            path.resolve(
                __dirname,
                "../gestia-core/jarvis/jarvis.actuator.pack.js"
            ),
            "utf8"
        );

    assert.match(
        actuatorSource,
        /name:\s*"image\.generate"[\s\S]{0,900}?missionDedupeBy:\s*\[\s*"output"\s*\]/
    );

    assert.match(
        actuatorSource,
        /name:\s*"image\.edit"[\s\S]{0,1600}?missionDedupeBy:\s*\[\s*"sourceOutput",\s*"variantId"\s*\]/
    );

    assert.match(
        actuatorSource,
        /Usa la imagen fuente como referencia visual obligatoria/
    );

    assert.match(
        actuatorSource,
        /referenceGrounded/
    );
});


test("reference photo count never becomes output variant count and newest dated identity is primary", () => {
    const manifest = [{
        name:
            "IMG_20211225_012522-2.jpg",
        mimeType:
            "image/jpeg",
        artifact:
            ".jarvis-artifacts/uploads/old-reference.jpg",
        sha256:
            "old-sha"
    }, {
        name:
            "IMG_20241216_111350981_HDR.jpg",
        mimeType:
            "image/jpeg",
        artifact:
            ".jarvis-artifacts/uploads/current-reference.jpg",
        sha256:
            "current-sha"
    }];

    const instruction = [
        "Usa mis mejores 2 o 3 fotos adjuntas como referencias de identidad y crea una sola imagen profesional sin envejecerme.",
        "",
        "Archivos adjuntos reales entregados por el usuario:",
        JSON.stringify(
            manifest
        )
    ].join("\n");

    const catalog = [{
        name:
            "image.generate",
        mutates:
            true,
        requiresApproval:
            false,
        userArtifact:
            true,
        missionDedupeBy: [
            "output"
        ],
        inputSchema: {
            prompt:
                "string",
            output:
                "string"
        }
    }, {
        name:
            "image.edit",
        mutates:
            true,
        requiresApproval:
            false,
        userArtifact:
            true,
        missionDedupeBy: [
            "sourceOutput",
            "variantId"
        ],
        inputSchema: {
            sourceOutput:
                "string",
            referenceOutputs:
                "array",
            variantId:
                "string",
            identityMode:
                "string",
            ageMode:
                "string",
            prompt:
                "string",
            transformations:
                "array",
            output:
                "string"
        }
    }];

    const calls =
        plannerTest
            .trustedPlanCalls(
                {
                    toolCalls: [{
                        name:
                            "image.edit",
                        args: {
                            sourceOutput:
                                manifest[0].artifact,
                            prompt:
                                "Retrato en playa"
                        }
                    }, {
                        name:
                            "image.edit",
                        args: {
                            sourceOutput:
                                manifest[0].artifact,
                            prompt:
                                "Otra formulacion del mismo retrato"
                        }
                    }]
                },
                catalog,
                {
                    originalInstruction:
                        instruction
                }
            );

    assert.equal(
        calls.length,
        1
    );

    assert.equal(
        calls[0]
            .name,
        "image.edit"
    );

    assert.equal(
        calls[0]
            .args
            .sourceOutput,
        manifest[1]
            .artifact
    );

    assert.deepEqual(
        calls[0]
            .args
            .referenceOutputs,
        [
            manifest[1]
                .artifact,
            manifest[0]
                .artifact
        ]
    );

    assert.equal(
        calls[0]
            .args
            .variantId,
        "PRIMARY"
    );

    assert.equal(
        calls[0]
            .args
            .ageMode,
        "preserve"
    );

    assert.equal(
        calls[0]
            .missionDedupeKey,
        'image.edit:[".jarvis-artifacts/uploads/current-reference.jpg","PRIMARY"]'
    );
});
