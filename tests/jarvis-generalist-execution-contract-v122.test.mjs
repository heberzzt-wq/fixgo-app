import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
    ensureExecutableArtifactDependencies,
    describeMissionDependencies
} from "../gestia-core/jarvis/jarvis.mission.dependencies.js";
import {
    compactMissionPlannerObservation,
    plannerStateBytes
} from "../gestia-core/jarvis/jarvis.mission.planner-state.js";
import {
    registerNexoRealMediaTools
} from "../gestia-core/nexo/nexo.real-media.tools.js";
import {
    createJarvisFsBridgeApp
} from "../jarvis-fs-bridge.js";
import {
    createJarvisUploadBridgeApp
} from "../jarvis-upload-bridge.js";

const names = calls => calls.map(call => call.name);
const catalog = [
    "web.research", "web.media.collect", "marketing.plan", "reel.plan",
    "page.plan", "page.compose", "page.create"
].map(name => ({ name }));

test("mission dependency contract executes evidence before page composition and artifact creation", () => {
    const calls = ensureExecutableArtifactDependencies({
        catalog,
        toolCalls: [
            { name: "page.create", args: { brandName: "Empresa Norte" } },
            { name: "page.compose", args: { brandName: "Empresa Norte" } },
            { name: "page.plan", args: { pageName: "empresa-norte" } },
            { name: "web.research", args: { query: "Empresa Norte sitio oficial" } }
        ]
    });
    assert.deepEqual(names(calls), ["web.research", "page.plan", "page.compose", "page.create"]);
    assert.equal(describeMissionDependencies().lexicalRouting, false);
});

test("mission dependency contract executes research and real media before marketing and reel planning", () => {
    const calls = ensureExecutableArtifactDependencies({
        catalog,
        toolCalls: [
            { name: "reel.plan", args: { title: "Reel A" } },
            { name: "marketing.plan", args: { brandName: "Marca A" } },
            { name: "web.media.collect", args: { url: "https://example.com/media" } },
            { name: "web.research", args: { query: "Marca A" } }
        ]
    });
    assert.deepEqual(names(calls), ["web.research", "web.media.collect", "marketing.plan", "reel.plan"]);
});

test("page.compose is inserted and then ordered before page.create when direct input is incomplete", () => {
    const calls = ensureExecutableArtifactDependencies({
        catalog,
        toolCalls: [
            { name: "page.create", args: { brandName: "Empresa Sur" } },
            { name: "web.research", args: { query: "Empresa Sur" } },
            { name: "page.plan", args: { pageName: "empresa-sur", brandName: "Empresa Sur" } }
        ]
    });
    assert.deepEqual(names(calls), ["web.research", "page.plan", "page.compose", "page.create"]);
});

test("planner-facing completion state is bounded without deleting the full mission evidence", () => {
    const giant = "dato-verificado ".repeat(8000);
    const observation = {
        ok: true,
        status: "GROUNDED",
        answer: giant,
        sources: Array.from({ length: 18 }, (_, index) => ({
            title: `Fuente ${index}`,
            url: `https://example.com/${index}`,
            snippet: giant
        })),
        evidence: { answer: giant }
    };
    const compact = compactMissionPlannerObservation(observation);
    assert.equal(observation.answer.length > 50000, true);
    assert.equal(compact.summary.length <= 700, true);
    assert.equal(compact.sources.length, 3);
    assert.equal("snippet" in compact.sources[0], false);
    assert.equal(plannerStateBytes({ completedTasks: [{ observation: compact }] }) < 5000, true);
    assert.equal(observation.sources[0].snippet.length > 50000, true);
});

class FakeRuntime {
    constructor(seed = null) {
        this.map = new Map();
        if (seed) this.map.set(seed.name, seed);
    }
    get(name) { return this.map.get(name) || null; }
    register(definition) { this.map.set(definition.name, definition); return { ok: true }; }
}

const canonicalRequired = [
    "audience", "offer", "pain", "promise", "differentiator", "cta",
    "market", "campaignObjective", "horizon", "tone", "channels",
    "metrics", "productionRequested"
];

test("NEXO marketing override preserves the canonical semantic brief schema", () => {
    const canonicalSchema = {
        type: "object",
        required: [...canonicalRequired, "brandName"],
        properties: Object.fromEntries([...canonicalRequired, "brandName"].map(name => [name, { type: "string" }]))
    };
    const runtime = new FakeRuntime({
        name: "marketing.plan",
        inputSchema: canonicalSchema,
        missionDedupeBy: ["brandName"],
        execute: async () => ({ ok: true })
    });
    registerNexoRealMediaTools(runtime);
    const installed = runtime.get("marketing.plan");
    assert.equal(installed.inputSchema, canonicalSchema);
    assert.deepEqual(installed.missionDedupeBy, ["brandName"]);
});

test("NEXO fallback marketing schema still requires the full semantic brief", () => {
    const runtime = new FakeRuntime();
    registerNexoRealMediaTools(runtime);
    const installed = runtime.get("marketing.plan");
    for (const field of canonicalRequired) {
        assert.equal(installed.inputSchema.required.includes(field), true, field);
    }
});

test("actual Jarvis FS bridge mounts /web/media/collect as JSON instead of 404", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v122-media-route-"));
    execFileSync("git", ["init", "-b", "v94-media-v4n-negative-claims"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "jarvis-runtime-contract.json"), JSON.stringify({
        projectId: "fixgo-test",
        branch: "v94-media-v4n-negative-claims",
        releaseId: "v122-test-release"
    }));
    const server = createJarvisFsBridgeApp({ root }).listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/web/media/collect`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "v122-test-release"
            },
            body: JSON.stringify({ url: "not-a-valid-url" })
        });
        const payload = await response.json();
        assert.notEqual(response.status, 404);
        assert.equal(typeof payload, "object");
        assert.equal(payload.ok, false);
        assert.equal(Boolean(payload.status || payload.error), true);
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("release source no longer sends raw mission observations back into semantic planner", () => {
    const core = fs.readFileSync(path.resolve("gestia-core/gestia-core.js"), "utf8");
    const contract = JSON.parse(fs.readFileSync(path.resolve("jarvis-runtime-contract.json"), "utf8"));
    assert.doesNotMatch(core, /observation:\s*item\.observation/);
    assert.equal((core.match(/compactMissionPlannerObservation\(item\.observation\)/g) || []).length, 2);
    assert.equal(contract.branch, "v94-media-v4n-negative-claims");
    assert.equal(contract.releaseId, "v94-source-grounded-research-v124-20260810");
});


test("upload bridge inherits exactly one real-media route authority from the FS bridge", async () => {
    const uploadSource = fs.readFileSync(path.resolve("jarvis-upload-bridge.js"), "utf8");
    assert.doesNotMatch(uploadSource, /registerNexoWebMediaRoutes/);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v122-upload-media-authority-"));
    execFileSync("git", ["init", "-b", "v94-media-v4n-negative-claims"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "jarvis-runtime-contract.json"), JSON.stringify({
        projectId: "fixgo-test",
        branch: "v94-media-v4n-negative-claims",
        releaseId: "v122-upload-media-test"
    }));

    const app = createJarvisUploadBridgeApp({ root });
    const mediaLayers = (app?.router?.stack || app?._router?.stack || [])
        .filter(layer => layer?.route?.path === "/web/media/collect");
    assert.equal(mediaLayers.length, 1);

    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/web/media/collect`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "v122-upload-media-test"
            },
            body: JSON.stringify({ url: "not-a-valid-url" })
        });
        const payload = await response.json();
        assert.notEqual(response.status, 404);
        assert.equal(payload.ok, false);
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});
