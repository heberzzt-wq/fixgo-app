import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {packAuthorizedRepositoryContext} from '../jarvis-repomix-context.js';
import {compactMissionPlannerObservation} from '../gestia-core/jarvis/jarvis.mission.planner-state.js';
import {safeObservation} from '../gestia-core/jarvis/jarvis.mission.orchestrator.js';
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
  await assert.rejects(packAuthorizedRepositoryContext({root,files:['jarvis-absent.js']}),/REPO_CONTEXT_SOURCE_NOT_FOUND/);
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
  await assert.rejects(packAuthorizedRepositoryContext({root,files:['jarvis-long.js']}),error=>{
   assert.match(error.message,/SOURCE_TOO_LARGE/);
   assert.equal(error.details?.file,'jarvis-long.js');
   assert.equal(error.details?.sourceBytes,90000);
   assert.equal(error.details?.sourceLimitBytes,85000);
   assert.equal(error.details?.requiresDifferentSources,true);
   return true;
  });
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

test('orchestrator retains grounded committed Git metadata after actual tool execution',()=>{
 const sha='c'.repeat(40);
 const history=safeObservation({ok:true,status:'GIT_HISTORY_OK',tool:'repo.gitHistory',
  commitCount:1,limit:6,stdout:'COMMIT\t'+sha+'\t2026-10-24T17:00:00-05:00\tfix(v142): restore evidence\nM\tjarvis-repomix-context.js\n'});
 const packet=compactMissionPlannerObservation(history);
 assert.equal(history.ok,true);
 assert.equal(packet.gitEvidence?.kind,'git_committed_history');
 assert.equal(packet.gitEvidence.commits[0]?.sha,sha);
 assert.equal(packet.gitEvidence.commits[0]?.fileCount,1);
 assert.equal(packet.gitEvidence.commits[0]?.files[0],'M\tjarvis-repomix-context.js');
});
test('orchestrator retains a bounded Repomix preview but never certifies it as original source',()=>{
 const excerpt='<files><file path="jarvis-safe.js">export const a=1</file></files>';
 const packet=safeObservation({ok:true,status:'REPO_CONTEXT_READY',tool:'repo.context',
  contextIsUnverifiedPreview:true,packedContext:excerpt,sha256:'a'.repeat(64),
  files:[{file:'jarvis-safe.js',sha256:'b'.repeat(64)}]});
 const compact=compactMissionPlannerObservation(packet);
 assert.equal(compact.contextPreview?.excerpt,excerpt);
 assert.equal(compact.contextPreview?.independentlyCertified,false);
 assert.equal(compact.contextPreview?.evidenceOnly,true);
 assert.equal(compact.contextPreview?.files[0].file,'jarvis-safe.js');
 const bad=compactMissionPlannerObservation(safeObservation({ok:false,status:'REPO_CONTEXT_SOURCE_NOT_FOUND',
  tool:'repo.context',contextIsUnverifiedPreview:true,packedContext:excerpt}));
 assert.equal(bad.contextPreview,undefined);
});


test('Repomix rejected source identity and limits survive both observation boundaries',()=>{
 const details={file:'jarvis-long.js',sourceBytes:90000,sourceLimitBytes:85000,totalBytes:90000,
  totalLimitBytes:240000,requiresDifferentSources:true,recoveryAction:'SELECT_SMALLER_OBSERVED_AUTHORIZED_SOURCES'};
 const observation=safeObservation({ok:false,tool:'repo.context',status:'REPO_CONTEXT_SOURCE_TOO_LARGE',
  error:'REPO_CONTEXT_SOURCE_TOO_LARGE',errorDetails:details,retryable:false});
 const compact=compactMissionPlannerObservation(observation);
 assert.equal(observation.ok,false);
 assert.equal(compact.ok,false);
 assert.equal(compact.errorDetails.file,'jarvis-long.js');
 assert.equal(compact.errorDetails.sourceBytes,90000);
 assert.equal(compact.errorDetails.requiresDifferentSources,true);
 assert.equal(compact.contextPreview,undefined);
});


test('Repomix model calls use the host context budget instead of choosing the grammar minimum',async()=>{
 const {runInNewContext}=await import('node:vm');
 const source=fs.readFileSync(new URL('../gestia-core/tools.runtime.js',import.meta.url),'utf8');
 const at=source.indexOf('    name: "repo.context"');
 const start=source.lastIndexOf('JarvisToolRuntime.register({',at),end=source.indexOf('\n});',at)+5;
 assert.ok(start>=0 && end>start);
 let tool,request;
 runInNewContext(source.slice(start,end),{JarvisToolRuntime:{register:value=>{tool=value;}},
  window:{JarvisLocalBridge:{requestJson:async(route,payload)=>{request={route,payload};return {ok:true,status:'REPO_CONTEXT_READY'};}}}});
 await tool.execute({files:['jarvis-repomix-context.js'],tokenBudget:256});
 assert.equal(request.route,'/repo/context');
 assert.equal(request.payload.tokenBudget,1800);
 assert.equal(tool.inputSchema.properties.tokenBudget.const,1800);
});

test('oversize recovery offers bounded physical metadata only inside the existing source allowlist',async()=>{
 const root=fixture();
 try{
  fs.writeFileSync(path.join(root,'jarvis-long.js'),'x'.repeat(90000));
  fs.writeFileSync(path.join(root,'jarvis-secret.js'),'private');
  fs.writeFileSync(path.join(root,'outside.js'),'not authorized');
  await assert.rejects(packAuthorizedRepositoryContext({root,files:['jarvis-long.js']}),error=>{
   const d=error.details.sourceDiscovery;
   assert.equal(d.source,'LOCAL_REPOSITORY_FILE_METADATA');
   assert.equal(d.operationalEvidence,false);
   assert.deepEqual(d.candidates,[{file:'jarvis-safe.js',sourceBytes:fs.statSync(path.join(root,'jarvis-safe.js')).size}]);
   const compact=compactMissionPlannerObservation(safeObservation({ok:false,tool:'repo.context',
    errorCode:error.message,errorDetails:error.details}));
   assert.deepEqual(compact.errorDetails.sourceDiscovery,d);
   return true;
  });
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
