import fs from "node:fs";
import test, { after, before } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getMetadata } from "firebase/storage";

let environment;
const firebaseConfig = JSON.parse(fs.readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));

const documentRef = name => ({ storage_path: `expedientes/tech-1/${name}/current.png` });
const operationalTechnician = {
    rol: "tecnico",
    tipo_cuenta: "B2C",
    estado: "activo",
    status: "activo",
    disponible: true,
    suspendido: false,
    kyc: { aprobado: true, estado: "activo" },
    foto_perfil: documentRef("foto"),
    documentos: { ine: documentRef("ine"), csf: documentRef("csf"), licencia: null, certificados: [] },
    datos_bancarios: { banco: "Banco", clabe: "012345678901234567" },
    vehiculo: { tipo: "peaton", placas: null },
    skills: ["fix_plomeria"]
};

before(async () => {
    environment = await initializeTestEnvironment({
        projectId: "fixgo-b2c-rules-test",
        firestore: { rules: fs.readFileSync(new URL(`../${firebaseConfig.firestore.rules}`, import.meta.url), "utf8") },
        storage: { rules: fs.readFileSync(new URL(`../${firebaseConfig.storage.rules}`, import.meta.url), "utf8") }
    });
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        await setDoc(doc(db, "users/client-1"), {
            rol: "cliente", tipo_cuenta: "B2C", estado: "activo", status: "activo",
            pagos: { stripe_autorizado: false, efectivo_autorizado: true }
        });
        await setDoc(doc(db, "users/b2b-1"), { rol: "cliente", tipo_cuenta: "B2B", estado: "activo", status: "activo", edificioId: "uxmal39" });
        await setDoc(doc(db, "users/b2b-tech"), {
            rol: "tecnico", tipo_cuenta: "B2B", estado: "activo", status: "activo", edificioId: "uxmal39", tecnico_placas: "XYZ-123"
        });
        await setDoc(doc(db, "users/b2b-admin"), {
            rol: "admin_b2b", tipo_cuenta: "B2B", estado: "activo", status: "activo", edificioId: "uxmal39"
        });
        await setDoc(doc(db, "users/b2b-other"), {
            rol: "tecnico", tipo_cuenta: "B2B", estado: "activo", status: "activo", edificioId: "otro"
        });
        await setDoc(doc(db, "users/tech-1"), operationalTechnician);
        await setDoc(doc(db, "users/tech-off"), { ...operationalTechnician, disponible: false });
        await setDoc(doc(db, "configuracion/catalogo_global"), { maint_general: true });
        await setDoc(doc(db, "service_marketplace/svc-1"), { service_id: "svc-1", estado: "disponible" });
        await setDoc(doc(db, "platform_events/marketplace_service_available_svc-1"), {
            event_type: "marketplace_service_available", service_id: "svc-1"
        });
        await setDoc(doc(db, "services/svc-close"), {
            tipo: "b2c",
            cliente_id: "client-1",
            tecnico_id: "tech-1",
            estado: "trabajando",
            metodo_pago: "efectivo",
            categoria: "FIX",
            categoria_id: "fix_plomeria",
            sub_servicio: "PLOMERIA",
            destino: { direccion: "Destino", confirmado_por_cliente: true }
        });
        const b2bService = {
            tipo: "mantenimiento",
            cliente_id: "b2b-1",
            tecnico_id: null,
            estado: "pendiente",
            metodo_pago: "b2b",
            categoria: "MAINT",
            categoria_id: "maint_general",
            sub_servicio: "GENERAL",
            edificioId: "uxmal39",
            contrato_id: "contract-1",
            destino: { direccion: "Edificio Uxmal 39", confirmado_por_cliente: true }
        };
        await setDoc(doc(db, "services/b2b-maint-safe"), b2bService);
        await setDoc(doc(db, "services/b2b-maint-client-tamper"), b2bService);
        await setDoc(doc(db, "services/b2b-maint-payment-tamper"), b2bService);
        await setDoc(doc(db, "servicios_b2b/order-1"), {
            edificioId: "uxmal39", tecnicoId: "b2b-tech", status: "en_proceso"
        });
    });
});
after(async () => environment?.cleanup());

test("cliente B2C no puede mutar autorizaciones de pago", async () => {
    const db = environment.authenticatedContext("client-1").firestore();
    await assertSucceeds(getDoc(doc(db, "users/client-1")));
    await assertFails(updateDoc(doc(db, "users/client-1"), { "pagos.efectivo_autorizado": false }));
    await assertFails(updateDoc(doc(db, "users/client-1"), { efectivo_autorizado: true }));
});

test("creación B2C directa falla y el contrato B2B separado permanece", async () => {
    const customerDb = environment.authenticatedContext("client-1").firestore();
    await assertFails(setDoc(doc(customerDb, "services/direct-b2c"), {
        cliente_id: "client-1", metodo_pago: "efectivo", estado: "pendiente"
    }));
    const b2bDb = environment.authenticatedContext("b2b-1").firestore();
    await assertSucceeds(setDoc(doc(b2bDb, "services/direct-b2b"), {
        cliente_id: "b2b-1", metodo_pago: "b2b", estado: "pendiente", edificioId: "uxmal39",
        tipo: "mantenimiento", categoria: "MAINT", categoria_id: "maint_general", sub_servicio: "GENERAL"
    }));
    await assertFails(setDoc(doc(b2bDb, "services/direct-b2b-road"), {
        cliente_id: "b2b-1", metodo_pago: "b2b", estado: "pendiente", edificioId: "uxmal39",
        tipo: "mantenimiento", categoria: "ROAD", categoria_id: "road_llanta", sub_servicio: "LLANTA"
    }));
});

test("mantenimiento B2B conserva cliente, pago, contrato y técnico asignado", async () => {
    const techDb = environment.authenticatedContext("b2b-tech").firestore();
    const otherDb = environment.authenticatedContext("b2b-other").firestore();

    await assertFails(updateDoc(doc(techDb, "services/b2b-maint-client-tamper"), {
        estado: "trabajando",
        tecnico_id: "b2b-tech",
        cliente_id: "admin_residencial"
    }));
    await assertFails(updateDoc(doc(techDb, "services/b2b-maint-payment-tamper"), {
        estado: "trabajando",
        tecnico_id: "b2b-tech",
        metodo_pago: "efectivo"
    }));
    await assertSucceeds(updateDoc(doc(techDb, "services/b2b-maint-safe"), {
        estado: "trabajando",
        tecnico_id: "b2b-tech",
        tecnico_nombre: "Técnico B2B",
        fecha_inicio: new Date(),
        actualizado_at: new Date()
    }));
    await assertFails(updateDoc(doc(otherDb, "services/b2b-maint-safe"), {
        tecnico_id: "b2b-other",
        estado: "trabajando"
    }));
});

test("marketplace y evento sólo son visibles para técnico canónico disponible", async () => {
    const activeDb = environment.authenticatedContext("tech-1").firestore();
    const inactiveDb = environment.authenticatedContext("tech-off").firestore();
    await assertSucceeds(getDoc(doc(activeDb, "service_marketplace/svc-1")));
    await assertSucceeds(getDoc(doc(activeDb, "platform_events/marketplace_service_available_svc-1")));
    await assertFails(getDoc(doc(inactiveDb, "service_marketplace/svc-1")));
    await assertFails(getDoc(doc(inactiveDb, "platform_events/marketplace_service_available_svc-1")));
});

test("binding de cierre sólo lo puede sellar el técnico asignado con evidencia íntegra", async () => {
    const techDb = environment.authenticatedContext("tech-1").firestore();
    const customerDb = environment.authenticatedContext("client-1").firestore();
    const sha = "a".repeat(64);
    const binding = {
        service_id: "svc-close",
        technician_id: "tech-1",
        before: {
            sha256: sha,
            storage_path: "b2c_evidence/svc-close/tech-1/work_before/antes_1_123.jpg",
            download_url: "https://storage.test/antes.jpg"
        },
        after: {
            sha256: sha,
            storage_path: "b2c_evidence/svc-close/tech-1/work_after/despues_1_123.jpg",
            download_url: "https://storage.test/despues.jpg"
        },
        signature: {
            present: true,
            sha256: sha,
            storage_path: "servicios/svc-close/customer_signature_123.png",
            download_url: "https://storage.test/firma.png",
            base64_persisted: false
        },
        created_at: new Date(),
        authority: "technician_service_close"
    };
    await assertFails(setDoc(doc(customerDb, "services/svc-close/work_evidence_bindings/current"), binding));
    await assertSucceeds(setDoc(doc(techDb, "services/svc-close/work_evidence_bindings/current"), binding));
    await assertFails(updateDoc(doc(techDb, "services/svc-close/work_evidence_bindings/current"), {
        authority: "mutated"
    }));
});

test("Storage permite expediente propio válido y niega expediente ajeno", async () => {
    const ownStorage = environment.authenticatedContext("tech-1").storage();
    const otherStorage = environment.authenticatedContext("client-1").storage();
    const payload = new Uint8Array([137, 80, 78, 71]);
    await assertSucceeds(uploadBytes(ref(ownStorage, "expedientes/tech-1/ine/current.png"), payload, { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(otherStorage, "expedientes/tech-1/ine/foreign.png"), payload, { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(ownStorage, "unexpected/path.bin"), payload, { contentType: "application/octet-stream" }));
});

test("Storage conserva firma B2C sellada, firma B2B, avatar y pase sin abrir rutas", async () => {
    const b2cTechStorage = environment.authenticatedContext("tech-1").storage();
    const b2cCustomerStorage = environment.authenticatedContext("client-1").storage();
    const techStorage = environment.authenticatedContext("b2b-tech").storage();
    const adminStorage = environment.authenticatedContext("b2b-admin").storage();
    const otherStorage = environment.authenticatedContext("b2b-other").storage();
    const image = new Uint8Array([137, 80, 78, 71]);
    const html = new TextEncoder().encode("<!doctype html><title>Pase</title>");
    const signatureMetadata = {
        contentType: "image/png",
        customMetadata: {
            serviceId: "svc-close",
            actorUid: "tech-1",
            actorRole: "tecnico",
            eventType: "customer_signature",
            base64Persisted: "false"
        }
    };

    await assertSucceeds(uploadBytes(
        ref(b2cTechStorage, "servicios/svc-close/customer_signature_123.png"),
        image,
        signatureMetadata
    ));
    await assertFails(uploadBytes(
        ref(b2cCustomerStorage, "servicios/svc-close/customer_signature_456.png"),
        image,
        { ...signatureMetadata, customMetadata: { ...signatureMetadata.customMetadata, actorUid: "client-1" } }
    ));
    await assertSucceeds(uploadBytes(ref(techStorage, "firmas/order-1/conformidad.png"), image, { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(otherStorage, "firmas/order-1/conformidad.png"), image, { contentType: "image/png" }));
    await assertSucceeds(uploadBytes(ref(techStorage, "perfiles_tecnicos/b2b-tech.jpg"), image, { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(otherStorage, "perfiles_tecnicos/b2b-tech.jpg"), image, { contentType: "image/jpeg" }));
    await assertSucceeds(uploadBytes(ref(adminStorage, "pases_digitales/uxmal39/visita.html"), html, { contentType: "text/html" }));
    await assertFails(uploadBytes(ref(techStorage, "pases_digitales/uxmal39/visita-tech.html"), html, { contentType: "text/html" }));
});

test("movimientos financieros B2C se reservan al backend", async () => {
    const db = environment.authenticatedContext("tech-1").firestore();
    await assertFails(setDoc(doc(db, "retiros/direct-client-write"), {
        tecnico_id: "tech-1", monto: 999999, estado: "pendiente"
    }));
    await assertFails(setDoc(doc(db, "transacciones/direct-client-write"), {
        tecnico_id: "tech-1", pago_tecnico: 999999, tipo: "abono"
    }));
});

test("B2B niega claves, escalación y autoaprobación sin bloquear edición operativa", async () => {
    for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('b2b-tech'), environment.authenticatedContext('b2b-admin'), environment.authenticatedContext('nNhwy3Mx4pTvc8TZVh1tyTMFwhC2')]) {
        const keyDb = context.firestore();
        await assertFails(getDocs(collection(keyDb, 'b2b_keys')));
        await assertFails(getDoc(doc(keyDb, 'b2b_keys/known-key')));
    }
    const manager = environment.authenticatedContext('b2b-admin').firestore();
    for (const change of [{rol:'admin'}, {role:'ceo'}, {edificioId:'otro'}, {tenantId:'otro'}, {aprobado:true}, {verificado:true}, {expediente_completo:true}, {authority:'admin'}]) {
        await assertFails(updateDoc(doc(manager, 'users/b2b-tech'), change));
        await assertFails(updateDoc(doc(environment.authenticatedContext('b2b-tech').firestore(), 'users/b2b-tech'), change));
    }
    await assertSucceeds(updateDoc(doc(manager, 'users/b2b-tech'), {telefono:'5550100'}));
    await assertFails(updateDoc(doc(manager, 'users/b2b-other'), {telefono:'5550100'}));
    await assertFails(setDoc(doc(manager, 'users/new-admin'), {uid:'new-admin',rol:'admin',edificioId:'uxmal39'}));
    for (const change of [{aprobado:true}, {verificado:true}, {role:'ceo'}, {edificioId:'uxmal39'}, {authority:'admin'}]) {
        const uid = 'new-client-' + Object.keys(change)[0];
        await assertFails(setDoc(doc(environment.authenticatedContext(uid, {email: uid+'@example.test'}).firestore(), 'users', uid), {
            uid, email:uid+'@example.test', rol:'cliente', tipo_cuenta:'B2C', estado:'activo', status:'activo',
            pagos:{stripe_autorizado:false,efectivo_autorizado:false}, ...change
        }));
    }
});

test('tenant isolation covers existing B2B paths and service creation', async () => {
    const paths=['tenants/other','empresas_b2b/other/areas/a','empresas_b2b/other/activos/a','flotilla_b2b/other/items/a','packages/other/items/a','gestia_records/other/orders/a','alertas_seguridad/other-a','servicios_b2b/other-a'];
    await environment.withSecurityRulesDisabled(async context=>{
        const fixtureDb = context.firestore();
        for(const path of paths) await setDoc(doc(fixtureDb,path),{edificioId:'other',status:'pendiente'});
    });
    const own=environment.authenticatedContext('b2b-tech').firestore();
    for(const path of paths){
        await assertFails(getDoc(doc(own,path)));
        await assertFails(setDoc(doc(own,path),{edificioId:'other',status:'pendiente'}));
    }
    await assertFails(setDoc(doc(own,'servicios_b2b/foreign-create'),{edificioId:'other',status:'pendiente'}));
    await assertSucceeds(setDoc(doc(own,'servicios_b2b/own-create'),{edificioId:'uxmal39',status:'pendiente',descripcion:'Rutina'}));
    await assertFails(updateDoc(doc(own,'servicios_b2b/own-create'),{edificioId:'other'}));
    await assertFails(updateDoc(doc(own,'servicios_b2b/own-create'),{status:'finalizado'}));
    await assertFails(setDoc(doc(own,'packages/uxmal39/items/own'),{descripcion:'Paquete'}));
    await assertSucceeds(setDoc(doc(environment.authenticatedContext('b2b-admin').firestore(),'packages/uxmal39/items/own'),{descripcion:'Paquete'}));
    await assertSucceeds(getDoc(doc(own,'packages/uxmal39/items/own')));
    await assertSucceeds(getDoc(doc(own,'tenants/uxmal39')));
    await assertFails(setDoc(doc(own,'tenants/uxmal39'),{status:'active'}));
});


test('initial profile email is bound to authenticated identity', async () => {
    const db=environment.authenticatedContext('new-safe',{email:'safe@example.test'}).firestore();
    const profile={uid:'new-safe',email:'safe@example.test',rol:'cliente',tipo_cuenta:'B2C',estado:'activo',status:'activo',pagos:{stripe_autorizado:false,efectivo_autorizado:false}};
    await assertFails(setDoc(doc(db,'users/new-safe'),{...profile,email:'hebertoh-m@hotmail.com'}));
    await assertSucceeds(setDoc(doc(db,'users/new-safe'),profile));
});


test('B2B final state and signature become sealed after backend closure', async()=>{
    await environment.withSecurityRulesDisabled(async context=>{
        await setDoc(doc(context.firestore(),'servicios_b2b/sealed-order'),{edificioId:'uxmal39',tecnicoId:'b2b-tech',status:'en_proceso',foto_antes:'https://example.test/before',foto_despues:'https://example.test/after'});
    });
    const db=environment.authenticatedContext('b2b-tech').firestore();
    await assertFails(updateDoc(doc(db,'servicios_b2b/sealed-order'),{status:'finalizado',firma_conformidad:'https://example.test/signature'}));
    await environment.withSecurityRulesDisabled(async context=>{
        await updateDoc(doc(context.firestore(),'servicios_b2b/sealed-order'),{status:'finalizado'});
    });
    await assertFails(updateDoc(doc(db,'servicios_b2b/sealed-order'),{foto_antes:'https://example.test/replaced'}));
    await assertFails(uploadBytes(ref(environment.authenticatedContext('b2b-tech').storage(),'firmas/sealed-order/conformidad.png'),new Uint8Array([137,80,78,71]),{contentType:'image/png'}));
});

test('GPS tracking is limited to the customer of the active backend assignment',async()=>{
    await environment.withSecurityRulesDisabled(async context=>{
        const db=context.firestore();
        await setDoc(doc(db,'rastreo/tech-1'),{lat:21,lng:-86});
        await setDoc(doc(db,'technician_active_services/tech-1'),{service_id:'svc-close',technician_id:'tech-1',estado:'activo'});
    });
    const customer=environment.authenticatedContext('client-1').firestore();
    await assertSucceeds(getDoc(doc(customer,'rastreo/tech-1')));
    await assertSucceeds(getDoc(doc(environment.authenticatedContext('tech-1').firestore(),'rastreo/tech-1')));
    await assertFails(getDoc(doc(environment.authenticatedContext('b2b-other').firestore(),'rastreo/tech-1')));
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(),'rastreo/tech-1')));
    await environment.withSecurityRulesDisabled(async context=>{
        await updateDoc(doc(context.firestore(),'technician_active_services/tech-1'),{estado:'inactivo'});
    });
    await assertFails(getDoc(doc(customer,'rastreo/tech-1')));
});


test('B2B pending, suspended, missing status and foreign tenants cannot operate', async () => {
    const invalid = [
        {status:'pendiente_revision'}, {suspendido:true}, {estado:'suspendido'},
        {status:null}, {tipo_cuenta:'B2C'}, {edificioId:'otro'}, {edificioId:null, tenantId:'uxmal39'}
    ];
    for (const [index, extra] of invalid.entries()) {
        const uid='blocked-b2b-'+index;
        await environment.withSecurityRulesDisabled(async ctx => {
            await setDoc(doc(ctx.firestore(),'users',uid), {rol:'admin_b2b',tipo_cuenta:'B2B',status:'activo',estado:'activo',edificioId:'uxmal39',...extra});
        });
        const db=environment.authenticatedContext(uid).firestore();
        for (const path of ['servicios_b2b/order-1','users/b2b-tech','tenants/uxmal39','condominios/uxmal39']) await assertFails(getDoc(doc(db,path)));
        await assertFails(setDoc(doc(db,'packages/uxmal39/items',uid),{status:'recibido'}));
        await assertFails(setDoc(doc(db,'empresas_b2b/uxmal39/areas',uid),{nombre:'Zona'}));
        await assertFails(uploadBytes(ref(environment.authenticatedContext(uid).storage(),'pases_digitales/uxmal39/'+uid+'.html'),new Uint8Array([1]),{contentType:'text/html'}));
    }
});

test('B2B action roles and exact assignment protect evidence and signatures', async () => {
    await environment.withSecurityRulesDisabled(async ctx => {
        const db=ctx.firestore();
        await setDoc(doc(db,'users/b2b-reception'),{rol:'recepcion',tipo_cuenta:'B2B',status:'activo',edificioId:'uxmal39'});
        await setDoc(doc(db,'users/b2b-unassigned'),{rol:'tecnico',tipo_cuenta:'B2B',status:'activo',estado:'activo',edificioId:'uxmal39'});
        await setDoc(doc(db,'servicios_b2b/unassigned-order'),{edificioId:'uxmal39',status:'en_proceso'});
        await setDoc(doc(db,'servicios_b2b/before-order'),{edificioId:'uxmal39',status:'pendiente',tecnicoId:'b2b-tech'});
    });
    const reception=environment.authenticatedContext('b2b-reception').firestore();
    await assertSucceeds(setDoc(doc(reception,'packages/uxmal39/items/reception'),{status:'recibido'}));
    await assertFails(setDoc(doc(reception,'flotilla_b2b/uxmal39/vehiculos/foreign-role'),{placas:'X'}));
    const image=new Uint8Array([137,80,78,71]);
    for (const uid of ['b2b-1','b2b-admin','b2b-unassigned','b2b-other']) {
        const storage=environment.authenticatedContext(uid).storage();
        await assertFails(uploadBytes(ref(storage,'evidencias/order-1/antes_123.jpg'),image,{contentType:'image/jpeg'}));
        await assertFails(uploadBytes(ref(storage,'firmas/order-1/conformidad.png'),image,{contentType:'image/png'}));
    }
    const tech=environment.authenticatedContext('b2b-tech').storage();
    await assertSucceeds(uploadBytes(ref(tech,'evidencias/before-order/antes_123.jpg'),image,{contentType:'image/jpeg'}));
    await assertFails(uploadBytes(ref(tech,'firmas/before-order/conformidad.png'),image,{contentType:'image/png'}));
    await assertFails(uploadBytes(ref(tech,'evidencias/unassigned-order/antes_123.jpg'),image,{contentType:'image/jpeg'}));
    await assertFails(uploadBytes(ref(tech,'firmas/unassigned-order/conformidad.png'),image,{contentType:'image/png'}));
    await environment.withSecurityRulesDisabled(async ctx => updateDoc(doc(ctx.firestore(),'users/b2b-unassigned'),{suspendido:true}));
    await environment.withSecurityRulesDisabled(async ctx => setDoc(doc(ctx.firestore(),'servicios_b2b/suspended-order'),{edificioId:'uxmal39',status:'en_proceso',tecnicoId:'b2b-unassigned'}));
    await assertFails(uploadBytes(ref(environment.authenticatedContext('b2b-unassigned').storage(),'evidencias/suspended-order/antes_123.jpg'),image,{contentType:'image/jpeg'}));
});


test('B2B KYC own uploads are immutable and reviewer reads stay in tenant', async () => {
    await environment.withSecurityRulesDisabled(async ctx => {
        const db=ctx.firestore();
        await setDoc(doc(db,'users/kyc-pending'),{rol:'tecnico',tipo_cuenta:'B2B',status:'documentos_pendientes',estado:'documentos_pendientes',edificioId:'uxmal39'});
        await setDoc(doc(db,'users/foreign-admin'),{rol:'admin_b2b',tipo_cuenta:'B2B',status:'activo',estado:'activo',edificioId:'otro'});
    });
    const pending=environment.authenticatedContext('kyc-pending');
    const pendingDb=pending.firestore();
    const path='expedientes/kyc-pending/b2b/ine/123.pdf';
    const payload=new Uint8Array([37,80,68,70]);
    await assertSucceeds(uploadBytes(ref(pending.storage(),path),payload,{contentType:'application/pdf'}));
    await assertFails(uploadBytes(ref(pending.storage(),path),new Uint8Array([37,80,68,70,1]),{contentType:'application/pdf'}));
    await assertSucceeds(getMetadata(ref(environment.authenticatedContext('b2b-admin').storage(),path)));
    await assertFails(getMetadata(ref(environment.authenticatedContext('foreign-admin').storage(),path)));
    await assertFails(updateDoc(doc(pendingDb,'users/kyc-pending'),{documentos:{ine:'forged'}}));
    await assertFails(updateDoc(doc(pendingDb,'users/kyc-pending'),{status:'activo',estado:'activo'}));
    await environment.withSecurityRulesDisabled(async ctx=>updateDoc(doc(ctx.firestore(),'users/kyc-pending'),{status:'pendiente_revision',estado:'pendiente_revision'}));
    await assertFails(uploadBytes(ref(pending.storage(),'expedientes/kyc-pending/b2b/ine/456.pdf'),payload,{contentType:'application/pdf'}));
});


test('B2C settlement inputs and balances cannot be forged before closure', async () => {
    const tech=environment.authenticatedContext('tech-1').firestore();
    const customer=environment.authenticatedContext('client-1').firestore();
    for (const field of ['comision_asignada','saldo_virtual','saldo_actual']) {
        const uid='financial-create-'+field;
        const db=environment.authenticatedContext(uid,{email:uid+'@example.test'}).firestore();
        await assertFails(setDoc(doc(db,'users',uid),{uid,email:uid+'@example.test',rol:'cliente',tipo_cuenta:'B2C',estado:'activo',status:'activo',pagos:{stripe_autorizado:false,efectivo_autorizado:false},[field]:999999}));
    }
    for (const [uid,db] of [['tech-1',tech],['client-1',customer]]) {
        for (const field of ['comision_asignada','saldo_virtual','saldo_actual','saldo_virtual_actualizado_at']) {
            await assertFails(updateDoc(doc(db,'users',uid),{[field]:999999}));
        }
    }
    for (const field of ['monto_pagado','tasa_comision_aplicada','comision_asignada','monto_tecnico_fijo','liquidado','comision_aplicada_tecnico','comision_aplicada_plataforma','settlement_method','settlement_version','settlement_reconciled','liquidacion_bloqueada','liquidacion_codigo','b2c_financial_hold','revision_administrativa','clientType','client_type','tenantId','edificioId','empresa_id','empresaId','contrato_id','contratoId']) {
        await assertFails(updateDoc(doc(tech,'services/svc-close'),{[field]:999999}));
    }
    await assertSucceeds(updateDoc(doc(tech,'services/svc-close'),{observaciones_finales:'Trabajo revisado'}));
});


test('financial review requests stay set until an administrative decision', async () => {
    const tech=environment.authenticatedContext('tech-1').firestore();
    for (const field of ['llegada_revision_requerida','ausencia_cliente_revision_requerida','diagnostico_revision_requerida','trabajo_revision_requerida']) {
        await assertSucceeds(updateDoc(doc(tech,'services/svc-close'),{[field]:true}));
        await assertFails(updateDoc(doc(tech,'services/svc-close'),{[field]:false}));
    }
    const customer=environment.authenticatedContext('client-1').firestore();
    await assertFails(updateDoc(doc(customer,'services/svc-close'),{llegada_revision_requerida:false}));
});
