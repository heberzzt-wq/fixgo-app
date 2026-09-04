import fs from "node:fs";
import { execFileSync } from "node:child_process";

const CERTIFIED_PRODUCT_SHA = "e9e96fc7cc622ff9092eb2926c5af047fca1c7ea";
const LOCAL_VIDEO_ENGINE = "jarvis-local-video-engine.js";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";
const LOCAL_VIDEO_RUNNER = "scripts/jarvis-local-video-wan22.py";
const FS_BRIDGE = "jarvis-fs-bridge.js";

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
}

function replaceExactCount(source, before, after, expectedCount, label) {
  if (source.includes(after) && !source.includes(before)) return source;
  const count = source.split(before).length - 1;
  if (count !== expectedCount) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.split(before).join(after);
}

function appendOnce(source, marker, addition) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

let engine = read(LOCAL_VIDEO_ENGINE);
const candidateStart = engine.indexOf("const RUNPOD_HUMO_IDENTITY_CANDIDATE = Object.freeze({");
const candidateEnd = engine.indexOf("const HUMO_IDENTITY_PROBE = Object.freeze({", candidateStart);
if (candidateStart < 0 || candidateEnd <= candidateStart) {
  throw new Error("V142_HUMO_IDENTITY_CANDIDATE_BLOCK_MISSING");
}
let candidate = engine.slice(candidateStart, candidateEnd);
candidate = replaceExactCount(
  candidate,
  "        runtimePreflightCertified: false",
  "        runtimePreflightCertified: true",
  1,
  "V142_HUMO_RUNTIME_PREFLIGHT_CERTIFIED"
);
candidate = replaceExactCount(
  candidate,
  "    physicalRuntimeCertified: false",
  "    physicalRuntimeCertified: true",
  1,
  "V142_HUMO_PHYSICAL_RUNTIME_CERTIFIED"
);
if (!candidate.includes("physicalRuntimeCertification: Object.freeze({")) {
  candidate = replaceExactCount(
    candidate,
    [
      "    physicalRuntimeCertified: true,",
      "    physicalPortraitCertified: false,"
    ].join("\n"),
    [
      "    physicalRuntimeCertified: true,",
      "    physicalRuntimeCertification: Object.freeze({",
      "        status: \"RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED\",",
      `        canonicalSha: \"${CERTIFIED_PRODUCT_SHA}\",`,
      "        operationName: \"local-video/0c1a1082-dce4-40c4-993d-053255859fc6\",",
      "        podId: \"0qildg0t1wyosk\",",
      "        runtimeCertificationOnly: true,",
      "        physicalRuntimeCertified: true,",
      "        inferenceStarted: false,",
      "        terminationVerified: true,",
      "        gpuRentalSeconds: 872.338,",
      "        gpuRentalEstimatedCostUsd: 0.2641245611111111",
      "    }),",
      "    physicalPortraitCertified: false,"
    ].join("\n"),
    1,
    "V142_HUMO_PHYSICAL_RUNTIME_RECEIPT"
  );
}
for (const marker of [
  `canonicalSha: \"${CERTIFIED_PRODUCT_SHA}\"`,
  "operationName: \"local-video/0c1a1082-dce4-40c4-993d-053255859fc6\"",
  "podId: \"0qildg0t1wyosk\"",
  "runtimeCertificationOnly: true",
  "physicalRuntimeCertified: true",
  "inferenceStarted: false",
  "terminationVerified: true",
  "paidExecutionAuthorized: false",
  "physicalPortraitCertified: false"
]) {
  if (!candidate.includes(marker)) throw new Error(`V142_HUMO_CERT_RECEIPT_MARKER_MISSING:${marker}`);
}
engine = engine.slice(0, candidateStart) + candidate + engine.slice(candidateEnd);
if (!engine.includes('FLASH_ATTN_WHEEL=/tmp/flash_attn-2.6.3+cu124torch2.5-cp311-cp311-linux_x86_64.whl')) {
  throw new Error("V142_HUMO_FLASH_ATTN_WHEEL_PIN_MISSING");
}
if (!engine.includes("55f8853bc1947a82eea50109f641487adabc7978bf16afb0a9eb6addc6dc51d3")) {
  throw new Error("V142_HUMO_FLASH_ATTN_WHEEL_SHA_MISSING");
}
if (!engine.includes("flashAttentionCudaProbe':flash_probe")) {
  throw new Error("V142_HUMO_FLASH_ATTN_CUDA_PROBE_MISSING");
}
write(LOCAL_VIDEO_ENGINE, engine);

let runner = read(LOCAL_VIDEO_RUNNER);
runner = replaceExactCount(
  runner,
  [
    "and a pinned HuMo identity candidate that remains physically uncertified",
    "and non-executable until the existing authority explicitly certifies it."
  ].join("\n"),
  [
    "and a pinned HuMo identity candidate whose GPU runtime is physically certified",
    "but remains non-executable until explicit paid execution authority is granted."
  ].join("\n"),
  1,
  "V142_HUMO_RUNNER_CERTIFICATION_COMMENT"
);
write(LOCAL_VIDEO_RUNNER, runner);

let tests = read(LOCAL_VIDEO_TEST);
tests = replaceExactCount(
  tests,
  "    assert.match(candidate, /physicalRuntimeCertified: false/);",
  "    assert.match(candidate, /physicalRuntimeCertified: true/);",
  1,
  "V142_HUMO_CANDIDATE_PHYSICAL_RUNTIME_TEST"
);
tests = replaceExactCount(
  tests,
  '    assert.equal(candidate.includes("runtimePreflightCertified: false"), true);',
  '    assert.equal(candidate.includes("runtimePreflightCertified: true"), true);',
  1,
  "V142_HUMO_PREFLIGHT_SOURCE_TEST"
);
tests = replaceExactCount(
  tests,
  '    assert.equal(candidate.includes("physicalRuntimeCertified: false"), true);',
  '    assert.equal(candidate.includes("physicalRuntimeCertified: true"), true);',
  1,
  "V142_HUMO_PHYSICAL_SOURCE_TEST"
);
tests = replaceExactCount(
  tests,
  'test("V142 HuMo is explicit-only and fail-closed until physical identity certification", () => {',
  'test("V142 HuMo is explicit-only and fail-closed until paid identity execution authorization", () => {',
  1,
  "V142_HUMO_FAIL_CLOSED_TEST_TITLE"
);
const oldPrecheckAssertions = [
  "        assert.equal(report.contract.runtimePreflightCertified, false);",
  "        assert.equal(report.physicalRuntimeCertified, false);",
  "        assert.equal(report.paidExecutionAuthorized, false);",
  "        assert.equal(report.portrait.certified, false);",
  "        assert.equal(report.portrait.status, \"LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED\");",
  "        assert.deepEqual(report.executionBlockers, [",
  "            \"RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED\",",
  "            \"RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED\"",
  "        ]);"
].join("\n");
const newPrecheckAssertions = [
  "        assert.equal(report.contract.runtimePreflightCertified, true);",
  "        assert.equal(report.physicalRuntimeCertified, true);",
  "        assert.equal(report.paidExecutionAuthorized, false);",
  "        assert.equal(report.portrait.certified, false);",
  "        assert.equal(report.portrait.status, \"LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED\");",
  "        assert.deepEqual(report.executionBlockers, [",
  "            \"RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED\"",
  "        ]);"
].join("\n");
tests = replaceExactCount(
  tests,
  oldPrecheckAssertions,
  newPrecheckAssertions,
  2,
  "V142_HUMO_ZERO_COST_PREFLIGHT_CERTIFIED_ASSERTIONS"
);
tests = appendOnce(
  tests,
  "V142 HuMo physical runtime certification is durable while paid inference stays closed",
  `test("V142 HuMo physical runtime certification is durable while paid inference stays closed", () => {\n    const source = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    const start = source.indexOf("const RUNPOD_HUMO_IDENTITY_CANDIDATE = Object.freeze({");\n    const end = source.indexOf("const HUMO_IDENTITY_PROBE = Object.freeze({", start);\n    assert.ok(start >= 0 && end > start);\n    const candidate = source.slice(start, end);\n    assert.match(candidate, /runtimePreflightCertified: true/);\n    assert.match(candidate, /physicalRuntimeCertified: true/);\n    assert.match(candidate, /canonicalSha: "e9e96fc7cc622ff9092eb2926c5af047fca1c7ea"/);\n    assert.match(candidate, /operationName: "local-video\\/0c1a1082-dce4-40c4-993d-053255859fc6"/);\n    assert.match(candidate, /podId: "0qildg0t1wyosk"/);\n    assert.match(candidate, /runtimeCertificationOnly: true/);\n    assert.match(candidate, /inferenceStarted: false/);\n    assert.match(candidate, /terminationVerified: true/);\n    assert.match(candidate, /paidExecutionAuthorized: false/);\n    assert.match(candidate, /physicalPortraitCertified: false/);\n});`
);
write(LOCAL_VIDEO_TEST, tests);

const bridge = read(FS_BRIDGE);
if (!bridge.includes('env.JARVIS_RUNPOD_DATACENTER_ID || ""')) {
  throw new Error("V142_HUMO_DYNAMIC_DATACENTER_REGRESSION");
}
if (bridge.includes('env.JARVIS_RUNPOD_DATACENTER_ID || "EU-NL-1"')) {
  throw new Error("V142_HUMO_DEFAULT_DATACENTER_REGRESSION");
}

execFileSync(process.execPath, ["--check", LOCAL_VIDEO_ENGINE], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", FS_BRIDGE], { stdio: "inherit" });
const python = process.platform === "win32" ? "python" : "python3";
execFileSync(python, ["-c", `import ast,pathlib; ast.parse(pathlib.Path('${LOCAL_VIDEO_RUNNER}').read_text(encoding='utf-8'))`], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_PHYSICAL_RUNTIME_CERTIFICATION_MATERIALIZED",
  certifiedProductSha: CERTIFIED_PRODUCT_SHA,
  physicalRuntimeCertified: true,
  runtimePreflightCertified: true,
  runtimeCertificationOnly: true,
  inferenceStarted: false,
  terminationVerified: true,
  paidExecutionAuthorized: false,
  physicalPortraitCertified: false,
  providerTrafficUsed: false,
  runpodTrafficUsed: false,
  billableGpuCreated: false,
  newFiles: false,
  newBrains: false
}));
