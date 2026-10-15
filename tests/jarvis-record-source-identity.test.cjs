"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {qualifyRecordObjectiveCoverage:qualify,eligibleEvidenceActionCatalog,runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner');

function fixture(){
 const template='workspaces/{workspaceId}/entries',resolved='workspaces/alpha/entries',file='registry.js';
 const tasks=[{name:'repo.read',observation:{ok:true,verifiedRead:{file,sourceStructure:{dataBindings:{collections:[template]}}}}},
  {name:'platform.query',args:{sourceFile:file,collection:template},observation:{ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,
   scope:{sourceFile:file,collection:resolved,mode:'query',fields:['kind'],filters:[],orderBy:[{field:'__name__',direction:'asc'}]},
   totalCount:1,returnedCount:1,rows:[{id:'a',values:{kind:'entry'}}],hasMore:false,queryExhausted:true,completeForQuery:true}}}];
 const contract={objective:'Count entries',requestQuote:'Count entries',coverageMode:'population',scope:'all_sources',groups:['entries']};
 const objective={objective:contract.objective,evidenceTaskIndexes:[1],coverageProof:{proven:true,missing:[],groups:[{group:'entries',proven:true,evidence:[{taskIndex:1,fields:['kind']}]}],
  sources:[template,resolved].map(collection=>({collection,relevant:true,reason:'Authenticated query of this exact source',taskIndexes:[1]}))}};
 return {tasks,contract,objective,template,resolved};
}

test('coverage recognizes only a template actually resolved by its cited authenticated query',()=>{
 const f=fixture();
 assert.equal(qualify(f.objective,f.contract,f.tasks).status,'complete');
 for(const change of [
  x=>{x.tasks[1].args.collection='workspaces/beta/entries';},
  x=>{x.tasks[1].args.sourceFile='different.js';},
  x=>{x.tasks[1].observation.recordEvidence.scope.collection='other/alpha/entries';}
 ]){const x=fixture();change(x);assert.equal(qualify(x.objective,x.contract,x.tasks).status,'partial');}
});

test('resolving one template does not cover another observed instance or credit an exhausted query as a goal',()=>{
 const f=fixture();
 f.tasks[0].observation.verifiedRead.sourceStructure.dataBindings.collections.push('workspaces/beta/entries');
 f.tasks.push({...structuredClone(f.tasks[1]),args:{sourceFile:'registry.js',collection:'workspaces/beta/entries'},observation:{ok:true,recordEvidence:{...structuredClone(f.tasks[1].observation.recordEvidence),scope:{...f.tasks[1].observation.recordEvidence.scope,collection:'workspaces/beta/entries'}}}});
 assert.equal(qualify(f.objective,f.contract,f.tasks).status,'partial');
 const empty=fixture();empty.tasks[1].observation.recordEvidence.rows=[];empty.tasks[1].observation.recordEvidence.returnedCount=0;empty.tasks[1].observation.recordEvidence.totalCount=0;
 empty.objective.coverageProof.proven=false;empty.objective.coverageProof.groups[0].proven=false;
 assert.equal(qualify(empty.objective,empty.contract,empty.tasks).status,'partial');
});

test('engine-reviewed irrelevance removes a query only when every objective excludes its route',()=>{
 const tool={name:'platform.query',evidenceKinds:['platform_records'],inputSchema:{type:'object',properties:{sourceFile:{type:'string',enum:['registry.js']},collection:{type:'string',enum:['entries','accounts']}},required:['sourceFile','collection']}};
 const read={name:'repo.read',evidenceKinds:['repository_source'],inputSchema:{type:'object',properties:{file:{type:'string',enum:['next.js']}}}};
 const tasks=[{name:'platform.query',args:{collection:'accounts'},observation:{ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{collection:'accounts'},rows:[{id:'a',values:{label:'A'}}]}}}];
 const proof={sources:[{collection:'accounts',relevant:false,reason:'Not a source for this objective'}]};
 const allowed=proofs=>eligibleEvidenceActionCatalog([tool,read],tasks,[],[tool,read],proofs);
 assert.deepEqual(allowed([proof,structuredClone(proof)])[0].inputSchema.properties.collection.enum,['entries']);
 assert.equal(allowed([proof,structuredClone(proof)])[1].name,'repo.read');
 for(const other of [{sources:[]},{sources:[{collection:'accounts',relevant:null,reason:'Unknown'}]},{sources:[{collection:'accounts',relevant:true,reason:'Needed'}]}])
  assert.deepEqual(allowed([proof,other])[0].inputSchema.properties.collection.enum,['entries','accounts']);
 assert.deepEqual(allowed([])[0].inputSchema.properties.collection.enum,['entries','accounts']);
});

test('pending coverage with new records or schema preserves a valid investigation without independent negative replanning',async()=>{
 for(const coverageMode of ['relationship','temporal'])for(const discovery of ['records','schema']){
  const contract={objective:'Verify requested values',requestQuote:'Verify requested values',requiredEvidenceKind:'platform_records',coverageMode,scope:'all_sources',groups:['values']};
  const proof={proven:false,missing:['Related source remains pending'],groups:[{group:'values',proven:false,evidence:[]}],sources:[{collection:'primary',relevant:true,reason:'Observed values',taskIndexes:[0]},{collection:'related',relevant:true,reason:'Read related values',taskIndexes:[]}]};
  const records={name:'fixture.records',evidenceKinds:['platform_records'],investigationReadOnly:true,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{collection:{type:'string'},sourceFile:{type:'string'}}}};
  const reader={name:'fixture.source',evidenceKinds:['repository_source'],investigationReadOnly:true,inputSchema:{type:'object',properties:{file:{type:'string',enum:['pending.js']}},required:['file']}};
  const tasks=[{name:records.name,args:{collection:'primary'},observation:{ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{collection:'primary',fields:['label']},rows:[{id:'one',values:{label:'Observed'}}],totalCount:1,completeForQuery:true,hasMore:false}}}];
  tasks.push(discovery==='records'?{...structuredClone(tasks[0]),args:{collection:'related'},observation:{ok:true,recordEvidence:{...structuredClone(tasks[0].observation.recordEvidence),scope:{collection:'related',fields:['label']}}}}:
   {name:'repo.read',observation:{ok:true,verifiedRead:{file:'observed.js',content:'Observed related schema',sourceStructure:{dataBindings:{collections:['primary','related']}}}}});
  const previous={evaluatedTaskCount:1,objectives:[{objective:contract.objective,requiredEvidenceKind:'platform_records',satisfied:false,evidenceTaskIndexes:[0],coverageProof:proof}]};
  const before=JSON.stringify(previous),calls=[];
  const result=await runJarvisSemanticPlanner({input:contract.objective,catalog:[records,reader],missionState:{phase:'COMPLETION_AUDIT',missionId:'pending-'+coverageMode+'-'+discovery,evidenceObjectives:[contract],completionAssessment:previous,completedTasks:tasks},ai:{objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
   calls.push(request.config.semanticStage);
   assert.equal(request.config.semanticStage,'COMPLETION_AUDIT','a pending verdict and a valid next action do not need a separate negative review');
   return {text:JSON.stringify({completionAssessment:{objectives:[{objective:contract.objective,requiredEvidenceKind:'platform_records',satisfied:false,evidenceTaskIndexes:[0],limitation:'Continue the related source'}]},toolCalls:[{name:reader.name,args:{file:'pending.js'}}]})};
  }}}});
  assert.deepEqual(calls,['COMPLETION_AUDIT']);assert.equal(result.missionComplete,false);
  assert.equal(result.completionAssessment.objectives[0].satisfied,false);
  assert.deepEqual(result.toolCalls.map(call=>({name:call.name,args:call.args})),[{name:reader.name,args:{file:'pending.js'}}]);
  assert.equal(JSON.stringify(previous),before);
 }
});

test('a success claim or attempted stop still independently reviews every pending objective',async()=>{
 for(const claimSuccess of [false,true]){
  const f=fixture();f.tasks[0].observation.repoCandidates=[{file:'pending.js'}];
  f.tasks[0].observation.verifiedRead.sourceStructure.dataBindings.collections.push('related');
  const proof={...f.objective.coverageProof,proven:false,missing:['Related source remains unqueried'],sources:[...f.objective.coverageProof.sources,{collection:'related',relevant:true,reason:'Related entries',taskIndexes:[]}]};
  const records={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'}}}};
  const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,inputSchema:{type:'object',properties:{file:{type:'string',enum:['pending.js']}},required:['file']}};
  let reviews=0;
  const result=await runJarvisSemanticPlanner({input:f.contract.objective,catalog:[records,reader],missionState:{phase:'COMPLETION_AUDIT',evidenceObjectives:[{...f.contract,requiredEvidenceKind:'platform_records'}],completedTasks:f.tasks},ai:{models:{generateContent:async request=>{
   const stage=request.config.semanticStage;
   if(stage==='COMPLETION_AUDIT')return{text:JSON.stringify({completionAssessment:{objectives:[{objective:f.contract.objective,requiredEvidenceKind:'platform_records',satisfied:claimSuccess,evidenceTaskIndexes:[1],limitation:claimSuccess?'':'Related source missing'}]},toolCalls:[]})};
   if(stage==='RECORD_OBJECTIVE_COVERAGE'||stage==='RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'){reviews++;return{text:JSON.stringify(proof)};}
   if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries([...proof.sources.map(s=>s.collection)].map(collection=>[collection,{relevantToObjective:true,reason:'Entries source'}]))})};
   if(stage==='READ_ONLY_EVIDENCE_CONTINUATION')return{text:'{"toolCalls":[]}'};
   throw Error('Unexpected stage '+stage);
  }}}});
  assert.ok(reviews>0);assert.equal(result.missionComplete,false);assert.equal(result.completionAssessment.objectives[0].satisfied,false);
 }
});

test('fresh independent source exclusions reach the single recovery decision immediately',async()=>{
 const contract={objective:'Inspect registered entries',requestQuote:'Inspect registered entries',requiredEvidenceKind:'platform_records',coverageMode:'population',scope:'all_sources',groups:['entries']};
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,inputSchema:{type:'object',properties:{file:{type:'string',enum:['next.js']}},required:['file']}};
 const records={name:'fixture.records',evidenceKinds:['platform_records'],investigationReadOnly:true,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string',enum:['unrelated','related']},mode:{type:'string'}},required:['sourceFile','collection','mode']}};
 const tasks=[{name:reader.name,args:{file:'source.js'},observation:{ok:true,verifiedRead:{file:'source.js',content:'Observed source schema',sourceStructure:{dataBindings:{collections:['unrelated','related'],writeShapes:[{collection:'unrelated',fields:['accountLabel'],fieldsComplete:true},{collection:'related',fields:['entryLabel'],fieldsComplete:true}]}}}}},
  {name:records.name,args:{sourceFile:'source.js',collection:'unrelated',mode:'query'},observation:{ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{sourceFile:'source.js',collection:'unrelated',mode:'query',fields:['label']},rows:[{id:'one',values:{label:'Observed account'}}],totalCount:1,returnedCount:1,completeForQuery:true,hasMore:false}}}];
 const proof={proven:false,missing:['Read the related source'],groups:[{group:'entries',proven:false,evidence:[]}],sources:[{collection:'unrelated',relevant:false,reason:'Administrative account metadata',taskIndexes:[]},{collection:'related',relevant:true,reason:'Requested entries',taskIndexes:[]}]};
 let recoveries=0;
 const result=await runJarvisSemanticPlanner({input:contract.objective,catalog:[records,reader],missionState:{phase:'COMPLETION_AUDIT',evidenceObjectives:[contract],completedTasks:tasks},ai:{models:{generateContent:async request=>{
  const stage=request.config.semanticStage;
  if(stage==='COMPLETION_AUDIT')return{text:JSON.stringify({completionAssessment:{objectives:[{objective:contract.objective,requiredEvidenceKind:'platform_records',satisfied:false,evidenceTaskIndexes:[],limitation:'Read related entries'}]},toolCalls:[]})};
  if(stage==='RECORD_OBJECTIVE_COVERAGE'||stage==='RECORD_OBJECTIVE_COVERAGE_CONSISTENCY')return{text:JSON.stringify(proof)};
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:'{"sourceRelevance":{"unrelated":{"relevantToObjective":false,"reason":"Administrative metadata"},"related":{"relevantToObjective":true,"reason":"Requested entries"}}}'};
  assert.equal(stage,'READ_ONLY_EVIDENCE_CONTINUATION');recoveries++;
  const definitions=(request.config.tools||[]).flatMap(tool=>tool.functionDeclarations||[]);
  const choices=request.config.responseJsonSchema?.properties.toolCalls?.items?.anyOf;
  const schemas=choices?choices.map(choice=>choice.properties.args):definitions.map(tool=>tool.parametersJsonSchema);
  const routes=schemas.flatMap(schema=>(schema?.anyOf||[schema]).flatMap(branch=>branch?.properties?.collection?.enum||[]));
  assert.ok(routes.includes('related'),'other grounded queries remain available');
  assert.ok(!routes.includes('unrelated'),'freshly reviewed exclusion must affect this recovery, not the following iteration');
  return{text:'{"toolCalls":[{"name":"repo.read","args":{"file":"next.js"}}]}'};
 }}}});
 assert.equal(recoveries,1);assert.equal(result.missionComplete,false);assert.equal(result.toolCalls[0].args.file,'next.js');
});

test('query relevance receives only the proposed collection source and its own fields',async()=>{
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string'},fields:{type:'array',items:{type:'string'}}},required:['sourceFile','collection','mode']}};
 const tasks=[{name:reader.name,args:{file:'registry.js'},observation:{ok:true,verifiedRead:{file:'registry.js',content:'Shared module containing independent sources',sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:['entries','accounts'],fieldPaths:['label','billingStatus'],references:[
  {collection:'entries',startLine:1,content:'collection(db, "entries")',declarations:[{startLine:2,content:'entry.label'}]},
  {collection:'accounts',startLine:10,content:'collection(db, "accounts")',declarations:[{startLine:11,content:'account.billingStatus = "paid"'}]}
 ],writeShapes:[{collection:'entries',fields:['label'],content:'{ label }'},{collection:'accounts',fields:['billingStatus'],content:'{ billingStatus: "paid" }'}]}}}}}];
 let checked=false;
 const result=await runJarvisSemanticPlanner({input:'Inspect current entries',catalog:[reader,query],missionState:{phase:'COMPLETION_AUDIT',evidenceObjectives:[{objective:'Inspect current entries',requiredEvidenceKind:'platform_records'}],completedTasks:tasks},ai:{models:{generateContent:async request=>{
  if(request.config.semanticStage==='COMPLETION_AUDIT')return{text:JSON.stringify({completionAssessment:{objectives:[{objective:'Inspect current entries',requiredEvidenceKind:'platform_records',satisfied:false,evidenceTaskIndexes:[],limitation:'Read current entries'}]},toolCalls:[{name:query.name,args:{sourceFile:'registry.js',collection:'entries',mode:'query',fields:['label']}}]})};
  assert.equal(request.config.semanticStage,'QUERY_POPULATION_VERIFICATION');
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  assert.ok(JSON.stringify(payload.observedSource).includes('entry.label'));
  assert.ok(!JSON.stringify(payload.observedSource).includes('billingStatus'),'an unrelated collection must not ground this query');
  assert.deepEqual(payload.observedFieldSchemas[0].collections,['entries']);
  assert.deepEqual(payload.observedFieldSchemas[0].fieldPaths,['label']);
  checked=true;return{text:'{"matchesRequest":true}'};
 }}}});
 assert.equal(checked,true);assert.equal(result.ok,true);assert.equal(result.missionComplete,false);
});

test('coverage citations are constrained to the exact queried route including authenticated template resolution',async()=>{
 const f=fixture();f.tasks[0].observation.verifiedRead.sourceStructure.dataBindings.collections.push('other');
 f.tasks.push({name:'platform.query',args:{sourceFile:'registry.js',collection:'other'},observation:{ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{sourceFile:'registry.js',collection:'other',mode:'query',filters:[]},rows:[],totalCount:0,returnedCount:0,hasMore:false,completeForQuery:true,queryExhausted:true}}});
 const tool={name:'platform.query',evidenceKinds:['platform_records'],inputSchema:{type:'object',properties:{}}};let checked=false;
 await runJarvisSemanticPlanner({input:f.contract.objective,catalog:[tool],missionState:{phase:'COMPLETION_AUDIT',evidenceObjectives:[{...f.contract,requiredEvidenceKind:'platform_records'}],completedTasks:f.tasks},ai:{models:{generateContent:async request=>{
  if(request.config.semanticStage==='COMPLETION_AUDIT')return{text:JSON.stringify({completionAssessment:{objectives:[{objective:f.contract.objective,requiredEvidenceKind:'platform_records',satisfied:true,evidenceTaskIndexes:[1],limitation:''}]},toolCalls:[]})};
  if(request.config.semanticStage==='RECORD_OBJECTIVE_COVERAGE'){
   const sources=request.config.responseJsonSchema.properties.sources.properties;
   assert.deepEqual(sources[f.template].properties.taskIndexes.items.enum,[1]);
   assert.deepEqual(sources[f.resolved].properties.taskIndexes.items.enum,[1]);
   assert.deepEqual(sources.other.properties.taskIndexes.items.enum,[2]);
   const payload=JSON.parse(request.config.chatMessages.at(-1).content);
   assert.equal(payload.queryScopeFacts[0].requestedCollection,f.template);
   assert.equal(payload.queryScopeFacts[0].collection,f.resolved);
   checked=true;return{text:JSON.stringify(f.objective.coverageProof)};
  }
  if(request.config.semanticStage==='RECORD_OBJECTIVE_COVERAGE_CONSISTENCY')return{text:JSON.stringify(f.objective.coverageProof)};
  if(request.config.semanticStage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries([f.template,f.resolved,'other'].map(collection=>[collection,{relevantToObjective:collection!=='other',reason:'Observed source scope'}]))})};
  throw Error('Unexpected stage '+request.config.semanticStage);
 }}}});assert.equal(checked,true);
});

test('rejected query survives recovery as a typed decision receipt and advances without replaying exhausted work',async()=>{
 for(const phase of ['COMPLETION_AUDIT','EVIDENCE_NEXT_ACTION']){
 // Reduced from the Chrome 92c83bf2 cycle: a completed empty route,
 // an irrelevant timestamp projection, a scope rejection, then recovery.
 // Domain names and tenant values are deliberately replaced by generic fixtures.
 const input='Count entries, identify holders and report current deadlines';
 const contracts=['Count entries','Identify holders','Report current deadlines'].map(objective=>({objective,requiredEvidenceKind:'platform_records'}));
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string'},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}};
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,inputSchema:{type:'object',properties:{file:{type:'string',enum:['related.js']}},required:['file']}};
 const rejected={name:query.name,args:{sourceFile:'registry.js',collection:'profiles',mode:'query',fields:['updatedAt'],filters:[]}};
 const tasks=[{name:reader.name,args:{file:'registry.js'},observation:{ok:true,verifiedRead:{file:'registry.js',content:'Observed independent registries',sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:['entries','profiles'],references:[{collection:'profiles',content:'collection(db, "profiles")'}],writeShapes:[{collection:'profiles',fields:['updatedAt','holder'],content:'{updatedAt, holder}'}]}}}}},
 {name:query.name,args:{sourceFile:'registry.js',collection:'entries',mode:'query',fields:['__name__'],filters:[]},observation:{ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{sourceFile:'registry.js',collection:'entries',mode:'query',fields:['__name__'],filters:[],orderBy:[{field:'__name__',direction:'asc'}]},rows:[],returnedCount:0,totalCount:0,completeForQuery:true,queryExhausted:true,hasMore:false}}}];
 const stages=[];let relatedAvailable=false;
 const result=await runJarvisSemanticPlanner({input,catalog:[query,reader],missionState:{phase,evidenceObjectives:contracts,completedTasks:tasks},ai:{models:{generateContent:async request=>{
  stages.push(request.config.semanticStage);
  if(request.config.semanticStage===phase)return{text:JSON.stringify({completionAssessment:{objectives:contracts.map(c=>({...c,satisfied:false,evidenceTaskIndexes:[1],limitation:'Other sources remain pending'}))},toolCalls:[rejected]})};
  if(request.config.semanticStage==='QUERY_POPULATION_VERIFICATION')return{text:'{"matchesRequest":false}'};
  assert.equal(request.config.semanticStage,'READ_ONLY_EVIDENCE_CONTINUATION');
  const message=request.config.chatMessages.find(m=>m.content.startsWith('RECHAZO_DE_ALCANCE='));
  assert.ok(message,'recovery needs the exact rejected proposal, not merely an error label');
  const receipt=JSON.parse(message.content.slice('RECHAZO_DE_ALCANCE='.length));
  assert.equal(receipt.code,'SEMANTIC_QUERY_SCOPE_UNVERIFIED');
  assert.deepEqual(receipt.proposed,rejected);
  assert.equal(receipt.operationalEvidence,false);assert.equal(receipt.objectiveSatisfied,false);
  const choices=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;
  relatedAvailable=choices.some(c=>c.properties.name.enum?.includes(query.name)||c.properties.name.const===query.name);
  assert.equal(relatedAvailable,true,'a rejected projection cannot exhaust the entire collection or remove valid alternatives');
  return{text:JSON.stringify({toolCalls:[{name:reader.name,args:{file:'related.js'}}]})};
 }}}});
 assert.deepEqual(stages,[phase,'QUERY_POPULATION_VERIFICATION','READ_ONLY_EVIDENCE_CONTINUATION']);
 assert.equal(result.ok,true);assert.equal(result.missionComplete,false);
 assert.deepEqual(result.toolCalls.map(c=>({name:c.name,args:c.args})),[{name:reader.name,args:{file:'related.js'}}]);
 assert.equal(result.completionAssessment.objectives.length,3);
 assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false&&o.requiredEvidenceKind==='platform_records'));
 }
});

test('the next decision reuses an unchanged query rejection but new evidence reopens it',async()=>{
 const contract={objective:'Inspect entries',requiredEvidenceKind:'platform_records'};
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,inputSchema:{type:'object',properties:{file:{type:'string',enum:['next.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string'},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode']}};
 const tasks=[{name:reader.name,args:{file:'source.js'},observation:{ok:true,verifiedRead:{file:'source.js',content:'Observed profile schema',sourceStructure:{dataBindings:{collections:['profiles'],writeShapes:[{collection:'profiles',fields:['stamp','label'],content:'{stamp, label}'}]}}}}}];
 const rejected={name:query.name,args:{sourceFile:'source.js',collection:'profiles',mode:'query',fields:['stamp'],filters:[]}};
 const cache=new Map(),stages=[];let turn=0;
 const ai={objectiveCoverageCache:cache,models:{generateContent:async request=>{
  stages.push(request.config.semanticStage);
  if(request.config.semanticStage==='COMPLETION_AUDIT')return{text:JSON.stringify({completionAssessment:{objectives:[{...contract,satisfied:false,evidenceTaskIndexes:[],limitation:'Other evidence pending'}]},toolCalls:[{...rejected,reason:'Proposal explanation '+turn}]})};
  if(request.config.semanticStage==='QUERY_POPULATION_VERIFICATION')return{text:'{"matchesRequest":false}'};
  assert.equal(request.config.semanticStage,'READ_ONLY_EVIDENCE_CONTINUATION');
  const message=request.config.chatMessages.find(m=>m.content.startsWith('DECISIONES_RECHAZADAS='));
  const receipts=JSON.parse(message.content.slice('DECISIONES_RECHAZADAS='.length));assert.equal(receipts.length,1);
  assert.deepEqual(receipts[0].proposed,rejected);
  return{text:'{"toolCalls":[{"name":"repo.read","args":{"file":"next.js"}}]}'};
 }}};
 for(turn=0;turn<3;turn++){
  stages.length=0;
  if(turn===2)tasks[0].observation.verifiedRead.sourceStructure.dataBindings.writeShapes[0].content='{stamp: deadlineValue, label}';
  const result=await runJarvisSemanticPlanner({input:contract.objective,catalog:[reader,query],missionState:{phase:'COMPLETION_AUDIT',missionId:'one-mission',tenantId:'approved',evidenceObjectives:[contract],completedTasks:tasks},ai});
  assert.equal(result.missionComplete,false);assert.equal(result.toolCalls[0].args.file,'next.js');
  assert.equal(stages.filter(s=>s==='QUERY_POPULATION_VERIFICATION').length,turn===1?0:1);
 }
});

test('normal evidence advancement selects one novel action before attempting any closure verdict',async()=>{
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,inputSchema:{type:'object',properties:{file:{type:'string',enum:['related.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'}}}};
 const contracts=['Count entries','Identify holders','Inspect deadlines'].map(objective=>({objective,requiredEvidenceKind:'platform_records',coverageMode:'population',scope:'all_sources',groups:['entries']}));
 const stages=[];
 const result=await runJarvisSemanticPlanner({input:'Inspect current entries',catalog:[reader,query],missionState:{phase:'EVIDENCE_NEXT_ACTION',evidenceObjectives:contracts,completedTasks:fixture().tasks},ai:{models:{generateContent:async request=>{
  stages.push(request.config.semanticStage);assert.equal(request.config.semanticStage,'EVIDENCE_NEXT_ACTION','a pending investigation needs an action selection, not three fresh closure verdicts');
  return{text:'{"toolCalls":[{"name":"repo.read","args":{"file":"related.js"}}]}'};
 }}}});
 assert.deepEqual(stages,['EVIDENCE_NEXT_ACTION']);assert.equal(result.ok,true);assert.equal(result.missionComplete,false);
 assert.equal(result.toolCalls[0].args.file,'related.js');assert.equal(result.completionAssessment.objectives.length,3);
 assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false&&o.requiredEvidenceKind==='platform_records'));
});

test('an empty next-action decision closes only after independent operational coverage proves each goal',async()=>{
 for(const proven of [false,true]){
  const f=fixture();const contract={...f.contract,requiredEvidenceKind:'platform_records'};
  const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,inputSchema:{type:'object',properties:{}}};
  const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,inputSchema:{type:'object',properties:{file:{type:'string',enum:['next.js']}},required:['file']}};
  query.requiresEvidence=[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}];
  const stages=[];
  const proof=structuredClone(f.objective.coverageProof);if(!proven){proof.proven=false;proof.missing=['Classification remains unknown'];proof.groups[0].proven=false;}
  const result=await runJarvisSemanticPlanner({input:contract.objective,catalog:[query,reader],missionState:{phase:'EVIDENCE_NEXT_ACTION',evidenceObjectives:[contract],completedTasks:f.tasks},ai:{models:{generateContent:async request=>{
   stages.push(request.config.semanticStage);
   if(request.config.semanticStage==='EVIDENCE_NEXT_ACTION')return{text:'{"toolCalls":[]}'};
   if(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(request.config.semanticStage))return{text:JSON.stringify(proof)};
   if(request.config.semanticStage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries([f.template,f.resolved].map(collection=>[collection,{relevantToObjective:true,reason:'Observed entry registry'}]))})};
   throw Error('An empty action must not start another planning chain: '+request.config.semanticStage);
  }}}});
  assert.ok(stages.includes('RECORD_OBJECTIVE_COVERAGE'));assert.equal(stages.filter(s=>s==='EVIDENCE_NEXT_ACTION').length,1);
  assert.equal(result.missionComplete,proven);assert.equal(result.completionAssessment.objectives[0].satisfied,proven);
  assert.equal(result.toolCalls.length,0);
 }
});

test('a native proposal outside the filtered frontier triggers one explicit recovery instead of becoming an empty decision',async()=>{
 const f=fixture();f.tasks[0].observation.verifiedRead.sourceStructure.dataBindings.collections.push('related');
 Object.assign(f.tasks[1].observation.recordEvidence,{rows:[],returnedCount:0,totalCount:0});
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,inputSchema:{type:'object',properties:{file:{type:'string',enum:['next.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string'},fields:{type:'array',items:{type:'string'}},filters:{type:'array'},pageSize:{type:'integer'},includeCount:{type:'boolean'}},required:['sourceFile','collection','mode','fields','filters']}};
 const rejected={name:query.name,args:{sourceFile:'registry.js',collection:f.resolved,mode:'query',fields:['kind'],filters:[],pageSize:100,includeCount:true}};
 const stages=[];
 const result=await runJarvisSemanticPlanner({input:f.contract.objective,catalog:[reader,query],missionState:{phase:'EVIDENCE_NEXT_ACTION',evidenceObjectives:[{...f.contract,requiredEvidenceKind:'platform_records'}],completedTasks:f.tasks},ai:{models:{generateContent:async request=>{
  stages.push(request.config.semanticStage);
  if(request.config.semanticStage==='EVIDENCE_NEXT_ACTION'){
   assert.ok(request.config.responseJsonSchema,'filtered action choices require a JSON grammar even for compact contexts');
   assert.equal(request.config.nativeToolChat,undefined);
   // The real local replay emitted this concrete alias despite its enum being
   // absent. Keep the post-selection boundary safe even for that response.
   return{functionCalls:[rejected]};
  }
  assert.equal(request.config.semanticStage,'READ_ONLY_EVIDENCE_CONTINUATION','dropping an invalid native proposal must not be interpreted as the model choosing to stop');
  const receipt=JSON.parse(request.config.chatMessages.find(m=>m.content.startsWith('RECHAZO_DE_ALCANCE=')).content.split('=').slice(1).join('='));
  assert.deepEqual(receipt.proposed,rejected);assert.equal(receipt.operationalEvidence,false);
  return{text:'{"toolCalls":[{"name":"repo.read","args":{"file":"next.js"}}]}'};
 }}}});
 assert.deepEqual(stages,['EVIDENCE_NEXT_ACTION','READ_ONLY_EVIDENCE_CONTINUATION']);assert.equal(result.missionComplete,false);assert.equal(result.completionAssessment.objectives[0].satisfied,false);assert.equal(result.toolCalls[0].args.file,'next.js');
});

test('recovery excludes a reviewed projection only for its exact unfiltered scope while retaining new fields and filters',async()=>{
 const {hasRequiredToolArguments}=require('../functions/jarvis-semantic-planner');
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,inputSchema:{type:'object',properties:{file:{type:'string',enum:['next.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string',enum:['entries','related']},mode:{type:'string',enum:['query']},fields:{type:'array',minItems:1,maxItems:4,items:{type:'string'}},filters:{type:'array'},orderBy:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}};
 const args={sourceFile:'registry.js',collection:'entries',mode:'query',fields:['stamp'],filters:[]};
 const source={name:reader.name,args:{file:'registry.js'},observation:{ok:true,verifiedRead:{file:'registry.js',content:'Observed independent entry registries',sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:['entries','related'],writeShapes:['entries','related'].map(collection=>({collection,fields:['stamp','label'],fieldsComplete:true,content:'{stamp, label}'}))}}}}};
 const stages=[];
 const result=await runJarvisSemanticPlanner({input:'Inspect active entries',catalog:[query,reader],missionState:{phase:'EVIDENCE_NEXT_ACTION',evidenceObjectives:[{objective:'Inspect active entries',requiredEvidenceKind:'platform_records'}],completedTasks:[source]},ai:{objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;stages.push(stage);
  if(stage==='EVIDENCE_NEXT_ACTION')return{text:JSON.stringify({toolCalls:[{name:query.name,args}]})};
  if(stage==='QUERY_POPULATION_VERIFICATION')return{text:JSON.stringify({matchesRequest:stages.filter(s=>s===stage).length>1})};
  assert.equal(stage,'READ_ONLY_EVIDENCE_CONTINUATION');
  const candidate=request.config.responseJsonSchema.properties.toolCalls.items.anyOf.find(c=>c.properties.name.enum.includes(query.name));
  const scoped={inputSchema:candidate.properties.args};
  const compact=JSON.parse(request.config.chatMessages.find(m=>m.content.startsWith('CATALOGO_EJECUTABLE=')).content.slice('CATALOGO_EJECUTABLE='.length)).find(t=>t.name===query.name);
  assert.ok(!compact.requiredArguments.includes('orderBy'),'a requirement of one alternative is not mandatory in every scope');
  const projections=compact.evidenceBindings.filter(binding=>binding.collection?.includes('entries')&&Array.isArray(binding.fields)).flatMap(binding=>binding.fields);
  assert.ok(projections.some(fields=>JSON.stringify(fields)==='["label","stamp"]'));
  assert.ok(!projections.some(fields=>JSON.stringify(fields)==='["stamp"]'),'the compact model catalog must agree with the filtered grammar');
  assert.equal(hasRequiredToolArguments(scoped,args),false,'the rejected projection must be removed before the recovery model is called');
  for(const change of [{fields:['label']},{fields:['label','stamp']},{filters:[{field:'label',op:'==',value:'active'}]},{collection:'related'}])
   assert.equal(hasRequiredToolArguments(scoped,{...args,...change}),true,'a different projection, filter or source remains eligible');
  return{text:JSON.stringify({toolCalls:[{name:query.name,args:{...args,fields:['__name__']}}]})};
 }}}});
 assert.deepEqual(stages,['EVIDENCE_NEXT_ACTION','QUERY_POPULATION_VERIFICATION','READ_ONLY_EVIDENCE_CONTINUATION','QUERY_POPULATION_VERIFICATION']);
 assert.equal(result.missionComplete,false);assert.deepEqual(result.toolCalls[0].args.fields,['__name__']);
});

test('projection alternatives remain complete in the native grammar while their compact context stays bounded',async()=>{
 const fields=Array.from({length:7},(_,i)=>'field_'+i+'_'+('x'.repeat(80)));
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,inputSchema:{type:'object',properties:{file:{type:'string',enum:['next.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string',enum:['entries']},mode:{type:'string',enum:['query']},fields:{type:'array',minItems:1,maxItems:8,items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}};
 const tasks=[{name:reader.name,args:{file:'registry.js'},observation:{ok:true,verifiedRead:{file:'registry.js',content:'Observed schema',sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:['entries'],writeShapes:[{collection:'entries',fields,content:'Observed write'}]}}}}}];
 let checked=false;
 const result=await runJarvisSemanticPlanner({input:'Inspect entries',catalog:[query,reader],missionState:{phase:'EVIDENCE_NEXT_ACTION',evidenceObjectives:[{objective:'Inspect entries',requiredEvidenceKind:'platform_records'}],completedTasks:tasks},ai:{objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  if(request.config.semanticStage==='EVIDENCE_NEXT_ACTION')return{text:JSON.stringify({toolCalls:[{name:query.name,args:{sourceFile:'registry.js',collection:'entries',mode:'query',fields:[fields[0]],filters:[]}}]})};
  if(request.config.semanticStage==='QUERY_POPULATION_VERIFICATION')return{text:'{"matchesRequest":false}'};
  assert.equal(request.config.semanticStage,'READ_ONLY_EVIDENCE_CONTINUATION');
  const visible=request.config.chatMessages.find(m=>m.content.startsWith('CATALOGO_EJECUTABLE=')).content;
  assert.ok(visible.length<5000,'projection combinations must not consume the evidence/context budget');
  const compact=JSON.parse(visible.slice('CATALOGO_EJECUTABLE='.length)).find(t=>t.name===query.name);
  const summary=compact.evidenceBindings.find(binding=>binding.fields?.fullChoicesInNativeSchema)?.fields;
  assert.equal(summary.permittedProjectionCount,254);
  assert.ok(JSON.stringify(summary.projectionExamples).length<=1600);
  const candidate=request.config.responseJsonSchema.properties.toolCalls.items.anyOf.find(c=>c.properties.name.enum.includes(query.name));
  const native=(candidate.properties.args.anyOf||[candidate.properties.args]).find(branch=>branch.properties.fields.enum)?.properties.fields.enum;
  assert.equal(native.length,254,'the compact prompt does not remove native action choices');
  checked=true;return{text:'{"toolCalls":[{"name":"repo.read","args":{"file":"next.js"}}]}'};
 }}}});assert.equal(checked,true);assert.equal(result.missionComplete,false);
});
