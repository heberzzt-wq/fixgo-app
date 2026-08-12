import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { collectNexoRealWebMedia } from "../nexo-web-media-bridge.js";
import { registerNexoRealMediaTools } from "../gestia-core/nexo/nexo.real-media.tools.js";

const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0xff,0xd9]);

function runtimeFixture() {
    const registry = new Map();
    return {
        registry,
        register(definition) {
            registry.set(definition.name, definition);
            return { ok: true, tool: definition.name };
        },
        get(name) { return registry.get(name) || null; },
        has(name) { return registry.has(name); }
    };
}

function temporaryRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "nexo-v135-"));
}

test("v135 collector accepts browser-observed media but still verifies real bytes", async t => {
    const server = http.createServer((req, res) => {
        if (req.url === "/network.jpg") {
            res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": jpeg.length });
            return res.end(jpeg);
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end("<!doctype html><title>dynamic page</title><body>No static media tags</body>");
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const root = temporaryRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = await collectNexoRealWebMedia({
        url: baseUrl,
        discoveredMedia: [{
            kind: "image",
            url: `${baseUrl}/network.jpg`,
            mimeType: "image/jpeg",
            resourceType: "Image",
            declaredBytes: jpeg.length
        }],
        requireImages: true,
        requireAnyVisual: true,
        maxImages: 2,
        root,
        allowPrivateHostsForTesting: true
    });

    assert.equal(result.ok, true);
    assert.equal(result.requirementsMet, true);
    assert.equal(result.discoveryMode, "browser_network");
    assert.equal(result.mediaAssets.length, 1);
    assert.equal(result.mediaAssets[0].sourceTag, "browser-network");
    assert.equal(result.mediaAssets[0].networkObserved, true);
    assert.match(result.mediaAssets[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(fs.existsSync(path.join(root, result.mediaAssets[0].output)), true);
});

test("v135 web.media.collect falls back to browser-network collection when static HTML is insufficient", async t => {
    const previousBridge = globalThis.JarvisLocalBridge;
    t.after(() => {
        if (previousBridge === undefined) delete globalThis.JarvisLocalBridge;
        else globalThis.JarvisLocalBridge = previousBridge;
    });
    const calls = [];
    globalThis.JarvisLocalBridge = {
        async requestJson(route, payload) {
            calls.push({ route, payload });
            if (route === "/web/media/collect") {
                return {
                    ok: false,
                    requirementsMet: false,
                    status: "WEB_REAL_MEDIA_REQUIREMENTS_UNMET",
                    counts: { images: 0, videos: 0, total: 0 },
                    mediaAssets: []
                };
            }
            if (route === "/browser") {
                assert.equal(payload.action, "media");
                assert.equal(payload.url, "https://example.com/menu");
                return {
                    ok: true,
                    requirementsMet: true,
                    status: "WEB_REAL_MEDIA_COLLECTED",
                    discoveryMode: "browser_network",
                    browserNetwork: { candidateCount: 7 },
                    counts: { images: 1, videos: 0, total: 1 },
                    mediaAssets: [{
                        kind: "image",
                        output: ".jarvis-artifacts/web-media/example/photo.jpg",
                        mimeType: "image/jpeg",
                        bytes: 12345,
                        sha256: "a".repeat(64),
                        sourceUrl: "https://cdn.example.com/photo.jpg",
                        sourceTag: "browser-network",
                        networkObserved: true
                    }]
                };
            }
            throw new Error(`Unexpected route ${route}`);
        }
    };

    const runtime = runtimeFixture();
    registerNexoRealMediaTools(runtime);
    const result = await runtime.registry.get("web.media.collect").execute({
        url: "https://example.com/menu",
        requireImages: true,
        requireAnyVisual: true,
        maxImages: 6
    });

    assert.deepEqual(calls.map(call => call.route), ["/web/media/collect", "/browser"]);
    assert.equal(result.ok, true);
    assert.equal(result.objectiveSatisfied, true);
    assert.equal(result.browserFallbackUsed, true);
    assert.equal(result.discoveryMode, "browser_network");
    assert.equal(result.mediaAssets.length, 1);
});

test("v135 static success does not invoke browser fallback", async t => {
    const previousBridge = globalThis.JarvisLocalBridge;
    t.after(() => {
        if (previousBridge === undefined) delete globalThis.JarvisLocalBridge;
        else globalThis.JarvisLocalBridge = previousBridge;
    });
    const calls = [];
    globalThis.JarvisLocalBridge = {
        async requestJson(route) {
            calls.push(route);
            return {
                ok: true,
                requirementsMet: true,
                status: "WEB_REAL_MEDIA_COLLECTED",
                counts: { images: 1, videos: 0, total: 1 },
                mediaAssets: []
            };
        }
    };
    const runtime = runtimeFixture();
    registerNexoRealMediaTools(runtime);
    const result = await runtime.registry.get("web.media.collect").execute({
        url: "https://example.com/",
        requireImages: true
    });
    assert.deepEqual(calls, ["/web/media/collect"]);
    assert.equal(result.objectiveSatisfied, true);
    assert.notEqual(result.browserFallbackUsed, true);
});
