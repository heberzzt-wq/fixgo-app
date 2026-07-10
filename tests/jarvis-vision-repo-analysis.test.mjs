import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeIntent } from "../gestia-core/jarvis/jarvis.vision.engine.js";

test("repo analysis resolves to repo.hub read-only", () => {
    const result = analyzeIntent("analiza el repo");

    assert.equal(result.intent, "ANALYZE");
    assert.equal(result.targetFile, "repo.hub");
    assert.equal(result.action, "inspect_repo");
    assert.ok(result.tags.includes("repo_analysis"));
    assert.ok(result.tags.includes("read_only"));
    assert.ok(result.suggestions.some(item => item.includes("No generar Plan Preview")));
});

test("repository analysis does not get replaced by ranked file matches", () => {
    const result = analyzeIntent("analizar repository jarvis terminal");

    assert.equal(result.targetFile, "repo.hub");
    assert.equal(result.module, "repo");
    assert.equal(result.action, "inspect_repo");
});
