import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const BASE_MATERIALIZER_COMMIT = "974120fc1b29113045bcee4932a93ae3fed784a6";
const MATERIALIZER_PATH = ".github/scripts/v142-final-contract-alignment.mjs";
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

const baseMaterializer = execFileSync(
  "git",
  ["show", `${BASE_MATERIALIZER_COMMIT}:${MATERIALIZER_PATH}`],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
).replace(/\r\n/g, "\n");

const materialized = spawnSync(process.execPath, ["--input-type=module", "-"], {
  cwd: process.cwd(),
  input: baseMaterializer,
  encoding: "utf8",
  stdio: ["pipe", "inherit", "inherit"]
});
if (materialized.error) throw materialized.error;
if (materialized.status !== 0) {
  throw new Error(`V142_BASE_MATERIALIZER_EXIT_${materialized.status}`);
}

const cliAnchor = [
  "if (",
  "    process.argv[1] &&",
  "    path.resolve(process.argv[1]) === MODULE_FILE",
  ") {",
  "    startJarvisFsBridge();",
  "}"
].join("\n");

const cliImplementation = [
  "export async function runHuMoRuntimeCertificationCli({",
  "    root = DEFAULT_ROOT,",
  "    env = process.env,",
  "    log = value => console.log(JSON.stringify(value))",
  "} = {}) {",
  "    const resolvedRoot = path.resolve(root);",
  "    const paidAuthorized = [\"true\", \"1\", \"yes\", \"on\"].includes(",
  "        String(env.JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED || \"\").trim().toLowerCase()",
  "    );",
  "    if (!paidAuthorized) {",
  "        throw new Error(\"RUNPOD_PAID_RESOURCE_CREATION_NOT_AUTHORIZED\");",
  "    }",
  "    const canonicalSha = String(execFileSync(",
  "        \"git\",",
  "        [\"rev-parse\", \"HEAD\"],",
  "        { cwd: resolvedRoot, encoding: \"utf8\", windowsHide: true }",
  "    )).trim().toLowerCase();",
  "    if (!/^[a-f0-9]{40}$/.test(canonicalSha)) {",
  "        throw new Error(\"RUNPOD_CANONICAL_SHA_REQUIRED\");",
  "    }",
  "    const runtimeEnv = {",
  "        ...env,",
  "        NODE_USE_SYSTEM_CA: \"1\",",
  "        JARVIS_REMOTE_GPU_PROVIDER: \"runpod\",",
  "        JARVIS_VIDEO_ENGINE_POLICY: \"LOCAL_TEST\",",
  "        JARVIS_LOCAL_VIDEO_ENABLED: \"true\",",
  "        JARVIS_LOCAL_VIDEO_EXECUTION_TARGET: \"remote\",",
  "        JARVIS_LOCAL_VIDEO_MODEL: \"humo\",",
  "        JARVIS_LOCAL_VIDEO_RUNNER: \"python\",",
  "        JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT: path.join(",
  "            resolvedRoot, \"scripts\", \"jarvis-local-video-wan22.py\"",
  "        ),",
  "        JARVIS_RUNPOD_GPU_TYPE_ID: \"NVIDIA L40S\",",
  "        JARVIS_RUNPOD_CLOUD_TYPE: \"SECURE\",",
  "        JARVIS_RUNPOD_DATACENTER_ID: String(",
  "            env.JARVIS_RUNPOD_DATACENTER_ID || \"EU-NL-1\"",
  "        ).trim(),",
  "        JARVIS_RUNPOD_CANONICAL_SHA: canonicalSha,",
  "        JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: \"true\",",
  "        JARVIS_REMOTE_GPU_HARD_BUDGET_USD: \"2\",",
  "        JARVIS_REMOTE_GPU_BUDGET_STOP_RATIO: \"0.95\",",
  "        JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: \"1.09\",",
  "        JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: \"true\",",
  "        JARVIS_RUNPOD_EXPECTED_VRAM_GB: \"48\",",
  "        JARVIS_RUNPOD_MIN_RAM_GB: \"62\",",
  "        JARVIS_RUNPOD_MIN_VCPU: \"16\",",
  "        JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: \"1500\",",
  "        JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: \"1800\",",
  "        JARVIS_EXTERNAL_FALLBACK_ENABLED: \"false\"",
  "    };",
  "    delete runtimeEnv.JARVIS_RUNPOD_NETWORK_VOLUME_ID;",
  "    const credential = resolveRunpodCredentialEnvironment({ env: runtimeEnv });",
  "    if (credential.credentialLoaded !== true) {",
  "        throw new Error(credential.credentialError || \"RUNPOD_API_KEY_REQUIRED\");",
  "    }",
  "    const runpod = createRunpodRemoteVideoAdapter({",
  "        root: resolvedRoot,",
  "        env: credential.env,",
  "        inspectBridgeIdentity: () => describeJarvisBridgeIdentity(resolvedRoot)",
  "    });",
  "    const engine = createLocalVideoEngine({",
  "        root: resolvedRoot,",
  "        env: credential.env,",
  "        inspectHardware: runpod.inspectHardware,",
  "        launch: runpod.launch,",
  "        pollRemote: runpod.poll,",
  "        release: runpod.release",
  "    });",
  "    const certificationId = randomUUID();",
  "    const rootInstructionHash = createHash(\"sha256\")",
  "        .update([\"humo-runtime-certification\", canonicalSha, certificationId].join(\"\\n\"))",
  "        .digest(\"hex\");",
  "    let operationName = null;",
  "    let final = null;",
  "    let primaryError = null;",
  "    const deadlineMs = Date.now() + 30 * 60 * 1000;",
  "    try {",
  "        const started = await engine.start({",
  "            selectedBackend: \"humo-1.7b-identity\",",
  "            output: \".jarvis-artifacts/videos/humo-runtime-certification.mp4\",",
  "            missionId: \"MISSION-HUMO-RUNTIME-\" + certificationId,",
  "            objectiveId: \"OBJECTIVE-HUMO-RUNTIME-\" + certificationId,",
  "            obligationId: \"video.runtime-certification:\" + certificationId,",
  "            rootInstructionHash",
  "        });",
  "        operationName = started?.operationName || null;",
  "        if (started?.ok !== true || !operationName) {",
  "            throw new Error(started?.error || started?.status || \"HUMO_RUNTIME_CERTIFICATION_START_FAILED\");",
  "        }",
  "        log({",
  "            ok: true,",
  "            status: \"HUMO_RUNTIME_CERTIFICATION_STARTED\",",
  "            operationName,",
  "            podId: started?.remoteWorker?.podId || started?.podId || null,",
  "            hardBudgetUsd: 2,",
  "            authorizedHourlyRateUsd: 1.09,",
  "            maximumOperationalMinutes: 30,",
  "            runtimeCertificationOnly: true",
  "        });",
  "        while (Date.now() < deadlineMs) {",
  "            const polled = await engine.poll({ operationName });",
  "            log({",
  "                ok: polled?.ok === true,",
  "                status: polled?.status || null,",
  "                done: polled?.done === true,",
  "                podId: polled?.podId || polled?.remoteWorker?.podId || null,",
  "                gpuRentalEstimatedCost: Number(polled?.gpuRentalEstimatedCost || 0)",
  "            });",
  "            if (polled?.done === true) {",
  "                final = polled;",
  "                break;",
  "            }",
  "            await sleepMs(10000);",
  "        }",
  "        if (!final) throw new Error(\"HUMO_RUNTIME_CERTIFICATION_DEADLINE_EXCEEDED\");",
  "        if (",
  "            final.ok !== true ||",
  "            final.status !== \"RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED\" ||",
  "            final.runtimeCertificationOnly !== true ||",
  "            final.runtimePreflightVerified !== true ||",
  "            final.physicalRuntimeCertified !== true ||",
  "            final.inferenceStarted !== false ||",
  "            final.workerRelease?.terminationVerified !== true ||",
  "            Number(final.gpuRentalEstimatedCost || 0) > 2",
  "        ) {",
  "            throw new Error(final.error || final.status || \"HUMO_RUNTIME_CERTIFICATION_INVALID\");",
  "        }",
  "    }",
  "    catch(error) {",
  "        primaryError = error;",
  "    }",
  "    finally {",
  "        if (operationName && (",
  "            final?.workerRelease?.terminationVerified !== true ||",
  "            final?.done !== true",
  "        )) {",
  "            try {",
  "                const last = await engine.poll({ operationName });",
  "                if (last?.done === true && last?.workerRelease?.terminationVerified === true) {",
  "                    final = last;",
  "                }",
  "                else {",
  "                    const cancelled = await engine.cancel({ operationName });",
  "                    if (cancelled?.workerRelease?.terminationVerified !== true) {",
  "                        throw new Error(\"RUNPOD_HUMO_RELEASE_NOT_VERIFIED\");",
  "                    }",
  "                }",
  "            }",
  "            catch(releaseError) {",
  "                primaryError = new Error(",
  "                    (primaryError?.message || \"HUMO_RUNTIME_CERTIFICATION_FAILED\") +",
  "                    \";RELEASE:\" + (releaseError?.message || releaseError)",
  "                );",
  "            }",
  "        }",
  "    }",
  "    if (primaryError) throw primaryError;",
  "    return final;",
  "}",
  "",
  "if (",
  "    process.argv[1] &&",
  "    path.resolve(process.argv[1]) === MODULE_FILE",
  ") {",
  "    if (process.argv.includes(\"--humo-runtime-certification\")) {",
  "        runHuMoRuntimeCertificationCli()",
  "            .then(result => {",
  "                console.log(JSON.stringify({",
  "                    ok: true,",
  "                    status: \"HUMO_RUNTIME_CERTIFICATION_CERTIFIED_AND_RELEASED\",",
  "                    operationName: result.operationName,",
  "                    podId: result.podId || null,",
  "                    physicalRuntimeCertified: result.physicalRuntimeCertified === true,",
  "                    inferenceStarted: result.inferenceStarted === true,",
  "                    terminationVerified: result.workerRelease?.terminationVerified === true,",
  "                    gpuRentalSeconds: Number(result.gpuRentalSeconds || 0),",
  "                    gpuRentalEstimatedCost: Number(result.gpuRentalEstimatedCost || 0)",
  "                }));",
  "            })",
  "            .catch(error => {",
  "                console.error(JSON.stringify({",
  "                    ok: false,",
  "                    status: error?.message || \"HUMO_RUNTIME_CERTIFICATION_FAILED\"",
  "                }));",
  "                process.exitCode = 1;",
  "            });",
  "    }",
  "    else {",
  "        startJarvisFsBridge();",
  "    }",
  "}"
].join("\n");

const currentBridgeSource = fs.readFileSync(FS_BRIDGE, "utf8").replace(/\r\n/g, "\n");
if (currentBridgeSource.includes("runHuMoRuntimeCertificationCli")) {
  replaceFileExactOnce(
    FS_BRIDGE,
    '        JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: "0.99",',
    '        JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: "1.09",',
    "V142_HUMO_AUTHENTICATED_L40S_RATE"
  );
  replaceFileExactOnce(
    FS_BRIDGE,
    '            hardBudgetUsd: 2,\n            maximumOperationalMinutes: 30,',
    '            hardBudgetUsd: 2,\n            authorizedHourlyRateUsd: 1.09,\n            maximumOperationalMinutes: 30,',
    "V142_HUMO_AUTHENTICATED_L40S_RATE_RECEIPT"
  );
}
else {
  replaceFileExactOnce(
    FS_BRIDGE,
    cliAnchor,
    cliImplementation,
    "V142_HUMO_RUNTIME_CERTIFICATION_CLI"
  );
}

appendFileOnce(
  FS_BRIDGE_TEST,
  "V142 HuMo runtime certification CLI is explicit-authority budgeted and cleanup-verified",
  `test("V142 HuMo runtime certification CLI is explicit-authority budgeted and cleanup-verified", () => {\n    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");\n    assert.equal(bridgeSource.includes("runHuMoRuntimeCertificationCli"), true);\n    assert.equal(bridgeSource.includes('process.argv.includes("--humo-runtime-certification")'), true);\n    assert.equal(bridgeSource.includes("RUNPOD_PAID_RESOURCE_CREATION_NOT_AUTHORIZED"), true);\n    assert.equal(bridgeSource.includes('JARVIS_REMOTE_GPU_HARD_BUDGET_USD: "2"'), true);\n    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: "1.09"'), true);\n    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true"'), true);\n    assert.equal(bridgeSource.includes("delete runtimeEnv.JARVIS_RUNPOD_NETWORK_VOLUME_ID"), true);\n    assert.equal(bridgeSource.includes("Date.now() + 30 * 60 * 1000"), true);\n    assert.equal(bridgeSource.includes("await engine.cancel({ operationName })"), true);\n    assert.equal(bridgeSource.includes("workerRelease?.terminationVerified !== true"), true);\n    assert.equal(bridgeSource.includes('final.status !== "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED"'), true);\n});`
);

replaceFileExactOnce(
  FS_BRIDGE_TEST,
  '    assert.equal(bridgeSource.includes(\'JARVIS_REMOTE_GPU_HARD_BUDGET_USD: "2"\'), true);\n    assert.equal(bridgeSource.includes(\'JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true"\'), true);',
  '    assert.equal(bridgeSource.includes(\'JARVIS_REMOTE_GPU_HARD_BUDGET_USD: "2"\'), true);\n    assert.equal(bridgeSource.includes(\'JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: "1.09"\'), true);\n    assert.equal(bridgeSource.includes(\'JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true"\'), true);',
  "V142_HUMO_AUTHENTICATED_L40S_RATE_TEST"
);

execFileSync(process.execPath, ["--check", "jarvis-fs-bridge.js"], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_RUNTIME_CERTIFICATION_CLI_READY",
  baseMaterializerCommit: BASE_MATERIALIZER_COMMIT,
  providerTrafficUsed: false,
  resourceCreationPossible: false,
  command: "node jarvis-fs-bridge.js --humo-runtime-certification",
  persistedCredentialRequired: true,
  explicitPaidAuthorityRequired: true,
  hardBudgetUsd: 2,
  authorizedHourlyRateUsd: 1.09,
  operationalDeadlineMinutes: 30,
  runtimeCertificationOnly: true,
  networkVolumeReuse: false,
  inferenceAuthorized: false,
  cleanupVerifiedRequired: true,
  idempotentExistingCliMigration: true,
  newFiles: false,
  newBrains: false
}));
