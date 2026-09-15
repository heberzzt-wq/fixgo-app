import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const SOURCE_COMMIT = "a404da7f5b55d97427a5dc33bd21c8e72c849f5d";
const SOURCE_PATH = ".github/scripts/v142-final-contract-alignment.mjs";
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

const source = execFileSync(
    "git",
    ["show", `${SOURCE_COMMIT}:${SOURCE_PATH}`],
    { cwd: REPOSITORY_ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
);

const helperNeedle = `    if (beforeCount === 0 && countOf(source, after) >= expectedCount) return source;\n    throw new Error(\`\${label}_MATCH_COUNT_\${beforeCount}_EXPECTED_\${expectedCount}\`);`;
const helperReplacement = `    if (beforeCount === 0 && countOf(source, after) >= expectedCount) return source;\n    if (label === "V142_HUMO17_OPERATION_ID" && beforeCount === 0 &&\n        source.includes('    const resolvedOperationId = String(operationId || path.posix.basename(assets.output, path.posix.extname(assets.output))).trim();')) return source;\n    if (label === \"V142_HUMO17_PREINSTALLED_VENV_TEST\" && beforeCount === 0 &&\n        source.includes('    assert.ok(shell.includes(\"test -x /workspace/jarvis-v142/runtime/humo17/venv/bin/python\"));') &&\n        source.includes('    assert.doesNotMatch(shell, /venv --system-site-packages/);')) return source;\n    throw new Error(\`\${label}_MATCH_COUNT_\${beforeCount}_EXPECTED_\${expectedCount}\`);`;
const baselineNeedle = `function runPinnedBaseline() {\n    const source = execFileSync(`;
const baselineReplacement = `function runPinnedBaseline() {\n    const currentEngine = fs.readFileSync("jarvis-local-video-engine.js", "utf8").replace(/\\r\\n/g, "\\n");\n    const currentBridge = fs.readFileSync(BRIDGE_FILE, "utf8").replace(/\\r\\n/g, "\\n");\n    const physicalStorageAuthority =\n        currentEngine.includes('            minimumNetworkVolumeGb: 50,') &&\n        currentEngine.includes('            persistentMinimumNetworkVolumeGb: 50,') &&\n        currentEngine.includes('            persistentVolumeBytes: 53687091200,') &&\n        currentEngine.includes('            storagePlan: "PERSISTENT_CORE_PLUS_EPHEMERAL_AUXILIARY_REQUIRED",') &&\n        currentEngine.includes('            auxiliaryAssetsPersistent: false,') &&\n        currentEngine.includes('            auxiliaryAssetsEphemeralRequired: true,') &&\n        currentBridge.includes("for a in j['strategy']['wrapperAuxiliaryAssets']:");\n    if (physicalStorageAuthority) return;\n    const source = execFileSync(`;

if (source.split(helperNeedle).length - 1 !== 1) {
    throw new Error("V142_HUMO17_IDEMPOTENCE_PATCH_SOURCE_MISMATCH");
}
if (source.split(baselineNeedle).length - 1 !== 1) {
    throw new Error("V142_HUMO17_DURABLE_BASELINE_GUARD_SOURCE_MISMATCH");
}

// The historical quality aligner also rewrote the probe test to require an
// unproven persistent runtime. Preserve the split-runtime test, not that rewrite.
const probeTestNeedle = `        "HuMo17 probe is single L40S, pinned, hash-bound, budgeted and distinct from legacy",\n        region => {`;
if (source.split(probeTestNeedle).length - 1 !== 1) {
    throw new Error("V142_HUMO17_SPLIT_PROBE_GUARD_SOURCE_MISMATCH");
}
const probeTestReplacement = probeTestNeedle + `
            if (bridge.includes("for a in j['strategy']['wrapperAuxiliaryAssets']:") &&
                bridge.includes("python3 -m venv --system-site-packages /tmp/jarvis-humo17/venv")) {
                if (!region.includes("aux_verify(partial, a)") ||
                    !region.includes("partial.rename(p)") ||
                    !region.includes("download_auxiliary(a,p,url)") ||
                    !region.includes("target.symlink_to(p)")) {
                    throw new Error("V142_HUMO17_SPLIT_PROBE_TEST_REQUIRED");
                }
                return region;
            }`;
const patchedSource = source
    .replace(helperNeedle, helperReplacement)
    .replace(baselineNeedle, baselineReplacement)
    .replace(probeTestNeedle, probeTestReplacement)
    .replace('"V142 HuMo17 paid bootstrap is persistent, offline and checkpointed",',
        '"V142 HuMo17 bootstrap uses ephemeral runtime and auxiliaries with persistent verified core",')
    .replace('    humo17OfflineRuntimeAligned: true,', '    humo17SplitRuntimeAligned: true,');
const tempScript = path.join(scriptDirectory, `.v142-final-contract-alignment-${process.pid}.mjs`);
fs.writeFileSync(tempScript, patchedSource, "utf8");
try {
    execFileSync(process.execPath, [tempScript], {
        cwd: process.cwd(),
        stdio: "inherit",
        maxBuffer: 64 * 1024 * 1024
    });
} finally {
    fs.rmSync(tempScript, { force: true });
}
