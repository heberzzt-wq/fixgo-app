import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeneralToolPolicy} from '../jarvis-qwen-general-policy.js';
import {generalObjectives} from '../modules/terminal/qwen-general-evidence.js';
import {generalToolCatalog} from '../modules/terminal/qwen-general-pilot.js';
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';

const location={protocol:'http:',hostname:'127.0.0.1',port:'5000',search:'?qwenPilot=general-v1'};
const copy='Summit. Asesoría fiscal y legal. Conoce el servicio en www.summ.com.mx';
const instruction='Crea una campaña publicitaria ficticia y NO la publiques. Marca: Summit Consulting Group. ÚNICO texto comercial permitido: "'+copy+'".';
const stock={ref:'library:Entradas/Stock/Pexels/pexels-7433874.png',role:'input',sha256:'a'.repeat(64),photoRegion:{x:0,y:0,width:2048,height:1365}};
const branded={ref:'library:Entradas/Summit/portrait.png',role:'input',sha256:'b'.repeat(64),verifiedContacts:['www.summ.com.mx'],photoRegion:{x:0,y:0,width:300,height:200}};
const logo={ref:'library:Logos/Summit/logo.png',role:'official_logo_source',sha256:'c'.repeat(64)};
const sourceReceipt=(entries=[stock,branded,logo])=>[{name:'advertising.research',ok:true,observation:{ok:true,entries}}];
const make=(policy)=>({name:'image.adapt',args:{sourceOutput:stock.ref,brandLogoOutput:logo.ref,outputPrefix:policy.imagePrefix+'social1',variants:[{id:'w1080-h1080',mimeType:'image/png',width:1080,height:1080}],composition:{layout:'split',photoCrop:stock.photoRegion,brandName:'Summit Consulting Group',headline:'Summit. Asesoría fiscal y legal.',body:'Conoce el servicio en www.summ.com.mx',contact:'www.summ.com.mx'}}});

test('campaign receipt: independent user-quoted contact plus verified brand entry authorizes stock composition without changing the photo',()=>{
 const policy=createGeneralToolPolicy({location,missionId:'general-phase5auth',instruction,objectives:{advertising:true}});
 const call=make(policy),before=JSON.stringify(sourceReceipt());
 assert.equal(policy.authorize(call,sourceReceipt()).ok,true);
 assert.equal(JSON.stringify(sourceReceipt()),before);
 call.args.composition.contact='www.other-brand.com';
 assert.equal(policy.authorize(call,sourceReceipt()).reason,'VERIFIED_CONTACT_REQUIRED');
});
test('contact remains blocked without literal authorization or verified separate brand source',()=>{
 const p=createGeneralToolPolicy({location,missionId:'general-phase5auth',instruction,objectives:{advertising:true}});
 assert.equal(p.authorize(make(p),sourceReceipt([stock,logo])).reason,'VERIFIED_CONTACT_REQUIRED');
 const unquoted=createGeneralToolPolicy({location,missionId:'general-phase5auth',instruction:'No inventes contactos de Summit.',objectives:{advertising:true}});
 assert.equal(unquoted.authorize(make(unquoted),sourceReceipt()).reason,'VERIFIED_CONTACT_REQUIRED');
});
test('production-report document is never accepted as evidence before research or physical production',()=>{
 const p=createGeneralToolPolicy({location,missionId:'general-phase5auth',instruction,objectives:{advertising:true}});
 const call={name:'document.create',args:{output:p.artifactRoot+'status.json',format:'json',title:'Verified Complete',content:JSON.stringify({status:'BLOCKED_BY_SCOPE',limitations:['Missing video']})}};
 const result=p.authorize(call,[]);
 assert.equal(result.ok,false);
 assert.equal(result.reason,'DOCUMENT_PHYSICAL_RESOURCE_BINDING_REQUIRED');
});
test('advertising intent cannot expose system.capabilities due to generic unsupported classification',()=>{
 const intent=generalObjectives('Produce un TikTok vertical, no publicar; herramientas de video y narración.');
 assert.equal(intent.unsupported,true);
 assert.equal(intent.advertising,true);
 const p=createGeneralToolPolicy({location,missionId:'general-phase5auth',instruction,objectives:intent});
 const catalog=generalToolCatalog({list:()=>[
   {name:'system.capabilities',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{}}},
   {name:'advertising.research',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{query:{type:'string'}}}}
 ]},p,intent,'TikTok vertical 1080x1920');
 assert.deepEqual(catalog.map(t=>t.name),['advertising.research']);
});
test('Qwen cannot call globally registered tools that were not dynamically offered, then can recover once',async()=>{
 const catalog=['advertising.research','system.capabilities'].map(name=>({name,inputSchema:{type:'object',properties:{}}}));
 const decisions=[{toolCall:{name:'system.capabilities',args:{}}},{toolCall:{name:'advertising.research',args:{}}},{finish:true,report:'Research physically observed'}];
 let executions=0,offeredFirst=[],sawCorrections=false;
 const r=await runQwenAuthorizedCycle({instruction:'Research Summit',catalog,repairIncomplete:true,maximumSteps:5,
  summarizeEvidence:rows=>({finishEligible:rows.some(x=>x.ok)}),
  catalogForEvidence:(_all,rows)=>rows.length?[]:[catalog[0]],
  selectNextAction:async({tools,missionLedger})=>{if(!executions)offeredFirst=tools.map(t=>t.name);if(missionLedger.rejectedToolChoices?.length)sawCorrections=true;return decisions.shift();},
  authorize:async({call})=>{assert.equal(call.name,'advertising.research');return {ok:true};},
  execute:async({name})=>{assert.equal(name,'advertising.research');executions++;return {ok:true};},
  verifyCompletion:async({receipts})=>({ok:receipts.length===1&&receipts[0].name==='advertising.research'})
 });
 assert.deepEqual(offeredFirst,['advertising.research']);
 assert.equal(executions,1);
 assert.equal(sawCorrections,true);
 assert.equal(r.status,'SUCCESS');
});
test('two repeated out-of-catalog choices stop without any execution or forged receipts',async()=>{
 const catalog=['advertising.research','system.capabilities'].map(name=>({name,inputSchema:{type:'object',properties:{}}}));
 let executed=0;
 const r=await runQwenAuthorizedCycle({instruction:'Research Summit',catalog,repairIncomplete:true,maximumSteps:5,
  catalogForEvidence:()=>[catalog[0]],
  selectNextAction:async()=>({toolCall:{name:'system.capabilities',args:{}}}),
  authorize:async()=>({ok:true}),execute:async()=>{executed++;return {ok:true};},verifyCompletion:async()=>({ok:false})
 });
 assert.equal(r.status,'PARTIAL');
 assert.equal(r.reason,'TOOL_NOT_OFFERED_IN_CURRENT_STEP');
 assert.equal(executed,0);
 assert.equal(r.receipts.length,0);
});

import {prioritizeGeneralAdvertisingCatalog} from '../modules/terminal/qwen-general-pilot.js';
test('once relevant sources are verified, pilot offers image production before unrelated documents or inventory',()=>{
 const formats=[{width:1080,height:1080},{width:1200,height:628}];
 const t={
  name:'image.adapt',
  inputSchema:{type:'object',properties:{
   variants:{type:'array',items:{type:'object',properties:{id:{type:'string'},width:{type:'number'},height:{type:'number'},mimeType:{type:'string'}},
    anyOf:formats.map(({width,height})=>({properties:{width:{const:width},height:{const:height}}}))}},
   composition:{type:'object',properties:{layout:{enum:['split','stack']}}},
   creativeDirection:{properties:{references:{items:{}}}}
  }}
 };
 const catalog=[t,{name:'media.library',inputSchema:{type:'object',properties:{}}},
   {name:'document.create',inputSchema:{type:'object',properties:{}}}];
 const verified={name:'advertising.research',ok:true,observation:{ok:true,entries:[stock,branded],advertisingSemanticReview:{verified:true,acceptedSourceURLs:[]}}};
 const goals={advertising:true,requestedImageFormats:formats};
 const next=prioritizeGeneralAdvertisingCatalog(catalog,[verified],goals);
 assert.deepEqual(next.map(x=>x.name),['image.adapt','media.library']);
 const made={name:'image.adapt',ok:true,args:{sourceOutput:stock.ref,composition:{layout:'split'},variants:formats},observation:{ok:true,outputs:formats.map(f=>({...f,mimeType:'image/png',sha256:'d'.repeat(64),output:'.jarvis-artifacts/images/'+f.width+'.png'}))}};
 const after=prioritizeGeneralAdvertisingCatalog(catalog,[verified,made],goals);
 // A rendered PNG is not a complete production receipt: the document must
 // remain unavailable until read-back, visual review, and export finish.
 assert.equal(after.some(x=>x.name==='document.create'),false);
});

import {explicitCopyConstraint} from '../jarvis-qwen-advertising-review.js';
test('phase5 physical receipt: user-named brand identity is not extra ad copy, invented service is still blocked',()=>{
 const args={composition:{brandName:'Summit Consulting Group',headline:'Summit. Asesoría fiscal y legal.',
 body:'Conoce el servicio en www.summ.com.mx',cta:'',contact:'www.summ.com.mx'}};
 const authorized=explicitCopyConstraint(instruction,{tool:'image.adapt',args});
 assert.equal(authorized.rejected.length,0,JSON.stringify(authorized));
 args.composition.brandName='Summit Consulting Group Expertos';
 assert.deepEqual(explicitCopyConstraint(instruction,{tool:'image.adapt',args}).rejected.map(x=>x.field),['composition.brandName']);
 args.composition.brandName='Summit Consulting Group';
 args.composition.body='Optimización tributaria garantizada.';
 assert.equal(explicitCopyConstraint(instruction,{tool:'image.adapt',args}).rejected.some(x=>x.field==='composition.body'),true);
});

import {acceptedAdvertisingResearch,mergeAdvertisingCreativeEvidence} from '../jarvis-qwen-tool-bridge.js';
const researchProof={
 verified:true,reviewExecuted:true,model:'qwen3.5:9b',inputSha256:'f'.repeat(64),
 acceptedSourceURLs:['https://example.com/a','https://example.com/b'],
 review:{sources:['https://example.com/a','https://example.com/b'].map(url=>({
  url,quote:'Exact observed source quote from the web document',topicRelevant:true,
  sectorRelevant:true,identityCompatible:true,objectiveRelevant:true}))}
};
const researchRows=()=>[
 {ok:true,name:'advertising.research',observation:{sources:researchProof.acceptedSourceURLs.map(url=>({url}))}},
 ...researchProof.acceptedSourceURLs.map((url,i)=>({ok:true,name:'browser.inspect',observation:{url,
   dom:'<html><main>Exact observed source quote from the web document</main></html>',
   ...(i===1?{advertisingSemanticReview:researchProof}:{})}}))
];
const creativeReview=()=>({verified:false,reviewExecuted:true,creativeEvidenceVerified:true,
 hostClaimConstraint:{verified:true},hostCopyConstraint:{rejected:[]},
 review:{blockingIssues:['Source s0 lacks specific advertising research evidence.'],creative:{identityPreserved:true,contactsGrounded:true,claimsGrounded:true,unsupportedClaims:[]}}});
test('receipt-bound research approval is reusable without reclassifying two independently approved pages',()=>{
 const prior=acceptedAdvertisingResearch(researchRows());
 assert.equal(prior.verified,true);
 const merged=mergeAdvertisingCreativeEvidence(creativeReview(),prior);
 assert.equal(merged.verified,true);assert.equal(merged.status,'ADVERTISING_PRIOR_SOURCE_REVIEW_REUSED');
 assert.equal(merged.sourceResearchPreviouslyVerified.acceptedSourceURLs.length,2);
});
test('source reuse never accepts invented claims, source pages absent, or non-research creative blockers',()=>{
 const prior=acceptedAdvertisingResearch(researchRows());
 const fail=creativeReview();fail.hostClaimConstraint.verified=false;
 assert.equal(mergeAdvertisingCreativeEvidence(fail,prior).verified,false);
 const unsupported=creativeReview();unsupported.review.blockingIssues=['Free guaranteed consultation was invented'];
 assert.equal(mergeAdvertisingCreativeEvidence(unsupported,prior).verified,false);
 const absent=researchRows();absent.splice(1,1);
 assert.equal(acceptedAdvertisingResearch(absent).verified,false);
 assert.equal(mergeAdvertisingCreativeEvidence(creativeReview(),{verified:false}).verified,false);
});


test('phase5 real research receipt prioritizes a fresh generic source search before importing all ten materials',()=>{
 const sources=[
  {url:'https://summitconsultingroup.com/',title:'Summit Consulting Group'},
  {url:'https://www.summitgeneralcounsel.com/marketing-compliance/',title:'Summit General Counsel marketing'},
  {url:'https://attorneys.media/legal-advertising-rules-ethics-best-practices/',title:'Legal Advertising Rules'},
  {url:'https://summitfiscal.com/',title:'Summit International Consulting'},
  {url:'https://www.summitgeneralcounsel.com/legal-services/',title:'Summit General Counsel Legal Services'},
  {url:'https://www.summitgroupconsult.com/',title:'Summit Group Consulting'}
 ];
 const researched=[{ok:true,name:'advertising.research',observation:{sources}},
  ...sources.slice(0,3).map(s=>({ok:true,name:'browser.inspect',observation:{url:s.url,dom:'<html><article>Observed</article></html>'}}))];
 const tools=[
  {name:'advertising.research',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},
  {name:'browser.inspect',inputSchema:{type:'object',properties:{url:{type:'string'}}}},
  {name:'media.library',inputSchema:{type:'object',properties:{}}},
  {name:'media.analyze',inputSchema:{type:'object',properties:{output:{type:'string'}}}}
 ];
 const result=prioritizeGeneralAdvertisingCatalog(tools,researched,{advertising:true},instruction);
 assert.deepEqual(result.map(t=>t.name),['advertising.research']);
});
test('generic independent advertising pages are inspected before any creative library activity',()=>{
 const rows=[{ok:true,name:'advertising.research',observation:{sources:[
  {url:'https://example.org/legal-marketing',title:'Law firm marketing ideas'},
  {url:'https://example.org/design-guide',title:'Professional design guide'}]}}];
 const tools=[
  {name:'advertising.research',inputSchema:{type:'object',properties:{query:{type:'string'}}}},
  {name:'browser.inspect',inputSchema:{type:'object',properties:{url:{type:'string'}}}},
  {name:'media.library',inputSchema:{type:'object',properties:{}}}
 ];
 const offered=prioritizeGeneralAdvertisingCatalog(tools,rows,{advertising:true},instruction);
 assert.deepEqual(offered.map(t=>t.name),['browser.inspect']);
 assert.deepEqual(offered[0].inputSchema.properties.url.enum,['https://example.org/legal-marketing','https://example.org/design-guide']);
});
test('research query refuses the named client and permits a neutral independent industry question',()=>{
 const p=createGeneralToolPolicy({location,missionId:'general-phase5auth',objectives:{advertising:true},instruction});
 assert.equal(p.authorize({name:'advertising.research',args:{query:'Summit fiscal legal advertising marketing'}}).reason,
   'ADVERTISING_RESEARCH_CLIENT_BRAND_QUERY_FORBIDDEN');
 assert.equal(p.authorize({name:'advertising.research',args:{query:'Legal professional advertising design best practices 2026'}}).ok,true);
});

import {exactAdvertisingCopyChoices} from '../modules/terminal/qwen-general-pilot.js';
test('literal commercial instruction generates bounded copy choices without inventing new claims',()=>{
 const a=exactAdvertisingCopyChoices(instruction);
 assert.equal(a.brandName,'Summit Consulting Group');
 assert.equal(a.contacts.length,1);
 assert.equal(a.contacts[0],'www.summ.com.mx');
 assert.ok(a.spans.includes('Summit. Asesoría fiscal y legal.'));
 assert.ok(a.spans.includes('Conoce el servicio en www.summ.com.mx'));
 assert.equal(a.spans.some(x=>x.includes('Descargar Guía')||x.includes('marketing jurídico')) ,false);
});
test('phase5 accepted research can only offer exact copy and the verified website for an image',()=>{
 const formats=[{width:1080,height:1080},{width:1200,height:628}];
 const props={sourceOutput:{type:'string'},brandLogoOutput:{type:'string'},
   variants:{type:'array',items:{type:'object',properties:{
    id:{type:'string'},width:{type:'integer'},height:{type:'integer'},mimeType:{type:'string'}},
    anyOf:formats.map(f=>({properties:{width:{const:f.width},height:{const:f.height}}}))}},
   composition:{type:'object',properties:{layout:{type:'string',enum:['stack','split']},
    photoCrop:{type:'object'},brandName:{type:'string'},headline:{type:'string'},
    body:{type:'string'},cta:{type:'string'},contact:{type:'string'}}},
   creativeDirection:{type:'object',properties:{references:{type:'array',items:{type:'string'}}}}};
 const catalog=[{name:'image.adapt',inputSchema:{type:'object',properties:props}}];
 const rows=[{ok:true,name:'advertising.research',observation:{entries:[stock,branded,logo],
  sources:[{url:'https://example.org/legal-ads'},{url:'https://example.org/legal-design'}]}},
  {ok:true,name:'browser.inspect',observation:{url:'https://example.org/legal-ads',dom:'<article>Advertising</article>',
   advertisingSemanticReview:{verified:true,acceptedSourceURLs:['https://example.org/legal-ads','https://example.org/legal-design']}}}];
 const choice=prioritizeGeneralAdvertisingCatalog(catalog,rows,{advertising:true,requestedImageFormats:formats},instruction)[0].inputSchema.anyOf.find(c=>c.properties.sourceOutput.const===stock.ref);
 assert.ok(choice,'the generic stock photograph still has available formats');
 const c=choice.properties.composition.properties;
 assert.equal(c.brandName.const,'Summit Consulting Group');
 assert.equal(c.contact.const,'');
 assert.equal(c.cta.const,'');
 assert.equal(c.body.const,'Conoce el servicio en www.summ.com.mx');
 assert.equal(c.headline.const,'Summit. Asesoría fiscal y legal.');
 assert.notEqual('SUMMIT CONSULTING GROUP',c.brandName.const);
 assert.notEqual('Descargar Guía',c.cta.const);
 assert.notEqual('info@summit.com.mx',c.contact.const);
});

test('Spanish-only source disagreements from physically approved sources can be reused without bypassing commercial guards',()=>{
 const prior=acceptedAdvertisingResearch(researchRows());
 const problems=[
  ['Solo una fuente (s0) cumple el objetivo de ética publicitaria.','La segunda fuente (s1) es irrelevante para principios éticos.'],
  ['Falta segunda fuente independiente con evidencia ética verificable.'],
  ['Falta segunda fuente ética relevante'],
  ['Solo una fuente (s0) cumple criterio de evidencia ética verificable.','Fuente s1 carece de relevancia para principios éticos universales.']
 ];
 for(const messages of problems){
  const review=creativeReview();review.review.blockingIssues=messages;
  const result=mergeAdvertisingCreativeEvidence(review,prior);
  assert.equal(result.verified,true,JSON.stringify(messages));
  assert.equal(result.creativeReviewRawVerified,false);
  assert.deepEqual(result.sourceResearchPreviouslyVerified.acceptedSourceURLs,prior.acceptedSourceURLs);
 }
 const blocked=creativeReview();blocked.review.blockingIssues=['Se anuncia un descuento inventado.'];
 assert.equal(mergeAdvertisingCreativeEvidence(blocked,prior).verified,false);
 const ungrounded=creativeReview();ungrounded.review.creative.unsupportedClaims=['Expertos garantizados'];
 assert.equal(mergeAdvertisingCreativeEvidence(ungrounded,prior).verified,false);
 const mismatch=creativeReview();mismatch.hostCopyConstraint.rejected=['Promoción'];
 assert.equal(mergeAdvertisingCreativeEvidence(mismatch,prior).verified,false);
});

test('branded portrait scenes suppress redundant reel logo before Qwen can choose it',async()=>{
 const {groundGeneralCatalog}=await import('../modules/terminal/qwen-general-pilot.js');
 const {createGeneralToolPolicy}=await import('../jarvis-qwen-general-policy.js');
 const source='general-9d7b7f6f-9dc9-4d94-b0a7-b2777a168800';
 const logo={ref:'library:Logos/Summit/summit-logo-original.png',role:'official_logo_source'};
 const images=[1,2,3].map(i=>({output:'.jarvis-artifacts/images/'+source+'-scene'+i+'-w1080-h1920.png',sha256:String(i).repeat(64),mimeType:'image/png',width:1080,height:1920}));
 const receipts=[{name:'advertising.research',ok:true,args:{query:'visual marketing legal'},observation:{ok:true,entries:[logo],advertisingSemanticReview:{verified:true,acceptedSourceURLs:['https://example.com/one','https://example.com/two']}}},
 ...images.map(img=>({name:'image.adapt',ok:true,args:{brandLogoOutput:logo.ref,composition:{layout:'split'}},observation:{ok:true,outputs:[img]}})),
 {name:'speech.synthesize',ok:true,args:{},observation:{ok:true,output:'.jarvis-artifacts/audio/'+source+'-narration.wav',mimeType:'audio/wav'}}];
 const schema={type:'object',properties:{logoOutput:{type:'string'},creativeDirection:{type:'object',properties:{references:{type:'array',items:{type:'string'}}}},scenes:{type:'array',items:{type:'object',properties:{assetOutput:{type:'string'},presentation:{type:'string'},subtitle:{type:'string'}}}},audioOutput:{type:'string'}},required:[],additionalProperties:false};
 const input=[{name:'reel.create',inputSchema:schema,description:'Create MP4'}];
 const grounded=groundGeneralCatalog(input,receipts,'Summit campaign',{reel:true,advertising:true});
 assert.equal(grounded.length,1);
 const offered=grounded[0];
 assert.equal(Object.hasOwn(offered.inputSchema.properties,'logoOutput'),false);
 assert.equal(offered.inputSchema.properties.scenes.items.properties.assetOutput.enum.length,3);
 const policy=createGeneralToolPolicy({location:{protocol:'http:',hostname:'127.0.0.1',port:'5000',search:'?qwenPilot=general-v1'},missionId:source,objectives:{reel:true,advertising:true}});
 const args={scenes:images.map(i=>({assetOutput:i.output})),logoOutput:logo.ref,output:policy.artifactRoot+'advertisement.mp4',studioOutput:policy.artifactRoot+'advertisement-studio.html'};
 assert.equal(policy.authorize({name:'reel.create',args},receipts).reason,'REDUNDANT_VIDEO_LOGO');
});

test('literal Summit MP4 copy binds required reel brand, title and CTA before synthesis',()=>{
 const input='Produce un MP4 vertical de 30 segundos con logo oficial. ÚNICO texto comercial permitido: "Summit. Asesoría fiscal y legal. Conoce el servicio en www.summ.com.mx".';
 const goals=generalObjectives(input);
 const p={accept:()=>true,artifactRoot:'.jarvis-artifacts/qwen-general/general-testreel/',audioPrefix:'.jarvis-artifacts/audio/general-testreel-',imagePrefix:'general-testreel-'};
 const schema={type:'object',properties:{brandName:{type:'string'},title:{type:'string'},cta:{type:'string'},durationSeconds:{type:'number'},scenes:{type:'array',items:{type:'object',properties:{}}}},required:[]};
 const tool=generalToolCatalog({list:()=>[{name:'reel.create',inputSchema:schema}]},p,goals,input).at(0);
 assert.ok(tool);
 for(const name of ['brandName','title','cta'])assert.ok(tool.inputSchema.required.includes(name),name);
 assert.equal(tool.inputSchema.properties.brandName.const,'Summit');
 assert.equal(tool.inputSchema.properties.title.const,'Asesoría fiscal y legal.');
 assert.equal(tool.inputSchema.properties.cta.const,'Conoce el servicio en www.summ.com.mx');
});
