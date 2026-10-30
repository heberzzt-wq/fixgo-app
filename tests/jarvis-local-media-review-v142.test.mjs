import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {analyzeLocalUploadedMediaBatch,verifyUploadedVideo} from '../jarvis-local-media-review.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function makeFixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-media-review-v142-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const upload=path.join(root,'.jarvis-artifacts/uploads');
 fs.mkdirSync(upload,{recursive:true});
 const jpg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(100,21)]);
 const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftyp'),Buffer.alloc(1024,12)]);
 const image='.jarvis-artifacts/uploads/photo.jpg';
 const video='.jarvis-artifacts/uploads/clip.mp4';
 fs.writeFileSync(path.join(upload,'photo.jpg'),jpg);
 fs.writeFileSync(path.join(upload,'clip.mp4'),mp4);
 return {root,image,video,jpg,mp4,imageHash:hash(jpg),videoHash:hash(mp4)};
}
const reply=async(_url,{body})=>{
 const data=JSON.parse(body);
 assert.equal(data.model,'qwen3.5:9b');
 assert.equal(data.messages.length,1);
 assert.equal(data.messages[0].images.length,1);
 assert.ok(data.messages[0].content.includes('material del usuario'));
 return {ok:true,json:async()=>({model:'qwen3.5:9b',done:true,message:{content:'Veo colores y formas.'}})};
};
test('a single image gets an independent Qwen call with SHA proof and no cloud execution',async t=>{
 const f=makeFixture(t);
 const results=await analyzeLocalUploadedMediaBatch({
  root:f.root,attachments:[{output:f.image,sha256:f.imageHash}],fetchImpl:reply,
  extractTemporal:async()=>{throw Error('DO_NOT_EXTRACT')},
  readArtifact:async()=>{throw Error('DO_NOT_READ')},
  question:'¿Qué ves?'
 });
 assert.equal(results.sourceCount,1);
 assert.equal(results.sources[0].kind,'image');
 assert.equal(results.sources[0].sha256,f.imageHash);
 assert.equal(results.sources[0].observation,'Veo colores y formas.');
 assert.equal(results.independentlyVerified,false);
 assert.equal(results.objectiveSatisfied,false);
 assert.equal(results.externalApiUsed,false);
 assert.equal(results.ownerReport.status,'LOCAL_MEDIA_OWNER_REPORT_PARTIAL');
 assert.match(results.ownerReport.text,/En la fotografía, Qwen describe/);
});
test('video gets individually bounded Qwen frame calls and reports audio unknown, not invented',async t=>{
 const f=makeFixture(t);
 const prefix='.jarvis-artifacts/media-evidence/'+f.videoHash.slice(0,20)+'/';
 const frames=[0,1.2,2.1].map((when,i)=>({sampleNumber:i+1,timestampSeconds:when,
  output:prefix+'frame-'+String(i+1).padStart(3,'0')+'.jpg',
  sha256:f.imageHash,mimeType:'image/jpeg'}));
 let count=0,progress=[];
 const results=await analyzeLocalUploadedMediaBatch({root:f.root,
  attachments:[{output:f.video,sha256:f.videoHash}],
  question:'Describe lo visible',fetchImpl:async(...args)=>{count++;return reply(...args);},
  extractTemporal:async({output})=>{
   assert.equal(output,f.video);
   return {ok:true,output,sha256:f.videoHash,temporal:{durationSeconds:2.34,
    audio:{codec:'aac'},samples:frames}};
  },
  readArtifact:async({output})=>({ok:true,output,sha256:f.imageHash,
   mimeType:'image/jpeg',dataBase64:f.jpg.toString('base64')}),
  onProgress:p=>progress.push(p)
 });
 assert.equal(count,3);
 assert.equal(progress.length,3);
 const source=results.sources[0];
 assert.equal(source.kind,'video');
 assert.equal(source.framesObserved,3);
 assert.equal(source.audioTrackPresent,true);
 assert.equal(source.audioTranscriptionVerified,false);
 assert.equal(source.fullVideoSemanticVerification,false);
 assert.equal(results.objectiveSatisfied,false);
 assert.equal(source.frames[2].timestampSeconds,2.1);
 assert.match(results.ownerReport.text,/Fotograma a 2\.10 segundos/);
 assert.match(results.ownerReport.text,/no fue transcrito ni analizado/);
});
test('video fail-closed on forged temporal outputs and SHA mismatches',async t=>{
 const f=makeFixture(t);
 assert.throws(()=>verifyUploadedVideo({root:f.root,output:f.video,expectedSha256:'a'.repeat(64)}),
  /LOCAL_VISION_SOURCE_HASH_MISMATCH/);
 for(const output of ['.jarvis-artifacts/uploads/../clip.mp4','/tmp/evil.mp4',
  '.jarvis-artifacts/uploads/photo.jpg']){
  assert.throws(()=>verifyUploadedVideo({root:f.root,output,expectedSha256:f.videoHash}),
   /LOCAL_VISION_VIDEO_PATH_INVALID/);
 }
 const fake={root:f.root,attachments:[{output:f.video,sha256:f.videoHash}],
  readArtifact:async()=>{throw Error('DO_NOT_READ')},fetchImpl:async()=>{throw Error('DO_NOT_CALL_QWEN')}};
 await assert.rejects(()=>analyzeLocalUploadedMediaBatch({...fake,
  extractTemporal:async()=>({ok:true,output:f.video,sha256:f.videoHash,
   temporal:{durationSeconds:2.34,samples:[{output:'.jarvis-artifacts/evil.jpg',mimeType:'image/jpeg',
    sha256:f.imageHash,timestampSeconds:1}]}})}),/LOCAL_VISION_TEMPORAL_FRAME_PROOF_INVALID/);
 await assert.rejects(()=>analyzeLocalUploadedMediaBatch({...fake,
  extractTemporal:async()=>({ok:true,output:f.video,sha256:'b'.repeat(64),temporal:{samples:[]}})}),
  /LOCAL_VISION_TEMPORAL_SOURCE_UNVERIFIED/);
});
test('batch refuses unbounded file count, unsupported files and absent dependencies',async t=>{
 const f=makeFixture(t);
 await assert.rejects(()=>analyzeLocalUploadedMediaBatch({root:f.root,attachments:Array(9).fill({output:f.image}),
  extractTemporal:async()=>{},readArtifact:async()=>{}}),/LOCAL_VISION_BATCH_SIZE_INVALID/);
 await assert.rejects(()=>analyzeLocalUploadedMediaBatch({root:f.root,attachments:[{output:f.image,sha256:f.imageHash}]}),
  /LOCAL_VISION_DEPENDENCIES_REQUIRED/);
});

test('video source bytes and duration must be physical and bounded',async t=>{
 const f=makeFixture(t);
 const buffer=Buffer.alloc(100,0x51);
 fs.writeFileSync(path.join(f.root,'.jarvis-artifacts/uploads','clip.mp4'),buffer);
 assert.throws(()=>verifyUploadedVideo({root:f.root,output:f.video,expectedSha256:hash(buffer)}),
  /LOCAL_VISION_VIDEO_SIGNATURE_INVALID/);
 fs.writeFileSync(path.join(f.root,'.jarvis-artifacts/uploads','clip.mp4'),f.mp4);
 const prefix='.jarvis-artifacts/media-evidence/'+f.videoHash.slice(0,20)+'/';
 await assert.rejects(()=>analyzeLocalUploadedMediaBatch({root:f.root,
  attachments:[{output:f.video,sha256:f.videoHash}],
  extractTemporal:async()=>({ok:true,output:f.video,sha256:f.videoHash,
   temporal:{durationSeconds:120,samples:[{output:prefix+'frame-001.jpg',
    mimeType:'image/jpeg',sha256:f.imageHash,timestampSeconds:1}]}}),
  readArtifact:async()=>{throw Error('SHOULD_NOT_READ')},
  fetchImpl:async()=>{throw Error('SHOULD_NOT_FETCH')}
 }),/LOCAL_VISION_DURATION_OUT_OF_RANGE/);
});

test('uploaded image batch requires a certified source SHA before Qwen is called',async t=>{
 const f=makeFixture(t);let fetches=0;
 await assert.rejects(()=>analyzeLocalUploadedMediaBatch({root:f.root,
   attachments:[{output:f.image}],extractTemporal:async()=>{throw Error('NO_VIDEO')},
   readArtifact:async()=>{throw Error('NO_ARTIFACT')},
   fetchImpl:async()=>{fetches++;throw Error('SHOULD_NOT_FETCH')}
 }),/LOCAL_VISION_SOURCE_HASH_REQUIRED/);
 assert.equal(fetches,0);
});
test('video sample timestamps must be distinct, ordered and within its actual duration',async t=>{
 const f=makeFixture(t),prefix='.jarvis-artifacts/media-evidence/'+f.videoHash.slice(0,20)+'/';
 const makeSamples=times=>times.map((v,i)=>({output:prefix+'frame-'+String(i+1).padStart(3,'0')+'.jpg',
   mimeType:'image/jpeg',sha256:f.imageHash,timestampSeconds:v}));
 for(const times of [[1,1],[1,0.5],[0,3],[0,-1]]){
  await assert.rejects(()=>analyzeLocalUploadedMediaBatch({
   root:f.root,attachments:[{output:f.video,sha256:f.videoHash}],
   extractTemporal:async()=>({ok:true,output:f.video,sha256:f.videoHash,
     temporal:{durationSeconds:2.34,samples:makeSamples(times)}}),
   readArtifact:async()=>{throw Error('SHOULD_NOT_READ')},
   fetchImpl:async()=>{throw Error('SHOULD_NOT_FETCH')}
  }),/LOCAL_VISION_TEMPORAL_FRAME_PROOF_INVALID/);
 }
});
