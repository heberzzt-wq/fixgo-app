import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,appendFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPilotVersionGate,expectedPilotFingerprint,WATCHED} from '../jarvis-qwen-pilot-version.js';

const root=fileURLToPath(new URL('../',import.meta.url));
test('valid running bridge and newer browser are permitted, old browser and code are blocked',()=>{
 const dir=mkdtempSync(join(tmpdir(),'qwen-version-gate-'));
 try{
   for(const f of WATCHED){
      mkdirSync(dirname(join(dir,f)),{recursive:true});
      copyFileSync(join(root,f),join(dir,f));
   }
   const gate=createPilotVersionGate(dir);
   const valid={clientFingerprint:expectedPilotFingerprint(),clientStartedAt:gate.bootedAt+1};
   assert.equal(gate.inspect(valid).ok,true);
   assert.equal(gate.inspect({...valid,clientStartedAt:gate.bootedAt-1}).reason,'QWEN_PILOT_BROWSER_RELOAD_REQUIRED');
   assert.equal(gate.inspect({...valid,clientFingerprint:'wrong'}).reason,'QWEN_PILOT_BROWSER_RELOAD_REQUIRED');
   appendFileSync(join(dir,'modules/terminal/qwen-general-pilot.js'),'\n// source edited after process start\n');
   assert.equal(gate.inspect(valid).reason,'QWEN_PILOT_BRIDGE_RESTART_REQUIRED');
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('authenticated decision rejects old general client before any Qwen inference',async()=>{
 const [{createQwenDecisionHandler},{JARVIS_PRIVATE_RELAY}]=await Promise.all([
  import('../jarvis-qwen-decision-http.js'),
  import('../gestia-core/jarvis/jarvis.semantic.transport.js')]);
 let called=0,code=200,payload=null;
 const handler=createQwenDecisionHandler({enabled:true,
   verifyIdToken:async()=>({uid:JARVIS_PRIVATE_RELAY.ownerUid}),
   checkPilotVersion:()=>({ok:false,reason:'QWEN_PILOT_BRIDGE_RESTART_REQUIRED'}),
   selectNextAction:async()=>{called++;return {finish:true,report:'Incorrect success'};}});
 const req={get:key=>key==='Authorization'?'Bearer testing-token':'',body:{
   missionState:{phase:'DIRECT_READ_ONLY_ACTION'},instruction:'Create a professional ad',
   tools:[{name:'advertising.research',inputSchema:{type:'object'}}],observations:[]}};
 const res={destroyed:false,status(value){code=value;return this;},json(value){payload=value;return this;}};
 await handler(req,res);
 assert.equal(code,409);
 assert.equal(payload.reason,'QWEN_PILOT_BRIDGE_RESTART_REQUIRED');
 assert.equal(called,0);
});

test('a changed media exporter forces pilot restart, even with an otherwise valid client',()=>{
 assert.ok(WATCHED.includes('jarvis-material-library.js'));
 const dir=mkdtempSync(join(tmpdir(),'qwen-exporter-gate-'));
 try {
  for(const f of WATCHED) {
   mkdirSync(dirname(join(dir,f)),{recursive:true});
   copyFileSync(join(root,f),join(dir,f));
  }
  const gate=createPilotVersionGate(dir);
  const client={clientFingerprint:expectedPilotFingerprint(),clientStartedAt:gate.bootedAt+1};
  assert.equal(gate.inspect(client).ok,true);
  appendFileSync(join(dir,'jarvis-material-library.js'),'\n// new export policy\n');
  assert.equal(gate.inspect(client).reason,'QWEN_PILOT_BRIDGE_RESTART_REQUIRED');
 } finally {rmSync(dir,{recursive:true,force:true});}
});
