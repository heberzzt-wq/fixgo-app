import test from 'node:test';
import assert from 'node:assert/strict';
import {formatLocalMediaOwnerReport} from '../jarvis-local-media-owner-report.js';
const sha='a'.repeat(64);
const example={ok:true,status:'LOCAL_MEDIA_BATCH_INTERPRETATIONS_PARTIAL',model:'qwen3.5:9b',
 sourceIdentityVerified:true,sources:[{sourceIndex:1,kind:'image',sourceName:'captura.jpg',
 sha256:sha,sourceIdentityVerified:true,observation:'Se observa una pantalla y un botón.'},
 {sourceIndex:2,kind:'video',sourceName:'clip.mp4',sha256:'b'.repeat(64),
 sourceIdentityVerified:true,audioTrackPresent:true,frames:[{timestampSeconds:0,
 observation:'En este fotograma aparece una pantalla.'},{timestampSeconds:1.2,
 observation:'En este otro fotograma aparece un objeto.'}]}]};
test('owner report explains each file with Qwen observations, timestamps and unverified audio',()=>{
 const report=formatLocalMediaOwnerReport(example);
 assert.equal(report.status,'LOCAL_MEDIA_OWNER_REPORT_PARTIAL');
 assert.equal(report.localOnly,true);
 assert.equal(report.objectiveSatisfied,false);
 assert.equal(report.independentlyVerified,false);
 assert.equal(report.modelObservationsOnly,true);
 assert.match(report.text,/Pariente, revisé los archivos con Qwen local/);
 assert.match(report.text,/Archivo 1: captura.jpg/);
 assert.match(report.text,/En la fotografía, Qwen describe/);
 assert.match(report.text,/Archivo 2: clip.mp4/);
 assert.match(report.text,/Fotograma a 1\.20 segundos/);
 assert.match(report.text,/no fue transcrito ni analizado/);
 assert.match(report.text,/ni se completó la misión del chat móvil/);
 assert.deepEqual(report.verifiedSourceHashes,[sha,'b'.repeat(64)]);
});
test('reports refuse forged sources and invalid observations rather than claiming success',()=>{
 for(const bad of [
  {ok:false}, {ok:true,status:'SUCCESS',sourceIdentityVerified:true,sources:[]},
  {...example,sources:[{...example.sources[0],sha256:'unknown'}]},
  {...example,sources:[{...example.sources[0],observation:''}]},
  {...example,sources:[{...example.sources[1],frames:Array(5).fill(example.sources[1].frames[0])}]},
  {...example,sources:[{...example.sources[1],frames:[]}]}
 ])assert.throws(()=>formatLocalMediaOwnerReport(bad),/LOCAL_MEDIA_REPORT_/);
});
test('report always remains bounded and cannot return complete verified media claims',()=>{
 const giant={...example,sources:example.sources.map(x=>x.kind==='image'?
   {...x,observation:'X'.repeat(50000)}:
   {...x,frames:x.frames.map(frame=>({...frame,observation:'Y'.repeat(50000)}))})};
 const result=formatLocalMediaOwnerReport(giant);
 assert.ok(result.text.length<=7400);
 assert.equal(result.externalApiUsed,false);
 assert.equal(result.objectiveSatisfied,false);
});
