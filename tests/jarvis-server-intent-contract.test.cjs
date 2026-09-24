"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
    VERSION,
    understandServerIntentV7,
    toPublicIntentContract
} = require("../functions/jarvis-intent-runtime-v7.cjs");

test("legacy V7 intent runtime is an inert compatibility canary", () => {
    const intent = understandServerIntentV7(
        "repara rutyme latenci a 253 en test-replace.js",
        {
            memory: {
                lastAction: "repair",
                lastTarget: "test-replace.js"
            }
        }
    );

    assert.equal(intent.ok, false);
    assert.equal(intent.retired, true);
    assert.equal(intent.semanticAuthority, "jarvisSemanticPlan");
    assert.equal(intent.lexicalClassification, false);
    assert.equal(intent.alternateBrain, false);
    assert.equal(intent.intent, null);
    assert.equal(intent.action, null);
    assert.equal(intent.file, null);
    assert.equal(intent.status, "LOCAL_JARVIS_LLM_REQUIRED");
    assert.match(VERSION, /retired-single-jarvis-llm/);
});

test("public legacy intent contract cannot fabricate semantic decisions", () => {
    const contract = toPublicIntentContract(
        understandServerIntentV7(
            "crea pagina para nuestra empresa y flyer para Instagram"
        )
    );

    assert.equal(contract.ok, false);
    assert.equal(contract.retired, true);
    assert.equal(contract.intent, "semantic_llm_required");
    assert.equal(contract.target, null);
    assert.equal(contract.planner, null);
    assert.equal(contract.marketing, null);
    assert.equal(contract.semanticAuthority, "jarvisSemanticPlan");
    assert.equal(contract.lexicalClassification, false);
    assert.equal(contract.alternateBrain, false);
});
