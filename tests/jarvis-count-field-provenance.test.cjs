const queryReviewFixture=require('./helpers/query-review-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=process.env.JARVIS_TEST_REPO||path.resolve(__dirname,'..');
const {runJarvisSemanticPlanner,hasRequiredToolArguments}=require(path.join(root,'functions/jarvis-semantic-planner.js'));

for(const projection of ['forbidden','absent'])test('count filter fields stay source-scoped with '+projection+' projection through mission closure',async()=>{
 const {runJarvisMission}=await import(pathToFileURL(path.join(root,'gestia-core/jarvis/jarvis.mission.orchestrator.js')));
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['source.js']}},required:['file']}};
 const properties={sourceFile:{type:'string'},collection:{type:'string',enum:['primary','separate']},mode:{type:'string',enum:['count']},filters:{type:'array',maxItems:4,items:{type:'object',properties:{field:{type:'string'},op:{type:'string',enum:['==']},value:{type:['string','null']}},required:['field','op','value']}}};
 if(projection==='forbidden')properties.fields={type:'array',maxItems:0,items:{type:'string'}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties,required:['sourceFile','collection','mode','filters']}};
 const goals=['Count entries','Identify relationships','Inspect deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['entries']}));
 const invalid={name:query.name,args:{sourceFile:'source.js',collection:'primary',mode:'count',filters:[{field:'foreignLabel',op:'==',value:null}]}};
 const valid={name:query.name,args:{sourceFile:'source.js',collection:'primary',mode:'count',filters:[]}};
 let counted=false,offeredInvalid;const executed=[],stages=[];
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;stages.push(stage);
  assert.ok(request.config.chatMessages.reduce((n,m)=>n+m.content.length,0)<=60000);
  if(stage==='EVIDENCE_NEXT_ACTION'){
   const variants=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;
   if(counted)return{text:'{"toolCalls":[]}'};
   const schemas=variants.filter(v=>v.properties.name.enum.includes(query.name)).map(v=>v.properties.args);
   offeredInvalid=schemas.some(inputSchema=>hasRequiredToolArguments({inputSchema},invalid.args));
   assert.ok(schemas.some(inputSchema=>hasRequiredToolArguments({inputSchema},valid.args)),'the grounded unfiltered count remains available');
   assert.ok(schemas.some(inputSchema=>hasRequiredToolArguments({inputSchema},{...valid.args,filters:[{field:'ownLabel',op:'==',value:null}]})),'own source fields remain available');
   assert.ok(schemas.some(inputSchema=>hasRequiredToolArguments({inputSchema},{...invalid.args,collection:'separate'})),'the other collection retains its own field');
   return{text:JSON.stringify({toolCalls:[offeredInvalid?invalid:valid]})};
  }
  if(stage==='QUERY_POPULATION_VERIFICATION')return queryReviewFixture(request,{"matchesRequest":true,"schemaDiscoveryRelevant":true,"rejectionReason":""});
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION')return{text:'{"toolCalls":[]}'};
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:true,reason:'Unresolved independent source.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['Independent evidence remains unavailable.'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:true,reason:'Pending independent coverage.',taskIndexes:collection==='primary'&&counted?[1]:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'source.js'}}],toolCatalog:[reader,query],
  execute:async call=>{
   executed.push(call);
   if(call.name===reader.name){const content='Primary stores ownLabel. Separate stores foreignLabel. Values may be null.';return{ok:true,data:{file:'source.js',content,numberedContent:'1: '+content,startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:['primary','separate'],writeShapes:[{collection:'primary',fields:['ownLabel'],fieldsComplete:true},{collection:'separate',fields:['foreignLabel'],fieldsComplete:true}],references:[{collection:'primary',startLine:1,content},{collection:'separate',startLine:1,content}]}}}};}
   assert.deepEqual(call.args,valid.args,'a foreign-field count must never execute');counted=true;
   return{ok:true,data:{recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...valid.args,fields:[],orderBy:[],implicitExistenceFields:[]},totalCount:2,countObservedAt:new Date().toISOString()}}};
  },planner:({mission})=>runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai}),storage:{getItem(){return null;},setItem(){},removeItem(){}}});
 assert.equal(offeredInvalid,false,'native count grammar must exclude fields belonging only to a different collection');
 assert.equal(counted,true,'the model must receive an executable grounded count alternative');
 assert.deepEqual(executed.map(c=>c.name),['repo.read','platform.query']);
 assert.equal(result.status,'PARTIAL');assert.equal(result.completionAssessment.objectives.length,3);
 assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
 assert.ok(result.startedAt&&result.updatedAt);
});
