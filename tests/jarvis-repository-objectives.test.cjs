const test=require('node:test');const assert=require('node:assert/strict');
const {extractRepositoryObjectives}=require('../functions/jarvis-repository-objectives.cjs');
const catalog=[{name:'repo.read',evidenceKinds:['repository_source']}];
const instruction='Lee dos archivos y verifica su contenido.';
const goal={objective:'Verificar dos archivos',requestQuote:instruction,requiredEvidenceKind:'repository_source'};
const aiFor=value=>({models:{generateContent:async()=>({text:JSON.stringify(value)})}});
test('objectives retain exact requested quantity and begin unproven',async()=>{
 const result=await extractRepositoryObjectives({ai:aiFor({objectives:[goal]}),model:'qwen3.5:9b',instruction,catalog});
 assert.equal(result[0].requestQuote,instruction);assert.equal(result[0].objective,instruction);assert.equal(result[0].satisfied,false);assert.deepEqual(result[0].evidenceTaskIndexes,[]);
});
test('fabricated quotes, unsupported kinds, duplicate or missing objectives fail closed',async()=>{
 for(const objectives of [[],[goal,goal],[{...goal,requestQuote:'Modifica los archivos'}],[{...goal,requiredEvidenceKind:'payment'}]])
 await assert.rejects(extractRepositoryObjectives({ai:aiFor({objectives}),instruction,catalog}),/UNGROUNDED/);
});
test('truncated response cannot establish an objective contract',async()=>{
 await assert.rejects(extractRepositoryObjectives({ai:{models:{generateContent:async()=>({text:JSON.stringify({objectives:[goal]}),providerResponse:{finishReason:'length'}})}},instruction,catalog}),/TRUNCATED/);
});
test('local repository mission establishes objectives before execution',async()=>{
 const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
 const ai={lastProvider:'ollama-openai-compatible-local',models:{generateContent:async req=>{
 if(req.config.semanticStage==='REPOSITORY_OBJECTIVE_CONTRACT')return {text:JSON.stringify({objectives:[goal]})};
 return {text:JSON.stringify({sourceReview:['repo.read'],sourceKind:'repository',work:'',workKind:'none',verification:'',delivery:''})};
 }}};
 const plan=await runJarvisSemanticPlanner({ai,input:instruction,catalog:[{...catalog[0],mutates:false,inputSchema:{type:'object',properties:{}}}],
 missionState:{phase:'MISSION_CONTRACT',modelContextTokens:8192,writeAllowed:false},retrieveToolCandidates:async()=>[]});
 assert.equal(plan.completionAssessment?.objectives?.[0]?.requestQuote,goal.requestQuote);
 assert.equal(plan.missionComplete,false);
});

test('a paraphrase cannot replace a literal scope or silently omit pending work',async()=>{
 const input='Explica las pruebas aprobadas y lo pendiente. No modifiques archivos.';
 let calls=0;
 await assert.rejects(extractRepositoryObjectives({instruction:input,catalog,ai:{models:{generateContent:async()=>{
  calls++;return {text:JSON.stringify({objectives:[{objective:'Explicar pruebas aprobadas',requestQuote:'y lo pendiente',requiredEvidenceKind:'repository_source'}],
   constraints:['No modifiques archivos.']})};
 }}}}),/OBJECTIVES_INCOMPLETE/);
 assert.equal(calls,2,'one bounded correction, never an unbounded planning loop');
 const result=await extractRepositoryObjectives({instruction:input,catalog,ai:aiFor({objectives:[
  {objective:'Ignorar el pedido',requestQuote:'Explica las pruebas aprobadas',requiredEvidenceKind:'repository_source'},
  {requestQuote:'y lo pendiente',requiredEvidenceKind:'repository_source'}],constraints:['No modifiques archivos.']})});
 assert.deepEqual(result.map(g=>g.objective),['Explica las pruebas aprobadas','y lo pendiente']);
 assert.ok(result.every(g=>!g.satisfied));
});
test('one correction restores omitted scope while preserving the original user message',async()=>{
 let calls=0;const input='Lee dos archivos y verifica su contenido.';
 const result=await extractRepositoryObjectives({instruction:input,catalog,ai:{models:{generateContent:async req=>{
  calls++;assert.equal(req.config.chatMessages.at(-1).content,input);
  return {text:JSON.stringify({objectives:[{requestQuote:calls===1?'Lee dos archivos':input,requiredEvidenceKind:'repository_source'}],constraints:[]})};
 }}}});
 assert.equal(calls,2);assert.equal(result[0].objective,input);
});
