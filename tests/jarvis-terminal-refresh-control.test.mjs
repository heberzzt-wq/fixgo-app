import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
const start=html.indexOf('<script id="terminal-refresh-control">');
const end=html.indexOf('</script>',start);
const script=html.slice(start+'<script id="terminal-refresh-control">'.length,end);
function run({active=false,draft='',approve=true}={}){
 const handlers={},questions=[],calls=[];
 const refresh={dataset:{},addEventListener:(name,fn)=>{handlers[name]=fn}};
 const cancel={hidden:!active};
 const input={value:draft};
 const elements={'btn-refresh-terminal':refresh,'btn-stop-mission':cancel,'gestia-input':input};
 const document={getElementById:id=>elements[id]};
 const window={confirm:text=>{questions.push(text);return approve},location:{reload:()=>calls.push('reload')}};
 vm.runInNewContext(script,{document,window});
 return {handlers,questions,calls,refresh,cancel,input,window};
}
test('PWA Terminal has a visible, accessible header refresh button and its own early handler',()=>{
 assert.match(html,/<button type="button" id="btn-refresh-terminal"[^>]*aria-label="Actualizar Terminal"/);
 assert.match(html,/<i class="fa-solid fa-rotate-right"/);
 assert.ok(start>0&&end>start);
 assert.ok(start<html.indexOf('<main id="gestia-output"'),'the button works before the rest of the modules initialize');
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.match(html,/\.terminal-identity h1 \{[^}]*text-overflow: ellipsis/);
});
test('idle refresh reloads the installed app without closing a tab or making a request',()=>{
 const state=run();assert.equal(state.refresh.dataset.refreshBound,'true');
 state.handlers.click();
 assert.deepEqual(state.calls,['reload']);
 assert.deepEqual(state.questions,[]);
});
test('an active mission requires owner confirmation and never falsely certifies cancellation',()=>{
 const denied=run({active:true,approve:false});denied.handlers.click();
 assert.deepEqual(denied.calls,[]);
 assert.equal(denied.questions.length,1);
 assert.match(denied.questions[0],/no confirma que la ejecución remota se detenga/);
 const permitted=run({active:true,approve:true});permitted.handlers.click();
 assert.deepEqual(permitted.calls,['reload']);
 assert.equal(permitted.questions.length,1);
 assert.doesNotMatch(script,/(?:status|reason)\s*[:=]\s*['"](?:VERIFIED_COMPLETE|SUCCESS|CANCELLED)/i);
});
test('a draft cannot be lost silently on refresh',()=>{
 const denied=run({draft:'Mi consulta aún sin enviar',approve:false});
 denied.handlers.click();assert.deepEqual(denied.calls,[]);
 assert.match(denied.questions[0],/mensaje que todavía no envías se perderá/);
 const accepted=run({draft:'Mi consulta aún sin enviar',approve:true});
 accepted.handlers.click();assert.deepEqual(accepted.calls,['reload']);
});
test('the refresh handler binds only once and remains accessible when the mission script stalls',()=>{
 const state=run();
 const bindings=Object.keys(state.handlers);
 assert.deepEqual(bindings,['click']);
 vm.runInNewContext(script,{document:{getElementById:id=>id==='btn-refresh-terminal'?state.refresh:null},window:state.window});
 assert.equal(state.refresh.dataset.refreshBound,'true');
 state.handlers.click();assert.deepEqual(state.calls,['reload']);
});
