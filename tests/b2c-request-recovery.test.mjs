import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { reserveB2cRequest, completeB2cRequest, assertB2cRequestActor } from '../b2c-request-recovery.js';
const memory = () => { const map = new Map(); return { map, getItem:k=>map.get(k)||null, setItem:(k,v)=>map.set(k,v), removeItem:k=>map.delete(k) }; };
test('uncertain response and reload retain the same operation without persisting personal contents', async () => {
    const storage=memory(); let n=0;
    const options={uid:'test-A',payload:{address:'PRIVATE_ADDRESS',category:'fix_ac'},storage,crypto:webcrypto,newId:()=>`service_${++n}`};
    const first=await reserveB2cRequest(options);
    const second=await reserveB2cRequest({...options,payload:{category:'fix_ac',address:'PRIVATE_ADDRESS'}});
    assert.equal(second.serviceId,first.serviceId);
    assert.doesNotMatch(JSON.stringify([...storage.map]),/PRIVATE_ADDRESS/);
    completeB2cRequest(second,storage);
    assert.notEqual((await reserveB2cRequest(options)).serviceId,first.serviceId);
});
test('account swap and changed request never reuse another pending operation', async () => {
    const storage=memory(); let n=0;
    const options={uid:'A',payload:{category:'fix_ac'},storage,crypto:webcrypto,newId:()=>`service_${++n}`};
    const a=await reserveB2cRequest(options),b=await reserveB2cRequest({...options,uid:'B'}),c=await reserveB2cRequest({...options,payload:{category:'fix_plomeria'}});
    assert.equal(new Set([a.serviceId,b.serviceId,c.serviceId]).size,3);
    assert.throws(()=>assertB2cRequestActor('A','B'),/SESSION_CHANGED/);
    assert.throws(()=>assertB2cRequestActor('A',null),/SESSION_CHANGED/);
    assert.doesNotThrow(()=>assertB2cRequestActor('A','A'));
});
test('unavailable persistence fails before creating an untracked operation', async () => {
    await assert.rejects(reserveB2cRequest({uid:'A',payload:{},storage:null,crypto:webcrypto,newId:()=>assert.fail()}),/RECOVERY_UNAVAILABLE/);
});
