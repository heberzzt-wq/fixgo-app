import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planPlatformRecovery} from '../jarvis-platform-self-healing.js';

const read={name:'repo.read',investigationReadOnly:true,mutates:false,requiresApproval:false};
const inspect={name:'browser.inspect',investigationReadOnly:true,mutates:false,requiresApproval:false};

test('fixed error codes attach to real host recovery decisions, without altering authority',()=>{
 const relay=planPlatformRecovery({system:'relay',tool:read,
   failure:{ok:false,status:'JARVIS_RELAY_WORKSTATION_UNAVAILABLE'}});
 assert.equal(relay.incidentCode,'JAR-201');
 assert.equal(relay.autoExecute,false);
 assert.equal(relay.recoveryDisposition,'OPERATOR_REVIEW_REQUIRED');
 const html=planPlatformRecovery({system:'browser',tool:inspect,
   failure:{ok:false,status:'PUBLIC_HTML_ACCESS_DENIED'}});
 assert.equal(html.incidentCode,'JAR-301');
 assert.equal(html.status,'RECOVERY_READ_REPLAN_REQUIRED');
 assert.equal(html.autoExecute,false);
 assert.equal(html.recoveryDisposition,'ALTERNATIVE_SOURCE_REQUIRED');
 const size=planPlatformRecovery({system:'relay',tool:read,
   failure:{ok:false,status:'JARVIS_RELAY_RESPONSE_TOO_LARGE'}});
 assert.equal(size.incidentCode,'JAR-204');
 assert.equal(size.autoExecute,false);
});

test('permission denial, writes and expired session NEVER become auto-repair grants',()=>{
 for(const tool of [read,{...read,name:'repo.write',mutates:true},
   {...read,name:'payment.charge',mutates:true}]) {
  const failure={ok:false,status:'JARVIS_RELAY_OWNER_REQUIRED'};
  const plan=planPlatformRecovery({system:'security',tool,failure});
  assert.equal(plan.incidentCode,'JAR-206');
  assert.equal(plan.autoExecute,false);
  assert.ok(['SECURITY_HOLD','OPERATOR_REVIEW_REQUIRED'].includes(plan.recoveryDisposition));
 }
 const rejected=planPlatformRecovery({system:'browser',tool:inspect,failure:{ok:false,status:'HTTP_403'}});
 assert.equal(rejected.autoExecute,false);
 assert.equal(rejected.recoveryDisposition,'SECURITY_HOLD');
});

test('transient read retry retains existing independent authorization and is still bounded',()=>{
 const first=planPlatformRecovery({system:'repo',tool:read,
   failure:{ok:false,status:'ETIMEDOUT'},attempt:1});
 assert.equal(first.autoExecute,true);
 assert.equal(first.maxAttempts,2);
 assert.equal(first.recoveryDisposition,'BOUNDED_AUTHORIZED_READ_RETRY');
 const second=planPlatformRecovery({system:'repo',tool:read,
   failure:{ok:false,status:'ETIMEDOUT'},attempt:2});
 assert.equal(second.autoExecute,false);
 assert.equal(second.recoveryDisposition,'OPERATOR_REVIEW_REQUIRED');
});

test('the existing Qwen read-only loop records the code, not the authorization itself',()=>{
 const code=readFileSync('jarvis-qwen-direct-cycle.js','utf8');
 assert.match(code,/incidentCode:recoveryPlan.incidentCode/);
 assert.match(code,/disposition:recoveryPlan.recoveryDisposition/);
 assert.match(code,/runAuthenticatedReadRecovery\(/);
 assert.match(code,/independent/i);
});
