import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
    resolveGestiaRole,
    resolveGestiaRouteDecision
} from "../gestia-core/auth/role-authority.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

test("login delegates authenticated routing to the central Firebase router", () => {
    const login = fs.readFileSync(path.join(root, "app-login.js"), "utf8");

    assert.match(login, /resolveGestiaRole\([\s\S]*?user,[\s\S]*?profile/);
    assert.match(login, /FirebaseCore\.verificarYRedireccionar/);
    assert.doesNotMatch(login, /window\.location\.href\s*=\s*[\r\n\s]*"cliente\.html"/);
    assert.doesNotMatch(login, /window\.location\.href\s*=\s*[\r\n\s]*"tecnico\.html"/);
});

test("public index keeps legal notices addressable without dead pages", () => {
    const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

    assert.match(index, /href="#privacidad"/);
    assert.match(index, /href="#eliminar-datos"/);
    assert.match(index, /id="modalPrivacidad"/);
    assert.match(index, /id="modalEliminacion"/);
    assert.match(index, /openLegalModalFromHash/);
    assert.doesNotMatch(index, /href="privacidad\.html"/);
    assert.doesNotMatch(index, /href="eliminar-datos\.html"/);
});

test("central router preserves privileged admin surfaces and role aliases", () => {
    const firebase = fs.readFileSync(path.join(root, "firebase.js"), "utf8");

    for (const surface of [
        "admin",
        "ceo",
        "gestia-terminal",
        "gestia-modulo",
        "noc"
    ]) {
        const result = resolveGestiaRouteDecision({
            user: { rol: "admin" },
            pathname: `/${surface}.html`
        });
        assert.equal(result.redirect, false, `${surface} must remain an admin surface`);
    }

    assert.equal(resolveGestiaRole({}, { role: " TECNICO " }).role, "tecnico");
    assert.equal(resolveGestiaRole({}, { rol: "admin_b2b" }).role, "b2b_admin");
    assert.equal(resolveGestiaRole({}, { rol: "asistente_admin" }).role, "b2b_admin");
    assert.equal(
        resolveGestiaRouteDecision({
            user: { rol: "cliente", sub_type: "saas" },
            pathname: "/login.html"
        }).target,
        "app-inquilino.html"
    );
    assert.match(firebase, /resolveGestiaRouteDecision/);
});

test('B2B backend rejects privileged roles, derives tenant and rolls back failed provisioning', async () => {
    const {runInNewContext} = await import('node:vm');
    const source = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    const actor = {rol:'admin_b2b',tipo_cuenta:'B2B',status:'activo',edificioId:'tenant-a'};
    const profiles = new Map([['users/manager', actor]]);
    const accounts = new Set();
    let failCommit = false;
    const db = {
        doc: path => ({path, get:async()=>({exists:profiles.has(path),data:()=>profiles.get(path)})}),
        runTransaction:async callback => {
            const writes=[];
            const result=await callback({get:ref=>ref.get(),create:(ref,data)=>writes.push([ref.path,data])});
            if(failCommit) throw new Error('transaction failed');
            for(const [path,data] of writes) profiles.set(path,data);
            return result;
        }
    };
    const firestore=()=>db;
    firestore.FieldValue={serverTimestamp:()=>123};
    let password;
    const admin={firestore,auth:()=>({createUser:async data=>{password=data.password;accounts.add('new');return {uid:'new'};},deleteUser:async uid=>accounts.delete(uid)})};
    class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
    const factory=source.slice(source.indexOf('async function provisionB2bPersonnel'),source.indexOf('exports.completeB2bRegistration'));
    const handler=runInNewContext(factory+'\nprovisionB2bPersonnel', {admin,functions:{https:{HttpsError}},crypto:await import('node:crypto')});
    const ctx={auth:{uid:'manager'}};
    await assert.rejects(handler({rol:'admin',email:'x@example.test'},ctx),e=>e.code==='permission-denied');
    assert.equal(accounts.size,0);
    await handler({rol:'tecnico',email:'x@example.test',edificioId:'tenant-b',aprobado:true},ctx);
    const profile=profiles.get('users/new');
    assert.equal(profile.edificioId,'tenant-a');
    assert.equal(profile.aprobado,false);
    assert.equal(profile.disponible,false);
    assert.equal(profile.status,'documentos_pendientes');
    assert.ok(password.length>=32);
    profiles.delete('users/new'); accounts.clear(); failCommit=true;
    await assert.rejects(handler({rol:'tecnico',email:'x@example.test'},ctx),/transaction failed/);
    assert.equal(accounts.size,0);
    actor.edificioId=null;
    await assert.rejects(handler({rol:'tecnico',email:'x@example.test'},ctx),e=>e.code==='permission-denied');
});

test('B2B key claim is atomic, single-use, tenant-bound and retry-safe', async () => {
    const {runInNewContext}=await import('node:vm');
    const source=fs.readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
    const docs=new Map([['b2b_keys/invite',{key:'test-secret',edificioId:'a',edificioNombre:'A'}]]);
    const ref=path=>({path});
    const db={doc:ref,collection:()=>({where:(_,__,value)=>({limit:()=>({query:value})})}),runTransaction:async fn=>{
        const writes=[];
        const result=await fn({
            get:async target=>{
                if(target.query){const entries=[...docs].filter(([p,d])=>p.startsWith('b2b_keys/')&&d.key===target.query);return {size:entries.length,docs:entries.map(([p,d])=>({ref:ref(p),data:()=>({...d})}))};}
                return {exists:docs.has(target.path),data:()=>docs.get(target.path)};
            },
            set:(r,d)=>writes.push([r.path,d]),create:(r,d)=>writes.push([r.path,d]),
            update:(r,d)=>writes.push([r.path,{...docs.get(r.path),...d}])
        });
        for(const [p,d] of writes) docs.set(p,d);
        return result;
    }};
    const firestore=()=>db;firestore.FieldValue={serverTimestamp:()=>123};
    class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
    const code=source.slice(source.indexOf('async function completeB2bRegistration'),source.indexOf('async function provisionB2bPersonnel'));
    const handler=runInNewContext(code+'\ncompleteB2bRegistration',{admin:{firestore},functions:{https:{HttpsError}},crypto:await import('node:crypto')});
    const context=uid=>({auth:{uid,token:{email:uid+'@example.test'}}});
    await assert.rejects(handler({clave:'test-secret'},{}),e=>e.code==='unauthenticated');
    await assert.rejects(handler({clave:'invalid'},context('owner')),e=>e.code==='permission-denied');
    assert.equal(docs.has('users/owner'),false);
    await handler({clave:'test-secret',edificioId:'b',rol:'ceo'},context('owner'));
    assert.equal(docs.get('users/owner').edificioId,'a');
    assert.equal(docs.get('users/owner').rol,'admin_b2b');
    assert.equal(docs.get('b2b_keys/invite').usedBy,'owner');
    await handler({clave:'test-secret'},context('owner'));
    await assert.rejects(handler({clave:'test-secret'},context('other')),e=>e.code==='permission-denied');
    for(let i=0;i<9;i++) await assert.rejects(handler({clave:'invalid'},context('limited')));
    await assert.rejects(handler({clave:'invalid'},context('limited')));
    await assert.rejects(handler({clave:'test-secret'},context('limited')),e=>e.code==='resource-exhausted');
});

test('B2B existing operations reject foreign tenants and inactive or unauthorized actors', async () => {
    const {runInNewContext}=await import('node:vm');
    const source=fs.readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
    let profile={rol:'recepcion',tipo_cuenta:'B2B',status:'activo',edificioId:'a'};
    class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
    const code=source.slice(source.indexOf('async function requireB2bTenant'),source.indexOf('async function completeB2bRegistration'));
    const guard=runInNewContext(code+'\nrequireB2bTenant',{admin:{firestore:()=>({doc:()=>({get:async()=>({data:()=>profile})})})},functions:{https:{HttpsError}}});
    const context={auth:{uid:'staff'}};
    await guard(context,'a',['recepcion']);
    await assert.rejects(guard(context,'b',['recepcion']),e=>e.code==='permission-denied');
    await assert.rejects(guard(context,'a',['admin_b2b']),e=>e.code==='permission-denied');
    await assert.rejects(guard({},'a'),e=>e.code==='unauthenticated');
    profile={...profile,status:'documentos_pendientes'};
    await assert.rejects(guard(context,'a'),e=>e.code==='permission-denied');
    for(const name of ['reservarCancha','crearAcceso','registrarSalida','registrarIngresoPaquete','registrarSalidaPaquete','registrarIncidenciaAcceso']){
        const start=source.indexOf('exports.'+name+' =');
        const end=source.indexOf('\nexports.',start+1);
        assert.match(source.slice(start,end<0?undefined:end),/await requireB2bTenant\(context, condominioId/);
    }
});


test('canonical profile cannot replace the authenticated email or uid used by routing',()=>{
    const source=fs.readFileSync(new URL('../firebase.js',import.meta.url),'utf8');
    assert.match(source,/\.\.\.data,\s*uid: user\.uid,\s*email: user\.email/);
});

test('tenant runtime uses canonical users profile without a fixed building or legacy membership', async()=>{
    const {runInNewContext}=await import('node:vm');
    const {webcrypto}=await import('node:crypto');
    let source=fs.readFileSync(new URL('../gestia-core/core_auth_tenant_v1.js',import.meta.url),'utf8');
    source=source.replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'');
    const build=profile=>{
        const reads=[];const tenants=[];
        const user={uid:'operator-a',email:'operator@example.test',getIdTokenResult:async()=>({claims:{sub:'operator-a'}})};
        const runtime=runInNewContext(source+'\nresolveTenantContext',{
            auth:{currentUser:user},db:{},doc:(_, ...parts)=>parts.join('/'),
            getDoc:async path=>{reads.push(path);return {exists:()=>!!profile,data:()=>profile};},
            resolveGestiaRole,isGestiaMasterIdentity:()=>false,
            resolveTenantV2:async (id,options)=>{assert.equal(options.allowCreate,false);tenants.push(id);return {id};},
            crypto:webcrypto,TextEncoder,setTimeout,clearTimeout,
            CustomEvent:class{},window:{dispatchEvent(){}},console:{log(){},error(){},warn(){}}
        });
        return {runtime,reads,tenants};
    };
    const valid=build({rol:'admin_b2b',tipo_cuenta:'B2B',status:'activo',edificioId:'building-b'});
    const session=await valid.runtime({forceRefresh:true});
    assert.equal(session.tenantId,'building-b');
    assert.equal(session.role,'b2b_admin');
    assert.equal(session.limits.godMode,false);
    assert.deepEqual(valid.reads,['users/operator-a']);
    assert.deepEqual(valid.tenants,['building-b']);
    for(const profile of [null,{rol:'admin_b2b',tipo_cuenta:'B2B',status:'activo'}, {rol:'tecnico',tipo_cuenta:'B2B',status:'documentos_pendientes',edificioId:'b'}]){
        const invalid=build(profile);
        await assert.rejects(invalid.runtime({forceRefresh:true}),e=>e.code==='TENANT_AUTHORITY_REQUIRED');
        assert.equal(invalid.tenants.length,0);
    }
});

test('B2B closure verifies persisted order evidence and is backend-authoritative and idempotent',async()=>{
    const {runInNewContext}=await import('node:vm');
    const source=fs.readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
    const link=path=>'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/'+encodeURIComponent(path)+'?alt=media';
    const order={edificioId:'a',tecnicoId:'tech',status:'en_proceso',foto_antes:link('evidencias/order/antes_1.jpg'),foto_despues:link('evidencias/order/despues_2.jpg')};
    const actor={rol:'tecnico',tipo_cuenta:'B2B',status:'activo',edificioId:'a'};
    let metadataReads=0;const updates=[];
    const firestore=()=>({doc:path=>({path}),runTransaction:async callback=>callback({get:async ref=>({data:()=>ref.path.startsWith('users/')?actor:order}),update:(_,data)=>{updates.push(data);Object.assign(order,data);}})});
    firestore.FieldValue={serverTimestamp:()=>123};
    class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
    const code=source.slice(source.indexOf('async function completeB2bService'),source.indexOf('exports.completeB2bService'));
    const handler=runInNewContext(code+'\ncompleteB2bService',{URL,admin:{firestore,storage:()=>({bucket:()=>({name:'test-bucket',file:()=>({getMetadata:async()=>{metadataReads++;return [{size:'100',contentType:'image/png',generation:'1',md5Hash:'digest'}];}})})})},functions:{https:{HttpsError}}});
    const ctx={auth:{uid:'tech'}};const payload={orderId:'order',firmaUrl:link('firmas/order/conformidad.png')};
    await assert.rejects(handler({...payload,firmaUrl:link('firmas/foreign/conformidad.png')},ctx),e=>e.code==='permission-denied');
    assert.equal(updates.length,0);
    actor.edificioId='b';
    await assert.rejects(handler(payload,ctx),e=>e.code==='permission-denied');
    actor.edificioId='a';
    await handler(payload,ctx);
    assert.equal(order.status,'finalizado');
    assert.equal(order.cierre_authority,'completeB2bService');
    assert.equal(order.evidencia_verificada.length,3);
    const count=metadataReads;
    await handler(payload,ctx);
    assert.equal(updates.length,1);
    assert.equal(metadataReads,count);
});

test('offline B2B queue preserves failures and foreign-session records and routes closure through backend',async()=>{
    const {runInNewContext}=await import('node:vm');
    const source=fs.readFileSync(new URL('../app-tecnico-b2b.js',import.meta.url),'utf8');
    const code=source.slice(source.indexOf('async function procesarSyncPendiente(){'),source.indexOf('/**',source.indexOf('async function procesarSyncPendiente(){')));
    const confirmed=[];const closed=[];
    const rows=[
      {key:1,value:{actorUid:'tech',type:'update',collection:'servicios_b2b',id:'failed',data:{foto_antes:null}}},
      {key:2,value:{actorUid:'tech',type:'update',collection:'servicios_b2b',id:'done',data:{status:'finalizado',firma_pendiente:'image'}}},
      {key:3,value:{actorUid:'other',type:'update',collection:'servicios_b2b',id:'foreign',data:{status:'finalizado'}}}
    ];
    const run=runInNewContext(code+'\nprocesarSyncPendiente',{isOnline:true,auth:{currentUser:{uid:'tech'}},db:{},doc:(_,collection,id)=>id,cachePendientes:async()=>rows,confirmarPendiente:async(_,key)=>confirmed.push(key),updateDoc:async()=>{throw Error('offline');},cerrarOrdenB2b:async id=>closed.push(id),serverTimestamp:()=>123,console:{error(){}}});
    await run();
    assert.deepEqual(confirmed,[2]);
    assert.deepEqual(closed,['done']);
    assert.doesNotMatch(code,/cacheLimpiar/);
    assert.match(source,/Cierre guardado, pendiente de sincronización/);
});

test('backend evidence verification uses the same default bucket as the client',()=>{
    const client=fs.readFileSync(new URL('../firebase.js',import.meta.url),'utf8');
    const server=fs.readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
    const bucket=client.match(/storageBucket:\s*"([^"]+)"/)[1];
    const initialization=server.slice(server.indexOf('admin.initializeApp('),server.indexOf('// B2B onboarding'));
    assert.equal(initialization.match(/storageBucket:\s*"([^"]+)"/)[1],bucket);
});

test('offline photos retain failed Firestore updates and reuse uploaded immutable files on retry',async()=>{
    const {runInNewContext}=await import('node:vm');
    const source=fs.readFileSync(new URL('../app-tecnico-b2b.js',import.meta.url),'utf8');
    const start=source.indexOf('async function procesarFotosPendientes(){');
    const code=source.slice(start,source.indexOf('/* =====================================================',start));
    const queue=new Map([[1,{actorUid:'tech',ordenId:'first',tipo:'antes',timestamp:1,base64:'image'}],[2,{actorUid:'tech',ordenId:'second',tipo:'despues',timestamp:2,base64:'image'}]]);
    const files=new Set(['evidencias/second/despues_2.jpg']);let fail=true;let uploads=0;
    const run=runInNewContext(code+'\nprocesarFotosPendientes',{
        isOnline:true,auth:{currentUser:{uid:'tech'}},db:{},storage:{},
        cachePendientes:async()=>[...queue].map(([key,value])=>({key,value})),
        confirmarPendiente:async(_,key)=>queue.delete(key),ref:(_,path)=>path,doc:(_,__,id)=>id,
        getDownloadURL:async path=>{if(!files.has(path))throw {code:'storage/object-not-found'};return 'https://storage.test/'+path;},
        uploadBytes:async path=>{uploads++;files.add(path);},fetch:async()=>({blob:async()=>new Uint8Array([1])}),
        updateDoc:async id=>{if(id==='first'&&fail)throw Error('network failure');},console:{error(){}}
    });
    await run();
    assert.deepEqual([...queue.keys()],[1]);
    fail=false;await run();
    assert.equal(queue.size,0);
    assert.equal(uploads,1);
});
