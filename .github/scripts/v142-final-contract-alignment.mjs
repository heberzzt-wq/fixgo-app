import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BASELINE_COMMIT = "ea8fe32af61a092af5b36cd1fdd7ec9aeec1b3c6";
const BASELINE_PATH = ".github/scripts/v142-final-contract-alignment.mjs";
const TEST_FILE = "tests/jarvis-local-video-engine-v142.test.mjs";
const CPU_IMAGE = "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404";
const CPU_OS = "ubuntu-24.04";

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
        { cwd: process.cwd(), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
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

runPinnedBaseline();
alignCpuParityFixtures();

console.log(JSON.stringify({
    ok: true,
    status: "V142_SINGLE_FINAL_CONTRACT_MATERIALIZER_APPLIED",
    baselineCommit: BASELINE_COMMIT,
    cpuParityFixturesAligned: true,
    cpuImage: CPU_IMAGE,
    cpuOperatingSystem: CPU_OS,
    duplicateAlignmentRemoved: true,
    l40sStarted: false,
    billableGpuCreated: false
}));
