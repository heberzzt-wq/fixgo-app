import fs from "node:fs";

const paths = {
  planner: "gestia-core/jarvis/jarvis.multifunction.planner.js",
  multitool: "gestia-core/jarvis/jarvis.multitool.pack.js",
  dependencies: "gestia-core/jarvis/jarvis.mission.dependencies.js",
  mediaBinder: "gestia-core/jarvis/jarvis.reel.media-binder.js",
  actuator: "gestia-core/jarvis/jarvis.actuator.pack.js",
  reelTest: "tests/jarvis-reel-native-mp4-v138.test.mjs"
};

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}
function write(file, value) {
  fs.writeFileSync(file, value, "utf8");
}
function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}
function appendOnce(source, marker, addition) {
  return source.includes(marker) ? source : `${source.trimEnd()}\n\n${addition.trim()}\n`;
}
function requireMarkers(file, markers) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`V142_AV_BASELINE_MISSING:${file}:${marker}`);
    }
  }
}

requireMarkers(paths.planner, [
  "GENERALIST_CURRENT_TURN_POLICY",
  "Los medios recopilados desde publicaciones o fuentes externas son evidencia y referencia"
]);
requireMarkers(paths.multitool, [
  "REEL_PLAN_ARGUMENT_SCHEMA",
  "buildReelPlanningSpec",
  "reelMediaCollectionState(context)"
]);
requireMarkers(paths.dependencies, [
  '"image.generate": 28',
  "promoteMarketingImageEdits"
]);
requireMarkers(paths.mediaBinder, [
  "reelMediaCollectionState",
  '".jarvis-artifacts/images/"',
  '"image.generate"'
]);
requireMarkers(paths.actuator, [
  'name: "image.generate"',
  'name: "reel.create"'
]);

let planner = read(paths.planner);
const plannerPolicyAnchor =
  '    "Los medios recopilados desde publicaciones o fuentes externas son evidencia y referencia. Cuando la intencion semantica actual pide una pieza nueva u original basada en esa evidencia y no pide reutilizar literalmente el medio fuente, conserva los hechos verificados pero selecciona las capacidades existentes de generacion para crear visuales nuevos; usa image.edit solamente cuando la intencion sea transformar o adaptar un medio existente.",';
const plannerPolicyAddition = [
  plannerPolicyAnchor,
  '    "Para reels nuevos basados en investigacion o publicaciones externas, el medio externo sigue siendo evidencia. El flujo de produccion debe crear visuales originales con las capacidades generativas realmente registradas antes de reel.plan, salvo que la intencion semantica haya pedido reutilizar o editar literalmente el material fuente.",',
  '    "Para marcas identificadas, conserva cualquier logotipo oficial verificado como un activo separado; no pidas al generador que invente, redibuje o imite un logotipo.",'
].join("\n");
planner = replaceOnce(
  planner,
  plannerPolicyAnchor,
  plannerPolicyAddition,
  "V142_AV_GENERALIST_PRODUCTION_POLICY"
);
write(paths.planner, planner);

let dependencies = read(paths.dependencies);
const promotionAnchor =
  '    const mediaAvailable = calls.some(call => call?.name === "web.media.collect");\n    if (!mediaAvailable || !available.has("image.edit")) return calls;';
const promotionReplacement =
  '    const mediaAvailable = calls.some(call => call?.name === "web.media.collect");\n' +
  '    const explicitExistingMediaEdit = calls.some(call =>\n' +
  '        call?.name === "image.edit" ||\n' +
  '        clean(call?.args?.sourceOutput)\n' +
  '    );\n' +
  '    if (!mediaAvailable || !available.has("image.edit") || !explicitExistingMediaEdit) return calls;';
dependencies = replaceOnce(
  dependencies,
  promotionAnchor,
  promotionReplacement,
  "V142_AV_NO_AUTOMATIC_SOURCE_EDIT"
);

const dependencyHookAnchor =
  '    calls = promoteMarketingImageEdits(calls, available);\n    calls = tagMarketingProductionCalls(calls);';
const dependencyHookReplacement =
  '    calls = promoteMarketingImageEdits(calls, available);\n' +
  '    const reelPlanIndex = calls.findIndex(call => call?.name === "reel.plan");\n' +
  '    const hasGeneratedCreative = calls.some(call =>\n' +
  '        String(call?.name || "") === "image.generate"\n' +
  '    );\n' +
  '    if (reelPlanIndex >= 0 && !hasGeneratedCreative && available.has("image.generate")) {\n' +
  '        const reelPlan = calls[reelPlanIndex];\n' +
  '        const policy = clean(reelPlan?.args?.sourceMediaPolicy).toLowerCase() || "generated";\n' +
  '        if (policy !== "reuse") {\n' +
  '            const scenes = Array.isArray(reelPlan?.args?.scenes)\n' +
  '                ? reelPlan.args.scenes.filter(Boolean).slice(0, 3)\n' +
  '                : [];\n' +
  '            const brandName = clean(reelPlan?.args?.brandName);\n' +
  '            const generatedCalls = (scenes.length > 0 ? scenes : [{ visual: reelPlan?.args?.title || brandName }])\n' +
  '                .map((scene, index) => ({\n' +
  '                    name: "image.generate",\n' +
  '                    args: {\n' +
  '                        prompt: [\n' +
  '                            "Crea una escena vertical ORIGINAL para un reel profesional.",\n' +
  '                            brandName ? `Marca: ${brandName}.` : "",\n' +
  '                            clean(scene?.visual) ? `Escena: ${clean(scene.visual)}.` : "",\n' +
  '                            clean(scene?.overlay) ? `Intencion visual: ${clean(scene.overlay)}.` : "",\n' +
  '                            "No copies capturas, thumbnails ni fotogramas de publicaciones de referencia.",\n' +
  '                            "No generes logotipos, marcas de agua ni texto incrustado; el logotipo oficial se compone por separado cuando exista evidencia verificada."\n' +
  '                        ].filter(Boolean).join(" "),\n' +
  '                        aspectRatio: "9:16",\n' +
  '                        imageSize: "1K",\n' +
  '                        output: `.jarvis-artifacts/images/reel-original-scene-${index + 1}.png`\n' +
  '                    },\n' +
  '                    approved: false,\n' +
  '                    reason: "ORIGINAL_REEL_CREATIVE_DEPENDENCY"\n' +
  '                }));\n' +
  '            calls.splice(reelPlanIndex, 0, ...generatedCalls);\n' +
  '        }\n' +
  '    }\n' +
  '    calls = tagMarketingProductionCalls(calls);';
dependencies = replaceOnce(
  dependencies,
  dependencyHookAnchor,
  dependencyHookReplacement,
  "V142_AV_INJECT_ORIGINAL_REEL_CREATIVE"
);
write(paths.dependencies, dependencies);

let mediaBinder = read(paths.mediaBinder);
const binderReturnAnchor =
  '    return {\n        attempted: collectionTasks.length > 0 || creativeTasks.length > 0,\n        assets: dedupeAssets(\n            verifiedCreativeAssets.length > 0\n                ? verifiedCreativeAssets\n                : verifiedCollectedAssets\n        )\n    };';
const binderReturnReplacement =
  '    const creativeAssets = dedupeAssets(verifiedCreativeAssets);\n' +
  '    const collectedSceneAssets = dedupeAssets(verifiedCollectedAssets);\n' +
  '    return {\n' +
  '        attempted: collectionTasks.length > 0 || creativeTasks.length > 0,\n' +
  '        creativeAttempted: creativeTasks.length > 0,\n' +
  '        creativeAssets,\n' +
  '        collectedSceneAssets,\n' +
  '        assets: creativeAssets.length > 0\n' +
  '            ? creativeAssets\n' +
  '            : collectedSceneAssets\n' +
  '    };';
mediaBinder = replaceOnce(
  mediaBinder,
  binderReturnAnchor,
  binderReturnReplacement,
  "V142_AV_BINDER_CREATIVE_STATE"
);
write(paths.mediaBinder, mediaBinder);

let multitool = read(paths.multitool);
multitool = replaceOnce(
  multitool,
  '        durationSeconds: { type: "number" },\n        scenes: {',
  '        durationSeconds: { type: "number" },\n        sourceMediaPolicy: { type: "string" },\n        scenes: {',
  "V142_AV_REEL_SCHEMA_MEDIA_POLICY"
);

const buildReelAnchor =
  '    const cta = clean(args.cta);\n    const durationSeconds = Number(args.durationSeconds);';
const buildReelReplacement =
  '    const cta = clean(args.cta);\n' +
  '    const durationSeconds = Number(args.durationSeconds);\n' +
  '    const sourceMediaPolicy = clean(args.sourceMediaPolicy).toLowerCase() === "reuse"\n' +
  '        ? "reuse"\n' +
  '        : "generated";';
multitool = replaceOnce(
  multitool,
  buildReelAnchor,
  buildReelReplacement,
  "V142_AV_REEL_DEFAULT_GENERATED_POLICY"
);
multitool = replaceOnce(
  multitool,
  '        cta,\n        durationSeconds,\n        format: { width: 1080, height: 1920, aspectRatio: "9:16" },',
  '        cta,\n        durationSeconds,\n        sourceMediaPolicy,\n        format: { width: 1080, height: 1920, aspectRatio: "9:16" },',
  "V142_AV_REEL_POLICY_RESULT"
);

const collectionAnchor =
  '                    const collectionRequired = requiredTools.includes("web.media.collect");\n                    const collection = reelMediaCollectionState(context);';
const collectionReplacement =
  '                    const collectionRequired = requiredTools.includes("web.media.collect");\n' +
  '                    const collection = reelMediaCollectionState(context);\n' +
  '                    const generatedMediaRequired =\n' +
  '                        String(result?.sourceMediaPolicy || "generated") !== "reuse";\n' +
  '                    if (generatedMediaRequired && collection.creativeAssets.length < 1) {\n' +
  '                        return {\n' +
  '                            ...result,\n' +
  '                            ok: false,\n' +
  '                            executionOk: true,\n' +
  '                            objectiveSatisfied: false,\n' +
  '                            blocked: false,\n' +
  '                            retryable: true,\n' +
  '                            requiresInput: false,\n' +
  '                            status: "REEL_GENERATED_SCENE_MEDIA_REQUIRED",\n' +
  '                            error: "ORIGINAL_CREATIVE_REQUIRED_BEFORE_REEL_PLAN",\n' +
  '                            missingInputs: [],\n' +
  '                            semanticMediaBinding: {\n' +
  '                                used: false,\n' +
  '                                waitingFor: "image.generate",\n' +
  '                                collectedEvidenceCount: collection.collectedSceneAssets.length\n' +
  '                            }\n' +
  '                        };\n' +
  '                    }';
multitool = replaceOnce(
  multitool,
  collectionAnchor,
  collectionReplacement,
  "V142_AV_REEL_FAIL_CLOSED_CREATIVE"
);
write(paths.multitool, multitool);

let actuator = read(paths.actuator);
const reelExecuteAnchor =
  '            execute: async (args = {}, context = {}) => {\n                const result = await bridgeRequest("/reel/create", {\n                    ...args,';
const reelExecuteReplacement =
  '            execute: async (args = {}, context = {}) => {\n' +
  '                let logoOutput = String(args.logoOutput || "").trim();\n' +
  '                if (!logoOutput && Array.isArray(context?.completedTasks)) {\n' +
  '                    for (const task of [...context.completedTasks].reverse()) {\n' +
  '                        if (String(task?.name || "") !== "web.media.collect") continue;\n' +
  '                        const candidates = [\n' +
  '                            task?.observation?.mediaAssets,\n' +
  '                            task?.observation?.assets,\n' +
  '                            task?.observation?.evidence?.mediaAssets\n' +
  '                        ].filter(Array.isArray).flat();\n' +
  '                        const logo = candidates.find(asset =>\n' +
  '                            asset?.mediaRole === "brand_logo" &&\n' +
  '                            String(asset?.mimeType || "").startsWith("image/") &&\n' +
  '                            String(asset?.output || "").startsWith(".jarvis-artifacts/")\n' +
  '                        );\n' +
  '                        if (logo?.output) {\n' +
  '                            logoOutput = String(logo.output);\n' +
  '                            break;\n' +
  '                        }\n' +
  '                    }\n' +
  '                }\n' +
  '                const result = await bridgeRequest("/reel/create", {\n' +
  '                    ...args,\n' +
  '                    ...(logoOutput ? { logoOutput } : {}),';
actuator = replaceOnce(
  actuator,
  reelExecuteAnchor,
  reelExecuteReplacement,
  "V142_AV_REEL_PROPAGATE_VERIFIED_LOGO"
);
write(paths.actuator, actuator);

let reelTest = read(paths.reelTest);
reelTest = appendOnce(
  reelTest,
  'test("V142 original reel production uses deployed image generation and no ghost video callable"',
  `test("V142 original reel production uses deployed image generation and no ghost video callable", () => {
  const planner = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");
  const dependencies = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.mission.dependencies.js", import.meta.url), "utf8");
  const multitool = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multitool.pack.js", import.meta.url), "utf8");
  const actuator = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
  const functionsIndex = fs.readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");

  assert.equal(planner.includes("el medio externo sigue siendo evidencia"), true);
  assert.equal(dependencies.includes("ORIGINAL_REEL_CREATIVE_DEPENDENCY"), true);
  assert.equal(dependencies.includes("!explicitExistingMediaEdit"), true);
  assert.equal(multitool.includes("REEL_GENERATED_SCENE_MEDIA_REQUIRED"), true);
  assert.equal(multitool.includes('waitingFor: "image.generate"'), true);
  assert.equal(actuator.includes('asset?.mediaRole === "brand_logo"'), true);
  assert.equal(actuator.includes('name: "video.generate"'), false);
  assert.equal(functionsIndex.includes("exports.jarvisVideoGenerate"), false);
});`
);
write(paths.reelTest, reelTest);

for (const [file, markers] of [
  [paths.planner, ["el medio externo sigue siendo evidencia", "logotipo oficial verificado"]],
  [paths.dependencies, ["ORIGINAL_REEL_CREATIVE_DEPENDENCY", "explicitExistingMediaEdit"]],
  [paths.mediaBinder, ["creativeAssets", "collectedSceneAssets"]],
  [paths.multitool, ["REEL_GENERATED_SCENE_MEDIA_REQUIRED", "sourceMediaPolicy", 'waitingFor: "image.generate"']],
  [paths.actuator, ['asset?.mediaRole === "brand_logo"']]
]) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`V142_AV_FINAL_MARKER_MISSING:${file}:${marker}`);
    }
  }
}

const actuatorFinal = read(paths.actuator);
const functionsFinal = read("functions/index.js");
if (actuatorFinal.includes('name: "video.generate"')) {
  throw new Error("V142_GHOST_VIDEO_TOOL_PRESENT");
}
if (functionsFinal.includes("exports.jarvisVideoGenerate")) {
  throw new Error("V142_GHOST_VIDEO_FUNCTION_PRESENT");
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_ORIGINAL_REEL_PRODUCTION_ALIGNMENT_APPLIED",
  sameSemanticAuthority: true,
  originalReelCreativeDefault: true,
  sourceMediaEvidenceOnlyByDefault: true,
  generatedCreativeTool: "image.generate",
  finalVideoTool: "reel.create",
  verifiedBrandLogoPropagation: true,
  ghostVideoTool: false,
  cloudFunctionsChanged: false,
  lexicalRouting: false,
  newFiles: false
}));
