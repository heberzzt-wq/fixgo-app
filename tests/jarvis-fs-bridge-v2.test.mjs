import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
    applyReadLineRange,
    appendChunkedUpload,
    assertWriteContent,
    cancelChunkedUpload,
    completeChunkedUpload,
    describeJarvisFsBridge,
    inspectLocalConnectors,
    normalizeReadLineRange,
    readJarvisRuntimeContract,
    resolveRepoPath,
    runLocalWebResearch,
    saveGeneratedImageArtifact,
    saveUploadedArtifact,
    startChunkedUpload,
    readArtifactPayload
} from "../jarvis-fs-bridge.js";

test("Jarvis FS bridge V2 describes safe full repo policy", () => {
    const description =
        describeJarvisFsBridge();

    assert.equal(description.ok, true);
    assert.equal(description.version, "2.7.0-chunked-multimodal-ingestion");
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
    assert.equal(typeof description.actuators.multimodalUploads.verifiedCount, "number");
    assert.equal(description.actuators.multimodalUploads.transport, "chunked_progressive");
    assert.equal(description.actuators.multimodalUploads.maxFilesPerRequest, 30);
    assert.equal(description.actuators.multimodalUploads.maxBatchBytes, 500 * 1024 * 1024);
    assert.equal(typeof description.actuators.imageGeneration.verifiedCount, "number");
    assert.deepEqual(description.actuators.connectors.adapters, ["github", "firebase"]);
});

test("Jarvis streams a file in bounded chunks, verifies SHA-256 and preserves trace", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-chunked-upload-"));
    try {
        const source = Buffer.from("contenido progresivo real para expediente V7");
        const started = startChunkedUpload({
            root,
            batchId: "batch-forensic-v7",
            name: "evidencia.xml",
            mimeType: "application/xml",
            expectedBytes: source.length,
            caseId: "CASE-7",
            objectiveId: "OBJ-7"
        });
        const first = source.subarray(0, 13);
        const second = source.subarray(13);
        const progress = appendChunkedUpload({ root, uploadId: started.uploadId, offset: 0, dataBase64: first.toString("base64") });
        assert.equal(progress.receivedBytes, first.length);
        appendChunkedUpload({ root, uploadId: started.uploadId, offset: first.length, dataBase64: second.toString("base64") });
        const completed = completeChunkedUpload({ root, uploadId: started.uploadId });
        assert.equal(completed.status, "UPLOAD_SAVED");
        assert.equal(completed.caseId, "CASE-7");
        assert.equal(completed.objectiveId, "OBJ-7");
        assert.match(completed.sha256, /^[a-f0-9]{64}$/);
        assert.deepEqual(fs.readFileSync(path.join(root, completed.output)), source);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Jarvis fails closed on chunk offset mismatch and supports individual cancellation", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-cancel-upload-"));
    try {
        const started = startChunkedUpload({ root, batchId: "batch-cancel-v7", name: "foto.jpg", expectedBytes: 4 });
        assert.throws(() => appendChunkedUpload({ root, uploadId: started.uploadId, offset: 2, dataBase64: Buffer.from("ab").toString("base64") }), /UPLOAD_CHUNK_OFFSET_MISMATCH/);
        assert.equal(cancelChunkedUpload({ root, uploadId: started.uploadId }).status, "UPLOAD_CANCELLED");
        assert.throws(() => completeChunkedUpload({ root, uploadId: started.uploadId }), /UPLOAD_SESSION_NOT_FOUND/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Jarvis enforces the 30-file limit in the persisted batch ledger", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-batch-limit-"));
    try {
        const sessions = Array.from({ length: 30 }, (_, index) => startChunkedUpload({
            root,
            batchId: "batch-thirty-files-v7",
            name: `evidencia-${index}.txt`,
            expectedBytes: 1
        }));
        assert.equal(sessions.length, 30);
        assert.throws(() => startChunkedUpload({
            root,
            batchId: "batch-thirty-files-v7",
            name: "evidencia-31.txt",
            expectedBytes: 1
        }), /UPLOAD_BATCH_FILE_LIMIT/);
        cancelChunkedUpload({ root, uploadId: sessions[0].uploadId });
        assert.equal(startChunkedUpload({
            root,
            batchId: "batch-thirty-files-v7",
            name: "reemplazo.txt",
            expectedBytes: 1
        }).ok, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Jarvis receives an uploaded document and returns it as a downloadable artifact", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-upload-"));
    try {
        const saved = saveUploadedArtifact({
            root,
            name: "brief-mph.md",
            mimeType: "text/markdown",
            dataBase64: Buffer.from("# Brief MPH\nMarketing real").toString("base64")
        });
        const downloaded = readArtifactPayload({ root, output: saved.output });

        assert.equal(saved.ok, true);
        assert.equal(saved.status, "UPLOAD_SAVED");
        assert.ok(saved.output.startsWith(".jarvis-artifacts/uploads/"));
        assert.equal(downloaded.ok, true);
        assert.equal(downloaded.mimeType, "text/markdown");
        assert.equal(Buffer.from(downloaded.dataBase64, "base64").toString(), "# Brief MPH\nMarketing real");
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Jarvis persists generated image bytes inside its artifact directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-image-"));
    try {
        const result = saveGeneratedImageArtifact({
            root,
            mimeType: "image/png",
            imageBase64: Buffer.from("real-image-bytes").toString("base64"),
            output: ".jarvis-artifacts/images/test.png"
        });

        assert.equal(result.ok, true);
        assert.equal(result.status, "IMAGE_SAVED");
        assert.equal(result.output, ".jarvis-artifacts/images/test.png");
        assert.equal(fs.readFileSync(path.join(root, result.output)).toString(), "real-image-bytes");
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Jarvis verifies GitHub and Firebase connectors with read-only probes", async () => {
    const result = await inspectLocalConnectors({
        root: process.cwd(),
        gitProbe: async () => true,
        fetchImpl: async () => ({ ok: true, status: 200 })
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "CONNECTORS_VERIFIED");
    assert.equal(result.connectedCount, 2);
    assert.deepEqual(result.connectors.map(item => item.id), ["github", "firebase"]);
    assert.equal(result.connectors.every(item => item.connected), true);
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
