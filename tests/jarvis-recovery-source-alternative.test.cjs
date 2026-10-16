const queryReviewFixture=require('./helpers/query-review-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');

for(const failure of ['semantic','repeated','arguments'])for(const alternative of ['new-source','repeated-source','unobserved-source','operational'])for(const accepted of (failure==='semantic'?[false,true]:[false]))test(`one recovery decision retains ${alternative}; primary accepted=${accepted}; failure=${failure}`,async()=>{
 const {runJarvisMission}=await import('../gestia-core/jarvis/jarvis.mission.orchestrator.js');
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['observed.js','related.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},{kind:'repository_source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query','count']},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','filters']}};
 const goals=['Count entries','Find holders','Check deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['entries']}));
 const seed={name:query.name,args:{sourceFile:'observed.js',collection:'groups/{groupId}/archive',mode:'count',filters:[]}};
 const first={name:query.name,args:{...seed.args,collection:'groups/{groupId}/people'}};
 const recovery=failure==='repeated'?seed:{name:query.name,args:{...seed.args,collection:'groups',mode:failure==='arguments'?'invalid-mode':'query',fields:['summary']}};
 const fallback=alternative==='operational'?recovery:{name:reader.name,args:{file:alternative==='new-source'?'related.js':alternative==='unobserved-source'?'unobserved.js':'observed.js'}};
 let progressed=false,recoveryCalls=0,offeredSourceAlternative=false;const executed=[];
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;
  if(stage==='EVIDENCE_NEXT_ACTION')return{text:JSON.stringify({toolCalls:progressed?[]:[first]})};
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION'){
   recoveryCalls++;offeredSourceAlternative=Boolean(request.config.responseJsonSchema?.properties.sourceFallback);
   return{text:JSON.stringify({toolCalls:[recovery],sourceFallback:[fallback]})};
  }
  if(stage==='QUERY_POPULATION_VERIFICATION'){
   const args=JSON.parse(request.config.chatMessages.at(-1).content).proposed;
   return queryReviewFixture(request,{matchesRequest:accepted&&args.collection==='groups',schemaDiscoveryRelevant:false,rejectionReason:'This projection has not established pertinent operational evidence.'});
  }
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:true,reason:'Source may contribute to an unresolved objective.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['Current evidence remains incomplete'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:true,reason:'Observed structural source; no complete operational proof.',taskIndexes:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'observed.js'}},seed],toolCatalog:[reader,query],storage:{getItem(){return null;},setItem(){},removeItem(){}},execute:async call=>{
  executed.push(call);
  if(call.name===reader.name){
   if(call.args.file==='related.js')progressed=true;
   const content='Observed summary and deadline structure';
   return{ok:true,data:{file:call.args.file,content,numberedContent:'1: '+content,startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:['groups',seed.args.collection,first.args.collection],queryShapes:['groups',seed.args.collection,first.args.collection].map(collection=>({collection,fields:['summary','deadline'],fieldsComplete:true}))}}}};
  }
  if(executed.length>2){assert.ok(accepted,'a vetoed operational action must never execute');assert.deepEqual(call.args,recovery.args);progressed=true;}
  return{ok:true,data:{recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...call.args,collection:call.args.collection.replace('{groupId}','approved'),orderBy:[],implicitExistenceFields:[]},rows:[],totalCount:0,returnedCount:0,hasMore:false,queryExhausted:true,completeForQuery:true,consistentCountAndList:true}}};
 },planner:async({mission})=>runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai})});
 if(failure==='semantic'||alternative==='new-source')assert.equal(recoveryCalls,1,'a usable same-response alternative needs no extra recovery inference');
 else assert.ok(recoveryCalls<=2,'invalid alternatives cannot trigger unbounded recovery');
 assert.equal(progressed,accepted||alternative==='new-source','a safe source alternative survives a second veto');
 if(!accepted&&alternative==='new-source')assert.ok(offeredSourceAlternative,'the model must choose the alternative in the same structured response');
 assert.equal(executed.some(call=>call.name===reader.name&&call.args.file==='related.js'),!accepted&&alternative==='new-source','a successful primary never executes its alternative');
 assert.equal(executed.filter(call=>call.name===query.name).length,accepted?2:1);
 assert.equal(result.status,'PARTIAL');assert.equal(result.completionAssessment.objectives.length,3);
 assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
});
