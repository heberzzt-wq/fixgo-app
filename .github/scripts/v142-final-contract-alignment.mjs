import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BASELINE_COMMIT = "ea8fe32af61a092af5b36cd1fdd7ec9aeec1b3c6";
const BASELINE_PATH = ".github/scripts/v142-final-contract-alignment.mjs";

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

console.log(JSON.stringify({
    ok: true,
    status: "V142_SINGLE_FINAL_CONTRACT_MATERIALIZER_APPLIED",
    baselineCommit: BASELINE_COMMIT,
    duplicateAlignmentRemoved: true,
    l40sStarted: false,
    billableGpuCreated: false
}));
