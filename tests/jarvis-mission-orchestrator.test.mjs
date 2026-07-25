import assert from "node:assert/strict";
import { test } from "node:test";
import { recoverJarvisMission, runJarvisMission, __test } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
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
    assert.equal(mission.reason, "PARTIAL_CAPABILITY_BLOCKED");
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
                    content
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
        mission.completedTasks[0].observation.preparedArtifact.kind,
        "document"
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

test("routing compaction is deterministic and does not replace the authority instruction", () => {
    const instruction = "A".repeat(20000);
    const routing = __test.compactRoutingInstruction(instruction);
    assert.equal(routing.length, 12000);
    assert.notEqual(routing, instruction);
});
