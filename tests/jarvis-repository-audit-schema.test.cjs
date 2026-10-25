const test=require('node:test'),assert=require('node:assert/strict');
const {generateRepositoryAudit}=require('../functions/jarvis-repository-audit-codec.cjs');
function request(){
 const branch=s=>({properties:{objective:{enum:['Revisar commits reales']},requiredEvidenceKind:{enum:['repository_search']},
 evidenceTaskIndexes:{type:'array',items:{enum:[0,1]}},satisfied:{enum:[s]}}});
 return {config:{chatMessages:[{role:'user',content:'Revisa los commits reales.'}],responseJsonSchema:{properties:{
 completionAssessment:{properties:{objectives:{properties:{objective_0:{anyOf:[branch(false),branch(true)]}}}}},
 toolCalls:{type:'array',maxItems:0}}}}};
}
test('native verdict grammar forbids the exact contradictory positive response observed on cd35faad',async()=>{
 let calls=0;
 const result=await generateRepositoryAudit({enabled:true,request:request(),ai:{models:{generateContent:async req=>{
  if(++calls===1){
   const branches=req.config.responseJsonSchema.anyOf;
   assert.ok(Array.isArray(branches),'native grammar must correlate satisfaction, receipts and limitation');
   const positive=branches.find(b=>b.properties.s.enum.includes(true));
   const negative=branches.find(b=>b.properties.s.enum.includes(false));
   assert.deepEqual(positive.properties.l.enum,['']);
   assert.equal(positive.properties.r.minItems,1);
   assert.deepEqual(positive.properties.r.items.enum,[0,1]);
   assert.equal(negative.properties.l.minLength,1);
   return{text:JSON.stringify({s:true,r:[0],l:''})};
  }
  return{text:JSON.stringify({toolCalls:[],explanation:'Recibos revisados.'})};
 }}}});
 assert.equal(JSON.parse(result.text).completionAssessment.objectives.objective_0.satisfied,true);
 assert.equal(calls,2);
});
test('decoder still rejects positive explanation in limitation instead of manufacturing success',async()=>{
 await assert.rejects(generateRepositoryAudit({enabled:true,request:request(),ai:{models:{generateContent:async()=>({
  text:JSON.stringify({s:true,r:[0,1],l:'Revision de commits recientes completada.'})
 })}}}),/SEMANTIC_COMPLETION_EVIDENCE_INVALID/);
});

test('repository continuation selects from metadata without repeating large audited receipts or dropping failures',()=>{
 const {compactRepositoryContinuation}=require('../functions/jarvis-repository-audit-codec.cjs');
 const task={index:2,name:'repo.read',args:{file:'jarvis-safe.js'},observation:{ok:true,executionOk:true,
  verifiedRead:{file:'jarvis-safe.js',sha256:'a'.repeat(64),startLine:1,endLine:20,partial:true},content:'x'.repeat(20000)}};
 const failure={name:'repo.context',args:{files:['jarvis-big.js']},observation:{errorCode:'REPO_CONTEXT_SOURCE_TOO_LARGE',
  errorDetails:{sourceDiscovery:{operationalEvidence:false,candidates:[{file:'jarvis-small.js'}]}}}};
 const messages=[{role:'system',content:'EVIDENCIA_OBTENIDA='+JSON.stringify(task)},
 {role:'system',content:'INTENTO_FALLIDO='+JSON.stringify(failure)},
 {role:'system',content:'OBJETIVOS_PENDIENTES=[{"objective":"Leer dos archivos","satisfied":false}]'},
 {role:'system',content:'DECISIONES_RECHAZADAS=[]'},{role:'user',content:'Lee dos archivos sin modificar.'}];
 const req={config:{semanticStage:'READ_ONLY_EVIDENCE_CONTINUATION',tools:[{functionDeclarations:[]}],chatMessages:messages}};
 const before=JSON.stringify(req),result=compactRepositoryContinuation(req);
 assert.equal(JSON.stringify(req),before);
 assert.equal(result.config.tools,req.config.tools,'same native authorization schema');
 const retained=JSON.parse(result.config.chatMessages[0].content.slice('EVIDENCIA_OBTENIDA='.length));
 assert.equal(retained.metadataOnly,true);assert.equal(retained.index,2);assert.deepEqual(retained.args,task.args);
 assert.deepEqual(retained.observation.verifiedRead,task.observation.verifiedRead);
 assert.equal(retained.observation.content,undefined);
 assert.ok(JSON.stringify(result).includes('REPO_CONTEXT_SOURCE_TOO_LARGE'));
 assert.equal(result.config.chatMessages.at(-1).content,messages.at(-1).content);
 assert.equal(result.config.chatMessages[2].content,messages[2].content);
 assert.equal(result.config.chatMessages[3].content,messages[3].content);
 assert.ok(JSON.stringify(result).length<3000);
});

test('repository recovery exposes its required source alternative in the native response contract',async()=>{
 const fs=require('node:fs'),{runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
 const packet=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'v142-four-step-audit.fixture.json'),'utf8'));
 packet.missionState.modelContextTokens=8192;packet.missionState.blockedTasks=[];
 for(const tool of packet.catalog)if(['repo.gitHistory','repo.gitStatus'].includes(tool.name))tool.evidenceKinds=['repository_search'];
 const goals=[{objective:'Revisar Git',requiredEvidenceKind:'repository_search'},
 {objective:'Leer dos archivos',requiredEvidenceKind:'repository_source'}];
 packet.missionState.evidenceObjectives=goals;
 packet.missionState.completionAssessment={objectives:goals.map(g=>({...g,satisfied:false,evidenceTaskIndexes:[],limitation:'Pendiente.'}))};
 packet.missionState.completedTasks.push({name:'repo.context',args:{files:['jarvis-safe-a.js','jarvis-safe-b.js']},
 observation:{ok:true,executionOk:true,status:'REPO_CONTEXT_READY',contextPreview:{files:[{file:'jarvis-safe-a.js'},{file:'jarvis-safe-b.js'}]}}});
 let goal=0,reached=false;
 await assert.rejects(runJarvisSemanticPlanner({...packet,ai:{models:{generateContent:async req=>{
  if(req.config.semanticStage==='REPOSITORY_SOURCE_ACQUISITION')return {text:'{"toolCalls":[]}'};
  if(req.config.semanticStage==='REPOSITORY_OBJECTIVE_AUDIT')return{text:JSON.stringify(++goal===1?{s:true,r:[0],l:''}:{s:false,r:[2],l:'Falta segundo archivo.'})};
  if(req.config.semanticStage==='REPOSITORY_AUDIT_NEXT_ACTION')return{text:JSON.stringify({toolCalls:[{name:packet.missionState.completedTasks[0].name,args:packet.missionState.completedTasks[0].args}],explanation:'Repetida.'})};
  if(req.config.semanticStage==='CLOSURE_OBJECTIVE_VERIFICATION')return{text:'{"proven":true}'};
  if(req.config.semanticStage==='READ_ONLY_EVIDENCE_CONTINUATION'){
   reached=true;
   assert.ok(req.config.responseJsonSchema,'required sourceFallback cannot be requested only in prose with nativeToolChat');
   assert.equal(req.config.responseJsonSchema.properties.toolCalls.maxItems,1);
   assert.ok(req.config.responseJsonSchema.required.includes('sourceFallback'));
   assert.ok(JSON.stringify(req.config.responseJsonSchema.properties.sourceFallback).includes('jarvis-safe-b.js'));
   assert.ok(req.config.chatMessages.filter(m=>m.content.startsWith('EVIDENCIA_OBTENIDA=')).every(m=>JSON.parse(m.content.slice('EVIDENCIA_OBTENIDA='.length)).metadataOnly));
   throw Error('RECOVERY_CONTRACT_VERIFIED');
  }
  throw Error('UNEXPECTED_STAGE_'+req.config.semanticStage);
 }}}}),/RECOVERY_CONTRACT_VERIFIED/);
 assert.equal(reached,true);
});
