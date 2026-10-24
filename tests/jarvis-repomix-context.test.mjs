import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {packAuthorizedRepositoryContext} from '../jarvis-repomix-context.js';
import {compactMissionPlannerObservation} from '../gestia-core/jarvis/jarvis.mission.planner-state.js';
const fixture=()=> {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-repomix-tests-'));
 fs.writeFileSync(path.join(root,'jarvis-safe.js'),'export const sum=(a,b)=>a+b;\n');
 return root;
};
test('Repomix scope rejects traversal, env, secrets, duplicates, untrusted source and invalid token budgets',async()=>{
 const root=fixture();
 try{
  for(const files of [
   ['../outside.js'],['.env'],['jarvis-private-key.js'],['jarvis-safe.js','jarvis-safe.js'],
   ['jarvis-safe.js','jarvis-test.js','jarvis-safe.js'],['package.json'],
   ['jarvis-credentials.js'],['/etc/passwd'],['gestia-core/../../../foo.js'],
   Array.from({length:7},(_,i)=>'jarvis-test'+i+'.js')
  ])await assert.rejects(packAuthorizedRepositoryContext({root,files}),/REPO_CONTEXT_FILE_SCOPE_DENIED/);
  await assert.rejects(packAuthorizedRepositoryContext({root,files:['jarvis-safe.js'],tokenBudget:12000}),/REPO_CONTEXT_BUDGET_INVALID/);
  await assert.rejects(packAuthorizedRepositoryContext({root,files:['jarvis-safe.js'],outputMaxBytes:999999}),/REPO_CONTEXT_OUTPUT_LIMIT_INVALID/);
  await assert.rejects(packAuthorizedRepositoryContext({root,files:['jarvis-absent.js']}),/ENOENT/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Repomix rejects symlink source and too-large inputs without executing CLI',async()=>{
 const root=fixture(),other=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-repomix-outside-'));
 try{
  fs.writeFileSync(path.join(other,'outsider.js'),'secret-not-for-agent');
  try{fs.symlinkSync(path.join(other,'outsider.js'),path.join(root,'jarvis-link.js'));
   await assert.rejects(packAuthorizedRepositoryContext({root,files:['jarvis-link.js']}),/SYMLINK_OR_TRAVERSAL_DENIED/);
  }catch(e){if(e.code!=='EPERM'&&e.code!=='EACCES')throw e;}
  fs.writeFileSync(path.join(root,'jarvis-long.js'),'x'.repeat(90000));
  await assert.rejects(packAuthorizedRepositoryContext({root,files:['jarvis-long.js']}),/SOURCE_TOO_LARGE/);
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(other,{recursive:true,force:true});}
});
test('Repomix context survives model compaction only as uncertified preview with source hashes',()=>{
 const packet={ok:true,status:'REPO_CONTEXT_READY',tool:'repo.context',contextIsUnverifiedPreview:true,
  sha256:'a'.repeat(64),files:[{file:'jarvis-safe.js',sha256:'b'.repeat(64)}],
  packedContext:'<files><file path="jarvis-safe.js">export const sum=1</file></files>'};
 const output=compactMissionPlannerObservation(packet);
 assert.equal(output.contextPreview?.evidenceOnly,true);
 assert.equal(output.contextPreview.independentlyCertified,false);
 assert.equal(output.contextPreview.files[0].file,'jarvis-safe.js');
 assert.equal(compactMissionPlannerObservation({...packet,ok:false}).contextPreview,undefined);
});
