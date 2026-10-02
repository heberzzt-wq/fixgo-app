import assert from "node:assert/strict";
import test from "node:test";
import { createSelfHostedSemanticEngine } from "../jarvis-fs-bridge.js";
import { registerJarvisMultifunctionTools } from "../gestia-core/jarvis/jarvis.multitool.pack.js";
import { runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import { fetchLocalSemanticResponse } from "../jarvis-semantic-http.js";
import { persistDocumentDraft, documentEvidenceEnvelope } from "../gestia-core/jarvis/jarvis.document.context.js";

globalThis.window ||= {};
const { ResponseComposer } = await import("../gestia-core/response.composer.js");
const { ToolsBridge } = await import("../gestia-core/tools.bridge.js");

test("browser failure presentation preserves the document restart guard and draft", async () => {
    const old = { runtime: window.JarvisToolRuntime, composer: window.ResponseComposer };
    const draft = "Borrador recuperable " .repeat(300);
    let attempts = 0;
    try {
        window.ResponseComposer = ResponseComposer;
        window.JarvisToolRuntime = { execute: async () => {
            attempts++;
            return { ok: false, status: "DOCUMENT_CONTENT_COMPOSITION_FAILED", content: draft,
                retryable: false, fullRestartAllowed: false, objectiveSatisfied: false,
                recovery: { reason: "DOCUMENT_REPAIR_NO_PROGRESS", draftPreserved: true },
                validationFailures: ["DOCUMENT_COMPLETION_MARKER_MISSING"] };
        } };
        const presented = await ToolsBridge.executeAndCompose("document.compose");
        assert.equal(presented.data.retryable, false);
        assert.equal(presented.data.fullRestartAllowed, false);
        assert.equal(presented.data.content, draft);
        attempts = 0;
        const values = new Map();
        const mission = await runJarvisMission({ instruction: "Redacta el documento.",
            initialToolCalls: [{ name: "document.compose", args: { format: "md" } }],
            requiredToolNames: ["document.compose"], maximumSteps: 4, maximumRetries: 2,
            execute: call => ToolsBridge.executeAndCompose(call.name, call.args),
            planner: async () => ({ toolCalls: [{ name: "document.compose", args: { title: "Renombrado", format: "md" } }] }),
            storage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
        });
        assert.equal(attempts, 1);
        assert.notEqual(mission.status, "SUCCESS");
        assert.equal(mission.blockedTasks[0].observation.fullRestartAllowed, false);
    } finally { window.JarvisToolRuntime = old.runtime; window.ResponseComposer = old.composer; }
});

test("document requests keep bounded input and output while retaining the user contract", async () => {
    const old = globalThis.JarvisLocalBridge;
    const registry = new Map();
    registerJarvisMultifunctionTools({ has: name => registry.has(name), register: tool => registry.set(tool.name, tool) });
    const requests = [];
    try {
        globalThis.JarvisLocalBridge = { requestJson: async (_route, payload) => {
            requests.push(payload);
            return { ok: false, error: "TEST_PROVIDER_UNAVAILABLE" };
        } };
        const result = await registry.get("document.compose").execute({ format: "md", instructions: "Incluye 2 tablas." }, {
            rawInput: "Prepara la propuesta para Cancún y todo México usando https://www.summ.com.mx/.",
            canonicalEvidence: [{ tool: "web.research", summary: "Evidencia extensa. ".repeat(2500), validSources: ["https://www.summ.com.mx/"] }]
        });
        assert.equal(requests.length, 1);
        assert.ok(requests[0].maxOutputTokens <= 1600);
        assert.ok(Buffer.byteLength(requests[0].input) <= 6000);
        assert.match(requests[0].input, /Cancún y todo México/);
        assert.match(requests[0].input, /"minTables":2/);
        assert.match(requests[0].input, /PARTIAL/);
        assert.equal(result.fullRestartAllowed, false);
    } finally { globalThis.JarvisLocalBridge = old; }
});

test("a length-limited document response retains its draft for validation instead of throwing it away", async () => {
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async () => ({ ok: true,
        text: async () => JSON.stringify({ message: { content: "# Borrador parcial\nContenido recuperable." }, done_reason: "length" }) }) });
    const result = await engine.respond({ input: "Redacta la propuesta.", semanticStage: "document_initial", maxOutputTokens: 1200 });
    assert.equal(result.ok, true);
    assert.equal(result.partial, true);
    assert.match(result.message, /Contenido recuperable/);
    assert.equal(result.finishReason, "length");
});

test("the bridge rejects oversized document context before contacting Qwen", async () => {
    let calls = 0;
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async () => {
        calls++; return { ok: true, text: async () => JSON.stringify({ message: { content: "ignored" } }) };
    } });
    await assert.rejects(engine.respond({ input: "é".repeat(9000), semanticStage: "document_initial", maxOutputTokens: 8000 }), /DOCUMENT_CONTEXT_BUDGET_EXCEEDED/);
    assert.equal(calls, 0);
});

test("streaming reports actual characters before completion and preserves split UTF-8", async t => {
    const { createServer } = await import("node:http");
    let deliveredProgress = false;
    const service = createServer((req, res) => {
        req.resume(); res.writeHead(200, { "content-type": "application/x-ndjson" });
        const first = Buffer.from(JSON.stringify({ message: { content: "Cancún " }, done: false }) + "\n");
        const split = first.indexOf(Buffer.from("ú")) + 1;
        res.write(first.subarray(0, split));
        setTimeout(() => {
            res.write(first.subarray(split));
            setTimeout(() => {
                assert.equal(deliveredProgress, true);
                res.end(JSON.stringify({ message: { content: "México" }, done: true, done_reason: "length" }) + "\n");
            }, 30);
        }, 10);
    }).listen(0, "127.0.0.1");
    await new Promise(resolve => service.once("listening", resolve));
    t.after(() => { service.closeAllConnections(); service.close(); });
    const response = await fetchLocalSemanticResponse(`http://127.0.0.1:${service.address().port}/api/chat`, {
        method: "POST", body: "{}", signal: new AbortController().signal,
        onFrame: (frame, progress) => { if (!frame.done) { deliveredProgress = true; assert.equal(progress.generatedChars, 7); } }
    });
    const result = JSON.parse(await response.text());
    assert.equal(result.message.content, "Cancún México");
    assert.equal(result.done_reason, "length");
});

test("document checkpoints preserve long drafts and report storage failure honestly", () => {
    const values = new Map();
    const record = { id: "mission-current:md", content: "Borrador largo. ".repeat(600), title: "Propuesta" };
    const result = persistDocumentDraft(record, { setItem: (key, value) => values.set(key, value) });
    assert.equal(result.persisted, true);
    assert.equal(JSON.parse(values.get(result.key)).content, record.content);
    assert.equal(JSON.parse(values.get(result.key)).status, "UNVERIFIED_DRAFT");
    assert.equal(persistDocumentDraft(record, { setItem() { throw new Error("quota"); } }).persisted, false);
    const envelope = JSON.parse(documentEvidenceEnvelope([{ content: "é".repeat(3000) }]));
    assert.equal(envelope.coverage, "PARTIAL");
});
