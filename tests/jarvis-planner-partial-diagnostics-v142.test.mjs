import test from 'node:test';
import assert from 'node:assert/strict';
import {composeEvidenceGroundedConversation} from '../gestia-core/jarvis/jarvis.conversation.composer.js';
import {readFileSync} from 'node:fs';

test('failed planner reports precise bounded code and verified repo inventory as PARTIAL, never success',async()=>{
 const result=await composeEvidenceGroundedConversation({
  instruction:'Ejecuta repo.audit sobre el repositorio activo y entrega diez rutas',
  executeConversation:async()=>{throw Error('NO_MODEL_COMPOSITION_ON_UNVERIFIED_MISSION');},
  evidenceItems:[{
   name:'mission.outcome',observation:{
    ok:false,status:'PARTIAL',reason:'PLANNER_UNAVAILABLE',
    plannerFailureCode:'LOCAL_SEMANTIC_RESPONSE_INCOMPLETE',
    completionAssessment:{validationFailed:true,objectives:[{objective:'Verificar inventario',satisfied:false,limitation:'No se certificó el cierre'}]}
   }
  },{
   name:'repo.audit',observation:{
    ok:true,executionOk:true,blocked:false,status:'REPO_AUDIT_READY',
    inventoryEvidence:{source:'LIVE_REPOSITORY_INVENTORY',counts:{filesScanned:124}},
    objectiveSatisfied:false
   }
  }]
 });
 assert.equal(result.status,'CONVERSATIONAL_EVIDENCE_INSUFFICIENT');
 assert.match(result.text,/Motivo final: PLANNER_UNAVAILABLE/);
 assert.match(result.text,/Diagnóstico técnico del planificador: LOCAL_SEMANTIC_RESPONSE_INCOMPLETE/);
 assert.match(result.text,/Inventario estructural observado: 124 archivos/);
 assert.match(result.text,/no certifica el cierre/);
 assert.doesNotMatch(result.text,/Misi[oó]n verificada|VERIFIED_COMPLETE/);
});
test('technical details are bounded and never copy the original failed provider prompt into mission.outcome',()=>{
 const source=readFileSync('gestia-core/gestia-core.js','utf8');
 assert.match(source,/plannerFailureCode: missionResult.reason === "PLANNER_UNAVAILABLE"/);
 assert.match(source,/missionResult.errors \|\| \[\]/);
 assert.match(source,/\.slice\(0, 160\)/);
 assert.match(source,/ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-/);
});
