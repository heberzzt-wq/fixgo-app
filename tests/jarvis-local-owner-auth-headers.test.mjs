import test from 'node:test';
import assert from 'node:assert/strict';
import {installJarvisLocalBridgeTransport} from '../modules/terminal/nexo-bootstrap.js';

test('owner-only isolated endpoints forward the supplied Firebase ID token and remain protected without it', async t => {
  const priorFetch=globalThis.fetch;
  const priorBridge=globalThis.JarvisLocalBridge;
  const priorWindow=globalThis.window;
  t.after(()=>{
    globalThis.fetch=priorFetch;
    if(priorBridge===undefined)delete globalThis.JarvisLocalBridge;
    else globalThis.JarvisLocalBridge=priorBridge;
    if(priorWindow===undefined)delete globalThis.window;
    else globalThis.window=priorWindow;
  });
  const calls=[];
  globalThis.fetch=async(url,request={})=>{
    if(String(url).includes('jarvis-runtime-contract.json'))
      return Response.json({releaseId:'test-owner-release'});
    if(String(url).includes('release-manifest.json'))
      return Response.json({git_sha:'f'.repeat(40)});
    const route=new URL(String(url)).pathname;
    calls.push({route,headers:request.headers,body:JSON.parse(request.body)});
    const protectedRoute=['/qwen-isolated/evidence','/qwen-isolated/verify','/security/local/status','/workstation/health'].includes(route) ||
      ['/upload/start','/upload/chunk','/upload/complete','/upload/cancel'].includes(route) &&
      request.headers['X-Jarvis-Private-Relay']==='owner-upload-v142';
    const authorized=request.headers.Authorization==='Bearer test-firebase-owner-token';
    return Response.json(protectedRoute&&!authorized
      ? {ok:false,error:'QWEN_BROWSER_TOKEN_REQUIRED'}
      : {ok:true,status:'TEST_AUTHENTICATED'}, {status:protectedRoute&&!authorized?401:200});
  };
  delete globalThis.JarvisLocalBridge;
  delete globalThis.window;
  const bridge=installJarvisLocalBridgeTransport();
  for(const route of ['/qwen-isolated/evidence','/qwen-isolated/verify','/security/local/status']){
    const payload={missionId:'test-only'};
    const result=await bridge.requestJson(route,payload,{idToken:'test-firebase-owner-token',timeoutMs:2500});
    assert.equal(result.ok,true,route);
    const sent=calls.at(-1);
    assert.equal(sent.headers.Authorization,'Bearer test-firebase-owner-token',route);
    assert.equal(sent.headers['X-Jarvis-Release-Id'],'test-owner-release',route);
    assert.deepEqual(sent.body,payload,route);
  }
  const noToken=await bridge.requestJson('/qwen-isolated/evidence',{missionId:'test-only'},{timeoutMs:2500});
  assert.equal(noToken.ok,false);
  assert.equal(noToken.httpStatus,401);
  assert.equal(calls.at(-1).headers.Authorization,undefined);
  for(const route of ['/upload/start','/upload/chunk','/upload/complete','/upload/cancel']){
    const payload={uploadId:'11111111-2222-4333-8444-555555555555'};
    const res=await bridge.requestJson(route,payload,
      {idToken:'test-firebase-owner-token',privateRelayExecution:true,timeoutMs:2500});
    assert.equal(res.ok,true,route);
    assert.equal(calls.at(-1).headers.Authorization,'Bearer test-firebase-owner-token',route);
    assert.equal(calls.at(-1).headers['X-Jarvis-Private-Relay'],'owner-upload-v142',route);
    assert.equal(calls.at(-1).headers['X-Jarvis-Release-Id'],'test-owner-release');
    const rejected=await bridge.requestJson(route,payload,{privateRelayExecution:true,timeoutMs:2500});
    assert.equal(rejected.ok,false,route);
    assert.equal(rejected.httpStatus,401,route);
  }
  const desktop=await bridge.requestJson('/upload/start',{name:'desktop.pdf'}, {timeoutMs:2500});
  assert.equal(desktop.ok,true,'local desktop still uses its original route');
  assert.equal(calls.at(-1).headers['X-Jarvis-Private-Relay'],undefined);
  assert.equal(calls.at(-1).headers.Authorization,undefined);
  const ordinary=await bridge.requestJson('/artifact/read',{output:'example'}, {idToken:'test-firebase-owner-token',timeoutMs:2500});
  assert.equal(ordinary.ok,true);
  assert.equal(calls.at(-1).headers.Authorization,undefined,'never send bearer to unrestricted or unknown routes');
});
