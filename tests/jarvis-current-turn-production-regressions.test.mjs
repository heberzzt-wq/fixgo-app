import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { parse } from "acorn";
import { createRequire } from "node:module";
import { buildJarvisMultifunctionToolCalls, isBoundedReadOnlyMission } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";
import { registerJarvisMultifunctionTools } from "../gestia-core/jarvis/jarvis.multitool.pack.js";
import { registerJarvisActuatorTools } from "../gestia-core/jarvis/jarvis.actuator.pack.js";
import { validateBrowserUrl } from "../gestia-core/jarvis/jarvis.browser.grounding.js";
import { ensureExecutableArtifactDependencies } from "../gestia-core/jarvis/jarvis.mission.dependencies.js";
import { mergeEvidenceGroundedToolCalls } from "../gestia-core/jarvis/jarvis.conversation.composer.js";
import { runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import { composeEvidenceGroundedConversation } from "../gestia-core/jarvis/jarvis.conversation.composer.js";

const { runJarvisSemanticPlanner } = createRequire(import.meta.url)("../functions/jarvis-semantic-planner.js");
const coreSource = readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8").replaceAll("\r", "");
const coreNode = parse(coreSource, { sourceType: "module", ecmaVersion: "latest" }).body
    .find(node => node.type === "ExportNamedDeclaration" && node.declaration?.declarations?.[0]?.id?.name === "GestiaCore")
    .declaration.declarations[0].init;
const quietConsole = { info() {}, warn() {}, error() {} };

function runtime() {
    const tools = new Map();
    return {
        register: tool => { tools.set(tool.name, tool); return { ok: true }; },
        has: name => tools.has(name), get: name => tools.get(name), list: () => [...tools.values()]
    };
}

test("CURRENT_TURN renders the model-authored answer and limitation once, preserving only history", async t => {
    const tools = runtime();
    registerJarvisMultifunctionTools(tools);
    const contaminatedMemory = { turns: [{ role: "assistant", content: "Lo ejecutado: se creo un documento. Lo planeado: exportar medios. Lo bloqueado: permisos." }] };
    let inferenceCalls = 0;
    t.mock.method(globalThis, "fetch", async () => { inferenceCalls++; throw new Error("Unexpected second inference"); });
    for (const [input, answer, reason] of [
        ["Explica el diseño gráfico y su alcance", "El diseño gráfico comunica ideas mediante tipografía, color y composición; abarca identidad visual, publicaciones e interfaces.", "MODEL_SEMANTIC_TOOL_SELECTION"],
        ["Explícame la jerarquía tipográfica", "La jerarquía tipográfica organiza títulos, subtítulos y texto para guiar la lectura.", undefined],
        ["Revisa la apariencia del portal", "Necesito la URL o una captura de la interfaz para analizar su apariencia.", "MODEL_EVIDENCE_LIMITATION"]
    ]) {
        const history = [];
        const bridge = { executeAndCompose: async (name, args, context) => {
            assert.equal(context.precomposedSemanticResponse, true);
            const result = await tools.get(name).execute(args, context);
            return { ok: result.ok, text: result.message };
        } };
        const core = runInNewContext(`(${coreSource.slice(coreNode.start, coreNode.end)})`, {
            auth: { currentUser: { uid: "reader", email: "reader@example.test" } },
            GESTIA_MASTER_EMAIL: "master@example.test", SIA7_UTILS: { generarUUID: () => "test-turn" },
            JarvisSemanticMemory: { recall: async () => contaminatedMemory, rememberTurn: async turn => history.push(turn) },
            compactJarvisSemanticMemoryForPlanner: memory => memory,
            location: { href: "https://runtime.test/terminal", origin: "https://runtime.test" },
            JarvisToolRuntime: tools, window: { ToolsBridge: bridge }, console: quietConsole,
            buildJarvisMultifunctionToolCalls: async (_input, options) => {
                assert.equal(options.missionState.phase, "CURRENT_TURN");
                assert.equal(options.state.currentPage.url, "https://runtime.test/terminal");
                return [{ name: "conversation.respond", args: { prompt: answer }, reason }];
            }
        });
        const result = await core.procesarIntencion(input, { semanticMemory: contaminatedMemory });
        assert.equal(result.text, answer);
        assert.doesNotMatch(result.text, /Lo ejecutado|Lo planeado/);
        assert.deepEqual(history.map(turn => [turn.role, turn.content]), [["user", input], ["assistant", answer]]);
    }
    assert.equal(inferenceCalls, 0);
});

// Exercise the actual GestiaCore contract path without Firebase or network I/O.
// No reimplementation of its branching: this runs the production source block.
async function prepareContract(calls, catalog, options = {}) {
    const start = coreSource.indexOf("    const operationalMissionToolNames =");
    const end = coreSource.indexOf("    const pendingMissionId =", start);
    assert.ok(start > 0 && end > start);
    let expansions = 0;
    const result = await runInNewContext(`(async () => {
        ${coreSource.slice(start, end)}
        return { missionInitialToolCalls, missionToolCatalog, boundedCurrentTurnMission };
    })()`, {
        operationalInitialToolCalls: calls,
        terminalSemanticPlan: { reason: "model_selected_multifunction_plan", toolCalls: calls },
        registeredMissionTools: catalog, context: {}, semanticMemoryContext: null,
        effectiveMissionInstruction: options.instruction || "Revisa la interfaz", inputRaw: options.instruction || "Revisa la interfaz",
        conversationalPlan: { requiresFinalConversation: true },
        isBoundedReadOnlyMission, ensureExecutableArtifactDependencies, mergeEvidenceGroundedToolCalls,
        buildJarvisMultifunctionToolCalls: async () => { expansions++; return options.expanded || calls; },
        compactJarvisSemanticMemoryForPlanner: () => null,
        resolveExplicitRepositoryTargets: () => [],
        addRepositoryDiscoveryPreflights: ({ toolCalls }) => toolCalls,
        window: {}, console: quietConsole
    });
    return { ...result, expansions };
}

function actuatorCatalog() {
    const tools = runtime();
    registerJarvisActuatorTools(tools);
    return tools;
}

test("one read-only inspection keeps the CURRENT_TURN mission bounded with no document or media expansion", async () => {
    const tools = actuatorCatalog();
    const calls = [{ name: "browser.inspect", args: { url: "https://platform.test/" }, approved: false }];
    const result = await prepareContract(calls, tools.list(), {
        expanded: [...calls, { name: "document.create" }, { name: "media.library" }]
    });
    assert.equal(result.expansions, 0);
    assert.equal(result.boundedCurrentTurnMission, true);
    assert.deepEqual(Array.from(result.missionInitialToolCalls, call => call.name), ["browser.inspect"]);
    assert.deepEqual(Array.from(result.missionToolCatalog, tool => tool.name), ["browser.inspect"]);
});

test("production metadata, mutations, artifacts, approvals and declared dependencies retain contract planning", async () => {
    const simple = { name: "fixture.read", mutates: false, requiresApproval: false };
    const call = { name: simple.name, args: {} };
    for (const metadata of [
        { contractStages: ["sourceReview"] }, { contractKinds: ["material"] },
        { dependencies: ["other.read"] }, { dependsOn: ["other.read"] },
        { mutates: true }, { userArtifact: true }, { requiresApproval: true }
    ]) {
        const result = await prepareContract([call], [{ ...simple, ...metadata }]);
        assert.equal(result.expansions, 1, JSON.stringify(metadata));
        assert.equal(result.boundedCurrentTurnMission, false);
    }
    for (const metadata of [{ dependencies: ["other.read"] }, { contractStages: ["review"] }, { deferred: true }, { approved: true }]) {
        assert.equal((await prepareContract([{ ...call, ...metadata }], [simple])).expansions, 1);
    }
    assert.equal(isBoundedReadOnlyMission([call, call], [simple]), false);
    assert.equal(isBoundedReadOnlyMission([call], []), false);
});

test("real advertising and artifact preparation capabilities still use the production contract", async () => {
    const tools = actuatorCatalog();
    registerJarvisMultifunctionTools(tools);
    for (const name of ["marketing.plan", "web.research", "media.library", "image.adapt",
        "page.plan", "image.plan", "reel.plan", "page.compose", "document.compose", "spreadsheet.compose"]) {
        assert.ok(tools.get(name), name);
        assert.equal((await prepareContract([{ name, args: {} }], tools.list())).expansions, 1, name);
    }
});

test("normalization preserves model-declared contract scope on the call and plan", async () => {
    const tools = actuatorCatalog();
    for (const scope of ["call", "plan"]) {
        const call = { name: "browser.inspect", args: { url: "https://source.test/" } };
        const plan = { ok: true, toolCalls: [call] };
        (scope === "call" ? call : plan).dependencies = ["source.lookup"];
        const calls = await buildJarvisMultifunctionToolCalls(`Inspect ${scope} https://source.test/`, {
            toolCatalog: tools.list(), missionState: { phase: "CURRENT_TURN" },
            semanticPlanner: async () => plan, throwOnUnavailable: true
        });
        assert.equal(isBoundedReadOnlyMission(calls, tools.list()), false);
    }
});

test("browser URL checks reject invented destinations before any bridge call for all three hands", async t => {
    const tools = actuatorCatalog();
    const previous = globalThis.JarvisLocalBridge;
    let physicalCalls = 0;
    globalThis.JarvisLocalBridge = { requestJson: async () => { physicalCalls++; return { ok: true }; } };
    t.after(() => { globalThis.JarvisLocalBridge = previous; });
    for (const name of ["browser.inspect", "browser.screenshot", "browser.open"]) {
        for (const url of ["https://localhost/", "http://127.0.0.1/", "http://[::1]/", "https://invented.test/"]) {
            const result = await tools.get(name).execute({ url }, {
                rawInput: "Analiza nuestra plataforma",
                currentPage: { url: "https://platform.test/terminal", origin: "https://platform.test" },
                semanticMemory: { turns: [{ role: "assistant", content: url }] }
            });
            assert.equal(result.status, "BROWSER_URL_GROUNDING_REQUIRED");
            assert.equal(result.ok, false);
            assert.equal(result.objectiveSatisfied, false);
        }
    }
    assert.equal(physicalCalls, 0);
    assert.equal(tools.get("browser.screenshot").requiresApproval, true);
    assert.equal(tools.get("browser.open").requiresApproval, true);
});

test("explicit local URLs and real runtime currentPage URLs still reach the existing browser hand", async t => {
    const tools = actuatorCatalog();
    const previous = globalThis.JarvisLocalBridge;
    const requests = [];
    globalThis.JarvisLocalBridge = { requestJson: async (route, args) => { requests.push({ route, args }); return { ok: true }; } };
    t.after(() => { globalThis.JarvisLocalBridge = previous; });
    for (const name of ["browser.inspect", "browser.screenshot", "browser.open"]) {
        const result = await tools.get(name).execute({ url: "http://localhost:5173/design" }, {
            rawInput: "Revisa http://localhost:5173/design", approved: true,
            currentPage: { url: "http://localhost:5173/", origin: "http://localhost:5173" }
        });
        assert.equal(result.ok, true);
    }
    for (const [url, currentPage] of [
        ["https://platform.test/terminal", { url: "https://platform.test/terminal" }],
        ["https://platform.test/", { origin: "https://platform.test" }],
        ["http://localhost:5173/", { origin: "http://localhost:5173" }]
    ]) assert.equal((await tools.get("browser.inspect").execute({ url }, { currentPage })).ok, true);
    assert.equal(requests.length, 6);
    assert.ok(requests.every(request => request.route === "/browser"));
});

test("grounding requires exact URL evidence and ignores proposed args, failed observations and memory", () => {
    const url = "https://source.test/view";
    assert.equal(validateBrowserUrl(url, { rawInput: `Inspecciona [esta interfaz](${url}).` }).ok, true);
    assert.equal(validateBrowserUrl(url, { completedTasks: [{ observation: { ok: true, sources: [{ url }] } }] }).ok, true);
    for (const context of [
        {}, { args: { url } }, { semanticMemory: { url } },
        { rawInput: `${url}-other` }, { currentPage: { origin: "https://source.test" } },
        { completedTasks: [{ args: { url }, observation: { ok: true } }] },
        { completedTasks: [{ observation: { ok: false, url } }] },
        { completedTasks: [{ observation: { ok: true, executionOk: false, url } }] }
    ]) assert.equal(validateBrowserUrl(url, context).ok, false);
    assert.equal(validateBrowserUrl("file:///secret", { rawInput: "file:///secret" }).ok, false);
});

test("visual request without grounded URL executes no browser request or artifacts and remains partial", async t => {
    const tools = actuatorCatalog();
    const previous = globalThis.JarvisLocalBridge;
    let physicalCalls = 0;
    globalThis.JarvisLocalBridge = { requestJson: async () => { physicalCalls++; return { ok: true }; } };
    t.after(() => { globalThis.JarvisLocalBridge = previous; });
    const instruction = "Analiza la apariencia de nuestra plataforma";
    const contract = await prepareContract([{ name: "browser.inspect", args: { url: "https://localhost/" } }], tools.list(), { instruction });
    const mission = await runJarvisMission({
        instruction, initialToolCalls: contract.missionInitialToolCalls, requiredToolNames: ["browser.inspect"],
        executionContractLocked: true, toolCatalog: contract.missionToolCatalog,
        planner: async () => { throw new Error("A rejected target cannot expand the mission"); },
        execute: async (call, context) => tools.get(call.name).execute(call.args, context),
        storage: { getItem: () => null, setItem() {} }
    });
    assert.equal(physicalCalls, 0);
    assert.equal(contract.expansions, 0);
    assert.equal(mission.status, "PARTIAL");
    assert.equal(mission.completedTasks.length, 0);
    assert.equal(mission.blockedTasks[0].name, "browser.inspect");
    const composed = await composeEvidenceGroundedConversation({
        instruction,
        evidenceItems: [{ name: "mission.outcome", observation: mission }],
        executeConversation: async () => { throw new Error("Do not rewrite missing evidence into success"); }
    });
    assert.doesNotMatch(composed.text, /analisis.*exitoso|Lo ejecutado/);
    assert.ok(composed.text);
});

test("runtime currentPage reaches the same CURRENT_TURN planner as explicit context", async () => {
    const currentPage = { url: "https://runtime.test/console", origin: "https://runtime.test" };
    const tools = actuatorCatalog();
    const calls = await buildJarvisMultifunctionToolCalls("Inspecciona esta interfaz", {
        state: { currentPage }, missionState: { phase: "CURRENT_TURN" }, toolCatalog: tools.list(),
        semanticPlanner: async ({ missionState }) => {
            assert.deepEqual(missionState.currentPage, currentPage);
            return { ok: true, toolCalls: [{ name: "browser.inspect", args: { url: currentPage.url } }] };
        }, throwOnUnavailable: true
    });
    assert.equal(calls[0].args.url, currentPage.url);
});

test("a bounded DOM inspection still audits visual evidence and cannot expand to independent artifacts", async () => {
    const tools = actuatorCatalog();
    const start = coreSource.indexOf("            planner:\n                async ({ originalInstruction, mission }) => {");
    const end = coreSource.indexOf("            execute:", start);
    assert.ok(start > 0 && end > start);
    let audits = 0;
    const assessment = { objectives: [{
        objective: "Evaluar la apariencia", requiredEvidenceKind: "visual_inspection",
        satisfied: false, evidenceTaskIndexes: [], limitation: "Falta inspeccion visual de una captura; solo se obtuvo estructura DOM."
    }] };
    const planner = runInNewContext(`({${coreSource.slice(start, end)}}).planner`, {
        boundedCurrentTurnMission: true, missionIsIsolated: false,
        missionToolCatalog: [tools.get("browser.inspect")], registeredMissionTools: tools.list(),
        context: {}, semanticMemoryContext: null,
        compactMissionPlannerObservation: observation => observation,
        buildMissionToolCallsWithTransientRetry: async (input, options) => {
            audits++;
            assert.equal(options.missionState.phase, "COMPLETION_AUDIT");
            assert.equal(options.missionState.userArtifactAllowed, false);
            assert.deepEqual(Array.from(options.toolCatalog, tool => tool.name), ["browser.inspect"]);
            // Exercise the real client validation even if Qwen proposes an
            // independent artifact despite the bounded runtime catalog.
            return buildJarvisMultifunctionToolCalls(input, {
                ...options,
                semanticPlanner: async () => ({ ok: true, missionComplete: false,
                    toolCalls: [{ name: "document.create", args: {} }, { name: "media.library", args: { action: "export" } }],
                    completionAssessment: assessment })
            });
        }
    });
    const executed = [];
    const mission = await runJarvisMission({
        instruction: "Evalua la apariencia de https://platform.test/", initialToolCalls: [{ name: "browser.inspect", args: { url: "https://platform.test/" } }],
        requiredToolNames: ["browser.inspect"], executionContractLocked: true,
        toolCatalog: [tools.get("browser.inspect")], planner,
        execute: async call => { executed.push(call.name); return { ok: true, url: call.args.url, summary: "DOM observado" }; },
        storage: { getItem: () => null, setItem() {} }
    });
    assert.equal(audits, 1);
    assert.deepEqual(executed, ["browser.inspect"]);
    assert.equal(mission.status, "PARTIAL");
    assert.equal(mission.completionAssessment.objectives[0].satisfied, false);
    const composed = await composeEvidenceGroundedConversation({
        instruction: mission.originalInstruction,
        evidenceItems: [{ name: "mission.outcome", observation: mission }],
        executeConversation: async () => ({ ok: true, message: "Analisis visual exitoso" })
    });
    assert.match(composed.text, /Falta inspeccion visual/);
    assert.doesNotMatch(composed.text, /exitoso/);
});

test("Qwen receives runtime URL provenance in both the gate and native tool selection", async () => {
    const tools = actuatorCatalog();
    const conversation = { name: "conversation.respond", inputSchema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] } };
    const currentPage = { url: "https://runtime.test/console", origin: "https://runtime.test" };
    let calls = 0;
    const plan = await runJarvisSemanticPlanner({
        input: "Revisa esta interfaz", catalog: [conversation, tools.get("browser.inspect")],
        missionState: { phase: "CURRENT_TURN", conversationalGate: true, currentPage },
        retrieveToolCandidates: async () => [tools.get("browser.inspect")],
        ai: { models: { generateContent: async request => {
            assert.ok(request.config.chatMessages[0].content.includes(JSON.stringify(currentPage)));
            if (++calls === 1) return { text: JSON.stringify({ mode: "tools", action: "inspect current interface", missing: "", question: "" }) };
            const selected = request.config.tools[0].functionDeclarations.find(tool => tool.description.startsWith("browser.inspect:"));
            return { functionCalls: [{ name: selected.name, args: { url: currentPage.url } }] };
        } } }
    });
    assert.equal(calls, 2);
    assert.equal(plan.toolCalls[0].args.url, currentPage.url);
});
