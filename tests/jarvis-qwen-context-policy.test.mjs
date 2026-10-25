import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLocalQwenContextTokens} from '../jarvis-qwen-context-policy.js';
import {createLocalQwenActionSelector} from '../jarvis-qwen-local-action.js';
import {createSelfHostedSemanticEngine} from '../jarvis-fs-bridge.js';

test('single-model context profile defaults unchanged and rejects unsupported values',()=>{
    assert.equal(resolveLocalQwenContextTokens(),16384);
    for(const size of [4096,8192,16384])assert.equal(resolveLocalQwenContextTokens(String(size)),size);
    for(const size of [0,1000,32768,'oops'])assert.throws(()=>resolveLocalQwenContextTokens(size),/CONTEXT_UNSUPPORTED/);
});
test('explicit low-memory Qwen decision preserves the prompt and disables silent shifting',async()=>{
    let payload;
    const select=createLocalQwenActionSelector({contextTokens:4096,fetchImpl:async(_url,options)=>{
        payload=JSON.parse(options.body);
        return {ok:true,json:async()=>({message:{content:JSON.stringify({action:'CALL',name:'repo.read',args:{file:'runtime.js'},report:''})},done_reason:'stop'})};
    }});
    await select({instruction:'Read real source',tools:[{name:'repo.read',inputSchema:{type:'object',properties:{file:{type:'string',enum:['runtime.js']}},required:['file']}}]});
    assert.equal(payload.options.num_ctx,4096);
    assert.equal(payload.truncate,false);
    assert.equal(payload.shift,false);
    assert.ok(payload.messages.some(m=>m.content==='Read real source'));
});
test('semantic engine uses the same opt-in low-memory context without changing its default',async()=>{
    let payload;
    const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'4096'},fetchImpl:async(_url,options)=>{
        payload=JSON.parse(options.body);
        return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:'La evidencia está disponible.'},done_reason:'stop'})};
    }});
    const answer=await engine.respond({input:'Responde sin inventar evidencia',maxOutputTokens:256});
    assert.equal(answer.ok,true);
    assert.equal(payload.options.num_ctx,4096);
    assert.equal(payload.truncate,false);
    assert.equal(payload.shift,false);
    assert.equal(payload.messages.at(-1).content,'Responde sin inventar evidencia');
});

test('oversized low-memory selector refuses incomplete context before starting Ollama',async()=>{
    let fetchCalls=0;
    const select=createLocalQwenActionSelector({contextTokens:4096,fetchImpl:async()=>{fetchCalls++;throw Error('SHOULD_NOT_FETCH');}});
    await assert.rejects(()=>select({instruction:'x'.repeat(45000),tools:[{name:'repo.grep',inputSchema:{type:'object',properties:{term:{type:'string'}},required:['term']}}]}),
        /LOCAL_QWEN_CONTEXT_NEEDS_SEGMENTATION/);
    assert.equal(fetchCalls,0);
});
test('oversized low-memory semantic reply preserves the complete request by failing closed',async()=>{
    let fetchCalls=0;
    const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'4096'},
        fetchImpl:async()=>{fetchCalls++;throw Error('SHOULD_NOT_FETCH');}});
    await assert.rejects(()=>engine.respond({input:'Q'.repeat(45000),maxOutputTokens:256}),
        /LOCAL_QWEN_CONTEXT_NEEDS_SEGMENTATION/);
    assert.equal(fetchCalls,0);
});
test('normal low-memory selector retains the original instruction and token profile',async()=>{
    let payload,fetchCalls=0;
    const select=createLocalQwenActionSelector({contextTokens:4096,fetchImpl:async(_url,req)=>{
        fetchCalls++;payload=JSON.parse(req.body);
        return {ok:true,json:async()=>({done_reason:'stop',message:{content:JSON.stringify({action:'CALL',name:'repo.grep',args:{term:'runJarvisMission'},report:''})}})};
    }});
    const result=await select({instruction:'Busca runJarvisMission en codigo real',tools:[{name:'repo.grep',
        inputSchema:{type:'object',properties:{term:{type:'string',const:'runJarvisMission'}},required:['term']}}]});
    assert.equal(fetchCalls,1);
    assert.equal(payload.options.num_ctx,4096);
    assert.equal(payload.truncate,false);
    assert.equal(payload.shift,false);
    assert.ok(payload.messages.some(m=>m.content==='Busca runJarvisMission en codigo real'));
    assert.equal(result.toolCall.args.term,'runJarvisMission');
});

test('CPU-friendly workstation profile keeps Qwen local with finite idle retention and no forced prewarm',async()=>{
 const fs=await import('node:fs');
 const entry=fs.readFileSync(new URL('../scripts/jarvis-workstation-start.cjs',import.meta.url),'utf8');
 assert.match(entry,/JARVIS_LOCAL_LLM_CONTEXT_TOKENS \|\|= '8192'/);
 assert.match(entry,/JARVIS_LOCAL_LLM_KEEP_ALIVE \|\|= '45s'/);
 assert.match(entry,/JARVIS_LOCAL_LLM_PREWARM \|\|= '0'/);
 assert.match(entry,/JARVIS_LOCAL_LLM_MAX_INFERENCE_MS \|\|= '150000'/);
 assert.match(entry,/coldStart\s*\?\s*\{ok:true,status:'JARVIS_LOCAL_MODEL_ON_DEMAND'/);
});
test('bounded low-memory Qwen requests retain original instructions and idle unload policy',async()=>{
 let body;
 const engine=createSelfHostedSemanticEngine({
  env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',
   JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'8192',
   JARVIS_LOCAL_LLM_KEEP_ALIVE:'45s',JARVIS_LOCAL_LLM_PREWARM:'0',
   JARVIS_LOCAL_LLM_MAX_INFERENCE_MS:'150000'},
  fetchImpl:async(_url,options)=>{
   body=JSON.parse(options.body);
   return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:'Respuesta local'},done_reason:'stop'})};
  }
 });
 await engine.respond({input:'Mi instruccion permanece intacta',maxOutputTokens:192});
 assert.equal(body.options.num_ctx,8192);
 assert.equal(body.keep_alive,'45s');
 assert.equal(body.think,false);
 assert.equal(body.messages.at(-1).content,'Mi instruccion permanece intacta');
 assert.equal(body.truncate,false);
 assert.equal(body.shift,false);
});
test('CPU inference watchdog aborts stalled Ollama without upgrading partial evidence to success',async()=>{
 let calls=0;
 const engine=createSelfHostedSemanticEngine({
  env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',
   JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'8192',
   JARVIS_LOCAL_LLM_MAX_INFERENCE_MS:'65',
   JARVIS_LOCAL_LLM_PREWARM:'0'},
  fetchImpl:async(_url,options)=>{
   calls++;
   await new Promise((_resolve,reject)=>{
    if(options.signal.aborted){reject(options.signal.reason);return;}
    options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
   });
  }
 });
 await assert.rejects(engine.respond({input:'Solo se permite una llamada acotada'}),
  /LOCAL_SEMANTIC_TIMEOUT/);
 assert.equal(calls,1);
});
