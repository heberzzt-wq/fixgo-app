const origin = (process.argv.find(value => value.startsWith("--origin="))?.split("=")[1] || "https://fixgo-44e4d.web.app").replace(/\/$/, "");
const project = process.argv.find(value => value.startsWith("--project="))?.split("=")[1] || "fixgo-44e4d";
const storageBucket = process.argv.find(value => value.startsWith("--bucket="))?.split("=")[1] || "fixgo-44e4d.firebasestorage.app";
const token = process.env.FIREBASE_ACCESS_TOKEN;
const shaPattern = /^[0-9a-f]{40}$/;

async function json(url, options = {}) {
    const response = await fetch(url, { ...options, cache: "no-store" });
    if (!response.ok) throw new Error(`RELEASE_SMOKE_HTTP_${response.status}:${url}`);
    return response.json();
}

async function text(url, options = {}) {
    const response = await fetch(url, { ...options, cache: "no-store" });
    if (!response.ok) throw new Error(`RELEASE_SMOKE_HTTP_${response.status}:${url}`);
    return response.text();
}

async function releasedRules(releaseId) {
    if (!token) throw new Error("FIREBASE_ACCESS_TOKEN_REQUIRED_FOR_RULES_SMOKE");
    const headers = { Authorization: `Bearer ${token}` };
    const release = await json(
        `https://firebaserules.googleapis.com/v1/projects/${project}/releases/${releaseId}`,
        { headers }
    );
    const ruleset = await json(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`, { headers });
    return (ruleset.source?.files || []).map(file => file.content || "").join("\n");
}

function assertedSha(source, surface) {
    const match = source.match(/GESTIA_RELEASE_SHA:([0-9a-f]{40})/);
    if (!match) throw new Error(`RELEASE_SHA_MARKER_MISSING:${surface}`);
    return match[1];
}

const manifest = await json(`${origin}/release-manifest.json`);
if (!shaPattern.test(String(manifest.git_sha || ""))) throw new Error("HOSTING_RELEASE_SHA_INVALID");
const [functionIdentity, workerSource, firestoreRules, storageRules] = await Promise.all([
    json(`${origin}/api/release-identity`),
    text(`${origin}/sw.js?release_sha=${manifest.git_sha}`),
    releasedRules("cloud.firestore"),
    releasedRules(`firebase.storage/${storageBucket}`)
]);

if (!workerSource.includes('new URL(self.location.href).searchParams.get("release_sha")')) {
    throw new Error("SERVICE_WORKER_RELEASE_AUTHORITY_MISSING");
}
const surfaces = {
    hosting: manifest.git_sha,
    functions: functionIdentity.git_sha,
    frontend_runtime: manifest.git_sha,
    service_worker: manifest.git_sha,
    firestore_rules: assertedSha(firestoreRules, "firestore"),
    storage_rules: assertedSha(storageRules, "storage")
};
const unique = [...new Set(Object.values(surfaces))];
if (unique.length !== 1 || unique[0] !== manifest.git_sha) {
    throw new Error(`RELEASE_IDENTITY_MISMATCH:${JSON.stringify(surfaces)}`);
}
if (functionIdentity.b2c_contract_sha256 !== manifest.b2c_contract_sha256) {
    throw new Error("B2C_CONTRACT_HASH_MISMATCH");
}
process.stdout.write(`${JSON.stringify({ ok: true, origin, release_sha: manifest.git_sha, surfaces }, null, 2)}\n`);

export { assertedSha };
