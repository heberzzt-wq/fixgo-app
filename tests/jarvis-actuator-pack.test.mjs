import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
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
        "reel.create",
        "document.create",
        "document.pdf",
        "document.pdf.edit",
        "document.xlsx.edit",
        "document.docx.edit",
        "document.pptx.edit",
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
    assert.equal(runtime.get("reel.create").requiresApproval, false);
    assert.equal(runtime.get("reel.create").userArtifact, true);
    assert.equal(runtime.get("document.create").requiresApproval, false);
    assert.equal(runtime.get("document.create").userArtifact, true);
    assert.equal(runtime.get("image.generate").requiresApproval, false);
    assert.equal(runtime.get("image.generate").userArtifact, true);
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
