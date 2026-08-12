import assert from "node:assert/strict";
import { test } from "node:test";

import { planMarketingRequest } from "../gestia-core/jarvis/jarvis.marketing.engine.js";
import { marketingFinalResponseFromMission } from "../gestia-core/jarvis/jarvis.marketing.presenter.js";
import { runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
    };
}

const context = {
    brandName: "Multiservicios Peninsulares HMH",
    audience: "hogares, administradores y pequeños negocios que necesitan servicios confiables",
    offer: "coordinación de multiservicios para hogares y negocios",
    pain: "dificultad para encontrar proveedores confiables y dar seguimiento al servicio",
    promise: "una experiencia de solicitud y seguimiento más clara",
    differentiator: "coordinación digital, trazabilidad y seguimiento del servicio",
    cta: "Solicita información o un servicio",
    market: "Cancún, Quintana Roo",
    campaignObjective: "generar conversaciones calificadas y solicitudes de servicio",
    horizon: "90 días",
    tone: "claro, confiable y profesional",
    metrics: ["conversaciones calificadas", "solicitudes", "conversión", "costo por lead"],
    channels: ["Instagram", "Facebook", "TikTok", "WhatsApp"],
    productionRequested: true,
    productionArtifacts: [
        { id: "reel", type: "reel", toolName: "reel.create", label: "Reel 9:16" },
        { id: "landing", type: "landing_page", toolName: "page.create", label: "Landing HTML" },
        { id: "flyer", type: "flyer", toolName: "image.generate", label: "Imagen publicitaria" }
    ]
};

test("marketing plan alone can never satisfy a real production mission", () => {
    const plan = planMarketingRequest("Misión integral de marketing con producción real.", context);
    assert.equal(plan.status, "MARKETING_PACKAGE_READY");
    assert.equal(plan.planReady, true);
    assert.equal(plan.productionRequested, true);
    assert.equal(plan.requiredArtifacts.length, 3);

    const response = marketingFinalResponseFromMission({
        completedTasks: [{
            name: "marketing.plan",
            args: {},
            observation: {
                status: plan.status,
                objectiveSatisfied: true,
                planReady: plan.planReady,
                productionRequested: plan.productionRequested,
                requiredArtifacts: plan.requiredArtifacts,
                userVisible: plan.userVisible
            }
        }],
        blockedTasks: [],
        pendingTasks: []
    });

    assert.equal(response.ok, false);
    assert.equal(response.unresolvedArtifacts.length, 3);
    assert.equal(response.text.includes("Producción pendiente"), true);
    assert.equal(response.text.includes("REEL 9:16"), true);
    assert.equal(response.text.includes("LANDING HTML"), true);
    assert.equal(response.text.includes("IMAGEN PUBLICITARIA"), true);
});

test("marketing final response turns green only when every required artifact has a verified output", () => {
    const plan = planMarketingRequest("Misión integral de marketing con producción real.", context);
    const completedTasks = [
        {
            name: "marketing.plan",
            args: {},
            observation: {
                status: plan.status,
                objectiveSatisfied: true,
                planReady: true,
                productionRequested: true,
                requiredArtifacts: plan.requiredArtifacts,
                userVisible: plan.userVisible
            }
        },
        { name: "reel.create", args: {}, observation: { output: ".jarvis-artifacts/reels/hmh.html" } },
        { name: "page.create", args: {}, observation: { output: ".jarvis-artifacts/pages/hmh.html" } },
        { name: "image.generate", args: {}, observation: { output: ".jarvis-artifacts/images/hmh.png" } }
    ];
    const response = marketingFinalResponseFromMission({ completedTasks, blockedTasks: [], pendingTasks: [] });
    assert.equal(response.ok, true);
    assert.equal(response.unresolvedArtifacts.length, 0);
    assert.equal(response.producedArtifacts.length, 3);
    assert.equal(response.text.includes("Archivos producidos y verificados"), true);
});

test("human marketing output never leaks internal planning metadata or claims briefs are produced files", () => {
    const plan = planMarketingRequest("Misión integral de marketing con producción real.", context);
    for (const forbidden of [
        "instruction_inference",
        "factual Claim",
        "editable: true",
        "evidence Policy",
        "draft_for_owner_review",
        "Producción creativa incluida"
    ]) {
        assert.equal(plan.userVisible.includes(forbidden), false, forbidden);
    }
    assert.equal(plan.userVisible.includes("Piezas preparadas para producción"), true);
    assert.equal(plan.userVisible.includes("No significa que los archivos finales ya hayan sido creados"), true);
});

test("generic local marketing defaults are rejected when semantic brief is incomplete", () => {
    const result = planMarketingRequest("Prepara marketing.", {
        brandName: "Multiservicios Peninsulares HMH"
    });
    assert.equal(result.status, "MARKETING_SEMANTIC_BRIEF_INCOMPLETE");
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.retryable, true);
});

test("mission contract expands from structured marketing requirements and asks the same planner for real tools", async () => {
    const plannedStates = [];
    const executed = [];
    const requirements = context.productionArtifacts;
    const mission = await runJarvisMission({
        instruction: "Misión integral de marketing con producción real.",
        initialToolCalls: [{ name: "marketing.plan", args: {} }],
        requiredToolNames: ["marketing.plan"],
        planner: async ({ mission: current }) => {
            plannedStates.push(structuredClone(current));
            const done = new Set(current.completedTasks.map(item => item.name));
            const nextRequirement = requirements.find(item => !done.has(item.toolName));
            const args = nextRequirement?.toolName === "reel.create"
                ? {
                    brandName: "Multiservicios Peninsulares HMH",
                    durationSeconds: 30,
                    scenes: [{
                        durationSeconds: 30,
                        overlay: "Servicio verificado",
                        assetOutput: ".jarvis-artifacts/web-media/marketing-fixture/primary.mp4"
                    }]
                }
                : {};
            return nextRequirement
                ? { toolCalls: [{ name: nextRequirement.toolName, args }], missionComplete: false }
                : { toolCalls: [], missionComplete: true };
        },
        execute: async call => {
            executed.push(call.name);
            if (call.name === "marketing.plan") {
                const plan = planMarketingRequest("Misión integral de marketing con producción real.", context);
                return {
                    ok: true,
                    status: plan.status,
                    objectiveSatisfied: true,
                    planReady: true,
                    readyForProduction: true,
                    productionRequested: true,
                    requiredArtifacts: plan.requiredArtifacts,
                    plan: plan.plan,
                    userVisible: plan.userVisible
                };
            }
            return { ok: true, status: "COMPLETED", objectiveSatisfied: true, output: `.jarvis-artifacts/${call.name}.artifact` };
        },
        storage: memoryStorage(),
        maximumSteps: 10
    });

    assert.deepEqual(executed, ["marketing.plan", "reel.create", "page.create", "image.generate"]);
    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(mission.requiredToolNames.includes("reel.create"), true);
    assert.equal(mission.requiredToolNames.includes("page.create"), true);
    assert.equal(mission.requiredToolNames.includes("image.generate"), true);
    assert.equal(plannedStates.length >= 3, true);
});
