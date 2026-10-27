const test=require('node:test'),assert=require('node:assert/strict');
const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
const fixture=require('./fixtures/jarvis-excel-latest-completion-context.json');

test('latest GP02 receipt partitions selection without losing evidence, candidates or tool identity',async()=>{
 const before=JSON.stringify(fixture),seen=new Set(),sizes=[],references=[],evidence=[];
 const plan=await runJarvisSemanticPlanner({...structuredClone(fixture),ai:{lastProvider:'ollama-openai-compatible-local',models:{generateContent:async req=>{
  const messages=req.config.chatMessages,stage=req.config.semanticStage;
  const size=JSON.stringify(messages).length+JSON.stringify(req.config.responseJsonSchema).length;
  sizes.push({stage,size});assert.ok(size<=24576,'8192 preflight exceeded: '+JSON.stringify(sizes));
  const context=messages.find(m=>m.content.startsWith('CONVERSATION_CONTEXT_FOR_REFERENCE_ONLY='));
  assert.ok(context);references.push(context.content);
  evidence.push(JSON.stringify(messages.filter(m=>/^(OBSERVACION_EJECUTADA|INTENTO_FALLIDO_NO_ACREDITA_CUMPLIMIENTO|OBJETIVOS_ESTABLECIDOS_INMUTABLES|DECISIONES_RECHAZADAS|PROGRESO_PREVIO_POR_OBJETIVO)=/.test(m.content))));
  assert.ok(messages.some(m=>m.content.startsWith('INTENTO_FALLIDO_NO_ACREDITA_CUMPLIMIENTO=')));
  assert.ok(messages.some(m=>m.content.startsWith('OBJETIVOS_ESTABLECIDOS_INMUTABLES=')));
  if(stage==='COMPLETION_AUDIT')return {text:JSON.stringify({completionAssessment:{objectives:Object.fromEntries(fixture.missionState.evidenceObjectives.map((o,i)=>['objective_'+i,{...o,satisfied:false,evidenceTaskIndexes:[],limitation:'No hay evidencia suficiente ni archivo entregado.'}]))},toolCalls:[]})};
  if(stage==='COMPLETION_AUDIT_TOOL_SELECTION'){
   const content=messages.find(m=>m.content.startsWith('CATALOGO_EJECUTABLE=')).content;
   const encoded=JSON.parse(content.slice(content.indexOf('=')+1));
   for(const [name,description,index] of encoded.rows){
    seen.add(name);const original=fixture.catalog.find(t=>t.name===name);assert.ok(original);
    const metadata=encoded.metadataColumns?Object.fromEntries(encoded.metadataColumns.map((key,i)=>[key,encoded.metadata[index][i]])):encoded.metadata[index];
    assert.equal(metadata.mutates,original.mutates);assert.equal(metadata.requiresApproval,original.requiresApproval);
    assert.equal(description,original.description.slice(0,60));
   }
   const selected=encoded.rows.findIndex(row=>row[0]==='spreadsheet.compose');
   return {text:JSON.stringify({index:selected<0?0:selected})};
  }
  assert.equal(stage,'GROUNDED_ARGUMENT_COMPLETION');
  assert.ok(messages.at(-1).content.includes('spreadsheet.compose'));
  return {text:JSON.stringify({title:'Compra de prueba',instructions:'Conservar cuadernos 36, lápices 18 y carpetas 27; total 81 calculado con fórmula.'})};
 }}}});
 assert.equal(plan.missionComplete,false);
 assert.equal(plan.toolCalls[0].name,'spreadsheet.compose');
 assert.ok(sizes.filter(s=>s.stage==='COMPLETION_AUDIT_TOOL_SELECTION').length>1);
 assert.equal(new Set(references).size,1,'reference context unchanged in every stage');
 assert.equal(new Set(evidence).size,1,'objectives, failed attempts, rejections and prior progress unchanged in every stage');
 assert.equal(seen.size,54,'every executable tool considered');
 assert.equal(JSON.stringify(fixture),before);
 console.log('GP02_STAGE_SIZES='+JSON.stringify(sizes));
});

for(const mode of ['none','invalid','truncated','unsplittable']){
 test('partitioned selection fails closed: '+mode,async()=>{
  const input=structuredClone(fixture);if(mode==='unsplittable')input.missionState.modelContextTokens=4096;
  let argumentCalls=0,selectionCalls=0;
  const promise=runJarvisSemanticPlanner({...input,ai:{lastProvider:'ollama-openai-compatible-local',models:{generateContent:async req=>{
   if(req.config.semanticStage==='COMPLETION_AUDIT')return {text:JSON.stringify({completionAssessment:{objectives:Object.fromEntries(input.missionState.evidenceObjectives.map((o,i)=>['objective_'+i,{...o,satisfied:false,evidenceTaskIndexes:[],limitation:'No hay archivo.'}]))},toolCalls:[]})};
   if(req.config.semanticStage==='GROUNDED_ARGUMENT_COMPLETION'){argumentCalls++;throw Error('UNEXPECTED_ARGUMENTS');}
   selectionCalls++;
   if(mode==='invalid')return {text:'{"index":9999}'};
   if(mode==='truncated')return {text:'{"index":0}',providerResponse:{finishReason:'length'}};
   return {text:'{"index":-1}'};
  }}}});
  if(mode==='none'){const plan=await promise;assert.equal(plan.missionComplete,false);assert.deepEqual(plan.toolCalls,[]);assert.ok(selectionCalls>1);}
  else await assert.rejects(promise,new RegExp(mode==='invalid'?'SEMANTIC_TOOL_NOT_ALLOWED':mode==='truncated'?'SEMANTIC_COMPLETION_AUDIT_INCOMPLETE':'CONTEXT_NEEDS_SEGMENTATION'));
  assert.equal(argumentCalls,0);
  if(mode==='unsplittable')assert.equal(selectionCalls,0,'never send an oversized selection to provider');
 });
}
