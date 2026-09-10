import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BASELINE_COMMIT = "ea8fe32af61a092af5b36cd1fdd7ec9aeec1b3c6";
const BASELINE_PATH = ".github/scripts/v142-final-contract-alignment.mjs";
const TEST_FILE = "tests/jarvis-local-video-engine-v142.test.mjs";
const SERIES_TEST = "tests/jarvis-series-continuity-v142.test.mjs";
const STUDIO = "jarvis-artifact-studio.js";
const BRIDGE = "jarvis-fs-bridge.js";
const ACTUATOR = "gestia-core/jarvis/jarvis.actuator.pack.js";
const CPU_IMAGE = "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404";

function runPinnedBaseline() {
    const source = execFileSync(
        "git",
        ["show", `${BASELINE_COMMIT}:${BASELINE_PATH}`],
        { cwd: process.cwd(), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
    );
    const file = path.join(os.tmpdir(), `v142-final-contract-baseline-${process.pid}.mjs`);
    fs.writeFileSync(file, source, "utf8");
    try {
        execFileSync(process.execPath, [file], {
            cwd: process.cwd(),
            stdio: "inherit",
            maxBuffer: 64 * 1024 * 1024
        });
    } finally {
        fs.rmSync(file, { force: true });
    }
}

function replaceCount(source, before, after, expectedCount, label) {
    const count = source.split(before).length - 1;
    if (count === expectedCount) return source.split(before).join(after);
    if (count === 0 && (source.split(after).length - 1) >= expectedCount) return source;
    throw new Error(`${label}_MATCH_COUNT_${count}_EXPECTED_${expectedCount}`);
}

function transformRegion(source, startMarker, endMarker, transform, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error(`${label}_REGION_MISSING`);
    const region = transform(source.slice(start, end));
    return source.slice(0, start) + region + source.slice(end);
}

function transformNamedTest(source, name, transform, label) {
    const marker = `test(${JSON.stringify(name)}`;
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`${label}_TEST_MISSING`);
    const next = source.indexOf("\n\ntest(", start + marker.length);
    const end = next < 0 ? source.length : next;
    const region = transform(source.slice(start, end));
    return source.slice(0, start) + region + source.slice(end);
}

function alignCpuParityFixtures() {
    let source = fs.readFileSync(TEST_FILE, "utf8").replace(/\r\n/g, "\n");

    source = transformRegion(
        source,
        'async function humoPersistentHarness(fault = "") {',
        '\n}\n\nfor (const fault of ["no volume"',
        region => replaceCount(
            region,
            'image: "ubuntu:22.04", cost: 0.04',
            `image: "${CPU_IMAGE}", cost: 0.04`,
            1,
            "V142_HUMO_PERSISTENT_CPU_POD_IMAGE"
        ),
        "V142_HUMO_PERSISTENT_HARNESS"
    );

    source = transformRegion(
        source,
        'for (const fault of ["cpu success", "cpu download failure", "cpu wrong endpoint"])',
        '\n\nfor (const fault of ["wrong mount", "corrupt mount"])',
        region => replaceCount(
            region,
            'operatingSystem: "ubuntu-22.04"',
            'operatingSystem: "ubuntu-24.04"',
            1,
            "V142_HUMO_CPU_STAGE_HEALTH_OS"
        ),
        "V142_HUMO_CPU_STAGE_LOOP"
    );

    source = transformNamedTest(
        source,
        "V142 CPU staging in EU-NL-1 can prepare model bytes but cannot certify GPU runtime",
        region => {
            region = replaceCount(
                region,
                'imageName: "ubuntu:22.04"',
                `imageName: "${CPU_IMAGE}"`,
                1,
                "V142_CPU_PRECHECK_IMAGE"
            );
            region = replaceCount(
                region,
                '    assert.notEqual(\n        report.payload.imageName,\n        RUNPOD_WAN22_GPU_PROFILES["NVIDIA L40S"].provisionImageTag\n    );',
                '    assert.equal(\n        report.payload.imageName,\n        RUNPOD_WAN22_GPU_PROFILES["NVIDIA L40S"].provisionImageTag\n    );',
                1,
                "V142_CPU_PRECHECK_IMAGE_PARITY"
            );
            return replaceCount(
                region,
                '    assert.equal(\n        JSON.stringify(report.contract.runtimeIdentity).includes("torchVersionPrefix"),\n        false\n    );',
                '    assert.equal(\n        JSON.stringify(report.contract.runtimeIdentity).includes("torchVersionPrefix"),\n        true\n    );',
                1,
                "V142_CPU_PRECHECK_RUNTIME_IDENTITY_PARITY"
            );
        },
        "V142_CPU_PRECHECK"
    );

    source = transformNamedTest(
        source,
        "V142 CPU runtime identity gates cache writes without certifying CUDA or inference",
        region => replaceCount(
            region,
            'operatingSystem: "ubuntu-22.04"',
            'operatingSystem: "ubuntu-24.04"',
            2,
            "V142_CPU_RUNTIME_IDENTITY_OS"
        ),
        "V142_CPU_RUNTIME_IDENTITY"
    );

    source = transformNamedTest(
        source,
        "V142 CPU runtime readiness distinguishes transient polls from terminal SSH contract failures",
        region => replaceCount(
            region,
            'operatingSystem: "ubuntu-22.04"',
            'operatingSystem: "ubuntu-24.04"',
            1,
            "V142_CPU_RUNTIME_READINESS_OS"
        ),
        "V142_CPU_RUNTIME_READINESS"
    );

    if (source.includes('image: "ubuntu:22.04", cost: 0.04')) {
        throw new Error("V142_CPU_POD_IMAGE_FOSSIL_PRESENT");
    }
    const parityTestStart = source.indexOf('test("V142 CPU staging in EU-NL-1 can prepare model bytes but cannot certify GPU runtime"');
    const parityTestEnd = source.indexOf("\n\ntest(", parityTestStart + 10);
    const parityRegion = source.slice(parityTestStart, parityTestEnd < 0 ? source.length : parityTestEnd);
    if (!parityRegion.includes(`imageName: "${CPU_IMAGE}"`) || parityRegion.includes("assert.notEqual(\n        report.payload.imageName")) {
        throw new Error("V142_CPU_GPU_IMAGE_PARITY_FIXTURE_INVALID");
    }
    if (!parityRegion.includes('JSON.stringify(report.contract.runtimeIdentity).includes("torchVersionPrefix"),\n        true')) {
        throw new Error("V142_CPU_RUNTIME_IDENTITY_PARITY_FIXTURE_INVALID");
    }

    fs.writeFileSync(TEST_FILE, source, "utf8");
}

function alignLongFormSeriesCanon() {
    let source = fs.readFileSync(STUDIO, "utf8").replace(/\r\n/g, "\n");
    for (const marker of [
        "function assertSeriesIdentityRosterReady(canon = {})",
        "productionBatchSize",
        "backendIdentityLimitsApplyPerShotOnly: true",
        'referenceUpdateMode = "MERGE"',
        "identityRecastConfirmed = false"
    ]) {
        if (!source.includes(marker)) throw new Error(`V142_LONGFORM_BASE_MISSING:${marker}`);
    }

    source = replaceCount(
        source,
        "    const canon = loaded.canon;\n    const acceptedEpisodeNumbers = [",
        "    const canon = loaded.canon;\n    const rosterState = assertSeriesIdentityRosterReady(canon);\n    const acceptedEpisodeNumbers = [",
        1,
        "V142_LONGFORM_ROSTER_GATE"
    );

    source = replaceCount(
        source,
        "    if ((canon.episodes || []).some(item => item?.episodeNumber === resolvedNumber)) {\n        throw new Error(`SERIES_EPISODE_NUMBER_ALREADY_EXISTS:${resolvedNumber}`);\n    }\n    const normalizedTitle = clean(title).slice(0, 300);",
        "    if ((canon.episodes || []).some(item => item?.episodeNumber === resolvedNumber)) {\n        throw new Error(`SERIES_EPISODE_NUMBER_ALREADY_EXISTS:${resolvedNumber}`);\n    }\n    const productionBatchSize = Number(rosterState.policy.productionBatchSize || 5);\n    const productionBatchNumber = Math.floor((resolvedNumber - 1) / productionBatchSize) + 1;\n    const productionBatchStartEpisode = (productionBatchNumber - 1) * productionBatchSize + 1;\n    const productionBatchEndEpisode = productionBatchStartEpisode + productionBatchSize - 1;\n    const normalizedTitle = clean(title).slice(0, 300);",
        1,
        "V142_LONGFORM_BATCH_CALCULATION"
    );

    source = replaceCount(
        source,
        "        episodeNumber: resolvedNumber,\n        title: normalizedTitle,",
        "        episodeNumber: resolvedNumber,\n        productionBatch: {\n            batchNumber: productionBatchNumber,\n            batchSize: productionBatchSize,\n            startEpisodeNumber: productionBatchStartEpisode,\n            endEpisodeNumber: productionBatchEndEpisode,\n            continuousCanon: rosterState.policy.continuousCanonAcrossProductionBatches === true\n        },\n        title: normalizedTitle,",
        1,
        "V142_LONGFORM_BATCH_PERSISTENCE"
    );

    source = replaceCount(
        source,
        "    const uniqueCastIds = [...new Set(episode.castIds || [])];\n    if (uniqueCastIds.length > Number(backendPolicy.maximumIdentityCount || uniqueCastIds.length)) {\n        if (backendPolicy.backend === \"humo-17b-identity\") {\n            throw new Error(`SERIES_HUMO_SINGLE_IDENTITY_REQUIRED:${uniqueCastIds.length}`);\n        }\n        throw new Error(`SERIES_GENERATION_IDENTITY_LIMIT_EXCEEDED:${backendPolicy.backend}:${uniqueCastIds.length}:${backendPolicy.maximumIdentityCount}`);\n    }\n    const allowCoverageSelection =",
        "    const uniqueCastIds = [...new Set(episode.castIds || [])];\n    // Backend identity limits are enforced per generated shot, never against the durable episode cast.\n    const allowCoverageSelection =",
        1,
        "V142_IDENTITY_LIMIT_PER_SHOT_ONLY"
    );

    fs.writeFileSync(STUDIO, source, "utf8");
}

function alignHuMoPaidBootstrapNoGit() {
    let source = fs.readFileSync(BRIDGE, "utf8").replace(/\r\n/g, "\n");
    const before = "        `test \\\"$(git -C /workspace/jarvis-v142/runtime/humo17/ComfyUI rev-parse HEAD)\\\" = ${q(s.comfyUiRevision)}`,\n        `test \\\"$(git -C /workspace/jarvis-v142/runtime/humo17/ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper rev-parse HEAD)\\\" = ${q(s.wrapperRevision)}`,";
    const after = "        `test \\\"$(cat /workspace/jarvis-v142/runtime/humo17/ComfyUI/.git/HEAD)\\\" = ${q(s.comfyUiRevision)}`,\n        `test \\\"$(cat /workspace/jarvis-v142/runtime/humo17/ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper/.git/HEAD)\\\" = ${q(s.wrapperRevision)}`,";
    source = replaceCount(source, before, after, 1, "V142_HUMO_BOOTSTRAP_NO_GIT");
    if (source.includes("git -C /workspace/jarvis-v142/runtime/humo17")) {
        throw new Error("V142_HUMO_PAID_GIT_FOSSIL_PRESENT");
    }
    fs.writeFileSync(BRIDGE, source, "utf8");
}

function alignSeriesBackendHandoff() {
    let source = fs.readFileSync(ACTUATOR, "utf8").replace(/\r\n/g, "\n");
    for (const marker of ["buildLocalSeriesShotPlan(seriesTimeline", "identityReferenceOutputs", "identityMode", 'name: "video.generate"']) {
        if (!source.includes(marker)) throw new Error(`V142_ACTUATOR_BASE_MISSING:${marker}`);
    }

    source = replaceCount(
        source,
        "                episodeId: \"string\"\n            },",
        "                episodeId: \"string\",\n                generationBackend: \"veo|humo-17b-identity|phantom-wan-14b\"\n            },",
        1,
        "V142_VIDEO_GENERATE_BACKEND_INPUT"
    );
    source = replaceCount(
        source,
        "                let seriesContext = null;\n                if (seriesRequested) {",
        "                const requestedSeriesBackend = String(args.generationBackend || \"veo\").trim().toLowerCase();\n                let seriesContext = null;\n                if (seriesRequested) {",
        1,
        "V142_SERIES_BACKEND_SELECTION"
    );
    source = replaceCount(
        source,
        "                        referenceSelectionPolicy: \"ACTIVE_CAST_COVERAGE\",\n                        maximumReferenceImages: VIDEO_REFERENCE_MAX_COUNT",
        "                        referenceSelectionPolicy: \"ACTIVE_CAST_COVERAGE\",\n                        generationBackend: requestedSeriesBackend",
        1,
        "V142_SERIES_CONTEXT_BACKEND_HANDOFF"
    );
    source = replaceCount(
        source,
        "                const maximumSceneCount = 4;",
        "                if (seriesRequested && seriesShotPlan.length > 0) {\n                    const identityLimit = Number(seriesContext?.backendPolicy?.maximumIdentityCount || 0);\n                    const referenceLimit = Number(seriesContext?.backendPolicy?.maximumReferenceImages || 0);\n                    const invalidIdentityShot = seriesShotPlan.find(shot => identityLimit > 0 && (shot.characterIds || []).length > identityLimit);\n                    if (invalidIdentityShot) {\n                        return {\n                            ok: false, executionOk: false, objectiveSatisfied: false, blocked: true, retryable: false,\n                            status: `SERIES_SHOT_IDENTITY_LIMIT_EXCEEDED:${seriesContext.generationBackend}:${invalidIdentityShot.shotId}:${invalidIdentityShot.characterIds.length}:${identityLimit}`,\n                            error: \"SERIES_SHOT_IDENTITY_LIMIT_EXCEEDED\", shotId: invalidIdentityShot.shotId\n                        };\n                    }\n                    const invalidReferenceShot = seriesShotPlan.find(shot => referenceLimit > 0 && (shot.identityReferenceOutputs || []).length > referenceLimit);\n                    if (invalidReferenceShot) {\n                        return {\n                            ok: false, executionOk: false, objectiveSatisfied: false, blocked: true, retryable: false,\n                            status: `SERIES_SHOT_REFERENCE_LIMIT_EXCEEDED:${seriesContext.generationBackend}:${invalidReferenceShot.shotId}:${invalidReferenceShot.identityReferenceOutputs.length}:${referenceLimit}`,\n                            error: \"SERIES_SHOT_REFERENCE_LIMIT_EXCEEDED\", shotId: invalidReferenceShot.shotId\n                        };\n                    }\n                }\n                const maximumSceneCount = 4;",
        1,
        "V142_SERIES_SHOT_BACKEND_LIMITS"
    );
    fs.writeFileSync(ACTUATOR, source, "utf8");
}

function alignLongFormTests() {
    let series = fs.readFileSync(SERIES_TEST, "utf8").replace(/\r\n/g, "\n");
    series = replaceCount(
        series,
        "    updateSeriesCommercialIdentity,\n    upsertSeriesCharacter",
        "    updateSeriesCommercialIdentity,\n    updateSeriesIdentityContinuityPolicy,\n    upsertSeriesCharacter",
        1,
        "V142_SERIES_POLICY_TEST_IMPORT"
    );
    if (!series.includes('test("long-form series requires five durable characters and persists production batches", () => {')) {
        series += `\n\ntest("long-form series requires five durable characters and persists production batches", () => {\n    const root = seriesRoot();\n    const seriesId = "SERIES_LONG_FORM_80";\n    createSeries(root, seriesId);\n    updateSeriesIdentityContinuityPolicy({ root, seriesId, minimumPersistentCharacterCount: 5, longFormContinuityRequired: true, productionBatchSize: 5 });\n    for (let index = 1; index <= 4; index += 1) {\n        upsertSeriesCharacter({ root, seriesId, characterId: \`CHAR_LONG_\${index}\`, displayName: \`Long \${index}\`, assignmentConfirmed: true, referenceAssets: [], referenceAssetsPending: true });\n    }\n    assert.throws(() => prepareSeriesEpisode({ root, seriesId, episodeNumber: 1, title: "EP1", script: "Inicio", castIds: ["CHAR_LONG_1"] }), /SERIES_PERSISTENT_CHARACTER_ROSTER_INCOMPLETE:4:5/);\n    upsertSeriesCharacter({ root, seriesId, characterId: "CHAR_LONG_5", displayName: "Long 5", assignmentConfirmed: true, referenceAssets: [], referenceAssetsPending: true });\n    const episode = prepareSeriesEpisode({ root, seriesId, episodeNumber: 6, title: "EP6", script: "Segundo lote", castIds: ["CHAR_LONG_1"] }).episode;\n    assert.deepEqual(episode.productionBatch, { batchNumber: 2, batchSize: 5, startEpisodeNumber: 6, endEpisodeNumber: 10, continuousCanon: true });\n});\n\ntest("HuMo identity limit is enforced per shot rather than per durable episode cast", () => {\n    const root = seriesRoot();\n    const seriesId = "SERIES_HUMO_PER_SHOT";\n    createSeries(root, seriesId);\n    const a = physicalArtifact(root, ".jarvis-artifacts/uploads/humo-a.jpg", "humo-a", "image/jpeg");\n    const b = physicalArtifact(root, ".jarvis-artifacts/uploads/humo-b.jpg", "humo-b", "image/jpeg");\n    registerCharacter(root, seriesId, "CHAR_A", "A", [a]);\n    registerCharacter(root, seriesId, "CHAR_B", "B", [b]);\n    const prepared = prepareSeriesEpisode({ root, seriesId, episodeNumber: 1, title: "EP1", script: "A y B participan en tomas separadas.", castIds: ["CHAR_A", "CHAR_B"] });\n    const context = getSeriesGenerationContext({ root, seriesId, episodeId: prepared.episode.episodeId, generationBackend: "humo-17b-identity", referenceSelectionPolicy: "ACTIVE_CAST_COVERAGE" });\n    assert.equal(context.generationBackend, "humo-17b-identity");\n    assert.deepEqual(context.castIds, ["CHAR_A", "CHAR_B"]);\n    assert.equal(context.backendPolicy.maximumIdentityCount, 1);\n});\n`;
    }
    fs.writeFileSync(SERIES_TEST, series, "utf8");

    let local = fs.readFileSync(TEST_FILE, "utf8").replace(/\r\n/g, "\n");
    if (!local.includes('test("V142 persistent HuMo bootstrap is offline and git-free", () => {')) {
        local += `\n\ntest("V142 persistent HuMo bootstrap is offline and git-free", () => {\n    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");\n    const start = bridge.indexOf("function buildHuMo17RuntimeBootstrap");\n    const end = bridge.indexOf("function ", start + 16);\n    const section = bridge.slice(start, end > start ? end : bridge.length);\n    assert.match(section, /runtime\\/humo17\\/venv\\/bin\\/python/);\n    assert.match(section, /PIP_NO_INDEX=1/);\n    assert.match(section, /runtime-manifest\\.json/);\n    assert.equal(section.includes("git -C /workspace/jarvis-v142/runtime/humo17"), false);\n    assert.match(section, /ComfyUI\\/.git\\/HEAD/);\n});\n\ntest("V142 series video handoff carries backend identity limits to each shot", () => {\n    const actuator = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");\n    for (const marker of ["generationBackend: requestedSeriesBackend", "SERIES_SHOT_IDENTITY_LIMIT_EXCEEDED", "SERIES_SHOT_REFERENCE_LIMIT_EXCEEDED"]) {\n        assert.equal(actuator.includes(marker), true, marker);\n    }\n});\n`;
    }
    fs.writeFileSync(TEST_FILE, local, "utf8");
}

runPinnedBaseline();
alignCpuParityFixtures();
alignLongFormSeriesCanon();
alignHuMoPaidBootstrapNoGit();
alignSeriesBackendHandoff();
alignLongFormTests();

console.log(JSON.stringify({
    ok: true,
    status: "V142_LONG_FORM_HUMO17_PREFLIGHT_CONTRACTS_ALIGNED",
    baselineCommit: BASELINE_COMMIT,
    cpuImage: CPU_IMAGE,
    cpuOperatingSystem: "ubuntu-24.04",
    gpuImageParity: true,
    longFormMinimumRosterSupported: true,
    productionBatchSize: 5,
    backendIdentityLimitsPerShotOnly: true,
    humoPaidBootstrapOfflineNoGit: true,
    productionRuntimeChecksWeakened: false,
    l40sStarted: false,
    billableGpuCreated: false
}));
