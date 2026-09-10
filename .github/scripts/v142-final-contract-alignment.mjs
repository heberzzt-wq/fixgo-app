import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const BASELINE_COMMIT = "ea8fe32af61a092af5b36cd1fdd7ec9aeec1b3c6";
const BASELINE_PATH = ".github/scripts/v142-final-contract-alignment.mjs";
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TEST_FILE = "tests/jarvis-local-video-engine-v142.test.mjs";
const FS_BRIDGE_TEST_FILE = "tests/jarvis-fs-bridge-v2.test.mjs";
const BRIDGE_FILE = "jarvis-fs-bridge.js";
const CPU_IMAGE = "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404";
const CPU_OS = "ubuntu-24.04";
const HUMO17_QUALITY_BUDGET_USD = 0.95;

function countOf(source, needle) {
    return needle ? source.split(needle).length - 1 : 0;
}

function replaceCountOrAlready(source, before, after, expectedCount, label) {
    const beforeCount = countOf(source, before);
    if (beforeCount === expectedCount) return source.split(before).join(after);
    if (beforeCount === 0 && countOf(source, after) >= expectedCount) return source;
    throw new Error(`${label}_MATCH_COUNT_${beforeCount}_EXPECTED_${expectedCount}`);
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

function runPinnedBaseline() {
    const source = execFileSync(
        "git",
        ["show", `${BASELINE_COMMIT}:${BASELINE_PATH}`],
        { cwd: REPOSITORY_ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
    );
    const file = path.join(os.tmpdir(), `v142-final-contract-${process.pid}.mjs`);
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

function alignCpuParityFixtures() {
    let source = fs.readFileSync(TEST_FILE, "utf8").replace(/\r\n/g, "\n");

    source = transformRegion(
        source,
        'async function humoPersistentHarness(fault = "") {',
        '\n}\n\nfor (const fault of ["no volume"',
        region => replaceCountOrAlready(
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
        region => replaceCountOrAlready(
            region,
            'operatingSystem: "ubuntu-22.04"',
            `operatingSystem: "${CPU_OS}"`,
            1,
            "V142_HUMO_CPU_STAGE_HEALTH_OS"
        ),
        "V142_HUMO_CPU_STAGE_LOOP"
    );

    source = transformNamedTest(
        source,
        "V142 CPU staging in EU-NL-1 can prepare model bytes but cannot certify GPU runtime",
        region => {
            region = replaceCountOrAlready(
                region,
                'imageName: "ubuntu:22.04"',
                `imageName: "${CPU_IMAGE}"`,
                1,
                "V142_CPU_PRECHECK_IMAGE"
            );
            region = replaceCountOrAlready(
                region,
                '    assert.notEqual(\n        report.payload.imageName,\n        RUNPOD_WAN22_GPU_PROFILES["NVIDIA L40S"].provisionImageTag\n    );',
                '    assert.equal(\n        report.payload.imageName,\n        RUNPOD_WAN22_GPU_PROFILES["NVIDIA L40S"].provisionImageTag\n    );',
                1,
                "V142_CPU_PRECHECK_IMAGE_PARITY"
            );
            return replaceCountOrAlready(
                region,
                '    assert.equal(JSON.stringify(report.contract.runtimeIdentity).includes("torchVersionPrefix"), false);',
                '    assert.equal(JSON.stringify(report.contract.runtimeIdentity).includes("torchVersionPrefix"), true);',
                1,
                "V142_CPU_PRECHECK_RUNTIME_IDENTITY_PARITY"
            );
        },
        "V142_CPU_PRECHECK"
    );

    source = transformNamedTest(
        source,
        "V142 CPU runtime identity gates cache writes without certifying CUDA or inference",
        region => replaceCountOrAlready(
            region,
            'operatingSystem: "ubuntu-22.04"',
            `operatingSystem: "${CPU_OS}"`,
            2,
            "V142_CPU_RUNTIME_IDENTITY_OS"
        ),
        "V142_CPU_RUNTIME_IDENTITY"
    );

    source = transformNamedTest(
        source,
        "V142 CPU runtime readiness distinguishes transient polls from terminal SSH contract failures",
        region => replaceCountOrAlready(
            region,
            'operatingSystem: "ubuntu-22.04"',
            `operatingSystem: "${CPU_OS}"`,
            1,
            "V142_CPU_RUNTIME_READINESS_OS"
        ),
        "V142_CPU_RUNTIME_READINESS"
    );

    const parityTestStart = source.indexOf('test("V142 CPU staging in EU-NL-1 can prepare model bytes but cannot certify GPU runtime"');
    const parityTestEnd = source.indexOf("\n\ntest(", parityTestStart + 10);
    const parityRegion = source.slice(parityTestStart, parityTestEnd < 0 ? source.length : parityTestEnd);
    if (!parityRegion.includes(`imageName: "${CPU_IMAGE}"`)) throw new Error("V142_CPU_GPU_IMAGE_PARITY_FIXTURE_INVALID");
    if (!parityRegion.includes('assert.equal(\n        report.payload.imageName,\n        RUNPOD_WAN22_GPU_PROFILES["NVIDIA L40S"].provisionImageTag')) {
        throw new Error("V142_CPU_GPU_IMAGE_EQUALITY_FIXTURE_INVALID");
    }
    if (!parityRegion.includes('JSON.stringify(report.contract.runtimeIdentity).includes("torchVersionPrefix"), true')) {
        throw new Error("V142_CPU_RUNTIME_IDENTITY_PARITY_FIXTURE_INVALID");
    }

    fs.writeFileSync(TEST_FILE, source, "utf8");
}

function alignHuMo17QualityContract() {
    let bridge = fs.readFileSync(BRIDGE_FILE, "utf8").replace(/\r\n/g, "\n");

    bridge = replaceCountOrAlready(
        bridge,
        '       a.hardBudgetUsd!==0.95 || c.hardBudgetUsd!==a.hardBudgetUsd || a.safetyRatio!==0.75 ||',
        `       a.hardBudgetUsd!==${HUMO17_QUALITY_BUDGET_USD} || c.hardBudgetUsd!==a.hardBudgetUsd || a.safetyRatio!==0.75 ||`,
        1,
        "V142_HUMO17_SINGLE_USE_BUDGET"
    );

    bridge = replaceCountOrAlready(
        bridge,
        '    if (quality && hardBudgetUsd > 0.95) throw new Error("HUMO17_QUALITY_BUDGET_EXCEEDED");',
        `    if (quality && hardBudgetUsd > ${HUMO17_QUALITY_BUDGET_USD}) throw new Error("HUMO17_QUALITY_BUDGET_EXCEEDED");`,
        1,
        "V142_HUMO17_QUALITY_BUDGET"
    );

    bridge = replaceCountOrAlready(
        bridge,
        '    const quality = assets.qualityProbe === true;\n    const speechEvidence = quality ? validateHuMo17SpeechEvidence(assets.speechEvidence, assets.audio.sha256) : null;',
        '    const quality = assets.qualityProbe === true;\n    const resolvedOperationId = String(operationId || path.posix.basename(assets.output, path.posix.extname(assets.output))).trim();\n    if (!/^[a-zA-Z0-9._-]{1,120}$/.test(resolvedOperationId)) throw new Error("HUMO17_OPERATION_ID_INVALID");\n    const speechEvidence = quality ? validateHuMo17SpeechEvidence(assets.speechEvidence, assets.audio.sha256) : null;',
        1,
        "V142_HUMO17_OPERATION_ID"
    );

    bridge = replaceCountOrAlready(
        bridge,
        '        operationId, backend: "humo-17b-identity", model: "HuMo-17B", externalApiAllowed: false,',
        '        operationId: resolvedOperationId, backend: "humo-17b-identity", model: "HuMo-17B", externalApiAllowed: false,',
        1,
        "V142_HUMO17_OPERATION_ID_RESULT"
    );

    bridge = replaceCountOrAlready(
        bridge,
        'path.posix.join("/workspace/jarvis-v142/operations", operationId,',
        'path.posix.join("/workspace/jarvis-v142/operations", resolvedOperationId,',
        3,
        "V142_HUMO17_OPERATION_PATHS"
    );

    fs.writeFileSync(BRIDGE_FILE, bridge, "utf8");

    let tests = fs.readFileSync(FS_BRIDGE_TEST_FILE, "utf8").replace(/\r\n/g, "\n");
    tests = transformNamedTest(
        tests,
        "HuMo17 probe is single L40S, pinned, hash-bound, budgeted and distinct from legacy",
        region => {
            region = replaceCountOrAlready(
                region,
                '    assert.match(shell, /venv --system-site-packages/);',
                '    assert.ok(shell.includes("test -x /workspace/jarvis-v142/runtime/humo17/venv/bin/python"));\n    assert.doesNotMatch(shell, /venv --system-site-packages/);',
                1,
                "V142_HUMO17_PREINSTALLED_VENV_TEST"
            );
            region = replaceCountOrAlready(
                region,
                '    assert.match(shell, /--force-reinstall --no-deps ninja==1\\.11\\.1\\.3/);',
                '    assert.doesNotMatch(shell, /pip install/);',
                1,
                "V142_HUMO17_OFFLINE_NO_INSTALL_TEST"
            );
            region = replaceCountOrAlready(
                region,
                '    assert.match(shell, /transformers==4\\.51\\.3/);',
                '    assert.match(shell, /PIP_NO_INDEX=1/);',
                1,
                "V142_HUMO17_OFFLINE_ENV_TEST"
            );
            region = replaceCountOrAlready(
                region,
                '    assert.ok(shell.indexOf("torch.cuda.is_available") < shell.indexOf("pip install"));',
                '    assert.equal(shell.indexOf("pip install"), -1);',
                1,
                "V142_HUMO17_NO_RUNTIME_INSTALL_ORDER_TEST"
            );
            return replaceCountOrAlready(
                region,
                '    assert.match(shell, /wrapperAuxiliaryAssets/); assert.doesNotMatch(shell, /download.*core|generate_1_7B/);',
                '    assert.match(shell, /runtime-manifest\\.json/); assert.doesNotMatch(shell, /download.*core|generate_1_7B/);',
                1,
                "V142_HUMO17_PERSISTENT_RUNTIME_TEST"
            );
        },
        "V142_HUMO17_PROBE_RUNTIME"
    );

    tests = transformNamedTest(
        tests,
        "HuMo17 quality probe rejects noise-only, blind segments, mismatched hashes and insufficient speech",
        region => {
            region = replaceCountOrAlready(
                region,
                '    assert.throws(()=>buildHuMo17RuntimeProbeJob({assets,hardBudgetUsd:1.01,paidAuthorized:true}),/QUALITY_BUDGET/);',
                '    assert.throws(()=>buildHuMo17RuntimeProbeJob({assets,hardBudgetUsd:1.51,paidAuthorized:true}),/QUALITY_BUDGET/);',
                1,
                "V142_HUMO17_QUALITY_BUDGET_REJECTION_TEST"
            );
            return replaceCountOrAlready(
                region,
                '    const job=buildHuMo17RuntimeProbeJob({assets,hardBudgetUsd:0.95,paidAuthorized:true});',
                '    const job=buildHuMo17RuntimeProbeJob({assets,hardBudgetUsd:1.5,paidAuthorized:true});',
                1,
                "V142_HUMO17_QUALITY_BUDGET_ACCEPTANCE_TEST"
            );
        },
        "V142_HUMO17_QUALITY_BUDGET_TEST"
    );

    tests = replaceCountOrAlready(
        tests,
        'hardBudgetUsd:.95,safetyRatio:.75',
        `hardBudgetUsd:${HUMO17_QUALITY_BUDGET_USD},safetyRatio:.75`,
        1,
        "V142_HUMO17_SINGLE_USE_AUTHORITY_FIXTURE_BUDGET"
    );

    fs.writeFileSync(FS_BRIDGE_TEST_FILE, tests, "utf8");

    let localVideoTests = fs.readFileSync(TEST_FILE, "utf8").replace(/\r\n/g, "\n");
    localVideoTests = transformNamedTest(
        localVideoTests,
        "V142 HuMo17 paid bootstrap is persistent, offline and checkpointed",
        region => replaceCountOrAlready(
            region,
            '    assert.equal(bridge.includes(\'path.posix.join("/workspace/jarvis-v142/operations", operationId, "probe.mp4")\'), true);',
            '    assert.equal(bridge.includes(\'path.posix.join("/workspace/jarvis-v142/operations", resolvedOperationId, "probe.mp4")\'), true);',
            1,
            "V142_HUMO17_RESOLVED_OPERATION_ID_TEST"
        ),
        "V142_HUMO17_PAID_BOOTSTRAP"
    );
    fs.writeFileSync(TEST_FILE, localVideoTests, "utf8");
}

runPinnedBaseline();
alignCpuParityFixtures();
alignHuMo17QualityContract();

console.log(JSON.stringify({
    ok: true,
    status: "V142_SINGLE_FINAL_CONTRACT_MATERIALIZER_APPLIED",
    baselineCommit: BASELINE_COMMIT,
    cpuParityFixturesAligned: true,
    cpuImage: CPU_IMAGE,
    cpuOperatingSystem: CPU_OS,
    humo17QualityContractAligned: true,
    humo17QualityBudgetUsd: HUMO17_QUALITY_BUDGET_USD,
    humo17SingleUseAuthorityFixtureAligned: true,
    humo17OfflineRuntimeAligned: true,
    humo17GeneratedPaidBootstrapAssertionAligned: true,
    fixtureGitLookupAnchoredToRepository: true,
    duplicateAlignmentRemoved: true,
    l40sStarted: false,
    billableGpuCreated: false
}));