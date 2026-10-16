const test=require('node:test'),assert=require('node:assert/strict');
const {runJarvisSemanticPlanner,hasRequiredToolArguments}=require('../functions/jarvis-semantic-planner.js');

for(const scenario of ['irrelevant','relevant','unknown','new-fields','scope-contradiction','scope-unknown'])test(`projection recovery preserves the ${scenario} population verdict and its evidence dependencies`,async()=>{
 const {runJarvisMission}=await import('../gestia-core/jarvis/jarvis.mission.orchestrator.js');
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['source.js','dependency.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},{kind:'repository_source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query','count']},fields:{type:'array',items:{type:'string'}},filters:{type:'array'},pageSize:{type:'integer'}},required:['sourceFile','collection','mode','filters']}};
 const goals=['Count entries','Find holders','Check deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['entries']}));
 const seed={name:query.name,args:{sourceFile:'source.js',collection:'groups/{groupId}/archive',mode:'count',filters:[]}};
 const rejected={name:query.name,args:{...seed.args,collection:'groups/{groupId}/people',mode:'query',fields:['holder']}};
 const projection={name:query.name,args:{...rejected.args,fields:scenario==='new-fields'?['classification','holder']:['deadline','holder'],pageSize:17}};
 const blocksPopulation=scenario==='irrelevant';
 const valid={name:query.name,args:{...projection.args,collection:blocksPopulation?'groups/{groupId}/entries':rejected.args.collection}};
 let readDependency=false,progressed=false,recoveryCalls=0,reviews=0;const offeredAfterRead=[],executed=[];
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;
  if(stage==='EVIDENCE_NEXT_ACTION'){
   if(progressed)return{text:'{"toolCalls":[]}'};
   const choices=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;
   const allows=choices.filter(c=>c.properties.name.enum.includes(query.name)).some(c=>hasRequiredToolArguments({inputSchema:c.properties.args},projection.args));
   if(readDependency)offeredAfterRead.push(allows);
   return{text:JSON.stringify({toolCalls:[readDependency?(allows?projection:valid):rejected]})};
  }
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION'){recoveryCalls++;return{text:JSON.stringify({toolCalls:[{name:reader.name,args:{file:'dependency.js'}}],sourceFallback:[]})};}
  if(stage==='QUERY_POPULATION_VERIFICATION'){
   reviews++;const args=JSON.parse(request.config.chatMessages.at(-1).content).proposed;
   return{text:JSON.stringify({matchesRequest:readDependency&&args.collection===valid.args.collection,populationRelevance:scenario.startsWith('scope-')?'irrelevant':scenario==='new-fields'?(readDependency?'relevant':'irrelevant'):scenario,schemaDiscoveryRelevant:false,rejectionReason:'Evaluate the observed population separately from its requested projection.'})};
  }
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:collection===rejected.args.collection&&(scenario==='irrelevant'||scenario==='new-fields'&&!readDependency)?false:scenario==='scope-unknown'?null:true,reason:'Independently observed source relation for this objective.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['Operational evidence remains partial'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:collection===rejected.args.collection&&(scenario==='irrelevant'||scenario==='new-fields'&&!readDependency)?false:true,reason:'Only scoped partial evidence.',taskIndexes:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'source.js'}},seed],toolCatalog:[reader,query],storage:{getItem(){return null;},setItem(){},removeItem(){}},execute:async call=>{
  executed.push(call);
  if(call.name===reader.name){const next=call.args.file==='dependency.js';if(next)readDependency=true;
   const collections=next?[scenario==='new-fields'?rejected.args.collection:'events']:[seed.args.collection,rejected.args.collection,valid.args.collection];
   const fields=next&&scenario==='new-fields'?['holder','deadline','classification']:['holder','deadline'];
   return{ok:true,data:{file:call.args.file,content:'Observed holder and deadline schema',numberedContent:'1: Observed holder and deadline schema',startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections,queryShapes:collections.map(collection=>({collection,fields,fieldsComplete:true}))}}}};
  }
  if(executed.length>2){assert.deepEqual(call.args,valid.args);progressed=true;}
  const scope={...call.args,collection:call.args.collection.replace('{groupId}','approved'),orderBy:[],implicitExistenceFields:[]};
  const recordEvidence={source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope,totalCount:0,countObservedAt:new Date().toISOString()};
  if(call.args.mode==='query')Object.assign(recordEvidence,{rows:[],returnedCount:0,hasMore:false,queryExhausted:true,completeForQuery:true,consistentCountAndList:true});
  return{ok:true,data:{recordEvidence}};
 },planner:async({mission})=>runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai})});
 assert.equal(offeredAfterRead[0],!blocksPopulation,'only an explicit population veto with unchanged dependencies can block other projections');
 assert.ok(progressed,JSON.stringify({executed,offeredAfterRead,recoveryCalls,reviews,errors:result.errors}));assert.equal(recoveryCalls,1);assert.equal(reviews,2);
 assert.equal(result.status,'PARTIAL');assert.equal(result.completionAssessment.objectives.length,3);assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
});
