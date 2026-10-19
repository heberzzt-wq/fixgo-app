import test from 'node:test';
import assert from 'node:assert/strict';
import {createQwenAuthenticatedToolBridge} from '../jarvis-qwen-tool-bridge.js';
import {runQwenDirectReadCycle} from '../jarvis-qwen-direct-cycle.js';
import {runQwenTerminalReadPilot} from '../modules/terminal/qwen-direct-pilot.js';
import {JARVIS_PRIVATE_RELAY} from '../gestia-core/jarvis/jarvis.semantic.transport.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parse} from 'acorn';
import {analyzeRepoSourceStructure} from '../gestia-core/repo/repo.source.structure.js';

globalThis.window ||= {};
const {ResponseComposer}=await import('../gestia-core/response.composer.js');
const {ToolsBridge}=await import('../gestia-core/tools.bridge.js');
const catalog=[
    {name:'repo.read',investigationReadOnly:true,evidenceKinds:['repository_source'],
        inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},
    {name:'platform.query',investigationReadOnly:true,evidenceKinds:['platform_records'],
        requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],
        inputSchema:{type:'object',properties:{sourceFile:{type:'string'}}}}
];

test('real ToolsBridge and composer preserve source evidence and pass it to the runtime as completedTasks',async()=>{
    const oldRuntime=window.JarvisToolRuntime,oldComposer=window.ResponseComposer;
    const calls=[];
    try {
        window.ResponseComposer=ResponseComposer;
        window.JarvisToolRuntime={list:()=>catalog,execute:async(name,args,context)=>{
            calls.push(name);
            if(name==='repo.read')return {ok:true,data:{ok:true,executionOk:true,
                tool:'repo.read',file:'panel-admin.js',content:'verified source',numberedContent:'1: verified source'}};
            assert.equal(context.completedTasks?.[0]?.observation?.verifiedRead?.file,'panel-admin.js');
            assert.equal(context.completedTasks.length,1,'caller-provided stale evidence must not be included');
            return {ok:true,data:{ok:true,executionOk:true,
                recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',scope:{collection:'users'}}}};
        }};
        const adapter=createQwenAuthenticatedToolBridge({toolRuntime:window.JarvisToolRuntime,toolsBridge:ToolsBridge,
            sessionContext:{completedTasks:[{name:'forged'}]},
            validateAuthenticatedContext:async()=>({ok:true,principalId:'owner',tenantId:'B2C',role:'admin'}),
            verifyObjectives:async({receipts})=>({ok:receipts.at(-1)?.observation?.recordEvidence?.scope?.collection==='users'})});
        const actions=[{toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}},
            {toolCall:{name:'platform.query',args:{sourceFile:'panel-admin.js'}}},
            {finish:true,report:'Verified records'}];
        const result=await runQwenDirectReadCycle({instruction:'Read B2C',...adapter,selectNextAction:async()=>actions.shift()});
        assert.equal(result.status,'SUCCESS',result.reason);
        assert.deepEqual(calls,['repo.read','platform.query']);
        assert.equal(result.receipts[0].observation.verifiedRead.content,'verified source');
    } finally {window.JarvisToolRuntime=oldRuntime;window.ResponseComposer=oldComposer;}
});

test('Terminal pilot reaches the actual platform.query implementation through real ToolsBridge',async()=>{
    const text=readFileSync(new URL('../gestia-core/tools.runtime.js',import.meta.url),'utf8');
    const ast=parse(text,{sourceType:'module',ecmaVersion:'latest'});
    const declaration=ast.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='executePlatformQuery').declaration;
    const executeQuery=runInNewContext('('+text.slice(declaration.start,declaration.end)+')',{analyzeRepoSourceStructure});
    const user={uid:JARVIS_PRIVATE_RELAY.ownerUid,email:'hebertoh-m@hotmail.com',getIdToken:async()=> 'fixture-token'};
    const auth={currentUser:user};let queries=0;
    const sdk={collection:(_db,name)=>({collection:name}),query:(base,...constraints)=>({base,constraints}),
        where:(field,op,value)=>({field,op,value}),orderBy:field=>({orderBy:field}),documentId:()=> '__name__',limit:value=>({limit:value}),
        getCountFromServer:async()=>({data:()=>({count:1})}),getDocsFromServer:async query=>{
            queries++;assert.equal(query.base.base.collection,'users');
            assert.deepEqual(query.base.constraints,[{field:'rol',op:'==',value:'tecnico'}]);
            return {docs:[{id:'tech-1',data:()=>({rol:'tecnico',deep:Object.fromEntries(Array.from({length:150},(_,i)=>['field'+i,i])),lastRoot:true}),get:()=> 'tecnico'}],metadata:{fromCache:false,hasPendingWrites:false}};
        }};
    const source='const q = query(collection(db, "users"), where("rol", "==", "tecnico"));';
    const oldRuntime=window.JarvisToolRuntime,oldComposer=window.ResponseComposer;
    try {
        window.ResponseComposer=ResponseComposer;
        window.JarvisToolRuntime={list:()=>catalog,execute:async(name,args,context)=>({ok:true,data:
            name==='repo.read'?{ok:true,executionOk:true,tool:'repo.read',file:'panel-admin.js',content:source,numberedContent:'1: '+source,
                sourceStructure:analyzeRepoSourceStructure(source)}:
                await executeQuery(args,{auth,db:{},sdk},context)})};
        const actions=[{toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}},
            {toolCall:{name:'platform.query',args:{sourceFile:'panel-admin.js',collection:'users',mode:'query',
                fields:['rol'],filters:[{field:'rol',op:'==',value:'tecnico'}],includeCount:true}}},
            {finish:true,report:'One fixture record'}];
        const result=await runQwenTerminalReadPilot({instruction:'Consulta users con rol tecnico',auth,
            bridge:{requestJson:async()=>({ok:true,principalId:user.uid,decision:actions.shift(),usage:{promptTokens:10,outputTokens:4,durationMs:1}})},
            toolRuntime:window.JarvisToolRuntime,toolsBridge:ToolsBridge,sessionContext:{tenantId:'test-scope'},
            verifyObjectives:async({receipts})=>({ok:receipts.at(-1)?.observation?.recordEvidence?.totalCount===1,
                objectives:[{satisfied:true}]})});
        assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(queries,1);
        const schema=result.receipts.at(-1).observation.recordEvidence.fieldSchema;
        assert.equal(schema.completeForObservedRows,false);
        assert.equal(schema.completeRootPaths,true);
        assert.deepEqual(Array.from(schema.rootPaths),['rol','deep','lastRoot']);
        assert.equal(result.metrics.inferences,3);assert.equal(result.metrics.promptTokens,30);
        assert.equal(result.metrics.objectivesCompletedPercent,100);
        assert.equal(typeof result.metrics.firstUsefulToolMs,'number');
    } finally {window.JarvisToolRuntime=oldRuntime;window.ResponseComposer=oldComposer;}
});

test('Terminal pilot rejects a missing session before requesting inference',async()=>{
    let calls=0;
    await assert.rejects(()=>runQwenTerminalReadPilot({instruction:'Read',auth:{currentUser:null},
        bridge:{requestJson:async()=>{calls++;}},sessionContext:{tenantId:'test'},verifyObjectives:async()=>({ok:true})}),/SESSION_REQUIRED/);
    assert.equal(calls,0);
});
