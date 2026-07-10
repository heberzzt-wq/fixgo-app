import assert from "node:assert/strict";
import { test } from "node:test";

import {
    COMPANY_REGISTRY_VERSION,
    resolveMarketingContext
} from "../gestia-core/jarvis/jarvis.company.registry.js";
import {
    isMarketingRequest,
    planMarketingRequest
} from "../gestia-core/jarvis/jarvis.marketing.engine.js";
import {
    runBusinessIntent
} from "../gestia-core/jarvis/jarvis.business.engine.js";

test("marketing V3 builds editable multi-channel asset packages", () => {
    const plan = planMarketingRequest(
        "crea una pagina para nuestra empresa, flyer y reel para Instagram y TikTok",
        {
            ...resolveMarketingContext(),
            objectiveId: "MKT-TEST-1"
        }
    );

    assert.equal(plan.ok, true);
    assert.equal(plan.intent, "MARKETING_PACKAGE");
    assert.equal(plan.domain, "marketing");
    assert.equal(plan.editable, true);
    assert.equal(plan.approval.required, true);
    assert.equal(plan.approval.publishAllowed, false);
    assert.equal(plan.approval.deployAllowed, false);
    assert.equal(plan.trace.objectiveId, "MKT-TEST-1");
    assert.equal(plan.trace.authorityId, "HEBERTO_MENDOZA");
    assert.equal(plan.trace.controllerId, "CODEX_SIA7");
    assert.equal(plan.brand.name, "FixGo / GestiaPremium");
    assert.ok(plan.assets.includes("landing_page"));
    assert.ok(plan.assets.includes("flyer"));
    assert.ok(plan.assets.includes("reel"));
    assert.ok(plan.channels.includes("instagram"));
    assert.ok(plan.channels.includes("tiktok"));
    assert.ok(plan.deliverables.some(item => item.type === "landing_page"));
    assert.ok(plan.deliverables.some(item => item.type === "short_video"));
    assert.ok(Array.isArray(plan.copies));
    assert.ok(Array.isArray(plan.calendar));
    assert.ok(Array.isArray(plan.funnel));
    assert.ok(Array.isArray(plan.publications));
    assert.ok(Array.isArray(plan.videoPackage.storyboard));
});

test("business V3 delegates marketing language to the marketing engine", () => {
    const result = runBusinessIntent("hazme un flayer para instagram");

    assert.equal(result.ok, true);
    assert.equal(result.source, "jarvis_marketing_engine_v3");
    assert.equal(result.intent, "MARKETING_PACKAGE");
    assert.equal(result.primaryAsset, "flyer");
    assert.ok(result.channels.includes("instagram"));
    assert.equal(result.approval.publishAllowed, false);
});

test("company registry exposes marketing context", () => {
    const context = resolveMarketingContext();

    assert.equal(COMPANY_REGISTRY_VERSION, "2.0.0-business-marketing");
    assert.equal(context.name, "FixGo / GestiaPremium");
    assert.equal(context.registryVersion, COMPANY_REGISTRY_VERSION);
    assert.equal(isMarketingRequest("marketing para redes sociales"), true);
    assert.equal(isMarketingRequest("crea un embudo y calendario de copies"), true);
});
