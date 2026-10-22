import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runIsolatedFixtureVerification,saveIsolatedRepairEvidence,
 ISOLATED_IMAGE_SHA,CONTROLLED_FIXTURE} from '../scripts/jarvis-isolated-patch-probe.mjs';
import {assertIsolatedEvidenceRecord,inspectArchivedIsolatedEvidence,
 createIsolatedEvidenceReadHandler} from '../jarvis-isolated-evidence-readback.js';

const src=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const original=fs.readFileSync(path.join(src,CONTROLLED_FIXTURE),'utf8');
const hash=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const missionId='general-38f6031b-b7cc-4ead-b056-43d349e9fa3a';
const search='return Number((amount-rebate).toFixed(2));';
const replacement="if(rebate>amount)throw Error('REBATE_EXCEEDS_AMOUNT');\n  "+search;
function genuinePreview(){
 const file=CONTROLLED_FIXTURE;
 return {status:'SUCCESS',reason:'VERIFIED_COMPLETE',receipts:[
  {name:'repo.read',ok:true,args:{file},observation:{ok:true,verifiedRead:{file,content:original}}},
  {name:'tests.run',ok:true,args:{command:'check:syntax'},observation:{ok:true,status:'PASSED'}},
  {name:'repo.prepareWrite',ok:true,args:{file,operation:'replace',search,replace:replacement,matchCount:1},
   observation:{status:'WRITE_PREPARED',file,written:false,requiresApproval:true,
    caseId:missionId,objectiveId:'QWEN_PREVIEW_'+missionId,
    fingerprint:'a'.repeat(64),snapshotSha256:hash(original),
    expectedSha256:hash(original.replace(search,replacement))}}
 ]};
}
function tempRepo(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-isolated-readback-'));
 const dir=path.join(root,'tests','fixtures');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(root,CONTROLLED_FIXTURE),original);
 return root;
}
function simulatePhysicalDocker(){
 let runs=0;
 return (_name,args)=>{
  if(args[0]==='info')return {status:0,stdout:'29.9.2\n'};
  if(args[0]==='image')return {status:0,stdout:ISOLATED_IMAGE_SHA+'\n'};
  runs++;
  return runs===1
   ?{status:1,stdout:'TAP version 13\nnot ok 4 - rebate larger than amount is rejected\n# tests 4\n# pass 3\n# fail 1\n'}
   :{status:0,stdout:'TAP version 13\nok 4 - rebate larger than amount is rejected\n# tests 4\n# pass 4\n# fail 0\n'};
 };
}
function res(){
 return {statusCode:200,payload:null,headers:{},status(v){this.statusCode=v;return this},
 set(k,v){this.headers[k]=v;return this},json(v){this.payload=v;return this}};
}
test('readback independently validates a host-archived fixture run without granting production writes',()=>{
 const root=tempRepo();
 try{
  const receipt=genuinePreview();
  const physical=runIsolatedFixtureVerification(receipt,{root,run:simulatePhysicalDocker()});
  assert.equal(physical.verified,true);
  const saved=saveIsolatedRepairEvidence(receipt,physical,{root});
  const proof=inspectArchivedIsolatedEvidence({root,missionId});
  assert.equal(proof.ok,true);
  assert.equal(proof.status,'ISOLATED_FIXTURE_BEFORE_AFTER_VERIFIED');
  assert.equal(proof.evidenceSha256,saved.evidenceSha256);
  assert.equal(proof.patchApplied,false);
  assert.equal(proof.productionRepairCertified,false);
  assert.equal(proof.humanApprovalStillRequired,true);
  assert.equal(proof.scope,'controlled-fixture-only');
  assert.equal(proof.before.passed,3);
  assert.equal(proof.after.passed,4);
  assert.equal(fs.readFileSync(path.join(root,CONTROLLED_FIXTURE),'utf8'),original);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('missing, forged, or stale archive does not grant verification',()=>{
 const root=tempRepo();
 try{
  assert.equal(inspectArchivedIsolatedEvidence({root,missionId}).status,'ISOLATED_EVIDENCE_NOT_ARCHIVED');
  const receipt=genuinePreview(),run=runIsolatedFixtureVerification(receipt,{root,run:simulatePhysicalDocker()});
  const saved=saveIsolatedRepairEvidence(receipt,run,{root});
  const archive=JSON.parse(fs.readFileSync(saved.path,'utf8'));
  for(const mutate of [
   x=>x.patchApplied=true,
   x=>x.productionRepairCertified=true,
   x=>x.before.stdout=x.before.stdout.replace('not ok 4','ok 4'),
   x=>x.evidenceSha256='f'.repeat(64),
   x=>x.imageId='sha256:'+('b'.repeat(64))
  ]){
   const clone=structuredClone(archive);mutate(clone);
   assert.throws(()=>assertIsolatedEvidenceRecord(clone,missionId,{root}));
  }
  fs.writeFileSync(saved.path,JSON.stringify({...archive,patchApplied:true}));
  assert.equal(inspectArchivedIsolatedEvidence({root,missionId}).status,'ISOLATED_EVIDENCE_UNVERIFIED');
  assert.throws(()=>inspectArchivedIsolatedEvidence({root,missionId:'../other'}),/MISSION_INVALID/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('read-only endpoint blocks unauthenticated and invalid requests and gives only bounded summary',async()=>{
 const root=tempRepo();
 try{
  const receipt=genuinePreview(),run=runIsolatedFixtureVerification(receipt,{root,run:simulatePhysicalDocker()});
  saveIsolatedRepairEvidence(receipt,run,{root});
  const denied=createIsolatedEvidenceReadHandler({root,authorize:async(_req,response)=>{
   response.status(401).json({ok:false});return false;
  }});
  const r1=res();await denied({body:{missionId}},r1);
  assert.equal(r1.statusCode,401);
  const handler=createIsolatedEvidenceReadHandler({root,authorize:async()=>true});
  const bad=res();await handler({body:{missionId,approved:true}},bad);
  assert.equal(bad.statusCode,400);
  const good=res();await handler({body:{missionId}},good);
  assert.equal(good.statusCode,200);
  assert.equal(good.payload.ok,true);
  assert.equal(good.payload.patchApplied,false);
  assert.equal(good.payload.before.stdout,undefined);
  assert.equal(good.headers['Cache-Control'],'no-store');
  assert.throws(()=>createIsolatedEvidenceReadHandler({root}),/AUTH_REQUIRED/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('official bridge mounts isolated readback only when local Qwen is enabled and enforces owner token',()=>{
 const text=fs.readFileSync(new URL('../jarvis-fs-bridge.js',import.meta.url),'utf8');
 assert.match(text,/if\(qwenEnabled\)app\.post\('\/qwen-isolated\/evidence'/);
 assert.match(text,/verifyIdToken:verifyBrowserIdToken,ownerUid:workstationRelay\.ownerUid/);
});
