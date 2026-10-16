const queryReviewFixture=require('./helpers/query-review-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {runJarvisSemanticPlanner,hasRequiredToolArguments}=require('../functions/jarvis-semantic-planner.js');

test('a rejected count is removed before recovery while a grounded projection advances the full mission loop',async()=>{
 const {runJarvisMission}=await import('../gestia-core/jarvis/jarvis.mission.orchestrator.js');
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['source.js','next-source.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},{kind:'repository_source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['count','query']},fields:{type:'array',items:{type:'string'}},filters:{type:'array'},orderBy:{type:'array'},pageSize:{type:'integer'}},required:['sourceFile','collection','mode','filters']}};
 const goals=['Count entries','Find holders','Check deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['entries']}));
 const seed={name:query.name,args:{sourceFile:'source.js',collection:'groups/{groupId}/archive',mode:'count',filters:[]}};
 const rejected={name:query.name,args:{...seed.args,collection:'groups/{groupId}/people'}};
 const progress={name:query.name,args:{...rejected.args,mode:'query',fields:['holder','deadline']}};
 const executed=[],plans=[];let advanced=false,recoverySeen=false,rejectedOffered=false,resizedOffered=false,progressOffered=false;
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;
  if(stage==='EVIDENCE_NEXT_ACTION')return{text:JSON.stringify({toolCalls:advanced?[]:[rejected]})};
  if(stage==='QUERY_POPULATION_VERIFICATION'){
   const proposed=queryReviewFixture.packet(request).proposed;
   return queryReviewFixture(request,{matchesRequest:proposed.mode==='query',schemaDiscoveryRelevant:proposed.mode==='query',rejectionReason:proposed.mode==='count'?'Counting people does not answer the requested entries; inspect the credited relationship fields.':''});
  }
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION'){
   recoverySeen=true;
   const choices=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;
   const schemas=choices.filter(c=>c.properties.name.enum.includes(query.name)).map(c=>({inputSchema:c.properties.args}));
   rejectedOffered=schemas.some(t=>hasRequiredToolArguments(t,rejected.args));
   resizedOffered=schemas.some(t=>hasRequiredToolArguments(t,{...rejected.args,pageSize:100}));
   progressOffered=schemas.some(t=>hasRequiredToolArguments(t,progress.args));
   return{text:JSON.stringify({toolCalls:[rejectedOffered?rejected:progress]})};
  }
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:true,reason:'The observed relationship fields can contribute evidence; coverage remains incomplete.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['No complete operational coverage'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:true,reason:'Observed source requiring operational evidence.',taskIndexes:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'source.js'}},seed],toolCatalog:[reader,query],storage:{getItem(){return null;},setItem(){},removeItem(){}},execute:async call=>{
  executed.push(call);
  if(call.name===reader.name){const content='Observed holder and deadline fields';return{ok:true,data:{file:'source.js',content,numberedContent:'1: '+content,startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:[seed.args.collection,rejected.args.collection],queryShapes:[{collection:seed.args.collection,fields:['holder','deadline'],fieldsComplete:true},{collection:rejected.args.collection,fields:['holder','deadline'],fieldsComplete:true}]}}}};}
  if(executed.length>2){assert.deepEqual(call.args,progress.args);advanced=true;}
  return{ok:true,data:{recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...call.args,collection:call.args.collection.replace('{groupId}','approved'),orderBy:[],implicitExistenceFields:[]},rows:[],totalCount:0,returnedCount:0,hasMore:false,queryExhausted:true,completeForQuery:true,consistentCountAndList:true}}};
 },planner:async({mission})=>{const plan=await runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai});plans.push(plan);return plan;}});
 assert.ok(recoverySeen);
 assert.equal(rejectedOffered,false,'the same rejected count must not be offered again');
 assert.equal(resizedOffered,false,'page size is not a relevant count dependency');
 assert.ok(progressOffered,'a credited projection of the same route remains eligible');
 assert.ok(advanced,'a valid alternative must reach execution after rejection');
 assert.equal(executed.filter(call=>call.name===query.name).length,2);
 assert.equal(result.status,'PARTIAL');assert.equal(result.completionAssessment.objectives.length,3);
 assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
});
