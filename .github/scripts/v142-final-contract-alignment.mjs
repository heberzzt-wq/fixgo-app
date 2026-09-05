import fs from "node:fs";
import { execFileSync } from "node:child_process";

const PRODUCT_BASE_COMMIT = "21c76cd2dd72e133e1ae98264b4398bb709f02ac";
const LOCAL_VIDEO_ENGINE = "jarvis-local-video-engine.js";
const LOCAL_VIDEO_RUNNER = "scripts/jarvis-local-video-wan22.py";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";
const FS_BRIDGE = "jarvis-fs-bridge.js";

const OLD_HUMO_IMAGE = "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04";
const OLD_HUMO_TAG = "2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04";
const OLD_HUMO_DIGEST = "sha256:61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5";
const NEW_HUMO_IMAGE = "runpod/pytorch:0.7.1-dev-ubuntu2204-cu1251-torch251";
const NEW_HUMO_TAG = "0.7.1-dev-ubuntu2204-cu1251-torch251";
const NEW_HUMO_DIGEST = "sha256:ccdc2fe736e83eba1b88cbef27f516458e66a9eac857862f601cf42462f822b2";
const OLD_HUMO_DIGEST_HEX = OLD_HUMO_DIGEST.slice("sha256:".length);
const NEW_HUMO_DIGEST_HEX = NEW_HUMO_DIGEST.slice("sha256:".length);

function read(file) { return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"); }
function write(file, source) { fs.writeFileSync(file, source, "utf8"); }
function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}
function replaceExpectedCount(source, before, after, expected, label) {
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes(after)) return source;
  if (count !== expected) throw new Error(`${label}_MATCH_COUNT_${count}_EXPECTED_${expected}`);
  return source.split(before).join(after);
}
function appendOnce(source, marker, addition) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

let runner = read(LOCAL_VIDEO_RUNNER);
runner = replaceExactOnce(runner, [
  "    command = [", "        runtime_python,", "        \"-m\",", "        \"torch.distributed.run\",",
  "        \"--standalone\",", "        \"--nnodes=1\",", "        \"--nproc_per_node=1\","].join("\n"), [
  "    command = [", "        runtime_python,", "        \"-m\",", "        \"torch.distributed.run\",",
  "        \"--node_rank=0\",", "        \"--nproc_per_node=1\",", "        \"--nnodes=1\",",
  "        \"--rdzv_endpoint=127.0.0.1:12345\",", "        \"--rdzv_conf=timeout=900,join_timeout=900,read_timeout=900\","
].join("\n"), "V142_HUMO_UPSTREAM_SINGLE_GPU_LAUNCH");
runner = replaceExactOnce(runner, [
  "    completed = subprocess.run(", "        command,", "        cwd=humo_root,", "        env=offline_environment(),"
].join("\n"), [
  "    inference_env = offline_environment()", "    inference_env[\"CUDA_VISIBLE_DEVICES\"] = \"0\"",
  "    inference_env[\"PYTHONFAULTHANDLER\"] = \"1\"", "    inference_env[\"TORCH_DISTRIBUTED_DEBUG\"] = \"DETAIL\"",
  "    completed = subprocess.run(", "        command,", "        cwd=humo_root,", "        env=inference_env,"
].join("\n"), "V142_HUMO_UPSTREAM_SINGLE_GPU_ENV");
runner = replaceExactOnce(runner, [
  "    if completed.returncode != 0:", "        diagnostic = str(completed.stderr or completed.stdout or \"\")[-2000:]",
  "        raise RuntimeError(f\"LOCAL_VIDEO_HUMO_EXIT_{completed.returncode}:{diagnostic}\")"
].join("\n"), [
  "    if completed.returncode != 0:", "        stderr_text = str(completed.stderr or \"\")", "        stdout_text = str(completed.stdout or \"\")",
  "        markers = (", "            \"Error\", \"Exception\", \"Traceback\", \"RuntimeError\", \"ValueError\",",
  "            \"AssertionError\", \"ModuleNotFoundError\", \"FileNotFoundError\",", "            \"KeyError\", \"OSError\", \"CUDA\", \"out of memory\", \"FAILED\"", "        )",
  "        root_lines = []", "        for line in (stderr_text + \"\\n\" + stdout_text).splitlines():", "            if any(marker in line for marker in markers):", "                root_lines.append(line)",
  "        root_summary = \"\\n\".join(root_lines[:40])[-6000:]", "        diagnostic = \"\\n\".join([", "            \"ROOT_LINES:\\n\" + root_summary,",
  "            \"STDERR_HEAD:\\n\" + stderr_text[:6000],", "            \"STDERR_TAIL:\\n\" + stderr_text[-6000:],", "            \"STDOUT_HEAD:\\n\" + stdout_text[:3000],",
  "            \"STDOUT_TAIL:\\n\" + stdout_text[-3000:],", "        ])[-22000:]", "        raise RuntimeError(f\"LOCAL_VIDEO_HUMO_EXIT_{completed.returncode}:{diagnostic}\")"
].join("\n"), "V142_HUMO_INNER_ERROR_DIAGNOSTICS");
for (const marker of ['"--node_rank=0"','"--rdzv_endpoint=127.0.0.1:12345"','"--rdzv_conf=timeout=900,join_timeout=900,read_timeout=900"',"ROOT_LINES:","STDERR_HEAD:","STDERR_TAIL:","STDOUT_HEAD:","STDOUT_TAIL:","LOCAL_VIDEO_HUMO_CERTIFIED_VENV_REQUIRED",'"torch.distributed.run"']) {
  if (!runner.includes(marker)) throw new Error(`V142_HUMO_LAUNCH_MARKER_MISSING:${marker}`);
}
if (runner.includes('"--standalone"')) throw new Error("V142_HUMO_STANDALONE_LAUNCH_REGRESSION");
write(LOCAL_VIDEO_RUNNER, runner);

let engine = read(LOCAL_VIDEO_ENGINE);
engine = replaceExactOnce(engine, [
  `        tag: "${OLD_HUMO_TAG}",`, `        provisionImageTag: "${OLD_HUMO_IMAGE}",`, `        expectedRegistryDigest: "${OLD_HUMO_DIGEST}",`,
  '        basePython: "3.11",','        baseTorch: "2.4.1",','        baseCuda: "12.4.1",'
].join("\n"), [
  `        tag: "${NEW_HUMO_TAG}",`, `        provisionImageTag: "${NEW_HUMO_IMAGE}",`, `        expectedRegistryDigest: "${NEW_HUMO_DIGEST}",`,
  '        basePython: "3.11",','        baseTorch: "2.5.1",','        baseCuda: "12.5.1",'
].join("\n"), "V142_HUMO_PREINSTALLED_RUNPOD_IMAGE");
engine = replaceExactOnce(engine, ['        bootstrapFlashAttention: "2.6.3",','        runtimePreflightCertified: true'].join("\n"), ['        bootstrapFlashAttention: "2.6.3",','        runtimePreflightCertified: false'].join("\n"), "V142_HUMO_NEW_IMAGE_REQUIRES_RUNTIME_RECERTIFICATION");
engine = replaceExactOnce(engine, [
  '    physicalRuntimeCertified: true,','    physicalRuntimeCertification: Object.freeze({','        status: "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED",',
  '        canonicalSha: "e9e96fc7cc622ff9092eb2926c5af047fca1c7ea",','        operationName: "local-video/0c1a1082-dce4-40c4-993d-053255859fc6",','        podId: "0qildg0t1wyosk",',
  '        runtimeCertificationOnly: true,','        physicalRuntimeCertified: true,','        inferenceStarted: false,','        terminationVerified: true,','        gpuRentalSeconds: 872.338,','        gpuRentalEstimatedCostUsd: 0.2641245611111111','    }),'
].join("\n"), ['    physicalRuntimeCertified: false,','    physicalRuntimeCertification: null,'].join("\n"), "V142_HUMO_STALE_PHYSICAL_CERTIFICATION_INVALIDATED");
engine = replaceExactOnce(engine, [
  '            "progress HUMO_VENV RUNNING",',
  '            "test -x \\"$VENV/bin/python\\" || python3 -m venv \\"$VENV\\"",',
  '            "\\"$VENV/bin/python\\" -m pip install --upgrade pip setuptools wheel packaging ninja \'huggingface_hub[cli]>=0.30,<1\'",'
].join("\n"), [
  '            "progress HUMO_VENV RUNNING",',
  '            "test -x \\"$VENV/bin/python\\" || python3 -m venv --system-site-packages \\"$VENV\\"",',
  '            "\\"$VENV/bin/python\\" -m pip install --upgrade pip setuptools wheel packaging ninja \'huggingface_hub[cli]>=0.30,<1\'",'
].join("\n"), "V142_HUMO_SYSTEM_SITE_PACKAGES_VENV");
engine = replaceExactOnce(engine, '"\\"$VENV/bin/python\\" -m pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124",', '"\\"$VENV/bin/python\\" -c \\"import importlib.metadata; assert importlib.metadata.version(\'torch\').startswith(\'2.5.1\'); assert importlib.metadata.version(\'torchvision\').startswith(\'0.20.1\'); assert importlib.metadata.version(\'torchaudio\').startswith(\'2.5.1\')\\"",', "V142_HUMO_NO_PAID_TORCH_INSTALL");
engine = replaceExactOnce(engine, [
  '        if (cost.estimatedCostUsd >= state.hardBudgetUsd * budgetStopRatio) {','            await writeLocalFailure(operation, resultFile, "RUNPOD_HARD_BUDGET_EXCEEDED", false);',
  '            state = writeState(loaded.file, state, { phase: "BUDGET_EXCEEDED" });','            return { ok: false, done: true, status: "RUNPOD_HARD_BUDGET_EXCEEDED", remoteWorker: runpodPublicWorker(state) };','        }'
].join("\n"), [
  '        if (cost.estimatedCostUsd >= state.hardBudgetUsd * budgetStopRatio) {','            const bootstrapDiagnostics = state.phase === "BOOTSTRAPPING"','                ? await captureBootstrapFailureDiagnostics(state)','                : null;',
  '            await writeLocalFailure(operation, resultFile, "RUNPOD_HARD_BUDGET_EXCEEDED", false);','            state = writeState(loaded.file, state, { phase: "BUDGET_EXCEEDED", bootstrapDiagnostics });','            return { ok: false, done: true, status: "RUNPOD_HARD_BUDGET_EXCEEDED", remoteWorker: runpodPublicWorker(state) };','        }'
].join("\n"), "V142_HUMO_BUDGET_DIAGNOSTICS_BEFORE_RELEASE");

const registryResolverStart = engine.indexOf("    async function resolveRegistryVerification(imageProfile) {");
const registryResolverEnd = engine.indexOf("\n    function assertPaidResourceCreationAuthority()", registryResolverStart);
if (registryResolverStart < 0 || registryResolverEnd <= registryResolverStart) {
  throw new Error("V142_REGISTRY_RESOLVER_SCOPE_MISSING");
}
const registryResolver = [
  "    async function resolveRegistryVerification(imageProfile) {",
  "        if (imageProfile.registry !== \"registry-1.docker.io\") {",
  "            throw new Error(\"RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE\");",
  "        }",
  "        const requestRegistry = async (url, options) => {",
  "            let response = null;",
  "            for (let attempt = 0; attempt < 3; attempt += 1) {",
  "                try { response = await registryFetchImpl(url, options); }",
  "                catch(error) { if (attempt >= 2) throw error; continue; }",
  "                const status = Number(response?.status || 0);",
  "                if (status === 200) return response;",
  "                const retryable = status === 408 || status === 429 || status >= 500;",
  "                if (!retryable || attempt >= 2) return response;",
  "            }",
  "            return response;",
  "        };",
  "        try {",
  "            const scope = encodeURIComponent(`repository:${imageProfile.repository}:pull`);",
  "            const tokenResponse = await requestRegistry(",
  "                `https://auth.docker.io/token?service=registry.docker.io&scope=${scope}`,",
  "                { method: \"GET\", headers: { Accept: \"application/json\" } }",
  "            );",
  "            if (Number(tokenResponse?.status || 0) !== 200 || typeof tokenResponse.text !== \"function\") {",
  "                throw new Error(\"RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE\");",
  "            }",
  "            const tokenPayload = JSON.parse(await tokenResponse.text());",
  "            const token = String(tokenPayload?.token || tokenPayload?.access_token || \"\");",
  "            if (!token) throw new Error(\"RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE\");",
  "            const acceptIndex = [",
  "                \"application/vnd.oci.image.index.v1+json\",",
  "                \"application/vnd.docker.distribution.manifest.list.v2+json\",",
  "                \"application/vnd.oci.image.manifest.v1+json\",",
  "                \"application/vnd.docker.distribution.manifest.v2+json\"",
  "            ].join(\", \" );",
  "            const manifestUrl = `https://${imageProfile.registry}/v2/${imageProfile.repository}/manifests/${encodeURIComponent(imageProfile.tag)}`;",
  "            const manifestResponse = await requestRegistry(manifestUrl, {",
  "                method: \"GET\",",
  "                headers: { Authorization: `Bearer ${token}`, Accept: acceptIndex }",
  "            });",
  "            if (Number(manifestResponse?.status || 0) !== 200 || typeof manifestResponse.text !== \"function\") {",
  "                throw new Error(\"RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE\");",
  "            }",
  "            const indexDigest = String(manifestResponse?.headers?.get?.(\"docker-content-digest\") || \"\").trim().toLowerCase();",
  "            const rawManifest = await manifestResponse.text();",
  "            let manifestPayload = null;",
  "            if (rawManifest) {",
  "                try { manifestPayload = JSON.parse(rawManifest); }",
  "                catch { throw new Error(\"RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE\"); }",
  "            }",
  "            let observedDigest = indexDigest;",
  "            let platform = null;",
  "            if (Array.isArray(manifestPayload?.manifests)) {",
  "                const descriptor = manifestPayload.manifests.find(item =>",
  "                    String(item?.platform?.os || \"\").toLowerCase() === \"linux\" &&",
  "                    String(item?.platform?.architecture || \"\").toLowerCase() === \"amd64\"",
  "                );",
  "                observedDigest = String(descriptor?.digest || \"\").trim().toLowerCase();",
  "                if (!/^sha256:[a-f0-9]{64}$/i.test(observedDigest)) {",
  "                    throw new Error(\"RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE\");",
  "                }",
  "                platform = { os: \"linux\", architecture: \"amd64\" };",
  "                const childResponse = await requestRegistry(",
  "                    `https://${imageProfile.registry}/v2/${imageProfile.repository}/manifests/${encodeURIComponent(observedDigest)}`,",
  "                    {",
  "                        method: \"GET\",",
  "                        headers: {",
  "                            Authorization: `Bearer ${token}`,",
  "                            Accept: [",
  "                                \"application/vnd.oci.image.manifest.v1+json\",",
  "                                \"application/vnd.docker.distribution.manifest.v2+json\"",
  "                            ].join(\", \" )",
  "                        }",
  "                    }",
  "                );",
  "                if (Number(childResponse?.status || 0) !== 200) {",
  "                    throw new Error(\"RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE\");",
  "                }",
  "                const childDigest = String(childResponse?.headers?.get?.(\"docker-content-digest\") || \"\").trim().toLowerCase();",
  "                if (childDigest && childDigest !== observedDigest) {",
  "                    throw new Error(\"RUNPOD_REGISTRY_DIGEST_MISMATCH\");",
  "                }",
  "            }",
  "            if (!/^sha256:[a-f0-9]{64}$/i.test(observedDigest)) {",
  "                throw new Error(\"RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE\");",
  "            }",
  "            const verified = normalizedRegistryVerification(imageProfile, {",
  "                registry: imageProfile.registry,",
  "                repository: imageProfile.repository,",
  "                tag: imageProfile.tag,",
  "                expectedDigest: imageProfile.expectedRegistryDigest,",
  "                observedDigest,",
  "                checkedAt: now().toISOString(),",
  "                status: \"REGISTRY_DIGEST_VERIFIED\"",
  "            });",
  "            return { ...verified, indexDigest: indexDigest || null, platform };",
  "        }",
  "        catch(error) {",
  "            if (error?.message === \"RUNPOD_REGISTRY_DIGEST_MISMATCH\") throw error;",
  "            throw new Error(\"RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE\");",
  "        }",
  "    }",
].join("\n");
engine = engine.slice(0, registryResolverStart) + registryResolver + engine.slice(registryResolverEnd);

for (const marker of [NEW_HUMO_IMAGE,NEW_HUMO_DIGEST,'runtimePreflightCertified: false','physicalRuntimeCertified: false','physicalRuntimeCertification: null',"importlib.metadata.version('torch').startswith('2.5.1')",'bootstrapDiagnostics = state.phase === "BOOTSTRAPPING"','await captureBootstrapFailureDiagnostics(state)','platform?.architecture','method: "GET"']) {
  if (!engine.includes(marker)) throw new Error(`V142_HUMO_PREINSTALLED_RUNTIME_MISSING:${marker}`);
}
const humoVenvStageStart = engine.indexOf('"progress HUMO_VENV RUNNING"');
const humoFlashStageStart = engine.indexOf('"progress HUMO_FLASH_ATTENTION RUNNING"', humoVenvStageStart);
if (humoVenvStageStart < 0 || humoFlashStageStart <= humoVenvStageStart) throw new Error("V142_HUMO_RUNTIME_STAGE_SCOPE_MISSING");
const humoPreFlashBlock = engine.slice(humoVenvStageStart, humoFlashStageStart);
if (!humoPreFlashBlock.includes('python3 -m venv --system-site-packages')) throw new Error("V142_HUMO_VENV_DOES_NOT_INHERIT_PREINSTALLED_TORCH");
if (humoPreFlashBlock.includes('pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1')) throw new Error("V142_HUMO_PAID_TORCH_INSTALL_REGRESSION");
if (!humoPreFlashBlock.includes("importlib.metadata.version('torch').startswith('2.5.1')")) throw new Error("V142_HUMO_PREINSTALLED_TORCH_VERIFICATION_MISSING");
write(LOCAL_VIDEO_ENGINE, engine);
for (const marker of ["persistentVolumeDisabled = isHuMoRemoteJob(job)","persistentVolumeDisabled ? 0 : volumeInGb","RUNPOD_HUMO_PERSISTENT_STORAGE_FORBIDDEN","HF_HUB_DISABLE_XET=1","HUMO_ASSETS_HUMO","HUMO_ASSETS_WAN21","HUMO_ASSETS_WHISPER","paidExecutionAuthorized: false"]) if (!engine.includes(marker)) throw new Error(`V142_HUMO_EXISTING_CONTRACT_REGRESSION:${marker}`);
const bridge = read(FS_BRIDGE);
for (const marker of ['JARVIS_RUNPOD_CONTAINER_DISK_GB: "60"','JARVIS_RUNPOD_VOLUME_DISK_GB: "0"',"delete runtimeEnv.JARVIS_RUNPOD_NETWORK_VOLUME_ID","HUMO_IDENTITY_PROBE_FAILED_AND_RELEASED"]) if (!bridge.includes(marker)) throw new Error(`V142_HUMO_PROBE_BRIDGE_REGRESSION:${marker}`);

let tests = read(LOCAL_VIDEO_TEST);
tests = tests.split(OLD_HUMO_IMAGE).join(NEW_HUMO_IMAGE).split(OLD_HUMO_TAG).join(NEW_HUMO_TAG).split(OLD_HUMO_DIGEST).join(NEW_HUMO_DIGEST);
tests = tests.split(OLD_HUMO_DIGEST_HEX).join(NEW_HUMO_DIGEST_HEX);
if (tests.includes(OLD_HUMO_TAG) || tests.includes(OLD_HUMO_DIGEST) || tests.includes(OLD_HUMO_DIGEST_HEX)) throw new Error("V142_TEST_STALE_HUMO_IMAGE_AUTHORITY");
tests = replaceExpectedCount(tests,'assert.equal(candidate.includes("runtimePreflightCertified: true"), true);','assert.equal(candidate.includes("runtimePreflightCertified: false"), true);',1,"V142_TEST_RUNTIME_CERT_STATE");
tests = replaceExpectedCount(tests,'assert.equal(candidate.includes("physicalRuntimeCertified: true"), true);','assert.equal(candidate.includes("physicalRuntimeCertified: false"), true);\n    assert.equal(candidate.includes("physicalRuntimeCertification: null"), true);',1,"V142_TEST_PHYSICAL_CERT_STATE");
tests = tests.split('assert.equal(report.contract.runtimePreflightCertified, true);').join('assert.equal(report.contract.runtimePreflightCertified, false);');
tests = tests.split('assert.equal(report.physicalRuntimeCertified, true);').join('assert.equal(report.physicalRuntimeCertified, false);');
tests = tests.split('assert.match(candidate, /runtimePreflightCertified: true/);').join('assert.match(candidate, /runtimePreflightCertified: false/);');
tests = tests.split('assert.match(candidate, /physicalRuntimeCertified: true/);').join('assert.match(candidate, /physicalRuntimeCertified: false/);');
tests = tests.split('assert.equal(closed.physicalRuntimeCertified, true);').join('assert.equal(closed.physicalRuntimeCertified, false);');
tests = tests.split('assert.equal(scoped.physicalRuntimeCertified, true);').join('assert.equal(scoped.physicalRuntimeCertified, false);');
tests = tests.split('test("V142 HuMo physical runtime certification is durable while paid inference stays closed", () => {').join('test("V142 HuMo stale physical runtime certification is invalidated for the preinstalled image", () => {');
for (const staleReceiptAssertion of [
  'assert.match(candidate, /canonicalSha: "e9e96fc7cc622ff9092eb2926c5af047fca1c7ea"/);',
  'assert.match(candidate, /operationName: "local-video\\/0c1a1082-dce4-40c4-993d-053255859fc6"/);',
  'assert.match(candidate, /podId: "0qildg0t1wyosk"/);',
  'assert.match(candidate, /runtimeCertificationOnly: true/);',
  'assert.match(candidate, /inferenceStarted: false/);',
  'assert.match(candidate, /terminationVerified: true/);'
]) {
  tests = tests.split(staleReceiptAssertion).join(staleReceiptAssertion.replace('assert.match', 'assert.doesNotMatch'));
}
tests = tests.split('    assert.doesNotMatch(candidate, /terminationVerified: true/);\n    assert.match(candidate, /paidExecutionAuthorized: false/);').join('    assert.doesNotMatch(candidate, /terminationVerified: true/);\n    assert.match(candidate, /physicalRuntimeCertification: null/);\n    assert.match(candidate, /paidExecutionAuthorized: false/);');
tests = tests.split(['        assert.deepEqual(report.executionBlockers, [','            "RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED"','        ]);'].join("\n")).join(['        assert.deepEqual(report.executionBlockers, [','            "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED",','            "RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED"','        ]);'].join("\n"));
tests = replaceExactOnce(tests,['        baseHealthOverrides: {','            operatingSystem: "ubuntu-22.04",','            pythonVersion: "3.11.9",','            torchVersion: "2.4.1+cu124",','            torchCudaVersion: "12.4",','            cudaImageVersion: "12.4.1",'].join("\n"),['        baseHealthOverrides: {','            operatingSystem: "ubuntu-22.04",','            pythonVersion: "3.11.9",','            torchVersion: "2.5.1+cu124",','            torchCudaVersion: "12.4",','            cudaImageVersion: "12.5.1",'].join("\n"),"V142_TEST_PREINSTALLED_BASE_HEALTH");
tests = replaceExactOnce(tests,['        runtimeHealthOverrides: {','            operatingSystem: "ubuntu-22.04",','            pythonVersion: "3.11.9",','            torchVersion: "2.5.1+cu124",','            torchCudaVersion: "12.4",','            cudaImageVersion: "12.4.1",'].join("\n"),['        runtimeHealthOverrides: {','            operatingSystem: "ubuntu-22.04",','            pythonVersion: "3.11.9",','            torchVersion: "2.5.1+cu124",','            torchCudaVersion: "12.4",','            cudaImageVersion: "12.5.1",'].join("\n"),"V142_TEST_PREINSTALLED_RUNTIME_HEALTH");
tests = replaceExpectedCount(tests,'test("V142 HuMo physical base runtime authority matches observed RunPod L40S torch 2.4.1", () => {\n    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    assert.equal(engineSource.includes(\'baseTorch: "2.4.1"\'), true);\n    assert.equal(engineSource.includes(\'baseTorch: "2.4.0"\'), false);\n});','test("V142 HuMo preinstalled base runtime requires fresh physical certification", () => {\n    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    assert.equal(engineSource.includes(\'baseTorch: "2.5.1"\'), true);\n    assert.equal(engineSource.includes(\'baseCuda: "12.5.1"\'), true);\n    assert.equal(engineSource.includes(\'physicalRuntimeCertified: false\'), true);\n    assert.equal(engineSource.includes(\'physicalRuntimeCertification: null\'), true);\n});',1,"V142_TEST_PREINSTALLED_BASE_AUTHORITY");

const oldRegistryMock = [
'        if (String(url).startsWith("https://registry-1.docker.io/v2/")) {',
'            if (scenario === "registry-unverifiable") return mockHttpResponse(503, { error: "controlled" });',
'            const expectedDigest = String(url).includes("/library/ubuntu/")',
'                ? RUNPOD_CPU_STAGING_PROFILE.expectedRegistryDigest',
'                : String(url).includes("0.7.1-dev-ubuntu2204-cu1251-torch251")',
'                    ? "sha256:ccdc2fe736e83eba1b88cbef27f516458e66a9eac857862f601cf42462f822b2"',
'                    : gpuImageProfile.expectedRegistryDigest;',
'            return mockHttpResponse(200, null, {',
'                "content-type": "application/vnd.oci.image.index.v1+json",',
'                "docker-content-digest": scenario === "registry-digest-mismatch"',
'                    ? `sha256:${"f".repeat(64)}`',
'                    : expectedDigest',
'            });',
'        }'
].join("\n");
const newRegistryMock = [
'        if (String(url).startsWith("https://registry-1.docker.io/v2/")) {',
'            if (scenario === "registry-unverifiable") return mockHttpResponse(503, { error: "controlled" });',
'            const expectedDigest = String(url).includes("/library/ubuntu/")',
'                ? RUNPOD_CPU_STAGING_PROFILE.expectedRegistryDigest',
'                : String(url).includes("0.7.1-dev-ubuntu2204-cu1251-torch251")',
'                    ? "sha256:ccdc2fe736e83eba1b88cbef27f516458e66a9eac857862f601cf42462f822b2"',
'                    : gpuImageProfile.expectedRegistryDigest;',
'            if (scenario === "registry-multiarch-platform-digest") {',
'                if (String(url).includes(encodeURIComponent(expectedDigest))) {',
'                    return mockHttpResponse(200, { schemaVersion: 2 }, {',
'                        "content-type": "application/vnd.oci.image.manifest.v1+json",',
'                        "docker-content-digest": expectedDigest',
'                    });',
'                }',
'                return mockHttpResponse(200, {',
'                    mediaType: "application/vnd.oci.image.index.v1+json",',
'                    manifests: [',
'                        { digest: expectedDigest, platform: { os: "linux", architecture: "amd64" } },',
'                        { digest: `sha256:${"a".repeat(64)}`, platform: { os: "linux", architecture: "arm64" } }',
'                    ]',
'                }, {',
'                    "content-type": "application/vnd.oci.image.index.v1+json",',
'                    "docker-content-digest": `sha256:${"5".repeat(64)}`',
'                });',
'            }',
'            return mockHttpResponse(200, null, {',
'                "content-type": "application/vnd.oci.image.index.v1+json",',
'                "docker-content-digest": scenario === "registry-digest-mismatch"',
'                    ? `sha256:${"f".repeat(64)}`',
'                    : expectedDigest',
'            });',
'        }'
].join("\n");
tests = replaceExactOnce(tests, oldRegistryMock, newRegistryMock, "V142_TEST_REGISTRY_MULTIARCH_FIXTURE");

const launchTest = ['test("V142 HuMo single GPU inference follows upstream rendezvous contract and preserves child errors", () => {','    const runner = fs.readFileSync(new URL("../scripts/jarvis-local-video-wan22.py", import.meta.url), "utf8");','    assert.equal(runner.includes("\\\"--standalone\\\""), false);','    assert.equal(runner.includes("\\\"--node_rank=0\\\""), true);','    assert.equal(runner.includes("\\\"--rdzv_endpoint=127.0.0.1:12345\\\""), true);','    assert.equal(runner.includes("\\\"--rdzv_conf=timeout=900,join_timeout=900,read_timeout=900\\\""), true);','    assert.equal(runner.includes("ROOT_LINES:"), true);','    assert.equal(runner.includes("STDERR_HEAD:"), true);','    assert.equal(runner.includes("STDERR_TAIL:"), true);','    assert.equal(runner.includes("STDOUT_HEAD:"), true);','    assert.equal(runner.includes("STDOUT_TAIL:"), true);','});'].join("\n");
tests = appendOnce(tests,"V142 HuMo single GPU inference follows upstream rendezvous contract and preserves child errors",launchTest);
const runtimeBootstrapTestLegacy = ['test("V142 HuMo paid bootstrap reuses preinstalled Torch and invalidates stale physical certification", () => {','    const engine = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");',`    assert.equal(engine.includes("${NEW_HUMO_IMAGE}"), true);`,`    assert.equal(engine.includes("${NEW_HUMO_DIGEST}"), true);`,'    assert.equal(engine.includes("python3 -m venv --system-site-packages"), true);','    assert.equal(engine.includes("pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1"), false);','    assert.equal(engine.includes("runtimePreflightCertified: false"), true);','    assert.equal(engine.includes("physicalRuntimeCertified: false"), true);','    assert.equal(engine.includes("physicalRuntimeCertification: null"), true);','    assert.equal(engine.includes("bootstrapDiagnostics = state.phase === \\\"BOOTSTRAPPING\\\""), true);','    assert.equal(engine.includes("await captureBootstrapFailureDiagnostics(state)"), true);','});'].join("\n");
const runtimeBootstrapTest = ['test("V142 HuMo paid bootstrap reuses preinstalled Torch and invalidates stale physical certification", () => {','    const engine = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");',`    assert.equal(engine.includes("${NEW_HUMO_IMAGE}"), true);`,`    assert.equal(engine.includes("${NEW_HUMO_DIGEST}"), true);`,'    const humoVenvStart = engine.indexOf(\'"progress HUMO_VENV RUNNING"\');','    const humoFlashStart = engine.indexOf(\'"progress HUMO_FLASH_ATTENTION RUNNING"\', humoVenvStart);','    assert.ok(humoVenvStart >= 0 && humoFlashStart > humoVenvStart);','    const humoPreFlash = engine.slice(humoVenvStart, humoFlashStart);','    assert.equal(humoPreFlash.includes("python3 -m venv --system-site-packages"), true);','    assert.equal(humoPreFlash.includes("pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1"), false);','    assert.equal(humoPreFlash.includes("importlib.metadata.version(\'torch\').startswith(\'2.5.1\')"), true);','    assert.equal(engine.includes("runtimePreflightCertified: false"), true);','    assert.equal(engine.includes("physicalRuntimeCertified: false"), true);','    assert.equal(engine.includes("physicalRuntimeCertification: null"), true);','    assert.equal(engine.includes("bootstrapDiagnostics = state.phase === \\\"BOOTSTRAPPING\\\""), true);','    assert.equal(engine.includes("await captureBootstrapFailureDiagnostics(state)"), true);','});'].join("\n");
if (tests.includes(runtimeBootstrapTestLegacy)) tests = tests.replace(runtimeBootstrapTestLegacy, runtimeBootstrapTest);
tests = appendOnce(tests,"V142 HuMo paid bootstrap reuses preinstalled Torch and invalidates stale physical certification",runtimeBootstrapTest);

const registryPlatformDigestTest = ['test("V142 registry verifier resolves OCI index to linux amd64 digest before paid provisioning", async () => {','    const harness = runpodPhysicalHarness({ scenario: "registry-multiarch-platform-digest" });','    const started = await harness.engine.start(harness.payload);','    assert.equal(started.ok, true, JSON.stringify(started));','    assert.ok(harness.createdBody);','    const registryCalls = harness.calls.filter(call => call.kind === "http" && call.url.includes("registry-1.docker.io/v2/"));','    assert.ok(registryCalls.length >= 2);','    assert.equal(registryCalls.some(call => call.method === "HEAD"), false);','    assert.equal(registryCalls.every(call => call.method === "GET"), true);','});'].join("\n");
tests = appendOnce(tests,"V142 registry verifier resolves OCI index to linux amd64 digest before paid provisioning",registryPlatformDigestTest);
write(LOCAL_VIDEO_TEST, tests);

execFileSync(process.execPath, ["--check", LOCAL_VIDEO_ENGINE], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", FS_BRIDGE], { stdio: "inherit" });
const python = process.platform === "win32" ? "python" : "python3";
execFileSync(python, ["-c", `import ast,pathlib; ast.parse(pathlib.Path('${LOCAL_VIDEO_RUNNER}').read_text(encoding='utf-8'))`], { stdio: "inherit" });
console.log(JSON.stringify({ok:true,status:"V142_HUMO_PREINSTALLED_RUNTIME_REQUIRES_PHYSICAL_RECERTIFICATION",productBaseCommit:PRODUCT_BASE_COMMIT,preinstalledImage:NEW_HUMO_IMAGE,preinstalledImageDigest:NEW_HUMO_DIGEST,paidTorchInstallationAllowed:false,stalePhysicalCertificationInvalidated:true,physicalRuntimeCertified:false,runtimeCertificationRequiredBeforeInference:true,budgetBootstrapDiagnosticsRequired:true,registryPlatformDigestRequired:"linux/amd64",persistentVolumeInGb:0,networkVolumeAllowedForHuMoProbe:false,temporaryContainerDiskInGb:60,inferenceAuthorized:false,providerTrafficUsed:false,runpodTrafficUsed:false,billableGpuCreated:false,newFiles:false,newBrains:false}));
