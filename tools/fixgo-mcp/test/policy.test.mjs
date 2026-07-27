import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
    extractPatchPaths,
    normalizeRelativePath,
    resolveRepoPath
} from "../src/policy.mjs";
import { listFiles } from "../src/repo-tools.mjs";

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.."
);

test("patch parser accepts bounded repository paths", () => {
    const paths = extractPatchPaths([
        "diff --git a/functions/a.js b/functions/a.js",
        "--- a/functions/a.js",
        "+++ b/functions/a.js",
        "@@ -1 +1 @@",
        "-old",
        "+new"
    ].join("\n"));

    assert.deepEqual(paths, ["functions/a.js"]);
});

test("patch parser rejects traversal", () => {
    assert.throws(
        () => extractPatchPaths([
            "--- a/../../escape.js",
            "+++ b/../../escape.js"
        ].join("\n")),
        /REPO_PATH_BLOCKED/
    );
});

test("path policy blocks secrets and .git", () => {
    assert.throws(() => resolveRepoPath(".env"), /SENSITIVE_PATH_BLOCKED/);
    assert.throws(() => resolveRepoPath(".git/config"), /REPO_PATH_BLOCKED/);
});

test("path normalization rejects generated and dependency segments", () => {
    assert.throws(
        () => normalizeRelativePath(
            "tools/fixgo-mcp/node_modules/pkg/index.js"
        ),
        /REPO_PATH_BLOCKED/
    );
    assert.throws(
        () => normalizeRelativePath("build/generated.js"),
        /REPO_PATH_BLOCKED/
    );
});

test("repository discovery is bounded and excludes ignored dependencies", () => {
    const previousRoot = process.env.FIXGO_REPO_ROOT;
    process.env.FIXGO_REPO_ROOT = repoRoot;
    try {
        const result = listFiles({
            pathspec: ["tools/fixgo-mcp"],
            maxResults: 20
        });
        assert.equal(result.ok, true);
        assert.ok(
            result.files.includes("tools/fixgo-mcp/src/server.mjs")
        );
        assert.ok(
            result.files.every(file => !file.includes("node_modules"))
        );
        assert.ok(result.count <= 20);
    } finally {
        if (previousRoot == null) {
            delete process.env.FIXGO_REPO_ROOT;
        } else {
            process.env.FIXGO_REPO_ROOT = previousRoot;
        }
    }
});
