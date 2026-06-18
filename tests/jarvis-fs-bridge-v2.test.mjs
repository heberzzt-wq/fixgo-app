import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
    assertWriteContent,
    describeJarvisFsBridge,
    resolveRepoPath
} from "../jarvis-fs-bridge.js";

test("Jarvis FS bridge V2 describes safe full repo policy", () => {
    const description =
        describeJarvisFsBridge();

    assert.equal(description.ok, true);
    assert.equal(description.version, "2.0.0-local-fs-bridge");
    assert.equal(description.policy.authority, "full_repo_private_owner");
    assert.equal(description.policy.safeZone, "advisory");
    assert.equal(description.policy.emptyWrites, "blocked");
});

test("Jarvis FS bridge V2 blocks empty write content", () => {
    assert.throws(
        () => assertWriteContent(""),
        /EMPTY_WRITE_CONTENT/
    );
});

test("Jarvis FS bridge V2 keeps writes inside the repo root", () => {
    const root =
        path.resolve(process.cwd());

    const safePath =
        resolveRepoPath(
            "gestia-terminal.js",
            root
        );

    assert.equal(
        safePath,
        path.join(root, "gestia-terminal.js")
    );

    assert.throws(
        () => resolveRepoPath("../outside.js", root),
        /PATH_OUTSIDE_REPO/
    );

    assert.throws(
        () => resolveRepoPath(path.join(root, "x.js"), root),
        /ABSOLUTE_PATH_NOT_ALLOWED/
    );
});
