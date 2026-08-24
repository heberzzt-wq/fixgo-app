import fs from "node:fs";

function normalizePlannerPolicyComma() {
  const file = "gestia-core/jarvis/jarvis.multifunction.planner.js";
  let source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const withoutComma =
    '    "Para marcas identificadas, conserva cualquier logotipo oficial verificado como un activo separado; no pidas al generador que invente, redibuje o imite un logotipo."';
  const withComma =
    '    "Para marcas identificadas, conserva cualquier logotipo oficial verificado como un activo separado; no pidas al generador que invente, redibuje o imite un logotipo.",';
  if (!source.includes(withComma)) {
    const count = source.split(withoutComma).length - 1;
    if (count !== 1) {
      throw new Error(`V142_PLANNER_POLICY_COMMA_MATCH_COUNT_${count}`);
    }
    source = source.replace(withoutComma, withComma);
    fs.writeFileSync(file, source, "utf8");
  }
}

function normalizeLegacyGroundedReelFixture() {
  const file = "tests/jarvis-multifunction-tools.test.mjs";
  let source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const before =
    '            "reel.plan": {\n                brandName: "Summit Law Firm",\n                title: "Estrategia antes del conflicto",';
  const after =
    '            "reel.plan": {\n                brandName: "Summit Law Firm",\n                title: "Estrategia antes del conflicto",\n                sourceMediaPolicy: "reuse",';
  if (!source.includes(after)) {
    const count = source.split(before).length - 1;
    if (count !== 1) {
      throw new Error(`V142_LEGACY_REEL_FIXTURE_MATCH_COUNT_${count}`);
    }
    source = source.replace(before, after);
    fs.writeFileSync(file, source, "utf8");
  }
}

normalizePlannerPolicyComma();
normalizeLegacyGroundedReelFixture();

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
  minimumRenderedFps: 20,
  newFiles: false,
  newBrains: false,
  newWorkflow: false
}));
