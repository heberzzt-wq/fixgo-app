import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JARVIS_PRIVATE_RELAY,validateJarvisRelayRequest} from '../gestia-core/jarvis/jarvis.semantic.transport.js';
import {validateMobileRelayUploadOperation,JARVIS_MOBILE_UPLOAD_ROUTES,
 MOBILE_UPLOAD_MAX_FILE_BYTES,MOBILE_UPLOAD_CHUNK_BYTES,mobileRelayNeedsFreshOwnerToken}
 from '../modules/terminal/jarvis-mobile-relay-policy.js';

const id='11111111-2222-4333-8444-555555555555';
const payloadStart={batchId:'batch-1234567890',name:'captura.png',mimeType:'image/png',
 expectedBytes:1024,caseId:'CASE-123',objectiveId:'OBJ-123'};
const base64=Buffer.from('hello jarvis').toString('base64');
const wrapped=(route,payload)=>({schemaVersion:1,ownerUid:JARVIS_PRIVATE_RELAY.ownerUid,
 requestId:id,route,releaseId:'fixture',body:JSON.stringify(payload),state:'QUEUED',
 createdAt:Date.now()-250,expiresAt:Date.now()+30000});
const accepted=(route,payload)=>validateJarvisRelayRequest(wrapped(route,payload),{requestId:id,releaseId:'fixture'});

test('mobile upload routes are the exact four, owner-only and no git/write route is granted',()=>{
 assert.deepEqual([...JARVIS_MOBILE_UPLOAD_ROUTES],[
 '/upload/start','/upload/chunk','/upload/complete','/upload/cancel']);
 for(const route of JARVIS_MOBILE_UPLOAD_ROUTES){
  assert.ok(JARVIS_PRIVATE_RELAY.routes.includes(route));
  assert.equal(mobileRelayNeedsFreshOwnerToken(route,{}),true);
 }
 for(const route of ['/git','/repo/write','/upload','/write/authorize','/media/library','/shutdown'])
  assert.ok(!JARVIS_PRIVATE_RELAY.routes.includes(route));
 assert.equal(MOBILE_UPLOAD_MAX_FILE_BYTES,8*1024*1024);
 assert.equal(MOBILE_UPLOAD_CHUNK_BYTES,128*1024);
});

test('start request is limited to allowed content and a single bounded owner batch',()=>{
 assert.equal(accepted('/upload/start',payloadStart).payload.name,'captura.png');
 for(const [name,mime] of [['clip.mp4','video/mp4'],['clip.webm','video/webm'],['clip.mov','video/quicktime']]) {
  assert.equal(accepted('/upload/start',{...payloadStart,name,mimeType:mime,expectedBytes:4*1024*1024}).payload.name,name);
 }
 for(const change of [
  {name:'../secret.png'},{name:'.env'},{name:'file.exe'},{name:'file.zip'},
  {name:'file.heic'},{name:'malicioso.png/../otro'},
  {mimeType:''},{expectedBytes:0},{expectedBytes:8*1024*1024+1},
  {batchId:'x'},{caseId:'../escape'},{objectiveId:'OBJ/escape'},
  {secret:'injected'},{idToken:'DO_NOT_STORE'}
 ])assert.throws(()=>accepted('/upload/start',{...payloadStart,...change}),/JARVIS_MOBILE_UPLOAD_|JARVIS_RELAY_/,
  'must reject '+JSON.stringify(change));
});

test('base64 chunk is fixed, bounded and cannot carry extra arguments or credentials',()=>{
 const p={uploadId:id,offset:0,dataBase64:base64};
 assert.equal(accepted('/upload/chunk',p).payload.dataBase64,base64);
 const realChunk=Buffer.alloc(64*1024,0x65).toString('base64');
 assert.equal(accepted('/upload/chunk',{...p,dataBase64:realChunk}).payload.dataBase64,realChunk);
 const tooBig=Buffer.alloc(2*1024*1024,0x65).toString('base64');
 assert.throws(()=>validateMobileRelayUploadOperation('/upload/chunk',{...p,dataBase64:tooBig}),/JARVIS_MOBILE_UPLOAD_BODY_TOO_LARGE/);
 assert.throws(()=>accepted('/upload/chunk',{...p,dataBase64:tooBig}),/JARVIS_RELAY_PAYLOAD_TOO_LARGE/);
 for(const change of [{offset:-1},{offset:8*1024*1024},{dataBase64:'???'},
  {dataBase64:'a'.repeat(180000)},{uploadId:'../wrong'},{command:'push'},
  {password:'secret'}])
  assert.throws(()=>accepted('/upload/chunk',{...p,...change}),/JARVIS_MOBILE_UPLOAD_|JARVIS_RELAY_/,
   'must reject '+JSON.stringify(Object.keys(change)));
});

test('completion and cancellation accept upload ID only, no other filesystem request',()=>{
 for(const route of ['/upload/complete','/upload/cancel']){
  assert.equal(accepted(route,{uploadId:id}).payload.uploadId,id);
  for(const payload of [{uploadId:'oops'},{uploadId:id,path:'../../secret'},
   {uploadId:id,destination:'C:/repo'},{uploadId:id,deleteAll:true}])
   assert.throws(()=>accepted(route,payload),/JARVIS_MOBILE_UPLOAD_/);
 }
});

test('client uses bounded 64KB HTTPS chunks without replaying uncertain persisted writes',()=>{
 const attachments=readFileSync('modules/terminal/jarvis-attachments.js','utf8');
 const bootstrap=readFileSync('modules/terminal/nexo-bootstrap.js','utf8');
 const bridge=readFileSync('jarvis-fs-bridge.js','utf8');
 assert.match(attachments,/MOBILE_CHUNK_BYTES = 64 \* 1024/);
 assert.match(attachments,/window\.location\?\.protocol === "https:"/);
 assert.match(attachments,/MOBILE_BATCH_BYTES = 16 \* 1024 \* 1024/);
 assert.match(attachments,/if \(isMobileRelayHost\(\)\) attempts = 1/);
 assert.match(attachments,/isMobileRelayHost\(\) \? MOBILE_CHUNK_BYTES : CHUNK_BYTES/);
 assert.match(bootstrap,/JARVIS_MOBILE_UPLOAD_ROUTES\.includes\(path\) \? 1 : maximumAttempts/);
 // The browser checks the owner and exact route; the signed worker/Bridge,
 // not a duplicate client preflight, enforce the upload body schema.
 assert.match(bootstrap,/if \(!policy\.routes\.includes\(route\)\)/);
 assert.doesNotMatch(bootstrap,/if \(JARVIS_MOBILE_UPLOAD_ROUTES\.includes\(route\)\)\s*validateMobileRelayUploadOperation\(route,payload\)/);
 assert.match(readFileSync('gestia-core/jarvis/jarvis.semantic.transport.js','utf8'),/validateMobileRelayUploadOperation\(request\.route,payload\)/);
 assert.match(bootstrap,/JARVIS_MOBILE_UPLOAD_ROUTES\.includes\(path\) \?\s*\{"X-Jarvis-Private-Relay": "owner-upload-v142"\}/);
 assert.match(bridge,/const authorizeMobileAttachment = createWorkstationAuthorization/);
 assert.match(bridge,/validateMobileRelayUploadOperation\(req\.baseUrl,req\.body\|\|\{\}\)/);
 assert.doesNotMatch(bridge,/validateMobileRelayUploadOperation\(req\.path,req\.body\|\|\{\}\)/);
 assert.match(bridge,/if\(!await authorizeMobileAttachment\(req,res\)\)return/);
 assert.match(bridge,/if\(!marker\)return next\(\)/);
 assert.match(bridge,/marker!=="owner-upload-v142"/);
 assert.match(bridge,/allowedHeaders: \["Content-Type", "X-Jarvis-Release-Id", "X-Jarvis-Private-Relay", "Authorization"\]/);
});

import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startChunkedUpload,appendChunkedUpload,completeChunkedUpload} from '../jarvis-fs-bridge.js';
import {MOBILE_UPLOAD_BATCH_BYTES,MOBILE_UPLOAD_MAX_FILES} from '../modules/terminal/jarvis-mobile-relay-policy.js';

test('actual local upload engine persists one owner-mobile text file with SHA evidence',()=>{
 const root=mkdtempSync(join(tmpdir(),'v142-mobile-upload-fixture-'));
 try{
  const data=Buffer.from('Jarvis mobile file proof\n');
  const limits={maxFileBytes:MOBILE_UPLOAD_MAX_FILE_BYTES,
    maxBatchBytes:MOBILE_UPLOAD_BATCH_BYTES,maxFiles:MOBILE_UPLOAD_MAX_FILES};
  const started=startChunkedUpload({batchId:'batch-upload-proof-1',name:'mobile.txt',
    mimeType:'text/plain',expectedBytes:data.length,root,limits});
  assert.equal(started.ok,true);
  const chunk=appendChunkedUpload({uploadId:started.uploadId,offset:0,
    dataBase64:data.toString('base64'),root});
  assert.equal(chunk.receivedBytes,data.length);
  const saved=completeChunkedUpload({uploadId:started.uploadId,root});
  assert.equal(saved.ok,true);
  assert.equal(saved.bytes,data.length);
  assert.match(saved.sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(readFileSync(join(root,saved.output)),data);
  assert.ok(saved.output.startsWith('.jarvis-artifacts/uploads/'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('physical server enforces mobile per-file and cumulative quotas even if client is modified',()=>{
 const root=mkdtempSync(join(tmpdir(),'v142-mobile-upload-limits-'));
 const limits={maxFileBytes:MOBILE_UPLOAD_MAX_FILE_BYTES,
  maxBatchBytes:MOBILE_UPLOAD_BATCH_BYTES,maxFiles:2};
 try{
  assert.throws(()=>startChunkedUpload({root,limits,batchId:'batch-a-12345',
   name:'oversize.pdf',expectedBytes:MOBILE_UPLOAD_MAX_FILE_BYTES+1}),/UPLOAD_FILE_BYTES_OUT_OF_RANGE/);
  for(const name of ['a.pdf','b.pdf']){
   const s=startChunkedUpload({root,limits,batchId:'batch-a-12345',
    name,mimeType:'application/pdf',expectedBytes:MOBILE_UPLOAD_MAX_FILE_BYTES});
   assert.equal(s.ok,true);
  }
  assert.throws(()=>startChunkedUpload({root,limits,batchId:'batch-a-12345',
   name:'third.pdf',mimeType:'application/pdf',expectedBytes:1}),/UPLOAD_BATCH_FILE_LIMIT/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('fresh mobile browser uses new modules and retains the exact Firebase rules activation receipt',()=>{
 const page=readFileSync('gestia-terminal.html','utf8');
 const state=readFileSync('modules/terminal/proposal-state.js','utf8');
 const proposal=readFileSync('security/jarvis-mobile-upload-activation-proposal-20261029.md','utf8');
 const snapshot=readFileSync('security/firestore-console-snapshot-2026-07-30.rules.txt','utf8');
 const receipt=readFileSync('security/jarvis-mobile-upload-activation-receipt-20261029.md','utf8');
 assert.match(receipt,/84fdac84-2c5f-4d7e-89a7-72877d819547/);
 assert.match(receipt,/Solo|Única modificación textual/);
 assert.match(receipt,/b76abec92fac1cd09866741a18058eaa2b471e57a26f86d03fb55d2d3d89b249/);
 assert.match(page,/jarvis-attachments\.js\?v=v142-owner-visual-review-20261029-v8/);
 assert.match(page,/proposal-state\.js\?v=v142-owner-upload-preflight-20261029-v7/);
 assert.match(state,/nexo-bootstrap\.js\?v=v142-owner-upload-preflight-20261029-v7/);
 assert.match(proposal,/NO PUBLICADA/);
 for(const route of JARVIS_MOBILE_UPLOAD_ROUTES){
  assert.ok(proposal.includes("'"+route+"'"),route);
  assert.ok(!snapshot.includes("'"+route+"'"),'the historical rules were not modified: '+route);
 }
 assert.match(proposal,/reglas vigentes de producción/);
 assert.match(readFileSync('modules/terminal/jarvis-attachments.js','utf8'),
  /El enlace móvil no tiene permiso de Firebase para recibir este archivo/);
});
