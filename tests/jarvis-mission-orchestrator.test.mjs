import assert from "node:assert/strict";
import { test } from "node:test";
import {
    recoverJarvisMission,
    runJarvisMission,
    verifiedArtifactDeliveryForMission,
    __test
} from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
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

test("external video authorization is mission-scoped, durable across resume and reused by the same obligation", async () => {
    const storage = memoryStorage();
    let executions = 0;
    const execute = async (_call, context) => {
        executions += 1;
        if (executions === 1) {
            return {
                ok: false,
                status: "EXTERNAL_VIDEO_HUMAN_AUTHORIZATION_REQUIRED",
                blocked: true,
                requiresApproval: true,
                requiresInput: false,
                externalApiUsed: false,
                externalEstimatedCostUsd: 0
            };
        }
        assert.equal(context.externalVideoAuthorization.approved, true);
        assert.equal(context.externalVideoAuthorization.approvedBy, "HEBERTO_MENDOZA");
        assert.equal(context.externalVideoAuthorization.approvalSource, "trusted_runtime_context");
        assert.equal(context.externalVideoAuthorization.missionId, context.missionId);
        assert.equal(context.externalVideoAuthorization.objectiveId, context.objectiveId);
        assert.deepEqual(
            context.missionAuthorizations.externalVideo,
            context.externalVideoAuthorization
        );
        return {
            ok: true,
            executionOk: true,
            objectiveSatisfied: true,
            status: "VIDEO_GENERATED_VERIFIED",
            output: ".jarvis-artifacts/videos/authorized.mp4",
            bytes: 120000,
            sha256: "a".repeat(64),
            physicallyWritten: true,
            verifiedArtifactDelivery: true,
            externalApiUsed: true,
            externalEstimatedCostUsd: 0.25
        };
    };
    const initial = await runJarvisMission({
        instruction: "Genera el video y pide autorización antes de usar Veo.",
        initialToolCalls: [{
            name: "video.generate",
            args: { output: ".jarvis-artifacts/videos/authorized.mp4" }
        }],
        requiredToolNames: ["video.generate"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute,
        storage
    });
    assert.equal(initial.reason, "MISSION_APPROVAL_REQUIRED");
    assert.equal(initial.blockedTasks.length, 1);

    const resumed = await runJarvisMission({
        instruction: "Autorizo expresamente Veo para esta misma obligación.",
        resumeMissionId: initial.missionId,
        trustedMissionAuthorizations: {
            externalVideo: {
                approved: true,
                approvedBy: "HEBERTO_MENDOZA",
                approvedAt: "2026-08-26T20:00:00.000Z",
                operationKey: "video.generate:.jarvis-artifacts/videos/authorized.mp4"
            }
        },
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute,
        storage
    });

    assert.equal(resumed.missionId, initial.missionId);
    assert.equal(resumed.status, "COMPLETED", JSON.stringify({
        reason: resumed.reason,
        pending: resumed.pendingTasks.map(item => [item.name, item.status]),
        blocked: resumed.blockedTasks.map(item => [item.name, item.reason]),
        completed: resumed.completedTasks.map(item => item.name),
        errors: resumed.errors
    }));
    assert.equal(resumed.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(resumed.blockedTasks.length, 0);
    assert.equal(resumed.completedTasks.length, 1);
    assert.equal(resumed.authorizations.externalVideo.missionId, initial.missionId);
    assert.equal(resumed.authorizations.externalVideo.operationKey, "video.generate:.jarvis-artifacts/videos/authorized.mp4");
    assert.equal(executions, 2);
});

test("generalist mission resumes a multimodal tool chain without changing root authority or replanning", async () => {
    const storage = memoryStorage();
    let plannerCalls = 0;
    let researchAttempts = 0;
    let videoAttempts = 0;
    const executedCalls = [];
    const executionContexts = [];
    const attachments = [
        { name: "input.mp4", mimeType: "video/mp4", artifact: ".jarvis-artifacts/uploads/input.mp4", sha256: "1".repeat(64) },
        { name: "narration.wav", mimeType: "audio/wav", artifact: ".jarvis-artifacts/uploads/narration.wav", sha256: "7".repeat(64) },
        { name: "identity-1.png", mimeType: "image/png", artifact: ".jarvis-artifacts/uploads/identity-1.png", sha256: "2".repeat(64) },
        { name: "identity-2.png", mimeType: "image/png", artifact: ".jarvis-artifacts/uploads/identity-2.png", sha256: "3".repeat(64) },
        { name: "identity-3.png", mimeType: "image/png", artifact: ".jarvis-artifacts/uploads/identity-3.png", sha256: "4".repeat(64) },
        { name: "brief.pdf", mimeType: "application/pdf", artifact: ".jarvis-artifacts/uploads/brief.pdf", sha256: "5".repeat(64) },
        { name: "prices.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", artifact: ".jarvis-artifacts/uploads/prices.xlsx", sha256: "6".repeat(64) }
    ];
    const rootInstruction = "Analiza los archivos, investiga la URL, crea campaña, página, video y reel final sin cambiar alcance ni gastar APIs externas.";
    const calls = [
        { name: "media.analyze", args: { attachments } },
        { name: "web.research", args: { query: "competencia", url: "https://example.com" } },
        { name: "marketing.plan", args: { campaignId: "CAMPAIGN-1" } },
        { name: "page.create", args: { output: ".jarvis-artifacts/pages/campaign.html" } },
        { name: "image.generate", args: { output: ".jarvis-artifacts/images/campaign.png" } },
        { name: "video.generate", args: { output: ".jarvis-artifacts/videos/campaign.mp4", referenceOutputs: attachments.slice(2, 5).map(item => item.artifact) } },
        { name: "reel.create", args: { output: ".jarvis-artifacts/reels/campaign.mp4" } }
    ];
    const execute = async (call, context) => {
        executedCalls.push(structuredClone(call));
        executionContexts.push(structuredClone(context));
        if (call.name === "web.research" && researchAttempts++ === 0) {
            return { ok: false, status: "WEB_RESEARCH_TIMEOUT", retryable: true };
        }
        if (call.name === "video.generate" && videoAttempts++ === 0) {
            return {
                ok: false,
                status: "REMOTE_WAN_WORKER_INPUT_REQUIRED",
                blocked: true,
                requiresInput: true,
                missingInputs: ["workerReady"],
                externalApiUsed: false,
                externalEstimatedCostUsd: 0
            };
        }
        const output = call.args?.output || null;
        return {
            ok: true,
            executionOk: true,
            objectiveSatisfied: true,
            status: call.name === "reel.create"
                ? "REEL_VIDEO_CREATED_VERIFIED"
                : call.name === "video.generate"
                    ? "VIDEO_GENERATED_VERIFIED"
                    : "TOOL_COMPLETED_VERIFIED",
            ...(output ? {
                output,
                artifact: output,
                bytes: 120000,
                sha256: "a".repeat(64),
                physicallyWritten: true,
                verifiedArtifactDelivery: true
            } : {}),
            externalApiUsed: false,
            externalEstimatedCostUsd: 0
        };
    };
    const initial = await runJarvisMission({
        instruction: rootInstruction,
        initialToolCalls: calls,
        requiredToolNames: calls.map(call => call.name),
        executionContractLocked: true,
        planner: async () => {
            plannerCalls += 1;
            return { toolCalls: [], missionComplete: true };
        },
        execute,
        storage,
        maximumRetries: 1
    });
    assert.equal(initial.reason, "MISSION_INPUT_REQUIRED");
    assert.equal(initial.blockedTasks[0].name, "video.generate");
    assert.equal(initial.approvedInputs.length, 7);
    const rootHash = initial.rootInstructionHash;

    const resumed = await runJarvisMission({
        instruction: "El worker Wan ya está listo; continúa exactamente la misma misión.",
        resumeMissionId: initial.missionId,
        continuationContext: { workerReady: true },
        planner: async () => {
            plannerCalls += 1;
            return { toolCalls: [], missionComplete: true };
        },
        execute,
        storage,
        maximumRetries: 1
    });

    assert.equal(resumed.status, "COMPLETED", JSON.stringify({
        reason: resumed.reason,
        pending: resumed.pendingTasks.map(item => [item.name, item.status]),
        blocked: resumed.blockedTasks.map(item => [item.name, item.reason]),
        completed: resumed.completedTasks.map(item => item.name),
        errors: resumed.errors
    }));
    assert.equal(resumed.missionId, initial.missionId);
    assert.equal(resumed.objectiveId, initial.objectiveId);
    assert.equal(resumed.rootInstruction, rootInstruction);
    assert.equal(resumed.rootInstructionHash, rootHash);
    assert.equal(resumed.instructionHash, rootHash);
    assert.equal(resumed.planRevision, 0);
    assert.equal(plannerCalls, 0);
    assert.equal(resumed.accounting.semanticExternalCalls, 0);
    assert.equal(resumed.accounting.paidExternalCalls, 0);
    assert.equal(resumed.accounting.externalEstimatedCostUsd, 0);
    assert.equal(researchAttempts, 2);
    assert.equal(videoAttempts, 2);
    assert.equal(resumed.pendingObligations.length, 0);
    assert.equal(resumed.blockedObligations.length, 0);
    assert.equal(resumed.completedObligations.length, 7);
    assert.ok(resumed.artifactLineage.some(item => item.output === ".jarvis-artifacts/videos/campaign.mp4"));
    assert.ok(resumed.artifactLineage.some(item => item.output === ".jarvis-artifacts/reels/campaign.mp4"));
    const reelCall = executedCalls.find(call => call.name === "reel.create");
    assert.ok(reelCall.args.scenes.some(scene => scene.assetOutput === ".jarvis-artifacts/images/campaign.png"));
    assert.ok(reelCall.args.scenes.some(scene => scene.assetOutput === ".jarvis-artifacts/videos/campaign.mp4"));
    const reelContext = executionContexts[executedCalls.findIndex(call => call.name === "reel.create")];
    assert.equal(reelContext.approvedInputs.length, 7);
    assert.ok(reelContext.artifactLineage.some(item => item.output === ".jarvis-artifacts/pages/campaign.html"));
    assert.ok(reelContext.artifactLineage.some(item => item.output === ".jarvis-artifacts/images/campaign.png"));
});

test("repo repair keeps repository branch base SHA and root instruction through patch retry and green tests", async () => {
    const storage = memoryStorage();
    let patchAttempts = 0;
    let semanticCalls = 0;
    const rootInstruction = "Corrige la regresión de carga sin tocar main y cierra con tests verdes.";
    const target = {
        repository: "heberzzt-wq/fixgo-app",
        branch: "v94-media-v4n-negative-claims",
        baseSha: "2e2d5fea927f1ae2e282a22477892cecfbd1e193"
    };
    const mission = await runJarvisMission({
        instruction: rootInstruction,
        initialToolCalls: [
            { name: "repo.read", args: { ...target, file: "jarvis-fs-bridge.js" } },
            { name: "repo.patch", args: { ...target, file: "jarvis-fs-bridge.js", patchId: "PATCH-1" } },
            { name: "tests.run", args: { ...target, command: "npm.cmd run ci:test" } }
        ],
        requiredToolNames: ["repo.read", "repo.patch", "tests.run"],
        executionContractLocked: true,
        planner: async () => {
            semanticCalls += 1;
            return { toolCalls: [], missionComplete: true };
        },
        execute: async call => {
            if (call.name === "repo.patch" && patchAttempts++ === 0) {
                return {
                    ok: false,
                    status: "PATCH_TEST_RED",
                    error: "focused assertion failed",
                    retryable: true,
                    cause: "upload sequence lost durable context"
                };
            }
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: call.name === "tests.run" ? "TESTS_GREEN" : "REPO_ACTION_VERIFIED",
                repository: target.repository,
                branch: target.branch,
                baseSha: target.baseSha,
                headSha: "b".repeat(40)
            };
        },
        storage,
        maximumRetries: 1
    });

    assert.equal(mission.status, "COMPLETED", JSON.stringify({
        reason: mission.reason,
        pending: mission.pendingTasks.map(item => [item.name, item.status]),
        blocked: mission.blockedTasks.map(item => [item.name, item.reason]),
        completed: mission.completedTasks.map(item => item.name),
        errors: mission.errors
    }));
    assert.equal(mission.rootInstruction, rootInstruction);
    assert.deepEqual(mission.repositoryTarget, { ...target, headSha: null });
    assert.equal(mission.completedTasks.find(item => item.name === "repo.patch").attempts, 2);
    assert.equal(patchAttempts, 2);
    assert.equal(semanticCalls, 0);
    assert.equal(mission.blockedObligations.length, 0);
    assert.equal(mission.currentExecutionState.lastValidAction, "tests.run");
});

test("series episode preserves canon references and mission authority across an intermediate video retry", async () => {
    const storage = memoryStorage();
    let videoAttempts = 0;
    const references = [
        ".jarvis-artifacts/series/SERIES-1/characters/HEBERTO-1.png",
        ".jarvis-artifacts/series/SERIES-1/characters/HEBERTO-2.png",
        ".jarvis-artifacts/series/SERIES-1/characters/HEBERTO-3.png"
    ];
    const rootInstruction = "Genera el episodio 8 respetando canon, personajes y continuidad y entrega el MP4 físico.";
    const seen = [];
    const mission = await runJarvisMission({
        instruction: rootInstruction,
        initialToolCalls: [
            { name: "series.resume", args: { seriesId: "SERIES-1", episodeId: "EP-8" } },
            { name: "video.generate", args: { seriesId: "SERIES-1", episodeId: "EP-8", referenceOutputs: references, output: ".jarvis-artifacts/videos/series-1-ep-8.mp4" } },
            { name: "reel.create", args: { seriesId: "SERIES-1", episodeId: "EP-8", output: ".jarvis-artifacts/reels/series-1-ep-8.mp4" } }
        ],
        requiredToolNames: ["series.resume", "video.generate", "reel.create"],
        executionContractLocked: true,
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async call => {
            seen.push(structuredClone(call));
            if (call.name === "video.generate" && videoAttempts++ === 0) {
                return { ok: false, status: "REMOTE_WAN_POLL_TIMEOUT", retryable: true };
            }
            const output = call.args?.output || null;
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: output ? "VIDEO_GENERATED_VERIFIED" : "SERIES_CONTEXT_VERIFIED",
                seriesId: "SERIES-1",
                episodeId: "EP-8",
                referenceOutputs: references,
                ...(output ? {
                    output,
                    artifact: output,
                    bytes: 120000,
                    sha256: "c".repeat(64),
                    physicallyWritten: true,
                    verifiedArtifactDelivery: true
                } : {})
            };
        },
        storage,
        maximumRetries: 1
    });

    const videoCalls = seen.filter(call => call.name === "video.generate");
    assert.equal(mission.status, "COMPLETED", JSON.stringify({
        reason: mission.reason,
        pending: mission.pendingTasks.map(item => [item.name, item.status]),
        blocked: mission.blockedTasks.map(item => [item.name, item.reason]),
        completed: mission.completedTasks.map(item => item.name),
        errors: mission.errors
    }));
    assert.equal(videoCalls.length, 2);
    assert.deepEqual(videoCalls[0].args.referenceOutputs, references);
    assert.deepEqual(videoCalls[1].args.referenceOutputs, references);
    assert.equal(videoCalls[0].args.seriesId, "SERIES-1");
    assert.equal(videoCalls[1].args.episodeId, "EP-8");
    const reelCall = seen.find(call => call.name === "reel.create");
    assert.ok(reelCall.args.scenes.some(scene =>
        scene.assetOutput === ".jarvis-artifacts/videos/series-1-ep-8.mp4" &&
        scene.verifiedMissionArtifact === true
    ));
    assert.equal(mission.rootInstruction, rootInstruction);
    assert.equal(mission.blockedObligations.length, 0);
    assert.ok(mission.artifactLineage.some(item => item.output === ".jarvis-artifacts/videos/series-1-ep-8.mp4"));
    assert.ok(mission.artifactLineage.some(item => item.output === ".jarvis-artifacts/reels/series-1-ep-8.mp4"));
});

test("deadline after the final verified obligation reconciles as completed", async () => {
    const mission = await runJarvisMission({
        instruction: "Genera y entrega un artefacto fisico.",
        initialToolCalls: [{ name: "artifact.create", args: { title: "Entrega" } }],
        requiredToolNames: ["artifact.create"],
        executionContractLocked: true,
        planner: async () => assert.fail("completed contract must reconcile before replanning"),
        execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 150));
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "VIDEO_GENERATED_VERIFIED",
                physicallyWritten: true,
                verifiedArtifactDelivery: true,
                output: ".jarvis-artifacts/videos/final.mp4",
                bytes: 120000,
                sha256: "a".repeat(64)
            };
        },
        storage: memoryStorage(),
        timeoutMs: 100
    });

    assert.equal(mission.status, "COMPLETED");
    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(mission.completedTasks.length, 1);
    assert.equal(mission.blockedTasks.length, 0);
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
            tone: "claro, confiable y profesional",
            metrics: ["solicitudes", "conversaciones calificadas", "conversión", "costo por lead"],
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
            pain: "Dificultad para encontrar profesionales confiables con seguimiento",
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



test("media-only required mission closes deterministically without another semantic audit", async () => {
    let plannerCalls = 0;
    const executed = [];
    const mission = await runJarvisMission({
        instruction: "Analiza comparativamente estas dos capturas.",
        initialToolCalls: [{
            name: "media.analyze",
            args: { attachments: [{ name: "one.png" }, { name: "two.png" }] }
        }],
        requiredToolNames: ["media.analyze"],
        executionContractLocked: true,
        planner: async () => {
            plannerCalls += 1;
            return {
                toolCalls: [],
                missionComplete: true,
                completionAssessment: {
                    completed: ["media.analyze"],
                    missing: []
                }
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

test("mission archives an earlier blocked speech attempt after verified recovery", async () => {
    let speechAttempt = 0;
    const mission = await runJarvisMission({
        instruction: "Genera una narracion verificable y recupera automaticamente una voz disponible.",
        initialToolCalls: [
            { name: "speech.synthesize", args: { text: "Primer intento", language: "es-MX" } },
            { name: "speech.synthesize", args: { text: "Segundo intento", language: "es" } }
        ],
        requiredToolNames: ["speech.synthesize"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async () => {
            speechAttempt += 1;
            if (speechAttempt === 1) {
                return {
                    ok: false,
                    executionOk: true,
                    objectiveSatisfied: false,
                    blocked: true,
                    retryable: false,
                    status: "SPEECH_LANGUAGE_VOICE_NOT_FOUND",
                    error: "SPEECH_LANGUAGE_VOICE_NOT_FOUND"
                };
            }
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "SPEECH_AUDIO_CREATED_VERIFIED",
                output: ".jarvis-artifacts/audio/recovered.wav",
                mimeType: "audio/wav",
                bytes: 2048,
                sha256: "a".repeat(64)
            };
        },
        storage: memoryStorage()
    });

    assert.equal(mission.completedTasks.some(item => item.name === "speech.synthesize"), true);
    assert.equal(mission.blockedTasks.some(item => item.name === "speech.synthesize"), false);
    assert.equal(mission.errors.some(item => item.tool === "speech.synthesize"), false);
    assert.equal(mission.recoveredToolAttempts.length, 1);
    assert.equal(mission.recoveredToolAttempts[0].observation.status, "SPEECH_LANGUAGE_VOICE_NOT_FOUND");
    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
});

test("mission generically archives an earlier blocked attempt after the same obligation is verified", async () => {
    let attempt = 0;
    const mission = await runJarvisMission({
        instruction: "Entrega un artefacto fisico y conserva el primer fallo solamente como historial.",
        initialToolCalls: [
            {
                name: "artifact.render",
                args: { artifactRequirementId: "REQUIREMENT_PRIMARY", format: "mp4", quality: "draft" }
            },
            {
                name: "artifact.render",
                args: { artifactRequirementId: "REQUIREMENT_PRIMARY", format: "mp4", quality: "final" }
            }
        ],
        requiredToolNames: ["artifact.render"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async call => {
            attempt += 1;
            if (attempt === 1) {
                return {
                    ok: false,
                    executionOk: false,
                    objectiveSatisfied: false,
                    blocked: true,
                    retryable: false,
                    status: "ARTIFACT_PROVIDER_TEMPORARILY_BLOCKED",
                    error: "ARTIFACT_PROVIDER_TEMPORARILY_BLOCKED"
                };
            }
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "ARTIFACT_RENDERED_VERIFIED",
                output: ".jarvis-artifacts/videos/recovered.mp4",
                mimeType: "video/mp4",
                physicallyWritten: true,
                bytes: 120000,
                sha256: "d".repeat(64),
                artifactRequirementId: call.args.artifactRequirementId
            };
        },
        storage: memoryStorage()
    });

    assert.equal(mission.completedTasks.length, 1);
    assert.equal(mission.blockedTasks.length, 0);
    assert.equal(mission.errors.length, 0);
    assert.equal(mission.recoveredToolAttempts.length, 1);
    assert.equal(
        mission.recoveredToolAttempts[0].observation.status,
        "ARTIFACT_PROVIDER_TEMPORARILY_BLOCKED"
    );
    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(mission.status, "COMPLETED");
    assert.equal(verifiedArtifactDeliveryForMission({
        completedUserArtifactTasks: mission.completedTasks,
        unresolvedUserArtifactTasks: [
            ...mission.blockedTasks,
            ...mission.pendingTasks
        ]
    }), true);
});

test("verified artifact delivery remains false without a physical MP4", () => {
    assert.equal(verifiedArtifactDeliveryForMission({
        completedUserArtifactTasks: [{
            name: "video.generate",
            observation: {
                objectiveSatisfied: true,
                output: ".jarvis-artifacts/videos/missing.mp4",
                mimeType: "video/mp4",
                physicallyWritten: false,
                bytes: 0,
                sha256: ""
            }
        }],
        unresolvedUserArtifactTasks: []
    }), false);
});

test("restart guard rejects a second full generation for the same obligation without an independent replan", () => {
    const blocked = {
        name: "video.generate",
        args: {
            artifactRequirementId: "VIDEO_PRIMARY",
            output: ".jarvis-artifacts/videos/primary.mp4"
        },
        signature: "blocked-signature",
        observation: {
            status: "VIDEO_GENERATION_RAI_FILTERED",
            operationName: "operations/primary",
            fullRestartAllowed: false
        }
    };
    const mission = {
        completedTasks: [],
        pendingTasks: [],
        blockedTasks: [blocked]
    };

    assert.deepEqual(__test.trustedCalls([{
        name: "video.generate",
        args: {
            artifactRequirementId: "VIDEO_PRIMARY",
            output: ".jarvis-artifacts/videos/primary-retry.mp4"
        }
    }], mission), []);

    const independent = __test.trustedCalls([{
        name: "video.generate",
        args: {
            artifactRequirementId: "VIDEO_INDEPENDENT",
            output: ".jarvis-artifacts/videos/independent.mp4"
        },
        independentReplanReason: "USER_REQUESTED_DISTINCT_ARTIFACT"
    }], mission);
    assert.equal(independent.length, 1);
    assert.equal(independent[0].independentReplanReason, "USER_REQUESTED_DISTINCT_ARTIFACT");
});

test("reel creation receives the verified speech artifact instead of a stale planned path", async () => {
    let reelArgs = null;
    const verifiedAudio = ".jarvis-artifacts/audio/physical-verified.wav";
    const mission = await runJarvisMission({
        instruction: "Produce narracion y reel fisico usando el audio verificado de esta misma mision.",
        initialToolCalls: [
            {
                name: "speech.synthesize",
                args: {
                    text: "Narracion real",
                    output: "audio-inventado.wav"
                }
            },
            {
                name: "reel.create",
                args: {
                    brandName: "Taqueria El Dorado",
                    title: "Taco Macho",
                    cta: "Visitanos",
                    durationSeconds: 30,
                    audioOutput: ".jarvis-artifacts/audio/stale-missing.wav",
                    scenes: [
                        { durationSeconds: 10, overlay: "Uno", mediaType: "image", assetDataUrl: "data:image/jpeg;base64,/9j/" },
                        { durationSeconds: 10, overlay: "Dos", mediaType: "image", assetDataUrl: "data:image/jpeg;base64,/9j/" },
                        { durationSeconds: 10, overlay: "Tres", mediaType: "image", assetDataUrl: "data:image/jpeg;base64,/9j/" }
                    ]
                }
            }
        ],
        requiredToolNames: ["speech.synthesize", "reel.create"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async call => {
            if (call.name === "speech.synthesize") {
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "SPEECH_AUDIO_CREATED_VERIFIED",
                    output: verifiedAudio,
                    mimeType: "audio/wav",
                    bytes: 4096,
                    sha256: "b".repeat(64)
                };
            }
            if (call.name === "reel.create") {
                reelArgs = structuredClone(call.args);
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "REEL_VIDEO_CREATED_VERIFIED",
                    output: ".jarvis-artifacts/reels/taco-macho.mp4",
                    mimeType: "video/mp4",
                    bytes: 8192,
                    sha256: "c".repeat(64)
                };
            }
            return { ok: false, status: "UNEXPECTED_TOOL" };
        },
        storage: memoryStorage()
    });

    assert.equal(reelArgs?.audioOutput, verifiedAudio);
    assert.equal(mission.completedTasks.some(item => item.name === "speech.synthesize"), true);
    assert.equal(mission.completedTasks.some(item => item.name === "reel.create"), true);
    assert.equal(mission.blockedTasks.length, 0);
});

test("mission accounting keeps local inference, paid calls and GPU rental distinct", async () => {
    let receivedContext = null;
    const mission = await runJarvisMission({
        instruction: "Ejecuta una capacidad conocida sin APIs pagadas y registra su costo real.",
        initialToolCalls: [{
            name: "video.generate",
            obligationId: "VIDEO_ZERO_API",
            args: { output: ".jarvis-artifacts/videos/zero-api.mp4" }
        }],
        requiredToolNames: ["video.generate"],
        executionContractLocked: true,
        planner: async () => {
            throw new Error("PLANNER_MUST_NOT_RUN_FOR_LOCKED_CONTRACT");
        },
        execute: async (_call, context) => {
            receivedContext = context;
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "VIDEO_GENERATED_VERIFIED",
                output: ".jarvis-artifacts/videos/zero-api.mp4",
                mimeType: "video/mp4",
                bytes: 120000,
                sha256: "9".repeat(64),
                physicallyWritten: true,
                provider: "self-hosted",
                backend: "wan22-ti2v-5b",
                localSemanticInferenceCalls: 1,
                semanticExternalCalls: 0,
                paidExternalCalls: 0,
                externalEstimatedCostUsd: 0,
                externalActualCostUsd: 0,
                gpuRentalSeconds: 42,
                gpuRentalEstimatedCost: 0.021,
                gpuRentalActualCost: 0.02
            };
        },
        storage: memoryStorage()
    });

    assert.equal(receivedContext.obligationId, "VIDEO_ZERO_API");
    assert.equal(mission.status, "COMPLETED");
    assert.equal(mission.accounting.localSemanticInferenceCalls, 1);
    assert.equal(mission.accounting.semanticExternalCalls, 0);
    assert.equal(mission.accounting.paidExternalCalls, 0);
    assert.equal(mission.accounting.externalEstimatedCostUsd, 0);
    assert.equal(mission.accounting.gpuRentalSeconds, 42);
    assert.equal(mission.accounting.gpuRentalEstimatedCost, 0.021);
    assert.equal(mission.accounting.gpuRentalActualCost, 0.02);
    assert.deepEqual(mission.accounting.providers, ["self-hosted"]);
    assert.deepEqual(mission.accounting.backends, ["wan22-ti2v-5b"]);
});
