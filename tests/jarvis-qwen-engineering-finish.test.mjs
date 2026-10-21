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

test('Qwen can draft a final report with unresolved objectives, but independent audit still rejects success',async()=>{
 let finalDraftRequested=false;
 const result=await runQwenAuthorizedCycle({...options,
  summarizeEvidence:()=>({finishEligible:false,deliveryGaps:[{reason:'CODE_CONCURRENCY_EMULATOR_EVIDENCE_REQUIRED'}]}),
  selectNextAction:async ctx=>{
   finalDraftRequested=ctx.tools.length===0&&ctx.evidenceSummary.reportOnly===true&&
     ctx.evidenceSummary.unverifiedObjectives[0].reason==='CODE_CONCURRENCY_EMULATOR_EVIDENCE_REQUIRED';
   return {finish:true,report};
  },
  verifyCompletion:async()=>({ok:false,reason:'CODE_CONCURRENCY_EMULATOR_EVIDENCE_REQUIRED',
    objectives:[{reason:'CODE_CONCURRENCY_EMULATOR_EVIDENCE_REQUIRED',satisfied:false}]})
 });
 assert.equal(finalDraftRequested,true);
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.reason,'CODE_CONCURRENCY_EMULATOR_EVIDENCE_REQUIRED');
 assert.equal(result.report,'');
 assert.equal(result.modelDecisions,1);
});

test('official V142 HTML-to-runner imports use a fresh version and expose the report provenance',async()=>{
 const {readFileSync}=await import('node:fs');
 const root=new URL('../',import.meta.url);
 const core=readFileSync(new URL('gestia-core/gestia-core.js',root),'utf8');
 const general=readFileSync(new URL('modules/terminal/qwen-general-pilot.js',root),'utf8');
 const direct=readFileSync(new URL('modules/terminal/qwen-direct-pilot.js',root),'utf8');
 const version='v142-engineering-report-20261021-v16';
 assert.ok(core.includes('qwen-general-pilot.js?release='+version));
 assert.ok(general.includes('qwen-direct-pilot.js?release='+version));
 assert.ok(general.includes('qwen-general-evidence.js?release='+version));
 assert.ok(direct.includes('jarvis-qwen-direct-cycle.js?release='+version));
 assert.match(direct,/metrics\.finalReportFromQwen=/);
 assert.match(general,/Informe Qwen generado:/);
});

test('Qwen must see actual line-numbered source excerpts; text omitted is not a verified code analysis',async()=>{
 const {compactVerifiedEngineeringSource}=await import('../modules/terminal/qwen-engineering-source-excerpt.js');
 const raw={
  file:'functions/index.js',startLine:1024,
  content:'exports.solicitarRetiro = functions.https.onCall(async (data, context) => {\n' +
  '  const amount = Number(data.monto);\n' +
  '  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_AMOUNT");\n' +
  '  return amount;\n' +
  '});'
 };
 const compact=compactVerifiedEngineeringSource(raw);
 assert.equal(compact.file,'functions/index.js');
 assert.equal(compact.sourceTextOmitted,false);
 assert.match(compact.sourceExcerpt,/1024: exports\.solicitarRetiro/);
 assert.match(compact.sourceExcerpt,/1026:.*Number\.isFinite/);
 assert.doesNotMatch(JSON.stringify(compact),/dataBase64|privateKey/);
 assert.ok(compact.sourceExcerpt.length<=3200);
 assert.equal(compactVerifiedEngineeringSource({file:'functions/index.js'}).sourceTextOmitted,true);
});

test('auditor refuses a claimed finished payout report when the canonical source was not inspected',async()=>{
 const withoutCanonical=receipts.map(r=>r.name==='repo.read'?{...r,args:{file:'tests/jarvis-qwen-engineering-pilot.test.mjs'},
  observation:{verifiedRead:{file:'tests/jarvis-qwen-engineering-pilot.test.mjs',content:'test("requestPayout",()=>{})'}}}:r);
 assert.equal(engineeringReportVerified(report,withoutCanonical),false);
 const vague='Informe requestPayout: leí functions/secure-entry.js pero sourceTextOmitted y no se dispone del contenido textual del código fuente para validar montos; tests.run pasó. No hay evidencia directa del código.';
 assert.equal(engineeringReportVerified(vague,receipts),false);
});

test('payout source discovery first reads the canonical function, not generic tool implementations',async()=>{
 const {prioritizeGeneralCodeCatalog}=await import('../modules/terminal/qwen-general-pilot.js');
 const toolNames=['repo.grep','repo.read','tests.run'];
 const offered=toolNames.map(name=>({name,inputSchema:{type:'object',properties:{term:{type:'string'},file:{type:'string'},command:{type:'string'}},required:[]}}));
 const query='Audita requestPayout y demuestra validación de montos con pruebas.';
 const initial=prioritizeGeneralCodeCatalog(offered,[],query);
 assert.equal(initial[0].inputSchema.properties.term.const,'requestPayout');
 const alias={name:'repo.grep',ok:true,args:{term:'requestPayout'},observation:{ok:true,matches:[
  {file:'modules/terminal/qwen-general-pilot.js'},
  {file:'tests/jarvis-qwen-engineering-pilot.test.mjs'},
  {file:'functions/legacy-security-hotfix.js'}
 ]}};
 const first=prioritizeGeneralCodeCatalog(offered,[alias],query);
 assert.equal(first[0].name,'repo.read');
 assert.deepEqual(first[0].inputSchema.properties.file.enum,['functions/legacy-security-hotfix.js',
   'tests/jarvis-qwen-engineering-pilot.test.mjs']);
 const read={name:'repo.read',ok:true,args:{file:'functions/legacy-security-hotfix.js'},
  observation:{ok:true,verifiedRead:{file:'functions/legacy-security-hotfix.js',content:'const requestPayout=canonicalExports.solicitarRetiro;'}}};
 const next=prioritizeGeneralCodeCatalog(offered,[alias,read],query);
 assert.equal(next[0].name,'repo.grep');
 assert.equal(next[0].inputSchema.properties.term.const,'solicitarRetiro');
 const canonical={name:'repo.grep',ok:true,args:{term:'solicitarRetiro'},observation:{ok:true,matches:[
  {file:'functions/index.js'},{file:'tests/hotfix-legacy.test.mjs'}
 ]}};
 const after=prioritizeGeneralCodeCatalog(offered,[alias,read,canonical],query);
 assert.equal(after[0].name,'repo.read');
 assert.equal(after[0].inputSchema.properties.file.enum[0],'functions/index.js');
});
