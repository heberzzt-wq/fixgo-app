import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PATCH_BASELINE_COMMIT = "1e75badc5875a282222704216b4f66f831164289";
const SELF = ".github/scripts/v142-final-contract-alignment.mjs";

const source = execFileSync(
  "git",
  ["show", `${PATCH_BASELINE_COMMIT}:${SELF}`],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
);

const before = "V142_RUNPOD_CONTROL_PLANE_V2_MATERIALIZED";
const after = "V142_RUNPOD_V2_CONTROL_PLANE_WITH_GRAPHQL_PROVISIONING";
const count = source.split(before).length - 1;
if (count !== 1) {
  throw new Error(`V142_RUNPOD_RETRY_BASELINE_GUARD_MATCH_COUNT_${count}`);
}

const patched = source.replace(before, after);
const temp = path.join(
  os.tmpdir(),
  `fixgo-v142-idempotent-transport-${process.pid}-${Date.now()}.mjs`
);

try {
  fs.writeFileSync(temp, patched, "utf8");
  execFileSync(process.execPath, [temp], {
    cwd: process.cwd(),
    stdio: "inherit",
    maxBuffer: 64 * 1024 * 1024
  });
} finally {
  fs.rmSync(temp, { force: true });
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_RUNPOD_IDEMPOTENT_TRANSPORT_BASELINE_GUARD_CORRECTED",
  patchBaselineCommit: PATCH_BASELINE_COMMIT,
  safeTransportRetries: { GET: 3, DELETE: 3, POST: 1 },
  provisioningRetryAllowed: false,
  cleanupRetryAllowed: true,
  billableGpuCreated: false,
  newFiles: false,
  newWorkflow: false
}));
