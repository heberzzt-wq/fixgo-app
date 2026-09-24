import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
    createJarvisUploadBridgeApp,
    ensureJarvisLocalAiRuntime,
    inspectJarvisWorkstation,
    startJarvisUploadBridge,
    JARVIS_UPLOAD_BRIDGE_VERSION,
    runResilientLocalWebResearch
} from "../jarvis-upload-bridge.js";

// Match the bridge's Windows Git authority; the bundled Git can fail object writes.
const gitExecutable = process.platform === "win32" && fs.existsSync("C:/Program Files/Git/cmd/git.exe")
    ? "C:/Program Files/Git/cmd/git.exe" : "git";

test("VS Code workspace auto-starts one local-only Jarvis workstation", () => {
    const settings = JSON.parse(
        fs.readFileSync(
            new URL("../.vscode/settings.json", import.meta.url),
            "utf8"
        )
    );
    const pkg = JSON.parse(
        fs.readFileSync(
            new URL("../package.json", import.meta.url),
            "utf8"
        )
    );

    assert.equal(
        settings["terminal.integrated.defaultProfile.windows"],
        "Jarvis Workstation"
    );
    assert.deepEqual(
        settings["terminal.integrated.profiles.windows"]["Jarvis Workstation"].args,
        ["-NoExit", "-Command", "npm run bridge:ensure"]
    );
    assert.equal(
        settings["terminal.integrated.env.windows"].JARVIS_SEMANTIC_PROVIDER_MODE,
        "LOCAL_ONLY"
    );
    assert.equal(
        settings["terminal.integrated.env.windows"].JARVIS_LOCAL_LLM_MODEL,
        "qwen2.5-coder:7b"
    );
    assert.equal(
        settings["terminal.integrated.env.windows"].JARVIS_LOCAL_EMBEDDING_MODEL,
        "qwen3-embedding:0.6b"
    );
    assert.equal(
        settings["terminal.integrated.env.windows"].JARVIS_VIDEO_ENGINE_POLICY,
        "LOCAL_ONLY"
    );
    assert.equal(
        settings["terminal.integrated.env.windows"].JARVIS_LOCAL_VIDEO_MODEL,
        "auto"
    );
    assert.equal(
        settings["terminal.integrated.env.windows"].JARVIS_EXTERNAL_FALLBACK_ENABLED,
        "false"
    );
    assert.equal(
        settings["terminal.integrated.env.windows"].JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED,
        "false"
    );

    assert.match(pkg.scripts["bridge:ensure"], /ensureJarvisLocalAiRuntime/);
    assert.match(pkg.scripts["bridge:ensure"], /installIfMissing:true/);
    assert.match(pkg.scripts["bridge:ensure"], /pullModels:true/);
    assert.match(pkg.scripts["bridge:ensure"], /127\.0\.0\.1/);
    assert.match(pkg.scripts["bridge:ensure"], /3344/);
    assert.match(pkg.scripts["bridge:ensure"], /detached:true/);
    assert.match(pkg.scripts["bridge:doctor"], /workstation\/doctor/);
    assert.match(pkg.scripts["bridge:ensure"], /workstation\/health/);
    assert.match(pkg.scripts["bridge:ensure"], /workerStarted/);
    assert.match(pkg.scripts["bridge:ensure"], /2\.0\.0-singleton-exact-sync/);
    assert.match(pkg.scripts["bridge:ensure"], /bridge:supervise/);
    assert.match(pkg.scripts["bridge:supervise"], /workstation offline -> starting contract/);
    assert.match(pkg.scripts["bridge:supervise"], /setTimeout\(loop,ms\)/);
    assert.match(pkg.scripts.bridge, /workerLastPollAt/);
    assert.match(pkg.scripts.bridge, /workerLastPollOkAt/);
    assert.match(pkg.scripts.bridge, /workerLastPollError/);
    assert.match(pkg.scripts.bridge, /JARVIS_GIT_SYNC_DEGRADED/);
    assert.match(pkg.scripts.bridge, /JARVIS_GIT_SYNC_REBASE_STATE_ACTIVE/);
    assert.match(pkg.scripts.bridge, /rebase-merge/);
    assert.match(pkg.scripts.bridge, /rebase-apply/);
    assert.match(pkg.scripts.bridge, /singleton already current/);
    assert.match(pkg.scripts.bridge, /2\.0\.0-singleton-exact-sync/);
    assert.match(pkg.scripts.bridge, /JARVIS_BRIDGE_PORT_3344_OCCUPIED_UNHEALTHY/);
    assert.match(pkg.scripts.bridge, /recycled stale verified Jarvis/);
    assert.match(pkg.scripts["bridge:supervise"], /recycled stale verified Jarvis/);
    assert.match(pkg.scripts["bridge:supervise"], /refusing duplicate bind/);
    assert.match(pkg.scripts["bridge:supervise"], /workstation\/health/);
    assert.match(pkg.scripts["bridge:supervise"], /workerStarted/);
    assert.match(pkg.scripts["bridge:supervise"], /taskkill/);
    assert.match(pkg.scripts["bridge:supervise"], /processId/);
    assert.match(pkg.scripts["bridge:supervise"], /occupied\(\)/);
    assert.match(pkg.scripts["bridge:supervise"], /SUPERVISOR_LOCK_PORT=3345/);
    assert.match(pkg.scripts["bridge:supervise"], /singleton lock already held/);
    assert.match(pkg.scripts["bridge:supervise"], /lockServer=net\.createServer\(\)/);
    assert.equal(pkg.scripts["test:mcp"], "npm --prefix tools/fixgo-mcp run check");
    assert.equal(pkg.scripts["nexo:bridge"], "npm run bridge");
});

test("workstation liveness is lightweight and doctor stays explicit", () => {
    const source = fs.readFileSync(
        new URL("../jarvis-upload-bridge.js", import.meta.url),
        "utf8"
    );
    const healthStart =
        source.indexOf("const workstationHealthHandler");
    const doctorStart =
        source.indexOf("const workstationDoctorHandler");
    assert.ok(healthStart >= 0);
    assert.ok(doctorStart > healthStart);
    const healthBlock =
        source.slice(healthStart, doctorStart);
    assert.match(
        healthBlock,
        /JARVIS_WORKSTATION_LIVE/
    );
    assert.match(
        healthBlock,
        /workstationRuntimeState/
    );
    assert.doesNotMatch(
        healthBlock,
        /inspectJarvisWorkstation/
    );
    assert.match(
        source,
        /app\.get\("\/workstation\/doctor", workstationDoctorHandler\)/
    );
    assert.match(
        source,
        /app\.get\("\/workstation\/health", workstationHealthHandler\)/
    );
});

test("workstation self-heal pulls only missing free local models and never selects external AI", async () => {
    const commands = [];
    let probes = 0;
    const result = await ensureJarvisLocalAiRuntime({
        root: process.cwd(),
        platform: "win32",
        env: {
            JARVIS_LOCAL_LLM_MODEL: "qwen2.5-coder:7b",
            JARVIS_LOCAL_EMBEDDING_MODEL: "qwen3-embedding:0.6b"
        },
        installIfMissing: true,
        pullModels: true,
        commandImpl(command, args) {
            commands.push([command, ...args]);
            if (args[0] === "--version") return { ok: true, stdout: "ollama version test" };
            if (args[0] === "pull") return { ok: true, stdout: "pulled" };
            return { ok: false };
        },
        probeImpl: async () => {
            probes += 1;
            if (probes === 1) {
                return {
                    ok: true,
                    reachable: true,
                    body: { models: [{ name: "qwen2.5-coder:7b" }] }
                };
            }
            return {
                ok: true,
                reachable: true,
                body: {
                    models: [
                        { name: "qwen2.5-coder:7b" },
                        { name: "qwen3-embedding:0.6b" }
                    ]
                }
            };
        },
        spawnImpl() {
            throw new Error("OLLAMA_SERVE_SHOULD_NOT_START");
        },
        waitMs: async () => {}
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "JARVIS_LOCAL_AI_RUNTIME_READY");
    assert.deepEqual(result.pulledModels, ["qwen3-embedding:0.6b"]);
    assert.equal(result.mainModelReady, true);
    assert.equal(result.embeddingModelReady, true);
    assert.equal(result.externalApiUsed, false);
    assert.equal(result.paidApiUsed, false);
    assert.equal(
        commands.some(parts =>
            parts[0] === "winget"
        ),
        false
    );
});

test("workstation self-heal retries transient free local model pulls and preserves zero external spend", async () => {
    let pullCalls = 0;
    let probes = 0;
    let waits = 0;
    const result = await ensureJarvisLocalAiRuntime({
        root: process.cwd(),
        platform: "win32",
        env: {
            JARVIS_LOCAL_LLM_MODEL: "qwen2.5-coder:7b",
            JARVIS_LOCAL_EMBEDDING_MODEL: "qwen3-embedding:0.6b"
        },
        installIfMissing: true,
        pullModels: true,
        commandImpl(_command, args) {
            if (args[0] === "--version") {
                return { ok: true, status: 0, stdout: "ollama version test", stderr: "" };
            }
            if (args[0] === "pull") {
                pullCalls += 1;
                if (pullCalls === 1) {
                    return {
                        ok: false,
                        status: 1,
                        stdout: "",
                        stderr: "transient registry disconnect",
                        error: null
                    };
                }
                return { ok: true, status: 0, stdout: "pulled", stderr: "", error: null };
            }
            return { ok: false, status: 1, stdout: "", stderr: "unexpected", error: null };
        },
        probeImpl: async () => {
            probes += 1;
            if (probes === 1) {
                return { ok: true, reachable: true, body: { models: [] } };
            }
            if (probes === 2) {
                return {
                    ok: true,
                    reachable: true,
                    body: { models: [{ name: "qwen2.5-coder:7b" }] }
                };
            }
            return {
                ok: true,
                reachable: true,
                body: {
                    models: [
                        { name: "qwen2.5-coder:7b" },
                        { name: "qwen3-embedding:0.6b" }
                    ]
                }
            };
        },
        spawnImpl() {
            throw new Error("OLLAMA_SERVE_SHOULD_NOT_START");
        },
        waitMs: async () => { waits += 1; }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "JARVIS_LOCAL_AI_RUNTIME_READY");
    assert.deepEqual(result.pulledModels, ["qwen2.5-coder:7b", "qwen3-embedding:0.6b"]);
    assert.equal(pullCalls, 3);
    assert.equal(waits, 1);
    assert.equal(result.externalApiUsed, false);
    assert.equal(result.paidApiUsed, false);
});

test("workstation self-heal flushes Windows DNS once after an Ollama no-such-host pull failure", async () => {
    let pullCalls = 0;
    let dnsFlushCalls = 0;
    let probes = 0;
    const result = await ensureJarvisLocalAiRuntime({
        root: process.cwd(),
        platform: "win32",
        env: {
            JARVIS_LOCAL_LLM_MODEL: "qwen2.5-coder:7b",
            JARVIS_LOCAL_EMBEDDING_MODEL: "qwen3-embedding:0.6b"
        },
        installIfMissing: true,
        pullModels: true,
        commandImpl(_command, args) {
            if (args[0] === "--version") {
                return { ok: true, status: 0, stdout: "ollama version test", stderr: "" };
            }
            if (args[0] === "/flushdns") {
                dnsFlushCalls += 1;
                return { ok: true, status: 0, stdout: "DNS cache flushed", stderr: "", error: null };
            }
            if (args[0] === "pull") {
                pullCalls += 1;
                if (pullCalls === 1) {
                    return {
                        ok: false,
                        status: 1,
                        stdout: "",
                        stderr: "dial tcp: lookup registry.ollama.ai: no such host",
                        error: null
                    };
                }
                return { ok: true, status: 0, stdout: "pulled", stderr: "", error: null };
            }
            return { ok: false, status: 1, stdout: "", stderr: "unexpected", error: null };
        },
        probeImpl: async () => {
            probes += 1;
            if (probes === 1) {
                return { ok: true, reachable: true, body: { models: [] } };
            }
            if (probes === 2) {
                return {
                    ok: true,
                    reachable: true,
                    body: { models: [{ name: "qwen2.5-coder:7b" }] }
                };
            }
            return {
                ok: true,
                reachable: true,
                body: {
                    models: [
                        { name: "qwen2.5-coder:7b" },
                        { name: "qwen3-embedding:0.6b" }
                    ]
                }
            };
        },
        spawnImpl() {
            throw new Error("OLLAMA_SERVE_SHOULD_NOT_START");
        },
        waitMs: async () => {}
    });

    assert.equal(result.ok, true);
    assert.equal(dnsFlushCalls, 1);
    assert.equal(pullCalls, 3);
    assert.deepEqual(result.pulledModels, ["qwen2.5-coder:7b", "qwen3-embedding:0.6b"]);
    assert.equal(result.externalApiUsed, false);
    assert.equal(result.paidApiUsed, false);
});

test("workstation self-heal falls back to Ollama loopback pull after bounded CLI failures", async () => {
    let cliPullCalls = 0;
    let httpPullCalls = 0;
    let probes = 0;
    const result = await ensureJarvisLocalAiRuntime({
        root: process.cwd(),
        platform: "win32",
        env: {
            JARVIS_LOCAL_LLM_MODEL: "qwen2.5-coder:7b",
            JARVIS_LOCAL_EMBEDDING_MODEL: "qwen3-embedding:0.6b"
        },
        installIfMissing: true,
        pullModels: true,
        commandImpl(_command, args) {
            if (args[0] === "--version") {
                return { ok: true, status: 0, stdout: "ollama version test", stderr: "" };
            }
            if (args[0] === "pull") {
                cliPullCalls += 1;
                if (args[1] === "qwen2.5-coder:7b") {
                    return {
                        ok: false,
                        status: 1,
                        stdout: "",
                        stderr: "cli registry transport failed",
                        error: null
                    };
                }
                return {
                    ok: true,
                    status: 0,
                    stdout: "embedding pulled",
                    stderr: "",
                    error: null
                };
            }
            return { ok: false, status: 1, stdout: "", stderr: "unexpected", error: null };
        },
        probeImpl: async () => {
            probes += 1;
            if (probes === 1) {
                return { ok: true, reachable: true, body: { models: [] } };
            }
            if (probes === 2) {
                return {
                    ok: true,
                    reachable: true,
                    body: { models: [{ name: "qwen2.5-coder:7b" }] }
                };
            }
            return {
                ok: true,
                reachable: true,
                body: {
                    models: [
                        { name: "qwen2.5-coder:7b" },
                        { name: "qwen3-embedding:0.6b" }
                    ]
                }
            };
        },
        pullHttpImpl: async (model) => {
            httpPullCalls += 1;
            assert.equal(model, "qwen2.5-coder:7b");
            return {
                ok: true,
                status: 200,
                body: { status: "success" },
                error: null
            };
        },
        spawnImpl() {
            throw new Error("OLLAMA_SERVE_SHOULD_NOT_START");
        },
        waitMs: async () => {}
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "JARVIS_LOCAL_AI_RUNTIME_READY");
    assert.equal(cliPullCalls, 4);
    assert.equal(httpPullCalls, 1);
    assert.deepEqual(result.pulledModels, ["qwen2.5-coder:7b", "qwen3-embedding:0.6b"]);
    assert.equal(result.externalApiUsed, false);
    assert.equal(result.paidApiUsed, false);
});

test("workstation diagnostics retain command tails so Ollama pull failures expose the final cause", () => {
    const source = fs.readFileSync(
        new URL("../jarvis-upload-bridge.js", import.meta.url),
        "utf8"
    );
    assert.match(source, /stdout:\s*String\(result\.stdout \|\| ""\)\.trim\(\)\.slice\(-4000\)/);
    assert.match(source, /stderr:\s*String\(result\.stderr \|\| ""\)\.trim\(\)\.slice\(-4000\)/);
    assert.match(source, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/);
    assert.match(source, /pullAttempts/);
    assert.match(source, /function workstationStreamingCommand/);
    assert.match(source, /await executePull/);
    assert.match(source, /process\.stdout\.write\(chunk\)/);
    assert.match(source, /process\.stderr\.write\(chunk\)/);
    assert.match(source, /ipconfig/);
    assert.match(source, /\/flushdns/);
});

test("workstation doctor reports governed local capabilities without requiring them to be installed", async () => {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "jarvis-workstation-doctor-")
    );
    try {
        fs.writeFileSync(
            path.join(root, "package.json"),
            JSON.stringify({ scripts: {} }),
            "utf8"
        );
        fs.writeFileSync(
            path.join(root, "firebase.json"),
            JSON.stringify({
                firestore: { rules: "firestore.rules" },
                storage: { rules: "storage.rules" },
                emulators: {
                    firestore: { host: "127.0.0.1", port: 65520 },
                    storage: { host: "127.0.0.1", port: 65521 }
                }
            }),
            "utf8"
        );

        const result = await inspectJarvisWorkstation({ root });
        assert.equal(result.ok, true);
        assert.equal(result.status, "JARVIS_WORKSTATION_INSPECTED");
        assert.equal(result.runtime.node.ok, true);
        assert.equal(result.localAi.provider, "ollama-openai-compatible-local");
        assert.equal(result.localAi.expectedModel, "qwen2.5-coder:7b");
        assert.equal(result.localAi.expectedEmbeddingModel, "qwen3-embedding:0.6b");
        assert.equal(result.localAi.externalFallback, false);
        assert.equal(result.localVideo.runpodPaidFallbackAuthorized, false);
        assert.equal(result.firebase.mutationPolicy, "DEPLOY_ONLY_THROUGH_GOVERNED_RELEASE_GATE");
        assert.ok(result.governedCapabilities.includes("git.push.authorized"));
        assert.ok(result.governedCapabilities.includes("firebase.firestore.emulator"));
        assert.ok(result.governedCapabilities.includes("ollama.local.embedding"));
        assert.ok(result.governedCapabilities.includes("video.generate.local"));
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("upload bridge startup binds only IPv4 loopback", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-upload-bind-"));
    const server = startJarvisUploadBridge({ port: 0, root });
    try {
        await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
        assert.equal(server.address().address, "127.0.0.1");
        const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
        assert.equal(response.status, 200);
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});

function initializeBridgeRoot() {
    const root =
        fs.mkdtempSync(
            path.join(
                os.tmpdir(),
                "jarvis-upload-routes-"
            )
        );

    execFileSync(
        gitExecutable,
        ["init", "-b", "v5.9-polish"],
        {
            cwd:
                root,
            stdio:
                "ignore"
        }
    );
    execFileSync(
        gitExecutable,
        ["config", "user.email", "jarvis-upload@example.invalid"],
        { cwd: root, stdio: "ignore" }
    );
    execFileSync(
        gitExecutable,
        ["config", "user.name", "Jarvis Upload Test"],
        { cwd: root, stdio: "ignore" }
    );
    const remoteRoot =
        path.join(root, ".git", "test-remote.git");
    execFileSync(
        gitExecutable,
        ["init", "--bare", remoteRoot],
        { stdio: "ignore" }
    );
    const canonicalRemote =
        "https://github.com/test-owner/fixgo-test.git";
    execFileSync(
        gitExecutable,
        ["remote", "add", "origin", canonicalRemote],
        { cwd: root, stdio: "ignore" }
    );
    execFileSync(
        gitExecutable,
        [
            "config",
            `url.${pathToFileURL(remoteRoot).href}.insteadOf`,
            canonicalRemote
        ],
        { cwd: root, stdio: "ignore" }
    );

    // Retain canonical fetch identity, but never permit fixture pushes over a network.
    const localRemoteUrl = pathToFileURL(remoteRoot).href;
    execFileSync(gitExecutable, ["remote", "set-url", "--push", "origin", localRemoteUrl], {
        cwd: root, stdio: "pipe"
    });
    assert.equal(execFileSync(gitExecutable, ["remote", "get-url", "--push", "origin"], {
        cwd: root, encoding: "utf8"
    }).trim(), localRemoteUrl);

    fs.writeFileSync(
        path.join(
            root,
            "jarvis-runtime-contract.json"
        ),
        JSON.stringify({
            projectId:
                "fixgo-test",
            repository:
                "test-owner/fixgo-test",
            branch:
                "v5.9-polish",
            releaseId:
                "test-release"
        }),
        "utf8"
    );
    execFileSync(
        gitExecutable,
        ["add", "jarvis-runtime-contract.json"],
        { cwd: root, stdio: "ignore" }
    );
    execFileSync(
        gitExecutable,
        ["commit", "-m", "initialize bridge identity"],
        { cwd: root, stdio: "ignore" }
    );
    execFileSync(
        gitExecutable,
        ["-c", "protocol.allow=never", "-c", "protocol.file.allow=always", "push", "-u", "origin", "v5.9-polish"],
        { cwd: root, stdio: "pipe" }
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

    const crossSourceSearchUrl =
        calls.find(value =>
            /duckduckgo\.com/i.test(value) &&
            /[?&]q=/i.test(value)
        ) || "";
    const crossSourceQuery =
        new URL(crossSourceSearchUrl)
            .searchParams
            .get("q") || "";
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

    const hardScopedSearchUrl =
        scopedCalls.find(value =>
            /duckduckgo\.com/i.test(value) &&
            /[?&]q=/i.test(value)
        ) || "";
    const hardScopedQuery =
        new URL(hardScopedSearchUrl)
            .searchParams
            .get("q") || "";
    assert.match(hardScopedQuery, /site:tiktok\.com/i);
});

test("tiktok oEmbed verifies the exact seed author before generic search", async () => {
    const seedUrl =
        "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004";
    const calls = [];

    const result =
        await runResilientLocalWebResearch(
            "Taquer?a El Dorado Canc?n",
            5000,
            {
                exactEntity:
                    "Taquer?a El Dorado",
                seedUrl
            },
            async url => {
                calls.push(
                    String(url)
                );

                if (
                    String(url)
                        .startsWith(
                            "https://www.tiktok.com/oembed?"
                        )
                ) {
                    return {
                        ok:
                            true,
                        status:
                            200,
                        url:
                            String(url),
                        async json() {
                            return {
                                title:
                                    "Publicaci?n exacta",
                                author_name:
                                    "Taquer?a El Dorado",
                                author_url:
                                    "https://www.tiktok.com/@taqueria.eldorado"
                            };
                        }
                    };
                }

                throw new Error(
                    "GENERIC_SEARCH_MUST_NOT_RUN"
                );
            }
        );

    assert.equal(
        result.ok,
        true
    );
    assert.equal(
        result.engine,
        "jarvis_local_tiktok_oembed_anchor"
    );
    assert.equal(
        result.sources.length,
        1
    );
    assert.equal(
        result.sources[0].url,
        seedUrl
    );
    assert.equal(
        calls.length,
        1
    );
});

test("tiktok oEmbed 429 falls through to canonical seed metadata", async () => {
    const seedUrl =
        "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004";
    const calls = [];

    const result =
        await runResilientLocalWebResearch(
            "Taquer?a El Dorado Canc?n",
            5000,
            {
                exactEntity:
                    "Taquer?a El Dorado",
                seedUrl
            },
            async url => {
                calls.push(
                    String(url)
                );

                if (
                    String(url)
                        .startsWith(
                            "https://www.tiktok.com/oembed?"
                        )
                ) {
                    return {
                        ok:
                            false,
                        status:
                            429,
                        url:
                            String(url)
                    };
                }

                if (
                    String(url) ===
                    seedUrl
                ) {
                    return {
                        ok:
                            true,
                        status:
                            200,
                        url:
                            seedUrl,
                        async text() {
                            return [
                                "<html><head>",
                                '<title>Taquer?a El Dorado</title>',
                                '<link rel="canonical" href="' +
                                    seedUrl +
                                    '">',
                                '<meta property="og:description" content="Publicaci?n de @taqueria.eldorado">',
                                "</head><body></body></html>"
                            ].join("");
                        }
                    };
                }

                throw new Error(
                    "GENERIC_SEARCH_MUST_NOT_RUN"
                );
            }
        );

    assert.equal(
        result.ok,
        true
    );
    assert.equal(
        result.engine,
        "jarvis_local_seed_metadata_anchor"
    );
    assert.equal(
        result.sources.length,
        1
    );
    assert.equal(
        result.sources[0].url,
        seedUrl
    );
    assert.equal(
        result.attempts[0].provider,
        "jarvis_local_tiktok_oembed_anchor"
    );
    assert.match(
        result.attempts[0].error ||
            "",
        /HTTP_429/
    );
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
