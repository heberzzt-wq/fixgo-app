import express from "express";
import cors from "cors";
import fs from "fs";
import os from "os";
import path from "path";
import * as tls from "node:tls";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "url";
import { execFileSync, spawn } from "child_process";
import {
    buildRepoIntelligence,
    rankRepoCandidates
} from "./jarvis-repo-intelligence.js";
import {
    buildPageArtifactHtml,
    describePageArtifact
} from "./jarvis-page-artifact.js";
import {
    validateWorkbookFormulaStructure
} from "./gestia-core/jarvis/jarvis.workbook.validator.js";
import {
    buildDocxArtifactBuffer,
    validateDocxArtifactFile
} from "./jarvis-docx-artifact.js";
import {
    buildReelStudioHtml,
    describeReelStudio
} from "./jarvis-reel-artifact.js";
import {
    findArtifact,
    listArtifacts,
    registerArtifact
} from "./jarvis-artifact-studio.js";
import {
    appendObservation,
    buildObservabilitySnapshot
} from "./jarvis-observability.js";
import { buildQuotePdfChanges } from "./jarvis-quote-calculator.js";
import { locatePdfFieldAnchors } from "./jarvis-pdf-layout.js";
import { verifyPdfVisualChanges } from "./jarvis-pdf-visual.js";

export const JARVIS_FS_BRIDGE_VERSION =
    "2.28.0-docx-contract-gate";

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

function safeFileStem(value = "artifact") {
    const normalized = String(value || "artifact").normalize("NFD").toLowerCase();
    let result = "";
    let separating = false;
    for (const character of normalized) {
        const code = character.charCodeAt(0);
        if (code >= 0x300 && code <= 0x36f) continue;
        const allowed = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
        if (allowed) {
            result += character;
            separating = false;
        } else if (result && !separating) {
            result += "-";
            separating = true;
        }
        if (result.length >= 80) break;
    }
    while (result.endsWith("-")) result = result.slice(0, -1);
    return result || "artifact";
}

function cleanMediaFamily(value = "") {
    const family = String(value || "").trim().toLowerCase();
    if (family === "image" || family === "video") return family;
    throw new Error("REEL_MEDIA_FAMILY_REQUIRED");
}

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

function sha256Text(value = "") {
    return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function countExactMatches(source = "", search = "") {
    if (!search) return 0;
    let count = 0;
    let cursor = 0;
    while ((cursor = source.indexOf(search, cursor)) >= 0) {
        count++;
        cursor += Math.max(1, search.length);
    }
    return count;
}

function readWriteSnapshot(safePath) {
    if (!fs.existsSync(safePath)) {
        return { exists: false, bytes: 0, sha256: sha256Text(""), content: "" };
    }
    const stat = fs.lstatSync(safePath);
    if (stat.isSymbolicLink()) throw new Error("SYMLINK_WRITE_BLOCKED");
    if (!stat.isFile()) throw new Error("WRITE_TARGET_NOT_FILE");
    if (stat.size > 2 * 1024 * 1024) throw new Error("WRITE_TARGET_TOO_LARGE");
    const content = fs.readFileSync(safePath, "utf8");
    return { exists: true, bytes: stat.size, sha256: sha256Text(content), content };
}

function assertNoSymlinkPath(root, safePath) {
    const repoRoot = path.resolve(root);
    const relativeParts = path.relative(repoRoot, safePath).split(path.sep).filter(Boolean);
    let current = repoRoot;
    for (const part of relativeParts) {
        current = path.join(current, part);
        if (!fs.existsSync(current)) continue;
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error("SYMLINK_WRITE_BLOCKED");
    }
}

function requireWriteField(payload, field) {
    const value = typeof payload?.[field] === "string" ? payload[field].trim() : "";
    if (!value) throw new Error(`${field.toUpperCase()}_REQUIRED`);
    return value;
}

function buildWriteFingerprint(payload) {
    return sha256Text(JSON.stringify({
        objectiveId: payload.objectiveId,
        caseId: payload.caseId,
        authorityId: payload.authorityId,
        controllerId: payload.controllerId,
        file: payload.file,
        search: payload.search,
        replace: payload.replace,
        matchCount: payload.matchCount,
        snapshotSha256: payload.snapshotSha256,
        nonce: payload.nonce,
        timestamp: payload.timestamp,
        expiresAt: payload.expiresAt
    }));
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
    let artifactEvidence = [];
    try { artifactEvidence = listArtifacts({ root: DEFAULT_ROOT, limit: 500 }); } catch {}

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
            repoWrite: {
                available: true,
                protocol: "prepare_authorize_consume_once",
                requires: ["objectiveId", "caseId", "authorityId", "controllerId", "fingerprint", "nonce", "snapshot", "matchCount"],
                postVerify: true,
                replayBlocked: true,
                gitReceiptsRequired: true,
                legacyFileContentWrite: false
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
            artifactStudio: {
                available: true,
                versionedLedger: true,
                registeredCount: artifactEvidence.length,
                latest: artifactEvidence[0] || null
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

export function preparePageMaterialInput({ input = {}, root = DEFAULT_ROOT } = {}) {
    let embeddedBytes = 0;
    const materialSources = [];
    const embedImage = output => {
        const source = readArtifactPayload({ output, root });
        if (!source.mimeType.startsWith("image/") || source.mimeType === "image/svg+xml") throw new Error("PAGE_MATERIAL_IMAGE_REQUIRED");
        if (source.bytes > 12 * 1024 * 1024) throw new Error("PAGE_MATERIAL_IMAGE_TOO_LARGE");
        embeddedBytes += source.bytes;
        if (embeddedBytes > 36 * 1024 * 1024) throw new Error("PAGE_MATERIAL_TOTAL_TOO_LARGE");
        materialSources.push({ output: source.output, mimeType: source.mimeType, bytes: source.bytes });
        return `data:${source.mimeType};base64,${source.dataBase64}`;
    };
    const sourceImages = Array.isArray(input?.sourceImages) ? input.sourceImages.slice(0, 12) : [];
    const pageInput = { ...(input || {}) };
    const embeddedGallery = [];
    for (const item of sourceImages) {
        const role = String(item?.role || "").trim();
        const output = String(item?.output || "").trim();
        const alt = String(item?.alt || "").trim();
        if (!output || !alt || (role !== "hero" && role !== "gallery")) throw new Error("PAGE_MATERIAL_METADATA_REQUIRED");
        const src = embedImage(output);
        if (role === "hero" && !pageInput.heroImage) pageInput.heroImage = src;
        else embeddedGallery.push({ src, alt });
    }
    pageInput.gallery = [...(Array.isArray(pageInput.gallery) ? pageInput.gallery : []), ...embeddedGallery];
    return { pageInput, embeddedBytes, materialSources };
}

function pdfColor(rgb, value = "#000000") {
    const normalized = String(value || "#000000").replace(/^#/, "");
    if (!/^[a-f0-9]{6}$/i.test(normalized)) throw new Error("PDF_COLOR_INVALID");
    return rgb(
        Number.parseInt(normalized.slice(0, 2), 16) / 255,
        Number.parseInt(normalized.slice(2, 4), 16) / 255,
        Number.parseInt(normalized.slice(4, 6), 16) / 255
    );
}

function wrapPdfText(text, font, fontSize, maxWidth) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) line = candidate;
        else {
            if (line) lines.push(line);
            if (font.widthOfTextAtSize(word, fontSize) > maxWidth) throw new Error("PDF_TEXT_TOO_WIDE");
            line = word;
        }
    }
    if (line) lines.push(line);
    return lines.length > 0 ? lines : [""];
}

export async function editPdfOverlayArtifact({
    sourceOutput = "", output = "", changes = [], quote = null, root = DEFAULT_ROOT
} = {}) {
    const source = artifactPath(sourceOutput, root, [".pdf"]);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error("PDF_SOURCE_NOT_FOUND");
    const sourceBytes = fs.readFileSync(source);
    if (sourceBytes.length < 8 || sourceBytes.length > 50 * 1024 * 1024) throw new Error("PDF_SOURCE_BYTES_OUT_OF_RANGE");
    const locatedFields = quote && !quote.fields && quote.fieldAnchors
        ? await locatePdfFieldAnchors({ pdfBytes: sourceBytes, anchors: quote.fieldAnchors })
        : null;
    const quoteInput = quote ? { ...quote, fields: quote.fields || locatedFields?.fields } : null;
    const quotePlan = quoteInput ? buildQuotePdfChanges(quoteInput) : null;
    const requestedChanges = [
        ...(Array.isArray(changes) ? changes : []),
        ...(quotePlan?.changes || [])
    ];
    if (requestedChanges.length < 1 || requestedChanges.length > 100) throw new Error("PDF_CHANGES_REQUIRED");

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const document = await PDFDocument.load(sourceBytes, { updateMetadata: false });
    const font = await document.embedFont(StandardFonts.Helvetica);
    const pages = document.getPages();
    const applied = [];

    for (const [index, change] of requestedChanges.entries()) {
        const pageNumber = Number(change?.page || 1);
        if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pages.length) throw new Error("PDF_PAGE_OUT_OF_RANGE");
        const page = pages[pageNumber - 1];
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const x = Number(change?.x);
        const width = Number(change?.width);
        const height = Number(change?.height);
        const fontSize = Number(change?.fontSize || 10);
        const y = Number.isFinite(Number(change?.yFromTop))
            ? pageHeight - Number(change.yFromTop) - height
            : Number(change?.y);
        if (![x, y, width, height, fontSize].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || fontSize < 4 || fontSize > 72 || x + width > pageWidth || y + height > pageHeight) {
            throw new Error("PDF_EDIT_BOX_OUT_OF_BOUNDS");
        }
        const text = String(change?.text ?? "").slice(0, 2000);
        const padding = Math.max(1, Number(change?.padding || 2));
        const lineHeight = fontSize * 1.2;
        const lines = wrapPdfText(text, font, fontSize, width - padding * 2);
        if (lines.length * lineHeight > height - padding * 2) throw new Error("PDF_TEXT_OVERFLOW");
        page.drawRectangle({ x, y, width, height, color: pdfColor(rgb, change?.backgroundColor || "#ffffff") });
        lines.forEach((line, lineIndex) => page.drawText(line, {
            x: x + padding,
            y: y + height - padding - fontSize - lineIndex * lineHeight,
            size: fontSize,
            font,
            color: pdfColor(rgb, change?.color || "#000000")
        }));
        applied.push({ index, page: pageNumber, x, y, width, height, text, fontSize, overflow: false });
    }

    const resultBytes = Buffer.from(await document.save({ useObjectStreams: false }));
    let renderedVerification;
    try {
        renderedVerification = await verifyPdfVisualChanges({ sourceBytes, outputBytes: resultBytes, changes: applied });
    } catch (error) {
        renderedVerification = { ok: false, renderedComparisonPassed: false, error: error.message };
    }
    const safeOutput = String(output || `.jarvis-artifacts/documents/edited-${Date.now()}.pdf`).replace(/\\/g, "/");
    const target = artifactPath(safeOutput, root, [".pdf"]);
    fs.writeFileSync(target, resultBytes);
    return {
        ok: true,
        status: renderedVerification.renderedComparisonPassed ? "PDF_EDITED_VERIFIED" : "PDF_EDITED_REQUIRES_VISUAL_REVIEW",
        strategy: "NATIVE_OVERLAY",
        sourceOutput: path.relative(path.resolve(root), source).replace(/\\/g, "/"),
        output: path.relative(path.resolve(root), target).replace(/\\/g, "/"),
        originalPreserved: true,
        sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
        outputSha256: createHash("sha256").update(resultBytes).digest("hex"),
        bytes: resultBytes.length,
        pages: pages.length,
        changes: applied,
        visualVerification: {
            overflowChecks: applied.length,
            overflowPassed: applied.every(item => item.overflow === false),
            ...renderedVerification,
            humanReviewRequired: renderedVerification.renderedComparisonPassed !== true
        },
        quoteCalculation: quotePlan?.calculation || null,
        quoteChangeLog: quotePlan?.changeLog || [],
        fieldLocationEvidence: locatedFields?.evidence || []
    };
}

export async function editXlsxArtifact({
    sourceOutput = "", output = "", changes = [], root = DEFAULT_ROOT
} = {}) {
    const source = artifactPath(sourceOutput, root, [".xlsx"]);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error("XLSX_SOURCE_NOT_FOUND");
    const sourceBytes = fs.readFileSync(source);
    if (sourceBytes.length < 16 || sourceBytes.length > 100 * 1024 * 1024) throw new Error("XLSX_SOURCE_BYTES_OUT_OF_RANGE");
    if (!Array.isArray(changes) || changes.length < 1 || changes.length > 1000) throw new Error("XLSX_CHANGES_REQUIRED");

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(sourceBytes);
    const applied = [];
    for (const [index, change] of changes.entries()) {
        const worksheet = Number.isInteger(Number(change?.sheetIndex))
            ? workbook.worksheets[Number(change.sheetIndex)]
            : workbook.getWorksheet(String(change?.sheet || "").trim());
        if (!worksheet) throw new Error("XLSX_SHEET_NOT_FOUND");
        const address = String(change?.cell || "").trim().toUpperCase();
        if (!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(address)) throw new Error("XLSX_CELL_INVALID");
        const cell = worksheet.getCell(address);
        const before = cell.value;
        if (Object.hasOwn(change || {}, "formula")) {
            const formula = String(change.formula || "").trim().replace(/^=/, "");
            if (!formula || formula.length > 2000 || /\[[^\]]+\]|https?:|file:/i.test(formula)) throw new Error("XLSX_FORMULA_NOT_ALLOWED");
            cell.value = { formula, result: change.result ?? null };
        } else if (Object.hasOwn(change || {}, "value")) {
            const value = change.value;
            if (!["string", "number", "boolean"].includes(typeof value) && value !== null) throw new Error("XLSX_VALUE_TYPE_NOT_ALLOWED");
            cell.value = typeof value === "string" ? value.slice(0, 32767) : value;
        } else {
            throw new Error("XLSX_CHANGE_VALUE_REQUIRED");
        }
        if (change.numberFormat) cell.numFmt = String(change.numberFormat).slice(0, 160);
        applied.push({
            index,
            sheet: worksheet.name,
            cell: address,
            before,
            after: cell.value,
            stylePreserved: !change.numberFormat
        });
    }
    workbook.calcProperties ||= {};
    workbook.calcProperties.fullCalcOnLoad = true;
    workbook.calcProperties.forceFullCalc = true;
    workbook.calcProperties.calcMode = "auto";
    const safeOutput = String(output || `.jarvis-artifacts/documents/edited-${Date.now()}.xlsx`).replace(/\\/g, "/");
    const target = artifactPath(safeOutput, root, [".xlsx"]);
    await workbook.xlsx.writeFile(target);
    const resultBytes = fs.readFileSync(target);
    return {
        ok: true,
        status: "XLSX_EDITED",
        strategy: "NATIVE_WORKBOOK_EDIT",
        sourceOutput: path.relative(path.resolve(root), source).replace(/\\/g, "/"),
        output: path.relative(path.resolve(root), target).replace(/\\/g, "/"),
        originalPreserved: true,
        sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
        outputSha256: createHash("sha256").update(resultBytes).digest("hex"),
        bytes: resultBytes.length,
        sheets: workbook.worksheets.map(sheet => sheet.name),
        changes: applied,
        recalculation: "ON_OPEN"
    };
}

function escapeOoxmlText(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function replaceInsideWordTextNodes(xml, search, replacement) {
    const escapedSearch = escapeOoxmlText(search);
    const escapedReplacement = escapeOoxmlText(replacement);
    let cursor = 0;
    let output = "";
    let matchCount = 0;
    while (cursor < xml.length) {
        const open = xml.indexOf("<w:t", cursor);
        if (open < 0) {
            output += xml.slice(cursor);
            break;
        }
        const contentStart = xml.indexOf(">", open);
        const close = contentStart >= 0 ? xml.indexOf("</w:t>", contentStart + 1) : -1;
        if (contentStart < 0 || close < 0) throw new Error("DOCX_XML_TEXT_NODE_INVALID");
        output += xml.slice(cursor, contentStart + 1);
        const content = xml.slice(contentStart + 1, close);
        const occurrences = escapedSearch ? content.split(escapedSearch).length - 1 : 0;
        output += occurrences > 0 ? content.split(escapedSearch).join(escapedReplacement) : content;
        matchCount += occurrences;
        output += "</w:t>";
        cursor = close + 6;
    }
    return { xml: output, matchCount };
}

export async function editDocxArtifact({
    sourceOutput = "", output = "", replacements = [], root = DEFAULT_ROOT
} = {}) {
    const source = artifactPath(sourceOutput, root, [".docx"]);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error("DOCX_SOURCE_NOT_FOUND");
    const sourceBytes = fs.readFileSync(source);
    if (sourceBytes.length < 16 || sourceBytes.length > 50 * 1024 * 1024) throw new Error("DOCX_SOURCE_BYTES_OUT_OF_RANGE");
    if (!Array.isArray(replacements) || replacements.length < 1 || replacements.length > 200) throw new Error("DOCX_REPLACEMENTS_REQUIRED");

    const JSZip = (await import("jszip")).default;
    const archive = await JSZip.loadAsync(sourceBytes, { checkCRC32: true, createFolders: false });
    const entries = Object.keys(archive.files);
    if (entries.length > 2000) throw new Error("DOCX_ARCHIVE_ENTRY_LIMIT");
    const editableParts = entries.filter(name =>
        name === "word/document.xml" ||
        (name.startsWith("word/header") && name.endsWith(".xml")) ||
        (name.startsWith("word/footer") && name.endsWith(".xml"))
    );
    if (!editableParts.includes("word/document.xml")) throw new Error("DOCX_DOCUMENT_XML_MISSING");
    const xmlByPart = new Map();
    for (const part of editableParts) {
        const xml = await archive.file(part).async("string");
        if (xml.length > 15 * 1024 * 1024) throw new Error("DOCX_XML_PART_TOO_LARGE");
        xmlByPart.set(part, xml);
    }

    const applied = [];
    for (const [index, change] of replacements.entries()) {
        const search = String(change?.search || "");
        const replace = String(change?.replace ?? "");
        const expectedMatches = Number(change?.expectedMatches ?? 1);
        if (!search || search.length > 5000 || replace.length > 5000) throw new Error("DOCX_REPLACEMENT_INVALID");
        if (!Number.isInteger(expectedMatches) || expectedMatches < 1 || expectedMatches > 1000) throw new Error("DOCX_EXPECTED_MATCHES_INVALID");
        let totalMatches = 0;
        for (const [part, xml] of xmlByPart.entries()) {
            const result = replaceInsideWordTextNodes(xml, search, replace);
            xmlByPart.set(part, result.xml);
            totalMatches += result.matchCount;
        }
        if (totalMatches !== expectedMatches) throw new Error(`DOCX_MATCH_COUNT_MISMATCH:${totalMatches}:${expectedMatches}`);
        applied.push({ index, search, replace, matchCount: totalMatches });
    }
    for (const [part, xml] of xmlByPart.entries()) archive.file(part, xml);
    const resultBytes = await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const safeOutput = String(output || `.jarvis-artifacts/documents/edited-${Date.now()}.docx`).replace(/\\/g, "/");
    const target = artifactPath(safeOutput, root, [".docx"]);
    fs.writeFileSync(target, resultBytes);
    return {
        ok: true,
        status: "DOCX_EDITED",
        strategy: "OOXML_EXACT_TEXT_REPLACEMENT",
        sourceOutput: path.relative(path.resolve(root), source).replace(/\\/g, "/"),
        output: path.relative(path.resolve(root), target).replace(/\\/g, "/"),
        originalPreserved: true,
        sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
        outputSha256: createHash("sha256").update(resultBytes).digest("hex"),
        bytes: resultBytes.length,
        replacements: applied,
        editedParts: editableParts
    };
}

function replaceInsidePresentationTextNodes(xml, search, replacement) {
    const escapedSearch = escapeOoxmlText(search);
    const escapedReplacement = escapeOoxmlText(replacement);
    let cursor = 0;
    let output = "";
    let matchCount = 0;
    while (cursor < xml.length) {
        const open = xml.indexOf("<a:t", cursor);
        if (open < 0) {
            output += xml.slice(cursor);
            break;
        }
        const contentStart = xml.indexOf(">", open);
        const close = contentStart >= 0 ? xml.indexOf("</a:t>", contentStart + 1) : -1;
        if (contentStart < 0 || close < 0) throw new Error("PPTX_XML_TEXT_NODE_INVALID");
        output += xml.slice(cursor, contentStart + 1);
        const content = xml.slice(contentStart + 1, close);
        const occurrences = escapedSearch ? content.split(escapedSearch).length - 1 : 0;
        output += occurrences > 0 ? content.split(escapedSearch).join(escapedReplacement) : content;
        matchCount += occurrences;
        output += "</a:t>";
        cursor = close + 6;
    }
    return { xml: output, matchCount };
}

export async function editPptxArtifact({
    sourceOutput = "", output = "", replacements = [], root = DEFAULT_ROOT
} = {}) {
    const source = artifactPath(sourceOutput, root, [".pptx"]);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error("PPTX_SOURCE_NOT_FOUND");
    const sourceBytes = fs.readFileSync(source);
    if (sourceBytes.length < 16 || sourceBytes.length > 100 * 1024 * 1024) throw new Error("PPTX_SOURCE_BYTES_OUT_OF_RANGE");
    if (!Array.isArray(replacements) || replacements.length < 1 || replacements.length > 200) throw new Error("PPTX_REPLACEMENTS_REQUIRED");
    const JSZip = (await import("jszip")).default;
    const archive = await JSZip.loadAsync(sourceBytes, { checkCRC32: true, createFolders: false });
    const entries = Object.keys(archive.files);
    if (entries.length > 5000) throw new Error("PPTX_ARCHIVE_ENTRY_LIMIT");
    const editableParts = entries.filter(name =>
        (name.startsWith("ppt/slides/slide") || name.startsWith("ppt/notesSlides/notesSlide")) && name.endsWith(".xml")
    );
    if (editableParts.length < 1) throw new Error("PPTX_SLIDES_MISSING");
    const xmlByPart = new Map();
    for (const part of editableParts) {
        const xml = await archive.file(part).async("string");
        if (xml.length > 20 * 1024 * 1024) throw new Error("PPTX_XML_PART_TOO_LARGE");
        xmlByPart.set(part, xml);
    }
    const applied = [];
    for (const [index, change] of replacements.entries()) {
        const search = String(change?.search || "");
        const replace = String(change?.replace ?? "");
        const expectedMatches = Number(change?.expectedMatches ?? 1);
        if (!search || search.length > 5000 || replace.length > 5000) throw new Error("PPTX_REPLACEMENT_INVALID");
        if (!Number.isInteger(expectedMatches) || expectedMatches < 1 || expectedMatches > 1000) throw new Error("PPTX_EXPECTED_MATCHES_INVALID");
        let totalMatches = 0;
        for (const [part, xml] of xmlByPart.entries()) {
            const result = replaceInsidePresentationTextNodes(xml, search, replace);
            xmlByPart.set(part, result.xml);
            totalMatches += result.matchCount;
        }
        if (totalMatches !== expectedMatches) throw new Error(`PPTX_MATCH_COUNT_MISMATCH:${totalMatches}:${expectedMatches}`);
        applied.push({ index, search, replace, matchCount: totalMatches });
    }
    for (const [part, xml] of xmlByPart.entries()) archive.file(part, xml);
    const resultBytes = await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const safeOutput = String(output || `.jarvis-artifacts/documents/edited-${Date.now()}.pptx`).replace(/\\/g, "/");
    const target = artifactPath(safeOutput, root, [".pptx"]);
    fs.writeFileSync(target, resultBytes);
    return {
        ok: true,
        status: "PPTX_EDITED",
        strategy: "OOXML_EXACT_TEXT_REPLACEMENT",
        sourceOutput: path.relative(path.resolve(root), source).replace(/\\/g, "/"),
        output: path.relative(path.resolve(root), target).replace(/\\/g, "/"),
        originalPreserved: true,
        sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
        outputSha256: createHash("sha256").update(resultBytes).digest("hex"),
        bytes: resultBytes.length,
        replacements: applied,
        editedParts: editableParts
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

function xlsxFormulaIssue(formula = "", sheetNames = []) {
    const body = String(formula || "");
    if (!body || body.length > 2000) return "FORMULA_LENGTH_INVALID";
    const lower = body.toLowerCase();
    if (
        body.includes("[") ||
        body.includes("]") ||
        lower.includes("://") ||
        lower.includes("file:")
    ) {
        return "EXTERNAL_REFERENCE_NOT_ALLOWED";
    }

    const names = new Set(sheetNames.map(String));
    const boundaries = new Set([
        "+", "-", "*", "/", "^", "=", "<", ">",
        "(", ")", ",", ";", "%", "&"
    ]);
    let parentheses = 0;
    let singleQuoted = false;
    let doubleQuoted = false;

    for (let index = 0; index < body.length; index += 1) {
        const character = body[index];
        if (singleQuoted) {
            if (
                character === "'" &&
                body[index + 1] === "'"
            ) {
                index += 1;
            }
            else if (character === "'") {
                singleQuoted = false;
            }
            continue;
        }
        if (doubleQuoted) {
            if (
                character === '"' &&
                body[index + 1] === '"'
            ) {
                index += 1;
            }
            else if (character === '"') {
                doubleQuoted = false;
            }
            continue;
        }
        if (character === "'") {
            singleQuoted = true;
            continue;
        }
        if (character === '"') {
            doubleQuoted = true;
            continue;
        }
        if (
            character === " " ||
            character === "\t" ||
            character === "\n" ||
            character === "\r"
        ) {
            return "FORMULA_WHITESPACE_OUTSIDE_LITERAL";
        }
        if (character === "(") parentheses += 1;
        if (character === ")") {
            parentheses -= 1;
            if (parentheses < 0) {
                return "FORMULA_PARENTHESES_INVALID";
            }
        }
        if (character !== "!") continue;

        let sheetName = "";
        if (body[index - 1] === "'") {
            let start = index - 2;
            while (start >= 0) {
                if (
                    body[start] === "'" &&
                    body[start - 1] === "'"
                ) {
                    start -= 2;
                    continue;
                }
                if (body[start] === "'") break;
                start -= 1;
            }
            if (start < 0) return "FORMULA_SHEET_QUOTE_INVALID";
            sheetName = body
                .slice(start + 1, index - 1)
                .split("''")
                .join("'");
        }
        else {
            let start = index - 1;
            while (
                start >= 0 &&
                !boundaries.has(body[start])
            ) {
                start -= 1;
            }
            sheetName = body.slice(start + 1, index);
        }
        if (!names.has(sheetName)) {
            return `FORMULA_SHEET_NOT_FOUND:${sheetName}`;
        }
    }

    if (
        singleQuoted ||
        doubleQuoted ||
        parentheses !== 0
    ) {
        return "FORMULA_STRUCTURE_INVALID";
    }
    return null;
}

export function createJarvisFsBridgeApp({
    root = DEFAULT_ROOT
} = {}) {
    const app =
        express();

    let repoGraphCache = null;
    const preparedWrites = new Map();
    const authorizedWrites = new Map();
    const verifiedWriteReceipts = new Map();
    const stagedWriteReceipts = new Map();
    const commitReceipts = new Map();

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

    app.use((req, res, next) => {
        if (req.method !== "POST" || req.path === "/observability/snapshot") return next();
        const startedAt = Date.now();
        const sendJson = res.json.bind(res);
        res.json = payload => {
            try {
                appendObservation({
                    root,
                    operation: req.path,
                    httpStatus: res.statusCode,
                    latencyMs: Date.now() - startedAt,
                    request: req.body || {},
                    result: payload || {}
                });
            } catch {}
            return sendJson(payload);
        };
        return next();
    });

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

    app.post("/observability/snapshot", (req, res) => {
        try {
            return res.json({
                ...buildObservabilitySnapshot({ root, limit: req.body?.limit }),
                bridge: describeJarvisFsBridge(),
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "OBSERVABILITY_READ_FAILED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
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

    app.post("/repo/graph", async (req, res) => {
        try {
            const maxFiles = Math.max(1, Math.min(5000, Number(req.body?.maxFiles) || 2500));
            const maxFileSizeBytes = Math.max(1000, Math.min(2000000, Number(req.body?.maxFileSizeBytes) || 800000));
            const refresh = req.body?.refresh === true;
            if (!repoGraphCache || refresh || repoGraphCache.maxFiles !== maxFiles || repoGraphCache.maxFileSizeBytes !== maxFileSizeBytes) {
                repoGraphCache = {
                    maxFiles,
                    maxFileSizeBytes,
                    graph: buildRepoIntelligence({ root, maxFiles, maxFileSizeBytes })
                };
            }
            const transportNodes = Object.fromEntries(
                Object.entries(repoGraphCache.graph.nodes || {}).map(([file, node]) => {
                    const { literals: privateLiterals, ...safeNode } = node;
                    return [file, safeNode];
                })
            );
            return res.json({
                ...repoGraphCache.graph,
                nodes: transportNodes,
                cache: refresh ? "REFRESHED" : "READY",
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(500).json({ ok: false, status: "REPO_GRAPH_FAILED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
    });

    app.post("/repo/candidates", async (req, res) => {
        try {
            const query = String(req.body?.query || req.body?.objective || "").trim();
            if (!query) return res.status(400).json({ ok: false, status: "QUERY_REQUIRED", error: "QUERY_REQUIRED" });
            if (!repoGraphCache || req.body?.refresh === true) {
                repoGraphCache = {
                    maxFiles: 2500,
                    maxFileSizeBytes: 800000,
                    graph: buildRepoIntelligence({ root, maxFiles: 2500, maxFileSizeBytes: 800000 })
                };
            }
            const result = rankRepoCandidates({
                graph: repoGraphCache.graph,
                query,
                plannedFiles: Array.isArray(req.body?.plannedFiles) ? req.body.plannedFiles : [],
                limit: req.body?.limit || 8
            });
            return res.json({ ...result, version: JARVIS_FS_BRIDGE_VERSION });
        } catch (error) {
            return res.status(500).json({ ok: false, status: "CANDIDATE_RANKING_FAILED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
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

    
    app.post("/write/prepare", async (req, res) => {
        try {
            const body = req.body || {};
            const objectiveId = requireWriteField(body, "objectiveId");
            const caseId = requireWriteField(body, "caseId");
            const authorityId = requireWriteField(body, "authorityId");
            const controllerId = requireWriteField(body, "controllerId");
            const file = requireWriteField(body, "file").replaceAll("\\", "/");
            const operation = body.operation === "create" ? "create" : "replace";
            const search = typeof body.search === "string" ? body.search : "";
            const replace = typeof body.replace === "string" ? body.replace : "";
            const requestedMatchCount = Number(body.matchCount);
            if (authorityId !== "HEBERTO_MENDOZA" || controllerId !== "CODEX_SIA7") throw new Error("WRITE_AUTHORITY_INVALID");
            if (operation === "replace" && !search) throw new Error("SEARCH_REQUIRED");
            assertWriteContent(replace);
            const safePath = resolveRepoPath(file, root);
            assertNoSymlinkPath(root, safePath);
            const snapshot = readWriteSnapshot(safePath);
            if (operation === "create" && snapshot.exists) throw new Error("CREATE_TARGET_EXISTS");
            if (operation === "replace" && !snapshot.exists) throw new Error("WRITE_TARGET_MISSING");
            const actualMatchCount = operation === "create" ? 0 : countExactMatches(snapshot.content, search);
            if (!Number.isInteger(requestedMatchCount) || requestedMatchCount !== actualMatchCount || (operation === "replace" && actualMatchCount < 1)) {
                throw new Error("WRITE_MATCH_COUNT_MISMATCH");
            }
            const expectedContent = operation === "create"
                ? replace
                : snapshot.content.split(search).join(replace);
            assertWriteContent(expectedContent);
            const timestamp = Date.now();
            const expiresAt = timestamp + Math.max(30000, Math.min(300000, Number(body.ttlMs) || 120000));
            const nonce = randomUUID();
            const prepared = {
                objectiveId, caseId, authorityId, controllerId, file, operation, search, replace,
                matchCount: actualMatchCount, snapshotSha256: snapshot.sha256, expectedSha256: sha256Text(expectedContent),
                expectedBytes: Buffer.byteLength(expectedContent, "utf8"), expectedContent, timestamp, expiresAt, nonce
            };
            prepared.fingerprint = buildWriteFingerprint(prepared);
            preparedWrites.set(prepared.fingerprint, prepared);
            return res.json({
                ok: true,
                status: "WRITE_PREPARED",
                approvalId: prepared.fingerprint,
                fingerprint: prepared.fingerprint,
                nonce,
                objectiveId,
                caseId,
                file,
                matchCount: actualMatchCount,
                snapshotSha256: snapshot.sha256,
                expectedSha256: prepared.expectedSha256,
                expectedBytes: prepared.expectedBytes,
                timestamp,
                expiresAt,
                approvalCommand: `AUTORIZO ${prepared.fingerprint}`,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "WRITE_PREPARE_BLOCKED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
    });

    app.post("/write/authorize", async (req, res) => {
        try {
            const fingerprint = requireWriteField(req.body, "fingerprint");
            const nonce = requireWriteField(req.body, "nonce");
            const approvedBy = requireWriteField(req.body, "approvedBy");
            const approvalCommand = requireWriteField(req.body, "approvalCommand");
            const prepared = preparedWrites.get(fingerprint);
            if (!prepared) throw new Error("WRITE_PREPARATION_NOT_FOUND");
            if (prepared.expiresAt <= Date.now()) throw new Error("WRITE_APPROVAL_EXPIRED");
            if (prepared.nonce !== nonce) throw new Error("WRITE_NONCE_MISMATCH");
            if (approvedBy !== "HEBERTO_MENDOZA") throw new Error("WRITE_APPROVER_INVALID");
            if (approvalCommand !== `AUTORIZO ${fingerprint}`) throw new Error("WRITE_APPROVAL_COMMAND_MISMATCH");
            preparedWrites.delete(fingerprint);
            const authorization = {
                ...prepared,
                approvedBy,
                approvalCommand,
                authorizedAt: Date.now(),
                consumedAt: null
            };
            authorizedWrites.set(fingerprint, authorization);
            return res.json({
                ok: true,
                status: "WRITE_AUTHORIZED_ONCE",
                approvalId: fingerprint,
                fingerprint,
                nonce,
                approvedBy,
                expiresAt: authorization.expiresAt,
                consumedAt: null,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "WRITE_AUTHORIZATION_BLOCKED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
    });

    app.post("/write", async (req, res) => {
        try {
            const fingerprint = requireWriteField(req.body, "fingerprint");
            const nonce = requireWriteField(req.body, "nonce");
            const objectiveId = requireWriteField(req.body, "objectiveId");
            const caseId = requireWriteField(req.body, "caseId");
            const authorization = authorizedWrites.get(fingerprint);
            if (!authorization) throw new Error("WRITE_AUTHORIZATION_NOT_FOUND_OR_CONSUMED");
            if (authorization.consumedAt) throw new Error("WRITE_AUTHORIZATION_ALREADY_CONSUMED");
            if (authorization.expiresAt <= Date.now()) throw new Error("WRITE_APPROVAL_EXPIRED");
            if (authorization.nonce !== nonce) throw new Error("WRITE_NONCE_MISMATCH");
            if (authorization.objectiveId !== objectiveId) throw new Error("WRITE_OBJECTIVE_MISMATCH");
            if (authorization.caseId !== caseId) throw new Error("WRITE_CASE_MISMATCH");
            const safePath = resolveRepoPath(authorization.file, root);
            assertNoSymlinkPath(root, safePath);
            const snapshot = readWriteSnapshot(safePath);
            if (snapshot.sha256 !== authorization.snapshotSha256) throw new Error("WRITE_SNAPSHOT_CHANGED");
            authorization.consumedAt = Date.now();
            authorizedWrites.delete(fingerprint);
            fs.mkdirSync(path.dirname(safePath), { recursive: true });
            fs.writeFileSync(safePath, authorization.expectedContent, "utf8");
            const verified = readWriteSnapshot(safePath);
            if (verified.sha256 !== authorization.expectedSha256 || verified.bytes !== authorization.expectedBytes) {
                throw new Error("WRITE_POST_VERIFY_FAILED");
            }
            verifiedWriteReceipts.set(fingerprint, {
                fingerprint,
                file: authorization.file,
                objectiveId,
                caseId,
                outputSha256: verified.sha256,
                outputBytes: verified.bytes,
                consumedAt: authorization.consumedAt,
                stagedAt: null,
                committedAt: null
            });
            return res.json({
                ok: true,
                status: "WRITE_COMPLETED_VERIFIED",
                path: safePath,
                file: authorization.file,
                objectiveId,
                caseId,
                fingerprint,
                nonce,
                matchCount: authorization.matchCount,
                snapshotSha256: authorization.snapshotSha256,
                outputSha256: verified.sha256,
                outputBytes: verified.bytes,
                approvedBy: authorization.approvedBy,
                authorizedAt: authorization.authorizedAt,
                consumedAt: authorization.consumedAt,
                verified: true,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "WRITE_BLOCKED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
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
            const artifact = result.ok && relativeOutput && fs.existsSync(outputFile)
                ? registerArtifact({ root, output: relativeOutput, metadata: {
                    type: action === "pdf" ? "pdf" : "image",
                    origin: `browser.${action}`, provider: path.basename(chrome),
                    caseId: req.body?.caseId, objectiveId: req.body?.objectiveId,
                    mimeType: artifactMimeType(outputFile), status: `BROWSER_${action.toUpperCase()}_OK`,
                    approvalRequired: true, approved: req.body?.approved === true, approvedBy: req.body?.approvedBy,
                    editable: false, preview: true, downloadable: true, publishable: false,
                    originalFile: url
                } })
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
                artifact,
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

    app.post("/page/create", async (req, res) => {
        try {
            const { pageInput, embeddedBytes, materialSources } = preparePageMaterialInput({ input: req.body || {}, root });
            const html = buildPageArtifactHtml(pageInput);
            const slug = safeFileStem(req.body?.slug || req.body?.brandName || "pagina");
            const requestedOutput =
                String(req.body?.output || "").trim().replaceAll("\\", "/");
            const output =
                requestedOutput.startsWith(".jarvis-artifacts/")
                    ? requestedOutput
                    : `.jarvis-artifacts/pages/${slug}-${Date.now()}.html`;
            const target = artifactPath(output, root, [".html"]);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, html, "utf8");
            const verification = describePageArtifact(pageInput, html);
            if (!Object.values(verification.checks).every(Boolean)) {
                fs.rmSync(target, { force: true });
                throw new Error("PAGE_POST_VERIFY_FAILED");
            }
            const artifact = registerArtifact({ root, output: path.relative(root, target).replaceAll("\\", "/"), metadata: {
                type: "landing", origin: "page.create", provider: "jarvis_page_artifact",
                caseId: req.body?.caseId, objectiveId: req.body?.objectiveId, mimeType: "text/html",
                status: "PAGE_ARTIFACT_CREATED_VERIFIED", approvalRequired: false,
                approved: true, approvedBy: "LOCAL_ARTIFACT_POLICY",
                editable: true, preview: true, downloadable: true, publishable: true,
                originalFile: materialSources[0]?.output || null,
                transformations: materialSources.map(source => ({ type: "embedded_source_image", ...source }))
            } });
            return res.json({
                ok: true,
                status: "PAGE_ARTIFACT_CREATED_VERIFIED",
                output: path.relative(root, target).replaceAll("\\", "/"),
                mimeType: "text/html",
                bytes: verification.bytes,
                embeddedBytes,
                materialSources,
                checks: verification.checks,
                downloadable: true,
                previewable: true,
                artifact,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "PAGE_CREATE_BLOCKED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
    });

    app.post("/reel/create", async (req, res) => {
        try {
            let embeddedBytes = 0;
            const embedArtifact = (output, expectedFamily) => {
                if (!output) return "";
                const artifact = readArtifactPayload({ output, root });
                if (!artifact.mimeType.startsWith(`${expectedFamily}/`)) throw new Error("REEL_MEDIA_TYPE_MISMATCH");
                embeddedBytes += artifact.bytes;
                if (artifact.bytes > 12 * 1024 * 1024 || embeddedBytes > 40 * 1024 * 1024) throw new Error("REEL_EMBEDDED_MEDIA_LIMIT_EXCEEDED");
                return `data:${artifact.mimeType};base64,${artifact.dataBase64}`;
            };
            const sourceScenes = Array.isArray(req.body?.scenes) ? req.body.scenes.slice(0, 18) : [];
            const scenes = sourceScenes.map(scene => ({
                ...scene,
                assetDataUrl: scene?.assetOutput
                    ? embedArtifact(scene.assetOutput, cleanMediaFamily(scene.mediaType))
                    : scene?.assetDataUrl
            }));
            const hydrated = {
                ...(req.body || {}),
                scenes,
                logoDataUrl: req.body?.logoOutput ? embedArtifact(req.body.logoOutput, "image") : req.body?.logoDataUrl,
                audioDataUrl: req.body?.audioOutput ? embedArtifact(req.body.audioOutput, "audio") : req.body?.audioDataUrl
            };
            const html = buildReelStudioHtml(hydrated);
            const verification = describeReelStudio(hydrated, html);
            if (!Object.values(verification.checks).every(Boolean)) throw new Error("REEL_STUDIO_POST_VERIFY_FAILED");
            const slug = safeFileStem(req.body?.slug || req.body?.title || req.body?.brandName || "reel");
            const requestedOutput =
                String(req.body?.output || "").trim().replaceAll("\\", "/");
            const output =
                requestedOutput.startsWith(".jarvis-artifacts/")
                    ? requestedOutput
                    : `.jarvis-artifacts/reels/${slug}-${Date.now()}-studio.html`;
            const target = artifactPath(output, root, [".html"]);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, html, "utf8");
            const artifact = registerArtifact({ root, output: path.relative(root, target).replaceAll("\\", "/"), metadata: {
                type: "reel_studio", origin: "reel.create", provider: "browser_media_recorder",
                caseId: req.body?.caseId, objectiveId: req.body?.objectiveId, mimeType: "text/html",
                status: "REEL_STUDIO_CREATED_VERIFIED", approvalRequired: false,
                approved: true, approvedBy: "LOCAL_ARTIFACT_POLICY",
                editable: true, preview: true, downloadable: true, publishable: false,
                originalFile: req.body?.originalFile
            } });
            return res.json({
                ok: true,
                status: "REEL_STUDIO_CREATED_VERIFIED",
                output: path.relative(root, target).replaceAll("\\", "/"),
                mimeType: "text/html",
                bytes: verification.bytes,
                embeddedBytes,
                checks: verification.checks,
                durationSeconds: Number(hydrated.durationSeconds),
                downloadable: true,
                previewable: true,
                videoExportStatus: "REQUIRES_BROWSER_EXPORT",
                artifact,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "REEL_CREATE_BLOCKED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
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
                sheets = [],
                requireFormulas = false,
                requireDocumentValidation = false,
                documentContract = {},
                documentValidation = {},
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
                (!Array.isArray(sheets) || sheets.length === 0) &&
                (!Array.isArray(slides) || slides.length === 0)
            ) {
                return res.status(400).json({
                    ok: false,
                    status: "DOCUMENT_CONTENT_REQUIRED",
                    version: JARVIS_FS_BRIDGE_VERSION
                });
            }

            const safeTitle = String(title).replace(/[<>&]/g, "");
            const resolvedOutput =
                String(output || "").trim().replaceAll("\\", "/")
                    .startsWith(".jarvis-artifacts/")
                    ? String(output).trim().replaceAll("\\", "/")
                    : `.jarvis-artifacts/documents/${safeFileStem(safeTitle)}-${Date.now()}.${normalizedFormat}`;
            const target = artifactPath(resolvedOutput, root, [`.${normalizedFormat}`]);
            let body = content;
            let documentVerification = null;

            if (normalizedFormat === "html") {
                body = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeTitle}</title><style>body{font:16px/1.55 system-ui;max-width:960px;margin:48px auto;padding:0 24px;color:#172033}pre{white-space:pre-wrap}</style></head><body><h1>${safeTitle}</h1><pre>${content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`;
                fs.writeFileSync(target, body, "utf8");
            }
            else if (["md", "txt", "csv", "json"].includes(normalizedFormat)) {
                fs.writeFileSync(target, body, "utf8");
            }
            else if (normalizedFormat === "docx") {
                const artifact =
                    await buildDocxArtifactBuffer({
                        title:
                            safeTitle,
                        content
                    });
                fs.writeFileSync(
                    target,
                    artifact.buffer
                );
                documentVerification =
                    await validateDocxArtifactFile({
                        file:
                            target,
                        contract:
                            documentContract,
                        expectedValidation:
                            documentValidation
                    });
                if (
                    requireDocumentValidation === true &&
                    documentVerification.ok !== true
                ) {
                    fs.rmSync(
                        target,
                        { force: true }
                    );
                    return res.status(422).json({
                        ok: false,
                        status:
                            "DOCUMENT_VALIDATION_FAILED",
                        error:
                            "DOCUMENT_VALIDATION_FAILED",
                        output:
                            null,
                        quarantined:
                            true,
                        validation:
                            documentVerification,
                        version:
                            JARVIS_FS_BRIDGE_VERSION
                    });
                }
            }
            else if (normalizedFormat === "xlsx") {
                const ExcelJS = (await import("exceljs")).default;
                const workbook = new ExcelJS.Workbook();
                const sourceSheets = Array.isArray(sheets) && sheets.length > 0
                    ? sheets.slice(0, 12)
                    : [{
                        name: safeTitle,
                        rows: Array.isArray(rows) && rows.length > 0
                            ? rows
                            : String(content).split(/\r?\n/).filter(Boolean).map(line => line.split(","))
                    }];
                const usedSheetNames = new Set();
                const preparedSheets = sourceSheets.map((sheetInput, sheetIndex) => {
                    const baseName = String(sheetInput?.name || `Hoja ${sheetIndex + 1}`)
                        .replace(/[\\/?*[\]:]/g, " ")
                        .trim()
                        .slice(0, 31) || `Hoja ${sheetIndex + 1}`;
                    let sheetName = baseName;
                    let suffix = 2;
                    while (usedSheetNames.has(sheetName)) {
                        const ending = ` ${suffix}`;
                        sheetName = `${baseName.slice(0, 31 - ending.length)}${ending}`;
                        suffix += 1;
                    }
                    usedSheetNames.add(sheetName);
                    return {
                        name: sheetName,
                        rows: Array.isArray(sheetInput?.rows)
                            ? sheetInput.rows.slice(0, 10000)
                            : []
                    };
                });
                const sheetNames = preparedSheets.map(sheet => sheet.name);
                const structuralValidation =
                    validateWorkbookFormulaStructure(
                        preparedSheets
                    );
                const containsWorkbookContent =
                    preparedSheets.some(sheet =>
                        sheet.rows.some(row =>
                            (
                                Array.isArray(row)
                                    ? row
                                    : Object.values(
                                        row ||
                                        {}
                                    )
                            ).some(value =>
                                value !== null &&
                                value !== undefined &&
                                value !== ""
                            )
                        )
                    );
                if (!containsWorkbookContent) {
                    throw new Error(
                        "XLSX_WORKBOOK_CONTENT_REQUIRED"
                    );
                }
                if (
                    requireFormulas === true &&
                    structuralValidation
                        .formulaCount < 1
                ) {
                    throw new Error(
                        "XLSX_WORKBOOK_FORMULAS_REQUIRED"
                    );
                }
                if (
                    structuralValidation
                        .invalidFormulas
                        .length > 0
                ) {
                    const issue =
                        structuralValidation
                            .invalidFormulas[0];
                    throw new Error(
                        [
                            "XLSX_FORMULA_STRUCTURE_INVALID",
                            issue.sheet,
                            issue.row,
                            issue.column,
                            issue.issue
                        ].join(":")
                    );
                }
                preparedSheets.forEach(sheetInput => {
                    const sheet = workbook.addWorksheet(sheetInput.name);
                    sheetInput.rows.forEach((row, rowIndex) => {
                        const values = Array.isArray(row)
                            ? row
                            : Object.values(row || {});
                        sheet.addRow(values.map((value, columnIndex) => {
                            if (
                                typeof value !== "string" ||
                                !value.startsWith("=")
                            ) {
                                return value;
                            }
                            const formula = value.slice(1);
                            const issue =
                                xlsxFormulaIssue(
                                    formula,
                                    sheetNames
                                );
                            if (issue) {
                                throw new Error(
                                    `XLSX_FORMULA_INVALID:${sheet.name}:${rowIndex + 1}:${columnIndex + 1}:${issue}`
                                );
                            }
                            return {
                                formula
                            };
                        }));
                    });
                    if (sheet.rowCount > 0) {
                        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
                        sheet.getRow(1).fill = {
                            type: "pattern",
                            pattern: "solid",
                            fgColor: { argb: "FF2563EB" }
                        };
                        sheet.views = [{ state: "frozen", ySplit: 1 }];
                        sheet.columns.forEach(column => {
                            column.width = Math.min(
                                48,
                                Math.max(12, ...column.values.slice(1).map(value =>
                                    String(
                                        value && typeof value === "object" && value.formula
                                            ? `=${value.formula}`
                                            : value || ""
                                    ).length + 2
                                ))
                            );
                        });
                    }
                });
                workbook.calcProperties ||= {};
                workbook.calcProperties.fullCalcOnLoad = true;
                workbook.calcProperties.forceFullCalc = true;
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

            const relativeOutput = path.relative(path.resolve(root), target).replaceAll("\\", "/");
            const artifact = registerArtifact({ root, output: relativeOutput, metadata: {
                type: normalizedFormat, origin: "document.create", provider: "jarvis_document_engine",
                caseId: req.body?.caseId, objectiveId: req.body?.objectiveId,
                mimeType: artifactMimeType(target), status: "DOCUMENT_CREATED",
                approvalRequired: false, approved: true, approvedBy: "LOCAL_ARTIFACT_POLICY",
                editable: normalizedFormat !== "pdf", preview: normalizedFormat === "html" || normalizedFormat === "pdf",
                downloadable: true, publishable: false
            } });
            return res.json({
                documentValidation:
                    documentVerification,
                ok: true,
                status: "DOCUMENT_CREATED",
                format: normalizedFormat,
                output: relativeOutput,
                bytes,
                artifact,
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

    app.post("/document/pdf/edit", async (req, res) => {
        try {
            const edited = await editPdfOverlayArtifact({
                sourceOutput: req.body?.sourceOutput,
                output: req.body?.output,
                changes: req.body?.changes,
                quote: req.body?.quote,
                root
            });
            const artifact = registerArtifact({ root, output: edited.output, metadata: {
                type: "pdf_edited", origin: "document.pdf.edit", provider: "pdf-lib",
                caseId: req.body?.caseId, objectiveId: req.body?.objectiveId, mimeType: "application/pdf",
                status: edited.status, approvalRequired: true, approved: req.body?.approved === true,
                approvedBy: req.body?.approvedBy, editable: true, preview: true, downloadable: true,
                publishable: false, originalFile: req.body?.sourceOutput, transformations: edited.changes
            } });
            return res.json({
                ...edited,
                artifact,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({
                ok: false,
                status: "PDF_EDIT_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

    app.post("/document/xlsx/edit", async (req, res) => {
        try {
            const edited = await editXlsxArtifact({ sourceOutput: req.body?.sourceOutput, output: req.body?.output, changes: req.body?.changes, root });
            const artifact = registerArtifact({ root, output: edited.output, metadata: {
                type: "xlsx_edited", origin: "document.xlsx.edit", provider: "exceljs",
                caseId: req.body?.caseId, objectiveId: req.body?.objectiveId,
                mimeType: artifactMimeType(edited.output), status: edited.status, approvalRequired: true,
                approved: req.body?.approved === true, approvedBy: req.body?.approvedBy, editable: true,
                preview: false, downloadable: true, publishable: false, originalFile: req.body?.sourceOutput,
                transformations: req.body?.changes
            } });
            return res.json({
                ...edited,
                artifact,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({
                ok: false,
                status: "XLSX_EDIT_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

    app.post("/document/docx/edit", async (req, res) => {
        try {
            const edited = await editDocxArtifact({ sourceOutput: req.body?.sourceOutput, output: req.body?.output, replacements: req.body?.replacements, root });
            const artifact = registerArtifact({ root, output: edited.output, metadata: {
                type: "docx_edited", origin: "document.docx.edit", provider: "adm-zip",
                caseId: req.body?.caseId, objectiveId: req.body?.objectiveId,
                mimeType: artifactMimeType(edited.output), status: edited.status, approvalRequired: true,
                approved: req.body?.approved === true, approvedBy: req.body?.approvedBy, editable: true,
                preview: false, downloadable: true, publishable: false, originalFile: req.body?.sourceOutput,
                transformations: req.body?.replacements
            } });
            return res.json({
                ...edited,
                artifact,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({
                ok: false,
                status: "DOCX_EDIT_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

    app.post("/document/pptx/edit", async (req, res) => {
        try {
            const edited = await editPptxArtifact({ sourceOutput: req.body?.sourceOutput, output: req.body?.output, replacements: req.body?.replacements, root });
            const artifact = registerArtifact({ root, output: edited.output, metadata: {
                type: "pptx_edited", origin: "document.pptx.edit", provider: "adm-zip",
                caseId: req.body?.caseId, objectiveId: req.body?.objectiveId,
                mimeType: artifactMimeType(edited.output), status: edited.status, approvalRequired: true,
                approved: req.body?.approved === true, approvedBy: req.body?.approvedBy, editable: true,
                preview: false, downloadable: true, publishable: false, originalFile: req.body?.sourceOutput,
                transformations: req.body?.replacements
            } });
            return res.json({
                ...edited,
                artifact,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({
                ok: false,
                status: "PPTX_EDIT_FAILED",
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
            const saved = saveGeneratedImageArtifact({
                imageBase64: req.body?.imageBase64,
                mimeType: req.body?.mimeType,
                output: req.body?.output,
                root
            });
            const artifact = registerArtifact({ root, output: saved.output, metadata: {
                type: "image", origin: req.body?.origin || "image.generate",
                provider: req.body?.provider, model: req.body?.model,
                caseId: req.body?.caseId, objectiveId: req.body?.objectiveId,
                mimeType: saved.mimeType, status: saved.status,
                approvalRequired: false, approved: true, approvedBy: "LOCAL_ARTIFACT_POLICY",
                editable: true, preview: true, downloadable: true, publishable: true,
                originalFile: req.body?.originalFile, transformations: req.body?.transformations
            } });
            return res.json({
                ...saved,
                artifact,
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
            const saved = saveUploadedArtifact({
                name: req.body?.name,
                mimeType: req.body?.mimeType,
                dataBase64: req.body?.dataBase64,
                root
            });
            const artifact = registerArtifact({ root, output: saved.output, metadata: {
                type: "upload", origin: "user_upload", provider: "local",
                caseId: req.body?.caseId, objectiveId: req.body?.objectiveId,
                mimeType: saved.mimeType, status: saved.status, approvalRequired: false,
                approved: true, approvedBy: "HEBERTO_MENDOZA", editable: false,
                preview: saved.mimeType.startsWith("image/") || saved.mimeType === "application/pdf",
                downloadable: true, publishable: false
            } });
            return res.json({
                ...saved,
                artifact,
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
            const saved = completeChunkedUpload({ uploadId: req.body?.uploadId, root });
            const artifact = registerArtifact({ root, output: saved.output, metadata: {
                type: "upload", origin: "user_chunked_upload", provider: "local",
                caseId: saved.caseId, objectiveId: saved.objectiveId, mimeType: saved.mimeType,
                status: saved.status, approvalRequired: false, approved: true, approvedBy: "HEBERTO_MENDOZA",
                editable: false, preview: saved.mimeType.startsWith("image/") || saved.mimeType === "application/pdf",
                downloadable: true, publishable: false
            } });
            return res.json({
                ...saved,
                artifact,
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
            const payload = readArtifactPayload({ output: req.body?.output, root });
            return res.json({
                ...payload,
                artifact: findArtifact({ root, output: payload.output }),
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

    app.post("/artifact/list", (req, res) => {
        try {
            const artifacts = listArtifacts({
                root, limit: req.body?.limit, type: req.body?.type,
                caseId: req.body?.caseId, objectiveId: req.body?.objectiveId
            });
            return res.json({ ok: true, status: "ARTIFACT_LEDGER_READ", count: artifacts.length, artifacts, version: JARVIS_FS_BRIDGE_VERSION });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "ARTIFACT_LEDGER_READ_FAILED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
    });

    app.post("/artifact/json/create", (req, res) => {
        try {
            const allowedTypes = new Set(["json", "campaign", "proposal", "report", "patch_preview", "diff", "test_report"]);
            const type = String(req.body?.type || "json").trim();
            if (!allowedTypes.has(type)) throw new Error("ARTIFACT_JSON_TYPE_NOT_ALLOWED");
            if (!req.body?.data || typeof req.body.data !== "object") throw new Error("ARTIFACT_JSON_DATA_REQUIRED");
            const slug = safeFileStem(req.body?.slug || `${type}-${Date.now()}`);
            const output = req.body?.output || `.jarvis-artifacts/${type}/${slug}.json`;
            const target = artifactPath(output, root, [".json"]);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, `${JSON.stringify(req.body.data, null, 2)}\n`, "utf8");
            const relativeOutput = path.relative(root, target).replaceAll("\\", "/");
            const artifact = registerArtifact({ root, output: relativeOutput, metadata: {
                type, origin: req.body?.origin || "artifact.createJson", provider: req.body?.provider || "jarvis",
                model: req.body?.model, caseId: req.body?.caseId, objectiveId: req.body?.objectiveId,
                mimeType: "application/json", status: "JSON_ARTIFACT_CREATED_VERIFIED",
                approvalRequired: true, approved: req.body?.approved === true, approvedBy: req.body?.approvedBy,
                editable: true, preview: true, downloadable: true, publishable: req.body?.publishable === true,
                originalFile: req.body?.originalFile, transformations: req.body?.transformations
            } });
            return res.json({ ok: true, status: "JSON_ARTIFACT_CREATED_VERIFIED", output: relativeOutput, bytes: artifact.bytes, artifact, version: JARVIS_FS_BRIDGE_VERSION });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "JSON_ARTIFACT_CREATE_FAILED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
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
                receiptFingerprints = [],
                commitReceiptId = "",
                approvalCommand = "",
                approvedBy = "",
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

                const receipts = Array.isArray(receiptFingerprints)
                    ? receiptFingerprints.map(value => verifiedWriteReceipts.get(String(value))).filter(Boolean)
                    : [];

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

                if (receipts.length !== safeFiles.length || !safeFiles.every(file => receipts.some(receipt => receipt.file === file))) {
                    return res.status(403).json({
                        ok: false,
                        status: "GIT_WRITE_RECEIPTS_REQUIRED",
                        error: "VERIFIED_WRITE_RECEIPTS_REQUIRED",
                        files: safeFiles,
                        receiptFingerprints,
                        version: JARVIS_FS_BRIDGE_VERSION
                    });
                }

                for (const receipt of receipts) {
                    const current = readWriteSnapshot(resolveRepoPath(receipt.file, root));
                    if (current.sha256 !== receipt.outputSha256) {
                        return res.status(409).json({ ok: false, status: "GIT_RECEIPT_CONTENT_MISMATCH", error: "GIT_RECEIPT_CONTENT_MISMATCH", file: receipt.file });
                    }
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

                if (result.ok) {
                    for (const receipt of receipts) {
                        receipt.stagedAt = Date.now();
                        stagedWriteReceipts.set(receipt.fingerprint, receipt);
                    }
                }

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

                const receipts = Array.isArray(receiptFingerprints)
                    ? receiptFingerprints.map(value => stagedWriteReceipts.get(String(value))).filter(Boolean)
                    : [];
                if (receipts.length === 0 || receipts.length !== receiptFingerprints.length) {
                    return res.status(403).json({
                        ok: false,
                        status: "GIT_STAGED_RECEIPTS_REQUIRED",
                        error: "STAGED_WRITE_RECEIPTS_REQUIRED",
                        receiptFingerprints,
                        version: JARVIS_FS_BRIDGE_VERSION
                    });
                }
                const cachedNames = await runGitWorkflowCommand({
                    args: ["diff", "--cached", "--name-only", "--"], cwd, timeoutMs, root
                });
                const stagedFiles = String(cachedNames.stdout || "").split(/\r?\n/).map(value => value.trim().replaceAll("\\", "/")).filter(Boolean);
                const receiptFiles = receipts.map(receipt => receipt.file).sort();
                if (JSON.stringify([...stagedFiles].sort()) !== JSON.stringify(receiptFiles)) {
                    return res.status(409).json({ ok: false, status: "GIT_STAGED_SCOPE_MISMATCH", error: "GIT_STAGED_SCOPE_MISMATCH", stagedFiles, receiptFiles });
                }
                for (const receipt of receipts) {
                    const current = readWriteSnapshot(resolveRepoPath(receipt.file, root));
                    if (current.sha256 !== receipt.outputSha256) {
                        return res.status(409).json({ ok: false, status: "GIT_RECEIPT_CONTENT_MISMATCH", error: "GIT_RECEIPT_CONTENT_MISMATCH", file: receipt.file });
                    }
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

                let commitReceipt = null;
                if (result.ok) {
                    const head = await runGitWorkflowCommand({ args: ["rev-parse", "HEAD"], cwd, timeoutMs, root });
                    const commitSha = String(head.stdout || "").trim();
                    const receiptId = sha256Text(JSON.stringify({ commitSha, receiptFingerprints, message: commitMessage }));
                    commitReceipt = { receiptId, commitSha, receiptFingerprints: [...receiptFingerprints], message: commitMessage, createdAt: Date.now(), consumedAt: null };
                    commitReceipts.set(receiptId, commitReceipt);
                    for (const receipt of receipts) {
                        receipt.committedAt = commitReceipt.createdAt;
                        verifiedWriteReceipts.delete(receipt.fingerprint);
                        stagedWriteReceipts.delete(receipt.fingerprint);
                    }
                }

                return res.json({
                    ...result,
                    action:
                        "commit",
                    message:
                        commitMessage,
                    commitReceipt,
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

                const commitReceipt = commitReceipts.get(String(commitReceiptId || ""));
                if (!commitReceipt || commitReceipt.consumedAt) {
                    return res.status(403).json({ ok: false, status: "GIT_COMMIT_RECEIPT_REQUIRED", error: "UNCONSUMED_COMMIT_RECEIPT_REQUIRED" });
                }
                if (approvedBy !== "HEBERTO_MENDOZA" || approvalCommand !== `AUTORIZO PUSH ${commitReceipt.receiptId}`) {
                    return res.status(403).json({ ok: false, status: "GIT_PUSH_COMMAND_MISMATCH", error: "GIT_PUSH_COMMAND_MISMATCH", approvalCommand: `AUTORIZO PUSH ${commitReceipt.receiptId}` });
                }
                const head = await runGitWorkflowCommand({ args: ["rev-parse", "HEAD"], cwd, timeoutMs, root });
                if (String(head.stdout || "").trim() !== commitReceipt.commitSha) {
                    return res.status(409).json({ ok: false, status: "GIT_COMMIT_RECEIPT_HEAD_MISMATCH", error: "GIT_COMMIT_RECEIPT_HEAD_MISMATCH" });
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

                if (result.ok) {
                    commitReceipt.consumedAt = Date.now();
                    commitReceipts.delete(commitReceipt.receiptId);
                }

                return res.json({
                    ...result,
                    action:
                        "push",
                    remote:
                        safeRemote,
                    branch:
                        safeBranch,
                    commitReceiptId: commitReceipt.receiptId,
                    consumedAt: commitReceipt.consumedAt,
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
