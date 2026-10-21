import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyEmptyGeneralCatalog,requestQwenGeneralConversation,unsupportedDownloadFormatRequest} from '../modules/terminal/qwen-empty-catalog.js';
import {generalObjectives} from '../modules/terminal/qwen-general-evidence.js';
import {generalToolCatalog} from '../modules/terminal/qwen-general-pilot.js';

const policy={accept:()=>true,artifactRoot:'.jarvis-artifacts/qwen-general/general-test/',
 audioPrefix:'.jarvis-artifacts/audio/general-test-',imagePrefix:'general-test-'};
const runtime={list:()=>[{name:'system.capabilities',inputSchema:{type:'object',properties:{}}}]};
test('greeting and non-actionable questions have no action catalog, not a fatal blocked pilot',()=>{
 for(const prompt of ['hola','¡Hola!','buenas tardes','¿Qué es diseño gráfico?','Explícame qué es un contrato']){
   const c=generalToolCatalog(runtime,policy,generalObjectives(prompt),prompt);
   assert.equal(c.length,0,prompt);
   assert.equal(classifyEmptyGeneralCatalog(prompt),'CONVERSATION',prompt);
 }
});
test('new Excel PDF office-format missions cannot claim to have produced absent downloads',()=>{
 for(const prompt of [
 'Misión 01 — Control financiero. Crear una hoja Excel con pagos y generar PDF.',
 'Investigar un asunto y entregar un informe DOCX y PDF con citas comprobadas.',
 'Crear un presupuesto XLSX descargable.',
 'Genera una presentación PPTX.'
 ])assert.equal(unsupportedDownloadFormatRequest(prompt),true,prompt);
 for(const prompt of ['hola','¿Qué es un PDF?','Produce MP4 de 30 segundos'])
   assert.equal(unsupportedDownloadFormatRequest(prompt),false,prompt);
 assert.equal(classifyEmptyGeneralCatalog('Analizar un proyecto, preparar parche y pruebas, sin desplegar'),'UNSUPPORTED_MISSION');
});
test('Qwen conversational path is local decision-only, never executes a fake tool',async()=>{
 let calls=0;
 const response=await requestQwenGeneralConversation({instruction:'hola',selectAction:async input=>{
  calls++;
  assert.equal(input.tools.length,1);
  assert.equal(input.tools[0].name,'conversation.reply');
  assert.equal(input.evidenceSummary.finishEligible,false);
  assert.deepEqual(input.observations,[]);
  return {toolCall:{name:'conversation.reply',args:{text:'Hola, ¿en qué puedo ayudarte?'}}};
 }});
 assert.equal(response,'Hola, ¿en qué puedo ayudarte?');
 assert.equal(calls,1);
 await assert.rejects(()=>requestQwenGeneralConversation({instruction:'Crear un PDF',selectAction:async()=>{throw Error('SHOULD_NOT_INFER');}}),/QWEN_CONVERSATION_INPUT_INVALID/);
 await assert.rejects(()=>requestQwenGeneralConversation({instruction:'hola',selectAction:async()=>({finish:true,report:'Archivo creado'})}),/QWEN_CONVERSATION_REPLY_INVALID/);
 await assert.rejects(()=>requestQwenGeneralConversation({instruction:'hola',selectAction:async()=>({toolCall:{name:'document.create',args:{text:'Documento creado'}}})}),/QWEN_CONVERSATION_REPLY_INVALID/);
});