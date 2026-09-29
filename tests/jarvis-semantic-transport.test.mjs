import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { semanticPlanHandler } from "../jarvis-semantic-http.js";
import { createSelfHostedSemanticEngine } from "../jarvis-fs-bridge.js";
import { readSemanticStream, semanticPlanBudgetMs, semanticFailurePresentation } from "../gestia-core/jarvis/jarvis.semantic.transport.js";

const instruction = ("Audita el runtime.\n" + "Contexto verificable. ".repeat(180) + "\nNO MODIFICAR ARCHIVOS, NO PAGAR, NO PUBLICAR.\n" + "Evidencia real. ".repeat(150)).trim();
const catalog = [{ name: "repo.audit", description: "Audita el repositorio", mutates: false }];
const phase = { phase: "CURRENT_TURN", writeAllowed: false };
const describe = () => ({ ok: true, fallbackAllowed: false });
const result = { ok: true, toolCalls: [{ name: "repo.audit", args: {}, approved: false }], missionComplete: false };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function server(t, engine) {
    const app = express();
    app.use(express.json());
    app.post("/semantic/plan", semanticPlanHandler(engine, { heartbeatMs: 10 }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    return (body, signal) => fetch(`http://127.0.0.1:${server.address().port}/semantic/plan`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal
    });
}

test("long CURRENT_TURN keeps every constraint in the gate and operative prompt", async () => {
    const prefixes = [];
    for (const conversationalGate of [true, false]) {
        const engine = createSelfHostedSemanticEngine({ fetchImpl: async (_url, options) => {
            const body = JSON.parse(options.body);
            assert.ok(body.messages.some(message => message.content.includes(instruction)), "the complete instruction must reach Qwen");
            prefixes.push(body.messages.slice(0, 2));
            return { ok: true, text: async () => JSON.stringify({ message: { content: conversationalGate ? '{"direct":false}' : JSON.stringify(result) } }) };
        }});
        const plan = await engine.plan({ input: instruction, catalog: conversationalGate ? [{ name: "conversation.respond" }] : catalog, missionState: { ...phase, conversationalGate } });
        assert.equal(plan.ok, true);
        assert.equal(plan.missionComplete, false);
    }
    assert.deepEqual(prefixes[0], prefixes[1], "both phases reuse the same complete prefix");
});

test("browser transport sends one streamed plan and preserves the final failure", async t => {
    const { installJarvisLocalBridgeTransport } = await import("../modules/terminal/nexo-bootstrap.js");
    const oldFetch = globalThis.fetch;
    const oldBridge = globalThis.JarvisLocalBridge;
    let calls = 0;
    let failNetwork = false;
    t.after(() => { globalThis.fetch = oldFetch; globalThis.JarvisLocalBridge = oldBridge; });
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("jarvis-runtime-contract.json")) return Response.json({ releaseId: "test" });
        calls++;
        assert.equal(options.headers["X-Jarvis-Release-Id"], "test");
        const body = JSON.parse(options.body);
        assert.equal(body.input, instruction);
        assert.equal(body.streamProgress, true);
        assert.ok(body.timeoutMs > 70000);
        if (failNetwork) throw new TypeError("Failed to fetch");
        return new Response('{"type":"progress","stage":"inference"}\n' +
            '{"type":"result","result":{"ok":false,"error":"LOCAL_SEMANTIC_TIMEOUT"}}\n', {
            headers: { "content-type": "application/x-ndjson" }
        });
    };
    delete globalThis.JarvisLocalBridge;
    const bridge = installJarvisLocalBridgeTransport();
    const body = { input: instruction, missionState: phase };
    assert.equal((await bridge.requestJson("/semantic/plan", body)).ok, false);
    assert.equal(calls, 1);
    failNetwork = true;
    await assert.rejects(bridge.requestJson("/semantic/plan", body), /Failed to fetch/);
    assert.equal(calls, 2, "a possibly accepted semantic request must never be submitted twice");
});

test("long mission contract retains the shared full-input prefix and an adequate budget", async () => {
    const missionState = { phase: "MISSION_CONTRACT", existingInitialTools: ["repo.audit"], writeAllowed: false };
    assert.ok(semanticPlanBudgetMs({ input: instruction, missionState, timeoutMs: 90000 }) > 90000);
    const contractCatalog = [...catalog, ...Array.from({ length: 9 }, (_, i) => ({ name: `repo.inspect${i}`, description: "Inspeccion read-only", mutates: false }))];
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.messages[1].content, instruction);
        assert.equal(body.messages[0].role, "system");
        assert.ok(body.format.properties.toolCalls);
        const task = JSON.parse(body.messages.at(-1).content);
        assert.equal(task.phase, "MISSION_CONTRACT");
        assert.ok(task.catalog.some(tool => tool.name === "repo.audit"));
        return { ok: true, text: async () => JSON.stringify({ message: { content: JSON.stringify(result) } }) };
    }});
    const plan = await engine.plan({ input: instruction, catalog: contractCatalog, missionState });
    assert.equal(plan.ok, true);
    assert.equal(plan.missionComplete, false);
});

test("planner retries share one deadline and abort the active local request", async () => {
    let calls = 0;
    let aborted = false;
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async (_url, options) => {
        calls++;
        if (calls === 1) { await wait(40); return { ok: true, text: async () => '{"message":{"content":"{}"}}' }; }
        await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 150);
            options.signal.addEventListener("abort", () => { aborted = true; clearTimeout(timer); reject(options.signal.reason); }, { once: true });
        });
        return { ok: true, text: async () => JSON.stringify({ message: { content: JSON.stringify(result) } }) };
    }});
    await assert.rejects(engine.plan({ input: "Audita", catalog, missionState: phase, timeoutMs: 100 }), /TIMEOUT|DEADLINE/);
    assert.equal(aborted, true);
});

test("slow plan streams progress until a final result; heartbeat never reports mission success", async t => {
    let calls = 0;
    const post = await server(t, { describe, plan: async body => { calls++; assert.equal(body.input, instruction); body.onProgress("inference"); await wait(65); return result; } });
    const frames = [];
    const response = await post({ input: instruction, missionState: phase, streamProgress: true, timeoutMs: 60000 });
    assert.equal(response.status, 200);
    const receipt = await readSemanticStream(response, { onProgress: frame => frames.push(frame) });
    assert.equal(calls, 1);
    assert.ok(frames.length >= 3);
    assert.ok(frames.every(frame => !Object.hasOwn(frame, "ok")));
    assert.ok(frames[0].budgetMs > 60000);
    assert.deepEqual(receipt.toolCalls, result.toolCalls);
    assert.equal(receipt.missionComplete, false);
});

test("stream errors stay failures and disconnection cancels the engine", async t => {
    const post = await server(t, { describe, plan: async () => { throw new Error("LOCAL_SEMANTIC_TIMEOUT"); } });
    const failure = await readSemanticStream(await post({ streamProgress: true }));
    assert.equal(failure.ok, false);
    assert.equal(failure.error, "LOCAL_SEMANTIC_TIMEOUT");
    let cancelled;
    const cancelledPromise = new Promise(resolve => { cancelled = resolve; });
    const cancelPost = await server(t, { describe, plan: body => new Promise((_resolve, reject) => {
        body.signal.addEventListener("abort", () => { cancelled(); reject(new Error("ABORTED")); }, { once: true });
    }) });
    const controller = new AbortController();
    const response = await cancelPost({ streamProgress: true }, controller.signal);
    controller.abort();
    await cancelledPromise;
    await response.body.cancel().catch(() => {});
});

test("legacy JSON stays compatible; incomplete streams never become success", async t => {
    const post = await server(t, { describe, plan: async () => result });
    assert.equal((await (await post({})).json()).ok, true);
    await assert.rejects(readSemanticStream(new Response('{"type":"progress"}\n')), /INCOMPLETE/);
    const failedPost = await server(t, { describe, plan: async () => { throw new Error("BACKEND_FAILED"); } });
    assert.equal((await failedPost({})).status, 502);
});

test("budgets are bounded and semantic timeouts never claim an offline bridge", () => {
    assert.equal(semanticPlanBudgetMs({ input: "Hola", missionState: phase }), 60000);
    assert.equal(semanticPlanBudgetMs({ input: "x".repeat(120000), missionState: phase }), 600000);
    for (const error of ["JARVIS_LOCAL_BRIDGE_TIMEOUT_REQUEST", "SEMANTIC_AUTHENTICATED_PROVIDER_LOCAL_SEMANTIC_TIMEOUT"]) {
        assert.match(semanticFailurePresentation(error).title, /agotó/);
        assert.doesNotMatch(semanticFailurePresentation(error).title, /conexión|desconectado/);
    }
    assert.match(semanticFailurePresentation("Failed to fetch").title, /contactar/);
    assert.match(semanticFailurePresentation("LOCAL_TOOL_EMBEDDING_CACHE_WARMING").title, /análisis/);
});
