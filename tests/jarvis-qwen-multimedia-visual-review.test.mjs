import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile,access} from 'node:fs/promises';
import {reviewQwenArtifact} from '../jarvis-qwen-visual-review.js';
const digest=b=>createHash('sha256').update(b).digest('hex');
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(40)]);
const mp4=Buffer.concat([Buffer.from('0000002066747970','hex'),Buffer.alloc(40)]);
const output='.jarvis-artifacts/qwen-general/general-12345678/reel.mp4';
const good={visibleHeading:'Proyecto de prueba',readableText:true,overlappingContent:false,clippedContent:false,blankOrErrorPage:false,issues:[]};
function fixture({silent=false,badFrame=false,invalidMaster=false}={}){
 const calls=[],files=[];
 const deps={output,findArtifact:async()=>({output}),readArtifact:async()=>({mimeType:'video/mp4',dataBase64:mp4.toString('base64'),sha256:digest(mp4)}),
 inspectVideo:async file=>{files.push(file);return {durationSeconds:30,video:{width:1080,height:1920,codec:'h264'},audio:{codec:'aac'}};},
 validateVideo:async(inspection,options)=>{assert.equal(options.audioRequired,true);return {ok:!invalidMaster,checks:{audio:true},failedChecks:invalidMaster?['audio']:[]};},
 runProcess:async(bin,args)=>{assert.equal(bin,'ffmpeg');assert(args.includes('-n'));const target=args.at(-1);files.push(target);if(target.endsWith('.png'))await writeFile(target,png);else{const audio=Buffer.alloc(960000);if(!silent)for(let i=0;i<audio.length;i+=2)audio.writeInt16LE(i%4?2000:-2000,i);await writeFile(target,audio);}return {};},
 env:{},fetchImpl:async(url,args)=>{assert.equal(url,'http://127.0.0.1:11434/api/chat');const body=JSON.parse(args.body);assert.equal(body.model,'qwen3.5:9b');calls.push(body);return {ok:true,json:async()=>({message:{content:JSON.stringify(badFrame?{...good,clippedContent:true}:good)},prompt_eval_count:10,eval_count:5})};}};
 return {deps,calls,files};
}
test('registered adapted image uses existing local vision contract',async()=>{
 const {deps,calls}=fixture();
 const result=await reviewQwenArtifact({...deps,output:'.jarvis-artifacts/images/general-12345678-banner-social.png',readArtifact:async()=>({mimeType:'image/png',dataBase64:png.toString('base64'),sha256:digest(png)})});
 assert.equal(result.visualPassed,true);assert.equal(calls.length,1);
});
test('registered mission-imported original can be observed even without readable text',async()=>{
 const {deps}=fixture();const result=await reviewQwenArtifact({...deps,output:'.jarvis-artifacts/material-library/'+ 'a'.repeat(64)+'.png',readArtifact:async()=>({mimeType:'image/png',dataBase64:png.toString('base64'),sha256:digest(png)}),fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({...good,visibleHeading:'',readableText:false})}})})});
 assert.equal(result.ok,true);assert.equal(result.visualPassed,false);assert.equal(result.review.visibleHeading,'');
});
test('video binds three sampled reviews and audible PCM to source hash; temporary files removed',async()=>{
 const {deps,calls,files}=fixture();const result=await reviewQwenArtifact(deps);
 assert.equal(result.ok,true);assert.equal(result.sourceSha256,digest(mp4));assert.deepEqual(result.frames.map(f=>f.timestampSeconds),[3,15,27]);assert.equal(result.inferenceCount,3);assert.equal(calls.length,3);assert.equal(result.usage.promptTokens,30);assert.equal(result.audioEvidence.nonSilent,true);assert.equal(result.audioEvidence.transcriptionVerified,false);
 for(const file of files)await assert.rejects(access(file));
});
test('silent audio and visible clipping fail even when provider HTTP succeeds',async()=>{
 for(const options of [{silent:true},{badFrame:true}]){const {deps}=fixture(options);const result=await reviewQwenArtifact(deps);assert.equal(result.ok,false);assert.equal(result.status,'LOCAL_VIDEO_REVIEW_FAILED');}
});
test('invalid physical master cannot reach inference and still cleans temporary bytes',async()=>{
 const {deps,calls,files}=fixture({invalidMaster:true});await assert.rejects(reviewQwenArtifact(deps),/MASTER_INVALID/);assert.equal(calls.length,0);for(const file of files)await assert.rejects(access(file));
});
test('hash mismatch and broad library path cannot reach multimedia inference',async()=>{
 const {deps,calls}=fixture();await assert.rejects(reviewQwenArtifact({...deps,readArtifact:async()=>({mimeType:'video/mp4',dataBase64:mp4.toString('base64'),sha256:'bad'})}),/BYTES_INVALID/);
 await assert.rejects(reviewQwenArtifact({...deps,output:'.jarvis-artifacts/images/another-project.png'}),/SCOPE_INVALID/);assert.equal(calls.length,0);
});
