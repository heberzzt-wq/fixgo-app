import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shaPattern = /^[0-9a-f]{40}$/;

function sha256(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
}
function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
}

export function buildReleaseArtifacts({ gitSha, firestoreRules, storageRules, firebaseConfig, contractSource }) {
    if (!shaPattern.test(gitSha)) throw new Error("RELEASE_SHA_INVALID");
    const contractHash = sha256(contractSource);
    const marker = `// GESTIA_RELEASE_SHA:${gitSha} B2C_CONTRACT_SHA256:${contractHash}\n`;
    const manifest = {
        schema_version: "gestia-release-v1",
        git_sha: gitSha,
        b2c_contract_version: "b2c-platform-contract-v2",
        b2c_contract_sha256: contractHash,
        prepared_at: new Date().toISOString()
    };
    const releaseConfig = structuredClone(firebaseConfig);
    releaseConfig.firestore.rules = "security/firestore-release.generated.rules.txt";
    releaseConfig.storage.rules = "security/storage-release.generated.rules.txt";
    return {
        manifest,
        firestoreRules: `${marker}${firestoreRules}`,
        storageRules: `${marker}${storageRules}`,
        firebaseConfig: releaseConfig,
        functionIdentity: `"use strict";\nmodule.exports = ${JSON.stringify({ ...manifest, prepared: true }, null, 2)};\n`
    };
}

function currentGitSha() {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function assertClean() {
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
    if (status) throw new Error("RELEASE_WORKTREE_MUST_BE_CLEAN");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const allowDirty = process.argv.includes("--allow-dirty");
    if (!allowDirty) assertClean();
    const artifacts = buildReleaseArtifacts({
        gitSha: currentGitSha(),
        firestoreRules: read("security/firestore-console-snapshot-2026-07-30.rules.txt"),
        storageRules: read("security/storage-hardening-candidate.rules.txt"),
        firebaseConfig: JSON.parse(read("firebase.json")),
        contractSource: read("gestia-core/contracts/b2c-platform-contract.js")
    });
    write("release-manifest.json", `${JSON.stringify(artifacts.manifest, null, 2)}\n`);
    write("functions/generated/release-identity.cjs", artifacts.functionIdentity);
    write("security/firestore-release.generated.rules.txt", artifacts.firestoreRules);
    write("security/storage-release.generated.rules.txt", artifacts.storageRules);
    write("firebase.release.json", `${JSON.stringify(artifacts.firebaseConfig, null, 2)}\n`);
    process.stdout.write(`Prepared Gestia release ${artifacts.manifest.git_sha}\n`);
}
