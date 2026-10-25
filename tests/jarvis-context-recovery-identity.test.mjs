import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import {__test as frontend} from '../gestia-core/jarvis/jarvis.multifunction.planner.js';
import {__test as runtime} from '../gestia-core/jarvis/jarvis.mission.orchestrator.js';
const {runJarvisSemanticPlanner}=createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');
const id='semantic:repo.context',files=['jarvis-safe-a.js','jarvis-safe-b.js'];
function fixture(){
 const p=JSON.parse(fs.readFileSync(new URL('./v142-four-step-audit.fixture.json',import.meta.url),'utf8'));
 const failed=p.missionState.blockedTasks[0];failed.obligationId=id;
 failed.observation.errorDetails.sourceDiscovery={source:'LOCAL_REPOSITORY_FILE_METADATA',operationalEvidence:false,candidates:files.map(file=>({file,sourceBytes:200}))};
 return p;
}
test('both production audit handoffs preserve the failed obligation identity',()=>{
 const source=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
 const maps=[...source.matchAll(/blockedTasks:\s*mission\.blockedTasks\.map\(item => \(\{([\s\S]*?)\}\)\)/g)];
 assert.equal(maps.length,2);
 for(const match of maps){
  const rows=vm.runInNewContext(match[0].replace(/^blockedTasks:\s*/,''),{
   mission:{blockedTasks:[{name:'repo.context',obligationId:id,args:{},observation:{}}]},
   compactMissionPlannerObservation:o=>o});
  assert.equal(rows[0].obligationId,id);
 }
});
test('validated recovery retains original obligation through backend, browser normalization and archival',async()=>{
 const p=fixture(),before=JSON.stringify(p);
 const plan=await runJarvisSemanticPlanner({...p,ai:{models:{generateContent:async()=>({text:JSON.stringify({
  toolCalls:[{name:'repo.context',args:{files,tokenBudget:1800},obligationId:'MODEL_FORGED_ID'}],explanation:'Fuentes permitidas mas pequenas.'
 })})}}});
 assert.equal(plan.missionComplete,false);
 assert.equal(plan.toolCalls[0].obligationId,id,'bind runtime identity, never model-supplied identity');
 const calls=frontend.trustedPlanCalls(plan,p.catalog,{originalInstruction:p.input,missionState:p.missionState});
 assert.equal(calls.length,1);assert.equal(calls[0].obligationId,id);
 const mission={blockedTasks:structuredClone(p.missionState.blockedTasks),errors:[{tool:'repo.context',obligationKey:'repo.context::'+id,status:'ERROR'}]};
 runtime.archiveRecoveredToolAttempts(mission,calls[0],()=> '2026-10-25T23:40:00Z');
 assert.equal(mission.blockedTasks.length,0);assert.equal(mission.errors.length,0);
 assert.deepEqual(mission.recoveredToolAttempts[0].args,p.missionState.blockedTasks[0].args);
 assert.equal(mission.recoveredToolAttempts[0].obligationKey,'repo.context::'+id);
 assert.equal(JSON.stringify(p),before);
});
test('browser rejects unrelated or forged recovery identities and permission-denied substitutions',()=>{
 for(const variant of ['wrong-id','wrong-stage','permission']){
  const p=fixture();if(variant==='permission')p.missionState.blockedTasks[0].observation.errorCode='REPO_CONTEXT_SCOPE_DENIED';
  const plan={planKind:variant==='wrong-stage'?'COMPLETION_AUDIT':'REPOSITORY_CONTEXT_RECOVERY',
   toolCalls:[{name:'repo.context',args:{files},obligationId:variant==='wrong-id'?'unrelated':id}]};
  const calls=frontend.trustedPlanCalls(plan,p.catalog,{originalInstruction:p.input,missionState:p.missionState});
  assert.equal(calls[0]?.obligationId,undefined);
 }
});
