import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {requiredDeliveryFormats,missingMissionInputs,unavailableMissionOperations,unfulfilledDownloadFormats,prioritizeGeneralOfficeCatalog} from '../modules/terminal/qwen-general-contract.js';
import {generalObjectives,verifyGeneralMission} from '../modules/terminal/qwen-general-evidence.js';

const prompts=[
 'Misión 01 — Control financiero. Crear una hoja Excel con pagos, saldo, fórmulas y totales, acompañada de un PDF. Descargar ambos y verificar los cálculos.',
 'Misión 02 — Investigación completa. Investigar un tema real con tres fuentes independientes y entregar un informe DOCX y PDF con citas comprobadas.',
 'Misión 03 — Creación multimedia. Producir desde cero una campaña con imágenes, una landing y un MP4, entregar todos los archivos descargables y verificar audio, subtítulos y composición.',
 'Misión 04 — Investigación operativa. Consultar técnicos, servicios, vehículos, documentos vencidos y asignaciones. Entregar Excel y PDF.',
 'Misión 05 — Programación autónoma. Analizar un proyecto de prueba, localizar un error, preparar una corrección, ejecutar pruebas y entregar un parche.'
];
test('five failed generic missions cannot invent inputs, scopes or file deliveries',()=>{
 assert.ok(missingMissionInputs(prompts[0]).length);
 assert.ok(missingMissionInputs(prompts[1]).length);
 assert.ok(missingMissionInputs(prompts[2]).length);
 assert.ok(unavailableMissionOperations(prompts[3]).length);
 assert.ok(unavailableMissionOperations(prompts[4]).length);
 assert.deepEqual(requiredDeliveryFormats(prompts[0]),['pdf','xlsx']);
 assert.deepEqual(requiredDeliveryFormats(prompts[1]),['pdf','docx']);
 assert.deepEqual(requiredDeliveryFormats('¿Qué es un PDF?'),[]);
 assert.deepEqual(requiredDeliveryFormats('Crear un presupuesto XLSX y PDF'),['pdf','xlsx']);
});
test('document catalog processes write, physical read, export, next file, then independent finish',()=>{
 const instruction='Entrega informe DOCX y PDF sobre una muestra de prueba';
 const mkTool=name=>({name,inputSchema:{type:'object',properties:{content:{type:'string'},format:{type:'string'},output:{type:'string'},title:{type:'string'}},required:[]}});
 const catalog=['document.create','artifact.read','media.library'].map(mkTool);
 const output='.jarvis-artifacts/qwen-general/general-fixture/report.docx',sha='a'.repeat(64);
 let offered=prioritizeGeneralOfficeCatalog(catalog,[],instruction);
 assert.equal(offered.length,1);assert.equal(offered[0].name,'document.create');
 const created={name:'document.create',ok:true,args:{format:'docx',content:'Verified original writing',output},observation:{ok:true,output,artifact:{file:output,sha256:sha,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},documentValidation:{ok:true}}};
 offered=prioritizeGeneralOfficeCatalog(catalog,[created],instruction);
 assert.equal(offered[0].name,'artifact.read');assert.equal(offered[0].inputSchema.properties.output.const,output);
 const read={name:'artifact.read',ok:true,args:{output},observation:{ok:true,output,sha256:sha,bytes:100,dataBase64:'opaque'}};
 offered=prioritizeGeneralOfficeCatalog(catalog,[created,read],instruction);
 assert.equal(offered[0].name,'media.library');assert.equal(offered[0].inputSchema.properties.action.const,'export');
 const exported={name:'media.library',ok:true,args:{action:'export',output},observation:{ok:true,output,sha256:sha,experimental:true}};
 offered=prioritizeGeneralOfficeCatalog(catalog,[created,read,exported],instruction);
 assert.equal(offered[0].name,'document.create');assert.deepEqual(offered[0].inputSchema.properties.format.enum,['pdf']);
});
test('independent verification rejects missing or fake download deliverables, no false VERIFIED_COMPLETE',async()=>{
 const instruction='Entrega un informe DOCX y PDF con citas comprobadas';
 const result=await verifyGeneralMission({instruction,receipts:[],proposedReport:'{"sources":[]}',objectives:{document:true,advertising:false,research:false}});
 assert.equal(result.ok,false);
 assert.ok(result.objectives.some(o=>o.reason==='REQUESTED_DOWNLOAD_FORMATS_MISSING'));
 assert.deepEqual(unfulfilledDownloadFormats(instruction,[]),['pdf','docx']);
 const bogus={name:'document.create',ok:true,args:{format:'pdf'},observation:{ok:true,output:'.jarvis-artifacts/a.pdf',artifact:{file:'.jarvis-artifacts/a.pdf',sha256:'b'.repeat(64),mimeType:'application/pdf'}}};
 assert.deepEqual(unfulfilledDownloadFormats(instruction,[bogus]),['pdf','docx']);
});
test('finite source data amounts are needed for spreadsheets unless explicit fictional examples',()=>{
 assert.deepEqual(missingMissionInputs('Crear Excel con pagos y saldo de $1000 MXN y dos movimientos de $300 MXN'),[]);
 assert.deepEqual(missingMissionInputs('Crear Excel de pagos ficticios como ejemplo sin datos privados'),[]);
 assert.ok(missingMissionInputs('Crear Excel con pagos y saldo sin datos adicionales').length);
});

test('repeated query is refused without execution, then a distinct query can complete',async()=>{
 const {runQwenAuthorizedCycle}=await import('../jarvis-qwen-direct-cycle.js');
 const tool={name:'web.research',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}};
 let executed=0,attempts=0;
 const result=await runQwenAuthorizedCycle({
  instruction:'Investigate two different references',catalog:[tool],maximumSteps:7,stepLimit:7,repairIncomplete:true,
  catalogForEvidence:items=>items,
  selectNextAction:async()=>{attempts++;if(attempts===1||attempts===2)return {toolCall:{name:tool.name,args:{query:'first reference'}}};
   if(attempts===3)return {toolCall:{name:tool.name,args:{query:'second reference'}}};
   return {finish:true,report:'Two independently executed queries'};},
  authorize:async()=>({ok:true}),
  execute:async()=>{executed++;return {ok:true,status:'GROUNDED_LOCAL_PRIMARY'};},
  verifyCompletion:async({receipts})=>({ok:receipts.length===2})
 });
 assert.equal(result.status,'SUCCESS');
 assert.equal(executed,2);
 assert.equal(result.receipts.length,2);
 assert.ok(result.missionLedger.rejectedToolChoices.some(x=>x.reason==='REPEATED_TOOL_CALL'));
});
test('Qwen cannot spin forever repeating the same query',async()=>{
 const {runQwenAuthorizedCycle}=await import('../jarvis-qwen-direct-cycle.js');
 const tool={name:'web.research',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}};
 let calls=0;
 const result=await runQwenAuthorizedCycle({
  instruction:'Research',catalog:[tool],maximumSteps:12,stepLimit:12,repairIncomplete:true,
  catalogForEvidence:items=>items,
  selectNextAction:async()=>({toolCall:{name:'web.research',args:{query:'same'}}}),
  authorize:async()=>({ok:true}),execute:async()=>{calls++;return {ok:true};},
  verifyCompletion:async()=>({ok:false})
 });
 assert.equal(calls,1);
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.reason,'REPEATED_TOOL_CALL');
});

test('complete DOCX/PDF task offers real document actions, but research precedes documents',async()=>{
 const {generalToolCatalog,prioritizeGeneralAdvertisingCatalog}=await import('../modules/terminal/qwen-general-pilot.js');
 const instruction='Investiga sobre mantenimiento preventivo de aires acondicionados y entrega informe DOCX y PDF con tres fuentes abiertas.';
 const objective=generalObjectives(instruction);
 const mock={list:()=>['document.create','artifact.read','media.library','web.research','browser.inspect'].map(name=>({
  name,inputSchema:{type:'object',properties:{format:{type:'string'},title:{type:'string'},output:{type:'string'},content:{type:'string'},query:{type:'string'},url:{type:'string'}},required:[]}
 }))};
 const policy={accept:()=>true,artifactRoot:'.jarvis-artifacts/qwen-general/general-fixture/',audioPrefix:'.jarvis-artifacts/audio/general-fixture-',imagePrefix:'general-fixture-'};
 const catalog=generalToolCatalog(mock,policy,objective,instruction);
 assert.ok(catalog.some(t=>t.name==='document.create'));
 const doc=catalog.find(t=>t.name==='document.create');
 assert.deepEqual(doc.inputSchema.properties.format.enum,['pdf','docx']);
 assert.ok(doc.inputSchema.properties.requireDocumentValidation);
 let offered=prioritizeGeneralAdvertisingCatalog(catalog,[],objective,instruction);
 assert.ok(offered.every(t=>['web.research','browser.inspect'].includes(t.name)));
 assert.ok(offered.length>0);
 const sources=['https://example.org/a','https://example.org/b','https://example.org/c'].map(url=>({ok:true,name:'browser.inspect',args:{url},observation:{ok:true,url,dom:'<title>Example</title>'}}));
 offered=prioritizeGeneralAdvertisingCatalog(catalog,sources,objective,instruction);
 assert.deepEqual(offered.map(t=>t.name),['web.research']); // Three opened URLs without inspected source proofs are not sufficient.
});

test('new DOCX is authorized only inside its exact mission directory; originals protected',async()=>{
 const {createGeneralToolPolicy}=await import('../jarvis-qwen-general-policy.js');
 const id='general-014f1114-9650-4011-b6f8-a6746e08864d';
 const p=createGeneralToolPolicy({location:{protocol:'http:',hostname:'127.0.0.1',port:'5000',search:'?qwenPilot=general-v1'},missionId:id,objectives:{document:true}});
 const path='.jarvis-artifacts/qwen-general/'+id+'/mantenimiento_aire_ac.docx';
 assert.equal(p.ownPath(path),true);
 assert.equal(p.authorize({name:'document.create',args:{format:'docx',output:path,content:'Texto autorizado',title:'Prueba',requireDocumentValidation:true}},[]).ok,true);
 for(const bad of ['.jarvis-artifacts/elsewhere/thing.docx','C:/Users/heber/Downloads/thing.docx','../thing.docx'])
  assert.equal(p.ownPath(bad),false,bad);
 assert.equal(p.authorize({name:'document.create',args:{format:'docx',output:path}},[{ok:true,name:'document.create',observation:{output:path}}]).reason,'EXISTING_ARTIFACT_OVERWRITE_FORBIDDEN');
});

test('new original DOCX validates real OOXML while legacy blueprint requirement stays strict',async t=>{
 const fs=await import('node:fs');
 const os=await import('node:os');
 const path=await import('node:path');
 const {buildDocxArtifactBuffer,validateDocxArtifactFile}=await import('../jarvis-docx-artifact.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-docx-original-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const text=[
 '# Mantenimiento preventivo',
 'La inspección visual permite reconocer obstrucciones, suciedad, daños aparentes y riesgos antes de intervenir un equipo ficticio. La revisión no acredita que se haya visitado una instalación real.',
 '## Seguridad del equipo',
 'Antes de retirar filtros se apaga completamente el equipo y se consulta el manual autorizado. Las tareas eléctricas y circuitos con refrigerante son exclusivamente para personal cualificado.',
 '## Registro del servicio',
 'El expediente de demostración conserva fecha, responsable, acciones previstas y observaciones. Ninguno de estos datos representa una inspección real ni se atribuye a clientes identificables.',
 '## Conclusiones',
 'La revisión preventiva es una guía de estudio y requiere comprobación técnica independiente antes de aplicarse a equipos, edificios o sistemas reales.'
 ].join('\n\n');
 const a=await buildDocxArtifactBuffer({title:'Guía de mantenimiento',content:text});
 const file=path.join(dir,'original.docx');fs.writeFileSync(file,a.buffer);
 const strict=await validateDocxArtifactFile({file,contract:{minSections:3,minWords:80},expectedValidation:{}});
 assert.equal(strict.ok,false);
 assert.ok(strict.failures.includes('DOCX_SOURCE_BLUEPRINT_NOT_VALIDATED'));
 const original=await validateDocxArtifactFile({file,contract:{documentKind:'original_draft',minSections:3,minWords:80},expectedValidation:{}});
 assert.equal(original.ok,true,JSON.stringify(original.failures));
 const bogus=await validateDocxArtifactFile({file,contract:{documentKind:'original_draft',minSections:8,minWords:80},expectedValidation:{}});
 assert.equal(bogus.ok,false);
});

test('financial payment records are not money-transfer authorization',async()=>{
 const {generalObjectives,generalRestrictedActionRequested}=await import('../modules/terminal/qwen-general-evidence.js');
 const instruction='Crea un archivo XLSX y PDF de datos ficticios: deuda inicial 5000 MXN, pagos 1250 MXN, 800 MXN y 450 MXN, con fórmulas y saldo. No realices pagos.';
 assert.equal(generalObjectives(instruction).prohibited,false);
 for(const s of ['haz un informe de pagos','consulta los pagos','registra pagos ficticios'])assert.equal(generalRestrictedActionRequested(s),false,s);
 for(const s of ['realiza un pago','efectúa pagos','haz deploy','pagar 100 MXN'])assert.equal(generalRestrictedActionRequested(s),true,s);
});

test('research about web forms and PDF DOCX is not authenticated interactive browser operation',()=>{
 const research='MISION SENIOR 07, solo experimento local sin publicar. Investiga accesibilidad web WCAG 2.2 y buenas practicas de formularios moviles usando tres fuentes independientes con contenido y citas exactas verificadas. Crea DOS archivos fisicos en el expediente de esta mision: informe-accesibilidad.docx e informe-accesibilidad.pdf. Incluye un checklist concreto para el formulario de registro de tecnicos, limitaciones, referencias y acciones priorizadas. Ejecuta document.create y artifact.read para cada archivo y media.library para exportarlos; no inventes fuentes, pruebas ni entregables. Si falla alguna capacidad declara PARCIAL con motivo exacto; no uses IA externa de pago ni modifiques FixGo.';
 assert.deepEqual(unavailableMissionOperations(research),[]);
 assert.deepEqual(requiredDeliveryFormats(research),['pdf','docx']);
 for(const s of [
  'Investiga diseno de formularios web accesibles.',
  'Documenta login web responsive sin abrir ninguna cuenta.',
  'No rellenes formularios web; prepara un informe DOCX.',
 ])assert.deepEqual(unavailableMissionOperations(s),[],s);
 for(const s of [
  'Navega al sitio web e inicia sesion con mis credenciales.',
  'Haz click en el boton del formulario web.',
  'Rellena un formulario de login en la pagina.',
 ])assert.ok(unavailableMissionOperations(s).some(x=>x.includes('navegación interactiva')),s);
});

test('complete WCAG DOCX/PDF research stays research and office delivery, not code or Firestore census',async()=>{
 const {generalObjectives}=await import('../modules/terminal/qwen-general-evidence.js');
 const prompt='MISION SENIOR 07, solo experimento local sin publicar. Investiga accesibilidad web WCAG 2.2 y buenas practicas de formularios moviles usando tres fuentes independientes con contenido y citas exactas verificadas. Crea DOS archivos fisicos en el expediente de esta mision: informe-accesibilidad.docx e informe-accesibilidad.pdf. Incluye un checklist concreto para el formulario de registro de tecnicos, limitaciones, referencias y acciones priorizadas. Ejecuta document.create y artifact.read para cada archivo y media.library para exportarlos; no inventes fuentes, pruebas ni entregables. Si falla alguna capacidad declara PARCIAL con motivo exacto; no uses IA externa de pago ni modifiques FixGo.';
 const result=generalObjectives(prompt);
 assert.deepEqual({code:result.code,research:result.research,records:result.records,document:result.document},{code:false,research:true,records:false,document:true});
 assert.equal(generalObjectives('Consulta la coleccion users en Firestore y cuenta tecnicos B2C').records,true);
 assert.equal(generalObjectives('Audita el codigo backend y entrega un informe en PDF').code,true);
 assert.equal(generalObjectives('Entrega documento DOCX sobre formularios web accesibles').code,false);
});
