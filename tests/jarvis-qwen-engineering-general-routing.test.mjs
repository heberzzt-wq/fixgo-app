import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generalObjectives,engineeringReportVerified,engineeringReportIssues,verifyGeneralMission} from '../modules/terminal/qwen-general-evidence.js';

const instruction='Auditoria senior. Rastrea en el codigo del repositorio la cadena de autenticacion Firebase de Terminal Heberto al bridge local y al ejecutor. Cita rutas de codigo y ejecuta pruebas relevantes, sin modificar codigo ni produccion.';
const source='jarvis-workstation-health.js';
const receipts=[
 {name:'repo.grep',ok:true,args:{term:'auth'},observation:{ok:true,matches:[{file:source}]}},
 {name:'repo.read',ok:true,args:{file:source},observation:{ok:true,verifiedRead:{file:source,content:fs.readFileSync(new URL('../'+source,import.meta.url),'utf8')}}},
 {name:'tests.run',ok:true,args:{command:'check:syntax'},observation:{ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}}
];
const report='Auditoria de autenticacion: leí jarvis-workstation-health.js, donde createWorkstationAuthorization comprueba el token Bearer de Firebase, la identidad del propietario y la version de release antes de aceptar la solicitud. Se ejecuto tests.run check:syntax correctamente, pero esas pruebas son sintacticas: no demuestran intercambio de sesiones simultaneo ni autorizacion real de dos usuarios. Falta probar el comportamiento con identidades autenticadas de prueba aisladas.';
test('ordinary senior engineering request routes to code tools, without magic keywords',()=>{
 assert.equal(generalObjectives(instruction).code,true);
 for(const text of [
  'Revisa el codigo de las funciones de KYC y ejecuta las pruebas.',
  'Diagnostica la arquitectura de autenticacion y la seguridad del bridge.',
  'Rastrea el endpoint Firebase y el flujo de sesion en el backend.'
 ])assert.equal(generalObjectives(text).code,true,text);
 for(const text of [
  'Investiga mantenimiento preventivo y entrega DOCX y PDF; sin modificar codigo.',
  'Explica que es un programa educativo de matematicas.',
  'Crea una pagina HTML comercial.',
  'Cuanto es dos mas dos?'
 ])assert.equal(generalObjectives(text).code,false,text);
});
test('generic engineering certification is anchored to relevant real files and physically run tests',async()=>{
 assert.equal(engineeringReportVerified(report,receipts,instruction),true);
 const result=await verifyGeneralMission({instruction,receipts,proposedReport:report,objectives:generalObjectives(instruction)});
 assert.equal(result.ok,true,JSON.stringify(result.objectives));
 assert.equal(engineeringReportVerified(report.replaceAll(source,'no-such-auth.js'),receipts,instruction),false);
 assert.equal(engineeringReportVerified(report,receipts.slice(0,2),instruction),false);
 assert.ok(engineeringReportIssues(report.replaceAll(source,'no-such-auth.js'),receipts,instruction).includes('CITE_ACTUALLY_READ_SOURCE_PATH'));
});
test('payout report remains under stringent existing financial evidence policy',()=>{
 const payoutInstruction='Audita requestPayout y demuestra la validacion de importes.';
 assert.equal(generalObjectives(payoutInstruction).code,true);
 assert.equal(engineeringReportVerified(report,receipts,payoutInstruction),false);
});
