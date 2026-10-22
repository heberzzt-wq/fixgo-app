import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {newestMissionEntry,restoreLatestMissionFailureCard}
 from '../modules/terminal/qwen-download-ui.js';
const mid=n=>'general-'+n.padStart(8,'0')+'-1111-4111-8111-111111111111';
const entry=(n,status,time)=>({missionId:mid(n),createdAt:time,
 record:{status,reason:status==='PARTIAL'?'ENGINEERING_SOURCE_BOUND_REPORT_REQUIRED':'VERIFIED_COMPLETE'}});
function fakeDb(records){
 return {open:()=>{const request={result:{objectStoreNames:{contains:()=>true},
 transaction:()=>{const tx={oncomplete:null,onerror:null,objectStore:()=>({openCursor:()=>{
  const cursor={result:null,onsuccess:null};
  queueMicrotask(()=>{for(const value of records){cursor.result={value,continue(){}};cursor.onsuccess?.()}
   cursor.result=null;cursor.onsuccess?.();tx.oncomplete?.();});
  return cursor;
 }})};return tx},
 close(){}},onsuccess:null};
 queueMicrotask(()=>request.onsuccess?.());return request}};
}
test('latest status not latest failure controls the failure panel',()=>{
 const first=entry('1','PARTIAL','2026-10-22T17:10:00Z');
 const second=entry('2','SUCCESS','2026-10-22T17:18:00Z');
 assert.equal([first,second].reduce(newestMissionEntry,null),second);
 assert.equal([second,first].reduce(newestMissionEntry,null),second);
 assert.equal([first,second].reduce(newestMissionEntry,null).record.status,'SUCCESS');
 assert.equal(newestMissionEntry(first,{missionId:'invalid',createdAt:'2999'}),first);
});
test('a newer verified success does not restore an obsolete partial banner',async()=>{
 const partial=entry('1','PARTIAL','2026-10-22T17:10:00Z');
 const success=entry('2','SUCCESS','2026-10-22T17:18:00Z');
 const prior=globalThis.indexedDB;
 const host={appended:0,append(){this.appended++}};
 globalThis.indexedDB=fakeDb([partial,success]);
 try{assert.equal(await restoreLatestMissionFailureCard(host),null);assert.equal(host.appended,0)}
 finally{globalThis.indexedDB=prior}
});
test('a genuinely new partial still restores an honest evidence card',async()=>{
 const success=entry('1','SUCCESS','2026-10-22T17:10:00Z');
 const partial=entry('2','PARTIAL','2026-10-22T17:18:00Z');
 const record=partial.record;
 partial.sha256=createHash('sha256').update(JSON.stringify(record)).digest('hex');
 const priorDb=globalThis.indexedDB,priorDoc=globalThis.document;
 let panel;
 globalThis.indexedDB=fakeDb([partial,success]);
 globalThis.document={createElement(tag){return {tagName:tag,children:[],dataset:{},append(...els){this.children.push(...els)}}}};
 const host={querySelectorAll:()=>[],append(p){panel=p}};
 try {
  const result=await restoreLatestMissionFailureCard(host);
  assert.ok(result);assert.equal(result,panel);
  assert.equal(panel.dataset.jarvisFailureEvidence,partial.missionId);
  assert.match(panel.children.map(x=>x.textContent).join(' '),/Última misión parcial/);
 }finally{globalThis.indexedDB=priorDb;globalThis.document=priorDoc}
});
test('successful terminal mission clears stale displayed failure panel',()=>{
 const html=readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
 assert.match(html,/if\(coreResult\?\.ok===true\)host\?\.querySelectorAll\('\[data-jarvis-failure-evidence\]'\)/);
});
