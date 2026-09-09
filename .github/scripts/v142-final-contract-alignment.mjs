import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PATCH_BASELINE_COMMIT = "8a5a1afa96e7da8776a36c71809361be9deaf5e0";
const ENGINE = "jarvis-local-video-engine.js";
const BRIDGE = "jarvis-fs-bridge.js";
const STUDIO = "jarvis-artifact-studio.js";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";
const SERIES_TEST = "tests/jarvis-series-continuity-v142.test.mjs";
const FS_BRIDGE_TEST = "tests/jarvis-fs-bridge-v2.test.mjs";

const read = file => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const write = (file, source) => fs.writeFileSync(file, source, "utf8");

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}

function requireMarkers(source, markers, label) {
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${label}_MISSING:${marker}`);
  }
}

function assertMaterializedV142Base() {
  const engine = read(ENGINE);
  const bridge = read(BRIDGE);
  const fsBridgeTests = read(FS_BRIDGE_TEST);
  requireMarkers(engine, [
    'stage === "availability" || stage === "placement_inventory"',
    '"READ_ONLY_GRAPHQL_MAX_3"'
  ], "V142_ENGINE_BASE");
  requireMarkers(bridge, [
    "certificationEconomicDeadlineSeconds",
    "certificationOuterStopRatio = 0.90",
    'JARVIS_HUMO_TORCH_STAGE_TIMEOUT_SECONDS: "120"',
    "maximumPaidRuntimeSeconds",
    "paidDeadlineMs"
  ], "V142_BRIDGE_BASE");
  requireMarkers(fsBridgeTests, [
    "V142 HuMo runtime certification supports a lower per-attempt budget and paid economic deadline"
  ], "V142_FS_BRIDGE_BASE");
}

function alignHuMoOfficialProbeContract() {
  let engine = read(ENGINE);
  engine = replaceExactOnce(
    engine,
    '        frames: 201,\n        durationSeconds: 8.0,',
    '        frames: 97,\n        durationSeconds: 3.88,',
    "V142_HUMO_OFFICIAL_PROBE_GEOMETRY"
  );
  write(ENGINE, engine);

  let localTests = read(LOCAL_VIDEO_TEST);
  localTests = replaceExactOnce(
    localTests,
    '    assert.match(candidate, /durationSeconds: 8\\.0/);',
    '    assert.match(candidate, /durationSeconds: 3\\.88/);',
    "V142_HUMO_OFFICIAL_CANDIDATE_DURATION"
  );
  localTests = replaceExactOnce(
    localTests,
    '    assert.match(runner, /"probe_duration_seconds": 8\\.0/);',
    '    assert.match(runner, /"probe_duration_seconds": 3\\.88/);',
    "V142_HUMO_OFFICIAL_RUNNER_DURATION"
  );
  write(LOCAL_VIDEO_TEST, localTests);
}

function alignSeriesBackendIdentityContext() {
  let studio = read(STUDIO);
  requireMarkers(studio, [
    "const SERIES_GENERATION_BACKEND_POLICIES = Object.freeze({",
    'backend: "humo-17b-identity"',
    'backend: "phantom-wan-14b"',
    'modelRevision: "cb20be4504cb725caad4076be7a11fd295866462"',
    'modelRevision: "6739b2d576426a211c9fec00a476253e538ca7d5"',
    'generationBackend = "veo"'
  ], "V142_SERIES_BACKEND_POLICY");

  studio = replaceExactOnce(
    studio,
    "    const normalizedMaximum = Number(maximumReferenceImages);",
    `    const backendPolicy = getSeriesGenerationBackendPolicy(generationBackend);\n    const policyMaximum = Number(backendPolicy.maximumReferenceImages) || SERIES_REFERENCE_MAX_COUNT;\n    const normalizedMaximum = maximumReferenceImages === null || maximumReferenceImages === undefined\n        ? policyMaximum\n        : Number(maximumReferenceImages);\n    const uniqueCastIds = [...new Set(episode.castIds || [])];\n    if (uniqueCastIds.length > Number(backendPolicy.maximumIdentityCount || uniqueCastIds.length)) {\n        if (backendPolicy.backend === "humo-17b-identity") {\n            throw new Error(\`SERIES_HUMO_SINGLE_IDENTITY_REQUIRED:\${uniqueCastIds.length}\`);\n        }\n        throw new Error(\`SERIES_GENERATION_IDENTITY_LIMIT_EXCEEDED:\${backendPolicy.backend}:\${uniqueCastIds.length}:\${backendPolicy.maximumIdentityCount}\`);\n    }`,
    "V142_SERIES_BACKEND_MAXIMUM"
  );
  studio = replaceExactOnce(
    studio,
    "        normalizedMaximum <= SERIES_REFERENCE_MAX_COUNT;",
    "        normalizedMaximum <= policyMaximum;",
    "V142_SERIES_BACKEND_COVERAGE_MAXIMUM"
  );
  studio = replaceExactOnce(
    studio,
    "    if (availableReferences.length > SERIES_REFERENCE_MAX_COUNT && !allowCoverageSelection) {",
    "    if (availableReferences.length > policyMaximum && !allowCoverageSelection) {",
    "V142_SERIES_BACKEND_REFERENCE_LIMIT"
  );
  studio = replaceExactOnce(
    studio,
    "            `SERIES_VEO_REFERENCE_LIMIT_EXCEEDED:${availableReferences.length}:${SERIES_REFERENCE_MAX_COUNT}`",
    `            backendPolicy.backend === "veo"\n                ? \`SERIES_VEO_REFERENCE_LIMIT_EXCEEDED:\${availableReferences.length}:\${policyMaximum}\`\n                : \`SERIES_BACKEND_REFERENCE_LIMIT_EXCEEDED:\${backendPolicy.backend}:\${availableReferences.length}:\${policyMaximum}\``,
    "V142_SERIES_BACKEND_REFERENCE_ERROR"
  );
  studio = replaceExactOnce(
    studio,
    "        : availableReferences;\n    return {",
    `        : availableReferences;\n    const identityLocks = uniqueCastIds.map(characterId => {\n        const character = canon.characters?.[characterId];\n        return {\n            characterId,\n            displayName: clean(character?.displayName) || characterId,\n            visualDescription: clean(character?.visualDescription),\n            wardrobeState: clone(character?.wardrobeState),\n            voiceProfile: clone(character?.voiceProfile),\n            recurringProps: clone(character?.recurringProps || []),\n            referenceAssets: clone(availableReferences.filter(reference => reference.characterId === characterId))\n        };\n    });\n    const priorAcceptedEpisode = [...(canon.episodes || [])]\n        .filter(item => item?.status === "HUMAN_ACCEPTED" && Number(item.episodeNumber) < Number(episode.episodeNumber))\n        .sort((a, b) => Number(b.episodeNumber) - Number(a.episodeNumber))[0] || null;\n    const priorAcceptedEpisodeAnchor = priorAcceptedEpisode ? {\n        episodeId: priorAcceptedEpisode.episodeId,\n        episodeNumber: priorAcceptedEpisode.episodeNumber,\n        physicalArtifact: priorAcceptedEpisode.physicalArtifact || null,\n        artifactSha256: priorAcceptedEpisode.artifactSha256 || null,\n        continuityEnd: clone(priorAcceptedEpisode.continuityEnd || priorAcceptedEpisode.lockedContinuityEnd || {}),\n        cliffhanger: clean(priorAcceptedEpisode.cliffhanger || priorAcceptedEpisode.narrativeLock?.cliffhanger)\n    } : null;\n    return {`,
    "V142_SERIES_IDENTITY_LOCKS"
  );
  studio = replaceExactOnce(
    studio,
    "        referenceAssets: references,",
    `        generationBackend: backendPolicy.backend,\n        backendPolicy: clone(backendPolicy),\n        identityLocks,\n        priorAcceptedEpisodeAnchor,\n        referenceAssets: references,`,
    "V142_SERIES_BACKEND_CONTEXT_FIELDS"
  );
  studio = replaceExactOnce(
    studio,
    "            maximumReferenceImages: SERIES_REFERENCE_MAX_COUNT,",
    "            maximumReferenceImages: policyMaximum,",
    "V142_SERIES_BACKEND_POLICY_MAXIMUM_RETURN"
  );
  write(STUDIO, studio);
}

function alignNextIdentityRuntimeCandidates() {
  let engine = read(ENGINE);
  if (engine.includes("export const NEXT_IDENTITY_RUNTIME_CANDIDATES = Object.freeze({")) return;
  const anchor = "export function buildHuMoIdentityRuntimeAuthority({ paidExecutionAuthorized = false } = {}) {";
  const insertion = `export const NEXT_IDENTITY_RUNTIME_CANDIDATES = Object.freeze({\n    "humo-17b-identity": Object.freeze({\n        id: "humo-17b-identity",\n        role: "single_subject_identity_candidate",\n        model: "HuMo-17B",\n        sourceRepository: "Phantom-video/HuMo",\n        sourceRevision: "845f44736e21be93aa5d8cf406b6eb01af9bff67",\n        modelRepository: "bytedance-research/HuMo",\n        modelRevision: "cb20be4504cb725caad4076be7a11fd295866462",\n        checkpointDirectory: "HuMo-17B",\n        checkpointFormat: "safetensors-sharded",\n        checkpointShardCount: 7,\n        maximumReferenceAssets: 3,\n        maximumIdentityCount: 1,\n        targetGpuTypeId: "NVIDIA L40S",\n        probeGeometry: Object.freeze({ width: 832, height: 480, fps: 25, frames: 97, durationSeconds: 3.88 }),\n        runtimeAssetAuthorityPinned: false,\n        physicalRuntimeCertified: false,\n        singleL40sRuntimeCertified: false,\n        paidExecutionAuthorized: false,\n        candidateOnly: true,\n        executable: false,\n        blockingReason: "HUMO17_SINGLE_L40S_RUNTIME_NOT_CERTIFIED"\n    }),\n    "phantom-wan-14b": Object.freeze({\n        id: "phantom-wan-14b",\n        role: "multi_subject_identity_candidate",\n        model: "Phantom-Wan-14B",\n        sourceRepository: "Phantom-video/Phantom",\n        sourceRevision: "bd84b602dcc949e23c89cbbf266b6f5975f2f025",\n        modelRepository: "bytedance-research/Phantom",\n        modelRevision: "6739b2d576426a211c9fec00a476253e538ca7d5",\n        checkpointDirectory: "Phantom-Wan-14B",\n        checkpointFormat: "safetensors-sharded",\n        checkpointShardCount: 6,\n        officialTask: "s2v-14B",\n        maximumReferenceAssets: 4,\n        maximumIdentityCount: 4,\n        targetGpuTypeId: "NVIDIA L40S",\n        probeGeometry: Object.freeze({ width: 832, height: 480, fps: 24, frames: 121, durationSeconds: 5.041667 }),\n        runtimeAssetAuthorityPinned: false,\n        physicalRuntimeCertified: false,\n        singleL40sRuntimeCertified: false,\n        paidExecutionAuthorized: false,\n        candidateOnly: true,\n        executable: false,\n        blockingReason: "PHANTOM14B_SINGLE_L40S_RUNTIME_NOT_CERTIFIED"\n    })\n});\n\nexport function buildNextIdentityRuntimeCandidate({ backend = "" } = {}) {\n    const requested = String(backend || "").trim().toLowerCase();\n    const aliases = { humo17: "humo-17b-identity", "humo-17b": "humo-17b-identity", phantom: "phantom-wan-14b", "phantom-14b": "phantom-wan-14b" };\n    const normalized = aliases[requested] || requested;\n    const candidate = NEXT_IDENTITY_RUNTIME_CANDIDATES[normalized];\n    if (!candidate) throw new Error(\`LOCAL_VIDEO_IDENTITY_CANDIDATE_UNSUPPORTED:\${normalized || "missing"}\`);\n    return {\n        ...candidate,\n        runtimeAssetAuthorityPinned: false,\n        physicalRuntimeCertified: false,\n        singleL40sRuntimeCertified: false,\n        paidExecutionAuthorized: false,\n        resourceCreationPossible: false,\n        inferenceStarted: false,\n        externalApiUsed: false,\n        externalEstimatedCostUsd: 0\n    };\n}\n\n${anchor}`;
  engine = replaceExactOnce(engine, anchor, insertion, "V142_NEXT_IDENTITY_RUNTIME_CANDIDATES");
  write(ENGINE, engine);
}

function alignIdentityCandidateTests() {
  let seriesTests = read(SERIES_TEST);
  seriesTests = replaceExactOnce(
    seriesTests,
    "    getSeriesGenerationContext,",
    "    getSeriesGenerationBackendPolicy,\n    getSeriesGenerationContext,",
    "V142_SERIES_BACKEND_POLICY_TEST_IMPORT"
  );
  const seriesMarker = 'test("V142 next identity backends preserve canonical character locks and fail closed", () => {';
  if (!seriesTests.includes(seriesMarker)) {
    seriesTests += `\n\ntest("V142 next identity backends preserve canonical character locks and fail closed", () => {\n    const humo = getSeriesGenerationBackendPolicy("humo-17b");\n    const phantom = getSeriesGenerationBackendPolicy("phantom");\n    assert.equal(humo.backend, "humo-17b-identity");\n    assert.equal(humo.maximumIdentityCount, 1);\n    assert.equal(humo.probeGeometry.frames, 97);\n    assert.equal(humo.operationallyCertified, false);\n    assert.equal(humo.paidExecutionAuthorized, false);\n    assert.equal(phantom.backend, "phantom-wan-14b");\n    assert.equal(phantom.maximumReferenceImages, 4);\n    assert.equal(phantom.maximumIdentityCount, 4);\n    assert.equal(phantom.operationallyCertified, false);\n    assert.equal(phantom.paidExecutionAuthorized, false);\n\n    const root = seriesRoot();\n    const seriesId = "SERIES-BACKEND-LOCKS";\n    createSeries(root, seriesId);\n    const refs = [1, 2, 3, 4].map(index => physicalArtifact(\n        root,\n        \`.jarvis-artifacts/uploads/backend-lock-\${index}.jpg\`,\n        Buffer.from(\`backend-lock-\${index}\`),\n        "image/jpeg"\n    ));\n    registerCharacter(root, seriesId, "CHAR_HEBERTO", "Heberto", refs.slice(0, 2), {\n        visualDescription: "Identidad visual canonica de Heberto.",\n        wardrobeState: { shirt: "canon" },\n        voiceProfile: { profileId: "VOICE_HEBERTO" }\n    });\n    registerCharacter(root, seriesId, "CHAR_ROLDAN", "Roldan", refs.slice(2), {\n        visualDescription: "Identidad visual canonica de Roldan.",\n        wardrobeState: { shirt: "canon-roldan" },\n        voiceProfile: { profileId: "VOICE_ROLDAN" }\n    });\n    const prepared = prepareEpisode27(root, seriesId, ["CHAR_HEBERTO", "CHAR_ROLDAN"]);\n    const phantomContext = getSeriesGenerationContext({\n        root,\n        seriesId,\n        episodeId: prepared.episode.episodeId,\n        generationBackend: "phantom-wan-14b",\n        referenceSelectionPolicy: "ACTIVE_CAST_COVERAGE"\n    });\n    assert.equal(phantomContext.generationBackend, "phantom-wan-14b");\n    assert.equal(phantomContext.referenceAssets.length, 4);\n    assert.deepEqual(phantomContext.identityLocks.map(item => item.characterId), ["CHAR_HEBERTO", "CHAR_ROLDAN"]);\n    assert.deepEqual(phantomContext.identityLocks.map(item => item.referenceAssets.length), [2, 2]);\n    assert.throws(\n        () => getSeriesGenerationContext({\n            root,\n            seriesId,\n            episodeId: prepared.episode.episodeId,\n            generationBackend: "humo-17b-identity"\n        }),\n        /SERIES_HUMO_SINGLE_IDENTITY_REQUIRED:2/\n    );\n\n    const accepted = generateAndAccept(root, seriesId, prepared.episode.episodeId, { location: "Taller" });\n    const next = prepareSeriesEpisode({\n        root,\n        seriesId,\n        episodeNumber: 28,\n        title: "Capitulo 28",\n        script: "Continuidad canonica del capitulo 28.",\n        castIds: ["CHAR_HEBERTO", "CHAR_ROLDAN"],\n        storyBeats: [{ exactAction: "Continuan desde el cierre anterior.", finalState: { location: "Taller" } }]\n    });\n    const nextContext = getSeriesGenerationContext({\n        root,\n        seriesId,\n        episodeId: next.episode.episodeId,\n        generationBackend: "phantom"\n    });\n    assert.equal(nextContext.priorAcceptedEpisodeAnchor.episodeId, accepted.episode.episodeId);\n    assert.equal(nextContext.priorAcceptedEpisodeAnchor.artifactSha256, accepted.episode.artifactSha256);\n});\n`;
  }
  write(SERIES_TEST, seriesTests);

  let localTests = read(LOCAL_VIDEO_TEST);
  const localMarker = 'test("V142 HuMo-17B and Phantom-Wan candidates are pinned but cannot create paid resources", () => {';
  if (!localTests.includes(localMarker)) {
    localTests += `\n\ntest("V142 HuMo-17B and Phantom-Wan candidates are pinned but cannot create paid resources", () => {\n    const source = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    const start = source.indexOf("export const NEXT_IDENTITY_RUNTIME_CANDIDATES = Object.freeze({");\n    const end = source.indexOf("export function buildHuMoIdentityRuntimeAuthority", start);\n    assert.ok(start >= 0 && end > start);\n    const section = source.slice(start, end);\n    for (const marker of [\n        "humo-17b-identity",\n        "Phantom-Wan-14B",\n        "cb20be4504cb725caad4076be7a11fd295866462",\n        "6739b2d576426a211c9fec00a476253e538ca7d5",\n        "HUMO17_SINGLE_L40S_RUNTIME_NOT_CERTIFIED",\n        "PHANTOM14B_SINGLE_L40S_RUNTIME_NOT_CERTIFIED",\n        "resourceCreationPossible: false",\n        "externalEstimatedCostUsd: 0"\n    ]) assert.equal(section.includes(marker), true, marker);\n    assert.equal((section.match(/runtimeAssetAuthorityPinned: false/g) || []).length >= 3, true);\n    assert.equal((section.match(/singleL40sRuntimeCertified: false/g) || []).length >= 3, true);\n    assert.equal((section.match(/paidExecutionAuthorized: false/g) || []).length >= 3, true);\n});\n`;
  }
  write(LOCAL_VIDEO_TEST, localTests);
}

assertMaterializedV142Base();
alignHuMoOfficialProbeContract();
alignSeriesBackendIdentityContext();
alignNextIdentityRuntimeCandidates();
alignIdentityCandidateTests();

for (const file of [STUDIO, ENGINE, LOCAL_VIDEO_TEST, SERIES_TEST]) {
  const source = read(file);
  if (/durationSeconds:\s*8\.0\s*[,}]/.test(source) && file === ENGINE) {
    throw new Error("V142_HUMO_LEGACY_8S_ENGINE_CONTRACT_PRESENT");
  }
}

if (fs.existsSync(path.join(process.cwd(), "node_modules"))) {
  execFileSync(process.execPath, ["--test", "--test-concurrency=1", FS_BRIDGE_TEST], {
    stdio: "inherit",
    maxBuffer: 64 * 1024 * 1024
  });
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_PERSISTENT_IDENTITY_BACKENDS_PREPARED_FAIL_CLOSED",
  patchBaselineCommit: PATCH_BASELINE_COMMIT,
  huMo17CandidatePinned: true,
  phantomWan14bCandidatePinned: true,
  seriesIdentityLocks: true,
  priorAcceptedEpisodeAnchor: true,
  singleL40sRuntimeCertified: false,
  paidExecutionAuthorized: false,
  resourceCreationPossible: false,
  billableGpuCreated: false,
  newFiles: false,
  newWorkflow: false
}));
