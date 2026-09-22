import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('LOCAL_FIRESTORE_EMULATOR_REQUIRED');
const admin = require('firebase-admin');
const app = admin.initializeApp({ projectId: 'fixgo-b2c-rules-test' }, `workflow-${randomUUID()}`);
const db = app.firestore();
const { createClaimB2cServiceHandler, createCancelB2cServiceHandler, createRequestB2cWithdrawalHandler } = require('./b2c-service-marketplace');
const { createSubmitB2cQuoteHandler, createRespondB2cQuoteHandler } = require('./b2c-service-workflow');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const dependencies = { db, admin, functions: { https: { HttpsError } } };
const claim = createClaimB2cServiceHandler(dependencies);
const cancel = createCancelB2cServiceHandler(dependencies);
const submit = createSubmitB2cQuoteHandler(dependencies);
const respond = createRespondB2cQuoteHandler(dependencies);
const withdraw = createRequestB2cWithdrawalHandler(dependencies);
const prefix = `workflow-${randomUUID()}`;
const owned = new Set();
const savedConfig = new Map();
const auth = uid => ({ auth: { uid, token: {} } });
const profile = { rol: 'tecnico', tipo_cuenta: 'B2C', estado: 'activo', status: 'activo', disponible: true, suspendido: false,
 kyc: { estado: 'activo', aprobado: true }, skills: ['fix_plomeria'], foto_perfil: 'https://fixture.invalid/photo',
 documentos: { ine: 'https://fixture.invalid/ine', csf: 'https://fixture.invalid/csf' },
 datos_bancarios: { banco: 'Fixture', clabe: '012345678901234567' }, vehiculo: { tipo: 'peaton' } };
async function write(path, value) { owned.add(path); await db.doc(path).set(value); }
async function seed(label, extra = {}) {
 const id = `${prefix}-${label}`; const technician = `${id}-tech`; const other = `${id}-other`; const customer = `${id}-customer`;
 await Promise.all([write(`users/${technician}`,profile),write(`users/${other}`,profile),
  write(`users/${customer}`,{rol:'cliente',tipo_cuenta:'B2C',estado:'activo',status:'activo',pagos:{efectivo_autorizado:true}}),
  write(`services/${id}`,{estado:'pendiente',tipo:'b2c',cliente_id:customer,categoria_id:'fix_plomeria',metodo_pago:'efectivo',destino:{fuente:'mapa_pin',confirmado_por_cliente:true,coords:{lat:21,lng:-86}},...extra}),
  write(`service_marketplace/${id}`,{service_id:id,estado:'disponible'})]);
 owned.add(`technician_active_services/${technician}`);owned.add(`technician_active_services/${other}`);
 return {id,technician,other,customer};
}
before(async()=>{ for(const [name,value] of [['pagos',{efectivo_activo:true}],['catalogo_global',{fix_plomeria:true}]]){
 const ref=db.doc(`configuracion/${name}`);const snap=await ref.get();savedConfig.set(ref.path,snap.exists?snap.data():null);await ref.set(value);
}});
after(async()=>{for(const path of owned)await db.doc(path).delete();for(const [path,value] of savedConfig){if(value)await db.doc(path).set(value);else await db.doc(path).delete();}await app.delete();});
test('real transactions: simultaneous technicians and replay produce exactly one assignment and lock',async()=>{
 const f=await seed('claim');const results=await Promise.allSettled([claim({serviceId:f.id},auth(f.technician)),claim({serviceId:f.id},auth(f.other))]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const service=(await db.doc(`services/${f.id}`).get()).data();assert.equal(service.estado,'asignado');
 assert.equal((await db.doc(`technician_active_services/${service.tecnico_id}`).get()).data().service_id,f.id);
 assert.equal((await db.doc(`service_marketplace/${f.id}`).get()).exists,false);
 await assert.rejects(claim({serviceId:f.id},auth(service.tecnico_id)));
 assert.equal((await db.collection('technician_active_services').where('service_id','==',f.id).get()).size,1);
});
test('real transactions: customer cancel versus claim produces one winner without orphan lock',async()=>{
 const f=await seed('cancel');const results=await Promise.allSettled([claim({serviceId:f.id},auth(f.technician)),cancel({serviceId:f.id,reason:'Local emulator cancellation'},auth(f.customer))]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const service=(await db.doc(`services/${f.id}`).get()).data();const locked=(await db.doc(`technician_active_services/${f.technician}`).get()).exists;
 assert.ok(['asignado','cancelado'].includes(service.estado));assert.equal(locked,service.estado==='asignado');
});
test('real transactions: suspension racing claim is serialized and subsequent authority is rejected',async()=>{
 const f=await seed('suspend');const results=await Promise.allSettled([claim({serviceId:f.id},auth(f.technician)),db.doc(`users/${f.technician}`).update({suspendido:true})]);
 assert.equal(results[1].status,'fulfilled');
 const service=(await db.doc(`services/${f.id}`).get()).data();assert.equal(service.estado,results[0].status==='fulfilled'?'asignado':'pendiente');
 await assert.rejects(claim({serviceId:f.id},auth(f.technician)));
 const g=await seed('suspend-first');await db.doc(`users/${g.technician}`).update({suspendido:true});await assert.rejects(claim({serviceId:g.id},auth(g.technician)));
 assert.equal((await db.doc(`technician_active_services/${g.technician}`).get()).exists,false);
});
test('real transactions: terminal stale lock recovers, live or unknown locks stay blocked',async()=>{
 const f=await seed('stale');const old=`${f.id}-old`;await write(`services/${old}`,{estado:'finalizado',tecnico_id:f.technician});await write(`technician_active_services/${f.technician}`,{service_id:old});
 await claim({serviceId:f.id},auth(f.technician));assert.equal((await db.doc(`technician_active_services/${f.technician}`).get()).data().service_id,f.id);
 const g=await seed('unknown');await write(`technician_active_services/${g.technician}`,{service_id:'unknown-fixture'});await assert.rejects(claim({serviceId:g.id},auth(g.technician)));
});
test('real transactions: duplicated quote submission and conflicting responses have one winner each',async()=>{
 const f=await seed('quote');await db.doc(`services/${f.id}`).update({estado:'en_sitio',tecnico_id:f.technician,diagnostico_cotizacion_desbloqueada:true,diagnostico_inicial_evidencia:'fixture'});
 const payload={serviceId:f.id,diagnostic:'Diagnóstico local controlado',items:[{cantidad:1,precio:1000,descripcion:'Servicio'}]};
 const submissions=await Promise.allSettled([submit(payload,auth(f.technician)),submit(payload,auth(f.technician))]);assert.equal(submissions.filter(x=>x.status==='fulfilled').length,1);
 const responses=await Promise.allSettled([respond({serviceId:f.id,accepted:true},auth(f.customer)),respond({serviceId:f.id,accepted:false},auth(f.customer))]);assert.equal(responses.filter(x=>x.status==='fulfilled').length,1);
 assert.ok(['trabajando','cancelado'].includes((await db.doc(`services/${f.id}`).get()).data().estado));
});
test('real transactions: simultaneous withdrawal requests cannot reserve the same balance twice',async()=>{
 const f=await seed('withdrawal');await write(`transacciones/${f.id}`,{tecnico_id:f.technician,pago_tecnico:1000,tipo:'abono_stripe'});
 const results=await Promise.allSettled([withdraw({amount:500,requestId:"workflow-withdraw-A"},auth(f.technician)),withdraw({amount:500,requestId:"workflow-withdraw-B"},auth(f.technician))]);
 const pending=await db.collection('retiros').where('tecnico_id','==',f.technician).get();for(const doc of pending.docs)owned.add(doc.ref.path);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(pending.size,1);
});
