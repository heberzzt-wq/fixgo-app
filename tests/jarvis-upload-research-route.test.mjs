import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
    createJarvisUploadBridgeApp,
    JARVIS_UPLOAD_BRIDGE_VERSION
} from "../jarvis-upload-bridge.js";

function initializeBridgeRoot() {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "jarvis-upload-research-")
    );
    execFileSync("git", ["init", "-b", "v5.9-polish"], {
        cwd: root,
        stdio: "ignore"
    });
    fs.writeFileSync(
        path.join(root, "jarvis-runtime-contract.json"),
        JSON.stringify({
            projectId: "fixgo-test",
            branch: "v5.9-polish",
            releaseId: "test-release"
        }),
        "utf8"
    );
    return root;
}

test("upload bridge replaces the legacy research route with resilient local research", async () => {
    const root = initializeBridgeRoot();
    const originalFetch = globalThis.fetch;
    const server = createJarvisUploadBridgeApp({ root }).listen(0);

    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    globalThis.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target.startsWith(base)) {
            return originalFetch(url, options);
        }
        if (target.includes("html.duckduckgo.com")) {
            return {
                ok: true,
                status: 200,
                url: target,
                async text() {
                    return '<div class="result results_links"><a class="result__a" href="https://nodejs.org/en/blog/release/v26.5.1">Node.js v26.5.1</a><a class="result__snippet">Current Node.js release.</a></div>';
                }
            };
        }
        throw new Error(`UNEXPECTED_UPSTREAM:${target}`);
    };

    try {
        const response = await originalFetch(`${base}/research`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "test-release"
            },
            body: JSON.stringify({
                query: "Node.js current release"
            })
        });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.ok, true);
        assert.equal(body.grounded, true);
        assert.equal(body.engine, "jarvis_local_duckduckgo_html_research");
        assert.equal(body.sources[0].url, "https://nodejs.org/en/blog/release/v26.5.1");
        assert.equal(body.uploadTransportVersion, JARVIS_UPLOAD_BRIDGE_VERSION);
    }
    finally {
        globalThis.fetch = originalFetch;
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});
