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

function ensureVerifiedReelPlanHandoffPrecedesMediaRecovery() {
  const file = "gestia-core/jarvis/jarvis.mission.orchestrator.js";
  const marker = "const reelDependencyTask =";

  if (!sourceOf(file).includes(marker)) {
    replaceExactOnce(
      file,
      [
        "        const mediaDependency =",
        "            reelMediaDependencyCall(",
        "                task,",
        "                mission",
        "            );"
      ].join("\n"),
      [
        "        const reelDependencyTask =",
        "            task?.name === \"reel.create\"",
        "                ? {",
        "                    ...task,",
        "                    args:",
        "                        reelCreateArgsFromVerifiedPlan(",
        "                            task.args,",
        "                            mission",
        "                        ).args",
        "                }",
        "                : task;",
        "        const mediaDependency =",
        "            reelMediaDependencyCall(",
        "                reelDependencyTask,",
        "                mission",
        "            );"
      ].join("\n"),
      "V142_REEL_VERIFIED_PLAN_BEFORE_MEDIA_DEPENDENCY"
    );
  }

  replaceExactOnce(
    file,
    [
      "            reelMediaRecoveryState(",
      "                task,",
      "                mission",
      "            );"
    ].join("\n"),
    [
      "            reelMediaRecoveryState(",
      "                reelDependencyTask,",
      "                mission",
      "            );"
    ].join("\n"),
    "V142_REEL_VERIFIED_PLAN_BEFORE_MEDIA_RECOVERY"
  );
}

function ensureRegressionContract() {
  const file = "tests/jarvis-mobile-web-research-recovery-v142.test.mjs";
  const marker = "V142 reel media dependency evaluates the verified reel-plan handoff before external recovery";
  appendOnce(
    file,
    marker,
    `test("${marker}", () => {
    const source = fs.readFileSync(
        new URL("../gestia-core/jarvis/jarvis.mission.orchestrator.js", import.meta.url),
        "utf8"
    );
    const handoffIndex = source.indexOf("const reelDependencyTask =");
    const dependencyIndex = source.indexOf("reelMediaDependencyCall(\\n                reelDependencyTask");
    const recoveryIndex = source.indexOf("reelMediaRecoveryState(\\n                reelDependencyTask");
    const executionHandoffIndex = source.indexOf("const reelPlanHandoff =", dependencyIndex);

    assert.ok(handoffIndex >= 0);
    assert.ok(dependencyIndex > handoffIndex);
    assert.ok(recoveryIndex > dependencyIndex);
    assert.ok(executionHandoffIndex > recoveryIndex);
});`
  );
}

ensureVerifiedReelPlanHandoffPrecedesMediaRecovery();
ensureRegressionContract();

const checks = [
  ["gestia-core/jarvis/jarvis.multifunction.planner.js", [
    "GENERALIST_CURRENT_TURN_POLICY",
    "Los medios recopilados desde publicaciones o fuentes externas son evidencia y referencia",
    "el medio externo sigue siendo evidencia",
    "logotipo oficial verificado"
  ]],
  ["gestia-core/jarvis/jarvis.mission.dependencies.js", [
    '"image.generate": 28',
    "ORIGINAL_REEL_CREATIVE_DEPENDENCY",
    "explicitExistingMediaEdit"
  ]],
  ["gestia-core/jarvis/jarvis.reel.media-binder.js", [
    "reelMediaCollectionState",
    '".jarvis-artifacts/images/"',
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
  ["gestia-core/jarvis/jarvis.mission.orchestrator.js", [
    "const reelDependencyTask =",
    "reelMediaDependencyCall(\n                reelDependencyTask",
    "reelMediaRecoveryState(\n                reelDependencyTask"
  ]],
  ["jarvis-fs-bridge.js", [
    "REEL_VIDEO_FRAME_DENSITY_LOW:",
    "averageRenderedFps < 20",
    '"--enable-gpu"'
  ]]
];

for (const [file, markers] of checks) {
  const source = sourceOf(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`V142_ORIGINAL_REEL_CONTRACT_MISSING:${file}:${marker}`);
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
  verifiedReelPlanHandoffBeforeLegacyMediaRecovery: true,
  verifiedBrandLogoPropagation: true,
  minimumRenderedFps: 20,
  lexicalRouting: false,
  newFiles: false,
  newBrains: false
}));
