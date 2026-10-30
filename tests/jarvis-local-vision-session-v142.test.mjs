import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createLocalVisionReviewSession,requireLocalVisionSession} from '../jarvis-local-vision-session.js';
import {analyzeLocalUploadedMediaBatch} from '../jarvis-local-media-review.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const jpeg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(68,5)]);
const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftyp'),Buffer.alloc(160,6)]);
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-vision-resume-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,'.jarvis-artifacts','uploads');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'photo.jpg'),jpeg);fs.writeFileSync(path.join(dir,'clip.mp4'),mp4);
 const photo={output:'.jarvis-artifacts/uploads/photo.jpg',sha256:hash(jpeg)};
 const video={output:'.jarvis-artifacts/uploads/clip.mp4',sha256:hash(mp4)};
 const prefix='.jarvis-artifacts/media-evidence/'+video.sha256.slice(0,20)+'/';
 const samples=[0,1.2,2.3].map((time,i)=>({
  output:prefix+'frame-'+String(i+1).padStart(3,'0')+'.jpg',mimeType:'image/jpeg',
  sha256:hash(jpeg),timestampSeconds:time}));
 return {root,photo,video,samples};
}
test('session uses only host-owned instances, not user-supplied untrusted checkpoints',()=>{
 const session=createLocalVisionReviewSession();
 assert.equal(requireLocalVisionSession(session),session);
 assert.throws(()=>requireLocalVisionSession({observe:async()=>{},snapshot:()=>({})}),/CHECKPOINT_UNTRUSTED/);
 assert.equal(session.snapshot().durable,false);
 assert.equal(session.snapshot().missionComplete,false);
 assert.equal(session.snapshot().independentlyVerified,false);
});
test('local Qwen image review resumes unchanged same-session observations without duplicate inference',async t=>{
 const f=fixture(t),session=createLocalVisionReviewSession();
 let calls=0;
 const reply=async(_url,options)=>{
  calls++;return {ok:true,json:async()=>({model:'qwen3.5:9b',done:true,
   message:{content:'Observación '+calls}})};
 };
 const args={root:f.root,attachments:[f.photo],question:'Qué ves?',
  fetchImpl:reply,readArtifact:async()=>{throw Error('NO_READ')},
  extractTemporal:async()=>{throw Error('NO_VIDEO')},reviewSession:session};
 const one=await analyzeLocalUploadedMediaBatch(args);
 const two=await analyzeLocalUploadedMediaBatch(args);
 assert.equal(calls,1);
 assert.deepEqual(one.sources[0].observation,two.sources[0].observation);
 assert.equal(two.reviewProgress.successfulObservations,1);
 assert.equal(two.reviewProgress.durable,false);
 await analyzeLocalUploadedMediaBatch({...args,question:'Otra pregunta'});
 assert.equal(calls,2,'new question must not reuse stale semantic observations');
});
test('partial video failure resumes completed frame calls but never false-certifies the batch',async t=>{
 const f=fixture(t),session=createLocalVisionReviewSession();
 let calls=0;
 const readArtifact=async({output})=>({ok:true,output,
  sha256:hash(jpeg),mimeType:'image/jpeg',dataBase64:jpeg.toString('base64')});
 const extractTemporal=async({output})=>({ok:true,output,sha256:f.video.sha256,
  temporal:{durationSeconds:2.4,samples:f.samples,audio:{codec:'aac'}}});
 const fetchImpl=async()=>{
  calls++;
  if(calls===2)throw Error('TEMPORARY_LOCAL_INFERENCE_INTERRUPTED');
  return {ok:true,json:async()=>({model:'qwen3.5:9b',done:true,
   message:{content:'Lectura '+calls}})};
 };
 const args={root:f.root,attachments:[f.video],question:'Revisa el video',
  extractTemporal,readArtifact,fetchImpl,reviewSession:session};
 await assert.rejects(()=>analyzeLocalUploadedMediaBatch(args),/LOCAL_VISION_OLLAMA_UNAVAILABLE/);
 assert.equal(session.snapshot().successfulObservations,1);
 const result=await analyzeLocalUploadedMediaBatch(args);
 assert.equal(calls,4,'first frame reused, failed frame rerun and third frame processed');
 assert.equal(result.sources[0].frames[0].observation,'Lectura 1');
 assert.equal(result.sources[0].framesObserved,3);
 assert.equal(result.reviewProgress.successfulObservations,3);
 assert.equal(result.objectiveSatisfied,false);
 assert.equal(result.sources[0].audioTranscriptionVerified,false);
});
