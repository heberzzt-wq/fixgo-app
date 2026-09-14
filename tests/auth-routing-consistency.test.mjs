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
