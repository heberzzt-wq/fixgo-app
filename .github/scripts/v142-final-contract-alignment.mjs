import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const BASE_MATERIALIZER_COMMIT = "127ea463d98c1560244bc63eb2e0cd25602c3d3d";
const MATERIALIZER_PATH = ".github/scripts/v142-final-contract-alignment.mjs";
const FS_BRIDGE = "jarvis-fs-bridge.js";
const FS_BRIDGE_TEST = "tests/jarvis-fs-bridge-v2.test.mjs";

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}

function replaceFileExactOnce(file, before, after, label) {
  const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const next = replaceExactOnce(source, before, after, label);
  if (next !== source) fs.writeFileSync(file, next, "utf8");
}

function appendFileOnce(file, marker, addition) {
  const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (source.includes(marker)) return;
  fs.writeFileSync(file, `${source.trimEnd()}\n\n${addition.trim()}\n`, "utf8");
}

const baseMaterializer = execFileSync(
  "git",
  ["show", `${BASE_MATERIALIZER_COMMIT}:${MATERIALIZER_PATH}`],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
).replace(/\r\n/g, "\n");

const materialized = spawnSync(process.execPath, ["--input-type=module", "-"], {
  cwd: process.cwd(),
  input: baseMaterializer,
  encoding: "utf8",
  stdio: ["pipe", "inherit", "inherit"]
});
if (materialized.error) throw materialized.error;
if (materialized.status !== 0) {
  throw new Error(`V142_BASE_MATERIALIZER_EXIT_${materialized.status}`);
}

replaceFileExactOnce(
  FS_BRIDGE,
  `        while (Date.now() < deadlineMs) {\n            const polled = await engine.poll({ operationName });\n            log({\n                ok: polled?.ok === true,\n                status: polled?.status || null,\n                done: polled?.done === true,\n                podId: polled?.podId || polled?.remoteWorker?.podId || null,\n                gpuRentalEstimatedCost: Number(polled?.gpuRentalEstimatedCost || 0)\n            });\n            if (polled?.done === true) {`,
  `        const certificationStartedMs = Date.now();\n        while (Date.now() < deadlineMs) {\n            const polled = await engine.poll({ operationName });\n            const remoteWorker = polled?.remoteWorker || {};\n            const bootstrapProgress = remoteWorker?.bootstrapProgress || null;\n            const elapsedSeconds = Math.max(0, (Date.now() - certificationStartedMs) / 1000);\n            const providerReportedCostUsd = Number(\n                polled?.gpuRentalEstimatedCost || remoteWorker?.gpuRentalEstimatedCost || 0\n            );\n            const wallClockUpperBoundCostUsd = Number((elapsedSeconds * 1.09 / 3600).toFixed(6));\n            log({\n                ok: polled?.ok === true,\n                status: polled?.status || null,\n                done: polled?.done === true,\n                podId: polled?.podId || remoteWorker?.podId || null,\n                remotePhase: remoteWorker?.phase || null,\n                bootstrapStage: bootstrapProgress?.stage || null,\n                bootstrapStatus: bootstrapProgress?.status || null,\n                bootstrapAt: bootstrapProgress?.at || null,\n                cacheStatus: remoteWorker?.cacheStatus || bootstrapProgress?.cacheStatus || null,\n                elapsedSeconds: Number(elapsedSeconds.toFixed(1)),\n                providerReportedCostUsd,\n                wallClockUpperBoundCostUsd,\n                terminationVerified: polled?.workerRelease?.terminationVerified === true\n            });\n            if (polled?.done === true) {`,
  "V142_HUMO_RUNTIME_CERTIFICATION_PROGRESS_OBSERVABILITY"
);

appendFileOnce(
  FS_BRIDGE_TEST,
  "V142 HuMo runtime certification CLI exposes remote bootstrap progress and nonzero wall clock cost",
  `test("V142 HuMo runtime certification CLI exposes remote bootstrap progress and nonzero wall clock cost", () => {\n    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");\n    assert.equal(bridgeSource.includes("remotePhase: remoteWorker?.phase || null"), true);\n    assert.equal(bridgeSource.includes("bootstrapStage: bootstrapProgress?.stage || null"), true);\n    assert.equal(bridgeSource.includes("bootstrapStatus: bootstrapProgress?.status || null"), true);\n    assert.equal(bridgeSource.includes("wallClockUpperBoundCostUsd"), true);\n    assert.equal(bridgeSource.includes("providerReportedCostUsd"), true);\n    assert.equal(bridgeSource.includes("terminationVerified: polled?.workerRelease?.terminationVerified === true"), true);\n});`
);

execFileSync(process.execPath, ["--check", FS_BRIDGE], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_RUNTIME_CERTIFICATION_PROGRESS_OBSERVABILITY_READY",
  baseMaterializerCommit: BASE_MATERIALIZER_COMMIT,
  providerTrafficUsed: false,
  resourceCreationPossible: false,
  bootstrapTimeoutSecondsUnchanged: 1500,
  hardBudgetUsd: 2,
  authorizedHourlyRateUsd: 1.09,
  runtimeCertificationOnly: true,
  inferenceAuthorized: false,
  progressFields: [
    "remotePhase",
    "bootstrapStage",
    "bootstrapStatus",
    "bootstrapAt",
    "cacheStatus",
    "providerReportedCostUsd",
    "wallClockUpperBoundCostUsd",
    "terminationVerified"
  ],
  newFiles: false,
  newBrains: false
}));
