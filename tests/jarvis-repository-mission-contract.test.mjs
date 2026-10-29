import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as scope from '../gestia-core/jarvis/jarvis.current-turn-scope.js';
import {isBoundedReadOnlyMission} from '../gestia-core/jarvis/jarvis.multifunction.planner.js';

const instruction='Lee gestia-core/jarvis/jarvis.local.policy.js con repo.read y dime qué modelo local está permitido. No modifiques archivos.';
const tools=[['repo.read','repository_source'],['repo.search','repository_search'],['platform.query','platform_records'],['repo.prepareWrite','repository_source']]
 .map(([name,kind])=>({name,evidenceKinds:[kind],mutates:false,requiresApproval:false,userArtifact:false,investigationReadOnly:true}));
const objectives=[{objective:instruction,requestQuote:instruction,requiredEvidenceKind:'repository_source',explicitTools:['repo.read']}];
const calls=[{name:'repo.read',args:{file:'gestia-core/jarvis/jarvis.local.policy.js'},approved:false}];
const source=readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');

async function contractPath(goals=objectives,selected=calls,registered=tools,forceUnbounded=false){
 const start=source.indexOf('    const operationalMissionToolNames ='),end=source.indexOf('    const missionResult =',start),phases=[];
 const result=await runInNewContext(`(async()=>{${source.slice(start,end)};return {missionToolCatalog,missionContractEvidenceObjectives,initialCoverageContract,missionInitialToolCalls};})()`,{
  structuredClone, operationalInitialToolCalls:selected, terminalSemanticPlan:{reason:'model_selected_multifunction_plan',toolCalls:selected},
  registeredMissionTools:registered,context:{},semanticMemoryContext:null,effectiveMissionInstruction:instruction,inputRaw:instruction,
  conversationalPlan:{requiresFinalConversation:true},isBoundedReadOnlyMission:forceUnbounded?()=>false:isBoundedReadOnlyMission,
  scopeValidatedRepositoryMission:scope.scopeValidatedRepositoryMission,
  ensureExecutableArtifactDependencies:({toolCalls})=>toolCalls,mergeEvidenceGroundedToolCalls:a=>a,
  compactJarvisSemanticMemoryForPlanner:()=>null,resolveExplicitRepositoryTargets:()=>[],normalizeObservationFilePath:x=>x,
  appendExplicitReadOnlySourceCalls:({toolCalls})=>toolCalls,addRepositoryDiscoveryPreflights:({toolCalls})=>toolCalls,
  window:{},console,buildJarvisMultifunctionToolCalls:async(_input,options)=>{
   phases.push(options.missionState.phase);
   const result=structuredClone(selected);result.completionAssessment={objectives:structuredClone(options.missionState.phase==='OBJECTIVE_CONTRACT'?[{objective:instruction,requiredEvidenceKind:'platform_records'}]:goals)};
   return result;
  }
 });return {result,phases};
}

test('real policy-file contract survives the core path without a second operational objective contract',async()=>{
 const {result,phases}=await contractPath();
 assert.deepEqual(phases,['MISSION_CONTRACT']);
 assert.equal(result.initialCoverageContract,null);
 assert.deepEqual(JSON.parse(JSON.stringify(result.missionContractEvidenceObjectives)),objectives);
 assert.deepEqual(Array.from(result.missionToolCatalog,t=>t.name),['repo.read','repo.search']);
 assert.deepEqual(JSON.parse(JSON.stringify(result.missionInitialToolCalls)),calls);
 const runner=source.slice(source.indexOf('    const missionResult ='));
 assert.match(runner,/toolCatalog: boundedCurrentTurnMission \|\| observationFirstCurrentTurnMission \|\| repositoryContractMission \? missionToolCatalog : registeredMissionTools/);
 assert.match(runner,/\(boundedCurrentTurnMission \|\| observationFirstCurrentTurnMission \|\| repositoryContractMission \? missionToolCatalog : registeredMissionTools\)/);
});

test('mixed or empty contracts keep operational coverage instead of narrowing by the user words',async()=>{
 for(const goals of [[],[...objectives,{objective:'Consulta registros reales',requiredEvidenceKind:'platform_records'}]]){
  const {result,phases}=await contractPath(goals);
  assert.deepEqual(phases,['MISSION_CONTRACT','OBJECTIVE_CONTRACT']);
  assert.ok(result.missionToolCatalog.some(t=>t.name==='platform.query'));
 }
});

test('capability-only owner mission does not invoke a redundant platform population contract',async()=>{
 const selected=[{name:'system.capabilities',args:{},approved:false}];
 const catalog=[...tools,{name:'system.capabilities',mutates:false,requiresApproval:false,investigationReadOnly:true,evidenceKinds:['tool_result']}];
 for(const goals of [[],[{objective:'Consultar capacidades',requestQuote:'Consultar capacidades',requiredEvidenceKind:'tool_result'}]]){
  const {result,phases}=await contractPath(goals,selected,catalog,true);
  assert.deepEqual(phases,['MISSION_CONTRACT']);
  assert.equal(result.initialCoverageContract,null);
  assert.deepEqual(JSON.parse(JSON.stringify(result.missionInitialToolCalls)),selected);
 }
 const goals=[{objective:'Contar técnicos',requiredEvidenceKind:'platform_records'}];
 const {result,phases}=await contractPath(goals,selected,catalog,true);
 assert.deepEqual(phases,['MISSION_CONTRACT','OBJECTIVE_CONTRACT'],
  'the capability-only tool selection never suppresses a model-owned records obligation');
 assert.ok(result.initialCoverageContract?.completionAssessment?.objectives?.length);
});

test('repository contract scope rejects writes, approval, artifact, unknown tools and unvalidated objectives',()=>{
 const narrow=(patch={})=>scope.scopeValidatedRepositoryMission({catalog:tools,toolCalls:calls,objectives,validated:true,...patch});
 assert.deepEqual(narrow().map(t=>t.name),['repo.read','repo.search']);
 for(const patch of [{validated:false},{objectives:[]},{toolCalls:[]},{objectives:[{objective:'',requiredEvidenceKind:'repository_source'}]},
  {toolCalls:[{name:'repo.prepareWrite',args:{}}]},{toolCalls:[{name:'unknown.read',args:{}}]},
  {objectives:[{...objectives[0],explicitTools:['platform.query']}]},
  ...['mutates','requiresApproval','userArtifact'].map(field=>({catalog:tools.map(t=>t.name==='repo.read'?{...t,[field]:true}:t)}))])assert.equal(narrow(patch),null);
});
