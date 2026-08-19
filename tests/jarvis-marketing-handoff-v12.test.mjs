import test from "node:test";
import assert from "node:assert/strict";

import {
    ensureExecutableArtifactDependencies
} from "../gestia-core/jarvis/jarvis.mission.dependencies.js";
import {
    marketingArtifactArgsFromCompletedTasks,
    marketingFinalResponseFromMission
} from "../gestia-core/jarvis/jarvis.marketing.presenter.js";
import {
    reelArtifactArgsFromCompletedTasks,
    reelNarrationFromCompletedTasks
} from "../gestia-core/jarvis/jarvis.reel.presenter.js";

function marketingObservation(overrides = {}) {
    const requiredArtifacts = overrides.requiredArtifacts || [
        { id: "plan-md", type: "document", toolName: "document.create", format: "md", label: "Plan MD" },
        { id: "plan-pdf", type: "document", toolName: "document.create", format: "pdf", label: "Plan PDF" },
        { id: "plan-xlsx", type: "spreadsheet", toolName: "document.create", format: "xlsx", label: "Plan XLSX" },
        { id: "social-instagram", type: "social", toolName: "image.generate", label: "Instagram" },
        { id: "social-facebook", type: "social", toolName: "image.generate", label: "Facebook" },
        { id: "social-tiktok", type: "social", toolName: "image.generate", label: "TikTok" },
        { id: "reel-main", type: "reel", toolName: "reel.create", label: "Reel" }
    ];
    const plan = {
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
    return {
        objectiveSatisfied: true,
        status: "MARKETING_PACKAGE_READY",
        planReady: true,
        productionRequested: true,
        requiredArtifacts,
        userVisible: "# Plan de marketing\n\nContenido completo",
        deliverable: plan,
        evidence: {
            brand: { name: "Multiservicios Peninsulares HMH", market: "Quintana Roo" },
            campaign: {
                name: "HMH — campaña de conversión",
                objective: "Generar conversaciones calificadas",
                audience: "Empresas",
                offer: "Servicios verificados",
                cta: "Contacta a HMH"
            },
            plan,
            copies: plan.campaignExamples,
            calendar: plan.executionCalendar,
            videoPackage: {
                durationSeconds: 30,
                aspectRatio: "9:16",
                script: [
                    { section: "hook", text: "Atención" },
                    { section: "pain", text: "Problema" },
                    { section: "offer", text: "Oferta" },
                    { section: "proof", text: "Evidencia" },
                    { section: "cta", text: "Contacta a HMH" }
                ],
                storyboard: [
                    { scene: 1, range: "0-4", purpose: "hook", overlay: "Atención" },
                    { scene: 2, range: "4-11", purpose: "pain", overlay: "Problema" },
                    { scene: 3, range: "11-20", purpose: "offer", overlay: "Oferta" },
                    { scene: 4, range: "20-26", purpose: "proof", overlay: "Evidencia" },
                    { scene: 5, range: "26-30", purpose: "cta", overlay: "Contacta a HMH" }
                ]
            }
        },
        ...overrides
    };
}

function completedMarketing(overrides = {}) {
    return {
        name: "marketing.plan",
        args: {},
        observation: marketingObservation(overrides)
    };
}

test("marketing contract is ordered before media/artifacts and every physical output gets a stable requirement identity", () => {
    const productionArtifacts = marketingObservation().requiredArtifacts;
    const calls = ensureExecutableArtifactDependencies({
        toolCalls: [
            { name: "image.generate", args: { prompt: "IG", output: ".jarvis-artifacts/images/ig.png" } },
            { name: "web.media.collect", args: { url: "https://example.com" } },
            { name: "document.compose", args: { format: "md" } },
            { name: "document.create", args: { format: "pdf" } },
            { name: "marketing.plan", args: { productionRequested: true, productionArtifacts } },
            { name: "image.generate", args: { prompt: "FB", output: ".jarvis-artifacts/images/fb.png" } },
            { name: "spreadsheet.compose", args: { title: "Workbook" } },
            { name: "document.create", args: { format: "xlsx" } },
            { name: "reel.create", args: { title: "Reel" } },
            { name: "document.create", args: { format: "md" } },
            { name: "image.generate", args: { prompt: "TT", output: ".jarvis-artifacts/images/tt.png" } }
        ],
        catalog: [
            { name: "marketing.plan" },
            { name: "web.media.collect" },
            { name: "document.compose" },
            { name: "spreadsheet.compose" },
            { name: "document.create" },
            { name: "image.generate" },
            { name: "image.edit" },
            { name: "reel.create" }
        ]
    });

    const names = calls.map(call => call.name);
    assert.ok(names.indexOf("marketing.plan") < names.indexOf("web.media.collect"));
    assert.equal(names.includes("document.compose"), false);
    assert.equal(names.includes("spreadsheet.compose"), false);

    const documents = calls.filter(call => call.name === "document.create");
    assert.deepEqual(
        documents.map(call => call.args.marketingRequirementId).sort(),
        ["plan-md", "plan-pdf", "plan-xlsx"].sort()
    );
    assert.ok(documents.every(call => call.args.contentSource === "marketing.plan"));

    const socials = calls.filter(call => call.name === "image.edit");
    assert.equal(socials.length, 3);
    assert.deepEqual(
        socials.map(call => call.args.marketingRequirementId).sort(),
        ["social-facebook", "social-instagram", "social-tiktok"].sort()
    );
    assert.equal(new Set(socials.map(call => call.args.variantId)).size, 3);
    assert.ok(socials.every(call => call.args.preserveLogos === true));

    const marketingCall = calls.find(call => call.name === "marketing.plan");
    assert.deepEqual(
        marketingCall.args.productionArtifacts
            .filter(item => item.type === "social")
            .map(item => item.toolName),
        ["image.edit", "image.edit", "image.edit"]
    );

    const reel = calls.find(call => call.name === "reel.create");
    assert.equal(reel.args.marketingRequirementId, "reel-main");
});

test("one untagged social image cannot satisfy three declared social variants", () => {
    const marketing = completedMarketing();
    const mission = {
        completedTasks: [
            marketing,
            {
                name: "image.generate",
                args: { output: ".jarvis-artifacts/images/one.png" },
                observation: { objectiveSatisfied: true, artifact: ".jarvis-artifacts/images/one.png" }
            }
        ],
        blockedTasks: [],
        pendingTasks: []
    };
    const response = marketingFinalResponseFromMission(mission);
    const socialUnresolved = response.unresolvedArtifacts.filter(item =>
        ["social-instagram", "social-facebook", "social-tiktok"].includes(item.id)
    );
    assert.equal(socialUnresolved.length, 3);
    assert.equal(response.producedArtifacts.some(item => item.id === "social-instagram"), false);
});

test("tagged social artifacts satisfy only their own requirement", () => {
    const marketing = completedMarketing();
    const mission = {
        completedTasks: [
            marketing,
            {
                name: "image.generate",
                args: {
                    marketingRequirementId: "social-instagram",
                    variantId: "social-instagram"
                },
                observation: { objectiveSatisfied: true, artifact: ".jarvis-artifacts/images/instagram.png" }
            }
        ],
        blockedTasks: [],
        pendingTasks: []
    };
    const response = marketingFinalResponseFromMission(mission);
    assert.equal(
        response.producedArtifacts.some(item => item.id === "social-instagram"),
        true
    );
    assert.equal(
        response.unresolvedArtifacts.filter(item =>
            ["social-facebook", "social-tiktok"].includes(item.id)
        ).length,
        2
    );
});

test("marketing plan hydrates XLSX with real structured sheets instead of requiring an unrelated composer", () => {
    const marketing = completedMarketing();
    const args = marketingArtifactArgsFromCompletedTasks(
        [marketing],
        {
            format: "xlsx",
            contentSource: "marketing.plan",
            marketingRequirementId: "plan-xlsx"
        }
    );
    assert.equal(args.format, "xlsx");
    assert.equal(args.contentSource, "marketing.plan");
    assert.equal(args.marketingRequirementId, "plan-xlsx");
    assert.ok(Array.isArray(args.sheets));
    assert.ok(args.sheets.length >= 4);
    assert.ok(args.sheets.every(sheet => Array.isArray(sheet.rows) && sheet.rows.length > 1));
    assert.ok(args.content.includes("Plan de marketing"));
});

test("reel.create can hydrate from the completed marketing video package when reel.plan is absent", () => {
    const marketing = completedMarketing();
    const args = reelArtifactArgsFromCompletedTasks(
        [marketing],
        { marketingRequirementId: "reel-main" }
    );
    assert.ok(args);
    assert.equal(args.brandName, "Multiservicios Peninsulares HMH");
    assert.equal(args.durationSeconds, 30);
    assert.equal(args.scenes.length, 5);
    assert.equal(
        args.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
        30
    );
    assert.ok(args.scenes.every(scene => scene.overlay && scene.subtitle));
    assert.ok(reelNarrationFromCompletedTasks([marketing]).includes("Contacta a HMH"));
});
