import fs from "node:fs";
import { execFileSync } from "node:child_process";

const PRODUCT_BASE_COMMIT = "20e627289205b08e679389432c8376bbf45799f2";
const LOCAL_VIDEO_ENGINE = "jarvis-local-video-engine.js";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";

const FLASH_ATTN_WHEEL_FILE = "flash_attn-2.6.3+cu124torch2.5-cp311-cp311-linux_x86_64.whl";
const FLASH_ATTN_WHEEL_URL = "https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.0.2/flash_attn-2.6.3%2Bcu124torch2.5-cp311-cp311-linux_x86_64.whl";
const FLASH_ATTN_WHEEL_BYTES = 182448642;
const FLASH_ATTN_WHEEL_SHA256 = "55f8853bc1947a82eea50109f641487adabc7978bf16afb0a9eb6addc6dc51d3";

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

function replaceFileExactCount(file, before, after, expectedCount, label) {
  const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== expectedCount) throw new Error(`${label}_MATCH_COUNT_${count}`);
  fs.writeFileSync(file, source.split(before).join(after), "utf8");
}

function appendFileOnce(file, marker, addition) {
  const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (source.includes(marker)) return;
  fs.writeFileSync(file, `${source.trimEnd()}\n\n${addition.trim()}\n`, "utf8");
}

replaceFileExactOnce(
  LOCAL_VIDEO_ENGINE,
  [
    '            "progress HUMO_FLASH_ATTENTION RUNNING",',
    '            "MAX_JOBS=4 \\\"$VENV/bin/python\\\" -m pip install flash_attn==2.6.3 --no-build-isolation &",',
    '            "FLASH_ATTN_PID=$!",',
    '            "while kill -0 \\\"$FLASH_ATTN_PID\\\" 2>/dev/null; do progress HUMO_FLASH_ATTENTION RUNNING; sleep 20; done",',
    '            "wait \\\"$FLASH_ATTN_PID\\\"",',
    '            "\\\"$VENV/bin/python\\\" -c \\\"import importlib.metadata; assert importlib.metadata.version(\'flash-attn\') == \'2.6.3\'\\\"",',
    '            "progress HUMO_FLASH_ATTENTION READY",'
  ].join("\n"),
  [
    '            "progress HUMO_FLASH_ATTENTION RUNNING",',
    `            "FLASH_ATTN_WHEEL=/tmp/${FLASH_ATTN_WHEEL_FILE}",`,
    `            "curl --fail --location --retry 2 --output \\\"$FLASH_ATTN_WHEEL\\\" ${FLASH_ATTN_WHEEL_URL}",`,
    `            "test \\\"$(stat -c%s \\\"$FLASH_ATTN_WHEEL\\\")\\\" = \\\"${FLASH_ATTN_WHEEL_BYTES}\\\"",`,
    `            "printf '%s  %s\\\\n' '${FLASH_ATTN_WHEEL_SHA256}' \\\"$FLASH_ATTN_WHEEL\\\" | sha256sum -c -",`,
    '            "\\\"$VENV/bin/python\\\" -m pip install --no-deps \\\"$FLASH_ATTN_WHEEL\\\"",',
    '            "rm -f \\\"$FLASH_ATTN_WHEEL\\\"",',
    '            "\\\"$VENV/bin/python\\\" -c \\\"import importlib.metadata; assert importlib.metadata.version(\'flash-attn\') == \'2.6.3\'\\\"",',
    '            "progress HUMO_FLASH_ATTENTION READY",'
  ].join("\n"),
  "V142_HUMO_FLASH_ATTN_PINNED_WHEEL"
);

replaceFileExactOnce(
  LOCAL_VIDEO_ENGINE,
  [
    '            "payload={\'ok\':False,\'pythonVersion\':platform.python_version(),\'torchVersion\':str(torch.__version__),\'torchCudaVersion\':str(torch.version.cuda or \'\'),\'cuda\':torch.cuda.is_available(),\'gpuName\':torch.cuda.get_device_name(0) if torch.cuda.is_available() else \'\',\'computeCapability\':\'.\'.join(map(str,torch.cuda.get_device_capability(0))) if torch.cuda.is_available() else \'\',\'flashAttentionVersion\':importlib.metadata.version(\'flash-attn\'),\'pipCheck\':subprocess.run([sys.executable,\'-m\',\'pip\',\'check\'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0,\'sourceRevision\':subprocess.check_output([\'git\',\'-C\',repo,\'rev-parse\',\'HEAD\'],text=True).strip(),\'checkedAt\':datetime.datetime.now(datetime.timezone.utc).isoformat().replace(\'+00:00\',\'Z\')}",',
    `            \`payload['ok']=payload['pythonVersion'].startswith('\${authority.remoteRuntimeBase.bootstrapPython}.') and payload['torchVersion'].startswith('\${authority.remoteRuntimeBase.bootstrapTorch}') and payload['torchCudaVersion'].startswith('\${authority.remoteRuntimeBase.bootstrapTorchCuda}') and payload['flashAttentionVersion']=='\${authority.remoteRuntimeBase.bootstrapFlashAttention}' and payload['cuda'] and payload['sourceRevision']=='\${authority.sourceRevision}' and payload['pipCheck']\`,`
  ].join("\n"),
  [
    '            "flash_probe=False; flash_error=\'\'",',
    '            "try:",',
    '            "    from flash_attn import flash_attn_func",',
    '            "    if torch.cuda.is_available():",',
    '            "        q=torch.randn((1,16,2,64),device=\'cuda\',dtype=torch.float16); out=flash_attn_func(q,q,q,causal=False); torch.cuda.synchronize(); flash_probe=tuple(out.shape)==tuple(q.shape)",',
    '            "except Exception as exc:",',
    '            "    flash_error=(type(exc).__name__+\': \'+str(exc))[:500]",',
    '            "payload={\'ok\':False,\'pythonVersion\':platform.python_version(),\'torchVersion\':str(torch.__version__),\'torchCudaVersion\':str(torch.version.cuda or \'\'),\'cuda\':torch.cuda.is_available(),\'gpuName\':torch.cuda.get_device_name(0) if torch.cuda.is_available() else \'\',\'computeCapability\':\'.\'.join(map(str,torch.cuda.get_device_capability(0))) if torch.cuda.is_available() else \'\',\'flashAttentionVersion\':importlib.metadata.version(\'flash-attn\'),\'flashAttentionCudaProbe\':flash_probe,\'flashAttentionCudaError\':flash_error,\'pipCheck\':subprocess.run([sys.executable,\'-m\',\'pip\',\'check\'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0,\'sourceRevision\':subprocess.check_output([\'git\',\'-C\',repo,\'rev-parse\',\'HEAD\'],text=True).strip(),\'checkedAt\':datetime.datetime.now(datetime.timezone.utc).isoformat().replace(\'+00:00\',\'Z\')}",',
    `            \`payload['ok']=payload['pythonVersion'].startswith('\${authority.remoteRuntimeBase.bootstrapPython}.') and payload['torchVersion'].startswith('\${authority.remoteRuntimeBase.bootstrapTorch}') and payload['torchCudaVersion'].startswith('\${authority.remoteRuntimeBase.bootstrapTorchCuda}') and payload['flashAttentionVersion']=='\${authority.remoteRuntimeBase.bootstrapFlashAttention}' and payload['flashAttentionCudaProbe'] and payload['cuda'] and payload['sourceRevision']=='\${authority.sourceRevision}' and payload['pipCheck']\`,`
  ].join("\n"),
  "V142_HUMO_FLASH_ATTN_CUDA_PREFLIGHT"
);

replaceFileExactCount(
  LOCAL_VIDEO_TEST,
  '    assert.equal(engineSource.includes("flash_attn==2.6.3 --no-build-isolation"), true);',
  [
    '    assert.equal(engineSource.includes("flash_attn==2.6.3 --no-build-isolation"), false);',
    `    assert.equal(engineSource.includes("${FLASH_ATTN_WHEEL_FILE}"), true);`,
    `    assert.equal(engineSource.includes("${FLASH_ATTN_WHEEL_SHA256}"), true);`
  ].join("\n"),
  2,
  "V142_HUMO_FLASH_ATTN_SOURCE_BUILD_TEST_RETIREMENT"
);

replaceFileExactOnce(
  LOCAL_VIDEO_TEST,
  [
    '    assert.equal(engineSource.includes("FLASH_ATTN_PID=$!"), true);',
    '    assert.equal(engineSource.includes("while kill -0"), true);',
    '    assert.equal(engineSource.includes("MAX_JOBS=4"), true);'
  ].join("\n"),
  [
    '    assert.equal(engineSource.includes("FLASH_ATTN_PID=$!"), false);',
    '    assert.equal(engineSource.includes("MAX_JOBS=4"), false);',
    `    assert.equal(engineSource.includes("${FLASH_ATTN_WHEEL_URL}"), true);`,
    `    assert.equal(engineSource.includes("${FLASH_ATTN_WHEEL_BYTES}"), true);`
  ].join("\n"),
  "V142_HUMO_FLASH_ATTN_WHEEL_TESTS"
);

appendFileOnce(
  LOCAL_VIDEO_TEST,
  "V142 HuMo FlashAttention wheel is SHA-pinned and must execute a real CUDA kernel",
  `test("V142 HuMo FlashAttention wheel is SHA-pinned and must execute a real CUDA kernel", () => {
    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");
    assert.equal(engineSource.includes("${FLASH_ATTN_WHEEL_FILE}"), true);
    assert.equal(engineSource.includes("${FLASH_ATTN_WHEEL_SHA256}"), true);
    assert.equal(engineSource.includes("sha256sum -c -"), true);
    assert.equal(engineSource.includes("pip install --no-deps"), true);
    assert.equal(engineSource.includes("flashAttentionCudaProbe"), true);
    assert.equal(engineSource.includes("from flash_attn import flash_attn_func"), true);
    assert.equal(engineSource.includes("torch.cuda.synchronize()"), true);
    assert.equal(engineSource.includes("and payload['flashAttentionCudaProbe']"), true);
});`
);

execFileSync(process.execPath, ["--check", LOCAL_VIDEO_ENGINE], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_FLASH_ATTN_PINNED_WHEEL_MATERIALIZED",
  productBaseCommit: PRODUCT_BASE_COMMIT,
  wheelRelease: "v0.0.2",
  wheelFile: FLASH_ATTN_WHEEL_FILE,
  wheelBytes: FLASH_ATTN_WHEEL_BYTES,
  wheelSha256: FLASH_ATTN_WHEEL_SHA256,
  sourceBuildRetired: true,
  cudaKernelProbeRequired: true,
  providerTrafficUsed: false,
  runpodTrafficUsed: false,
  billableGpuCreated: false,
  runtimeCertificationOnly: true,
  inferenceAuthorized: false,
  newFiles: false,
  newBrains: false
}));
