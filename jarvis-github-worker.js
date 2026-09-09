import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BRIDGE_URL = process.env.JARVIS_FS_BRIDGE_URL || "http://localhost:3344";
const REMOTE = process.env.SIA7_REMOTE || "origin";
const BRANCH = process.env.SIA7_BRANCH || "v94-media-v4n-negative-claims";
const JOB_PATH = process.env.SIA7_JOB_PATH || ".sia7/remote-job.json";
const RESULT_PATH = process.env.SIA7_RESULT_PATH || ".sia7/remote-result.json";
const POLL_MS = Number(process.env.SIA7_POLL_MS) || 5000;
const REPO_ROOT = path.resolve(process.cwd());
const SIA7_HUMO_MAX_COMPUTE_USD = 3;
const SIA7_HUMO_MONTHLY_STORAGE_USD = 3.5;
const SIA7_HUMO_SOURCE_ROOT = path.resolve(REPO_ROOT, "..", "fixgo-v142-local-first-20260825");
const SIA7_HUMO_REFERENCE_OUTPUT = ".jarvis-artifacts/uploads/1787783430100-a3151d2eefde-IMG_20240807_165633505_HDR-2.jpg";
const SIA7_HUMO_REFERENCE_SHA256 = "a3151d2eefde02659f80deb64277a68ac55f3cfebb5fcb68019d6eb05678e958";
const SIA7_HUMO_REFERENCE_OUTPUT_2 = ".jarvis-artifacts/uploads/1787783430832-b401b4761075-IMG_20241216_111105551_HDR.jpg";
const SIA7_HUMO_REFERENCE_SHA256_2 = "b401b476107521d9e3de3b267885bf91de956b644072a01e7373ab5476a3b6f3";
const SIA7_HUMO_AUDIO_OUTPUT = ".jarvis-artifacts/audio/humo-heberto-minidrama-good-voice-8s.wav";
const SIA7_HUMO_AUDIO_SHA256 = "9a075a37c56b6e0cd828a9b2a37a2fe3ee3f01c28cc7483f6a5d97ff96bd2bd5";
const SIA7_HUMO_MINIDRAMA_SOURCE_SHA256 = "7fe58e7e4ec425aa556b57263b8a5b3173683e23a13cabc74e50b16f7084301d";
const SIA7_HUMO_MINIDRAMA_SOURCE_PREFIX = "mini-drama-1787639542914";
const SIA7_HUMO_OUTPUT = ".jarvis-artifacts/videos/humo-heberto-identity-probe-8s.mp4";
const SIA7_HUMO_CHARACTER_ID = "CHAR_HEBERTO";
const WINDOWS_GIT = "C:\\Program Files\\Git\\cmd\\git.exe";
const GIT_EXECUTABLE = String(process.env.SIA7_GIT || "").trim() ||
    (process.platform === "win32" && fs.existsSync(WINDOWS_GIT) ? WINDOWS_GIT : "git");

function runGit(args = []) {
    return new Promise(resolve => {
        const child = spawn(GIT_EXECUTABLE, args, {
            cwd: REPO_ROOT,
            shell: false,
            windowsHide: true,
            timeout: 45000,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", chunk => {
            stdout = (stdout + chunk.toString()).slice(-2 * 1024 * 1024);
        });

        child.stderr.on("data", chunk => {
            stderr = (stderr + chunk.toString()).slice(-2 * 1024 * 1024);
        });

        child.on("error", error => {
            resolve({ ok: false, error: error.message, stdout, stderr });
        });

        child.on("close", code => {
            resolve({ ok: code === 0, code, stdout, stderr });
        });
    });
}

function resolveRepoFile(file = "") {
    const normalized = String(file || "").trim().replace(/\\/g, "/");

    if (!normalized) throw new Error("PATCH_FILE_REQUIRED");
    if (path.isAbsolute(normalized)) {
        throw new Error("PATCH_ABSOLUTE_PATH_NOT_ALLOWED");
    }

    const target = path.resolve(REPO_ROOT, normalized);

    if (target !== REPO_ROOT && !target.startsWith(REPO_ROOT + path.sep)) {
        throw new Error("PATCH_PATH_OUTSIDE_REPO");
    }

    return { normalized, target };
}

function countExactMatches(source = "", search = "") {
    if (!search) return 0;

    let count = 0;
    let offset = 0;

    while (offset <= source.length) {
        const index = source.indexOf(search, offset);
        if (index === -1) break;
        count += 1;
        offset = index + Math.max(search.length, 1);
    }

    return count;
}

async function readRemoteJob() {
    const fetchResult = await runGit(["fetch", "--quiet", REMOTE, BRANCH]);

    if (!fetchResult.ok) {
        throw new Error(
            `REMOTE_FETCH_FAILED: ${fetchResult.stderr || fetchResult.error || "unknown"}`
        );
    }

    const showResult = await runGit([
        "show",
        `${REMOTE}/${BRANCH}:${JOB_PATH}`
    ]);

    if (!showResult.ok) return null;
    return JSON.parse(showResult.stdout);
}

async function readRemoteResultJobId() {
    const showResult = await runGit([
        "show",
        `${REMOTE}/${BRANCH}:${RESULT_PATH}`
    ]);
    if (!showResult.ok) return "";
    try {
        return String(JSON.parse(showResult.stdout)?.jobId || "").trim();
    }
    catch {
        return "";
    }
}

async function syncLocalBranch() {
    const syncResult = await runGit([
        "pull",
        "--rebase",
        "--autostash",
        REMOTE,
        BRANCH
    ]);

    if (!syncResult.ok) {
        throw new Error(
            `RESULT_SYNC_FAILED: ${syncResult.stderr || syncResult.error || "unknown"}`
        );
    }
}

async function publishRemoteResult(result = {}) {
    await paidProgressPublication;
    const stagePaths = [RESULT_PATH];

    if (
        result.operation === "patch" &&
        result.dryRun === false &&
        result.file
    ) {
        const { normalized } = resolveRepoFile(result.file);
        stagePaths.push(normalized);
    }

    const publishPayload = {
        ...result,
        committedFiles: [
            ...stagePaths
        ]
    };

    const resultFile = path.resolve(REPO_ROOT, RESULT_PATH);
    fs.mkdirSync(path.dirname(resultFile), { recursive: true });
    fs.writeFileSync(
        resultFile,
        JSON.stringify(publishPayload, null, 2) + "\n",
        "utf8"
    );

    const addResult = await runGit(["add", "--", ...stagePaths]);
    if (!addResult.ok) {
        throw new Error(
            `RESULT_GIT_ADD_FAILED: ${addResult.stderr || addResult.error || "unknown"}`
        );
    }

    const commitResult = await runGit([
        "commit",
        "-m",
        `SIA7 result ${String(result.jobId || "unknown").slice(0, 80)}`
    ]);

    if (!commitResult.ok) {
        const output = `${commitResult.stdout}\n${commitResult.stderr}`.toLowerCase();
        if (!output.includes("nothing to commit") && !output.includes("nothing added to commit")) {
            throw new Error(
                `RESULT_GIT_COMMIT_FAILED: ${commitResult.stderr || commitResult.error || "unknown"}`
            );
        }
    }

    const pushResult = await runGit(["push", REMOTE, BRANCH]);
    if (!pushResult.ok) {
        throw new Error(
            `RESULT_GIT_PUSH_FAILED: ${pushResult.stderr || pushResult.error || "unknown"}`
        );
    }
}

function normalizeEndpoint(value = "") {
    const endpoint = String(value || "").trim();
    const allowed = new Set(["/health", "/read", "/grep", "/git", "/run"]);

    if (!allowed.has(endpoint)) {
        throw new Error("WORKER_ENDPOINT_NOT_ALLOWED");
    }

    return endpoint;
}

async function executeBridgeJob(job = {}) {
    const endpoint = normalizeEndpoint(job.endpoint || "/health");
    const method = endpoint === "/health" ? "GET" : "POST";

    const response = await fetch(`${BRIDGE_URL}${endpoint}`, {
        method,
        headers:
            method === "POST"
                ? { "content-type": "application/json" }
                : undefined,
        body:
            method === "POST"
                ? JSON.stringify(job.body || {})
                : undefined
    });

    const payload = await response.json();

    return {
        ok: response.ok && payload?.ok !== false,
        httpStatus: response.status,
        endpoint,
        payload
    };
}

function executePatchJob(job = {}) {
    const patch = job.patch || job.body || {};
    const dryRun = patch.dryRun === true;

    if (
        !dryRun &&
        job.humanApproved !== true &&
        patch.humanApproved !== true
    ) {
        throw new Error("PATCH_HUMAN_APPROVAL_REQUIRED");
    }

    const { normalized, target } = resolveRepoFile(patch.file);

    if (!fs.existsSync(target)) {
        throw new Error("PATCH_FILE_NOT_FOUND");
    }

    const search = String(patch.search || "");
    const replace = String(patch.replace || "");

    if (!search) throw new Error("PATCH_SEARCH_REQUIRED");

    const source = fs.readFileSync(target, "utf8");
    const matchCount = countExactMatches(source, search);
    const expectedMatches = Number(patch.expectedMatches || 1);

    if (matchCount !== expectedMatches) {
        throw new Error(
            `PATCH_MATCH_COUNT_MISMATCH:${matchCount}:${expectedMatches}`
        );
    }

    const next = source.replace(search, replace);
    if (next === source) throw new Error("PATCH_NO_CHANGE");

    if (!dryRun) {
        fs.writeFileSync(target, next, "utf8");
    }

    return {
        ok: true,
        operation: "patch",
        dryRun,
        file: normalized,
        matchCount,
        expectedMatches,
        bytesBefore: Buffer.byteLength(source, "utf8"),
        bytesAfter: Buffer.byteLength(next, "utf8"),
        source: "sia7_github_worker_exact_patch_v1"
    };
}

function sha256File(file) {
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function findHuMoMiniDramaSource() {
    const artifactRoot = path.resolve(SIA7_HUMO_SOURCE_ROOT, ".jarvis-artifacts");
    if (!fs.existsSync(artifactRoot) || !fs.statSync(artifactRoot).isDirectory()) {
        throw new Error("SIA7_HUMO_ARTIFACT_ROOT_MISSING");
    }
    const prefix = SIA7_HUMO_MINIDRAMA_SOURCE_PREFIX.toLowerCase();
    const stack = [artifactRoot];
    const candidates = [];
    let visited = 0;
    while (stack.length > 0) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            visited += 1;
            if (visited > 5000) throw new Error("SIA7_HUMO_ARTIFACT_SCAN_LIMIT_EXCEEDED");
            const target = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(target);
                continue;
            }
            if (!entry.isFile()) continue;
            const name = entry.name.toLowerCase();
            if (!name.startsWith(prefix) || path.extname(name) !== ".mp4") continue;
            if (sha256File(target) === SIA7_HUMO_MINIDRAMA_SOURCE_SHA256) candidates.push(target);
        }
    }
    if (candidates.length !== 1) {
        throw new Error(`SIA7_HUMO_MINIDRAMA_SOURCE_MATCH_COUNT:${candidates.length}`);
    }
    return candidates[0];
}

function runLocalProcess(command, args = [], { cwd = REPO_ROOT, timeoutMs = 120000, env = process.env, onLine = () => {} } = {}) {
    return new Promise(resolve => {
        const child = spawn(command, args, {
            cwd,
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...env }
        });
        let stdout = "";
        let stderr = "";
        const append = (current, chunk) => (current + chunk.toString()).slice(-1024 * 1024);
        let lineBuffer="";
        child.stdout.on("data", chunk => {
            stdout=append(stdout,chunk);lineBuffer=(lineBuffer+chunk.toString()).slice(-1024*1024);
            let end;while((end=lineBuffer.indexOf("\n"))>=0){const line=lineBuffer.slice(0,end);lineBuffer=lineBuffer.slice(end+1);try{onLine(line);}catch{console.error("SIA7_PROGRESS_PERSIST_FAILED");}}
        });
        child.stderr.on("data", chunk => { stderr = append(stderr, chunk); });
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill("SIGTERM");
            resolve({ ok: false, code: null, stdout, stderr, timeout: true });
        }, timeoutMs);
        child.on("error", error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ok: false, code: null, stdout, stderr, error: error.message });
        });
        child.on("close", code => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ok: code === 0, code, stdout, stderr });
        });
    });
}

async function executeHuMoReferenceAudioPrepJob(job = {}) {
    if (job.humanApproved !== true) throw new Error("SIA7_HUMO_AUDIO_PREP_HUMAN_APPROVAL_REQUIRED");
    if (process.platform !== "win32") throw new Error("SIA7_HUMO_WINDOWS_WORKER_REQUIRED");
    if (!fs.existsSync(SIA7_HUMO_SOURCE_ROOT) || !fs.statSync(SIA7_HUMO_SOURCE_ROOT).isDirectory()) {
        throw new Error("SIA7_HUMO_SOURCE_ROOT_MISSING");
    }
    const userProfile = String(process.env.USERPROFILE || "").trim();
    const downloadedAudioFile = userProfile
        ? path.resolve(userProfile, "Downloads", "humo-heberto-minidrama-good-voice-8s.wav")
        : "";
    if (downloadedAudioFile && fs.existsSync(downloadedAudioFile) && fs.statSync(downloadedAudioFile).isFile()) {
        const downloadedBytes = fs.readFileSync(downloadedAudioFile);
        if (downloadedBytes.length !== 256078) {
            throw new Error(`SIA7_HUMO_GOOD_VOICE_DOWNLOAD_BYTES_INVALID:${downloadedBytes.length}`);
        }
        const downloadedSha256 = createHash("sha256").update(downloadedBytes).digest("hex");
        if (downloadedSha256 !== SIA7_HUMO_AUDIO_SHA256) {
            throw new Error(`SIA7_HUMO_GOOD_VOICE_DOWNLOAD_SHA_MISMATCH:${downloadedSha256}`);
        }
        if (downloadedBytes.subarray(0, 4).toString("ascii") !== "RIFF" || downloadedBytes.subarray(8, 12).toString("ascii") !== "WAVE") {
            throw new Error("SIA7_HUMO_GOOD_VOICE_WAV_INVALID");
        }
        const outputFile = path.resolve(SIA7_HUMO_SOURCE_ROOT, SIA7_HUMO_AUDIO_OUTPUT);
        const sourceRootPrefix = SIA7_HUMO_SOURCE_ROOT.endsWith(path.sep) ? SIA7_HUMO_SOURCE_ROOT : SIA7_HUMO_SOURCE_ROOT + path.sep;
        if (!outputFile.startsWith(sourceRootPrefix)) throw new Error("SIA7_HUMO_AUDIO_OUTPUT_OUTSIDE_SOURCE_ROOT");
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        const temporaryFile = outputFile + ".partial.wav";
        fs.rmSync(temporaryFile, { force: true });
        fs.writeFileSync(temporaryFile, downloadedBytes);
        if (sha256File(temporaryFile) !== SIA7_HUMO_AUDIO_SHA256) {
            fs.rmSync(temporaryFile, { force: true });
            throw new Error("SIA7_HUMO_GOOD_VOICE_POST_WRITE_SHA_MISMATCH");
        }
        fs.rmSync(outputFile, { force: true });
        fs.renameSync(temporaryFile, outputFile);
        return {
            ok: true,
            operation: "humo_reference_audio_prepare",
            dryRun: false,
            status: "SIA7_HUMO_GOOD_VOICE_REFERENCE_READY",
            sourceVideoOutput: null,
            sourceVideoSha256: SIA7_HUMO_MINIDRAMA_SOURCE_SHA256,
            materializationSource: "verified_user_download",
            audioOutput: SIA7_HUMO_AUDIO_OUTPUT,
            audioSha256: downloadedSha256,
            bytes: downloadedBytes.length,
            durationSeconds: 8.0,
            sampleRateHz: 16000,
            channels: 1,
            externalApiUsed: false,
            gpuRentalSeconds: 0,
            gpuRentalEstimatedCost: 0
        };
    }
    const inlineAudioBase64 = String(job.audioBase64 || "").trim();
    if (inlineAudioBase64) {
        if (inlineAudioBase64.length > 400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(inlineAudioBase64)) {
            throw new Error("SIA7_HUMO_GOOD_VOICE_BASE64_INVALID");
        }
        const audioBytes = Buffer.from(inlineAudioBase64, "base64");
        if (audioBytes.length !== 256078) {
            throw new Error(`SIA7_HUMO_GOOD_VOICE_BYTES_INVALID:${audioBytes.length}`);
        }
        const inlineSha256 = createHash("sha256").update(audioBytes).digest("hex");
        if (inlineSha256 !== SIA7_HUMO_AUDIO_SHA256) {
            throw new Error(`SIA7_HUMO_GOOD_VOICE_SHA_MISMATCH:${inlineSha256}`);
        }
        if (audioBytes.subarray(0, 4).toString("ascii") !== "RIFF" || audioBytes.subarray(8, 12).toString("ascii") !== "WAVE") {
            throw new Error("SIA7_HUMO_GOOD_VOICE_WAV_INVALID");
        }
        const outputFile = path.resolve(SIA7_HUMO_SOURCE_ROOT, SIA7_HUMO_AUDIO_OUTPUT);
        const sourceRootPrefix = SIA7_HUMO_SOURCE_ROOT.endsWith(path.sep) ? SIA7_HUMO_SOURCE_ROOT : SIA7_HUMO_SOURCE_ROOT + path.sep;
        if (!outputFile.startsWith(sourceRootPrefix)) throw new Error("SIA7_HUMO_AUDIO_OUTPUT_OUTSIDE_SOURCE_ROOT");
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        const temporaryFile = outputFile + ".partial.wav";
        fs.rmSync(temporaryFile, { force: true });
        fs.writeFileSync(temporaryFile, audioBytes);
        if (sha256File(temporaryFile) !== SIA7_HUMO_AUDIO_SHA256) {
            fs.rmSync(temporaryFile, { force: true });
            throw new Error("SIA7_HUMO_GOOD_VOICE_POST_WRITE_SHA_MISMATCH");
        }
        fs.rmSync(outputFile, { force: true });
        fs.renameSync(temporaryFile, outputFile);
        return {
            ok: true,
            operation: "humo_reference_audio_prepare",
            dryRun: false,
            status: "SIA7_HUMO_GOOD_VOICE_REFERENCE_READY",
            sourceVideoOutput: null,
            sourceVideoSha256: SIA7_HUMO_MINIDRAMA_SOURCE_SHA256,
            materializationSource: "chat_user_uploaded_minidrama_pcm_extract",
            audioOutput: SIA7_HUMO_AUDIO_OUTPUT,
            audioSha256: inlineSha256,
            bytes: audioBytes.length,
            durationSeconds: 8.0,
            sampleRateHz: 16000,
            channels: 1,
            externalApiUsed: false,
            gpuRentalSeconds: 0,
            gpuRentalEstimatedCost: 0
        };
    }
    const sourceVideoFile = findHuMoMiniDramaSource();
    const outputFile = path.resolve(SIA7_HUMO_SOURCE_ROOT, SIA7_HUMO_AUDIO_OUTPUT);
    const sourceRootPrefix = SIA7_HUMO_SOURCE_ROOT.endsWith(path.sep) ? SIA7_HUMO_SOURCE_ROOT : SIA7_HUMO_SOURCE_ROOT + path.sep;
    if (!outputFile.startsWith(sourceRootPrefix)) throw new Error("SIA7_HUMO_AUDIO_OUTPUT_OUTSIDE_SOURCE_ROOT");
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    const temporaryFile = outputFile + ".partial.wav";
    fs.rmSync(temporaryFile, { force: true });
    const ffmpeg = String(process.env.JARVIS_FFMPEG_PATH || "ffmpeg").trim() || "ffmpeg";
    const result = await runLocalProcess(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-ss", "0", "-i", sourceVideoFile, "-t", "8",
        "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "pcm_s16le", temporaryFile
    ], { cwd: SIA7_HUMO_SOURCE_ROOT, timeoutMs: 120000 });
    if (!result.ok) {
        fs.rmSync(temporaryFile, { force: true });
        throw new Error(`SIA7_HUMO_GOOD_VOICE_EXTRACTION_FAILED:${result.code ?? "NA"}:${String(result.stderr || result.error || "").slice(-500)}`);
    }
    if (!fs.existsSync(temporaryFile) || !fs.statSync(temporaryFile).isFile()) {
        throw new Error("SIA7_HUMO_GOOD_VOICE_OUTPUT_MISSING");
    }
    const bytes = fs.statSync(temporaryFile).size;
    if (bytes < 250000 || bytes > 270000) throw new Error(`SIA7_HUMO_GOOD_VOICE_BYTES_INVALID:${bytes}`);
    const header = fs.readFileSync(temporaryFile).subarray(0, 12);
    if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") {
        throw new Error("SIA7_HUMO_GOOD_VOICE_WAV_INVALID");
    }
    const sha256 = sha256File(temporaryFile);
    if (sha256 !== SIA7_HUMO_AUDIO_SHA256) {
        fs.rmSync(temporaryFile, { force: true });
        throw new Error(`SIA7_HUMO_GOOD_VOICE_SHA_MISMATCH:${sha256}`);
    }
    fs.rmSync(outputFile, { force: true });
    fs.renameSync(temporaryFile, outputFile);
    return {
        ok: true,
        operation: "humo_reference_audio_prepare",
        dryRun: false,
        status: "SIA7_HUMO_GOOD_VOICE_REFERENCE_READY",
        sourceVideoOutput: path.relative(SIA7_HUMO_SOURCE_ROOT, sourceVideoFile).replace(/\\/g, "/"),
        sourceVideoSha256: SIA7_HUMO_MINIDRAMA_SOURCE_SHA256,
        audioOutput: SIA7_HUMO_AUDIO_OUTPUT,
        audioSha256: sha256,
        bytes,
        durationSeconds: 8.0,
        sampleRateHz: 16000,
        channels: 1,
        externalApiUsed: false,
        gpuRentalSeconds: 0,
        gpuRentalEstimatedCost: 0
    };
}

const SIA7_WORKER_SOURCE_FILE = path.resolve(REPO_ROOT, "jarvis-github-worker.js");
const SIA7_WORKER_SOURCE_SHA256_AT_START = sha256File(SIA7_WORKER_SOURCE_FILE);

async function currentHeadSha() {
    const result = await runGit(["rev-parse", "HEAD"]);
    const sha = String(result.stdout || "").trim().toLowerCase();
    if (!result.ok || !/^[a-f0-9]{40}$/.test(sha)) throw new Error("SIA7_HUMO_EXECUTION_HEAD_INVALID");
    return sha;
}

async function validateHuMoIdentityProbeScope(job = {}) {
    const expectedBaseSha = String(job.expectedBaseSha || "").trim().toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(expectedBaseSha)) throw new Error("SIA7_HUMO_CERTIFIED_BASE_SHA_REQUIRED");
    const executionHeadSha = await currentHeadSha();
    const ancestor = await runGit(["merge-base", "--is-ancestor", expectedBaseSha, executionHeadSha]);
    if (!ancestor.ok) throw new Error("SIA7_HUMO_CERTIFIED_BASE_NOT_ANCESTOR");
    const diff = await runGit(["diff", "--name-only", `${expectedBaseSha}..${executionHeadSha}`]);
    if (!diff.ok) throw new Error("SIA7_HUMO_CERTIFIED_BASE_DIFF_FAILED");
    const changedFiles = String(diff.stdout || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (changedFiles.some(file => !file.startsWith(".sia7/"))) {
        throw new Error("SIA7_HUMO_EXECUTION_HEAD_HAS_UNCERTIFIED_CODE");
    }
    if (process.platform !== "win32") throw new Error("SIA7_HUMO_WINDOWS_WORKER_REQUIRED");
    if (!fs.existsSync(SIA7_HUMO_SOURCE_ROOT) || !fs.statSync(SIA7_HUMO_SOURCE_ROOT).isDirectory()) {
        throw new Error("SIA7_HUMO_SOURCE_ROOT_MISSING");
    }
    const referenceFile = path.resolve(SIA7_HUMO_SOURCE_ROOT, SIA7_HUMO_REFERENCE_OUTPUT);
    const secondReferenceFile = path.resolve(SIA7_HUMO_SOURCE_ROOT, SIA7_HUMO_REFERENCE_OUTPUT_2);
    const audioFile = path.resolve(SIA7_HUMO_SOURCE_ROOT, SIA7_HUMO_AUDIO_OUTPUT);
    if (!fs.existsSync(referenceFile) || !fs.statSync(referenceFile).isFile()) throw new Error("SIA7_HUMO_REFERENCE_MISSING");
    if (!fs.existsSync(secondReferenceFile) || !fs.statSync(secondReferenceFile).isFile()) throw new Error("SIA7_HUMO_REFERENCE_2_MISSING");
    if (!fs.existsSync(audioFile) || !fs.statSync(audioFile).isFile()) throw new Error("SIA7_HUMO_AUDIO_MISSING");
    if (sha256File(referenceFile) !== SIA7_HUMO_REFERENCE_SHA256) throw new Error("SIA7_HUMO_REFERENCE_SHA_MISMATCH");
    if (sha256File(secondReferenceFile) !== SIA7_HUMO_REFERENCE_SHA256_2) throw new Error("SIA7_HUMO_REFERENCE_2_SHA_MISMATCH");
    if (sha256File(audioFile) !== SIA7_HUMO_AUDIO_SHA256) throw new Error("SIA7_HUMO_AUDIO_SHA_MISMATCH");
    const localAppData = String(process.env.LOCALAPPDATA || "").trim();
    const credentialFile = path.join(localAppData, "PeninsulaTech", "Jarvis", "runpod-api-key.clixml");
    if (!localAppData || !fs.existsSync(credentialFile)) throw new Error("SIA7_HUMO_RUNPOD_DPAPI_CREDENTIAL_MISSING");
    if (!fs.existsSync(path.join(REPO_ROOT, "jarvis-fs-bridge.js"))) throw new Error("SIA7_HUMO_BRIDGE_SOURCE_MISSING");
    if (!fs.existsSync(path.join(REPO_ROOT, "node_modules"))) throw new Error("SIA7_HUMO_NODE_MODULES_MISSING");
    return { expectedBaseSha, executionHeadSha, changedFiles, referenceFile, audioFile, credentialFile };
}

function runHuMoIdentityProbeProcess(env) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["jarvis-fs-bridge.js", "--humo-identity-probe"], {
            cwd: REPO_ROOT,
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
            env
        });
        let stdout = "";
        let stderr = "";
        const append = (current, chunk) => (current + chunk.toString()).slice(-4 * 1024 * 1024);
        child.stdout.on("data", chunk => { stdout = append(stdout, chunk); });
        child.stderr.on("data", chunk => { stderr = append(stderr, chunk); });
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill("SIGTERM");
            reject(new Error("SIA7_HUMO_IDENTITY_PROBE_TIMEOUT"));
        }, 65 * 60 * 1000);
        child.on("error", error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", code => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const lines = `${stdout}\n${stderr}`.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
            let parsed = null;
            for (let index = lines.length - 1; index >= 0; index -= 1) {
                try {
                    const candidate = JSON.parse(lines[index]);
                    if (candidate && typeof candidate === "object") { parsed = candidate; break; }
                }
                catch {}
            }
            if (code !== 0 || parsed?.ok !== true) {
                const tail = lines.slice(-12).join(" | ").slice(-6000);
                reject(new Error(`SIA7_HUMO_IDENTITY_PROBE_FAILED:${parsed?.status || tail || code}`));
                return;
            }
            resolve({ code, parsed, logTail: lines.slice(-20) });
        });
    });
}

async function executeHuMoIdentityProbeJob(job = {}) {
    if (sha256File(SIA7_WORKER_SOURCE_FILE) !== SIA7_WORKER_SOURCE_SHA256_AT_START) {
        throw new Error("SIA7_WORKER_RESTART_REQUIRED");
    }
    const scope = await validateHuMoIdentityProbeScope(job);
    const hardBudgetUsd = Number(job.hardBudgetUsd);
    const monthlyStorageAuthorizedUsd = Number(job.monthlyStorageAuthorizedUsd);
    if (!Number.isFinite(hardBudgetUsd) || hardBudgetUsd <= 0 || hardBudgetUsd > SIA7_HUMO_MAX_COMPUTE_USD) {
        throw new Error("SIA7_HUMO_COMPUTE_BUDGET_INVALID");
    }
    if (Math.abs(monthlyStorageAuthorizedUsd - SIA7_HUMO_MONTHLY_STORAGE_USD) > 0.000001) {
        throw new Error("SIA7_HUMO_STORAGE_BUDGET_INVALID");
    }
    if (job.fullEpisodeAuthorized === true) throw new Error("SIA7_HUMO_FULL_EPISODE_NOT_AUTHORIZED");
    if (job.executePaid !== true) {
        return {
            ok: true,
            operation: "humo_identity_probe",
            dryRun: true,
            status: "SIA7_HUMO_IDENTITY_PREFLIGHT_READY",
            certifiedBaseSha: scope.expectedBaseSha,
            executionHeadSha: scope.executionHeadSha,
            controlPlaneOnlyChanges: scope.changedFiles,
            hardBudgetUsd,
            monthlyStorageAuthorizedUsd,
            characterId: SIA7_HUMO_CHARACTER_ID,
            durationSeconds: 3.88,
            referenceCount: 2,
            referenceSha256s: [SIA7_HUMO_REFERENCE_SHA256, SIA7_HUMO_REFERENCE_SHA256_2],
            audioSha256: SIA7_HUMO_AUDIO_SHA256,
            resourceCreationPossible: false
        };
    }
    if (job.humanApproved !== true) throw new Error("SIA7_HUMO_PAID_HUMAN_APPROVAL_REQUIRED");
    const childEnv = {
        ...process.env,
        JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "true",
        JARVIS_HUMO_IDENTITY_PROBE_PAID_EXECUTION_AUTHORIZED: "true",
        JARVIS_HUMO_IDENTITY_PROBE_HARD_BUDGET_USD: String(hardBudgetUsd),
        JARVIS_HUMO_IDENTITY_PROBE_DURATION_SECONDS: "8",
        JARVIS_HUMO_IDENTITY_PROBE_AUDIO_START_SECONDS: "0",
        JARVIS_HUMO_IDENTITY_PROBE_CHARACTER_ID: SIA7_HUMO_CHARACTER_ID,
        JARVIS_HUMO_IDENTITY_PROBE_SOURCE_ROOT: SIA7_HUMO_SOURCE_ROOT,
        JARVIS_HUMO_IDENTITY_PROBE_REFERENCE_OUTPUT: SIA7_HUMO_REFERENCE_OUTPUT,
        JARVIS_HUMO_IDENTITY_PROBE_REFERENCE_SHA256: SIA7_HUMO_REFERENCE_SHA256,
        JARVIS_HUMO_IDENTITY_PROBE_REFERENCE_OUTPUT_2: SIA7_HUMO_REFERENCE_OUTPUT_2,
        JARVIS_HUMO_IDENTITY_PROBE_REFERENCE_SHA256_2: SIA7_HUMO_REFERENCE_SHA256_2,
        JARVIS_HUMO_IDENTITY_PROBE_AUDIO_OUTPUT: SIA7_HUMO_AUDIO_OUTPUT,
        JARVIS_HUMO_IDENTITY_PROBE_AUDIO_SHA256: SIA7_HUMO_AUDIO_SHA256,
        JARVIS_HUMO_IDENTITY_PROBE_OUTPUT: SIA7_HUMO_OUTPUT,
        JARVIS_RUNPOD_CREATE_HUMO_NETWORK_VOLUME_AUTHORIZED: "true"
    };
    const execution = await runHuMoIdentityProbeProcess(childEnv);
    const result = execution.parsed;
    if (result.status !== "HUMO_IDENTITY_PROBE_COMPLETED_AND_RELEASED" || result.terminationVerified !== true) {
        throw new Error("SIA7_HUMO_IDENTITY_PROBE_CLOSEOUT_INVALID");
    }
    if (Number(result.gpuRentalEstimatedCost || 0) > hardBudgetUsd + 0.000001) {
        throw new Error("SIA7_HUMO_IDENTITY_PROBE_BUDGET_EXCEEDED");
    }
    return {
        ok: true,
        operation: "humo_identity_probe",
        dryRun: false,
        status: result.status,
        certifiedBaseSha: scope.expectedBaseSha,
        executionHeadSha: scope.executionHeadSha,
        controlPlaneOnlyChanges: scope.changedFiles,
        hardBudgetUsd,
        monthlyStorageAuthorizedUsd,
        characterId: result.characterId,
        durationSeconds: 3.88,
        referenceCount: 2,
        referenceSha256s: [SIA7_HUMO_REFERENCE_SHA256, SIA7_HUMO_REFERENCE_SHA256_2],
        audioSha256: SIA7_HUMO_AUDIO_SHA256,
        podId: result.podId,
        output: result.output,
        bytes: result.bytes,
        sha256: result.sha256,
        terminationVerified: result.terminationVerified === true,
        gpuRentalSeconds: Number(result.gpuRentalSeconds || 0),
        gpuRentalEstimatedCost: Number(result.gpuRentalEstimatedCost || 0),
        gpuRentalActualCost: Number(result.gpuRentalActualCost || 0),
        humanIdentityApproval: result.humanIdentityApproval || "PENDING",
        networkVolumeId: result.networkVolumeId || null,
        networkVolumeDataCenterId: result.networkVolumeDataCenterId || null,
        networkVolumeSizeGb: Number(result.networkVolumeSizeGb || 0),
        networkVolumeRetained: result.networkVolumeRetained === true,
        estimatedMonthlyStorageUsd: Number(result.estimatedMonthlyStorageUsd || 0),
        fullEpisodeAuthorized: false,
        logTail: execution.logTail
    };
}

export function buildHuMo17EarlyReceipt(jobId,value) {
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(value?.podId||""))throw new Error("SIA7_EARLY_POD_ID_INVALID");
    const safe={jobId};
    for(const key of ["operationId","podId","createdAt","hourlyRateUsd","hardBudgetUsd","providerBudgetKillSeconds","networkVolumeId","gpu","gpuCount","status","terminationVerified"])safe[key]=value[key];
    return safe;
}
let paidProgressPublication=Promise.resolve();
function recordPaidProgress(jobId,line) {
    let value;try{value=JSON.parse(line);}catch{return;}
    if(!["HUMO17_RUNTIME_GPU_POD_CREATED","HUMO17_CORE_CPU_POD_CREATED"].includes(value.status))return;
    const safe=buildHuMo17EarlyReceipt(jobId,value);
    const file=path.resolve(REPO_ROOT,".sia7/paid-progress.json");
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+".pending",JSON.stringify(safe,null,2));fs.renameSync(file+".pending",file);
    paidProgressPublication=paidProgressPublication.then(async()=>{
        for(const args of [["add","--",".sia7/paid-progress.json"],["commit","-m",`SIA7 paid Pod created ${jobId}`],["push",REMOTE,BRANCH]]) {
            const result=await runGit(args);if(!result.ok)throw new Error("SIA7_EARLY_POD_PUBLICATION_FAILED");
        }
    }).catch(error=>console.error(error.message));
}

async function executeHuMo17CoreStageJob(job = {}) {
    if (process.platform !== "win32") throw new Error("SIA7_HUMO17_WINDOWS_WORKER_REQUIRED");
    const hardBudgetUsd = Number(job.hardBudgetUsd ?? 1.5);
    const maximumMinutes = Number(job.maximumMinutes ?? 90);
    if (!Number.isFinite(hardBudgetUsd) || hardBudgetUsd <= 0 || hardBudgetUsd > SIA7_HUMO_MAX_COMPUTE_USD) {
        throw new Error("SIA7_HUMO17_CORE_STAGE_BUDGET_INVALID");
    }
    if (!Number.isFinite(maximumMinutes) || maximumMinutes < 5 || maximumMinutes > 90) {
        throw new Error("SIA7_HUMO17_CORE_STAGE_DURATION_INVALID");
    }
    const expectedBaseSha = String(job.expectedBaseSha || "").trim().toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(expectedBaseSha)) throw new Error("SIA7_HUMO17_CERTIFIED_BASE_SHA_REQUIRED");
    const executionHeadSha = await currentHeadSha();
    const ancestor = await runGit(["merge-base", "--is-ancestor", expectedBaseSha, executionHeadSha]);
    if (!ancestor.ok) throw new Error("SIA7_HUMO17_CERTIFIED_BASE_NOT_ANCESTOR");
    const diff = await runGit(["diff", "--name-only", `${expectedBaseSha}..${executionHeadSha}`]);
    if (!diff.ok) throw new Error("SIA7_HUMO17_CERTIFIED_BASE_DIFF_FAILED");
    const changedFiles = String(diff.stdout || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (changedFiles.some(file => !file.startsWith(".sia7/"))) {
        throw new Error("SIA7_HUMO17_EXECUTION_HEAD_HAS_UNCERTIFIED_CODE");
    }
    if (job.executePaid !== true) {
        return {
            ok: true,
            operation: "humo17_core_stage",
            dryRun: true,
            status: "SIA7_HUMO17_CORE_STAGE_PREFLIGHT_READY",
            certifiedBaseSha: expectedBaseSha,
            executionHeadSha,
            controlPlaneOnlyChanges: changedFiles,
            hardBudgetUsd,
            maximumMinutes,
            networkVolumeId: "1qm5wczocl",
            dataCenterId: "EU-NL-1",
            resourceCreationPossible: false,
            inferenceStarted: false
        };
    }
    if (job.humanApproved !== true) throw new Error("SIA7_HUMO17_CORE_STAGE_HUMAN_APPROVAL_REQUIRED");
    const execution = await runLocalProcess(
        process.execPath,
        ["jarvis-fs-bridge.js", "--humo17-core-stage"],
        {
            timeoutMs: Math.ceil((maximumMinutes + 5) * 60 * 1000),
            onLine: line=>recordPaidProgress(job.jobId,line),
            env: {
                ...process.env,
                JARVIS_HUMO17_CORE_STAGE_AUTHORIZED: "true",
                JARVIS_HUMO17_JOB_ID: String(job.jobId || ""),
                JARVIS_HUMO17_CORE_STAGE_HARD_BUDGET_USD: String(hardBudgetUsd),
                JARVIS_HUMO17_CORE_STAGE_MAX_MINUTES: String(maximumMinutes),
                JARVIS_RUNPOD_NETWORK_VOLUME_ID: "1qm5wczocl",
                JARVIS_RUNPOD_DATACENTER_ID: "EU-NL-1"
            }
        }
    );
    const lines = `${execution.stdout || ""}\n${execution.stderr || ""}`
        .split(/\r?\n/)
        .map(value => value.trim())
        .filter(Boolean);
    let parsed = null;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
            const candidate = JSON.parse(lines[index]);
            if (candidate && typeof candidate === "object") { parsed = candidate; break; }
        }
        catch {}
    }
    if (!execution.ok || parsed?.ok !== true || parsed?.status !== "HUMO17_PERSISTENT_CORE_STAGED_AND_RELEASED") {
        const error=new Error(`SIA7_HUMO17_CORE_STAGE_FAILED:${parsed?.status || lines.slice(-8).join(" | ") || execution.code}`);
        const dir=path.join(REPO_ROOT,".jarvis-artifacts");
        const receipts=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^humo17-(probe|core)-[a-f0-9-]+\.json$/.test(n)).map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8"))).filter(r=>r.jobId===job.jobId):[];
        error.evidence={phase:parsed?.status||"WORKER_PROCESS_FAILED",paidReceipts:receipts,logTail:lines.slice(-20)};
        throw error;
    }
    if (parsed.terminationVerified !== true || parsed.networkVolumeRetained !== true) {
        throw new Error("SIA7_HUMO17_CORE_STAGE_CLOSEOUT_INVALID");
    }
    if (Number(parsed.estimatedCostUsd || parsed.cpuRentalEstimatedCost || 0) > hardBudgetUsd + 0.000001) {
        throw new Error("SIA7_HUMO17_CORE_STAGE_BUDGET_EXCEEDED");
    }
    return {
        ...parsed,
        operation: "humo17_core_stage",
        dryRun: false,
        certifiedBaseSha: expectedBaseSha,
        executionHeadSha,
        controlPlaneOnlyChanges: changedFiles,
        hardBudgetUsd,
        maximumMinutes,
        logTail: lines.slice(-20)
    };
}

async function executeJob(job = {}) {
    const operation = String(job.operation || "bridge").trim();

    if (operation === "patch") {
        return executePatchJob(job);
    }

    if (operation === "humo_reference_audio_prepare") {
        return await executeHuMoReferenceAudioPrepJob(job);
    }

    if (operation === "humo_identity_probe") {
        return await executeHuMoIdentityProbeJob(job);
    }

    if (operation === "humo17_core_stage") {
        return await executeHuMo17CoreStageJob(job);
    }

    return await executeBridgeJob(job);
}

function persistWorkerResult(result) {
    const file = path.resolve(REPO_ROOT, RESULT_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + ".pending";
    fs.writeFileSync(temporary, JSON.stringify(result, null, 2) + "\n");
    fs.renameSync(temporary, file);
}

function readLocalWorkerResult() {
    const file = path.resolve(REPO_ROOT, RESULT_PATH);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function createWorkerPoller({
    reconcile = async () => {const {reconcileHuMo17PaidReceipts}=await import("./jarvis-fs-bridge.js");return reconcileHuMo17PaidReceipts({root:REPO_ROOT});},
    readJob = readRemoteJob,
    readResultId = readRemoteResultJobId,
    sync = syncLocalBranch,
    execute = executeJob,
    publish = publishRemoteResult,
    persist = persistWorkerResult,
    readLocalResult = readLocalWorkerResult,
    log = (...args) => console.log(...args),
    reportError = (...args) => console.error(...args)
} = {}) {
    let lastJobId = "";
    let polling = false;
    let pendingResult = null;
    return async function pollOnce() {
        if (polling) return;
        polling = true;
        let currentJob = null;
        try {
            await reconcile(); // Before GitHub, pending publication or any new job, including after sleep.
            // A failed publication must never replay an operation (especially a paid one).
            if (pendingResult) {
                await sync();
                await publish(pendingResult);
                log("[SIA7_REMOTE_RESULT_PUBLISHED]", JSON.stringify({jobId: pendingResult.jobId, path: RESULT_PATH}));
                pendingResult = null;
                return;
            }
            currentJob = await readJob();
            const remoteResultJobId = await readResultId();
            if (!currentJob?.jobId || currentJob.jobId === lastJobId || currentJob.jobId === remoteResultJobId) return;
            log("[SIA7_REMOTE_JOB_RECEIVED]", JSON.stringify({jobId: currentJob.jobId, operation: currentJob.operation || "bridge"}));
            // Transport failure before execution leaves the job eligible for the next poll.
            await sync();
            const local = readLocalResult();
            if (local?.jobId === currentJob.jobId && local.executionStarted === true) {
                lastJobId = currentJob.jobId;
                pendingResult = local;
                return;
            }
            persist({jobId: currentJob.jobId, executionStarted: true, ok: false,
                error: "WORKER_EXECUTION_INTERRUPTED_RECONCILIATION_REQUIRED"});
            lastJobId = currentJob.jobId;
            try {
                pendingResult = {jobId: currentJob.jobId, completedAt: new Date().toISOString(), executionStarted: true, ...await execute(currentJob)};
            }
            catch (error) {
                pendingResult = {jobId: currentJob.jobId, completedAt: new Date().toISOString(), executionStarted: true, ok: false, error: error.message, evidence:error.evidence||null};
            }
            persist(pendingResult);
            log("[SIA7_REMOTE_JOB_RESULT]", JSON.stringify(pendingResult));
            await publish(pendingResult);
            log("[SIA7_REMOTE_RESULT_PUBLISHED]", JSON.stringify({jobId: currentJob.jobId, path: RESULT_PATH}));
            pendingResult = null;
        }
        catch (error) {
            reportError("[SIA7_REMOTE_WORKER_ERROR]", error.message);
        }
        finally {
            polling = false;
        }
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    console.log(`[SIA7_GITHUB_WORKER] online branch=${BRANCH} bridge=${BRIDGE_URL}`);
    const pollOnce = createWorkerPoller();
    await pollOnce();
    setInterval(pollOnce, POLL_MS);
}
