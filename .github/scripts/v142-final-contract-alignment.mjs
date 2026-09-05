import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PATCH_BASELINE_COMMIT = "20bb9aabff5bcc0f3a1307b70c29b94e16e1a319";
const SELF = ".github/scripts/v142-final-contract-alignment.mjs";
const ENGINE = "jarvis-local-video-engine.js";
const BRIDGE = "jarvis-fs-bridge.js";
const TEST = "tests/jarvis-local-video-engine-v142.test.mjs";

const V142_DURABLE_CHECKPOINT = Object.freeze({
  checkpointVersion: "v142-humo-runtime-20260905.1",
  branch: "v94-media-v4n-negative-claims",
  baselineHead: PATCH_BASELINE_COMMIT,
  certifiedWorkflow: {
    runNumber: 318,
    runId: 33940759294,
    linux: "success",
    fullCi: "success",
    windows: "success",
    materialize: "success",
    deploy: "skipped"
  },
  humo: {
    physicalRuntimeCertified: false,
    inferenceAuthorized: false,
    identityProbeAuthorized: false,
    maximumIdentityCount: 1
  },
  lastPhysicalAttempt: {
    operationName: "local-video/0869375e-8c23-4d97-ab62-e68fb4e49aa1",
    status: "RUNPOD_API_TRANSPORT_FAILED",
    failureStage: "availability",
    providerCode: "UND_ERR_CONNECT_TIMEOUT",
    providerMessageClass: "api.runpod.io:443 connect timeout",
    attempts: 3,
    podId: null,
    billableGpuCreated: false,
    inferenceStarted: false
  },
  expensiveIncidentLesson: {
    probe: 4,
    phase: "HUMO_TORCH",
    observedRuntimeSeconds: 3156.7,
    observedRuntimeHuman: "52m36.7s",
    torchStageObservedHuman: "~46m",
    estimatedRentalUsd: 0.952964,
    inferenceStarted: false,
    terminationVerified: true,
    rule: "No paid HuMo stage may rely only on a long generic timeout."
  },
  guardrails: {
    runtimeCertificationHardBudgetUsd: 0.30,
    engineBudgetStopRatio: 0.95,
    effectiveEngineBudgetStopUsd: 0.285,
    cliOuterEconomicStopRatio: 0.90,
    authorizedHourlyRateUsd: 1.09,
    maximumPaidRuntimeSecondsAtCurrentBudget: 891,
    humoTorchStageTimeoutSeconds: 120,
    persistentVolumeGb: 0,
    networkVolume: false,
    provisionTransportRetry: false,
    readOnlyGraphQlTransportRetries: 3,
    restGetDeleteTransportRetries: 3
  },
  vercel: {
    plan: "hobby",
    deploymentStorageLimitGb: 10,
    previewDeploymentAccumulationDetected: true,
    cleanupPending: true
  },
  nextAction:
    "Materialize and certify read-only GraphQL transport retry plus paid economic deadline, then rerun runtimeCertificationOnly. Do not authorize identity inference until a fresh physical runtime certificate is persisted."
});

const read = file => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const write = (file, source) => fs.writeFileSync(file, source, "utf8");

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

function runPinnedBaseline() {
  const baseline = execFileSync(
    "git",
    ["show", `${PATCH_BASELINE_COMMIT}:${SELF}`],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (!baseline.includes("V142_RUNPOD_IDEMPOTENT_TRANSPORT_TESTS_ALIGNED")) {
    throw new Error("V142_PERSISTENCE_BASELINE_INVALID");
  }
  const temp = path.join(
    os.tmpdir(),
    `fixgo-v142-humo-persistence-${process.pid}-${Date.now()}.mjs`
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

let engine = read(ENGINE);

engine = replaceExactOnce(
  engine,
  [
    '        const idempotentTransportRetry = method === "GET" || method === "DELETE";',
    '        const maximumTransportAttempts = idempotentTransportRetry ? 3 : 1;'
  ].join("\n"),
  [
    '        const readOnlyGraphQlTransportRetry =',
    '            method === "POST" &&',
    '            (stage === "availability" || stage === "placement_inventory");',
    '        const safeTransportRetry =',
    '            method === "GET" ||',
    '            method === "DELETE" ||',
    '            readOnlyGraphQlTransportRetry;',
    '        const maximumTransportAttempts = safeTransportRetry ? 3 : 1;'
  ].join("\n"),
  "V142_READ_ONLY_GRAPHQL_RETRY_POLICY"
);

engine = replaceExactOnce(
  engine,
  '                if (idempotentTransportRetry && transportAttempt < maximumTransportAttempts) {',
  '                if (safeTransportRetry && transportAttempt < maximumTransportAttempts) {',
  "V142_SAFE_TRANSPORT_RETRY_CONDITION"
);

engine = replaceExactOnce(
  engine,
  [
    '                failure.transportRetryPolicy = idempotentTransportRetry',
    '                    ? "IDEMPOTENT_GET_DELETE_MAX_3"',
    '                    : "NON_IDEMPOTENT_NO_RETRY";'
  ].join("\n"),
  [
    '                failure.transportRetryPolicy = readOnlyGraphQlTransportRetry',
    '                    ? "READ_ONLY_GRAPHQL_MAX_3"',
    '                    : safeTransportRetry',
    '                        ? "IDEMPOTENT_GET_DELETE_MAX_3"',
    '                        : "NON_IDEMPOTENT_NO_RETRY";'
  ].join("\n"),
  "V142_SAFE_TRANSPORT_RETRY_RECEIPT"
);

for (const marker of [
  'stage === "availability" || stage === "placement_inventory"',
  '"READ_ONLY_GRAPHQL_MAX_3"',
  '"NON_IDEMPOTENT_NO_RETRY"',
  'stage = "runpod_api"'
]) {
  if (!engine.includes(marker)) {
    throw new Error(`V142_GRAPHQL_RETRY_MARKER_MISSING:${marker}`);
  }
}
write(ENGINE, engine);

let bridge = read(BRIDGE);

bridge = replaceExactOnce(
  bridge,
  [
    '    const certificationHardBudgetUsd = requestedHardBudgetUsd;',
    '    const certificationDeadlineMinutes = 60;'
  ].join("\n"),
  [
    '    const certificationHardBudgetUsd = requestedHardBudgetUsd;',
    '    const certificationAuthorizedHourlyRateUsd = 1.09;',
    '    const certificationOuterStopRatio = 0.90;',
    '    const certificationEconomicDeadlineSeconds = Math.max(',
    '        60,',
    '        Math.min(',
    '            20 * 60,',
    '            Math.floor(',
    '                certificationHardBudgetUsd *',
    '                certificationOuterStopRatio *',
    '                3600 /',
    '                certificationAuthorizedHourlyRateUsd',
    '            )',
    '        )',
    '    );',
    '    const certificationDeadlineMinutes =',
    '        Number((certificationEconomicDeadlineSeconds / 60).toFixed(3));'
  ].join("\n"),
  "V142_RUNTIME_CERT_ECONOMIC_DEADLINE"
);

bridge = replaceExactOnce(
  bridge,
  [
    '        JARVIS_REMOTE_GPU_BUDGET_STOP_RATIO: "0.95",',
    '        JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: "1.09",',
    '        JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true",',
    '        JARVIS_RUNPOD_EXPECTED_VRAM_GB: "48",',
    '        JARVIS_RUNPOD_MIN_RAM_GB: "62",',
    '        JARVIS_RUNPOD_MIN_VCPU: "16",',
    '        JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: "3300",',
    '        JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: "3600",',
    '        JARVIS_EXTERNAL_FALLBACK_ENABLED: "false"'
  ].join("\n"),
  [
    '        JARVIS_REMOTE_GPU_BUDGET_STOP_RATIO: "0.95",',
    '        JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: String(certificationAuthorizedHourlyRateUsd),',
    '        JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true",',
    '        JARVIS_RUNPOD_EXPECTED_VRAM_GB: "48",',
    '        JARVIS_RUNPOD_MIN_RAM_GB: "62",',
    '        JARVIS_RUNPOD_MIN_VCPU: "16",',
    '        JARVIS_HUMO_TORCH_STAGE_TIMEOUT_SECONDS: "120",',
    '        JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: String(certificationEconomicDeadlineSeconds),',
    '        JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: String(certificationEconomicDeadlineSeconds + 120),',
    '        JARVIS_EXTERNAL_FALLBACK_ENABLED: "false"'
  ].join("\n"),
  "V142_RUNTIME_CERT_BOUND_TIMEOUTS"
);

bridge = replaceExactOnce(
  bridge,
  '    const deadlineMs = Date.now() + certificationDeadlineMinutes * 60 * 1000;',
  '    let paidDeadlineMs = null;',
  "V142_RUNTIME_CERT_PAID_DEADLINE_DECLARATION"
);

bridge = replaceExactOnce(
  bridge,
  [
    '            hardBudgetUsd: certificationHardBudgetUsd,',
    '            authorizedHourlyRateUsd: 1.09,',
    '            maximumOperationalMinutes: certificationDeadlineMinutes,',
    '            runtimeCertificationOnly: true'
  ].join("\n"),
  [
    '            hardBudgetUsd: certificationHardBudgetUsd,',
    '            authorizedHourlyRateUsd: certificationAuthorizedHourlyRateUsd,',
    '            maximumOperationalMinutes: certificationDeadlineMinutes,',
    '            maximumPaidRuntimeSeconds: certificationEconomicDeadlineSeconds,',
    '            outerEconomicStopRatio: certificationOuterStopRatio,',
    '            runtimeCertificationOnly: true'
  ].join("\n"),
  "V142_RUNTIME_CERT_START_RECEIPT_BOUNDS"
);

bridge = replaceExactOnce(
  bridge,
  '        const certificationStartedMs = Date.now();\n        while (Date.now() < deadlineMs) {',
  [
    '        const certificationStartedMs = Date.now();',
    '        paidDeadlineMs = certificationStartedMs + certificationEconomicDeadlineSeconds * 1000;',
    '        while (Date.now() < paidDeadlineMs) {'
  ].join("\n"),
  "V142_RUNTIME_CERT_PAID_DEADLINE_START"
);

for (const marker of [
  "certificationEconomicDeadlineSeconds",
  "certificationOuterStopRatio = 0.90",
  'JARVIS_HUMO_TORCH_STAGE_TIMEOUT_SECONDS: "120"',
  "maximumPaidRuntimeSeconds",
  "paidDeadlineMs"
]) {
  if (!bridge.includes(marker)) {
    throw new Error(`V142_RUNTIME_BOUND_MARKER_MISSING:${marker}`);
  }
}
if (bridge.includes("const certificationDeadlineMinutes = 60;")) {
  throw new Error("V142_53_MINUTE_GENERIC_DEADLINE_REGRESSION");
}
write(BRIDGE, bridge);

let tests = read(TEST);

tests = replaceExactOnce(
  tests,
  '    let availabilityTransportFailures = scenario === "availability-transport-once" ? 1 : 0;',
  [
    '    let availabilityTransportFailures = scenario === "availability-transport-once"',
    '        ? 1',
    '        : scenario === "availability-transport-three"',
    '            ? 3',
    '            : scenario === "availability-connect-timeout-twice"',
    '                ? 2',
    '                : 0;'
  ].join("\n"),
  "V142_TEST_GRAPHQL_TRANSPORT_FAILURE_COUNTS"
);

tests = replaceExactOnce(
  tests,
  [
    '            if (availabilityTransportFailures > 0) {',
    '                availabilityTransportFailures -= 1;',
    '                const error = new Error(',
    '                    `UNABLE_TO_VERIFY_LEAF_SIGNATURE credential=${env.RUNPOD_API_KEY} encoded=${encodeURIComponent(env.RUNPOD_API_KEY)}`',
    '                );',
    '                error.code = "UNABLE_TO_VERIFY_LEAF_SIGNATURE";',
    '                throw error;',
    '            }'
  ].join("\n"),
  [
    '            if (availabilityTransportFailures > 0) {',
    '                availabilityTransportFailures -= 1;',
    '                const connectTimeout = scenario === "availability-connect-timeout-twice";',
    '                const error = connectTimeout',
    '                    ? new Error("Connect Timeout Error (controlled GraphQL availability)")',
    '                    : new Error(',
    '                        `UNABLE_TO_VERIFY_LEAF_SIGNATURE credential=${env.RUNPOD_API_KEY} encoded=${encodeURIComponent(env.RUNPOD_API_KEY)}`',
    '                    );',
    '                error.code = connectTimeout',
    '                    ? "UND_ERR_CONNECT_TIMEOUT"',
    '                    : "UNABLE_TO_VERIFY_LEAF_SIGNATURE";',
    '                throw error;',
    '            }'
  ].join("\n"),
  "V142_TEST_GRAPHQL_TRANSPORT_ERROR_KIND"
);

tests = replaceExactOnce(
  tests,
  '    const harness = runpodPhysicalHarness({ scenario: "availability-transport-once" });',
  '    const harness = runpodPhysicalHarness({ scenario: "availability-transport-three" });',
  "V142_TEST_OUTER_PREPROVISION_RETRY_AFTER_INTERNAL_EXHAUSTION"
);

tests = replaceExactOnce(
  tests,
  '                calls.at(-1).providerOperation = "provision";\n                if (scenario === "provision-fail") return mockHttpResponse(503, { error: "controlled" });',
  [
    '                calls.at(-1).providerOperation = "provision";',
    '                if (scenario === "provision-connect-timeout-once") {',
    '                    const error = new Error("Connect Timeout Error (controlled GraphQL provision)");',
    '                    error.code = "UND_ERR_CONNECT_TIMEOUT";',
    '                    throw error;',
    '                }',
    '                if (scenario === "provision-fail") return mockHttpResponse(503, { error: "controlled" });'
  ].join("\n"),
  "V142_TEST_PROVISION_TRANSPORT_TIMEOUT"
);

tests = replaceExactOnce(
  tests,
  [
    '    assert.match(engine, /JARVIS_HUMO_TORCH_STAGE_TIMEOUT_SECONDS/);',
    '    assert.match(engine, /RUNPOD_HUMO_TORCH_STAGE_TIMEOUT/);',
    '    assert.match(engine, /humoTorchStageTimeoutSeconds/);'
  ].join("\n"),
  [
    '    assert.match(engine, /JARVIS_HUMO_TORCH_STAGE_TIMEOUT_SECONDS/);',
    '    assert.match(engine, /RUNPOD_HUMO_TORCH_STAGE_TIMEOUT/);',
    '    assert.match(engine, /humoTorchStageTimeoutSeconds/);',
    '    assert.match(engine, /READ_ONLY_GRAPHQL_MAX_3/);',
    '    assert.match(engine, /stage === "availability" \\|\\| stage === "placement_inventory"/);',
    '    assert.match(bridge, /certificationEconomicDeadlineSeconds/);',
    '    assert.match(bridge, /certificationOuterStopRatio = 0\\.90/);',
    '    assert.match(bridge, /JARVIS_HUMO_TORCH_STAGE_TIMEOUT_SECONDS: "120"/);',
    '    assert.match(bridge, /maximumPaidRuntimeSeconds/);',
    '    assert.equal(bridge.includes("const certificationDeadlineMinutes = 60;"), false);'
  ].join("\n"),
  "V142_TEST_53_MINUTE_INCIDENT_GUARDRAILS"
);

const internalGraphQlRetryTest = String.raw`
test("V142 read-only GraphQL availability absorbs two connect timeouts before any billable provision", async () => {
    const harness = runpodPhysicalHarness({ scenario: "availability-connect-timeout-twice" });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, true, JSON.stringify(started));
    const availabilityCalls = harness.calls.filter(call =>
        call.kind === "http" &&
        call.method === "POST" &&
        call.url.includes("/graphql") &&
        call.providerOperation !== "provision"
    );
    assert.equal(availabilityCalls.length, 3);
    assert.equal(
        harness.calls.filter(call => call.providerOperation === "provision").length,
        1,
        "read-only recovery must still create at most one Pod"
    );
    const cancelled = await harness.engine.cancel({ operationName: started.operationName });
    assert.equal(cancelled.workerRelease?.terminationVerified, true, JSON.stringify(cancelled));
});

test("V142 GraphQL provision connect timeout is never retried automatically", async () => {
    const harness = runpodPhysicalHarness({ scenario: "provision-connect-timeout-once" });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, false, JSON.stringify(started));
    assert.equal(started.error, "RUNPOD_API_TRANSPORT_FAILED");
    assert.equal(started.failureStage, "provision");
    assert.equal(started.providerCode, "UND_ERR_CONNECT_TIMEOUT");
    assert.equal(started.podId, undefined);
    assert.equal(
        harness.calls.filter(call => call.providerOperation === "provision").length,
        1,
        "non-idempotent provisioning must remain single-attempt"
    );
    assert.equal(harness.deleted, false);
});
`;

tests = appendOnce(
  tests,
  'V142 read-only GraphQL availability absorbs two connect timeouts before any billable provision',
  internalGraphQlRetryTest
);

write(TEST, tests);

execFileSync(process.execPath, ["--check", ENGINE], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", BRIDGE], { stdio: "inherit" });

if (fs.existsSync(path.join(process.cwd(), "node_modules"))) {
  execFileSync(
    process.execPath,
    ["--test", "--test-concurrency=1", TEST],
    { stdio: "inherit", maxBuffer: 64 * 1024 * 1024 }
  );
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_LESSONS_PERSISTED_AND_TRANSPORT_HARDENED",
  checkpoint: V142_DURABLE_CHECKPOINT,
  readOnlyGraphQlRetries: 3,
  provisioningRetryAllowed: false,
  cliOuterEconomicStopRatio: 0.90,
  humoTorchStageTimeoutSeconds: 120,
  billableGpuCreated: false,
  newFiles: false,
  newWorkflow: false
}));
