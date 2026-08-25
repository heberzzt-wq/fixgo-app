import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";

import {
    buildLocalAiCapabilityReport,
    createLocalVideoEngine,
    describeLocalVideoPolicy,
    resolveVideoEngine,
    writeLocalAiCapabilityReport
} from "../jarvis-local-video-engine.js";
import { listArtifacts } from "../jarvis-artifact-studio.js";
import { createJarvisFsBridgeApp } from "../jarvis-fs-bridge.js";
import { registerJarvisActuatorTools } from "../gestia-core/jarvis/jarvis.actuator.pack.js";

function runtimeFixture() {
    const registry = new Map();
    return {
        register(tool) {
            registry.set(tool.name, tool);
            return { ok: true, tool: tool.name };
        },
        has: name => registry.has(name),
        get: name => registry.get(name)
    };
}

function healthyCapability() {
    return {
        ok: true,
        status: "LOCAL_VIDEO_HARDWARE_READY",
        cudaAvailable: true,
        gpuName: "TEST_GPU_24GB",
        vramGb: 24,
        freeDiskGb: 100,
        ffmpegAvailable: true,
        ffprobeAvailable: true
    };
}

function physicalFixture(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fixture = Buffer.alloc(120000, 7);
    fixture.write("0000ftypisom", 0, "ascii");
    fs.writeFileSync(file, fixture);
}

function successReceipt(job, overrides = {}) {
    return {
        ok: true,
        status: "LOCAL_VIDEO_RUNNER_COMPLETED",
        operationId: job.operationId,
        operationName: job.operationName,
        output: job.output,
        mimeType: "video/mp4",
        backend: job.backend,
        model: job.model,
        engine: "local",
        provider: "local",
        externalApiUsed: false,
        externalEstimatedCostUsd: 0,
        referenceAssetCount: job.referenceFiles.length,
        durationSeconds: 8,
        fps: 24,
        width: 704,
        height: 1280,
        ...overrides
    };
}

test("V142 local video policy defaults to CURRENT_STABLE without changing the public tool", () => {
    const policy = describeLocalVideoPolicy({});
    const resolved = resolveVideoEngine({ policy, health: { ok: false } });

    assert.equal(policy.mode, "CURRENT_STABLE");
    assert.equal(policy.localVideoEnabled, false);
    assert.equal(policy.externalFallbackEnabled, true);
    assert.equal(resolved.ok, true);
    assert.equal(resolved.engineRequested, "CURRENT_STABLE");
    assert.equal(resolved.engineUsed, "external");
    assert.equal(resolved.provider, "google-veo");
    assert.equal(resolved.fallbackUsed, false);
});

test("LOCAL_AI_CAPABILITY_REPORT is physical, hashed and registered in Artifact Studio", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-local-ai-report-"));
    const hardware = {
        ok: false,
        status: "LOCAL_VIDEO_CUDA_UNAVAILABLE",
        gpuName: "Intel HD Graphics 5500",
        vramGb: 1,
        freeDiskGb: 9.5,
        ffmpegAvailable: false,
        ffprobeAvailable: false
    };
    const report = buildLocalAiCapabilityReport({ root, env: {}, hardware });
    const written = writeLocalAiCapabilityReport({ root, env: {}, hardware });

    assert.equal(report.reportType, "LOCAL_AI_CAPABILITY_REPORT");
    assert.equal(report.localVideoReadiness.supported, false);
    assert.equal(report.promotion.current, "CURRENT_STABLE");
    assert.equal(written.ok, true);
    assert.equal(written.physicallyWritten, true);
    assert.match(written.sha256, /^[a-f0-9]{64}$/);
    assert.equal(fs.existsSync(path.resolve(root, written.output)), true);
    assert.equal(
        listArtifacts({ root, type: "local_ai_capability_report" }).length,
        1
    );
});

test("LOCAL_TEST fails closed when local hardware is unavailable and never selects external", () => {
    const policy = describeLocalVideoPolicy({
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
        JARVIS_LOCAL_VIDEO_ENABLED: "true"
    });
    const resolved = resolveVideoEngine({
        policy,
        health: { ok: false, status: "LOCAL_VIDEO_HARDWARE_UNSUPPORTED" }
    });

    assert.equal(resolved.ok, false);
    assert.equal(resolved.engineRequested, "LOCAL_TEST");
    assert.equal(resolved.engineUsed, null);
    assert.equal(resolved.externalApiUsed, false);
    assert.equal(resolved.externalEstimatedCostUsd, 0);
    assert.equal(resolved.status, "LOCAL_VIDEO_HARDWARE_UNSUPPORTED");
});

test("LOCAL_PREFERRED fallback is explicit and rollback CURRENT_STABLE is deterministic", () => {
    const preferred = describeLocalVideoPolicy({
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_PREFERRED",
        JARVIS_LOCAL_VIDEO_ENABLED: "true",
        JARVIS_EXTERNAL_FALLBACK_ENABLED: "true"
    });
    const fallback = resolveVideoEngine({
        policy: preferred,
        health: { ok: false, status: "LOCAL_VIDEO_MODEL_NOT_READY" }
    });

    assert.equal(fallback.ok, true);
    assert.equal(fallback.engineUsed, "external");
    assert.equal(fallback.fallbackUsed, true);
    assert.equal(fallback.fallbackReason, "LOCAL_VIDEO_MODEL_NOT_READY");

    const rollback = resolveVideoEngine({
        policy: describeLocalVideoPolicy({ JARVIS_VIDEO_ENGINE_POLICY: "CURRENT_STABLE" }),
        health: { ok: false, status: "LOCAL_VIDEO_WORKER_FAILED" }
    });
    assert.equal(rollback.engineUsed, "external");
    assert.equal(rollback.fallbackUsed, false);
    assert.equal(rollback.status, "VIDEO_ENGINE_CURRENT_STABLE");
});

test("LOCAL_ONLY cannot silently fall back to an external provider", () => {
    const resolved = resolveVideoEngine({
        policy: describeLocalVideoPolicy({
            JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_ONLY",
            JARVIS_LOCAL_VIDEO_ENABLED: "true",
            JARVIS_EXTERNAL_FALLBACK_ENABLED: "true"
        }),
        health: { ok: false, status: "LOCAL_VIDEO_WORKER_UNAVAILABLE" }
    });

    assert.equal(resolved.ok, false);
    assert.equal(resolved.engineUsed, null);
    assert.equal(resolved.fallbackUsed, false);
    assert.equal(resolved.externalApiUsed, false);
});

test("external budget is enforced before a provider call and LOCAL_TEST budget is zero", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-video-budget-"));
    const stable = createLocalVideoEngine({
        root,
        env: {
            JARVIS_VIDEO_ENGINE_POLICY: "CURRENT_STABLE",
            JARVIS_EXTERNAL_BUDGET_USD_PER_OPERATION: "0.50",
            JARVIS_EXTERNAL_BUDGET_USD_PER_EPISODE: "0.50",
            JARVIS_EXTERNAL_BUDGET_USD_PER_DAY: "1.00",
            JARVIS_EXTERNAL_VIDEO_ESTIMATED_COST_USD_PER_CALL: "0.30"
        }
    });
    const first = stable.authorizeExternalCall({ operationKey: "EP-1" });
    const second = stable.authorizeExternalCall({ operationKey: "EP-1" });

    assert.equal(first.ok, true);
    assert.equal(first.externalEstimatedCostUsd, 0.3);
    assert.equal(second.ok, false);
    assert.equal(second.status, "EXTERNAL_VIDEO_BUDGET_EXCEEDED");

    const localTest = createLocalVideoEngine({
        root: fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-video-budget-local-")),
        env: { JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST" }
    });
    const forbidden = localTest.authorizeExternalCall({ operationKey: "EP-LOCAL" });
    assert.equal(forbidden.ok, false);
    assert.equal(forbidden.status, "EXTERNAL_VIDEO_CALL_FORBIDDEN_BY_POLICY");
    assert.equal(forbidden.externalEstimatedCostUsd, 0);
});

test("bridge exposes one release-bound local worker lifecycle behind video.generate", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-local-video-routes-"));
    execFileSync("git", ["init", "-b", "v94-media-v4n-negative-claims"], {
        cwd: root,
        stdio: "ignore"
    });
    fs.writeFileSync(path.join(root, "jarvis-runtime-contract.json"), JSON.stringify({
        projectId: "fixgo-test",
        branch: "v94-media-v4n-negative-claims",
        releaseId: "local-video-test-release"
    }));
    const calls = [];
    const localVideoEngine = {
        resolve() {
            calls.push("resolve");
            return { ok: true, policy: "LOCAL_TEST", engineUsed: "local" };
        },
        health() {
            calls.push("health");
            return { ok: true, status: "LOCAL_VIDEO_HARDWARE_READY" };
        },
        authorizeExternalCall() {
            throw new Error("EXTERNAL_MUST_NOT_BE_AUTHORIZED");
        },
        async start() {
            calls.push("start");
            return { ok: true, operationName: "local-video/fixture" };
        },
        async poll() {
            calls.push("poll");
            return { ok: true, done: false, operationName: "local-video/fixture" };
        },
        async cancel() {
            calls.push("cancel");
            return { ok: true, state: "CANCELLED" };
        },
        async cleanup() {
            calls.push("cleanup");
            return { ok: true, cleaned: true };
        }
    };
    const server = createJarvisFsBridgeApp({ root, localVideoEngine }).listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = route => fetch(`${base}${route}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-jarvis-release-id": "local-video-test-release"
        },
        body: "{}"
    });
    try {
        for (const route of [
            "/video/engine/resolve",
            "/video/local/health",
            "/video/local/start",
            "/video/local/poll",
            "/video/local/cancel",
            "/video/local/cleanup"
        ]) {
            const response = await request(route);
            assert.equal(response.status, 200, `${route}: ${await response.text()}`);
        }
        assert.deepEqual(calls, ["resolve", "health", "start", "poll", "cancel", "cleanup"]);
    }
    finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test("local worker persists one operation and registers a verified physical MP4", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-local-video-"));
    const runner = path.join(root, "runner.py");
    const model = path.join(root, "wan-model");
    fs.writeFileSync(runner, "# controlled test runner\n");
    fs.mkdirSync(model, { recursive: true });
    let launchEnvironment = null;

    const engine = createLocalVideoEngine({
        root,
        env: {
            JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
            JARVIS_LOCAL_VIDEO_ENABLED: "true",
            JARVIS_LOCAL_VIDEO_RUNNER: process.execPath,
            JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: runner,
            JARVIS_LOCAL_VIDEO_MODEL_DIR: model,
            GOOGLE_API_KEY: "must-not-reach-local-runner"
        },
        inspectHardware: healthyCapability,
        launch({ job, resultFile, onExit, env }) {
            launchEnvironment = env;
            physicalFixture(path.resolve(root, job.output));
            fs.writeFileSync(resultFile, JSON.stringify(successReceipt(job)));
            queueMicrotask(() => onExit(0));
            return { pid: 4242, kill() {} };
        },
        inspectVideo: () => ({ durationSeconds: 8, fps: 24, width: 704, height: 1280 })
    });

    const started = await engine.start({
        script: "Controlled offline generation fixture.",
        prompts: ["One local scene."],
        aspectRatio: "9:16",
        output: ".jarvis-artifacts/videos/local-test.mp4"
    });
    const completed = await engine.poll({ operationName: started.operationName });

    assert.equal(started.ok, true);
    assert.match(started.operationName, /^local-video\//);
    assert.equal(completed.ok, true);
    assert.equal(completed.status, "VIDEO_GENERATED_VERIFIED");
    assert.equal(completed.provider, "local");
    assert.equal(completed.engine, "local");
    assert.equal(completed.backend, "wan22-ti2v-5b");
    assert.equal(completed.externalApiUsed, false);
    assert.equal(completed.externalEstimatedCostUsd, 0);
    assert.equal(launchEnvironment.GOOGLE_API_KEY, undefined);
    assert.equal(launchEnvironment.HF_HUB_OFFLINE, "1");
    assert.equal(launchEnvironment.TRANSFORMERS_OFFLINE, "1");
    assert.equal(completed.physicallyWritten, true);
    assert.equal(completed.bytes, 120000);
    assert.equal(completed.width, 704);
    assert.equal(completed.height, 1280);
    assert.match(completed.sha256, /^[a-f0-9]{64}$/);
    assert.equal(fs.existsSync(path.join(root, completed.output)), true);
    assert.equal(
        listArtifacts({ root, type: "video" })[0].status,
        "VIDEO_GENERATED_VERIFIED"
    );

    const operationFile = path.join(
        root,
        ".jarvis-artifacts/.video-worker/operations",
        `${started.operationId}.json`
    );
    assert.equal(fs.existsSync(operationFile), true);
    assert.equal(JSON.parse(fs.readFileSync(operationFile, "utf8")).state, "SUCCEEDED");
});

test("local worker rejects a crossed success receipt before certifying an MP4", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-local-video-crossed-"));
    const runner = path.join(root, "runner.py");
    const model = path.join(root, "wan-model");
    fs.writeFileSync(runner, "# controlled test runner\n");
    fs.mkdirSync(model, { recursive: true });

    const engine = createLocalVideoEngine({
        root,
        env: {
            JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
            JARVIS_LOCAL_VIDEO_ENABLED: "true",
            JARVIS_LOCAL_VIDEO_RUNNER: process.execPath,
            JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: runner,
            JARVIS_LOCAL_VIDEO_MODEL_DIR: model
        },
        inspectHardware: healthyCapability,
        launch({ job, resultFile, onExit }) {
            physicalFixture(path.resolve(root, job.output));
            fs.writeFileSync(resultFile, JSON.stringify(successReceipt(job, {
                operationId: "00000000-0000-0000-0000-000000000000"
            })));
            queueMicrotask(() => onExit(0));
            return { pid: 4343, kill() {} };
        },
        inspectVideo: () => ({ durationSeconds: 8, fps: 24, width: 704, height: 1280 })
    });

    const started = await engine.start({
        script: "Crossed receipt must never certify.",
        prompts: ["One local scene."],
        output: ".jarvis-artifacts/videos/crossed.mp4"
    });
    const completed = await engine.poll({ operationName: started.operationName });

    assert.equal(started.ok, true);
    assert.equal(completed.ok, false);
    assert.equal(completed.done, true);
    assert.equal(completed.status, "LOCAL_VIDEO_RESULT_RECEIPT_MISMATCH");
    assert.equal(listArtifacts({ root, type: "video" }).length, 0);
});

test("local worker expires and kills a stale RUNNING operation", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-local-video-stale-"));
    const runner = path.join(root, "runner.py");
    const model = path.join(root, "wan-model");
    fs.writeFileSync(runner, "# controlled test runner\n");
    fs.mkdirSync(model, { recursive: true });
    let clock = new Date("2026-08-25T12:00:00.000Z");
    let killed = false;

    const engine = createLocalVideoEngine({
        root,
        env: {
            JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
            JARVIS_LOCAL_VIDEO_ENABLED: "true",
            JARVIS_LOCAL_VIDEO_RUNNER: process.execPath,
            JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: runner,
            JARVIS_LOCAL_VIDEO_MODEL_DIR: model,
            JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: "30"
        },
        inspectHardware: healthyCapability,
        now: () => new Date(clock),
        launch() {
            return { pid: 4444, kill() { killed = true; } };
        }
    });

    const started = await engine.start({
        script: "Stale worker fixture.",
        prompts: ["One pending local scene."],
        output: ".jarvis-artifacts/videos/stale.mp4"
    });
    clock = new Date(clock.getTime() + 91_000);
    const completed = await engine.poll({ operationName: started.operationName });

    assert.equal(started.ok, true);
    assert.equal(completed.ok, false);
    assert.equal(completed.done, true);
    assert.equal(completed.state, "FAILED");
    assert.equal(completed.status, "LOCAL_VIDEO_OPERATION_STALE");
    assert.equal(completed.retryable, true);
    assert.equal(killed, true);
});

test("local worker cancel and cleanup preserve the durable receipt", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-local-video-cancel-"));
    const runner = path.join(root, "runner.py");
    const model = path.join(root, "wan-model");
    fs.writeFileSync(runner, "# controlled test runner\n");
    fs.mkdirSync(model, { recursive: true });
    let killed = false;
    const engine = createLocalVideoEngine({
        root,
        env: {
            JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
            JARVIS_LOCAL_VIDEO_ENABLED: "true",
            JARVIS_LOCAL_VIDEO_RUNNER: process.execPath,
            JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: runner,
            JARVIS_LOCAL_VIDEO_MODEL_DIR: model
        },
        inspectHardware: healthyCapability,
        launch() {
            return { pid: 5252, kill() { killed = true; } };
        }
    });
    const started = await engine.start({
        script: "Cancellation fixture.",
        prompts: ["A pending local scene."],
        output: ".jarvis-artifacts/videos/cancelled.mp4"
    });
    const cancelled = await engine.cancel({ operationName: started.operationName });
    const cleaned = await engine.cleanup({ operationName: started.operationName });
    const receipt = JSON.parse(fs.readFileSync(path.join(
        root,
        ".jarvis-artifacts/.video-worker/operations",
        `${started.operationId}.json`
    ), "utf8"));

    assert.equal(killed, true);
    assert.equal(cancelled.state, "CANCELLED");
    assert.equal(cleaned.ok, true);
    assert.equal(cleaned.cleaned, true);
    assert.equal(receipt.state, "CANCELLED");
    assert.equal(receipt.cleaned, true);
    assert.equal(fs.existsSync(started.jobFile), false);
});

test("video.generate LOCAL_TEST executes one local operation with zero cloud calls", async () => {
    const runtime = runtimeFixture();
    registerJarvisActuatorTools(runtime);
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    const routes = [];
    let cloudCalls = 0;

    try {
        globalThis.fetch = async () => {
            cloudCalls += 1;
            throw new Error("EXTERNAL_PROVIDER_MUST_NOT_RUN");
        };
        globalThis.JarvisLocalBridge = {
            async requestJson(route, payload) {
                routes.push({ route, payload });
                if (route === "/video/engine/resolve") {
                    return {
                        ok: true,
                        status: "VIDEO_ENGINE_LOCAL_TEST",
                        policy: "LOCAL_TEST",
                        engineRequested: "LOCAL_TEST",
                        engineUsed: "local",
                        fallbackUsed: false,
                        fallbackReason: null,
                        externalApiUsed: false,
                        externalEstimatedCostUsd: 0
                    };
                }
                if (route === "/video/local/start") {
                    return {
                        ok: true,
                        status: "LOCAL_VIDEO_GENERATION_STARTED",
                        operationId: "offline-one",
                        operationName: "local-video/offline-one"
                    };
                }
                if (route === "/video/local/poll") {
                    return {
                        ok: true,
                        done: true,
                        status: "VIDEO_GENERATED_VERIFIED",
                        operationId: "offline-one",
                        operationName: "local-video/offline-one",
                        output: ".jarvis-artifacts/videos/offline-one.mp4",
                        mimeType: "video/mp4",
                        bytes: 120000,
                        sha256: "d".repeat(64),
                        physicallyWritten: true,
                        durationSeconds: 8,
                        fps: 24,
                        width: 704,
                        height: 1280,
                        provider: "local",
                        backend: "wan22-ti2v-5b",
                        model: "Wan2.2-TI2V-5B",
                        engine: "local",
                        externalApiUsed: false,
                        externalEstimatedCostUsd: 0
                    };
                }
                throw new Error(`Unexpected bridge route: ${route}`);
            }
        };

        const result = await runtime.get("video.generate").execute({
            prompt: "A controlled local-only test scene.",
            output: ".jarvis-artifacts/videos/offline-one.mp4"
        }, { waitForVideoPoll: async () => {} });

        assert.equal(result.ok, true);
        assert.equal(result.status, "VIDEO_GENERATED_VERIFIED");
        assert.equal(result.engineRequested, "LOCAL_TEST");
        assert.equal(result.engineUsed, "local");
        assert.equal(result.externalApiUsed, false);
        assert.equal(result.externalEstimatedCostUsd, 0);
        assert.equal(result.verifiedArtifactDelivery, true);
        assert.equal(cloudCalls, 0);
        assert.equal(routes.filter(item => item.route === "/video/local/start").length, 1);
        assert.equal(routes.filter(item => item.route === "/video/local/poll").length, 1);
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
    }
});

test("LOCAL_PREFERRED uses an explicit budgeted fallback after a recoverable local runtime failure", async () => {
    const runtime = runtimeFixture();
    registerJarvisActuatorTools(runtime);
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    const previousAuth = globalThis.auth;
    const routes = [];
    const cloudCalls = [];

    try {
        globalThis.auth = { currentUser: { getIdToken: async () => "fallback-token" } };
        globalThis.fetch = async (_url, options = {}) => {
            const data = JSON.parse(options.body).data;
            cloudCalls.push(data);
            const result = data.action === "start"
                ? { ok: true, operationName: "operations/explicit-local-fallback" }
                : data.action === "poll"
                    ? {
                        ok: true,
                        done: true,
                        operationName: data.operationName,
                        downloadUrl: "https://firebasestorage.googleapis.com/fallback.mp4",
                        storageObject: "jarvis-video-temp/fallback.mp4",
                        sha256: "b".repeat(64),
                        provider: "google-veo-vertex",
                        model: "veo-3.1-generate-001"
                    }
                    : { ok: true };
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ result })
            };
        };
        globalThis.JarvisLocalBridge = {
            async requestJson(route, payload) {
                routes.push({ route, payload });
                if (route === "/video/engine/resolve") {
                    return {
                        ok: true,
                        policy: "LOCAL_PREFERRED",
                        engineRequested: "LOCAL_PREFERRED",
                        engineUsed: "local",
                        externalFallbackEnabled: true,
                        fallbackUsed: false,
                        externalApiUsed: false,
                        externalEstimatedCostUsd: 0
                    };
                }
                if (route === "/video/local/start") {
                    return {
                        ok: false,
                        status: "LOCAL_VIDEO_RUNNER_START_FAILED",
                        error: "controlled recoverable local failure",
                        retryable: true
                    };
                }
                if (route === "/video/engine/authorize-external") {
                    return {
                        ok: true,
                        status: "EXTERNAL_VIDEO_CALL_AUTHORIZED",
                        externalApiUsed: true,
                        externalEstimatedCostUsd: 0.25
                    };
                }
                if (route === "/video/import") {
                    return {
                        ok: true,
                        output: payload.output,
                        bytes: 120000,
                        sha256: payload.expectedSha256,
                        physicallyWritten: true
                    };
                }
                throw new Error(`Unexpected bridge route: ${route}`);
            }
        };

        const result = await runtime.get("video.generate").execute({
            prompt: "Recover explicitly without hiding the provider.",
            output: ".jarvis-artifacts/videos/explicit-fallback.mp4"
        }, { waitForVideoPoll: async () => {} });

        assert.equal(result.ok, true);
        assert.equal(result.engineRequested, "LOCAL_PREFERRED");
        assert.equal(result.engineUsed, "external");
        assert.equal(result.fallbackUsed, true);
        assert.equal(result.fallbackReason, "LOCAL_VIDEO_RUNNER_START_FAILED");
        assert.equal(result.externalApiUsed, true);
        assert.equal(result.externalEstimatedCostUsd, 0.25);
        assert.equal(cloudCalls.filter(call => call.action === "start").length, 1);
        assert.equal(routes.filter(item => item.route === "/video/local/start").length, 1);
        assert.equal(routes.filter(item => item.route === "/video/engine/authorize-external").length, 1);
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
        globalThis.auth = previousAuth;
    }
});