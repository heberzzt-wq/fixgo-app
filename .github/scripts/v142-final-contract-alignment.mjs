import fs from "node:fs";
import { execFileSync } from "node:child_process";

const PRODUCT_BASE_COMMIT = "69f50705a25dd3a7ccb755aca1df67e646edc457";
const WAN21_REVISION = "37ec512624d61f7aa208f7ea8140a131f93afc9a";
const LOCAL_VIDEO_ENGINE = "jarvis-local-video-engine.js";
const LOCAL_VIDEO_RUNNER = "scripts/jarvis-local-video-wan22.py";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";
const FS_BRIDGE = "jarvis-fs-bridge.js";

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
}

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}

function appendOnce(source, marker, addition) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

let runner = read(LOCAL_VIDEO_RUNNER);
runner = replaceExactOnce(
  runner,
  '    torchrun = _humo_executable(os.environ.get("JARVIS_HUMO_TORCHRUN", ""), "torchrun")\n',
  [
    '    runtime_python = str(Path(sys.executable).absolute())',
    '    if not runtime_python.replace("\\\\", "/").endswith("/venv/bin/python"):',
    '        raise RuntimeError("LOCAL_VIDEO_HUMO_CERTIFIED_VENV_REQUIRED")',
    '    runtime_check = subprocess.run(',
    '        [',
    '            runtime_python,',
    '            "-c",',
    '            (',
    '                "import importlib.metadata,omegaconf,torch; "',
    '                "assert str(torch.__version__).startswith(\\\"2.5.1\\\"); "',
    '                "assert str(torch.version.cuda or \\\"\\\").startswith(\\\"12.4\\\"); "',
    '                "assert importlib.metadata.version(\\\"flash-attn\\\")==\\\"2.6.3\\\""',
    '            ),',
    '        ],',
    '        check=False,',
    '        capture_output=True,',
    '        text=True,',
    '        timeout=60,',
    '    )',
    '    if runtime_check.returncode != 0:',
    '        diagnostic = str(runtime_check.stderr or runtime_check.stdout or "")[-1000:]',
    '        raise RuntimeError(f"LOCAL_VIDEO_HUMO_CERTIFIED_VENV_INVALID:{diagnostic}")',
    ''
  ].join("\n"),
  "V142_HUMO_CERTIFIED_VENV_GATE"
);

runner = replaceExactOnce(
  runner,
  [
    '    command = [',
    '        torchrun,',
    '        "--standalone",'
  ].join("\n"),
  [
    '    command = [',
    '        runtime_python,',
    '        "-m",',
    '        "torch.distributed.run",',
    '        "--standalone",'
  ].join("\n"),
  "V142_HUMO_VENV_DISTRIBUTED_LAUNCH"
);

for (const marker of [
  'LOCAL_VIDEO_HUMO_CERTIFIED_VENV_REQUIRED',
  'LOCAL_VIDEO_HUMO_CERTIFIED_VENV_INVALID',
  'runtime_python,',
  '"torch.distributed.run"',
  'import importlib.metadata,omegaconf,torch',
  'flash-attn',
  '2.6.3'
]) {
  if (!runner.includes(marker)) throw new Error(`V142_HUMO_VENV_MARKER_MISSING:${marker}`);
}
if (runner.includes('torchrun = _humo_executable(os.environ.get("JARVIS_HUMO_TORCHRUN", ""), "torchrun")')) {
  throw new Error("V142_HUMO_GLOBAL_TORCHRUN_REGRESSION");
}
write(LOCAL_VIDEO_RUNNER, runner);

let engine = read(LOCAL_VIDEO_ENGINE);
for (const marker of [
  "HF_HUB_DISABLE_XET=1",
  "--max-workers 1",
  "HUMO_ASSETS_HUMO",
  "HUMO_ASSETS_WAN21",
  "HUMO_ASSETS_WHISPER",
  "HUMO_ASSETS_VERIFY",
  WAN21_REVISION,
  "physicalRuntimeCertified: true",
  "paidExecutionAuthorized: false"
]) {
  if (!engine.includes(marker)) throw new Error(`V142_HUMO_EXISTING_CONTRACT_REGRESSION:${marker}`);
}
write(LOCAL_VIDEO_ENGINE, engine);

let tests = read(LOCAL_VIDEO_TEST);
const venvLaunchTest = [
  'test("V142 HuMo inference is bound to the certified venv Python instead of global torchrun", () => {',
  '    const runner = fs.readFileSync(new URL("../scripts/jarvis-local-video-wan22.py", import.meta.url), "utf8");',
  '    assert.equal(runner.includes("torchrun = _humo_executable(os.environ.get(\\\"JARVIS_HUMO_TORCHRUN\\\", \\\"\\\"), \\\"torchrun\\\")"), false);',
  '    assert.equal(runner.includes("LOCAL_VIDEO_HUMO_CERTIFIED_VENV_REQUIRED"), true);',
  '    assert.equal(runner.includes("LOCAL_VIDEO_HUMO_CERTIFIED_VENV_INVALID"), true);',
  '    assert.equal(runner.includes("runtime_python,"), true);',
  '    assert.equal(runner.includes("\\\"-m\\\""), true);',
  '    assert.equal(runner.includes("\\\"torch.distributed.run\\\""), true);',
  '    assert.equal(runner.includes("import importlib.metadata,omegaconf,torch"), true);',
  '    assert.equal(runner.includes("flash-attn"), true);',
  '    assert.equal(runner.includes("2.6.3"), true);',
  '});'
].join("\n");
tests = appendOnce(
  tests,
  "V142 HuMo inference is bound to the certified venv Python instead of global torchrun",
  venvLaunchTest
);
write(LOCAL_VIDEO_TEST, tests);

const bridge = read(FS_BRIDGE);
for (const marker of [
  "runHuMoIdentityProbeCli",
  "HUMO_IDENTITY_PROBE_FAILED_AND_RELEASED",
  "fullEpisodeAuthorized: false"
]) {
  if (!bridge.includes(marker)) throw new Error(`V142_HUMO_PROBE_BRIDGE_REGRESSION:${marker}`);
}

execFileSync(process.execPath, ["--check", LOCAL_VIDEO_ENGINE], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", FS_BRIDGE], { stdio: "inherit" });
const python = process.platform === "win32" ? "python" : "python3";
execFileSync(python, ["-c", `import ast,pathlib; ast.parse(pathlib.Path('${LOCAL_VIDEO_RUNNER}').read_text(encoding='utf-8'))`], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_CERTIFIED_VENV_INFERENCE_MATERIALIZED",
  productBaseCommit: PRODUCT_BASE_COMMIT,
  globalTorchrunAllowed: false,
  certifiedVenvPythonRequired: true,
  distributedLaunch: "python -m torch.distributed.run",
  requiredRuntimeImports: ["omegaconf", "torch", "flash-attn"],
  expectedTorch: "2.5.1",
  expectedTorchCuda: "12.4",
  expectedFlashAttention: "2.6.3",
  inferenceAuthorized: false,
  providerTrafficUsed: false,
  runpodTrafficUsed: false,
  billableGpuCreated: false,
  newFiles: false,
  newBrains: false
}));
