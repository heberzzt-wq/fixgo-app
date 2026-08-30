import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
    buildLocalSeriesShotPlan,
    buildSeriesNarrationText,
    parseTimestampedVideoTimeline,
    registerJarvisActuatorTools
} from "../gestia-core/jarvis/jarvis.actuator.pack.js";

function createRuntime() {
    const registry = new Map();
    return {
        register(tool) {
            registry.set(tool.name, tool);
            return { ok: true, tool: tool.name };
        },
        has: name => registry.has(name),
        get: name => registry.get(name),
        list: () => [...registry.values()],
        async execute(name, args = {}, context = {}) {
            const tool = registry.get(name);
            if (!tool) return { ok: false, error: "TOOL_NOT_FOUND" };
            return { ok: true, data: await tool.execute(args, context) };
        }
    };
}

const THREE_MINUTE_EPISODE_SCRIPT = `0:00-0:10 HOOK
Roldan acusa el muro. Heberto responde.

0:10-0:40 COMPETENCIA
Heberto trabaja con precision y guarda la foto de su nieta.

0:40-1:10 ROLDAN EXPUESTO
Roldan mide el muro y comprueba que esta a plomo.

1:10-1:40 HUMILLACION
Roldan cambia del debate tecnico al ataque de clase.

1:40-2:05 CAFE Y BOTAS
Roldan derrama cafe y ensucia sus botas de caiman.

2:05-2:30 LA ORDEN
Roldan ordena limpiarlas y Heberto se niega.

2:30-2:48 ESCALADA
Heberto conserva el autocontrol y responde con un consejo.

2:48-3:00 CLIFFHANGER
Vibra el telefono cifrado, Heberto apaga la pantalla y corte a negro.`;

test("the canonical three-minute timeline expands to 36 distinct physical Wan shots", () => {
    const timeline = parseTimestampedVideoTimeline(THREE_MINUTE_EPISODE_SCRIPT);
    const shots = buildLocalSeriesShotPlan(timeline);
    assert.equal(timeline.length, 8);
    assert.equal(timeline.at(-1).endSeconds, 180);
    assert.equal(shots.length, 36);
    assert.equal(shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 180);
    assert.deepEqual([...new Set(shots.map(shot => shot.shotId))].length, 36);
    assert.ok(shots.every(shot => shot.durationSeconds > 0 && shot.durationSeconds <= 5));
    assert.match(buildSeriesNarrationText(timeline), /Roldan acusa el muro/);
});

test("cloud video adapter maps verified identity references to Veo assets and keeps extensions video-only", () => {
    const source = readFileSync(
        new URL("../functions/secure-entry-alias.js", import.meta.url),
        "utf8"
    );

    assert.match(source, /function normalizeVideoReferenceImages\(/);
    assert.match(source, /referenceType:\s*"ASSET"/);
    assert.match(source, /referenceImages:\s*referenceImages\.map\(/);
    assert.match(source, /VIDEO_REFERENCE_IMAGES_UNSUPPORTED_FOR_EXTENSION/);
    assert.match(source, /const JARVIS_VEO_MODEL = "veo-3\.1-generate-001"/);
});

test("actuator pack registers browser, documents, image, delegation and connectors", () => {
    const runtime = createRuntime();
    const result = registerJarvisActuatorTools(runtime);
    const names = runtime.list().map(tool => tool.name);

    assert.equal(result.ok, true);
    assert.deepEqual(names, [
        "system.supervision.runNow",
        "browser.inspect",
        "browser.screenshot",
        "browser.open",
        "system.observability",
        "page.create",
        "speech.synthesize",
        "reel.create",
        "document.create",
        "document.pdf",
        "document.pdf.edit",
        "document.xlsx.edit",
        "document.docx.edit",
        "document.pptx.edit",
        "series.create",
        "series.character.upsert",
        "series.episode.prepare",
        "series.episode.accept",
        "series.resume",
        "video.generate",
        "image.generate",
        "image.edit",
        "image.adapt",
        "artifact.createJson",
        "artifact.list",
        "artifact.read",
        "agent.delegate",
        "connector.list"
    ]);
    assert.equal(runtime.get("browser.inspect").mutates, false);
    assert.equal(runtime.get("system.supervision.runNow").requiresApproval, true);
    assert.equal(runtime.get("system.observability").mutates, false);
    assert.equal(runtime.get("browser.screenshot").requiresApproval, true);
    assert.equal(runtime.get("page.create").requiresApproval, false);
    assert.equal(runtime.get("page.create").userArtifact, true);
    assert.equal(runtime.get("speech.synthesize").requiresApproval, false);
    assert.equal(runtime.get("speech.synthesize").userArtifact, true);
    assert.equal(runtime.get("reel.create").requiresApproval, false);
    assert.equal(runtime.get("reel.create").userArtifact, true);
    assert.equal(runtime.get("document.create").requiresApproval, false);
    assert.equal(runtime.get("document.create").userArtifact, true);
    assert.equal(runtime.get("image.generate").requiresApproval, false);
    assert.equal(runtime.get("image.generate").userArtifact, true);
    assert.equal(runtime.get("video.generate").requiresApproval, false);
    assert.equal(runtime.get("video.generate").userArtifact, true);
    assert.equal(runtime.get("series.character.upsert").requiresApproval, true);
    assert.equal(runtime.get("series.episode.accept").requiresApproval, true);
    assert.equal(runtime.get("series.resume").mutates, false);
    assert.equal(
        runtime.get("video.generate").inputSchema.referenceOutputs,
        "array"
    );
    assert.equal(runtime.get("document.pdf.edit").requiresApproval, false);
    assert.equal(runtime.get("document.pdf.edit").userArtifact, true);
    assert.deepEqual(
        runtime.get("document.pdf.edit").missionDedupeBy,
        ["sourceOutput", "output"]
    );
    assert.equal(
        runtime.get("document.pdf.edit").inputSchema.safePlacement,
        "boolean"
    );
    assert.equal(runtime.get("document.xlsx.edit").requiresApproval, false);
    assert.equal(runtime.get("document.xlsx.edit").userArtifact, true);
    assert.equal(runtime.get("document.docx.edit").requiresApproval, true);
    assert.equal(runtime.get("document.pptx.edit").requiresApproval, true);
    assert.equal(runtime.get("image.edit").requiresApproval, false);
    assert.equal(runtime.get("image.edit").userArtifact, true);
    assert.deepEqual(
        runtime.get("image.edit").missionDedupeBy,
        [
            "sourceOutput",
            "variantId"
        ]
    );
    assert.equal(
        runtime.get("image.edit").inputSchema.referenceOutputs,
        "array"
    );
    assert.equal(
        runtime.get("image.edit").inputSchema.ageMode,
        "string"
    );
    assert.equal(runtime.get("image.adapt").requiresApproval, true);
    assert.equal(runtime.get("artifact.createJson").requiresApproval, true);
    assert.equal(runtime.get("artifact.list").mutates, false);
    assert.equal(runtime.get("artifact.read").mutates, false);
    assert.deepEqual(
        runtime.get("agent.delegate")
            .inputSchema
            .required,
        [
            "tasks",
            "delegationDirective"
        ]
    );
    assert.equal(
        runtime.get("agent.delegate")
            .inputSchema
            .properties
            .delegationDirective
            .type,
        "string"
    );
    assert.equal(
        runtime.get("agent.delegate")
            .inputSchema
            .properties
            .tasks
            .minItems,
        1
    );
    assert.deepEqual(
        runtime.get("agent.delegate")
            .inputSchema
            .properties
            .tasks
            .items
            .required,
        [
            "tool"
        ]
    );
});

test("agent delegation runs only read-only tools and rejects recursive delegation", async () => {
    const runtime = createRuntime();
    runtime.register({
        name: "system.echo",
        mutates: false,
        execute: async args => ({ ok: true, value: args.value })
    });
    runtime.register({
        name: "repo.write",
        mutates: true,
        execute: async () => ({ ok: true })
    });
    registerJarvisActuatorTools(runtime);

    const execution = await runtime.get("agent.delegate").execute({
        delegationDirective:
            "delega en paralelo",
        tasks: [
            { tool: "system.echo", args: { value: 7 } },
            { tool: "repo.write", args: {} },
            { tool: "agent.delegate", args: {} }
        ]
    }, {
        rawInput:
            "Jarvis, delega en paralelo estas verificaciones"
    });

    assert.equal(execution.ok, true);
    assert.equal(execution.parallel, true);
    assert.equal(execution.taskCount, 1);
    assert.equal(execution.results[0].data.value, 7);

    const rejected = await runtime.get("agent.delegate").execute({
        delegationDirective:
            "delega tareas",
        tasks: [{
            tool:
                "system.echo",
            args: {
                value:
                    8
            }
        }]
    }, {
        rawInput:
            "consulta directamente la salud"
    });
    assert.equal(
        rejected.status,
        "DELEGATION_EXPLICIT_DIRECTIVE_REQUIRED"
    );
});

test("browser actuator fails closed when the verified local bridge is absent", async () => {
    const previous = globalThis.JarvisLocalBridge;
    delete globalThis.JarvisLocalBridge;
    try {
        const runtime = createRuntime();
        registerJarvisActuatorTools(runtime);
        const result = await runtime.get("browser.inspect").execute({
            url: "https://example.com"
        });
        assert.equal(result.ok, false);
        assert.equal(result.status, "LOCAL_BRIDGE_REQUIRED");
    }
    finally {
        globalThis.JarvisLocalBridge = previous;
    }
});

test("connector list reports verified bridge connectors", async () => {
    const previous = globalThis.JarvisLocalBridge;
    globalThis.JarvisLocalBridge = {
        requestJson: async path => ({
            ok: path === "/connectors",
            status: "CONNECTORS_VERIFIED",
            connectedCount: 2,
            connectors: [
                { id: "github", connected: true, capabilities: ["repository.remote"] },
                { id: "firebase", connected: true, capabilities: ["hosting.inspect"] }
            ]
        })
    };

    try {
        const runtime = createRuntime();
        registerJarvisActuatorTools(runtime);
        const result = await runtime.get("connector.list").execute();

        assert.equal(result.ok, true);
        assert.equal(result.verified, true);
        assert.equal(result.connectedCount, 2);
        assert.equal(globalThis.__JARVIS_CONNECTOR_HEALTH__.status, "CONNECTORS_VERIFIED");
    } finally {
        globalThis.JarvisLocalBridge = previous;
        delete globalThis.__JARVIS_CONNECTOR_HEALTH__;
    }
});


test("image edit composes identity references once and reports the generated output hash", async () => {
    const previousAuth =
        globalThis.auth;

    const previousFetch =
        globalThis.fetch;

    const previousBridge =
        globalThis.JarvisLocalBridge;

    const previousBitmap =
        globalThis.createImageBitmap;

    const PreviousCanvas =
        globalThis.OffscreenCanvas;

    const primaryBytes =
        Buffer.from(
            "primary-current-selfie"
        );

    const secondaryBytes =
        Buffer.from(
            "secondary-old-reference"
        );

    const generatedBytes =
        Buffer.from(
            "generated-edited-output"
        );

    const primaryBase64 =
        primaryBytes.toString(
            "base64"
        );

    const secondaryBase64 =
        secondaryBytes.toString(
            "base64"
        );

    const generatedBase64 =
        generatedBytes.toString(
            "base64"
        );

    const primarySha256 =
        createHash(
            "sha256"
        )
            .update(
                primaryBytes
            )
            .digest(
                "hex"
            );

    const secondarySha256 =
        createHash(
            "sha256"
        )
            .update(
                secondaryBytes
            )
            .digest(
                "hex"
            );

    const expectedOutputSha256 =
        createHash(
            "sha256"
        )
            .update(
                generatedBytes
            )
            .digest(
                "hex"
            );

    let imageSaveCalls =
        0;

    let functionPayload =
        null;

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken:
                    async () =>
                        "test-token"
            }
        };

        globalThis.createImageBitmap =
            async () => ({
                width:
                    1200,
                height:
                    1600,
                close() {}
            });

        globalThis.OffscreenCanvas =
            class {
                constructor(
                    width,
                    height
                ) {
                    this.width =
                        width;

                    this.height =
                        height;
                }

                getContext() {
                    return {
                        drawImage() {},
                        fillRect() {},
                        fillStyle:
                            "#ffffff"
                    };
                }

                async convertToBlob(
                    {
                        type
                    }
                ) {
                    return new Blob(
                        [
                            "identity-reference-sheet"
                        ],
                        {
                            type
                        }
                    );
                }
            };

        globalThis.fetch =
            async (
                _url,
                options = {}
            ) => {
                functionPayload =
                    JSON.parse(
                        options.body
                    )
                        .data;

                const providerSourceSha256 =
                    createHash(
                        "sha256"
                    )
                        .update(
                            Buffer.from(
                                functionPayload
                                    .sourceImageBase64,
                                "base64"
                            )
                        )
                        .digest(
                            "hex"
                        );

                return {
                    ok:
                        true,
                    status:
                        200,
                    text:
                        async () =>
                            JSON.stringify({
                                result: {
                                    ok:
                                        true,
                                    status:
                                        "IMAGE_EDITED",
                                    action:
                                        "edit",
                                    provider:
                                        "google",
                                    model:
                                        "test-image-model",
                                    mimeType:
                                        "image/png",
                                    sourceSha256:
                                        providerSourceSha256,
                                    transformations:
                                        functionPayload
                                            .transformations,
                                    imageBase64:
                                        generatedBase64
                                }
                            })
                };
            };

        globalThis.JarvisLocalBridge = {
            requestJson:
                async (
                    path,
                    payload
                ) => {
                    if (
                        path ===
                        "/artifact/read"
                    ) {
                        if (
                            payload.output ===
                            ".jarvis-artifacts/uploads/current.jpg"
                        ) {
                            return {
                                ok:
                                    true,
                                output:
                                    payload.output,
                                mimeType:
                                    "image/jpeg",
                                bytes:
                                    primaryBytes.length,
                                sha256:
                                    primarySha256,
                                dataBase64:
                                    primaryBase64
                            };
                        }

                        return {
                            ok:
                                true,
                            output:
                                payload.output,
                            mimeType:
                                "image/jpeg",
                            bytes:
                                secondaryBytes.length,
                            sha256:
                                secondarySha256,
                            dataBase64:
                                secondaryBase64
                        };
                    }

                    if (
                        path ===
                        "/image"
                    ) {
                        imageSaveCalls +=
                            1;

                        return {
                            ok:
                                true,
                            status:
                                "IMAGE_SAVED",
                            output:
                                ".jarvis-artifacts/images/identity-result.png",
                            bytes:
                                generatedBytes.length,
                            mimeType:
                                "image/png"
                        };
                    }

                    return {
                        ok:
                            false,
                        status:
                            "UNEXPECTED_BRIDGE_PATH"
                    };
                }
        };

        const runtime =
            createRuntime();

        registerJarvisActuatorTools(
            runtime
        );

        const result =
            await runtime
                .get(
                    "image.edit"
                )
                .execute(
                    {
                        sourceOutput:
                            ".jarvis-artifacts/uploads/current.jpg",
                        referenceOutputs: [
                            ".jarvis-artifacts/uploads/current.jpg",
                            ".jarvis-artifacts/uploads/old.jpg"
                        ],
                        variantId:
                            "PRIMARY",
                        ageMode:
                            "preserve",
                        prompt:
                            "Retrato profesional actual en la playa",
                        transformations:
                            [],
                        output:
                            ".jarvis-artifacts/images/identity-result.png"
                    },
                    {
                        objectiveId:
                            "OBJ_TEST",
                        caseId:
                            "CASE_TEST"
                    }
                );

        assert.equal(
            result.ok,
            true
        );

        assert.equal(
            result.persisted,
            true
        );

        assert.equal(
            result.referenceGrounded,
            true
        );

        assert.equal(
            result.referenceCount,
            2
        );

        assert.equal(
            result.identityReferenceComposite,
            true
        );

        assert.equal(
            result.sourceSha256,
            primarySha256
        );

        assert.equal(
            result.outputSha256,
            expectedOutputSha256
        );

        assert.notEqual(
            result.outputSha256,
            result.sourceSha256
        );

        assert.equal(
            imageSaveCalls,
            1
        );

        assert.notEqual(
            functionPayload
                .sourceImageBase64,
            primaryBase64
        );

        assert.match(
            functionPayload
                .prompt,
            /panel grande contiene la referencia principal/
        );

        assert.match(
            functionPayload
                .prompt,
            /sin agregar signos de mayor edad/
        );
    }
    finally {
        globalThis.auth =
            previousAuth;

        globalThis.fetch =
            previousFetch;

        globalThis.JarvisLocalBridge =
            previousBridge;

        globalThis.createImageBitmap =
            previousBitmap;

        globalThis.OffscreenCanvas =
            PreviousCanvas;
    }
});


test("document.create rejects an unresolved marketing.plan source before bridge write", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const previousBridge = globalThis.JarvisLocalBridge;
    let bridgeCalls = 0;
    globalThis.JarvisLocalBridge = {
        async requestJson() {
            bridgeCalls += 1;
            return { ok: true, status: "DOCUMENT_ARTIFACT_CREATED_VERIFIED", output: ".jarvis-artifacts/documents/plan.pdf" };
        }
    };

    try {
        const blocked = await runtime.execute(
            "document.create",
            { format: "pdf", contentSource: "marketing.plan", title: "Plan" },
            {}
        );
        assert.equal(blocked.data.ok, false);
        assert.equal(blocked.data.status, "MARKETING_DOCUMENT_SOURCE_UNAVAILABLE");
        assert.equal(blocked.data.error, "MARKETING_PLAN_CONTENT_REQUIRED");
        assert.equal(bridgeCalls, 0);

        const created = await runtime.execute(
            "document.create",
            { format: "pdf", contentSource: "marketing.plan", title: "Plan", content: "# Plan verificado\nContenido real." },
            {}
        );
        assert.equal(created.data.ok, true);
        assert.equal(bridgeCalls, 1);
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("video generation sends three verified identity references only to the initial Veo segment", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const previousBridge = globalThis.JarvisLocalBridge;
    const references = ["front", "profile", "expression"].map(name => {
        const bytes = Buffer.from(`verified-${name}-identity-reference`);
        return {
            output: `.jarvis-artifacts/uploads/${name}.jpg`,
            dataBase64: bytes.toString("base64"),
            sha256: createHash("sha256").update(bytes).digest("hex")
        };
    });
    const functionCalls = [];
    const authorizationCalls = [];

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken: async () => "video-reference-token"
            }
        };
        globalThis.fetch = async (_url, options = {}) => {
            const data = JSON.parse(options.body).data;
            functionCalls.push(data);
            let result;
            if (data.action === "start" && !data.previousVideo) {
                result = { ok: true, operationName: "operations/initial-reference-video" };
            } else if (data.action === "poll" && data.operationName.includes("initial")) {
                result = {
                    ok: true,
                    done: true,
                    video: { uri: "gs://fixgo-44e4d.firebasestorage.app/jarvis-video-temp/test/initial.mp4", mimeType: "video/mp4" }
                };
            } else if (data.action === "start" && data.previousVideo) {
                result = { ok: true, operationName: "operations/extended-reference-video" };
            } else if (data.action === "poll" && data.operationName.includes("extended")) {
                result = {
                    ok: true,
                    done: true,
                    downloadUrl: "https://firebasestorage.googleapis.com/v0/b/fixgo-44e4d.firebasestorage.app/o/video.mp4?alt=media&token=test",
                    storageObject: "jarvis-video-temp/test/final.mp4",
                    sha256: "a".repeat(64),
                    provider: "google-veo-vertex",
                    model: "veo-3.1-generate-001"
                };
            } else if (data.action === "cleanup") {
                result = { ok: true, status: "VIDEO_TEMP_CLEANED" };
            } else {
                throw new Error(`Unexpected video function call: ${JSON.stringify(data)}`);
            }
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ result })
            };
        };
        globalThis.JarvisLocalBridge = {
            async requestJson(path, payload) {
                if (path === "/video/engine/resolve") {
                    return {
                        ok: true,
                        policy: "CURRENT_STABLE",
                        engineRequested: "CURRENT_STABLE",
                        engineUsed: "external",
                        fallbackUsed: false
                    };
                }
                if (path === "/video/engine/authorize-external") {
                    authorizationCalls.push(payload);
                    return {
                        ok: true,
                        status: "EXTERNAL_VIDEO_OBLIGATION_AUTHORIZED",
                        model: "veo-3.1-generate-001",
                        pricingSource: "https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing",
                        segmentCount: 2,
                        plannedDurationSeconds: 15,
                        externalEstimatedCostUsd: 6
                    };
                }
                if (path === "/artifact/read") {
                    const reference = references.find(item => item.output === payload.output);
                    return reference
                        ? {
                            ok: true,
                            output: reference.output,
                            mimeType: "image/jpeg",
                            dataBase64: reference.dataBase64,
                            sha256: reference.sha256
                        }
                        : { ok: false };
                }
                if (path === "/video/import") {
                    return {
                        ok: true,
                        status: "VIDEO_IMPORTED_VERIFIED",
                        output: payload.output,
                        bytes: 120000,
                        sha256: payload.expectedSha256,
                        physicallyWritten: true
                    };
                }
                throw new Error(`Unexpected bridge path: ${path}`);
            }
        };

        const result = await runtime.get("video.generate").execute({
            script: "A cinematic protagonist enters the room and continues the scene.",
            scenes: [
                { prompt: "The protagonist enters the room." },
                { prompt: "The same protagonist continues toward the window." }
            ],
            referenceOutputs: references.map(item => item.output),
            output: ".jarvis-artifacts/videos/identity-mini-drama.mp4"
        }, {
            waitForVideoPoll: async () => {}
        });

        assert.equal(result.ok, true);
        assert.equal(result.physicallyWritten, true);
        assert.equal(result.externalEstimatedCostUsd, 6);
        assert.equal(authorizationCalls.length, 1);
        assert.equal(authorizationCalls[0].segmentCount, 2);
        assert.equal(authorizationCalls[0].model, "veo-3.1-generate-001");
        assert.equal(result.referenceImageCount, 3);
        assert.equal(result.referenceArtifactsVerified, true);
        assert.equal(result.identityFidelityVerified, false);
        assert.equal(result.creativeAcceptanceRequired, true);
        assert.equal(result.creativeAcceptanceStatus, "PENDING_HUMAN_REVIEW");
        assert.equal(
            result.identityContinuityMode,
            "initial_reference_guidance_then_previous_video"
        );
        const starts = functionCalls.filter(call => call.action === "start");
        assert.equal(starts.length, 2);
        assert.equal(starts[0].referenceImages.length, 3);
        assert.deepEqual(
            starts[0].referenceImages.map(item => item.mimeType),
            ["image/jpeg", "image/jpeg", "image/jpeg"]
        );
        assert.equal(Object.hasOwn(starts[0], "previousVideo"), true);
        assert.equal(starts[0].previousVideo, null);
        assert.match(starts[0].prompt, /persona mostrada en las referencias es el protagonista/i);
        assert.match(starts[0].prompt, /no transfieras sus acciones, dialogo ni objetos/i);
        assert.equal(Object.hasOwn(starts[1], "referenceImages"), false);
        assert.equal(starts[1].previousVideo.uri.includes("initial.mp4"), true);
        assert.match(starts[1].prompt, /no intercambies roles ni personajes/i);
    }
    finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
        globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("video generation rejects six requested scenes before silently truncating or spending", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const previousFetch = globalThis.fetch;
    const previousBridge = globalThis.JarvisLocalBridge;
    let cloudCalls = 0;
    let engineCalls = 0;

    try {
        globalThis.fetch = async () => {
            cloudCalls += 1;
            throw new Error("VIDEO_PROVIDER_MUST_NOT_START");
        };
        globalThis.JarvisLocalBridge = {
            async requestJson() {
                engineCalls += 1;
                throw new Error("VIDEO_ENGINE_MUST_NOT_RESOLVE");
            }
        };

        const result = await runtime.get("video.generate").execute({
            script: "Capitulo de seis escenas que no puede recortarse.",
            scenes: Array.from({ length: 6 }, (_, index) => ({
                prompt: `Escena ${index + 1}`,
                durationSeconds: 30
            }))
        });

        assert.equal(result.ok, false);
        assert.equal(result.status, "VIDEO_SEGMENT_LIMIT_EXCEEDED:6:4");
        assert.equal(result.error, "VIDEO_SEGMENT_LIMIT_EXCEEDED");
        assert.equal(result.requestedSceneCount, 6);
        assert.equal(result.maximumSceneCount, 4);
        assert.equal(result.maximumGeneratedDurationSeconds, 29);
        assert.equal(result.blocked, true);
        assert.equal(result.requiresInput, true);
        assert.equal(cloudCalls, 0);
        assert.equal(engineCalls, 0);
    }
    finally {
        globalThis.fetch = previousFetch;
        globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("video generation rejects an explicit chapter duration beyond one chained generation", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const previousFetch = globalThis.fetch;
    let cloudCalls = 0;
    try {
        globalThis.fetch = async () => {
            cloudCalls += 1;
            throw new Error("VIDEO_PROVIDER_MUST_NOT_START");
        };
        const result = await runtime.get("video.generate").execute({
            script: "Capitulo largo.",
            durationSeconds: 180,
            scenes: Array.from({ length: 4 }, (_, index) => ({
                prompt: `Unidad ${index + 1}`
            }))
        });

        assert.equal(result.status, "VIDEO_DURATION_LIMIT_EXCEEDED:180:29");
        assert.equal(result.error, "VIDEO_DURATION_LIMIT_EXCEEDED");
        assert.equal(result.requestedDurationSeconds, 180);
        assert.equal(result.maximumGeneratedDurationSeconds, 29);
        assert.equal(result.blocked, true);
        assert.equal(cloudCalls, 0);
    }
    finally {
        globalThis.fetch = previousFetch;
    }
});

test("CURRENT_STABLE fails closed when external cost authorization is unavailable", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const previousBridge = globalThis.JarvisLocalBridge;
    let cloudCalls = 0;
    try {
        globalThis.auth = {
            currentUser: { getIdToken: async () => "cost-guard-token" }
        };
        globalThis.fetch = async () => {
            cloudCalls += 1;
            throw new Error("PAID_PROVIDER_MUST_NOT_START");
        };
        globalThis.JarvisLocalBridge = {
            async requestJson(route) {
                if (route === "/video/engine/resolve") {
                    return {
                        ok: true,
                        policy: "CURRENT_STABLE",
                        engineRequested: "CURRENT_STABLE",
                        engineUsed: "external",
                        fallbackUsed: false
                    };
                }
                if (route === "/video/engine/authorize-external") {
                    throw new Error("BRIDGE_AUTHORIZATION_UNAVAILABLE");
                }
                throw new Error(`Unexpected bridge route: ${route}`);
            }
        };

        const result = await runtime.get("video.generate").execute({
            script: "Do not spend without a verified reservation."
        });

        assert.equal(result.ok, false);
        assert.equal(result.blocked, true);
        assert.equal(result.status, "EXTERNAL_VIDEO_AUTHORIZATION_REQUIRED");
        assert.equal(result.externalApiUsed, false);
        assert.equal(cloudCalls, 0);
    }
    finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
        globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("video generation recovers a transient poll on the same operation without a second start", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const previousBridge = globalThis.JarvisLocalBridge;
    const calls = [];

    try {
        globalThis.auth = {
            currentUser: { getIdToken: async () => "same-operation-token" }
        };
        globalThis.fetch = async (_url, options = {}) => {
            const data = JSON.parse(options.body).data;
            calls.push(data);
            if (data.action === "start") {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        result: {
                            ok: true,
                            status: "VIDEO_GENERATION_STARTED",
                            operationName: "operations/recover-same-operation"
                        }
                    })
                };
            }
            const pollCount = calls.filter(call => call.action === "poll").length;
            if (data.action === "poll" && pollCount === 1) {
                return {
                    ok: false,
                    status: 500,
                    text: async () => JSON.stringify({
                        error: {
                            status: "INTERNAL",
                            message: "VIDEO_GENERATION_POLL_TRANSPORT_FAILED",
                            details: {
                                status: "VIDEO_GENERATION_POLL_TRANSPORT_FAILED",
                                stage: "VIDEO_GENERATION_POLL",
                                providerCode: "UNAVAILABLE",
                                providerMessage: "temporary provider transport failure",
                                retryable: true,
                                operationName: data.operationName
                            }
                        }
                    })
                };
            }
            if (data.action === "poll") {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        result: {
                            ok: true,
                            status: "VIDEO_GENERATED_CLOUD_VERIFIED",
                            done: true,
                            operationName: data.operationName,
                            downloadUrl: "https://firebasestorage.googleapis.com/video.mp4",
                            storageObject: "jarvis-video-temp/test/recovered.mp4",
                            sha256: "e".repeat(64),
                            provider: "google-veo-vertex",
                            model: "veo-3.1-generate-001"
                        }
                    })
                };
            }
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ result: { ok: true } })
            };
        };
        globalThis.JarvisLocalBridge = {
            async requestJson(path, payload) {
                if (path === "/video/engine/authorize-external") {
                    assert.equal(payload.segmentCount, 1);
                    return {
                        ok: true,
                        model: "veo-3.1-generate-001",
                        plannedDurationSeconds: 8,
                        externalEstimatedCostUsd: 3.2
                    };
                }
                assert.equal(path, "/video/import");
                return {
                    ok: true,
                    status: "VIDEO_IMPORTED_VERIFIED",
                    output: payload.output,
                    physicallyWritten: true,
                    bytes: 120000,
                    sha256: payload.expectedSha256
                };
            }
        };

        const result = await runtime.get("video.generate").execute({
            prompt: "Video verificable de un segmento.",
            output: ".jarvis-artifacts/videos/recovered-same-operation.mp4"
        }, { waitForVideoPoll: async () => {} });

        assert.equal(result.status, "VIDEO_GENERATED_VERIFIED");
        assert.equal(result.objectiveSatisfied, true);
        assert.equal(result.physicallyWritten, true);
        assert.equal(calls.filter(call => call.action === "start").length, 1);
        const polls = calls.filter(call => call.action === "poll");
        assert.equal(polls.length, 2);
        assert.deepEqual(
            polls.map(call => call.operationName),
            ["operations/recover-same-operation", "operations/recover-same-operation"]
        );
    }
    finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
        globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("video generation surfaces RAI reasons and never restarts from zero", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const previousBridge = globalThis.JarvisLocalBridge;
    const calls = [];

    try {
        globalThis.auth = {
            currentUser: { getIdToken: async () => "rai-token" }
        };
        globalThis.fetch = async (_url, options = {}) => {
            const data = JSON.parse(options.body).data;
            calls.push(data);
            if (data.action === "start") {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        result: { ok: true, operationName: "operations/rai-filtered" }
                    })
                };
            }
            return {
                ok: false,
                status: 412,
                text: async () => JSON.stringify({
                    error: {
                        status: "FAILED_PRECONDITION",
                        message: "VIDEO_GENERATION_RAI_FILTERED",
                        details: {
                            status: "VIDEO_GENERATION_RAI_FILTERED",
                            stage: "VIDEO_GENERATION_RESULT",
                            providerCode: "RAI_MEDIA_FILTERED",
                            providerMessage: "Generated media was filtered.",
                            retryable: false,
                            operationName: data.operationName,
                            raiMediaFilteredReasons: ["VIOLENCE"]
                        }
                    }
                })
            };
        };
        globalThis.JarvisLocalBridge = {
            async requestJson(route, payload) {
                if (route === "/video/engine/resolve") {
                    return {
                        ok: true,
                        policy: "CURRENT_STABLE",
                        engineRequested: "CURRENT_STABLE",
                        engineUsed: "external",
                        fallbackUsed: false
                    };
                }
                if (route === "/video/engine/authorize-external") {
                    assert.equal(payload.segmentCount, 1);
                    return {
                        ok: true,
                        model: "veo-3.1-generate-001",
                        plannedDurationSeconds: 8,
                        externalEstimatedCostUsd: 3.2
                    };
                }
                throw new Error(`Unexpected bridge route: ${route}`);
            }
        };

        const result = await runtime.get("video.generate").execute({
            prompt: "Prompt que el proveedor filtro."
        }, { waitForVideoPoll: async () => {} });

        assert.equal(result.status, "VIDEO_GENERATION_RAI_FILTERED");
        assert.equal(result.retryable, false);
        assert.equal(result.fullRestartAllowed, false);
        assert.deepEqual(result.raiMediaFilteredReasons, ["VIOLENCE"]);
        assert.equal(calls.filter(call => call.action === "start").length, 1);
        assert.equal(calls.filter(call => call.action === "poll").length, 1);
    }
    finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
        globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("video generation stays blocked when import does not prove a physical MP4", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const previousBridge = globalThis.JarvisLocalBridge;

    try {
        globalThis.auth = {
            currentUser: { getIdToken: async () => "missing-mp4-token" }
        };
        globalThis.fetch = async (_url, options = {}) => {
            const data = JSON.parse(options.body).data;
            const result = data.action === "start"
                ? { ok: true, operationName: "operations/missing-physical-mp4" }
                : {
                    ok: true,
                    done: true,
                    operationName: data.operationName,
                    downloadUrl: "https://firebasestorage.googleapis.com/missing.mp4",
                    sha256: "f".repeat(64),
                    provider: "google-veo-vertex",
                    model: "veo-3.1-generate-001"
                };
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ result })
            };
        };
        globalThis.JarvisLocalBridge = {
            async requestJson() {
                return {
                    ok: true,
                    status: "VIDEO_IMPORT_REPORTED_WITHOUT_FILE",
                    output: ".jarvis-artifacts/videos/missing.mp4",
                    physicallyWritten: false,
                    bytes: 0,
                    sha256: ""
                };
            }
        };

        const result = await runtime.get("video.generate").execute({
            prompt: "No aceptes un archivo inexistente."
        }, { waitForVideoPoll: async () => {} });

        assert.equal(result.ok, false);
        assert.equal(result.objectiveSatisfied, false);
        assert.equal(result.blocked, true);
        assert.equal(result.status, "VIDEO_IMPORT_PHYSICAL_VERIFICATION_FAILED");
        assert.equal(result.providerCode, "VIDEO_IMPORT_REPORTED_WITHOUT_FILE");
        assert.match(result.providerMessage, /VIDEO_IMPORT_REPORTED_WITHOUT_FILE/);
    }
    finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
        globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("series video loads canonical episode context before Veo and records only the physical result", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const previousBridge = globalThis.JarvisLocalBridge;
    const bytes = Buffer.from("explicit-character-reference");
    const referenceOutput = ".jarvis-artifacts/uploads/series-character.jpg";
    const bridgeCalls = [];
    const functionCalls = [];

    try {
        globalThis.auth = { currentUser: { getIdToken: async () => "series-token" } };
        globalThis.JarvisLocalBridge = {
            async requestJson(route, payload) {
                bridgeCalls.push({ route, payload });
                if (route === "/series/episode/generation-context") {
                    return {
                        ok: true,
                        status: "SERIES_EPISODE_GENERATION_CONTEXT_VERIFIED",
                        seriesId: "SERIES_RUNTIME",
                        episodeId: "EP-SERIES_RUNTIME-12",
                        script: "Guion canonico persistido.",
                        scriptSha256: createHash("sha256").update("Guion canonico persistido.").digest("hex"),
                        referenceOutputs: [referenceOutput],
                        storyBeats: [{ exactAction: "Accion canonica." }]
                    };
                }
                if (route === "/artifact/read") {
                    return {
                        ok: true,
                        output: referenceOutput,
                        mimeType: "image/jpeg",
                        dataBase64: bytes.toString("base64"),
                        sha256: createHash("sha256").update(bytes).digest("hex")
                    };
                }
                if (route === "/video/engine/resolve") {
                    return {
                        ok: true,
                        policy: "CURRENT_STABLE",
                        engineRequested: "CURRENT_STABLE",
                        engineUsed: "external",
                        fallbackUsed: false
                    };
                }
                if (route === "/video/engine/authorize-external") {
                    assert.equal(payload.segmentCount, 1);
                    return {
                        ok: true,
                        model: "veo-3.1-generate-001",
                        plannedDurationSeconds: 8,
                        externalEstimatedCostUsd: 3.2
                    };
                }
                if (route === "/video/import") {
                    return {
                        ok: true,
                        output: payload.output,
                        mimeType: "video/mp4",
                        physicallyWritten: true,
                        bytes: 120000,
                        sha256: payload.expectedSha256
                    };
                }
                if (route === "/series/episode/generated") {
                    return {
                        ok: true,
                        status: "SERIES_EPISODE_GENERATED_RECORDED",
                        episodeId: payload.episodeId
                    };
                }
                throw new Error(`Unexpected bridge route: ${route}`);
            }
        };
        globalThis.fetch = async (_url, options = {}) => {
            const data = JSON.parse(options.body).data;
            functionCalls.push(data);
            const result = data.action === "start"
                ? { ok: true, operationName: "operations/series-runtime" }
                : data.action === "poll"
                    ? {
                        ok: true,
                        done: true,
                        operationName: data.operationName,
                        downloadUrl: "https://firebasestorage.googleapis.com/series.mp4",
                        sha256: "a".repeat(64),
                        provider: "google-veo-vertex",
                        model: "veo-3.1-generate-001"
                    }
                    : { ok: true };
            return { ok: true, status: 200, text: async () => JSON.stringify({ result }) };
        };

        const result = await runtime.get("video.generate").execute({
            seriesId: "SERIES_RUNTIME",
            episodeId: "EP-SERIES_RUNTIME-12",
            prompt: "Este prompt no puede reemplazar el guion canonico.",
            output: ".jarvis-artifacts/videos/series-runtime.mp4"
        }, { waitForVideoPoll: async () => {} });

        assert.equal(result.status, "VIDEO_GENERATED_VERIFIED");
        assert.equal(result.seriesId, "SERIES_RUNTIME");
        assert.equal(result.episodeId, "EP-SERIES_RUNTIME-12");
        assert.equal(bridgeCalls[0].route, "/series/episode/generation-context");
        assert.equal(functionCalls.filter(call => call.action === "start").length, 1);
        assert.equal(functionCalls[0].referenceImages.length, 1);
        assert.match(functionCalls[0].prompt, /Guion canonico persistido/);
        assert.equal(
            bridgeCalls.filter(call => call.route === "/series/episode/generated").length,
            1
        );
    }
    finally {
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
        globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("series video blocks unsupported segment count before spending a Veo generation", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    let cloudCalls = 0;
    try {
        globalThis.JarvisLocalBridge = {
            async requestJson(route) {
                assert.equal(route, "/series/episode/generation-context");
                return {
                    ok: true,
                    seriesId: "SERIES_SEGMENTS",
                    episodeId: "EP-SERIES-SEGMENTS-1",
                    script: "Cinco unidades no se descartan.",
                    referenceOutputs: [],
                    storyBeats: Array.from({ length: 5 }, (_, index) => ({
                        exactAction: `Accion ${index + 1}`
                    }))
                };
            }
        };
        globalThis.fetch = async () => {
            cloudCalls += 1;
            throw new Error("VEO_MUST_NOT_START");
        };
        const result = await runtime.get("video.generate").execute({
            seriesId: "SERIES_SEGMENTS",
            episodeId: "EP-SERIES-SEGMENTS-1"
        });
        assert.equal(result.status, "SERIES_VIDEO_SEGMENT_LIMIT_EXCEEDED:5:4");
        assert.equal(result.blocked, true);
        assert.equal(cloudCalls, 0);
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
    }
});

test("a timestamped seven-beat series episode starts one resumable 180-second local operation", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    let startPayload = null;
    let cloudCalls = 0;
    try {
        globalThis.fetch = async () => {
            cloudCalls += 1;
            throw new Error("EXTERNAL_VIDEO_MUST_NOT_START");
        };
        globalThis.JarvisLocalBridge = {
            async requestJson(route, payload) {
                if (route === "/series/episode/generation-context") {
                    return {
                        ok: true,
                        seriesId: "SERIES_THREE_MINUTES",
                        episodeId: "EP-SERIES-THREE-MINUTES-1",
                        script: THREE_MINUTE_EPISODE_SCRIPT,
                        referenceOutputs: [],
                        storyBeats: Array.from({ length: 7 }, (_, index) => ({
                            exactAction: `Beat canonico ${index + 1}`
                        }))
                    };
                }
                if (route === "/video/engine/resolve") {
                    return {
                        ok: true,
                        policy: "LOCAL_TEST",
                        engineRequested: "LOCAL_TEST",
                        engineUsed: "local",
                        selectedBackend: "wan22-ti2v-5b",
                        fallbackUsed: false
                    };
                }
                if (route === "/video/local/start") {
                    startPayload = payload;
                    return {
                        ok: true,
                        done: false,
                        operationName: "local-video/three-minute-episode"
                    };
                }
                if (route === "/speech/synthesize") {
                    assert.match(payload.text, /Roldan acusa el muro/);
                    assert.equal(payload.language, "es-MX");
                    return {
                        ok: true,
                        status: "SPEECH_AUDIO_CREATED_VERIFIED",
                        output: payload.output,
                        mimeType: "audio/wav",
                        bytes: 240000,
                        sha256: "b".repeat(64),
                        durationSeconds: 112
                    };
                }
                if (route === "/video/local/poll") {
                    return {
                        ok: true,
                        done: true,
                        status: "VIDEO_GENERATED_VERIFIED",
                        operationName: payload.operationName,
                        output: ".jarvis-artifacts/videos/three-minute-episode.mp4",
                        mimeType: "video/mp4",
                        physicallyWritten: true,
                        verifiedArtifactDelivery: true,
                        bytes: 180000,
                        sha256: "a".repeat(64),
                        durationSeconds: 180,
                        shotCount: 36,
                        externalApiUsed: false,
                        externalEstimatedCostUsd: 0
                    };
                }
                if (route === "/series/episode/generated") {
                    return { ok: true, status: "SERIES_EPISODE_GENERATED_RECORDED" };
                }
                throw new Error(`Unexpected bridge route: ${route}`);
            }
        };
        const result = await runtime.get("video.generate").execute({
            seriesId: "SERIES_THREE_MINUTES",
            episodeId: "EP-SERIES-THREE-MINUTES-1",
            output: ".jarvis-artifacts/videos/three-minute-episode.mp4"
        }, { waitForVideoPoll: async () => {} });

        assert.equal(result.ok, true);
        assert.equal(result.durationSeconds, 180);
        assert.equal(result.shotCount, 36);
        assert.equal(startPayload.durationSeconds, 180);
        assert.equal(startPayload.prompts.length, 7);
        assert.equal(startPayload.shotPlan.length, 36);
        assert.match(startPayload.audioOutput, /^\.jarvis-artifacts\/audio\//);
        assert.equal(
            startPayload.shotPlan.reduce((sum, shot) => sum + shot.durationSeconds, 0),
            180
        );
        assert.equal(cloudCalls, 0);
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
    }
});

test("video generation fails closed when more than three identity references are requested", async () => {
    const runtime = createRuntime();
    registerJarvisActuatorTools(runtime);
    const result = await runtime.get("video.generate").execute({
        prompt: "Generate a cinematic video.",
        referenceOutputs: ["one.jpg", "two.jpg", "three.jpg", "four.jpg"]
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "VIDEO_REFERENCE_IMAGE_LIMIT_EXCEEDED");
    assert.equal(result.blocked, true);
    assert.equal(result.retryable, false);
});
