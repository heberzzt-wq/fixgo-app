const test=require('node:test'),assert=require('node:assert/strict');
const {runJarvisSemanticPlanner,hasRequiredToolArguments}=require('../functions/jarvis-semantic-planner.js');
const {eligibleEvidenceActionCatalog}=require('../functions/jarvis-semantic-planner.js');

for(const scenario of ['same-route','receipt-alias','other-organization','partial','untrusted','missing-id'])test(`implicit authenticated document IDs retain ${scenario} query scope`,()=>{
 const resolved='organizations/approved/entries',requested=scenario==='receipt-alias'?'organizations/{tenantId}/entries':resolved;
 const args={sourceFile:'source.js',collection:requested,mode:'query',fields:['holder'],filters:[],orderBy:[]};
 const record={source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...args,collection:resolved,implicitExistenceFields:[]},rows:[{id:'entry',values:{holder:'Known holder'}}],returnedCount:1,totalCount:1,hasMore:false,completeForQuery:true,queryExhausted:true,truncatedFields:[]};
 if(scenario==='partial'){record.hasMore=true;record.completeForQuery=false;}
 if(scenario==='untrusted')record.source='LOCAL_FIXTURE';
 if(scenario==='missing-id')delete record.rows[0].id;
 const collection=scenario==='other-organization'?'organizations/other/entries':resolved;
 const tool={name:'platform.query',evidenceKinds:['platform_records'],inputSchema:{type:'object',properties:{sourceFile:{type:'string',enum:['source.js']},collection:{type:'string',enum:[collection]},mode:{type:'string',enum:['query']},fields:{type:'array',minItems:1,items:{type:'string',enum:['holder','deadline','__name__']}},filters:{type:'array',maxItems:0},orderBy:{type:'array',maxItems:0}},required:['sourceFile','collection','mode','fields','filters']}};
 const tasks=[{name:tool.name,args,observation:{ok:true,recordEvidence:record}}];
 const catalog=eligibleEvidenceActionCatalog([tool],tasks),candidate={...args,collection,fields:['__name__'],pageSize:100,includeCount:true};
 delete candidate.pageSize;delete candidate.includeCount;
 const allows=fields=>catalog.some(tool=>hasRequiredToolArguments(tool,{...candidate,fields}));
 assert.equal(allows(['__name__']),!['same-route','receipt-alias'].includes(scenario),'a full authenticated row already supplies its document ID');
 assert.equal(allows(['deadline']),true,'new projected values must remain queryable');
});

for(const scenario of ['partial-page','filtered','other-organization','truncated','missing-value','observed-null','ambiguous-null','unauthenticated','newer-row','newer-value'])test(`equality frontier preserves ${scenario} boundaries`,()=>{
 const args={sourceFile:'source.js',collection:'organizations/approved/entries',mode:'query',fields:['marker'],filters:[],orderBy:[]};
 const record={source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...args,implicitExistenceFields:[]},rows:[{id:'entry',values:{marker:'observed'}}],returnedCount:1,hasMore:false,completeForQuery:true,queryExhausted:true,truncatedFields:[]};
 const tasks=[{name:'platform.query',args:structuredClone(args),observation:{ok:true,recordEvidence:record}}];
 if(scenario==='partial-page')record.hasMore=true;
 if(scenario==='filtered'){args.filters=[{field:'marker',op:'!=',value:null}];tasks[0].args.filters=args.filters;record.scope.filters=args.filters;}
 if(scenario==='other-organization')record.scope.collection=tasks[0].args.collection='organizations/other/entries';
 if(scenario==='truncated')record.truncatedFields=['marker'];
 if(scenario==='missing-value')delete record.rows[0].values.marker;
 if(['observed-null','ambiguous-null'].includes(scenario))record.rows[0].values.marker=null;
 if(scenario==='unauthenticated')record.source='LOCAL_FIXTURE';
 if(scenario.startsWith('newer-')){const later=structuredClone(tasks[0]);later.observation.recordEvidence.rows=[{id:scenario==='newer-row'?'new-entry':'entry',values:{marker:'new-value'}}];later.args.filters=[{field:'marker',op:'!=',value:null}];later.observation.recordEvidence.scope.filters=later.args.filters;tasks.push(later);}
 const tool={name:'platform.query',evidenceKinds:['platform_records'],inputSchema:{type:'object',properties:{sourceFile:{type:'string',enum:['source.js']},collection:{type:'string',enum:['organizations/approved/entries']},mode:{type:'string',enum:['query']},fields:{type:'array',minItems:1,items:{type:'string',enum:['marker','deadline']}},filters:{type:'array',items:{type:'object',properties:{field:{type:'string',enum:['marker','deadline']},op:{type:'string',enum:['==','!=']},value:{type:['string','null']}},required:['field','op','value']}},orderBy:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}};
 const requested={...args,collection:'organizations/approved/entries',fields:['deadline'],filters:[{field:'marker',op:'==',value:null}]};
 if(scenario==='ambiguous-null')requested.filters[0].value='not-excluded-by-missing-projection';
 const frontier=eligibleEvidenceActionCatalog([tool],tasks);
 assert.equal(frontier.some(tool=>hasRequiredToolArguments(tool,requested)),scenario!=='newer-value','incomplete or unrelated evidence cannot exclude values; a newer complete projection of every anchored ID replaces its old value');
 if(scenario==='newer-value'){
  assert.equal(frontier.some(tool=>hasRequiredToolArguments(tool,{...requested,filters:[{field:'marker',op:'==',value:'observed'}]})),false,'the superseded value must not remain usable');
  assert.equal(frontier.some(tool=>hasRequiredToolArguments(tool,{...requested,filters:[{field:'marker',op:'==',value:'new-value'}]})),true,'the new authenticated value must still advance a query for unread fields');
 }
});

for(const scenario of ['new-fields','witnessed-filter','implicit-ids'])test(`authenticated projection rejection and recovery preserves ${scenario}`,async()=>{
 const useWitnessedFilter=scenario==='witnessed-filter';
 const {runJarvisMission}=await import('../gestia-core/jarvis/jarvis.mission.orchestrator.js');
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['source.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},{kind:'repository_source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query']},fields:{type:'array',items:{type:'string'},minItems:1},filters:{type:'array',items:{type:'object',properties:{field:{type:'string'},op:{type:'string',enum:['==','!=']},value:{type:['string','null']}},required:['field','op','value']}},orderBy:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}};
 const goals=['Count entries','Find holders','Check deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['entries']}));
 const seed={name:query.name,args:{sourceFile:'source.js',collection:'organizations/{organizationId}/entries',mode:'query',fields:['marker'],filters:[],orderBy:[]}};
 const invalid={name:query.name,args:{...seed.args,fields:scenario==='implicit-ids'?['__name__']:['holder','deadline'],filters:scenario==='implicit-ids'?[]:[{field:'marker',op:'==',value:null}]}};
 const valid={name:query.name,args:{...invalid.args,fields:['holder','deadline'],filters:useWitnessedFilter?[{field:'marker',op:'==',value:'ZETA-7319'}]:[]}};
 let progressed=false,recoveries=0,frontierFacts;const executed=[];
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;
  if(stage==='EVIDENCE_NEXT_ACTION'){
   if(progressed)return{text:'{"toolCalls":[]}'};
   const schemas=request.config.responseJsonSchema.properties.toolCalls.items.anyOf.filter(t=>t.properties.name.enum.includes(query.name)).map(t=>t.properties.args);
   const allows=args=>schemas.some(inputSchema=>hasRequiredToolArguments({inputSchema},args));
   frontierFacts={invalid:allows(invalid.args),valid:allows(valid.args),matching:allows({...invalid.args,filters:[{field:'marker',op:'==',value:'ZETA-7319'}]}),otherOperator:allows({...invalid.args,filters:[{field:'marker',op:'!=',value:null}]}),otherOrganization:allows({...invalid.args,collection:'organizations/other/entries'})};
   // Simulate a model ignoring its narrowed schema. The real rejection and
   // recovery, rather than the test double, must protect tool execution.
   return{text:JSON.stringify({toolCalls:[invalid]})};
  }
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION'){recoveries++;return{text:JSON.stringify({toolCalls:[valid],sourceFallback:[]})};}
  if(stage==='QUERY_POPULATION_VERIFICATION'){
   if(useWitnessedFilter){
    const payload=JSON.parse(request.config.chatMessages.at(-1).content);
    assert.deepEqual(payload.observedFilterValueWitnesses,[{filterIndex:0,valueIndexes:[0],source:'FIRESTORE_SERVER_AUTHENTICATED',scope:'same_route_and_projected_field',objectiveCoverageProven:false}]);
    assert.ok(JSON.stringify(payload.observedFilterValueWitnesses).length<256,'value witnesses refer to proposed arguments without duplicating record values');
   }
   return{text:'{"matchesRequest":true,"populationRelevance":"relevant","schemaDiscoveryRelevant":false,"rejectionReason":""}'};
  }
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:true,reason:'Other observed sources still require operational evidence.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['Other observed sources remain unqueried.'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:true,reason:'Independent scope remains pending.',taskIndexes:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'source.js'}},seed],toolCatalog:[reader,query],storage:{getItem(){return null;},setItem(){},removeItem(){}},execute:async call=>{
  executed.push(call);
  if(call.name===reader.name)return{ok:true,data:{file:'source.js',content:'Observed marker, holder and deadline; null is a source literal.',numberedContent:'1: Observed marker, holder and deadline; null is a source literal.',startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:[seed.args.collection,'pending'],queryShapes:[seed.args.collection,'pending'].map(collection=>({collection,fields:['marker','holder','deadline'],fieldsComplete:true}))}}}};
  if(executed.length>2){assert.deepEqual(call.args,valid.args,'the rejected equality must never execute');progressed=true;}
  const values=Object.fromEntries(call.args.fields.map(field=>[field,field==='marker'?'ZETA-7319':field==='holder'?'known-holder':'2027-11-01']));
  return{ok:true,data:{recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...call.args,collection:'organizations/approved/entries',implicitExistenceFields:[]},rows:[{id:'entry',values}],returnedCount:1,hasMore:false,queryExhausted:true,completeForQuery:true,truncatedFields:[],fieldSchema:{source:'SERVER_RECORD_FIELD_NAMES',paths:['marker','holder','deadline'],scope:'returned_rows_only'}}}};
 },planner:async({mission})=>runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai})});
 assert.equal(frontierFacts?.invalid,false,'an exhausted equality or already returned document identity cannot invite another read');
 assert.equal(frontierFacts.valid,true,'newly accredited fields remain available in the original scope');
 assert.equal(frontierFacts.matching,true,'a witnessed matching value remains selectable');
 assert.equal(frontierFacts.otherOperator,true,'other operators keep independent verification');
 assert.equal(frontierFacts.otherOrganization,false,'a receipt cannot authorize another organization');
 assert.equal(progressed,true);assert.equal(recoveries,1);assert.equal(executed.length,3);
 assert.equal(result.status,'PARTIAL');assert.equal(result.completionAssessment.objectives.length,3);
 assert.ok(result.completionAssessment.objectives.every(objective=>objective.satisfied===false));
});
