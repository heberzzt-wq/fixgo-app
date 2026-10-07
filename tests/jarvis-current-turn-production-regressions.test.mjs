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
        normalizeObservationFilePath: value => String(value || "").replaceAll("\\", "/"),
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

function longJsonReadFixture(overrides = {}) {
    const content = JSON.stringify({ metadata: { note: 'x'.repeat(18000) }, operations: Object.fromEntries(Array.from({length: 55}, (_, i) => ['operation.' + i, 'observed command ' + i])) }, null, 2);
    const lines = content.split('\n');
    return { name: 'repo.read', observation: { ok: true, executionOk: true, verifiedRead: { file: 'fixture.json', partial: false, startLine: 1, endLine: lines.length, totalLines: lines.length,
        numberedContent: lines.map((line, i) => `${i + 1}: ${line}`).join('\n'), ...overrides } } };
}

test('large verified JSON preserves every property after an oversized first value', async () => {
    const fixture = longJsonReadFixture();
    const original = JSON.stringify(fixture);
    const { runJarvisSemanticResponse } = createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');
    const result = await composeEvidenceGroundedConversation({ instruction: 'Enumera las operaciones del archivo leído.',
        evidenceItems: [fixture, { name: 'mission.outcome', observation: { status: 'COMPLETED' } }],
        executeConversation: async (input, options) => {
            const projection = JSON.parse(options.responseBriefing).groundedJsonRead;
            assert.ok(projection, 'derive the projection from original read bytes, not the truncated preview');
            assert.equal(projection.propertiesComplete, true);
            assert.equal(projection.totalProperties, 56);
            assert.equal(projection.entries.length, 56);
            assert.deepEqual(projection.entries.at(-1).path, ['operations', 'operation.54']);
            assert.equal(projection.entries.at(-1).value, 'observed command 54');
            assert.equal(projection.entries[0].valueTruncated, true);
            assert.ok(options.responseBriefing.length <= 16000);
            return runJarvisSemanticResponse({ input, ...options, ai: { models: { generateContent: async request => {
                const facts = JSON.parse(request.config.chatMessages.find(m => m.content.startsWith('FACTS=')).content.split('\nREQUEST=')[0].slice(6));
                const id = Object.keys(facts).find(key => facts[key].includes('operation.54'));
                assert.ok(id, 'the last property must reach the same model');
                assert.match(request.config.chatMessages[0].content, /Every relevant/);
                return { text: JSON.stringify({requestedLineCount: 0, factIds: [id]}) };
            } } } });
        } });
    assert.equal(result.ok, true, result.status);
    assert.match(result.text, /operation.54/);
    assert.equal(JSON.stringify(fixture), original, 'evidence and original bytes must not be rewritten');
});

test('partial truncated corrupt or failed JSON cannot claim complete property coverage', async () => {
    for (const patch of [{partial:true}, {evidenceTextTruncated:true}, {startLine:2}, {endLine:2}, {numberedContent:'1: {"missing":'}, {numberedContent:'2: {}'}]) {
        await composeEvidenceGroundedConversation({instruction:'Enumera las operaciones.', evidenceItems:[longJsonReadFixture(patch), {name:'mission.outcome',observation:{status:'COMPLETED'}}],
            executeConversation: async (_input, options) => {assert.equal(JSON.parse(options.responseBriefing).groundedJsonRead, undefined); return {ok:true,message:'La evidencia disponible no permite enumerarlas todas.'};} });
    }
    const failed = longJsonReadFixture(); failed.observation.executionOk=false;
    await composeEvidenceGroundedConversation({instruction:'Enumera las operaciones.', evidenceItems:[failed,{name:'mission.outcome',observation:{status:'COMPLETED'}}],
        executeConversation:async(_input,options)=>{assert.equal(JSON.parse(options.responseBriefing).groundedJsonRead,undefined);return{ok:true,message:'Lectura no acreditada.'};}});
});

test('JSON projection output rejects unknown facts and preserves abbreviation limits', async () => {
    const { runJarvisSemanticResponse } = createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');
    const fixture=longJsonReadFixture();let options;
    await composeEvidenceGroundedConversation({instruction:'Muestra el primer valor.', evidenceItems:[fixture,{name:'mission.outcome',observation:{status:'COMPLETED'}}],executeConversation:async(_input,o)=>{options=o;return{ok:true,message:'fixture'};}});
    assert.ok(JSON.parse(options.responseBriefing).groundedJsonRead);
    const result=await runJarvisSemanticResponse({input:'Muestra el primer valor.',...options,ai:{models:{generateContent:async request=>{
        const ids=request.config.responseJsonSchema.properties.factIds.items.enum;
        return{text:JSON.stringify({requestedLineCount:0,factIds:[ids[0]]})};
    }}}});
    assert.match(result.message,/abreviado/);
    await assert.rejects(runJarvisSemanticResponse({input:'Muestra el primer valor.',...options,ai:{models:{generateContent:async()=>({text:JSON.stringify({requestedLineCount:0,factIds:['invented.success']})})}}}),/SEMANTIC_RESPONSE_FORMAT_INVALID/);
});


test("native tool schema includes explicit object properties even for untyped tools", () => {
    const {buildGeminiModelTools}=createRequire(import.meta.url)("../functions/jarvis-semantic-planner.js");
    for(const inputSchema of [null,{options:"object"}]){
        const declarations=buildGeminiModelTools([{name:"repo.fixture",description:"Fixture",inputSchema}]);
        const schema=declarations[0].parametersJsonSchema;
        assert.equal(schema.type,"object");
        assert.equal(typeof schema.properties,"object");
        if(inputSchema)assert.deepEqual(schema.properties.options.properties,{});
    }
});


test('failed observations cannot be rewritten as zero business records', async () => {
    let modelCalls=0;
    for(const instruction of ['cuantos tecnicos tenemos registrados en la plataforma y como se llaman','Enumera los pedidos pendientes.']) {
        const result=await composeEvidenceGroundedConversation({instruction,evidenceItems:[
            {name:'system.health',observation:{ok:false,executionOk:false,status:'TOOL_EXECUTION_FAILED',error:{code:'HEALTH_UNAVAILABLE',message:'No se pudo consultar el servicio.'}}},
            {name:'mission.outcome',observation:{status:'PARTIAL',reason:'PARTIAL_CAPABILITY_BLOCKED',completedTasks:[]}}
        ],executeConversation:async()=>{modelCalls++;return{ok:true,message:'La plataforma no tiene registros.'};}});
        assert.equal(result.status,'CONVERSATIONAL_EVIDENCE_INSUFFICIENT');assert.doesNotMatch(result.text,/no tiene registros|no hay técnicos|\[object Object\]/i);assert.match(result.text,/HEALTH_UNAVAILABLE|No se pudo consultar/);
    }
    assert.equal(modelCalls,0,'failure receipts contain no business facts for a generative answer');
});

test('duplicate measured findings are rendered once without empty proposal labels', async () => {
    const {runJarvisSemanticResponse}=createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');
    const page={source:'RENDERED_DOM_LAYOUT_REPLAY',url:'https://runtime.test/terminal',phase:'before',viewports:[{viewport:{width:1280,height:720},findings:[{selector:'#small',classification:'recommendation',summary:'Texto de 11 px',severity:'low',certainty:'high'}]}],limitations:['No se inspeccionaron píxeles.']};
    const result=await runJarvisSemanticResponse({input:'Analiza la interfaz.',responseInstruction:'Analiza la interfaz.',responseMode:'grounded_conversation',responseBriefing:JSON.stringify({missionStatus:'PARTIAL',executedTools:[{tool:'browser.inspect',ok:true}],measuredInterfaceEvidence:[page,page]}),ai:{models:{generateContent:async request=>{
        const ids=request.config.responseJsonSchema.properties.factIds.items.enum;
        return{text:JSON.stringify({requestedLineCount:0,factIds:ids.filter(id=>id.includes('finding.'))})};
    }}}});
    assert.equal(result.message.split('Texto de 11 px').length-1,1);assert.equal(result.message.split('Alcance: reproducción DOM').length-1,1);assert.doesNotMatch(result.message,/Propuesta: Prueba:/);assert.match(result.message,/1280 × 720/);
});


test('mobile identity verification uses the shared transport and still rejects wrong lineage', async () => {
    const source=readFileSync(new URL('../gestia-core/tools.runtime.js',import.meta.url),'utf8');
    const node=parse(source,{sourceType:'module',ecmaVersion:'latest'}).body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left?.property?.name==='verifyIdentity').expression.right;
    const expected={projectId:'fixture',repository:'owner/repo',branch:'work',releaseId:'release-fixture'};
    for(const wrong of [false,true]){
        const routes=[],fetches=[];
        const bridge={privateRelayState:{status:'READY'},requestJson:async route=>{routes.push(route);return {ok:true,bridgeVersion:'2.99.0',identity:{ok:true,status:'BRIDGE_IDENTITY_OK',contract:{...expected,repository:wrong?'other/repo':expected.repository}}};}};
        const check=runInNewContext('('+source.slice(node.start,node.end)+')',{window:{JarvisLocalBridge:bridge},fetch:async url=>{fetches.push(url);return{ok:true,json:async()=>expected};},jarvisBridgeVersionAtLeast:()=>true,JARVIS_REQUIRED_LOCAL_BRIDGE_VERSION:'2.0.0',JARVIS_RELEASE_SKEW_SAFE_MIN_BRIDGE_VERSION:'2.0.0'});
        const result=await check({force:true});
        assert.deepEqual(routes,['/semantic/local/health']);
        assert.deepEqual(fetches,['/jarvis-runtime-contract.json']);
        assert.equal(result.ok,!wrong);
        if(wrong)assert.equal(result.status,'BRIDGE_IDENTITY_MISMATCH');
    }
});

test('lightweight workstation health does not invent missing AI readiness or hide failures', async t => {
    const previous=globalThis.JarvisLocalBridge;t.after(()=>{globalThis.JarvisLocalBridge=previous;});
    const tools=runtime();registerJarvisMultifunctionTools(tools);
    for(const ready of [undefined,false,true]){
        globalThis.JarvisLocalBridge={verifyIdentity:async()=>({ok:true,status:'BRIDGE_IDENTITY_OK'}),requestJson:async()=>({ok:true,status:'JARVIS_WORKSTATION_LIVE',...(ready===undefined?{}:{localAi:{ready}})})};
        const result=await tools.get('system.health').execute({});
        assert.equal(result.environment.localAiReady,ready??null);
        assert.deepEqual(result.evidenceKinds,['system_telemetry']);
        assert.equal(result.failures.includes('LOCAL_AI_NOT_READY'),ready===false);
        if(ready===false)assert.match(result.error,/LOCAL_AI_NOT_READY/);
    }
});

test('a healthy peer lease leaves a second browser tab in standby without repeated warnings',async()=>{
    const source=readFileSync(new URL('../modules/terminal/nexo-bootstrap.js',import.meta.url),'utf8');
    const node=parse(source,{sourceType:'module',ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='configureJarvisPrivateRelay');
    const timers=[],messages=[];let attempts=0;
    const configure=runInNewContext('('+source.slice(node.start,node.end)+')',{console:{info:(...a)=>messages.push(['info',...a]),warn:(...a)=>messages.push(['warn',...a])},setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},clearTimeout(){},privateRelayWorkstationEnabled:()=>true,privateRelayDependencies:async()=>({}),readRuntimeContract:async()=>({privateRelayEnabled:true}),startJarvisBrowserRelay:async()=>{attempts++;throw Object.assign(new Error('Peer owns lease'),{code:'JARVIS_RELAY_LEASE_HELD'});}});
    const bridge={requestJson:async()=>{throw Error('NO_DIRECT_CALL_EXPECTED');}};configure(bridge);
    timers.shift().f();await new Promise(setImmediate);
    assert.equal(bridge.privateRelayState.status,'STANDBY');assert.equal(bridge.privateRelayState.connected,false);assert.equal(timers[0].ms,30000);
    timers.shift().f();await new Promise(setImmediate);assert.equal(attempts,2);assert.equal(messages.length,1);assert.equal(messages[0][0],'info');
});


test('retrieval actions accept meaning regardless of language and word count without granting execution', () => {
    const source=readFileSync(new URL('../functions/jarvis-semantic-planner.js',import.meta.url),'utf8');
    const from=source.indexOf('function validActionDescription('), to=source.indexOf('\nfunction browserGroundingInstruction',from);
    const valid=runInNewContext('('+source.slice(from,to).trim()+')');
    for(const action of ['analyze repository','auditar','分析代码库','Consultar los registros vigentes según las fuentes y permisos de esta cuenta']) assert.equal(valid(action),true);
    for(const action of ['', ' ', null, 42, {}, 'x'.repeat(513)]) assert.equal(valid(action),false);
    assert.doesNotMatch(source,/3-8 English words|words.length >= 3/);
});


test('retrieval action accepts natural phrasing without language or word-count gates', () => {
    const source=readFileSync(new URL('../functions/jarvis-semantic-planner.js',import.meta.url),'utf8');
    const start=source.indexOf('function validActionDescription('),end=source.indexOf('\nfunction browserGroundingInstruction',start);
    const valid=runInNewContext('(()=>{'+source.slice(start,end)+'; return validActionDescription})()');
    for(const value of ['analyze repository','Analiza','調査','audita el código y consulta registros de la aplicación según la evidencia'])assert.equal(valid(value),true,value);
    for(const value of ['', '   ', {action:'read'}, null, 1, 'x'.repeat(513)])assert.equal(valid(value),false);
    assert.doesNotMatch(source,/3-8 English words|words.length >= 3/);
});

function platformQueryTestFixture({signedIn=true,fail=null,fromCache=false,changeSession=false}={}) {
    const source=readFileSync(new URL('../gestia-core/tools.runtime.js',import.meta.url),'utf8');
    const ast=parse(source,{sourceType:'module',ecmaVersion:'latest'});
    const declaration=ast.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='executePlatformQuery')?.declaration;
    assert.ok(declaration,'generic platform query must be wired into the real runtime');
    const execute=runInNewContext('('+source.slice(declaration.start,declaration.end)+')');
    const auth={currentUser:signedIn?{uid:'fixture-caller'}:null},calls=[];
    const docs=[{id:'a',get:field=>({title:'Uno',privateNote:'DO_NOT_EXPOSE'}[field])},{id:'b',get:field=>({title:'Dos',privateNote:'DO_NOT_EXPOSE'}[field])},{id:'c',get:field=>({title:'Tres'}[field])}];
    const sdk={collection:(_db,name)=>({collection:name}),query:(base,...constraints)=>({base,constraints}),where:(...args)=>({where:args}),orderBy:field=>({orderBy:field}),documentId:()=> '__name__',limit:value=>({limit:value}),doc:(_db,collection,id)=>({collection,id}),startAfter:document=>({after:document.id}),
        getDocFromServer:async({id})=>({id,exists:()=>true}),getCountFromServer:async q=>{calls.push({kind:'count',q});if(fail)throw Object.assign(new Error('Read failed'),{code:fail});return{data:()=>({count:3})}},
        getDocsFromServer:async q=>{calls.push({kind:'query',q});if(fail)throw Object.assign(new Error('Read failed'),{code:fail});if(changeSession)auth.currentUser={uid:'different'};return{docs,metadata:{fromCache}};}};
    const context={completedTasks:[{name:'repo.read',observation:{ok:true,executionOk:true,verifiedRead:{file:'source.js',content:'const data = collection(db, "arbitrary_records");',sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:['arbitrary_records'],complete:true}}}}}]};
    const args={collection:'arbitrary_records',sourceFile:'source.js',fields:['title'],pageSize:2,includeCount:true};
    return{execute,args,context,calls,dependencies:{auth,db:{},sdk}};
}

test('generic platform queries use session rules and return only selected fields with truthful pagination',async()=>{
    const f=platformQueryTestFixture();const r=await f.execute(f.args,f.dependencies,f.context);
    assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.recordEvidence.totalCount,3);assert.equal(r.recordEvidence.returnedCount,2);assert.equal(r.recordEvidence.nextCursor,'b');assert.equal(r.recordEvidence.hasMore,true);assert.equal(r.recordEvidence.completeForQuery,false);
    assert.doesNotMatch(JSON.stringify(r),/DO_NOT_EXPOSE|privateNote/);assert.equal(f.calls.length,2);
    const count=await f.execute({...f.args,mode:'count',fields:[]},f.dependencies,f.context);assert.equal(count.ok,true);assert.equal(count.recordEvidence.totalCount,3);assert.equal(count.recordEvidence.rows,undefined);
});

test('missing source evidence auth and server failures never become zero registered records',async()=>{
    for(const options of [{signedIn:false},{fail:'permission-denied'},{fail:'unavailable'},{fromCache:true},{changeSession:true}]){
        const f=platformQueryTestFixture(options);const r=await f.execute(f.args,f.dependencies,f.context);assert.equal(r.ok,false,JSON.stringify(options));assert.equal(r.recordEvidence,undefined);assert.ok(r.error.code);
        if(options.signedIn===false)assert.equal(f.calls.length,0);
    }
    const f=platformQueryTestFixture();const r=await f.execute(f.args,f.dependencies,{completedTasks:[]});assert.equal(r.ok,false);assert.equal(r.error.code,'PLATFORM_QUERY_SOURCE_NOT_READ');assert.equal(f.calls.length,0);
});

test('read investigations retain other pure readers without granting artifact or write capability',async()=>{
    const tools=[{name:'repo.read',mutates:false},{name:'platform.query',mutates:false,investigationReadOnly:true,evidenceKinds:['platform_records']},{name:'fixture.otherRead',mutates:false,investigationReadOnly:true},{name:'repo.write',mutates:true},{name:'file.make',mutates:false,userArtifact:true}];
    const result=await prepareContract([{name:'repo.read',args:{file:'source.js'}}],tools);
    assert.equal(result.expansions,0);assert.deepEqual(Array.from(result.missionToolCatalog,t=>t.name),['repo.read','platform.query','fixture.otherRead']);
});


test('native tool declarations retain semantic names and accept only exact registered calls', () => {
 const {buildGeminiModelTools,extractGeminiToolCallPlan}=createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');
 const catalog=[{name:'fixture.read',description:'Read a source',inputSchema:{file:'string'}},{name:'fixture.query',description:'Query live records',inputSchema:{collection:'string'}}];
 assert.deepEqual(buildGeminiModelTools(catalog).map(t=>t.name),['fixture.read','fixture.query']);
 for(const name of ['fixture.read','jarvis_tool_0'])assert.equal(extractGeminiToolCallPlan({functionCalls:[{name,args:{file:'observed.js'}}]},catalog).toolCalls[0].name,'fixture.read');
 assert.equal(extractGeminiToolCallPlan({functionCalls:[{name:'invented.tool',args:{}}]},catalog),null);
});


test('a schema with only optional parameters does not acquire invented instruction or query arguments', async () => {
 const result=await runJarvisSemanticPlanner({input:'Inspecciona el recurso activo',catalog:[{name:'fixture.inspect',mutates:false,inputSchema:{type:'object',properties:{target:{type:'string'}},additionalProperties:false}}],
 ai:{models:{generateContent:async()=>({functionCalls:[{name:'fixture.inspect',args:{}}]})}}});
 assert.deepEqual(result.toolCalls[0].args,{});assert.equal(result.toolCalls[0].approved,false);
});


test('a read-only investigation continues from discovery to live evidence instead of closing after its first read', async () => {
 const calls=[];let audits=0;
 const catalog=[{name:'fixture.discover',mutates:false,investigationReadOnly:true},{name:'fixture.query',mutates:false,investigationReadOnly:true}];
 const result=await runJarvisMission({instruction:'Encuentra la fuente y consulta los registros actuales',initialToolCalls:[{name:'fixture.discover',args:{}}],requiredToolNames:['fixture.discover'],executionContractLocked:true,toolCatalog:catalog,
 storage:{getItem:()=>null,setItem(){}},planner:async()=>{audits++;return audits===1?{toolCalls:[{name:'fixture.query',args:{source:'verified'}}],missionComplete:false}:{toolCalls:[],missionComplete:true};},
 execute:async call=>{calls.push(call.name);return {ok:true,status:'OBSERVED',summary:call.name==='fixture.discover'?'Fuente encontrada, aún no se consultan datos':'Datos consultados'};}});
 assert.deepEqual(calls,['fixture.discover','fixture.query']);assert.equal(audits,2);assert.equal(result.status,'COMPLETED');
});

test('a failed read remains visible to the investigation planner and a missing file is never treated as an empty record set', async () => {
 let audits=0;
 const result=await runJarvisMission({instruction:'Lee el archivo solicitado',initialToolCalls:[{name:'fixture.read',args:{file:'missing.txt'}}],requiredToolNames:['fixture.read'],executionContractLocked:true,toolCatalog:[{name:'fixture.read',mutates:false,investigationReadOnly:true}],
 storage:{getItem:()=>null,setItem(){}},planner:async({mission})=>{audits++;assert.equal(mission.blockedTasks.length,1);return {toolCalls:[],missionComplete:false,completionAssessment:{objectives:[{satisfied:false,limitation:'La lectura devolvió FILE_NOT_FOUND; no hay contenido verificado.'}]}};},
 execute:async()=>({ok:false,executionOk:false,status:'FILE_NOT_FOUND',error:'FILE_NOT_FOUND',retryable:false})});
 assert.equal(audits,1);assert.notEqual(result.status,'COMPLETED');assert.equal(result.completedTasks.length,0);assert.equal(result.blockedTasks.length,1);
});


test('structural inventory counts survive the executed mission and final response without becoming test execution',async()=>{
 const {compactMissionPlannerObservation}=await import('../gestia-core/jarvis/jarvis.mission.planner-state.js');
 const mission=await runJarvisMission({instruction:'Describe el inventario',initialToolCalls:[{name:'fixture.inventory',args:{}}],requiredToolNames:['fixture.inventory'],executionContractLocked:true,toolCatalog:[{name:'fixture.inventory',mutates:false}],storage:{getItem:()=>null,setItem(){}},planner:async()=>({toolCalls:[],missionComplete:true}),execute:async()=>({ok:true,source:'live_repo_ast_graph',status:'REPO_AUDIT_READY',summary:{filesScanned:17,tests:4,dependencyEdges:9}})});
 const observation=mission.completedTasks[0].observation;
 assert.equal(observation.inventoryEvidence.counts.tests,4);
 assert.equal(compactMissionPlannerObservation(observation).inventoryEvidence.counts.filesScanned,17);
 await composeEvidenceGroundedConversation({instruction:'Describe el inventario',evidenceItems:[...mission.completedTasks,{name:'mission.outcome',observation:mission}],executeConversation:async(_input,options)=>{const inventory=JSON.parse(options.responseBriefing).repositoryInventories[0];assert.equal(inventory.counts.tests,4);assert.match(inventory.scope,/not executed tests/);return{ok:true,message:'El inventario incluye 17 archivos y 4 marcados como pruebas; las pruebas no se ejecutaron.'};}});
 assert.equal(compactMissionPlannerObservation({...observation,executionOk:false}).executionOk,false);
 assert.equal(compactMissionPlannerObservation({...observation,executionOk:false}).inventoryEvidence,undefined);
});


test('missing evidence continues with the same local model and actual read capability rather than a forced partial stop',async()=>{
 let continuations=0;const input='Consulta los registros descritos por la fuente';
 const result=await runJarvisSemanticPlanner({input,catalog:[{name:'fixture.search',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},{name:'fixture.read',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},{name:'fixture.write',mutates:true,requiresApproval:true}],missionState:{phase:'COMPLETION_AUDIT',completedTasks:[{name:'fixture.search',args:{query:'records'},observation:{ok:true,summary:'Found source.js'}}]},ai:{models:{generateContent:async request=>{
 if(request.config.semanticStage==='READ_ONLY_EVIDENCE_CONTINUATION'){continuations++;const names=request.config.tools[0].functionDeclarations.map(t=>t.name);assert.deepEqual(names,['fixture.search','fixture.read']);assert.match(JSON.stringify(request.config.chatMessages),/source.js/);return{functionCalls:[{name:'fixture.read',args:{file:'source.js'}}]};}
 return{text:JSON.stringify({explanation:'Falta leer la fuente encontrada',completionAssessment:{objectives:[{objective:input,requiredEvidenceKind:'tool_result',satisfied:false,evidenceTaskIndexes:[],limitation:'Falta leer la fuente encontrada'}]},toolCalls:[]})};
 }}}});assert.equal(continuations,1);assert.equal(result.missionComplete,false);assert.equal(result.toolCalls[0].name,'fixture.read');assert.equal(result.toolCalls[0].approved,false);
});


test('source discovery paths survive planner compaction and evidence-bound arguments cannot invent a source file',async()=>{
 const {compactMissionPlannerObservation}=await import('../gestia-core/jarvis/jarvis.mission.planner-state.js');
 const observation=compactMissionPlannerObservation({ok:true,executionOk:true,repoCandidates:[{file:'actual-source.js',reasons:['Symbol and collection observed']}]});
 assert.equal(observation.repoCandidates[0].file,'actual-source.js');
 const source=readFileSync(new URL('../functions/jarvis-semantic-planner.js',import.meta.url),'utf8');
 const from=source.indexOf('function bindEvidencePrerequisites('),to=source.indexOf('function completionAuditSchema(',from);
 const bind=runInNewContext('('+source.slice(from,to).trim()+')',{structuredClone,buildNativeInputSchema:schema=>schema});
 const catalog=[{name:'fixture.read',evidenceKinds:['source']},{name:'fixture.query',requiresEvidence:[{kind:'source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'}}}}];
 assert.equal(bind(catalog,[]).length,1);
 const tasks=[{name:'fixture.read',observation:{ok:true,verifiedRead:{file:'actual-source.js'}}}];
 assert.deepEqual(Array.from(bind(catalog,tasks)[1].inputSchema.properties.sourceFile.enum),['actual-source.js']);
 assert.equal(bind(catalog,[{...tasks[0],observation:{...tasks[0].observation,executionOk:false}}]).length,1);
});


test('an already completed search triggers one same-model continuation rather than stopping the mission',async()=>{
 const input='Consulta los registros actuales después de descubrir su fuente';let continuations=0;
 const search={name:'fixture.search',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'integer'}},required:['query']}};
 const read={name:'fixture.read',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_source'],inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}};
 const source={name:'fixture.search',args:{query:'records',limit:3},observation:{ok:true,executionOk:true,repoCandidates:[{file:'actual-source.js'}]}};
 for(const repeatedAgain of [false,true]){
 const result=await runJarvisSemanticPlanner({input,catalog:[search,read],missionState:{phase:'COMPLETION_AUDIT',completedTasks:[source]},ai:{models:{generateContent:async request=>{
   if(request.config.semanticStage==='READ_ONLY_EVIDENCE_CONTINUATION'){continuations++;return{functionCalls:[{name:repeatedAgain?search.name:read.name,args:repeatedAgain?{limit:3,query:'records'}:{file:'actual-source.js'}}]};}
   if(request.config.semanticStage==='READ_ONLY_NEXT_STEP_RECOVERY'){
     assert.equal(request.config.tools,undefined);assert.match(JSON.stringify(request.config.chatMessages),/actual-source.js/);
     return{text:JSON.stringify({toolCalls:[{name:read.name,args:{file:'actual-source.js'}}]})};
   }
   return{text:JSON.stringify({explanation:'Falta leer una fuente ya localizada',completionAssessment:{objectives:[{objective:input,requiredEvidenceKind:'tool_result',satisfied:false,evidenceTaskIndexes:[],limitation:'La búsqueda no acredita datos actuales'}]},toolCalls:[{name:search.name,args:{limit:3,query:'records'}}]})};
 }}}});assert.equal(result.missionComplete,false);assert.equal(result.toolCalls.length,1);assert.equal(result.toolCalls[0].name,read.name);assert.equal(result.toolCalls[0].approved,false);
 }assert.equal(continuations,2);
});

test('repeated discovery recovery cannot execute a fabricated source or grant writes',async()=>{
 const input='Consulta la información actual',completed={name:'fixture.search',args:{query:'records'},observation:{ok:true,repoCandidates:[{file:'actual-source.js'}]}};
 const catalog=[{name:'fixture.search',investigationReadOnly:true,mutates:false,inputSchema:{query:'string'}},{name:'fixture.read',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_source'],inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},{name:'fixture.write',mutates:true,requiresApproval:true}];
 for(const badCall of [{name:'fixture.read',args:{file:'invented.js'}},{name:'fixture.write',args:{file:'actual-source.js'},approved:true}]){
 const result=await runJarvisSemanticPlanner({input,catalog,missionState:{phase:'COMPLETION_AUDIT',completedTasks:[completed]},ai:{models:{generateContent:async r=>{
 if(r.config.semanticStage==='READ_ONLY_EVIDENCE_CONTINUATION')return{functionCalls:[{name:'fixture.search',args:completed.args}]};
 if(r.config.semanticStage==='READ_ONLY_NEXT_STEP_RECOVERY')return{text:JSON.stringify({toolCalls:[badCall]})};
 return{text:JSON.stringify({explanation:'Información pendiente',completionAssessment:{objectives:[{objective:input,requiredEvidenceKind:'tool_result',satisfied:false,evidenceTaskIndexes:[],limitation:'Falta una lectura'}]},toolCalls:[]})};
 }}}});assert.equal(result.missionComplete,false);assert.equal(result.toolCalls.length,0);
 }
});


test('browser planning preserves investigation capabilities and their evidence prerequisites end to end',async()=>{
 const {__test:frontend}=await import('../gestia-core/jarvis/jarvis.multifunction.planner.js');
 const requirement={kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']};
 const tool={name:'fixture.queryCurrent',description:'Read live records after source discovery',mutates:false,requiresApproval:false,investigationReadOnly:true,evidenceKinds:['platform_records'],requiresEvidence:[requirement],inputSchema:{type:'object',properties:{sourceFile:{type:'string'}},required:['sourceFile']}};
 const normalized=frontend.runtimeCatalog({toolCatalog:[tool]});
 assert.equal(normalized[0].investigationReadOnly,true);assert.deepEqual(normalized[0].requiresEvidence,[requirement]);
 let calls=0;await buildJarvisMultifunctionToolCalls('Inspect the current records using fresh source evidence',{throwOnUnavailable:true,toolCatalog:[tool],missionState:{phase:'COMPLETION_AUDIT',completedTasks:[]},semanticPlanner:async({catalog})=>{calls++;assert.equal(catalog[0].investigationReadOnly,true);assert.deepEqual(catalog[0].requiresEvidence,[requirement]);return{ok:true,toolCalls:[],missionComplete:false,completionAssessment:{objectives:[{objective:'Read current records',satisfied:false,limitation:'Read the source first.',requiredEvidenceKind:'platform_records',evidenceTaskIndexes:[]}]}};}});
 assert.equal(calls,1);assert.equal(tool.mutates,false);
});

test('browser plan cache distinguishes changes to evidence contracts and argument schemas',async()=>{
 const {__test:frontend}=await import('../gestia-core/jarvis/jarvis.multifunction.planner.js');
 const base={name:'fixture.read',mutates:false,requiresApproval:false};const key=frontend.planCacheKey('read',[base],{});
 for(const change of [{investigationReadOnly:true},{requiresEvidence:[{kind:'source',argument:'sourceFile'}]},{inputSchema:{type:'object',required:['file']}},{evidenceKinds:['platform_records']}])assert.notEqual(frontend.planCacheKey('read',[{...base,...change}],{}),key);
});


test('read recovery obtains a discovered prerequisite instead of repeating discovery indefinitely',async()=>{
 const input='Find the current records using the application source';
 const catalog=[{name:'fixture.search',investigationReadOnly:true,mutates:false,inputSchema:{query:'string'}},{name:'fixture.readSource',investigationReadOnly:true,mutates:false,evidenceKinds:['source_schema'],inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},{name:'fixture.liveQuery',investigationReadOnly:true,mutates:false,evidenceKinds:['current_records'],requiresEvidence:[{kind:'source_schema',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'}},required:['sourceFile']}}];
 let recovered=false;
 const result=await runJarvisSemanticPlanner({input,catalog,missionState:{phase:'COMPLETION_AUDIT',completedTasks:[{name:'fixture.search',args:{query:'records'},observation:{ok:true,repoCandidates:[{file:'observed.js'}]}}]},ai:{models:{generateContent:async request=>{
 if(request.config.semanticStage==='READ_ONLY_EVIDENCE_CONTINUATION')return{text:'No new operation selected.'};
 if(request.config.semanticStage==='READ_ONLY_NEXT_STEP_RECOVERY'){recovered=true;const variants=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;assert.deepEqual(variants.map(v=>v.properties.name.enum[0]),['fixture.readSource']);assert.deepEqual(variants[0].properties.args.properties.file.enum,['observed.js']);return{text:JSON.stringify({toolCalls:[{name:'fixture.readSource',args:{file:'observed.js'}}]})};}
 return{text:JSON.stringify({explanation:'Current records require a source schema',completionAssessment:{objectives:[{objective:input,requiredEvidenceKind:'current_records',satisfied:false,evidenceTaskIndexes:[],limitation:'Read a discovered source first'}]},toolCalls:[]})};
 }}}});assert.equal(recovered,true);assert.equal(result.missionComplete,false);assert.equal(result.toolCalls[0].approved,false);assert.equal(result.toolCalls[0].name,'fixture.readSource');
});


test('platform collection destinations are extracted from real AST calls, never comments or filenames',async()=>{
 const {inspectSourceDataBindings}=await import('../gestia-core/repo/repo.source.structure.js');
 const source=`import {collection as records, doc} from 'firebase/firestore';
 // collection(db, 'not_real');
 const label = "collection(db, 'also_not_real')";
 const a=records(db, 'orders'); const b=doc(db,'profiles',uid); const c=db.collection('accounts');`;
 assert.deepEqual(inspectSourceDataBindings(source).collections,['orders','profiles','accounts']);
 const html='<div>collection(db,"not_code")</div><script type="module">const x=doc(db,"profiles",uid);</script>';
 assert.deepEqual(inspectSourceDataBindings(html).collections,['profiles']);
 assert.equal(inspectSourceDataBindings('not valid JavaScript {').complete,false);
});

test('a source read cannot authorize an invented collection even when the session could read it',async()=>{
 const f=platformQueryTestFixture();const result=await f.execute({...f.args,collection:'guessed_collection'},f.dependencies,f.context);
 assert.equal(result.ok,false);assert.equal(result.error.code,'PLATFORM_QUERY_COLLECTION_NOT_DISCOVERED');assert.equal(f.calls.length,0);assert.equal(result.recordEvidence,undefined);
});


test('AST source bindings survive execution and repeated planner compaction when code is shortened',async()=>{
 const {analyzeRepoSourceStructure}=await import('../gestia-core/repo/repo.source.structure.js');
 const {compactMissionPlannerObservation}=await import('../gestia-core/jarvis/jarvis.mission.planner-state.js');
 const content='// padding\n'.repeat(2000)+'\nconst source=collection(db,"actual_records");\n';
 const mission=await runJarvisMission({instruction:'Read the source',initialToolCalls:[{name:'fixture.read',args:{}}],requiredToolNames:['fixture.read'],executionContractLocked:true,toolCatalog:[{name:'fixture.read',mutates:false}],storage:{getItem:()=>null,setItem(){}},planner:async()=>({toolCalls:[],missionComplete:true}),execute:async()=>({ok:true,status:'FILE_READ',file:'source.js',content,numberedContent:content.split('\n').map((x,i)=>(i+1)+': '+x).join('\n'),sourceStructure:analyzeRepoSourceStructure(content)})});
 const evidence=compactMissionPlannerObservation(compactMissionPlannerObservation(mission.completedTasks[0].observation));
 assert.deepEqual(evidence.verifiedRead.sourceStructure.dataBindings.collections,['actual_records']);
 assert.equal(evidence.verifiedRead.contentTruncated,true);
 const source=readFileSync(new URL('../functions/jarvis-semantic-planner.js',import.meta.url),'utf8'),from=source.indexOf('function bindEvidencePrerequisites('),to=source.indexOf('function completionAuditSchema(',from);
 const bind=runInNewContext('('+source.slice(from,to).trim()+')',{structuredClone,buildNativeInputSchema:s=>s});
 const catalog=[{name:'fixture.read',evidenceKinds:['source']},{name:'fixture.query',requiresEvidence:[{kind:'source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{collection:{type:'string'}}}}];
 assert.deepEqual(Array.from(bind(catalog,[{name:'fixture.read',observation:evidence}])[1].inputSchema.properties.collection.enum),['actual_records']);
});

test('nested document identifiers and comments never become collection destinations',async()=>{
 const {inspectSourceDataBindings}=await import('../gestia-core/repo/repo.source.structure.js');
 assert.deepEqual(inspectSourceDataBindings('db.collection("records").doc("not_a_collection");').collections,['records']);
});


test('complete investigation arguments are not rewritten merely because source evidence exists',async()=>{
 const {shouldCompleteJarvisPlanningArguments:needs}=await import('../gestia-core/jarvis/jarvis.multifunction.planner.js');
 const tool={name:'fixture.records',investigationReadOnly:true,mutates:false,requiresApproval:false,userArtifact:false,inputSchema:{type:'object',properties:{collection:{type:'string'},sourceFile:{type:'string'}},required:['collection','sourceFile']}};
 const call={name:tool.name,args:{collection:'observed',sourceFile:'actual.js'}},tasks=[{name:'fixture.read',observation:{ok:true}}];
 assert.equal(needs(call,tool,tasks),false);
 assert.equal(needs({...call,deferred:true},tool,tasks),true);
 assert.equal(needs({...call,args:{collection:'observed'}},tool,tasks),true);
 assert.equal(needs(call,{...tool,mutates:true},tasks),true);
 assert.equal(needs(call,{...tool,userArtifact:true},tasks),true);
});


test('verified record answers have enough bounded output space while ordinary replies retain a small budget',async()=>{
 for(const withRecords of [false,true]){
 const operations=withRecords?[{name:'platform.query',observation:{ok:true,executionOk:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',scope:{collection:'fixture_accounts',fields:['title']},rows:Array.from({length:30},(_,i)=>({id:String(i),values:{title:'A verified record label '+i}})),returnedCount:30,hasMore:false,completeForQuery:true}}}]:[];
 await composeEvidenceGroundedConversation({instruction:'Enumera los registros observados.',evidenceItems:[...operations,{name:'mission.outcome',observation:{ok:true,status:'COMPLETED'}}],executeConversation:async(_input,options)=>{assert.ok(options.maxOutputTokens<=1200);assert.ok(options.maxOutputTokens>=256);if(withRecords)assert.ok(options.maxOutputTokens>256);else assert.equal(options.maxOutputTokens,256);return{ok:true,message:'Respuesta de prueba.'};}});
 }
});


test('completion follow-ups retain each tool schema and repair out-of-range arguments with the same model',async()=>{
 const input='Lee la siguiente página de registros';let attempts=0;
 const tool={name:'fixture.page',mutates:false,investigationReadOnly:true,inputSchema:{type:'object',properties:{pageSize:{type:'integer',minimum:1,maximum:100}},required:['pageSize'],additionalProperties:false}};
 const result=await runJarvisSemanticPlanner({input,catalog:[tool],missionState:{phase:'COMPLETION_AUDIT',completedTasks:[{name:tool.name,args:{pageSize:1},observation:{ok:true,executionOk:true,status:'PAGE_READ'}}]},ai:{models:{generateContent:async request=>{
 attempts++;const variants=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;
 assert.deepEqual(variants[0].properties.args,tool.inputSchema);assert.equal(variants[0].properties.name.enum[0],tool.name);
 if(attempts===2)assert.match(JSON.stringify(request.config.chatMessages),/SEMANTIC_TOOL_ARGUMENTS_INVALID/);
 return{text:JSON.stringify({explanation:'Falta consultar registros',completionAssessment:{objectives:[{objective:input,requiredEvidenceKind:'tool_result',satisfied:false,evidenceTaskIndexes:[],limitation:'Pendiente de ejecución'}]},toolCalls:[{name:tool.name,args:{pageSize:attempts===1?1000:50}}]})};
 }}}});assert.equal(attempts,2);assert.equal(result.toolCalls[0].args.pageSize,50);assert.equal(result.missionComplete,false);assert.equal(result.toolCalls[0].approved,false);
});

test('partial query errors preserve the observed cause instead of invented permission or empty-data explanations',async()=>{
 const result=await composeEvidenceGroundedConversation({instruction:'Consulta los registros',evidenceItems:[{name:'repo.read',observation:{ok:true,executionOk:true,status:'FILE_READ_OK',summary:'Fuente leída'}},{name:'platform.query',observation:{ok:false,executionOk:false,status:'PLATFORM_QUERY_FAILED',error:{code:'PLATFORM_QUERY_FIELDS_REQUIRED',message:'Missing requested fields'}}},{name:'mission.outcome',observation:{status:'PARTIAL',completionAssessment:{objectives:[{satisfied:false,limitation:'Perhaps permission or no data'}]}}}],executeConversation:async()=>{throw Error('NO_SPECULATIVE_PROSE_PASS');}});
 assert.match(result.text,/PLATFORM_QUERY_FIELDS_REQUIRED/);assert.doesNotMatch(result.text,/Perhaps permission|no data/);assert.equal(result.status,'CONVERSATIONAL_EVIDENCE_INSUFFICIENT');
});


test('source query excerpts retain observed fields beyond a long preamble with source line anchors',async()=>{
 const {analyzeRepoSourceStructure}=await import('../gestia-core/repo/repo.source.structure.js');
 const {compactMissionPlannerObservation}=await import('../gestia-core/jarvis/jarvis.mission.planner-state.js');
 const content='// preamble\n'.repeat(1500)+"const profile={classification:'member'};\nawait setDoc(doc(db,'accounts',uid),profile);\n";
 const sourceStructure=analyzeRepoSourceStructure(content),bindings=sourceStructure.dataBindings;
 assert.deepEqual(bindings.collections,['accounts']);assert.ok(bindings.references[0].startLine>1000);assert.match(bindings.references[0].content,/classification:'member'/);
 const compact=compactMissionPlannerObservation({ok:true,executionOk:true,status:'FILE_READ_OK',verifiedRead:{tool:'repo.read',file:'observed.js',content,startLine:1,endLine:1502,totalLines:1502,sourceStructure}});
 assert.ok(compact.verifiedRead.content.length<=3000);assert.equal(compact.verifiedRead.truncated,true);assert.match(compact.verifiedRead.sourceStructure.dataBindings.references[0].content,/classification:'member'/);
});


test('conditional query schemas bind every alternative to the observed collection without losing count mode',async()=>{
 const read={name:'fixture.readSource',mutates:false,investigationReadOnly:true,evidenceKinds:['source']};
 const query={name:'fixture.queryRecords',mutates:false,investigationReadOnly:true,requiresEvidence:[{kind:'source',argument:'collection',observationPath:['collections']}],inputSchema:{type:'object',properties:{collection:{type:'string'},mode:{type:'string'},fields:{type:'array',items:{type:'string'}}},required:['collection'],anyOf:[{properties:{mode:{enum:['count']}},required:['mode']},{properties:{mode:{enum:['query']}},required:['mode','fields']}]}};
 const input='Cuenta los registros observados';const result=await runJarvisSemanticPlanner({input,catalog:[read,query],missionState:{phase:'COMPLETION_AUDIT',completedTasks:[{name:read.name,args:{},observation:{ok:true,collections:['observed_records']}}]},ai:{models:{generateContent:async request=>{
 const q=request.config.responseJsonSchema.properties.toolCalls.items.anyOf.find(v=>v.properties.name.enum[0]===query.name);assert.ok(q);for(const branch of q.properties.args.anyOf)assert.deepEqual(branch.properties.collection.enum,['observed_records']);
 return{text:JSON.stringify({explanation:'Falta contar',completionAssessment:{objectives:[{objective:input,requiredEvidenceKind:'tool_result',satisfied:false,evidenceTaskIndexes:[],limitation:'Conteo pendiente'}]},toolCalls:[{name:query.name,args:{collection:'observed_records',mode:'count'}}]})};
 }}}});assert.equal(result.toolCalls[0].args.mode,'count');assert.equal(result.missionComplete,false);
});


test('native function schemas keep an object root for conditional record-query modes',()=>{
 const {buildGeminiModelTools}=createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');
 const schema={type:'object',properties:{collection:{type:'string'},mode:{type:'string'},fields:{type:'array',items:{type:'string'}}},required:['collection'],anyOf:[{properties:{mode:{enum:['count']}},required:['mode']},{properties:{mode:{enum:['query']}},required:['mode','fields']}]};
 const native=buildGeminiModelTools([{name:'fixture.query',inputSchema:schema}])[0].parametersJsonSchema;
 assert.equal(native.type,'object');assert.ok(native.properties);assert.equal(native.anyOf.length,2);assert.deepEqual(native.required,['collection','mode']);assert.ok(native.properties.mode.anyOf);assert.equal(native.additionalProperties,false);
});


test('source query references carry a uniquely observed data declaration rather than guessing its fields',async()=>{
 const {inspectSourceDataBindings}=await import('../gestia-core/repo/repo.source.structure.js');
 const source="const record={classification:'member',displayLabel:'example'};\n"+'// intervening code\n'.repeat(120)+"await setDoc(doc(db,'accounts',uid),record);\n";
 const bindings=inspectSourceDataBindings(source),declaration=bindings.references[0].declarations[0];
 assert.equal(declaration.name,'record');assert.equal(declaration.startLine,1);assert.match(declaration.content,/classification:'member'/);assert.equal(declaration.truncated,false);
 const ambiguous="function first(){const record={x:1};} function second(){const record={y:2};setDoc(doc(db,'accounts',uid),record);}";
 assert.equal(inspectSourceDataBindings(ambiguous).references[0].declarations.length,0);
});


test('a population mismatch obtains source evidence instead of executing a broad count as a subgroup',async()=>{
 const input='Count the registered members';let audits=0,checks=0;
 const query={name:'fixture.query',evidenceKinds:['platform_records'],mutates:false,investigationReadOnly:true,inputSchema:{type:'object',properties:{collection:{type:'string'},sourceFile:{type:'string'},filters:{type:'array',minItems:0}},required:['collection','sourceFile','filters']}};
 const search={name:'fixture.findSource',mutates:false,investigationReadOnly:true,inputSchema:{query:'string'}};
 const plan=await runJarvisSemanticPlanner({input,catalog:[query,search],missionState:{phase:'COMPLETION_AUDIT',completedTasks:[{name:'fixture.read',observation:{ok:true,verifiedRead:{file:'source.js',content:'const tableHasSeveralKinds=true;'}}}]},ai:{models:{generateContent:async request=>{
 if(request.config.semanticStage==='QUERY_POPULATION_VERIFICATION'){checks++;return{text:JSON.stringify({matchesRequest:false,limitation:'The table contains other kinds too',nextEvidenceQuery:'member classification field'})};}
 audits++;if(audits===2){assert.match(JSON.stringify(request.config.chatMessages),/SEMANTIC_QUERY_SCOPE_UNVERIFIED/);assert.ok(request.config.responseJsonSchema.properties.toolCalls.items.anyOf.every(v=>v.properties.name.enum[0]!==query.name));}
 return{text:JSON.stringify({explanation:'Still need data',completionAssessment:{objectives:[{objective:input,requiredEvidenceKind:'platform_records',satisfied:false,evidenceTaskIndexes:[],limitation:'Required population not yet observed'}]},toolCalls:[audits===1?{name:query.name,args:{collection:'accounts',sourceFile:'source.js',filters:[]}}:{name:search.name,args:{query:'member classification field'}}]})};
 }}}});assert.equal(checks,1);assert.equal(plan.missionComplete,false);assert.equal(plan.toolCalls[0].name,search.name);assert.equal(plan.toolCalls[0].approved,false);
});


test('a generic objective evidence label still permits reading a discovered source prerequisite',async()=>{
 const input='Find the current records using the application source';
 const catalog=[{name:'fixture.search',investigationReadOnly:true,mutates:false,inputSchema:{query:'string'}},{name:'fixture.readSource',investigationReadOnly:true,mutates:false,evidenceKinds:['source_schema'],inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},{name:'fixture.liveQuery',investigationReadOnly:true,mutates:false,evidenceKinds:['current_records'],requiresEvidence:[{kind:'source_schema',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'}},required:['sourceFile']}}];
 let recovered=false;
 const result=await runJarvisSemanticPlanner({input,catalog,missionState:{phase:'COMPLETION_AUDIT',completedTasks:[{name:'fixture.search',args:{query:'records'},observation:{ok:true,repoCandidates:[{file:'observed.js'}]}}]},ai:{models:{generateContent:async request=>{
 if(request.config.semanticStage==='READ_ONLY_EVIDENCE_CONTINUATION')return{text:'No new operation selected.'};
 if(request.config.semanticStage==='READ_ONLY_NEXT_STEP_RECOVERY'){recovered=true;const variants=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;assert.deepEqual(variants.map(v=>v.properties.name.enum[0]),['fixture.readSource']);assert.deepEqual(variants[0].properties.args.properties.file.enum,['observed.js']);return{text:JSON.stringify({toolCalls:[{name:'fixture.readSource',args:{file:'observed.js'}}]})};}
 return{text:JSON.stringify({explanation:'Current records require a source schema',completionAssessment:{objectives:[{objective:input,requiredEvidenceKind:'tool_result',satisfied:false,evidenceTaskIndexes:[],limitation:'Read a discovered source first'}]},toolCalls:[]})};
 }}}});assert.equal(recovered,true);assert.equal(result.missionComplete,false);assert.equal(result.toolCalls[0].approved,false);assert.equal(result.toolCalls[0].name,'fixture.readSource');
});


test('schema validation accepts optional empty arrays and still enforces explicit minimums', () => {
 const source=readFileSync(new URL('../functions/jarvis-semantic-planner.js',import.meta.url),'utf8');
 const from=source.indexOf('function schemaValueIsExecutable('),to=source.indexOf('// Native function parsers',from);
 assert.ok(from>0&&to>from);
 const executable=runInNewContext('('+source.slice(from,to).trim()+')');
 assert.equal(executable([],{type:'array'}),true);
 assert.equal(executable([],{type:'array',minItems:0}),true);
 assert.equal(executable([],{type:'array',minItems:1}),false);
 assert.equal(executable(['observed'],{type:'array',minItems:1,items:{type:'string'}}),true);
});

test('repo reads ignore an isolated line hint instead of collapsing source evidence to one line', () => {
 const source=readFileSync(new URL('../gestia-core/tools.runtime.js',import.meta.url),'utf8');
 const from=source.indexOf('const hasRequestedLineRange ='),to=source.indexOf('const requestedLineRange =',from);
 const block=source.slice(from,to);
 assert.match(block,/requestedStartLine\s*&&\s*requestedEndLine/);
 assert.doesNotMatch(block,/requestedStartLine\s*\|\|\s*requestedEndLine/);
});

test('repository discovery contract requires inspecting candidates before another semantic search', () => {
 const source=readFileSync(new URL('../gestia-core/tools.runtime.js',import.meta.url),'utf8');
 const match=source.match(/name: "repo\.search"[\s\S]{0,1400}?description: "([^"]+)"/);
 assert.ok(match);
 assert.match(match[1],/no encadenes otra búsqueda semántica/i);
 assert.match(match[1],/repo\.read|repo\.grep/);
});


test('repo grep matches survive mission compaction as grounded source locations', async () => {
 const {compactMissionPlannerObservation}=await import('../gestia-core/jarvis/jarvis.mission.planner-state.js');
 const result=compactMissionPlannerObservation({ok:true,executionOk:true,status:'COMPLETED',matches:[
  {file:'app-registro.js',line:318,snippet:'const rolFinal = esAdminB2B ? "admin_b2b" : "cliente";'}
 ]});
 assert.deepEqual(result.repositoryMatches,[{file:'app-registro.js',line:318,snippet:'const rolFinal = esAdminB2B ? "admin_b2b" : "cliente";'}]);
});


test('population verification rejects workflow state as membership evidence and keeps user vocabulary for recovery', () => {
 const source=readFileSync(new URL('../functions/jarvis-semantic-planner.js',import.meta.url),'utf8');
 assert.match(source,/Un estado KYC, validación, pantalla, flujo o función usada por ese grupo NO es por sí mismo el discriminador de pertenencia/);
 assert.match(source,/conserve literalmente el término principal usado por el usuario/);
});


test('population mismatch recovers through a literal user term and repo.grep, not another semantic search', async () => {
 const input='Cuántos clientes registrados tenemos en la plataforma?';
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{collection:{type:'string'},sourceFile:{type:'string'},filters:{type:'array',minItems:0,items:{type:'object'}}},required:['collection','sourceFile','filters'],additionalProperties:false}};
 const grep={name:'repo.grep',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{term:{type:'string'}},required:['term'],additionalProperties:false}};
 let stages=[];
 const result=await runJarvisSemanticPlanner({input,catalog:[query,grep],missionState:{phase:'COMPLETION_AUDIT',completedTasks:[{name:'repo.read',observation:{ok:true,executionOk:true,verifiedRead:{file:'source.js',content:'const kycState = true;'}}}]},ai:{models:{generateContent:async request=>{
   stages.push(request.config.semanticStage);
   if(request.config.semanticStage==='QUERY_POPULATION_VERIFICATION')return{text:JSON.stringify({matchesRequest:false,limitation:'KYC no demuestra pertenencia al grupo cliente',nextEvidenceQuery:'cliente rol'}),providerResponse:{finishReason:'stop'}};
   if(request.config.semanticStage==='QUERY_POPULATION_LITERAL_RECOVERY'){
     const allowed=request.config.responseJsonSchema.properties.term.enum;
     assert.ok(allowed.includes('clientes'));assert.ok(allowed.includes('cliente'));
     return{text:JSON.stringify({term:'cliente'}),providerResponse:{finishReason:'stop'}};
   }
   return{text:JSON.stringify({explanation:'Falta acreditar la población',completionAssessment:{objectives:[{objective:input,requiredEvidenceKind:'platform_records',satisfied:false,evidenceTaskIndexes:[],limitation:'Falta el discriminador observado'}]},toolCalls:[{name:'platform.query',args:{collection:'users',sourceFile:'source.js',filters:[{field:'kyc',op:'==',value:true}]}}]}),providerResponse:{finishReason:'stop'}};
 }}}});
 assert.equal(result.missionComplete,false);
 assert.equal(result.planKind,'QUERY_POPULATION_LITERAL_RECOVERY');
 assert.deepEqual(result.toolCalls,[{name:'repo.grep',args:{term:'cliente'},reason:'MODEL_LITERAL_SOURCE_RECOVERY',mutates:false,approved:false}]);
 assert.ok(stages.includes('QUERY_POPULATION_VERIFICATION'));
 assert.ok(stages.includes('QUERY_POPULATION_LITERAL_RECOVERY'));
});


test('record queries reject invented filter values before live execution and recover with literal source evidence', async () => {
 const input='Cuántos clientes registrados tenemos en la plataforma?';let populationChecks=0,literalRecoveries=0;
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{collection:{type:'string'},sourceFile:{type:'string'},filters:{type:'array',minItems:0,items:{type:'object'}},mode:{type:'string'}},required:['collection','sourceFile','filters','mode'],additionalProperties:false}};
 const grep={name:'repo.grep',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{term:{type:'string'}},required:['term'],additionalProperties:false}};
 const result=await runJarvisSemanticPlanner({input,catalog:[query,grep],missionState:{phase:'COMPLETION_AUDIT',completedTasks:[{name:'repo.read',observation:{ok:true,executionOk:true,verifiedRead:{file:'source.js',content:'const uid = user.uid; const profile = collection(db, "users");'}}}]},ai:{models:{generateContent:async request=>{
   if(request.config.semanticStage==='QUERY_POPULATION_VERIFICATION'){populationChecks++;throw Error('SHOULD_NOT_REACH_POPULATION_MODEL');}
   if(request.config.semanticStage==='QUERY_POPULATION_LITERAL_RECOVERY'){literalRecoveries++;return{text:JSON.stringify({term:'cliente'}),providerResponse:{finishReason:'stop'}};}
   return{text:JSON.stringify({explanation:'Falta evidencia',completionAssessment:{objectives:[{objective:input,requiredEvidenceKind:'platform_records',satisfied:false,evidenceTaskIndexes:[],limitation:'Falta filtro verificado'}]},toolCalls:[{name:'platform.query',args:{collection:'users',sourceFile:'source.js',mode:'count',filters:[{field:'uid',op:'==',value:'user123'}]}}]}),providerResponse:{finishReason:'stop'}};
 }}}});
 assert.equal(populationChecks,0);
 assert.equal(literalRecoveries,1);
 assert.equal(result.toolCalls[0].name,'repo.grep');
 assert.equal(result.toolCalls[0].args.term,'cliente');
});
