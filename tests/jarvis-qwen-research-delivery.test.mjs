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
