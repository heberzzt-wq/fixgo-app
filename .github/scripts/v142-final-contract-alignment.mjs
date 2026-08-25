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
    assert.match(bridge, /videoEngine\\.resolve\\(req\\.body \\|\\| \\{\\}\\)/);
});`
  );
}

ensureFirebaseVideoImportContract();
ensureCloudCleanupAfterPhysicalImport();
ensureLocalVideoRequirementRouting();
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
    "requiresImageToVideo: referenceImages.length > 0"
  ]],
  ["jarvis-fs-bridge.js", [
    'app.post("/video/import"',
    'videoEngine.resolve(req.body || {})',
    'host === "firebasestorage.googleapis.com"',
    'fixgo-44e4d.firebasestorage.app',
    'parsed.searchParams.get("alt") === "media"',
    'parsed.searchParams.get("token")',
    "VIDEO_IMPORT_SHA256_REQUIRED",
    "REEL_VIDEO_FRAME_DENSITY_LOW:",
    "averageRenderedFps < 20"
  ]],
  ["jarvis-local-video-engine.js", [
    "requirements = {}",
    "LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND",
    "LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED",
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
  minimumRenderedFps: 20,
  lexicalRouting: false,
  newFiles: false,
  newBrains: false
}));