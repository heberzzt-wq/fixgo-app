import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readBoundedLocalImage,analyzeLocalUploadedImage} from '../jarvis-local-upload-vision.js';

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-vision-v142-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const folder=path.join(root,'.jarvis-artifacts','uploads');
 fs.mkdirSync(folder,{recursive:true});
 const bytes=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(64,0x71),Buffer.from([255,217])]);
 const output='.jarvis-artifacts/uploads/photo.jpg';
 fs.writeFileSync(path.join(folder,'photo.jpg'),bytes);
 const sha256=createHash('sha256').update(bytes).digest('hex');
 return {root,output,bytes,sha256,folder};
}
test('local vision reads exact uploaded image and verifies expected SHA',t=>{
 const {root,output,sha256,bytes}=fixture(t);
 const result=readBoundedLocalImage({root,output,expectedSha256:sha256});
 assert.equal(result.sha256,sha256);
 assert.deepEqual(result.bytes,bytes);
 assert.equal(result.mimeType,'image/jpeg');
});
test('local vision rejects traversals, unsupported content, bad signature and mismatched SHA',t=>{
 const f=fixture(t);
 for(const output of ['../../secret.jpg','.jarvis-artifacts/other.jpg',
  '.jarvis-artifacts/uploads/../uploads/photo.jpg','.jarvis-artifacts/uploads/file.pdf'])
  assert.throws(()=>readBoundedLocalImage({root:f.root,output}),/LOCAL_VISION_/);
 assert.throws(()=>readBoundedLocalImage({root:f.root,output:f.output,expectedSha256:'a'.repeat(64)}),/LOCAL_VISION_SHA256_MISMATCH/);
 fs.writeFileSync(path.join(f.folder,'photo.jpg'),Buffer.alloc(70,1));
 assert.throws(()=>readBoundedLocalImage({root:f.root,output:f.output}),/LOCAL_VISION_IMAGE_SIGNATURE_INVALID/);
});
test('Qwen receives one local image, never cloud, and marks descriptive result unverified',async t=>{
 const f=fixture(t);let call=null;
 const fetchImpl=async(url,options)=>{
  call={url,payload:JSON.parse(options.body)};
  return {ok:true,json:async()=>({model:'qwen3.5:9b',done:true,message:{content:'Se observa una imagen.'}})};
 };
 const result=await analyzeLocalUploadedImage({root:f.root,output:f.output,expectedSha256:f.sha256,question:'¿Qué ves?',fetchImpl});
 assert.equal(call.url,'http://127.0.0.1:11434/api/chat');
 assert.equal(call.payload.model,'qwen3.5:9b');
 assert.equal(call.payload.stream,false);
 assert.equal(call.payload.messages.length,1);
 assert.equal(call.payload.messages[0].images.length,1);
 assert.equal(call.payload.messages[0].images[0],f.bytes.toString('base64'));
 assert.equal(result.description,'Se observa una imagen.');
 assert.equal(result.independentlyVerified,false);
 assert.equal(result.externalApiUsed,false);
 assert.equal(result.sha256Verified,true);
 assert.ok(!JSON.stringify(result).includes('dataBase64'));
});
test('model response cannot pretend visual inspection finished without exact Qwen receipt',async t=>{
 const f=fixture(t);
 for(const bad of [
  {model:'different',done:true,message:{content:'Inventado'}},
  {model:'qwen3.5:9b',done:false,message:{content:'Incompleto'}},
  {model:'qwen3.5:9b',done:true,message:{content:''}}
 ]) {
  await assert.rejects(()=>analyzeLocalUploadedImage({root:f.root,output:f.output,
    fetchImpl:async()=>({ok:true,json:async()=>bad})}),/LOCAL_VISION_RESPONSE_UNVERIFIED/);
 }
});
