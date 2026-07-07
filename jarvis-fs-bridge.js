import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const JARVIS_FS_BRIDGE_VERSION =
    "2.1.0-local-fs-bridge";

export const JARVIS_FS_BRIDGE_POLICY = {
    authority: "full_repo_private_owner",
    safeZone: "advisory",
    rootContainment: true,
    emptyWrites: "blocked",
    failureMode: "closed"
};

const MODULE_FILE =
    fileURLToPath(import.meta.url);

const DEFAULT_ROOT =
    path.resolve(
        process.env.FIXGO_REPO_ROOT ||
        process.cwd()
    );

function normalizeRelativePath(file) {
    if (
        typeof file !== "string" ||
        !file.trim()
    ) {
        throw new Error("FILE_REQUIRED");
    }

    const normalized =
        file
            .trim()
            .replace(/\\/g, "/");

    if (
        path.isAbsolute(normalized)
    ) {
        throw new Error("ABSOLUTE_PATH_NOT_ALLOWED");
    }

    return normalized;
}

export function resolveRepoPath(
    file,
    root = DEFAULT_ROOT
) {
    const repoRoot =
        path.resolve(root);

    const normalized =
        normalizeRelativePath(file);

    const target =
        path.resolve(repoRoot, normalized);

    if (
        target !== repoRoot &&
        !target.startsWith(repoRoot + path.sep)
    ) {
        throw new Error("PATH_OUTSIDE_REPO");
    }

    return target;
}

export function assertWriteContent(content) {
    if (
        typeof content !== "string"
    ) {
        throw new Error("CONTENT_STRING_REQUIRED");
    }

    if (
        content.length === 0
    ) {
        throw new Error("EMPTY_WRITE_CONTENT");
    }

    return true;
}

const GREP_ALLOWED_EXTENSIONS =
    new Set([
        ".js",
        ".mjs",
        ".cjs",
        ".html",
        ".css",
        ".json",
        ".md",
        ".txt"
    ]);

const GREP_IGNORED_DIRS =
    new Set([
        "node_modules",
        ".git",
        "dist",
        "build",
        "coverage",
        ".firebase",
        ".next",
        ".cache"
    ]);

function normalizeGrepTerm(term) {
    if (
        typeof term !== "string" ||
        !term.trim()
    ) {
        throw new Error("GREP_TERM_REQUIRED");
    }

    const normalized =
        term.trim();

    if (
        normalized.length < 2 ||
        normalized.length > 160
    ) {
        throw new Error("GREP_TERM_INVALID_LENGTH");
    }

    return normalized;
}

function isAllowedGrepFile(filePath = "") {
    const ext =
        path.extname(filePath)
            .toLowerCase();

    return GREP_ALLOWED_EXTENSIONS.has(ext);
}

function walkRepoFiles(
    dir,
    root,
    files = [],
    limit = 800
) {
    if (
        files.length >= limit
    ) {
        return files;
    }

    const entries =
        fs.readdirSync(
            dir,
            {
                withFileTypes: true
            }
        );

    for (
        const entry
        of entries
    ) {
        if (
            files.length >= limit
        ) {
            break;
        }

        if (
            GREP_IGNORED_DIRS.has(entry.name)
        ) {
            continue;
        }

        const absolutePath =
            path.join(
                dir,
                entry.name
            );

        const relativePath =
            path.relative(
                root,
                absolutePath
            ).replace(/\\/g, "/");

        if (
            entry.isDirectory()
        ) {
            walkRepoFiles(
                absolutePath,
                root,
                files,
                limit
            );

            continue;
        }

        if (
            !entry.isFile() ||
            !isAllowedGrepFile(absolutePath)
        ) {
            continue;
        }

        files.push({
            absolutePath,
            relativePath
        });
    }

    return files;
}

export function grepRepo({
    term,
    cwd = ".",
    maxFiles = 800,
    maxFileSizeBytes = 512000,
    maxMatches = 80,
    root = DEFAULT_ROOT
} = {}) {
    const safeTerm =
        normalizeGrepTerm(term);

    const repoRoot =
        resolveRepoPath(cwd, root);

    const files =
        walkRepoFiles(
            repoRoot,
            repoRoot,
            [],
            Number(maxFiles) || 800
        );

    const lowerTerm =
        safeTerm.toLowerCase();

    const matches =
        [];

    for (
        const file
        of files
    ) {
        if (
            matches.length >= maxMatches
        ) {
            break;
        }

        const stat =
            fs.statSync(file.absolutePath);

        if (
            stat.size > maxFileSizeBytes
        ) {
            continue;
        }

        const source =
            fs.readFileSync(
                file.absolutePath,
                "utf8"
            );

        const lines =
            source.split(/\r?\n/);

        for (
            let index = 0;
            index < lines.length;
            index++
        ) {
            if (
                matches.length >= maxMatches
            ) {
                break;
            }

            const line =
                lines[index];

            if (
                line.toLowerCase()
                    .includes(lowerTerm)
            ) {
                matches.push({
                    file:
                        file.relativePath,
                    line:
                        index + 1,
                    snippet:
                        line.trim().slice(0, 240)
                });
            }
        }
    }

    return {
        ok: true,
        term:
            safeTerm,
        totalFilesScanned:
            files.length,
        totalMatches:
            matches.length,
        matches,
        source:
            "jarvis_fs_bridge_grep_v1",
        version:
            JARVIS_FS_BRIDGE_VERSION
    };
}

export function describeJarvisFsBridge() {
    return {
        ok: true,
        version:
            JARVIS_FS_BRIDGE_VERSION,
        policy:
            JARVIS_FS_BRIDGE_POLICY,
        root:
            DEFAULT_ROOT
    };
}

export function normalizeReadLineRange({
    startLine = null,
    endLine = null,
    fromLine = null,
    toLine = null,
    maxLines = 500
} = {}) {
    const parseLine =
        function(value) {
            const parsed =
                Number.parseInt(
                    value,
                    10
                );

            return Number.isFinite(parsed) &&
                parsed > 0
                ? parsed
                : null;
        };

    const start =
        parseLine(startLine) ||
        parseLine(fromLine);

    const end =
        parseLine(endLine) ||
        parseLine(toLine);

    if (
        !start &&
        !end
    ) {
        return null;
    }

    const normalizedStart =
        start ||
        1;

    const normalizedEnd =
        Math.max(
            normalizedStart,
            end ||
            normalizedStart
        );

    return {
        startLine:
            normalizedStart,
        endLine:
            Math.min(
                normalizedEnd,
                normalizedStart +
                Math.max(Number(maxLines) || 500, 1) -
                1
            )
    };
}

export function applyReadLineRange(
    content = "",
    lineRange = null
) {
    const source =
        String(content || "");

    const lines =
        source.split(/\r?\n/);

    if (!lineRange) {
        return {
            content:
                source,
            partial:
                false,
            startLine:
                1,
            endLine:
                lines.length,
            totalLines:
                lines.length
        };
    }

    const startLine =
        Math.min(
            Math.max(Number(lineRange.startLine) || 1, 1),
            Math.max(lines.length, 1)
        );

    const endLine =
        Math.min(
            Math.max(Number(lineRange.endLine) || startLine, startLine),
            lines.length
        );

    return {
        content:
            lines
                .slice(
                    startLine - 1,
                    endLine
                )
                .join("\n"),
        partial:
            true,
        startLine,
        endLine,
        totalLines:
            lines.length
    };
}

async function runGitWorkflowCommand({
    args = [],
    cwd = ".",
    timeoutMs = 120000,
    root = DEFAULT_ROOT,
    source = "jarvis_fs_bridge_git_v7"
} = {}) {
    if (!Array.isArray(args)) {
        throw new Error("GIT_ARGS_ARRAY_REQUIRED");
    }

    const safeArgs =
        args.map(arg => String(arg));

    const blockedTokens =
        new Set([
            ";",
            "&&",
            "||",
            "|",
            ">",
            "<",
            "`",
            "$(",
            "\n",
            "\r"
        ]);

    for (const arg of safeArgs) {
        for (const token of blockedTokens) {
            if (arg.includes(token)) {
                throw new Error("GIT_ARG_UNSAFE_TOKEN");
            }
        }
    }

    const safeCwd =
        resolveRepoPath(cwd, root);

    const { spawn } =
        await import("child_process");

    const startedAt =
        Date.now();

    return await new Promise(resolve => {
        const child =
            spawn(
                "git",
                safeArgs,
                {
                    cwd:
                        safeCwd,
                    shell:
                        false,
                    stdio:
                        [
                            "ignore",
                            "pipe",
                            "pipe"
                        ],
                    env:
                        {
                            ...process.env,
                            GIT_TERMINAL_PROMPT:
                                "0"
                        }
                }
            );

        let stdout =
            "";

        let stderr =
            "";

        let finished =
            false;

        const timer =
            setTimeout(
                () => {
                    if (finished) {
                        return;
                    }

                    finished =
                        true;

                    child.kill("SIGTERM");

                    resolve({
                        ok: false,
                        status: "GIT_TIMEOUT",
                        error: "GIT_COMMAND_TIMEOUT",
                        command:
                            ["git", ...safeArgs].join(" "),
                        stdout,
                        stderr,
                        durationMs:
                            Date.now() - startedAt,
                        source,
                        version:
                            JARVIS_FS_BRIDGE_VERSION
                    });
                },
                Number(timeoutMs) || 120000
            );

        child.stdout.on("data", chunk => {
            stdout +=
                chunk.toString();
        });

        child.stderr.on("data", chunk => {
            stderr +=
                chunk.toString();
        });

        child.on("error", error => {
            if (finished) {
                return;
            }

            finished =
                true;

            clearTimeout(timer);

            resolve({
                ok: false,
                status: "GIT_SPAWN_FAILED",
                error:
                    error.message,
                command:
                    ["git", ...safeArgs].join(" "),
                stdout,
                stderr,
                durationMs:
                    Date.now() - startedAt,
                source,
                version:
                    JARVIS_FS_BRIDGE_VERSION
            });
        });

        child.on("close", code => {
            if (finished) {
                return;
            }

            finished =
                true;

            clearTimeout(timer);

            resolve({
                ok:
                    code === 0,
                status:
                    code === 0
                        ? "GIT_OK"
                        : "GIT_FAILED",
                exitCode:
                    code,
                command:
                    ["git", ...safeArgs].join(" "),
                stdout,
                stderr,
                durationMs:
                    Date.now() - startedAt,
                source,
                version:
                    JARVIS_FS_BRIDGE_VERSION
            });
        });
    });
}

function normalizeGitFiles(files = []) {
    if (!Array.isArray(files)) {
        return [];
    }

    return files
        .map(file => String(file || "").trim().replace(/\\/g, "/"))
        .filter(Boolean)
        .map(file => {
            normalizeRelativePath(file);
            return file;
        });
}

export function createJarvisFsBridgeApp({
    root = DEFAULT_ROOT
} = {}) {
    const app =
        express();

    app.use(cors());

    app.use(express.json({
        limit: "25mb"
    }));

    app.get("/health", (req, res) => {
        res.json({
            ...describeJarvisFsBridge(),
            root:
                path.resolve(root)
        });
    });

        app.post("/grep", async (req, res) => {
        try {
            const {
                term,
                query,
                cwd = ".",
                maxFiles = 800,
                maxFileSizeBytes = 512000,
                maxMatches = 80
            } = req.body || {};

            const result =
                grepRepo({
                    term:
                        term || query,
                    cwd,
                    maxFiles,
                    maxFileSizeBytes,
                    maxMatches,
                    root
                });

            return res.json(result);
        }
        catch(error) {
            const clientErrors =
                new Set([
                    "GREP_TERM_REQUIRED",
                    "GREP_TERM_INVALID_LENGTH",
                    "FILE_REQUIRED",
                    "ABSOLUTE_PATH_NOT_ALLOWED",
                    "PATH_OUTSIDE_REPO"
                ]);

            return res
                .status(
                    clientErrors.has(error.message)
                        ? 400
                        : 500
                )
                .json({
                    ok: false,
                    status:
                        "GREP_FAILED",
                    error:
                        error.message,
                    source:
                        "jarvis_fs_bridge_grep_v1",
                    version:
                        JARVIS_FS_BRIDGE_VERSION
                });
        }
    });

        app.post("/read", async (req, res) => {
        try {
            const {
                file,
                path: requestedPath,
                maxBytes = 300000,
                startLine = null,
                endLine = null,
                fromLine = null,
                toLine = null
            } = req.body || {};

            const lineRange =
                normalizeReadLineRange({
                    startLine,
                    endLine,
                    fromLine,
                    toLine
                });

            const targetFile =
                file ||
                requestedPath ||
                "";

            const safePath =
                resolveRepoPath(
                    targetFile,
                    root
                );

            if (
                !fs.existsSync(safePath)
            ) {
                return res.status(404).json({
                    ok: false,
                    status:
                        "FILE_NOT_FOUND",
                    error:
                        "FILE_NOT_FOUND",
                    file:
                        targetFile,
                    source:
                        "jarvis_fs_bridge_read_v1",
                    version:
                        JARVIS_FS_BRIDGE_VERSION
                });
            }

            const stat =
                fs.statSync(safePath);

            if (
                !stat.isFile()
            ) {
                return res.status(400).json({
                    ok: false,
                    status:
                        "NOT_A_FILE",
                    error:
                        "NOT_A_FILE",
                    file:
                        targetFile,
                    source:
                        "jarvis_fs_bridge_read_v1",
                    version:
                        JARVIS_FS_BRIDGE_VERSION
                });
            }

            if (
                stat.size > Number(maxBytes) &&
                !lineRange
            ) {
                return res.status(413).json({
                    ok: false,
                    status:
                        "FILE_TOO_LARGE",
                    error:
                        "FILE_TOO_LARGE",
                    file:
                        targetFile,
                    size:
                        stat.size,
                    maxBytes:
                        Number(maxBytes),
                    source:
                        "jarvis_fs_bridge_read_v1",
                    version:
                        JARVIS_FS_BRIDGE_VERSION
                });
            }

            const rawContent =
                fs.readFileSync(
                    safePath,
                    "utf8"
                );

            const rangedRead =
                applyReadLineRange(
                    rawContent,
                    lineRange
                );

            const content =
                rangedRead.content;

            const contentSize =
                Buffer.byteLength(
                    content,
                    "utf8"
                );

            if (
                contentSize > Number(maxBytes)
            ) {
                return res.status(413).json({
                    ok: false,
                    status:
                        "FILE_TOO_LARGE",
                    error:
                        "FILE_TOO_LARGE",
                    file:
                        targetFile,
                    size:
                        contentSize,
                    totalSize:
                        stat.size,
                    maxBytes:
                        Number(maxBytes),
                    lineRange:
                        lineRange || null,
                    source:
                        "jarvis_fs_bridge_read_v1",
                    version:
                        JARVIS_FS_BRIDGE_VERSION
                });
            }

            return res.json({
                ok: true,
                file:
                    String(targetFile)
                        .replace(/\\/g, "/"),
                path:
                    String(targetFile)
                        .replace(/\\/g, "/"),
                size:
                    contentSize,
                totalSize:
                    stat.size,
                content,
                partial:
                    rangedRead.partial,
                startLine:
                    rangedRead.startLine,
                endLine:
                    rangedRead.endLine,
                totalLines:
                    rangedRead.totalLines,
                lineRange: {
                    startLine:
                        rangedRead.startLine,
                    endLine:
                        rangedRead.endLine,
                    totalLines:
                        rangedRead.totalLines
                },
                source:
                    "jarvis_fs_bridge_read_v1",
                version:
                    JARVIS_FS_BRIDGE_VERSION
            });
        }
        catch(error) {
            const clientErrors =
                new Set([
                    "FILE_REQUIRED",
                    "ABSOLUTE_PATH_NOT_ALLOWED",
                    "PATH_OUTSIDE_REPO"
                ]);

            return res
                .status(
                    clientErrors.has(error.message)
                        ? 400
                        : 500
                )
                .json({
                    ok: false,
                    status:
                        "READ_FAILED",
                    error:
                        error.message,
                    source:
                        "jarvis_fs_bridge_read_v1",
                    version:
                        JARVIS_FS_BRIDGE_VERSION
                });
        }
    });

    
    app.post("/write", async (req, res) => {
        try {
            const {
                file,
                content,
                dryRun = false
            } = req.body || {};

            assertWriteContent(content);

            const safePath =
                resolveRepoPath(file, root);

            if (
                dryRun === true
            ) {
                return res.json({
                    ok: true,
                    dryRun: true,
                    path:
                        safePath,
                    version:
                        JARVIS_FS_BRIDGE_VERSION
                });
            }

            fs.mkdirSync(
                path.dirname(safePath),
                {
                    recursive: true
                }
            );

            fs.writeFileSync(
                safePath,
                content,
                "utf8"
            );

            return res.json({
                ok: true,
                path:
                    safePath,
                version:
                    JARVIS_FS_BRIDGE_VERSION
            });
        }
        catch(error) {
            const clientErrors =
                new Set([
                    "FILE_REQUIRED",
                    "ABSOLUTE_PATH_NOT_ALLOWED",
                    "PATH_OUTSIDE_REPO",
                    "CONTENT_STRING_REQUIRED",
                    "EMPTY_WRITE_CONTENT"
                ]);

            return res
                .status(
                    clientErrors.has(error.message)
                        ? 400
                        : 500
                )
                .json({
                    ok: false,
                    error:
                        error.message,
                    version:
                        JARVIS_FS_BRIDGE_VERSION
                });
        }
    });

        app.post("/run", async (req, res) => {
        try {
            const {
                command,
                cwd = ".",
                timeoutMs = 120000,
                source = "jarvis_local_bridge"
            } = req.body || {};

            const allowedCommands =
                new Set([
                    "npm run check:syntax",
                    "npm test",
                    "npm run ci:test"
                ]);

            if (
                typeof command !== "string" ||
                !allowedCommands.has(command)
            ) {
                return res.status(400).json({
                    ok: false,
                    status: "COMMAND_NOT_ALLOWED",
                    error: "COMMAND_NOT_ALLOWED",
                    command,
                    allowedCommands:
                        [...allowedCommands],
                    version:
                        JARVIS_FS_BRIDGE_VERSION
                });
            }

            const safeCwd =
                resolveRepoPath(cwd, root);

            const { spawn } =
                await import("child_process");

            const startedAt =
                Date.now();

            const child =
                spawn(
                    command,
                    {
                        cwd:
                            safeCwd,
                        shell:
                            true,
                        stdio:
                            [
                                "ignore",
                                "pipe",
                                "pipe"
                            ],
                        env:
                            {
                                ...process.env,
                                CI:
                                    "true"
                            }
                    }
                );

            let stdout =
                "";

            let stderr =
                "";

            let finished =
                false;

            const timer =
                setTimeout(
                    () => {
                        if (finished) {
                            return;
                        }

                        finished =
                            true;

                        child.kill(
                            "SIGTERM"
                        );

                        return res.status(408).json({
                            ok: false,
                            status: "TIMEOUT",
                            error: "COMMAND_TIMEOUT",
                            command,
                            timeoutMs,
                            stdout,
                            stderr,
                            durationMs:
                                Date.now() - startedAt,
                            source,
                            version:
                                JARVIS_FS_BRIDGE_VERSION
                        });
                    },
                    Number(timeoutMs) || 120000
                );

            child.stdout.on(
                "data",
                chunk => {
                    stdout +=
                        chunk.toString();
                }
            );

            child.stderr.on(
                "data",
                chunk => {
                    stderr +=
                        chunk.toString();
                }
            );

            child.on(
                "error",
                error => {
                    if (finished) {
                        return;
                    }

                    finished =
                        true;

                    clearTimeout(
                        timer
                    );

                    return res.status(500).json({
                        ok: false,
                        status: "SPAWN_FAILED",
                        error:
                            error.message,
                        command,
                        stdout,
                        stderr,
                        durationMs:
                            Date.now() - startedAt,
                        source,
                        version:
                            JARVIS_FS_BRIDGE_VERSION
                    });
                }
            );

            child.on(
                "close",
                code => {
                    if (finished) {
                        return;
                    }

                    finished =
                        true;

                    clearTimeout(
                        timer
                    );

                    return res.json({
                        ok:
                            code === 0,
                        status:
                            code === 0
                                ? "PASSED"
                                : "FAILED",
                        exitCode:
                            code,
                        command,
                        stdout,
                        stderr,
                        durationMs:
                            Date.now() - startedAt,
                        source,
                        version:
                            JARVIS_FS_BRIDGE_VERSION
                    });
                }
            );
        }
        catch(error) {
            return res.status(500).json({
                ok: false,
                status: "RUN_COMMAND_FAILED",
                error:
                    error.message,
                version:
                    JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

    app.post("/git", async (req, res) => {
        try {
            const {
                action,
                cwd = ".",
                files = [],
                message = "",
                remote = "origin",
                branch = "",
                approved = false,
                codexApproved = false,
                timeoutMs = 120000
            } = req.body || {};

            const normalizedAction =
                String(action || "").trim();

            const approvedWrite =
                approved === true ||
                codexApproved === true;

            let result =
                null;

            if (normalizedAction === "status") {
                result =
                    await runGitWorkflowCommand({
                        args: [
                            "status",
                            "--short",
                            "--branch"
                        ],
                        cwd,
                        timeoutMs,
                        root
                    });

                return res.json({
                    ...result,
                    action:
                        "status",
                    status:
                        result.ok
                            ? "GIT_STATUS_OK"
                            : "GIT_STATUS_FAILED"
                });
            }

            if (normalizedAction === "diff") {
                result =
                    await runGitWorkflowCommand({
                        args: [
                            "diff",
                            "--"
                        ],
                        cwd,
                        timeoutMs,
                        root
                    });

                return res.json({
                    ...result,
                    action:
                        "diff",
                    status:
                        result.ok
                            ? "GIT_DIFF_OK"
                            : "GIT_DIFF_FAILED"
                });
            }

            if (normalizedAction === "diffCached") {
                result =
                    await runGitWorkflowCommand({
                        args: [
                            "diff",
                            "--cached",
                            "--"
                        ],
                        cwd,
                        timeoutMs,
                        root
                    });

                return res.json({
                    ...result,
                    action:
                        "diffCached",
                    status:
                        result.ok
                            ? "GIT_DIFF_CACHED_OK"
                            : "GIT_DIFF_CACHED_FAILED"
                });
            }

            if (normalizedAction === "add") {
                if (approvedWrite !== true) {
                    return res.status(403).json({
                        ok: false,
                        status: "GIT_APPROVAL_REQUIRED",
                        error: "APPROVAL_REQUIRED: git add",
                        action:
                            normalizedAction,
                        version:
                            JARVIS_FS_BRIDGE_VERSION
                    });
                }

                const safeFiles =
                    normalizeGitFiles(files);

                if (safeFiles.length === 0) {
                    return res.status(400).json({
                        ok: false,
                        status: "GIT_FILES_REQUIRED",
                        error: "FILES_REQUIRED",
                        action:
                            normalizedAction,
                        version:
                            JARVIS_FS_BRIDGE_VERSION
                    });
                }

                result =
                    await runGitWorkflowCommand({
                        args: [
                            "add",
                            "--",
                            ...safeFiles
                        ],
                        cwd,
                        timeoutMs,
                        root
                    });

                return res.json({
                    ...result,
                    action:
                        "add",
                    files:
                        safeFiles,
                    status:
                        result.ok
                            ? "GIT_ADD_OK"
                            : "GIT_ADD_FAILED"
                });
            }

            if (normalizedAction === "commit") {
                if (approvedWrite !== true) {
                    return res.status(403).json({
                        ok: false,
                        status: "GIT_APPROVAL_REQUIRED",
                        error: "APPROVAL_REQUIRED: git commit",
                        action:
                            normalizedAction,
                        version:
                            JARVIS_FS_BRIDGE_VERSION
                    });
                }

                const commitMessage =
                    String(message || "").trim();

                if (
                    commitMessage.length < 3 ||
                    commitMessage.length > 180
                ) {
                    return res.status(400).json({
                        ok: false,
                        status: "GIT_COMMIT_MESSAGE_INVALID",
                        error: "COMMIT_MESSAGE_INVALID",
                        action:
                            normalizedAction,
                        version:
                            JARVIS_FS_BRIDGE_VERSION
                    });
                }

                result =
                    await runGitWorkflowCommand({
                        args: [
                            "commit",
                            "-m",
                            commitMessage
                        ],
                        cwd,
                        timeoutMs,
                        root
                    });

                return res.json({
                    ...result,
                    action:
                        "commit",
                    message:
                        commitMessage,
                    status:
                        result.ok
                            ? "GIT_COMMIT_OK"
                            : "GIT_COMMIT_FAILED"
                });
            }

            if (normalizedAction === "push") {
                if (approvedWrite !== true) {
                    return res.status(403).json({
                        ok: false,
                        status: "GIT_APPROVAL_REQUIRED",
                        error: "APPROVAL_REQUIRED: git push",
                        action:
                            normalizedAction,
                        version:
                            JARVIS_FS_BRIDGE_VERSION
                    });
                }

                const safeRemote =
                    String(remote || "origin").trim();

                const safeBranch =
                    String(branch || "").trim();

                if (
                    !/^[A-Za-z0-9._/-]+$/.test(safeRemote) ||
                    !/^[A-Za-z0-9._/-]+$/.test(safeBranch)
                ) {
                    return res.status(400).json({
                        ok: false,
                        status: "GIT_PUSH_TARGET_INVALID",
                        error: "PUSH_TARGET_INVALID",
                        remote:
                            safeRemote,
                        branch:
                            safeBranch,
                        version:
                            JARVIS_FS_BRIDGE_VERSION
                    });
                }

                result =
                    await runGitWorkflowCommand({
                        args: [
                            "push",
                            safeRemote,
                            safeBranch
                        ],
                        cwd,
                        timeoutMs,
                        root
                    });

                return res.json({
                    ...result,
                    action:
                        "push",
                    remote:
                        safeRemote,
                    branch:
                        safeBranch,
                    status:
                        result.ok
                            ? "GIT_PUSH_OK"
                            : "GIT_PUSH_FAILED"
                });
            }

            return res.status(400).json({
                ok: false,
                status: "GIT_ACTION_NOT_ALLOWED",
                error: "GIT_ACTION_NOT_ALLOWED",
                action:
                    normalizedAction,
                allowedActions: [
                    "status",
                    "diff",
                    "diffCached",
                    "add",
                    "commit",
                    "push"
                ],
                version:
                    JARVIS_FS_BRIDGE_VERSION
            });
        }
        catch(error) {
            return res.status(500).json({
                ok: false,
                status: "GIT_ENDPOINT_FAILED",
                error:
                    error.message,
                version:
                    JARVIS_FS_BRIDGE_VERSION
            });
        }
    });
    
    return app;
}

export function startJarvisFsBridge({
    port =
        Number(process.env.JARVIS_FS_BRIDGE_PORT) ||
        3344,
    root = DEFAULT_ROOT
} = {}) {
    const app =
        createJarvisFsBridgeApp({
            root
        });

    return app.listen(port, () => {
        console.log(
            `[JARVIS_FS_BRIDGE] v${JARVIS_FS_BRIDGE_VERSION} online http://localhost:${port}`
        );
        console.log(
            `[JARVIS_FS_BRIDGE_ROOT] ${path.resolve(root)}`
        );
    });
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === MODULE_FILE
) {
    startJarvisFsBridge();
}
