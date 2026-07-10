import { spawn } from "node:child_process";

const BRIDGE_URL =
    process.env.JARVIS_FS_BRIDGE_URL ||
    "http://localhost:3344";

const REMOTE =
    process.env.SIA7_REMOTE ||
    "origin";

const BRANCH =
    process.env.SIA7_BRANCH ||
    "v5.9-polish";

const JOB_PATH =
    process.env.SIA7_JOB_PATH ||
    ".sia7/remote-job.json";

const POLL_MS =
    Number(process.env.SIA7_POLL_MS) ||
    5000;

let lastJobId = "";
let polling = false;

function runGit(args = []) {
    return new Promise(resolve => {
        const child = spawn(
            "git",
            args,
            {
                cwd: process.cwd(),
                shell: false,
                stdio: ["ignore", "pipe", "pipe"],
                env: {
                    ...process.env,
                    GIT_TERMINAL_PROMPT: "0"
                }
            }
        );

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", chunk => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", chunk => {
            stderr += chunk.toString();
        });

        child.on("error", error => {
            resolve({
                ok: false,
                error: error.message,
                stdout,
                stderr
            });
        });

        child.on("close", code => {
            resolve({
                ok: code === 0,
                code,
                stdout,
                stderr
            });
        });
    });
}

async function readRemoteJob() {
    const fetchResult =
        await runGit([
            "fetch",
            "--quiet",
            REMOTE,
            BRANCH
        ]);

    if (!fetchResult.ok) {
        throw new Error(
            `REMOTE_FETCH_FAILED: ${fetchResult.stderr || fetchResult.error || "unknown"}`
        );
    }

    const showResult =
        await runGit([
            "show",
            `${REMOTE}/${BRANCH}:${JOB_PATH}`
        ]);

    if (!showResult.ok) {
        return null;
    }

    return JSON.parse(showResult.stdout);
}

function normalizeEndpoint(value = "") {
    const endpoint =
        String(value || "").trim();

    const allowed =
        new Set([
            "/health",
            "/read",
            "/grep",
            "/git"
        ]);

    if (!allowed.has(endpoint)) {
        throw new Error("WORKER_ENDPOINT_NOT_ALLOWED");
    }

    return endpoint;
}

async function executeJob(job = {}) {
    const endpoint =
        normalizeEndpoint(job.endpoint || "/health");

    const method =
        endpoint === "/health"
            ? "GET"
            : "POST";

    const response =
        await fetch(
            `${BRIDGE_URL}${endpoint}`,
            {
                method,
                headers:
                    method === "POST"
                        ? { "content-type": "application/json" }
                        : undefined,
                body:
                    method === "POST"
                        ? JSON.stringify(job.body || {})
                        : undefined
            }
        );

    const payload =
        await response.json();

    return {
        ok: response.ok && payload?.ok !== false,
        httpStatus: response.status,
        endpoint,
        payload
    };
}

async function pollOnce() {
    if (polling) return;
    polling = true;

    try {
        const job =
            await readRemoteJob();

        if (!job?.jobId || job.jobId === lastJobId) {
            return;
        }

        lastJobId = job.jobId;

        console.log(
            "[SIA7_REMOTE_JOB_RECEIVED]",
            JSON.stringify({
                jobId: job.jobId,
                endpoint: job.endpoint || "/health"
            })
        );

        const result =
            await executeJob(job);

        console.log(
            "[SIA7_REMOTE_JOB_RESULT]",
            JSON.stringify({
                jobId: job.jobId,
                ...result
            })
        );
    }
    catch(error) {
        console.error(
            "[SIA7_REMOTE_WORKER_ERROR]",
            error.message
        );
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
