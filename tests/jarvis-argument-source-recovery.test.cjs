const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=process.env.JARVIS_TEST_REPO || path.resolve(__dirname,'..');
const {runJarvisSemanticPlanner}=require(path.join(root,'functions/jarvis-semantic-planner.js'));

// Reduced from mission 95d7acf0: after a filter value without source evidence,
// the model spends the recovery on another exposed query instead of a known
// unread source. Model and storage are simulated; production planner,
// orchestrator, validation, continuation budget and final closure are used.
for(const repeatRejected of [false,true])test(`ungrounded filter recovers through an observed source, cached rejection ${repeatRejected}`,async()=>{
 const {runJarvisMission}=await import(pathToFileURL(path.join(root,'gestia-core/jarvis/jarvis.mission.orchestrator.js')));
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['profiles.js','registry.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query']},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}};
 const goals=['Count units','Identify assignments','Inspect deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['units']}));
 const proposed={name:query.name,args:{sourceFile:'profiles.js',collection:'profiles',mode:'query',fields:['stamp'],filters:[{field:'stamp',op:'==',value:'value-not-observed-in-evidence'}]}};
 const stages=[],executed=[],plans=[];let discovered=false,continuations=0;
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;stages.push(stage);
  assert.ok(request.config.chatMessages.reduce((n,m)=>n+m.content.length,0)<=60000,'assembled messages retain the local bound');
  if(stage==='EVIDENCE_NEXT_ACTION')return{text:JSON.stringify({toolCalls:discovered?[]:[proposed]})};
  if(stage==='QUERY_POPULATION_VERIFICATION')return{text:JSON.stringify({matchesRequest:false,schemaDiscoveryRelevant:false,rejectionReason:'The profile source is unrelated to the requested units and deadlines.'})};
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION'){
   if(repeatRejected && ++continuations===1)return{text:JSON.stringify({toolCalls:[proposed]})};
   const variants=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;
   const hasQuery=variants.some(v=>v.properties.name.enum.includes(query.name));
   const retained=JSON.parse(request.config.chatMessages.find(m=>m.content.startsWith('RECHAZO_DE_ALCANCE=')).content.slice('RECHAZO_DE_ALCANCE='.length));
   assert.equal(retained.operationalEvidence,false);assert.equal(retained.objectiveSatisfied,false);
   return{text:JSON.stringify({toolCalls:hasQuery?[{...proposed,args:{...proposed.args,fields:['holder']}}]:[{name:reader.name,args:{file:'registry.js'}}]})};
  }
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:collection==='units',reason:collection==='units'?'Observed unit source; no records yet.':'Observed profile schema is unrelated.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['No operational unit evidence has been obtained.'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:collection==='units',reason:'Only source code has been read.',taskIndexes:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'profiles.js'}}],toolCatalog:[reader,query],
  execute:async call=>{
   executed.push(call);assert.equal(call.name,reader.name,'neither semantically rejected query may execute');
   discovered ||= call.args.file==='registry.js';
   const collection=discovered?'units':'profiles',fields=discovered?['assignment','deadline']:['stamp','holder'];
   const content=`Observed source ${collection}: ${fields.join(', ')}`;
   return{ok:true,data:{file:call.args.file,content,numberedContent:'1: '+content,startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:[collection],references:[{collection,startLine:1,content}],writeShapes:[{collection,fields,fieldsComplete:true,content}]}}}};
  },planner:async({mission})=>{
   assert.ok(plans.length<3,'no additional continuation budget');
   const response=await runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai});plans.push(response);return response;
  },storage:{getItem(){return null;},setItem(){},removeItem(){}}});
 assert.equal(discovered,true,'known alternate source must be read before abandoning recovery');
 assert.deepEqual(executed.map(c=>c.args.file),['profiles.js','registry.js']);
 assert.equal(plans[repeatRejected?1:0].planKind,'READ_ONLY_EVIDENCE_CONTINUATION');
 assert.equal(plans[repeatRejected?1:0].toolCalls[0].approved,false);
 assert.equal(stages.filter(s=>s==='QUERY_POPULATION_VERIFICATION').length,0,'ungrounded values must not reach semantic verification or execution');
 assert.equal(stages.filter(s=>s==='READ_ONLY_EVIDENCE_CONTINUATION').length,repeatRejected?2:1);
 assert.equal(result.status,'PARTIAL');assert.equal(result.completionAssessment.objectives.length,3);
 assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
 assert.ok(result.startedAt && result.updatedAt);
});
