import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile, execFileSync, spawn } from "node:child_process";

import { registerArtifact } from "./jarvis-artifact-studio.js";

export const JARVIS_LOCAL_VIDEO_ENGINE_VERSION = "1.8.0-v142-runpod-durable-cache";
export const JARVIS_RUNPOD_ADAPTER_VERSION = "1.1.0-v142-runpod-network-volume-cache";
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
    [WAN21_T2V_1_3B.backend]: WAN21_T2V_1_3B
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
    "local-light": WAN21_T2V_1_3B.backend
});

const RUNPOD_WAN22_CACHE_CONTRACT = Object.freeze({
    profile: "wan22-ti2v-5b-a40-v1",
    modelRepository: "Wan-AI/Wan2.2-TI2V-5B",
    modelRevision: "921dbaf3f1674a56f47e83fb80a34bac8a8f203e",
    wanRepositoryRevision: "42bf4cfaa384bc21833865abc2f9e6c0e67233dc",
    expectedModelBytes: 34203123497,
    minimumNetworkVolumeGb: 50,
    requiredFiles: Object.freeze([
        Object.freeze({ path: "Wan2.2_VAE.pth", bytes: 2818839170, sha256: "20eb789667fa5e60e7516bf509512f6cb61f01b0aa0695eadaea930c13892b36" }),
        Object.freeze({ path: "diffusion_pytorch_model-00001-of-00003.safetensors", bytes: 9825014472, sha256: "720b06c4ade5e87c1246bba8ac95b664c638749cd9b102cf84d823bb44c026a1" }),
        Object.freeze({ path: "diffusion_pytorch_model-00002-of-00003.safetensors", bytes: 9995661736, sha256: "09ec5ef720d8396f6cfa51fbdcbdb2327e37722afd6e89fd38f1e7e5e782c283" }),
        Object.freeze({ path: "diffusion_pytorch_model-00003-of-00003.safetensors", bytes: 178558176, sha256: "6306f7894c345de9093ad588771c2abfaeb668a81f7a6d9a918bd26ba3568e49" }),
        Object.freeze({ path: "models_t5_umt5-xxl-enc-bf16.pth", bytes: 11361920418, sha256: "7cace0da2b446bbbbc57d031ab6cf163a3d59b366da94e5afe36745b746fd81d" })
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
        const byBackend = new Map(
            health.backends
                .filter(item => item && typeof item === "object")
                .map(item => [String(item.backend || ""), item])
        );
        return LOCAL_VIDEO_BACKEND_ORDER
            .map(backend => byBackend.get(backend))
            .filter(Boolean);
    }
    const model = health?.model || health?.modelRequirements || null;
    const backend = health?.selectedBackend || model?.backend || null;
    return backend
        ? [{
            ...health,
            backend,
            model: model?.model || health?.model || null,
            imageToVideo: model?.imageToVideo === true,
            maximumReferenceAssets: Number(model?.maximumReferenceAssets || 0)
        }]
        : [];
}

function backendRequirementFailure(backend = {}, requirements = {}) {
    const referenceCount = Math.max(0, Number(requirements.referenceCount || 0));
    const requiresImageToVideo = requirements.requiresImageToVideo === true || referenceCount > 0;
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
    const unavailableReason = backendFailureReason(attempts, legacyReason || "LOCAL_VIDEO_WORKER_UNAVAILABLE");
    const base = {
        policy: mode,
        engineRequested: mode,
        referenceCount,
        requiresImageToVideo,
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
        : (remoteExecution ? "/workspace/models/Wan2.2-TI2V-5B" : null);
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
        repositoryDirectory && fs.existsSync(path.join(repositoryDirectory, "generate.py"))
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
    if (remoteExecution && hardware.ok !== true) {
        blockingReasons.push(hardware.status || "REMOTE_VIDEO_PROVIDER_UNAVAILABLE");
    }
    if (hardware.cudaAvailable !== true) blockingReasons.push("LOCAL_VIDEO_CUDA_UNAVAILABLE");
    if (Number(hardware.vramGb || 0) < profile.minimumVramGb) blockingReasons.push("LOCAL_VIDEO_VRAM_INSUFFICIENT");
    if (Number(hardware.freeDiskGb || 0) < profile.minimumFreeDiskGb) blockingReasons.push("LOCAL_VIDEO_DISK_INSUFFICIENT");
    if (hardware.ffmpegAvailable !== true || hardware.ffprobeAvailable !== true) {
        blockingReasons.push("LOCAL_VIDEO_FFMPEG_UNAVAILABLE");
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
            physicalMp4Authorized: localVideoSupported,
            installationAuthorized: false,
            reason: selectedVideoModel.unsupported === true
                ? "LOCAL_VIDEO_BACKEND_UNSUPPORTED"
                : localVideoSupported
                    ? "HARDWARE_GATE_PASSED_MODEL_AND_RUNNER_STILL_REQUIRE_EXPLICIT_INSTALLATION"
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
        networkVolumePersistent: Boolean(state.networkVolumeId),
        cacheStatus: state.cacheStatus || null,
        cacheProfile: state.cacheProfile || null,
        bootstrapProgress: state.bootstrapProgress || null,
        bootstrapStartedAt: state.bootstrapStartedAt || null,
        inferenceStartedAt: state.inferenceStartedAt || null,
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

/**
 * Physical RunPod infrastructure adapter behind the existing V142 video engine.
 * It uses RunPod only for Pod lifecycle and an ephemeral SSH key for byte transfer.
 * The API credential never leaves this server-side closure.
 */
export function createRunpodRemoteVideoAdapter({
    root = process.cwd(),
    env = process.env,
    fetchImpl = globalThis.fetch,
    execute = runProcess,
    generateKeyPair = null,
    now = () => new Date()
} = {}) {
    const resolvedRoot = path.resolve(root);
    const apiBase = String(env.JARVIS_RUNPOD_API_BASE || "https://rest.runpod.io/v1").replace(/\/$/, "");
    const graphQlBase = String(env.JARVIS_RUNPOD_GRAPHQL_URL || "https://api.runpod.io/graphql");
    const apiKey = typeof env.RUNPOD_API_KEY === "string" ? env.RUNPOD_API_KEY : "";
    const provider = String(env.JARVIS_REMOTE_GPU_PROVIDER || "").trim().toLowerCase();
    const gpuTypeId = String(env.JARVIS_RUNPOD_GPU_TYPE_ID || "NVIDIA A40").trim();
    const imageName = String(
        env.JARVIS_RUNPOD_IMAGE || "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404"
    ).trim();
    const cloudType = String(env.JARVIS_RUNPOD_CLOUD_TYPE || "COMMUNITY").trim().toUpperCase() === "SECURE"
        ? "SECURE"
        : "COMMUNITY";
    const hardBudgetUsd = Math.min(
        2,
        runpodPositiveNumber(env.JARVIS_REMOTE_GPU_HARD_BUDGET_USD, 2)
    );
    const budgetStopRatio = Math.min(
        0.99,
        Math.max(0.8, runpodPositiveNumber(env.JARVIS_REMOTE_GPU_BUDGET_STOP_RATIO, 0.95))
    );
    const containerDiskInGb = Math.ceil(runpodPositiveNumber(env.JARVIS_RUNPOD_CONTAINER_DISK_GB, 30));
    const volumeInGb = Math.ceil(runpodPositiveNumber(env.JARVIS_RUNPOD_VOLUME_DISK_GB, 100));
    const networkVolumeId = String(env.JARVIS_RUNPOD_NETWORK_VOLUME_ID || "").trim();
    const bootstrapTimeoutSeconds = runpodPositiveNumber(env.JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS, 1800);
    const inferenceTimeoutSeconds = runpodPositiveNumber(
        env.JARVIS_RUNPOD_INFERENCE_TIMEOUT_SECONDS,
        localVideoTimeoutSeconds(env)
    );
    const minimumRamGb = Math.ceil(runpodPositiveNumber(env.JARVIS_RUNPOD_MIN_RAM_GB, 50));
    const minimumVcpu = Math.ceil(runpodPositiveNumber(env.JARVIS_RUNPOD_MIN_VCPU, 9));
    const expectedVramGb = runpodPositiveNumber(env.JARVIS_RUNPOD_EXPECTED_VRAM_GB, 48);
    const configuredTotalHourlyRateUsd = runpodPositiveNumber(
        env.JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD,
        0.46
    );
    const remoteBase = "/workspace/jarvis-v142";
    const stateRoot = path.join(resolvedRoot, ".jarvis-artifacts", ".video-worker", "runpod");
    const ssh = resolveLocalExecutable(env.JARVIS_SSH_PATH || "ssh", env);
    const scp = resolveLocalExecutable(env.JARVIS_SCP_PATH || "scp", env);
    const sshKeygen = resolveLocalExecutable(env.JARVIS_SSH_KEYGEN_PATH || "ssh-keygen", env);

    function assertConfigured() {
        if (provider !== "runpod") throw new Error("RUNPOD_PROVIDER_NOT_ENABLED");
        if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
        if (typeof fetchImpl !== "function") throw new Error("RUNPOD_FETCH_UNAVAILABLE");
        if (!ssh || !scp || !sshKeygen) throw new Error("RUNPOD_SSH_TOOLCHAIN_UNAVAILABLE");
        if (gpuTypeId !== "NVIDIA A40") throw new Error("RUNPOD_GPU_TYPE_NOT_APPROVED_FOR_V142");
        if (networkVolumeId && cloudType !== "SECURE") {
            throw new Error("RUNPOD_NETWORK_VOLUME_SECURE_CLOUD_REQUIRED");
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

    async function apiRequest(url, options = {}, accepted = [200], stage = "runpod_api") {
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
        if (!accepted.includes(Number(response.status))) {
            const failure = new Error(`RUNPOD_API_HTTP_${Number(response.status || 0)}`);
            failure.retryable = Number(response.status) >= 500 || Number(response.status) === 429;
            failure.httpStatus = Number(response.status || 0);
            failure.stage = stage;
            throw failure;
        }
        if (Number(response.status) === 204) return null;
        const text = await response.text();
        if (!text) return null;
        try { return JSON.parse(text); }
        catch { throw new Error("RUNPOD_API_RESPONSE_INVALID"); }
    }

    async function queryAvailability(dataCenterId = null) {
        const secureCloud = cloudType === "SECURE" ? "true" : "false";
        const dataCenterSelection = dataCenterId
            ? ` dataCenters { id gpuAvailability(input: { gpuCount: 1, secureCloud: true }) { gpuTypeId stockStatus available } }`
            : "";
        const query = `query { myself { id } gpuTypes(input: { id: \"NVIDIA A40\" }) { id displayName memoryInGb lowestPrice(input: { gpuCount: 1, secureCloud: ${secureCloud} }) { stockStatus uninterruptablePrice availableGpuCounts } }${dataCenterSelection} }`;
        const separator = graphQlBase.includes("?") ? "&" : "?";
        const payload = await apiRequest(
            `${graphQlBase}${separator}api_key=${encodeURIComponent(apiKey)}`,
            { method: "POST", body: JSON.stringify({ query }) },
            [200],
            "availability"
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
        const documentedAvailableStock = new Set(["High", "Medium", "Low"]);
        const availableGpuCounts = price.availableGpuCounts;
        const requestedCountAvailable = availableGpuCounts == null
            ? true
            : Array.isArray(availableGpuCounts) && availableGpuCounts.map(Number).includes(1);
        if (
            gpu?.id !== gpuTypeId ||
            Number(gpu?.memoryInGb || 0) < 24 ||
            !documentedAvailableStock.has(stockStatus) ||
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
            if (!dataCenter || candidate?.available !== true || !documentedAvailableStock.has(String(candidate.stockStatus || ""))) {
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

    async function resolveNetworkVolume() {
        if (!networkVolumeId) return null;
        const volume = await apiRequest(
            `${apiBase}/networkvolumes/${encodeURIComponent(networkVolumeId)}`,
            { method: "GET" },
            [200],
            "network_volume"
        );
        const id = String(volume?.id || "").trim();
        const dataCenterId = String(volume?.dataCenterId || volume?.dataCenter?.id || "").trim();
        const sizeGb = Number(volume?.size || volume?.sizeInGb || volume?.sizeGb || 0);
        if (id !== networkVolumeId || !dataCenterId || !Number.isFinite(sizeGb)) {
            throw new Error("RUNPOD_NETWORK_VOLUME_RESPONSE_INVALID");
        }
        if (sizeGb < RUNPOD_WAN22_CACHE_CONTRACT.minimumNetworkVolumeGb) {
            throw new Error("RUNPOD_NETWORK_VOLUME_CAPACITY_INSUFFICIENT");
        }
        return { id, dataCenterId, sizeGb };
    }

    async function assertNoExistingOperationPod(job) {
        const payload = await apiRequest(
            `${apiBase}/pods`,
            { method: "GET" },
            [200],
            "duplicate_guard"
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
                    "orphan_cleanup"
                );
                let remaining = null;
                try {
                    remaining = await apiRequest(
                        `${apiBase}/pods/${encodeURIComponent(podId)}`,
                        { method: "GET" },
                        [200],
                        "orphan_cleanup_verify"
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
            }))
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

    function writeBootstrapFile(bootstrapFile) {
        const cacheRoot = `${remoteBase}/cache/wan22-ti2v-5b`;
        const remoteVenv = `${cacheRoot}/venv`;
        const remoteRepository = `${cacheRoot}/Wan2.2`;
        const remoteModel = `${cacheRoot}/model`;
        const manifestFile = `${cacheRoot}/cache-manifest.json`;
        const requiredJson = JSON.stringify(RUNPOD_WAN22_CACHE_CONTRACT.requiredFiles);
        const contractJson = JSON.stringify({
            profile: RUNPOD_WAN22_CACHE_CONTRACT.profile,
            modelRepository: RUNPOD_WAN22_CACHE_CONTRACT.modelRepository,
            modelRevision: RUNPOD_WAN22_CACHE_CONTRACT.modelRevision,
            wanRepositoryRevision: RUNPOD_WAN22_CACHE_CONTRACT.wanRepositoryRevision,
            expectedModelBytes: RUNPOD_WAN22_CACHE_CONTRACT.expectedModelBytes,
            requiredFiles: RUNPOD_WAN22_CACHE_CONTRACT.requiredFiles
        });
        const bootstrap = [
            "#!/usr/bin/env bash",
            "set -eEuo pipefail",
            "export DEBIAN_FRONTEND=noninteractive",
            `CACHE_ROOT=${shellSingleQuote(cacheRoot)}`,
            `VENV=${shellSingleQuote(remoteVenv)}`,
            `WAN_REPO=${shellSingleQuote(remoteRepository)}`,
            `MODEL_DIR=${shellSingleQuote(remoteModel)}`,
            `CACHE_MANIFEST=${shellSingleQuote(manifestFile)}`,
            `export JARVIS_OPERATION_ID=${shellSingleQuote(path.basename(path.dirname(bootstrapFile)))}`,
            `PROGRESS=${shellSingleQuote(`${remoteBase}/operations`)}/$JARVIS_OPERATION_ID/bootstrap-progress.json`,
            "mkdir -p \"$CACHE_ROOT\" \"$(dirname \"$PROGRESS\")\"",
            "progress() { local stage=\"$1\" status=\"$2\" cache=\"$3\" bytes=0; test -d \"$MODEL_DIR\" && bytes=$(du -sb \"$MODEL_DIR\" 2>/dev/null | awk '{print $1}') || true; python3 - \"$PROGRESS\" \"$stage\" \"$status\" \"$cache\" \"$bytes\" <<'PY'",
            "import json,os,sys,tempfile,datetime",
            "target,stage,status,cache,raw=sys.argv[1:]",
            "payload={'stage':stage,'status':status,'cacheStatus':cache,'modelBytes':int(raw or 0),'at':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')}",
            "fd,tmp=tempfile.mkstemp(prefix='.progress-',dir=os.path.dirname(target)); os.close(fd)",
            "open(tmp,'w',encoding='utf-8').write(json.dumps(payload,separators=(',',':'))+'\\n'); os.replace(tmp,target)",
            "PY",
            "}",
            "trap 'progress BOOTSTRAP FAILED CACHE_MISS' ERR",
            "progress SYSTEM_DEPENDENCIES RUNNING CACHE_MISS",
            "missing=(); for tool in git ffmpeg; do command -v \"$tool\" >/dev/null || missing+=(\"$tool\"); done; python3 -m venv --help >/dev/null 2>&1 || missing+=(python3-venv)",
            "if test ${#missing[@]} -gt 0; then apt-get update -qq; apt-get install -y -qq git ffmpeg python3-venv; fi",
            "progress SYSTEM_DEPENDENCIES READY CACHE_MISS",
            "CACHE_VALID=0",
            `python3 - \"$CACHE_MANIFEST\" \"$MODEL_DIR\" \"$WAN_REPO\" \"$VENV\" ${shellSingleQuote(contractJson)} <<'PY' && CACHE_VALID=1 || true`,
            "import json,os,subprocess,sys",
            "manifest_path,model_dir,repo_dir,venv_dir,expected_raw=sys.argv[1:]",
            "expected=json.loads(expected_raw)",
            "actual=json.load(open(manifest_path,encoding='utf-8'))",
            "assert all(actual.get(k)==expected.get(k) for k in ('profile','modelRepository','modelRevision','wanRepositoryRevision','expectedModelBytes'))",
            "assert os.path.isfile(os.path.join(repo_dir,'generate.py')) and os.path.isfile(os.path.join(venv_dir,'bin','python'))",
            "assert subprocess.check_output(['git','-C',repo_dir,'rev-parse','HEAD'],text=True).strip()==expected['wanRepositoryRevision']",
            "for item in expected['requiredFiles']:",
            "    assert os.path.getsize(os.path.join(model_dir,item['path']))==item['bytes']",
            "PY",
            "if test \"$CACHE_VALID\" = 1; then progress CACHE_VALIDATE READY CACHE_HIT; exit 0; fi",
            "rm -f \"$CACHE_MANIFEST\"",
            "progress CACHE_VALIDATE INCOMPLETE CACHE_MISS",
            "progress WAN_REPOSITORY RUNNING CACHE_POPULATING",
            `if test ! -d \"$WAN_REPO/.git\"; then git clone --filter=blob:none https://github.com/Wan-Video/Wan2.2.git \"$WAN_REPO\"; fi`,
            `git -C \"$WAN_REPO\" fetch --depth 1 origin ${RUNPOD_WAN22_CACHE_CONTRACT.wanRepositoryRevision}`,
            `git -C \"$WAN_REPO\" checkout --detach ${RUNPOD_WAN22_CACHE_CONTRACT.wanRepositoryRevision}`,
            "progress WAN_REPOSITORY READY CACHE_POPULATING",
            "progress PYTHON_REQUIREMENTS RUNNING CACHE_POPULATING",
            "test -x \"$VENV/bin/python\" || python3 -m venv --system-site-packages \"$VENV\"",
            "REQ_SHA=$(sha256sum \"$WAN_REPO/requirements.txt\" | awk '{print $1}')",
            "if test \"$(cat \"$CACHE_ROOT/requirements.sha256\" 2>/dev/null || true)\" != \"$REQ_SHA\"; then \"$VENV/bin/python\" -m pip install -r \"$WAN_REPO/requirements.txt\" 'huggingface_hub[cli]'; printf '%s\\n' \"$REQ_SHA\" > \"$CACHE_ROOT/requirements.sha256\"; fi",
            "progress PYTHON_REQUIREMENTS READY CACHE_POPULATING",
            "progress MODEL_DOWNLOAD RUNNING CACHE_POPULATING",
            "mkdir -p \"$MODEL_DIR\"",
            `\"$VENV/bin/hf\" download ${RUNPOD_WAN22_CACHE_CONTRACT.modelRepository} --revision ${RUNPOD_WAN22_CACHE_CONTRACT.modelRevision} --local-dir \"$MODEL_DIR\" &`,
            "DOWNLOAD_PID=$!",
            "while kill -0 \"$DOWNLOAD_PID\" 2>/dev/null; do progress MODEL_DOWNLOAD RUNNING CACHE_POPULATING; sleep 20; done",
            "wait \"$DOWNLOAD_PID\"",
            "progress MODEL_DOWNLOAD READY CACHE_POPULATING",
            "progress MODEL_VALIDATION RUNNING CACHE_POPULATING",
            `python3 - \"$MODEL_DIR\" ${shellSingleQuote(requiredJson)} <<'PY'`,
            "import hashlib,json,os,sys",
            "root=sys.argv[1]; required=json.loads(sys.argv[2])",
            "for item in required:",
            "    target=os.path.join(root,item['path']); assert os.path.getsize(target)==item['bytes']",
            "    digest=hashlib.sha256(); f=open(target,'rb')",
            "    for chunk in iter(lambda:f.read(8*1024*1024),b''): digest.update(chunk)",
            "    assert digest.hexdigest()==item['sha256']",
            "PY",
            `python3 - \"$CACHE_MANIFEST\" ${shellSingleQuote(contractJson)} <<'PY'`,
            "import json,os,sys,tempfile",
            "target=sys.argv[1]; payload=json.loads(sys.argv[2]); fd,tmp=tempfile.mkstemp(prefix='.manifest-',dir=os.path.dirname(target)); os.close(fd)",
            "open(tmp,'w',encoding='utf-8').write(json.dumps(payload,sort_keys=True,separators=(',',':'))+'\\n'); os.replace(tmp,target)",
            "PY",
            "progress MODEL_VALIDATION READY CACHE_READY",
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
        const remoteOperationDir = `${remoteBase}/operations/${job.operationId}`;
        const remoteJob = {
            ...job,
            modelDirectory: `${remoteBase}/cache/wan22-ti2v-5b/model`,
            outputFile: `${remoteOperationDir}/output.mp4`,
            referenceFiles: generationAssets,
            sourceReferenceFiles: sourceAssets
        };
        const localJobFile = path.join(operationDir, "job.json");
        const localRunnerFile = path.join(operationDir, "jarvis-local-video-wan22.py");
        const runnerSource = path.resolve(String(env.JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT || ""));
        if (!fs.existsSync(runnerSource)) throw new Error("RUNPOD_RUNNER_SOURCE_NOT_FOUND");
        atomicJsonWrite(localJobFile, remoteJob);
        fs.copyFileSync(runnerSource, localRunnerFile);
        const bootstrapFile = path.join(operationDir, "bootstrap.sh");
        writeBootstrapFile(bootstrapFile);
        return {
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

    async function remoteHealth(state, full = false) {
        const command = `python3 -c ${shellSingleQuote(
            "import json,shutil,torch,os; p=shutil.disk_usage('/workspace'); " +
            "d={'python':True,'torch':bool(torch.__version__),'cuda':torch.cuda.is_available(),'gpuName':torch.cuda.get_device_name(0) if torch.cuda.is_available() else ''," +
            "'vramGb':round(torch.cuda.get_device_properties(0).total_memory/1073741824,2) if torch.cuda.is_available() else 0,'freeDiskGb':round(p.free/1073741824,2)," +
            "'ffmpeg':bool(shutil.which('ffmpeg')),'ffprobe':bool(shutil.which('ffprobe'))," +
            `'runner':os.path.isfile('${state.remoteOperationDir}/jarvis-local-video-wan22.py'),'wanRepository':os.path.isfile('${remoteBase}/cache/wan22-ti2v-5b/Wan2.2/generate.py'),` +
            `'wanModel':os.path.isfile('${remoteBase}/cache/wan22-ti2v-5b/cache-manifest.json')}; print(json.dumps(d))`
        )}`;
        const result = await sshCommand(state, command, 60000);
        let health;
        try { health = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)); }
        catch { throw new Error("RUNPOD_HEALTH_RESPONSE_INVALID"); }
        if (
            health.python !== true || health.torch !== true || health.cuda !== true ||
            !/nvidia/i.test(String(health.gpuName || "")) ||
            Number(health.vramGb || 0) < 24 || Number(health.freeDiskGb || 0) < 45
        ) {
            throw new Error("RUNPOD_WORKER_HEALTH_FAILED");
        }
        if (full && (
            health.ffmpeg !== true || health.ffprobe !== true || health.runner !== true ||
            health.wanRepository !== true || health.wanModel !== true
        )) {
            throw new Error("RUNPOD_WAN22_HEALTH_FAILED");
        }
        return health;
    }

    async function launch({ job }) {
        assertConfigured();
        if (
            job.executionTarget !== "remote" || job.backend !== WAN22_TI2V_5B.backend ||
            !job.missionId || !job.objectiveId || !job.obligationId || !job.rootInstructionHash
        ) {
            throw new Error("RUNPOD_DURABLE_IDENTITY_REQUIRED");
        }
        const file = stateFile(job.operationId);
        if (fs.existsSync(file)) {
            const existing = readJson(file);
            if (existing.podId) throw new Error("RUNPOD_DUPLICATE_OBLIGATION_BLOCKED");
        }
        const prepared = prepareRemoteFiles(job);
        let podId = null;
        try {
            await assertNoExistingOperationPod(job);
            const networkVolume = await resolveNetworkVolume();
            const availability = await queryAvailability(networkVolume?.dataCenterId || null);
            const provisionedAt = now().toISOString();
            const body = {
                cloudType,
                computeType: "GPU",
                containerDiskInGb,
                volumeMountPath: "/workspace",
                gpuCount: 1,
                gpuTypeIds: [gpuTypeId],
                gpuTypePriority: "custom",
                imageName,
                interruptible: false,
                minRAMPerGPU: minimumRamGb,
                minVCPUPerGPU: minimumVcpu,
                ports: ["22/tcp"],
                supportPublicIp: true,
                name: `jarvis-v142-${obligationFingerprint(job).slice(0, 24)}`,
                env: {
                    PUBLIC_KEY: prepared.publicKey,
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
            }
            const pod = await apiRequest(`${apiBase}/pods`, {
                method: "POST",
                body: JSON.stringify(body)
            }, [200, 201], "provision");
            podId = String(pod?.id || "").trim();
            if (!podId) throw new Error("RUNPOD_PROVISION_RESPONSE_INVALID");
            const actualGpu = String(pod?.gpu?.id || pod?.machine?.gpuTypeId || gpuTypeId);
            const actualVram = Number(pod?.gpu?.memoryInGb || availability.vramGb || expectedVramGb);
            if (actualGpu !== gpuTypeId || actualVram < 24) throw new Error("RUNPOD_PROVISIONED_GPU_INCOMPATIBLE");
            const hourlyRateUsd = Math.max(
                Number(pod?.adjustedCostPerHr || pod?.costPerHr || availability.hourlyRateUsd),
                configuredTotalHourlyRateUsd
            );
            if (!(hourlyRateUsd > 0)) throw new Error("RUNPOD_HOURLY_RATE_INVALID");
            const state = {
                schemaVersion: JARVIS_RUNPOD_ADAPTER_VERSION,
                provider: "runpod",
                podId,
                remoteJobId: `runpod/${podId}/${job.operationId}`,
                phase: "PROVISIONED",
                gpuTypeId,
                vramGb: actualVram,
                hourlyRateUsd,
                hardBudgetUsd,
                networkVolumeId: networkVolume?.id || null,
                networkVolumeDataCenterId: networkVolume?.dataCenterId || null,
                networkVolumeSizeGb: networkVolume?.sizeGb || null,
                cacheProfile: RUNPOD_WAN22_CACHE_CONTRACT.profile,
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
            if (podId) {
                try {
                    await apiRequest(`${apiBase}/pods/${encodeURIComponent(podId)}`, { method: "DELETE" }, [200, 204, 404]);
                }
                catch {}
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
            !["CACHE_MISS", "CACHE_POPULATING", "CACHE_READY", "CACHE_HIT"].includes(progress.cacheStatus) ||
            !String(progress.stage || "").trim() || !Number.isFinite(Date.parse(String(progress.at || "")))
        ) {
            throw new Error("RUNPOD_BOOTSTRAP_PROGRESS_INVALID");
        }
        return progress;
    }

    async function uploadOperation(state) {
        writeBootstrapFile(state.bootstrapFile);
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

    async function writeLocalFailure(operation, resultFile, status, retryable = false) {
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
            externalEstimatedCostUsd: 0
        });
    }

    async function pollRemote({ operation, resultFile }) {
        assertConfigured();
        const loaded = readState(operation);
        let state = loaded.state;
        const cost = rentalCost(state);
        if (cost.estimatedCostUsd >= state.hardBudgetUsd * budgetStopRatio) {
            await writeLocalFailure(operation, resultFile, "RUNPOD_HARD_BUDGET_EXCEEDED", false);
            state = writeState(loaded.file, state, { phase: "BUDGET_EXCEEDED" });
            return { ok: false, done: true, status: "RUNPOD_HARD_BUDGET_EXCEEDED", remoteWorker: runpodPublicWorker(state) };
        }
        try {
            if (state.phase === "PROVISIONED") {
                const pod = await apiRequest(`${apiBase}/pods/${encodeURIComponent(state.podId)}?includeMachine=true`, { method: "GET" });
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
                    bootstrapStartedAt,
                    lastBootstrapProgressAt: bootstrapStartedAt,
                    stageTimeline: state.stageTimeline
                });
                return { ok: true, done: false, status: "RUNPOD_WAN22_BOOTSTRAPPING", remoteWorker: runpodPublicWorker(state) };
            }
            if (state.phase === "BOOTSTRAPPING") {
                const progress = await readBootstrapProgress(state);
                if (progress) {
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
                    state = writeState(loaded.file, state, {
                        cacheStatus: progress.cacheStatus,
                        bootstrapProgress: progress,
                        lastBootstrapProgressAt: madeProgress
                            ? progress.at
                            : state.lastBootstrapProgressAt,
                        stageTimeline: state.stageTimeline
                    });
                }
                const lastProgressMs = Date.parse(String(state.lastBootstrapProgressAt || state.bootstrapStartedAt || ""));
                if (Number.isFinite(lastProgressMs) && (now().getTime() - lastProgressMs) / 1000 >= state.bootstrapTimeoutSeconds) {
                    await writeLocalFailure(operation, resultFile, "RUNPOD_BOOTSTRAP_TIMEOUT", false);
                    state = withStage(state, "bootstrap", "TIMEOUT");
                    state = writeState(loaded.file, state, { phase: "BOOTSTRAP_TIMEOUT", stageTimeline: state.stageTimeline });
                    return { ok: false, done: true, status: "RUNPOD_BOOTSTRAP_TIMEOUT", remoteWorker: runpodPublicWorker(state) };
                }
                const marker = await sshCommand(state,
                    `if test -f ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.ready")}; then echo READY; elif test -f ${shellSingleQuote(state.remoteOperationDir + "/bootstrap.failed")}; then echo FAILED; else echo RUNNING; fi`
                );
                const status = marker.stdout.trim().split(/\r?\n/).at(-1);
                if (status === "FAILED") {
                    writeBootstrapFile(state.bootstrapFile);
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
                            status: "RUNPOD_WAN22_BOOTSTRAP_REFRESH_REQUIRED",
                            remoteWorker: runpodPublicWorker(state)
                        };
                    }
                    await writeLocalFailure(operation, resultFile, "RUNPOD_BOOTSTRAP_INCOMPLETE", false);
                    state = withStage(state, "bootstrap", "FAILED");
                    state = writeState(loaded.file, state, { phase: "BOOTSTRAP_INCOMPLETE", stageTimeline: state.stageTimeline });
                    return { ok: false, done: true, status: "RUNPOD_BOOTSTRAP_INCOMPLETE", remoteWorker: runpodPublicWorker(state) };
                }
                if (status !== "READY") {
                    return { ok: true, done: false, status: "RUNPOD_WAN22_BOOTSTRAPPING", remoteWorker: runpodPublicWorker(state) };
                }
                const health = await remoteHealth(state, true);
                const runner = `env JARVIS_WAN22_REPO_DIR=${shellSingleQuote(remoteBase + "/cache/wan22-ti2v-5b/Wan2.2")} JARVIS_LOCAL_VIDEO_EXTERNAL_API_ALLOWED=false JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS=${Math.floor(inferenceTimeoutSeconds)} ${shellSingleQuote(remoteBase + "/cache/wan22-ti2v-5b/venv/bin/python")} ${shellSingleQuote(state.remoteOperationDir + "/jarvis-local-video-wan22.py")} --job ${shellSingleQuote(state.remoteOperationDir + "/job.json")} --result ${shellSingleQuote(state.remoteResultFile)}`;
                const started = await sshCommand(state, `nohup bash -lc ${shellSingleQuote(runner)} > ${shellSingleQuote(state.remoteOperationDir + "/runner.log")} 2>&1 & echo $!`);
                const remotePid = Number(started.stdout.trim().split(/\r?\n/).at(-1));
                if (!Number.isInteger(remotePid) || remotePid < 1) throw new Error("RUNPOD_REMOTE_JOB_START_FAILED");
                state = withStage(state, "bootstrap", "READY");
                state = withStage(state, "inference", "RUNNING");
                state = writeState(loaded.file, state, {
                    phase: "JOB_RUNNING",
                    remotePid,
                    fullHealth: health,
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
            await writeLocalFailure(operation, resultFile, error?.message || "RUNPOD_REMOTE_POLL_FAILED", false);
            state = writeState(loaded.file, state, { phase: "FAILED", error: error?.message || "RUNPOD_REMOTE_POLL_FAILED" });
            return { ok: false, done: true, status: state.error, remoteWorker: runpodPublicWorker(state) };
        }
    }

    async function release(receipt = {}) {
        assertConfigured();
        let loaded;
        try {
            loaded = readState(receipt);
        }
        catch(error) {
            return { ok: false, status: error.message, error: error.message };
        }
        let state = loaded.state;
        const cost = rentalCost(state);
        try {
            await apiRequest(`${apiBase}/pods/${encodeURIComponent(state.podId)}`, { method: "DELETE" }, [200, 204, 404]);
            let terminationVerified = false;
            try {
                const pod = await apiRequest(`${apiBase}/pods/${encodeURIComponent(state.podId)}`, { method: "GET" }, [200]);
                terminationVerified = !pod || String(pod.desiredStatus || "") === "TERMINATED";
            }
            catch(error) {
                terminationVerified = error?.httpStatus === 404;
            }
            if (!terminationVerified) throw new Error("RUNPOD_DELETE_NOT_VERIFIED");
            let actualCostUsd = 0;
            try {
                const billing = await apiRequest(
                    `${apiBase}/billing/pods?podId=${encodeURIComponent(state.podId)}&grouping=podId&bucketSize=hour`,
                    { method: "GET" }
                );
                actualCostUsd = (Array.isArray(billing) ? billing : [])
                    .filter(item => item?.podId === state.podId)
                    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
            }
            catch {}
            state = writeState(loaded.file, state, {
                phase: "TERMINATED",
                releasedAt: now().toISOString(),
                releaseReason: receipt.reason || null,
                terminationVerified,
                gpuRentalSeconds: cost.seconds,
                gpuRentalEstimatedCost: cost.estimatedCostUsd,
                gpuRentalActualCost: actualCostUsd,
                networkVolumeId: state.networkVolumeId || null,
                networkVolumeRetained: Boolean(state.networkVolumeId)
            });
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
                terminationVerified: true,
                gpuRentalSeconds: cost.seconds,
                gpuRentalEstimatedCost: cost.estimatedCostUsd,
                gpuRentalActualCost: actualCostUsd,
                networkVolumeId: state.networkVolumeId || null,
                networkVolumeRetained: Boolean(state.networkVolumeId)
            };
        }
        catch(error) {
            state = writeState(loaded.file, state, {
                phase: "RELEASE_FAILED",
                releaseError: error?.message || "RUNPOD_POD_TERMINATION_FAILED"
            });
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
        return {
            ok: provider === "runpod" && Boolean(apiKey) && Boolean(ssh && scp && sshKeygen),
            status: provider === "runpod" && apiKey
                ? "RUNPOD_PROVISIONING_CONFIGURED"
                : "RUNPOD_API_KEY_REQUIRED",
            cudaAvailable: true,
            gpuName: gpuTypeId,
            gpuIndex: 0,
            vramGb: expectedVramGb,
            freeDiskGb: networkVolumeId
                ? RUNPOD_WAN22_CACHE_CONTRACT.minimumNetworkVolumeGb
                : containerDiskInGb + volumeInGb,
            ffmpegAvailable: true,
            ffprobeAvailable: true,
            pythonAvailable: true,
            remoteProvisioning: true,
            provider: "runpod",
            hardBudgetUsd,
            networkVolumeId: networkVolumeId || null,
            cacheProfile: RUNPOD_WAN22_CACHE_CONTRACT.profile,
            bootstrapTimeoutSeconds,
            inferenceTimeoutSeconds
        };
    }

    return {
        version: JARVIS_RUNPOD_ADAPTER_VERSION,
        provider: "runpod",
        configured: provider === "runpod" && Boolean(apiKey),
        inspectHardware,
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
            return {
                ok: true,
                operation: saveOperation(file, operation, {
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
                })
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
            return {
                ok: false,
                operation: saveOperation(file, operation, {
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
                }),
                error
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
            const receiptSeconds = Number(receipt.gpuRentalSeconds);
            const receiptEstimatedCost = Number(receipt.gpuRentalEstimatedCost);
            const effectiveSeconds = Number.isFinite(receiptSeconds) ? receiptSeconds : gpuRentalSeconds;
            const effectiveEstimatedCost = Number.isFinite(receiptEstimatedCost)
                ? receiptEstimatedCost
                : gpuRentalEstimatedCost;
            const actualCost = Number(receipt.gpuRentalActualCost || receipt.actualCostUsd || 0);
            return {
                ok: true,
                operation: saveOperation(file, operation, {
                    workerRelease: {
                        ok: true,
                        status: receipt.status || "REMOTE_VIDEO_WORKER_RELEASED",
                        reason,
                        releasedAt: endedAt.toISOString(),
                        receiptId: receipt.receiptId || null,
                        provider: receipt.provider || operation.remoteWorker?.provider || null,
                        podId: receipt.podId || operation.remoteWorker?.podId || null,
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
                })
            };
        }
        catch(error) {
            return {
                ok: false,
                operation: saveOperation(file, operation, {
                    workerRelease: {
                        ok: false,
                        status: "REMOTE_VIDEO_WORKER_RELEASE_FAILED",
                        error: error?.message || "REMOTE_VIDEO_WORKER_RELEASE_FAILED",
                        reason,
                        releasedAt: null
                    },
                    gpuRentalSeconds,
                    gpuRentalEstimatedCost,
                    gpuRentalActualCost: 0
                }),
                error: error?.message || "REMOTE_VIDEO_WORKER_RELEASE_FAILED"
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

    function isOperationStale(operation) {
        const createdAt = Date.parse(String(operation.createdAt || ""));
        if (!Number.isFinite(createdAt)) return true;
        const ageMs = Math.max(0, now().getTime() - createdAt);
        return ageMs > (localVideoTimeoutSeconds(env) + 60) * 1000;
    }

    function failStaleOperation(file, operation) {
        const child = children.get(operation.operationId);
        try { if (child?.kill) child.kill(); } catch {}
        children.delete(operation.operationId);
        return saveOperation(file, operation, {
            state: "FAILED",
            status: "LOCAL_VIDEO_OPERATION_STALE",
            error: "LOCAL_VIDEO_OPERATION_STALE",
            retryable: true
        });
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
        const currentHealth = health();
        const referenceOutputs = Array.isArray(payload.referenceOutputs) ? payload.referenceOutputs : [];
        const requirements = {
            sceneCount: Array.isArray(payload.prompts) ? payload.prompts.length : 0,
            referenceCount: referenceOutputs.length,
            requiresImageToVideo: referenceOutputs.length > 0,
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
            .slice(0, 4);
        const script = String(payload.script || prompts.join(" ")).trim();
        if (!script || prompts.length < 1) {
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
                operation = saveOperation(operationPath, operation, {
                    pid: Number(child?.pid || 0) || null,
                    remoteWorker: child?.remoteWorker || null,
                    remoteJobId: child?.remoteWorker?.remoteJobId || null,
                    podId: child?.remoteWorker?.podId || null
                });
                return { operation, ok: true };
            }
            catch(error) {
                operation = saveOperation(operationPath, operation, {
                    state: "FAILED",
                    status: "LOCAL_VIDEO_RUNNER_START_FAILED",
                    error: error?.message || "LOCAL_VIDEO_RUNNER_START_FAILED",
                    failureStage: error?.stage || null,
                    providerCode: error?.providerCode || null,
                    providerMessage: error?.providerMessage || null,
                    retryable: error?.retryable !== false
                });
                const released = await releaseWorker(
                    operationPath,
                    operation,
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
        if (references.length > Number(model.maximumReferenceAssets || 0)) {
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
            aspectRatio: payload.aspectRatio === "16:9" ? "16:9" : "9:16",
            output: output.normalized,
            outputFile: output.resolved,
            referenceOutputs: references.map(item => item.output),
            referenceFiles: references.map(item => item.file),
            sourceReferenceOutputs: sourceReferences.map(item => item.output),
            sourceReferenceFiles: sourceReferences.map(item => item.file),
            referencePreparation,
            executionTarget: String(env.JARVIS_LOCAL_VIDEO_EXECUTION_TARGET || "local")
                .trim().toLowerCase() === "remote" ? "remote" : "local",
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
            referenceAssetCount: references.length,
            sourceReferenceAssetCount: sourceReferences.length,
            referencePreparation,
            createdAt: now().toISOString(),
            updatedAt: now().toISOString(),
            engine: "local",
            provider: "local",
            backend: model.backend,
            model: model.model,
            executionTarget: job.executionTarget,
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
                operation = saveOperation(loaded.file, operation, {
                    remoteWorker: remote?.remoteWorker || operation.remoteWorker || null,
                    remoteJobId: remote?.remoteJobId || remote?.remoteWorker?.remoteJobId || operation.remoteJobId || null,
                    remotePoll: {
                        status: remote?.status || null,
                        retryable: remote?.retryable === true,
                        checkedAt: now().toISOString()
                    }
                });
            }
            catch(error) {
                operation = saveOperation(loaded.file, operation, {
                    remotePoll: {
                        status: "REMOTE_VIDEO_POLL_TRANSPORT_FAILED",
                        error: error?.message || "REMOTE_VIDEO_POLL_TRANSPORT_FAILED",
                        retryable: true,
                        checkedAt: now().toISOString()
                    }
                });
            }
        }
        if (!fs.existsSync(operation.resultFile)) {
            if (operation.state === "RUNNING" && isOperationStale(operation)) {
                operation = failStaleOperation(loaded.file, operation);
                const released = await releaseWorker(
                    loaded.file,
                    operation,
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
            operation = saveOperation(loaded.file, operation, {
                state: "FAILED",
                status: "LOCAL_VIDEO_RESULT_INVALID",
                error: error.message
            });
            const released = await releaseWorker(
                loaded.file,
                operation,
                "result_invalid"
            );
            operation = released.operation;
            return { ...operation, ok: false, done: true };
        }
        if (result?.ok !== true) {
            operation = saveOperation(loaded.file, operation, {
                state: "FAILED",
                status: result?.status || "LOCAL_VIDEO_GENERATION_FAILED",
                error: result?.error || result?.status || "LOCAL_VIDEO_GENERATION_FAILED",
                retryable: result?.retryable === true
            });
            const released = await releaseWorker(
                loaded.file,
                operation,
                "generation_failed"
            );
            operation = released.operation;
            return { ...operation, ok: false, done: true };
        }
        try {
            verifyResultReceipt(operation, result);
            const output = safeOutput(resolvedRoot, result.output);
            const stat = fs.statSync(output.resolved);
            if (!stat.isFile() || stat.size < 100000) throw new Error("LOCAL_VIDEO_PHYSICAL_OUTPUT_INVALID");
            if (!verifyMp4Container(output.resolved)) throw new Error("LOCAL_VIDEO_MP4_CONTAINER_INVALID");
            const currentHealth = health();
            const media = inspectVideo
                ? inspectVideo(output.resolved)
                : defaultVideoInspection(output.resolved, currentHealth.ffprobe);
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
                operation = saveOperation(loaded.file, released.operation, {
                    state: "FAILED",
                    status: "REMOTE_VIDEO_WORKER_RELEASE_FAILED",
                    error: released.error
                });
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
            operation = saveOperation(loaded.file, operation, {
                state: "FAILED",
                status: error.message || "LOCAL_VIDEO_PHYSICAL_VERIFICATION_FAILED",
                error: error.message || "LOCAL_VIDEO_PHYSICAL_VERIFICATION_FAILED"
            });
            const released = await releaseWorker(
                loaded.file,
                operation,
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
        const operation = saveOperation(loaded.file, loaded.operation, {
            state: "CANCELLED",
            status: "LOCAL_VIDEO_GENERATION_CANCELLED"
        });
        const released = await releaseWorker(
            loaded.file,
            operation,
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
