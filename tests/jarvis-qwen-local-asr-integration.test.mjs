import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyNarrationTimeline} from '../jarvis-qwen-audio-evidence.js';
import {localAsrHealth,pcmAsWav,transcribeLocalPcm} from '../jarvis-qwen-local-asr.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source='a'.repeat(64);
function sample(text='La reunión comienza a las 10 de la mañana.'){
 return {sourceSha256:source,durationSeconds:3.8,
  narration:'La reunión comienza a las diez de la mañana.',
  scenes:[{durationSeconds:3.8,subtitle:'La reunión comienza a las diez de la mañana.'}],
  transcription:{sourceSha256:source,completed:true,segments:[{text,startSeconds:.3,durationSeconds:2.9}]}};
}
test('ASR-only 10 and diez are equivalent in Spanish transcript comparison',()=>{
 const result=verifyNarrationTimeline(sample());
 assert.equal(result.transcriptionVerified,true);
 assert.equal(result.synchronizationVerified,true);
});
test('different number, added promise and absent speech remain rejected',()=>{
 for(const text of ['La reunión comienza a las 100 de la mañana.',
   'La reunión comienza a las nueve de la mañana.',
   'La reunión comienza a las 10 de la mañana. Garantizado gratis.','']){
  const result=verifyNarrationTimeline(sample(text));
  assert.equal(result.transcriptionVerified,false);
  assert.equal(result.synchronizationVerified,false);
 }
});
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-asr-unit-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const configDir=path.join(root,'.jarvis-artifacts');
 const model=path.join(root,'model');
 fs.mkdirSync(configDir);fs.mkdirSync(model);
 const bin=Buffer.from('local-model-fixture');
 fs.writeFileSync(path.join(model,'model.bin'),bin);
 fs.writeFileSync(path.join(configDir,'whisper-local.config.json'),JSON.stringify({
  enabled:true,engine:'faster-whisper',localOnly:true,pythonExecutable:process.execPath,
  modelDirectory:model,modelBinSha256:sha(bin)}));
 return root;
}
test('review capability is local health, not unconfigured success',t=>{
 const root=fixture(t);
 assert.equal(localAsrHealth({root}).transcriptionAvailable,true);
 assert.equal(localAsrHealth({root:path.join(root,'missing')}).transcriptionAvailable,false);
});
test('offline worker receipt binds the exact generated WAV and decoded PCM SHA',async t=>{
 const root=fixture(t);
 const pcm=Buffer.alloc(16000*2*3,5),sourceSha256=sha(pcm);
 let seen=false,inputFile;
 const r=await transcribeLocalPcm({root,pcm,sourceSha256,runProcess:async(_exe,args,options)=>{
  assert.equal(options.env.HF_HUB_OFFLINE,'1');
  assert.equal(options.env.CUDA_VISIBLE_DEVICES,'');
  assert.equal(args[1],'--audio');
  inputFile=args[2];
  const wav=fs.readFileSync(inputFile);
  assert.deepEqual(wav,pcmAsWav(pcm));
  seen=true;
  return {stdout:JSON.stringify({completed:true,provider:'faster-whisper',language:'es',
   sourceWaveSha256:sha(wav),segments:[{text:'Prueba',startSeconds:.1,durationSeconds:.5}]})};
 }});
 assert.equal(seen,true);assert.equal(r.sourceSha256,sourceSha256);
 assert.equal(r.segments[0].text,'Prueba');
 assert.equal(fs.existsSync(inputFile),false);
});
test('forged worker hashes and absent model cannot yield completed evidence',async t=>{
 const root=fixture(t),pcm=Buffer.alloc(16000*2*2,5);
 await assert.rejects(transcribeLocalPcm({root,pcm,sourceSha256:'b'.repeat(64)}),/SOURCE_SHA_MISMATCH/);
 await assert.rejects(transcribeLocalPcm({root,pcm,sourceSha256:sha(pcm),
  runProcess:async()=>({stdout:JSON.stringify({completed:true,provider:'faster-whisper',
   language:'es',sourceWaveSha256:'0'.repeat(64),segments:[]})})}),/RECEIPT_INVALID/);
});

import {authorizeMedia} from '../modules/terminal/qwen-general-media.js';
test('pre-render narration accepts diez versus 10 only when all other words and scene receipts agree',()=>{
 const outputs=[1,2,3].map(i=>({output:i+'.png',width:1080,height:1920,sha256:String(i).repeat(64)}));
 const receipts=[
  {ok:true,name:'image.adapt',observation:{outputs}},
  {ok:true,name:'speech.synthesize',args:{text:'Uno. Diez. Tres.'},
    observation:{output:'voice.wav',durationSeconds:30}}
 ];
 const args={output:'reel.mp4',studioOutput:'reel.html',audioOutput:'voice.wav',
  scenes:outputs.map((item,i)=>({assetOutput:item.output,durationSeconds:10,
   subtitle:['Uno.','10.','Tres.'][i],overlay:'Escena '+(i+1)}))};
 const good=authorizeMedia({name:'reel.create',args},receipts,{ownPath:()=>true});
 assert.equal(good.ok,true,JSON.stringify(good));
 args.scenes[1].subtitle='11.';
 assert.equal(authorizeMedia({name:'reel.create',args},receipts,
   {ownPath:()=>true}).reason,'NARRATION_SUBTITLE_TEXT_MISMATCH');
});
