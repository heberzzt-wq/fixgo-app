import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generalObjectives,engineeringReportVerified,engineeringReportIssues,
 requiredEngineeringSourceFiles,summarizeGeneralEvidence,verifyGeneralMission}
 from '../modules/terminal/qwen-general-evidence.js';
import {prioritizeGeneralCodeCatalog} from '../modules/terminal/qwen-general-pilot.js';

const instruction='Auditoria senior. Rastrea en el codigo del repositorio la cadena de autenticacion Firebase de Terminal Heberto al bridge local y al ejecutor. Cita rutas de codigo y ejecuta pruebas relevantes, sin modificar codigo ni produccion.';
const required=requiredEngineeringSourceFiles(instruction);
const sourceReceipt=file=>({name:'repo.read',ok:true,args:{file},
 observation:{ok:true,verifiedRead:{file,content:fs.readFileSync(new URL('../'+file,import.meta.url),'utf8')}}});
const grep={name:'repo.grep',ok:true,args:{term:'firebase'},observation:{ok:true,matches:[{file:'functions/index.js'}]}};
const tests={name:'tests.run',ok:true,args:{command:'check:syntax'},observation:{ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}};
const receipts=[grep,...required.map(sourceReceipt),tests];
const report='Auditoria de autenticacion: modules/terminal/qwen-direct-transport.js obtiene el token Firebase del usuario activo para transmitirlo por el bridge. jarvis-workstation-health.js verifica el token Bearer, la identidad propietaria y la version de release. jarvis-qwen-tool-bridge.js vuelve a validar principalId, tenantId y role antes de ejecutar cada herramienta y bloquea cambios de sesion. Se ejecuto tests.run check:syntax correctamente, pero esa suite sintactica no demuestra bypass de autenticacion, multiusuario ni concurrencia con tokens reales. Las pruebas de autorizacion autenticada requieren una prueba independiente y aislada.';
const tool=name=>({name,inputSchema:{type:'object',properties:{file:{type:'string'},term:{type:'string'},command:{type:'string'}},required:[name==='repo.read'?'file':name==='repo.grep'?'term':'command']}});

test('broad senior requests route to engineering without magic bug keyword',()=>{
 assert.equal(generalObjectives(instruction).code,true);
 for(const text of ['Revisa el codigo de las funciones de KYC y ejecuta pruebas.',
 'Diagnostica la arquitectura de autenticacion y la seguridad del bridge.',
 'Rastrea el endpoint Firebase y el flujo de sesion en el backend.'])
  assert.equal(generalObjectives(text).code,true,text);
 for(const text of ['Investiga mantenimiento preventivo y entrega DOCX y PDF; sin modificar codigo.',
 'Explica que es un programa educativo de matematicas.',
 'Crea una pagina HTML comercial.','Cuanto es dos mas dos?'])
  assert.equal(generalObjectives(text).code,false,text);
});
test('cross-layer mission targets authenticated browser, bridge and executor sources in real repository',()=>{
 assert.deepEqual(required,['modules/terminal/qwen-direct-transport.js','jarvis-workstation-health.js','jarvis-qwen-tool-bridge.js']);
 const catalog=['repo.read','repo.grep','tests.run'].map(tool);
 for(let already=0;already<required.length;already++){
  const narrowed=prioritizeGeneralCodeCatalog(catalog,[grep,...required.slice(0,already).map(sourceReceipt)],instruction);
  assert.equal(narrowed.length,1);assert.equal(narrowed[0].name,'repo.read');
  assert.deepEqual(narrowed[0].inputSchema.properties.file.enum,required.slice(already));
 }
 const after=prioritizeGeneralCodeCatalog(catalog,[...receipts.slice(0,-1)],instruction);
 assert.equal(after[0].name,'tests.run');
 assert.equal(after[0].inputSchema.properties.command.const,'check:syntax');
});
test('generic source-grounded certification requires the actual three authority boundaries',async()=>{
 assert.equal(engineeringReportVerified(report,receipts,instruction),true);
 const checked=await verifyGeneralMission({instruction,receipts,proposedReport:report,objectives:generalObjectives(instruction)});
 assert.equal(checked.ok,true,JSON.stringify(checked.objectives));
 const brief=summarizeGeneralEvidence(receipts,generalObjectives(instruction),instruction);
 assert.deepEqual(brief.engineeringSourceRequirements,required);
 assert.equal(brief.engineeringExecutedTests[0].command,'check:syntax');
 assert.equal(brief.deliveryGaps.filter(g=>g.reason==='ENGINEERING_AUTH_BOUNDARY_SOURCE_REQUIRED').length,0);
 const withoutBridge=receipts.filter(r=>r.args?.file!=='jarvis-workstation-health.js');
 assert.equal(engineeringReportVerified(report,withoutBridge,instruction),false);
 assert.ok(engineeringReportIssues(report,withoutBridge,instruction).includes('READ_REQUIRED_BOUNDARY_SOURCE:jarvis-workstation-health.js'));
 const vague=report.replace('check:syntax','prueba de sintaxis');
 assert.ok(engineeringReportIssues(vague,receipts,instruction).includes('REPORT_EXECUTED_TEST_COMMAND_REQUIRED'));
 assert.equal(engineeringReportVerified(vague,receipts,instruction),false);
 assert.equal(engineeringReportVerified(report,receipts.slice(0,-1),instruction),false);
});
test('existing strict financial code evidence gate stays unchanged',()=>{
 assert.equal(generalObjectives('Audita requestPayout y valida importes').code,true);
 assert.equal(engineeringReportVerified(report,receipts,'Audita requestPayout y valida importes'),false);
 assert.deepEqual(requiredEngineeringSourceFiles('Audita requestPayout y ejecuta pruebas'),[]);
});

test('real source excerpts expose authentication checks to local Qwen, not just file names',async()=>{
 const {compactVerifiedEngineeringSource}=await import('../modules/terminal/qwen-engineering-source-excerpt.js');
 const paths=[
  ['modules/terminal/qwen-direct-transport.js',/getIdToken/],
  ['jarvis-workstation-health.js',/verifyIdToken/],
  ['jarvis-qwen-tool-bridge.js',/validateAuthenticatedContext/]
 ];
 for(const [file,pattern] of paths){
  const content=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const excerpt=compactVerifiedEngineeringSource({file,content});
  assert.equal(excerpt.sourceTextOmitted,false,file);
  assert.match(excerpt.sourceExcerpt,pattern,file);
  assert.equal(excerpt.sourceExcerptPartial,true);
  assert.ok(excerpt.sourceExcerpt.length<=3200);
 }
});

test('syntax-only tests cannot certify effective security controls or low residual risk',()=>{
 const claims=[
  report+' Los controles contra cambio de sesion son funcionales y efectivos.',
  report+' El riesgo residual bajo esta confirmado.',
  report+' No se detectaron mezclas de usuarios ni escalamiento de permisos.',
 ];
 for(const draft of claims){
  assert.equal(engineeringReportVerified(draft,receipts,instruction),false,draft);
  assert.ok(engineeringReportIssues(draft,receipts,instruction).includes('UNVERIFIED_AUTH_SECURITY_SUCCESS_CLAIM'));
 }
 const withoutLimit=report.replace('pero esa suite sintactica no demuestra bypass de autenticacion, multiusuario ni concurrencia con tokens reales. Las pruebas de autorizacion autenticada requieren una prueba independiente y aislada.',
 'por lo que los controles estan implementados.');
 assert.ok(engineeringReportIssues(withoutLimit,receipts,instruction).includes('STATIC_SYNTAX_TESTS_CANNOT_CERTIFY_AUTH_BEHAVIOR'));
 assert.equal(engineeringReportVerified(report,receipts,instruction),true);
});
