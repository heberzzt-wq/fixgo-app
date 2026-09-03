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

function assertCurrentV142() {
  const engine = sourceOf("jarvis-local-video-engine.js");
  const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
  const testSource = sourceOf("tests/jarvis-local-video-engine-v142.test.mjs");
  for (const [value, marker, label] of [
    [engine, "RUNPOD_PROVISION_CLEANUP_FAILED", "PROVISION_CLEANUP"],
    [engine, "identityRuntimeAuthority: requiresIdentityFidelity ? {", "HUMO_JOB_AUTHORITY"],
    [engine, "runtimeAssetAuthorityPinned: true", "HUMO_ASSET_AUTHORITY"],
    [runner, "def run_humo_identity_probe(", "HUMO_EXECUTOR"],
    [runner, "def _verify_humo_runtime_authority(", "HUMO_HASH_GATE"],
    [testSource, "V142 successful remote generation downloads and verifies MP4 before Pod release", "DOWNLOAD_FIRST_REGRESSION"]
  ]) {
    if (!value.includes(marker)) throw new Error(`V142_${label}_MISSING`);
  }
}

function ensureHuMoRemoteRuntimeAuthority() {
  const file = "jarvis-local-video-engine.js";
  replaceExactOnce(
    file,
    `    officialRuntime: Object.freeze({
        python: "3.11",
        torch: "2.5.1",
        torchCuda: "12.4",
        flashAttention: "2.6.3"
    }),
    targetGpuTypeId: "NVIDIA L40S",`,
    `    officialRuntime: Object.freeze({
        python: "3.11",
        torch: "2.5.1",
        torchCuda: "12.4",
        flashAttention: "2.6.3"
    }),
    remoteRuntimeBase: Object.freeze({
        registry: "registry-1.docker.io",
        repository: "runpod/pytorch",
        tag: "2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
        provisionImageTag: "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
        expectedRegistryDigest: "sha256:61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5",
        basePython: "3.11",
        baseTorch: "2.4.0",
        baseCuda: "12.4.1",
        bootstrapPython: "3.11",
        bootstrapTorch: "2.5.1",
        bootstrapTorchCuda: "12.4",
        bootstrapFlashAttention: "2.6.3",
        runtimePreflightCertified: false
    }),
    targetGpuTypeId: "NVIDIA L40S",`,
    "V142_HUMO_REMOTE_RUNTIME_BASE"
  );
}

function ensureHuMoResolverProfile() {
  const file = "jarvis-local-video-engine.js";

  replaceExactOnce(
    file,
    `const UNSUPPORTED_LOCAL_VIDEO_MODEL_PROFILE = Object.freeze({`,
    `const HUMO_IDENTITY_PROBE = Object.freeze({
    backend: "humo-1.7b-identity",
    id: RUNPOD_HUMO_IDENTITY_CANDIDATE.id,
    model: "HuMo-1.7B",
    provider: "local",
    license: null,
    textToVideo: false,
    imageToVideo: true,
    referenceAssets: true,
    maximumReferenceAssets: 3,
    maximumSourceReferenceAssets: 3,
    targetResolution: "832x480-identity-probe",
    targetFps: 25,
    portraitSize: null,
    landscapeSize: Object.freeze({ width: 832, height: 480 }),
    minimumVramGb: 48,
    checkpointSizeGb: 0,
    minimumFreeDiskGb: 60,
    identityOnly: true,
    identityProbeOnly: true,
    remoteModelDirectory: "/workspace/models/HuMo",
    repositoryEntrypoint: "main.py"
});

const UNSUPPORTED_LOCAL_VIDEO_MODEL_PROFILE = Object.freeze({`,
    "V142_HUMO_MODEL_PROFILE"
  );

  replaceExactOnce(
    file,
    `export const LOCAL_VIDEO_MODEL_PROFILES = Object.freeze({
    [WAN22_TI2V_5B.backend]: WAN22_TI2V_5B,
    [WAN21_T2V_1_3B.backend]: WAN21_T2V_1_3B
});`,
    `export const LOCAL_VIDEO_MODEL_PROFILES = Object.freeze({
    [WAN22_TI2V_5B.backend]: WAN22_TI2V_5B,
    [WAN21_T2V_1_3B.backend]: WAN21_T2V_1_3B,
    [HUMO_IDENTITY_PROBE.backend]: HUMO_IDENTITY_PROBE
});`,
    "V142_HUMO_PROFILE_REGISTRATION"
  );

  replaceExactOnce(
    file,
    `    "light": WAN21_T2V_1_3B.backend,
    "local-light": WAN21_T2V_1_3B.backend
});`,
    `    "light": WAN21_T2V_1_3B.backend,
    "local-light": WAN21_T2V_1_3B.backend,
    "humo": HUMO_IDENTITY_PROBE.backend,
    "humo-1.7b": HUMO_IDENTITY_PROBE.backend,
    "humo-1.7b-identity": HUMO_IDENTITY_PROBE.backend
});`,
    "V142_HUMO_MODEL_ALIASES"
  );

  replaceExactOnce(
    file,
    `    [WAN21_T2V_1_3B.backend]: Object.freeze({
        modelDirectory: "JARVIS_WAN21_MODEL_DIR",
        repositoryDirectory: "JARVIS_WAN21_REPO_DIR",
        certified: "JARVIS_WAN21_CERTIFIED"
    })
});`,
    `    [WAN21_T2V_1_3B.backend]: Object.freeze({
        modelDirectory: "JARVIS_WAN21_MODEL_DIR",
        repositoryDirectory: "JARVIS_WAN21_REPO_DIR",
        certified: "JARVIS_WAN21_CERTIFIED"
    }),
    [HUMO_IDENTITY_PROBE.backend]: Object.freeze({
        modelDirectory: "JARVIS_HUMO_WEIGHTS_DIR",
        repositoryDirectory: "JARVIS_HUMO_REPO_DIR",
        certified: "JARVIS_HUMO_CERTIFIED"
    })
});`,
    "V142_HUMO_BACKEND_ENVIRONMENT"
  );

  replaceExactOnce(
    file,
    `    const modelDirectory = configuredModelDirectory
        ? path.resolve(String(configuredModelDirectory))
        : (remoteExecution ? "/workspace/models/Wan2.2-TI2V-5B" : null);`,
    `    const modelDirectory = configuredModelDirectory
        ? path.resolve(String(configuredModelDirectory))
        : (remoteExecution
            ? (profile.remoteModelDirectory || "/workspace/models/Wan2.2-TI2V-5B")
            : null);`,
    "V142_REMOTE_PROFILE_MODEL_DIRECTORY"
  );

  replaceExactOnce(
    file,
    `    const repositoryReady = remoteExecution || legacyConfiguration || Boolean(
        repositoryDirectory && fs.existsSync(path.join(repositoryDirectory, "generate.py"))
    );`,
    `    const repositoryReady = remoteExecution || legacyConfiguration || Boolean(
        repositoryDirectory && fs.existsSync(path.join(
            repositoryDirectory,
            profile.repositoryEntrypoint || "generate.py"
        ))
    );`,
    "V142_PROFILE_REPOSITORY_ENTRYPOINT"
  );

  replaceExactOnce(
    file,
    `function orderedBackendHealth(health = {}) {
    if (Array.isArray(health?.backends)) {
        const byBackend = new Map(
            health.backends
                .filter(item => item && typeof item === "object")
                .map(item => [String(item.backend || ""), item])
        );
        return LOCAL_VIDEO_BACKEND_ORDER
            .map(backend => byBackend.get(backend))
            .filter(Boolean);
    }
    const model = health?.model || health?.modelRequirements || null;
    const backend = health?.selectedBackend || model?.backend || null;
    return backend
        ? [{
            ...health,
            backend,
            model: model?.model || health?.model || null,
            imageToVideo: model?.imageToVideo === true,
            maximumReferenceAssets: Number(model?.maximumReferenceAssets || 0),
            maximumSourceReferenceAssets: Number(model?.maximumSourceReferenceAssets ?? model?.maximumReferenceAssets ?? 0)
        }]
        : [];
}`,
    `function orderedBackendHealth(health = {}) {
    if (Array.isArray(health?.backends)) {
        const reported = health.backends
            .filter(item => item && typeof item === "object");
        const byBackend = new Map(
            reported.map(item => [String(item.backend || ""), item])
        );
        const ordered = LOCAL_VIDEO_BACKEND_ORDER
            .map(backend => byBackend.get(backend))
            .filter(Boolean);
        const orderedBackends = new Set(
            ordered.map(item => String(item.backend || ""))
        );
        return [
            ...ordered,
            ...reported.filter(item =>
                String(item.backend || "") &&
                !orderedBackends.has(String(item.backend || ""))
            )
        ];
    }
    const model = health?.model || health?.modelRequirements || null;
    const backend = health?.selectedBackend || model?.backend || null;
    return backend
        ? [{
            ...health,
            backend,
            model: model?.model || health?.model || null,
            imageToVideo: model?.imageToVideo === true,
            maximumReferenceAssets: Number(model?.maximumReferenceAssets || 0),
            maximumSourceReferenceAssets: Number(model?.maximumSourceReferenceAssets ?? model?.maximumReferenceAssets ?? 0)
        }]
        : [];
}`,
    "V142_EXPLICIT_HUMO_HEALTH_ORDER"
  );
}

function ensureIdentityResolverFailsClosedOnHuMo() {
  const file = "jarvis-local-video-engine.js";
  replaceExactOnce(
    file,
    `    if (requiresIdentityFidelity && referenceCount > 0) {
        if (
            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true ||
            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalPortraitCertified !== true ||
            RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true
        ) {
            return "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED";
        }
    }`,
    `    if (backend.backend === HUMO_IDENTITY_PROBE.backend) {
        if (!requiresIdentityFidelity || referenceCount < 1) {
            return "LOCAL_VIDEO_HUMO_IDENTITY_REQUIRED";
        }
        if (String(requirements.aspectRatio || "") !== "16:9") {
            return "LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED";
        }
        if (
            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true ||
            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalPortraitCertified !== true ||
            RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true
        ) {
            return "LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED";
        }
    }
    else if (requiresIdentityFidelity && referenceCount > 0) {
        return "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED";
    }`,
    "V142_HUMO_RESOLVER_FAIL_CLOSED"
  );
}

function ensureRegression() {
  const file = "tests/jarvis-local-video-engine-v142.test.mjs";
  appendOnce(
    file,
    "V142 HuMo is explicit-only and fail-closed until physical identity certification",
    `test("V142 HuMo is explicit-only and fail-closed until physical identity certification", () => {
    const source = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");
    const candidateStart = source.indexOf("const RUNPOD_HUMO_IDENTITY_CANDIDATE = Object.freeze({");
    const candidateEnd = source.indexOf("const HUMO_IDENTITY_PROBE = Object.freeze({", candidateStart);
    assert.ok(candidateStart >= 0 && candidateEnd > candidateStart);
    const candidate = source.slice(candidateStart, candidateEnd);
    assert.match(candidate, /remoteRuntimeBase: Object\.freeze\(\{/);
    assert.match(candidate, /runpod\/pytorch:2\.4\.0-py3\.11-cuda12\.4\.1-devel-ubuntu22\.04/);
    assert.match(candidate, /61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5/);
    assert.match(candidate, /bootstrapTorch: "2\.5\.1"/);
    assert.match(candidate, /bootstrapFlashAttention: "2\.6\.3"/);
    assert.match(candidate, /runtimePreflightCertified: false/);
    assert.match(candidate, /physicalRuntimeCertified: false/);
    assert.match(candidate, /physicalPortraitCertified: false/);
    assert.match(candidate, /paidExecutionAuthorized: false/);

    assert.match(source, /const HUMO_IDENTITY_PROBE = Object\.freeze\(\{/);
    assert.match(source, /backend: "humo-1\.7b-identity"/);
    assert.match(source, /identityOnly: true/);
    assert.match(source, /identityProbeOnly: true/);
    const orderStart = source.indexOf("const LOCAL_VIDEO_BACKEND_ORDER = Object.freeze([");
    const orderEnd = source.indexOf("]);", orderStart);
    const automaticOrder = source.slice(orderStart, orderEnd);
    assert.match(automaticOrder, /WAN22_TI2V_5B\.backend/);
    assert.match(automaticOrder, /WAN21_T2V_1_3B\.backend/);
    assert.doesNotMatch(automaticOrder, /HUMO_IDENTITY_PROBE/);
    assert.match(source, /function orderedBackendHealth\(health = \{\}\)/);
    assert.match(source, /\.\.\.reported\.filter\(item =>/);
    assert.match(source, /LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED/);
    assert.match(source, /LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED/);
    assert.match(source, /LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED/);
});`
  );
}

assertCurrentV142();
ensureHuMoRemoteRuntimeAuthority();
ensureHuMoResolverProfile();
ensureIdentityResolverFailsClosedOnHuMo();
ensureRegression();
assertCurrentV142();

const engine = sourceOf("jarvis-local-video-engine.js");
const tests = sourceOf("tests/jarvis-local-video-engine-v142.test.mjs");
for (const marker of [
  "remoteRuntimeBase: Object.freeze({",
  "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
  "sha256:61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5",
  "const HUMO_IDENTITY_PROBE = Object.freeze({",
  "LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED",
  "LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED",
  "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED"
]) {
  if (!engine.includes(marker)) throw new Error(`V142_HUMO_RESOLVER_MARKER_MISSING:${marker}`);
}
const orderStart = engine.indexOf("const LOCAL_VIDEO_BACKEND_ORDER = Object.freeze([");
const orderEnd = engine.indexOf("]);", orderStart);
if (engine.slice(orderStart, orderEnd).includes("HUMO_IDENTITY_PROBE")) {
  throw new Error("V142_HUMO_MUST_NOT_ENTER_AUTOMATIC_WAN_ORDER");
}
if (!tests.includes("V142 HuMo is explicit-only and fail-closed until physical identity certification")) {
  throw new Error("V142_HUMO_EXPLICIT_ONLY_REGRESSION_MISSING");
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_EXPLICIT_ONLY_FAIL_CLOSED_MATERIALIZED",
  humoResolverVisibleWhenExplicitlyRequested: true,
  humoInAutomaticWanOrder: false,
  legacyWanIdentityStatusPreserved: true,
  remoteRuntimeBasePinned: true,
  remoteRuntimePreflightCertified: false,
  physicalRuntimeCertified: false,
  physicalPortraitCertified: false,
  paidExecutionAuthorized: false,
  multiIdentityExecutionBlocked: true,
  gpuProvisioningOpened: false,
  newFiles: false,
  newBrains: false
}));
