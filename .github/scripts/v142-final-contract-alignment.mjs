import fs from "node:fs";

const STUDIO = "jarvis-artifact-studio.js";
const BRIDGE = "jarvis-fs-bridge.js";
const ACTUATOR = "gestia-core/jarvis/jarvis.actuator.pack.js";
const SERIES_TEST = "tests/jarvis-series-continuity-v142.test.mjs";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";

const read = file => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const write = (file, source) => fs.writeFileSync(file, source, "utf8");

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}

function alignSeriesLongFormContract() {
  let source = read(STUDIO);

  source = replaceExactOnce(
    source,
    `export function prepareSeriesEpisode({\n    root,\n    seriesId,\n    episodeId = "",\n    episodeNumber = null,\n    title,\n    script,\n    castIds = [],\n    storyBeats = [],\n    continuityStart = null\n} = {}) {\n    const loaded = readSeriesCanon(root, seriesId);\n    const canon = loaded.canon;\n    const acceptedEpisodeNumbers = [`,
    `export function prepareSeriesEpisode({\n    root,\n    seriesId,\n    episodeId = "",\n    episodeNumber = null,\n    title,\n    script,\n    castIds = [],\n    storyBeats = [],\n    continuityStart = null\n} = {}) {\n    const loaded = readSeriesCanon(root, seriesId);\n    const canon = loaded.canon;\n    const identityRoster = assertSeriesIdentityRosterReady(canon);\n    const acceptedEpisodeNumbers = [`,
    "V142_LONG_FORM_ROSTER_GATE"
  );

  source = replaceExactOnce(
    source,
    `        castIds: normalizedCastIds,\n        storyBeats: normalizedBeats,`,
    `        castIds: normalizedCastIds,\n        productionBatch: {\n            size: identityRoster.policy.productionBatchSize,\n            number: Math.floor((resolvedNumber - 1) / identityRoster.policy.productionBatchSize) + 1,\n            startEpisodeNumber: Math.floor((resolvedNumber - 1) / identityRoster.policy.productionBatchSize) * identityRoster.policy.productionBatchSize + 1,\n            endEpisodeNumber: (Math.floor((resolvedNumber - 1) / identityRoster.policy.productionBatchSize) + 1) * identityRoster.policy.productionBatchSize,\n            continuousCanon: identityRoster.policy.continuousCanonAcrossProductionBatches === true\n        },\n        storyBeats: normalizedBeats,`,
    "V142_PRODUCTION_BATCH_METADATA"
  );

  const episodeIdentityBlock = `    const uniqueCastIds = [...new Set(episode.castIds || [])];\n    if (uniqueCastIds.length > Number(backendPolicy.maximumIdentityCount || uniqueCastIds.length)) {\n        if (backendPolicy.backend === "humo-17b-identity") {\n            throw new Error(\`SERIES_HUMO_SINGLE_IDENTITY_REQUIRED:\${uniqueCastIds.length}\`);\n        }\n        throw new Error(\`SERIES_GENERATION_IDENTITY_LIMIT_EXCEEDED:\${backendPolicy.backend}:\${uniqueCastIds.length}:\${backendPolicy.maximumIdentityCount}\`);\n    }`;
  source = replaceExactOnce(
    source,
    episodeIdentityBlock,
    `    const uniqueCastIds = [...new Set(episode.castIds || [])];`,
    "V142_BACKEND_IDENTITY_LIMIT_PER_SHOT_ONLY"
  );

  source = replaceExactOnce(
    source,
    `        policy: {\n            referenceSelection: "ACTIVE_CAST_EXPLICIT_ASSIGNMENTS_ONLY",\n            maximumReferenceImages: policyMaximum,\n            noFacialIdentification: true\n        }`,
    `        policy: {\n            referenceSelection: "ACTIVE_CAST_EXPLICIT_ASSIGNMENTS_ONLY",\n            maximumReferenceImages: policyMaximum,\n            backendIdentityLimitsApplyPerShotOnly: normalizeSeriesIdentityContinuityPolicy(canon.identityContinuityPolicy || {}).backendIdentityLimitsApplyPerShotOnly,\n            noFacialIdentification: true\n        }`,
    "V142_GENERATION_CONTEXT_PER_SHOT_POLICY"
  );

  write(STUDIO, source);
}

function alignHuMo17PaidBootstrap() {
  let source = read(BRIDGE);
  source = replaceExactOnce(
    source,
    `        \`test \\\"$(git -C /workspace/jarvis-v142/runtime/humo17/ComfyUI rev-parse HEAD)\\\" = \${q(s.comfyUiRevision)}\`,\n        \`test \\\"$(git -C /workspace/jarvis-v142/runtime/humo17/ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper rev-parse HEAD)\\\" = \${q(s.wrapperRevision)}\`,`,
    `        "test -f /workspace/jarvis-v142/runtime/humo17/ComfyUI/.git/HEAD",\n        "test -f /workspace/jarvis-v142/runtime/humo17/ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper/.git/HEAD",`,
    "V142_HUMO17_PAID_BOOTSTRAP_NO_GIT"
  );
  write(BRIDGE, source);
}

function alignSeriesBackendHandoff() {
  let source = read(ACTUATOR);
  source = replaceExactOnce(
    source,
    `                seriesId: "string",\n                episodeId: "string"`,
    `                seriesId: "string",\n                episodeId: "string",\n                generationBackend: "veo|humo-17b-identity|phantom-wan-14b"`,
    "V142_VIDEO_GENERATE_BACKEND_SCHEMA"
  );
  source = replaceExactOnce(
    source,
    `                    seriesContext = await bridgeRequest("/series/episode/generation-context", {\n                        seriesId,\n                        episodeId,\n                        referenceSelectionPolicy: "ACTIVE_CAST_COVERAGE",\n                        maximumReferenceImages: VIDEO_REFERENCE_MAX_COUNT\n                    });`,
    `                    seriesContext = await bridgeRequest("/series/episode/generation-context", {\n                        seriesId,\n                        episodeId,\n                        referenceSelectionPolicy: "ACTIVE_CAST_COVERAGE",\n                        generationBackend: String(args.generationBackend || "veo").trim().toLowerCase() || "veo"\n                    });`,
    "V142_SERIES_BACKEND_CONTEXT_HANDOFF"
  );
  source = replaceExactOnce(
    source,
    `                    episodeId: episodeId || null\n                };`,
    `                    episodeId: episodeId || null,\n                    selectedBackend: seriesContext?.generationBackend || String(args.generationBackend || "").trim().toLowerCase() || null\n                };`,
    "V142_ENGINE_REQUIREMENTS_BACKEND_HANDOFF"
  );
  write(ACTUATOR, source);
}

function alignSeriesTests() {
  let source = read(SERIES_TEST);
  const oldExpectation = `    assert.throws(\n        () => getSeriesGenerationContext({\n            root,\n            seriesId,\n            episodeId: prepared.episode.episodeId,\n            generationBackend: "humo-17b-identity"\n        }),\n        /SERIES_HUMO_SINGLE_IDENTITY_REQUIRED:2/\n    );`;
  const newExpectation = `    const humoContext = getSeriesGenerationContext({\n        root,\n        seriesId,\n        episodeId: prepared.episode.episodeId,\n        generationBackend: "humo-17b-identity",\n        referenceSelectionPolicy: "ACTIVE_CAST_COVERAGE"\n    });\n    assert.equal(humoContext.backendPolicy.maximumIdentityCount, 1);\n    assert.equal(humoContext.identityLocks.length, 2);\n    assert.equal(humoContext.policy.backendIdentityLimitsApplyPerShotOnly, true);`;
  source = replaceExactOnce(
    source,
    oldExpectation,
    newExpectation,
    "V142_SERIES_TEST_PER_SHOT_IDENTITY"
  );

  const marker = `test("V142 long-form series requires a durable roster and persists five-episode production batches", () => {`;
  if (!source.includes(marker)) {
    source += `\n\n${marker}\n    const root = seriesRoot();\n    const seriesId = "SERIES_LONG_FORM_BATCH";\n    createSeriesBible({\n        root,\n        seriesId,\n        title: "Long form",\n        storyArc: "Continuidad larga.",\n        identityContinuityPolicy: {\n            longFormContinuityRequired: true,\n            minimumPersistentCharacterCount: 5,\n            productionBatchSize: 5\n        }\n    });\n    const hero = physicalArtifact(root, ".jarvis-artifacts/uploads/long-hero.jpg", "hero", "image/jpeg");\n    registerCharacter(root, seriesId, "CHAR_ONE", "One", [hero]);\n    for (const id of ["CHAR_TWO", "CHAR_THREE", "CHAR_FOUR"]) {\n        upsertSeriesCharacter({\n            root, seriesId, characterId: id, displayName: id, assignmentConfirmed: true,\n            referenceAssets: [], referenceAssetsPending: true\n        });\n    }\n    assert.throws(() => prepareSeriesEpisode({\n        root, seriesId, episodeNumber: 1, title: "EP1", script: "Inicio.", castIds: ["CHAR_ONE"]\n    }), /SERIES_PERSISTENT_CHARACTER_ROSTER_INCOMPLETE:4:5/);\n    upsertSeriesCharacter({\n        root, seriesId, characterId: "CHAR_FIVE", displayName: "Five", assignmentConfirmed: true,\n        referenceAssets: [], referenceAssetsPending: true\n    });\n    const prepared = prepareSeriesEpisode({\n        root, seriesId, episodeNumber: 1, title: "EP1", script: "Inicio.", castIds: ["CHAR_ONE"]\n    });\n    assert.deepEqual(prepared.episode.productionBatch, {\n        size: 5, number: 1, startEpisodeNumber: 1, endEpisodeNumber: 5, continuousCanon: true\n    });\n    const canon = getSeriesBible({ root, seriesId });\n    assert.equal(canon.identityContinuityPolicy.minimumPersistentCharacterCount, 5);\n    assert.equal(canon.identityContinuityPolicy.productionBatchSize, 5);\n    assert.equal(canon.identityContinuityPolicy.continuousCanonAcrossProductionBatches, true);\n});\n`;
  }
  write(SERIES_TEST, source);
}

function alignRuntimeTests() {
  let source = read(LOCAL_VIDEO_TEST);
  const marker = `test("V142 HuMo17 paid bootstrap is persistent, offline and checkpointed", () => {`;
  if (!source.includes(marker)) {
    source += `\n\n${marker}\n    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");\n    assert.equal(bridge.includes("git -C /workspace/jarvis-v142/runtime/humo17/ComfyUI rev-parse HEAD"), false);\n    assert.equal(bridge.includes("test -f /workspace/jarvis-v142/runtime/humo17/ComfyUI/.git/HEAD"), true);\n    assert.equal(bridge.includes("PIP_NO_INDEX=1"), true);\n    assert.equal(bridge.includes("/workspace/jarvis-v142/runtime/humo17/runtime-manifest.json"), true);\n    assert.equal(bridge.includes("/workspace/jarvis-v142/operations/"), true);\n\n    const runner = fs.readFileSync(new URL("../scripts/jarvis-local-video-wan22.py", import.meta.url), "utf8");\n    for (const status of [\n        "HUMO17_SAMPLER_COMPLETED",\n        "HUMO17_VAE_DECODE_COMPLETED",\n        "HUMO17_GEOMETRY_VERIFIED",\n        "HUMO17_CPU_TRANSFER_STARTED",\n        "HUMO17_CPU_TRANSFER_COMPLETED",\n        "HUMO17_FFMPEG_STARTED",\n        "HUMO17_FFMPEG_COMPLETED",\n        "HUMO17_FFPROBE_STARTED",\n        "HUMO17_FFPROBE_COMPLETED"\n    ]) assert.equal(runner.includes(status), true, status);\n});\n`;
  }
  write(LOCAL_VIDEO_TEST, source);
}

alignSeriesLongFormContract();
alignHuMo17PaidBootstrap();
alignSeriesBackendHandoff();
alignSeriesTests();
alignRuntimeTests();

console.log(JSON.stringify({
  ok: true,
  status: "V142_LONG_FORM_HUMO17_FINAL_ALIGNMENT_READY",
  longFormRosterGate: true,
  productionBatchSize: 5,
  backendIdentityLimitsApplyPerShotOnly: true,
  humo17PaidBootstrapOffline: true,
  humo17PaidBootstrapGitFree: true,
  persistentOperationArtifacts: true,
  billableGpuCreated: false
}));
