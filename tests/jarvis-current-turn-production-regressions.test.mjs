import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { parse } from "acorn";
import { createRequire } from "node:module";
import { buildJarvisMultifunctionToolCalls, isBoundedReadOnlyMission, shouldCompleteJarvisPlanningArguments } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";
import { registerJarvisMultifunctionTools } from "../gestia-core/jarvis/jarvis.multitool.pack.js";
import { registerJarvisActuatorTools } from "../gestia-core/jarvis/jarvis.actuator.pack.js";
import { validateBrowserUrl } from "../gestia-core/jarvis/jarvis.browser.grounding.js";
import { ensureExecutableArtifactDependencies } from "../gestia-core/jarvis/jarvis.mission.dependencies.js";
import { mergeEvidenceGroundedToolCalls } from "../gestia-core/jarvis/jarvis.conversation.composer.js";
import { runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import { composeEvidenceGroundedConversation } from "../gestia-core/jarvis/jarvis.conversation.composer.js";
import { buildResponsiveRepairOptions, buildResponsiveRepairPatch } from "../gestia-core/jarvis/jarvis.autopatch.engine.js";

const { runJarvisSemanticPlanner } = createRequire(import.meta.url)("../functions/jarvis-semantic-planner.js");
const coreSource = readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8").replaceAll("\r", "");
const coreNode = parse(coreSource, { sourceType: "module", ecmaVersion: "latest" }).body
    .find(node => node.type === "ExportNamedDeclaration" && node.declaration?.declarations?.[0]?.id?.name === "GestiaCore")
    .declaration.declarations[0].init;
const quietConsole = { info() {}, warn() {}, error() {} };

test("responsive repair planning retains repository discovery without granting write permission", () => {
    const tool = { name: "browser.inspect", mutates: false, requiresApproval: false };
    const call = { name: tool.name, args: { followUp: "prepare_repair", viewports: [{ width: 360, height: 800 }] }, approved: false };
    assert.equal(isBoundedReadOnlyMission([call], [tool]), false);
    assert.equal(call.approved, false);
    assert.equal(isBoundedReadOnlyMission([{ ...call, args: { followUp: "diagnose" } }], [tool]), true);
});

test("responsive answer selects diagnosed findings and preserves viewport and replay limits", async () => {
    const { runJarvisSemanticResponse } = createRequire(import.meta.url)("../functions/jarvis-semantic-planner.js");
    const page = { source: "RENDERED_DOM_LAYOUT_REPLAY", url: "https://runtime.test/terminal", phase: "before",
        stateFingerprint: "a".repeat(64), observedAt: "2026-10-06T17:20:57Z",
        viewports: [{ viewport: { width: 360, height: 800 }, orientation: "portrait", elements: [{ tag: "button", selector: "#menu", rect: [340, 20, 44, 44] }],
            findings: [{ id: "outside-menu", kind: "clipped_control", selector: "#menu", classification: "defect", severity: "high", certainty: "high",
                summary: "Control recortado", impact: "Parte del control queda inaccesible fuera del viewport.",
                suggestedCorrection: "Permitir que el encabezado se distribuya en filas.", verification: "El control debe quedar completamente dentro del viewport." }] }],
        limitations: ["Sin interacción ni hardware real"] };
    const briefing = { missionStatus: "PARTIAL", executedTools: [{ tool: "browser.inspect", ok: true }], measuredInterfaceEvidence: [page] };
    const result = await runJarvisSemanticResponse({ input: "Diagnostica la interfaz", responseMode: "grounded_conversation", responseBriefing: JSON.stringify(briefing),
        ai: { models: { generateContent: async request => {
            const ids = request.config.responseJsonSchema.properties.factIds.items.enum;
            assert.ok(ids.includes("interface.0.viewport.0.finding.0"));
            return { text: JSON.stringify({ requestedLineCount: 0, factIds: ["interface.0.viewport.0.finding.0"] }) };
        } } } });
    assert.match(result.message, /360 × 800/);
    assert.match(result.message, /#menu/);
    assert.match(result.message, /inaccesible/);
    assert.match(result.message, /reproducción DOM/);
    assert.match(result.message, /No se inspeccionaron píxeles/);
    assert.match(result.message, /parcial/);
});

function runtime() {
    const tools = new Map();
    return {
        register: tool => { tools.set(tool.name, tool); return { ok: true }; },
        has: name => tools.has(name), get: name => tools.get(name), list: () => [...tools.values()]
    };
}

test("responsive optional viewport arguments are repaired by Qwen before execution", async () => {
    const tools = actuatorCatalog();
    let repaired = false;
    const result = await runJarvisSemanticPlanner({
        input: "Revisa esta interfaz a 360 por 800 y prepara una corrección",
        catalog: [tools.get("browser.inspect")],
        missionState: { phase: "CURRENT_TURN", currentPage: { url: "https://runtime.test/terminal" } },
        ai: { models: { generateContent: async request => {
            if (request.config.semanticStage === "CURRENT_TURN_SCHEMA_ARGUMENT_REPAIR") {
                repaired = true;
                assert.equal(request.config.responseJsonSchema.properties.arguments.properties.viewports.items.properties.width.type, "integer");
                return { text: JSON.stringify({ arguments: { url: "https://runtime.test/terminal", viewports: [{ width: 360, height: 800 }], phase: "before", followUp: "prepare_repair" } }) };
            }
            return { functionCalls: [{ name: "jarvis_tool_0", args: { url: "https://runtime.test/terminal", viewports: ["360x800"], followUp: "prepare_repair" } }] };
        } } }
    });
    assert.equal(repaired, true);
    assert.deepEqual(result.toolCalls[0].args.viewports, [{ width: 360, height: 800 }]);
    assert.equal(result.toolCalls[0].approved, false);
});

test("responsive completion keeps instructions and all sizes inside local message bounds", async () => {
    const tools = actuatorCatalog();
    const page = { source: "RENDERED_DOM_LAYOUT_REPLAY", url: "https://runtime.test/gestia-terminal.html", phase: "before",
        viewports: [[360,800],[390,844],[768,1024],[1024,768],[1366,768],[1920,1080]].map(([width,height]) => ({ viewport:{width,height},
            elements: Array.from({length:160},()=>({selector:"#item",text:"observed".repeat(80),rect:[0,0,10,10]})),
            findings:[{kind:"hidden_element_rendered",selector:"#tray",classification:"defect",summary:"hidden ocupa espacio",evidence:{display:"flex"}}] })) };
    const catalog = [tools.get("browser.inspect"), {name:"repo.read",description:"Read source",inputSchema:{file:"string"}},
        {name:"repo.prepareWrite",description:"Prepare exact replacement",inputSchema:{file:"string",search:"string",replace:"string"}}];
    const result = await runJarvisSemanticPlanner({ input:"Revisa esta interfaz y prepara la corrección",catalog,
        missionState:{phase:"COMPLETION_AUDIT",completedTasks:[{name:"browser.inspect",args:{followUp:"prepare_repair"},observation:{ok:true,interfaceEvidence:page}}]},
        ai:{models:{generateContent:async request=>{
            assert.ok(request.config.chatMessages.every(message=>message.content.length<12000));
            const measurements=request.config.chatMessages.find(message=>message.content.startsWith("HALLAZGOS_MEDIDOS"));
            assert.ok(measurements.content.includes('1920'));
            assert.ok(measurements.content.includes('hidden ocupa espacio'));
            assert.equal(request.config.semanticStage,"RESPONSIVE_REPAIR_CONTINUATION");
            assert.equal(request.config.responseJsonSchema.properties.toolCalls.items.anyOf.length,1);
            return {functionCalls:[{name:"jarvis_tool_0",args:{file:"gestia-terminal.html"}}]};
        }}}
    });
    assert.equal(result.missionComplete,false);
    assert.equal(result.toolCalls[0].name,"repo.read");
});

test("Qwen selects grounded responsive repairs without authorizing or inventing source bytes", async () => {
    const source = '<!doctype html>\r\n<head><style>\r\n.keep { color: white; }\r\n</style></head><body><div id="tray" hidden></div></body>';
    const page = { source: "RENDERED_DOM_LAYOUT_REPLAY", url: "https://runtime.test/gestia-terminal.html", phase: "before",
        viewports: [{ viewport: { width: 360, height: 800 }, elements: [{ selector: "#tray", rect: [0,0,120,16], display: "flex", hiddenAttribute: true }],
            findings: [{ selector: "#tray", kind: "hidden_element_rendered", classification: "defect" }] }] };
    const catalog = [{name:"repo.prepareWrite",description:"Prepare exact replacement",inputSchema:{file:"string",search:"string",replace:"string"}},
        {name:"conversation.respond",description:"Explain a limitation",inputSchema:{prompt:"string"}}];
    for (const variant of [{ids:["responsive_1"]}, {ids:[], error:/SELECTION_REQUIRED/}, {ids:["invented"],error:/SELECTION_INVALID/}, {ids:[],action:"conversation.respond"}]) {
        let calls = 0;
        const operation = runJarvisSemanticPlanner({input:"Corrige los defectos medidos y comprueba",catalog,buildResponsiveRepairOptions,buildResponsiveRepairPatch,
            missionState:{phase:"COMPLETION_AUDIT",completedTasks:[
                {name:"browser.inspect",args:{followUp:"prepare_repair"},observation:{ok:true,interfaceEvidence:page}},
                {name:"repo.read",observation:{ok:true,verifiedRead:{tool:"repo.read",file:"gestia-terminal.html",content:'<!doctype html>\r\n<head>'}}},
                {name:"repo.read",observation:{ok:true,verifiedRead:{tool:"repo.read",file:"gestia-terminal.html",content:source}}}]},
            ai:{models:{generateContent:async request=>{
                calls++;
                assert.equal(request.config.semanticStage,"RESPONSIVE_REPAIR_SELECTION");
                assert.ok(request.config.chatMessages.every(message=>message.content.length<12000));
                assert.deepEqual(request.config.responseJsonSchema.properties.selectedIds.items.enum,["responsive_1"]);
                return {text:JSON.stringify({action:variant.action||"repo.prepareWrite",diagnosis:"El estado hidden ocupa espacio.",selectedIds:variant.ids,css:"body { display: none }",approved:true})};
            }}}});
        if (variant.error) await assert.rejects(operation,variant.error);
        else {
            const result=await operation;
            assert.equal(result.missionComplete,false);
            assert.equal(result.toolCalls[0].approved,false);
            if (!variant.action) {
                const patch=result.toolCalls[0].args;
                assert.ok(source.includes(patch.search));
                assert.match(patch.replace,/#tray\[hidden\] \{ display: none; \}/);
                assert.doesNotMatch(patch.replace,/body \{ display/);
                assert.ok(source.replace(patch.search,patch.replace).endsWith('</head><body><div id="tray" hidden></div></body>'));
            } else assert.equal(result.toolCalls[0].name,"conversation.respond");
        }
        assert.equal(calls,1);
    }
});

test("maximum responsive matrix delivers every measured repair option without message truncation", async () => {
    const elements=Array.from({length:10},(_,i)=>({selector:'#tray'+i,rect:[0,i*16,120,16],display:'flex',hiddenAttribute:true}));
    const page={source:'RENDERED_DOM_LAYOUT_REPLAY',url:'https://runtime.test/gestia-terminal.html',phase:'before',
        viewports:Array.from({length:10},(_,i)=>({viewport:{width:360+i*50,height:800},elements,
            findings:elements.map(e=>({selector:e.selector,kind:'hidden_element_rendered',classification:'defect'}))}))};
    const source='<head><style>\r\n.keep {color:white}\r\n</style></head><body>'+elements.map(e=>'<div id="'+e.selector.slice(1)+'" hidden></div>').join('')+'</body>';
    const result=await runJarvisSemanticPlanner({input:'Corrige los defectos de la interfaz',buildResponsiveRepairOptions,buildResponsiveRepairPatch,
        catalog:[{name:'repo.prepareWrite',description:'Prepare',inputSchema:{file:'string',search:'string',replace:'string'}}],
        missionState:{phase:'COMPLETION_AUDIT',completedTasks:[{name:'browser.inspect',args:{followUp:'prepare_repair'},observation:{ok:true,interfaceEvidence:page}},
            {name:'repo.read',observation:{ok:true,verifiedRead:{tool:'repo.read',file:'gestia-terminal.html',content:source}}}]},
        ai:{models:{generateContent:async request=>{
            const messages=request.config.chatMessages.filter(m=>m.content.startsWith('OPERACION_FUNDAMENTADA='));
            assert.equal(messages.length,10);
            assert.ok(request.config.chatMessages.every(m=>m.content.length<12000));
            assert.ok(messages.at(-1).content.includes('responsive_10'));
            return {text:JSON.stringify({action:'repo.prepareWrite',diagnosis:'Corregir el último estado oculto medido.',selectedIds:['responsive_10']})};
        }}}});
    assert.match(result.toolCalls[0].args.replace,/#tray9\[hidden\]/);
    assert.doesNotMatch(result.toolCalls[0].args.replace,/#tray0\[hidden\]/);
});

test("source-bound preparation is not reauthored by generic argument completion", () => {
    const search='\r\n  .tray { display:flex; }\r\n';
    const source='<head><style>'+search+'</style></head>';
    const call={name:'repo.prepareWrite',args:{file:'gestia-terminal.html',search,replace:search+'#tray[hidden] {display:none}',matchCount:1}};
    const tool={name:call.name,mutates:false,inputSchema:{file:'string',search:'string',replace:'string',matchCount:'integer'}};
    const read={name:'repo.read',observation:{ok:true,verifiedRead:{file:call.args.file,content:source}}};
    assert.equal(shouldCompleteJarvisPlanningArguments(call,tool,[read]),false);
    for(const task of [
        {...read,observation:{...read.observation,ok:false}},
        {...read,observation:{ok:true,verifiedRead:{file:'other.html',content:source}}},
        {...read,observation:{ok:true,verifiedRead:{file:call.args.file,content:source.replaceAll('\r\n','\n')}}}
    ]) assert.equal(shouldCompleteJarvisPlanningArguments(call,tool,[task]),true);
    assert.equal(shouldCompleteJarvisPlanningArguments({...call,deferred:true},tool,[read]),true);
});

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

test("runtime origin canonicalizes to the exact visible currentPage URL unless the user supplied a URL", async t => {
    const tools = actuatorCatalog();
    const previous = globalThis.JarvisLocalBridge;
    const requests = [];
    globalThis.JarvisLocalBridge = {
        requestJson: async (route, args) => {
            requests.push({ route, args });
            return { ok: true };
        }
    };
    t.after(() => { globalThis.JarvisLocalBridge = previous; });
    const currentPage = {
        url: "https://platform.test/terminal",
        origin: "https://platform.test"
    };
    await tools.get("browser.inspect").execute(
        { url: currentPage.origin },
        { rawInput: "Analiza nuestra plataforma", currentPage }
    );
    assert.equal(requests.at(-1).args.url, currentPage.url);

    await tools.get("browser.inspect").execute(
        { url: currentPage.origin },
        { rawInput: "Analiza https://platform.test", currentPage }
    );
    assert.equal(requests.at(-1).args.url, "https://platform.test/");
});

test("grounding requires exact URL evidence and ignores proposed args, failed observations and memory", () => {
    const url = "https://source.test/view";
    assert.equal(validateBrowserUrl(url, { rawInput: `Inspecciona [esta interfaz](${url}).` }).ok, true);
    for (const explicit of ["http://[::1]", "https://source.test/view?q=why?", "http://localhost:5173"]) {
        assert.equal(validateBrowserUrl(explicit, { rawInput: `Inspecciona ${explicit}` }).ok, true);
    }
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


test("a conceptual clarification audit can recover conversation without operational retrieval", async () => {
    const answer = "La tipografia organiza el texto para comunicar con claridad.";
    const stages = [];
    const plan = await runJarvisSemanticPlanner({
        input: "Explica que es la tipografia y que abarca",
        catalog: [{ name: "conversation.respond", mutates: false }, { name: "browser.inspect", mutates: false }],
        missionState: { phase: "CURRENT_TURN", conversationalGate: true },
        retrieveToolCandidates: async () => { throw new Error("CONCEPTUAL_REQUEST_MUST_NOT_RETRIEVE_TOOLS"); },
        ai: { models: { generateContent: async request => {
            stages.push(request.config.semanticStage);
            if (stages.length === 1) return { text: JSON.stringify({ missing: "tipo", mode: "clarify", question: "De que tipo?", action: "", requiresConversationContext: false }) };
            if (stages.length === 2) return { text: JSON.stringify({ stillMissing: false, mode: "chat", action: "" }) };
            return { text: answer };
        } } }
    });
    assert.equal(plan.toolCalls.length, 1);
    assert.equal(plan.toolCalls[0].name, "conversation.respond");
    assert.equal(plan.toolCalls[0].args.prompt, answer);
    assert.equal(stages.length, 3);
});


test("current-page inspection measures real styles without reading form values or claiming pixels", async () => {
    const { inspectCurrentBrowserPage } = await import("../gestia-core/jarvis/jarvis.browser.grounding.js");
    const url = "https://runtime.test/terminal";
    const style = { display: "block", visibility: "visible", opacity: "1", fontFamily: "Arial",
        fontSize: "32px", fontWeight: "700", lineHeight: "40px", color: "rgb(255, 255, 255)",
        backgroundColor: "rgb(15, 23, 42)", padding: "16px", gap: "8px", borderRadius: "8px" };
    const element = { tagName: "H1", innerText: "Terminal de prueba", closest: () => null,
        getBoundingClientRect: () => ({ x: 16, y: 16, width: 300, height: 40, right: 316, bottom: 56, top: 16, left: 16 }) };
    const input = { ...element, tagName: "INPUT", value: "PRIVATE_FORM_VALUE", innerText: "",
        getAttribute: name => name === "placeholder" ? "Escribe aqui" : null };
    const password = { ...input, type: "password", value: "PRIVATE_PASSWORD" };
    const runtime = { location: { href: url }, innerWidth: 1024, innerHeight: 768,
        getComputedStyle: () => style,
        document: { body: {}, title: "Terminal", documentElement: { scrollWidth: 1024 },
            querySelectorAll: () => [element, input, password] } };
    assert.equal(inspectCurrentBrowserPage("https://other.test/", runtime), null);
    const result = inspectCurrentBrowserPage(url, runtime);
    assert.equal(result.status, "BROWSER_INSPECT_OK");
    assert.equal(result.interfaceEvidence.url, url);
    assert.equal(result.interfaceEvidence.elements[0].fontSize, "32px");
    assert.equal(result.interfaceEvidence.elements.length, 2);
    assert.equal(result.interfaceEvidence.screenshotInspected, false);
    assert.equal(result.interfaceEvidence.otherPagesInspected, false);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_FORM_VALUE|PRIVATE_PASSWORD/);
    const { compactMissionPlannerObservation } = await import("../gestia-core/jarvis/jarvis.mission.planner-state.js");
    assert.deepEqual(compactMissionPlannerObservation(result).interfaceEvidence, result.interfaceEvidence);
    assert.deepEqual(compactMissionPlannerObservation({ ok: true, evidence: result }).interfaceEvidence, result.interfaceEvidence);
});

test("partial measured interface results reach the final response without becoming pixel inspection", async () => {
    const interfaceEvidence = { source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE", url: "https://runtime.test/terminal",
        viewport: { width: 1024, height: 768 }, elements: [{ tag: "h1", text: "Terminal", fontSize: "32px", color: "rgb(255, 255, 255)", rect: [16, 16, 300, 40] }] };
    const evidenceItems = [
        { name: "browser.inspect", observation: { ok: true, status: "BROWSER_INSPECT_OK", interfaceEvidence } },
        { name: "mission.outcome", observation: { status: "PARTIAL", reason: "PLANNER_NO_EXECUTABLE_PLAN",
            completionAssessment: { objectives: [{ satisfied: false, limitation: "Falta inspeccion de imagenes y otras pantallas." }] } } }
    ];
    let calls = 0;
    const result = await composeEvidenceGroundedConversation({ instruction: "Analiza el diseño de la interfaz", evidenceItems,
        executeConversation: async (prompt, options) => {
            calls++;
            assert.match(prompt, /32px/);
            assert.match(prompt, /CURRENT_VIEWPORT_ONLY/);
            assert.match(prompt, /No has visto pixeles/);
            assert.equal(JSON.parse(options.responseBriefing).missionStatus, "PARTIAL");
            return { ok: true, message: "Revision parcial: el titulo observado mide 32px. No inspeccione imagenes ni otras pantallas." };
        } });
    assert.equal(calls, 1);
    assert.match(result.text, /32px/);
    assert.match(result.text, /No inspeccione imagenes/);
    assert.doesNotMatch(result.text, /No hay evidencia suficiente/);
});


test("declared style capability cannot certify absent measured style evidence", async () => {
    await assert.rejects(runJarvisSemanticPlanner({
        input: "Evalua los tamaños tipograficos observados",
        catalog: [{ name: "browser.inspect", evidenceKinds: ["interface_structure", "interface_styles"], mutates: false }],
        missionState: { phase: "COMPLETION_AUDIT", completedTasks: [{ name: "browser.inspect", observation: { ok: true, summary: "DOM sin estilos" } }] },
        ai: { models: { generateContent: async () => ({ text: JSON.stringify({ toolCalls: [], missionComplete: true,
            completionAssessment: { objectives: [{ objective: "Tipografia", requiredEvidenceKind: "interface_styles", satisfied: true, evidenceTaskIndexes: [0], limitation: "" }] } }) }) } }
    }), /SEMANTIC_COMPLETION_EVIDENCE_KIND_MISMATCH/);
});


test("direct conversation preserves speaker roles and the literal current message", async () => {
    const input = "soy heberto no jarvis";
    const answer = "Entendido, Heberto.";
    let requests = 0;
    const plan = await runJarvisSemanticPlanner({ input,
        catalog: [{ name: "conversation.respond", mutates: false }],
        missionState: { phase: "CURRENT_TURN", conversationalGate: true },
        ai: { models: { generateContent: async request => {
            requests++;
            if (request.config.semanticStage === "CURRENT_TURN_CONVERSATION_GATE") {
                return { text: JSON.stringify({ mode: "chat", missing: "", question: "", action: "", requiresConversationContext: false }) };
            }
            assert.equal(request.config.chatMessages[0].role, "system");
            assert.match(request.config.chatMessages[0].content, /assistant, not the human/);
            assert.match(request.config.chatMessages[0].content, /accept that exact spelling/);
            assert.deepEqual(request.config.chatMessages.at(-1), { role: "user", content: input });
            return { text: answer };
        } } }
    });
    assert.equal(requests, 2);
    assert.equal(plan.toolCalls[0].args.prompt, answer);
});

test("measured interface answers render canonical CSS and retain partial scope", async () => {
    const { runJarvisSemanticResponse } = createRequire(import.meta.url)("../functions/jarvis-semantic-planner.js");
    const responseBriefing = JSON.stringify({ missionStatus: "PARTIAL",
        executedTools: [{ tool: "browser.inspect", ok: true, executionOk: true }],
        measuredInterfaceEvidence: [{ source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE", url: "https://runtime.test/terminal",
            viewport: { width: 1024, height: 768 }, pageStyles: { backgroundColor: "rgb(15, 23, 42)", color: "rgb(255, 255, 255)", fontFamily: "Arial", fontSize: "16px" },
            elements: [{ tag: "h1", text: "Terminal", fontFamily: "Arial", fontSize: "32px", fontWeight: "700", lineHeight: "40px", rect: [16, 24, 300, 40] }] }] });
    for (const invalid of [false, true]) {
        const operation = runJarvisSemanticResponse({ input: "Analiza los datos observados", responseInstruction: "Analiza el diseño de la interfaz",
            responseMode: "grounded_conversation", responseBriefing,
            ai: { models: { generateContent: async request => {
                const ids = request.config.responseJsonSchema.properties.factIds.items.enum;
                assert.ok(ids.includes("interface.0.element.0.typography"));
                assert.match(JSON.stringify(request.config.chatMessages), /32px/);
                return { text: JSON.stringify({ requestedLineCount: 0, factIds: invalid ? ["invented.visual.success"] : ["interface.0.colors", "interface.0.element.0.typography", "interface.0.element.0.geometry"] }) };
            } } } });
        if (invalid) { await assert.rejects(operation, /SEMANTIC_RESPONSE_FORMAT_INVALID/); continue; }
        const result = await operation;
        assert.match(result.message, /32px/);
        assert.match(result.message, /rgb\(15, 23, 42\)/);
        assert.match(result.message, /Revisión parcial/);
        assert.match(result.message, /No se inspeccionaron píxeles/);
        assert.match(result.message, /coordenadas y dimensiones, no márgenes/);
        assert.doesNotMatch(result.message, /invented|inspección visual exitosa/);
    }
});

test("failed browser observations cannot enter measured-answer composition", async () => {
    const { compactMissionPlannerObservation } = await import("../gestia-core/jarvis/jarvis.mission.planner-state.js");
    const observation = { ok: true, executionOk: false, blocked: true,
        interfaceEvidence: { source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE", url: "https://runtime.test/", viewport: { width: 1000, height: 700 }, elements: [{ tag: "h1", fontSize: "32px" }] } };
    assert.equal(compactMissionPlannerObservation(observation).interfaceEvidence, undefined);
    const result = await composeEvidenceGroundedConversation({ instruction: "Analiza la interfaz", evidenceItems: [
        { name: "browser.inspect", observation },
        { name: "mission.outcome", observation: { status: "PARTIAL", completionAssessment: { objectives: [{ satisfied: false, limitation: "No hay una observación válida de la interfaz." }] } } }
    ], executeConversation: async () => { throw new Error("FAILED_EVIDENCE_MUST_NOT_REACH_MODEL"); } });
    assert.equal(result.status, "CONVERSATIONAL_EVIDENCE_INSUFFICIENT");
});


test("completion audit repairs one invalid evidence envelope without weakening closure", async () => {
    for (const alwaysInvalid of [false, true]) {
        const requests = [];
        const operation = runJarvisSemanticPlanner({ input: "Revisa la tipografía de esta interfaz",
            catalog: [{ name: "browser.inspect", mutates: false, evidenceKinds: ["interface_styles"] }],
            missionState: { phase: "COMPLETION_AUDIT", completedTasks: [{ name: "browser.inspect", observation: { ok: true } }] },
            ai: { models: { generateContent: async request => {
                requests.push(request);
                return { text: JSON.stringify({ toolCalls: [], missionComplete: false, completionAssessment: { objectives: [{
                    objective: "Revisar la tipografía", requiredEvidenceKind: "interface_styles", satisfied: false,
                    evidenceTaskIndexes: [], limitation: requests.length === 1 || alwaysInvalid ? "" : "La observación no contiene medidas tipográficas verificables."
                }] } }) };
            } } }
        });
        if (alwaysInvalid) await assert.rejects(operation, /SEMANTIC_COMPLETION_EVIDENCE_REQUIRED/);
        else {
            const result = await operation;
            assert.equal(result.missionComplete, false);
            assert.equal(result.completionAssessment.objectives[0].satisfied, false);
            assert.match(JSON.stringify(requests[1].config.chatMessages), /SEMANTIC_COMPLETION_EVIDENCE_REQUIRED/);
        }
        assert.equal(requests.length, 2);
        assert.equal(requests[0].config.temperature, 0);
        const schema = requests[0].config.responseJsonSchema;
        assert.equal(Object.keys(schema.properties)[0], "explanation");
        assert.ok(schema.required.includes("explanation"));
        assert.match(requests[0].config.chatMessages[0].content, /objeto o pagina solicitado/);
        const variants = schema.properties.completionAssessment.properties.objectives.items.anyOf;
        const incomplete = variants.find(item => item.properties.satisfied.enum[0] === false);
        const complete = variants.find(item => item.properties.satisfied.enum[0] === true);
        assert.equal(incomplete.properties.limitation.minLength, 1);
        assert.deepEqual(complete.properties.limitation.enum, [""]);
        assert.equal(complete.properties.evidenceTaskIndexes.minItems, 1);
        assert.equal(requests[1].config.chatMessages.at(-1).content, "Revisa la tipografía de esta interfaz");
    }
});


test("completion audit retry receives the rejected draft and enforces consistent completion", async () => {
    const input = "Revisa la tipografia de esta interfaz";
    const objective = { objective: "Revisar tipografia", requiredEvidenceKind: "interface_styles", evidenceTaskIndexes: [0], satisfied: true, limitation: "" };
    const rejected = { completionAssessment: { objectives: [objective] }, missionComplete: false, toolCalls: [] };
    for (const alwaysContradictory of [false, true]) {
        let attempts = 0;
        const operation = runJarvisSemanticPlanner({ input,
            catalog: [{ name: "browser.inspect", mutates: false, evidenceKinds: ["interface_styles"] }],
            missionState: { phase: "COMPLETION_AUDIT", completedTasks: [{ name: "browser.inspect", observation: { ok: true, interfaceEvidence: { source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE", elements: [{ tag: "h1", fontSize: "32px" }] } } }] },
            ai: { models: { generateContent: async request => {
                attempts++;
                if (attempts === 2) {
                    const draft = request.config.chatMessages.find(message => message.role === "assistant");
                    assert.ok(draft, "the retry needs the actual rejected draft, not just an error label");
                    assert.deepEqual(JSON.parse(draft.content), rejected);
                    assert.equal(request.config.chatMessages.at(-1).content, input);
                    assert.match(JSON.stringify(request.config.chatMessages), /missionComplete=true/);
                }
                return { text: JSON.stringify(attempts === 1 || alwaysContradictory ? rejected : { ...rejected, missionComplete: true }) };
            } } }
        });
        if (alwaysContradictory) await assert.rejects(operation, /SEMANTIC_COMPLETION_AUDIT_CONTRADICTORY/);
        else assert.equal((await operation).missionComplete, true);
        assert.equal(attempts, 2);
    }
});


test("completion status is projected from validated objectives without a second model verdict", async () => {
    const completed = { objective: "Revisar tipografia", requiredEvidenceKind: "interface_styles", satisfied: true, evidenceTaskIndexes: [0], limitation: "" };
    const pending = { objective: "Revisar imagenes", requiredEvidenceKind: "visual_inspection", satisfied: false, evidenceTaskIndexes: [], limitation: "No se inspeccionaron pixeles." };
    for (const objectives of [[completed], [completed, pending], [pending]]) {
        let attempts = 0;
        const result = await runJarvisSemanticPlanner({ input: "Revisa esta interfaz sin inventar observaciones",
            catalog: [{ name: "browser.inspect", mutates: false, evidenceKinds: ["interface_styles"] }],
            missionState: { phase: "COMPLETION_AUDIT", completedTasks: [{ name: "browser.inspect", observation: { ok: true, interfaceEvidence: { source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE", elements: [{ tag: "h1", fontSize: "32px" }] } } }] },
            ai: { models: { generateContent: async request => {
                attempts++;
                const schema = request.config.responseJsonSchema;
                assert.equal(schema.properties.missionComplete, undefined, "do not generate a redundant verdict independently of the objectives");
                assert.ok(!schema.required.includes("missionComplete"));
                return { text: JSON.stringify({ completionAssessment: { objectives }, toolCalls: [] }) };
            } } }
        });
        assert.equal(attempts, 1);
        assert.equal(result.missionComplete, objectives.every(item => item.satisfied));
        assert.deepEqual(result.completionAssessment.objectives, objectives);
        assert.equal(result.planKind, "COMPLETION_AUDIT");
    }
});

test("projected completion cannot bypass missing, failed or out-of-scope evidence", async () => {
    const observation = { ok: true, interfaceEvidence: { source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE", elements: [{ tag: "h1", fontSize: "32px" }] } };
    const objective = { objective: "Revisar tipografia", requiredEvidenceKind: "interface_styles", satisfied: true, evidenceTaskIndexes: [0], limitation: "" };
    for (const variant of [
        { objectives: [], observation, error: /SEMANTIC_COMPLETION_EVIDENCE_REQUIRED/ },
        { objectives: [{ ...objective, evidenceTaskIndexes: [] }], observation, error: /SEMANTIC_COMPLETION_EVIDENCE_REQUIRED/ },
        { objectives: [{ ...objective, evidenceTaskIndexes: [99] }], observation, error: /SEMANTIC_COMPLETION_EVIDENCE_INVALID/ },
        { objectives: [objective], observation: { ...observation, executionOk: false }, error: /SEMANTIC_COMPLETION_EVIDENCE_INVALID/ },
        { objectives: [{ ...objective, requiredEvidenceKind: "visual_inspection" }], observation, error: /SEMANTIC_COMPLETION_EVIDENCE_KIND_MISMATCH/ }
    ]) {
        await assert.rejects(runJarvisSemanticPlanner({ input: "Revisa esta interfaz",
            catalog: [{ name: "browser.inspect", mutates: false, evidenceKinds: ["interface_styles"] }],
            missionState: { phase: "COMPLETION_AUDIT", completedTasks: [{ name: "browser.inspect", observation: variant.observation }] },
            ai: { models: { generateContent: async () => ({ text: JSON.stringify({ completionAssessment: { objectives: variant.objectives }, toolCalls: [] }) }) } }
        }), variant.error);
    }
});


test("repeated verified fact IDs do not discard a grounded answer or count as new evidence", async () => {
    const { runJarvisSemanticResponse } = createRequire(import.meta.url)("../functions/jarvis-semantic-planner.js");
    const responseBriefing = JSON.stringify({ missionStatus: "PARTIAL",
        executedTools: [{ tool: "browser.inspect", ok: true, executionOk: true }],
        measuredInterfaceEvidence: [{ source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE", url: "https://runtime.test/terminal",
            viewport: { width: 1024, height: 768 }, pageStyles: { backgroundColor: "rgb(15, 23, 42)", color: "rgb(255, 255, 255)", fontFamily: "Arial", fontSize: "16px" },
            elements: [{ tag: "h1", text: "Terminal", fontFamily: "Arial", fontSize: "32px", fontWeight: "700", lineHeight: "40px", rect: [16, 24, 300, 40] }] }] });
    const id = "interface.0.element.0.typography";
    for (const variant of [
        { factIds: [id, id], requestedLineCount: 0, succeeds: true },
        { factIds: [id, id, "interface.0.colors"], requestedLineCount: 2, succeeds: true },
        { factIds: [id, id], requestedLineCount: 2, succeeds: false },
        { factIds: [id, "unobserved.admin.visual.success", id], requestedLineCount: 0, succeeds: false },
        { factIds: [id, 17], requestedLineCount: 0, succeeds: false }
    ]) {
        let calls = 0;
        const operation = runJarvisSemanticResponse({ input: "Analiza los datos observados", responseInstruction: "Revisa la interfaz actual",
            responseMode: "grounded_conversation", responseBriefing,
            ai: { models: { generateContent: async () => {
                calls++;
                return { text: JSON.stringify({ requestedLineCount: variant.requestedLineCount, factIds: variant.factIds }) };
            } } }
        });
        if (!variant.succeeds) await assert.rejects(operation, /SEMANTIC_RESPONSE_FORMAT_INVALID/);
        else {
            const result = await operation;
            assert.equal(result.ok, true);
            assert.equal(result.message.split("32px").length - 1, 1);
            assert.match(result.message, /parcial/);
            assert.doesNotMatch(result.message, /unobserved|visual.success/);
        }
        assert.equal(calls, 1);
    }
});


test("mission orchestration preserves measured geometry through final composition", async () => {
    const { compactMissionPlannerObservation } = await import("../gestia-core/jarvis/jarvis.mission.planner-state.js");
    const url = "https://runtime.test/terminal";
    const rect = [66, 16, 303.5, 28];
    const interfaceEvidence = { source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE", url, viewport: { width: 1230, height: 695 },
        pageStyles: { backgroundColor: "rgb(15, 23, 42)", fontSize: "16px" },
        elements: [{ tag: "h1", text: "Terminal", fontSize: "20px", rect }] };
    const tools = actuatorCatalog();
    const mission = await runJarvisMission({ instruction: "Revisa las medidas de esta interfaz",
        initialToolCalls: [{ name: "browser.inspect", args: { url } }], requiredToolNames: ["browser.inspect"],
        executionContractLocked: true, toolCatalog: [tools.get("browser.inspect")],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async () => ({ ok: true, status: "SUCCESS", data: { ok: true, status: "BROWSER_INSPECT_OK", url, interfaceEvidence } }),
        storage: { getItem: () => null, setItem() {} }
    });
    assert.equal(mission.completedTasks.length, 1);
    const observation = mission.completedTasks[0].observation;
    assert.deepEqual(compactMissionPlannerObservation(observation).interfaceEvidence.elements[0].rect, rect);
    const result = await composeEvidenceGroundedConversation({ instruction: "Revisa las medidas de esta interfaz",
        evidenceItems: [{ name: "mission.outcome", observation: { status: "PARTIAL" } }, ...mission.completedTasks],
        executeConversation: async (_prompt, options) => {
            const briefing = JSON.parse(options.responseBriefing);
            assert.deepEqual(briefing.measuredInterfaceEvidence[0].elements[0].rect, rect);
            return { ok: true, message: "Titulo observado de 20px con ancho 303.5px; no se inspeccionaron pixeles." };
        } });
    assert.equal(result.ok, true);
    assert.match(result.text, /303.5px/);
});

test("missing or corrupted geometry is never synthesized as zero measurements", async () => {
    const { compactBrowserInterfaceEvidence } = await import("../gestia-core/jarvis/jarvis.browser.grounding.js");
    for (const rect of [[null,null,null,null], [0,0,0,0], [16,20,"300",40], [16,20,NaN,40], [16,20,300], undefined]) {
        const result = compactBrowserInterfaceEvidence({ source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE", url: "https://runtime.test/",
            elements: [{ tag: "h1", fontSize: "20px", rect }] });
        assert.deepEqual(result.elements[0].rect, []);
        assert.equal(result.elements[0].fontSize, "20px");
    }
    const rect = [0,0,303.5,28];
    const result = compactBrowserInterfaceEvidence({ source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE", url: "https://runtime.test/",
        elements: [{ tag: "h1", fontSize: "20px", rect }] });
    assert.deepEqual(result.elements[0].rect, rect);
});

test("final response rejects unmeasured geometry while preserving observed typography", async () => {
    const { runJarvisSemanticResponse } = createRequire(import.meta.url)("../functions/jarvis-semantic-planner.js");
    const result = await runJarvisSemanticResponse({ input: "Revisa las medidas observadas", responseInstruction: "Revisa la interfaz",
        responseMode: "grounded_conversation", responseBriefing: JSON.stringify({ missionStatus: "PARTIAL",
            executedTools: [{ tool: "browser.inspect", ok: true }], measuredInterfaceEvidence: [{ source: "CURRENT_RENDERED_DOM_COMPUTED_STYLE",
                url: "https://runtime.test/", viewport: { width: 1000, height: 700 }, elements: [{ tag: "h1", fontSize: "20px", rect: [0,0,0,0] }] }] }),
        ai: { models: { generateContent: async request => {
            const ids = request.config.responseJsonSchema.properties.factIds.items.enum;
            assert.ok(!ids.includes("interface.0.element.0.geometry"));
            return { text: JSON.stringify({ requestedLineCount: 0, factIds: ["interface.0.element.0.typography"] }) };
        } } }
    });
    assert.match(result.message, /20px/);
    assert.doesNotMatch(result.message, /ancho 0|alto 0|x=0/);
});


test("terminal shell opts into keyboard reflow without disabling zoom", () => {
    const source = readFileSync(new URL("../gestia-terminal.html", import.meta.url), "utf8");
    const viewport = source.match(/<meta name="viewport"[^>]+>/)?.[0] || "";
    assert.match(viewport, /interactive-widget=resizes-content/);
    assert.match(viewport, /viewport-fit=cover/);
    assert.doesNotMatch(viewport, /user-scalable=no|maximum-scale/);
    assert.match(source, /100dvh/);
    assert.match(source, /safe-area-inset-bottom/);
    const body = source.match(/<body[^>]+>/)?.[0] || "";
    assert.doesNotMatch(body, /h-screen/);
    assert.match(source, /aria-label="Mensaje para ADJUNTO"/);
    assert.match(source, /aria-label="Enviar mensaje"/);
});

test("terminal visible viewport preserves composer on shrink, restoration and pinch zoom", () => {
    const source = readFileSync(new URL("../gestia-terminal.html", import.meta.url), "utf8");
    const script = source.match(/<script id="terminal-viewport-controller">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script, "viewport controller must be part of the served page");
    const styles = new Map(), events = new Map(), queued = [];
    const viewport = { height: 672, offsetTop: 0, scale: 1,
        addEventListener: (name, fn) => events.set('viewport.' + name, fn) };
    const field = { value: "Borrador del usuario", scrollHeight: 52, style: {},
        addEventListener: (name, fn) => events.set('input.' + name, fn) };
    const root = { style: { setProperty: (key,value) => styles.set(key,value), getPropertyValue: key => styles.get(key) || '' }, classList: { toggle() {} } };
    const window = { innerHeight: 800, visualViewport: viewport, addEventListener: (name, fn) => events.set('window.'+name,fn) };
    runInNewContext(script, { window, document: { readyState: "complete", documentElement: root, getElementById: id => id === 'gestia-input' ? field : null },
        requestAnimationFrame: fn => { queued.push(fn); return queued.length; }, Number, Math, parseFloat });
    const flush = () => { while(queued.length)queued.shift()(); };
    assert.equal(styles.get('--terminal-viewport-height'), '672px');
    viewport.height=340; viewport.offsetTop=12; events.get('viewport.resize')(); flush();
    assert.equal(styles.get('--terminal-viewport-height'), '340px');
    assert.equal(styles.get('--terminal-viewport-top'), '12px');
    field.scrollHeight=400; events.get('input.input')();
    assert.ok(parseFloat(field.style.height)<=109, 'multiline draft must not cover all available height');
    assert.equal(field.value,'Borrador del usuario');
    viewport.scale=2; viewport.height=170; events.get('viewport.resize')(); flush();
    assert.equal(styles.get('--terminal-viewport-height'),'340px','pinch zoom must not shrink the layout');
    viewport.scale=1; viewport.height=NaN; events.get('viewport.resize')(); flush();
    assert.equal(styles.get('--terminal-viewport-height'),'340px','invalid viewport must not collapse the app');
    viewport.height=744; viewport.offsetTop=0; events.get('viewport.resize')(); flush();
    assert.equal(styles.get('--terminal-viewport-height'),'744px');
    assert.equal(styles.get('--terminal-viewport-top'),'0px');
    assert.equal(field.value,'Borrador del usuario');
});


test("current conversation echo is repaired by the same model, never rendered as an answer", async () => {
    const input = "Qué sabes hacer";
    const stages = [];
    const result = await runJarvisSemanticPlanner({ input,
        catalog: [{ name: "conversation.respond", description: "Respond", inputSchema: { prompt: "string" } }],
        missionState: { phase: "CURRENT_TURN", conversationalGate: true },
        ai: { models: { generateContent: async request => {
            stages.push(request.config.semanticStage || "answer");
            if (request.config.semanticStage === "CURRENT_TURN_CONVERSATION_GATE") return { text: JSON.stringify({mode:"chat",requiresConversationContext:false,missing:"",question:"",action:""}) };
            if (request.config.semanticStage === "CURRENT_TURN_CONVERSATION_ECHO_REPAIR") {
                assert.equal(request.config.nativeTextChat, true);
                assert.equal(request.config.chatMessages.at(-1).content, input);
                return { text: "Puedo explicar conceptos, redactar mensajes y ayudarte a analizar el texto que compartas." };
            }
            return { text: "¿Qué sabes hacer?" };
        } } }
    });
    assert.equal(stages.length, 3);
    assert.equal(result.toolCalls[0].name, "conversation.respond");
    assert.match(result.toolCalls[0].args.prompt, /explicar conceptos/);
    assert.equal(result.missionComplete, false);
    assert.equal(result.toolCalls[0].approved, false);
});

test("a second echoed answer fails closed without an infinite retry or canned response", async () => {
    const input = "Qué puedes hacer";
    let count = 0;
    await assert.rejects(() => runJarvisSemanticPlanner({ input,
        catalog: [{name:"conversation.respond",description:"Respond",inputSchema:{prompt:"string"}}],
        missionState:{phase:"CURRENT_TURN"},
        ai:{models:{generateContent:async request=>{
            count++;
            if(request.config.semanticStage === "CURRENT_TURN_CONVERSATION_ECHO_REPAIR") return {text:input};
            return {functionCalls:[{name:"jarvis_tool_0",args:{prompt:input}}]};
        }}}
    }), /SEMANTIC_CONVERSATION_RESPONSE_ECHO/);
    assert.equal(count,2);
});

test("native conversational prose gets a constrained same-model plan repair, not a silent completion", async () => {
    let count = 0;
    const result = await runJarvisSemanticPlanner({input:"Explica para qué sirve una tabla",
        catalog:[{name:"conversation.respond",description:"Respond",inputSchema:{prompt:"string"}}],
        missionState:{phase:"CURRENT_TURN"},
        ai:{models:{generateContent:async request=>{
            count++;
            if(count===1)return {text:"Una tabla organiza información en filas y columnas."};
            assert.equal(request.config.semanticStage,"CURRENT_TURN_STRUCTURED_PLAN_REPAIR");
            assert.deepEqual(request.config.responseJsonSchema.properties.missionComplete.enum,[false]);
            assert.equal(request.config.responseJsonSchema.properties.toolCalls.maxItems,1);
            assert.match(request.config.chatMessages[1].content,/BORRADOR_NO_VERIFICADO/);
            return {text:JSON.stringify({toolCalls:[{name:"conversation.respond",args:{prompt:"Una tabla organiza información en filas y columnas para facilitar comparaciones."}}],missionComplete:false})};
        }}}
    });
    assert.equal(count,2);
    assert.equal(result.toolCalls[0].approved,false);
    assert.equal(result.missionComplete,false);
    assert.match(result.toolCalls[0].args.prompt,/facilitar comparaciones/);
});

test("mobile capability answers use the gateway limits rather than advertising the laptop registry", async () => {
    const result = await runJarvisSemanticPlanner({input:"Qué me puedes ayudar a hacer",
        catalog:[{name:"conversation.respond",description:"Respond",inputSchema:{prompt:"string"}},
            {name:"video.generate",description:"Generate local video",inputSchema:{prompt:"string"}}],
        missionState:{phase:"CURRENT_TURN",conversationalGate:true,runtimeTransport:{name:"FIRESTORE_PRIVATE"}},
        ai:{models:{generateContent:async request=>{
            if(request.config.semanticStage==="CURRENT_TURN_CONVERSATION_GATE")return {text:JSON.stringify({mode:"chat",requiresConversationContext:false,missing:"",question:"",action:""})};
            const system=request.config.chatMessages[0].content;
            assert.match(system,/CURRENT_TRANSPORT=FIRESTORE_PRIVATE/);
            assert.match(system,/No puedes crear archivos descargables/);
            assert.doesNotMatch(system,/REGISTERED_TOOL_NAMES=/);
            return {text:"Puedo redactar texto y explicarte conceptos; producir video no está habilitado por este enlace."};
        }}}
    });
    assert.equal(result.toolCalls[0].name,"conversation.respond");
    assert.equal(result.missionComplete,false);
});

test("long terminal diagnostics inherit wrapping without changing preformatted code scrolling",()=>{
    const source=readFileSync(new URL("../gestia-terminal.html",import.meta.url),"utf8");
    assert.match(source,/#gestia-output \{ overflow-wrap: anywhere; \}/);
    assert.match(source,/#gestia-output pre \{ overflow-x: auto; \}/);
});
