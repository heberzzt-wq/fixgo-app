import assert from "node:assert/strict";
import { test } from "node:test";
import planner from "../functions/jarvis-semantic-planner.js";
import { createSelfHostedSemanticEngine } from "../jarvis-fs-bridge.js";
import { buildJarvisMultifunctionToolCalls } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";

const input = "QUIERO QUE HAGAS MARKETING PARA https://www.summ.com.mx/ SUMMIT FIRMA DE ABOGADOS EN CANCÚN QUINTANA ROO Y MARKETING A NIVEL NACIONAL Y CON ARCHIVOS DESCARGABLES";
const catalog = [{ name: "marketing.plan", description: "Produce una campaña desde la instrucción completa.", mutates: false,
    semanticArgumentCompletion: true, inputSchema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] } }];
const missionState = { phase: "CURRENT_TURN", conversationalGate: false, writeAllowed: false };
const reply = (message, done_reason = "stop") => ({ ok: true, status: 200, text: async () => JSON.stringify({ message, done_reason }) });

test("grounded completion accepts the observed singular toolCall without granting completion or accepting another tool", async () => {
    const identityCatalog = [{ name: "marketing.identity", description: "Extract the explicit brand", inputSchema: { type: "object", properties: { brandName: { type: "string" } }, required: ["brandName"], additionalProperties: false } }];
    let calls = 0;
    const run = (name, args) => createSelfHostedSemanticEngine({ env: {}, fetchImpl: async (_url, options) => {
            calls++;
            const body = JSON.parse(options.body);
            const schema = body.format;
            assert.equal(body.model, "qwen3:4b-instruct-2507-q4_K_M");
            assert.deepEqual(schema.properties.toolCalls.items.properties.args, identityCatalog[0].inputSchema);
            assert.deepEqual(schema.properties.toolCalls.items.properties.name.enum, ["marketing.identity"]);
            return reply({ content: JSON.stringify({ toolCall: { name, arguments: args }, missionComplete: true }) });
    } }).plan({
        input,
        catalog: identityCatalog,
        missionState: { phase: "GROUNDED_ARGUMENT_COMPLETION" }, noDeadline: true
    });
    const result = await run("marketing.identity", { brandName: "Summit Law Firm" });
    assert.equal(calls, 1);
    assert.equal(result.toolCalls[0].args.brandName, "Summit Law Firm");
    assert.equal(result.missionComplete, false);
    await assert.rejects(run("repo.write", { brandName: "Summit" }), /SEMANTIC_GROUNDED_ARGUMENTS_REQUIRED/);
    await assert.rejects(run("marketing.identity", {}), /SEMANTIC_GROUNDED_ARGUMENTS_REQUIRED/);
});

test("Qwen's context decision isolates self-contained work and retains history when it is needed", async () => {
    for (const requiresConversationContext of [false, true]) {
        let calls = 0;
        const result = await planner.runJarvisSemanticPlanner({ input, catalog: [...catalog, { name: "conversation.respond", mutates: false }],
            missionState: { ...missionState, conversationalGate: true, advisorySemanticContext: { turns: [{ role: "assistant", content: "OLD_FAILED_MISSION: tourism proposals are not current evidence." }] } },
            retrieveToolCandidates: async () => catalog,
            ai: { models: { generateContent: async request => {
                calls++;
                if (calls === 1) return { text: JSON.stringify({ mode: "tools", missing: "", question: "", action: "create marketing campaign", requiresConversationContext }), providerResponse: { finishReason: "stop" } };
                assert.equal(JSON.stringify(request.config.chatMessages).includes("OLD_FAILED_MISSION"), requiresConversationContext);
                assert.equal(request.config.chatMessages.at(-1).content, input);
                return { functionCalls: [{ name: "jarvis_tool_0", args: { prompt: input } }] };
            } } }, noDeadline: true
        });
        assert.equal(calls, 2);
        assert.equal(result.toolCalls[0].name, "marketing.plan");
    }
});

for (const reason of ["length", "stop"]) {
    test(`CURRENT_TURN recovers empty native tool selection (${reason}) using the same Qwen and candidate schemas`, async () => {
        const requests = [];
        const engine = createSelfHostedSemanticEngine({ env: {}, fetchImpl: async (url, options) => {
            const body = JSON.parse(options.body);
            requests.push(body);
            assert.equal(url, "http://127.0.0.1:11434/api/chat");
            assert.equal(body.model, "qwen3:4b-instruct-2507-q4_K_M");
            assert.equal(body.think, false);
            assert.equal(options.signal.aborted, false);
            if (requests.length === 1) return reply({ role: "assistant", content: "" }, reason);
            assert.equal(requests.length, 2);
            assert.equal(body.tools, undefined);
            assert.deepEqual(body.format.anyOf.map(option => option.properties.name.enum[0]), ["marketing.plan"]);
            assert.deepEqual(body.format.anyOf[0].properties.arguments, requests[0].tools[0].function.parameters);
            assert.ok(body.options.num_predict >= 1024);
            assert.deepEqual(body.messages.slice(1), requests[0].messages.slice(1));
            assert.ok(body.messages[0].content.startsWith(requests[0].messages[0].content));
            assert.ok(body.messages[0].content.includes(JSON.stringify(requests[0].tools)));
            return reply({ content: JSON.stringify({ name: "jarvis_tool_0", arguments: { prompt: input } }) });
        } });
        const result = await engine.plan({ input, catalog, missionState, noDeadline: true });
        assert.equal(requests.length, 2);
        assert.equal(result.toolCalls[0].name, "marketing.plan");
        assert.equal(result.toolCalls[0].args.prompt, input);
        assert.equal(result.missionComplete, false);
        assert.equal(result.inferenceReceipt.counters.semanticExternalCalls, 0);
    });
}

test("exhausted empty selection fails closed with each attempt's stage, mode, budget and response evidence", async () => {
    let calls = 0;
    const engine = createSelfHostedSemanticEngine({ env: {}, fetchImpl: async () => {
        calls++;
        return reply({ role: "assistant", content: "" }, calls === 1 ? "length" : "stop");
    } });
    await assert.rejects(engine.plan({ input, catalog, missionState }), error => {
        assert.match(error.message, /LOCAL_SEMANTIC_RESPONSE_EMPTY/);
        assert.equal(error.evidence.phase, "CURRENT_TURN_TOOL_SELECTION");
        assert.equal(error.evidence.recoveryExhausted, true);
        assert.equal(error.evidence.attempts, 2);
        const attempts = error.evidence.attemptEvidence;
        assert.deepEqual(attempts.map(a => a.finishReason), ["length", "stop"]);
        assert.deepEqual(attempts.map(a => a.nativeToolChat), [true, false]);
        assert.deepEqual(attempts.map(a => a.jsonOnlyNative), [false, true]);
        assert.deepEqual(attempts.map(a => a.numPredict), [512, 1024]);
        for (const [index, attempt] of attempts.entries()) {
            assert.equal(attempt.attempt, index + 1);
            assert.equal(attempt.model, "qwen3:4b-instruct-2507-q4_K_M");
            assert.equal(attempt.modelProfile, "default");
            assert.equal(attempt.nativeChat, true);
            assert.ok(attempt.durationMs >= 0);
            assert.deepEqual(attempt.messageKeys, ["role", "content"]);
            assert.deepEqual(attempt.message, { content: "", tool_calls: [] });
        }
        return true;
    });
    assert.equal(calls, 2);
});

test("a valid native tool call with empty content is accepted without recovery", async () => {
    let calls = 0;
    const engine = createSelfHostedSemanticEngine({ env: {}, fetchImpl: async () => {
        calls++;
        return reply({ content: "", tool_calls: [{ function: { name: "jarvis_tool_0", arguments: { prompt: input } } }] });
    } });
    const result = await engine.plan({ input, catalog, missionState });
    assert.equal(calls, 1);
    assert.equal(result.toolCalls[0].name, "marketing.plan");
});

test("browser planner preserves exhausted local inference evidence for the caller", async t => {
    const previous = globalThis.JarvisLocalBridge;
    t.after(() => { globalThis.JarvisLocalBridge = previous; });
    const evidence = { phase: "CURRENT_TURN_TOOL_SELECTION", attempts: 2, recoveryExhausted: true, attemptEvidence: [{ finishReason: "stop" }] };
    globalThis.JarvisLocalBridge = { requestJson: async () => ({ ok: false, error: "SEMANTIC_AUTHENTICATED_PROVIDER_LOCAL_SEMANTIC_RESPONSE_EMPTY", evidence }) };
    await assert.rejects(buildJarvisMultifunctionToolCalls(input, { toolCatalog: catalog, missionState, throwOnUnavailable: true }), error => {
        assert.deepEqual(error.evidence, evidence);
        return true;
    });
});
