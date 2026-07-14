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
        "document.create",
        "document.pdf",
        "image.generate",
        "agent.delegate",
        "connector.list"
    ]);
    assert.equal(runtime.get("browser.inspect").mutates, false);
    assert.equal(runtime.get("system.supervision.runNow").requiresApproval, true);
    assert.equal(runtime.get("browser.screenshot").requiresApproval, true);
    assert.equal(runtime.get("document.create").requiresApproval, true);
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
