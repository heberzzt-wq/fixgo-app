import fs from "node:fs";

const paths = {
  functionsIndex: "functions/index.js",
  planner: "gestia-core/jarvis/jarvis.multifunction.planner.js",
  multitool: "gestia-core/jarvis/jarvis.multitool.pack.js",
  dependencies: "gestia-core/jarvis/jarvis.mission.dependencies.js",
  mediaBinder: "gestia-core/jarvis/jarvis.reel.media-binder.js",
  actuator: "gestia-core/jarvis/jarvis.actuator.pack.js",
  bridge: "jarvis-fs-bridge.js",
  binderTest: "tests/jarvis-reel-media-binder-v131.test.mjs",
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
function insertBeforeOnce(source, anchor, addition, marker, label) {
  if (source.includes(marker)) return source;
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT_${count}`);
  return source.replace(anchor, `${addition}\n${anchor}`);
}
function insertAfterOnce(source, anchor, addition, marker, label) {
  if (source.includes(marker)) return source;
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT_${count}`);
  return source.replace(anchor, `${anchor}\n${addition}`);
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
  "verifiedCreativeAssets.length > 0",
  '".jarvis-artifacts/images/"'
]);
requireMarkers(paths.actuator, [
  'name: "image.generate"',
  'name: "reel.create"'
]);
requireMarkers(paths.bridge, [
  "registerNexoWebMediaRoutes(app, { root });",
  "export function createJarvisFsBridgeApp"
]);
requireMarkers(paths.functionsIndex, [
  'const { GoogleGenAI } = require("@google/genai");',
  "assertJarvisAdminContext",
  "getGroundedGenAI"
]);

let planner = read(paths.planner);
const plannerPolicyAnchor =
  '    "Los medios recopilados desde publicaciones o fuentes externas son evidencia y referencia. Cuando la intencion semantica actual pide una pieza nueva u original basada en esa evidencia y no pide reutilizar literalmente el medio fuente, conserva los hechos verificados pero selecciona las capacidades existentes de generacion para crear visuales nuevos; usa image.edit solamente cuando la intencion sea transformar o adaptar un medio existente.",';
const plannerPolicyAddition = [
  plannerPolicyAnchor,
  '    "Cuando la salida solicitada requiera actuacion, personas u objetos realizando acciones en movimiento, continuidad narrativa o un video nuevo a partir de un guion, usa video.generate si esta disponible. No sustituyas una solicitud de video generativo por capturas, thumbnails, clips encontrados ni un slideshow de imagenes.",',
  '    "Para reels nuevos basados en investigacion o publicaciones externas, el medio externo sigue siendo evidencia. El flujo de produccion debe crear medios originales antes de reel.plan salvo que la intencion semantica haya pedido reutilizar o editar literalmente el material fuente.",',
  '    "Para marcas identificadas, conserva cualquier logotipo oficial verificado como un activo separado; no pidas al generador que invente, redibuje o imite un logotipo."'
].join("\n");
planner = replaceOnce(
  planner,
  plannerPolicyAnchor,
  plannerPolicyAddition,
  "V142_AV_GENERALIST_PRODUCTION_POLICY"
);
write(paths.planner, planner);

let dependencies = read(paths.dependencies);
dependencies = replaceOnce(
  dependencies,
  '    "image.edit": 28,\n',
  '    "image.edit": 28,\n    "video.generate": 28,\n',
  "V142_AV_VIDEO_STAGE"
);

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
  '        ["image.generate", "video.generate"].includes(String(call?.name || ""))\n' +
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
mediaBinder = replaceOnce(
  mediaBinder,
  '            output.startsWith(".jarvis-artifacts/web-media/") ||\n            output.startsWith(".jarvis-artifacts/images/")',
  '            output.startsWith(".jarvis-artifacts/web-media/") ||\n            output.startsWith(".jarvis-artifacts/images/") ||\n            output.startsWith(".jarvis-artifacts/videos/")',
  "V142_AV_BINDER_VIDEO_PATH"
);
mediaBinder = replaceOnce(
  mediaBinder,
  '            (output.startsWith(".jarvis-artifacts/images/")\n                ? clean(asset?.sourceTag) || "image.generate"\n                : "web.media.collect"),',
  '            (output.startsWith(".jarvis-artifacts/images/")\n                ? clean(asset?.sourceTag) || "image.generate"\n                : output.startsWith(".jarvis-artifacts/videos/")\n                    ? clean(asset?.sourceTag) || "video.generate"\n                    : "web.media.collect"),',
  "V142_AV_BINDER_VIDEO_ORIGIN"
);
mediaBinder = replaceOnce(
  mediaBinder,
  '        ["image.generate", "image.edit"].includes(String(task?.name || ""))',
  '        ["image.generate", "image.edit", "video.generate"].includes(String(task?.name || ""))',
  "V142_AV_BINDER_VIDEO_CREATIVE_TASK"
);
const creativeMapAnchor =
  '            const toolName = String(task?.name || "");\n            return verifiedSceneAsset({\n                kind: "image",\n                output: observation.output,\n                mimeType: observation.mimeType || observation.outputMimeType,';
const creativeMapReplacement =
  '            const toolName = String(task?.name || "");\n' +
  '            const mimeType = clean(observation.mimeType || observation.outputMimeType).toLowerCase();\n' +
  '            return verifiedSceneAsset({\n' +
  '                kind: mimeType.startsWith("video/") ? "video" : "image",\n' +
  '                output: observation.output,\n' +
  '                mimeType,';
mediaBinder = replaceOnce(
  mediaBinder,
  creativeMapAnchor,
  creativeMapReplacement,
  "V142_AV_BINDER_DYNAMIC_CREATIVE_KIND"
);
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
  '                                waitingFor: "image.generate|video.generate",\n' +
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
const videoTool = `        register(runtime, {
            name: "video.generate",
            description: "Genera video NUEVO desde un prompt o guion mediante el proveedor generativo configurado. Para narrativa continua puede recibir segments y el servidor extiende el video generado; no reutiliza clips web ni thumbnails. El resultado se importa al bridge local como MP4 físico verificado.",
            output: "VIDEO_GENERATION_RESULT",
            inputSchema: {
                prompt: "string",
                segments: "array",
                mode: "clip|continuous",
                aspectRatio: "9:16|16:9",
                output: "string",
                caseId: "string",
                objectiveId: "string"
            },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            missionDedupeBy: ["output"],
            execute: async (args = {}, context = {}) => {
                const cloud = await callAdminFunction("jarvisVideoGenerate", {
                    prompt: args.prompt || context.rawInput || "",
                    segments: Array.isArray(args.segments) ? args.segments : [],
                    mode: args.mode || "clip",
                    aspectRatio: args.aspectRatio || "9:16",
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || ""
                });
                if (cloud?.ok !== true || !cloud?.videoUrl) {
                    return cloud || {
                        ok: false,
                        status: "VIDEO_GENERATION_FAILED",
                        error: "VIDEO_GENERATION_FAILED"
                    };
                }
                const output = String(args.output || "").trim() ||
                    \`.jarvis-artifacts/videos/generated-\${Date.now()}.mp4\`;
                const imported = await bridgeRequest("/video/import", {
                    url: cloud.videoUrl,
                    output,
                    provider: cloud.provider || "google-veo",
                    model: cloud.model || "veo-3.1-generate-preview",
                    sourceStoragePath: cloud.storagePath || "",
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || ""
                }, 180000);
                const result = {
                    ...cloud,
                    ...imported,
                    ok: imported?.ok === true,
                    executionOk: imported?.ok === true,
                    objectiveSatisfied: imported?.ok === true,
                    persisted: imported?.ok === true,
                    generatedFromScript: true,
                    sourceReuse: false,
                    status: imported?.ok === true
                        ? "VIDEO_GENERATED_VERIFIED"
                        : (imported?.status || "VIDEO_IMPORT_FAILED")
                };
                recordCapabilityEvidence("video_generation", {
                    ok: result.ok === true,
                    status: result.status,
                    output: result.output || null,
                    bytes: result.bytes || null,
                    sha256: result.sha256 || null,
                    mimeType: result.mimeType || null,
                    durationSeconds: result.durationSeconds || cloud.durationSeconds || null,
                    provider: result.provider || cloud.provider || null,
                    model: result.model || cloud.model || null,
                    generatedFromScript: true,
                    checkedAt: new Date().toISOString()
                });
                return result;
            }
        }),`;
actuator = insertBeforeOnce(
  actuator,
  '        register(runtime, {\n            name: "reel.create",',
  videoTool,
  'name: "video.generate"',
  "V142_AV_REGISTER_VIDEO_GENERATE"
);

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

let bridge = read(paths.bridge);
const videoImportHelper = `async function importGeneratedVideoArtifact({
    url = "",
    output = "",
    provider = "google-veo",
    model = "",
    sourceStoragePath = "",
    caseId = "",
    objectiveId = "",
    root = DEFAULT_ROOT
} = {}) {
    const sourceUrl = new URL(String(url || "").trim());
    const allowedHost =
        sourceUrl.protocol === "https:" &&
        (
            sourceUrl.hostname === "storage.googleapis.com" ||
            sourceUrl.hostname === "firebasestorage.googleapis.com" ||
            sourceUrl.hostname.endsWith(".storage.googleapis.com")
        );
    if (!allowedHost) throw new Error("VIDEO_IMPORT_URL_NOT_ALLOWED");

    const targetOutput = String(output || "").trim().replaceAll("\\\\", "/");
    const target = artifactPath(
        targetOutput || \`.jarvis-artifacts/videos/generated-\${Date.now()}.mp4\`,
        root,
        [".mp4"]
    );

    const response = await fetch(sourceUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(120000)
    });
    if (!response.ok) {
        throw new Error(\`VIDEO_IMPORT_HTTP_\${response.status}\`);
    }
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > 120 * 1024 * 1024) {
        throw new Error("VIDEO_IMPORT_DECLARED_SIZE_EXCEEDED");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1024 || bytes.length > 120 * 1024 * 1024) {
        throw new Error("VIDEO_IMPORT_SIZE_INVALID");
    }
    if (bytes.subarray(4, 8).toString("latin1") !== "ftyp") {
        throw new Error("VIDEO_IMPORT_MP4_SIGNATURE_INVALID");
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const relativeOutput = path.relative(path.resolve(root), target).replaceAll("\\\\", "/");
    const artifact = registerArtifact({
        root,
        output: relativeOutput,
        metadata: {
            type: "video",
            origin: "video.generate",
            provider,
            model,
            caseId,
            objectiveId,
            mimeType: "video/mp4",
            status: "VIDEO_GENERATED_VERIFIED",
            approvalRequired: false,
            approved: true,
            approvedBy: "LOCAL_ARTIFACT_POLICY",
            editable: true,
            preview: true,
            downloadable: true,
            publishable: false,
            originalFile: sourceStoragePath
        }
    });

    if (artifact.sha256 !== sha256 || artifact.bytes !== bytes.length) {
        fs.rmSync(target, { force: true });
        throw new Error("VIDEO_IMPORT_POST_VERIFY_FAILED");
    }

    return {
        ok: true,
        executionOk: true,
        objectiveSatisfied: true,
        status: "VIDEO_GENERATED_VERIFIED",
        output: relativeOutput,
        bytes: bytes.length,
        sha256,
        mimeType: "video/mp4",
        provider,
        model,
        sourceStoragePath: sourceStoragePath || null,
        artifact,
        physicallyWritten: true
    };
}`;
bridge = insertBeforeOnce(
  bridge,
  'export function createJarvisFsBridgeApp({',
  videoImportHelper,
  "async function importGeneratedVideoArtifact",
  "V142_AV_BRIDGE_VIDEO_IMPORT_HELPER"
);

const videoRoute = `    app.post("/video/import", async (req, res) => {
        try {
            const result = await importGeneratedVideoArtifact({
                url: req.body?.url,
                output: req.body?.output,
                provider: req.body?.provider,
                model: req.body?.model,
                sourceStoragePath: req.body?.sourceStoragePath,
                caseId: req.body?.caseId,
                objectiveId: req.body?.objectiveId,
                root
            });
            return res.json({
                ...result,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
        catch(error) {
            const clientErrors = new Set([
                "VIDEO_IMPORT_URL_NOT_ALLOWED",
                "VIDEO_IMPORT_DECLARED_SIZE_EXCEEDED",
                "VIDEO_IMPORT_SIZE_INVALID",
                "VIDEO_IMPORT_MP4_SIGNATURE_INVALID",
                "ARTIFACT_PATH_REQUIRED",
                "ARTIFACT_EXTENSION_NOT_ALLOWED",
                "PATH_OUTSIDE_REPO"
            ]);
            return res.status(clientErrors.has(error.message) ? 400 : 502).json({
                ok: false,
                executionOk: false,
                objectiveSatisfied: false,
                status: "VIDEO_IMPORT_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });`;
bridge = insertAfterOnce(
  bridge,
  "    registerNexoWebMediaRoutes(app, { root });",
  videoRoute,
  'app.post("/video/import"',
  "V142_AV_BRIDGE_VIDEO_IMPORT_ROUTE"
);
write(paths.bridge, bridge);

let functionsIndex = read(paths.functionsIndex);
functionsIndex = insertAfterOnce(
  functionsIndex,
  'const crypto = require("crypto");',
  'const fs = require("fs");\nconst os = require("os");\nconst path = require("path");',
  'const os = require("os");',
  "V142_AV_FUNCTION_NODE_MEDIA_IMPORTS"
);

const videoFunction = `async function waitForJarvisVeoOperation(ai, operation, timeoutMs = 500000) {
    const startedAt = Date.now();
    let current = operation;
    while (!current?.done) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error("JARVIS_VIDEO_GENERATION_TIMEOUT");
        }
        await new Promise(resolve => setTimeout(resolve, 10000));
        current = await ai.operations.getVideosOperation({
            operation: current
        });
    }
    return current;
}

exports.jarvisVideoGenerate = functions
    .runWith({
        timeoutSeconds: 540,
        memory: "2GB",
        secrets: ["GEMINI_KEY"]
    })
    .https
    .onCall(async (data = {}, context) => {
        const actor = await assertJarvisAdminContext(
            context,
            "generar video"
        );
        const prompt = String(data?.prompt || "").trim();
        const requestedSegments = Array.isArray(data?.segments)
            ? data.segments
                .map(value => String(value || "").trim())
                .filter(Boolean)
                .slice(0, 5)
            : [];
        const segments = requestedSegments.length > 0
            ? requestedSegments
            : (prompt ? [prompt] : []);
        if (segments.length < 1) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "JARVIS_VIDEO_PROMPT_REQUIRED"
            );
        }
        if (segments.some(segment => segment.length > 3500)) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "JARVIS_VIDEO_SEGMENT_TOO_LONG"
            );
        }
        const aspectRatio =
            String(data?.aspectRatio || "9:16") === "16:9"
                ? "16:9"
                : "9:16";
        const continuous =
            String(data?.mode || "").trim().toLowerCase() === "continuous" ||
            segments.length > 1;
        const model = "veo-3.1-generate-preview";
        const ai = getGroundedGenAI();

        try {
            let operation = await ai.models.generateVideos({
                model,
                prompt: segments[0],
                config: {
                    aspectRatio,
                    resolution: "720p",
                    durationSeconds: "8",
                    numberOfVideos: 1,
                    personGeneration: "allow_all"
                }
            });
            operation = await waitForJarvisVeoOperation(ai, operation);
            let generated = operation?.response?.generatedVideos?.[0]?.video;
            if (!generated) {
                throw new Error("JARVIS_VIDEO_GENERATION_EMPTY");
            }

            if (continuous) {
                for (const segment of segments.slice(1)) {
                    operation = await ai.models.generateVideos({
                        model,
                        video: generated,
                        prompt: segment,
                        config: {
                            numberOfVideos: 1,
                            resolution: "720p"
                        }
                    });
                    operation = await waitForJarvisVeoOperation(ai, operation);
                    generated = operation?.response?.generatedVideos?.[0]?.video;
                    if (!generated) {
                        throw new Error("JARVIS_VIDEO_EXTENSION_EMPTY");
                    }
                }
            }

            const tempFile = path.join(
                os.tmpdir(),
                \`jarvis-veo-\${Date.now()}-\${Math.random().toString(36).slice(2, 10)}.mp4\`
            );
            try {
                await ai.files.download({
                    file: generated,
                    downloadPath: tempFile
                });
                const bytes = fs.readFileSync(tempFile);
                if (
                    bytes.length < 1024 ||
                    bytes.length > 120 * 1024 * 1024 ||
                    bytes.subarray(4, 8).toString("latin1") !== "ftyp"
                ) {
                    throw new Error("JARVIS_VIDEO_MP4_VERIFY_FAILED");
                }
                const sha256 = crypto
                    .createHash("sha256")
                    .update(bytes)
                    .digest("hex");
                const safeObjective = String(
                    data?.objectiveId ||
                    data?.caseId ||
                    "video"
                )
                    .normalize("NFD")
                    .replace(/[\\u0300-\\u036f]/g, "")
                    .replace(/[^a-zA-Z0-9_-]+/g, "-")
                    .replace(/^-+|-+$/g, "")
                    .slice(0, 80) || "video";
                const storagePath =
                    \`jarvis-generated-videos/\${actor.uid}/\${Date.now()}-\${safeObjective}.mp4\`;
                const bucket = admin
                    .storage()
                    .bucket("fixgo-44e4d.firebasestorage.app");
                const file = bucket.file(storagePath);
                await file.save(bytes, {
                    resumable: false,
                    metadata: {
                        contentType: "video/mp4",
                        metadata: {
                            provider: "google-veo",
                            model,
                            objectiveId: String(data?.objectiveId || ""),
                            caseId: String(data?.caseId || ""),
                            sha256
                        }
                    }
                });
                const [videoUrl] = await file.getSignedUrl({
                    action: "read",
                    expires: Date.now() + 60 * 60 * 1000
                });
                const durationSeconds =
                    segments.length === 1
                        ? 8
                        : 8 + (segments.length - 1) * 7;

                console.log(JSON.stringify({
                    level: "INFO",
                    message: "JARVIS_VIDEO_GENERATION_COMPLETE",
                    uid: actor.uid,
                    model,
                    segmentCount: segments.length,
                    continuous,
                    durationSeconds,
                    bytes: bytes.length,
                    sha256,
                    storagePath
                }));

                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "VIDEO_GENERATION_CLOUD_READY",
                    provider: "google-veo",
                    model,
                    videoUrl,
                    storagePath,
                    mimeType: "video/mp4",
                    bytes: bytes.length,
                    sha256,
                    aspectRatio,
                    durationSeconds,
                    segmentCount: segments.length,
                    continuous,
                    generatedFromScript: true,
                    sourceReuse: false,
                    objectiveId: String(data?.objectiveId || ""),
                    caseId: String(data?.caseId || "")
                };
            }
            finally {
                try {
                    fs.rmSync(tempFile, { force: true });
                }
                catch {}
            }
        }
        catch(error) {
            console.error(JSON.stringify({
                level: "ERROR",
                message: "JARVIS_VIDEO_GENERATION_FAILED",
                uid: actor.uid,
                error: error?.message || String(error)
            }));
            throw new functions.https.HttpsError(
                "internal",
                error?.message || "JARVIS_VIDEO_GENERATION_FAILED"
            );
        }
    });`;

functionsIndex = appendOnce(
  functionsIndex,
  "exports.jarvisVideoGenerate = functions",
  videoFunction
);
write(paths.functionsIndex, functionsIndex);

let binderTest = read(paths.binderTest);
binderTest = appendOnce(
  binderTest,
  'test("v142 accepts verified video.generate output as original reel creative"',
  `test("v142 accepts verified video.generate output as original reel creative", () => {
    const generatedVideo = ".jarvis-artifacts/videos/original-drama.mp4";
    const state = reelMediaCollectionState({
        completedTasks: [
            {
                name: "web.media.collect",
                observation: { mediaAssets: sceneAssets }
            },
            {
                name: "video.generate",
                observation: {
                    output: generatedVideo,
                    mimeType: "video/mp4",
                    bytes: 2400000,
                    sha256: "f".repeat(64)
                }
            }
        ]
    });
    assert.equal(state.creativeAttempted, true);
    assert.equal(state.creativeAssets.length, 1);
    assert.equal(state.assets.length, 1);
    assert.equal(state.assets[0].kind, "video");
    assert.equal(state.assets[0].origin, "video.generate");
    assert.equal(state.assets[0].output, generatedVideo);
});`
);
write(paths.binderTest, binderTest);

let reelTest = read(paths.reelTest);
reelTest = appendOnce(
  reelTest,
  'test("V142 audiovisual production exposes original video generation and verified local import"',
  `test("V142 audiovisual production exposes original video generation and verified local import", () => {
  const planner = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");
  const dependencies = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.mission.dependencies.js", import.meta.url), "utf8");
  const multitool = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multitool.pack.js", import.meta.url), "utf8");
  const actuator = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
  const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  const functionsIndex = fs.readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");

  assert.equal(planner.includes("usa video.generate si esta disponible"), true);
  assert.equal(planner.includes("No sustituyas una solicitud de video generativo por capturas"), true);
  assert.equal(dependencies.includes('"video.generate": 28'), true);
  assert.equal(dependencies.includes("ORIGINAL_REEL_CREATIVE_DEPENDENCY"), true);
  assert.equal(dependencies.includes("!explicitExistingMediaEdit"), true);
  assert.equal(multitool.includes("REEL_GENERATED_SCENE_MEDIA_REQUIRED"), true);
  assert.equal(multitool.includes('sourceMediaPolicy = clean(args.sourceMediaPolicy)'), true);
  assert.equal(actuator.includes('name: "video.generate"'), true);
  assert.equal(actuator.includes('callAdminFunction("jarvisVideoGenerate"'), true);
  assert.equal(actuator.includes('bridgeRequest("/video/import"'), true);
  assert.equal(actuator.includes('asset?.mediaRole === "brand_logo"'), true);
  assert.equal(bridge.includes('app.post("/video/import"'), true);
  assert.equal(bridge.includes("VIDEO_IMPORT_MP4_SIGNATURE_INVALID"), true);
  assert.equal(functionsIndex.includes("exports.jarvisVideoGenerate = functions"), true);
  assert.equal(functionsIndex.includes('model = "veo-3.1-generate-preview"'), true);
  assert.equal(functionsIndex.includes("getVideosOperation"), true);
  assert.equal(functionsIndex.includes("generatedFromScript: true"), true);
});`
);
write(paths.reelTest, reelTest);

for (const [file, markers] of [
  [paths.planner, ["video.generate", "No sustituyas una solicitud de video generativo"]],
  [paths.dependencies, ['"video.generate": 28', "ORIGINAL_REEL_CREATIVE_DEPENDENCY"]],
  [paths.mediaBinder, ['"video.generate"', ".jarvis-artifacts/videos/", "creativeAssets"]],
  [paths.multitool, ["REEL_GENERATED_SCENE_MEDIA_REQUIRED", "sourceMediaPolicy"]],
  [paths.actuator, ['name: "video.generate"', 'bridgeRequest("/video/import"', 'asset?.mediaRole === "brand_logo"']],
  [paths.bridge, ['app.post("/video/import"', "VIDEO_IMPORT_MP4_SIGNATURE_INVALID"]],
  [paths.functionsIndex, ["exports.jarvisVideoGenerate = functions", "veo-3.1-generate-preview", "getVideosOperation"]]
]) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`V142_AV_FINAL_MARKER_MISSING:${file}:${marker}`);
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_AUDIOVISUAL_PRODUCTION_ALIGNMENT_APPLIED",
  sameSemanticAuthority: true,
  originalReelCreativeDefault: true,
  sourceMediaEvidenceOnlyByDefault: true,
  verifiedBrandLogoPropagation: true,
  videoGenerateRegistered: true,
  videoProvider: "google-veo-3.1",
  continuousScriptVideo: true,
  physicalVideoImport: true,
  miniDramaFromScript: true,
  lexicalRouting: false,
  newFiles: false
}));
