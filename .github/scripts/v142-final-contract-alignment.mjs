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

if (source.split(helperNeedle).length - 1 !== 1) {
    throw new Error("V142_HUMO17_IDEMPOTENCE_PATCH_SOURCE_MISMATCH");
}

const patchedSource = source.replace(helperNeedle, helperReplacement);
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
