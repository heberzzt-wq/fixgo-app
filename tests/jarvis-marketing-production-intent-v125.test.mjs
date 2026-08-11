import assert from "node:assert/strict";
import { test } from "node:test";

import {
    resolveMarketingMissionProductionScope
} from "../gestia-core/jarvis/jarvis.multitool.pack.js";

test("semantic marketing production intent survives an initial contract that only contains planning tools", () => {
    const result = resolveMarketingMissionProductionScope(
        {
            productionRequested: true,
            productionArtifacts: [{
                id: "reel",
                type: "reel",
                toolName: "reel.create",
                label: "Reel 9:16"
            }]
        },
        {
            requiredToolNames: [
                "web.research",
                "marketing.plan",
                "reel.plan"
            ]
        }
    );

    assert.equal(result.productionRequested, true);
    assert.deepEqual(
        result.productionArtifacts.map(item => item.toolName),
        ["reel.create"]
    );
});

test("planning-only semantic decision remains planning-only when no production actuator is contracted", () => {
    const result = resolveMarketingMissionProductionScope(
        {
            productionRequested: false,
            productionArtifacts: []
        },
        {
            requiredToolNames: [
                "web.research",
                "marketing.plan",
                "reel.plan"
            ]
        }
    );

    assert.equal(result.productionRequested, false);
    assert.deepEqual(result.productionArtifacts, []);
});

test("a contracted production actuator still forces production even when the semantic brief arrived incomplete", () => {
    const result = resolveMarketingMissionProductionScope(
        { productionRequested: false },
        {
            requiredToolNames: [
                "marketing.plan",
                "reel.create"
            ]
        }
    );

    assert.equal(result.productionRequested, true);
    assert.deepEqual(
        result.productionArtifacts.map(item => item.toolName),
        ["reel.create"]
    );
});
