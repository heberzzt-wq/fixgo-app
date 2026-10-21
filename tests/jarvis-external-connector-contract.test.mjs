import test from 'node:test';
import assert from 'node:assert/strict';
import {
 EXTERNAL_CONNECTOR_CATALOG,pendingExternalConnectorInventory,proposedExternalOperation
} from '../jarvis-external-connector-contract.js';
import {inspectLocalConnectors} from '../jarvis-fs-bridge.js';

test('all external providers are distinguishable from unverified social media labels',()=>{
 const inventory=pendingExternalConnectorInventory();
 assert.equal(inventory.verified,false);
 assert.equal(inventory.connectedCount,0);
 assert.equal(inventory.connectorCount,8);
 assert.deepEqual(inventory.connectors.map(c=>c.id),[
  'gmail','microsoft-outlook','zoho-mail','facebook-pages',
  'instagram-business','google-drive','google-calendar','tiktok-business'
 ]);
 for(const c of inventory.connectors){
  assert.equal(c.status,'OAUTH_NOT_CONFIGURED');
  assert.equal(c.connected,false);
  assert.equal(c.readAllowed,false);
  assert.equal(c.writeAllowed,false);
  assert.equal(c.tokenPresent,false);
  assert.equal(c.userAuthorizationRequired,true);
  assert.equal(c.humanApprovalRequiredForWrites,true);
  assert.deepEqual(c.availableOperations,[]);
  assert.equal(c.evidence,null);
 }
});
test('no external operation executes from registration or model-supplied status alone',()=>{
 for(const c of EXTERNAL_CONNECTOR_CATALOG)
  for(const operation of c.operations){
   const decision=proposedExternalOperation(c.id,operation);
   assert.equal(decision.ok,false,c.id+' '+operation);
   assert.equal(decision.reason,'EXTERNAL_CONNECTOR_NOT_AUTHORIZED');
  }
 assert.equal(proposedExternalOperation('unknown','mail.send').reason,'EXTERNAL_OPERATION_NOT_REGISTERED');
});
test('forged provider availability never authorizes even a read until a host OAuth adapter exists',()=>{
 const state=pendingExternalConnectorInventory();
 const outlook=state.connectors.find(c=>c.id==='microsoft-outlook');
 outlook.connected=true;outlook.verified=true;outlook.availableOperations=['mail.read','mail.send'];
 assert.equal(proposedExternalOperation('microsoft-outlook','mail.read',state).reason,
  'EXTERNAL_CONNECTOR_NOT_AUTHORIZED');
 assert.equal(proposedExternalOperation('microsoft-outlook','mail.send',state).reason,
  'EXTERNAL_CONNECTOR_NOT_AUTHORIZED');
});
test('existing GitHub/Firebase connector probes retain core status while reporting external OAuth gaps',async()=>{
 const state=await inspectLocalConnectors({root:process.cwd(),gitProbe:async()=>true,
  fetchImpl:async()=>({ok:true,status:200})});
 assert.equal(state.status,'CONNECTORS_VERIFIED');
 assert.equal(state.connectedCount,2);
 assert.deepEqual(state.connectors.map(x=>x.id),['github','firebase']);
 assert.equal(state.externalReadiness.status,'EXTERNAL_OAUTH_AUTHORIZATION_REQUIRED');
 assert.equal(state.externalReadiness.connectedCount,0);
 assert.equal(state.externalReadiness.connectorCount,8);
});
