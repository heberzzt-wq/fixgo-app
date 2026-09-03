import fs from "node:fs";

function sourceOf(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
}

function replaceExactOnce(file, before, after, label) {
  const source = sourceOf(file);
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  write(file, source.replace(before, after));
}

function insertBeforeOnce(file, anchor, addition, marker, label) {
  const source = sourceOf(file);
  if (source.includes(marker)) return;
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  write(file, source.replace(anchor, `${addition.trimEnd()}\n\n${anchor}`));
}

function appendOnce(file, marker, addition) {
  const source = sourceOf(file);
  if (source.includes(marker)) return;
  write(file, `${source.trimEnd()}\n\n${addition.trim()}\n`);
}

function assertBaseline() {
  const engine = sourceOf("jarvis-local-video-engine.js");
  const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
  const tests = sourceOf("tests/jarvis-local-video-engine-v142.test.mjs");
  for (const [value, marker, label] of [
    [engine, "const HUMO_IDENTITY_PROBE = Object.freeze({", "HUMO_PROFILE"],
    [engine, "function inspectHuMoZeroCostPrecheck(", "HUMO_ZERO_COST_PRECHECK"],
    [engine, "RUNPOD_PROVISION_CLEANUP_FAILED", "PROVISION_CLEANUP"],
    [runner, "def run_humo_identity_probe(", "HUMO_EXECUTOR"],
    [runner, "def _verify_humo_runtime_authority(", "HUMO_HASH_GATE"],
    [tests, "V142 HuMo RunPod precheck is zero-cost and landscape probe does not require portrait certification", "HUMO_EXISTING_REGRESSION"]
  ]) {
    if (!value.includes(marker)) throw new Error(`V142_${label}_MISSING`);
  }
  const resolveStart = runner.indexOf("def resolve_backend(");
  const resolveEnd = runner.indexOf("def offline_environment(", resolveStart);
  if (runner.slice(resolveStart, resolveEnd).includes('authority.get("physicalPortraitCertified")')) {
    throw new Error("V142_HUMO_LANDSCAPE_PROBE_MUST_NOT_REQUIRE_PORTRAIT_CERTIFICATION");
  }
}

function ensureHuMoRemoteLifecycle() {
  const file = "jarvis-local-video-engine.js";
  const lifecycleMarker = "    function remoteHuMoLifecycleContract(job = null) {";
  if (!sourceOf(file).includes(lifecycleMarker)) {
    insertBeforeOnce(
      file,
      `    function assertZeroCostConfiguration(job, { allowDynamicPlacement = false } = {}) {`,
      `    function configuredRemoteBackend() {
        return LOCAL_VIDEO_MODEL_ALIASES[configuredBackend] || configuredBackend;
    }

    function isHuMoRemoteJob(job = null) {
        const backend = String(job?.backend || configuredRemoteBackend()).trim().toLowerCase();
        return (LOCAL_VIDEO_MODEL_ALIASES[backend] || backend) === HUMO_IDENTITY_PROBE.backend;
    }

    function remoteHuMoLifecycleContract(job = null) {
        if (!isHuMoRemoteJob(job)) return null;
        const runtime = RUNPOD_HUMO_IDENTITY_CANDIDATE.remoteRuntimeBase;
        const cacheRoot = \`\${remoteBase}/cache/humo-1.7b\`;
        const weightsRoot = \`\${cacheRoot}/weights\`;
        const wanProfile = cacheContract || RUNPOD_WAN22_GPU_PROFILES[RUNPOD_HUMO_IDENTITY_CANDIDATE.targetGpuTypeId];
        return {
            kind: "humo",
            backend: HUMO_IDENTITY_PROBE.backend,
            model: HUMO_IDENTITY_PROBE.model,
            cacheRoot,
            repositoryDir: \`\${cacheRoot}/HuMo\`,
            weightsDir: \`\${weightsRoot}/HuMo\`,
            wan21Dir: \`\${weightsRoot}/Wan2.1-T2V-1.3B\`,
            whisperDir: \`\${weightsRoot}/whisper-large-v3\`,
            separatorFile: \`\${weightsRoot}/HuMo/\${RUNPOD_HUMO_IDENTITY_CANDIDATE.audioSeparator.path}\`,
            venvDir: \`\${cacheRoot}/venv\`,
            runtimePreflightFile: \`\${cacheRoot}/runtime-preflight.json\`,
            profile: {
                profile: "humo-1.7b-identity",
                provisionImageTag: runtime.provisionImageTag,
                expectedRegistryDigest: runtime.expectedRegistryDigest,
                minimumRamGb: Number(wanProfile?.minimumRamGb || 62),
                minimumVcpu: Number(wanProfile?.minimumVcpu || 16),
                minimumVramGb: Number(HUMO_IDENTITY_PROBE.minimumVramGb),
                computeCapability: String(wanProfile?.computeCapability || "8.9"),
                runtimeIdentity: {
                    operatingSystem: "ubuntu-22.04",
                    pythonVersionPrefix: runtime.basePython + ".",
                    torchVersionPrefix: runtime.baseTorch,
                    torchCudaVersionPrefix: "12.4"
                },
                registry: runtime.registry,
                repository: runtime.repository,
                tag: runtime.tag,
                modelRepository: RUNPOD_HUMO_IDENTITY_CANDIDATE.modelRepository,
                modelRevision: RUNPOD_HUMO_IDENTITY_CANDIDATE.modelRevision,
                sourceRevision: RUNPOD_HUMO_IDENTITY_CANDIDATE.sourceRevision
            }
        };
    }

    function assertHuMoPaidExecutionAuthority(job = null) {
        if (!isHuMoRemoteJob(job)) return;
        if (runtimeCertificationOnly === true) return;
        if (RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true) {
            throw new Error("RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED");
        }
        if (RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true) {
            throw new Error("RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED");
        }
    }

    function inspectHuMoRuntimeCertificationPrecheck({ job = null, registryVerification = null } = {}) {
        try {
            const lifecycle = remoteHuMoLifecycleContract(job);
            if (!lifecycle) throw new Error("RUNPOD_HUMO_BACKEND_REQUIRED");
            if (provider !== "runpod") throw new Error("RUNPOD_PROVIDER_NOT_ENABLED");
            if (configuredPolicy !== "LOCAL_TEST") throw new Error("RUNPOD_LOCAL_TEST_POLICY_REQUIRED");
            if (runtimeCertificationOnly !== true) throw new Error("RUNPOD_HUMO_RUNTIME_CERTIFICATION_MODE_REQUIRED");
            if (!hardBudgetExplicit) throw new Error("RUNPOD_HARD_BUDGET_REQUIRED");
            if (gpuTypeId !== RUNPOD_HUMO_IDENTITY_CANDIDATE.targetGpuTypeId) {
                throw new Error("RUNPOD_HUMO_L40S_REQUIRED");
            }
            if (networkVolumeId) throw new Error("RUNPOD_HUMO_NETWORK_VOLUME_CACHE_UNCERTIFIED");
            if (!/^[a-f0-9]{40}$/.test(configuredCanonicalSha)) {
                throw new Error("RUNPOD_CANONICAL_SHA_REQUIRED");
            }
            if (currentCanonicalSha() !== configuredCanonicalSha) {
                throw new Error("RUNPOD_CANONICAL_SHA_MISMATCH");
            }
            const bridgeIdentity = currentBridgeIdentity();
            if (bridgeIdentity.ok !== true || bridgeIdentity.status !== "BRIDGE_IDENTITY_OK") {
                throw new Error("RUNPOD_BRIDGE_IDENTITY_REQUIRED");
            }
            if (job) {
                if (
                    job.executionTarget !== "remote" ||
                    job.backend !== HUMO_IDENTITY_PROBE.backend ||
                    job.model !== HUMO_IDENTITY_PROBE.model ||
                    job.externalApiAllowed !== false ||
                    !job.missionId || !job.objectiveId || !job.obligationId ||
                    !/^[a-f0-9]{64}$/i.test(String(job.rootInstructionHash || ""))
                ) {
                    throw new Error("RUNPOD_HUMO_RUNTIME_CERTIFICATION_JOB_INVALID");
                }
            }
            const verifiedRegistry = normalizedRegistryVerification(lifecycle.profile, registryVerification);
            const hourlyRateUsd = Number(configuredTotalHourlyRateUsd);
            const maximumSpendBeforeCleanupUsd = Number((hardBudgetUsd * budgetStopRatio).toFixed(6));
            return {
                ok: true,
                phase: "HUMO_RUNTIME_CERTIFICATION_PREFLIGHT",
                status: "RUNPOD_HUMO_RUNTIME_CERTIFICATION_READY_BLOCKED",
                backend: HUMO_IDENTITY_PROBE.backend,
                model: HUMO_IDENTITY_PROBE.model,
                targetGpuTypeId: RUNPOD_HUMO_IDENTITY_CANDIDATE.targetGpuTypeId,
                resourceCreationPossible: false,
                inferencePossible: false,
                providerTrafficUsed: false,
                runtimeCertificationOnly: true,
                releaseRequired: true,
                economics: {
                    hourlyRateUsd,
                    hardBudgetUsd,
                    stopRatio: budgetStopRatio,
                    maximumSpendBeforeCleanupUsd,
                    maximumAuthorizedSeconds: Math.floor(maximumSpendBeforeCleanupUsd * 3600 / hourlyRateUsd)
                },
                cache: { expectedStatus: "CACHE_MISS" },
                contract: {
                    provisionImageTag: lifecycle.profile.provisionImageTag,
                    expectedRegistryDigest: lifecycle.profile.expectedRegistryDigest,
                    registryVerification: verifiedRegistry,
                    sourceRevision: lifecycle.profile.sourceRevision,
                    modelRevision: lifecycle.profile.modelRevision
                }
            };
        }
        catch(error) {
            return {
                ok: false,
                phase: "HUMO_RUNTIME_CERTIFICATION_PREFLIGHT",
                status: error?.message || "RUNPOD_HUMO_RUNTIME_CERTIFICATION_PREFLIGHT_FAILED",
                error: error?.message || "RUNPOD_HUMO_RUNTIME_CERTIFICATION_PREFLIGHT_FAILED",
                resourceCreationPossible: false,
                inferencePossible: false,
                providerTrafficUsed: false
            };
        }
    }

    function inspectHuMoRemoteLifecyclePlan({ job = null, registryVerification = null } = {}) {
        const precheck = inspectHuMoZeroCostPrecheck({ job, registryVerification });
        if (precheck.ok !== true) return precheck;
        const lifecycle = remoteHuMoLifecycleContract(job);
        return {
            ...precheck,
            phase: "HUMO_REMOTE_LIFECYCLE_PLAN",
            status: "RUNPOD_HUMO_REMOTE_LIFECYCLE_READY_BLOCKED",
            resourceCreationPossible: false,
            providerTrafficUsed: false,
            releaseRequired: true,
            lifecycle: {
                kind: lifecycle.kind,
                cacheRoot: lifecycle.cacheRoot,
                repositoryDir: lifecycle.repositoryDir,
                weightsDir: lifecycle.weightsDir,
                wan21Dir: lifecycle.wan21Dir,
                whisperDir: lifecycle.whisperDir,
                separatorFile: lifecycle.separatorFile,
                venvDir: lifecycle.venvDir,
                provisionImageTag: lifecycle.profile.provisionImageTag,
                expectedRegistryDigest: lifecycle.profile.expectedRegistryDigest,
                sourceRevision: lifecycle.profile.sourceRevision,
                modelRevision: lifecycle.profile.modelRevision,
                runnerEnvironment: [
                    "JARVIS_HUMO_REPO_DIR",
                    "JARVIS_HUMO_WEIGHTS_DIR",
                    "JARVIS_HUMO_WAN21_MODEL_DIR",
                    "JARVIS_HUMO_WHISPER_DIR",
                    "JARVIS_HUMO_AUDIO_SEPARATOR_FILE"
                ]
            }
        };
    }`,
      lifecycleMarker,
      "V142_HUMO_REMOTE_LIFECYCLE_HELPERS"
    );
  }

  replaceExactOnce(
    file,
    `        if (configuredBackend !== WAN22_TI2V_5B.backend) throw new Error("RUNPOD_WAN22_BACKEND_REQUIRED");`,
    `        const requestedBackend = configuredRemoteBackend();
        const humoLifecycle = requestedBackend === HUMO_IDENTITY_PROBE.backend;
        if (!humoLifecycle && requestedBackend !== WAN22_TI2V_5B.backend) {
            throw new Error("RUNPOD_WAN22_BACKEND_REQUIRED");
        }
        if (humoLifecycle && gpuTypeId && gpuTypeId !== RUNPOD_HUMO_IDENTITY_CANDIDATE.targetGpuTypeId) {
            throw new Error("RUNPOD_HUMO_L40S_REQUIRED");
        }`,
    "V142_HUMO_ASSERT_BACKEND"
  );

  replaceExactOnce(
    file,
    `        if (gpuTypeId && !cacheContract) throw new Error("RUNPOD_GPU_TYPE_NOT_APPROVED_FOR_V142");
        if (/@sha256:/i.test(provisionImageTag)) {
            throw new Error("RUNPOD_IMAGE_NAME_DIGEST_FORBIDDEN");
        }
        const configuredImageContract = cacheContract || RUNPOD_WAN22_CACHE_BASE;
        if (provisionImageTag !== configuredImageContract.provisionImageTag) {
            throw new Error("RUNPOD_PROVISION_IMAGE_TAG_NOT_APPROVED_FOR_V142");
        }
        if (!/^sha256:[a-f0-9]{64}$/i.test(configuredImageContract.expectedRegistryDigest)) {
            throw new Error("RUNPOD_EXPECTED_REGISTRY_DIGEST_INVALID");
        }
        assertFlashAttentionWheelAuthority(configuredImageContract);
        if (
            minimumRamGb < configuredImageContract.minimumRamGb ||
            minimumVcpu < configuredImageContract.minimumVcpu
        ) {
            throw new Error("RUNPOD_GPU_RESOURCE_PROFILE_INSUFFICIENT");
        }`,
    `        if (gpuTypeId && !cacheContract) throw new Error("RUNPOD_GPU_TYPE_NOT_APPROVED_FOR_V142");
        const humoContract = humoLifecycle ? remoteHuMoLifecycleContract(job) : null;
        const configuredImageContract = humoContract?.profile || cacheContract || RUNPOD_WAN22_CACHE_BASE;
        const configuredProvisionImageTag = humoContract?.profile?.provisionImageTag || provisionImageTag;
        if (/@sha256:/i.test(configuredProvisionImageTag)) {
            throw new Error("RUNPOD_IMAGE_NAME_DIGEST_FORBIDDEN");
        }
        if (configuredProvisionImageTag !== configuredImageContract.provisionImageTag) {
            throw new Error("RUNPOD_PROVISION_IMAGE_TAG_NOT_APPROVED_FOR_V142");
        }
        if (!/^sha256:[a-f0-9]{64}$/i.test(configuredImageContract.expectedRegistryDigest)) {
            throw new Error("RUNPOD_EXPECTED_REGISTRY_DIGEST_INVALID");
        }
        if (!humoLifecycle) assertFlashAttentionWheelAuthority(configuredImageContract);
        if (
            minimumRamGb < configuredImageContract.minimumRamGb ||
            minimumVcpu < configuredImageContract.minimumVcpu
        ) {
            throw new Error("RUNPOD_GPU_RESOURCE_PROFILE_INSUFFICIENT");
        }`,
    "V142_HUMO_ASSERT_IMAGE_PROFILE"
  );

  replaceExactOnce(
    file,
    `            if (
                job.executionTarget !== "remote" ||
                job.backend !== WAN22_TI2V_5B.backend ||
                job.model !== WAN22_TI2V_5B.model
            ) {
                throw new Error("RUNPOD_WAN22_JOB_CONTRACT_INVALID");
            }`,
    `            if (humoLifecycle) {
                const authority = job.identityRuntimeAuthority;
                const shots = Array.isArray(job.shotPlan) ? job.shotPlan : [];
                const shot = shots[0] || {};
                if (
                    job.executionTarget !== "remote" ||
                    job.backend !== HUMO_IDENTITY_PROBE.backend ||
                    job.model !== HUMO_IDENTITY_PROBE.model ||
                    (!runtimeCertificationOnly && job.requiresIdentityFidelity !== true) ||
                    (!runtimeCertificationOnly && job.aspectRatio !== "16:9")
                ) {
                    throw new Error("RUNPOD_HUMO_JOB_CONTRACT_INVALID");
                }
                if (networkVolumeId) {
                    throw new Error("RUNPOD_HUMO_NETWORK_VOLUME_CACHE_UNCERTIFIED");
                }
                if (!runtimeCertificationOnly && (
                    shots.length !== 1 ||
                    shot.identityMode !== "single_identity" ||
                    !Array.isArray(shot.characterIds) ||
                    shot.characterIds.length !== 1 ||
                    !Array.isArray(shot.identityReferenceOutputs) ||
                    shot.identityReferenceOutputs.length < 1 ||
                    !authority ||
                    authority.id !== RUNPOD_HUMO_IDENTITY_CANDIDATE.id ||
                    authority.runtimeAssetAuthorityPinned !== true
                )) {
                    throw new Error("RUNPOD_HUMO_JOB_CONTRACT_INVALID");
                }
            }
            else if (
                job.executionTarget !== "remote" ||
                job.backend !== WAN22_TI2V_5B.backend ||
                job.model !== WAN22_TI2V_5B.model
            ) {
                throw new Error("RUNPOD_WAN22_JOB_CONTRACT_INVALID");
            }`,
    "V142_HUMO_ASSERT_JOB"
  );

  const bootstrapMarker = "    function writeHuMoRuntimeBootstrapFile(bootstrapFile) {";
  if (!sourceOf(file).includes(bootstrapMarker)) {
    insertBeforeOnce(
      file,
      `    function writeGpuRuntimeBootstrapFile(bootstrapFile) {`,
      `    function writeHuMoRuntimeBootstrapFile(bootstrapFile) {
        const lifecycle = remoteHuMoLifecycleContract({ backend: HUMO_IDENTITY_PROBE.backend });
        const authority = RUNPOD_HUMO_IDENTITY_CANDIDATE;
        const cacheRoot = lifecycle.cacheRoot;
        const bootstrap = [
            "#!/usr/bin/env bash",
            "set -eEuo pipefail",
            "export DEBIAN_FRONTEND=noninteractive",
            "export PIP_NO_CACHE_DIR=1",
            "export HF_HUB_DISABLE_TELEMETRY=1",
            \`CACHE_ROOT=\${shellSingleQuote(cacheRoot)}\`,
            \`VENV=\${shellSingleQuote(lifecycle.venvDir)}\`,
            \`HUMO_REPO=\${shellSingleQuote(lifecycle.repositoryDir)}\`,
            \`HUMO_WEIGHTS=\${shellSingleQuote(lifecycle.weightsDir)}\`,
            \`WAN21_WEIGHTS=\${shellSingleQuote(lifecycle.wan21Dir)}\`,
            \`WHISPER_DIR=\${shellSingleQuote(lifecycle.whisperDir)}\`,
            \`SEPARATOR_FILE=\${shellSingleQuote(lifecycle.separatorFile)}\`,
            \`PREFLIGHT_RESULT=\${shellSingleQuote(lifecycle.runtimePreflightFile)}\`,
            \`RUNTIME_CERTIFICATION_ONLY=\${runtimeCertificationOnly ? "1" : "0"}\`,
            \`PROGRESS=\${shellSingleQuote(\`\${remoteBase}/operations\`)}/\${path.basename(path.dirname(bootstrapFile))}/bootstrap-progress.json\`,
            "mkdir -p \\\"$CACHE_ROOT\\\" \\\"$HUMO_WEIGHTS\\\" \\\"$WAN21_WEIGHTS\\\" \\\"$WHISPER_DIR\\\" \\\"$(dirname \\\"$PROGRESS\\\")\\\"",
            "progress() { local stage=\\\"$1\\\" status=\\\"$2\\\" cache; if test \\\"$RUNTIME_CERTIFICATION_ONLY\\\" = 1; then cache=CACHE_MISS; elif test \\\"$status\\\" = READY; then cache=CACHE_READY; else cache=CACHE_POPULATING; fi; python3 - \\\"$PROGRESS\\\" \\\"$stage\\\" \\\"$status\\\" \\\"$cache\\\" <<'PY'",
            "import datetime,json,os,sys,tempfile",
            "target,stage,status,cache=sys.argv[1:]",
            "payload={'stage':stage,'status':status,'cacheStatus':cache,'modelBytes':0,'at':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')}",
            "fd,tmp=tempfile.mkstemp(prefix='.progress-',dir=os.path.dirname(target)); os.close(fd)",
            "open(tmp,'w',encoding='utf-8').write(json.dumps(payload,separators=(',',':'))+'\\\\n'); os.replace(tmp,target)",
            "PY",
            "}",
            "trap 'progress HUMO_BOOTSTRAP FAILED' ERR",
            "progress SYSTEM_DEPENDENCIES RUNNING",
            "missing=(); for tool in git ffmpeg ffprobe curl; do command -v \\\"$tool\\\" >/dev/null || missing+=(\\\"$tool\\\"); done",
            "if test \${#missing[@]} -gt 0; then apt-get update -qq; apt-get install -y -qq git ffmpeg curl python3-venv build-essential ninja-build; fi",
            "progress SYSTEM_DEPENDENCIES READY",
            "progress HUMO_REPOSITORY RUNNING",
            "if test ! -d \\\"$HUMO_REPO/.git\\\"; then rm -rf \\\"$HUMO_REPO\\\"; git clone --filter=blob:none https://github.com/Phantom-video/HuMo.git \\\"$HUMO_REPO\\\"; fi",
            \`git -C "$HUMO_REPO" fetch --depth 1 origin \${authority.sourceRevision}\`,
            \`git -C "$HUMO_REPO" checkout --detach \${authority.sourceRevision}\`,
            \`test "$(git -C "$HUMO_REPO" rev-parse HEAD)" = \${shellSingleQuote(authority.sourceRevision)}\`,
            "progress HUMO_REPOSITORY READY",
            "progress HUMO_RUNTIME RUNNING",
            "test -x \\\"$VENV/bin/python\\\" || python3 -m venv \\\"$VENV\\\"",
            "\\\"$VENV/bin/python\\\" -m pip install --upgrade pip setuptools wheel packaging ninja 'huggingface_hub[cli]>=0.30,<1'",
            "\\\"$VENV/bin/python\\\" -m pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124",
            "MAX_JOBS=4 \\\"$VENV/bin/python\\\" -m pip install flash_attn==2.6.3 ",
            "\\\"$VENV/bin/python\\\" -m pip install -r \\\"$HUMO_REPO/requirements.txt\\\"",
            "\\\"$VENV/bin/python\\\" -m pip check",
            "progress HUMO_RUNTIME READY",
            "if test \"$RUNTIME_CERTIFICATION_ONLY\" = 1; then",
            "  progress HUMO_ASSETS SKIPPED",
            "else",
            "  progress HUMO_ASSETS RUNNING",
            \`  "$VENV/bin/hf" download \${authority.modelRepository} --revision \${authority.modelRevision} --local-dir "$HUMO_WEIGHTS"\`,
            "  \"$VENV/bin/hf\" download Wan-AI/Wan2.1-T2V-1.3B --local-dir \"$WAN21_WEIGHTS\"",
            \`  "$VENV/bin/hf" download \${authority.whisper.repository} --revision \${authority.whisper.revision} --local-dir "$WHISPER_DIR"\`,
            \`  test -f "$HUMO_WEIGHTS/\${authority.checkpoint.path}"\`,
            \`  test -f "$HUMO_WEIGHTS/\${authority.zeroVae.path}"\`,
            \`  test -f "$WAN21_WEIGHTS/\${authority.wan21Vae.path}"\`,
            \`  test -f "$SEPARATOR_FILE"\`,
            "  progress HUMO_ASSETS READY",
            "fi",
            "progress HUMO_RUNTIME_PREFLIGHT RUNNING",
            "\\\"$VENV/bin/python\\\" - \\\"$PREFLIGHT_RESULT\\\" \\\"$HUMO_REPO\\\" <<'PY'",
            "import datetime,importlib.metadata,json,os,platform,subprocess,sys,torch",
            "target,repo=sys.argv[1:]",
            "payload={'ok':False,'pythonVersion':platform.python_version(),'torchVersion':str(torch.__version__),'torchCudaVersion':str(torch.version.cuda or ''),'cuda':torch.cuda.is_available(),'gpuName':torch.cuda.get_device_name(0) if torch.cuda.is_available() else '','computeCapability':'.'.join(map(str,torch.cuda.get_device_capability(0))) if torch.cuda.is_available() else '','flashAttentionVersion':importlib.metadata.version('flash-attn'),'pipCheck':subprocess.run([sys.executable,'-m','pip','check'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0,'sourceRevision':subprocess.check_output(['git','-C',repo,'rev-parse','HEAD'],text=True).strip(),'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')}",
            \`payload['ok']=payload['pythonVersion'].startswith('\${authority.remoteRuntimeBase.bootstrapPython}.') and payload['torchVersion'].startswith('\${authority.remoteRuntimeBase.bootstrapTorch}') and payload['torchCudaVersion'].startswith('\${authority.remoteRuntimeBase.bootstrapTorchCuda}') and payload['flashAttentionVersion']=='\${authority.remoteRuntimeBase.bootstrapFlashAttention}' and payload['cuda'] and payload['sourceRevision']=='\${authority.sourceRevision}' and payload['pipCheck']\`,
            "tmp=target+'.tmp'; open(tmp,'w',encoding='utf-8').write(json.dumps(payload,separators=(',',':'))+'\\\\n'); os.replace(tmp,target)",
            "raise SystemExit(0 if payload['ok'] else 17)",
            "PY",
            "progress HUMO_RUNTIME_PREFLIGHT READY",
            "touch \\\"$(dirname \\\"$PROGRESS\\\")/bootstrap.ready\\\""
        ].join("\\n") + "\\n";
        fs.writeFileSync(bootstrapFile, bootstrap, { encoding: "utf8", mode: 0o700 });
    }

    function writeRemoteRuntimeBootstrapFile(bootstrapFile, jobOrState = null) {
        if (isHuMoRemoteJob(jobOrState)) {
            writeHuMoRuntimeBootstrapFile(bootstrapFile);
            return;
        }
        writeGpuRuntimeBootstrapFile(bootstrapFile);
    }`,
      bootstrapMarker,
      "V142_HUMO_BOOTSTRAP"
    );
  }

  replaceExactOnce(
    file,
    `            modelDirectory: \`\${remoteBase}/cache/wan22-ti2v-5b/model\`,
            outputFile: \`\${remoteOperationDir}/output.mp4\`,`,
    `            modelDirectory: isHuMoRemoteJob(job)
                ? remoteHuMoLifecycleContract(job).weightsDir
                : \`\${remoteBase}/cache/wan22-ti2v-5b/model\`,
            outputFile: \`\${remoteOperationDir}/output.mp4\`,`,
    "V142_HUMO_REMOTE_JOB_MODEL_PATH"
  );

  replaceExactOnce(
    file,
    `        writeGpuRuntimeBootstrapFile(bootstrapFile);
        return {
            operationDir,`,
    `        writeRemoteRuntimeBootstrapFile(bootstrapFile, job);
        const remoteLifecycle = remoteHuMoLifecycleContract(job);
        return {
            runtimeKind: remoteLifecycle?.kind || "wan22",
            cacheRoot: remoteLifecycle?.cacheRoot || \`\${remoteBase}/cache/wan22-ti2v-5b\`,
            repositoryDir: remoteLifecycle?.repositoryDir || \`\${remoteBase}/cache/wan22-ti2v-5b/Wan2.2\`,
            weightsDir: remoteLifecycle?.weightsDir || \`\${remoteBase}/cache/wan22-ti2v-5b/model\`,
            wan21Dir: remoteLifecycle?.wan21Dir || null,
            whisperDir: remoteLifecycle?.whisperDir || null,
            separatorFile: remoteLifecycle?.separatorFile || null,
            venvDir: remoteLifecycle?.venvDir || \`\${remoteBase}/cache/wan22-ti2v-5b/venv\`,
            operationDir,`,
    "V142_HUMO_REMOTE_PREPARE_CONTRACT"
  );

  const healthMarker = "    async function remoteHuMoHealth(state, full = false) {";
  if (!sourceOf(file).includes(healthMarker)) {
    insertBeforeOnce(
      file,
      `    async function remoteHealth(state, full = false) {`,
      `    async function remoteHuMoHealth(state, full = false) {
        const authority = RUNPOD_HUMO_IDENTITY_CANDIDATE;
        const lifecycle = remoteHuMoLifecycleContract({ backend: HUMO_IDENTITY_PROBE.backend });
        const python = full ? \`\${state.venvDir}/bin/python\` : "python3";
        const command = \`\${shellSingleQuote(python)} -c \${shellSingleQuote(
            "import importlib.metadata,json,os,platform,shutil,subprocess,torch; " +
            "cuda=torch.cuda.is_available(); " +
            "d={'pythonVersion':platform.python_version(),'torchVersion':str(torch.__version__),'torchCudaVersion':str(torch.version.cuda or ''),'cuda':cuda,'gpuName':torch.cuda.get_device_name(0) if cuda else '','computeCapability':'.'.join(map(str,torch.cuda.get_device_capability(0))) if cuda else '','vramBytes':torch.cuda.get_device_properties(0).total_memory if cuda else 0,'ffmpeg':bool(shutil.which('ffmpeg')),'ffprobe':bool(shutil.which('ffprobe'))}; " +
            (full
                ? \`p=json.load(open('\${lifecycle.runtimePreflightFile}',encoding='utf-8')) if os.path.isfile('\${lifecycle.runtimePreflightFile}') else {}; d.update({'runner':os.path.isfile('\${state.remoteOperationDir}/jarvis-local-video-wan22.py'),'humoRepository':os.path.isfile('\${lifecycle.repositoryDir}/main.py'),'weights':os.path.isfile('\${lifecycle.weightsDir}/\${authority.checkpoint.path}'),'wan21':os.path.isfile('\${lifecycle.wan21Dir}/\${authority.wan21Vae.path}'),'whisper':os.path.isfile('\${lifecycle.whisperDir}/\${authority.whisper.model.path}'),'separator':os.path.isfile('\${lifecycle.separatorFile}'),'dependencyContract':p.get('ok') is True,'pipCheck':p.get('pipCheck') is True,'flashAttentionVersion':p.get('flashAttentionVersion'),'sourceRevision':p.get('sourceRevision')}); \`
                : "") +
            "print(json.dumps(d))"
        )}\`;
        const result = await sshCommand(state, command, 60000);
        let health;
        try { health = JSON.parse(result.stdout.trim().split(/\\r?\\n/).at(-1)); }
        catch { throw new Error("RUNPOD_HEALTH_RESPONSE_INVALID"); }
        const runtime = authority.remoteRuntimeBase;
        const expectedTorch = full ? runtime.bootstrapTorch : runtime.baseTorch;
        const basePredicates = {
            pythonVersion: String(health.pythonVersion || "").startsWith(runtime.basePython + "."),
            torchVersion: String(health.torchVersion || "").startsWith(expectedTorch),
            torchCudaVersion: String(health.torchCudaVersion || "").startsWith("12.4"),
            cudaAvailable: health.cuda === true,
            gpuName: String(health.gpuName || "").trim() === authority.targetGpuTypeId,
            vramObserved: Number(health.vramBytes || 0) >= HUMO_IDENTITY_PROBE.minimumVramGb * RUNPOD_GIB
        };
        const baseFailures = Object.entries(basePredicates).filter(([, passed]) => passed !== true).map(([name]) => name);
        if (baseFailures.length > 0) {
            const failure = new Error("RUNPOD_HUMO_IMAGE_RUNTIME_MISMATCH");
            failure.baseHealth = health;
            failure.runtimePredicateResults = basePredicates;
            failure.runtimePredicateFailures = baseFailures;
            throw failure;
        }
        if (full) {
            const fullPredicates = {
                ffmpeg: health.ffmpeg === true,
                ffprobe: health.ffprobe === true,
                runner: health.runner === true,
                humoRepository: health.humoRepository === true,
                weights: state.runtimeCertificationOnly === true || health.weights === true,
                wan21: state.runtimeCertificationOnly === true || health.wan21 === true,
                whisper: state.runtimeCertificationOnly === true || health.whisper === true,
                separator: state.runtimeCertificationOnly === true || health.separator === true,
                dependencyContract: health.dependencyContract === true,
                pipCheck: health.pipCheck === true,
                flashAttentionVersion: String(health.flashAttentionVersion || "") === runtime.bootstrapFlashAttention,
                sourceRevision: String(health.sourceRevision || "") === authority.sourceRevision
            };
            const fullFailures = Object.entries(fullPredicates).filter(([, passed]) => passed !== true).map(([name]) => name);
            if (fullFailures.length > 0) {
                const failure = new Error("RUNPOD_HUMO_RUNTIME_PREFLIGHT_FAILED");
                failure.fullHealth = health;
                failure.runtimePredicateResults = fullPredicates;
                failure.runtimePredicateFailures = fullFailures;
                throw failure;
            }
        }
        return health;
    }`,
      healthMarker,
      "V142_HUMO_REMOTE_HEALTH"
    );
  }

  replaceExactOnce(
    file,
    `    async function remoteHealth(state, full = false) {
        const cacheRoot = \`\${remoteBase}/cache/wan22-ti2v-5b\`;`,
    `    async function remoteHealth(state, full = false) {
        if (state.runtimeKind === "humo") return remoteHuMoHealth(state, full);
        const cacheRoot = \`\${remoteBase}/cache/wan22-ti2v-5b\`;`,
    "V142_HUMO_REMOTE_HEALTH_DISPATCH"
  );

  replaceExactOnce(
    file,
    `    async function uploadOperation(state) {
        writeGpuRuntimeBootstrapFile(state.bootstrapFile);`,
    `    async function uploadOperation(state) {
        writeRemoteRuntimeBootstrapFile(state.bootstrapFile, state);`,
    "V142_HUMO_UPLOAD_BOOTSTRAP_DISPATCH"
  );

  replaceExactOnce(
    file,
    `        const runtimePreflightRaw = await readDiagnostic(
            \`cat \${shellSingleQuote(remoteBase + "/cache/wan22-ti2v-5b/runtime-preflight.json")}\`,
            "runtime_preflight"
        );`,
    `        const runtimePreflightRaw = await readDiagnostic(
            \`cat \${shellSingleQuote(state.runtimeKind === "humo"
                ? state.cacheRoot + "/runtime-preflight.json"
                : remoteBase + "/cache/wan22-ti2v-5b/runtime-preflight.json")}\`,
            "runtime_preflight"
        );
        if (state.runtimeKind === "humo") {
            let runtimePreflight = null;
            if (runtimePreflightRaw) {
                try { runtimePreflight = JSON.parse(runtimePreflightRaw); }
                catch {}
            }
            return {
                capturedAt: now().toISOString(),
                exitCode: Number.parseInt(exitCodeRaw.trim(), 10) || null,
                progress,
                stage: String(progress?.stage || "HUMO_BOOTSTRAP"),
                cacheStatus: String(progress?.cacheStatus || state.cacheStatus || "CACHE_MISS"),
                logTail: logTail || null,
                runtimePreflight,
                runtimePredicateResults: runtimePreflight ? { ok: runtimePreflight.ok === true } : null,
                runtimePredicateFailures: runtimePreflight?.ok === true ? [] : ["humoRuntimePreflight"],
                ...(captureErrors.length > 0 ? { captureErrors } : {})
            };
        }`,
    "V142_HUMO_BOOTSTRAP_DIAGNOSTICS"
  );

  replaceExactOnce(
    file,
    `    async function launch({ job }) {
        assertZeroCostConfiguration(job);
        assertPaidResourceCreationAuthority();
        assertProviderConfigured();
        const registryVerification = await resolveRegistryVerification(cacheContract);`,
    `    async function launch({ job }) {
        assertZeroCostConfiguration(job);
        assertPaidResourceCreationAuthority();
        assertHuMoPaidExecutionAuthority(job);
        assertProviderConfigured();
        const lifecycle = remoteHuMoLifecycleContract(job);
        const launchProfile = lifecycle?.profile || cacheContract;
        const registryVerification = await resolveRegistryVerification(launchProfile);`,
    "V142_HUMO_LAUNCH_GATE"
  );

  replaceExactOnce(
    file,
    `            const zeroCostPrecheck = inspectZeroCostPrecheck({
                job,
                networkVolume,
                availability,
                registryVerification
            });
            if (zeroCostPrecheck.ok !== true) {
                throw new Error(zeroCostPrecheck.error || "RUNPOD_ZERO_COST_PRECHECK_FAILED");
            }
            const provisionedAt = now().toISOString();
            const body = buildProvisionBody(
                job,
                prepared.publicKey,
                networkVolume,
                gpuTypeId,
                cacheContract,
                selectedDataCenterId
            );
            assertProvisionBody(body, networkVolume);`,
    `            const zeroCostPrecheck = lifecycle
                ? (runtimeCertificationOnly
                    ? inspectHuMoRuntimeCertificationPrecheck({ job, registryVerification })
                    : inspectHuMoZeroCostPrecheck({ job, registryVerification }))
                : inspectZeroCostPrecheck({
                    job,
                    networkVolume,
                    availability,
                    registryVerification
                });
            if (zeroCostPrecheck.ok !== true) {
                throw new Error(zeroCostPrecheck.error || "RUNPOD_ZERO_COST_PRECHECK_FAILED");
            }
            const provisionedAt = now().toISOString();
            const body = buildProvisionBody(
                job,
                prepared.publicKey,
                networkVolume,
                gpuTypeId,
                launchProfile,
                selectedDataCenterId
            );
            assertProvisionBody(body, networkVolume, gpuTypeId, launchProfile);
            const hourlyRateForBudget = Number(availability?.hourlyRateUsd || configuredTotalHourlyRateUsd);
            const maximumSpendBeforeCleanupUsd = Number((hardBudgetUsd * budgetStopRatio).toFixed(6));
            const maximumAuthorizedSeconds = Math.floor(
                maximumSpendBeforeCleanupUsd * 3600 / hourlyRateForBudget
            );`,
    "V142_HUMO_LAUNCH_PRECHECK"
  );

  replaceExactOnce(
    file,
    `            if (actualGpu !== gpuTypeId || actualVram < cacheContract.minimumVramGb) {
                throw new Error("RUNPOD_PROVISIONED_GPU_INCOMPATIBLE");
            }`,
    `            if (actualGpu !== gpuTypeId || actualVram < launchProfile.minimumVramGb) {
                throw new Error("RUNPOD_PROVISIONED_GPU_INCOMPATIBLE");
            }`,
    "V142_HUMO_PROVISIONED_GPU"
  );

  replaceExactOnce(
    file,
    `                maximumSpendBeforeCleanupUsd: zeroCostPrecheck.economics.maximumSpendBeforeCleanupUsd,
                maximumAuthorizedSeconds: zeroCostPrecheck.economics.maximumAuthorizedSeconds,`,
    `                maximumSpendBeforeCleanupUsd: zeroCostPrecheck.economics?.maximumSpendBeforeCleanupUsd ?? maximumSpendBeforeCleanupUsd,
                maximumAuthorizedSeconds: zeroCostPrecheck.economics?.maximumAuthorizedSeconds ?? maximumAuthorizedSeconds,`,
    "V142_HUMO_BUDGET_STATE"
  );

  replaceExactOnce(
    file,
    `                runtimeCertificationOnly,
                cacheProfile: cacheContract.profile,
                modelContractRevision: cacheContract.modelRevision,
                computeCapabilityRequired: cacheContract.computeCapability,
                expectedCacheStatus: zeroCostPrecheck.cache.expectedStatus,
                provisionImageTag,
                expectedRegistryDigest: cacheContract.expectedRegistryDigest,
                runtimeIdentity: { ...cacheContract.runtimeIdentity },
                registryVerification,`,
    `                runtimeCertificationOnly,
                backend: job.backend,
                model: job.model,
                runtimeKind: lifecycle?.kind || "wan22",
                cacheProfile: launchProfile.profile,
                modelContractRevision: launchProfile.modelRevision,
                computeCapabilityRequired: launchProfile.computeCapability,
                expectedCacheStatus: zeroCostPrecheck.cache?.expectedStatus || "CACHE_MISS",
                provisionImageTag: launchProfile.provisionImageTag,
                expectedRegistryDigest: launchProfile.expectedRegistryDigest,
                runtimeIdentity: { ...launchProfile.runtimeIdentity },
                registryVerification,`,
    "V142_HUMO_STATE_PROFILE"
  );

  replaceExactOnce(
    file,
    `                    writeGpuRuntimeBootstrapFile(state.bootstrapFile);`,
    `                    writeRemoteRuntimeBootstrapFile(state.bootstrapFile, state);`,
    "V142_HUMO_BOOTSTRAP_REFRESH"
  );

  replaceExactOnce(
    file,
    `                const health = await remoteHealth(state, true);
                if (state.runtimeCertificationOnly === true) {`,
    `                const health = await remoteHealth(state, true);
                if (state.runtimeCertificationOnly === true && state.runtimeKind === "humo") {
                    const certifiedAt = now().toISOString();
                    const result = {
                        ok: true,
                        done: true,
                        status: "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED",
                        operationId: operation.operationId,
                        operationName: operation.operationName,
                        backend: operation.backend,
                        model: operation.model,
                        engine: "local",
                        provider: "runpod",
                        externalApiUsed: false,
                        externalEstimatedCostUsd: 0,
                        runtimeCertificationOnly: true,
                        runtimePreflightVerified: true,
                        physicalRuntimeCertified: true,
                        inferenceStarted: false,
                        gpuTypeId: state.gpuTypeId,
                        gpuName: health.gpuName,
                        providerVramGb: Number(state.providerVramGb || state.vramGb || 0),
                        vramGb: Number(health.vramBytes || 0) / RUNPOD_GIB,
                        vramBytes: Number(health.vramBytes || 0),
                        computeCapability: health.computeCapability,
                        pythonVersion: health.pythonVersion,
                        torchVersion: health.torchVersion,
                        torchCudaVersion: health.torchCudaVersion,
                        flashAttentionVersion: health.flashAttentionVersion || null,
                        sourceRevision: health.sourceRevision || null,
                        provisionImageTag: state.provisionImageTag,
                        expectedRegistryDigest: state.expectedRegistryDigest,
                        cacheStatus: "CACHE_MISS",
                        certifiedAt
                    };
                    atomicJsonWrite(resultFile, result);
                    state = withStage(state, "bootstrap", "READY");
                    state = withStage(state, "runtime_preflight", "READY");
                    state = writeState(loaded.file, state, {
                        phase: "RUNTIME_CERTIFIED",
                        fullHealth: health,
                        physicalHealthVerified: true,
                        runtimePreflightVerified: true,
                        physicalRuntimeCertified: true,
                        inferenceStarted: false,
                        cacheStatus: "CACHE_MISS",
                        certifiedAt,
                        stageTimeline: state.stageTimeline
                    });
                    return {
                        ok: true,
                        done: true,
                        status: result.status,
                        remoteWorker: runpodPublicWorker(state)
                    };
                }
                if (state.runtimeCertificationOnly === true) {`,
    "V142_HUMO_RUNTIME_CERTIFICATION_POLL"
  );

  replaceExactOnce(
    file,
    `                const runner = \`env JARVIS_WAN22_REPO_DIR=\${shellSingleQuote(remoteBase + "/cache/wan22-ti2v-5b/Wan2.2")} JARVIS_LOCAL_VIDEO_EXTERNAL_API_ALLOWED=false JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS=\${Math.floor(inferenceTimeoutSeconds)} \${shellSingleQuote(remoteBase + "/cache/wan22-ti2v-5b/venv/bin/python")} \${shellSingleQuote(state.remoteOperationDir + "/jarvis-local-video-wan22.py")} --job \${shellSingleQuote(state.remoteOperationDir + "/job.json")} --result \${shellSingleQuote(state.remoteResultFile)}\`;`,
    `                const runner = state.runtimeKind === "humo"
                    ? \`env JARVIS_HUMO_REPO_DIR=\${shellSingleQuote(state.repositoryDir)} JARVIS_HUMO_WEIGHTS_DIR=\${shellSingleQuote(state.weightsDir)} JARVIS_HUMO_WAN21_MODEL_DIR=\${shellSingleQuote(state.wan21Dir)} JARVIS_HUMO_WHISPER_DIR=\${shellSingleQuote(state.whisperDir)} JARVIS_HUMO_AUDIO_SEPARATOR_FILE=\${shellSingleQuote(state.separatorFile)} JARVIS_LOCAL_VIDEO_EXTERNAL_API_ALLOWED=false JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS=\${Math.floor(inferenceTimeoutSeconds)} \${shellSingleQuote(state.venvDir + "/bin/python")} \${shellSingleQuote(state.remoteOperationDir + "/jarvis-local-video-wan22.py")} --job \${shellSingleQuote(state.remoteOperationDir + "/job.json")} --result \${shellSingleQuote(state.remoteResultFile)}\`
                    : \`env JARVIS_WAN22_REPO_DIR=\${shellSingleQuote(remoteBase + "/cache/wan22-ti2v-5b/Wan2.2")} JARVIS_LOCAL_VIDEO_EXTERNAL_API_ALLOWED=false JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS=\${Math.floor(inferenceTimeoutSeconds)} \${shellSingleQuote(remoteBase + "/cache/wan22-ti2v-5b/venv/bin/python")} \${shellSingleQuote(state.remoteOperationDir + "/jarvis-local-video-wan22.py")} --job \${shellSingleQuote(state.remoteOperationDir + "/job.json")} --result \${shellSingleQuote(state.remoteResultFile)}\`;`,
    "V142_HUMO_RUNNER_COMMAND"
  );

  replaceExactOnce(
    file,
    `        inspectHardware,
        inspectZeroCostPrecheck,
        inspectHuMoZeroCostPrecheck,
        inspectLiveZeroCostPrecheck,`,
    `        inspectHardware,
        inspectZeroCostPrecheck,
        inspectHuMoZeroCostPrecheck,
        inspectHuMoRuntimeCertificationPrecheck,
        inspectHuMoRemoteLifecyclePlan,
        inspectLiveZeroCostPrecheck,`,
    "V142_HUMO_LIFECYCLE_PLAN_EXPOSED"
  );
}

function ensureRegression() {
  appendOnce(
    "tests/jarvis-local-video-engine-v142.test.mjs",
    "V142 HuMo remote lifecycle is wired but paid execution remains fail-closed",
    `test("V142 HuMo remote lifecycle is wired but paid execution remains fail-closed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-humo-zero-cost-"));
    const canonicalSha = "a".repeat(40);
    let providerCalls = 0;
    const forbiddenNetwork = async () => {
        providerCalls += 1;
        throw new Error("PROVIDER_TRAFFIC_MUST_NOT_OCCUR");
    };
    try {
        const adapter = createRunpodRemoteVideoAdapter({
            root,
            env: {
                JARVIS_REMOTE_GPU_PROVIDER: "runpod",
                JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
                JARVIS_LOCAL_VIDEO_MODEL: "humo",
                JARVIS_RUNPOD_GPU_TYPE_ID: "NVIDIA L40S",
                JARVIS_REMOTE_GPU_HARD_BUDGET_USD: "2",
                JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false",
                JARVIS_RUNPOD_CANONICAL_SHA: canonicalSha
            },
            fetchImpl: forbiddenNetwork,
            registryFetchImpl: forbiddenNetwork,
            inspectBridgeIdentity: () => ({ ok: true, status: "BRIDGE_IDENTITY_OK" }),
            resolveCanonicalSha: () => canonicalSha
        });
        const registryVerification = {
            registry: "registry-1.docker.io",
            repository: "runpod/pytorch",
            tag: "2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
            expectedDigest: "sha256:61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5",
            observedDigest: "sha256:61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5",
            checkedAt: "2026-09-03T00:00:00.000Z",
            status: "REGISTRY_DIGEST_VERIFIED"
        };
        const report = adapter.inspectHuMoZeroCostPrecheck({ registryVerification });
        assert.equal(report.ok, true, JSON.stringify(report));
        assert.equal(report.status, "RUNPOD_HUMO_ZERO_COST_PREFLIGHT_READY");
        assert.equal(report.resourceCreationPossible, false);
        assert.equal(report.inferencePossible, false);
        assert.equal(report.providerTrafficUsed, false);
        assert.equal(providerCalls, 0);
        assert.equal(report.contract.bootstrapPython, "3.11");
        assert.equal(report.contract.bootstrapTorch, "2.5.1");
        assert.equal(report.contract.bootstrapTorchCuda, "12.4");
        assert.equal(report.contract.bootstrapFlashAttention, "2.6.3");
        assert.equal(report.contract.runtimePreflightCertified, false);
        assert.equal(report.physicalRuntimeCertified, false);
        assert.equal(report.paidExecutionAuthorized, false);
        assert.equal(report.portrait.certified, false);
        assert.equal(report.portrait.status, "LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED");
        assert.deepEqual(report.executionBlockers, [
            "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED",
            "RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED"
        ]);

        const lifecycle = adapter.inspectHuMoRemoteLifecyclePlan({ registryVerification });
        assert.equal(lifecycle.ok, true, JSON.stringify(lifecycle));
        assert.equal(lifecycle.status, "RUNPOD_HUMO_REMOTE_LIFECYCLE_READY_BLOCKED");
        assert.equal(lifecycle.resourceCreationPossible, false);
        assert.equal(lifecycle.providerTrafficUsed, false);
        assert.equal(lifecycle.releaseRequired, true);
        assert.equal(lifecycle.lifecycle.kind, "humo");
        assert.equal(lifecycle.lifecycle.cacheRoot, "/workspace/jarvis-v142/cache/humo-1.7b");
        assert.equal(lifecycle.lifecycle.repositoryDir, "/workspace/jarvis-v142/cache/humo-1.7b/HuMo");
        assert.equal(lifecycle.lifecycle.venvDir, "/workspace/jarvis-v142/cache/humo-1.7b/venv");
        assert.equal(lifecycle.lifecycle.provisionImageTag, "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04");
        assert.deepEqual(lifecycle.lifecycle.runnerEnvironment, [
            "JARVIS_HUMO_REPO_DIR",
            "JARVIS_HUMO_WEIGHTS_DIR",
            "JARVIS_HUMO_WAN21_MODEL_DIR",
            "JARVIS_HUMO_WHISPER_DIR",
            "JARVIS_HUMO_AUDIO_SEPARATOR_FILE"
        ]);
        assert.equal(providerCalls, 0);

        const certificationAdapter = createRunpodRemoteVideoAdapter({
            root,
            env: {
                JARVIS_REMOTE_GPU_PROVIDER: "runpod",
                JARVIS_VIDEO_ENGINE_POLICY: "LOCAL_TEST",
                JARVIS_LOCAL_VIDEO_MODEL: "humo",
                JARVIS_RUNPOD_GPU_TYPE_ID: "NVIDIA L40S",
                JARVIS_REMOTE_GPU_HARD_BUDGET_USD: "2",
                JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "false",
                JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true",
                JARVIS_RUNPOD_CANONICAL_SHA: canonicalSha
            },
            fetchImpl: forbiddenNetwork,
            registryFetchImpl: forbiddenNetwork,
            inspectBridgeIdentity: () => ({ ok: true, status: "BRIDGE_IDENTITY_OK" }),
            resolveCanonicalSha: () => canonicalSha
        });
        const certification = certificationAdapter.inspectHuMoRuntimeCertificationPrecheck({
            registryVerification
        });
        assert.equal(certification.ok, true, JSON.stringify(certification));
        assert.equal(certification.status, "RUNPOD_HUMO_RUNTIME_CERTIFICATION_READY_BLOCKED");
        assert.equal(certification.runtimeCertificationOnly, true);
        assert.equal(certification.resourceCreationPossible, false);
        assert.equal(certification.inferencePossible, false);
        assert.equal(certification.providerTrafficUsed, false);
        assert.equal(providerCalls, 0);

        const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");
        assert.equal(engineSource.includes("function writeHuMoRuntimeBootstrapFile("), true);
        assert.equal(engineSource.includes("function remoteHuMoHealth("), true);
        assert.equal(engineSource.includes("assertHuMoPaidExecutionAuthority(job)"), true);
        assert.equal(engineSource.includes("JARVIS_HUMO_REPO_DIR="), true);
        assert.equal(engineSource.includes("JARVIS_HUMO_AUDIO_SEPARATOR_FILE="), true);
        assert.equal(engineSource.includes("writeRemoteRuntimeBootstrapFile(state.bootstrapFile, state)"), true);
        assert.equal(engineSource.includes("RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED"), true);
        assert.equal(engineSource.includes("async function release(receipt = {})"), true);
        const runnerSource = fs.readFileSync(new URL("../scripts/jarvis-local-video-wan22.py", import.meta.url), "utf8");
        const resolveStart = runnerSource.indexOf("def resolve_backend(");
        const resolveEnd = runnerSource.indexOf("def offline_environment(", resolveStart);
        const resolveBlock = runnerSource.slice(resolveStart, resolveEnd);
        assert.equal(resolveBlock.includes('authority.get("physicalRuntimeCertified") is not True'), true);
        assert.equal(resolveBlock.includes('authority.get("paidExecutionAuthorized") is not True'), true);
        assert.equal(resolveBlock.includes('authority.get("physicalPortraitCertified")'), false);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});`
  );
}

assertBaseline();
ensureHuMoRemoteLifecycle();
ensureRegression();
assertBaseline();

const engine = sourceOf("jarvis-local-video-engine.js");
const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
const tests = sourceOf("tests/jarvis-local-video-engine-v142.test.mjs");
for (const [value, marker] of [
  [engine, "function inspectHuMoZeroCostPrecheck("],
  [engine, "RUNPOD_HUMO_ZERO_COST_PREFLIGHT_READY"],
  [engine, "resourceCreationPossible: false"],
  [engine, "function remoteHuMoLifecycleContract("],
  [engine, "function writeHuMoRuntimeBootstrapFile("],
  [engine, "function remoteHuMoHealth("],
  [engine, "RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED"],
  [engine, "JARVIS_HUMO_AUDIO_SEPARATOR_FILE="],
  [runner, 'authority.get("paidExecutionAuthorized") is not True'],
  [tests, "V142 HuMo remote lifecycle is wired but paid execution remains fail-closed"],
  [tests, "RUNPOD_HUMO_REMOTE_LIFECYCLE_READY_BLOCKED"],
  [tests, "RUNPOD_HUMO_RUNTIME_CERTIFICATION_READY_BLOCKED"]
]) {
  if (!value.includes(marker)) throw new Error(`V142_HUMO_ADAPTER_MARKER_MISSING:${marker}`);
}

const runnerResolveStart = runner.indexOf("def resolve_backend(");
const runnerResolveEnd = runner.indexOf("def offline_environment(", runnerResolveStart);
if (runner.slice(runnerResolveStart, runnerResolveEnd).includes('authority.get("physicalPortraitCertified")')) {
  throw new Error("V142_HUMO_LANDSCAPE_PROBE_MUST_NOT_REQUIRE_PORTRAIT_CERTIFICATION");
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_REMOTE_LIFECYCLE_MATERIALIZED",
  humoRemotePrecheck: "read_only",
  providerTrafficUsed: false,
  resourceCreationPossible: false,
  physicalRuntimeCertified: false,
  physicalPortraitCertified: false,
  paidExecutionAuthorized: false,
  paidLaunchBlockedBeforeProviderTraffic: true,
  remoteLifecycle: ["launch", "poll", "release"],
  existingWanLaunchOwnerPreserved: true,
  newFiles: false,
  newBrains: false
}));
