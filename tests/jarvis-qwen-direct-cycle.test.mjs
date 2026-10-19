import test from 'node:test';
import assert from 'node:assert/strict';
import {runQwenDirectReadCycle} from '../jarvis-qwen-direct-cycle.js';

const catalog=[
    {name:'repo.read',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_source'],
        inputSchema:{type:'object',properties:{file:{type:'string',enum:['panel-admin.js']}},required:['file'],additionalProperties:false}},
    {name:'platform.query',investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source'}],
        inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string',enum:['users','flotilla_b2b']},role:{type:'string'}},required:['sourceFile','collection'],additionalProperties:false}},
    {name:'platform.write',mutates:true,investigationReadOnly:false},
    {name:'payment.charge',investigationReadOnly:true,mutates:false,requiresApproval:true}
];
const map='CONFIGURACION_DE_FUENTES_VERIFICADA={"revision":"fake-fixture","operationalEvidence":false,"permissionsGranted":false}';

test('Qwen directly chooses read -> authenticated query -> finish without extra contract decisions',async()=>{
    const actions=[
        {toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}},
        {toolCall:{name:'platform.query',args:{sourceFile:'panel-admin.js',collection:'users',role:'tecnico'}}},
        {finish:true,report:'Dos técnicos B2C del alcance autenticado'}
    ];
    const selected=[],executed=[];
    const result=await runQwenDirectReadCycle({
        instruction:'Cuenta los técnicos B2C registrados en users',
        repositoryMap:map,catalog,
        selectNextAction:async({repositoryMap,tools,observations})=>{
            assert.equal(repositoryMap,map);
            assert.ok(tools.every(t=>!['platform.write','payment.charge'].includes(t.name)));
            assert.equal(observations.length,executed.length);
            assert.equal(tools.some(tool=>tool.name==='platform.query'),executed.length>0,
                'model catalog exposes queries only after a successful source receipt');
            return actions.shift();
        },
        authorize:async({call,receipts})=>{
            if(call.name==='platform.query'){
                return {ok:receipts.some(r=>r.name==='repo.read'&&r.observation.verifiedRead?.file==='panel-admin.js')};
            }
            return {ok:true};
        },
        execute:async(call)=>{
            executed.push(call);
            return call.name==='repo.read'?{ok:true,verifiedRead:{file:'panel-admin.js'}}:
                {ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',scope:{collection:'users',filter:'rol == tecnico'}},count:2,hasMore:false};
        },
        verifyCompletion:async({receipts})=>({ok:receipts.length===2&&
            receipts[1].observation.recordEvidence.source==='FIRESTORE_SERVER_AUTHENTICATED'})
    });
    assert.equal(result.status,'SUCCESS');
    assert.equal(result.reason,'VERIFIED_COMPLETE');
    assert.equal(executed.length,2);
    assert.equal(result.modelDecisions,3);
});
test('model may not execute mutation or approval-only tools even when it asks directly',async()=>{
    for(const name of ['platform.write','payment.charge']){
        const result=await runQwenDirectReadCycle({
            instruction:'Read only',catalog,repositoryMap:map,
            selectNextAction:async()=>({toolCall:{name,args:{}}}),
            authorize:async()=>{throw Error('authorization should not be reached');},
            execute:async()=>{throw Error('execution should not be reached');},
            verifyCompletion:async()=>{throw Error('not complete');}
        });
        assert.equal(result.status,'PARTIAL');
        assert.equal(result.reason,'UNKNOWN_OR_UNAUTHORIZED_TOOL');
        assert.equal(result.receipts.length,0);
    }
});
test('an assertion without verified operational data remains partial',async()=>{
    const result=await runQwenDirectReadCycle({
        instruction:'Count all B2C technicians',catalog,repositoryMap:map,
        selectNextAction:async()=>({finish:true,report:'999 technicians'}),
        authorize:async()=>({ok:true}),execute:async()=>({ok:true}),
        verifyCompletion:async({receipts})=>({ok:receipts.length>0})
    });
    assert.equal(result.status,'PARTIAL');
    assert.equal(result.reason,'OBJECTIVES_NOT_VERIFIED');
    assert.equal(result.report,'');
});
test('exact replay of one tool call is stopped without more execution',async()=>{
    let count=0;
    const result=await runQwenDirectReadCycle({
        instruction:'Read B2C source',catalog,repositoryMap:map,
        selectNextAction:async()=>({toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}}),
        authorize:async()=>({ok:true}),
        execute:async()=>{count++;return {ok:true,verifiedRead:{file:'panel-admin.js'}};},
        verifyCompletion:async()=>({ok:false})
    });
    assert.equal(result.reason,'REPEATED_TOOL_CALL');
    assert.equal(count,1);
});
test('denied scope never calls executor or becomes a successful mission',async()=>{
    const result=await runQwenDirectReadCycle({
        instruction:'B2C only',catalog,repositoryMap:map,
        selectNextAction:async()=>({toolCall:{name:'platform.query',args:{sourceFile:'panel-admin.js',collection:'flotilla_b2b'}}}),
        authorize:async()=>({ok:false,reason:'TENANT_SCOPE_DENIED'}),
        execute:async()=>{throw Error('must not execute');},
        verifyCompletion:async()=>({ok:true})
    });
    assert.equal(result.reason,'INDEPENDENT_AUTHORIZATION_DENIED');
    assert.equal(result.receipts[0].observation.blocked,true);
});
test('missing independent authorization or certification is fail closed',async()=>{
    await assert.rejects(runQwenDirectReadCycle({
        instruction:'Read',catalog,selectNextAction:async()=>({finish:true}),
        execute:async()=>({ok:true})
    }),/QWEN_DIRECT_INDEPENDENT_AUTHORITY_REQUIRED/);
});
test('unsafe, undeclared or invalid arguments are rejected before authorization',async()=>{
    for(const args of [{}, {file:'invented.js'}, {file:'panel-admin.js',script:'rm -rf'}]){
        const result=await runQwenDirectReadCycle({
            instruction:'Read a source',catalog,repositoryMap:map,
            selectNextAction:async()=>({toolCall:{name:'repo.read',args}}),
            authorize:async()=>{throw Error('should not reach');},
            execute:async()=>{throw Error('should not reach');},
            verifyCompletion:async()=>({ok:true})
        });
        assert.equal(result.status,'PARTIAL');
        assert.match(result.reason,/REQUIRED_ARGUMENT|OUTSIDE_SCHEMA|ARGUMENT_UNDECLARED/);
    }
});

test('even a mistaken positive certifier cannot mark a mission complete without execution evidence',async()=>{
    const result=await runQwenDirectReadCycle({
        instruction:'Read real operational data',catalog,repositoryMap:map,
        selectNextAction:async()=>({finish:true,report:'Already complete'}),
        authorize:async()=>({ok:true}),execute:async()=>({ok:true}),
        verifyCompletion:async()=>({ok:true})
    });
    assert.equal(result.status,'PARTIAL');
    assert.equal(result.reason,'NO_EXECUTED_EVIDENCE');
    assert.equal(result.report,'');
});

test('large tool receipts are bounded in Qwen context but retained intact for the independent auditor',async()=>{
    let seen=null,verified=null;
    const result=await runQwenDirectReadCycle({
        instruction:'Inspect a local source',catalog,repositoryMap:map,
        selectNextAction:async({observations})=>{
            if(observations.length){
                seen=observations[0].observation;
                return {finish:true,report:'Done'};
            }
            return {toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}};
        },
        authorize:async()=>({ok:true}),
        execute:async()=>({ok:true,verifiedRead:{file:'panel-admin.js'},
            sensitiveLargeBody:'SECRET_SOURCE_DATA_'.repeat(5000)}),
        verifyCompletion:async({receipts})=>{
            verified=receipts[0].observation;
            return {ok:receipts[0].ok===true};
        }
    });
    assert.equal(result.status,'SUCCESS');
    assert.ok(JSON.stringify(seen).length<3500);
    assert.equal(seen.observationTruncated,true);
    assert.match(verified.sensitiveLargeBody,/SECRET_SOURCE_DATA_/);
    assert.doesNotMatch(JSON.stringify(seen),/SECRET_SOURCE_DATA_/);
});
