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
  write(file, source.replace(before, after));
}

function appendOnce(file, marker, addition) {
  const source = sourceOf(file);
  if (source.includes(marker)) return;
  write(file, `${source.trimEnd()}\n\n${addition.trim()}\n`);
}

function assertV142Base() {
  const bridge = sourceOf("jarvis-fs-bridge.js");
  const engine = sourceOf("jarvis-local-video-engine.js");
  const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
  const doc = sourceOf("docs/jarvis-local-video-v142.md");
  const required = [
    [bridge, "RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED", "IDENTITY_BRIDGE_FAIL_CLOSED"],
    [engine, "RUNPOD_PROVISION_CLEANUP_FAILED", "PROVISION_CLEANUP_FAIL_CLOSED"],
    [engine, "runtimeAssetAuthorityPinned: true", "HUMO_ASSET_AUTHORITY_PINNED"],
    [engine, 'repository: "openai/whisper-large-v3"', "HUMO_WHISPER_PIN"],
    [engine, 'path: "audio_separator/Kim_Vocal_2.onnx"', "HUMO_SEPARATOR_PIN"],
    [engine, "identityReferenceOutputs", "SHOT_IDENTITY_ENGINE"],
    [runner, "def run_humo_identity_probe(", "HUMO_EXECUTOR"],
    [runner, "LOCAL_VIDEO_HUMO_MULTI_IDENTITY_UNSUPPORTED", "MULTI_IDENTITY_BLOCK"],
    [doc, "cleanup is download-first", "DOWNLOAD_FIRST"],
    [doc, "must never be merged into a contact sheet, collage, or identity sheet", "NO_IDENTITY_SHEET"]
  ];
  for (const [value, marker, label] of required) {
    if (!value.includes(marker)) throw new Error(`V142_${label}_MISSING`);
  }
  if (bridge.includes("invocationPayload.requiresIdentityFidelity = false")) {
    throw new Error("V142_IDENTITY_FIDELITY_BYPASS_STILL_PRESENT");
  }
}

function ensureIdentityRuntimeAuthorityInJob() {
  const file = "jarvis-local-video-engine.js";
  replaceExactOnce(
    file,
    `            referencePreparation,\n            requiresIdentityFidelity,\n            executionTarget: String(env.JARVIS_LOCAL_VIDEO_EXECUTION_TARGET || "local")`,
    `            referencePreparation,\n            requiresIdentityFidelity,\n            identityRuntimeAuthority: requiresIdentityFidelity ? {\n                ...RUNPOD_HUMO_IDENTITY_CANDIDATE,\n                sharedTextEncoderFiles: RUNPOD_WAN22_CACHE_BASE.requiredFiles.filter(item =>\n                    item.path === "models_t5_umt5-xxl-enc-bf16.pth" ||\n                    item.path.startsWith("google/umt5-xxl/")\n                )\n            } : null,\n            executionTarget: String(env.JARVIS_LOCAL_VIDEO_EXECUTION_TARGET || "local")`,
    "V142_HUMO_AUTHORITY_JOB_PROPAGATION"
  );
  replaceExactOnce(
    file,
    `            referencePreparation,\n            requiresIdentityFidelity: job.requiresIdentityFidelity === true,\n            createdAt: now().toISOString(),`,
    `            referencePreparation,\n            requiresIdentityFidelity: job.requiresIdentityFidelity === true,\n            identityRuntimeAuthority: job.identityRuntimeAuthority || null,\n            createdAt: now().toISOString(),`,
    "V142_HUMO_AUTHORITY_OPERATION_PERSISTENCE"
  );
}

function ensureIdentityReferenceRegressionAuthorityAware() {
  const testFile = "tests/jarvis-local-video-engine-v142.test.mjs";
  replaceExactOnce(
    testFile,
    `    assert.match(source, /referencePreparation,\\r?\\n\\s+requiresIdentityFidelity,\\r?\\n\\s+executionTarget:/);`,
    `    assert.match(\n        source,\n        /referencePreparation,\\r?\\n\\s+requiresIdentityFidelity,\\r?\\n\\s+identityRuntimeAuthority: requiresIdentityFidelity \\? \\{[\\s\\S]*?\\}\\s*: null,\\r?\\n\\s+executionTarget:/\n    );`,
    "V142_IDENTITY_REFERENCE_REGRESSION_AUTHORITY_AWARE"
  );
}

function ensureHuMoSingleAuthorityRegression() {
  const testFile = "tests/jarvis-local-video-engine-v142.test.mjs";
  replaceExactOnce(
    testFile,
    `    assert.equal((source.match(/models_t5_umt5-xxl-enc-bf16\\.pth/g) || []).length, 1);`,
    `    assert.equal((source.match(/const RUNPOD_HUMO_IDENTITY_CANDIDATE = Object\\.freeze\\(\\{/g) || []).length, 1);`,
    "V142_HUMO_SINGLE_AUTHORITY_REGRESSION"
  );
}

function ensureRunnerPhysicalHashGate() {
  const runnerFile = "scripts/jarvis-local-video-wan22.py";
  const testFile = "tests/jarvis-local-video-engine-v142.test.mjs";

  replaceExactOnce(
    runnerFile,
    `import argparse\nimport json\nimport os`,
    `import argparse\nimport hashlib\nimport json\nimport os`,
    "V142_HUMO_HASHLIB_IMPORT"
  );

  replaceExactOnce(
    runnerFile,
    `        "maximum_identity_count": 1,\n        "audio_required": True,\n        "runtime_assets_pinned": False,\n        "physical_runtime_certified": False,\n        "physical_portrait_certified": False,\n        "paid_execution_authorized": False,\n        "extra_args": [],`,
    `        "maximum_identity_count": 1,\n        "audio_required": True,\n        "extra_args": [],`,
    "V142_REMOVE_DUPLICATE_HUMO_RUNNER_AUTHORITY"
  );

  replaceExactOnce(
    runnerFile,
    `    if runtime == "humo":\n        if (\n            config.get("physical_runtime_certified") is not True\n            or config.get("physical_portrait_certified") is not True\n            or config.get("paid_execution_authorized") is not True\n        ):\n            raise RuntimeError("LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED")\n        if config.get("runtime_assets_pinned") is not True:\n            raise RuntimeError("LOCAL_VIDEO_HUMO_RUNTIME_ASSETS_INCOMPLETE")\n        return backend, config`,
    `    if runtime == "humo":\n        authority = job.get("identityRuntimeAuthority")\n        if not isinstance(authority, dict):\n            raise RuntimeError("LOCAL_VIDEO_HUMO_RUNTIME_AUTHORITY_REQUIRED")\n        if (\n            authority.get("physicalRuntimeCertified") is not True\n            or authority.get("physicalPortraitCertified") is not True\n            or authority.get("paidExecutionAuthorized") is not True\n        ):\n            raise RuntimeError("LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED")\n        if authority.get("runtimeAssetAuthorityPinned") is not True:\n            raise RuntimeError("LOCAL_VIDEO_HUMO_RUNTIME_ASSETS_INCOMPLETE")\n        return backend, config`,
    "V142_HUMO_RESOLVER_SINGLE_ENGINE_AUTHORITY"
  );

  replaceExactOnce(
    runnerFile,
    `    return candidate\n\n\ndef _humo_executable(value: str, fallback: str) -> str:`,
    `    return candidate\n\n\ndef _sha256_file(file: Path) -> str:\n    digest = hashlib.sha256()\n    with file.open("rb") as stream:\n        while True:\n            chunk = stream.read(1024 * 1024)\n            if not chunk:\n                break\n            digest.update(chunk)\n    return digest.hexdigest()\n\n\ndef _verify_humo_asset(file: Path, evidence: dict[str, Any], label: str) -> dict[str, Any]:\n    if not file.is_file():\n        raise RuntimeError(f"LOCAL_VIDEO_HUMO_ASSET_MISSING:{label}")\n    expected_bytes = int(evidence.get("bytes") or 0)\n    observed_bytes = file.stat().st_size\n    if expected_bytes > 0 and observed_bytes != expected_bytes:\n        raise RuntimeError(f"LOCAL_VIDEO_HUMO_ASSET_BYTES_MISMATCH:{label}")\n    expected_sha = str(evidence.get("sha256") or "").strip().lower()\n    if not expected_sha or len(expected_sha) != 64:\n        raise RuntimeError(f"LOCAL_VIDEO_HUMO_ASSET_AUTHORITY_INVALID:{label}")\n    observed_sha = _sha256_file(file)\n    if observed_sha != expected_sha:\n        raise RuntimeError(f"LOCAL_VIDEO_HUMO_ASSET_SHA256_MISMATCH:{label}")\n    return {"label": label, "bytes": observed_bytes, "sha256": observed_sha}\n\n\ndef _verify_humo_runtime_authority(\n    job: dict[str, Any],\n    humo_root: Path,\n    humo_weights: Path,\n    wan21_weights: Path,\n    whisper_root: Path,\n    separator_file: Path,\n) -> dict[str, Any]:\n    authority = job.get("identityRuntimeAuthority")\n    if not isinstance(authority, dict) or authority.get("runtimeAssetAuthorityPinned") is not True:\n        raise RuntimeError("LOCAL_VIDEO_HUMO_RUNTIME_AUTHORITY_REQUIRED")\n    source_revision = str(authority.get("sourceRevision") or "").strip()\n    if len(source_revision) != 40:\n        raise RuntimeError("LOCAL_VIDEO_HUMO_SOURCE_REVISION_AUTHORITY_INVALID")\n    observed_revision = subprocess.run(\n        ["git", "-C", str(humo_root), "rev-parse", "HEAD"],\n        check=True, capture_output=True, text=True, timeout=30\n    ).stdout.strip()\n    if observed_revision != source_revision:\n        raise RuntimeError("LOCAL_VIDEO_HUMO_SOURCE_REVISION_MISMATCH")\n\n    evidence = []\n    evidence.append(_verify_humo_asset(\n        humo_weights / str(authority.get("checkpoint", {}).get("path") or ""),\n        authority.get("checkpoint") or {}, "checkpoint"\n    ))\n    evidence.append(_verify_humo_asset(\n        humo_weights / str(authority.get("zeroVae", {}).get("path") or ""),\n        authority.get("zeroVae") or {}, "zero_vae"\n    ))\n    evidence.append(_verify_humo_asset(\n        wan21_weights / str(authority.get("wan21Vae", {}).get("path") or ""),\n        authority.get("wan21Vae") or {}, "wan21_vae"\n    ))\n\n    shared_files = authority.get("sharedTextEncoderFiles")\n    if not isinstance(shared_files, list) or not shared_files:\n        raise RuntimeError("LOCAL_VIDEO_HUMO_SHARED_T5_AUTHORITY_REQUIRED")\n    shared_map = {str(item.get("path") or ""): item for item in shared_files if isinstance(item, dict)}\n    for required_path in [\n        "models_t5_umt5-xxl-enc-bf16.pth",\n        "google/umt5-xxl/special_tokens_map.json",\n        "google/umt5-xxl/spiece.model",\n        "google/umt5-xxl/tokenizer.json",\n        "google/umt5-xxl/tokenizer_config.json",\n    ]:\n        item = shared_map.get(required_path)\n        if not item:\n            raise RuntimeError(f"LOCAL_VIDEO_HUMO_SHARED_T5_AUTHORITY_MISSING:{required_path}")\n        evidence.append(_verify_humo_asset(wan21_weights / required_path, item, f"t5:{required_path}"))\n\n    whisper = authority.get("whisper")\n    if not isinstance(whisper, dict):\n        raise RuntimeError("LOCAL_VIDEO_HUMO_WHISPER_AUTHORITY_REQUIRED")\n    whisper_model = whisper.get("model") or {}\n    evidence.append(_verify_humo_asset(\n        whisper_root / str(whisper_model.get("path") or ""),\n        whisper_model, "whisper_model"\n    ))\n    metadata = whisper.get("requiredMetadata")\n    if not isinstance(metadata, list) or not metadata:\n        raise RuntimeError("LOCAL_VIDEO_HUMO_WHISPER_METADATA_AUTHORITY_REQUIRED")\n    for relative in metadata:\n        metadata_file = whisper_root / str(relative)\n        if not metadata_file.is_file() or metadata_file.stat().st_size < 1:\n            raise RuntimeError(f"LOCAL_VIDEO_HUMO_WHISPER_METADATA_MISSING:{relative}")\n\n    separator = authority.get("audioSeparator")\n    if not isinstance(separator, dict):\n        raise RuntimeError("LOCAL_VIDEO_HUMO_AUDIO_SEPARATOR_AUTHORITY_REQUIRED")\n    evidence.append(_verify_humo_asset(separator_file, separator, "audio_separator"))\n    return {\n        "ok": True,\n        "sourceRevision": observed_revision,\n        "assetCount": len(evidence),\n        "assets": evidence,\n        "whisperRevision": str(whisper.get("revision") or ""),\n        "audioSeparatorRevision": str(separator.get("revision") or ""),\n    }\n\n\ndef _humo_executable(value: str, fallback: str) -> str:`,
    "V142_HUMO_PHYSICAL_ASSET_VERIFIER"
  );

  replaceExactOnce(
    runnerFile,
    `    separator = _required_humo_path(\n        os.environ.get("JARVIS_HUMO_AUDIO_SEPARATOR_FILE", ""),\n        "LOCAL_VIDEO_HUMO_AUDIO_SEPARATOR_MISSING",\n    )\n    torchrun = _humo_executable(os.environ.get("JARVIS_HUMO_TORCHRUN", ""), "torchrun")\n\n    output_file = Path(str(job.get("outputFile") or "")).resolve()`,
    `    separator = _required_humo_path(\n        os.environ.get("JARVIS_HUMO_AUDIO_SEPARATOR_FILE", ""),\n        "LOCAL_VIDEO_HUMO_AUDIO_SEPARATOR_MISSING",\n    )\n    torchrun = _humo_executable(os.environ.get("JARVIS_HUMO_TORCHRUN", ""), "torchrun")\n    runtime_asset_evidence = _verify_humo_runtime_authority(\n        job, humo_root, humo_weights, wan21_weights, whisper, separator\n    )\n\n    output_file = Path(str(job.get("outputFile") or "")).resolve()`,
    "V142_HUMO_VERIFY_ASSETS_BEFORE_EXECUTION"
  );

  replaceExactOnce(
    runnerFile,
    `        "identityProbe": True,\n        "portraitCertified": False,`,
    `        "identityProbe": True,\n        "identityRuntimeAuthorityVerified": True,\n        "identityRuntimeAssetEvidence": runtime_asset_evidence,\n        "portraitCertified": False,`,
    "V142_HUMO_RESULT_PERSISTS_ASSET_EVIDENCE"
  );

  appendOnce(
    testFile,
    "V142 HuMo job carries the single engine authority and runner hashes physical assets before torchrun",
    `test("V142 HuMo job carries the single engine authority and runner hashes physical assets before torchrun", () => {\n    const engine = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    const runner = fs.readFileSync(new URL("../scripts/jarvis-local-video-wan22.py", import.meta.url), "utf8");\n    assert.match(engine, /identityRuntimeAuthority: requiresIdentityFidelity \\? \\{/);\n    assert.match(engine, /\\.\\.\\.RUNPOD_HUMO_IDENTITY_CANDIDATE/);\n    assert.match(engine, /sharedTextEncoderFiles: RUNPOD_WAN22_CACHE_BASE\\.requiredFiles\\.filter/);\n    assert.match(engine, /identityRuntimeAuthority: job\\.identityRuntimeAuthority \\|\\| null/);\n    assert.match(runner, /authority = job\\.get\\("identityRuntimeAuthority"\\)/);\n    assert.match(runner, /LOCAL_VIDEO_HUMO_RUNTIME_AUTHORITY_REQUIRED/);\n    assert.equal(runner.includes("def _sha256_file("), true);\n    assert.match(runner, /LOCAL_VIDEO_HUMO_ASSET_SHA256_MISMATCH/);\n    assert.match(runner, /LOCAL_VIDEO_HUMO_SOURCE_REVISION_MISMATCH/);\n    assert.equal(runner.includes("runtime_asset_evidence = _verify_humo_runtime_authority("), true);\n    assert.ok(\n        runner.indexOf("runtime_asset_evidence = _verify_humo_runtime_authority(") <\n        runner.indexOf("command = [", runner.indexOf("def run_humo_identity_probe("))\n    );\n    assert.doesNotMatch(runner, /"physical_runtime_certified": False/);\n    assert.doesNotMatch(runner, /"paid_execution_authorized": False/);\n});`
  );
}

assertV142Base();
ensureIdentityRuntimeAuthorityInJob();
ensureIdentityReferenceRegressionAuthorityAware();
ensureHuMoSingleAuthorityRegression();
ensureRunnerPhysicalHashGate();
assertV142Base();

const engine = sourceOf("jarvis-local-video-engine.js");
const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
const testSource = sourceOf("tests/jarvis-local-video-engine-v142.test.mjs");

for (const marker of [
  "identityRuntimeAuthority: requiresIdentityFidelity ? {",
  "...RUNPOD_HUMO_IDENTITY_CANDIDATE",
  "sharedTextEncoderFiles: RUNPOD_WAN22_CACHE_BASE.requiredFiles.filter",
  "identityRuntimeAuthority: job.identityRuntimeAuthority || null"
]) {
  if (!engine.includes(marker)) throw new Error(`V142_HUMO_JOB_AUTHORITY_MISSING:${marker}`);
}

for (const marker of [
  "import hashlib",
  'authority = job.get("identityRuntimeAuthority")',
  "def _verify_humo_runtime_authority(",
  "LOCAL_VIDEO_HUMO_ASSET_SHA256_MISMATCH",
  "LOCAL_VIDEO_HUMO_SOURCE_REVISION_MISMATCH",
  "identityRuntimeAuthorityVerified",
  "identityRuntimeAssetEvidence"
]) {
  if (!runner.includes(marker)) throw new Error(`V142_HUMO_PHYSICAL_VERIFIER_MISSING:${marker}`);
}

for (const forbidden of [
  '"runtime_assets_pinned": False',
  '"physical_runtime_certified": False',
  '"physical_portrait_certified": False',
  '"paid_execution_authorized": False'
]) {
  if (runner.includes(forbidden)) throw new Error(`V142_DUPLICATE_HUMO_AUTHORITY_REMAINS:${forbidden}`);
}

if (!testSource.includes("V142 HuMo job carries the single engine authority and runner hashes physical assets before torchrun")) {
  throw new Error("V142_HUMO_PHYSICAL_AUTHORITY_REGRESSION_MISSING");
}
if (!testSource.includes("identityRuntimeAuthority: requiresIdentityFidelity")) {
  throw new Error("V142_IDENTITY_REFERENCE_REGRESSION_AUTHORITY_AWARE_MISSING");
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_JOB_AUTHORITY_AND_PHYSICAL_HASH_GATE_MATERIALIZED",
  singleIdentityAuthority: "RUNPOD_HUMO_IDENTITY_CANDIDATE",
  runnerDuplicateAuthorityRemoved: true,
  jobCarriesIdentityRuntimeAuthority: true,
  sourceRevisionVerifiedBeforeTorchrun: true,
  physicalAssetSha256VerifiedBeforeTorchrun: true,
  whisperPhysicalHashGate: true,
  audioSeparatorPhysicalHashGate: true,
  sharedT5PhysicalHashGate: true,
  identityRuntimePhysicallyCertified: false,
  identityRuntimePaidExecutionAuthorized: false,
  portraitTargetUnresolved: true,
  multiIdentityExecutionBlocked: true,
  successfulGenerationDownloadsBeforeRelease: true,
  newFiles: false,
  newBrains: false
}));
