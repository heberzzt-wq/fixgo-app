// V142 fail-closed, non-production Docker probe. Not an arbitrary Qwen shell runner.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const CONTROLLED_FIXTURE='tests/fixtures/v142-rebate-preview.js';
export const ISOLATED_IMAGE='node:24-alpine';
// Pinned to the Linux image physically downloaded and inspected on adjunto-jarvis.
export const ISOLATED_IMAGE_SHA='sha256:feb76650b7195319268c59cb2d419c732d6c499b13bf5296f16ab59eb1f0a4f3';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=text=>crypto.createHash('sha256').update(text,'utf8').digest('hex');
const digest=x=>/^[a-f0-9]{64}$/i.test(String(x||''));
const outcome=x=>({exitCode:x.status,signal:x.signal||null,stdout:String(x.stdout||'').slice(-1800),stderr:String(x.stderr||'').slice(-1200)});

// Node 24 may emit TAP in non-interactive runs or its Unicode "spec" reporter
// on a Windows terminal. Count only anchored runner summary lines and the
// exact regression case; unrelated failures must never certify a repair.
export function parseIsolatedTestReport(output=''){
 const raw=String(output||'');

 const failure=/^(?:not ok 4 - |\u2716 )rebate larger than amount is rejected(?: \([^\r\n]*\))?\r?$/m;
 const success=/^(?:ok 4 - |\u2714 )rebate larger than amount is rejected(?: \([^\r\n]*\))?\r?$/m;
 const count=name=>new RegExp('^(?:# |\\u2139 )?'+name+'\\r?$','m').test(raw);
 const counts={tests4:count('tests 4'),pass3:count('pass 3'),pass4:count('pass 4'),fail1:count('fail 1'),fail0:count('fail 0')};
 return {targetFailure:failure.test(raw),targetPass:success.test(raw),counts};
}
const testSource=[
 "import test from 'node:test';",
 "import assert from 'node:assert/strict';",
 "import {applyRebate} from './rebate.mjs';",
 "test('ordinary rebate is deterministic',()=>assert.equal(applyRebate(10,3),7));",
 "test('zero rebate preserves amount',()=>assert.equal(applyRebate(10,0),10));",
 "test('negative amounts are rejected',()=>assert.throws(()=>applyRebate(-1,0),/INVALID_AMOUNT/));",
 "test('rebate larger than amount is rejected',()=>assert.throws(()=>applyRebate(10,20),/REBATE_EXCEEDS_AMOUNT/));",
 ''].join('\n');

export function verifyPreparedFixture(source,receipt){
 const all=Array.isArray(receipt?.receipts)?receipt.receipts:[];
 const patch=all.findLast(r=>r?.ok===true&&r?.name==='repo.prepareWrite'&&r.observation?.status==='WRITE_PREPARED');
 if(!patch||patch.args?.file!==CONTROLLED_FIXTURE||
    patch.observation?.file!==CONTROLLED_FIXTURE||
    patch.args.operation!=='replace'||patch.args.matchCount!==1||
    patch.observation.written!==false||patch.observation.requiresApproval!==true||
    !digest(patch.observation.fingerprint)||!digest(patch.observation.snapshotSha256)||
    !digest(patch.observation.expectedSha256)||
    typeof patch.args.search!=='string'||typeof patch.args.replace!=='string'||
    patch.args.search.length<3||patch.args.search.length>2000||
    patch.args.replace.length<3||patch.args.replace.length>2000||
    patch.args.search===patch.args.replace)throw Error('ISOLATED_PATCH_PREVIEW_INVALID');
 const src=all.find(r=>r?.ok===true&&r.name==='repo.read'&&r.args?.file===CONTROLLED_FIXTURE&&
    r.observation?.verifiedRead?.file===CONTROLLED_FIXTURE);
 if(src?.observation?.verifiedRead?.content!==source)throw Error('ISOLATED_PATCH_SOURCE_RECEIPT_MISMATCH');
 if(source.split(patch.args.search).length!==2)throw Error('ISOLATED_PATCH_EXACT_MATCH_REQUIRED');
 if(sha(source)!==patch.observation.snapshotSha256)throw Error('ISOLATED_PATCH_STALE_SOURCE');
 const proposed=source.replace(patch.args.search,patch.args.replace);
 if(sha(proposed)!==patch.observation.expectedSha256)throw Error('ISOLATED_PATCH_EXPECTED_SHA_MISMATCH');
 if(all.some(r=>['repo.write','repo.authorizeWrite','git.push','deploy'].includes(r.name)))
    throw Error('ISOLATED_PATCH_FORBIDDEN_WRITE_RECEIPT');
 const baseline=all.findIndex(r=>r?.ok===true&&r.name==='tests.run'&&
    r.args?.command==='check:syntax'&&r.observation?.status==='PASSED');
 if(baseline<0||baseline>=all.indexOf(patch))throw Error('ISOLATED_PATCH_BASELINE_ORDER_REQUIRED');
 return {proposed,sourceSha256:sha(source),expectedSha256:sha(proposed)};
}

export function sealedDockerArguments(folder,imageId=ISOLATED_IMAGE_SHA){
 if(imageId!==ISOLATED_IMAGE_SHA)throw Error('SANDBOX_IMAGE_DIGEST_MISMATCH');
 if(!path.isAbsolute(folder)||folder.includes(',')||folder.includes('\n'))throw Error('SANDBOX_PATH_INVALID');
 return ['run','--rm','--pull','never','--network','none','--read-only',
    '--cap-drop','ALL','--security-opt','no-new-privileges',
    '--pids-limit','64','--memory','384m','--cpus','1',
    '--user','65534:65534','--tmpfs','/tmp:rw,nosuid,noexec,size=16m',
    '--mount','type=bind,src='+folder+',dst=/work,readonly',
    '--workdir','/work',imageId,'node','--test','--test-reporter=tap','/work/rebate.test.mjs'];
}

export function inspectDockerPreflight({run=spawnSync}={}){
 const probe=run('docker',['info','--format','{{.ServerVersion}}'],{encoding:'utf8',timeout:12000,windowsHide:true});
 if(probe.error||probe.status!==0||!String(probe.stdout||'').trim())return {
    ok:false,status:'SANDBOX_RUNTIME_NOT_READY',
    detail:probe.error?.code||String(probe.stderr||'DOCKER_DAEMON_UNAVAILABLE').slice(0,250)
 };
 const image=run('docker',['image','inspect',ISOLATED_IMAGE,'--format','{{.Id}}'],{
    encoding:'utf8',timeout:12000,windowsHide:true});
 if(image.error||image.status!==0||!String(image.stdout||'').trim())
   return {ok:false,status:'SANDBOX_IMAGE_NOT_READY',
     detail:'Pull the reviewed image manually before running isolated repairs.'};
 const observed=String(image.stdout).trim();
 if(observed!==ISOLATED_IMAGE_SHA)return {ok:false,status:'SANDBOX_IMAGE_DIGEST_MISMATCH',
     detail:'Review and pin the immutable image digest before running code.'};
 return {ok:true,status:'SANDBOX_DOCKER_READY',engineVersion:String(probe.stdout).trim(),
    imageId:observed};
}

export function runIsolatedFixtureVerification(receipt,{root=projectRoot,run=spawnSync,workspace=os.tmpdir()}={}){
 const target=path.join(root,...CONTROLLED_FIXTURE.split('/'));
 const source=fs.readFileSync(target,'utf8');
 const patch=verifyPreparedFixture(source,receipt);
 const preflight=inspectDockerPreflight({run});
 if(!preflight.ok)return {status:preflight.status,verified:false,
    sourceSha256:patch.sourceSha256,expectedSha256:patch.expectedSha256,detail:preflight.detail};
 const base=fs.mkdtempSync(path.join(workspace,'jarvis-isolated-patch-'));
 const stages=[];
 try{
  fs.chmodSync(base,0o755);
  for(const [name,code] of [['before',source],['after',patch.proposed]]){
   const dir=path.join(base,name);fs.mkdirSync(dir,{mode:0o755});
   fs.writeFileSync(path.join(dir,'rebate.mjs'),code,{mode:0o644,flag:'wx'});
   fs.writeFileSync(path.join(dir,'rebate.test.mjs'),testSource,{mode:0o644,flag:'wx'});
   const result=run('docker',sealedDockerArguments(dir,preflight.imageId),{
     encoding:'utf8',timeout:90000,maxBuffer:500000,windowsHide:true
   });
   const parsed=parseIsolatedTestReport(result.stdout);
   stages.push({stage:name,...outcome(result),...parsed});
   if(result.error||result.signal||result.status===null)throw Error('SANDBOX_CONTAINER_EXECUTION_FAILED');
  }
  // The baseline must specifically fail the requested assertion. A different
  // test failing while this test passes does NOT prove the requested bug.
  const before=stages[0],after=stages[1];
  const baselineFailed=before.exitCode!==0&&before.targetFailure&&before.counts.tests4&&before.counts.pass3&&before.counts.fail1;
  const fixedPassed=after.exitCode===0&&after.targetPass&&after.counts.tests4&&after.counts.pass4&&after.counts.fail0;
  const originalUnchanged=sha(fs.readFileSync(target,'utf8'))===patch.sourceSha256;
  const verified=baselineFailed&&fixedPassed&&originalUnchanged;
  return {status:verified?'ISOLATED_BEFORE_AFTER_VERIFIED':'ISOLATED_PATCH_REGRESSION_NOT_PROVEN',
    verified,baselineFailed,fixedPassed,originalUnchanged,
    sourceSha256:patch.sourceSha256,expectedSha256:patch.expectedSha256,
    isolation:{image:ISOLATED_IMAGE,imageId:preflight.imageId,network:'none',readOnlyRoot:true,sourceRepoMounted:false,
      droppedCapabilities:'ALL',nonRootUser:'65534:65534'},stages};
 }finally{fs.rmSync(base,{recursive:true,force:true});}
}

// The local CLI can archive a bounded, physically observed fixture run. This is
// evidence for review, NOT authorization to modify the repository and NOT a
// general Qwen tool. Caller-supplied booleans alone are never enough.
export function verifyIsolatedRepairEvidence(receipt,result,{root=projectRoot}={}){
 const target=path.join(root,...CONTROLLED_FIXTURE.split('/'));
 const source=fs.readFileSync(target,'utf8');
 const patch=verifyPreparedFixture(source,receipt);
 const proposal=receipt.receipts.findLast(r=>r.name==='repo.prepareWrite');
 const missionId=proposal?.observation?.caseId;
 if(!/^general-[a-f0-9-]{36}$/i.test(missionId||'')||
    proposal.observation.objectiveId!=='QWEN_PREVIEW_'+missionId)
    throw Error('ISOLATED_EVIDENCE_MISSION_ID_INVALID');
 if(result?.verified!==true||result.status!=='ISOLATED_BEFORE_AFTER_VERIFIED'||
    result.baselineFailed!==true||result.fixedPassed!==true||
    result.originalUnchanged!==true||
    result.sourceSha256!==patch.sourceSha256||result.expectedSha256!==patch.expectedSha256)
    throw Error('ISOLATED_EVIDENCE_RESULT_MISMATCH');
 const iso=result.isolation;
 if(iso?.imageId!==ISOLATED_IMAGE_SHA||iso.network!=='none'||
    iso.readOnlyRoot!==true||iso.sourceRepoMounted!==false||
    iso.droppedCapabilities!=='ALL'||iso.nonRootUser!=='65534:65534')
    throw Error('ISOLATED_EVIDENCE_BOUNDARY_MISMATCH');
 if(!Array.isArray(result.stages)||result.stages.length!==2||
    result.stages[0].stage!=='before'||result.stages[1].stage!=='after')
    throw Error('ISOLATED_EVIDENCE_STAGE_ORDER_INVALID');
 const [before,after]=result.stages;
 const b=parseIsolatedTestReport(before.stdout),a=parseIsolatedTestReport(after.stdout);
 if(before.exitCode!==1||!b.targetFailure||b.targetPass||
    !b.counts.tests4||!b.counts.pass3||!b.counts.fail1||
    after.exitCode!==0||!a.targetPass||a.targetFailure||
    !a.counts.tests4||!a.counts.pass4||!a.counts.fail0)
    throw Error('ISOLATED_EVIDENCE_TEST_PROOF_INVALID');
 if(sha(fs.readFileSync(target,'utf8'))!==patch.sourceSha256)
    throw Error('ISOLATED_EVIDENCE_ORIGINAL_MODIFIED');
 const evidence={schema:'jarvis-v142-controlled-isolation-v1',missionId,
    sourceFile:CONTROLLED_FIXTURE,sourceSha256:patch.sourceSha256,
    expectedSha256:patch.expectedSha256,
    imageId:ISOLATED_IMAGE_SHA,patchFingerprint:proposal.observation.fingerprint,
    status:'ISOLATED_BEFORE_AFTER_VERIFIED',
    before:{exitCode:before.exitCode,tests:4,passed:3,failed:1,
        targetFailure:b.targetFailure,stdout:before.stdout},
    after:{exitCode:after.exitCode,tests:4,passed:4,failed:0,
        targetPass:a.targetPass,stdout:after.stdout},
    sourceRepoUnchanged:true,patchApplied:false,
    humanApprovalStillRequired:true,productionRepairCertified:false,
    reviewNote:'A fixture-only physical before/after test; not an authorized production write.'};
 return {...evidence,evidenceSha256:sha(JSON.stringify(evidence))};
}

export function saveIsolatedRepairEvidence(receipt,result,{root=projectRoot}={}){
 const evidence=verifyIsolatedRepairEvidence(receipt,result,{root});
 const folder=path.join(root,'.jarvis-artifacts','isolated-repair',evidence.missionId);
 fs.mkdirSync(folder,{recursive:true});
 const destination=path.join(folder,crypto.randomUUID()+'.json');
 fs.writeFileSync(destination,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600,encoding:'utf8'});
 return {path:destination,evidenceSha256:evidence.evidenceSha256,missionId:evidence.missionId};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const flag=process.argv.indexOf('--receipt'),args=process.argv.slice(2);
  const save=args.includes('--save-report');
  if(flag!==2||!args[1]||args.some(v=>v==='--save-report')&&args.at(-1)!=='--save-report'||
     args.length!==(save?3:2))throw Error('USAGE: --receipt <diagnostic.json> [--save-report]');
  const receipt=JSON.parse(fs.readFileSync(path.resolve(process.argv[flag+1]),'utf8'));
  const result=runIsolatedFixtureVerification(receipt);
  console.log(JSON.stringify(result,null,2));
  if(save&&result.verified){
    const saved=saveIsolatedRepairEvidence(receipt,result);
    console.log('ISOLATED_PHYSICAL_EVIDENCE_ARCHIVED='+saved.path);
    console.log('ISOLATED_EVIDENCE_SHA256='+saved.evidenceSha256);
  }
  if(!result.verified)process.exitCode=result.status==='SANDBOX_RUNTIME_NOT_READY'?3:2;
 }catch(error){console.error('ISOLATED_PATCH_BLOCKED: '+error.message);process.exitCode=4;}
}
