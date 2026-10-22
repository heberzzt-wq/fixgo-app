import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createQwenBridgeActionSelector} from '../modules/terminal/qwen-direct-transport.js';

const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('gestia-terminal.html',root),'utf8');
const core=fs.readFileSync(new URL('gestia-core/gestia-core.js',root),'utf8');

test('Terminal includes an actual non-submit stop control and a parseable submit script',()=>{
 assert.match(html,/id="btn-stop-mission" hidden disabled/);
 assert.match(html,/type="button" id="btn-stop-mission"/);
 assert.match(html,/stopMissionButton\.addEventListener\('click'/);
 const index=html.indexOf('let isProcessing = false');
 const start=html.lastIndexOf('<script defer>',index);
 const end=html.indexOf('</script>',index);
 assert.ok(start>=0&&end>start);
 assert.doesNotThrow(()=>new vm.Script(html.slice(start+'<script defer>'.length,end),{filename:'terminal-mission-submit.js'}));
});
test('abort controller reaches the authorized local Qwen runner, with no write capability added',()=>{
 assert.match(html,/localMissionAbortController=localPilotActive\?new AbortController\(\):null/);
 assert.match(html,/localMissionAbortController\.abort\('USER_REQUESTED_STOP'\)/);
 assert.match(html,/missionAbortSignal:localMissionAbortController\?\.signal\|\|null/);
 assert.match(core,/signal:context\.missionAbortSignal\|\|undefined/);
 assert.match(core,/context\.missionAbortSignal\?\.throwIfAborted/);
 assert.match(html,/stopMissionButton\.hidden=true/);
 assert.match(html,/Misión cancelada por el usuario/);
});
test('cancel interrupts the fetch awaiting local Qwen and never accepts a fabricated result',async()=>{
 const user={uid:'owner',getIdToken:async()=> 'test-token'};
 const auth={currentUser:user,authStateReady:async()=>{}};
 let requests=0,signalPassed=null;
 const bridge={requestJson:(_route,_payload,{signal})=>{
  requests++;signalPassed=signal;
  return new Promise((_resolve,reject)=>{
   if(signal.aborted)return reject(new Error('ABORTED_BEFORE_REQUEST'));
   signal.addEventListener('abort',()=>reject(new Error('FETCH_CANCELLED')),{once:true});
  });
 }};
 const selector=createQwenBridgeActionSelector({bridge,auth});
 const controller=new AbortController();
 const promise=selector({signal:controller.signal,instruction:'Probar cancelación local',tools:[{name:'repo.grep'}],observations:[]});
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(requests,1);
 assert.equal(signalPassed,controller.signal);
 controller.abort('USER_REQUESTED_STOP');
 await assert.rejects(promise,/FETCH_CANCELLED/);
 assert.equal(requests,1);
});
