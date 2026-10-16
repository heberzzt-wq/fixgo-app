const test=require('node:test'),assert=require('node:assert/strict');
const {runJarvisSemanticPlanner,hasRequiredToolArguments}=require('../functions/jarvis-semantic-planner.js');
for(const roleCase of ['related','irrelevant','sibling-only'])test(`related-source query receives only its own independently reviewed objective role: ${roleCase}`,async()=>{
 const {runJarvisMission}=await import('../gestia-core/jarvis/jarvis.mission.orchestrator.js');
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['source.js']}},required:['file']}};
 const query={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},{kind:'repository_source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query']},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}};
 const root='groups/approved/entries',target='groups/approved/people',sibling='groups/other/people',collections=[root,target,sibling];
 const goals=['Count entries','Identify holders','Inspect deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['entries']}));
 const first={name:query.name,args:{sourceFile:'source.js',collection:root,mode:'query',fields:['member'],filters:[]}},next={name:query.name,args:{sourceFile:'source.js',collection:target,mode:'query',fields:['holder','deadline'],filters:[]}};
 let progressed=false,roleSeen=false,reviewCalls=0;const executed=[];
 const relevant=(collection,index)=>collection===root || roleCase==='related'&&collection===target&&index>0 || roleCase==='sibling-only'&&collection===sibling&&index>0;
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;
  if(stage==='EVIDENCE_NEXT_ACTION'){
   if(progressed)return{text:'{"toolCalls":[]}'};
   const choices=request.config.responseJsonSchema.properties.toolCalls.items.anyOf;
   const allows=choices.some(c=>c.properties.name.enum.includes(query.name)&&hasRequiredToolArguments({inputSchema:c.properties.args},next.args));
   assert.ok(allows,'the credited schema permits inspection; independent source-role review still decides relevance');
   return{text:JSON.stringify({toolCalls:allows?[next]:[]})};
  }
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION')return{text:'{"toolCalls":[],"sourceFallback":[]}'};
  const p=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='QUERY_POPULATION_VERIFICATION'){
   reviewCalls++;const role=p.reviewedSourceRoles;
   roleSeen=Boolean(role?.collection===target&&role.sourceFile==='source.js'&&role.decisions?.some(d=>d.objectiveIndex==='1'&&d.relevant===true));
   if(roleSeen){assert.equal(role.operationalEvidence,false);assert.equal(role.grantsFieldAuthorization,false);assert.equal(role.objectiveSatisfied,false);assert.ok(JSON.stringify(role).length<=1000,'role guidance must stay compact');}
   return{text:JSON.stringify({matchesRequest:roleSeen,objectiveMatches:{0:false,1:roleSeen,2:false},objectiveFields:{0:[],1:roleSeen?['holder']:[],2:[]},populationRelevance:roleSeen?'relevant':'unknown',schemaDiscoveryRelevant:false,rejectionReason:roleSeen?'':'A related registry role was lost before query review.'})};
  }
  const index=goals.findIndex(g=>g.objective===p.contract?.objective);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(p.sources.map(collection=>[collection,{relevantToObjective:relevant(collection,index),reason:relevant(collection,index)?'Credited source can supply this independent goal; no values or joins proven.':'This source does not supply this goal.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['Other operational scopes and relationships remain pending.'],groups:[],sources:p.observedSources.map(collection=>({collection,relevant:relevant(collection,index),reason:relevant(collection,index)?'Credited source can supply this independent goal; no values or joins proven.':'This source does not supply this goal.',taskIndexes:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'source.js'}},first],toolCatalog:[reader,query],storage:{getItem(){return null},setItem(){},removeItem(){}},execute:async call=>{
  executed.push(call);
  if(call.name===reader.name)return{ok:true,data:{file:'source.js',content:'Observed scoped member, holder and deadline schema',numberedContent:'1: Observed scoped member, holder and deadline schema',startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections,queryShapes:collections.map(collection=>({collection,fields:collection===root?['member']:['holder','deadline'],fieldsComplete:true}))}}}};
  if(call.args.collection!==root){assert.deepEqual(call.args,next.args);progressed=true;}
  return{ok:true,data:{recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...call.args,orderBy:[],implicitExistenceFields:[]},rows:[{id:call.args.collection===root?'entry-a':'person-a',values:call.args.collection===root?{member:'person-a'}:{holder:'Registered person',deadline:'2027-01-01'}}],totalCount:1,returnedCount:1,hasMore:false,queryExhausted:true,completeForQuery:true,consistentCountAndList:true}}};
 },planner:async({mission})=>runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION',completionAssessment:mission.completionAssessment||{objectives:goals.map(g=>({...g,satisfied:false,evidenceTaskIndexes:[],coverageProof:{proven:false,sources:[{collection:target,relevant:true,reason:'Untrusted caller claim',taskIndexes:[]}]}}))}},ai})});
 assert.equal(progressed,roleCase==='related',JSON.stringify({reviewCalls,roleSeen,errors:result.errors}));
 assert.equal(roleSeen,roleCase==='related');assert.equal(executed.filter(c=>c.name===query.name).length,roleCase==='related'?2:1);
 assert.equal(result.status,'PARTIAL');assert.equal(result.completionAssessment.objectives.length,3);assert.ok(result.completionAssessment.objectives.every(g=>g.satisfied===false&&g.requiredEvidenceKind==='platform_records'));
});
