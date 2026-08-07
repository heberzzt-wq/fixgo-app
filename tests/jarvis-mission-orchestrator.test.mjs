import assert from "node:assert/strict";
import { test } from "node:test";
import { recoverJarvisMission, runJarvisMission, __test } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import { planMarketingRequest } from "../gestia-core/jarvis/jarvis.marketing.engine.js";

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
    };
}

function quotaStorage({
    initial = "[]",
    maximum = 60000
} = {}) {
    const values =
        new Map([
            [
                "jarvis.missions.v1",
                initial
            ]
        ]);
    return {
        getItem:
            key =>
                values.has(key)
                    ? values.get(key)
                    : null,
        setItem:
            (key, value) => {
                const serialized =
                    String(value);
                if (
                    serialized.length >
                    maximum
                ) {
                    const error =
                        new Error(
                            "Storage quota exceeded."
                        );
                    error.name =
                        "QuotaExceededError";
                    throw error;
                }
                values.set(
                    key,
                    serialized
                );
            }
    };
}

test("mission preserves a ten-page instruction while routing with a bounded representation", async () => {
    const instruction = Array.from({ length: 4000 }, (_, index) => `Parrafo ${index}: requisito verificable de la mision.`).join("\n");
    assert.ok(instruction.length > 12000);
    const mission = await runJarvisMission({
        instruction,
        initialToolCalls: [],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async () => ({ ok: true }),
        storage: memoryStorage()
    });
    assert.equal(mission.originalInstruction, instruction);
    assert.equal(mission.rawInstructionLength, instruction.length);
    assert.equal(mission.routingInstructionLength, 12000);
    assert.equal(mission.instructionHash.length, 64);
});

test("mission continues from research through marketing, page and reel planning", async () => {
    const storage = memoryStorage();
    const sequence = ["web.research", "marketing.plan", "page.plan", "reel.plan"];
    const executed = [];
    const mission = await runJarvisMission({
        instruction: "Investiga summ.com.mx y entrega estrategia, landing propuesta y storyboard de reel sin publicar.",
        initialToolCalls: [{ name: sequence[0], args: { query: "site:summ.com.mx SUMM" } }],
        requiredToolNames: sequence,
        planner: async ({ mission: current }) => {
            const next = sequence[current.completedTasks.length];
            return next
                ? { toolCalls: [{ name: next, args: { prompt: "evidencia previa" } }] }
                : { toolCalls: [], missionComplete: true };
        },
        execute: async call => {
            executed.push(call.name);
            return call.name === "web.research"
                ? { ok: true, sources: [{ url: "https://www.summ.com.mx/" }], answer: "Fuente oficial" }
                : call.name === "marketing.plan"
                    ? { ok: true, status: "READY", campaign: { audience: "Empresas", cta: "Agenda" } }
                : { ok: true, status: "READY", summary: `${call.name} completo` };
        },
        storage
    });
    assert.deepEqual(executed, sequence);
    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(mission.completedTasks.length, 4);
    assert.equal(
        mission.completedTasks.find(item => item.name === "marketing.plan").observation.evidence.campaign.cta,
        "Agenda"
    );
    assert.equal(mission.writeAllowed, false);
    const recovered = recoverJarvisMission(mission.missionId, { storage });
    assert.equal(recovered.objectiveId, mission.objectiveId);
    assert.equal(recovered.originalInstruction, mission.originalInstruction);
    assert.deepEqual(recovered.requiredToolNames, sequence);
});

test("mission grounds dependent execution arguments with prior evidence", async () => {
    const mission = await runJarvisMission({
        instruction: "Revisa tecnico b2b y explica su impacto sin modificar.",
        initialToolCalls: [
            {
                name: "repo.search",
                args: { query: "tecnico b2b" }
            },
            {
                name: "repo.impact",
                args: { file: "b2b.html" }
            }
        ],
        requiredToolNames: ["repo.search", "repo.impact"],
        planner: async () => ({
            toolCalls: [],
            missionComplete: false
        }),
        execute: async (call, context) => {
            if (call.name === "repo.search") {
                assert.deepEqual(context.completedTasks, []);
                return {
                    ok: true,
                    status: "COMPLETED",
                    results: [{ file: "tecnico-b2b.html" }]
                };
            }

            assert.equal(context.completedTasks.length, 1);
            assert.equal(context.completedTasks[0].name, "repo.search");
            return {
                ok: true,
                status: "IMPACT_READY_LIVE",
                missionExecution: {
                    name: "repo.impact",
                    args: { file: "tecnico-b2b.html" },
                    argumentGrounded: true
                }
            };
        },
        storage: memoryStorage()
    });

    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(mission.status, "COMPLETED");
    assert.deepEqual(
        mission.completedTasks.find(item => item.name === "repo.impact").args,
        { file: "tecnico-b2b.html" }
    );
    assert.deepEqual(
        mission.observations.find(item => item.tool === "repo.impact").args,
        { file: "tecnico-b2b.html" }
    );
});

test("mission retries artifact creation while its document blueprint is pending", async () => {
    let composeAttempts =
        0;
    const executed =
        [];
    const mission =
        await runJarvisMission({
            instruction:
                "Crea un documento verificable y descargable.",
            initialToolCalls: [
                {
                    name:
                        "document.compose",
                    args:
                        {}
                },
                {
                    name:
                        "document.create",
                    args: {
                        format:
                            "docx"
                    }
                }
            ],
            requiredToolNames: [
                "document.compose",
                "document.create"
            ],
            planner:
                async () => ({
                    toolCalls:
                        [],
                    missionComplete:
                        true
                }),
            execute:
                async (call, context) => {
                    executed.push(
                        call.name
                    );
                    if (
                        call.name ===
                        "document.compose"
                    ) {
                        composeAttempts +=
                            1;
                        if (
                            composeAttempts ===
                            1
                        ) {
                            return {
                                ok:
                                    false,
                                status:
                                    "DOCUMENT_CONTENT_COMPOSITION_FAILED",
                                objectiveSatisfied:
                                    false,
                                blocked:
                                    false,
                                retryable:
                                    true
                            };
                        }
                        return {
                            ok:
                                true,
                            status:
                                "DOCUMENT_CONTENT_COMPOSED",
                            title:
                                "Manual",
                            format:
                                "docx",
                            content:
                                "Contenido operativo completo y verificable.",
                            wordCount:
                                80,
                            completionMarkerPresent:
                                true,
                            compositionComplete:
                                true,
                            validationPassed:
                                true,
                            contract: {
                                minWords:
                                    80
                            }
                        };
                    }
                    const blueprintReady =
                        context.completedTasks
                            .some(item =>
                                item.name ===
                                "document.compose"
                            );
                    return blueprintReady
                        ? {
                            ok:
                                true,
                            status:
                                "DOCUMENT_CREATED",
                            output:
                                ".jarvis-artifacts/documents/manual.docx"
                        }
                        : {
                            ok:
                                false,
                            status:
                                "DOCUMENT_BLUEPRINT_PENDING",
                            objectiveSatisfied:
                                false,
                            blocked:
                                false,
                            retryable:
                                true
                        };
                },
            storage:
                memoryStorage()
        });

    assert.deepEqual(
        executed,
        [
            "document.compose",
            "document.create",
            "document.compose",
            "document.create"
        ]
    );
    assert.equal(
        mission.status,
        "COMPLETED"
    );
    assert.equal(
        mission.reason,
        "ALL_EXECUTABLE_TASKS_COMPLETED"
    );
    assert.deepEqual(
        mission.completedTasks
            .map(item =>
                item.name
            ),
        [
            "document.compose",
            "document.create"
        ]
    );
    assert.equal(
        mission.blockedTasks.length,
        0
    );
});

test("mission stops dependent deliverables when marketing requires input", async () => {
    const sequence = [
        "web.research",
        "marketing.plan",
        "page.plan",
        "image.plan",
        "reel.plan"
    ];
    const executed = [];
    const mission = await runJarvisMission({
        instruction: "Investiga y entrega campaña, landing, imagen y reel sin publicar.",
        initialToolCalls: sequence.map(name => ({
            name,
            args: { prompt: "Usa evidencia previa" }
        })),
        requiredToolNames: sequence,
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async call => {
            executed.push(call.name);
            if (call.name === "web.research") {
                return {
                    ok: true,
                    status: "GROUNDED",
                    sources: [{ url: "https://www.summ.com.mx/" }],
                    answer: "Fuente oficial"
                };
            }
            if (call.name === "marketing.plan") {
                return {
                    ok: true,
                    status: "MARKETING_INPUT_REQUIRED",
                    readyForProduction: false,
                    campaign: null,
                    missingInputs: ["audience", "offer"]
                };
            }
            return {
                ok: true,
                status: "COMPLETED_READ_ONLY_PLAN"
            };
        },
        storage: memoryStorage()
    });

    assert.deepEqual(executed, ["web.research", "marketing.plan"]);
    assert.deepEqual(
        mission.completedTasks.map(item => item.name),
        ["web.research"]
    );
    assert.deepEqual(
        mission.pendingTasks.map(item => item.name),
        ["page.plan", "image.plan", "reel.plan"]
    );
    assert.equal(mission.reason, "MISSION_INPUT_REQUIRED");
    assert.equal(mission.status, "PARTIAL");
    assert.equal(mission.blockedTasks[0].observation.executionOk, true);
    assert.equal(mission.blockedTasks[0].observation.objectiveSatisfied, false);
    assert.equal(mission.blockedTasks[0].observation.requiresInput, true);
    assert.deepEqual(
        mission.blockedTasks[0].observation.evidence.missingInputs,
        ["audience", "offer"]
    );
});

test("observation contract separates a completed plan from production readiness", () => {
    const observation = __test.safeObservation({
        ok: true,
        status: "COMPLETED_READ_ONLY_PLAN",
        objectiveSatisfied: true,
        readyForProduction: false,
        summary: "El plan solicitado quedó completo."
    });

    assert.equal(observation.executionOk, true);
    assert.equal(observation.objectiveSatisfied, true);
    assert.equal(observation.requiresInput, false);
    assert.equal(observation.blocked, false);
});

test("structured summaries never degrade to object string coercion", () => {
    const observation = __test.safeObservation({
        ok: true,
        readinessScore: 82,
        summary: {
            total: 12,
            READY: 8,
            PARTIAL: 4
        }
    });

    assert.equal(observation.summary, "");
    assert.notEqual(
        observation.summary,
        "[object Object]"
    );
    assert.equal(
        observation.evidence.readinessScore,
        82
    );
});

test("structured artifact evidence resolves to its real file path", () => {
    const observation = __test.safeObservation({
        ok: true,
        artifact: {
            file: ".jarvis-artifacts/documents/guia.docx",
            bytes: 24000
        }
    });

    assert.equal(
        observation.artifact,
        ".jarvis-artifacts/documents/guia.docx"
    );
    assert.notEqual(
        observation.artifact,
        "[object Object]"
    );
});

test("mission dedupe identity prevents repeated semantic artifact stages", async () => {
    const executed = [];
    const mission = await runJarvisMission({
        instruction: "Crea una landing local.",
        initialToolCalls: [
            {
                name: "page.compose",
                args: { title: "Landing HMH" },
                missionDedupeKey: "page.compose:[]"
            },
            {
                name: "page.compose",
                args: { title: "HMH servicios" },
                missionDedupeKey: "page.compose:[]"
            }
        ],
        requiredToolNames: ["page.compose"],
        planner: async () => ({
            toolCalls: [],
            missionComplete: true
        }),
        execute: async call => {
            executed.push(call.name);
            return {
                ok: true,
                status: "PAGE_CONTENT_COMPOSED",
                pageInput: {
                    brandName: "HMH",
                    title: "Landing HMH",
                    description: "Servicios reales en Cancún.",
                    services: [{
                        title: "Mantenimiento",
                        description: "Atención local."
                    }],
                    whatsappRequested: true
                }
            };
        },
        storage: memoryStorage()
    });

    assert.deepEqual(executed, ["page.compose"]);
    assert.equal(mission.status, "COMPLETED");
});

test("mission evidence preserves a complete bounded tool registry", () => {
    const registrations =
        Array.from(
            {
                length: 18
            },
            (_, index) => ({
                name:
                    `domain.tool${index + 1}`,
                line:
                    index + 10
            })
        );
    const observation =
        __test.safeObservation({
            ok: true,
            sourceStructure: {
                kind:
                    "tool_registry",
                registrations
            }
        });

    assert.equal(
        observation.evidence
            .sourceStructure
            .registrations
            .length,
        18
    );
    assert.equal(
        observation.evidence
            .sourceStructure
            .registrations[17]
            .name,
        "domain.tool18"
    );
});

test("repo read observations preserve numbered verified source beyond compact summaries", () => {
    const numberedContent =
        Array.from(
            {
                length: 180
            },
            (_, index) =>
                `${index + 1}: export const symbol${index + 1} = ${index + 1};`
        ).join("\n");
    assert.ok(numberedContent.length > 700);

    const observation =
        __test.safeObservation({
            ok: true,
            tool: "repo.read",
            file: "gestia-core/response.composer.js",
            path: "gestia-core/response.composer.js",
            content: numberedContent,
            numberedContent,
            startLine: 1,
            endLine: 180,
            totalLines: 180,
            sourceStructure: {
                kind: "javascript_module",
                exports: [
                    {
                        name: "symbol180",
                        line: 180
                    }
                ]
            }
        });

    assert.equal(
        observation.verifiedRead.file,
        "gestia-core/response.composer.js"
    );
    assert.equal(
        observation.verifiedRead.numberedContent,
        numberedContent
    );
    assert.equal(
        observation.verifiedRead.totalLines,
        180
    );
    assert.equal(
        observation.verifiedRead
            .sourceStructure
            .exports[0]
            .line,
        180
    );
});

test("a fully executed model contract closes even when the final audit returns no duplicate work", async () => {
    const sequence = [
        "web.research",
        "marketing.plan",
        "image.plan",
        "reel.plan"
    ];
    const mission = await runJarvisMission({
        instruction:
            "Investiga y prepara campana, imagen y reel en read-only.",
        initialToolCalls:
            sequence.map(name => ({
                name,
                args: {
                    instruction:
                        "mision verificada"
                }
            })),
        requiredToolNames:
            sequence,
        planner:
            async () => ({
                toolCalls: [],
                missionComplete: false
            }),
        execute:
            async () => ({
                ok: true,
                status:
                    "COMPLETED_READ_ONLY_PLAN"
            }),
        storage:
            memoryStorage()
    });

    assert.equal(
        mission.reason,
        "ALL_EXECUTABLE_TASKS_COMPLETED"
    );
    assert.equal(
        mission.status,
        "COMPLETED"
    );
    assert.deepEqual(
        mission.executedTools,
        sequence
    );
});

test("mission blocks writes without retrying an approval requirement", async () => {
    let attempts = 0;
    const mission = await runJarvisMission({
        instruction: "Prepara sin publicar.",
        initialToolCalls: [{ name: "page.create", args: { output: "landing.html" }, approved: true }],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async (call, context) => {
            attempts += 1;
            assert.equal(call.approved, false);
            assert.equal(context.approved, false);
            return { ok: false, status: "PENDING_APPROVAL" };
        },
        storage: memoryStorage(),
        maximumRetries: 1
    });
    assert.equal(attempts, 1);
    assert.equal(mission.reason, "MISSION_APPROVAL_REQUIRED");
    assert.equal(mission.blockedTasks.length, 1);
    assert.equal(mission.blockedTasks[0].observation.requiresApproval, true);
    assert.equal(mission.approvalRequiredForWrite, true);
});

test("mission stops repeated plans and respects maximum steps", async () => {
    let index = 0;
    const mission = await runJarvisMission({
        instruction: "Ejecuta una mision acotada.",
        initialToolCalls: [{ name: "web.research", args: { query: "a" } }],
        planner: async () => ({ toolCalls: [{ name: "web.research", args: { query: "a" } }] }),
        execute: async () => ({ ok: true }),
        storage: memoryStorage(),
        maximumSteps: 2
    });
    index += mission.executedTools.length;
    assert.equal(index, 1);
    assert.equal(mission.reason, "PLANNER_NO_EXECUTABLE_PLAN");

    const bounded = await runJarvisMission({
        instruction: "Genera tareas distintas sin fin.",
        initialToolCalls: [],
        planner: async () => ({ toolCalls: [{ name: "tool.read", args: { page: ++index } }] }),
        execute: async () => ({ ok: true }),
        storage: memoryStorage(),
        maximumSteps: 3
    });
    assert.equal(bounded.iterations, 3);
    assert.equal(bounded.reason, "MAXIMUM_STEPS_REACHED");
});

test("mission cancellation and deadline close without another tool", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled = await runJarvisMission({
        instruction: "Cancela seguro.",
        initialToolCalls: [{ name: "tool.read", args: {} }],
        planner: async () => ({ toolCalls: [] }),
        execute: async () => assert.fail("must not execute"),
        storage: memoryStorage(),
        signal: controller.signal
    });
    assert.equal(cancelled.reason, "CANCELLED");

    const deadline = await runJarvisMission({
        instruction: "Expira seguro.",
        planner: async () => ({ toolCalls: [] }),
        execute: async () => assert.fail("must not execute"),
        storage: memoryStorage(),
        timeoutMs: -1
    });
    assert.equal(deadline.reason, "DEADLINE_EXCEEDED");
});

test("mission never reports completion when the semantic planner is unavailable", async () => {
    const mission = await runJarvisMission({
        instruction: "Investiga y entrega todos los resultados.",
        initialToolCalls: [{ name: "web.research", args: { query: "fuente oficial" } }],
        planner: async () => {
            throw new Error("SEMANTIC_PLANNER_UNAVAILABLE");
        },
        execute: async () => ({ ok: true, status: "READY" }),
        storage: memoryStorage()
    });

    assert.equal(mission.reason, "PLANNER_UNAVAILABLE");
    assert.equal(mission.status, "PARTIAL");
    assert.equal(mission.errors[0].tool, "semantic.planner");
});

test("mission cannot close while its model-generated contract is incomplete", async () => {
    const mission = await runJarvisMission({
        instruction: "Entrega investigacion, landing e imagen.",
        initialToolCalls: [{ name: "web.research", args: { query: "fuente" } }],
        requiredToolNames: ["web.research", "page.plan", "image.plan"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async () => ({ ok: true, status: "READY" }),
        storage: memoryStorage()
    });

    assert.equal(mission.reason, "MISSION_CONTRACT_INCOMPLETE");
    assert.deepEqual(mission.contractMissingTools, ["page.plan", "image.plan"]);
    assert.equal(mission.status, "PARTIAL");
});

test("mission preserves complete prepared content for a following artifact creator", async () => {
    const content = "Guia completa\n" + "Contenido educativo verificable. ".repeat(300);
    let preparedContent = "";
    const mission = await runJarvisMission({
        instruction: "Crea una guia DOCX completa.",
        initialToolCalls: [
            { name: "document.compose", args: { format: "docx" } },
            { name: "document.create", args: { format: "docx" } }
        ],
        requiredToolNames: ["document.compose", "document.create"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async (call, context) => {
            if (call.name === "document.compose") {
                return {
                    ok: true,
                    status: "DOCUMENT_CONTENT_COMPOSED",
                    title: "Guia",
                    format: "docx",
                    content,
                    wordCount: 901,
                    sectionCount: 6,
                    headingCount: 6,
                    tableBlueprintCount: 2,
                    templateCount: 1,
                    questionCount: 0,
                    answerKeyCount: 0,
                    vehicleCount: 25,
                    partCount: 15,
                    kpiCount: 12,
                    implementationDayCoverage: 30,
                    completionMarkerPresent: true,
                    compositionComplete: true,
                    validationPassed: true,
                    contract: { minWords: 900, minSections: 6 }
                };
            }
            preparedContent =
                context.completedTasks[0].observation.preparedArtifact.content;
            return {
                ok: true,
                status: "DOCUMENT_CREATED",
                output: ".jarvis-artifacts/documents/guia.docx"
            };
        },
        storage: memoryStorage()
    });

    assert.equal(mission.status, "COMPLETED");
    assert.equal(preparedContent, content);
    assert.equal(
        mission.completedTasks[0]
            .observation
            .preparedArtifact
            .kind,
        "document"
    );
    assert.equal(
        mission.completedTasks[0]
            .observation
            .preparedArtifact
            .validationPassed,
        true
    );
    assert.equal(
        mission.completedTasks[0]
            .observation
            .preparedArtifact
            .wordCount,
        901
    );
    assert.equal(
        mission.completedTasks[0]
            .observation
            .preparedArtifact
            .contract
            .minWords,
        900
    );
    assert.equal(
        mission.completedTasks[0]
            .observation
            .preparedArtifact
            .vehicleCount,
        25
    );
    assert.equal(
        mission.completedTasks[0]
            .observation
            .preparedArtifact
            .partCount,
        15
    );
    assert.equal(
        mission.completedTasks[0]
            .observation
            .preparedArtifact
            .kpiCount,
        12
    );
    assert.equal(
        mission.completedTasks[0]
            .observation
            .preparedArtifact
            .implementationDayCoverage,
        30
    );
});

test("marketing planning is a mission singleton even with different planned arguments", async () => {
    const executed = [];
    const mission = await runJarvisMission({
        instruction: "Crea un solo plan de marketing.",
        initialToolCalls: [
            { name: "marketing.plan", args: { brandName: "HMH" } },
            { name: "marketing.plan", args: { brandName: "HMH", audience: "Cancún" } }
        ],
        requiredToolNames: ["marketing.plan"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async call => {
            executed.push(call.name);
            return { ok: true, status: "READY", objectiveSatisfied: true };
        },
        storage: memoryStorage()
    });

    assert.deepEqual(executed, ["marketing.plan"]);
    assert.deepEqual(mission.executedTools, ["marketing.plan"]);
    assert.equal(mission.completedTasks.length, 1);
});

test("MARKETING_PACKAGE_READY cannot satisfy the mission without a visible complete deliverable", () => {
    const observation = __test.safeObservation({
        ok: true,
        status: "MARKETING_PACKAGE_READY",
        objectiveSatisfied: true,
        plan: {},
        userVisible: ""
    });

    assert.equal(observation.executionOk, true);
    assert.equal(observation.objectiveSatisfied, false);
    assert.equal(observation.userVisible, "");
    assert.equal(observation.deliverable, null);
});

test("the same marketing mission resumes with supplied context and completes its dependent work", async () => {
    const storage = memoryStorage();
    const instruction = "Crea un plan de marketing completo para Multiservicios Peninsulares HMH.";
    const execute = async (call, context) => {
        if (call.name !== "marketing.plan") {
            return { ok: true, status: "READY", objectiveSatisfied: true };
        }
        if (!context.marketingContext?.audience) {
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: false,
                requiresInput: true,
                status: "MARKETING_INPUT_REQUIRED",
                missingInputs: ["audience", "market", "offer", "budget", "horizon", "cta"]
            };
        }
        return planMarketingRequest(instruction, {
            brandName: "Multiservicios Peninsulares HMH",
            campaignObjective: "Captar clientes y prestadores durante los primeros 90 días",
            promise: "Conectar rápidamente con profesionales y brindar trazabilidad",
            differentiator: "Profesionales verificados, evidencia digital y seguimiento",
            channels: ["Meta Ads", "Google Ads", "WhatsApp"],
            ...context.marketingContext
        });
    };
    const initial = await runJarvisMission({
        instruction,
        initialToolCalls: [
            { name: "marketing.plan", args: {} },
            { name: "page.plan", args: {} }
        ],
        requiredToolNames: ["marketing.plan", "page.plan"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute,
        storage
    });
    assert.equal(initial.reason, "MISSION_INPUT_REQUIRED");
    assert.equal(initial.completedTasks.length, 0);
    assert.deepEqual(initial.pendingTasks.map(item => item.name), ["page.plan"]);

    const resumed = await runJarvisMission({
        instruction: "Audiencia, mercado, oferta, presupuesto, horizonte y CTA proporcionados.",
        resumeMissionId: initial.missionId,
        continuationContext: {
            audience: "Propietarios y pequeños negocios",
            market: "Cancún, Quintana Roo",
            offer: "Multiservicios verificados",
            budget: "bajo y medio",
            horizon: "90 días",
            cta: "Solicitar servicio"
        },
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute,
        storage
    });

    assert.equal(resumed.missionId, initial.missionId);
    assert.equal(resumed.resumeCount, 1);
    assert.equal(resumed.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(resumed.status, "COMPLETED");
    assert.deepEqual(resumed.completedTasks.map(item => item.name), ["marketing.plan", "page.plan"]);
    assert.equal(resumed.blockedTasks.length, 0);
    assert.equal(resumed.runtimeResults[0].status, "MARKETING_PACKAGE_READY");
    assert.equal(resumed.runtimeResults.filter(item => item.status === "MARKETING_PACKAGE_READY").length, 1);
    assert.equal(resumed.executedTools.filter(name => name === "marketing.plan").length, 1);
    assert.equal(resumed.inputHistory.filter(item => item.name === "marketing.plan").length, 1);
    assert.match(resumed.completedTasks[0].observation.userVisible, /25\. Próximos pasos priorizados/i);
    assert.match(resumed.completedTasks[0].observation.userVisible, /Cancún/i);
});

test("mission refuses a status-only document blueprint without V68 validation evidence", () => {
    const observation = __test.safeObservation({
        ok: true,
        status: "DOCUMENT_CONTENT_COMPOSED",
        title: "Manual",
        format: "docx",
        content: "El contenido completo del manual generado por document.compose."
    });

    assert.equal(
        observation.preparedArtifact,
        null
    );
});

test("mission preserves failed document validation evidence for an honest report", () => {
    const observation =
        __test.safeObservation({
            ok:
                false,
            status:
                "DOCUMENT_CONTENT_COMPOSITION_FAILED",
            error:
                "SEMANTIC_CONVERSATION_UNAVAILABLE",
            validationFailures: [
                "DOCUMENT_WORD_COUNT_BELOW_MINIMUM:1200:4500"
            ],
            wordCount:
                1200,
            sectionCount:
                12,
            tableBlueprintCount:
                6,
            continuationCount:
                1,
            segmentedComposition:
                true,
            objectiveSatisfied:
                false,
            blocked:
                true,
            retryable:
                false
        });

    assert.equal(
        observation.error,
        "SEMANTIC_CONVERSATION_UNAVAILABLE"
    );
    assert.deepEqual(
        observation
            .validationFailures,
        [
            "DOCUMENT_WORD_COUNT_BELOW_MINIMUM:1200:4500"
        ]
    );
    assert.equal(
        observation.wordCount,
        1200
    );
    assert.equal(
        observation.sectionCount,
        12
    );
    assert.equal(
        observation.tableBlueprintCount,
        6
    );
    assert.equal(
        observation.segmentedComposition,
        true
    );
});

test("mission preserves a complete page blueprint for the local page creator", async () => {
    const pageInput = {
        brandName: "Multiservicios Peninsulares HMH",
        title: "Servicios en Cancún",
        description: "Mantenimiento profesional para hogares y negocios en Cancún.",
        services: [
            {
                title: "Refrigeración",
                description: "Diagnóstico y mantenimiento sin promesas inventadas."
            }
        ],
        whatsapp: "",
        contactEmail: "",
        whatsappRequested: true
    };
    let preparedPage = null;
    const mission = await runJarvisMission({
        instruction: "Crea una landing local descargable.",
        initialToolCalls: [
            { name: "page.compose", args: {} },
            { name: "page.create", args: {} }
        ],
        requiredToolNames: ["page.compose", "page.create"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async (call, context) => {
            if (call.name === "page.compose") {
                return {
                    ok: true,
                    status: "PAGE_CONTENT_COMPOSED",
                    pageInput
                };
            }
            preparedPage =
                context.completedTasks[0].observation.preparedArtifact.pageInput;
            return {
                ok: true,
                status: "PAGE_ARTIFACT_CREATED_VERIFIED",
                output: ".jarvis-artifacts/pages/hmh.html"
            };
        },
        storage: memoryStorage()
    });

    assert.equal(mission.status, "COMPLETED");
    assert.deepEqual(preparedPage, pageInput);
});

test("spreadsheet observations preserve only validated executable blueprint metadata", () => {
    const observation =
        __test.safeObservation({
            ok:
                true,
            status:
                "SPREADSHEET_BLUEPRINT_READY",
            title:
                "APU",
            sheets: [{
                name:
                    "APU",
                rows: [
                    [
                        "Concepto",
                        "Importe"
                    ],
                    [
                        "Block",
                        "=2*10"
                    ]
                ]
            }],
            formulaCount:
                1,
            formulaValidationPassed:
                true
        });

    assert.equal(
        observation
            .preparedArtifact
            .kind,
        "spreadsheet"
    );
    assert.equal(
        observation
            .preparedArtifact
            .formulaCount,
        1
    );
    assert.equal(
        observation
            .preparedArtifact
            .formulaValidationPassed,
        true
    );
});

test("mission persistence strips large document bodies and migrates legacy quota pressure", async () => {
    const legacyContent =
        "LEGACY_DOCUMENT_BODY_".repeat(
            7000
        );
    const legacyMission = {
        missionId:
            "MISSION-LEGACY",
        completedTasks: [{
            name:
                "document.compose",
            observation: {
                preparedArtifact: {
                    kind:
                        "document",
                    content:
                        legacyContent
                }
            }
        }],
        observations: []
    };
    const storage =
        quotaStorage({
            initial:
                JSON.stringify([
                    legacyMission
                ]),
            maximum:
                60000
        });
    const currentContent =
        "Contenido operativo verificable con responsables y evidencia. "
            .repeat(
                6000
            );
    const mission =
        await runJarvisMission({
            instruction:
                "Compone un documento largo sin publicarlo.",
            initialToolCalls: [{
                name:
                    "document.compose",
                args:
                    {}
            }],
            requiredToolNames: [
                "document.compose"
            ],
            planner:
                async () => ({
                    toolCalls:
                        [],
                    missionComplete:
                        true
                }),
            execute:
                async () => ({
                    ok:
                        true,
                    status:
                        "DOCUMENT_CONTENT_COMPOSED",
                    title:
                        "Manual",
                    format:
                        "docx",
                    content:
                        currentContent,
                    wordCount:
                        36000,
                    completionMarkerPresent:
                        true,
                    compositionComplete:
                        true,
                    validationPassed:
                        true,
                    contract: {
                        minWords:
                            4500
                    }
                }),
            storage
        });

    assert.equal(
        mission.completedTasks[0]
            .observation
            .preparedArtifact
            .content,
        currentContent
    );

    const raw =
        storage.getItem(
            "jarvis.missions.v1"
        );
    assert.ok(
        raw.length <
        60000
    );
    assert.equal(
        raw.includes(
            legacyContent
        ),
        false
    );
    assert.equal(
        raw.includes(
            currentContent
        ),
        false
    );

    const persisted =
        JSON.parse(
            raw
        );
    const persistedLegacy =
        persisted.find(item =>
            item.missionId ===
            "MISSION-LEGACY"
        );
    const persistedCurrent =
        persisted.find(item =>
            item.missionId ===
            mission.missionId
        );
    assert.equal(
        persistedLegacy
            .completedTasks[0]
            .observation
            .preparedArtifact
            .contentPersisted,
        false
    );
    assert.equal(
        persistedLegacy
            .completedTasks[0]
            .observation
            .preparedArtifact
            .contentLength,
        legacyContent.length
    );
    assert.equal(
        persistedCurrent
            .completedTasks[0]
            .observation
            .preparedArtifact
            .contentPersisted,
        false
    );
    assert.equal(
        persistedCurrent
            .completedTasks[0]
            .observation
            .preparedArtifact
            .contentLength,
        currentContent.length
    );
});

test("routing compaction is deterministic and does not replace the authority instruction", () => {
    const instruction = "A".repeat(20000);
    const routing = __test.compactRoutingInstruction(instruction);
    assert.equal(routing.length, 12000);
    assert.notEqual(routing, instruction);
});


test("mission observations preserve nested diagnostic errors instead of object coercion", () => {
    const observation =
        __test.safeObservation({
            ok: false,
            status: "ERROR",
            error: {
                details: {
                    message:
                        "SPREADSHEET_SCHEMA_INVALID"
                }
            }
        });

    assert.equal(
        observation.executionOk,
        false
    );
    assert.equal(
        observation.error,
        "SPREADSHEET_SCHEMA_INVALID"
    );
    assert.notEqual(
        observation.error,
        "[object Object]"
    );
});



test("media-only required mission closes immediately after successful media analysis without replanning", async () => {
    let plannerCalls = 0;
    const executed = [];
    const mission = await runJarvisMission({
        instruction: "Analiza comparativamente estas dos capturas.",
        initialToolCalls: [{
            name: "media.analyze",
            args: { attachments: [{ name: "one.png" }, { name: "two.png" }] }
        }],
        requiredToolNames: ["media.analyze"],
        planner: async () => {
            plannerCalls += 1;
            return {
                toolCalls: [{ name: "system.certify", args: { deep: true } }],
                missionComplete: false
            };
        },
        execute: async call => {
            executed.push(call.name);
            return {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 2,
                receivedSources: 2,
                sources: [
                    { sourceId: "SOURCE_1", fileName: "one.png", sha256: "1".repeat(64), visibleData: [] },
                    { sourceId: "SOURCE_2", fileName: "two.png", sha256: "2".repeat(64), visibleData: [] }
                ],
                precisionAudit: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                    effectiveToolExecutions: 1,
                    sourceIdentityVerified: true
                }
            };
        },
        storage: memoryStorage()
    });

    assert.deepEqual(executed, ["media.analyze"]);
    assert.equal(plannerCalls, 0);
    assert.equal(mission.status, "COMPLETED");
    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.deepEqual(mission.completedTasks.map(item => item.name), ["media.analyze"]);
    assert.deepEqual(mission.contractMissingTools, []);
});
