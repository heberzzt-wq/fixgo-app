import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export const REQUIRED_BRANCH = "v5.9-polish";
export const MAX_READ_BYTES = 512 * 1024;
export const MAX_PATCH_BYTES = 200 * 1024;

const blockedSegments = new Set([
    ".git", "node_modules", ".firebase", ".cache",
    "dist", "build", "coverage"
]);

const blockedNames = new Set([
    ".env", ".env.local", ".env.production",
    "application_default_credentials.json"
]);

const blockedSuffixes = [".pem", ".p12", ".pfx", ".key"];

export const TEST_PROFILES = Object.freeze({
    media: {
        command: "node",
        args: ["--test", "tests/jarvis-media-analysis.test.cjs"],
        timeoutMs: 120000
    },
    multimodal: {
        command: "node",
        args: [
            "--test",
            "tests/jarvis-attachments.test.mjs",
            "tests/jarvis-multifunction-tools.test.mjs",
            "tests/jarvis-media-analysis.test.cjs"
        ],
        timeoutMs: 180000
    },
    ci: {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["run", "ci:test"],
        timeoutMs: 300000
    },
    diff_check: {
        command: "git",
        args: ["diff", "--check"],
        timeoutMs: 60000
    }
});

export function repoRoot() {
    const root = path.resolve(
        process.env.FIXGO_REPO_ROOT || process.cwd()
    );
    if (!fs.existsSync(root) || !fs.lstatSync(root).isDirectory()) {
        throw new Error(`FIXGO_REPO_ROOT_INVALID:${root}`);
    }
    return root;
}

export function runFile(command, args = [], {
    root = repoRoot(),
    timeoutMs = 30000,
    input,
    maxBuffer = 4 * 1024 * 1024
} = {}) {
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: "utf8",
        input,
        timeout: timeoutMs,
        windowsHide: true,
        shell: false,
        maxBuffer
    });
    if (result.error) throw result.error;
    return {
        ok: result.status === 0,
        status: result.status,
        signal: result.signal || null,
        stdout: String(result.stdout || ""),
        stderr: String(result.stderr || "")
    };
}

export function gitText(args, root = repoRoot()) {
    try {
        return execFileSync("git", args, {
            cwd: root,
            encoding: "utf8",
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer: 1024 * 1024
        }).trim();
    } catch (error) {
        throw new Error(
            String(error?.stderr || "").trim() ||
            error?.message ||
            "GIT_COMMAND_FAILED"
        );
    }
}

export function repoIdentity(root = repoRoot()) {
    const remote = (() => {
        try {
            return gitText(["remote", "get-url", "origin"], root);
        } catch {
            return "";
        }
    })();
    return {
        root,
        branch: gitText(["branch", "--show-current"], root),
        head: gitText(["rev-parse", "HEAD"], root),
        topLevel: gitText(["rev-parse", "--show-toplevel"], root),
        remote
    };
}

export function assertRequiredBranch(root = repoRoot()) {
    const identity = repoIdentity(root);
    if (identity.branch !== REQUIRED_BRANCH) {
        throw new Error(
            `FIXGO_BRANCH_BLOCKED:expected=${REQUIRED_BRANCH}:received=${identity.branch || "DETACHED"}`
        );
    }
    return identity;
}

export function normalizeRelativePath(value) {
    const candidate = String(value || "")
        .trim()
        .replace(/\\/g, "/");
    if (!candidate) throw new Error("REPO_PATH_REQUIRED");
    if (path.isAbsolute(candidate)) {
        throw new Error("ABSOLUTE_PATH_BLOCKED");
    }
    const segments = candidate.split("/").filter(Boolean);
    if (segments.some(segment =>
        segment === ".." || blockedSegments.has(segment)
    )) {
        throw new Error("REPO_PATH_BLOCKED");
    }
    const basename = (segments.at(-1) || "").toLowerCase();
    if (
        blockedNames.has(basename) ||
        blockedSuffixes.some(suffix => basename.endsWith(suffix))
    ) {
        throw new Error("SENSITIVE_PATH_BLOCKED");
    }
    return segments.join("/");
}

export function resolveRepoPath(value, root = repoRoot()) {
    const relativePath = normalizeRelativePath(value);
    const safeRoot = path.resolve(root);
    const target = path.resolve(safeRoot, relativePath);
    if (
        target !== safeRoot &&
        !target.startsWith(safeRoot + path.sep)
    ) {
        throw new Error("PATH_OUTSIDE_REPO");
    }
    return { root: safeRoot, relativePath, target };
}

export function assertNoSymlinkPath(target, root = repoRoot()) {
    const relative = path.relative(path.resolve(root), target);
    let current = path.resolve(root);
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        if (
            fs.existsSync(current) &&
            fs.lstatSync(current).isSymbolicLink()
        ) {
            throw new Error("SYMLINK_PATH_BLOCKED");
        }
    }
}

export function extractPatchPaths(patch) {
    const source = String(patch || "");
    if (!source.trim()) throw new Error("PATCH_REQUIRED");
    if (Buffer.byteLength(source, "utf8") > MAX_PATCH_BYTES) {
        throw new Error("PATCH_TOO_LARGE");
    }
    const paths = new Set();
    for (const line of source.split(/\r?\n/)) {
        const match = line.match(/^(?:---|\+\+\+) (?:a\/|b\/)?(.+)$/);
        if (!match || match[1].trim() === "/dev/null") continue;
        paths.add(normalizeRelativePath(match[1].trim()));
    }
    if (paths.size === 0) throw new Error("PATCH_PATHS_NOT_FOUND");
    return [...paths].sort();
}

export function temporaryPatch(patch) {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), "fixgo-mcp-")
    );
    const file = path.join(directory, `${randomUUID()}.patch`);
    fs.writeFileSync(file, String(patch), "utf8");
    return {
        file,
        cleanup: () => fs.rmSync(directory, {
            recursive: true,
            force: true
        })
    };
}

export function assertExpectedHead(expectedHead, root = repoRoot()) {
    const actual = gitText(["rev-parse", "HEAD"], root);
    const expected = String(expectedHead || "").trim();
    if (expected && expected !== actual) {
        throw new Error(
            `FIXGO_HEAD_MOVED:expected=${expected}:received=${actual}`
        );
    }
    return actual;
}
