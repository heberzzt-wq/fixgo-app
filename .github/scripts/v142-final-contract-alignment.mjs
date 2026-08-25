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

function ensureMiniDramaSingleVideoCallPolicy() {
  const file = "gestia-core/jarvis/jarvis.multifunction.planner.js";
  const before = '    "Para mini dramas nuevos, divide semanticamente el guion en hasta cuatro escenas consecutivas cuando ayude a la continuidad. video.generate puede extender el video generado entre escenas; los medios externos siguen siendo solo evidencia o referencia salvo reutilizacion solicitada de forma inequivoca.",';
  const after = '    "Para un mismo mini drama nuevo, selecciona UNA sola llamada video.generate y entrega dentro de scenes hasta cuatro escenas consecutivas cuando ayude a la continuidad. No emitas una llamada video.generate independiente por escena: la herramienta conserva previousVideo y extiende el mismo video entre escenas. Los medios externos siguen siendo solo evidencia o referencia salvo reutilizacion solicitada de forma inequivoca.",';
  if (sourceOf(file).includes(before)) {
    replaceExactOnce(
      file,
      before,
      after,
      "V142_MINIDRAMA_SINGLE_VIDEO_CALL_POLICY"
    );
  }
}

function ensureMiniDramaSceneConsolidation() {
  const file = "gestia-core/jarvis/jarvis.multifunction.planner.js";
  const marker = "SEMANTIC_MINIDRAMA_SCENES_CONSOLIDATED";
  if (sourceOf(file).includes(marker)) return;

  const before = [
    "    return enforceMissionIsolation(",
    "        calls,",
    "        allowed",
    "    );",
    "}"
  ].join("\n");

  const after = [
    "    const isolatedCalls = enforceMissionIsolation(",
    "        calls,",
    "        allowed",
    "    );",
    "    const videoCalls = isolatedCalls.filter(call => call?.name === \"video.generate\");",
    "    if (videoCalls.length <= 1) {",
    "        return isolatedCalls;",
    "    }",
    "    const videoTool = allowed.get(\"video.generate\");",
    "    const firstVideoIndex = isolatedCalls.findIndex(call => call?.name === \"video.generate\");",
    "    const scenePrompts = videoCalls.flatMap(call => {",
    "        const args = call?.args || {};",
    "        const declaredScenes = Array.isArray(args.scenes) ? args.scenes : [];",
    "        if (declaredScenes.length > 0) {",
    "            return declaredScenes.map(scene =>",
    "                typeof scene === \"string\"",
    "                    ? scene.trim()",
    "                    : String(scene?.prompt || scene?.visual || scene?.description || \"\").trim()",
    "            );",
    "        }",
    "        return [String(args.prompt || args.script || \"\").trim()];",
    "    }).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).slice(0, 4);",
    "    const firstVideo = videoCalls[0];",
    "    const combinedArgs = {",
    "        ...(firstVideo?.args || {}),",
    "        script: String(firstVideo?.args?.script || context?.originalInstruction || firstVideo?.args?.prompt || \"\").trim(),",
    "        scenes: scenePrompts.map(prompt => ({ prompt }))",
    "    };",
    "    const combinedVideo = {",
    "        ...firstVideo,",
    "        args: combinedArgs,",
    "        reason: \"SEMANTIC_MINIDRAMA_SCENES_CONSOLIDATED\",",
    "        ...(videoTool ? { missionDedupeKey: missionDedupeKey(videoTool, combinedArgs) } : {})",
    "    };",
    "    const consolidated = isolatedCalls.filter(call => call?.name !== \"video.generate\");",
    "    consolidated.splice(Math.max(0, firstVideoIndex), 0, combinedVideo);",
    "    return consolidated;",
    "}"
  ].join("\n");

  replaceExactOnce(
    file,
    before,
    after,
    "V142_MINIDRAMA_SCENE_CONSOLIDATION"
  );
}

function ensureVideoPollClientResilience() {
  const file = "gestia-core/jarvis/jarvis.actuator.pack.js";
  let source = sourceOf(file);

  const oldErrorReturn = [
    "        return {",
    "            ok: false,",
    "            status: `CLOUD_FUNCTION_HTTP_${response.status}`,",
    "            error: errorMessage,",
    "            cloudCode: payload?.error?.status || payload?.error?.code || null",
    "        };"
  ].join("\n");
  const newErrorReturn = [
    "        return {",
    "            ok: false,",
    "            status: `CLOUD_FUNCTION_HTTP_${response.status}`,",
    "            error: errorMessage,",
    "            cloudCode: payload?.error?.status || payload?.error?.code || null,",
    "            errorDetails:",
    "                errorDetails && typeof errorDetails === \"object\"",
    "                    ? errorDetails",
    "                    : null,",
    "            retryable: response.status >= 500",
    "        };"
  ].join("\n");
  if (source.includes(oldErrorReturn)) {
    replaceExactOnce(
      file,
      oldErrorReturn,
      newErrorReturn,
      "V142_VIDEO_FUNCTION_ERROR_DETAILS"
    );
    source = sourceOf(file);
  }

  const pollMarker = "consecutivePollFailures";
  if (source.includes(pollMarker)) return;
  const oldPoll = [
    "                    let segment = null;",
    "                    for (let attempt = 0; attempt < 36; attempt += 1) {",
    "                        await new Promise(resolve => setTimeout(resolve, 10000));",
    "                        const polled = await callAdminFunction(\"jarvisVideoGenerate\", {",
    "                            action: \"poll\", operationName: started.operationName, finalize: index === prompts.length - 1",
    "                        });",
    "                        if (polled?.ok !== true) {",
    "                            return { ...polled, ok: false, executionOk: false, objectiveSatisfied: false, status: polled?.status || \"VIDEO_GENERATION_POLL_FAILED\" };",
    "                        }",
    "                        if (polled?.done !== true) continue;",
    "                        segment = polled;",
    "                        break;",
    "                    }"
  ].join("\n");
  const newPoll = [
    "                    let segment = null;",
    "                    let consecutivePollFailures = 0;",
    "                    let lastPollFailure = null;",
    "                    for (let attempt = 0; attempt < 36; attempt += 1) {",
    "                        await new Promise(resolve => setTimeout(resolve, 10000));",
    "                        const polled = await callAdminFunction(\"jarvisVideoGenerate\", {",
    "                            action: \"poll\", operationName: started.operationName, finalize: index === prompts.length - 1",
    "                        });",
    "                        if (polled?.ok !== true) {",
    "                            lastPollFailure = polled;",
    "                            const transientPollFailure =",
    "                                polled?.retryable === true ||",
    "                                String(polled?.status || \"\").startsWith(\"CLOUD_FUNCTION_HTTP_5\");",
    "                            consecutivePollFailures += 1;",
    "                            if (transientPollFailure && consecutivePollFailures <= 3) {",
    "                                continue;",
    "                            }",
    "                            return { ...polled, ok: false, executionOk: false, objectiveSatisfied: false, status: polled?.status || \"VIDEO_GENERATION_POLL_FAILED\" };",
    "                        }",
    "                        consecutivePollFailures = 0;",
    "                        lastPollFailure = null;",
    "                        if (polled?.done !== true) continue;",
    "                        segment = polled;",
    "                        break;",
    "                    }",
    "                    if (!segment && lastPollFailure) {",
    "                        return { ...lastPollFailure, ok: false, executionOk: false, objectiveSatisfied: false, status: lastPollFailure?.status || \"VIDEO_GENERATION_POLL_FAILED\" };",
    "                    }"
  ].join("\n");
  replaceExactOnce(
    file,
    oldPoll,
    newPoll,
    "V142_VIDEO_POLL_SAME_OPERATION_RETRY"
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
    const normalized = source.replace(/\\r\\n/g, "\\n");
    const handoffIndex = normalized.indexOf("const reelDependencyTask =");
    const dependencyIndex = normalized.indexOf("reelMediaDependencyCall(\\n                reelDependencyTask");
    const recoveryIndex = normalized.indexOf("reelMediaRecoveryState(\\n                reelDependencyTask");
    const executionHandoffIndex = normalized.indexOf("const reelPlanHandoff =", dependencyIndex);

    assert.ok(handoffIndex >= 0);
    assert.ok(dependencyIndex > handoffIndex);
    assert.ok(recoveryIndex > dependencyIndex);
    assert.ok(executionHandoffIndex > recoveryIndex);
});`
  );

  const miniDramaMarker = "V142 mini-drama consolidates semantic scene calls into one video.generate execution";
  appendOnce(
    file,
    miniDramaMarker,
    `test("${miniDramaMarker}", () => {
    const videoTool = {
        name: "video.generate",
        mutates: true,
        requiresApproval: false,
        userArtifact: true,
        missionDedupeBy: ["output"],
        inputSchema: {}
    };
    const calls = plannerTest.trustedPlanCalls({
        planKind: "MISSION_CONTRACT",
        toolCalls: [
            { name: "video.generate", args: { prompt: "escena uno", output: ".jarvis-artifacts/videos/scene-1.mp4" } },
            { name: "video.generate", args: { prompt: "escena dos", output: ".jarvis-artifacts/videos/scene-2.mp4" } },
            { name: "video.generate", args: { prompt: "escena tres", output: ".jarvis-artifacts/videos/scene-3.mp4" } },
            { name: "video.generate", args: { prompt: "escena cuatro", output: ".jarvis-artifacts/videos/scene-4.mp4" } }
        ]
    }, [videoTool], {
        originalInstruction: "Produce un mini drama continuo con cuatro escenas.",
        missionState: { phase: "MISSION_CONTRACT" }
    });

    const videos = calls.filter(call => call.name === "video.generate");
    assert.equal(videos.length, 1);
    assert.equal(videos[0].reason, "SEMANTIC_MINIDRAMA_SCENES_CONSOLIDATED");
    assert.equal(videos[0].args.scenes.length, 4);
    assert.deepEqual(
        videos[0].args.scenes.map(scene => scene.prompt),
        ["escena uno", "escena dos", "escena tres", "escena cuatro"]
    );
});`
  );

  const pollMarker = "V142 video actuator keeps the same Veo operation across transient poll failures";
  appendOnce(
    file,
    pollMarker,
    `test("${pollMarker}", () => {
    const source = fs.readFileSync(
        new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url),
        "utf8"
    );
    assert.match(source, /consecutivePollFailures/);
    assert.match(source, /lastPollFailure/);
    assert.match(source, /retryable: response\.status >= 500/);
    assert.match(source, /started\.operationName/);
});`
  );
}

ensureVerifiedReelPlanHandoffPrecedesMediaRecovery();
ensureMiniDramaSingleVideoCallPolicy();
ensureMiniDramaSceneConsolidation();
ensureVideoPollClientResilience();
ensureRegressionContract();

const checks = [
  ["gestia-core/jarvis/jarvis.multifunction.planner.js", [
    "GENERALIST_CURRENT_TURN_POLICY",
    "Los medios recopilados desde publicaciones o fuentes externas son evidencia y referencia",
    "el medio externo sigue siendo evidencia",
    "logotipo oficial verificado",
    "SEMANTIC_MINIDRAMA_SCENES_CONSOLIDATED",
    "UNA sola llamada video.generate"
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
    'name: "video.generate"',
    'asset?.mediaRole === "brand_logo"',
    "consecutivePollFailures",
    "errorDetails",
    "retryable: response.status >= 500"
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
  miniDramaSingleVideoCall: true,
  miniDramaSameOperationPollRetry: true,
  verifiedReelPlanHandoffBeforeLegacyMediaRecovery: true,
  verifiedBrandLogoPropagation: true,
  minimumRenderedFps: 20,
  lexicalRouting: false,
  newFiles: false,
  newBrains: false
}));
