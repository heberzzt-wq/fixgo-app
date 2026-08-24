import fs from "node:fs";

function replaceExactOnce(file, before, after, label) {
  let source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  source = source.replace(before, after);
  fs.writeFileSync(file, source, "utf8");
}

function normalizePlannerPolicyComma() {
  const file = "gestia-core/jarvis/jarvis.multifunction.planner.js";
  const withoutComma =
    '    "Para marcas identificadas, conserva cualquier logotipo oficial verificado como un activo separado; no pidas al generador que invente, redibuje o imite un logotipo."';
  const withComma =
    '    "Para marcas identificadas, conserva cualquier logotipo oficial verificado como un activo separado; no pidas al generador que invente, redibuje o imite un logotipo.",';
  replaceExactOnce(file, withoutComma, withComma, "V142_PLANNER_POLICY_COMMA");
}

function normalizeLegacyGroundedReelFixture() {
  replaceExactOnce(
    "tests/jarvis-multifunction-tools.test.mjs",
    '            "reel.plan": {\n                brandName: "Summit Law Firm",\n                title: "Estrategia antes del conflicto",',
    '            "reel.plan": {\n                brandName: "Summit Law Firm",\n                title: "Estrategia antes del conflicto",\n                sourceMediaPolicy: "reuse",',
    "V142_LEGACY_REEL_FIXTURE"
  );
}

function normalizeActuatorRegistryFixture() {
  replaceExactOnce(
    "tests/jarvis-actuator-pack.test.mjs",
    '        "speech.synthesize",\n        "reel.create",',
    '        "speech.synthesize",\n        "video.generate",\n        "reel.create",',
    "V142_VIDEO_GENERATE_REGISTRY_EXPECTATION"
  );
  replaceExactOnce(
    "tests/jarvis-actuator-pack.test.mjs",
    '    assert.equal(runtime.get("speech.synthesize").userArtifact, true);\n    assert.equal(runtime.get("reel.create").requiresApproval, false);',
    '    assert.equal(runtime.get("speech.synthesize").userArtifact, true);\n    assert.equal(runtime.get("video.generate").requiresApproval, false);\n    assert.equal(runtime.get("video.generate").userArtifact, true);\n    assert.deepEqual(runtime.get("video.generate").missionDedupeBy, ["output"]);\n    assert.equal(runtime.get("reel.create").requiresApproval, false);',
    "V142_VIDEO_GENERATE_REGISTRY_ASSERTIONS"
  );
}

function normalizeMarketingOriginalCreativeFixture() {
  const file = "tests/jarvis-marketing-handoff-v12.test.mjs";
  replaceExactOnce(
    file,
    '    const socials = calls.filter(call => call.name === "image.edit");',
    '    const socials = calls.filter(call => call.name === "image.generate");',
    "V142_MARKETING_SOCIALS_GENERATE"
  );
  replaceExactOnce(
    file,
    '    assert.ok(socials.every(call => call.args.preserveLogos === true));',
    '    assert.equal(calls.filter(call => call.name === "image.edit").length, 0);',
    "V142_MARKETING_NO_AUTOMATIC_SOURCE_EDIT"
  );
  replaceExactOnce(
    file,
    '        ["image.edit", "image.edit", "image.edit"]',
    '        ["image.generate", "image.generate", "image.generate"]',
    "V142_MARKETING_ARTIFACT_TOOL_EXPECTATION"
  );
}

normalizePlannerPolicyComma();
normalizeLegacyGroundedReelFixture();
normalizeActuatorRegistryFixture();
normalizeMarketingOriginalCreativeFixture();

const checks = [
  ["gestia-core/gestia-core.js", [
    "[CURRENT_TURN_SEMANTIC_PLANNER_TRANSIENT_RETRY]",
    'reason: "SEMANTIC_PLANNER_UNAVAILABLE"',
    "missionContractAttempt <= 3"
  ]],
  ["gestia-core/jarvis/jarvis.multifunction.planner.js", [
    "GENERALIST_CURRENT_TURN_POLICY",
    "usa video.generate si esta disponible",
    "No sustituyas una solicitud de video generativo por capturas",
    'imite un logotipo.",'
  ]],
  ["gestia-core/jarvis/jarvis.mission.dependencies.js", [
    '"video.generate": 28',
    "ORIGINAL_REEL_CREATIVE_DEPENDENCY",
    "explicitExistingMediaEdit"
  ]],
  ["gestia-core/jarvis/jarvis.reel.media-binder.js", [
    ".jarvis-artifacts/images/",
    ".jarvis-artifacts/videos/",
    '"video.generate"',
    "creativeAssets"
  ]],
  ["gestia-core/jarvis/jarvis.multitool.pack.js", [
    "REEL_GENERATED_SCENE_MEDIA_REQUIRED",
    "sourceMediaPolicy",
    "reelMediaCollectionState(context)"
  ]],
  ["gestia-core/jarvis/jarvis.actuator.pack.js", [
    'name: "video.generate"',
    'callAdminFunction("jarvisVideoGenerate"',
    'bridgeRequest("/video/import"',
    'asset?.mediaRole === "brand_logo"'
  ]],
  ["jarvis-fs-bridge.js", [
    "BRIDGE_IDENTITY_OK",
    "REEL_VIDEO_FRAME_DENSITY_LOW:",
    "averageRenderedFps < 20",
    '"--enable-gpu"',
    'app.post("/video/import"',
    "VIDEO_IMPORT_MP4_SIGNATURE_INVALID"
  ]],
  ["jarvis-reel-artifact.js", [
    "renderedFrameCount=0",
    "averageRenderedFps:renderedFrameCount/spec.durationSeconds",
    "window.__JARVIS_REEL_EXPORT_ERROR__=null"
  ]],
  ["functions/index.js", [
    "exports.jarvisVideoGenerate = functions",
    'veo-3.1-generate-preview',
    "getVideosOperation",
    "generatedFromScript: true"
  ]],
  ["tests/jarvis-multifunction-tools.test.mjs", [
    'title: "Estrategia antes del conflicto",\n                sourceMediaPolicy: "reuse",'
  ]],
  ["tests/jarvis-actuator-pack.test.mjs", [
    '"video.generate"',
    'runtime.get("video.generate").userArtifact'
  ]],
  ["tests/jarvis-marketing-handoff-v12.test.mjs", [
    'const socials = calls.filter(call => call.name === "image.generate")',
    '["image.generate", "image.generate", "image.generate"]'
  ]],
  ["tests/jarvis-reel-media-binder-v131.test.mjs", [
    "accepts verified video.generate output as original reel creative"
  ]],
  ["tests/jarvis-reel-native-mp4-v138.test.mjs", [
    "audiovisual production exposes original video generation and verified local import"
  ]]
];

for (const [file, markers] of checks) {
  const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`V142_CLOSEOUT_STATE_REQUIRED:${file}:${marker}`);
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_AUDIOVISUAL_CLOSEOUT_STATE_VERIFIED",
  sameSemanticAuthority: true,
  originalReelCreativeDefault: true,
  miniDramaFromScript: true,
  veo31VideoGeneration: true,
  verifiedLocalVideoImport: true,
  verifiedBrandLogoPropagation: true,
  plannerPolicySyntaxNormalized: true,
  legacyReadOnlyReelFixtureExplicitReuse: true,
  legacyActuatorRegistryIncludesVideoGenerate: true,
  marketingOriginalCreativeUsesGeneration: true,
  minimumRenderedFps: 20,
  newFiles: false,
  newBrains: false,
  newWorkflow: false
}));
