import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createJarvisFsBridgeApp} from '../jarvis-fs-bridge.js';
import {materialLibrary} from '../jarvis-material-library.js';
import {unfulfilledDownloadFormats,prioritizeGeneralOfficeCatalog}
 from '../modules/terminal/qwen-general-contract.js';

const sha=b=>createHash('sha256').update(b).digest('hex');
const mission='general-1aaabbbb-1ccc-4ddd-8eee-123456789012';
const prefix='.jarvis-artifacts/qwen-general/'+mission+'/';
const instructions='Crea y entrega un Excel XLSX y PDF con datos ficticios, formulas y totales, sin pagos reales';
function isolatedBridgeIdentity(){
 const container=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-office-identity-'));
 const root=path.join(container,'worktree'),remote=path.join(container,'remote.git');
 fs.mkdirSync(root);
 const git=process.platform==='win32'&&fs.existsSync('C:/Program Files/Git/cmd/git.exe')
  ?'C:/Program Files/Git/cmd/git.exe':'git';
 execFileSync(git,['init','--bare',remote],{stdio:'ignore'});
 execFileSync(git,['init','-b','v142-official'],{cwd:root,stdio:'ignore'});
 const run=parts=>execFileSync(git,['-c','protocol.allow=never','-c','protocol.file.allow=always',...parts],
  {cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 run(['config','user.email','office-lab@example.invalid']);
 run(['config','user.name','NS1 Office Integration Test']);
 const canonical='https://github.com/test-owner/fixgo-test.git',local=pathToFileURL(remote).href;
 run(['remote','add','origin',canonical]);
 run(['remote','set-url','--push','origin',local]);
 run(['config','url.'+local+'.insteadOf',canonical]);
 fs.writeFileSync(path.join(root,'jarvis-runtime-contract.json'),JSON.stringify({
  projectId:'fixgo-test',repository:'test-owner/fixgo-test',
  branch:'v142-official',releaseId:'test-release'
 }));
 fs.writeFileSync(path.join(root,'.gitignore'),'.jarvis-artifacts/\nmateriales/\n');
 fs.writeFileSync(path.join(root,'identity-marker.txt'),'valid local test identity\n');
 run(['add','.']);run(['commit','-m','identity fixture']);run(['push','-u','origin','v142-official']);
 return {root,container};
}
test('official native document pipeline creates, reads, exports and verifies real XLSX/PDF bytes', {timeout:35000},async t=>{
 const fixture=isolatedBridgeIdentity();const root=fixture.root;
 const lib=path.join(root,'materiales');fs.mkdirSync(lib,{recursive:true});
 fs.mkdirSync(path.join(root,'.jarvis-artifacts'),{recursive:true});
 fs.writeFileSync(path.join(root,'.jarvis-artifacts/material-library.config.json'),
  JSON.stringify({directory:lib,sharedReadOnly:false,officialOnly:true,externalGenerationAllowed:false}));
 const app=createJarvisFsBridgeApp({root});
 const server=app.listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(fixture.container,{recursive:true,force:true})});
 const base='http://127.0.0.1:'+server.address().port;
 async function create(format,content,extra){
  const output=prefix+'real-'+format+'.'+format;
  const resp=await fetch(base+'/document',{method:'POST',headers:{'content-type':'application/json','x-jarvis-release-id':'test-release'},
   body:JSON.stringify({
    title:'Reporte de laboratorio nativo',format,output,content,
    requireDocumentValidation:true,...extra
   })});
  const body=await resp.json();
  assert.equal(resp.status,200,'native '+format+': '+JSON.stringify(body).slice(0,1600));
  assert.equal(body.ok,true);assert.equal(body.status,'DOCUMENT_CREATED');
  assert.equal(body.output,output);
  assert.equal(body.artifact?.file,output);
  const source=path.resolve(root,output);
  assert.equal(fs.existsSync(source),true);
  const bytes=fs.readFileSync(source),fingerprint=sha(bytes);
  assert.equal(fingerprint,body.artifact.sha256);
  assert.equal(bytes.length,body.artifact.bytes);
  const exported=materialLibrary({root,action:'export',output});
  assert.equal(exported.status,'MATERIAL_EXPORTED_VERIFIED');
  assert.equal(exported.ok,true);
  assert.equal(exported.sha256,fingerprint);
  const dest=path.join(exported.directory,...exported.relativePath.split('/'));
  assert.equal(fs.existsSync(dest),true);
  assert.equal(sha(fs.readFileSync(dest)),fingerprint);
  return [
   {name:'document.create',ok:true,args:{format,output,content},observation:body},
   {name:'artifact.read',ok:true,args:{output},observation:{
    ok:true,output,sha256:fingerprint,bytes:bytes.length,
    dataBase64:bytes.toString('base64')}},
   {name:'media.library',ok:true,args:{action:'export',output},observation:exported}
  ];
 }
 const workbook=[
  ['Concepto','Monto'],
  ['Saldo inicial',5000],
  ['Pago 1',1250],
  ['Pago 2',800],
  ['Pago 3',450],
  ['Total pagado','=SUM(B3:B5)'],
  ['Saldo pendiente','=B2-B6']
 ];
 const first=await create('xlsx','Movimientos financieros de laboratorio, todos ficticios.',{
  requireFormulas:true,sheets:[{name:'Control',rows:workbook}]
 });
 assert.equal(first[0].observation.workbookCalculationVerified,true);
 assert.equal(first[0].observation.workbookCalculation?.verified,true);
 const second=await create('pdf',
  'REPORTE DE PRUEBA. Este es un ejercicio ficticio para verificar generación de documentos. '+
  'Se parte de 5000 pesos simulados y tres movimientos de 1250, 800 y 450 pesos. '+
  'El total ficticio es 2500 y el saldo ficticio es 2500. '+
  'No se efectuaron pagos, se modificaron cuentas ni se emplearon documentos de clientes. '+
  'Los archivos se emitieron y verificaron en un servidor temporal en 127.0.0.1.',
  {});
 assert.equal(second[0].observation.pdfContentProof?.verified,true);
 const receipts=[...first,...second];
 assert.deepEqual(unfulfilledDownloadFormats(instructions,receipts),[]);
 for(const format of ['pdf','xlsx']){
  const bad=structuredClone(receipts);
  const exportReceipt=bad.find(r=>r.name==='media.library'&&r.args.output.endsWith('.'+format));
  exportReceipt.observation={ok:true,experimental:true,output:exportReceipt.args.output,
   sha256:exportReceipt.observation.sha256};
  assert.deepEqual(unfulfilledDownloadFormats(instructions,bad),[format]);
 }
 const tool=n=>({name:n,inputSchema:{type:'object',required:[],
  properties:{format:{type:'string'},output:{type:'string'}}}});
 const offered=prioritizeGeneralOfficeCatalog(['document.create','artifact.read','media.library'].map(tool),receipts,instructions);
 assert.deepEqual(offered,[],'no further files to export');
 console.log('[NATIVE_OFFICE_INTEGRATION] PDF XLSX physically written and exported; formulas/proof/hash verified');
});
