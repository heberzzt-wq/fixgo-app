import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window=globalThis;
globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
const {JarvisToolRuntime}=await import('../gestia-core/tools.runtime.js');
async function search({semantic,grep,index={}}){
 const calls=[];
 globalThis.__REPO_INDEX__=index;
 globalThis.JarvisLocalBridge={
  requestJson:async route=>{calls.push(route);if(semantic instanceof Error)throw semantic;return semantic;},
  grepRepo:async()=>{calls.push('/grep');if(grep instanceof Error)throw grep;return grep;}
 };
 const execution=await JarvisToolRuntime.execute('repo.search',{query:'local engine architecture',limit:8},{source:'failure_regression'});
 return {result:execution?.data||execution,calls};
}
test('identity rejection stops search without falling back or crediting cached hints',async()=>{
 const {result,calls}=await search({semantic:{ok:false,status:'BRIDGE_IDENTITY_INVALID',error:'BRIDGE_IDENTITY_INVALID',httpStatus:503},grep:{ok:true,matches:[{file:'fake.js'}]},index:{'engine.js':{path:'engine.js'}}});
 assert.equal(result.ok,false);assert.equal(result.status,'BRIDGE_IDENTITY_INVALID');assert.equal(result.error,'BRIDGE_IDENTITY_INVALID');
 assert.deepEqual(calls,['/repo/candidates']);
});
test('failed semantic and lexical retrieval never become a completed empty search',async()=>{
 const {result}=await search({semantic:{ok:false,status:'LOCAL_MODEL_UNAVAILABLE',error:'MODEL_OFFLINE'},grep:{ok:false,status:'GREP_FAILED',error:'DISK_UNAVAILABLE'},index:{'engine.js':{path:'engine.js'}}});
 assert.equal(result.ok,false);assert.equal(result.success,false);assert.notEqual(result.status,'COMPLETED');
 assert.equal(result.error,'DISK_UNAVAILABLE');
});
test('thrown transport errors remain failed observations',async()=>{
 const {result}=await search({semantic:new Error('SEMANTIC_OFFLINE'),grep:new Error('GREP_OFFLINE')});
 assert.equal(result.ok,false);assert.equal(result.error,'GREP_OFFLINE');
});
test('successful lexical fallback can report a genuinely empty search',async()=>{
 const {result}=await search({semantic:{ok:false,error:'MODEL_OFFLINE'},grep:{ok:true,matches:[],totalMatches:0,totalFilesScanned:3}});
 assert.equal(result.ok,true);assert.equal(result.totalMatches,0);assert.equal(result.totalFilesScanned,3);assert.equal(result.bridgeStatus,'CONNECTED');
 assert.notEqual(result.status,'REPO_SEMANTIC_SEARCH_READY');
});
test('successful semantic retrieval retains its real evidence',async()=>{
 const evidence={provider:'ollama-local',model:'qwen3.5:9b'};
 const {result,calls}=await search({semantic:{ok:true,candidates:[{file:'engine.js'}],semanticEvidence:evidence},grep:new Error('UNEXPECTED')});
 assert.equal(result.ok,true);assert.equal(result.status,'REPO_SEMANTIC_SEARCH_READY');assert.deepEqual(result.semanticEvidence,evidence);
 assert.deepEqual(calls,['/repo/candidates']);
});

test('authorization denials cannot be bypassed through lexical fallback',async()=>{
 for(const httpStatus of [401,403]){
  const {result,calls}=await search({semantic:{ok:false,httpStatus,status:'ACCESS_DENIED',error:'ACCESS_DENIED'},grep:{ok:true,matches:[]}});
  assert.equal(result.ok,false);assert.equal(result.httpStatus,httpStatus);assert.deepEqual(calls,['/repo/candidates']);
 }
});
test('identity rejection in lexical fallback stays failed even with index matches',async()=>{
 const {result}=await search({semantic:{ok:false,error:'MODEL_OFFLINE'},grep:{ok:false,status:'BRIDGE_IDENTITY_INVALID',error:'BRIDGE_IDENTITY_INVALID'},index:{'engine.js':{path:'engine.js'}}});
 assert.equal(result.ok,false);assert.equal(result.status,'BRIDGE_IDENTITY_INVALID');
});
