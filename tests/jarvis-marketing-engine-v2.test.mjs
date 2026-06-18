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

test("marketing V2 builds editable multi-channel asset plans", () => {
    const plan =
        planMarketingRequest(
            "crea una pagina para nuestra empresa, flyer y reel para Instagram y TikTok",
            resolveMarketingContext()
        );

    assert.equal(plan.ok, true);
    assert.equal(plan.intent, "MARKETING_PLAN");
    assert.equal(plan.domain, "marketing");
    assert.equal(plan.editable, true);
    assert.equal(plan.requiresHumanApproval, true);
    assert.equal(plan.brand.name, "FixGo / GestiaPremium");
    assert.ok(plan.assets.includes("landing_page"));
    assert.ok(plan.assets.includes("flyer"));
    assert.ok(plan.assets.includes("reel"));
    assert.ok(plan.channels.includes("instagram"));
    assert.ok(plan.channels.includes("tiktok"));
    assert.ok(plan.deliverables.some(item => item.type === "landing_page"));
    assert.ok(plan.deliverables.some(item => item.type === "short_video"));
});

test("business V2 delegates marketing language to the marketing engine", () => {
    const result =
        runBusinessIntent(
            "hazme un flayer para instagram"
        );

    assert.equal(result.ok, true);
    assert.equal(result.source, "jarvis_marketing_engine_v2");
    assert.equal(result.intent, "MARKETING_PLAN");
    assert.equal(result.primaryAsset, "flyer");
    assert.ok(result.channels.includes("instagram"));
});

test("company registry exposes V2 marketing context", () => {
    const context =
        resolveMarketingContext();

    assert.equal(COMPANY_REGISTRY_VERSION, "2.0.0-business-marketing");
    assert.equal(context.name, "FixGo / GestiaPremium");
    assert.equal(context.registryVersion, COMPANY_REGISTRY_VERSION);
    assert.equal(isMarketingRequest("marketing para redes sociales"), true);
});
