import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('EMULATORS_REQUIRED');
const admin = require('firebase-admin');
const projectId = 'fixgo-b2c-rules-test';
admin.initializeApp({ projectId, storageBucket: 'fixgo-44e4d.firebasestorage.app' });
const db = admin.firestore();
const bucket = admin.storage().bucket('fixgo-44e4d.firebasestorage.app');
const policy = require('./b2c-financial-policy');
const { createB2CServiceSettlementEngine, createStoredEvidenceVerifier, createB2CServiceReconciliationHandler, createB2cOperationalClosureHandler } = require('./b2c-service-settlement');
const verifier = createStoredEvidenceVerifier({ bucket });
const engine = createB2CServiceSettlementEngine({admin,db,financialPolicy:policy,verifyEvidence:verifier});
const complete = createB2cOperationalClosureHandler({admin,db,financialPolicy:policy,verifyEvidence:verifier});
let server;
let base;
const secret = 'whsec_local_forensic_fixture';
process.env.STRIPE_SECRET_KEY = 'sk_test_local_forensic_fixture';
process.env.STRIPE_WEBHOOK_SECRET = secret;
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const bytes = Buffer.from('local-test-evidence-bytes');
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
async function seed(id, extra = {}, withObjects = true) {
    const tech = 'finance-tech-'+id;
    const service = {estado:'finalizado',tecnico_id:tech,cliente_id:'finance-customer',costo_final:1000,metodo_pago:'stripe',monto_pagado:1000,
        cierre_operativo_completado:true,cierre_financiero_pendiente_backend:true,cierre_legacy_financiero_ejecutado:false,
        work_evidence_binding_path:`services/${id}/work_evidence_bindings/current`,...extra};
    const binding={service_id:id,technician_id:tech};
    for (const [key,event] of [['before','work_before'],['after','work_after'],['signature','customer_signature']]) {
        const path=key==='signature'?`servicios/${id}/customer_signature_1.png`:`b2c_evidence/${id}/${tech}/${event}/1.png`;
        binding[key]={sha256:sha,storage_path:path,download_url:'https://untrusted.invalid/ignored'};
        if(key==='signature') Object.assign(binding[key],{present:true,base64_persisted:false});
        if(withObjects) await bucket.file(path).save(bytes,{resumable:false,metadata:{contentType:'image/png',metadata:{firebaseStorageDownloadTokens:'fixture-token',serviceId:id,actorUid:tech,actorRole:'tecnico',eventType:event,...(key==='signature'?{base64Persisted:'false'}:{})}}});
    }
    await db.doc('users/'+tech).set({rol:'tecnico',tipo_cuenta:'B2C',status:'activo',estado:'activo',comision_asignada:0.32,servicios_completados:0,reputacion:0});
    await db.doc('services/'+id).set(service);
    await db.doc(service.work_evidence_binding_path).set(binding);
    return {tech,service,binding};
}
before(async()=>{
    const secure = require('./secure-entry');
    server=http.createServer(secure.api);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await admin.app().delete();});

test('real Firestore concurrent settlement commits one ledger and one statistics increment',async()=>{
    const {tech}=await seed('finance-race');
    const results=await Promise.all(Array.from({length:4},()=>engine({serviceId:'finance-race'})));
    assert.equal(results.filter(x=>x.status==='settled').length,1);
    assert.equal(results.filter(x=>x.status==='already_settled').length,3);
    assert.equal((await db.doc('users/'+tech).get()).data().servicios_completados,1);
    const ledger=(await db.doc('transacciones/txn_split_finance-race').get()).data();
    assert.equal(ledger.pago_tecnico,680);
    assert.equal(ledger.verified_evidence.before.sha256,sha);
    assert.ok(ledger.verified_evidence.signature.generation);
});

test('real Storage missing, replaced, foreign path and invalid metadata never settle',async()=>{
    for(const variant of ['missing','replaced','foreign','metadata']) {
        const id='finance-'+variant;
        const {binding}=await seed(id,{},variant!=='missing');
        if(variant==='replaced') await bucket.file(binding.before.storage_path).save(Buffer.from('replacement'),{resumable:false,metadata:{contentType:'image/png',metadata:{serviceId:id,actorUid:binding.technician_id,actorRole:'tecnico',eventType:'work_before'}}});
        if(variant==='foreign') await db.doc(`services/${id}/work_evidence_bindings/current`).update({'before.storage_path':'b2c_evidence/foreign/tech/work_before/1.png'});
        if(variant==='metadata') await bucket.file(binding.after.storage_path).setMetadata({metadata:{actorUid:'attacker'}});
        await assert.rejects(engine({serviceId:id}),/FINAL_EVIDENCE_/);
        assert.equal((await db.doc('transacciones/txn_split_'+id).get()).exists,false);
        assert.equal((await db.doc('services/'+id).get()).data().liquidacion_bloqueada,true);
    }
});

test('real concurrent B2B debit and cash ledger are idempotent',async()=>{
    await db.doc('users/finance-customer').set({saldo_virtual:2000});
    await seed('finance-b2b',{metodo_pago:'b2b'});
    await Promise.all([engine({serviceId:'finance-b2b'}),engine({serviceId:'finance-b2b'})]);
    assert.equal((await db.doc('users/finance-customer').get()).data().saldo_virtual,1000);
    await seed('finance-cash',{metodo_pago:'efectivo',monto_pagado:0});
    await Promise.all([engine({serviceId:'finance-cash'}),engine({serviceId:'finance-cash'})]);
    assert.equal((await db.doc('transacciones/txn_split_finance-cash').get()).data().pago_tecnico,-320);
});

test('reconciliation persists attempt before retry and cannot clear hold or inject payment',async()=>{
    await seed('finance-reconcile',{monto_pagado:10,b2c_financial_hold:{active:true}});
    const handler=createB2CServiceReconciliationHandler({db,admin,settleCompletedService:engine,authorize:async ctx=>{if(ctx.auth?.uid!=='test-admin')throw new Error('ADMIN_REQUIRED');}});
    await assert.rejects(handler({serviceId:'finance-reconcile',reason:'verify'},{}),/ADMIN_REQUIRED/);
    await assert.rejects(handler({serviceId:'finance-reconcile',reason:'verify',monto_pagado:1000,b2c_financial_hold:{active:false}},{auth:{uid:'test-admin'}}),/FINANCIAL_HOLD/);
    const s=(await db.doc('services/finance-reconcile').get()).data();
    assert.equal(s.b2c_financial_hold.active,true);assert.equal(s.monto_pagado,10);
    const attempts=await db.collection('services/finance-reconcile/settlement_reconciliation_attempts').get();
    assert.equal(attempts.size,1);assert.equal(attempts.docs[0].data().status,'blocked');
});

async function webhook(id, session, type='checkout.session.completed') {
    const payload=JSON.stringify({id,type,data:{object:session}});
    const signature=stripe.webhooks.generateTestHeaderString({payload,secret});
    const response=await fetch(base+'/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body:payload});
    return {status:response.status,body:await response.json()};
}
async function paymentFixture(id) {
    await db.doc('services/'+id).set({cliente_id:'finance-customer',estado:'iniciado_stripe',metodo_pago:'stripe',retencion_inicial:350,monto_pagado:0});
    return {id:'cs_'+id,mode:'payment',payment_status:'paid',currency:'mxn',amount_total:35000,payment_intent:'pi_'+id,metadata:{serviceId:id,tipo_pago:'garantia_inicial',customerUid:'finance-customer',tenantId:'default'}};
}
test('signed real HTTP webhook races credit once and dedupe a second event for same session',async()=>{
    const session=await paymentFixture('finance-stripe');
    const responses=await Promise.all([webhook('evt_finance_1',session),webhook('evt_finance_1',session),webhook('evt_finance_2',session)]);
    assert.ok(responses.every(r=>r.status===200),JSON.stringify(responses));
    assert.equal((await db.doc('services/finance-stripe').get()).data().monto_pagado,350);
    assert.equal((await db.collection('transacciones').where('servicio_id','==','finance-stripe').get()).size,1);
});
test('unpaid, foreign currency, wrong customer, cancelled and cash Stripe callbacks fail closed',async()=>{
    for(const variant of ['unpaid','currency','customer','cancelled','cash','partial']) {
        const id='finance-webhook-'+variant;const session=await paymentFixture(id);
        if(variant==='unpaid')session.payment_status='unpaid';
        if(variant==='partial')session.amount_total=34999;
        if(variant==='currency')session.currency='usd';
        if(variant==='customer')session.metadata.customerUid='attacker';
        if(variant==='cancelled')await db.doc('services/'+id).update({estado:'cancelado'});
        if(variant==='cash')await db.doc('services/'+id).update({metodo_pago:'efectivo'});
        assert.equal((await webhook('evt_'+id,session)).status,500);
        assert.equal((await db.doc('services/'+id).get()).data().monto_pagado,0);
        assert.equal((await db.doc('failed_events/evt_'+id).get()).data().retry_required,true);
    }
});


test('a settled flag with missing ledger is a detected inconsistency',async()=>{
    await seed('finance-false-settled',{liquidado:true,ledger_transaction_id:'txn_split_finance-false-settled'});
    await assert.rejects(engine({serviceId:'finance-false-settled'}),/SETTLED_LEDGER_INCONSISTENT/);
});


async function closureFixture(id, objects=true) {
    const fixture=await seed(id,{estado:'trabajando',cierre_operativo_completado:false,cierre_financiero_pendiente_backend:false},objects);
    await db.doc('users/'+fixture.tech).update({kyc:{estado:'activo',aprobado:true},foto_perfil:'https://fixture.invalid/photo',documentos:{ine:'https://fixture.invalid/ine',csf:'https://fixture.invalid/csf'},vehiculo:{tipo:'peaton'},datos_bancarios:{banco:'Fixture',clabe:'012345678901234567'},skills:['fix_plomeria']});
    return fixture;
}
test('operational closure validates physical objects before final state, is concurrent and writes no money',async()=>{
    const id='finance-operational';const f=await closureFixture(id);
    const result=await Promise.all([complete({serviceId:id},{auth:{uid:f.tech}}),complete({serviceId:id,costo_final:1,liquidado:true},{auth:{uid:f.tech}})]);
    assert.equal(result.filter(x=>x.status==='completed').length,1);
    assert.equal(result.filter(x=>x.status==='already_completed').length,1);
    const service=(await db.doc('services/'+id).get()).data();
    assert.equal(service.estado,'finalizado');assert.equal(service.costo_final,1000);assert.equal(service.liquidado,undefined);
    assert.equal((await db.doc('transacciones/txn_split_'+id).get()).exists,false);
    assert.ok(service.evidencia.antes1.startsWith('https://firebasestorage.googleapis.com/'));
    assert.ok(service.evidencia_verificada.signature.generation);
    assert.deepEqual(service.desglose,{subtotal:'862.07',iva:'137.93',total:1000});
});
test('closure rejects foreign caller, fake URL objects, replaced bytes and suspended technician',async()=>{
    for(const variant of ['caller','fake','replaced','suspended']) {
        const id='finance-operational-'+variant;const f=await closureFixture(id,variant!=='fake');
        if(variant==='replaced')await bucket.file(f.binding.before.storage_path).save(Buffer.from('replacement'),{resumable:false,metadata:{contentType:'image/png',metadata:{serviceId:id,actorUid:f.tech,actorRole:'tecnico',eventType:'work_before'}}});
        if(variant==='suspended')await db.doc('users/'+f.tech).update({suspendido:true});
        await assert.rejects(complete({serviceId:id},{auth:{uid:variant==='caller'?'attacker':f.tech}}));
        assert.equal((await db.doc('services/'+id).get()).data().estado,'trabajando');
    }
});

test('successful webhook retry resolves failed event atomically while preserving original error',async()=>{
    const id='finance-recovered-webhook';const session=await paymentFixture(id);const eventId='evt_'+id;
    await db.doc('services/'+id).update({b2c_financial_hold:{active:true}});
    assert.equal((await webhook(eventId,session)).status,500);
    const failed=(await db.doc('failed_events/'+eventId).get()).data();
    assert.equal(failed.retry_required,true);assert.equal(failed.error_code,'FINANCIAL_HOLD_OR_REVIEW_PENDING');
    await db.doc('services/'+id).update({b2c_financial_hold:{active:false}});
    assert.equal((await webhook(eventId,session)).status,200);
    const recovered=(await db.doc('failed_events/'+eventId).get()).data();
    assert.equal(recovered.error_code,failed.error_code);assert.equal(recovered.retry_required,false);
    assert.ok(recovered.resolved_at.toMillis()>0);assert.equal(recovered.resolved_by_event_id,eventId);
    assert.equal((await db.doc('services/'+id).get()).data().monto_pagado,350);
});
