const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
test('empty registered evidence kinds admit only generic results through final validation',async()=>{
 for(const kind of ['tool_result','platform_records']){
  const result=runJarvisSemanticPlanner({input:'Confirma el archivo observado.',
   catalog:[{name:'document.create',evidenceKinds:[],mutates:false}],
   missionState:{phase:'COMPLETION_AUDIT',completedTasks:[{name:'document.create',observation:{ok:true,summary:'Archivo creado y verificado'}}],pendingTasks:[],blockedTasks:[]},
   ai:{lastProvider:'test-provider',models:{generateContent:async()=>({text:JSON.stringify({toolCalls:[],missionComplete:true,completionAssessment:{objectives:[{objective:'Confirma el archivo observado.',requiredEvidenceKind:kind,satisfied:true,evidenceTaskIndexes:[0],limitation:''}]}})})}}
  });
  if(kind==='tool_result')assert.equal((await result).missionComplete,true);
  else await assert.rejects(result,/EVIDENCE_KIND_MISMATCH|EVIDENCE_INVALID|QUERY_SCOPE_UNVERIFIED/);
 }
});
test('artifact objectives can require actual tool results instead of unrelated platform records',async()=>{
 const input='Crea un Excel con los datos proporcionados.';
 const plan=await runJarvisSemanticPlanner({input,missionState:{phase:'OBJECTIVE_CONTRACT'},
  catalog:[{name:'document.create',userArtifact:true,evidenceKinds:[]},{name:'platform.query',evidenceKinds:['platform_records']}],
  ai:{models:{generateContent:async req=>{
   assert.ok(req.config.responseJsonSchema.properties.objectives.items.properties.requiredEvidenceKind.enum.includes('tool_result'));
   return {text:JSON.stringify({objectives:[{requestQuote:input,requiredEvidenceKind:'tool_result',coverageMode:'other',scope:'explicit_scope',groups:['Excel']}]})};
  }}}
 });
 assert.equal(plan.completionAssessment.objectives[0].requiredEvidenceKind,'tool_result');
 assert.equal(plan.completionAssessment.objectives[0].satisfied,false);
});
test('an invented download in direct chat returns to actual tool selection',async()=>{
 const input='Crea un Excel descargable con cable 120, tornillos 80 y transporte 50; total 250 pesos.';
 const sheet={name:'spreadsheet.compose',description:'Crea una hoja de calculo descargable.',mutates:false,userArtifact:true,inputSchema:{type:'object',properties:{prompt:{type:'string'}},required:['prompt']}};
 let calls=0;
 const result=await runJarvisSemanticPlanner({input,catalog:[{name:'conversation.respond',mutates:false},sheet],
  missionState:{phase:'CURRENT_TURN',conversationalGate:true},retrieveToolCandidates:async()=>[sheet],
  ai:{models:{generateContent:async req=>{
   calls++;
   if(calls===1)return {text:'{"mode":"chat","missing":"","question":"","action":""}'};
   if(calls===2)return {text:'Aquí tienes tu Excel: [Descargar](sandbox:/gastos_prueba.xlsx)'};
   if(req.config.semanticStage==='CURRENT_TURN_ACTION_DESCRIPTION')return {text:'{"action":"create downloadable spreadsheet"}'};
   return {text:JSON.stringify({name:'jarvis_tool_0',arguments:{prompt:input}})};
  }}}
 });
 assert.equal(result.toolCalls[0].name,'spreadsheet.compose');
 assert.equal(result.toolCalls[0].args.prompt,input);
 assert.notEqual(result.planKind,'CURRENT_TURN_CONVERSATION_GATE_DIRECT');
});

test('direct educational reply can finish beyond the former 512-token cap without accepting truncation',async()=>{
 for(const alwaysTruncated of [false,true]){
  let calls=0;
  const request=runJarvisSemanticPlanner({input:'Explica la segunda ley de Newton, calcula 7 por 3 y propone otro ejercicio.',catalog:[{name:'conversation.respond',mutates:false}],missionState:{phase:'CURRENT_TURN',conversationalGate:true},ai:{models:{generateContent:async req=>{
   if(++calls===1)return {text:'{"mode":"chat","missing":"","question":"","action":""}'};
   const truncated=alwaysTruncated||req.config.maxOutputTokens<768;
   return {text:truncated?'La fuerza neta se calcula':'F=m·a. 7 kg × 3 m/s² = 21 N. Otro ejercicio: 4 kg × 2 m/s² = 8 N.',providerResponse:{finishReason:truncated?'length':'stop'}};
  }}}});
  if(alwaysTruncated)await assert.rejects(request,/SEMANTIC_RESPONSE_INCOMPLETE/);
  else {const result=await request;assert.equal(result.planKind,'CURRENT_TURN_CONVERSATION_GATE_DIRECT');assert.match(JSON.stringify(result),/21 N/);}
 }
});
