import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {composeTimedSpeechWav,synthesizeSceneTimedSpeechArtifact} from '../jarvis-speech-timeline.js';
import {inspectWavBuffer} from '../jarvis-speech-artifact.js';
import {generalObjectives} from '../modules/terminal/qwen-general-evidence.js';
import {generalToolCatalog} from '../modules/terminal/qwen-general-pilot.js';

function pcm(seconds=.5){
 const rate=22050,len=Math.round(seconds*rate)*2,buf=Buffer.alloc(44+len);
 buf.write('RIFF',0);buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);
 buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);
 buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);
 buf.write('data',36);buf.writeUInt32LE(len,40);
 for(let i=44;i<buf.length;i+=2)buf.writeInt16LE(i%5===0?6500:7000,i);
 return buf;
}
const scenes=['Summit.','Asesoría fiscal y legal.','Conoce el servicio.'].map(text=>({text,durationSeconds:10}));
test('local WAV compositor puts actual narration in scenes at 0,10,20 seconds',()=>{
 const bytes=composeTimedSpeechWav(scenes.map(()=>pcm()),scenes),wav=inspectWavBuffer(bytes);
 assert.equal(wav.durationSeconds,30);assert.equal(wav.channels,1);
 for(const t of [.7,10.7,20.7])assert.notEqual(bytes.readInt16LE(44+Math.round(t*22050)*2),0);
 for(const t of [5,15,25])assert.equal(bytes.readInt16LE(44+Math.round(t*22050)*2),0);
});
test('local speech synthesis is physically verified and never overwrites existing delivery',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-timed-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const text=scenes.map(x=>x.text).join(' ');
 const output='.jarvis-artifacts/audio/general-12345678-timed-narration.wav';
 const options={platform:'linux',synthesizeImpl:({target})=>fs.writeFileSync(target,pcm())};
 const a=synthesizeSceneTimedSpeechArtifact({root,text,output,language:'es-MX',timingScenes:scenes},options);
 assert.equal(a.durationSeconds,30);assert.equal(a.output,output);
 assert.equal(a.sha256.length,64);assert.equal(a.sceneTimed,true);
 assert.throws(()=>synthesizeSceneTimedSpeechArtifact({root,text,output,timingScenes:scenes},options),/EXISTING_ARTIFACT_OVERWRITE_FORBIDDEN/);
 assert.throws(()=>synthesizeSceneTimedSpeechArtifact({root,text:text+' invención',output:output.replace('timed','other'),timingScenes:scenes},options),/TIMED_SPEECH_SCRIPT_MISMATCH/);
});
test('Summit exact three quoted fragments bind TTS script and pacing on one 30 second timeline',()=>{
 const instruction='Produce, sin publicar, un MP4 vertical real de 30 segundos, 1080×1920, H.264/AAC, logo oficial. ÚNICO texto comercial permitido: "Summit. Asesoría fiscal y legal. Conoce el servicio en www.summ.com.mx". Crea una narración inteligible que distribuya tres fragmentos por escena: "Summit.", "Asesoría fiscal y legal.", "Conoce el servicio.";';
 const obj=generalObjectives(instruction),policy={accept:()=>true,audioPrefix:'.jarvis-artifacts/audio/general-test-',imagePrefix:'general-test-',artifactRoot:'.jarvis-artifacts/qwen-general/general-test/'};
 const base={name:'speech.synthesize',inputSchema:{type:'object',properties:{text:{type:'string'},output:{type:'string'},language:{type:'string'},rate:{type:'number'},volume:{type:'number'}},required:[]}};
 const speech=generalToolCatalog({list:()=>[base]},policy,obj,instruction)[0];
 assert.equal(speech.inputSchema.properties.text.const,'Summit. Asesoría fiscal y legal. Conoce el servicio.');
 assert.deepEqual(speech.inputSchema.properties.timingScenes.const,[{...scenes[0],speechLanguage:'en-US'},...scenes.slice(1)]);
 assert.equal(speech.inputSchema.properties.output.const,'.jarvis-artifacts/audio/general-test-timed-narration.wav');
 assert.ok(speech.inputSchema.required.includes('timingScenes'));
});
