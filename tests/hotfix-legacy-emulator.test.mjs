import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw new Error('LOCAL_FIRESTORE_EMULATOR_REQUIRED');
process.env.GCLOUD_PROJECT='fixgo-b2c-rules-test';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const entry=require('./'+require('./package.json').main);
const db=admin.firestore();
const prefix=`hotfix-${randomUUID()}`;
const ids=[];
const profile={rol:'tecnico',tipo_cuenta:'B2C',estado:'activo',status:'activo',disponible:true,suspendido:false,
    kyc:{estado:'activo',aprobado:true},skills:['fix_plomeria'],foto_perfil:'https://fixture.invalid/photo',
    documentos:{ine:'https://fixture.invalid/ine',csf:'https://fixture.invalid/csf'},
    datos_bancarios:{banco:'Fixture',clabe:'012345678901234567'},vehiculo:{tipo:'peaton'},wallet_balance:123};
const auth=uid=>({auth:{uid,token:{}}});
async function seed(label,balance=1000){
    const uid=`${prefix}-${label}`;ids.push(uid);
    await db.doc(`users/${uid}`).set(profile);
    await db.doc(`transacciones/${uid}-credit`).set({tecnico_id:uid,tipo:'abono_stripe',pago_tecnico:balance});
    return uid;
}
async function rows(name,uid){return db.collection(name).where('tecnico_id','==',uid).get();}
async function invariant(uid,count){
    assert.equal((await rows('retiros',uid)).size,count);
    const ledger=await rows('transacciones',uid);
    assert.equal(ledger.size,1,'request must reserve withdrawal, never duplicate/mutate ledger');
    assert.equal(ledger.docs[0].data().pago_tecnico,1000);
    assert.equal((await db.doc(`users/${uid}`).get()).data().wallet_balance,123);
    assert.equal((await db.collection('withdrawals').where('userId','==',uid).get()).size,0);
}
after(async()=>{
    for(const uid of ids){
        for(const collection of ['retiros','transacciones'])for(const doc of (await rows(collection,uid)).docs)await doc.ref.delete();
        await db.doc(`users/${uid}`).delete();
        await db.doc(`withdrawal_guards/${uid}`).delete().catch(()=>{});
    }
    await Promise.all(admin.apps.map(app=>app.delete()));
});

test('hotfix actual package: negative amount/monto/no-key never changes money',async()=>{
    assert.strictEqual(entry.requestPayout,entry.solicitarRetiro);
    const uid=await seed('negative');
    for(const payload of [{amount:-100},{monto:-100},{amount:0},{amount:0.001},{amount:true},{amount:false},{amount:'100'},{amount:null},{amount:Infinity},{monto:100}]){
        await assert.rejects(entry.requestPayout.run({...payload,requestId:'negative-key-001'},auth(uid)),e=>e.code==='invalid-argument');
    }
    await assert.rejects(entry.requestPayout.run({amount:100},auth(uid)),e=>e.code==='invalid-argument');
    await invariant(uid,0);
});

test('hotfix real transaction: same requestId concurrent replay reserves once and survives processed status',async()=>{
    const uid=await seed('replay');
    const payload={amount:200,requestId:'same-request-001'};
    const results=await Promise.all(Array.from({length:4},()=>entry.requestPayout.run(payload,auth(uid))));
    assert.equal(new Set(results.map(r=>r.withdrawalId)).size,1);
    assert.ok(results.every(r=>r.ok===true && r.amount===200));
    assert.equal(results.filter(r=>r.replay===true).length,3);
    const ref=db.doc(`retiros/${results[0].withdrawalId}`);
    await ref.update({estado:'procesado'});
    const snapshot=await ref.get();
    const replay=await entry.requestPayout.run(payload,auth(uid));
    assert.equal(replay.withdrawalId,ref.id);assert.equal(replay.replay,true);
    assert.deepEqual((await ref.get()).updateTime,snapshot.updateTime,'replay must not rewrite the reservation');
    await assert.rejects(entry.requestPayout.run({...payload,amount:201},auth(uid)),e=>e.code==='invalid-argument');
    await invariant(uid,1);
});

test('hotfix real transaction: distinct requestIds cannot overspend concurrently',async()=>{
    const uid=await seed('overspend');
    const results=await Promise.allSettled(['withdrawal-key-A','withdrawal-key-B'].map(requestId=>entry.requestPayout.run({amount:800,requestId},auth(uid))));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected').length,1);
    assert.equal((await rows('retiros',uid)).docs[0].data().monto,800);
    await invariant(uid,1);
});
