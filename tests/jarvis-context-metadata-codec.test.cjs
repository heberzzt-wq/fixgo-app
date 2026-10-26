const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parse}=require('acorn');
const codec=require('../functions/jarvis-repository-audit-codec.cjs');
const fixture=require('./fixtures/jarvis-context-alias-budget.json');
const scopedState={modelContextTokens:8192,evidenceObjectives:[{resolvedScope:'Verify the requested sources.',requiredEvidenceKind:'repository_source'}]};
const source=fs.readFileSync(require.resolve('../functions/jarvis-semantic-planner.js'),'utf8');
const nodes=parse(source,{ecmaVersion:'latest'}).body;
function fn(name,context={}){const n=nodes.find(n=>n.id?.name===name);return vm.runInNewContext('('+source.slice(n.start,n.end)+')',context);}
const bounded=fn('boundedAuditTasks');
const planning=fn('planningAuditTasks',{boundedAuditTasks:bounded,require:require('node:module').createRequire(require.resolve('../functions/jarvis-semantic-planner.js'))});
test('real six-task context fits with exact reversible aliases and untouched source preview',()=>{
 const before=JSON.stringify(fixture);
 const packed=codec.packRepositoryContextMetadata(fixture);
 assert.deepEqual(codec.unpackRepositoryContextMetadata(packed),fixture);
 assert.equal(JSON.stringify(fixture),before);
 const view=planning(fixture,scopedState,{repositoryOnly:true});
 assert.ok(JSON.stringify(view).length<=12288);
 assert.equal(view[2].observation.contextPreview.excerpt,fixture[2].observation.contextPreview.excerpt);
 assert.equal(view[2].observation.contextPreview.independentlyCertified,false);
 assert.equal(view[2].observation.contextPreview.evidenceOnly,true);
 assert.equal(JSON.stringify(fixture),before);
});
test('context aliases preserve distinct values, absent keys, null and file order',()=>{
 for(const mutate of [t=>t.args.files.reverse(),t=>t.observation.files=['other.js'],t=>t.observation.sha256='different',t=>delete t.args.files,t=>t.args.files=null,t=>t.observation.sha256=null]){
  const tasks=structuredClone(fixture);mutate(tasks[2]);const before=JSON.stringify(tasks);
  assert.deepEqual(codec.unpackRepositoryContextMetadata(codec.packRepositoryContextMetadata(tasks)),tasks);
  assert.equal(JSON.stringify(tasks),before);
 }
});
test('context alias transport rejects malformed markers and contradictory target fields',()=>{
 const good=codec.packRepositoryContextMetadata(fixture);
 assert.ok(good[2].contextMetadataFromPreview);
 for(const mutate of [t=>t.contextMetadataFromPreview=['unknown'],t=>t.contextMetadataFromPreview=['a','a'],t=>t.contextMetadataFromPreview=null,t=>t.args.files=['contradiction'],t=>t.name='repo.read',t=>delete t.observation.contextPreview,t=>t.observation.contextPreview.files=[{}],t=>t.observation.contextPreview.sha256=null]){
  const bad=structuredClone(good);mutate(bad[2]);assert.throws(()=>codec.unpackRepositoryContextMetadata(bad),/CONTEXT_METADATA_TRANSPORT_INVALID/);
 }
 assert.equal(codec.packRepositoryContextMetadata(good),good,'do not overwrite a pre-existing marker');
});
test('continuation restores context args before metadata-only projection',()=>{
 const packed=codec.packRepositoryContextMetadata(fixture);
 const request={config:{chatMessages:packed.map(t=>({role:'system',content:'EVIDENCIA_OBTENIDA='+JSON.stringify(t)}))}};
 const before=JSON.stringify(request),result=codec.compactRepositoryContinuation(request);
 const context=JSON.parse(result.config.chatMessages[2].content.slice('EVIDENCIA_OBTENIDA='.length));
 assert.deepEqual(context.args,fixture[2].args);
 assert.deepEqual(context.observation.contextPreview.files,fixture[2].observation.contextPreview.files);
 assert.equal(context.observation.contextPreview.independentlyCertified,false);
 assert.equal(context.observation.contextPreview.evidenceOnly,true);
 assert.equal(JSON.stringify(request),before);
});
test('objective audit receives restored context identities without certification upgrades',async()=>{
 const task=structuredClone(fixture[2]);task.index=0;
 const packed=codec.packRepositoryContextMetadata([task]);
 const branch=s=>({properties:{objective:{enum:['Preparar contexto de dos fuentes']},requiredEvidenceKind:{enum:['repository_search']},evidenceTaskIndexes:{type:'array',items:{enum:[0]}},satisfied:{enum:[s]}}});
 const request={config:{chatMessages:[...packed.map(t=>({role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify(t)})),{role:'user',content:'Prepara contexto de dos fuentes.'}],responseJsonSchema:{properties:{completionAssessment:{properties:{objectives:{properties:{objective_0:{anyOf:[branch(false),branch(true)]}}}}},toolCalls:{type:'array',maxItems:0}}}}};
 let inspected=false;const before=JSON.stringify(request);
 await codec.generateRepositoryAudit({enabled:true,request,ai:{models:{generateContent:async r=>{
  if(r.config.semanticStage==='REPOSITORY_EVIDENCE_SELECTION')return {text:'{"objective_0":[0]}'};
  if(r.config.semanticStage==='REPOSITORY_OBJECTIVE_AUDIT'){
   const evidence=JSON.parse(r.config.chatMessages.find(m=>m.content.startsWith('OBSERVACION_EJECUTADA=')).content.slice('OBSERVACION_EJECUTADA='.length));
   assert.deepEqual(evidence.args,task.args);
   assert.deepEqual(evidence.observation,task.observation);
   assert.equal(Object.hasOwn(evidence,'contextMetadataFromPreview'),false);inspected=true;
   return {text:'{"s":false,"r":[0],"l":"Falta lectura completa."}'};
  }
  return {text:'{"toolCalls":[],"explanation":"Pendiente."}'};
 }}}});
 assert.equal(inspected,true);assert.equal(JSON.stringify(request),before);
});

test('context alias fallback is limited to low-memory repository-only audits',()=>{
 for(const [tokens,repositoryOnly]of [[8192,false],[16384,true],[16384,false]]) {
  let calls=0;
  const invoke=fn('planningAuditTasks',{boundedAuditTasks:()=>{calls++;throw Error('SEMANTIC_EVIDENCE_CONTEXT_BUDGET_EXCEEDED');},require:()=>({packGitCommitEvidence:t=>t,packRepositoryContextMetadata:()=>{throw Error('UNEXPECTED_ALIAS_ENCODING');}})});
  assert.throws(()=>invoke(fixture,{modelContextTokens:tokens},{repositoryOnly}),/SEMANTIC_EVIDENCE_CONTEXT_BUDGET_EXCEEDED/);
  assert.equal(calls,1);
 }
});
const codecSource=fs.readFileSync(require.resolve('../functions/jarvis-repository-audit-codec.cjs'),'utf8');
const decodeNode=parse(codecSource,{ecmaVersion:'latest'}).body.find(n=>n.id?.name==='decodeRepositoryTasks');
const decode=vm.runInNewContext('('+codecSource.slice(decodeNode.start,decodeNode.end)+')',{unpackRepositoryContextMetadata:codec.unpackRepositoryContextMetadata});
test('resolved transport metadata leaves source flags and identity local to decoded receipts',()=>{
 const encoded=[{name:'repo.gitHistory',args:{limit:8},sourceReadDefaults:{verifiedRead:{partial:true,truncated:true},dataBindings:{complete:false}},toolEvidenceKinds:{'repo.gitHistory':['repository_search'],'repo.read':['repository_source']},evidenceMetadataEncoding:'transport',sharedSourceSchemaEncoding:'not decoded',observation:{gitEvidence:{commits:[{sha:'a',subject:'actual'}]}}},
 {name:'repo.read',readArgs:['file','startLine'],args:{startLine:3},observation:{verifiedRead:{file:'real.js',startLine:1,sha256:'actual',partial:false,content:'unaltered source',sourceStructure:{dataBindings:{complete:true,sharedSourceSchemaTaskIndex:0}}}}}];
 const before=JSON.stringify(encoded),actual=JSON.parse(JSON.stringify(decode(encoded)));
 for(const key of ['sourceReadDefaults','toolEvidenceKinds','evidenceMetadataEncoding'])assert.equal(Object.hasOwn(actual[0],key),false);
 assert.equal(Object.hasOwn(actual[1],'readArgs'),false);
 assert.deepEqual(actual[0].observation,encoded[0].observation);
 assert.deepEqual(actual[1].args,{file:'real.js',startLine:3});
 assert.deepEqual(actual[1].allowedEvidenceKinds,['repository_source']);
 assert.equal(actual[1].observation.verifiedRead.partial,false);
 assert.equal(actual[1].observation.verifiedRead.truncated,true);
 assert.equal(actual[1].observation.verifiedRead.sourceStructure.dataBindings.complete,true);
 assert.equal(actual[1].observation.verifiedRead.sourceStructure.dataBindings.sharedSourceSchemaTaskIndex,0);
 assert.equal(actual[0].sharedSourceSchemaEncoding,'not decoded');
 assert.equal(actual[1].observation.verifiedRead.content,'unaltered source');
 assert.equal(actual[1].observation.verifiedRead.sha256,'actual');
 assert.equal(JSON.stringify(encoded),before);
});
test('unresolved transport metadata is retained instead of pretending it was decoded',()=>{
 for(const task of [{name:'repo.read',readArgs:['file'],observation:{}},{name:'repo.read',readArgs:['file','missing'],observation:{verifiedRead:{file:'a'}}},{name:'repo.gitHistory',sourceReadDefaults:{unknown:{partial:true}},evidenceMetadataEncoding:'unknown',observation:{}},{name:'repo.read',toolEvidenceKinds:null,evidenceMetadataEncoding:'unknown',observation:{}}]){
  const result=decode([task])[0];
  for(const key of ['readArgs','sourceReadDefaults','toolEvidenceKinds','evidenceMetadataEncoding'])if(Object.hasOwn(task,key))assert.deepEqual(JSON.parse(JSON.stringify(result[key])),task[key]);
 }
});
test('lossless sharing precedes source eviction and retains both complete tiny prepared files',()=>{
 const receipts=require('./fixtures/jarvis-source-retention-budget.json');const before=JSON.stringify(receipts);
 const view=planning(receipts,scopedState,{repositoryOnly:true});
 assert.ok(JSON.stringify(view).length<=12288);
 for(const index of [4,5]){
  const read=view[index].observation.verifiedRead,original=receipts[index].observation.verifiedRead;
  assert.equal(read.content,original.content);assert.equal(read.partial,false);assert.equal(read.contentTruncated,false);assert.equal(read.endLine,original.endLine);
 }
 assert.equal(view[2].observation.verifiedRead.partial,true,'partial package receipt must remain partial');
 assert.equal(JSON.stringify(receipts),before);
});
