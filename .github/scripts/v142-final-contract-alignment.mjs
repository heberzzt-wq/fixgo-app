import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PATCH_BASELINE_COMMIT = "1e75badc5875a282222704216b4f66f831164289";
const SELF = ".github/scripts/v142-final-contract-alignment.mjs";

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}

let source = execFileSync(
  "git",
  ["show", `${PATCH_BASELINE_COMMIT}:${SELF}`],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
);

source = replaceExactOnce(
  source,
  "V142_RUNPOD_CONTROL_PLANE_V2_MATERIALIZED",
  "V142_RUNPOD_V2_CONTROL_PLANE_WITH_GRAPHQL_PROVISIONING",
  "V142_RUNPOD_RETRY_BASELINE_GUARD"
);

source = replaceExactOnce(
  source,
  "let tests = read(TEST);\n\ntests = replaceExactOnce(",
  [
    "let tests = read(TEST);",
    "",
    "tests = replaceExactOnce(",
    "  tests,",
    "  [",
    "    '    assert.equal(firstPoll.remotePoll.status, \"RUNPOD_POLL_TRANSPORT_RETRYABLE\");',",
    "    '    assert.equal(firstPoll.remotePoll.retryable, true);'",
    "  ].join(\"\\n\"),",
    "  [",
    "    '    assert.equal(firstPoll.remotePoll.status, \"RUNPOD_WAN22_BOOTSTRAPPING\");',",
    "    '    assert.equal(',",
    "    '        harness.calls.filter(call =>',",
    "    '            call.kind === \"http\" &&',",
    "    '            call.method === \"GET\" &&',",
    "    '            call.url.includes(\"/pods/pod-l40s-v142\")',",
    "    '        ).length >= 2,',",
    "    '        true',",
    "    '    );'",
    "  ].join(\"\\n\"),",
    "  \"V142_TEST_POLL_INTERNAL_GET_RETRY\"",
    ");",
    "",
    "tests = replaceExactOnce("
  ].join("\n"),
  "V142_TEST_LEGACY_POLL_EXPECTATION_ALIGNMENT"
);

source = replaceExactOnce(
  source,
  "'    assert.equal(deleted.terminationVerified, true, JSON.stringify(deleted));',",
  "'    assert.equal(deleted.workerRelease?.terminationVerified, true, JSON.stringify(deleted));',",
  "V142_TEST_DELETE_RECEIPT_TERMINATION_LOCATION"
);

const temp = path.join(
  os.tmpdir(),
  `fixgo-v142-idempotent-transport-${process.pid}-${Date.now()}.mjs`
);

try {
  fs.writeFileSync(temp, source, "utf8");
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
  status: "V142_RUNPOD_IDEMPOTENT_TRANSPORT_TESTS_ALIGNED",
  patchBaselineCommit: PATCH_BASELINE_COMMIT,
  safeTransportRetries: { GET: 3, DELETE: 3, POST: 1 },
  provisioningRetryAllowed: false,
  cleanupRetryAllowed: true,
  billableGpuCreated: false,
  newFiles: false,
  newWorkflow: false
}));
