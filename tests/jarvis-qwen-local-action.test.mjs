import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalQwenActionSelector} from '../jarvis-qwen-local-action.js';
import {runQwenDirectReadCycle} from '../jarvis-qwen-direct-cycle.js';

const tools=[{
    name:'repo.read',description:'Read source',
    investigationReadOnly:true,mutates:false,evidenceKinds:['repository_source'],
    requiresEvidence:[],
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
            assert.equal(payload.format.anyOf[0].properties.action.const,calls===1?'CALL':'FINISH');
            assert.equal(payload.messages.some(m=>m.content===map),calls===1,'static map is sent once; mission evidence persists');
            const catalogMessage=payload.messages.find(m=>m.content.startsWith('HERRAMIENTAS_DE_SOLO_LECTURA='));
            const sentTools=JSON.parse(catalogMessage.content.split('HERRAMIENTAS_DE_SOLO_LECTURA=')[1]);
            if(calls===1){assert.deepEqual(sentTools[0].requiresEvidence,tools[0].requiresEvidence);
                assert.deepEqual(sentTools[0].evidenceKinds,tools[0].evidenceKinds);}
            else assert.deepEqual(sentTools,[],'completed read is excluded without changing certification');
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

test('Qwen output grammar binds tool arguments and observed repository paths',async()=>{
    const selector=createLocalQwenActionSelector({fetchImpl:async(_url,request)=>{
        const payload=JSON.parse(request.body);
        const call=payload.format.anyOf.find(item=>item.properties.name.const==='repo.read');
        assert.deepEqual(call.properties.args.properties.file.enum,['panel-admin.js']);
        assert.deepEqual(call.properties.args.required,['file']);
        return {ok:true,json:async()=>({message:{content:JSON.stringify({action:'CALL',name:'repo.read',args:{file:'panel-admin.js'},report:''})}})};
    }});
    const result=await selector({instruction:'Read real source',tools,
        observations:[{name:'repo.search',ok:true,observation:{results:[{file:'panel-admin.js'}]}}]});
    assert.equal(result.toolCall.args.file,'panel-admin.js');
});

test('query grammar alternatives retain shared required arguments and field bounds',async()=>{
    const schema={type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},fields:{type:'array',items:{type:'string'},maxItems:20}},required:['sourceFile','collection'],additionalProperties:false,
        anyOf:[{properties:{mode:{type:'string',enum:['query']},fields:{type:'array',minItems:1}},required:['mode','fields']}]};
    const selector=createLocalQwenActionSelector({fetchImpl:async(_url,request)=>{
        const payload=JSON.parse(request.body),args=payload.format.anyOf[0].properties.args;
        assert.equal(args.anyOf,undefined);assert.equal(args.properties.fields.maxItems,20);
        assert.equal(args.properties.fields.minItems,1);assert.equal(args.additionalProperties,false);
        assert.deepEqual(args.required,['sourceFile','collection','mode','fields']);
        return {ok:true,json:async()=>({message:{content:JSON.stringify({action:'CALL',name:'platform.query',args:{},report:''})}})};
    }});
    await selector({instruction:'Read',tools:[{name:'platform.query',inputSchema:schema}]});
});

test('discovered field names cannot widen a mission projection allowlist',async()=>{
    const selector=createLocalQwenActionSelector({fetchImpl:async(_url,request)=>{
        const payload=JSON.parse(request.body);
        assert.deepEqual(payload.format.anyOf[0].properties.args.properties.fields.items.enum,['rol']);
        return {ok:true,json:async()=>({message:{content:JSON.stringify({action:'CALL',name:'platform.query',args:{},report:''})}})};
    }});
    await selector({instruction:'Read roles only',tools:[{name:'platform.query',inputSchema:{type:'object',properties:{fields:{type:'array',items:{type:'string',enum:['rol']}}}}}],
        observations:[{ok:true,observation:{recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',fieldSchema:{source:'SERVER_RECORD_FIELD_NAMES',paths:['rol','privateEmail']}}}}]});
});

test('grammar excludes completed source reads and filters lacking field evidence',async()=>{
    const selector=createLocalQwenActionSelector({fetchImpl:async(_url,request)=>{
        const branches=JSON.parse(request.body).format.anyOf;
        assert.deepEqual(branches.find(b=>b.properties.name.const==='repo.read').properties.args.properties.file.enum,['panel-admin.js']);
        assert.deepEqual(branches.find(b=>b.properties.name.const==='platform.query').properties.args.properties.filters.enum,[[]]);
        return {ok:true,json:async()=>({message:{content:JSON.stringify({action:'CALL',name:'repo.read',args:{file:'panel-admin.js'},report:''})}})};
    }});
    await selector({instruction:'Census',tools:[{name:'repo.read',inputSchema:{properties:{file:{type:'string',enum:['app-registro.js','panel-admin.js']}}}},
        {name:'platform.query',inputSchema:{properties:{filters:{type:'array',enum:[[],[{field:'rol',op:'==',value:'tecnico'}]]}}}}],
        missionLedger:{completedSources:['app-registro.js']},observations:[{name:'repo.read',ok:true,observation:{verifiedRead:{file:'app-registro.js',sourceStructure:{dataBindings:{writeShapes:[{collection:'users',fields:['estado']}]}}}}}]});
});
