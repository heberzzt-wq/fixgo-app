import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile, execFileSync, spawn } from "node:child_process";

import { registerArtifact } from "./jarvis-artifact-studio.js";

export const JARVIS_LOCAL_VIDEO_ENGINE_VERSION = "1.15.0-v142-single-authority";
export const JARVIS_RUNPOD_ADAPTER_VERSION = "1.8.0-v142-single-authority";
export const VIDEO_ENGINE_MODES = Object.freeze([
    "CURRENT_STABLE",
    "LOCAL_TEST",
    "LOCAL_PREFERRED",
    "LOCAL_ONLY"
]);

const WAN22_TI2V_5B = Object.freeze({
    backend: "wan22-ti2v-5b",
    id: "Wan-AI/Wan2.2-TI2V-5B",
    model: "Wan2.2-TI2V-5B",
    provider: "local",
    license: "Apache-2.0",
    textToVideo: true,
    imageToVideo: true,
    referenceAssets: true,
    maximumReferenceAssets: 1,
    maximumSourceReferenceAssets: 3,
    targetResolution: "720p",
    targetFps: 24,
    portraitSize: Object.freeze({ width: 704, height: 1280 }),
    landscapeSize: Object.freeze({ width: 1280, height: 704 }),
    minimumVramGb: 24,
    checkpointSizeGb: 34.2,
    minimumFreeDiskGb: 45,
    officialRepository: "https://github.com/Wan-Video/Wan2.2",
    officialWeights: "https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B"
});

const WAN21_T2V_1_3B = Object.freeze({
    backend: "wan21-t2v-1.3b",
    id: "Wan-AI/Wan2.1-T2V-1.3B",
    model: "Wan2.1-T2V-1.3B",
    provider: "local",
    license: "Apache-2.0",
    textToVideo: true,
    imageToVideo: false,
    referenceAssets: false,
    maximumReferenceAssets: 0,
    maximumSourceReferenceAssets: 0,
    targetResolution: "480p",
    targetFps: 16,
    portraitSize: Object.freeze({ width: 480, height: 832 }),
    landscapeSize: Object.freeze({ width: 832, height: 480 }),
    minimumVramGb: 8.19,
    checkpointSizeGb: 17.6,
    minimumFreeDiskGb: 25,
    officialRepository: "https://github.com/Wan-Video/Wan2.1",
    officialWeights: "https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B"
});

const RUNPOD_HUMO_IDENTITY_CANDIDATE = Object.freeze({
    id: "humo-1.7b-identity",
    role: "identity_fidelity_candidate",
    sourceRepository: "Phantom-video/HuMo",
    sourceRevision: "845f44736e21be93aa5d8cf406b6eb01af9bff67",
    modelRepository: "bytedance-research/HuMo",
    modelRevision: "3a4a1610d399a5cbb932d54dc229944029803ff7",
    checkpoint: Object.freeze({
        path: "HuMo-1.7B/ema.pth",
        bytes: 7037053233,
        sha256: "04126194caa9820c7294c95e321739575491693f2e97f2f1205cd469cd321332"
    }),
    zeroVae: Object.freeze({
        path: "zero_vae_129frame.pt",
        sha256: "c458d9ea111ea1107a576183cc291daa78fffacbe280967c0a0807fed9200830"
    }),
    wan21Vae: Object.freeze({
        path: "Wan2.1_VAE.pth",
        sha256: "38071ab59bd94681c686fa51d75a1968f64e470262043be31f7a094e442fd981"
    }),
    sharedTextEncoderAuthority: "RUNPOD_WAN22_CACHE_BASE.requiredFiles",
    reuseExistingWan22TextEncoderAuthority: true,
    whisper: Object.freeze({
        repository: "openai/whisper-large-v3",
        revision: "d8411bd4e55c0bca39e60653a0fe26ae8591859a",
        model: Object.freeze({
            path: "model.safetensors",
            bytes: 3087130976,
            sha256: "a8e94b85976e5864ba3e9525c7e6c83b2a1eca42d4b797a0c7c24d778e40fd95"
        }),
        requiredMetadata: Object.freeze([
            "config.json",
            "preprocessor_config.json"
        ])
    }),
    audioSeparator: Object.freeze({
        repository: "bytedance-research/HuMo",
        revision: "3a4a1610d399a5cbb932d54dc229944029803ff7",
        path: "audio_separator/Kim_Vocal_2.onnx",
        bytes: 66759214,
        sha256: "ce74ef3b6a6024ce44211a07be9cf8bc6d87728cc852a68ab34eb8e58cde9c8b"
    }),
    runtimeAssetAuthorityPinned: true,
    officialRuntime: Object.freeze({
        python: "3.11",
        torch: "2.5.1",
        torchCuda: "12.4",
        flashAttention: "2.6.3"
    }),
    remoteRuntimeBase: Object.freeze({
        registry: "registry-1.docker.io",
        repository: "runpod/pytorch",
        tag: "2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
        provisionImageTag: "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
        expectedRegistryDigest: "sha256:61a4aafb0094cd773f11eefa378929d5a687bd775febeb78eac62fc824141fb5",
        basePython: "3.11",
        baseTorch: "2.4.1",
        baseCuda: "12.4.1",
        bootstrapPython: "3.11",
        bootstrapTorch: "2.5.1",
        bootstrapTorchCuda: "12.4",
        bootstrapFlashAttention: "2.6.3",
        runtimePreflightCertified: false
    }),
    targetGpuTypeId: "NVIDIA L40S",
    candidateProbeGeometry: Object.freeze({
        width: 832,
        height: 480,
        fps: 25,
        frames: 97,
        durationSeconds: 3.88,
        orientation: "landscape"
    }),
    portraitTargetUnresolved: true,
    physicalRuntimeCertified: false,
    physicalPortraitCertified: false,
    paidExecutionAuthorized: false
});

const HUMO_IDENTITY_PROBE = Object.freeze({
    backend: "humo-1.7b-identity",
    id: RUNPOD_HUMO_IDENTITY_CANDIDATE.id,
    model: "HuMo-1.7B",
    provider: "local",
    license: null,
    textToVideo: false,
    imageToVideo: true,
    referenceAssets: true,
    maximumReferenceAssets: 3,
    maximumSourceReferenceAssets: 3,
    targetResolution: "832x480-identity-probe",
    targetFps: 25,
    portraitSize: null,
    landscapeSize: Object.freeze({ width: 832, height: 480 }),
    minimumVramGb: 48,
    checkpointSizeGb: 0,
    minimumFreeDiskGb: 60,
    identityOnly: true,
    identityProbeOnly: true,
    remoteModelDirectory: "/workspace/models/HuMo",
    repositoryEntrypoint: "main.py"
});

const UNSUPPORTED_LOCAL_VIDEO_MODEL_PROFILE = Object.freeze({
    backend: null,
    id: null,
    model: null,
    provider: "local",
    license: null,
    textToVideo: false,
    imageToVideo: false,
    referenceAssets: false,
    maximumReferenceAssets: 0,
    targetResolution: null,
    targetFps: 0,
    portraitSize: null,
    landscapeSize: null,
    minimumVramGb: Number.POSITIVE_INFINITY,
    checkpointSizeGb: 0,
    minimumFreeDiskGb: Number.POSITIVE_INFINITY,
    unsupported: true
});

export const LOCAL_VIDEO_MODEL_PROFILES = Object.freeze({
    [WAN22_TI2V_5B.backend]: WAN22_TI2V_5B,
    [WAN21_T2V_1_3B.backend]: WAN21_T2V_1_3B,
    [HUMO_IDENTITY_PROBE.backend]: HUMO_IDENTITY_PROBE
});

// Backward-compatible default. No existing deployment changes model unless explicitly configured.
export const LOCAL_VIDEO_MODEL_PROFILE = WAN22_TI2V_5B;

const LOCAL_VIDEO_MODEL_ALIASES = Object.freeze({
    "wan22": WAN22_TI2V_5B.backend,
    "wan2.2": WAN22_TI2V_5B.backend,
    "wan2.2-ti2v-5b": WAN22_TI2V_5B.backend,
    "wan22-ti2v-5b": WAN22_TI2V_5B.backend,
    "wan21": WAN21_T2V_1_3B.backend,
    "wan2.1": WAN21_T2V_1_3B.backend,
    "wan2.1-t2v-1.3b": WAN21_T2V_1_3B.backend,
    "wan21-t2v-1.3b": WAN21_T2V_1_3B.backend,
    "light": WAN21_T2V_1_3B.backend,
    "local-light": WAN21_T2V_1_3B.backend,
    "humo": HUMO_IDENTITY_PROBE.backend,
    "humo-1.7b": HUMO_IDENTITY_PROBE.backend,
    "humo-1.7b-identity": HUMO_IDENTITY_PROBE.backend
});

const RUNPOD_GIB = 1024 ** 3;
const LOCAL_VIDEO_MAX_SHOT_COUNT = 36;
const LOCAL_VIDEO_MAX_DURATION_SECONDS = 180;
const RUNPOD_MAX_EXPLICIT_HARD_BUDGET_USD = 10;
const RUNPOD_MODEL_EXPECTED_BYTES = 34203123497;
const RUNPOD_WORKSPACE_RESERVE_BYTES = 8 * RUNPOD_GIB;
const RUNPOD_PEAK_WORKSPACE_BYTES = RUNPOD_MODEL_EXPECTED_BYTES + RUNPOD_WORKSPACE_RESERVE_BYTES;

export const RUNPOD_ZERO_COST_PRECHECKS = Object.freeze([
    "canonicalSha",
    "bridgeIdentity",
    "localTestPolicy",
    "wan22Backend",
    "registryImageDigest",
    "modelRevision",
    "requirementsSha256",
    "modelFileManifest",
    "workspaceCapacity",
    "networkVolumeContract",
    "dataCenterCompatibility",
    "explicitGpuRequest",
    "economicBudget",
    "noExternalFallback",
    "referenceAssetIntegrity",
    "durableIdentity",
    "localDuplicateObligation",
    "sanitizedProvisionPayload"
]);

export const RUNPOD_PHYSICAL_PAID_PREFLIGHTS = Object.freeze([
    "physicalSelectedGpu",
    "exactComputeCapability",
    "cuda",
    "python312",
    "torch28Cu128",
    "ffmpeg",
    "flashAttention",
    "flashAttentionCudaOperation",
    "pythonImports",
    "pipCheck",
    "cudaOperation",
    "wanGenerateHelp",
    "mountedCache",
    "physicalModelIntegrity"
]);

const RUNPOD_WAN22_CACHE_BASE = Object.freeze({
    cloudType: "SECURE",
    registry: "registry-1.docker.io",
    repository: "runpod/pytorch",
    tag: "1.0.2-cu1281-torch280-ubuntu2404",
    provisionImageTag: "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404",
    expectedRegistryDigest: "sha256:0a360022e8de4375af99430f84e8b38951acc397252163a37ceac7204d01be35",
    runtimeIdentity: Object.freeze({
        operatingSystem: "ubuntu-24.04",
        pythonVersionPrefix: "3.12.",
        torchVersionPrefix: "2.8.0+cu128",
        torchCudaVersionPrefix: "12.8",
        ffmpegRequired: true,
        nvccRequired: false,
        flashAttentionCudaRequired: true
    }),
    pythonVersionPrefix: "3.12.",
    torchVersionPrefix: "2.8.0+cu128",
    torchCudaVersionPrefix: "12.8",
    requirementsSha256: "8338a62490c93cfbf908bb289bbaa3fb104e5606415bb48cca6cae5175313c44",
    runtimeRequirements: Object.freeze({
        einops: "0.8.1",
        decord: "0.6.0",
        librosa: "0.11.0",
        peft: "0.17.1"
    }),
    flashAttentionVersion: "2.8.3.post1",
    flashAttentionWheels: Object.freeze({
        FALSE: Object.freeze({
            fileName: "flash_attn-2.8.3.post1+cu12torch2.8cxx11abiFALSE-cp312-cp312-linux_x86_64.whl",
            url: "https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3.post1/flash_attn-2.8.3.post1%2Bcu12torch2.8cxx11abiFALSE-cp312-cp312-linux_x86_64.whl",
            sha256: "3a22801651c027c058f0f36d49a176736bb06b3a16558241f89170f46c300b90"
        }),
        TRUE: Object.freeze({
            fileName: "flash_attn-2.8.3.post1+cu12torch2.8cxx11abiTRUE-cp312-cp312-linux_x86_64.whl",
            url: "https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3.post1/flash_attn-2.8.3.post1%2Bcu12torch2.8cxx11abiTRUE-cp312-cp312-linux_x86_64.whl",
            sha256: "9a08775a6be3358e3b691ed97f7cb90ad4e9eb6a912e8bce680c2edb7cf3d86e"
        })
    }),
    modelRepository: "Wan-AI/Wan2.2-TI2V-5B",
    modelRevision: "921dbaf3f1674a56f47e83fb80a34bac8a8f203e",
    wanRepositoryRevision: "42bf4cfaa384bc21833865abc2f9e6c0e67233dc",
    expectedModelBytes: RUNPOD_MODEL_EXPECTED_BYTES,
    requiredRuntimeModelBytes: 34201521212,
    workspaceReserveBytes: RUNPOD_WORKSPACE_RESERVE_BYTES,
    peakWorkspaceBytes: RUNPOD_PEAK_WORKSPACE_BYTES,
    networkVolumeType: "STANDARD",
    minimumNetworkVolumeGb: 50,
    minimumVramGb: 48,
    minimumRamGb: 62,
    minimumVcpu: 16,
    requiredFiles: Object.freeze([
        Object.freeze({ path: "Wan2.2_VAE.pth", bytes: 2818839170, sha256: "20eb789667fa5e60e7516bf509512f6cb61f01b0aa0695eadaea930c13892b36" }),
        Object.freeze({ path: "config.json", bytes: 251, sha256: "d1fea36899d00c2501b836c13ad65af56e2f9529ba622e50886d3f5c3e6c02bc" }),
        Object.freeze({ path: "configuration.json", bytes: 43, sha256: "a6b66993e9da0feaba8d42d06b21ad9cfaf7d8b591f32fd639ae35b7f5d2d859" }),
        Object.freeze({ path: "diffusion_pytorch_model-00001-of-00003.safetensors", bytes: 9825014472, sha256: "720b06c4ade5e87c1246bba8ac95b664c638749cd9b102cf84d823bb44c026a1" }),
        Object.freeze({ path: "diffusion_pytorch_model-00002-of-00003.safetensors", bytes: 9995661736, sha256: "09ec5ef720d8396f6cfa51fbdcbdb2327e37722afd6e89fd38f1e7e5e782c283" }),
        Object.freeze({ path: "diffusion_pytorch_model-00003-of-00003.safetensors", bytes: 178558176, sha256: "6306f7894c345de9093ad588771c2abfaeb668a81f7a6d9a918bd26ba3568e49" }),
        Object.freeze({ path: "diffusion_pytorch_model.safetensors.index.json", bytes: 72865, sha256: "bfa2337f1163e195d24151a72298daf34a620543898109be47e414c8daa5b3fe" }),
        Object.freeze({ path: "google/umt5-xxl/special_tokens_map.json", bytes: 6623, sha256: "7b8a9f5040adb67b5805abdfd42c1f8d0f3d0e711f10726580eb3789cd0ad61d" }),
        Object.freeze({ path: "google/umt5-xxl/spiece.model", bytes: 4548313, sha256: "e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458" }),
        Object.freeze({ path: "google/umt5-xxl/tokenizer.json", bytes: 16837417, sha256: "6e197b4d3dbd71da14b4eb255f4fa91c9c1f2068b20a2de2472967ca3d22602b" }),
        Object.freeze({ path: "google/umt5-xxl/tokenizer_config.json", bytes: 61728, sha256: "ed9a3a8b0faa71a70a32847e0435fe036e6e112d4df4edb7bb48a921e344dc05" }),
        Object.freeze({ path: "models_t5_umt5-xxl-enc-bf16.pth", bytes: 11361920418, sha256: "7cace0da2b446bbbbc57d031ab6cf163a3d59b366da94e5afe36745b746fd81d" })
    ])
});

export const RUNPOD_WAN22_GPU_PROFILES = Object.freeze({
    "NVIDIA L40S": Object.freeze({
        ...RUNPOD_WAN22_CACHE_BASE,
        gpuTypeId: "NVIDIA L40S",
        profile: "wan22-ti2v-5b-l40s",
        computeCapability: "8.9",
        runtimePreflightCertified: true,
        expectedTotalHourlyRateUsd: 0.99,
    }),
    "NVIDIA A40": Object.freeze({
        ...RUNPOD_WAN22_CACHE_BASE,
        gpuTypeId: "NVIDIA A40",
        profile: "wan22-ti2v-5b-a40",
        computeCapability: "8.6",
        runtimePreflightCertified: false,
        expectedTotalHourlyRateUsd: 0.46
    })
});

const RUNPOD_CPU_SSH_STARTUP_SCRIPT = [
    "set -euo pipefail",
    "export DEBIAN_FRONTEND=noninteractive",
    "apt-get update",
    "apt-get install -y --no-install-recommends openssh-server ca-certificates",
    "mkdir -p /run/sshd /root/.ssh",
    'test -n "${PUBLIC_KEY:-}"',
    'printf "%s\\n" "$PUBLIC_KEY" > /root/.ssh/authorized_keys',
    "chmod 700 /root/.ssh",
    "chmod 600 /root/.ssh/authorized_keys",
    "ssh-keygen -A",
    "exec /usr/sbin/sshd -D -e"
].join("\n");

const RUNPOD_BOOTSTRAP_PHASES = Object.freeze({
    CPU_MODEL_STAGING: "CPU_MODEL_STAGING_BOOTSTRAP",
    GPU_RUNTIME: "GPU_RUNTIME_BOOTSTRAP"
});

const RUNPOD_CPU_MODEL_STAGING_PACKAGES = Object.freeze([
    "ca-certificates",
    "git",
    "python3",
    "python3-venv",
    "python3-pip"
]);

export const RUNPOD_CPU_STAGING_PROFILE = Object.freeze({
    cloudType: "SECURE",
    computeType: "CPU",
    cpuFlavorId: "cpu3c",
    cpuFlavorPriority: "custom",
    dataCenterId: "EU-NL-1",
    dataCenterPriority: "custom",
    registry: "registry-1.docker.io",
    repository: "library/ubuntu",
    tag: "22.04",
    provisionImageTag: "ubuntu:22.04",
    expectedRegistryDigest: "sha256:2edbbc5dc405e9612ba3584ce95480277e3eb374407b5505fe26f17df77c7dbc",
    officialImageSource: "https://github.com/runpod/runpod-plugins-official/blob/main/plugins/runpod/skills/runpodctl/SKILL.md",
    minimumVcpu: 2,
    supportedVcpuCounts: Object.freeze([1, 2, 4, 8]),
    ramGbPerVcpu: 2,
    ramGb: 4,
    containerDiskInGb: 20,
    maximumContainerDiskGb: 20,
    dockerStartCmd: Object.freeze([
        "bash",
        "-lc",
        RUNPOD_CPU_SSH_STARTUP_SCRIPT
    ]),
    interruptible: false,
    ports: Object.freeze(["22/tcp"]),
    supportPublicIp: true,
    networkVolumeType: RUNPOD_WAN22_CACHE_BASE.networkVolumeType,
    minimumNetworkVolumeGb: RUNPOD_WAN22_CACHE_BASE.minimumNetworkVolumeGb,
    networkVolumeMountPath: "/workspace",
    cacheStatus: "CACHE_MODEL_READY",
    runtimeStatus: "CACHE_RUNTIME_PHYSICALLY_UNVERIFIED",
    bootstrapPhase: RUNPOD_BOOTSTRAP_PHASES.CPU_MODEL_STAGING,
    bootstrapPackages: RUNPOD_CPU_MODEL_STAGING_PACKAGES,
    maximumBootstrapCacheStatus: "CACHE_MODEL_READY",
    startupContract: Object.freeze({
        requiredEnvironment: Object.freeze(["PUBLIC_KEY"]),
        persistentProcess: "/usr/sbin/sshd -D -e",
        sshPort: "22/tcp",
        minimumStableEndpointPolls: 2,
        readinessTimeoutSeconds: 600
    }),
    runtimeIdentity: Object.freeze({
        operatingSystem: "ubuntu-22.04",
        mountPath: "/workspace",
        caCertificatesRequired: true,
        requiredCommands: Object.freeze([
            "bash",
            "sshd"
        ]),
        bootstrapRequiredCommands: Object.freeze([
            "git",
            "python3",
            "hf",
            "sha256sum"
        ]),
        forbiddenTools: Object.freeze([
            "cuda",
            "pytorch-cuda",
            "nvcc",
            "flash-attention"
        ])
    }),
    allowedStages: Object.freeze([
        "git",
        "hf_download",
        "model_sha256_verification",
        "repository_revision_verification",
        "model_manifest_write"
    ]),
    forbiddenCertifications: Object.freeze([
        "cuda",
        "nvcc",
        "pytorch_cuda",
        "flash_attention_cuda",
        "compute_capability",
        "wan_generate_runtime",
        "CACHE_READY",
        "CACHE_HIT"
    ])
});

export const EXTERNAL_VIDEO_PRICING_PROFILE = Object.freeze({
    provider: "google-veo",
    model: "veo-3.1-generate-001",
    resolution: "720p",
    audioIncluded: true,
    initialSegmentSeconds: 8,
    extensionSegmentSeconds: 7,
    maximumSegmentCount: 4,
    usdPerSecond: 0.40,
    currency: "USD",
    pricingSource: "https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing"
});

function booleanValue(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function finiteBudget(value, fallback = Number.POSITIVE_INFINITY) {
    if (value === undefined || value === null || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function localVideoTimeoutSeconds(env = process.env) {
    const configured = Number(env.JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS || 7200);
    if (!Number.isFinite(configured) || configured <= 0) return 7200;
    return Math.min(Math.max(configured, 30), 86400);
}

function normalizedMode(value) {
    const mode = String(value || "LOCAL_PREFERRED").trim().toUpperCase();
    return VIDEO_ENGINE_MODES.includes(mode) ? mode : "LOCAL_PREFERRED";
}

function budgetConfigured(value) {
    if (value === undefined || value === null || value === "") return false;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0;
}

export function estimateExternalVideoGeneration({
    segmentCount,
    model = EXTERNAL_VIDEO_PRICING_PROFILE.model,
    resolution = EXTERNAL_VIDEO_PRICING_PROFILE.resolution,
    audioIncluded = EXTERNAL_VIDEO_PRICING_PROFILE.audioIncluded
} = {}) {
    const count = Number(segmentCount);
    if (
        model !== EXTERNAL_VIDEO_PRICING_PROFILE.model ||
        resolution !== EXTERNAL_VIDEO_PRICING_PROFILE.resolution ||
        audioIncluded !== true
    ) {
        return {
            ok: false,
            status: "EXTERNAL_VIDEO_PRICING_PROFILE_UNSUPPORTED",
            error: "EXTERNAL_VIDEO_PRICING_PROFILE_UNSUPPORTED",
            externalApiUsed: false,
            externalEstimatedCostUsd: 0,
            model,
            resolution,
            audioIncluded
        };
    }
    if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > EXTERNAL_VIDEO_PRICING_PROFILE.maximumSegmentCount
    ) {
        return {
            ok: false,
            status: "EXTERNAL_VIDEO_SEGMENT_PLAN_INVALID",
            error: "EXTERNAL_VIDEO_SEGMENT_PLAN_INVALID",
            externalApiUsed: false,
            externalEstimatedCostUsd: 0,
            segmentCount
        };
    }
    const plannedDurationSeconds =
        EXTERNAL_VIDEO_PRICING_PROFILE.initialSegmentSeconds +
        Math.max(0, count - 1) * EXTERNAL_VIDEO_PRICING_PROFILE.extensionSegmentSeconds;
    const externalEstimatedCostUsd = Number(
        (plannedDurationSeconds * EXTERNAL_VIDEO_PRICING_PROFILE.usdPerSecond).toFixed(2)
    );
    return {
        ok: true,
        status: "EXTERNAL_VIDEO_COST_ESTIMATED",
        provider: EXTERNAL_VIDEO_PRICING_PROFILE.provider,
        model: EXTERNAL_VIDEO_PRICING_PROFILE.model,
        resolution: EXTERNAL_VIDEO_PRICING_PROFILE.resolution,
        audioIncluded: true,
        segmentCount: count,
        plannedDurationSeconds,
        usdPerSecond: EXTERNAL_VIDEO_PRICING_PROFILE.usdPerSecond,
        currency: EXTERNAL_VIDEO_PRICING_PROFILE.currency,
        pricingSource: EXTERNAL_VIDEO_PRICING_PROFILE.pricingSource,
        externalApiUsed: false,
        externalEstimatedCostUsd
    };
}

function requestedLocalModel(env = process.env) {
    return String(
        env.JARVIS_LOCAL_VIDEO_MODEL ||
        env.JARVIS_LOCAL_VIDEO_BACKEND ||
        "auto"
    ).trim().toLowerCase();
}

export function resolveLocalVideoModelProfile({ env = process.env, hardware = null } = {}) {
    const requested = requestedLocalModel(env);
    if (requested === "auto") {
        if (hardware) {
            const vramGb = Number(hardware.vramGb || 0);
            const freeDiskGb = Number(hardware.freeDiskGb || 0);
            const candidates = [WAN22_TI2V_5B, WAN21_T2V_1_3B];
            const compatible = candidates.find(profile =>
                hardware.cudaAvailable !== false &&
                vramGb >= profile.minimumVramGb &&
                freeDiskGb >= profile.minimumFreeDiskGb
            );
            if (compatible) return compatible;
            const vramCompatible = candidates.find(profile =>
                hardware.cudaAvailable !== false && vramGb >= profile.minimumVramGb
            );
            if (vramCompatible) return vramCompatible;
        }
        return LOCAL_VIDEO_MODEL_PROFILE;
    }
    const backend = LOCAL_VIDEO_MODEL_ALIASES[requested] || requested;
    const profile = LOCAL_VIDEO_MODEL_PROFILES[backend];
    if (profile) return profile;
    return Object.freeze({
        ...UNSUPPORTED_LOCAL_VIDEO_MODEL_PROFILE,
        requestedBackend: backend
    });
}

export function describeLocalVideoPolicy(env = process.env) {
    const mode = normalizedMode(env.JARVIS_VIDEO_ENGINE_POLICY);
    const externalBudgetConfigured = [
        env.JARVIS_EXTERNAL_BUDGET_USD_PER_OPERATION,
        env.JARVIS_EXTERNAL_BUDGET_USD_PER_EPISODE,
        env.JARVIS_EXTERNAL_BUDGET_USD_PER_DAY
    ].every(budgetConfigured);
    return {
        version: JARVIS_LOCAL_VIDEO_ENGINE_VERSION,
        mode,
        localVideoEnabled: booleanValue(
            env.JARVIS_LOCAL_VIDEO_ENABLED,
            mode !== "CURRENT_STABLE"
        ),
        localImageEnabled: booleanValue(env.JARVIS_LOCAL_IMAGE_ENABLED, false),
        localSpeechEnabled: booleanValue(env.JARVIS_LOCAL_SPEECH_ENABLED, false),
        localVideoCertified: booleanValue(env.JARVIS_LOCAL_VIDEO_CERTIFIED, false),
        localVideoModel: requestedLocalModel(env),
        externalFallbackEnabled: booleanValue(env.JARVIS_EXTERNAL_FALLBACK_ENABLED, true),
        externalBudgetUsdPerOperation: mode === "LOCAL_TEST"
            ? 0
            : finiteBudget(env.JARVIS_EXTERNAL_BUDGET_USD_PER_OPERATION, 0),
        externalBudgetUsdPerEpisode: mode === "LOCAL_TEST"
            ? 0
            : finiteBudget(env.JARVIS_EXTERNAL_BUDGET_USD_PER_EPISODE, 0),
        externalBudgetUsdPerDay: mode === "LOCAL_TEST"
            ? 0
            : finiteBudget(env.JARVIS_EXTERNAL_BUDGET_USD_PER_DAY, 0),
        externalBudgetConfigured: mode !== "LOCAL_TEST" && externalBudgetConfigured,
        externalPricing: EXTERNAL_VIDEO_PRICING_PROFILE,
        defaultIsCurrentStable: false,
        defaultMode: "LOCAL_PREFERRED",
        promptRoutingAllowed: false
    };
}

const LOCAL_VIDEO_BACKEND_ORDER = Object.freeze([
    WAN22_TI2V_5B.backend,
    WAN21_T2V_1_3B.backend
]);

function orderedBackendHealth(health = {}) {
    if (Array.isArray(health?.backends)) {
        const reported = health.backends
            .filter(item => item && typeof item === "object");
        const byBackend = new Map(
            reported.map(item => [String(item.backend || ""), item])
        );
        const ordered = LOCAL_VIDEO_BACKEND_ORDER
            .map(backend => byBackend.get(backend))
            .filter(Boolean);
        const orderedBackends = new Set(
            ordered.map(item => String(item.backend || ""))
        );
        return [
            ...ordered,
            ...reported.filter(item =>
                String(item.backend || "") &&
                !orderedBackends.has(String(item.backend || ""))
            )
        ];
    }
    const model = health?.model || health?.modelRequirements || null;
    const backend = health?.selectedBackend || model?.backend || null;
    return backend
        ? [{
            ...health,
            backend,
            model: model?.model || health?.model || null,
            imageToVideo: model?.imageToVideo === true,
            maximumReferenceAssets: Number(model?.maximumReferenceAssets || 0),
            maximumSourceReferenceAssets: Number(model?.maximumSourceReferenceAssets ?? model?.maximumReferenceAssets ?? 0)
        }]
        : [];
}

function backendRequirementFailure(backend = {}, requirements = {}) {
    const referenceCount = Math.max(0, Number(requirements.referenceCount || 0));
    const requiresImageToVideo = requirements.requiresImageToVideo === true || referenceCount > 0;
    const requiresIdentityFidelity = requirements.requiresIdentityFidelity === true;
    const runtimeCertificationOnly = requirements.runtimeCertificationOnly === true;
    if (backend.backend === HUMO_IDENTITY_PROBE.backend && !runtimeCertificationOnly) {
        if (!requiresIdentityFidelity || referenceCount < 1) {
            return "LOCAL_VIDEO_HUMO_IDENTITY_REQUIRED";
        }
        if (String(requirements.aspectRatio || "") !== "16:9") {
            return "LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED";
        }
        if (
            RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true ||
            RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true
        ) {
            return "LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED";
        }
    }
    else if (requiresIdentityFidelity && referenceCount > 0) {
        return "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED";
    }
    if (requiresImageToVideo && backend.imageToVideo !== true) {
        return "LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND";
    }
    if (referenceCount > Number(
        backend.maximumSourceReferenceAssets ?? backend.maximumReferenceAssets ?? 0
    )) {
        return "LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED";
    }
    return null;
}

function backendFailureReason(attempts = [], fallback = "LOCAL_VIDEO_WORKER_UNAVAILABLE") {
    if (attempts.length === 0) return fallback;
    return `LOCAL_VIDEO_BACKENDS_UNAVAILABLE:${attempts
        .map(item => `${item.backend}=${item.reason}`)
        .join(";")}`;
}

export function resolveVideoEngine({ policy, health, requirements = {} } = {}) {
    const effectivePolicy = policy || describeLocalVideoPolicy();
    const mode = normalizedMode(effectivePolicy.mode);
    const referenceCount = Math.max(0, Number(requirements.referenceCount || 0));
    const requiresImageToVideo = requirements.requiresImageToVideo === true || referenceCount > 0;
    const requiresIdentityFidelity = requirements.requiresIdentityFidelity === true;
    const excludedBackends = new Set(
        (Array.isArray(requirements.excludedBackends) ? requirements.excludedBackends : [])
            .map(String)
            .filter(Boolean)
    );
    const requestedBackend = String(requirements.selectedBackend || "").trim();
    const candidates = orderedBackendHealth(health).filter(candidate =>
        !requestedBackend || candidate.backend === requestedBackend
    );
    const attempts = [];
    let selected = null;
    for (const candidate of candidates) {
        let reason = null;
        if (excludedBackends.has(candidate.backend)) {
            reason = requirements.backendFailures?.[candidate.backend] ||
                "LOCAL_VIDEO_BACKEND_EXCLUDED_AFTER_RECOVERABLE_FAILURE";
        }
        else if (effectivePolicy.localVideoEnabled !== true) {
            reason = "LOCAL_VIDEO_DISABLED";
        }
        else if (candidate.ok !== true) {
            reason = candidate.status || "LOCAL_VIDEO_WORKER_UNAVAILABLE";
        }
        else if (
            mode !== "LOCAL_TEST" &&
            candidate.certified !== true &&
            effectivePolicy.localVideoCertified !== true
        ) {
            reason = "LOCAL_VIDEO_NOT_CERTIFIED";
        }
        else {
            reason = backendRequirementFailure(candidate, requirements);
        }
        if (!reason) {
            selected = candidate;
            break;
        }
        attempts.push({ backend: candidate.backend, reason });
    }
    const legacyReason = candidates.length === 0
        ? (health?.status || "LOCAL_VIDEO_WORKER_UNAVAILABLE")
        : null;
    const unavailableReason = attempts.length === 1 && /^RUNPOD_[A-Z0-9_]+$/.test(String(attempts[0].reason || ""))
        ? attempts[0].reason
        : backendFailureReason(attempts, legacyReason || "LOCAL_VIDEO_WORKER_UNAVAILABLE");
    const base = {
        policy: mode,
        engineRequested: mode,
        referenceCount,
        requiresImageToVideo,
        requiresIdentityFidelity,
        aspectRatio: requirements.aspectRatio || null,
        sceneCount: Math.max(0, Number(requirements.sceneCount || 0)),
        seriesId: requirements.seriesId || null,
        episodeId: requirements.episodeId || null,
        attemptedLocalBackends: attempts,
        externalFallbackEnabled: effectivePolicy.externalFallbackEnabled === true,
        fallbackUsed: false,
        fallbackReason: null,
        externalApiUsed: false,
        externalEstimatedCostUsd: 0
    };

    if (mode === "CURRENT_STABLE") {
        return {
            ...base,
            ok: true,
            status: "VIDEO_ENGINE_CURRENT_STABLE",
            engineUsed: "external",
            provider: "google-veo",
            selectedBackend: "google-veo",
            selectedModel: null,
            imageToVideoSupported: true,
            maximumReferenceAssets: 3
        };
    }

    if (mode === "LOCAL_TEST" || mode === "LOCAL_ONLY") {
        if (!selected) {
            return {
                ...base,
                ok: false,
                status: unavailableReason,
                error: unavailableReason,
                engineUsed: null,
                provider: null,
                selectedBackend: null,
                selectedModel: null,
                imageToVideoSupported: false,
                maximumReferenceAssets: 0,
                retryable: false
            };
        }
        return {
            ...base,
            ok: true,
            status: mode === "LOCAL_TEST"
                ? "VIDEO_ENGINE_LOCAL_TEST"
                : "VIDEO_ENGINE_LOCAL_ONLY",
            engineUsed: "local",
            provider: "local",
            selectedBackend: selected.backend,
            selectedModel: selected.model,
            imageToVideoSupported: selected.imageToVideo === true,
            maximumReferenceAssets: Number(selected.maximumReferenceAssets || 0)
        };
    }

    if (selected) {
        return {
            ...base,
            ok: true,
            status: "VIDEO_ENGINE_LOCAL_PREFERRED",
            engineUsed: "local",
            provider: "local",
            selectedBackend: selected.backend,
            selectedModel: selected.model,
            imageToVideoSupported: selected.imageToVideo === true,
            maximumReferenceAssets: Number(selected.maximumReferenceAssets || 0)
        };
    }
    if (effectivePolicy.externalFallbackEnabled === true) {
        return {
            ...base,
            ok: true,
            status: "VIDEO_ENGINE_EXTERNAL_FALLBACK",
            engineUsed: "external",
            provider: "google-veo",
            selectedBackend: "google-veo",
            selectedModel: null,
            imageToVideoSupported: true,
            maximumReferenceAssets: 3,
            fallbackUsed: true,
            fallbackReason: unavailableReason
        };
    }
    return {
        ...base,
        ok: false,
        status: unavailableReason,
        error: unavailableReason,
        engineUsed: null,
        provider: null,
        selectedBackend: null,
        selectedModel: null,
        imageToVideoSupported: false,
        maximumReferenceAssets: 0,
        retryable: false
    };
}

export function resolveLocalExecutable(command, env = process.env) {
    const candidate = String(command || "").trim();
    if (!candidate) return null;
    if (path.isAbsolute(candidate)) return fs.existsSync(candidate) ? candidate : null;
    const extensions = process.platform === "win32"
        ? String(env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
        : [""];
    for (const directory of String(env.PATH || "").split(path.delimiter).filter(Boolean)) {
        for (const extension of extensions) {
            const target = path.join(directory, `${candidate}${extension}`);
            if (fs.existsSync(target)) return target;
        }
    }
    return null;
}

export function resolveLocalVideoInspectionExecutable(hardware = {}, env = process.env) {
    const reported = typeof hardware?.ffprobe === "string"
        ? hardware.ffprobe.trim()
        : "";
    return reported || resolveLocalExecutable(env.JARVIS_FFPROBE_PATH || "ffprobe", env);
}

const commandPath = resolveLocalExecutable;

function offlineLocalVideoEnvironment(env = process.env) {
    const sanitized = { ...env };
    for (const key of [
        "DASHSCOPE_API_KEY",
        "GOOGLE_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "AZURE_OPENAI_API_KEY",
        "HF_TOKEN",
        "HUGGING_FACE_HUB_TOKEN"
    ]) {
        delete sanitized[key];
    }
    return {
        ...sanitized,
        JARVIS_LOCAL_VIDEO_EXTERNAL_API_ALLOWED: "false",
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        WANDB_MODE: "offline"
    };
}

function diskFreeGb(root) {
    try {
        const stat = fs.statfsSync(path.resolve(root));
        return Number(stat.bavail * stat.bsize) / (1024 ** 3);
    }
    catch {
        return 0;
    }
}

export function inspectLocalVideoHardware({ root = process.cwd(), env = process.env } = {}) {
    const nvidiaSmi = commandPath(env.JARVIS_NVIDIA_SMI_PATH || "nvidia-smi", env);
    let gpuName = null;
    let gpuIndex = null;
    let driver = null;
    let vramGb = 0;
    let gpuInventory = [];
    if (nvidiaSmi) {
        try {
            gpuInventory = execFileSync(nvidiaSmi, [
                "--query-gpu=index,name,memory.total,driver_version",
                "--format=csv,noheader,nounits"
            ], { encoding: "utf8", windowsHide: true, timeout: 10000 })
                .split(/\r?\n/)
                .map(value => value.trim())
                .filter(Boolean)
                .map(raw => {
                    const [index, name, memoryMb, driverVersion] = raw
                        .split(",")
                        .map(value => value.trim());
                    return {
                        index: Number(index),
                        name: name || null,
                        memoryMb: Number(memoryMb || 0),
                        vramGb: Number(memoryMb || 0) / 1024,
                        driver: driverVersion || null
                    };
                })
                .filter(item =>
                    Number.isInteger(item.index) &&
                    Number.isFinite(item.vramGb) &&
                    item.vramGb > 0
                )
                .sort((left, right) =>
                    right.vramGb - left.vramGb || left.index - right.index
                );
            const selected = gpuInventory[0] || null;
            gpuIndex = selected?.index ?? null;
            gpuName = selected?.name || null;
            vramGb = Number(selected?.vramGb || 0);
            driver = selected?.driver || null;
        }
        catch {}
    }
    const ffmpeg = commandPath(env.JARVIS_FFMPEG_PATH || "ffmpeg", env);
    const ffprobe = commandPath(env.JARVIS_FFPROBE_PATH || "ffprobe", env);
    const python = commandPath(env.JARVIS_LOCAL_VIDEO_RUNNER || "python", env);
    const docker = commandPath("docker", env);
    const wsl = commandPath("wsl", env);
    const freeDiskGb = diskFreeGb(root);
    const cudaAvailable = gpuInventory.length > 0 && vramGb > 0;
    const model = resolveLocalVideoModelProfile({
        env,
        hardware: { cudaAvailable, vramGb, freeDiskGb }
    });
    const backendSupported = model.unsupported !== true;
    const ready = backendSupported &&
        cudaAvailable &&
        vramGb >= model.minimumVramGb &&
        freeDiskGb >= model.minimumFreeDiskGb &&
        Boolean(ffmpeg) && Boolean(ffprobe);
    const blockingReasons = [];
    if (!backendSupported) blockingReasons.push("LOCAL_VIDEO_BACKEND_UNSUPPORTED");
    if (!cudaAvailable) blockingReasons.push("LOCAL_VIDEO_CUDA_UNAVAILABLE");
    if (backendSupported && vramGb < model.minimumVramGb) blockingReasons.push("LOCAL_VIDEO_VRAM_INSUFFICIENT");
    if (backendSupported && freeDiskGb < model.minimumFreeDiskGb) blockingReasons.push("LOCAL_VIDEO_DISK_INSUFFICIENT");
    if (!ffmpeg || !ffprobe) blockingReasons.push("LOCAL_VIDEO_FFMPEG_UNAVAILABLE");
    let status = "LOCAL_VIDEO_HARDWARE_READY";
    if (!backendSupported) status = "LOCAL_VIDEO_BACKEND_UNSUPPORTED";
    else if (!cudaAvailable) status = "LOCAL_VIDEO_CUDA_UNAVAILABLE";
    else if (vramGb < model.minimumVramGb) status = "LOCAL_VIDEO_VRAM_INSUFFICIENT";
    else if (freeDiskGb < model.minimumFreeDiskGb) status = "LOCAL_VIDEO_DISK_INSUFFICIENT";
    else if (!ffmpeg || !ffprobe) status = "LOCAL_VIDEO_FFMPEG_UNAVAILABLE";
    return {
        ok: ready,
        status,
        gpuName,
        gpuIndex,
        gpuInventory,
        driver,
        cudaAvailable,
        vramGb: Number(vramGb.toFixed(2)),
        freeDiskGb: Number(freeDiskGb.toFixed(2)),
        ffmpegAvailable: Boolean(ffmpeg),
        ffprobeAvailable: Boolean(ffprobe),
        ffmpeg,
        ffprobe,
        pythonAvailable: Boolean(python),
        python,
        nodeAvailable: true,
        nodeVersion: process.version,
        wslCommandAvailable: Boolean(wsl),
        dockerAvailable: Boolean(docker),
        blockingReasons,
        cpu: os.cpus()[0]?.model || null,
        cpuLogicalCores: os.cpus().length,
        ramGb: Number((os.totalmem() / (1024 ** 3)).toFixed(2)),
        platform: process.platform,
        requestedModel: requestedLocalModel(env),
        selectedBackend: backendSupported ? model.backend : null,
        modelRequirements: model
    };
}

function compatibleModelProfiles(hardware = {}) {
    const vramGb = Number(hardware.vramGb || 0);
    const freeDiskGb = Number(hardware.freeDiskGb || 0);
    return Object.values(LOCAL_VIDEO_MODEL_PROFILES).map(profile => ({
        backend: profile.backend,
        model: profile.model,
        compatible: hardware.cudaAvailable !== false &&
            vramGb >= profile.minimumVramGb &&
            freeDiskGb >= profile.minimumFreeDiskGb,
        minimumVramGb: profile.minimumVramGb,
        minimumFreeDiskGb: profile.minimumFreeDiskGb,
        targetResolution: profile.targetResolution,
        targetFps: profile.targetFps,
        maximumReferenceAssets: profile.maximumReferenceAssets,
        imageToVideo: profile.imageToVideo
    }));
}

const LOCAL_VIDEO_BACKEND_ENVIRONMENT = Object.freeze({
    [WAN22_TI2V_5B.backend]: Object.freeze({
        modelDirectory: "JARVIS_WAN22_MODEL_DIR",
        repositoryDirectory: "JARVIS_WAN22_REPO_DIR",
        certified: "JARVIS_WAN22_CERTIFIED"
    }),
    [WAN21_T2V_1_3B.backend]: Object.freeze({
        modelDirectory: "JARVIS_WAN21_MODEL_DIR",
        repositoryDirectory: "JARVIS_WAN21_REPO_DIR",
        certified: "JARVIS_WAN21_CERTIFIED"
    }),
    [HUMO_IDENTITY_PROBE.backend]: Object.freeze({
        modelDirectory: "JARVIS_HUMO_WEIGHTS_DIR",
        repositoryDirectory: "JARVIS_HUMO_REPO_DIR",
        certified: "JARVIS_HUMO_CERTIFIED"
    })
});

function containsModelWeights(directory, depth = 0) {
    if (!directory || !fs.existsSync(directory) || depth > 3) return false;
    let entries;
    try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
    }
    catch {
        return false;
    }
    for (const entry of entries.slice(0, 500)) {
        if (entry.isFile() && /\.(?:safetensors|bin|pt|pth|ckpt)$/i.test(entry.name)) return true;
        if (entry.isDirectory() && containsModelWeights(path.join(directory, entry.name), depth + 1)) return true;
    }
    return false;
}

function localBackendHealth({ profile, hardware, policy, env }) {
    const configuration = LOCAL_VIDEO_BACKEND_ENVIRONMENT[profile.backend];
    const explicitlyRequested = requestedLocalModel(env) !== "auto";
    const legacyConfiguration = (
        explicitlyRequested &&
        resolveLocalVideoModelProfile({ env, hardware }).backend === profile.backend
    ) || (
        !explicitlyRequested &&
        profile.backend === WAN22_TI2V_5B.backend &&
        Boolean(env.JARVIS_LOCAL_VIDEO_MODEL_DIR) &&
        !env[configuration.modelDirectory]
    );
    const configuredModelDirectory = env[configuration.modelDirectory] ||
        (legacyConfiguration ? env.JARVIS_LOCAL_VIDEO_MODEL_DIR : null);
    const configuredRepositoryDirectory = env[configuration.repositoryDirectory] || null;
    const remoteExecution = String(env.JARVIS_LOCAL_VIDEO_EXECUTION_TARGET || "local")
        .trim().toLowerCase() === "remote";
    const modelDirectory = configuredModelDirectory
        ? path.resolve(String(configuredModelDirectory))
        : (remoteExecution
            ? (profile.remoteModelDirectory || "/workspace/models/Wan2.2-TI2V-5B")
            : null);
    const repositoryDirectory = configuredRepositoryDirectory
        ? path.resolve(String(configuredRepositoryDirectory))
        : null;
    const runner = remoteExecution
        ? "python3"
        : commandPath(env.JARVIS_LOCAL_VIDEO_RUNNER, env);
    const runnerScript = env.JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT
        ? path.resolve(String(env.JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT))
        : null;
    const runnerReady = Boolean(runner && runnerScript && fs.existsSync(runnerScript));
    const repositoryReady = remoteExecution || legacyConfiguration || Boolean(
        repositoryDirectory && fs.existsSync(path.join(
            repositoryDirectory,
            profile.repositoryEntrypoint || "generate.py"
        ))
    );
    const weightsReady = remoteExecution ? true : legacyConfiguration
        ? Boolean(modelDirectory && fs.existsSync(modelDirectory))
        : containsModelWeights(modelDirectory);
    const dependenciesReady = runnerReady && repositoryReady;
    const certified = booleanValue(
        env[configuration.certified],
        policy.localVideoCertified === true
    );
    const blockingReasons = [];
    if (policy.localVideoEnabled !== true) blockingReasons.push("LOCAL_VIDEO_DISABLED");
    if (remoteExecution) {
        const provisioningConfigured = hardware.remoteProvisioning === true;
        const physicalWorkerInjected = hardware.cudaAvailable === true;
        const capacityVramGb = hardware.requestedVramGb ?? hardware.vramGb;
        const capacityStorageGb = hardware.requestedStorageGb ?? hardware.freeDiskGb;
        if (hardware.ok !== true || (!provisioningConfigured && !physicalWorkerInjected)) {
            blockingReasons.push(hardware.status || "REMOTE_VIDEO_PROVIDER_UNAVAILABLE");
        }
        if (Number(capacityVramGb || 0) < profile.minimumVramGb) {
            blockingReasons.push("LOCAL_VIDEO_VRAM_INSUFFICIENT");
        }
        if (Number(capacityStorageGb || 0) < profile.minimumFreeDiskGb) {
            blockingReasons.push("LOCAL_VIDEO_DISK_INSUFFICIENT");
        }
    }
    else {
        if (hardware.cudaAvailable !== true) blockingReasons.push("LOCAL_VIDEO_CUDA_UNAVAILABLE");
        if (Number(hardware.vramGb || 0) < profile.minimumVramGb) blockingReasons.push("LOCAL_VIDEO_VRAM_INSUFFICIENT");
        if (Number(hardware.freeDiskGb || 0) < profile.minimumFreeDiskGb) blockingReasons.push("LOCAL_VIDEO_DISK_INSUFFICIENT");
        if (hardware.ffmpegAvailable !== true || hardware.ffprobeAvailable !== true) {
            blockingReasons.push("LOCAL_VIDEO_FFMPEG_UNAVAILABLE");
        }
    }
    if (!runnerReady) blockingReasons.push("LOCAL_VIDEO_RUNNER_UNCONFIGURED");
    else if (!repositoryReady) blockingReasons.push("LOCAL_VIDEO_DEPENDENCIES_UNAVAILABLE");
    if (!weightsReady) blockingReasons.push("LOCAL_VIDEO_MODEL_WEIGHTS_MISSING");
    const status = blockingReasons[0] || (
        remoteExecution ? "REMOTE_VIDEO_PROVISIONING_CONFIGURED" : "LOCAL_VIDEO_BACKEND_READY"
    );
    return {
        ...profile,
        ok: blockingReasons.length === 0,
        status,
        certified,
        runner,
        runnerScript,
        runnerReady,
        repositoryDirectory,
        repositoryReady,
        dependenciesReady,
        modelDirectory,
        weightsReady,
        blockingReasons
    };
}

export function buildLocalAiCapabilityReport({
    root = process.cwd(),
    env = process.env,
    hardware = inspectLocalVideoHardware({ root, env })
} = {}) {
    const policy = describeLocalVideoPolicy(env);
    const requested = requestedLocalModel(env);
    const requestedProfile = hardware.modelRequirements || resolveLocalVideoModelProfile({ env, hardware });
    const profiles = requested === "auto"
        ? LOCAL_VIDEO_BACKEND_ORDER.map(backend => LOCAL_VIDEO_MODEL_PROFILES[backend])
        : (requestedProfile.unsupported === true ? [] : [requestedProfile]);
    const backendHealth = profiles.map(profile => localBackendHealth({
        profile,
        hardware,
        policy,
        env
    }));
    const selectedVideoModel = backendHealth.find(candidate => candidate.ok === true) ||
        requestedProfile || backendHealth[0];
    const selectedBackendHealth = backendHealth.find(candidate =>
        candidate.backend === selectedVideoModel?.backend
    ) || backendHealth[0] || null;
    const localVideoSupported = backendHealth.some(candidate => candidate.ok === true);
    return {
        reportType: "LOCAL_AI_CAPABILITY_REPORT",
        schemaVersion: JARVIS_LOCAL_VIDEO_ENGINE_VERSION,
        generatedAt: new Date().toISOString(),
        root: path.resolve(root),
        policy,
        hardware: { ...hardware, backends: backendHealth },
        selectedVideoModel,
        candidateVideoModels: compatibleModelProfiles(hardware),
        localVideoReadiness: {
            supported: localVideoSupported,
            status: selectedVideoModel.unsupported === true
                ? "LOCAL_VIDEO_BACKEND_UNSUPPORTED"
                : selectedBackendHealth?.status || hardware.status,
            physicalMp4Authorized: localVideoSupported && hardware.physicalHealthVerified !== false,
            installationAuthorized: false,
            reason: selectedVideoModel.unsupported === true
                ? "LOCAL_VIDEO_BACKEND_UNSUPPORTED"
                : localVideoSupported
                    ? hardware.physicalHealthVerified === false
                        ? "REMOTE_PROVISIONING_CONFIGURED_PHYSICAL_PREFLIGHT_PENDING"
                        : "HARDWARE_GATE_PASSED_MODEL_AND_RUNNER_STILL_REQUIRE_EXPLICIT_INSTALLATION"
                    : selectedBackendHealth?.status || hardware.status
        },
        capabilityInventory: {
            deterministicInternal: [
                "concat", "crop", "scale", "overlays", "logo", "subtitles",
                "audio_mix", "normalization", "transitions", "thumbnails",
                "frame_extraction", "mp4_export", "sha256"
            ],
            selfHostedCandidates: [
                "image.generate", "image.edit", "speech.synthesize",
                "video.generate", "music.generate", "audio.effects"
            ],
            temporarilyExternal: [
                `video.generate:${policy.mode}:${localVideoSupported ? "LOCAL_AVAILABLE" : "VEO_EXPLICIT_FALLBACK"}`,
                "image.generate:CURRENT_STABLE",
                "speech.synthesize:CURRENT_STABLE_WHEN_LOCAL_UNAVAILABLE"
            ]
        },
        promotion: {
            current: policy.mode,
            rollback: "CURRENT_STABLE",
            localTestCertified: backendHealth.some(candidate => candidate.ok === true),
            localPreferredAuthorized: policy.mode === "LOCAL_PREFERRED",
            localOnlyAuthorized: policy.mode === "LOCAL_ONLY"
        }
    };
}

export function writeLocalAiCapabilityReport({
    root = process.cwd(),
    env = process.env,
    output = ".jarvis-artifacts/reports/local-ai-capability-report.json",
    hardware
} = {}) {
    const resolvedRoot = path.resolve(root);
    const normalized = String(output || "").replaceAll("\\", "/");
    if (
        !normalized.startsWith(".jarvis-artifacts/reports/") ||
        !normalized.endsWith(".json") || normalized.includes("../")
    ) {
        throw new Error("LOCAL_AI_CAPABILITY_REPORT_OUTPUT_INVALID");
    }
    const file = path.resolve(resolvedRoot, normalized);
    const reportRoot = path.resolve(resolvedRoot, ".jarvis-artifacts/reports");
    if (!file.startsWith(`${reportRoot}${path.sep}`)) {
        throw new Error("LOCAL_AI_CAPABILITY_REPORT_OUTSIDE_ARTIFACT_STUDIO");
    }
    const report = buildLocalAiCapabilityReport({ root: resolvedRoot, env, hardware });
    atomicJsonWrite(file, report);
    const artifact = registerArtifact({
        root: resolvedRoot,
        output: normalized,
        metadata: {
            type: "local_ai_capability_report",
            origin: "jarvis.local.infrastructure.audit",
            provider: "local",
            status: "LOCAL_AI_CAPABILITY_REPORT_VERIFIED",
            approvalRequired: false,
            approved: true,
            approvedBy: "LOCAL_ARTIFACT_POLICY",
            editable: false,
            preview: true,
            downloadable: true,
            publishable: false
        }
    });
    return {
        ok: true,
        status: "LOCAL_AI_CAPABILITY_REPORT_VERIFIED",
        output: normalized,
        bytes: artifact.bytes,
        sha256: artifact.sha256,
        physicallyWritten: true,
        report,
        artifact
    };
}

function safeOutput(root, output) {
    const normalized = String(output || "").trim().replaceAll("\\", "/");
    if (
        !normalized.startsWith(".jarvis-artifacts/videos/") ||
        !normalized.toLowerCase().endsWith(".mp4") ||
        normalized.includes("../") || normalized.includes("//")
    ) {
        throw new Error("LOCAL_VIDEO_OUTPUT_INVALID");
    }
    const resolved = path.resolve(root, normalized);
    const videosRoot = path.resolve(root, ".jarvis-artifacts/videos");
    if (!resolved.startsWith(`${videosRoot}${path.sep}`)) {
        throw new Error("LOCAL_VIDEO_OUTPUT_OUTSIDE_ARTIFACT_STUDIO");
    }
    return { normalized, resolved };
}

function safeReference(root, output) {
    const normalized = String(output || "").trim().replaceAll("\\", "/");
    const artifactRoot = path.resolve(root, ".jarvis-artifacts");
    const resolved = path.resolve(root, normalized);
    if (
        !normalized.startsWith(".jarvis-artifacts/") ||
        normalized.includes("../") ||
        !resolved.startsWith(`${artifactRoot}${path.sep}`) ||
        !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()
    ) {
        throw new Error("LOCAL_VIDEO_REFERENCE_INVALID");
    }
    return { output: normalized, file: resolved };
}

function safeAudioReference(root, output) {
    const reference = safeReference(root, output);
    if (
        !reference.output.startsWith(".jarvis-artifacts/audio/") ||
        !reference.output.toLowerCase().endsWith(".wav")
    ) {
        throw new Error("LOCAL_VIDEO_AUDIO_REFERENCE_INVALID");
    }
    const wav = fs.readFileSync(reference.file);
    if (
        wav.length < 44 ||
        wav.toString("ascii", 0, 4) !== "RIFF" ||
        wav.toString("ascii", 8, 12) !== "WAVE" ||
        !wav.includes(Buffer.from("fmt ", "ascii")) ||
        !wav.includes(Buffer.from("data", "ascii"))
    ) {
        throw new Error("LOCAL_VIDEO_AUDIO_REFERENCE_INVALID");
    }
    return reference;
}

function prepareVideoReferenceSheet(root, references, ffmpeg) {
    if (!Array.isArray(references) || references.length < 2 || references.length > 3) {
        throw new Error("LOCAL_VIDEO_REFERENCE_SHEET_INPUT_INVALID");
    }
    if (!ffmpeg) throw new Error("LOCAL_VIDEO_REFERENCE_SHEET_FFMPEG_REQUIRED");
    const identity = createHash("sha256")
        .update(references.map(reference => reference.output).join("\n"))
        .digest("hex")
        .slice(0, 24);
    const output = `.jarvis-artifacts/video-references/identity-sheet-${identity}.png`;
    const file = path.resolve(root, output);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const columnWidth = references.length === 2 ? 512 : 340;
    const filters = references.map((_, index) =>
        `[${index}:v]scale=${columnWidth}:1024:force_original_aspect_ratio=decrease,` +
        `pad=${columnWidth}:1024:(ow-iw)/2:(oh-ih)/2:color=white[v${index}]`
    );
    filters.push(
        `${references.map((_, index) => `[v${index}]`).join("")}hstack=inputs=${references.length}[out]`
    );
    const args = ["-hide_banner", "-nostdin", "-y"];
    for (const reference of references) args.push("-i", reference.file);
    args.push(
        "-filter_complex", filters.join(";"),
        "-map", "[out]",
        "-frames:v", "1",
        file
    );
    try {
        execFileSync(ffmpeg, args, {
            cwd: root,
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"],
            timeout: 90000,
            maxBuffer: 4 * 1024 * 1024
        });
    }
    catch(error) {
        throw new Error(`LOCAL_VIDEO_REFERENCE_SHEET_FAILED:${String(error?.stderr || error?.message || error).slice(-1000)}`);
    }
    if (!fs.existsSync(file) || fs.statSync(file).size < 1) {
        throw new Error("LOCAL_VIDEO_REFERENCE_SHEET_EMPTY");
    }
    const artifact = registerArtifact({
        root,
        output,
        metadata: {
            type: "image",
            origin: "video.generate",
            provider: "ffmpeg",
            mimeType: "image/png",
            status: "LOCAL_VIDEO_REFERENCE_SHEET_VERIFIED",
            approvalRequired: false,
            approved: true,
            approvedBy: "LOCAL_ARTIFACT_POLICY",
            preview: true,
            downloadable: true,
            publishable: false,
            originalFile: references[0].output,
            transformations: references.map(reference => `identity_reference:${reference.output}`)
        }
    });
    return { output, file, artifact, sourceReferenceCount: references.length };
}

function operationDirectories(root) {
    const base = path.resolve(root, ".jarvis-artifacts/.video-worker");
    return {
        base,
        operations: path.join(base, "operations"),
        jobs: path.join(base, "jobs"),
        results: path.join(base, "results"),
        budgets: path.join(base, "budgets")
    };
}

function atomicJsonWrite(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, file);
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function defaultVideoInspection(file, ffprobe) {
    const raw = execFileSync(ffprobe, [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,avg_frame_rate:format=duration",
        "-of", "json",
        file
    ], { encoding: "utf8", windowsHide: true, timeout: 30000 });
    const parsed = JSON.parse(raw);
    const stream = parsed.streams?.[0] || {};
    const [numerator, denominator] = String(stream.avg_frame_rate || "0/1").split("/").map(Number);
    return {
        durationSeconds: Number(parsed.format?.duration || 0),
        fps: denominator ? numerator / denominator : 0,
        width: Number(stream.width || 0),
        height: Number(stream.height || 0)
    };
}

function verifyMp4Container(file) {
    const descriptor = fs.openSync(file, "r");
    try {
        const header = Buffer.alloc(64);
        const bytes = fs.readSync(descriptor, header, 0, header.length, 0);
        return header.subarray(0, bytes).includes(Buffer.from("ftyp", "ascii"));
    }
    finally {
        fs.closeSync(descriptor);
    }
}

function verifyResultReceipt(operation, result) {
    const expected = {
        operationId: operation.operationId,
        operationName: operation.operationName,
        output: operation.output,
        backend: operation.backend,
        model: operation.model
    };
    for (const [field, value] of Object.entries(expected)) {
        if (String(result?.[field] || "") !== String(value || "")) {
            throw new Error("LOCAL_VIDEO_RESULT_RECEIPT_MISMATCH");
        }
    }
    if (
        result?.mimeType !== "video/mp4" ||
        result?.engine !== "local" ||
        result?.provider !== "local" ||
        result?.externalApiUsed !== false ||
        Number(result?.externalEstimatedCostUsd || 0) !== 0
    ) {
        throw new Error("LOCAL_VIDEO_RESULT_RECEIPT_MISMATCH");
    }
    const expectedReferences = Number(operation.referenceAssetCount || 0);
    const actualReferences = Number(result?.referenceAssetCount);
    if (!Number.isInteger(actualReferences) || actualReferences !== expectedReferences) {
        throw new Error("LOCAL_VIDEO_RESULT_RECEIPT_MISMATCH");
    }
    if (Number(operation.shotCount || 0) > 0) {
        if (
            Number(result?.shotCount) !== Number(operation.shotCount) ||
            Math.abs(
                Number(result?.requestedDurationSeconds || 0) -
                Number(operation.requestedDurationSeconds || 0)
            ) > 0.001
        ) {
            throw new Error("LOCAL_VIDEO_RESULT_RECEIPT_MISMATCH");
        }
    }
    if (operation.audioOutput && result?.audioIncluded !== true) {
        throw new Error("LOCAL_VIDEO_RESULT_RECEIPT_MISMATCH");
    }
}

function verifyMediaAgainstOperation(operation, media) {
    const profile = LOCAL_VIDEO_MODEL_PROFILES[operation.backend];
    if (!profile) throw new Error("LOCAL_VIDEO_BACKEND_UNSUPPORTED");
    const expectedSize = operation.aspectRatio === "16:9"
        ? profile.landscapeSize
        : profile.portraitSize;
    if (
        Number(media.width) !== Number(expectedSize.width) ||
        Number(media.height) !== Number(expectedSize.height)
    ) {
        throw new Error("LOCAL_VIDEO_DIMENSIONS_MISMATCH");
    }
    if (Number(media.fps) + 0.01 < Number(profile.targetFps)) {
        throw new Error("LOCAL_VIDEO_FPS_BELOW_BACKEND_TARGET");
    }
    if (
        Number(operation.requestedDurationSeconds || 0) > 0 &&
        Math.abs(
            Number(media.durationSeconds || 0) -
            Number(operation.requestedDurationSeconds)
        ) > 0.25
    ) {
        throw new Error("LOCAL_VIDEO_DURATION_MISMATCH");
    }
}

function runProcess(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        execFile(command, args, {
            windowsHide: true,
            encoding: "utf8",
            maxBuffer: 8 * 1024 * 1024,
            ...options
        }, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolve({ stdout: String(stdout || ""), stderr: String(stderr || ""), exitCode: 0 });
        });
    });
}

function runpodPositiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function runpodPublicWorker(state = {}) {
    return {
        provider: "runpod",
        podId: state.podId || null,
        remoteJobId: state.remoteJobId || null,
        phase: state.phase || null,
        gpuTypeId: state.gpuTypeId || null,
        vramGb: Number(state.vramGb || 0),
        providerVramGb: Number(state.providerVramGb || state.vramGb || 0),
        hourlyRateUsd: Number(state.hourlyRateUsd || 0),
        hardBudgetUsd: Number(state.hardBudgetUsd || 0),
        provisionedAt: state.provisionedAt || state.createdAt || null,
        createdAt: state.createdAt || null,
        missionId: state.missionId || null,
        objectiveId: state.objectiveId || null,
        obligationId: state.obligationId || null,
        operationName: state.operationName || null,
        rootInstructionHash: state.rootInstructionHash || null,
        networkVolumeId: state.networkVolumeId || null,
        networkVolumeDataCenterId: state.networkVolumeDataCenterId || null,
        dataCenterId: state.dataCenterId || state.networkVolumeDataCenterId || null,
        networkVolumePersistent: Boolean(state.networkVolumeId),
        runtimeCertificationOnly: state.runtimeCertificationOnly === true,
        cacheStatus: state.cacheStatus || null,
        cacheProfile: state.cacheProfile || null,
        provisionImageTag: state.provisionImageTag || null,
        expectedRegistryDigest: state.expectedRegistryDigest || null,
        physicalHealthVerified: state.physicalHealthVerified === true,
        runtimePreflightVerified: state.runtimePreflightVerified === true,
        bootstrapProgress: state.bootstrapProgress || null,
        bootstrapStartedAt: state.bootstrapStartedAt || null,
        inferenceStartedAt: state.inferenceStartedAt || null,
        gpuRentalSeconds: Number(state.gpuRentalSeconds || 0),
        gpuRentalEstimatedCost: Number(state.gpuRentalEstimatedCost || 0),
        externalComputeMeter: state.externalComputeMeter || null,
        stageTimeline: state.stageTimeline || {},
        assetManifest: Array.isArray(state.assetManifest)
            ? state.assetManifest.map(asset => ({
                output: asset.output,
                remoteFile: asset.remoteFile,
                bytes: asset.bytes,
                sha256: asset.sha256
            }))
            : []
    };
}

function shellSingleQuote(value) {
    return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function assertFlashAttentionWheelAuthority(profile) {
    const wheels = profile?.flashAttentionWheels;
    for (const abi of ["FALSE", "TRUE"]) {
        const wheel = wheels?.[abi];
        const expectedName = `flash_attn-${profile?.flashAttentionVersion}+cu12torch2.8cxx11abi${abi}-cp312-cp312-linux_x86_64.whl`;
        const expectedUrl = `https://github.com/Dao-AILab/flash-attention/releases/download/v${profile?.flashAttentionVersion}/${expectedName.replace("+", "%2B")}`;
        if (
            wheel?.fileName !== expectedName ||
            wheel?.url !== expectedUrl ||
            !/^[a-f0-9]{64}$/.test(String(wheel?.sha256 || ""))
        ) {
            throw new Error("RUNPOD_FLASH_ATTENTION_WHEEL_AUTHORITY_INVALID");
        }
    }
}

/**
 * Physical RunPod infrastructure adapter behind the existing V142 video engine.
 * It uses RunPod only for Pod lifecycle and an ephemeral SSH key for byte transfer.
 * The API credential never leaves this server-side closure.
 */
export function createRunpodRemoteVideoAdapter({
    root = process.cwd(),
    env = process.env,
    fetchImpl = globalThis.fetch,
    registryFetchImpl = fetchImpl,
    execute = runProcess,
    generateKeyPair = null,
    inspectBridgeIdentity = null,
    resolveCanonicalSha = null,
    now = () => new Date()
} = {}) {
    const resolvedRoot = path.resolve(root);
    const apiBase = String(env.JARVIS_RUNPOD_API_BASE || "https://rest.runpod.io/v1").replace(/\/$/, "");
    const catalogApiBase = String(
        env.JARVIS_RUNPOD_CATALOG_API_BASE || "https://api.runpod.io/v2/catalog"
    ).replace(/\/$/, "");
    const graphQlBase = String(env.JARVIS_RUNPOD_GRAPHQL_URL || "https://api.runpod.io/graphql");
    const apiKey = typeof env.RUNPOD_API_KEY === "string" ? env.RUNPOD_API_KEY : "";
    const provider = String(env.JARVIS_REMOTE_GPU_PROVIDER || "").trim().toLowerCase();
    const gpuTypeId = String(env.JARVIS_RUNPOD_GPU_TYPE_ID || "").trim();
    const cacheContract = RUNPOD_WAN22_GPU_PROFILES[gpuTypeId] || null;
    const modelAuthorityJson = JSON.stringify({
        modelRepository: RUNPOD_WAN22_CACHE_BASE.modelRepository,
        modelRevision: RUNPOD_WAN22_CACHE_BASE.modelRevision,
        wanRepositoryRevision: RUNPOD_WAN22_CACHE_BASE.wanRepositoryRevision,
        expectedModelBytes: RUNPOD_WAN22_CACHE_BASE.expectedModelBytes,
        requiredRuntimeModelBytes: RUNPOD_WAN22_CACHE_BASE.requiredRuntimeModelBytes,
        requiredFiles: RUNPOD_WAN22_CACHE_BASE.requiredFiles
    });
    const modelEvidenceProgram = [
        "import datetime,hashlib,json,os,subprocess,sys,tempfile",
        "expected=json.loads(sys.argv[1]); model_dir=sys.argv[2]; repo_dir=sys.argv[3]; manifest_path=sys.argv[4]; operation_id=sys.argv[5]",
        "assert expected['modelRepository'] and expected['modelRevision'] and expected['wanRepositoryRevision']",
        "assert sum(item['bytes'] for item in expected['requiredFiles'])==expected['requiredRuntimeModelBytes']",
        "total=0",
        "for root,dirs,files in os.walk(model_dir):",
        "    if os.path.abspath(root)==os.path.abspath(model_dir): dirs[:]=[name for name in dirs if name!='.cache']",
        "    for name in files: total+=os.path.getsize(os.path.join(root,name))",
        "assert total==expected['expectedModelBytes']",
        "observed_files=[]",
        "model_revisions=set()",
        "for item in expected['requiredFiles']:",
        "    target=os.path.join(model_dir,item['path']); size=os.path.getsize(target); digest=hashlib.sha256()",
        "    with open(target,'rb') as handle:",
        "        for chunk in iter(lambda:handle.read(8*1024*1024),b''): digest.update(chunk)",
        "    sha256=digest.hexdigest(); observed_files.append({'path':item['path'],'bytes':size,'sha256':sha256})",
        "    assert size==item['bytes'] and sha256==item['sha256']",
        "    metadata_path=os.path.join(model_dir,'.cache','huggingface','download',item['path']+'.metadata')",
        "    with open(metadata_path,encoding='utf-8') as metadata: model_revisions.add(metadata.readline().strip())",
        "assert model_revisions=={expected['modelRevision']}",
        "wan_revision=subprocess.check_output(['git','-C',repo_dir,'rev-parse','HEAD'],text=True).strip()",
        "assert wan_revision==expected['wanRepositoryRevision']",
        "observed={'operationId':operation_id,'model':{'repository':expected['modelRepository'],'revision':next(iter(model_revisions)),'source':'huggingface_local_dir_metadata'},'wanRepositoryRevision':wan_revision,'modelBytes':total,'requiredFilesBytes':sum(item['bytes'] for item in observed_files),'modelByteNamespace':'model_tree_excluding_root_huggingface_cache','files':observed_files,'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')}",
        "fd,tmp=tempfile.mkstemp(prefix='.model-manifest-',dir=os.path.dirname(manifest_path)); os.close(fd)",
        "open(tmp,'w',encoding='utf-8').write(json.dumps(observed,sort_keys=True,separators=(',',':'))+'\\n'); os.replace(tmp,manifest_path)"
    ].join("\n");
    const provisionImageTag = String(
        env.JARVIS_RUNPOD_IMAGE || cacheContract?.provisionImageTag || RUNPOD_WAN22_CACHE_BASE.provisionImageTag
    ).trim();
    const cloudType = String(
        env.JARVIS_RUNPOD_CLOUD_TYPE || RUNPOD_WAN22_CACHE_BASE.cloudType
    ).trim().toUpperCase() === "SECURE"
        ? "SECURE"
        : "COMMUNITY";
    const configuredPolicy = String(env.JARVIS_VIDEO_ENGINE_POLICY || "").trim().toUpperCase();
    const configuredBackend = String(env.JARVIS_LOCAL_VIDEO_MODEL || "").trim().toLowerCase();
    const configuredCanonicalSha = String(env.JARVIS_RUNPOD_CANONICAL_SHA || "").trim().toLowerCase();
    const paidResourceCreationAuthorized = booleanValue(
        env.JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED,
        false
    );
    const rawHardBudgetUsd = String(env.JARVIS_REMOTE_GPU_HARD_BUDGET_USD || "").trim();
    const hardBudgetExplicit = rawHardBudgetUsd.length > 0 && Number.isFinite(Number(rawHardBudgetUsd)) &&
        Number(rawHardBudgetUsd) > 0 && Number(rawHardBudgetUsd) <= RUNPOD_MAX_EXPLICIT_HARD_BUDGET_USD;
    const hardBudgetUsd = Math.min(
        RUNPOD_MAX_EXPLICIT_HARD_BUDGET_USD,
        runpodPositiveNumber(env.JARVIS_REMOTE_GPU_HARD_BUDGET_USD, 2)
    );
    const budgetStopRatio = Math.min(
        0.99,
        Math.max(0.8, runpodPositiveNumber(env.JARVIS_REMOTE_GPU_BUDGET_STOP_RATIO, 0.95))
    );
    const containerDiskInGb = Math.ceil(runpodPositiveNumber(env.JARVIS_RUNPOD_CONTAINER_DISK_GB, 30));
    const volumeInGb = Math.ceil(runpodPositiveNumber(env.JARVIS_RUNPOD_VOLUME_DISK_GB, 100));
    const networkVolumeId = String(env.JARVIS_RUNPOD_NETWORK_VOLUME_ID || "").trim();
    const runtimeCertificationOnly = booleanValue(
        env.JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY,
        false
    );
    const runtimeCertificationDataCenterId = String(
        env.JARVIS_RUNPOD_DATACENTER_ID || ""
    ).trim();
    const bootstrapTimeoutSeconds = runpodPositiveNumber(env.JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS, 1800);
    const inferenceTimeoutSeconds = runpodPositiveNumber(
        env.JARVIS_RUNPOD_INFERENCE_TIMEOUT_SECONDS,
        localVideoTimeoutSeconds(env)
    );
    const minimumRamGb = Math.ceil(runpodPositiveNumber(
        env.JARVIS_RUNPOD_MIN_RAM_GB,
        cacheContract?.minimumRamGb || RUNPOD_WAN22_CACHE_BASE.minimumRamGb
    ));
    const minimumVcpu = Math.ceil(runpodPositiveNumber(
        env.JARVIS_RUNPOD_MIN_VCPU,
        cacheContract?.minimumVcpu || RUNPOD_WAN22_CACHE_BASE.minimumVcpu
    ));
    const expectedVramGb = runpodPositiveNumber(
        env.JARVIS_RUNPOD_EXPECTED_VRAM_GB,
        cacheContract?.minimumVramGb || RUNPOD_WAN22_CACHE_BASE.minimumVramGb
    );
    const configuredTotalHourlyRateUsd = runpodPositiveNumber(
        env.JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD,
        cacheContract?.expectedTotalHourlyRateUsd || 0.46
    );
    const remoteBase = "/workspace/jarvis-v142";
    const stateRoot = path.join(resolvedRoot, ".jarvis-artifacts", ".video-worker", "runpod");
    const ssh = resolveLocalExecutable(env.JARVIS_SSH_PATH || "ssh", env);
    const scp = resolveLocalExecutable(env.JARVIS_SCP_PATH || "scp", env);
    const sshKeygen = resolveLocalExecutable(env.JARVIS_SSH_KEYGEN_PATH || "ssh-keygen", env);

    function currentCanonicalSha() {
        if (typeof resolveCanonicalSha === "function") {
            return String(resolveCanonicalSha({ root: resolvedRoot }) || "").trim().toLowerCase();
        }
        try {
            return String(execFileSync("git", ["rev-parse", "HEAD"], {
                cwd: resolvedRoot,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"]
            }) || "").trim().toLowerCase();
        }
        catch {
            return "";
        }
    }

    function currentBridgeIdentity() {
        if (typeof inspectBridgeIdentity !== "function") {
            return { ok: false, status: "BRIDGE_IDENTITY_UNAVAILABLE" };
        }
        try {
            return inspectBridgeIdentity({ root: resolvedRoot }) || {
                ok: false,
                status: "BRIDGE_IDENTITY_INVALID"
            };
        }
        catch {
            return { ok: false, status: "BRIDGE_IDENTITY_INVALID" };
        }
    }

    function configuredRemoteBackend() {
        return LOCAL_VIDEO_MODEL_ALIASES[configuredBackend] || configuredBackend;
    }

    function isHuMoRemoteJob(job = null) {
        const backend = String(job?.backend || configuredRemoteBackend()).trim().toLowerCase();
        return (LOCAL_VIDEO_MODEL_ALIASES[backend] || backend) === HUMO_IDENTITY_PROBE.backend;
    }

    function remoteHuMoLifecycleContract(job = null) {
        if (!isHuMoRemoteJob(job)) return null;
        const runtime = RUNPOD_HUMO_IDENTITY_CANDIDATE.remoteRuntimeBase;
        const cacheRoot = `${remoteBase}/cache/humo-1.7b`;
        const weightsRoot = `${cacheRoot}/weights`;
        const wanProfile = cacheContract || RUNPOD_WAN22_GPU_PROFILES[RUNPOD_HUMO_IDENTITY_CANDIDATE.targetGpuTypeId];
        return {
            kind: "humo",
            backend: HUMO_IDENTITY_PROBE.backend,
            model: HUMO_IDENTITY_PROBE.model,
            cacheRoot,
            repositoryDir: `${cacheRoot}/HuMo`,
            weightsDir: `${weightsRoot}/HuMo`,
            wan21Dir: `${weightsRoot}/Wan2.1-T2V-1.3B`,
            whisperDir: `${weightsRoot}/whisper-large-v3`,
            separatorFile: `${weightsRoot}/HuMo/${RUNPOD_HUMO_IDENTITY_CANDIDATE.audioSeparator.path}`,
            venvDir: `${cacheRoot}/venv`,
            runtimePreflightFile: `${cacheRoot}/runtime-preflight.json`,
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
    }

    function assertZeroCostConfiguration(job, { allowDynamicPlacement = false } = {}) {
        if (provider !== "runpod") throw new Error("RUNPOD_PROVIDER_NOT_ENABLED");
        if (configuredPolicy !== "LOCAL_TEST") throw new Error("RUNPOD_LOCAL_TEST_POLICY_REQUIRED");
        const requestedBackend = configuredRemoteBackend();
        const humoLifecycle = requestedBackend === HUMO_IDENTITY_PROBE.backend;
        if (!humoLifecycle && requestedBackend !== WAN22_TI2V_5B.backend) {
            throw new Error("RUNPOD_WAN22_BACKEND_REQUIRED");
        }
        if (humoLifecycle && gpuTypeId && gpuTypeId !== RUNPOD_HUMO_IDENTITY_CANDIDATE.targetGpuTypeId) {
            throw new Error("RUNPOD_HUMO_L40S_REQUIRED");
        }
        if (!hardBudgetExplicit) throw new Error("RUNPOD_HARD_BUDGET_REQUIRED");
        if (!gpuTypeId && (!allowDynamicPlacement || paidResourceCreationAuthorized)) {
            throw new Error("RUNPOD_GPU_TYPE_EXPLICIT_AUTHORIZATION_REQUIRED");
        }
        if (gpuTypeId && !cacheContract) throw new Error("RUNPOD_GPU_TYPE_NOT_APPROVED_FOR_V142");
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
        }
        if (networkVolumeId && cloudType !== "SECURE") {
            throw new Error("RUNPOD_NETWORK_VOLUME_SECURE_CLOUD_REQUIRED");
        }
        if (runtimeCertificationOnly) {
            if (!gpuTypeId || !cacheContract) {
                throw new Error("RUNPOD_GPU_TYPE_EXPLICIT_AUTHORIZATION_REQUIRED");
            }
        }
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
            if (humoLifecycle) {
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
            }
            if (
                !job.missionId || !job.objectiveId || !job.obligationId ||
                !/^[a-f0-9]{64}$/i.test(String(job.rootInstructionHash || ""))
            ) {
                throw new Error("RUNPOD_DURABLE_IDENTITY_REQUIRED");
            }
            if (job.externalApiAllowed !== false) {
                throw new Error("RUNPOD_EXTERNAL_FALLBACK_FORBIDDEN");
            }
        }
    }

    function inspectHuMoZeroCostPrecheck({ job = null, registryVerification = null } = {}) {
        try {
            const requestedBackend = LOCAL_VIDEO_MODEL_ALIASES[configuredBackend] || configuredBackend;
            if (provider !== "runpod") throw new Error("RUNPOD_PROVIDER_NOT_ENABLED");
            if (configuredPolicy !== "LOCAL_TEST") throw new Error("RUNPOD_LOCAL_TEST_POLICY_REQUIRED");
            if (requestedBackend !== HUMO_IDENTITY_PROBE.backend) {
                throw new Error("RUNPOD_HUMO_BACKEND_REQUIRED");
            }
            if (!hardBudgetExplicit) throw new Error("RUNPOD_HARD_BUDGET_REQUIRED");
            if (gpuTypeId && gpuTypeId !== RUNPOD_HUMO_IDENTITY_CANDIDATE.targetGpuTypeId) {
                throw new Error("RUNPOD_HUMO_L40S_REQUIRED");
            }
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
            const runtimeBase = RUNPOD_HUMO_IDENTITY_CANDIDATE.remoteRuntimeBase;
            if (
                !runtimeBase ||
                runtimeBase.provisionImageTag !==
                    runtimeBase.repository + ":" + runtimeBase.tag ||
                /@sha256:/i.test(runtimeBase.provisionImageTag) ||
                !/^sha256:[a-f0-9]{64}$/i.test(String(runtimeBase.expectedRegistryDigest || ""))
            ) {
                throw new Error("RUNPOD_HUMO_RUNTIME_BASE_AUTHORITY_INVALID");
            }
            const verifiedRegistry = normalizedRegistryVerification(runtimeBase, registryVerification);
            if (job) {
                const authority = job.identityRuntimeAuthority;
                const shots = Array.isArray(job.shotPlan) ? job.shotPlan : [];
                const shot = shots[0] || {};
                if (
                    job.executionTarget !== "remote" ||
                    job.backend !== HUMO_IDENTITY_PROBE.backend ||
                    job.model !== HUMO_IDENTITY_PROBE.model ||
                    job.requiresIdentityFidelity !== true ||
                    job.aspectRatio !== "16:9" ||
                    job.externalApiAllowed !== false
                ) {
                    throw new Error("RUNPOD_HUMO_JOB_CONTRACT_INVALID");
                }
                if (
                    !job.missionId || !job.objectiveId || !job.obligationId ||
                    !/^[a-f0-9]{64}$/i.test(String(job.rootInstructionHash || ""))
                ) {
                    throw new Error("RUNPOD_DURABLE_IDENTITY_REQUIRED");
                }
                if (
                    !authority ||
                    authority.id !== RUNPOD_HUMO_IDENTITY_CANDIDATE.id ||
                    authority.sourceRevision !== RUNPOD_HUMO_IDENTITY_CANDIDATE.sourceRevision ||
                    authority.modelRevision !== RUNPOD_HUMO_IDENTITY_CANDIDATE.modelRevision ||
                    authority.runtimeAssetAuthorityPinned !== true
                ) {
                    throw new Error("RUNPOD_HUMO_RUNTIME_AUTHORITY_REQUIRED");
                }
                if (
                    shots.length !== 1 ||
                    shot.identityMode !== "single_identity" ||
                    !Array.isArray(shot.characterIds) || shot.characterIds.length !== 1 ||
                    !Array.isArray(shot.identityReferenceOutputs) ||
                    shot.identityReferenceOutputs.length < 1 ||
                    !(Number(shot.durationSeconds) > 0) ||
                    Number(shot.durationSeconds) >
                        RUNPOD_HUMO_IDENTITY_CANDIDATE.candidateProbeGeometry.durationSeconds + 0.001
                ) {
                    throw new Error("RUNPOD_HUMO_IDENTITY_PROBE_CONTRACT_INVALID");
                }
            }
            const executionBlockers = [];
            if (RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified !== true) {
                executionBlockers.push("RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED");
            }
            if (RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized !== true) {
                executionBlockers.push("RUNPOD_HUMO_PAID_EXECUTION_AUTHORITY_REQUIRED");
            }
            return {
                ok: true,
                phase: "HUMO_ZERO_COST_PREFLIGHT",
                status: "RUNPOD_HUMO_ZERO_COST_PREFLIGHT_READY",
                backend: HUMO_IDENTITY_PROBE.backend,
                model: HUMO_IDENTITY_PROBE.model,
                targetGpuTypeId: RUNPOD_HUMO_IDENTITY_CANDIDATE.targetGpuTypeId,
                resourceCreationPossible: false,
                inferencePossible: false,
                providerTrafficUsed: false,
                paidResourceCreationAuthorized,
                paidExecutionAuthorized: RUNPOD_HUMO_IDENTITY_CANDIDATE.paidExecutionAuthorized === true,
                physicalRuntimeCertified:
                    RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalRuntimeCertified === true,
                executionBlockers,
                portrait: {
                    targetResolved: RUNPOD_HUMO_IDENTITY_CANDIDATE.portraitTargetUnresolved !== true,
                    certified: RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalPortraitCertified === true,
                    status: RUNPOD_HUMO_IDENTITY_CANDIDATE.physicalPortraitCertified === true
                        ? "LOCAL_VIDEO_HUMO_PORTRAIT_CERTIFIED"
                        : "LOCAL_VIDEO_HUMO_PORTRAIT_UNCERTIFIED"
                },
                probeGeometry: { ...RUNPOD_HUMO_IDENTITY_CANDIDATE.candidateProbeGeometry },
                contract: {
                    provisionImageTag: runtimeBase.provisionImageTag,
                    expectedRegistryDigest: runtimeBase.expectedRegistryDigest,
                    registryVerification: verifiedRegistry,
                    basePython: runtimeBase.basePython,
                    baseTorch: runtimeBase.baseTorch,
                    baseCuda: runtimeBase.baseCuda,
                    bootstrapPython: runtimeBase.bootstrapPython,
                    bootstrapTorch: runtimeBase.bootstrapTorch,
                    bootstrapTorchCuda: runtimeBase.bootstrapTorchCuda,
                    bootstrapFlashAttention: runtimeBase.bootstrapFlashAttention,
                    runtimePreflightCertified: runtimeBase.runtimePreflightCertified === true
                }
            };
        }
        catch(error) {
            return {
                ok: false,
                phase: "HUMO_ZERO_COST_PREFLIGHT",
                status: error?.message || "RUNPOD_HUMO_ZERO_COST_PREFLIGHT_FAILED",
                error: error?.message || "RUNPOD_HUMO_ZERO_COST_PREFLIGHT_FAILED",
                resourceCreationPossible: false,
                inferencePossible: false,
                providerTrafficUsed: false
            };
        }
    }

    function assertProviderConfigured() {
        if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
        if (typeof fetchImpl !== "function") throw new Error("RUNPOD_FETCH_UNAVAILABLE");
        if (typeof registryFetchImpl !== "function") throw new Error("RUNPOD_REGISTRY_FETCH_UNAVAILABLE");
        if (!ssh || !scp || !sshKeygen) throw new Error("RUNPOD_SSH_TOOLCHAIN_UNAVAILABLE");
    }

    function normalizedRegistryVerification(imageProfile, verification) {
        if (
            !verification || verification.status !== "REGISTRY_DIGEST_VERIFIED" ||
            verification.registry !== imageProfile.registry ||
            verification.repository !== imageProfile.repository ||
            verification.tag !== imageProfile.tag ||
            verification.expectedDigest !== imageProfile.expectedRegistryDigest ||
            !/^sha256:[a-f0-9]{64}$/i.test(String(verification.observedDigest || "")) ||
            !String(verification.checkedAt || "").trim()
        ) {
            throw new Error("RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE");
        }
        if (verification.observedDigest !== imageProfile.expectedRegistryDigest) {
            throw new Error("RUNPOD_REGISTRY_DIGEST_MISMATCH");
        }
        return {
            registry: imageProfile.registry,
            repository: imageProfile.repository,
            tag: imageProfile.tag,
            expectedDigest: imageProfile.expectedRegistryDigest,
            observedDigest: verification.observedDigest,
            checkedAt: verification.checkedAt,
            status: "REGISTRY_DIGEST_VERIFIED"
        };
    }

    async function resolveRegistryVerification(imageProfile) {
        if (imageProfile.registry !== "registry-1.docker.io") {
            throw new Error("RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE");
        }
        try {
            const scope = encodeURIComponent(`repository:${imageProfile.repository}:pull`);
            const tokenResponse = await registryFetchImpl(
                `https://auth.docker.io/token?service=registry.docker.io&scope=${scope}`,
                { method: "GET", headers: { Accept: "application/json" } }
            );
            if (Number(tokenResponse?.status || 0) !== 200 || typeof tokenResponse.text !== "function") {
                throw new Error("RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE");
            }
            const tokenPayload = JSON.parse(await tokenResponse.text());
            const token = String(tokenPayload?.token || tokenPayload?.access_token || "");
            if (!token) throw new Error("RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE");
            const manifestResponse = await registryFetchImpl(
                `https://${imageProfile.registry}/v2/${imageProfile.repository}/manifests/${encodeURIComponent(imageProfile.tag)}`,
                {
                    method: "HEAD",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: [
                            "application/vnd.oci.image.index.v1+json",
                            "application/vnd.docker.distribution.manifest.list.v2+json",
                            "application/vnd.oci.image.manifest.v1+json",
                            "application/vnd.docker.distribution.manifest.v2+json"
                        ].join(", ")
                    }
                }
            );
            if (Number(manifestResponse?.status || 0) !== 200) {
                throw new Error("RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE");
            }
            const observedDigest = String(
                manifestResponse?.headers?.get?.("docker-content-digest") || ""
            ).trim().toLowerCase();
            return normalizedRegistryVerification(imageProfile, {
                registry: imageProfile.registry,
                repository: imageProfile.repository,
                tag: imageProfile.tag,
                expectedDigest: imageProfile.expectedRegistryDigest,
                observedDigest,
                checkedAt: now().toISOString(),
                status: "REGISTRY_DIGEST_VERIFIED"
            });
        }
        catch(error) {
            if (error?.message === "RUNPOD_REGISTRY_DIGEST_MISMATCH") throw error;
            throw new Error("RUNPOD_REGISTRY_DIGEST_UNVERIFIABLE");
        }
    }

    function assertPaidResourceCreationAuthority() {
        if (paidResourceCreationAuthorized !== true) {
            throw new Error("RUNPOD_PAID_RESOURCE_CREATION_NOT_AUTHORIZED");
        }
    }

    function stateFile(operationId) {
        if (!/^[a-f0-9-]{20,}$/i.test(String(operationId || ""))) {
            throw new Error("RUNPOD_OPERATION_ID_INVALID");
        }
        return path.join(stateRoot, `${operationId}.json`);
    }

    function obligationFingerprint(job) {
        return createHash("sha256")
            .update(`${job.missionId}\n${job.objectiveId}\n${job.obligationId}\n${job.rootInstructionHash}`)
            .digest("hex");
    }

    function localDurableStates(job) {
        if (!fs.existsSync(stateRoot)) return [];
        const fingerprint = obligationFingerprint(job);
        return fs.readdirSync(stateRoot)
            .filter(name => name.endsWith(".json"))
            .map(name => {
                try { return readJson(path.join(stateRoot, name)); }
                catch { return null; }
            })
            .filter(Boolean)
            .filter(state => {
                try {
                    return obligationFingerprint(state) === fingerprint;
                }
                catch {
                    return false;
                }
            });
    }

    function assertNoLocalDuplicateObligation(job) {
        const active = localDurableStates(job).filter(state =>
            Boolean(state.podId) && !["RELEASED", "TERMINATED"].includes(String(state.phase || ""))
        );
        if (active.length > 0) throw new Error("RUNPOD_LOCAL_DUPLICATE_OBLIGATION_BLOCKED");
        return active.length;
    }

    function runpodEvidenceStates() {
        if (!fs.existsSync(stateRoot)) return [];
        return fs.readdirSync(stateRoot)
            .filter(name => name.endsWith(".json"))
            .map(name => {
                try { return readJson(path.join(stateRoot, name)); }
                catch { return null; }
            })
            .filter(Boolean);
    }

    function normalizedCacheReplica(evidence) {
        const cacheStatus = String(evidence?.cacheStatus || "").trim().toUpperCase();
        if (!["CACHE_MODEL_READY", "CACHE_READY", "CACHE_HIT"].includes(cacheStatus)) return null;
        const networkVolumeId = String(evidence?.networkVolumeId || evidence?.id || "").trim();
        const dataCenterId = String(
            evidence?.dataCenterId || evidence?.networkVolumeDataCenterId || ""
        ).trim();
        const manifest = evidence?.manifest || evidence?.modelManifest || null;
        const files = Array.isArray(manifest?.files)
            ? manifest.files
            : (Array.isArray(evidence?.files) ? evidence.files : []);
        const modelRepository = String(
            manifest?.model?.repository || evidence?.modelRepository || ""
        ).trim();
        const modelRevision = String(
            manifest?.model?.revision || evidence?.modelRevision || evidence?.modelContractRevision || ""
        ).trim();
        const wanRepositoryRevision = String(
            manifest?.wanRepositoryRevision || evidence?.wanRepositoryRevision || ""
        ).trim();
        const modelBytes = Number(manifest?.modelBytes ?? evidence?.modelBytes ?? evidence?.physicalModelDirectoryBytes);
        const requiredFilesBytes = Number(
            manifest?.requiredFilesBytes ?? evidence?.requiredFilesBytes ?? evidence?.verifiedRequiredBytes
        );
        const expectedFiles = new Map(
            RUNPOD_WAN22_CACHE_BASE.requiredFiles.map(item => [item.path, item])
        );
        const observedFiles = new Map(files.map(item => [String(item?.path || ""), item]));
        const explicitFileContradiction = files.some(item => {
            const expected = expectedFiles.get(String(item?.path || ""));
            if (!expected) return false;
            const explicitBytes = item?.bytes != null && Number.isFinite(Number(item.bytes));
            const explicitSha = String(item?.sha256 || "").trim().toLowerCase();
            return (explicitBytes && Number(item.bytes) !== expected.bytes) ||
                (explicitSha && explicitSha !== expected.sha256);
        });
        const filesMatch = observedFiles.size === expectedFiles.size &&
            [...expectedFiles].every(([filePath, expected]) => {
                const observed = observedFiles.get(filePath);
                return Number(observed?.bytes) === expected.bytes &&
                    String(observed?.sha256 || "").toLowerCase() === expected.sha256;
            });
        const identityMatches =
            modelRepository === RUNPOD_WAN22_CACHE_BASE.modelRepository &&
            modelRevision === RUNPOD_WAN22_CACHE_BASE.modelRevision &&
            wanRepositoryRevision === RUNPOD_WAN22_CACHE_BASE.wanRepositoryRevision &&
            modelBytes === RUNPOD_WAN22_CACHE_BASE.expectedModelBytes &&
            requiredFilesBytes === RUNPOD_WAN22_CACHE_BASE.requiredRuntimeModelBytes;
        const retained = evidence?.networkVolumeRetained !== false && evidence?.volumeRetained !== false;
        const completed = !evidence?.phase || [
            "COMPLETED", "RELEASED", "TERMINATED", "CACHE_READY", "CACHE_MODEL_READY"
        ].includes(String(evidence.phase).toUpperCase());
        const observedType = String(evidence?.type || evidence?.volumeType || "").trim().toUpperCase();
        const observedSizeGb = Number(evidence?.sizeGb ?? evidence?.networkVolumeSizeGb);
        const explicitIdentityContradiction =
            (modelRepository && modelRepository !== RUNPOD_WAN22_CACHE_BASE.modelRepository) ||
            (modelRevision && modelRevision !== RUNPOD_WAN22_CACHE_BASE.modelRevision) ||
            (wanRepositoryRevision && wanRepositoryRevision !== RUNPOD_WAN22_CACHE_BASE.wanRepositoryRevision) ||
            (Number.isFinite(modelBytes) && modelBytes !== RUNPOD_WAN22_CACHE_BASE.expectedModelBytes) ||
            (Number.isFinite(requiredFilesBytes) &&
                requiredFilesBytes !== RUNPOD_WAN22_CACHE_BASE.requiredRuntimeModelBytes) ||
            (observedType && observedType !== RUNPOD_WAN22_CACHE_BASE.networkVolumeType) ||
            (Number.isFinite(observedSizeGb) && observedSizeGb < RUNPOD_WAN22_CACHE_BASE.minimumNetworkVolumeGb) ||
            explicitFileContradiction ||
            !retained;
        if (!networkVolumeId) return null;
        if (explicitIdentityContradiction) {
            return { invalid: true, networkVolumeId: networkVolumeId || null };
        }
        if (!dataCenterId || !filesMatch || !identityMatches || !completed) {
            return { incomplete: true, networkVolumeId };
        }
        return {
            networkVolumeId,
            dataCenterId,
            sizeGb: Math.max(
                RUNPOD_WAN22_CACHE_BASE.minimumNetworkVolumeGb,
                Number(evidence?.sizeGb || evidence?.networkVolumeSizeGb || 0)
            ),
            type: String(evidence?.type || evidence?.volumeType || RUNPOD_WAN22_CACHE_BASE.networkVolumeType)
                .trim().toUpperCase(),
            cacheStatus,
            modelRepository,
            modelRevision,
            wanRepositoryRevision,
            modelBytes,
            requiredFilesBytes,
            shaVerified: true
        };
    }

    function certifiedCacheReplicas(cacheReplicas = null, networkVolumes = null) {
        const supplied = Array.isArray(cacheReplicas) ? cacheReplicas : [];
        const claims = [...runpodEvidenceStates(), ...supplied]
            .map(normalizedCacheReplica)
            .filter(Boolean);
        const invalidIds = new Set(
            claims.filter(item => item.invalid && item.networkVolumeId).map(item => item.networkVolumeId)
        );
        const volumeInventory = Array.isArray(networkVolumes) ? networkVolumes : null;
        const byId = new Map();
        const cacheRank = { CACHE_MODEL_READY: 0, CACHE_READY: 1, CACHE_HIT: 1 };
        for (const replica of claims.filter(item =>
            !item.invalid && !item.incomplete && !invalidIds.has(item.networkVolumeId)
        )) {
            if (volumeInventory) {
                const physical = volumeInventory.find(item =>
                    String(item?.id || item?.networkVolumeId || "") === replica.networkVolumeId &&
                    String(item?.dataCenterId || item?.dataCenter?.id || "") === replica.dataCenterId &&
                    Number(item?.sizeGb || item?.size || item?.sizeInGb || 0) >=
                        RUNPOD_WAN22_CACHE_BASE.minimumNetworkVolumeGb
                );
                if (!physical) continue;
            }
            const existing = byId.get(replica.networkVolumeId);
            if (existing) {
                const samePhysicalIdentity =
                    existing.dataCenterId === replica.dataCenterId &&
                    existing.type === replica.type &&
                    existing.modelRepository === replica.modelRepository &&
                    existing.modelRevision === replica.modelRevision &&
                    existing.wanRepositoryRevision === replica.wanRepositoryRevision &&
                    existing.modelBytes === replica.modelBytes &&
                    existing.requiredFilesBytes === replica.requiredFilesBytes;
                if (!samePhysicalIdentity) {
                    invalidIds.add(replica.networkVolumeId);
                    byId.delete(replica.networkVolumeId);
                    continue;
                }
                byId.set(replica.networkVolumeId, {
                    ...existing,
                    sizeGb: Math.max(existing.sizeGb, replica.sizeGb),
                    cacheStatus: cacheRank[replica.cacheStatus] > cacheRank[existing.cacheStatus]
                        ? replica.cacheStatus
                        : existing.cacheStatus
                });
                continue;
            }
            byId.set(replica.networkVolumeId, replica);
        }
        for (const id of invalidIds) byId.delete(id);
        return [...byId.values()];
    }

    function runtimeProfileCertified(profile, runtimeEvidence = null) {
        if (profile.runtimePreflightCertified === true) return true;
        const persistedEvidence = runpodEvidenceStates().filter(evidence =>
            evidence?.terminationVerified === true &&
            ["TERMINATED", "RELEASED"].includes(String(evidence?.phase || "").toUpperCase())
        );
        return [
            ...persistedEvidence,
            ...(Array.isArray(runtimeEvidence) ? runtimeEvidence : [])
        ].some(evidence =>
            evidence?.runtimePreflightVerified === true &&
            String(evidence?.gpuTypeId || "") === profile.gpuTypeId &&
            String(evidence?.computeCapability || "") === profile.computeCapability &&
            String(evidence?.provisionImageTag || "") === profile.provisionImageTag &&
            String(evidence?.expectedRegistryDigest || "") === profile.expectedRegistryDigest &&
            String(evidence?.modelRevision || "") === profile.modelRevision &&
            String(evidence?.wanRepositoryRevision || "") === profile.wanRepositoryRevision
        );
    }

    function selectPlacement({
        job,
        inventory,
        cacheReplicas = null,
        networkVolumes = null,
        runtimeEvidence = null
    }) {
        const liveInventory = Array.isArray(inventory) ? inventory : [];
        const replicas = certifiedCacheReplicas(cacheReplicas, networkVolumes);
        const candidates = [];
        const rejected = [];
        const stockRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        const cacheRank = { CACHE_HIT: 0, CACHE_READY: 0, CACHE_MODEL_READY: 1, CACHE_MISS: 2 };
        for (const observation of liveInventory) {
            const observedGpuTypeId = String(observation?.gpuTypeId || "").trim();
            const dataCenterId = String(observation?.dataCenterId || "").trim();
            const profile = RUNPOD_WAN22_GPU_PROFILES[observedGpuTypeId] || null;
            const stockStatus = String(observation?.stockStatus || "").trim().toUpperCase();
            const hourlyRateUsd = Number(observation?.hourlyRateUsd);
            let reason = null;
            if (!profile) reason = "RUNPOD_GPU_CAPABILITY_PROFILE_UNAVAILABLE";
            else if (observation?.available !== true || !Object.hasOwn(stockRank, stockStatus)) {
                reason = "RUNPOD_COMPATIBLE_GPU_UNAVAILABLE";
            }
            else if (observation?.secureCloud !== true || !dataCenterId) {
                reason = "RUNPOD_SECURE_CLOUD_CAPABILITY_REQUIRED";
            }
            else if (
                Number(observation?.vramGb || 0) < profile.minimumVramGb ||
                Number(observation?.minimumRamGb || 0) < profile.minimumRamGb ||
                Number(observation?.minimumVcpu || 0) < profile.minimumVcpu ||
                (observation?.computeCapability != null &&
                    String(observation.computeCapability) !== profile.computeCapability)
            ) {
                reason = "RUNPOD_GPU_RESOURCE_PROFILE_INSUFFICIENT";
            }
            else if (!Number.isFinite(hourlyRateUsd) || hourlyRateUsd <= 0) {
                reason = "RUNPOD_HOURLY_RATE_INVALID";
            }
            else if (observation?.networkVolumeSupported !== true) {
                reason = "RUNPOD_NETWORK_VOLUME_TYPE_NOT_APPROVED";
            }
            else if (!runtimeProfileCertified(profile, runtimeEvidence)) {
                reason = "RUNPOD_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED";
            }
            if (reason) {
                rejected.push({ gpuTypeId: observedGpuTypeId, dataCenterId, reason });
                continue;
            }
            const localReplicas = replicas.filter(replica =>
                replica.dataCenterId === dataCenterId &&
                replica.type === profile.networkVolumeType &&
                replica.sizeGb >= profile.minimumNetworkVolumeGb
            );
            const placements = localReplicas.length > 0 ? localReplicas : [{
                networkVolumeId: null,
                dataCenterId,
                sizeGb: profile.minimumNetworkVolumeGb,
                type: profile.networkVolumeType,
                cacheStatus: "CACHE_MISS",
                shaVerified: false
            }];
            for (const replica of placements) {
                candidates.push({
                    gpuTypeId: observedGpuTypeId,
                    computeCapability: profile.computeCapability,
                    dataCenterId,
                    networkVolumeId: replica.networkVolumeId,
                    networkVolumeType: replica.type,
                    networkVolumeSizeGb: replica.sizeGb,
                    cacheStatus: replica.cacheStatus,
                    cacheShaVerified: replica.shaVerified,
                    requiresCacheReplica: !replica.networkVolumeId,
                    storageRequiredGb: profile.minimumNetworkVolumeGb,
                    hourlyRateUsd,
                    stockStatus,
                    runtimePreflightCertified: true,
                    missionId: job.missionId,
                    objectiveId: job.objectiveId,
                    obligationId: job.obligationId,
                    rootInstructionHash: job.rootInstructionHash
                });
            }
        }
        candidates.sort((left, right) =>
            Number(left.requiresCacheReplica) - Number(right.requiresCacheReplica) ||
            cacheRank[left.cacheStatus] - cacheRank[right.cacheStatus] ||
            left.hourlyRateUsd - right.hourlyRateUsd ||
            stockRank[left.stockStatus] - stockRank[right.stockStatus] ||
            left.gpuTypeId.localeCompare(right.gpuTypeId) ||
            left.dataCenterId.localeCompare(right.dataCenterId) ||
            String(left.networkVolumeId || "").localeCompare(String(right.networkVolumeId || ""))
        );
        if (candidates.length < 1) {
            const onlyCertificationGap = rejected.length > 0 && rejected.every(item =>
                item.reason === "RUNPOD_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED"
            );
            throw new Error(onlyCertificationGap
                ? "RUNPOD_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED"
                : "RUNPOD_COMPATIBLE_GPU_UNAVAILABLE");
        }
        let selected = candidates[0];
        if (paidResourceCreationAuthorized) {
            if (!gpuTypeId || !networkVolumeId) {
                throw new Error("RUNPOD_EXACT_PAID_PLACEMENT_AUTHORITY_REQUIRED");
            }
            selected = candidates.find(candidate =>
                candidate.gpuTypeId === gpuTypeId &&
                candidate.networkVolumeId === networkVolumeId
            );
            if (!selected) throw new Error("RUNPOD_AUTHORIZED_PLACEMENT_UNAVAILABLE");
            if (selected.hourlyRateUsd > configuredTotalHourlyRateUsd) {
                throw new Error("RUNPOD_AUTHORIZED_PRICE_EXCEEDED");
            }
        }
        return { selected, candidates, rejected, replicas };
    }

    function expectedCacheStatus(networkVolume) {
        if (!networkVolume?.id) return "CACHE_MISS";
        const replica = certifiedCacheReplicas().find(item =>
            item.networkVolumeId === networkVolume.id &&
            item.dataCenterId === networkVolume.dataCenterId
        );
        if (["CACHE_READY", "CACHE_HIT"].includes(replica?.cacheStatus)) {
            return "CACHE_HIT_EXPECTED_PHYSICAL_VERIFY_REQUIRED";
        }
        if (replica?.cacheStatus === "CACHE_MODEL_READY") {
            return "CACHE_MODEL_READY_PHYSICAL_VERIFY_REQUIRED";
        }
        const states = fs.existsSync(stateRoot)
            ? fs.readdirSync(stateRoot)
                .filter(name => name.endsWith(".json"))
                .map(name => {
                    try { return readJson(path.join(stateRoot, name)); }
                    catch { return null; }
                })
                .filter(Boolean)
            : [];
        const reusable = states.some(state =>
            state.networkVolumeId === networkVolume.id &&
            state.runtimePreflightVerified === true &&
            ["CACHE_READY", "CACHE_HIT"].includes(String(state.cacheStatus || ""))
        );
        if (reusable) return "CACHE_HIT_EXPECTED_PHYSICAL_VERIFY_REQUIRED";
        const modelReady = states.some(state =>
            state.networkVolumeId === networkVolume.id &&
            state.modelIntegrityVerified === true &&
            state.runtimePreflightVerified !== true &&
            state.cacheStatus === "CACHE_MODEL_READY"
        );
        return modelReady ? "CACHE_MODEL_READY_PHYSICAL_VERIFY_REQUIRED" : "CACHE_MISS";
    }

    function normalizedPlannedNetworkVolume(networkVolume, selectedNetworkVolumeId = networkVolumeId, profile = cacheContract) {
        if (!selectedNetworkVolumeId) return null;
        const id = String(networkVolume?.id || "").trim();
        const dataCenterId = String(networkVolume?.dataCenterId || "").trim();
        const sizeGb = Number(networkVolume?.sizeGb || 0);
        const type = String(networkVolume?.type || networkVolume?.volumeType || "").trim().toUpperCase();
        if (id !== selectedNetworkVolumeId || !dataCenterId || !Number.isFinite(sizeGb) || !type) {
            throw new Error("RUNPOD_NETWORK_VOLUME_RESPONSE_INVALID");
        }
        if (sizeGb < profile.minimumNetworkVolumeGb) {
            throw new Error("RUNPOD_NETWORK_VOLUME_CAPACITY_INSUFFICIENT");
        }
        if (type !== profile.networkVolumeType) {
            throw new Error("RUNPOD_NETWORK_VOLUME_TYPE_NOT_APPROVED");
        }
        return { id, dataCenterId, sizeGb, type };
    }

    function buildProvisionBody(
        job,
        publicKey,
        networkVolume = null,
        selectedGpuTypeId = gpuTypeId,
        profile = cacheContract,
        selectedDataCenterId = networkVolume?.dataCenterId || (
            runtimeCertificationOnly ? runtimeCertificationDataCenterId : null
        )
    ) {
        const body = {
            cloudType,
            computeType: "GPU",
            containerDiskInGb,
            volumeMountPath: "/workspace",
            gpuCount: 1,
            gpuTypeIds: [selectedGpuTypeId],
            gpuTypePriority: "custom",
            imageName: profile.provisionImageTag,
            interruptible: false,
            minRAMPerGPU: minimumRamGb,
            minVCPUPerGPU: minimumVcpu,
            ports: ["22/tcp"],
            supportPublicIp: true,
            name: `jarvis-v142-${obligationFingerprint(job).slice(0, 24)}`,
            env: {
                PUBLIC_KEY: String(publicKey || ""),
                JARVIS_OPERATION_ID: job.operationId,
                JARVIS_OBLIGATION_FINGERPRINT: obligationFingerprint(job)
            }
        };
        if (networkVolume) {
            body.networkVolumeId = networkVolume.id;
            body.dataCenterIds = [networkVolume.dataCenterId];
        }
        else {
            body.volumeInGb = volumeInGb;
            if (selectedDataCenterId) body.dataCenterIds = [selectedDataCenterId];
        }
        return body;
    }

    function assertProvisionBody(
        body,
        networkVolume = null,
        selectedGpuTypeId = gpuTypeId,
        profile = cacheContract
    ) {
        if (
            body.cloudType !== cloudType || body.computeType !== "GPU" ||
            body.containerDiskInGb !== containerDiskInGb || body.volumeMountPath !== "/workspace" ||
            body.gpuCount !== 1 || body.gpuTypeIds?.length !== 1 ||
            body.gpuTypeIds[0] !== selectedGpuTypeId || body.imageName !== profile.provisionImageTag ||
            /@sha256:/i.test(body.imageName) ||
            body.interruptible !== false || body.minRAMPerGPU < profile.minimumRamGb ||
            body.minVCPUPerGPU < profile.minimumVcpu ||
            !Array.isArray(body.ports) || !body.ports.includes("22/tcp") ||
            !String(body.env?.PUBLIC_KEY || "").trim() ||
            !String(body.env?.JARVIS_OPERATION_ID || "").trim() ||
            !/^[a-f0-9]{64}$/.test(String(body.env?.JARVIS_OBLIGATION_FINGERPRINT || ""))
        ) {
            throw new Error("RUNPOD_PROVISION_PAYLOAD_INCOMPLETE");
        }
        if (networkVolume) {
            if (
                body.cloudType !== "SECURE" || body.networkVolumeId !== networkVolume.id ||
                body.dataCenterIds?.length !== 1 || body.dataCenterIds[0] !== networkVolume.dataCenterId ||
                Object.hasOwn(body, "volumeInGb")
            ) {
                throw new Error("RUNPOD_NETWORK_VOLUME_PAYLOAD_INVALID");
            }
        }
        else if (body.volumeInGb !== volumeInGb || Object.hasOwn(body, "networkVolumeId")) {
            throw new Error("RUNPOD_EPHEMERAL_VOLUME_PAYLOAD_INVALID");
        }
        const expectedRuntimeCertificationDataCenterId =
            networkVolume?.dataCenterId || runtimeCertificationDataCenterId || null;
        if (runtimeCertificationOnly && (
            body.cloudType !== "SECURE" ||
            (expectedRuntimeCertificationDataCenterId
                ? (
                    body.dataCenterIds?.length !== 1 ||
                    body.dataCenterIds[0] !== expectedRuntimeCertificationDataCenterId
                )
                : Object.hasOwn(body, "dataCenterIds"))
        )) {
            throw new Error("RUNPOD_RUNTIME_CERTIFICATION_PLACEMENT_INVALID");
        }
    }

    function inspectZeroCostPrecheck({
        job,
        networkVolume = null,
        availability = null,
        inventory = null,
        networkVolumes = null,
        cacheReplicas = null,
        runtimeEvidence = null,
        registryVerification = null
    } = {}) {
        try {
            const dynamicPlacement = Array.isArray(inventory);
            assertZeroCostConfiguration(job, { allowDynamicPlacement: dynamicPlacement });
            assertNoLocalDuplicateObligation(job);
            let selectedGpuTypeId = gpuTypeId;
            let selectedProfile = cacheContract;
            let selectedAvailability = availability;
            let plannedVolume = null;
            let placement = null;
            if (dynamicPlacement) {
                if (cloudType !== "SECURE") throw new Error("RUNPOD_NETWORK_VOLUME_SECURE_CLOUD_REQUIRED");
                placement = selectPlacement({
                    job,
                    inventory,
                    cacheReplicas,
                    networkVolumes,
                    runtimeEvidence
                });
                selectedGpuTypeId = placement.selected.gpuTypeId;
                selectedProfile = RUNPOD_WAN22_GPU_PROFILES[selectedGpuTypeId];
                selectedAvailability = placement.selected;
                plannedVolume = placement.selected.networkVolumeId
                    ? normalizedPlannedNetworkVolume({
                        id: placement.selected.networkVolumeId,
                        dataCenterId: placement.selected.dataCenterId,
                        sizeGb: placement.selected.networkVolumeSizeGb,
                        type: placement.selected.networkVolumeType
                    }, placement.selected.networkVolumeId, selectedProfile)
                    : null;
            }
            else {
                plannedVolume = normalizedPlannedNetworkVolume(networkVolume);
            }
            const verifiedRegistry = normalizedRegistryVerification(selectedProfile, registryVerification);
            if (!dynamicPlacement && availability) {
                if (
                    availability.gpuTypeId !== gpuTypeId ||
                    availability.available === false ||
                    Number(availability.vramGb || 0) < cacheContract.minimumVramGb ||
                    !["HIGH", "MEDIUM", "LOW"].includes(String(availability.stockStatus || "").toUpperCase()) ||
                    !Number.isFinite(Number(availability.hourlyRateUsd)) || Number(availability.hourlyRateUsd) <= 0
                ) {
                    throw new Error("RUNPOD_COMPATIBLE_GPU_UNAVAILABLE");
                }
            }
            const operationDir = path.join(stateRoot, job.operationId);
            const assets = buildAssetManifest(job, operationDir);
            if (!runtimeCertificationOnly && assets.length < 1) {
                throw new Error("RUNPOD_REFERENCE_ASSET_REQUIRED");
            }
            const body = placement?.selected?.requiresCacheReplica
                ? null
                : buildProvisionBody(
                    job,
                    "[EPHEMERAL_PUBLIC_KEY]",
                    plannedVolume,
                    selectedGpuTypeId,
                    selectedProfile
                );
            if (body) {
                assertProvisionBody(body, plannedVolume, selectedGpuTypeId, selectedProfile);
            }
            const hourlyRateUsd = Number(
                selectedAvailability?.hourlyRateUsd || configuredTotalHourlyRateUsd
            );
            if (!(hourlyRateUsd > 0)) throw new Error("RUNPOD_HOURLY_RATE_INVALID");
            if (
                paidResourceCreationAuthorized && selectedAvailability &&
                hourlyRateUsd > configuredTotalHourlyRateUsd
            ) {
                throw new Error("RUNPOD_AUTHORIZED_PRICE_EXCEEDED");
            }
            const maximumSpendBeforeCleanupUsd = Number((hardBudgetUsd * budgetStopRatio).toFixed(6));
            const maximumAuthorizedSeconds = Math.floor(
                maximumSpendBeforeCleanupUsd * 3600 / hourlyRateUsd
            );
            return {
                ok: true,
                phase: "ZERO_COST_PRECHECK",
                canonicalSha: configuredCanonicalSha,
                bridgeIdentity: "BRIDGE_IDENTITY_OK",
                policy: configuredPolicy,
                backend: configuredBackend,
                status: placement?.selected?.requiresCacheReplica
                    ? "PLACEMENT_REQUIRES_CACHE_REPLICA"
                    : "ZERO_COST_PRECHECK_READY",
                paidResourceCreationAuthorized,
                paidResourceCreationPossible: paidResourceCreationAuthorized && Boolean(apiKey) && Boolean(body),
                zeroCostChecks: [...RUNPOD_ZERO_COST_PRECHECKS],
                physicalPaidChecks: [...RUNPOD_PHYSICAL_PAID_PREFLIGHTS],
                payload: body,
                placement: placement ? {
                    selected: { ...placement.selected },
                    candidates: placement.candidates.map(candidate => ({ ...candidate })),
                    rejected: placement.rejected.map(candidate => ({ ...candidate })),
                    certifiedCacheReplicas: placement.replicas.map(replica => ({ ...replica }))
                } : null,
                economics: {
                    hourlyRateUsd,
                    hardBudgetUsd,
                    stopRatio: budgetStopRatio,
                    maximumSpendBeforeCleanupUsd,
                    maximumAuthorizedSeconds
                },
                cache: {
                    profile: selectedProfile.profile,
                    expectedStatus: dynamicPlacement
                        ? (placement.selected.cacheStatus === "CACHE_MODEL_READY"
                            ? "CACHE_MODEL_READY_PHYSICAL_VERIFY_REQUIRED"
                            : (["CACHE_READY", "CACHE_HIT"].includes(placement.selected.cacheStatus)
                                ? "CACHE_HIT_EXPECTED_PHYSICAL_VERIFY_REQUIRED"
                                : "CACHE_MISS"))
                        : expectedCacheStatus(plannedVolume),
                    modelBytes: selectedProfile.expectedModelBytes,
                    workspaceReserveBytes: selectedProfile.workspaceReserveBytes,
                    peakWorkspaceBytes: selectedProfile.peakWorkspaceBytes,
                    minimumNetworkVolumeGb: selectedProfile.minimumNetworkVolumeGb,
                    modelPath: `${remoteBase}/cache/wan22-ti2v-5b/model`,
                    repositoryPath: `${remoteBase}/cache/wan22-ti2v-5b/Wan2.2`,
                    virtualEnvironmentPath: `${remoteBase}/cache/wan22-ti2v-5b/venv`,
                    huggingFaceMetadataPath: `${remoteBase}/cache/wan22-ti2v-5b/model/.cache/huggingface`,
                    temporaryBuildPath: "/tmp"
                },
                assets: assets.map(asset => ({
                    output: asset.output,
                    role: asset.role,
                    bytes: asset.bytes,
                    sha256: asset.sha256,
                    remoteFile: asset.remoteFile
                })),
                contract: {
                    gpuTypeId: selectedGpuTypeId,
                    computeCapability: selectedProfile.computeCapability,
                    provisionImageTag: selectedProfile.provisionImageTag,
                    expectedRegistryDigest: selectedProfile.expectedRegistryDigest,
                    registryVerification: verifiedRegistry,
                    runtimeIdentity: { ...selectedProfile.runtimeIdentity },
                    modelRepository: selectedProfile.modelRepository,
                    modelRevision: selectedProfile.modelRevision,
                    wanRepositoryRevision: selectedProfile.wanRepositoryRevision,
                    requirementsSha256: selectedProfile.requirementsSha256,
                    requiredFiles: selectedProfile.requiredFiles.map(item => ({ ...item }))
                }
            };
        }
        catch(error) {
            return {
                ok: false,
                phase: "ZERO_COST_PRECHECK",
                status: error?.message || "RUNPOD_ZERO_COST_PRECHECK_FAILED",
                error: error?.message || "RUNPOD_ZERO_COST_PRECHECK_FAILED",
                paidResourceCreationAuthorized,
                paidResourceCreationPossible: false
            };
        }
    }

    function inspectCpuStagingPrecheck({
        job = null,
        containerDiskInGb = RUNPOD_CPU_STAGING_PROFILE.containerDiskInGb,
        networkVolume = null,
        inventory = null,
        registryVerification = null,
        sshKeyRegistered = false,
        startupContract = RUNPOD_CPU_STAGING_PROFILE.dockerStartCmd
    } = {}) {
        try {
            assertZeroCostConfiguration(job);
            const verifiedRegistry = normalizedRegistryVerification(
                RUNPOD_CPU_STAGING_PROFILE,
                registryVerification
            );
            if (paidResourceCreationAuthorized !== false) {
                throw new Error("RUNPOD_CPU_STAGING_READ_ONLY_AUTHORITY_REQUIRED");
            }
            if (gpuTypeId !== "NVIDIA L40S" || cacheContract?.computeCapability !== "8.9") {
                throw new Error("RUNPOD_CPU_STAGING_L40S_PROFILE_REQUIRED");
            }
            const expectedStartCommand = RUNPOD_CPU_STAGING_PROFILE.dockerStartCmd;
            if (
                !Array.isArray(startupContract) ||
                startupContract.length !== expectedStartCommand.length ||
                !expectedStartCommand.every((entry, index) => startupContract[index] === entry) ||
                !RUNPOD_CPU_STAGING_PROFILE.ports.includes(
                    RUNPOD_CPU_STAGING_PROFILE.startupContract.sshPort
                )
            ) {
                throw new Error("RUNPOD_CPU_RUNTIME_STARTUP_CONTRACT_REQUIRED");
            }
            if (sshKeyRegistered !== true) {
                throw new Error("RUNPOD_CPU_SSH_KEY_REGISTERED_REQUIRED");
            }
            const plannedVolume = normalizedPlannedNetworkVolume(networkVolume);
            if (!plannedVolume || plannedVolume.dataCenterId !== RUNPOD_CPU_STAGING_PROFILE.dataCenterId) {
                throw new Error("RUNPOD_CPU_STAGING_NETWORK_VOLUME_REQUIRED");
            }
            const flavor = String(inventory?.cpuFlavorId || "");
            const dataCenterId = String(inventory?.dataCenterId || "");
            const minimumVcpuAvailable = Number(inventory?.minimumVcpu || 0);
            const ramMultiplier = Number(inventory?.ramMultiplier || 0);
            const securePriceUsdPerHour = Number(inventory?.securePriceUsdPerHour);
            const stockStatus = inventory?.stockStatus ?? null;
            if (
                flavor !== RUNPOD_CPU_STAGING_PROFILE.cpuFlavorId ||
                dataCenterId !== RUNPOD_CPU_STAGING_PROFILE.dataCenterId ||
                minimumVcpuAvailable !== RUNPOD_CPU_STAGING_PROFILE.minimumVcpu ||
                !RUNPOD_CPU_STAGING_PROFILE.supportedVcpuCounts.includes(minimumVcpuAvailable) ||
                ramMultiplier !== RUNPOD_CPU_STAGING_PROFILE.ramGbPerVcpu ||
                ramMultiplier * RUNPOD_CPU_STAGING_PROFILE.minimumVcpu < RUNPOD_CPU_STAGING_PROFILE.ramGb ||
                !Number.isFinite(securePriceUsdPerHour) || securePriceUsdPerHour <= 0
            ) {
                throw new Error("RUNPOD_CPU_STAGING_INVENTORY_INCOMPATIBLE");
            }
            const requestedContainerDiskGb = Number(containerDiskInGb);
            if (!Number.isInteger(requestedContainerDiskGb) || requestedContainerDiskGb <= 0) {
                throw new Error("RUNPOD_CPU_CONTAINER_DISK_INVALID");
            }
            if (requestedContainerDiskGb > RUNPOD_CPU_STAGING_PROFILE.maximumContainerDiskGb) {
                throw new Error("RUNPOD_CPU_CONTAINER_DISK_EXCEEDS_PROVIDER_LIMIT");
            }
            const documentedStock = new Set(["HIGH", "MEDIUM", "LOW"]);
            const normalizedStockStatus = stockStatus === null ? null : String(stockStatus).toUpperCase();
            if (normalizedStockStatus !== null && !documentedStock.has(normalizedStockStatus)) {
                throw new Error("RUNPOD_CPU_STAGING_STOCK_CONTRACT_AMBIGUOUS");
            }
            const liveCapacityConfirmed = documentedStock.has(normalizedStockStatus);
            const payload = {
                cloudType: RUNPOD_CPU_STAGING_PROFILE.cloudType,
                computeType: RUNPOD_CPU_STAGING_PROFILE.computeType,
                containerDiskInGb: requestedContainerDiskGb,
                cpuFlavorIds: [RUNPOD_CPU_STAGING_PROFILE.cpuFlavorId],
                cpuFlavorPriority: RUNPOD_CPU_STAGING_PROFILE.cpuFlavorPriority,
                dataCenterIds: [RUNPOD_CPU_STAGING_PROFILE.dataCenterId],
                dataCenterPriority: RUNPOD_CPU_STAGING_PROFILE.dataCenterPriority,
                dockerStartCmd: [...expectedStartCommand],
                imageName: RUNPOD_CPU_STAGING_PROFILE.provisionImageTag,
                interruptible: RUNPOD_CPU_STAGING_PROFILE.interruptible,
                networkVolumeId: plannedVolume.id,
                ports: [...RUNPOD_CPU_STAGING_PROFILE.ports],
                supportPublicIp: RUNPOD_CPU_STAGING_PROFILE.supportPublicIp,
                vcpuCount: RUNPOD_CPU_STAGING_PROFILE.minimumVcpu,
                volumeMountPath: RUNPOD_CPU_STAGING_PROFILE.networkVolumeMountPath
            };
            const bootstrapOperationId = job?.operationId || (job
                ? `cpu-model-${obligationFingerprint(job).slice(0, 24)}`
                : "cpu-model-staging-precheck");
            return {
                ok: true,
                phase: "CPU_STAGING_READ_ONLY_PRECHECK",
                status: liveCapacityConfirmed
                    ? "CPU_STAGING_AVAILABLE_READ_ONLY"
                    : "CPU_STAGING_COMPATIBLE_CAPACITY_UNCONFIRMED",
                paidResourceCreationAuthorized: false,
                resourceCreationPossible: false,
                liveCapacityConfirmed,
                stockStatus: normalizedStockStatus,
                payload,
                economics: {
                    hourlyRateUsd: securePriceUsdPerHour,
                    estimatedThirtyMinutesUsd: Number((securePriceUsdPerHour / 2).toFixed(6)),
                    networkVolumeStorageExcluded: true
                },
                cache: {
                    profile: cacheContract.profile,
                    cpuCompletionStatus: RUNPOD_CPU_STAGING_PROFILE.cacheStatus,
                    runtimeVerificationStatus: RUNPOD_CPU_STAGING_PROFILE.runtimeStatus,
                    bootstrapPhase: RUNPOD_CPU_STAGING_PROFILE.bootstrapPhase,
                    maximumBootstrapCacheStatus: RUNPOD_CPU_STAGING_PROFILE.maximumBootstrapCacheStatus,
                    allowedStages: [...RUNPOD_CPU_STAGING_PROFILE.allowedStages],
                    forbiddenCertifications: [...RUNPOD_CPU_STAGING_PROFILE.forbiddenCertifications]
                },
                bootstrap: {
                    phase: RUNPOD_BOOTSTRAP_PHASES.CPU_MODEL_STAGING,
                    packages: [...RUNPOD_CPU_MODEL_STAGING_PACKAGES],
                    maximumCacheStatus: RUNPOD_CPU_STAGING_PROFILE.maximumBootstrapCacheStatus,
                    durableIdentity: job ? {
                        missionId: job.missionId,
                        objectiveId: job.objectiveId,
                        obligationId: job.obligationId,
                        rootInstructionHash: job.rootInstructionHash,
                        operationId: bootstrapOperationId
                    } : null,
                    script: buildCpuModelStagingBootstrap(bootstrapOperationId)
                },
                contract: {
                    maximumContainerDiskGb: RUNPOD_CPU_STAGING_PROFILE.maximumContainerDiskGb,
                    dataCenterId: RUNPOD_CPU_STAGING_PROFILE.dataCenterId,
                    networkVolumeType: RUNPOD_CPU_STAGING_PROFILE.networkVolumeType,
                    minimumNetworkVolumeGb: RUNPOD_CPU_STAGING_PROFILE.minimumNetworkVolumeGb,
                    supportedVcpuCounts: [...RUNPOD_CPU_STAGING_PROFILE.supportedVcpuCounts],
                    ramGbPerVcpu: RUNPOD_CPU_STAGING_PROFILE.ramGbPerVcpu,
                    provisionImageTag: RUNPOD_CPU_STAGING_PROFILE.provisionImageTag,
                    expectedRegistryDigest: RUNPOD_CPU_STAGING_PROFILE.expectedRegistryDigest,
                    dockerStartCmd: [...expectedStartCommand],
                    startupContract: {
                        ...RUNPOD_CPU_STAGING_PROFILE.startupContract,
                        requiredEnvironment: [
                            ...RUNPOD_CPU_STAGING_PROFILE.startupContract.requiredEnvironment
                        ]
                    },
                    registryVerification: verifiedRegistry,
                    runtimeIdentity: {
                        ...RUNPOD_CPU_STAGING_PROFILE.runtimeIdentity,
                        requiredCommands: [...RUNPOD_CPU_STAGING_PROFILE.runtimeIdentity.requiredCommands],
                        bootstrapRequiredCommands: [
                            ...RUNPOD_CPU_STAGING_PROFILE.runtimeIdentity.bootstrapRequiredCommands
                        ],
                        forbiddenTools: [...RUNPOD_CPU_STAGING_PROFILE.runtimeIdentity.forbiddenTools]
                    }
                }
            };
        }
        catch(error) {
            return {
                ok: false,
                phase: "CPU_STAGING_READ_ONLY_PRECHECK",
                status: error?.message || "RUNPOD_CPU_STAGING_PRECHECK_FAILED",
                error: error?.message || "RUNPOD_CPU_STAGING_PRECHECK_FAILED",
                paidResourceCreationAuthorized: false,
                resourceCreationPossible: false,
                liveCapacityConfirmed: false
            };
        }
    }

    function inspectCpuStagingRuntimeIdentity({
        health = null,
        previousHealth = null,
        timedOut = false
    } = {}) {
        const failed = (status, { retryable = false, deleteRequired = !retryable } = {}) => ({
            ok: false,
            status,
            error: status,
            cpuRuntimeReady: false,
            cacheWriteAuthorized: false,
            cacheModelReady: false,
            inferenceStarted: false,
            retryable,
            deleteRequired,
            cudaVerified: false,
            l40sVerified: false
        });
        const pending = status => timedOut
            ? failed("RUNPOD_CPU_RUNTIME_TIMEOUT")
            : failed(status, { retryable: true, deleteRequired: false });
        const expected = RUNPOD_CPU_STAGING_PROFILE.runtimeIdentity;
        const commands = health?.commands && typeof health.commands === "object"
            ? health.commands
            : {};
        if (health?.publicKeyPresent === false) {
            return failed("RUNPOD_CPU_PUBLIC_KEY_MISSING");
        }
        if (health?.sshdRunning === false || commands.sshd === false) {
            return failed("RUNPOD_CPU_SSHD_NOT_RUNNING");
        }
        if (health?.authorizedKeyMatches === false) {
            return failed("RUNPOD_CPU_AUTHORIZED_KEY_MISMATCH");
        }
        if (String(health?.podStatus || "").toUpperCase() !== "RUNNING") {
            return pending("RUNPOD_CPU_RUNTIME_STARTING");
        }
        const uptimeSeconds = Number(health?.uptimeSeconds || 0);
        const previousUptimeSeconds = Number(previousHealth?.uptimeSeconds || 0);
        if (!(uptimeSeconds > 0) || !(previousUptimeSeconds > 0) || uptimeSeconds <= previousUptimeSeconds) {
            return pending("RUNPOD_CPU_RUNTIME_STARTING");
        }
        const endpointHost = String(health?.sshEndpoint?.host || "");
        const endpointPort = Number(health?.sshEndpoint?.port || 0);
        const previousHost = String(previousHealth?.sshEndpoint?.host || "");
        const previousPort = Number(previousHealth?.sshEndpoint?.port || 0);
        if (
            endpointHost.length === 0 || endpointPort <= 0 ||
            endpointHost !== previousHost || endpointPort !== previousPort ||
            Number(health?.stableSshEndpointPolls || 0) <
                RUNPOD_CPU_STAGING_PROFILE.startupContract.minimumStableEndpointPolls
        ) {
            return pending("RUNPOD_CPU_SSH_NOT_STABLE");
        }
        if (health?.sshHandshake !== true || health?.sshAuthenticated !== true) {
            return pending("RUNPOD_CPU_SSH_NOT_READY");
        }
        if (
            health?.publicKeyPresent !== true || health?.sshdRunning !== true ||
            health?.authorizedKeyMatches !== true || commands.sshd !== true
        ) {
            return failed("RUNPOD_CPU_RUNTIME_IDENTITY_MISMATCH");
        }
        if (String(health?.sshUser || "") !== "root") {
            return failed("RUNPOD_CPU_SSH_USER_MISMATCH");
        }
        if (
            String(health?.operatingSystem || "") !== expected.operatingSystem ||
            health?.caCertificates !== true ||
            String(health?.mountPath || "") !== expected.mountPath ||
            health?.mountWritable !== true ||
            !expected.requiredCommands.every(command => commands[command] === true) ||
            health?.cuda === true || health?.nvcc === true || health?.flashAttention === true
        ) {
            return failed("RUNPOD_CPU_RUNTIME_IDENTITY_MISMATCH");
        }
        return {
            ok: true,
            status: "CPU_RUNTIME_READY",
            cpuRuntimeReady: true,
            cacheWriteAuthorized: true,
            cacheModelReady: false,
            inferenceStarted: false,
            retryable: false,
            deleteRequired: false,
            cudaVerified: false,
            l40sVerified: false,
            runtimeIdentity: {
                ...expected,
                requiredCommands: [...expected.requiredCommands],
                bootstrapRequiredCommands: [...expected.bootstrapRequiredCommands],
                forbiddenTools: [...expected.forbiddenTools]
            }
        };
    }

    function readState(operation) {
        const file = stateFile(operation?.operationId);
        if (!fs.existsSync(file)) throw new Error("RUNPOD_OPERATION_STATE_NOT_FOUND");
        const state = readJson(file);
        if (
            state.operationName !== operation.operationName ||
            state.missionId !== operation.missionId ||
            state.objectiveId !== operation.objectiveId ||
            state.obligationId !== operation.obligationId ||
            state.rootInstructionHash !== operation.rootInstructionHash
        ) {
            throw new Error("RUNPOD_DURABLE_IDENTITY_MISMATCH");
        }
        return { file, state };
    }

    function writeState(file, state, patch = {}) {
        const next = { ...state, ...patch, updatedAt: now().toISOString() };
        atomicJsonWrite(file, next);
        return next;
    }

    function providerHttpPatch(state, error) {
        if (!error?.providerHttp) return {};
        return {
            providerHttp: error.providerHttp,
            providerHttpHistory: [
                ...(Array.isArray(state?.providerHttpHistory) ? state.providerHttpHistory : []),
                error.providerHttp
            ].slice(-10)
        };
    }

    function safeProviderDiagnostic(error) {
        const cause = error?.cause || error;
        const rawCode = String(cause?.code || error?.code || cause?.name || error?.name || "UNKNOWN");
        const providerCode = /^[A-Za-z0-9_.:-]{1,120}$/.test(rawCode)
            ? rawCode
            : "RUNPOD_TRANSPORT_ERROR";
        let providerMessage = String(cause?.message || error?.message || providerCode);
        for (const secret of [apiKey, encodeURIComponent(apiKey)]) {
            if (secret) providerMessage = providerMessage.split(secret).join("[REDACTED]");
        }
        providerMessage = providerMessage
            .replace(/[\u0000-\u001f\u007f]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500);
        return {
            providerCode,
            providerMessage: providerMessage || providerCode
        };
    }

    function sanitizeProviderText(value, maximumLength = 4000) {
        let text = String(value ?? "");
        for (const secret of [apiKey, encodeURIComponent(apiKey)]) {
            if (secret) text = text.split(secret).join("[REDACTED]");
        }
        text = text
            .replace(
                /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
                "[REDACTED PRIVATE KEY]"
            )
            .replace(
                /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))\s*=\s*[^\s"',;]+/gi,
                "$1=[REDACTED]"
            )
            .replace(/\bBearer\s+[^\s"',;]+/gi, "Bearer [REDACTED]")
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
            .trim();
        return text.slice(0, maximumLength);
    }

    function sanitizeProviderHeaders(headers) {
        const sanitized = {};
        const sensitiveNames = new Set([
            "authorization",
            "proxy-authorization",
            "cookie",
            "set-cookie",
            "x-api-key"
        ]);
        let entries = [];
        try {
            if (headers && typeof headers.entries === "function") entries = [...headers.entries()];
            else if (headers && typeof headers === "object") entries = Object.entries(headers);
        }
        catch {}
        for (const [rawName, rawValue] of entries.slice(0, 64)) {
            const name = String(rawName || "").trim().toLowerCase();
            if (!name || sensitiveNames.has(name)) continue;
            sanitized[name] = sanitizeProviderText(rawValue, 1000);
        }
        return sanitized;
    }

    function providerRequestId(headers) {
        for (const name of [
            "x-request-id",
            "request-id",
            "x-runpod-request-id",
            "runpod-request-id",
            "x-correlation-id",
            "correlation-id",
            "x-trace-id",
            "trace-id",
            "cf-ray"
        ]) {
            const value = String(headers?.[name] || "").trim();
            if (value) return value;
        }
        return null;
    }

    function safeProviderEndpoint(url) {
        try {
            const parsed = new URL(String(url));
            return `${parsed.origin}${parsed.pathname}`;
        }
        catch {
            return sanitizeProviderText(url, 1000).split("?")[0];
        }
    }

    async function apiRequest(
        url,
        options = {},
        accepted = [200],
        stage = "runpod_api",
        operationId = null
    ) {
        let response;
        try {
            response = await fetchImpl(url, {
                ...options,
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    ...(options.body ? { "Content-Type": "application/json" } : {}),
                    ...(options.headers || {})
                }
            });
        }
        catch(error) {
            const failure = new Error("RUNPOD_API_TRANSPORT_FAILED");
            failure.cause = error;
            Object.assign(failure, safeProviderDiagnostic(error));
            failure.retryable = true;
            failure.stage = stage;
            throw failure;
        }
        let text = "";
        if (Number(response.status) !== 204 && typeof response.text === "function") {
            try { text = await response.text(); }
            catch {}
        }
        const headers = sanitizeProviderHeaders(response.headers);
        const providerHttp = {
            status: Number(response.status || 0),
            body: sanitizeProviderText(text) || null,
            headers,
            requestId: providerRequestId(headers),
            stage,
            operationId: operationId || null,
            endpoint: safeProviderEndpoint(url),
            method: String(options.method || "GET").toUpperCase(),
            contentType: headers["content-type"] || null,
            timestampUtc: now().toISOString()
        };
        if (!accepted.includes(Number(response.status))) {
            const failure = new Error(`RUNPOD_API_HTTP_${Number(response.status || 0)}`);
            failure.retryable = Number(response.status) >= 500 || Number(response.status) === 429;
            failure.httpStatus = Number(response.status || 0);
            failure.stage = stage;
            failure.providerCode = `HTTP_${Number(response.status || 0)}`;
            failure.providerMessage = providerHttp.body || failure.message;
            failure.providerHttp = providerHttp;
            throw failure;
        }
        if (Number(response.status) === 204) return null;
        if (!text) return null;
        try { return JSON.parse(text); }
        catch { throw new Error("RUNPOD_API_RESPONSE_INVALID"); }
    }

    async function queryAvailability(dataCenterId = null, operationId = null) {
        const secureCloud = cloudType === "SECURE" ? "true" : "false";
        const dataCenterSelection = dataCenterId
            ? ` dataCenters { id gpuAvailability(input: { gpuCount: 1, secureCloud: true }) { gpuTypeId stockStatus available } }`
            : "";
        const query = `query { myself { id } gpuTypes(input: { id: ${JSON.stringify(gpuTypeId)} }) { id displayName memoryInGb lowestPrice(input: { gpuCount: 1, secureCloud: ${secureCloud} }) { stockStatus uninterruptablePrice availableGpuCounts } }${dataCenterSelection} }`;
        const separator = graphQlBase.includes("?") ? "&" : "?";
        const payload = await apiRequest(
            `${graphQlBase}${separator}api_key=${encodeURIComponent(apiKey)}`,
            { method: "POST", body: JSON.stringify({ query }) },
            [200],
            "availability",
            operationId
        );
        if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
            throw new Error("RUNPOD_AVAILABILITY_QUERY_FAILED");
        }
        if (!String(payload?.data?.myself?.id || "").trim()) {
            throw new Error("RUNPOD_AVAILABILITY_UNAUTHENTICATED");
        }
        const gpu = payload?.data?.gpuTypes?.[0];
        const price = gpu?.lowestPrice || {};
        const stockStatus = String(price.stockStatus || "").trim();
        const documentedAvailableStock = new Set(["HIGH", "MEDIUM", "LOW"]);
        const availableGpuCounts = price.availableGpuCounts;
        const requestedCountAvailable = availableGpuCounts == null
            ? true
            : Array.isArray(availableGpuCounts) && availableGpuCounts.map(Number).includes(1);
        if (
            gpu?.id !== gpuTypeId ||
            Number(gpu?.memoryInGb || 0) < cacheContract.minimumVramGb ||
            !documentedAvailableStock.has(stockStatus.toUpperCase()) ||
            !requestedCountAvailable
        ) {
            throw new Error("RUNPOD_COMPATIBLE_GPU_UNAVAILABLE");
        }
        const hourlyRateUsd = Number(price.uninterruptablePrice);
        if (!Number.isFinite(hourlyRateUsd) || !(hourlyRateUsd > 0)) {
            throw new Error("RUNPOD_HOURLY_RATE_INVALID");
        }
        if (dataCenterId) {
            const dataCenter = (Array.isArray(payload?.data?.dataCenters) ? payload.data.dataCenters : [])
                .find(item => String(item?.id || "") === dataCenterId);
            const candidate = (Array.isArray(dataCenter?.gpuAvailability) ? dataCenter.gpuAvailability : [])
                .find(item => String(item?.gpuTypeId || "") === gpuTypeId);
            if (!dataCenter || candidate?.available !== true || !documentedAvailableStock.has(String(candidate.stockStatus || "").toUpperCase())) {
                throw new Error("RUNPOD_NETWORK_VOLUME_DATACENTER_GPU_UNAVAILABLE");
            }
        }
        return {
            gpuTypeId: gpu.id,
            displayName: gpu.displayName || gpu.id,
            vramGb: Number(gpu.memoryInGb),
            hourlyRateUsd,
            stockStatus: price.stockStatus
        };
    }

    async function queryPlacementInventory(operationId = null) {
        if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
        if (typeof fetchImpl !== "function") throw new Error("RUNPOD_FETCH_UNAVAILABLE");
        const query = "query { myself { id } gpuTypes { id displayName memoryInGb lowestPrice(input: { gpuCount: 1, secureCloud: true }) { stockStatus uninterruptablePrice availableGpuCounts } } dataCenters { id gpuAvailability(input: { gpuCount: 1, secureCloud: true }) { gpuTypeId stockStatus available } } }";
        const separator = graphQlBase.includes("?") ? "&" : "?";
        const payload = await apiRequest(
            `${graphQlBase}${separator}api_key=${encodeURIComponent(apiKey)}`,
            { method: "POST", body: JSON.stringify({ query }) },
            [200],
            "placement_inventory",
            operationId
        );
        if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
            throw new Error("RUNPOD_AVAILABILITY_QUERY_FAILED");
        }
        if (!String(payload?.data?.myself?.id || "").trim()) {
            throw new Error("RUNPOD_AVAILABILITY_UNAUTHENTICATED");
        }
        const gpuCatalog = new Map(
            (Array.isArray(payload?.data?.gpuTypes) ? payload.data.gpuTypes : [])
                .filter(item => RUNPOD_WAN22_GPU_PROFILES[String(item?.id || "")])
                .map(item => [String(item.id), item])
        );
        const dataCenters = Array.isArray(payload?.data?.dataCenters) ? payload.data.dataCenters : [];
        const dataCenterSupport = new Map(await Promise.all(dataCenters.map(async dataCenter => {
            const dataCenterId = String(dataCenter?.id || "").trim();
            if (!dataCenterId) return [dataCenterId, false];
            let catalog;
            try {
                catalog = await apiRequest(
                    `${catalogApiBase}/datacenters/${encodeURIComponent(dataCenterId)}`,
                    { method: "GET" },
                    [200],
                    "placement_datacenter",
                    operationId
                );
            }
            catch(error) {
                if (Number(error?.httpStatus || 0) === 404) {
                    return [dataCenterId, false];
                }
                throw error;
            }
            const types = Array.isArray(catalog?.networkVolumeTypes)
                ? catalog.networkVolumeTypes.map(type => String(type || "").trim().toUpperCase())
                : [];
            return [dataCenterId, types.includes(RUNPOD_WAN22_CACHE_BASE.networkVolumeType)];
        })));
        const inventory = [];
        for (const dataCenter of dataCenters) {
            const dataCenterId = String(dataCenter?.id || "").trim();
            for (const availability of Array.isArray(dataCenter?.gpuAvailability)
                ? dataCenter.gpuAvailability
                : []) {
                const observedGpuTypeId = String(availability?.gpuTypeId || "").trim();
                const profile = RUNPOD_WAN22_GPU_PROFILES[observedGpuTypeId];
                const gpu = gpuCatalog.get(observedGpuTypeId);
                if (!profile || !gpu) continue;
                const price = gpu.lowestPrice || {};
                const availableGpuCounts = price.availableGpuCounts;
                const requestedCountAvailable = availableGpuCounts == null ||
                    (Array.isArray(availableGpuCounts) && availableGpuCounts.map(Number).includes(1));
                inventory.push({
                    gpuTypeId: observedGpuTypeId,
                    dataCenterId,
                    vramGb: Number(gpu.memoryInGb || 0),
                    computeCapability: profile.computeCapability,
                    minimumRamGb: profile.minimumRamGb,
                    minimumVcpu: profile.minimumVcpu,
                    hourlyRateUsd: Number(price.uninterruptablePrice),
                    stockStatus: String(availability?.stockStatus || price.stockStatus || "").toUpperCase(),
                    available: availability?.available === true && requestedCountAvailable,
                    secureCloud: true,
                    networkVolumeSupported: dataCenterSupport.get(dataCenterId) === true
                });
            }
        }
        return inventory;
    }

    async function queryKnownNetworkVolumes(operationId = null) {
        const payload = await apiRequest(
            `${apiBase}/networkvolumes`,
            { method: "GET" },
            [200],
            "placement_network_volumes",
            operationId
        );
        const volumes = Array.isArray(payload)
            ? payload
            : (Array.isArray(payload?.items) ? payload.items : []);
        return volumes.map(volume => ({
            id: String(volume?.id || "").trim(),
            dataCenterId: String(volume?.dataCenterId || volume?.dataCenter?.id || "").trim(),
            sizeGb: Number(volume?.sizeGb || volume?.size || volume?.sizeInGb || 0),
            type: String(volume?.type || volume?.volumeType || RUNPOD_WAN22_CACHE_BASE.networkVolumeType)
                .trim().toUpperCase()
        })).filter(volume => volume.id && volume.dataCenterId && Number.isFinite(volume.sizeGb));
    }

    async function inspectLiveZeroCostPrecheck({ job, runtimeEvidence = null } = {}) {
        try {
            assertZeroCostConfiguration(job, { allowDynamicPlacement: true });
            const [inventory, networkVolumes, registryVerification] = await Promise.all([
                queryPlacementInventory(job?.operationId || null),
                queryKnownNetworkVolumes(job?.operationId || null),
                resolveRegistryVerification(cacheContract || RUNPOD_WAN22_CACHE_BASE)
            ]);
            return inspectZeroCostPrecheck({
                job,
                inventory,
                networkVolumes,
                runtimeEvidence,
                registryVerification
            });
        }
        catch(error) {
            return {
                ok: false,
                phase: "ZERO_COST_PRECHECK",
                status: error?.message || "RUNPOD_ZERO_COST_PRECHECK_FAILED",
                error: error?.message || "RUNPOD_ZERO_COST_PRECHECK_FAILED",
                paidResourceCreationAuthorized,
                paidResourceCreationPossible: false
            };
        }
    }

    async function resolveNetworkVolume(operationId = null) {
        if (!networkVolumeId) return null;
        const volume = await apiRequest(
            `${apiBase}/networkvolumes/${encodeURIComponent(networkVolumeId)}`,
            { method: "GET" },
            [200],
            "network_volume",
            operationId
        );
        const id = String(volume?.id || "").trim();
        const dataCenterId = String(volume?.dataCenterId || volume?.dataCenter?.id || "").trim();
        const sizeGb = Number(volume?.size || volume?.sizeInGb || volume?.sizeGb || 0);
        if (id !== networkVolumeId || !dataCenterId || !Number.isFinite(sizeGb)) {
            throw new Error("RUNPOD_NETWORK_VOLUME_RESPONSE_INVALID");
        }
        if (sizeGb < cacheContract.minimumNetworkVolumeGb) {
            throw new Error("RUNPOD_NETWORK_VOLUME_CAPACITY_INSUFFICIENT");
        }
        const dataCenter = await apiRequest(
            `${catalogApiBase}/datacenters/${encodeURIComponent(dataCenterId)}?include=CPU_AVAILABILITY`,
            { method: "GET" },
            [200],
            "network_volume_datacenter",
            operationId
        );
        const networkVolumeTypes = Array.isArray(dataCenter?.networkVolumeTypes)
            ? dataCenter.networkVolumeTypes.map(type => String(type || "").trim().toUpperCase())
            : null;
        if (String(dataCenter?.id || "").trim() !== dataCenterId || !networkVolumeTypes) {
            throw new Error("RUNPOD_NETWORK_VOLUME_DATACENTER_RESPONSE_INVALID");
        }
        if (!networkVolumeTypes.includes(cacheContract.networkVolumeType)) {
            throw new Error("RUNPOD_NETWORK_VOLUME_TYPE_NOT_APPROVED");
        }
        return { id, dataCenterId, sizeGb, type: cacheContract.networkVolumeType };
    }

    async function terminatePod(podId, operationId, stage = "release") {
        const expectedPodId = String(podId || "").trim();
        if (!expectedPodId) throw new Error("RUNPOD_POD_ID_REQUIRED");
        await apiRequest(
            `${apiBase}/pods/${encodeURIComponent(expectedPodId)}`,
            { method: "DELETE" },
            [200, 204, 404],
            stage,
            operationId
        );
        let terminationVerified = false;
        try {
            const pod = await apiRequest(
                `${apiBase}/pods/${encodeURIComponent(expectedPodId)}`,
                { method: "GET" },
                [200],
                `${stage}_verify`,
                operationId
            );
            if (pod?.id && String(pod.id) !== expectedPodId) {
                throw new Error("RUNPOD_POD_IDENTITY_MISMATCH");
            }
            terminationVerified = !pod || String(pod.desiredStatus || "") === "TERMINATED";
        }
        catch(error) {
            terminationVerified = error?.httpStatus === 404;
            if (!terminationVerified) throw error;
        }
        if (!terminationVerified) throw new Error("RUNPOD_DELETE_NOT_VERIFIED");
        return { podId: expectedPodId, terminationVerified: true };
    }

    async function assertNoExistingOperationPod(job) {
        const payload = await apiRequest(
            `${apiBase}/pods`,
            { method: "GET" },
            [200],
            "duplicate_guard",
            job.operationId
        );
        const pods = Array.isArray(payload) ? payload : (Array.isArray(payload?.pods) ? payload.pods : null);
        if (!pods) {
            const failure = new Error("RUNPOD_POD_LIST_RESPONSE_INVALID");
            failure.retryable = false;
            failure.stage = "duplicate_guard";
            throw failure;
        }
        const expectedName = `jarvis-v142-${job.operationId}`;
        const durableFingerprint = obligationFingerprint(job);
        const durableSuffix = durableFingerprint.slice(0, 24);
        const matches = pods.filter(pod => {
            const name = String(pod?.name || "");
            return name === expectedName || name.endsWith(`-${durableSuffix}`) ||
                String(pod?.env?.JARVIS_OBLIGATION_FINGERPRINT || "") === durableFingerprint;
        });
        if (matches.length > 0) {
            const podIds = matches.map(pod => String(pod?.id || "").trim()).filter(Boolean);
            if (podIds.length !== matches.length) {
                const ambiguous = new Error("RUNPOD_EXISTING_OPERATION_POD_ID_INVALID");
                ambiguous.retryable = false;
                ambiguous.stage = "duplicate_guard";
                throw ambiguous;
            }
            for (const podId of podIds) {
                await apiRequest(
                    `${apiBase}/pods/${encodeURIComponent(podId)}`,
                    { method: "DELETE" },
                    [200, 204, 404],
                    "orphan_cleanup",
                    job.operationId
                );
                let remaining = null;
                try {
                    remaining = await apiRequest(
                        `${apiBase}/pods/${encodeURIComponent(podId)}`,
                        { method: "GET" },
                        [200],
                        "orphan_cleanup_verify",
                        job.operationId
                    );
                }
                catch(error) {
                    if (error?.httpStatus !== 404) throw error;
                }
                if (remaining && String(remaining.desiredStatus || "") !== "TERMINATED") {
                    const unverified = new Error("RUNPOD_ORPHAN_POD_DELETE_NOT_VERIFIED");
                    unverified.retryable = false;
                    unverified.stage = "orphan_cleanup_verify";
                    throw unverified;
                }
            }
            const failure = new Error("RUNPOD_EXISTING_OPERATION_POD_TERMINATED");
            failure.retryable = false;
            failure.stage = "duplicate_guard";
            throw failure;
        }
    }

    function buildAssetManifest(job, operationDir) {
        const seen = new Set();
        const candidates = [
            ...(job.sourceReferenceFiles || []).map((file, index) => ({
                file,
                output: job.sourceReferenceOutputs?.[index] || null,
                role: "source"
            })),
            ...(job.referenceFiles || []).map((file, index) => ({
                file,
                output: job.referenceOutputs?.[index] || null,
                role: "generation"
            })),
            ...(job.audioFile ? [{
                file: job.audioFile,
                output: job.audioOutput || null,
                role: "audio"
            }] : [])
        ];
        return candidates.filter(item => {
            const resolved = path.resolve(String(item.file || ""));
            if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
                throw new Error("RUNPOD_REFERENCE_ASSET_NOT_FOUND");
            }
            if (seen.has(resolved)) return false;
            seen.add(resolved);
            item.file = resolved;
            return true;
        }).map((item, index) => {
            const bytes = fs.readFileSync(item.file);
            return {
                ...item,
                bytes: bytes.length,
                sha256: createHash("sha256").update(bytes).digest("hex"),
                remoteFile: `${remoteBase}/operations/${job.operationId}/assets/${index}-${path.basename(item.file).replace(/[^a-z0-9._-]/gi, "_")}`,
                stagingFile: path.join(operationDir, "assets", `${index}-${path.basename(item.file).replace(/[^a-z0-9._-]/gi, "_")}`)
            };
        });
    }

    function buildCpuModelStagingBootstrap(operationId = "cpu-model-staging") {
        const cacheRoot = `${remoteBase}/cache/wan22-ti2v-5b`;
        const cpuToolsVenv = `${cacheRoot}/cpu-tools-venv`;
        const remoteRepository = `${cacheRoot}/Wan2.2`;
        const remoteModel = `${cacheRoot}/model`;
        const modelManifestFile = `${cacheRoot}/model-manifest.json`;
        const modelPreflightFile = `${cacheRoot}/model-preflight.py`;
        return [
            "#!/usr/bin/env bash",
            "set -eEuo pipefail",
            `JARVIS_BOOTSTRAP_PHASE=${shellSingleQuote(RUNPOD_BOOTSTRAP_PHASES.CPU_MODEL_STAGING)}`,
            "export DEBIAN_FRONTEND=noninteractive",
            "export PIP_NO_CACHE_DIR=1",
            `CACHE_ROOT=${shellSingleQuote(cacheRoot)}`,
            `CPU_TOOLS_VENV=${shellSingleQuote(cpuToolsVenv)}`,
            `WAN_REPO=${shellSingleQuote(remoteRepository)}`,
            `MODEL_DIR=${shellSingleQuote(remoteModel)}`,
            `MODEL_MANIFEST=${shellSingleQuote(modelManifestFile)}`,
            `MODEL_PREFLIGHT=${shellSingleQuote(modelPreflightFile)}`,
            `export JARVIS_OPERATION_ID=${shellSingleQuote(operationId)}`,
            `PROGRESS=${shellSingleQuote(`${remoteBase}/operations`)}/$JARVIS_OPERATION_ID/bootstrap-progress.json`,
            "mkdir -p \"$(dirname \"$PROGRESS\")\"",
            "CURRENT_CACHE_STATUS=CACHE_MISS",
            "progress() {",
            "  local stage=\"$1\" status=\"$2\" cache=\"$3\" bytes=0 now tmp",
            "  case \"$cache\" in CACHE_MISS|CACHE_POPULATING|CACHE_MODEL_READY) ;; *) return 97 ;; esac",
            "  CURRENT_CACHE_STATUS=\"$cache\"",
            "  if test -d \"$MODEL_DIR\"; then bytes=$(find \"$MODEL_DIR\" -path \"$MODEL_DIR/.cache\" -prune -o -type f -printf '%s\\n' | awk '{sum+=$1} END {print sum+0}'); fi",
            "  now=$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
            "  tmp=\"${PROGRESS}.tmp.$$\"",
            "  printf '{\"stage\":\"%s\",\"status\":\"%s\",\"cacheStatus\":\"%s\",\"modelBytes\":%s,\"at\":\"%s\"}\\n' \"$stage\" \"$status\" \"$cache\" \"${bytes:-0}\" \"$now\" > \"$tmp\"",
            "  mv -f \"$tmp\" \"$PROGRESS\"",
            "}",
            "bootstrap_failed() { local code=$?; set +e; progress BOOTSTRAP FAILED \"${CURRENT_CACHE_STATUS:-CACHE_MISS}\"; exit \"$code\"; }",
            "trap bootstrap_failed ERR",
            "progress SYSTEM_DEPENDENCIES RUNNING CACHE_MISS",
            "apt-get update -qq",
            `apt-get install -y -qq --no-install-recommends ${RUNPOD_CPU_MODEL_STAGING_PACKAGES.join(" ")}`,
            "progress SYSTEM_DEPENDENCIES READY CACHE_MISS",
            "progress WORKSPACE_VALIDATE RUNNING CACHE_MISS",
            "test -d /workspace && test -w /workspace",
            "WORKSPACE_PROBE=/workspace/.jarvis-v142-write-probe.$$",
            "printf 'ok\\n' > \"$WORKSPACE_PROBE\"",
            "rm -f \"$WORKSPACE_PROBE\"",
            "mkdir -p \"$CACHE_ROOT\" \"$MODEL_DIR\"",
            "progress WORKSPACE_VALIDATE READY CACHE_MISS",
            "progress WAN_REPOSITORY RUNNING CACHE_POPULATING",
            "if test ! -d \"$WAN_REPO/.git\"; then",
            "  if test -e \"$WAN_REPO\"; then mv \"$WAN_REPO\" \"${WAN_REPO}.incomplete.$(date -u '+%Y%m%dT%H%M%SZ')\"; fi",
            "  git clone --filter=blob:none https://github.com/Wan-Video/Wan2.2.git \"$WAN_REPO\"",
            "fi",
            `git -C "$WAN_REPO" fetch --depth 1 origin ${cacheContract.wanRepositoryRevision}`,
            `git -C "$WAN_REPO" checkout --detach ${cacheContract.wanRepositoryRevision}`,
            `test "$(git -C "$WAN_REPO" rev-parse HEAD)" = ${shellSingleQuote(cacheContract.wanRepositoryRevision)}`,
            "progress WAN_REPOSITORY READY CACHE_POPULATING",
            "progress MODEL_TOOLS RUNNING CACHE_POPULATING",
            "test -x \"$CPU_TOOLS_VENV/bin/python\" || python3 -m venv \"$CPU_TOOLS_VENV\"",
            "\"$CPU_TOOLS_VENV/bin/python\" -m pip install --upgrade 'huggingface_hub[cli]>=0.30,<1'",
            "test -x \"$CPU_TOOLS_VENV/bin/hf\"",
            `cat > "$MODEL_PREFLIGHT" <<'PY'`,
            modelEvidenceProgram,
            "PY",
            "progress MODEL_TOOLS READY CACHE_POPULATING",
            "MODEL_CACHE_VALID=0",
            `python3 "$MODEL_PREFLIGHT" ${shellSingleQuote(modelAuthorityJson)} "$MODEL_DIR" "$WAN_REPO" "$MODEL_MANIFEST" "$JARVIS_OPERATION_ID" && MODEL_CACHE_VALID=1 || true`,
            "if test \"$MODEL_CACHE_VALID\" = 1; then",
            "  progress MODEL_VALIDATION READY CACHE_MODEL_READY",
            "  exit 0",
            "fi",
            "rm -f \"$MODEL_MANIFEST\"",
            "progress MODEL_DOWNLOAD RUNNING CACHE_POPULATING",
            "export HF_HOME=\"$CACHE_ROOT/.cache/huggingface\"",
            "export HF_HUB_CACHE=\"$HF_HOME/hub\"",
            "export HF_XET_CACHE=\"$HF_HOME/xet\"",
            "export HF_XET_CHUNK_CACHE_SIZE_BYTES=0",
            "export HF_XET_SHARD_CACHE_SIZE_LIMIT=0",
            `"$CPU_TOOLS_VENV/bin/hf" download ${cacheContract.modelRepository} --revision ${cacheContract.modelRevision} --local-dir "$MODEL_DIR" &`,
            "DOWNLOAD_PID=$!",
            "while kill -0 \"$DOWNLOAD_PID\" 2>/dev/null; do progress MODEL_DOWNLOAD RUNNING CACHE_POPULATING; sleep 20; done",
            "wait \"$DOWNLOAD_PID\"",
            "progress MODEL_DOWNLOAD READY CACHE_POPULATING",
            "progress MODEL_VALIDATION RUNNING CACHE_POPULATING",
            `python3 "$MODEL_PREFLIGHT" ${shellSingleQuote(modelAuthorityJson)} "$MODEL_DIR" "$WAN_REPO" "$MODEL_MANIFEST" "$JARVIS_OPERATION_ID"`,
            "progress MODEL_VALIDATION READY CACHE_MODEL_READY",
            "exit 0"
        ].join("\n") + "\n";
    }

    function writeHuMoRuntimeBootstrapFile(bootstrapFile) {
        const lifecycle = remoteHuMoLifecycleContract({ backend: HUMO_IDENTITY_PROBE.backend });
        const authority = RUNPOD_HUMO_IDENTITY_CANDIDATE;
        const cacheRoot = lifecycle.cacheRoot;
        const bootstrap = [
            "#!/usr/bin/env bash",
            "set -eEuo pipefail",
            "export DEBIAN_FRONTEND=noninteractive",
            "export PIP_NO_CACHE_DIR=1",
            "export HF_HUB_DISABLE_TELEMETRY=1",
            `CACHE_ROOT=${shellSingleQuote(cacheRoot)}`,
            `VENV=${shellSingleQuote(lifecycle.venvDir)}`,
            `HUMO_REPO=${shellSingleQuote(lifecycle.repositoryDir)}`,
            `HUMO_WEIGHTS=${shellSingleQuote(lifecycle.weightsDir)}`,
            `WAN21_WEIGHTS=${shellSingleQuote(lifecycle.wan21Dir)}`,
            `WHISPER_DIR=${shellSingleQuote(lifecycle.whisperDir)}`,
            `SEPARATOR_FILE=${shellSingleQuote(lifecycle.separatorFile)}`,
            `PREFLIGHT_RESULT=${shellSingleQuote(lifecycle.runtimePreflightFile)}`,
            `RUNTIME_CERTIFICATION_ONLY=${runtimeCertificationOnly ? "1" : "0"}`,
            `PROGRESS=${shellSingleQuote(`${remoteBase}/operations`)}/${path.basename(path.dirname(bootstrapFile))}/bootstrap-progress.json`,
            "mkdir -p \"$CACHE_ROOT\" \"$HUMO_WEIGHTS\" \"$WAN21_WEIGHTS\" \"$WHISPER_DIR\" \"$(dirname \"$PROGRESS\")\"",
            "progress() { local stage=\"$1\" status=\"$2\" cache; if test \"$RUNTIME_CERTIFICATION_ONLY\" = 1; then cache=CACHE_MISS; elif test \"$status\" = READY; then cache=CACHE_READY; else cache=CACHE_POPULATING; fi; python3 - \"$PROGRESS\" \"$stage\" \"$status\" \"$cache\" <<'PY'",
            "import datetime,json,os,sys,tempfile",
            "target,stage,status,cache=sys.argv[1:]",
            "payload={'stage':stage,'status':status,'cacheStatus':cache,'modelBytes':0,'at':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')}",
            "fd,tmp=tempfile.mkstemp(prefix='.progress-',dir=os.path.dirname(target)); os.close(fd)",
            "open(tmp,'w',encoding='utf-8').write(json.dumps(payload,separators=(',',':'))+'\\n'); os.replace(tmp,target)",
            "PY",
            "}",
            "trap 'progress HUMO_BOOTSTRAP FAILED' ERR",
            "progress SYSTEM_DEPENDENCIES RUNNING",
            "missing=(); for tool in git ffmpeg ffprobe curl; do command -v \"$tool\" >/dev/null || missing+=(\"$tool\"); done",
            "if test ${#missing[@]} -gt 0; then apt-get update -qq; apt-get install -y -qq git ffmpeg curl python3-venv build-essential ninja-build; fi",
            "progress SYSTEM_DEPENDENCIES READY",
            "progress HUMO_REPOSITORY RUNNING",
            "if test ! -d \"$HUMO_REPO/.git\"; then rm -rf \"$HUMO_REPO\"; git clone --filter=blob:none https://github.com/Phantom-video/HuMo.git \"$HUMO_REPO\"; fi",
            `git -C "$HUMO_REPO" fetch --depth 1 origin ${authority.sourceRevision}`,
            `git -C "$HUMO_REPO" checkout --detach ${authority.sourceRevision}`,
            `test "$(git -C "$HUMO_REPO" rev-parse HEAD)" = ${shellSingleQuote(authority.sourceRevision)}`,
            "progress HUMO_REPOSITORY READY",
            "progress HUMO_RUNTIME RUNNING",
            "progress HUMO_VENV RUNNING",
            "test -x \"$VENV/bin/python\" || python3 -m venv \"$VENV\"",
            "\"$VENV/bin/python\" -m pip install --upgrade pip setuptools wheel packaging ninja 'huggingface_hub[cli]>=0.30,<1'",
            "progress HUMO_VENV READY",
            "progress HUMO_TORCH RUNNING",
            "\"$VENV/bin/python\" -m pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124",
            "\"$VENV/bin/python\" -c \"import torch; assert str(torch.__version__).startswith('2.5.1'); assert str(torch.version.cuda or '').startswith('12.4')\"",
            "progress HUMO_TORCH READY",
            "progress HUMO_FLASH_ATTENTION RUNNING",
            "FLASH_ATTN_WHEEL=/tmp/flash_attn-2.6.3+cu124torch2.5-cp311-cp311-linux_x86_64.whl",
            "curl --fail --location --retry 2 --output \"$FLASH_ATTN_WHEEL\" https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.0.2/flash_attn-2.6.3%2Bcu124torch2.5-cp311-cp311-linux_x86_64.whl",
            "test \"$(stat -c%s \"$FLASH_ATTN_WHEEL\")\" = \"182448642\"",
            "printf '%s  %s\\n' '55f8853bc1947a82eea50109f641487adabc7978bf16afb0a9eb6addc6dc51d3' \"$FLASH_ATTN_WHEEL\" | sha256sum -c -",
            "\"$VENV/bin/python\" -m pip install --no-deps \"$FLASH_ATTN_WHEEL\"",
            "rm -f \"$FLASH_ATTN_WHEEL\"",
            "\"$VENV/bin/python\" -c \"import importlib.metadata; assert importlib.metadata.version('flash-attn') == '2.6.3'\"",
            "progress HUMO_FLASH_ATTENTION READY",
            "progress HUMO_REQUIREMENTS RUNNING",
            "\"$VENV/bin/python\" -m pip install -r \"$HUMO_REPO/requirements.txt\"",
            "\"$VENV/bin/python\" -m pip check",
            "progress HUMO_REQUIREMENTS READY",
            "progress HUMO_RUNTIME READY",
            "if test \"$RUNTIME_CERTIFICATION_ONLY\" = 1; then",
            "  progress HUMO_ASSETS SKIPPED",
            "else",
            "  progress HUMO_ASSETS RUNNING",
            `  "$VENV/bin/hf" download ${authority.modelRepository} --revision ${authority.modelRevision} --local-dir "$HUMO_WEIGHTS"`,
            "  \"$VENV/bin/hf\" download Wan-AI/Wan2.1-T2V-1.3B --local-dir \"$WAN21_WEIGHTS\"",
            `  "$VENV/bin/hf" download ${authority.whisper.repository} --revision ${authority.whisper.revision} --local-dir "$WHISPER_DIR"`,
            `  test -f "$HUMO_WEIGHTS/${authority.checkpoint.path}"`,
            `  test -f "$HUMO_WEIGHTS/${authority.zeroVae.path}"`,
            `  test -f "$WAN21_WEIGHTS/${authority.wan21Vae.path}"`,
            `  test -f "$SEPARATOR_FILE"`,
            "  progress HUMO_ASSETS READY",
            "fi",
            "progress HUMO_RUNTIME_PREFLIGHT RUNNING",
            "\"$VENV/bin/python\" - \"$PREFLIGHT_RESULT\" \"$HUMO_REPO\" <<'PY'",
            "import datetime,importlib.metadata,json,os,platform,subprocess,sys,torch",
            "target,repo=sys.argv[1:]",
            "flash_probe=False; flash_error=''",
            "try:",
            "    from flash_attn import flash_attn_func",
            "    if torch.cuda.is_available():",
            "        q=torch.randn((1,16,2,64),device='cuda',dtype=torch.float16); out=flash_attn_func(q,q,q,causal=False); torch.cuda.synchronize(); flash_probe=tuple(out.shape)==tuple(q.shape)",
            "except Exception as exc:",
            "    flash_error=(type(exc).__name__+': '+str(exc))[:500]",
            "payload={'ok':False,'pythonVersion':platform.python_version(),'torchVersion':str(torch.__version__),'torchCudaVersion':str(torch.version.cuda or ''),'cuda':torch.cuda.is_available(),'gpuName':torch.cuda.get_device_name(0) if torch.cuda.is_available() else '','computeCapability':'.'.join(map(str,torch.cuda.get_device_capability(0))) if torch.cuda.is_available() else '','flashAttentionVersion':importlib.metadata.version('flash-attn'),'flashAttentionCudaProbe':flash_probe,'flashAttentionCudaError':flash_error,'pipCheck':subprocess.run([sys.executable,'-m','pip','check'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0,'sourceRevision':subprocess.check_output(['git','-C',repo,'rev-parse','HEAD'],text=True).strip(),'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')}",
            `payload['ok']=payload['pythonVersion'].startswith('${authority.remoteRuntimeBase.bootstrapPython}.') and payload['torchVersion'].startswith('${authority.remoteRuntimeBase.bootstrapTorch}') and payload['torchCudaVersion'].startswith('${authority.remoteRuntimeBase.bootstrapTorchCuda}') and payload['flashAttentionVersion']=='${authority.remoteRuntimeBase.bootstrapFlashAttention}' and payload['flashAttentionCudaProbe'] and payload['cuda'] and payload['sourceRevision']=='${authority.sourceRevision}' and payload['pipCheck']`,
            "tmp=target+'.tmp'; open(tmp,'w',encoding='utf-8').write(json.dumps(payload,separators=(',',':'))+'\\n'); os.replace(tmp,target)",
            "raise SystemExit(0 if payload['ok'] else 17)",
            "PY",
            "progress HUMO_RUNTIME_PREFLIGHT READY",
            "touch \"$(dirname \"$PROGRESS\")/bootstrap.ready\""
        ].join("\n") + "\n";
        fs.writeFileSync(bootstrapFile, bootstrap, { encoding: "utf8", mode: 0o700 });
    }

    function writeRemoteRuntimeBootstrapFile(bootstrapFile, jobOrState = null) {
        if (isHuMoRemoteJob(jobOrState)) {
            writeHuMoRuntimeBootstrapFile(bootstrapFile);
            return;
        }
        writeGpuRuntimeBootstrapFile(bootstrapFile);
    }

    function writeGpuRuntimeBootstrapFile(bootstrapFile) {
        const cacheRoot = `${remoteBase}/cache/wan22-ti2v-5b`;
        const remoteVenv = `${cacheRoot}/venv`;
        const remoteRepository = `${cacheRoot}/Wan2.2`;
        const remoteModel = `${cacheRoot}/model`;
        const manifestFile = `${cacheRoot}/cache-manifest.json`;
        const modelManifestFile = `${cacheRoot}/model-manifest.json`;
        const modelPreflightFile = `${cacheRoot}/model-preflight.py`;
        const preflightFile = `${cacheRoot}/runtime-preflight.py`;
        const preflightResultFile = `${cacheRoot}/runtime-preflight.json`;
        const constraintsFile = `${cacheRoot}/constraints.txt`;
        const filteredRequirementsFile = `${cacheRoot}/requirements-without-flash-attn.txt`;
        const flashAttentionWheelDirectory = `${cacheRoot}/wheels`;
        const runtimeRequirementPins = Object.entries(cacheContract.runtimeRequirements)
            .map(([name, version]) => `${name}==${version}`);
        const runtimeImportModules = [
            "torch", "torchvision", "torchaudio", "cv2", "diffusers", "transformers",
            "tokenizers", "accelerate", "tqdm", "imageio", "easydict", "ftfy", "dashscope",
            "imageio_ffmpeg", "flash_attn", ...Object.keys(cacheContract.runtimeRequirements),
            "numpy", "PIL"
        ];
        const contractJson = JSON.stringify({
            pythonVersionPrefix: cacheContract.pythonVersionPrefix,
            torchVersionPrefix: cacheContract.torchVersionPrefix,
            torchCudaVersionPrefix: cacheContract.torchCudaVersionPrefix,
            computeCapability: cacheContract.computeCapability,
            runtimeRequirements: cacheContract.runtimeRequirements,
            flashAttentionVersion: cacheContract.flashAttentionVersion,
            flashAttentionWheels: cacheContract.flashAttentionWheels
        });
        const bootstrap = [
            "#!/usr/bin/env bash",
            "set -eEuo pipefail",
            `JARVIS_BOOTSTRAP_PHASE=${shellSingleQuote(RUNPOD_BOOTSTRAP_PHASES.GPU_RUNTIME)}`,
            "export DEBIAN_FRONTEND=noninteractive",
            `CACHE_ROOT=${shellSingleQuote(cacheRoot)}`,
            `VENV=${shellSingleQuote(remoteVenv)}`,
            `WAN_REPO=${shellSingleQuote(remoteRepository)}`,
            `MODEL_DIR=${shellSingleQuote(remoteModel)}`,
            `CACHE_MANIFEST=${shellSingleQuote(manifestFile)}`,
            `MODEL_MANIFEST=${shellSingleQuote(modelManifestFile)}`,
            `MODEL_PREFLIGHT=${shellSingleQuote(modelPreflightFile)}`,
            `PREFLIGHT=${shellSingleQuote(preflightFile)}`,
            `PREFLIGHT_RESULT=${shellSingleQuote(preflightResultFile)}`,
            `CONSTRAINTS=${shellSingleQuote(constraintsFile)}`,
            `FILTERED_REQUIREMENTS=${shellSingleQuote(filteredRequirementsFile)}`,
            `FLASH_ATTENTION_WHEEL_DIR=${shellSingleQuote(flashAttentionWheelDirectory)}`,
            "export HF_HOME=\"$CACHE_ROOT/.cache/huggingface\"",
            "export HF_HUB_CACHE=\"$HF_HOME/hub\"",
            "export HF_XET_CACHE=\"$HF_HOME/xet\"",
            "export HF_XET_CHUNK_CACHE_SIZE_BYTES=0",
            "export HF_XET_SHARD_CACHE_SIZE_LIMIT=0",
            "export PIP_NO_CACHE_DIR=1",
            "export PIP_ONLY_BINARY=flash-attn",
            "export TMPDIR=/tmp",
            `export JARVIS_OPERATION_ID=${shellSingleQuote(path.basename(path.dirname(bootstrapFile)))}`,
            `RUNTIME_CERTIFICATION_ONLY=${runtimeCertificationOnly ? "1" : "0"}`,
            `MODEL_CACHE_CERTIFICATION_REQUIRED=${runtimeCertificationOnly && Boolean(networkVolumeId) ? "1" : "0"}`,
            "BOOTSTRAP_CACHE_STATUS=$([ \"$RUNTIME_CERTIFICATION_ONLY\" = 1 ] && [ \"$MODEL_CACHE_CERTIFICATION_REQUIRED\" != 1 ] && printf CACHE_MISS || printf CACHE_POPULATING)",
            `PROGRESS=${shellSingleQuote(`${remoteBase}/operations`)}/$JARVIS_OPERATION_ID/bootstrap-progress.json`,
            "mkdir -p \"$CACHE_ROOT\" \"$(dirname \"$PROGRESS\")\"",
            "CURRENT_CACHE_STATUS=CACHE_MISS",
            "progress() { local stage=\"$1\" status=\"$2\" cache=\"$3\" bytes=0; CURRENT_CACHE_STATUS=\"$cache\"; test -d \"$MODEL_DIR\" && bytes=$(find \"$MODEL_DIR\" -path \"$MODEL_DIR/.cache\" -prune -o -type f -printf '%s\\n' | awk '{sum+=$1} END {print sum+0}') || true; python3 - \"$PROGRESS\" \"$stage\" \"$status\" \"$cache\" \"$bytes\" <<'PY'",
            "import json,os,sys,tempfile,datetime",
            "target,stage,status,cache,raw=sys.argv[1:]",
            "payload={'stage':stage,'status':status,'cacheStatus':cache,'modelBytes':int(raw or 0),'at':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')}",
            "fd,tmp=tempfile.mkstemp(prefix='.progress-',dir=os.path.dirname(target)); os.close(fd)",
            "open(tmp,'w',encoding='utf-8').write(json.dumps(payload,separators=(',',':'))+'\\n'); os.replace(tmp,target)",
            "PY",
            "}",
            "trap 'progress BOOTSTRAP FAILED \"${CURRENT_CACHE_STATUS:-CACHE_MISS}\"' ERR",
            "rm -f \"$PREFLIGHT_RESULT\"",
            "progress WORKSPACE_VALIDATE RUNNING CACHE_MISS",
            "test -d /workspace && test -w /workspace",
            "WORKSPACE_PROBE=/workspace/.jarvis-v142-gpu-write-probe.$$",
            "printf 'ok\\n' > \"$WORKSPACE_PROBE\"",
            "rm -f \"$WORKSPACE_PROBE\"",
            "progress WORKSPACE_VALIDATE READY CACHE_MISS",
            "progress SYSTEM_DEPENDENCIES RUNNING CACHE_MISS",
            "missing=(); for tool in git ffmpeg ffprobe curl; do command -v \"$tool\" >/dev/null || missing+=(\"$tool\"); done; python3 -m venv --help >/dev/null 2>&1 || missing+=(python3-venv)",
            "if test ${#missing[@]} -gt 0; then apt-get update -qq; apt-get install -y -qq git ffmpeg curl python3-venv; fi",
            "progress SYSTEM_DEPENDENCIES READY CACHE_MISS",
            `cat > \"$PREFLIGHT\" <<'PY'`,
            "import hashlib,importlib,importlib.metadata,json,os,platform,re,subprocess,sys",
            "expected=json.loads(sys.argv[1]); repo=sys.argv[2]; target=sys.argv[3]",
            "diagnostic_limit=2000",
            "def bounded_diagnostic(value):",
            "    if isinstance(value,bytes): value=value.decode('utf-8','replace')",
            "    text=str(value or '')",
            "    text=re.sub(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\\s\\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----','[REDACTED PRIVATE KEY]',text,flags=re.I)",
            "    text=re.sub(r'\\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))\\s*=\\s*[^\\s\"\\\',;]+',r'\\1=[REDACTED]',text,flags=re.I)",
            "    text=re.sub(r'\\bBearer\\s+[^\\s\"\\\',;]+','Bearer [REDACTED]',text,flags=re.I)",
            "    text=re.sub(r'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]',' ',text).strip()",
            "    return text if len(text)<=diagnostic_limit else '[TRUNCATED]\\n'+text[-(diagnostic_limit-12):]",
            "def run_diagnostic(command,**kwargs):",
            "    try:",
            "        completed=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=120,**kwargs)",
            "        return {'exitCode':completed.returncode,'stdout':bounded_diagnostic(completed.stdout),'stderr':bounded_diagnostic(completed.stderr),'timedOut':False}",
            "    except subprocess.TimeoutExpired as error:",
            "        stderr=bounded_diagnostic(error.stderr)",
            "        stderr=bounded_diagnostic((stderr+'\\n' if stderr else '')+'PROCESS_TIMEOUT:120s')",
            "        return {'exitCode':None,'stdout':bounded_diagnostic(error.stdout),'stderr':stderr,'timedOut':True}",
            `modules=(${runtimeImportModules.map(shellSingleQuote).join(",")})`,
            "imports={}",
            "for name in modules:",
            "    try: importlib.import_module(name); imports[name]=True",
            "    except Exception as error: imports[name]=False",
            "runtime_requirement_versions={name:importlib.metadata.version(name) if imports.get(name) else '' for name in expected.get('runtimeRequirements',{})}",
            "torch=importlib.import_module('torch')",
            "cuda_probe=False",
            "flash_attention_cuda_probe=False",
            "if torch.cuda.is_available():",
            "    try: cuda_probe=bool((torch.ones(1,device='cuda')+1).item()==2); torch.cuda.synchronize()",
            "    except Exception: cuda_probe=False",
            "    try:",
            "        flash_attn_func=importlib.import_module('flash_attn').flash_attn_func",
            "        q=torch.randn((1,4,2,64),device='cuda',dtype=torch.float16)",
            "        out=flash_attn_func(q,q,q); torch.cuda.synchronize()",
            "        flash_attention_cuda_probe=bool(out.is_cuda and out.shape==q.shape)",
            "    except Exception: flash_attention_cuda_probe=False",
            "pip_check_evidence=run_diagnostic([sys.executable,'-m','pip','check'])",
            "pip_check_messages=[line.strip() for stream in (pip_check_evidence['stdout'],pip_check_evidence['stderr']) for line in stream.splitlines() if line.strip()]",
            "decord_version=expected.get('runtimeRequirements',{}).get('decord','')",
            "decord_platform_advisory=f'decord {decord_version} is not supported on this platform'",
            "pip_check_advisories=[decord_platform_advisory] if pip_check_evidence['exitCode'] not in (None,0) and not pip_check_evidence['timedOut'] and imports.get('decord') and runtime_requirement_versions.get('decord')==decord_version and pip_check_messages==[decord_platform_advisory] else []",
            "pip_check=(pip_check_evidence['exitCode']==0 and not pip_check_evidence['timedOut']) or bool(pip_check_advisories)",
            "abi_value=getattr(torch._C,'_GLIBCXX_USE_CXX11_ABI',None)",
            "flash_attention_abi='TRUE' if abi_value is True else 'FALSE' if abi_value is False else 'UNSUPPORTED'",
            "flash_attention_wheel=expected.get('flashAttentionWheels',{}).get(flash_attention_abi)",
            "flash_attention_wheel_path=os.path.join(os.path.dirname(target),'wheels',flash_attention_wheel.get('fileName','')) if flash_attention_wheel else ''",
            "flash_attention_wheel_sha256=''",
            "if flash_attention_wheel_path and os.path.isfile(flash_attention_wheel_path):",
            "    digest=hashlib.sha256()",
            "    with open(flash_attention_wheel_path,'rb') as handle:",
            "        for chunk in iter(lambda:handle.read(8*1024*1024),b''): digest.update(chunk)",
            "    flash_attention_wheel_sha256=digest.hexdigest()",
            "flash_attention_wheel_authorized=bool(flash_attention_wheel and flash_attention_wheel_sha256==flash_attention_wheel.get('sha256'))",
            "probe_env=dict(os.environ); probe_env.update({'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','WANDB_MODE':'offline'})",
            "wan_cli_evidence=run_diagnostic([sys.executable,os.path.join(repo,'generate.py'),'--help'],cwd=repo,env=probe_env)",
            "cli=wan_cli_evidence['exitCode']==0 and not wan_cli_evidence['timedOut']",
            "payload={'pythonVersion':platform.python_version(),'torchVersion':str(torch.__version__),'torchCudaVersion':str(torch.version.cuda or ''),'cudaImageVersion':str(os.environ.get('CUDA_VERSION','')),'cuda':torch.cuda.is_available(),'gpuName':torch.cuda.get_device_name(0) if torch.cuda.is_available() else '', 'computeCapability':'.'.join(map(str,torch.cuda.get_device_capability(0))) if torch.cuda.is_available() else '', 'cudaProbe':cuda_probe,'flashAttentionCudaProbe':flash_attention_cuda_probe,'pipCheck':pip_check,'pipCheckExitCode':pip_check_evidence['exitCode'],'pipCheckStdout':pip_check_evidence['stdout'],'pipCheckStderr':pip_check_evidence['stderr'],'pipCheckTimedOut':pip_check_evidence['timedOut'],'pipCheckAdvisories':pip_check_advisories,'wanCliImport':cli,'wanCliImportExitCode':wan_cli_evidence['exitCode'],'wanCliImportStdout':wan_cli_evidence['stdout'],'wanCliImportStderr':wan_cli_evidence['stderr'],'wanCliImportTimedOut':wan_cli_evidence['timedOut'],'imports':imports,'runtimeRequirementVersions':runtime_requirement_versions,'flashAttentionVersion':importlib.metadata.version('flash-attn') if imports.get('flash_attn') else '', 'flashAttentionWheelAbi':flash_attention_abi,'flashAttentionWheelSha256':flash_attention_wheel_sha256,'flashAttentionWheelAuthorized':flash_attention_wheel_authorized}",
            "payload['ok']=bool(payload['pythonVersion'].startswith(expected['pythonVersionPrefix']) and payload['torchVersion'].startswith(expected['torchVersionPrefix']) and payload['torchCudaVersion'].startswith(expected['torchCudaVersionPrefix']) and payload['computeCapability']==expected['computeCapability'] and payload['cudaProbe'] and payload['flashAttentionCudaProbe'] and payload['pipCheck'] and payload['wanCliImport'] and all(imports.values()) and all(payload['runtimeRequirementVersions'].get(name)==version for name,version in expected.get('runtimeRequirements',{}).items()) and payload['flashAttentionVersion']==expected['flashAttentionVersion'] and payload['flashAttentionWheelAuthorized'])",
            "open(target,'w',encoding='utf-8').write(json.dumps(payload,sort_keys=True,separators=(',',':'))+'\\n')",
            "raise SystemExit(0 if payload['ok'] else 1)",
            "PY",
            `cat > "$MODEL_PREFLIGHT" <<'PY'`,
            modelEvidenceProgram,
            "PY",
            "write_cache_evidence() { python3 - \"$CACHE_MANIFEST\" \"$MODEL_MANIFEST\" \"$PREFLIGHT_RESULT\" \"$WAN_REPO\" \"$CACHE_ROOT/requirements.sha256\" \"$JARVIS_OPERATION_ID\" <<'PY'",
            "import datetime,json,os,subprocess,sys,tempfile",
            "target,model_path,runtime_path,repo_dir,requirements_path,operation_id=sys.argv[1:]",
            "observed={'operationId':operation_id,'model':json.load(open(model_path,encoding='utf-8')),'runtime':json.load(open(runtime_path,encoding='utf-8')),'wanRepositoryRevision':subprocess.check_output(['git','-C',repo_dir,'rev-parse','HEAD'],text=True).strip(),'requirementsSha256':open(requirements_path,encoding='utf-8').read().strip(),'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')}",
            "fd,tmp=tempfile.mkstemp(prefix='.manifest-',dir=os.path.dirname(target)); os.close(fd)",
            "open(tmp,'w',encoding='utf-8').write(json.dumps(observed,sort_keys=True,separators=(',',':'))+'\\n'); os.replace(tmp,target)",
            "PY",
            "}",
            "CACHE_VALID=0",
            "if { test \"$RUNTIME_CERTIFICATION_ONLY\" != 1 || test \"$MODEL_CACHE_CERTIFICATION_REQUIRED\" = 1; } && test -f \"$WAN_REPO/generate.py\" && test -x \"$VENV/bin/python\" && test -f \"$CACHE_ROOT/requirements.sha256\"; then",
            `  if test "$(git -C "$WAN_REPO" rev-parse HEAD)" = ${shellSingleQuote(cacheContract.wanRepositoryRevision)} && test "$(cat "$CACHE_ROOT/requirements.sha256")" = ${shellSingleQuote(cacheContract.requirementsSha256)}; then`,
            `    python3 "$MODEL_PREFLIGHT" ${shellSingleQuote(modelAuthorityJson)} "$MODEL_DIR" "$WAN_REPO" "$MODEL_MANIFEST" "$JARVIS_OPERATION_ID" && "$VENV/bin/python" "$PREFLIGHT" ${shellSingleQuote(contractJson)} "$WAN_REPO" "$PREFLIGHT_RESULT" && CACHE_VALID=1 || true`,
            "  fi",
            "fi",
            "if test \"$CACHE_VALID\" = 1; then write_cache_evidence; progress CACHE_VALIDATE READY CACHE_HIT; exit 0; fi",
            "rm -f \"$CACHE_MANIFEST\"",
            "progress CACHE_VALIDATE INCOMPLETE CACHE_MISS",
            "progress WAN_REPOSITORY RUNNING \"$BOOTSTRAP_CACHE_STATUS\"",
            `if test ! -d \"$WAN_REPO/.git\"; then git clone --filter=blob:none https://github.com/Wan-Video/Wan2.2.git \"$WAN_REPO\"; fi`,
            `git -C \"$WAN_REPO\" fetch --depth 1 origin ${cacheContract.wanRepositoryRevision}`,
            `git -C \"$WAN_REPO\" checkout --detach ${cacheContract.wanRepositoryRevision}`,
            "progress WAN_REPOSITORY READY \"$BOOTSTRAP_CACHE_STATUS\"",
            "progress PYTHON_REQUIREMENTS RUNNING \"$BOOTSTRAP_CACHE_STATUS\"",
            "test -x \"$VENV/bin/python\" || python3 -m venv --system-site-packages \"$VENV\"",
            "REQ_SHA=$(sha256sum \"$WAN_REPO/requirements.txt\" | awk '{print $1}')",
            `test \"$REQ_SHA\" = ${shellSingleQuote(cacheContract.requirementsSha256)}`,
            "cat > \"$CONSTRAINTS\" <<'EOF'",
            "torch==2.8.0",
            "torchvision==0.23.0",
            "torchaudio==2.8.0",
            "transformers==4.51.3",
            "tokenizers==0.21.4",
            "numpy==1.26.4",
            ...runtimeRequirementPins,
            `flash-attn==${cacheContract.flashAttentionVersion}`,
            "huggingface-hub>=0.30,<1",
            "EOF",
            "grep -v -E '^(flash_attn|flash-attn)([<>=!~].*)?$' \"$WAN_REPO/requirements.txt\" > \"$FILTERED_REQUIREMENTS\"",
            `printf '%s\\n' ${runtimeRequirementPins.map(shellSingleQuote).join(" ")} >> "$FILTERED_REQUIREMENTS"`,
            "\"$VENV/bin/python\" -m pip install --upgrade pip setuptools wheel packaging psutil",
            "\"$VENV/bin/python\" -m pip install --constraint \"$CONSTRAINTS\" --requirement \"$FILTERED_REQUIREMENTS\" 'huggingface_hub[cli]>=0.30,<1'",
            "FLASH_ATTENTION_ABI=$(\"$VENV/bin/python\" -c \"import torch; value=getattr(torch._C,'_GLIBCXX_USE_CXX11_ABI',None); print('TRUE' if value is True else 'FALSE' if value is False else 'UNSUPPORTED')\")",
            "case \"$FLASH_ATTENTION_ABI\" in",
            `  FALSE) FLASH_ATTENTION_NAME=${shellSingleQuote(cacheContract.flashAttentionWheels.FALSE.fileName)}; FLASH_ATTENTION_URL=${shellSingleQuote(cacheContract.flashAttentionWheels.FALSE.url)}; FLASH_ATTENTION_SHA256=${shellSingleQuote(cacheContract.flashAttentionWheels.FALSE.sha256)} ;;`,
            `  TRUE) FLASH_ATTENTION_NAME=${shellSingleQuote(cacheContract.flashAttentionWheels.TRUE.fileName)}; FLASH_ATTENTION_URL=${shellSingleQuote(cacheContract.flashAttentionWheels.TRUE.url)}; FLASH_ATTENTION_SHA256=${shellSingleQuote(cacheContract.flashAttentionWheels.TRUE.sha256)} ;;`,
            "  *) printf 'RUNPOD_FLASH_ATTENTION_ABI_UNAUTHORIZED\\n' >&2; exit 42 ;;",
            "esac",
            "mkdir -p \"$FLASH_ATTENTION_WHEEL_DIR\"",
            "FLASH_ATTENTION_WHEEL=\"$FLASH_ATTENTION_WHEEL_DIR/$FLASH_ATTENTION_NAME\"",
            "FLASH_ATTENTION_PARTIAL=\"$FLASH_ATTENTION_WHEEL.partial\"",
            "if test -f \"$FLASH_ATTENTION_WHEEL\"; then",
            "  printf '%s  %s\\n' \"$FLASH_ATTENTION_SHA256\" \"$FLASH_ATTENTION_WHEEL\" | sha256sum -c -",
            "else",
            "  curl --fail --location --retry 0 --continue-at - --output \"$FLASH_ATTENTION_PARTIAL\" \"$FLASH_ATTENTION_URL\"",
            "  printf '%s  %s\\n' \"$FLASH_ATTENTION_SHA256\" \"$FLASH_ATTENTION_PARTIAL\" | sha256sum -c -",
            "  mv \"$FLASH_ATTENTION_PARTIAL\" \"$FLASH_ATTENTION_WHEEL\"",
            "fi",
            "\"$VENV/bin/python\" -m pip install --no-deps \"$FLASH_ATTENTION_WHEEL\"",
            "progress RUNTIME_PREFLIGHT RUNNING CACHE_MISS",
            `\"$VENV/bin/python\" \"$PREFLIGHT\" ${shellSingleQuote(contractJson)} \"$WAN_REPO\" \"$PREFLIGHT_RESULT\"`,
            "printf '%s\\n' \"$REQ_SHA\" > \"$CACHE_ROOT/requirements.sha256\"",
            "progress PYTHON_REQUIREMENTS READY \"$BOOTSTRAP_CACHE_STATUS\"",
            "progress RUNTIME_PREFLIGHT READY CACHE_MISS",
            "if test \"$RUNTIME_CERTIFICATION_ONLY\" = 1 && test \"$MODEL_CACHE_CERTIFICATION_REQUIRED\" != 1; then exit 0; fi",
            "progress MODEL_VALIDATION RUNNING CACHE_POPULATING",
            `python3 "$MODEL_PREFLIGHT" ${shellSingleQuote(modelAuthorityJson)} "$MODEL_DIR" "$WAN_REPO" "$MODEL_MANIFEST" "$JARVIS_OPERATION_ID"`,
            "progress MODEL_VALIDATION READY CACHE_MODEL_READY",
            "progress RUNTIME_PREFLIGHT RUNNING CACHE_MODEL_READY",
            `\"$VENV/bin/python\" \"$PREFLIGHT\" ${shellSingleQuote(contractJson)} \"$WAN_REPO\" \"$PREFLIGHT_RESULT\"`,
            "progress RUNTIME_PREFLIGHT READY CACHE_MODEL_READY",
            "write_cache_evidence",
            "progress RUNNER_READY READY CACHE_READY"
        ].join("\n") + "\n";
        fs.writeFileSync(bootstrapFile, bootstrap, { encoding: "utf8", mode: 0o700 });
    }

    function prepareRemoteFiles(job) {
        const operationDir = path.join(stateRoot, job.operationId);
        fs.mkdirSync(path.join(operationDir, "assets"), { recursive: true });
        const privateKeyFile = path.join(operationDir, "ssh-key");
        const publicKeyFile = `${privateKeyFile}.pub`;
        const knownHostsFile = path.join(operationDir, "known-hosts");
        if (typeof generateKeyPair === "function") {
            generateKeyPair({ privateKeyFile, publicKeyFile, operationId: job.operationId });
        }
        else {
            execFileSync(sshKeygen, ["-q", "-t", "ed25519", "-N", "", "-C", `jarvis-${job.operationId}`, "-f", privateKeyFile], {
                windowsHide: true,
                stdio: "ignore"
            });
        }
        const publicKey = fs.readFileSync(publicKeyFile, "utf8").trim();
        const assets = buildAssetManifest(job, operationDir);
        for (const asset of assets) fs.copyFileSync(asset.file, asset.stagingFile);
        const generationAssets = (job.referenceFiles || []).map(file => {
            const resolved = path.resolve(file);
            return assets.find(asset => asset.file === resolved)?.remoteFile;
        }).filter(Boolean);
        const sourceAssets = (job.sourceReferenceFiles || []).map(file => {
            const resolved = path.resolve(file);
            return assets.find(asset => asset.file === resolved)?.remoteFile;
        }).filter(Boolean);
        const audioAsset = job.audioFile
            ? assets.find(asset => asset.file === path.resolve(job.audioFile) && asset.role === "audio")
            : null;
        const remoteOperationDir = `${remoteBase}/operations/${job.operationId}`;
        const remoteJob = {
            ...job,
            modelDirectory: isHuMoRemoteJob(job)
                ? remoteHuMoLifecycleContract(job).weightsDir
                : `${remoteBase}/cache/wan22-ti2v-5b/model`,
            outputFile: `${remoteOperationDir}/output.mp4`,
            referenceFiles: generationAssets,
            sourceReferenceFiles: sourceAssets,
            audioFile: audioAsset?.remoteFile || null
        };
        const localJobFile = path.join(operationDir, "job.json");
        const localRunnerFile = path.join(operationDir, "jarvis-local-video-wan22.py");
        const runnerSource = path.resolve(String(env.JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT || ""));
        if (!fs.existsSync(runnerSource)) throw new Error("RUNPOD_RUNNER_SOURCE_NOT_FOUND");
        atomicJsonWrite(localJobFile, remoteJob);
        fs.copyFileSync(runnerSource, localRunnerFile);
        const bootstrapFile = path.join(operationDir, "bootstrap.sh");
        writeRemoteRuntimeBootstrapFile(bootstrapFile, job);
        const remoteLifecycle = remoteHuMoLifecycleContract(job);
        return {
            runtimeKind: remoteLifecycle?.kind || "wan22",
            cacheRoot: remoteLifecycle?.cacheRoot || `${remoteBase}/cache/wan22-ti2v-5b`,
            repositoryDir: remoteLifecycle?.repositoryDir || `${remoteBase}/cache/wan22-ti2v-5b/Wan2.2`,
            weightsDir: remoteLifecycle?.weightsDir || `${remoteBase}/cache/wan22-ti2v-5b/model`,
            wan21Dir: remoteLifecycle?.wan21Dir || null,
            whisperDir: remoteLifecycle?.whisperDir || null,
            separatorFile: remoteLifecycle?.separatorFile || null,
            venvDir: remoteLifecycle?.venvDir || `${remoteBase}/cache/wan22-ti2v-5b/venv`,
            operationDir,
            privateKeyFile,
            publicKeyFile,
            publicKey,
            knownHostsFile,
            localJobFile,
            localRunnerFile,
            bootstrapFile,
            remoteOperationDir,
            remoteResultFile: `${remoteOperationDir}/result.json`,
            remoteOutputFile: `${remoteOperationDir}/output.mp4`,
            assets
        };
    }

    function sshArgs(state, command) {
        return [
            "-i", state.privateKeyFile,
            "-p", String(state.sshPort),
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=20",
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", `UserKnownHostsFile=${state.knownHostsFile}`,
            `root@${state.publicIp}`,
            command
        ];
    }

    async function sshCommand(state, command, timeout = 30000) {
        return execute(ssh, sshArgs(state, command), { timeout });
    }

    async function scpFile(state, source, destination, timeout = 300000) {
        return execute(scp, [
            "-i", state.privateKeyFile,
            "-P", String(state.sshPort),
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=20",
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", `UserKnownHostsFile=${state.knownHostsFile}`,
            source,
            `root@${state.publicIp}:${destination}`
        ], { timeout });
    }

    async function scpDownload(state, source, destination, timeout = 300000) {
        return execute(scp, [
            "-i", state.privateKeyFile,
            "-P", String(state.sshPort),
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=20",
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", `UserKnownHostsFile=${state.knownHostsFile}`,
            `root@${state.publicIp}:${source}`,
            destination
        ], { timeout });
    }

    async function remoteHuMoHealth(state, full = false) {
        const authority = RUNPOD_HUMO_IDENTITY_CANDIDATE;
        const lifecycle = remoteHuMoLifecycleContract({ backend: HUMO_IDENTITY_PROBE.backend });
        const python = full ? `${state.venvDir}/bin/python` : "python3";
        const command = `${shellSingleQuote(python)} -c ${shellSingleQuote(
            "import importlib.metadata,json,os,platform,shutil,subprocess,torch; " +
            "cuda=torch.cuda.is_available(); " +
            "d={'pythonVersion':platform.python_version(),'torchVersion':str(torch.__version__),'torchCudaVersion':str(torch.version.cuda or ''),'cuda':cuda,'gpuName':torch.cuda.get_device_name(0) if cuda else '','computeCapability':'.'.join(map(str,torch.cuda.get_device_capability(0))) if cuda else '','vramBytes':torch.cuda.get_device_properties(0).total_memory if cuda else 0,'ffmpeg':bool(shutil.which('ffmpeg')),'ffprobe':bool(shutil.which('ffprobe'))}; " +
            (full
                ? `p=json.load(open('${lifecycle.runtimePreflightFile}',encoding='utf-8')) if os.path.isfile('${lifecycle.runtimePreflightFile}') else {}; d.update({'runner':os.path.isfile('${state.remoteOperationDir}/jarvis-local-video-wan22.py'),'humoRepository':os.path.isfile('${lifecycle.repositoryDir}/main.py'),'weights':os.path.isfile('${lifecycle.weightsDir}/${authority.checkpoint.path}'),'wan21':os.path.isfile('${lifecycle.wan21Dir}/${authority.wan21Vae.path}'),'whisper':os.path.isfile('${lifecycle.whisperDir}/${authority.whisper.model.path}'),'separator':os.path.isfile('${lifecycle.separatorFile}'),'dependencyContract':p.get('ok') is True,'pipCheck':p.get('pipCheck') is True,'flashAttentionVersion':p.get('flashAttentionVersion'),'sourceRevision':p.get('sourceRevision')}); `
                : "") +
            "print(json.dumps(d))"
        )}`;
        const result = await sshCommand(state, command, 60000);
        let health;
        try { health = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)); }
        catch { throw new Error("RUNPOD_HEALTH_RESPONSE_INVALID"); }
        const runtime = authority.remoteRuntimeBase;
        const expectedTorch = full ? runtime.bootstrapTorch : runtime.baseTorch;
        const basePredicates = {
            pythonVersion: String(health.pythonVersion || "").startsWith(runtime.basePython + "."),
            torchVersion: String(health.torchVersion || "").startsWith(expectedTorch),
            torchCudaVersion: String(health.torchCudaVersion || "").startsWith("12.4"),
            cudaAvailable: health.cuda === true,
            gpuName: String(health.gpuName || "").trim() === authority.targetGpuTypeId,
            vramObserved: Number(health.vramBytes || 0) >= 44 * RUNPOD_GIB
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
    }

    async function remoteHealth(state, full = false) {
        if (state.runtimeKind === "humo") return remoteHuMoHealth(state, full);
        const cacheRoot = `${remoteBase}/cache/wan22-ti2v-5b`;
        const runtimePreflightFile = `${cacheRoot}/runtime-preflight.json`;
        const command = `python3 -c ${shellSingleQuote(
            "import json,os,platform,shutil,subprocess,torch; p=shutil.disk_usage('/workspace'); " +
            "os_release=platform.freedesktop_os_release(); " +
            "cuda=torch.cuda.is_available(); probe=False; " +
            "exec(\"try:\\n probe=bool((torch.ones(1,device='cuda')+1).item()==2); torch.cuda.synchronize()\\nexcept Exception:\\n probe=False\") if cuda else None; " +
            "d={'operatingSystem':str(os_release.get('ID',''))+'-'+str(os_release.get('VERSION_ID','')),'python':True,'pythonVersion':platform.python_version(),'torch':bool(torch.__version__),'torchVersion':str(torch.__version__),'torchCudaVersion':str(torch.version.cuda or ''),'cuda':cuda," +
            "'gpuName':torch.cuda.get_device_name(0) if cuda else '', 'computeCapability':'.'.join(map(str,torch.cuda.get_device_capability(0))) if cuda else ''," +
            "'cudaProbe':probe,'vramBytes':torch.cuda.get_device_properties(0).total_memory if cuda else 0,'vramGb':round(torch.cuda.get_device_properties(0).total_memory/1073741824,2) if cuda else 0,'freeDiskGb':round(p.free/1073741824,2),'cudaImageVersion':str(os.environ.get('CUDA_VERSION',''))," +
            "'ffmpeg':bool(shutil.which('ffmpeg')),'ffprobe':bool(shutil.which('ffprobe')),'nvcc':bool(shutil.which('nvcc'))}; " +
            (full
                ? `r=json.load(open('${runtimePreflightFile}',encoding='utf-8')) if os.path.isfile('${runtimePreflightFile}') else {}; repo='${cacheRoot}/Wan2.2'; repo_revision=subprocess.check_output(['git','-C',repo,'rev-parse','HEAD'],text=True).strip() if os.path.isfile(repo+'/generate.py') else ''; d.update({'runner':os.path.isfile('${state.remoteOperationDir}/jarvis-local-video-wan22.py'),'wanRepository':os.path.isfile(repo+'/generate.py'),'wanRepositoryRevision':repo_revision,'wanModel':os.path.isfile('${cacheRoot}/cache-manifest.json'),'dependencyContract':r.get('ok') is True,'pipCheck':r.get('pipCheck') is True,'wanCliImport':r.get('wanCliImport') is True,'runtimeCudaProbe':r.get('cudaProbe') is True,'flashAttentionCudaProbe':r.get('flashAttentionCudaProbe') is True,'flashAttention':r.get('flashAttentionVersion')=='${cacheContract.flashAttentionVersion}','flashAttentionWheelAuthorized':r.get('flashAttentionWheelAuthorized') is True,'flashAttentionWheelAbi':r.get('flashAttentionWheelAbi'),'flashAttentionWheelSha256':r.get('flashAttentionWheelSha256'),'imports':bool(r.get('imports')) and all(r.get('imports',{}).values())}); `
                : "") +
            "print(json.dumps(d))"
        )}`;
        const result = await sshCommand(state, command, 60000);
        let health;
        try { health = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)); }
        catch { throw new Error("RUNPOD_HEALTH_RESPONSE_INVALID"); }
        const basePredicates = {
            operatingSystem: String(health.operatingSystem || "") === cacheContract.runtimeIdentity.operatingSystem,
            pythonPresent: health.python === true,
            pythonVersion: String(health.pythonVersion || "").startsWith(cacheContract.pythonVersionPrefix),
            torchPresent: health.torch === true,
            torchVersion: String(health.torchVersion || "").startsWith(cacheContract.torchVersionPrefix),
            torchCudaVersion: String(health.torchCudaVersion || "").startsWith(cacheContract.torchCudaVersionPrefix),
            cudaAvailable: health.cuda === true,
            cudaTensorProbe: health.cudaProbe === true,
            gpuName: String(health.gpuName || "").trim() === gpuTypeId,
            computeCapability: String(health.computeCapability || "") === cacheContract.computeCapability,
            vramObserved: Number(health.vramBytes || 0) > 0,
            workspaceReserve: Number(health.freeDiskGb || 0) >= cacheContract.workspaceReserveBytes / RUNPOD_GIB
        };
        const baseFailures = Object.entries(basePredicates)
            .filter(([, passed]) => passed !== true)
            .map(([name]) => name);
        if (baseFailures.length > 0) {
            const failure = new Error("RUNPOD_IMAGE_RUNTIME_MISMATCH");
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
                wanRepository: health.wanRepository === true,
                wanModel: (state.runtimeCertificationOnly && !state.networkVolumeId) || health.wanModel === true,
                wanRepositoryRevision: String(health.wanRepositoryRevision || "") === cacheContract.wanRepositoryRevision,
                dependencyContract: health.dependencyContract === true,
                pipCheck: health.pipCheck === true,
                wanCliImport: health.wanCliImport === true,
                flashAttention: health.flashAttention === true,
                flashAttentionWheelAuthorized: health.flashAttentionWheelAuthorized === true,
                flashAttentionCudaProbe: health.flashAttentionCudaProbe === true,
                imports: health.imports === true,
                runtimeCudaProbe: health.runtimeCudaProbe === true || health.cudaProbe === true
            };
            const fullFailures = Object.entries(fullPredicates)
                .filter(([, passed]) => passed !== true)
                .map(([name]) => name);
            if (fullFailures.length > 0) {
                const failure = new Error("RUNPOD_WAN22_RUNTIME_PREFLIGHT_FAILED");
                failure.fullHealth = health;
                failure.runtimePredicateResults = fullPredicates;
                failure.runtimePredicateFailures = fullFailures;
                throw failure;
            }
        }
        return health;
    }

    async function launch({ job }) {
        assertZeroCostConfiguration(job);
        assertPaidResourceCreationAuthority();
        assertHuMoPaidExecutionAuthority(job);
        assertProviderConfigured();
        const lifecycle = remoteHuMoLifecycleContract(job);
        const launchProfile = lifecycle?.profile || cacheContract;
        const registryVerification = await resolveRegistryVerification(launchProfile);
        const file = stateFile(job.operationId);
        if (fs.existsSync(file)) {
            const existing = readJson(file);
            if (existing.podId) throw new Error("RUNPOD_DUPLICATE_OBLIGATION_BLOCKED");
        }
        const prepared = prepareRemoteFiles(job);
        let podId = null;
        try {
            await assertNoExistingOperationPod(job);
            const networkVolume = await resolveNetworkVolume(job.operationId);
            const selectedDataCenterId = networkVolume?.dataCenterId || (
                runtimeCertificationOnly ? runtimeCertificationDataCenterId : null
            );
            const availability = await queryAvailability(selectedDataCenterId, job.operationId);
            const zeroCostPrecheck = lifecycle
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
            );
            const pod = await apiRequest(`${apiBase}/pods`, {
                method: "POST",
                body: JSON.stringify(body)
            }, [200, 201], "provision", job.operationId);
            podId = String(pod?.id || "").trim();
            if (!podId) throw new Error("RUNPOD_PROVISION_RESPONSE_INVALID");
            const actualGpu = String(pod?.gpu?.id || pod?.machine?.gpuTypeId || gpuTypeId);
            const actualVram = Number(pod?.gpu?.memoryInGb || availability.vramGb || expectedVramGb);
            if (actualGpu !== gpuTypeId || actualVram < launchProfile.minimumVramGb) {
                throw new Error("RUNPOD_PROVISIONED_GPU_INCOMPATIBLE");
            }
            const hourlyRateUsd = Number(
                pod?.adjustedCostPerHr || pod?.costPerHr || availability.hourlyRateUsd
            );
            if (!(hourlyRateUsd > 0)) throw new Error("RUNPOD_HOURLY_RATE_INVALID");
            if (hourlyRateUsd > configuredTotalHourlyRateUsd) {
                throw new Error("RUNPOD_AUTHORIZED_PRICE_EXCEEDED");
            }
            const state = {
                schemaVersion: JARVIS_RUNPOD_ADAPTER_VERSION,
                provider: "runpod",
                podId,
                remoteJobId: `runpod/${podId}/${job.operationId}`,
                phase: "PROVISIONED",
                gpuTypeId,
                vramGb: actualVram,
                providerVramGb: actualVram,
                hourlyRateUsd,
                hardBudgetUsd,
                budgetStopRatio,
                maximumSpendBeforeCleanupUsd: zeroCostPrecheck.economics?.maximumSpendBeforeCleanupUsd ?? maximumSpendBeforeCleanupUsd,
                maximumAuthorizedSeconds: zeroCostPrecheck.economics?.maximumAuthorizedSeconds ?? maximumAuthorizedSeconds,
                networkVolumeId: networkVolume?.id || null,
                networkVolumeDataCenterId: networkVolume?.dataCenterId || null,
                networkVolumeSizeGb: networkVolume?.sizeGb || null,
                dataCenterId: selectedDataCenterId || null,
                runtimeCertificationOnly,
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
                registryVerification,
                cacheStatus: "CACHE_MISS",
                bootstrapTimeoutSeconds,
                inferenceTimeoutSeconds,
                provisionedAt,
                createdAt: provisionedAt,
                operationId: job.operationId,
                operationName: job.operationName,
                missionId: job.missionId,
                objectiveId: job.objectiveId,
                obligationId: job.obligationId,
                rootInstructionHash: job.rootInstructionHash,
                zeroCostPrecheck: {
                    ...zeroCostPrecheck,
                    payload: zeroCostPrecheck.payload
                },
                ...prepared,
                stageTimeline: {
                    provision: { status: "READY", startedAt: provisionedAt, completedAt: provisionedAt }
                },
                assetManifest: prepared.assets.map(asset => ({
                    output: asset.output,
                    localFile: asset.stagingFile,
                    remoteFile: asset.remoteFile,
                    bytes: asset.bytes,
                    sha256: asset.sha256,
                    role: asset.role
                }))
            };
            atomicJsonWrite(file, state);
            return { pid: null, remoteWorker: runpodPublicWorker(state), kill() {} };
        }
        catch(error) {
            let provisionCleanupError = null;
            if (podId) {
                try {
                    await terminatePod(podId, job.operationId, "provision_cleanup");
                }
                catch(cleanupError) {
                    provisionCleanupError = cleanupError;
                }
            }
            if (provisionCleanupError) {
                const cleanupFailure = new Error("RUNPOD_PROVISION_CLEANUP_FAILED");
                cleanupFailure.retryable = false;
                cleanupFailure.stage = "provision_cleanup";
                cleanupFailure.podId = podId;
                cleanupFailure.providerCode = provisionCleanupError?.providerCode || null;
                cleanupFailure.providerMessage = provisionCleanupError?.providerMessage || null;
                cleanupFailure.providerHttp = provisionCleanupError?.providerHttp || null;
                cleanupFailure.remoteWorker = {
                    provider: "runpod",
                    podId,
                    remoteJobId: "runpod/" + podId + "/" + job.operationId,
                    provisionedAt: now().toISOString(),
                    operationId: job.operationId,
                    operationName: job.operationName
                };
                error = cleanupFailure;
            }
            if (error?.providerHttp) {
                let previous = null;
                try { if (fs.existsSync(file)) previous = readJson(file); }
                catch {}
                const providerHttpHistory = [
                    ...(Array.isArray(previous?.providerHttpHistory) ? previous.providerHttpHistory : []),
                    error.providerHttp
                ].slice(-10);
                atomicJsonWrite(file, {
                    schemaVersion: JARVIS_RUNPOD_ADAPTER_VERSION,
                    provider: "runpod",
                    phase: "PROVISION_FAILED",
                    operationId: job.operationId,
                    operationName: job.operationName,
                    missionId: job.missionId,
                    objectiveId: job.objectiveId,
                    obligationId: job.obligationId,
                    rootInstructionHash: job.rootInstructionHash,
                    error: error?.message || "RUNPOD_PROVISION_FAILED",
                    retryable: error?.retryable === true,
                    providerCode: error?.providerCode || null,
                    providerMessage: error?.providerMessage || null,
                    providerHttp: error.providerHttp,
                    providerHttpHistory,
                    createdAt: previous?.createdAt || now().toISOString(),
                    updatedAt: now().toISOString()
                });
            }
            try {
                const cleanupTarget = path.resolve(prepared.operationDir);
                const cleanupRoot = path.resolve(stateRoot);
                if (cleanupTarget.startsWith(`${cleanupRoot}${path.sep}`)) {
                    fs.rmSync(cleanupTarget, { recursive: true, force: true });
                }
            }
            catch {}
            throw error;
        }
    }

    function rentalCost(state) {
        const start = Date.parse(String(state.provisionedAt || state.createdAt || ""));
        const seconds = Number.isFinite(start) ? Math.max(0, (now().getTime() - start) / 1000) : 0;
        return {
            seconds,
            estimatedCostUsd: seconds * Number(state.hourlyRateUsd || 0) / 3600
        };
    }

    function withStage(state, name, status, details = {}) {
        const at = now().toISOString();
        const previous = state.stageTimeline?.[name] || {};
        return {
            ...state,
            stageTimeline: {
                ...(state.stageTimeline || {}),
                [name]: {
                    ...previous,
                    status,
                    startedAt: previous.startedAt || at,
                    ...(status === "READY" || status === "FAILED" || status === "TIMEOUT"
                        ? { completedAt: at }
                        : {}),
                    ...details
                }
            }
        };
    }

    async function readBootstrapProgress(state) {
        const progressFile = `${state.remoteOperationDir}/bootstrap-progress.json`;
        const result = await sshCommand(
            state,
            `if test -f ${shellSingleQuote(progressFile)}; then cat ${shellSingleQuote(progressFile)}; fi`
        );
        const raw = result.stdout.trim();
        if (!raw) return null;
        let progress;
        try { progress = JSON.parse(raw.split(/\r?\n/).at(-1)); }
        catch { throw new Error("RUNPOD_BOOTSTRAP_PROGRESS_INVALID"); }
        if (
            !["CACHE_MISS", "CACHE_POPULATING", "CACHE_MODEL_READY", "CACHE_READY", "CACHE_HIT"].includes(progress.cacheStatus) ||
            !String(progress.stage || "").trim() || !Number.isFinite(Date.parse(String(progress.at || "")))
        ) {
            throw new Error("RUNPOD_BOOTSTRAP_PROGRESS_INVALID");
        }
        return progress;
    }

    function persistBootstrapProgress(file, state, progress) {
        if (!progress) return state;
        const previousProgress = state.bootstrapProgress || null;
        const madeProgress = !previousProgress ||
            progress.stage !== previousProgress.stage ||
            progress.status !== previousProgress.status ||
            progress.cacheStatus !== previousProgress.cacheStatus ||
            Number(progress.modelBytes || 0) > Number(previousProgress.modelBytes || 0);
        state = withStage(state, progress.stage, progress.status, {
            cacheStatus: progress.cacheStatus,
            modelBytes: Number(progress.modelBytes || 0),
            lastProgressAt: progress.at
        });
        return writeState(file, state, {
            cacheStatus: progress.cacheStatus,
            bootstrapProgress: progress,
            lastBootstrapProgressAt: madeProgress
                ? progress.at
                : state.lastBootstrapProgressAt,
            stageTimeline: state.stageTimeline
        });
    }

    async function captureBootstrapFailureDiagnostics(state) {
        const captureErrors = [];
        const readDiagnostic = async (command, label, maximumLength = 12000) => {
            try {
                const result = await sshCommand(state, command);
                return sanitizeProviderText(result.stdout, maximumLength);
            }
            catch(error) {
                captureErrors.push({
                    label,
                    error: sanitizeProviderText(safeProviderDiagnostic(error).providerMessage, 1000)
                });
                return "";
            }
        };
        let progress = null;
        try {
            progress = await readBootstrapProgress(state) || state.bootstrapProgress || null;
        }
        catch(error) {
            captureErrors.push({
                label: "bootstrap_progress",
                error: sanitizeProviderText(safeProviderDiagnostic(error).providerMessage, 1000)
            });
        }
        const exitCodeRaw = await readDiagnostic(
            `cat ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.failed")}`,
            "bootstrap_exit_code",
            100
        );
        const logTail = await readDiagnostic(
            `tail -n 80 ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.log")}`,
            "bootstrap_log_tail"
        );
        const runtimePreflightRaw = await readDiagnostic(
            `cat ${shellSingleQuote(state.runtimeKind === "humo"
                ? state.cacheRoot + "/runtime-preflight.json"
                : remoteBase + "/cache/wan22-ti2v-5b/runtime-preflight.json")}`,
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
        }
        let runtimePreflight = null;
        if (runtimePreflightRaw) {
            try { runtimePreflight = JSON.parse(runtimePreflightRaw); }
            catch {
                captureErrors.push({
                    label: "runtime_preflight",
                    error: "RUNPOD_RUNTIME_PREFLIGHT_DIAGNOSTIC_INVALID"
                });
            }
        }
        const runtimePredicateResults = runtimePreflight ? {
            pythonVersion: String(runtimePreflight.pythonVersion || "")
                .startsWith(cacheContract.pythonVersionPrefix),
            torchVersion: String(runtimePreflight.torchVersion || "")
                .startsWith(cacheContract.torchVersionPrefix),
            torchCudaVersion: String(runtimePreflight.torchCudaVersion || "")
                .startsWith(cacheContract.torchCudaVersionPrefix),
            computeCapability: String(runtimePreflight.computeCapability || "") ===
                cacheContract.computeCapability,
            cudaProbe: runtimePreflight.cudaProbe === true,
            flashAttentionCudaProbe: runtimePreflight.flashAttentionCudaProbe === true,
            pipCheck: runtimePreflight.pipCheck === true,
            wanCliImport: runtimePreflight.wanCliImport === true,
            flashAttentionWheelAuthorized: runtimePreflight.flashAttentionWheelAuthorized === true,
            imports: runtimePreflight.imports &&
                Object.values(runtimePreflight.imports).every(Boolean),
            flashAttentionVersion: String(runtimePreflight.flashAttentionVersion || "") ===
                cacheContract.flashAttentionVersion
        } : null;
        const runtimePredicateFailures = runtimePredicateResults
            ? Object.entries(runtimePredicateResults)
                .filter(([, passed]) => passed !== true)
                .map(([name]) => name)
            : [];
        const parsedExitCode = Number.parseInt(exitCodeRaw.trim(), 10);
        return {
            capturedAt: now().toISOString(),
            exitCode: Number.isInteger(parsedExitCode) ? parsedExitCode : null,
            progress,
            stage: String(progress?.stage || "BOOTSTRAP"),
            cacheStatus: String(progress?.cacheStatus || state.cacheStatus || "CACHE_MISS"),
            logTail: logTail || null,
            runtimePreflight,
            pipCheckExitCode: Number.isInteger(runtimePreflight?.pipCheckExitCode)
                ? runtimePreflight.pipCheckExitCode
                : null,
            pipCheckStdout: runtimePreflight && "pipCheckStdout" in runtimePreflight
                ? sanitizeProviderText(runtimePreflight.pipCheckStdout, 2000)
                : null,
            pipCheckStderr: runtimePreflight && "pipCheckStderr" in runtimePreflight
                ? sanitizeProviderText(runtimePreflight.pipCheckStderr, 2000)
                : null,
            pipCheckTimedOut: runtimePreflight?.pipCheckTimedOut === true,
            pipCheckAdvisories: Array.isArray(runtimePreflight?.pipCheckAdvisories)
                ? runtimePreflight.pipCheckAdvisories
                    .map(value => sanitizeProviderText(value, 500))
                    .filter(Boolean)
                    .slice(0, 5)
                : [],
            wanCliImportExitCode: Number.isInteger(runtimePreflight?.wanCliImportExitCode)
                ? runtimePreflight.wanCliImportExitCode
                : null,
            wanCliImportStdout: runtimePreflight && "wanCliImportStdout" in runtimePreflight
                ? sanitizeProviderText(runtimePreflight.wanCliImportStdout, 2000)
                : null,
            wanCliImportStderr: runtimePreflight && "wanCliImportStderr" in runtimePreflight
                ? sanitizeProviderText(runtimePreflight.wanCliImportStderr, 2000)
                : null,
            wanCliImportTimedOut: runtimePreflight?.wanCliImportTimedOut === true,
            runtimePredicateResults,
            runtimePredicateFailures,
            expectedObserved: runtimePreflight ? {
                pythonVersion: {
                    expected: cacheContract.pythonVersionPrefix,
                    observed: runtimePreflight.pythonVersion || null
                },
                torchVersion: {
                    expected: cacheContract.torchVersionPrefix,
                    observed: runtimePreflight.torchVersion || null
                },
                torchCudaVersion: {
                    expected: cacheContract.torchCudaVersionPrefix,
                    observed: runtimePreflight.torchCudaVersion || null
                },
                cudaImageVersion: {
                    expected: "observed evidence only; torch CUDA runtime remains authoritative",
                    observed: runtimePreflight.cudaImageVersion || null
                },
                computeCapability: {
                    expected: cacheContract.computeCapability,
                    observed: runtimePreflight.computeCapability || null
                },
                flashAttentionVersion: {
                    expected: cacheContract.flashAttentionVersion,
                    observed: runtimePreflight.flashAttentionVersion || null
                },
                flashAttentionWheelAbi: {
                    expected: "FALSE or TRUE with an authorized official wheel",
                    observed: runtimePreflight.flashAttentionWheelAbi || null
                },
                flashAttentionWheelSha256: {
                    expected: "authorized ABI-specific SHA-256",
                    observed: runtimePreflight.flashAttentionWheelSha256 || null
                },
                cudaProbe: {
                    expected: true,
                    observed: runtimePreflight.cudaProbe ?? null
                },
                flashAttentionCudaProbe: {
                    expected: true,
                    observed: runtimePreflight.flashAttentionCudaProbe ?? null
                },
                pipCheck: {
                    expected: true,
                    observed: runtimePreflight.pipCheck ?? null
                },
                wanCliImport: {
                    expected: true,
                    observed: runtimePreflight.wanCliImport ?? null
                },
                imports: {
                    expected: true,
                    observed: runtimePreflight.imports || null
                }
            } : null,
            ...(captureErrors.length > 0 ? { captureErrors } : {})
        };
    }

    async function readObservedModelManifest(state) {
        try {
            const manifestFile = `${remoteBase}/cache/wan22-ti2v-5b/model-manifest.json`;
            const result = await sshCommand(state, `cat ${shellSingleQuote(manifestFile)}`);
            const manifest = JSON.parse(result.stdout.trim());
            if (String(manifest?.operationId || "") !== String(state.operationId || "")) {
                throw new Error("RUNPOD_MODEL_MANIFEST_OPERATION_ID_MISMATCH");
            }
            const replica = normalizedCacheReplica({
                networkVolumeId: state.networkVolumeId,
                networkVolumeDataCenterId: state.networkVolumeDataCenterId,
                networkVolumeSizeGb: state.networkVolumeSizeGb,
                networkVolumeRetained: true,
                cacheStatus: state.cacheStatus,
                phase: "CACHE_READY",
                modelManifest: manifest
            });
            if (!replica || replica.invalid || replica.incomplete || replica.shaVerified !== true) {
                throw new Error("RUNPOD_MODEL_MANIFEST_INVALID");
            }
            return manifest;
        }
        catch {
            throw new Error("RUNPOD_MODEL_MANIFEST_INVALID");
        }
    }

    async function uploadOperation(state) {
        writeRemoteRuntimeBootstrapFile(state.bootstrapFile, state);
        await sshCommand(state, `mkdir -p ${shellSingleQuote(state.remoteOperationDir + "/assets")}`);
        await scpFile(state, state.localJobFile, `${state.remoteOperationDir}/job.json`);
        await scpFile(state, state.localRunnerFile, `${state.remoteOperationDir}/jarvis-local-video-wan22.py`);
        await scpFile(state, state.bootstrapFile, `${state.remoteOperationDir}/bootstrap.sh`);
        for (const asset of state.assetManifest) await scpFile(state, asset.localFile, asset.remoteFile);
        for (const asset of state.assetManifest) {
            const checked = await sshCommand(state, `sha256sum ${shellSingleQuote(asset.remoteFile)}`);
            const actual = checked.stdout.trim().split(/\s+/)[0]?.toLowerCase();
            if (actual !== asset.sha256) throw new Error("RUNPOD_ASSET_SHA256_MISMATCH");
        }
    }

    async function writeLocalFailure(operation, resultFile, status, retryable = false, evidence = {}) {
        atomicJsonWrite(resultFile, {
            ok: false,
            status,
            error: status,
            retryable,
            operationId: operation.operationId,
            operationName: operation.operationName,
            backend: operation.backend,
            model: operation.model,
            engine: "local",
            provider: "local",
            externalApiUsed: false,
            externalEstimatedCostUsd: 0,
            ...evidence
        });
    }

    async function pollRemote({ operation, resultFile }) {
        assertProviderConfigured();
        const loaded = readState(operation);
        let state = loaded.state;
        const cost = rentalCost(state);
        const measuredAt = now().toISOString();
        state = writeState(loaded.file, state, {
            gpuRentalSeconds: cost.seconds,
            gpuRentalEstimatedCost: cost.estimatedCostUsd,
            externalComputeMeter: {
                schemaVersion: "jarvis.external-compute-meter.v1",
                provider: "runpod",
                resourceType: state.gpuTypeId ? "GPU" : "CPU",
                resourceId: state.podId || null,
                resourceProfile: state.gpuTypeId || null,
                dataCenterId: state.dataCenterId || state.networkVolumeDataCenterId || null,
                startedAt: state.provisionedAt || state.createdAt || null,
                measuredAt,
                elapsedSeconds: cost.seconds,
                hourlyRateUsd: Number(state.hourlyRateUsd || 0),
                estimatedCostUsd: cost.estimatedCostUsd,
                hardBudgetUsd: Number(state.hardBudgetUsd || 0),
                maximumSpendBeforeCleanupUsd: Number(state.maximumSpendBeforeCleanupUsd || 0),
                status: "RUNNING"
            }
        });
        if (cost.estimatedCostUsd >= state.hardBudgetUsd * budgetStopRatio) {
            await writeLocalFailure(operation, resultFile, "RUNPOD_HARD_BUDGET_EXCEEDED", false);
            state = writeState(loaded.file, state, { phase: "BUDGET_EXCEEDED" });
            return { ok: false, done: true, status: "RUNPOD_HARD_BUDGET_EXCEEDED", remoteWorker: runpodPublicWorker(state) };
        }
        try {
            if (state.phase === "PROVISIONED") {
                const pod = await apiRequest(
                    `${apiBase}/pods/${encodeURIComponent(state.podId)}?includeMachine=true`,
                    { method: "GET" },
                    [200],
                    "poll_pod",
                    state.operationId
                );
                if (String(pod?.id || "") !== state.podId) throw new Error("RUNPOD_POD_IDENTITY_MISMATCH");
                if (String(pod?.desiredStatus || "") !== "RUNNING") {
                    return { ok: true, done: false, status: "RUNPOD_POD_STARTING", remoteWorker: runpodPublicWorker(state) };
                }
                const publicIp = String(pod?.publicIp || "").trim();
                const sshPort = Number(pod?.portMappings?.["22"] || 0);
                if (!publicIp || !sshPort) {
                    return { ok: true, done: false, status: "RUNPOD_SSH_STARTING", remoteWorker: runpodPublicWorker(state) };
                }
                state = withStage(state, "podReady", "READY", { publicIp, sshPort });
                state = writeState(loaded.file, state, { publicIp, sshPort, phase: "POD_RUNNING", stageTimeline: state.stageTimeline });
            }
            if (state.phase === "POD_RUNNING") {
                const health = await remoteHealth(state, false);
                await uploadOperation(state);
                const command = `(bash ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.sh")} > ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.log")} 2>&1 && touch ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.ready")}) || { code=$?; echo $code > ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.failed")}; }`;
                await sshCommand(
                    state,
                    `rm -f ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.ready")} ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.failed")}; nohup bash -lc ${shellSingleQuote(command)} >/dev/null 2>&1 &`,
                    30000
                );
                const bootstrapStartedAt = now().toISOString();
                state = withStage(state, "bootstrap", "RUNNING");
                state = writeState(loaded.file, state, {
                    phase: "BOOTSTRAPPING",
                    baseHealth: health,
                    physicalHealthVerified: true,
                    bootstrapStartedAt,
                    lastBootstrapProgressAt: bootstrapStartedAt,
                    stageTimeline: state.stageTimeline
                });
                return { ok: true, done: false, status: state.runtimeKind === "humo" ? "RUNPOD_HUMO_BOOTSTRAPPING" : "RUNPOD_WAN22_BOOTSTRAPPING", remoteWorker: runpodPublicWorker(state) };
            }
            if (state.phase === "BOOTSTRAPPING") {
                const progress = await readBootstrapProgress(state);
                state = persistBootstrapProgress(loaded.file, state, progress);
                const lastProgressMs = Date.parse(String(state.lastBootstrapProgressAt || state.bootstrapStartedAt || ""));
                if (Number.isFinite(lastProgressMs) && (now().getTime() - lastProgressMs) / 1000 >= state.bootstrapTimeoutSeconds) {
                    const bootstrapDiagnostics = await captureBootstrapFailureDiagnostics(state);
                    state = withStage(state, "bootstrap", "TIMEOUT");
                    state = writeState(loaded.file, state, {
                        phase: "BOOTSTRAP_TIMEOUT",
                        bootstrapDiagnostics,
                        ...(bootstrapDiagnostics.runtimePredicateResults
                            ? { runtimePredicateResults: bootstrapDiagnostics.runtimePredicateResults }
                            : {}),
                        ...(bootstrapDiagnostics.runtimePredicateFailures.length > 0
                            ? { runtimePredicateFailures: bootstrapDiagnostics.runtimePredicateFailures }
                            : {}),
                        stageTimeline: state.stageTimeline
                    });
                    await writeLocalFailure(operation, resultFile, "RUNPOD_BOOTSTRAP_TIMEOUT", false, {
                        bootstrapDiagnostics
                    });
                    return { ok: false, done: true, status: "RUNPOD_BOOTSTRAP_TIMEOUT", remoteWorker: runpodPublicWorker(state) };
                }
                const marker = await sshCommand(state,
                    `if test -f ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.ready")}; then echo READY; elif test -f ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.failed")}; then echo FAILED; else echo RUNNING; fi`
                );
                const status = marker.stdout.trim().split(/\r?\n/).at(-1);
                if (status === "FAILED") {
                    writeRemoteRuntimeBootstrapFile(state.bootstrapFile, state);
                    const expectedBootstrapSha = createHash("sha256")
                        .update(fs.readFileSync(state.bootstrapFile))
                        .digest("hex");
                    const remoteBootstrapSha = (await sshCommand(
                        state,
                        `sha256sum ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.sh")}`
                    )).stdout.trim().split(/\s+/)[0]?.toLowerCase();
                    if (remoteBootstrapSha !== expectedBootstrapSha) {
                        state = writeState(loaded.file, state, { phase: "POD_RUNNING" });
                        return {
                            ok: true,
                            done: false,
                            status: state.runtimeKind === "humo"
                                ? "RUNPOD_HUMO_BOOTSTRAP_REFRESH_REQUIRED"
                                : "RUNPOD_WAN22_BOOTSTRAP_REFRESH_REQUIRED",
                            remoteWorker: runpodPublicWorker(state)
                        };
                    }
                    const bootstrapDiagnostics = await captureBootstrapFailureDiagnostics(state);
                    state = withStage(state, "bootstrap", "FAILED");
                    state = writeState(loaded.file, state, {
                        phase: "BOOTSTRAP_INCOMPLETE",
                        bootstrapDiagnostics,
                        ...(bootstrapDiagnostics.runtimePredicateResults
                            ? { runtimePredicateResults: bootstrapDiagnostics.runtimePredicateResults }
                            : {}),
                        ...(bootstrapDiagnostics.runtimePredicateFailures.length > 0
                            ? { runtimePredicateFailures: bootstrapDiagnostics.runtimePredicateFailures }
                            : {}),
                        stageTimeline: state.stageTimeline
                    });
                    await writeLocalFailure(operation, resultFile, "RUNPOD_BOOTSTRAP_INCOMPLETE", false, {
                        bootstrapDiagnostics
                    });
                    return { ok: false, done: true, status: "RUNPOD_BOOTSTRAP_INCOMPLETE", remoteWorker: runpodPublicWorker(state) };
                }
                if (status !== "READY") {
                    return { ok: true, done: false, status: state.runtimeKind === "humo" ? "RUNPOD_HUMO_BOOTSTRAPPING" : "RUNPOD_WAN22_BOOTSTRAPPING", remoteWorker: runpodPublicWorker(state) };
                }
                const finalProgress = await readBootstrapProgress(state);
                state = persistBootstrapProgress(loaded.file, state, finalProgress);
                if (state.runtimeCertificationOnly === true && state.networkVolumeId) {
                    const mountedRuntimeCertified = finalProgress?.status === "READY" && (
                        (finalProgress.cacheStatus === "CACHE_READY" && finalProgress.stage === "RUNNER_READY") ||
                        (finalProgress.cacheStatus === "CACHE_HIT" && finalProgress.stage === "CACHE_VALIDATE")
                    );
                    if (!mountedRuntimeCertified) {
                        throw new Error("RUNPOD_RUNTIME_CERTIFICATION_PROGRESS_INVALID");
                    }
                }
                const health = await remoteHealth(state, true);
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
                if (state.runtimeCertificationOnly === true) {
                    const certifiedAt = now().toISOString();
                    const modelManifest = state.networkVolumeId
                        ? await readObservedModelManifest(state)
                        : null;
                    const result = {
                        ok: true,
                        done: true,
                        status: "RUNPOD_RUNTIME_PREFLIGHT_CERTIFIED",
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
                        gpuTypeId,
                        gpuName: health.gpuName,
                        providerVramGb: Number(state.providerVramGb || state.vramGb || 0),
                        vramGb: Number(health.vramGb || 0),
                        vramBytes: Number(health.vramBytes || 0),
                        computeCapability: health.computeCapability,
                        pythonVersion: health.pythonVersion,
                        torchVersion: health.torchVersion,
                        torchCudaVersion: health.torchCudaVersion,
                        cudaImageVersion: health.cudaImageVersion || null,
                        nvccPresent: health.nvcc === true,
                        cudaProbe: health.cudaProbe === true,
                        flashAttentionWheelAbi: health.flashAttentionWheelAbi || null,
                        flashAttentionWheelSha256: health.flashAttentionWheelSha256 || null,
                        flashAttentionCudaProbe: health.flashAttentionCudaProbe === true,
                        pipCheck: health.pipCheck === true,
                        wanCliImport: health.wanCliImport === true,
                        imports: health.imports === true,
                        provisionImageTag,
                        expectedRegistryDigest: cacheContract.expectedRegistryDigest,
                        modelRevision: cacheContract.modelRevision,
                        wanRepositoryRevision: cacheContract.wanRepositoryRevision,
                        cacheStatus: state.cacheStatus || "CACHE_MISS",
                        inferenceStarted: false,
                        ...(modelManifest ? { modelManifest } : {}),
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
                        computeCapability: health.computeCapability,
                        modelRevision: cacheContract.modelRevision,
                        wanRepositoryRevision: cacheContract.wanRepositoryRevision,
                        cacheStatus: state.cacheStatus || "CACHE_MISS",
                        inferenceStarted: false,
                        ...(modelManifest ? { modelManifest } : {}),
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
                const runner = state.runtimeKind === "humo"
                    ? `env JARVIS_HUMO_REPO_DIR=${shellSingleQuote(state.repositoryDir)} JARVIS_HUMO_WEIGHTS_DIR=${shellSingleQuote(state.weightsDir)} JARVIS_HUMO_WAN21_MODEL_DIR=${shellSingleQuote(state.wan21Dir)} JARVIS_HUMO_WHISPER_DIR=${shellSingleQuote(state.whisperDir)} JARVIS_HUMO_AUDIO_SEPARATOR_FILE=${shellSingleQuote(state.separatorFile)} JARVIS_LOCAL_VIDEO_EXTERNAL_API_ALLOWED=false JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS=${Math.floor(inferenceTimeoutSeconds)} ${shellSingleQuote(state.venvDir + "/bin/python")} ${shellSingleQuote(state.remoteOperationDir + "/jarvis-local-video-wan22.py")} --job ${shellSingleQuote(state.remoteOperationDir + "/job.json")} --result ${shellSingleQuote(state.remoteResultFile)}`
                    : `env JARVIS_WAN22_REPO_DIR=${shellSingleQuote(remoteBase + "/cache/wan22-ti2v-5b/Wan2.2")} JARVIS_LOCAL_VIDEO_EXTERNAL_API_ALLOWED=false JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS=${Math.floor(inferenceTimeoutSeconds)} ${shellSingleQuote(remoteBase + "/cache/wan22-ti2v-5b/venv/bin/python")} ${shellSingleQuote(state.remoteOperationDir + "/jarvis-local-video-wan22.py")} --job ${shellSingleQuote(state.remoteOperationDir + "/job.json")} --result ${shellSingleQuote(state.remoteResultFile)}`;
                const started = await sshCommand(state, `nohup bash -lc ${shellSingleQuote(runner)} > ${shellSingleQuote(state.remoteOperationDir + "/runner.log")} 2>&1 & echo $!`);
                const remotePid = Number(started.stdout.trim().split(/\r?\n/).at(-1));
                if (!Number.isInteger(remotePid) || remotePid < 1) throw new Error("RUNPOD_REMOTE_JOB_START_FAILED");
                state = withStage(state, "bootstrap", "READY");
                state = withStage(state, "inference", "RUNNING");
                state = writeState(loaded.file, state, {
                    phase: "JOB_RUNNING",
                    remotePid,
                    fullHealth: health,
                    physicalHealthVerified: true,
                    runtimePreflightVerified: true,
                    cacheStatus: state.cacheStatus === "CACHE_HIT" ? "CACHE_HIT" : "CACHE_READY",
                    inferenceStartedAt: now().toISOString(),
                    stageTimeline: state.stageTimeline
                });
                return { ok: true, done: false, status: "RUNPOD_REMOTE_JOB_RUNNING", remoteWorker: runpodPublicWorker(state) };
            }
            if (state.phase === "JOB_RUNNING") {
                const inferenceStartedMs = Date.parse(String(state.inferenceStartedAt || ""));
                if (Number.isFinite(inferenceStartedMs) && (now().getTime() - inferenceStartedMs) / 1000 >= state.inferenceTimeoutSeconds) {
                    await writeLocalFailure(operation, resultFile, "RUNPOD_INFERENCE_TIMEOUT", false);
                    state = withStage(state, "inference", "TIMEOUT");
                    state = writeState(loaded.file, state, { phase: "INFERENCE_TIMEOUT", stageTimeline: state.stageTimeline });
                    return { ok: false, done: true, status: "RUNPOD_INFERENCE_TIMEOUT", remoteWorker: runpodPublicWorker(state) };
                }
                const check = await sshCommand(state,
                    `if test -f ${shellSingleQuote(state.remoteResultFile)}; then echo RESULT; elif kill -0 ${Number(state.remotePid)} 2>/dev/null; then echo RUNNING; else echo LOST; fi`
                );
                const status = check.stdout.trim().split(/\r?\n/).at(-1);
                if (status === "RUNNING") {
                    return { ok: true, done: false, status: "RUNPOD_REMOTE_JOB_RUNNING", remoteWorker: runpodPublicWorker(state) };
                }
                if (status !== "RESULT") {
                    await writeLocalFailure(operation, resultFile, "RUNPOD_REMOTE_WORKER_LOST", true);
                    state = writeState(loaded.file, state, { phase: "WORKER_LOST" });
                    return { ok: false, done: true, status: "RUNPOD_REMOTE_WORKER_LOST", remoteWorker: runpodPublicWorker(state) };
                }
                const resultPayload = await sshCommand(state, `cat ${shellSingleQuote(state.remoteResultFile)}`);
                let result;
                try { result = JSON.parse(resultPayload.stdout); }
                catch { throw new Error("RUNPOD_REMOTE_RESULT_INVALID"); }
                if (result?.ok !== true) {
                    atomicJsonWrite(resultFile, result);
                    state = writeState(loaded.file, state, { phase: "JOB_FAILED" });
                    return { ok: false, done: true, status: result.status || "RUNPOD_REMOTE_JOB_FAILED", remoteWorker: runpodPublicWorker(state) };
                }
                const remoteIntegrity = await sshCommand(state,
                    `sha256sum ${shellSingleQuote(state.remoteOutputFile)} && stat -c %s ${shellSingleQuote(state.remoteOutputFile)}`
                );
                const integrityLines = remoteIntegrity.stdout.trim().split(/\r?\n/);
                const remoteSha256 = integrityLines[0]?.trim().split(/\s+/)[0]?.toLowerCase();
                const remoteBytes = Number(integrityLines.at(-1));
                if (!/^[a-f0-9]{64}$/.test(String(remoteSha256 || "")) || !(remoteBytes > 0)) {
                    throw new Error("RUNPOD_REMOTE_RESULT_INTEGRITY_INVALID");
                }
                fs.mkdirSync(path.dirname(operation.outputFile || path.resolve(resolvedRoot, operation.output)), { recursive: true });
                const localOutput = path.resolve(resolvedRoot, operation.output);
                await scpDownload(state, state.remoteOutputFile, localOutput);
                const localBytes = fs.readFileSync(localOutput);
                const localSha256 = createHash("sha256").update(localBytes).digest("hex");
                if (localBytes.length !== remoteBytes) throw new Error("REMOTE_VIDEO_RESULT_BYTES_MISMATCH");
                if (localSha256 !== remoteSha256) throw new Error("REMOTE_VIDEO_RESULT_SHA256_MISMATCH");
                atomicJsonWrite(resultFile, { ...result, bytes: remoteBytes, sha256: remoteSha256 });
                state = writeState(loaded.file, state, { phase: "RESULT_DOWNLOADED" });
                return { ok: true, done: true, status: "RUNPOD_REMOTE_RESULT_DOWNLOADED", remoteWorker: runpodPublicWorker(state) };
            }
            return { ok: true, done: false, status: `RUNPOD_${state.phase || "UNKNOWN"}`, remoteWorker: runpodPublicWorker(state) };
        }
        catch(error) {
            if (error?.retryable === true || /timed? ?out|ECONN|ETIMEDOUT|connection/i.test(String(error?.message || error))) {
                return {
                    ok: true,
                    done: false,
                    status: "RUNPOD_POLL_TRANSPORT_RETRYABLE",
                    retryable: true,
                    remoteJobId: state.remoteJobId,
                    remoteWorker: runpodPublicWorker(state)
                };
            }
            const failureStatus = error?.message || "RUNPOD_REMOTE_POLL_FAILED";
            const failurePhase = [
                "RUNPOD_WAN22_RUNTIME_PREFLIGHT_FAILED",
                "RUNPOD_HUMO_RUNTIME_PREFLIGHT_FAILED"
            ].includes(failureStatus)
                ? "RUNTIME_PREFLIGHT_FAILED"
                : failureStatus === "RUNPOD_IMAGE_RUNTIME_MISMATCH"
                    ? "IMAGE_RUNTIME_MISMATCH"
                    : "FAILED";
            await writeLocalFailure(operation, resultFile, failureStatus, false);
            state = withStage(state,
                failurePhase === "RUNTIME_PREFLIGHT_FAILED" ? "runtime_preflight" : "worker_health",
                "FAILED"
            );
            state = writeState(loaded.file, state, {
                phase: failurePhase,
                error: failureStatus,
                stageTimeline: state.stageTimeline,
                ...(error?.baseHealth ? { baseHealth: error.baseHealth } : {}),
                ...(error?.fullHealth ? { fullHealth: error.fullHealth } : {}),
                ...(error?.runtimePredicateResults
                    ? { runtimePredicateResults: error.runtimePredicateResults }
                    : {}),
                ...(error?.runtimePredicateFailures
                    ? { runtimePredicateFailures: error.runtimePredicateFailures }
                    : {}),
                ...providerHttpPatch(state, error)
            });
            return { ok: false, done: true, status: state.error, remoteWorker: runpodPublicWorker(state) };
        }
    }

    async function release(receipt = {}) {
        assertProviderConfigured();
        let loaded;
        let state;
        try {
            loaded = readState(receipt);
            state = loaded.state;
        }
        catch(error) {
            const podId = String(receipt?.remoteWorker?.podId || receipt?.podId || "").trim();
            if (!podId) return { ok: false, status: error.message, error: error.message };
            let file = null;
            try { file = stateFile(receipt.operationId); }
            catch {}
            let persisted = null;
            try { if (file && fs.existsSync(file)) persisted = readJson(file); }
            catch {}
            if (persisted && String(persisted.podId || "") === podId) {
                loaded = { file };
                state = persisted;
            }
            else {
                loaded = { file };
                state = {
                    ...(receipt.remoteWorker || {}),
                    provider: "runpod",
                    podId,
                    operationId: receipt.operationId,
                    operationName: receipt.operationName,
                    networkVolumeId: receipt.remoteWorker?.networkVolumeId || null
                };
            }
        }
        const cost = rentalCost(state);
        try {
            const terminated = await terminatePod(state.podId, state.operationId, "release");
            let actualCostUsd = 0;
            let billingPatch = {};
            try {
                const billing = await apiRequest(
                    `${apiBase}/billing/pods?podId=${encodeURIComponent(state.podId)}&grouping=podId&bucketSize=hour`,
                    { method: "GET" },
                    [200],
                    "billing",
                    state.operationId
                );
                actualCostUsd = (Array.isArray(billing) ? billing : [])
                    .filter(item => item?.podId === state.podId)
                    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
            }
            catch(error) {
                billingPatch = {
                    billingError: error?.message || "RUNPOD_BILLING_QUERY_FAILED",
                    ...providerHttpPatch(state, error)
                };
            }
            const releasePatch = {
                phase: "TERMINATED",
                releasedAt: now().toISOString(),
                releaseReason: receipt.reason || null,
                terminationVerified: terminated.terminationVerified,
                gpuRentalSeconds: cost.seconds,
                gpuRentalEstimatedCost: cost.estimatedCostUsd,
                gpuRentalActualCost: actualCostUsd,
                externalComputeMeter: {
                    ...(state.externalComputeMeter || {}),
                    schemaVersion: "jarvis.external-compute-meter.v1",
                    provider: "runpod",
                    resourceType: state.gpuTypeId ? "GPU" : "CPU",
                    resourceId: state.podId || null,
                    resourceProfile: state.gpuTypeId || null,
                    dataCenterId: state.dataCenterId || state.networkVolumeDataCenterId || null,
                    startedAt: state.provisionedAt || state.createdAt || null,
                    measuredAt: now().toISOString(),
                    endedAt: now().toISOString(),
                    elapsedSeconds: cost.seconds,
                    hourlyRateUsd: Number(state.hourlyRateUsd || 0),
                    estimatedCostUsd: cost.estimatedCostUsd,
                    actualCostUsd,
                    hardBudgetUsd: Number(state.hardBudgetUsd || 0),
                    maximumSpendBeforeCleanupUsd: Number(state.maximumSpendBeforeCleanupUsd || 0),
                    status: "STOPPED"
                },
                networkVolumeId: state.networkVolumeId || null,
                networkVolumeRetained: Boolean(state.networkVolumeId),
                ...billingPatch
            };
            state = { ...state, ...releasePatch, updatedAt: now().toISOString() };
            try { if (loaded.file) state = writeState(loaded.file, state, {}); }
            catch {}
            for (const sensitive of [state.privateKeyFile, state.publicKeyFile, state.knownHostsFile]) {
                try { if (sensitive && fs.existsSync(sensitive)) fs.unlinkSync(sensitive); } catch {}
            }
            return {
                ok: true,
                status: "RUNPOD_POD_TERMINATED_VERIFIED",
                receiptId: `runpod-delete/${state.podId}`,
                provider: "runpod",
                podId: state.podId,
                remoteJobId: state.remoteJobId,
                terminationVerified: terminated.terminationVerified,
                gpuRentalSeconds: cost.seconds,
                gpuRentalEstimatedCost: cost.estimatedCostUsd,
                gpuRentalActualCost: actualCostUsd,
                networkVolumeId: state.networkVolumeId || null,
                networkVolumeRetained: Boolean(state.networkVolumeId)
            };
        }
        catch(error) {
            const releasePatch = {
                phase: "RELEASE_FAILED",
                releaseError: error?.message || "RUNPOD_POD_TERMINATION_FAILED",
                ...providerHttpPatch(state, error)
            };
            state = { ...state, ...releasePatch, updatedAt: now().toISOString() };
            try { if (loaded.file) state = writeState(loaded.file, state, {}); }
            catch {}
            return {
                ok: false,
                status: "RUNPOD_POD_TERMINATION_FAILED",
                error: state.releaseError,
                provider: "runpod",
                podId: state.podId,
                gpuRentalSeconds: cost.seconds,
                gpuRentalEstimatedCost: cost.estimatedCostUsd
            };
        }
    }

    function inspectHardware() {
        let configurationStatus = "RUNPOD_PROVISIONING_CONFIGURED";
        try {
            assertZeroCostConfiguration();
            assertPaidResourceCreationAuthority();
            assertProviderConfigured();
        }
        catch(error) {
            configurationStatus = error?.message || "RUNPOD_PROVISIONING_NOT_CONFIGURED";
        }
        const configured = configurationStatus === "RUNPOD_PROVISIONING_CONFIGURED";
        return {
            ok: configured,
            status: configurationStatus,
            cudaAvailable: null,
            gpuName: null,
            gpuIndex: null,
            vramGb: null,
            freeDiskGb: null,
            ffmpegAvailable: null,
            ffprobeAvailable: null,
            pythonAvailable: null,
            requestedGpuName: gpuTypeId,
            requestedVramGb: expectedVramGb,
            requestedStorageGb: networkVolumeId
                ? (cacheContract?.minimumNetworkVolumeGb || RUNPOD_WAN22_CACHE_BASE.minimumNetworkVolumeGb)
                : containerDiskInGb + volumeInGb,
            physicalHealthVerified: false,
            runtimePreflightVerified: false,
            zeroCostPrecheckAvailable: true,
            paidResourceCreationAuthorized,
            paidResourceCreationPossible: configured,
            readinessLevel: configured ? "PROVISIONING_CONFIGURED" : "ZERO_COST_ONLY",
            remoteProvisioning: true,
            provider: "runpod",
            provisionImageTag,
            expectedRegistryDigest: cacheContract?.expectedRegistryDigest || null,
            runtimeIdentity: cacheContract?.runtimeIdentity ? { ...cacheContract.runtimeIdentity } : null,
            registryDigestVerificationRequired: true,
            hardBudgetUsd,
            budgetStopRatio,
            maximumSpendBeforeCleanupUsd: Number((hardBudgetUsd * budgetStopRatio).toFixed(6)),
            networkVolumeId: networkVolumeId || null,
            cacheProfile: cacheContract?.profile || null,
            bootstrapTimeoutSeconds,
            inferenceTimeoutSeconds
        };
    }

    return {
        version: JARVIS_RUNPOD_ADAPTER_VERSION,
        provider: "runpod",
        configured: provider === "runpod" && Boolean(apiKey) && paidResourceCreationAuthorized,
        inspectHardware,
        inspectZeroCostPrecheck,
        inspectHuMoZeroCostPrecheck,
        inspectHuMoRuntimeCertificationPrecheck,
        inspectHuMoRemoteLifecyclePlan,
        inspectLiveZeroCostPrecheck,
        inspectCpuStagingPrecheck,
        inspectCpuStagingRuntimeIdentity,
        launch,
        poll: pollRemote,
        release
    };
}

export function createLocalVideoEngine({
    root = process.cwd(),
    env = process.env,
    inspectHardware = () => inspectLocalVideoHardware({ root, env }),
    inspectVideo = null,
    launch = null,
    pollRemote = null,
    release = null,
    prepareReferenceSheet = prepareVideoReferenceSheet,
    now = () => new Date()
} = {}) {
    const resolvedRoot = path.resolve(root);
    const policy = describeLocalVideoPolicy(env);
    const directories = operationDirectories(resolvedRoot);
    const children = new Map();

    async function releaseWorker(file, operation, reason) {
        if (operation?.executionTarget !== "remote" || operation?.workerRelease?.ok === true) {
            return { ok: true, operation };
        }
        const remoteWorker = operation?.remoteWorker || null;
        const podId = remoteWorker?.podId || operation?.podId || null;
        const runpodProvisioning = remoteWorker?.provider === "runpod" ||
            String(env.JARVIS_REMOTE_GPU_PROVIDER || "").trim().toLowerCase() === "runpod";
        if (runpodProvisioning && !podId) {
            const persisted = trySaveOperation(file, operation, {
                gpuRentalSeconds: 0,
                gpuRentalEstimatedCost: 0,
                gpuRentalActualCost: 0,
                workerRelease: {
                    ok: true,
                    status: "REMOTE_VIDEO_WORKER_NOT_PROVISIONED",
                    reason,
                    releasedAt: now().toISOString(),
                    terminationVerified: true,
                    gpuRentalSeconds: 0,
                    gpuRentalEstimatedCost: 0,
                    gpuRentalActualCost: 0
                }
            });
            return {
                ok: persisted.error === null,
                operation: persisted.operation,
                ...(persisted.error ? { error: persisted.error } : {})
            };
        }
        const startedAt = Date.parse(String(
            runpodProvisioning
                ? remoteWorker?.provisionedAt || remoteWorker?.createdAt || ""
                : operation?.createdAt || ""
        ));
        const endedAt = now();
        const gpuRentalSeconds = Number.isFinite(startedAt)
            ? Math.max(0, (endedAt.getTime() - startedAt) / 1000)
            : 0;
        const hourlyRate = Number(env.JARVIS_REMOTE_GPU_HOURLY_RATE_USD || 0);
        const gpuRentalEstimatedCost = Number.isFinite(hourlyRate) && hourlyRate > 0
            ? gpuRentalSeconds * hourlyRate / 3600
            : 0;
        if (typeof release !== "function") {
            const error = "REMOTE_VIDEO_WORKER_RELEASE_HANDLER_REQUIRED";
            const persisted = trySaveOperation(file, operation, {
                gpuRentalSeconds,
                gpuRentalEstimatedCost,
                gpuRentalActualCost: 0,
                workerRelease: {
                    ok: false,
                    status: error,
                    error,
                    reason,
                    releasedAt: null
                }
            });
            return {
                ok: false,
                operation: persisted.operation,
                error: persisted.error || error
            };
        }
        try {
            const receipt = await release({
                operationId: operation.operationId,
                operationName: operation.operationName,
                backend: operation.backend,
                missionId: operation.missionId,
                objectiveId: operation.objectiveId,
                obligationId: operation.obligationId,
                rootInstructionHash: operation.rootInstructionHash,
                remoteWorker: operation.remoteWorker || null,
                reason
            });
            if (receipt?.ok !== true) {
                throw new Error(receipt?.error || receipt?.status || "REMOTE_VIDEO_WORKER_RELEASE_FAILED");
            }
            if (receipt?.podId && String(receipt.podId) !== String(podId)) {
                throw new Error("REMOTE_VIDEO_WORKER_RELEASE_POD_ID_MISMATCH");
            }
            const receiptSeconds = Number(receipt.gpuRentalSeconds);
            const receiptEstimatedCost = Number(receipt.gpuRentalEstimatedCost);
            const effectiveSeconds = Number.isFinite(receiptSeconds) ? receiptSeconds : gpuRentalSeconds;
            const effectiveEstimatedCost = Number.isFinite(receiptEstimatedCost)
                ? receiptEstimatedCost
                : gpuRentalEstimatedCost;
            const actualCost = Number(receipt.gpuRentalActualCost || receipt.actualCostUsd || 0);
            const persisted = trySaveOperation(file, operation, {
                workerRelease: {
                    ok: true,
                    status: receipt.status || "REMOTE_VIDEO_WORKER_RELEASED",
                    reason,
                    releasedAt: endedAt.toISOString(),
                    receiptId: receipt.receiptId || null,
                    provider: receipt.provider || operation.remoteWorker?.provider || null,
                    podId,
                    terminationVerified: receipt.terminationVerified === true,
                    gpuRentalSeconds: effectiveSeconds,
                    gpuRentalEstimatedCost: effectiveEstimatedCost,
                    gpuRentalActualCost: actualCost,
                    networkVolumeId: receipt.networkVolumeId || operation.remoteWorker?.networkVolumeId || null,
                    networkVolumeRetained: receipt.networkVolumeRetained === true
                },
                gpuRentalSeconds: effectiveSeconds,
                gpuRentalEstimatedCost: effectiveEstimatedCost,
                gpuRentalActualCost: actualCost
            });
            return {
                ok: persisted.error === null,
                operation: persisted.operation,
                ...(persisted.error ? { error: persisted.error } : {})
            };
        }
        catch(error) {
            const releaseError = error?.message || "REMOTE_VIDEO_WORKER_RELEASE_FAILED";
            const persisted = trySaveOperation(file, operation, {
                workerRelease: {
                    ok: false,
                    status: "REMOTE_VIDEO_WORKER_RELEASE_FAILED",
                    error: releaseError,
                    reason,
                    releasedAt: null,
                    podId
                },
                gpuRentalSeconds,
                gpuRentalEstimatedCost,
                gpuRentalActualCost: 0
            });
            return {
                ok: false,
                operation: persisted.operation,
                error: persisted.error || releaseError
            };
        }
    }

    function operationFile(operationId) {
        if (!/^[a-f0-9-]{20,}$/i.test(String(operationId || ""))) {
            throw new Error("LOCAL_VIDEO_OPERATION_ID_INVALID");
        }
        return path.join(directories.operations, `${operationId}.json`);
    }

    function loadOperation(operationName) {
        const value = String(operationName || "");
        if (!value.startsWith("local-video/")) throw new Error("LOCAL_VIDEO_OPERATION_NAME_INVALID");
        const operationId = value.slice("local-video/".length);
        const file = operationFile(operationId);
        if (!fs.existsSync(file)) throw new Error("LOCAL_VIDEO_OPERATION_NOT_FOUND");
        return { file, operation: readJson(file) };
    }

    function saveOperation(file, operation, patch = {}) {
        const next = { ...operation, ...patch, updatedAt: now().toISOString() };
        atomicJsonWrite(file, next);
        return next;
    }

    function trySaveOperation(file, operation, patch = {}) {
        const next = { ...operation, ...patch, updatedAt: now().toISOString() };
        try {
            atomicJsonWrite(file, next);
            return { operation: next, error: null };
        }
        catch(error) {
            return {
                operation: next,
                error: error?.message || "LOCAL_VIDEO_EVIDENCE_CAPTURE_FAILED"
            };
        }
    }

    async function failOperationAndRelease(file, operation, patch, reason) {
        const persisted = trySaveOperation(file, operation, patch);
        const released = await releaseWorker(file, persisted.operation, reason);
        if (!persisted.error) return released;
        return {
            ...released,
            ok: false,
            operation: {
                ...released.operation,
                state: "FAILED",
                status: "LOCAL_VIDEO_EVIDENCE_CAPTURE_FAILED",
                error: persisted.error
            },
            error: persisted.error
        };
    }

    function isOperationStale(operation) {
        const createdAt = Date.parse(String(operation.createdAt || ""));
        if (!Number.isFinite(createdAt)) return true;
        const ageMs = Math.max(0, now().getTime() - createdAt);
        return ageMs > (localVideoTimeoutSeconds(env) + 60) * 1000;
    }

    function failStaleOperation(operation) {
        const child = children.get(operation.operationId);
        try { if (child?.kill) child.kill(); } catch {}
        children.delete(operation.operationId);
        return {
            ...operation,
            state: "FAILED",
            status: "LOCAL_VIDEO_OPERATION_STALE",
            error: "LOCAL_VIDEO_OPERATION_STALE",
            retryable: true
        };
    }

    function health() {
        const hardware = inspectHardware();
        const requested = requestedLocalModel(env);
        const requestedProfile = resolveLocalVideoModelProfile({ env, hardware });
        const profiles = requested === "auto"
            ? LOCAL_VIDEO_BACKEND_ORDER.map(backend => LOCAL_VIDEO_MODEL_PROFILES[backend])
            : (requestedProfile.unsupported === true ? [] : [requestedProfile]);
        const backends = profiles.map(profile => localBackendHealth({
            profile,
            hardware,
            policy,
            env
        }));
        const selected = backends.find(candidate => candidate.ok === true) || backends[0] || null;
        const status = requestedProfile.unsupported === true
            ? "LOCAL_VIDEO_BACKEND_UNSUPPORTED"
            : selected?.status || hardware.status || "LOCAL_VIDEO_WORKER_UNAVAILABLE";
        return {
            ...hardware,
            ok: backends.some(candidate => candidate.ok === true),
            status,
            version: JARVIS_LOCAL_VIDEO_ENGINE_VERSION,
            policy: policy.mode,
            enabled: policy.localVideoEnabled,
            certified: policy.localVideoCertified,
            runner: selected?.runner || null,
            runnerScript: selected?.runnerScript || null,
            modelDirectory: selected?.modelDirectory || null,
            selectedBackend: selected?.backend || null,
            model: selected || requestedProfile,
            backends
        };
    }

    function boundOperation(payload = {}) {
        const missionId = String(payload.missionId || "").trim().slice(0, 200);
        const objectiveId = String(payload.objectiveId || "").trim().slice(0, 200);
        const obligationId = String(payload.obligationId || "").trim().slice(0, 1000);
        if (!missionId || !objectiveId || !obligationId) return null;
        const files = fs.existsSync(directories.operations)
            ? fs.readdirSync(directories.operations).filter(file => file.endsWith(".json"))
            : [];
        for (const name of files) {
            try {
                const file = path.join(directories.operations, name);
                const operation = readJson(file);
                if (
                    operation.missionId === missionId &&
                    operation.objectiveId === objectiveId &&
                    operation.obligationId === obligationId
                ) {
                    return { file, operation };
                }
            }
            catch {}
        }
        return null;
    }

    async function start(payload = {}) {
        const runtimeCertificationOnly = booleanValue(
            env.JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY,
            false
        );
        const referenceOutputs = Array.isArray(payload.referenceOutputs) ? payload.referenceOutputs : [];
        const requiresIdentityFidelity =
            payload.requiresIdentityFidelity === true &&
            referenceOutputs.length > 0;
        if (requiresIdentityFidelity) {
            return {
                ok: false,
                blocked: true,
                status: "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED",
                error: "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED",
                requiresIdentityFidelity: true,
                referenceCount: referenceOutputs.length,
                retryable: false,
                externalApiUsed: false,
                externalEstimatedCostUsd: 0,
                gpuRentalSeconds: 0,
                gpuRentalEstimatedCost: 0,
                gpuRentalActualCost: 0
            };
        }
        const currentHealth = health();
        const shotPlan = (Array.isArray(payload.shotPlan) ? payload.shotPlan : [])
            .map((shot, index) => ({
                shotId: String(shot?.shotId || `shot-${index + 1}`).trim(),
                segmentId: String(shot?.segmentId || "").trim() || null,
                segmentTitle: String(shot?.segmentTitle || "").trim() || null,
                characterIds: [...new Set((Array.isArray(shot?.characterIds) ? shot.characterIds : [])
                    .map(value => String(value || "").trim())
                    .filter(Boolean))],
                identityReferenceOutputs: [...new Set((Array.isArray(shot?.identityReferenceOutputs)
                    ? shot.identityReferenceOutputs
                    : [])
                    .map(value => String(value || "").trim().replaceAll("\\", "/"))
                    .filter(Boolean))],
                identityMode: new Set(["unassigned", "single_identity", "multi_identity"]).has(
                    String(shot?.identityMode || "").trim()
                ) ? String(shot.identityMode).trim() : "unassigned",
                startSeconds: Number(shot?.startSeconds),
                durationSeconds: Number(shot?.durationSeconds),
                prompt: String(shot?.prompt || "").trim()
            }));
        const requestedDurationSeconds = Number(payload.durationSeconds || 0);
        const invalidShotPlan = shotPlan.length > 0 && (
            shotPlan.length > LOCAL_VIDEO_MAX_SHOT_COUNT ||
            !(requestedDurationSeconds > 0 && requestedDurationSeconds <= LOCAL_VIDEO_MAX_DURATION_SECONDS) ||
            shotPlan.some((shot, index) =>
                !shot.shotId || !shot.prompt ||
                (shot.identityMode === "single_identity" && shot.characterIds.length !== 1) ||
                (shot.identityMode === "multi_identity" && shot.characterIds.length < 2) ||
                (shot.identityMode === "unassigned" && shot.characterIds.length !== 0) ||
                shot.identityReferenceOutputs.some(output => !referenceOutputs.includes(output)) ||
                !(shot.durationSeconds > 0 && shot.durationSeconds <= 5) ||
                !Number.isFinite(shot.startSeconds) ||
                shot.startSeconds !== shotPlan.slice(0, index)
                    .reduce((sum, candidate) => sum + candidate.durationSeconds, 0)
            ) ||
            Math.abs(
                shotPlan.reduce((sum, shot) => sum + shot.durationSeconds, 0) -
                requestedDurationSeconds
            ) > 0.001
        );
        if (invalidShotPlan) {
            return {
                ok: false,
                status: "LOCAL_VIDEO_SHOT_PLAN_INVALID",
                error: "LOCAL_VIDEO_SHOT_PLAN_INVALID",
                retryable: false,
                externalApiUsed: false,
                externalEstimatedCostUsd: 0
            };
        }
        const requirements = {
            sceneCount: shotPlan.length || (Array.isArray(payload.prompts) ? payload.prompts.length : 0),
            referenceCount: referenceOutputs.length,
            requiresImageToVideo: referenceOutputs.length > 0,
            requiresIdentityFidelity,
            runtimeCertificationOnly,
            aspectRatio: payload.aspectRatio === "16:9" ? "16:9" : "9:16",
            seriesId: payload.seriesId || null,
            episodeId: payload.episodeId || null,
            selectedBackend: payload.selectedBackend || null
        };
        const decision = resolveVideoEngine({ policy, health: currentHealth, requirements });
        if (decision.ok !== true || decision.engineUsed !== "local") {
            return {
                ...decision,
                ok: false,
                status: decision.status || currentHealth.status,
                error: decision.error || decision.status || currentHealth.status
            };
        }
        const output = safeOutput(resolvedRoot, payload.output);
        const prompts = (Array.isArray(payload.prompts) ? payload.prompts : [])
            .map(value => String(value || "").trim())
            .filter(Boolean)
            .slice(0, shotPlan.length > 0 ? LOCAL_VIDEO_MAX_SHOT_COUNT : 4);
        const script = String(payload.script || prompts.join(" ")).trim();
        if (!runtimeCertificationOnly && (!script || prompts.length < 1)) {
            return { ok: false, status: "LOCAL_VIDEO_PROMPT_REQUIRED", error: "LOCAL_VIDEO_PROMPT_REQUIRED" };
        }
        let references;
        try {
            references = (Array.isArray(payload.referenceOutputs) ? payload.referenceOutputs : [])
                .map(value => safeReference(resolvedRoot, value));
        }
        catch(error) {
            return { ok: false, status: error.message, error: error.message };
        }
        let audioReference = null;
        if (payload.audioOutput) {
            try {
                audioReference = safeAudioReference(resolvedRoot, payload.audioOutput);
            }
            catch(error) {
                return {
                    ok: false,
                    status: error.message,
                    error: error.message,
                    retryable: false,
                    externalApiUsed: false,
                    externalEstimatedCostUsd: 0
                };
            }
        }
        const model = currentHealth.backends?.find(candidate =>
            candidate.backend === decision.selectedBackend
        ) || currentHealth.model || resolveLocalVideoModelProfile({ env, hardware: currentHealth });
        if (references.length > 0 && model.referenceAssets !== true) {
            return {
                ok: false,
                status: "LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND",
                error: "LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND",
                backend: model.backend,
                model: model.model,
                retryable: false,
                externalApiUsed: false,
                externalEstimatedCostUsd: 0
            };
        }
        const sourceReferences = [...references];
        if (references.length > Number(
            model.maximumSourceReferenceAssets ?? model.maximumReferenceAssets ?? 0
        )) {
            return {
                ok: false,
                status: "LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED",
                error: "LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED",
                backend: model.backend,
                model: model.model,
                referenceAssetCount: references.length,
                maximumReferenceAssets: Number(
                    model.maximumSourceReferenceAssets ?? model.maximumReferenceAssets ?? 0
                ),
                retryable: false,
                externalApiUsed: false,
                externalEstimatedCostUsd: 0
            };
        }
        async function launchDurableOperation(operationPath, initialOperation, job, { retrying = false } = {}) {
            let operation = initialOperation;
            if (retrying) {
                const previousAttempt = {
                    attempt: Number(operation.launchAttempt || 1),
                    state: operation.state,
                    status: operation.status,
                    error: operation.error || null,
                    failureStage: operation.failureStage || null,
                    providerCode: operation.providerCode || null,
                    providerMessage: operation.providerMessage || null,
                    providerHttp: operation.providerHttp || null,
                    retryable: operation.retryable === true,
                    endedAt: operation.updatedAt || null
                };
                operation = saveOperation(operationPath, operation, {
                    state: "RUNNING",
                    status: "LOCAL_VIDEO_RUNNER_START_RETRYING",
                    error: null,
                    retryable: null,
                    failureStage: null,
                    providerCode: null,
                    providerMessage: null,
                    providerHttp: null,
                    workerRelease: null,
                    launchAttempt: previousAttempt.attempt + 1,
                    attemptHistory: [
                        ...(Array.isArray(operation.attemptHistory) ? operation.attemptHistory : []),
                        previousAttempt
                    ]
                });
            }
            const runner = model.runner || commandPath(env.JARVIS_LOCAL_VIDEO_RUNNER, env);
            const runnerScript = model.runnerScript || path.resolve(env.JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT);
            const args = [runnerScript, "--job", operation.jobFile, "--result", operation.resultFile];
            const runnerEnvironment = offlineLocalVideoEnvironment(env);
            if (currentHealth.gpuIndex !== null && currentHealth.gpuIndex !== undefined) {
                runnerEnvironment.CUDA_VISIBLE_DEVICES = String(currentHealth.gpuIndex);
            }
            const onExit = exitCode => {
                try {
                    const current = readJson(operationPath);
                    if (["SUCCEEDED", "CANCELLED"].includes(current.state)) return;
                    const resultReady = fs.existsSync(operation.resultFile);
                    saveOperation(operationPath, current, {
                        state: resultReady ? "RESULT_READY" : "FAILED",
                        status: resultReady ? "LOCAL_VIDEO_RESULT_READY" : "LOCAL_VIDEO_RUNNER_EXITED_WITHOUT_RESULT",
                        exitCode: Number(exitCode),
                        retryable: !resultReady
                    });
                }
                catch {}
                children.delete(operation.operationId);
            };
            const onError = error => {
                try {
                    const current = readJson(operationPath);
                    saveOperation(operationPath, current, {
                        state: "FAILED",
                        status: "LOCAL_VIDEO_RUNNER_START_FAILED",
                        error: error?.message || "LOCAL_VIDEO_RUNNER_START_FAILED",
                        failureStage: error?.stage || null,
                        providerCode: error?.providerCode || null,
                        providerMessage: error?.providerMessage || null,
                        providerHttp: error?.providerHttp || null,
                        retryable: error?.retryable !== false
                    });
                }
                catch {}
                children.delete(operation.operationId);
            };
            try {
                const launched = launch
                    ? launch({
                        command: runner,
                        args,
                        cwd: resolvedRoot,
                        env: runnerEnvironment,
                        job,
                        jobFile: operation.jobFile,
                        resultFile: operation.resultFile,
                        onExit,
                        onError
                    })
                    : spawn(runner, args, {
                        cwd: resolvedRoot,
                        stdio: "ignore",
                        windowsHide: true,
                        env: runnerEnvironment
                    });
                const child = launched && typeof launched.then === "function"
                    ? await launched
                    : launched;
                if (!launch) {
                    child.once("exit", onExit);
                    child.once("error", onError);
                }
                children.set(operation.operationId, child);
                operation = {
                    ...operation,
                    pid: Number(child?.pid || 0) || null,
                    remoteWorker: child?.remoteWorker || null,
                    remoteJobId: child?.remoteWorker?.remoteJobId || null,
                    podId: child?.remoteWorker?.podId || null,
                    updatedAt: now().toISOString()
                };
                atomicJsonWrite(operationPath, operation);
                return { operation, ok: true };
            }
            catch(error) {
                const failedOperation = error?.remoteWorker ? {
                    ...operation,
                    remoteWorker: error.remoteWorker,
                    remoteJobId: error.remoteWorker.remoteJobId || null,
                    podId: error.remoteWorker.podId || null
                } : operation;
                const released = await failOperationAndRelease(operationPath, failedOperation, {
                    state: "FAILED",
                    status: "LOCAL_VIDEO_RUNNER_START_FAILED",
                    error: error?.message || "LOCAL_VIDEO_RUNNER_START_FAILED",
                    failureStage: error?.stage || null,
                    providerCode: error?.providerCode || null,
                    providerMessage: error?.providerMessage || null,
                    providerHttp: error?.providerHttp || null,
                    retryable: error?.retryable !== false
                },
                    "runner_start_failed"
                );
                return { operation: released.operation, ok: false };
            }
        }

        const existing = boundOperation(payload);
        if (existing) {
            const requestedOutput = String(payload.output || "").trim().replaceAll("\\", "/");
            if (requestedOutput && requestedOutput !== existing.operation.output) {
                return {
                    ...existing.operation,
                    ok: false,
                    done: true,
                    reusedOperation: true,
                    status: "LOCAL_VIDEO_OBLIGATION_OUTPUT_MUTATION_BLOCKED",
                    error: "LOCAL_VIDEO_OBLIGATION_OUTPUT_MUTATION_BLOCKED"
                };
            }
            const requestedRootInstructionHash = String(payload.rootInstructionHash || "").trim();
            if (
                requestedRootInstructionHash &&
                requestedRootInstructionHash !== existing.operation.rootInstructionHash
            ) {
                return {
                    ...existing.operation,
                    ok: false,
                    done: true,
                    reusedOperation: true,
                    status: "LOCAL_VIDEO_OBLIGATION_IDENTITY_MUTATION_BLOCKED",
                    error: "LOCAL_VIDEO_OBLIGATION_IDENTITY_MUTATION_BLOCKED"
                };
            }
            if (existing.operation.state === "SUCCEEDED") {
                return { ...existing.operation.result, ok: true, done: true, reusedOperation: true };
            }
            const retryStage = String(existing.operation.failureStage || "");
            const safePreProvisionRetry = ["availability", "duplicate_guard"].includes(retryStage) || (
                !retryStage && existing.operation.error === "RUNPOD_API_TRANSPORT_FAILED"
            );
            if (
                existing.operation.state === "FAILED" &&
                existing.operation.retryable === true &&
                safePreProvisionRetry &&
                !existing.operation.podId &&
                !existing.operation.remoteJobId &&
                !existing.operation.remoteWorker?.podId &&
                !fs.existsSync(existing.operation.resultFile)
            ) {
                let job;
                try { job = readJson(existing.operation.jobFile); }
                catch(error) {
                    return {
                        ...existing.operation,
                        ok: false,
                        done: true,
                        reusedOperation: true,
                        status: "LOCAL_VIDEO_RETRY_JOB_INVALID",
                        error: error?.message || "LOCAL_VIDEO_RETRY_JOB_INVALID"
                    };
                }
                const retried = await launchDurableOperation(
                    existing.file,
                    existing.operation,
                    job,
                    { retrying: true }
                );
                return {
                    ...retried.operation,
                    ok: retried.ok,
                    done: retried.ok !== true,
                    reusedOperation: true,
                    retryAttempted: true,
                    ...(retried.ok ? {} : { error: retried.operation.error || retried.operation.status })
                };
            }
            const terminal = ["FAILED", "CANCELLED"].includes(existing.operation.state);
            return {
                ...existing.operation,
                ok: !terminal,
                done: terminal,
                reusedOperation: true,
                ...(terminal ? { error: existing.operation.error || existing.operation.status } : {})
            };
        }
        let referencePreparation = null;
        if (!requiresIdentityFidelity && references.length > Number(model.maximumReferenceAssets || 0)) {
            try {
                const sheet = prepareReferenceSheet(
                    resolvedRoot,
                    references,
                    currentHealth.ffmpeg || resolveLocalExecutable(
                        env.JARVIS_FFMPEG_PATH || "ffmpeg",
                        env
                    )
                );
                references = [{ output: sheet.output, file: sheet.file }];
                referencePreparation = {
                    mode: "identity_reference_sheet",
                    sourceReferenceOutputs: sourceReferences.map(item => item.output),
                    preparedReferenceOutput: sheet.output,
                    sourceReferenceCount: sourceReferences.length,
                    preparedReferenceCount: 1,
                    sha256: sheet.artifact.sha256,
                    bytes: sheet.artifact.bytes
                };
            }
            catch(error) {
                return {
                    ok: false,
                    status: error?.message || "LOCAL_VIDEO_REFERENCE_PREPARATION_FAILED",
                    error: error?.message || "LOCAL_VIDEO_REFERENCE_PREPARATION_FAILED",
                    retryable: false,
                    externalApiUsed: false,
                    externalEstimatedCostUsd: 0
                };
            }
        }

        const operationId = randomUUID();
        const operationName = `local-video/${operationId}`;
        const operationPath = operationFile(operationId);
        const jobFile = path.join(directories.jobs, `${operationId}.json`);
        const resultFile = path.join(directories.results, `${operationId}.json`);
        fs.mkdirSync(directories.results, { recursive: true });
        const job = {
            schemaVersion: JARVIS_LOCAL_VIDEO_ENGINE_VERSION,
            operationId,
            operationName,
            engine: "local",
            provider: "local",
            backend: model.backend,
            model: model.model,
            modelDirectory: model.modelDirectory,
            script,
            prompts,
            shotPlan,
            requestedDurationSeconds: shotPlan.length > 0 ? requestedDurationSeconds : null,
            aspectRatio: payload.aspectRatio === "16:9" ? "16:9" : "9:16",
            output: output.normalized,
            outputFile: output.resolved,
            referenceOutputs: references.map(item => item.output),
            referenceFiles: references.map(item => item.file),
            sourceReferenceOutputs: sourceReferences.map(item => item.output),
            sourceReferenceFiles: sourceReferences.map(item => item.file),
            audioOutput: audioReference?.output || null,
            audioFile: audioReference?.file || null,
            referencePreparation,
            requiresIdentityFidelity,
            identityRuntimeAuthority: requiresIdentityFidelity ? {
                ...RUNPOD_HUMO_IDENTITY_CANDIDATE,
                sharedTextEncoderFiles: RUNPOD_WAN22_CACHE_BASE.requiredFiles.filter(item =>
                    item.path === "models_t5_umt5-xxl-enc-bf16.pth" ||
                    item.path.startsWith("google/umt5-xxl/")
                )
            } : null,
            executionTarget: String(env.JARVIS_LOCAL_VIDEO_EXECUTION_TARGET || "local")
                .trim().toLowerCase() === "remote" ? "remote" : "local",
            runtimeCertificationOnly: booleanValue(
                env.JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY,
                false
            ),
            missionId: String(payload.missionId || "").trim().slice(0, 200) || null,
            objectiveId: String(payload.objectiveId || "").trim().slice(0, 200) || null,
            obligationId: String(payload.obligationId || "").trim().slice(0, 1000) || null,
            rootInstructionHash: String(payload.rootInstructionHash || "").trim().slice(0, 128) || null,
            externalApiAllowed: false,
            externalBudgetUsd: 0,
            createdAt: now().toISOString()
        };
        atomicJsonWrite(jobFile, job);
        let operation = {
            schemaVersion: JARVIS_LOCAL_VIDEO_ENGINE_VERSION,
            operationId,
            operationName,
            state: "RUNNING",
            status: "LOCAL_VIDEO_GENERATION_STARTED",
            jobFile,
            resultFile,
            output: output.normalized,
            aspectRatio: job.aspectRatio,
            shotCount: job.shotPlan.length,
            requestedDurationSeconds: job.requestedDurationSeconds,
            audioOutput: job.audioOutput,
            referenceAssetCount: references.length,
            sourceReferenceAssetCount: sourceReferences.length,
            referencePreparation,
            requiresIdentityFidelity: job.requiresIdentityFidelity === true,
            identityRuntimeAuthority: job.identityRuntimeAuthority || null,
            createdAt: now().toISOString(),
            updatedAt: now().toISOString(),
            engine: "local",
            provider: "local",
            backend: model.backend,
            model: model.model,
            executionTarget: job.executionTarget,
            runtimeCertificationOnly: job.runtimeCertificationOnly === true,
            missionId: job.missionId,
            objectiveId: job.objectiveId,
            obligationId: job.obligationId,
            rootInstructionHash: job.rootInstructionHash,
            externalApiUsed: false,
            externalEstimatedCostUsd: 0,
            launchAttempt: 1,
            attemptHistory: []
        };
        atomicJsonWrite(operationPath, operation);
        const launched = await launchDurableOperation(operationPath, operation, job);
        return {
            ...launched.operation,
            ok: launched.ok,
            done: launched.ok !== true
        };
    }

    async function poll({ operationName } = {}) {
        let loaded;
        try { loaded = loadOperation(operationName); }
        catch(error) { return { ok: false, status: error.message, error: error.message }; }
        let { operation } = loaded;
        if (operation.state === "SUCCEEDED") return { ...operation.result, ok: true, done: true };
        if (["FAILED", "CANCELLED"].includes(operation.state) && !fs.existsSync(operation.resultFile)) {
            const released = await releaseWorker(
                loaded.file,
                operation,
                operation.state.toLowerCase()
            );
            operation = released.operation;
            return { ...operation, ok: false, done: true, error: operation.error || operation.status };
        }
        if (
            operation.executionTarget === "remote" &&
            !fs.existsSync(operation.resultFile) &&
            typeof pollRemote === "function"
        ) {
            try {
                const remote = await pollRemote({
                    operation,
                    job: readJson(operation.jobFile),
                    jobFile: operation.jobFile,
                    resultFile: operation.resultFile
                });
                const persisted = trySaveOperation(loaded.file, operation, {
                    remoteWorker: remote?.remoteWorker || operation.remoteWorker || null,
                    remoteJobId: remote?.remoteJobId || remote?.remoteWorker?.remoteJobId || operation.remoteJobId || null,
                    remotePoll: {
                        status: remote?.status || null,
                        retryable: remote?.retryable === true,
                        checkedAt: now().toISOString()
                    }
                });
                operation = persisted.operation;
                if (persisted.error) {
                    const released = await failOperationAndRelease(loaded.file, operation, {
                        state: "FAILED",
                        status: "LOCAL_VIDEO_EVIDENCE_CAPTURE_FAILED",
                        error: persisted.error,
                        retryable: false
                    }, "evidence_capture_failed");
                    return { ...released.operation, ok: false, done: true };
                }
            }
            catch(error) {
                const persisted = trySaveOperation(loaded.file, operation, {
                    remotePoll: {
                        status: "REMOTE_VIDEO_POLL_TRANSPORT_FAILED",
                        error: error?.message || "REMOTE_VIDEO_POLL_TRANSPORT_FAILED",
                        retryable: true,
                        checkedAt: now().toISOString()
                    }
                });
                operation = persisted.operation;
                if (persisted.error) {
                    const released = await failOperationAndRelease(loaded.file, operation, {
                        state: "FAILED",
                        status: "LOCAL_VIDEO_EVIDENCE_CAPTURE_FAILED",
                        error: persisted.error,
                        retryable: false
                    }, "evidence_capture_failed");
                    return { ...released.operation, ok: false, done: true };
                }
            }
        }
        if (!fs.existsSync(operation.resultFile)) {
            if (operation.state === "RUNNING" && isOperationStale(operation)) {
                operation = failStaleOperation(operation);
                const released = await failOperationAndRelease(
                    loaded.file,
                    operation,
                    {},
                    "operation_stale"
                );
                operation = released.operation;
                return { ...operation, ok: false, done: true };
            }
            return { ...operation, ok: true, done: false };
        }
        let result;
        try { result = readJson(operation.resultFile); }
        catch(error) {
            const released = await failOperationAndRelease(loaded.file, operation, {
                state: "FAILED",
                status: "LOCAL_VIDEO_RESULT_INVALID",
                error: error.message
            },
                "result_invalid"
            );
            operation = released.operation;
            return { ...operation, ok: false, done: true };
        }
        if (result?.ok !== true) {
            const released = await failOperationAndRelease(loaded.file, operation, {
                state: "FAILED",
                status: result?.status || "LOCAL_VIDEO_GENERATION_FAILED",
                error: result?.error || result?.status || "LOCAL_VIDEO_GENERATION_FAILED",
                retryable: result?.retryable === true
            },
                "generation_failed"
            );
            operation = released.operation;
            return { ...operation, ok: false, done: true };
        }
        if ([
            "RUNPOD_RUNTIME_PREFLIGHT_CERTIFIED",
            "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED"
        ].includes(result.status)) {
            const humoRuntimeCertification =
                result.status === "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED";
            const mountedCacheCertification = Boolean(operation.remoteWorker?.networkVolumeId);
            const cacheReceiptMatches = mountedCacheCertification
                ? ["CACHE_READY", "CACHE_HIT"].includes(String(result.cacheStatus || ""))
                : result.cacheStatus === "CACHE_MISS";
            const receiptMatches =
                operation.runtimeCertificationOnly === true &&
                result.runtimeCertificationOnly === true &&
                result.runtimePreflightVerified === true &&
                (!humoRuntimeCertification || result.physicalRuntimeCertified === true) &&
                result.inferenceStarted === false &&
                cacheReceiptMatches &&
                String(result.operationId || "") === String(operation.operationId || "") &&
                String(result.operationName || "") === String(operation.operationName || "") &&
                String(result.backend || "") === String(operation.backend || "") &&
                String(result.model || "") === String(operation.model || "") &&
                result.externalApiUsed === false &&
                Number(result.externalEstimatedCostUsd || 0) === 0;
            if (!receiptMatches) {
                const released = await failOperationAndRelease(loaded.file, operation, {
                    state: "FAILED",
                    status: "RUNPOD_RUNTIME_CERTIFICATION_RECEIPT_INVALID",
                    error: "RUNPOD_RUNTIME_CERTIFICATION_RECEIPT_INVALID"
                }, "runtime_certification_receipt_invalid");
                return { ...released.operation, ok: false, done: true };
            }
            const released = await releaseWorker(
                loaded.file,
                operation,
                "runtime_certification_succeeded"
            );
            if (released.ok !== true) {
                const persisted = trySaveOperation(loaded.file, released.operation, {
                    state: "FAILED",
                    status: released.operation?.workerRelease?.terminationVerified === true
                        ? "LOCAL_VIDEO_EVIDENCE_CAPTURE_FAILED"
                        : "REMOTE_VIDEO_WORKER_RELEASE_FAILED",
                    error: released.error
                });
                return { ...persisted.operation, ok: false, done: true };
            }
            operation = released.operation;
            const finalCertified = {
                ...result,
                done: true,
                workerRelease: operation.workerRelease || null,
                gpuRentalSeconds: Number(operation.gpuRentalSeconds || 0),
                gpuRentalEstimatedCost: Number(operation.gpuRentalEstimatedCost || 0),
                gpuRentalActualCost: Number(operation.gpuRentalActualCost || 0),
                gpuProvider: operation.remoteWorker?.provider || null,
                podId: operation.remoteWorker?.podId || null,
                remoteJobId: operation.remoteJobId || null
            };
            operation = saveOperation(loaded.file, operation, {
                state: "SUCCEEDED",
                status: finalCertified.status,
                result: finalCertified
            });
            return finalCertified;
        }
        try {
            verifyResultReceipt(operation, result);
            const output = safeOutput(resolvedRoot, result.output);
            const stat = fs.statSync(output.resolved);
            if (!stat.isFile() || stat.size < 100000) throw new Error("LOCAL_VIDEO_PHYSICAL_OUTPUT_INVALID");
            if (!verifyMp4Container(output.resolved)) throw new Error("LOCAL_VIDEO_MP4_CONTAINER_INVALID");
            const currentHealth = health();
            const localFfprobe = resolveLocalVideoInspectionExecutable(currentHealth, env);
            if (!inspectVideo && !localFfprobe) {
                throw new Error("LOCAL_VIDEO_FFPROBE_REQUIRED");
            }
            const media = inspectVideo
                ? inspectVideo(output.resolved)
                : defaultVideoInspection(output.resolved, localFfprobe);
            if (
                !(Number(media.durationSeconds) > 0) ||
                !(Number(media.fps) > 0) ||
                !(Number(media.width) > 0) ||
                !(Number(media.height) > 0)
            ) {
                throw new Error("LOCAL_VIDEO_MEDIA_METADATA_INVALID");
            }
            verifyMediaAgainstOperation(operation, media);
            const sha256 = createHash("sha256").update(fs.readFileSync(output.resolved)).digest("hex");
            if (operation.executionTarget === "remote") {
                if (!/^[a-f0-9]{64}$/i.test(String(result.sha256 || ""))) {
                    throw new Error("REMOTE_VIDEO_RESULT_SHA256_REQUIRED");
                }
                if (String(result.sha256).toLowerCase() !== sha256) {
                    throw new Error("REMOTE_VIDEO_RESULT_SHA256_MISMATCH");
                }
                if (Number(result.bytes || 0) !== stat.size) {
                    throw new Error("REMOTE_VIDEO_RESULT_BYTES_MISMATCH");
                }
            }
            const model = operation.model;
            const backend = operation.backend;
            const verifiedPhysical = {
                ok: true,
                done: true,
                status: "VIDEO_GENERATED_VERIFIED",
                operationId: operation.operationId,
                operationName: operation.operationName,
                output: output.normalized,
                mimeType: "video/mp4",
                bytes: stat.size,
                sha256,
                durationSeconds: Number(media.durationSeconds),
                fps: Number(media.fps),
                width: Number(media.width),
                height: Number(media.height),
                backend,
                model,
                engine: "local",
                provider: "local",
                physicallyWritten: true,
                physicalArtifactVerified: true,
                verifiedArtifactDelivery: true,
                shotCount: Number(result.shotCount || operation.shotCount || 1),
                masteringMode: result.masteringMode || "single_wan_shot",
                audioIncluded: result.audioIncluded === true,
                audioMixMode: result.audioMixMode || "none",
                externalApiUsed: false,
                externalEstimatedCostUsd: 0,
                gpuRentalSeconds: Number(operation.gpuRentalSeconds || 0),
                gpuRentalEstimatedCost: Number(operation.gpuRentalEstimatedCost || 0),
                gpuRentalActualCost: Number(operation.gpuRentalActualCost || 0)
            };
            const released = await releaseWorker(
                loaded.file,
                operation,
                "generation_succeeded"
            );
            if (released.ok !== true) {
                const persisted = trySaveOperation(loaded.file, released.operation, {
                    state: "FAILED",
                    status: released.operation?.workerRelease?.terminationVerified === true
                        ? "LOCAL_VIDEO_EVIDENCE_CAPTURE_FAILED"
                        : "REMOTE_VIDEO_WORKER_RELEASE_FAILED",
                    error: released.error
                });
                operation = persisted.operation;
                return { ...operation, ok: false, done: true };
            }
            operation = released.operation;
            const artifact = registerArtifact({
                root: resolvedRoot,
                output: output.normalized,
                metadata: {
                    type: "video",
                    origin: "video.generate",
                    provider: "local",
                    gpuProvider: operation.remoteWorker?.provider || null,
                    podId: operation.remoteWorker?.podId || null,
                    remoteJobId: operation.remoteJobId || null,
                    backend,
                    model,
                    mimeType: "video/mp4",
                    status: "VIDEO_GENERATED_VERIFIED",
                    approvalRequired: false,
                    approved: true,
                    approvedBy: "LOCAL_ARTIFACT_POLICY",
                    editable: true,
                    preview: true,
                    downloadable: true,
                    publishable: false
                }
            });
            const finalVerified = {
                ...verifiedPhysical,
                workerRelease: operation.workerRelease || null,
                gpuRentalSeconds: Number(operation.gpuRentalSeconds || 0),
                gpuRentalEstimatedCost: Number(operation.gpuRentalEstimatedCost || 0),
                gpuRentalActualCost: Number(operation.gpuRentalActualCost || 0),
                gpuProvider: operation.remoteWorker?.provider || null,
                podId: operation.remoteWorker?.podId || null,
                remoteJobId: operation.remoteJobId || null,
                artifactId: artifact.artifactId,
                artifact
            };
            operation = saveOperation(loaded.file, operation, {
                state: "SUCCEEDED",
                status: finalVerified.status,
                result: finalVerified
            });
            return finalVerified;
        }
        catch(error) {
            const released = await failOperationAndRelease(loaded.file, operation, {
                state: "FAILED",
                status: error.message || "LOCAL_VIDEO_PHYSICAL_VERIFICATION_FAILED",
                error: error.message || "LOCAL_VIDEO_PHYSICAL_VERIFICATION_FAILED"
            },
                "physical_verification_failed"
            );
            operation = released.operation;
            return { ...operation, ok: false, done: true };
        }
    }

    async function cancel({ operationName } = {}) {
        let loaded;
        try { loaded = loadOperation(operationName); }
        catch(error) { return { ok: false, status: error.message, error: error.message }; }
        const child = children.get(loaded.operation.operationId);
        try {
            if (child?.kill) child.kill();
            else if (loaded.operation.state === "RUNNING" && Number(loaded.operation.pid) > 0) {
                process.kill(Number(loaded.operation.pid));
            }
        }
        catch {}
        children.delete(loaded.operation.operationId);
        const released = await failOperationAndRelease(loaded.file, loaded.operation, {
            state: "CANCELLED",
            status: "LOCAL_VIDEO_GENERATION_CANCELLED"
        },
            "cancelled"
        );
        return {
            ...released.operation,
            ok: released.ok === true,
            done: true,
            ...(released.ok === true ? {} : { error: released.error })
        };
    }

    async function cleanup({ operationName } = {}) {
        let loaded;
        try { loaded = loadOperation(operationName); }
        catch(error) { return { ok: false, status: error.message, error: error.message }; }
        if (loaded.operation.state === "RUNNING") {
            return { ok: false, status: "LOCAL_VIDEO_OPERATION_STILL_RUNNING", error: "LOCAL_VIDEO_OPERATION_STILL_RUNNING" };
        }
        for (const file of [loaded.operation.jobFile, loaded.operation.resultFile]) {
            try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
        }
        const operation = saveOperation(loaded.file, loaded.operation, {
            cleaned: true,
            status: "LOCAL_VIDEO_OPERATION_CLEANED"
        });
        return { ...operation, ok: true, done: true };
    }

    function authorizeExternalCall({
        operationKey = "video.generate",
        segmentCount,
        model = EXTERNAL_VIDEO_PRICING_PROFILE.model,
        resolution = EXTERNAL_VIDEO_PRICING_PROFILE.resolution,
        audioIncluded = EXTERNAL_VIDEO_PRICING_PROFILE.audioIncluded
    } = {}) {
        if (policy.mode === "LOCAL_TEST" || policy.mode === "LOCAL_ONLY") {
            return {
                ok: false,
                status: "EXTERNAL_VIDEO_CALL_FORBIDDEN_BY_POLICY",
                error: "EXTERNAL_VIDEO_CALL_FORBIDDEN_BY_POLICY",
                externalApiUsed: false,
                externalEstimatedCostUsd: 0
            };
        }
        const estimate = estimateExternalVideoGeneration({
            segmentCount,
            model,
            resolution,
            audioIncluded
        });
        if (estimate.ok !== true) return estimate;
        const cost = estimate.externalEstimatedCostUsd;
        if (policy.externalBudgetConfigured !== true) {
            return {
                ...estimate,
                ok: false,
                status: "EXTERNAL_VIDEO_BUDGET_NOT_CONFIGURED",
                error: "EXTERNAL_VIDEO_BUDGET_NOT_CONFIGURED",
                externalApiUsed: false,
                budgets: {
                    perOperationUsd: policy.externalBudgetUsdPerOperation,
                    perEpisodeUsd: policy.externalBudgetUsdPerEpisode,
                    perDayUsd: policy.externalBudgetUsdPerDay
                }
            };
        }
        const date = now().toISOString().slice(0, 10);
        const safeKey = createHash("sha256").update(String(operationKey)).digest("hex").slice(0, 24);
        const file = path.join(directories.budgets, `${date}.json`);
        const daily = fs.existsSync(file) ? readJson(file) : { date, calls: 0, costUsd: 0, operations: {} };
        const current = daily.operations[safeKey] || { calls: 0, costUsd: 0 };
        const nextOperationCost = Number(current.costUsd || 0) + cost;
        const nextDailyCost = Number(daily.costUsd || 0) + cost;
        if (
            nextOperationCost > policy.externalBudgetUsdPerOperation ||
            nextOperationCost > policy.externalBudgetUsdPerEpisode ||
            nextDailyCost > policy.externalBudgetUsdPerDay
        ) {
            return {
                ...estimate,
                ok: false,
                status: "EXTERNAL_VIDEO_BUDGET_EXCEEDED",
                error: "EXTERNAL_VIDEO_BUDGET_EXCEEDED",
                externalApiUsed: false,
                budgets: {
                    perOperationUsd: policy.externalBudgetUsdPerOperation,
                    perEpisodeUsd: policy.externalBudgetUsdPerEpisode,
                    perDayUsd: policy.externalBudgetUsdPerDay
                },
                projectedOperationCostUsd: nextOperationCost,
                projectedDailyCostUsd: nextDailyCost
            };
        }
        daily.calls += 1;
        daily.costUsd = nextDailyCost;
        daily.operations[safeKey] = { calls: current.calls + 1, costUsd: nextOperationCost };
        atomicJsonWrite(file, daily);
        return {
            ...estimate,
            ok: true,
            status: "EXTERNAL_VIDEO_OBLIGATION_AUTHORIZED",
            reasonForExternalUse: policy.mode === "CURRENT_STABLE"
                ? "CURRENT_STABLE"
                : "LOCAL_FALLBACK",
            externalApiUsed: true,
            dailyCostUsd: nextDailyCost,
            operationCostUsd: nextOperationCost
        };
    }

    return {
        version: JARVIS_LOCAL_VIDEO_ENGINE_VERSION,
        policy,
        health,
        resolve: requirements => resolveVideoEngine({ policy, health: health(), requirements }),
        authorizeExternalCall,
        start,
        poll,
        cancel,
        cleanup
    };
}
