import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, test } from "node:test";

import { runEngineeringMission } from "../src/repo-tools.mjs";

const temporaryRoots = [];

function git(root, args) {
    return execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        windowsHide: true
    }).trim();
}

function createFixture() {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "fixgo-engineering-mission-")
    );
    temporaryRoots.push(root);
    git(root, ["init", "-b", "v5.9-polish"]);
    git(root, ["config", "user.email", "jarvis@example.invalid"]);
    git(root, ["config", "user.name", "Jarvis Fixture"]);
    fs.writeFileSync(
        path.join(root, "calculator.js"),
        "export const total = 40 + 1;\n",
        "utf8"
    );
    git(root, ["add", "calculator.js"]);
    git(root, ["commit", "-m", "fixture"]);
    return {
        root,
        head: git(root, ["rev-parse", "HEAD"])
    };
}

function patchFor(replacement = "export const total = 40 + 2;") {
    return [
        "diff --git a/calculator.js b/calculator.js",
        "--- a/calculator.js",
        "+++ b/calculator.js",
        "@@ -1 +1 @@",
        "-export const total = 40 + 1;",
        `+${replacement}`,
        ""
    ].join("\n");
}

afterEach(() => {
    delete process.env.FIXGO_REPO_ROOT;
    while (temporaryRoots.length) {
        fs.rmSync(temporaryRoots.pop(), {
            recursive: true,
            force: true
        });
    }
});

test("engineering mission executes the complete verified repository cycle", () => {
    const fixture = createFixture();
    process.env.FIXGO_REPO_ROOT = fixture.root;

    const result = runEngineeringMission({
        query: "40 + 1",
        file: "calculator.js",
        patch: patchFor(),
        expectedHead: fixture.head,
        testProfile: "diff_check"
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "ENGINEERING_MISSION_COMPLETED");
    assert.deepEqual(result.changedFiles, ["calculator.js"]);
    assert.equal(result.tests.status, "TEST_PROFILE_PASSED");
    assert.match(result.evidence.finalDiff, /40 \+ 2/);
    assert.equal(
        fs.readFileSync(
            path.join(fixture.root, "calculator.js"),
            "utf8"
        ).replace(/\r\n/g, "\n"),
        "export const total = 40 + 2;\n"
    );
    assert.deepEqual(
        result.observations.map(item => item.stage),
        [
            "repo_status",
            "list_files",
            "search_code",
            "read_file",
            "patch_check",
            "patch_apply",
            "run_tests",
            "final_diff"
        ]
    );
    assert.ok(result.observations.every(item => item.ok));
});

test("engineering mission fails closed before applying an invalid patch", () => {
    const fixture = createFixture();
    process.env.FIXGO_REPO_ROOT = fixture.root;

    const result = runEngineeringMission({
        query: "40 + 1",
        file: "calculator.js",
        patch: patchFor("export const total = missing;"),
        expectedHead: "0".repeat(40),
        testProfile: "diff_check"
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "ENGINEERING_MISSION_FAILED");
    assert.equal(result.stage, "patch_check");
    assert.equal(
        fs.readFileSync(
            path.join(fixture.root, "calculator.js"),
            "utf8"
        ).replace(/\r\n/g, "\n"),
        "export const total = 40 + 1;\n"
    );
});

test("engineering mission preserves applied evidence when tests fail", () => {
    const fixture = createFixture();
    process.env.FIXGO_REPO_ROOT = fixture.root;

    const result = runEngineeringMission({
        query: "40 + 1",
        file: "calculator.js",
        patch: patchFor(),
        expectedHead: fixture.head,
        testProfile: "media"
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "ENGINEERING_MISSION_FAILED");
    assert.equal(result.stage, "run_tests");
    assert.deepEqual(result.changedFiles, ["calculator.js"]);
    assert.equal(result.tests.status, "TEST_PROFILE_FAILED");
    assert.notEqual(result.tests.exitCode, 0);
    assert.equal(result.evidence.patchStatus, "PATCH_APPLIED");
    assert.match(result.error, /jarvis-media-analysis|TEST_PROFILE_FAILED/i);
    assert.equal(
        fs.readFileSync(
            path.join(fixture.root, "calculator.js"),
            "utf8"
        ).replace(/\r\n/g, "\n"),
        "export const total = 40 + 2;\n"
    );
    assert.equal(
        result.observations.at(-1).status,
        "TEST_PROFILE_FAILED"
    );
});
