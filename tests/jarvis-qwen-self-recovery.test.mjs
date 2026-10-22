import test from 'node:test';
import assert from 'node:assert/strict';
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';

const read={name:'repo.read',investigationReadOnly:true,mutates:false,requiresApproval:false,
 inputSchema:{type:'object',properties:{file:{type:'string',const:'tests/fixtures/v142-rebate-preview.js'}},
  required:['file'],additionalProperties:false}};
const call={name:'repo.read',args:{file:'tests/fixtures/v142-rebate-preview.js'}};
const run=(options={})=>runQwenAuthorizedCycle({
 instruction:'Audita codigo de solo lectura sin modificar archivos',
 catalog:[read],maximumSteps:5,stepLimit:12,repairIncomplete:true,
 catalogForEvidence:ts=>ts,authorize:async()=>({ok:true}),
 selectNextAction:async({observations})=>observations.length?{finish:true,report:'Archivo verificado mediante recibo de lectura'}:{toolCall:call},
 verifyCompletion:async({receipts})=>({ok:receipts.length===1&&receipts[0].ok===true}),
 ...options
});
test('one transient read can recover after fresh independent authorization and keep the original error',async()=>{
 let executions=0,authorizations=0;
 const events=[];
 const result=await run({onProgress:e=>events.push(e),
  authorize:async()=>{authorizations++;return {ok:true,approved:false};},
  execute:async()=>++executions===1
    ?{ok:false,status:'NETWORK_TRANSIENT',error:{code:'NETWORK_TRANSIENT'}}
    :{ok:true,status:'READ_VERIFIED',verifiedRead:{file:call.args.file,content:'fixture source'}},
 });
 assert.equal(result.status,'SUCCESS',result.reason);
 assert.equal(result.reason,'VERIFIED_COMPLETE');
 assert.equal(executions,2);
 assert.equal(authorizations,2);
 assert.equal(result.receipts.length,1);
 assert.equal(result.receipts[0].ok,true);
 assert.equal(result.receipts[0].observation.recovery.attempts,2);
 assert.equal(result.receipts[0].observation.recovery.transientError,'NETWORK_TRANSIENT');
 assert.equal(result.receipts[0].observation.recovery.finalExecutionSucceeded,true);
 assert.ok(events.some(e=>e.phase==='TOOL_RETRY'&&e.attempt===2));
});
test('second transient failure stops at two executions and never fabricates success',async()=>{
 let executions=0;
 const result=await run({selectNextAction:async()=>({toolCall:call}),
  execute:async()=>{executions++;return {ok:false,status:'ECONNRESET',error:{code:'ECONNRESET'}};}});
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.reason,'READ_TOOL_NOT_SUCCESSFUL');
 assert.equal(executions,2);
 assert.equal(result.receipts.length,1);
 assert.equal(result.receipts[0].ok,false);
 assert.equal(result.receipts[0].observation.recovery.attempts,2);
});
test('denied permission and content-validation error never retry automatically',async()=>{
 for(const bad of [
  {ok:false,blocked:true,status:'PERMISSION_DENIED',error:{code:'permission-denied'}},
  {ok:false,status:'XML_INVALID',error:{code:'XML_INVALID'}},
  {ok:false,status:'DOCUMENT_VALIDATION_FAILED',error:{code:'DOCUMENT_VALIDATION_FAILED'}}
 ]){
  let executions=0,authorizations=0;
  const result=await run({
   selectNextAction:async()=>({toolCall:call}),
   authorize:async()=>{authorizations++;return {ok:true};},
   execute:async()=>{executions++;return structuredClone(bad);}
  });
  assert.equal(result.status,'PARTIAL');
  assert.equal(result.reason,'READ_TOOL_NOT_SUCCESSFUL');
  assert.equal(executions,1,bad.status);
  assert.equal(authorizations,1,bad.status);
 }
});
test('read retry requires fresh authorization; previously approved token is insufficient',async()=>{
 let executions=0,authorizations=0;
 const result=await run({
  selectNextAction:async()=>({toolCall:call}),
  authorize:async()=>({ok:++authorizations===1,reason:'SESSION_EXPIRED'}),
  execute:async()=>{executions++;return {ok:false,status:'NETWORK_TRANSIENT',error:{code:'NETWORK_TRANSIENT'}};}
 });
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.reason,'INDEPENDENT_AUTHORIZATION_DENIED');
 assert.equal(executions,1);
 assert.equal(authorizations,2);
 assert.equal(result.receipts[0].observation.recovery.retryBlocked,true);
});
test('mutating and approval-required tools cannot enter transient retry path',async()=>{
 for(const tool of [
  {name:'artifact.write',mutates:true,requiresApproval:false},
  {name:'paid.external',mutates:false,requiresApproval:true}
 ]){
  const unsafe={...read,...tool};
  let executions=0;
  const r=await run({catalog:[unsafe],catalogForEvidence:t=>t,
   selectNextAction:async()=>({toolCall:{name:unsafe.name,args:call.args}}),
   execute:async()=>{executions++;return {ok:false,status:'NETWORK_TRANSIENT',error:{code:'NETWORK_TRANSIENT'}};}
  });
  assert.equal(r.status,'PARTIAL');
  assert.equal(executions,1,tool.name);
 }
});

test('a thrown transient transport error is recovered once; a thrown nontransient error is not retried',async()=>{
 let attempts=0,permissions=0;
 const success=await run({
  authorize:async()=>({ok:++permissions<=2}),
  execute:async()=>{attempts++;if(attempts===1)throw Object.assign(new Error('socket reset'),{code:'ECONNRESET'});
   return {ok:true,status:'READ_VERIFIED',verifiedRead:{file:call.args.file,content:'verified'}};}
 });
 assert.equal(success.status,'SUCCESS',success.reason);
 assert.equal(attempts,2);
 assert.equal(permissions,2);
 assert.equal(success.receipts[0].observation.recovery.transientError,'ECONNRESET');
 attempts=0;
 const blocked=await run({selectNextAction:async()=>({toolCall:call}),
  execute:async()=>{attempts++;throw Error('INVALID_XML');}});
 assert.equal(blocked.status,'PARTIAL');
 assert.equal(blocked.reason,'READ_TOOL_EXECUTION_FAILED');
 assert.equal(attempts,1);
});
