"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { runJarvisSemanticPlanner, normalizeCatalog } = require("../functions/jarvis-semantic-planner");

const conversation = { name: "conversation.respond", description: "Responde preguntas generales o explica limites de evidencia.", inputSchema: { prompt: "string" } };
const spreadsheet = { name: "spreadsheet.compose", description: "Compone un libro XLSX con hojas y formulas.", inputSchema: { instructions: "string" } };
const telemetry = { name: "system.observability", description: "Salud y telemetria; no inspeccion visual.", evidenceKinds: ["system_telemetry"], inputSchema: {} };
const visual = { name: "interface.review", description: "Inspeccion visual verificada de la interfaz indicada.", evidenceKinds: ["visual_inspection"], inputSchema: { url: "string" } };
const visualRequest = "que tal analizar el diseño grafico de nuestra plataforma y hacer un analisis";
const observedTelemetry = { name: telemetry.name, observation: { ok: true, status: "OK", summary: "Telemetria: 0 errores, latencia 20 ms." } };
const objective = (kind, satisfied = true, taskIndexes = [0]) => ({
    objective: "Revisar la plataforma", requiredEvidenceKind: kind, satisfied,
    evidenceTaskIndexes: taskIndexes, limitation: satisfied ? "" : "Falta inspeccion visual de la interfaz."
});
const audit = (payload, options = {}) => runJarvisSemanticPlanner({
    input: options.input || visualRequest,
    catalog: options.catalog || [telemetry, visual],
    missionState: { phase: "COMPLETION_AUDIT", completedTasks: options.completedTasks || [observedTelemetry] },
    retrieveToolCandidates: async () => options.candidates || [telemetry],
    ai: { lastProvider: "ollama-openai-compatible-local", models: { generateContent: async request => {
        options.inspect?.(request);
        return { text: JSON.stringify(payload), providerResponse: { finishReason: options.finishReason || "stop" } };
    } } }
});

test("conceptual requests can recover conversation after an operational gate and irrelevant retrieval", async () => {
    for (const input of ["quiero saber q es diseño grafico y q abarca", "Explícame qué significa identidad visual y cuáles son sus componentes"]) {
        let calls = 0;
        const result = await runJarvisSemanticPlanner({
            input, catalog: [conversation, spreadsheet, telemetry],
            missionState: { phase: "CURRENT_TURN", conversationalGate: true },
            retrieveToolCandidates: async () => [spreadsheet, conversation],
            ai: { lastProvider: "ollama-openai-compatible-local", models: { generateContent: async request => {
                if (++calls === 1) return { text: JSON.stringify({ mode: "tools", action: "explain visual communication concepts", missing: "", question: "" }) };
                const declarations = request.config.tools[0].functionDeclarations;
                const selected = declarations.find(tool => tool.description.startsWith("conversation.respond:"));
                assert.ok(selected, "retrieval must leave the same Qwen a conversational alternative");
                assert.equal(request.config.chatMessages.at(-1).content, input);
                return { functionCalls: [{ name: selected.name, args: { prompt: "El diseño gráfico comunica ideas mediante elementos visuales; abarca identidad, tipografía y composición." } }] };
            } } }
        });
        assert.equal(calls, 2);
        assert.deepEqual(result.toolCalls.map(call => call.name), ["conversation.respond"]);
        assert.equal(result.missionComplete, false);
    }
});

test("an empty retrieval still permits a model-authored evidence limitation", async () => {
    let calls = 0;
    const result = await runJarvisSemanticPlanner({
        input: visualRequest, catalog: [conversation, spreadsheet, telemetry],
        missionState: { phase: "CURRENT_TURN", conversationalGate: true }, retrieveToolCandidates: async () => [],
        ai: { models: { generateContent: async request => {
            if (++calls === 1) return { text: '{"mode":"tools","action":"inspect platform visual design"}' };
            assert.match(request.config.tools[0].functionDeclarations[0].description, /^conversation.respond:/);
            return { functionCalls: [{ name: "jarvis_tool_0", args: { prompt: "Necesito evidencia de la interfaz para analizar su diseño." } }] };
        } } }
    });
    assert.equal(result.toolCalls[0].name, "conversation.respond");
});

test("telemetry success alone cannot close a visual mission with an unsubstantiated completion flag", async () => {
    await assert.rejects(audit({ toolCalls: [], missionComplete: true, completionAssessment: { missing: [] } }), /SEMANTIC_COMPLETION_EVIDENCE_REQUIRED/);
});

test("a semantic visual requirement cannot cite telemetry as visual evidence", async () => {
    await assert.rejects(audit({ toolCalls: [], missionComplete: true, completionAssessment: { objectives: [objective("visual_inspection")] } }), /SEMANTIC_COMPLETION_EVIDENCE_KIND_MISMATCH/);
});

test("adding a follow-up cannot bypass a contradictory evidence assessment", async () => {
    await assert.rejects(audit({
        toolCalls: [{ name: visual.name, args: { url: "https://invented.test" } }], missionComplete: false,
        completionAssessment: { objectives: [{ ...objective("visual_inspection"), limitation: "No se inspecciono la interfaz." }] }
    }), /SEMANTIC_COMPLETION_EVIDENCE_REQUIRED/);
});

test("insufficient visual evidence returns an incomplete assessment without inventing a next tool", async () => {
    const result = await audit({ toolCalls: [], missionComplete: false, completionAssessment: { objectives: [objective("visual_inspection", false, [])] } });
    assert.equal(result.missionComplete, false);
    assert.deepEqual(result.toolCalls, []);
    assert.match(result.completionAssessment.objectives[0].limitation, /Falta inspeccion visual/);
});

test("completion retains the full catalog for evidence acquisition even when retrieval returns only telemetry", async () => {
    const result = await audit({ toolCalls: [{ name: visual.name, args: { url: "https://platform.test" } }], missionComplete: false }, {
        inspect: request => {
            assert.ok(JSON.stringify(request.config.responseJsonSchema).includes(visual.name));
            assert.equal(request.config.chatMessages.at(-1).content, visualRequest, "audit the original objective, not the phase instruction");
        }
    });
    assert.equal(result.toolCalls[0].name, visual.name);
    assert.equal(result.missionComplete, false);
});

test("scoped evidence supports the corresponding objective without banning observability", async () => {
    for (const [tool, kind, input] of [[telemetry, "system_telemetry", "Revisa la salud del sistema"], [visual, "visual_inspection", visualRequest]]) {
        const result = await audit({ toolCalls: [], missionComplete: true, completionAssessment: { objectives: [objective(kind)] } }, {
            input, completedTasks: [{ name: tool.name, observation: { ok: true, summary: "Observacion comprobada de la herramienta." } }]
        });
        assert.equal(result.missionComplete, true);
    }
});

test("completion evidence fails closed for invalid references, failed observations and truncation", async () => {
    const complete = { toolCalls: [], missionComplete: true, completionAssessment: { objectives: [objective("system_telemetry")] } };
    for (const options of [
        { completedTasks: [] },
        { completedTasks: [{ name: telemetry.name, observation: { ok: false, summary: "No disponible" } }] },
        { completedTasks: [{ name: telemetry.name, observation: { ok: true, executionOk: false, summary: "Falló" } }] },
        { finishReason: "length" }
    ]) await assert.rejects(audit(complete, options), /SEMANTIC_COMPLETION_(EVIDENCE|AUDIT)/);
});

test("canonical catalog preserves evidence kinds independently of retrieval metadata", () => {
    assert.deepEqual(normalizeCatalog([telemetry])[0].evidenceKinds, ["system_telemetry"]);
});

test("a completion audit retains bounded conversational distinctions without treating them as evidence", async () => {
    const input = "Review the requested population";
    const distinction = "Declared preferences and official allocations are separate populations.";
    let messages;
    const result = await runJarvisSemanticPlanner({input,catalog:[telemetry],
        missionState:{phase:"COMPLETION_AUDIT",completedTasks:[observedTelemetry],
            advisorySemanticContext:{turns:[{role:"user",content:distinction},{role:"user",content:input}],
                historicalMissions:[{finalText:"OLD_RESULT_MUST_NOT_BECOME_EVIDENCE"}]}},
        ai:{models:{generateContent:async request=>{
            messages=request.config.chatMessages;
            return {text:JSON.stringify({toolCalls:[],completionAssessment:{objectives:[objective("platform_records",false,[])]}})};
        }}}
    });
    const advisory=messages.find(message=>message.content.startsWith("CONVERSATION_CONTEXT_FOR_REFERENCE_ONLY="));
    assert.ok(advisory.content.includes(distinction));
    assert.match(advisory.content,/never as evidence/);
    assert.ok(!JSON.stringify(messages).includes("OLD_RESULT_MUST_NOT_BECOME_EVIDENCE"));
    assert.equal(messages.at(-1).content,input);
    assert.equal(result.missionComplete,false);
    assert.deepEqual(result.completionAssessment.objectives[0].evidenceTaskIndexes,[]);
});

test("query scope review retains accredited fields and successful sources for the same collection", async () => {
    const reader={name:"repo.read",evidenceKinds:["repository_source"],investigationReadOnly:true,mutates:false,inputSchema:{file:"string"}};
    const query={name:"platform.query",evidenceKinds:["platform_records"],investigationReadOnly:true,mutates:false,inputSchema:{type:"object",properties:{sourceFile:{type:"string"},collection:{type:"string"},mode:{type:"string"},fields:{type:"array",items:{type:"string"}},filters:{type:"array",items:{type:"object"}}},required:["sourceFile","collection","mode","fields","filters"]}};
    const source=(file,collection,field,extra={})=>({name:reader.name,args:{file},observation:{ok:true,...extra,verifiedRead:{file,content:"observed collection access",sourceStructure:{dataBindings:{source:"ACORN_SOURCE_REFERENCES",collections:[collection],fieldPaths:[field],references:[{startLine:1,content:"observed reference"}]}}}}});
    const contract={objective:"Inspect current states",requiredEvidenceKind:"platform_records",coverageMode:"temporal",scope:"explicit_scope",groups:["states"]};
    let reviewed=false;
    const result=await runJarvisSemanticPlanner({input:contract.objective,catalog:[reader,query],
        missionState:{phase:"COMPLETION_AUDIT",evidenceObjectives:[contract],advisorySemanticContext:{turns:[{role:"user",content:"Declared and official states are distinct."}]},completedTasks:[source("primary.js","alpha","state"),source("supplement.js","alpha","state.expiresAt"),source("unrelated.js","beta","foreign"),source("failed.js","alpha","untrusted",{executionOk:false})]},
        ai:{models:{generateContent:async request=>{
            if(request.config.semanticStage==="QUERY_POPULATION_VERIFICATION"){
                const payload=JSON.parse(request.config.chatMessages.at(-1).content);
                assert.deepEqual(payload.observedFieldSchemas.map(item=>item.file),["primary.js","supplement.js"]);
                assert.ok(payload.observedFieldSchemas.some(item=>item.fieldPaths.includes("state.expiresAt")));
                assert.deepEqual(payload.objectives,[contract]);
                assert.ok(request.config.chatMessages.some(message=>message.content.includes("Declared and official states are distinct.")));
                reviewed=true;
                return{text:'{"matchesRequest":true}'};
            }
            assert.equal(request.config.semanticStage,"COMPLETION_AUDIT");
            return{text:JSON.stringify({completionAssessment:{objectives:[{...contract,satisfied:false,evidenceTaskIndexes:[],limitation:"Operational values remain unread."}]},toolCalls:[{name:query.name,args:{sourceFile:"primary.js",collection:"alpha",mode:"query",fields:["state.expiresAt"],filters:[]}}]})};
        }}}
    });
    assert.equal(reviewed,true);
    assert.equal(result.toolCalls[0].name,query.name);
    assert.equal(result.missionComplete,false);
});

test("a locked telemetry contract must reach semantic audit and preserve its insufficient-evidence verdict", async () => {
    const { runJarvisMission } = await import("../gestia-core/jarvis/jarvis.mission.orchestrator.js");
    let auditCalls = 0;
    const mission = await runJarvisMission({
        instruction: visualRequest, initialToolCalls: [{ name: telemetry.name, args: {} }],
        requiredToolNames: [telemetry.name], executionContractLocked: true, toolCatalog: [telemetry],
        planner: async ({ mission }) => {
            auditCalls++;
            return audit({ toolCalls: [], missionComplete: false, completionAssessment: { objectives: [objective("visual_inspection", false, [])] } }, { completedTasks: mission.completedTasks });
        },
        execute: async () => observedTelemetry.observation,
        storage: { getItem: () => null, setItem() {} }
    });
    assert.equal(auditCalls, 1);
    assert.equal(mission.status, "PARTIAL");
    assert.equal(mission.completionAssessment.objectives[0].satisfied, false);
});

test("an explicit insufficient-evidence verdict cannot be overridden by completed tool names", async () => {
    const { runJarvisMission } = await import("../gestia-core/jarvis/jarvis.mission.orchestrator.js");
    const mission = await runJarvisMission({
        instruction: visualRequest, initialToolCalls: [{ name: telemetry.name, args: {} }], requiredToolNames: [telemetry.name],
        planner: async () => ({ toolCalls: [], missionComplete: false, completionAssessment: { objectives: [objective("visual_inspection", false, [])] } }), execute: async () => observedTelemetry.observation,
        storage: { getItem: () => null, setItem() {} }
    });
    assert.equal(mission.status, "PARTIAL");
});

test("final composition renders the missing evidence verdict without allowing a success rewrite", async () => {
    const { composeEvidenceGroundedConversation } = await import("../gestia-core/jarvis/jarvis.conversation.composer.js");
    const result = await composeEvidenceGroundedConversation({
        instruction: visualRequest,
        evidenceItems: [{ name: "mission.outcome", observation: { status: "PARTIAL", completionAssessment: { objectives: [objective("visual_inspection", false, [])] } } }, observedTelemetry],
        executeConversation: async () => ({ ok: true, message: "El analisis de diseño fue exitoso y no hay fallos." })
    });
    assert.equal(result.ok, true);
    assert.match(result.text, /Falta inspeccion visual/);
    assert.doesNotMatch(result.text, /exitoso|no hay fallos/);
});

test("an invalid scoped audit cannot escape into a success claim during final composition", async () => {
    const { runJarvisMission } = await import("../gestia-core/jarvis/jarvis.mission.orchestrator.js");
    const { composeEvidenceGroundedConversation } = await import("../gestia-core/jarvis/jarvis.conversation.composer.js");
    const mission = await runJarvisMission({
        instruction: visualRequest, initialToolCalls: [{ name: telemetry.name, args: {} }],
        requiredToolNames: [telemetry.name], executionContractLocked: true, toolCatalog: [telemetry],
        planner: async () => audit({ toolCalls: [], missionComplete: true }),
        execute: async () => observedTelemetry.observation,
        storage: { getItem: () => null, setItem() {} }
    });
    assert.equal(mission.status, "PARTIAL");
    const result = await composeEvidenceGroundedConversation({
        instruction: visualRequest,
        evidenceItems: [{ name: "mission.outcome", observation: mission }, ...mission.completedTasks],
        executeConversation: async () => assert.fail("invalid proof must not be rewritten as success")
    });
    assert.equal(result.ok, true);
    assert.match(result.text, /análisis no está acreditado/);
});

test("scoped telemetry cannot reconcile a deadline as completion before its audit", async t => {
    const { runJarvisMission } = await import("../gestia-core/jarvis/jarvis.mission.orchestrator.js");
    let clock = Date.now();
    t.mock.method(Date, "now", () => clock);
    const mission = await runJarvisMission({
        instruction: visualRequest, initialToolCalls: [{ name: telemetry.name, args: {} }],
        requiredToolNames: [telemetry.name], executionContractLocked: true, toolCatalog: [telemetry],
        noDeadline: false, timeoutMs: 100,
        planner: async () => assert.fail("deadline has expired"),
        execute: async () => { clock += 200; return observedTelemetry.observation; },
        storage: { getItem: () => null, setItem() {} }
    });
    assert.equal(mission.status, "PARTIAL");
    assert.equal(mission.reason, "DEADLINE_EXCEEDED");
});

test("registered evidence scopes survive client planning and do not make a capture an inspection", async () => {
    const { registerJarvisActuatorTools } = await import("../gestia-core/jarvis/jarvis.actuator.pack.js");
    const { buildJarvisMultifunctionToolCalls } = await import("../gestia-core/jarvis/jarvis.multifunction.planner.js");
    const registry = new Map();
    registerJarvisActuatorTools({ register(tool) { registry.set(tool.name, tool); return tool; } });
    assert.deepEqual(registry.get(telemetry.name).evidenceKinds, ["system_telemetry"]);
    assert.deepEqual(registry.get("browser.inspect").evidenceKinds, ["interface_structure", "interface_styles", "responsive_layout"]);
    assert.deepEqual(registry.get("browser.screenshot").evidenceKinds, ["visual_capture"]);
    await buildJarvisMultifunctionToolCalls(visualRequest, {
        toolCatalog: [registry.get(telemetry.name)], missionState: { phase: "COMPLETION_AUDIT" },
        semanticPlanner: async ({ catalog }) => {
            assert.deepEqual(catalog[0].evidenceKinds, ["system_telemetry"]);
            return { ok: true, toolCalls: [], missionComplete: false, completionAssessment: { objectives: [objective("visual_inspection", false, [])] } };
        }
    });
});
