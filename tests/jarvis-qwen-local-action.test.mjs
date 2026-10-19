import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalQwenActionSelector} from '../jarvis-qwen-local-action.js';
import {runQwenDirectReadCycle} from '../jarvis-qwen-direct-cycle.js';

const tools=[{
    name:'repo.read',description:'Read source',
    investigationReadOnly:true,mutates:false,evidenceKinds:['repository_source'],
    requiresEvidence:[{kind:'fixture_prerequisite',argument:'file',observationPath:['file']}],
    inputSchema:{type:'object',properties:{file:{type:'string',
        enum:['panel-admin.js']}},required:['file'],additionalProperties:false}
}];
const map='CONFIGURACION_DE_FUENTES_VERIFICADA={"revision":"fixture","operationalEvidence":false}';

test('adapter only accepts local model and loopback endpoint',()=>{
    for(const endpoint of ['https://127.0.0.1:11434/api/chat',
        'http://evil.example/api/chat','http://127.0.0.1:11434/api/generate']){
        assert.throws(()=>createLocalQwenActionSelector({endpoint}),
            /LOOPBACK_ENDPOINT_REQUIRED/);
    }
    assert.throws(()=>createLocalQwenActionSelector({model:'gemini'}),
        /SINGLE_MODEL_REQUIRED/);
});

test('browser cannot instantiate the direct Ollama selector',()=>{
    globalThis.window={};
    try {assert.throws(()=>createLocalQwenActionSelector(),/SERVER_ONLY/);}
    finally {delete globalThis.window;}
});

test('Qwen local adapter receives repo map and compact receipts without asking another planner',async()=>{
    let calls=0;
    const seen=[];
    const selector=createLocalQwenActionSelector({
        fetchImpl:async (url,request)=>{
            const payload=JSON.parse(request.body);
            calls++;
            seen.push(payload);
            assert.equal(url,'http://127.0.0.1:11434/api/chat');
            assert.equal(payload.model,'qwen3.5:9b');
            assert.equal(payload.think,false);
            assert.equal(payload.stream,false);
            assert.equal(payload.options.num_ctx,16384);
            assert.equal(payload.format.properties.action.enum[0],'CALL');
            assert.ok(payload.messages.some(m=>m.content===map));
            const catalogMessage=payload.messages.find(m=>m.content.startsWith('HERRAMIENTAS_DE_SOLO_LECTURA='));
            const sentTools=JSON.parse(catalogMessage.content.split('HERRAMIENTAS_DE_SOLO_LECTURA=')[1]);
            assert.deepEqual(sentTools[0].requiresEvidence,tools[0].requiresEvidence);
            assert.deepEqual(sentTools[0].evidenceKinds,tools[0].evidenceKinds);
            assert.ok(!payload.messages.some(m=>m.content.includes('SECRET_RECORD')));
            const parsed=calls===1?
                {action:'CALL',name:'repo.read',args:{file:'panel-admin.js'},report:''}:
                {action:'FINISH',name:'',args:{},report:'Source is panel-admin.js'};
            return {ok:true,json:async()=>({message:{content:JSON.stringify(parsed)},
                done_reason:'stop',prompt_eval_count:250,eval_count:31})};
        }
    });
    const result=await runQwenDirectReadCycle({
        instruction:'Find technician B2C registration source',repositoryMap:map,catalog:tools,
        selectNextAction:selector,authorize:async()=>({ok:true}),
        execute:async()=>({ok:true,verifiedRead:{file:'panel-admin.js'},label:'source only'}),
        verifyCompletion:async({receipts})=>({ok:receipts.length===1 &&
            receipts[0].observation.verifiedRead.file==='panel-admin.js'})
    });
    assert.equal(result.status,'SUCCESS');
    assert.equal(calls,2);
    assert.equal(result.modelDecisions,2);
    assert.equal(seen[1].messages.at(-1).content.includes('panel-admin.js'),true);
});

test('adapter fails closed when Qwen invents tool or emits empty JSON',async()=>{
    for(const payload of [{action:'CALL',name:'platform.write',args:{},report:''},{}]){
        const selector=createLocalQwenActionSelector({
            fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify(payload)},done_reason:'stop'})})
        });
        await assert.rejects(()=>selector({
            instruction:'Read source',tools,repositoryMap:map,observations:[]
        }),/LOCAL_QWEN_/);
    }
});

test('premature finish from Qwen cannot bypass missing evidence',async()=>{
    const selector=createLocalQwenActionSelector({
        fetchImpl:async()=>({ok:true,json:async()=>({message:{
            content:JSON.stringify({action:'FINISH',name:'',args:{},report:'All done'})
        },done_reason:'stop'})})
    });
    await assert.rejects(()=>selector({
        instruction:'Read current data',tools,repositoryMap:map,observations:[]
    }),/PREMATURE_FINISH/);
});

test('local action adapter does not call a remote provider on HTTP error',async()=>{
    let count=0;
    const selector=createLocalQwenActionSelector({
        fetchImpl:async()=>{count++;return {ok:false,status:503};}
    });
    await assert.rejects(()=>selector({instruction:'Read source',tools}),/LOCAL_QWEN_HTTP_503/);
    assert.equal(count,1);
});

test('abort and JSON length result never produce successful actions',async()=>{
    const selector=createLocalQwenActionSelector({
        fetchImpl:async()=>({ok:true,json:async()=>({done_reason:'length',
            message:{content:'{"action":"CALL"}'}})})
    });
    await assert.rejects(()=>selector({instruction:'Read',tools}),/ACTION_INCOMPLETE/);
});
