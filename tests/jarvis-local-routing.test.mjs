import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const planner = fs.readFileSync(
    path.join(root, "gestia-core/jarvis/jarvis.multifunction.planner.js"),
    "utf8"
);

test("legacy local lexical router is absent", () => {
    assert.equal(
        fs.existsSync(path.join(root, "gestia-core/jarvis/jarvis.local.routing.js")),
        false
    );
});

test("all natural-language planning enters Jarvis local semantic route", () => {
    assert.match(planner, /const LOCAL_SEMANTIC_ROUTE = "\/semantic\/plan";/);
    assert.match(planner, /LOCAL_SEMANTIC_BRIDGE_REQUIRED/);
    assert.match(planner, /localOnly:\s*true/);
    assert.match(planner, /alternateBrains:\s*0/);
    assert.doesNotMatch(planner, /classifyLocalRequest/);
    assert.doesNotMatch(planner, /PROJECT_MEMORY_QUERY/);
    assert.doesNotMatch(planner, /MARKETING_CONTINUATION/);
    assert.doesNotMatch(planner, /MARKETING_START/);
});

test("planner contains no cloud semantic fallback", () => {
    assert.doesNotMatch(planner, /cloudfunctions\.net\/jarvisSemanticPlan/);
    assert.doesNotMatch(planner, /getIdToken\(\)/);
    assert.doesNotMatch(planner, /callBrowserSemanticPlan/);
    assert.doesNotMatch(planner, /callBrowserMissionContract/);
});
