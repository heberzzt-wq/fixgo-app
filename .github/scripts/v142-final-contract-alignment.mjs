import { execFileSync, spawnSync } from "node:child_process";

const SOURCE_COMMIT = "3146353779869dabcce1323c90c2e71ecb3a4f20";
const MATERIALIZER_PATH = ".github/scripts/v142-final-contract-alignment.mjs";

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}

let source = execFileSync(
  "git",
  ["show", `${SOURCE_COMMIT}:${MATERIALIZER_PATH}`],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
).replace(/\r\n/g, "\n");

source = replaceExactOnce(
  source,
  String.raw`            "if test \"$RUNTIME_CERTIFICATION_ONLY\" = 1; then",`,
  String.raw`            "if test \\"$RUNTIME_CERTIFICATION_ONLY\\" = 1; then",`,
  "V142_HUMO_CERTIFICATION_SHELL_QUOTES"
);

source = replaceExactOnce(
  source,
  String.raw`            "  \"$VENV/bin/hf\" download Wan-AI/Wan2.1-T2V-1.3B --local-dir \"$WAN21_WEIGHTS\"",`,
  String.raw`            "  \\"$VENV/bin/hf\\" download Wan-AI/Wan2.1-T2V-1.3B --local-dir \\"$WAN21_WEIGHTS\\"",`,
  "V142_HUMO_WAN21_SHELL_QUOTES"
);

source = replaceExactOnce(
  source,
  String.raw`        assert.equal(engineSource.includes('if (configuredBackend !== WAN22_TI2V_5B.backend) throw new Error("RUNPOD_WAN22_BACKEND_REQUIRED")'), true);`,
  String.raw`        assert.equal(engineSource.includes("remoteHuMoLifecycleContract"), true);\n        assert.equal(engineSource.includes("RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED"), true);`,
  "V142_HUMO_PRECHECK_REGRESSION_ARCHITECTURE"
);

const materialized = spawnSync(process.execPath, ["--input-type=module", "-"], {
  cwd: process.cwd(),
  input: source,
  encoding: "utf8",
  stdio: ["pipe", "inherit", "inherit"]
});
if (materialized.error) throw materialized.error;
if (materialized.status !== 0) {
  throw new Error(`V142_HUMO_SOURCE_MATERIALIZER_EXIT_${materialized.status}`);
}

execFileSync(process.execPath, ["--check", "jarvis-local-video-engine.js"], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_REMOTE_LIFECYCLE_REGRESSION_ALIGNED",
  sourceCommit: SOURCE_COMMIT,
  providerTrafficUsed: false,
  resourceCreationPossible: false,
  paidLaunchBlockedBeforeProviderTraffic: true,
  staleWanOnlyAssertionRemoved: true,
  newFiles: false,
  newBrains: false
}));