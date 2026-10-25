const test=require('node:test');const assert=require('node:assert/strict');
const {extractRepositoryObjectives}=require('../functions/jarvis-repository-objectives.cjs');
const catalog=[{name:'repo.read',evidenceKinds:['repository_source']}];
const instruction='Lee dos archivos y verifica su contenido.';
const goal={objective:'Verificar dos archivos',requestQuote:'Lee dos archivos',requiredEvidenceKind:'repository_source'};
const aiFor=value=>({models:{generateContent:async()=>({text:JSON.stringify(value)})}});
test('objectives retain exact requested quantity and begin unproven',async()=>{
 const result=await extractRepositoryObjectives({ai:aiFor({objectives:[goal]}),model:'qwen3.5:9b',instruction,catalog});
 assert.equal(result[0].requestQuote,'Lee dos archivos');assert.equal(result[0].satisfied,false);assert.deepEqual(result[0].evidenceTaskIndexes,[]);
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
