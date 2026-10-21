import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';

test('successfully executed tools emit matching started/completed events despite incomplete next model decision',async()=>{
 const events=[];let selection=0;
 const res=await runQwenAuthorizedCycle({
  instruction:'Research',catalog:[{name:'advertising.research',
   inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}}],
  maximumSteps:3,onProgress:x=>events.push(x),
  selectNextAction:async()=>{selection++;if(selection===2)throw Error('LOCAL_QWEN_ACTION_INCOMPLETE');
   return {toolCall:{name:'advertising.research',args:{query:'independent professional advertising guidance'}}};},
  authorize:async()=>({ok:true}),execute:async()=>({ok:true,status:'ADVERTISING_BENCHMARK_READY'}),
  verifyCompletion:async()=>({ok:false})
 });
 assert.equal(res.status,'PARTIAL');assert.equal(res.failureCode,'LOCAL_QWEN_ACTION_INCOMPLETE');
 assert.equal(res.receipts.length,1);assert.equal(res.receipts[0].ok,true);
 assert.deepEqual(events.filter(x=>x.phase?.startsWith('TOOL_')),[
  {phase:'TOOL_EXECUTION',iteration:0,name:'advertising.research',
   tool:'advertising.research',state:'active',executionId:'qwen-0'},
  {phase:'TOOL_RESULT',iteration:0,name:'advertising.research',
   tool:'advertising.research',state:'completed',executionId:'qwen-0'}
 ]);
});
test('failed tools get failed state; not all successful prior tools retroactively fail',async()=>{
 const events=[];let number=0;
 const res=await runQwenAuthorizedCycle({
  instruction:'Research',catalog:[{name:'advertising.research',
   inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}}],
  maximumSteps:3,onProgress:x=>events.push(x),
  selectNextAction:async()=>({toolCall:{name:'advertising.research',args:{query:'read'+(++number)}}}),
  authorize:async()=>({ok:true}),
  execute:async()=>number===1?{ok:true}:{ok:false,status:'ERROR',error:{code:'SOURCE_INVALID'}},
  verifyCompletion:async()=>({ok:false})
 });
 assert.equal(res.status,'PARTIAL');assert.equal(res.receipts[0].ok,true);
 assert.equal(res.receipts[1].ok,false);
 assert.deepEqual(events.filter(e=>e.phase==='TOOL_RESULT').map(e=>e.state),['completed','failed']);
});
test('terminal failure logic preserves completed tool rows and does not mark unresolved tools as failed',()=>{
 const html=fs.readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
 assert.match(html,/if \(id\.startsWith\("tool:"\)\) setRow\(id, row\.textContent\.trim\(\) \+ " · sin recibo de cierre", "unconfirmed"\)/);
 assert.match(html,/state === "unconfirmed"/);
});
