import test from 'node:test';
import assert from 'node:assert/strict';
import {WEBTEST,buildFirebasePreviewCommand,validateBridge,waitForBridge,validateSingleSite,inspectWebtest}
  from '../scripts/publish-v142-webtest.mjs';

const sha='a'.repeat(40);
const identity={status:'BRIDGE_IDENTITY_OK',git:{head:sha},
  contractHead:sha,contract:{branch:'v142-official'}};
const response=(status,data={},headers={})=>({
  status,headers:{get:name=>headers[String(name).toLowerCase()]||null},
  async json(){return data;}
});
function fixture({origin=WEBTEST.origin,bridge=identity,spoof=403,auth=409,
  heartbeat=200,servedSha=sha,privateStatus=404}={}){
  const seen=[];
  const fetchImpl=async(url,config={})=>{
    seen.push({url,headers:config.headers,method:config.method||'GET'});
    if(url===WEBTEST.bridge+'/health'){
      if(config.headers?.Origin===WEBTEST.origin+'.evil.example')return response(spoof);
      return response(200,{identity:bridge},{'access-control-allow-origin':origin});
    }
    if(url===WEBTEST.bridge+'/workstation/health')return response(config.method==='POST'?auth:heartbeat,{status:'JARVIS_WORKSTATION_LIVE'});
    if(url===WEBTEST.origin+'/release-manifest.json')return response(200,{git_sha:servedSha});
    if(url===WEBTEST.origin+'/gestia-terminal.html')return response(200);
    if(url===WEBTEST.origin+'/jarvis-runtime-contract.json')return response(200);
    if(['/jarvis-fs-bridge.js','/jarvis-github-worker.js','/functions/index.js']
      .some(path=>url===WEBTEST.origin+path))return response(privateStatus);
    throw Error('UNEXPECTED_TEST_URL');
  };
  return {fetchImpl,seen};
}
test('valid same-version private preview is verifiable without claiming an authenticated mission',async()=>{
  const {fetchImpl,seen}=fixture();
  const result=await inspectWebtest(sha,{fetchImpl});
  assert.equal(Object.values(result).every(Boolean),true);
  assert.equal(seen.length,10);
  assert.ok(seen.some(item=>item.method==='GET'&&item.url.endsWith('/workstation/health')));
  assert.ok(seen.some(item=>item.method==='POST'&&item.url.endsWith('/workstation/health')));
  assert.equal(seen[0].headers.Origin,WEBTEST.origin);
  assert.ok(!seen.some(v=>v.url.includes('multiservicios')));
  const guardedGet=await inspectWebtest(sha,fixture({heartbeat:409}));
  assert.equal(guardedGet.releaseIdGate,true);
});
test('preview checks fail closed on spoofed or missing CORS, stale bridge or wrong release gate',async()=>{
  for(const bad of [
    {origin:'https://evil.example'},
    {bridge:{...identity,contractHead:'b'.repeat(40)}},
    {spoof:200},
    {heartbeat:503},
    {auth:503}
  ]){
    await assert.rejects(inspectWebtest(sha,fixture(bad)),/WEBTEST_/);
  }
});
test('preview checks reject public SHA drift and any exposed server source',async()=>{
  for(const bad of [{servedSha:'b'.repeat(40)},{privateStatus:200}]){
    await assert.rejects(inspectWebtest(sha,fixture(bad)),/WEBTEST_/);
  }
});
test('single hosting site and bridge identity cannot be forged',()=>{
  const one={status:'success',result:{
    'fixgo-44e4d':{site:'fixgo-44e4d',url:WEBTEST.origin}
  }};
  assert.equal(validateSingleSite(one),true);
  assert.equal(validateSingleSite({status:'success',result:{...one.result,other:{site:'other'}}}),false);
  assert.equal(validateSingleSite({status:'success',result:{
    'fixgo-44e4d':{site:'fixgo-44e4d',url:'https://evil.example'}}}),false);
  assert.equal(validateBridge(identity,sha),true);
  assert.equal(validateBridge({...identity,status:'BRIDGE_IDENTITY_INVALID'},sha),false);
  assert.equal(validateBridge(identity,'b'.repeat(40)),false);
});

test('Windows Firebase launcher uses a safe unquoted literal cmd path and one preview site',()=>{
  const cmd=buildFirebasePreviewCommand('C:\\Users\\heber\\AppData\\Roaming\\npm\\firebase.cmd');
  assert.match(cmd,/^C:\\Users\\heber\\AppData\\Roaming\\npm\\firebase\.cmd hosting:channel:deploy /);
  assert.match(cmd,/ --only fixgo-44e4d --project fixgo-44e4d /);
  assert.ok(!cmd.includes('""'));
  for(const invalid of [
    'C:\\Program Files\\firebase.cmd',
    'C:\\valid\\firebase.cmd & echo hacked',
    '../firebase.cmd',
    'C:\\valid\\firebase.exe',
    ''
  ])assert.throws(()=>buildFirebasePreviewCommand(invalid),/UNSAFE_FIREBASE_CLI_PATH/);
});

test('supervisor identity must converge before tests; stale releases never pass',async()=>{
  let n=0;
  const fetchImpl=async()=>{
    n++;
    if(n===1)return response(503);
    if(n===2)return response(200,{identity:{...identity,contractHead:'b'.repeat(40)}});
    return response(200,{identity});
  };
  assert.equal(await waitForBridge(sha,{fetchImpl,attempts:3,delayMs:0}),true);
  assert.equal(n,3);
  await assert.rejects(waitForBridge(sha,{fetchImpl:async()=>response(503),
    attempts:2,delayMs:0}),/WEBTEST_BRIDGE_NOT_READY_FOR_SHA/);
});
