import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerWorkstationHealth,createWorkstationAuthorization} from '../jarvis-workstation-health.js';
test('shared GET/POST health authenticates, minimizes telemetry and registers once',async()=>{
 const app=express();let valid=true;
 const identity=()=>({ok:valid,contract:{branch:'codex/v142-qwen-auth-pilot',releaseId:'release'}});
 const authorize=createWorkstationAuthorization({identity,ownerUid:'owner',verifyIdToken:async token=>{
  if(token==='invalid')throw Error('private diagnostic');return {uid:token};
 }});
 registerWorkstationHealth(app,{experimental:true,identity,authorize,bridgeVersion:'test'});
 registerWorkstationHealth(app,{bridgeVersion:'duplicate'});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const url=`http://127.0.0.1:${server.address().port}/workstation/health`;
 for(const method of ['GET','POST']){
  for(const [token,release,status]of [['owner','release',200],['','release',401],['invalid','release',401],['other','release',403],['owner','bad',409]]){
   const response=await fetch(url,{method,headers:{'X-Jarvis-Release-Id':release,...(token?{Authorization:'Bearer '+token}:{})}});
   assert.equal(response.status,status);const body=await response.json();
   if(status===200){assert.equal(body.bridgeVersion,'test');assert.equal(body.readinessVerified,false);assert.equal(body.doctorRoute,null);assert.ok(body.checkedAt);assert.equal(body.runtime.node.executable,undefined);assert.equal(body.runtime.workerStarted,false);}
   assert.doesNotMatch(JSON.stringify(body),/private diagnostic|executable|Bearer/);
  }
 }
 valid=false;assert.equal((await fetch(url,{headers:{'X-Jarvis-Release-Id':'release',Authorization:'Bearer owner'}})).status,503);
 assert.equal(app.router.stack.filter(l=>l.route?.path==='/workstation/health').length,2);
 }finally{await new Promise(r=>server.close(r));}
});
test('health rejects a non-loopback peer before token verification',async()=>{
 let status,verified=false;const auth=createWorkstationAuthorization({identity:()=>({ok:true}),verifyIdToken:()=>{verified=true;},ownerUid:'owner'});
 const res={status(code){status=code;return this;},json(){return this;}};
 assert.equal(await auth({socket:{remoteAddress:'192.168.1.4'}},res),false);assert.equal(status,403);assert.equal(verified,false);
});
