import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("gestia-core/tools.runtime.js", "utf8");

test("v139 tolerates release skew only for current local artifact routes", () => {
    assert.match(runtime, /JARVIS_RELEASE_SKEW_SAFE_MIN_BRIDGE_VERSION\s*=\s*\n\s*"2\.45\.0-native-mp4-reel-export-v138"/);
    assert.match(runtime, /const JARVIS_RELEASE_SKEW_SAFE_PATHS\s*=\s*\n\s*new Set\(\[/);
    for (const path of [
        "/research",
        "/web/media/collect",
        "/speech/synthesize",
        "/reel/create",
        "/artifact/read"
    ]) {
        assert.equal(runtime.includes(`"${path}"`), true, path);
    }
    const allowlist = runtime.match(/const JARVIS_RELEASE_SKEW_SAFE_PATHS[\s\S]*?\]\);/)?.[0] || "";
    for (const forbidden of ["/write", "/write/prepare", "/write/authorize", "/git", "/run"]) {
        assert.equal(allowlist.includes(`"${forbidden}"`), false, forbidden);
    }
});

test("v139 release skew requires same project and branch lineage plus bridge 2.45+", () => {
    assert.match(runtime, /const lineageCompatible =[\s\S]*?actual\?\.contract\?\.projectId === expected\.projectId[\s\S]*?actual\?\.contract\?\.branch === expected\.branch[\s\S]*?actual\?\.git\?\.branch === expected\.branch/);
    assert.match(runtime, /const releaseCompatible =\s*\n\s*lineageCompatible &&\s*\n\s*actual\?\.contract\?\.releaseId === expected\.releaseId/);
    assert.match(runtime, /identity\.releaseSkewBridgeVersionCompatible === true/);
    assert.match(runtime, /JARVIS_RELEASE_SKEW_SAFE_PATHS\.has\(normalizedPath\)/);
});

test("v139 release skew uses local release only on safe paths while strict identity remains default", () => {
    assert.match(runtime, /const selectedReleaseId =\s*\n\s*releaseSkewAllowed\s*\n\s*\? String\(identity\.actual\?\.contract\?\.releaseId \|\| ""\)\s*\n\s*: String\(identity\.expected\?\.releaseId \|\| ""\)/);
    assert.match(runtime, /"X-Jarvis-Release-Id":\s*\n\s*selectedReleaseId/);
    assert.match(runtime, /identity\.ok !== true &&\s*\n\s*releaseSkewAllowed !== true/);
});
