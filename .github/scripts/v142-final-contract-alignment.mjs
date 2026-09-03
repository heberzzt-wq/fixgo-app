import fs from "node:fs";

function sourceOf(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
}

function replaceExactOnce(file, before, after, label) {
  const source = sourceOf(file);
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  write(file, source.replace(before, after));
}

function appendOnce(file, marker, addition) {
  const source = sourceOf(file);
  if (source.includes(marker)) return;
  write(file, `${source.trimEnd()}\n\n${addition.trim()}\n`);
}

function assertBaseline() {
  const engine = sourceOf("jarvis-local-video-engine.js");
  const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
  const tests = sourceOf("tests/jarvis-local-video-engine-v142.test.mjs");
  for (const [value, marker, label] of [
    [engine, "const HUMO_IDENTITY_PROBE = Object.freeze({", "HUMO_PROFILE"],
    [engine, "remoteRuntimeBase: Object.freeze({", "HUMO_REMOTE_BASE"],
    [engine, "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED", "LEGACY_IDENTITY_STATUS"],
    [engine, "RUNPOD_PROVISION_CLEANUP_FAILED", "PROVISION_CLEANUP"],
    [runner, "def run_humo_identity_probe(", "HUMO_EXECUTOR"],
    [runner, "def _verify_humo_runtime_authority(", "HUMO_HASH_GATE"],
    [tests, "V142 HuMo is explicit-only and fail-closed until physical identity certification", "HUMO_EXPLICIT_REGRESSION"]
  ]) {
    if (!value.includes(marker)) throw new Error(`V142_${label}_MISSING`);
  }
}

function removePortraitFromLandscapeProbeGate() {
  replaceExactOnce(
    "jarvis-local-video-engine.js",
    `        if (\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true ||\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalPortraitCertified !== true ||\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true\n        ) {\n            return "LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED";\n        }`,
    `        if (\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true ||\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true\n        ) {\n            return "LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED";\n        }`,
    "V142_HUMO_LANDSCAPE_PROBE_GATE"
  );

  replaceExactOnce(
    "scripts/jarvis-local-video-wan22.py",
    `        if (\n            authority.get("physicalRuntimeCertified") is not True\n            or authority.get("physicalPortraitCertified") is not True\n            or authority.get("paidExecutionAuthorized") is not True\n        ):\n            raise RuntimeError("LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED")`,
    `        if (\n            authority.get("physicalRuntimeCertified") is not True\n            or authority.get("paidExecutionAuthorized") is not True\n        ):\n            raise RuntimeError("LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED")`,
    "V142_HUMO_RUNNER_LANDSCAPE_PROBE_GATE"
  );
}

function ensureHuMoReadOnlyAdapterPrecheck() {
  const file = "jarvis-local-video-engine.js";
  const marker = "    function inspectHuMoZeroCostPrecheck({ job = null, registryVerification = null } = {}) {";
  if (!sourceOf(file).includes(marker)) {
    replaceExactOnce(
      file,
      `    function assertProviderConfigured() {`,
      `    function inspectHuMoZeroCostPrecheck({ job = null, registryVerification = null } = {}) {\n        try {\n            const requestedBackend = LOCAL_VIDEO_MODEL_ALIASES[configuredBackend] || configuredBackend;\n            if (provider !== "runpod") throw new Error("RUNPOD_PROVIDER_NOT_ENABLED");\n            if (configuredPolicy !== "LOCAL_TEST") throw new Error("RUNPOD_LOCAL_TEST_POLICY_REQUIRED");\n            if (requestedBackend !== HUMO_IDENTITY_PROBE.backend) {\n                throw new Error("RUNPOD_HUMO_BACKEND_REQUIRED");\n            }\n            if (!hardBudgetExplicit) throw new Error("RUNPOD_HARD_BUDGET_REQUIRED");\n            if (gpuTypeId && gpuTypeId !== RUNPOD_HUMO_IDENTITY_CANDIDATE.targetGpuTypeId) {\n                throw new Error("RUNPOD_HUMO_L40S_REQUIRED");\n            }\n            if (!/^[a-f0-9]{40}$/.test(configuredCanonicalSha)) {\n                throw new Error("RUNPOD_CANONICAL_SHA_REQUIRED");\n            }\n            if (currentCanonicalSha() !== configuredCanonicalSha) {\n                throw new Error("RUNPOD_CANONICAL_SHA_MISMATCH");\n            }\n            const bridgeIdentity = currentBridgeIdentity();\n            if (bridgeIdentity.ok !== true || bridgeIdentity.status !== "BRIDGE_IDENTITY_OK") {\n                throw new Error("RUNPOD_BRIDGE_IDENTITY_REQUIRED");\n            }\n            const runtimeBase = RUNPOD_HUMO_IDENTITY_CANDIDATE.remoteRuntimeBase;\n            if (\n                !runtimeBase ||\n                runtimeBase.provisionImageTag !==\n                    runtimeBase.repository + ":" + runtimeBase.tag ||\n                /@sha256:/i.test(runtimeBase.provisionImageTag) ||\n                !/^sha256:[a-f0-9]{64}$/i.test(String(runtimeBase.expectedRegistryDigest || ""))\n            ) {\n                throw new Error("RUNPOD_HUMO_RUNTIME_BASE_AUTHORITY_INVALID");\n            }\n            const verifiedRegistry = normalizedRegistryVerification(runtimeBase, registryVerification);\n            if (job) {\n                const authority = job.identityRuntimeAuthority;\n                const shots = Array.isArray(job.shotPlan) ? job.shotPlan : [];\n                const shot = shots[0] || {};\n                if (\n                    job.executionTarget !== "remote" ||\n                    job.backend !== HUMO_IDENTITY_PROBE.backend ||\n                    job.model !== HUMO_IDENTITY_PROBE.model ||\n                    job.requiresIdentityFidelity !== true ||\n                    job.aspectRatio !== "16:9" ||\n                    job.externalApiAllowed !== false\n                ) {\n                    throw new Error("RUNPOD_HUMO_JOB_CONTRACT_INVALID");\n                }\n                if (\n                    !job.missionId || !job.objectiveId || !job.obligationId ||\n                    !/^[a-f0-9]{64}$/i.test(String(job.rootInstructionHash || ""))\n                ) {\n                    throw new Error("RUNPOD_DURABLE_IDENTITY_REQUIRED");\n                }\n                if (\n                    !authority ||\n                    authority.id !== RUNPOD_HUMO_IDENTITY_CANDIDATE.id ||\n                    authority.sourceRevision !== RUNPOD_HUMO_IDENTITY_CANDIDATE.sourceRevision ||\n                    authority.modelRevision !== RUNPOD_HUMO_IDENTITY_CANDIDATE.modelRevision ||\n                    authority.runtimeAssetAuthorityPinned !== true\n                ) {\n                    throw new Error("RUNPOD_HUMO_RUNTIME_AUTHORITY_REQUIRED");\n                }\n                if (\n                    shots.length !== 1 ||\n                    shot.identityMode !== "single_identity" ||\n                    !Array.isArray(shot.characterIds) || shot.characterIds.length !== 1 ||\n                    !Array.isArray(shot.identityReferenceOutputs) ||\n                    shot.identityReferenceOutputs.length < 1 ||\n                    !(Number(shot.durationSeconds) > 0) ||\n                    Number(shot.durationSeconds) >\n                        RUNPOD_HUMO_IDENTITY_CANDIDATE.candidateProbeGeometry.durationSeconds + 0.001\n                ) {\n                    throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_CONTRACT_INVALID");\n                }\n            }\n            const executionBlockers = [];\n            if (RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true) {\n                executionBlockers.push("RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED");\n            }\n            if (RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true) {\n                executionBlockers.push("RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED");\n            }\n            return {\n                ok: true,\n                phase: "HUMO_ZERO_COST_PREFLIGHT",\n                status: "RUNPOD_HUMO_ZERO_COST_PREFLIGHT_READY",\n                backend: HUMO_IDENTITY_PROBE.backend,\n                model: HUMO_IDENTITY_PROBE.model,\n                targetGpuTypeId: RUNPOD_HUMO_IDENTITY_CANDIDATE.targetGpuTypeId,\n                resourceCreationPossible: false,\n                inferencePossible: false,\n                providerTrafficUsed: false,\n                paidResourceCreationAuthorized,\n                paidExecutionAuthorized: RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized === true,\n                physicalRuntimeCertified:\n                    RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified === true,\n                executionBlockers,\n                portrait: {\n                    targetResolved: RUNPOD_HUMO_IDENTITY_CANDIDATE.portraitTargetUnresolved !== true,\n                    certified: RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalPortraitCertified === true,\n                    status: RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalPortraitCertified === true\n                        ? "LOCAL_VIDEO_HUMO_PORTRAIT_CERTIFIED"\n                        : "LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED"\n                },\n                probeGeometry: { ...RUNPOD_HUMO_IDENTITY_CANDIDATE.candidateProbeGeometry },\n                contract: {\n                    provisionImageTag: runtimeBase.provisionImageTag,\n                    expectedRegistryDigest: runtimeBase.expectedRegistryDigest,\n                    registryVerification: verifiedRegistry,\n                    basePython: runtimeBase.basePython,\n                    baseTorch: runtimeBase.baseTorch,\n                    baseCuda: runtimeBase.baseCuda,\n                    bootstrapPython: runtimeBase.bootstrapPython,\n                    bootstrapTorch: runtimeBase.bootstrapTorch,\n                    bootstrapTorchCuda: runtimeBase.bootstrapTorchCuda,\n                    bootstrapFlashAttention: runtimeBase.bootstrapFlashAttention,\n                    runtimePreflightCertified: runtimeBase.runtimePreflightCertified === true\n                }\n            };\n        }\n        catch(error) {\n            return {\n                ok: false,\n                phase: "HUMO_ZERO_COST_PREFLIGHT",\n                status: error?.message || "RUNPOD_HUMO_ZERO_COST_PREFLIGHT_FAILED",\n                error: error?.message || "RUNPOD_HUMO_ZERO_COST_PREFLIGHT_FAILED",\n                resourceCreationPossible: false,\n                inferencePossible: false,\n                providerTrafficUsed: false\n            };\n        }\n    }\n\n    function assertProviderConfigured() {`,
      "V142_HUMO_READ_ONLY_ADAPTER_PRECHECK"
    );
  }

  replaceExactOnce(
    file,
    `        inspectHardware,\n        inspectZeroCostPrecheck,\n        inspectLiveZeroCostPrecheck,`,
    `        inspectHardware,\n        inspectZeroCostPrecheck,\n        inspectHuMoZeroCostPrecheck,\n        inspectLiveZeroCostPrecheck,`,
    "V142_HUMO_PRECHECK_EXPOSED"
  );
}

function ensureRegression() {
  appendOnce(
    "tests/jarvis-local-video-engine-v142.test.mjs",
    "V142 HuMo RunPod precheck is zero-cost and landscape probe does not require portrait certification",
    `test("V142 HuMo RunPod precheck is zero-cost and landscape probe does not require portrait certification", () => {\n    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-humo-zero-cost-"));\n    const canonicalSha = "a".repeat(40);\n    let providerCalls = 0;\n    const forbiddenNetwork = async () => {\n        providerCalls += 1;\n        throw new Error("PROVIDER_TRAFFIC_MUST_NOT_OCCUR");\n    };\n    try {\n        const adapter = createRunpodRemoteVideoAdapter({\n            root,\n            env: {\n                JARVIS_REMOTE_GPU_PROVIDER: "runpod",\n                JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",\n                JARVIS_LOCAL_VIDEO_MODEL: "humo",\n                JARVIS_RUNPOD_GPU_TYPE_ID: "NVIDIA L40S",\n                JARVIS_REMOTE_GPU_HARD_BUDGET_USD: "2",\n                JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false",\n                JARVIS_RUNPOD_CANONICAL_SHA: canonicalSha\n            },\n            fetchImpl: forbiddenNetwork,\n            registryFetchImpl: forbiddenNetwork,\n            inspectBridgeIdentity: () => ({ ok: true, status: "BRIDGE_IDENTITY_OK" }),\n            resolveCanonicalSha: () => canonicalSha\n        });\n        const report = adapter.inspectHuMoZeroCostPrecheck({\n            registryVerification: {\n                registry: "registry-1.docker.io",\n                repository: "runpod/pytorch",\n                tag: "2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",\n                expectedDigest: "sha256:61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5",\n                observedDigest: "sha256:61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5",\n                checkedAt: "2026-09-03T00:00:00.000Z",\n                status: "REGISTRY_DIGEST_VERIFIED"\n            }\n        });\n        assert.equal(report.ok, true, JSON.stringify(report));\n        assert.equal(report.status, "RUNPOD_HUMO_ZERO_COST_PREFLIGHT_READY");\n        assert.equal(report.resourceCreationPossible, false);\n        assert.equal(report.inferencePossible, false);\n        assert.equal(report.providerTrafficUsed, false);\n        assert.equal(providerCalls, 0);\n        assert.equal(report.contract.bootstrapPython, "3.11");\n        assert.equal(report.contract.bootstrapTorch, "2.5.1");\n        assert.equal(report.contract.bootstrapTorchCuda, "12.4");\n        assert.equal(report.contract.bootstrapFlashAttention, "2.6.3");\n        assert.equal(report.contract.runtimePreflightCertified, false);\n        assert.equal(report.physicalRuntimeCertified, false);\n        assert.equal(report.paidExecutionAuthorized, false);\n        assert.equal(report.portrait.certified, false);\n        assert.equal(report.portrait.status, "LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED");\n        assert.deepEqual(report.executionBlockers, [\n            "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED",\n            "RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED"\n        ]);\n\n        const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n        assert.equal(engineSource.includes('if (configuredBackend !== WAN22_TI2V_5B.backend) throw new Error("RUNPOD_WAN22_BACKEND_REQUIRED")'), true);\n        assert.equal(engineSource.includes("inspectHuMoZeroCostPrecheck"), true);\n        const runnerSource = fs.readFileSync(new URL("../scripts/jarvis-local-video-wan22.py", import.meta.url), "utf8");\n        const resolveStart = runnerSource.indexOf("def resolve_backend(");\n        const resolveEnd = runnerSource.indexOf("def offline_environment(", resolveStart);\n        const resolveBlock = runnerSource.slice(resolveStart, resolveEnd);\n        assert.equal(resolveBlock.includes('authority.get("physicalRuntimeCertified") is not True'), true);\n        assert.equal(resolveBlock.includes('authority.get("paidExecutionAuthorized") is not True'), true);\n        assert.equal(resolveBlock.includes('authority.get("physicalPortraitCertified")'), false);\n    }\n    finally {\n        fs.rmSync(root, { recursive: true, force: true });\n    }\n});`
  );
}

assertBaseline();
removePortraitFromLandscapeProbeGate();
ensureHuMoReadOnlyAdapterPrecheck();
ensureRegression();
assertBaseline();

const engine = sourceOf("jarvis-local-video-engine.js");
const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
const tests = sourceOf("tests/jarvis-local-video-engine-v142.test.mjs");
for (const [value, marker] of [
  [engine, "function inspectHuMoZeroCostPrecheck("],
  [engine, "RUNPOD_HUMO_ZERO_COST_PREFLIGHT_READY"],
  [engine, "resourceCreationPossible: false"],
  [runner, 'authority.get("paidExecutionAuthorized") is not True'],
  [tests, "V142 HuMo RunPod precheck is zero-cost and landscape probe does not require portrait certification"]
]) {
  if (!value.includes(marker)) throw new Error(`V142_HUMO_ADAPTER_MARKER_MISSING:${marker}`);
}

const runnerResolveStart = runner.indexOf("def resolve_backend(");
const runnerResolveEnd = runner.indexOf("def offline_environment(", runnerResolveStart);
if (runner.slice(runnerResolveStart, runnerResolveEnd).includes('authority.get("physicalPortraitCertified")')) {
  throw new Error("V142_HUMO_LANDSCAPE_PROBE_MUST_NOT_REQUIRE_PORTRAIT_CERTIFICATION");
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_ZERO_COST_ADAPTER_MATERIALIZED",
  humoRemotePrecheck: "read_only",
  providerTrafficUsed: false,
  resourceCreationPossible: false,
  physicalRuntimeCertified: false,
  physicalPortraitCertified: false,
  paidExecutionAuthorized: false,
  publicIdentityStartStillFailClosed: true,
  existingWanLaunchOwnerUnchanged: true,
  newFiles: false,
  newBrains: false
}));
