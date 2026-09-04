import fs from "node:fs";
import { execFileSync } from "node:child_process";

const PRODUCT_BASE_COMMIT = "405190407d7ed2034922f85c67983f6776541f73";
const LOCAL_VIDEO_ENGINE = "jarvis-local-video-engine.js";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";
const FS_BRIDGE = "jarvis-fs-bridge.js";

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
}

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}

function appendOnce(source, marker, addition) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

let engine = read(LOCAL_VIDEO_ENGINE);

engine = replaceExactOnce(
  engine,
  "const HUMO_IDENTITY_PROBE = Object.freeze({",
  [
    "export function buildHuMoIdentityRuntimeAuthority({ paidExecutionAuthorized = false } = {}) {",
    "    return {",
    "        ...RUNPOD_HUMO_IDENTITY_CANDIDATE,",
    "        paidExecutionAuthorized: paidExecutionAuthorized === true,",
    "        sharedTextEncoderFiles: RUNPOD_WAN22_CACHE_BASE.requiredFiles.filter(item =>",
    "            item.path === \"models_t5_umt5-xxl-enc-bf16.pth\" ||",
    "            item.path.startsWith(\"google/umt5-xxl/\")",
    "        )",
    "    };",
    "}",
    "",
    "const HUMO_IDENTITY_PROBE = Object.freeze({"
  ].join("\n"),
  "V142_HUMO_SCOPED_AUTHORITY_BUILDER"
);

engine = replaceExactOnce(
  engine,
  [
    "    const runtimeCertificationOnly = booleanValue(",
    "        env.JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY,",
    "        false",
    "    );",
    "    const runtimeCertificationDataCenterId = String("
  ].join("\n"),
  [
    "    const runtimeCertificationOnly = booleanValue(",
    "        env.JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY,",
    "        false",
    "    );",
    "    const humoIdentityProbePaidExecutionAuthorized = booleanValue(",
    "        env.JARVIS_HUMO_IDENTITY_PROBE_PAID_EXECUTION_AUTHORIZED,",
    "        false",
    "    );",
    "    const humoIdentityProbeAuthorizationId = String(",
    "        env.JARVIS_HUMO_IDENTITY_PROBE_AUTHORIZATION_ID || \"\"",
    "    ).trim();",
    "    const humoIdentityProbeCharacterId = String(",
    "        env.JARVIS_HUMO_IDENTITY_PROBE_CHARACTER_ID || \"\"",
    "    ).trim();",
    "    const runtimeCertificationDataCenterId = String("
  ].join("\n"),
  "V142_HUMO_SCOPED_AUTHORITY_ENV"
);

engine = replaceExactOnce(
  engine,
  [
    "    function assertHuMoPaidExecutionAuthority(job = null) {",
    "        if (!isHuMoRemoteJob(job)) return;",
    "        if (runtimeCertificationOnly === true) return;",
    "        if (RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true) {",
    "            throw new Error(\"RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED\");",
    "        }",
    "        if (RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true) {",
    "            throw new Error(\"RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED\");",
    "        }",
    "    }"
  ].join("\n"),
  [
    "    function huMoIdentityProbeExecutionAuthorized(job = null) {",
    "        if (!isHuMoRemoteJob(job) || runtimeCertificationOnly === true) return false;",
    "        const authority = job?.identityRuntimeAuthority;",
    "        const executionAuthority = job?.identityProbeExecutionAuthority;",
    "        const shots = Array.isArray(job?.shotPlan) ? job.shotPlan : [];",
    "        const shot = shots[0] || {};",
    "        const characterIds = Array.isArray(shot.characterIds) ? shot.characterIds.map(String) : [];",
    "        const durationSeconds = Number(shot.durationSeconds || 0);",
    "        return (",
    "            RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized === false &&",
    "            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified === true &&",
    "            humoIdentityProbePaidExecutionAuthorized === true &&",
    "            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(humoIdentityProbeAuthorizationId) &&",
    "            /^CHAR_[A-Z0-9_]+$/.test(humoIdentityProbeCharacterId) &&",
    "            authority?.id === RUNPOD_HUMO_IDENTITY_CANDIDATE.id &&",
    "            authority?.physicalRuntimeCertified === true &&",
    "            authority?.runtimeAssetAuthorityPinned === true &&",
    "            authority?.paidExecutionAuthorized === true &&",
    "            executionAuthority?.authorized === true &&",
    "            executionAuthority?.scope === \"single_identity_probe\" &&",
    "            executionAuthority?.consumableOnce === true &&",
    "            executionAuthority?.authorizationId === humoIdentityProbeAuthorizationId &&",
    "            executionAuthority?.characterId === humoIdentityProbeCharacterId &&",
    "            job?.obligationId === `video.identity-probe:${humoIdentityProbeAuthorizationId}` &&",
    "            job?.requiresIdentityFidelity === true &&",
    "            job?.aspectRatio === \"16:9\" &&",
    "            shots.length === 1 &&",
    "            shot.identityMode === \"single_identity\" &&",
    "            characterIds.length === 1 &&",
    "            characterIds[0] === humoIdentityProbeCharacterId &&",
    "            durationSeconds > 0 && durationSeconds <= 3.881",
    "        );",
    "    }",
    "",
    "    function assertHuMoPaidExecutionAuthority(job = null) {",
    "        if (!isHuMoRemoteJob(job)) return;",
    "        if (runtimeCertificationOnly === true) return;",
    "        if (RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true) {",
    "            throw new Error(\"RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED\");",
    "        }",
    "        if (!huMoIdentityProbeExecutionAuthorized(job)) {",
    "            throw new Error(\"RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED\");",
    "        }",
    "    }"
  ].join("\n"),
  "V142_HUMO_SCOPED_PAID_EXECUTION_GATE"
);

for (const marker of [
  "physicalRuntimeCertified: true",
  "paidExecutionAuthorized: false",
  "JARVIS_HUMO_IDENTITY_PROBE_PAID_EXECUTION_AUTHORIZED",
  "JARVIS_HUMO_IDENTITY_PROBE_AUTHORIZATION_ID",
  "JARVIS_HUMO_IDENTITY_PROBE_CHARACTER_ID",
  "single_identity_probe",
  "buildHuMoIdentityRuntimeAuthority"
]) {
  if (!engine.includes(marker)) throw new Error(`V142_HUMO_SCOPED_AUTHORITY_MARKER_MISSING:${marker}`);
}
write(LOCAL_VIDEO_ENGINE, engine);

let bridge = read(FS_BRIDGE);
bridge = replaceExactOnce(
  bridge,
  [
    "import {",
    "    createLocalVideoEngine,",
    "    createRunpodRemoteVideoAdapter,",
    "    resolveLocalExecutable,",
    "    writeLocalAiCapabilityReport",
    "} from \"./jarvis-local-video-engine.js\";"
  ].join("\n"),
  [
    "import {",
    "    buildHuMoIdentityRuntimeAuthority,",
    "    createLocalVideoEngine,",
    "    createRunpodRemoteVideoAdapter,",
    "    resolveLocalExecutable,",
    "    writeLocalAiCapabilityReport",
    "} from \"./jarvis-local-video-engine.js\";"
  ].join("\n"),
  "V142_HUMO_PROBE_BRIDGE_IMPORT"
);

const mainMarker = [
  "if (",
  "    process.argv[1] &&",
  "    path.resolve(process.argv[1]) === MODULE_FILE",
  ") {"
].join("\n");
const probeCli = `export async function runHuMoIdentityProbeCli({
    root = DEFAULT_ROOT,
    env = process.env,
    log = value => console.log(JSON.stringify(value))
} = {}) {
    const truthy = value => ["true", "1", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    if (!truthy(env.JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED)) {
        throw new Error("RUNPOD_PAID_RESOURCE_CREATION_NOT_AUTHORIZED");
    }
    if (!truthy(env.JARVIS_HUMO_IDENTITY_PROBE_PAID_EXECUTION_AUTHORIZED)) {
        throw new Error("RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED");
    }
    const resolvedRoot = path.resolve(root);
    const canonicalSha = String(execFileSync(
        "git", ["rev-parse", "HEAD"],
        { cwd: resolvedRoot, encoding: "utf8", windowsHide: true }
    )).trim().toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(canonicalSha)) throw new Error("RUNPOD_CANONICAL_SHA_REQUIRED");

    const requestedHardBudgetUsd = Number(String(env.JARVIS_HUMO_IDENTITY_PROBE_HARD_BUDGET_USD || "1").trim());
    if (!Number.isFinite(requestedHardBudgetUsd) || requestedHardBudgetUsd <= 0 || requestedHardBudgetUsd > 1) {
        throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_BUDGET_INVALID");
    }
    const durationSeconds = Number(String(env.JARVIS_HUMO_IDENTITY_PROBE_DURATION_SECONDS || "3.88").trim());
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 3.88) {
        throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_DURATION_INVALID");
    }
    const startSeconds = Number(String(env.JARVIS_HUMO_IDENTITY_PROBE_AUDIO_START_SECONDS || "0").trim());
    if (!Number.isFinite(startSeconds) || startSeconds < 0) {
        throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_AUDIO_START_INVALID");
    }
    const characterId = String(env.JARVIS_HUMO_IDENTITY_PROBE_CHARACTER_ID || "").trim();
    if (!/^CHAR_[A-Z0-9_]+$/.test(characterId)) {
        throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_CHARACTER_INVALID");
    }
    const sourceRootRaw = String(env.JARVIS_HUMO_IDENTITY_PROBE_SOURCE_ROOT || "").trim();
    if (!sourceRootRaw) throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_SOURCE_ROOT_REQUIRED");
    const sourceRoot = path.resolve(sourceRootRaw);
    if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
        throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_SOURCE_ROOT_INVALID");
    }
    const resolveSourceArtifact = (rawOutput, extensions, status) => {
        const output = String(rawOutput || "").trim().replaceAll("\\\\", "/");
        if (!output.startsWith(".jarvis-artifacts/") || output.includes("../")) throw new Error(status);
        const file = path.resolve(sourceRoot, output);
        const prefix = sourceRoot.endsWith(path.sep) ? sourceRoot : sourceRoot + path.sep;
        if (!file.startsWith(prefix)) throw new Error(status);
        if (!extensions.includes(path.extname(file).toLowerCase())) throw new Error(status);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(status);
        return { output, file };
    };
    const reference = resolveSourceArtifact(
        env.JARVIS_HUMO_IDENTITY_PROBE_REFERENCE_OUTPUT,
        [".jpg", ".jpeg", ".png", ".webp"],
        "RUNPOD_HUMO_IDENTITY_PROBE_REFERENCE_INVALID"
    );
    const audio = resolveSourceArtifact(
        env.JARVIS_HUMO_IDENTITY_PROBE_AUDIO_OUTPUT,
        [".wav"],
        "RUNPOD_HUMO_IDENTITY_PROBE_AUDIO_INVALID"
    );
    const sha256File = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    const expectedReferenceSha256 = String(env.JARVIS_HUMO_IDENTITY_PROBE_REFERENCE_SHA256 || "").trim().toLowerCase();
    const expectedAudioSha256 = String(env.JARVIS_HUMO_IDENTITY_PROBE_AUDIO_SHA256 || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedReferenceSha256) || sha256File(reference.file) !== expectedReferenceSha256) {
        throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_REFERENCE_SHA256_MISMATCH");
    }
    if (!/^[a-f0-9]{64}$/.test(expectedAudioSha256) || sha256File(audio.file) !== expectedAudioSha256) {
        throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_AUDIO_SHA256_MISMATCH");
    }

    const output = String(
        env.JARVIS_HUMO_IDENTITY_PROBE_OUTPUT ||
        ".jarvis-artifacts/videos/humo-heberto-identity-probe-3.88s.mp4"
    ).trim().replaceAll("\\\\", "/");
    const outputFile = artifactPath(output, resolvedRoot, [".mp4"]);
    const prompt = String(env.JARVIS_HUMO_IDENTITY_PROBE_PROMPT || [
        "Landscape 16:9 cinematic medium close-up of Heberto, the exact person in the supplied identity reference,",
        "at a realistic construction site in Cancun under bright natural daylight.",
        "Preserve his exact facial identity, facial proportions, skin texture and age.",
        "He speaks the supplied audio with restrained natural head, eye and mouth movement.",
        "No other identifiable person, no subtitles, no title, no logo, no branding, no watermark."
    ].join(" ")).trim();
    if (!prompt) throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_PROMPT_REQUIRED");

    const authorizationId = randomUUID();
    const operationId = randomUUID();
    const operationName = "local-video/" + operationId;
    const missionId = "MISSION-HUMO-IDENTITY-PROBE-" + authorizationId;
    const objectiveId = "OBJECTIVE-HUMO-IDENTITY-PROBE-" + authorizationId;
    const obligationId = "video.identity-probe:" + authorizationId;
    const rootInstructionHash = createHash("sha256").update([
        "humo-single-identity-probe",
        canonicalSha,
        authorizationId,
        characterId,
        expectedReferenceSha256,
        expectedAudioSha256,
        String(durationSeconds)
    ].join("\\n")).digest("hex");

    const runtimeEnv = {
        ...env,
        NODE_USE_SYSTEM_CA: "1",
        JARVIS_REMOTE_GPU_PROVIDER: "runpod",
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
        JARVIS_LOCAL_VIDEO_ENABLED: "true",
        JARVIS_LOCAL_VIDEO_EXECUTION_TARGET: "remote",
        JARVIS_LOCAL_VIDEO_MODEL: "humo",
        JARVIS_LOCAL_VIDEO_RUNNER: "python",
        JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: path.join(resolvedRoot, "scripts", "jarvis-local-video-wan22.py"),
        JARVIS_RUNPOD_GPU_TYPE_ID: "NVIDIA L40S",
        JARVIS_RUNPOD_CLOUD_TYPE: "SECURE",
        JARVIS_RUNPOD_DATACENTER_ID: String(env.JARVIS_RUNPOD_DATACENTER_ID || "").trim(),
        JARVIS_RUNPOD_CANONICAL_SHA: canonicalSha,
        JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "true",
        JARVIS_REMOTE_GPU_HARD_BUDGET_USD: String(requestedHardBudgetUsd),
        JARVIS_REMOTE_GPU_BUDGET_STOP_RATIO: "0.95",
        JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: "1.09",
        JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "false",
        JARVIS_RUNPOD_EXPECTED_VRAM_GB: "48",
        JARVIS_RUNPOD_MIN_RAM_GB: "62",
        JARVIS_RUNPOD_MIN_VCPU: "16",
        JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: "3300",
        JARVIS_RUNPOD_INFERENCE_TIMEOUT_SECONDS: "2400",
        JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: "3600",
        JARVIS_EXTERNAL_FALLBACK_ENABLED: "false",
        JARVIS_HUMO_IDENTITY_PROBE_PAID_EXECUTION_AUTHORIZED: "true",
        JARVIS_HUMO_IDENTITY_PROBE_AUTHORIZATION_ID: authorizationId,
        JARVIS_HUMO_IDENTITY_PROBE_CHARACTER_ID: characterId
    };
    delete runtimeEnv.JARVIS_RUNPOD_NETWORK_VOLUME_ID;
    const credential = resolveRunpodCredentialEnvironment({ env: runtimeEnv });
    if (credential.credentialLoaded !== true) {
        throw new Error(credential.credentialError || "RUNPOD_API_KEY_REQUIRED");
    }
    const runpod = createRunpodRemoteVideoAdapter({
        root: resolvedRoot,
        env: credential.env,
        inspectBridgeIdentity: () => describeJarvisBridgeIdentity(resolvedRoot)
    });
    const job = {
        operationId,
        operationName,
        missionId,
        objectiveId,
        obligationId,
        rootInstructionHash,
        executionTarget: "remote",
        backend: "humo-1.7b-identity",
        model: "HuMo-1.7B",
        output,
        outputFile,
        requestedDurationSeconds: durationSeconds,
        aspectRatio: "16:9",
        script: prompt,
        prompts: [prompt],
        externalApiAllowed: false,
        requiresIdentityFidelity: true,
        referenceOutputs: [reference.output],
        referenceFiles: [reference.file],
        sourceReferenceOutputs: [],
        sourceReferenceFiles: [],
        audioOutput: audio.output,
        audioFile: audio.file,
        shotPlan: [{
            shotId: "HUMO-IDENTITY-PROBE-001",
            durationSeconds,
            startSeconds,
            prompt,
            identityMode: "single_identity",
            characterIds: [characterId],
            identityReferenceOutputs: [reference.output]
        }],
        identityRuntimeAuthority: buildHuMoIdentityRuntimeAuthority({ paidExecutionAuthorized: true }),
        identityProbeExecutionAuthority: {
            authorized: true,
            scope: "single_identity_probe",
            consumableOnce: true,
            authorizationId,
            characterId
        }
    };
    const resultFile = path.join(
        resolvedRoot, ".jarvis-artifacts", ".video-worker", "results",
        "humo-identity-probe-" + operationId + ".json"
    );
    fs.mkdirSync(path.dirname(resultFile), { recursive: true });
    let launched = null;
    let final = null;
    let releaseReceipt = null;
    let primaryError = null;
    const startedAtMs = Date.now();
    const deadlineMs = startedAtMs + 60 * 60 * 1000;
    try {
        launched = await runpod.launch({ job });
        if (!launched?.remoteWorker?.podId) throw new Error("HUMO_IDENTITY_PROBE_LAUNCH_FAILED");
        log({
            ok: true,
            status: "HUMO_IDENTITY_PROBE_STARTED",
            operationName,
            authorizationId,
            characterId,
            podId: launched.remoteWorker.podId,
            hardBudgetUsd: requestedHardBudgetUsd,
            durationSeconds,
            inferenceAuthorized: true,
            fullEpisodeAuthorized: false
        });
        while (Date.now() < deadlineMs) {
            const polled = await runpod.poll({ operation: job, resultFile });
            final = polled;
            const elapsedSeconds = Math.max(0, (Date.now() - startedAtMs) / 1000);
            const remoteWorker = polled?.remoteWorker || {};
            const bootstrapProgress = remoteWorker?.bootstrapProgress || null;
            log({
                ok: polled?.ok === true,
                status: polled?.status || null,
                done: polled?.done === true,
                podId: launched.remoteWorker.podId,
                remotePhase: remoteWorker?.phase || null,
                bootstrapStage: bootstrapProgress?.stage || null,
                bootstrapStatus: bootstrapProgress?.status || null,
                cacheStatus: remoteWorker?.cacheStatus || bootstrapProgress?.cacheStatus || null,
                inferenceStarted: remoteWorker?.inferenceStarted === true || polled?.inferenceStarted === true,
                elapsedSeconds: Number(elapsedSeconds.toFixed(1)),
                providerReportedCostUsd: Number(polled?.gpuRentalEstimatedCost || remoteWorker?.gpuRentalEstimatedCost || 0)
            });
            if (polled?.done === true) break;
            await sleepMs(10000);
        }
        if (!final?.done) throw new Error("HUMO_IDENTITY_PROBE_DEADLINE_EXCEEDED");
        if (final.ok !== true) throw new Error(final.error || final.status || "HUMO_IDENTITY_PROBE_FAILED");
        if (!fs.existsSync(resultFile)) throw new Error("HUMO_IDENTITY_PROBE_RESULT_MISSING");
        const physical = JSON.parse(fs.readFileSync(resultFile, "utf8"));
        if (
            physical.ok !== true ||
            physical.status !== "LOCAL_VIDEO_HUMO_IDENTITY_PROBE_COMPLETED" ||
            physical.identityProbe !== true ||
            physical.identityMode !== "single_identity" ||
            physical.characterIds?.length !== 1 ||
            physical.characterIds[0] !== characterId ||
            physical.portraitCertified !== false ||
            !fs.existsSync(outputFile) ||
            fs.statSync(outputFile).size < 100000
        ) {
            throw new Error("HUMO_IDENTITY_PROBE_PHYSICAL_RESULT_INVALID");
        }
    }
    catch(error) {
        primaryError = error;
    }
    finally {
        if (launched?.remoteWorker) {
            try {
                releaseReceipt = await runpod.release({
                    ...job,
                    remoteWorker: launched.remoteWorker,
                    reason: primaryError ? "identity_probe_failed" : "identity_probe_complete"
                });
                if (releaseReceipt?.terminationVerified !== true) {
                    throw new Error("RUNPOD_HUMO_RELEASE_NOT_VERIFIED");
                }
            }
            catch(releaseError) {
                primaryError = new Error(
                    (primaryError?.message || "HUMO_IDENTITY_PROBE_FAILED") +
                    ";RELEASE:" + (releaseError?.message || releaseError)
                );
            }
        }
    }
    if (primaryError) throw primaryError;
    const bytes = fs.statSync(outputFile).size;
    const sha256 = sha256File(outputFile);
    const estimatedCostUsd = Number(
        releaseReceipt?.gpuRentalEstimatedCost || final?.gpuRentalEstimatedCost || 0
    );
    if (estimatedCostUsd > requestedHardBudgetUsd + 0.000001) {
        throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_BUDGET_EXCEEDED");
    }
    const artifact = registerArtifact({
        root: resolvedRoot,
        output,
        metadata: {
            type: "video",
            origin: "video.generate",
            provider: "runpod",
            model: "HuMo-1.7B",
            caseId: "SERIES_HEBERTO_INFILTRADO_CANCUN",
            objectiveId,
            mimeType: "video/mp4",
            status: "HUMO_IDENTITY_PROBE_CREATED_VERIFIED",
            approvalRequired: true,
            approved: false,
            editable: false,
            preview: true,
            downloadable: true,
            publishable: false,
            sha256
        }
    });
    return {
        ok: true,
        status: "HUMO_IDENTITY_PROBE_COMPLETED_AND_RELEASED",
        operationName,
        authorizationId,
        characterId,
        podId: launched.remoteWorker.podId,
        output,
        bytes,
        sha256,
        durationSeconds,
        inferenceStarted: true,
        fullEpisodeAuthorized: false,
        humanIdentityApproval: "PENDING",
        portraitCertified: false,
        terminationVerified: releaseReceipt?.terminationVerified === true,
        gpuRentalSeconds: Number(releaseReceipt?.gpuRentalSeconds || final?.gpuRentalSeconds || 0),
        gpuRentalEstimatedCost: estimatedCostUsd,
        gpuRentalActualCost: Number(releaseReceipt?.gpuRentalActualCost || 0),
        artifact
    };
}`;
bridge = replaceExactOnce(
  bridge,
  mainMarker,
  probeCli + "\n\n" + mainMarker,
  "V142_HUMO_IDENTITY_PROBE_CLI"
);
bridge = replaceExactOnce(
  bridge,
  [
    "    else {",
    "        startJarvisFsBridge();",
    "    }",
    "}"
  ].join("\n"),
  [
    "    else if (process.argv.includes(\"--humo-identity-probe\")) {",
    "        runHuMoIdentityProbeCli()",
    "            .then(result => console.log(JSON.stringify(result)))",
    "            .catch(error => {",
    "                console.error(JSON.stringify({",
    "                    ok: false,",
    "                    status: error?.message || \"HUMO_IDENTITY_PROBE_FAILED\"",
    "                }));",
    "                process.exitCode = 1;",
    "            });",
    "    }",
    "    else {",
    "        startJarvisFsBridge();",
    "    }",
    "}"
  ].join("\n"),
  "V142_HUMO_IDENTITY_PROBE_MAIN_DISPATCH"
);
for (const marker of [
  "runHuMoIdentityProbeCli",
  "--humo-identity-probe",
  "JARVIS_HUMO_IDENTITY_PROBE_HARD_BUDGET_USD",
  "requestedHardBudgetUsd > 1",
  "single_identity_probe",
  "fullEpisodeAuthorized: false",
  "HUMO_IDENTITY_PROBE_COMPLETED_AND_RELEASED"
]) {
  if (!bridge.includes(marker)) throw new Error(`V142_HUMO_PROBE_BRIDGE_MARKER_MISSING:${marker}`);
}
write(FS_BRIDGE, bridge);

let tests = read(LOCAL_VIDEO_TEST);
tests = replaceExactOnce(
  tests,
  [
    "import {",
    "    buildLocalAiCapabilityReport,",
    "    createLocalVideoEngine,"
  ].join("\n"),
  [
    "import {",
    "    buildLocalAiCapabilityReport,",
    "    buildHuMoIdentityRuntimeAuthority,",
    "    createLocalVideoEngine,"
  ].join("\n"),
  "V142_HUMO_PROBE_TEST_IMPORT"
);
tests = appendOnce(
  tests,
  "V142 HuMo paid identity probe authority is mission scoped and never opens the public candidate",
  `test("V142 HuMo paid identity probe authority is mission scoped and never opens the public candidate", () => {\n    const closed = buildHuMoIdentityRuntimeAuthority();\n    const scoped = buildHuMoIdentityRuntimeAuthority({ paidExecutionAuthorized: true });\n    assert.equal(closed.physicalRuntimeCertified, true);\n    assert.equal(closed.paidExecutionAuthorized, false);\n    assert.equal(scoped.physicalRuntimeCertified, true);\n    assert.equal(scoped.paidExecutionAuthorized, true);\n    assert.equal(scoped.runtimeAssetAuthorityPinned, true);\n    assert.ok(Array.isArray(scoped.sharedTextEncoderFiles));\n    assert.ok(scoped.sharedTextEncoderFiles.length >= 5);\n\n    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    const candidateStart = engineSource.indexOf("const RUNPOD_HUMO_IDENTITY_CANDIDATE = Object.freeze({");\n    const candidateEnd = engineSource.indexOf("export function buildHuMoIdentityRuntimeAuthority", candidateStart);\n    assert.ok(candidateStart >= 0 && candidateEnd > candidateStart);\n    const candidate = engineSource.slice(candidateStart, candidateEnd);\n    assert.match(candidate, /physicalRuntimeCertified: true/);\n    assert.match(candidate, /paidExecutionAuthorized: false/);\n    assert.doesNotMatch(candidate, /paidExecutionAuthorized: true/);\n    assert.match(engineSource, /JARVIS_HUMO_IDENTITY_PROBE_PAID_EXECUTION_AUTHORIZED/);\n    assert.match(engineSource, /JARVIS_HUMO_IDENTITY_PROBE_AUTHORIZATION_ID/);\n    assert.match(engineSource, /JARVIS_HUMO_IDENTITY_PROBE_CHARACTER_ID/);\n    assert.match(engineSource, /identityProbeExecutionAuthority/);\n    assert.match(engineSource, /scope === "single_identity_probe"/);\n\n    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");\n    assert.match(bridgeSource, /runHuMoIdentityProbeCli/);\n    assert.match(bridgeSource, /--humo-identity-probe/);\n    assert.match(bridgeSource, /requestedHardBudgetUsd > 1/);\n    assert.match(bridgeSource, /fullEpisodeAuthorized: false/);\n    assert.match(bridgeSource, /HUMO_IDENTITY_PROBE_COMPLETED_AND_RELEASED/);\n});`
);
write(LOCAL_VIDEO_TEST, tests);

execFileSync(process.execPath, ["--check", LOCAL_VIDEO_ENGINE], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", FS_BRIDGE], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_SINGLE_IDENTITY_PROBE_AUTHORITY_MATERIALIZED",
  productBaseCommit: PRODUCT_BASE_COMMIT,
  physicalRuntimeCertified: true,
  publicPaidExecutionAuthorized: false,
  scopedPaidIdentityProbeAvailable: true,
  scope: "single_identity_probe",
  maximumIdentityCount: 1,
  maximumProbeDurationSeconds: 3.88,
  maximumProbeBudgetUsd: 1,
  fullEpisodeAuthorized: false,
  portraitCertified: false,
  providerTrafficUsed: false,
  runpodTrafficUsed: false,
  billableGpuCreated: false,
  newFiles: false,
  newBrains: false
}));
