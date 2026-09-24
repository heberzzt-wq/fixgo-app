'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClaimB2cServiceHandler, createCancelB2cServiceHandler, createRequestB2cWithdrawalHandler } = require('./b2c-service-marketplace');
const { createSubmitB2cQuoteHandler, createRespondB2cQuoteHandler } = require('./b2c-service-workflow');
const { createB2cServiceHandler } = require('./b2c-platform-authority');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const admin = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
const functions = { https: { HttpsError } };
const tech = { rol: 'tecnico', tipo_cuenta: 'B2C', estado: 'activo', status: 'activo', disponible: true,
 kyc: { aprobado: true }, skills: ['fix_plomeria'], foto_perfil: 'https://fixture.test/foto',
 documentos: { ine: 'https://fixture.test/ine', csf: 'https://fixture.test/csf' },
 datos_bancarios: { banco: 'Fixture', clabe: '012345678901234567' }, vehiculo: { tipo: 'peaton' } };
const customer = { rol: 'cliente', tipo_cuenta: 'B2C', estado: 'activo', status: 'activo', pagos: { efectivo_autorizado: true } };
const destination = { coords: { lat: 21, lng: -86 }, direccion: 'Fixture', fuente: 'mapa_pin', confirmado_por_cliente: true };
const service = { estado: 'pendiente', cliente_id: 'customer', categoria_id: 'fix_plomeria', metodo_pago: 'efectivo', destino: destination };
// Serial transaction fixture verifies atomic commit/interleaving, not Firestore emulator concurrency.
function fixture(extra = {}) {
 const data = new Map(Object.entries({ 'users/tech': tech, 'users/other': tech, 'users/customer': customer,
  'configuracion/pagos': { efectivo_activo: true }, 'configuracion/catalogo_global': { fix_plomeria: true },
  'services/service_1': service, 'service_marketplace/service_1': { service_id: 'service_1', estado: 'disponible' }, ...extra }).map(([k,v])=>[k, structuredClone(v)]));
 let queue = Promise.resolve(); let id = 0;
 const snap = (path, value = data.get(path)) => ({ id: path.split('/').at(-1), exists: value !== undefined, data: () => structuredClone(value) });
 const ref = path => ({
  path,
  id: path.split('/').at(-1),
  get: async () => snap(path),
  collection(name) {
   const nested = `${path}/${name}`;
   return {
    where(field, op, value) {
     return { name: nested, field, value, count: 500, limit(count) { this.count = count; return this; } };
    }
   };
  }
 });
 const db = { data, beforeTransaction: null, collection: name => ({ doc: (idValue = `auto_${++id}`) => ref(`${name}/${idValue}`), where: (field, op, value) => ({ name, field, value }) }),
  runTransaction(callback) { const execute = async () => { if (db.beforeTransaction) { db.beforeTransaction(); db.beforeTransaction = null; }
   const writes = []; const tx = { get: async target => {
    if (target.path) return snap(target.path);
    const prefix = target.name + '/';
    return { docs: [...data]
     .filter(([p,v])=>p.startsWith(prefix) && !p.slice(prefix.length).includes('/') && v[target.field] === target.value)
     .slice(0, target.count || 500)
     .map(([p,v])=>snap(p,v)) };
   },
    set: (r,v) => writes.push(()=>data.set(r.path,v)), create: (r,v)=>writes.push(()=>data.set(r.path,v)),
    update: (r,v)=>writes.push(()=>data.set(r.path,{...data.get(r.path),...v})), delete:r=>writes.push(()=>data.delete(r.path)) };
   const result = await callback(tx); writes.forEach(write=>write()); return result; };
   const result = queue.then(execute); queue = result.catch(()=>{}); return result; }
 }; return db;
}
const deps = db => ({ db, admin, functions });
const auth = uid => ({ auth: { uid, token: {} } });
const quote = { serviceId:'service_1', diagnostic:'Diagnóstico controlado de prueba', items:[{cantidad:1,precio:1000,descripcion:'Servicio'}] };
test('claim rejects a stale listing after catalog or individual payment revocation', async()=>{
 for (const [key,value] of [['configuracion/catalogo_global',{fix_plomeria:false}],['users/customer',{...customer,pagos:{efectivo_autorizado:false}}]]) {
  const db=fixture({[key]:value}); await assert.rejects(createClaimB2cServiceHandler(deps(db))({serviceId:'service_1'},auth('tech')));
  assert.equal(db.data.get('services/service_1').estado,'pendiente'); assert.equal(db.data.has('technician_active_services/tech'),false);
 }
});
test('create validates authority in the transaction after permission changes', async()=>{
 const db=fixture(); db.beforeTransaction=()=>db.data.set('configuracion/pagos',{efectivo_activo:false});
 await assert.rejects(createB2cServiceHandler(deps(db))({serviceId:'new_service_1',metodo_pago:'efectivo',categoria_id:'fix_plomeria',destino:destination},auth('customer')));
 assert.equal(db.data.has('services/new_service_1'),false);
});
test('claim recovers only a verified terminal stale lock', async()=>{
 const db=fixture({'technician_active_services/tech':{service_id:'old'},'services/old':{estado:'finalizado',tecnico_id:'tech'}});
 const result=await createClaimB2cServiceHandler(deps(db))({serviceId:'service_1'},auth('tech'));
 assert.equal(result.estado,'asignado'); assert.equal(db.data.get('technician_active_services/tech').service_id,'service_1');
});
test('suspended technician cannot submit a quote on a previous assignment', async()=>{
 const db=fixture({'users/tech':{...tech,suspendido:true},'services/service_1':{...service,estado:'en_sitio',tecnico_id:'tech',diagnostico_cotizacion_desbloqueada:true,diagnostico_inicial_evidencia:'fixture'}});
 await assert.rejects(createSubmitB2cQuoteHandler(deps(db))(quote,auth('tech'))); assert.equal(db.data.get('services/service_1').estado,'en_sitio');
});
test('quote response rejects nonboolean decision and malformed legacy amount', async()=>{
 for(const payload of [{serviceId:'service_1'}, {serviceId:'service_1',accepted:true}]) {
  const db=fixture({'services/service_1':{...service,estado:'cotizando',tecnico_id:'tech',costo_final:'invalid'}});
  await assert.rejects(createRespondB2cQuoteHandler(deps(db))(payload,auth('customer'))); assert.equal(db.data.get('services/service_1').estado,'cotizando');
 }
});
test('withdrawal cannot round a positive fraction to a zero value request', async()=>{
 const db=fixture(); await assert.rejects(createRequestB2cWithdrawalHandler(deps(db))({amount:0.001},auth('tech')));
 assert.equal([...db.data.keys()].filter(p=>p.startsWith('retiros/')).length,0);
});
test('claim versus cancel has one commit winner and no orphan technician lock', async()=>{
 for(const claimFirst of [true,false]) { const db=fixture(); const claim=createClaimB2cServiceHandler(deps(db));const cancel=createCancelB2cServiceHandler(deps(db));
  const actions=[()=>claim({serviceId:'service_1'},auth('tech')),()=>cancel({serviceId:'service_1',reason:'Cancelación fixture'},auth('customer'))]; if(!claimFirst)actions.reverse();
  const results=await Promise.allSettled(actions.map(fn=>fn())); assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(db.data.has('technician_active_services/tech'),claimFirst); assert.equal(db.data.get('services/service_1').estado,claimFirst?'asignado':'cancelado');
 }
});
test('two claims and repeated quote responses never create a second winner', async()=>{
 const db=fixture();const claim=createClaimB2cServiceHandler(deps(db));const claims=await Promise.allSettled(['tech','other'].map(uid=>claim({serviceId:'service_1'},auth(uid))));assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);
 db.data.set('services/service_1',{...service,estado:'cotizando',costo_final:1000,tecnico_id:'tech'});
 const respond=createRespondB2cQuoteHandler(deps(db));const responses=await Promise.allSettled([respond({serviceId:'service_1',accepted:true},auth('customer')),respond({serviceId:'service_1',accepted:false},auth('customer'))]);assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);assert.equal(db.data.get('services/service_1').estado,'trabajando');
});
test('release refuses a quoted or started job and clears prior diagnostic authority before republishing', async()=>{
 for(const state of ['cotizando','procesando_saldo','trabajando']) {
  const db=fixture({'services/service_1':{...service,estado:state,tecnico_id:'tech',diagnostico_cotizacion_desbloqueada:true,diagnostico_inicial_evidencia:{technician_id:'tech'}}});
  await assert.rejects(createCancelB2cServiceHandler(deps(db))({serviceId:'service_1',reason:'Abandono prueba'},auth('tech')));
  assert.equal(db.data.get('services/service_1').estado,state);assert.equal(db.data.has('transacciones/cancel_service_1_tech'),false);
 }
 const db=fixture({'services/service_1':{...service,estado:'en_sitio',tecnico_id:'tech',diagnostico_cotizacion_desbloqueada:true,diagnostico_inicial_evidencia:{technician_id:'tech'}}});
 await createCancelB2cServiceHandler(deps(db))({serviceId:'service_1',reason:'Abandono prueba'},auth('tech'));
 assert.equal(db.data.get('services/service_1').diagnostico_cotizacion_desbloqueada,false);
 assert.equal(db.data.get('services/service_1').diagnostico_inicial_evidencia,null);
});
test('Stripe quote acceptance never counts an estimated initial retention as paid money',async()=>{
 const db=fixture({'services/service_1':{...service,estado:'cotizando',tecnico_id:'tech',costo_final:500,retencion_inicial:550,metodo_pago:'stripe'}});
 const result=await createRespondB2cQuoteHandler(deps(db))({serviceId:'service_1',accepted:true},auth('customer'));
 assert.equal(result.estado,'procesando_saldo');assert.equal(result.balanceDue,500);
});
test('cross identity, category, disabled availability and KYC are denied without a lock',async()=>{
 for(const mutation of [{skills:['tech_cctv']},{disponible:false},{kyc:{aprobado:false}}]){
  const db=fixture({'users/tech':{...tech,...mutation}});
  await assert.rejects(createClaimB2cServiceHandler(deps(db))({serviceId:'service_1',technicianId:'other'},auth('tech')));
  assert.equal(db.data.has('technician_active_services/tech'),false);
 }
 const db=fixture({'services/service_1':{...service,estado:'cotizando',tecnico_id:'tech',costo_final:1000}});
 await assert.rejects(createRespondB2cQuoteHandler(deps(db))({serviceId:'service_1',accepted:true,cliente_id:'customer'},auth('other')));
 await assert.rejects(createCancelB2cServiceHandler(deps(db))({serviceId:'service_1',reason:'IDOR attempt'},auth('other')));
 assert.equal(db.data.get('services/service_1').estado,'cotizando');
});
test('a live or missing lock target cannot be bypassed as stale',async()=>{
 for(const old of [{estado:'trabajando',tecnico_id:'tech'},{estado:'finalizado',tecnico_id:'other'},null]){
  const db=fixture({'technician_active_services/tech':{service_id:'old'}});if(old)db.data.set('services/old',old);
  await assert.rejects(createClaimB2cServiceHandler(deps(db))({serviceId:'service_1'},auth('tech')));
  assert.equal(db.data.get('technician_active_services/tech').service_id,'old');
 }
});
test('explicitly suspended customer cannot create or have a stale listing claimed',async()=>{
 const db=fixture({'users/customer':{...customer,suspendido:true}});
 await assert.rejects(createB2cServiceHandler(deps(db))({serviceId:'new_service_suspended',metodo_pago:'efectivo',categoria_id:'fix_plomeria',destino:destination},auth('customer')));
 await assert.rejects(createClaimB2cServiceHandler(deps(db))({serviceId:'service_1'},auth('tech')));
 assert.equal(db.data.has('services/new_service_suspended'),false);assert.equal(db.data.has('technician_active_services/tech'),false);
});
