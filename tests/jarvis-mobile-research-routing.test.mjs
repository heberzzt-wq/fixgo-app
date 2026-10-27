import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generalObjectives} from '../modules/terminal/qwen-general-evidence.js';
import {mobileGeneralResearchPilot,localGeneralPilot,createGeneralToolPolicy} from '../jarvis-qwen-general-policy.js';
import {generalToolCatalog,prioritizeGeneralAdvertisingCatalog} from '../modules/terminal/qwen-general-pilot.js';

const exact='Sí, inicia ahora la investigación. Investiga cómo limpiar correctamente los filtros de un aire acondicionado residencial. Utiliza tres fuentes independientes y verificables. Ejecuta las herramientas de investigación web e inspección de páginas. Entrega un informe breve con el título, URL y una cita textual comprobada de cada fuente, además de las recomendaciones de mantenimiento. No leas archivos del repositorio, no ejecutes repo.audit y no modifiques código. Si falta alguna evidencia, indícalo. Declara VERIFIED_COMPLETE solamente cuando las tres fuentes estén verificadas.';
const mobile={protocol:'https:',hostname:'fixgo-44e4d.web.app',search:''};
const name='general-11111111-2222-4333-8444-555555555555';
const tool=name=>({name,mutates:false,requiresApproval:false,inputSchema:{type:'object',properties:{query:{type:'string'},url:{type:'string'}},required:[]}});

test('literal mobile HVAC research with negative repo prohibitions is RESEARCH only',()=>{
 const goals=generalObjectives(exact);
 assert.equal(goals.research,true);
 for(const key of ['code','advertising','sourceDocument','records','page','document','reel','unsupported'])assert.equal(goals[key],false,key);
 assert.equal(mobileGeneralResearchPilot(mobile,goals),true);
 const policy=createGeneralToolPolicy({location:mobile,missionId:name,objectives:goals,instruction:exact});
 for(const permitted of ['web.research','browser.inspect'])assert.equal(policy.accept(tool(permitted)),true,permitted);
 for(const forbidden of ['repo.read','repo.audit','repo.grep','repo.search','advertising.research','document.create','platform.query','tests.run','repo.prepareWrite','browser.screenshot'])
  assert.equal(policy.accept(tool(forbidden)),false,forbidden);
 const catalog=generalToolCatalog({list:()=>['repo.read','repo.audit','advertising.research','web.research','browser.inspect'].map(tool)},policy,goals,exact);
 assert.deepEqual(catalog.map(t=>t.name),['web.research','browser.inspect']);
 assert.deepEqual(prioritizeGeneralAdvertisingCatalog(catalog,[],goals,exact).map(t=>t.name),['web.research']);
});

test('a genuine engineering request remains engineering despite no-modification restriction',()=>{
 const engineering=generalObjectives('Audita el código del repositorio y ejecuta pruebas, pero no modifiques código.');
 assert.equal(engineering.code,true);assert.equal(engineering.research,false);
 assert.equal(mobileGeneralResearchPilot(mobile,engineering),false);
 assert.throws(()=>createGeneralToolPolicy({location:mobile,missionId:name,objectives:engineering}),/QWEN_GENERAL_LOCAL_SCOPE_REQUIRED/);
});

test('negative repo prohibitions may not trigger engineering on unrelated web research',()=>{
 for(const input of [
  'Investiga aire acondicionado pero no consultes el repositorio ni ejecutes repo.read',
  'Investiga filtros con tres fuentes web. No leas archivos del repositorio; no ejecutes repo.audit.',
  'Investiga información verificada de aire acondicionado; sin modificar código y sin consultar repositorio.'
 ]){const goals=generalObjectives(input);assert.equal(goals.code,false,input);assert.equal(goals.research,true,input);}
});

test('mobile pilot cannot be invoked from untrusted host, altered capabilities, or in write modes',()=>{
 for(const loc of [
  {protocol:'https:',hostname:'other.web.app',search:''},
  {protocol:'http:',hostname:'fixgo-44e4d.web.app',search:''},
  {protocol:'https:',hostname:'fixgo-44e4d.web.app.evil.test',search:''},
  {protocol:'https:',hostname:'fixgo-44e4d.web.app',search:'?qwenPilot=b2c-census-v1'}
 ])assert.equal(mobileGeneralResearchPilot(loc,generalObjectives(exact)),false);
 for(const feature of ['advertising','code','records','document','page','sourceDocument','reel','unsupported','prohibited','capabilities'])
  assert.equal(mobileGeneralResearchPilot(mobile,{...generalObjectives(exact),[feature]:true}),false,feature);
 assert.equal(localGeneralPilot({protocol:'http:',hostname:'localhost',port:'5000',search:''}),true);
});

test('production core dispatches only owner-scoped public research to isolated pilot',()=>{
 const core=readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
 assert.match(core,/ownerMobileResearchHost=mobileGeneralResearchPilot\(globalThis\.location,generalObjectives\(inputRaw\)\)/);
 assert.match(core,/if\(localGeneralHost\|\|ownerMobileResearchHost\)/);
 assert.match(core,/\['fixgo-44e4d\.web\.app','fixgo-44e4d\.firebaseapp\.com'\]/);
});
