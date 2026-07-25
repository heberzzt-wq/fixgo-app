import assert from "node:assert/strict";
import { test } from "node:test";

if (!globalThis.window) {
    globalThis.window = {};
}

const {
    ResponseComposer,
    __test
} = await import(
    "../gestia-core/response.composer.js?semantic-contract-test"
);

test("tool observation separates technical execution from objective satisfaction", () => {
    const observation = ResponseComposer.composeToolObservation(
        "marketing.plan",
        {
            ok: true,
            status: "MARKETING_INPUT_REQUIRED",
            readyForProduction: false,
            campaign: null,
            missingInputs: ["audience", "offer"]
        }
    );

    assert.equal(observation.ok, true);
    assert.equal(observation.executionOk, true);
    assert.equal(observation.objectiveSatisfied, false);
    assert.equal(observation.status, "MARKETING_INPUT_REQUIRED");
    assert.equal(observation.requiresInput, true);
    assert.equal(observation.blocked, true);
    assert.equal(observation.retryable, false);
    assert.deepEqual(observation.missingInputs, ["audience", "offer"]);
});

test("agent tool result keeps an input-required observation semantically blocked", () => {
    const observation = ResponseComposer.composeToolObservation(
        "marketing.plan",
        {
            ok: true,
            status: "MARKETING_INPUT_REQUIRED",
            missingInputs: ["audience"]
        }
    );
    const result = ResponseComposer.composeAgentToolResult({
        analysisId: "analysis-input-required",
        toolCalls: [{ name: "marketing.plan", args: {} }],
        observations: [observation]
    });

    assert.equal(result.ok, true);
    assert.equal(result.executionOk, true);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.status, "MARKETING_INPUT_REQUIRED");
    assert.equal(result.requiresInput, true);
    assert.equal(result.blocked, true);
    assert.deepEqual(result.data.semantic.missingInputs, ["audience"]);
});

test("approval requirement remains visible in the composed agent envelope", () => {
    const observation = ResponseComposer.composeToolObservation(
        "page.create",
        {
            ok: true,
            status: "PENDING_APPROVAL",
            requiresApproval: true
        }
    );
    const result = ResponseComposer.composeAgentToolResult({
        observations: [observation]
    });

    assert.equal(result.executionOk, true);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.status, "PENDING_APPROVAL");
    assert.equal(result.requiresApproval, true);
    assert.equal(result.blocked, true);
    assert.equal(result.retryable, false);
});

test("degraded success is successful but remains explicitly degraded", () => {
    const observation = ResponseComposer.composeToolObservation(
        "web.research",
        {
            ok: true,
            status: "GROUNDED_LOCAL_FALLBACK",
            cloudError: "SEMANTIC_CLOUD_TIMEOUT"
        }
    );
    const result = ResponseComposer.composeAgentToolResult({
        observations: [observation]
    });

    assert.equal(result.ok, true);
    assert.equal(result.objectiveSatisfied, true);
    assert.equal(result.status, "GROUNDED_LOCAL_FALLBACK");
    assert.equal(result.degraded, true);
    assert.equal(result.blocked, false);
});

test("technical failure stays retryable without pretending objective completion", () => {
    const semantic = __test.normalizeToolSemantics({
        ok: false,
        status: "TOOL_FAILED"
    });

    assert.equal(semantic.executionOk, false);
    assert.equal(semantic.objectiveSatisfied, false);
    assert.equal(semantic.blocked, false);
    assert.equal(semantic.retryable, true);
});

test("runtime wrapper lifts nested semantic status without losing raw data", async () => {
    const rawData = {
        ok: true,
        status: "MARKETING_INPUT_REQUIRED",
        readyForProduction: false,
        campaign: null,
        missingInputs: ["audience", "offer"]
    };
    const runtime = {
        async execute() {
            return {
                ok: true,
                success: true,
                status: "COMPLETED",
                data: rawData,
                executionId: "runtime-semantic-test"
            };
        }
    };

    assert.equal(__test.installSemanticRuntimeEnvelope(runtime), true);
    assert.equal(__test.installSemanticRuntimeEnvelope(runtime), true);

    const result = await runtime.execute("marketing.plan", {}, {});

    assert.equal(result.ok, true);
    assert.equal(result.executionOk, true);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.status, "MARKETING_INPUT_REQUIRED");
    assert.equal(result.requiresInput, true);
    assert.equal(result.blocked, true);
    assert.equal(result.data, rawData);
    assert.equal(runtime.__semanticEnvelopeInstalled, true);
});

test("bridge sequence guard stops dependent calls after semantic input block", async () => {
    const executed = [];
    const bridge = {
        async executeAndCompose(name) {
            executed.push(name);
            return name === "marketing.plan"
                ? {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: false,
                    status: "MARKETING_INPUT_REQUIRED",
                    requiresInput: true,
                    blocked: true
                }
                : {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "SUCCESS"
                };
        }
    };

    assert.equal(__test.installSemanticBridgeGuard(bridge), true);
    assert.equal(__test.installSemanticBridgeGuard(bridge), true);

    const results = await bridge.executeMany([
        { name: "web.research", args: {} },
        { name: "marketing.plan", args: {} },
        { name: "page.plan", args: {} },
        { name: "image.plan", args: {} },
        { name: "reel.plan", args: {} }
    ]);

    assert.deepEqual(executed, ["web.research", "marketing.plan"]);
    assert.equal(results.length, 2);
    assert.equal(results[1].requiresInput, true);
    assert.equal(bridge.__semanticSequenceGuardInstalled, true);
});
