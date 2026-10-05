import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

test("grounding focuses the current operation while retaining the full mission as context", async () => {
    const original = "Consulta originales, crea un anuncio y exporta el PNG a Salidas.";
    const operation = "consultar originales de la biblioteca local de materiales";
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.ok(body.messages[1].content.startsWith(operation));
        assert.ok(body.messages[1].content.includes("FILE_NOT_FOUND:missing.json"));
        assert.equal(body.options.temperature,0.2);
        assert.ok(body.messages[0].content.includes(original));
        assert.ok(body.messages[0].content.includes("ARTEFACTOS_PRODUCIDOS=[]"));
        return { ok:true, text:async()=>JSON.stringify({message:{content:JSON.stringify({toolCalls:[{name:"media.library",args:{action:"list"}}],missionComplete:false})},done_reason:"stop"}) };
    }});
    const plan = await engine.plan({input:`INSTRUCCION_ORIGINAL=${original}\nARTEFACTOS_PRODUCIDOS=[]`,catalog:[{name:"media.library",description:"Consulta originales o exporta un artefacto existente",inputSchema:{type:"object",properties:{action:{type:"string",enum:["list","import","export"]}},required:["action"]}}],missionState:{phase:"GROUNDED_ARGUMENT_COMPLETION",currentOperation:operation,argumentValidationFeedback:"FILE_NOT_FOUND:missing.json"}});
    assert.deepEqual(plan.toolCalls[0].args,{action:"list"});
});

test("grounded operation uses JSON mode and validates the returned tool arguments independently", async () => {
    const output=".jarvis-artifacts/images/current.png";
    const engine=createSelfHostedSemanticEngine({fetchImpl:async(_url,options)=>{
        const body=JSON.parse(options.body);
        assert.deepEqual(body.format.properties.toolCalls.items.properties.name.enum,["media.library"]);
        assert.deepEqual(body.format.properties.toolCalls.items.properties.args.properties.action.enum,["list","import","export"]);
        assert.deepEqual(body.format.properties.toolCalls.items.properties.args.required,["action"]);
        assert.ok(body.messages[0].content.includes("OPERACION_ACTUAL_DEL_PLAN"));
        return {ok:true,text:async()=>JSON.stringify({message:{content:JSON.stringify({toolCalls:[{name:"media.library",args:{action:"export",output}}],missionComplete:false})},done_reason:"stop"})};
    }});
    const plan=await engine.plan({input:"OPERACION_ACTUAL_DEL_PLAN=exportar el archivo creado",catalog:[{name:"media.library",description:"Consulta originales o exporta un artefacto existente",inputSchema:{type:"object",properties:{action:{type:"string",enum:["list","import","export"]},output:{type:"string"}},required:["action"]}}],missionState:{phase:"GROUNDED_ARGUMENT_COMPLETION"}});
    assert.deepEqual(plan.toolCalls[0].args,{action:"export",output});
});

test("conditional export schema requires a produced artifact and rejects a missing output", async () => {
    let calls=0;
    const output=".jarvis-artifacts/images/produced.jpg";
    const engine=createSelfHostedSemanticEngine({fetchImpl:async(_url,options)=>{
        calls++;
        const body=JSON.parse(options.body),schema=body.format.properties.toolCalls.items.properties.args;
        assert.equal(schema.properties,undefined,"conditional branches must be complete grammar alternatives");
        const branch=schema.anyOf.find(item=>item.properties.action.enum[0]==="export");
        assert.deepEqual(branch.required,["action","output"]);
        assert.deepEqual(branch.properties.output.enum,[output]);
        const args=calls===1?{action:"export"}:{action:"export",output};
        return {ok:true,text:async()=>JSON.stringify({message:{content:JSON.stringify({toolCalls:[{name:"media.library",args}],missionComplete:false})},done_reason:"stop"})};
    }});
    const plan=await engine.plan({input:"Exportar el anuncio existente",catalog:[{name:"media.library",inputSchema:{type:"object",properties:{action:{type:"string",enum:["list","export"]},output:{type:"string",enum:[output]}},required:["action"],anyOf:[{properties:{action:{const:"list"}},required:["action"]},{properties:{action:{const:"export"}},required:["action","output"]}]}}],missionState:{phase:"GROUNDED_ARGUMENT_COMPLETION"}});
    assert.equal(calls,2);
    assert.deepEqual(plan.toolCalls[0].args,{action:"export",output});
});

test("creative copy repair treats rejected history as creative context rather than immutable copy", async () => {
    const engine=createSelfHostedSemanticEngine({fetchImpl:async(_url,options)=>{
        const body=JSON.parse(options.body);
        assert.equal(body.options.temperature,0.6);
        assert.ok(body.messages[0].content.includes("redactor publicitario"));
        assert.ok(!body.messages[0].content.includes("CONTEXTO_Y_EVIDENCIA_INMUTABLES"));
        assert.ok(body.messages[1].content.includes("Mensaje anterior"));
        return {ok:true,text:async()=>JSON.stringify({message:{content:JSON.stringify({toolCalls:[{name:"image.adapt",args:{composition:{headline:"¿Tienes claros tus próximos pasos?",body:"Revisa tus opciones con asesoría fiscal."}}}],missionComplete:false})},done_reason:"stop"})};
    }});
    const plan=await engine.plan({input:"Marca observada: SUMMIT. Mensaje anterior rechazado.",catalog:[{name:"image.adapt",inputSchema:{type:"object",properties:{composition:{type:"object",properties:{headline:{type:"string"},body:{type:"string"}},required:["headline","body"]}},required:["composition"]}}],missionState:{phase:"GROUNDED_ARGUMENT_COMPLETION",creativeCopyRepair:true,currentOperation:"Redactar otro texto",argumentValidationFeedback:"MESSAGE_REPEATED"}});
    assert.equal(plan.toolCalls[0].args.composition.headline,"¿Tienes claros tus próximos pasos?");
});

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
    await assert.rejects(fetchLocalSemanticResponse(url, { method: "POST" }), /CANCELLATION_SIGNAL_REQUIRED/);
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

test("document repair heartbeats identify the tool stage instead of claiming a final answer", async t => {
    const request = await server(t, { describe, respond: async () => ({ ok: true, message: "Borrador" }) }, "respond");
    for (const stage of ["document_initial", "document_segment", "document_repair", "untrusted_label"]) {
        const response = await request({ input: "Redacta", streamProgress: true, semanticStage: stage, recoveryAttempt: 2 });
        const frames = (await response.text()).trim().split("\n").map(JSON.parse);
        assert.equal(frames[0].stage, stage === "untrusted_label" ? "final_response" : stage);
        assert.equal(frames[0].recoveryAttempt, stage === "untrusted_label" ? 0 : 2);
        assert.equal(frames[0].noDeadline, true);
        assert.equal(frames.at(-1).result.message, "Borrador");
    }
});

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
    for (const message of ["SEMANTIC_AUTHENTICATED_PROVIDER_LOCAL_SEMANTIC_TIMEOUT", "JARVIS_LOCAL_BRIDGE_TIMEOUT_REQUEST", "SEMANTIC_AUTHENTICATED_PROVIDER_SEMANTIC_RESPONSE_INCOMPLETE", "SEMANTIC_AUTHENTICATED_PROVIDER_LOCAL_SEMANTIC_RESPONSE_EMPTY"]) {
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
        assert.equal(body.noDeadline, true);
        assert.equal(Object.hasOwn(body, "timeoutMs"), false);
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

test("browser semantic streaming has no absolute deadline while the local request remains alive", async t => {
    const { installJarvisLocalBridgeTransport } = await import("../modules/terminal/nexo-bootstrap.js");
    const oldFetch = globalThis.fetch;
    const oldBridge = globalThis.JarvisLocalBridge;
    t.after(() => { globalThis.fetch = oldFetch; globalThis.JarvisLocalBridge = oldBridge; });
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let signal, stream, accepted, calls = 0;
    const payloads = [];
    let ready = new Promise(resolve => { accepted = resolve; });
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("jarvis-runtime-contract.json")) return Response.json({ releaseId: "test" });
        calls++;
        signal = options.signal;
        payloads.push(JSON.parse(options.body));
        const body = new ReadableStream({ start(controller) {
            stream = controller;
            signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        } });
        accepted();
        return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
    };
    delete globalThis.JarvisLocalBridge;
    const bridge = installJarvisLocalBridgeTransport();

    const first = bridge.requestJson("/semantic/respond", { input: "Resume la evidencia", timeoutMs: 60000 });
    await ready;
    t.mock.timers.tick(25000);
    assert.equal(signal.aborted, false);
    assert.equal(payloads[0].noDeadline, true);
    stream.enqueue(new TextEncoder().encode('{"type":"result","result":{"ok":true,"message":"Evidencia parcial"}}\n'));
    stream.close();
    assert.equal((await first).message, "Evidencia parcial");

    ready = new Promise(resolve => { accepted = resolve; });
    const longRunning = bridge.requestJson("/semantic/respond", { input: "Continua analizando", timeoutMs: 60000 });
    await ready;
    t.mock.timers.tick(10 * 60 * 1000);
    assert.equal(signal.aborted, false, "LOCAL_ONLY semantic work must not die from an artificial wall-clock deadline");
    stream.enqueue(new TextEncoder().encode('{"type":"result","result":{"ok":true,"message":"Analisis terminado"}}\n'));
    stream.close();
    assert.equal((await longRunning).message, "Analisis terminado");
    assert.equal(payloads[1].noDeadline, true);
    assert.equal(calls, 2, "accepted semantic work is never replayed");
});

test("noDeadline lets local semantic response outlive an explicitly tiny timeout", async () => {
    let calls = 0;
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async () => {
        calls++;
        await wait(40);
        return { ok: true, text: async () => JSON.stringify({ message: { content: "Respuesta completa" }, done_reason: "stop" }) };
    } });
    const response = await engine.respond({
        input: "Continua hasta terminar.",
        timeoutMs: 5,
        noDeadline: true
    });
    assert.equal(response.ok, true);
    assert.equal(response.message, "Respuesta completa");
    assert.equal(calls, 1);
});

test("current conversation does not replay unrelated history into the Qwen gate", async () => {
    const captured = [];
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        captured.push(body);
        if (body.format?.properties?.stillMissing) {
            return { ok: true, text: async () => JSON.stringify({ message: { content: '{"stillMissing":true,"action":""}' }, done_reason: "stop" }) };
        }
        return {
            ok: true,
            text: async () => JSON.stringify({
                message: {
                    content: JSON.stringify({
                        missing: "detalle",
                        mode: "clarify",
                        question: "¿Qué detalle quieres continuar?",
                        action: ""
                    }),
                    done_reason: "stop"
                }
            })
        };
    } });
    const turns = Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `turno-${index + 1}: contexto persistente`,
        ...(index === 7 ? { status: "CLARIFICATION_REQUIRED" } : {})
    }));
    const plan = await engine.plan({
        input: "continua con eso",
        catalog: [{ name: "conversation.respond", description: "Conversacion", mutates: false }],
        missionState: {
            phase: "CURRENT_TURN",
            conversationalGate: true,
            advisorySemanticContext: { turns }
        },
        noDeadline: true
    });
    const serialized = JSON.stringify(captured.map(body => body.messages || []));
    assert.doesNotMatch(serialized, /turno-1: contexto persistente/);
    assert.doesNotMatch(serialized, /turno-8: contexto persistente/);
    assert.equal(plan.toolCalls[0].name, "conversation.respond");
});

test("mission decomposition retains the full instruction; selection is scoped to its operation", async () => {
    const missionState = { phase: "MISSION_CONTRACT", existingInitialTools: ["repo.audit"], writeAllowed: false };
    assert.ok(semanticPlanBudgetMs({ input: instruction, missionState, timeoutMs: 90000 }) > 90000);
    const contractCatalog = [...catalog, ...Array.from({ length: 9 }, (_, i) => ({ name: `repo.inspect${i}`, description: "Inspeccion read-only", mutates: false }))];
    const engine = createSelfHostedSemanticEngine({ env: {...process.env,JARVIS_TOOL_EMBEDDING_CACHE_PATH:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-contract-')),'cache.json')}, fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        if (body.input) {
            if (body.input.length === 1 && body.input[0].includes("audit repository")) {
                assert.match(body.input[0], /^Instruct: Given a software assistant operation,/);
                assert.ok(body.input[0].endsWith("\nQuery:audit repository"));
            } else {
                assert.ok(body.input.every(text=>!text.startsWith("Instruct:")), "catalog documents stay raw");
            }
            return {ok:true,text:async()=>JSON.stringify({embeddings:body.input.map(()=>[1,0])})};
        }
        assert.equal(body.messages[0].role, "system");
        if (body.messages.at(-1).content === instruction) {
            assert.equal(body.messages.at(-1).content, instruction);
            assert.equal(body.format.properties.work.type, "string", 'one complete result operation has native shape without a tool-name enum');
            assert.equal(body.format.properties.verification.type,"string","requested executable verification remains independent of creation");
            assert.match(body.messages[0].content,/\/no_think$/);
            assert.equal(body.think, false);
            assert.ok(body.options.num_predict >= 256);
            return {ok:true,text:async()=>JSON.stringify({message:{content:JSON.stringify({sourceReview:'',work:'audit repository',delivery:''})},done_reason:'stop'})};
        }
        assert.equal(body.messages.at(-1).role, 'user', 'select only for the operation already decided from the full instruction');
        assert.equal(body.think, false);
        assert.equal(body.format, undefined, "native selection uses empty function parameters");
        assert.ok(body.tools.some(tool=>tool.function.name==="repo.audit"));
        const task = JSON.parse(body.messages.at(-1).content);
        assert.equal(task.operation, "audit repository");
        assert.equal(task.catalog,undefined);
        return { ok: true, text: async () => JSON.stringify({ message: { content: JSON.stringify({name:'repo.audit'}) } }) };
    }});
    const plan = await engine.plan({ input: instruction, catalog: contractCatalog, missionState });
    assert.equal(plan.ok, true);
    assert.equal(plan.missionComplete, false);
});

test("compact contract accepts one exact name and rejects multiple or invented names", async () => {
    for (const names of [["repo.audit"],["repo.audit","repo.read"],["invented.tool"]]) {
        const engine=createSelfHostedSemanticEngine({env:{...process.env,JARVIS_TOOL_EMBEDDING_CACHE_PATH:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-native-select-')),'cache.json')},fetchImpl:async(_url,options)=>{
            const body=JSON.parse(options.body);
            if(body.input)return{ok:true,text:async()=>JSON.stringify({embeddings:body.input.map(()=>[1,0])})};
            if(body.format?.properties.work)return{ok:true,text:async()=>JSON.stringify({message:{content:JSON.stringify({sourceReview:'auditar repositorio',work:[],delivery:''})},done_reason:'stop'})};
            assert.ok(body.tools.some(tool=>tool.function.name==='repo.audit'));
            return{ok:true,text:async()=>JSON.stringify({message:{content:JSON.stringify({name:names.length===1?names[0]:names})},done_reason:'stop'})};
        }});
        const operation=engine.plan({input:'native-contract',catalog,missionState:{phase:'MISSION_CONTRACT'}});
        if(names.length===1&&names[0]==='repo.audit') assert.deepEqual((await operation).toolCalls.map(call=>call.name),names);
        else await assert.rejects(operation,/SEMANTIC_CONTRACT_SELECTION_INVALID/);
    }
});

test("verification retains Qwen's contract stage and selects a name without execution arguments", async () => {
    const engine=createSelfHostedSemanticEngine({env:{...process.env,JARVIS_TOOL_EMBEDDING_CACHE_PATH:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-verification-')),'cache.json')},fetchImpl:async(_url,options)=>{
        const body=JSON.parse(options.body);
        if(body.input)return{ok:true,text:async()=>JSON.stringify({embeddings:body.input.map(()=>[1,0])})};
        if(body.format?.properties.work)return{ok:true,text:async()=>JSON.stringify({message:{content:JSON.stringify({sourceReview:'',work:'',verification:'ejecutar las pruebas solicitadas',delivery:''})},done_reason:'stop'})};
        const current=JSON.parse(body.messages.at(-1).content);
        assert.equal(current.stage,'verification');
        assert.equal(body.tools,undefined);
        assert.deepEqual(Object.keys(body.format.properties),['name']);
        assert.ok(body.format.properties.name.enum.includes('tests.run'));
        return{ok:true,text:async()=>JSON.stringify({message:{content:'{"name":"tests.run"}'},done_reason:'stop'})};
    }});
    const plan=await engine.plan({input:'Ejecuta las pruebas relevantes del cambio preparado.',catalog:[{name:'tests.run',description:'Ejecuta pruebas del repositorio'},{name:'repo.prepareWrite',description:'Prepara cambios del código'}],missionState:{phase:'MISSION_CONTRACT'}});
    assert.deepEqual(plan.toolCalls.map(call=>call.name),['tests.run']);
    assert.deepEqual(plan.toolCalls[0].args,{});
});

test("empty contract selection recovers the same operation with a name-only schema", async () => {
    let nativeAttempts=0,recovered=0;
    const engine=createSelfHostedSemanticEngine({env:{...process.env,JARVIS_TOOL_EMBEDDING_CACHE_PATH:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-contract-recovery-')),'cache.json')},fetchImpl:async(_url,options)=>{
        const body=JSON.parse(options.body);
        if(body.input)return{ok:true,text:async()=>JSON.stringify({embeddings:body.input.map(()=>[1,0])})};
        if(body.format?.properties.work)return{ok:true,text:async()=>JSON.stringify({message:{content:JSON.stringify({sourceReview:'',work:'crear un archivo HTML descargable',verification:'',delivery:''})},done_reason:'stop'})};
        if(body.tools){nativeAttempts++;return{ok:true,text:async()=>JSON.stringify({message:{content:''},done_reason:'stop'})};}
        recovered++;
        assert.deepEqual(Object.keys(body.format.properties),['name']);
        const original=JSON.parse(body.messages.at(-1).content);
        assert.equal(original.operation,'crear un archivo HTML descargable');
        assert.equal(original.stage,'work');
        assert.ok(body.messages[0].content.includes('CANDIDATE_TOOLS='));
        return{ok:true,text:async()=>JSON.stringify({message:{content:'{"name":"page.create"}'},done_reason:'stop'})};
    }});
    const plan=await engine.plan({input:'Crea un HTML descargable.',catalog:[{name:'page.create',description:'Crea HTML descargable'},{name:'page.compose',description:'Prepara un esquema JSON'}],missionState:{phase:'MISSION_CONTRACT'}});
    assert.equal(nativeAttempts,1);assert.equal(recovered,1);
    assert.deepEqual(plan.toolCalls.map(call=>call.name),['page.create']);
    assert.deepEqual(plan.toolCalls[0].args,{});
});

test("planner retries remain alive without an artificial local deadline", async () => {
    let calls = 0;
    let aborted = false;
    const engine = createSelfHostedSemanticEngine({ fetchImpl: async (_url, options) => {
        calls++;
        if (calls === 1) {
            await wait(40);
            return { ok: true, text: async () => '{"message":{"content":"{}"}}' };
        }
        await new Promise(resolve => {
            const timer = setTimeout(resolve, 150);
            options.signal.addEventListener("abort", () => {
                aborted = true;
                clearTimeout(timer);
                resolve();
            }, { once: true });
        });
        return { ok: true, text: async () => JSON.stringify({ message: { content: JSON.stringify(result) } }) };
    }});
    const plan = await engine.plan({
        input: "Audita",
        catalog,
        missionState: phase,
        timeoutMs: 100
    });
    assert.equal(plan.ok, true);
    assert.equal(aborted, false);
    assert.ok(calls >= 2);
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
    assert.equal(frames[0].budgetMs, null);
    assert.equal(frames[0].noDeadline, true);
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
    assert.ok(frames.length >= 1, "streaming must expose progress before the final result");
    assert.ok(frames.every(frame => frame.stage === "final_response" && !Object.hasOwn(frame, "ok")));
    assert.equal(frames[0].budgetMs, null);
    assert.equal(frames[0].noDeadline, true);
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
