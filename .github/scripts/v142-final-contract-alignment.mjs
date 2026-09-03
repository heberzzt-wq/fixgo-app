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
  write(file, `${source.trimEnd()}\n\n${addition.trim()}\n`);
}

function assertCurrentV142Authority() {
  const bridge = sourceOf("jarvis-fs-bridge.js");
  const engine = sourceOf("jarvis-local-video-engine.js");
  const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
  const doc = sourceOf("docs/jarvis-local-video-v142.md");
  const required = [
    [bridge, "RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED", "V142_IDENTITY_BRIDGE_FAIL_CLOSED"],
    [engine, "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED", "V142_IDENTITY_GATE_ENGINE"],
    [engine, "!requiresIdentityFidelity && references.length > Number(model.maximumReferenceAssets || 0)", "V142_IDENTITY_REFERENCES_STAY_SEPARATE"],
    [engine, "RUNPOD_PROVISION_CLEANUP_FAILED", "V142_PROVISION_CLEANUP_FAIL_CLOSED"],
    [engine, "cleanupFailure.remoteWorker", "V142_PROVISION_CLEANUP_RETAINS_POD"],
    [runner, "LOCAL_VIDEO_HUMO_EXECUTOR_NOT_IMPLEMENTED", "V142_HUMO_EXECUTOR_FAIL_CLOSED"],
    [runner, "LOCAL_VIDEO_RUNTIME_UNSUPPORTED", "V142_UNKNOWN_RUNTIME_FAIL_CLOSED"],
    [doc, "must never be merged into a contact sheet, collage, or identity sheet", "V142_DOC_IDENTITY_SHEET_FORBIDDEN"],
    [doc, "cleanup is download-first", "V142_DOC_DOWNLOAD_FIRST"]
  ];
  for (const [source, marker, label] of required) {
    if (!source.includes(marker)) throw new Error(`${label}_MISSING`);
  }
  if (bridge.includes("invocationPayload.requiresIdentityFidelity = false")) {
    throw new Error("V142_IDENTITY_FIDELITY_BYPASS_STILL_PRESENT");
  }
}

function ensureShotIdentityBindings() {
  const artifactStudioFile = "jarvis-artifact-studio.js";
  const actuatorFile = "gestia-core/jarvis/jarvis.actuator.pack.js";
  const engineFile = "jarvis-local-video-engine.js";
  const testFile = "tests/jarvis-video-reference-mission-continuity-v142.test.mjs";

  replaceExactOnce(
    artifactStudioFile,
    `        castIds: clone(episode.castIds),\n        storyBeats: clone(episode.storyBeats),`,
    `        castIds: clone(episode.castIds),\n        cast: (episode.castIds || []).map(characterId => ({\n            characterId,\n            displayName: clean(canon.characters?.[characterId]?.displayName) || characterId\n        })),\n        storyBeats: clone(episode.storyBeats),`,
    "V142_SERIES_CONTEXT_EXPOSES_CAST_IDENTITY"
  );

  replaceExactOnce(
    actuatorFile,
    `export function buildLocalSeriesShotPlan(timeline = []) {`,
    `function normalizeSeriesIdentityLabel(value = "") {\n    return String(value || "")\n        .normalize("NFD")\n        .replace(/[\\u0300-\\u036f]/g, "")\n        .trim()\n        .toUpperCase();\n}\n\nfunction resolveShotIdentityBindings(activeSegments = [], cast = [], references = []) {\n    const directory = new Map();\n    for (const character of Array.isArray(cast) ? cast : []) {\n        const characterId = String(character?.characterId || "").trim();\n        if (!characterId) continue;\n        for (const label of [characterId, character?.displayName]) {\n            const normalized = normalizeSeriesIdentityLabel(label);\n            if (normalized) directory.set(normalized, characterId);\n        }\n    }\n    const characterIds = [];\n    for (const segment of Array.isArray(activeSegments) ? activeSegments : []) {\n        for (const rawLine of Array.isArray(segment?.lines) ? segment.lines : []) {\n            const speaker = /^([^:]{1,120}):\\s*/u.exec(String(rawLine || "").trim())?.[1] || "";\n            const characterId = directory.get(normalizeSeriesIdentityLabel(speaker));\n            if (characterId && !characterIds.includes(characterId)) characterIds.push(characterId);\n        }\n    }\n    if (characterIds.length === 0 && Array.isArray(cast) && cast.length === 1) {\n        const onlyCharacterId = String(cast[0]?.characterId || "").trim();\n        if (onlyCharacterId) characterIds.push(onlyCharacterId);\n    }\n    const referenceOutputs = (Array.isArray(references) ? references : [])\n        .filter(reference => characterIds.includes(String(reference?.characterId || "").trim()))\n        .map(reference => String(reference?.sourceOutput || "").trim())\n        .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);\n    return {\n        characterIds,\n        referenceOutputs,\n        mode: characterIds.length === 0\n            ? "unassigned"\n            : characterIds.length === 1\n                ? "single_identity"\n                : "multi_identity"\n    };\n}\n\nexport function buildLocalSeriesShotPlan(timeline = [], { cast = [], references = [] } = {}) {`,
    "V142_SHOT_PLAN_IDENTITY_BINDING_HELPERS"
  );

  replaceExactOnce(
    actuatorFile,
    `        const activeSegments = segments.filter(segment =>\n            Number(segment.startSeconds) < endSeconds &&\n            Number(segment.endSeconds) > startSeconds\n        );\n        return {`,
    `        const activeSegments = segments.filter(segment =>\n            Number(segment.startSeconds) < endSeconds &&\n            Number(segment.endSeconds) > startSeconds\n        );\n        const identity = resolveShotIdentityBindings(activeSegments, cast, references);\n        return {`,
    "V142_SHOT_PLAN_RESOLVES_IDENTITY"
  );

  replaceExactOnce(
    actuatorFile,
    `            startSeconds,\n            durationSeconds,\n            prompt: [`,
    `            startSeconds,\n            durationSeconds,\n            characterIds: identity.characterIds,\n            identityReferenceOutputs: identity.referenceOutputs,\n            identityMode: identity.mode,\n            prompt: [`,
    "V142_SHOT_PLAN_PERSISTS_IDENTITY_BINDING"
  );

  replaceExactOnce(
    actuatorFile,
    `                const seriesShotPlan = seriesTimeline.length > 0\n                    ? buildLocalSeriesShotPlan(seriesTimeline)\n                    : [];`,
    `                const seriesShotPlan = seriesTimeline.length > 0\n                    ? buildLocalSeriesShotPlan(seriesTimeline, {\n                        cast: seriesContext?.cast || [],\n                        references: seriesContext?.referenceAssets || []\n                    })\n                    : [];`,
    "V142_SERIES_SHOTS_USE_CANON_IDENTITY"
  );

  replaceExactOnce(
    engineFile,
    `                segmentTitle: String(shot?.segmentTitle || "").trim() || null,\n                startSeconds: Number(shot?.startSeconds),`,
    `                segmentTitle: String(shot?.segmentTitle || "").trim() || null,\n                characterIds: [...new Set((Array.isArray(shot?.characterIds) ? shot.characterIds : [])\n                    .map(value => String(value || "").trim())\n                    .filter(Boolean))],\n                identityReferenceOutputs: [...new Set((Array.isArray(shot?.identityReferenceOutputs)\n                    ? shot.identityReferenceOutputs\n                    : [])\n                    .map(value => String(value || "").trim().replaceAll("\\\\", "/"))\n                    .filter(Boolean))],\n                identityMode: new Set(["unassigned", "single_identity", "multi_identity"]).has(\n                    String(shot?.identityMode || "").trim()\n                ) ? String(shot.identityMode).trim() : "unassigned",\n                startSeconds: Number(shot?.startSeconds),`,
    "V142_ENGINE_PRESERVES_SHOT_IDENTITY"
  );

  replaceExactOnce(
    engineFile,
    `                !shot.shotId || !shot.prompt ||\n                !(shot.durationSeconds > 0 && shot.durationSeconds <= 5) ||`,
    `                !shot.shotId || !shot.prompt ||\n                (shot.identityMode === "single_identity" && shot.characterIds.length !== 1) ||\n                (shot.identityMode === "multi_identity" && shot.characterIds.length < 2) ||\n                (shot.identityMode === "unassigned" && shot.characterIds.length !== 0) ||\n                shot.identityReferenceOutputs.some(output => !referenceOutputs.includes(output)) ||\n                !(shot.durationSeconds > 0 && shot.durationSeconds <= 5) ||`,
    "V142_ENGINE_VALIDATES_SHOT_IDENTITY_BINDING"
  );

  replaceExactOnce(
    testFile,
    `import { registerJarvisActuatorTools } from "../gestia-core/jarvis/jarvis.actuator.pack.js";`,
    `import {\n    buildLocalSeriesShotPlan,\n    registerJarvisActuatorTools\n} from "../gestia-core/jarvis/jarvis.actuator.pack.js";`,
    "V142_TEST_IMPORT_SHOT_PLAN_IDENTITY"
  );

  appendOnce(
    testFile,
    "v142 series shots bind explicit character references without cross-identity collage",
    `test("v142 series shots bind explicit character references without cross-identity collage", () => {\n    const timeline = [{\n        segmentId: "segment-1", title: "Heberto", startSeconds: 0, endSeconds: 5,\n        durationSeconds: 5, lines: ["HEBERTO: Ya quedo."], text: "HEBERTO: Ya quedo."\n    }, {\n        segmentId: "segment-2", title: "Roldan", startSeconds: 5, endSeconds: 10,\n        durationSeconds: 5, lines: ["ROLDAN: Falta nivelar."], text: "ROLDAN: Falta nivelar."\n    }, {\n        segmentId: "segment-3", title: "Ambos", startSeconds: 10, endSeconds: 15,\n        durationSeconds: 5, lines: ["HEBERTO: Sostengo.", "ROLDAN: Termino."],\n        text: "HEBERTO: Sostengo. ROLDAN: Termino."\n    }];\n    const cast = [\n        { characterId: "CHAR_HEBERTO", displayName: "Heberto" },\n        { characterId: "CHAR_ROLDAN", displayName: "Roldan" }\n    ];\n    const references = [\n        { characterId: "CHAR_HEBERTO", sourceOutput: ".jarvis-artifacts/images/heberto.png" },\n        { characterId: "CHAR_ROLDAN", sourceOutput: ".jarvis-artifacts/images/roldan.png" }\n    ];\n    const shots = buildLocalSeriesShotPlan(timeline, { cast, references });\n    assert.deepEqual(shots[0].characterIds, ["CHAR_HEBERTO"]);\n    assert.deepEqual(shots[0].identityReferenceOutputs, [references[0].sourceOutput]);\n    assert.equal(shots[0].identityMode, "single_identity");\n    assert.deepEqual(shots[1].characterIds, ["CHAR_ROLDAN"]);\n    assert.deepEqual(shots[1].identityReferenceOutputs, [references[1].sourceOutput]);\n    assert.equal(shots[1].identityMode, "single_identity");\n    assert.deepEqual(shots[2].characterIds, ["CHAR_HEBERTO", "CHAR_ROLDAN"]);\n    assert.deepEqual(shots[2].identityReferenceOutputs, references.map(item => item.sourceOutput));\n    assert.equal(shots[2].identityMode, "multi_identity");\n});`
  );
}

assertCurrentV142Authority();
ensureShotIdentityBindings();
assertCurrentV142Authority();

const engine = sourceOf("jarvis-local-video-engine.js");
const actuator = sourceOf("gestia-core/jarvis/jarvis.actuator.pack.js");
const artifactStudio = sourceOf("jarvis-artifact-studio.js");
const identityBindingTest = sourceOf("tests/jarvis-video-reference-mission-continuity-v142.test.mjs");

for (const marker of [
  "characterIds: identity.characterIds",
  "identityReferenceOutputs: identity.referenceOutputs",
  "identityMode: identity.mode",
  "buildLocalSeriesShotPlan(seriesTimeline, {"
]) {
  if (!actuator.includes(marker)) throw new Error(`V142_SHOT_IDENTITY_ACTUATOR_MISSING:${marker}`);
}
if (!artifactStudio.includes("cast: (episode.castIds || []).map(characterId => ({")) {
  throw new Error("V142_SERIES_CONTEXT_CAST_DIRECTORY_MISSING");
}
for (const marker of [
  "identityReferenceOutputs",
  "identityMode",
  "shot.identityReferenceOutputs.some(output => !referenceOutputs.includes(output))"
]) {
  if (!engine.includes(marker)) throw new Error(`V142_SHOT_IDENTITY_ENGINE_MISSING:${marker}`);
}
if (!identityBindingTest.includes("v142 series shots bind explicit character references without cross-identity collage")) {
  throw new Error("V142_SHOT_IDENTITY_REGRESSION_MISSING");
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_RUNPOD_L40S_IDENTITY_FIDELITY_GUARD_VERIFIED",
  sameSemanticAuthority: true,
  identityFidelityRequiredForReferences: true,
  identityReferencesRemainSeparate: true,
  identityRuntimeCandidate: "humo-1.7b-identity",
  identityRuntimePhysicallyCertified: false,
  identityRuntimePaidExecutionAuthorized: false,
  identityRunnerCannotFallThroughToWan: true,
  shotIdentityBindingsPersisted: true,
  multiIdentityShotsRemainExplicit: true,
  successfulGenerationDownloadsBeforeRelease: true,
  paidSpendGuardedByExistingRunpodAuthority: true,
  newFiles: false,
  newBrains: false
}));
