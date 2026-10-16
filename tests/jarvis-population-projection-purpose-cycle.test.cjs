const test=require('node:test'),assert=require('node:assert/strict');
const {runJarvisSemanticPlanner,hasRequiredToolArguments}=require('../functions/jarvis-semantic-planner.js');
for(const purpose of ['count','none','membership','missing','fresh-scope','relationship-only','temporal-only'])test(`population projection preserves count versus membership purpose through recovery: ${purpose}`,async()=>{
 const {runJarvisMission}=await import('../gestia-core/jarvis/jarvis.mission.orchestrator.js');
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['source.js','unrelated.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},{kind:'repository_source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query']},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}};
 const collection='groups/approved/entries',archive='groups/approved/archive';
 const goals=['Count requested classes','Identify holders','Inspect deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['requested classes']}));
 const seed={name:query.name,args:{sourceFile:'source.js',collection:purpose==='fresh-scope'?archive:collection,mode:'query',fields:['holder','deadline'],filters:[]}};
 const optional={name:query.name,args:{...seed.args,collection,fields:['annotation']}},classification={name:query.name,args:{...optional.args,fields:['classification']}};
 const executed=[];let dependencyRead=false,progressed=false,reviews=0,recoveries=0;
 const accepted=['membership','fresh-scope','relationship-only','temporal-only'].includes(purpose);
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;
  if(stage==='EVIDENCE_NEXT_ACTION'){
   if(progressed)return{text:'{"toolCalls":[]}'};
   if(dependencyRead){const branches=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;assert.equal(branches.some(b=>b.properties.name.enum.includes(query.name)&&hasRequiredToolArguments({inputSchema:b.properties.args},optional.args)),false,'an unrelated source read cannot revive the rejected optional projection');}
   return{text:JSON.stringify({toolCalls:[dependencyRead?classification:optional]})};
  }
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION'){recoveries++;return{text:JSON.stringify({toolCalls:[{name:reader.name,args:{file:'unrelated.js'}}],sourceFallback:[]})};}
  const packet=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='QUERY_POPULATION_VERIFICATION'){
   reviews++;const isClassification=packet.proposed.fields.includes('classification');
   const verdict={matchesRequest:true,populationRelevance:'relevant',schemaDiscoveryRelevant:false,rejectionReason:'',objectiveMatches:{0:true,1:false,2:false},objectiveFields:{0:[packet.proposed.fields[0]],1:[],2:[]}};
   if(!isClassification&&['relationship-only','temporal-only'].includes(purpose)){const index=purpose==='relationship-only'?'1':'2';verdict.objectiveMatches={'0':false,'1':false,'2':false};verdict.objectiveMatches[index]=true;verdict.objectiveFields={'0':[],'1':[],'2':[]};verdict.objectiveFields[index]=['annotation'];}
   if(purpose!=='missing'||isClassification)verdict.populationFieldPurposes={0:isClassification?'membership':purpose==='membership'?'membership':purpose==='none'?'none':'count'};
   return{text:JSON.stringify(verdict)};
  }
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(packet.sources.map(c=>[c,{relevantToObjective:true,reason:'Related scoped evidence, not global coverage.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['Other operational coverage remains pending.'],groups:[],sources:packet.observedSources.map(c=>({collection:c,relevant:true,reason:'Related scoped evidence, not global coverage.',taskIndexes:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'source.js'}},seed],toolCatalog:[reader,query],storage:{getItem(){return null},setItem(){},removeItem(){}},execute:async call=>{
  executed.push(call);
  if(call.name===reader.name){dependencyRead=call.args.file==='unrelated.js';return{ok:true,data:{file:call.args.file,content:'Credited holder, deadline, annotation and classification schema',numberedContent:'1: Credited schema',startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:dependencyRead?[]:[collection,archive],queryShapes:dependencyRead?[]:[collection,archive].map(c=>({collection:c,fields:['holder','deadline','annotation','classification'],fieldsComplete:true}))}}}};}
  if(executed.filter(c=>c.name===query.name).length>1){assert.deepEqual(call.args,accepted?optional.args:classification.args,'count/none/incomplete purpose cannot authorize an optional field on an already fully observed scope');progressed=true;}
  return{ok:true,data:{recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...call.args,orderBy:[],implicitExistenceFields:[]},rows:[{id:'entry-a',values:Object.fromEntries(call.args.fields.map(f=>[f,'Observed '+f]))}],returnedCount:1,queryExhausted:true,completeForQuery:true,hasMore:false,consistentCountAndList:true}}};
 },planner:async({mission})=>runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai})});
 assert.ok(progressed,JSON.stringify({reviews,recoveries,errors:result.errors}));assert.equal(reviews,accepted?1:2);assert.equal(recoveries,accepted?0:1);assert.equal(result.status,'PARTIAL');assert.ok(result.completionAssessment.objectives.every(g=>g.satisfied===false&&g.requiredEvidenceKind==='platform_records'));
});
