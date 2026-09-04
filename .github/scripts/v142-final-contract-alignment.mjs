import fs from "node:fs";
import { execFileSync } from "node:child_process";

const PRODUCT_BASE_COMMIT = "d10b619060e644532f3658625df3d46d7c8551e6";
const LOCAL_VIDEO_ENGINE = "jarvis-local-video-engine.js";
const LOCAL_VIDEO_RUNNER = "scripts/jarvis-local-video-wan22.py";
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
for (const marker of [
  "HF_HUB_DISABLE_XET=1",
  "--max-workers 1",
  "HUMO_ASSETS_HUMO",
  "HUMO_ASSETS_WAN21",
  "HUMO_ASSETS_WHISPER",
  "HUMO_ASSETS_VERIFY",
  "physicalRuntimeCertified: true",
  "paidExecutionAuthorized: false"
]) {
  if (!engine.includes(marker)) throw new Error(`V142_HUMO_EXISTING_CONTRACT_REGRESSION:${marker}`);
}

engine = replaceExactOnce(
  engine,
  [
    "        else {",
    "            body.volumeInGb = volumeInGb;",
    "            if (selectedDataCenterId) body.dataCenterIds = [selectedDataCenterId];",
    "        }",
    "        return body;"
  ].join("\n"),
  [
    "        else {",
    "            const persistentVolumeDisabled = isHuMoRemoteJob(job);",
    "            body.volumeInGb = persistentVolumeDisabled ? 0 : volumeInGb;",
    "            if (selectedDataCenterId) body.dataCenterIds = [selectedDataCenterId];",
    "        }",
    "        return body;"
  ].join("\n"),
  "V142_HUMO_ZERO_PERSISTENT_VOLUME_PAYLOAD"
);

engine = replaceExactOnce(
  engine,
  [
    "    function assertProvisionBody(",
    "        body,",
    "        networkVolume = null,",
    "        selectedGpuTypeId = gpuTypeId,",
    "        profile = cacheContract",
    "    ) {"
  ].join("\n"),
  [
    "    function assertProvisionBody(",
    "        body,",
    "        networkVolume = null,",
    "        selectedGpuTypeId = gpuTypeId,",
    "        profile = cacheContract,",
    "        job = null",
    "    ) {"
  ].join("\n"),
  "V142_HUMO_STORAGE_ASSERT_JOB_CONTEXT"
);

engine = replaceExactOnce(
  engine,
  [
    "        else if (body.volumeInGb !== volumeInGb || Object.hasOwn(body, \"networkVolumeId\")) {",
    "            throw new Error(\"RUNPOD_EPHEMERAL_VOLUME_PAYLOAD_INVALID\");",
    "        }"
  ].join("\n"),
  [
    "        else {",
    "            const expectedVolumeInGb = isHuMoRemoteJob(job) ? 0 : volumeInGb;",
    "            if (body.volumeInGb !== expectedVolumeInGb || Object.hasOwn(body, \"networkVolumeId\")) {",
    "                throw new Error(\"RUNPOD_EPHEMERAL_VOLUME_PAYLOAD_INVALID\");",
    "            }",
    "            if (isHuMoRemoteJob(job) && body.volumeInGb !== 0) {",
    "                throw new Error(\"RUNPOD_HUMO_PERSISTENT_STORAGE_FORBIDDEN\");",
    "            }",
    "        }"
  ].join("\n"),
  "V142_HUMO_STORAGE_ASSERTION"
);

engine = replaceExactOnce(
  engine,
  "                assertProvisionBody(body, plannedVolume, selectedGpuTypeId, selectedProfile);",
  "                assertProvisionBody(body, plannedVolume, selectedGpuTypeId, selectedProfile, job);",
  "V142_HUMO_STORAGE_PRECHECK_CALL"
);
engine = replaceExactOnce(
  engine,
  "            assertProvisionBody(body, networkVolume, gpuTypeId, launchProfile);",
  "            assertProvisionBody(body, networkVolume, gpuTypeId, launchProfile, job);",
  "V142_HUMO_STORAGE_LAUNCH_CALL"
);

for (const marker of [
  "persistentVolumeDisabled = isHuMoRemoteJob(job)",
  "persistentVolumeDisabled ? 0 : volumeInGb",
  "RUNPOD_HUMO_PERSISTENT_STORAGE_FORBIDDEN",
  "assertProvisionBody(body, plannedVolume, selectedGpuTypeId, selectedProfile, job)",
  "assertProvisionBody(body, networkVolume, gpuTypeId, launchProfile, job)"
]) {
  if (!engine.includes(marker)) throw new Error(`V142_HUMO_STORAGE_MARKER_MISSING:${marker}`);
}
write(LOCAL_VIDEO_ENGINE, engine);

let bridge = read(FS_BRIDGE);
bridge = replaceExactOnce(
  bridge,
  [
    '        JARVIS_RUNPOD_EXPECTED_VRAM_GB: "48",',
    '        JARVIS_RUNPOD_MIN_RAM_GB: "62",',
    '        JARVIS_RUNPOD_MIN_VCPU: "16",'
  ].join("\n"),
  [
    '        JARVIS_RUNPOD_EXPECTED_VRAM_GB: "48",',
    '        JARVIS_RUNPOD_MIN_RAM_GB: "62",',
    '        JARVIS_RUNPOD_MIN_VCPU: "16",',
    '        JARVIS_RUNPOD_CONTAINER_DISK_GB: "60",',
    '        JARVIS_RUNPOD_VOLUME_DISK_GB: "0",'
  ].join("\n"),
  "V142_HUMO_PROBE_TEMP_STORAGE_ENV"
);
for (const marker of [
  'JARVIS_RUNPOD_CONTAINER_DISK_GB: "60"',
  'JARVIS_RUNPOD_VOLUME_DISK_GB: "0"',
  "delete runtimeEnv.JARVIS_RUNPOD_NETWORK_VOLUME_ID",
  "HUMO_IDENTITY_PROBE_FAILED_AND_RELEASED"
]) {
  if (!bridge.includes(marker)) throw new Error(`V142_HUMO_STORAGE_BRIDGE_MARKER_MISSING:${marker}`);
}
write(FS_BRIDGE, bridge);

let tests = read(LOCAL_VIDEO_TEST);
tests = replaceExactOnce(
  tests,
  [
    '    assert.equal("networkVolumeId" in harness.createdBody, false);',
    '    assert.equal(harness.createdBody.volumeInGb, 100);',
    '',
    '    let certified = null;'
  ].join("\n"),
  [
    '    assert.equal("networkVolumeId" in harness.createdBody, false);',
    '    assert.equal(harness.createdBody.volumeInGb, 0);',
    '',
    '    let certified = null;'
  ].join("\n"),
  "V142_HUMO_RUNTIME_CERT_ZERO_VOLUME_EXPECTATION"
);

const storageTest = [
  'test("V142 HuMo probes forbid persistent RunPod storage and use temporary container disk", () => {',
  '    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");',
  '    assert.equal(engineSource.includes("persistentVolumeDisabled = isHuMoRemoteJob(job)"), true);',
  '    assert.equal(engineSource.includes("persistentVolumeDisabled ? 0 : volumeInGb"), true);',
  '    assert.equal(engineSource.includes("RUNPOD_HUMO_PERSISTENT_STORAGE_FORBIDDEN"), true);',
  '    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");',
  '    assert.equal(bridgeSource.includes("JARVIS_RUNPOD_CONTAINER_DISK_GB: \\\"60\\\""), true);',
  '    assert.equal(bridgeSource.includes("JARVIS_RUNPOD_VOLUME_DISK_GB: \\\"0\\\""), true);',
  '    assert.equal(bridgeSource.includes("delete runtimeEnv.JARVIS_RUNPOD_NETWORK_VOLUME_ID"), true);',
  '});'
].join("\n");
tests = appendOnce(
  tests,
  "V142 HuMo probes forbid persistent RunPod storage and use temporary container disk",
  storageTest
);
write(LOCAL_VIDEO_TEST, tests);

const runner = read(LOCAL_VIDEO_RUNNER);
for (const marker of [
  "LOCAL_VIDEO_HUMO_CERTIFIED_VENV_REQUIRED",
  "LOCAL_VIDEO_HUMO_CERTIFIED_VENV_INVALID",
  '"torch.distributed.run"',
  "import importlib.metadata,omegaconf,torch"
]) {
  if (!runner.includes(marker)) throw new Error(`V142_HUMO_VENV_REGRESSION:${marker}`);
}

execFileSync(process.execPath, ["--check", LOCAL_VIDEO_ENGINE], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", FS_BRIDGE], { stdio: "inherit" });
const python = process.platform === "win32" ? "python" : "python3";
execFileSync(python, ["-c", `import ast,pathlib; ast.parse(pathlib.Path('${LOCAL_VIDEO_RUNNER}').read_text(encoding='utf-8'))`], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_ZERO_PERSISTENT_STORAGE_MATERIALIZED",
  productBaseCommit: PRODUCT_BASE_COMMIT,
  currentRunpodTestBalanceUsd: 3.86,
  persistentVolumeInGb: 0,
  networkVolumeAllowedForHuMoProbe: false,
  temporaryContainerDiskInGb: 60,
  containerDiskLifetime: "pod_only",
  releaseRequiresTerminationVerification: true,
  paidProbeHardCapUsd: 1,
  inferenceAuthorized: false,
  providerTrafficUsed: false,
  runpodTrafficUsed: false,
  billableGpuCreated: false,
  newFiles: false,
  newBrains: false
}));
