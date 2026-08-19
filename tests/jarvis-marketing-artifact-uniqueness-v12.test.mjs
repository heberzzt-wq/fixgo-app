import test from "node:test";
import assert from "node:assert/strict";

import {
    marketingFinalResponseFromMission
} from "../gestia-core/jarvis/jarvis.marketing.presenter.js";
import {
    runJarvisMission
} from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";

const socialRequirements = [
    { id: "social-instagram", type: "social", toolName: "image.edit", label: "Instagram" },
    { id: "social-facebook", type: "social", toolName: "image.edit", label: "Facebook" },
    { id: "social-tiktok", type: "social", toolName: "image.edit", label: "TikTok" }
];

const completePlan = {
    executiveSummary: "Resumen",
    assumptions: [{ field: "none" }],
    businessDiagnosis: "Diagnóstico",
    smartObjectives: ["Objetivo"],
    targetAudience: { primary: "Audiencia" },
    customerProblem: "Problema",
    valueProposition: "Valor",
    positioningAndMessages: { positioning: "Posicionamiento" },
    offerStrategy: { offer: "Oferta" },
    competitiveAnalysis: { note: "Sin inventar" },
    customerJourneyAndFunnel: [{ stage: "awareness" }],
    acquisitionStrategy: "Adquisición",
    priorityChannels: [{ channel: "instagram" }],
    contentStrategy: "Contenido",
    contentPillars: ["proceso"],
    campaignExamples: [{ channel: "instagram", hook: "Hook", body: "Body", cta: "Contacta" }],
    executionCalendar: [{ day: 1, stage: "awareness", format: "post", topic: "Tema", channels: ["instagram"] }],
    conversionAndCta: { primaryCta: "Contacta" },
    retentionAndReferrals: ["seguimiento"],
    budgetScenarios: [{ scenario: "pending" }],
    kpisAndMeasurement: [{ metric: "leads" }],
    experiments: ["A/B"],
    actionPlan306090: { days30: ["Medir"], days60: ["Optimizar"], days90: ["Escalar"] },
    risksAndMitigations: [{ risk: "riesgo", mitigation: "mitigar" }],
    prioritizedNextSteps: ["seguir"]
};

function marketingTask() {
    return {
        name: "marketing.plan",
        args: {},
        observation: {
            status: "MARKETING_PACKAGE_READY",
            objectiveSatisfied: true,
            planReady: true,
            productionRequested: true,
            requiredArtifacts: socialRequirements,
            userVisible: "# Plan de marketing\nContenido verificado"
        }
    };
}

function duplicatedSocialTask(id) {
    return {
        name: "image.edit",
        args: {
            marketingRequirementId: id,
            variantId: id
        },
        observation: {
            objectiveSatisfied: true,
            status: "IMAGE_EDITED",
            artifact: ".jarvis-artifacts/images/mismo-collage.png",
            output: ".jarvis-artifacts/images/mismo-collage.png",
            outputSha256: "d".repeat(64),
            evidence: {
                output: ".jarvis-artifacts/images/mismo-collage.png",
                outputSha256: "d".repeat(64)
            }
        }
    };
}

test("three tagged social requirements cannot be declared complete with the same physical image", () => {
    const response = marketingFinalResponseFromMission({
        completedTasks: [
            marketingTask(),
            ...socialRequirements.map(item => duplicatedSocialTask(item.id))
        ],
        blockedTasks: [],
        pendingTasks: []
    });

    assert.equal(response.ok, false);
    assert.equal(response.producedArtifacts.length, 1);
    assert.equal(response.unresolvedArtifacts.length, 2);
    assert.ok(response.unresolvedArtifacts.every(item => item.reason === "ARTEFACTO_FISICO_DUPLICADO"));
});

test("mission completion stays fail-closed when distinct requirement ids point to duplicate physical bytes", async () => {
    let plannerCursor = 0;
    const mission = await runJarvisMission({
        instruction: "Produce tres piezas sociales distintas.",
        initialToolCalls: [{
            name: "marketing.plan",
            args: {
                productionRequested: true,
                productionArtifacts: socialRequirements
            }
        }],
        requiredToolNames: ["marketing.plan"],
        maximumSteps: 8,
        planner: async () => {
            if (plannerCursor < socialRequirements.length) {
                const requirement = socialRequirements[plannerCursor++];
                return {
                    missionComplete: false,
                    toolCalls: [{
                        name: "image.edit",
                        args: {
                            marketingRequirementId: requirement.id,
                            variantId: requirement.id,
                            sourceOutput: ".jarvis-artifacts/web-media/foto-real.jpg",
                            identityMode: "brand-scene",
                            prompt: requirement.label
                        }
                    }]
                };
            }
            return {
                missionComplete: true,
                toolCalls: []
            };
        },
        execute: async call => {
            if (call.name === "marketing.plan") {
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "MARKETING_PACKAGE_READY",
                    planReady: true,
                    readyForProduction: true,
                    productionRequested: true,
                    requiredArtifacts: socialRequirements,
                    userVisible: "# Plan de marketing\nContenido verificado",
                    plan: completePlan
                };
            }
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "IMAGE_EDITED",
                artifact: ".jarvis-artifacts/images/mismo-collage.png",
                output: ".jarvis-artifacts/images/mismo-collage.png",
                outputSha256: "d".repeat(64),
                evidence: {
                    output: ".jarvis-artifacts/images/mismo-collage.png",
                    outputSha256: "d".repeat(64)
                }
            };
        }
    });

    assert.notEqual(mission.status, "COMPLETED");
    assert.equal(mission.unresolvedProductionArtifacts.length, 2);
    assert.ok(mission.unresolvedProductionArtifacts.every(item => item.reason === "DUPLICATE_PHYSICAL_ARTIFACT"));
});
