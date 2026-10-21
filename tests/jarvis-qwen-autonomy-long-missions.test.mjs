import test from 'node:test';
import assert from 'node:assert/strict';
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';
import {generalMissionAutonomyBudget,runGeneralAutonomousPhases} from '../modules/terminal/qwen-general-pilot.js';

test('long research request gets more than twenty steps without claiming limitless execution',()=>{
 const budget=generalMissionAutonomyBudget({research:true,document:true},'Investiga evidencia clínica y entrega PDF y DOCX');
 assert.equal(budget.stepsPerPhase,72);
 assert.equal(budget.maxPhases,3);
 assert.ok(budget.stepsPerPhase*budget.maxPhases>20);
 assert.deepEqual(generalMissionAutonomyBudget({capabilities:true},'Revisa las capacidades'),{stepsPerPhase:16,maxPhases:1});
});

test('authenticated cycle can execute 55 distinct verified tool actions in one phase',async()=>{
 const tool={name:'read',inputSchema:{type:'object',properties:{index:{type:'number'}},required:['index']}};
 let calls=0,decisions=0;
 const result=await runQwenAuthorizedCycle({
  instruction:'Read 55 pages of a lengthy archive',catalog:[tool],maximumSteps:72,stepLimit:96,
  repairIncomplete:true,catalogForEvidence:catalog=>catalog,
  selectNextAction:async()=>++decisions<=55?{toolCall:{name:'read',args:{index:decisions}}}:{finish:true,report:'Factual results independently verified'},
  authorize:async()=>({ok:true}),execute:async()=>{calls++;return {ok:true,status:'READ_OK'};},
  verifyCompletion:async({receipts})=>({ok:receipts.length===55,reason:'VERIFIED_COMPLETE'})
 });
 assert.equal(calls,55);
 assert.equal(result.status,'SUCCESS');
 assert.equal(result.receipts.length,55);
 assert.equal(result.modelDecisions,56);
});

test('checkpoint automatically resumes from validated successful receipts, without starting over',async()=>{
 const budget={stepsPerPhase:72,maxPhases:3};
 const seen=[],events=[];
 const res=await runGeneralAutonomousPhases({
  budget,onProgress:event=>events.push(event),
  executePhase:async(receipts,phase,steps)=>{
   seen.push({prior:receipts.length,phase,steps});
   const r=(name)=>({name,args:{phase},ok:true,observation:{ok:true,status:'EVIDENCE_READ'}});
   if(phase===0)return {status:'PARTIAL',reason:'STEP_LIMIT_REACHED',receipts:[...receipts,r('first')],metrics:{inferences:30,promptTokens:100,inferenceMs:200,totalMs:210}};
   return {status:'SUCCESS',reason:'VERIFIED_COMPLETE',receipts:[...receipts,r('second')],metrics:{inferences:0,promptTokens:0,inferenceMs:0,totalMs:15}};
  }
 });
 assert.deepEqual(seen,[{prior:0,phase:0,steps:72},{prior:1,phase:1,steps:72}]);
 assert.equal(res.status,'SUCCESS');
 assert.equal(res.receipts.length,2);
 assert.equal(res.metrics.autonomousPhases,2);
 assert.equal(res.metrics.inferences,30);
 assert.equal(res.metrics.totalMs,225);
 assert.equal(events.length,1);
 assert.equal(events[0].phase,'QWEN_AUTONOMOUS_CHECKPOINT');
});

test('no progress or failed authorization never triggers extra autonomous phases',async()=>{
 const budget={stepsPerPhase:64,maxPhases:3};
 for(const scenario of [
   {status:'PARTIAL',reason:'STEP_LIMIT_REACHED',receipts:[]},
   {status:'PARTIAL',reason:'INDEPENDENT_AUTHORIZATION_DENIED',receipts:[{name:'one',ok:false}]},
   {status:'PARTIAL',reason:'STEP_LIMIT_REACHED',receipts:[{name:'one',ok:false}]}
 ]){
  let calls=0;
  const r=await runGeneralAutonomousPhases({budget,executePhase:async()=>{calls++;return {...scenario,metrics:{inferences:1,totalMs:1}};}});
  assert.equal(calls,1,scenario.reason);
  assert.equal(r.status,'PARTIAL');
 }
});

test('no useful tool progress ends an unproductive model loop before wasting 72 decisions',async()=>{
 const tool={name:'web.research',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}};
 let executed=0;
 const r=await runQwenAuthorizedCycle({
  instruction:'Investigate with source inspection',catalog:[tool],maximumSteps:72,stepLimit:96,repairIncomplete:true,
  catalogForEvidence:catalog=>catalog,
  selectNextAction:async()=>({toolCall:{name:'web.research',args:{query:'duplicate search'}}}),
  authorize:async()=>({ok:true}),
  execute:async()=>{executed++;return {ok:true,status:'SEARCHED'};},
  verifyCompletion:async()=>({ok:false})
 });
 assert.equal(executed,1);
 assert.equal(r.status,'PARTIAL');
 assert.ok(['REPEATED_TOOL_CALL','NO_USEFUL_PROGRESS'].includes(r.reason));
 assert.ok(r.modelDecisions<14);
});

test('research discovery works with medical or financial topics, not HVAC-only vocabulary',async()=>{
 const {prioritizeResearchDiscovery}=await import('../modules/terminal/qwen-general-pilot.js');
 const catalog=['web.research','browser.inspect'].map(name=>({name,inputSchema:{type:'object',properties:{query:{type:'string'},url:{type:'string'}},required:[]}}));
 const instruction='Investigación real: recomendaciones de prevención y seguimiento de diabetes tipo 2 en adultos. Usa fuentes independientes y no inventes resultados clínicos.';
 const first=prioritizeResearchDiscovery(catalog,[],instruction);
 assert.deepEqual(first.map(t=>t.name),['web.research']);
 assert.match(first[0].inputSchema.properties.query.const,/diabetes/i);
 assert.doesNotMatch(first[0].inputSchema.properties.query.const,/air conditioner/i);
 const url='https://health-research.gov/science/diabetes-prevention';
 const receipts=[{name:'web.research',ok:true,args:{query:first[0].inputSchema.properties.query.const},observation:{
  ok:true,sources:[{url,title:'Diabetes prevention research'}]}}];
 const next=prioritizeResearchDiscovery(catalog,receipts,instruction);
 assert.deepEqual(next.map(t=>t.name),['browser.inspect']);
 assert.deepEqual(next[0].inputSchema.properties.url.enum,[url]);
 const checked=[...receipts,{name:'browser.inspect',ok:true,args:{url},observation:{ok:true,url,dom:'<title>Diabetes prevention research</title><main>No attributable medical paragraphs available.</main>'}}];
 const {independentResearchProofs}=await import('../modules/terminal/qwen-general-evidence.js');
 assert.equal(independentResearchProofs(checked,instruction).length,0,'navigation cannot count as medical evidence');
});

test('medical mission subject is extracted after the colon, never the word COMO',async()=>{
 const {researchTopic,researchQuoteRelevant}=await import('../modules/terminal/qwen-general-evidence.js');
 const instruction='MISIÓN NUEVA. INVESTIGA COMO DIVULGACIÓN MÉDICA GENERAL: prevención de diabetes tipo 2, alimentación y actividad física. Busca who.int cdc.gov y niddk.nih.gov';
 assert.equal(researchTopic(instruction),'prevención de diabetes tipo 2');
 const quote='Antes de presentar diabetes tipo 2, la mayoría de las personas tiene prediabetes. Esto ocurre cuando su nivel de azúcar';
 assert.equal(researchQuoteRelevant(quote,instruction,'Prevenir la diabetes tipo 2 | CDC'),true);
 assert.equal(researchQuoteRelevant('Journey with us beyond the shimmering surface of Italy and its most iconic lake',instruction,'The ultimate guide to Lake Como'),false);
});
test('medical discovery routes toward WHO and excludes Como tourism results',async()=>{
 const {prioritizeResearchDiscovery}=await import('../modules/terminal/qwen-general-pilot.js');
 const instruction='INVESTIGA COMO DIVULGACIÓN MÉDICA GENERAL: prevención de diabetes tipo 2, alimentación y actividad física. Busca who.int cdc.gov y niddk.nih.gov';
 const catalog=['web.research','browser.inspect'].map(name=>({name,inputSchema:{type:'object',properties:{query:{type:'string'},url:{type:'string'}},required:[]}}));
 const searched={name:'web.research',ok:true,args:{query:'site:cdc.gov prevención de diabetes'},observation:{ok:true,sources:[
  {url:'https://lakecomotravel.com/como-italy/',title:'Lake Como travel guide'},
  {url:'https://www.who.int/es/news-room/fact-sheets/detail/diabetes',title:'Diabetes | Organización Mundial de la Salud'}
 ]}};
 const next=prioritizeResearchDiscovery(catalog,[searched],instruction);
 assert.deepEqual(next.map(t=>t.name),['browser.inspect']);
 assert.deepEqual(next[0].inputSchema.properties.url.enum,['https://www.who.int/es/news-room/fact-sheets/detail/diabetes']);
});
