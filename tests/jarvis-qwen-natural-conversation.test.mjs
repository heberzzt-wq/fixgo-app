import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyEmptyGeneralCatalog,requestQwenGeneralConversation} from '../modules/terminal/qwen-empty-catalog.js';

test('ordinary planning and follow-up instructions are conversation, not unsupported missions',()=>{
 for(const text of [
  'Necesito un itinerario de tres días en Mérida, barato y sin reservaciones.',
  'Ahora cambia solamente el día dos por naturaleza. Mantén el resto.',
  'Resúmeme lo acordado y recuerda las preferencias iniciales.',
  'Recomiéndame una forma de estudiar sin gastar mucho dinero.'
 ])assert.equal(classifyEmptyGeneralCatalog(text),'CONVERSATION',text);
});
test('requests for actual files, code patches and payments are not silently satisfied by text',()=>{
 for(const text of ['Crea un PDF descargable','Genera una imagen PNG','Haz una página HTML','Modifica código del repositorio','Paga la factura'])
  assert.equal(classifyEmptyGeneralCatalog(text),'UNSUPPORTED_MISSION',text);
});
test('previous conversation turns are sent to Qwen for a context-dependent follow-up',async()=>{
 let supplied='';
 const history=[
  {role:'user',text:'Viaje de tres días, prefiero museos y bajo presupuesto.'},
  {role:'assistant',text:'Día 1 museo, día 2 museo, día 3 gastronomía.'}
 ];
 const answer=await requestQwenGeneralConversation({
  instruction:'Cambia solo el día dos por naturaleza.',history,
  selectAction:async info=>{supplied=info.instruction;return {toolCall:{name:'conversation.reply',args:{text:'Día 2: naturaleza de bajo costo; días 1 y 3 permanecen igual.'}}};}
 });
 assert.match(supplied,/Viaje de tres días/);
 assert.match(supplied,/Día 1 museo/);
 assert.match(supplied,/Cambia solo el día dos/);
 assert.match(answer,/días 1 y 3/);
});
