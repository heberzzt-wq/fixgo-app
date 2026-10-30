import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
const begin=html.indexOf('    let isProcessing = false;');
const end=html.indexOf('    let activeUtterances = 0;',begin);
test('stalled Stop recovers on Android focus when background timers were throttled',()=>{
 assert.ok(begin>0 && end>begin);
 const handlers={},windowHandlers={},documentHandlers={},timeouts=[];
 let timestamp=1000,reloads=0,events=0;
 const button={dataset:{},hidden:false,disabled:false,textContent:'Detener',title:'',
   addEventListener:(key,fn)=>handlers[key]=fn};
 const document={hidden:false,getElementById:()=>button,
   addEventListener:(key,fn)=>documentHandlers[key]=fn};
 const window={addEventListener:(key,fn)=>windowHandlers[key]=fn,
   dispatchEvent:()=>events++,location:{reload:()=>reloads++}};
 const context={window,document,AbortController,Date:{now:()=>timestamp},
   CustomEvent:class{},setTimeout:(fn,ms)=>{assert.equal(ms,8000);timeouts.push(fn);return 1},
   clearTimeout:()=>{}};
 vm.runInNewContext(html.slice(begin,end)+
  '\n globalThis.cancellation={start(){isProcessing=true;localMissionAbortController=new AbortController()},finish(){isProcessing=false;localMissionAbortController=null;missionCancelRecoveryDueAt=0;}};',context);
 assert.equal(typeof windowHandlers.focus,'function');
 assert.equal(typeof documentHandlers.visibilitychange,'function');
 context.cancellation.start();handlers.click();
 assert.equal(events,1);
 assert.equal(button.textContent,'Deteniendo...');
 assert.equal(button.disabled,true);
 timestamp=8999;windowHandlers.focus();
 assert.equal(button.textContent,'Deteniendo...','must not release before bounded interval');
 assert.equal(reloads,0);
 timestamp=9000;windowHandlers.focus();
 assert.equal(button.textContent,'Recargar Terminal');
 assert.equal(button.dataset.cancelRecoveryReady,'true');
 assert.equal(button.disabled,false);
 assert.match(button.title,/no acredita detener una ejecución remota/);
 assert.equal(reloads,0,'no automatic reload or false remote cancellation');
 handlers.click();assert.equal(reloads,1,'explicit user action navigates');
});
test('returning to visible tab after cancel deadline offers recovery but never after mission settles',()=>{
 const clicks={},events={},onPage={};let t=0;
 const button={dataset:{},disabled:false,textContent:'Detener',title:'',
   addEventListener:(name,fn)=>clicks[name]=fn};
 const document={hidden:false,getElementById:()=>button,
   addEventListener:(name,fn)=>events[name]=fn};
 const window={addEventListener:(name,fn)=>onPage[name]=fn,dispatchEvent:()=>{},
   location:{reload:()=>{throw Error('NO_AUTO_RELOAD')}}};
 const ctx={document,window,AbortController,Date:{now:()=>t},CustomEvent:class{},
   setTimeout:()=>1,clearTimeout:()=>{}};
 vm.runInNewContext(html.slice(begin,end)+
  '\n globalThis.cancellation={start(){isProcessing=true;localMissionAbortController=new AbortController()},finish(){isProcessing=false;localMissionAbortController=null;missionCancelRecoveryDueAt=0;}};',ctx);
 ctx.cancellation.start();clicks.click();
 t=10000;document.hidden=true;events.visibilitychange();
 assert.equal(button.textContent,'Deteniendo...');
 document.hidden=false;events.visibilitychange();
 assert.equal(button.textContent,'Recargar Terminal');
 ctx.cancellation.finish();
 button.textContent='Detener';
 onPage.focus();
 events.visibilitychange();
 assert.equal(button.textContent,'Detener','stale visibility change cannot resurrect a completed cancel');
});
