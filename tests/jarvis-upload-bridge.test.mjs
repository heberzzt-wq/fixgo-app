import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { test } from "node:test";

import {
    createJarvisUploadBridgeApp,
    JARVIS_UPLOAD_BRIDGE_VERSION,
    runResilientLocalWebResearch
} from "../jarvis-upload-bridge.js";

const root = process.cwd();

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

function collectProcessOutput(child) {
    let stdout = "";
    let stderr = "";
    const cap = 2_000_000;
    const append = (current, chunk) =>
        (current + String(chunk || "")).slice(-cap);

    child.stdout?.on("data", chunk => {
        stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", chunk => {
        stderr = append(stderr, chunk);
    });

    return {
        stdout: () => stdout,
        stderr: () => stderr
    };
}

async function waitForBridge(child, output, timeoutMs = 20000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (child.exitCode !== null) {
            throw new Error(
                `V142_CANONICAL_BRIDGE_EXITED:${child.exitCode}\n${output.stdout()}\n${output.stderr()}`
            );
        }
        try {
            const response = await fetch(
                "http://127.0.0.1:3344/health",
                { cache: "no-store" }
            );
            if (response.ok) return;
        }
        catch {}
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(
        `V142_CANONICAL_BRIDGE_NOT_READY\n${output.stdout()}\n${output.stderr()}`
    );
}

async function waitForExit(child) {
    if (child.exitCode !== null) {
        return {
            code: child.exitCode,
            signal: child.signalCode
        };
    }
    return new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) =>
            resolve({ code, signal })
        );
    });
}

test("Jarvis upload bridge persists a real PDF through registered chunk routes", async () => {
    const tempRoot =
        initializeBridgeRoot();
    const server =
        createJarvisUploadBridgeApp({
            root: tempRoot
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
                    tempRoot,
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
            tempRoot,
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

test("existing bridge exposes research route and rejects an empty research request without network access", async () => {
    const tempRoot = initializeBridgeRoot();
    const server = createJarvisUploadBridgeApp({ root: tempRoot }).listen(0);
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
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test("V142 Windows CI executes the canonical Taqueria human reel mission through the official upload bridge", {
    skip:
        process.env.GITHUB_ACTIONS !== "true" ||
        process.platform !== "win32",
    timeout: 900000
}, async () => {
    execFileSync(
        "ffmpeg",
        ["-version"],
        {
            cwd: root,
            stdio: "pipe",
            windowsHide: true
        }
    );

    const bridge = spawn(
        process.execPath,
        [path.join(root, "jarvis-upload-bridge.js")],
        {
            cwd: root,
            env: process.env,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"]
        }
    );
    const bridgeOutput = collectProcessOutput(bridge);

    try {
        await waitForBridge(bridge, bridgeOutput);

        const mission = spawn(
            process.execPath,
            [path.join(root, ".github", "scripts", "v139-canonical-real-reel.mjs")],
            {
                cwd: root,
                env: {
                    ...process.env,
                    V142_CANONICAL_HUMAN_E2E: "true"
                },
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"]
            }
        );
        const missionOutput = collectProcessOutput(mission);
        const exit = await waitForExit(mission);
        const stdout = missionOutput.stdout();
        const stderr = missionOutput.stderr();

        console.log(
            "V142_CANONICAL_HUMAN_REEL_STDOUT",
            stdout.slice(-120000)
        );
        if (stderr.trim()) {
            console.error(
                "V142_CANONICAL_HUMAN_REEL_STDERR",
                stderr.slice(-120000)
            );
        }

        assert.equal(
            exit.code,
            0,
            `Canonical mission exited ${exit.code ?? exit.signal}: ${stderr || stdout}`
        );
        assert.match(
            stdout,
            /V139_CANONICAL_REAL_REEL_E2E_COMPLETE/
        );
        assert.match(
            stdout,
            /"web\.research"/
        );
        assert.match(
            stdout,
            /"marketing\.plan"/
        );
        assert.match(
            stdout,
            /"speech\.synthesize"/
        );
        assert.match(
            stdout,
            /"web\.media\.collect"/
        );
        assert.match(
            stdout,
            /"reel\.create"/
        );
    }
    finally {
        if (bridge.exitCode === null) {
            bridge.kill("SIGTERM");
            await Promise.race([
                waitForExit(bridge),
                new Promise(resolve => setTimeout(resolve, 3000))
            ]);
        }
        if (bridge.exitCode === null) {
            bridge.kill("SIGKILL");
        }
        const bridgeStdout = bridgeOutput.stdout();
        const bridgeStderr = bridgeOutput.stderr();
        console.log(
            "V142_CANONICAL_UPLOAD_BRIDGE_STDOUT",
            bridgeStdout.slice(-60000)
        );
        if (bridgeStderr.trim()) {
            console.error(
                "V142_CANONICAL_UPLOAD_BRIDGE_STDERR",
                bridgeStderr.slice(-60000)
            );
        }
    }
});

// V142 postdeploy browser gate verifies the served production bootstrap and localhost loopback transport.
