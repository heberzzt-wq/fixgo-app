import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";

import { registerArtifact } from "./jarvis-artifact-studio.js";

export const JARVIS_LOCAL_VIDEO_ENGINE_VERSION = "1.0.0-v142-progressive-internal-first";
export const VIDEO_ENGINE_MODES = Object.freeze([
    "CURRENT_STABLE",
    "LOCAL_TEST",
    "LOCAL_PREFERRED",
    "LOCAL_ONLY"
]);
export const LOCAL_VIDEO_MODEL_PROFILE = Object.freeze({
    id: "Wan-AI/Wan2.2-TI2V-5B",
    model: "Wan2.2-TI2V-5B",
    provider: "local",
    license: "Apache-2.0",
    textToVideo: true,
    imageToVideo: true,
    referenceAssets: true,
    targetResolution: "720p",
    targetFps: 24,
    minimumVramGb: 24,
    checkpointSizeGb: 34.2,
    minimumFreeDiskGb: 45,
    officialRepository: "https://github.com/Wan-Video/Wan2.2",
    officialWeights: "https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B"
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

function normalizedMode(value) {
    const mode = String(value || "CURRENT_STABLE").trim().toUpperCase();
    return VIDEO_ENGINE_MODES.includes(mode) ? mode : "CURRENT_STABLE";
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
    let driver = null;
    let vramGb = 0;
    if (nvidiaSmi) {
        try {
            const raw = execFileSync(nvidiaSmi, [
                "--query-gpu=name,memory.total,driver_version",
                "--format=csv,noheader,nounits"
            ], { encoding: "utf8", windowsHide: true, timeout: 10000 })
                .split(/\r?\n/)
                .map(value => value.trim())
                .filter(Boolean)[0];
            const [name, memoryMb, driverVersion] = String(raw || "").split(",").map(value => value.trim());
            gpuName = name || null;
            vramGb = Number(memoryMb || 0) / 1024;
            driver = driverVersion || null;
        }
        catch {}
    }
    const ffmpeg = commandPath(env.JARVIS_FFMPEG_PATH || "ffmpeg", env);
    const ffprobe = commandPath(env.JARVIS_FFPROBE_PATH || "ffprobe", env);
    const python = commandPath(env.JARVIS_LOCAL_VIDEO_RUNNER || "python", env);
    const docker = commandPath("docker", env);
    const wsl = commandPath("wsl", env);
    const freeDiskGb = diskFreeGb(root);
    const cudaAvailable = Boolean(nvidiaSmi && vramGb > 0);
    const ready = cudaAvailable &&
        vramGb >= LOCAL_VIDEO_MODEL_PROFILE.minimumVramGb &&
        freeDiskGb >= LOCAL_VIDEO_MODEL_PROFILE.minimumFreeDiskGb &&
        Boolean(ffmpeg) && Boolean(ffprobe);
    const blockingReasons = [];
    if (!cudaAvailable) blockingReasons.push("LOCAL_VIDEO_CUDA_UNAVAILABLE");
    if (vramGb < LOCAL_VIDEO_MODEL_PROFILE.minimumVramGb) blockingReasons.push("LOCAL_VIDEO_VRAM_INSUFFICIENT");
    if (freeDiskGb < LOCAL_VIDEO_MODEL_PROFILE.minimumFreeDiskGb) blockingReasons.push("LOCAL_VIDEO_DISK_INSUFFICIENT");
    if (!ffmpeg || !ffprobe) blockingReasons.push("LOCAL_VIDEO_FFMPEG_UNAVAILABLE");
    let status = "LOCAL_VIDEO_HARDWARE_READY";
    if (!cudaAvailable) status = "LOCAL_VIDEO_CUDA_UNAVAILABLE";
    else if (vramGb < LOCAL_VIDEO_MODEL_PROFILE.minimumVramGb) status = "LOCAL_VIDEO_VRAM_INSUFFICIENT";
    else if (freeDiskGb < LOCAL_VIDEO_MODEL_PROFILE.minimumFreeDiskGb) status = "LOCAL_VIDEO_DISK_INSUFFICIENT";
    else if (!ffmpeg || !ffprobe) status = "LOCAL_VIDEO_FFMPEG_UNAVAILABLE";
    return {
        ok: ready,
        status,
        gpuName,
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
        modelRequirements: LOCAL_VIDEO_MODEL_PROFILE
    };
}

export function buildLocalAiCapabilityReport({
    root = process.cwd(),
    env = process.env,
    hardware = inspectLocalVideoHardware({ root, env })
} = {}) {
    const policy = describeLocalVideoPolicy(env);
    const localVideoSupported = hardware.ok === true;
    return {
        reportType: "LOCAL_AI_CAPABILITY_REPORT",
        schemaVersion: JARVIS_LOCAL_VIDEO_ENGINE_VERSION,
        generatedAt: new Date().toISOString(),
        root: path.resolve(root),
        policy,
        hardware,
        selectedVideoModel: LOCAL_VIDEO_MODEL_PROFILE,
        localVideoReadiness: {
            supported: localVideoSupported,
            status: hardware.status,
            physicalMp4Authorized: localVideoSupported,
            installationAuthorized: false,
            reason: localVideoSupported
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

    function health() {
        const hardware = inspectHardware();
        const runner = commandPath(env.JARVIS_LOCAL_VIDEO_RUNNER, env);
        const runnerScript = path.resolve(String(env.JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT || ""));
        const modelDirectory = path.resolve(String(env.JARVIS_LOCAL_VIDEO_MODEL_DIR || ""));
        let status = hardware.status;
        let ok = hardware.ok === true;
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
            model: LOCAL_VIDEO_MODEL_PROFILE
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
            model: LOCAL_VIDEO_MODEL_PROFILE.model,
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
            createdAt: now().toISOString(),
            updatedAt: now().toISOString(),
            engine: "local",
            provider: "local",
            model: LOCAL_VIDEO_MODEL_PROFILE.model,
            externalApiUsed: false,
            externalEstimatedCostUsd: 0
        };
        atomicJsonWrite(operationPath, operation);

        const runner = commandPath(env.JARVIS_LOCAL_VIDEO_RUNNER, env);
        const runnerScript = path.resolve(env.JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT);
        const args = [runnerScript, "--job", jobFile, "--result", resultFile];
        const runnerEnvironment = offlineLocalVideoEnvironment(env);
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
            const output = safeOutput(resolvedRoot, result.output || operation.output);
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
            const sha256 = createHash("sha256").update(fs.readFileSync(output.resolved)).digest("hex");
            const artifact = registerArtifact({
                root: resolvedRoot,
                output: output.normalized,
                metadata: {
                    type: "video",
                    origin: "video.generate",
                    provider: "local",
                    model: result.model || LOCAL_VIDEO_MODEL_PROFILE.model,
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
                model: result.model || LOCAL_VIDEO_MODEL_PROFILE.model,
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
