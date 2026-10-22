import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {
 CONTROLLED_FIXTURE,ISOLATED_IMAGE,sealedDockerArguments,
 verifyPreparedFixture,inspectDockerPreflight,runIsolatedFixtureVerification
} from '../scripts/jarvis-isolated-patch-probe.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const original=fs.readFileSync(path.join(root,CONTROLLED_FIXTURE),'utf8');
const sum=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const search='return Number((amount-rebate).toFixed(2));';
const replacement="if(rebate>amount)throw Error('REBATE_EXCEEDS_AMOUNT');\n  "+search;
const patched=original.replace(search,replacement);
function receipt(){
 return {receipts:[
  {name:'repo.read',args:{file:CONTROLLED_FIXTURE},ok:true,
   observation:{verifiedRead:{file:CONTROLLED_FIXTURE,content:original}}},
  {name:'tests.run',args:{command:'check:syntax'},ok:true,
   observation:{status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}},
  {name:'repo.prepareWrite',args:{file:CONTROLLED_FIXTURE,search,replace:replacement,matchCount:1,operation:'replace'},
   ok:true,observation:{status:'WRITE_PREPARED',file:CONTROLLED_FIXTURE,written:false,requiresApproval:true,
    fingerprint:'a'.repeat(64),snapshotSha256:sum(original),expectedSha256:sum(patched)}}
 ]};
}

test('physical prepared preview is source-locked and hash-bound; cannot select production or write receipts',()=>{
 assert.equal(verifyPreparedFixture(original,receipt()).proposed,patched);
 let r=receipt();r.receipts[2].args.file='functions/index.js';
 assert.throws(()=>verifyPreparedFixture(original,r),/PREVIEW_INVALID/);
 r=receipt();r.receipts[2].observation.expectedSha256='b'.repeat(64);
 assert.throws(()=>verifyPreparedFixture(original,r),/EXPECTED_SHA_MISMATCH/);
 r=receipt();r.receipts[0].observation.verifiedRead.content='untrusted';
 assert.throws(()=>verifyPreparedFixture(original,r),/SOURCE_RECEIPT_MISMATCH/);
 r=receipt();r.receipts.push({name:'repo.write',ok:true});
 assert.throws(()=>verifyPreparedFixture(original,r),/FORBIDDEN_WRITE_RECEIPT/);
});

test('Docker command is locked down: no network, privileges, root writes, Docker socket or full checkout mounts',()=>{
 const args=sealedDockerArguments(path.resolve('C:/isolated-test'));
 const combined=args.join(' ');
 for(const expected of ['--network none','--read-only','--cap-drop ALL','--security-opt no-new-privileges',
  '--pull never','--pids-limit 64','--memory 384m','--user 65534:65534',
  'dst=/work,readonly',ISOLATED_IMAGE])assert.ok(combined.includes(expected),expected);
 assert.ok(!combined.includes('docker.sock'));
 assert.ok(!combined.includes('--privileged'));
 assert.equal(args.at(-1),'/work/rebate.test.mjs');
});

test('without Docker engine the probe fails closed and executes no host-side patch',()=>{
 const calls=[];
 const run=(bin,args)=>{calls.push({bin,args});return {error:{code:'ENOENT'},status:null,stderr:'missing'}};
 const response=runIsolatedFixtureVerification(receipt(),{root,run});
 assert.equal(response.verified,false);
 assert.equal(response.status,'SANDBOX_RUNTIME_NOT_READY');
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].args,['info','--format','{{.ServerVersion}}']);
 assert.equal(fs.readFileSync(path.join(root,CONTROLLED_FIXTURE),'utf8'),original);
});

test('in a Docker-backed sandbox, the baseline must fail and the proposed code pass independently',()=>{
 const calls=[];
 const run=(bin,args)=>{
  assert.equal(bin,'docker');
  calls.push(args);
  if(args[0]==='info')return {status:0,stdout:'28.0.0\n'};
  if(args[0]==='image')return {status:0,stdout:'sha256:valid-image\n'};
  assert.equal(args[0],'run');
  const i=args.indexOf('--mount');
  const hostDir=args[i+1].split(',dst=')[0].replace('type=bind,src=','');
  const source=fs.readFileSync(path.join(hostDir,'rebate.mjs'),'utf8');
  const tests=fs.readFileSync(path.join(hostDir,'rebate.test.mjs'),'utf8');
  assert.ok(tests.includes('REBATE_EXCEEDS_AMOUNT'));
  if(calls.length===3){assert.equal(source,original);return {status:1,stdout:'not ok 4 - rebate larger than amount is rejected\ntests 4\npass 3\nfail 1\n'};}
  assert.equal(source,patched);
  return {status:0,stdout:'ok 4 - rebate larger than amount is rejected\ntests 4\npass 4\nfail 0\n'};
 };
 const result=runIsolatedFixtureVerification(receipt(),{root,run});
 assert.equal(result.verified,true);
 assert.equal(result.baselineFailed,true);
 assert.equal(result.fixedPassed,true);
 assert.equal(result.originalUnchanged,true);
 assert.equal(calls.length,4);
 assert.equal(fs.readFileSync(path.join(root,CONTROLLED_FIXTURE),'utf8'),original);
});

test('a green baseline or a failed after-test is not certified',()=>{
 const run=(bin,args)=>args[0]==='info'?{status:0,stdout:'28.0.0\n'}:args[0]==='image'?
  {status:0,stdout:'sha256:valid-image\n'}:{status:0,stdout:'pass 4\nfail 0\n'};
 const result=runIsolatedFixtureVerification(receipt(),{root,run});
 assert.equal(result.verified,false);
 assert.equal(result.status,'ISOLATED_PATCH_REGRESSION_NOT_PROVEN');
});

test('Docker available but reviewed image absent does not execute or pull any code',()=>{
 const calls=[];
 const run=(bin,args)=>{calls.push(args);return args[0]==='info'?
  {status:0,stdout:'28.0.0\n'}:{status:1,stderr:'No such image'};};
 const x=runIsolatedFixtureVerification(receipt(),{root,run});
 assert.equal(x.status,'SANDBOX_IMAGE_NOT_READY');
 assert.equal(x.verified,false);
 assert.deepEqual(calls.map(a=>a[0]),['info','image']);
 assert.equal(fs.readFileSync(path.join(root,CONTROLLED_FIXTURE),'utf8'),original);
});

test('an unrelated failing baseline cannot masquerade as the requested broken rebate case',()=>{
 let count=0;
 const run=(bin,args)=>{
  if(args[0]==='info')return {status:0,stdout:'28.0.0\n'};
  if(args[0]==='image')return {status:0,stdout:'sha256:valid-image\n'};
  count++;
  if(count===1)return {status:1,stdout:
    'not ok 1 - ordinary rebate is deterministic\nok 4 - rebate larger than amount is rejected\n' +
    'tests 4\npass 3\nfail 1\n'};
  return {status:0,stdout:
    'ok 4 - rebate larger than amount is rejected\n'+'tests 4\npass 4\nfail 0\n'};
 };
 const result=runIsolatedFixtureVerification(receipt(),{root,run});
 assert.equal(result.verified,false);
 assert.equal(result.baselineFailed,false);
 assert.equal(result.status,'ISOLATED_PATCH_REGRESSION_NOT_PROVEN');
});
