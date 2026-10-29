import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainExplicitGitStatusContract,scopeValidatedRepositoryMission}
    from '../gestia-core/jarvis/jarvis.current-turn-scope.js';

const instruction='Jarvis, consulta únicamente repo.gitStatus en la rama v142-official. Dime si hay archivos modificados y explica el resultado en español sencillo. No ejecutes herramientas de escritura ni intentes leer archivos que no hayas localizado.';
const catalog=[
 {name:'repo.gitStatus',mutates:false,requiresApproval:false,investigationReadOnly:true,
   evidenceKinds:['repository_search']},
 {name:'system.health',mutates:false,requiresApproval:false,evidenceKinds:['system_telemetry']},
 {name:'system.observability',mutates:false,requiresApproval:false,evidenceKinds:['system_telemetry']},
 {name:'repo.read',mutates:false,requiresApproval:false,investigationReadOnly:true,
   evidenceKinds:['repository_source']}
];
const calls=[{name:'repo.gitStatus',args:{cwd:'.'}},{name:'system.health',args:{}}];
const objectives=[
 {objective:'Verificar estado Git y archivos modificados',requiredEvidenceKind:'repository_search',
   explicitTools:['repo.gitStatus']},
 {objective:'Comprobar salud del runtime',requiredEvidenceKind:'system_telemetry',
   explicitTools:['system.health'],satisfied:false}
];

test('explicit single-tool Git status scope removes hallucinated health goals without inventing success',()=>{
 const scoped=constrainExplicitGitStatusContract({instruction,toolCalls:calls,objectives,catalog});
 assert.equal(scoped.restricted,true);
 assert.deepEqual(scoped.toolCalls,[calls[0]]);
 assert.deepEqual(scoped.objectives,[objectives[0]]);
 assert.equal(scoped.objectives[0].satisfied,undefined);
 const readers=scopeValidatedRepositoryMission({catalog,toolCalls:scoped.toolCalls,
   objectives:scoped.objectives,validated:true});
 assert.ok(Array.isArray(readers));
 assert.ok(readers.some(t=>t.name==='repo.gitStatus'));
 assert.ok(readers.every(t=>!t.name.startsWith('system.')));
});

test('mixed or runtime-health instructions retain all goals and tools',()=>{
 for(const text of [
  'Consulta repo.gitStatus y system.health para revisar Git y el runtime',
  'Consulta únicamente repo.gitStatus y comprueba la salud del sistema',
  'Verifica el repo y observa la telemetría del sistema'
 ]) {
  const scoped=constrainExplicitGitStatusContract({instruction:text,toolCalls:calls,objectives,catalog});
  assert.equal(scoped.restricted,false,text);
  assert.deepEqual(scoped.objectives,objectives);
 }
});

test('cannot scope without observed Git call, unique repository goal and safe tool metadata',()=>{
 const variants=[
  {toolCalls:[calls[1]]},
  {objectives:[objectives[1]]},
  {objectives:[objectives[0],{...objectives[0],objective:'Historial Git'}]},
  {catalog:[{...catalog[0],mutates:true}]},
  {toolCalls:[{name:'repo.gitStatus',args:{cwd:'../otro'}}]}
 ];
 for(const variant of variants){
  const scoped=constrainExplicitGitStatusContract({instruction,toolCalls:calls,objectives,catalog,...variant});
  assert.equal(scoped.restricted,false,JSON.stringify(variant));
 }
});

test('core scopes contract before launching evidence-backed mission; no fabricated success',()=>{
 const core=readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
 const scope=core.indexOf('const scopedGitStatus = constrainExplicitGitStatusContract(');
 const mission=core.indexOf('const missionResult =');
 assert.ok(scope>0&&scope<mission);
 assert.match(core.slice(scope,mission),/missionContractEvidenceObjectives = scopedGitStatus.objectives/);
 const helper=readFileSync(new URL('../gestia-core/jarvis/jarvis.current-turn-scope.js',import.meta.url),'utf8');
 assert.doesNotMatch(helper.slice(helper.indexOf('export function constrainExplicitGitStatusContract')),/satisfied:\s*true|missionComplete:\s*true/);
});
