import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const JARVIS_ARTIFACT_STUDIO_VERSION = "1.0.0-versioned-ledger";

function clean(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

function ledgerPath(root) {
    return path.resolve(root, ".jarvis-artifacts/.ledger/artifacts.jsonl");
}

function readLedger(root, limit = 5000) {
    const file = ledgerPath(root);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).slice(-Math.max(1, limit));
    return lines.map(line => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
}

function hashFile(file) {
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function registerArtifact({ root, output, metadata = {} } = {}) {
    const resolvedRoot = path.resolve(root || process.cwd());
    const normalizedOutput = clean(output).replaceAll("\\", "/");
    if (!normalizedOutput.startsWith(".jarvis-artifacts/")) throw new Error("ARTIFACT_OUTPUT_REQUIRED");
    const file = path.resolve(resolvedRoot, normalizedOutput);
    const artifactRoot = path.resolve(resolvedRoot, ".jarvis-artifacts");
    if (file !== artifactRoot && !file.startsWith(`${artifactRoot}${path.sep}`)) throw new Error("ARTIFACT_OUTSIDE_ROOT");
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error("ARTIFACT_FILE_REQUIRED");
    const existing = readLedger(resolvedRoot);
    const originalFile = clean(metadata.originalFile);
    const lineageKey = originalFile || normalizedOutput;
    const version = existing
        .filter(item => item.lineageKey === lineageKey)
        .reduce((maximum, item) => Math.max(maximum, Number(item.version) || 0), 0) + 1;
    const sha256 = hashFile(file);
    const createdAt = new Date().toISOString();
    const record = {
        artifactId: `ART-${randomUUID()}`,
        studioVersion: JARVIS_ARTIFACT_STUDIO_VERSION,
        caseId: clean(metadata.caseId),
        objectiveId: clean(metadata.objectiveId),
        type: clean(metadata.type) || "artifact",
        version,
        lineageKey,
        origin: clean(metadata.origin) || "jarvis_local_bridge",
        provider: clean(metadata.provider) || "local",
        model: clean(metadata.model),
        file: normalizedOutput,
        mimeType: clean(metadata.mimeType),
        bytes: stat.size,
        sha256,
        createdAt,
        status: clean(metadata.status) || "CREATED_VERIFIED",
        approval: {
            required: metadata.approvalRequired === true,
            approved: metadata.approved === true,
            approvedBy: clean(metadata.approvedBy)
        },
        editable: metadata.editable === true,
        preview: metadata.preview === true,
        downloadable: metadata.downloadable !== false,
        publishable: metadata.publishable === true,
        deploymentStatus: clean(metadata.deploymentStatus) || "NOT_DEPLOYED",
        originalFile: originalFile || null,
        transformations: Array.isArray(metadata.transformations) ? metadata.transformations.slice(0, 30) : []
    };
    const target = ledgerPath(resolvedRoot);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, `${JSON.stringify(record)}\n`, "utf8");
    return record;
}

export function listArtifacts({ root, limit = 100, type = "", caseId = "", objectiveId = "" } = {}) {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return readLedger(path.resolve(root || process.cwd()))
        .filter(item => !type || item.type === type)
        .filter(item => !caseId || item.caseId === caseId)
        .filter(item => !objectiveId || item.objectiveId === objectiveId)
        .slice(-boundedLimit)
        .reverse();
}

export function findArtifact({ root, artifactId = "", output = "" } = {}) {
    const records = readLedger(path.resolve(root || process.cwd()));
    for (let index = records.length - 1; index >= 0; index -= 1) {
        const item = records[index];
        if ((artifactId && item.artifactId === artifactId) || (output && item.file === output)) return item;
    }
    return null;
}
