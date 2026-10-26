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

test('independent proof applies one scoped evidence view and preserves explicit source truncation',async()=>{
 const sourceTasks=[{name:'repo.read',args:{file:'a.js'},observation:{ok:true,verifiedRead:{file:'a.js',sha256:'bound',startLine:1,endLine:3,totalLines:3,content:'one\ntwo\nthree',partial:false,truncated:false,contentTruncated:false}}},...tasks];
 const c={...contract,resolvedScope:'Explain the observed source.'},objective={...c,evidenceTaskIndexes:[0],scopeTaskIndexes:[0,1]};const before=JSON.stringify(sourceTasks);let seen,request;
 const result=await reviewRepositoryObjective({objective,contract:c,tasks:sourceTasks,evidenceView:input=>{seen=input;return input.map(t=>t.index!==0?t:{...t,observation:{...t.observation,verifiedRead:{...t.observation.verifiedRead,content:'one',endLine:1,partial:true,truncated:true,contentTruncated:true}}});},ai:{models:{generateContent:async r=>{request=r;return{text:'{"reason":"Only the visible statement is covered.","proven":false}'};}}}});
 assert.deepEqual(seen.map(t=>t.index),[0,1]);assert.equal(result.proven,false);const input=JSON.parse(request.contents);assert.equal(input.evidence[0].observation.verifiedRead.content,'one');assert.equal(input.evidence[0].observation.verifiedRead.partial,true);assert.equal(input.supportingEvidence[0].index,1);assert.equal(JSON.stringify(sourceTasks),before);
});
test('independent proof rejects malformed, expanded or missing evidence views before inference',async()=>{
 const sourceTasks=[{name:'repo.read',args:{file:'a.js'},observation:{ok:true,verifiedRead:{file:'a.js',sha256:'bound',startLine:1,endLine:3,totalLines:3,content:'one\ntwo\nthree',partial:false,truncated:false,contentTruncated:false}}}];
 const c={...contract},objective={...c,evidenceTaskIndexes:[0]};
 for(const mutate of [view=>[],view=>{view[0].index=1;return view;},view=>{view[0].args.file='other';return view;},view=>{view[0].observation.verifiedRead.sha256='other';return view;},view=>{view[0].observation.verifiedRead.content='invented';return view;},view=>{view[0].observation.verifiedRead.endLine=99;return view;},view=>{view[0].observation.verifiedRead.content='one';return view;},view=>{const r=view[0].observation.verifiedRead;r.content='';r.endLine=null;r.partial=r.truncated=r.contentTruncated=true;return view;}]){
  const result=await reviewRepositoryObjective({objective,contract:c,tasks:sourceTasks,evidenceView:view=>mutate(structuredClone(view)),ai:{models:{generateContent:async()=>{throw Error('invalid projection reached model');}}}});assert.equal(result.proven,false);assert.match(result.reason,/EVIDENCE_VIEW/);
 }
});

test('oversized supporting source is explicitly evicted without removing required cited evidence',async()=>{
 const c={objective:'Explain observed change',resolvedScope:'Explain observed change',requiredEvidenceKind:'repository_source'};
 const t=[{name:'repo.read',args:{file:'small.js'},observation:{ok:true,verifiedRead:{file:'small.js',startLine:1,endLine:1,totalLines:1,content:'actual',partial:false,truncated:false,contentTruncated:false}}},
 {name:'repo.read',args:{file:'large.js'},observation:{ok:true,verifiedRead:{file:'large.js',startLine:1,endLine:1000,totalLines:1000,content:'x'.repeat(100)+'\n'.repeat(1000),partial:false,truncated:false,contentTruncated:false}}}];
 t[1].observation.verifiedRead.content='line '.repeat(10000);const before=JSON.stringify(t);let calls=0;
 const result=await reviewRepositoryObjective({objective:{...c,evidenceTaskIndexes:[0],scopeTaskIndexes:[0,1]},contract:c,tasks:t,evidenceView:scope=>scope.map(entry=>entry.index===0?entry:{...entry,observation:{...entry.observation,verifiedRead:{...entry.observation.verifiedRead,content:'',endLine:null,partial:true,truncated:true,contentTruncated:true}}}),ai:{models:{generateContent:async request=>{calls++;assert.ok(request.contents.length<2000);const input=JSON.parse(request.contents);assert.equal(input.supportingEvidence[0].observation.verifiedRead.endLine,null);assert.equal(input.supportingEvidence[0].observation.verifiedRead.contentTruncated,true);assert.equal(input.evidence[0].observation.verifiedRead.content,'actual');return{text:'{"proven":false,"reason":"Supporting source omitted; scope remains unproven."}'};}}}});
 assert.equal(calls,1);assert.equal(result.proven,false);assert.equal(JSON.stringify(t),before);
 const denied=await reviewRepositoryObjective({objective:{...c,evidenceTaskIndexes:[0]},contract:c,tasks:t,evidenceView:()=>{throw Error('budget');},ai:{models:{generateContent:async()=>{throw Error('must not infer');}}}});assert.equal(denied.reason,'EVIDENCE_VIEW_UNAVAILABLE');
});

test('explicit context-to-read dependency rejects a missing file before a permissive model can approve',async()=>{
 const c={...contract,explicitTools:['repo.read'],scopeContext:'Usa repo.context para preparar dos archivos, y repo.read para verificar su contenido.'};
 for(const indexes of [[1],[2]]) {
  const result=await reviewRepositoryObjective({objective:{...c,evidenceTaskIndexes:indexes,scopeTaskIndexes:indexes},contract:c,tasks,
   ai:{models:{generateContent:async()=>{throw Error('missing prepared file reached semantic proof');}}}});
  assert.equal(result.proven,false);assert.equal(result.reason,'REQUIRED_CONTEXT_SOURCE_RECEIPT_MISSING');
 }
 let calls=0;
 const complete=await reviewRepositoryObjective({objective:{...c,evidenceTaskIndexes:[1,2],scopeTaskIndexes:[1,2]},contract:c,tasks,
  ai:{models:{generateContent:async()=>{calls++;return{text:'{"reason":"Both prepared files present.","proven":true}'};}}}});
 assert.equal(calls,1);assert.equal(complete.proven,true);
 const direct={...c,scopeContext:'Lee a.js mediante repo.read.'};
 const scoped=await reviewRepositoryObjective({objective:{...direct,evidenceTaskIndexes:[1]},contract:direct,tasks,
  ai:{models:{generateContent:async()=>({text:'{"reason":"Only a.js requested.","proven":true}'})}}});
 assert.equal(scoped.proven,true);
});
