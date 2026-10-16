const test=require('node:test'),assert=require('node:assert/strict');
const {runJarvisSemanticPlanner,hasRequiredToolArguments,eligibleEvidenceActionCatalog}=require('../functions/jarvis-semantic-planner.js');
for(const disjoint of [false,true])test(`queued argument completion advances beyond retained source windows; disjoint=${disjoint}`,async()=>{
 const {runJarvisMission}=await import('../gestia-core/jarvis/jarvis.mission.orchestrator.js');
 const {completeJarvisPlanningArguments}=await import('../gestia-core/jarvis/jarvis.multifunction.planner.js');
 const reader={name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string',enum:['source.js']},startLine:{type:'integer',minimum:1},endLine:{type:'integer',minimum:1}},required:['file']}};
 const goals=['Count entries','Identify holders','Inspect deadlines'].map((objective,i)=>({objective,requestQuote:objective,requiredEvidenceKind:'platform_records',coverageMode:['population','relationship','temporal'][i],scope:'all_sources',groups:['entries']}));
 const calls=[],decisions=[];let argumentCalls=0;
 const ai={models:{generateContent:async request=>{
  assert.equal(request.config.semanticStage,'GROUNDED_ARGUMENT_COMPLETION');argumentCalls++;
  const schema=request.config.responseJsonSchema.properties.toolCalls.items.properties.args;
  assert.equal(hasRequiredToolArguments({inputSchema:schema},{file:'source.js'}),false,'the stale whole-file task cannot reoffer its default retained prefix');
  assert.equal(hasRequiredToolArguments({inputSchema:schema},{file:'source.js',startLine:1,endLine:2}),false,'the retained visible window must be removed before model inference');
  assert.equal(hasRequiredToolArguments({inputSchema:schema},{file:'source.js',startLine:4,endLine:6}),false,'an arbitrary offset cannot bypass runtime anchor requirements');
  assert.equal(hasRequiredToolArguments({inputSchema:schema},{file:'source.js',startLine:3,endLine:6}),true,'an unread window of the same file must remain available');
  return{text:JSON.stringify({toolCalls:[{name:reader.name,args:{file:'source.js',startLine:3,endLine:6}}],missionComplete:false})};
 }}};
 const result=await runJarvisMission({instruction:goals.map(g=>g.objective).join('; '),initialEvidenceObjectives:goals,
  initialToolCalls:[{name:reader.name,args:{file:'source.js'}},...(disjoint?[{name:reader.name,args:{file:'source.js',startLine:7,endLine:8}}]:[]),{name:reader.name,args:{},deferred:true}],toolCatalog:[reader],
  storage:{getItem(){return null},setItem(){},removeItem(){}},execute:async(call,context)=>{
   let args=call.args;if(call.deferred){const completed=await completeJarvisPlanningArguments({toolName:reader.name,toolContract:reader,inputSchema:reader.inputSchema,instruction:context.rootInstruction,completedTasks:context.completedTasks,evidenceObjectives:context.evidenceObjectives,semanticPlanner:req=>runJarvisSemanticPlanner({...req,ai})});args=completed.args;}
   const start=args.startLine||1,end=args.endLine||2;calls.push([start,end]);
   return{ok:true,data:{file:args.file,content:Array.from({length:end-start+1},(_,i)=>'Observed line '+(start+i)).join('\n'),numberedContent:'Observed bounded source',startLine:start,endLine:end,totalLines:8,readEndLine:end,contentTruncated:end<8,partial:start>1||end<8}};
  },planner:async({mission})=>{decisions.push(mission.completedTasks.length);return{toolCalls:[],missionComplete:false,completionAssessment:{objectives:goals.map(g=>({...g,satisfied:false,evidenceTaskIndexes:[],limitation:'Source bytes do not prove operational records.'}))}};}});
 assert.equal(argumentCalls,1,JSON.stringify(result.errors));
 assert.deepEqual(calls,disjoint?[[1,2],[7,8],[3,6]]:[[1,2],[3,6]],JSON.stringify(result.errors));
 if(disjoint)assert.deepEqual(eligibleEvidenceActionCatalog([reader],result.completedTasks),[],'fully retained source coverage across windows cannot reopen its original prefix');
 assert.ok(decisions.length>0,'the mission must return to its next evidence decision');
 assert.equal(result.status,'PARTIAL');assert.equal(result.completionAssessment.objectives.length,3);
 assert.ok(result.completionAssessment.objectives.every(g=>g.satisfied===false&&g.requiredEvidenceKind==='platform_records'));
});
