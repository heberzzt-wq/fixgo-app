import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSelfHostedSemanticEngine } from "../jarvis-fs-bridge.js";
const catalog = [
 { name: "repo.audit", description: "Audit repository", mutates: false },
 { name: "system.health", description: "Runtime health", mutates: false },
 { name: "repo.read", description: "Read a repository file", mutates: false,
   inputSchema: { type: "object", required: ["file"], properties: { file: { type: "string" } } } }
];
const request = tools => ({ input: "Lee jarvis-runtime-contract.json sin modificar nada.", catalog: tools,
 missionState: { phase: "CURRENT_TURN", writeAllowed: false }, timeoutMs: 60000 });
function fixture(t, { action = "read repository file", invalidTool = false } = {}) {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-retrieval-test-"));
 t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
 const env = { ...process.env, JARVIS_TOOL_EMBEDDING_CACHE_PATH: path.join(dir, "cache.json") };
 const requests = [];
 const fetchImpl = async (url, options) => {
  const body = JSON.parse(options.body);
  requests.push({ url, body });
  let response;
  if (url.endsWith("/api/embed")) {
   response = { embeddings: body.input.map(text => /^repo.read|^tool.test63|^read repository/.test(text) ? [1, 0] : [0, 1]) };
  } else {
   assert.equal(url, "http://127.0.0.1:11434/api/chat");
   assert.equal(body.model, "qwen3:1.7b");
   const name = invalidTool ? "invented.readFile" : body.tools?.[0].function.name;
   response = { message: body.tools
    ? { tool_calls: [{ function: { name, arguments: { file: "jarvis-runtime-contract.json" } } }] }
    : { content: JSON.stringify({ action }) }, done_reason: "stop" };
  }
  return { ok: true, text: async () => JSON.stringify(response) };
 };
 return { requests, fetchImpl, env, engine: () => createSelfHostedSemanticEngine({ fetchImpl, env }) };
}

test("retrieval embeds Qwen's operation while native arguments retain the full original request", async t => {
 const f = fixture(t);
 const result = await f.engine().plan(request(catalog));
 const chats = f.requests.filter(r => r.url.endsWith("/api/chat"));
 assert.equal(chats.length, 2);
 assert.ok(chats.every(r => r.body.messages.at(-1).content === request(catalog).input));
 assert.equal(chats[0].body.format.properties.action.type, "string");
 assert.equal(chats[1].body.tools.length, 2);
 assert.match(chats[1].body.tools[0].function.description, /repo.read/);
 const embeds = f.requests.filter(r => r.url.endsWith("/api/embed"));
 assert.deepEqual(embeds.at(-1).body.input, ["read repository file"]);
 assert.equal(result.toolCalls[0].name, "repo.read");
 assert.equal(result.toolCalls[0].args.file, "jarvis-runtime-contract.json");
 assert.equal(result.toolCalls[0].approved, false);
 assert.equal(result.missionComplete, false);
 assert.equal(result.semanticPreselection.querySource, "qwen_requested_operation");
 assert.equal(result.semanticPreselection.retrievalOnly, true);
 assert.equal(result.inferenceReceipt.counters.paidExternalCalls, 0);
});

test("cold catalog warms once within the request and subsequent retrieval reuses its vectors", async t => {
 const f = fixture(t), engine = f.engine();
 const large = Array.from({ length: 64 }, (_, i) => ({ name: "tool.test" + i, description: "Tool " + i }));
 for (let i = 0; i < 2; i++) {
  const result = await engine.plan(request(large));
  assert.equal(result.toolCalls[0].name, "tool.test63");
  assert.equal(result.semanticPreselection.cacheMisses, i === 0 ? 64 : 0);
 }
 const embeds = f.requests.filter(r => r.url.endsWith("/api/embed"));
 assert.deepEqual(embeds.map(r => r.body.input.length), [64, 1, 1]);
});

test("concurrent catalog warming never leaks candidates across requests", async t => {
 const f = fixture(t), engine = f.engine();
 const other = catalog.map(tool => ({ ...tool, name: tool.name + "Other" }));
 const results = await Promise.all([engine.plan(request(catalog)), engine.plan(request(other))]);
 assert.deepEqual(results.map(result => result.toolCalls[0].name), ["repo.read", "repo.readOther"]);
});

test("action description, retrieval and arguments share one deadline", async t => {
 const f = fixture(t);
 let now = Date.now();
 t.mock.method(Date, "now", () => now);
 const engine = createSelfHostedSemanticEngine({ env: f.env, fetchImpl: async (url, options) => {
  now += 30;
  return f.fetchImpl(url, options);
 } });
 await assert.rejects(engine.plan({ ...request(catalog), timeoutMs: 10 }), /LOCAL_SEMANTIC_TIMEOUT/);
 assert.equal(f.requests.length, 1, "expired action description cannot start embeddings or native tools");
});

test("an invalid action stops before retrieval and an invented native tool is never executable", async t => {
 const badAction = fixture(t, { action: null });
 await assert.rejects(badAction.engine().plan(request(catalog)), /SEMANTIC_ACTION_DESCRIPTION_INVALID/);
 assert.equal(badAction.requests.length, 1);
 const badTool = fixture(t, { invalidTool: true });
 await assert.rejects(badTool.engine().plan(request(catalog)), /SEMANTIC_PLAN_EMPTY/);
 assert.equal(badTool.requests.filter(r => r.url.endsWith("/api/chat")).length, 3, "only the existing bounded JSON correction may follow an invalid native call");
});
