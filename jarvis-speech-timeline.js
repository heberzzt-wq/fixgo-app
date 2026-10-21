import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {synthesizeSpeechArtifact,inspectWavBuffer} from './jarvis-speech-artifact.js';

const clean=t=>String(t||'').trim().replace(/\s+/gu,' ');
const assertScenes=(scenes,text)=>{
 if(!Array.isArray(scenes)||scenes.length<3||scenes.length>5||
   scenes.some(s=>!s||!clean(s.text)||!Number.isFinite(s.durationSeconds)||s.durationSeconds<1||
   s.durationSeconds>60||s.speechLanguage&&!['en-US','es-ES','es-MX'].includes(s.speechLanguage)))throw Error('TIMED_SPEECH_SCENES_INVALID');
 if(clean(scenes.map(s=>s.text).join(' '))!==clean(text))throw Error('TIMED_SPEECH_SCRIPT_MISMATCH');
 const total=scenes.reduce((sum,s)=>sum+s.durationSeconds,0);
 if(!Number.isFinite(total)||total<30||total>60||Math.abs(total-Math.round(total))>0.01)throw Error('TIMED_SPEECH_DURATION_INVALID');
 return total;
};
function pcmPayload(bytes){
 const fmt=inspectWavBuffer(bytes);let offset=12,data;
 while(offset+8<=bytes.length){
  const key=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4);
  if(key==='data'){data=bytes.subarray(offset+8,offset+8+size);break;}
  offset+=8+size+(size%2);
 }
 if(!data||fmt.bitsPerSample!==16||fmt.audioFormat!==1||fmt.channels!==1||fmt.blockAlign!==2)
  throw Error('TIMED_SPEECH_PCM_16_MONO_REQUIRED');
 return {fmt,data};
}
export function composeTimedSpeechWav(pieces,scenes){
 if(pieces.length!==scenes.length)throw Error('TIMED_SPEECH_PARTS_MISMATCH');
 const chunks=pieces.map(parts=>(Array.isArray(parts)?parts:[parts]).map(pcmPayload));
 const first=chunks[0]?.[0]?.fmt;
 if(!first||chunks.some(group=>!group.length)||chunks.flat().some(c=>c.fmt.sampleRate!==first.sampleRate||c.fmt.channels!==first.channels||c.fmt.bitsPerSample!==first.bitsPerSample))
  throw Error('TIMED_SPEECH_FORMAT_MISMATCH');
 const totalSeconds=assertScenes(scenes,scenes.map(s=>s.text).join(' '));
 const totalSamples=Math.round(first.sampleRate*totalSeconds);
 const pcm=Buffer.alloc(totalSamples*first.blockAlign);let current=0;
 for(const [i,group]of chunks.entries()){
  const allotted=Math.round(scenes[i].durationSeconds*first.sampleRate);
  const lead=Math.round(.65*first.sampleRate),gap=Math.round(.3*first.sampleRate);
  const end=current+allotted-Math.round(.2*first.sampleRate);
  let cursor=current+lead;
  for(const [j,piece]of group.entries()){
   const samples=piece.data.length/first.blockAlign;
   if(cursor+samples>end)throw Error('TIMED_SPEECH_SCENE_TOO_SHORT');
   piece.data.copy(pcm,cursor*first.blockAlign);
   cursor+=samples+(j<group.length-1?gap:0);
  }
  current+=allotted;
 }
 if(current!==totalSamples)throw Error('TIMED_SPEECH_SAMPLE_COUNT_MISMATCH');
 const output=Buffer.alloc(44+pcm.length);
 output.write('RIFF',0);output.writeUInt32LE(output.length-8,4);output.write('WAVEfmt ',8);
 output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(first.channels,22);
 output.writeUInt32LE(first.sampleRate,24);output.writeUInt32LE(first.byteRate,28);
 output.writeUInt16LE(first.blockAlign,32);output.writeUInt16LE(first.bitsPerSample,34);
 output.write('data',36);output.writeUInt32LE(pcm.length,40);pcm.copy(output,44);
 const checked=inspectWavBuffer(output);
 if(Math.abs(checked.durationSeconds-totalSeconds)>.01)throw Error('TIMED_SPEECH_OUTPUT_DURATION_MISMATCH');
 return output;
}
export function synthesizeSceneTimedSpeechArtifact(input={},options={}){
 const total=assertScenes(input.timingScenes,input.text);
 const root=path.resolve(input.root||options.root||process.cwd());
 const relative=String(input.output||'').replaceAll('\\','/');
 if(!/^\.jarvis-artifacts\/audio\/[a-zA-Z0-9_-]+\.wav$/.test(relative))throw Error('TIMED_SPEECH_OUTPUT_INVALID');
 const destination=path.resolve(root,relative);
 if(fs.existsSync(destination))throw Error('EXISTING_ARTIFACT_OVERWRITE_FORBIDDEN');
 const temporary=String(randomUUID()).replaceAll('-',''),parts=[],temporaryOutputs=[];
 let fallbackLanguage=false;
 try{
  for(const [index,scene]of input.timingScenes.entries()){
   // Split the standalone conjunction into actual separately spoken words,
   // without changing the authorized written copy.
   const split=scene.text.match(/^(.+?)\s+y\s+(.+)$/iu);
   const utterances=split?[split[1].trim(),'y',split[2].trim()]:[scene.text];
   const sceneBuffers=[];
   for(const [chunkIndex,utterance]of utterances.entries()){
    const output='.jarvis-artifacts/audio/timed-'+temporary+'-'+index+'-'+chunkIndex+'.wav';
    temporaryOutputs.push(output);
    const requestedLanguage=scene.speechLanguage||((fallbackLanguage?'es-ES':input.language)||'');
    let part;
    try{part=synthesizeSpeechArtifact({...input,text:utterance,output,timingScenes:undefined,language:requestedLanguage},options);}
    catch(error){
     if(requestedLanguage==='es-MX'&&/SPEECH_LANGUAGE_VOICE_NOT_FOUND/.test(String(error?.stderr||error?.message||error))){
      fallbackLanguage=true;
      part=synthesizeSpeechArtifact({...input,text:utterance,output,timingScenes:undefined,language:'es-ES'},options);
     }else throw error;
    }
    sceneBuffers.push(fs.readFileSync(path.resolve(root,part.output)));
   }
   parts.push(sceneBuffers);
  }
  const bytes=composeTimedSpeechWav(parts,input.timingScenes);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,bytes,{flag:'wx'});
  const wav=inspectWavBuffer(bytes);
  return {ok:true,executionOk:true,objectiveSatisfied:true,status:'SPEECH_AUDIO_CREATED_VERIFIED',
   output:relative,sha256:createHash('sha256').update(bytes).digest('hex'),
   mimeType:'audio/wav',bytes:bytes.length,durationSeconds:total,
   provider:options.platform==='win32'||process.platform==='win32'?'windows-system-speech':'injected-test-synthesizer',
   language:fallbackLanguage?'es-ES':String(input.language||''),
   ...(fallbackLanguage?{speechRecovery:{recovered:true,requestedLanguage:String(input.language||''),fallbackLanguage:'es-ES'}}:{}),
   sampleRate:wav.sampleRate,channels:wav.channels,bitsPerSample:wav.bitsPerSample,
   timingScenes:input.timingScenes.map(s=>({text:s.text,durationSeconds:s.durationSeconds,...(s.speechLanguage?{speechLanguage:s.speechLanguage}:{})})),
   sceneTimed:true};
 }finally{
  for(const output of temporaryOutputs){
   const f=path.resolve(root,output);
   try{fs.rmSync(f,{force:true});}catch{}
  }
 }
}
