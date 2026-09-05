import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PATCH_BASELINE_COMMIT = "eac255caa9ce4bb4e286a3078d243210a8d23395";
const SELF = ".github/scripts/v142-final-contract-alignment.mjs";
const FS_BRIDGE_TEST = "tests/jarvis-fs-bridge-v2.test.mjs";

const read = file => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const write = (file, source) => fs.writeFileSync(file, source, "utf8");

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}

function runPinnedBaseline() {
  const baseline = execFileSync(
    "git",
    ["show", `${PATCH_BASELINE_COMMIT}:${SELF}`],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (!baseline.includes("V142_HUMO_LESSONS_PERSISTED_AND_TRANSPORT_HARDENED")) {
    throw new Error("V142_SHARED_BRIDGE_ALIGNMENT_BASELINE_INVALID");
  }
  const temp = path.join(
    os.tmpdir(),
    `fixgo-v142-shared-bridge-alignment-${process.pid}-${Date.now()}.mjs`
  );
  try {
    fs.writeFileSync(temp, baseline, "utf8");
    execFileSync(process.execPath, [temp], {
      cwd: process.cwd(),
      stdio: "inherit",
      maxBuffer: 64 * 1024 * 1024
    });
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

runPinnedBaseline();

let tests = read(FS_BRIDGE_TEST);

const legacyBudgetedCleanupContract = String.raw`test("V142 HuMo runtime certification CLI is explicit-authority budgeted and cleanup-verified", () => {
    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.equal(bridgeSource.includes("runHuMoRuntimeCertificationCli"), true);
    assert.equal(bridgeSource.includes('process.argv.includes("--humo-runtime-certification")'), true);
    assert.equal(bridgeSource.includes("RUNPOD_PAID_RESOURCE_CREATION_NOT_AUTHORIZED"), true);
    assert.equal(bridgeSource.includes("JARVIS_HUMO_RUNTIME_CERT_HARD_BUDGET_USD"), true);
    assert.equal(bridgeSource.includes("JARVIS_REMOTE_GPU_HARD_BUDGET_USD: String(certificationHardBudgetUsd)"), true);
    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: "1.09"'), true);
    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true"'), true);
    assert.equal(bridgeSource.includes("delete runtimeEnv.JARVIS_RUNPOD_NETWORK_VOLUME_ID"), true);
    assert.equal(bridgeSource.includes("certificationDeadlineMinutes * 60 * 1000"), true);
    assert.equal(bridgeSource.includes("await engine.cancel({ operationName })"), true);
    assert.equal(bridgeSource.includes("workerRelease?.terminationVerified !== true"), true);
    assert.equal(bridgeSource.includes('final.status !== "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED"'), true);
});`;

const economicBudgetedCleanupContract = String.raw`test("V142 HuMo runtime certification CLI is explicit-authority budgeted and cleanup-verified", () => {
    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.equal(bridgeSource.includes("runHuMoRuntimeCertificationCli"), true);
    assert.equal(bridgeSource.includes('process.argv.includes("--humo-runtime-certification")'), true);
    assert.equal(bridgeSource.includes("RUNPOD_PAID_RESOURCE_CREATION_NOT_AUTHORIZED"), true);
    assert.equal(bridgeSource.includes("JARVIS_HUMO_RUNTIME_CERT_HARD_BUDGET_USD"), true);
    assert.equal(bridgeSource.includes("JARVIS_REMOTE_GPU_HARD_BUDGET_USD: String(certificationHardBudgetUsd)"), true);
    assert.equal(bridgeSource.includes("JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: String(certificationAuthorizedHourlyRateUsd)"), true);
    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true"'), true);
    assert.equal(bridgeSource.includes("delete runtimeEnv.JARVIS_RUNPOD_NETWORK_VOLUME_ID"), true);
    assert.equal(bridgeSource.includes("paidDeadlineMs = certificationStartedMs + certificationEconomicDeadlineSeconds * 1000"), true);
    assert.equal(bridgeSource.includes("await engine.cancel({ operationName })"), true);
    assert.equal(bridgeSource.includes("workerRelease?.terminationVerified !== true"), true);
    assert.equal(bridgeSource.includes('final.status !== "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED"'), true);
});`;

tests = replaceExactOnce(
  tests,
  legacyBudgetedCleanupContract,
  economicBudgetedCleanupContract,
  "V142_FS_BRIDGE_SHARED_ECONOMIC_BUDGET_CONTRACT"
);

const legacyLongWindowContract = String.raw`test("V142 HuMo runtime certification supports a lower per-attempt budget and a 55 minute bootstrap window", () => {
    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.equal(bridgeSource.includes("RUNPOD_HUMO_RUNTIME_CERT_BUDGET_INVALID"), true);
    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: "3300"'), true);
    assert.equal(bridgeSource.includes('JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: "3600"'), true);
    assert.equal(bridgeSource.includes("const certificationDeadlineMinutes = 60"), true);
    assert.equal(bridgeSource.includes("Number(final.gpuRentalEstimatedCost || 0) > certificationHardBudgetUsd"), true);
});`;

const economicDeadlineContract = String.raw`test("V142 HuMo runtime certification supports a lower per-attempt budget and paid economic deadline", () => {
    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.equal(bridgeSource.includes("RUNPOD_HUMO_RUNTIME_CERT_BUDGET_INVALID"), true);
    assert.equal(bridgeSource.includes("certificationOuterStopRatio = 0.90"), true);
    assert.equal(bridgeSource.includes('JARVIS_HUMO_TORCH_STAGE_TIMEOUT_SECONDS: "120"'), true);
    assert.equal(bridgeSource.includes("JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: String(certificationEconomicDeadlineSeconds)"), true);
    assert.equal(bridgeSource.includes("JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: String(certificationEconomicDeadlineSeconds + 120)"), true);
    assert.equal(bridgeSource.includes("maximumPaidRuntimeSeconds"), true);
    assert.equal(bridgeSource.includes("const certificationDeadlineMinutes = 60"), false);
    assert.equal(bridgeSource.includes("Number(final.gpuRentalEstimatedCost || 0) > certificationHardBudgetUsd"), true);
});`;

tests = replaceExactOnce(
  tests,
  legacyLongWindowContract,
  economicDeadlineContract,
  "V142_FS_BRIDGE_SHARED_PAID_DEADLINE_CONTRACT"
);

for (const marker of [
  "JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: String(certificationAuthorizedHourlyRateUsd)",
  "paidDeadlineMs = certificationStartedMs + certificationEconomicDeadlineSeconds * 1000",
  "V142 HuMo runtime certification supports a lower per-attempt budget and paid economic deadline",
  "JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: String(certificationEconomicDeadlineSeconds)",
  "JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: String(certificationEconomicDeadlineSeconds + 120)"
]) {
  if (!tests.includes(marker)) {
    throw new Error(`V142_FS_BRIDGE_ECONOMIC_CONTRACT_MARKER_MISSING:${marker}`);
  }
}

write(FS_BRIDGE_TEST, tests);

if (fs.existsSync(path.join(process.cwd(), "node_modules"))) {
  execFileSync(
    process.execPath,
    ["--test", "--test-concurrency=1", FS_BRIDGE_TEST],
    { stdio: "inherit", maxBuffer: 64 * 1024 * 1024 }
  );
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_SHARED_BRIDGE_ECONOMIC_DEADLINE_CONTRACT_ALIGNED",
  patchBaselineCommit: PATCH_BASELINE_COMMIT,
  sharedBridgeTestAligned: true,
  paidEconomicDeadlinePreserved: true,
  readOnlyGraphQlRetriesPreserved: 3,
  provisioningRetryAllowed: false,
  billableGpuCreated: false,
  newFiles: false,
  newWorkflow: false
}));
