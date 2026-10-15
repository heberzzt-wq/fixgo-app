const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=process.env.JARVIS_TEST_REPO || path.resolve(__dirname,'..');
const {runJarvisSemanticResponse,eligibleEvidenceActionCatalog,hasRequiredToolArguments}=require(path.join(root,'functions/jarvis-semantic-planner.js'));
const record=()=>({source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{sourceFile:'source.js',collection:'fleet/approved/units',filters:[],fields:['owner'],mode:'query',orderBy:[{field:'__name__',direction:'asc'}],implicitExistenceFields:[],cursor:null},rows:[{id:'unit-1',values:{owner:'Registered holder'}}],returnedCount:1,queryExhausted:true,completeForQuery:true,hasMore:false});
async function present(records){return runJarvisSemanticResponse({input:'Show verified records',responseInstruction:'Show verified records',responseMode:'grounded_conversation',responseBriefing:JSON.stringify({missionStatus:'PARTIAL',objectiveCoverage:[{objective:'Find remaining registry',satisfied:false,limitation:'Other evidence is pending.'}],platformRecordEvidence:records}),ai:{models:{generateContent:async request=>({text:JSON.stringify({requestedLineCount:0,factIds:request.config.responseJsonSchema.properties.factIds.items.enum})})}}});}
test('equivalent complete list and count have one scoped summary and preserve pending goals',async()=>{
 const query=record(),count={...query,scope:{...query.scope,mode:'count',fields:[],orderBy:[]},rows:undefined,returnedCount:undefined,totalCount:1};
 const original=JSON.stringify([query,count,query]);const result=await present([query,count,query]);
 assert.equal((result.message.match(/En la fuente/g)||[]).length,1);
 assert.equal((result.message.match(/Registered holder/g)||[]).length,1);
 assert.match(result.message,/Find remaining registry/);assert.match(result.message,/parcial/);
 assert.equal(JSON.stringify([query,count,query]),original);
});
for(const [name,change] of [
 ['another organization',r=>{r.scope.collection='fleet/other/units';}],
 ['another source file',r=>{r.scope.sourceFile='other.js';}],
 ['another filter',r=>{r.scope.filters=[{field:'owner',op:'==',value:'Registered holder'}];}],
 ['an implicit existence constraint',r=>{r.scope.implicitExistenceFields=['owner'];}],
 ['a conflicting count',r=>{r.totalCount=2;}],
 ['a partial page',r=>{r.hasMore=true;r.completeForQuery=false;r.queryExhausted=false;}]
])test('presentation preserves '+name,async()=>{
 const first=record(),second=record();change(second);const result=await present([first,second]);
 assert.equal((result.message.match(/En la fuente/g)||[]).length,2);
 assert.match(result.message,/Other evidence is pending/);
});
test('same row identity with conflicting values remains visible',async()=>{
 const first=record(),second=record();second.rows[0].values.owner='Changed holder';
 const result=await present([first,second]);assert.match(result.message,/Registered holder/);assert.match(result.message,/Changed holder/);
});

const tool={name:'platform.query',description:'Read observed records',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{sourceFile:{type:'string',enum:['source.js']},collection:{type:'string',enum:['fleet/{tenantId}/units','fleet/other/units']},mode:{type:'string',enum:['query','count']},fields:{type:'array',minItems:1,maxItems:4,items:{type:'string',enum:['owner','stamp','__name__']}},filters:{type:'array',maxItems:0},orderBy:{type:'array',maxItems:0}},required:['sourceFile','collection','mode','filters']}};
test('the native recovery frontier removes completed actions while retaining new fields and other tenants',()=>{
 const observed=record(),args={sourceFile:'source.js',collection:'fleet/{tenantId}/units',mode:'query',fields:['owner'],filters:[]};
 const count={...record(),scope:{...record().scope,mode:'count',fields:[],orderBy:[]},rows:[],totalCount:1};
 const tasks=[{name:tool.name,args,observation:{ok:true,recordEvidence:observed}},{name:tool.name,args:{...args,mode:'count',fields:[]},observation:{ok:true,recordEvidence:count}}];
 const frontier=eligibleEvidenceActionCatalog([tool],tasks)[0];
 assert.ok(frontier);assert.equal(hasRequiredToolArguments(frontier,args),false,'completed projection must not be offered again');
 assert.equal(hasRequiredToolArguments(frontier,{...args,mode:'count',fields:[]}),false,'completed count must not be offered again');
 assert.equal(hasRequiredToolArguments(frontier,{...args,fields:['stamp','owner']}),true,'an observed but unread field remains actionable');
 assert.equal(hasRequiredToolArguments(frontier,{...args,collection:'fleet/other/units'}),true,'another organization cannot inherit coverage');
});

test('nonempty temporal evidence crosses the complete mission recovery and closure without repeating schema relevance',async t=>{
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
 const stages=[],requests=[],executed=[];let rounds=0;
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
  return{text:JSON.stringify({proven:false,missing:['Unobserved profiles remain necessary'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:true,reason:'Pending independent scope',taskIndexes:collection==='profiles'?[]:[1]}))})};
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
   return runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai});
  },storage:{getItem(){return null;},setItem(){},removeItem(){}}});
 assert.equal(result.status,'PARTIAL');assert.equal(result.reason,'PLANNER_RECOVERY_EXHAUSTED',JSON.stringify({errors:result.errors,stages,blocked:result.blockedTasks}));
 assert.deepEqual(executed,['repo.read','platform.query']);assert.equal(rounds,2);
 assert.equal(stages.filter(s=>s==='RECORD_OBJECTIVE_COVERAGE').length,4,'three initial reviews and the exact-clock temporal review');
 assert.equal(requests.length,3,'one independently keyed source review per objective');
 assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
});


for(const [name,change] of [
 ['an unauthenticated receipt',t=>{t.observation.recordEvidence.source='UNAUTHENTICATED';}],
 ['a writable receipt',t=>{t.observation.recordEvidence.readOnly=false;}],
 ['a blocked receipt',t=>{t.observation.blocked=true;}],
 ['mismatched filters',t=>{t.observation.recordEvidence.scope.filters=[{field:'owner',op:'==',value:'another'}];}],
 ['a different source file',t=>{t.observation.recordEvidence.scope.sourceFile='other.js';}],
 ['an unrelated resolved route',t=>{t.observation.recordEvidence.scope.collection='unrelated/approved/units';}],
 ['an implicit existence constraint',t=>{t.observation.recordEvidence.scope.implicitExistenceFields=['owner'];}]
])test('action frontier cannot reuse '+name,()=>{
 const args={sourceFile:'source.js',collection:'fleet/{tenantId}/units',mode:'query',fields:['owner'],filters:[]};
 const task={name:tool.name,args,observation:{ok:true,recordEvidence:record()}};change(task);
 const frontier=eligibleEvidenceActionCatalog([tool],[task])[0];
 assert.equal(hasRequiredToolArguments(frontier,args),true);
});

test('distinct record IDs with equal displayed values are not merged',async()=>{
 const r=record();r.rows.push({id:'unit-2',values:{owner:'Registered holder'}});r.returnedCount=2;
 const result=await present([r]);assert.equal((result.message.match(/Registered holder/g)||[]).length,2);
});
