import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createVerifiedEvidencePages,reviewVerifiedEvidencePages} from '../jarvis-qwen-evidence-pages.js';
import {createEvidenceCheckpointStore} from '../jarvis-qwen-evidence-checkpoint.js';

const bundle=()=>createVerifiedEvidencePages({missionId:'m-1',instruction:'No modificar y conservar todo.',
 records:[{sourceId:'repo:one',text:'Evidencia real 🌴 de codigo.\n'.repeat(220)}],maxPageBytes:400});
const temp=async fn=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jarvis-ckpt-'));
 try{return await fn(dir);} finally{await fs.rm(dir,{recursive:true,force:true});}};
test('checkpoint is atomic, durable, and resumes only remaining pages',()=>temp(async dir=>{
 const b=bundle(),store=createEvidenceCheckpointStore({directory:dir,bundle:b});
 let calls=0;
 const first=await reviewVerifiedEvidencePages({bundle:b,onCheckpoint:store.save,
  reviewPage:async p=>{calls++;if(calls===4)throw Error('SIMULATED_STOP');
   return {pageId:p.pageId,sha256:p.sha256,notes:'verified as model note only'};}});
 assert.equal(first.status,'PARTIAL');
 assert.equal(first.receipts.length,3);
 const saved=await store.load();
 assert.equal(saved.length,3);
 const rest=await reviewVerifiedEvidencePages({bundle:b,initialReceipts:saved,
  onCheckpoint:store.save,reviewPage:async p=>{
   calls++;return {pageId:p.pageId,sha256:p.sha256,notes:'model note'};}});
 assert.equal(rest.status,'REVIEWED_NOT_CERTIFIED');
 assert.equal(rest.independentlyCertified,false);
 assert.equal(calls, b.pageCount+1);
 assert.equal((await store.load()).length,b.pageCount);
 const names=await fs.readdir(dir);
 assert.equal(names.filter(x=>x.endsWith('.tmp')).length,0);
}));
test('rejects rollback, corrupted checkpoints and forged receipts',()=>temp(async dir=>{
 const b=bundle(),store=createEvidenceCheckpointStore({directory:dir,bundle:b});
 const first=b.pages[0];
 const one={pageId:first.id,sourceId:first.sourceId,sha256:first.sha256,
  kind:'UNVERIFIED_MODEL_NOTES',notes:'observacion'};
 const snapshot={missionId:b.missionId,instructionSha256:b.instructionSha256,
  totalPages:b.pageCount,receipts:[one]};
 await store.save(snapshot);
 await assert.rejects(store.save({...snapshot,receipts:[]}),/ROLLBACK_OR_FORK/);
 await assert.rejects(store.save({...snapshot,receipts:[{...one,sha256:'0'.repeat(64)}]}),/RECEIPT_MISMATCH/);
 await fs.writeFile(store.file,'{broken json');
 await assert.rejects(store.load(),/CORRUPT_JSON/);
}));
test('same mission identifier cannot reuse checkpoint for modified evidence',()=>temp(async dir=>{
 const original=bundle();
 const s=createEvidenceCheckpointStore({directory:dir,bundle:original});
 const p=original.pages[0];
 await s.save({missionId:original.missionId,instructionSha256:original.instructionSha256,
   totalPages:original.pageCount,receipts:[{pageId:p.id,sha256:p.sha256,sourceId:p.sourceId,
     notes:'nota',kind:'UNVERIFIED_MODEL_NOTES'}]});
 const changed=createVerifiedEvidencePages({missionId:'m-1',instruction:'No modificar y conservar todo.',
   records:[{sourceId:'repo:one',text:'OTRA evidencia'}],maxPageBytes:400});
 const other=createEvidenceCheckpointStore({directory:dir,bundle:changed});
 assert.notEqual(s.file,other.file);
 assert.deepEqual(await other.load(),[]);
}));

test('semantic engine persists a partial page review and resumes after a new engine instance',()=>temp(async dir=>{
 const {createSelfHostedSemanticEngine}=await import('../jarvis-fs-bridge.js');
 const request={missionId:'sem-restart',instruction:'Leer todas las páginas sin editar',
  records:[{sourceId:'repo:verified',text:'Evidencia autenticada.\n'.repeat(140)}],
  maxPageBytes:480,checkpointDirectory:dir};
 let firstCalls=0;
 const first=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',
   JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'4096'},fetchImpl:async()=>{
   firstCalls++;
   if(firstCalls===3)throw Error('SIMULATED_QWEN_UNAVAILABLE');
   return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:'observacion local'}})};
 }});
 const partial=await first.reviewEvidencePages(request);
 assert.equal(partial.status,'PARTIAL');
 assert.equal(partial.reviewedPages,2);
 const secondSent=[];
 const second=createSelfHostedSemanticEngine({env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b',
   JARVIS_LOCAL_LLM_CONTEXT_TOKENS:'4096'},fetchImpl:async(_url,req)=>{
   secondSent.push(JSON.parse(req.body));
   return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:'nota sin certificacion'}})};
 }});
 const completed=await second.reviewEvidencePages(request);
 assert.equal(completed.status,'REVIEWED_NOT_CERTIFIED');
 assert.equal(completed.independentlyCertified,false);
 assert.equal(completed.reviewedPages,completed.totalPages);
 assert.equal(secondSent.length,completed.totalPages-2);
 assert.equal(completed.receipts[0].notes,'observacion local');
}));
