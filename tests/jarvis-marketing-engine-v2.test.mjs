import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

import {
    COMPANY_REGISTRY_VERSION,
    resolveMarketingContext
} from "../gestia-core/jarvis/jarvis.company.registry.js";
import {
    isMarketingRequest,
    planMarketingRequest,
    NexoMarketingEngine
} from "../gestia-core/jarvis/jarvis.marketing.engine.js";
import {
    marketingFinalResponseFromMission,
    MARKETING_PLAN_SECTIONS
} from "../gestia-core/jarvis/jarvis.marketing.presenter.js";

test("NEXO marketing builds an evidence-grounded multi-channel production package", () => {
    const plan = planMarketingRequest(
        "crea una pagina para nuestra empresa, flyer y reel para Instagram y TikTok",
        {
            ...resolveMarketingContext(),
            objectiveId: "MKT-TEST-1",
            assets: ["landing_page", "flyer", "reel"],
            channels: ["instagram", "tiktok"],
            audience: "hogares y negocios que necesitan soporte técnico confiable",
            offer: "servicios técnicos coordinados con seguimiento",
            market: "Cancún, Quintana Roo",
            campaignObjective: "generar conversaciones calificadas y solicitudes de servicio",
            horizon: "90 días",
            productionRequested: true,
            productionArtifacts: [
                { type: "landing_page", toolName: "page.create", label: "Landing HTML" },
                { type: "flyer", toolName: "image.generate", label: "Imagen publicitaria" },
                { type: "reel", toolName: "reel.create", label: "Reel 9:16" }
            ],
            pain: "Las fallas técnicas detienen la operación del negocio",
            promise: "Recuperar la operación con atención técnica trazable",
            differentiator: "diagnóstico documentado y seguimiento directo",
            cta: "Solicita un diagnóstico",
            tone: "directo, confiable y profesional",
            metrics: ["conversaciones calificadas", "conversión de landing", "costo por lead", "solicitudes de servicio"],
            hashtags: ["#FixGo", "#Cancún", "#ServiciosTécnicos"],
            services: [{ name: "Diagnóstico técnico", source: "landing" }],
            testimonials: [{ quote: "Atención clara", source: "documento-cliente.pdf" }]
        }
    );

    assert.equal(plan.ok, true);
    assert.equal(plan.intent, "MARKETING_PACKAGE");
    assert.equal(plan.domain, "marketing");
    assert.equal(plan.editable, true);
    assert.equal(plan.status, "MARKETING_PACKAGE_READY");
    assert.equal(plan.source, "nexo_natural_brief_and_optional_evidence");
    assert.equal(plan.engine, "nexo_marketing_engine");
    assert.equal(plan.legacyEngineAlias, "jarvis_marketing_engine");
    assert.equal(plan.version, "8.3.0-grounded-social-edit-contract-v12");
    assert.equal(
        NexoMarketingEngine.routing,
        "semantic_fields_with_editable_assumptions"
    );
    assert.equal(plan.approval.required, true);
    assert.equal(plan.approval.publishAllowed, false);
    assert.equal(plan.approval.deployAllowed, false);
    assert.equal(plan.trace.objectiveId, "MKT-TEST-1");
    assert.equal(plan.trace.authorityId, "HEBERTO_MENDOZA");
    assert.equal(plan.trace.controllerId, "PENINSULA_NEXO");
    assert.equal(plan.trace.engineIdentity, "NEXO");
    assert.equal(plan.brand.name, "FixGo / GestiaPremium");
    assert.ok(plan.assets.includes("landing_page"));
    assert.ok(plan.assets.includes("flyer"));
    assert.ok(plan.assets.includes("reel"));
    assert.ok(plan.channels.includes("instagram"));
    assert.ok(plan.channels.includes("tiktok"));
    assert.ok(plan.deliverables.some(item => item.type === "landing_page"));
    assert.ok(plan.deliverables.some(item => item.type === "reel"));
    assert.ok(Array.isArray(plan.copies));
    assert.ok(Array.isArray(plan.calendar));
    assert.ok(Array.isArray(plan.funnel));
    assert.ok(Array.isArray(plan.publications));
    assert.ok(Array.isArray(plan.videoPackage.storyboard));
    assert.equal(plan.grounding.status, "GROUNDED");
    assert.equal(plan.grounding.sourceCount, 2);
    assert.equal(plan.videoPackage.dimensions.width, 1080);
    assert.equal(plan.videoPackage.durationSeconds, 30);
    assert.ok(plan.campaign.hooks.length >= 4);
    assert.ok(plan.campaign.hashtags.length >= 3);
    assert.ok(plan.campaign.metrics.length >= 4);
    assert.equal(plan.campaign.variants.length, 2);
    assert.equal(plan.planReady, true);
    assert.equal(plan.productionRequested, true);
    assert.equal(plan.requiredArtifacts.length, 3);
    assert.equal(plan.readyForProduction, true);
    assert.equal(plan.objectiveSatisfied, true);
    assert.ok(plan.userVisible.includes("Plan de marketing"));
});

test("NEXO marketing source contains no regex routing authority", () => {
    const source = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.marketing.engine.js", import.meta.url), "utf8");
    assert.equal(/function\s+infer/i.test(source), false);
    assert.equal(/MARKETING_HINT/i.test(source), false);
});

test("company registry remains available during NEXO migration", () => {
    assert.ok(COMPANY_REGISTRY_VERSION);
    assert.equal(typeof resolveMarketingContext, "function");
});

test("NEXO marketing isolates structured current brand identity from stale completed context", () => {
    const result = planMarketingRequest(
        "Crea marketing.",
        {
            brandName: "Marca Actual",
            audience: "clientes locales",
            offer: "servicio actual",
            pain: "fricción actual",
            promise: "propuesta actual",
            differentiator: "diferenciador actual",
            cta: "Contacta",
            market: "Cancún",
            campaignObjective: "generar conversaciones",
            horizon: "90 días",
            tone: "claro",
            metrics: ["leads"],
            channels: ["instagram"],
            completedTasks: [{
                name: "web.research",
                observation: {
                    validSources: [{
                        title: "Marca Vieja",
                        url: "https://example.com"
                    }]
                }
            }]
        }
    );
    assert.equal(result.brand.name, "Marca Actual");
});

test("isMarketingRequest only accepts structured marketing domain", () => {
    assert.equal(isMarketingRequest({ domain: "marketing" }), true);
    assert.equal(isMarketingRequest({ domain: "sales" }), false);
    assert.equal(isMarketingRequest("marketing"), false);
});

test("MARKETING_PLAN_SECTIONS keeps the complete structured plan contract", () => {
    assert.equal(MARKETING_PLAN_SECTIONS.length, 25);
    assert.equal(MARKETING_PLAN_SECTIONS[0].key, "executiveSummary");
    assert.equal(MARKETING_PLAN_SECTIONS.at(-1).key, "prioritizedNextSteps");
});

test("marketing final response is honest about unresolved requested artifacts", () => {
    const plan = planMarketingRequest("Marketing.", {
        brandName: "Marca",
        audience: "audiencia",
        offer: "oferta",
        pain: "problema",
        promise: "promesa",
        differentiator: "diferenciador",
        cta: "Contacta",
        market: "Cancún",
        campaignObjective: "generar leads",
        horizon: "90 días",
        tone: "claro",
        metrics: ["leads"],
        channels: ["instagram"],
        productionRequested: true,
        productionArtifacts: [
            { id: "visual", type: "visual", toolName: "image.generate", label: "Visual" }
        ]
    });
    const response = marketingFinalResponseFromMission({
        completedTasks: [{
            name: "marketing.plan",
            observation: {
                status: plan.status,
                objectiveSatisfied: true,
                planReady: true,
                productionRequested: true,
                requiredArtifacts: plan.requiredArtifacts,
                userVisible: plan.userVisible
            }
        }],
        blockedTasks: [],
        pendingTasks: []
    });
    assert.equal(response.ok, false);
    assert.equal(response.unresolvedArtifacts.length, 1);
});