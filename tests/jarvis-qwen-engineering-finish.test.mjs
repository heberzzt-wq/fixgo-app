import test from 'node:test';
import assert from 'node:assert/strict';
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';
import {engineeringReportVerified,verifyGeneralMission,generalObjectives} from '../modules/terminal/qwen-general-evidence.js';

const instruction='Audita código requestPayout e informa validación de importes y pruebas, sin preparar parches.';
const file='functions/secure-entry.js';
const report='Dictamen de requestPayout: examiné el archivo functions/secure-entry.js, donde se valida el importe en solicitarRetiro. La suite de pruebas tests.run con pilot:security terminó correctamente. Esto permite atribuir solo los casos ejecutados de monto negativo, cero y validación; no demuestra por sí solo pruebas simultáneas o idempotencia con Firebase Emulator. No se generaron parches.';
const receipts=[
 {name:'repo.grep',ok:true,args:{term:'requestPayout'},observation:{ok:true,matches:[{file}]}},
 {name:'repo.read',ok:true,args:{file},observation:{ok:true,verifiedRead:{file,content:'function solicitarRetiro(input){return Number.isFinite(input.amount)}'}}},
 {name:'tests.run',ok:true,args:{command:'pilot:security'},observation:{ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}}
];
const catalog=[{name:'repo.read',inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}}];
const options={
 instruction,catalog,initialReceipts:receipts,requireFinalReport:true,maximumSteps:3,stepLimit:8,
 repairIncomplete:true,
 catalogForEvidence:()=>[],
 summarizeEvidence:()=>({finishEligible:true,deliveryGaps:[]}),
 authorize:async()=>({ok:true}),execute:async()=>({ok:true}),
 verifyCompletion:async({proposedReport,receipts:rec})=>verifyGeneralMission({
  instruction,receipts:rec,proposedReport,objectives:generalObjectives(instruction)
 })
};

test('the exhausted code tool catalog obtains a Qwen report before certifying the mission',async()=>{
 let sawEmpty=false;
 const result=await runQwenAuthorizedCycle({...options,selectNextAction:async ctx=>{
  sawEmpty=Array.isArray(ctx.tools)&&ctx.tools.length===0&&ctx.evidenceSummary.finishEligible===true;
  return {finish:true,report};
 }});
 assert.equal(sawEmpty,true);
 assert.equal(result.status,'SUCCESS');
 assert.equal(result.report,report);
 assert.equal(result.modelDecisions,1);
 assert.equal(engineeringReportVerified(report,receipts),true);
});

test('empty or generic answer never certifies engineering success despite valid tool receipts',async()=>{
 for(const answer of ['', 'La misión terminó correctamente.', 'Se ejecutaron las pruebas satisfactoriamente.']){
  const result=await runQwenAuthorizedCycle({...options,selectNextAction:async()=>({finish:true,report:answer})});
  assert.equal(result.status,'PARTIAL',answer);
  assert.equal(result.report,'');
  assert.ok(['ENGINEERING_FINAL_REPORT_REQUIRED','ENGINEERING_SOURCE_BOUND_REPORT_REQUIRED'].includes(result.reason));
 }
});

test('report citing unobserved files is refused, even with a passing suite',async()=>{
 const wrong=report.replace('functions/secure-entry.js','functions/nonexistent-payment-handler.js');
 assert.equal(engineeringReportVerified(wrong,receipts),false);
 const result=await runQwenAuthorizedCycle({...options,selectNextAction:async()=>({finish:true,report:wrong})});
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.certification?.objectives?.some(x=>x.reason==='ENGINEERING_SOURCE_BOUND_REPORT_REQUIRED'),true);
});

test('internal planning instructions cannot add an unrequested emulator objective',async()=>{
 const {codeConcurrencyRequested}=await import('../modules/terminal/qwen-general-evidence.js');
 const original=instruction;
 const modelText=original+' No atribuyas cobertura de concurrencia a pruebas unitarias.';
 assert.equal(codeConcurrencyRequested(original),false);
 assert.equal(codeConcurrencyRequested(modelText),true);
 const authentic=await verifyGeneralMission({
  instruction:original,receipts,proposedReport:report,objectives:generalObjectives(original)
 });
 assert.equal(authentic.ok,true);
 const erroneouslyExpanded=await verifyGeneralMission({
  instruction:modelText,receipts,proposedReport:report,objectives:generalObjectives(original)
 });
 assert.equal(erroneouslyExpanded.ok,false);
 assert.ok(erroneouslyExpanded.objectives.some(x=>x.reason==='CODE_CONCURRENCY_EMULATOR_EVIDENCE_REQUIRED'));
 const fs=await import('node:fs');
 const source=fs.readFileSync(new URL('../modules/terminal/qwen-general-pilot.js',import.meta.url),'utf8');
 assert.match(source,/verifyObjectives:args=>verifyGeneralMission\(\{\.\.\.args,instruction:options\.instruction,objectives\}\)/);
 assert.match(source,/catalogForEvidence:\(catalog,receipts\)=>prioritizeGeneralAdvertisingCatalog\(catalog,receipts,objectives,options\.instruction\)/);
});
