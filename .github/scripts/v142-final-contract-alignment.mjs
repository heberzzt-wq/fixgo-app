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

function replaceWithinTest(file, title, before, after, label) {
  let source = sourceOf(file);
  const marker = `test("${title}"`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${label}_TEST_NOT_FOUND`);
  const next = source.indexOf('\ntest("', start + marker.length);
  const end = next < 0 ? source.length : next;
  let block = source.slice(start, end);
  if (block.includes(after)) return;
  const count = block.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  block = block.replace(before, after);
  source = `${source.slice(0, start)}${block}${source.slice(end)}`;
  write(file, source);
}

function appendOnce(file, marker, addition) {
  let source = sourceOf(file);
  if (source.includes(marker)) return;
  source = `${source.trimEnd()}\n\n${addition.trim()}\n`;
  write(file, source);
}

function assertMaterializedV142Authority() {
  const bridge = sourceOf("jarvis-fs-bridge.js");
  const actuator = sourceOf("gestia-core/jarvis/jarvis.actuator.pack.js");
  const engine = sourceOf("jarvis-local-video-engine.js");
  const runner = sourceOf("scripts/jarvis-local-video-wan22.py");

  const required = [
    [bridge, 'host === "firebasestorage.googleapis.com"', "V142_FIREBASE_VIDEO_IMPORT_ALLOWLIST"],
    [bridge, 'app.post("/video/engine/resolve"', "V142_VIDEO_ENGINE_RESOLVER"],
    [bridge, "requiresRunpodL40s", "V142_RUNPOD_L40S_BRIDGE"],
    [actuator, 'name: "video.generate"', "V142_VIDEO_GENERATE_TOOL"],
    [actuator, "requiresRunpodL40s: true", "V142_RUNPOD_L40S_ACTUATOR"],
    [actuator, "requiresIdentityFidelity: referenceImages.length > 0", "V142_IDENTITY_REQUIREMENT_ACTUATOR"],
    [engine, "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED", "V142_IDENTITY_GATE_ENGINE"],
    [engine, "maximumSourceReferenceAssets: 3", "V142_SOURCE_REFERENCE_CAPACITY"],
    [runner, '"wan22-ti2v-5b"', "V142_WAN22_RUNNER"]
  ];

  for (const [source, marker, label] of required) {
    if (!source.includes(marker)) throw new Error(`${label}_MISSING`);
  }
}

function ensureIdentityFidelityCannotBeBypassed() {
  const bridgeFile = "jarvis-fs-bridge.js";

  replaceExactOnce(
    bridgeFile,
    `                const decision = videoEngine.resolve({\n                    ...requirements,\n                    requiresIdentityFidelity: false,\n                    selectedBackend: "wan22-ti2v-5b"\n                });`,
    `                const identityRequested =\n                    requirements.requiresIdentityFidelity === true ||\n                    Number(requirements.referenceCount || 0) > 0;\n                if (identityRequested) {\n                    return res.json({\n                        ok: false,\n                        blocked: true,\n                        retryable: false,\n                        status: "RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED",\n                        error: "RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED",\n                        engineUsed: null,\n                        provider: null,\n                        selectedBackend: null,\n                        fallbackUsed: false,\n                        externalFallbackEnabled: false,\n                        externalApiUsed: false,\n                        externalEstimatedCostUsd: 0,\n                        gpuRentalSeconds: 0,\n                        gpuRentalEstimatedCost: 0,\n                        gpuRentalActualCost: 0,\n                        requiresRunpodL40s: true,\n                        requiresIdentityFidelity: true,\n                        requiredGpuTypeId: "NVIDIA L40S"\n                    });\n                }\n                const decision = videoEngine.resolve({\n                    ...requirements,\n                    selectedBackend: "wan22-ti2v-5b"\n                });`,
    "V142_RESOLVER_IDENTITY_FIDELITY_FAIL_CLOSED"
  );

  replaceExactOnce(
    bridgeFile,
    `                if (action === "start" && payload.requiresRunpodL40s === true) {\n                    const exactRunpodL40sConfiguration =`,
    `                if (action === "start" && payload.requiresRunpodL40s === true) {\n                    const identityRequested =\n                        Array.isArray(payload.referenceOutputs) &&\n                        payload.referenceOutputs.length > 0;\n                    if (identityRequested) {\n                        return res.status(409).json({\n                            ok: false,\n                            blocked: true,\n                            retryable: false,\n                            status: "RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED",\n                            error: "RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED",\n                            requiredProvider: "runpod",\n                            requiredGpuTypeId: "NVIDIA L40S",\n                            requiredCapability: "identity_fidelity",\n                            externalApiUsed: false,\n                            externalEstimatedCostUsd: 0,\n                            gpuRentalSeconds: 0,\n                            gpuRentalEstimatedCost: 0,\n                            gpuRentalActualCost: 0,\n                            version: JARVIS_FS_BRIDGE_VERSION\n                        });\n                    }\n                    const exactRunpodL40sConfiguration =`,
    "V142_START_IDENTITY_FIDELITY_FAIL_CLOSED"
  );

  replaceExactOnce(
    bridgeFile,
    `                    invocationPayload.requiresIdentityFidelity = false;\n                    invocationPayload.requiresRunpodL40s = true;`,
    `                    invocationPayload.requiresRunpodL40s = true;`,
    "V142_REMOVE_IDENTITY_FIDELITY_BYPASS"
  );
}

function ensureIdentityFidelityRegression() {
  const testFile = "tests/jarvis-local-video-engine-v142.test.mjs";

  replaceWithinTest(
    testFile,
    "V142 public video generation is fail closed to RunPod L40S",
    `    assert.match(bridge, /invocationPayload\\.requiresIdentityFidelity = false/);`,
    `    assert.doesNotMatch(bridge, /invocationPayload\\.requiresIdentityFidelity = false/);\n    assert.match(bridge, /RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED/);`,
    "V142_PUBLIC_L40S_TEST_PRESERVES_IDENTITY"
  );

  appendOnce(
    testFile,
    "V142 referenced L40S video cannot disable identity fidelity",
    `test("V142 referenced L40S video cannot disable identity fidelity", () => {\n    const bridge = fs.readFileSync(\n        new URL("../jarvis-fs-bridge.js", import.meta.url),\n        "utf8"\n    );\n    const resolverStart = bridge.indexOf('app.post("/video/engine/resolve"');\n    const resolverEnd = bridge.indexOf('app.post("/local-ai/capability-report"', resolverStart);\n    const resolver = bridge.slice(resolverStart, resolverEnd);\n    const localStart = bridge.indexOf('["/video/local/start", "start"]');\n    const localEnd = bridge.indexOf('app.post("/video/import"', localStart);\n    const lifecycle = bridge.slice(localStart, localEnd);\n\n    assert.ok(resolverStart >= 0 && resolverEnd > resolverStart);\n    assert.ok(localStart >= 0 && localEnd > localStart);\n    assert.match(resolver, /requirements\\.requiresIdentityFidelity === true/);\n    assert.match(resolver, /Number\\(requirements\\.referenceCount \\|\\| 0\\) > 0/);\n    assert.match(resolver, /RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED/);\n    assert.match(lifecycle, /payload\\.referenceOutputs\\.length > 0/);\n    assert.match(lifecycle, /RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED/);\n    assert.doesNotMatch(bridge, /invocationPayload\\.requiresIdentityFidelity = false/);\n});`
  );
}

assertMaterializedV142Authority();
ensureIdentityFidelityCannotBeBypassed();
ensureIdentityFidelityRegression();

const checks = [
  ["gestia-core/jarvis/jarvis.actuator.pack.js", [
    'name: "video.generate"',
    "requiresRunpodL40s: true",
    "requiresIdentityFidelity: referenceImages.length > 0"
  ]],
  ["jarvis-fs-bridge.js", [
    "requiresRunpodL40s",
    "RUNPOD_L40S_VIDEO_REQUIRED",
    "RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED",
    'requiredGpuTypeId: "NVIDIA L40S"'
  ]],
  ["jarvis-local-video-engine.js", [
    "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED",
    "maximumSourceReferenceAssets: 3"
  ]]
];

for (const [file, markers] of checks) {
  const source = sourceOf(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`V142_L40S_IDENTITY_AUTHORITY_MISSING:${file}:${marker}`);
    }
  }
}

if (sourceOf("jarvis-fs-bridge.js").includes("invocationPayload.requiresIdentityFidelity = false")) {
  throw new Error("V142_IDENTITY_FIDELITY_BYPASS_STILL_PRESENT");
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
  identitySpendBlockedUntilCertifiedBackend: true,
  externalFallbackAllowedForVideoGenerate: false,
  paidSpendGuardedByExistingRunpodAuthority: true,
  newFiles: false,
  newBrains: false
}));
