import assert from "node:assert/strict";
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
        "agent.delegate",
        "connector.list"
    ]);
    assert.equal(runtime.get("browser.inspect").mutates, false);
    assert.equal(runtime.get("system.supervision.runNow").requiresApproval, true);
    assert.equal(runtime.get("browser.screenshot").requiresApproval, true);
    assert.equal(runtime.get("page.create").requiresApproval, true);
    assert.equal(runtime.get("reel.create").requiresApproval, true);
    assert.equal(runtime.get("document.create").requiresApproval, true);
    assert.equal(runtime.get("document.pdf.edit").requiresApproval, true);
    assert.equal(runtime.get("document.xlsx.edit").requiresApproval, true);
    assert.equal(runtime.get("document.docx.edit").requiresApproval, true);
    assert.equal(runtime.get("document.pptx.edit").requiresApproval, true);
    assert.equal(runtime.get("image.edit").requiresApproval, true);
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
        tasks: [
            { tool: "system.echo", args: { value: 7 } },
            { tool: "repo.write", args: {} },
            { tool: "agent.delegate", args: {} }
        ]
    });

    assert.equal(execution.ok, true);
    assert.equal(execution.parallel, true);
    assert.equal(execution.taskCount, 1);
    assert.equal(execution.results[0].data.value, 7);
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
