const queryReviewFixture=require('./helpers/query-review-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {runJarvisSemanticPlanner,hasRequiredToolArguments}=require('../functions/jarvis-semantic-planner.js');

for(const dependency of ['unrelated','other-organization','related'])test(`rejected query retains only relevant ${dependency} source dependencies through the mission loop`,async()=>{
 const {runJarvisMission}=await import('../gestia-core/jarvis/jarvis.mission.orchestrator.js');
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['source.js','dependency.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},{kind:'repository_source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query','count']},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','filters']}};
 const goals=['Count entries','Find holders','Check deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['entries']}));
 const seed={name:query.name,args:{sourceFile:'source.js',collection:'groups/{groupId}/archive',mode:'count',filters:[]}};
 const rejected={name:query.name,args:{...seed.args,collection:'groups/{groupId}/people'}};
 const valid={name:query.name,args:{...rejected.args,mode:'query',fields:['holder','deadline']}};
 const discovered={name:reader.name,args:{file:'dependency.js'}};
 let readDependency=false,progressed=false,recoveryCalls=0,reviews=0;const executed=[],offeredAfterRead=[];
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;
  if(stage==='EVIDENCE_NEXT_ACTION'){
   if(progressed)return{text:'{"toolCalls":[]}'};
   const choices=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;
   const allows=choices.filter(c=>c.properties.name.enum.includes(query.name)).some(c=>hasRequiredToolArguments({inputSchema:c.properties.args},rejected.args));
   if(readDependency)offeredAfterRead.push(allows);
   return{text:JSON.stringify({toolCalls:[allows?rejected:valid]})};
  }
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION'){recoveryCalls++;return{text:JSON.stringify({toolCalls:[discovered],sourceFallback:[]})};}
  if(stage==='QUERY_POPULATION_VERIFICATION'){
   reviews++;const args=queryReviewFixture.packet(request).proposed;
   return queryReviewFixture(request,{matchesRequest:args.mode==='query'||(readDependency&&dependency==='related'),schemaDiscoveryRelevant:false,rejectionReason:'This count does not establish the requested population from its current source.'});
  }
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:true,reason:'Observed source requiring further records.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['All requested operational coverage remains pending'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:true,reason:'Source is structurally observed only.',taskIndexes:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'source.js'}},seed],toolCatalog:[reader,query],storage:{getItem(){return null;},setItem(){},removeItem(){}},execute:async call=>{
  executed.push(call);
  if(call.name===reader.name){
   const next=call.args.file==='dependency.js';if(next)readDependency=true;
   const collections=next?[dependency==='related'?rejected.args.collection:dependency==='other-organization'?'groups/other/people':'events']:[seed.args.collection,rejected.args.collection];
   const content=next?'New independently read schema':'Original holder and deadline schema';
   return{ok:true,data:{file:call.args.file,content,numberedContent:'1: '+content,startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections,queryShapes:collections.map(collection=>({collection,fields:next?['holder','deadline','classification']:['holder','deadline'],fieldsComplete:true}))}}}};
  }
  if(executed.length>2){assert.deepEqual(call.args,dependency==='related'?rejected.args:valid.args);progressed=true;}
  const scope={...call.args,collection:call.args.collection.replace('{groupId}','approved'),orderBy:[],implicitExistenceFields:[]};
  const recordEvidence={source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope,totalCount:0,countObservedAt:new Date().toISOString()};
  if(call.args.mode==='query')Object.assign(recordEvidence,{rows:[],returnedCount:0,hasMore:false,queryExhausted:true,completeForQuery:true,consistentCountAndList:true});
  return{ok:true,data:{recordEvidence}};
 },planner:async({mission})=>runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai})});
 assert.equal(offeredAfterRead[0],dependency==='related','an unrelated file or another organization cannot invalidate a witnessed rejection');
 assert.ok(progressed);assert.equal(recoveryCalls,1,'unrelated reads cannot restart the same rejection/recovery cycle');
 assert.equal(reviews,2,'one rejected proposal and one genuinely eligible next decision');
 assert.equal(result.status,'PARTIAL');assert.equal(result.completionAssessment.objectives.length,3);assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
});
