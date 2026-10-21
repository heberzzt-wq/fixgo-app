// Host-owned offline audio transcription. Qwen selects no paths, model or expected text.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const execute=promisify(execFile);
const worker=fileURLToPath(new URL('./jarvis-whisper-local.py',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const shaFormat=/^[a-f0-9]{64}$/i;
const verifiedModels=new Map();
function getConfig(root){
 if(typeof root!=='string'||!path.isAbsolute(root))return null;
 const file=path.join(root,'.jarvis-artifacts','whisper-local.config.json');
 try {
  if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())return null;
  const c=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  if(c.enabled!==true||c.engine!=='faster-whisper'||c.localOnly!==true||
     !path.isAbsolute(c.pythonExecutable||'')||!path.isAbsolute(c.modelDirectory||'')||
     !shaFormat.test(c.modelBinSha256||''))return null;
  const py=fs.realpathSync(c.pythonExecutable),model=fs.realpathSync(c.modelDirectory);
  if(!fs.statSync(py).isFile()||!fs.statSync(model).isDirectory()||
     !fs.statSync(path.join(model,'model.bin')).isFile()||!fs.statSync(worker).isFile())return null;
  return {python:py,model,modelSha256:c.modelBinSha256.toLowerCase()};
 }catch{return null;}
}
export function localAsrHealth({root}={}){
 const c=getConfig(root);
 return {transcriptionAvailable:!!c,synchronizationVerifierAvailable:!!c,offlineOnly:true,
  provider:c?'faster-whisper':null,model:c?'small-multilingual':null,
  evidenceVerified:false};
}
async function verifyModel(c){
 const file=path.join(c.model,'model.bin'),stat=fs.statSync(file);
 const key=c.model+'|'+stat.size+'|'+stat.mtimeMs+'|'+c.modelSha256;
 if(verifiedModels.has(key))return;
 const digest=createHash('sha256');
 await new Promise((resolve,reject)=>{
  const stream=fs.createReadStream(file);
  stream.on('data',buf=>digest.update(buf));stream.on('end',resolve);stream.on('error',reject);
 });
 if(digest.digest('hex')!==c.modelSha256)throw Error('LOCAL_ASR_MODEL_SHA_MISMATCH');
 verifiedModels.clear();verifiedModels.set(key,true);
}
export function pcmAsWav(pcm){
 if(!Buffer.isBuffer(pcm)||pcm.length<32000||pcm.length>6000000||pcm.length%2)throw Error('LOCAL_ASR_PCM_INVALID');
 const wav=Buffer.alloc(44+pcm.length);
 wav.write('RIFF',0);wav.writeUInt32LE(36+pcm.length,4);wav.write('WAVEfmt ',8);
 wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
 wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);
 wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);
 pcm.copy(wav,44);return wav;
}
export async function transcribeLocalPcm({root,pcm,sourceSha256,signal,runProcess=execute}={}){
 if(!Buffer.isBuffer(pcm)||hash(pcm)!==sourceSha256)throw Error('LOCAL_ASR_SOURCE_SHA_MISMATCH');
 const config=getConfig(root);
 if(!config)throw Error('LOCAL_ASR_NOT_CONFIGURED');
 await verifyModel(config);
 const wav=pcmAsWav(pcm),waveSha=hash(wav);
 const temporary=await mkdtemp(path.join(tmpdir(),'jarvis-local-asr-'));
 try{
  const input=path.join(temporary,'speech.wav');
  await writeFile(input,wav,{flag:'wx'});
  const {stdout}=await runProcess(config.python,[worker,'--audio',input,'--model',config.model],{
   windowsHide:true,timeout:180000,maxBuffer:512000,cwd:root,signal,
   env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',
    HF_HUB_DISABLE_TELEMETRY:'1',CUDA_VISIBLE_DEVICES:'',PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'}});
  let obj;try{obj=JSON.parse(stdout);}catch{throw Error('LOCAL_ASR_RESPONSE_INVALID');}
  if(obj?.completed!==true||obj?.provider!=='faster-whisper'||obj?.language!=='es'||
     obj.sourceWaveSha256!==waveSha||!Array.isArray(obj.segments))throw Error('LOCAL_ASR_RECEIPT_INVALID');
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  if(obj.segments.length>2200||obj.segments.some(s=>!s||typeof s.text!=='string'||s.text.length>100||
     !finite(s.startSeconds)||!finite(s.durationSeconds)||s.startSeconds<0||s.durationSeconds<=0||
     s.startSeconds+s.durationSeconds>pcm.length/32000+.35))
     throw Error('LOCAL_ASR_WORD_TIMESTAMPS_INVALID');
  return {completed:true,sourceSha256,provider:'faster-whisper',language:'es',
   sourceWaveSha256:waveSha,segments:obj.segments};
 }finally{await rm(temporary,{recursive:true,force:true});}
}

export async function transcribeLocalPcmByScene({root,pcm,sourceSha256,scenes,signal,runProcess=execute}={}){
 if(!Buffer.isBuffer(pcm)||hash(pcm)!==sourceSha256)throw Error('LOCAL_ASR_SOURCE_SHA_MISMATCH');
 if(!Array.isArray(scenes)||scenes.length<3||scenes.length>18||
    scenes.some(s=>!Number.isFinite(s?.durationSeconds)||s.durationSeconds<1))throw Error('LOCAL_ASR_SCENE_TIMELINE_INVALID');
 const duration=pcm.length/32000,requested=scenes.reduce((n,s)=>n+s.durationSeconds,0);
 if(Math.abs(duration-requested)>.35)throw Error('LOCAL_ASR_AUDIO_SCENE_DURATION_MISMATCH');
 const segments=[],sceneSlices=[];
 let start=0;
 for(const [index,scene]of scenes.entries()){
  signal?.throwIfAborted();
  const end=start+scene.durationSeconds;
  const startBytes=Math.round(start*16000)*2,endBytes=Math.min(pcm.length,Math.round(end*16000)*2);
  const portion=pcm.subarray(startBytes,endBytes),clipSha256=hash(portion);
  const observed=await transcribeLocalPcm({root,pcm:portion,sourceSha256:clipSha256,signal,runProcess});
  sceneSlices.push({index,startSeconds:start,durationSeconds:scene.durationSeconds,pcmSha256:clipSha256,bytes:portion.length,
    sourceWaveSha256:observed.sourceWaveSha256,observedSegments:observed.segments.length});
  for(const word of observed.segments){
   if(word.startSeconds+word.durationSeconds>scene.durationSeconds+.35)throw Error('LOCAL_ASR_SCENE_WORD_OUTSIDE_AUDIO');
   segments.push({...word,startSeconds:Number((start+word.startSeconds).toFixed(5))});
  }
  start=end;
 }
 return {completed:true,sourceSha256,provider:'faster-whisper',language:'es',segmentedFromPhysicalPcm:true,
  sceneSlices,segments};
}
