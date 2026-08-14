import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("gestia-core/tools.runtime.js", "utf8");

test("v139 release skew permits only browser media fallback, not generic browser actions", () => {
    assert.match(runtime, /function jarvisReleaseSkewSafeRequest\([\s\S]*?normalizedPath === "\/browser"[\s\S]*?payload\?\.action[\s\S]*?=== "media"/);
    assert.match(runtime, /jarvisReleaseSkewSafeRequest\(normalizedPath, payload\)/);
    const helper = runtime.match(/function jarvisReleaseSkewSafeRequest\([\s\S]*?\n\}/)?.[0] || "";
    assert.ok(helper.includes('normalizedPath === "/browser"'));
    assert.ok(helper.includes('=== "media"'));
    for (const forbiddenAction of ["open", "inspect", "screenshot", "pdf"]) {
        assert.equal(helper.includes(`=== "${forbiddenAction}"`), false, forbiddenAction);
    }
});

test("v139 browser path is not added to the unconditional release-skew allowlist", () => {
    const allowlist = runtime.match(/const JARVIS_RELEASE_SKEW_SAFE_PATHS[\s\S]*?\]\);/)?.[0] || "";
    assert.equal(allowlist.includes('"/browser"'), false);
    assert.ok(allowlist.includes('"/web/media/collect"'));
});
