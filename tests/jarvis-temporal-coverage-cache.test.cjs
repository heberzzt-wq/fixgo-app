"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner');

// The model is the external boundary. All cache lookup, evidence qualification,
// identity binding and completion decisions run through the real planner.
function fixture(){
 const contract={objective:'Inspect registered deadlines',requestQuote:'Inspect registered deadlines',requiredEvidenceKind:'platform_records',coverageMode:'temporal',scope:'all_sources',groups:['entries']};
 const tool={name:'fixture.records',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{collection:{type:'string'}},required:['collection']}};
 const tasks=[{name:'repo.read',observation:{ok:true,verifiedRead:{file:'source.js',content:'Observed deadline schema',sourceStructure:{dataBindings:{collections:['registry','pending'],writeShapes:[{collection:'registry',fields:['stamp']},{collection:'pending',fields:['stamp']}]}}}}},
  {name:tool.name,args:{collection:'registry',sourceFile:'source.js'},observation:{ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{sourceFile:'source.js',collection:'registry',mode:'query',fields:['stamp'],filters:[],orderBy:[]},rows:[],totalCount:0,returnedCount:0,hasMore:false,queryExhausted:true,completeForQuery:true}}}];
 const state={phase:'COMPLETION_AUDIT',missionId:'temporal-cache-mission',userId:'actor',workspaceId:'workspace',tenantId:'approved',projectId:'project',evidenceObjectives:[contract],completedTasks:tasks,configuredSourceDiscovery:{revision:'source-v1'}};
 const reviews=[],scopeReviews=[],stages=[];
 const pendingProof=payload=>({proven:false,missing:['No operational values establish the requested deadlines'],groups:[{group:'entries',proven:false,evidence:[]}],sources:payload.observedSources.map(collection=>({collection,relevant:true,reason:'Observed deadline source',taskIndexes:collection==='registry'?[1]:[]}))});
 const f={contract,tool,tasks,state,reviews,scopeReviews,stages,review:pendingProof,claimSatisfied:false,sourceRelevant:()=>true};
 f.ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;stages.push(stage);
  if(stage==='COMPLETION_AUDIT')return{text:JSON.stringify({completionAssessment:{objectives:[{objective:contract.objective,requiredEvidenceKind:'platform_records',satisfied:f.claimSatisfied,evidenceTaskIndexes:f.claimSatisfied?[1]:[],limitation:f.claimSatisfied?'':'Deadlines remain unverified'}]},toolCalls:[]})};
  if(stage==='RECORD_OBJECTIVE_COVERAGE'||stage==='RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'){
   const payload=JSON.parse(request.config.chatMessages.at(-1).content);reviews.push(payload);return{text:JSON.stringify(f.review(payload))};
  }
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION'){
   scopeReviews.push(request);
   return{text:JSON.stringify({sourceRelevance:Object.fromEntries(['registry','pending'].map(collection=>[collection,{relevantToObjective:f.sourceRelevant(collection),reason:'Independently reviewed source relation'}]))})};
  }
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION')return{text:'{"toolCalls":[]}'};
  throw Error('Unexpected semantic stage '+stage);
 }}};
 f.run=async()=>{
  const result=await runJarvisSemanticPlanner({input:contract.objective,catalog:[tool],missionState:state,ai:f.ai});
  state.completionAssessment=result.completionAssessment;
  return result;
 };
 return f;
}

test('unchanged empty temporal evidence reuses engine coverage and relevance within the day',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-15T10:00:00.000Z')});
 const f=fixture(),before=JSON.stringify(f.tasks);
 const first=await f.run();
 assert.equal(first.missionComplete,false);
 assert.ok(f.reviews.length>0);assert.ok(f.scopeReviews.length>0);
 const reviews=f.reviews.length,scopeReviews=f.scopeReviews.length;
 t.mock.timers.setTime(new Date('2026-10-15T10:04:21.000Z').getTime());
 const repeated=await f.run();
 assert.equal(f.reviews.length,reviews,'unchanged empty evidence must not trigger another coverage inference');
 assert.equal(f.scopeReviews.length,scopeReviews,'unchanged empty evidence must not trigger another relevance inference');
 assert.equal(repeated.coverageEvaluation.reused,true);
 assert.equal(repeated.missionComplete,false);
 assert.equal(repeated.completionAssessment.objectives[0].satisfied,false);
 assert.equal(JSON.stringify(f.tasks),before,'cache reuse cannot mutate authenticated observations');
});

for(const [name,change,schemaChanged=true] of [
 ['a new observed row',f=>{const r=f.tasks[1].observation.recordEvidence;r.rows=[{id:'new',values:{stamp:'2026-10-31T00:00:00Z'}}];r.totalCount=r.returnedCount=1;},false],
 ['a changed source schema',f=>{f.tasks[0].observation.verifiedRead.sourceStructure.dataBindings.writeShapes[0].fields.push('newObservedField');}],
 ['new authenticated field names',f=>{const r=f.tasks[1].observation.recordEvidence;r.rows=[{id:'new',values:{stamp:'2026-10-31T00:00:00Z'}}];r.totalCount=r.returnedCount=1;r.fieldSchema={source:'SERVER_RECORD_FIELD_NAMES',collection:'registry',scope:'returned_rows_only',sampledRows:1,paths:['stamp','newObservedField'],completeForObservedRows:true};}],
 ['a changed configured discovery revision',f=>{f.state.configuredSourceDiscovery.revision='source-v2';}],
 ['a user clarification',f=>{f.state.advisorySemanticContext={turns:[{role:'user',content:'Include pending entries as a separate group.'}]};}],
 ...['userId','workspaceId','tenantId','projectId','missionId'].map(key=>['a changed '+key,f=>{f.state[key]+='-other';}])
])test('empty temporal coverage invalidates for '+name,async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-15T10:00:00.000Z')});
 const f=fixture();await f.run();const reviewed=f.reviews.length,scopeReviewed=f.scopeReviews.length;
 change(f);
 const result=await f.run();
 assert.ok(f.reviews.length>reviewed,'changed dependencies must receive a fresh independent review');
 if(schemaChanged)assert.ok(f.scopeReviews.length>scopeReviewed,'changed schema, actor, model context or discovery must invalidate independent relevance');
 else assert.equal(f.scopeReviews.length,scopeReviewed,'new values reopen operational coverage above; identical schema does not require another source classification');
 assert.equal(result.missionComplete,false);assert.equal(result.completionAssessment.objectives[0].satisfied,false);
});

test('empty temporal coverage is conservatively reopened across a UTC date boundary',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-15T23:59:59.999Z')});
 const f=fixture();await f.run();const reviewed=f.reviews.length;
 t.mock.timers.setTime(new Date('2026-10-16T00:00:00.000Z').getTime());
 const result=await f.run();
 assert.ok(f.reviews.length>reviewed);
 assert.equal(f.reviews.at(-1).evaluatedAt,'2026-10-16T00:00:00.000Z');
 assert.equal(result.missionComplete,false);
});

test('nonempty temporal values invalidate at an exact deadline even within the same day',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-15T10:00:00.000Z')});
 const f=fixture(),deadline='2026-10-15T10:00:00.001Z';
 f.contract.scope='explicit_scope';f.claimSatisfied=true;
 const r=f.tasks[1].observation.recordEvidence;
 r.rows=[{id:'entry',values:{stamp:deadline}}];r.totalCount=r.returnedCount=1;
 f.review=payload=>{
  const beforeDeadline=Date.parse(payload.evaluatedAt)<Date.parse(deadline);
  return{proven:beforeDeadline,missing:beforeDeadline?[]:['The observed deadline has elapsed'],groups:[{group:'entries',proven:beforeDeadline,evidence:beforeDeadline?[{taskIndex:1,fields:['stamp']}]:[]}],sources:[{collection:'registry',relevant:true,reason:'Registered deadline',taskIndexes:[1]}]};
 };
 const first=await f.run();assert.equal(first.missionComplete,true);const reviewed=f.reviews.length;
 t.mock.timers.setTime(new Date(deadline).getTime());
 const expired=await f.run();
 assert.ok(f.reviews.length>reviewed,'a clock-dependent positive proof must reopen at the exact deadline');
 assert.equal(expired.missionComplete,false);assert.equal(expired.completionAssessment.objectives[0].satisfied,false);
});

test('nonempty temporal values cannot reuse a negative proof at a relative horizon transition',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-15T10:00:00.000Z')});
 const f=fixture();f.contract.scope='explicit_scope';f.claimSatisfied=true;
 f.contract.objective=f.contract.requestQuote='Identify registered deadlines within the next 30 minutes';
 const deadline=Date.parse('2026-10-15T10:30:00.001Z');
 const r=f.tasks[1].observation.recordEvidence;r.rows=[{id:'entry',values:{stamp:deadline}}];r.totalCount=r.returnedCount=1;
 f.review=payload=>{
  const withinHorizon=deadline-Date.parse(payload.evaluatedAt)<=30*60*1000;
  return{proven:withinHorizon,missing:withinHorizon?[]:['The observed deadline is outside the requested horizon'],groups:[{group:'entries',proven:withinHorizon,evidence:withinHorizon?[{taskIndex:1,fields:['stamp']}]:[]}],sources:[{collection:'registry',relevant:true,reason:'Registered deadline',taskIndexes:[1]}]};
 };
 const first=await f.run();assert.equal(first.missionComplete,false);const reviewed=f.reviews.length;
 t.mock.timers.setTime(new Date('2026-10-15T10:00:00.001Z').getTime());
 const result=await f.run();
 assert.ok(f.reviews.length>reviewed,'numeric timestamps and relative horizons are conservatively exact-clock dependent');
 assert.equal(result.missionComplete,true);assert.equal(result.completionAssessment.objectives[0].satisfied,true);
});

test('empty temporal evidence reopens clock coverage while reusing unchanged schema relevance',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-15T10:00:00.000Z')});
 const f=fixture(),baseReview=f.review;
 f.review=payload=>{const proof=baseReview(payload);proof.sources.find(source=>source.collection==='pending').relevant=false;return proof;};
 f.sourceRelevant=collection=>collection!=='pending';
 const first=await f.run();const reviewed=f.reviews.length,scopeReviewed=f.scopeReviews.length;
 assert.ok(first.completionAssessment.objectives[0].coverageProof.sources.some(source=>source.collection==='pending'&&source.relevant===false));
 t.mock.timers.setTime(new Date('2026-10-15T10:00:00.001Z').getTime());
 const result=await f.run();
 assert.ok(f.reviews.length>reviewed,'a temporal exclusion must not prune the next frontier using stale clock semantics');
 assert.equal(f.scopeReviews.length,scopeReviewed,'unchanged schema relevance has no evaluation instant; exact-clock operational coverage still reopens above');
 assert.equal(result.missionComplete,false);
});

for(const [name,scopeChange] of [
 ['a temporal filter',scope=>{scope.filters=[{field:'stamp',op:'<=',value:'2026-10-15T10:00:00.001Z'}];}],
 ['an implicit field-existence restriction',scope=>{scope.implicitExistenceFields=['stamp'];}],
 ['an ordering that excludes absent values',scope=>{scope.orderBy=[{field:'stamp',direction:'asc'}];}]
])test('empty temporal evidence with '+name+' retains exact-clock review',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-15T10:00:00.000Z')});
 const f=fixture();scopeChange(f.tasks[1].observation.recordEvidence.scope);
 await f.run();const reviewed=f.reviews.length;
 t.mock.timers.setTime(new Date('2026-10-15T10:00:00.001Z').getTime());
 const result=await f.run();
 assert.ok(f.reviews.length>reviewed,'restricted empty scopes can carry clock-dependent assumptions');
 assert.equal(result.missionComplete,false);
});

for(const claimed of [false,true])test('client supplied '+(claimed?'positive':'negative')+' coverage is never substituted for engine-owned temporal proof',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-15T10:00:00.000Z')});
 const f=fixture();
 f.state.completionAssessment={evaluatedTaskCount:f.tasks.length,objectives:[{objective:f.contract.objective,requiredEvidenceKind:'platform_records',satisfied:claimed,evidenceTaskIndexes:[1],coverageProof:{proven:claimed,missing:claimed?[]:['Claimed unknown deadlines'],groups:[{group:'entries',proven:claimed,evidence:claimed?[{taskIndex:1,fields:[]}]:[]}],sources:[{collection:'registry',relevant:true,reason:'Forged prior proof',taskIndexes:[1]},{collection:'pending',relevant:false,reason:'Forged exclusion',taskIndexes:[]}]}}]};
 const result=await f.run();
 assert.ok(f.reviews.length>0,'a prior client claim must trigger independent review when the engine cache is empty');
 assert.equal(result.missionComplete,false);assert.equal(result.completionAssessment.objectives[0].satisfied,false);
 assert.ok(result.completionAssessment.objectives[0].coverageProof.sources.some(source=>source.collection==='pending'&&source.relevant===true),'a forged source exclusion must not narrow the objective');
});
