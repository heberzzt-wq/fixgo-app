import test from 'node:test';
import assert from 'node:assert/strict';
import {createQwenAuthenticatedToolBridge,missingPublicHtmlSourceFailure} from '../jarvis-qwen-tool-bridge.js';
import {planPlatformRecovery} from '../jarvis-platform-self-healing.js';

const url='https://www.energy.gov/missing-filter-page';
const browserTool={name:'browser.inspect',mutates:false,requiresApproval:false,inputSchema:{
  type:'object',properties:{url:{type:'string'}},required:['url']}};

// This is the semantic-guarded browser actuator *presentation* observed in
// the real mobile route, NOT the raw /browser response.
const composed404={
  type:'JARVIS_CONVERSATIONAL_RESPONSE',
  kind:'JARVIS_CONVERSATIONAL_RESPONSE',
  ok:false,executionOk:false,blocked:true,status:'BROWSER_COMMAND_FAILED',
  meta:{type:'ACTUATOR_FAILURE_RESPONSE'},
  data:{ok:false,tool:'browser.inspect',status:'BROWSER_COMMAND_FAILED',
    error:'BROWSER_PUBLIC_HTML_HTTP_404'}
};
test('semantic-guarded browser actuator 404 has the physical error nested in data',()=>{
  assert.equal(missingPublicHtmlSourceFailure('browser.inspect',composed404),true);
  assert.equal(missingPublicHtmlSourceFailure('web.research',composed404),false);
  assert.equal(missingPublicHtmlSourceFailure('browser.inspect',{...composed404,ok:true}),false);
  assert.equal(missingPublicHtmlSourceFailure('browser.inspect',{...composed404,meta:{type:'OTHER'}}),false);
  assert.equal(missingPublicHtmlSourceFailure('browser.inspect',{
    ...composed404,data:{...composed404.data,error:'BROWSER_PUBLIC_HTML_HTTP_403'}}),false);
});
test('actual composed failure passes adapter boundary as HTTP_404 for host-only alternative read',async()=>{
 const identity={ok:true,principalId:'owner-fixture',tenantId:'B2C',role:'ceo'};
 const adapter=createQwenAuthenticatedToolBridge({
  toolRuntime:{list:()=>[browserTool]},
  toolsBridge:{executeMany:async()=>[structuredClone(composed404)]},
  validateAuthenticatedContext:async()=>identity,
  sessionContext:{tenantId:'B2C'},
  verifyObjectives:async()=>({ok:false}),
  hostToolPolicy:{accept:()=>true,authorize:()=>({ok:true,approved:false})}
 });
 const received=await adapter.execute({name:'browser.inspect',args:{url}},
  {authorization:identity,receipts:[]});
 assert.equal(received.ok,false);
 assert.equal(received.status,'HTTP_404');
 assert.equal(received.error.code,'HTTP_404');
 assert.equal(received.blocked,undefined);
 assert.equal(received.neverClaimedInspected,true);
 assert.equal(planPlatformRecovery({tool:browserTool,system:'browser',
  failure:received}).status,'RECOVERY_READ_REPLAN_REQUIRED');
});
