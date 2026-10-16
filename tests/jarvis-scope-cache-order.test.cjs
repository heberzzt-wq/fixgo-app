const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=process.env.JARVIS_TEST_REPO || path.resolve(__dirname,'..');
const {runJarvisSemanticResponse,eligibleEvidenceActionCatalog,hasRequiredToolArguments}=require(path.join(root,'functions/jarvis-semantic-planner.js'));
const record=()=>({source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{sourceFile:'source.js',collection:'fleet/approved/units',filters:[],fields:['owner'],mode:'query',orderBy:[{field:'__name__',direction:'asc'}],implicitExistenceFields:[],cursor:null},rows:[{id:'unit-1',values:{owner:'Registered holder'}}],returnedCount:1,queryExhausted:true,completeForQuery:true,hasMore:false});
const tool={name:'platform.query',description:'Read observed records',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{sourceFile:{type:'string',enum:['source.js']},collection:{type:'string',enum:['fleet/{tenantId}/units','fleet/other/units']},mode:{type:'string',enum:['query','count']},fields:{type:'array',minItems:1,maxItems:4,items:{type:'string',enum:['owner','stamp','__name__']}},filters:{type:'array',maxItems:0},orderBy:{type:'array',maxItems:0}},required:['sourceFile','collection','mode','filters']}};
test('changing coverage exclusions cannot reorder the independent schema cache dependency',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-15T10:00:00Z')});
 const {pathToFileURL}=require('node:url');
 const {runJarvisMission}=await import(pathToFileURL(path.join(root,'gestia-core/jarvis/jarvis.mission.orchestrator.js')));
 const {runJarvisSemanticPlanner}=require(path.join(root,'functions/jarvis-semantic-planner.js'));
 const goals=['Count units','Identify holders','Inspect deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['units']}));
 const reader={name:'repo.read',description:'Read a discovered source',mutates:false,investigationReadOnly:true,evidenceKinds:['repository_source'],inputSchema:{type:'object',properties:{file:{type:'string',enum:['source.js']}},required:['file']}};
 const query={...tool,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}]};
 const args={sourceFile:'source.js',collection:'fleet/{tenantId}/units',mode:'query',fields:['owner','stamp'],filters:[]};
 const observed=record();observed.scope.fields=args.fields;observed.rows[0].values.stamp='2026-10-15T10:00:00.500Z';
 observed.fieldSchema={source:'SERVER_RECORD_FIELD_NAMES',collection:observed.scope.collection,scope:'returned_rows_only',sampledRows:1,paths:['owner','stamp'],completeForObservedRows:true};
 const stages=[],requests=[],executed=[];let rounds=0,lastState;
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;stages.push(stage);
  assert.ok(request.config.chatMessages.reduce((n,m)=>n+m.content.length,0)<=60000,'the final assembled request must fit the local limit');
  if(stage==='EVIDENCE_NEXT_ACTION')return{text:JSON.stringify({toolCalls:[{name:query.name,args}]})};
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION')return{text:JSON.stringify({toolCalls:[{name:query.name,args:{...args,fields:['invented-field']}}]})};
  if(stage==='QUERY_POPULATION_VERIFICATION')return{text:'{"matchesRequest":false,"schemaDiscoveryRelevant":false,"rejectionReason":"Already observed projection does not add evidence"}'};
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION'){
   requests.push(payload);
   assert.ok(payload.sourceDefinitions.some(d=>d.collection===args.collection&&d.resolvedCollection===observed.scope.collection&&d.fields.includes('stamp')),'only the authenticated submitted template receives the resolved names');
   return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:true,reason:'Scope remains pending'}]))})};
  }
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['Unobserved profiles remain necessary'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:collection!=='profiles'||rounds<2,reason:'Pending independent scope',taskIndexes:collection==='profiles'?[]:[1]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,
  initialToolCalls:[{name:reader.name,args:{file:'source.js'}},{name:query.name,args}],toolCatalog:[reader,query],
  execute:async call=>{
   executed.push(call.name);
   if(call.name===reader.name)return{ok:true,data:{file:'source.js',content:'Observed unit owner and deadline; profiles remain separate.',numberedContent:'1: Observed unit owner and deadline; profiles remain separate.',startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:[args.collection,'profiles'],queryShapes:[{collection:args.collection,fields:['owner','stamp']},{collection:'profiles',fields:['owner']}],writeShapes:[]}}}};
   return{ok:true,data:{recordEvidence:structuredClone(observed)}};
  },planner:async({mission})=>{
   t.mock.timers.setTime(Date.parse('2026-10-15T10:00:00Z')+(++rounds)*1000);
   assert.ok(rounds<=2,'the original continuation budget must remain bounded');
   return runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:(lastState={...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'}),ai});
  },storage:{getItem(){return null;},setItem(){},removeItem(){}}});
 assert.equal(result.status,'PARTIAL');assert.equal(result.reason,'PLANNER_RECOVERY_EXHAUSTED',JSON.stringify({errors:result.errors,stages,blocked:result.blockedTasks}));
 assert.deepEqual(executed,['repo.read','platform.query']);assert.equal(rounds,2);
 assert.equal(stages.filter(s=>s==='RECORD_OBJECTIVE_COVERAGE').length,3,'pending recovery is not a closure review; the exhausted cycle independently reviews each goal');
 rounds=3;t.mock.timers.setTime(Date.parse('2026-10-15T10:00:03Z'));
 const replay=await runJarvisSemanticPlanner({input:goals.map(g=>g.objective).join('; '),catalog:[reader,query],missionState:{...lastState,completionAssessment:result.completionAssessment},ai});
 assert.equal(replay.missionComplete,false);assert.ok(replay.completionAssessment.objectives.every(o=>o.satisfied===false));
 assert.equal(stages.filter(s=>s==='RECORD_OBJECTIVE_COVERAGE').length,4,'a later exact-clock temporal review remains mandatory after independent closure coverage');
 assert.equal(requests.length,3,'one independently keyed source review per objective');
 assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
});
