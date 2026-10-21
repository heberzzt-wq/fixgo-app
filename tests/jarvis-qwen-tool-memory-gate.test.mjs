import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isExplicitToolMemoryQuestion} from '../modules/terminal/qwen-tool-memory-gate.js';

test('new code, creation and research requests never get answered from stale tests memory',()=>{
 for(const input of [
  'Audita el código del flujo requestPayout; usa repo.grep y repo.read y ejecuta pruebas con tests.run. No inventes resultados.',
  'Ejecuta las pruebas de seguridad y dime el resultado verificable.',
  'Revisa el último resultado de pruebas y después corrige el bug del código.',
  'Crea una aplicación funcional y ejecuta tests.run.',
  'Investiga con fuentes reales la seguridad de los pagos y compárala con las pruebas del repositorio.',
  'Prepara la corrección para el error de concurrencia de requestPayout.',
  'Haz una auditoría de lo probado y lo no probado. ',
  'Revisa si el último test pasó y ejecuta nuevas pruebas.',
  'No ejecutes pagos ni bases de datos: audita código y pruebas.'
 ])assert.equal(isExplicitToolMemoryQuestion(input),false,input);
});

test('specific questions about previous tests can still reuse the observed tool receipt',()=>{
 for(const input of [
  '¿Pasaron las pruebas?',
  '¿Qué resultado tuvo el último test?',
  '¿Cuál fue el último resultado de las pruebas?',
  'Dime el último resultado del comando.',
  '¿Qué comando corriste antes?',
  '¿Cuánto tardó la última prueba?',
  '¿Fallaron los tests?'
 ])assert.equal(isExplicitToolMemoryQuestion(input),true,input);
});

test('HTML routes through explicit memory-intent helper before cached memory response',()=>{
 const html=readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
 assert.match(html,/qwen-tool-memory-gate\.js\?release=v142-memory-question-20261021-v1/);
 assert.match(html,/const isToolMemoryQuestion = isExplicitToolMemoryQuestion\(comando\)/);
 assert.doesNotMatch(html,/normalizedMemoryQuestion\.includes\("resultado"\)/);
});
