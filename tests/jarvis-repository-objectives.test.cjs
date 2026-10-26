const test=require('node:test'),assert=require('node:assert/strict');
const {extractRepositoryObjectives}=require('../functions/jarvis-repository-objectives.cjs');
const catalog=[{name:'repo.read',evidenceKinds:['repository_source']}];
const instruction='Lee dos archivos y verifica su contenido.';
const aiFor=value=>({models:{generateContent:async()=>({text:JSON.stringify(value)})}});

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
  assert.deepEqual(req.config.responseJsonSchema.properties.scopes.required,scopes.map(s=>s.id));
  return {text:JSON.stringify({scopes:{scope_0:'repository_search',scope_1:'repository_search',scope_2:'repository_source',scope_3:'repository_search',scope_4:'repository_source',scope_5:'constraint'}})};
 }}}});
 assert.equal(result.length,5);assert.ok(result.every(g=>input.includes(g.objective)&&!g.satisfied));
 assert.equal(result[2].objective,'y repo.read para verificar su contenido.');
 assert.equal(result[4].objective,'las pruebas aprobadas y lo pendiente.');
});
test('one bounded correction handles an omitted scope without restarting the complete plan',async()=>{
 let calls=0;
 const result=await extractRepositoryObjectives({instruction,catalog,ai:{models:{generateContent:async req=>{
  calls++;assert.equal(req.config.chatMessages.at(-1).content,instruction);
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
