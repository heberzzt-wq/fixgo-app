import test from 'node:test';
import assert from 'node:assert/strict';
import {createQwenAuthenticatedToolBridge} from '../jarvis-qwen-tool-bridge.js';
import {runQwenDirectReadCycle} from '../jarvis-qwen-direct-cycle.js';

const reader={name:'repo.read',description:'Read verified source',
    investigationReadOnly:true,mutates:false,requiresApproval:false,
    evidenceKinds:['repository_source'],
    inputSchema:{type:'object',properties:{file:{type:'string',
        enum:['panel-admin.js']}},required:['file']}};
const records={name:'platform.query',investigationReadOnly:true,
    mutates:false,requiresApproval:false,evidenceKinds:['platform_records'],
    requiresEvidence:[{kind:'repository_source',argument:'sourceFile',
        observationPath:['verifiedRead','file']}],
    inputSchema:{type:'object',properties:{sourceFile:{type:'string'},
        collection:{type:'string',enum:['users']}},required:['sourceFile','collection']}};
const writer={name:'platform.write',mutates:true,investigationReadOnly:false};
const expensive={name:'paid.external',investigationReadOnly:true,
    mutates:false,requiresApproval:true};

function fixture(overrides={}){
    const calls=[];
    const profile={ok:true,principalId:'technician-1',tenantId:'B2C',
        role:'admin'};
    const identity=overrides.identity || profile;
    const toolsBridge={
        executeMany:async([call],context)=>{
            calls.push({call,context});
            if(call.name==='repo.read')return [{ok:true,
                verifiedRead:{file:call.args.file}}];
            return [{ok:true,recordEvidence:{
                source:'FIRESTORE_SERVER_AUTHENTICATED',
                scope:{collection:'users',tenantId:'B2C'}
            },count:2,hasMore:false}];
        }
    };
    const adapter=createQwenAuthenticatedToolBridge({
        toolRuntime:{list:()=>[reader,records,writer,expensive]},
        toolsBridge,sessionContext:{session:'test-browser-session'},
        validateAuthenticatedContext:async()=>identity,
        verifyObjectives:async({receipts,tenantId})=>({
            ok:tenantId==='B2C'&&receipts.length===2&&
            receipts[1].observation?.recordEvidence?.source===
                'FIRESTORE_SERVER_AUTHENTICATED'
        })
    });
    return {adapter,calls,profile};
}
test('pilot uses existing ToolsBridge execution with authenticated principal, tenant and separate completion verifier',async()=>{
    const {adapter,calls}=fixture();
    assert.deepEqual(adapter.catalog.map(t=>t.name),['repo.read','platform.query']);
    const actions=[
        {toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}},
        {toolCall:{name:'platform.query',args:{sourceFile:'panel-admin.js',collection:'users'}}},
        {finish:true,report:'B2C records from users'}
    ];
    const result=await runQwenDirectReadCycle({
        instruction:'Count B2C technicians',catalog:adapter.catalog,
        selectNextAction:async()=>actions.shift(),
        ...adapter
    });
    assert.equal(result.status,'SUCCESS');
    assert.equal(calls.length,2);
    assert.equal(calls[1].context.tenantId,'B2C');
    assert.equal(calls[1].context.rol,'admin');
    assert.equal(calls[1].context.approved,false);
    assert.equal(calls[1].context.readOnlyPilot,true);
    assert.equal(calls[0].context.rawInput,'Count B2C technicians');
});
test('source prerequisites prevent Qwen from querying before a verified read',async()=>{
    const {adapter,calls}=fixture();
    const result=await runQwenDirectReadCycle({
        instruction:'Count B2C technicians',catalog:adapter.catalog,
        selectNextAction:async()=>({toolCall:{name:'platform.query',
            args:{sourceFile:'panel-admin.js',collection:'users'}}}),
        ...adapter
    });
    assert.equal(result.status,'PARTIAL');
    assert.equal(result.reason,'INDEPENDENT_AUTHORIZATION_DENIED');
    assert.equal(calls.length,0);
});
test('missing or rejected authenticated principal fails closed',async()=>{
    const {adapter,calls}=fixture({identity:{ok:false}});
    const result=await runQwenDirectReadCycle({
        instruction:'Read source',catalog:adapter.catalog,
        selectNextAction:async()=>({toolCall:{name:'repo.read',
            args:{file:'panel-admin.js'}}}),
        ...adapter
    });
    assert.equal(result.reason,'INDEPENDENT_AUTHORIZATION_DENIED');
    assert.equal(calls.length,0);
});
test('pilot never exposes mutating or paid tools to the model',()=>{
    const {adapter}=fixture();
    assert.equal(adapter.catalog.some(t=>t.name==='platform.write'),false);
    assert.equal(adapter.catalog.some(t=>t.name==='paid.external'),false);
});
test('tool interface returns a blocked receipt without accepting a rejected read as success',async()=>{
    let count=0;
    const adapter=createQwenAuthenticatedToolBridge({
        toolRuntime:{list:()=>[reader]},
        toolsBridge:{executeMany:async()=>{count++;return [{ok:false,blocked:true,status:'DENIED'}];}},
        sessionContext:{},
        validateAuthenticatedContext:async()=>({ok:true,principalId:'x',tenantId:'B2C',role:'admin'}),
        verifyObjectives:async()=>({ok:true})
    });
    const result=await runQwenDirectReadCycle({
        instruction:'Read',catalog:adapter.catalog,
        selectNextAction:async()=>({toolCall:{name:'repo.read',
            args:{file:'panel-admin.js'}}}),
        ...adapter
    });
    assert.equal(count,1);
    assert.equal(result.status,'PARTIAL');
    assert.equal(result.reason,'READ_TOOL_NOT_SUCCESSFUL');
});
test('caller cannot construct bridge without real runtime, session check and independent audit',()=>{
    assert.throws(()=>createQwenAuthenticatedToolBridge({
        toolRuntime:{list:()=>[reader]},toolsBridge:{executeMany:async()=>[]}
    }),/EXISTING_RUNTIME_REQUIRED/);
});

test('a valid read of a different source cannot authorize a forged sourceFile binding',async()=>{
    const {adapter,calls}=fixture();
    const actions=[
        {toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}},
        {toolCall:{name:'platform.query',args:{sourceFile:'modulo-flotilla.js',collection:'users'}}}
    ];
    const result=await runQwenDirectReadCycle({
        instruction:'Only current B2C technicians',catalog:adapter.catalog,
        selectNextAction:async()=>actions.shift(),
        ...adapter
    });
    assert.equal(result.status,'PARTIAL');
    assert.equal(result.reason,'INDEPENDENT_AUTHORIZATION_DENIED');
    assert.equal(calls.length,1);
    assert.equal(calls[0].call.name,'repo.read');
});
test('executor rechecks the exact authenticated identity before every call',async()=>{
    let checks=0,invocations=0;
    const adapter=createQwenAuthenticatedToolBridge({
        toolRuntime:{list:()=>[reader]},
        toolsBridge:{executeMany:async()=>{invocations++;return [{ok:true}];}},
        sessionContext:{},
        validateAuthenticatedContext:async()=>({
            ok:true,principalId:checks++===0?'principal-old':'principal-new',
            tenantId:'B2C',role:'admin'
        }),
        verifyObjectives:async()=>({ok:true})
    });
    const result=await runQwenDirectReadCycle({
        instruction:'Read current source',catalog:adapter.catalog,
        selectNextAction:async()=>({toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}}),
        ...adapter
    });
    assert.equal(result.status,'PARTIAL');
    assert.equal(result.reason,'READ_TOOL_NOT_SUCCESSFUL');
    assert.equal(invocations,0);
});
