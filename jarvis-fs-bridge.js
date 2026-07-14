import express from "express";
import cors from "cors";
import fs from "fs";
import os from "os";
import path from "path";
import * as tls from "node:tls";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "url";
import { execFileSync, spawn } from "child_process";

export const JARVIS_FS_BRIDGE_VERSION =
    "2.7.0-chunked-multimodal-ingestion";

const MAX_JARVIS_UPLOAD_FILES = 30;
const MAX_JARVIS_UPLOAD_BYTES = 250 * 1024 * 1024;
const MAX_JARVIS_UPLOAD_BATCH_BYTES = 500 * 1024 * 1024;
const MAX_JARVIS_UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_JARVIS_LEGACY_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_JARVIS_ARTIFACT_READ_BYTES = 20 * 1024 * 1024;
const JARVIS_UPLOAD_EXTENSIONS = new Set([
    ".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml", ".pdf",
    ".docx", ".xlsx", ".pptx",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
    ".mp3", ".wav", ".m4a", ".mp4", ".webm", ".mov",
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".html",
    ".py", ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".sql", ".zip"
]);

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

const RUNTIME_CONTRACT_FILE =
    "jarvis-runtime-contract.json";

export function readJarvisRuntimeContract(
    root = DEFAULT_ROOT
) {
    try {
        const contractPath =
            path.join(
                path.resolve(root),
                RUNTIME_CONTRACT_FILE
            );

        const contract =
            JSON.parse(
                fs.readFileSync(
                    contractPath,
                    "utf8"
                )
            );

        return {
            ok: true,
            projectId:
                String(contract.projectId || ""),
            branch:
                String(contract.branch || ""),
            releaseId:
                String(contract.releaseId || ""),
            contractPath
        };
    }
    catch(error) {
        return {
            ok: false,
            status: "RUNTIME_CONTRACT_MISSING",
            error:
                error?.message || String(error),
            projectId: "",
            branch: "",
            releaseId: ""
        };
    }
}

function readGitIdentity(
    root = DEFAULT_ROOT
) {
    const run = args => {
        try {
            return execFileSync(
                "git",
                args,
                {
                    cwd:
                        path.resolve(root),
                    encoding:
                        "utf8",
                    stdio: [
                        "ignore",
                        "pipe",
                        "ignore"
                    ]
                }
            ).trim();
        }
        catch {
            return "";
        }
    };

    return {
        root:
            run(["rev-parse", "--show-toplevel"]),
        branch:
            run(["branch", "--show-current"]),
        head:
            run(["rev-parse", "HEAD"]),
        remote:
            run(["remote", "get-url", "origin"])
    };
}

export function describeJarvisBridgeIdentity(
    root = DEFAULT_ROOT
) {
    const contract =
        readJarvisRuntimeContract(root);

    const git =
        readGitIdentity(root);

    const compatible =
        contract.ok === true &&
        Boolean(git.root) &&
        contract.branch === git.branch;

    return {
        ok: compatible,
        status:
            compatible
                ? "BRIDGE_IDENTITY_OK"
                : "BRIDGE_IDENTITY_INVALID",
        root:
            path.resolve(root),
        contract,
        git
    };
}

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

function describeArtifactEvidence(relativeDirectory, extensions = []) {
    try {
        const directory = path.resolve(DEFAULT_ROOT, relativeDirectory);
        const allowed = new Set(extensions.map(item => item.toLowerCase()));
        const files = fs.readdirSync(directory, { withFileTypes: true })
            .filter(entry => entry.isFile() && allowed.has(path.extname(entry.name).toLowerCase()))
            .map(entry => {
                const stat = fs.statSync(path.join(directory, entry.name));
                return { name: entry.name, bytes: stat.size, updatedAt: stat.mtime.toISOString() };
            })
            .filter(file => file.bytes > 0)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        return {
            verifiedCount: files.length,
            latest: files[0] || null
        };
    } catch {
        return { verifiedCount: 0, latest: null };
    }
}

export function describeJarvisFsBridge() {
    const browserExecutable = resolveChromeExecutable();
    const uploadEvidence = describeArtifactEvidence(
        ".jarvis-artifacts/uploads",
        [...JARVIS_UPLOAD_EXTENSIONS]
    );
    const imageEvidence = describeArtifactEvidence(
        ".jarvis-artifacts/images",
        [".png", ".jpg", ".jpeg", ".webp"]
    );

    return {
        ok: true,
        version:
            JARVIS_FS_BRIDGE_VERSION,
        policy:
            JARVIS_FS_BRIDGE_POLICY,
        root:
            DEFAULT_ROOT,
        actuators: {
            browser: {
                available: Boolean(browserExecutable),
                engine: browserExecutable
                    ? path.basename(browserExecutable)
                    : null,
                actions: ["inspect", "screenshot", "pdf", "open"]
            },
            documents: {
                available: true,
                formats: [
                    "html", "md", "txt", "csv", "json",
                    "docx", "xlsx", "pptx", "pdf"
                ],
                nativeOffice: true
            },
            multimodalUploads: {
                available: true,
                transport: "chunked_progressive",
                maxFilesPerRequest: MAX_JARVIS_UPLOAD_FILES,
                maxFileBytes: MAX_JARVIS_UPLOAD_BYTES,
                maxBatchBytes: MAX_JARVIS_UPLOAD_BATCH_BYTES,
                maxChunkBytes: MAX_JARVIS_UPLOAD_CHUNK_BYTES,
                resumablePersistedArtifacts: true,
                artifactDownload: true,
                ...uploadEvidence
            },
            imageGeneration: {
                available: true,
                persistedArtifacts: true,
                ...imageEvidence
            },
            webResearch: {
                available: true,
                grounded: true,
                engine: "duckduckgo-html-with-bing-rss-fallback"
            },
            connectors: {
                available: true,
                adapters: ["github", "firebase"],
                verification: "live-read-only"
            }
        }
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

function resolveChromeExecutable() {
    const candidates =
        process.platform === "win32"
            ? [
                process.env.CHROME_PATH,
                path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
                path.join(process.env["PROGRAMFILES(X86)"] || "", "Google/Chrome/Application/chrome.exe"),
                path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
                path.join(process.env.PROGRAMFILES || "", "Microsoft/Edge/Application/msedge.exe")
            ]
            : [
                process.env.CHROME_PATH,
                "/usr/bin/google-chrome",
                "/usr/bin/chromium",
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            ];

    return candidates
        .filter(Boolean)
        .find(candidate => fs.existsSync(candidate)) || null;
}

function normalizeBrowserUrl(value = "") {
    const url = new URL(String(value || "").trim());

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("BROWSER_URL_PROTOCOL_NOT_ALLOWED");
    }

    return url.toString();
}

async function runProcess(executable, args, {
    cwd = DEFAULT_ROOT,
    timeoutMs = 45000
} = {}) {
    const startedAt = Date.now();

    return await new Promise(resolve => {
        const child = spawn(executable, args, {
            cwd,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        let finished = false;
        const timer = setTimeout(() => {
            if (finished) return;
            finished = true;
            child.kill("SIGTERM");
            resolve({
                ok: false,
                status: "PROCESS_TIMEOUT",
                stdout,
                stderr,
                durationMs: Date.now() - startedAt
            });
        }, Math.max(5000, Number(timeoutMs) || 45000));

        child.stdout.on("data", chunk => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", chunk => {
            stderr += chunk.toString();
        });
        child.on("error", error => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            resolve({
                ok: false,
                status: "PROCESS_SPAWN_FAILED",
                error: error.message,
                stdout,
                stderr,
                durationMs: Date.now() - startedAt
            });
        });
        child.on("close", code => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            resolve({
                ok: code === 0,
                status: code === 0 ? "PROCESS_OK" : "PROCESS_FAILED",
                exitCode: code,
                stdout,
                stderr,
                durationMs: Date.now() - startedAt
            });
        });
    });
}

function artifactPath(file, root = DEFAULT_ROOT, extensions = []) {
    const normalized = String(file || "").trim().replace(/\\/g, "/");

    if (!normalized.startsWith(".jarvis-artifacts/")) {
        throw new Error("ARTIFACT_PATH_REQUIRED");
    }

    const target = resolveRepoPath(normalized, root);
    const extension = path.extname(target).toLowerCase();

    if (extensions.length > 0 && !extensions.includes(extension)) {
        throw new Error("ARTIFACT_EXTENSION_NOT_ALLOWED");
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    return target;
}

export function saveGeneratedImageArtifact({
    imageBase64 = "",
    mimeType = "image/png",
    output = "",
    root = DEFAULT_ROOT
} = {}) {
    const imageTypes = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp"
    };
    const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
    const extension = imageTypes[normalizedMimeType];

    if (!extension) {
        throw new Error("IMAGE_MIME_TYPE_NOT_ALLOWED");
    }

    const normalizedBase64 = String(imageBase64 || "").trim();
    if (!normalizedBase64 || normalizedBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedBase64)) {
        throw new Error("IMAGE_BASE64_INVALID");
    }
    const bytes = Buffer.from(normalizedBase64, "base64");
    if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) {
        throw new Error("IMAGE_BYTES_OUT_OF_RANGE");
    }

    const relativeOutput = String(output || "").trim() ||
        `.jarvis-artifacts/images/jarvis-${Date.now()}${extension}`;
    const target = artifactPath(relativeOutput, root, [extension]);
    fs.writeFileSync(target, bytes);

    return {
        ok: true,
        status: "IMAGE_SAVED",
        output: path.relative(path.resolve(root), target).replace(/\\/g, "/"),
        bytes: bytes.length,
        mimeType: normalizedMimeType
    };
}

function decodeBoundedBase64(dataBase64 = "", maxBytes = MAX_JARVIS_UPLOAD_BYTES) {
    const normalized = String(dataBase64 || "").trim();
    if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
        throw new Error("ARTIFACT_BASE64_INVALID");
    }

    const bytes = Buffer.from(normalized, "base64");
    if (bytes.length === 0 || bytes.length > maxBytes) {
        throw new Error("ARTIFACT_BYTES_OUT_OF_RANGE");
    }
    return bytes;
}

function artifactMimeType(file = "") {
    const mimeTypes = {
        ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv",
        ".json": "application/json", ".xml": "application/xml",
        ".yaml": "application/yaml", ".yml": "application/yaml", ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
        ".webp": "image/webp", ".gif": "image/gif", ".mp3": "audio/mpeg",
        ".wav": "audio/wav", ".m4a": "audio/mp4", ".mp4": "video/mp4",
        ".webm": "video/webm", ".mov": "video/quicktime", ".js": "text/javascript",
        ".mjs": "text/javascript", ".cjs": "text/javascript", ".ts": "text/typescript",
        ".tsx": "text/typescript", ".jsx": "text/javascript", ".css": "text/css",
        ".html": "text/html", ".py": "text/x-python", ".sql": "application/sql",
        ".zip": "application/zip"
    };
    return mimeTypes[path.extname(String(file || "")).toLowerCase()] || "application/octet-stream";
}

function detectArtifactMimeType(file, originalName = "") {
    const descriptor = fs.openSync(file, "r");
    const header = Buffer.alloc(32);
    let length = 0;
    try { length = fs.readSync(descriptor, header, 0, header.length, 0); }
    finally { fs.closeSync(descriptor); }
    const bytes = header.subarray(0, length);
    const ascii = bytes.toString("latin1");
    if (ascii.startsWith("%PDF-")) return "application/pdf";
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "image/gif";
    if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
    if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE") return "audio/wav";
    if (ascii.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "audio/mpeg";
    if (ascii.slice(4, 8) === "ftyp") return path.extname(originalName).toLowerCase() === ".m4a" ? "audio/mp4" : "video/mp4";
    if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
        return [".docx", ".xlsx", ".pptx"].includes(path.extname(originalName).toLowerCase())
            ? artifactMimeType(originalName)
            : "application/zip";
    }
    return artifactMimeType(originalName);
}

function normalizeUploadDescriptor(name = "") {
    const originalName = path.basename(String(name || "").trim());
    const extension = path.extname(originalName).toLowerCase();
    if (!originalName || !JARVIS_UPLOAD_EXTENSIONS.has(extension)) {
        throw new Error("UPLOAD_EXTENSION_NOT_ALLOWED");
    }
    const baseName = path.basename(originalName, extension)
        .normalize("NFKD")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "archivo";
    return { originalName, extension, baseName };
}

function uploadSessionPaths(uploadId, root = DEFAULT_ROOT) {
    const safeId = String(uploadId || "").trim();
    if (!/^[a-f0-9-]{20,80}$/i.test(safeId)) throw new Error("UPLOAD_ID_INVALID");
    const directory = path.resolve(root, ".jarvis-artifacts/uploads/.sessions");
    const uploadRoot = path.resolve(root, ".jarvis-artifacts/uploads");
    if (directory !== uploadRoot && !directory.startsWith(`${uploadRoot}${path.sep}`)) {
        throw new Error("UPLOAD_SESSION_PATH_INVALID");
    }
    fs.mkdirSync(directory, { recursive: true });
    return {
        part: path.join(directory, `${safeId}.part`),
        metadata: path.join(directory, `${safeId}.json`)
    };
}

function readUploadSession(uploadId, root = DEFAULT_ROOT) {
    const paths = uploadSessionPaths(uploadId, root);
    if (!fs.existsSync(paths.metadata)) throw new Error("UPLOAD_SESSION_NOT_FOUND");
    return { paths, metadata: JSON.parse(fs.readFileSync(paths.metadata, "utf8")) };
}

function writeUploadSession(paths, metadata) {
    fs.writeFileSync(paths.metadata, JSON.stringify(metadata, null, 2), "utf8");
}

function uploadBatchLedger(batchId, root = DEFAULT_ROOT) {
    const safeBatchId = String(batchId || "").trim();
    if (!/^[A-Za-z0-9._-]{8,100}$/.test(safeBatchId)) throw new Error("UPLOAD_BATCH_ID_INVALID");
    const directory = path.resolve(root, ".jarvis-artifacts/uploads/.batches");
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `${safeBatchId}.json`);
    let usage = { batchId: safeBatchId, files: 0, bytes: 0, completedFiles: 0 };
    try { usage = { ...usage, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch {}
    return { file, usage };
}

function writeBatchLedger(batch, usage) {
    fs.writeFileSync(batch.file, JSON.stringify({ ...usage, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

export function startChunkedUpload({
    batchId = "", name = "", mimeType = "application/octet-stream", expectedBytes = 0,
    caseId = null, objectiveId = null, root = DEFAULT_ROOT
} = {}) {
    const safeBatchId = String(batchId || "").trim();
    if (!/^[A-Za-z0-9._-]{8,100}$/.test(safeBatchId)) throw new Error("UPLOAD_BATCH_ID_INVALID");
    const descriptor = normalizeUploadDescriptor(name);
    const size = Number(expectedBytes || 0);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_JARVIS_UPLOAD_BYTES) {
        throw new Error("UPLOAD_FILE_BYTES_OUT_OF_RANGE");
    }
    const batch = uploadBatchLedger(safeBatchId, root);
    const usage = batch.usage;
    if (usage.files >= MAX_JARVIS_UPLOAD_FILES) throw new Error("UPLOAD_BATCH_FILE_LIMIT");
    if (usage.bytes + size > MAX_JARVIS_UPLOAD_BATCH_BYTES) throw new Error("UPLOAD_BATCH_BYTES_OUT_OF_RANGE");

    const uploadId = randomUUID();
    const paths = uploadSessionPaths(uploadId, root);
    fs.writeFileSync(paths.part, Buffer.alloc(0));
    const metadata = {
        uploadId, batchId: safeBatchId, name: descriptor.originalName,
        mimeType: String(mimeType || artifactMimeType(descriptor.originalName)),
        detectedMimeType: artifactMimeType(descriptor.originalName), expectedBytes: size,
        receivedBytes: 0, caseId: caseId || null, objectiveId: objectiveId || null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    writeUploadSession(paths, metadata);
    writeBatchLedger(batch, { ...usage, files: usage.files + 1, bytes: usage.bytes + size });
    return { ok: true, status: "UPLOAD_SESSION_READY", ...metadata, maxChunkBytes: MAX_JARVIS_UPLOAD_CHUNK_BYTES };
}

export function appendChunkedUpload({ uploadId = "", offset = 0, dataBase64 = "", root = DEFAULT_ROOT } = {}) {
    const session = readUploadSession(uploadId, root);
    const expectedOffset = Number(offset || 0);
    if (expectedOffset !== session.metadata.receivedBytes) throw new Error("UPLOAD_CHUNK_OFFSET_MISMATCH");
    const bytes = decodeBoundedBase64(dataBase64, MAX_JARVIS_UPLOAD_CHUNK_BYTES);
    if (session.metadata.receivedBytes + bytes.length > session.metadata.expectedBytes) {
        throw new Error("UPLOAD_CHUNK_EXCEEDS_EXPECTED_BYTES");
    }
    fs.appendFileSync(session.paths.part, bytes);
    session.metadata.receivedBytes += bytes.length;
    session.metadata.updatedAt = new Date().toISOString();
    writeUploadSession(session.paths, session.metadata);
    return {
        ok: true, status: "UPLOAD_CHUNK_SAVED", uploadId: session.metadata.uploadId,
        receivedBytes: session.metadata.receivedBytes, expectedBytes: session.metadata.expectedBytes,
        progress: Math.round((session.metadata.receivedBytes / session.metadata.expectedBytes) * 100)
    };
}

function sha256FileBounded(file) {
    const hash = createHash("sha256");
    const descriptor = fs.openSync(file, "r");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    try {
        let bytesRead = 0;
        do {
            bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
            if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
        } while (bytesRead > 0);
    } finally {
        fs.closeSync(descriptor);
    }
    return hash.digest("hex");
}

export function completeChunkedUpload({ uploadId = "", root = DEFAULT_ROOT } = {}) {
    const session = readUploadSession(uploadId, root);
    const actualBytes = fs.statSync(session.paths.part).size;
    if (actualBytes !== session.metadata.expectedBytes || actualBytes !== session.metadata.receivedBytes) {
        throw new Error("UPLOAD_INCOMPLETE");
    }
    const descriptor = normalizeUploadDescriptor(session.metadata.name);
    const hash = sha256FileBounded(session.paths.part);
    const detectedMimeType = detectArtifactMimeType(session.paths.part, session.metadata.name);
    const relativeOutput = `.jarvis-artifacts/uploads/${Date.now()}-${hash.slice(0, 12)}-${descriptor.baseName}${descriptor.extension}`;
    const target = artifactPath(relativeOutput, root, [descriptor.extension]);
    fs.renameSync(session.paths.part, target);
    fs.rmSync(session.paths.metadata, { force: true });
    const batch = uploadBatchLedger(session.metadata.batchId, root);
    writeBatchLedger(batch, { ...batch.usage, completedFiles: Number(batch.usage.completedFiles || 0) + 1 });
    return {
        ok: true, status: "UPLOAD_SAVED", output: relativeOutput, name: session.metadata.name,
        bytes: actualBytes, sha256: hash, mimeType: session.metadata.mimeType,
        detectedMimeType, caseId: session.metadata.caseId,
        objectiveId: session.metadata.objectiveId, batchId: session.metadata.batchId
    };
}

export function cancelChunkedUpload({ uploadId = "", root = DEFAULT_ROOT } = {}) {
    const paths = uploadSessionPaths(uploadId, root);
    const existed = fs.existsSync(paths.part) || fs.existsSync(paths.metadata);
    let metadata = null;
    try { metadata = JSON.parse(fs.readFileSync(paths.metadata, "utf8")); } catch {}
    fs.rmSync(paths.part, { force: true });
    fs.rmSync(paths.metadata, { force: true });
    if (metadata?.batchId) {
        const batch = uploadBatchLedger(metadata.batchId, root);
        writeBatchLedger(batch, {
            ...batch.usage,
            files: Math.max(0, Number(batch.usage.files || 0) - 1),
            bytes: Math.max(0, Number(batch.usage.bytes || 0) - Number(metadata.expectedBytes || 0))
        });
    }
    return { ok: true, status: existed ? "UPLOAD_CANCELLED" : "UPLOAD_ALREADY_GONE", uploadId };
}

export function saveUploadedArtifact({
    name = "",
    mimeType = "application/octet-stream",
    dataBase64 = "",
    root = DEFAULT_ROOT
} = {}) {
    const { originalName, extension, baseName } = normalizeUploadDescriptor(name);

    const bytes = decodeBoundedBase64(dataBase64, MAX_JARVIS_LEGACY_UPLOAD_BYTES);
    const relativeOutput = `.jarvis-artifacts/uploads/${Date.now()}-${baseName}${extension}`;
    const target = artifactPath(relativeOutput, root, [extension]);
    fs.writeFileSync(target, bytes);

    return {
        ok: true,
        status: "UPLOAD_SAVED",
        output: relativeOutput,
        name: originalName,
        bytes: bytes.length,
        mimeType: String(mimeType || artifactMimeType(originalName)),
        detectedMimeType: artifactMimeType(originalName)
    };
}

export function readArtifactPayload({
    output = "",
    root = DEFAULT_ROOT
} = {}) {
    const relativeOutput = String(output || "").trim().replace(/\\/g, "/");
    const target = artifactPath(relativeOutput, root);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        throw new Error("ARTIFACT_NOT_FOUND");
    }

    const bytes = fs.readFileSync(target);
    if (bytes.length === 0 || bytes.length > MAX_JARVIS_ARTIFACT_READ_BYTES) {
        throw new Error("ARTIFACT_READ_BYTES_OUT_OF_RANGE");
    }

    return {
        ok: true,
        status: "ARTIFACT_READ",
        output: relativeOutput,
        fileName: path.basename(target),
        mimeType: artifactMimeType(target),
        bytes: bytes.length,
        dataBase64: bytes.toString("base64")
    };
}

function decodeXml(value = "") {
    return String(value || "")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
            String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&#(\d+);/g, (_, code) =>
            String.fromCodePoint(Number.parseInt(code, 10)))
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function stripMarkup(value = "") {
    return decodeXml(value)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function extractRssTag(item = "", tag = "") {
    return decodeXml(
        item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || ""
    ).trim();
}

function normalizeDuckDuckGoUrl(value = "") {
    const decoded = decodeXml(value).trim();
    if (!decoded) return "";

    try {
        const candidate = decoded.startsWith("//")
            ? `https:${decoded}`
            : decoded;
        const parsed = new URL(candidate);
        const redirected = parsed.hostname.endsWith("duckduckgo.com")
            ? parsed.searchParams.get("uddg")
            : "";
        return redirected || candidate;
    } catch {
        return "";
    }
}

function extractDuckDuckGoSources(html = "") {
    const results = [];
    const blocks = String(html || "").split(/<div class="result results_links[^>]*>/i).slice(1);

    for (const block of blocks) {
        const titleMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!titleMatch) continue;

        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
        const url = normalizeDuckDuckGoUrl(titleMatch[1]);
        if (!/^https?:\/\//i.test(url)) continue;

        results.push({
            title: stripMarkup(titleMatch[2]).slice(0, 180),
            url,
            summary: stripMarkup(snippetMatch?.[1] || "").slice(0, 500)
        });
    }

    return results;
}

function ensureSystemCertificates() {
    if (
        typeof tls.getCACertificates === "function" &&
        typeof tls.setDefaultCACertificates === "function"
    ) {
        const certificates = [
            ...tls.getCACertificates("default"),
            ...tls.getCACertificates("system")
        ];
        tls.setDefaultCACertificates([...new Set(certificates)]);
    }
}

export async function runLocalWebResearch(query = "", timeoutMs = 20000) {
    const normalizedQuery = String(query || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);

    if (normalizedQuery.length < 5) {
        throw new Error("WEB_RESEARCH_QUERY_REQUIRED");
    }

    ensureSystemCertificates();

    const boundedTimeoutMs = Math.min(Math.max(Number(timeoutMs) || 20000, 5000), 30000);
    let engine = "jarvis_local_duckduckgo_html_research";
    let candidates = [];

    try {
        const response = await fetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}`,
            {
                headers: { "User-Agent": "Mozilla/5.0 JarvisV7/1.0" },
                signal: AbortSignal.timeout(boundedTimeoutMs)
            }
        );
        if (response.ok) {
            candidates = extractDuckDuckGoSources(await response.text());
        }
    } catch {
        candidates = [];
    }

    if (candidates.length === 0) {
        engine = "jarvis_local_bing_rss_research";
        const response = await fetch(
            `https://www.bing.com/search?format=rss&q=${encodeURIComponent(normalizedQuery)}`,
            {
                headers: { "User-Agent": "Mozilla/5.0 JarvisV7/1.0" },
                signal: AbortSignal.timeout(boundedTimeoutMs)
            }
        );
        if (!response.ok) throw new Error(`WEB_SEARCH_HTTP_${response.status}`);
        const rss = await response.text();
        candidates = (rss.match(/<item>[\s\S]*?<\/item>/gi) || []).map(item => ({
            title: stripMarkup(extractRssTag(item, "title")).slice(0, 180),
            url: extractRssTag(item, "link"),
            summary: stripMarkup(extractRssTag(item, "description")).slice(0, 500)
        }));
    }

    const seen = new Set();
    const sources = candidates
        .filter(source => {
            if (!/^https?:\/\//i.test(source.url) || seen.has(source.url)) return false;
            seen.add(source.url);
            return true;
        })
        .slice(0, 6)
        .map((source, index) => ({ id: index + 1, ...source }));

    if (sources.length === 0) {
        throw new Error("WEB_RESEARCH_NO_SOURCES");
    }

    return {
        ok: true,
        grounded: true,
        status: "GROUNDED_LOCAL_SEARCH",
        engine,
        query: normalizedQuery,
        answer: [
            `Encontre ${sources.length} fuentes web para: ${normalizedQuery}`,
            "",
            ...sources.slice(0, 4).map(source =>
                `[${source.id}] ${source.title}: ${source.summary || "Sin resumen disponible."}`
            )
        ].join("\n"),
        sources: sources.map(({ summary, ...source }) => source),
        supports: sources.map(source => ({
            text: source.summary || source.title,
            sourceIds: [source.id]
        })),
        sourceCount: sources.length,
        searchQueries: [normalizedQuery],
        readOnly: true,
        policy: {
            citationsRequired: true,
            externalSideEffects: false,
            fallback: true
        }
    };
}

function readJsonFileSafe(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        return null;
    }
}

function sanitizeRemoteUrl(value = "") {
    const remote = String(value || "").trim();
    if (!remote) return "";

    try {
        const parsed = new URL(remote);
        parsed.username = "";
        parsed.password = "";
        return parsed.toString().replace(/\/$/, "");
    } catch {
        return remote.replace(/:\/\/[^/@]+@/, "://");
    }
}

export async function inspectLocalConnectors({
    root = DEFAULT_ROOT,
    fetchImpl = globalThis.fetch,
    gitProbe = null,
    timeoutMs = 10000
} = {}) {
    ensureSystemCertificates();
    const resolvedRoot = path.resolve(root);
    const identity = readGitIdentity(resolvedRoot);
    const remote = sanitizeRemoteUrl(identity.remote);
    const probeGit = typeof gitProbe === "function"
        ? gitProbe
        : () => {
            execFileSync("git", ["ls-remote", "--exit-code", "origin", "HEAD"], {
                cwd: resolvedRoot,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
                timeout: Math.min(Math.max(Number(timeoutMs) || 10000, 2000), 20000)
            });
            return true;
        };

    let githubConnected = false;
    if (remote) {
        try {
            githubConnected = await probeGit(remote) === true;
        } catch {
            githubConnected = false;
        }
    }

    const firebaseRc = readJsonFileSafe(path.join(resolvedRoot, ".firebaserc"));
    const firebaseConfig = readJsonFileSafe(path.join(resolvedRoot, "firebase.json"));
    const projectId = String(firebaseRc?.projects?.default || "").trim();
    const hostingSite = String(firebaseConfig?.hosting?.site || projectId).trim();
    const hostingUrl = hostingSite ? `https://${hostingSite}.web.app/` : "";
    let firebaseConnected = false;
    let hostingStatus = null;

    if (hostingUrl && typeof fetchImpl === "function") {
        try {
            const response = await fetchImpl(hostingUrl, {
                method: "HEAD",
                signal: AbortSignal.timeout(
                    Math.min(Math.max(Number(timeoutMs) || 10000, 2000), 20000)
                )
            });
            hostingStatus = response.status;
            firebaseConnected = response.ok === true;
        } catch {
            firebaseConnected = false;
        }
    }

    const connectors = [
        {
            id: "github",
            connected: githubConnected,
            endpoint: remote || null,
            capabilities: ["repository.remote", "git.fetch", "git.push.governed"],
            evidence: {
                remoteConfigured: Boolean(remote),
                remoteReachable: githubConnected,
                branch: identity.branch || null
            }
        },
        {
            id: "firebase",
            connected: firebaseConnected,
            endpoint: hostingUrl || null,
            capabilities: ["hosting.inspect", "hosting.deploy.governed", "functions.invoke"],
            evidence: {
                projectConfigured: Boolean(projectId),
                projectId: projectId || null,
                hostingStatus
            }
        }
    ];

    return {
        ok: true,
        status: connectors.every(item => item.connected)
            ? "CONNECTORS_VERIFIED"
            : connectors.some(item => item.connected)
                ? "CONNECTORS_PARTIAL"
                : "NO_CONNECTORS_VERIFIED",
        connectors,
        connectedCount: connectors.filter(item => item.connected).length,
        checkedAt: new Date().toISOString(),
        readOnly: true
    };
}

export function createJarvisFsBridgeApp({
    root = DEFAULT_ROOT
} = {}) {
    const app =
        express();

    const allowedOrigins = new Set([
        "https://fixgo-44e4d.web.app",
        "https://fixgo-44e4d.firebaseapp.com",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:5500",
        "http://127.0.0.1:5500"
    ]);

    app.use(cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.has(origin)) {
                return callback(null, true);
            }

            return callback(new Error("BRIDGE_ORIGIN_NOT_ALLOWED"));
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "X-Jarvis-Release-Id"]
    }));

    app.use(express.json({
        limit: "25mb"
    }));

    app.get("/health", (req, res) => {
        const identity =
            describeJarvisBridgeIdentity(root);

        res.json({
            ...describeJarvisFsBridge(),
            root:
                path.resolve(root),
            identity
        });
    });

    app.use((req, res, next) => {
        if (req.method !== "POST") {
            return next();
        }

        const identity =
            describeJarvisBridgeIdentity(root);

        if (identity.ok !== true) {
            return res.status(503).json({
                ok: false,
                status: "BRIDGE_IDENTITY_INVALID",
                error: "BRIDGE_IDENTITY_INVALID",
                identity,
                version:
                    JARVIS_FS_BRIDGE_VERSION
            });
        }

        const expectedReleaseId =
            String(
                req.get("X-Jarvis-Release-Id") ||
                ""
            );

        if (
            !expectedReleaseId ||
            expectedReleaseId !== identity.contract.releaseId
        ) {
            return res.status(409).json({
                ok: false,
                status: "BRIDGE_RELEASE_MISMATCH",
                error: "BRIDGE_RELEASE_MISMATCH",
                expectedReleaseId,
                actualReleaseId:
                    identity.contract.releaseId,
                identity,
                version:
                    JARVIS_FS_BRIDGE_VERSION
            });
        }

        return next();
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

    app.post("/browser", async (req, res) => {
        try {
            const {
                action = "inspect",
                url: rawUrl,
                output = ".jarvis-artifacts/browser/latest.png",
                timeoutMs = 45000
            } = req.body || {};
            const url = normalizeBrowserUrl(rawUrl);
            const chrome = resolveChromeExecutable();

            if (!chrome) {
                return res.status(503).json({
                    ok: false,
                    status: "BROWSER_EXECUTABLE_NOT_FOUND",
                    error: "BROWSER_EXECUTABLE_NOT_FOUND",
                    version: JARVIS_FS_BRIDGE_VERSION
                });
            }

            if (action === "open") {
                const child = spawn(chrome, [url], {
                    detached: true,
                    shell: false,
                    stdio: "ignore"
                });
                child.unref();

                return res.json({
                    ok: true,
                    status: "BROWSER_OPENED",
                    action,
                    url,
                    engine: path.basename(chrome),
                    version: JARVIS_FS_BRIDGE_VERSION
                });
            }

            const args = [
                "--headless=new",
                "--disable-gpu",
                "--disable-background-networking",
                "--disable-component-update",
                "--disable-default-apps",
                "--disable-dev-shm-usage",
                "--disable-extensions",
                "--disable-sync",
                "--metrics-recording-only",
                "--no-first-run",
                "--hide-scrollbars"
            ];
            const profileDir = fs.mkdtempSync(
                path.join(os.tmpdir(), "jarvis-browser-")
            );
            args.push(`--user-data-dir=${profileDir}`);

            let outputFile = null;
            if (action === "inspect") {
                args.push("--dump-dom", url);
            }
            else if (action === "screenshot") {
                outputFile = artifactPath(output, root, [".png"]);
                args.push("--window-size=1440,1100", `--screenshot=${outputFile}`, url);
            }
            else if (action === "pdf") {
                outputFile = artifactPath(output, root, [".pdf"]);
                args.push(`--print-to-pdf=${outputFile}`, "--no-pdf-header-footer", url);
            }
            else {
                return res.status(400).json({
                    ok: false,
                    status: "BROWSER_ACTION_NOT_ALLOWED",
                    allowedActions: ["inspect", "screenshot", "pdf", "open"],
                    action,
                    version: JARVIS_FS_BRIDGE_VERSION
                });
            }

            let result;
            try {
                result = await runProcess(chrome, args, {
                    cwd: path.resolve(root),
                    timeoutMs
                });
            }
            finally {
                fs.rmSync(profileDir, {
                    recursive: true,
                    force: true
                });
            }
            const relativeOutput = outputFile
                ? path.relative(path.resolve(root), outputFile).replace(/\\/g, "/")
                : null;

            return res.status(result.ok ? 200 : 502).json({
                ...result,
                status: result.ok ? `BROWSER_${action.toUpperCase()}_OK` : result.status,
                action,
                url,
                engine: path.basename(chrome),
                dom: action === "inspect" ? result.stdout.slice(0, 250000) : undefined,
                output: relativeOutput,
                outputExists: outputFile ? fs.existsSync(outputFile) : null,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
        catch(error) {
            const clientErrors = new Set([
                "Invalid URL",
                "BROWSER_URL_PROTOCOL_NOT_ALLOWED",
                "ARTIFACT_PATH_REQUIRED",
                "ARTIFACT_EXTENSION_NOT_ALLOWED",
                "PATH_OUTSIDE_REPO"
            ]);
            return res.status(clientErrors.has(error.message) ? 400 : 500).json({
                ok: false,
                status: "BROWSER_COMMAND_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

    app.post("/document", async (req, res) => {
        try {
            const {
                format = "html",
                output = `.jarvis-artifacts/documents/document.${format}`,
                content = "",
                title = "Documento Jarvis",
                rows = [],
                slides = []
            } = req.body || {};
            const normalizedFormat = String(format).toLowerCase();
            const allowed = new Set([
                "html", "md", "txt", "csv", "json",
                "docx", "xlsx", "pptx", "pdf"
            ]);

            if (!allowed.has(normalizedFormat)) {
                return res.status(400).json({
                    ok: false,
                    status: "DOCUMENT_FORMAT_NOT_ALLOWED",
                    allowedFormats: [...allowed],
                    version: JARVIS_FS_BRIDGE_VERSION
                });
            }
            if (
                (typeof content !== "string" || content.length === 0) &&
                (!Array.isArray(rows) || rows.length === 0) &&
                (!Array.isArray(slides) || slides.length === 0)
            ) {
                return res.status(400).json({
                    ok: false,
                    status: "DOCUMENT_CONTENT_REQUIRED",
                    version: JARVIS_FS_BRIDGE_VERSION
                });
            }

            const target = artifactPath(output, root, [`.${normalizedFormat}`]);
            const safeTitle = String(title).replace(/[<>&]/g, "");
            let body = content;

            if (normalizedFormat === "html") {
                body = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeTitle}</title><style>body{font:16px/1.55 system-ui;max-width:960px;margin:48px auto;padding:0 24px;color:#172033}pre{white-space:pre-wrap}</style></head><body><h1>${safeTitle}</h1><pre>${content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`;
                fs.writeFileSync(target, body, "utf8");
            }
            else if (["md", "txt", "csv", "json"].includes(normalizedFormat)) {
                fs.writeFileSync(target, body, "utf8");
            }
            else if (normalizedFormat === "docx") {
                const {
                    Document,
                    Packer,
                    Paragraph,
                    TextRun
                } = await import("docx");
                const document = new Document({
                    sections: [{
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: safeTitle, bold: true, size: 34 })],
                                spacing: { after: 320 }
                            }),
                            ...String(content).split(/\r?\n/).map(line =>
                                new Paragraph({ text: line || " ", spacing: { after: 120 } })
                            )
                        ]
                    }]
                });
                fs.writeFileSync(target, await Packer.toBuffer(document));
            }
            else if (normalizedFormat === "xlsx") {
                const ExcelJS = (await import("exceljs")).default;
                const workbook = new ExcelJS.Workbook();
                const sheet = workbook.addWorksheet(safeTitle.slice(0, 31) || "Jarvis");
                const tableRows = Array.isArray(rows) && rows.length > 0
                    ? rows
                    : String(content).split(/\r?\n/).filter(Boolean).map(line => line.split(","));
                tableRows.slice(0, 10000).forEach(row =>
                    sheet.addRow(Array.isArray(row) ? row : Object.values(row || {}))
                );
                if (sheet.rowCount > 0) {
                    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
                    sheet.getRow(1).fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: "FF2563EB" }
                    };
                    sheet.columns.forEach(column => {
                        column.width = Math.min(
                            48,
                            Math.max(12, ...column.values.slice(1).map(value => String(value || "").length + 2))
                        );
                    });
                }
                await workbook.xlsx.writeFile(target);
            }
            else if (normalizedFormat === "pptx") {
                const PptxGenJS = (await import("pptxgenjs")).default;
                const presentation = new PptxGenJS();
                presentation.layout = "LAYOUT_WIDE";
                presentation.author = "Jarvis V7";
                presentation.subject = safeTitle;
                presentation.title = safeTitle;
                presentation.company = "FixGo / GestiaPremium";
                presentation.lang = "es-MX";
                presentation.theme = {
                    headFontFace: "Aptos Display",
                    bodyFontFace: "Aptos",
                    lang: "es-MX"
                };
                const slideItems = Array.isArray(slides) && slides.length > 0
                    ? slides
                    : String(content).split(/\n---+\n/).map((bodyText, index) => ({
                        title: index === 0 ? safeTitle : `Seccion ${index + 1}`,
                        body: bodyText
                    }));
                slideItems.slice(0, 40).forEach(item => {
                    const slide = presentation.addSlide();
                    slide.background = { color: "F8FAFC" };
                    slide.addText(String(item?.title || safeTitle), {
                        x: 0.65, y: 0.5, w: 11.7, h: 0.7,
                        fontFace: "Aptos Display", fontSize: 26, bold: true, color: "0F172A"
                    });
                    slide.addShape(presentation.ShapeType.line, {
                        x: 0.65, y: 1.35, w: 2.2, h: 0,
                        line: { color: "2563EB", width: 4 }
                    });
                    slide.addText(String(item?.body || ""), {
                        x: 0.7, y: 1.7, w: 11.5, h: 5.2,
                        fontFace: "Aptos", fontSize: 18, color: "334155",
                        breakLine: false, valign: "top", margin: 0.06
                    });
                });
                await presentation.writeFile({ fileName: target });
            }
            else if (normalizedFormat === "pdf") {
                const PDFDocument = (await import("pdfkit")).default;
                await new Promise((resolve, reject) => {
                    const document = new PDFDocument({ margin: 54, size: "A4" });
                    const stream = fs.createWriteStream(target);
                    stream.on("finish", resolve);
                    stream.on("error", reject);
                    document.pipe(stream);
                    document.fontSize(22).fillColor("#0f172a").text(safeTitle);
                    document.moveDown();
                    document.fontSize(11).fillColor("#334155").text(String(content), {
                        align: "left",
                        lineGap: 3
                    });
                    document.end();
                });
            }

            const bytes = fs.statSync(target).size;

            return res.json({
                ok: true,
                status: "DOCUMENT_CREATED",
                format: normalizedFormat,
                output: path.relative(path.resolve(root), target).replace(/\\/g, "/"),
                bytes,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
        catch(error) {
            return res.status(400).json({
                ok: false,
                status: "DOCUMENT_CREATE_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

    app.post("/research", async (req, res) => {
        try {
            const result = await runLocalWebResearch(
                req.body?.query || req.body?.prompt || "",
                req.body?.timeoutMs || 20000
            );
            return res.json({
                ...result,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
        catch(error) {
            return res.status(
                error.message === "WEB_RESEARCH_QUERY_REQUIRED"
                    ? 400
                    : 502
            ).json({
                ok: false,
                grounded: false,
                status: "WEB_RESEARCH_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

    app.post("/image", (req, res) => {
        try {
            return res.json({
                ...saveGeneratedImageArtifact({
                    imageBase64: req.body?.imageBase64,
                    mimeType: req.body?.mimeType,
                    output: req.body?.output,
                    root
                }),
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({
                ok: false,
                status: "IMAGE_SAVE_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

    app.post("/upload", (req, res) => {
        try {
            return res.json({
                ...saveUploadedArtifact({
                    name: req.body?.name,
                    mimeType: req.body?.mimeType,
                    dataBase64: req.body?.dataBase64,
                    root
                }),
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({
                ok: false,
                status: "UPLOAD_SAVE_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

    app.post("/upload/start", (req, res) => {
        try {
            return res.json({
                ...startChunkedUpload({
                    batchId: req.body?.batchId,
                    name: req.body?.name,
                    mimeType: req.body?.mimeType,
                    expectedBytes: req.body?.expectedBytes,
                    caseId: req.body?.caseId,
                    objectiveId: req.body?.objectiveId,
                    root
                }),
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "UPLOAD_SESSION_FAILED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
    });

    app.post("/upload/chunk", (req, res) => {
        try {
            return res.json({
                ...appendChunkedUpload({
                    uploadId: req.body?.uploadId,
                    offset: req.body?.offset,
                    dataBase64: req.body?.dataBase64,
                    root
                }),
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "UPLOAD_CHUNK_FAILED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
    });

    app.post("/upload/complete", (req, res) => {
        try {
            return res.json({
                ...completeChunkedUpload({ uploadId: req.body?.uploadId, root }),
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "UPLOAD_COMPLETE_FAILED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
    });

    app.post("/upload/cancel", (req, res) => {
        try {
            return res.json({
                ...cancelChunkedUpload({ uploadId: req.body?.uploadId, root }),
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "UPLOAD_CANCEL_FAILED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
    });

    app.post("/artifact/read", (req, res) => {
        try {
            return res.json({
                ...readArtifactPayload({
                    output: req.body?.output,
                    root
                }),
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(error.message === "ARTIFACT_NOT_FOUND" ? 404 : 400).json({
                ok: false,
                status: "ARTIFACT_READ_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

    app.post("/connectors", async (req, res) => {
        try {
            const result = await inspectLocalConnectors({
                root,
                timeoutMs: req.body?.timeoutMs || 10000
            });
            return res.json({
                ...result,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(502).json({
                ok: false,
                status: "CONNECTOR_INSPECTION_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
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
