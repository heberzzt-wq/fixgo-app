// Retain the historical CI entrypoint while verifying its direct-Qwen replacement.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSelfHostedSemanticEngine } from "../jarvis-fs-bridge.js";
const catalog = [
 { name: "repo.audit", mutates: false },
 { name: "system.health", mutates: false },
 { name: "repo.read", mutates: false, inputSchema: { type: "object", required: ["file"], properties: { file: { type: "string" } } } }
];
const request = tools => ({ input: "Lee el contrato sin modificar nada.", catalog: tools,
 missionState: { phase: "CURRENT_TURN", writeAllowed: false }, timeoutMs: 60000 });
function fixture() {
 const requests = [];
 const fetchImpl = async (url, options) => {
  const body = JSON.parse(options.body);
  requests.push({ url, body });
  assert.equal(url, "http://127.0.0.1:11434/api/chat", "tool selection must not depend on embeddings");
  assert.equal(body.model, "qwen2.5-coder:3b");
  const info = !body.tools ? JSON.parse(body.messages[0].content.split("\n").at(-1)) : null;
  const index = info ? [...info.readOnly, ...info.mutating] : null;
  const name = index?.at(-1) || body.tools[0].function.description.split(":")[0];
  const content = index ? { name } : { toolCalls: [{ name, args: { file: "jarvis-runtime-contract.json" } }], missionComplete: false };
  return { ok: true, text: async () => JSON.stringify({ message: { content: JSON.stringify(content) }, done_reason: "stop" }) };
 };
 return { requests, fetchImpl, engine: () => createSelfHostedSemanticEngine({ fetchImpl }) };
}
test("Qwen sees the complete index and can select beyond the former two candidates", async () => {
 const f = fixture();
 const result = await f.engine().plan(request(catalog));
 assert.deepEqual(JSON.parse(f.requests[0].body.messages[0].content.split("\n").at(-1)).readOnly, catalog.map(tool => tool.name));
 assert.equal(f.requests[0].body.messages.at(-1).content, request(catalog).input);
 assert.equal(f.requests[1].body.tools.length, 1);
 assert.match(f.requests[1].body.tools[0].function.description, /repo.read/);
 assert.equal(result.toolCalls[0].name, "repo.read");
 assert.equal(result.toolCalls[0].args.file, "jarvis-runtime-contract.json");
 assert.equal(result.toolCalls[0].approved, false);
 assert.equal(result.missionComplete, false);
 assert.equal(result.inferenceReceipt.counters.localEmbeddingCalls, 0);
 assert.equal(result.inferenceReceipt.counters.paidExternalCalls, 0);
});
test("cold full catalog needs no embedding cache or background warming", async () => {
 const f = fixture();
 const large = Array.from({ length: 64 }, (_, i) => ({ name: "tool.test"+i, description: "Tool "+i }));
 const result = await f.engine().plan(request(large));
 assert.equal(f.requests.length, 2);
 assert.equal(JSON.parse(f.requests[0].body.messages[0].content.split("\n").at(-1)).readOnly.length, 64);
 assert.equal(f.requests[1].body.tools.length, 1);
 assert.equal(result.toolCalls[0].name, "tool.test63");
 assert.equal(result.inferenceReceipt.counters.localEmbeddedTexts, 0);
});
test("concurrent direct catalogs remain isolated", async () => {
 const f = fixture();
 const engine = f.engine();
 const other = catalog.map(tool => ({ ...tool, name: tool.name + "Other" }));
 const results = await Promise.all([engine.plan(request(catalog)), engine.plan(request(other))]);
 assert.deepEqual(results.map(result => result.toolCalls[0].name), ["repo.read", "repo.readOther"]);
});
test("catalog selection and argument generation share one deadline", async t => {
 const f = fixture();
 let now = Date.now();
 t.mock.method(Date, "now", () => now);
 const engine = createSelfHostedSemanticEngine({ fetchImpl: async (url, options) => {
  now += 30;
  return f.fetchImpl(url, options);
 } });
 await assert.rejects(engine.plan({ ...request(catalog), timeoutMs: 10 }), /LOCAL_SEMANTIC_TIMEOUT/);
 assert.equal(f.requests.length, 1, "an expired selection cannot launch argument generation");
});

test("a proposed unregistered name retrieves definitions but never becomes an executable alias", async t => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-action-retrieval-"));
 const cachePath = path.join(root, "cache.json");
 t.after(() => { fs.rmSync(cachePath, { force: true }); fs.rmdirSync(root); });
 const requests = [];
 const engine = createSelfHostedSemanticEngine({ env: { JARVIS_TOOL_EMBEDDING_CACHE_PATH: cachePath }, fetchImpl: async (url, options) => {
  const body = JSON.parse(options.body);
  requests.push({ url, body });
  if (url.endsWith("/api/embed")) return { ok: true, text: async () => JSON.stringify({ embeddings: body.input.map(text => text === "readFile" || text.startsWith("repo.read:") ? [1, 0] : [0, 1]) }) };
  if (!body.tools) {
   assert.equal(body.format.properties.name.type, "string");
   assert.equal(body.format.properties.name.enum, undefined, "decoding must not coerce an invented name into a different valid action");
   return { ok: true, text: async () => JSON.stringify({ message: { content: '{"name":"readFile"}' }, done_reason: "stop" }) };
  }
  assert.equal(body.tools.length, 2);
  assert.match(body.tools[0].function.description, /repo.read/);
  assert.equal(body.tools[0].function.parameters.properties.file.type, "string");
  assert.equal(body.messages.at(-1).content, request(catalog).input);
  return { ok: true, text: async () => JSON.stringify({ message: { content: '```json\n{"name":"jarvis_tool_0","arguments":{"file":"jarvis-runtime-contract.json"}}\n```' }, done_reason: "stop" }) };
 } });
 const result = await engine.plan(request(catalog));
 assert.equal(result.toolCalls[0].name, "repo.read");
 assert.equal(result.toolCalls[0].args.file, "jarvis-runtime-contract.json");
 assert.equal(result.toolCalls[0].approved, false);
 assert.equal(result.semanticPreselection.proposedName, "readFile");
 assert.equal(result.semanticPreselection.querySource, "qwen_proposed_tool");
 assert.deepEqual(requests.filter(item => item.url.endsWith("/api/embed")).at(-1).body.input, ["readFile"]);
 assert.equal(result.inferenceReceipt.counters.localSemanticInferenceCalls, 2);
 assert.equal(result.inferenceReceipt.counters.paidExternalCalls, 0);
});
