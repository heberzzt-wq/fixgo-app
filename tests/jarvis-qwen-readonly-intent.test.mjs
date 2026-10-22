import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {codeRepairRequested,codePreviewOnlyRequested,generalObjectives,
  engineeringReportIssues,verifyGeneralMission} from '../modules/terminal/qwen-general-evidence.js';

const userMission='Jarvis, identifica en el repositorio local dónde se implementa createPilotVersionGate, explica cómo valida las versiones del navegador y del bridge, y entrega un diagnóstico citando los archivos utilizados. No modifiques ningún archivo.';

function receipts(){
 const file='jarvis-qwen-pilot-version.js';
 const suite='tests/jarvis-qwen-pilot-version.test.mjs';
 return [
  {name:'repo.grep',ok:true,args:{term:'createPilotVersionGate'},
   observation:{ok:true,matches:[{file,line:54},{file:suite,line:7}]}},
  ...[file,suite].map(file=>({name:'repo.read',ok:true,args:{file},
   observation:{ok:true,verifiedRead:{file,content:readFileSync(new URL('../'+file,import.meta.url),'utf8')}}})),
  {name:'tests.run',ok:true,args:{command:'check:syntax'},
   observation:{ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}}
 ];
}

test('read-only mission about where code is implemented does not request implementation',()=>{
 assert.equal(generalObjectives(userMission).code,true);
 assert.equal(codeRepairRequested(userMission),false);
 assert.equal(codePreviewOnlyRequested(userMission),false);
 for(const query of [
  '¿Dónde se implementa la verificación de versiones en el bridge?',
  'Explica cómo se aplica la validación del token de acceso.',
  'Revisa dónde se modifica el estado y no cambies nada.',
  'Investiga cuándo se corrige una falla del servidor.',
  'Describe cómo se repara automáticamente sin tocar el repositorio.'
 ])assert.equal(codeRepairRequested(query),false,query);
});

test('genuine positive code modification commands remain recognized',()=>{
 for(const query of [
  'Implementa una ruta de prueba en un repositorio aislado.',
  'Corrige el error de rutas del módulo y ejecuta pruebas.',
  'Repara el backend de prueba.',
  'Aplica el parche exacto.',
  'Modifica el módulo local y verifica el resultado.',
  'No modifiques producción; implementa un endpoint en un laboratorio.'
 ])assert.equal(codeRepairRequested(query),true,query);
 assert.equal(codeRepairRequested('Prepara un parche exacto para revisión, sin aplicarlo.'),true);
});

test('a verified read-only inspection can finish without fake patch requirements',async()=>{
 const report='FUENTES LEÍDAS: jarvis-qwen-pilot-version.js implementa createPilotVersionGate y calcula SHA-256 de los archivos WATCHED, además de comparar la huella del navegador con el arranque del bridge. Leí también tests/jarvis-qwen-pilot-version.test.mjs, que contiene casos de cliente obsoleto y modificación posterior al arranque. PRUEBAS EJECUTADAS: tests.run ejecutó check:syntax y devolvió PASSED con exitCode 0; esa suite de sintaxis no demuestra la seguridad de una sesión real ni el funcionamiento bajo concurrencia. LÍMITES NO DEMOSTRADOS: no se realizaron pruebas de usuario autenticado en un navegador real, ni se modificaron archivos.';
 const rows=receipts();
 assert.deepEqual(engineeringReportIssues(report,rows,userMission),[]);
 const certification=await verifyGeneralMission({instruction:userMission,receipts:rows,proposedReport:report,
  objectives:generalObjectives(userMission)});
 assert.equal(certification.ok,true,JSON.stringify(certification.objectives));
 assert.equal(certification.objectives.some(c=>c.reason==='CODE_PATCH_PREVIEW_REQUIRED'),false);
 assert.equal(certification.objectives.some(c=>c.reason==='ISOLATED_CODE_REPAIR_NOT_IMPLEMENTED'),false);
});
