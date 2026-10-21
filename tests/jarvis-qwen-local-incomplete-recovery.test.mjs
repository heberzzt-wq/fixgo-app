import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalQwenActionSelector} from '../jarvis-qwen-local-action.js';
const tools=[{name:'image.adapt',inputSchema:{type:'object',properties:{outputPrefix:{type:'string'}},
 required:['outputPrefix'],additionalProperties:false}}];
const broken={done_reason:'length',prompt_eval_count:100,eval_count:2400,message:{content:'{"action":"CALL"'}};
const complete={done_reason:'stop',prompt_eval_count:115,eval_count:220,message:{content:JSON.stringify({
 action:'CALL',name:'image.adapt',args:{outputPrefix:'safe-proof'},report:''})}};
test('one retry after truncated local Qwen JSON can return a valid decision without tool execution',async()=>{
 let calls=0,usage=null;
 const selector=createLocalQwenActionSelector({maxOutputTokens:2400,retryIncompleteOnce:true,
  onInference:u=>{usage=u;},
  fetchImpl:async(_url,options)=>{
   calls++;const req=JSON.parse(options.body);
   if(calls===1)assert.equal(req.options.num_predict,2400);
   else{
    assert.equal(req.options.num_predict,3072);
    assert.equal(req.messages.at(-1).role,'user');
    assert.match(req.messages.at(-1).content,/respuesta anterior se truncó/);
   }
   return {ok:true,json:async()=>calls===1?broken:complete};
  }});
 const result=await selector({instruction:'Make a local draft',tools});
 assert.deepEqual(result.toolCall,{name:'image.adapt',args:{outputPrefix:'safe-proof'}});
 assert.equal(calls,2);assert.equal(usage.incompleteRetries,1);
 assert.equal(usage.promptTokens,215);assert.equal(usage.outputTokens,2620);
});
test('both truncated responses fail closed; never invent a completed tool result',async()=>{
 let calls=0;
 const selector=createLocalQwenActionSelector({retryIncompleteOnce:true,
  fetchImpl:async()=>{calls++;return {ok:true,json:async()=>broken};}});
 await assert.rejects(selector({instruction:'Make a local draft',tools}),/LOCAL_QWEN_ACTION_INCOMPLETE/);
 assert.equal(calls,2);
});
test('non-media selector never retries a truncated response by default',async()=>{
 let calls=0;
 const selector=createLocalQwenActionSelector({fetchImpl:async()=>{calls++;return {ok:true,json:async()=>broken};}});
 await assert.rejects(selector({instruction:'Read a record',tools}),/LOCAL_QWEN_ACTION_INCOMPLETE/);
 assert.equal(calls,1);
});
