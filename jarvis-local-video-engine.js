import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";

import { registerArtifact } from "./jarvis-artifact-studio.js";

export const JARVIS_LOCAL_VIDEO_ENGINE_VERSION = "1.3.0-v142-receipt-bound";
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
    const mode = String(value || "CURRENT_STABLE").trim().toUpperCase();
    return VIDEO_ENGINE_MODES.includes(mode) ? mode : "CURRENT_STABLE";
}

function requestedLocalModel(env = process.env) {
    return String(
        env.JARVIS_LOCAL_VIDEO_MODEL ||
        env.JARVIS_LOCAL_VIDEO_BACKEND ||
        LOCAL_VIDEO_MODEL_PROFILE.backend
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
    return {
        version: JARVIS_LOCAL_VIDEO_ENGINE_VERSION,
        mode,
        localVideoEnabled: booleanValue(env.JARVIS_LOCAL_VIDEO_ENABLED, false),
        localImageEnabled: booleanValue(env.JARVIS_LOCAL_IMAGE_ENABLED, false),
        localSpeechEnabled: booleanValue(env.JARVIS_LOCAL_SPEECH_ENABLED, false),
        localVideoCertified: booleanValue(env.JARVIS_LOCAL_VIDEO_CERTIFIED, false),
        localVideoModel: requestedLocalModel(env),
        externalFallbackEnabled: booleanValue(env.JARVIS_EXTERNAL_FALLBACK_ENABLED, true),
        externalBudgetUsdPerOperation: mode === "LOCAL_TEST"
            ? 0
            : finiteBudget(env.JARVIS_EXTERNAL_BUDGET_USD_PER_OPERATION),
        externalBudgetUsdPerEpisode: mode === "LOCAL_TEST"
            ? 0
            : finiteBudget(env.JARVIS_EXTERNAL_BUDGET_USD_PER_EPISODE),
        externalBudgetUsdPerDay: mode === "LOCAL_TEST"
            ? 0
            : finiteBudget(env.JARVIS_EXTERNAL_BUDGET_USD_PER_DAY),
        externalEstimatedCostUsdPerCall: finiteBudget(
            env.JARVIS_EXTERNAL_VIDEO_ESTIMATED_COST_USD_PER_CALL,
            0
        ),
        defaultIsCurrentStable: true,
        promptRoutingAllowed: false
    };
}

export function resolveVideoEngine({ policy, health } = {}) {
    const effectivePolicy = policy || describeLocalVideoPolicy();
    const mode = normalizedMode(effectivePolicy.mode);
    const localReady = effectivePolicy.localVideoEnabled === true && health?.ok === true;
    const common = {
        policy: mode,
        engineRequested: mode,
        externalFallbackEnabled: effectivePolicy.externalFallbackEnabled === true,
        fallbackUsed: false,
        fallbackReason: null,
        externalApiUsed: false,
        externalEstimatedCostUsd: 0
    };

    if (mode === "CURRENT_STABLE") {
        return {
            ...common,
            ok: true,
            status: "VIDEO_ENGINE_CURRENT_STABLE",
            engineUsed: "external",
            provider: "google-veo"
        };
    }

    if (mode === "LOCAL_TEST" || mode === "LOCAL_ONLY") {
        if (!localReady) {
            return {
                ...common,
                ok: false,
                status: health?.status || "LOCAL_VIDEO_WORKER_UNAVAILABLE",
                error: health?.status || "LOCAL_VIDEO_WORKER_UNAVAILABLE",
                engineUsed: null,
                provider: null,
                retryable: false
            };
        }
        return {
            ...common,
            ok: true,
            status: mode === "LOCAL_TEST"
                ? "VIDEO_ENGINE_LOCAL_TEST"
                : "VIDEO_ENGINE_LOCAL_ONLY",
            engineUsed: "local",
            provider: "local"
        };
    }

    const certifiedReady = localReady && effectivePolicy.localVideoCertified === true;
    if (certifiedReady) {
        return {
            ...common,
            ok: true,
            status: "VIDEO_ENGINE_LOCAL_PREFERRED",
            engineUsed: "local",
            provider: "local"
        };
    }
    const reason = health?.status || (
        localReady ? "LOCAL_VIDEO_NOT_CERTIFIED" : "LOCAL_VIDEO_WORKER_UNAVAILABLE"
    );
    if (effectivePolicy.externalFallbackEnabled === true) {
        return {
            ...common,
            ok: true,
            status: "VIDEO_ENGINE_EXTERNAL_FALLBACK",
            engineUsed: "external",
            provider: "google-veo",
            fallbackUsed: true,
            fallbackReason: reason
        };
    }
    return {
        ...common,
        ok: false,
        status: reason,
        error: reason,
        engineUsed: null,
        provider: null,
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

export function buildLocalAiCapabilityReport({
    root = process.cwd(),
    env = process.env,
    hardware = inspectLocalVideoHardware({ root, env })
} = {}) {
    const policy = describeLocalVideoPolicy(env);
    const selectedVideoModel = hardware.modelRequirements || resolveLocalVideoModelProfile({ env, hardware });
    const localVideoSupported = hardware.ok === true && selectedVideoModel.unsupported !== true;
    return {
        reportType: "LOCAL_AI_CAPABILITY_REPORT",
        schemaVersion: JARVIS_LOCAL_VIDEO_ENGINE_VERSION,
        generatedAt: new Date().toISOString(),
        root: path.resolve(root),
        policy,
        hardware,
        selectedVideoModel,
        candidateVideoModels: compatibleModelProfiles(hardware),
        localVideoReadiness: {
            supported: localVideoSupported,
            status: selectedVideoModel.unsupported === true
                ? "LOCAL_VIDEO_BACKEND_UNSUPPORTED"
                : hardware.status,
            physicalMp4Authorized: localVideoSupported,
            installationAuthorized: false,
            reason: selectedVideoModel.unsupported === true
                ? "LOCAL_VIDEO_BACKEND_UNSUPPORTED"
                : localVideoSupported
                    ? "HARDWARE_GATE_PASSED_MODEL_AND_RUNNER_STILL_REQUIRE_EXPLICIT_INSTALLATION"
                    : hardware.status
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
                "video.generate:CURRENT_STABLE",
                "image.generate:CURRENT_STABLE",
                "speech.synthesize:CURRENT_STABLE_WHEN_LOCAL_UNAVAILABLE"
            ]
        },
        promotion: {
            current: "CURRENT_STABLE",
            localTestCertified: false,
            localPreferredAuthorized: false,
            localOnlyAuthorized: false
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

export function createLocalVideoEngine({
    root = process.cwd(),
    env = process.env,
    inspectHardware = () => inspectLocalVideoHardware({ root, env }),
    inspectVideo = null,
    launch = null,
    now = () => new Date()
} = {}) {
    const resolvedRoot = path.resolve(root);
    const policy = describeLocalVideoPolicy(env);
    const directories = operationDirectories(resolvedRoot);
    const children = new Map();

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
        const model = resolveLocalVideoModelProfile({ env, hardware });
        const runner = commandPath(env.JARVIS_LOCAL_VIDEO_RUNNER, env);
        const runnerScript = path.resolve(String(env.JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT || ""));
        const modelDirectory = path.resolve(String(env.JARVIS_LOCAL_VIDEO_MODEL_DIR || ""));
        let status = model.unsupported === true
            ? "LOCAL_VIDEO_BACKEND_UNSUPPORTED"
            : hardware.status;
        let ok = hardware.ok === true && model.unsupported !== true;
        if (!policy.localVideoEnabled) {
            ok = false;
            status = "LOCAL_VIDEO_DISABLED";
        }
        else if (ok && (!runner || !env.JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT || !fs.existsSync(runnerScript))) {
            ok = false;
            status = "LOCAL_VIDEO_RUNNER_UNCONFIGURED";
        }
        else if (ok && (!env.JARVIS_LOCAL_VIDEO_MODEL_DIR || !fs.existsSync(modelDirectory))) {
            ok = false;
            status = "LOCAL_VIDEO_MODEL_NOT_READY";
        }
        return {
            ...hardware,
            ok,
            status,
            version: JARVIS_LOCAL_VIDEO_ENGINE_VERSION,
            policy: policy.mode,
            enabled: policy.localVideoEnabled,
            certified: policy.localVideoCertified,
            runner: runner || null,
            runnerScript: env.JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT ? runnerScript : null,
            modelDirectory: env.JARVIS_LOCAL_VIDEO_MODEL_DIR ? modelDirectory : null,
            selectedBackend: model.unsupported === true ? null : model.backend,
            model
        };
    }

    async function start(payload = {}) {
        const currentHealth = health();
        const decision = resolveVideoEngine({ policy, health: currentHealth });
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
        const model = currentHealth.model || resolveLocalVideoModelProfile({ env, hardware: currentHealth });
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
        if (references.length > Number(model.maximumReferenceAssets || 0)) {
            return {
                ok: false,
                status: "LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED",
                error: "LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED",
                backend: model.backend,
                model: model.model,
                referenceAssetCount: references.length,
                maximumReferenceAssets: Number(model.maximumReferenceAssets || 0),
                retryable: false,
                externalApiUsed: false,
                externalEstimatedCostUsd: 0
            };
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
            modelDirectory: path.resolve(env.JARVIS_LOCAL_VIDEO_MODEL_DIR),
            script,
            prompts,
            aspectRatio: payload.aspectRatio === "16:9" ? "16:9" : "9:16",
            output: output.normalized,
            outputFile: output.resolved,
            referenceOutputs: references.map(item => item.output),
            referenceFiles: references.map(item => item.file),
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
            createdAt: now().toISOString(),
            updatedAt: now().toISOString(),
            engine: "local",
            provider: "local",
            backend: model.backend,
            model: model.model,
            externalApiUsed: false,
            externalEstimatedCostUsd: 0
        };
        atomicJsonWrite(operationPath, operation);

        const runner = commandPath(env.JARVIS_LOCAL_VIDEO_RUNNER, env);
        const runnerScript = path.resolve(env.JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT);
        const args = [runnerScript, "--job", jobFile, "--result", resultFile];
        const runnerEnvironment = offlineLocalVideoEnvironment(env);
        if (currentHealth.gpuIndex !== null && currentHealth.gpuIndex !== undefined) {
            runnerEnvironment.CUDA_VISIBLE_DEVICES = String(currentHealth.gpuIndex);
        }
        const onExit = exitCode => {
            try {
                const current = readJson(operationPath);
                if (["SUCCEEDED", "CANCELLED"].includes(current.state)) return;
                const resultReady = fs.existsSync(resultFile);
                saveOperation(operationPath, current, {
                    state: resultReady ? "RESULT_READY" : "FAILED",
                    status: resultReady ? "LOCAL_VIDEO_RESULT_READY" : "LOCAL_VIDEO_RUNNER_EXITED_WITHOUT_RESULT",
                    exitCode: Number(exitCode),
                    retryable: !resultReady
                });
            }
            catch {}
            children.delete(operationId);
        };
        const onError = error => {
            try {
                const current = readJson(operationPath);
                saveOperation(operationPath, current, {
                    state: "FAILED",
                    status: "LOCAL_VIDEO_RUNNER_START_FAILED",
                    error: error?.message || "LOCAL_VIDEO_RUNNER_START_FAILED",
                    retryable: true
                });
            }
            catch {}
            children.delete(operationId);
        };
        try {
            const child = launch
                ? launch({
                    command: runner,
                    args,
                    cwd: resolvedRoot,
                    env: runnerEnvironment,
                    job,
                    jobFile,
                    resultFile,
                    onExit,
                    onError
                })
                : spawn(runner, args, {
                    cwd: resolvedRoot,
                    stdio: "ignore",
                    windowsHide: true,
                    env: runnerEnvironment
                });
            if (!launch) {
                child.once("exit", onExit);
                child.once("error", onError);
            }
            children.set(operationId, child);
            operation = saveOperation(operationPath, operation, { pid: Number(child?.pid || 0) || null });
        }
        catch(error) {
            operation = saveOperation(operationPath, operation, {
                state: "FAILED",
                status: "LOCAL_VIDEO_RUNNER_START_FAILED",
                error: error?.message || "LOCAL_VIDEO_RUNNER_START_FAILED",
                retryable: true
            });
            return { ...operation, ok: false, done: true };
        }
        return { ...operation, ok: true, done: false };
    }

    async function poll({ operationName } = {}) {
        let loaded;
        try { loaded = loadOperation(operationName); }
        catch(error) { return { ok: false, status: error.message, error: error.message }; }
        let { operation } = loaded;
        if (operation.state === "SUCCEEDED") return { ...operation.result, ok: true, done: true };
        if (["FAILED", "CANCELLED"].includes(operation.state) && !fs.existsSync(operation.resultFile)) {
            return { ...operation, ok: false, done: true, error: operation.error || operation.status };
        }
        if (!fs.existsSync(operation.resultFile)) {
            if (operation.state === "RUNNING" && isOperationStale(operation)) {
                operation = failStaleOperation(loaded.file, operation);
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
            return { ...operation, ok: false, done: true };
        }
        if (result?.ok !== true) {
            operation = saveOperation(loaded.file, operation, {
                state: "FAILED",
                status: result?.status || "LOCAL_VIDEO_GENERATION_FAILED",
                error: result?.error || result?.status || "LOCAL_VIDEO_GENERATION_FAILED",
                retryable: result?.retryable === true
            });
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
            const model = operation.model;
            const backend = operation.backend;
            const artifact = registerArtifact({
                root: resolvedRoot,
                output: output.normalized,
                metadata: {
                    type: "video",
                    origin: "video.generate",
                    provider: "local",
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
            const verified = {
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
                artifactId: artifact.artifactId,
                artifact
            };
            operation = saveOperation(loaded.file, operation, {
                state: "SUCCEEDED",
                status: verified.status,
                result: verified
            });
            return verified;
        }
        catch(error) {
            operation = saveOperation(loaded.file, operation, {
                state: "FAILED",
                status: error.message || "LOCAL_VIDEO_PHYSICAL_VERIFICATION_FAILED",
                error: error.message || "LOCAL_VIDEO_PHYSICAL_VERIFICATION_FAILED"
            });
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
        return { ...operation, ok: true, done: true };
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

    function authorizeExternalCall({ operationKey = "video.generate", estimatedCostUsd } = {}) {
        const cost = finiteBudget(estimatedCostUsd, policy.externalEstimatedCostUsdPerCall);
        if (policy.mode === "LOCAL_TEST" || policy.mode === "LOCAL_ONLY") {
            return {
                ok: false,
                status: "EXTERNAL_VIDEO_CALL_FORBIDDEN_BY_POLICY",
                error: "EXTERNAL_VIDEO_CALL_FORBIDDEN_BY_POLICY",
                externalApiUsed: false,
                externalEstimatedCostUsd: 0
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
                ok: false,
                status: "EXTERNAL_VIDEO_BUDGET_EXCEEDED",
                error: "EXTERNAL_VIDEO_BUDGET_EXCEEDED",
                externalApiUsed: false,
                externalEstimatedCostUsd: cost
            };
        }
        daily.calls += 1;
        daily.costUsd = nextDailyCost;
        daily.operations[safeKey] = { calls: current.calls + 1, costUsd: nextOperationCost };
        atomicJsonWrite(file, daily);
        return {
            ok: true,
            status: "EXTERNAL_VIDEO_CALL_AUTHORIZED",
            provider: "google-veo",
            model: "veo-3.1-generate-001",
            reasonForExternalUse: policy.mode === "CURRENT_STABLE"
                ? "CURRENT_STABLE"
                : "LOCAL_FALLBACK",
            externalApiUsed: true,
            externalEstimatedCostUsd: cost,
            dailyCostUsd: nextDailyCost,
            operationCostUsd: nextOperationCost
        };
    }

    return {
        version: JARVIS_LOCAL_VIDEO_ENGINE_VERSION,
        policy,
        health,
        resolve: () => resolveVideoEngine({ policy, health: health() }),
        authorizeExternalCall,
        start,
        poll,
        cancel,
        cleanup
    };
}
