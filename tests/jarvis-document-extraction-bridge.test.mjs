import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
    createJarvisFsBridgeApp
} from "../jarvis-fs-bridge.js";

function initFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-extract-bridge-"));
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["checkout", "-b", "v94-doc-extract-test"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(
        path.join(root, "jarvis-runtime-contract.json"),
        JSON.stringify({
            projectId: "fixgo-app",
            branch: "v94-doc-extract-test",
            releaseId: "v94-doc-extract-test-release"
        }, null, 2)
    );
    fs.mkdirSync(path.join(root, ".jarvis-artifacts", "uploads"), { recursive: true });
    fs.writeFileSync(
        path.join(root, ".jarvis-artifacts", "uploads", "brief.txt"),
        "Fuente exacta: Península Tech\nMeta: 40 leads verificados\n",
        "utf8"
    );
    return root;
}

async function withServer(root, callback) {
    const app = createJarvisFsBridgeApp(root);
    const server = await new Promise(resolve => {
        const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    try {
        const address = server.address();
        await callback(`http://127.0.0.1:${address.port}`);
    }
    finally {
        await new Promise(resolve => server.close(resolve));
    }
}

test("POST /artifact/extract returns source hash and exact text from ledger bytes", async () => {
    const root = initFixture();
    try {
        await withServer(root, async baseUrl => {
            const response = await fetch(`${baseUrl}/artifact/extract`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "X-Jarvis-Release-Id": "v94-doc-extract-test-release"
                },
                body: JSON.stringify({
                    output: ".jarvis-artifacts/uploads/brief.txt",
                    sourceName: "brief.txt",
                    mimeType: "text/plain"
                })
            });
            const payload = await response.json();

            assert.equal(response.status, 200);
            assert.equal(payload.ok, true);
            assert.equal(payload.status, "DOCUMENT_EXTRACTION_READY");
            assert.equal(payload.readOnly, true);
            assert.equal(payload.sourceName, "brief.txt");
            assert.match(payload.sha256, /^[a-f0-9]{64}$/);
            assert.match(payload.pages[0].text, /40 leads verificados/);
            assert.equal(payload.policy.noSyntheticText, true);
        });
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("POST /artifact/extract remains behind bridge release identity", async () => {
    const root = initFixture();
    try {
        await withServer(root, async baseUrl => {
            const response = await fetch(`${baseUrl}/artifact/extract`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "X-Jarvis-Release-Id": "wrong-release"
                },
                body: JSON.stringify({
                    output: ".jarvis-artifacts/uploads/brief.txt",
                    sourceName: "brief.txt"
                })
            });
            const payload = await response.json();
            assert.equal(response.status, 409);
            assert.equal(payload.ok, false);
            assert.equal(payload.status, "BRIDGE_RELEASE_MISMATCH");
        });
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
