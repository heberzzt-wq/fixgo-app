const test=require('node:test'),assert=require('node:assert/strict');
const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');

for(const scenario of ['first-objective','third-objective','none','aggregate-without-goal','incomplete-verdict'])test(`query recovery retains independent objective relevance: ${scenario}`,async()=>{
 const {runJarvisMission}=await import('../gestia-core/jarvis/jarvis.mission.orchestrator.js');
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['source.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},{kind:'repository_source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query','count']},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','filters']}};
 const goals=['Count entries','Find holders','Check deadlines'].map((objective,index)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][index],scope:'all_sources',groups:['entries']}));
 const seed={name:query.name,args:{sourceFile:'source.js',collection:'organizations/approved/archive',mode:'count',filters:[]}};
 const rejected={name:query.name,args:{...seed.args,collection:'organizations/approved/people',mode:'query',fields:['holder']}};
 const valid={name:query.name,args:{...rejected.args,fields:['deadline']}};
 let progressed=false,recoveryCalls=0,reviews=0,reviewSchema;const executed=[];
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;
  if(stage==='EVIDENCE_NEXT_ACTION')return{text:JSON.stringify({toolCalls:progressed?[]:[rejected]})};
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION'){recoveryCalls++;return{text:JSON.stringify({toolCalls:[valid],sourceFallback:[]})};}
  if(stage==='QUERY_POPULATION_VERIFICATION'){
   reviews++;reviewSchema=request.config.responseJsonSchema;
   const proposed=JSON.parse(request.config.chatMessages.at(-1).content).proposed;
   const isRecovery=proposed.fields.includes('deadline');
   const objectiveMatches={'0':isRecovery&&scenario==='first-objective','1':false,'2':isRecovery&&scenario==='third-objective'};
   if(isRecovery&&scenario==='incomplete-verdict'){delete objectiveMatches['0'];delete objectiveMatches['1'];objectiveMatches['2']=true;}
   return{text:JSON.stringify({matchesRequest:isRecovery&&['aggregate-without-goal','incomplete-verdict'].includes(scenario),objectiveMatches,populationRelevance:'irrelevant',schemaDiscoveryRelevant:false,rejectionReason:'The aggregate verdict overlooks the independent field objective.'})};
  }
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:true,reason:'Independent source scope still needs operational evidence.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['Other sources remain unqueried.'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:true,reason:'Coverage is still incomplete.',taskIndexes:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'source.js'}},seed],toolCatalog:[reader,query],storage:{getItem(){return null;},setItem(){},removeItem(){}},execute:async call=>{
  executed.push(call);
  if(call.name===reader.name)return{ok:true,data:{file:'source.js',content:'Observed holder and deadline fields.',numberedContent:'1: Observed holder and deadline fields.',startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:[seed.args.collection,rejected.args.collection],queryShapes:[seed.args.collection,rejected.args.collection].map(collection=>({collection,fields:['holder','deadline'],fieldsComplete:true}))}}}};
  if(call.args.mode==='query'){assert.deepEqual(call.args,valid.args,'a rejected projection must never execute');progressed=true;}
  return{ok:true,data:{recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...call.args,orderBy:[],implicitExistenceFields:[]},totalCount:0,...(call.args.mode==='query'?{rows:[],returnedCount:0,hasMore:false,queryExhausted:true,completeForQuery:true}:{} )}}};
 },planner:async({mission})=>runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,phase:'EVIDENCE_NEXT_ACTION'},ai})});
 assert.equal(progressed,['first-objective','third-objective'].includes(scenario),'a match for any independent objective can authorize investigation, never completion');
 assert.equal(recoveryCalls,1);assert.equal(reviews,2);
 assert.equal(result.status,'PARTIAL');assert.equal(result.completionAssessment.objectives.length,3);assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
 assert.deepEqual(reviewSchema.properties.objectiveMatches.required,['0','1','2'],'the native contract must evaluate every objective');
 assert.equal(executed.filter(call=>call.name===query.name&&call.args.mode==='query').length,progressed?1:0);
});
