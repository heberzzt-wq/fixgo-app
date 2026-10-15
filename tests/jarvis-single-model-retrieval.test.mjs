import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSelfHostedSemanticEngine} from '../jarvis-fs-bridge.js';
import {ensureJarvisLocalAiRuntime} from '../jarvis-upload-bridge.js';
import fs from 'node:fs';
import {runInNewContext} from 'node:vm';

const candidates=[{id:'a',text:'Observed source: collection alpha'},{id:'b',text:'Observed source: collection beta'}];
test('native tool history preserves calls and tool results within the same context budget',()=>{
 const source=fs.readFileSync(new URL('../jarvis-fs-bridge.js',import.meta.url),'utf8');
 const start=source.indexOf('    function normalizeLocalChatMessages('),end=source.indexOf('    async function generateContent(',start);
 const normalize=runInNewContext('(()=>{'+source.slice(start,end)+';return normalizeLocalChatMessages})()');
 const messages=[{role:'system',content:'Read only'},{role:'user',content:'Inspect'},
  {role:'assistant',content:'',tool_calls:[{function:{name:'read_source',arguments:{file:'observed.js'}}}]},
  {role:'tool',tool_name:'read_source',content:'Observed source only; no records verified.'}];
 assert.deepEqual(JSON.parse(JSON.stringify(normalize(messages))),messages);
 assert.throws(()=>normalize([{role:'assistant',tool_calls:[{function:{name:'read',arguments:{data:'x'.repeat(60001)}}}]}]),/LOCAL_SEMANTIC_MESSAGE_TOO_LARGE/);
});
test('retrieval ranks observed candidates with the sole local brain and caches only identical scoped input',async()=>{
 const requests=[];
 const engine=createSelfHostedSemanticEngine({fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body); requests.push({url,body});
  assert.match(url,/\/api\/chat$/);assert.equal(body.model,'qwen3.5:9b');assert.equal(body.think,false);
  assert.deepEqual(body.format.properties.ids.items.enum,['a','b']);
  return {ok:true,text:async()=>JSON.stringify({message:{content:JSON.stringify({ids:['b','a']})}})};
 }});
 for(const scope of ['organization-one','organization-one','organization-two']){
  const result=await engine.rankCandidates({query:'Find the relevant source',candidates,scope,limit:2});
  assert.deepEqual(result.selected.map(x=>x.id),['b','a']);assert.equal(result.evidence.model,'qwen3.5:9b');
  assert.equal(result.evidence.retrievalOnly,true);
 }
 assert.equal(requests.length,2,'scope changes must invalidate cached relevance');
 assert.equal(engine.describe().embeddingModel,null);
 assert.equal(engine.describe().counters.localEmbeddingCalls,0);
});
test('a model cannot invent candidates or execute embeddings',async()=>{
 let calls=0;
 const engine=createSelfHostedSemanticEngine({fetchImpl:async()=>{calls++;return {ok:true,text:async()=>JSON.stringify({message:{content:'{"ids":["invented"]}'}})}}});
 await assert.rejects(engine.rankCandidates({query:'source',candidates}),/LOCAL_CANDIDATE_SELECTION_INVALID/);
 await assert.rejects(engine.embed(['source']),/LOCAL_EMBEDDINGS_DISABLED_SINGLE_MODEL/);
 assert.equal(calls,1);
});
test('a stale model override is rejected before inference or automatic installation',async()=>{
 let calls=0;const env={JARVIS_LOCAL_LLM_MODEL:'qwen3:4b-instruct-2507-q4_K_M'};
 const engine=createSelfHostedSemanticEngine({env,fetchImpl:async()=>{calls++;throw Error('must not call');}});
 assert.equal(engine.describe().ok,false);
 await assert.rejects(engine.respond({input:'hello'}),/JARVIS_LOCAL_MODEL_CONTRACT_MISMATCH/);
 const result=await ensureJarvisLocalAiRuntime({env,commandImpl:()=>{calls++;throw Error('must not install');}});
 assert.equal(result.status,'JARVIS_LOCAL_MODEL_CONTRACT_MISMATCH');assert.equal(calls,0);
});
