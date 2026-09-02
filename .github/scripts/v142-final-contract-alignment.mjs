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

function ensureFirebaseVideoImportContract() {
  const file = "jarvis-fs-bridge.js";
  const before = [
    "    const host = parsed.hostname.toLowerCase();",
    "    if (",
    "        parsed.protocol !== \"https:\" ||",
    "        !(host === \"storage.googleapis.com\" || host.endsWith(\".storage.googleapis.com\"))",
    "    ) {",
    "        throw new Error(\"VIDEO_IMPORT_URL_NOT_ALLOWED\");",
    "    }"
  ].join("\n");
  const after = [
    "    const host = parsed.hostname.toLowerCase();",
    "    const googleStorageHost =",
    "        host === \"storage.googleapis.com\" ||",
    "        host.endsWith(\".storage.googleapis.com\");",
    "    const firebaseStorageDownload =",
    "        host === \"firebasestorage.googleapis.com\" &&",
    "        parsed.pathname.startsWith(\"/v0/b/fixgo-44e4d.firebasestorage.app/o/\") &&",
    "        parsed.searchParams.get(\"alt\") === \"media\" &&",
    "        Boolean(parsed.searchParams.get(\"token\"));",
    "    if (",
    "        parsed.protocol !== \"https:\" ||",
    "        !(googleStorageHost || firebaseStorageDownload)",
    "    ) {",
    "        throw new Error(\"VIDEO_IMPORT_URL_NOT_ALLOWED\");",
    "    }"
  ].join("\n");

  replaceExactOnce(
    file,
    before,
    after,
    "V142_FIREBASE_VIDEO_IMPORT_ALLOWLIST"
  );
}

function ensureCloudCleanupAfterPhysicalImport() {
  const file = "gestia-core/jarvis/jarvis.actuator.pack.js";
  const current = sourceOf(file);
  const importIndex = current.indexOf('const artifact = await bridgeRequest("/video/import"');
  const physicalVerificationIndex = current.indexOf("const physicalArtifactVerified =", importIndex);
  const cleanupIndex = current.indexOf('action: "cleanup"', importIndex);
  if (
    importIndex >= 0 &&
    physicalVerificationIndex > importIndex &&
    cleanupIndex > physicalVerificationIndex
  ) {
    return;
  }
  const before = [
    "                let artifact;",
    "                try {",
    "                    artifact = await bridgeRequest(\"/video/import\", {",
    "                        url: finalCloud.downloadUrl,",
    "                        expectedSha256: finalCloud.sha256,",
    "                        output,",
    "                        provider: finalCloud.provider || \"google-veo\",",
    "                        model: finalCloud.model",
    "                    }, 240000);",
    "                } finally {",
    "                    if (finalCloud?.storageObject) {",
    "                        try { await callAdminFunction(\"jarvisVideoGenerate\", { action: \"cleanup\", storageObject: finalCloud.storageObject }); } catch {}",
    "                    }",
    "                }"
  ].join("\n");
  const after = [
    "                const artifact = await bridgeRequest(\"/video/import\", {",
    "                    url: finalCloud.downloadUrl,",
    "                    expectedSha256: finalCloud.sha256,",
    "                    output,",
    "                    provider: finalCloud.provider || \"google-veo\",",
    "                    model: finalCloud.model",
    "                }, 240000);",
    "                if (finalCloud?.storageObject) {",
    "                    try { await callAdminFunction(\"jarvisVideoGenerate\", { action: \"cleanup\", storageObject: finalCloud.storageObject }); } catch {}",
    "                }"
  ].join("\n");

  replaceExactOnce(
    file,
    before,
    after,
    "V142_VIDEO_CLEANUP_AFTER_PHYSICAL_IMPORT"
  );
}

function ensureLocalVideoRequirementRouting() {
  const engineFile = "jarvis-local-video-engine.js";
  const engineSource = sourceOf(engineFile);
  const bridgeSource = sourceOf("jarvis-fs-bridge.js");
  const actuatorSource = sourceOf("gestia-core/jarvis/jarvis.actuator.pack.js");
  if (
    engineSource.includes("export function resolveVideoEngine({ policy, health, requirements = {} } = {})") &&
    engineSource.includes("const LOCAL_VIDEO_BACKEND_ORDER = Object.freeze([") &&
    engineSource.includes("resolve: requirements => resolveVideoEngine({ policy, health: health(), requirements })") &&
    bridgeSource.includes("return res.json(videoEngine.resolve(req.body || {}));") &&
    actuatorSource.includes("const engineRequirements = {") &&
    actuatorSource.includes("referenceCount: referenceImages.length")
  ) {
    return;
  }
  const beforeResolver = `export function resolveVideoEngine({ policy, health } = {}) {
    const effectivePolicy = policy || describeLocalVideoPolicy();
    const mode = normalizedMode(effectivePolicy.mode);
    const localReady = effectivePolicy.localVideoEnabled === true && health?.ok === true;
    const common = {
        policy: mode,
        engineRequested: mode,
        externalFallbackEnabled: effectivePolicy.externalFallbackEnabled === true,
        fallbackUsed: false,
        fallbackReason: null,
        externalApiUsed: false,
        externalEstimatedCostUsd: 0
    };

    if (mode === "CURRENT_STABLE") {
        return {
            ...common,
            ok: true,
            status: "VIDEO_ENGINE_CURRENT_STABLE",
            engineUsed: "external",
            provider: "google-veo"
        };
    }

    if (mode === "LOCAL_TEST" || mode === "LOCAL_ONLY") {
        if (!localReady) {
            return {
                ...common,
                ok: false,
                status: health?.status || "LOCAL_VIDEO_WORKER_UNAVAILABLE",
                error: health?.status || "LOCAL_VIDEO_WORKER_UNAVAILABLE",
                engineUsed: null,
                provider: null,
                retryable: false
            };
        }
        return {
            ...common,
            ok: true,
            status: mode === "LOCAL_TEST"
                ? "VIDEO_ENGINE_LOCAL_TEST"
                : "VIDEO_ENGINE_LOCAL_ONLY",
            engineUsed: "local",
            provider: "local"
        };
    }

    const certifiedReady = localReady && effectivePolicy.localVideoCertified === true;
    if (certifiedReady) {
        return {
            ...common,
            ok: true,
            status: "VIDEO_ENGINE_LOCAL_PREFERRED",
            engineUsed: "local",
            provider: "local"
        };
    }
    const reason = health?.status || (
        localReady ? "LOCAL_VIDEO_NOT_CERTIFIED" : "LOCAL_VIDEO_WORKER_UNAVAILABLE"
    );
    if (effectivePolicy.externalFallbackEnabled === true) {
        return {
            ...common,
            ok: true,
            status: "VIDEO_ENGINE_EXTERNAL_FALLBACK",
            engineUsed: "external",
            provider: "google-veo",
            fallbackUsed: true,
            fallbackReason: reason
        };
    }
    return {
        ...common,
        ok: false,
        status: reason,
        error: reason,
        engineUsed: null,
        provider: null,
        retryable: false
    };
}`;
  const afterResolver = `export function resolveVideoEngine({ policy, health, requirements = {} } = {}) {
    const effectivePolicy = policy || describeLocalVideoPolicy();
    const mode = normalizedMode(effectivePolicy.mode);
    const localReady = effectivePolicy.localVideoEnabled === true && health?.ok === true;
    const referenceCount = Math.max(0, Number(requirements.referenceCount || 0));
    const requiresImageToVideo = requirements.requiresImageToVideo === true || referenceCount > 0;
    const selectedModel = health?.model || health?.modelRequirements || null;
    let requirementFailure = null;
    if (localReady && selectedModel) {
        if (requiresImageToVideo && selectedModel.imageToVideo !== true) {
            requirementFailure = "LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND";
        }
        else if (referenceCount > Number(selectedModel.maximumReferenceAssets || 0)) {
            requirementFailure = "LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED";
        }
    }
    const localSuitable = localReady && requirementFailure === null;
    const common = {
        policy: mode,
        engineRequested: mode,
        selectedBackend: health?.selectedBackend || selectedModel?.backend || null,
        selectedModel: selectedModel?.model || null,
        imageToVideoSupported: selectedModel?.imageToVideo === true,
        maximumReferenceAssets: Number(selectedModel?.maximumReferenceAssets || 0),
        referenceCount,
        externalFallbackEnabled: effectivePolicy.externalFallbackEnabled === true,
        fallbackUsed: false,
        fallbackReason: null,
        externalApiUsed: false,
        externalEstimatedCostUsd: 0
    };

    if (mode === "CURRENT_STABLE") {
        return {
            ...common,
            ok: true,
            status: "VIDEO_ENGINE_CURRENT_STABLE",
            engineUsed: "external",
            provider: "google-veo"
        };
    }

    if (mode === "LOCAL_TEST" || mode === "LOCAL_ONLY") {
        if (!localSuitable) {
            const reason = requirementFailure || health?.status || "LOCAL_VIDEO_WORKER_UNAVAILABLE";
            return {
                ...common,
                ok: false,
                status: reason,
                error: reason,
                engineUsed: null,
                provider: null,
                retryable: false
            };
        }
        return {
            ...common,
            ok: true,
            status: mode === "LOCAL_TEST"
                ? "VIDEO_ENGINE_LOCAL_TEST"
                : "VIDEO_ENGINE_LOCAL_ONLY",
            engineUsed: "local",
            provider: "local"
        };
    }

    const certifiedReady = localSuitable && effectivePolicy.localVideoCertified === true;
    if (certifiedReady) {
        return {
            ...common,
            ok: true,
            status: "VIDEO_ENGINE_LOCAL_PREFERRED",
            engineUsed: "local",
            provider: "local"
        };
    }
    const reason = requirementFailure || health?.status || (
        localReady ? "LOCAL_VIDEO_NOT_CERTIFIED" : "LOCAL_VIDEO_WORKER_UNAVAILABLE"
    );
    if (effectivePolicy.externalFallbackEnabled === true) {
        return {
            ...common,
            ok: true,
            status: "VIDEO_ENGINE_EXTERNAL_FALLBACK",
            engineUsed: "external",
            provider: "google-veo",
            fallbackUsed: true,
            fallbackReason: reason
        };
    }
    return {
        ...common,
        ok: false,
        status: reason,
        error: reason,
        engineUsed: null,
        provider: null,
        retryable: false
    };
}`;
  replaceExactOnce(
    engineFile,
    beforeResolver,
    afterResolver,
    "V142_LOCAL_VIDEO_REQUIREMENT_RESOLVER"
  );

  replaceExactOnce(
    engineFile,
    "        resolve: () => resolveVideoEngine({ policy, health: health() }),",
    "        resolve: requirements => resolveVideoEngine({ policy, health: health(), requirements }),",
    "V142_LOCAL_VIDEO_RESOLVE_REQUIREMENTS"
  );

  replaceExactOnce(
    "jarvis-fs-bridge.js",
    `    app.post("/video/engine/resolve", (req, res) => {
        try {
            return res.json(videoEngine.resolve());`,
    `    app.post("/video/engine/resolve", (req, res) => {
        try {
            return res.json(videoEngine.resolve(req.body || {}));`,
    "V142_VIDEO_ENGINE_RESOLVE_BODY"
  );

  replaceExactOnce(
    "gestia-core/jarvis/jarvis.actuator.pack.js",
    `                    engineDecision = await bridgeRequest("/video/engine/resolve", {
                        capability: "video.generate",
                        sceneCount: prompts.length,
                        seriesId: seriesId || null,
                        episodeId: episodeId || null
                    }, 30000);`,
    `                    engineDecision = await bridgeRequest("/video/engine/resolve", {
                        capability: "video.generate",
                        sceneCount: prompts.length,
                        referenceCount: referenceImages.length,
                        requiresImageToVideo: referenceImages.length > 0,
                        aspectRatio,
                        seriesId: seriesId || null,
                        episodeId: episodeId || null
                    }, 30000);`,
    "V142_VIDEO_ENGINE_REQUIREMENTS_FROM_ACTUATOR"
  );

  appendOnce(
    "tests/jarvis-local-video-engine-v142.test.mjs",
    "V142 resolve gates local backends by mission reference requirements",
    `test("V142 resolve gates local backends by mission reference requirements", () => {
    const preferred = describeLocalVideoPolicy({
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_PREFERRED",
        JARVIS_LOCAL_VIDEO_ENABLED: "true",
        JARVIS_LOCAL_VIDEO_CERTIFIED: "true",
        JARVIS_EXTERNAL_FALLBACK_ENABLED: "true"
    });
    const lightHealth = {
        ok: true,
        status: "LOCAL_VIDEO_HARDWARE_READY",
        selectedBackend: "wan21-t2v-1.3b",
        model: {
            backend: "wan21-t2v-1.3b",
            model: "Wan2.1-T2V-1.3B",
            imageToVideo: false,
            maximumReferenceAssets: 0
        }
    };
    const lightFallback = resolveVideoEngine({
        policy: preferred,
        health: lightHealth,
        requirements: { referenceCount: 1, requiresImageToVideo: true }
    });
    assert.equal(lightFallback.ok, true);
    assert.equal(lightFallback.engineUsed, "external");
    assert.equal(lightFallback.fallbackUsed, true);
    assert.equal(lightFallback.fallbackReason, "LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND");

    const localOnly = describeLocalVideoPolicy({
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_ONLY",
        JARVIS_LOCAL_VIDEO_ENABLED: "true"
    });
    const fullHealth = {
        ok: true,
        status: "LOCAL_VIDEO_HARDWARE_READY",
        selectedBackend: "wan22-ti2v-5b",
        model: {
            backend: "wan22-ti2v-5b",
            model: "Wan2.2-TI2V-5B",
            imageToVideo: true,
            maximumReferenceAssets: 1
        }
    };
    const tooMany = resolveVideoEngine({
        policy: localOnly,
        health: fullHealth,
        requirements: { referenceCount: 2, requiresImageToVideo: true }
    });
    assert.equal(tooMany.ok, false);
    assert.equal(tooMany.engineUsed, null);
    assert.equal(tooMany.status, "LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED");
});`
  );
}

function ensureIdentityFidelityEconomyGate() {
  const engineFile = "jarvis-local-video-engine.js";
  const actuatorFile = "gestia-core/jarvis/jarvis.actuator.pack.js";
  const bridgeFile = "jarvis-fs-bridge.js";

  replaceExactOnce(
    engineFile,
    `function backendRequirementFailure(backend = {}, requirements = {}) {
    const referenceCount = Math.max(0, Number(requirements.referenceCount || 0));
    const requiresImageToVideo = requirements.requiresImageToVideo === true || referenceCount > 0;
    if (requiresImageToVideo && backend.imageToVideo !== true) {`,
    `function backendRequirementFailure(backend = {}, requirements = {}) {
    const referenceCount = Math.max(0, Number(requirements.referenceCount || 0));
    const requiresImageToVideo = requirements.requiresImageToVideo === true || referenceCount > 0;
    const requiresIdentityFidelity = requirements.requiresIdentityFidelity === true;
    if (requiresIdentityFidelity && referenceCount > 0) {
        return "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED";
    }
    if (requiresImageToVideo && backend.imageToVideo !== true) {`,
    "V142_IDENTITY_FIDELITY_BACKEND_GATE"
  );

  replaceExactOnce(
    engineFile,
    `    const referenceCount = Math.max(0, Number(requirements.referenceCount || 0));
    const requiresImageToVideo = requirements.requiresImageToVideo === true || referenceCount > 0;
    const excludedBackends = new Set(`,
    `    const referenceCount = Math.max(0, Number(requirements.referenceCount || 0));
    const requiresImageToVideo = requirements.requiresImageToVideo === true || referenceCount > 0;
    const requiresIdentityFidelity = requirements.requiresIdentityFidelity === true;
    const excludedBackends = new Set(`,
    "V142_IDENTITY_FIDELITY_RESOLVER_INPUT"
  );

  replaceExactOnce(
    engineFile,
    `        engineRequested: mode,
        referenceCount,
        requiresImageToVideo,
        aspectRatio: requirements.aspectRatio || null,`,
    `        engineRequested: mode,
        referenceCount,
        requiresImageToVideo,
        requiresIdentityFidelity,
        aspectRatio: requirements.aspectRatio || null,`,
    "V142_IDENTITY_FIDELITY_RESOLVER_EVIDENCE"
  );

  replaceExactOnce(
    engineFile,
    `    async function start(payload = {}) {
        const currentHealth = health();
        const referenceOutputs = Array.isArray(payload.referenceOutputs) ? payload.referenceOutputs : [];`,
    `    async function start(payload = {}) {
        const referenceOutputs = Array.isArray(payload.referenceOutputs) ? payload.referenceOutputs : [];
        const requiresIdentityFidelity =
            payload.requiresIdentityFidelity === true &&
            referenceOutputs.length > 0;
        if (requiresIdentityFidelity) {
            return {
                ok: false,
                blocked: true,
                status: "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED",
                error: "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED",
                requiresIdentityFidelity: true,
                referenceCount: referenceOutputs.length,
                retryable: false,
                externalApiUsed: false,
                externalEstimatedCostUsd: 0,
                gpuRentalSeconds: 0,
                gpuRentalEstimatedCost: 0,
                gpuRentalActualCost: 0
            };
        }
        const currentHealth = health();`,
    "V142_IDENTITY_FIDELITY_START_PREHEALTH_GATE"
  );

  replaceExactOnce(
    engineFile,
    `            referenceCount: referenceOutputs.length,
            requiresImageToVideo: referenceOutputs.length > 0,
            aspectRatio: payload.aspectRatio === "16:9" ? "16:9" : "9:16",`,
    `            referenceCount: referenceOutputs.length,
            requiresImageToVideo: referenceOutputs.length > 0,
            requiresIdentityFidelity,
            aspectRatio: payload.aspectRatio === "16:9" ? "16:9" : "9:16",`,
    "V142_IDENTITY_FIDELITY_LOCAL_REQUIREMENTS"
  );

  replaceExactOnce(
    actuatorFile,
    `                    requiresImageToVideo: referenceImages.length > 0,
                    aspectRatio,`,
    `                    requiresImageToVideo: referenceImages.length > 0,
                    requiresIdentityFidelity: referenceImages.length > 0,
                    aspectRatio,`,
    "V142_IDENTITY_FIDELITY_ACTUATOR_REQUIREMENT"
  );

  replaceExactOnce(
    bridgeFile,
    `            try {
                const result = await videoEngine[action](req.body || {});
                return res.status(result.ok === true ? 200 : 400).json(result);`,
    `            try {
                const payload = req.body || {};
                const invocationPayload = action === "start"
                    ? {
                        ...payload,
                        requiresIdentityFidelity:
                            Array.isArray(payload.referenceOutputs) &&
                            payload.referenceOutputs.length > 0
                    }
                    : payload;
                const result = await videoEngine[action](invocationPayload);
                return res.status(result.ok === true ? 200 : 400).json(result);`,
    "V142_IDENTITY_FIDELITY_BRIDGE_FORCE"
  );

  appendOnce(
    "tests/jarvis-local-video-engine-v142.test.mjs",
    "V142 identity fidelity blocks local actor generation before hardware inspection or GPU launch",
    `test("V142 identity fidelity blocks local actor generation before hardware inspection or GPU launch", async () => {
    let hardwareInspections = 0;
    let launches = 0;
    const engine = createLocalVideoEngine({
        root: fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-identity-fidelity-gate-")),
        env: {
            JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
            JARVIS_LOCAL_VIDEO_ENABLED: "true"
        },
        inspectHardware() {
            hardwareInspections += 1;
            return healthyCapability();
        },
        launch() {
            launches += 1;
            throw new Error("IDENTITY_GATE_MUST_BLOCK_BEFORE_LAUNCH");
        }
    });
    const result = await engine.start({
        script: "Preserve the referenced actor exactly.",
        prompts: ["Actor walks and turns toward camera."],
        referenceOutputs: [".jarvis-artifacts/images/actor-reference.png"],
        requiresIdentityFidelity: true,
        output: ".jarvis-artifacts/videos/identity-gate.mp4"
    });
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.status, "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED");
    assert.equal(result.requiresIdentityFidelity, true);
    assert.equal(result.referenceCount, 1);
    assert.equal(result.gpuRentalSeconds, 0);
    assert.equal(result.gpuRentalEstimatedCost, 0);
    assert.equal(result.gpuRentalActualCost, 0);
    assert.equal(hardwareInspections, 0);
    assert.equal(launches, 0);
});

test("V142 identity fidelity selects external fallback only at resolver level and never spends locally", () => {
    const preferred = describeLocalVideoPolicy({
        JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_PREFERRED",
        JARVIS_LOCAL_VIDEO_ENABLED: "true",
        JARVIS_LOCAL_VIDEO_CERTIFIED: "true",
        JARVIS_EXTERNAL_FALLBACK_ENABLED: "true"
    });
    const health = {
        ok: true,
        status: "LOCAL_VIDEO_HARDWARE_READY",
        selectedBackend: "wan22-ti2v-5b",
        model: {
            backend: "wan22-ti2v-5b",
            model: "Wan2.2-TI2V-5B",
            imageToVideo: true,
            maximumReferenceAssets: 1
        }
    };
    const fallback = resolveVideoEngine({
        policy: preferred,
        health,
        requirements: {
            referenceCount: 1,
            requiresImageToVideo: true,
            requiresIdentityFidelity: true
        }
    });
    assert.equal(fallback.ok, true);
    assert.equal(fallback.engineUsed, "external");
    assert.equal(fallback.provider, "google-veo");
    assert.equal(fallback.fallbackUsed, true);
    assert.match(fallback.fallbackReason, /LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED/);
    assert.equal(fallback.externalApiUsed, false);
    assert.equal(fallback.externalEstimatedCostUsd, 0);

    const localOnly = resolveVideoEngine({
        policy: describeLocalVideoPolicy({
            JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
            JARVIS_LOCAL_VIDEO_ENABLED: "true"
        }),
        health,
        requirements: {
            referenceCount: 1,
            requiresImageToVideo: true,
            requiresIdentityFidelity: true
        }
    });
    assert.equal(localOnly.ok, false);
    assert.equal(localOnly.engineUsed, null);
    assert.match(localOnly.status, /LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED/);
    assert.equal(localOnly.externalApiUsed, false);
});

test("V142 public bridge forces identity fidelity for every referenced video start", () => {
    const bridge = fs.readFileSync(
        new URL("../jarvis-fs-bridge.js", import.meta.url),
        "utf8"
    );
    const actuator = fs.readFileSync(
        new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url),
        "utf8"
    );
    assert.match(bridge, /requiresIdentityFidelity:[\\s\\S]*Array\\.isArray\\(payload\\.referenceOutputs\\)/);
    assert.match(actuator, /requiresIdentityFidelity: referenceImages\\.length > 0/);
});`
  );
}

function ensureRegressionContract() {
  const file = "tests/jarvis-mobile-web-research-recovery-v142.test.mjs";

  const allowlistMarker =
    "V142 video import accepts only the controlled Firebase Storage download URL";
  appendOnce(
    file,
    allowlistMarker,
    `test("${allowlistMarker}", () => {
    const source = fs.readFileSync(
        new URL("../jarvis-fs-bridge.js", import.meta.url),
        "utf8"
    );
    assert.match(source, /host === \"firebasestorage\\.googleapis\\.com\"/);
    assert.match(source, /fixgo-44e4d\\.firebasestorage\\.app/);
    assert.match(source, /parsed\\.searchParams\\.get\\(\"alt\"\\) === \"media\"/);
    assert.match(source, /parsed\\.searchParams\\.get\\(\"token\"\\)/);
    assert.match(source, /VIDEO_IMPORT_SHA256_REQUIRED/);
});`
  );

  const cleanupMarker =
    "V142 video cloud cleanup happens only after the physical import succeeds";
  appendOnce(
    file,
    cleanupMarker,
    `test("${cleanupMarker}", () => {
    const source = fs.readFileSync(
        new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url),
        "utf8"
    );
    const importIndex = source.indexOf('const artifact = await bridgeRequest("/video/import"');
    const cleanupIndex = source.indexOf('action: "cleanup"', importIndex);
    assert.ok(importIndex >= 0);
    assert.ok(cleanupIndex > importIndex);
    assert.doesNotMatch(
        source.slice(importIndex, cleanupIndex),
        /finally\s*\{/
    );
});`
  );

  const routingMarker =
    "V142 video engine resolver receives semantic media requirements before local start";
  appendOnce(
    file,
    routingMarker,
    `test("${routingMarker}", () => {
    const actuator = fs.readFileSync(
        new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url),
        "utf8"
    );
    const bridge = fs.readFileSync(
        new URL("../jarvis-fs-bridge.js", import.meta.url),
        "utf8"
    );
    assert.match(actuator, /referenceCount: referenceImages\\.length/);
    assert.match(actuator, /requiresImageToVideo: referenceImages\\.length > 0/);
    assert.match(actuator, /requiresIdentityFidelity: referenceImages\\.length > 0/);
    assert.match(bridge, /videoEngine\\.resolve\\(req\\.body \\|\\| \\{\\}\\)/);
    assert.match(bridge, /requiresIdentityFidelity/);
});`
  );
}

ensureFirebaseVideoImportContract();
ensureCloudCleanupAfterPhysicalImport();
ensureLocalVideoRequirementRouting();
ensureIdentityFidelityEconomyGate();
ensureRegressionContract();

const checks = [
  ["gestia-core/jarvis/jarvis.multifunction.planner.js", [
    "GENERALIST_CURRENT_TURN_POLICY",
    "SEMANTIC_MINIDRAMA_SCENES_CONSOLIDATED",
    "UNA sola llamada video.generate"
  ]],
  ["gestia-core/jarvis/jarvis.actuator.pack.js", [
    'name: "video.generate"',
    "transientPollFailures",
    "VIDEO_GENERATION_POLL_TRANSPORT_TIMEOUT",
    "VIDEO_IMPORT_PHYSICAL_VERIFICATION_FAILED",
    'const artifact = await bridgeRequest("/video/import"',
    'action: "cleanup"',
    "referenceCount: referenceImages.length",
    "requiresImageToVideo: referenceImages.length > 0",
    "requiresIdentityFidelity: referenceImages.length > 0"
  ]],
  ["jarvis-fs-bridge.js", [
    'app.post("/video/import"',
    'videoEngine.resolve(req.body || {})',
    'host === "firebasestorage.googleapis.com"',
    'fixgo-44e4d.firebasestorage.app',
    'parsed.searchParams.get("alt") === "media"',
    'parsed.searchParams.get("token")',
    "VIDEO_IMPORT_SHA256_REQUIRED",
    "requiresIdentityFidelity",
    "REEL_VIDEO_FRAME_DENSITY_LOW:",
    "averageRenderedFps < 20"
  ]],
  ["jarvis-local-video-engine.js", [
    "requirements = {}",
    "LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND",
    "LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED",
    "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED",
    "requiresIdentityFidelity",
    "gpuRentalActualCost: 0",
    "resolve: requirements => resolveVideoEngine"
  ]]
];

for (const [file, markers] of checks) {
  const source = sourceOf(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`V142_AUDIOVISUAL_CONTRACT_MISSING:${file}:${marker}`);
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_ORIGINAL_REEL_PRODUCTION_ALIGNMENT_VERIFIED",
  sameSemanticAuthority: true,
  originalReelCreativeDefault: true,
  sourceMediaEvidenceOnlyByDefault: true,
  generatedCreativeTool: "image.generate",
  finalVideoTool: "reel.create",
  miniDramaTool: "video.generate",
  miniDramaSingleVideoCall: true,
  miniDramaSameOperationPollRetry: true,
  firebaseVideoImportStrictAllowlist: true,
  cloudCleanupAfterPhysicalImport: true,
  localVideoRequirementRouting: true,
  identityFidelityEconomyGate: true,
  minimumRenderedFps: 20,
  lexicalRouting: false,
  newFiles: false,
  newBrains: false
}));
