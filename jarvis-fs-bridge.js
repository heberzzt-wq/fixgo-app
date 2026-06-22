import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const JARVIS_FS_BRIDGE_VERSION =
    "2.0.0-local-fs-bridge";

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
