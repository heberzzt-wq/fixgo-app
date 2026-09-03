import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const SOURCE_COMMIT = "3146353779869dabcce1323c90c2e71ecb3a4f20";
const MATERIALIZER_PATH = ".github/scripts/v142-final-contract-alignment.mjs";
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

function replaceFileExactCount(file, before, after, expectedCount, label) {
  const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (source.includes(after) && !source.includes(before)) return;
  const count = source.split(before).length - 1;
  if (count !== expectedCount) throw new Error(`${label}_MATCH_COUNT_${count}`);
  fs.writeFileSync(file, source.split(before).join(after), "utf8");
}

function appendFileOnce(file, marker, addition) {
  const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (source.includes(marker)) return;
  fs.writeFileSync(file, `${source.trimEnd()}\n\n${addition.trim()}\n`, "utf8");
}

let source = execFileSync(
  "git",
  ["show", `${SOURCE_COMMIT}:${MATERIALIZER_PATH}`],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
).replace(/\r\n/g, "\n");

source = replaceExactOnce(
  source,
  String.raw`            "if test \"$RUNTIME_CERTIFICATION_ONLY\" = 1; then",`,
  String.raw`            "if test \\"$RUNTIME_CERTIFICATION_ONLY\\" = 1; then",`,
  "V142_HUMO_CERTIFICATION_SHELL_QUOTES"
);

source = replaceExactOnce(
  source,
  String.raw`            "  \"$VENV/bin/hf\" download Wan-AI/Wan2.1-T2V-1.3B --local-dir \"$WAN21_WEIGHTS\"",`,
  String.raw`            "  \\"$VENV/bin/hf\\" download Wan-AI/Wan2.1-T2V-1.3B --local-dir \\"$WAN21_WEIGHTS\\"",`,
  "V142_HUMO_WAN21_SHELL_QUOTES"
);

const materialized = spawnSync(process.execPath, ["--input-type=module", "-"], {
  cwd: process.cwd(),
  input: source,
  encoding: "utf8",
  stdio: ["pipe", "inherit", "inherit"]
});
if (materialized.error) throw materialized.error;
if (materialized.status !== 0) {
  throw new Error(`V142_HUMO_SOURCE_MATERIALIZER_EXIT_${materialized.status}`);
}

replaceFileExactOnce(
  LOCAL_VIDEO_ENGINE,
  `            vramObserved: Number(health.vramBytes || 0) >= HUMO_IDENTITY_PROBE.minimumVramGb * RUNPOD_GIB`,
  `            vramObserved: Number(health.vramBytes || 0) >= 44 * RUNPOD_GIB`,
  "V142_HUMO_L40S_PHYSICAL_VRAM_PREDICATE"
);

replaceFileExactOnce(
  LOCAL_VIDEO_ENGINE,
  `            "MAX_JOBS=4 \\\"$VENV/bin/python\\\" -m pip install flash_attn==2.6.3 ",`,
  `            "MAX_JOBS=4 \\\"$VENV/bin/python\\\" -m pip install flash_attn==2.6.3 --no-build-isolation",`,
  "V142_HUMO_FLASH_ATTN_NO_BUILD_ISOLATION"
);

replaceFileExactCount(
  LOCAL_VIDEO_ENGINE,
  `return { ok: true, done: false, status: "RUNPOD_WAN22_BOOTSTRAPPING", remoteWorker: runpodPublicWorker(state) };`,
  `return { ok: true, done: false, status: state.runtimeKind === "humo" ? "RUNPOD_HUMO_BOOTSTRAPPING" : "RUNPOD_WAN22_BOOTSTRAPPING", remoteWorker: runpodPublicWorker(state) };`,
  2,
  "V142_HUMO_BOOTSTRAP_STATUS"
);

replaceFileExactOnce(
  LOCAL_VIDEO_ENGINE,
  `                            status: "RUNPOD_WAN22_BOOTSTRAP_REFRESH_REQUIRED",`,
  `                            status: state.runtimeKind === "humo"\n                                ? "RUNPOD_HUMO_BOOTSTRAP_REFRESH_REQUIRED"\n                                : "RUNPOD_WAN22_BOOTSTRAP_REFRESH_REQUIRED",`,
  "V142_HUMO_BOOTSTRAP_REFRESH_STATUS"
);

replaceFileExactOnce(
  LOCAL_VIDEO_ENGINE,
  `            const failurePhase = failureStatus === "RUNPOD_WAN22_RUNTIME_PREFLIGHT_FAILED"\n                ? "RUNTIME_PREFLIGHT_FAILED"`,
  `            const failurePhase = [\n                "RUNPOD_WAN22_RUNTIME_PREFLIGHT_FAILED",\n                "RUNPOD_HUMO_RUNTIME_PREFLIGHT_FAILED"\n            ].includes(failureStatus)\n                ? "RUNTIME_PREFLIGHT_FAILED"`,
  "V142_HUMO_RUNTIME_PREFLIGHT_FAILURE_PHASE"
);

replaceFileExactOnce(
  LOCAL_VIDEO_TEST,
  `        assert.equal(engineSource.includes('if (configuredBackend !== WAN22_TI2V_5B.backend) throw new Error("RUNPOD_WAN22_BACKEND_REQUIRED")'), true);`,
  [
    `        assert.equal(engineSource.includes("function remoteHuMoLifecycleContract("), true);`,
    `        assert.equal(engineSource.includes("RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED"), true);`
  ].join("\n"),
  "V142_HUMO_PRECHECK_REGRESSION_ARCHITECTURE"
);

replaceFileExactOnce(
  LOCAL_VIDEO_TEST,
  `            const expectedDigest = String(url).includes("/library/ubuntu/")\n                ? RUNPOD_CPU_STAGING_PROFILE.expectedRegistryDigest\n                : gpuImageProfile.expectedRegistryDigest;`,
  `            const expectedDigest = String(url).includes("/library/ubuntu/")\n                ? RUNPOD_CPU_STAGING_PROFILE.expectedRegistryDigest\n                : String(url).includes("2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04")\n                    ? "sha256:61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5"\n                    : gpuImageProfile.expectedRegistryDigest;`,
  "V142_HUMO_MOCK_REGISTRY_DIGEST"
);

replaceFileExactOnce(
  LOCAL_VIDEO_TEST,
  `        if (command.includes("python3 -c")) {`,
  `        if (\n            (\n                command.includes("python3 -c") ||\n                command.includes("'python3' -c") ||\n                command.includes("/bin/python' -c")\n            ) &&\n            command.includes("torch")\n        ) {`,
  "V142_HUMO_MOCK_HEALTH_COMMAND"
);

replaceFileExactOnce(
  FS_BRIDGE,
  `const RUNTIME_CONTRACT_FILE =\n    "jarvis-runtime-contract.json";`,
  `const RUNTIME_CONTRACT_FILE =\n    "jarvis-runtime-contract.json";\n\nexport function resolveRunpodCredentialEnvironment({\n    env = process.env,\n    platform = process.platform,\n    homeDir = os.homedir(),\n    existsSync = fs.existsSync,\n    execFileSyncImpl = execFileSync\n} = {}) {\n    const resolvedEnv = { ...env };\n    if (String(resolvedEnv.RUNPOD_API_KEY || "").trim()) {\n        return { env: resolvedEnv, credentialLoaded: true, credentialSource: "environment" };\n    }\n    if (platform !== "win32") {\n        return { env: resolvedEnv, credentialLoaded: false, credentialSource: null };\n    }\n    const localAppData = String(\n        resolvedEnv.LOCALAPPDATA || path.join(homeDir, "AppData", "Local")\n    ).trim();\n    const credentialFile = path.join(\n        localAppData,\n        "PeninsulaTech",\n        "Jarvis",\n        "runpod-api-key.clixml"\n    );\n    if (!existsSync(credentialFile)) {\n        return { env: resolvedEnv, credentialLoaded: false, credentialSource: null };\n    }\n    const script = [\n        "$secure = Import-Clixml -LiteralPath $env:JARVIS_RUNPOD_CREDENTIAL_FILE",\n        "$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)",\n        "try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)) } finally { if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) } }"\n    ].join("; ");\n    try {\n        const credential = String(execFileSyncImpl(\n            "powershell.exe",\n            ["-NoProfile", "-NonInteractive", "-Command", script],\n            {\n                encoding: "utf8",\n                windowsHide: true,\n                maxBuffer: 1024 * 1024,\n                env: {\n                    ...resolvedEnv,\n                    JARVIS_RUNPOD_CREDENTIAL_FILE: credentialFile\n                }\n            }\n        ) || "").trim();\n        if (credential.length < 20 || /[\\r\\n]/.test(credential)) {\n            return {\n                env: resolvedEnv,\n                credentialLoaded: false,\n                credentialSource: null,\n                credentialError: "RUNPOD_PERSISTED_CREDENTIAL_INVALID"\n            };\n        }\n        resolvedEnv.RUNPOD_API_KEY = credential;\n        return {\n            env: resolvedEnv,\n            credentialLoaded: true,\n            credentialSource: "windows-dpapi-clixml"\n        };\n    }\n    catch {\n        return {\n            env: resolvedEnv,\n            credentialLoaded: false,\n            credentialSource: null,\n            credentialError: "RUNPOD_PERSISTED_CREDENTIAL_UNAVAILABLE"\n        };\n    }\n}`,
  "V142_RUNPOD_DPAPI_CREDENTIAL_RESOLVER"
);

replaceFileExactOnce(
  FS_BRIDGE,
  `    const runpodEnabled = String(process.env.JARVIS_REMOTE_GPU_PROVIDER || "")\n        .trim().toLowerCase() === "runpod";\n    const runpod = runpodEnabled\n        ? createRunpodRemoteVideoAdapter({\n            root,\n            env: process.env,\n            inspectBridgeIdentity: () => describeJarvisBridgeIdentity(root)\n        })\n        : null;`,
  `    const runpodEnabled = String(process.env.JARVIS_REMOTE_GPU_PROVIDER || "")\n        .trim().toLowerCase() === "runpod";\n    const runpodCredential = runpodEnabled\n        ? resolveRunpodCredentialEnvironment({ env: process.env })\n        : { env: process.env, credentialLoaded: false, credentialSource: null };\n    const runpod = runpodEnabled\n        ? createRunpodRemoteVideoAdapter({\n            root,\n            env: runpodCredential.env,\n            inspectBridgeIdentity: () => describeJarvisBridgeIdentity(root)\n        })\n        : null;`,
  "V142_RUNPOD_DPAPI_ADAPTER_ENV"
);

appendFileOnce(
  LOCAL_VIDEO_TEST,
  "V142 HuMo mocked runtime certification provisions polls and releases without inference",
  String.raw`
test("V142 HuMo mocked runtime certification provisions polls and releases without inference", async () => {
    const humoSourceRevision = "845f44736e21be93aa5d8cf406b6eb01af9bff67";
    const physicalL40sBytes = 46068 * 1024 ** 2;
    const harness = runpodPhysicalHarness({
        scenario: "humo-runtime-certification",
        envOverrides: {
            JARVIS_LOCAL_VIDEO_MODEL: "humo",
            JARVIS_RUNPOD_CLOUD_TYPE: "SECURE",
            JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true",
            JARVIS_RUNPOD_DATACENTER_ID: "EU-NL-1"
        },
        baseHealthOverrides: {
            operatingSystem: "ubuntu-22.04",
            pythonVersion: "3.11.9",
            torchVersion: "2.4.0+cu124",
            torchCudaVersion: "12.4",
            cudaImageVersion: "12.4.1",
            cuda: true,
            gpuName: "NVIDIA L40S",
            computeCapability: "8.9",
            vramGb: physicalL40sBytes / 1024 ** 3,
            vramBytes: physicalL40sBytes,
            freeDiskGb: 100,
            ffmpeg: true,
            ffprobe: true
        },
        runtimeHealthOverrides: {
            operatingSystem: "ubuntu-22.04",
            pythonVersion: "3.11.9",
            torchVersion: "2.5.1+cu124",
            torchCudaVersion: "12.4",
            cudaImageVersion: "12.4.1",
            cuda: true,
            gpuName: "NVIDIA L40S",
            computeCapability: "8.9",
            vramGb: physicalL40sBytes / 1024 ** 3,
            vramBytes: physicalL40sBytes,
            freeDiskGb: 100,
            ffmpeg: true,
            ffprobe: true,
            runner: true,
            humoRepository: true,
            weights: false,
            wan21: false,
            whisper: false,
            separator: false,
            dependencyContract: true,
            pipCheck: true,
            flashAttentionVersion: "2.6.3",
            sourceRevision: humoSourceRevision
        }
    });
    const job = {
        ...harness.dryRunJob,
        backend: "humo-1.7b-identity",
        model: "HuMo-1.7B",
        output: ".jarvis-artifacts/videos/humo-runtime-certification.mp4",
        referenceOutputs: [],
        referenceFiles: [],
        sourceReferenceOutputs: [],
        sourceReferenceFiles: []
    };
    const resultFile = path.join(harness.root, "humo-runtime-certification-result.json");

    const launched = await harness.adapter.launch({ job });
    assert.equal(launched.remoteWorker.provider, "runpod");
    assert.equal(launched.remoteWorker.podId, "pod-l40s-v142");
    assert.equal(harness.createdBody.imageName, "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04");
    assert.equal(harness.createdBody.cloudType, "SECURE");
    assert.deepEqual(harness.createdBody.dataCenterIds, ["EU-NL-1"]);
    assert.deepEqual(harness.createdBody.gpuTypeIds, ["NVIDIA L40S"]);
    assert.equal("networkVolumeId" in harness.createdBody, false);
    assert.equal(harness.createdBody.volumeInGb, 100);

    let certified = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        certified = await harness.adapter.poll({ operation: job, resultFile });
        if (certified.done === true) break;
    }
    assert.equal(certified?.ok, true, JSON.stringify(certified));
    assert.equal(certified?.done, true, JSON.stringify(certified));
    assert.equal(certified?.status, "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED");
    assert.equal(harness.bootstrapStarts, 1);
    assert.equal(harness.inferenceStarts, 0);
    const physicalReceipt = JSON.parse(fs.readFileSync(resultFile, "utf8"));
    assert.equal(physicalReceipt.runtimeCertificationOnly, true);
    assert.equal(physicalReceipt.runtimePreflightVerified, true);
    assert.equal(physicalReceipt.physicalRuntimeCertified, true);
    assert.equal(physicalReceipt.inferenceStarted, false);
    assert.equal(physicalReceipt.gpuTypeId, "NVIDIA L40S");
    assert.equal(physicalReceipt.vramBytes, physicalL40sBytes);
    assert.equal(physicalReceipt.pythonVersion.startsWith("3.11."), true);
    assert.equal(physicalReceipt.torchVersion.startsWith("2.5.1"), true);
    assert.equal(physicalReceipt.torchCudaVersion.startsWith("12.4"), true);
    assert.equal(physicalReceipt.flashAttentionVersion, "2.6.3");
    assert.equal(physicalReceipt.sourceRevision, humoSourceRevision);

    const released = await harness.adapter.release({
        ...job,
        remoteWorker: launched.remoteWorker,
        reason: "runtime_certification_complete"
    });
    assert.equal(released.ok, true, JSON.stringify(released));
    assert.equal(released.terminationVerified, true, JSON.stringify(released));
    assert.equal(harness.deleted, true);
    assert.equal(
        harness.calls.filter(call => call.kind === "http" && call.url?.endsWith("/pods") && call.method === "POST").length,
        1
    );
    assert.equal(
        harness.calls.some(call => call.kind === "ssh" && call.command?.includes("jarvis-local-video-wan22.py") && call.command?.includes("nohup")),
        false
    );
    const persistedState = fs.readFileSync(
        path.join(harness.root, ".jarvis-artifacts", ".video-worker", "runpod", job.operationId + ".json"),
        "utf8"
    );
    assert.equal(persistedState.includes(harness.env.RUNPOD_API_KEY), false);
    assert.equal(persistedState.includes("controlled-private-key"), false);
});`
);

appendFileOnce(
  LOCAL_VIDEO_TEST,
  "V142 HuMo bootstrap and poll diagnostics are backend-aware before paid execution",
  String.raw`
test("V142 HuMo bootstrap and poll diagnostics are backend-aware before paid execution", () => {
    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");
    assert.equal(engineSource.includes("flash_attn==2.6.3 --no-build-isolation"), true);
    assert.equal(engineSource.includes("RUNPOD_HUMO_BOOTSTRAPPING"), true);
    assert.equal(engineSource.includes("RUNPOD_HUMO_BOOTSTRAP_REFRESH_REQUIRED"), true);
    assert.equal(engineSource.includes("RUNPOD_HUMO_RUNTIME_PREFLIGHT_FAILED"), true);
    assert.equal(engineSource.includes("RUNPOD_WAN22_BOOTSTRAPPING"), true);
    assert.equal(engineSource.includes("RUNPOD_WAN22_BOOTSTRAP_REFRESH_REQUIRED"), true);
});`
);

appendFileOnce(
  FS_BRIDGE_TEST,
  "V142 bridge auto-loads persisted RunPod credential only into adapter memory on Windows",
  String.raw`
test("V142 bridge auto-loads persisted RunPod credential only into adapter memory on Windows", () => {
    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.equal(bridgeSource.includes("resolveRunpodCredentialEnvironment"), true);
    assert.equal(bridgeSource.includes("runpod-api-key.clixml"), true);
    assert.equal(bridgeSource.includes("Import-Clixml"), true);
    assert.equal(bridgeSource.includes("SecureStringToBSTR"), true);
    assert.equal(bridgeSource.includes("ZeroFreeBSTR"), true);
    assert.equal(bridgeSource.includes('credentialSource: "windows-dpapi-clixml"'), true);
    assert.equal(bridgeSource.includes("env: runpodCredential.env"), true);
    assert.equal(bridgeSource.includes("process.env.RUNPOD_API_KEY ="), false);
});`
);

execFileSync(process.execPath, ["--check", "jarvis-local-video-engine.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "jarvis-fs-bridge.js"], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_PERSISTED_RUNPOD_CREDENTIAL_HARDENED",
  sourceCommit: SOURCE_COMMIT,
  providerTrafficUsed: false,
  resourceCreationPossible: false,
  mockedLifecycle: ["launch", "poll", "runtime_certification", "release"],
  mockedPhysicalL40sMiB: 46068,
  flashAttentionBuildIsolation: false,
  backendAwareBootstrapStatus: true,
  backendAwareRuntimeFailurePhase: true,
  persistedRunpodCredentialSource: "windows-dpapi-clixml",
  persistedRunpodCredentialProcessOnly: true,
  paidAuthorityDefaultUnchanged: true,
  mockedInferenceStarted: false,
  staleWanOnlyAssertionRemoved: true,
  newFiles: false,
  newBrains: false
}));