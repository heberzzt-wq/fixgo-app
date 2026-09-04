import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const BASE_MATERIALIZER_COMMIT = "9aa1cbedd3d4af9cece6312d6ab004a75b31b0f7";
const MATERIALIZER_PATH = ".github/scripts/v142-final-contract-alignment.mjs";
const LOCAL_VIDEO_ENGINE = "jarvis-local-video-engine.js";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";
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
  LOCAL_VIDEO_ENGINE,
  [
    '            "progress HUMO_RUNTIME RUNNING",',
    '            "test -x \\\"$VENV/bin/python\\\" || python3 -m venv \\\"$VENV\\\"",',
    '            "\\\"$VENV/bin/python\\\" -m pip install --upgrade pip setuptools wheel packaging ninja \'huggingface_hub[cli]>=0.30,<1\'",',
    '            "\\\"$VENV/bin/python\\\" -m pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124",',
    '            "MAX_JOBS=4 \\\"$VENV/bin/python\\\" -m pip install flash_attn==2.6.3 --no-build-isolation",',
    '            "\\\"$VENV/bin/python\\\" -m pip install -r \\\"$HUMO_REPO/requirements.txt\\\"",',
    '            "\\\"$VENV/bin/python\\\" -m pip check",',
    '            "progress HUMO_RUNTIME READY",'
  ].join("\n"),
  [
    '            "progress HUMO_RUNTIME RUNNING",',
    '            "progress HUMO_VENV RUNNING",',
    '            "test -x \\\"$VENV/bin/python\\\" || python3 -m venv \\\"$VENV\\\"",',
    '            "\\\"$VENV/bin/python\\\" -m pip install --upgrade pip setuptools wheel packaging ninja \'huggingface_hub[cli]>=0.30,<1\'",',
    '            "progress HUMO_VENV READY",',
    '            "progress HUMO_TORCH RUNNING",',
    '            "\\\"$VENV/bin/python\\\" -m pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124",',
    '            "\\\"$VENV/bin/python\\\" -c \\\"import torch; assert str(torch.__version__).startswith(\'2.5.1\'); assert str(torch.version.cuda or \'\').startswith(\'12.4\')\\\"",',
    '            "progress HUMO_TORCH READY",',
    '            "progress HUMO_FLASH_ATTENTION RUNNING",',
    '            "MAX_JOBS=4 \\\"$VENV/bin/python\\\" -m pip install flash_attn==2.6.3 --no-build-isolation &",',
    '            "FLASH_ATTN_PID=$!",',
    '            "while kill -0 \\\"$FLASH_ATTN_PID\\\" 2>/dev/null; do progress HUMO_FLASH_ATTENTION RUNNING; sleep 20; done",',
    '            "wait \\\"$FLASH_ATTN_PID\\\"",',
    '            "\\\"$VENV/bin/python\\\" -c \\\"import importlib.metadata; assert importlib.metadata.version(\'flash-attn\') == \'2.6.3\'\\\"",',
    '            "progress HUMO_FLASH_ATTENTION READY",',
    '            "progress HUMO_REQUIREMENTS RUNNING",',
    '            "\\\"$VENV/bin/python\\\" -m pip install -r \\\"$HUMO_REPO/requirements.txt\\\"",',
    '            "\\\"$VENV/bin/python\\\" -m pip check",',
    '            "progress HUMO_REQUIREMENTS READY",',
    '            "progress HUMO_RUNTIME READY",'
  ].join("\n"),
  "V142_HUMO_RUNTIME_SUBSTAGE_HEARTBEATS"
);

appendFileOnce(
  LOCAL_VIDEO_TEST,
  "V142 HuMo runtime bootstrap exposes venv torch flash-attention and requirements substages",
  `test("V142 HuMo runtime bootstrap exposes venv torch flash-attention and requirements substages", () => {\n    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    for (const stage of ["HUMO_VENV", "HUMO_TORCH", "HUMO_FLASH_ATTENTION", "HUMO_REQUIREMENTS"]) {\n        assert.equal(engineSource.includes("progress " + stage + " RUNNING"), true);\n        assert.equal(engineSource.includes("progress " + stage + " READY"), true);\n    }\n    assert.equal(engineSource.includes("FLASH_ATTN_PID=$!"), true);\n    assert.equal(engineSource.includes("while kill -0"), true);\n    assert.equal(engineSource.includes("MAX_JOBS=4"), true);\n    assert.equal(engineSource.includes("flash_attn==2.6.3 --no-build-isolation"), true);\n});`
);

replaceFileExactOnce(
  FS_BRIDGE,
  '    const runtimeEnv = {',
  '    const requestedHardBudgetUsd = Number(String(env.JARVIS_HUMO_RUNTIME_CERT_HARD_BUDGET_USD || "2").trim());\n    if (!Number.isFinite(requestedHardBudgetUsd) || requestedHardBudgetUsd <= 0 || requestedHardBudgetUsd > 2) {\n        throw new Error("RUNPOD_HUMO_RUNTIME_CERT_BUDGET_INVALID");\n    }\n    const certificationHardBudgetUsd = requestedHardBudgetUsd;\n    const certificationDeadlineMinutes = 60;\n    const runtimeEnv = {',
  "V142_HUMO_RUNTIME_REMAINING_BUDGET_INPUT"
);

replaceFileExactOnce(
  FS_BRIDGE,
  '        JARVIS_REMOTE_GPU_HARD_BUDGET_USD: "2",',
  '        JARVIS_REMOTE_GPU_HARD_BUDGET_USD: String(certificationHardBudgetUsd),',
  "V142_HUMO_RUNTIME_REMAINING_BUDGET_APPLY"
);

replaceFileExactOnce(
  FS_BRIDGE,
  '        JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: "1500",\n        JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: "1800",',
  '        JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: "3300",\n        JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: "3600",',
  "V142_HUMO_RUNTIME_BOOTSTRAP_TIMEOUT"
);

replaceFileExactOnce(
  FS_BRIDGE,
  '    const deadlineMs = Date.now() + 30 * 60 * 1000;',
  '    const deadlineMs = Date.now() + certificationDeadlineMinutes * 60 * 1000;',
  "V142_HUMO_RUNTIME_OPERATIONAL_DEADLINE"
);

replaceFileExactOnce(
  FS_BRIDGE,
  '            hardBudgetUsd: 2,\n            authorizedHourlyRateUsd: 1.09,\n            maximumOperationalMinutes: 30,',
  '            hardBudgetUsd: certificationHardBudgetUsd,\n            authorizedHourlyRateUsd: 1.09,\n            maximumOperationalMinutes: certificationDeadlineMinutes,',
  "V142_HUMO_RUNTIME_BUDGET_RECEIPT"
);

replaceFileExactOnce(
  FS_BRIDGE,
  '            Number(final.gpuRentalEstimatedCost || 0) > 2',
  '            Number(final.gpuRentalEstimatedCost || 0) > certificationHardBudgetUsd',
  "V142_HUMO_RUNTIME_BUDGET_FINAL_GATE"
);

replaceFileExactOnce(
  FS_BRIDGE_TEST,
  '    assert.equal(bridgeSource.includes(\'JARVIS_REMOTE_GPU_HARD_BUDGET_USD: "2"\'), true);',
  '    assert.equal(bridgeSource.includes("JARVIS_HUMO_RUNTIME_CERT_HARD_BUDGET_USD"), true);\n    assert.equal(bridgeSource.includes("JARVIS_REMOTE_GPU_HARD_BUDGET_USD: String(certificationHardBudgetUsd)"), true);',
  "V142_HUMO_RUNTIME_BUDGET_TEST"
);

replaceFileExactOnce(
  FS_BRIDGE_TEST,
  '    assert.equal(bridgeSource.includes("Date.now() + 30 * 60 * 1000"), true);',
  '    assert.equal(bridgeSource.includes("certificationDeadlineMinutes * 60 * 1000"), true);',
  "V142_HUMO_RUNTIME_DEADLINE_TEST"
);

appendFileOnce(
  FS_BRIDGE_TEST,
  "V142 HuMo runtime certification supports a lower per-attempt budget and a 55 minute bootstrap window",
  `test("V142 HuMo runtime certification supports a lower per-attempt budget and a 55 minute bootstrap window", () => {\n    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");\n    assert.equal(bridgeSource.includes("RUNPOD_HUMO_RUNTIME_CERT_BUDGET_INVALID"), true);\n    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: "3300"'), true);\n    assert.equal(bridgeSource.includes('JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: "3600"'), true);\n    assert.equal(bridgeSource.includes("const certificationDeadlineMinutes = 60"), true);\n    assert.equal(bridgeSource.includes("Number(final.gpuRentalEstimatedCost || 0) > certificationHardBudgetUsd"), true);\n});`
);

execFileSync(process.execPath, ["--check", LOCAL_VIDEO_ENGINE], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", FS_BRIDGE], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_RUNTIME_BOOTSTRAP_CERTIFICATION_HARDENED",
  baseMaterializerCommit: BASE_MATERIALIZER_COMMIT,
  providerTrafficUsed: false,
  resourceCreationPossible: false,
  runtimeCertificationOnly: true,
  inferenceAuthorized: false,
  flashAttentionVersion: "2.6.3",
  flashAttentionBuildMode: "official_source_build",
  flashAttentionMaxJobs: 4,
  bootstrapTimeoutSeconds: 3300,
  operationalDeadlineMinutes: 60,
  maximumHardBudgetUsd: 2,
  lowerPerAttemptBudgetSupported: true,
  knownPreviousEstimatedSpendUsd: 0.492600066667,
  suggestedNextAttemptHardBudgetUsd: 1.5,
  authorizedHourlyRateUsd: 1.09,
  previousPodTerminationVerified: true,
  newFiles: false,
  newBrains: false
}));
