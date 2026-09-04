import fs from "node:fs";
import { execFileSync } from "node:child_process";

const PRODUCT_BASE_COMMIT = "05eedfa2d0cc145a177c48a3fa7edd0c0bee5139";
const LOCAL_VIDEO_ENGINE = "jarvis-local-video-engine.js";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";
const FS_BRIDGE = "jarvis-fs-bridge.js";
const FS_BRIDGE_TEST = "tests/jarvis-fs-bridge-v2.test.mjs";

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}

function replaceFileExactOnce(file, before, after, label) {
  const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const next = replaceExactOnce(source, before, after, label);
  if (next !== source) fs.writeFileSync(file, next, "utf8");
}

function appendFileOnce(file, marker, addition) {
  const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (source.includes(marker)) return;
  fs.writeFileSync(file, `${source.trimEnd()}\n\n${addition.trim()}\n`, "utf8");
}

replaceFileExactOnce(
  LOCAL_VIDEO_ENGINE,
  [
    '        if (runtimeCertificationOnly) {',
    '            if (!gpuTypeId || !cacheContract) {',
    '                throw new Error("RUNPOD_GPU_TYPE_EXPLICIT_AUTHORIZATION_REQUIRED");',
    '            }',
    '            if (!networkVolumeId && !runtimeCertificationDataCenterId) {',
    '                throw new Error("RUNPOD_RUNTIME_CERTIFICATION_DATACENTER_REQUIRED");',
    '            }',
    '        }'
  ].join("\n"),
  [
    '        if (runtimeCertificationOnly) {',
    '            if (!gpuTypeId || !cacheContract) {',
    '                throw new Error("RUNPOD_GPU_TYPE_EXPLICIT_AUTHORIZATION_REQUIRED");',
    '            }',
    '        }'
  ].join("\n"),
  "V142_HUMO_RUNTIME_CERT_DYNAMIC_DATACENTER_CONFIG"
);

replaceFileExactOnce(
  LOCAL_VIDEO_ENGINE,
  [
    '        if (runtimeCertificationOnly && (',
    '            body.cloudType !== "SECURE" ||',
    '            body.dataCenterIds?.length !== 1 ||',
    '            body.dataCenterIds[0] !== (networkVolume?.dataCenterId || runtimeCertificationDataCenterId)',
    '        )) {',
    '            throw new Error("RUNPOD_RUNTIME_CERTIFICATION_PLACEMENT_INVALID");',
    '        }'
  ].join("\n"),
  [
    '        const expectedRuntimeCertificationDataCenterId =',
    '            networkVolume?.dataCenterId || runtimeCertificationDataCenterId || null;',
    '        if (runtimeCertificationOnly && (',
    '            body.cloudType !== "SECURE" ||',
    '            (expectedRuntimeCertificationDataCenterId',
    '                ? (',
    '                    body.dataCenterIds?.length !== 1 ||',
    '                    body.dataCenterIds[0] !== expectedRuntimeCertificationDataCenterId',
    '                )',
    '                : Object.hasOwn(body, "dataCenterIds"))',
    '        )) {',
    '            throw new Error("RUNPOD_RUNTIME_CERTIFICATION_PLACEMENT_INVALID");',
    '        }'
  ].join("\n"),
  "V142_HUMO_RUNTIME_CERT_DYNAMIC_DATACENTER_PAYLOAD"
);

replaceFileExactOnce(
  FS_BRIDGE,
  [
    '        JARVIS_RUNPOD_DATACENTER_ID: String(',
    '            env.JARVIS_RUNPOD_DATACENTER_ID || "EU-NL-1"',
    '        ).trim(),'
  ].join("\n"),
  [
    '        JARVIS_RUNPOD_DATACENTER_ID: String(',
    '            env.JARVIS_RUNPOD_DATACENTER_ID || ""',
    '        ).trim(),'
  ].join("\n"),
  "V142_HUMO_RUNTIME_CERT_NO_DEFAULT_DATACENTER"
);

replaceFileExactOnce(
  LOCAL_VIDEO_TEST,
  [
    'test("V142 HuMo mocked runtime certification provisions polls and releases without inference", async () => {',
    '    const humoSourceRevision = "845f44736e21be93aa5d8cf406b6eb01af9bff67";',
    '    const harness = runpodPhysicalHarness({',
    '        scenario: "humo-runtime-certification",',
    '        envOverrides: {',
    '            JARVIS_LOCAL_VIDEO_MODEL: "humo",',
    '            JARVIS_RUNPOD_CLOUD_TYPE: "SECURE",',
    '            JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true",',
    '            JARVIS_RUNPOD_DATACENTER_ID: "EU-NL-1"',
    '        },'
  ].join("\n"),
  [
    'test("V142 HuMo mocked runtime certification provisions polls and releases without inference", async () => {',
    '    const humoSourceRevision = "845f44736e21be93aa5d8cf406b6eb01af9bff67";',
    '    const harness = runpodPhysicalHarness({',
    '        scenario: "humo-runtime-certification",',
    '        envOverrides: {',
    '            JARVIS_LOCAL_VIDEO_MODEL: "humo",',
    '            JARVIS_RUNPOD_CLOUD_TYPE: "SECURE",',
    '            JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true"',
    '        },'
  ].join("\n"),
  "V142_HUMO_RUNTIME_CERT_TEST_NO_DEFAULT_DATACENTER"
);

replaceFileExactOnce(
  LOCAL_VIDEO_TEST,
  [
    '    await t.test("16 paid runtime authority requires one exact datacenter", () => {',
    '        const missing = runtimeHarness("a40-missing-runtime-dc", {',
    '            dataCenterId: "",',
    '            envOverrides: { JARVIS_RUNPOD_DATACENTER_ID: "" }',
    '        });',
    '        const report = missing.adapter.inspectZeroCostPrecheck({',
    '            job: missing.dryRunJob,',
    '            registryVerification: missing.gpuRegistryVerification',
    '        });',
    '        assert.equal(report.error, "RUNPOD_RUNTIME_CERTIFICATION_DATACENTER_REQUIRED");',
    '        assert.equal(missing.calls.length, 0);',
    '    });'
  ].join("\n"),
  [
    '    await t.test("16 paid ephemeral runtime authority allows provider-selected secure datacenter", () => {',
    '        const missing = runtimeHarness("a40-missing-runtime-dc", {',
    '            dataCenterId: "",',
    '            envOverrides: { JARVIS_RUNPOD_DATACENTER_ID: "" }',
    '        });',
    '        const report = missing.adapter.inspectZeroCostPrecheck({',
    '            job: missing.dryRunJob,',
    '            registryVerification: missing.gpuRegistryVerification',
    '        });',
    '        assert.equal(report.ok, true, JSON.stringify(report));',
    '        assert.equal(report.payload.cloudType, "SECURE");',
    '        assert.equal("dataCenterIds" in report.payload, false);',
    '        assert.deepEqual(report.payload.gpuTypeIds, ["NVIDIA A40"]);',
    '        assert.equal(missing.calls.length, 0);',
    '    });'
  ].join("\n"),
  "V142_RUNTIME_CERT_PROVIDER_SELECTED_DATACENTER_TEST"
);

replaceFileExactOnce(
  LOCAL_VIDEO_TEST,
  [
    '    assert.equal(harness.createdBody.imageName, "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04");',
    '    assert.equal(harness.createdBody.cloudType, "SECURE");',
    '    assert.deepEqual(harness.createdBody.dataCenterIds, ["EU-NL-1"]);',
    '    assert.deepEqual(harness.createdBody.gpuTypeIds, ["NVIDIA L40S"]);',
    '    assert.equal("networkVolumeId" in harness.createdBody, false);'
  ].join("\n"),
  [
    '    assert.equal(harness.createdBody.imageName, "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04");',
    '    assert.equal(harness.createdBody.cloudType, "SECURE");',
    '    assert.equal("dataCenterIds" in harness.createdBody, false);',
    '    assert.deepEqual(harness.createdBody.gpuTypeIds, ["NVIDIA L40S"]);',
    '    assert.equal("networkVolumeId" in harness.createdBody, false);'
  ].join("\n"),
  "V142_HUMO_RUNTIME_CERT_TEST_EPHEMERAL_PLACEMENT"
);

appendFileOnce(
  LOCAL_VIDEO_TEST,
  "V142 HuMo ephemeral runtime certification allows provider-selected secure datacenter",
  `test("V142 HuMo ephemeral runtime certification allows provider-selected secure datacenter", () => {\n    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    assert.equal(engineSource.includes("RUNPOD_RUNTIME_CERTIFICATION_DATACENTER_REQUIRED"), false);\n    assert.equal(engineSource.includes("expectedRuntimeCertificationDataCenterId"), true);\n    assert.equal(engineSource.includes('Object.hasOwn(body, "dataCenterIds")'), true);\n    assert.equal(engineSource.includes('runtimeCertificationOnly ? runtimeCertificationDataCenterId : null'), true);\n});`
);

appendFileOnce(
  FS_BRIDGE_TEST,
  "V142 HuMo runtime certification does not hard-pin a default datacenter",
  `test("V142 HuMo runtime certification does not hard-pin a default datacenter", () => {\n    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");\n    assert.equal(bridgeSource.includes('env.JARVIS_RUNPOD_DATACENTER_ID || "EU-NL-1"'), false);\n    assert.equal(bridgeSource.includes('env.JARVIS_RUNPOD_DATACENTER_ID || ""'), true);\n    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_GPU_TYPE_ID: "NVIDIA L40S"'), true);\n    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_CLOUD_TYPE: "SECURE"'), true);\n});`
);

execFileSync(process.execPath, ["--check", LOCAL_VIDEO_ENGINE], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", FS_BRIDGE], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_RUNTIME_CERT_DYNAMIC_DATACENTER_MATERIALIZED",
  productBaseCommit: PRODUCT_BASE_COMMIT,
  runtimeCertificationOnly: true,
  inferenceAuthorized: false,
  networkVolumeRequired: false,
  defaultDatacenterPinned: false,
  explicitDatacenterStillSupported: true,
  exactGpuTypeId: "NVIDIA L40S",
  exactCloudType: "SECURE",
  providerTrafficUsed: false,
  runpodTrafficUsed: false,
  billableGpuCreated: false,
  newFiles: false,
  newBrains: false
}));
