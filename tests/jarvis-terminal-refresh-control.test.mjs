import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
const start=html.indexOf('<script id="terminal-refresh-control">');
const end=html.indexOf('</script>',start);
const script=html.slice(start+'<script id="terminal-refresh-control">'.length,end);
const OLD='914a60d0', NEW='48a5e51f7f1f2615a55d7e20e0f54dd4009aa2f2';

function run({active=false,draft='',approve=true,sha=NEW,fetchFails=false}={}){
 const handlers={},questions=[],calls=[],alerts=[],timers=[];
 let currentSha=sha;
 const refresh={dataset:{},disabled:false,addEventListener:(name,fn)=>{handlers[name]=fn}};
 const cancel={hidden:!active},input={value:draft};
 const elements={'btn-refresh-terminal':refresh,'btn-stop-mission':cancel,'gestia-input':input};
 const document={getElementById:id=>elements[id]};
 const location={href:'http://127.0.0.1:5000/gestia-terminal.html?mobile_release='+OLD+'&safe=1',
   replace(url){calls.push({kind:'navigate',url});this.href=url;}};
 const history={state:null,replaceState(_state,_title,url){calls.push({kind:'history',url});location.href=url;}};
 const window={location,history,
   confirm:prompt=>{questions.push(prompt);return approve;},
   alert:message=>alerts.push(message),
   setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length;},
   fetch:async(url,options)=>{
     calls.push({kind:'fetch',url,options});
     if(fetchFails)throw Error('NETWORK_DOWN');
     return {ok:true,json:async()=>({git_sha:currentSha})};
   }};
 vm.runInNewContext(script,{document,window,URL,Date:{now:()=>1782672000000}});
 return {handlers,questions,calls,alerts,refresh,cancel,input,window,timers,
   setSha:value=>{currentSha=value;}};
}
const settled=()=>new Promise(resolve=>setImmediate(resolve));
const navigations=state=>state.calls.filter(x=>x.kind==='navigate');

test('refresh button stays accessible and binds before the rest of the Terminal',()=>{
 assert.match(html,/<button type="button" id="btn-refresh-terminal"[^>]*aria-label="Actualizar Terminal"/);
 assert.ok(start>0&&end>start&&start<html.indexOf('<main id="gestia-output"'));
 assert.doesNotThrow(()=>new vm.Script(script));
});
test('old bookmark URL synchronizes to actual served SHA without abandoning the page',async()=>{
 const s=run();await settled();
 assert.equal(s.refresh.dataset.refreshBound,'true');
 assert.equal(s.refresh.dataset.releaseSha,NEW);
 assert.equal(navigations(s).length,0);
 assert.equal(s.calls.filter(x=>x.kind==='history').length,1);
 const url=new URL(s.window.location.href);
 assert.equal(url.searchParams.get('mobile_release'),NEW);
 assert.equal(url.searchParams.get('safe'),'1');
 assert.match(s.refresh.title,/48a5e51f/);
 const f=s.calls.find(x=>x.kind==='fetch');
 assert.equal(f.url,'/release-manifest.json');
 assert.equal(f.options.cache,'no-store');
});
test('refresh fetches fresh release and navigates with SHA and new cache-buster',async()=>{
 const s=run();await settled();
 await s.handlers.click();
 assert.equal(navigations(s).length,1);
 const url=new URL(navigations(s)[0].url);
 assert.equal(url.searchParams.get('mobile_release'),NEW);
 assert.equal(url.searchParams.get('refresh'),'1782672000000');
 assert.equal(url.searchParams.get('safe'),'1');
 assert.equal(s.questions.length,0);
 assert.equal(s.refresh.disabled,false);
 assert.equal(s.calls.filter(x=>x.kind==='fetch').length,2);
});
test('active mission requires explicit approval and does not imply remote cancellation',async()=>{
 const no=run({active:true,approve:false});await settled();await no.handlers.click();
 assert.equal(navigations(no).length,0);
 assert.match(no.questions[0],/no confirma que la ejecución remota se detenga/);
 const yes=run({active:true,approve:true});await settled();await yes.handlers.click();
 assert.equal(navigations(yes).length,1);
 assert.doesNotMatch(script,/(?:status|reason)\\s*[:=]\\s*['"](?:VERIFIED_COMPLETE|SUCCESS|CANCELLED)/i);
});
test('draft cannot be lost silently on update',async()=>{
 const no=run({draft:'Consulta no enviada',approve:false});await settled();await no.handlers.click();
 assert.equal(navigations(no).length,0);
 assert.match(no.questions[0],/mensaje que todavía no envías se perderá/);
});
test('unverifiable or invalid release does not claim update',async()=>{
 for(const params of [{fetchFails:true},{sha:'914a60d0'}]){
   const s=run(params);await settled();
   await s.handlers.click();
   assert.equal(navigations(s).length,0);
   assert.equal(s.alerts.length,1);
   assert.match(s.alerts[0],/No se pudo confirmar el commit/);
   assert.equal(s.refresh.disabled,false);
 }
});
test('binding stays singleton even when Qwen modules fail to initialize',async()=>{
 const s=run();await settled();
 vm.runInNewContext(script,{document:{getElementById:id=>id==='btn-refresh-terminal'?s.refresh:null},window:s.window,URL});
 assert.deepEqual(Object.keys(s.handlers),['click']);
 assert.equal(s.timers.length,1);
 await s.handlers.click();
 assert.equal(navigations(s).length,1);
});

test('automatic update polls verified release and reloads only when SHA changes',async()=>{
 const s=run();await settled();
 assert.equal(s.timers.length,1);
 assert.equal(s.timers[0].ms,15000);
 await s.timers[0].fn();await settled();
 assert.equal(navigations(s).length,0);
 const LATEST='d'.repeat(40);
 s.setSha(LATEST);
 await s.timers[0].fn();await settled();
 assert.equal(navigations(s).length,1);
 assert.equal(new URL(navigations(s)[0].url).searchParams.get('mobile_release'),LATEST);
 assert.equal(s.questions.length,0);
});

test('auto-update waits for active mission, then navigates when mission finishes',async()=>{
 const s=run({active:true});await settled();
 const LATEST='e'.repeat(40);
 s.setSha(LATEST);
 await s.timers[0].fn();await settled();
 assert.equal(navigations(s).length,0);
 assert.equal(s.refresh.dataset.pendingSha,LATEST);
 assert.match(s.refresh.title,/al terminar la misión/);
 s.cancel.hidden=true;
 await s.timers[0].fn();await settled();
 assert.equal(navigations(s).length,1);
});

test('auto-update does not lose a draft or bypass explicit manual warnings',async()=>{
 const s=run({draft:'Mensaje sin enviar'});await settled();
 s.setSha('f'.repeat(40));
 await s.timers[0].fn();await settled();
 assert.equal(navigations(s).length,0);
 s.input.value='';
 await s.timers[0].fn();await settled();
 assert.equal(navigations(s).length,1);
 assert.equal(s.questions.length,0);
});
