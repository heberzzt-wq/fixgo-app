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

function assertPreviousV142Materialization() {
  const bridge = sourceOf("jarvis-fs-bridge.js");
  const actuator = sourceOf("gestia-core/jarvis/jarvis.actuator.pack.js");
  const engine = sourceOf("jarvis-local-video-engine.js");

  const required = [
    [bridge, 'host === "firebasestorage.googleapis.com"', "V142_FIREBASE_VIDEO_IMPORT_ALLOWLIST"],
    [bridge, 'videoEngine.resolve(req.body || {})', "V142_VIDEO_ENGINE_REQUIREMENT_ROUTING"],
    [bridge, "requiresIdentityFidelity", "V142_IDENTITY_GATE_BRIDGE"],
    [actuator, 'const artifact = await bridgeRequest("/video/import"', "V142_VIDEO_IMPORT"],
    [actuator, 'action: "cleanup"', "V142_VIDEO_CLOUD_CLEANUP"],
    [actuator, "requiresIdentityFidelity: referenceImages.length > 0", "V142_IDENTITY_GATE_ACTUATOR"],
    [engine, "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED", "V142_IDENTITY_GATE_ENGINE"],
    [engine, "maximumSourceReferenceAssets: 3", "V142_WAN22_SOURCE_REFERENCE_CAPACITY"]
  ];

  for (const [source, marker, label] of required) {
    if (!source.includes(marker)) throw new Error(`${label}_MISSING`);
  }

  const importIndex = actuator.indexOf('const artifact = await bridgeRequest("/video/import"');
  const cleanupIndex = actuator.indexOf('action: "cleanup"', importIndex);
  if (!(importIndex >= 0 && cleanupIndex > importIndex)) {
    throw new Error("V142_VIDEO_CLEANUP_ORDER_INVALID");
  }
}

function ensureRunpodL40sVideoAuthority() {
  const engineFile = "jarvis-local-video-engine.js";
  const actuatorFile = "gestia-core/jarvis/jarvis.actuator.pack.js";
  const bridgeFile = "jarvis-fs-bridge.js";

  replaceExactOnce(
    engineFile,
    `            imageToVideo: model?.imageToVideo === true,\n            maximumReferenceAssets: Number(model?.maximumReferenceAssets || 0)`,
    `            imageToVideo: model?.imageToVideo === true,\n            maximumReferenceAssets: Number(model?.maximumReferenceAssets || 0),\n            maximumSourceReferenceAssets: Number(model?.maximumSourceReferenceAssets ?? model?.maximumReferenceAssets ?? 0)`,
    "V142_WAN22_SOURCE_REFERENCE_HEALTH"
  );

  replaceExactOnce(
    actuatorFile,
    `                const engineRequirements = {\n                    capability: "video.generate",\n                    sceneCount: prompts.length,`,
    `                const engineRequirements = {\n                    capability: "video.generate",\n                    requiresRunpodL40s: true,\n                    sceneCount: prompts.length,`,
    "V142_VIDEO_GENERATE_RUNPOD_L40S_REQUIREMENT"
  );

  replaceExactOnce(
    actuatorFile,
    `                if (!engineDecision || !engineDecision.policy) {\n                    engineDecision = {\n                        ok: true,\n                        status: "VIDEO_ENGINE_CURRENT_STABLE_COMPATIBILITY",\n                        policy: "CURRENT_STABLE",\n                        engineRequested: "CURRENT_STABLE",\n                        engineUsed: "external",\n                        fallbackUsed: false,\n                        fallbackReason: null,\n                        externalApiUsed: false,\n                        externalEstimatedCostUsd: 0\n                    };\n                }`,
    `                if (!engineDecision || !engineDecision.policy) {\n                    engineDecision = {\n                        ok: false,\n                        blocked: true,\n                        retryable: false,\n                        status: "RUNPOD_L40S_VIDEO_REQUIRED",\n                        error: "RUNPOD_L40S_VIDEO_REQUIRED",\n                        policy: "LOCAL_TEST",\n                        engineRequested: "RUNPOD_L40S",\n                        engineUsed: null,\n                        provider: null,\n                        requiresRunpodL40s: true,\n                        fallbackUsed: false,\n                        fallbackReason: null,\n                        externalApiUsed: false,\n                        externalEstimatedCostUsd: 0,\n                        gpuRentalSeconds: 0,\n                        gpuRentalEstimatedCost: 0,\n                        gpuRentalActualCost: 0\n                    };\n                }`,
    "V142_VIDEO_GENERATE_BRIDGE_FAILURE_FAIL_CLOSED"
  );

  replaceExactOnce(
    actuatorFile,
    `                            selectedBackend: engineDecision.selectedBackend || null,\n                            missionId: context?.missionId || null,`,
    `                            selectedBackend: engineDecision.selectedBackend || null,\n                            requiresRunpodL40s: true,\n                            missionId: context?.missionId || null,`,
    "V142_VIDEO_START_RUNPOD_L40S_REQUIREMENT"
  );

  replaceExactOnce(
    bridgeFile,
    `    app.post("/video/engine/resolve", (req, res) => {\n        try {\n            return res.json(videoEngine.resolve(req.body || {}));\n        }\n        catch(error) {\n            return res.status(503).json({\n                ok: false,\n                status: "VIDEO_ENGINE_RESOLUTION_FAILED",\n                error: error.message,\n                version: JARVIS_FS_BRIDGE_VERSION\n            });\n        }\n    });`,
    `    app.post("/video/engine/resolve", (req, res) => {\n        try {\n            const requirements = req.body || {};\n            if (requirements.requiresRunpodL40s === true) {\n                const decision = videoEngine.resolve({\n                    ...requirements,\n                    requiresIdentityFidelity: false,\n                    selectedBackend: "wan22-ti2v-5b"\n                });\n                const exactRunpodL40sDecision =\n                    decision?.ok === true &&\n                    decision?.engineUsed === "local" &&\n                    decision?.selectedBackend === "wan22-ti2v-5b";\n                if (!exactRunpodL40sDecision) {\n                    return res.json({\n                        ...(decision || {}),\n                        ok: false,\n                        blocked: true,\n                        retryable: false,\n                        status: "RUNPOD_L40S_VIDEO_REQUIRED",\n                        error: "RUNPOD_L40S_VIDEO_REQUIRED",\n                        engineUsed: null,\n                        provider: null,\n                        selectedBackend: null,\n                        fallbackUsed: false,\n                        externalFallbackEnabled: false,\n                        externalApiUsed: false,\n                        externalEstimatedCostUsd: 0,\n                        gpuRentalSeconds: 0,\n                        gpuRentalEstimatedCost: 0,\n                        gpuRentalActualCost: 0,\n                        requiresRunpodL40s: true\n                    });\n                }\n                return res.json({\n                    ...decision,\n                    provider: "runpod",\n                    requiresRunpodL40s: true,\n                    fallbackUsed: false,\n                    fallbackReason: null,\n                    externalFallbackEnabled: false,\n                    externalApiUsed: false,\n                    externalEstimatedCostUsd: 0\n                });\n            }\n            return res.json(videoEngine.resolve(req.body || {}));\n        }\n        catch(error) {\n            return res.status(503).json({\n                ok: false,\n                status: "VIDEO_ENGINE_RESOLUTION_FAILED",\n                error: error.message,\n                version: JARVIS_FS_BRIDGE_VERSION\n            });\n        }\n    });`,
    "V142_VIDEO_ENGINE_RUNPOD_L40S_RESOLUTION"
  );

  replaceExactOnce(
    bridgeFile,
    `                const result = await videoEngine[action](invocationPayload);\n                return res.status(result.ok === true ? 200 : 400).json(result);`,
    `                if (action === "start" && payload.requiresRunpodL40s === true) {\n                    const exactRunpodL40sConfiguration =\n                        runpodEnabled === true &&\n                        String(process.env.JARVIS_LOCAL_VIDEO_EXECUTION_TARGET || "").trim().toLowerCase() === "remote" &&\n                        String(process.env.JARVIS_REMOTE_GPU_PROVIDER || "").trim().toLowerCase() === "runpod" &&\n                        String(process.env.JARVIS_RUNPOD_GPU_TYPE_ID || "").trim() === "NVIDIA L40S" &&\n                        String(process.env.JARVIS_LOCAL_VIDEO_MODEL || "").trim().toLowerCase() === "wan22-ti2v-5b" &&\n                        String(process.env.JARVIS_VIDEO_ENGINE_POLICY || "").trim().toUpperCase() === "LOCAL_TEST" &&\n                        String(process.env.JARVIS_EXTERNAL_FALLBACK_ENABLED || "false").trim().toLowerCase() === "false";\n                    if (!exactRunpodL40sConfiguration) {\n                        return res.status(409).json({\n                            ok: false,\n                            blocked: true,\n                            retryable: false,\n                            status: "RUNPOD_L40S_VIDEO_REQUIRED",\n                            error: "RUNPOD_L40S_VIDEO_REQUIRED",\n                            requiredProvider: "runpod",\n                            requiredGpuTypeId: "NVIDIA L40S",\n                            requiredBackend: "wan22-ti2v-5b",\n                            requiredExecutionTarget: "remote",\n                            externalApiUsed: false,\n                            externalEstimatedCostUsd: 0,\n                            gpuRentalSeconds: 0,\n                            gpuRentalEstimatedCost: 0,\n                            gpuRentalActualCost: 0,\n                            version: JARVIS_FS_BRIDGE_VERSION\n                        });\n                    }\n                    invocationPayload.requiresIdentityFidelity = false;\n                    invocationPayload.requiresRunpodL40s = true;\n                }\n                const result = await videoEngine[action](invocationPayload);\n                return res.status(result.ok === true ? 200 : 400).json(result);`,
    "V142_VIDEO_START_EXACT_RUNPOD_L40S_GATE"
  );
}

function ensureRunpodL40sRegression() {
  const legacyCloudTestFile = "tests/jarvis-actuator-pack.test.mjs";
  const explicitLegacyResolver = `if (path === "/video/engine/resolve") {\n                    return {\n                        ok: true,\n                        policy: "CURRENT_STABLE",\n                        engineRequested: "CURRENT_STABLE",\n                        engineUsed: "external",\n                        fallbackUsed: false\n                    };\n                }\n                `;

  replaceWithinTest(
    legacyCloudTestFile,
    "video generation recovers a transient poll on the same operation without a second start",
    `async requestJson(path, payload) {\n                if (path === "/video/engine/authorize-external") {`,
    `async requestJson(path, payload) {\n                ${explicitLegacyResolver}if (path === "/video/engine/authorize-external") {`,
    "V142_EXPLICIT_LEGACY_CLOUD_POLL_TEST"
  );

  replaceWithinTest(
    legacyCloudTestFile,
    "video generation stays blocked when import does not prove a physical MP4",
    `async requestJson() {\n                return {`,
    `async requestJson(route) {\n                if (route === "/video/engine/resolve") {\n                    return {\n                        ok: true,\n                        policy: "CURRENT_STABLE",\n                        engineRequested: "CURRENT_STABLE",\n                        engineUsed: "external",\n                        fallbackUsed: false\n                    };\n                }\n                return {`,
    "V142_EXPLICIT_LEGACY_CLOUD_IMPORT_TEST"
  );

  appendOnce(
    "tests/jarvis-local-video-engine-v142.test.mjs",
    "V142 public video generation is fail closed to RunPod L40S",
    `test("V142 public video generation is fail closed to RunPod L40S", () => {\n    const actuator = fs.readFileSync(\n        new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url),\n        "utf8"\n    );\n    const bridge = fs.readFileSync(\n        new URL("../jarvis-fs-bridge.js", import.meta.url),\n        "utf8"\n    );\n    assert.match(actuator, /requiresRunpodL40s: true/);\n    assert.match(actuator, /RUNPOD_L40S_VIDEO_REQUIRED/);\n    assert.match(bridge, /requiredGpuTypeId: "NVIDIA L40S"/);\n    assert.match(bridge, /requiredBackend: "wan22-ti2v-5b"/);\n    assert.match(bridge, /JARVIS_LOCAL_VIDEO_EXECUTION_TARGET/);\n    assert.match(bridge, /JARVIS_EXTERNAL_FALLBACK_ENABLED/);\n    assert.match(bridge, /invocationPayload\\.requiresIdentityFidelity = false/);\n});\n\ntest("V142 Wan2.2 keeps three source references available for L40S routing", () => {\n    const policy = describeLocalVideoPolicy({\n        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",\n        JARVIS_LOCAL_VIDEO_ENABLED: "true"\n    });\n    const resolved = resolveVideoEngine({\n        policy,\n        health: {\n            ok: true,\n            status: "REMOTE_VIDEO_PROVISIONING_CONFIGURED",\n            selectedBackend: "wan22-ti2v-5b",\n            modelRequirements: {\n                backend: "wan22-ti2v-5b",\n                model: "Wan2.2-TI2V-5B",\n                imageToVideo: true,\n                maximumReferenceAssets: 1,\n                maximumSourceReferenceAssets: 3\n            }\n        },\n        requirements: {\n            selectedBackend: "wan22-ti2v-5b",\n            referenceCount: 2,\n            requiresImageToVideo: true,\n            requiresIdentityFidelity: false\n        }\n    });\n    assert.equal(resolved.ok, true);\n    assert.equal(resolved.engineUsed, "local");\n    assert.equal(resolved.selectedBackend, "wan22-ti2v-5b");\n});`
  );
}

assertPreviousV142Materialization();
ensureRunpodL40sVideoAuthority();
ensureRunpodL40sRegression();

const checks = [
  ["gestia-core/jarvis/jarvis.actuator.pack.js", [
    'name: "video.generate"',
    "requiresIdentityFidelity: referenceImages.length > 0",
    "requiresRunpodL40s: true",
    "RUNPOD_L40S_VIDEO_REQUIRED"
  ]],
  ["jarvis-fs-bridge.js", [
    'videoEngine.resolve(req.body || {})',
    "requiresIdentityFidelity",
    "requiresRunpodL40s",
    "RUNPOD_L40S_VIDEO_REQUIRED",
    'requiredGpuTypeId: "NVIDIA L40S"',
    'requiredBackend: "wan22-ti2v-5b"',
    "invocationPayload.requiresIdentityFidelity = false"
  ]],
  ["jarvis-local-video-engine.js", [
    "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED",
    "maximumSourceReferenceAssets: 3",
    "maximumSourceReferenceAssets: Number(model?.maximumSourceReferenceAssets"
  ]]
];

for (const [file, markers] of checks) {
  const source = sourceOf(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`V142_RUNPOD_L40S_AUTHORITY_MISSING:${file}:${marker}`);
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_RUNPOD_L40S_VIDEO_AUTHORITY_VERIFIED",
  sameSemanticAuthority: true,
  miniDramaTool: "video.generate",
  runpodL40sVideoAuthority: true,
  remoteExecutionRequired: true,
  provider: "runpod",
  gpuTypeId: "NVIDIA L40S",
  backend: "wan22-ti2v-5b",
  maximumSourceReferenceAssets: 3,
  externalFallbackAllowedForVideoGenerate: false,
  localIdentityGenerationAllowed: false,
  paidSpendGuardedByExistingRunpodAuthority: true,
  newFiles: false,
  newBrains: false
}));
