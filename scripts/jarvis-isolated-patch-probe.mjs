// V142 fail-closed, non-production Docker probe. Not an arbitrary Qwen shell runner.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const CONTROLLED_FIXTURE='tests/fixtures/v142-rebate-preview.js';
export const ISOLATED_IMAGE='node:24-alpine';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=text=>crypto.createHash('sha256').update(text,'utf8').digest('hex');
const digest=x=>/^[a-f0-9]{64}$/i.test(String(x||''));
const outcome=x=>({exitCode:x.status,signal:x.signal||null,stdout:String(x.stdout||'').slice(-1800),stderr:String(x.stderr||'').slice(-1200)});
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

export function sealedDockerArguments(folder){
 if(!path.isAbsolute(folder)||folder.includes(',')||folder.includes('\n'))throw Error('SANDBOX_PATH_INVALID');
 return ['run','--rm','--pull','never','--network','none','--read-only',
    '--cap-drop','ALL','--security-opt','no-new-privileges',
    '--pids-limit','64','--memory','384m','--cpus','1',
    '--user','65534:65534','--tmpfs','/tmp:rw,nosuid,noexec,size=16m',
    '--mount','type=bind,src='+folder+',dst=/work,readonly',
    '--workdir','/work',ISOLATED_IMAGE,'node','--test','/work/rebate.test.mjs'];
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
 return {ok:true,status:'SANDBOX_DOCKER_READY',engineVersion:String(probe.stdout).trim(),
    imageId:String(image.stdout).trim()};
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
   const result=run('docker',sealedDockerArguments(dir),{
     encoding:'utf8',timeout:90000,maxBuffer:500000,windowsHide:true
   });
   stages.push({stage:name,...outcome(result)});
   if(result.error||result.signal||result.status===null)throw Error('SANDBOX_CONTAINER_EXECUTION_FAILED');
  }
  const baselineFailed=stages[0].exitCode!==0&&/rebate larger than amount is rejected/.test(stages[0].stdout);
  const fixedPassed=stages[1].exitCode===0&&/pass 4/.test(stages[1].stdout)&&/fail 0/.test(stages[1].stdout);
  const originalUnchanged=sha(fs.readFileSync(target,'utf8'))===patch.sourceSha256;
  const verified=baselineFailed&&fixedPassed&&originalUnchanged;
  return {status:verified?'ISOLATED_BEFORE_AFTER_VERIFIED':'ISOLATED_PATCH_REGRESSION_NOT_PROVEN',
    verified,baselineFailed,fixedPassed,originalUnchanged,
    sourceSha256:patch.sourceSha256,expectedSha256:patch.expectedSha256,
    isolation:{image:ISOLATED_IMAGE,network:'none',readOnlyRoot:true,sourceRepoMounted:false,
      droppedCapabilities:'ALL',nonRootUser:'65534:65534'},stages};
 }finally{fs.rmSync(base,{recursive:true,force:true});}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const flag=process.argv.indexOf('--receipt');
  if(flag<0||flag+2!==process.argv.length)throw Error('USAGE: --receipt <diagnostic.json>');
  const receipt=JSON.parse(fs.readFileSync(path.resolve(process.argv[flag+1]),'utf8'));
  const result=runIsolatedFixtureVerification(receipt);
  console.log(JSON.stringify(result,null,2));
  if(!result.verified)process.exitCode=result.status==='SANDBOX_RUNTIME_NOT_READY'?3:2;
 }catch(error){console.error('ISOLATED_PATCH_BLOCKED: '+error.message);process.exitCode=4;}
}
