import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelfHostedSemanticEngine } from '../jarvis-fs-bridge.js';
import { registerJarvisMultifunctionTools } from '../gestia-core/jarvis/jarvis.multitool.pack.js';
import { createRequire } from 'node:module';
const { runJarvisSemanticPlanner, validatePlan } = createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');
import { runJarvisMission } from '../gestia-core/jarvis/jarvis.mission.orchestrator.js';
import { completeJarvisPlanningArguments } from '../gestia-core/jarvis/jarvis.multifunction.planner.js';
import { runResilientLocalWebResearch } from '../jarvis-upload-bridge.js';
import { documentEvidenceEnvelope } from '../gestia-core/jarvis/jarvis.document.context.js';
import { marketingArtifactArgsFromCompletedTasks } from '../gestia-core/jarvis/jarvis.marketing.presenter.js';
import { registerJarvisActuatorTools } from '../gestia-core/jarvis/jarvis.actuator.pack.js';

test('oversized research observations retain an attributed excerpt instead of discarding all facts',()=>{
    const evidence=[{tool:'web.research',status:'GROUNDED',summary:'La fuente describe servicios fiscales.',validSources:[{url:'https://example.com/'}],evidence:Object.fromEntries(Array.from({length:150},(_,i)=>['metadata'+i,'value']))}];
    const envelope=JSON.parse(documentEvidenceEnvelope(evidence,2500));
    assert.equal(envelope.coverage,'PARTIAL');
    assert.match(envelope.excerpts[0].summary,/servicios fiscales/);
    assert.equal(envelope.excerpts[0].sources[0].url,'https://example.com/');
    assert.equal(envelope.excerpts[0].verifiedRead,null);
});

test('grounded completion converts legacy input hints to a native JSON schema',async()=>{
    const catalog=[{name:'document.create',description:'Write a file',inputSchema:{format:'pdf|html',content:'string'}}];
    const ai={models:{generateContent:async request=>{
        const schema=request.config.responseJsonSchema.properties.toolCalls.items.properties.args;
        assert.equal(schema.type,'object');
        assert.equal(schema.properties.format.type,'string');
        return {text:JSON.stringify({toolCalls:[{name:'document.create',args:{format:'pdf',content:'Proposal'}}]})};
    }}};
    await runJarvisSemanticPlanner({ai,input:'Write the completed proposal.',catalog,missionState:{phase:'GROUNDED_ARGUMENT_COMPLETION'}});
});

test('deferred document arguments bind the completed marketing content before writing',()=>{
    const tasks=[{name:'marketing.plan',observation:{status:'MARKETING_PACKAGE_READY',objectiveSatisfied:true,planReady:true,userVisible:'# Plan completo',requiredArtifacts:[{id:'plan',toolName:'document.create',type:'document',format:'pdf'}]}}];
    const result=marketingArtifactArgsFromCompletedTasks(tasks,{marketingRequirementId:'plan',contentSource:'marketing.plan',content:'Original user instruction'});
    assert.equal(result.content,'# Plan completo');
    assert.equal(result.format,'pdf');
});

test('local mission contract retrieves semantic operations without lexical catalog pruning', async () => {
    const catalog = [
        ...Array.from({length: 12}, (_, i) => ({name: `repo.marketing${i}`, description: 'Inspecciona archivos de marketing en el repositorio', inputSchema: {file:'string'}})),
        {name:'web.research', description:'Consulta fuentes públicas en Internet', inputSchema:{query:'string'}},
        {name:'document.create', description:'Escribe un archivo descargable PDF', inputSchema:{content:'string'}}
    ];
    const retrieved = [];
    const ai = {lastProvider:'ollama-openai-compatible-local',models:{generateContent:async request=>{
        if(request.config.semanticStage==='MISSION_CONTRACT_OPERATIONS') return {text:JSON.stringify({sourceReview:'research external website',work:'',delivery:'create downloadable document'})};
        const task = JSON.parse(request.config.chatMessages.at(-1).content);
        const expected = task.operation === 'research external website' ? 'web.research' : 'document.create';
        assert.deepEqual(task.catalog.map(t=>t.name), [expected], 'each operation receives its own retrieved candidates');
        assert.equal(request.config.tools,undefined);
        return {text:JSON.stringify({name:expected})};
    }}};
    const result = await runJarvisSemanticPlanner({ai,input:'Marketing para https://example.com con archivos descargables',catalog,missionState:{phase:'MISSION_CONTRACT',existingInitialTools:['repo.marketing0']},retrieveToolCandidates:async (operation,limit)=>{assert.equal(limit,12,'retain a wider semantic shortlist for required capabilities');retrieved.push(operation);return [catalog[operation.startsWith('research')?12:13]];}});
    assert.deepEqual(retrieved,['research external website','create downloadable document']);
    assert.deepEqual(result.toolCalls.map(t=>t.name), ['web.research','document.create']);
    assert.ok(result.toolCalls.every(t=>t.deferred===true));
    assert.ok(result.toolCalls.every(t=>Object.keys(t.args).length===0));
});

test('external URLs cannot be accepted as repository file paths',()=>{
    const catalog=[{name:'repo.read',inputSchema:{file:'string'},mutates:false}];
    const result=validatePlan({toolCalls:[{name:'repo.read',args:{file:'https://example.com/invented'}}]},catalog,'Consulta https://example.com/');
    assert.equal(result.toolCalls.length,0);
    assert.equal(validatePlan({toolCalls:[{name:'repo.read',args:{file:'src/index.js'}}]},catalog).toolCalls.length,1);
});

test('project review preserves ordered inventory and source-reading operations', async () => {
    const catalog = [{name:'repo.audit',description:'Inventario real',inputSchema:{type:'object',properties:{}}}, {name:'repo.read',description:'Leer archivo localizado',inputSchema:{file:'string'}}];
    const operations = ['inventariar el repositorio real','leer los archivos localizados'];
    const seen = [];
    const ai = {lastProvider:'ollama-openai-compatible-local',models:{generateContent:async request => {
        if(request.config.semanticStage==='MISSION_CONTRACT_OPERATIONS') return {text:JSON.stringify({sourceReview:operations,work:'',verification:'',delivery:''})};
        const task = JSON.parse(request.config.chatMessages.at(-1).content);
        return {text:JSON.stringify({name:task.operation===operations[0]?'repo.audit':'repo.read'})};
    }}};
    const result = await runJarvisSemanticPlanner({ai,input:'Revisa el proyecto antes de producción sin modificarlo.',catalog,missionState:{phase:'MISSION_CONTRACT'},retrieveToolCandidates:async operation => {
        seen.push(operation);
        return [catalog[operation===operations[0]?0:1]];
    }});
    assert.deepEqual(seen,operations);
    assert.deepEqual(result.toolCalls.map(item=>item.name),['repo.audit','repo.read']);
    assert.ok(result.toolCalls.every(item=>item.deferred && Object.keys(item.args).length===0));
});

test('local contract reads Qwen tool-name aliases and rejects conflicting or unavailable names', async () => {
    const catalog=[{name:'media.library',description:'Consulta la biblioteca local',inputSchema:{action:'string'}}];
    const run=selection=>runJarvisSemanticPlanner({
        ai:{lastProvider:'ollama-openai-compatible-local',models:{generateContent:async request=>({text:JSON.stringify(request.config.semanticStage==='MISSION_CONTRACT_OPERATIONS'?{sourceReview:'consultar originales',work:[],delivery:''}:selection)})}},
        input:'Consulta la biblioteca oficial',catalog,missionState:{phase:'MISSION_CONTRACT'},retrieveToolCandidates:async()=>catalog
    });
    assert.equal((await run({capability:'consulta',tool:'media.library'})).toolCalls[0].name,'media.library');
    await assert.rejects(run({name:'media.library',tool:'document.create'}),/SEMANTIC_CONTRACT_SELECTION_INVALID/);
    await assert.rejects(run({tool:'invented.tool'}),/SEMANTIC_CONTRACT_SELECTION_INVALID/);
});

test('grounded argument completion retains the explicit source and rejects a category used as domain',async()=>{
    const result=await completeJarvisPlanningArguments({toolName:'web.research',description:'Consulta una fuente web',inputSchema:{type:'object',properties:{query:{type:'string'},researchGoal:{type:'string'},seedUrl:{type:'string'},allowedDomain:{type:'string'}}},instruction:'Investiga https://example.com/servicios para una propuesta.',semanticPlanner:async()=>({ok:true,toolCalls:[{name:'web.research',args:{query:'Propuesta',researchGoal:'RESEARCH_1',allowedDomain:'MARKETING'}}]})});
    assert.equal(result.args.seedUrl,'https://example.com/servicios');
    assert.equal(result.args.allowedDomain,'example.com');
});

test('an explicit source without canonical metadata remains readable without requiring every entity word',async()=>{
    const result=await runResilientLocalWebResearch('Investigar el negocio',5000,{seedUrl:'https://example.com/',allowedDomain:'example.com',exactEntity:'Nombre suministrado con actividad y localidad'},async url=>({ok:true,status:200,url:String(url),text:async()=>'<html><head><title>Firma de servicios</title><meta name="description" content="Servicios profesionales"></head><body>Información del negocio</body></html>'}));
    assert.equal(result.sources[0].url,'https://example.com/');
    assert.equal(result.engine,'jarvis_local_seed_metadata_anchor');
    assert.match(result.supports[0].text,/sin metadata/);
});

test('a redirected page cannot stand in for an explicit source without matching evidence',async()=>{
    await assert.rejects(runResilientLocalWebResearch('Investigar el negocio',5000,{seedUrl:'https://example.com/',allowedDomain:'example.com'},async()=>({ok:true,status:200,url:'https://unrelated.test/',text:async()=>'<html><title>Unrelated</title></html>'})),/WEB_RESEARCH_UPSTREAMS_FAILED/);
});

test('a deferred first operation reaches argument completion through the real orchestrator',async()=>{
    let deferred;
    const data=new Map();
    await runJarvisMission({instruction:'Consulta la fuente.',initialToolCalls:[{name:'web.research',args:{},deferred:true}],requiredToolNames:['web.research'],storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},planner:async()=>({toolCalls:[],missionComplete:true}),execute:async call=>{deferred=call.deferred;return {ok:true,objectiveSatisfied:true,status:'VERIFIED'};}});
    assert.equal(deferred,true);
});

test('spreadsheet bridge uses bounded native JSON and preserves a truncated draft', async()=>{
    const engine=createSelfHostedSemanticEngine({fetchImpl:async(_url,options)=>{
        const body=JSON.parse(options.body);
        assert.equal(body.format,'json');
        assert.equal(body.stream,true);
        assert.equal(body.options.num_predict,1200);
        return {ok:true,text:async()=>JSON.stringify({message:{content:'{"sheets":['},done_reason:'length'})};
    }});
    const result=await engine.respond({input:'Genera una tabla.',semanticStage:'spreadsheet_initial',maxOutputTokens:8000});
    assert.equal(result.partial,true);
    assert.equal(result.message,'{"sheets":[');
});

function spreadsheetTool() {
    const tools = new Map();
    registerJarvisMultifunctionTools({has:n=>tools.has(n),register:t=>tools.set(t.name,t)});
    return tools.get('spreadsheet.compose');
}

test('an informational workbook needs no invented formulas and finishes in one bounded request', async t => {
    const prior = globalThis.JarvisLocalBridge;
    t.after(()=>{globalThis.JarvisLocalBridge=prior;});
    let calls=0;
    globalThis.JarvisLocalBridge={requestJson:async(_route,payload)=>{
        calls++;
        assert.ok(payload.maxOutputTokens<=1200);
        assert.equal(payload.semanticStage,'spreadsheet_initial');
        return {ok:true,message:JSON.stringify({title:'Calendario',sheets:[{name:'Acciones',rows:[['Canal','Acción'],['Web','Propuesta: publicar contenido']]}]})};
    }};
    const result = await spreadsheetTool().execute({title:'Calendario',instructions:'Una hoja informativa con acciones propuestas.'});
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.formulaCount,0);
    assert.equal(calls,1);
});

test('spreadsheet recovery stops when the same invalid draft makes no progress', async t => {
    const prior = globalThis.JarvisLocalBridge;
    t.after(()=>{globalThis.JarvisLocalBridge=prior;});
    let calls=0;
    globalThis.JarvisLocalBridge={requestJson:async()=>{
        calls++;
        return {ok:true,message:JSON.stringify({title:'Costos',sheets:[{name:'Costos',rows:[['Valor'],['=A2']]}]})};
    }};
    const result=await spreadsheetTool().execute({title:'Costos',instructions:'Calcula los costos con fórmulas.',requireFormulas:true});
    assert.equal(result.ok,false);
    assert.equal(calls,2);
    assert.equal(result.retryable,false);
    assert.equal(result.fullRestartAllowed,false);
    assert.equal(result.recovery.reason,'SPREADSHEET_REPAIR_NO_PROGRESS');
});

test('a generated document filename resolves to one stable artifact path',async t=>{
    const prior=globalThis.JarvisLocalBridge;t.after(()=>{globalThis.JarvisLocalBridge=prior;});
    let payload;
    globalThis.JarvisLocalBridge={requestJson:async(route,data)=>{assert.equal(route,'/document');payload=data;return {ok:true};}};
    const registry=new Map();registerJarvisActuatorTools({has:n=>registry.has(n),register:d=>registry.set(d.name,d)});
    await registry.get('document.create').execute({format:'pdf',title:'Plan',output:'Plan Cancún',content:'Propuesta'},{analysisId:'mission-123'});
    assert.equal(payload.output,'.jarvis-artifacts/documents/plan-cancun-mission-123.pdf');
    await registry.get('document.create').execute({format:'pdf',content:'Propuesta'},{analysisId:'mission-456'});
    assert.equal(payload.output,'.jarvis-artifacts/documents/document-mission-456.pdf');
});
