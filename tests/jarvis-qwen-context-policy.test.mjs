import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLocalQwenContextTokens} from '../jarvis-qwen-context-policy.js';
import {createLocalQwenActionSelector} from '../jarvis-qwen-local-action.js';
import {createSelfHostedSemanticEngine} from '../jarvis-fs-bridge.js';

test('single-model context profile defaults unchanged and rejects unsupported values',()=>{
    assert.equal(resolveLocalQwenContextTokens(),16384);
    for(const size of [4096,8192,16384])assert.equal(resolveLocalQwenContextTokens(String(size)),size);
    for(const size of [0,1000,32768,'oops'])assert.throws(()=>resolveLocalQwenContextTokens(size),/CONTEXT_UNSUPPORTED/);
});
test('explicit low-memory Qwen decision preserves the prompt and disables silent shifting',async()=>{
    let payload;
    const select=createLocalQwenActionSelector({contextTokens:4096,fetchImpl:async(_url,options)=>{
        payload=JSON.parse(options.body);
        return {ok:true,json:async()=>({message:{content:JSON.stringify({action:'CALL',name:'repo.read',args:{file:'runtime.js'},report:''})},done_reason:'stop'})};
    }});
    await select({instruction:'Read real source',tools:[{name:'repo.read',inputSchema:{type:'object',properties:{file:{type:'string',enum:['runtime.js']}},required:['file']}}]});
    assert.equal(payload.options.num_ctx,4096);
    assert.equal(payload.truncate,false);
    assert.equal(payload.shift,false);
    assert.ok(payload.messages.some(m=>m.content==='Read real source'));
});
test('semantic engine uses the same opt-in low-memory context without changing its default',async()=>{
    let payload;
    const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'4096'},fetchImpl:async(_url,options)=>{
        payload=JSON.parse(options.body);
        return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:'La evidencia está disponible.'},done_reason:'stop'})};
    }});
    const answer=await engine.respond({input:'Responde sin inventar evidencia',maxOutputTokens:256});
    assert.equal(answer.ok,true);
    assert.equal(payload.options.num_ctx,4096);
    assert.equal(payload.truncate,false);
    assert.equal(payload.shift,false);
    assert.equal(payload.messages.at(-1).content,'Responde sin inventar evidencia');
});

test('oversized low-memory selector refuses incomplete context before starting Ollama',async()=>{
    let fetchCalls=0;
    const select=createLocalQwenActionSelector({contextTokens:4096,fetchImpl:async()=>{fetchCalls++;throw Error('SHOULD_NOT_FETCH');}});
    await assert.rejects(()=>select({instruction:'x'.repeat(45000),tools:[{name:'repo.grep',inputSchema:{type:'object',properties:{term:{type:'string'}},required:['term']}}]}),
        /LOCAL_QWEN_CONTEXT_NEEDS_SEGMENTATION/);
    assert.equal(fetchCalls,0);
});
test('oversized low-memory semantic reply preserves the complete request by failing closed',async()=>{
    let fetchCalls=0;
    const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'4096'},
        fetchImpl:async()=>{fetchCalls++;throw Error('SHOULD_NOT_FETCH');}});
    await assert.rejects(()=>engine.respond({input:'Q'.repeat(45000),maxOutputTokens:256}),
        /LOCAL_QWEN_CONTEXT_NEEDS_SEGMENTATION/);
    assert.equal(fetchCalls,0);
});
test('normal low-memory selector retains the original instruction and token profile',async()=>{
    let payload,fetchCalls=0;
    const select=createLocalQwenActionSelector({contextTokens:4096,fetchImpl:async(_url,req)=>{
        fetchCalls++;payload=JSON.parse(req.body);
        return {ok:true,json:async()=>({done_reason:'stop',message:{content:JSON.stringify({action:'CALL',name:'repo.grep',args:{term:'runJarvisMission'},report:''})}})};
    }});
    const result=await select({instruction:'Busca runJarvisMission en codigo real',tools:[{name:'repo.grep',
        inputSchema:{type:'object',properties:{term:{type:'string',const:'runJarvisMission'}},required:['term']}}]});
    assert.equal(fetchCalls,1);
    assert.equal(payload.options.num_ctx,4096);
    assert.equal(payload.truncate,false);
    assert.equal(payload.shift,false);
    assert.ok(payload.messages.some(m=>m.content==='Busca runJarvisMission en codigo real'));
    assert.equal(result.toolCall.args.term,'runJarvisMission');
});

test('CPU-friendly workstation profile keeps Qwen local with finite idle retention and no forced prewarm',async()=>{
 const fs=await import('node:fs');
 const entry=fs.readFileSync(new URL('../scripts/jarvis-workstation-start.cjs',import.meta.url),'utf8');
 assert.match(entry,/JARVIS_LOCAL_LLM_CONTEXT_TOKENS \|\|= '8192'/);
 assert.match(entry,/JARVIS_LOCAL_LLM_KEEP_ALIVE \|\|= '45s'/);
 assert.match(entry,/JARVIS_LOCAL_LLM_PREWARM \|\|= '0'/);
 assert.match(entry,/JARVIS_LOCAL_LLM_MAX_INFERENCE_MS \|\|= '150000'/);
 assert.match(entry,/coldStart\s*\?\s*\{ok:true,status:'JARVIS_LOCAL_MODEL_ON_DEMAND'/);
});
test('bounded low-memory Qwen requests retain original instructions and idle unload policy',async()=>{
 let body;
 const engine=createSelfHostedSemanticEngine({
  env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',
   JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'8192',
   JARVIS_LOCAL_LLM_KEEP_ALIVE:'45s',JARVIS_LOCAL_LLM_PREWARM:'0',
   JARVIS_LOCAL_LLM_MAX_INFERENCE_MS:'150000'},
  fetchImpl:async(_url,options)=>{
   body=JSON.parse(options.body);
   return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:'Respuesta local'},done_reason:'stop'})};
  }
 });
 await engine.respond({input:'Mi instruccion permanece intacta',maxOutputTokens:192});
 assert.equal(body.options.num_ctx,8192);
 assert.equal(body.keep_alive,'45s');
 assert.equal(body.think,false);
 assert.equal(body.messages.at(-1).content,'Mi instruccion permanece intacta');
 assert.equal(body.truncate,false);
 assert.equal(body.shift,false);
});
test('CPU inference watchdog aborts stalled Ollama without upgrading partial evidence to success',async()=>{
 let calls=0;
 const engine=createSelfHostedSemanticEngine({
  env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',
   JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'8192',
   JARVIS_LOCAL_LLM_MAX_INFERENCE_MS:'65',
   JARVIS_LOCAL_LLM_PREWARM:'0'},
  fetchImpl:async(_url,options)=>{
   calls++;
   await new Promise((_resolve,reject)=>{
    if(options.signal.aborted){reject(options.signal.reason);return;}
    options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
   });
  }
 });
 await assert.rejects(engine.respond({input:'Solo se permite una llamada acotada'}),
  /LOCAL_SEMANTIC_TIMEOUT/);
 assert.equal(calls,1);
});


test('effective health exposes idle policy and tracks a cancellable inference until it settles',async()=>{
 const controller=new AbortController();
 let started;
 const ready=new Promise(resolve=>{started=resolve;});
 const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'8192',
  JARVIS_LOCAL_LLM_KEEP_ALIVE:'45s',JARVIS_LOCAL_LLM_PREWARM:'0',JARVIS_LOCAL_LLM_MAX_INFERENCE_MS:'150000'},
  fetchImpl:async(_url,options)=>{
   started();
   return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
  }});
 const health=engine.describe();
 assert.equal(health.keepAlive,'45s');
 assert.equal(health.prewarmEnabled,false);
 assert.equal(health.maxInferenceMs,150000);
 assert.equal(health.activeInferenceCalls,0);
 const pending=engine.respond({input:'Solo lectura',signal:controller.signal});
 const rejected=assert.rejects(pending,/LOCAL_SEMANTIC_REQUEST_ABORTED/);
 await ready;
 assert.equal(engine.describe().activeInferenceCalls,1);
 controller.abort(new Error('USER_REQUESTED_STOP'));
 await rejected;
 assert.equal(engine.describe().activeInferenceCalls,0);
 assert.equal(engine.describe().counters.failedLocalSemanticInferenceCalls,1);
});


test('8192-token audit reaches the model after bounding large source receipts to the active profile',async()=>{
 let calls=0;
 const fs=await import('node:fs');
 // Real failing web packet; source text is masked, lengths and boundaries retained.
 const fixture=JSON.parse(fs.readFileSync(new URL('./v142-repository-audit-context.fixture.json',import.meta.url),'utf8'));
 const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'8192',JARVIS_LOCAL_LLM_PREWARM:'0'},
  fetchImpl:async()=>{calls++;throw Error('MODEL_WAS_REACHED');}});
 await assert.rejects(engine.plan(fixture),/MODEL_WAS_REACHED/);
 assert.equal(calls,1);
});

test('real four-step Git audit shares identical history receipts without losing evidence or mutating originals',async()=>{
 const fs=await import('node:fs');
 const fixture=JSON.parse(fs.readFileSync(new URL('./v142-four-step-audit.fixture.json',import.meta.url),'utf8'));
 fixture.missionState.blockedTasks=[];
 const before=JSON.stringify(fixture);
 let calls=0;
 const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'8192',JARVIS_LOCAL_LLM_PREWARM:'0'},
  fetchImpl:async(_url,request)=>{
   calls++;
   const packet=JSON.parse(request.body);
   const observations=packet.messages.filter(m=>m.content.startsWith('OBSERVACION_EJECUTADA='))
    .map(m=>JSON.parse(m.content.slice('OBSERVACION_EJECUTADA='.length)));
   assert.equal(observations.length,4,'retain every real operation index');
   assert.deepEqual(observations[0].observation.gitEvidence,fixture.missionState.completedTasks[0].observation.gitEvidence);
   assert.equal(observations[3].observation.sharedGitEvidenceTaskIndex,0);
   assert.equal(observations[2].observation.verifiedRead.file,fixture.missionState.completedTasks[2].observation.verifiedRead.file);
   throw Error('MODEL_WAS_REACHED');
  }});
 await assert.rejects(engine.plan(fixture),/MODEL_WAS_REACHED/);
 assert.equal(calls,1);
 assert.equal(JSON.stringify(fixture),before);
});

test('oversized repository context is recovered before global closure, with observed paths and no success claim',async()=>{
 const fs=await import('node:fs');
 const fixture=JSON.parse(fs.readFileSync(new URL('./v142-four-step-audit.fixture.json',import.meta.url),'utf8'));
 const before=JSON.stringify(fixture);
 const files=['jarvis-qwen-context-policy.js','jarvis-repomix-context.js'];
 fixture.missionState.blockedTasks[0].observation.errorDetails.sourceDiscovery={
  source:'LOCAL_REPOSITORY_FILE_METADATA',operationalEvidence:false,
  candidates:files.map((file,i)=>({file,sourceBytes:1000+i})),partial:true};
 const enrichedBefore=JSON.stringify(fixture);
 let calls=0;
 const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'8192',JARVIS_LOCAL_LLM_PREWARM:'0'},
  fetchImpl:async(_url,request)=>{
   calls++;const body=JSON.parse(request.body);
   assert.ok(JSON.stringify(body).length<12000,'a read recovery must not include the global closure packet');
   return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:JSON.stringify({
    toolCalls:[{name:'repo.context',args:{files,tokenBudget:1800}}],explanation:'Preparar contexto con otras fuentes observadas.'})},done_reason:'stop'})};
  }});
 const plan=await engine.plan(fixture);
 assert.equal(calls,1);
 assert.equal(plan.missionComplete,false);
 assert.deepEqual(plan.toolCalls[0].args.files,files);
 assert.equal(plan.planKind,'REPOSITORY_CONTEXT_RECOVERY');
 assert.equal(JSON.stringify(fixture),enrichedBefore);
});

test('recovery can decline exact-file substitution and rejects unobserved or duplicate sources',async()=>{
 const fs=await import('node:fs');
 for(const files of [null,['jarvis-qwen-context-policy.js','jarvis-qwen-context-policy.js'],['jarvis-invented.js','jarvis-qwen-context-policy.js']]){
  const fixture=JSON.parse(fs.readFileSync(new URL('./v142-four-step-audit.fixture.json',import.meta.url),'utf8'));
  fixture.missionState.blockedTasks[0].observation.errorDetails.sourceDiscovery={
   source:'LOCAL_REPOSITORY_FILE_METADATA',operationalEvidence:false,candidates:[
    {file:'jarvis-qwen-context-policy.js',sourceBytes:1000},{file:'jarvis-repomix-context.js',sourceBytes:2000}]};
  const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'8192',JARVIS_LOCAL_LLM_PREWARM:'0'},
   fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({message:{content:JSON.stringify({
    toolCalls:files?[{name:'repo.context',args:{files,tokenBudget:1800}}]:[],explanation:'No cambiar las fuentes exactas solicitadas.'})},done_reason:'stop'})})});
  await assert.rejects(engine.plan(fixture),/RECOVERY_UNAVAILABLE|TOOL_ARGUMENTS_INVALID/);
 }
});


test('model-selected canonical repository IDs are reused without redundant ranking or name selection',async()=>{
 const {createRequire}=await import('node:module');
 const {runJarvisSemanticPlanner}=createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');
 const names=['repo.gitHistory','repo.gitStatus','repo.context','repo.read'];
 const calls=[];
 const catalog=names.map(name=>({name,description:'Lectura autorizada de repositorio',mutates:false,requiresApproval:false,
  inputSchema:{type:'object',properties:{},additionalProperties:false}}));
 const plan=await runJarvisSemanticPlanner({input:'Investiga el repositorio sin modificarlo.',catalog,
  missionState:{phase:'MISSION_CONTRACT',writeAllowed:false},
  ai:{lastProvider:'ollama-openai-compatible-local',models:{generateContent:async req=>{
   calls.push(req.config.semanticStage);
   assert.equal(req.config.semanticStage,'MISSION_CONTRACT_OPERATIONS');
   return {text:JSON.stringify({sourceReview:names,sourceKind:'repository',work:'',workKind:'none',verification:'',delivery:''})};
  }}},
  retrieveToolCandidates:async()=>{throw Error('REDUNDANT_RANKING_OF_MODEL_SELECTED_ID');}});
 assert.deepEqual(calls,['MISSION_CONTRACT_OPERATIONS']);
 assert.deepEqual(plan.toolCalls.map(t=>t.name),names);
 assert.ok(plan.toolCalls.every(t=>t.deferred===true&&t.mutates===false&&t.approved===false));
 assert.equal(plan.missionComplete,false);
});

test('canonical reuse never resolves aliases, mutating tools or approval-gated reads',async()=>{
 const {createRequire}=await import('node:module');
 const {runJarvisSemanticPlanner}=createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');
 for(const [operation,tool] of [
  ['leer repo.read',{name:'repo.read',mutates:false}],
  ['repo.gitCommit',{name:'repo.gitCommit',mutates:true}],
  ['repo.read',{name:'repo.read',mutates:false,requiresApproval:true}]
 ]){
  let retrievals=0;
  await assert.rejects(runJarvisSemanticPlanner({input:'Investiga con los permisos vigentes.',catalog:[{...tool,
   description:'Herramienta con contrato vigente',inputSchema:{type:'object',properties:{}}}],
   missionState:{phase:'MISSION_CONTRACT',writeAllowed:false},
   ai:{lastProvider:'ollama-openai-compatible-local',models:{generateContent:async()=>({text:JSON.stringify({
    sourceReview:[operation],sourceKind:'repository',work:'',workKind:'none',verification:'',delivery:''})})}},
   retrieveToolCandidates:async()=>{retrievals++;throw Error('SEMANTIC_SELECTION_STILL_REQUIRED');}
  }),/SEMANTIC_SELECTION_STILL_REQUIRED/);
  assert.equal(retrievals,1);
 }
});

test('six immutable repository goals and recovered context fit the 8192-token audit without dropping receipts',async()=>{
 const fs=await import('node:fs');
 const fixture=JSON.parse(fs.readFileSync(new URL('./v142-four-step-audit.fixture.json',import.meta.url),'utf8'));
 const objectives=[
  ['Revisar los últimos commits reales de Git','repository_search'],
  ['Preparar contexto de dos archivos de código existentes y autorizados','repository_source'],
  ['Verificar el contenido de los archivos','repository_source'],
  ['Explicar los cambios','repository_search'],
  ['Explicar las pruebas aprobadas','repository_search'],
  ['Explicar lo pendiente','repository_search']
 ].map(([objective,requiredEvidenceKind])=>({objective,requiredEvidenceKind,requestQuote:objective}));
 fixture.missionState.evidenceObjectives=objectives;
 fixture.missionState.completionAssessment={evaluatedTaskCount:0,objectives:objectives.map(g=>({...g,satisfied:false,evidenceTaskIndexes:[],limitation:'Evidencia pendiente.'}))};
 fixture.missionState.completedTasks.push({name:'repo.context',args:{files:['jarvis-safe-a.js','jarvis-safe-b.js']},
 observation:{ok:true,executionOk:true,blocked:false,status:'REPO_CONTEXT_READY',contextPreview:{
 files:[{file:'jarvis-safe-a.js',sha256:'a'.repeat(64)},{file:'jarvis-safe-b.js',sha256:'b'.repeat(64)}],
 packedContext:'<files>Contexto acotado no certificado.</files>',independentlyCertified:false,evidenceOnly:true}}});
 const before=JSON.stringify(fixture);let calls=0,sourceSelections=0;
 const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'8192',JARVIS_LOCAL_LLM_PREWARM:'0'},
 fetchImpl:async(_url,request)=>{
  const packet=JSON.parse(request.body);
  if(packet.messages.some(m=>m.content.startsWith('SELECCION_DE_LECTURA_DE_CONTEXTO'))){
   sourceSelections++;assert.equal(packet.messages.at(-1).content,fixture.input);
   return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:'{"toolCalls":[]}'},done_reason:'stop'})};
  }
  calls++;
  assert.equal(packet.options.num_ctx,8192);assert.equal(packet.truncate,false);assert.equal(packet.shift,false);
  if(packet.format.properties?.proven){
   assert.equal(calls,8,'positive source claim still independently reviewed');
   const cited=JSON.parse(packet.messages.at(-1).content).evidence;
   assert.equal(cited[0].observation.verifiedRead.file,fixture.missionState.completedTasks[2].observation.verifiedRead.file);
   throw Error('SIX_GOAL_MODEL_REACHED');
  }
  const observations=packet.messages.filter(m=>m.content.startsWith('OBSERVACION_EJECUTADA='));
  assert.equal(observations.length,5);
  assert.ok(packet.messages.some(m=>m.content.includes('REPO_CONTEXT_SOURCE_TOO_LARGE')),'failed receipt retained');
  if(calls<=objectives.length){
   const original=packet.messages.find(m=>m.content.startsWith('PEDIDO_ORIGINAL_PARA_RESOLVER_ALCANCE='));
   assert.equal(JSON.parse(original.content.slice('PEDIDO_ORIGINAL_PARA_RESOLVER_ALCANCE='.length)),fixture.input);
   assert.equal(JSON.parse(packet.messages.at(-1).content.slice('OBJETIVO_INMUTABLE='.length)).objective,objectives[calls-1].objective);
   assert.ok(JSON.stringify(packet.messages).includes(objectives[calls-1].objective),'each immutable goal reviewed separately');
   return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:JSON.stringify(calls===3?{s:true,r:[2],l:''}:{s:false,r:[],l:'Falta evidencia pertinente.'})},done_reason:'stop'})};
  }
  assert.equal(packet.messages.at(-1).content,fixture.input);
  for(const goal of objectives)assert.ok(JSON.stringify(packet.messages).includes(goal.objective),'all verdicts retained before continuation');
  const choices=JSON.stringify(packet.format.properties.toolCalls);
  assert.ok(choices.includes('jarvis-safe-a.js') && choices.includes('jarvis-safe-b.js'),'context source identities remain available for independent repo.read');
  return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:JSON.stringify({toolCalls:[{name:'repo.read',args:{file:'jarvis-safe-a.js'}}],explanation:'Verificar fuente del contexto.'})},done_reason:'stop'})};
 }});
 await assert.rejects(engine.plan(fixture),/SIX_GOAL_MODEL_REACHED/);
 assert.equal(calls,8);assert.equal(sourceSelections,1);assert.equal(JSON.stringify(fixture),before);
});

test('atomic repository audit rejects invented proof, missing gaps and truncation without a closure claim',async()=>{
 const {createRequire}=await import('node:module');
 const {generateRepositoryAudit}=createRequire(import.meta.url)('../functions/jarvis-repository-audit-codec.cjs');
 const branch=s=>({properties:{objective:{enum:['Verificar dos archivos']},requiredEvidenceKind:{enum:['repository_source']},
  evidenceTaskIndexes:{type:'array',maxItems:1,items:{enum:[0]}},satisfied:{enum:[s]}}});
 const request={config:{chatMessages:[{role:'user',content:'Verifica dos archivos.'}],
  responseJsonSchema:{properties:{completionAssessment:{properties:{objectives:{properties:{objective_0:{anyOf:[branch(false),branch(true)]}}}}},
   toolCalls:{type:'array',maxItems:0}}}}};
 for(const value of [{s:true,r:[],l:''},{s:true,r:[7],l:''},{s:true,r:[0,0],l:''},{s:false,r:[],l:''},
  {s:true,r:[0],l:'Falta archivo'},{s:true,r:[0],l:'',objective:'Otro objetivo'}]){
  let calls=0;
  await assert.rejects(generateRepositoryAudit({enabled:true,request,ai:{models:{generateContent:async()=>{
   calls++;return{text:JSON.stringify(value)};
  }}}}),/COMPLETION_EVIDENCE_INVALID/);
  assert.equal(calls,1);
 }
 await assert.rejects(generateRepositoryAudit({enabled:true,request,ai:{models:{generateContent:async()=>({
  text:'{"s":true,"r":[0],"l":""}',providerResponse:{finishReason:'length'}
 })}}}),/AUDIT_INCOMPLETE/);
 const before=JSON.stringify(request);let calls=0;
 const result=await generateRepositoryAudit({enabled:true,request,ai:{models:{generateContent:async()=>{
  calls++;return{text:JSON.stringify(calls===1?{s:false,r:[0],l:'Falta segundo archivo.'}:
   {toolCalls:[],explanation:'Lectura parcial.',completionAssessment:{objectives:[]},missionComplete:true})};
 }}}});
 const plan=JSON.parse(result.text);
 assert.equal(plan.completionAssessment.objectives.objective_0.objective,'Verificar dos archivos');
 assert.equal(plan.completionAssessment.objectives.objective_0.requiredEvidenceKind,'repository_source');
 assert.equal(plan.completionAssessment.objectives.objective_0.satisfied,false);
 assert.equal(plan.missionComplete,undefined);
 assert.equal(JSON.stringify(request),before);
});

test('budget pressure never labels fully retained source bodies as partial at the actual Ollama boundary',async()=>{
 const fs=await import('node:fs');
 const fixture=JSON.parse(fs.readFileSync(new URL('./v142-four-step-audit.fixture.json',import.meta.url),'utf8'));
 fixture.missionState.blockedTasks=[];
 fixture.missionState.evidenceObjectives=[{objective:'Verificar contenido de dos archivos',requiredEvidenceKind:'repository_source'}];
 fixture.missionState.completionAssessment=null;
 const small=[124,779].map((size,i)=>({name:'repo.read',args:{file:'jarvis-small-'+i+'.js'},observation:{
  ok:true,executionOk:true,status:'SUCCESS',verifiedRead:{tool:'repo.read',file:'jarvis-small-'+i+'.js',
   startLine:1,endLine:1,totalLines:1,readEndLine:1,content:'x'.repeat(size),contentLength:size,
   partial:false,truncated:false,contentTruncated:false,evidenceTextTruncated:false,exactContent:true}}}));
 fixture.missionState.completedTasks.push(...small);
 const before=JSON.stringify(fixture);let reached=false;
 const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'8192',JARVIS_LOCAL_LLM_PREWARM:'0'},fetchImpl:async(_url,request)=>{
  const body=JSON.parse(request.body);
  const tasks=body.messages.filter(m=>m.content.startsWith('OBSERVACION_EJECUTADA=')).map(m=>JSON.parse(m.content.slice('OBSERVACION_EJECUTADA='.length)));
  for(const original of small){
   const read=tasks.find(t=>t.args?.file===original.args.file).observation.verifiedRead;
   assert.equal(read.content,original.observation.verifiedRead.content);
   for(const flag of ['partial','truncated','contentTruncated','evidenceTextTruncated'])assert.equal(read[flag],false,flag+' must reflect actual body omission');
   assert.equal(read.endLine,1);
  }
  const large=tasks.find(t=>t.index===2).observation.verifiedRead;
  assert.equal(large.partial,true);assert.equal(large.contentTruncated,true);
  reached=true;throw Error('SOURCE_FLAGS_VERIFIED');
 }});
 await assert.rejects(engine.plan(fixture),/SOURCE_FLAGS_VERIFIED/);
 assert.equal(reached,true);assert.equal(JSON.stringify(fixture),before);
});
