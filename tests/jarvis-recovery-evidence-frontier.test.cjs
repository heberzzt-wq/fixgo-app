const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=process.env.JARVIS_TEST_REPO||path.resolve(__dirname,'..');
const {runJarvisSemanticPlanner,hasRequiredToolArguments}=require(path.join(root,'functions/jarvis-semantic-planner.js'));

for(const missing of ['field','value'])for(const alternative of ['operational','operational_with_repository','none'])test(`source-evidence recovery for missing ${missing}, alternative ${alternative}`,async()=>{
 const {runJarvisMission}=await import(pathToFileURL(path.join(root,'gestia-core/jarvis/jarvis.mission.orchestrator.js')));
 const collections=alternative.startsWith('operational')?['profiles','units','available_only']:['profiles'];
 const fields={profiles:['stamp'],units:['assignment','deadline'],available_only:['label']};
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:alternative==='operational_with_repository'?['observed.js','available-source.js']:['observed.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},{kind:'repository_source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query']},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}};
 const goals=['Count units','Identify assignments','Inspect deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['units']}));
 const seed={name:query.name,args:{sourceFile:'observed.js',collection:'profiles',mode:'query',fields:['stamp'],filters:[{field:'stamp',op:'==',value:null}]}};
 const invalid={...seed,args:{...seed.args,filters:[{field:missing==='field'?'unobserved-field':'stamp',op:'==',value:missing==='value'?'unobserved-value':null}]}};
 const valid={name:query.name,args:{sourceFile:'observed.js',collection:'units',mode:'query',fields:['assignment','deadline'],filters:[]}};
 const unrelated={name:query.name,args:{sourceFile:'observed.js',collection:'available_only',mode:'query',fields:['label'],filters:[]}};
 const executed=[],plans=[],stages=[];let queried=false,offeredOperational=false,offeredMerelyAvailable=false;
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;stages.push(stage);
  assert.ok(request.config.chatMessages.reduce((n,m)=>n+m.content.length,0)<=60000);
  if(stage==='EVIDENCE_NEXT_ACTION')return{text:JSON.stringify({toolCalls:queried?[]:[invalid]})};
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION'){
   const variants=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;
   const schemas=variants.filter(v=>v.properties.name.enum.includes(query.name)).map(v=>v.properties.args);
   offeredOperational=schemas.some(inputSchema=>hasRequiredToolArguments({inputSchema},valid.args));
   offeredMerelyAvailable=schemas.some(inputSchema=>hasRequiredToolArguments({inputSchema},unrelated.args));
   const rejected=JSON.parse(request.config.chatMessages.find(m=>m.content.startsWith('RECHAZO_DE_ALCANCE=')).content.slice('RECHAZO_DE_ALCANCE='.length));
   assert.equal(rejected.requiresSourceEvidence,true);assert.equal(rejected.operationalEvidence,false);
   return{text:JSON.stringify({toolCalls:offeredOperational?[valid]:[]})};
  }
  if(stage==='QUERY_POPULATION_VERIFICATION'){
   const payload=JSON.parse(request.config.chatMessages.at(-1).content);
   assert.equal(payload.proposed.collection,'units','only the selected grounded operation reaches its independent validator');
   return{text:'{"matchesRequest":true,"schemaDiscoveryRelevant":true,"rejectionReason":""}'};
  }
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:collection==='units',reason:collection==='units'?'Observed assignment and deadline source.':'Not independently pertinent to requested units.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['Independent operational coverage remains incomplete.'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:collection!=='profiles',reason:collection==='units'?'Observed unit fields.':'Availability alone is not operational proof; independent review must reconcile this source.',taskIndexes:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'observed.js'}},seed],toolCatalog:[reader,query],
  execute:async call=>{
   executed.push(call);
   if(call.name===reader.name){const content='Observed collection fields; values may be null.';return{ok:true,data:{file:'observed.js',content,numberedContent:'1: '+content,startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections,writeShapes:collections.map(collection=>({collection,fields:fields[collection],fieldsComplete:true,content})),references:collections.map(collection=>({collection,startLine:1,content}))}}}};}
   if(executed.length===2)assert.deepEqual(call.args,seed.args);
   else{assert.deepEqual(call.args,valid.args);queried=true;}
   return{ok:true,data:{recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...call.args,orderBy:[],implicitExistenceFields:[]},rows:[],totalCount:0,returnedCount:0,hasMore:false,queryExhausted:true,completeForQuery:true,consistentCountAndList:true}}};
  },planner:async({mission})=>{
   assert.ok(plans.length<3,'existing orchestrator continuation bound remains intact');
   const response=await runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai});plans.push(response);return response;
  },storage:{getItem(){return null;},setItem(){},removeItem(){}}});
 assert.equal(queried,alternative.startsWith('operational'),'a grounded operational alternative must survive the recovery frontier');
 assert.equal(offeredMerelyAvailable,false,'an unresolved available source is not a grounded recovery operation');
 assert.equal(executed.length,alternative.startsWith('operational')?3:2,'no invented filter or unrelated operation executes');
 assert.equal(result.status,'PARTIAL');assert.equal(result.completionAssessment.objectives.length,3);
 assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
 assert.ok(result.startedAt&&result.updatedAt&&result.reason);
 assert.ok(stages.filter(s=>s==='READ_ONLY_EVIDENCE_CONTINUATION').length<=1,'no added retries');
 if(alternative==='none')assert.equal(stages.filter(s=>s==='READ_ONLY_EVIDENCE_CONTINUATION').length,0,'exhausted catalog needs no invented recovery call');
});
