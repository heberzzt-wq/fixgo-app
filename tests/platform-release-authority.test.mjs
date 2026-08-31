import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildReleaseArtifacts } from "../scripts/prepare-platform-release.mjs";
import { workerMatchesRelease } from "../platform-release.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const firebaseConfig = {
    firestore: { rules: "old-firestore.rules" },
    storage: { rules: "old-storage.rules" },
    functions: [{ source: "functions" }],
    hosting: [{ public: "." }]
};

test("release artifacts stamp Hosting, Functions and both rules with one Git SHA", () => {
    const artifacts = buildReleaseArtifacts({
        gitSha: SHA,
        firestoreRules: "rules_version = '2';\n",
        storageRules: "rules_version = '2';\n",
        firebaseConfig,
        contractSource: "canonical-contract"
    });
    assert.equal(artifacts.manifest.git_sha, SHA);
    assert.match(artifacts.functionIdentity, new RegExp(SHA));
    assert.match(artifacts.firestoreRules, new RegExp(`GESTIA_RELEASE_SHA:${SHA}`));
    assert.match(artifacts.storageRules, new RegExp(`GESTIA_RELEASE_SHA:${SHA}`));
    assert.equal(artifacts.firebaseConfig.firestore.rules, "security/firestore-release.generated.rules.txt");
    assert.equal(artifacts.firebaseConfig.storage.rules, "security/storage-release.generated.rules.txt");
});

test("service worker identity rejects mixed release URLs", () => {
    assert.equal(workerMatchesRelease({ scriptURL: `https://fixgo.test/sw.js?release_sha=${SHA}` }, SHA), true);
    assert.equal(workerMatchesRelease({ scriptURL: "https://fixgo.test/sw.js?release_sha=ffffffffffffffffffffffffffffffffffffffff" }, SHA), false);
    assert.equal(workerMatchesRelease({ scriptURL: "https://fixgo.test/sw.js" }, SHA), false);
});

test("repository has one physical worker and no parallel direct registration", () => {
    const root = new URL("../", import.meta.url);
    assert.equal(fs.existsSync(new URL("sw.js", root)), true);
    const files = ["index.html", "app-main.js", "app-login.js", "app-registro.js", "app-tecnico-b2b.js", "panel-b2b-admin.js"];
    const combined = files.map(file => fs.readFileSync(new URL(file, root), "utf8")).join("\n");
    assert.equal((combined.match(/serviceWorker\.register/g) || []).length, 0);
    assert.match(combined, /initializePlatformRelease/);
    const authority = fs.readFileSync(new URL("platform-release.js", root), "utf8");
    assert.equal((authority.match(/serviceWorker\.register/g) || []).length, 1);
    assert.match(authority, /scope:\s*"\/"/);
});

test("background notification handler has one FCM path and stable deduplication", () => {
    const source = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
    assert.equal((source.match(/onBackgroundMessage/g) || []).length, 1);
    assert.equal((source.match(/addEventListener\("push"/g) || []).length, 0);
    assert.match(source, /messageId \|\| data\.serviceId/);
    assert.match(source, /renotify:\s*false/);
});
