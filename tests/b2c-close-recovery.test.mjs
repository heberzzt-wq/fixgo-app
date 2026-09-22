import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
function harness({binding,actor='owner'}={}) {
    const calls={close:0,upload:0,alerts:[]},objects=new Map();
    const context=vm.createContext({crypto:webcrypto,Blob,Uint8Array,Promise,console:{error(){}},storage:{},db:{},auth:{currentUser:{uid:actor}},
      ref:(_s,path)=>({fullPath:path}),doc:(_db,...args)=>({path:args.join('/')}),
      getMetadata:async target=>{if(!objects.has(target.fullPath))throw Object.assign(new Error(),{code:'storage/object-not-found'});return {};},
      uploadBytes:async(target,blob)=>{calls.upload++;objects.set(target.fullPath,blob);},getDownloadURL:async target=>`https://fixture.invalid/${target.fullPath}`,
      getDoc:async()=>({exists:()=>Boolean(binding),data:()=>binding}),cerrarServicioB2C:async()=>{calls.close++;return {ok:true};},
      document:{getElementById:()=>({remove(){}})},alert:message=>calls.alerts.push(message)});
    const source=fs.readFileSync(new URL('../tecnico.html',import.meta.url),'utf8');
    vm.runInContext(source.slice(source.indexOf('const mimeExt ='),source.indexOf('async function canonicalB2BStart')),context);
    return {context,calls,objects};
}
test('bound close resumes after response loss without a second upload or requiring files again',async()=>{
    const h=harness({binding:{technician_id:'owner'}});
    await h.context.canonicalClose('service_1',{innerHTML:'Close'});
    await h.context.canonicalClose('service_1',{innerHTML:'Close'});
    assert.equal(h.calls.close,2);assert.equal(h.calls.upload,0);
});
test('pending closure owned by account A never replays under account B',async()=>{
    const h=harness({binding:{technician_id:'owner'},actor:'other'});
    await h.context.canonicalClose('service_1',{innerHTML:'Close'});
    assert.equal(h.calls.close,0);assert.match(h.calls.alerts[0],/SESSION_CHANGED/);
});
test('retry of the same evidence after partial upload reuses its content-derived immutable object',async()=>{
    const h=harness();const file=new Blob(['fixture-image'],{type:'image/png'});
    const first=await h.context.uploadEvidence('service_1','owner',file,'work_before');
    const retry=await h.context.uploadEvidence('service_1','owner',file,'work_before');
    assert.equal(first.storage_path,retry.storage_path);assert.equal(h.calls.upload,1);
    assert.match(first.storage_path,/\/[a-f0-9]{64}\.png$/);
    const other=await h.context.uploadEvidence('service_1','other',file,'work_before');
    assert.notEqual(other.storage_path,first.storage_path);
});
