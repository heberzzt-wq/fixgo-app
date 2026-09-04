import fs from "node:fs";
import { execFileSync } from "node:child_process";

const PRODUCT_BASE_COMMIT = "50e2a4daa6197ca0e2b9be12a33976164fdc0129";
const WAN21_REVISION = "37ec512624d61f7aa208f7ea8140a131f93afc9a";
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
  '            `  humo_hf_download ${authority.modelRepository} --revision ${authority.modelRevision} --local-dir "$HUMO_WEIGHTS"`,',
  '            `  humo_hf_download ${authority.modelRepository} ${authority.checkpoint.path} ${authority.zeroVae.path} ${authority.audioSeparator.path} --revision ${authority.modelRevision} --local-dir "$HUMO_WEIGHTS"`,',
  "V142_HUMO_SELECTIVE_MODEL_ASSETS"
);

engine = replaceExactOnce(
  engine,
  `            "  humo_hf_download Wan-AI/Wan2.1-T2V-1.3B --revision ${WAN21_REVISION} --local-dir \\\"$WAN21_WEIGHTS\\\"",`,
  `            "  humo_hf_download Wan-AI/Wan2.1-T2V-1.3B Wan2.1_VAE.pth models_t5_umt5-xxl-enc-bf16.pth google/umt5-xxl/special_tokens_map.json google/umt5-xxl/spiece.model google/umt5-xxl/tokenizer.json google/umt5-xxl/tokenizer_config.json --revision ${WAN21_REVISION} --local-dir \\\"$WAN21_WEIGHTS\\\"",`,
  "V142_HUMO_SELECTIVE_WAN21_ASSETS"
);

engine = replaceExactOnce(
  engine,
  '            `  humo_hf_download ${authority.whisper.repository} --revision ${authority.whisper.revision} --local-dir "$WHISPER_DIR"`,',
  '            `  humo_hf_download ${authority.whisper.repository} ${authority.whisper.model.path} ${authority.whisper.requiredMetadata.join(" ")} --revision ${authority.whisper.revision} --local-dir "$WHISPER_DIR"`,',
  "V142_HUMO_SELECTIVE_WHISPER_ASSETS"
);

engine = replaceExactOnce(
  engine,
  [
    '            "  progress HUMO_ASSETS_VERIFY RUNNING",',
    '            `  test -f "$HUMO_WEIGHTS/${authority.checkpoint.path}"`,'
  ].join("\n"),
  [
    '            "  progress HUMO_ASSETS_VERIFY RUNNING",',
    '            "  test ! -e \\\"$HUMO_WEIGHTS/HuMo-17B\\\"",',
    '            "  test ! -e \\\"$WAN21_WEIGHTS/diffusion_pytorch_model.safetensors\\\"",',
    '            `  test -f "$HUMO_WEIGHTS/${authority.checkpoint.path}"`,'
  ].join("\n"),
  "V142_HUMO_FORBID_UNUSED_LARGE_MODELS"
);

engine = replaceExactOnce(
  engine,
  [
    '            `  test -f "$WAN21_WEIGHTS/${authority.wan21Vae.path}"`,',
    '            `  test -f "$SEPARATOR_FILE"`,',
    '            "  progress HUMO_ASSETS_VERIFY READY",'
  ].join("\n"),
  [
    '            `  test -f "$WAN21_WEIGHTS/${authority.wan21Vae.path}"`,',
    '            "  test -f \\\"$WAN21_WEIGHTS/models_t5_umt5-xxl-enc-bf16.pth\\\"",',
    '            "  test -f \\\"$WAN21_WEIGHTS/google/umt5-xxl/special_tokens_map.json\\\"",',
    '            "  test -f \\\"$WAN21_WEIGHTS/google/umt5-xxl/spiece.model\\\"",',
    '            "  test -f \\\"$WAN21_WEIGHTS/google/umt5-xxl/tokenizer.json\\\"",',
    '            "  test -f \\\"$WAN21_WEIGHTS/google/umt5-xxl/tokenizer_config.json\\\"",',
    '            `  test -f "$WHISPER_DIR/${authority.whisper.model.path}"`,',
    '            "  test -f \\\"$WHISPER_DIR/config.json\\\"",',
    '            "  test -f \\\"$WHISPER_DIR/preprocessor_config.json\\\"",',
    '            `  test -f "$SEPARATOR_FILE"`,',
    '            "  progress HUMO_ASSETS_VERIFY READY",'
  ].join("\n"),
  "V142_HUMO_SELECTIVE_ASSET_EXISTENCE_GATES"
);

const forbiddenFullSnapshots = [
  'humo_hf_download ${authority.modelRepository} --revision ${authority.modelRevision}',
  `humo_hf_download Wan-AI/Wan2.1-T2V-1.3B --revision ${WAN21_REVISION}`,
  'humo_hf_download ${authority.whisper.repository} --revision ${authority.whisper.revision}'
];
for (const marker of forbiddenFullSnapshots) {
  if (engine.includes(marker)) throw new Error(`V142_HUMO_FULL_SNAPSHOT_STILL_PRESENT:${marker}`);
}
for (const marker of [
  "${authority.checkpoint.path} ${authority.zeroVae.path} ${authority.audioSeparator.path}",
  "Wan2.1_VAE.pth models_t5_umt5-xxl-enc-bf16.pth",
  "google/umt5-xxl/special_tokens_map.json",
  "google/umt5-xxl/spiece.model",
  "google/umt5-xxl/tokenizer.json",
  "google/umt5-xxl/tokenizer_config.json",
  '${authority.whisper.model.path} ${authority.whisper.requiredMetadata.join(" ")}',
  "test ! -e \\\"$HUMO_WEIGHTS/HuMo-17B\\\"",
  "test ! -e \\\"$WAN21_WEIGHTS/diffusion_pytorch_model.safetensors\\\"",
  "HF_HUB_DISABLE_XET=1",
  "--max-workers 1",
  WAN21_REVISION
]) {
  if (!engine.includes(marker)) throw new Error(`V142_HUMO_SELECTIVE_ASSET_MARKER_MISSING:${marker}`);
}
write(LOCAL_VIDEO_ENGINE, engine);

let tests = read(LOCAL_VIDEO_TEST);
tests = appendOnce(
  tests,
  "V142 HuMo bootstrap downloads only the exact 1.7B identity runtime assets",
  `test("V142 HuMo bootstrap downloads only the exact 1.7B identity runtime assets", () => {\n    const source = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    assert.doesNotMatch(source, /humo_hf_download \\${authority\\.modelRepository} --revision \\${authority\\.modelRevision}/);\n    assert.doesNotMatch(source, /humo_hf_download Wan-AI\\/Wan2\\.1-T2V-1\\.3B --revision 37ec512624d61f7aa208f7ea8140a131f93afc9a/);\n    assert.doesNotMatch(source, /humo_hf_download \\${authority\\.whisper\\.repository} --revision \\${authority\\.whisper\\.revision}/);\n    assert.match(source, /\\${authority\\.checkpoint\\.path} \\${authority\\.zeroVae\\.path} \\${authority\\.audioSeparator\\.path}/);\n    assert.match(source, /Wan2\\.1_VAE\\.pth models_t5_umt5-xxl-enc-bf16\\.pth/);\n    assert.match(source, /google\\/umt5-xxl\\/special_tokens_map\\.json/);\n    assert.match(source, /google\\/umt5-xxl\\/spiece\\.model/);\n    assert.match(source, /google\\/umt5-xxl\\/tokenizer\\.json/);\n    assert.match(source, /google\\/umt5-xxl\\/tokenizer_config\\.json/);\n    assert.match(source, /\\${authority\\.whisper\\.model\\.path} \\${authority\\.whisper\\.requiredMetadata\\.join\\(" "\\)}/);\n    assert.match(source, /test ! -e .*HuMo-17B/);\n    assert.match(source, /test ! -e .*diffusion_pytorch_model\\.safetensors/);\n    assert.match(source, /HF_HUB_DISABLE_XET=1/);\n    assert.match(source, /--max-workers 1/);\n});`
);
write(LOCAL_VIDEO_TEST, tests);

const bridge = read(FS_BRIDGE);
for (const marker of [
  "runHuMoIdentityProbeCli",
  "HUMO_IDENTITY_PROBE_FAILED_AND_RELEASED",
  "fullEpisodeAuthorized: false"
]) {
  if (!bridge.includes(marker)) throw new Error(`V142_HUMO_IDENTITY_PROBE_REGRESSION:${marker}`);
}

execFileSync(process.execPath, ["--check", LOCAL_VIDEO_ENGINE], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", FS_BRIDGE], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_SELECTIVE_ASSET_BOOTSTRAP_MATERIALIZED",
  productBaseCommit: PRODUCT_BASE_COMMIT,
  fullHuMoSnapshotDownload: false,
  huMo17BDownloadAllowed: false,
  fullWan21SnapshotDownload: false,
  wan21DiffusionModelDownloadAllowed: false,
  fullWhisperSnapshotDownload: false,
  hfXetDisabled: true,
  hfMaxWorkers: 1,
  wan21Revision: WAN21_REVISION,
  inferenceAuthorized: false,
  providerTrafficUsed: false,
  runpodTrafficUsed: false,
  billableGpuCreated: false,
  newFiles: false,
  newBrains: false
}));
