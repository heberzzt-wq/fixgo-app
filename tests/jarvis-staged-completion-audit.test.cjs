const test=require('node:test'),assert=require('node:assert/strict');
const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
const fixture=require('./fixtures/jarvis-excel-completion-context.json');

test('real Excel audit packet fits 8192 context by separating verdict, tool selection and grounded arguments',async()=>{
 const before=JSON.stringify(fixture),stages=[],requests=[];
 const plan=await runJarvisSemanticPlanner({...structuredClone(fixture),ai:{lastProvider:'ollama-openai-compatible-local',models:{generateContent:async req=>{
  stages.push(req.config.semanticStage);requests.push(req);
  const size=JSON.stringify(req.config.chatMessages).length+JSON.stringify(req.config.responseJsonSchema).length;
  assert.ok(size<=24576,'unchanged local preflight: '+size);
  assert.ok(req.config.chatMessages.some(m=>m.content.startsWith('OBSERVACION_EJECUTADA=')));
  assert.ok(req.config.chatMessages.some(m=>m.content.startsWith('OBJETIVOS_ESTABLECIDOS_INMUTABLES=')));
  if(req.config.semanticStage==='COMPLETION_AUDIT')return {text:JSON.stringify({explanation:'Existe un esquema, pero falta crear el archivo.',completionAssessment:{objectives:{objective_0:{objective:fixture.missionState.evidenceObjectives[0].objective,requiredEvidenceKind:'tool_result',satisfied:false,evidenceTaskIndexes:[0],limitation:'Falta el XLSX físico descargable.'}}},toolCalls:[]})};
  if(req.config.semanticStage==='COMPLETION_AUDIT_TOOL_SELECTION'){
   const message=req.config.chatMessages.find(m=>m.content.startsWith('CATALOGO_EJECUTABLE='));
   const encoded=JSON.parse(message.content.slice(message.content.indexOf('=')+1));
   return {text:JSON.stringify({index:encoded.rows.findIndex(row=>row[0]==='document.create')})};
  }
  assert.equal(req.config.semanticStage,'GROUNDED_ARGUMENT_COMPLETION');
  return {text:'{"format":"xlsx","output":".jarvis-artifacts/documents/gastos.xlsx","contentSource":"spreadsheet.compose"}'};
 }}}});
 assert.equal(plan.missionComplete,false,'blueprint must remain pending');
 assert.equal(plan.toolCalls[0].name,'document.create');
 assert.equal(plan.toolCalls[0].args.format,'xlsx');
 assert.deepEqual(stages,['COMPLETION_AUDIT','COMPLETION_AUDIT_TOOL_SELECTION','GROUNDED_ARGUMENT_COMPLETION']);
 const encoded=JSON.parse(requests[1].config.chatMessages.find(m=>m.content.startsWith('CATALOGO_EJECUTABLE=')).content.split('=').slice(1).join('='));
 const metadata=encoded.metadataColumns?encoded.metadata.map(row=>Object.fromEntries(encoded.metadataColumns.map((key,index)=>[key,row[index]]))):encoded.metadata;
 const decoded=encoded.rows.map(([name,description,index])=>({name,description,...metadata[index]}));
 assert.equal(new Set(decoded.map(t=>t.name)).size,decoded.length);
 assert.ok(decoded.some(t=>t.name==='document.create'&&t.mutates===true&&t.requiresApproval===false));
 assert.equal(JSON.stringify(fixture),before);
});

test('failed contracted Excel composition preserves metadata and context while retrying only its required tool',async()=>{
 const failed=require('./fixtures/jarvis-excel-failed-completion-context.json');
 let calls=0,firstContext;
 await assert.rejects(runJarvisSemanticPlanner({...structuredClone(failed),ai:{lastProvider:'ollama-openai-compatible-local',models:{generateContent:async req=>{
  calls++;
  const size=JSON.stringify(req.config.chatMessages).length+JSON.stringify(req.config.responseJsonSchema).length;
  assert.ok(size<=24576,'failure recovery must fit unchanged preflight: '+size);
  const context=req.config.chatMessages.find(m=>m.content.startsWith('CONVERSATION_CONTEXT_FOR_REFERENCE_ONLY='));
  assert.ok(context);
  if(calls===1){firstContext=context.content;return {text:JSON.stringify({completionAssessment:{objectives:{objective_0:{satisfied:false,evidenceTaskIndexes:[],limitation:'La composición falló; falta el archivo solicitado.'}}},toolCalls:[]})};}
  assert.equal(context.content,firstContext,'retain the complete reference context');
  assert.equal(req.config.semanticStage,'COMPLETION_AUDIT_TOOL_SELECTION');
  const message=req.config.chatMessages.find(m=>m.content.startsWith('CATALOGO_EJECUTABLE='));
  const encoded=JSON.parse(message.content.slice(message.content.indexOf('=')+1));
  assert.deepEqual(encoded.metadataColumns,['evidenceKinds','requiredArguments','mutates','requiresApproval']);
  const metadata=encoded.metadata.map(row=>Object.fromEntries(encoded.metadataColumns.map((key,index)=>[key,row[index]])));
  assert.deepEqual(metadata.map(item=>encoded.metadataColumns.map(key=>item[key])),encoded.metadata,'metadata roundtrip preserves values and positions');
  assert.equal(failed.catalog.length,55,'the original full 55-tool catalog is retained');
  assert.equal(encoded.rows.length,1,'only the explicitly failed contracted tool is offered on recovery');
  assert.equal(encoded.rows[0][0],'spreadsheet.compose','the user-required failed tool remains eligible');
  for(const [name,description,index] of encoded.rows){
   const original=failed.catalog.find(t=>t.name===name);assert.ok(original);
   assert.equal(description,original.description.slice(0,60));
   assert.equal(metadata[index].mutates,original.mutates);
   assert.equal(metadata[index].requiresApproval,original.requiresApproval);
  }
  assert.ok(req.config.chatMessages.some(m=>m.content.startsWith('INTENTO_FALLIDO_NO_ACREDITA_CUMPLIMIENTO=')));
  assert.ok(req.config.chatMessages.some(m=>m.content.startsWith('HERRAMIENTAS_REQUERIDAS_FALLIDAS=')));
  assert.equal(failed.missionState.requiredToolNames[0],encoded.rows[0][0]);
  throw Error('CAPTURE_COMPLETE_NO_INFERENCE');
 }}}}),/CAPTURE_COMPLETE_NO_INFERENCE/);
 assert.equal(calls,2);
});

test('truncated staged selection fails without manufacturing arguments or a completed artifact',async()=>{
 let calls=0;
 await assert.rejects(runJarvisSemanticPlanner({...structuredClone(fixture),ai:{lastProvider:'ollama-openai-compatible-local',models:{generateContent:async()=>{
  calls++;
  if(calls===1)return {text:JSON.stringify({completionAssessment:{objectives:{objective_0:{satisfied:false}}},toolCalls:[]})};
  return {text:'{"name":"document.create"}',providerResponse:{finishReason:'length'}};
 }}}}),/SEMANTIC_COMPLETION_AUDIT_INCOMPLETE/);
 assert.equal(calls,3,'one bounded audit repair; no argument inference after truncation');
});
