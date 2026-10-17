import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import {parse} from 'acorn';
import {buildRepoIntelligence,rankRepoHybridCandidates} from '../jarvis-repo-intelligence.js';
import {analyzeRepoSourceStructure} from '../gestia-core/repo/repo.source.structure.js';
import {runJarvisMission,__test as missionHelpers} from '../gestia-core/jarvis/jarvis.mission.orchestrator.js';
import {completeJarvisPlanningArguments} from '../gestia-core/jarvis/jarvis.multifunction.planner.js';

const {runJarvisSemanticPlanner}=createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');
const root=fileURLToPath(new URL('..',import.meta.url));
const file='panel-tecnico.js';
const content=readFileSync(new URL('../'+file,import.meta.url),'utf8');
const sourceStructure=analyzeRepoSourceStructure(content);
const graph=buildRepoIntelligence({root});
// Keep the generated high-pressure case alongside the recorded Chrome case.
// Model decisions and operational storage are controlled external boundaries.
const receipt=JSON.parse(readFileSync(new URL('./fixtures/jarvis-context-budget-receipt.json',import.meta.url),'utf8'));
const sixTaskRequest=JSON.parse(readFileSync(new URL('./fixtures/jarvis-context-six-task-request.json',import.meta.url),'utf8')).request;
const selected=[file,'jarvis-fs-bridge.js','gestia-core/jarvis/jarvis.mission.orchestrator.js',
 'app-tecnico-b2b.js','ceo-daily-operations.js','panel-admin.js','panel-b2b-admin.js','panel-supervisor-b2b.js'];
const ranking=rankRepoHybridCandidates({graph,plannedFiles:selected,limit:8});
assert.equal(ranking.candidates.length,8);
const query='vehículos motos registros asignación documentos vencidos';
const repositoryTarget={kind:'local',provider:'local',owner:null,repository:null,ref:'fixture-branch',
 commit:'9dcbd99e268ab75e86f2bd49eea1c175c8e5e61c',path:root,objectType:'directory'};
const semanticEvidence={provider:'ollama-local',model:'qwen3-embedding:0.6b',queryEmbedded:true,
 documentsConsidered:graph.summary.nodes,documentsEmbedded:160,semanticPoolLimit:160,
 preselection:'query_structural_overlap_then_local_embedding',exactStructuralMatches:[],
 cacheHits:160,cacheMisses:0,externalApiUsed:false,estimatedExternalCostUsd:0};
const readPayload={file,startLine:1,endLine:content.split('\n').length,totalLines:content.split('\n').length,
 content,numberedContent:content.split('\n').map((line,index)=>`${index+1}: ${line}`).join('\n'),sourceStructure};
function searchPayload(candidates=ranking.candidates){
 // tools.runtime.js returns both names; safeObservation also retains its
 // compact discovery summary. Those are aliases, not three different results.
 return {ok:true,success:true,status:'REPO_SEMANTIC_SEARCH_READY',query,term:query,
  results:structuredClone(candidates),candidates:structuredClone(candidates),totalResults:candidates.length,
  totalMatches:candidates.length,totalFilesScanned:graph.summary.filesScanned,semanticEvidence,repositoryTarget,
  scoring:ranking.scoring,source:ranking.source,tool:'repo.search'};
}
function observations(candidates=ranking.candidates){
 return [{name:'repo.search',args:{query},observation:missionHelpers.safeObservation({ok:true,data:searchPayload(candidates)})},
  {name:'repo.read',args:{file},observation:missionHelpers.safeObservation({ok:true,data:readPayload})}];
}
const plannerSource=readFileSync(new URL('../functions/jarvis-semantic-planner.js',import.meta.url),'utf8');
const compactNode=parse(plannerSource,{sourceType:'script',ecmaVersion:'latest'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='boundedAuditTasks');
const compact=runInNewContext('('+plannerSource.slice(compactNode.start,compactNode.end)+')');
const plain=value=>JSON.parse(JSON.stringify(value));
function decodedObservation(packet,index){
 const result=plain(packet[index].observation),evidence=result.evidence;
 if(evidence?.candidateEncoding){
  evidence.candidates=evidence.candidates.map(row=>Object.fromEntries(evidence.candidateColumns.map((key,column)=>{
   const keys=Object.hasOwn(evidence.candidateObjectColumns,key)?evidence.candidateObjectColumns[key]:null,cell=row[column];
   return[key,keys?Object.fromEntries(keys.map((field,index)=>[field,cell[index]])):cell];
  })));
  delete evidence.candidateColumns;delete evidence.candidateObjectColumns;delete evidence.candidateEncoding;
 }
 return result;
}
function decodedFields(packet,bindings){
 if(bindings.fieldPaths)return plain(bindings.fieldPaths);
 if(bindings.fieldPathDictionary){
  const {prefix,suffix,members,integerRange}=bindings.fieldPathDictionary;
  return (members||Array.from({length:integerRange[1]-integerRange[0]+1},(_,i)=>String(integerRange[0]+i))).map(member=>prefix+member+suffix);
 }
 let dictionary=packet[0].sharedFieldDictionary;
 if(packet[0].sharedFieldPrefixEncoding){
  const entries=typeof dictionary==='string'?dictionary.split('|').map(entry=>{const i=entry.indexOf(':');return[Number(entry.slice(0,i)),entry.slice(i+1)];}):dictionary;
  dictionary=[];for(const [prefix,suffix]of entries)dictionary.push((dictionary.at(-1)||'').slice(0,prefix)+suffix);
 }else if(typeof dictionary==='string')dictionary=dictionary.split('|');
 return Array.from(bindings.fieldIds||bindings.pathIds).flatMap(id=>Array.isArray(id)?Array.from({length:id[1]-id[0]+1},(_,i)=>dictionary[id[0]+i]):[dictionary[id]]);
}

test('adaptive receipt budgets retain latest source, every scoped record and credited field',()=>{
 const tasks=observations(ranking.candidates.slice(0,2));
 for(const organization of ['approved','separate'])tasks.splice(tasks.length-1,0,{name:'platform.query',args:{collection:`organizations/${organization}/entries`},observation:{ok:true,executionOk:true,recordEvidence:{
  source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{collection:`organizations/${organization}/entries`,sourceFile:file,mode:'query',fields:['holder','deadline'],filters:[],orderBy:[],cursor:null},
  rows:[{id:'same-local-id',values:{holder:organization,deadline:organization==='approved'?null:'2027-01-01'}}],returnedCount:1,totalCount:1,hasMore:false,queryExhausted:true,completeForQuery:true,
  observedAt:'2026-10-17T00:00:00Z'
 }}});
 const before=JSON.stringify(tasks);
 for(const budget of [18000,22000]){
  const packet=compact(tasks,budget);
  assert.ok(JSON.stringify(packet).length<=budget,'the caller must budget the entire request before assigning receipt capacity');
  for(const index of [1,2])assert.deepEqual(plain(packet[index].observation.recordEvidence),tasks[index].observation.recordEvidence,'organization, exact query, timestamps, rows, null and completeness remain local');
  const read=packet.at(-1).observation.verifiedRead;
  assert.equal(read.file,file);assert.ok(read.content.length>=700);assert.ok(content.startsWith(read.content),'retain the latest actual source window');
  assert.equal(read.totalLines,tasks.at(-1).observation.verifiedRead.totalLines,'retain the physical source extent when its body is evicted');
  assert.equal(read.readEndLine,tasks.at(-1).observation.verifiedRead.readEndLine,'retain the original requested read extent separately from the compact window');
  assert.deepEqual(decodedFields(packet,read.sourceStructure.dataBindings),sourceStructure.dataBindings.fieldPaths);
 }
 assert.equal(JSON.stringify(tasks),before,'compaction must leave durable receipts intact');
});

test('real source read and search metadata fit the existing evidence budget without losing provenance',()=>{
 const tasks=observations(),before=JSON.stringify(tasks);
 const result=compact(tasks);
 assert.ok(JSON.stringify(result).length<=28000);
 assert.equal(JSON.stringify(tasks),before,'transport must not alter durable observations');
 assert.equal(result.length,tasks.length);
 const search=result[0].observation,original=tasks[0].observation;
 assert.deepEqual(plain(search.evidence.candidates),original.evidence.candidates,'retain each candidate and all its metadata');
 assert.deepEqual(plain(search.repoCandidates.map(({file})=>file)),original.repoCandidates.map(({file})=>file),'retain every discovery location');
 for(const candidate of original.repoCandidates){
  const retained=search.evidence.candidates.find(item=>item.file===candidate.file);
  for(const [key,value] of Object.entries(candidate)){
   if(Array.isArray(value))assert.ok(value.every(item=>retained[key].includes(item)),'retain the discovery summary in the full candidate');
   else assert.deepEqual(plain(retained[key]),value,'retain discovery metadata in the full candidate');
  }
 }
 assert.deepEqual(plain(search.evidence.repositoryTarget),original.evidence.repositoryTarget);
 assert.deepEqual(plain(search.evidence.semanticEvidence),semanticEvidence);
 const read=result[1].observation.verifiedRead,bindings=read.sourceStructure.dataBindings;
 assert.equal(read.file,file);assert.equal(bindings.source,'ACORN_SOURCE_REFERENCES');
 assert.deepEqual(plain(bindings.collections),sourceStructure.dataBindings.collections);
 assert.deepEqual(decodedFields(result,bindings),sourceStructure.dataBindings.fieldPaths);
 assert.deepEqual(bindings.writeShapes.map(shape=>[shape.collection,shape.fields||decodedFields(result,{fieldIds:shape.fieldIds})]).map(plain),
  sourceStructure.dataBindings.writeShapes.map(shape=>[shape.collection,shape.fields]));
 assert.deepEqual(bindings.queryShapes.map(shape=>[shape.collection,plain(shape.fields)]).map(plain),
  sourceStructure.dataBindings.queryShapes.map(shape=>[shape.collection,shape.fields]));
 assert.ok(read.content.length>=700,'retain an actual source window for follow-up reading');
});

test('different result arrays retain their distinct metadata under context pressure',()=>{
 const tasks=observations(ranking.candidates.slice(0,2));
 tasks[0].observation.evidence.results[0].score++;
 const before=JSON.stringify(tasks),result=compact(tasks);
 assert.deepEqual(plain(result[0].observation.evidence.results),tasks[0].observation.evidence.results);
 assert.deepEqual(plain(result[0].observation.evidence.candidates),tasks[0].observation.evidence.candidates);
 assert.equal(JSON.stringify(tasks),before);
});

test('search alias compression preserves authenticated organization scopes and field authority',()=>{
 const tasks=observations(ranking.candidates.slice(0,2));
 for(const tenant of ['approved','separate'])tasks.push({name:'platform.query',args:{collection:`tenants/${tenant}/entries`},observation:{ok:true,executionOk:true,recordEvidence:{
  source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{collection:`tenants/${tenant}/entries`,mode:'query',sourceFile:'registry.js',fields:['stamp'],filters:[]},
  rows:[{id:'same-id',values:{stamp:tenant==='approved'?'2026-10-15':'2026-11-15'}}],returnedCount:1,totalCount:1,hasMore:false,completeForQuery:true,
  fieldSchema:{source:'SERVER_RECORD_FIELD_NAMES',collection:`tenants/${tenant}/entries`,scope:'returned_rows_only',paths:['stamp'],complete:true}
 }}});
 const before=JSON.stringify(tasks),result=compact(tasks);
 for(const index of [2,3]){
  const retained=plain(result[index].observation.recordEvidence);
  if(retained.fieldSchema.pathIds){retained.fieldSchema.paths=decodedFields(result,retained.fieldSchema);delete retained.fieldSchema.pathIds;}
  assert.deepEqual(retained,tasks[index].observation.recordEvidence);
 }
 assert.equal(JSON.stringify(tasks),before);
});

test('recorded Chrome search aliases fit without changing candidates, schemas or durable observations',()=>{
 const tasks=structuredClone(receipt.tasks),before=JSON.stringify(tasks),packet=compact(tasks);
 assert.ok(JSON.stringify(packet).length<=28000);
 assert.equal(JSON.stringify(tasks),before);
 const search=packet[0].observation.evidence;
 assert.equal(search.resultsSameAsCandidates,true);
 assert.match(search.resultsEncoding,/discovery evidence, not source schema or operational records/);
 assert.deepEqual(plain(search.candidates),tasks[0].observation.evidence.candidates);
 assert.deepEqual(plain(search.repositoryTarget),tasks[0].observation.evidence.repositoryTarget);
 assert.deepEqual(plain(search.semanticEvidence),tasks[0].observation.evidence.semanticEvidence);
 const bindings=packet[1].observation.verifiedRead.sourceStructure.dataBindings;
 const original=tasks[1].observation.verifiedRead.sourceStructure.dataBindings;
 assert.deepEqual(decodedFields(packet,bindings),original.fieldPaths);
 assert.deepEqual(plain(bindings.collections),original.collections);
 assert.deepEqual(plain(bindings.queryShapes),original.queryShapes);
 assert.deepEqual(plain(bindings.writeShapes),original.writeShapes.map(({collection,fields,fieldsComplete})=>({collection,fields,fieldsComplete})));
});

test('distinct search arrays and existing encoding claims are never replaced by an alias',()=>{
 for(const reserved of [null,'resultsSameAsCandidates','resultsEncoding']){
  const tasks=structuredClone(receipt.tasks);
  // Keep the real search envelope while avoiding unrelated schema pressure.
  tasks.splice(1);
  if(reserved)tasks[0].observation.evidence[reserved]='original marker';
  else tasks[0].observation.evidence.results[0].score++;
  const before=JSON.stringify(tasks),packet=compact(tasks);
  assert.deepEqual(plain(packet[0].observation.evidence.results),tasks[0].observation.evidence.results);
  assert.deepEqual(plain(packet[0].observation.evidence.candidates),tasks[0].observation.evidence.candidates);
  if(reserved)assert.equal(packet[0].observation.evidence[reserved],'original marker');
  assert.equal(JSON.stringify(tasks),before);
 }
});

test('complete six-task Chrome request reaches argument completion within the unchanged budget',async()=>{
 const tasks=structuredClone(sixTaskRequest.missionState.completedTasks),before=JSON.stringify(tasks);
 const packet=compact(tasks);
 assert.ok(JSON.stringify(packet).length<=28000);
 assert.equal(JSON.stringify(tasks),before);
 for(const index of [0,2,3]){
  const restored=decodedObservation(packet,index),raw=tasks[index].observation;
  for(const key of ['ok','executionOk','requiresApproval','error','inventoryEvidence'])
   if(Object.hasOwn(raw,key))assert.deepEqual(restored[key],raw[key]);
  assert.deepEqual(restored.evidence.candidates,raw.evidence.candidates);
  assert.deepEqual(restored.evidence.matches,raw.evidence.matches);
  assert.deepEqual(restored.evidence.repositoryTarget,raw.evidence.repositoryTarget);
 }
 const grep=decodedObservation(packet,3);
 assert.deepEqual(grep.repositoryMatches,tasks[3].observation.repositoryMatches.map(({snippet,...location})=>location));
 let calls=0;
 await assert.rejects(runJarvisSemanticPlanner({...sixTaskRequest,ai:{models:{generateContent:async request=>{
  calls++;assert.equal(request.config.semanticStage,'GROUNDED_ARGUMENT_COMPLETION');
  const messages=request.config.chatMessages;
  assert.ok(messages.every(message=>message.content.length<=60000),'each complete message must fit the unchanged local bridge limit');
  assert.ok(messages.reduce((total,message)=>total+message.content.length,0)<=60000,'all messages, not only the evidence block, must fit the unchanged local context limit');
  assert.ok(messages.some(message=>message.content.includes(sixTaskRequest.input.trim())),'the complete immutable instruction and its source briefing must remain present');
  // Record argument completion may decline a query when source evidence is
  // missing. Restoring only the old minimum and removing exactly sixteen
  // count-field restrictions must reproduce the captured grammar unchanged.
  const nativeGrammar=request.config.responseJsonSchema,previousGrammar=structuredClone(nativeGrammar);
  assert.equal(nativeGrammar.properties.toolCalls.minItems,0);
  previousGrammar.properties.toolCalls.minItems=1;
  const originalGrammar=structuredClone(previousGrammar);
  let countRestrictions=0;
  for(const branch of originalGrammar.properties.toolCalls.items.properties.args.anyOf){
   if(branch.properties.fields?.maxItems!==0)continue;
   for(const key of ['filters','orderBy']){
    const field=branch.properties[key]?.items?.properties?.field;
    if(Array.isArray(field?.enum)){delete field.enum;countRestrictions++;}
   }
  }
  assert.equal(countRestrictions,16);
  assert.equal(createHash('sha256').update(JSON.stringify(originalGrammar)).digest('hex'),
   'ab806fd9990ec628af6451d2499be33f1c0116f4eb5241225f6c8e8652bbf54f');
  assert.equal(createHash('sha256').update(JSON.stringify(previousGrammar)).digest('hex'),
   'd729a75068c0e74b1a62053a4d55ff68e6685c8ccdfdef1045dbbc8c164bbc63');
  throw Error('RECORDED_REQUEST_REACHED_MODEL');
 }}}}),/RECORDED_REQUEST_REACHED_MODEL/);
 assert.equal(calls,2,'the existing two phase attempts reach the controlled model boundary');
});

test('candidate packing refuses conflicting encodings and preserves distinct object shapes',()=>{
 for(const key of ['candidateColumns','candidateObjectColumns','candidateEncoding']){
  const tasks=structuredClone(sixTaskRequest.missionState.completedTasks);
  tasks[0].observation.evidence[key]='original marker';
  const before=JSON.stringify(tasks);
  assert.throws(()=>compact(tasks),/SEMANTIC_EVIDENCE_CONTEXT_BUDGET_EXCEEDED/);
  assert.equal(JSON.stringify(tasks),before);
 }
 const tasks=structuredClone(sixTaskRequest.missionState.completedTasks);
 const first=tasks[0].observation.evidence;
 first.candidates[0].distinct=null;first.results=structuredClone(first.candidates);
 const before=JSON.stringify(tasks);
 assert.throws(()=>compact(tasks),/SEMANTIC_EVIDENCE_CONTEXT_BUDGET_EXCEEDED/);
 assert.equal(JSON.stringify(tasks),before);
});

test('six recorded tool envelopes traverse orchestrator argument completion and retain a terminal denial',async()=>{
 const tasks=sixTaskRequest.missionState.completedTasks;
 const operational=structuredClone(sixTaskRequest.catalog[0]);
 const readers=[{name:'repo.search',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},
  {name:'repo.read',inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},
  {name:'repo.audit',inputSchema:{type:'object',properties:{}}},
  {name:'repo.grep',inputSchema:{type:'object',properties:{pattern:{type:'string'}},required:['pattern']}}]
  .map(tool=>({...tool,mutates:false,investigationReadOnly:true,evidenceKinds:[tool.name==='repo.read'?'repository_source':'repository_search']}));
 const catalog=[...readers,operational],executed=[],stages=[];
 const args={sourceFile:'gestia-core/operations-executor.engine.js',collection:'flotilla_b2b/{tenantId}/vehiculos',mode:'count',fields:[],filters:[]};
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  stages.push(request.config.semanticStage);
  if(request.config.semanticStage==='GROUNDED_ARGUMENT_COMPLETION'){
   assert.ok(request.config.chatMessages.reduce((total,message)=>total+message.content.length,0)<=60000,
    'orchestrator argument completion must fit the complete local message budget');
   return{text:JSON.stringify({toolCalls:[{name:'platform.query',args}],missionComplete:false})};
  }
  assert.equal(request.config.semanticStage,'EVIDENCE_NEXT_ACTION');
  return{text:'{"toolCalls":[]}'};
 }}};
 const result=await runJarvisMission({instruction:sixTaskRequest.input,
  initialEvidenceObjectives:sixTaskRequest.missionState.evidenceObjectives,
  initialToolCalls:[...tasks.map(({name,args})=>({name,args})),{name:'platform.query',args}],toolCatalog:catalog,
  execute:async(call,context)=>{
   const index=executed.length;executed.push(call.name);
   if(index<tasks.length){
    assert.equal(call.name,tasks[index].name);
    return{ok:true,data:structuredClone(tasks[index].observation.evidence)};
   }
   assert.equal(call.name,'platform.query');
   const completed=await completeJarvisPlanningArguments({toolName:operational.name,inputSchema:operational.inputSchema,toolContract:operational,
    instruction:context.rawInput,currentArgs:call.args,completedTasks:context.completedTasks,blockedTasks:context.blockedTasks,
    evidenceObjectives:context.evidenceObjectives,semanticPlanner:request=>runJarvisSemanticPlanner({...request,ai})});
   assert.deepEqual(completed.args,args);
   return{ok:false,blocked:true,status:'PERMISSION_DENIED',error:'PERMISSION_DENIED'};
  },planner:async({mission})=>runJarvisSemanticPlanner({input:mission.originalInstruction,catalog,
   missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai}),
  storage:{getItem(){return null;},setItem(){},removeItem(){}}});
 assert.deepEqual(executed,[...tasks.map(task=>task.name),'platform.query']);
 assert.equal(stages.filter(stage=>stage==='GROUNDED_ARGUMENT_COMPLETION').length,1);
 assert.ok(!JSON.stringify(result).includes('SEMANTIC_EVIDENCE_CONTEXT_BUDGET_EXCEEDED'));
 assert.equal(result.status,'PARTIAL');
 assert.ok(JSON.stringify(result.blockedTasks).includes('PERMISSION_DENIED'));
 assert.equal(result.completionAssessment.objectives.length,3);
 assert.ok(result.completionAssessment.objectives.every(objective=>objective.satisfied===false));
});

test('recorded search and rehydrated read reach argument completion inside the mission loop',async()=>{
 assert.equal(createHash('sha256').update(content).digest('hex'),receipt.provenance.sourceSha256,'the rehydrated source must be the exact recorded source');
 const catalog=[{name:'repo.search',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_search'],inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},
  {name:'repo.read',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_source'],inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},
  {name:'platform.query',investigationReadOnly:true,mutates:false,evidenceKinds:['platform_records'],requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string'},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}}];
 const discovered=receipt.tasks[0].observation.evidence.candidates[1].file;
 const stages=[],executed=[];
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;stages.push(stage);
  if(stage==='GROUNDED_ARGUMENT_COMPLETION'){
   const message=request.config.chatMessages.find(message=>message.content.includes('TAREAS_YA_OBSERVADAS='));
   assert.ok(message?.content.includes('resultsSameAsCandidates'),'deferred argument completion must use the compact recorded search envelope');
   return{text:JSON.stringify({toolCalls:[{name:'repo.read',args:{file:discovered}}],missionComplete:false})};
  }
  assert.equal(stage,'EVIDENCE_NEXT_ACTION');
  return{text:JSON.stringify({toolCalls:executed.length===2?[{name:'repo.read',args:{file:discovered}}]:[]})};
 }}};
 const result=await runJarvisMission({instruction:receipt.instruction,initialEvidenceObjectives:receipt.objectives,
  initialToolCalls:receipt.tasks.map(({name,args})=>({name,args})),toolCatalog:catalog,
  execute:async(call,context)=>{
   if(executed.length===2){
    const tool=catalog.find(tool=>tool.name===call.name);
    const completed=await completeJarvisPlanningArguments({toolName:tool.name,inputSchema:tool.inputSchema,toolContract:tool,
     instruction:context.rawInput,currentArgs:call.args,completedTasks:context.completedTasks,blockedTasks:context.blockedTasks,
     evidenceObjectives:context.evidenceObjectives,semanticPlanner:request=>runJarvisSemanticPlanner({...request,ai})});
    assert.equal(completed.args.file,discovered);
   }
   executed.push(call.name);
   if(call.name==='repo.search')return{ok:true,data:structuredClone(receipt.tasks[0].observation.evidence)};
   assert.equal(call.name,'repo.read','a discovered source never authorizes an operational query');
   if(call.args.file===file)return{ok:true,data:readPayload};
   const source=readFileSync(new URL('../'+call.args.file,import.meta.url),'utf8');
   return{ok:true,data:{file:call.args.file,content:source,startLine:1,endLine:source.split('\n').length,totalLines:source.split('\n').length,sourceStructure:analyzeRepoSourceStructure(source)}};
  },planner:async({mission})=>runJarvisSemanticPlanner({input:mission.originalInstruction,catalog,missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai}),
  storage:{getItem(){return null;},setItem(){},removeItem(){}}});
 assert.deepEqual(executed,['repo.search','repo.read','repo.read'],JSON.stringify({stages,reason:result.reason,errors:result.errors,blocked:result.blockedTasks}));
 assert.equal(stages.filter(stage=>stage==='GROUNDED_ARGUMENT_COMPLETION').length,1);
 assert.ok(!JSON.stringify(result.errors).includes('SEMANTIC_EVIDENCE_CONTEXT_BUDGET_EXCEEDED'));
 assert.equal(result.status,'PARTIAL');assert.equal(result.reason,'PLANNER_NO_GROUNDED_ACTION');
 assert.deepEqual(result.completionAssessment.objectives.map(o=>[o.objective,o.satisfied]),receipt.objectives.map(o=>[o.objective,false]));
});

test('search then real panel read reaches the planner inside the mission loop instead of budget failure',async()=>{
 const goals=[['Count registered units','population'],['Identify assigned holders','relationship'],['Inspect document deadlines','temporal']]
  .map(([objective,coverageMode])=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode,scope:'all_sources',groups:['entries']}));
 const catalog=[{name:'repo.search',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_search'],inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},
  {name:'repo.read',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_source'],inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},
  {name:'platform.query',investigationReadOnly:true,mutates:false,evidenceKinds:['platform_records'],requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string'},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}}];
 const stages=[],executed=[];
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  stages.push(request.config.semanticStage);
  assert.equal(request.config.semanticStage,'EVIDENCE_NEXT_ACTION');
  return{text:'{"toolCalls":[]}'};
 }}};
 const result=await runJarvisMission({instruction:'Inspect registered units, assigned holders and document deadlines without changes.',
  initialEvidenceObjectives:goals,initialToolCalls:[{name:'repo.search',args:{query}},{name:'repo.read',args:{file}}],toolCatalog:catalog,
  execute:async call=>{executed.push(call.name);return{ok:true,data:call.name==='repo.search'?searchPayload():readPayload};},
  planner:async({mission})=>runJarvisSemanticPlanner({input:mission.originalInstruction,catalog,
   missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai}),
  storage:{getItem(){return null;},setItem(){},removeItem(){}}});
 assert.ok(stages.length>0,'context preparation must reach the model after search and read');
 assert.deepEqual(executed,['repo.search','repo.read']);
 assert.ok(!JSON.stringify(result.errors).includes('SEMANTIC_EVIDENCE_CONTEXT_BUDGET_EXCEEDED'));
 assert.equal(result.status,'PARTIAL');assert.equal(result.reason,'PLANNER_NO_GROUNDED_ACTION');
 assert.deepEqual(result.completionAssessment.objectives.map(o=>[o.objective,o.satisfied]),goals.map(o=>[o.objective,false]));
});
