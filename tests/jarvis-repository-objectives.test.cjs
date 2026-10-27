const test=require('node:test'),assert=require('node:assert/strict');
const {extractRepositoryObjectives}=require('../functions/jarvis-repository-objectives.cjs');
const catalog=[{name:'repo.read',evidenceKinds:['repository_source']}];
const instruction='Lee dos archivos y verifica su contenido.';
const aiFor=value=>({models:{generateContent:async()=>({text:JSON.stringify(value)})}});
const scopedResponse=(req,values)=>({text:JSON.stringify({scopes:Object.fromEntries(
 req.config.responseJsonSchema.properties.scopes.required.map(id=>[id,values[id]]))})});

test('mixed repository contracts retain generic artifact evidence from empty registered kinds',async()=>{
 const result=await extractRepositoryObjectives({instruction:'Crea un informe.',catalog:[{name:'document.create',evidenceKinds:[]},...catalog],
  ai:{models:{generateContent:async req=>scopedResponse(req,{scope_0:'tool_result'})}}
 });
 assert.equal(result[0].requiredEvidenceKind,'tool_result');assert.equal(result[0].satisfied,false);
});

test('literal scope and its original sentence resolve antecedents without rewriting or certifying the objective',async()=>{
 const input='Prepara contexto de dos archivos, y lee su contenido.';
 const value={scopes:{scope_0:{scope:'Prepara contexto de dos archivos,',kind:'repository_source'},
  scope_1:{scope:'y lee su contenido.',kind:'repository_source'}}};
 const result=await extractRepositoryObjectives({ai:{models:{generateContent:async req=>scopedResponse(req,value.scopes)}},instruction:input,catalog});
 assert.equal(result[1].objective,'y lee su contenido.');
 assert.equal(result[1].requestQuote,'y lee su contenido.');
 assert.equal(result[1].resolvedScope,value.scopes.scope_1.scope);
 assert.equal(result[1].scopeContext,input);
 assert.equal(result[1].satisfied,false);assert.deepEqual(result[1].evidenceTaskIndexes,[]);
 for(const invalid of [{scope:'',kind:'repository_source'},{scope:'Leer dos.',kind:'payment'},
  {scope:'Leer dos.',kind:'repository_source',satisfied:true},{scope:'Lee un archivo.',kind:'repository_source'}]){
  await assert.rejects(extractRepositoryObjectives({ai:aiFor({scopes:{scope_0:invalid}}),instruction,catalog}),/OBJECTIVES_UNGROUNDED/);
 }
});

test('objective text and quantity come from the original scope, never a model paraphrase',async()=>{
 const result=await extractRepositoryObjectives({ai:aiFor({scopes:{scope_0:'repository_source'}}),instruction,catalog});
 assert.equal(result[0].objective,instruction);assert.equal(result[0].requestQuote,instruction);
 assert.equal(result[0].satisfied,false);assert.deepEqual(result[0].evidenceTaskIndexes,[]);
});
test('missing scopes, invented keys, unsupported kinds and all-constraint contracts fail closed with receipts',async()=>{
 for(const value of [{scopes:{}},{scopes:{scope_0:'payment'}},{scopes:{scope_0:'constraint'}},
  {scopes:{scope_0:'repository_source',scope_7:'repository_source'}},{objectives:[],constraints:['no inventes evidencias']}]){
  await assert.rejects(extractRepositoryObjectives({ai:aiFor(value),instruction,catalog}),error=>{
   assert.match(error.message,/OBJECTIVES_(UNGROUNDED|INCOMPLETE)/);
   assert.equal(error.retryable,false);assert.equal(error.evidence.stage,'REPOSITORY_OBJECTIVE_CONTRACT');return true;
  });
 }
});
test('truncated response cannot establish an objective contract',async()=>{
 await assert.rejects(extractRepositoryObjectives({ai:{models:{generateContent:async()=>({
  text:'{"scopes":{"scope_0":"repository_source"}}',providerResponse:{finishReason:'length'}})}},instruction,catalog}),/TRUNCATED/);
});
test('local repository mission establishes literal objectives before execution',async()=>{
 const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
 const ai={lastProvider:'ollama-openai-compatible-local',models:{generateContent:async req=>{
  if(req.config.semanticStage==='REPOSITORY_OBJECTIVE_CONTRACT')return {text:'{"scopes":{"scope_0":"repository_source"}}'};
  const variants=req.config.responseJsonSchema.anyOf;
  assert.equal(variants.length,2);
  for(const variant of variants){
   assert.equal(variant.type,'object');
   assert.deepEqual(variant.required,['sourceReview','sourceKind','workKind','work','verification','delivery']);
   assert.equal(variant.additionalProperties,false);
   assert.ok(variant.properties.sourceReview);
  }
  assert.deepEqual(variants[0].properties.work,{const:''});
  assert.deepEqual(variants[0].properties.workKind,{const:'none'});
  assert.ok(!variants[1].properties.workKind.enum.includes('none'));
  return {text:JSON.stringify({sourceReview:['repo.read'],sourceKind:'repository',work:'',workKind:'none',verification:'',delivery:''})};
 }}};
 const plan=await runJarvisSemanticPlanner({ai,input:instruction,catalog:[{...catalog[0],mutates:false,inputSchema:{type:'object',properties:{}}}],
  missionState:{phase:'MISSION_CONTRACT',modelContextTokens:8192,writeAllowed:false},retrieveToolCandidates:async()=>[]});
 assert.equal(plan.completionAssessment.objectives[0].requestQuote,instruction);assert.equal(plan.missionComplete,false);
});
test('real acceptance request retains all five evidence scopes and the exact ni prohibition',async()=>{
 const input='Revisa los últimos commits reales de Git mediante repo.gitHistory y repo.gitStatus. Usa repo.context para preparar contexto de dos archivos de código existentes y autorizados, y repo.read para verificar su contenido. Explica los cambios, las pruebas aprobadas y lo pendiente. No modifiques archivos ni inventes evidencias.';
 const result=await extractRepositoryObjectives({instruction:input,catalog:[...catalog,{name:'repo.context',evidenceKinds:['repository_search']}],ai:{models:{generateContent:async req=>{
  const scopes=JSON.parse(req.config.chatMessages.find(m=>m.content.startsWith('FRAGMENTOS_ORIGINALES=')).content.slice('FRAGMENTOS_ORIGINALES='.length));
  assert.equal(scopes.length,6);assert.equal(scopes[5].text,'No modifiques archivos ni inventes evidencias.');
  assert.ok(scopes[0].text.includes('repo.gitHistory y repo.gitStatus.'));
  const target=JSON.parse(req.config.chatMessages.at(-1).content.slice('FRAGMENTO_ACTUAL='.length));
  assert.deepEqual(req.config.responseJsonSchema.properties.scopes.required,[target.id]);
  return scopedResponse(req,{scope_0:'repository_search',scope_1:'repository_search',scope_2:'repository_source',scope_3:'repository_search',scope_4:'repository_source',scope_5:'constraint'});
 }}}});
 assert.equal(result.length,5);assert.ok(result.every(g=>input.includes(g.objective)&&!g.satisfied));
 assert.equal(result[2].objective,'y repo.read para verificar su contenido.');
 assert.equal(result[4].objective,'las pruebas aprobadas y lo pendiente.');
});
test('one bounded correction handles an omitted scope without restarting the complete plan',async()=>{
 let calls=0;
 const result=await extractRepositoryObjectives({instruction,catalog,ai:{models:{generateContent:async req=>{
  calls++;assert.equal(JSON.parse(req.config.chatMessages.at(-1).content.slice('FRAGMENTO_ACTUAL='.length)).text,instruction);
  assert.ok(req.config.chatMessages.some(m=>m.content==='PEDIDO_ORIGINAL='+JSON.stringify(instruction)));
  return {text:JSON.stringify({scopes:calls===1?{}:{scope_0:'repository_source'}})};
 }}}});
 assert.equal(calls,2);assert.equal(result[0].objective,instruction);
});
test('long punctuation lists remain bounded without dropping any original words',async()=>{
 const input=Array.from({length:20},(_,i)=>'Lee archivo'+i+'.js.').join(' ');
 const result=await extractRepositoryObjectives({instruction:input,catalog,ai:{models:{generateContent:async req=>({
  text:JSON.stringify({scopes:Object.fromEntries(req.config.responseJsonSchema.properties.scopes.required.map(id=>[id,'repository_source']))})
 })}}});
 assert.ok(result.length<=8);assert.equal(result.map(g=>g.objective).join(' '),input);
});

test('contradictory no-work operation fails before selecting duplicate evidence tools',async()=>{
 const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
 let selections=0;
 const ai={lastProvider:'ollama-openai-compatible-local',models:{generateContent:async()=>({text:JSON.stringify({
  sourceReview:['repo.read'],sourceKind:'repository',work:'explicar los cambios observados',workKind:'none',verification:'',delivery:''})})}};
 await assert.rejects(runJarvisSemanticPlanner({ai,input:instruction,catalog:[{...catalog[0],mutates:false,inputSchema:{type:'object',properties:{}}}],
  missionState:{phase:'MISSION_CONTRACT',modelContextTokens:8192,writeAllowed:false},
  retrieveToolCandidates:async()=>{selections++;return [];}
 }),/SEMANTIC_CONTRACT_OPERATIONS_INVALID/);
 assert.equal(selections,0);
});

test('repository current-turn calls cannot bypass literal objectives through a false coverage approval',async()=>{
 const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
 const input='Revisa Git. Prepara contexto. Lee los archivos. Explica pruebas y pendientes.';
 const names=['repo.gitHistory','repo.gitStatus','repo.context','repo.read'],stages=[];
 const tools=names.map(name=>({name,mutates:false,evidenceKinds:[name==='repo.read'?'repository_source':'repository_search'],inputSchema:{type:'object',properties:{},additionalProperties:false}}));
 const plan=await runJarvisSemanticPlanner({input,catalog:tools,
  missionState:{phase:'MISSION_CONTRACT',modelContextTokens:8192,existingInitialToolCalls:[{name:'repo.gitHistory',args:{}},{name:'repo.gitStatus',args:{}}]},
  retrieveToolCandidates:async()=>{throw Error('CANONICAL_IDS_NEED_NO_RETRIEVAL');},
  ai:{lastProvider:'ollama-openai-compatible-local',models:{generateContent:async req=>{
   stages.push(req.config.semanticStage);
   if(!req.config.semanticStage)return {text:'{"coversAll":true}'};
   if(req.config.semanticStage==='REPOSITORY_OBJECTIVE_CONTRACT')return scopedResponse(req,{scope_0:'repository_search',scope_1:'repository_search',scope_2:'repository_source',scope_3:'repository_source'});
   return {text:JSON.stringify({sourceReview:names,sourceKind:'repository',workKind:'none',work:'',verification:'',delivery:''})};
  }}}
 });
 assert.deepEqual(stages,[undefined,...Array(4).fill('REPOSITORY_OBJECTIVE_CONTRACT'),'MISSION_CONTRACT_OPERATIONS',...Array(4).fill('REPOSITORY_OBJECTIVE_CONTRACT')]);
 assert.equal(plan.planKind,'MISSION_CONTRACT_COMPACT_LOCAL');
 assert.equal(plan.completionAssessment.objectives.length,4);
 assert.deepEqual(plan.toolCalls.map(t=>t.name),names);
 assert.ok(plan.toolCalls.every(t=>t.deferred===true));assert.equal(plan.missionComplete,false);
});

test('explicit Git calls are reused only with complete immutable repository objectives',async()=>{
 const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
 const input='Usa repo.gitHistory y repo.gitStatus para resumir los últimos 8 commits y el estado actual del repositorio sin modificar archivos.';
 const calls=[{name:'repo.gitHistory',args:{limit:8}},{name:'repo.gitStatus',args:{}}];
 const tools=calls.map(call=>({name:call.name,mutates:false,evidenceKinds:['repository_search'],inputSchema:{type:'object',properties:{limit:{type:'integer'}},additionalProperties:false}}));
 tools.push({name:'platform.query',mutates:false,evidenceKinds:['platform_records'],inputSchema:{type:'object',properties:{}}});
 for(const variant of ['valid','mixed','truncated']){
  const stages=[];
  const task=runJarvisSemanticPlanner({input,catalog:tools,
   missionState:{phase:'MISSION_CONTRACT',modelContextTokens:8192,existingInitialToolCalls:calls},
   retrieveToolCandidates:async()=>{throw Error('UNEXPECTED_RETRIEVAL');},
   ai:{lastProvider:'ollama-openai-compatible-local',models:{generateContent:async req=>{
    stages.push(req.config.semanticStage);
    if(!req.config.semanticStage)return {text:'{"coversAll":true}',providerResponse:{finishReason:variant==='truncated'?'length':'stop'}};
    if(req.config.semanticStage==='REPOSITORY_OBJECTIVE_CONTRACT'){
     assert.ok(JSON.stringify(req.config.responseJsonSchema).includes('platform_records'));
     return scopedResponse(req,{scope_0:variant==='mixed'?'platform_records':'repository_search'});
    }
    throw Error('FULL_CONTRACT_REQUIRED');
   }}}
  });
  if(variant==='valid'){
   const result=await task;
   assert.equal(result.planKind,'MISSION_CONTRACT_EXISTING_TOOLS_VERIFIED');
   assert.equal(result.missionComplete,false);
   assert.equal(result.completionAssessment.objectives[0].satisfied,false);
   assert.equal(result.completionAssessment.objectives[0].requestQuote,input);
   assert.deepEqual(result.toolCalls.map(({name,args})=>({name,args})),calls);
   assert.deepEqual(stages,[undefined,'REPOSITORY_OBJECTIVE_CONTRACT']);
  }else await assert.rejects(task,/FULL_CONTRACT_REQUIRED/);
 }
});
