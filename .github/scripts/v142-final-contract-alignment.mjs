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

function replaceIfPresentOnce(file, before, after, label) {
  let source = sourceOf(file);
  const count = source.split(before).length - 1;
  if (count === 0) return;
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

  replaceIfPresentOnce(
    bridgeFile,
    `                    invocationPayload.requiresIdentityFidelity = false;\n                    invocationPayload.requiresRunpodL40s = true;`,
    `                    invocationPayload.requiresRunpodL40s = true;`,
    "V142_REMOVE_IDENTITY_FIDELITY_BYPASS"
  );
}

function ensureIdentityReferencesStaySeparate() {
  const engineFile = "jarvis-local-video-engine.js";

  replaceExactOnce(
    engineFile,
    `        if (references.length > Number(model.maximumReferenceAssets || 0)) {`,
    `        if (!requiresIdentityFidelity && references.length > Number(model.maximumReferenceAssets || 0)) {`,
    "V142_IDENTITY_REFERENCES_SKIP_SHEET"
  );

  replaceExactOnce(
    engineFile,
    `            audioFile: audioReference?.file || null,\n            referencePreparation,\n            executionTarget:`,
    `            audioFile: audioReference?.file || null,\n            referencePreparation,\n            requiresIdentityFidelity,\n            executionTarget:`,
    "V142_JOB_PERSISTS_IDENTITY_REQUIREMENT"
  );

  replaceExactOnce(
    engineFile,
    `            sourceReferenceAssetCount: sourceReferences.length,\n            referencePreparation,\n            createdAt:`,
    `            sourceReferenceAssetCount: sourceReferences.length,\n            referencePreparation,\n            requiresIdentityFidelity: job.requiresIdentityFidelity === true,\n            createdAt:`,
    "V142_OPERATION_PERSISTS_IDENTITY_REQUIREMENT"
  );
}

function ensureIdentityRuntimeCandidatePinned() {
  const engineFile = "jarvis-local-video-engine.js";
  const candidateMarker = "const RUNPOD_HUMO_IDENTITY_CANDIDATE = Object.freeze({";
  if (!sourceOf(engineFile).includes(candidateMarker)) {
    replaceExactOnce(
      engineFile,
      `const UNSUPPORTED_LOCAL_VIDEO_MODEL_PROFILE = Object.freeze({`,
      `const RUNPOD_HUMO_IDENTITY_CANDIDATE = Object.freeze({\n    id: "humo-1.7b-identity",\n    role: "identity_fidelity_candidate",\n    sourceRepository: "Phantom-video/HuMo",\n    sourceRevision: "845f44736e21be93aa5d8cf406b6eb01af9bff67",\n    modelRepository: "bytedance-research/HuMo",\n    modelRevision: "3a4a1610d399a5cbb932d54dc229944029803ff7",\n    checkpoint: Object.freeze({\n        path: "HuMo-1.7B/ema.pth",\n        bytes: 7037053233,\n        sha256: "04126194caa9820c7294c95e321739575491693f2e97f2f1205cd469cd321332"\n    }),\n    zeroVae: Object.freeze({\n        path: "zero_vae_129frame.pt",\n        sha256: "c458d9ea111ea1107a576183cc291daa78fffacbe280967c0a0807fed9200830"\n    }),\n    wan21Vae: Object.freeze({\n        path: "Wan2.1_VAE.pth",\n        sha256: "38071ab59bd94681c686fa51d75a1968f64e470262043be31f7a094e442fd981"\n    }),\n    sharedTextEncoderAuthority: "RUNPOD_WAN22_CACHE_BASE.requiredFiles",\n    reuseExistingWan22TextEncoderAuthority: true,\n    officialRuntime: Object.freeze({\n        python: "3.11",\n        torch: "2.5.1",\n        torchCuda: "12.4",\n        flashAttention: "2.6.3"\n    }),\n    targetGpuTypeId: "NVIDIA L40S",\n    candidatePortrait: Object.freeze({\n        width: 480,\n        height: 832,\n        fps: 25,\n        frames: 97\n    }),\n    physicalRuntimeCertified: false,\n    physicalPortraitCertified: false,\n    paidExecutionAuthorized: false\n});\n\nconst UNSUPPORTED_LOCAL_VIDEO_MODEL_PROFILE = Object.freeze({`,
      "V142_PIN_HUMO_IDENTITY_CANDIDATE"
    );
  }

  replaceExactOnce(
    engineFile,
    `    if (requiresIdentityFidelity && referenceCount > 0) {\n        return "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED";\n    }`,
    `    if (requiresIdentityFidelity && referenceCount > 0) {\n        if (\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true ||\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalPortraitCertified !== true ||\n            RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true\n        ) {\n            return "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED";\n        }\n    }`,
    "V142_IDENTITY_CANDIDATE_REMAINS_FAIL_CLOSED"
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

  appendOnce(
    testFile,
    "V142 identity references remain separate until a certified identity runtime consumes them",
    `test("V142 identity references remain separate until a certified identity runtime consumes them", () => {\n    const source = fs.readFileSync(\n        new URL("../jarvis-local-video-engine.js", import.meta.url),\n        "utf8"\n    );\n    assert.match(\n        source,\n        /if \\(!requiresIdentityFidelity && references\\.length > Number\\(model\\.maximumReferenceAssets \\|\\| 0\\)\\)/\n    );\n    assert.match(source, /referencePreparation,\\n\\s+requiresIdentityFidelity,\\n\\s+executionTarget:/);\n    assert.match(\n        source,\n        /requiresIdentityFidelity: job\\.requiresIdentityFidelity === true/\n    );\n});`
  );

  appendOnce(
    testFile,
    "V142 HuMo identity candidate is pinned and cannot authorize paid execution",
    `test("V142 HuMo identity candidate is pinned and cannot authorize paid execution", () => {\n    const source = fs.readFileSync(\n        new URL("../jarvis-local-video-engine.js", import.meta.url),\n        "utf8"\n    );\n    const start = source.indexOf("const RUNPOD_HUMO_IDENTITY_CANDIDATE = Object.freeze({");\n    const end = source.indexOf("const UNSUPPORTED_LOCAL_VIDEO_MODEL_PROFILE", start);\n    assert.ok(start >= 0 && end > start);\n    const candidate = source.slice(start, end);\n    assert.match(candidate, /sourceRevision: "845f44736e21be93aa5d8cf406b6eb01af9bff67"/);\n    assert.match(candidate, /modelRevision: "3a4a1610d399a5cbb932d54dc229944029803ff7"/);\n    assert.match(candidate, /bytes: 7037053233/);\n    assert.match(candidate, /04126194caa9820c7294c95e321739575491693f2e97f2f1205cd469cd321332/);\n    assert.match(candidate, /c458d9ea111ea1107a576183cc291daa78fffacbe280967c0a0807fed9200830/);\n    assert.match(candidate, /38071ab59bd94681c686fa51d75a1968f64e470262043be31f7a094e442fd981/);\n    assert.match(candidate, /sharedTextEncoderAuthority: "RUNPOD_WAN22_CACHE_BASE\\.requiredFiles"/);\n    assert.match(candidate, /reuseExistingWan22TextEncoderAuthority: true/);\n    assert.equal((source.match(/models_t5_umt5-xxl-enc-bf16\\.pth/g) || []).length, 1);\n    assert.match(candidate, /width: 480/);\n    assert.match(candidate, /height: 832/);\n    assert.match(candidate, /physicalRuntimeCertified: false/);\n    assert.match(candidate, /physicalPortraitCertified: false/);\n    assert.match(candidate, /paidExecutionAuthorized: false/);\n    assert.match(\n        source,\n        /RUNPOD_HUMO_IDENTITY_CANDIDATE\\.paidExecutionAuthorized !== true/\n    );\n});`
  );
}

assertMaterializedV142Authority();
ensureIdentityFidelityCannotBeBypassed();
ensureIdentityReferencesStaySeparate();
ensureIdentityRuntimeCandidatePinned();
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
    "maximumSourceReferenceAssets: 3",
    "!requiresIdentityFidelity && references.length > Number(model.maximumReferenceAssets || 0)",
    "requiresIdentityFidelity: job.requiresIdentityFidelity === true",
    "RUNPOD_HUMO_IDENTITY_CANDIDATE",
    'sourceRevision: "845f44736e21be93aa5d8cf406b6eb01af9bff67"',
    'modelRevision: "3a4a1610d399a5cbb932d54dc229944029803ff7"',
    'sharedTextEncoderAuthority: "RUNPOD_WAN22_CACHE_BASE.requiredFiles"',
    "reuseExistingWan22TextEncoderAuthority: true",
    "physicalRuntimeCertified: false",
    "physicalPortraitCertified: false",
    "paidExecutionAuthorized: false"
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
  identityReferencesRemainSeparate: true,
  identityRuntimeCandidate: "humo-1.7b-identity",
  identityRuntimePinned: true,
  identityRuntimeReusesWan22TextEncoderAuthority: true,
  identityRuntimePhysicallyCertified: false,
  identityRuntimePaidExecutionAuthorized: false,
  identitySpendBlockedUntilCertifiedBackend: true,
  externalFallbackAllowedForVideoGenerate: false,
  paidSpendGuardedByExistingRunpodAuthority: true,
  newFiles: false,
  newBrains: false
}));
