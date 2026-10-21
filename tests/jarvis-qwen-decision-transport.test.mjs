import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createQwenDecisionHandler} from '../jarvis-qwen-decision-http.js';
import {createQwenBridgeActionSelector} from '../modules/terminal/qwen-direct-transport.js';
import {JARVIS_PRIVATE_RELAY,readSemanticStream} from '../gestia-core/jarvis/jarvis.semantic.transport.js';

const input={instruction:'Read B2C source',tools:[{name:'repo.read',inputSchema:{type:'object'}}],observations:[]};
const owner=JARVIS_PRIVATE_RELAY.ownerUid;
async function serverTest(options,run){
    const app=express();app.use(express.json());app.post('/semantic/plan',createQwenDecisionHandler(options));
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const url=`http://127.0.0.1:${server.address().port}/semantic/plan`;
    try {await run((token,body=input)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',
        ...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));}
    finally {await new Promise(resolve=>server.close(resolve));}
}

test('disabled pilot and missing, expired or wrong-owner tokens never invoke Qwen',async()=>{
    let calls=0;
    const selectNextAction=async()=>{calls++;return {};};
    await serverTest({selectNextAction},async post=>assert.equal((await post('token')).status,403));
    await serverTest({enabled:true,selectNextAction,verifyIdToken:async token=>{
        if(token==='expired')throw new Error('expired');return {uid:'other'};
    }},async post=>{
        assert.equal((await post()).status,401);
        assert.equal((await post('expired')).status,401);
        assert.equal((await post('other')).status,403);
    });
    assert.equal(calls,0);
});

test('authenticated decision uses existing NDJSON transport and never passes token to model',async()=>{
    await serverTest({enabled:true,verifyIdToken:async token=>{assert.equal(token,'secret');return {uid:owner};},
        selectNextAction:async payload=>{
            assert.equal(JSON.stringify(payload).includes('secret'),false);
            return {toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}};
        }},async post=>{
        const response=await post('secret',{...input,streamProgress:true});
        const result=await readSemanticStream(response);
        assert.equal(result.ok,true);assert.equal(result.principalId,owner);
        assert.equal(result.decision.toolCall.name,'repo.read');
    });
});

test('concurrent decision is rejected without launching a second inference',async()=>{
    let release,entered;
    const started=new Promise(resolve=>{entered=resolve;});
    await serverTest({enabled:true,verifyIdToken:async()=>({uid:owner}),selectNextAction:async()=>{
        entered();await new Promise(resolve=>{release=resolve;});return {finish:true};
    }},async post=>{
        const first=post('secret');await started;
        assert.equal((await post('secret')).status,409);
        release();assert.equal((await first).status,200);
    });
});

test('browser selector uses bridge header options, verifies identity and reports usage',async()=>{
    const user={uid:owner,getIdToken:async()=> 'secret'};
    let calls=0,usage;
    const selector=createQwenBridgeActionSelector({auth:{currentUser:user},onInference:x=>{usage=x;},
        bridge:{requestJson:async(route,payload,options)=>{
            calls++;assert.equal(route,'/semantic/plan');assert.equal(options.idToken,'secret');
            assert.equal(JSON.stringify(payload).includes('secret'),false);
            return {ok:true,principalId:owner,usage:{promptTokens:42},decision:{finish:true}};
        }}});
    assert.deepEqual(await selector(input),{finish:true});assert.equal(calls,1);assert.equal(usage.promptTokens,42);
});

test('browser logout during inference rejects result and never retries',async()=>{
    const auth={currentUser:{uid:owner,getIdToken:async()=> 'secret'}};let calls=0;
    const selector=createQwenBridgeActionSelector({auth,bridge:{requestJson:async()=>{
        calls++;auth.currentUser=null;return {ok:true,principalId:owner,decision:{finish:true}};
    }}});
    await assert.rejects(()=>selector(input),/SESSION_CHANGED/);assert.equal(calls,1);
});

test('actual browser bootstrap forwards token only in header and refuses private-relay persistence',async t=>{
    const old={fetch:globalThis.fetch,location:globalThis.location,bridge:globalThis.JarvisLocalBridge};
    t.after(()=>{globalThis.fetch=old.fetch;globalThis.location=old.location;globalThis.JarvisLocalBridge=old.bridge;});
    delete globalThis.JarvisLocalBridge;
    let calls=0;
    globalThis.fetch=async(url,options)=>{
        if(String(url).includes('jarvis-runtime-contract.json'))return Response.json({releaseId:'test',privateRelayEnabled:true});
        if(String(url).includes('release-manifest.json'))return Response.json({git_sha:'a'.repeat(40)});
        calls++;assert.equal(options.headers.Authorization,'Bearer private-token');
        assert.equal(options.body.includes('private-token'),false);
        return Response.json({ok:true});
    };
    const {installJarvisLocalBridgeTransport}=await import('../modules/terminal/nexo-bootstrap.js?qwen-auth-test');
    const bridge=installJarvisLocalBridgeTransport();
    const payload={...input,missionState:{phase:'DIRECT_READ_ONLY_ACTION'}};
    globalThis.location={hostname:'fixgo-44e4d.web.app'};
    await assert.rejects(()=>bridge.requestJson('/semantic/plan',payload,{idToken:'private-token'}),/LOCAL_SESSION_REQUIRED/);
    assert.equal(calls,0);
    globalThis.location={hostname:'localhost'};
    assert.equal((await bridge.requestJson('/semantic/plan',payload,{idToken:'private-token'})).ok,true);
    assert.equal(calls,1);
});
