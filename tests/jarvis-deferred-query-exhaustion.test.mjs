import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runJarvisMission} from '../gestia-core/jarvis/jarvis.mission.orchestrator.js';
import {completeJarvisPlanningArguments} from '../gestia-core/jarvis/jarvis.multifunction.planner.js';
import express from 'express';
import {semanticPlanHandler} from '../jarvis-semantic-http.js';
const {runJarvisSemanticPlanner}=createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');

// Model and storage boundaries are simulated; both planner phases, argument
// completion, HTTP serialization/client, and the mission loop are production.
for(const transport of ['direct','http'])for(const scenario of ['same','projection','source_gap'])test(`deferred record operations preserve the evidence frontier: ${transport} ${scenario}`,async t=>{
 const changeProjection=scenario==='projection',sourceGap=scenario==='source_gap';
 const reader={name:'repo.read',description:'Read an observed source',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['registry.js','related.js']}},required:['file']}};
 const query={name:'platform.query',description:'Read authenticated records',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},mode:{type:'string',enum:['query']},fields:{type:'array',items:{type:'string'}},filters:{type:'array',items:{type:'object'}},pageSize:{type:'integer'}},required:['sourceFile','collection','mode','fields','filters']}};
 const catalog=[reader,query],instruction='Count entries, find their holders and check document deadlines. '+(sourceGap?'Find the relevant source first.':changeProjection?'Inspect a different projection if useful.':'Reuse evidence already obtained.')+' Trace '+transport+'.';
 const goals=['Count entries','Find holders','Check deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['entries']}));
 const first={sourceFile:'registry.js',collection:'registry',mode:'query',fields:['state'],filters:[{field:'state',op:'==',value:'active'}]};
 const second=changeProjection?{...first,fields:['owner'],pageSize:9}:first;
 let groundCalls=0,operationalReads=0,relatedRead=false,emptyDecisionAllowed=false;const stages=[],rejected=[];
 const ai={objectiveCoverageCache:new Map(),models:{generateContent:async request=>{
  const stage=request.config.semanticStage;stages.push(stage);
  if(stage==='GROUNDED_ARGUMENT_COMPLETION'){
   emptyDecisionAllowed=request.config.responseJsonSchema.properties.toolCalls.minItems===0;
   const args=groundCalls++?second:first;
   return{text:JSON.stringify({toolCalls:sourceGap?[]:[{name:query.name,args}],missionComplete:false})};
  }
  if(stage==='EVIDENCE_NEXT_ACTION')return{text:JSON.stringify({toolCalls:relatedRead?[]:[{name:reader.name,args:{file:'related.js'}}]})};
  if(stage==='READ_ONLY_EVIDENCE_CONTINUATION')return{text:'{"toolCalls":[]}'};
  const payload=JSON.parse(request.config.chatMessages.at(-1).content);
  if(stage==='OBJECTIVE_SOURCE_SCOPE_VERIFICATION')return{text:JSON.stringify({sourceRelevance:Object.fromEntries(payload.sources.map(collection=>[collection,{relevantToObjective:true,reason:'Other operational coverage is still missing.'}]))})};
  assert.ok(['RECORD_OBJECTIVE_COVERAGE','RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage),stage);
  return{text:JSON.stringify({proven:false,missing:['Only one filtered empty query has been observed.'],groups:[],sources:payload.observedSources.map(collection=>({collection,relevant:true,reason:'No complete requested population.',taskIndexes:[]}))})};
 }}};
 const semanticPlanner=({input,catalog,missionState})=>runJarvisSemanticPlanner({input,catalog,missionState,ai});
 if(transport==='http'){
  const previous=globalThis.JarvisLocalBridge;
  const app=express();app.use(express.json());
  app.post('/semantic/plan',semanticPlanHandler({describe:()=>({ok:true,fallbackAllowed:false}),plan:semanticPlanner}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  globalThis.JarvisLocalBridge={requestJson:async(route,body)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json())};
  t.after(async()=>{globalThis.JarvisLocalBridge=previous;server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));});
 }
 const result=await runJarvisMission({instruction,initialEvidenceObjectives:goals,initialToolCalls:[{name:reader.name,args:{file:'registry.js'}},...(sourceGap?['Inspect records']:['Inspect records','Prepare report from current records']).map(operation=>({name:query.name,args:{},deferred:true,reason:operation,obligationId:operation}))],toolCatalog:catalog,
  execute:async(call,context)=>{
   if(call.name===reader.name){relatedRead ||= call.args.file==='related.js';return{ok:true,data:{file:call.args.file,content:'state active owner',numberedContent:'1: state active owner',startLine:1,endLine:1,totalLines:1,sourceStructure:{dataBindings:{source:'ACORN_SOURCE_REFERENCES',collections:['registry'],writeShapes:[{collection:'registry',fields:['state','owner'],fieldsComplete:true,content:'state active owner'}]}}}};}
   let args=call.args;
   if(call.deferred){try{({args}=await completeJarvisPlanningArguments({toolName:query.name,description:query.description,inputSchema:query.inputSchema,instruction,operation:call.reason,toolContract:query,completedTasks:context.completedTasks,blockedTasks:context.blockedTasks,evidenceObjectives:goals,semanticPlanner:transport==='direct'?semanticPlanner:null}));}catch(error){rejected.push(error);throw error;}}
   operationalReads++;
   return{ok:true,missionExecution:{args},data:{recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...args,orderBy:[{field:'__name__',direction:'asc'}],cursor:null,implicitExistenceFields:[]},rows:[],returnedCount:0,queryExhausted:true,completeForQuery:true,hasMore:false}}};
  },planner:({mission})=>semanticPlanner({input:instruction,catalog,missionState:{...mission,phase:'EVIDENCE_NEXT_ACTION'}}),storage:{getItem(){return null;},setItem(){},removeItem(){}}});
 assert.equal(operationalReads,sourceGap?0:1,'no ungrounded or exhausted query may reach storage');
 assert.equal(groundCalls,sourceGap?1:2,'deterministic evidence deficits must not trigger another argument-repair inference');
 assert.equal(rejected.length,1);
 assert.match(rejected[0].message,sourceGap?/SEMANTIC_GROUNDED_SOURCE_EVIDENCE_REQUIRED/:/SEMANTIC_QUERY_ALREADY_OBSERVED/);
 if(sourceGap)assert.ok(emptyDecisionAllowed,'a lack of relevant source evidence must not force a fabricated query');
 assert.equal(relatedRead,true,'the existing mission loop must retain a valid next source after rejecting repeated arguments');
 assert.equal(result.status,'PARTIAL');assert.ok(result.completionAssessment.objectives.every(o=>o.satisfied===false));
});
