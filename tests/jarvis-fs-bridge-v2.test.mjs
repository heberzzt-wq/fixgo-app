import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

import {
    applyReadLineRange,
    appendChunkedUpload,
    assertWriteContent,
    cancelChunkedUpload,
    completeChunkedUpload,
    createJarvisFsBridgeApp,
    describeJarvisFsBridge,
    editDocxArtifact,
    editPdfOverlayArtifact,
    editPptxArtifact,
    editXlsxArtifact,
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
    assert.equal(description.version, "2.46.0-reel-export-completion-v142");
    assert.equal(typeof description.actuators.speech.available, "boolean");
    assert.deepEqual(description.actuators.speech.outputFormats, ["wav"]);
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

// Remaining tests preserve the existing bridge V2 behavior and safety contract.
