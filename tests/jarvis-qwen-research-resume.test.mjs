import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedResearchResumeReceipts} from '../modules/terminal/qwen-general-resume.js';
import {generalToolCatalog} from '../modules/terminal/qwen-general-pilot.js';
import {generalObjectives} from '../modules/terminal/qwen-general-evidence.js';

const mission='general-a42201f8-18c0-40f3-a6e4-e2e861c4bad2';
const url='https://example.org/air-conditioner-maintenance';
const row=(name,args,observation)=>({name,args,ok:true,observation:{ok:true,...observation}});
const research=row('web.research',{query:'air conditioner maintenance'},{sources:[{url,title:'Maintenance guide'}]});
const inspect=row('browser.inspect',{url},{url,dom:'<title>Maintenance guide</title><main><p>Air conditioner maintenance includes regular cleaning of filters to help improve cooling efficiency in residential homes.</p></main>'});
const pdfOutput='.jarvis-artifacts/qwen-general/'+mission+'/old-invalid.pdf';
const sha='a'.repeat(64);
const obsolete=row('document.create',{output:pdfOutput,format:'pdf',content:'Old unverified content'},{
 output:pdfOutput,artifact:{file:pdfOutput,sha256:sha},
 pdfContentProof:{verified:true,sourceSha256:sha,pages:1}});
const saved={missionId:mission,record:{status:'PARTIAL',reason:'STEP_LIMIT_REACHED',receipts:[research,inspect,obsolete]}};
const user={getIdToken:async()=>'local-test-only'};
const auth={currentUser:user};
test('research continuation preserves genuine opened sources, but drops obsolete PDF and never reads it',async()=>{
 let reads=0;
 const bridge={requestJson:async()=>{reads++;throw Error('OBSOLETE_FILE_MUST_NOT_BE_READ');}};
 const resumed=await verifiedResearchResumeReceipts(saved,mission,bridge,auth,undefined,
   'Investiga mantenimiento de aire acondicionado y entrega DOCX y PDF');
 assert.deepEqual(resumed.map(r=>r.name),['web.research','browser.inspect']);
 assert.equal(reads,0);
});
test('research continuation refuses cross-scope database receipts or forged inspected URLs',async()=>{
 const bridge={requestJson:async()=>{throw Error('NO_REMOTE_READ');}};
 await assert.rejects(()=>verifiedResearchResumeReceipts({...saved,record:{...saved.record,receipts:[research,inspect,row('platform.query',{}, {})]}},
  mission,bridge,auth,undefined,'Investiga'),/QWEN_RESEARCH_RESUME_RECEIPTS_INVALID/);
 await assert.rejects(()=>verifiedResearchResumeReceipts({...saved,record:{...saved.record,receipts:[research,row('browser.inspect',{url:'https://elsewhere.net/'},{url:'https://elsewhere.net/',dom:'<title>Fake</title>'})]}},
  mission,bridge,auth,undefined,'Investiga'),/QWEN_RESEARCH_RESUME_SOURCE_MISMATCH/);
});
test('resumed office writer must use fresh recovery filename, never old physical filename',()=>{
 const instruction='CONTINUAR_MISION: '+mission+'\nInvestiga mantenimiento de aire acondicionado y entrega informe DOCX y PDF';
 const objective=generalObjectives(instruction);
 const policy={accept:()=>true,artifactRoot:'.jarvis-artifacts/qwen-general/'+mission+'/',audioPrefix:'.jarvis-artifacts/audio/'+mission+'-',imagePrefix:mission+'-'};
 const tool=generalToolCatalog({list:()=>[{
  name:'document.create',inputSchema:{type:'object',properties:{output:{type:'string'},format:{type:'string'},title:{type:'string'},content:{type:'string'}},required:[]}
 }]},policy,objective,instruction)[0];
 const pattern=new RegExp(tool.inputSchema.properties.output.pattern);
 assert.equal(pattern.test(pdfOutput),false);
 assert.equal(pattern.test('.jarvis-artifacts/qwen-general/'+mission+'/recovery-research.docx'),true);
});

test('truncated title-less inspected page is retained as a read but never credited as a source',async()=>{
 const partial=row('browser.inspect',{url},{url,dom:'<html><main>Partial HTML captured without a valid title.</main>'});
 const receipts=[research,partial];
 const old={missionId:mission,record:{status:'PARTIAL',reason:'STEP_LIMIT_REACHED',receipts}};
 const out=await verifiedResearchResumeReceipts(old,mission,{requestJson:async()=>{throw Error('NO_FILE');}},auth,undefined,
  'Investiga mantenimiento preventivo de aire acondicionado y entrega DOCX y PDF');
 assert.equal(out.length,2);
 const {independentResearchProofs}=await import('../modules/terminal/qwen-general-evidence.js');
 assert.equal(independentResearchProofs(out,'Investiga mantenimiento preventivo de aire acondicionado').length,0);
});

test('second research continuation uses the original artifact directory and rechecks any accepted DOCX',async()=>{
 const id='resume-71276af3-3ce5-483b-b335-abbb2dea70ec';
 const original=mission;
 const record={missionId:id,record:{status:'PARTIAL',reason:'LOCAL_QWEN_ACTION_INCOMPLETE',receipts:[research,inspect,obsolete]}};
 const result=await verifiedResearchResumeReceipts(record,id,{requestJson:async()=>{throw Error('OBSOLETE_NOT_READ');}},auth,undefined,
  'CONTINUAR_MISION: '+id+'\nORIGEN_MISION: '+original+'\nInvestiga mantenimiento aire acondicionado, entrega DOCX y PDF',original);
 assert.deepEqual(result.map(r=>r.name),['web.research','browser.inspect']);
});

test('real Qwen failure envelope can resume only with exact local incomplete failureCode',async()=>{
 const id='resume-71276af3-3ce5-483b-b335-abbb2dea70ec';
 const body={status:'PARTIAL',reason:'MODEL_UNAVAILABLE',failureCode:'LOCAL_QWEN_ACTION_INCOMPLETE',receipts:[research,inspect]};
 const rec={missionId:id,record:body};
 const bridge={requestJson:async()=>{throw Error('NO_ASSET');}};
 const valid=await verifiedResearchResumeReceipts(rec,id,bridge,auth,undefined,'Investiga aire acondicionado',mission);
 assert.equal(valid.length,2);
 for(const wrong of ['OTHER_ERROR','LOCAL_QWEN_TIMEOUT']){
  await assert.rejects(()=>verifiedResearchResumeReceipts({...rec,record:{...body,failureCode:wrong}},id,bridge,auth,undefined,'Investiga aire acondicionado',mission),/QWEN_RESEARCH_RESUME_SCOPE_INVALID/);
 }
});
