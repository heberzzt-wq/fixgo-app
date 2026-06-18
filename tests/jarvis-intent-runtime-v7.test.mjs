import assert from "node:assert/strict";
import { test } from "node:test";

import {
    resetIntentRuntimeV7,
    understandIntentV7
} from "../gestia-core/jarvis/jarvis.intent.runtime.v7.js";

test("Jarvis V7 understands repair target, value and issue", () => {
    resetIntentRuntimeV7();

    const result =
        understandIntentV7(
            "repara rutyme latenci a 253 en test-replace.js"
        );

    assert.equal(result.action, "repair");
    assert.equal(result.intent, "REPAIR");
    assert.equal(result.file, "test-replace.js");
    assert.equal(result.value, "253");
    assert.equal(result.issue, "runtime_latency");
    assert.equal(result.needsClarification, false);
    assert.equal(result.planner.planType, "REPAIR_RUNTIME");
    assert.equal(result.planner.targetFile, "test-replace.js");
    assert.equal(result.planner.repairHints.requestedValue, "253");
});

test("Jarvis V7 inherits context for haz lo mismo", () => {
    resetIntentRuntimeV7();

    understandIntentV7(
        "repara rutyme latenci a 253 en test-replace.js"
    );

    const result =
        understandIntentV7(
            "haz lo mismo"
        );

    assert.equal(result.action, "repair");
    assert.equal(result.file, "test-replace.js");
    assert.equal(result.value, "253");
    assert.equal(result.issue, "runtime_latency");
    assert.equal(result.planner.memory.referencesContext, true);
    assert.equal(result.planner.memory.inheritedFile, true);
    assert.equal(result.planner.memory.inheritedValue, true);
});

test("Jarvis V7 asks for clarification instead of inventing a repair target", () => {
    resetIntentRuntimeV7();

    const result =
        understandIntentV7(
            "repara"
        );

    assert.equal(result.action, "repair");
    assert.equal(result.needsClarification, true);
    assert.equal(result.command, null);
    assert.match(result.clarification, /archivo|modulo|area/i);
});
