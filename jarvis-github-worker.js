import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BRIDGE_URL = process.env.JARVIS_FS_BRIDGE_URL || "http://localhost:3344";
const REMOTE = process.env.SIA7_REMOTE || "origin";
const BRANCH = process.env.SIA7_BRANCH || "v94-media-v4n-negative-claims";
const JOB_PATH = process.env.SIA7_JOB_PATH || ".sia7/remote-job.json";
const RESULT_PATH = process.env.SIA7_RESULT_PATH || ".sia7/remote-result.json";
const POLL_MS = Number(process.env.SIA7_POLL_MS) || 5000;
const REPO_ROOT = path.resolve(process.cwd());

let lastJobId = "";
let polling = false;

function runGit(args = []) {
    return new Promise(resolve => {
        const child = spawn("git", args, {
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

async function executeJob(job = {}) {
    const operation = String(job.operation || "bridge").trim();

    if (operation === "patch") {
        return executePatchJob(job);
    }

    return await executeBridgeJob(job);
}

async function pollOnce() {
    if (polling) return;
    polling = true;

    let currentJob = null;

    try {
        currentJob = await readRemoteJob();

        if (!currentJob?.jobId || currentJob.jobId === lastJobId) {
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
