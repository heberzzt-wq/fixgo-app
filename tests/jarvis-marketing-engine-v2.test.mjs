import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

import {
    COMPANY_REGISTRY_VERSION,
    resolveMarketingContext
} from "../gestia-core/jarvis/jarvis.company.registry.js";
import {
    isMarketingRequest,
    planMarketingRequest
} from "../gestia-core/jarvis/jarvis.marketing.engine.js";

test("NEXO marketing builds an evidence-grounded multi-channel production package", () => {
    const plan = planMarketingRequest(
        "crea una pagina para nuestra empresa, flyer y reel para Instagram y TikTok",
        {
            ...resolveMarketingContext(),
            objectiveId: "MKT-TEST-1",
            assets: ["landing_page", "flyer", "reel"],
            channels: ["instagram", "tiktok"],
            pain: "Las fallas técnicas detienen la operación del negocio",
            promise: "Recuperar la operación con atención técnica trazable",
            differentiator: "diagnóstico documentado y seguimiento directo",
            cta: "Solicita un diagnóstico",
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
    assert.ok(plan.formats.some(item => item.dimensions.some(size => size.width === 1080 && size.height === 1920)));
    assert.equal(plan.onScreenTexts.length, 5);
    assert.equal(plan.publicationPlan.length, 5);
});

test("NEXO marketing gives verified mission sources priority over semantic web research arguments", () => {
    const plan = planMarketingRequest("campaña grounded", {
        brandName: "SUMM",
        audience: "Empresas",
        offer: "Defensa fiscal estratégica",
        pain: "Fiscalización compleja",
        promise: "Estrategia jurídica verificable",
        differentiator: "Experiencia documentada",
        cta: "Agenda una consulta",
        webResearch: [
            { title: "", url: "https://example.invalid/" }
        ],
        validSources: [
            { title: "SUMM", url: "https://www.summ.com.mx/" },
            { title: "About SUMM", url: "https://www.summ.com.mx/about" }
        ]
    });

    assert.equal(plan.grounding.status, "GROUNDED");
    assert.equal(plan.grounding.sourceCount, 2);
    assert.equal(plan.message.includes("2 fuentes"), true);
});

test("NEXO marketing leaves free-text routing to the mission planner", () => {
    const source = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.marketing.engine.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /const CHANNELS|const ASSETS|RegExp|\.test\(/);
    assert.equal(isMarketingRequest("flyer reel tiktok"), false);
    assert.equal(isMarketingRequest({ domain: "marketing" }), true);
});

test("NEXO marketing turns a minimal natural instruction into an editable package", () => {
    const result = planMarketingRequest("hazme un programa de marketing", {
        brandName: "HMH"
    });

    assert.equal(result.ok, true);
    assert.equal(result.readyForProduction, true);
    assert.equal(result.status, "MARKETING_PACKAGE_READY");
    assert.equal(result.grounding.status, "USER_CONTEXT_ONLY");
    assert.equal(result.campaign !== null, true);
    assert.ok(result.inferredInputs.includes("audience"));
    assert.ok(result.inferredInputs.includes("offer"));
    assert.ok(result.inferredInputs.includes("cta"));
    assert.equal(result.campaign.assumptions.length >= 3, true);
    assert.match(result.message, /propuestas editables/i);
});

test("company registry remains available during NEXO migration", () => {
    const context = resolveMarketingContext();

    assert.equal(COMPANY_REGISTRY_VERSION, "2.0.0-business-marketing");
    assert.equal(context.name, "FixGo / GestiaPremium");
    assert.equal(context.registryVersion, COMPANY_REGISTRY_VERSION);
    assert.equal(isMarketingRequest({ domain: "marketing" }), true);
    assert.equal(isMarketingRequest("marketing para redes sociales"), false);
});
