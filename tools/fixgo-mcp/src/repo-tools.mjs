import fs from "node:fs";
import {
    MAX_READ_BYTES,
    TEST_PROFILES,
    assertExpectedHead,
    assertNoSymlinkPath,
    assertRequiredBranch,
    extractPatchPaths,
    gitText,
    normalizeRelativePath,
    repoIdentity,
    repoRoot,
    resolveRepoPath,
    runFile,
    temporaryPatch
} from "./policy.mjs";

function bounded(value, maximum = 1024 * 1024) {
    const source = String(value || "");
    const bytes = Buffer.from(source, "utf8");
    return bytes.length <= maximum
        ? { text: source, truncated: false }
        : {
            text: bytes.subarray(0, maximum).toString("utf8"),
            truncated: true
        };
}

export function repoStatus() {
    const root = repoRoot();
    const identity = repoIdentity(root);
    const status = gitText(["status", "--short"], root);
    return {
        ok: true,
        ...identity,
        requiredBranch: "v5.9-polish",
        branchAllowed: identity.branch === "v5.9-polish",
        clean: !status,
        status
    };
}

export function listFiles({
    pathspec = [],
    maxResults = 500
} = {}) {
    const root = repoRoot();
    const paths = Array.isArray(pathspec)
        ? pathspec.slice(0, 12).map(value =>
            resolveRepoPath(value, root).relativePath
        )
        : [];
    const limit = Math.max(1, Math.min(2000, Number(maxResults) || 500));
    const args = [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z"
    ];
    if (paths.length) args.push("--", ...paths);

    const result = runFile("git", args, {
        root,
        timeoutMs: 30000,
        maxBuffer: 4 * 1024 * 1024
    });
    if (!result.ok) {
        throw new Error(result.stderr || "GIT_LS_FILES_FAILED");
    }

    const allFiles = result.stdout
        .split("\0")
        .filter(Boolean)
        .map(normalizeRelativePath);
    const files = allFiles.slice(0, limit);

    return {
        ok: true,
        paths,
        count: files.length,
        total: allFiles.length,
        truncated: allFiles.length > files.length,
        files
    };
}

export function readFile({ file, startLine = 1, endLine = null }) {
    const resolved = resolveRepoPath(file);
    assertNoSymlinkPath(resolved.target, resolved.root);

    if (!fs.existsSync(resolved.target)) {
        throw new Error("FILE_NOT_FOUND");
    }

    const stat = fs.lstatSync(resolved.target);
    if (!stat.isFile()) throw new Error("READ_TARGET_NOT_FILE");
    if (stat.size > MAX_READ_BYTES) {
        throw new Error("READ_TARGET_TOO_LARGE");
    }

    const lines = fs.readFileSync(resolved.target, "utf8").split(/\r?\n/);
    const first = Math.max(1, Number(startLine) || 1);
    const last = endLine == null
        ? Math.min(lines.length, first + 499)
        : Math.min(lines.length, Math.max(first, Number(endLine) || first));

    return {
        ok: true,
        file: resolved.relativePath,
        bytes: stat.size,
        startLine: first,
        endLine: last,
        totalLines: lines.length,
        content: lines
            .slice(first - 1, last)
            .map((line, index) => `${first + index}: ${line}`)
            .join("\n")
    };
}

export function searchCode({
    query,
    pathspec = [],
    maxResults = 80
}) {
    const root = repoRoot();
    const term = String(query || "").trim();
    if (term.length < 2 || term.length > 160) {
        throw new Error("SEARCH_QUERY_INVALID");
    }

    const paths = Array.isArray(pathspec)
        ? pathspec.slice(0, 12).map(value =>
            resolveRepoPath(value, root).relativePath
        )
        : [];

    const args = ["grep", "-n", "-I", "--fixed-strings", "--", term];
    if (paths.length) args.push(...paths);

    const result = runFile("git", args, { root, timeoutMs: 30000 });
    if (![0, 1].includes(result.status)) {
        throw new Error(result.stderr || "GIT_GREP_FAILED");
    }

    const matches = result.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, Math.max(1, Math.min(200, Number(maxResults) || 80)));

    return {
        ok: true,
        query: term,
        paths,
        count: matches.length,
        matches
    };
}

export function diff({ staged = false, paths = [] } = {}) {
    const root = repoRoot();
    const safePaths = Array.isArray(paths)
        ? paths.slice(0, 30).map(value =>
            resolveRepoPath(value, root).relativePath
        )
        : [];

    const args = ["diff", "--no-ext-diff", "--unified=3"];
    if (staged) args.push("--cached");
    if (safePaths.length) args.push("--", ...safePaths);

    const result = runFile("git", args, { root, timeoutMs: 60000 });
    if (!result.ok) throw new Error(result.stderr || "GIT_DIFF_FAILED");

    const output = bounded(result.stdout);
    return {
        ok: true,
        staged: Boolean(staged),
        paths: safePaths,
        diff: output.text,
        truncated: output.truncated
    };
}

export function patchCheck({ patch, expectedHead = "" }) {
    const root = repoRoot();
    const identity = assertRequiredBranch(root);
    assertExpectedHead(expectedHead, root);
    const paths = extractPatchPaths(patch);

    for (const file of paths) {
        const resolved = resolveRepoPath(file, root);
        assertNoSymlinkPath(resolved.target, root);
    }

    const temp = temporaryPatch(patch);
    try {
        const result = runFile(
            "git",
            [
                "apply",
                "--check",
                "--whitespace=error-all",
                temp.file
            ],
            { root, timeoutMs: 60000 }
        );

        return {
            ok: result.ok,
            status: result.ok
                ? "PATCH_CHECK_PASSED"
                : "PATCH_CHECK_FAILED",
            branch: identity.branch,
            head: identity.head,
            paths,
            stdout: result.stdout,
            stderr: result.stderr
        };
    } finally {
        temp.cleanup();
    }
}

export function patchApply({ patch, expectedHead }) {
    const root = repoRoot();
    const identity = assertRequiredBranch(root);
    const head = assertExpectedHead(expectedHead, root);
    const checked = patchCheck({ patch, expectedHead: head });
    if (!checked.ok) return checked;

    const temp = temporaryPatch(patch);
    try {
        const result = runFile(
            "git",
            ["apply", "--whitespace=error-all", temp.file],
            { root, timeoutMs: 60000 }
        );

        if (!result.ok) {
            return {
                ok: false,
                status: "PATCH_APPLY_FAILED",
                branch: identity.branch,
                head,
                paths: checked.paths,
                stdout: result.stdout,
                stderr: result.stderr
            };
        }

        const changed = diff({ paths: checked.paths });
        return {
            ok: true,
            status: "PATCH_APPLIED",
            branch: identity.branch,
            headBefore: head,
            paths: checked.paths,
            worktreeStatus: gitText(["status", "--short"], root),
            diff: changed.diff,
            truncated: changed.truncated
        };
    } finally {
        temp.cleanup();
    }
}

export function runTests({ profile }) {
    const root = repoRoot();
    const identity = assertRequiredBranch(root);
    const selected = TEST_PROFILES[String(profile || "")];
    if (!selected) throw new Error("TEST_PROFILE_NOT_ALLOWED");

    const result = runFile(
        selected.command,
        selected.args,
        {
            root,
            timeoutMs: selected.timeoutMs,
            maxBuffer: 4 * 1024 * 1024
        }
    );

    const stdout = bounded(result.stdout, 2 * 1024 * 1024);
    const stderr = bounded(result.stderr, 512 * 1024);

    return {
        ok: result.ok,
        status: result.ok
            ? "TEST_PROFILE_PASSED"
            : "TEST_PROFILE_FAILED",
        profile,
        branch: identity.branch,
        head: identity.head,
        command: selected.command,
        args: selected.args,
        exitCode: result.status,
        signal: result.signal,
        stdout: stdout.text,
        stderr: stderr.text,
        truncated: stdout.truncated || stderr.truncated
    };
}
