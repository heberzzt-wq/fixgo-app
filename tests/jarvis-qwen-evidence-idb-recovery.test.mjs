import test from 'node:test';
import assert from 'node:assert/strict';
import {persistEvidence} from '../modules/terminal/qwen-general-pilot.js';

function databaseFixture({upgrade=true,blocked=false,missingAfterUpgrade=false,transactionThrows=false,aborted=false}={}){
 const stores=new Set(),written=[];
 let closes=0,openedVersion=null;
 const db={
  objectStoreNames:{contains:name=>stores.has(name)},
  createObjectStore(name){stores.add(name);},
  transaction(name){
   if(transactionThrows||!stores.has(name))throw Error('NotFoundError');
   const tx={error:null,objectStore:()=>({put:record=>{written.push(record);queueMicrotask(()=>{
    if(aborted)tx.onabort?.();
    else tx.oncomplete?.();
   });}})};
   return tx;
  },
  close(){closes++;}
 };
 return {written,stores,get closes(){return closes;},get openedVersion(){return openedVersion;},
  open(name,version){
   assert.equal(name,'jarvis-qwen-general-evidence');
   openedVersion=version;
   const req={result:db,error:null};
   queueMicrotask(()=>{
    if(blocked){req.onblocked?.();return;}
    if(upgrade&&!missingAfterUpgrade)req.onupgradeneeded?.();
    req.onsuccess?.();
   });
   return req;
  }
 };
}

test('mobile IndexedDB v1 without missions upgrades to schema v2 and durably persists exact evidence',async()=>{
 const dbFactory=databaseFixture();
 const record={status:'PARTIAL',reason:'HTTP_404',receipts:[{name:'browser.inspect',ok:false}]};
 const receipt=await persistEvidence('general-local-test',record,{dbFactory});
 assert.equal(receipt.ok,true);
 assert.equal(dbFactory.openedVersion,2);
 assert.equal(dbFactory.written.length,1);
 assert.equal(dbFactory.written[0].missionId,'general-local-test');
 assert.deepEqual(dbFactory.written[0].record,record);
 assert.equal(dbFactory.written[0].sha256,receipt.sha256);
 assert.equal(dbFactory.closes,1);
 URL.revokeObjectURL(receipt.downloadUrl);
});

test('broken existing database without missions fails explicitly rather than holding the mobile mission forever',async()=>{
 const dbFactory=databaseFixture({upgrade:false,missingAfterUpgrade:true});
 const outcome=await Promise.race([
  persistEvidence('general-broken', {status:'PARTIAL'},{dbFactory,timeoutMs:500}),
  new Promise(resolve=>setTimeout(()=>resolve({reason:'HUNG_FOREVER'}),350))
 ]);
 assert.equal(outcome.ok,false);
 assert.equal(outcome.reason,'LOCAL_EVIDENCE_STORE_SCHEMA_MISSING');
 assert.notEqual(outcome.reason,'HUNG_FOREVER');
 assert.equal(dbFactory.closes,1);
});

test('blocked schema upgrades are bounded and cannot falsely certify a mission',async()=>{
 const outcome=await persistEvidence('general-blocked',{status:'SUCCESS'},{
  dbFactory:databaseFixture({blocked:true}),timeoutMs:500
 });
 assert.equal(outcome.ok,false);
 assert.equal(outcome.reason,'LOCAL_EVIDENCE_STORE_UPGRADE_BLOCKED');
});

test('a failed write and an aborted transaction never certify the result as successful',async()=>{
 for(const [fixture,reason] of [
  [databaseFixture({transactionThrows:true}),'LOCAL_EVIDENCE_STORE_WRITE_FAILED'],
  [databaseFixture({aborted:true}),'LOCAL_EVIDENCE_STORE_WRITE_ABORTED']
 ]){
  const outcome=await persistEvidence('general-failed',{status:'SUCCESS'},{dbFactory:fixture});
  assert.equal(outcome.ok,false);
  assert.equal(outcome.reason,reason);
 }
});
