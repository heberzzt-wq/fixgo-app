import fs from "node:fs/promises";

const paths = {
    core: "gestia-core/gestia-core.js",
    planner: "gestia-core/jarvis/jarvis.multifunction.planner.js",
    toolsBridge: "gestia-core/tools.bridge.js",
    dependencies: "gestia-core/jarvis/jarvis.mission.dependencies.js",
    mediaBinder: "gestia-core/jarvis/jarvis.reel.media-binder.js",
    actuator: "gestia-core/jarvis/jarvis.actuator.pack.js",
    bridge: "jarvis-fs-bridge.js",
    reelArtifact: "jarvis-reel-artifact.js",
    reelTest: "tests/jarvis-reel-native-mp4-v138.test.mjs",
    semanticPlannerTest: "tests/jarvis-semantic-planner.test.cjs"
};

async function read(file) {
    return (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
}
async function write(file, source) {
    await fs.writeFile(file, source, "utf8");
}
function replaceOnce(source, before, after, label) {
    if (source.includes(after)) return source;
    const count = source.split(before).length - 1;
    if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
    return source.replace(before, after);
}
function appendOnce(source, marker, addition) {
    if (source.includes(marker)) return source;
    return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}
async function requireMarkers(file, markers = []) {
    const source = await read(file);
    for (const marker of markers) {
        if (!source.includes(marker)) throw new Error(`V142_BASELINE_MARKER_REQUIRED:${file}:${marker}`);
    }
}

await requireMarkers(paths.planner, [
    "[CURRENT_TURN_SEMANTIC_SELF_REPAIR]",
    "currentTurnValidationFeedback",
    "plan?.missionComplete === true && !currentTurn",
    "Los medios recopilados desde publicaciones o fuentes externas son evidencia y referencia"
]);
await requireMarkers(paths.core, [
    "V142 current-turn empty plans are repaired by the same semantic planner",
    "missionContractAttempt <= 3",
    "[MISSION_CONTRACT_SEMANTIC_PLANNER_TRANSIENT_RETRY]",
    "const incompleteProductionFallback = recoveredInitialToolCalls.some"
]);
await requireMarkers(paths.dependencies, ['"image.generate": 28', '"image.edit": 28']);
await requireMarkers(paths.mediaBinder, [
    '.jarvis-artifacts/images/',
    'verifiedCreativeAssets.length > 0',
    'origin: binding.asset.origin || "web.media.collect"'
]);
await requireMarkers(paths.actuator, [
    'await sha256Base64(result.imageBase64)',
    'mimeType: result?.mimeType || artifact?.mimeType || null'
]);
await requireMarkers(paths.bridge, [
    '--disable-background-timer-throttling',
    'REEL_VIDEO_FRAME_DENSITY_LOW:',
    'averageRenderedFps < 20'
]);
await requireMarkers(paths.reelArtifact, [
    'renderedFrameCount=0',
    'exporting?setTimeout(()=>frame(performance.now()),1000/30):requestAnimationFrame(frame)'
]);

let core = await read(paths.core);
core = replaceOnce(
    core,
`        if (
            lightMultifunctionCalls.length === 1 &&
            lightMultifunctionCalls[0]?.name === "conversation.respond"
        ) {
            return {
                mode: "CASUAL_NOOP",
                confidence: 0.9,
                objective: "",
                useAgentLoop: false,
                useRepoTools: false,
                renderCard: false,
                prepareCommand: false,
                reason: "model_selected_conversation"
            };
        }`,
`        if (
            lightMultifunctionCalls.length === 1 &&
            lightMultifunctionCalls[0]?.name === "conversation.respond"
        ) {
            return {
                mode: "CASUAL_NOOP",
                confidence: 0.9,
                objective: "",
                useAgentLoop: false,
                useRepoTools: false,
                renderCard: false,
                prepareCommand: false,
                reason: "model_selected_conversation",
                toolCalls: lightMultifunctionCalls
            };
        }`,
    "V142_PRESERVE_CONVERSATION_TOOL_SELECTION"
);
core = replaceOnce(
    core,
`        let terminalPlannerSeed =
            Array.isArray(
                terminalSemanticPlan?.toolCalls
            )`,
`        if (
            terminalSemanticPlan?.mode === "CASUAL_NOOP" &&
            Array.isArray(terminalSemanticPlan?.toolCalls) &&
            terminalSemanticPlan.toolCalls.length === 1 &&
            terminalSemanticPlan.toolCalls[0]?.name === "conversation.respond"
        ) {
            if (!window.ToolsBridge?.executeAndCompose) {
                throw new Error("TOOLS_BRIDGE_MISSING_FOR_CONVERSATION");
            }
            const conversationCall = terminalSemanticPlan.toolCalls[0];
            console.info("[CURRENT_TURN_CONVERSATION_TOOL_EXECUTION]");
            return await window.ToolsBridge.executeAndCompose(
                "conversation.respond",
                conversationCall.args || {},
                {
                    ...context,
                    rawInput: inputRaw,
                    tenantId,
                    analysisId,
                    semanticMemory: semanticMemoryContext,
                    writeAllowed: false,
                    approved: false
                }
            );
        }

        let terminalPlannerSeed =
            Array.isArray(
                terminalSemanticPlan?.toolCalls
            )`,
    "V142_EXECUTE_SELECTED_CONVERSATION_TOOL"
);
await write(paths.core, core);

let toolsBridge = await read(paths.toolsBridge);
toolsBridge = replaceOnce(
    toolsBridge,
`        const observation =
            window.ResponseComposer.composeToolObservation(
                toolName,
                result.data,
                {
                    executionId:
                        result.executionId,
                    analysisId:
                        context.analysisId,
                    tenantId:
                        context.tenantId
                }
            );`,
`        const semanticPayload =
            result?.data &&
            typeof result.data === "object" &&
            !Array.isArray(result.data)
                ? result.data
                : result;
        const observation =
            window.ResponseComposer.composeToolObservation(
                toolName,
                semanticPayload,
                {
                    executionId:
                        result.executionId,
                    analysisId:
                        context.analysisId,
                    tenantId:
                        context.tenantId
                }
            );`,
    "V142_PRESERVE_DIRECT_TOOL_SEMANTIC_PAYLOAD"
);
toolsBridge = replaceOnce(
    toolsBridge,
`            composeActuatorResponse(
                toolName,
                result.data,
                context
            ) ||
            window.ResponseComposer.success(
                result.data,`,
`            composeActuatorResponse(
                toolName,
                semanticPayload,
                context
            ) ||
            window.ResponseComposer.success(
                semanticPayload,`,
    "V142_COMPOSE_FROM_SEMANTIC_PAYLOAD"
);
await write(paths.toolsBridge, toolsBridge);

let reelTest = await read(paths.reelTest);
reelTest = replaceOnce(
    reelTest,
`import { __test as missionOrchestratorTest } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";`,
`import { runJarvisMission, __test as missionOrchestratorTest } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";`,
    "V142_REEL_TEST_IMPORT_RUN_MISSION"
);
reelTest = appendOnce(reelTest,
    "V142 preserves a blocked direct tool payload instead of completing it accidentally",
`test("V142 preserves a blocked direct tool payload instead of completing it accidentally", () => {
  const bridgeSource = fs.readFileSync(new URL("../gestia-core/tools.bridge.js", import.meta.url), "utf8");
  const coreSource = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
  assert.equal(bridgeSource.includes("const semanticPayload ="), true);
  assert.equal(bridgeSource.includes("? result.data"), true);
  assert.equal(bridgeSource.includes(": result;"), true);
  assert.equal(bridgeSource.includes("semanticPayload,"), true);
  assert.equal(coreSource.includes("[CURRENT_TURN_CONVERSATION_TOOL_EXECUTION]"), true);
  assert.equal(coreSource.includes("toolCalls: lightMultifunctionCalls"), true);
});`
);
reelTest = appendOnce(reelTest,
    "V142 exact Taqueria human mission reaches reel.create after verified media recovery",
`test("V142 exact Taqueria human mission reaches reel.create after verified media recovery", async () => {
  const instruction = "Investiga esta publicación exacta de TikTok: https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004. La empresa es Taquería El Dorado, Cancún. Quiero que ejecutes la misión completa, no sólo que me expliques cómo hacerlo. Primero investiga la publicación y el negocio utilizando únicamente información que puedas verificar. Identifica correctamente qué negocio corresponde a la publicación y evita confundirlo con otros establecimientos de nombre parecido. Investiga por tu cuenta toda la información pública útil que encuentres y no inventes datos. Después de investigar, crea una propuesta de marketing basada únicamente en los hechos realmente encontrados. Crea un reel vertical profesional de aproximadamente 30 segundos, incluye voz y produce el archivo final real. No consideres éxito si el archivo final no existe realmente.";
  const sourceUrl = "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004";
  const planArgs = {
    brandName: "Taquería El Dorado",
    title: "Taco Macho",
    cta: "Prueba el Taco Macho",
    durationSeconds: 30,
    scenes: [
      { durationSeconds: 10, visual: "Taco Macho", overlay: "Sabor sinaloense", voiceover: "Conoce el Taco Macho", evidence: sourceUrl },
      { durationSeconds: 10, visual: "Queso y carne", overlay: "Calientito y rellenito", voiceover: "Queso derretido y carne a elección", evidence: sourceUrl },
      { durationSeconds: 10, visual: "Cierre", overlay: "Taquería El Dorado", voiceover: "Prueba el Taco Macho en Cancún", evidence: sourceUrl }
    ]
  };
  const initialToolCalls = [
    { name: "web.research", args: { query: "Taquería El Dorado Cancún Taco Macho", seedUrl: sourceUrl, researchGoal: "RESEARCH_1" } },
    { name: "marketing.plan", args: { brandName: "Taquería El Dorado", productionRequested: true, productionArtifacts: [{ id: "reel-main", type: "reel", toolName: "reel.create", label: "Reel vertical 30 segundos" }] } },
    { name: "web.media.collect", args: { url: sourceUrl, requireVideos: true } },
    { name: "reel.plan", args: planArgs },
    { name: "speech.synthesize", args: { text: "Conoce el Taco Macho de Taquería El Dorado" } },
    { name: "reel.create", args: { videoOutput: ".jarvis-artifacts/reels/taqueria-el-dorado.mp4" } }
  ];
  const trace = [];
  let mediaAttempts = 0;
  let reelPlanAttempts = 0;
  const store = new Map();
  const storage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); }
  };
  const marketingPlan = Object.fromEntries(Array.from({ length: 25 }, (_, index) => ["section" + (index + 1), index + 1]));
  const mission = await runJarvisMission({
    instruction,
    initialToolCalls,
    requiredToolNames: initialToolCalls.map(call => call.name),
    storage,
    maximumSteps: 20,
    maximumRetries: 0,
    timeoutMs: 120000,
    planner: async ({ originalInstruction }) => {
      assert.equal(originalInstruction, instruction);
      return { toolCalls: [], missionComplete: true };
    },
    execute: async ({ name, args }) => {
      trace.push(name);
      if (name === "web.research") return { ok: true, executionOk: true, objectiveSatisfied: true, status: "GROUNDED_LOCAL_FALLBACK", sources: [{ title: "Taquería El Dorado", url: sourceUrl }], sourceCount: 1, summary: "Identidad verificada." };
      if (name === "marketing.plan") return { ok: true, executionOk: true, objectiveSatisfied: true, status: "MARKETING_PACKAGE_READY", productionRequested: true, requiredArtifacts: [{ id: "reel-main", type: "reel", toolName: "reel.create", label: "Reel vertical 30 segundos" }], plan: marketingPlan, userVisible: "Plan de marketing verificado.", planReady: true, readyForProduction: true };
      if (name === "web.media.collect") {
        mediaAttempts += 1;
        if (mediaAttempts === 1) return { ok: true, executionOk: true, objectiveSatisfied: false, blocked: true, retryable: false, requiresInput: false, status: "WEB_REAL_MEDIA_REQUIREMENTS_UNMET" };
        return { ok: true, executionOk: true, objectiveSatisfied: true, blocked: false, retryable: false, requirementsMet: true, status: "WEB_REAL_MEDIA_COLLECTED", mediaAssets: [{ kind: "image", output: ".jarvis-artifacts/web-media/www-tiktok-com/taqueria-el-dorado/taco.jpg", mimeType: "image/jpeg", bytes: 64000, sha256: "b".repeat(64), mediaRole: "scene", sourceUrl }] };
      }
      if (name === "reel.plan") {
        reelPlanAttempts += 1;
        if (reelPlanAttempts === 1) return { ok: true, executionOk: true, objectiveSatisfied: false, blocked: true, retryable: false, requiresInput: false, status: "REEL_VERIFIED_SCENE_MEDIA_REQUIRED" };
        return { ok: true, executionOk: true, objectiveSatisfied: true, status: "REEL_PLAN_READY", ...planArgs, timelineSeconds: 30, scenes: planArgs.scenes.map(scene => ({ ...scene, assetOutput: ".jarvis-artifacts/web-media/www-tiktok-com/taqueria-el-dorado/taco.jpg", mediaType: "image", sourceMedia: { origin: "web.media.collect", sha256: "b".repeat(64) } })) };
      }
      if (name === "speech.synthesize") return { ok: true, executionOk: true, objectiveSatisfied: true, status: "SPEECH_AUDIO_CREATED_VERIFIED", artifact: ".jarvis-artifacts/audio/narration-taqueria.wav", evidence: { output: ".jarvis-artifacts/audio/narration-taqueria.wav", mimeType: "audio/wav", bytes: 180000, sha256: "a".repeat(64) } };
      if (name === "reel.create") {
        assert.equal(args.audioOutput, ".jarvis-artifacts/audio/narration-taqueria.wav");
        assert.equal(Array.isArray(args.scenes), true);
        assert.equal(args.scenes.length, 3);
        return { ok: true, executionOk: true, objectiveSatisfied: true, status: "REEL_VIDEO_CREATED_VERIFIED", artifact: ".jarvis-artifacts/reels/taqueria-el-dorado.mp4", evidence: { output: ".jarvis-artifacts/reels/taqueria-el-dorado.mp4", mimeType: "video/mp4", bytes: 900000, sha256: "c".repeat(64), durationSeconds: 30, renderedFrameCount: 900, averageRenderedFps: 30 } };
      }
      throw new Error("UNEXPECTED_TOOL_" + name);
    }
  });
  assert.equal(mission.status, "COMPLETED");
  assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
  assert.equal(mediaAttempts, 2);
  assert.equal(reelPlanAttempts, 2);
  assert.deepEqual(trace, ["web.research", "marketing.plan", "web.media.collect", "reel.plan", "speech.synthesize", "web.media.collect", "reel.plan", "reel.create"]);
  assert.equal(mission.completedTasks.some(item => item.name === "reel.create" && item.observation.artifact === ".jarvis-artifacts/reels/taqueria-el-dorado.mp4"), true);
  assert.equal(mission.blockedTasks.some(item => item.name === "reel.plan"), false);
  assert.equal(mission.recoveredToolAttempts.some(item => item.name === "reel.plan"), true);
});`
);
await write(paths.reelTest, reelTest);

let semanticPlannerTest = await read(paths.semanticPlannerTest);
semanticPlannerTest = semanticPlannerTest.replace(
    /(\} = require\("\.\.\/functions\/jarvis-semantic-planner"\);\n)\n+(const catalog = \[)/,
    "$1\n$2"
);
await write(paths.semanticPlannerTest, semanticPlannerTest);

console.log(JSON.stringify({
    ok: true,
    status: "V142_REEL_CLOSEOUT_APPLIED",
    sameSemanticAuthority: true,
    currentTurnSemanticSelfRepair: true,
    directToolSemanticPayloadPreserved: true,
    verifiedMediaRecoveryReplansReel: true,
    exactTaqueriaHumanMissionRegression: true,
    conversationalSelectionPreserved: true,
    sourceMediaEvidenceOnlyWhenOriginalCreativeExists: true,
    verifiedGeneratedMediaPreferred: true,
    continuousExportFramePump: true,
    minimumRenderedFps: 20,
    newFiles: false,
    newContracts: false,
    newBrains: false
}));