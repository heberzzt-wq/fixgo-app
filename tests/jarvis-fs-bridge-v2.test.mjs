import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

import {
    applyReadLineRange,
    appendChunkedUpload,
    assertWriteContent,
    cancelChunkedUpload,
    completeChunkedUpload,
    createJarvisFsBridgeApp,
    startJarvisFsBridge,
    createHuMoLanCacheInspector,
    createHuMoLanEphemeralStager,
    createSelfHostedSemanticEngine,
    describeJarvisBridgeIdentity,
    describeJarvisFsBridge,
    editDocxArtifact,
    editPdfOverlayArtifact,
    editPptxArtifact,
    editXlsxArtifact,
    extractTemporalMediaArtifact,
    inspectLocalConnectors,
    normalizeReadLineRange,
    readJarvisRuntimeContract,
    resolveHuMoLanCacheAuthority,
    resolveRepoPath,
    runHuMoLanCachePreflightCli,
    runLocalWebResearch,
    saveGeneratedImageArtifact,
    saveUploadedArtifact,
    startChunkedUpload,
    readArtifactPayload
} from "../jarvis-fs-bridge.js";
import {
    buildJarvisMultifunctionToolCalls
} from "../gestia-core/jarvis/jarvis.multifunction.planner.js";

// Match the bridge's Windows Git authority; the bundled Git can fail object writes.
const gitExecutable = process.platform === "win32" && fs.existsSync("C:/Program Files/Git/cmd/git.exe")
    ? "C:/Program Files/Git/cmd/git.exe" : "git";

function createBridgeIdentityFixture({
    repository = "test-owner/fixgo-test",
    branch = "v94-media-v4n-negative-claims"
} = {}) {
    const fixtureRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "jarvis-bridge-identity-")
    );
    const root = path.join(fixtureRoot, "worktree");
    const remoteRoot = path.join(fixtureRoot, "remote.git");
    fs.mkdirSync(root);
    execFileSync(gitExecutable, ["init", "--bare", remoteRoot], {
        stdio: "ignore"
    });
    execFileSync(gitExecutable, ["init", "-b", branch], {
        cwd: root,
        stdio: "ignore"
    });
    const runGit = args => execFileSync(gitExecutable, ["-c", "protocol.allow=never", "-c", "protocol.file.allow=always", ...args], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    runGit(["config", "user.email", "jarvis-identity@example.invalid"]);
    runGit(["config", "user.name", "Jarvis Identity Test"]);
    const canonicalRemote = `https://github.com/${repository}.git`;
    runGit(["remote", "add", "origin", canonicalRemote]);
    runGit(["remote", "set-url", "--push", "origin", pathToFileURL(remoteRoot).href]);
    runGit([
        "config",
        `url.${pathToFileURL(remoteRoot).href}.insteadOf`,
        canonicalRemote
    ]);
    fs.writeFileSync(
        path.join(root, "jarvis-runtime-contract.json"),
        JSON.stringify({
            projectId: repository.split("/").at(-1),
            repository,
            branch,
            releaseId: "test-release"
        })
    );
    fs.writeFileSync(
        path.join(root, "identity-marker.txt"),
        "initial identity\n"
    );
    runGit(["add", "."]);
    runGit(["commit", "-m", "initial identity"]);
    runGit(["push", "-u", "origin", branch]);
    return {
        branch,
        fixtureRoot,
        remoteRoot,
        repository,
        root,
        runGit
    };
}

function commandAvailable(command) {
    try {
        execFileSync(command, ["-version"], { stdio: "ignore", windowsHide: true });
        return true;
    }
    catch {
        return false;
    }
}

const temporalMediaToolsAvailable = commandAvailable("ffmpeg") && commandAvailable("ffprobe");

test("canonical artifact extraction prepares physical video frames and audio with zero external calls", {
    skip: temporalMediaToolsAvailable ? false : "FFmpeg and ffprobe are not installed"
}, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-temporal-media-"));
    const output = ".jarvis-artifacts/uploads/input.mp4";
    const target = path.join(root, output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    execFileSync("ffmpeg", [
        "-hide_banner", "-nostdin", "-y",
        "-f", "lavfi", "-i", "testsrc=size=360x640:rate=24:duration=1.5",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1.5",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-shortest", "-movflags", "+faststart",
        target
    ], { stdio: "ignore", windowsHide: true, timeout: 60000 });

    const extracted = await extractTemporalMediaArtifact({
        output,
        sourceName: "input.mp4",
        mimeType: "video/mp4",
        root
    });

    assert.equal(extracted.ok, true);
    assert.equal(extracted.status, "TEMPORAL_MEDIA_PHYSICAL_EVIDENCE_READY");
    assert.equal(extracted.mediaType, "video");
    assert.equal(extracted.externalApiUsed, false);
    assert.equal(extracted.externalEstimatedCostUsd, 0);
    assert.match(extracted.sha256, /^[a-f0-9]{64}$/);
    assert.ok(extracted.temporal.durationSeconds > 0);
    assert.ok(extracted.temporal.samples.length >= 2);
    assert.ok(extracted.temporal.samples.every(sample =>
        fs.existsSync(path.join(root, sample.output)) && /^[a-f0-9]{64}$/.test(sample.sha256)
    ));
    assert.ok(fs.existsSync(path.join(root, extracted.temporal.audioEvidence.output)));
    assert.equal(extracted.temporal.semanticVisualAnalysisVerified, false);
    assert.equal(extracted.temporal.transcriptionVerified, false);
});

test("Jarvis FS bridge V2 describes safe full repo policy", () => {
    const description =
        describeJarvisFsBridge();

    assert.equal(description.ok, true);
    assert.equal(description.version, "2.51.0-temporal-media-self-hosted-v142");
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

test("V142 HuMo LAN cache authority resolves a typed SSH storage contract", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-humo-lan-authority-"));
    try {
        const keyFile = path.join(root, "lan_ed25519");
        const knownHostsFile = path.join(root, "known_hosts");
        fs.writeFileSync(keyFile, "fixture-key");
        fs.writeFileSync(knownHostsFile, "fixture-known-host");
        const authority = resolveHuMoLanCacheAuthority({
            env: {
                JARVIS_HUMO_LAN_SOURCE_HOST: "192.0.2.44",
                JARVIS_HUMO_LAN_SOURCE_USER: "sak",
                JARVIS_HUMO_LAN_SOURCE_KEY: keyFile,
                JARVIS_HUMO_LAN_SOURCE_KNOWN_HOSTS: knownHostsFile,
                JARVIS_HUMO_LAN_CACHE_ROOT: "F:\\Nueva carpeta\\models\\humo-1.7b",
                JARVIS_HUMO_LAN_CLOSEOUT: "F:\\Nueva carpeta\\humo-local-cache-v142-closeout.json"
            }
        });
        assert.equal(authority.configured, true);
        assert.equal(authority.status, "HUMO_LAN_CACHE_AUTHORITY_READY");
        assert.equal(authority.host, "192.0.2.44");
        assert.equal(authority.user, "sak");
        assert.equal(authority.cacheRoot, "F:\\Nueva carpeta\\models\\humo-1.7b");
        assert.equal(resolveHuMoLanCacheAuthority({ env: {} }).configured, false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("V142 HuMo LAN cache inspector consumes certified closeout evidence with zero provider traffic", async () => {
    const revision = "845f44736e21be93aa5d8cf406b6eb01af9bff67";
    const authority = {
        configured: true,
        host: "192.0.2.44",
        user: "sak",
        keyFile: path.resolve("fixture-lan-key"),
        knownHostsFile: path.resolve("fixture-known-hosts"),
        cacheRoot: "F:\\Nueva carpeta\\models\\humo-1.7b",
        closeoutFile: "F:\\Nueva carpeta\\humo-local-cache-v142-closeout.json"
    };
    const contract = {
        requiredFiles: [{ path: "weights/HuMo/fixture.bin", bytes: 7, sha256: "a".repeat(64) }],
        totalBytes: 7,
        sourceRevision: revision
    };
    let observed = null;
    const inspector = createHuMoLanCacheInspector({
        authority,
        execFileSyncImpl: (executable, args, options) => {
            observed = { executable, args, options };
            return JSON.stringify({
                ok: true,
                status: "LOCAL_HUMO_CACHE_READY",
                cacheStatus: "CACHE_MODEL_READY",
                cacheRoot: authority.cacheRoot,
                assetsVerified: 1,
                assetsExpected: 1,
                shaVerified: true,
                totalBytes: 7,
                sourceRevision: revision,
                sourceRevisionVerified: true,
                sourceTrackedClean: true,
                inferenceStarted: false,
                externalApiUsed: false,
                externalEstimatedCostUsd: 0
            }) + "\n";
        }
    });
    const result = await inspector({ contract, requireSourceRevision: true });
    assert.equal(result.ok, true);
    assert.equal(result.shaVerified, true);
    assert.equal(result.sourceRevisionVerified, true);
    assert.equal(result.totalBytes, 7);
    assert.ok(observed.args.includes("BatchMode=yes"));
    assert.equal(observed.args.at(-1), "powershell.exe -NoProfile -NonInteractive -Command -");
    assert.equal(typeof observed.options.input, "string");
    assert.match(observed.options.input, /LAN_CACHE_CLOSEOUT_ASSET_COUNT_MISMATCH/);
    assert.match(observed.options.input, /expectedPath/);
    assert.equal(observed.options.input.includes(".Replace([char]92,'/')"), true);
    assert.equal(observed.options.windowsHide, true);
});

test("V142 HuMo LAN ephemeral stager fails closed before transport on source or destination identity drift", async () => {
    let spawnCalls = 0;
    const authority = {
        configured: true,
        cacheRoot: "F:\\Nueva carpeta\\models\\humo-1.7b",
        host: "192.0.2.44",
        user: "sak",
        keyFile: "fixture-key",
        knownHostsFile: "fixture-known-hosts"
    };
    const stager = createHuMoLanEphemeralStager({
        authority,
        spawnImpl: () => { spawnCalls += 1; throw new Error("TRANSPORT_MUST_NOT_START"); }
    });
    await assert.rejects(stager({
        state: {},
        transferPlan: {
            ok: true,
            cacheMode: "LOCAL_TO_EPHEMERAL",
            sourceCacheRoot: "F:\\wrong",
            destinationCacheRoot: "/workspace/jarvis-v142/cache/humo-1.7b",
            assetCount: 0,
            files: []
        }
    }), /HUMO_LAN_CACHE_ROOT_IDENTITY_MISMATCH/);
    await assert.rejects(stager({
        state: {},
        transferPlan: {
            ok: true,
            cacheMode: "LOCAL_TO_EPHEMERAL",
            sourceCacheRoot: authority.cacheRoot,
            destinationCacheRoot: "/tmp/not-authorized",
            assetCount: 0,
            files: []
        }
    }), /HUMO_EPHEMERAL_DESTINATION_INVALID/);
    assert.equal(spawnCalls, 0);
});

test("V142 HuMo LAN zero-cost preflight certifies cache and tar without provider creation", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-humo-lan-preflight-"));
    try {
        const keyFile = path.join(root, "lan_ed25519");
        const knownHostsFile = path.join(root, "known_hosts");
        fs.writeFileSync(keyFile, "fixture-key");
        fs.writeFileSync(knownHostsFile, "fixture-host");
        const revision = "845f44736e21be93aa5d8cf406b6eb01af9bff67";
        const logs = [];
        const result = await runHuMoLanCachePreflightCli({
            env: {
                JARVIS_HUMO_LAN_SOURCE_HOST: "192.0.2.44",
                JARVIS_HUMO_LAN_SOURCE_USER: "sak",
                JARVIS_HUMO_LAN_SOURCE_KEY: keyFile,
                JARVIS_HUMO_LAN_SOURCE_KNOWN_HOSTS: knownHostsFile,
                JARVIS_HUMO_LAN_CACHE_ROOT: "F:\\Nueva carpeta\\models\\humo-1.7b",
                JARVIS_HUMO_LAN_CLOSEOUT: "F:\\Nueva carpeta\\humo-local-cache-v142-closeout.json"
            },
            inspectImpl: async () => ({
                ok: true,
                status: "LOCAL_HUMO_CACHE_READY",
                cacheStatus: "CACHE_MODEL_READY",
                storageAuthority: "F:\\Nueva carpeta",
                assetsVerified: 12,
                shaVerified: true,
                totalBytes: 22095109502,
                sourceRevision: revision,
                sourceRevisionVerified: true,
                sourceTrackedClean: true,
                inferenceStarted: false,
                externalApiUsed: false,
                externalEstimatedCostUsd: 0
            }),
            runRemotePowerShellImpl: () => JSON.stringify({
                ok: true,
                volumeHealth: "Healthy",
                freeBytes: 2_000_000_000_000,
                tarAvailable: true,
                tarPath: "C:\\Windows\\System32\\tar.exe",
                tarVersion: "bsdtar fixture"
            }),
            log: value => logs.push(value)
        });
        assert.equal(result.ok, true);
        assert.equal(result.status, "HUMO_LAN_CACHE_ZERO_COST_PREFLIGHT_READY");
        assert.equal(result.cacheMode, "LOCAL_TO_EPHEMERAL");
        assert.equal(result.assetsVerified, 12);
        assert.equal(result.totalBytes, 22095109502);
        assert.equal(result.sourceTarAvailable, true);
        assert.equal(result.networkVolumeRequired, false);
        assert.equal(result.recurringStorageCostUsd, 0);
        assert.equal(result.resourceCreationPossible, false);
        assert.equal(result.providerTrafficUsed, false);
        assert.equal(result.inferenceStarted, false);
        assert.equal(logs.length, 1);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("emulator exercises Jarvis local-only planner through the real bridge and real repo evidence", async t => {
    const fixture = createBridgeIdentityFixture();
    const markerFile = "local-ai-emulator-target.js";
    fs.writeFileSync(
        path.join(fixture.root, markerFile),
        'export const LOCAL_AI_EMULATOR_MARKER = "JARVIS_QWEN_LOCAL_ONLY";\n',
        "utf8"
    );
    fixture.runGit(["add", markerFile]);
    fixture.runGit(["commit", "-m", "fixture: local ai emulator target"]);
    fixture.runGit(["push", "origin", fixture.branch]);

    const semanticRequests = [];
    const semanticEngine = createSelfHostedSemanticEngine({
        env: {
            JARVIS_SEMANTIC_PROVIDER_MODE: "LOCAL_ONLY",
            JARVIS_LOCAL_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
            JARVIS_LOCAL_LLM_MODEL: "qwen2.5-coder:7b",
            JARVIS_LOCAL_EMBEDDING_MODEL: "qwen3-embedding:0.6b"
        },
        fetchImpl: async (url, options) => {
            const body = JSON.parse(options.body);
            semanticRequests.push({ url, body });
            assert.equal(url, "http://127.0.0.1:11434/v1/chat/completions");
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    choices: [{
                        message: {
                            content: "",
                            tool_calls: [{
                                function: {
                                    name: "jarvis_tool_0",
                                    arguments: JSON.stringify({
                                        query: "LOCAL_AI_EMULATOR_MARKER"
                                    })
                                }
                            }]
                        }
                    }]
                })
            };
        }
    });

    const server = createJarvisFsBridgeApp({
        root: fixture.root,
        localSemanticEngine: semanticEngine
    }).listen(0);
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    });

    const base = `http://127.0.0.1:${server.address().port}`;
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    const loopbackFetch = globalThis.fetch.bind(globalThis);
    let externalCalls = 0;
    try {
        globalThis.fetch = async (...args) => {
            externalCalls += 1;
            throw new Error(`UNEXPECTED_EXTERNAL_FETCH:${args[0]}`);
        };
        globalThis.JarvisLocalBridge = {
            async requestJson(route, payload = {}) {
                const response = await loopbackFetch(`${base}${route}`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-jarvis-release-id": "test-release"
                    },
                    body: JSON.stringify(payload)
                });
                return await response.json();
            }
        };

        const calls = await buildJarvisMultifunctionToolCalls(
            "Encuentra LOCAL_AI_EMULATOR_MARKER en el repositorio",
            {
                throwOnUnavailable: true,
                toolCatalog: [{
                    name: "repo.search",
                    description: "Busca evidencia real dentro del repositorio",
                    inputSchema: {
                        type: "object",
                        properties: { query: { type: "string" } },
                        required: ["query"],
                        additionalProperties: false
                    },
                    mutates: false
                }]
            }
        );

        assert.equal(calls.length, 1);
        assert.equal(calls[0].name, "repo.search");
        assert.equal(calls[0].args.query, "LOCAL_AI_EMULATOR_MARKER");
        assert.equal(semanticRequests.length, 1);
        assert.equal(semanticRequests[0].body.model, "qwen2.5-coder:7b");

        const grepResponse = await globalThis.JarvisLocalBridge.requestJson("/grep", {
            query: calls[0].args.query,
            term: calls[0].args.query,
            maxMatches: 20
        });
        assert.equal(grepResponse.ok, true);
        assert.ok(
            (grepResponse.matches || []).some(match =>
                String(match.file || "").endsWith(markerFile)
            ),
            "real bridge evidence must contain the emulated marker file"
        );

        const healthResponse = await globalThis.JarvisLocalBridge.requestJson("/semantic/local/health", {});
        assert.equal(healthResponse.ok, true);
        assert.equal(healthResponse.mode, "LOCAL_ONLY");
        assert.equal(healthResponse.provider, "ollama-openai-compatible-local");
        assert.equal(healthResponse.model, "qwen2.5-coder:7b");
        assert.equal(healthResponse.counters.localSemanticInferenceCalls, 1);
        assert.equal(healthResponse.counters.semanticExternalCalls, 0);
        assert.equal(healthResponse.counters.paidExternalCalls, 0);
        assert.equal(externalCalls, 0);
    } finally {
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
    }
});

test("self-hosted semantic backend defaults to local-only Ollama Qwen with zero cloud fallback", () => {
    const engine = createSelfHostedSemanticEngine({
        env: {},
        fetchImpl: async () => {
            throw new Error("NO_INFERENCE_EXPECTED_IN_DESCRIBE");
        }
    });
    const health = engine.describe();
    assert.equal(health.ok, true);
    assert.equal(health.mode, "LOCAL_ONLY");
    assert.equal(health.provider, "ollama-openai-compatible-local");
    assert.equal(health.model, "qwen2.5-coder:7b");
    assert.equal(health.embeddingModel, "qwen3-embedding:0.6b");
    assert.equal(health.endpointOrigin, "http://127.0.0.1:11434");
    assert.equal(health.fallbackAllowed, false);
    assert.equal(health.externalApiUsed, false);
    assert.equal(health.paidModelApiUsed, false);
});

test("self-hosted semantic engine uses local Ollama embeddings with zero external fallback", async () => {
    const requests = [];
    const engine = createSelfHostedSemanticEngine({
        env: {
            JARVIS_SEMANTIC_PROVIDER_MODE: "LOCAL_ONLY",
            JARVIS_LOCAL_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
            JARVIS_LOCAL_LLM_MODEL: "qwen-local",
            JARVIS_LOCAL_EMBEDDING_MODEL: "qwen3-embedding:0.6b"
        },
        fetchImpl: async (url, options) => {
            requests.push({ url, body: JSON.parse(options.body) });
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    embeddings: [
                        [1, 0, 0],
                        [0, 1, 0]
                    ]
                })
            };
        }
    });

    const result = await engine.embed([
        "autenticacion de tecnicos",
        "pagos y retiros"
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.provider, "ollama-local");
    assert.equal(result.model, "qwen3-embedding:0.6b");
    assert.deepEqual(result.embeddings[0], [1, 0, 0]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://127.0.0.1:11434/api/embed");
    assert.equal(requests[0].body.model, "qwen3-embedding:0.6b");
    assert.deepEqual(requests[0].body.input, [
        "autenticacion de tecnicos",
        "pagos y retiros"
    ]);
    const health = engine.describe();
    assert.equal(health.counters.localEmbeddingCalls, 1);
    assert.equal(health.counters.localEmbeddedTexts, 2);
    assert.equal(health.counters.semanticExternalCalls, 0);
    assert.equal(health.counters.paidExternalCalls, 0);
});

test("self-hosted semantic backend feeds the canonical planner without paid API calls", async () => {
    const requests = [];
    const engine = createSelfHostedSemanticEngine({
        env: {
            JARVIS_SEMANTIC_PROVIDER_MODE: "LOCAL_ONLY",
            JARVIS_LOCAL_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
            JARVIS_LOCAL_LLM_MODEL: "qwen-local",
            JARVIS_LOCAL_LLM_TOKEN: "test-token"
        },
        fetchImpl: async (url, options) => {
            requests.push({ url, options, body: JSON.parse(options.body) });
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    choices: [{
                        message: {
                            content: "",
                            tool_calls: [{
                                function: {
                                    name: "jarvis_tool_0",
                                    arguments: JSON.stringify({ query: "estado del repositorio" })
                                }
                            }]
                        }
                    }]
                })
            };
        }
    });

    const plan = await engine.plan({
        input: "Revisa el estado del repositorio",
        catalog: [{
            name: "repo.search",
            description: "Busca evidencia dentro del repositorio",
            inputSchema: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
                additionalProperties: false
            },
            mutates: false
        }]
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.provider, "ollama-openai-compatible-local");
    assert.equal(plan.model, "qwen-local");
    assert.equal(plan.toolCalls[0].name, "repo.search");
    assert.equal(plan.toolCalls[0].args.query, "estado del repositorio");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://127.0.0.1:11434/v1/chat/completions");
    assert.equal(requests[0].options.headers.Authorization, "Bearer test-token");
    assert.equal(requests[0].body.tools[0].function.name, "jarvis_tool_0");
    assert.equal(plan.inferenceReceipt.counters.localSemanticInferenceCalls, 1);
    assert.equal(plan.inferenceReceipt.counters.semanticExternalCalls, 0);
    assert.equal(plan.inferenceReceipt.counters.paidExternalCalls, 0);
    assert.equal(plan.inferenceReceipt.fallbackAllowed, false);
});

test("self-hosted semantic response uses one local inference and reports zero external spend", async () => {
    const engine = createSelfHostedSemanticEngine({
        env: {
            JARVIS_SEMANTIC_PROVIDER_MODE: "LOCAL_ONLY",
            JARVIS_LOCAL_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
            JARVIS_LOCAL_LLM_MODEL: "local-reasoner"
        },
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                choices: [{ message: { content: "Respuesta local verificable." } }]
            })
        })
    });

    const result = await engine.respond({ input: "Explica la evidencia." });
    assert.equal(result.message, "Respuesta local verificable.");
    assert.equal(result.inferenceReceipt.counters.localSemanticInferenceCalls, 1);
    assert.equal(result.inferenceReceipt.counters.semanticExternalCalls, 0);
    assert.equal(result.inferenceReceipt.counters.paidExternalCalls, 0);
    assert.equal(result.externalApiUsed, false);
});

test("emulador local recorre Jarvis completo: plan LLM -> repo real -> respuesta LLM sin nube", async () => {
    const fixture = createBridgeIdentityFixture();
    const root = fixture.root;
    fs.writeFileSync(
        path.join(root, "local-ai-target.js"),
        [
            'export const LOCAL_AI_MARKER = "JARVIS_LOCAL_LLM_BASE_URL";',
            'export const authority = "jarvisSemanticPlan";'
        ].join("\n") + "\n",
        "utf8"
    );
    fixture.runGit(["add", "local-ai-target.js"]);
    fixture.runGit(["commit", "-m", "fixture: add local ai target"]);
    fixture.runGit(["push", "origin", fixture.branch]);

    const llmRequests = [];
    const engine = createSelfHostedSemanticEngine({
        env: {
            JARVIS_SEMANTIC_PROVIDER_MODE: "LOCAL_ONLY",
            JARVIS_LOCAL_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
            JARVIS_LOCAL_LLM_MODEL: "qwen-emulator"
        },
        fetchImpl: async (url, options) => {
            const body = JSON.parse(options.body);
            if (String(url).endsWith("/api/embed")) {
                const inputs = Array.isArray(body.input) ? body.input : [body.input];
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        embeddings: inputs.map(value =>
                            String(value || "").includes("JARVIS_LOCAL_LLM_BASE_URL")
                                ? [1, 0, 0]
                                : [0, 1, 0]
                        )
                    })
                };
            }
            llmRequests.push(body);
            const isPlanning = Array.isArray(body.tools) && body.tools.length > 0;
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    choices: [{
                        message: isPlanning
                            ? {
                                content: "",
                                tool_calls: [{
                                    function: {
                                        name: "jarvis_tool_0",
                                        arguments: JSON.stringify({
                                            query: "JARVIS_LOCAL_LLM_BASE_URL"
                                        })
                                    }
                                }]
                            }
                            : {
                                content: "La evidencia local confirma que Jarvis usa la autoridad semántica local configurada."
                            }
                    }]
                })
            };
        }
    });

    const server = createJarvisFsBridgeApp({
        root,
        localSemanticEngine: engine
    }).listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async (route, body) => {
        const response = await fetch(base + route, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "test-release"
            },
            body: JSON.stringify(body)
        });
        return {
            status: response.status,
            body: await response.json()
        };
    };

    try {
        const plan = await post("/semantic/plan", {
            input: "Busca dónde se configura la IA local de Jarvis.",
            catalog: [{
                name: "repo.search",
                description: "Busca evidencia en el repositorio real.",
                inputSchema: {
                    type: "object",
                    required: ["query"],
                    properties: {
                        query: { type: "string" }
                    },
                    additionalProperties: false
                },
                mutates: false,
                requiresApproval: false
            }]
        });

        assert.equal(plan.status, 200, JSON.stringify(plan.body));
        assert.equal(plan.body.ok, true);
        assert.equal(plan.body.provider, "ollama-openai-compatible-local");
        assert.equal(plan.body.model, "qwen-emulator");
        assert.equal(plan.body.localSemanticInferenceUsed, true);
        assert.equal(plan.body.cloudSemanticInferenceUsed, false);
        assert.equal(plan.body.fallbackAllowed, false);
        assert.equal(plan.body.toolCalls.length, 1);
        assert.equal(plan.body.toolCalls[0].name, "repo.search");
        assert.equal(
            plan.body.toolCalls[0].args.query,
            "JARVIS_LOCAL_LLM_BASE_URL"
        );

        const semanticRanking = await post("/repo/candidates", {
            query: plan.body.toolCalls[0].args.query,
            limit: 5,
            refresh: true
        });
        assert.equal(semanticRanking.status, 200, JSON.stringify(semanticRanking.body));
        assert.equal(semanticRanking.body.ok, true);
        assert.equal(semanticRanking.body.semanticRetrieval, true);
        assert.equal(semanticRanking.body.semanticEvidence.provider, "ollama-local");
        assert.equal(semanticRanking.body.semanticEvidence.model, "qwen3-embedding:0.6b");
        assert.equal(semanticRanking.body.semanticEvidence.externalApiUsed, false);
        assert.equal(semanticRanking.body.candidates[0].file, "local-ai-target.js");
        assert.ok(semanticRanking.body.candidates[0].semanticSimilarity > 0.9);

        const evidence = await post("/grep", {
            term: plan.body.toolCalls[0].args.query,
            query: plan.body.toolCalls[0].args.query,
            cwd: ".",
            maxMatches: 20
        });
        assert.equal(evidence.status, 200, JSON.stringify(evidence.body));
        assert.equal(evidence.body.ok, true);
        assert.ok(
            evidence.body.matches.some(match =>
                String(match.file || "").replaceAll("\\", "/") === "local-ai-target.js"
            ),
            JSON.stringify(evidence.body)
        );

        const response = await post("/semantic/respond", {
            input: [
                "Responde sólo con la evidencia local observada.",
                JSON.stringify({
                    tool: "repo.search",
                    query: plan.body.toolCalls[0].args.query,
                    matches: evidence.body.matches.slice(0, 5)
                })
            ].join("\n")
        });
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.equal(response.body.ok, true);
        assert.match(response.body.message, /evidencia local confirma/i);
        assert.equal(response.body.localSemanticInferenceUsed, true);
        assert.equal(response.body.cloudSemanticInferenceUsed, false);
        assert.equal(response.body.fallbackAllowed, false);

        const health = engine.describe();
        assert.equal(health.counters.localSemanticInferenceCalls, 2);
        assert.ok(health.counters.localEmbeddingCalls >= 2);
        assert.ok(health.counters.localEmbeddedTexts >= 2);
        assert.equal(health.counters.semanticExternalCalls, 0);
        assert.equal(health.counters.paidExternalCalls, 0);
        assert.equal(llmRequests.length, 2);
        assert.ok(Array.isArray(llmRequests[0].tools));
        assert.equal(llmRequests[1].tools, undefined);
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    }
});

test("self-hosted semantic backend fails closed for unsafe remote HTTP and LOCAL_ONLY", () => {
    const engine = createSelfHostedSemanticEngine({
        env: {
            JARVIS_SEMANTIC_PROVIDER_MODE: "LOCAL_ONLY",
            JARVIS_LOCAL_LLM_BASE_URL: "http://gpu.example.test/v1",
            JARVIS_LOCAL_LLM_MODEL: "unsafe-model"
        }
    });
    const health = engine.describe();
    assert.equal(health.ok, false);
    assert.equal(health.status, "LOCAL_SEMANTIC_ENDPOINT_MUST_BE_LOOPBACK");
    assert.equal(health.fallbackAllowed, false);
});

test("Jarvis creates a multi-sheet XLSX with executable formulas", async () => {
    const fixture = createBridgeIdentityFixture({
        branch: "v5.9-polish"
    });
    const root = fixture.root;
    const server = createJarvisFsBridgeApp({ root }).listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        const response = await fetch(`${base}/document`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "test-release"
            },
            body: JSON.stringify({
                format: "xlsx",
                output: "",
                title: "APU muro",
                requireFormulas: true,
                sheets: [
                    {
                        name: "APU",
                        rows: [
                            ["Concepto", "Cantidad", "Precio", "Importe"],
                            ["Block supuesto", 13, 20, "=B2*C2"],
                            ["Costo directo", "", "", "=SUM(D2:D2)"]
                        ]
                    },
                    {
                        name: "Criterios",
                        rows: [
                            ["Criterio", "Valor"],
                            ["Precios", "SUPUESTO; validar cotizaciones"]
                        ]
                    }
                ]
            })
        });
        const result = await response.json();
        const ExcelJS = (await import("exceljs")).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path.join(root, result.output));

        assert.equal(response.status, 200);
        assert.equal(result.status, "DOCUMENT_CREATED");
        assert.equal(result.artifact.approval.required, false);
        assert.equal(result.artifact.approval.approvedBy, "LOCAL_ARTIFACT_POLICY");
        assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ["APU", "Criterios"]);
        assert.equal(workbook.getWorksheet("APU").getCell("D2").value.formula, "B2*C2");
        assert.equal(
            workbook.getWorksheet("Criterios").getCell("B2").value,
            "SUPUESTO; validar cotizaciones"
        );

        const invalidResponse = await fetch(`${base}/document`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "test-release"
            },
            body: JSON.stringify({
                format: "xlsx",
                title: "APU inválido",
                sheets: [
                    {
                        name: "Mano de Obra",
                        rows: [
                            ["Concepto", "Importe"],
                            ["Cuadrilla", 100]
                        ]
                    },
                    {
                        name: "Costo Directo",
                        rows: [
                            ["Concepto", "Importe"],
                            ["Mano de obra", "=Mano_de_Obra!B2*0.03 (SUPUESTO)"]
                        ]
                    }
                ]
            })
        });
        const invalidResult = await invalidResponse.json();
        assert.equal(invalidResponse.status, 400);
        assert.equal(invalidResult.status, "DOCUMENT_CREATE_FAILED");
        assert.ok(
            invalidResult.error.startsWith(
                "XLSX_FORMULA_"
            ),
            invalidResult.error
        );

        const structuralInvalidResponse = await fetch(`${base}/document`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "test-release"
            },
            body: JSON.stringify({
                format: "xlsx",
                title: "APU estructuralmente invalido",
                sheets: [
                    {
                        name: "APU",
                        rows: [
                            ["Concepto", "Cantidad", "Precio", "Importe"],
                            ["Block", 13, "SUPUESTO", "=B2*C2"],
                            ["Circular", "", "", "=D3"],
                            ["Fuera", "", "", "=B20*2"]
                        ]
                    }
                ]
            })
        });
        const structuralInvalidResult =
            await structuralInvalidResponse.json();
        assert.equal(
            structuralInvalidResponse.status,
            400
        );
        assert.equal(
            structuralInvalidResult.status,
            "DOCUMENT_CREATE_FAILED"
        );
        assert.match(
            structuralInvalidResult.error,
            /XLSX_FORMULA_STRUCTURE_INVALID/
        );

        const emptyWorkbookResponse = await fetch(`${base}/document`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "test-release"
            },
            body: JSON.stringify({
                format: "xlsx",
                title: "Libro vacio",
                sheets: [{
                    name: "APU",
                    rows: []
                }]
            })
        });
        const emptyWorkbookResult =
            await emptyWorkbookResponse.json();
        assert.equal(
            emptyWorkbookResponse.status,
            400
        );
        assert.match(
            emptyWorkbookResult.error,
            /XLSX_WORKBOOK_CONTENT_REQUIRED/
        );

        const formulaRequiredResponse = await fetch(`${base}/document`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "test-release"
            },
            body: JSON.stringify({
                format: "xlsx",
                title: "Libro sin formulas",
                requireFormulas: true,
                sheets: [{
                    name: "APU",
                    rows: [
                        ["Concepto", "Precio"],
                        ["Block", 20]
                    ]
                }]
            })
        });
        const formulaRequiredResult =
            await formulaRequiredResponse.json();
        assert.equal(
            formulaRequiredResponse.status,
            400
        );
        assert.match(
            formulaRequiredResult.error,
            /XLSX_WORKBOOK_FORMULAS_REQUIRED/
        );

        const unvalidatedDocxResponse = await fetch(`${base}/document`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "test-release"
            },
            body: JSON.stringify({
                format: "docx",
                title: "Documento sin gate",
                content: "Contenido que no fue validado por document.compose."
            })
        });
        const unvalidatedDocxResult =
            await unvalidatedDocxResponse.json();
        assert.equal(
            unvalidatedDocxResponse.status,
            422
        );
        assert.equal(
            unvalidatedDocxResult.status,
            "DOCUMENT_VALIDATION_REQUIRED"
        );
        assert.equal(
            unvalidatedDocxResult.output,
            null
        );
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    }
});

test("Jarvis edits exact PPTX text while preserving the original presentation", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pptx-edit-"));
    try {
        const PptxGenJS = (await import("pptxgenjs")).default;
        const JSZip = (await import("jszip")).default;
        const sourceDir = path.join(root, ".jarvis-artifacts", "uploads");
        fs.mkdirSync(sourceDir, { recursive: true });
        const sourceFile = path.join(sourceDir, "presentacion.pptx");
        const presentation = new PptxGenJS();
        presentation.layout = "LAYOUT_WIDE";
        const slide = presentation.addSlide();
        slide.addText("CLIENTE ACME", { x: 1, y: 1, w: 5, h: 1, bold: true, fontSize: 28, color: "2563EB" });
        await presentation.writeFile({ fileName: sourceFile });
        const sourceBytes = fs.readFileSync(sourceFile);

        const result = await editPptxArtifact({
            root,
            sourceOutput: ".jarvis-artifacts/uploads/presentacion.pptx",
            output: ".jarvis-artifacts/documents/presentacion-mph.pptx",
            replacements: [{ search: "ACME", replace: "MPH", expectedMatches: 1 }]
        });
        const archive = await JSZip.loadAsync(fs.readFileSync(path.join(root, result.output)));
        const slideXml = await archive.file("ppt/slides/slide1.xml").async("string");
        assert.equal(result.status, "PPTX_EDITED");
        assert.equal(result.originalPreserved, true);
        assert.equal(result.replacements[0].matchCount, 1);
        assert.match(slideXml, /CLIENTE MPH/);
        assert.match(slideXml, /b="1"/);
        assert.deepEqual(fs.readFileSync(sourceFile), sourceBytes);
        assert.notEqual(result.outputSha256, result.sourceSha256);

        await assert.rejects(() => editPptxArtifact({
            root,
            sourceOutput: ".jarvis-artifacts/uploads/presentacion.pptx",
            replacements: [{ search: "NO EXISTE", replace: "X", expectedMatches: 1 }]
        }), /PPTX_MATCH_COUNT_MISMATCH:0:1/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Jarvis edits exact DOCX text without rebuilding or changing the original", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-docx-edit-"));
    try {
        const { Document, Packer, Paragraph, TextRun } = await import("docx");
        const JSZip = (await import("jszip")).default;
        const sourceDir = path.join(root, ".jarvis-artifacts", "uploads");
        fs.mkdirSync(sourceDir, { recursive: true });
        const sourceFile = path.join(sourceDir, "contrato.docx");
        const document = new Document({ sections: [{ children: [
            new Paragraph({ children: [new TextRun({ text: "CONTRATO DE SERVICIO", bold: true })] }),
            new Paragraph({ children: [new TextRun("Cliente: ACME")] })
        ] }] });
        const sourceBytes = await Packer.toBuffer(document);
        fs.writeFileSync(sourceFile, sourceBytes);

        const result = await editDocxArtifact({
            root,
            sourceOutput: ".jarvis-artifacts/uploads/contrato.docx",
            output: ".jarvis-artifacts/documents/contrato-mph.docx",
            replacements: [{ search: "ACME", replace: "MPH", expectedMatches: 1 }]
        });
        const archive = await JSZip.loadAsync(fs.readFileSync(path.join(root, result.output)));
        const documentXml = await archive.file("word/document.xml").async("string");
        assert.equal(result.status, "DOCX_EDITED");
        assert.equal(result.originalPreserved, true);
        assert.equal(result.replacements[0].matchCount, 1);
        assert.match(documentXml, /Cliente: MPH/);
        assert.match(documentXml, /<w:b\/>/);
        assert.deepEqual(fs.readFileSync(sourceFile), sourceBytes);
        assert.notEqual(result.outputSha256, result.sourceSha256);

        await assert.rejects(() => editDocxArtifact({
            root,
            sourceOutput: ".jarvis-artifacts/uploads/contrato.docx",
            replacements: [{ search: "INEXISTENTE", replace: "X", expectedMatches: 1 }]
        }), /DOCX_MATCH_COUNT_MISMATCH:0:1/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Jarvis edits an existing XLSX while preserving untouched formulas and styles", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-xlsx-edit-"));
    try {
        const ExcelJS = (await import("exceljs")).default;
        const sourceDir = path.join(root, ".jarvis-artifacts", "uploads");
        fs.mkdirSync(sourceDir, { recursive: true });
        const sourceFile = path.join(sourceDir, "cotizacion.xlsx");
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Cotizacion");
        sheet.getCell("A1").value = "Concepto";
        sheet.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        sheet.getCell("B2").value = 100;
        sheet.getCell("B2").numFmt = "$#,##0.00";
        sheet.getCell("B3").value = { formula: "B2*0.16", result: 16 };
        await workbook.xlsx.writeFile(sourceFile);
        const sourceBytes = fs.readFileSync(sourceFile);

        const result = await editXlsxArtifact({
            root,
            sourceOutput: ".jarvis-artifacts/uploads/cotizacion.xlsx",
            output: ".jarvis-artifacts/documents/cotizacion-actualizada.xlsx",
            changes: [{ sheet: "Cotizacion", cell: "B2", value: 90 }]
        });
        const edited = new ExcelJS.Workbook();
        await edited.xlsx.readFile(path.join(root, result.output));
        const editedSheet = edited.getWorksheet("Cotizacion");
        assert.equal(result.status, "XLSX_EDITED");
        assert.equal(result.originalPreserved, true);
        assert.equal(result.recalculation, "ON_OPEN");
        assert.equal(editedSheet.getCell("B2").value, 90);
        assert.equal(editedSheet.getCell("B2").numFmt, "$#,##0.00");
        assert.equal(editedSheet.getCell("B3").value.formula, "B2*0.16");
        assert.equal(editedSheet.getCell("A1").font.bold, true);
        assert.equal(editedSheet.getCell("A1").fill.fgColor.argb, "FF2563EB");
        assert.deepEqual(fs.readFileSync(sourceFile), sourceBytes);
        assert.notEqual(result.outputSha256, result.sourceSha256);

        await assert.rejects(() => editXlsxArtifact({
            root,
            sourceOutput: ".jarvis-artifacts/uploads/cotizacion.xlsx",
            changes: [{ sheet: "Cotizacion", cell: "B3", formula: "[externo.xlsx]Hoja1!A1" }]
        }), /XLSX_FORMULA_NOT_ALLOWED/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Jarvis edits a real PDF overlay, preserves the original and blocks overflow", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pdf-edit-"));
    try {
        const { PDFDocument, StandardFonts } = await import("pdf-lib");
        const document = await PDFDocument.create();
        const page = document.addPage([612, 792]);
        const font = await document.embedFont(StandardFonts.Helvetica);
        page.drawText("TOTAL ORIGINAL: 100.00", { x: 72, y: 120, size: 12, font });
        const sourceBytes = Buffer.from(await document.save({ useObjectStreams: false }));
        const sourceDir = path.join(root, ".jarvis-artifacts", "uploads");
        fs.mkdirSync(sourceDir, { recursive: true });
        const sourceFile = path.join(sourceDir, "cotizacion.pdf");
        fs.writeFileSync(sourceFile, sourceBytes);

        const result = await editPdfOverlayArtifact({
            root,
            sourceOutput: ".jarvis-artifacts/uploads/cotizacion.pdf",
            output: ".jarvis-artifacts/documents/cotizacion-editada.pdf",
            changes: [{ page: 1, x: 70, y: 110, width: 190, height: 30, text: "TOTAL ACTUALIZADO: 90.00", fontSize: 12 }]
        });
        assert.equal(result.ok, true);
        assert.equal(result.status, "PDF_EDITED_VERIFIED");
        assert.equal(result.originalPreserved, true);
        assert.equal(result.visualVerification.overflowPassed, true);
        assert.equal(result.visualVerification.renderedComparisonPassed, true);
        assert.equal(result.visualVerification.humanReviewRequired, false);
        assert.ok(result.visualVerification.approvedRegionChangedPixels > 0);
        assert.ok(result.visualVerification.outsideDifferenceRatio <= 0.0005);
        assert.deepEqual(fs.readFileSync(sourceFile), sourceBytes);
        assert.notEqual(result.outputSha256, result.sourceSha256);
        assert.equal(fs.existsSync(path.join(root, result.output)), true);

        await assert.rejects(() => editPdfOverlayArtifact({
            root,
            sourceOutput: ".jarvis-artifacts/uploads/cotizacion.pdf",
            changes: [{ page: 1, x: 70, y: 110, width: 20, height: 10, text: "ESTE TEXTO NO CABE", fontSize: 12 }]
        }), /PDF_TEXT_TOO_WIDE|PDF_TEXT_OVERFLOW/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
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

test("Jarvis persists two real PNG files with exact batch identities", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-two-png-"));
    const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64"
    );
    try {
        const names = ["evidencia-frontal.png", "evidencia-trasera.png"];
        const completed = names.map(name => {
            const started = startChunkedUpload({
                root,
                batchId: "batch-two-real-png",
                name,
                mimeType: "image/png",
                expectedBytes: png.length,
                caseId: "CASE-TWO-PNG",
                objectiveId: "OBJ-TWO-PNG"
            });
            appendChunkedUpload({
                root,
                uploadId: started.uploadId,
                offset: 0,
                dataBase64: png.toString("base64")
            });
            return completeChunkedUpload({
                root,
                uploadId: started.uploadId
            });
        });

        assert.deepEqual(completed.map(item => item.name), names);
        assert.equal(new Set(completed.map(item => item.output)).size, 2);
        assert.ok(completed.every(item => item.status === "UPLOAD_SAVED"));
        assert.ok(completed.every(item => item.detectedMimeType === "image/png"));
        assert.ok(completed.every(item =>
            Buffer.from(
                readArtifactPayload({
                    root,
                    output: item.output
                }).dataBase64,
                "base64"
            ).equals(png)
        ));
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

test("Jarvis FS bridge loads the release identity contract", async () => {
    const contract =
        readJarvisRuntimeContract(
            process.cwd()
        );

    assert.equal(contract.ok, true);
    assert.equal(contract.projectId, "fixgo-app");
    assert.equal(contract.repository, "heberzzt-wq/fixgo-app");
    assert.equal(contract.branch, "v94-media-v4n-negative-claims");
    assert.match(
        contract.releaseId,
        /^v94-source-grounded-research-v124-20260810$/
    );

    const fixture = createBridgeIdentityFixture();
    const root = fixture.root;
    let server = null;
    try {
        server =
            createJarvisFsBridgeApp({ root })
                .listen(0);
        await new Promise(resolve =>
            server.once("listening", resolve)
        );
        const base =
            `http://127.0.0.1:${server.address().port}`;
        const healthResponse =
            await fetch(`${base}/health`);
        const health =
            await healthResponse.json();

        assert.equal(healthResponse.status, 200);
        assert.equal(health.identity.ok, true);
        assert.equal(
            health.identity.identityMode,
            "branch_contract_head"
        );
        assert.equal(
            health.identity.contractHead,
            health.identity.git.head
        );

        const researchResponse =
            await fetch(
                `${base}/research`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-jarvis-release-id": "test-release"
                    },
                    body: JSON.stringify({
                        query: "x"
                    })
                }
            );
        const research =
            await researchResponse.json();

        assert.equal(researchResponse.status, 400);
        assert.equal(
            research.error,
            "WEB_RESEARCH_QUERY_REQUIRED"
        );
    }
    finally {
        if (server) {
            await new Promise(resolve =>
                server.close(resolve)
            );
        }
        fs.rmSync(
            fixture.fixtureRoot,
            {
                recursive: true,
                force: true
            }
        );
    }
});

test("bridge identity accepts the authorized branch and a clean detached worktree at the live remote head", () => {
    const fixture = createBridgeIdentityFixture();
    try {
        const branchIdentity =
            describeJarvisBridgeIdentity(fixture.root);
        assert.equal(branchIdentity.ok, true);
        assert.equal(
            branchIdentity.identityMode,
            "branch_contract_head"
        );

        const priorHead = fixture.runGit(["rev-parse", "HEAD"]);
        fs.writeFileSync(
            path.join(fixture.root, "identity-marker.txt"),
            "authorized detached identity\n"
        );
        fixture.runGit(["add", "identity-marker.txt"]);
        fixture.runGit(["commit", "-m", "authorized detached identity"]);
        const authorizedHead = fixture.runGit(["rev-parse", "HEAD"]);
        fixture.runGit(["push", "origin", fixture.branch]);
        fixture.runGit([
            "update-ref",
            `refs/remotes/origin/${fixture.branch}`,
            priorHead
        ]);
        fixture.runGit(["checkout", "--detach", authorizedHead]);

        const detachedIdentity =
            describeJarvisBridgeIdentity(fixture.root);
        assert.equal(detachedIdentity.ok, true);
        assert.equal(
            detachedIdentity.identityMode,
            "detached_contract_head"
        );
        assert.equal(
            detachedIdentity.contractHead,
            authorizedHead
        );
        assert.equal(
            detachedIdentity.git.head,
            authorizedHead
        );
        assert.equal(detachedIdentity.worktreeClean, true);
        assert.equal(detachedIdentity.remoteVerified, true);
    }
    finally {
        fs.rmSync(fixture.fixtureRoot, {
            recursive: true,
            force: true
        });
    }
});

test("bridge identity fails closed when detached HEAD differs from the live authorized SHA", () => {
    const fixture = createBridgeIdentityFixture();
    try {
        fs.writeFileSync(
            path.join(fixture.root, "identity-marker.txt"),
            "local detached divergence\n"
        );
        fixture.runGit(["add", "identity-marker.txt"]);
        fixture.runGit(["commit", "-m", "local divergence"]);
        const divergentHead = fixture.runGit(["rev-parse", "HEAD"]);
        fixture.runGit(["checkout", "--detach", divergentHead]);

        const identity = describeJarvisBridgeIdentity(fixture.root);
        assert.equal(identity.ok, false);
        assert.equal(identity.status, "BRIDGE_IDENTITY_INVALID");
        assert.equal(identity.identityMode, "invalid");
        assert.notEqual(identity.contractHead, identity.git.head);
    }
    finally {
        fs.rmSync(fixture.fixtureRoot, {
            recursive: true,
            force: true
        });
    }
});

test("bridge identity fails closed when the remote branch advances away from detached HEAD", () => {
    const fixture = createBridgeIdentityFixture();
    try {
        const detachedHead = fixture.runGit(["rev-parse", "HEAD"]);
        fs.writeFileSync(
            path.join(fixture.root, "identity-marker.txt"),
            "remote advanced\n"
        );
        fixture.runGit(["add", "identity-marker.txt"]);
        fixture.runGit(["commit", "-m", "remote advanced"]);
        const remoteHead = fixture.runGit(["rev-parse", "HEAD"]);
        fixture.runGit(["push", "origin", fixture.branch]);
        fixture.runGit(["checkout", "--detach", detachedHead]);

        const identity = describeJarvisBridgeIdentity(fixture.root);
        assert.equal(identity.ok, false);
        assert.equal(identity.status, "BRIDGE_IDENTITY_INVALID");
        assert.equal(identity.contractHead, remoteHead);
        assert.equal(identity.git.head, detachedHead);
    }
    finally {
        fs.rmSync(fixture.fixtureRoot, {
            recursive: true,
            force: true
        });
    }
});

test("bridge identity fails closed without live remote branch verification", () => {
    const fixture = createBridgeIdentityFixture();
    try {
        const head = fixture.runGit(["rev-parse", "HEAD"]);
        fixture.runGit(["checkout", "--detach", head]);
        execFileSync(
            gitExecutable,
            [
                "--git-dir",
                fixture.remoteRoot,
                "update-ref",
                "-d",
                `refs/heads/${fixture.branch}`
            ],
            { stdio: "ignore" }
        );

        const identity = describeJarvisBridgeIdentity(fixture.root);
        assert.equal(identity.ok, false);
        assert.equal(identity.remoteVerified, false);
        assert.equal(identity.contractHead, null);
    }
    finally {
        fs.rmSync(fixture.fixtureRoot, {
            recursive: true,
            force: true
        });
    }
});

test("bridge identity fails closed for a foreign origin repository", () => {
    const fixture = createBridgeIdentityFixture();
    try {
        const foreignRemote = "https://github.com/foreign-owner/other-repo.git";
        fixture.runGit(["remote", "set-url", "origin", foreignRemote]);
        fixture.runGit([
            "config",
            `url.${pathToFileURL(fixture.remoteRoot).href}.insteadOf`,
            foreignRemote
        ]);

        const identity = describeJarvisBridgeIdentity(fixture.root);
        assert.equal(identity.ok, false);
        assert.equal(identity.repositoryMatches, false);
        assert.equal(identity.remoteVerified, false);
    }
    finally {
        fs.rmSync(fixture.fixtureRoot, {
            recursive: true,
            force: true
        });
    }
});

test("bridge identity fails closed when the authorized worktree has relevant changes", () => {
    const fixture = createBridgeIdentityFixture();
    try {
        const head = fixture.runGit(["rev-parse", "HEAD"]);
        fixture.runGit(["checkout", "--detach", head]);
        fs.writeFileSync(
            path.join(fixture.root, "identity-marker.txt"),
            "dirty authorized worktree\n"
        );

        const identity = describeJarvisBridgeIdentity(fixture.root);
        assert.equal(identity.ok, false);
        assert.equal(identity.worktreeClean, false);
        assert.equal(identity.status, "BRIDGE_IDENTITY_INVALID");
    }
    finally {
        fs.rmSync(fixture.fixtureRoot, {
            recursive: true,
            force: true
        });
    }
});

test("a branch-owning worktree does not invalidate or mutate the authorized detached worktree", () => {
    const fixture = createBridgeIdentityFixture();
    const detachedRoot = path.join(fixture.fixtureRoot, "authorized-detached");
    try {
        const ownerBefore = {
            branch: fixture.runGit(["branch", "--show-current"]),
            head: fixture.runGit(["rev-parse", "HEAD"]),
            status: fixture.runGit([
                "status",
                "--porcelain=v1",
                "--untracked-files=all"
            ])
        };
        fixture.runGit([
            "worktree",
            "add",
            "--detach",
            detachedRoot,
            ownerBefore.head
        ]);

        const identity = describeJarvisBridgeIdentity(detachedRoot);
        assert.equal(identity.ok, true);
        assert.equal(identity.identityMode, "detached_contract_head");

        const ownerAfter = {
            branch: fixture.runGit(["branch", "--show-current"]),
            head: fixture.runGit(["rev-parse", "HEAD"]),
            status: fixture.runGit([
                "status",
                "--porcelain=v1",
                "--untracked-files=all"
            ])
        };
        assert.deepEqual(ownerAfter, ownerBefore);
    }
    finally {
        fs.rmSync(fixture.fixtureRoot, {
            recursive: true,
            force: true
        });
    }
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

test("write bridge requires fingerprinted one-time approval, snapshot and post-verify", async () => {
    const fixture = createBridgeIdentityFixture({
        branch: "v5.9-polish"
    });
    const root = fixture.root;
    fs.writeFileSync(path.join(root, "sample.js"), "export const value = 1;\n");
    const server = createJarvisFsBridgeApp({ root }).listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async (route, body) => {
        const response = await fetch(`${base}${route}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-jarvis-release-id": "test-release" },
            body: JSON.stringify(body)
        });
        return { status: response.status, body: await response.json() };
    };

    try {
        const naked = await post("/write", { file: "sample.js", content: "hacked" });
        assert.equal(naked.status, 400);
        assert.equal(naked.body.error, "FINGERPRINT_REQUIRED");

        const prepared = await post("/write/prepare", {
            objectiveId: "objective-1",
            caseId: "case-1",
            authorityId: "HEBERTO_MENDOZA",
            controllerId: "CODEX_SIA7",
            file: "sample.js",
            search: "value = 1",
            replace: "value = 2",
            matchCount: 1
        });
        assert.equal(prepared.body.status, "WRITE_PREPARED");
        assert.equal(prepared.body.matchCount, 1);

        const rejected = await post("/write/authorize", {
            fingerprint: prepared.body.fingerprint,
            nonce: prepared.body.nonce,
            approvedBy: "HEBERTO_MENDOZA",
            approvalCommand: "AUTORIZO OTRO CAMBIO"
        });
        assert.equal(rejected.status, 400);
        assert.equal(rejected.body.error, "WRITE_APPROVAL_COMMAND_MISMATCH");

        const authorized = await post("/write/authorize", {
            fingerprint: prepared.body.fingerprint,
            nonce: prepared.body.nonce,
            approvedBy: "HEBERTO_MENDOZA",
            approvalCommand: prepared.body.approvalCommand
        });
        assert.equal(authorized.body.status, "WRITE_AUTHORIZED_ONCE");

        const written = await post("/write", {
            fingerprint: prepared.body.fingerprint,
            nonce: prepared.body.nonce,
            objectiveId: "objective-1",
            caseId: "case-1"
        });
        assert.equal(written.body.status, "WRITE_COMPLETED_VERIFIED");
        assert.equal(written.body.verified, true);
        assert.ok(written.body.consumedAt);
        assert.equal(fs.readFileSync(path.join(root, "sample.js"), "utf8"), "export const value = 2;\n");

        const replay = await post("/write", {
            fingerprint: prepared.body.fingerprint,
            nonce: prepared.body.nonce,
            objectiveId: "objective-1",
            caseId: "case-1"
        });
        assert.equal(replay.status, 400);
        assert.equal(replay.body.error, "WRITE_AUTHORIZATION_NOT_FOUND_OR_CONSUMED");

        const addWithoutReceipt = await post("/git", {
            action: "add", files: ["sample.js"], approved: true, codexApproved: true
        });
        assert.equal(addWithoutReceipt.status, 403);
        assert.equal(addWithoutReceipt.body.error, "VERIFIED_WRITE_RECEIPTS_REQUIRED");

        const added = await post("/git", {
            action: "add", files: ["sample.js"], receiptFingerprints: [prepared.body.fingerprint],
            approved: true, codexApproved: true
        });
        assert.equal(added.body.status, "GIT_ADD_OK");

        const committed = await post("/git", {
            action: "commit", message: "Verify one-time write receipt",
            receiptFingerprints: [prepared.body.fingerprint], approved: true, codexApproved: true
        });
        assert.equal(committed.body.status, "GIT_COMMIT_OK");
        assert.ok(committed.body.commitReceipt?.receiptId);
        fixture.runGit([
            "push",
            "origin",
            `HEAD:${fixture.branch}`
        ]);

        const pushMismatch = await post("/git", {
            action: "push", remote: "origin", branch: "v5.9-polish",
            commitReceiptId: committed.body.commitReceipt.receiptId,
            approvalCommand: "AUTORIZO PUSH INCORRECTO", approvedBy: "HEBERTO_MENDOZA",
            approved: true, codexApproved: true
        });
        assert.equal(pushMismatch.status, 403);
        assert.equal(pushMismatch.body.error, "GIT_PUSH_COMMAND_MISMATCH");

        const stale = await post("/write/prepare", {
            objectiveId: "objective-2", caseId: "case-2",
            authorityId: "HEBERTO_MENDOZA", controllerId: "CODEX_SIA7",
            file: "sample.js", search: "value = 2", replace: "value = 3", matchCount: 1
        });
        await post("/write/authorize", {
            fingerprint: stale.body.fingerprint, nonce: stale.body.nonce,
            approvedBy: "HEBERTO_MENDOZA", approvalCommand: stale.body.approvalCommand
        });
        fs.writeFileSync(path.join(root, "sample.js"), "export const value = 99;\n");
        const staleWrite = await post("/write", {
            fingerprint: stale.body.fingerprint, nonce: stale.body.nonce,
            objectiveId: "objective-2", caseId: "case-2"
        });
        assert.equal(staleWrite.status, 400);
        assert.equal(staleWrite.body.error, "WRITE_SNAPSHOT_CHANGED");
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    }
});


test("PDF edit route records local artifact approval and safe placement contract", () => {
    const source =
        fs.readFileSync(
            path.join(
                process.cwd(),
                "jarvis-fs-bridge.js"
            ),
            "utf8"
        );

    assert.match(
        source,
        /safePlacement:\s*req\.body\?\.safePlacement !==\s*false/
    );

    assert.match(
        source,
        /document\/pdf\/edit[\s\S]{0,1600}approvalRequired:\s*false[\s\S]{0,300}LOCAL_ARTIFACT_POLICY/
    );

    assert.match(
        source,
        /placementAdjustments/
    );
});

test("V142 bridge auto-loads persisted RunPod credential only into adapter memory on Windows", () => {
    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.equal(bridgeSource.includes("resolveRunpodCredentialEnvironment"), true);
    assert.equal(bridgeSource.includes("runpod-api-key.clixml"), true);
    assert.equal(bridgeSource.includes("Import-Clixml"), true);
    assert.equal(bridgeSource.includes("SecureStringToBSTR"), true);
    assert.equal(bridgeSource.includes("ZeroFreeBSTR"), true);
    assert.equal(bridgeSource.includes('credentialSource: "windows-dpapi-clixml"'), true);
    assert.equal(bridgeSource.includes("env: runpodCredential.env"), true);
    assert.equal(bridgeSource.includes("process.env.RUNPOD_API_KEY ="), false);
});

test("V142 HuMo runtime certification CLI is explicit-authority budgeted and cleanup-verified", () => {
    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.equal(bridgeSource.includes("runHuMoRuntimeCertificationCli"), true);
    assert.equal(bridgeSource.includes('process.argv.includes("--humo-runtime-certification")'), true);
    assert.equal(bridgeSource.includes("RUNPOD_PAID_RESOURCE_CREATION_NOT_AUTHORIZED"), true);
    assert.equal(bridgeSource.includes("JARVIS_HUMO_RUNTIME_CERT_HARD_BUDGET_USD"), true);
    assert.equal(bridgeSource.includes("JARVIS_REMOTE_GPU_HARD_BUDGET_USD: String(certificationHardBudgetUsd)"), true);
    assert.equal(bridgeSource.includes("JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: String(certificationAuthorizedHourlyRateUsd)"), true);
    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY: "true"'), true);
    assert.equal(bridgeSource.includes("delete runtimeEnv.JARVIS_RUNPOD_NETWORK_VOLUME_ID"), true);
    assert.equal(bridgeSource.includes("paidDeadlineMs = certificationStartedMs + certificationEconomicDeadlineSeconds * 1000"), true);
    assert.equal(bridgeSource.includes("await engine.cancel({ operationName })"), true);
    assert.equal(bridgeSource.includes("workerRelease?.terminationVerified !== true"), true);
    assert.equal(bridgeSource.includes('final.status !== "RUNPOD_HUMO_RUNTIME_PREFLIGHT_CERTIFIED"'), true);
});

test("V142 HuMo runtime certification CLI exposes remote bootstrap progress and nonzero wall clock cost", () => {
    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.equal(bridgeSource.includes("remotePhase: remoteWorker?.phase || null"), true);
    assert.equal(bridgeSource.includes("bootstrapStage: bootstrapProgress?.stage || null"), true);
    assert.equal(bridgeSource.includes("bootstrapStatus: bootstrapProgress?.status || null"), true);
    assert.equal(bridgeSource.includes("wallClockUpperBoundCostUsd"), true);
    assert.equal(bridgeSource.includes("providerReportedCostUsd"), true);
    assert.equal(bridgeSource.includes("terminationVerified: polled?.workerRelease?.terminationVerified === true"), true);
});

test("V142 HuMo runtime certification supports a lower per-attempt budget and paid economic deadline", () => {
    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.equal(bridgeSource.includes("RUNPOD_HUMO_RUNTIME_CERT_BUDGET_INVALID"), true);
    assert.equal(bridgeSource.includes("certificationOuterStopRatio = 0.90"), true);
    assert.equal(bridgeSource.includes('JARVIS_HUMO_TORCH_STAGE_TIMEOUT_SECONDS: "120"'), true);
    assert.equal(bridgeSource.includes("JARVIS_RUNPOD_BOOTSTRAP_TIMEOUT_SECONDS: String(certificationEconomicDeadlineSeconds)"), true);
    assert.equal(bridgeSource.includes("JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS: String(certificationEconomicDeadlineSeconds + 120)"), true);
    assert.equal(bridgeSource.includes("maximumPaidRuntimeSeconds"), true);
    assert.equal(bridgeSource.includes("const certificationDeadlineMinutes = 60"), false);
    assert.equal(bridgeSource.includes("Number(final.gpuRentalEstimatedCost || 0) > certificationHardBudgetUsd"), true);
});

test("V142 HuMo runtime certification does not hard-pin a default datacenter", () => {
    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.equal(bridgeSource.includes('runtimeEnv.JARVIS_RUNPOD_DATACENTER_ID = String(env.JARVIS_RUNPOD_DATACENTER_ID || "EU-NL-1").trim()'), true);
    assert.equal(bridgeSource.includes('env.JARVIS_RUNPOD_DATACENTER_ID || ""'), true);
    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_GPU_TYPE_ID: "NVIDIA L40S"'), true);
    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_CLOUD_TYPE: "SECURE"'), true);
});


test("SIA7 worker targets the bridge IPv4 loopback authority", () => {
    const workerSource = fs.readFileSync(new URL("../jarvis-github-worker.js", import.meta.url), "utf8");
    const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(workerSource.includes('const BRIDGE_URL = process.env.JARVIS_FS_BRIDGE_URL || "http://127.0.0.1:3344";'), true);
    assert.equal(workerSource.includes('http://localhost:3344'), false);
    assert.equal(packageJson.scripts.bridge.includes("bridge=http://127.0.0.1:3344"), true);
    assert.equal(packageJson.scripts.bridge.includes("bridge=http://localhost:3344"), false);
});



test("npm bridge syncs the checkout before importing long-lived bridge modules", () => {
    const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const bridgeScript = String(packageJson.scripts.bridge || "");
    const fetchIndex = bridgeScript.indexOf("spawnSync(git,['fetch','--quiet','origin'");
    const rebaseIndex = bridgeScript.indexOf("spawnSync(git,['rebase','--autostash','origin/v94-media-v4n-negative-claims']");
    const uploadImportIndex = bridgeScript.indexOf("import('./jarvis-upload-bridge.js')");
    const workerImportIndex = bridgeScript.indexOf("import('./jarvis-github-worker.js')");
    assert.ok(fetchIndex >= 0, "bridge launcher must fetch the exact remote branch");
    assert.ok(rebaseIndex > fetchIndex, "bridge launcher must rebase onto exactly one remote ref");
    assert.ok(uploadImportIndex > rebaseIndex, "upload bridge import must happen after Git sync");
    assert.ok(workerImportIndex > rebaseIndex, "worker import must happen after Git sync");
    assert.match(bridgeScript, /C:\\\\Program Files\\\\Git\\\\cmd\\\\git\.exe/);
});

test("SIA7 worker synchronizes against exactly one remote branch ref", () => {
    const workerSource = fs.readFileSync(
        new URL("../jarvis-github-worker.js", import.meta.url),
        "utf8"
    );
    assert.equal(workerSource.includes("refs/remotes/${REMOTE}/${BRANCH}"), true);
    assert.equal(workerSource.includes('"rebase",\n        "--autostash"'), true);
    assert.equal(workerSource.includes('"pull",\n        "--rebase"'), false);
});

test("Windows bridge child processes inherit the canonical Git executable path", () => {
    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.match(bridgeSource, /function bridgeChildEnvironment\(/);
    assert.match(bridgeSource, /C:\\\\Program Files\\\\Git\\\\cmd/);
    assert.match(bridgeSource, /env\.PATH = resolvedPath/);
    assert.match(bridgeSource, /env\.Path = resolvedPath/);
    assert.match(bridgeSource, /bridgeChildEnvironment\(\{[\s\S]*?GIT_TERMINAL_PROMPT/);
    assert.match(bridgeSource, /bridgeChildEnvironment\(\{[\s\S]*?CI:/);
});

test("SIA7 long bridge runs use native HTTP transport with command-bound timeout", async () => {
    const workerSource = fs.readFileSync(new URL("../jarvis-github-worker.js", import.meta.url), "utf8");
    assert.match(workerSource, /endpoint === "\/run"/);
    assert.match(workerSource, /requestLocalBridgeJson/);
    assert.match(workerSource, /Number\(job\.body\?\.timeoutMs \|\| 120000\) \+ 60000/);
    const { requestLocalBridgeJson } = await import("../jarvis-github-worker.js");
    const http = await import("node:http");
    const server = http.createServer((_req, res) => {
        setTimeout(() => {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true, status: "PASSED", delayed: true }));
        }, 50);
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    try {
        const result = await requestLocalBridgeJson(
            `http://127.0.0.1:${server.address().port}/run`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ command: "fixture" }),
                timeoutMs: 5000
            }
        );
        assert.equal(result.ok, true);
        assert.equal(result.status, 200);
        assert.deepEqual(result.payload, { ok: true, status: "PASSED", delayed: true });
    }
    finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test("Taqueria Wan registry verification prefers the exact recent local receipt before registry network", () => {
    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");
    const resolveStart = engineSource.indexOf("async function resolveRegistryVerification");
    const resolveEnd = engineSource.indexOf("function assertPaidResourceCreationAuthority", resolveStart);
    assert.ok(resolveStart >= 0 && resolveEnd > resolveStart);
    const resolveBlock = engineSource.slice(resolveStart, resolveEnd);
    const receiptIndex = resolveBlock.indexOf("recentEphemeralWanRegistryVerification(imageProfile)");
    const registryIndex = resolveBlock.indexOf('imageProfile.registry !== "registry-1.docker.io"');
    assert.ok(receiptIndex >= 0 && registryIndex > receiptIndex);
    assert.match(engineSource, /const maxAgeMs = 6 \* 60 \* 60 \* 1000/);
});

test("Taqueria Wan ephemeral registry fallback is exact, recent and isolated from HuMo", () => {
    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");
    const workerSource = fs.readFileSync(new URL("../jarvis-github-worker.js", import.meta.url), "utf8");
    assert.match(engineSource, /function recentEphemeralWanRegistryVerification\(/);
    assert.match(engineSource, /const backend = configuredRemoteBackend\(\)/);
    assert.match(engineSource, /const backendMatches = backend === WAN22_TI2V_5B\.backend/);
    assert.match(engineSource, /ephemeralOneShotAuthorized === true/);
    assert.match(engineSource, /!networkVolumeId/);
    assert.match(engineSource, /JARVIS_RUNPOD_REGISTRY_RECEIPT_FALLBACK_AUTHORIZED/);
    assert.match(engineSource, /6 \* 60 \* 60 \* 1000/);
    assert.match(engineSource, /verification\.observedDigest === imageProfile\.expectedRegistryDigest/);
    assert.match(engineSource, /state\.phase === "TERMINATED" && state\.terminationVerified === true/);
    assert.match(workerSource, /JARVIS_RUNPOD_REGISTRY_RECEIPT_FALLBACK_AUTHORIZED: "true"/);
    assert.match(engineSource, /source: "RECENT_LOCAL_VERIFIED_RECEIPT"/);
});

test("Taqueria standalone preflight carries the same registry fallback authority", () => {
    const workerSource = fs.readFileSync(new URL("../jarvis-github-worker.js", import.meta.url), "utf8");
    const start = workerSource.indexOf("async function executeWan22TaqueriaPreflightJob");
    const end = workerSource.indexOf("const SIA7_TAQUERIA_WAN22_OUTPUT", start);
    assert.ok(start >= 0 && end > start);
    const preflightBlock = workerSource.slice(start, end);
    assert.match(preflightBlock, /JARVIS_RUNPOD_REGISTRY_RECEIPT_FALLBACK_AUTHORIZED: "true"/);
    assert.match(preflightBlock, /JARVIS_RUNPOD_EPHEMERAL_ONE_SHOT_AUTHORIZED: "true"/);
    assert.match(preflightBlock, /fetchImpl: \(url, options\) => guardedRunpodFetch\(url, options, env\)/);
});

test("Taqueria runtime binds paid and registry fallback authority inside its exact runtime block", () => {
    const workerSource = fs.readFileSync(new URL("../jarvis-github-worker.js", import.meta.url), "utf8");
    const start = workerSource.indexOf("async function taqueriaWan22Runtime");
    const end = workerSource.indexOf("\nasync function executeWan22TaqueriaStartJob", start);
    assert.ok(start >= 0 && end > start);
    const runtimeBlock = workerSource.slice(start, end);
    assert.match(runtimeBlock, /JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "true"/);
    assert.match(runtimeBlock, /JARVIS_RUNPOD_REGISTRY_RECEIPT_FALLBACK_AUTHORIZED: "true"/);
    assert.match(runtimeBlock, /fetchImpl: \(url, options\) => guardedRunpodFetch\(url, options, env\)/);
});

test("Taqueria paid RunPod guard consumes the scoped runtime authority without mutating global defaults", () => {
    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");
    const workerSource = fs.readFileSync(new URL("../jarvis-github-worker.js", import.meta.url), "utf8");
    assert.match(engineSource, /guardedRunpodFetch\(url, options=\{\}, runtimeEnv=process\.env\)/);
    assert.match(engineSource, /runtimeEnv\?\.JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED/);
    assert.match(workerSource, /fetchImpl: \(url, options\) => guardedRunpodFetch\(url, options, env\)/);
    assert.match(workerSource, /JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED: "true"/);
    assert.match(engineSource, /RUNPOD_PAID_EXECUTION_AUTHORIZED = false/);
});

test("SIA7 Taqueria paid Wan lifecycle is split into explicit start and poll operations", () => {
    const workerSource = fs.readFileSync(new URL("../jarvis-github-worker.js", import.meta.url), "utf8");
    assert.match(workerSource, /operation === "wan22_taqueria_start"/);
    assert.match(workerSource, /operation === "wan22_taqueria_poll"/);
    assert.match(workerSource, /job\.executePaid !== true \|\| job\.humanApproved !== true/);
    assert.match(workerSource, /SIA7_WAN22_PAID_AUTHORITY_REQUIRED/);
    assert.match(workerSource, /SIA7_TAQUERIA_WAN22_OUTPUT/);
    assert.match(workerSource, /taqueria-el-dorado-wan22-l40s-22s\.mp4/);
    assert.match(workerSource, /durationSeconds: 22/);
    assert.match(workerSource, /requiresIdentityFidelity: false/);
    assert.match(workerSource, /candidate\?\.gpuTypeId === "NVIDIA L40S"/);
    assert.match(workerSource, /Number\(candidate\.hourlyRateUsd\) <= 1\.10/);
    assert.match(workerSource, /JARVIS_RUNPOD_GPU_TYPE_ID: "NVIDIA L40S"/);
    assert.match(workerSource, /JARVIS_RUNPOD_DATACENTER_ID: "EU-NL-1"/);
    assert.match(workerSource, /JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD: "1\.10"/);
    assert.match(workerSource, /JARVIS_RUNPOD_EPHEMERAL_ONE_SHOT_AUTHORIZED/);
    assert.match(workerSource, /maximumHardBudgetUsd: 1\.5/);
    assert.match(workerSource, /await runtime\.engine\.poll\(\{ operationName \}\)/);
    assert.doesNotMatch(workerSource, /wan22_taqueria_start"[\s\S]{0,1200}humo-17b-identity/);
});

test("V142 paid ephemeral placement stays explicit and does not weaken persistent cache authority", () => {
    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");
    assert.match(engineSource, /JARVIS_RUNPOD_EPHEMERAL_ONE_SHOT_AUTHORIZED/);
    assert.match(engineSource, /const exactEphemeralOneShot =/);
    assert.match(engineSource, /candidate\.networkVolumeId === null/);
    assert.match(engineSource, /candidate\.dataCenterId === runtimeCertificationDataCenterId/);
    assert.match(engineSource, /candidate\.requiresCacheReplica === true/);
    assert.match(engineSource, /candidate\.cacheStatus === "CACHE_MISS"/);
    assert.match(engineSource, /networkVolumeId\s*\n\s*\? candidate\.networkVolumeId === networkVolumeId/);
    assert.match(engineSource, /RUNPOD_EXACT_PAID_PLACEMENT_AUTHORITY_REQUIRED/);
});



test("SIA7 backs off synchronization failures before execution without consuming the job", async () => {
    const { createWorkerPoller } = await import("../jarvis-github-worker.js");
    let syncs = 0, executions = 0, publications = 0, reads = 0, clock = 0;
    const poll = createWorkerPoller({reconcile:async()=>{},
        readJob: async () => { reads++; return {jobId: "retry-control"}; }, readResultId: async () => "",
        sync: async () => { if (++syncs === 1) throw new Error("network offline"); },
        execute: async () => { executions++; return {ok: true}; },
        publish: async () => { publications++; }, persist: () => {}, readLocalResult: () => null,
        log: () => {}, reportError: () => {}, now: () => clock
    });
    const first = await poll();
    assert.equal(first.ok, false); assert.equal(first.status, "WORKER_BACKOFF");
    assert.equal(executions, 0); assert.equal(publications, 0); assert.equal(reads, 1);
    const waiting = await poll();
    assert.equal(waiting.ok, false); assert.equal(waiting.status, "WORKER_BACKOFF_WAIT");
    assert.equal(executions, 0); assert.equal(publications, 0); assert.equal(reads, 1);
    clock = 15000;
    const recovered = await poll();
    assert.equal(recovered.ok, true); assert.equal(recovered.status, "JOB_COMPLETED");
    assert.equal(executions, 1); assert.equal(publications, 1); assert.equal(reads, 2);
});

test("SIA7 publication backoff and restart never replay an executed paid operation", async () => {
    const { createWorkerPoller } = await import("../jarvis-github-worker.js");
    let executions = 0, publications = 0, local = null, clock = 0;
    const deps = {
        readJob: async () => ({jobId: "paid-once"}), readResultId: async () => "",
        sync: async () => {}, execute: async () => { executions++; return {ok: true, podId: "fixture"}; },
        publish: async () => { if (++publications === 1) throw new Error("push failed"); },
        persist: value => { local = value; }, readLocalResult: () => local,
        log: () => {}, reportError: () => {}, now: () => clock
    };
    const poll = createWorkerPoller({...deps,reconcile:async()=>{}});
    await poll();
    assert.equal(executions, 1); assert.equal(publications, 1);
    await poll();
    assert.equal(executions, 1); assert.equal(publications, 1);
    clock = 10000;
    await poll();
    assert.equal(executions, 1); assert.equal(publications, 2);

    const restarted = createWorkerPoller({...deps,reconcile:async()=>{}});
    await restarted();
    assert.equal(executions, 1); assert.equal(publications, 2);
    await restarted();
    assert.equal(executions, 1); assert.equal(publications, 3);
});


test("HuMo17 probe is single L40S, pinned, hash-bound, budgeted and distinct from legacy", async () => {
    const {buildHuMo17RuntimeProbeJob, buildHuMo17RuntimeBootstrap} = await import("../jarvis-fs-bridge.js");
    const assets = {reference: {file: "reference.jpg", sha256: "a".repeat(64)}, audio: {file: "audio.wav", sha256: "b".repeat(64)}, output: ".jarvis-artifacts/videos/probe.mp4"};
    const options = {assets, hardBudgetUsd: 1.5, operationId: "fixture", paidAuthorized: true};
    const job = buildHuMo17RuntimeProbeJob(options);
    assert.equal(job.backend, "humo-17b-identity"); assert.equal(job.gpu, "NVIDIA L40S");
    assert.equal(job.gpuCount, 1); assert.equal(job.maximumIdentityCount, 1);
    assert.deepEqual(job.geometry, {width: 832, height: 480, fps: 25, frames: 97, durationSeconds: 3.88});
    assert.equal(job.networkVolumeId, "1qm5wczocl"); assert.equal(job.networkVolumeRetained, true);
    assert.equal(job.fullEpisodeAuthorized, false); assert.equal(job.strategy.compileEnabled, false);
    assert.equal(job.strategy.attentionMode, "sdpa"); assert.equal(job.strategy.modelLoaderDevice, "offload_device");
    assert.equal(job.referenceSha256, assets.reference.sha256); assert.equal(job.audioSha256, assets.audio.sha256);
    for (const hardBudgetUsd of [0, -1, 1.51, NaN, Infinity]) assert.throws(() => buildHuMo17RuntimeProbeJob({...options, hardBudgetUsd}), /BUDGET/);
    assert.throws(() => buildHuMo17RuntimeProbeJob({...options, paidAuthorized: false}), /AUTHORITY/);
    assert.throws(() => buildHuMo17RuntimeProbeJob({...options, assets: {...assets, reference: {file: "x.jpg"}}}), /HASHES/);
    assert.throws(() => buildHuMo17RuntimeProbeJob({...options, assets: {...assets, output: "outside.mp4"}}), /OUTPUT/);
    const shell = buildHuMo17RuntimeBootstrap(job);
    assert.match(shell, /CORE_NOT_CERTIFIED/); assert.match(shell, /ASSET_SHA256/);
    assert.ok(shell.includes("python3 -m venv --system-site-packages /tmp/jarvis-humo17/venv"));
    assert.match(shell, /RESULT_FILE=/);
    assert.match(shell, /trap .* ERR/);
    assert.match(shell, /HUMO17_BOOTSTRAP_FAILED_L/);
    assert.match(shell, /venv --system-site-packages/);
    assert.match(shell, /torch.__version__/);
    assert.match(shell, /pip install.*ComfyUI\/requirements.txt/);
    assert.doesNotMatch(shell, /PIP_NO_INDEX=1/);
    assert.ok(shell.indexOf("HUMO17_REQUIRED_NODES_MISSING") < shell.indexOf("download_auxiliary(a,p,url)"));
    assert.ok(shell.includes(job.strategy.comfyUiRevision));
    assert.ok(shell.includes(job.strategy.wrapperRevision));
    assert.match(shell, /for a in j.*strategy.*wrapperAuxiliaryAssets/);
    assert.ok(shell.includes("aux_verify(partial, a)"));
    assert.ok(shell.includes("partial.rename(p)"));
    assert.ok(shell.includes("download_auxiliary(a,p,url)"));
    assert.ok(shell.includes("verify(p,a); target="));
    assert.ok(shell.includes("target.symlink_to(p)"));
    assert.match(shell, /HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1/);
    assert.doesNotMatch(shell, /runtime-manifest\.json|download.*core|generate_1_7B|torch==2\.5\.1/);
    assert.throws(() => buildHuMo17RuntimeBootstrap({...job, gpuCount: 2}), /AUTHORITY/);
});


test("HuMo17 physical split-stage receipt does not require an unproven persistent runtime", async () => {
    const {validateHuMo17CoreStageReceipt: valid} = await import("../jarvis-fs-bridge.js");
    const volume = {id: "1qm5wczocl", dataCenterId: "EU-NL-1"};
    const receipt = {ok:true, physicalStageCertified:true, coreManifestVerified:true,
        terminationVerified:true, networkVolumeRetained:true, networkVolumeId:volume.id,
        networkVolumeDataCenterId:volume.dataCenterId, newPersistentBytes:18630299842,
        combinedPersistentBytes:40725409344};
    assert.equal(valid(receipt, volume), true);
    for (const patch of [{ok:false},{physicalStageCertified:false},{coreManifestVerified:false},
        {terminationVerified:false},{networkVolumeRetained:false},{networkVolumeId:"other"},
        {networkVolumeDataCenterId:"EU-RO-1"},{newPersistentBytes:31939821856},
        {combinedPersistentBytes:54034931358}]) assert.equal(valid({...receipt,...patch}, volume), false);
    assert.equal(valid(null, volume), false);
});

test("HuMo17 cleanup verifies Pod absence and never deletes a retained volume", async () => {
    const {releaseHuMo17Pod} = await import("../jarvis-fs-bridge.js");
    const calls = [];
    const provider = async (method, url) => { calls.push([method,url]); if(method === "GET") throw new Error("RUNPOD_HUMO17_HTTP_404"); };
    assert.equal(await releaseHuMo17Pod({podId: "fixture", provider, wait: async () => {}}), true);
    assert.deepEqual(calls, [["DELETE","/pods/fixture"],["GET","/pods/fixture"]]);
    assert.equal(await releaseHuMo17Pod({podId: "fixture", provider: async () => ({id:"fixture",desiredStatus:"RUNNING"}), wait: async () => {}}), false);
    await assert.rejects(releaseHuMo17Pod({podId:"fixture", provider:async () => {throw new Error("provider unavailable");}}), /provider unavailable/);
});


test("HuMo17 Python runner rejects unauthorized and invalid geometry before importing GPU libraries", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "humo17-runner-fixture-"));
    try {
        const result = path.join(root, "result.json"), jobFile = path.join(root, "job.json");
        const script = path.resolve("scripts/jarvis-local-video-wan22.py");
        for (const [job, expected] of [
            [{paidAuthorized:false}, "HUMO17_PROBE_AUTHORITY_REQUIRED"],
            [{paidAuthorized:true, fullEpisodeAuthorized:false, geometry:{frames:65}}, "HUMO17_PROBE_GEOMETRY_INVALID"],
            [{paidAuthorized:true, fullEpisodeAuthorized:false, qualityProbe:true, geometry:{width:832,height:480,fps:25,frames:97,durationSeconds:3.88}}, "HUMO17_PROBE_GEOMETRY_INVALID"],
            [{paidAuthorized:true, fullEpisodeAuthorized:false, qualityProbe:true, geometry:{width:832,height:480,fps:25,frames:201,durationSeconds:8.04},gpuCount:1,maximumIdentityCount:1,hardBudgetUsd:1.5}, "HUMO17_QUALITY_EVIDENCE_REQUIRED"]
        ]) {
            fs.writeFileSync(jobFile, JSON.stringify({backend:"humo-17b-identity",externalApiAllowed:false,...job}));
            try {execFileSync(process.platform === "win32" ? "python" : "python3", [script,"--job",jobFile,"--result",result], {timeout:15000,stdio:"pipe"});}
            catch(error) {assert.equal(error.status,1);}
            const receipt=JSON.parse(fs.readFileSync(result,"utf8"));
            assert.equal(receipt.ok,false); assert.equal(receipt.error,expected);
            assert.equal(receipt.backend,"humo-17b-identity");
        }
    } finally {fs.rmSync(root,{recursive:true,force:true});}
});


test("HuMo17 quality probe rejects noise-only, blind segments, mismatched hashes and insufficient speech", async () => {
    const {validateHuMo17SpeechEvidence, buildHuMo17RuntimeProbeJob} = await import("../jarvis-fs-bridge.js");
    const sha="a".repeat(64);
    const evidence={schemaVersion:"jarvis.audio-speech-segment.v142.1",selectionMethod:"full_source_vad_asr",speechValidated:true,
        sourceSha256:"b".repeat(64),wavSha256:sha,startSeconds:3,endSeconds:11.04,vocalIntervals:[{start:2.6,end:4.8}],
        transcript:"Es hora de tomar las riendas",asrMeanWordProbability:0.9,asrNoSpeechProbability:0.04};
    assert.ok(validateHuMo17SpeechEvidence(evidence,sha).vocalCoverageSeconds>2);
    for (const patch of [{selectionMethod:"first_seconds"},{speechValidated:false},{transcript:""},{wavSha256:"c".repeat(64)},
        {asrNoSpeechProbability:0.9},{asrMeanWordProbability:0.3},{endSeconds:6.88},{vocalIntervals:[]},{vocalIntervals:[{start:7,end:8.1}]},
        {vocalIntervals:[{start:0,end:0.4}]},{vocalIntervals:[{start:0,end:2},{start:1,end:3}]}]) {
        assert.throws(()=>validateHuMo17SpeechEvidence({...evidence,...patch},sha),/HUMO17_/);
    }
    const assets={qualityProbe:true,speechEvidence:evidence,reference:{file:"face.jpg",sha256:sha},audio:{sha256:sha},output:".jarvis-artifacts/videos/quality.mp4"};
    assert.throws(()=>buildHuMo17RuntimeProbeJob({assets:{...assets,speechEvidence:null},hardBudgetUsd:1.5,paidAuthorized:true}),/SPEECH/);
    assert.throws(()=>buildHuMo17RuntimeProbeJob({assets,hardBudgetUsd:1.51,paidAuthorized:true}),/QUALITY_BUDGET/);
    const job=buildHuMo17RuntimeProbeJob({assets,hardBudgetUsd:1.5,paidAuthorized:true});
    assert.equal(job.backend,"humo-17b-identity");assert.equal(job.qualityCertified,false);
    assert.deepEqual(job.geometry,{width:832,height:480,fps:25,frames:201,durationSeconds:8.04});
    assert.equal(job.referencePreprocessing.preserveAspectRatio,true);assert.equal(job.gpuCount,1);
    assert.equal(job.networkVolumeRetained,true);assert.equal(job.fullEpisodeAuthorized,false);
    const physicalJob=buildHuMo17RuntimeProbeJob({assets:{qualityProbe:false,reference:assets.reference,audio:assets.audio,output:".jarvis-artifacts/videos/physical.mp4"},hardBudgetUsd:1.5,paidAuthorized:true});
    assert.equal(physicalJob.prompt,"The exact person in the reference image speaks the supplied audio, natural restrained facial motion. Preserve facial identity, age, hair and facial hair. One person only, no subtitles or watermark.");
    assert.equal(physicalJob.negativePrompt,"another person, identity change, subtitles, watermark, deformed face");
    assert.notEqual(job.prompt,physicalJob.prompt);
    assert.match(job.prompt,/transparent rectangular eyeglasses/);
    assert.match(job.prompt,/sparse salt-and-pepper stubble/);
    assert.match(job.prompt,/same clothing, background and daylight/);
    assert.match(job.negativePrompt,/changing lighting/);
    assert.equal(job.referenceSha256,physicalJob.referenceSha256);
    assert.equal(job.audioSha256,physicalJob.audioSha256);
    assert.match(job.negativePrompt,/identity change/);assert.doesNotMatch(job.negativePrompt,/smooth plastic skin/);
    assert.equal(job.effectiveRuntimeConfig.seed,42);assert.equal(job.effectiveRuntimeConfig.steps,8);assert.equal(job.effectiveRuntimeConfig.scheduler,"lcm");
    assert.equal(job.effectiveRuntimeConfig.referencePreprocessing.preserveAspectRatio,true);
    assert.equal(job.effectiveRuntimeConfig.prompt,job.prompt);assert.equal(job.effectiveRuntimeConfig.negativePrompt,job.negativePrompt);
    assert.equal(job.strategy.compileEnabled,false);
    const bridgeSource=fs.readFileSync(path.resolve("jarvis-fs-bridge.js"),"utf8");
    assert.match(bridgeSource,/humo17-heberto-quality-probe-201f\.mp4.*humo17-heberto-quality-ab-prompt-parity-201f\.mp4/);
    assert.match(bridgeSource,/HUMO17_QUALITY_OUTPUT_NOT_PINNED/);
});


test("HuMo17 201-frame quality contract survives V142 materialization twice", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "humo17-materializer-"));
    const files = ["jarvis-local-video-engine.js", "jarvis-fs-bridge.js", "jarvis-artifact-studio.js",
        "tests/jarvis-local-video-engine-v142.test.mjs", "tests/jarvis-series-continuity-v142.test.mjs", "tests/jarvis-fs-bridge-v2.test.mjs"];
    try {
        for (const file of files) {
            const dest = path.join(fixture,file); fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.copyFileSync(path.resolve(file),dest);
        }
        const materializer = path.resolve(".github/scripts/v142-final-contract-alignment.mjs");
        execFileSync(process.execPath,[materializer],{cwd:fixture,timeout:15000,stdio:"pipe"});
        const first = files.map(file=>fs.readFileSync(path.join(fixture,file),"utf8"));
        execFileSync(process.execPath,[materializer],{cwd:fixture,timeout:15000,stdio:"pipe"});
        assert.deepEqual(files.map(file=>fs.readFileSync(path.join(fixture,file),"utf8")),first);
        assert.match(first[0],/qualityProbeGeometry:.*frames: 201, durationSeconds: 8.04/);
        assert.match(first[0],/probeGeometry:.*frames: 97, durationSeconds: 3.88/);
    } finally {fs.rmSync(fixture,{recursive:true,force:true});}
});

test("HuMo17 budget guard denies paid admission and computes conservative deadline", async () => {
    const {assertHuMo17IndependentBudget,huMo17BudgetSeconds,buildHuMo17RemoteWatchdogStartup}=await import("../jarvis-fs-bridge.js");
    assert.throws(()=>assertHuMo17IndependentBudget(),/HUMO17_PAID_EXECUTION_DISABLED/);
    assert.equal(huMo17BudgetSeconds({hardBudgetUsd:.95,hourlyRateUsd:1.10,maximumMinutes:42}),2331);
    for(const value of [NaN,Infinity,0,-1])assert.throws(()=>huMo17BudgetSeconds({hardBudgetUsd:value,hourlyRateUsd:1,maximumMinutes:42}));
    const startup=buildHuMo17RemoteWatchdogStartup({deadlineMs:100000,source:"fixture"}).join("\n");
    assert.match(startup,/nohup setsid python3/);assert.match(startup,/--deadline 100/);
    execFileSync(process.platform==="win32"?"python":"python3",["tests/humo17-budget-watchdog.py"],{timeout:15000,stdio:"pipe"});
});

test('HuMo17 bootstrap blocks payload until live independent evidence and rejects expired deadlines',async()=>{
    const {advanceHuMo17BudgetBootstrap:advance}=await import('../jarvis-fs-bridge.js');
    let r={podId:'fixture',bootstrapState:'POD_CREATED',remoteWatchdogDeadlineMs:200000};
    assert.throws(()=>advance(r,'PAYLOAD_ALLOWED'),/TRANSITION/);
    r=advance(r,'REMOTE_WATCHDOG_INSTALLING',{now:100000});
    assert.throws(()=>advance(r,'PAYLOAD_ALLOWED'),/TRANSITION/);
    r=advance(r,'REMOTE_WATCHDOG_INSTALLED',{now:100000});
    assert.throws(()=>advance(r,'REMOTE_WATCHDOG_VERIFIED',{now:100000}),/EVIDENCE/);
    const watchdog={podId:'fixture',remoteBudgetWatchdogInstalled:true,remoteBudgetWatchdogVerified:true,hostIndependent:true,deadlineEpochSeconds:200};
    for(const patch of [{podId:'other'},{hostIndependent:false},{deadlineEpochSeconds:201},{deadlineEpochSeconds:99}])assert.throws(()=>advance(r,'REMOTE_WATCHDOG_VERIFIED',{watchdog:{...watchdog,...patch},now:100000}),/EVIDENCE/);
    r=advance(r,'REMOTE_WATCHDOG_VERIFIED',{watchdog,now:100000});
    assert.equal(advance(r,'PAYLOAD_ALLOWED',{now:110000}).bootstrapState,'PAYLOAD_ALLOWED');
    assert.throws(()=>advance(r,'PAYLOAD_ALLOWED',{now:200000}),/PAYLOAD_BLOCKED/);
});

test('Runpod live transport blocks REST and GraphQL provisioning before network',async()=>{
    const {guardedRunpodFetch,assertRunpodPaidAdmission}=await import('../jarvis-local-video-engine.js');
    for(const hardCapCertified of [false,undefined,'true'])assert.throws(()=>assertRunpodPaidAdmission({hardCapCertified,paidExecutionAuthorized:true}),/RUNPOD_HARD_CAP_NOT_CERTIFIED/);
    assert.throws(()=>assertRunpodPaidAdmission({hardCapCertified:true,paidExecutionAuthorized:false}),/RUNPOD_PAID_EXECUTION_DISABLED/);
    await assert.rejects(guardedRunpodFetch('https://rest.runpod.io/v1/pods',{method:'POST',body:'{}'}),/RUNPOD_PAID_EXECUTION_DISABLED/);
    await assert.rejects(guardedRunpodFetch('https://api.runpod.io/graphql',{method:'POST',body:JSON.stringify({query:'mutation { podFindAndDeployOnDemand {} }'})}),/RUNPOD_PAID_EXECUTION_DISABLED/);
});

test('HuMo17 CPU certificate has no GPU, volume, payload, account key or local timer',async()=>{
    const {buildCpuWatchdogCertificate}=await import('../scripts/jarvis-humo17-watchdog-certificate.mjs');
    const plan=buildCpuWatchdogCertificate({source:'fixture',createdAtMs:100000,operationId:'watchdog-abcd'});
    assert.equal(plan.body.computeType,'CPU');assert.equal(plan.body.vcpuCount,2);
    assert.equal(plan.maximumPaidRuntimeSeconds,1200);assert.equal(plan.deadlineMs,1300000);assert.equal(plan.body.supportPublicIp,true);
    assert.equal(plan.body.networkVolumeId,undefined);assert.equal(plan.body.gpuTypeIds,undefined);
    assert.deepEqual(plan.body.env,{});assert.equal(plan.body.volumeInGb,0);
    assert.match(plan.body.dockerStartCmd[0],/subprocess.run/);
    assert.deepEqual(buildCpuWatchdogCertificate({source:'fixture',createdAtMs:100000,operationId:'watchdog-abcd',dataCenterId:'EU-RO-1'}).body.dataCenterIds,['EU-RO-1']);
    assert.throws(()=>buildCpuWatchdogCertificate({source:'fixture',createdAtMs:100000,operationId:'watchdog-abcd',dataCenterId:'other'}),/REGION_INVALID/);
});

test('HuMo17 certificate rejects negative, missing or insufficient balance before creation',async()=>{
    const {assertCertificateBalance}=await import('../scripts/jarvis-humo17-watchdog-certificate.mjs');
    for(const v of [undefined,NaN,Infinity,-.0632118055,0,.099999])assert.throws(()=>assertCertificateBalance(v),/CERTIFICATE_/);
    assert.doesNotThrow(()=>assertCertificateBalance(.10));
});

test('HuMo17 startup also reconciles dedicated watchdog certificates and blocks uncertain creates',async()=>{
    const {reconcileHuMo17PaidReceipts}=await import('../jarvis-fs-bridge.js');
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'humo17-watchdog-recovery-'));
    const dir=path.join(root,'.jarvis-artifacts/humo17-quality');fs.mkdirSync(dir,{recursive:true});
    const file=path.join(dir,'watchdog-certificate-5.json');
    try{
        fs.writeFileSync(file,JSON.stringify({status:'CREATE_REQUEST_PENDING',terminationVerified:false}));
        await assert.rejects(reconcileHuMo17PaidReceipts({root,provider:async()=>assert.fail('must block unknown creation')}),/UNCERTAIN_CREATE/);
        fs.writeFileSync(file,JSON.stringify({podId:'fixture',status:'POD_CREATED',terminationVerified:false}));
        const result=await reconcileHuMo17PaidReceipts({root,provider:async(method,url)=>{assert.equal(method,'GET');assert.equal(url,'/pods/fixture');throw Error('RUNPOD_HUMO17_HTTP_404');}});
        assert.equal(result.length,1);assert.equal(JSON.parse(fs.readFileSync(file)).terminationVerified,true);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("HuMo17 recovery deletes only recorded Pods and persists verified absence", async () => {
    const {reconcileHuMo17PaidReceipts}=await import("../jarvis-fs-bridge.js");
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"humo17-recovery-"));
    const dir=path.join(root,".jarvis-artifacts");fs.mkdirSync(dir);
    const file=path.join(dir,"humo17-probe-abcd.json");
    fs.writeFileSync(file,JSON.stringify({operationId:"humo17-probe-abcd",podId:"fixture",terminationVerified:false}));
    const calls=[];let deleted=false;
    try {
        const provider=async(method,url)=>{calls.push([method,url]);if(method==="DELETE"){deleted=true;return null;}if(deleted)throw Error("RUNPOD_HUMO17_HTTP_404");return {id:"fixture",desiredStatus:"RUNNING"};};
        const result=await reconcileHuMo17PaidReceipts({root,provider,wait:async()=>{}});
        assert.equal(result[0].terminationVerified,true);assert.equal(JSON.parse(fs.readFileSync(file)).terminationVerified,true);
        assert.deepEqual(calls,[["GET","/pods/fixture"],["DELETE","/pods/fixture"],["GET","/pods/fixture"]]);
        assert.deepEqual(await reconcileHuMo17PaidReceipts({root,provider}),[]);
        fs.writeFileSync(file,JSON.stringify({podId:"fixture",terminationVerified:false}));
        await assert.rejects(reconcileHuMo17PaidReceipts({root,provider:async()=>{throw Error("offline");}}),/offline/);
        assert.equal(JSON.parse(fs.readFileSync(file)).terminationVerified,false);
        fs.renameSync(file,file+".pending");
        await reconcileHuMo17PaidReceipts({root,provider:async()=>{throw Error("RUNPOD_HUMO17_HTTP_404");}});
        assert.equal(JSON.parse(fs.readFileSync(file)).terminationVerified,true);assert.equal(fs.existsSync(file+".pending"),false);
    } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test("SIA7 reconciles before GitHub and honors backoff while recovery transport fails", async () => {
    const {createWorkerPoller}=await import("../jarvis-github-worker.js");
    const calls=[];let fail=true,clock=0;
    const poll=createWorkerPoller({
        reconcile:async()=>{calls.push("recover");if(fail)throw Error("offline");},
        readJob:async()=>{calls.push("read");return null;},
        readResultId:async()=>"",
        reportError:()=>{},
        now:()=>clock
    });
    await poll();
    assert.deepEqual(calls,["recover"]);
    fail=false;
    await poll();
    assert.deepEqual(calls,["recover","recover"]);
    clock=15000;
    await poll();
    assert.deepEqual(calls,["recover","recover","recover","read"]);
});

test("SIA7 early Pod receipt preserves budget and GPU identity without provider secrets", async () => {
    const {buildHuMo17EarlyReceipt}=await import("../jarvis-github-worker.js");
    const r=buildHuMo17EarlyReceipt("job",{podId:"fixture",status:"HUMO17_RUNTIME_GPU_POD_CREATED",gpu:"NVIDIA L40S",gpuCount:1,hardBudgetUsd:.95,providerBudgetKillSeconds:2331,terminationVerified:false,env:{RUNPOD_API_KEY:"secret"}});
    assert.equal(r.podId,"fixture");assert.equal(r.providerBudgetKillSeconds,2331);assert.equal(r.gpuCount,1);assert.equal(r.terminationVerified,false);
    assert.ok(!JSON.stringify(r).includes("secret"));assert.throws(()=>buildHuMo17EarlyReceipt("job",{podId:"../bad"}));
});


test('HuMo17 quality authority binds exact media, budget and HEAD and is consumed once',async()=>{
    const {validateHuMo17QualityAuthority,consumeHuMo17QualityAuthority,assertHuMo17IndependentBudget}=await import('../jarvis-fs-bridge.js');
    const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
    const a={schema:'jarvis.v142.quality-single-use.1',humanApproved:true,maximumAttempts:1,nonce:'12345678-1234-1234-1234-123456789abc',jobId:'quality-one',codeSha:'a'.repeat(40),expiresAt:new Date(Date.now()+60000).toISOString(),backend:'humo-17b-identity',gpu:'NVIDIA L40S',gpuCount:1,networkVolumeId:'1qm5wczocl',dataCenterId:'EU-NL-1',fullEpisodeAuthorized:false,hardBudgetUsd:1.5,safetyRatio:.75,referenceSha256:'a3151d2eefde02659f80deb64277a68ac55f3cfebb5fcb68019d6eb05678e958',audioSha256:'bff307fcaf47717bf1e4e5cf30c4072faa009158e195ea599baae614128d8184',output:'.jarvis-artifacts/videos/humo17-heberto-quality-probe-201f.mp4',frames:201,fps:25,width:832,height:480};
    const c={...a,qualityProbe:true,speechValidated:true};assert.equal(assertHuMo17IndependentBudget({authority:a,context:c}),a);
    const abOutput='.jarvis-artifacts/videos/humo17-heberto-quality-ab-prompt-parity-201f.mp4';
    assert.equal(validateHuMo17QualityAuthority({...a,output:abOutput},{...c,output:abOutput}).output,abOutput);
    const bridgeSource=fs.readFileSync(path.resolve('jarvis-fs-bridge.js'),'utf8');
    for(const marker of ['JARVIS_HUMO17_SINGLE_USE_AUTHORITY_FILE','JARVIS_HUMO17_CERTIFIED_CODE_SHA','control.paidJobId','HUMO17_QUALITY_CONTROL_UNCERTIFIED_CODE'])assert.equal(bridgeSource.includes(marker),true);
    for(const patch of [{humanApproved:false},{maximumAttempts:2},{gpu:'NVIDIA A40'},{gpuCount:2},{frames:97},{hardBudgetUsd:1},{audioSha256:'b'.repeat(64)},{codeSha:'b'.repeat(40)},{fullEpisodeAuthorized:true},{expiresAt:'2000-01-01'}])assert.throws(()=>validateHuMo17QualityAuthority({...a,...patch},c),/SINGLE_USE_AUTHORITY_INVALID/);
    for(const patch of [{qualityProbe:false},{speechValidated:false},{output:'other.mp4'},{jobId:'old-job'},{hardBudgetUsd:3}])assert.throws(()=>validateHuMo17QualityAuthority(a,{...c,...patch}),/SINGLE_USE_AUTHORITY_INVALID/);
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'humo17-once-'));try {
        const file=consumeHuMo17QualityAuthority({root,authority:a,context:c,operationId:'first'});
        assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).operationId,'first');
        assert.throws(()=>consumeHuMo17QualityAuthority({root,authority:a,context:c,operationId:'retry'}),/PAID_REPLAY_BLOCKED/);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
    assert.throws(()=>assertHuMo17IndependentBudget(),/PAID_EXECUTION_DISABLED/);
});


test("filesystem bridge exposes the governed workstation command surface", () => {
    const source = fs.readFileSync(
        new URL("../jarvis-fs-bridge.js", import.meta.url),
        "utf8"
    );
    for (const command of [
        "npm run check:syntax",
        "npm run check:entry-syntax",
        "npm run test:multifunction",
        "npm run test:mcp",
        "npm run test:b2c-platform",
        "npm run test:b2c-emulators",
        "npm run test:b2c-forensic",
        "npm run test:b2c-forensic-emulators",
        "npm run test:platform-hardening",
        "npm run bridge:smoke",
        "npm run bridge:ensure",
        "npm run bridge:doctor",
        "npm run workstation",
        "npm run smoke:release",
        "npm run ci:test"
    ]) {
        assert.equal(source.includes(command), true, command);
    }
    assert.equal(source.includes("COMMAND_NOT_ALLOWED"), true);
});

test("filesystem bridge startup binds only IPv4 loopback", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-fs-bind-"));
    const server = startJarvisFsBridge({ port: 0, root });
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


test("SIA7 patch consumes existing exact bridge authorization and rejects legacy boolean/replay", async () => {
    const { executePatchJob } = await import("../jarvis-github-worker.js");
    const fixture = createBridgeIdentityFixture({ branch: "v5.9-polish" });
    const root = fixture.root;
    fs.writeFileSync(path.join(root, "fixture.txt"), "before before");
    const server = createJarvisFsBridgeApp({ root }).listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async (route, body) => (await fetch(base + route, { method: "POST", headers: { "content-type": "application/json", "x-jarvis-release-id": "test-release" }, body: JSON.stringify(body) })).json();
    let requests = 0;
    const fetchImpl = async (_url, options) => { requests++; return fetch(base + "/write", options); };
    const patch = { file: "fixture.txt", search: "before", replace: "after", expectedMatches: 2 };
    try {
        const preview = await executePatchJob({ patch: { ...patch, dryRun: true } }, { root, fetchImpl });
        assert.equal(preview.matchCount, 2);
        assert.match(preview.sha256Before, /^[a-f0-9]{64}$/);
        await assert.rejects(executePatchJob({ humanApproved: true, patch }, { root, fetchImpl }), /ONE_TIME_AUTHORIZATION_REQUIRED/);
        assert.equal(requests, 0);
        assert.equal(fs.readFileSync(path.join(root, "fixture.txt"), "utf8"), "before before");
        const prepared = await post("/write/prepare", { objectiveId: "fixture", caseId: "fixture", authorityId: "HEBERTO_MENDOZA", controllerId: "CODEX_SIA7", ...patch, matchCount: 2 });
        assert.equal(prepared.ok, true, JSON.stringify(prepared));
        const authorization = { ...prepared };
        await assert.rejects(executePatchJob({ patch: { ...patch, authorization: { ...authorization, expectedSha256: "0".repeat(64) } } }, { root, fetchImpl }), /PATCH_AUTHORIZED_SNAPSHOT_MISMATCH/);
        assert.equal(requests, 0);
        await post("/write/authorize", { ...prepared, approvedBy: "HEBERTO_MENDOZA", approvalCommand: `AUTORIZO ${prepared.fingerprint}` });
        const wrong = await post("/write", { ...authorization, file: "other.txt" });
        assert.equal(wrong.error, "WRITE_AUTHORIZATION_PAYLOAD_MISMATCH");
        const result = await executePatchJob({ patch: { ...patch, authorization } }, { root, fetchImpl });
        assert.equal(result.receipt.verified, true);
        assert.equal(fs.readFileSync(path.join(root, "fixture.txt"), "utf8"), "after after");
        const replay = await post("/write", authorization);
        assert.equal(replay.error, "WRITE_AUTHORIZATION_NOT_FOUND_OR_CONSUMED");
        await assert.rejects(executePatchJob({ patch: { ...patch, file: "../outside", dryRun: true } }, { root, fetchImpl }), /PATH_OUTSIDE_REPO/);
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    }
});

test("SIA7 patch refuses symlink traversal before reading or requesting authority", async () => {
    const { executePatchJob } = await import("../jarvis-github-worker.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sia7-symlink-root-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sia7-symlink-outside-"));
    fs.writeFileSync(path.join(outside, "fixture.txt"), "before");
    try {
        fs.symlinkSync(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
        await assert.rejects(executePatchJob({ patch: { file: "linked/fixture.txt", search: "before", replace: "after", dryRun: true } }, { root }), /SYMLINK_WRITE_BLOCKED/);
        assert.equal(fs.readFileSync(path.join(outside, "fixture.txt"), "utf8"), "before");
    } finally {
        fs.rmSync(path.join(root, "linked"), { recursive: true, force: true });
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
    }
});
