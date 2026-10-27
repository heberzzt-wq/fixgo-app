import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generalObjectives,verifyGeneralMission} from '../modules/terminal/qwen-general-evidence.js';
import {generalToolCatalog,prioritizeGeneralAdvertisingCatalog} from '../modules/terminal/qwen-general-pilot.js';
import {requestedSourceDocumentFile,sourceBoundDidacticPdfContent} from '../modules/terminal/qwen-general-contract.js';
const prompt='Lee jarvis.local.policy.js del repositorio actual y crea un PDF descargable de una página para un estudiante. Indica el modelo local que realmente está configurado y explica, con el ejemplo de una masa de 4 kg y una aceleración de 2 m/s², cómo se calcula la fuerza neta. Distingue lo leído del repositorio del ejemplo didáctico. No modifiques código ni publiques nada.';
const file='gestia-core/jarvis/jarvis.local.policy.js';
const tool=name=>({name,mutates:name==='document.create',userArtifact:name==='document.create',requiresApproval:false,
 inputSchema:{type:'object',properties:{file:{type:'string'},content:{type:'string'},format:{type:'string'},output:{type:'string'},title:{type:'string'},requireDocumentValidation:{type:'boolean'},documentContract:{type:'object'}},required:[]}});
const runtime={list:()=>['repo.read','page.create','document.create','artifact.read','media.library'].map(tool)};
const policy={accept:()=>true,artifactRoot:'.jarvis-artifacts/qwen-general/general-11111111-1111-4111-8111-111111111111/'};
test('GP03 PDF of one page routes source read, not web page or engineering audit',()=>{
 const goals=generalObjectives(prompt);
 assert.equal(goals.page,false);
 assert.equal(goals.code,false);
 assert.equal(goals.sourceDocument,true);
 assert.equal(goals.document,true);
 assert.equal(requestedSourceDocumentFile(prompt),file);
 const catalog=generalToolCatalog(runtime,policy,goals,prompt);
 assert.equal(catalog.some(t=>t.name==='page.create'),false);
 assert.equal(catalog.some(t=>t.name==='repo.read'),true);
 assert.equal(catalog.find(t=>t.name==='repo.read').inputSchema.properties.file.const,file);
 const first=prioritizeGeneralAdvertisingCatalog(catalog,[],goals,prompt);
 assert.deepEqual(first.map(t=>t.name),['repo.read']);
});
test('GP03 source PDF cannot skip read, hallucinate local model or claim a second page',async()=>{
 const goals=generalObjectives(prompt);
 const catalog=generalToolCatalog(runtime,policy,goals,prompt);
 const wrongRead={name:'repo.read',ok:true,args:{file},observation:{ok:true,verifiedRead:{file,content:'export const JARVIS_LOCAL_MODEL = "something-else";'}}};
 assert.equal(sourceBoundDidacticPdfContent(prompt,[wrongRead])?.includes('something-else'),true,
  'any source declaration stays data, never a hardcoded result');
 const read={name:'repo.read',ok:true,args:{file},observation:{ok:true,verifiedRead:{file,content:fs.readFileSync(new URL('../'+file,import.meta.url),'utf8')}}};
 const bound=sourceBoundDidacticPdfContent(prompt,[read]);
 assert.match(bound,/qwen3\.5:9b/);
 assert.match(bound,/8 N/);
 assert.match(bound,/repositorio/);
 assert.equal(sourceBoundDidacticPdfContent(prompt,[]),null);
 assert.equal(prioritizeGeneralAdvertisingCatalog(catalog,[{...read,observation:{ok:true}}],goals,prompt).length,0);
 const second=prioritizeGeneralAdvertisingCatalog(catalog,[read],goals,prompt);
 assert.deepEqual(second.map(t=>t.name),['document.create']);
 assert.equal(second[0].inputSchema.properties.content.const,bound);
 assert.equal(second[0].inputSchema.properties.format.enum[0],'pdf');
 const incomplete=await verifyGeneralMission({instruction:prompt,receipts:[read],objectives:goals,proposedReport:''});
 assert.equal(incomplete.ok,false);
 assert.ok(incomplete.objectives.some(x=>x.reason==='SOURCE_BOUND_SINGLE_PAGE_PDF_UNVERIFIED'));
});
