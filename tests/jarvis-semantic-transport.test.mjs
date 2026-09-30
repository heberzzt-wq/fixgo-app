import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import fs from "node:fs";
import { runInNewContext } from "node:vm";
import { semanticPlanHandler, semanticResponseHandler, fetchLocalSemanticResponse } from "../jarvis-semantic-http.js";
import { createSelfHostedSemanticEngine } from "../jarvis-fs-bridge.js";
import { readSemanticStream, semanticPlanBudgetMs, semanticFailurePresentation, isSemanticTimeout } from "../gestia-core/jarvis/jarvis.semantic.transport.js";

const instruction = ("Audita el runtime.\n" + "Contexto verificable. ".repeat(180) + "\nNO MODIFICAR ARCHIVOS, NO PAGAR, NO PUBLICAR.\n" + "Evidencia real. ".repeat(150)).trim();
const catalog = [{ name: "repo.audit", description: "Audita el repositorio", mutates: false }];
const phase = { phase: "CURRENT_TURN", writeAllowed: false };
const describe = () => ({ ok: true, fallbackAllowed: false });
const result = { ok: true, toolCalls: [{ name: "repo.audit", args: {}, approved: false }], missionComplete: false };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test("a greeting after a final response retains the loaded context size across classification and reply", async () => {
    const requests = [];
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push({ url, body });
        const content = requests.length === 1 ? "La lectura termino."
            : requests.length === 2 ? JSON.stringify({ mode: "chat" }) : "Hola, buenas tardes, pariente.";
        return { ok: true, text: async () => JSON.stringify({ message: { content }, done_reason: "stop" }) };
    } });
    await engine.respond({ input: "Resume la lectura verificada." });
    const result = await engine.plan({ input: "hola buenas tardes",
        catalog: [{ name: "conversation.respond", mutates: false }],
        missionState: { phase: "CURRENT_TURN", conversationalGate: true }, timeoutMs: 60000 });
    assert.equal(requests.length, 3);
    assert.deepEqual(requests.map(x => x.body.options.num_ctx), [8192, 8192, 8192], "switching context forces Ollama to reload the same model");
    assert.ok(requests.every(x => x.url.endsWith("/api/chat")));
    assert.ok(requests.every(x => x.body.think === false), "bounded requests must not spend their answer budget on thinking");
    assert.equal(result.toolCalls[0].args.prompt, "Hola, buenas tardes, pariente.");
    assert.equal(result.inferenceReceipt.counters.localEmbeddingCalls, 0);
});

test("local inference transport waits for headers and preserves the complete response", async t => {
    const { createServer } = await import("node:http");
    let received;
    const upstream = createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        received = { method: req.method, body: Buffer.concat(chunks).toString(), token: req.headers.authorization };
        await wait(50);
        res.writeHead(200, { "content-type": "application/json" });
        res.write('{"message":{"content":"');
        await wait(30);
        res.end('verificado ✓"}}');
    }).listen(0, "127.0.0.1");
    await new Promise(resolve => upstream.once("listening", resolve));
    t.after(() => { upstream.closeAllConnections(); upstream.close(); });
    const response = await fetchLocalSemanticResponse(`http://127.0.0.1:${upstream.address().port}/api/chat`, {
        method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" },
        body: instruction, signal: AbortSignal.timeout(15000)
    });
    assert.equal(response.ok, true);
    assert.equal(JSON.parse(await response.text()).message.content, "verificado ✓");
    assert.deepEqual(received, { method: "POST", body: instruction, token: "Bearer test-only" });
});

test("local inference cancellation closes the socket before headers and during a partial body", async t => {
    const { createServer } = await import("node:http");
    for (const partialBody of [false, true]) {
        const controller = new AbortController();
        let closed;
        const disconnected = new Promise(resolve => { closed = resolve; });
        const upstream = createServer((req, res) => {
            req.resume();
            res.once("close", closed);
            if (partialBody) { res.writeHead(200); res.write('{"message":'); }
            setTimeout(() => controller.abort(new DOMException("deadline", "TimeoutError")), 30);
        }).listen(0, "127.0.0.1");
        await new Promise(resolve => upstream.once("listening", resolve));
        t.after(() => { upstream.closeAllConnections(); upstream.close(); });
        await assert.rejects(fetchLocalSemanticResponse(`http://127.0.0.1:${upstream.address().port}/api/chat`, {
            method: "POST", body: "{}", signal: controller.signal
        }), error => error.name === "AbortError" || error.name === "TimeoutError");
        await disconnected;
    }
});

test("local inference rejects truncated bodies and never follows redirects outside loopback", async t => {
    const { createServer } = await import("node:http");
    const upstream = createServer((req, res) => {
        req.resume();
        if (req.url === "/redirect") { res.writeHead(307, { location: "https://example.com/" }); res.end("redirect"); }
        else { res.writeHead(200, { "content-length": 100 }); res.write("partial"); setTimeout(() => res.destroy(), 10); }
    }).listen(0, "127.0.0.1");
    await new Promise(resolve => upstream.once("listening", resolve));
    t.after(() => { upstream.closeAllConnections(); upstream.close(); });
    const options = { method: "POST", body: "{}", signal: AbortSignal.timeout(15000) };
    const url = `http://127.0.0.1:${upstream.address().port}`;
    const redirect = await fetchLocalSemanticResponse(url + "/redirect", options);
    assert.equal(redirect.status, 307);
    assert.equal(redirect.ok, false);
    await assert.rejects(fetchLocalSemanticResponse(url + "/truncated", options), /aborted|reset|INCOMPLETE/i);
    await assert.rejects(fetchLocalSemanticResponse("https://example.com/", options), /LOOPBACK/);
});

test("local inference bounds response memory and requires cancellation", async t => {
    const { createServer } = await import("node:http");
    const upstream = createServer((req, res) => { req.resume(); res.end("x".repeat(2 * 1024 * 1024 + 1)); }).listen(0, "127.0.0.1");
    await new Promise(resolve => upstream.once("listening", resolve));
    t.after(() => { upstream.closeAllConnections(); upstream.close(); });
    const url = `http://127.0.0.1:${upstream.address().port}`;
    await assert.rejects(fetchLocalSemanticResponse(url, { method: "POST", body: "{}", signal: AbortSignal.timeout(15000) }), /TOO_LARGE/);
    await assert.rejects(fetchLocalSemanticResponse(url, { method: "POST" }), /DEADLINE_REQUIRED/);
});

test("default semantic engine uses the real local HTTP transport with the unchanged Qwen request", async t => {
    const { createServer } = await import("node:http");
    const calls = [];
    const upstream = createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        calls.push({ route: req.url, body });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(req.url === "/api/generate" ? { done: true } : { message: { content: JSON.stringify(result) } }));
    }).listen(0, "127.0.0.1");
    await new Promise(resolve => upstream.once("listening", resolve));
    t.after(() => { upstream.closeAllConnections(); upstream.close(); });
    const engine = createSelfHostedSemanticEngine({ env: { JARVIS_LOCAL_LLM_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1` } });
    const plan = await engine.plan({ input: instruction, catalog, missionState: phase });
    assert.equal(plan.ok, true);
    assert.equal(plan.missionComplete, false);
    assert.deepEqual(calls.map(call => call.route), ["/api/generate", "/api/chat"]);
    assert.equal(calls[1].body.model, "qwen3:1.7b");
    assert.equal(calls[1].body.messages[1].content, instruction);
    assert.equal(engine.describe().counters.semanticExternalCalls, 0);
});

async function server(t, engine, operation = "plan") {
    const app = express();
    app.use(express.json());
    app.post(`/semantic/${operation}`, (operation === "respond" ? semanticResponseHandler : semanticPlanHandler)(engine, { heartbeatMs: 10 }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    return (body, signal) => fetch(`http://127.0.0.1:${server.address().port}/semantic/${operation}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal
    });
}

test("long CURRENT_TURN keeps every constraint in the gate and operative prompt", async () => {
    const prefixes = [];
    for (const conversationalGate of [true, false]) {
        const engine = createSelfHostedSemanticEngine({ fetchImpl: async (_url, options) => {
            const body = JSON.parse(options.body);
            assert.ok(body.messages.some(message => message.content.includes(instruction)), "the complete instruction must reach Qwen");
            prefixes.push([body.messages[0], body.messages.at(-1)]);
            return { ok: true, text: async () => JSON.stringify({ message: { content: conversationalGate ? '{"mode":"tools"}' : JSON.stringify(result) } }) };
        }});
        const plan = await engine.plan({ input: instruction, catalog: conversationalGate ? [{ name: "conversation.respond" }] : catalog, missionState: { ...phase, conversationalGate } });
        assert.equal(plan.ok, true);
        assert.equal(plan.missionComplete, false);
    }
    assert.equal(prefixes[0][1].content, prefixes[1][1].content, "both phases preserve the complete original request");
    assert.match(prefixes[0][0].content, /Classify/);
});

test("CURRENT_TURN never replays an exhausted local deadline or truncated answer", async () => {
    const source = fs.readFileSync("gestia-core/gestia-core.js", "utf8");
    const start = source.indexOf('    async analizarIntencionLigera(');
    const end = source.indexOf('    async procesarIntencion(', start);
    assert.ok(start > 0 && end > start);
    for (const message of ["SEMANTIC_AUTHENTICATED_PROVIDER_LOCAL_SEMANTIC_TIMEOUT", "JARVIS_LOCAL_BRIDGE_TIMEOUT_REQUEST", "SEMANTIC_AUTHENTICATED_PROVIDER_SEMANTIC_RESPONSE_INCOMPLETE"]) {
        let calls = 0;
        const analyze = runInNewContext(`({${source.slice(start, end)}}).analizarIntencionLigera`, {
            JarvisSemanticMemory: { recall: async () => null },
            auth: { currentUser: { uid: "test" } },
            JarvisToolRuntime: { list: () => [{ name: "conversation.respond" }] },
            compactJarvisSemanticMemoryForPlanner: () => null,
            buildJarvisMultifunctionToolCalls: async () => { calls++; throw new Error(message); },
            isSemanticTimeout,
            isPermanentSemanticPlannerFailure: () => false,
            setTimeout: callback => callback(),
            console: { warn() {} }
        });
        await assert.rejects(analyze("Lee el contrato.", {}), error => error.message === message);
        assert.equal(calls, 1, message);
    }
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
    failNetwork = false;
    assert.equal((await bridge.requestJson("/semantic/respond", { input: instruction, timeoutMs: 180000 })).ok, false);
    assert.equal(calls, 3);
    failNetwork = true;
    await assert.rejects(bridge.requestJson("/semantic/respond", { input: instruction }), /Failed to fetch/);
    assert.equal(calls, 4, "final composition also has exactly one attempt");
});

test("browser permits delayed progress until the absolute semantic deadline, without replay", async t => {
    const { installJarvisLocalBridgeTransport } = await import("../modules/terminal/nexo-bootstrap.js");
    const oldFetch = globalThis.fetch;
    const oldBridge = globalThis.JarvisLocalBridge;
    t.after(() => { globalThis.fetch = oldFetch; globalThis.JarvisLocalBridge = oldBridge; });
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let signal, stream, accepted, calls = 0;
    let ready = new Promise(resolve => { accepted = resolve; });
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("jarvis-runtime-contract.json")) return Response.json({ releaseId: "test" });
        calls++;
        signal = options.signal;
        const body = new ReadableStream({ start(controller) {
            stream = controller;
            signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        } });
        accepted();
        return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
    };
    delete globalThis.JarvisLocalBridge;
    const bridge = installJarvisLocalBridgeTransport();
    const pending = bridge.requestJson("/semantic/respond", { input: "Resume la evidencia", timeoutMs: 60000 });
    // Keep rejection handled while testing the old premature cancellation.
    pending.catch(() => {});
    await ready;
    t.mock.timers.tick(25000);
    assert.equal(signal.aborted, false, "a pause in heartbeats is not the inference deadline");
    stream.enqueue(new TextEncoder().encode('{"type":"result","result":{"ok":true,"message":"Evidencia parcial"}}\n'));
    stream.close();
    assert.equal((await pending).message, "Evidencia parcial");

    ready = new Promise(resolve => { accepted = resolve; });
    const stalled = bridge.requestJson("/semantic/respond", { input: "Resume la evidencia", timeoutMs: 60000 });
    const rejected = assert.rejects(stalled, error => error.code === "JARVIS_LOCAL_BRIDGE_TIMEOUT_REQUEST" && error.timeoutReason === "ABSOLUTE_DEADLINE");
    await ready;
    t.mock.timers.tick(70001);
    await rejected;
    assert.equal(signal.aborted, true, "unresponsive work remains bounded");
    assert.equal(calls, 2, "neither accepted request is retried");
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
    assert.equal(semanticPlanBudgetMs({ input: "Hola", missionState: { ...phase, conversationalGate: true } }), 60000);
    assert.equal(semanticPlanBudgetMs({ input: "Lee el contrato", missionState: phase }), 120000);
    assert.equal(semanticPlanBudgetMs({ input: "x".repeat(120000), missionState: phase }), 600000);
    for (const error of ["JARVIS_LOCAL_BRIDGE_TIMEOUT_REQUEST", "SEMANTIC_AUTHENTICATED_PROVIDER_LOCAL_SEMANTIC_TIMEOUT"]) {
        assert.match(semanticFailurePresentation(error).title, /agotó/);
        assert.doesNotMatch(semanticFailurePresentation(error).title, /conexión|desconectado/);
    }
    assert.match(semanticFailurePresentation("Failed to fetch").title, /contactar/);
    assert.match(semanticFailurePresentation("LOCAL_TOOL_EMBEDDING_CACHE_WARMING").title, /análisis/);
});

test("final response receives an input-aware budget rather than the old three-minute cap", () => {
    const budget = semanticPlanBudgetMs({ input: instruction, maxOutputTokens: 256,
        timeoutMs: 180000, missionState: { phase: "FINAL_RESPONSE" } });
    assert.ok(budget > 180000);
    assert.ok(budget <= 600000);
});

test("final response cancellation reaches Ollama and never starts a replacement inference", async () => {
    let calls = 0;
    let abortReason;
    const controller = new AbortController();
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async (_url, options) => {
        calls++;
        await new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => { abortReason = options.signal.reason; reject(abortReason); }, { once: true });
            controller.abort(new Error("CALLER_CANCELLED"));
        });
    } });
    await assert.rejects(engine.respond({ input: "Resume la evidencia", signal: controller.signal, timeoutMs: 60 }), /CANCELLED|abort|TIMEOUT/i);
    assert.equal(calls, 1);
    assert.equal(abortReason?.message, "CALLER_CANCELLED");
});

test("final composition preserves the entire prompt and reserves context for its bounded answer", async () => {
    const prompt = instruction + "\nEVIDENCIA_FINAL=solo repo.search completado; diagnostico bloqueado.";
    let calls = 0;
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async (url, options) => {
        calls++;
        const body = JSON.parse(options.body);
        assert.match(url, /\/api\/chat$/);
        assert.equal(body.options.num_predict, 256);
        assert.equal(body.options.num_ctx, 8192);
        assert.equal(body.messages.at(-1).content, prompt);
        assert.equal(body.format, undefined, "a natural response must not be forced into JSON");
        return { ok: true, text: async () => JSON.stringify({ message: { content: "La misión quedó parcial: búsqueda completada y diagnóstico bloqueado." } }) };
    } });
    assert.equal((await engine.respond({ input: prompt, maxOutputTokens: 256 })).ok, true);
    assert.equal(calls, 1);
});

test("grounded conversation enforces presentation in the system role without affecting generic responses", async () => {
    const systems = [];
    const fullInput = instruction + "\n" + "Evidencia conservada. ".repeat(600) + "\nFINAL_INPUT_MUST_SURVIVE";
    const briefing = JSON.stringify({ missionStatus: "PARTIAL", executedTools: [{ tool: "repo.read", ok: true }] });
    const userRequest = "Lee contract.json y explica en tres lineas lo comprobado, sin cambiarlo.";
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.ok(body.messages.some(message => message.content === fullInput));
        if (systems.length === 0) {
            assert.ok(body.messages.at(-1).content.includes(briefing));
            assert.notEqual(body.messages.at(-1).content, fullInput);
            assert.match(body.messages.at(-1).content, /Respeta el formato/);
            assert.ok(body.messages.at(-1).content.endsWith(userRequest), "the actual user request remains the final response task");
            assert.ok(!body.messages.at(-1).content.includes("un solo parrafo"), "presentation must not override the user's requested format");
        }
        systems.push(body.messages[0].content);
        const content = systems.length === 1 ? JSON.stringify({ lines: ["La mision quedo parcial."] }) : "La mision quedo parcial.";
        assert.equal(body.format?.properties?.lines?.type, systems.length === 1 ? "array" : undefined);
        return { ok: true, text: async () => JSON.stringify({ message: { content } }) };
    } });
    await engine.respond({ input: fullInput, responseMode: "grounded_conversation", responseBriefing: briefing, responseInstruction: userRequest });
    await engine.respond({ input: fullInput });
    assert.ok(systems[0].includes("No copies etiquetas internas"));
    assert.ok(systems[0].includes("100 palabras"));
    assert.ok(!systems[1].includes("No copies etiquetas internas"), "structured artifact drafting keeps its existing contract");
    await assert.rejects(engine.respond({ input: fullInput, responseMode: "grounded_conversation" }), /BRIEFING_REQUIRED/);
});

test("final response streams until completion, keeps JSON compatibility and cancels disconnected work", async t => {
    let calls = 0;
    const reply = { ok: true, message: "Evidencia parcial; la misión no se completó." };
    const post = await server(t, { describe, respond: async body => {
        calls++;
        assert.equal(body.input, instruction);
        await wait(65);
        return reply;
    } }, "respond");
    const frames = [];
    const result = await readSemanticStream(await post({ input: instruction, streamProgress: true, timeoutMs: 180000 }), { onProgress: frame => frames.push(frame) });
    assert.equal(result.message, reply.message);
    assert.ok(frames.length >= 3);
    assert.ok(frames.every(frame => frame.stage === "final_response" && !Object.hasOwn(frame, "ok")));
    assert.ok(frames[0].budgetMs > 180000);
    assert.equal((await (await post({ input: instruction })).json()).message, reply.message);
    assert.equal(calls, 2);
    let cancelled;
    const cancelledPromise = new Promise(resolve => { cancelled = resolve; });
    const cancelPost = await server(t, { describe, respond: body => new Promise((_resolve, reject) => {
        body.signal.addEventListener("abort", () => { cancelled(); reject(new Error("ABORTED")); }, { once: true });
    }) }, "respond");
    const controller = new AbortController();
    const response = await cancelPost({ streamProgress: true }, controller.signal);
    controller.abort();
    await cancelledPromise;
    await response.body.cancel().catch(() => {});
    const failedPost = await server(t, { describe, respond: async () => { throw new Error("COMPOSITION_FAILED"); } }, "respond");
    assert.equal((await readSemanticStream(await failedPost({ streamProgress: true }))).ok, false);
});

test("repo diagnosis preserves authoritative read failures and the exact target", async () => {
    const source = fs.readFileSync(new URL("../gestia-core/tools.runtime.js", import.meta.url), "utf8");
    const nameAt = source.indexOf('name: "repo.diagnose"');
    const start = source.lastIndexOf("JarvisToolRuntime.register({", nameAt);
    const end = source.indexOf("JarvisToolRuntime.register({", nameAt);
    for (const status of ["FILE_NOT_FOUND", "FILE_TOO_LARGE"]) {
        let tool;
        const target = "gestia-core/nonexistent.js";
        runInNewContext(source.slice(start, end), {
            JarvisToolRuntime: { register(value) { tool = value; } },
            parseRepositoryTarget: () => null,
            window: { JarvisLocalBridge: { readFile: async () => ({ ok: false, status, error: status, file: target, source: "real_bridge" }) } },
            console: { warn() {} }
        });
        const result = await tool.execute({ file: target });
        assert.equal(result.ok, false);
        assert.equal(result.status, status);
        assert.equal(result.file, target);
        assert.equal(result.source, "real_bridge");
    }
});

test("terminal progress honors partial mission and failed composition inside a successful envelope", () => {
    const html = fs.readFileSync(new URL("../gestia-terminal.html", import.meta.url), "utf8");
    const start = html.indexOf("window.JarvisWorkTrace = (() => {");
    const source = html.slice(start, html.indexOf("})();", start) + 5);
    const element = () => {
        const selectors = new Map();
        return { dataset: {}, children: [], textContent: "", innerHTML: "",
            appendChild(child) { this.children.push(child); },
            querySelector(selector) { if (!selectors.has(selector)) selectors.set(selector, element()); return selectors.get(selector); }
        };
    };
    for (const failed of [true, false]) {
        const window = { addEventListener() {} };
        runInNewContext(source, { window, document: { createElement: element }, output: element(), requestAnimationFrame: cb => cb() });
        const tracker = window.JarvisWorkTrace.start();
        tracker.resolveOutcome?.({ status: "success", result: {
            mission: { status: failed ? "PARTIAL" : "COMPLETED", completedTasks: [{ name: "repo.search" }] },
            finalResponse: { ok: !failed, source: failed ? "CONVERSATIONAL_COMPOSITION_FAILED" : "EVIDENCE_GROUNDED_CONVERSATION", text: "Resultado" }
        } });
        tracker.complete("core", "Ejecución principal completada");
        tracker.complete("evidence", "Evidencia integrada");
        tracker.complete("response", "Respuesta preparada");
        tracker.finish("Trabajo completado");
        const summary = tracker.wrapper.querySelector('[data-role="summary"]').textContent;
        const rows = tracker.wrapper.querySelector('[data-role="steps"]').children;
        if (failed) {
            assert.notEqual(summary, "Trabajo completado");
            assert.equal(rows.find(row => row.dataset.workStep === "core").dataset.state, "failed");
            assert.equal(rows.find(row => row.dataset.workStep === "response").dataset.state, "failed");
            assert.ok(rows.find(row => row.dataset.workStep === "evidence").innerHTML.includes("parcial"));
        } else {
            assert.equal(summary, "Trabajo completado");
            assert.ok(rows.every(row => row.dataset.state === "completed"));
        }
    }
});
