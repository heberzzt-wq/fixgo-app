import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "acorn";

import { buildReleaseArtifacts } from "../scripts/prepare-platform-release.mjs";
import { waitForWorkerActivation, workerMatchesRelease } from "../platform-release.js";

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

test("release authority waits until the exact service worker is activated", async () => {
    const worker = new EventTarget();
    worker.state = "installed";
    setTimeout(() => {
        worker.state = "activated";
        worker.dispatchEvent(new Event("statechange"));
    }, 5);
    assert.equal(await waitForWorkerActivation(worker, 100), worker);
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
    assert.ok(source.indexOf('addEventListener("notificationclick"') < source.indexOf("importScripts("));
    assert.match(source, /if \(payload\?\.notification\) return undefined/);
});

test("B2C and B2B obtain Web Push identity from the Firebase singleton", () => {
    const root = new URL("../", import.meta.url);
    const firebase = fs.readFileSync(new URL("firebase.js", root), "utf8");
    const consumers = ["panel-tecnico.js", "app-tecnico-b2b.js", "panel-b2b-admin.js"]
        .map(file => fs.readFileSync(new URL(file, root), "utf8"));

    assert.equal((firebase.match(/GESTIA_FCM_VAPID_KEY\s*=/g) || []).length, 1);
    for (const source of consumers) {
        assert.match(source, /vapidKey:\s*GESTIA_FCM_VAPID_KEY/);
        assert.equal((source.match(/vapidKey:\s*['"]/g) || []).length, 0);
    }
});

test("technician page routes close and B2B start through existing canonical authorities", () => {
    const source = fs.readFileSync(new URL("../tecnico.html", import.meta.url), "utf8");
    const inlineModules = [...source.matchAll(/<script\s+type="module">([\s\S]*?)<\/script>/g)]
        .map(match => match[1])
        .filter(Boolean);

    assert.ok(inlineModules.length >= 2);
    for (const moduleSource of inlineModules) {
        parse(moduleSource, { ecmaVersion: "latest", sourceType: "module" });
    }

    assert.match(source, /b2c_evidence\/\$\{serviceId\}\/\$\{uid\}\/\$\{eventType\}/);
    assert.match(source, /button\.id === "btnSubirEvidencia"/);
    assert.match(source, /event\.stopImmediatePropagation\(\)/);
    assert.match(source, /cierre_operativo_completado:\s*true/);
    assert.match(source, /cierre_financiero_pendiente_backend:\s*true/);
    assert.match(source, /cierre_legacy_financiero_ejecutado:\s*false/);
    assert.match(source, /work_evidence_binding_path:\s*bindingRef\.path/);
    assert.match(source, /base64_persisted:\s*false/);
    assert.match(source, /data\.cliente_id !== initial\.cliente_id/);
    assert.doesNotMatch(source, /cliente_id:\s*["']admin_residencial["']/);
    assert.doesNotMatch(source, /transaction\.set\(transRef/);
});

test("shared PDF utility resolves remote Storage signatures before saving", () => {
    const source = fs.readFileSync(new URL("../app-utils.js", import.meta.url), "utf8");
    parse(source, { ecmaVersion: "latest", sourceType: "module" });
    assert.match(source, /prepararJsPdfParaImagenesRemotas/);
    assert.match(source, /\^https\?:\\\/\\\//);
    assert.match(source, /urlABase64\(imageData\)/);
    assert.match(source, /__gestiaPendingRemoteImages/);
    assert.match(source, /Promise\.all\(pending\)/);
    assert.match(source, /if \(url\.startsWith\('data:'\)\) return url/);
});
