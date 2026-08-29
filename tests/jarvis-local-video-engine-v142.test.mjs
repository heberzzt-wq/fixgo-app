import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import {
    buildLocalAiCapabilityReport,
    createLocalVideoEngine,
    createRunpodRemoteVideoAdapter,
    describeLocalVideoPolicy,
    estimateExternalVideoGeneration,
    RUNPOD_CPU_STAGING_PROFILE,
    RUNPOD_WAN22_GPU_PROFILES,
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
    const physicalBytes = fs.existsSync(job.outputFile) ? fs.readFileSync(job.outputFile) : Buffer.alloc(0);
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
        bytes: physicalBytes.length,
        sha256: physicalBytes.length > 0
            ? createHash("sha256").update(physicalBytes).digest("hex")
            : null,
        referenceAssetCount: job.referenceFiles.length,
        durationSeconds: 8,
        fps: 24,
        width: 704,
        height: 1280,
        ...overrides
    };
}

test("V142 local video policy defaults to LOCAL_PREFERRED without changing the public tool", () => {
    const policy = describeLocalVideoPolicy({});
    const resolved = resolveVideoEngine({ policy, health: { ok: false } });

    assert.equal(policy.mode, "LOCAL_PREFERRED");
    assert.equal(policy.localVideoEnabled, true);
    assert.equal(policy.externalFallbackEnabled, true);
    assert.equal(resolved.ok, true);
    assert.equal(resolved.engineRequested, "LOCAL_PREFERRED");
    assert.equal(resolved.engineUsed, "external");
    assert.equal(resolved.provider, "google-veo");
    assert.equal(resolved.fallbackUsed, true);
    assert.equal(resolved.fallbackReason, "LOCAL_VIDEO_WORKER_UNAVAILABLE");
});

function localBackend({
    backend,
    model,
    ok = true,
    certified = true,
    status = "LOCAL_VIDEO_BACKEND_READY",
    imageToVideo,
    maximumReferenceAssets
}) {
    return {
        backend,
        model,
        ok,
        certified,
        status,
        imageToVideo,
        maximumReferenceAssets
    };
}

function controlledBashExecutable() {
    if (process.platform !== "win32") return "/bin/bash";
    const candidates = [
        path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
        path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "usr", "bin", "bash.exe")
    ];
    return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function controlledPythonExecutable() {
    const candidates = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
    return candidates.find(candidate => {
        try {
            execFileSync(candidate, ["--version"], { stdio: "ignore" });
            return true;
        }
        catch {
            return false;
        }
    }) || null;
}

function bashPath(file) {
    const resolved = path.resolve(file);
    if (process.platform !== "win32") return resolved.replaceAll("\\", "/");
    const match = resolved.match(/^([A-Za-z]):[\\/](.*)$/);
    return match ? `/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}` : resolved;
}

function mockHttpResponse(status, payload = null, responseHeaders = {}) {
    const normalizedHeaders = new Map(
        Object.entries(responseHeaders).map(([name, value]) => [String(name).toLowerCase(), String(value)])
    );
    return {
        status,
        headers: {
            entries: () => normalizedHeaders.entries(),
            get: name => normalizedHeaders.get(String(name).toLowerCase()) || null
        },
        text: async () => payload === null ? "" : JSON.stringify(payload)
    };
}

function verifiedRegistryEvidence(profile, overrides = {}) {
    return {
        registry: profile.registry,
        repository: profile.repository,
        tag: profile.tag,
        expectedDigest: profile.expectedRegistryDigest,
        observedDigest: profile.expectedRegistryDigest,
        checkedAt: "2026-08-28T21:00:00.000Z",
        status: "REGISTRY_DIGEST_VERIFIED",
        ...overrides
    };
}

function runpodPhysicalHarness({
    scenario = "success",
    rootOverride = null,
    clock = null,
    availability = {},
    apiKey = "test-runpod-api-key-never-persist",
    gpuTypeId = "NVIDIA A40",
    networkVolumeId = "",
    networkVolumeSizeGb = 50,
    networkVolumeDataCenterId = gpuTypeId === "NVIDIA L40S" ? "EU-NL-1" : "CA-MTL-1",
    networkVolumeType = "STANDARD",
    bootstrapProgressSequence = [],
    baseHealthOverrides = {},
    runtimeHealthOverrides = {},
    bridgeIdentity = { ok: true, status: "BRIDGE_IDENTITY_OK" },
    resolvedCanonicalSha = null,
    emptyPublicKey = false,
    envOverrides = {},
    durableIdentity = null
} = {}) {
    const root = rootOverride || fs.mkdtempSync(path.join(os.tmpdir(), `jarvis-runpod-${scenario}-`));
    const runner = path.join(root, "jarvis-local-video-wan22.py");
    fs.writeFileSync(runner, "# controlled existing V142 runner\n");
    const referenceOutput = ".jarvis-artifacts/images/runpod-reference.png";
    const referenceFile = path.join(root, referenceOutput);
    fs.mkdirSync(path.dirname(referenceFile), { recursive: true });
    fs.writeFileSync(referenceFile, Buffer.from("physical-runpod-reference"));
    const env = {
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
        JARVIS_LOCAL_VIDEO_ENABLED: "true",
        JARVIS_LOCAL_VIDEO_EXECUTION_TARGET: "remote",
        JARVIS_LOCAL_VIDEO_MODEL: "wan22-ti2v-5b",
        JARVIS_LOCAL_VIDEO_RUNNER: process.execPath,
        JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: runner,
        JARVIS_REMOTE_GPU_PROVIDER: "runpod",
        JARVIS_RUNPOD_GPU_TYPE_ID: gpuTypeId,
        JARVIS_RUNPOD_CLOUD_TYPE: networkVolumeId ? "SECURE" : "COMMUNITY",
        JARVIS_REMOTE_GPU_HARD_BUDGET_USD: "2",
        JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "true",
        JARVIS_RUNPOD_CANONICAL_SHA: "c784dc38a9e3be7f070ec918cc1c5a27c587a37e",
        JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: "7200",
        JARVIS_SSH_PATH: process.execPath,
        JARVIS_SCP_PATH: process.execPath,
        JARVIS_SSH_KEYGEN_PATH: process.execPath,
        RUNPOD_API_KEY: apiKey,
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT
    };
    if (networkVolumeId) env.JARVIS_RUNPOD_NETWORK_VOLUME_ID = networkVolumeId;
    Object.assign(env, envOverrides);
    const calls = [];
    let deleted = false;
    let orphanDeleted = false;
    let podGets = 0;
    let createdBody = null;
    let capturedJob = null;
    let healthCalls = 0;
    let transportTimeouts = 0;
    let bootstrapStarts = 0;
    let inferenceStarts = 0;
    let bootstrapMarkerChecks = 0;
    let bootstrapProgressChecks = 0;
    let availabilityTransportFailures = scenario === "availability-transport-once" ? 1 : 0;
    const remoteAssets = new Map();
    const goodVideo = Buffer.alloc(120000, 7);
    goodVideo.write("0000ftypisom", 0, "ascii");
    const badVideo = Buffer.alloc(120000, 9);
    const outputBytes = scenario === "bad-mp4" ? badVideo : goodVideo;
    const outputSha = createHash("sha256").update(outputBytes).digest("hex");
    const gpuImageProfile = RUNPOD_WAN22_GPU_PROFILES[gpuTypeId] || RUNPOD_WAN22_GPU_PROFILES["NVIDIA A40"];
    const gpuRegistryVerification = verifiedRegistryEvidence(gpuImageProfile);
    const cpuRegistryVerification = verifiedRegistryEvidence(RUNPOD_CPU_STAGING_PROFILE);

    const fetchImpl = async (url, options = {}) => {
        const safeUrl = String(url)
            .replace(env.RUNPOD_API_KEY, "[REDACTED]")
            .replace(encodeURIComponent(env.RUNPOD_API_KEY), "[REDACTED]");
        calls.push({
            kind: "http",
            url: safeUrl,
            method: options.method || "GET",
            authorizationMatches: options.headers?.Authorization === `Bearer ${env.RUNPOD_API_KEY}`,
            encodedKeyMatches: String(url).includes(encodeURIComponent(env.RUNPOD_API_KEY))
        });
        if (String(url).startsWith("https://auth.docker.io/token")) {
            if (scenario === "registry-unverifiable") return mockHttpResponse(503, { error: "controlled" });
            return mockHttpResponse(200, { token: "fixture" });
        }
        if (String(url).startsWith("https://registry-1.docker.io/v2/")) {
            if (scenario === "registry-unverifiable") return mockHttpResponse(503, { error: "controlled" });
            const expectedDigest = String(url).includes("/library/ubuntu/")
                ? RUNPOD_CPU_STAGING_PROFILE.expectedRegistryDigest
                : gpuImageProfile.expectedRegistryDigest;
            return mockHttpResponse(200, null, {
                "content-type": "application/vnd.oci.image.index.v1+json",
                "docker-content-digest": scenario === "registry-digest-mismatch"
                    ? `sha256:${"f".repeat(64)}`
                    : expectedDigest
            });
        }
        if (String(url).includes("/graphql")) {
            if (availabilityTransportFailures > 0) {
                availabilityTransportFailures -= 1;
                const error = new Error(
                    `UNABLE_TO_VERIFY_LEAF_SIGNATURE credential=${env.RUNPOD_API_KEY} encoded=${encodeURIComponent(env.RUNPOD_API_KEY)}`
                );
                error.code = "UNABLE_TO_VERIFY_LEAF_SIGNATURE";
                throw error;
            }
            const query = JSON.parse(options.body || "{}").query || "";
            const availableGpuCounts = Object.hasOwn(availability, "availableGpuCounts")
                ? availability.availableGpuCounts
                : [1];
            return mockHttpResponse(200, {
                data: {
                    myself: availability.authenticated === false || !query.includes("myself { id }")
                        ? null
                        : { id: "runpod-user-v142" },
                    gpuTypes: [{
                        id: availability.gpuId || gpuTypeId,
                        displayName: gpuTypeId.replace("NVIDIA ", ""),
                        memoryInGb: availability.vramGb ?? 48,
                        lowestPrice: {
                            stockStatus: availability.stockStatus || "High",
                            uninterruptablePrice: availability.hourlyRateUsd ?? (gpuTypeId === "NVIDIA L40S" ? 0.99 : 0.44),
                            availableGpuCounts
                        }
                    }],
                    ...(query.includes("dataCenters") ? {
                        dataCenters: [{
                            id: networkVolumeDataCenterId,
                            gpuAvailability: [{
                                gpuTypeId,
                                stockStatus: "Low",
                                available: true
                            }]
                        }]
                    } : {})
                }
            });
        }
        if (String(url).endsWith("/pods") && (options.method || "GET") === "GET") {
            if (scenario === "existing-obligation-pod") {
                const fingerprint = createHash("sha256")
                    .update(`${payload.missionId}\n${payload.objectiveId}\n${payload.obligationId}\n${payload.rootInstructionHash}`)
                    .digest("hex");
                return mockHttpResponse(200, orphanDeleted ? [] : [{
                    id: "pod-existing-obligation",
                    name: "untrusted-old-name",
                    env: { JARVIS_OBLIGATION_FINGERPRINT: fingerprint }
                }]);
            }
            return mockHttpResponse(200, []);
        }
        if (String(url).includes("/v2/catalog/datacenters/") && (options.method || "GET") === "GET") {
            return mockHttpResponse(200, {
                id: networkVolumeDataCenterId,
                networkVolumeTypes: [networkVolumeType]
            });
        }
        if (String(url).includes("/networkvolumes/") && (options.method || "GET") === "GET") {
            return mockHttpResponse(200, {
                id: networkVolumeId,
                dataCenterId: networkVolumeDataCenterId,
                size: networkVolumeSizeGb,
                type: networkVolumeType
            });
        }
        if (String(url).endsWith("/pods") && options.method === "POST") {
            createdBody = JSON.parse(options.body);
            if (scenario === "provision-fail") return mockHttpResponse(503, { error: "controlled" });
            if (scenario === "provision-http-500-diagnostic") {
                return mockHttpResponse(500, {
                    error: "internal scheduling error",
                    credential: env.RUNPOD_API_KEY
                }, {
                    "content-type": "application/json; charset=utf-8",
                    "x-request-id": "req-v142-cpu-500",
                    "set-cookie": "provider-session-must-not-persist"
                });
            }
            return mockHttpResponse(201, {
                id: "pod-a40-v142",
                desiredStatus: "RUNNING",
                costPerHr: String(gpuTypeId === "NVIDIA L40S" ? 0.99 : 0.44),
                gpu: { id: gpuTypeId, memoryInGb: 48 }
            });
        }
        if (String(url).includes("/billing/pods")) return mockHttpResponse(200, []);
        if (String(url).includes("/pods/pod-a40-v142") && options.method === "DELETE") {
            if (scenario === "release-fail") return mockHttpResponse(500, { error: "controlled" });
            deleted = true;
            return mockHttpResponse(204);
        }
        if (String(url).includes("/pods/pod-existing-obligation") && options.method === "DELETE") {
            orphanDeleted = true;
            return mockHttpResponse(204);
        }
        if (String(url).includes("/pods/pod-existing-obligation")) {
            return orphanDeleted
                ? mockHttpResponse(404, { error: "Pod not found" })
                : mockHttpResponse(200, { id: "pod-existing-obligation", desiredStatus: "RUNNING" });
        }
        if (String(url).includes("/pods/pod-a40-v142")) {
            podGets += 1;
            if (scenario === "poll-timeout" && transportTimeouts++ === 0) {
                const error = new Error("ETIMEDOUT controlled");
                error.code = "ETIMEDOUT";
                throw error;
            }
            if (deleted) return mockHttpResponse(404, { error: "Pod not found" });
            return mockHttpResponse(200, {
                id: "pod-a40-v142",
                desiredStatus: "RUNNING",
                publicIp: "203.0.113.42",
                portMappings: { "22": 22122 }
            });
        }
        throw new Error(`unexpected mock URL: ${safeUrl}`);
    };

    const execute = async (_command, args) => {
        calls.push({ kind: args.includes("-P") ? "scp" : "ssh" });
        if (args.includes("-P")) {
            const source = args.at(-2);
            const destination = args.at(-1);
            if (String(source).startsWith("root@")) {
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.writeFileSync(destination, outputBytes);
            }
            else {
                const remote = String(destination).slice(String(destination).indexOf(":") + 1);
                if (String(source).endsWith("job.json")) capturedJob = JSON.parse(fs.readFileSync(source, "utf8"));
                if (fs.existsSync(source)) {
                    remoteAssets.set(remote, createHash("sha256").update(fs.readFileSync(source)).digest("hex"));
                }
            }
            return { stdout: "", stderr: "", exitCode: 0 };
        }
        const command = String(args.at(-1) || "");
        if (command.includes("python3 -c")) {
            healthCalls += 1;
            const health = scenario === "health-fail" && healthCalls === 1
                ? { python: true, torch: true, cuda: false, gpuName: "", vramGb: 0, freeDiskGb: 100 }
                : {
                    python: true,
                    pythonVersion: "3.12.3",
                    torch: true,
                    torchVersion: "2.8.0+cu128",
                    torchCudaVersion: "12.8",
                    cuda: true,
                    gpuName: gpuTypeId,
                    computeCapability: gpuTypeId === "NVIDIA L40S" ? "8.9" : "8.6",
                    vramGb: 48,
                    freeDiskGb: 100,
                    ffmpeg: true,
                    ffprobe: true,
                    nvcc: true,
                    runner: true,
                    wanRepository: true,
                    wanModel: true,
                    dependencyContract: scenario === "runtime-health-fail" && healthCalls > 1 ? false : true,
                    pipCheck: scenario === "runtime-health-fail" && healthCalls > 1 ? false : true,
                    wanCliImport: scenario === "runtime-health-fail" && healthCalls > 1 ? false : true,
                    flashAttention: scenario === "runtime-health-fail" && healthCalls > 1 ? false : true,
                    flashAttentionCudaProbe: scenario === "runtime-health-fail" && healthCalls > 1 ? false : true,
                    imports: scenario === "runtime-health-fail" && healthCalls > 1 ? false : true,
                    cudaProbe: true,
                    runtimeCudaProbe: scenario === "runtime-health-fail" && healthCalls > 1 ? false : true
                };
            Object.assign(health, healthCalls > 1 ? runtimeHealthOverrides : baseHealthOverrides);
            return { stdout: `${JSON.stringify(health)}\n`, stderr: "", exitCode: 0 };
        }
        if (command.includes("sha256sum") && command.includes("stat -c")) {
            const sha = scenario === "bad-sha" ? "0".repeat(64) : outputSha;
            return { stdout: `${sha}  output.mp4\n${outputBytes.length}\n`, stderr: "", exitCode: 0 };
        }
        if (command.includes("sha256sum")) {
            const remoteFile = [...remoteAssets.keys()].find(file => command.includes(file));
            return { stdout: `${remoteAssets.get(remoteFile)}  ${remoteFile}\n`, stderr: "", exitCode: 0 };
        }
        if (command.includes("rm -f") && command.includes("bootstrap.failed") && command.includes("nohup")) {
            if (scenario === "bootstrap-refresh" && bootstrapStarts === 0) {
                const remoteBootstrap = [...remoteAssets.keys()].find(file => file.endsWith("/bootstrap.sh"));
                remoteAssets.set(remoteBootstrap, createHash("sha256").update("legacy-bootstrap").digest("hex"));
            }
            bootstrapStarts += 1;
            return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (command.includes("bootstrap-progress.json") && command.includes("cat ")) {
            const progress = bootstrapProgressSequence[Math.min(
                bootstrapProgressChecks,
                Math.max(0, bootstrapProgressSequence.length - 1)
            )];
            bootstrapProgressChecks += 1;
            return { stdout: progress ? `${JSON.stringify(progress)}\n` : "", stderr: "", exitCode: 0 };
        }
        if (command.startsWith("if test -f") && command.includes("bootstrap.ready")) {
            if (scenario === "bootstrap-fail") return { stdout: "FAILED\n", stderr: "", exitCode: 0 };
            if (scenario === "bootstrap-refresh" && bootstrapMarkerChecks++ === 0) {
                return { stdout: "FAILED\n", stderr: "", exitCode: 0 };
            }
            if (bootstrapProgressSequence.length > 0 && bootstrapProgressChecks < bootstrapProgressSequence.length) {
                return { stdout: "RUNNING\n", stderr: "", exitCode: 0 };
            }
            return { stdout: "READY\n", stderr: "", exitCode: 0 };
        }
        if (command.includes("echo $!")) {
            if (command.includes("jarvis-local-video-wan22.py")) inferenceStarts += 1;
            return { stdout: "4242\n", stderr: "", exitCode: 0 };
        }
        if (command.includes("kill -0")) return { stdout: "RESULT\n", stderr: "", exitCode: 0 };
        if (command.startsWith("cat ")) {
            const result = scenario === "job-failure"
                ? {
                    ok: false,
                    status: "RUNPOD_WAN_GENERATION_FAILED",
                    error: "RUNPOD_WAN_GENERATION_FAILED",
                    retryable: false
                }
                : {
                    ok: true,
                    status: "LOCAL_VIDEO_RUNNER_COMPLETED",
                    operationId: capturedJob.operationId,
                    operationName: capturedJob.operationName,
                    output: capturedJob.output,
                    mimeType: "video/mp4",
                    backend: capturedJob.backend,
                    model: capturedJob.model,
                    engine: "local",
                    provider: "local",
                    externalApiUsed: false,
                    externalEstimatedCostUsd: 0,
                    referenceAssetCount: capturedJob.referenceFiles.length,
                    durationSeconds: 8,
                    fps: 24,
                    width: 704,
                    height: 1280
                };
            return { stdout: JSON.stringify(result), stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
    };

    const generateKeyPair = ({ privateKeyFile, publicKeyFile }) => {
        fs.writeFileSync(privateKeyFile, "controlled-private-key");
        fs.writeFileSync(publicKeyFile, emptyPublicKey ? "" : "ssh-ed25519 controlled-public-key jarvis-test\n");
    };
    const now = () => new Date(clock?.value || "2026-08-27T12:00:00.000Z");
    const adapter = createRunpodRemoteVideoAdapter({
        root,
        env,
        fetchImpl,
        execute,
        generateKeyPair,
        now,
        inspectBridgeIdentity: () => bridgeIdentity,
        resolveCanonicalSha: () => resolvedCanonicalSha || env.JARVIS_RUNPOD_CANONICAL_SHA
    });
    const engine = createLocalVideoEngine({
        root,
        env,
        inspectHardware: adapter.inspectHardware,
        launch: adapter.launch,
        pollRemote: adapter.poll,
        release: adapter.release,
        inspectVideo: () => ({ durationSeconds: 8, fps: 24, width: 704, height: 1280 }),
        now
    });
    const payload = {
        script: "Use the verified reference in one short Wan2.2 clip.",
        prompts: ["A short controlled vertical shot."],
        referenceOutputs: [referenceOutput],
        output: `.jarvis-artifacts/videos/runpod-${scenario}.mp4`,
        missionId: durableIdentity?.missionId || `MISSION-RUNPOD-${scenario}`,
        objectiveId: durableIdentity?.objectiveId || `OBJECTIVE-RUNPOD-${scenario}`,
        obligationId: durableIdentity?.obligationId || `video.generate:runpod-${scenario}`,
        rootInstructionHash: durableIdentity?.rootInstructionHash || createHash("sha256").update(`root-${scenario}`).digest("hex")
    };
    const dryRunJob = {
        operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        operationName: "local-video/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        executionTarget: "remote",
        backend: "wan22-ti2v-5b",
        model: "Wan2.2-TI2V-5B",
        missionId: payload.missionId,
        objectiveId: payload.objectiveId,
        obligationId: payload.obligationId,
        rootInstructionHash: payload.rootInstructionHash,
        externalApiAllowed: false,
        referenceOutputs: [referenceOutput],
        referenceFiles: [referenceFile],
        sourceReferenceOutputs: [referenceOutput],
        sourceReferenceFiles: [referenceFile]
    };
    return {
        root,
        env,
        adapter,
        engine,
        payload,
        dryRunJob,
        gpuRegistryVerification,
        cpuRegistryVerification,
        calls,
        get createdBody() { return createdBody; },
        get podGets() { return podGets; },
        get deleted() { return deleted; },
        get orphanDeleted() { return orphanDeleted; },
        get bootstrapStarts() { return bootstrapStarts; },
        get inferenceStarts() { return inferenceStarts; }
    };
}

async function pollRunpodUntilDone(engine, operationName, maximumPolls = 8) {
    let current = null;
    for (let index = 0; index < maximumPolls; index += 1) {
        current = await engine.poll({ operationName });
        if (current.done === true) return current;
    }
    assert.fail(`RunPod mock did not finish: ${JSON.stringify(current)}`);
}

test("V142 RunPod zero-cost dry run exposes the exact sanitized future Pod payload without provider traffic", () => {
    const harness = runpodPhysicalHarness({
        scenario: "zero-cost-dry-run",
        networkVolumeId: "future-network-volume-v142"
    });
    const report = harness.adapter.inspectZeroCostPrecheck({
        job: harness.dryRunJob,
        registryVerification: harness.gpuRegistryVerification,
        networkVolume: {
            id: "future-network-volume-v142",
            dataCenterId: "CA-MTL-1",
            sizeGb: 50,
            type: "STANDARD"
        },
        availability: {
            gpuTypeId: "NVIDIA A40",
            vramGb: 48,
            hourlyRateUsd: 0.44,
            stockStatus: "Low"
        }
    });
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.phase, "ZERO_COST_PRECHECK");
    assert.equal(report.paidResourceCreationAuthorized, true);
    assert.equal(report.payload.networkVolumeId, "future-network-volume-v142");
    assert.deepEqual(report.payload.dataCenterIds, ["CA-MTL-1"]);
    assert.equal(report.payload.cloudType, "SECURE");
    assert.equal(report.payload.computeType, "GPU");
    assert.deepEqual(report.payload.gpuTypeIds, ["NVIDIA A40"]);
    assert.equal(report.payload.imageName, "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404");
    assert.doesNotMatch(report.payload.imageName, /@sha256:/i);
    assert.equal(report.contract.registryVerification.status, "REGISTRY_DIGEST_VERIFIED");
    assert.equal(report.payload.env.PUBLIC_KEY, "[EPHEMERAL_PUBLIC_KEY]");
    assert.equal(JSON.stringify(report).includes(harness.env.RUNPOD_API_KEY), false);
    assert.equal(JSON.stringify(report).includes("PRIVATE KEY"), false);
    assert.equal(report.economics.hardBudgetUsd, 2);
    assert.equal(report.economics.stopRatio, 0.95);
    assert.equal(report.economics.maximumSpendBeforeCleanupUsd, 1.9);
    assert.equal(report.cache.expectedStatus, "CACHE_MISS");
    assert.equal(harness.calls.length, 0);
});

test("V142 RunPod accepts only the explicitly selected L40S 48GB / CC 8.9 profile in EU-NL-1", () => {
    const volumeId = "future-network-volume-l40s-v142";
    const harness = runpodPhysicalHarness({
        scenario: "l40s-zero-cost-dry-run",
        gpuTypeId: "NVIDIA L40S",
        networkVolumeId: volumeId,
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
    });
    const report = harness.adapter.inspectZeroCostPrecheck({
        job: harness.dryRunJob,
        registryVerification: harness.gpuRegistryVerification,
        networkVolume: { id: volumeId, dataCenterId: "EU-NL-1", sizeGb: 50, type: "STANDARD" },
        availability: {
            gpuTypeId: "NVIDIA L40S",
            vramGb: 48,
            hourlyRateUsd: 0.99,
            stockStatus: "LOW"
        }
    });
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.deepEqual(report.payload.gpuTypeIds, ["NVIDIA L40S"]);
    assert.deepEqual(report.payload.dataCenterIds, ["EU-NL-1"]);
    assert.equal(report.payload.minRAMPerGPU, 62);
    assert.equal(report.payload.minVCPUPerGPU, 16);
    assert.equal(report.contract.gpuTypeId, "NVIDIA L40S");
    assert.equal(report.contract.computeCapability, "8.9");
    assert.equal(report.cache.profile, "wan22-ti2v-5b-l40s-v2");
    assert.equal(report.paidResourceCreationAuthorized, false);
    assert.equal(harness.calls.length, 0);
});

test("V142 RunPod never substitutes A40 or another GPU for an explicitly authorized L40S obligation", async t => {
    for (const [name, gpuId] of [["A40", "NVIDIA A40"], ["other GPU", "NVIDIA RTX 6000 Ada"]]) {
        await t.test(name, async () => {
            const harness = runpodPhysicalHarness({
                scenario: `l40s-no-fallback-${name.replaceAll(" ", "-")}`,
                gpuTypeId: "NVIDIA L40S",
                networkVolumeId: "network-volume-l40s-v142",
                availability: { gpuId }
            });
            const started = await harness.engine.start(harness.payload);
            assert.equal(started.ok, false, JSON.stringify(started));
            assert.equal(started.error, "RUNPOD_COMPATIBLE_GPU_UNAVAILABLE");
            assert.equal(harness.createdBody, null);
        });
    }
});

test("V142 L40S Network Volume is pinned to EU-NL-1 before any paid request", () => {
    const volumeId = "network-volume-l40s-wrong-dc";
    const harness = runpodPhysicalHarness({
        scenario: "l40s-wrong-datacenter",
        gpuTypeId: "NVIDIA L40S",
        networkVolumeId: volumeId,
        networkVolumeDataCenterId: "US-TX-3",
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
    });
    const report = harness.adapter.inspectZeroCostPrecheck({
        job: harness.dryRunJob,
        registryVerification: harness.gpuRegistryVerification,
        networkVolume: { id: volumeId, dataCenterId: "US-TX-3", sizeGb: 50, type: "STANDARD" },
        availability: {
            gpuTypeId: "NVIDIA L40S",
            vramGb: 48,
            hourlyRateUsd: 0.99,
            stockStatus: "Low"
        }
    });
    assert.equal(report.ok, false);
    assert.equal(report.error, "RUNPOD_GPU_NETWORK_VOLUME_DATACENTER_NOT_APPROVED");
    assert.equal(harness.calls.length, 0);
});

test("V142 CPU staging in EU-NL-1 can prepare model bytes but cannot certify GPU runtime", () => {
    const volumeId = "network-volume-eu-nl-1-v142";
    const harness = runpodPhysicalHarness({
        scenario: "cpu-staging-read-only",
        gpuTypeId: "NVIDIA L40S",
        networkVolumeId: volumeId,
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
    });
    const report = harness.adapter.inspectCpuStagingPrecheck({
        job: harness.dryRunJob,
        sshKeyRegistered: true,
        registryVerification: harness.cpuRegistryVerification,
        networkVolume: { id: volumeId, dataCenterId: "EU-NL-1", sizeGb: 50, type: "STANDARD" },
        inventory: {
            cpuFlavorId: "cpu3c",
            dataCenterId: "EU-NL-1",
            minimumVcpu: 2,
            ramMultiplier: 2,
            securePriceUsdPerHour: 0.06,
            stockStatus: "HIGH"
        }
    });
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.status, "CPU_STAGING_AVAILABLE_READ_ONLY");
    assert.equal(report.liveCapacityConfirmed, true);
    assert.equal(report.resourceCreationPossible, false);
    assert.equal(report.paidResourceCreationAuthorized, false);
    assert.deepEqual(report.payload, {
        cloudType: "SECURE",
        computeType: "CPU",
        containerDiskInGb: 20,
        cpuFlavorIds: ["cpu3c"],
        cpuFlavorPriority: "custom",
        dataCenterIds: ["EU-NL-1"],
        dataCenterPriority: "custom",
        dockerStartCmd: [...RUNPOD_CPU_STAGING_PROFILE.dockerStartCmd],
        imageName: "ubuntu:22.04",
        interruptible: false,
        networkVolumeId: volumeId,
        ports: ["22/tcp"],
        supportPublicIp: true,
        vcpuCount: 2,
        volumeMountPath: "/workspace"
    });
    assert.doesNotMatch(report.payload.imageName, /@sha256:/i);
    assert.notEqual(
        report.payload.imageName,
        RUNPOD_WAN22_GPU_PROFILES["NVIDIA L40S"].provisionImageTag
    );
    assert.equal(report.cache.cpuCompletionStatus, "CACHE_MODEL_READY");
    assert.equal(report.cache.runtimeVerificationStatus, "CACHE_RUNTIME_PHYSICALLY_UNVERIFIED");
    assert.ok(report.cache.allowedStages.includes("hf_download"));
    assert.ok(report.cache.forbiddenCertifications.includes("flash_attention_cuda"));
    assert.ok(report.cache.forbiddenCertifications.includes("CACHE_HIT"));
    assert.deepEqual(report.contract.runtimeIdentity.forbiddenTools, [
        "cuda",
        "pytorch-cuda",
        "nvcc",
        "flash-attention"
    ]);
    assert.equal(JSON.stringify(report.contract.runtimeIdentity).includes("torchVersionPrefix"), false);
    assert.equal(RUNPOD_WAN22_GPU_PROFILES["NVIDIA L40S"].computeCapability, "8.9");
    assert.equal(report.contract.registryVerification.status, "REGISTRY_DIGEST_VERIFIED");
    assert.equal(report.contract.maximumContainerDiskGb, 20);
    assert.equal(report.contract.dataCenterId, "EU-NL-1");
    assert.equal(report.contract.networkVolumeType, "STANDARD");
    assert.equal(report.contract.minimumNetworkVolumeGb, 50);
    assert.deepEqual(report.contract.supportedVcpuCounts, [1, 2, 4, 8]);
    assert.equal(report.contract.ramGbPerVcpu, 2);
    assert.equal(harness.calls.length, 0);
});

test("V142 CPU model staging bootstrap is Ubuntu-minimal safe and structurally capped at CACHE_MODEL_READY", () => {
    const volumeId = "network-volume-cpu-bootstrap-v142";
    const harness = runpodPhysicalHarness({
        scenario: "cpu-bootstrap-contract",
        gpuTypeId: "NVIDIA L40S",
        networkVolumeId: volumeId,
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
    });
    const report = harness.adapter.inspectCpuStagingPrecheck({
        job: harness.dryRunJob,
        sshKeyRegistered: true,
        registryVerification: harness.cpuRegistryVerification,
        networkVolume: { id: volumeId, dataCenterId: "EU-NL-1", sizeGb: 50, type: "STANDARD" },
        inventory: {
            cpuFlavorId: "cpu3c",
            dataCenterId: "EU-NL-1",
            minimumVcpu: 2,
            ramMultiplier: 2,
            securePriceUsdPerHour: 0.06,
            stockStatus: "HIGH"
        }
    });
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.bootstrap.phase, "CPU_MODEL_STAGING_BOOTSTRAP");
    assert.equal(report.bootstrap.maximumCacheStatus, "CACHE_MODEL_READY");
    assert.deepEqual(report.bootstrap.durableIdentity, {
        missionId: harness.dryRunJob.missionId,
        objectiveId: harness.dryRunJob.objectiveId,
        obligationId: harness.dryRunJob.obligationId,
        rootInstructionHash: harness.dryRunJob.rootInstructionHash,
        operationId: harness.dryRunJob.operationId
    });
    assert.deepEqual(report.bootstrap.packages, [
        "ca-certificates",
        "git",
        "python3",
        "python3-venv",
        "python3-pip"
    ]);
    const bootstrap = report.bootstrap.script;
    assert.match(bootstrap, /JARVIS_BOOTSTRAP_PHASE='CPU_MODEL_STAGING_BOOTSTRAP'/);
    assert.ok(
        bootstrap.indexOf("progress SYSTEM_DEPENDENCIES RUNNING CACHE_MISS")
            < bootstrap.indexOf("apt-get update -qq")
    );
    assert.ok(
        bootstrap.indexOf("apt-get install -y -qq --no-install-recommends ca-certificates git python3 python3-venv python3-pip")
            < bootstrap.indexOf('python3 -m venv "$CPU_TOOLS_VENV"')
    );
    assert.match(bootstrap, /case "\$cache" in CACHE_MISS\|CACHE_POPULATING\|CACHE_MODEL_READY/);
    assert.doesNotMatch(bootstrap, /CACHE_READY|CACHE_HIT/);
    assert.doesNotMatch(bootstrap, /\bnvcc\b|\bcuda\b|flash[-_]attn|generate\.py|build-essential|ffmpeg|\btorch\b/i);
    assert.doesNotMatch(bootstrap, /requirements\.txt|--requirement|pip check/i);
    assert.match(bootstrap, /test -d \/workspace && test -w \/workspace/);
    assert.match(bootstrap, /os\.replace\(tmp,manifest_path\)/);
    assert.match(bootstrap, /assert total==expected\['expectedModelBytes'\]/);
    assert.match(bootstrap, /assert sum\(item\['bytes'\] for item in expected\['requiredFiles'\]\)==expected\['requiredRuntimeModelBytes'\]/);
    for (const item of RUNPOD_WAN22_GPU_PROFILES["NVIDIA L40S"].requiredFiles) {
        assert.match(bootstrap, new RegExp(item.sha256));
    }
    assert.ok(
        bootstrap.indexOf('if test "$MODEL_CACHE_VALID" = 1; then')
            < bootstrap.indexOf('"$CPU_TOOLS_VENV/bin/hf" download')
    );
    assert.match(bootstrap, /rm -f "\$MODEL_MANIFEST"\nprogress MODEL_DOWNLOAD RUNNING CACHE_POPULATING/);
    assert.match(bootstrap, /progress MODEL_VALIDATION READY CACHE_MODEL_READY\nexit 0\n$/);
    assert.equal(harness.calls.length, 0);

    const bash = controlledBashExecutable();
    if (!bash || !fs.existsSync(bash)) {
        assert.fail("Bash is required for the controlled Ubuntu-minimal-equivalent bootstrap check");
    }
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v142-cpu-bootstrap-"));
    const scriptFile = path.join(temp, "cpu-bootstrap.sh");
    fs.writeFileSync(scriptFile, bootstrap, { mode: 0o700 });
    execFileSync(bash, ["-n", bashPath(scriptFile)], { stdio: "pipe" });

    const controlledRemoteBase = path.join(temp, "workspace", "jarvis-v142");
    const aptBoundary = bootstrap.indexOf("apt-get update -qq");
    assert.ok(aptBoundary > 0);
    const probeFile = path.join(temp, "bootstrap-safe-progress.sh");
    const probe = `${bootstrap.slice(0, aptBoundary).replaceAll("/workspace/jarvis-v142", bashPath(controlledRemoteBase))}exit 0\n`;
    fs.writeFileSync(probeFile, probe, { mode: 0o700 });
    const forbiddenSentinel = path.join(temp, "forbidden-dependency-called");
    const controlledCommand = [
        `python3() { printf called > '${bashPath(forbiddenSentinel)}'; return 99; }`,
        `git() { printf called > '${bashPath(forbiddenSentinel)}'; return 99; }`,
        `hf() { printf called > '${bashPath(forbiddenSentinel)}'; return 99; }`,
        "export -f python3 git hf",
        'source "$1"'
    ].join("; ");
    execFileSync(bash, ["-c", controlledCommand, "cpu-bootstrap-probe", bashPath(probeFile)], { stdio: "pipe" });
    assert.equal(fs.existsSync(forbiddenSentinel), false);
    const progressFile = path.join(
        controlledRemoteBase,
        "operations",
        harness.dryRunJob.operationId,
        "bootstrap-progress.json"
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(progressFile, "utf8")), {
        stage: "SYSTEM_DEPENDENCIES",
        status: "RUNNING",
        cacheStatus: "CACHE_MISS",
        modelBytes: 0,
        at: JSON.parse(fs.readFileSync(progressFile, "utf8")).at
    });

    const python = controlledPythonExecutable();
    assert.ok(python, "Python is required to execute the model-manifest fixture verifier");
    const heredocMarker = `cat > "$MODEL_PREFLIGHT" <<'PY'\n`;
    const verifierStart = bootstrap.indexOf(heredocMarker) + heredocMarker.length;
    const verifierEnd = bootstrap.indexOf("\nPY\n", verifierStart);
    assert.ok(verifierStart >= heredocMarker.length && verifierEnd > verifierStart);
    const verifierFile = path.join(temp, "model-preflight.py");
    fs.writeFileSync(verifierFile, bootstrap.slice(verifierStart, verifierEnd) + "\n");
    const fixtureModel = path.join(temp, "fixture-model");
    fs.mkdirSync(path.join(fixtureModel, "nested"), { recursive: true });
    const fixtureFiles = [
        { path: "weights.bin", bytes: Buffer.from("fixture-model-weights") },
        { path: "nested/config.json", bytes: Buffer.from('{"fixture":true}\n') }
    ];
    for (const item of fixtureFiles) {
        const target = path.join(fixtureModel, item.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, item.bytes);
    }
    const fixtureContract = {
        modelRepository: "fixture/Wan2.2-TI2V-5B",
        modelRevision: "fixture-model-revision",
        wanRepositoryRevision: "fixture-wan-revision",
        expectedModelBytes: fixtureFiles.reduce((sum, item) => sum + item.bytes.length, 0),
        requiredRuntimeModelBytes: fixtureFiles.reduce((sum, item) => sum + item.bytes.length, 0),
        requiredFiles: fixtureFiles.map(item => ({
            path: item.path,
            bytes: item.bytes.length,
            sha256: createHash("sha256").update(item.bytes).digest("hex")
        }))
    };
    const fixtureManifest = path.join(temp, "fixture-model-manifest.json");
    execFileSync(python, [
        verifierFile,
        JSON.stringify(fixtureContract),
        fixtureModel,
        fixtureManifest,
        "write"
    ], { stdio: "pipe" });
    assert.deepEqual(JSON.parse(fs.readFileSync(fixtureManifest, "utf8")), fixtureContract);
    assert.equal(
        fs.readdirSync(temp).some(name => name.startsWith(".model-manifest-")),
        false,
        "atomic manifest temporaries must not remain after replace"
    );
    execFileSync(python, [
        verifierFile,
        JSON.stringify(fixtureContract),
        fixtureModel,
        fixtureManifest
    ], { stdio: "pipe" });
    fs.writeFileSync(path.join(fixtureModel, "weights.bin"), "incomplete");
    assert.throws(() => execFileSync(python, [
        verifierFile,
        JSON.stringify(fixtureContract),
        fixtureModel,
        fixtureManifest
    ], { stdio: "pipe" }));
});

test("V142 CPU staging fails closed for the retired datacenter, undersized volume, or non-standard volume", async t => {
    const cases = [
        [
            "retired US-TX-3 datacenter",
            { dataCenterId: "US-TX-3", sizeGb: 50, type: "STANDARD" },
            "RUNPOD_GPU_NETWORK_VOLUME_DATACENTER_NOT_APPROVED"
        ],
        [
            "volume smaller than 50 GB",
            { dataCenterId: "EU-NL-1", sizeGb: 49, type: "STANDARD" },
            "RUNPOD_NETWORK_VOLUME_CAPACITY_INSUFFICIENT"
        ],
        [
            "non-standard volume",
            { dataCenterId: "EU-NL-1", sizeGb: 50, type: "EXPRESS" },
            "RUNPOD_NETWORK_VOLUME_TYPE_NOT_APPROVED"
        ]
    ];
    for (const [name, volume, expectedError] of cases) {
        await t.test(name, () => {
            const volumeId = `network-volume-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
            const harness = runpodPhysicalHarness({
                scenario: `cpu-staging-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
                gpuTypeId: "NVIDIA L40S",
                networkVolumeId: volumeId,
                envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
            });
            const report = harness.adapter.inspectCpuStagingPrecheck({
                sshKeyRegistered: true,
                registryVerification: harness.cpuRegistryVerification,
                networkVolume: { id: volumeId, ...volume },
                inventory: {
                    cpuFlavorId: "cpu3c",
                    dataCenterId: "EU-NL-1",
                    minimumVcpu: 2,
                    ramMultiplier: 2,
                    securePriceUsdPerHour: 0.06,
                    stockStatus: "HIGH"
                }
            });
            assert.equal(report.ok, false, JSON.stringify(report));
            assert.equal(report.error, expectedError);
            assert.equal(harness.calls.length, 0);
        });
    }
});

test("V142 CPU3C container disk provider limit blocks the physical 30 GB incident before POST", () => {
    const volumeId = "network-volume-eu-nl-1-disk-v142";
    const harness = runpodPhysicalHarness({
        scenario: "cpu3c-container-disk-provider-limit",
        gpuTypeId: "NVIDIA L40S",
        networkVolumeId: volumeId,
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
    });
    const precheck = containerDiskInGb => harness.adapter.inspectCpuStagingPrecheck({
        containerDiskInGb,
        sshKeyRegistered: true,
        registryVerification: harness.cpuRegistryVerification,
        networkVolume: { id: volumeId, dataCenterId: "EU-NL-1", sizeGb: 50, type: "STANDARD" },
        inventory: {
            cpuFlavorId: "cpu3c",
            dataCenterId: "EU-NL-1",
            minimumVcpu: 2,
            ramMultiplier: 2,
            securePriceUsdPerHour: 0.06,
            stockStatus: "Low"
        }
    });

    for (const invalid of [30, 21]) {
        const report = precheck(invalid);
        assert.equal(report.ok, false);
        assert.equal(report.error, "RUNPOD_CPU_CONTAINER_DISK_EXCEEDS_PROVIDER_LIMIT");
        assert.equal(harness.calls.length, 0);
    }

    for (const valid of [20, 10]) {
        const report = precheck(valid);
        assert.equal(report.ok, true, JSON.stringify(report));
        assert.equal(report.payload.containerDiskInGb, valid);
        assert.equal(report.contract.maximumContainerDiskGb, 20);
        assert.equal(harness.calls.length, 0);
    }
});

test("V142 CPU plain Ubuntu without the certified SSH startup contract fails before POST", () => {
    const volumeId = "network-volume-cpu-startup-contract-v142";
    const harness = runpodPhysicalHarness({
        scenario: "cpu-startup-contract-required",
        gpuTypeId: "NVIDIA L40S",
        networkVolumeId: volumeId,
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
    });
    const args = {
        sshKeyRegistered: true,
        registryVerification: harness.cpuRegistryVerification,
        networkVolume: { id: volumeId, dataCenterId: "EU-NL-1", sizeGb: 50, type: "STANDARD" },
        inventory: {
            cpuFlavorId: "cpu3c",
            dataCenterId: "EU-NL-1",
            minimumVcpu: 2,
            ramMultiplier: 2,
            securePriceUsdPerHour: 0.06,
            stockStatus: "HIGH"
        }
    };
    const plainUbuntu = harness.adapter.inspectCpuStagingPrecheck({
        ...args,
        startupContract: []
    });
    assert.equal(plainUbuntu.ok, false);
    assert.equal(plainUbuntu.error, "RUNPOD_CPU_RUNTIME_STARTUP_CONTRACT_REQUIRED");

    const registeredKeyMissing = harness.adapter.inspectCpuStagingPrecheck({
        ...args,
        sshKeyRegistered: false
    });
    assert.equal(registeredKeyMissing.ok, false);
    assert.equal(registeredKeyMissing.error, "RUNPOD_CPU_SSH_KEY_REGISTERED_REQUIRED");
    assert.equal(harness.calls.length, 0);
});

test("V142 CPU startup contract only starts persistent sshd and contains no secret or Wan bootstrap", () => {
    const command = RUNPOD_CPU_STAGING_PROFILE.dockerStartCmd;
    assert.deepEqual(command.slice(0, 2), ["bash", "-lc"]);
    assert.equal(command.length, 3);
    assert.match(command[2], /test -n "\$\{PUBLIC_KEY:-\}"/);
    assert.match(command[2], /authorized_keys/);
    assert.match(command[2], /ssh-keygen -A/);
    assert.match(command[2], /exec \/usr\/sbin\/sshd -D -e/);
    assert.doesNotMatch(command[2], /RUNPOD_API_KEY|PRIVATE_KEY|hf download|huggingface|Wan2\.2|sleep/i);
});

test("V142 CPU model-ready cache remains physically unverified and never becomes CACHE_HIT", () => {
    const volumeId = "network-volume-model-ready-v142";
    const harness = runpodPhysicalHarness({
        scenario: "cpu-model-ready-not-hit",
        gpuTypeId: "NVIDIA L40S",
        networkVolumeId: volumeId,
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
    });
    const stateRoot = path.join(harness.root, ".jarvis-artifacts", ".video-worker", "runpod");
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(path.join(stateRoot, "cpu-model-ready.json"), JSON.stringify({
        networkVolumeId: volumeId,
        modelContractRevision: "921dbaf3f1674a56f47e83fb80a34bac8a8f203e",
        modelIntegrityVerified: true,
        runtimePreflightVerified: false,
        cacheStatus: "CACHE_MODEL_READY"
    }));
    const report = harness.adapter.inspectZeroCostPrecheck({
        job: harness.dryRunJob,
        registryVerification: harness.gpuRegistryVerification,
        networkVolume: { id: volumeId, dataCenterId: "EU-NL-1", sizeGb: 50, type: "STANDARD" },
        availability: {
            gpuTypeId: "NVIDIA L40S",
            vramGb: 48,
            hourlyRateUsd: 0.99,
            stockStatus: "Low"
        }
    });
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.cache.expectedStatus, "CACHE_MODEL_READY_PHYSICAL_VERIFY_REQUIRED");
    assert.notEqual(report.cache.expectedStatus, "CACHE_HIT");
});

test("V142 CPU runtime identity gates cache writes without certifying CUDA or inference", () => {
    const harness = runpodPhysicalHarness({
        scenario: "cpu-runtime-identity",
        gpuTypeId: "NVIDIA L40S",
        networkVolumeId: "network-volume-eu-nl-1-runtime-v142",
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
    });
    const healthy = harness.adapter.inspectCpuStagingRuntimeIdentity({
        previousHealth: {
            uptimeSeconds: 15,
            sshEndpoint: { host: "203.0.113.10", port: 22022 }
        },
        health: {
            podStatus: "RUNNING",
            uptimeSeconds: 25,
            stableSshEndpointPolls: 2,
            sshEndpoint: { host: "203.0.113.10", port: 22022 },
            sshHandshake: true,
            sshAuthenticated: true,
            sshUser: "root",
            sshdRunning: true,
            publicKeyPresent: true,
            authorizedKeyMatches: true,
            operatingSystem: "ubuntu-22.04",
            caCertificates: true,
            mountPath: "/workspace",
            mountWritable: true,
            commands: {
                bash: true,
                sshd: true
            },
            cuda: false,
            nvcc: false,
            flashAttention: false
        }
    });
    assert.equal(healthy.ok, true, JSON.stringify(healthy));
    assert.equal(healthy.status, "CPU_RUNTIME_READY");
    assert.equal(healthy.cacheWriteAuthorized, true);
    assert.equal(healthy.cacheModelReady, false);
    assert.equal(healthy.inferenceStarted, false);
    assert.equal(healthy.cudaVerified, false);
    assert.equal(healthy.l40sVerified, false);
    const mismatch = harness.adapter.inspectCpuStagingRuntimeIdentity({
        previousHealth: {
            uptimeSeconds: 15,
            sshEndpoint: { host: "203.0.113.10", port: 22022 }
        },
        health: {
            podStatus: "RUNNING",
            uptimeSeconds: 25,
            stableSshEndpointPolls: 2,
            sshEndpoint: { host: "203.0.113.10", port: 22022 },
            sshHandshake: true,
            sshAuthenticated: true,
            sshUser: "root",
            sshdRunning: true,
            publicKeyPresent: true,
            authorizedKeyMatches: true,
            operatingSystem: "ubuntu-22.04",
            caCertificates: true,
            mountPath: "/workspace",
            mountWritable: true,
            commands: { bash: true, sshd: true },
            cuda: true
        }
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.cacheWriteAuthorized, false);
    assert.equal(mismatch.cacheModelReady, false);
    assert.equal(mismatch.inferenceStarted, false);
    assert.equal(mismatch.deleteRequired, true);
    assert.equal(harness.calls.length, 0);
});

test("V142 CPU runtime readiness distinguishes transient polls from terminal SSH contract failures", async t => {
    const harness = runpodPhysicalHarness({
        scenario: "cpu-runtime-readiness-fail-closed",
        gpuTypeId: "NVIDIA L40S",
        networkVolumeId: "network-volume-eu-nl-1-readiness-v142",
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
    });
    const base = {
        podStatus: "RUNNING",
        uptimeSeconds: 20,
        stableSshEndpointPolls: 2,
        sshEndpoint: { host: "203.0.113.11", port: 22022 },
        sshHandshake: true,
        sshAuthenticated: true,
        sshUser: "root",
        sshdRunning: true,
        publicKeyPresent: true,
        authorizedKeyMatches: true,
        operatingSystem: "ubuntu-22.04",
        caCertificates: true,
        mountPath: "/workspace",
        mountWritable: true,
        commands: { bash: true, sshd: true },
        cuda: false,
        nvcc: false,
        flashAttention: false
    };
    const previousHealth = {
        uptimeSeconds: 10,
        sshEndpoint: { host: "203.0.113.11", port: 22022 }
    };
    await t.test("RUNNING with uptime zero remains pending and does not authorize cache", () => {
        const result = harness.adapter.inspectCpuStagingRuntimeIdentity({
            previousHealth: { ...previousHealth, uptimeSeconds: 0 },
            health: { ...base, uptimeSeconds: 0, stableSshEndpointPolls: 0, sshHandshake: false, sshAuthenticated: false }
        });
        assert.equal(result.ok, false);
        assert.equal(result.status, "RUNPOD_CPU_RUNTIME_STARTING");
        assert.equal(result.retryable, true);
        assert.equal(result.deleteRequired, false);
        assert.equal(result.cacheWriteAuthorized, false);
    });
    await t.test("a transient port is not a stable SSH endpoint", () => {
        const result = harness.adapter.inspectCpuStagingRuntimeIdentity({
            previousHealth,
            health: { ...base, stableSshEndpointPolls: 1, sshHandshake: false, sshAuthenticated: false }
        });
        assert.equal(result.ok, false);
        assert.equal(result.status, "RUNPOD_CPU_SSH_NOT_STABLE");
        assert.equal(result.retryable, true);
        assert.equal(result.deleteRequired, false);
    });
    await t.test("missing injected PUBLIC_KEY fails terminally and requires DELETE", () => {
        const result = harness.adapter.inspectCpuStagingRuntimeIdentity({ previousHealth, health: { ...base, publicKeyPresent: false } });
        assert.equal(result.ok, false);
        assert.equal(result.status, "RUNPOD_CPU_PUBLIC_KEY_MISSING");
        assert.equal(result.retryable, false);
        assert.equal(result.deleteRequired, true);
    });
    await t.test("sshd startup failure requires DELETE", () => {
        const result = harness.adapter.inspectCpuStagingRuntimeIdentity({ previousHealth, health: { ...base, sshdRunning: false, commands: { bash: true, sshd: false } } });
        assert.equal(result.ok, false);
        assert.equal(result.status, "RUNPOD_CPU_SSHD_NOT_RUNNING");
        assert.equal(result.retryable, false);
        assert.equal(result.deleteRequired, true);
    });
    await t.test("runtime timeout converts pending SSH into DELETE-required failure", () => {
        const result = harness.adapter.inspectCpuStagingRuntimeIdentity({
            previousHealth,
            timedOut: true,
            health: { ...base, stableSshEndpointPolls: 1, sshHandshake: false, sshAuthenticated: false }
        });
        assert.equal(result.ok, false);
        assert.equal(result.status, "RUNPOD_CPU_RUNTIME_TIMEOUT");
        assert.equal(result.retryable, false);
        assert.equal(result.deleteRequired, true);
        assert.equal(result.cacheWriteAuthorized, false);
    });
    assert.equal(harness.calls.length, 0);
});

test("V142 RunPod paid resource creation remains false when authorization is omitted", () => {
    const harness = runpodPhysicalHarness({
        scenario: "paid-authority-omitted",
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: undefined }
    });
    const health = harness.adapter.inspectHardware();
    assert.equal(health.paidResourceCreationAuthorized, false);
    assert.equal(health.paidResourceCreationPossible, false);
});

test("V142 RunPod paid creation authority defaults closed and blocks before all provider traffic", async () => {
    const harness = runpodPhysicalHarness({
        scenario: "paid-authority-closed",
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
    });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, false, JSON.stringify(started));
    assert.match(started.error, /RUNPOD_PAID_RESOURCE_CREATION_NOT_AUTHORIZED/);
    assert.equal(harness.createdBody, null);
    assert.equal(harness.calls.length, 0);
});

test("V142 RunPod missing explicit hard budget blocks before all provider traffic", async () => {
    const harness = runpodPhysicalHarness({
        scenario: "hard-budget-missing",
        envOverrides: { JARVIS_REMOTE_GPU_HARD_BUDGET_USD: "" }
    });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, false, JSON.stringify(started));
    assert.match(started.error, /RUNPOD_HARD_BUDGET_REQUIRED/);
    assert.equal(harness.createdBody, null);
    assert.equal(harness.calls.length, 0);
});

test("V142 RunPod zero-cost precheck fails closed on every static pre-Pod contract", async t => {
    const cases = [
        ["canonical SHA mismatch", { resolvedCanonicalSha: "0".repeat(40) }, null, "RUNPOD_CANONICAL_SHA_MISMATCH"],
        ["bridge identity invalid", { bridgeIdentity: { ok: false, status: "BRIDGE_IDENTITY_INVALID" } }, null, "RUNPOD_BRIDGE_IDENTITY_REQUIRED"],
        ["policy is not LOCAL_TEST", { envOverrides: { JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_PREFERRED" } }, null, "RUNPOD_LOCAL_TEST_POLICY_REQUIRED"],
        ["backend is not Wan2.2", { envOverrides: { JARVIS_LOCAL_VIDEO_MODEL: "wan21-t2v-1.3b" } }, null, "RUNPOD_WAN22_BACKEND_REQUIRED"],
        ["GPU authorization is missing", { envOverrides: { JARVIS_RUNPOD_GPU_TYPE_ID: undefined } }, null, "RUNPOD_GPU_TYPE_EXPLICIT_AUTHORIZATION_REQUIRED"],
        ["GPU is not approved", { envOverrides: { JARVIS_RUNPOD_GPU_TYPE_ID: "NVIDIA RTX 6000 Ada" } }, null, "RUNPOD_GPU_TYPE_NOT_APPROVED_FOR_V142"],
        ["job model is not approved", {}, job => { job.model = "Wan2.2-unapproved"; }, "RUNPOD_WAN22_JOB_CONTRACT_INVALID"],
        ["durable root hash is missing", {}, job => { job.rootInstructionHash = ""; }, "RUNPOD_DURABLE_IDENTITY_REQUIRED"],
        ["reference asset is missing", {}, job => { job.referenceFiles = [path.join(os.tmpdir(), "missing-v142-reference.png")]; }, "RUNPOD_REFERENCE_ASSET_NOT_FOUND"],
        ["network volume is too small", { networkVolumeId: "volume-small-v142" }, null, "RUNPOD_NETWORK_VOLUME_CAPACITY_INSUFFICIENT"]
    ];
    for (const [name, options, mutateJob, expected] of cases) {
        await t.test(name, () => {
            const harness = runpodPhysicalHarness({ scenario: `prepod-${name.replaceAll(" ", "-")}`, ...options });
            const job = structuredClone(harness.dryRunJob);
            mutateJob?.(job);
            const report = harness.adapter.inspectZeroCostPrecheck({
                job,
                registryVerification: harness.gpuRegistryVerification,
                ...(options.networkVolumeId ? {
                    networkVolume: {
                        id: options.networkVolumeId,
                        dataCenterId: "CA-MTL-1",
                        sizeGb: 40,
                        type: "STANDARD"
                    }
                } : {})
            });
            assert.equal(report.ok, false, JSON.stringify(report));
            assert.equal(report.error, expected);
            assert.equal(report.paidResourceCreationPossible, false);
            assert.equal(harness.calls.length, 0);
        });
    }
});

test("V142 RunPod local durable duplicate and incomplete payload both block before POST /pods", async t => {
    await t.test("local durable duplicate", () => {
        const harness = runpodPhysicalHarness({ scenario: "local-durable-duplicate" });
        const stateRoot = path.join(harness.root, ".jarvis-artifacts", ".video-worker", "runpod");
        fs.mkdirSync(stateRoot, { recursive: true });
        fs.writeFileSync(path.join(stateRoot, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.json"), JSON.stringify({
            ...harness.dryRunJob,
            operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            podId: "pod-existing-local",
            phase: "PROVISIONED"
        }));
        const report = harness.adapter.inspectZeroCostPrecheck({
            job: harness.dryRunJob,
            registryVerification: harness.gpuRegistryVerification
        });
        assert.equal(report.ok, false, JSON.stringify(report));
        assert.equal(report.error, "RUNPOD_LOCAL_DUPLICATE_OBLIGATION_BLOCKED");
        assert.equal(harness.calls.length, 0);
    });
    await t.test("empty ephemeral public key", async () => {
        const harness = runpodPhysicalHarness({ scenario: "payload-empty-public-key", emptyPublicKey: true });
        const started = await harness.engine.start(harness.payload);
        assert.equal(started.ok, false, JSON.stringify(started));
        assert.equal(started.error, "RUNPOD_PROVISION_PAYLOAD_INCOMPLETE");
        assert.equal(harness.createdBody, null);
        assert.equal(harness.calls.some(call => call.method === "POST" && call.url.endsWith("/pods")), false);
    });
});

test("V142 RunPod adapter provisions one A40 Pod, transfers physical assets, returns verified MP4, and deletes the Pod", async () => {
    const harness = runpodPhysicalHarness();
    const configuredOnly = harness.adapter.inspectHardware();
    assert.equal(configuredOnly.status, "RUNPOD_PROVISIONING_CONFIGURED");
    assert.equal(configuredOnly.cudaAvailable, null);
    assert.equal(configuredOnly.gpuName, null);
    assert.equal(configuredOnly.ffmpegAvailable, null);
    assert.equal(configuredOnly.physicalHealthVerified, false);
    assert.equal(configuredOnly.runtimePreflightVerified, false);
    assert.equal(configuredOnly.requestedGpuName, "NVIDIA A40");
    assert.equal(configuredOnly.requestedVramGb, 48);
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, true, JSON.stringify(started));
    assert.equal(started.podId, "pod-a40-v142");
    assert.match(started.remoteJobId, /^runpod\/pod-a40-v142\//);

    const runpodStateRoot = path.join(harness.root, ".jarvis-artifacts", ".video-worker", "runpod");
    const bootstrapFile = fs.readdirSync(runpodStateRoot, { recursive: true })
        .map(file => path.join(runpodStateRoot, file))
        .find(file => file.endsWith("bootstrap.sh"));
    fs.writeFileSync(bootstrapFile, "#!/usr/bin/env bash\npython3 -m pip install legacy-global\n");

    const completed = await pollRunpodUntilDone(harness.engine, started.operationName);
    assert.equal(completed.ok, true, JSON.stringify(completed));
    assert.equal(completed.status, "VIDEO_GENERATED_VERIFIED");
    assert.equal(completed.verifiedArtifactDelivery, true);
    assert.equal(completed.workerRelease.status, "RUNPOD_POD_TERMINATED_VERIFIED");
    assert.equal(completed.workerRelease.terminationVerified, true);
    assert.equal(harness.deleted, true);
    assert.equal(harness.createdBody.gpuCount, 1);
    assert.deepEqual(harness.createdBody.gpuTypeIds, ["NVIDIA A40"]);
    assert.equal(harness.createdBody.containerDiskInGb, 30);
    assert.equal(harness.createdBody.volumeInGb, 100);
    assert.equal(harness.createdBody.minRAMPerGPU, 50);
    assert.equal(harness.createdBody.minVCPUPerGPU, 9);
    assert.equal("RUNPOD_API_KEY" in harness.createdBody.env, false);
    assert.equal(JSON.stringify(harness.createdBody).includes(harness.env.RUNPOD_API_KEY), false);
    const stateBase = path.join(harness.root, ".jarvis-artifacts", ".video-worker", "runpod");
    const stateFiles = fs.readdirSync(stateBase, { recursive: true })
        .filter(file => String(file).endsWith(".json"));
    for (const stateFile of stateFiles) {
        assert.equal(
            fs.readFileSync(path.join(stateBase, stateFile), "utf8").includes(harness.env.RUNPOD_API_KEY),
            false
        );
    }
    assert.equal(listArtifacts({ root: harness.root, type: "video" }).length, 1);
    const bootstrap = fs.readFileSync(bootstrapFile, "utf8");
    assert.match(bootstrap, /JARVIS_BOOTSTRAP_PHASE='GPU_RUNTIME_BOOTSTRAP'/);
    assert.match(bootstrap, /python3 -m venv --system-site-packages/);
    assert.match(bootstrap, /"\$VENV\/bin\/python" -m pip install/);
    assert.doesNotMatch(bootstrap, /\npython3 -m pip install/);
    assert.match(bootstrap, /CACHE_MISS/);
    assert.match(bootstrap, /CACHE_POPULATING/);
    assert.match(bootstrap, /CACHE_MODEL_READY/);
    assert.match(bootstrap, /CACHE_READY/);
    assert.match(bootstrap, /CACHE_HIT/);
    assert.match(bootstrap, /921dbaf3f1674a56f47e83fb80a34bac8a8f203e/);
    assert.match(bootstrap, /while kill -0 "\$DOWNLOAD_PID"/);
    assert.match(bootstrap, /actual\.get\(k\)==expected\.get\(k\)/);
    assert.match(bootstrap, /target=os\.path\.join\(model_dir,item\['path'\]\); assert os\.path\.getsize\(target\)==item\['bytes'\]/);
    assert.match(bootstrap, /assert digest\.hexdigest\(\)==item\['sha256'\]/);
    assert.match(bootstrap, /if test "\$CACHE_VALID" = 1 && "\$VENV\/bin\/python" "\$PREFLIGHT"/);
    assert.match(bootstrap, /progress CACHE_VALIDATE READY CACHE_HIT; exit 0; fi/);
    assert.ok(
        bootstrap.indexOf("progress CACHE_VALIDATE READY CACHE_HIT; exit 0; fi")
            < bootstrap.indexOf('"$VENV/bin/hf" download'),
        "a physically verified cache hit must exit before the model download command"
    );
    assert.match(bootstrap, /rm -f "\$CACHE_MANIFEST"\nprogress CACHE_VALIDATE INCOMPLETE CACHE_MISS/);
    assert.match(bootstrap, /export HF_XET_CHUNK_CACHE_SIZE_BYTES=0/);
    assert.match(bootstrap, /export HF_XET_SHARD_CACHE_SIZE_LIMIT=0/);
    assert.match(bootstrap, /export PIP_NO_CACHE_DIR=1/);
    assert.match(bootstrap, /8338a62490c93cfbf908bb289bbaa3fb104e5606415bb48cca6cae5175313c44/);
    assert.match(bootstrap, /flash-attn==2\.8\.3\.post1.*--no-build-isolation/);
    assert.match(bootstrap, /flash_attn_func/);
    assert.match(bootstrap, /flashAttentionCudaProbe/);
    assert.match(bootstrap, /MODEL_MANIFEST/);
    assert.match(bootstrap, /MODEL_CACHE_VALID/);
    assert.match(bootstrap, /if test "\$MODEL_CACHE_VALID" = 1; then/);
    assert.ok(
        bootstrap.indexOf('if test "$MODEL_CACHE_VALID" = 1; then')
            < bootstrap.indexOf('  "$VENV/bin/hf" download'),
        "a CPU-staged model manifest must be verified before any GPU model download"
    );
    assert.match(bootstrap, /MAX_JOBS=4/);
    assert.match(bootstrap, /pip check/);
    assert.match(bootstrap, /importlib\.import_module\(name\)/);
    assert.match(bootstrap, /'flash_attn'/);
    assert.match(bootstrap, /generate\.py.*--help/);
    assert.match(bootstrap, /torchVersion/);
    assert.match(bootstrap, /torchCudaVersion/);
    assert.equal(harness.createdBody.imageName, "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404");
    assert.doesNotMatch(harness.createdBody.imageName, /@sha256:/i);
});

test("V142 RunPod blocks OCI digest syntax in imageName before creating billable capacity", async () => {
    const harness = runpodPhysicalHarness({
        scenario: "digest-in-image-name",
        envOverrides: {
            JARVIS_RUNPOD_IMAGE: `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404@${RUNPOD_WAN22_GPU_PROFILES["NVIDIA A40"].expectedRegistryDigest}`
        }
    });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, false, JSON.stringify(started));
    assert.equal(started.error, "RUNPOD_IMAGE_NAME_DIGEST_FORBIDDEN");
    assert.equal(harness.createdBody, null);
    assert.equal(harness.calls.length, 0);
});

test("V142 RunPod registry digest verification passes only on an exact public manifest match", async t => {
    await t.test("resolved digest matches in zero-cost precheck", () => {
        const harness = runpodPhysicalHarness({ scenario: "registry-digest-match" });
        const report = harness.adapter.inspectZeroCostPrecheck({
            job: harness.dryRunJob,
            registryVerification: harness.gpuRegistryVerification
        });
        assert.equal(report.ok, true, JSON.stringify(report));
        assert.equal(
            report.payload.imageName,
            RUNPOD_WAN22_GPU_PROFILES["NVIDIA A40"].provisionImageTag
        );
        assert.equal(harness.calls.length, 0);
    });

    for (const [scenario, expected] of [
        ["registry-digest-mismatch", "RUNPOD_REGISTRY_DIGEST_MISMATCH"],
        ["registry-unverifiable", "RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE"]
    ]) {
        await t.test(scenario, async () => {
            const harness = runpodPhysicalHarness({ scenario });
            const started = await harness.engine.start(harness.payload);
            assert.equal(started.ok, false, JSON.stringify(started));
            assert.equal(started.error, expected);
            assert.equal(harness.createdBody, null);
            assert.equal(
                harness.calls.some(call => call.method === "POST" && call.url.endsWith("/pods")),
                false
            );
        });
    }
});

test("V142 zero-cost precheck fails closed when registry evidence is missing or mismatched", () => {
    const harness = runpodPhysicalHarness({
        scenario: "registry-evidence-precheck",
        envOverrides: { JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false" }
    });
    const missing = harness.adapter.inspectZeroCostPrecheck({ job: harness.dryRunJob });
    assert.equal(missing.ok, false);
    assert.equal(missing.error, "RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE");
    const mismatched = harness.adapter.inspectZeroCostPrecheck({
        job: harness.dryRunJob,
        registryVerification: verifiedRegistryEvidence(RUNPOD_WAN22_GPU_PROFILES["NVIDIA A40"], {
            observedDigest: `sha256:${"f".repeat(64)}`
        })
    });
    assert.equal(mismatched.ok, false);
    assert.equal(mismatched.error, "RUNPOD_REGISTRY_DIGEST_MISMATCH");
    assert.equal(harness.calls.length, 0);
});

test("V142 L40S physical mock requires exact CC 8.9, 48GB and a working FlashAttention CUDA kernel", async t => {
    await t.test("exact L40S profile completes", async () => {
        const harness = runpodPhysicalHarness({
            scenario: "l40s-physical-success",
            gpuTypeId: "NVIDIA L40S",
            networkVolumeId: "network-volume-l40s-physical"
        });
        const started = await harness.engine.start(harness.payload);
        assert.equal(started.ok, true, JSON.stringify(started));
        const completed = await pollRunpodUntilDone(harness.engine, started.operationName);
        assert.equal(completed.status, "VIDEO_GENERATED_VERIFIED");
        assert.equal(completed.verifiedArtifactDelivery, true);
        assert.deepEqual(harness.createdBody.gpuTypeIds, ["NVIDIA L40S"]);
        assert.deepEqual(harness.createdBody.dataCenterIds, ["EU-NL-1"]);
        assert.equal(harness.createdBody.minRAMPerGPU, 62);
        assert.equal(harness.createdBody.minVCPUPerGPU, 16);
        assert.equal(harness.deleted, true);
    });

    const failures = [
        ["CC 8.6 binary/profile", { baseHealthOverrides: { computeCapability: "8.6" } }],
        ["47 GB VRAM", { baseHealthOverrides: { vramGb: 47 } }],
        ["FlashAttention sm_89 CUDA operation", {
            runtimeHealthOverrides: { flashAttentionCudaProbe: false, dependencyContract: false }
        }]
    ];
    for (const [name, overrides] of failures) {
        await t.test(name, async () => {
            const harness = runpodPhysicalHarness({
                scenario: `l40s-physical-${name.replace(/[^a-z0-9]+/gi, "-")}`,
                gpuTypeId: "NVIDIA L40S",
                networkVolumeId: "network-volume-l40s-physical",
                ...overrides
            });
            const started = await harness.engine.start(harness.payload);
            assert.equal(started.ok, true, JSON.stringify(started));
            const failed = await pollRunpodUntilDone(harness.engine, started.operationName);
            assert.equal(failed.ok, false, JSON.stringify(failed));
            assert.equal(harness.inferenceStarts, 0);
            assert.equal(failed.workerRelease.terminationVerified, true);
            assert.equal(harness.deleted, true);
            assert.equal(listArtifacts({ root: harness.root, type: "video" }).length, 0);
        });
    }
});

test("V142 RunPod refuses an unapproved provision tag before creating billable capacity", async () => {
    const harness = runpodPhysicalHarness({
        scenario: "unapproved-image",
        envOverrides: {
            JARVIS_RUNPOD_IMAGE: "runpod/pytorch:unapproved"
        }
    });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, false, JSON.stringify(started));
    assert.equal(started.error, "RUNPOD_PROVISION_IMAGE_TAG_NOT_APPROVED_FOR_V142");
    assert.equal(harness.createdBody, null);
    assert.equal(harness.calls.length, 0);
});

test("V142 RunPod attaches an existing Network Volume, pins its datacenter, and never deletes the volume", async () => {
    const volumeId = "network-volume-wan22-v142";
    const harness = runpodPhysicalHarness({ networkVolumeId: volumeId });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, true, JSON.stringify(started));
    assert.equal(harness.createdBody.networkVolumeId, volumeId);
    assert.deepEqual(harness.createdBody.dataCenterIds, ["CA-MTL-1"]);
    assert.equal(harness.createdBody.volumeMountPath, "/workspace");
    assert.equal("volumeInGb" in harness.createdBody, false);
    assert.equal(started.remoteWorker.networkVolumePersistent, true);

    const cancelled = await harness.engine.cancel({ operationName: started.operationName });
    assert.equal(cancelled.workerRelease.networkVolumeRetained, true);
    assert.equal(harness.deleted, true);
    assert.equal(
        harness.calls.some(call => call.method === "DELETE" && call.url.includes("networkvolumes")),
        false
    );
});

test("V142 RunPod preserves ephemeral volume behavior when no Network Volume is configured", async () => {
    const harness = runpodPhysicalHarness();
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, true, JSON.stringify(started));
    assert.equal(harness.createdBody.volumeInGb, 100);
    assert.equal("networkVolumeId" in harness.createdBody, false);
    assert.equal(started.remoteWorker.networkVolumePersistent, false);
    await harness.engine.cancel({ operationName: started.operationName });
});

test("V142 RunPod rejects an undersized or ambiguous Network Volume before creating a Pod", async () => {
    const harness = runpodPhysicalHarness({
        scenario: "undersized-network-volume",
        networkVolumeId: "network-volume-small",
        networkVolumeSizeGb: 40
    });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, false, JSON.stringify(started));
    assert.equal(started.error, "RUNPOD_NETWORK_VOLUME_CAPACITY_INSUFFICIENT");
    assert.equal(harness.createdBody, null);
});

test("V142 RunPod verifies STANDARD support from the authenticated datacenter catalog before POST", async () => {
    const harness = runpodPhysicalHarness({
        scenario: "network-volume-type-not-approved",
        gpuTypeId: "NVIDIA L40S",
        networkVolumeId: "network-volume-non-standard",
        networkVolumeType: "EXPRESS"
    });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, false, JSON.stringify(started));
    assert.equal(started.error, "RUNPOD_NETWORK_VOLUME_TYPE_NOT_APPROVED");
    assert.equal(harness.createdBody, null);
    assert.equal(
        harness.calls.some(call => call.method === "POST" && call.url.endsWith("/pods")),
        false
    );
});

test("V142 RunPod persists cache progress and only promotes a validated cache to ready/hit", async () => {
    const progress = [
        { stage: "CACHE_VALIDATE", status: "INCOMPLETE", cacheStatus: "CACHE_MISS", modelBytes: 0, at: "2026-08-27T12:00:01.000Z" },
        { stage: "MODEL_DOWNLOAD", status: "RUNNING", cacheStatus: "CACHE_POPULATING", modelBytes: 12000000000, at: "2026-08-27T12:00:02.000Z" },
        { stage: "MODEL_VALIDATION", status: "READY", cacheStatus: "CACHE_MODEL_READY", modelBytes: 34203123497, at: "2026-08-27T12:00:02.500Z" },
        { stage: "RUNNER_READY", status: "READY", cacheStatus: "CACHE_READY", modelBytes: 34203123497, at: "2026-08-27T12:00:03.000Z" }
    ];
    const harness = runpodPhysicalHarness({
        scenario: "cache-progress",
        bootstrapProgressSequence: progress
    });
    const started = await harness.engine.start(harness.payload);
    const first = await harness.engine.poll({ operationName: started.operationName });
    assert.equal(first.remoteWorker.phase, "BOOTSTRAPPING");
    const miss = await harness.engine.poll({ operationName: started.operationName });
    assert.equal(miss.remoteWorker.cacheStatus, "CACHE_MISS");
    const populating = await harness.engine.poll({ operationName: started.operationName });
    assert.equal(populating.remoteWorker.cacheStatus, "CACHE_POPULATING");
    const modelReady = await harness.engine.poll({ operationName: started.operationName });
    assert.equal(modelReady.remoteWorker.cacheStatus, "CACHE_MODEL_READY");
    const completed = await pollRunpodUntilDone(harness.engine, started.operationName, 8);
    assert.equal(completed.status, "VIDEO_GENERATED_VERIFIED");
});

test("V142 RunPod records a compatible persistent cache as CACHE_HIT without repopulating it", async () => {
    const harness = runpodPhysicalHarness({
        scenario: "cache-hit",
        bootstrapProgressSequence: [{
            stage: "CACHE_VALIDATE",
            status: "READY",
            cacheStatus: "CACHE_HIT",
            modelBytes: 34203123497,
            at: "2026-08-27T12:00:01.000Z"
        }]
    });
    const started = await harness.engine.start(harness.payload);
    await harness.engine.poll({ operationName: started.operationName });
    const running = await harness.engine.poll({ operationName: started.operationName });
    assert.equal(running.remoteWorker.cacheStatus, "CACHE_HIT");
    const completed = await pollRunpodUntilDone(harness.engine, started.operationName);
    assert.equal(completed.status, "VIDEO_GENERATED_VERIFIED");
});

test("V142 cache recovery survives a new runtime without changing the durable obligation or creating a second Pod", async () => {
    const progress = {
        stage: "MODEL_DOWNLOAD",
        status: "RUNNING",
        cacheStatus: "CACHE_POPULATING",
        modelBytes: 12000000000,
        at: "2026-08-27T12:02:00.000Z"
    };
    const first = runpodPhysicalHarness({
        scenario: "cache-runtime-restart",
        networkVolumeId: "network-volume-cache-runtime",
        bootstrapProgressSequence: [progress, progress]
    });
    const started = await first.engine.start(first.payload);
    let interrupted = null;
    for (let index = 0; index < 8; index += 1) {
        interrupted = await first.engine.poll({ operationName: started.operationName });
        if (
            interrupted.remoteWorker?.phase === "BOOTSTRAPPING" &&
            interrupted.remoteWorker?.cacheStatus === "CACHE_POPULATING"
        ) break;
    }
    assert.equal(interrupted.remoteWorker.phase, "BOOTSTRAPPING", JSON.stringify(interrupted));
    assert.equal(interrupted.remoteWorker.cacheStatus, "CACHE_POPULATING");
    assert.equal(first.inferenceStarts, 0);

    const second = runpodPhysicalHarness({
        scenario: "cache-runtime-restart",
        rootOverride: first.root,
        networkVolumeId: "network-volume-cache-runtime",
        bootstrapProgressSequence: [progress, {
            ...progress,
            stage: "RUNNER_READY",
            status: "READY",
            cacheStatus: "CACHE_READY",
            modelBytes: 34203123497,
            at: "2026-08-27T12:03:00.000Z"
        }]
    });
    const resumed = await second.engine.start(second.payload);
    assert.equal(resumed.reusedOperation, true, JSON.stringify(resumed));
    assert.equal(resumed.operationName, started.operationName);
    assert.equal(resumed.missionId, started.missionId);
    assert.equal(resumed.objectiveId, started.objectiveId);
    assert.equal(resumed.obligationId, started.obligationId);
    let ready = null;
    for (let index = 0; index < 8; index += 1) {
        ready = await second.engine.poll({ operationName: started.operationName });
        if (ready.remoteWorker?.phase === "JOB_RUNNING") break;
    }
    assert.equal(ready.remoteWorker.phase, "JOB_RUNNING", JSON.stringify(ready));
    assert.equal(ready.remoteWorker.cacheStatus, "CACHE_READY");
    assert.equal(second.inferenceStarts, 1);
    assert.equal(second.calls.some(call => call.method === "POST" && call.url.endsWith("/pods")), false);

    const cancelled = await second.engine.cancel({ operationName: started.operationName });
    assert.equal(cancelled.workerRelease.terminationVerified, true);
    const third = runpodPhysicalHarness({
        scenario: "cache-runtime-restart",
        rootOverride: first.root,
        networkVolumeId: "network-volume-cache-runtime"
    });
    const dryRun = third.adapter.inspectZeroCostPrecheck({
        job: third.dryRunJob,
        registryVerification: third.gpuRegistryVerification,
        networkVolume: {
            id: "network-volume-cache-runtime",
            dataCenterId: "CA-MTL-1",
            sizeGb: 50,
            type: "STANDARD"
        },
        availability: {
            gpuTypeId: "NVIDIA A40",
            vramGb: 48,
            hourlyRateUsd: 0.44,
            stockStatus: "Low"
        }
    });
    assert.equal(dryRun.ok, true, JSON.stringify(dryRun));
    assert.equal(dryRun.cache.expectedStatus, "CACHE_HIT_EXPECTED_PHYSICAL_VERIFY_REQUIRED");
    assert.equal(third.calls.length, 0);
});

test("V142 RunPod API key reaches the provider byte-for-byte without local normalization", async () => {
    const exactKey = " controlled-runpod-key-with-boundary-spaces ";
    const harness = runpodPhysicalHarness({
        scenario: "key-byte-preservation",
        apiKey: exactKey
    });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, true, JSON.stringify(started));
    const httpCalls = harness.calls.filter(call => call.kind === "http");
    assert.ok(httpCalls.length > 0);
    const runpodCalls = httpCalls.filter(call => !call.url.includes("docker.io"));
    assert.ok(runpodCalls.every(call => call.authorizationMatches === true));
    const availabilityCall = runpodCalls.find(call => call.encodedKeyMatches === true);
    assert.ok(availabilityCall, "RunPod availability must receive the exact encoded API key");
    assert.equal(JSON.stringify(httpCalls).includes(exactKey), false);
    await harness.engine.cancel({ operationName: started.operationName });
    assert.equal(harness.deleted, true);
});

test("V142 RunPod refreshes a stale failed bootstrap on the same Pod and obligation", async () => {
    const harness = runpodPhysicalHarness({ scenario: "bootstrap-refresh" });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, true, JSON.stringify(started));
    const bootstrapping = await harness.engine.poll({ operationName: started.operationName });
    assert.equal(bootstrapping.done, false);
    const refresh = await harness.engine.poll({ operationName: started.operationName });
    assert.equal(refresh.status, "LOCAL_VIDEO_GENERATION_STARTED");
    assert.equal(refresh.remotePoll.status, "RUNPOD_WAN22_BOOTSTRAP_REFRESH_REQUIRED");
    const completed = await pollRunpodUntilDone(harness.engine, started.operationName, 10);
    assert.equal(completed.status, "VIDEO_GENERATED_VERIFIED");
    assert.equal(harness.calls.filter(call => call.kind === "http" && call.method === "POST" && call.url.endsWith("/pods")).length, 1);
    assert.equal(completed.workerRelease.status, "RUNPOD_POD_TERMINATED_VERIFIED");
});

test("V142 RunPod classifies a current bootstrap failure before inference as BOOTSTRAP_INCOMPLETE", async () => {
    const harness = runpodPhysicalHarness({ scenario: "bootstrap-fail" });
    const started = await harness.engine.start(harness.payload);
    await harness.engine.poll({ operationName: started.operationName });
    const failed = await pollRunpodUntilDone(harness.engine, started.operationName);
    assert.equal(failed.ok, false);
    assert.equal(failed.status, "RUNPOD_BOOTSTRAP_INCOMPLETE");
    assert.equal(failed.remoteWorker.phase, "BOOTSTRAP_INCOMPLETE");
    assert.equal(failed.workerRelease.terminationVerified, true);
    assert.equal(harness.deleted, true);
});

test("V142 RunPod blocks inference when the complete Wan runtime probe is not healthy", async () => {
    const harness = runpodPhysicalHarness({ scenario: "runtime-health-fail" });
    const started = await harness.engine.start(harness.payload);
    const failed = await pollRunpodUntilDone(harness.engine, started.operationName);
    assert.equal(failed.ok, false, JSON.stringify(failed));
    assert.equal(failed.status, "RUNPOD_WAN22_RUNTIME_PREFLIGHT_FAILED");
    assert.equal(failed.remoteWorker.phase, "RUNTIME_PREFLIGHT_FAILED");
    assert.equal(failed.workerRelease.terminationVerified, true);
    assert.equal(harness.deleted, true);
});

test("V142 every paid physical preflight failure keeps inference stopped and requires Pod deletion", async t => {
    const cases = [
        ["physical GPU", { baseHealthOverrides: { gpuName: "NVIDIA RTX 4090" } }, "RUNPOD_IMAGE_RUNTIME_MISMATCH"],
        ["CUDA", { baseHealthOverrides: { cuda: false, cudaProbe: false } }, "RUNPOD_IMAGE_RUNTIME_MISMATCH"],
        ["compute capability", { baseHealthOverrides: { computeCapability: "8.9" } }, "RUNPOD_IMAGE_RUNTIME_MISMATCH"],
        ["Torch", { baseHealthOverrides: { torchVersion: "2.7.0+cu126" } }, "RUNPOD_IMAGE_RUNTIME_MISMATCH"],
        ["Python", { baseHealthOverrides: { pythonVersion: "3.11.9" } }, "RUNPOD_IMAGE_RUNTIME_MISMATCH"],
        ["FFmpeg", { baseHealthOverrides: { ffmpeg: false } }, "RUNPOD_IMAGE_RUNTIME_MISMATCH"],
        ["NVCC", { baseHealthOverrides: { nvcc: false } }, "RUNPOD_IMAGE_RUNTIME_MISMATCH"],
        ["FlashAttention", { runtimeHealthOverrides: { flashAttention: false, dependencyContract: false } }, "RUNPOD_WAN22_RUNTIME_PREFLIGHT_FAILED"],
        ["Python imports", { runtimeHealthOverrides: { imports: false, dependencyContract: false } }, "RUNPOD_WAN22_RUNTIME_PREFLIGHT_FAILED"],
        ["pip check", { runtimeHealthOverrides: { pipCheck: false, dependencyContract: false } }, "RUNPOD_WAN22_RUNTIME_PREFLIGHT_FAILED"],
        ["CUDA operation", { runtimeHealthOverrides: { runtimeCudaProbe: false, dependencyContract: false } }, "RUNPOD_WAN22_RUNTIME_PREFLIGHT_FAILED"],
        ["generate.py help", { runtimeHealthOverrides: { wanCliImport: false, dependencyContract: false } }, "RUNPOD_WAN22_RUNTIME_PREFLIGHT_FAILED"],
        ["physical model integrity", { runtimeHealthOverrides: { wanModel: false, dependencyContract: false } }, "RUNPOD_WAN22_RUNTIME_PREFLIGHT_FAILED"]
    ];
    for (const [name, options, expected] of cases) {
        await t.test(name, async () => {
            const harness = runpodPhysicalHarness({ scenario: `physical-${name.replaceAll(" ", "-")}`, ...options });
            const started = await harness.engine.start(harness.payload);
            assert.equal(started.ok, true, JSON.stringify(started));
            const failed = await pollRunpodUntilDone(harness.engine, started.operationName);
            assert.equal(failed.ok, false, JSON.stringify(failed));
            assert.equal(failed.status, expected);
            assert.equal(harness.inferenceStarts, 0);
            assert.equal(failed.workerRelease.terminationVerified, true);
            assert.equal(harness.deleted, true);
            assert.equal(listArtifacts({ root: harness.root, type: "video" }).length, 0);
        });
    }
});

test("V142 RunPod availability follows authenticated stockStatus while preserving count, GPU, VRAM and price guards", async t => {
    await t.test("availableGpuCounts [1] is available", async () => {
        const harness = runpodPhysicalHarness({
            availability: { availableGpuCounts: [1] }
        });
        const started = await harness.engine.start(harness.payload);
        assert.equal(started.ok, true, JSON.stringify(started));
        await harness.engine.cancel({ operationName: started.operationName });
        assert.equal(harness.deleted, true);
    });

    for (const stockStatus of ["Low", "Medium", "High"]) {
        await t.test(`availableGpuCounts null with ${stockStatus} stock is available`, async () => {
            const harness = runpodPhysicalHarness({
                scenario: `null-counts-${stockStatus.toLowerCase()}`,
                availability: {
                    availableGpuCounts: null,
                    stockStatus
                }
            });
            const started = await harness.engine.start(harness.payload);
            assert.equal(started.ok, true, JSON.stringify(started));
            await harness.engine.cancel({ operationName: started.operationName });
            assert.equal(harness.deleted, true);
        });
    }

    for (const [name, availability, expectedError] of [
        ["stock None", { stockStatus: "None" }, "RUNPOD_COMPATIBLE_GPU_UNAVAILABLE"],
        ["insufficient VRAM", { vramGb: 16 }, "RUNPOD_COMPATIBLE_GPU_UNAVAILABLE"],
        ["invalid price", { hourlyRateUsd: 0 }, "RUNPOD_HOURLY_RATE_INVALID"],
        ["different GPU", { gpuId: "NVIDIA RTX A6000" }, "RUNPOD_COMPATIBLE_GPU_UNAVAILABLE"],
        ["count one absent", { availableGpuCounts: [2, 4] }, "RUNPOD_COMPATIBLE_GPU_UNAVAILABLE"],
        ["ambiguous stock", { stockStatus: "Unknown" }, "RUNPOD_COMPATIBLE_GPU_UNAVAILABLE"],
        ["unauthenticated response", { authenticated: false }, "RUNPOD_AVAILABILITY_UNAUTHENTICATED"]
    ]) {
        await t.test(`${name} fails closed before Pod creation`, async () => {
            const harness = runpodPhysicalHarness({
                scenario: `availability-${name.replaceAll(" ", "-")}`,
                availability
            });
            const started = await harness.engine.start(harness.payload);
            assert.equal(started.ok, false, JSON.stringify(started));
            assert.equal(started.error, expectedError);
            assert.equal(
                harness.calls.filter(call => call.url.endsWith("/pods") && call.method === "POST").length,
                0
            );
            assert.equal(harness.createdBody, null);
        });
    }
});

test("V142 RunPod adapter fails closed on provision and real worker health failures", async t => {
    await t.test("provision failure creates no successful operation", async () => {
        const harness = runpodPhysicalHarness({ scenario: "provision-fail" });
        const started = await harness.engine.start(harness.payload);
        const duplicate = await harness.engine.start(harness.payload);
        assert.equal(started.ok, false);
        assert.equal(started.status, "LOCAL_VIDEO_RUNNER_START_FAILED");
        assert.equal(started.error, "RUNPOD_API_HTTP_503");
        assert.equal(started.failureStage, "provision");
        assert.equal(duplicate.reusedOperation, true);
        assert.equal(duplicate.retryAttempted, undefined);
        assert.equal(duplicate.operationName, started.operationName);
        assert.equal(harness.calls.filter(call => call.kind === "http" && call.method === "POST").length, 2);
        assert.equal(harness.calls.some(call => call.method === "DELETE"), false);
        assert.equal(listArtifacts({ root: harness.root, type: "video" }).length, 0);
    });

    await t.test("HTTP provisioning failures persist sanitized provider diagnostics", async () => {
        const harness = runpodPhysicalHarness({ scenario: "provision-http-500-diagnostic" });
        const started = await harness.engine.start(harness.payload);
        assert.equal(started.ok, false, JSON.stringify(started));
        assert.equal(started.error, "RUNPOD_API_HTTP_500");
        assert.equal(started.failureStage, "provision");
        assert.equal(started.providerHttp.status, 500);
        assert.equal(started.providerHttp.stage, "provision");
        assert.equal(started.providerHttp.operationId, started.operationId);
        assert.equal(started.providerHttp.endpoint, "https://rest.runpod.io/v1/pods");
        assert.equal(started.providerHttp.method, "POST");
        assert.equal(started.providerHttp.contentType, "application/json; charset=utf-8");
        assert.equal(started.providerHttp.requestId, "req-v142-cpu-500");
        assert.equal(started.providerHttp.timestampUtc, "2026-08-27T12:00:00.000Z");
        assert.match(started.providerHttp.body, /internal scheduling error/);
        assert.match(started.providerHttp.body, /\[REDACTED\]/);
        assert.equal(started.providerHttp.headers["x-request-id"], "req-v142-cpu-500");
        assert.equal(Object.hasOwn(started.providerHttp.headers, "set-cookie"), false);

        const persisted = JSON.parse(fs.readFileSync(path.join(
            harness.root,
            ".jarvis-artifacts",
            ".video-worker",
            "runpod",
            `${started.operationId}.json`
        ), "utf8"));
        assert.equal(persisted.phase, "PROVISION_FAILED");
        assert.deepEqual(persisted.providerHttp, started.providerHttp);
        assert.equal(JSON.stringify(persisted).includes(harness.env.RUNPOD_API_KEY), false);
        assert.equal(JSON.stringify(started).includes(harness.env.RUNPOD_API_KEY), false);
        assert.equal(
            harness.calls.filter(call => call.url.endsWith("/pods") && call.method === "POST").length,
            1
        );
    });

    await t.test("RUNNING is not READY until CUDA, NVIDIA, VRAM and disk pass", async () => {
        const harness = runpodPhysicalHarness({ scenario: "health-fail" });
        const started = await harness.engine.start(harness.payload);
        const failed = await pollRunpodUntilDone(harness.engine, started.operationName);
        assert.equal(failed.ok, false);
        assert.equal(failed.status, "RUNPOD_IMAGE_RUNTIME_MISMATCH");
        assert.equal(failed.workerRelease.terminationVerified, true);
        assert.equal(harness.deleted, true);
        assert.equal(listArtifacts({ root: harness.root, type: "video" }).length, 0);
    });
});

test("V142 RunPod polling retries transport on the same Pod/job and durable obligation never provisions twice", async () => {
    const harness = runpodPhysicalHarness({ scenario: "poll-timeout" });
    const started = await harness.engine.start(harness.payload);
    const duplicate = await harness.engine.start(harness.payload);
    assert.equal(duplicate.reusedOperation, true);
    assert.equal(duplicate.operationName, started.operationName);
    assert.equal(duplicate.remoteJobId, started.remoteJobId);

    const firstPoll = await harness.engine.poll({ operationName: started.operationName });
    assert.equal(firstPoll.ok, true);
    assert.equal(firstPoll.done, false);
    assert.equal(firstPoll.remotePoll.status, "RUNPOD_POLL_TRANSPORT_RETRYABLE");
    assert.equal(firstPoll.remotePoll.retryable, true);
    const completed = await pollRunpodUntilDone(harness.engine, started.operationName);
    assert.equal(completed.ok, true);
    assert.equal(harness.calls.filter(call => call.kind === "http" && call.method === "POST").length, 2);
    assert.match(harness.createdBody.name, /^jarvis-v142-[a-f0-9]{24}$/);
    assert.equal(
        harness.createdBody.name.endsWith(harness.createdBody.env.JARVIS_OBLIGATION_FINGERPRINT.slice(0, 24)),
        true
    );
});

test("V142 RunPod pre-provision transport recovery reuses the same operation and provisions at most one Pod", async () => {
    const harness = runpodPhysicalHarness({ scenario: "availability-transport-once" });
    const first = await harness.engine.start(harness.payload);
    assert.equal(first.ok, false, JSON.stringify(first));
    assert.equal(first.error, "RUNPOD_API_TRANSPORT_FAILED");
    assert.equal(first.failureStage, "availability");
    assert.equal(first.providerCode, "UNABLE_TO_VERIFY_LEAF_SIGNATURE");
    assert.match(first.providerMessage, /UNABLE_TO_VERIFY_LEAF_SIGNATURE/);
    assert.equal(first.providerMessage.includes(harness.env.RUNPOD_API_KEY), false);
    assert.equal(first.providerMessage.includes(encodeURIComponent(harness.env.RUNPOD_API_KEY)), false);
    assert.equal(first.retryable, true);
    assert.equal(first.podId, undefined);
    assert.equal(first.gpuRentalSeconds, 0);
    assert.equal(first.gpuRentalEstimatedCost, 0);
    assert.equal(first.gpuRentalActualCost, 0);
    assert.equal(first.workerRelease.status, "REMOTE_VIDEO_WORKER_NOT_PROVISIONED");
    assert.equal(first.workerRelease.terminationVerified, true);

    const recovered = await harness.engine.start(harness.payload);
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    assert.equal(recovered.reusedOperation, true);
    assert.equal(recovered.retryAttempted, true);
    assert.equal(recovered.operationName, first.operationName);
    assert.equal(recovered.launchAttempt, 2);
    assert.equal(recovered.attemptHistory.length, 1);
    assert.equal(recovered.attemptHistory[0].failureStage, "availability");
    assert.equal(recovered.attemptHistory[0].providerCode, "UNABLE_TO_VERIFY_LEAF_SIGNATURE");
    assert.ok(recovered.remoteWorker.provisionedAt);
    assert.equal(
        harness.calls.filter(call => call.url.endsWith("/pods") && call.method === "POST").length,
        1
    );

    const cancelled = await harness.engine.cancel({ operationName: recovered.operationName });
    assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
    assert.equal(cancelled.workerRelease.terminationVerified, true);
    assert.equal(harness.deleted, true);
});

test("V142 RunPod maps a later physical attempt of the same durable obligation to the same Pod identity after deletion", async () => {
    const durableIdentity = {
        missionId: "MISSION-V142-EP1-A40-SMOKE-001",
        objectiveId: "OBJECTIVE-V142-EP1-VISUAL-PIPELINE",
        obligationId: "OBLIGATION-V142-EP1-SHOT-001",
        rootInstructionHash: "8717f7c993f996ec329527a065a0f10b2d57258b3f762580fd58198b82291993"
    };
    const first = runpodPhysicalHarness({ scenario: "physical-attempt-one", durableIdentity });
    const firstStarted = await first.engine.start(first.payload);
    const firstCancelled = await first.engine.cancel({ operationName: firstStarted.operationName });
    assert.equal(firstCancelled.workerRelease.terminationVerified, true);
    assert.equal(first.deleted, true);

    const second = runpodPhysicalHarness({ scenario: "physical-attempt-two", durableIdentity });
    const secondStarted = await second.engine.start(second.payload);
    assert.equal(secondStarted.ok, true, JSON.stringify(secondStarted));
    assert.equal(second.createdBody.name, first.createdBody.name);
    assert.equal(second.createdBody.env.JARVIS_OBLIGATION_FINGERPRINT, first.createdBody.env.JARVIS_OBLIGATION_FINGERPRINT);
    assert.equal(first.calls.filter(call => call.method === "POST" && call.url.endsWith("/pods")).length, 1);
    assert.equal(second.calls.filter(call => call.method === "POST" && call.url.endsWith("/pods")).length, 1);
    await second.engine.cancel({ operationName: secondStarted.operationName });
    assert.equal(second.deleted, true);
});

test("V142 RunPod terminates an already-active Pod for the same obligation and refuses simultaneous provisioning", async () => {
    const harness = runpodPhysicalHarness({ scenario: "existing-obligation-pod" });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, false, JSON.stringify(started));
    assert.equal(started.error, "RUNPOD_EXISTING_OPERATION_POD_TERMINATED");
    assert.equal(harness.orphanDeleted, true);
    assert.equal(harness.createdBody, null);
    assert.equal(
        harness.calls.filter(call => call.method === "POST" && call.url.endsWith("/pods")).length,
        0
    );
});

test("V142 RunPod adapter handles job failure, bad SHA, bad MP4 and mandatory delete failure honestly", async t => {
    const expected = {
        "job-failure": "RUNPOD_WAN_GENERATION_FAILED",
        "bad-sha": "REMOTE_VIDEO_RESULT_SHA256_MISMATCH",
        "bad-mp4": "LOCAL_VIDEO_MP4_CONTAINER_INVALID",
        "release-fail": "REMOTE_VIDEO_WORKER_RELEASE_FAILED"
    };
    for (const [scenario, status] of Object.entries(expected)) {
        await t.test(scenario, async () => {
            const harness = runpodPhysicalHarness({ scenario });
            const started = await harness.engine.start(harness.payload);
            const completed = await pollRunpodUntilDone(harness.engine, started.operationName);
            assert.equal(completed.ok, false);
            assert.equal(completed.status, status, JSON.stringify(completed));
            assert.equal(listArtifacts({ root: harness.root, type: "video" }).length, 0);
            if (scenario === "release-fail") {
                assert.equal(completed.workerRelease.ok, false);
                assert.equal(harness.deleted, false);
            }
            else {
                assert.equal(completed.workerRelease.terminationVerified, true);
                assert.equal(harness.deleted, true);
            }
        });
    }
});

test("V142 RunPod hard cap cancels before USD 2 and still deletes the Pod", async () => {
    const clock = { value: "2026-08-27T12:00:00.000Z" };
    const harness = runpodPhysicalHarness({ scenario: "budget", clock });
    const started = await harness.engine.start(harness.payload);
    clock.value = "2026-08-27T16:20:00.000Z";
    const completed = await pollRunpodUntilDone(harness.engine, started.operationName);
    assert.equal(completed.ok, false);
    assert.equal(completed.status, "RUNPOD_HARD_BUDGET_EXCEEDED");
    assert.equal(completed.workerRelease.terminationVerified, true);
    assert.ok(completed.gpuRentalEstimatedCost < 2);
    assert.equal(harness.deleted, true);
});

test("V142 RunPod distinguishes bootstrap timeout from inference timeout and deletes the Pod", async t => {
    await t.test("bootstrap timeout", async () => {
        const clock = { value: "2026-08-27T12:00:00.000Z" };
        const harness = runpodPhysicalHarness({
            scenario: "bootstrap-timeout",
            clock,
            bootstrapProgressSequence: [
                { stage: "MODEL_DOWNLOAD", status: "RUNNING", cacheStatus: "CACHE_POPULATING", modelBytes: 100, at: "2026-08-27T12:00:00.000Z" },
                { stage: "MODEL_DOWNLOAD", status: "RUNNING", cacheStatus: "CACHE_POPULATING", modelBytes: 100, at: "2026-08-27T12:00:00.000Z" }
            ],
            envOverrides: { JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: "30" }
        });
        const started = await harness.engine.start(harness.payload);
        await harness.engine.poll({ operationName: started.operationName });
        clock.value = "2026-08-27T12:00:31.000Z";
        const failed = await pollRunpodUntilDone(harness.engine, started.operationName);
        assert.equal(failed.status, "RUNPOD_BOOTSTRAP_TIMEOUT");
        assert.equal(failed.workerRelease.terminationVerified, true);
        assert.equal(harness.deleted, true);
    });

    await t.test("inference timeout", async () => {
        const clock = { value: "2026-08-27T12:00:00.000Z" };
        const harness = runpodPhysicalHarness({
            scenario: "inference-timeout",
            clock,
            envOverrides: { JARVIS_RUNPOD_INFERENCE_TIMEOUT_SECONDS: "30" }
        });
        const started = await harness.engine.start(harness.payload);
        await harness.engine.poll({ operationName: started.operationName });
        await harness.engine.poll({ operationName: started.operationName });
        clock.value = "2026-08-27T12:00:31.000Z";
        const failed = await pollRunpodUntilDone(harness.engine, started.operationName);
        assert.equal(failed.status, "RUNPOD_INFERENCE_TIMEOUT");
        assert.equal(failed.workerRelease.terminationVerified, true);
        assert.equal(harness.deleted, true);
    });
});

function remoteWanFixture(prefix = "jarvis-remote-contract-") {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const runner = path.join(root, "runner.py");
    const model = path.join(root, "wan-model");
    fs.writeFileSync(runner, "# controlled remote runner\n");
    fs.mkdirSync(model, { recursive: true });
    return {
        root,
        env: {
            JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
            JARVIS_LOCAL_VIDEO_ENABLED: "true",
            JARVIS_LOCAL_VIDEO_EXECUTION_TARGET: "remote",
            JARVIS_LOCAL_VIDEO_RUNNER: process.execPath,
            JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: runner,
            JARVIS_LOCAL_VIDEO_MODEL_DIR: model,
            JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: "30",
            JARVIS_REMOTE_GPU_HOURLY_RATE_USD: "1.8",
            PATH: process.env.PATH,
            PATHEXT: process.env.PATHEXT
        }
    };
}

function automaticLocalHealth(overrides = {}) {
    return {
        ok: true,
        status: "LOCAL_VIDEO_BACKEND_READY",
        backends: [
            localBackend({
                backend: "wan22-ti2v-5b",
                model: "Wan2.2-TI2V-5B",
                imageToVideo: true,
                maximumReferenceAssets: 1,
                ...(overrides.wan22 || {})
            }),
            localBackend({
                backend: "wan21-t2v-1.3b",
                model: "Wan2.1-T2V-1.3B",
                imageToVideo: false,
                maximumReferenceAssets: 0,
                ...(overrides.wan21 || {})
            })
        ]
    };
}

test("LOCAL_PREFERRED automatically selects Wan2.2 before Wan2.1 for T2V and references", () => {
    const policy = describeLocalVideoPolicy({
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_PREFERRED",
        JARVIS_LOCAL_VIDEO_ENABLED: "true",
        JARVIS_LOCAL_VIDEO_CERTIFIED: "true"
    });
    const t2v = resolveVideoEngine({
        policy,
        health: automaticLocalHealth(),
        requirements: { referenceCount: 0, requiresImageToVideo: false }
    });
    const referenced = resolveVideoEngine({
        policy,
        health: automaticLocalHealth(),
        requirements: { referenceCount: 1, requiresImageToVideo: true }
    });

    for (const result of [t2v, referenced]) {
        assert.equal(result.engineUsed, "local");
        assert.equal(result.selectedBackend, "wan22-ti2v-5b");
        assert.equal(result.selectedModel, "Wan2.2-TI2V-5B");
        assert.equal(result.externalApiUsed, false);
        assert.equal(result.externalEstimatedCostUsd, 0);
    }
});

test("LOCAL_PREFERRED selects Wan2.1 only for compatible T2V when Wan2.2 is unavailable", () => {
    const policy = describeLocalVideoPolicy({
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_PREFERRED",
        JARVIS_LOCAL_VIDEO_ENABLED: "true",
        JARVIS_LOCAL_VIDEO_CERTIFIED: "true"
    });
    const health = automaticLocalHealth({
        wan22: { ok: false, status: "LOCAL_VIDEO_MODEL_NOT_READY" }
    });
    const t2v = resolveVideoEngine({
        policy,
        health,
        requirements: { referenceCount: 0, requiresImageToVideo: false }
    });
    const referenced = resolveVideoEngine({
        policy,
        health,
        requirements: { referenceCount: 1, requiresImageToVideo: true }
    });

    assert.equal(t2v.engineUsed, "local");
    assert.equal(t2v.selectedBackend, "wan21-t2v-1.3b");
    assert.equal(referenced.engineUsed, "external");
    assert.equal(referenced.selectedBackend, "google-veo");
    assert.equal(referenced.fallbackUsed, true);
    assert.match(referenced.fallbackReason, /wan22-ti2v-5b=LOCAL_VIDEO_MODEL_NOT_READY/);
    assert.match(referenced.fallbackReason, /wan21-t2v-1\.3b=LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND/);
});

test("automatic local selection rejects missing weights, runner and dependencies despite sufficient VRAM", () => {
    const policy = describeLocalVideoPolicy({
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_PREFERRED",
        JARVIS_LOCAL_VIDEO_ENABLED: "true",
        JARVIS_LOCAL_VIDEO_CERTIFIED: "true"
    });
    for (const status of [
        "LOCAL_VIDEO_MODEL_WEIGHTS_MISSING",
        "LOCAL_VIDEO_RUNNER_UNCONFIGURED",
        "LOCAL_VIDEO_DEPENDENCIES_UNAVAILABLE"
    ]) {
        const resolved = resolveVideoEngine({
            policy,
            health: automaticLocalHealth({
                wan22: { ok: false, status },
                wan21: { ok: false, status: "LOCAL_VIDEO_CUDA_UNAVAILABLE" }
            }),
            requirements: { referenceCount: 0, requiresImageToVideo: false }
        });
        assert.equal(resolved.engineUsed, "external");
        assert.equal(resolved.selectedBackend, "google-veo");
        assert.match(resolved.fallbackReason, new RegExp(`wan22-ti2v-5b=${status}`));
    }
});

test("physical backend health requires runner, repository dependencies and weights per Wan backend", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-local-health-"));
    const runner = path.join(root, "runner.py");
    const wan22Model = path.join(root, "wan22-model");
    const wan21Model = path.join(root, "wan21-model");
    const wan22Repo = path.join(root, "wan22-repo");
    const wan21Repo = path.join(root, "wan21-repo");
    fs.writeFileSync(runner, "# controlled runner\n");
    for (const directory of [wan22Model, wan21Model, wan22Repo, wan21Repo]) {
        fs.mkdirSync(directory, { recursive: true });
    }
    fs.writeFileSync(path.join(wan22Model, "model.safetensors"), "weights");
    fs.writeFileSync(path.join(wan21Model, "model.safetensors"), "weights");
    fs.writeFileSync(path.join(wan22Repo, "generate.py"), "# wan22\n");
    fs.writeFileSync(path.join(wan21Repo, "generate.py"), "# wan21\n");
    const env = {
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_PREFERRED",
        JARVIS_LOCAL_VIDEO_ENABLED: "true",
        JARVIS_LOCAL_VIDEO_RUNNER: process.execPath,
        JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: runner,
        JARVIS_WAN22_MODEL_DIR: wan22Model,
        JARVIS_WAN21_MODEL_DIR: wan21Model,
        JARVIS_WAN22_REPO_DIR: wan22Repo,
        JARVIS_WAN21_REPO_DIR: wan21Repo,
        JARVIS_WAN22_CERTIFIED: "true",
        JARVIS_WAN21_CERTIFIED: "true"
    };
    const engine = createLocalVideoEngine({ root, env, inspectHardware: healthyCapability });
    const healthy = engine.health();
    assert.deepEqual(healthy.backends.map(item => [item.backend, item.ok]), [
        ["wan22-ti2v-5b", true],
        ["wan21-t2v-1.3b", true]
    ]);
    assert.equal(engine.resolve({ referenceCount: 1 }).selectedBackend, "wan22-ti2v-5b");

    fs.rmSync(path.join(wan22Model, "model.safetensors"));
    const withoutWan22Weights = engine.health();
    assert.equal(withoutWan22Weights.backends[0].status, "LOCAL_VIDEO_MODEL_WEIGHTS_MISSING");
    assert.equal(engine.resolve({ referenceCount: 0 }).selectedBackend, "wan21-t2v-1.3b");
    const referencedFallback = engine.resolve({ referenceCount: 1, requiresImageToVideo: true });
    assert.equal(referencedFallback.engineUsed, "external");
    assert.match(referencedFallback.fallbackReason, /wan22-ti2v-5b=LOCAL_VIDEO_MODEL_WEIGHTS_MISSING/);
    assert.match(referencedFallback.fallbackReason, /wan21-t2v-1\.3b=LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND/);

    fs.rmSync(path.join(wan21Repo, "generate.py"));
    assert.equal(engine.health().backends[1].status, "LOCAL_VIDEO_DEPENDENCIES_UNAVAILABLE");
    fs.rmSync(runner);
    assert.equal(engine.health().backends[1].status, "LOCAL_VIDEO_RUNNER_UNCONFIGURED");
});

test("LOCAL_ONLY fails closed and LOCAL_TEST never selects Veo when no compatible backend exists", () => {
    const unavailable = automaticLocalHealth({
        wan22: { ok: false, status: "LOCAL_VIDEO_CUDA_UNAVAILABLE" },
        wan21: { ok: false, status: "LOCAL_VIDEO_CUDA_UNAVAILABLE" }
    });
    for (const mode of ["LOCAL_ONLY", "LOCAL_TEST"]) {
        const resolved = resolveVideoEngine({
            policy: describeLocalVideoPolicy({
                JARVIS_VIDEO_ENGINE_POLICY: mode,
                JARVIS_LOCAL_VIDEO_ENABLED: "true",
                JARVIS_LOCAL_VIDEO_CERTIFIED: "true"
            }),
            health: unavailable,
            requirements: { referenceCount: 0, requiresImageToVideo: false }
        });
        assert.equal(resolved.ok, false);
        assert.equal(resolved.engineUsed, null);
        assert.equal(resolved.selectedBackend, null);
        assert.equal(resolved.externalApiUsed, false);
    }
});

test("CURRENT_STABLE remains an explicit Veo rollback", () => {
    const resolved = resolveVideoEngine({
        policy: describeLocalVideoPolicy({ JARVIS_VIDEO_ENGINE_POLICY: "CURRENT_STABLE" }),
        health: automaticLocalHealth(),
        requirements: { referenceCount: 1, requiresImageToVideo: true }
    });
    assert.equal(resolved.engineRequested, "CURRENT_STABLE");
    assert.equal(resolved.engineUsed, "external");
    assert.equal(resolved.selectedBackend, "google-veo");
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
    assert.equal(report.promotion.current, "LOCAL_PREFERRED");
    assert.equal(report.promotion.rollback, "CURRENT_STABLE");
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

test("external Veo cost is derived from the complete segment plan before provider use", () => {
    const oneSegment = estimateExternalVideoGeneration({ segmentCount: 1 });
    const fourSegments = estimateExternalVideoGeneration({ segmentCount: 4 });
    const invalid = estimateExternalVideoGeneration({
        segmentCount: 2,
        model: "unknown-paid-model"
    });

    assert.equal(oneSegment.ok, true);
    assert.equal(oneSegment.plannedDurationSeconds, 8);
    assert.equal(oneSegment.externalEstimatedCostUsd, 3.2);
    assert.equal(fourSegments.plannedDurationSeconds, 29);
    assert.equal(fourSegments.externalEstimatedCostUsd, 11.6);
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, "EXTERNAL_VIDEO_PRICING_PROFILE_UNSUPPORTED");
});

test("external budget is fail-closed, reserves the full obligation once and LOCAL_TEST forbids it", () => {
    const unconfigured = createLocalVideoEngine({
        root: fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-video-budget-unconfigured-")),
        env: { JARVIS_VIDEO_ENGINE_POLICY: "CURRENT_STABLE" }
    });
    const unconfiguredResult = unconfigured.authorizeExternalCall({
        operationKey: "EP-UNCONFIGURED",
        segmentCount: 1
    });
    assert.equal(unconfiguredResult.ok, false);
    assert.equal(unconfiguredResult.status, "EXTERNAL_VIDEO_BUDGET_NOT_CONFIGURED");
    assert.equal(unconfiguredResult.externalEstimatedCostUsd, 3.2);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-video-budget-"));
    const stable = createLocalVideoEngine({
        root,
        env: {
            JARVIS_VIDEO_ENGINE_POLICY: "CURRENT_STABLE",
            JARVIS_EXTERNAL_BUDGET_USD_PER_OPERATION: "12.00",
            JARVIS_EXTERNAL_BUDGET_USD_PER_EPISODE: "12.00",
            JARVIS_EXTERNAL_BUDGET_USD_PER_DAY: "15.00"
        }
    });
    const first = stable.authorizeExternalCall({ operationKey: "EP-1", segmentCount: 4 });
    const second = stable.authorizeExternalCall({ operationKey: "EP-1", segmentCount: 1 });

    assert.equal(first.ok, true);
    assert.equal(first.externalEstimatedCostUsd, 11.6);
    assert.equal(first.plannedDurationSeconds, 29);
    assert.equal(first.segmentCount, 4);
    assert.equal(second.ok, false);
    assert.equal(second.status, "EXTERNAL_VIDEO_BUDGET_EXCEEDED");

    const localTest = createLocalVideoEngine({
        root: fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-video-budget-local-")),
        env: { JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST" }
    });
    const forbidden = localTest.authorizeExternalCall({ operationKey: "EP-LOCAL", segmentCount: 1 });
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

test("LOCAL_PREFERRED retries a recoverable Wan2.2 failure on compatible Wan2.1 before Veo", async () => {
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
                    const wan21 = payload.excludedBackends?.includes("wan22-ti2v-5b");
                    return {
                        ok: true,
                        policy: "LOCAL_PREFERRED",
                        engineRequested: "LOCAL_PREFERRED",
                        engineUsed: "local",
                        selectedBackend: wan21 ? "wan21-t2v-1.3b" : "wan22-ti2v-5b",
                        externalFallbackEnabled: true,
                        fallbackUsed: wan21,
                        fallbackReason: wan21 ? "wan22-ti2v-5b=LOCAL_VIDEO_RUNNER_START_FAILED" : null,
                        externalApiUsed: false,
                        externalEstimatedCostUsd: 0
                    };
                }
                if (route === "/video/local/start") {
                    if (payload.selectedBackend === "wan21-t2v-1.3b") {
                        return {
                            ok: true,
                            status: "LOCAL_VIDEO_GENERATION_STARTED",
                            operationName: "local-video/wan21-recovery"
                        };
                    }
                    return {
                        ok: false,
                        status: "LOCAL_VIDEO_RUNNER_START_FAILED",
                        error: "controlled recoverable local failure",
                        retryable: true
                    };
                }
                if (route === "/video/local/poll") {
                    return {
                        ok: true,
                        done: true,
                        status: "VIDEO_GENERATED_VERIFIED",
                        operationName: payload.operationName,
                        output: ".jarvis-artifacts/videos/explicit-fallback.mp4",
                        bytes: 120000,
                        sha256: "b".repeat(64),
                        physicallyWritten: true,
                        backend: "wan21-t2v-1.3b",
                        model: "Wan2.1-T2V-1.3B",
                        provider: "local"
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
        assert.equal(result.engineUsed, "local");
        assert.equal(result.selectedBackend, "wan21-t2v-1.3b");
        assert.equal(result.fallbackUsed, true);
        assert.equal(result.fallbackReason, "wan22-ti2v-5b=LOCAL_VIDEO_RUNNER_START_FAILED");
        assert.equal(result.externalApiUsed, false);
        assert.equal(result.externalEstimatedCostUsd, 0);
        assert.equal(cloudCalls.length, 0);
        assert.equal(routes.filter(item => item.route === "/video/local/start").length, 2);
        assert.equal(routes.filter(item => item.route === "/video/engine/resolve").length, 2);
        assert.equal(routes.filter(item => item.route === "/video/engine/authorize-external").length, 0);
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
        globalThis.auth = previousAuth;
    }
});

test("video.generate recovers transient local polling on the same operation and cancels a real poll failure", async t => {
    for (const recover of [true, false]) {
        await t.test(recover ? "same operation recovers" : "bounded failure cancels", async () => {
            const runtime = runtimeFixture();
            registerJarvisActuatorTools(runtime);
            const previousBridge = globalThis.JarvisLocalBridge;
            const previousFetch = globalThis.fetch;
            let starts = 0;
            let polls = 0;
            let cancels = 0;
            try {
                globalThis.fetch = async () => {
                    throw new Error("EXTERNAL_PROVIDER_MUST_NOT_RUN");
                };
                globalThis.JarvisLocalBridge = {
                    async requestJson(route, payload) {
                        if (route === "/video/engine/resolve") {
                            return {
                                ok: true,
                                policy: "LOCAL_TEST",
                                engineRequested: "LOCAL_TEST",
                                engineUsed: "local",
                                selectedBackend: "wan22-ti2v-5b",
                                fallbackUsed: false
                            };
                        }
                        if (route === "/video/local/start") {
                            starts += 1;
                            return { ok: true, operationName: "local-video/stable-operation" };
                        }
                        if (route === "/video/local/poll") {
                            polls += 1;
                            assert.equal(payload.operationName, "local-video/stable-operation");
                            if (!recover || polls === 1) throw new Error("TRANSIENT_POLL_TRANSPORT");
                            return {
                                ok: true,
                                done: true,
                                status: "VIDEO_GENERATED_VERIFIED",
                                operationName: payload.operationName,
                                output: ".jarvis-artifacts/videos/stable-operation.mp4",
                                bytes: 120000,
                                sha256: "d".repeat(64),
                                physicallyWritten: true,
                                provider: "local",
                                backend: "wan22-ti2v-5b",
                                externalApiUsed: false,
                                externalEstimatedCostUsd: 0
                            };
                        }
                        if (route === "/video/local/cancel") {
                            cancels += 1;
                            assert.equal(payload.operationName, "local-video/stable-operation");
                            return { ok: true, done: true, status: "LOCAL_VIDEO_GENERATION_CANCELLED" };
                        }
                        throw new Error(`Unexpected bridge route: ${route}`);
                    }
                };
                const result = await runtime.get("video.generate").execute({
                    prompt: "Keep one logical local generation.",
                    output: ".jarvis-artifacts/videos/stable-operation.mp4"
                }, { waitForVideoPoll: async () => {} });
                assert.equal(starts, 1);
                if (recover) {
                    assert.equal(result.ok, true);
                    assert.equal(result.verifiedArtifactDelivery, true);
                    assert.equal(polls, 2);
                    assert.equal(cancels, 0);
                }
                else {
                    assert.equal(result.ok, false);
                    assert.equal(result.status, "LOCAL_VIDEO_BRIDGE_POLL_FAILED");
                    assert.equal(polls, 4);
                    assert.equal(cancels, 1);
                    assert.equal(result.cancellation.ok, true);
                }
            }
            finally {
                globalThis.JarvisLocalBridge = previousBridge;
                globalThis.fetch = previousFetch;
            }
        });
    }
});

test("simulated remote Wan receives three physical assets, returns a verified MP4 and releases the worker", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-remote-wan-"));
    const runner = path.join(root, "runner.py");
    const model = path.join(root, "wan-model");
    fs.writeFileSync(runner, "# controlled remote runner\n");
    fs.mkdirSync(model, { recursive: true });
    const referenceOutputs = [1, 2, 3].map(index => {
        const output = `.jarvis-artifacts/images/identity-${index}.png`;
        const target = path.join(root, output);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, `P3\n1 1\n255\n${index * 60} 40 160\n`);
        return output;
    });
    const releases = [];
    let receivedJob = null;
    const prepareReferenceSheet = (sheetRoot, references) => {
        const identity = createHash("sha256")
            .update(references.map(reference => reference.output).join("\n"))
            .digest("hex")
            .slice(0, 24);
        const output = `.jarvis-artifacts/video-references/identity-sheet-${identity}.png`;
        const file = path.resolve(sheetRoot, output);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.concat(references.map(reference => fs.readFileSync(reference.file))));
        const bytes = fs.statSync(file).size;
        const sha256 = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
        return {
            output,
            file,
            artifact: { bytes, sha256 },
            sourceReferenceCount: references.length
        };
    };
    const engine = createLocalVideoEngine({
        root,
        env: {
            JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
            JARVIS_LOCAL_VIDEO_ENABLED: "true",
            JARVIS_LOCAL_VIDEO_EXECUTION_TARGET: "remote",
            JARVIS_LOCAL_VIDEO_RUNNER: process.execPath,
            JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: runner,
            JARVIS_LOCAL_VIDEO_MODEL_DIR: model,
            PATH: process.env.PATH,
            PATHEXT: process.env.PATHEXT
        },
        inspectHardware: healthyCapability,
        launch({ job, resultFile, onExit }) {
            receivedJob = job;
            assert.equal(job.executionTarget, "remote");
            assert.equal(job.sourceReferenceFiles.length, 3);
            assert.ok(job.sourceReferenceFiles.every(file => fs.existsSync(file)));
            assert.equal(job.referenceFiles.length, 1);
            assert.ok(fs.existsSync(job.referenceFiles[0]));
            physicalFixture(path.resolve(root, job.output));
            fs.writeFileSync(resultFile, JSON.stringify(successReceipt(job)));
            queueMicrotask(() => onExit(0));
            return { pid: 6262, kill() {} };
        },
        release: async receipt => {
            releases.push(receipt);
            return { ok: true, status: "REMOTE_VIDEO_WORKER_RELEASED", receiptId: "lease-closed-1" };
        },
        prepareReferenceSheet,
        inspectVideo: () => ({ durationSeconds: 8, fps: 24, width: 704, height: 1280 })
    });

    const started = await engine.start({
        script: "Use all physical identity references.",
        prompts: ["One controlled remote Wan scene."],
        referenceOutputs,
        output: ".jarvis-artifacts/videos/remote-wan.mp4"
    });
    const completed = await engine.poll({ operationName: started.operationName });

    assert.equal(started.ok, true, JSON.stringify(started));
    assert.ok(receivedJob, "remote job was not launched");
    assert.equal(receivedJob.sourceReferenceOutputs.length, 3);
    assert.equal(receivedJob.referencePreparation.mode, "identity_reference_sheet");
    assert.equal(receivedJob.referenceOutputs.length, 1);
    assert.equal(completed.ok, true);
    assert.equal(completed.verifiedArtifactDelivery, true);
    assert.equal(completed.externalApiUsed, false);
    assert.equal(completed.externalEstimatedCostUsd, 0);
    assert.equal(completed.workerRelease.ok, true);
    assert.equal(completed.workerRelease.receiptId, "lease-closed-1");
    assert.equal(releases.length, 1);
    assert.equal(releases[0].reason, "generation_succeeded");
    assert.equal(fs.existsSync(path.join(root, completed.output)), true);
    assert.match(completed.sha256, /^[a-f0-9]{64}$/);
});

test("reference-sheet preparation still fails closed when the production FFmpeg binary is unavailable", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-reference-sheet-no-ffmpeg-"));
    const runner = path.join(root, "runner.py");
    const model = path.join(root, "wan-model");
    fs.writeFileSync(runner, "# controlled runner\n");
    fs.mkdirSync(model, { recursive: true });
    const referenceOutputs = [1, 2, 3].map(index => {
        const output = `.jarvis-artifacts/images/no-ffmpeg-${index}.png`;
        const target = path.join(root, output);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, `P3\n1 1\n255\n${index * 40} 60 120\n`);
        return output;
    });
    const engine = createLocalVideoEngine({
        root,
        env: {
            JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
            JARVIS_LOCAL_VIDEO_ENABLED: "true",
            JARVIS_LOCAL_VIDEO_EXECUTION_TARGET: "remote",
            JARVIS_LOCAL_VIDEO_RUNNER: process.execPath,
            JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: runner,
            JARVIS_LOCAL_VIDEO_MODEL_DIR: model,
            PATH: "",
            PATHEXT: process.env.PATHEXT
        },
        inspectHardware: healthyCapability,
        launch() {
            assert.fail("worker must not launch without a verified reference sheet");
        },
        release: async () => ({ ok: true })
    });

    const started = await engine.start({
        script: "Use all identity references.",
        prompts: ["One controlled scene."],
        referenceOutputs,
        output: ".jarvis-artifacts/videos/no-ffmpeg.mp4"
    });

    assert.equal(started.ok, false);
    assert.equal(started.status, "LOCAL_VIDEO_REFERENCE_SHEET_FFMPEG_REQUIRED");
    assert.equal(started.retryable, false);
    assert.equal(started.externalApiUsed, false);
});

test("simulated remote Wan releases the worker when generation fails", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-remote-wan-failure-"));
    const runner = path.join(root, "runner.py");
    const model = path.join(root, "wan-model");
    fs.writeFileSync(runner, "# controlled remote runner\n");
    fs.mkdirSync(model, { recursive: true });
    const releases = [];
    const engine = createLocalVideoEngine({
        root,
        env: {
            JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
            JARVIS_LOCAL_VIDEO_ENABLED: "true",
            JARVIS_LOCAL_VIDEO_EXECUTION_TARGET: "remote",
            JARVIS_LOCAL_VIDEO_RUNNER: process.execPath,
            JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: runner,
            JARVIS_LOCAL_VIDEO_MODEL_DIR: model
        },
        inspectHardware: healthyCapability,
        launch({ resultFile, onExit }) {
            fs.writeFileSync(resultFile, JSON.stringify({
                ok: false,
                status: "REMOTE_WAN_GENERATION_FAILED",
                error: "controlled failure",
                retryable: true
            }));
            queueMicrotask(() => onExit(1));
            return { pid: 6363, kill() {} };
        },
        release: async receipt => {
            releases.push(receipt);
            return { ok: true, status: "REMOTE_VIDEO_WORKER_RELEASED" };
        }
    });
    const started = await engine.start({
        script: "Fail safely.",
        prompts: ["One failing scene."],
        output: ".jarvis-artifacts/videos/remote-failed.mp4"
    });
    const completed = await engine.poll({ operationName: started.operationName });

    assert.equal(completed.ok, false);
    assert.equal(completed.status, "REMOTE_WAN_GENERATION_FAILED");
    assert.equal(completed.workerRelease.ok, true);
    assert.equal(releases.length, 1);
    assert.equal(releases[0].reason, "generation_failed");
    assert.equal(listArtifacts({ root, type: "video" }).length, 0);
});

test("simulated remote Wan binds one worker to one durable obligation and releases it on cancel", async () => {
    const { root, env } = remoteWanFixture("jarvis-remote-obligation-");
    let launches = 0;
    const releases = [];
    const engine = createLocalVideoEngine({
        root,
        env,
        inspectHardware: healthyCapability,
        launch() {
            launches += 1;
            return { pid: 6464, kill() {} };
        },
        release: async receipt => {
            releases.push(receipt);
            return { ok: true, status: "REMOTE_VIDEO_WORKER_RELEASED" };
        }
    });
    const payload = {
        script: "One durable remote obligation.",
        prompts: ["One durable remote scene."],
        output: ".jarvis-artifacts/videos/remote-obligation.mp4",
        missionId: "MISSION-REMOTE-ONE",
        objectiveId: "OBJECTIVE-REMOTE-ONE",
        obligationId: "video.generate:remote-one",
        rootInstructionHash: "a".repeat(64)
    };

    const first = await engine.start(payload);
    const duplicate = await engine.start(payload);
    assert.equal(first.ok, true);
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.reusedOperation, true);
    assert.equal(duplicate.operationName, first.operationName);
    assert.equal(launches, 1);
    const cancelled = await engine.cancel({ operationName: first.operationName });
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.state, "CANCELLED");
    assert.equal(cancelled.workerRelease.ok, true);
    assert.equal(releases.length, 1);
    assert.equal(releases[0].reason, "cancelled");
    const afterCancel = await engine.start(payload);
    assert.equal(afterCancel.ok, false);
    assert.equal(afterCancel.reusedOperation, true);
    assert.equal(afterCancel.operationName, first.operationName);
    assert.equal(launches, 1);
});

test("simulated remote Wan timeout and worker loss both release the rented worker", async t => {
    await t.test("timeout", async () => {
        const { root, env } = remoteWanFixture("jarvis-remote-timeout-");
        let clock = new Date("2026-08-27T00:00:00.000Z");
        const releases = [];
        const engine = createLocalVideoEngine({
            root,
            env,
            inspectHardware: healthyCapability,
            now: () => new Date(clock),
            launch: () => ({ pid: 6565, kill() {} }),
            release: async receipt => {
                releases.push(receipt);
                return { ok: true, status: "REMOTE_VIDEO_WORKER_RELEASED" };
            }
        });
        const started = await engine.start({
            script: "Timeout safely.",
            prompts: ["One timed scene."],
            output: ".jarvis-artifacts/videos/remote-timeout.mp4",
            missionId: "MISSION-REMOTE-TIMEOUT",
            objectiveId: "OBJECTIVE-REMOTE-TIMEOUT",
            obligationId: "video.generate:remote-timeout"
        });
        clock = new Date(clock.getTime() + 91_000);
        const timedOut = await engine.poll({ operationName: started.operationName });
        assert.equal(timedOut.ok, false);
        assert.equal(timedOut.status, "LOCAL_VIDEO_OPERATION_STALE");
        assert.equal(timedOut.workerRelease.ok, true);
        assert.equal(releases.length, 1);
        assert.equal(releases[0].reason, "operation_stale");
        assert.ok(timedOut.gpuRentalSeconds >= 91);
        assert.ok(timedOut.gpuRentalEstimatedCost > 0);
    });

    await t.test("worker lost", async () => {
        const { root, env } = remoteWanFixture("jarvis-remote-lost-");
        const releases = [];
        const engine = createLocalVideoEngine({
            root,
            env,
            inspectHardware: healthyCapability,
            launch({ onExit }) {
                queueMicrotask(() => onExit(1));
                return { pid: 6666, kill() {} };
            },
            release: async receipt => {
                releases.push(receipt);
                return { ok: true, status: "REMOTE_VIDEO_WORKER_RELEASED" };
            }
        });
        const started = await engine.start({
            script: "Detect a lost worker.",
            prompts: ["One lost-worker scene."],
            output: ".jarvis-artifacts/videos/remote-lost.mp4"
        });
        await new Promise(resolve => setImmediate(resolve));
        const lost = await engine.poll({ operationName: started.operationName });
        assert.equal(lost.ok, false);
        assert.equal(lost.status, "LOCAL_VIDEO_RUNNER_EXITED_WITHOUT_RESULT");
        assert.equal(lost.workerRelease.ok, true);
        assert.equal(releases.length, 1);
        assert.equal(releases[0].reason, "failed");
    });
});

test("simulated remote Wan rejects bad SHA and bad MP4 and fails closed on shutdown failure", async t => {
    for (const scenario of ["bad-sha", "bad-mp4", "shutdown-failure"]) {
        await t.test(scenario, async () => {
            const { root, env } = remoteWanFixture(`jarvis-remote-${scenario}-`);
            const releases = [];
            const engine = createLocalVideoEngine({
                root,
                env,
                inspectHardware: healthyCapability,
                launch({ job, resultFile, onExit }) {
                    if (scenario === "bad-mp4") {
                        fs.mkdirSync(path.dirname(job.outputFile), { recursive: true });
                        fs.writeFileSync(job.outputFile, Buffer.alloc(120000, 9));
                    }
                    else {
                        physicalFixture(job.outputFile);
                    }
                    const receipt = successReceipt(job, scenario === "bad-sha"
                        ? { sha256: "0".repeat(64) }
                        : {});
                    fs.writeFileSync(resultFile, JSON.stringify(receipt));
                    queueMicrotask(() => onExit(0));
                    return { pid: 6767, kill() {} };
                },
                release: async receipt => {
                    releases.push(receipt);
                    return scenario === "shutdown-failure"
                        ? { ok: false, status: "REMOTE_PROVIDER_SHUTDOWN_FAILED" }
                        : { ok: true, status: "REMOTE_VIDEO_WORKER_RELEASED" };
                },
                inspectVideo: () => ({ durationSeconds: 8, fps: 24, width: 704, height: 1280 })
            });
            const started = await engine.start({
                script: `Validate ${scenario}.`,
                prompts: [`One ${scenario} scene.`],
                output: `.jarvis-artifacts/videos/remote-${scenario}.mp4`
            });
            const completed = await engine.poll({ operationName: started.operationName });
            assert.equal(completed.ok, false);
            assert.equal(releases.length, 1);
            if (scenario === "bad-sha") {
                assert.equal(completed.status, "REMOTE_VIDEO_RESULT_SHA256_MISMATCH");
                assert.equal(completed.workerRelease.ok, true);
            }
            if (scenario === "bad-mp4") {
                assert.equal(completed.status, "LOCAL_VIDEO_MP4_CONTAINER_INVALID");
                assert.equal(completed.workerRelease.ok, true);
            }
            if (scenario === "shutdown-failure") {
                assert.equal(completed.status, "REMOTE_VIDEO_WORKER_RELEASE_FAILED");
                assert.equal(completed.workerRelease.ok, false);
            }
        });
    }
});

test("recoverable Wan2.2 reference failure skips Wan2.1 and preserves the asset on explicit Veo fallback", async () => {
    const runtime = runtimeFixture();
    registerJarvisActuatorTools(runtime);
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    const previousAuth = globalThis.auth;
    const routes = [];
    const cloudCalls = [];
    const referenceOutput = ".jarvis-artifacts/images/identity.png";
    const imageBytes = Buffer.from("verified-reference-image").toString("base64");
    try {
        globalThis.auth = { currentUser: { getIdToken: async () => "reference-fallback-token" } };
        globalThis.fetch = async (_url, options = {}) => {
            const data = JSON.parse(options.body).data;
            cloudCalls.push(data);
            const result = data.action === "start"
                ? { ok: true, operationName: "operations/reference-fallback" }
                : {
                    ok: true,
                    done: true,
                    operationName: data.operationName,
                    downloadUrl: "https://firebasestorage.googleapis.com/reference-fallback.mp4",
                    storageObject: "jarvis-video-temp/reference-fallback.mp4",
                    sha256: "e".repeat(64),
                    provider: "google-veo-vertex",
                    model: "veo-3.1-generate-001"
                };
            return { ok: true, status: 200, text: async () => JSON.stringify({ result }) };
        };
        globalThis.JarvisLocalBridge = {
            async requestJson(route, payload) {
                routes.push({ route, payload });
                if (route === "/artifact/read") {
                    return { ok: true, output: referenceOutput, mimeType: "image/png", dataBase64: imageBytes };
                }
                if (route === "/video/engine/resolve") {
                    if (payload.excludedBackends?.includes("wan22-ti2v-5b")) {
                        assert.equal(payload.referenceCount, 1);
                        assert.equal(payload.requiresImageToVideo, true);
                        return {
                            ok: true,
                            policy: "LOCAL_PREFERRED",
                            engineRequested: "LOCAL_PREFERRED",
                            engineUsed: "external",
                            selectedBackend: "google-veo",
                            externalFallbackEnabled: true,
                            fallbackUsed: true,
                            fallbackReason: "LOCAL_VIDEO_BACKENDS_UNAVAILABLE:wan22-ti2v-5b=LOCAL_VIDEO_RUNNER_START_FAILED;wan21-t2v-1.3b=LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND"
                        };
                    }
                    return {
                        ok: true,
                        policy: "LOCAL_PREFERRED",
                        engineRequested: "LOCAL_PREFERRED",
                        engineUsed: "local",
                        selectedBackend: "wan22-ti2v-5b",
                        externalFallbackEnabled: true,
                        fallbackUsed: false
                    };
                }
                if (route === "/video/local/start") {
                    assert.deepEqual(payload.referenceOutputs, [referenceOutput]);
                    return { ok: false, status: "LOCAL_VIDEO_RUNNER_START_FAILED", retryable: true };
                }
                if (route === "/video/engine/authorize-external") {
                    return { ok: true, externalApiUsed: true, externalEstimatedCostUsd: 0.25 };
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
            prompt: "Preserve the verified identity reference.",
            referenceOutputs: [referenceOutput],
            output: ".jarvis-artifacts/videos/reference-fallback.mp4"
        }, {
            waitForVideoPoll: async () => {},
            externalVideoAuthorization: {
                approved: true,
                approvedBy: "HEBERTO_MENDOZA",
                approvalSource: "trusted_runtime_context"
            }
        });

        const cloudStart = cloudCalls.find(call => call.action === "start");
        assert.equal(result.ok, true);
        assert.equal(result.engineUsed, "external");
        assert.equal(result.fallbackUsed, true);
        assert.match(result.fallbackReason, /wan21-t2v-1\.3b=LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND/);
        assert.equal(result.referenceImageCount, 1);
        assert.equal(result.verifiedArtifactDelivery, true);
        assert.equal(cloudCalls.filter(call => call.action === "start").length, 1);
        assert.equal(cloudStart.referenceImages.length, 1);
        assert.equal(cloudStart.referenceImages[0].imageBytes, imageBytes);
        assert.equal(routes.filter(item => item.route === "/video/local/start").length, 1);
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
        globalThis.auth = previousAuth;
    }
});

test("video.generate public input contract remains unchanged", () => {
    const runtime = runtimeFixture();
    registerJarvisActuatorTools(runtime);
    assert.deepEqual(Object.keys(runtime.get("video.generate").inputSchema), [
        "script", "prompt", "scenes", "referenceOutputs", "aspectRatio", "output",
        "caseId", "objectiveId", "seriesId", "episodeId"
    ]);
});

test("LOCAL_PREFERRED Wan failure fails closed before Veo without explicit human authorization", async () => {
    const runtime = runtimeFixture();
    registerJarvisActuatorTools(runtime);
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    const routes = [];
    let cloudCalls = 0;
    try {
        globalThis.fetch = async () => {
            cloudCalls += 1;
            throw new Error("Veo must not be called");
        };
        globalThis.JarvisLocalBridge = {
            async requestJson(route, payload) {
                routes.push({ route, payload });
                if (route === "/video/engine/resolve") {
                    if (payload.excludedBackends?.includes("wan22-ti2v-5b")) {
                        return {
                            ok: true,
                            policy: "LOCAL_PREFERRED",
                            engineRequested: "LOCAL_PREFERRED",
                            engineUsed: "external",
                            selectedBackend: "google-veo",
                            externalFallbackEnabled: true,
                            fallbackUsed: true,
                            fallbackReason: "LOCAL_VIDEO_BACKENDS_UNAVAILABLE"
                        };
                    }
                    return {
                        ok: true,
                        policy: "LOCAL_PREFERRED",
                        engineRequested: "LOCAL_PREFERRED",
                        engineUsed: "local",
                        selectedBackend: "wan22-ti2v-5b",
                        externalFallbackEnabled: true
                    };
                }
                if (route === "/video/local/start") {
                    assert.equal(payload.missionId, "MISSION-LOCAL-ONE");
                    assert.equal(payload.objectiveId, "OBJECTIVE-LOCAL-ONE");
                    assert.equal(payload.obligationId, "video.generate:offline-one");
                    assert.equal(payload.rootInstructionHash, "f".repeat(64));
                    return {
                        ok: false,
                        status: "LOCAL_VIDEO_REMOTE_WORKER_UNAVAILABLE",
                        error: "LOCAL_VIDEO_REMOTE_WORKER_UNAVAILABLE",
                        retryable: true
                    };
                }
                throw new Error(`Unexpected bridge route: ${route}`);
            }
        };
        const result = await runtime.get("video.generate").execute({
            prompt: "Do not spend externally after the remote worker fails.",
            output: ".jarvis-artifacts/videos/fail-closed.mp4"
        }, {
            waitForVideoPoll: async () => {},
            missionId: "MISSION-LOCAL-ONE",
            objectiveId: "OBJECTIVE-LOCAL-ONE",
            obligationId: "video.generate:offline-one",
            rootInstructionHash: "f".repeat(64)
        });

        assert.equal(result.ok, false);
        assert.equal(result.status, "EXTERNAL_VIDEO_HUMAN_AUTHORIZATION_REQUIRED");
        assert.equal(result.requiresInput, false);
        assert.equal(result.requiresApproval, true);
        assert.equal(result.externalApiUsed, false);
        assert.equal(result.externalEstimatedCostUsd, 0);
        assert.equal(cloudCalls, 0);
        assert.equal(routes.filter(item => item.route === "/video/engine/authorize-external").length, 0);
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
    }
});

test("V142 resolve gates local backends by mission reference requirements", () => {
    const preferred = describeLocalVideoPolicy({
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_PREFERRED",
        JARVIS_LOCAL_VIDEO_ENABLED: "true",
        JARVIS_LOCAL_VIDEO_CERTIFIED: "true",
        JARVIS_EXTERNAL_FALLBACK_ENABLED: "true"
    });
    const lightHealth = {
        ok: true,
        status: "LOCAL_VIDEO_HARDWARE_READY",
        selectedBackend: "wan21-t2v-1.3b",
        model: {
            backend: "wan21-t2v-1.3b",
            model: "Wan2.1-T2V-1.3B",
            imageToVideo: false,
            maximumReferenceAssets: 0
        }
    };
    const lightFallback = resolveVideoEngine({
        policy: preferred,
        health: lightHealth,
        requirements: { referenceCount: 1, requiresImageToVideo: true }
    });
    assert.equal(lightFallback.ok, true);
    assert.equal(lightFallback.engineUsed, "external");
    assert.equal(lightFallback.fallbackUsed, true);
    assert.equal(
        lightFallback.fallbackReason,
        "LOCAL_VIDEO_BACKENDS_UNAVAILABLE:wan21-t2v-1.3b=LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND"
    );

    const localOnly = describeLocalVideoPolicy({
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_ONLY",
        JARVIS_LOCAL_VIDEO_ENABLED: "true",
        JARVIS_LOCAL_VIDEO_CERTIFIED: "true"
    });
    const fullHealth = {
        ok: true,
        status: "LOCAL_VIDEO_HARDWARE_READY",
        selectedBackend: "wan22-ti2v-5b",
        model: {
            backend: "wan22-ti2v-5b",
            model: "Wan2.2-TI2V-5B",
            imageToVideo: true,
            maximumReferenceAssets: 1
        }
    };
    const tooMany = resolveVideoEngine({
        policy: localOnly,
        health: fullHealth,
        requirements: { referenceCount: 2, requiresImageToVideo: true }
    });
    assert.equal(tooMany.ok, false);
    assert.equal(tooMany.engineUsed, null);
    assert.equal(
        tooMany.status,
        "LOCAL_VIDEO_BACKENDS_UNAVAILABLE:wan22-ti2v-5b=LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED"
    );
});
