import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateManifest,renderManifest} from '../scripts/platform-master-manifest-v142.mjs';
const data=JSON.parse(readFileSync(new URL('../docs/platform-master-manifest-v142.json',import.meta.url),'utf8'));
test('October 27 GP02 and GP03 verified UI closures supersede but never erase historical failures',()=>{
 const iteration=data.latestHandoff.currentLocalEvidence.generalPurposeIteration;
 const expected=[
  ['GP02','general-0611cbda-b2bb-4870-b813-7c39fe41fab3','xlsx',3],
  ['GP03','general-8510613f-c296-424e-9030-82f9f7bba1fd','pdf',4]
 ];
 assert.equal(data.latestHandoff.asOf,'2026-10-27');
 assert.equal(data.generalPurposeAssistant.generalUseCertified,false);
 assert.equal(data.governance.productionCertified,false);
 assert.equal(iteration.uiAttempts.length,3,'legacy attempt records must remain');
 assert.equal(iteration.uiAttempts.find(x=>x.id==='GP-02').status,'PARTIAL');
 assert.equal(iteration.uiAttempts.find(x=>x.id==='GP-03').status,'FAILED_BEFORE_MISSION');
 for(const [id,missionId,format,toolCount] of expected){
  const observed=iteration.uiClosures20261027.find(x=>x.id===id);
  assert.equal(observed.status,'VERIFIED_COMPLETE');
  assert.equal(observed.missionId,missionId);
  assert.equal(observed.format,format);
  assert.equal(observed.toolsSuccessful,toolCount);
  assert.equal(observed.physicallyDownloadedByOwner,true);
  assert.match(observed.sha256,/^[0-9a-f]{64}$/);
  assert.ok(observed.bytes>1000);
  assert.equal(observed.productionCertified,false);
  assert.ok(iteration.uiRetests.some(x=>x.id===id&&x.status==='VERIFIED_COMPLETE'&&x.missionId===missionId));
  for(const type of ['generar','calcular','documentos','verificacion','entrega']){
   const capability=data.generalPurposeAssistant.capabilities.find(x=>x.id===type);
   assert.equal(capability.demonstratedUI.status,'PARCIAL');
   assert.ok(capability.demonstratedUI.receipts.some(r=>r.kind==='UI_MISSION'&&r.missionId===missionId&&r.outcome==='COMPLETED'));
  }
 }
 assert.ok(data.latestHandoff.nextSteps.some(x=>x.includes('JARVIS-04')));
 assert.equal(data.generalPurposeAssistant.capabilities.length,17);
 assert.equal(data.workstreams.length,57);
 assert.equal(validateManifest(data).ok,true);
 const generated=renderManifest(data);
 assert.match(generated,/general-0611cbda/);
 assert.match(generated,/general-8510613f/);
 assert.match(generated,/GP02 y GP03/);
});
