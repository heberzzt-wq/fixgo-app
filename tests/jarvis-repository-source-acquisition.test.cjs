const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
function fixture(){
 const p=JSON.parse(fs.readFileSync(path.join(__dirname,'v142-four-step-audit.fixture.json'),'utf8'));
 p.missionState.modelContextTokens=8192;p.missionState.blockedTasks=[];
 p.missionState.evidenceObjectives=[{objective:'Verificar contenido de dos archivos del contexto',requiredEvidenceKind:'repository_source',requestQuote:'repo.read para verificar su contenido.'}];
 p.missionState.completedTasks.push({name:'repo.context',args:{files:['jarvis-safe-a.js','jarvis-safe-b.js']},observation:{
  ok:true,executionOk:true,blocked:false,status:'REPO_CONTEXT_READY',contextPreview:{files:[{file:'jarvis-safe-a.js'},{file:'jarvis-safe-b.js'}]}}});
 return p;
}
test('acquire missing context source evidence before repeating a full objective audit',async()=>{
 const p=fixture(),before=JSON.stringify(p),stages=[];
 const result=await runJarvisSemanticPlanner({...p,ai:{models:{generateContent:async req=>{
  stages.push(req.config.semanticStage);
  assert.equal(req.config.semanticStage,'REPOSITORY_SOURCE_ACQUISITION');
  assert.equal(req.config.chatMessages.at(-1).content,p.input);
  const schema=req.config.responseJsonSchema.properties.toolCalls.items.properties.args;
  assert.deepEqual(schema.properties.file.enum,['jarvis-safe-a.js','jarvis-safe-b.js']);
  return {text:JSON.stringify({toolCalls:[{name:'repo.read',args:{file:'jarvis-safe-a.js'}}]})};
 }}}});
 assert.equal(stages.length,1);assert.equal(result.missionComplete,false);
 assert.equal(result.planKind,'REPOSITORY_SOURCE_ACQUISITION');
 assert.equal(result.toolCalls[0].args.file,'jarvis-safe-a.js');assert.equal(JSON.stringify(p),before);
});
test('selection excludes read and failed sources; it cannot invent paths or authorize scope expansion',async()=>{
 const p=fixture();p.missionState.completedTasks.push({name:'repo.read',args:{file:'jarvis-safe-a.js'},observation:{ok:true,executionOk:true,verifiedRead:{file:'jarvis-safe-a.js',partial:false}}});
 await assert.rejects(runJarvisSemanticPlanner({...p,ai:{models:{generateContent:async req=>{
  assert.equal(req.config.semanticStage,'REPOSITORY_SOURCE_ACQUISITION');
  assert.deepEqual(req.config.responseJsonSchema.properties.toolCalls.items.properties.args.properties.file.enum,['jarvis-safe-b.js']);
  return {text:JSON.stringify({toolCalls:[{name:'repo.read',args:{file:'outside.js'}}]})};
 }}}}),/TOOL_ARGUMENTS_INVALID/);
 p.missionState.blockedTasks.push({name:'repo.read',args:{file:'jarvis-safe-b.js'},observation:{ok:false,errorCode:'PERMISSION_DENIED'}});
 await assert.rejects(runJarvisSemanticPlanner({...p,ai:{models:{generateContent:async req=>{
  assert.notEqual(req.config.semanticStage,'REPOSITORY_SOURCE_ACQUISITION');
  throw Error('NORMAL_AUDIT_REACHED');
 }}}}),/NORMAL_AUDIT_REACHED/);
});

test('truncated source selection fails recoverably without certifying a mission',async()=>{
 const p=fixture();let calls=0;
 await assert.rejects(runJarvisSemanticPlanner({...p,ai:{models:{generateContent:async req=>{
  calls++;assert.equal(req.config.semanticStage,'REPOSITORY_SOURCE_ACQUISITION');
  return {text:'{"toolCalls":[{"name":"repo.read","args":{"file":"jarvis-safe-a.js"}}]}',providerResponse:{finishReason:'length'}};
 }}}}),/SOURCE_SELECTION_INCOMPLETE/);
 assert.equal(calls,1);
});

for(const proven of [true,false])test('repository closure stops optional reads only after independent proof: '+proven,async()=>{
 const objective={objective:'Lee target.js y explica su valor.',requestQuote:'Lee target.js y explica su valor.',
  resolvedScope:'Lee target.js y explica su valor.',scopeContext:'Lee target.js y explica su valor.',requiredEvidenceKind:'repository_source',explicitTools:['repo.read']};
 const reader={name:'repo.read',mutates:false,requiresApproval:false,investigationReadOnly:true,evidenceKinds:['repository_source'],
  inputSchema:{type:'object',properties:{file:{type:'string',enum:['target.js','aux.js']},startLine:{type:'integer',minimum:1},endLine:{type:'integer',minimum:1}},required:['file']}};
 const tasks=['target.js','aux.js'].map(file=>({name:'repo.read',args:{file},observation:{ok:true,executionOk:true,
  verifiedRead:{file,content:'export const value=1;',startLine:1,endLine:1,totalLines:file==='target.js'?1:10,partial:file!=='target.js',truncated:false}}}));
 let proofCalls=0;
 const result=await runJarvisSemanticPlanner({input:objective.objective,catalog:[reader],missionState:{phase:'EVIDENCE_NEXT_ACTION',
  modelContextTokens:8192,evidenceObjectives:[objective],completedTasks:tasks,blockedTasks:[],writeAllowed:false},
  ai:{models:{generateContent:async req=>{
   const stage=req.config.semanticStage;
   if(stage==='REPOSITORY_EVIDENCE_SELECTION')return{text:'{"objective_0":[0]}'};
   if(stage==='REPOSITORY_OBJECTIVE_AUDIT')return{text:'{"e":"Contenido completo observado","s":true,"r":[0],"l":""}'};
   if(stage==='REPOSITORY_AUDIT_NEXT_ACTION')return{text:'{"toolCalls":[{"name":"repo.read","args":{"file":"aux.js","startLine":2,"endLine":5}}],"explanation":"Otra lectura"}'};
   if(stage==='CLOSURE_OBJECTIVE_VERIFICATION'){proofCalls++;return{text:JSON.stringify({reason:proven?'Contenido solicitado completo':'Falta evidencia',proven})};}
   throw Error('UNEXPECTED_STAGE:'+stage);
  }}}});
 assert.equal(proofCalls,1);
 assert.equal(result.completionAssessment.objectives[0].independentProof.proven,proven);
 assert.equal(result.missionComplete,proven);
 if(proven)assert.deepEqual(result.toolCalls,[],'an optional proposal cannot prolong a fully verified read-only objective');
 else assert.equal(result.toolCalls[0]?.args.file,'aux.js','negative proof preserves a valid pending investigation');
});
