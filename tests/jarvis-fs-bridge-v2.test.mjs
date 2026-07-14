import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
    applyReadLineRange,
    assertWriteContent,
    describeJarvisFsBridge,
    normalizeReadLineRange,
    readJarvisRuntimeContract,
    resolveRepoPath,
    runLocalWebResearch
} from "../jarvis-fs-bridge.js";

test("Jarvis FS bridge V2 describes safe full repo policy", () => {
    const description =
        describeJarvisFsBridge();

    assert.equal(description.ok, true);
    assert.equal(description.version, "2.3.0-local-actuator-bridge");
    assert.equal(description.policy.authority, "full_repo_private_owner");
    assert.equal(description.policy.safeZone, "advisory");
    assert.equal(description.policy.emptyWrites, "blocked");
    assert.equal(typeof description.actuators.browser.available, "boolean");
    assert.equal(description.actuators.documents.available, true);
    assert.equal(description.actuators.documents.nativeOffice, true);
    assert.ok(description.actuators.documents.formats.includes("docx"));
    assert.ok(description.actuators.documents.formats.includes("xlsx"));
    assert.ok(description.actuators.documents.formats.includes("pptx"));
    assert.equal(description.actuators.webResearch.grounded, true);
});

test("Jarvis FS bridge loads the release identity contract", () => {
    const contract =
        readJarvisRuntimeContract(
            process.cwd()
        );

    assert.equal(contract.ok, true);
    assert.equal(contract.projectId, "fixgo-app");
    assert.equal(contract.branch, "v5.9-polish");
    assert.match(
        contract.releaseId,
        /^v5\.9-polish-forensic-/
    );
});

test("Jarvis FS bridge V2 reads bounded line ranges", () => {
    const lineRange =
        normalizeReadLineRange({
            startLine:
                2,
            endLine:
                4
        });

    const result =
        applyReadLineRange(
            [
                "line 1",
                "line 2",
                "line 3",
                "line 4",
                "line 5"
            ].join("\n"),
            lineRange
        );

    assert.equal(result.partial, true);
    assert.equal(result.startLine, 2);
    assert.equal(result.endLine, 4);
    assert.equal(result.totalLines, 5);
    assert.equal(
        result.content,
        "line 2\nline 3\nline 4"
    );
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

test("Jarvis local research fallback returns bounded verifiable web sources", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        text: async () => [
            "<rss><channel>",
            "<item><title>Firebase Hosting</title><link>https://firebase.google.com/docs/hosting</link><description>Official hosting documentation.</description></item>",
            "<item><title>Firebase CLI</title><link>https://firebase.google.com/docs/cli</link><description>Official command line documentation.</description></item>",
            "</channel></rss>"
        ].join("")
    });

    try {
        const result = await runLocalWebResearch(
            "documentacion oficial Firebase Hosting"
        );

        assert.equal(result.ok, true);
        assert.equal(result.grounded, true);
        assert.equal(result.sourceCount, 2);
        assert.equal(result.sources[0].url, "https://firebase.google.com/docs/hosting");
        assert.deepEqual(result.supports[0].sourceIds, [1]);
    }
    finally {
        globalThis.fetch = previousFetch;
    }
});
