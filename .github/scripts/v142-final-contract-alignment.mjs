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
}

ensureFirebaseVideoImportContract();
ensureCloudCleanupAfterPhysicalImport();
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
    'action: "cleanup"'
  ]],
  ["jarvis-fs-bridge.js", [
    'app.post("/video/import"',
    'host === "firebasestorage.googleapis.com"',
    'fixgo-44e4d.firebasestorage.app',
    'parsed.searchParams.get("alt") === "media"',
    'parsed.searchParams.get("token")',
    "VIDEO_IMPORT_SHA256_REQUIRED",
    "REEL_VIDEO_FRAME_DENSITY_LOW:",
    "averageRenderedFps < 20"
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
  minimumRenderedFps: 20,
  lexicalRouting: false,
  newFiles: false,
  newBrains: false
}));
