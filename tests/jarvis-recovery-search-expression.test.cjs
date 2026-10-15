const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {runJarvisSemanticPlanner,hasRequiredToolArguments}=require('../functions/jarvis-semantic-planner.js');

test('recovery can search an observed dotted identifier after a semantic rejection through mission closure',async()=>{
 const {runJarvisMission}=await import(pathToFileURL(path.resolve(__dirname,'../gestia-core/jarvis/jarvis.mission.orchestrator.js')));
 const reader={name:'repo.read',description:'Read source',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['catalog.js']}},required:['file']}};
 const grep={name:'repo.grep',description:'Search literal source text',evidenceKinds:['repository_search'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{term:{type:'string',minLength:1}},required:['term']}};
 const query={name:'platform.query',description:'Read authenticated records',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query']},fields:{type:'array',items:{type:'string'}},filters:{type:'array'}},required:['sourceFile','collection','mode','fields','filters']}};
 const goals=['Count items','Find holders','Check deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['items']}));
 const proposal={name:query.name,args:{sourceFile:'catalog.js',collection:'catalog',mode:'query',fields:['item.reference'],filters:[]}};
 const search={name:grep.name,args:{term:'item.reference'}};
 let searched=false,recoverySeen=false;const executed=[],plans=[],offeredExpressions=[];
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;
  if(stage==='EVIDENCE_NEXT_ACTION')return{text:JSON.stringify({toolCalls:searched?[]:[proposal]})};
  if(stage==='QUERY_POPULATION_VERIFICATION')return{text:JSON.stringify({matchesRequest:false,schemaDiscoveryRelevant:false,rejectionReason:'This source does not establish the requested inventory.'})};
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION'){
   recoverySeen=true;
   const choice=request.config.responseJsonSchema.properties.toolCalls.items.anyOf.find(c=>c.properties.name.enum.includes(grep.name));
   assert.ok(choice,'literal repository search remains available');
   const term=choice.properties.args.properties.term;
   offeredExpressions.push((!term.enum || term.enum.includes(search.args.term)) && hasRequiredToolArguments({inputSchema:choice.properties.args},search.args));
   return{text:JSON.stringify({toolCalls:[search]})};
  }
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:true,reason:'Coverage remains unresolved.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['No operational evidence'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:true,reason:'Only source definitions observed.',taskIndexes:[]}))})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'catalog.js'}}],toolCatalog:[reader,grep,query],
  execute:async call=>{
   executed.push(call);
   if(call.name===reader.name)return{ok:true,data:{file:'catalog.js',content:'record.item.reference',numberedContent:'1: record.item.reference',startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:['catalog'],fieldPaths:['item.reference'],writeShapes:[{collection:'catalog',fields:['item.reference'],fieldsComplete:true,content:'record.item.reference'}]}}}};
   assert.deepEqual({name:call.name,args:call.args},search);searched=true;
   return{ok:true,data:{matches:[],complete:true}};
  },planner:async({mission})=>{const plan=await runJarvisSemanticPlanner({input:mission.originalInstruction,catalog:[reader,grep,query],missionState:{...mission,tenantId:'approved',phase:'EVIDENCE_NEXT_ACTION'},ai});plans.push(plan);return plan;},storage:{getItem(){return null;},setItem(){},removeItem(){}}});
 assert.ok(recoverySeen,'semantic rejection enters the actual recovery decision');
 assert.equal(offeredExpressions[0],true,'a dotted identifier observed in source must not be split into a closed word list');
 assert.ok(searched,'the useful source-discovery action executes: '+JSON.stringify(plans.map(p=>({calls:p.toolCalls,assessment:p.completionAssessment}))));
 assert.deepEqual(executed.map(c=>c.name),['repo.read','repo.grep']);
 assert.equal(result.status,'PARTIAL');
 assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
});
