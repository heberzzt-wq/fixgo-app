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

function appendOnce(file, marker, addition) {
  let source = sourceOf(file);
  if (source.includes(marker)) return;
  source = `${source.trimEnd()}\n\n${addition.trim()}\n`;
  write(file, source);
}

function assertExistingV142IdentityAuthority() {
  const bridge = sourceOf("jarvis-fs-bridge.js");
  const actuator = sourceOf("gestia-core/jarvis/jarvis.actuator.pack.js");
  const engine = sourceOf("jarvis-local-video-engine.js");
  const runner = sourceOf("scripts/jarvis-local-video-wan22.py");

  const required = [
    [bridge, 'host === "firebasestorage.googleapis.com"', "V142_FIREBASE_VIDEO_IMPORT_ALLOWLIST"],
    [bridge, 'app.post("/video/engine/resolve"', "V142_VIDEO_ENGINE_RESOLVER"],
    [bridge, "requiresRunpodL40s", "V142_RUNPOD_L40S_BRIDGE"],
    [bridge, "RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED", "V142_IDENTITY_BRIDGE_FAIL_CLOSED"],
    [actuator, 'name: "video.generate"', "V142_VIDEO_GENERATE_TOOL"],
    [actuator, "requiresRunpodL40s: true", "V142_RUNPOD_L40S_ACTUATOR"],
    [actuator, "requiresIdentityFidelity: referenceImages.length > 0", "V142_IDENTITY_REQUIREMENT_ACTUATOR"],
    [engine, "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED", "V142_IDENTITY_GATE_ENGINE"],
    [engine, "maximumSourceReferenceAssets: 3", "V142_SOURCE_REFERENCE_CAPACITY"],
    [engine, "!requiresIdentityFidelity && references.length > Number(model.maximumReferenceAssets || 0)", "V142_IDENTITY_REFERENCES_STAY_SEPARATE"],
    [engine, "requiresIdentityFidelity: job.requiresIdentityFidelity === true", "V142_IDENTITY_REQUIREMENT_PERSISTED"],
    [engine, "RUNPOD_HUMO_IDENTITY_CANDIDATE", "V142_HUMO_CANDIDATE"],
    [engine, 'sourceRevision: "845f44736e21be93aa5d8cf406b6eb01af9bff67"', "V142_HUMO_SOURCE_PIN"],
    [engine, 'modelRevision: "3a4a1610d399a5cbb932d54dc229944029803ff7"', "V142_HUMO_MODEL_PIN"],
    [engine, "physicalRuntimeCertified: false", "V142_HUMO_RUNTIME_UNCERTIFIED"],
    [engine, "physicalPortraitCertified: false", "V142_HUMO_PORTRAIT_UNCERTIFIED"],
    [engine, "paidExecutionAuthorized: false", "V142_HUMO_PAID_DENIED"],
    [runner, '"wan22-ti2v-5b"', "V142_WAN22_RUNNER"],
    [runner, "LOCAL_VIDEO_HUMO_EXECUTOR_NOT_IMPLEMENTED", "V142_HUMO_EXECUTOR_FAIL_CLOSED"],
    [runner, "LOCAL_VIDEO_RUNTIME_UNSUPPORTED", "V142_UNKNOWN_RUNTIME_FAIL_CLOSED"]
  ];

  for (const [source, marker, label] of required) {
    if (!source.includes(marker)) throw new Error(`${label}_MISSING`);
  }
  if (bridge.includes("invocationPayload.requiresIdentityFidelity = false")) {
    throw new Error("V142_IDENTITY_FIDELITY_BYPASS_STILL_PRESENT");
  }
}

function ensurePlatformNeutralModelManifestRegression() {
  const testFile = "tests/jarvis-local-video-engine-v142.test.mjs";
  replaceExactOnce(
    testFile,
    `    assert.notEqual(\n        JSON.stringify(observedManifest.files),\n        JSON.stringify(fixtureContract.requiredFiles),\n        "property order may differ without changing the observed evidence"\n    );`,
    `    assert.deepEqual(\n        observedManifest.files.map(item => Object.keys(item).sort()),\n        fixtureContract.requiredFiles.map(item => Object.keys(item).sort()),\n        "serializer property order must not affect the observed evidence schema"\n    );`,
    "V142_MODEL_MANIFEST_PROPERTY_ORDER_PLATFORM_NEUTRAL"
  );
}

function ensureProvisionCleanupFailClosed() {
  const engineFile = "jarvis-local-video-engine.js";
  const testFile = "tests/jarvis-local-video-engine-v142.test.mjs";

  replaceExactOnce(
    engineFile,
    `        catch(error) {\n            if (podId) {\n                try {\n                    await terminatePod(podId, job.operationId, "provision_cleanup");\n                }\n                catch {}\n            }\n            if (error?.providerHttp) {`,
    `        catch(error) {\n            let provisionCleanupError = null;\n            if (podId) {\n                try {\n                    await terminatePod(podId, job.operationId, "provision_cleanup");\n                }\n                catch(cleanupError) {\n                    provisionCleanupError = cleanupError;\n                }\n            }\n            if (provisionCleanupError) {\n                const cleanupFailure = new Error("RUNPOD_PROVISION_CLEANUP_FAILED");\n                cleanupFailure.retryable = false;\n                cleanupFailure.stage = "provision_cleanup";\n                cleanupFailure.podId = podId;\n                cleanupFailure.providerCode = provisionCleanupError?.providerCode || null;\n                cleanupFailure.providerMessage = provisionCleanupError?.providerMessage || null;\n                cleanupFailure.providerHttp = provisionCleanupError?.providerHttp || null;\n                cleanupFailure.remoteWorker = {\n                    provider: "runpod",\n                    podId,\n                    remoteJobId: \`runpod/\${podId}/\${job.operationId}\`,\n                    provisionedAt: now().toISOString(),\n                    operationId: job.operationId,\n                    operationName: job.operationName\n                };\n                error = cleanupFailure;\n            }\n            if (error?.providerHttp) {`,
    "V142_PROVISION_CLEANUP_MUST_PROPAGATE_POD"
  );

  replaceExactOnce(
    engineFile,
    `            catch(error) {\n                const released = await failOperationAndRelease(operationPath, operation, {\n                    state: "FAILED",\n                    status: "LOCAL_VIDEO_RUNNER_START_FAILED",`,
    `            catch(error) {\n                const failedOperation = error?.remoteWorker ? {\n                    ...operation,\n                    remoteWorker: error.remoteWorker,\n                    remoteJobId: error.remoteWorker.remoteJobId || null,\n                    podId: error.remoteWorker.podId || null\n                } : operation;\n                const released = await failOperationAndRelease(operationPath, failedOperation, {\n                    state: "FAILED",\n                    status: "LOCAL_VIDEO_RUNNER_START_FAILED",`,
    "V142_RUNNER_START_FAILURE_MUST_RETAIN_REMOTE_WORKER"
  );

  appendOnce(
    testFile,
    "V142 provision cleanup failure cannot hide a billable Pod",
    `test("V142 provision cleanup failure cannot hide a billable Pod", () => {\n    const source = fs.readFileSync(\n        new URL("../jarvis-local-video-engine.js", import.meta.url),\n        "utf8"\n    );\n    const launchStart = source.indexOf("async function launch({ job })");\n    const pollStart = source.indexOf("async function pollRemote", launchStart);\n    assert.ok(launchStart >= 0 && pollStart > launchStart);\n    const launchSource = source.slice(launchStart, pollStart);\n    assert.match(launchSource, /RUNPOD_PROVISION_CLEANUP_FAILED/);\n    assert.match(launchSource, /cleanupFailure\\.remoteWorker = \\{/);\n    assert.match(launchSource, /remoteJobId: \\`runpod\\/\\$\\{podId\\}\\/\\$\\{job\\.operationId\\}\\`/);\n    assert.doesNotMatch(\n        launchSource,\n        /await terminatePod\\(podId, job\\.operationId, "provision_cleanup"\\);\\r?\\n\\s*}\\r?\\n\\s*catch \\{\\}/\n    );\n\n    const durableStart = source.indexOf("async function launchDurableOperation");\n    const jobStart = source.indexOf("const job = {", durableStart);\n    assert.ok(durableStart >= 0 && jobStart > durableStart);\n    const durableSource = source.slice(durableStart, jobStart);\n    assert.match(durableSource, /error\\?\\.remoteWorker/);\n    assert.match(durableSource, /podId: error\\.remoteWorker\\.podId \\|\\| null/);\n});`
  );
}

assertExistingV142IdentityAuthority();
ensurePlatformNeutralModelManifestRegression();
ensureProvisionCleanupFailClosed();
assertExistingV142IdentityAuthority();

const engine = sourceOf("jarvis-local-video-engine.js");
const testSource = sourceOf("tests/jarvis-local-video-engine-v142.test.mjs");
const postChecks = [
  "RUNPOD_PROVISION_CLEANUP_FAILED",
  "provisionCleanupError",
  "cleanupFailure.remoteWorker",
  "error?.remoteWorker",
  "podId: error.remoteWorker.podId || null"
];
for (const marker of postChecks) {
  if (!engine.includes(marker)) throw new Error(`V142_PROVISION_CLEANUP_AUTHORITY_MISSING:${marker}`);
}
if (!testSource.includes("V142 provision cleanup failure cannot hide a billable Pod")) {
  throw new Error("V142_PROVISION_CLEANUP_REGRESSION_MISSING");
}
if (/await terminatePod\(podId, job\.operationId, "provision_cleanup"\);\n\s*}\n\s*catch \{\}/.test(engine)) {
  throw new Error("V142_PROVISION_CLEANUP_FAILURE_STILL_SWALLOWED");
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_RUNPOD_L40S_IDENTITY_FIDELITY_GUARD_VERIFIED",
  sameSemanticAuthority: true,
  miniDramaTool: "video.generate",
  runpodL40sVideoAuthority: true,
  remoteExecutionRequired: true,
  provider: "runpod",
  gpuTypeId: "NVIDIA L40S",
  genericVideoBackend: "wan22-ti2v-5b",
  identityFidelityRequiredForReferences: true,
  identityReferencesRemainSeparate: true,
  identityRuntimeCandidate: "humo-1.7b-identity",
  identityRuntimePinned: true,
  identityRuntimeReusesWan22TextEncoderAuthority: true,
  identityRuntimePhysicallyCertified: false,
  identityRuntimePaidExecutionAuthorized: false,
  identityRunnerCannotFallThroughToWan: true,
  identitySpendBlockedUntilCertifiedBackend: true,
  provisionCleanupFailureRetainsPodIdentity: true,
  provisionCleanupFailureCannotBeSwallowed: true,
  externalFallbackAllowedForVideoGenerate: false,
  paidSpendGuardedByExistingRunpodAuthority: true,
  newFiles: false,
  newBrains: false
}));
