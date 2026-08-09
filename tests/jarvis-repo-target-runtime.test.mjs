import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
    parseRepositoryTarget,
    resolveRepositorySelector
} from "../gestia-core/repo/repo.target.js";

const BRANCH = "codex/jarvis-v8-runtime-foundation";
const BRANCH_URL = `https://github.com/heberzzt-wq/fixgo-app/blob/${BRANCH}`;

test("GitHub blob URL whose selector is a slash branch resolves as a branch, not a file", () => {
    const parsed = parseRepositoryTarget(BRANCH_URL);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.kind, "github_selector");
    const resolved = resolveRepositorySelector(parsed, [BRANCH, "v94-media-v4n-negative-claims"]);
    assert.equal(resolved.ok, true);
    assert.equal(resolved.kind, "github_ref");
    assert.equal(resolved.ref, BRANCH);
    assert.equal(resolved.path, "");
});

test("GitHub file URL keeps the slash branch and separates the repository path", () => {
    const target = `${BRANCH_URL}/gestia-core/tools.runtime.js`;
    const resolved = resolveRepositorySelector(parseRepositoryTarget(target), [BRANCH]);
    assert.equal(resolved.kind, "github_path");
    assert.equal(resolved.ref, BRANCH);
    assert.equal(resolved.path, "gestia-core/tools.runtime.js");
});

test("repo audit and scan use live graph and never the manual scan shim", () => {
    const runtime = fs.readFileSync(new URL("../gestia-core/tools.runtime.js", import.meta.url), "utf8");
    const auditStart = runtime.indexOf('name: "repo.audit"');
    const readStart = runtime.indexOf('name: "repo.read"');
    const pack = runtime.slice(auditStart, readStart);
    assert.match(pack, /JarvisLocalBridge\.buildRepoGraph/);
    assert.doesNotMatch(pack, /import\('\/gestia-core\/hubs\/repo\.hub\.js'\)/);
    assert.match(runtime, /REPOSITORY_REFERENCE_ANALYZED/);
    assert.match(runtime, /resolveRepoTarget/);
    assert.match(runtime, /readRepoTarget/);
});

test("boot has no phantom analysis hub and legacy repo index is metadata only", () => {
    const kernel = fs.readFileSync(new URL("../gestia-core/jarvis.kernel.js", import.meta.url), "utf8");
    const terminal = fs.readFileSync(new URL("../gestia-terminal.js", import.meta.url), "utf8");
    const index = fs.readFileSync(new URL("../modules/terminal/repo-bootstrap-index.js", import.meta.url), "utf8");
    assert.doesNotMatch(kernel, /from "\.\/hubs\/analysis\.hub\.js"/);
    assert.match(kernel, /SEMANTIC_ANALYSIS_DELEGATED/);
    assert.match(terminal, /LIVE_REPO_GRAPH_REQUIRED/);
    assert.match(index, /LEGACY_METADATA_ONLY/);
    assert.doesNotMatch(index, /__REPO_INDEX__\["analysis\.hub\.js"\]/);
    assert.doesNotMatch(index, /__REPO_INDEX__\["jarvis\.context\.memory\.v6\.js"\]/);
});

test("bridge exposes ref-aware graph and git-object read routes", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.match(bridge, /\/repo\/resolve-target/);
    assert.match(bridge, /\/repo\/read-target/);
    assert.match(bridge, /buildGraphForResolvedTarget/);
    assert.match(bridge, /worktree.*add/);
    assert.match(bridge, /resolveRepositorySelector/);
    assert.match(bridge, /trim: false/);
    assert.match(bridge, /repoGraphCache\.cacheKey !== cacheKey/);
    assert.match(bridge, /buildGraphForResolvedTarget\(resolved/);
    assert.match(bridge, /REPOSITORY_REMOTE_MISMATCH/);
    assert.match(bridge, /localGitHubRepositoryIdentity/);
});
