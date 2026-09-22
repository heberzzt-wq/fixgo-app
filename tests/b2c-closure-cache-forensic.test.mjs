import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
function harness() {
    const values=new Map();
    const doc=path=>({get:async()=>({exists:values.has(path),data:()=>values.get(path)}),set:async value=>values.set(path,value),path});
    const db={collection:name=>({doc:id=>doc(`${name}/${id}`)}),runTransaction:async fn=>fn({get:r=>r.get(),update:(r,v)=>values.set(r.path,{...values.get(r.path),...v}),set:(r,v)=>values.set(r.path,v)})};
    const context=vm.createContext({exports:{},db,initCore(){},reportSentinelMetric:async()=>{},console:{log(){},error(){}},crypto,
        admin:{firestore:{FieldValue:{serverTimestamp:()=>1}}},functions:{https:{onCall:fn=>fn,HttpsError:class extends Error {constructor(code,message){super(message);this.code=code;}}}}});
    const source=fs.readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
    vm.runInContext(source.slice(source.indexOf('function generateOperationId('),source.indexOf('/**',source.indexOf('exports.validarCierreIA =')+1)),context);
    return {values,handler:context.exports.validarCierreIA,key:context.generateOperationId};
}
test('closure cache never grants a different technician a prior validation token',async()=>{
    const h=harness(),notes='Trabajo terminado y reparado con evidencia de prueba';
    h.values.set('services/service_1',{estado:'trabajando',tecnico_id:'owner'});
    h.values.set(`gestia_ia_operations/${h.key(notes,'GLOBAL')}`,{userId:'owner',serviceId:'service_1',result:{aprobado:true,token_validacion:'PRIVATE_OWNER_TOKEN'}});
    const r=await h.handler({serviceId:'service_1',notas_cierre:notes},{auth:{uid:'intruder'}});
    assert.equal(r.aprobado,false);assert.equal(r.token_validacion,undefined);
});
test('terminal service is still authorized before returning its state',async()=>{
    const h=harness();h.values.set('services/service_1',{estado:'finalizado',tecnico_id:'owner'});
    const r=await h.handler({serviceId:'service_1',notas_cierre:'Trabajo terminado correctamente'},{auth:{uid:'intruder'}});
    assert.equal(r.aprobado,false);
});
test('same notes on different services get service-specific validation, retry reuses only own token',async()=>{
    const h=harness(),notes='Trabajo terminado y reparado correctamente';
    for(const id of ['service_1','service_2'])h.values.set(`services/${id}`,{estado:'trabajando',tecnico_id:'owner'});
    const call=id=>h.handler({serviceId:id,notas_cierre:notes},{auth:{uid:'owner'}});
    const a=await call('service_1'),b=await call('service_2'),retry=await call('service_1');
    assert.notEqual(a.token_validacion,b.token_validacion);assert.equal(retry.token_validacion,a.token_validacion);
});
