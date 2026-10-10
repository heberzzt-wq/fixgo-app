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

test("new records trigger independent objective review even when the initial audit repeats a stale deficit", async () => {
    const records={name:"fixture.records",evidenceKinds:["platform_records"],investigationReadOnly:true,mutates:false,inputSchema:{}};
    const code={name:"fixture.code",evidenceKinds:["repository_source"],investigationReadOnly:true,mutates:false,inputSchema:{}};
    const contract={objective:"Identify allocations",requestQuote:"Identify allocations",requiredEvidenceKind:"platform_records",coverageMode:"relationship",scope:"explicit_scope",groups:["entities"]};
    const evidence={source:"FIRESTORE_SERVER_AUTHENTICATED",readOnly:true,scope:{collection:"allocations",fields:["entity","owner"],filters:[]},rows:[{id:"a",values:{entity:"Observed asset",owner:"Observed owner"}}],totalCount:1,completeForQuery:true};
    for(const citation of [1,0]) {
        let reviews=0,continuations=0;
        const result=await runJarvisSemanticPlanner({input:contract.objective,catalog:[records,code],missionState:{phase:"COMPLETION_AUDIT",evidenceObjectives:[contract],completedTasks:[{name:code.name,observation:{ok:true,recordEvidence:evidence}},{name:records.name,observation:{ok:true,recordEvidence:evidence}}]},ai:{models:{generateContent:async request=>{
            if(request.config.semanticStage==="COMPLETION_AUDIT")return{text:JSON.stringify({toolCalls:[],completionAssessment:{objectives:[{...contract,satisfied:false,evidenceTaskIndexes:[],limitation:"The records have not yet been read."}]}})};
            if(request.config.semanticStage==="RECORD_OBJECTIVE_COVERAGE") {
                reviews++;
                const payload=JSON.parse(request.config.chatMessages.at(-1).content);
                assert.equal(payload.objective.limitation,undefined,"the independent review must not inherit the stale diagnosis");
                assert.deepEqual(payload.evidence.map(task=>task.taskIndex),[0,1],"citations must retain explicit original task indexes, including source reads");
                return{text:JSON.stringify({proven:true,missing:[],groups:[{group:"entities",proven:true,evidence:[{taskIndex:citation,fields:["entity","owner"]}]}],sources:[{collection:"allocations",relevant:true,reason:"Observed relationship. ".repeat(1000),taskIndexes:[citation]}]})};
            }
            if(request.config.semanticStage==="READ_ONLY_EVIDENCE_CONTINUATION") {
                continuations++;
                const message=request.config.chatMessages.find(item=>item.content.startsWith("OBJETIVOS_PENDIENTES="));
                assert.ok(message.content.length<2000,"continuation must not duplicate full coverage reports");
                const pending=JSON.parse(message.content.split("=").slice(1).join("="))[0];
                assert.equal(pending.objective,contract.objective);
                assert.equal(pending.requiredEvidenceKind,"platform_records");
                assert.equal(pending.satisfied,false);
                assert.equal(pending.coverageProof,undefined);
            }
            return{text:'{"toolCalls":[]}'};
        }}}});
        assert.equal(reviews,1);
        assert.equal(continuations,citation===1?0:1);
        assert.equal(result.missionComplete,citation===1);
        assert.equal(result.completionAssessment.objectives[0].satisfied,citation===1);
        assert.deepEqual(result.completionAssessment.objectives[0].evidenceTaskIndexes,citation===1?[1]:[]);
    }
});

test("coverage reviews receive one objective at a time and cite only observed source paths", async () => {
    const tool={name:"fixture.records",investigationReadOnly:true,mutates:false,evidenceKinds:["platform_records"],inputSchema:{}};
    const objectives=[{objective:"Identify allocations",requestQuote:"Identify allocations",coverageMode:"relationship",groups:["entities"]},{objective:"Report renewal dates",requestQuote:"Report renewal dates",coverageMode:"temporal",groups:["dates"]}].map(o=>({...o,requiredEvidenceKind:"platform_records",scope:"explicit_scope"}));
    const reviewed=[];
    const result=await runJarvisSemanticPlanner({input:"Identify allocations and report renewal dates",catalog:[tool],missionState:{phase:"COMPLETION_AUDIT",evidenceObjectives:objectives,completedTasks:[{name:tool.name,observation:{ok:true,recordEvidence:{source:"FIRESTORE_SERVER_AUTHENTICATED",readOnly:true,scope:{collection:"registered_entries",fields:["owner"]},rows:[{id:"a",values:{owner:"Observed owner"}}],totalCount:1,completeForQuery:true}}}]},ai:{models:{generateContent:async request=>{
        if(request.config.semanticStage==="COMPLETION_AUDIT")return{text:JSON.stringify({toolCalls:[],completionAssessment:{objectives:objectives.map(o=>({...o,satisfied:false,evidenceTaskIndexes:[],limitation:"Needs evaluation"}))}})};
        if(request.config.semanticStage==="RECORD_OBJECTIVE_COVERAGE") {
            const payload=JSON.parse(request.config.chatMessages.at(-1).content),isAllocation=payload.contract.coverageMode==="relationship";
            assert.equal(payload.request,payload.contract.requestQuote);
            assert.equal(request.contents,payload.contract.requestQuote);
            assert.deepEqual(request.config.responseJsonSchema.properties.sources.items.properties.collection.enum,["registered_entries"]);
            assert.deepEqual(request.config.responseJsonSchema.properties.groups.items.properties.evidence.items.properties.taskIndex.enum,[0]);
            reviewed.push(payload.request);
            return{text:JSON.stringify({proven:isAllocation,missing:isAllocation?[]:["Renewal dates are not present"],groups:[{group:payload.contract.groups[0],proven:isAllocation,evidence:isAllocation?[{taskIndex:0,fields:["owner"]}]:[]}],sources:[{collection:"registered_entries",relevant:true,reason:"Observed values",taskIndexes:[0]}]})};
        }
        return{text:'{"toolCalls":[]}'};
    }}}});
    assert.deepEqual(reviewed,objectives.map(o=>o.requestQuote));
    assert.deepEqual(result.completionAssessment.objectives.map(o=>o.satisfied),[true,false]);
    assert.equal(result.missionComplete,false);
});

test("an observed partial source remains available for a new range when recovery has no unread files", async () => {
    const reader={name:"repo.read",evidenceKinds:["repository_source"],investigationReadOnly:true,mutates:false,inputSchema:{type:"object",properties:{file:{type:"string"},startLine:{type:"integer"},endLine:{type:"integer"}},required:["file"]}};
    let recovered=false;
    const result=await runJarvisSemanticPlanner({input:"Inspect the stored relationship",catalog:[reader],missionState:{phase:"COMPLETION_AUDIT",completedTasks:[{name:reader.name,args:{file:"observed.js"},observation:{ok:true,verifiedRead:{file:"observed.js",content:"Source header",startLine:1,endLine:5,totalLines:80,partial:true,sourceStructure:{dataBindings:{writeShapes:[{collection:"entries",startLine:40,fields:["owner"]}]}}}}}]},ai:{models:{generateContent:async request=>{
        if(request.config.semanticStage==="COMPLETION_AUDIT")return{text:JSON.stringify({toolCalls:[],completionAssessment:{objectives:[{objective:"Inspect the stored relationship",requiredEvidenceKind:"repository_source",satisfied:false,evidenceTaskIndexes:[],limitation:"The field definition is outside the observed excerpt."}]}})};
        if(request.config.semanticStage==="READ_ONLY_EVIDENCE_CONTINUATION")return{text:'{"toolCalls":[]}'};
        assert.equal(request.config.semanticStage,"READ_ONLY_NEXT_STEP_RECOVERY");
        const schema=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;
        assert.ok(schema.some(branch=>branch.properties.args.properties.file.enum.includes("observed.js")));
        const partial=request.config.chatMessages.find(message=>message.content.startsWith("LECTURAS_PARCIALES="));
        assert.match(partial.content,/"startLine":40/);
        assert.match(partial.content,/"nextStartLine":6/);
        recovered=true;
        return{text:JSON.stringify({toolCalls:[{name:reader.name,args:{file:"observed.js",startLine:40,endLine:60}}]})};
    }}}});
    assert.equal(recovered,true);
    assert.equal(result.missionComplete,false);
    assert.equal(result.toolCalls[0].args.startLine,40);
});

test("partial source recovery accumulates observed ranges and rejects a still-visible repeated range", async () => {
    const reader={name:"repo.read",evidenceKinds:["repository_source"],investigationReadOnly:true,mutates:false,inputSchema:{type:"object",properties:{file:{type:"string"},startLine:{type:"integer"},endLine:{type:"integer"}},required:["file"]}};
    const completedTasks=[[1,10,10],[35,40,40],[11,20,30]].map(([startLine,endLine,requestedEnd])=>({name:reader.name,args:{file:"observed.js",startLine,endLine:requestedEnd},observation:{ok:true,verifiedRead:{file:"observed.js",content:Array(endLine-startLine+1).fill("observed line").join("\n"),startLine,endLine,totalLines:80,partial:true,sourceStructure:{dataBindings:{writeShapes:[{collection:"entries",startLine:15,fields:["owner"]},{collection:"entries",startLine:45,fields:["renewal"]}]}}}}}));
    let recovered=false;
    const result=await runJarvisSemanticPlanner({input:"Inspect the remaining source evidence",catalog:[reader],missionState:{phase:"COMPLETION_AUDIT",completedTasks},ai:{models:{generateContent:async request=>{
        if(request.config.semanticStage==="COMPLETION_AUDIT")return{text:JSON.stringify({toolCalls:[{name:reader.name,args:{file:"observed.js",startLine:11,endLine:20}}],completionAssessment:{objectives:[{objective:"Inspect the remaining source evidence",requiredEvidenceKind:"repository_source",satisfied:false,evidenceTaskIndexes:[],limitation:"More evidence required"}]}})};
        if(request.config.semanticStage==="READ_ONLY_EVIDENCE_CONTINUATION")return{text:'{"toolCalls":[]}'};
        assert.equal(request.config.semanticStage,"READ_ONLY_NEXT_STEP_RECOVERY");
        const message=request.config.chatMessages.find(item=>item.content.startsWith("LECTURAS_PARCIALES="));
        const progress=JSON.parse(message.content.split("\n")[0].slice("LECTURAS_PARCIALES=".length));
        assert.equal(progress.length,1);
        assert.deepEqual(progress[0].observedRanges,[[1,20],[35,40]]);
        assert.deepEqual(progress[0].unreadRanges,[[21,34],[41,80]]);
        assert.equal(progress[0].nextStartLine,21);
        assert.equal(progress[0].schemaAnchors.find(a=>a.startLine===15).observed,true);
        assert.equal(progress[0].schemaAnchors.find(a=>a.startLine===45).observed,false);
        recovered=true;
        return{text:JSON.stringify({toolCalls:[{name:reader.name,args:{file:"observed.js",startLine:21,endLine:34}}]})};
    }}}});
    assert.equal(recovered,true);
    assert.equal(result.missionComplete,false);
    assert.equal(result.toolCalls[0].args.startLine,21);
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
