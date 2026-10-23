import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeneralToolPolicy} from '../jarvis-qwen-general-policy.js';
import {generalObjectives,verifyGeneralMission,verifiedRepositoryGraphCoverage}
 from '../modules/terminal/qwen-general-evidence.js';
import {generalToolCatalog,prioritizeGeneralCodeCatalog,compactGeneralObservation}
 from '../modules/terminal/qwen-general-pilot.js';

const instruction='Audita la arquitectura del repositorio local y sus dependencias, revisa el árbol de código completo, lee fuentes relevantes, ejecuta pruebas y reporta límites. No modifiques archivos.';
const graphTool={name:'repo.graph',mutates:false,requiresApproval:false,
 inputSchema:{type:'object',properties:{refresh:{type:'boolean'},maxFiles:{type:'integer'},maxFileSizeBytes:{type:'integer'}},additionalProperties:false}};
const tools=['repo.graph','repo.grep','repo.read','tests.run'].map(name=>name==='repo.graph'?graphTool:
 {name,mutates:false,requiresApproval:false,inputSchema:{type:'object',properties:{term:{type:'string'},file:{type:'string'},command:{type:'string'}}}});
const node=file=>({file,dependencies:[],dependents:[],functions:[],calls:[]});
function receipt(summary={filesScanned:2,nodes:2,dependencyEdges:1}){
 return {ok:true,name:'repo.graph',args:{refresh:true,maxFiles:5000,maxFileSizeBytes:800000},
 observation:{ok:true,status:'REPO_GRAPH_READY',source:'live_repo_ast_graph',summary,
 nodes:{'modules/a.js':node('modules/a.js'),'modules/b.js':{...node('modules/b.js'),dependencies:['modules/a.js']}}}};
}
test('architectural audit exposes native live repo graph before any grep',()=>{
 const objective=generalObjectives(instruction);
 assert.equal(objective.code,true);
 assert.equal(objective.architecture,true);
 const policy=createGeneralToolPolicy({location:{protocol:'http:',hostname:'127.0.0.1',port:'5000',search:'?qwenPilot=general-v1'},missionId:'general-12345678',objectives:objective,instruction});
 assert.equal(policy.accept(graphTool),true);
 const runtime={list:()=>tools};
 const catalog=generalToolCatalog(runtime,policy,objective,instruction);
 const first=prioritizeGeneralCodeCatalog(catalog,[],instruction);
 assert.deepEqual(first.map(x=>x.name),['repo.graph']);
 assert.equal(first[0].inputSchema.properties.maxFiles.const,5000);
 assert.equal(first[0].inputSchema.properties.refresh.const,true);
 const next=prioritizeGeneralCodeCatalog(catalog,[receipt()],instruction);
 assert.deepEqual(next.map(x=>x.name),['repo.grep']);
});
test('graph compiler observations include bounded topology summary not source bodies',()=>{
 const compact=compactGeneralObservation({...receipt().observation,tool:'repo.graph'});
 assert.equal(compact.summary.filesScanned,2);
 assert.equal(compact.nodeCount,2);
 assert.ok(JSON.stringify(compact).includes('modules/a.js'));
 assert.ok(!JSON.stringify(compact).includes('semanticDocument'));
});
test('incomplete graph does not certify architecture and does not move to grep',async()=>{
 const objective=generalObjectives(instruction);
 const invalid=receipt({filesScanned:5000,nodes:2,dependencyEdges:1});
 assert.equal(verifiedRepositoryGraphCoverage(invalid).ok,false);
 const offered=prioritizeGeneralCodeCatalog(tools,[invalid],instruction);
 assert.deepEqual(offered,[]);
 const verdict=await verifyGeneralMission({instruction,objectives:objective,receipts:[invalid],proposedReport:'No se completó el grafo.'});
 assert.equal(verdict.ok,false);
 assert.ok(verdict.objectives.some(x=>x.reason==='REPOSITORY_GRAPH_INCOMPLETE'));
});
test('read-only graph verification never treats code writes or unrelated tool receipts as coverage',()=>{
 const valid=receipt();
 assert.equal(verifiedRepositoryGraphCoverage(valid).ok,true);
 for(const changed of [
  {name:'repo.write'}, {observation:{...valid.observation,nodes:{}}},
  {observation:{...valid.observation,source:'MODEL_ASSERTION'}},
  {observation:{...valid.observation,summary:{filesScanned:5000,nodes:2}}},
  {args:{refresh:false,maxFiles:100,maxFileSizeBytes:800000}}
 ]){
  assert.equal(verifiedRepositoryGraphCoverage({...valid,...changed}).ok,false);
 }
});
