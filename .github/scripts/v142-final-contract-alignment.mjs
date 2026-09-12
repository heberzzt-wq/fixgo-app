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
const helperReplacement = `    if (beforeCount === 0 && countOf(source, after) >= expectedCount) return source;\n    if (label === "V142_HUMO17_OPERATION_ID" && beforeCount === 0 &&\n        source.includes('    const resolvedOperationId = String(operationId || path.posix.basename(assets.output, path.posix.extname(assets.output))).trim();')) return source;\n    throw new Error(\`\${label}_MATCH_COUNT_\${beforeCount}_EXPECTED_\${expectedCount}\`);`;
const baselineNeedle = `function runPinnedBaseline() {\n    const source = execFileSync(`;
const baselineReplacement = `function runPinnedBaseline() {\n    const currentBridge = fs.readFileSync(BRIDGE_FILE, "utf8").replace(/\\r\\n/g, "\\n");\n    if (currentBridge.includes('    const durableCoreEvidencePath = path.resolve(root, ".sia7", "humo17-quality-201f-final-preflight.json");') &&\n        currentBridge.includes('    const stageReceiptFile = "";')) return;\n    const source = execFileSync(`;

if (source.split(helperNeedle).length - 1 !== 1) {
    throw new Error("V142_HUMO17_IDEMPOTENCE_PATCH_SOURCE_MISMATCH");
}
if (source.split(baselineNeedle).length - 1 !== 1) {
    throw new Error("V142_HUMO17_DURABLE_BASELINE_GUARD_SOURCE_MISMATCH");
}

const patchedSource = source
    .replace(helperNeedle, helperReplacement)
    .replace(baselineNeedle, baselineReplacement);
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
