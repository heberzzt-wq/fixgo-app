import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {reviewQwenArtifact} from '../jarvis-qwen-visual-review.js';
import {generalMissionPreflight} from '../modules/terminal/qwen-general-pilot.js';
const digest=b=>createHash('sha256').update(b).digest('hex');
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(40)]);
const mp4=Buffer.concat([Buffer.from('0000002066747970','hex'),Buffer.alloc(40)]);
const output='.jarvis-artifacts/qwen-general/general-12345678/advertisement.mp4';
test('real review call attaches only source-bound raw transcript; model does not certify its own narration',async()=>{
 let asrCalled=0;
 const result=await reviewQwenArtifact({output,root:'C:\\source\\repo',
  readArtifact:async()=>({mimeType:'video/mp4',dataBase64:mp4.toString('base64'),sha256:digest(mp4)}),
  findArtifact:async()=>({file:output,sha256:digest(mp4)}),
  inspectVideo:async()=>({durationSeconds:30,video:{width:1080,height:1920},audio:{codec:'aac'}}),
  validateVideo:async()=>({ok:true,checks:{audio:true}}),
  runProcess:async(_bin,args)=>{
   const target=args.at(-1);
   if(target.endsWith('.png'))await writeFile(target,png);
   else{const pcm=Buffer.alloc(30*16000*2);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(1300,i);await writeFile(target,pcm);}
  },
  transcribeAudio:async({pcm,sourceSha256})=>{
   asrCalled++;
   assert.equal(sourceSha256,digest(pcm));
   return {completed:true,provider:'faster-whisper',sourceSha256,segments:[{text:'Hola',startSeconds:.3,durationSeconds:.4}]};
  },
  env:{},fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({visibleHeading:'',readableText:true,
   overlappingContent:false,clippedContent:false,blankOrErrorPage:false,issues:[]})}})})});
 assert.equal(asrCalled,1);
 assert.equal(result.audioEvidence.transcription.sourceSha256,result.audioEvidence.sha256);
 assert.equal(result.audioEvidence.transcriptionVerified,false);
 assert.equal(result.audioEvidence.synchronizationVerified,false);
 assert.equal(result.audioEvidence.asrStatus,'TRANSCRIPT_CAPTURED_TIMELINE_NOT_YET_VERIFIED');
});
test('bad ASR reply fails closed without pretending to have a transcript',async()=>{
 const healthless=generalMissionPreflight([],[],{advertising:true,reel:true},null);
 assert.deepEqual(healthless.missingCapabilities,['transcriptionVerified','synchronizationVerified']);
 const ready=generalMissionPreflight([],[],{advertising:true,reel:true},
   {transcriptionAvailable:true,synchronizationVerifierAvailable:true});
 assert.equal(ready.missingCapabilities.length,0);
 assert.equal(ready.ok,false,'material preflight still blocks creation despite ASR being available');
});

test('registered reel studio controls scene-bounded transcription and rejects tampered HTML SHA',async()=>{
 const {registeredReelSceneTiming}=await import('../jarvis-qwen-visual-review.js');
 const studio='.jarvis-artifacts/qwen-general/general-12345678/advertisement-studio.html';
 const json={durationSeconds:30,scenes:[{durationSeconds:10},{durationSeconds:10},{durationSeconds:10}]};
 const html=Buffer.from('<script type="application/json" id="reelData">'+JSON.stringify(json)+'</script>');
 const sha=digest(html),record={file:studio,sha256:sha};
 const fetch=async path=>({output:path,mimeType:'text/html',dataBase64:html.toString('base64'),sha256:sha});
 const verify=await registeredReelSceneTiming({videoArtifact:{originalFile:studio},findArtifact:async()=>record,readArtifact:fetch});
 assert.equal(verify.durationSeconds,30);assert.deepEqual(verify.scenes,json.scenes);
 assert.equal(verify.studioSha256,sha);
 await assert.rejects(()=>registeredReelSceneTiming({videoArtifact:{originalFile:studio},findArtifact:async()=>({...record,sha256:'a'.repeat(64)}),readArtifact:fetch}),/LOCAL_REEL_STUDIO_EVIDENCE_INVALID/);
 await assert.rejects(()=>registeredReelSceneTiming({videoArtifact:{originalFile:studio.replace('studio.html','../other.html')},findArtifact:async()=>record,readArtifact:fetch}),/LOCAL_REEL_STUDIO_SCOPE_INVALID/);
});
