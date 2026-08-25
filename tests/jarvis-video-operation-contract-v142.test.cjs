"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
    classifyCompletedVideoOperation
} = require("../functions/jarvis-video-operation-contract.js");

test("RAI-filtered completed operation preserves provider reasons and is not retryable", () => {
    const result = classifyCompletedVideoOperation({
        done: true,
        response: {
            raiMediaFilteredCount: 1,
            raiMediaFilteredReasons: ["VIOLENCE", "SAFETY"]
        }
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "VIDEO_GENERATION_RAI_FILTERED");
    assert.equal(result.providerCode, "RAI_MEDIA_FILTERED");
    assert.equal(result.retryable, false);
    assert.deepEqual(result.raiMediaFilteredReasons, ["VIOLENCE", "SAFETY"]);
});

test("RAI reasons take precedence over a generic terminal operation error", () => {
    const result = classifyCompletedVideoOperation({
        done: true,
        error: { code: 13, message: "Generic terminal error." },
        response: {
            raiMediaFilteredCount: 1,
            raiMediaFilteredReasons: ["SAFETY"]
        }
    });

    assert.equal(result.status, "VIDEO_GENERATION_RAI_FILTERED");
    assert.deepEqual(result.raiMediaFilteredReasons, ["SAFETY"]);
});

test("completed operation with an explicit empty generated list is result missing", () => {
    const result = classifyCompletedVideoOperation({
        done: true,
        response: { generatedVideos: [] }
    });

    assert.equal(result.status, "VIDEO_GENERATION_RESULT_MISSING");
    assert.equal(result.providerCode, "GENERATED_VIDEO_MISSING");
    assert.equal(result.retryable, false);
});

test("completed operation with an invalid provider shape is distinguished from result missing", () => {
    const result = classifyCompletedVideoOperation({
        done: true,
        response: { generatedVideos: [{ unexpected: true }] }
    });

    assert.equal(result.status, "VIDEO_GENERATION_PROVIDER_RESPONSE_INVALID");
    assert.equal(result.providerCode, "PROVIDER_RESPONSE_INVALID");
    assert.equal(result.retryable, false);
});

test("completed provider operation error preserves code and message", () => {
    const result = classifyCompletedVideoOperation({
        done: true,
        error: {
            code: 13,
            message: "Provider operation terminated without a video."
        }
    });

    assert.equal(result.status, "VIDEO_GENERATION_OPERATION_FAILED");
    assert.equal(result.providerCode, "13");
    assert.equal(result.providerMessage, "Provider operation terminated without a video.");
    assert.equal(result.retryable, false);
});
