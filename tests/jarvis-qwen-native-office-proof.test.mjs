import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {unfulfilledDownloadFormats,prioritizeGeneralOfficeCatalog}
 from '../modules/terminal/qwen-general-contract.js';

function officeReceipts(format='pdf'){
 const bytes=Buffer.from('%PDF-1.7\n'+('REAL LOCAL PDF BODY\n'.repeat(12))+'%%EOF\n');
 const sha=createHash('sha256').update(bytes).digest('hex');
 const output='.jarvis-artifacts/qwen-general/general-12345678/verified.'+format;
 const artifact={file:output,bytes:bytes.length,sha256:sha,mimeType:'application/pdf'};
 return {
  output,sha,bytes,
  created:{ok:true,name:'document.create',args:{format,output},observation:{ok:true,output,artifact}},
  read:{ok:true,name:'artifact.read',args:{output},observation:{ok:true,output,bytes:bytes.length,sha256:sha,dataBase64:bytes.toString('base64')}},
  legacy:{ok:true,name:'media.library',args:{action:'export',output},
   observation:{ok:true,experimental:true,output,sha256:sha}},
  physical:{ok:true,name:'media.library',args:{action:'export',output},
   observation:{ok:true,status:'MATERIAL_EXPORTED_VERIFIED',directory:'C:/local-outputs',
    output,sha256:sha,bytes:bytes.length,
    relativePath:'Salidas/'+sha.slice(0,12)+'-verified.'+format}}
 };
}
const prompt='Crea y entrega un PDF de datos de prueba, sin operaciones reales';
test('native office PDF cannot be declared delivered from an experimental-only media flag',()=>{
 const r=officeReceipts();
 assert.deepEqual(unfulfilledDownloadFormats(prompt,[r.created,r.read,r.legacy]),['pdf']);
 assert.deepEqual(unfulfilledDownloadFormats(prompt,[r.created,r.read,r.physical]),[]);
});
test('native office export must match actual output, hash, size and physical Salidas path',()=>{
 const r=officeReceipts();
 for(const [key,value] of [
  ['status','FAKE_SUCCESS'],['directory',''],['sha256','0'.repeat(64)],
  ['bytes',r.bytes.length+1],['relativePath','Salidas/another.pdf'],
  ['output',r.output.replace('verified.pdf','wrong.pdf')]
 ]){
  const bad=structuredClone(r.physical);
  bad.observation[key]=value;
  assert.deepEqual(unfulfilledDownloadFormats(prompt,[r.created,r.read,bad]),['pdf'],key);
 }
});
test('office step planner cannot treat a fake experimental export as completed',()=>{
 const r=officeReceipts();
 const mk=name=>({name,inputSchema:{type:'object',properties:{format:{type:'string'},output:{type:'string'}}}});
 const tools=['document.create','artifact.read','media.library'].map(mk);
 const offered=prioritizeGeneralOfficeCatalog(tools,[r.created,r.read,r.legacy],prompt);
 assert.equal(offered.length,0,'invalid export receipt must not be skipped nor repeated');
 const done=prioritizeGeneralOfficeCatalog(tools,[r.created,r.read,r.physical],prompt);
 assert.deepEqual(done,[]);
});
