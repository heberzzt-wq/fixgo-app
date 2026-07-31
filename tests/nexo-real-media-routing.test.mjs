import assert from "node:assert/strict";
import { test } from "node:test";

import {
    compileNexoMission,
    __test
} from "../gestia-core/nexo/nexo.mission.compiler.v2.js";

const catalog = [
    "web.research",
    "web.media.collect",
    "marketing.plan",
    "marketing.package.real-media",
    "document.create",
    "image.generate",
    "reel.plan",
    "reel.create"
].map(name => ({ name }));

function names(plan) {
    return plan.toolCalls.map(call => call.name);
}

test("real Multiservicios instruction requires verified image and video bytes", () => {
    const instruction =
        "creame un plan de marketing para multiservicios . https://multiserviciospeninsulareshmh.com/ con fotos y videos reales";
    const plan = compileNexoMission({
        input: instruction,
        catalog,
        context: {
            objectiveId: "OBJ-REAL-MEDIA",
            caseId: "CASE-REAL-MEDIA"
        }
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.version, "2.1.0-real-media-evidence-chain");
    assert.deepEqual(names(plan).slice(0, 3), [
        "web.research",
        "web.media.collect",
        "marketing.plan"
    ]);
    assert.equal(names(plan).includes("marketing.package.real-media"), true);
    assert.equal(names(plan).includes("image.generate"), false);
    assert.equal(names(plan).includes("reel.create"), false);
    assert.equal(plan.realMediaContract.requireImages, true);
    assert.equal(plan.realMediaContract.requireVideos, true);
    assert.equal(plan.realMediaContract.sourceBytesRequired, true);
    assert.equal(plan.missionPolicy.syntheticMediaSubstitutionAllowed, false);

    const collect = plan.toolCalls.find(call => call.name === "web.media.collect");
    assert.equal(collect.args.url, "https://multiserviciospeninsulareshmh.com/");
    assert.equal(collect.args.requireImages, true);
    assert.equal(collect.args.requireVideos, true);
});

test("real media detector does not hijack synthetic or URL-free requests", () => {
    assert.equal(
        __test.realMediaRequest("crea una imagen publicitaria para Peninsula Tech"),
        null
    );
    assert.equal(
        __test.realMediaRequest("usa fotos reales para la campaña"),
        null
    );
    const detected = __test.realMediaRequest(
        "usa las fotos originales de https://example.com para el plan"
    );
    assert.equal(detected.requireImages, true);
    assert.equal(detected.requireVideos, false);
});
