import test from "node:test";
import assert from "node:assert/strict";

import {
    runJarvisMission
} from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";

const requirements = [
    { id: "plan-md", type: "document", toolName: "document.create", format: "md", label: "Plan MD" },
    { id: "plan-pdf", type: "document", toolName: "document.create", format: "pdf", label: "Plan PDF" },
    { id: "plan-xlsx", type: "spreadsheet", toolName: "document.create", format: "xlsx", label: "Plan XLSX" },
    { id: "social-instagram", type: "social", toolName: "image.edit", label: "Instagram" },
    { id: "social-facebook", type: "social", toolName: "image.edit", label: "Facebook" },
    { id: "social-tiktok", type: "social", toolName: "image.edit", label: "TikTok" },
    { id: "reel-main", type: "reel", toolName: "reel.create", label: "Reel" }
];

const completePlan = {
    executiveSummary: "Resumen",
    assumptions: [{ field: "none" }],
    businessDiagnosis: "Diagnóstico",
    smartObjectives: ["Objetivo"],
    targetAudience: { primary: "Empresas" },
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
    executionCalendar: [{ day: 1, stage: "awareness", format: "reel", topic: "Tema", channels: ["instagram"] }],
    conversionAndCta: { primaryCta: "Contacta" },
    retentionAndReferrals: ["seguimiento"],
    budgetScenarios: [{ scenario: "pending" }],
    kpisAndMeasurement: [{ metric: "leads", cadence: "semanal", source: "CRM" }],
    experiments: ["A/B"],
    actionPlan306090: { days30: ["Medir"], days60: ["Optimizar"], days90: ["Escalar"] },
    risksAndMitigations: [{ risk: "riesgo", mitigation: "mitigar" }],
    prioritizedNextSteps: ["seguir"]
};

function outputFor(name, args = {}) {
    const id = args.marketingRequirementId || args.variantId || name.replaceAll(".", "-");
    if (name === "document.create") return `.jarvis-artifacts/documents/${id}.${args.format || "bin"}`;
    if (name === "image.edit") return `.jarvis-artifacts/images/${id}.png`;
    if (name === "reel.create") return `.jarvis-artifacts/reels/${id}.mp4`;
    return `.jarvis-artifacts/${id}.json`;
}

test("completed marketing.plan deterministically schedules all seven declared physical requirements with unique identities", async () => {
    const executed = [];
    const mission = await runJarvisMission({
        instruction: "Produce plan MD, PDF, XLSX, tres piezas sociales distintas y un reel narrado con medios reales.",
        initialToolCalls: [
            {
                name: "marketing.plan",
                args: {
                    productionRequested: true,
                    productionArtifacts: requirements
                }
            },
            {
                name: "web.media.collect",
                args: { url: "https://example.com", requireAnyVisual: true }
            }
        ],
        requiredToolNames: ["marketing.plan", "web.media.collect"],
        maximumSteps: 12,
        planner: async () => ({
            missionComplete: true,
            toolCalls: []
        }),
        execute: async call => {
            executed.push({ name: call.name, args: structuredClone(call.args || {}) });
            if (call.name === "marketing.plan") {
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "MARKETING_PACKAGE_READY",
                    planReady: true,
                    readyForProduction: true,
                    productionRequested: true,
                    requiredArtifacts: requirements,
                    userVisible: "# Plan de marketing\nContenido completo",
                    plan: completePlan
                };
            }
            if (call.name === "web.media.collect") {
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "REAL_WEB_MEDIA_COLLECTED",
                    requirementsMet: true,
                    mediaAssets: [
                        {
                            kind: "image",
                            output: ".jarvis-artifacts/web-media/emblema-oficial.png",
                            mimeType: "image/png",
                            bytes: 1000,
                            sha256: "a".repeat(64),
                            sourceUrl: "https://example.com/emblema-oficial.png",
                            alt: "Logo oficial"
                        },
                        {
                            kind: "image",
                            output: ".jarvis-artifacts/web-media/foto-real.jpg",
                            mimeType: "image/jpeg",
                            bytes: 5000,
                            sha256: "b".repeat(64),
                            sourceUrl: "https://example.com/foto-real.jpg",
                            alt: "Fotografía real"
                        }
                    ]
                };
            }
            const artifact = outputFor(call.name, call.args);
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "ARTIFACT_CREATED_VERIFIED",
                artifact,
                output: artifact,
                evidence: { output: artifact }
            };
        }
    });

    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(mission.status, "COMPLETED");
    assert.equal(mission.unresolvedProductionArtifacts?.length || 0, 0);

    const physical = executed.filter(item =>
        ["document.create", "image.edit", "reel.create"].includes(item.name)
    );
    assert.equal(physical.length, 7);

    const identities = physical.map(item => item.args.marketingRequirementId);
    assert.equal(new Set(identities).size, 7);
    assert.deepEqual(
        [...identities].sort(),
        requirements.map(item => item.id).sort()
    );

    const docs = physical.filter(item => item.name === "document.create");
    assert.equal(docs.length, 3);
    assert.ok(docs.every(item => item.args.contentSource === "marketing.plan"));

    const socials = physical.filter(item => item.name === "image.edit");
    assert.equal(socials.length, 3);
    assert.equal(new Set(socials.map(item => item.args.variantId)).size, 3);
    assert.ok(socials.every(item => item.args.identityMode === "brand-scene"));

    assert.equal(mission.marketingProductionContract?.requirementCount, 7);
});
