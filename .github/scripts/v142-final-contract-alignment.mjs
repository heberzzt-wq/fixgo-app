import fs from "node:fs";

function sourceOf(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
}

function replaceExactOnce(file, before, after, label) {
  let source = sourceOf(file);
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  source = source.replace(before, after);
  write(file, source);
}

function assertMaterializedV142Base() {
  const bridge = sourceOf("jarvis-fs-bridge.js");
  const engine = sourceOf("jarvis-local-video-engine.js");
  const actuator = sourceOf("gestia-core/jarvis/jarvis.actuator.pack.js");
  const artifactStudio = sourceOf("jarvis-artifact-studio.js");
  const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
  const doc = sourceOf("docs/jarvis-local-video-v142.md");
  const required = [
    [bridge, "RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED", "IDENTITY_BRIDGE_FAIL_CLOSED"],
    [engine, "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED", "IDENTITY_ENGINE_FAIL_CLOSED"],
    [engine, "RUNPOD_PROVISION_CLEANUP_FAILED", "PROVISION_CLEANUP_FAIL_CLOSED"],
    [engine, "cleanupFailure.remoteWorker", "PROVISION_CLEANUP_RETAINS_POD"],
    [engine, "candidateProbeGeometry", "HUMO_PROBE_GEOMETRY"],
    [engine, "portraitTargetUnresolved: true", "HUMO_PORTRAIT_UNRESOLVED"],
    [engine, "identityReferenceOutputs", "SHOT_IDENTITY_ENGINE"],
    [actuator, "characterIds: identity.characterIds", "SHOT_IDENTITY_ACTUATOR"],
    [actuator, "identityReferenceOutputs: identity.referenceOutputs", "SHOT_REFERENCE_ACTUATOR"],
    [artifactStudio, "cast: (episode.castIds || []).map(characterId => ({", "SERIES_CAST_DIRECTORY"],
    [runner, "def run_humo_identity_probe(", "HUMO_EXECUTOR"],
    [runner, "LOCAL_VIDEO_HUMO_RUNTIME_ASSETS_INCOMPLETE", "HUMO_ASSET_GATE"],
    [runner, "LOCAL_VIDEO_HUMO_MULTI_IDENTITY_UNSUPPORTED", "HUMO_MULTI_IDENTITY_GATE"],
    [runner, '"runtime_assets_pinned": False', "HUMO_EXECUTOR_ASSETS_STILL_CLOSED"],
    [doc, "must never be merged into a contact sheet, collage, or identity sheet", "DOC_NO_IDENTITY_SHEET"],
    [doc, "cleanup is download-first", "DOC_DOWNLOAD_FIRST"]
  ];
  for (const [source, marker, label] of required) {
    if (!source.includes(marker)) throw new Error(`V142_${label}_MISSING`);
  }
  if (bridge.includes("invocationPayload.requiresIdentityFidelity = false")) {
    throw new Error("V142_IDENTITY_FIDELITY_BYPASS_STILL_PRESENT");
  }
  if (runner.includes("LOCAL_VIDEO_HUMO_EXECUTOR_NOT_IMPLEMENTED")) {
    throw new Error("V142_HUMO_EXECUTOR_REGRESSED");
  }
}

function ensureHuMoRuntimeAssetAuthorityPins() {
  const engineFile = "jarvis-local-video-engine.js";
  const testFile = "tests/jarvis-local-video-engine-v142.test.mjs";

  replaceExactOnce(
    engineFile,
    `    sharedTextEncoderAuthority: "RUNPOD_WAN22_CACHE_BASE.requiredFiles",\n    reuseExistingWan22TextEncoderAuthority: true,\n    officialRuntime: Object.freeze({`,
    `    sharedTextEncoderAuthority: "RUNPOD_WAN22_CACHE_BASE.requiredFiles",\n    reuseExistingWan22TextEncoderAuthority: true,\n    whisper: Object.freeze({\n        repository: "openai/whisper-large-v3",\n        revision: "d8411bd4e55c0bca39e60653a0fe26ae8591859a",\n        model: Object.freeze({\n            path: "model.safetensors",\n            bytes: 3087130976,\n            sha256: "a8e94b85976e5864ba3e9525c7e6c83b2a1eca42d4b797a0c7c24d778e40fd95"\n        }),\n        requiredMetadata: Object.freeze([\n            "config.json",\n            "preprocessor_config.json"\n        ])\n    }),\n    audioSeparator: Object.freeze({\n        repository: "bytedance-research/HuMo",\n        revision: "3a4a1610d399a5cbb932d54dc229944029803ff7",\n        path: "audio_separator/Kim_Vocal_2.onnx",\n        bytes: 66759214,\n        sha256: "ce74ef3b6a6024ce44211a07be9cf8bc6d87728cc852a68ab34eb8e58cde9c8b"\n    }),\n    runtimeAssetAuthorityPinned: true,\n    officialRuntime: Object.freeze({`,
    "V142_HUMO_RUNTIME_ASSET_AUTHORITY_PINS"
  );

  replaceExactOnce(
    testFile,
    `    assert.match(candidate, /sharedTextEncoderAuthority: "RUNPOD_WAN22_CACHE_BASE\\.requiredFiles"/);\n    assert.match(candidate, /reuseExistingWan22TextEncoderAuthority: true/);\n    assert.equal((source.match(/models_t5_umt5-xxl-enc-bf16\\.pth/g) || []).length, 1);`,
    `    assert.match(candidate, /sharedTextEncoderAuthority: "RUNPOD_WAN22_CACHE_BASE\\.requiredFiles"/);\n    assert.match(candidate, /reuseExistingWan22TextEncoderAuthority: true/);\n    assert.equal((source.match(/models_t5_umt5-xxl-enc-bf16\\.pth/g) || []).length, 1);\n    assert.match(candidate, /repository: "openai\\/whisper-large-v3"/);\n    assert.match(candidate, /revision: "d8411bd4e55c0bca39e60653a0fe26ae8591859a"/);\n    assert.match(candidate, /bytes: 3087130976/);\n    assert.match(candidate, /a8e94b85976e5864ba3e9525c7e6c83b2a1eca42d4b797a0c7c24d778e40fd95/);\n    assert.match(candidate, /requiredMetadata: Object\\.freeze\\(\\[/);\n    assert.match(candidate, /"config\\.json"/);\n    assert.match(candidate, /"preprocessor_config\\.json"/);\n    assert.match(candidate, /path: "audio_separator\\/Kim_Vocal_2\\.onnx"/);\n    assert.match(candidate, /bytes: 66759214/);\n    assert.match(candidate, /ce74ef3b6a6024ce44211a07be9cf8bc6d87728cc852a68ab34eb8e58cde9c8b/);\n    assert.match(candidate, /runtimeAssetAuthorityPinned: true/);`,
    "V142_HUMO_RUNTIME_ASSET_AUTHORITY_REGRESSION"
  );
}

assertMaterializedV142Base();
ensureHuMoRuntimeAssetAuthorityPins();
assertMaterializedV142Base();

const engine = sourceOf("jarvis-local-video-engine.js");
const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
const testSource = sourceOf("tests/jarvis-local-video-engine-v142.test.mjs");
for (const marker of [
  'repository: "openai/whisper-large-v3"',
  'revision: "d8411bd4e55c0bca39e60653a0fe26ae8591859a"',
  "bytes: 3087130976",
  "a8e94b85976e5864ba3e9525c7e6c83b2a1eca42d4b797a0c7c24d778e40fd95",
  'path: "audio_separator/Kim_Vocal_2.onnx"',
  "bytes: 66759214",
  "ce74ef3b6a6024ce44211a07be9cf8bc6d87728cc852a68ab34eb8e58cde9c8b",
  "runtimeAssetAuthorityPinned: true"
]) {
  if (!engine.includes(marker)) throw new Error(`V142_HUMO_ASSET_AUTHORITY_MISSING:${marker}`);
}
if (!testSource.includes("runtimeAssetAuthorityPinned: true")) {
  throw new Error("V142_HUMO_ASSET_AUTHORITY_REGRESSION_MISSING");
}
if (!runner.includes('"runtime_assets_pinned": False')) {
  throw new Error("V142_HUMO_EXECUTOR_ASSET_GATE_OPENED_EARLY");
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_RUNTIME_ASSET_AUTHORITY_PINNED",
  identityRuntimeCandidate: "humo-1.7b-identity",
  whisperRevisionPinned: true,
  whisperModelSha256Pinned: true,
  audioSeparatorSha256Pinned: true,
  sharedT5AuthorityReused: true,
  identityRuntimeAssetAuthorityPinned: true,
  identityRuntimeExecutorAssetsReady: false,
  identityRuntimePhysicallyCertified: false,
  identityRuntimePaidExecutionAuthorized: false,
  portraitTargetUnresolved: true,
  multiIdentityExecutionBlocked: true,
  successfulGenerationDownloadsBeforeRelease: true,
  paidSpendGuardedByExistingRunpodAuthority: true,
  newFiles: false,
  newBrains: false
}));