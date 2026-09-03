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
    `    officialRuntime: Object.freeze({\n        python: "3.11",\n        torch: "2.5.1",\n        torchCuda: "12.4",\n        flashAttention: "2.6.3"\n    }),\n    targetGpuTypeId: "NVIDIA L40S",`,
    `    officialRuntime: Object.freeze({\n        python: "3.11",\n        torch: "2.5.1",\n        torchCuda: "12.4",\n        flashAttention: "2.6.3"\n    }),\n    remoteRuntimeBase: Object.freeze({\n        registry: "registry-1.docker.io",\n        repository: "runpod/pytorch",\n        tag: "2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",\n        provisionImageTag: "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",\n        expectedRegistryDigest: "sha256:61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5",\n        basePython: "3.11",\n        baseTorch: "2.4.0",\n        baseCuda: "12.4.1",\n        bootstrapPython: "3.11",\n        bootstrapTorch: "2.5.1",\n        bootstrapTorchCuda: "12.4",\n        bootstrapFlashAttention: "2.6.3",\n        runtimePreflightCertified: false\n    }),\n    targetGpuTypeId: "NVIDIA L40S",`,
    "V142_HUMO_REMOTE_RUNTIME_BASE"
  );
}

function ensureHuMoResolverProfile() {
  const file = "jarvis-local-video-engine.js";
  replaceExactOnce(
    file,
    `const UNSUPPORTED_LOCAL_VIDEO_MODEL_PROFILE = Object.freeze({`,
    `const HUMO_IDENTITY_PROBE = Object.freeze({\n    backend: "humo-1.7b-identity",\n    id: RUNPOD_HUMO_IDENTITY_CANDIDATE.id,\n    model: "HuMo-1.7B",\n    provider: "local",\n    license: null,\n    textToVideo: false,\n    imageToVideo: true,\n    referenceAssets: true,\n    maximumReferenceAssets: 3,\n    maximumSourceReferenceAssets: 3,\n    targetResolution: "832x480-identity-probe",\n    targetFps: 25,\n    portraitSize: null,\n    landscapeSize: Object.freeze({ width: 832, height: 480 }),\n    minimumVramGb: 48,\n    checkpointSizeGb: 0,\n    minimumFreeDiskGb: 60,\n    identityOnly: true,\n    identityProbeOnly: true,\n    remoteModelDirectory: "/workspace/models/HuMo",\n    repositoryEntrypoint: "main.py"\n});\n\nconst UNSUPPORTED_LOCAL_VIDEO_MODEL_PROFILE = Object.freeze({`,
    "V142_HUMO_MODEL_PROFILE"
  );

  replaceExactOnce(
    file,
    `export const LOCAL_VIDEO_MODEL_PROFILES = Object.freeze({\n    [WAN22_TI2V_5B.backend]: WAN22_TI2V_5B,\n    [WAN21_T2V_1_3B.backend]: WAN21_T2V_1_3B\n});`,
    `export const LOCAL_VIDEO_MODEL_PROFILES = Object.freeze({\n    [WAN22_TI2V_5B.backend]: WAN22_TI2V_5B,\n    [WAN21_T2V_1_3B.backend]: WAN21_T2V_1_3B,\n    [HUMO_IDENTITY_PROBE.backend]: HUMO_IDENTITY_PROBE\n});`,
    "V142_HUMO_PROFILE_REGISTRATION"
  );

  replaceExactOnce(
    file,
    `    "light": WAN21_T2V_1_3B.backend,\n    "local-light": WAN21_T2V_1_3B.backend\n});`,
    `    "light": WAN21_T2V_1_3B.backend,\n    "local-light": WAN21_T2V_1_3B.backend,\n    "humo": HUMO_IDENTITY_PROBE.backend,\n    "humo-1.7b": HUMO_IDENTITY_PROBE.backend,\n    "humo-1.7b-identity": HUMO_IDENTITY_PROBE.backend\n});`,
    "V142_HUMO_MODEL_ALIASES"
  );

  replaceExactOnce(
    file,
    `const LOCAL_VIDEO_BACKEND_ORDER = Object.freeze([\n    WAN22_TI2V_5B.backend,\n    WAN21_T2V_1_3B.backend\n]);`,
    `const LOCAL_VIDEO_BACKEND_ORDER = Object.freeze([\n    WAN22_TI2V_5B.backend,\n    WAN21_T2V_1_3B.backend,\n    HUMO_IDENTITY_PROBE.backend\n]);`,
    "V142_HUMO_BACKEND_ORDER"
  );

  replaceExactOnce(
    file,
    `    [WAN21_T2V_1_3B.backend]: Object.freeze({\n        modelDirectory: "JARVIS_WAN21_MODEL_DIR",\n        repositoryDirectory: "JARVIS_WAN21_REPO_DIR",\n        certified: "JARVIS_WAN21_CERTIFIED"\n    })\n});`,
    `    [WAN21_T2V_1_3B.backend]: Object.freeze({\n        modelDirectory: "JARVIS_WAN21_MODEL_DIR",\n        repositoryDirectory: "JARVIS_WAN21_REPO_DIR",\n        certified: "JARVIS_WAN21_CERTIFIED"\n    }),\n    [HUMO_IDENTITY_PROBE.backend]: Object.freeze({\n        modelDirectory: "JARVIS_HUMO_WEIGHTS_DIR",\n        repositoryDirectory: "JARVIS_HUMO_REPO_DIR",\n        certified: "JARVIS_HUMO_CERTIFIED"\n    })\n});`,
    "V142_HUMO_BACKEND_ENVIRONMENT"
  );

  replaceExactOnce(
    file,
    `    const modelDirectory = configuredModelDirectory\n        ? path.resolve(String(configuredModelDirectory))\n        : (remoteExecution ? "/workspace/models/Wan2.2-TI2V-5B" : null);`,
    `    const modelDirectory = configuredModelDirectory\n        ? path.resolve(String(configuredModelDirectory))\n        : (remoteExecution\n            ? (profile.remoteModelDirectory || "/workspace/models/Wan2.2-TI2V-5B")\n            : null);`,
    "V142_REMOTE_PROFILE_MODEL_DIRECTORY"
  );

  replaceExactOnce(
    file,
    `    const repositoryReady = remoteExecution || legacyConfiguration || Boolean(\n        repositoryDirectory && fs.existsSync(path.join(repositoryDirectory, "generate.py"))\n    );`,
    `    const repositoryReady = remoteExecution || legacyConfiguration || Boolean(\n        repositoryDirectory && fs.existsSync(path.join(\n            repositoryDirectory,\n            profile.repositoryEntrypoint || "generate.py"\n        ))\n    );`,
    "V142_PROFILE_REPOSITORY_ENTRYPOINT"
  );
}

function ensureIdentityResolverFailsClosedOnHuMo() {
  const file = "jarvis-local-video-engine.js";
  replaceExactOnce(
    file,
    `    if (requiresIdentityFidelity && referenceCount > 0) {\n        if (\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true ||\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalPortraitCertified !== true ||\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true\n        ) {\n            return "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED";\n        }\n    }`,
    `    if (backend.backend === HUMO_IDENTITY_PROBE.backend) {\n        if (!requiresIdentityFidelity || referenceCount < 1) {\n            return "LOCAL_VIDEO_HUMO_IDENTITY_REQUIRED";\n        }\n        if (String(requirements.aspectRatio || "") !== "16:9") {\n            return "LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED";\n        }\n        if (\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true ||\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalPortraitCertified !== true ||\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true\n        ) {\n            return "LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED";\n        }\n    }\n    else if (requiresIdentityFidelity && referenceCount > 0) {\n        return "LOCAL_VIDEO_IDENTITY_BACKEND_REQUIRED";\n    }`,
    "V142_HUMO_RESOLVER_FAIL_CLOSED"
  );
}

function ensureRegression() {
  const file = "tests/jarvis-local-video-engine-v142.test.mjs";
  appendOnce(
    file,
    "V142 HuMo is a resolver-visible identity-only backend but cannot provision while uncertified",
    `test("V142 HuMo is a resolver-visible identity-only backend but cannot provision while uncertified", () => {\n    const source = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    const candidateStart = source.indexOf("const RUNPOD_HUMO_IDENTITY_CANDIDATE = Object.freeze({");\n    const candidateEnd = source.indexOf("const HUMO_IDENTITY_PROBE = Object.freeze({", candidateStart);\n    assert.ok(candidateStart >= 0 && candidateEnd > candidateStart);\n    const candidate = source.slice(candidateStart, candidateEnd);\n    assert.match(candidate, /remoteRuntimeBase: Object\\.freeze\\(\\{/);\n    assert.match(candidate, /runpod\\/pytorch:2\\.4\\.0-py3\\.11-cuda12\\.4\\.1-devel-ubuntu22\\.04/);\n    assert.match(candidate, /61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5/);\n    assert.match(candidate, /bootstrapTorch: "2\\.5\\.1"/);\n    assert.match(candidate, /bootstrapFlashAttention: "2\\.6\\.3"/);\n    assert.match(candidate, /runtimePreflightCertified: false/);\n    assert.match(candidate, /physicalRuntimeCertified: false/);\n    assert.match(candidate, /physicalPortraitCertified: false/);\n    assert.match(candidate, /paidExecutionAuthorized: false/);\n\n    assert.match(source, /const HUMO_IDENTITY_PROBE = Object\\.freeze\\(\\{/);\n    assert.match(source, /backend: "humo-1\\.7b-identity"/);\n    assert.match(source, /identityOnly: true/);\n    assert.match(source, /identityProbeOnly: true/);\n    assert.match(source, /HUMO_IDENTITY_PROBE\\.backend/);\n    assert.match(source, /LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED/);\n    assert.match(source, /LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED/);\n    assert.match(source, /LOCAL_VIDEO_IDENTITY_BACKEND_REQUIRED/);\n});`
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
  "LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED"
]) {
  if (!engine.includes(marker)) throw new Error(`V142_HUMO_RESOLVER_MARKER_MISSING:${marker}`);
}
if (!tests.includes("V142 HuMo is a resolver-visible identity-only backend but cannot provision while uncertified")) {
  throw new Error("V142_HUMO_RESOLVER_REGRESSION_MISSING");
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_RESOLVER_FAIL_CLOSED_MATERIALIZED",
  humoResolverVisible: true,
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
