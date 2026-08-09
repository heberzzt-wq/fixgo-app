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
    assert.equal(plan.version, "8.2.0-semantic-brief-real-delivery-contract");
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
        market: "México",
        campaignObjective: "generar consultas calificadas",
        horizon: "90 días",
        channels: ["Google", "LinkedIn"],
        tone: "serio y profesional",
        metrics: ["consultas calificadas", "conversión", "costo por consulta", "citas"],
        productionRequested: false,
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

test("NEXO marketing requires only structured factual brand identity", () => {
    const result = planMarketingRequest(
        "Prepara el plan integral solicitado."
    );

    assert.equal(result.ok, true);
    assert.equal(result.executionOk, true);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.requiresInput, true);
    assert.equal(result.readyForProduction, false);
    assert.equal(result.status, "MARKETING_INPUT_REQUIRED");
    assert.deepEqual(result.missingInputs, ["brandName"]);
    assert.equal(result.questions.length, 1);
});

test("NEXO marketing produces the complete 90-day package after receiving sufficient context", () => {
    const result = planMarketingRequest(
        "Crea un plan de marketing completo para Multiservicios Peninsulares HMH.",
        {
            brandName: "Multiservicios Peninsulares HMH",
            campaignObjective: "Captar clientes y prestadores durante los primeros 90 días",
            audience: "Propietarios, administradores, pequeños negocios y personas que necesitan técnicos confiables",
            market: "Cancún, Quintana Roo",
            offer: "Plataforma de multiservicios para hogares y negocios",
            pain: "Dificultad para encontrar profesionales verificados, disponibles y con seguimiento",
            promise: "Conexión rápida con profesionales y trazabilidad del servicio",
            differentiator: "Profesionales verificados, seguimiento y experiencia digital",
            budget: "escenario bajo de MXN 10,000 mensuales",
            mediumBudget: "escenario medio de MXN 30,000 mensuales",
            horizon: "90 días",
            cta: "Solicitar servicio o registrarse como profesional",
            tone: "claro, confiable y local",
            metrics: ["solicitudes de servicio", "registros de profesionales", "conversión", "costo por adquisición"],
            channels: ["Meta Ads", "Google Ads", "contenido local", "WhatsApp", "referidos"]
        }
    );

    assert.equal(result.status, "MARKETING_PACKAGE_READY");
    assert.equal(result.objectiveSatisfied, true);
    assert.equal(result.requiresInput, false);
    assert.equal(result.readyForProduction, true);
    assert.equal(Object.keys(result.plan).length, 25);
    for (const key of [
        "executiveSummary", "smartObjectives", "targetAudience",
        "contentPillars", "budgetScenarios", "kpisAndMeasurement",
        "actionPlan306090", "prioritizedNextSteps"
    ]) assert.ok(result.plan[key], `missing plan section: ${key}`);
    assert.match(result.plan.executiveSummary, /Multiservicios Peninsulares HMH/);
    const visible = marketingFinalResponseFromMission({
        completedTasks: [{
            name: "marketing.plan",
            observation: {
                status: result.status,
                objectiveSatisfied: result.objectiveSatisfied,
                userVisible: result.userVisible
            }
        }]
    });
    assert.equal(visible.source, "MARKETING_DELIVERABLE_DIRECT");
    assert.equal(MARKETING_PLAN_SECTIONS.length, 25);
    for (const { heading } of MARKETING_PLAN_SECTIONS) {
        assert.match(visible.text, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    for (const concrete of [
        "Cancún", "90 días", "Meta Ads", "Google Ads", "WhatsApp",
        "escenario bajo", "escenario medio"
    ]) assert.match(visible.text, new RegExp(concrete, "i"));
    for (const contradiction of [
        "No dispongo de información sobre el contenido",
        "No tengo información adicional",
        "no tengo detalles de la campaña",
        "Lo ejecutado", "Lo planeado", "Lo bloqueado", "Limitaciones"
    ]) assert.doesNotMatch(visible.text, new RegExp(contradiction, "i"));
    assert.equal(marketingFinalResponseFromMission({
        completedTasks: [{ name: "web.research", observation: { status: "GROUNDED" } }]
    }), null);

    const core = fs.readFileSync(
        new URL("../gestia-core/gestia-core.js", import.meta.url),
        "utf8"
    );
    assert.match(core, /marketingFinalResponseFromMission\(\s*missionResult\s*\)/);
    assert.match(core, /!marketingDeliverableFinalResponse\s*&&\s*conversationalPlan\.requiresFinalConversation/);
    assert.ok(
        core.indexOf("marketingDeliverableFinalResponse ||") <
        core.indexOf("semanticMissionFinalResponse ||")
    );
});

test("company registry remains available during NEXO migration", () => {
    const context = resolveMarketingContext();

    assert.equal(COMPANY_REGISTRY_VERSION, "2.0.0-business-marketing");
    assert.equal(context.name, "FixGo / GestiaPremium");
    assert.equal(context.registryVersion, COMPANY_REGISTRY_VERSION);
    assert.equal(isMarketingRequest({ domain: "marketing" }), true);
    assert.equal(isMarketingRequest("marketing para redes sociales"), false);
});


test("NEXO marketing isolates structured current brand identity from stale completed context", () => {
    const stale = {
        brandName: "Peninsula Tech",
        name: "Peninsula Tech",
        campaignObjective: "Captar clientes anteriores",
        audience: "Clientes residenciales y empresariales",
        market: "México",
        offer: "Oferta anterior",
        pain: "Problema anterior",
        promise: "Promesa anterior",
        differentiator: "Diferenciador anterior",
        budget: "escenario anterior",
        horizon: "90 días",
        cta: "Solicita una evaluación con Peninsula Tech",
        channels: ["instagram", "facebook", "tiktok", "whatsapp"]
    };
    const result = planMarketingRequest(
        "Prepara el plan integral solicitado.",
        {
            brandName: "Multiservicios Peninsulares HMH",
            name: "Multiservicios Peninsulares HMH",
            marketingContext: { ...stale }
        }
    );

    assert.equal(result.status, "MARKETING_SEMANTIC_BRIEF_INCOMPLETE");
    assert.equal(result.requiresInput, false);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.retryable, true);
    assert.equal(result.brandName, "Multiservicios Peninsulares HMH");
    assert.equal(result.missingSemanticFields.includes("audience"), true);
    assert.equal(result.missingSemanticFields.includes("offer"), true);
    assert.equal(result.missingSemanticFields.includes("campaignObjective"), true);
});
