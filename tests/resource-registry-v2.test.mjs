import assert from "node:assert/strict";
import { test } from "node:test";

test("resource registry V2 rehydrates without duplicate module files", async () => {
    globalThis.window =
        globalThis;

    window.__SIA7_RESOURCE_REGISTRY__ = {
        version: "SIA7_V1",
        files: {
            stale: true
        },
        modules: {
            sample: {
                files: ["stale.js"]
            }
        },
        dependencies: {},
        ownership: {},
        collections: {},
        firestoreBindings: {},
        engines: {},
        hubs: {},
        runtime: {},
        impactGraph: {},
        governance: {}
    };

    window.__REPO_COGNITION__ = {
        "sample.js": {
            path: "sample.js",
            module: "sample",
            type: "runtime",
            critical: true,
            cognition: {
                layer: "test"
            }
        }
    };

    window.__REPO_DEP_GRAPH__ = {};
    window.__HYBRID_COGNITION_RUNTIME__ = {
        online: true
    };
    window.__GESTIA_RUNTIME_V7_BOOTED__ = true;

    await import("../gestia-core/repo/resource.registry.js?test=v2a");
    await import("../gestia-core/repo/resource.registry.js?test=v2b");

    assert.equal(
        window.__SIA7_RESOURCE_REGISTRY__.version,
        "SIA7_V2"
    );

    assert.deepEqual(
        window.__SIA7_RESOURCE_REGISTRY__.modules.sample.files,
        ["sample.js"]
    );

    assert.equal(
        window.__SIA7_RESOURCE_REGISTRY__.files.stale,
        undefined
    );
});
