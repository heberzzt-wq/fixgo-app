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
