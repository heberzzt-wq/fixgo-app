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

function insertBeforeOnce(file, anchor, addition, marker, label) {
  let source = sourceOf(file);
  if (source.includes(marker)) return;
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  source = source.replace(anchor, `${addition.trimEnd()}\n\n${anchor}`);
  write(file, source);
}

function appendOnce(file, marker, addition) {
  let source = sourceOf(file);
  if (source.includes(marker)) return;
  source = `${source.trimEnd()}\n\n${addition.trim()}\n`;
  write(file, source);
}

function ensureMiniDramaPolicy() {
  const file = "gestia-core/jarvis/jarvis.multifunction.planner.js";
  const marker = "Un guion de mini drama es una solicitud de produccion audiovisual";
  if (sourceOf(file).includes(marker)) return;
  const anchor = '    "Para marcas identificadas, conserva cualquier logotipo oficial verificado como un activo separado; no pidas al generador que invente, redibuje o imite un logotipo.",';
  const after = [
    anchor,
    '    "Un guion de mini drama es una solicitud de produccion audiovisual cuando la intencion semantica pide crear el video. Si video.generate esta registrado, usalo para producir actuacion y movimiento nuevos desde el guion; conversation.respond, un slideshow, una captura o un video encontrado no satisfacen esa produccion.",',
    '    "Para mini dramas nuevos, divide semanticamente el guion en hasta cuatro escenas consecutivas cuando ayude a la continuidad. video.generate puede extender el video generado entre escenas; los medios externos siguen siendo solo evidencia o referencia salvo reutilizacion solicitada de forma inequivoca.",'
  ].join("\n");
  replaceExactOnce(file, anchor, after, "V142_MINIDRAMA_SEMANTIC_POLICY");
}

function ensureVideoStageAndTimeout() {
  const dependencies = "gestia-core/jarvis/jarvis.mission.dependencies.js";
  if (!sourceOf(dependencies).includes('"video.generate": 35')) {
    replaceExactOnce(
      dependencies,
      '    "reel.create": 40,',
      '    "reel.create": 40,\n    "video.generate": 35,',
      "V142_VIDEO_MISSION_STAGE"
    );
  }

  const file = "gestia-core/jarvis/jarvis.mission.orchestrator.js";
  let source = sourceOf(file);
  const setupMarker = "const effectiveMissionTimeoutMs = videoGenerationRequested";
  const goodTimeoutLine = '        : Number(timeoutMs) || 180000;';
  const badTimeoutLine = '        : Math.max(Number(timeoutMs) || 180000, 1000);';

  if (!source.includes(setupMarker)) {
    const before = '    const persistence = storageOrMemory(storage);\n    const startedAt = Date.now();\n    const runtimeResults = [];';
    const after = [
      '    const persistence = storageOrMemory(storage);',
      '    const startedAt = Date.now();',
      '    const videoGenerationRequested =',
      '        (Array.isArray(requiredToolNames) && requiredToolNames.includes("video.generate")) ||',
      '        (Array.isArray(initialToolCalls) && initialToolCalls.some(call => call?.name === "video.generate"));',
      '    const effectiveMissionTimeoutMs = videoGenerationRequested',
      '        ? Math.max(Number(timeoutMs) || 180000, 1800000)',
      goodTimeoutLine,
      '    const runtimeResults = [];'
    ].join("\n");
    replaceExactOnce(file, before, after, "V142_VIDEO_MISSION_TIMEOUT_SETUP");
    source = sourceOf(file);
  }

  if (source.includes(badTimeoutLine)) {
    replaceExactOnce(
      file,
      badTimeoutLine,
      goodTimeoutLine,
      "V142_VIDEO_NON_VIDEO_TIMEOUT_PRESERVED"
    );
  }

  if (sourceOf(file).includes('        if (Date.now() - startedAt >= timeoutMs) {')) {
    replaceExactOnce(
      file,
      '        if (Date.now() - startedAt >= timeoutMs) {',
      '        if (Date.now() - startedAt >= effectiveMissionTimeoutMs) {',
      "V142_VIDEO_MISSION_TIMEOUT_USE"
    );
  }
}

function ensureVerifiedVideoImport() {
  const file = "jarvis-fs-bridge.js";
  const helperMarker = "export async function saveGeneratedVideoArtifactFromUrl(";
  if (!sourceOf(file).includes(helperMarker)) {
    const helper = [
      'export async function saveGeneratedVideoArtifactFromUrl({',
      '    url = "",',
      '    expectedSha256 = "",',
      '    output = "",',
      '    root = DEFAULT_ROOT,',
      '    fetchImpl = globalThis.fetch,',
      '    timeoutMs = 180000',
      '} = {}) {',
      '    const rawUrl = String(url || "").trim();',
      '    let parsed;',
      '    try { parsed = new URL(rawUrl); }',
      '    catch { throw new Error("VIDEO_IMPORT_URL_INVALID"); }',
      '    const host = parsed.hostname.toLowerCase();',
      '    if (',
      '        parsed.protocol !== "https:" ||',
      '        !(host === "storage.googleapis.com" || host.endsWith(".storage.googleapis.com"))',
      '    ) {',
      '        throw new Error("VIDEO_IMPORT_URL_NOT_ALLOWED");',
      '    }',
      '    const expected = String(expectedSha256 || "").trim().toLowerCase();',
      '    if (!/^[a-f0-9]{64}$/.test(expected)) {',
      '        throw new Error("VIDEO_IMPORT_SHA256_REQUIRED");',
      '    }',
      '    if (typeof fetchImpl !== "function") {',
      '        throw new Error("VIDEO_IMPORT_FETCH_UNAVAILABLE");',
      '    }',
      '    const response = await fetchImpl(rawUrl, {',
      '        method: "GET",',
      '        redirect: "follow",',
      '        signal: AbortSignal.timeout(Math.min(Math.max(Number(timeoutMs) || 180000, 10000), 240000))',
      '    });',
      '    if (!response?.ok) {',
      '        throw new Error(`VIDEO_IMPORT_HTTP_${response?.status || 0}`);',
      '    }',
      '    const mimeType = String(response.headers?.get?.("content-type") || "video/mp4")',
      '        .split(";")[0].trim().toLowerCase();',
      '    if (mimeType !== "video/mp4") {',
      '        throw new Error("VIDEO_IMPORT_MIME_INVALID");',
      '    }',
      '    const bytes = Buffer.from(await response.arrayBuffer());',
      '    if (bytes.length < 100000 || bytes.length > 90 * 1024 * 1024) {',
      '        throw new Error("VIDEO_IMPORT_BYTES_OUT_OF_RANGE");',
      '    }',
      '    if (bytes.subarray(4, 8).toString("ascii") !== "ftyp") {',
      '        throw new Error("VIDEO_IMPORT_MP4_SIGNATURE_INVALID");',
      '    }',
      '    const sha256 = createHash("sha256").update(bytes).digest("hex");',
      '    if (sha256 !== expected) {',
      '        throw new Error("VIDEO_IMPORT_SHA256_MISMATCH");',
      '    }',
      '    const relativeOutput = String(output || "").trim().replaceAll("\\\\", "/") ||',
      '        `.jarvis-artifacts/videos/jarvis-video-${Date.now()}-${sha256.slice(0, 12)}.mp4`;',
      '    if (',
      '        !relativeOutput.startsWith(".jarvis-artifacts/videos/") ||',
      '        relativeOutput.includes("../") ||',
      '        !relativeOutput.toLowerCase().endsWith(".mp4")',
      '    ) {',
      '        throw new Error("VIDEO_IMPORT_OUTPUT_INVALID");',
      '    }',
      '    const target = artifactPath(relativeOutput, root, [".mp4"]);',
      '    fs.writeFileSync(target, bytes);',
      '    const writtenBytes = fs.statSync(target).size;',
      '    const writtenSha256 = sha256FileBounded(target);',
      '    if (writtenBytes !== bytes.length || writtenSha256 !== sha256) {',
      '        fs.rmSync(target, { force: true });',
      '        throw new Error("VIDEO_IMPORT_POST_VERIFY_FAILED");',
      '    }',
      '    return {',
      '        ok: true,',
      '        status: "VIDEO_IMPORTED_VERIFIED",',
      '        output: path.relative(path.resolve(root), target).replace(/\\\\/g, "/"),',
      '        mimeType: "video/mp4",',
      '        bytes: writtenBytes,',
      '        sha256: writtenSha256,',
      '        physicallyWritten: true',
      '    };',
      '}'
    ].join("\n");
    insertBeforeOnce(
      file,
      "function decodeBoundedBase64(",
      helper,
      helperMarker,
      "V142_VIDEO_IMPORT_HELPER"
    );
  }

  const routeMarker = 'app.post("/video/import"';
  if (!sourceOf(file).includes(routeMarker)) {
    const route = [
      '    app.post("/video/import", async (req, res) => {',
      '        try {',
      '            const saved = await saveGeneratedVideoArtifactFromUrl({',
      '                url: req.body?.url,',
      '                expectedSha256: req.body?.expectedSha256 || req.body?.sha256,',
      '                output: req.body?.output,',
      '                root',
      '            });',
      '            const artifact = registerArtifact({',
      '                root,',
      '                output: saved.output,',
      '                metadata: {',
      '                    source: "video.generate",',
      '                    provider: req.body?.provider || "google-veo",',
      '                    model: req.body?.model || null,',
      '                    mimeType: saved.mimeType,',
      '                    bytes: saved.bytes,',
      '                    sha256: saved.sha256,',
      '                    physicallyWritten: true',
      '                }',
      '            });',
      '            return res.json({',
      '                ...saved,',
      '                artifactId: artifact?.artifactId || artifact?.id || null,',
      '                artifact',
      '            });',
      '        }',
      '        catch(error) {',
      '            return res.status(400).json({',
      '                ok: false,',
      '                status: "VIDEO_IMPORT_FAILED",',
      '                error: error.message,',
      '                version: JARVIS_FS_BRIDGE_VERSION',
      '            });',
      '        }',
      '    });'
    ].join("\n");
    insertBeforeOnce(
      file,
      '    app.post("/image", (req, res) => {',
      route,
      routeMarker,
      "V142_VIDEO_IMPORT_ROUTE"
    );
  }
}

function ensureRealVideoTool() {
  const file = "gestia-core/jarvis/jarvis.actuator.pack.js";
  const marker = 'name: "video.generate"';
  if (sourceOf(file).includes(marker)) return;

  const tool = [
    '        register(runtime, {',
    '            name: "video.generate",',
    '            description: "Genera video NUEVO real desde un guion o escenas semanticas mediante Veo. Para mini dramas produce actuacion, movimiento y audio nativos; puede extender hasta cuatro escenas consecutivas. No reutiliza videos externos salvo que el usuario lo pida de forma explicita.",',
    '            output: "VIDEO_GENERATION_RESULT",',
    '            inputSchema: {',
    '                script: "string",',
    '                prompt: "string",',
    '                scenes: "array<{prompt|visual|description:string}>",',
    '                aspectRatio: "9:16|16:9",',
    '                output: "string",',
    '                caseId: "string",',
    '                objectiveId: "string"',
    '            },',
    '            mutates: true,',
    '            requiresApproval: false,',
    '            userArtifact: true,',
    '            missionDedupeBy: ["output"],',
    '            execute: async (args = {}, context = {}) => {',
    '                const script = String(args.script || args.prompt || context.rawInput || "").trim();',
    '                const rawScenes = Array.isArray(args.scenes) ? args.scenes : [];',
    '                const scenePrompts = rawScenes',
    '                    .map(scene => typeof scene === "string"',
    '                        ? scene.trim()',
    '                        : String(scene?.prompt || scene?.visual || scene?.description || "").trim())',
    '                    .filter(Boolean)',
    '                    .slice(0, 4);',
    '                const prompts = (scenePrompts.length > 0 ? scenePrompts : [script]).filter(Boolean);',
    '                if (prompts.length < 1) {',
    '                    return { ok: false, executionOk: false, objectiveSatisfied: false, status: "VIDEO_SCRIPT_REQUIRED", error: "VIDEO_SCRIPT_REQUIRED" };',
    '                }',
    '                const aspectRatio = args.aspectRatio === "16:9" ? "16:9" : "9:16";',
    '                let previousVideo = null;',
    '                let finalCloud = null;',
    '                for (let index = 0; index < prompts.length; index += 1) {',
    '                    const segmentPrompt = [',
    '                        index === 0 ? script : "",',
    '                        prompts[index],',
    '                        index === 0',
    '                            ? "Crea el inicio del mini drama como video cinematografico real con personas, accion, dialogo o audio coherente cuando el guion lo indique."',
    '                            : "Continua exactamente el video anterior manteniendo personajes, vestuario, locacion, accion y continuidad narrativa."',
    '                    ].filter(Boolean).join(" ").slice(0, 10000);',
    '                    const started = await callAdminFunction("jarvisVideoGenerate", {',
    '                        action: "start", prompt: segmentPrompt, previousVideo, aspectRatio',
    '                    });',
    '                    if (started?.ok !== true || !started?.operationName) {',
    '                        return { ...started, ok: false, executionOk: false, objectiveSatisfied: false, status: started?.status || "VIDEO_GENERATION_START_FAILED" };',
    '                    }',
    '                    let segment = null;',
    '                    for (let attempt = 0; attempt < 36; attempt += 1) {',
    '                        await new Promise(resolve => setTimeout(resolve, 10000));',
    '                        const polled = await callAdminFunction("jarvisVideoGenerate", {',
    '                            action: "poll", operationName: started.operationName, finalize: index === prompts.length - 1',
    '                        });',
    '                        if (polled?.ok !== true) {',
    '                            return { ...polled, ok: false, executionOk: false, objectiveSatisfied: false, status: polled?.status || "VIDEO_GENERATION_POLL_FAILED" };',
    '                        }',
    '                        if (polled?.done !== true) continue;',
    '                        segment = polled;',
    '                        break;',
    '                    }',
    '                    if (!segment) {',
    '                        return { ok: false, executionOk: false, objectiveSatisfied: false, status: "VIDEO_GENERATION_TIMEOUT", error: "VIDEO_GENERATION_TIMEOUT" };',
    '                    }',
    '                    if (index < prompts.length - 1) {',
    '                        if (!segment?.video?.uri) {',
    '                            return { ok: false, executionOk: false, objectiveSatisfied: false, status: "VIDEO_EXTENSION_REFERENCE_MISSING", error: "VIDEO_EXTENSION_REFERENCE_MISSING" };',
    '                        }',
    '                        previousVideo = segment.video;',
    '                    } else {',
    '                        finalCloud = segment;',
    '                    }',
    '                }',
    '                if (!finalCloud?.downloadUrl || !finalCloud?.sha256) {',
    '                    return { ok: false, executionOk: false, objectiveSatisfied: false, status: "VIDEO_GENERATION_FINAL_OUTPUT_MISSING", error: "VIDEO_GENERATION_FINAL_OUTPUT_MISSING" };',
    '                }',
    '                const requestedOutput = String(args.output || "").trim().replaceAll("\\\\", "/");',
    '                const output =',
    '                    requestedOutput.startsWith(".jarvis-artifacts/videos/") &&',
    '                    requestedOutput.toLowerCase().endsWith(".mp4") &&',
    '                    !requestedOutput.includes("../")',
    '                        ? requestedOutput',
    '                        : `.jarvis-artifacts/videos/mini-drama-${Date.now()}.mp4`;',
    '                let artifact;',
    '                try {',
    '                    artifact = await bridgeRequest("/video/import", {',
    '                        url: finalCloud.downloadUrl,',
    '                        expectedSha256: finalCloud.sha256,',
    '                        output,',
    '                        provider: finalCloud.provider || "google-veo",',
    '                        model: finalCloud.model',
    '                    }, 240000);',
    '                } finally {',
    '                    if (finalCloud?.storageObject) {',
    '                        try { await callAdminFunction("jarvisVideoGenerate", { action: "cleanup", storageObject: finalCloud.storageObject }); } catch {}',
    '                    }',
    '                }',
    '                const durationSeconds = 8 + Math.max(0, prompts.length - 1) * 7;',
    '                const finalResult = {',
    '                    ...artifact,',
    '                    ok: artifact?.ok === true,',
    '                    executionOk: artifact?.ok === true,',
    '                    objectiveSatisfied: artifact?.ok === true,',
    '                    status: artifact?.ok === true ? "VIDEO_GENERATED_VERIFIED" : (artifact?.status || "VIDEO_IMPORT_FAILED"),',
    '                    provider: finalCloud.provider || "google-veo",',
    '                    model: finalCloud.model,',
    '                    durationSeconds,',
    '                    sceneCount: prompts.length,',
    '                    sourceMode: "script_to_video",',
    '                    physicallyWritten: artifact?.physicallyWritten === true',
    '                };',
    '                recordCapabilityEvidence("video_generation", {',
    '                    ok: finalResult.ok === true && finalResult.physicallyWritten === true,',
    '                    status: finalResult.status,',
    '                    output: finalResult.output || null,',
    '                    bytes: finalResult.bytes || null,',
    '                    sha256: finalResult.sha256 || null,',
    '                    model: finalResult.model || null,',
    '                    checkedAt: new Date().toISOString()',
    '                });',
    '                return finalResult;',
    '            }',
    '        }),' 
  ].join("\n");

  insertBeforeOnce(
    file,
    '        register(runtime, {\n            name: "image.generate",',
    tool,
    marker,
    "V142_VIDEO_GENERATE_TOOL"
  );
}

function ensureVideoTests() {
  const file = "tests/jarvis-reel-native-mp4-v138.test.mjs";
  let source = sourceOf(file);
  if (!source.includes('import { createHash } from "node:crypto";')) {
    replaceExactOnce(
      file,
      'import path from "node:path";',
      'import path from "node:path";\nimport { createHash } from "node:crypto";',
      "V142_VIDEO_TEST_CRYPTO_IMPORT"
    );
  }
  source = sourceOf(file);
  if (!source.includes("saveGeneratedVideoArtifactFromUrl,")) {
    replaceExactOnce(
      file,
      '    exportReelVideoWithChrome,\n    speechSynthesisRecoveryInputs,',
      '    exportReelVideoWithChrome,\n    saveGeneratedVideoArtifactFromUrl,\n    speechSynthesisRecoveryInputs,',
      "V142_VIDEO_TEST_BRIDGE_IMPORT"
    );
  }
  source = sourceOf(file);
  if (source.includes('test("V142 original reel production uses deployed image generation and no ghost video callable"')) {
    replaceExactOnce(
      file,
      'test("V142 original reel production uses deployed image generation and no ghost video callable"',
      'test("V142 original reel production keeps original images and exposes real script to video"',
      "V142_VIDEO_TEST_NAME"
    );
  }
  source = sourceOf(file);
  if (source.includes('  const functionsIndex = fs.readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");')) {
    replaceExactOnce(
      file,
      '  const functionsIndex = fs.readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");',
      '  const functionsEntry = fs.readFileSync(new URL("../functions/secure-entry-alias.js", import.meta.url), "utf8");',
      "V142_VIDEO_TEST_FUNCTION_ENTRY"
    );
  }
  source = sourceOf(file);
  const oldExpectation = '  assert.equal(actuator.includes(\'name: "video.generate"\'), false);\n  assert.equal(functionsIndex.includes("exports.jarvisVideoGenerate"), false);';
  if (source.includes(oldExpectation)) {
    replaceExactOnce(
      file,
      oldExpectation,
      '  assert.equal(actuator.includes(\'name: "video.generate"\'), true);\n  assert.equal(functionsEntry.includes("jarvisVideoGenerate"), true);',
      "V142_VIDEO_TEST_EXPECT_REAL_TOOL"
    );
  }

  appendOnce(
    file,
    'test("V142 imports generated Veo MP4 bytes into the physical artifact studio"',
    `test("V142 imports generated Veo MP4 bytes into the physical artifact studio", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v142-video-import-"));
  try {
    const bytes = Buffer.alloc(120000);
    bytes.writeUInt32BE(24, 0);
    bytes.write("ftyp", 4, "ascii");
    bytes.write("isom", 8, "ascii");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const saved = await saveGeneratedVideoArtifactFromUrl({
      url: "https://storage.googleapis.com/fixgo-44e4d.firebasestorage.app/test.mp4?signature=v142",
      expectedSha256: sha256,
      output: ".jarvis-artifacts/videos/v142-mini-drama.mp4",
      root,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: name => String(name).toLowerCase() === "content-type" ? "video/mp4" : null },
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      })
    });
    assert.equal(saved.ok, true);
    assert.equal(saved.status, "VIDEO_IMPORTED_VERIFIED");
    assert.equal(saved.sha256, sha256);
    assert.equal(saved.bytes, bytes.length);
    assert.equal(saved.physicallyWritten, true);
    assert.equal(fs.existsSync(path.join(root, saved.output)), true);
  }
  finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});`
  );
}

ensureMiniDramaPolicy();
ensureVideoStageAndTimeout();
ensureVerifiedVideoImport();
ensureRealVideoTool();
ensureVideoTests();

const checks = [
  ["gestia-core/jarvis/jarvis.multifunction.planner.js", [
    "el medio externo sigue siendo evidencia",
    "Un guion de mini drama es una solicitud de produccion audiovisual"
  ]],
  ["gestia-core/jarvis/jarvis.mission.dependencies.js", [
    '"image.generate": 28',
    '"video.generate": 35',
    "ORIGINAL_REEL_CREATIVE_DEPENDENCY"
  ]],
  ["gestia-core/jarvis/jarvis.reel.media-binder.js", [
    "creativeObservationAsset",
    "creativeAssets",
    "collectedSceneAssets"
  ]],
  ["gestia-core/jarvis/jarvis.mission.orchestrator.js", [
    "videoGenerationRequested",
    "effectiveMissionTimeoutMs",
    '        : Number(timeoutMs) || 180000;'
  ]],
  ["gestia-core/jarvis/jarvis.actuator.pack.js", [
    'name: "image.generate"',
    'name: "video.generate"',
    'name: "reel.create"',
    'callAdminFunction("jarvisVideoGenerate"',
    'bridgeRequest("/video/import"'
  ]],
  ["functions/secure-entry-alias.js", [
    "jarvisVideoGenerate",
    "veo-3.1-generate-preview",
    "VIDEO_GENERATION_STARTED",
    "VIDEO_GENERATED_CLOUD_VERIFIED"
  ]],
  ["jarvis-fs-bridge.js", [
    "REEL_VIDEO_FRAME_DENSITY_LOW:",
    "averageRenderedFps < 20",
    "saveGeneratedVideoArtifactFromUrl",
    'app.post("/video/import"'
  ]],
  ["tests/jarvis-reel-native-mp4-v138.test.mjs", [
    "V142 original reel production keeps original images and exposes real script to video",
    "V142 imports generated Veo MP4 bytes into the physical artifact studio"
  ]]
];

for (const [file, markers] of checks) {
  const source = sourceOf(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`V142_CLOSEOUT_STATE_REQUIRED:${file}:${marker}`);
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_ORIGINAL_REEL_AND_MINIDRAMA_CLOSEOUT_MATERIALIZED",
  sameSemanticAuthority: true,
  originalReelCreativeDefault: true,
  generatedCreativeTool: "image.generate",
  finalReelTool: "reel.create",
  miniDramaTool: "video.generate",
  miniDramaProvider: "google-veo-3.1",
  miniDramaPhysicalImport: true,
  nonVideoDeadlineSemanticsPreserved: true,
  minimumRenderedFps: 20,
  cloudFunction: "jarvisVideoGenerate",
  lexicalRouting: false,
  newFiles: false,
  newBrains: false,
  newWorkflow: false
}));

function ensureHuMoRuntimeCertificationTransportHardening() {
  const bridgeFile = "jarvis-fs-bridge.js";
  replaceExactOnce(
    bridgeFile,
    [
      '        const started = await engine.start({',
      '            selectedBackend: "humo-1.7b-identity",',
      '            output: ".jarvis-artifacts/videos/humo-runtime-certification.mp4",',
      '            missionId: "MISSION-HUMO-RUNTIME-" + certificationId,',
      '            objectiveId: "OBJECTIVE-HUMO-RUNTIME-" + certificationId,',
      '            obligationId: "video.runtime-certification:" + certificationId,',
      '            rootInstructionHash',
      '        });',
      '        operationName = started?.operationName || null;',
      '        if (started?.ok !== true || !operationName) {',
      '            throw new Error(started?.error || started?.status || "HUMO_RUNTIME_CERTIFICATION_START_FAILED");',
      '        }'
    ].join("\n"),
    [
      '        const startPayload = {',
      '            selectedBackend: "humo-1.7b-identity",',
      '            output: ".jarvis-artifacts/videos/humo-runtime-certification.mp4",',
      '            missionId: "MISSION-HUMO-RUNTIME-" + certificationId,',
      '            objectiveId: "OBJECTIVE-HUMO-RUNTIME-" + certificationId,',
      '            obligationId: "video.runtime-certification:" + certificationId,',
      '            rootInstructionHash',
      '        };',
      '        const safeStartStages = new Set(["duplicate_guard", "availability"]);',
      '        const maximumSafeStartAttempts = 3;',
      '        let started = null;',
      '        for (let attempt = 1; attempt <= maximumSafeStartAttempts; attempt += 1) {',
      '            started = await engine.start(startPayload);',
      '            operationName = started?.operationName || operationName || null;',
      '            if (started?.ok === true && operationName) break;',
      '            const failureStage = String(started?.failureStage || "").trim();',
      '            const podId = started?.podId || started?.remoteWorker?.podId || null;',
      '            const retryablePreProvision =',
      '                started?.retryable === true &&',
      '                safeStartStages.has(failureStage) &&',
      '                !podId &&',
      '                !started?.remoteJobId;',
      '            log({',
      '                ok: false,',
      '                status: retryablePreProvision',
      '                    ? "HUMO_RUNTIME_CERTIFICATION_START_RETRYABLE"',
      '                    : "HUMO_RUNTIME_CERTIFICATION_START_FAILED",',
      '                attempt,',
      '                maximumAttempts: maximumSafeStartAttempts,',
      '                operationName: started?.operationName || null,',
      '                failureStage: failureStage || null,',
      '                providerCode: started?.providerCode || null,',
      '                providerMessage: started?.providerMessage || null,',
      '                podId,',
      '                retryablePreProvision',
      '            });',
      '            if (!retryablePreProvision || attempt >= maximumSafeStartAttempts) {',
      '                const startError = new Error(',
      '                    started?.error || started?.status || "HUMO_RUNTIME_CERTIFICATION_START_FAILED"',
      '                );',
      '                startError.stage = failureStage || null;',
      '                startError.providerCode = started?.providerCode || null;',
      '                startError.providerMessage = started?.providerMessage || null;',
      '                startError.podId = podId;',
      '                startError.retryable = started?.retryable === true;',
      '                throw startError;',
      '            }',
      '            await sleepMs(2000 * attempt);',
      '        }',
      '        if (started?.ok !== true || !operationName) {',
      '            throw new Error("HUMO_RUNTIME_CERTIFICATION_START_FAILED");',
      '        }'
    ].join("\n"),
    "V142_HUMO_RUNTIME_CERT_SAFE_PREPROVISION_RETRY"
  );

  replaceExactOnce(
    bridgeFile,
    [
      '            .catch(error => {',
      '                console.error(JSON.stringify({',
      '                    ok: false,',
      '                    status: error?.message || "HUMO_RUNTIME_CERTIFICATION_FAILED"',
      '                }));',
      '                process.exitCode = 1;',
      '            });'
    ].join("\n"),
    [
      '            .catch(error => {',
      '                console.error(JSON.stringify({',
      '                    ok: false,',
      '                    status: error?.message || "HUMO_RUNTIME_CERTIFICATION_FAILED",',
      '                    failureStage: error?.stage || null,',
      '                    providerCode: error?.providerCode || null,',
      '                    providerMessage: error?.providerMessage || null,',
      '                    podId: error?.podId || null',
      '                }));',
      '                process.exitCode = 1;',
      '            });'
    ].join("\n"),
    "V142_HUMO_RUNTIME_CERT_CLI_DIAGNOSTICS"
  );

  const engineFile = "jarvis-local-video-engine.js";
  replaceExactOnce(
    engineFile,
    '    const bootstrapTimeoutSeconds = runpodPositiveNumber(env.JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS, 1800);\n    const inferenceTimeoutSeconds = runpodPositiveNumber(',
    [
      '    const bootstrapTimeoutSeconds = runpodPositiveNumber(env.JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS, 1800);',
      '    const humoTorchStageTimeoutSeconds = Math.min(',
      '        300,',
      '        Math.max(30, runpodPositiveNumber(env.JARVIS_HUMO_TORCH_STAGE_TIMEOUT_SECONDS, 120))',
      '    );',
      '    const inferenceTimeoutSeconds = runpodPositiveNumber('
    ].join("\n"),
    "V142_HUMO_TORCH_STAGE_TIMEOUT_CONFIG"
  );

  replaceExactOnce(
    engineFile,
    [
      '                cacheStatus: "CACHE_MISS",',
      '                bootstrapTimeoutSeconds,',
      '                inferenceTimeoutSeconds,',
      '                provisionedAt,'
    ].join("\n"),
    [
      '                cacheStatus: "CACHE_MISS",',
      '                bootstrapTimeoutSeconds,',
      '                humoTorchStageTimeoutSeconds,',
      '                inferenceTimeoutSeconds,',
      '                provisionedAt,'
    ].join("\n"),
    "V142_HUMO_TORCH_STAGE_TIMEOUT_STATE"
  );

  replaceExactOnce(
    engineFile,
    [
      '            if (state.phase === "BOOTSTRAPPING") {',
      '                const progress = await readBootstrapProgress(state);',
      '                state = persistBootstrapProgress(loaded.file, state, progress);',
      '                const lastProgressMs = Date.parse(String(state.lastBootstrapProgressAt || state.bootstrapStartedAt || ""));'
    ].join("\n"),
    [
      '            if (state.phase === "BOOTSTRAPPING") {',
      '                const progress = await readBootstrapProgress(state);',
      '                state = persistBootstrapProgress(loaded.file, state, progress);',
      '                const humoTorchStageStartedMs =',
      '                    state.runtimeKind === "humo" &&',
      '                    progress?.stage === "HUMO_TORCH" &&',
      '                    progress?.status === "RUNNING"',
      '                        ? Date.parse(String(state.stageTimeline?.HUMO_TORCH?.startedAt || progress.at || ""))',
      '                        : Number.NaN;',
      '                if (',
      '                    Number.isFinite(humoTorchStageStartedMs) &&',
      '                    (now().getTime() - humoTorchStageStartedMs) / 1000 >=',
      '                        Number(state.humoTorchStageTimeoutSeconds || 120)',
      '                ) {',
      '                    const bootstrapDiagnostics = await captureBootstrapFailureDiagnostics(state);',
      '                    state = withStage(state, "HUMO_TORCH", "TIMEOUT");',
      '                    state = withStage(state, "bootstrap", "TIMEOUT");',
      '                    state = writeState(loaded.file, state, {',
      '                        phase: "HUMO_TORCH_TIMEOUT",',
      '                        bootstrapDiagnostics,',
      '                        stageTimeline: state.stageTimeline',
      '                    });',
      '                    await writeLocalFailure(',
      '                        operation,',
      '                        resultFile,',
      '                        "RUNPOD_HUMO_TORCH_STAGE_TIMEOUT",',
      '                        false,',
      '                        { bootstrapDiagnostics }',
      '                    );',
      '                    return {',
      '                        ok: false,',
      '                        done: true,',
      '                        status: "RUNPOD_HUMO_TORCH_STAGE_TIMEOUT",',
      '                        remoteWorker: runpodPublicWorker(state)',
      '                    };',
      '                }',
      '                const lastProgressMs = Date.parse(String(state.lastBootstrapProgressAt || state.bootstrapStartedAt || ""));'
    ].join("\n"),
    "V142_HUMO_TORCH_STAGE_TIMEOUT_ENFORCEMENT"
  );

  const testFile = "tests/jarvis-local-video-engine-v142.test.mjs";
  appendOnce(
    testFile,
    'test("V142 HuMo runtime cert retries only safe pre-provision transport and bounds Torch verification"',
    `test("V142 HuMo runtime cert retries only safe pre-provision transport and bounds Torch verification", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    const engine = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");
    const retryStart = bridge.indexOf('const safeStartStages = new Set(["duplicate_guard", "availability"])');
    const retryEnd = bridge.indexOf("const maximumSafeStartAttempts = 3", retryStart);
    assert.ok(retryStart >= 0 && retryEnd > retryStart);
    assert.equal(bridge.slice(retryStart, retryEnd).includes("provision"), false);
    assert.match(bridge, /HUMO_RUNTIME_CERTIFICATION_START_RETRYABLE/);
    assert.match(bridge, /failureStage: error\?\.stage \|\| null/);
    assert.match(bridge, /providerCode: error\?\.providerCode \|\| null/);
    assert.match(bridge, /providerMessage: error\?\.providerMessage \|\| null/);
    assert.match(engine, /JARVIS_HUMO_TORCH_STAGE_TIMEOUT_SECONDS/);
    assert.match(engine, /RUNPOD_HUMO_TORCH_STAGE_TIMEOUT/);
    assert.match(engine, /humoTorchStageTimeoutSeconds/);
});`
  );

  const hardenedBridge = sourceOf(bridgeFile);
  const hardenedEngine = sourceOf(engineFile);
  for (const marker of [
    'const safeStartStages = new Set(["duplicate_guard", "availability"])',
    "HUMO_RUNTIME_CERTIFICATION_START_RETRYABLE",
    "providerMessage: error?.providerMessage || null"
  ]) {
    if (!hardenedBridge.includes(marker)) throw new Error(`V142_HUMO_RUNTIME_CERT_RETRY_MISSING:${marker}`);
  }
  for (const marker of [
    "JARVIS_HUMO_TORCH_STAGE_TIMEOUT_SECONDS",
    "RUNPOD_HUMO_TORCH_STAGE_TIMEOUT",
    "humoTorchStageTimeoutSeconds"
  ]) {
    if (!hardenedEngine.includes(marker)) throw new Error(`V142_HUMO_TORCH_TIMEOUT_MISSING:${marker}`);
  }
}

ensureHuMoRuntimeCertificationTransportHardening();

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_RUNTIME_CERT_TRANSPORT_HARDENED",
  safePreProvisionRetryStages: ["duplicate_guard", "availability"],
  maximumSafeStartAttempts: 3,
  provisionRetryAllowed: false,
  humoTorchStageTimeoutSeconds: 120,
  inferenceAuthorized: false,
  billableGpuCreated: false,
  newFiles: false,
  newWorkflow: false
}));
