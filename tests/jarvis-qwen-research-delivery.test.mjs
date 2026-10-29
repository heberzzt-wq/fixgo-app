import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {researchSourceProofs,independentResearchProofs,researchOfficeContent,researchOfficeContentVerified,generalObjectives} from '../modules/terminal/qwen-general-evidence.js';
import {prioritizeGeneralAdvertisingCatalog,generalToolCatalog} from '../modules/terminal/qwen-general-pilot.js';
import {buildDocxArtifactBuffer,validateDocxArtifactFile} from '../jarvis-docx-artifact.js';
const names=['example-one.org','example-two.gov','example-three.edu'];
const p=(url)=>({
 name:'browser.inspect',ok:true,args:{url},observation:{ok:true,url,
 dom:'<html><head><title>Independent Maintenance Guide</title></head><main><p>Inspecting filters regularly and checking ventilation may help identify possible obstructions before normal use of a residential cooling system.</p><p>Any work involving electrical components or refrigerant handling should be evaluated by appropriately qualified professionals using the equipment manual.</p></main></html>'}});
const build=(count=3)=>[
 {name:'web.research',ok:true,observation:{ok:true,sources:names.slice(0,count).map(n=>({url:'https://'+n+'/air-guide'}))}},
 ...names.slice(0,count).map(n=>p('https://'+n+'/air-guide'))
];
const prompt='Investiga aire acondicionado residencial con tres fuentes independientes y entrega informe DOCX y PDF.';
const mock=(name)=>({name,inputSchema:{type:'object',properties:{format:{type:'string'},title:{type:'string'},content:{type:'string'},output:{type:'string'},url:{type:'string'},query:{type:'string'}},required:[]}});

test('three user-provided HTTPS source URLs are searched separately, never credited without inspection',async()=>{
 const {prioritizeResearchDiscovery}=await import('../modules/terminal/qwen-general-pilot.js');
 const urls=[
  'https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist',
  'https://www.carrier.com/us/en/residential/hvac-resources/air-conditioners/ac-maintenance/',
  'https://www.trane.com/residential/en/resources/maintenance-tips/air-conditioners/'
 ];
 const instruction='Investiga mantenimiento preventivo de aire acondicionado residencial con tres fuentes independientes. URLs: '+urls.join(' ; ')+'. No crees archivos ni modifiques codigo.';
 const catalog=['web.research','browser.inspect'].map(mock);
 const goals=generalObjectives(instruction);
 assert.equal(goals.research,true);
 assert.equal(goals.document,false);
 const runtime={list:()=>catalog};
 const policy={accept:()=>true,artifactRoot:'.jarvis-artifacts/qwen-general/general-fixture/'};
 const liveCatalog=generalToolCatalog(runtime,policy,goals,instruction);
 const routed=prioritizeGeneralAdvertisingCatalog(liveCatalog,[],goals,instruction);
 assert.deepEqual(routed.map(t=>t.name),['web.research']);
 assert.equal(routed[0].inputSchema.properties.seedUrl.const,urls[0]);
 const first=prioritizeResearchDiscovery(catalog,[],instruction);
 assert.deepEqual(first.map(x=>x.name),['web.research']);
 assert.equal(first[0].inputSchema.properties.seedUrl.const,urls[0]);
 assert.equal(first[0].inputSchema.properties.allowedDomain.const,'energystar.gov');
 assert.equal(first[0].inputSchema.properties.researchGoal.const,'RESEARCH_1');
 const web={name:'web.research',ok:true,args:{query:first[0].inputSchema.properties.query.const,seedUrl:urls[0],researchGoal:'RESEARCH_1'},observation:{ok:true,sources:[{url:urls[0],title:'Maintenance Checklist | ENERGY STAR'}]}};
 const inspect=prioritizeResearchDiscovery(catalog,[web],instruction);
 assert.deepEqual(inspect.map(x=>x.name),['browser.inspect']);
 assert.deepEqual(inspect[0].inputSchema.properties.url.enum,[urls[0]]);
 const evidence={name:'browser.inspect',ok:true,args:{url:urls[0]},observation:{ok:true,url:urls[0],dom:'<html><title>Maintenance Checklist | ENERGY STAR</title><main><li>Check and inspect the condensate drain in your central air conditioner to prevent humidity problems and water damage.</li></main></html>'}};
 const next=prioritizeResearchDiscovery(catalog,[web,evidence],instruction);
 assert.deepEqual(next.map(x=>x.name),['web.research']);
 assert.equal(next[0].inputSchema.properties.seedUrl.const,urls[1]);
 assert.equal(next[0].inputSchema.properties.researchGoal.const,'RESEARCH_2');
 assert.ok(!next[0].inputSchema.properties.query.const.includes('site:localhost'));
});

test('relevant HVAC list item is quotable while a menu list cannot impersonate a source',()=>{
 const url='https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist';
 const instruction='Investiga mantenimiento preventivo de aire acondicionado residencial con fuentes independientes.';
 const search={name:'web.research',ok:true,observation:{ok:true,sources:[{url}]}};
 const inspected={name:'browser.inspect',ok:true,args:{url},observation:{ok:true,url,
  dom:'<html><title>Maintenance Checklist | ENERGY STAR</title><nav><ul><li>Sign in for free and click on any navigation menu item to continue viewing maintenance services.</li></ul></nav><main><ul><li>Check and inspect the condensate drain in your central air conditioner to prevent water damage and indoor humidity issues.</li></ul></main></html>'}};
 const proof=researchSourceProofs([search,inspected],instruction);
 assert.equal(proof.length,1);
 assert.equal(proof[0].quotes.length,1);
 assert.match(proof[0].quotes[0],/condensate drain in your central air conditioner/);
 assert.ok(!proof[0].quotes[0].includes('Sign in'));
});
test('cleaning AC filters requires actionably relevant quotes, not generic HVAC source boilerplate',async()=>{
 const instruction='Investiga cómo limpiar correctamente los filtros de un aire acondicionado residencial con tres fuentes independientes y citas literales.';
 const examples=[
  {host:'duct-cleaning.org',title:'HVAC Duct Efficiency Study',quote:'This research explores HVAC cleaning in large buildings and shows energy efficiency improvements from maintenance work.'},
  {host:'general-guide.net',title:'AC Filter Maintenance Best Practices',quote:'Recommendations are based on manufacturer guidelines and contractor surveys about general home services and maintenance schedules.'},
  {host:'aircare.edu',title:'Air Conditioner Filter Care',quote:'First turn off the air conditioner, remove its washable filter, clean the filter gently and let it dry before reinstalling.'}
 ];
 const receipts=[{ok:true,name:'web.research',observation:{ok:true,sources:examples.map(s=>({url:'https://'+s.host+'/article'}))}},
   ...examples.map(s=>({ok:true,name:'browser.inspect',args:{url:'https://'+s.host+'/article'},observation:{ok:true,url:'https://'+s.host+'/article',dom:'<title>'+s.title+'</title><main><p>'+s.quote+'</p></main>'}}))];
 assert.equal(researchSourceProofs(receipts,instruction).length,1,'unrelated duct cleaning and attribution boilerplate are not filter instructions');
 assert.equal(independentResearchProofs(receipts,instruction).length,1);
 const {verifyGeneralMission}=await import('../modules/terminal/qwen-general-evidence.js');
 const report=JSON.stringify({sources:examples.map(s=>({url:'https://'+s.host+'/article',title:s.title,date:null,quote:s.quote}))});
 assert.equal((await verifyGeneralMission({instruction,receipts,proposedReport:report})).ok,false,
  'three inspected hosts are not automatically three sources supporting the requested instructions');
});

test('filter cleaning buried later in a real paragraph is quoted without fabricating sentences',()=>{
 const instruction='Investiga cómo limpiar los filtros de un aire acondicionado residencial con fuentes verificables.';
 const url='https://air-guide.edu/clean-filter',intro='Air conditioner equipment benefits from regular maintenance and routine inspection, which can help identify problems. General energy information about cooling equipment describes efficiency and weather factors affecting household energy consumption in different buildings.';
 const actual='To clean the washable air filter, switch off the unit, remove the filter, rinse it gently and let it dry completely before reinstalling it.';
 const dom='<title>Air conditioner filter care</title><main><p>'+intro+' '+actual+'</p></main>';
 const receipts=[{name:'web.research',ok:true,observation:{ok:true,sources:[{url}]}},
  {name:'browser.inspect',ok:true,observation:{ok:true,url,dom}}];
 const proofs=researchSourceProofs(receipts,instruction);
 assert.equal(proofs.length,1);
 assert.ok(proofs[0].quotes.some(q=>q.includes('filter')&&q.includes('rinse')&&q.includes('dry')),JSON.stringify(proofs));
 assert.ok(proofs[0].quotes.every(q=>dom.includes(q)));
});
test('unquoted third page cannot release a document to Qwen',()=>{
 const rows=build(3);
 rows.at(-1).observation.dom='<html><title>Empty government directory</title><main>Navigation only</main></html>';
 assert.equal(independentResearchProofs(rows).length,2);
 const runtime={list:()=>['web.research','browser.inspect','document.create','artifact.read','media.library'].map(mock)};
 const policy={accept:()=>true,artifactRoot:'.jarvis-artifacts/qwen-general/general-fixture/',audioPrefix:'.jarvis-artifacts/audio/general-fixture-',imagePrefix:'general-fixture-'};
 const tools=generalToolCatalog(runtime,policy,generalObjectives(prompt),prompt);
 const offered=prioritizeGeneralAdvertisingCatalog(tools,rows,generalObjectives(prompt),prompt);
 assert.ok(offered.every(t=>['web.research','browser.inspect'].includes(t.name)));
 assert.equal(researchOfficeContent(rows),null);
});

test('three different inspected hosts yield host-bound docx/pdf content with literal quotations',async t=>{
 const rows=build(3),sources=independentResearchProofs(rows),body=researchOfficeContent(rows);
 assert.equal(sources.length,3);
 assert.ok(body&&body.split(/\s+/).length>=80);
 assert.equal((body.match(/^## /gm)||[]).length>=3,true);
 assert.equal(researchOfficeContentVerified(rows,body),true);
 for(const source of sources){assert.ok(body.includes(source.url));assert.ok(body.includes(source.quotes[0]));}
 const root=mkdtempSync(path.join(os.tmpdir(),'jarvis-research-docx-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const built=await buildDocxArtifactBuffer({title:'Informe verificado',content:body}),output=path.join(root,'investigacion.docx');
 writeFileSync(output,built.buffer);
 const validation=await validateDocxArtifactFile({file:output,contract:{documentKind:'original_draft',minWords:80,minSections:3},expectedValidation:{}});
 assert.equal(validation.ok,true,JSON.stringify(validation.failures));
 const runtime={list:()=>['web.research','browser.inspect','document.create','artifact.read','media.library'].map(mock)};
 const policy={accept:()=>true,artifactRoot:'.jarvis-artifacts/qwen-general/general-fixture/',audioPrefix:'.jarvis-artifacts/audio/general-fixture-',imagePrefix:'general-fixture-'};
 const catalog=generalToolCatalog(runtime,policy,generalObjectives(prompt),prompt);
 const offered=prioritizeGeneralAdvertisingCatalog(catalog,rows,generalObjectives(prompt),prompt);
 assert.deepEqual(offered.map(x=>x.name),['document.create']);
 assert.equal(offered[0].inputSchema.properties.content.const,body);
});

test('different pages from the same host cannot impersonate independent organizations',()=>{
 const url='https://example-one.org/other';
 const rows=build(2);
 rows[0].observation.sources.push({url});rows.push(p(url));
 assert.equal(researchSourceProofs(rows).length,3);
 assert.equal(independentResearchProofs(rows).length,2);
 assert.equal(researchOfficeContent(rows),null);
});

test('negative safety rule no modificar codigo does not request a programming mission',async()=>{
 const {unavailableMissionOperations}=await import('../modules/terminal/qwen-general-contract.js');
 assert.deepEqual(unavailableMissionOperations('Investiga aire acondicionado, crea DOCX y PDF. No usar nube de IA, no tocar bridge 3344, no modificar código, no commit, push ni deploy.'),[]);
 assert.deepEqual(unavailableMissionOperations('Corrige el código de un proyecto de prueba'),['aplicación segura de parches y pruebas de código desde este piloto']);
 assert.deepEqual(unavailableMissionOperations('No modifiques código; necesito corregir código en proyecto de prueba.'),['aplicación segura de parches y pruebas de código desde este piloto']);
});

test('marketing microsites and unrelated help-mode excerpts cannot fake three independent HVAC sources',()=>{
 const sources=[
 {url:'https://www.carrier.com/residential/en/ca/products/air-conditioners/ac-maintenance/',quote:'Regular air conditioning service can minimize many of the issues caused by build-up of dirt and debris inside an air conditioner.'},
 {url:'https://www.carrier.com.mx/mantenimiento/',quote:'Nuestro mantenimiento de aire acondicionado incluye filtros y limpieza para apoyar un servicio confiable durante el calor.'},
 {url:'https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=600005CK.TXT',quote:'You are now in HELP mode. Click on any control for information on what that control does.'}
 ];
 const receipts=[{name:'web.research',args:{query:'mantenimiento preventivo aire acondicionado residencial'},ok:true,observation:{ok:true,sources:sources.map(s=>({url:s.url}))}},
 ...sources.map(s=>({name:'browser.inspect',args:{url:s.url},ok:true,observation:{ok:true,url:s.url,dom:'<title>Source</title><main><p>'+s.quote+'</p></main>'}}))];
 assert.equal(independentResearchProofs(receipts).length,1);
 assert.equal(researchOfficeContent(receipts),null);
});

test('discovery pivots from a credited Carrier page toward a different requested organization instead of repeating searches',async()=>{
 const {prioritizeResearchDiscovery}=await import('../modules/terminal/qwen-general-pilot.js');
 const url='https://www.carrier.com/residential/en/ca/products/air-conditioners/ac-maintenance/';
 const sources=[{url,title:'Air Conditioner Maintenance | Carrier'}];
 const receipt={name:'web.research',args:{query:'mantenimiento preventivo aire acondicionado residencial'},ok:true,observation:{ok:true,sources}};
 const inspected={name:'browser.inspect',args:{url},ok:true,observation:{ok:true,url,dom:'<title>Air Conditioner Maintenance | Carrier</title><main><p>Regular air conditioner maintenance includes cleaning filters, inspecting air conditioning units, and servicing cooling systems safely.</p></main>'}};
 const instruction='Investiga mantenimiento preventivo de aire acondicionado con energy.gov, energystar.gov y carrier.com. Entrega PDF y DOCX.';
 const catalog=['web.research','browser.inspect'].map(mock);
 const next=prioritizeResearchDiscovery(catalog,[receipt,inspected],instruction);
 assert.deepEqual(next.map(t=>t.name),['web.research']);
 assert.ok(next[0].inputSchema.properties.query.const.includes('site:energy.gov'));
 const second={name:'web.research',args:{query:next[0].inputSchema.properties.query.const},ok:true,observation:{ok:true,sources:[{url:'https://www.energy.gov/energysaver/air-conditioner-maintenance',title:'Air Conditioner Maintenance | Department of Energy'}]}};
 const next2=prioritizeResearchDiscovery(catalog,[receipt,inspected,second],instruction);
 assert.deepEqual(next2.map(t=>t.name),['browser.inspect']);
 assert.deepEqual(next2[0].inputSchema.properties.url.enum,['https://www.energy.gov/energysaver/air-conditioner-maintenance']);
});

test('a failed public HTML 404 becomes a bounded alternative-read receipt, never a successful source',async()=>{
 const {createQwenAuthenticatedToolBridge,missingPublicHtmlSourceFailure}=await import('../jarvis-qwen-tool-bridge.js');
 const {planPlatformRecovery}=await import('../jarvis-platform-self-healing.js');
 const first='https://www.energystar.gov/obsolete-filter-advice';
 const source={name:'browser.inspect',inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url']},mutates:false,requiresApproval:false};
 const failure={ok:false,status:'BROWSER_COMMAND_FAILED',
     error:{code:'BROWSER_COMMAND_FAILED',message:'BROWSER_PUBLIC_HTML_HTTP_404'}};
 assert.equal(missingPublicHtmlSourceFailure('browser.inspect',failure),true);
 assert.equal(missingPublicHtmlSourceFailure('web.research',failure),false);
 assert.equal(missingPublicHtmlSourceFailure('browser.inspect',{...failure,ok:true}),false);
 const identity={ok:true,principalId:'owner-fixture',tenantId:'B2C',role:'ceo'};
 const bridge=createQwenAuthenticatedToolBridge({
  toolRuntime:{list:()=>[source]},
  toolsBridge:{executeMany:async()=>[failure]},
  sessionContext:{tenantId:'B2C'},
  validateAuthenticatedContext:async()=>identity,
  verifyObjectives:async()=>({ok:false}),
  hostToolPolicy:{accept:()=>true,authorize:()=>({ok:true,approved:false})}
 });
 const receipt=await bridge.execute({name:'browser.inspect',args:{url:first}},
   {authorization:identity,receipts:[]});
 assert.equal(receipt.ok,false);
 assert.equal(receipt.status,'HTTP_404');
 assert.equal(receipt.error.code,'HTTP_404');
 assert.equal(receipt.neverClaimedInspected,true);
 const recovery=planPlatformRecovery({tool:source,system:'browser',failure:receipt});
 assert.equal(recovery.status,'RECOVERY_READ_REPLAN_REQUIRED');
 assert.equal(recovery.autoExecute,false);
});
test('source selection excludes the exact failed 404 URL and keeps other independent sources eligible',async()=>{
 const {prioritizeResearchDiscovery}=await import('../modules/terminal/qwen-general-pilot.js');
 const missing='https://www.energystar.gov/obsolete-filter-advice';
 const next='https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home';
 const third='https://www.carrier.com/us/en/residential/hvac-resources/air-conditioners/ac-maintenance/';
 const instruction='Investiga filtros de aire acondicionado residencial; usa tres fuentes independientes. No modifiques archivos.';
 const tools=['web.research','browser.inspect'].map(mock);
 const search={name:'web.research',ok:true,args:{query:'filters HVAC maintenance'},observation:{ok:true,sources:[
  {url:missing,title:'Filter maintenance ENERGY STAR'},
  {url:next,title:'Air filters and HVAC EPA'},
  {url:third,title:'Air conditioner maintenance Carrier'}]}};
 const failed={name:'browser.inspect',ok:false,args:{url:missing},
  observation:{ok:false,status:'HTTP_404',error:{code:'HTTP_404'}}};
 const prioritized=prioritizeResearchDiscovery(tools,[search,failed],instruction);
 assert.deepEqual(prioritized.map(x=>x.name),['browser.inspect']);
 const offered=prioritized[0].inputSchema.properties.url.enum;
 assert.deepEqual(offered,[next],'after failure, offer the next independent public source only');
 const blockedAgain={name:'browser.inspect',ok:false,args:{url:next},
  observation:{ok:false,status:'PUBLIC_HTML_ACCESS_DENIED'}};
 const later=prioritizeResearchDiscovery(tools,[search,failed,blockedAgain],instruction);
 assert.deepEqual(later[0].inputSchema.properties.url.enum,[third],
  'already failed URLs are never offered again; the remaining organization is available');
});

test('404 browser receipt continues to a different authorized public source without replaying the broken page',async()=>{
 const {createQwenAuthenticatedToolBridge}=await import('../jarvis-qwen-tool-bridge.js');
 const {runQwenAuthorizedCycle}=await import('../jarvis-qwen-direct-cycle.js');
 const {prioritizeResearchDiscovery}=await import('../modules/terminal/qwen-general-pilot.js');
 const broken='https://www.energystar.gov/old-maintenance-guide';
 const alternate='https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home';
 const catalog=['web.research','browser.inspect'].map(name=>({
  name,mutates:false,requiresApproval:false,inputSchema:{type:'object',
   properties:name==='web.research'?{query:{type:'string'}}:{url:{type:'string'}},
   required:[name==='web.research'?'query':'url']}
 }));
 const executed=[];
 const identity={ok:true,principalId:'owner-fixture',tenantId:'B2C',role:'ceo'};
 const adapter=createQwenAuthenticatedToolBridge({
  toolRuntime:{list:()=>catalog},sessionContext:{tenantId:'B2C'},
  validateAuthenticatedContext:async()=>identity,verifyObjectives:async()=>({ok:false,reason:'THREE_SOURCES_REQUIRED'}),
  hostToolPolicy:{accept:()=>true,authorize:()=>({ok:true,approved:false})},
  toolsBridge:{executeMany:async([call])=>{
   executed.push(call);
   if(call.name==='web.research')return [{ok:true,sources:[
    {url:broken,title:'Air filter maintenance'},
    {url:alternate,title:'Air cleaners HVAC maintenance'}]}];
   if(call.args.url===broken)return [{ok:false,status:'BROWSER_COMMAND_FAILED',
    error:{code:'BROWSER_COMMAND_FAILED',message:'BROWSER_PUBLIC_HTML_HTTP_404'}}];
   return [{ok:true,url:alternate,dom:'<html><title>Air Cleaners</title><main><p>Filter maintenance and airflow recommendations for household cooling equipment.</p></main></html>'}];
  }}
 });
 const instruction='Investigación de filtros de aire acondicionado con tres fuentes independientes';
 const result=await runQwenAuthorizedCycle({
  instruction,catalog:adapter.catalog,...adapter,maximumSteps:4,repairIncomplete:true,
  catalogForEvidence:(available,rs)=>prioritizeResearchDiscovery(available,rs,instruction),
  selectNextAction:async({tools})=>{
   const next=tools[0];
   if(next?.name==='web.research')return {toolCall:{name:'web.research',
    args:{query:next.inputSchema.properties.query.const}}};
   if(next?.name==='browser.inspect')return {toolCall:{name:'browser.inspect',
    args:{url:next.inputSchema.properties.url.enum[0]}}};
   return {finish:true,report:'Insufficient independent sources'};
  }
 });
 assert.equal(executed.filter(x=>x.name==='browser.inspect'&&x.args.url===broken).length,1);
 assert.equal(executed.filter(x=>x.name==='browser.inspect'&&x.args.url===alternate).length,1);
 assert.equal(result.receipts.some(x=>x.name==='browser.inspect'&&x.args.url===broken&&x.ok===false&&x.observation.status==='HTTP_404'),true);
 assert.equal(result.receipts.some(x=>x.name==='browser.inspect'&&x.args.url===alternate&&x.ok===true),true);
 assert.equal(result.status,'PARTIAL','one source never falsely certifies a three-source mission');
});

test('HVAC source verifier uses the original topic-bound quote window on every independently inspected host',async()=>{
 const {researchSourceProofs,independentResearchProofs,verifyGeneralMission}=await import('../modules/terminal/qwen-general-evidence.js');
 const instruction='Investiga el mantenimiento de filtros de aire acondicionado residencial. Busca tres fuentes independientes, inspecciona sus páginas y entrega sus URLs y citas verificadas. No modifiques archivos.';
 const urls=['energy-alpha.org','hvac-beta.edu','filters-gamma.net'].map(host=>'https://'+host+'/residential-hvac');
 const quote='Regular HVAC filter maintenance helps prevent restricted airflow in residential air conditioning systems and supports an appropriate cleaning schedule.';
 const filler=Array.from({length:10},(_,n)=>'<p>Categoria '+n+' presenta productos innovadores para hogares y oficinas con un gran equipo de especialistas disponibles para consultas y asesorias comerciales en todo el territorio.</p>').join('');
 const receipts=[{ok:true,name:'web.research',args:{query:'air conditioner filters maintenance'},observation:{ok:true,sources:urls.map(url=>({url,title:'HVAC air filter maintenance'}))}},
 ...urls.map((url,i)=>({name:'browser.inspect',ok:true,args:{url},observation:{ok:true,url,
 dom:'<html><title>HVAC filter maintenance '+i+'</title><main>'+(i===2?filler:'')+'<p>'+quote+'</p></main></html>'}}))];
 const generic=researchSourceProofs(receipts);
 const topicBound=independentResearchProofs(receipts,instruction);
 assert.equal(topicBound.length,3);
 assert.ok(generic[2].quotes.every(q=>q!==quote),'generic first-eight window drops a real later quote');
 const proposedReport=JSON.stringify({sources:topicBound.map(p=>({url:p.url,title:p.title,date:null,quote:p.quotes[0]}))});
 const accepted=await verifyGeneralMission({instruction,receipts,proposedReport});
 assert.equal(accepted.ok,true,'the independent report must use the same topic-bound quotes as the Qwen schema');
 const forged=proposedReport.replace('restricted airflow','invented electricity savings');
 assert.equal((await verifyGeneralMission({instruction,receipts,proposedReport:forged})).ok,false);
});
