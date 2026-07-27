import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
    createJarvisUploadBridgeApp,
    JARVIS_UPLOAD_BRIDGE_VERSION
} from "../jarvis-upload-bridge.js";

function initializeBridgeRoot() {
    const root =
        fs.mkdtempSync(
            path.join(
                os.tmpdir(),
                "jarvis-upload-routes-"
            )
        );

    execFileSync(
        "git",
        ["init", "-b", "v5.9-polish"],
        {
            cwd:
                root,
            stdio:
                "ignore"
        }
    );

    fs.writeFileSync(
        path.join(
            root,
            "jarvis-runtime-contract.json"
        ),
        JSON.stringify({
            projectId:
                "fixgo-test",
            branch:
                "v5.9-polish",
            releaseId:
                "test-release"
        }),
        "utf8"
    );

    return root;
}

async function postJson(
    base,
    route,
    body
) {
    const response =
        await fetch(
            `${base}${route}`,
            {
                method:
                    "POST",
                headers: {
                    "content-type":
                        "application/json",
                    "x-jarvis-release-id":
                        "test-release"
                },
                body:
                    JSON.stringify(body)
            }
        );

    return {
        response,
        body:
            await response.json()
    };
}

test("Jarvis upload bridge persists a real PDF through registered chunk routes", async () => {
    const root =
        initializeBridgeRoot();
    const server =
        createJarvisUploadBridgeApp({
            root
        }).listen(0);

    await new Promise(resolve =>
        server.once(
            "listening",
            resolve
        )
    );

    const base =
        `http://127.0.0.1:${server.address().port}`;
    const name =
        "A202607241641376254.pdf";
    const pdfBytes =
        Buffer.from(
            "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
            "utf8"
        );
    const expectedSha256 =
        createHash("sha256")
            .update(pdfBytes)
            .digest("hex");

    try {
        const started =
            await postJson(
                base,
                "/upload/start",
                {
                    batchId:
                        "batch-upload-contract-1",
                    name,
                    mimeType:
                        "application/pdf",
                    expectedBytes:
                        pdfBytes.length,
                    caseId:
                        "case-upload-1",
                    objectiveId:
                        "objective-upload-1"
                }
            );

        assert.equal(
            started.response.status,
            200
        );
        assert.match(
            started.response.headers.get("content-type") || "",
            /^application\/json/i
        );
        assert.equal(
            started.body.ok,
            true
        );
        assert.equal(
            started.body.persisted,
            false
        );
        assert.equal(
            started.body.uploadTransportVersion,
            JARVIS_UPLOAD_BRIDGE_VERSION
        );
        assert.ok(
            started.body.uploadId
        );

        const chunked =
            await postJson(
                base,
                "/upload/chunk",
                {
                    uploadId:
                        started.body.uploadId,
                    offset:
                        0,
                    dataBase64:
                        pdfBytes.toString("base64")
                }
            );

        assert.equal(
            chunked.response.status,
            200
        );
        assert.equal(
            chunked.body.progress,
            100
        );
        assert.equal(
            chunked.body.receivedBytes,
            pdfBytes.length
        );

        const completed =
            await postJson(
                base,
                "/upload/complete",
                {
                    uploadId:
                        started.body.uploadId
                }
            );

        assert.equal(
            completed.response.status,
            200
        );
        assert.match(
            completed.response.headers.get("content-type") || "",
            /^application\/json/i
        );
        assert.equal(
            completed.body.ok,
            true
        );
        assert.equal(
            completed.body.persisted,
            true
        );
        assert.equal(
            completed.body.name,
            name
        );
        assert.equal(
            completed.body.mimeType,
            "application/pdf"
        );
        assert.equal(
            completed.body.detectedMimeType,
            "application/pdf"
        );
        assert.equal(
            completed.body.bytes,
            pdfBytes.length
        );
        assert.equal(
            completed.body.sha256,
            expectedSha256
        );
        assert.equal(
            completed.body.artifactId,
            expectedSha256
        );
        assert.equal(
            completed.body.attachmentId,
            expectedSha256
        );
        assert.ok(
            completed.body.output.startsWith(
                ".jarvis-artifacts/uploads/"
            )
        );
        assert.deepEqual(
            fs.readFileSync(
                path.join(
                    root,
                    completed.body.output
                )
            ),
            pdfBytes
        );

        const missing =
            await postJson(
                base,
                "/upload/not-a-route",
                {}
            );

        assert.equal(
            missing.response.status,
            404
        );
        assert.match(
            missing.response.headers.get("content-type") || "",
            /^application\/json/i
        );
        assert.equal(
            missing.body.status,
            "UPLOAD_ROUTE_NOT_FOUND"
        );
    }
    finally {
        await new Promise(resolve =>
            server.close(resolve)
        );
        fs.rmSync(
            root,
            {
                recursive:
                    true,
                force:
                    true
            }
        );
    }
});
