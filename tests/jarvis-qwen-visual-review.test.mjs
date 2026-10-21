import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {reviewQwenArtifact} from '../jarvis-qwen-visual-review.js';
const output='.jarvis-artifacts/qwen-general/general-12345678/capture.png';
const bytes=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(40)]);
const image={mimeType:'image/png',dataBase64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')};
test('visual review sends registered image bytes only to the one local Qwen and binds hash/usage',async()=>{
 let calls=0;
 const result=await reviewQwenArtifact({output,findArtifact:async()=>({output}),readArtifact:async()=>image,fetchImpl:async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:11434/api/chat');const body=JSON.parse(options.body);assert.equal(body.model,'qwen3.5:9b');assert.deepEqual(body.messages[1].images,[image.dataBase64]);return {ok:true,json:async()=>({message:{content:JSON.stringify({visibleHeading:'Demo',readableText:true,overlappingContent:false,clippedContent:false,blankOrErrorPage:false,issues:[]})},prompt_eval_count:42,eval_count:18})};}});
 assert.equal(calls,1);assert.equal(result.imageSha256,image.sha256);assert.equal(result.usage.promptTokens,42);
});
test('unregistered, cross-directory and corrupted images never reach inference',async()=>{
 let calls=0;const deps={findArtifact:async()=>null,readArtifact:async()=>image,fetchImpl:async()=>{calls++;}};
 await assert.rejects(reviewQwenArtifact({output,...deps}),/UNREGISTERED/);
 await assert.rejects(reviewQwenArtifact({output:'../secret.png',...deps}),/SCOPE_INVALID/);
 await assert.rejects(reviewQwenArtifact({output,...deps,findArtifact:async()=>({}),readArtifact:async()=>({...image,sha256:'bad'})}),/BYTES_INVALID/);
 assert.equal(calls,0);
});
