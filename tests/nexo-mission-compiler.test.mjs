import assert from "node:assert/strict";
import { test } from "node:test";

import {
    compileNexoMission,
    __test
} from "../gestia-core/nexo/nexo.mission.compiler.js";

const catalog = [
    "marketing.plan",
    "page.plan",
    "page.compose",
    "page.create",
    "reel.plan",
    "reel.create",
    "image.generate",
    "document.compose",
    "document.create",
    "system.certify"
].map(name => ({ name }));

function names(plan) {
    return plan.toolCalls.map(call => call.name);
}

test("one page instruction reaches page.create with executable content", () => {
    const plan = compileNexoMission({
        input: "Crea una página web para Peninsula Tech sobre servicios técnicos seguros",
        catalog
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.identity, "NEXO");
    assert.equal(plan.status, "NEXO_LOCAL_MISSION_READY");
    assert.deepEqual(names(plan), ["page.plan", "page.create"]);

    const create = plan.toolCalls.find(call => call.name === "page.create");
    assert.equal(create.args.brandName, "Peninsula Tech");
    assert.equal(create.args.services.length, 3);
    assert.equal(create.args.description.length >= 20, true);
    assert.equal(create.args.whatsappRequested, true);
});

test("one marketing instruction produces plan, program, reel and image artifacts", () => {
    const plan = compileNexoMission({
        input: "Haz un programa de marketing para Peninsula Tech con reel de TikTok e imagen publicitaria",
        catalog,
        context: {
            objectiveId: "MKT-ONE-INSTRUCTION"
        }
    });

    assert.equal(plan.ok, true);
    assert.deepEqual(names(plan), [
        "marketing.plan",
        "document.create",
        "reel.plan",
        "reel.create",
        "image.generate"
    ]);

    const campaign = plan.toolCalls.find(call => call.name === "marketing.plan");
    assert.equal(campaign.args.audience.length > 20, true);
    assert.equal(campaign.args.offer.length > 20, true);
    assert.equal(campaign.args.pain.length > 20, true);
    assert.equal(campaign.args.promise.length > 20, true);
    assert.equal(campaign.args.differentiator.length > 20, true);
    assert.equal(campaign.args.cta.length > 5, true);

    const program = plan.toolCalls.find(call =>
        call.name === "document.create" && call.args.format === "json"
    );
    const parsedProgram = JSON.parse(program.args.content);
    assert.equal(parsedProgram.engine, "NEXO");
    assert.equal(parsedProgram.sevenDayProgram.length, 7);

    const reel = plan.toolCalls.find(call => call.name === "reel.create");
    assert.equal(reel.args.durationSeconds, 30);
    assert.equal(
        reel.args.scenes.reduce((total, scene) => total + scene.durationSeconds, 0),
        30
    );
});

test("one document instruction selects directly executable PDF XLSX and PPTX", () => {
    const plan = compileNexoMission({
        input: "Crea PDF, Excel y PowerPoint con un programa operativo de Peninsula Tech",
        catalog
    });

    const createdFormats = plan.toolCalls
        .filter(call => call.name === "document.create")
        .map(call => call.args.format);

    assert.deepEqual(createdFormats, ["pdf", "xlsx", "pptx"]);

    const workbook = plan.toolCalls.find(call => call.args.format === "xlsx");
    assert.equal(workbook.args.requireFormulas, true);
    assert.equal(workbook.args.sheets.length, 2);
    assert.equal(
        JSON.stringify(workbook.args.sheets).includes("=IF("),
        true
    );
});

test("Word instruction uses validated composition before artifact creation", () => {
    const plan = compileNexoMission({
        input: "Crea un documento Word sobre la seguridad de Peninsula Tech",
        catalog
    });

    assert.deepEqual(names(plan), ["document.compose"]);
    assert.equal(plan.toolCalls[0].args.format, "docx");
});

test("grounded argument completion recovers a complete marketing brief without sources", () => {
    const plan = compileNexoMission({
        input: [
            "Prepara argumentos.",
            "INSTRUCCION_ORIGINAL=Hazme un programa de marketing para Peninsula Tech"
        ].join("\n"),
        catalog,
        missionState: {
            phase: "GROUNDED_ARGUMENT_COMPLETION",
            toolName: "marketing.plan"
        }
    });

    assert.equal(plan.status, "NEXO_LOCAL_ARGUMENTS_READY");
    assert.deepEqual(names(plan), ["marketing.plan"]);
    assert.equal(plan.toolCalls[0].args.brandName, "Peninsula Tech");
    assert.equal(plan.toolCalls[0].args.assets.includes("landing_page"), true);
});

test("compiler does not hijack unrelated technical instructions", () => {
    const plan = compileNexoMission({
        input: "Analiza el módulo de autenticación y dime por qué falla",
        catalog
    });
    assert.equal(plan, null);
});

test("detector recognizes requested creative outputs", () => {
    assert.deepEqual(
        __test.detectDeliverables(
            "programa de marketing, página web, TikTok, imagen, PDF, Word, Excel y PowerPoint"
        ),
        {
            marketing: true,
            page: true,
            reel: true,
            image: true,
            pdf: true,
            docx: true,
            xlsx: true,
            pptx: true
        }
    );
});
