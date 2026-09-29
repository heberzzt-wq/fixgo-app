import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createSelfHostedSemanticEngine } from "../jarvis-fs-bridge.js";

const catalog = [
    { name: "repo.audit", description: "Inspect repository", mutates: false },
    { name: "system.health", description: "Inspect runtime", mutates: false },
    { name: "marketing.plan", description: "Plan campaign", mutates: false }
];
const request = tools => ({
    input: "Inspect the running application", catalog: tools,
    missionState: { phase: "CURRENT_TURN", writeAllowed: false }, timeoutMs: 60000
});

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-vector-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const cachePath = path.join(root, "persistent", "tools.json");
    const requests = [];
    const env = { JARVIS_TOOL_EMBEDDING_CACHE_PATH: cachePath };
    let failEmbeddings = false;
    const fetchImpl = async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push({ url, body });
        if (url.endsWith("/api/embed")) {
            if (failEmbeddings) throw new Error("EMBEDDING_OFFLINE");
            return { ok: true, text: async () => JSON.stringify({
                embeddings: body.input.map(text => text.startsWith("marketing.plan:")
                    ? [0, 1] : text.startsWith("system.health:") ? [0.9, 0.1] : [1, 0])
            }) };
        }
        assert.equal(url, "http://127.0.0.1:11434/api/chat");
        assert.equal(body.model, "qwen2.5-coder:3b");
        return { ok: true, text: async () => JSON.stringify({ message: {
            content: JSON.stringify({ toolCalls: [{ name: JSON.parse(body.messages.at(-1).content).catalog[1].name, args: {} }], missionComplete: false })
        }, done_reason: "stop" }) };
    };
    return { cachePath, requests, env, fetchImpl,
        engine: () => createSelfHostedSemanticEngine({ env, fetchImpl }),
        fail: value => { failEmbeddings = value; }
    };
}

test("vector cache survives engine restart; Qwen can choose the second candidate without approval", async t => {
    const f = fixture(t);
    const first = await f.engine().plan(request(catalog));
    assert.deepEqual(first.semanticPreselection.selected.map(x => x.name), ["repo.audit", "system.health"]);
    assert.equal(first.toolCalls[0].name, "system.health");
    assert.equal(first.toolCalls[0].approved, false);
    assert.equal(first.missionComplete, false);
    f.requests.length = 0;
    const next = await f.engine().plan(request(catalog));
    assert.equal(next.semanticPreselection.cacheHits, 3);
    assert.equal(next.semanticPreselection.cacheMisses, 0);
    assert.equal(f.requests.length, 2);
    assert.deepEqual(f.requests[0].body.input, [request(catalog).input]);
    assert.equal(f.requests[0].body.keep_alive, "30m");
    assert.equal(JSON.parse(f.requests[1].body.messages.at(-1).content).catalog.length, 2);
    assert.equal(next.inferenceReceipt.counters.paidExternalCalls, 0);
});

test("vector cache invalidates only changed tool text and all entries for a changed embedding model", async t => {
    const f = fixture(t);
    await f.engine().plan(request(catalog));
    for (const patch of [{ description: "Inspect tracked repository files" }, { name: "repo.inspect" }]) {
        f.requests.length = 0;
        const changed = [{ ...catalog[0], ...patch }, ...catalog.slice(1)];
        const result = await f.engine().plan(request(changed));
        assert.equal(result.semanticPreselection.cacheMisses, 1);
        assert.equal(f.requests[0].body.input.length, 1);
        assert.equal(f.requests[0].body.input[0], `${changed[0].name}: ${changed[0].description}`);
    }
    f.env.JARVIS_LOCAL_EMBEDDING_MODEL = "test-embedding-v2";
    f.requests.length = 0;
    const result = await f.engine().plan(request(catalog));
    assert.equal(result.semanticPreselection.cacheMisses, 3);
    assert.equal(f.requests[0].body.model, "test-embedding-v2");
});

test("invalid cached vectors are regenerated instead of being treated as semantic evidence", async t => {
    const f = fixture(t);
    await f.engine().plan(request(catalog));
    const cache = JSON.parse(fs.readFileSync(f.cachePath));
    const keys = Object.keys(cache.entries);
    cache.entries[keys[0]] = [null, 0];
    cache.entries[keys[1]] = [0, 0];
    fs.writeFileSync(f.cachePath, JSON.stringify(cache));
    f.requests.length = 0;
    const result = await f.engine().plan(request(catalog));
    assert.equal(result.semanticPreselection.cacheMisses, 2);
    assert.equal(f.requests[0].body.input.length, 2);
});

test("cold large catalog warms without inference and embedding failure stays recoverable", async t => {
    const f = fixture(t);
    const large = Array.from({ length: 12 }, (_, i) => ({ name: `tool.test${i}`, description: `Tool ${i}` }));
    const engine = f.engine();
    f.fail(true);
    await assert.rejects(engine.plan(request(large)), /LOCAL_TOOL_EMBEDDING_CACHE_WARMING/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.requests.some(r => r.url.endsWith("/api/chat")), false);
    f.fail(false);
    await assert.rejects(engine.plan(request(large)), /LOCAL_TOOL_EMBEDDING_CACHE_WARMING/);
    await new Promise(resolve => setImmediate(resolve));
    const result = await engine.plan(request(large));
    assert.equal(result.semanticPreselection.cacheHits, 12);
    assert.equal(result.semanticPreselection.cacheMisses, 0);
    assert.equal(result.catalogSize, 2);
});

test("concurrent catalogs never rank tools missing from the shared cache", async t => {
    const f = fixture(t);
    const engine = f.engine();
    const other = catalog.map(tool => ({ ...tool, description: tool.description + " revised" }));
    const results = await Promise.all([engine.plan(request(catalog)), engine.plan(request(other))]);
    const persisted = JSON.parse(fs.readFileSync(f.cachePath));
    assert.equal(Object.keys(persisted.entries).length, 6);
    assert.ok(results.every(result => result.semanticPreselection.selected.every(tool => Number.isFinite(tool.score) && tool.score > 0)));
});

test("query vectorization consumes the same deadline and cannot start Qwen after expiry", async t => {
    const f = fixture(t);
    await f.engine().plan(request(catalog));
    f.requests.length = 0;
    const engine = createSelfHostedSemanticEngine({ env: f.env, fetchImpl: async (url, options) => {
        await new Promise(resolve => setTimeout(resolve, 30));
        return f.fetchImpl(url, options);
    } });
    await assert.rejects(engine.plan({ ...request(catalog), timeoutMs: "10" }), /LOCAL_SEMANTIC_TIMEOUT/);
    assert.equal(f.requests.length, 1);
    assert.ok(f.requests[0].url.endsWith("/api/embed"));
});
