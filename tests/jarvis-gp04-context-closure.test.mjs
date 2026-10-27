import test from 'node:test';
import assert from 'node:assert/strict';
import {compactGeneralObservation} from '../modules/terminal/qwen-general-pilot.js';
import {generalObjectives,summarizeGeneralEvidence,independentResearchProofs,verifyGeneralMission} from '../modules/terminal/qwen-general-evidence.js';
import {createLocalQwenActionSelector} from '../jarvis-qwen-local-action.js';

const urls=['https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist',
 'https://www.carrier.com/us/en/residential/hvac-resources/air-conditioners/ac-maintenance/',
 'https://www.trane.com/residential/en/resources/maintenance-tips/air-conditioners/'];
const instruction='Investiga mantenimiento preventivo de aire acondicionado residencial con tres fuentes independientes; cita fuentes literales y URLs exactas: '+urls.join(' ; ')+'. No modifiques codigo ni crees archivos.';
function records(){
 return urls.flatMap((url,i)=>{
  const paragraphs=Array.from({length:10},(_,n)=>'<p>'+([
   'Inspect air conditioning filters routinely and clean your cooling system when dust reduces airflow during regular operation.',
   'Maintain air conditioner coils and inspect the refrigerant unit carefully for dirt and debris affecting your home.',
   'Regular cooling system inspection and cleaning can help prevent costly maintenance problems for residential air conditioning.'
  ][n%3])+'</p>').join('');
  const dom='<html><title>Air Conditioning Maintenance Guide '+i+'</title><main>'+paragraphs+'</main></html>'+('<!-- offscreen historical content omitted -->'.repeat(4500));
  return [
   {name:'web.research',ok:true,args:{query:'air conditioner maintenance '+i,seedUrl:url},observation:{ok:true,status:'GROUNDED_LOCAL_PRIMARY',sources:[{url,title:'Air Conditioning Maintenance Guide '+i}],answer:'Grounded host inspection.'}},
   {name:'browser.inspect',ok:true,args:{url},observation:{ok:true,status:'BROWSER_INSPECT_SOURCE_HTML_VERIFIED',url,dom,sourceKind:'HTTPS_SOURCE_HTML_NOT_RENDERED_DOM',sourceBytes:dom.length}}
  ];
 });
}
test('GP04 retains full source HTML for audit but fits six source receipts in 8192-token local decision',async()=>{
 const rows=records(),original=JSON.stringify(rows);
 const goals=generalObjectives(instruction),proofs=independentResearchProofs(rows,instruction);
 assert.equal(goals.research,true);
 assert.equal(goals.code,false);
 assert.equal(proofs.length,3);
 const summary=summarizeGeneralEvidence(rows,goals,instruction);
 assert.equal(summary.finishEligible,true);
 const alternatives=summary.reportSchema.properties.sources.items.anyOf;
 assert.equal(alternatives.length,3,'schema must offer three independent organizations');
 assert.ok(alternatives.every(a=>a.properties.quote.enum.length<=2),'only two checked quotations per host offered to model');
 const items=proofs.map(p=>({url:p.url,title:p.title,date:null,quote:p.quotes[0]}));
 const modelObs=rows.map(r=>({name:r.name,args:r.args,ok:r.ok,observation:compactGeneralObservation(r.observation,false,true)}));
 assert.ok(original.length>100000,'raw HTML remains available for audit');
 assert.ok(JSON.stringify(modelObs).length<9500,'model gets small copies of evidence');
 const completedCalls=rows.map(r=>({name:r.name,args:r.args}));
 const ledger={completedCalls,certificationFailures:[],completedQueries:[],errors:[],rejectedToolChoices:[],completedSources:[],
  rule:'An exhausted query is not a completed mission. Never repeat a successful call. Correct grounding before retrying a failed call.'};
 let forwarded=false;
 const selector=createLocalQwenActionSelector({contextTokens:8192,fetchImpl:async(_url,init)=>{
  forwarded=true;
  const payload=JSON.parse(init.body);
  assert.equal(payload.model,'qwen3.5:9b');
  assert.equal(payload.options.num_ctx,8192);
  return {ok:true,json:async()=>({done_reason:'stop',message:{content:JSON.stringify({action:'FINISH',name:'',args:{},report:{sources:items}})},prompt_eval_count:1,eval_count:1})};
 }});
 const action=await selector({instruction,tools:[],observations:modelObs,evidenceSummary:summary,missionLedger:ledger});
 assert.equal(forwarded,true,'prompt must pass preflight and reach only the local model');
 assert.equal(action.finish,true);
 const verified=await verifyGeneralMission({instruction,receipts:rows,proposedReport:action.report,objectives:goals});
 assert.equal(verified.ok,true,verified.reason);
 assert.equal(JSON.stringify(rows),original,'full original receipts remain unmodified');
 const missing=rows.filter(r=>r.args?.url!==urls[2]&&r.args?.seedUrl!==urls[2]);
 const rejected=await verifyGeneralMission({instruction,receipts:missing,proposedReport:action.report,objectives:goals});
 assert.equal(rejected.ok,false,'two organizations never count as three');
});
