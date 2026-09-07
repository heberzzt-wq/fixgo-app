import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
const SIA7_HUMO_AUDIO_OUTPUT = ".jarvis-artifacts/audio/series_heberto_infiltrado_cancun-ep-series_heberto_infiltrado_cancun-1-narration.wav";
const SIA7_HUMO_AUDIO_SHA256 = "294861191281abdcc32a0d8fcef6102832e784d95e73e0e55a75fde7ecfc35ad";
const SIA7_HUMO_OUTPUT = ".jarvis-artifacts/videos/humo-heberto-identity-probe-8s.mp4";
const SIA7_HUMO_CHARACTER_ID = "CHAR_HEBERTO";
const WINDOWS_GIT = "C:\\Program Files\\Git\\cmd\\git.exe";
const GIT_EXECUTABLE = String(process.env.SIA7_GIT || "").trim() ||
    (process.platform === "win32" && fs.existsSync(WINDOWS_GIT) ? WINDOWS_GIT : "git");

let lastJobId = "";
let polling = false;

function runGit(args = []) {
    return new Promise(resolve => {
        const child = spawn(GIT_EXECUTABLE, args, {
            cwd: REPO_ROOT,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", chunk => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", chunk => {
            stderr += chunk.toString();
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
        if (!output.includes("nothing to commit")) {
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
            durationSeconds: 8.0,
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

async function executeJob(job = {}) {
    const operation = String(job.operation || "bridge").trim();

    if (operation === "patch") {
        return executePatchJob(job);
    }

    if (operation === "humo_identity_probe") {
        return await executeHuMoIdentityProbeJob(job);
    }

    return await executeBridgeJob(job);
}

async function pollOnce() {
    if (polling) return;
    polling = true;

    let currentJob = null;

    try {
        currentJob = await readRemoteJob();
        const remoteResultJobId = await readRemoteResultJobId();

        if (!currentJob?.jobId || currentJob.jobId === lastJobId || currentJob.jobId === remoteResultJobId) {
            return;
        }

        lastJobId = currentJob.jobId;

        console.log(
            "[SIA7_REMOTE_JOB_RECEIVED]",
            JSON.stringify({
                jobId: currentJob.jobId,
                operation: currentJob.operation || "bridge",
                endpoint: currentJob.endpoint || null
            })
        );

        await syncLocalBranch();

        const executionResult = await executeJob(currentJob);
        const result = {
            jobId: currentJob.jobId,
            completedAt: new Date().toISOString(),
            ...executionResult
        };

        console.log("[SIA7_REMOTE_JOB_RESULT]", JSON.stringify(result));
        await publishRemoteResult(result);

        console.log(
            "[SIA7_REMOTE_RESULT_PUBLISHED]",
            JSON.stringify({ jobId: currentJob.jobId, path: RESULT_PATH })
        );
    }
    catch(error) {
        const failure = {
            jobId: currentJob?.jobId || null,
            completedAt: new Date().toISOString(),
            ok: false,
            error: error.message
        };

        console.error("[SIA7_REMOTE_WORKER_ERROR]", error.message);

        if (currentJob?.jobId) {
            try {
                await publishRemoteResult(failure);
            }
            catch(publishError) {
                console.error(
                    "[SIA7_REMOTE_RESULT_PUBLISH_ERROR]",
                    publishError.message
                );
            }
        }
    }
    finally {
        polling = false;
    }
}

console.log(
    `[SIA7_GITHUB_WORKER] online branch=${BRANCH} bridge=${BRIDGE_URL}`
);

await pollOnce();
setInterval(pollOnce, POLL_MS);
