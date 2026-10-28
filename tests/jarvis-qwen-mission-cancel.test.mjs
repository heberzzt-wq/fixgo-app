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
 assert.match(html,/localMissionAbortController=new AbortController\(\)/);
 assert.match(html,/stopMissionButton\.hidden=false/);
 assert.match(html,/stopMissionButton\.disabled=false/);
 assert.match(html,/addEventListener\('pagehide'/);
 assert.match(html,/cancellingController\.abort\('USER_REQUESTED_STOP'\)/);
 assert.match(html,/missionAbortSignal:localMissionAbortController\?\.signal\|\|null/);
 assert.match(core,/signal:context\.missionAbortSignal\|\|undefined/);
 assert.match(core,/context\.missionAbortSignal\?\.throwIfAborted/);
 assert.match(html,/stopMissionButton\.hidden=true/);
 assert.match(html,/Misión cancelada por el usuario/);
 assert.match(html,/Los recibos de esta misión solo se conservan si alcanzaron a guardarse/);
});
test('a stalled cancel offers an explicit owner reload without claiming a server-side cancellation',()=>{
 const begin=html.indexOf('    let isProcessing = false;');
 const end=html.indexOf('    let activeUtterances = 0;',begin);
 assert.ok(begin>0&&end>begin,'isolated cancel control must remain in Terminal script');
 const callback={};const timers=new Map();let nextId=0,reloads=0,dispatches=0;
 const button={dataset:{},hidden:false,disabled:false,textContent:'Detener',title:'',addEventListener:(name,fn)=>callback[name]=fn};
 const context={document:{getElementById:()=>button},window:{
  dispatchEvent:()=>dispatches++,addEventListener:()=>{},location:{reload:()=>reloads++}},
  CustomEvent:class {constructor(name,init){this.name=name;this.detail=init.detail}},
  AbortController,setTimeout:(fn,ms)=>{assert.equal(ms,8000);const id=++nextId;timers.set(id,fn);return id},
  clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(html.slice(begin,end)+
  '\n globalThis.__cancelTest={start(){isProcessing=true;localMissionAbortController=new AbortController();return localMissionAbortController},finish(){isProcessing=false;localMissionAbortController=null;clearTimeout(missionCancelRecoveryTimer);missionCancelRecoveryTimer=null}};',
  context);
 const controller=context.__cancelTest.start();
 callback.click();
 assert.equal(controller.signal.aborted,true);
 assert.equal(button.disabled,true);
 assert.equal(button.textContent,'Deteniendo...');
 assert.equal(dispatches,1);
 assert.equal(reloads,0);
 // A second click while the backend outcome is unknown MUST do nothing.
 callback.click();assert.equal(reloads,0);
 for(const fire of [...timers.values()])fire();
 assert.equal(button.textContent,'Recargar Terminal');
 assert.equal(button.disabled,false);
 assert.equal(button.dataset.cancelRecoveryReady,'true');
 assert.match(button.title,/no acredita detener una ejecución remota/);
 assert.equal(reloads,0,'the recovery timer never reloads automatically');
 callback.click();assert.equal(reloads,1,'only a second owner click reloads');
});

test('a completed cancel clears its fallback before a stale timeout can change the UI',()=>{
 const begin=html.indexOf('    let isProcessing = false;'),end=html.indexOf('    let activeUtterances = 0;',begin);
 const callback={},timers=[];
 const button={dataset:{},disabled:false,textContent:'Detener',addEventListener:(type,fn)=>callback[type]=fn};
 const ctx={document:{getElementById:()=>button},window:{dispatchEvent:()=>{},addEventListener:()=>{},location:{reload:()=>{throw Error('NO_RELOAD')}}},
  CustomEvent:class{},AbortController,setTimeout:fn=>{timers.push(fn);return 1},clearTimeout:()=>{}};
 vm.runInNewContext(html.slice(begin,end)+
  '\n globalThis.__cancelTest={start(){isProcessing=true;localMissionAbortController=new AbortController()},finish(){isProcessing=false;localMissionAbortController=null}};',ctx);
 ctx.__cancelTest.start();callback.click();ctx.__cancelTest.finish();
 timers[0]();
 assert.equal(button.textContent,'Deteniendo...');
 assert.equal(button.dataset.cancelRecoveryReady,undefined);
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
