import test from 'node:test';
import assert from 'node:assert/strict';
import {planPlatformRecovery,runAuthenticatedReadRecovery} from '../jarvis-platform-self-healing.js';
import {prepareBoundedXmlArtifact,verifyStructuredArtifactOutcome} from '../jarvis-structured-artifact-recovery.js';

test('central platform healing policy covers safe tools, documents, services, OAuth and prohibited writes',()=>{
 const read={name:'repo.read',mutates:false,requiresApproval:false};
 const permitted=planPlatformRecovery({system:'repo',tool:read,failure:{ok:false,status:'NETWORK_TRANSIENT'}});
 assert.equal(permitted.action,'REAUTHORIZE_AND_RETRY_READ');
 assert.equal(permitted.autoExecute,true);
 assert.equal(permitted.maxAttempts,2);
 const exhausted=planPlatformRecovery({system:'repo',tool:read,attempt:2,
   failure:{ok:false,status:'NETWORK_TRANSIENT'}});
 assert.equal(exhausted.autoExecute,false);
 const document=planPlatformRecovery({system:'documents',tool:{name:'document.create'},
  format:'xml',output:'.jarvis-artifacts/qwen-general/general-38f6031b-b7cc-4ead-b056-43d349e9fa3a/data.xml',
  failure:{ok:false,status:'XML_INVALID'}});
 assert.equal(document.status,'RECOVERY_REGENERATE_ARTIFACT_PROPOSAL');
 assert.equal(document.autoExecute,false);
 assert.equal(document.keepOriginal,true);
 assert.equal(document.physicalRevalidationRequired,true);
 const service=planPlatformRecovery({system:'bridge',tool:{name:'system.health'},
  failure:{ok:false,status:'BRIDGE_NOT_HEALTHY'}});
 assert.equal(service.action,'DELEGATE_TO_OWNED_SUPERVISOR');
 assert.equal(service.autoExecute,false);
 const oauth=planPlatformRecovery({system:'facebook',tool:{name:'account.read'},
  failure:{ok:false,status:'OAUTH_TOKEN_EXPIRED'}});
 assert.equal(oauth.action,'REQUEST_FRESH_OWNER_OAUTH');
 assert.equal(oauth.requiresApproval,true);
 for(const tool of [{name:'repo.write'},{name:'payment.charge'},{name:'gmail.send'},
   {name:'firebase.deploy'},{name:'social.publish'},
   {name:'artifact.read',mutates:true},{name:'artifact.read',requiresApproval:true}]){
  const result=planPlatformRecovery({system:'any',tool,failure:{ok:false,status:'NETWORK_TRANSIENT'}});
  assert.equal(result.autoExecute,false,tool.name);
  assert.equal(result.status,'RECOVERY_SECURITY_BLOCKED',tool.name);
 }
 for(const code of ['PERMISSION_DENIED','UNAUTHORIZED','TENANT_SCOPE_DENIED','HTTP_403']){
  assert.equal(planPlatformRecovery({system:'repo',tool:read,
   failure:{ok:false,status:code}}).status,'RECOVERY_SECURITY_BLOCKED');
 }
});
test('recovery executor checks independent authorization and preserves receipts, without selecting mutating tools',async()=>{
 const call={name:'repo.read',args:{file:'tests/fixtures/v142-rebate-preview.js'}};
 const tool={name:call.name,mutates:false,requiresApproval:false};
 const plan=planPlatformRecovery({tool,failure:{ok:false,status:'ETIMEDOUT'}});
 let authorized=0,executed=0;
 const returned=await runAuthenticatedReadRecovery({plan,call,tool,
  authorize:async()=>{authorized++;return {ok:true,principalId:'owner'};},
  execute:async(_call,opts)=>{executed++;assert.equal(opts.receipts.length,1);
   return {ok:true,status:'VERIFIED_SOURCE'};},
  receipts:[{name:'previous',ok:true}]});
 assert.equal(returned.ok,true);
 assert.equal(returned.attempts,2);
 assert.equal(authorized,1);
 assert.equal(executed,1);
 const denied=await runAuthenticatedReadRecovery({plan,call,tool,authorize:async()=>({ok:false}),
   execute:async()=>{throw Error('should never execute');}});
 assert.equal(denied.status,'RECOVERY_REAUTHORIZATION_DENIED');
 const blocked=await runAuthenticatedReadRecovery({plan,call,tool:{...tool,mutates:true},
   authorize:async()=>({ok:true}),execute:async()=>({ok:true})});
 assert.equal(blocked.status,'RECOVERY_NOT_AUTHORIZED');
});
test('host physically validates XML and only autocorrects unescaped ampersands in text',()=>{
 const original='<document><cliente>Tom & Jerry</cliente><monto>100</monto></document>';
 const result=prepareBoundedXmlArtifact(original);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.status,'XML_TEXT_ENTITY_AUTO_REPAIRED');
 assert.equal(result.recovery.attempts,2);
 assert.equal(result.recovery.escapedAmpersands,1);
 assert.equal(result.content,'<document><cliente>Tom &amp; Jerry</cliente><monto>100</monto></document>');
 assert.equal(verifyStructuredArtifactOutcome({format:'xml',source:original,result}),true);
 assert.notEqual(result.finalSha256,result.sourceSha256);
 const already=prepareBoundedXmlArtifact('<document><cliente>Tom &amp; Jerry</cliente></document>');
 assert.equal(already.status,'XML_VERIFIED');
 assert.equal(already.recovery.attempts,1);
 for(const invalid of [
  '<document><cliente></document>',
  '<!DOCTYPE data [<!ENTITY ext SYSTEM "file:///etc/passwd">]><data>&ext;</data>',
  '<document><cliente a="Tom & Jerry">ok</cliente></document>'
 ])assert.equal(prepareBoundedXmlArtifact(invalid).ok,false,invalid);
});

test('XML repair backend must not be advertised as a certified Terminal download until UI supports it',async()=>{
 const {requiredDeliveryFormats}=await import('../modules/terminal/qwen-general-contract.js');
 const {verifiedDownloadRows}=await import('../modules/terminal/qwen-download-ui.js');
 const request='Crea un archivo XML descargable con datos ficticios';
 assert.deepEqual(requiredDeliveryFormats(request),[]);
 assert.deepEqual(verifiedDownloadRows({status:'PARTIAL',receipts:[]}),[]);
});

test('404 source error requests bounded replanning without retry, permissions or mutation',()=>{
 const read={name:'repo.read',mutates:false,requiresApproval:false};
 const recovery=planPlatformRecovery({system:'repo',tool:read,failure:{ok:false,status:'REPOSITORY_PATH_NOT_FOUND'}});
 assert.equal(recovery.status,'RECOVERY_READ_REPLAN_REQUIRED');
 assert.equal(recovery.autoExecute,false);
 assert.equal(recovery.action,'SELECT_DIFFERENT_AUTHORIZED_READ');
 assert.equal(planPlatformRecovery({tool:read,failure:{ok:false,status:'HTTP_404'},attempt:2}).autoExecute,false);
 assert.equal(planPlatformRecovery({tool:{...read,mutates:true},failure:{ok:false,status:'HTTP_404'}}).status,'RECOVERY_SECURITY_BLOCKED');
 assert.equal(planPlatformRecovery({tool:read,failure:{ok:false,status:'HTTP_403'}}).status,'RECOVERY_SECURITY_BLOCKED');
});
