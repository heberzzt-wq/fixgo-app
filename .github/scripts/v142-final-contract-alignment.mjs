import fs from "node:fs";

const STUDIO = "jarvis-artifact-studio.js";
const BRIDGE = "jarvis-fs-bridge.js";
const ENGINE = "jarvis-local-video-engine.js";
const SERIES_TEST = "tests/jarvis-series-continuity-v142.test.mjs";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";

const read = file => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const write = (file, source) => fs.writeFileSync(file, source, "utf8");

function replaceExactOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count === 1) return source.replace(before, after);
  if (count === 0 && source.includes(after)) return source;
  throw new Error(`${label}_MATCH_COUNT_${count}`);
}

function replaceInRegion(source, startMarker, endMarker, replacements, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`${label}_REGION_MISSING`);
  let region = source.slice(start, end);
  for (const [before, after, suffix] of replacements) {
    region = replaceExactOnce(region, before, after, `${label}_${suffix}`);
  }
  return source.slice(0, start) + region + source.slice(end);
}

function replaceInNamedTest(source, name, replacements, label) {
  const startMarker = `test(${JSON.stringify(name)}`;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${label}_TEST_MISSING`);
  const next = source.indexOf("\n\ntest(", start + startMarker.length);
  const end = next < 0 ? source.length : next;
  let region = source.slice(start, end);
  for (const [before, after, suffix] of replacements) {
    region = replaceExactOnce(region, before, after, `${label}_${suffix}`);
  }
  return source.slice(0, start) + region + source.slice(end);
}

function alignSharedCpuProfileWithoutRegressingLegacy() {
  let source = read(ENGINE);
  source = replaceInRegion(
    source,
    "export const RUNPOD_CPU_STAGING_PROFILE = Object.freeze({",
    "\n});\n\nexport const EXTERNAL_VIDEO_PRICING_PROFILE",
    [
      ['    repository: "runpod/pytorch",', '    repository: "library/ubuntu",', "REPOSITORY"],
      ['    tag: "1.0.2-cu1281-torch280-ubuntu2404",', '    tag: "22.04",', "TAG"],
      ['    provisionImageTag: "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404",', '    provisionImageTag: "ubuntu:22.04",', "IMAGE"],
      ['    expectedRegistryDigest: "sha256:0a360022e8de4375af99430f84e8b38951acc397252163a37ceac7204d01be35",', '    expectedRegistryDigest: "sha256:2edbbc5dc405e9612ba3584ce95480277e3eb374407b5505fe26f17df77c7dbc",', "DIGEST"],
      ['    runtimeImageParityRequired: true,\n', '', "REMOVE_GLOBAL_PARITY"],
      ['        operatingSystem: "ubuntu-24.04",\n        pythonVersionPrefix: "3.12.",\n        torchVersionPrefix: "2.8.0+cu128",\n        torchCudaVersionPrefix: "12.8",\n        mountPath: "/workspace",', '        operatingSystem: "ubuntu-22.04",\n        mountPath: "/workspace",', "RUNTIME_IDENTITY"]
    ],
    "V142_SHARED_CPU_PROFILE"
  );
  source = replaceExactOnce(
    source,
    "            minimumNetworkVolumeGb: 50,\n            persistentMinimumNetworkVolumeGb: 80,",
    "            minimumNetworkVolumeGb: 80,\n            persistentMinimumNetworkVolumeGb: 80,",
    "V142_HUMO17_MINIMUM_VOLUME_80GB"
  );
  source = replaceExactOnce(
    source,
    "'torchVersion':torch.__version__,'coreManifestSha256':core_sha",
    "'torchVersion':torch.__version__,'torchCudaVersion':str(torch.version.cuda or ''),'coreManifestSha256':core_sha",
    "V142_HUMO17_RUNTIME_MANIFEST_TORCH_CUDA"
  );
  write(ENGINE, source);
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
  const oldIdentityBlock = `    const uniqueCastIds = [...new Set(episode.castIds || [])];\n    if (uniqueCastIds.length > Number(backendPolicy.maximumIdentityCount || uniqueCastIds.length)) {\n        if (backendPolicy.backend === "humo-17b-identity") {\n            throw new Error(\`SERIES_HUMO_SINGLE_IDENTITY_REQUIRED:\${uniqueCastIds.length}\`);\n        }\n        throw new Error(\`SERIES_GENERATION_IDENTITY_LIMIT_EXCEEDED:\${backendPolicy.backend}:\${uniqueCastIds.length}:\${backendPolicy.maximumIdentityCount}\`);\n    }`;
  source = replaceExactOnce(
    source,
    oldIdentityBlock,
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

function alignHuMo17RuntimeAndReceipts() {
  let source = read(BRIDGE);
  source = replaceExactOnce(
    source,
    `        \`test \\\"$(git -C /workspace/jarvis-v142/runtime/humo17/ComfyUI rev-parse HEAD)\\\" = \${q(s.comfyUiRevision)}\`,\n        \`test \\\"$(git -C /workspace/jarvis-v142/runtime/humo17/ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper rev-parse HEAD)\\\" = \${q(s.wrapperRevision)}\`,`,
    `        "test -f /workspace/jarvis-v142/runtime/humo17/ComfyUI/.git/HEAD",\n        "test -f /workspace/jarvis-v142/runtime/humo17/ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper/.git/HEAD",`,
    "V142_HUMO17_PAID_BOOTSTRAP_NO_GIT"
  );
  source = replaceExactOnce(
    source,
    `        "python -c 'import json; m=json.load(open(\\"/workspace/jarvis-v142/runtime/humo17/runtime-manifest.json\\")); assert m.get(\\"runtimeReady\\") is True; assert m.get(\\"networkVolumeId\\")==\\"1qm5wczocl\\"; assert m.get(\\"dataCenterId\\")==\\"EU-NL-1\\"; assert m.get(\\"offlinePaidBootstrapRequired\\") is True; assert int(m.get(\\"requiredAssetCount\\",0))==5'",`,
    `        "python -c 'import json; m=json.load(open(\\"/workspace/jarvis-v142/runtime/humo17/runtime-manifest.json\\")); assert m.get(\\"runtimeReady\\") is True; assert m.get(\\"networkVolumeId\\")==\\"1qm5wczocl\\"; assert m.get(\\"dataCenterId\\")==\\"EU-NL-1\\"; assert m.get(\\"offlinePaidBootstrapRequired\\") is True; assert m.get(\\"systemToolsReady\\") is True; assert m.get(\\"provisionImageTag\\")==\\"runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404\\"; assert m.get(\\"expectedRegistryDigest\\")==\\"sha256:0a360022e8de4375af99430f84e8b38951acc397252163a37ceac7204d01be35\\"; assert m.get(\\"operatingSystem\\")==\\"ubuntu-24.04\\"; assert str(m.get(\\"pythonVersion\\",\\"\\")).startswith(\\"3.12.\\"); assert str(m.get(\\"torchVersion\\",\\"\\")).startswith(\\"2.8.0+cu128\\"); assert str(m.get(\\"torchCudaVersion\\",\\"\\")).startswith(\\"12.8\\"); assert int(m.get(\\"requiredAssetCount\\",0))==5'",`,
    "V142_HUMO17_PAID_MANIFEST_IDENTITY_GATE"
  );
  source = replaceExactOnce(
    source,
    `        if (persistentRuntime.runtimeReady !== true || persistentRuntime.networkVolumeId !== volume.id || persistentRuntime.dataCenterId !== volume.dataCenterId || persistentRuntime.comfyUiRevision !== RUNPOD_HUMO17_CORE_CACHE_BASE.comfyUiRevision || persistentRuntime.wrapperRevision !== RUNPOD_HUMO17_CORE_CACHE_BASE.wrapperRevision || Number(persistentRuntime.requiredAssetCount || 0) !== RUNPOD_HUMO17_CORE_CACHE_BASE.requiredFiles.length || persistentRuntime.offlinePaidBootstrapRequired !== true) throw new Error("RUNPOD_HUMO17_PERSISTENT_RUNTIME_INVALID");`,
    `        if (persistentRuntime.runtimeReady !== true || persistentRuntime.networkVolumeId !== volume.id || persistentRuntime.dataCenterId !== volume.dataCenterId || persistentRuntime.comfyUiRevision !== RUNPOD_HUMO17_CORE_CACHE_BASE.comfyUiRevision || persistentRuntime.wrapperRevision !== RUNPOD_HUMO17_CORE_CACHE_BASE.wrapperRevision || Number(persistentRuntime.requiredAssetCount || 0) !== RUNPOD_HUMO17_CORE_CACHE_BASE.requiredFiles.length || persistentRuntime.offlinePaidBootstrapRequired !== true || persistentRuntime.systemToolsReady !== true || persistentRuntime.provisionImageTag !== RUNPOD_HUMO17_CORE_CACHE_BASE.provisionImageTag || persistentRuntime.expectedRegistryDigest !== RUNPOD_HUMO17_CORE_CACHE_BASE.expectedRegistryDigest || persistentRuntime.operatingSystem !== RUNPOD_HUMO17_CORE_CACHE_BASE.operatingSystem || !String(persistentRuntime.pythonVersion || "").startsWith(RUNPOD_HUMO17_CORE_CACHE_BASE.pythonVersionPrefix) || !String(persistentRuntime.torchVersion || "").startsWith(RUNPOD_HUMO17_CORE_CACHE_BASE.torchVersionPrefix) || !String(persistentRuntime.torchCudaVersion || "").startsWith(RUNPOD_HUMO17_CORE_CACHE_BASE.torchCudaVersionPrefix)) throw new Error("RUNPOD_HUMO17_PERSISTENT_RUNTIME_INVALID");`,
    "V142_HUMO17_STAGE_RUNTIME_IDENTITY_GATE"
  );
  source = replaceExactOnce(
    source,
    `        offlinePaidBootstrapRequired: runtimePhysical?.offlinePaidBootstrapRequired === true,\n        newPersistentBytes: Number(RUNPOD_HUMO17_CORE_CACHE_BASE.totalBytes || 0),`,
    `        offlinePaidBootstrapRequired: runtimePhysical?.offlinePaidBootstrapRequired === true,\n        persistentRuntimeSystemToolsReady: runtimePhysical?.systemToolsReady === true,\n        persistentRuntimeProvisionImageTag: runtimePhysical?.provisionImageTag || null,\n        persistentRuntimeExpectedRegistryDigest: runtimePhysical?.expectedRegistryDigest || null,\n        persistentRuntimeOperatingSystem: runtimePhysical?.operatingSystem || null,\n        persistentRuntimePythonVersion: runtimePhysical?.pythonVersion || null,\n        persistentRuntimeTorchVersion: runtimePhysical?.torchVersion || null,\n        persistentRuntimeTorchCudaVersion: runtimePhysical?.torchCudaVersion || null,\n        newPersistentBytes: Number(RUNPOD_HUMO17_CORE_CACHE_BASE.totalBytes || 0),`,
    "V142_HUMO17_STAGE_RECEIPT_RUNTIME_FIELDS"
  );
  source = replaceExactOnce(
    source,
    `stageReceipt?.persistentRuntimeReady !== true || stageReceipt?.offlinePaidBootstrapRequired !== true || Number(stageReceipt?.persistentRuntimeRequiredAssetCount || 0) !== RUNPOD_HUMO17_CORE_CACHE_BASE.requiredFiles.length || Number(stageReceipt?.networkVolumeSizeGb || 0) < Number(RUNPOD_HUMO17_CORE_CACHE_BASE.minimumNetworkVolumeGb || 80)`,
    `stageReceipt?.persistentRuntimeReady !== true || stageReceipt?.offlinePaidBootstrapRequired !== true || stageReceipt?.persistentRuntimeSystemToolsReady !== true || stageReceipt?.persistentRuntimeProvisionImageTag !== RUNPOD_HUMO17_CORE_CACHE_BASE.provisionImageTag || stageReceipt?.persistentRuntimeExpectedRegistryDigest !== RUNPOD_HUMO17_CORE_CACHE_BASE.expectedRegistryDigest || stageReceipt?.persistentRuntimeOperatingSystem !== RUNPOD_HUMO17_CORE_CACHE_BASE.operatingSystem || !String(stageReceipt?.persistentRuntimePythonVersion || "").startsWith(RUNPOD_HUMO17_CORE_CACHE_BASE.pythonVersionPrefix) || !String(stageReceipt?.persistentRuntimeTorchVersion || "").startsWith(RUNPOD_HUMO17_CORE_CACHE_BASE.torchVersionPrefix) || !String(stageReceipt?.persistentRuntimeTorchCudaVersion || "").startsWith(RUNPOD_HUMO17_CORE_CACHE_BASE.torchCudaVersionPrefix) || Number(stageReceipt?.persistentRuntimeRequiredAssetCount || 0) !== RUNPOD_HUMO17_CORE_CACHE_BASE.requiredFiles.length || Number(stageReceipt?.networkVolumeSizeGb || 0) < Number(RUNPOD_HUMO17_CORE_CACHE_BASE.minimumNetworkVolumeGb || 80)`,
    "V142_HUMO17_QUALITY_STAGE_RECEIPT_IDENTITY"
  );
  source = replaceExactOnce(
    source,
    `            stageReceipt.persistentRuntimeReady !== true || stageReceipt.offlinePaidBootstrapRequired !== true || Number(stageReceipt.persistentRuntimeRequiredAssetCount || 0) !== RUNPOD_HUMO17_CORE_CACHE_BASE.requiredFiles.length ||`,
    `            stageReceipt.persistentRuntimeReady !== true || stageReceipt.offlinePaidBootstrapRequired !== true || stageReceipt.persistentRuntimeSystemToolsReady !== true || stageReceipt.persistentRuntimeProvisionImageTag !== RUNPOD_HUMO17_CORE_CACHE_BASE.provisionImageTag || stageReceipt.persistentRuntimeExpectedRegistryDigest !== RUNPOD_HUMO17_CORE_CACHE_BASE.expectedRegistryDigest || stageReceipt.persistentRuntimeOperatingSystem !== RUNPOD_HUMO17_CORE_CACHE_BASE.operatingSystem || !String(stageReceipt.persistentRuntimePythonVersion || "").startsWith(RUNPOD_HUMO17_CORE_CACHE_BASE.pythonVersionPrefix) || !String(stageReceipt.persistentRuntimeTorchVersion || "").startsWith(RUNPOD_HUMO17_CORE_CACHE_BASE.torchVersionPrefix) || !String(stageReceipt.persistentRuntimeTorchCudaVersion || "").startsWith(RUNPOD_HUMO17_CORE_CACHE_BASE.torchCudaVersionPrefix) || Number(stageReceipt.persistentRuntimeRequiredAssetCount || 0) !== RUNPOD_HUMO17_CORE_CACHE_BASE.requiredFiles.length ||`,
    "V142_HUMO17_RUNTIME_STAGE_RECEIPT_IDENTITY"
  );

  const oldRemoteExecution = `            try {\n                await runSsh(endpoint, \`timeout \${remainingSeconds}s bash /tmp/jarvis-humo17/probe.sh > \${posixShellSingleQuote(probeJob.logFile)} 2>&1\`, (remainingSeconds + 15) * 1000);\n            } catch (error) {\n                const detail = await runSsh(endpoint, \`tail -c 6000 \${posixShellSingleQuote(probeJob.logFile)}; test ! -f \${posixShellSingleQuote(probeJob.resultFile)} || cat \${posixShellSingleQuote(probeJob.resultFile)}\`, 30000).catch(() => ({stdout: "diagnostic unavailable"}));\n                error.logTail = detail.stdout;\n                const state = await runSsh(endpoint, \`if test -f \${posixShellSingleQuote(probeJob.resultFile)}; then cat \${posixShellSingleQuote(probeJob.resultFile)}; else printf '{}'; fi\`, 30000).catch(() => ({stdout: "{}"}));\n                try { inferenceStarted = JSON.parse(state.stdout).inferenceStarted === true; } catch {}\n                throw error;\n            }\n            const raw = await runSsh(endpoint, \`cat \${posixShellSingleQuote(probeJob.resultFile)}\`, 30000);\n            runtimePhysical = JSON.parse(raw.stdout); inferenceStarted = runtimePhysical.inferenceStarted === true;`;
  const newRemoteExecution = `            const operationDir = path.posix.dirname(probeJob.resultFile);\n            const remotePidFile = path.posix.join(operationDir, "probe.pid");\n            await runSsh(endpoint, \`mkdir -p \${posixShellSingleQuote(operationDir)}; rm -f \${posixShellSingleQuote(probeJob.resultFile)} \${posixShellSingleQuote(remotePidFile)}; nohup setsid timeout \${remainingSeconds}s bash /tmp/jarvis-humo17/probe.sh > \${posixShellSingleQuote(probeJob.logFile)} 2>&1 < /dev/null & echo $! > \${posixShellSingleQuote(remotePidFile)}\`, 30000);\n            inferenceStarted = true;\n            let remoteTerminal = null;\n            let lastRemoteStage = "HUMO17_REMOTE_STARTED";\n            while (Date.now() < deadlineMs - 60000) {\n                try {\n                    const state = await runSsh(endpoint, \`if test -f \${posixShellSingleQuote(probeJob.resultFile)}; then cat \${posixShellSingleQuote(probeJob.resultFile)}; printf '\\\\n'; fi; if test -f \${posixShellSingleQuote(remotePidFile)} && kill -0 \\\"$(cat \${posixShellSingleQuote(remotePidFile)})\\\" 2>/dev/null; then printf '__JARVIS_RUNNING__\\\\n'; else printf '__JARVIS_EXITED__\\\\n'; fi\`, 30000);\n                    const lines = String(state.stdout || "").split(/\\r?\\n/).map(value => value.trim()).filter(Boolean);\n                    const processMarker = lines.at(-1) || "";\n                    const payloadLine = [...lines].reverse().find(line => line.startsWith("{") && line.endsWith("}"));\n                    let observed = null;\n                    if (payloadLine) { try { observed = JSON.parse(payloadLine); } catch {} }\n                    if (observed?.status) lastRemoteStage = observed.status;\n                    if (observed?.inferenceStarted === true) inferenceStarted = true;\n                    if (observed?.ok === true) { remoteTerminal = observed; break; }\n                    if (processMarker === "__JARVIS_EXITED__") {\n                        const error = new Error(\`HUMO17_REMOTE_EXITED_WITHOUT_SUCCESS:\${observed?.status || lastRemoteStage}\`);\n                        const detail = await runSsh(endpoint, \`tail -c 6000 \${posixShellSingleQuote(probeJob.logFile)}; test ! -f \${posixShellSingleQuote(probeJob.resultFile)} || cat \${posixShellSingleQuote(probeJob.resultFile)}\`, 30000).catch(() => ({stdout: "diagnostic unavailable"}));\n                        error.logTail = detail.stdout;\n                        throw error;\n                    }\n                } catch (error) {\n                    if (String(error?.message || "").startsWith("HUMO17_REMOTE_EXITED_WITHOUT_SUCCESS")) throw error;\n                    log({status:"HUMO17_REMOTE_POLL_TRANSIENT",podId,stage:lastRemoteStage,error:String(error?.message || error).slice(-500),inferenceStarted});\n                }\n                await sleepMs(5000);\n            }\n            if (!remoteTerminal) {\n                const error = new Error(\`HUMO17_REMOTE_RESULT_DEADLINE:\${lastRemoteStage}\`);\n                const detail = await runSsh(endpoint, \`tail -c 6000 \${posixShellSingleQuote(probeJob.logFile)}; test ! -f \${posixShellSingleQuote(probeJob.resultFile)} || cat \${posixShellSingleQuote(probeJob.resultFile)}\`, 30000).catch(() => ({stdout: "diagnostic unavailable"}));\n                error.logTail = detail.stdout;\n                throw error;\n            }\n            runtimePhysical = remoteTerminal; inferenceStarted = runtimePhysical.inferenceStarted === true;`;
  source = replaceExactOnce(source, oldRemoteExecution, newRemoteExecution, "V142_HUMO17_DETACHED_REMOTE_EXECUTION");
  write(BRIDGE, source);
}

function alignSeriesTests() {
  let source = read(SERIES_TEST);
  const oldExpectation = `    assert.throws(\n        () => getSeriesGenerationContext({\n            root,\n            seriesId,\n            episodeId: prepared.episode.episodeId,\n            generationBackend: "humo-17b-identity"\n        }),\n        /SERIES_HUMO_SINGLE_IDENTITY_REQUIRED:2/\n    );`;
  const newExpectation = `    const humoContext = getSeriesGenerationContext({\n        root,\n        seriesId,\n        episodeId: prepared.episode.episodeId,\n        generationBackend: "humo-17b-identity",\n        referenceSelectionPolicy: "ACTIVE_CAST_COVERAGE"\n    });\n    assert.equal(humoContext.backendPolicy.maximumIdentityCount, 1);\n    assert.equal(humoContext.identityLocks.length, 2);\n    assert.equal(humoContext.policy.backendIdentityLimitsApplyPerShotOnly, true);`;
  source = replaceExactOnce(source, oldExpectation, newExpectation, "V142_SERIES_TEST_PER_SHOT_IDENTITY");
  const marker = `test("V142 long-form series requires a durable roster and persists five-episode production batches", () => {`;
  if (!source.includes(marker)) {
    source += `\n\n${marker}\n    const root = seriesRoot();\n    const seriesId = "SERIES_LONG_FORM_BATCH";\n    createSeriesBible({ root, seriesId, title: "Long form", storyArc: "Continuidad larga.", identityContinuityPolicy: { longFormContinuityRequired: true, minimumPersistentCharacterCount: 5, productionBatchSize: 5 } });\n    const hero = physicalArtifact(root, ".jarvis-artifacts/uploads/long-hero.jpg", "hero", "image/jpeg");\n    registerCharacter(root, seriesId, "CHAR_ONE", "One", [hero]);\n    for (const id of ["CHAR_TWO", "CHAR_THREE", "CHAR_FOUR"]) upsertSeriesCharacter({ root, seriesId, characterId: id, displayName: id, assignmentConfirmed: true, referenceAssets: [], referenceAssetsPending: true });\n    assert.throws(() => prepareSeriesEpisode({ root, seriesId, episodeNumber: 1, title: "EP1", script: "Inicio.", castIds: ["CHAR_ONE"] }), /SERIES_PERSISTENT_CHARACTER_ROSTER_INCOMPLETE:4:5/);\n    upsertSeriesCharacter({ root, seriesId, characterId: "CHAR_FIVE", displayName: "Five", assignmentConfirmed: true, referenceAssets: [], referenceAssetsPending: true });\n    const prepared = prepareSeriesEpisode({ root, seriesId, episodeNumber: 1, title: "EP1", script: "Inicio.", castIds: ["CHAR_ONE"] });\n    assert.deepEqual(prepared.episode.productionBatch, { size: 5, number: 1, startEpisodeNumber: 1, endEpisodeNumber: 5, continuousCanon: true });\n    const canon = getSeriesBible({ root, seriesId });\n    assert.equal(canon.identityContinuityPolicy.minimumPersistentCharacterCount, 5);\n    assert.equal(canon.identityContinuityPolicy.productionBatchSize, 5);\n    assert.equal(canon.identityContinuityPolicy.continuousCanonAcrossProductionBatches, true);\n});\n`;
  }
  write(SERIES_TEST, source);
}

function alignRuntimeTests() {
  let source = read(LOCAL_VIDEO_TEST);
  source = replaceInNamedTest(source, "V142 HuMo17 single-L40S candidate pins FP8 block-swap authority and remains fail-closed", [
    ["    assert.equal(strategy.minimumNetworkVolumeGb, 50);", "    assert.equal(strategy.minimumNetworkVolumeGb, 80);\n    assert.equal(strategy.persistentMinimumNetworkVolumeGb, 80);", "MIN_VOLUME"],
    ["    assert.equal(strategy.capacityFitCertified, false);", "    assert.equal(strategy.capacityFitCertified, true);", "CAPACITY"],
    ["    assert.equal(strategy.storagePlan, \"PERSISTENT_CORE_PLUS_EPHEMERAL_AUXILIARY_REQUIRED\");", "    assert.equal(strategy.storagePlan, \"FULL_PERSISTENT_RUNTIME_80GB\");", "STORAGE_PLAN"],
    ["    assert.equal(strategy.auxiliaryAssetsPersistent, false);", "    assert.equal(strategy.auxiliaryAssetsPersistent, true);", "AUX_PERSISTENT"],
    ["    assert.equal(strategy.auxiliaryAssetsEphemeralRequired, true);", "    assert.equal(strategy.auxiliaryAssetsEphemeralRequired, false);", "AUX_EPHEMERAL"]
  ], "V142_TEST_HUMO17_CANDIDATE");

  source = replaceInNamedTest(source, "V142 next identity runtime preflight is zero-cost and remains fail-closed", [
    ["    assert.equal(result.capacity.certified, false);", "    assert.equal(result.capacity.certified, true);", "CERTIFIED"],
    ["    assert.equal(result.assetPlacementPlan.storagePlan, \"PERSISTENT_CORE_PLUS_EPHEMERAL_AUXILIARY_REQUIRED\");", "    assert.equal(result.assetPlacementPlan.storagePlan, \"FULL_PERSISTENT_RUNTIME_80GB\");", "STORAGE_PLAN"],
    ["    assert.equal(result.assetPlacementPlan.persistentNewAssets.length, 2);", "    assert.equal(result.assetPlacementPlan.persistentNewAssets.length, 5);", "ASSET_COUNT"],
    ["    assert.equal(result.assetPlacementPlan.persistentNewBytes, 18630299842);", "    assert.equal(result.assetPlacementPlan.persistentNewBytes, 31939821856);", "PERSISTENT_BYTES"],
    ["    assert.equal(result.assetPlacementPlan.persistentTotalWithExistingCacheBytes, 40725409344);", "    assert.equal(result.assetPlacementPlan.persistentTotalWithExistingCacheBytes, 54034931358);", "TOTAL_BYTES"],
    ["    assert.equal(result.assetPlacementPlan.ephemeralAssets.length, 3);", "    assert.equal(result.assetPlacementPlan.ephemeralAssets.length, 0);", "EPHEMERAL_COUNT"],
    ["    assert.equal(result.assetPlacementPlan.ephemeralAssetsBytes, 13309522014);", "    assert.equal(result.assetPlacementPlan.ephemeralAssetsBytes, 0);", "EPHEMERAL_BYTES"]
  ], "V142_TEST_HUMO17_PREFLIGHT");

  source = replaceInNamedTest(source, "V142 HuMo17 persistent core cache is additive pinned and fail-closed", [
    ["    assert.equal(contract.profile, \"humo17-fp8-core-v1\");", "    assert.equal(contract.profile, \"humo17-persistent-runtime-v2\");", "PROFILE"],
    ["    assert.equal(contract.requiredFiles.length, 2);", "    assert.equal(contract.requiredFiles.length, 5);", "FILES"],
    ["    assert.equal(contract.totalBytes, 18630299842);", "    assert.equal(contract.totalBytes, 31939821856);", "TOTAL"],
    ["    assert.equal(contract.combinedPersistentBytes, 40725409344);", "    assert.equal(contract.combinedPersistentBytes, 54034931358);", "COMBINED"],
    ["    assert.equal(contract.headroomBytes, 12961681856);", "    assert.equal(contract.headroomBytes, 31864414562);\n    assert.equal(contract.minimumNetworkVolumeGb, 80);", "HEADROOM"]
  ], "V142_TEST_HUMO17_CACHE");

  source = replaceInNamedTest(source, "V142 HuMo17 persistent core staging plan preserves legacy cache and never authorizes spend", [
    ["networkVolumeSizeGb: 50", "networkVolumeSizeGb: 80", "VOLUME_SIZE_1"],
    ["networkVolumeSizeGb: 50", "networkVolumeSizeGb: 80", "VOLUME_SIZE_2"],
    ["networkVolumeSizeGb: 50", "networkVolumeSizeGb: 80", "VOLUME_SIZE_3"],
    ["    assert.equal(plan.newPersistentBytes, 18630299842);", "    assert.equal(plan.newPersistentBytes, 31939821856);", "NEW_BYTES"],
    ["    assert.equal(plan.combinedPersistentBytes, 40725409344);", "    assert.equal(plan.combinedPersistentBytes, 54034931358);", "COMBINED"],
    ["    assert.equal(plan.headroomBytes, 12961681856);", "    assert.equal(plan.headroomBytes, 31864414562);", "HEADROOM"],
    ["    assert.equal(plan.files.length, 2);", "    assert.equal(plan.files.length, 5);", "FILES"]
  ], "V142_TEST_HUMO17_STAGE_PLAN");

  source = replaceInNamedTest(source, "V142 HuMo17 staging bootstrap is prepared offline and protects the legacy cache", [
    ["networkVolumeSizeGb: 50", "networkVolumeSizeGb: 80", "VOLUME_SIZE"]
  ], "V142_TEST_HUMO17_STAGE_BOOTSTRAP");

  source = replaceInNamedTest(source, "V142 SIA7 HuMo executor is typed, budget-capped, source-pinned and control-plane-only after certification", [
    ["    assert.equal(workerSource.includes(\"SIA7_HUMO_MONTHLY_STORAGE_USD = 3.5\"), true);", "    assert.equal(workerSource.includes(\"SIA7_HUMO_MONTHLY_STORAGE_USD = 5.6\"), true);", "STORAGE_COST"]
  ], "V142_TEST_SIA7_STORAGE");

  const marker = `test("V142 HuMo17 paid bootstrap is persistent, offline and checkpointed", () => {`;
  if (!source.includes(marker)) {
    source += `\n\n${marker}\n    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");\n    assert.equal(bridge.includes("git -C /workspace/jarvis-v142/runtime/humo17/ComfyUI rev-parse HEAD"), false);\n    assert.equal(bridge.includes("test -f /workspace/jarvis-v142/runtime/humo17/ComfyUI/.git/HEAD"), true);\n    assert.equal(bridge.includes("PIP_NO_INDEX=1"), true);\n    assert.equal(bridge.includes("/workspace/jarvis-v142/runtime/humo17/runtime-manifest.json"), true);\n    assert.equal(bridge.includes('path.posix.join("/workspace/jarvis-v142/operations", operationId, "probe.mp4")'), true);\n    assert.equal(bridge.includes("nohup setsid timeout"), true);\n    assert.equal(bridge.includes("HUMO17_REMOTE_POLL_TRANSIENT"), true);\n    const runner = fs.readFileSync(new URL("../scripts/jarvis-local-video-wan22.py", import.meta.url), "utf8");\n    for (const status of ["HUMO17_SAMPLER_COMPLETED","HUMO17_VAE_DECODE_COMPLETED","HUMO17_GEOMETRY_VERIFIED","HUMO17_CPU_TRANSFER_STARTED","HUMO17_CPU_TRANSFER_COMPLETED","HUMO17_FFMPEG_STARTED","HUMO17_FFMPEG_COMPLETED","HUMO17_FFPROBE_STARTED","HUMO17_FFPROBE_COMPLETED"]) assert.equal(runner.includes(status), true, status);\n});\n`;
  } else {
    source = replaceInNamedTest(source, "V142 HuMo17 paid bootstrap is persistent, offline and checkpointed", [
      ["    assert.equal(bridge.includes(\"/workspace/jarvis-v142/operations/\"), true);", "    assert.equal(bridge.includes('path.posix.join(\"/workspace/jarvis-v142/operations\", operationId, \"probe.mp4\")'), true);\n    assert.equal(bridge.includes(\"nohup setsid timeout\"), true);\n    assert.equal(bridge.includes(\"HUMO17_REMOTE_POLL_TRANSIENT\"), true);", "DURABLE_OPERATION_PATH"]
    ], "V142_TEST_HUMO17_PAID_BOOTSTRAP");
  }
  write(LOCAL_VIDEO_TEST, source);
}

alignSharedCpuProfileWithoutRegressingLegacy();
alignSeriesLongFormContract();
alignHuMo17RuntimeAndReceipts();
alignSeriesTests();
alignRuntimeTests();

console.log(JSON.stringify({
  ok: true,
  status: "V142_LONG_FORM_HUMO17_FINAL_ALIGNMENT_READY",
  sharedCpuProfileRegressionRemoved: true,
  humo17CpuGpuImageParityPreserved: true,
  longFormRosterGate: true,
  productionBatchSize: 5,
  backendIdentityLimitsApplyPerShotOnly: true,
  publicVideoGenerateContractPreserved: true,
  humo17PaidBootstrapOffline: true,
  humo17PaidBootstrapGitFree: true,
  persistentRuntimeIdentityGated: true,
  detachedRemoteInference: true,
  persistentOperationArtifacts: true,
  billableGpuCreated: false
}));
