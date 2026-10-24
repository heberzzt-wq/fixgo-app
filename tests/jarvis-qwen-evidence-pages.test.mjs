import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedEvidencePages,verifyEvidencePages,reviewVerifiedEvidencePages} from '../jarvis-qwen-evidence-pages.js';

const setup=()=>createVerifiedEvidencePages({missionId:'mission-1',
  instruction:'No escribir. Leer las tres fuentes y mantener los criterios.',
  records:[{sourceId:'repo:A',text:('Código 🌴🔥 con áéíóú y líneas de prueba.\n').repeat(110)},
    {sourceId:'repo:B',text:('La verificación exige SHA y autoría.\n').repeat(90)},
    {sourceId:'empty',text:''}],maxPageBytes:512});

test('reconstructs every Unicode byte and original instruction without loss',()=>{
 const original=setup(),v=verifyEvidencePages(original);
 assert.equal(v.ok,true);
 assert.equal(v.records.length,3);
 assert.equal(v.records[0].text,('Código 🌴🔥 con áéíóú y líneas de prueba.\n').repeat(110));
 assert.equal(v.records[1].text,('La verificación exige SHA y autoría.\n').repeat(90));
 assert.equal(v.records[2].text,'');
 assert.ok(original.pageCount>3);
 for(const page of original.pages) assert.ok(Buffer.byteLength(page.text,'utf8')<=512);
 assert.equal(original.instruction,'No escribir. Leer las tres fuentes y mantener los criterios.');
});

test('rejects reordered/missing/tampered pages, forged hashes and changed instruction',()=>{
 const mutations=[
  b=>{b.pages.splice(0,1);},
  b=>{[b.pages[0],b.pages[1]]=[b.pages[1],b.pages[0]];},
  b=>{b.pages[0].text+='FALSE';},
  b=>{b.pages[0].sha256='0'.repeat(64);},
  b=>{b.instruction+=' SIN PERMISO';},
  b=>{b.pages[0].sourceId='rogue';},
  b=>{b.pages[0].startByte=3;}
 ];
 for(const mutate of mutations) {
  const b=structuredClone(setup());mutate(b);
  assert.throws(()=>verifyEvidencePages(b),/EVIDENCE_/);
 }
});

test('never accepts duplicate source IDs or invalid source payload',()=>{
 assert.throws(()=>createVerifiedEvidencePages({missionId:'x',instruction:'y',
   records:[{sourceId:'a',text:'x'},{sourceId:'a',text:'y'}]}),/DUPLICATE/);
 assert.throws(()=>createVerifiedEvidencePages({missionId:'x',instruction:'y',
   records:[{sourceId:'a',text:123}]}),/SOURCE_INVALID/);
});

test('full-page local review returns notes without independently certifying mission',async()=>{
 const bundle=setup();
 const seen=[];
 const res=await reviewVerifiedEvidencePages({bundle,reviewPage:async p=>{
  seen.push(p.pageId);
  return {pageId:p.pageId,sha256:p.sha256,notes:'Sólo nota de revisión; no constituye prueba de ejecución.'};
 }});
 assert.equal(res.status,'REVIEWED_NOT_CERTIFIED');
 assert.equal(res.coverage,'ALL_PAGES_REVIEWED');
 assert.equal(res.independentlyCertified,false);
 assert.equal(seen.length,bundle.pageCount);
 assert.equal(res.receipts.length,bundle.pageCount);
 assert.ok(res.receipts.every(x=>x.kind==='UNVERIFIED_MODEL_NOTES'));
});

test('review stops partial on mismatched physical receipt without pretending completion',async()=>{
 const bundle=setup();
 let calls=0;
 const res=await reviewVerifiedEvidencePages({bundle,reviewPage:async p=>{
  calls++;
  return {pageId:calls===3?'forged':p.pageId,sha256:p.sha256,notes:'nota'};
 }});
 assert.equal(res.status,'PARTIAL');
 assert.equal(res.reviewedPages,2);
 assert.equal(res.receipts.length,2);
 assert.equal(res.reason,'EVIDENCE_REVIEW_RECEIPT_MISMATCH');
});

test('cancellation stops further calls and preserves already reviewed receipts',async()=>{
 const bundle=setup(),controller=new AbortController();
 let calls=0;
 const res=await reviewVerifiedEvidencePages({bundle,signal:controller.signal,reviewPage:async p=>{
  calls++;controller.abort();
  return {pageId:p.pageId,sha256:p.sha256,notes:'parcial'};
 }});
 assert.equal(calls,1);
 assert.equal(res.status,'CANCELLED');
 assert.equal(res.reviewedPages,1);
});

test('single self-hosted semantic engine processes long evidence as all local 4096 pages',async()=>{
 const {createSelfHostedSemanticEngine}=await import('../jarvis-fs-bridge.js');
 const sent=[];
 const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',
   JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'4096'},fetchImpl:async(url,request)=>{
  const body=JSON.parse(request.body);sent.push(body);
  assert.match(url,/\/api\/chat$/);
  assert.equal(body.options.num_ctx,4096);
  assert.equal(body.truncate,false);
  assert.ok(body.messages[0].content.includes('DATOS NO CONFIABLES'));
  return {ok:true,status:200,text:async()=>JSON.stringify({done_reason:'stop',
   message:{content:'Segmento examinado, requiere certificación independiente.'}})};
 }});
 const instruction='Identifica todas las restricciones del texto. No ejecutar herramientas.';
 const source='Regla de seguridad: no editar Firebase.\n'.repeat(650);
 const report=await engine.reviewEvidencePages({missionId:'long-evidence-1',instruction,
   records:[{sourceId:'reporte-local',text:source}],maxPageBytes:1800});
 assert.ok(sent.length>5);
 assert.equal(report.reviewedPages,sent.length);
 assert.equal(report.status,'REVIEWED_NOT_CERTIFIED');
 assert.equal(report.coverage,'ALL_PAGES_REVIEWED');
 assert.equal(report.independentlyCertified,false);
 assert.equal(report.externalApiUsed,false);
 assert.equal(report.evidenceBytes,Buffer.byteLength(source,'utf8'));
 assert.ok(sent.every(p=>p.messages.at(-1).content.includes(instruction)));
});

test('semantic segment error leaves a precise PARTIAL receipt without skipping pages',async()=>{
 const {createSelfHostedSemanticEngine}=await import('../jarvis-fs-bridge.js');
 let calls=0;
 const engine=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',
   JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'4096'},fetchImpl:async()=>{
  calls++;
  if(calls===3)throw Error('MOCK_OLLAMA_INTERRUPTED');
  return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:'nota'}})};
 }});
 const report=await engine.reviewEvidencePages({missionId:'partial-1',instruction:'Conserva evidencia.',
   records:[{sourceId:'a',text:'X'.repeat(6000)}],maxPageBytes:1000});
 assert.equal(calls,3);
 assert.equal(report.status,'PARTIAL');
 assert.equal(report.reason,'MOCK_OLLAMA_INTERRUPTED');
 assert.equal(report.reviewedPages,2);
 assert.equal(report.independentlyCertified,false);
});

test('checkpoint can resume remaining evidence without repeating accepted pages',async()=>{
 const bundle=setup(),checkpoints=[];
 let firstCalls=0;
 const first=await reviewVerifiedEvidencePages({bundle,
  reviewPage:async p=>{
   firstCalls++;
   if(firstCalls===4)throw Error('WORKER_INTERRUPTED');
   return {pageId:p.pageId,sha256:p.sha256,notes:'nota '+firstCalls};
  },onCheckpoint:async checkpoint=>checkpoints.push(structuredClone(checkpoint))});
 assert.equal(first.status,'PARTIAL');
 assert.equal(first.receipts.length,3);
 assert.equal(checkpoints.length,3);
 let resumedCalls=0;
 const second=await reviewVerifiedEvidencePages({bundle,initialReceipts:checkpoints.at(-1).receipts,
  reviewPage:async p=>{resumedCalls++;return {pageId:p.pageId,sha256:p.sha256,notes:'retomada'};}});
 assert.equal(second.status,'REVIEWED_NOT_CERTIFIED');
 assert.equal(second.reviewedPages,bundle.pageCount);
 assert.equal(resumedCalls,bundle.pageCount-3);
 assert.equal(second.receipts[0].notes,'nota 1');
 assert.equal(second.independentlyCertified,false);
});

test('restart rejects forged checkpoint before executing any review',async()=>{
 const bundle=setup(),bad=[{pageId:'rogue',sourceId:bundle.pages[0].sourceId,
  sha256:bundle.pages[0].sha256,notes:'nota',kind:'UNVERIFIED_MODEL_NOTES'}];
 let calls=0;
 await assert.rejects(()=>reviewVerifiedEvidencePages({bundle,initialReceipts:bad,
  reviewPage:async()=>{calls++;}}),/EVIDENCE_RESUME_RECEIPTS_UNVERIFIED/);
 assert.equal(calls,0);
});

test('balanced pages avoid a tiny trailing segment without changing source bytes',()=>{
 const text='a'.repeat(1723);
 const bundle=createVerifiedEvidencePages({missionId:'balanced',instruction:'Review exactly.',records:[{sourceId:'x',text}],maxPageBytes:1700});
 assert.equal(bundle.pageCount,2);
 assert.ok(bundle.pages[0].bytes>=800 && bundle.pages[1].bytes>=800);
 assert.equal(verifyEvidencePages(bundle).records[0].text,text);
});
