import test from 'node:test';
import assert from 'node:assert/strict';
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';
import {generalToolCatalog,prioritizeGeneralAdvertisingCatalog} from '../modules/terminal/qwen-general-pilot.js';
import {generalObjectives,researchOfficeContent} from '../modules/terminal/qwen-general-evidence.js';

const sourceSites=['technical-lab.gov','filter-guide.org','home-energy.edu'];
const quote='Regular air conditioner maintenance involves checking the air filters and inspecting cooling equipment safely before operating the system.';
const receipts=[
 {name:'web.research',args:{query:'residential air conditioner maintenance'},ok:true,observation:{ok:true,sources:sourceSites.map(host=>({url:'https://'+host+'/maintenance',title:'Residential air conditioner maintenance'}))}},
 ...sourceSites.map(host=>({name:'browser.inspect',args:{url:'https://'+host+'/maintenance'},ok:true,observation:{ok:true,url:'https://'+host+'/maintenance',dom:'<title>Residential air conditioner maintenance</title><main><p>'+quote+'</p></main>'}}))
];
const mission='general-a42201f8-18c0-40f3-a6e4-e2e861c4bad2';
const resumed='resume-71276af3-3ce5-483b-b335-abbb2dea70ec';
const instruction='CONTINUAR_MISION: '+resumed+'\nORIGEN_MISION: '+mission+'\nInvestiga mantenimiento preventivo del aire acondicionado y entrega DOCX y PDF.';
const tool=(name)=>({name,inputSchema:{type:'object',properties:{output:{type:'string'},format:{type:'string'},title:{type:'string'},content:{type:'string'},action:{type:'string'}},required:[]},mutates:false,requiresApproval:false,userArtifact:true});
const policy={accept:()=>true,artifactRoot:'.jarvis-artifacts/qwen-general/'+mission+'/',audioPrefix:'.jarvis-artifacts/audio/'+mission+'-',imagePrefix:mission+'-'};

test('recovered PDF creation is fully host-bound with a fresh and scoped name',()=>{
 const catalog=generalToolCatalog({list:()=>['web.research','browser.inspect','document.create','artifact.read','media.library'].map(tool)},policy,generalObjectives(instruction),instruction);
 const offered=prioritizeGeneralAdvertisingCatalog(catalog,receipts,generalObjectives(instruction),instruction);
 assert.deepEqual(offered.map(t=>t.name),['document.create']);
 const schema=offered[0].inputSchema;
 assert.equal(schema.properties.format.const,'pdf');
 assert.equal(schema.properties.content.const,researchOfficeContent(receipts,instruction));
 for(const field of schema.required)
  assert.ok(Object.hasOwn(schema.properties[field]||{},'const'),field+' is not host-bound');
 assert.match(schema.properties.output.const,/\/general-a42201f8-18c0-40f3-a6e4-e2e861c4bad2\/recovery-71276af3-pdf\.pdf$/);
});

test('verified host-defined office create/read/export needs zero additional Qwen decisions',async()=>{
 const base='.jarvis-artifacts/qwen-general/'+mission+'/recovery-71276af3-pdf.pdf';
 const source='## Introduction\n'+'Research source evidence. '.repeat(60);
 const doc={name:'document.create',inputSchema:{type:'object',properties:{
  output:{type:'string',const:base},format:{type:'string',const:'pdf'},
  title:{type:'string',const:'Verified Research'},
  content:{type:'string',const:source},
  requireDocumentValidation:{type:'boolean',const:true},
  documentContract:{type:'object',const:{documentKind:'original_draft',minWords:80,minSections:3}}},
  required:['output','format','title','content','requireDocumentValidation','documentContract']}};
 const read={name:'artifact.read',inputSchema:{type:'object',properties:{output:{type:'string',const:base}},required:['output']}};
 const exportTool={name:'media.library',inputSchema:{type:'object',properties:{action:{type:'string',const:'export'},output:{type:'string',const:base}},required:['action','output']}};
 const catalog=[doc,read,exportTool];
 const executed=[],authorized=[];
 const r=await runQwenAuthorizedCycle({
  instruction:'Continue verified file delivery',catalog,maximumSteps:5,stepLimit:5,
  catalogForEvidence:(_available,receipts)=>receipts.length===0?[doc]:receipts.length===1?[read]:receipts.length===2?[exportTool]:[],
  selectNextAction:async()=>{throw Error('MODEL_NOT_NEEDED_FOR_HOST_BOUND_ACTION');},
  authorize:async({call})=>{authorized.push(call.name);return {ok:true};},
  execute:async({name,args})=>{executed.push({name,args});return {ok:true,status:name==='document.create'?'DOCUMENT_CREATED':'VERIFIED',output:base};},
  verifyCompletion:async({receipts})=>({ok:receipts.length===3,reason:'VERIFIED_COMPLETE',objectives:[{objective:'three physical actions',satisfied:receipts.length===3}]}),
  summarizeEvidence:()=>({deliveryGaps:[]}),repairIncomplete:true
 });
 assert.equal(r.status,'SUCCESS');
 assert.equal(r.modelDecisions,0);
 assert.deepEqual(authorized,['document.create','artifact.read','media.library']);
 assert.deepEqual(executed.map(x=>x.name),authorized);
 assert.equal(executed[0].args.content,source);
});

test('host-bound deterministic actions never bypass independent authorization',async()=>{
 const output='.jarvis-artifacts/qwen-general/'+mission+'/blocked.pdf';
 const tool={name:'artifact.read',inputSchema:{type:'object',properties:{output:{type:'string',const:output}},required:['output']}};
 let executed=0;
 const r=await runQwenAuthorizedCycle({
  instruction:'Read file',catalog:[tool],
  catalogForEvidence:()=>[tool],stepLimit:2,maximumSteps:2,
  selectNextAction:async()=>{throw Error('MODEL_NOT_NEEDED');},
  authorize:async()=>({ok:false,reason:'DENIED'}),
  execute:async()=>{executed++;return {ok:true};},
  verifyCompletion:async()=>({ok:false}),repairIncomplete:true
 });
 assert.equal(r.status,'PARTIAL');assert.equal(executed,0);
 assert.equal(r.modelDecisions,0);
});

test('terminal permits evidence and download links for verified resume mission IDs',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
 assert.ok(html.includes('appendMissionDownloadCard')&&html.includes('restoreLatestMissionDownloadCard'));
 assert.ok(html.includes("/^(?:general|resume)-[a-f0-9-]{36}$/i.test(coreResult?.missionId||'')"));
 const pattern=/^(?:general|resume)-[a-f0-9-]{36}$/i;
 assert.ok(pattern.test('resume-6e3c6983-7cce-40e7-89de-861174e76903'));
 assert.ok(pattern.test('general-a42201f8-18c0-40f3-a6e4-e2e861c4bad2'));
 assert.equal(pattern.test('other-6e3c6983-7cce-40e7-89de-861174e76903'),false);
});
