import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
    createJarvisUploadBridgeApp,
    JARVIS_UPLOAD_BRIDGE_VERSION,
    runResilientLocalWebResearch
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

test("existing upload bridge keeps resilient local web research without a separate research module", async () => {
    const calls = [];
    const result = await runResilientLocalWebResearch(
        "OpenAI API novedades",
        5000,
        {},
        async url => {
            calls.push(String(url));
            return {
                ok: true,
                status: 200,
                url: String(url),
                async text() {
                    return '<div class="result results_links"><a class="result__a" href="https://example.com/api">Example API</a><a class="result__snippet">Cambio verificado</a></div>';
                }
            };
        }
    );

    assert.equal(result.ok, true);
    assert.equal(result.grounded, true);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].url, "https://example.com/api");
    assert.equal(result.supports[0].sourceIds[0], 1);
    assert.match(calls[0], /duckduckgo/i);
});

test("resilient local research keeps seed identity while cross-source scope stays explicit", async () => {
    const seedUrl =
        "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004";
    const externalUrl =
        "https://directorio.example/taqueria-el-dorado-cancun";
    const calls = [];

    const result = await runResilientLocalWebResearch(
        "Taquería El Dorado Cancún",
        5000,
        {
            exactEntity:
                "Taquería El Dorado",
            seedUrl
        },
        async url => {
            calls.push(String(url));
            return {
                ok: true,
                status: 200,
                url: String(url),
                async text() {
                    return [
                        '<div class="result results_links"><a class="result__a" href="https://www.tiktok.com/@el.dorado509/video/7639882768356248839">Taquería El Dorado (@el.dorado509) | TikTok</a><a class="result__snippet">Taquería El Dorado buffet y hamburguesas.</a></div>',
                        `<div class="result results_links"><a class="result__a" href="${externalUrl}">Taquería El Dorado Cancún</a><a class="result__snippet">Fuente externa atribuible a la cuenta exacta @taqueria.eldorado.</a></div>`
                    ].join("");
                }
            };
        }
    );

    assert.equal(result.ok, true);
    assert.equal(result.grounded, true);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].url, externalUrl);
    assert.doesNotMatch(
        JSON.stringify(result.sources),
        /@el\.dorado509/i
    );

    const crossSourceQuery =
        new URL(calls[0]).searchParams.get("q") || "";
    assert.match(crossSourceQuery, /@taqueria\.eldorado/i);
    assert.doesNotMatch(crossSourceQuery, /site:tiktok\.com/i);

    const scopedCalls = [];
    const scoped = await runResilientLocalWebResearch(
        "Taquería El Dorado Cancún",
        5000,
        {
            exactEntity:
                "Taquería El Dorado",
            seedUrl,
            allowedDomain:
                "tiktok.com"
        },
        async url => {
            scopedCalls.push(String(url));
            return {
                ok: true,
                status: 200,
                url: String(url),
                async text() {
                    return `<div class="result results_links"><a class="result__a" href="${seedUrl}">Taquería El Dorado (@taqueria.eldorado) | TikTok</a><a class="result__snippet">Publicación de la cuenta exacta @taqueria.eldorado.</a></div>`;
                }
            };
        }
    );

    assert.equal(scoped.ok, true);
    assert.equal(scoped.sources.length, 1);
    assert.equal(scoped.sources[0].url, seedUrl);

    const hardScopedQuery =
        new URL(scopedCalls[0]).searchParams.get("q") || "";
    assert.match(hardScopedQuery, /site:tiktok\.com/i);
});

test("existing bridge exposes research route and rejects an empty research request without network access", async () => {
    const root = initializeBridgeRoot();
    const server = createJarvisUploadBridgeApp({ root }).listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        const result = await postJson(base, "/research", { query: "x" });
        assert.equal(result.response.status, 400);
        assert.equal(result.body.ok, false);
        assert.equal(result.body.error, "WEB_RESEARCH_QUERY_REQUIRED");
    }
    finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// V142 postdeploy browser gate verifies the served production bootstrap and localhost loopback transport.
