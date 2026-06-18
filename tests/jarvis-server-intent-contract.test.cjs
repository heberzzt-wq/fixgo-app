"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
    understandServerIntentV7,
    toPublicIntentContract
} = require("../functions/jarvis-intent-runtime-v7.cjs");

test("server V7 exposes enriched repair contract", () => {
    const intent =
        understandServerIntentV7(
            "repara rutyme latenci a 253 en test-replace.js"
        );

    const contract =
        toPublicIntentContract(
            intent
        );

    assert.equal(contract.intent, "repair");
    assert.equal(contract.target, "test-replace.js");
    assert.equal(contract.file, "test-replace.js");
    assert.equal(contract.value, "253");
    assert.equal(contract.issue, "runtime_latency");
    assert.equal(contract.needsClarification, false);
    assert.equal(contract.planner.planType, "REPAIR_RUNTIME");
    assert.equal(contract.execution.requiresApproval, true);
    assert.equal(contract.repairHints.requestedValue, "253");
});

test("server V7 inherits context only when caller passes it", () => {
    const intent =
        understandServerIntentV7(
            "haz lo mismo",
            {
                memory: {
                    lastAction: "repair",
                    lastIntent: "REPAIR",
                    lastEntity: "RUNTIME",
                    lastTarget: "test-replace.js",
                    lastFile: "test-replace.js",
                    lastValue: "253",
                    lastIssue: "runtime_latency"
                }
            }
        );

    assert.equal(intent.action, "repair");
    assert.equal(intent.file, "test-replace.js");
    assert.equal(intent.value, "253");
    assert.equal(intent.issue, "runtime_latency");
    assert.equal(intent.planner.memory.inheritedFile, true);

    const flatContextIntent =
        understandServerIntentV7(
            "haz lo mismo",
            {
                lastAction: "repair",
                lastIntent: "REPAIR",
                lastEntity: "RUNTIME",
                lastTarget: "test-replace.js",
                lastFile: "test-replace.js",
                lastValue: "253",
                lastIssue: "runtime_latency"
            }
        );

    assert.equal(flatContextIntent.action, "repair");
    assert.equal(flatContextIntent.file, "test-replace.js");
});

test("server V7 keeps clarification in the public contract", () => {
    const intent =
        understandServerIntentV7(
            "repara"
        );

    const contract =
        toPublicIntentContract(
            intent
        );

    assert.equal(contract.intent, "repair");
    assert.equal(contract.needsClarification, true);
    assert.equal(contract.command, null);
    assert.match(contract.clarification, /archivo|modulo|area/i);
});
