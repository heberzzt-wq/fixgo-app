const test=require('node:test'),assert=require('node:assert/strict');
const {reviewRepositoryObjective}=require('../functions/jarvis-repository-objective-proof.cjs');
const contract={objective:'y lee su contenido.',resolvedScope:'Leer el contenido de los dos archivos preparados.',
 scopeContext:'Prepara contexto de dos archivos, y lee su contenido.',requiredEvidenceKind:'repository_source'};
const tasks=[{name:'repo.context',args:{files:['a.js','b.js']},observation:{ok:true,status:'REPO_CONTEXT_READY',contextPreview:{files:[{file:'a.js'},{file:'b.js'}]}}},
 ...['a.js','b.js'].map(file=>({name:'repo.read',args:{file},observation:{ok:true,executionOk:true,verifiedRead:{file,content:'export {};',partial:false,truncated:false}}}))];
test('an explicit second tool cannot be replaced by a successful receipt from the first',async()=>{
 const c={objective:'Revisa repo.gitHistory y repo.gitStatus.',resolvedScope:'Revisar repo.gitHistory y repo.gitStatus.',
  explicitTools:['repo.gitHistory','repo.gitStatus'],requiredEvidenceKind:'repository_search'};
 const result=await reviewRepositoryObjective({objective:{...c,evidenceTaskIndexes:[0]},contract:c,
  tasks:[{name:'repo.gitHistory',observation:{ok:true,executionOk:true}}],
  ai:{models:{generateContent:async()=>{throw Error('missing explicit tool must not reach inference');}}}});
 assert.equal(result.proven,false);assert.equal(result.reason,'EXPLICIT_TOOL_EVIDENCE_MISSING');
});
test('independent repository proof preserves literal dependency scope and raw cited content without global tasks',async()=>{
 const objective={...contract,evidenceTaskIndexes:[1,2],scopeTaskIndexes:[1,2],satisfied:true};
 let request;
 const result=await reviewRepositoryObjective({objective,contract,tasks,model:'qwen3.5:9b',ai:{models:{generateContent:async req=>{
  request=req;return{text:'{"reason":"Dos contenidos completos presentes.","proven":true}'};
 }}}});
 const input=JSON.parse(request.config.chatMessages.at(-1).content);
 assert.equal(input.objective,contract.objective);assert.equal(input.scopeContext,contract.scopeContext);
 assert.deepEqual(input.evidence.map(t=>t.index),[1,2]);assert.equal(input.evidence[1].observation.verifiedRead.content,'export {};');
 assert.deepEqual(input.dependencies[0].contextFiles,[{file:'a.js'},{file:'b.js'}]);
 assert.ok(input.dependencies.every(t=>!objective.evidenceTaskIndexes.includes(t.index)));
 assert.equal(result.proven,true);
});
test('independent negative, absent reason, truncation and changed scope never become proof',async()=>{
 const objective={...contract,evidenceTaskIndexes:[1],scopeTaskIndexes:[1],satisfied:true};
 for(const response of [{text:'{"reason":"Falta b.js.","proven":false}'},{text:'{"proven":true}'},
  {text:'{"reason":"Todo presente.","proven":true}',providerResponse:{finishReason:'length'}}]){
  const result=await reviewRepositoryObjective({objective,contract,tasks,ai:{models:{generateContent:async()=>response}}});
  assert.equal(result.proven,false);
 }
 const result=await reviewRepositoryObjective({objective:{...objective,resolvedScope:'Leer un archivo.'},contract,tasks,
  ai:{models:{generateContent:async()=>{throw Error('invalid scope must not reach inference');}}}});
 assert.equal(result.proven,false);
});
test('contradictory context file identities are rejected before semantic proof',async()=>{
 const bad=structuredClone(tasks);bad[0].observation.contextPreview.files=[{file:'a.js'}];
 const c={objective:'Preparar dos archivos.',resolvedScope:'Preparar dos archivos.',requiredEvidenceKind:'repository_search'};
 const result=await reviewRepositoryObjective({objective:{...c,evidenceTaskIndexes:[0]},contract:c,tasks:bad,
  ai:{models:{generateContent:async()=>{throw Error('inconsistent receipt must not reach inference');}}}});
 assert.equal(result.proven,false);assert.match(result.reason,/CONTEXT_FILE_IDENTITY/);
});
