const queryReviewFixture=require('./helpers/query-review-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');const root=process.env.JARVIS_TEST_REPO||path.resolve(__dirname,'..');
const {runJarvisSemanticPlanner,hasRequiredToolArguments}=require(path.join(root,'functions/jarvis-semantic-planner.js'));
for(const variant of ['open','finite','finite_mandatory','unknown_mandatory'])test(`completed filtered query cannot consume recovery; scope variant ${variant}`,async()=>{
 const fixed=variant.startsWith('finite'),mandatory=variant.endsWith('mandatory'),readAlternative=variant==='unknown_mandatory';
 const {runJarvisMission}=await import(pathToFileURL(path.join(root,'gestia-core/jarvis/jarvis.mission.orchestrator.js')));
 const oldFilters=[{field:'assignment',op:'==',value:null}],newFilters=[{field:'assignment',op:'==',value:'observed-holder'}];
 const reader={name:'repo.read',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_source'],inputSchema:{type:'object',properties:{file:{type:'string',enum:['source.js','alternate.js']}},required:['file']}};
 const query={name:'platform.query',investigationReadOnly:true,mutates:false,evidenceKinds:['platform_records'],requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},{kind:'repository_source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query']},fields:{type:'array',items:{type:'string'},minItems:1},filters:{type:'array',...(fixed?{enum:mandatory?[oldFilters,newFilters]:[[],oldFilters,newFilters]}:{}),...(mandatory?{minItems:1}:{})}},required:['sourceFile','collection','mode','fields','filters']}};
 const goals=['Count units','Identify assignments','Inspect deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['units']}));
 const seed={name:query.name,args:{sourceFile:'source.js',collection:'units',mode:'query',fields:['assignment','deadline'],filters:oldFilters}};
 const valid={...seed,args:{...seed.args,filters:fixed?newFilters:[]}};
 const irrelevant={name:query.name,args:{sourceFile:'source.js',collection:'profiles',mode:'query',fields:['stamp'],filters:readAlternative?[{field:'stamp',op:'==',value:'not-observed'}]:[]}};
 let advanced=false,offeredRepeat;const executed=[],stages=[],plans=[];
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;stages.push(stage);
  assert.ok(request.config.chatMessages.reduce((n,m)=>n+m.content.length,0)<=60000);
  if(stage==='EVIDENCE_NEXT_ACTION')return{text:JSON.stringify({toolCalls:advanced?[]:[irrelevant]})};
  if(stage==='QUERY_POPULATION_VERIFICATION'){const p=JSON.parse(request.config.chatMessages.at(-1).content).proposed;return queryReviewFixture(request,{matchesRequest:p.collection==='units',schemaDiscoveryRelevant:p.collection==='units',rejectionReason:p.collection==='units'?'':'Observed profile schema is unrelated.'});}
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION'){
   const schemas=request.config.responseJsonSchema.properties.toolCalls.items.anyOf.filter(v=>v.properties.name.enum.includes(query.name)).map(v=>v.properties.args);
   offeredRepeat=schemas.some(inputSchema=>hasRequiredToolArguments({inputSchema},seed.args));
   if(readAlternative)assert.equal(schemas.some(inputSchema=>hasRequiredToolArguments({inputSchema},{...valid.args,filters:[]})),false,'unknown mandatory filters cannot be removed to offer a broader scope');
   else assert.ok(schemas.some(inputSchema=>hasRequiredToolArguments({inputSchema},valid.args)),'the independently pertinent new operational scope must remain selectable');
   if(mandatory)assert.equal(schemas.some(inputSchema=>hasRequiredToolArguments({inputSchema},{...valid.args,filters:[]})),false,'mandatory scope is preserved');
   return{text:JSON.stringify({toolCalls:[offeredRepeat?seed:readAlternative?{name:'repo.read',args:{file:'alternate.js'}}:valid]})};
  }
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:collection==='units',reason:'Reviewed exact source definitions.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['Independent requested coverage remains incomplete.'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:collection==='units',reason:'Observed unit source; profile source unrelated.',taskIndexes:collection==='units'?[1]:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'source.js'}},seed],toolCatalog:[reader,query],execute:async call=>{
  executed.push(call);
  if(call.name===reader.name){if(executed.length>1){assert.equal(readAlternative,true);assert.equal(call.args.file,'alternate.js');advanced=true;}else assert.equal(call.args.file,'source.js');const content='Observed values include null and observed-holder.';return{ok:true,data:{file:call.args.file,content,numberedContent:'1: '+content,startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:['units','profiles'],writeShapes:[{collection:'units',fields:['assignment','deadline'],fieldsComplete:true,content},{collection:'profiles',fields:['stamp'],fieldsComplete:true,content}],references:[{collection:'units',startLine:1,content},{collection:'profiles',startLine:1,content}]}}}};}
  if(executed.length===2)assert.deepEqual(call.args,seed.args);else{assert.deepEqual(call.args,valid.args);advanced=true;}
  return{ok:true,data:{recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...call.args,orderBy:[],implicitExistenceFields:[]},rows:[],totalCount:0,returnedCount:0,hasMore:false,queryExhausted:true,completeForQuery:true,consistentCountAndList:true}}};
 },planner:async({mission})=>{assert.ok(plans.length<3);const r=await runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai});plans.push(r);return r;},storage:{getItem(){return null;},setItem(){},removeItem(){}}});
 assert.equal(offeredRepeat,false,'a completed filtered projection is not a new grounded recovery action');assert.equal(advanced,true);
 assert.equal(executed.length,3);assert.equal(stages.filter(s=>s==='READ_ONLY_EVIDENCE_CONTINUATION').length,1);
 assert.equal(result.status,'PARTIAL');assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
 assert.ok(result.startedAt&&result.updatedAt);
});
