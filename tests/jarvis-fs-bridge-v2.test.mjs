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
    execFileSync("git", ["init", "--bare", remoteRoot], {
        stdio: "ignore"
    });
    execFileSync("git", ["init", "-b", branch], {
        cwd: root,
        stdio: "ignore"
    });
    const runGit = args => execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    runGit(["config", "user.email", "jarvis-identity@example.invalid"]);
    runGit(["config", "user.name", "Jarvis Identity Test"]);
    const canonicalRemote = `https://github.com/${repository}.git`;
    runGit(["remote", "add", "origin", canonicalRemote]);
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
    assert.equal(plan.provider, "self-hosted-openai-compatible");
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
            JARVIS_SEMANTIC_PROVIDER_MODE: "LOCAL_PREFERRED",
            JARVIS_LOCAL_LLM_BASE_URL: "https://gpu.example.test/v1",
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
    assert.equal(health.status, "LOCAL_SEMANTIC_ENDPOINT_MUST_BE_LOOPBACK_OR_HTTPS");
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
            "git",
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
    assert.equal(bridgeSource.includes('env.JARVIS_RUNPOD_DATACENTER_ID || "EU-NL-1"'), false);
    assert.equal(bridgeSource.includes('env.JARVIS_RUNPOD_DATACENTER_ID || ""'), true);
    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_GPU_TYPE_ID: "NVIDIA L40S"'), true);
    assert.equal(bridgeSource.includes('JARVIS_RUNPOD_CLOUD_TYPE: "SECURE"'), true);
});
