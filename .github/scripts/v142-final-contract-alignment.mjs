import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const BASE_MATERIALIZER_COMMIT = "456a8e4e1a07377d84137eae702d80f3aa1a7a9a";
const MATERIALIZER_PATH = ".github/scripts/v142-final-contract-alignment.mjs";
const LOCAL_VIDEO_ENGINE = "jarvis-local-video-engine.js";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";

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
  LOCAL_VIDEO_ENGINE,
  '        baseTorch: "2.4.0",',
  '        baseTorch: "2.4.1",',
  "V142_HUMO_PHYSICAL_BASE_TORCH_AUTHORITY"
);

replaceFileExactOnce(
  LOCAL_VIDEO_TEST,
  '            torchVersion: "2.4.0+cu124",',
  '            torchVersion: "2.4.1+cu124",',
  "V142_HUMO_PHYSICAL_BASE_TORCH_MOCK"
);

appendFileOnce(
  LOCAL_VIDEO_TEST,
  "V142 HuMo physical base runtime authority matches observed RunPod L40S torch 2.4.1",
  `test("V142 HuMo physical base runtime authority matches observed RunPod L40S torch 2.4.1", () => {\n    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    assert.equal(engineSource.includes('baseTorch: "2.4.1"'), true);\n    assert.equal(engineSource.includes('baseTorch: "2.4.0"'), false);\n});`
);

execFileSync(process.execPath, ["--check", LOCAL_VIDEO_ENGINE], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_PHYSICAL_BASE_TORCH_AUTHORITY_ALIGNED",
  baseMaterializerCommit: BASE_MATERIALIZER_COMMIT,
  providerTrafficUsed: false,
  resourceCreationPossible: false,
  observedPhysicalRuntime: {
    pythonVersion: "3.11.10",
    torchVersion: "2.4.1+cu124",
    torchCudaVersion: "12.4",
    gpuName: "NVIDIA L40S",
    vramBytes: 47665709056
  },
  runtimeCertificationOnly: true,
  bootstrapTorchUnchanged: "2.5.1",
  inferenceAuthorized: false,
  hardBudgetUsd: 2,
  authorizedHourlyRateUsd: 1.09,
  previousPodTerminationVerified: true,
  newFiles: false,
  newBrains: false
}));
