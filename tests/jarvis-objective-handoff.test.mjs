import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
const goal={objective:'Leer dos archivos',requestQuote:'Lee dos archivos',requiredEvidenceKind:'repository_source',satisfied:false,evidenceTaskIndexes:[],limitation:'Pendiente'};
function handoff(coverage=null){
 const calls=[{name:'repo.read',args:{}}];Object.defineProperty(calls,'completionAssessment',{value:{objectives:[structuredClone(goal)]},enumerable:false});
 const context={missionContractToolCalls:calls,missionContractEvidenceObjectives:[],initialCoverageContract:coverage,structuredClone};
 const capture=source.match(/missionContractEvidenceObjectives = structuredClone\([^;]+;/)?.[0];
 if(capture)vm.runInNewContext(capture,context);
 context.missionContractToolCalls=calls.map(c=>({...c}));
 const expression=source.match(/initialEvidenceObjectives:\s*([^\n]+),/)[1];
 return JSON.parse(JSON.stringify(vm.runInNewContext(expression,context)));
}
test('core passes repository goals to orchestrator after calls lose array metadata',()=>assert.deepEqual(handoff(),[goal]));
test('explicit operational coverage contract retains precedence',()=>{const record={...goal,requiredEvidenceKind:'platform_records'};assert.deepEqual(handoff({completionAssessment:{objectives:[record]}}),[record]);});
