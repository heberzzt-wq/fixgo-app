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
  replaceExactOnce(
    "gestia-core/jarvis/jarvis.multifunction.planner.js",
    '    "Para marcas identificadas, conserva cualquier logotipo oficial verificado como un activo separado; no pidas al generador que invente, redibuje o imite un logotipo."',
    '    "Para marcas identificadas, conserva cualquier logotipo oficial verificado como un activo separado; no pidas al generador que invente, redibuje o imite un logotipo.",',
    "V142_PLANNER_POLICY_COMMA"
  );
}

function normalizeLegacyGroundedReelFixture() {
  replaceExactOnce(
    "tests/jarvis-multifunction-tools.test.mjs",
    '            "reel.plan": {\n                brandName: "Summit Law Firm",\n                title: "Estrategia antes del conflicto",',
    '            "reel.plan": {\n                brandName: "Summit Law Firm",\n                title: "Estrategia antes del conflicto",\n                sourceMediaPolicy: "reuse",',
    "V142_LEGACY_REEL_FIXTURE"
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
normalizeMarketingOriginalCreativeFixture();

const checks = [
  ["gestia-core/gestia-core.js", [
    "[CURRENT_TURN_SEMANTIC_PLANNER_TRANSIENT_RETRY]",
    'reason: "SEMANTIC_PLANNER_UNAVAILABLE"',
    "missionContractAttempt <= 3"
  ]],
  ["gestia-core/jarvis/jarvis.multifunction.planner.js", [
    "GENERALIST_CURRENT_TURN_POLICY",
    "el medio externo sigue siendo evidencia",
    'imite un logotipo.",'
  ]],
  ["gestia-core/jarvis/jarvis.mission.dependencies.js", [
    '"image.generate": 28',
    "ORIGINAL_REEL_CREATIVE_DEPENDENCY",
    "explicitExistingMediaEdit"
  ]],
  ["gestia-core/jarvis/jarvis.reel.media-binder.js", [
    ".jarvis-artifacts/images/",
    '"image.generate"',
    "creativeAssets",
    "collectedSceneAssets"
  ]],
  ["gestia-core/jarvis/jarvis.multitool.pack.js", [
    "REEL_GENERATED_SCENE_MEDIA_REQUIRED",
    "sourceMediaPolicy",
    'waitingFor: "image.generate"'
  ]],
  ["gestia-core/jarvis/jarvis.actuator.pack.js", [
    'name: "image.generate"',
    'name: "reel.create"',
    'asset?.mediaRole === "brand_logo"'
  ]],
  ["jarvis-fs-bridge.js", [
    "BRIDGE_IDENTITY_OK",
    "REEL_VIDEO_FRAME_DENSITY_LOW:",
    "averageRenderedFps < 20",
    '"--enable-gpu"'
  ]],
  ["jarvis-reel-artifact.js", [
    "renderedFrameCount=0",
    "averageRenderedFps:renderedFrameCount/spec.durationSeconds",
    "window.__JARVIS_REEL_EXPORT_ERROR__=null"
  ]],
  ["tests/jarvis-multifunction-tools.test.mjs", [
    'title: "Estrategia antes del conflicto",\n                sourceMediaPolicy: "reuse",'
  ]],
  ["tests/jarvis-marketing-handoff-v12.test.mjs", [
    'const socials = calls.filter(call => call.name === "image.generate")',
    '["image.generate", "image.generate", "image.generate"]'
  ]],
  ["tests/jarvis-reel-media-binder-v131.test.mjs", [
    "v142 prefers verified original creative media over collected source evidence"
  ]],
  ["tests/jarvis-reel-native-mp4-v138.test.mjs", [
    "V142 original reel production uses deployed image generation and no ghost video callable"
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

const actuator = fs.readFileSync(
  "gestia-core/jarvis/jarvis.actuator.pack.js",
  "utf8"
);
const functionsIndex = fs.readFileSync("functions/index.js", "utf8");
const bridge = fs.readFileSync("jarvis-fs-bridge.js", "utf8");
if (actuator.includes('name: "video.generate"')) {
  throw new Error("V142_GHOST_VIDEO_TOOL_PRESENT");
}
if (functionsIndex.includes("exports.jarvisVideoGenerate")) {
  throw new Error("V142_GHOST_VIDEO_FUNCTION_PRESENT");
}
if (bridge.includes('app.post("/video/import"')) {
  throw new Error("V142_GHOST_VIDEO_IMPORT_ROUTE_PRESENT");
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_ORIGINAL_REEL_CLOSEOUT_STATE_VERIFIED",
  sameSemanticAuthority: true,
  originalReelCreativeDefault: true,
  sourceMediaEvidenceOnlyByDefault: true,
  generatedCreativeTool: "image.generate",
  finalVideoTool: "reel.create",
  verifiedBrandLogoPropagation: true,
  plannerPolicySyntaxNormalized: true,
  legacyReadOnlyReelFixtureExplicitReuse: true,
  marketingOriginalCreativeUsesGeneration: true,
  ghostVideoTool: false,
  cloudFunctionsChanged: false,
  minimumRenderedFps: 20,
  newFiles: false,
  newBrains: false,
  newWorkflow: false
}));
